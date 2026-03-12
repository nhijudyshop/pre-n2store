// =====================================================
// SEPAY WEBHOOK CORE
// Main webhook handler, SSE streaming, history/statistics,
// failed queue, and shared helper functions
// =====================================================

const fetch = require('node-fetch');
// AbortController is global in Node.js 18+, but fallback for older versions
const AbortController = globalThis.AbortController || require('abort-controller');

/**
 * Upsert phone into recent_transfer_phones with TOTAL amount from balance_history
 * @param {object} dbConn - Database connection
 * @param {string} phone - Customer phone
 */
async function upsertRecentTransfer(dbConn, phone) {
    if (!phone) return;
    try {
        const totalResult = await dbConn.query(
            `SELECT COALESCE(SUM(transfer_amount), 0) as total
             FROM balance_history
             WHERE linked_customer_phone = $1 AND transfer_type = 'in'`,
            [phone]
        );
        const totalAmount = parseFloat(totalResult.rows[0].total) || 0;
        await dbConn.query(`
            INSERT INTO recent_transfer_phones (phone, last_transfer_at, transfer_amount, expires_at)
            VALUES ($1, CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (phone) DO UPDATE SET
                last_transfer_at = CURRENT_TIMESTAMP,
                transfer_amount = $2,
                expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
        `, [phone, totalAmount]);
        console.log('[RECENT-TRANSFER] Tracked phone:', phone, 'total:', totalAmount);
    } catch (err) {
        console.error('[RECENT-TRANSFER] Error tracking phone:', phone, err.message);
    }
}

/**
 * Fetch with timeout to prevent hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 10000ms = 10s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Helper function: Broadcast to all balance SSE clients
 */
function broadcastBalanceUpdate(app, event, data) {
    if (!app.locals.balanceSseClients) return;

    app.locals.balanceSseClients.forEach(client => {
        try {
            client.write(`event: ${event}\n`);
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.error('[BALANCE-SSE] Failed to send to client:', error);
        }
    });
}

/**
 * Helper function: Log webhook request
 */
async function logWebhook(db, sepayId, req, statusCode, responseBody, errorMessage) {
    try {
        await db.query(`
            INSERT INTO sepay_webhook_logs (
                sepay_id, request_method, request_headers, request_body,
                response_status, response_body, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            sepayId,
            req.method,
            JSON.stringify(req.headers),
            JSON.stringify(req.body),
            statusCode,
            JSON.stringify(responseBody),
            errorMessage
        ]);
    } catch (err) {
        console.error('[SEPAY-WEBHOOK] Failed to log webhook:', err);
    }
}

/**
 * Helper function: Save webhook to failed queue
 */
async function saveToFailedQueue(db, webhookData, errorMessage) {
    try {
        await db.query(`
            INSERT INTO failed_webhook_queue (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, last_error, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending'
            )
            ON CONFLICT DO NOTHING
        `, [
            webhookData.id,
            webhookData.gateway,
            webhookData.transactionDate,
            webhookData.accountNumber,
            webhookData.code || null,
            webhookData.content || null,
            webhookData.transferType,
            webhookData.transferAmount,
            webhookData.accumulated,
            webhookData.subAccount || null,
            webhookData.referenceCode || null,
            webhookData.description || null,
            JSON.stringify(webhookData),
            errorMessage
        ]);
        console.log('[FAILED-QUEUE] Saved webhook to failed queue:', webhookData.id);
        return true;
    } catch (queueError) {
        console.error('[FAILED-QUEUE] Failed to save to queue:', queueError.message);
        return false;
    }
}

/**
 * Register core routes on the given router
 * @param {express.Router} router - Express router instance
 * @param {Object} deps - Dependencies { processDebtUpdate }
 */
function registerRoutes(router, deps) {
    const { processDebtUpdate } = deps;

    // =====================================================
    // HEALTH CHECK
    // =====================================================

    /**
     * GET /api/sepay/ping
     * Health check endpoint - also helps wake up sleeping Render server
     */
    router.get('/ping', (req, res) => {
        console.log('[SEPAY-PING] Health check received');
        res.json({
            success: true,
            message: 'SePay webhook endpoint is healthy',
            timestamp: new Date().toISOString(),
            api_key_configured: !!process.env.SEPAY_API_KEY
        });
    });

    // =====================================================
    // RECENT TRANSFERS
    // =====================================================

    // GET /api/sepay/recent-transfers
    router.get('/recent-transfers', async (req, res) => {
        try {
            const db = req.app.locals.chatDb;
            const result = await db.query(
                'SELECT phone, last_transfer_at, transfer_amount FROM recent_transfer_phones WHERE expires_at > NOW()'
            );
            res.json({
                success: true,
                phones: result.rows.map(r => r.phone),
                details: result.rows
            });
        } catch (error) {
            console.error('[RECENT-TRANSFERS] Error:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/sepay/recent-transfers
    router.post('/recent-transfers', async (req, res) => {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone is required' });
        }
        try {
            const db = req.app.locals.chatDb;
            await upsertRecentTransfer(db, phone);
            res.json({ success: true, phone });
        } catch (error) {
            console.error('[RECENT-TRANSFERS] Error adding phone:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // =====================================================
    // MAIN WEBHOOK HANDLER
    // =====================================================

    /**
     * POST /api/sepay/webhook
     * Nhan webhook tu Sepay khi co giao dich moi
     */
    router.post('/webhook', async (req, res) => {
        const startTime = Date.now();
        const db = req.app.locals.chatDb;

        // Log request de debug
        console.log('[SEPAY-WEBHOOK] ========================================');
        console.log('[SEPAY-WEBHOOK] Received webhook at:', new Date().toISOString());
        console.log('[SEPAY-WEBHOOK] Has Authorization header:', !!req.headers['authorization']);
        console.log('[SEPAY-WEBHOOK] Content-Type:', req.headers['content-type']);
        console.log('[SEPAY-WEBHOOK] Body:', JSON.stringify(req.body).substring(0, 500));

        // ============================================
        // AUTHENTICATION - Verify API Key (if enabled)
        // ============================================
        const SEPAY_API_KEY = process.env.SEPAY_API_KEY;

        if (SEPAY_API_KEY) {
            const authHeader = req.headers['authorization'];

            if (!authHeader) {
                console.error('[SEPAY-WEBHOOK] Missing Authorization header');
                await logWebhook(db, null, req, 401, { error: 'Missing Authorization header' }, 'Unauthorized - Missing auth header');
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized - Missing Authorization header'
                });
            }

            // Sepay sends: "Authorization: Apikey YOUR_API_KEY"
            const apiKey = authHeader.replace(/^Apikey\s+/i, '').trim();

            if (apiKey !== SEPAY_API_KEY) {
                console.error('[SEPAY-WEBHOOK] Invalid API Key');
                await logWebhook(db, null, req, 401, { error: 'Invalid API Key' }, 'Unauthorized - Invalid API key');
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized - Invalid API Key'
                });
            }

            console.log('[SEPAY-WEBHOOK] API Key validated');
        } else {
            console.warn('[SEPAY-WEBHOOK] Running without API Key authentication (not recommended for production)');
        }

        try {
            const webhookData = req.body;

            // Validate du lieu
            if (!webhookData || typeof webhookData !== 'object') {
                console.error('[SEPAY-WEBHOOK] Invalid data type:', typeof webhookData);
                await logWebhook(db, null, req, 400, { error: 'Invalid data type' }, 'Invalid data type');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid data - expected JSON object'
                });
            }

            // Validate required fields
            const requiredFields = ['id', 'gateway', 'transactionDate', 'accountNumber',
                'transferType', 'transferAmount', 'accumulated'];
            const missingFields = requiredFields.filter(field =>
                webhookData[field] === undefined || webhookData[field] === null
            );

            if (missingFields.length > 0) {
                console.error('[SEPAY-WEBHOOK] Missing required fields:', missingFields);
                await logWebhook(db, webhookData.id, req, 400,
                    { error: 'Missing required fields', missing: missingFields },
                    `Missing fields: ${missingFields.join(', ')}`
                );
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    missing: missingFields
                });
            }

            // Validate transfer_type
            if (!['in', 'out'].includes(webhookData.transferType)) {
                console.error('[SEPAY-WEBHOOK] Invalid transfer_type:', webhookData.transferType);
                await logWebhook(db, webhookData.id, req, 400,
                    { error: 'Invalid transfer_type' },
                    'Invalid transfer_type - must be "in" or "out"'
                );
                return res.status(400).json({
                    success: false,
                    error: 'Invalid transfer_type - must be "in" or "out"'
                });
            }

            // Insert vao database voi atomic duplicate handling
            const insertQuery = `
                INSERT INTO balance_history (
                    sepay_id, gateway, transaction_date, account_number,
                    code, content, transfer_type, transfer_amount,
                    accumulated, sub_account, reference_code, description,
                    raw_data, webhook_received_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
                )
                ON CONFLICT (sepay_id) DO NOTHING
                RETURNING id
            `;

            const values = [
                webhookData.id,
                webhookData.gateway,
                webhookData.transactionDate,
                webhookData.accountNumber,
                webhookData.code || null,
                webhookData.content || null,
                webhookData.transferType,
                webhookData.transferAmount,
                webhookData.accumulated,
                webhookData.subAccount || null,
                webhookData.referenceCode || null,
                webhookData.description || null,
                JSON.stringify(webhookData)
            ];

            const result = await db.query(insertQuery, values);

            // Check if insert was successful or skipped due to duplicate
            if (result.rows.length === 0) {
                console.log('[SEPAY-WEBHOOK] Duplicate transaction ignored (atomic check):', webhookData.id);
                await logWebhook(db, webhookData.id, req, 200,
                    { success: true, message: 'Duplicate transaction ignored' },
                    null
                );
                return res.status(200).json({
                    success: true,
                    message: 'Duplicate transaction - already processed'
                });
            }

            const insertedId = result.rows[0].id;

            console.log('[SEPAY-WEBHOOK] Transaction saved:', {
                id: insertedId,
                sepay_id: webhookData.id,
                type: webhookData.transferType,
                amount: webhookData.transferAmount,
                gateway: webhookData.gateway
            });

            // Log successful webhook
            await logWebhook(db, webhookData.id, req, 200,
                { success: true, id: insertedId },
                null
            );

            // Broadcast realtime update to all connected balance history clients
            broadcastBalanceUpdate(req.app, 'new-transaction', {
                id: insertedId,
                sepay_id: webhookData.id,
                gateway: webhookData.gateway,
                transaction_date: webhookData.transactionDate,
                account_number: webhookData.accountNumber,
                code: webhookData.code || null,
                content: webhookData.content || null,
                transfer_type: webhookData.transferType,
                transfer_amount: webhookData.transferAmount,
                accumulated: webhookData.accumulated,
                sub_account: webhookData.subAccount || null,
                reference_code: webhookData.referenceCode || null,
                description: webhookData.description || null,
                created_at: new Date().toISOString()
            });
            console.log('[SEPAY-WEBHOOK] Broadcasting realtime update to clients...');

            // Auto-update customer debt for incoming transactions
            if (webhookData.transferType === 'in') {
                try {
                    const debtResult = await processDebtUpdate(db, insertedId, fetchWithTimeout);
                    console.log('[SEPAY-WEBHOOK] Debt update result:', debtResult);

                    // Broadcast updates based on debt result
                    if (debtResult.success) {
                        const customerPhone = debtResult.phone || debtResult.linkedPhone || debtResult.fullPhone;
                        const customerName = debtResult.customerName;

                        if (customerPhone || customerName) {
                            // Case 1: Single match - broadcast customer info
                            broadcastBalanceUpdate(req.app, 'customer-info-updated', {
                                transaction_id: insertedId,
                                customer_phone: customerPhone || null,
                                customer_name: customerName || null,
                                match_method: debtResult.method
                            });
                            console.log('[SEPAY-WEBHOOK] Broadcasted customer-info-updated for transaction:', insertedId);

                            // Track recent transfer phone (7-day TTL, total amount)
                            if (customerPhone) {
                                await upsertRecentTransfer(db, customerPhone);
                            }
                        } else if (debtResult.method === 'pending_match_created') {
                            // Case 2: Multiple phones found - broadcast pending match
                            broadcastBalanceUpdate(req.app, 'pending-match-created', {
                                transaction_id: insertedId,
                                partial_phone: debtResult.partialPhone,
                                unique_phones_count: debtResult.uniquePhonesCount
                            });
                            console.log('[SEPAY-WEBHOOK] Broadcasted pending-match-created for transaction:', insertedId);
                        }
                    }
                } catch (debtError) {
                    console.error('[SEPAY-WEBHOOK] Debt update error (non-critical):', debtError.message);
                }
            }

            const processingTime = Date.now() - startTime;
            console.log('[SEPAY-WEBHOOK] Completed in', processingTime, 'ms');
            console.log('[SEPAY-WEBHOOK] ========================================');

            // Tra ve response theo spec cua Sepay
            res.status(200).json({
                success: true,
                id: insertedId,
                message: 'Transaction recorded successfully',
                processing_time_ms: processingTime
            });

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error('[SEPAY-WEBHOOK] Error processing webhook after', processingTime, 'ms:', error);

            // Log error
            await logWebhook(db, req.body?.id, req, 500,
                { error: 'Internal server error' },
                error.message
            );

            // Save to failed queue for retry
            if (req.body && typeof req.body === 'object') {
                await saveToFailedQueue(db, req.body, error.message);
            }

            res.status(500).json({
                success: false,
                error: 'Failed to process webhook',
                message: error.message,
                queued_for_retry: true
            });
        }
    });

    // =====================================================
    // HISTORY & STATISTICS
    // =====================================================

    /**
     * GET /api/sepay/history/stats
     * Lay thong ke verification status
     */
    router.get('/history/stats', async (req, res) => {
        const db = req.app.locals.chatDb;

        try {
            const result = await db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE verification_status = 'AUTO_APPROVED') as auto_approved,
                    COUNT(*) FILTER (WHERE verification_status = 'APPROVED') as manually_approved,
                    COUNT(*) FILTER (WHERE verification_status = 'PENDING_VERIFICATION') as pending_verification,
                    COUNT(*) FILTER (WHERE verification_status = 'REJECTED') as rejected,
                    COUNT(*) FILTER (WHERE verification_status = 'PENDING' OR verification_status IS NULL) as pending,
                    COUNT(*) FILTER (WHERE linked_customer_phone IS NULL) as no_phone,
                    COUNT(*) FILTER (WHERE wallet_processed = TRUE) as wallet_credited,
                    COUNT(*) as total
                FROM balance_history
                WHERE (is_hidden = FALSE OR is_hidden IS NULL)
            `);

            res.json({
                success: true,
                stats: result.rows[0]
            });

        } catch (error) {
            console.error('[HISTORY-STATS] Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/sepay/history
     * Lay lich su giao dich
     */
    router.get('/history', async (req, res) => {
        const db = req.app.locals.chatDb;

        try {
            const {
                page = 1,
                limit = 50,
                type,
                gateway,
                startDate,
                endDate,
                search,
                showHidden = 'false',
                verification_status,
                has_phone
            } = req.query;

            const offset = (page - 1) * limit;
            let queryConditions = [];
            let queryParams = [];
            let paramCounter = 1;

            // Filter hidden transactions (default: hide hidden)
            if (showHidden !== 'true') {
                queryConditions.push(`(bh.is_hidden = FALSE OR bh.is_hidden IS NULL)`);
            }

            // Filter by transfer type
            if (type && ['in', 'out'].includes(type)) {
                queryConditions.push(`bh.transfer_type = $${paramCounter}`);
                queryParams.push(type);
                paramCounter++;
            }

            // Filter by gateway
            if (gateway) {
                queryConditions.push(`bh.gateway ILIKE $${paramCounter}`);
                queryParams.push(`%${gateway}%`);
                paramCounter++;
            }

            // Filter by date range
            if (startDate) {
                queryConditions.push(`bh.transaction_date >= $${paramCounter}`);
                queryParams.push(startDate);
                paramCounter++;
            }

            if (endDate) {
                queryConditions.push(`bh.transaction_date <= $${paramCounter}`);
                queryParams.push(`${endDate} 23:59:59`);
                paramCounter++;
            }

            // Search in content, reference_code, code, customer_phone, customer_name
            if (search) {
                queryConditions.push(`(
                    unaccent(bh.content) ILIKE unaccent($${paramCounter}) OR
                    bh.reference_code ILIKE $${paramCounter} OR
                    bh.code ILIKE $${paramCounter} OR
                    bh.linked_customer_phone ILIKE $${paramCounter} OR
                    unaccent(bh.display_name) ILIKE unaccent($${paramCounter}) OR
                    unaccent(c.name) ILIKE unaccent($${paramCounter}) OR
                    unaccent(c.aliases::text) ILIKE unaccent($${paramCounter}) OR
                    unaccent(bci.customer_name) ILIKE unaccent($${paramCounter})
                )`);
                queryParams.push(`%${search}%`);
                paramCounter++;
            }

            // Filter by verification_status
            if (verification_status) {
                queryConditions.push(`bh.verification_status = $${paramCounter}`);
                queryParams.push(verification_status);
                paramCounter++;
            }

            // Filter by has_phone (linked_customer_phone existence)
            if (has_phone === 'true') {
                queryConditions.push(`bh.linked_customer_phone IS NOT NULL`);
            } else if (has_phone === 'false') {
                queryConditions.push(`bh.linked_customer_phone IS NULL`);
            }

            const whereClause = queryConditions.length > 0
                ? 'WHERE ' + queryConditions.join(' AND ')
                : '';

            // Get total count (add JOINs when search references customer fields)
            let countJoins = '';
            if (search) {
                countJoins = `
                    LEFT JOIN customers c ON c.id = bh.customer_id
                    LEFT JOIN (
                        SELECT DISTINCT ON (customer_phone)
                            customer_phone, customer_name
                        FROM balance_customer_info
                        ORDER BY customer_phone,
                            CASE WHEN customer_name IS NOT NULL AND customer_name != '' THEN 0 ELSE 1 END,
                            created_at DESC
                    ) bci ON bci.customer_phone = bh.linked_customer_phone
                `;
            }
            const countQuery = `SELECT COUNT(*) FROM balance_history bh ${countJoins} ${whereClause}`;
            const countResult = await db.query(countQuery, queryParams);
            const total = parseInt(countResult.rows[0].count);

            // Check if transfer_stats table exists
            let tsTableExists = false;
            try {
                const tsCheck = await db.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'transfer_stats'
                    )
                `);
                tsTableExists = tsCheck.rows[0].exists;
            } catch (e) {
                console.log('[HISTORY] transfer_stats table check failed:', e.message);
            }

            // Get paginated data with customer info AND pending matches
            const paginatedQuery = `
                SELECT
                    bh.id, bh.sepay_id, bh.gateway, bh.transaction_date, bh.account_number,
                    bh.code, bh.content, bh.transfer_type, bh.transfer_amount, bh.accumulated,
                    bh.sub_account, bh.reference_code, bh.description, bh.created_at,
                    bh.debt_added, bh.is_hidden, bh.linked_customer_phone,
                    bh.match_method, bh.verification_status, bh.verified_by, bh.verified_at,
                    bh.wallet_processed, bh.customer_id,
                    bh.display_name,
                    -- Priority 1: Get from customers table (Source of Truth)
                    COALESCE(c.phone, bci.customer_phone) as customer_phone,
                    COALESCE(bh.display_name, c.name, bci.customer_name) as customer_name,
                    c.aliases as customer_aliases,
                    bci.unique_code as qr_code,
                    bci.extraction_note,
                    -- Pending match info
                    pcm.id as pending_match_id,
                    pcm.status as pending_match_status,
                    pcm.extracted_phone as pending_extracted_phone,
                    pcm.matched_customers as pending_match_options,
                    pcm.resolution_notes as pending_resolution_notes,
                    -- Transfer stats flag (only if table exists)
                    ${tsTableExists ? 'CASE WHEN ts.id IS NOT NULL THEN TRUE ELSE FALSE END' : 'FALSE'} as in_transfer_stats
                FROM balance_history bh
                -- Priority 1: JOIN voi customers table (Source of Truth) bang customer_id
                LEFT JOIN customers c ON c.id = bh.customer_id
                -- Priority 2: Legacy JOIN voi balance_customer_info (snapshot)
                LEFT JOIN (
                    SELECT DISTINCT ON (customer_phone)
                        customer_phone, customer_name, unique_code, extraction_note
                    FROM balance_customer_info
                    ORDER BY customer_phone,
                        CASE WHEN customer_name IS NOT NULL AND customer_name != '' THEN 0 ELSE 1 END,
                        created_at DESC
                ) bci ON bci.customer_phone = bh.linked_customer_phone
                LEFT JOIN pending_customer_matches pcm ON (
                    pcm.transaction_id = bh.id
                )
                ${tsTableExists ? 'LEFT JOIN transfer_stats ts ON ts.transaction_id = bh.id' : ''}
                ${whereClause}
                ORDER BY bh.transaction_date DESC
                LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
            `;

            queryParams.push(limit, offset);
            const dataResult = await db.query(paginatedQuery, queryParams);

            // Transform data to include pending_match flags and aliases
            const transformedData = dataResult.rows.map(row => {
                let customerName = row.customer_name;
                let customerPhone = row.customer_phone;
                let customerAliases = row.customer_aliases || [];

                // Ensure aliases is an array
                if (typeof customerAliases === 'string') {
                    try {
                        customerAliases = JSON.parse(customerAliases);
                    } catch (e) {
                        customerAliases = [];
                    }
                }
                if (!Array.isArray(customerAliases)) {
                    customerAliases = [];
                }

                // If resolved from pending match, get customer info from resolution_notes
                if (row.pending_match_status === 'resolved' && row.pending_resolution_notes) {
                    try {
                        const resolvedCustomer = JSON.parse(row.pending_resolution_notes);
                        if (resolvedCustomer && resolvedCustomer.name) {
                            customerName = resolvedCustomer.name;
                            customerPhone = resolvedCustomer.phone;
                        }
                    } catch (e) {
                        console.log('[HISTORY] Could not parse resolution_notes:', row.pending_resolution_notes);
                    }
                }

                return {
                    ...row,
                    // Override customer info from resolved pending match
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    // Customer aliases for name selector
                    customer_aliases: customerAliases,
                    // Flag: has pending match that needs resolution
                    has_pending_match: row.pending_match_status === 'pending',
                    // Flag: was skipped
                    pending_match_skipped: row.pending_match_status === 'skipped',
                    // Parse JSONB matched_customers if exists
                    pending_match_options: row.pending_match_options || null
                };
            });

            res.json({
                success: true,
                data: transformedData,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('[SEPAY-HISTORY] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch history',
                message: error.message
            });
        }
    });

    /**
     * GET /api/sepay/statistics
     * Lay thong ke giao dich
     */
    router.get('/statistics', async (req, res) => {
        const db = req.app.locals.chatDb;

        try {
            const { startDate, endDate, gateway } = req.query;

            let queryConditions = [];
            let queryParams = [];
            let paramCounter = 1;

            if (startDate) {
                queryConditions.push(`transaction_date >= $${paramCounter}`);
                queryParams.push(startDate);
                paramCounter++;
            }

            if (endDate) {
                queryConditions.push(`transaction_date <= $${paramCounter}`);
                queryParams.push(`${endDate} 23:59:59`);
                paramCounter++;
            }

            if (gateway) {
                queryConditions.push(`gateway ILIKE $${paramCounter}`);
                queryParams.push(`%${gateway}%`);
                paramCounter++;
            }

            const whereClause = queryConditions.length > 0
                ? 'WHERE ' + queryConditions.join(' AND ')
                : '';

            const statsQuery = `
                SELECT
                    COUNT(*) as total_transactions,
                    COUNT(CASE WHEN transfer_type = 'in' THEN 1 END) as total_in_count,
                    COUNT(CASE WHEN transfer_type = 'out' THEN 1 END) as total_out_count,
                    COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END), 0) as total_in,
                    COALESCE(SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END), 0) as total_out,
                    COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE -transfer_amount END), 0) as net_change,
                    MAX(CASE WHEN transfer_type = 'in' THEN accumulated END) as latest_balance
                FROM balance_history
                ${whereClause}
            `;

            const result = await db.query(statsQuery, queryParams);
            const stats = result.rows[0];

            res.json({
                success: true,
                statistics: {
                    total_transactions: parseInt(stats.total_transactions),
                    total_in_count: parseInt(stats.total_in_count),
                    total_out_count: parseInt(stats.total_out_count),
                    total_in: parseInt(stats.total_in),
                    total_out: parseInt(stats.total_out),
                    net_change: parseInt(stats.net_change),
                    latest_balance: parseInt(stats.latest_balance) || 0
                }
            });

        } catch (error) {
            console.error('[SEPAY-STATS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch statistics',
                message: error.message
            });
        }
    });

    // =====================================================
    // SSE STREAM
    // =====================================================

    /**
     * GET /api/sepay/stream
     * SSE endpoint for realtime balance history updates
     */
    router.get('/stream', (req, res) => {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Get or create balance SSE clients map
        if (!req.app.locals.balanceSseClients) {
            req.app.locals.balanceSseClients = new Set();
        }

        // Add this client to the set
        req.app.locals.balanceSseClients.add(res);
        console.log(`[BALANCE-SSE] Client connected (Total: ${req.app.locals.balanceSseClients.size})`);

        // Send initial connection event
        res.write('event: connected\n');
        res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

        // Send keep-alive every 30 seconds
        const keepAliveInterval = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 30000);

        // Handle client disconnect
        req.on('close', () => {
            clearInterval(keepAliveInterval);
            req.app.locals.balanceSseClients.delete(res);
            console.log(`[BALANCE-SSE] Client disconnected (Total: ${req.app.locals.balanceSseClients.size})`);
            res.end();
        });
    });

    // =====================================================
    // FAILED WEBHOOK QUEUE ENDPOINTS
    // =====================================================

    /**
     * GET /api/sepay/failed-queue
     * List all failed webhooks
     */
    router.get('/failed-queue', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { status = 'pending', limit = 50, page = 1 } = req.query;

        try {
            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) FROM failed_webhook_queue WHERE status = $1`,
                [status]
            );
            const total = parseInt(countResult.rows[0].count);

            // Get items
            const result = await db.query(`
                SELECT
                    id, sepay_id, gateway, transaction_date, account_number,
                    reference_code, transfer_type, transfer_amount, content,
                    status, retry_count, max_retries, last_error,
                    created_at, last_retry_at
                FROM failed_webhook_queue
                WHERE status = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            `, [status, limit, offset]);

            res.json({
                success: true,
                data: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('[FAILED-QUEUE] Error listing:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list failed webhooks',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/failed-queue/:id/retry
     * Retry a specific failed webhook
     */
    router.post('/failed-queue/:id/retry', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;

        try {
            // Get failed webhook
            const queueResult = await db.query(
                `SELECT * FROM failed_webhook_queue WHERE id = $1`,
                [id]
            );

            if (queueResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Failed webhook not found'
                });
            }

            const failedWebhook = queueResult.rows[0];

            // Check max retries
            if (failedWebhook.retry_count >= failedWebhook.max_retries) {
                return res.status(400).json({
                    success: false,
                    error: 'Max retries exceeded',
                    retry_count: failedWebhook.retry_count,
                    max_retries: failedWebhook.max_retries
                });
            }

            // Update status to processing
            await db.query(
                `UPDATE failed_webhook_queue SET status = 'processing', last_retry_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [id]
            );

            // Try to insert into balance_history
            const webhookData = failedWebhook.raw_data;

            const insertQuery = `
                INSERT INTO balance_history (
                    sepay_id, gateway, transaction_date, account_number,
                    code, content, transfer_type, transfer_amount,
                    accumulated, sub_account, reference_code, description,
                    raw_data, webhook_received_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
                )
                ON CONFLICT (sepay_id) DO NOTHING
                RETURNING id
            `;

            const values = [
                webhookData.id,
                webhookData.gateway,
                webhookData.transactionDate,
                webhookData.accountNumber,
                webhookData.code || null,
                webhookData.content || null,
                webhookData.transferType,
                webhookData.transferAmount,
                webhookData.accumulated,
                webhookData.subAccount || null,
                webhookData.referenceCode || null,
                webhookData.description || null,
                JSON.stringify(webhookData)
            ];

            const result = await db.query(insertQuery, values);

            if (result.rows.length > 0) {
                // Success - update queue status
                await db.query(`
                    UPDATE failed_webhook_queue
                    SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
                    WHERE id = $1
                `, [id]);

                console.log('[FAILED-QUEUE] Retry successful for queue ID:', id);

                res.json({
                    success: true,
                    message: 'Webhook retry successful',
                    balance_history_id: result.rows[0].id
                });
            } else {
                // Duplicate or other issue
                await db.query(`
                    UPDATE failed_webhook_queue
                    SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1,
                        last_error = 'Duplicate - already exists in balance_history'
                    WHERE id = $1
                `, [id]);

                res.json({
                    success: true,
                    message: 'Transaction already exists in balance_history',
                    duplicate: true
                });
            }

        } catch (error) {
            console.error('[FAILED-QUEUE] Retry error:', error);

            // Update retry count and error
            await db.query(`
                UPDATE failed_webhook_queue
                SET status = 'pending', retry_count = retry_count + 1, last_error = $2
                WHERE id = $1
            `, [id, error.message]);

            res.status(500).json({
                success: false,
                error: 'Retry failed',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/failed-queue/retry-all
     * Retry all pending failed webhooks
     */
    router.post('/failed-queue/retry-all', async (req, res) => {
        const db = req.app.locals.chatDb;

        try {
            // Get all pending webhooks that haven't exceeded max retries
            const pendingResult = await db.query(`
                SELECT id FROM failed_webhook_queue
                WHERE status = 'pending' AND retry_count < max_retries
                ORDER BY created_at ASC
                LIMIT 100
            `);

            const results = {
                total: pendingResult.rows.length,
                success: 0,
                failed: 0,
                details: []
            };

            for (const row of pendingResult.rows) {
                try {
                    // Simplified retry - call the same logic as single retry
                    const queueResult = await db.query(
                        `SELECT raw_data FROM failed_webhook_queue WHERE id = $1`,
                        [row.id]
                    );

                    if (queueResult.rows.length === 0) continue;

                    const webhookData = queueResult.rows[0].raw_data;

                    const insertResult = await db.query(`
                        INSERT INTO balance_history (
                            sepay_id, gateway, transaction_date, account_number,
                            code, content, transfer_type, transfer_amount,
                            accumulated, sub_account, reference_code, description,
                            raw_data, webhook_received_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                        ON CONFLICT (sepay_id) DO NOTHING
                        RETURNING id
                    `, [
                        webhookData.id,
                        webhookData.gateway,
                        webhookData.transactionDate,
                        webhookData.accountNumber,
                        webhookData.code || null,
                        webhookData.content || null,
                        webhookData.transferType,
                        webhookData.transferAmount,
                        webhookData.accumulated,
                        webhookData.subAccount || null,
                        webhookData.referenceCode || null,
                        webhookData.description || null,
                        JSON.stringify(webhookData)
                    ]);

                    await db.query(`
                        UPDATE failed_webhook_queue
                        SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
                        WHERE id = $1
                    `, [row.id]);

                    results.success++;
                    results.details.push({ id: row.id, status: 'success' });

                } catch (retryError) {
                    await db.query(`
                        UPDATE failed_webhook_queue
                        SET retry_count = retry_count + 1, last_error = $2
                        WHERE id = $1
                    `, [row.id, retryError.message]);

                    results.failed++;
                    results.details.push({ id: row.id, status: 'failed', error: retryError.message });
                }
            }

            res.json({
                success: true,
                message: `Retry complete: ${results.success}/${results.total} successful`,
                results
            });

        } catch (error) {
            console.error('[FAILED-QUEUE] Retry all error:', error);
            res.status(500).json({
                success: false,
                error: 'Retry all failed',
                message: error.message
            });
        }
    });

    // =====================================================
    // REFERENCE CODE GAP DETECTION
    // =====================================================

    /**
     * GET /api/sepay/detect-gaps
     * DEPRECATED: Disabled due to performance issues
     */
    router.get('/detect-gaps', async (req, res) => {
        console.log('[DETECT-GAPS] Endpoint called but disabled for performance');

        res.json({
            success: true,
            total_gaps: 0,
            gaps: [],
            message: 'Gap detection has been disabled for performance. Check database logs if needed.',
            deprecated: true
        });
    });

    /**
     * GET /api/sepay/gaps
     * List all detected gaps
     */
    router.get('/gaps', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { status = 'detected' } = req.query;

        try {
            const result = await db.query(`
                SELECT * FROM reference_code_gaps
                WHERE status = $1
                ORDER BY CAST(missing_reference_code AS INTEGER) ASC
                LIMIT 100
            `, [status]);

            res.json({
                success: true,
                data: result.rows,
                total: result.rows.length
            });

        } catch (error) {
            console.error('[GAPS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list gaps',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/gaps/:referenceCode/ignore
     * Mark a gap as ignored (transaction doesn't exist)
     */
    router.post('/gaps/:referenceCode/ignore', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { referenceCode } = req.params;

        try {
            await db.query(`
                UPDATE reference_code_gaps
                SET status = 'ignored', resolved_at = CURRENT_TIMESTAMP
                WHERE missing_reference_code = $1
            `, [referenceCode]);

            res.json({
                success: true,
                message: `Gap ${referenceCode} marked as ignored`
            });

        } catch (error) {
            console.error('[GAPS] Ignore error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to ignore gap',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/fetch-by-reference/:referenceCode
     * Fetch transaction from Sepay API by reference code and insert to database
     */
    router.post('/fetch-by-reference/:referenceCode', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { referenceCode } = req.params;

        console.log('[FETCH-BY-REF] Fetching transaction with reference code:', referenceCode);

        try {
            // Get Sepay API credentials from environment
            const SEPAY_API_KEY = process.env.SEPAY_API_KEY;
            const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER || '5354IBT1';

            if (!SEPAY_API_KEY) {
                return res.status(400).json({
                    success: false,
                    error: 'SEPAY_API_KEY not configured'
                });
            }

            // Call Sepay API to get transaction by reference code
            const sepayUrl = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&reference_number=${referenceCode}`;

            console.log('[FETCH-BY-REF] Calling Sepay API:', sepayUrl);

            const sepayResponse = await fetchWithTimeout(sepayUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${SEPAY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }, 15000);

            if (!sepayResponse.ok) {
                const errorText = await sepayResponse.text();
                console.error('[FETCH-BY-REF] Sepay API error:', sepayResponse.status, errorText);
                return res.status(sepayResponse.status).json({
                    success: false,
                    error: `Sepay API error: ${sepayResponse.status}`,
                    message: errorText
                });
            }

            const sepayData = await sepayResponse.json();
            console.log('[FETCH-BY-REF] Sepay response:', JSON.stringify(sepayData).substring(0, 500));

            // Check if transaction found
            if (!sepayData.transactions || sepayData.transactions.length === 0) {
                return res.json({
                    success: false,
                    error: 'Transaction not found in Sepay',
                    message: `Khong tim thay giao dich voi ma tham chieu ${referenceCode}`
                });
            }

            const transaction = sepayData.transactions[0];

            // Insert transaction to database
            const insertQuery = `
                INSERT INTO balance_history (
                    sepay_id, gateway, transaction_date, account_number,
                    code, content, transfer_type, transfer_amount,
                    accumulated, sub_account, reference_code, description,
                    raw_data, webhook_received_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
                )
                ON CONFLICT (sepay_id) DO NOTHING
                RETURNING id
            `;

            const values = [
                transaction.id,
                transaction.gateway || transaction.bank_brand_name,
                transaction.transaction_date,
                transaction.account_number || SEPAY_ACCOUNT_NUMBER,
                transaction.code || null,
                transaction.transaction_content || transaction.content || null,
                transaction.amount_in > 0 ? 'in' : 'out',
                transaction.amount_in > 0 ? transaction.amount_in : transaction.amount_out,
                transaction.accumulated || 0,
                transaction.sub_account || null,
                transaction.reference_number || referenceCode,
                transaction.description || null,
                JSON.stringify(transaction)
            ];

            const result = await db.query(insertQuery, values);

            if (result.rows.length > 0) {
                // Mark gap as resolved
                await db.query(`
                    UPDATE reference_code_gaps
                    SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
                    WHERE missing_reference_code = $1
                `, [referenceCode]);

                console.log('[FETCH-BY-REF] Transaction inserted:', result.rows[0].id);

                res.json({
                    success: true,
                    message: `Da lay duoc giao dich ${referenceCode}`,
                    id: result.rows[0].id,
                    transaction: {
                        id: result.rows[0].id,
                        reference_code: referenceCode,
                        amount: transaction.amount_in > 0 ? transaction.amount_in : transaction.amount_out,
                        type: transaction.amount_in > 0 ? 'in' : 'out'
                    }
                });
            } else {
                res.json({
                    success: true,
                    message: 'Giao dich da ton tai trong he thong',
                    duplicate: true
                });
            }

        } catch (error) {
            console.error('[FETCH-BY-REF] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch transaction',
                message: error.message
            });
        }
    });
}

module.exports = {
    upsertRecentTransfer,
    fetchWithTimeout,
    broadcastBalanceUpdate,
    logWebhook,
    saveToFailedQueue,
    registerRoutes
};
