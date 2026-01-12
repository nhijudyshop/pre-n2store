// =====================================================
// SEPAY WEBHOOK ROUTES
// Nhận và xử lý webhook từ Sepay
// =====================================================

const express = require('express');
const router = express.Router();
const tposTokenManager = require('../services/tpos-token-manager');
const fetch = require('node-fetch');
// AbortController is global in Node.js 18+, but fallback for older versions
const AbortController = globalThis.AbortController || require('abort-controller');

// =====================================================
// BLACKLIST: Các số cần bỏ qua khi extract phone
// Bao gồm: số tài khoản ngân hàng của shop, mã giao dịch, etc.
// =====================================================
const PHONE_EXTRACTION_BLACKLIST = [
    '75918',    // Số tài khoản ACB của shop
    // Thêm các số khác cần bỏ qua ở đây
];

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

/**
 * POST /api/sepay/webhook
 * Nhận webhook từ Sepay khi có giao dịch mới
 *
 * Docs: https://docs.sepay.vn/tich-hop-webhooks.html
 */
router.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    const db = req.app.locals.chatDb; // Sử dụng PostgreSQL connection từ server.js

    // Log request để debug (sanitized - không log full headers vì có thể chứa API key)
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
        // API Key authentication is enabled
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

        console.log('[SEPAY-WEBHOOK] ✅ API Key validated');
    } else {
        console.warn('[SEPAY-WEBHOOK] ⚠️  Running without API Key authentication (not recommended for production)');
    }

    try {
        const webhookData = req.body;

        // Validate dữ liệu
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

        // Insert vào database với atomic duplicate handling
        // Sử dụng ON CONFLICT để tránh race condition
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
            // Duplicate transaction - ON CONFLICT triggered
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

        console.log('[SEPAY-WEBHOOK] ✅ Transaction saved:', {
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
                const debtResult = await processDebtUpdate(db, insertedId);
                console.log('[SEPAY-WEBHOOK] Debt update result:', debtResult);

                // Broadcast updates based on debt result
                // This allows frontend to update without F5
                if (debtResult.success) {
                    const customerPhone = debtResult.phone || debtResult.linkedPhone || debtResult.fullPhone;
                    const customerName = debtResult.customerName;

                    if (customerPhone || customerName) {
                        // Case 1: Single match - broadcast customer info
                        broadcastBalanceUpdate(req.app, 'customer-info-updated', {
                            transaction_id: insertedId,
                            customer_phone: customerPhone || null,
                            customer_name: customerName || null,
                            match_method: debtResult.method // 'qr_code', 'exact_phone', 'single_match'
                        });
                        console.log('[SEPAY-WEBHOOK] Broadcasted customer-info-updated for transaction:', insertedId);
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

            // NOTE: Transfer stats is now manual-only
            // User must click transfer button after customer info is mapped
        }

        const processingTime = Date.now() - startTime;
        console.log('[SEPAY-WEBHOOK] ✅ Completed in', processingTime, 'ms');
        console.log('[SEPAY-WEBHOOK] ========================================');

        // Trả về response theo spec của Sepay
        res.status(200).json({
            success: true,
            id: insertedId,
            message: 'Transaction recorded successfully',
            processing_time_ms: processingTime
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('[SEPAY-WEBHOOK] ❌ Error processing webhook after', processingTime, 'ms:', error);

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

/**
 * GET /api/sepay/history
 * Lấy lịch sử giao dịch
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
            showHidden = 'false' // 'true' = show all, 'false' = hide hidden transactions
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
            // Add time to end of day (23:59:59) for proper comparison
            // Without this, "2025-12-31" is treated as "2025-12-31 00:00:00"
            // which excludes all transactions on that day after midnight
            queryConditions.push(`bh.transaction_date <= $${paramCounter}`);
            queryParams.push(`${endDate} 23:59:59`);
            paramCounter++;
        }

        // Search in content, reference_code, code, customer_phone, customer_name
        if (search) {
            queryConditions.push(`(
                bh.content ILIKE $${paramCounter} OR
                bh.reference_code ILIKE $${paramCounter} OR
                bh.code ILIKE $${paramCounter} OR
                bh.linked_customer_phone ILIKE $${paramCounter}
            )`);
            queryParams.push(`%${search}%`);
            paramCounter++;
        }

        const whereClause = queryConditions.length > 0
            ? 'WHERE ' + queryConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM balance_history bh ${whereClause}`;
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
        // Use linked_customer_phone for fast JOIN instead of expensive regex matching
        // Use subquery with DISTINCT ON to avoid duplicates when multiple customer_info records exist
        const paginatedQuery = `
            SELECT
                bh.id, bh.sepay_id, bh.gateway, bh.transaction_date, bh.account_number,
                bh.code, bh.content, bh.transfer_type, bh.transfer_amount, bh.accumulated,
                bh.sub_account, bh.reference_code, bh.description, bh.created_at,
                bh.debt_added, bh.is_hidden, bh.linked_customer_phone,
                bci.customer_phone,
                bci.customer_name,
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

        // Transform data to include pending_match flags
        const transformedData = dataResult.rows.map(row => {
            let customerName = row.customer_name;
            let customerPhone = row.customer_phone;

            // If resolved from pending match, get customer info from resolution_notes
            if (row.pending_match_status === 'resolved' && row.pending_resolution_notes) {
                try {
                    const resolvedCustomer = JSON.parse(row.pending_resolution_notes);
                    if (resolvedCustomer && resolvedCustomer.name) {
                        customerName = resolvedCustomer.name;
                        customerPhone = resolvedCustomer.phone;
                    }
                } catch (e) {
                    // resolution_notes might be old format (plain text), ignore parse error
                    console.log('[HISTORY] Could not parse resolution_notes:', row.pending_resolution_notes);
                }
            }

            return {
                ...row,
                // Override customer info from resolved pending match
                customer_name: customerName,
                customer_phone: customerPhone,
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
 * Lấy thống kê giao dịch
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
            // Add time to end of day (23:59:59) for proper comparison
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
    console.log(`✅ [BALANCE-SSE] Client connected (Total: ${req.app.locals.balanceSseClients.size})`);

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
        console.log(`❌ [BALANCE-SSE] Client disconnected (Total: ${req.app.locals.balanceSseClients.size})`);
        res.end();
    });
});

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
 * Helper: Parse transaction content to extract phone number
 * Step 1: If content has "GD" or "-GD", take text BEFORE it
 * Step 2: Find first sequence of 5+ digits
 */
/**
 * Extract customer identifier from transaction content
 * Priority:
 * 1. QR Code N2 (starts with N2, 18 chars) - if found, skip phone extraction
 * 2. Exact 10-digit phone (0xxxxxxxxx) - direct match, no TPOS needed
 * 3. Partial phone number (>= 5 digits) - will search TPOS to get full phone
 *
 * Returns:
 * {
 *   type: 'qr_code' | 'exact_phone' | 'partial_phone' | 'none',
 *   value: string | null,
 *   uniqueCode: string | null (only for QR),
 *   note: string
 * }
 */
function extractPhoneFromContent(content) {
    if (!content) {
        return {
            type: 'none',
            value: null,
            uniqueCode: null,
            note: 'NO_CONTENT'
        };
    }

    let textToParse = content;
    let isMomo = false; // Track if this is a Momo transaction

    // Step 1: If has "GD", take part before " GD" or "-GD"
    const gdMatch = content.match(/^(.*?)(?:\s*-?\s*GD)/i);
    if (gdMatch) {
        textToParse = gdMatch[1].trim();
        console.log('[EXTRACT] Found GD, parsing before GD:', textToParse);
    }

    // Step 1.5: MOMO PATTERN DETECTION
    // Format: {12-digit-random}-{10-digit-sender-phone}-{customer-content}
    // Example: 113524023776-0396513324-652722
    // We need to extract the LAST part (customer content), not the sender phone
    const momoPattern = /^(\d{12})-(0\d{9})-(.+)$/;
    const momoMatch = textToParse.match(momoPattern);
    if (momoMatch) {
        const momoCode = momoMatch[1];      // 113524023776 (ignore)
        const senderPhone = momoMatch[2];   // 0396513324 (ignore - sender's phone)
        const customerContent = momoMatch[3]; // 652722 (extract this!)

        console.log('[EXTRACT] 🟣 Detected MOMO pattern:', {
            momoCode,
            senderPhone: senderPhone + ' (ignored)',
            customerContent
        });

        // Mark as Momo transaction
        isMomo = true;

        // Replace textToParse with just the customer content
        textToParse = customerContent.trim();
        console.log('[EXTRACT] 🟣 Parsing MOMO customer content:', textToParse);
    }

    // Step 1.6: VIETCOMBANK (MBVCB) PATTERN DETECTION
    // Format: MBVCB.{random}.{random}.{phone}.CT tu ...
    // Example: MBVCB.12459068036.249370.228666.CT tu 0141000833447 NGUYEN THI...
    // We need to extract the number before ".CT" (228666)
    // Note: MBVCB = Mobile Banking Vietcombank
    const mbvcbPattern = /MBVCB\.[^.]+\.[^.]+\.(\d{5,10})\.CT/i;
    const mbvcbMatch = textToParse.match(mbvcbPattern);
    if (mbvcbMatch) {
        const customerPhone = mbvcbMatch[1]; // 228666

        console.log('[EXTRACT] 🔵 Detected Vietcombank (MBVCB) pattern:', {
            fullMatch: mbvcbMatch[0],
            customerPhone
        });

        // Return directly with the extracted phone
        return {
            type: 'partial_phone',
            value: customerPhone,
            uniqueCode: null,
            note: 'VCB:PARTIAL_PHONE_EXTRACTED'
        };
    }

    // Step 2: Check for QR Code N2 (starts with N2, exactly 18 chars)
    const qrCodeMatch = textToParse.match(/\bN2[A-Z0-9]{16}\b/);
    if (qrCodeMatch) {
        const qrCode = qrCodeMatch[0];
        console.log('[EXTRACT] ✅ Found QR Code N2:', qrCode);
        return {
            type: 'qr_code',
            value: qrCode,
            uniqueCode: qrCode, // Use QR code as unique code
            note: 'QR_CODE_FOUND'
        };
    }

    // Step 3: Check for EXACT 10-digit phone (0xxxxxxxxx)
    // This avoids unnecessary TPOS API calls when we already have the full phone
    const exactPhonePattern = /\b0\d{9}\b/g;
    const exactPhones = textToParse.match(exactPhonePattern);

    if (exactPhones && exactPhones.length > 0) {
        const exactPhone = exactPhones[exactPhones.length - 1]; // Take last match
        console.log('[EXTRACT] ✅ Found EXACT 10-digit phone:', exactPhone);
        const baseNote = exactPhones.length > 1 ? 'MULTIPLE_EXACT_PHONES_FOUND' : 'EXACT_PHONE_EXTRACTED';
        return {
            type: 'exact_phone',
            value: exactPhone,
            uniqueCode: `PHONE${exactPhone}`, // Direct unique code
            note: isMomo ? `MOMO:${baseNote}` : baseNote
        };
    }

    // Step 4: Extract partial phone number (5-10 digits)
    // Will search TPOS to get full 10-digit phone
    // Strategy: Prioritize numbers with phone-like length (5-10 digits), take FIRST match
    // IMPORTANT: Filter out blacklisted numbers (bank account numbers, etc.)
    const partialPhonePattern = /\d{5,}/g;
    const allNumbers = textToParse.match(partialPhonePattern);

    if (allNumbers && allNumbers.length > 0) {
        // Filter numbers:
        // 1. Reasonable phone length (5-10 digits)
        // 2. NOT in blacklist (bank account numbers, etc.)
        const phoneLikeNumbers = allNumbers.filter(num => {
            const isValidLength = num.length >= 5 && num.length <= 10;
            const isBlacklisted = PHONE_EXTRACTION_BLACKLIST.includes(num);
            if (isBlacklisted) {
                console.log('[EXTRACT] ⏭️ Skipping blacklisted number:', num);
            }
            return isValidLength && !isBlacklisted;
        });

        if (phoneLikeNumbers.length > 0) {
            const partialPhone = phoneLikeNumbers[0];  // Take FIRST non-blacklisted phone-like number
            console.log('[EXTRACT] ✅ Found partial phone (5-10 digits, first non-blacklisted):', partialPhone, 'from:', allNumbers);
            const baseNote = phoneLikeNumbers.length > 1 ? 'MULTIPLE_NUMBERS_FOUND' : 'PARTIAL_PHONE_EXTRACTED';
            return {
                type: 'partial_phone',
                value: partialPhone,
                uniqueCode: null, // Will be determined after TPOS search
                note: isMomo ? `MOMO:${baseNote}` : baseNote
            };
        }

        // All numbers were blacklisted
        console.log('[EXTRACT] ⚠️ All numbers were blacklisted:', allNumbers);
    }

    console.log('[EXTRACT] ❌ No phone or QR found in:', textToParse);
    return {
        type: 'none',
        value: null,
        uniqueCode: null,
        note: isMomo ? 'MOMO:NO_PHONE_FOUND' : 'NO_PHONE_FOUND'
    };
}

/**
 * Search TPOS Partner API by partial phone number
 * Returns grouped unique customers by 10-digit phone
 *
 * @param {string} partialPhone - Partial phone (>= 5 digits)
 * @returns {Promise<{
 *   success: boolean,
 *   uniquePhones: Array<{phone: string, customers: Array}>,
 *   totalResults: number
 * }>}
 */
async function searchTPOSByPartialPhone(partialPhone) {
    try {
        console.log(`[TPOS-SEARCH] Searching for partial phone: ${partialPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${partialPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000); // 15 second timeout for TPOS API

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        console.log(`[TPOS-SEARCH] Found ${totalResults} total results for ${partialPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                uniquePhones: [],
                totalResults: 0
            };
        }

        // Group by unique 10-digit phone
        const phoneMap = new Map();

        for (const customer of data.value) {
            const phone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Only accept valid 10-digit phones starting with 0
            if (phone && phone.length === 10 && phone.startsWith('0')) {
                if (!phoneMap.has(phone)) {
                    phoneMap.set(phone, []);
                }
                phoneMap.get(phone).push({
                    id: customer.Id,
                    name: customer.Name || customer.DisplayName,
                    phone: phone,
                    email: customer.Email,
                    address: customer.FullAddress || customer.Street,
                    network: customer.NameNetwork,
                    status: customer.Status,
                    credit: customer.Credit,
                    debit: customer.Debit
                });
            }
        }

        // Convert map to array
        const allUniquePhones = Array.from(phoneMap.entries()).map(([phone, customers]) => ({
            phone,
            customers, // Array of customers with this phone (sorted by DateCreated desc from TPOS)
            count: customers.length
        }));

        console.log(`[TPOS-SEARCH] Grouped into ${allUniquePhones.length} unique phones (before filter):`);
        allUniquePhones.forEach(({phone, count}) => {
            console.log(`  - ${phone}: ${count} customer(s)`);
        });

        // FILTER: Chỉ giữ SĐT có số cuối KHỚP CHÍNH XÁC với partialPhone
        // VD: partialPhone="81118" → giữ 0938281118 (endsWith 81118), loại 0938811182
        const uniquePhones = allUniquePhones.filter(({phone}) => {
            const matches = phone.endsWith(partialPhone);
            if (!matches) {
                console.log(`[TPOS-SEARCH] ❌ Filtered out ${phone} (does not end with ${partialPhone})`);
            }
            return matches;
        });

        console.log(`[TPOS-SEARCH] After endsWith filter: ${uniquePhones.length} phones match:`);
        uniquePhones.forEach(({phone, count}) => {
            console.log(`  ✅ ${phone}: ${count} customer(s)`);
        });

        return {
            success: true,
            uniquePhones,
            totalResults
        };

    } catch (error) {
        console.error('[TPOS-SEARCH] Error:', error);
        return {
            success: false,
            error: error.message,
            uniquePhones: [],
            totalResults: 0
        };
    }
}

// REMOVED: searchCustomerByPhone - was using customers table which has been removed

/**
 * Search TPOS Partner API by FULL phone number (10 digits)
 * Returns customer info without endsWith filtering
 * Used for QR code customer name lookup
 *
 * @param {string} fullPhone - Full 10-digit phone (0xxxxxxxxx)
 * @returns {Promise<{success: boolean, customer: Object|null}>}
 */
async function searchTPOSByPhone(fullPhone) {
    try {
        console.log(`[TPOS-PHONE] Searching for full phone: ${fullPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API with full phone
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${fullPhone}&$top=10&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000);

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        console.log(`[TPOS-PHONE] Found ${totalResults} total results for ${fullPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customer: null,
                totalResults: 0
            };
        }

        // Find EXACT match with full phone (no endsWith filter)
        for (const customer of data.value) {
            const phone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Check for exact match
            if (phone === fullPhone) {
                console.log(`[TPOS-PHONE] ✅ Found exact match: ${customer.Name || customer.DisplayName}`);
                return {
                    success: true,
                    customer: {
                        id: customer.Id,
                        name: customer.Name || customer.DisplayName,
                        phone: phone,
                        email: customer.Email,
                        address: customer.FullAddress || customer.Street,
                        network: customer.NameNetwork,
                        status: customer.Status,
                        credit: customer.Credit,
                        debit: customer.Debit
                    },
                    totalResults
                };
            }
        }

        // No exact match found
        console.log(`[TPOS-PHONE] No exact match for ${fullPhone}`);
        return {
            success: true,
            customer: null,
            totalResults
        };

    } catch (error) {
        console.error('[TPOS-PHONE] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null,
            totalResults: 0
        };
    }
}

/**
 * Process debt update for a single transaction
 * @param {Object} db - Database connection
 * @param {number} transactionId - The ID of the transaction in balance_history
 */
async function processDebtUpdate(db, transactionId) {
    console.log('[DEBT-UPDATE] Processing transaction ID:', transactionId);

    // 1. Get transaction details
    const txResult = await db.query(
        `SELECT id, content, transfer_amount, transfer_type, debt_added
         FROM balance_history
         WHERE id = $1`,
        [transactionId]
    );

    if (txResult.rows.length === 0) {
        console.log('[DEBT-UPDATE] Transaction not found:', transactionId);
        return { success: false, reason: 'Transaction not found' };
    }

    const tx = txResult.rows[0];

    // 2. Check if already processed
    if (tx.debt_added === true) {
        console.log('[DEBT-UPDATE] Transaction already processed:', transactionId);
        return { success: false, reason: 'Already processed' };
    }

    // 3. Only process 'in' transactions
    if (tx.transfer_type !== 'in') {
        console.log('[DEBT-UPDATE] Not an incoming transaction:', transactionId);
        return { success: false, reason: 'Not incoming transaction' };
    }

    const content = tx.content || '';

    // 4. FIRST: Try to extract QR code (N2 + 16 alphanumeric)
    const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);

    if (qrMatch) {
        const qrCode = qrMatch[0];
        console.log('[DEBT-UPDATE] QR code found:', qrCode);

        // 5. Find phone number from balance_customer_info (case-insensitive)
        const infoResult = await db.query(
            `SELECT customer_phone, customer_name FROM balance_customer_info
             WHERE UPPER(unique_code) = $1`,
            [qrCode]
        );

        if (infoResult.rows.length > 0 && infoResult.rows[0].customer_phone) {
            const phone = infoResult.rows[0].customer_phone;
            let customerName = infoResult.rows[0].customer_name;
            const amount = parseInt(tx.transfer_amount) || 0;

            console.log('[DEBT-UPDATE] Phone from QR:', phone, 'Amount:', amount);

            // 5.5 NEW: If QR has phone but NO name, fetch from TPOS using full phone
            if (!customerName) {
                console.log('[DEBT-UPDATE] QR has phone but no name, fetching from TPOS...');

                try {
                    // Use new searchTPOSByPhone for full phone lookup
                    const tposResult = await searchTPOSByPhone(phone);

                    if (tposResult.success && tposResult.customer) {
                        // Got customer directly (newest match from TPOS)
                        customerName = tposResult.customer.name;

                        // Update balance_customer_info with fetched name
                        await db.query(
                            `UPDATE balance_customer_info
                             SET customer_name = $1,
                                 name_fetch_status = 'SUCCESS',
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE UPPER(unique_code) = $2`,
                            [customerName, qrCode]
                        );

                        console.log('[DEBT-UPDATE] ✅ Updated customer name from TPOS:', customerName);
                    } else {
                        console.log('[DEBT-UPDATE] No TPOS match for phone:', phone);
                    }
                } catch (error) {
                    console.error('[DEBT-UPDATE] Error fetching name from TPOS:', error.message);
                    // Continue processing - phone is enough for debt tracking
                }
            }

            // 6. Mark transaction as processed AND link to customer phone
            await db.query(
                `UPDATE balance_history
                 SET debt_added = TRUE, linked_customer_phone = $2
                 WHERE id = $1 AND linked_customer_phone IS NULL`,
                [transactionId, phone]
            );

            console.log('[DEBT-UPDATE] ✅ Success (QR method):', {
                transactionId,
                qrCode,
                phone,
                linkedPhone: phone,
                customerName,
                amount
            });

            return {
                success: true,
                method: 'qr_code',
                transactionId,
                qrCode,
                phone,
                customerName,
                amount
            };
        }
    }

    // 8. FALLBACK: No QR code or QR not linked to phone -> Try to extract partial phone from content
    console.log('[DEBT-UPDATE] No QR code linked to phone, trying extraction...');

    const extractResult = extractPhoneFromContent(content);

    console.log('[DEBT-UPDATE] Extract result:', extractResult);

    // Check extraction result
    if (extractResult.type === 'none') {
        console.log('[DEBT-UPDATE] No valid identifier found:', extractResult.note);
        return {
            success: false,
            reason: 'No valid identifier found',
            note: extractResult.note
        };
    }

    const amount = parseInt(tx.transfer_amount) || 0;

    // 9. Handle exact 10-digit phone
    if (extractResult.type === 'exact_phone') {
        const exactPhone = extractResult.value;
        const uniqueCode = extractResult.uniqueCode; // Already PHONE{phone}

        console.log('[DEBT-UPDATE] Exact 10-digit phone found:', exactPhone);

        // OPTIMIZATION: Check local DB first before calling TPOS
        let customerName = null;
        let dataSource = 'NEW';

        // Step 1: Search in local balance_customer_info
        const localResult = await db.query(
            `SELECT customer_name, customer_phone FROM balance_customer_info
             WHERE customer_phone = $1 AND customer_name IS NOT NULL AND customer_name != ''
             ORDER BY updated_at DESC LIMIT 1`,
            [exactPhone]
        );

        if (localResult.rows.length > 0) {
            // Found in local DB - use it, skip TPOS!
            customerName = localResult.rows[0].customer_name;
            dataSource = 'LOCAL_DB';
            console.log('[DEBT-UPDATE] ✅ Found customer in LOCAL DB (skipping TPOS):', customerName);
        } else {
            // Step 2: Not in local DB - try TPOS
            console.log('[DEBT-UPDATE] Not found in local DB, searching TPOS...');
            try {
                const tposResult = await searchTPOSByPartialPhone(exactPhone);

                if (tposResult.success && tposResult.uniquePhones.length > 0) {
                    const phoneData = tposResult.uniquePhones.find(p => p.phone === exactPhone);
                    if (phoneData && phoneData.customers.length > 0) {
                        customerName = phoneData.customers[0].name;
                        dataSource = 'TPOS';
                        console.log('[DEBT-UPDATE] Found customer name from TPOS:', customerName);
                    }
                }
            } catch (error) {
                console.error('[DEBT-UPDATE] Error fetching from TPOS:', error.message);
            }
        }

        // Save to balance_customer_info
        await db.query(
            `INSERT INTO balance_customer_info (unique_code, customer_phone, customer_name, extraction_note, name_fetch_status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (unique_code) DO UPDATE SET
                 customer_phone = EXCLUDED.customer_phone,
                 customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), balance_customer_info.customer_name),
                 extraction_note = EXCLUDED.extraction_note,
                 name_fetch_status = EXCLUDED.name_fetch_status,
                 updated_at = CURRENT_TIMESTAMP`,
            [
                uniqueCode,
                exactPhone,
                customerName,
                extractResult.note,
                customerName ? 'SUCCESS' : 'PENDING'
            ]
        );

        // Mark transaction as processed AND link to customer phone
        await db.query(
            `UPDATE balance_history
             SET debt_added = TRUE, linked_customer_phone = $2
             WHERE id = $1 AND linked_customer_phone IS NULL`,
            [transactionId, exactPhone]
        );

        console.log('[DEBT-UPDATE] ✅ Success (exact phone method):', {
            transactionId,
            exactPhone,
            linkedPhone: exactPhone,
            customerName,
            dataSource,
            amount
        });

        return {
            success: true,
            method: 'exact_phone',
            transactionId,
            fullPhone: exactPhone,
            linkedPhone: exactPhone,
            customerName,
            dataSource,
            amount
        };
    }

    // 10. Search with partial phone - LOCAL DB FIRST, then TPOS
    if (extractResult.type === 'partial_phone') {
        const partialPhone = extractResult.value;
        console.log('[DEBT-UPDATE] Partial phone found:', partialPhone);

        // OPTIMIZATION: Step 1 - Search LOCAL DB first
        const localResult = await db.query(
            `SELECT DISTINCT customer_phone, customer_name FROM balance_customer_info
             WHERE customer_phone LIKE $1
             AND customer_name IS NOT NULL AND customer_name != ''
             ORDER BY customer_phone`,
            [`%${partialPhone}`]
        );

        let matchedPhones = [];
        let dataSource = 'LOCAL_DB';

        if (localResult.rows.length > 0) {
            console.log(`[DEBT-UPDATE] ✅ Found ${localResult.rows.length} matches in LOCAL DB (skipping TPOS)`);
            matchedPhones = localResult.rows.map((row, index) => ({
                phone: row.customer_phone,
                // Use phone as ID when from LOCAL_DB (prefix with LOCAL_ to distinguish)
                customers: [{ name: row.customer_name, id: `LOCAL_${row.customer_phone}`, phone: row.customer_phone }],
                count: 1
            }));
        } else {
            // Step 2: Not in local DB - try TPOS
            console.log('[DEBT-UPDATE] Not found in local DB, searching TPOS...');
            dataSource = 'TPOS';

            const tposResult = await searchTPOSByPartialPhone(partialPhone);

            if (tposResult.success && tposResult.uniquePhones.length > 0) {
                matchedPhones = tposResult.uniquePhones;
                console.log(`[DEBT-UPDATE] Found ${matchedPhones.length} matches from TPOS`);
            }
        }

        // No matches found anywhere
        if (matchedPhones.length === 0) {
            console.log('[DEBT-UPDATE] No customers found for:', partialPhone);

            await db.query(
                `INSERT INTO balance_customer_info (unique_code, customer_phone, customer_name, extraction_note, name_fetch_status)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (unique_code) DO UPDATE SET
                     extraction_note = EXCLUDED.extraction_note,
                     name_fetch_status = EXCLUDED.name_fetch_status,
                     updated_at = CURRENT_TIMESTAMP`,
                [
                    `PARTIAL${partialPhone}`,
                    null,
                    null,
                    `PARTIAL_PHONE_NO_MATCH:${partialPhone}`,
                    'NOT_FOUND'
                ]
            );

            return {
                success: false,
                reason: 'No matches found',
                partialPhone,
                note: 'NOT_FOUND'
            };
        }

        // Single match - auto link
        if (matchedPhones.length === 1) {
            const phoneData = matchedPhones[0];
            const fullPhone = phoneData.phone;
            const firstCustomer = phoneData.customers[0];

            console.log(`[DEBT-UPDATE] ✅ Single phone found: ${fullPhone} from ${dataSource}`);
            console.log(`[DEBT-UPDATE] Auto-selecting: ${firstCustomer.name}`);

            const uniqueCode = `PHONE${fullPhone}`;
            await db.query(
                `INSERT INTO balance_customer_info (unique_code, customer_phone, customer_name, extraction_note, name_fetch_status)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (unique_code) DO UPDATE SET
                     customer_phone = EXCLUDED.customer_phone,
                     customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), balance_customer_info.customer_name),
                     extraction_note = EXCLUDED.extraction_note,
                     name_fetch_status = EXCLUDED.name_fetch_status,
                     updated_at = CURRENT_TIMESTAMP`,
                [
                    uniqueCode,
                    fullPhone,
                    firstCustomer.name,
                    `AUTO_MATCHED_FROM_PARTIAL:${partialPhone}`,
                    'SUCCESS'
                ]
            );

            await db.query(
                `UPDATE balance_history
                 SET debt_added = TRUE, linked_customer_phone = $2
                 WHERE id = $1 AND linked_customer_phone IS NULL`,
                [transactionId, fullPhone]
            );

            console.log('[DEBT-UPDATE] ✅ Success (auto-matched):', {
                transactionId,
                partialPhone,
                fullPhone,
                linkedPhone: fullPhone,
                customerName: firstCustomer.name,
                dataSource,
                amount
            });

            return {
                success: true,
                method: 'single_match',
                transactionId,
                partialPhone,
                fullPhone,
                linkedPhone: fullPhone,
                customerName: firstCustomer.name,
                dataSource,
                amount
            };

        } else {
            // MULTIPLE PHONES: Create pending match for admin to choose
            console.log(`[DEBT-UPDATE] ⚠️ Multiple phones found (${matchedPhones.length}) from ${dataSource}, creating pending match...`);

            // Format matched_customers JSONB
            const matchedCustomersJson = matchedPhones.map(phoneData => ({
                phone: phoneData.phone,
                count: phoneData.count || 1,
                customers: phoneData.customers
            }));

            // Create pending match
            await db.query(
                `INSERT INTO pending_customer_matches (transaction_id, extracted_phone, matched_customers, status)
                 VALUES ($1, $2, $3, $4)`,
                [
                    transactionId,
                    partialPhone,
                    JSON.stringify(matchedCustomersJson),
                    'pending'
                ]
            );

            console.log('[DEBT-UPDATE] 📋 Created pending match for transaction:', transactionId);
            console.log(`[DEBT-UPDATE] Found ${matchedPhones.length} unique phones from ${dataSource}:`);
            matchedPhones.forEach(({phone, count}) => {
                console.log(`  - ${phone}: ${count || 1} customer(s)`);
            });

            return {
                success: true,
                method: 'pending_match_created',
                transactionId,
                partialPhone,
                uniquePhonesCount: matchedPhones.length,
                dataSource,
                pendingMatch: true
            };
        }
    }

    // Should not reach here
    console.error('[DEBT-UPDATE] Unexpected extraction type:', extractResult.type);
    return {
        success: false,
        reason: 'Unexpected extraction type',
        type: extractResult.type
    };

}

/**
 * GET /api/sepay/debt-summary
 * Get total debt for a phone number
 *
 * Logic:
 * - If admin has adjusted debt (debt_adjusted_at exists):
 *   total_debt = customers.debt (baseline) + sum(transactions AFTER debt_adjusted_at)
 * - If no admin adjustment:
 *   total_debt = sum(ALL transactions)
 *
 * This ensures both admin adjustments AND new bank transfers are reflected correctly.
 */
router.get('/debt-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // Normalize phone to full 10-digit format (0xxxxxxxxx)
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = normalizedPhone.substring(2); // Remove country code 84
        }
        if (!normalizedPhone.startsWith('0') && normalizedPhone.length === 9) {
            normalizedPhone = '0' + normalizedPhone; // Add leading 0
        }

        console.log('[DEBT-SUMMARY] Fetching for phone:', phone, '-> normalized:', normalizedPhone);

        // NEW SIMPLE LOGIC: Query directly by linked_customer_phone
        // This ensures 1 transaction belongs to exactly 1 customer
        const txQuery = `
            SELECT
                id,
                transfer_amount,
                transaction_date,
                content,
                debt_added,
                linked_customer_phone
            FROM balance_history
            WHERE transfer_type = 'in'
              AND linked_customer_phone = $1
            ORDER BY transaction_date DESC
            LIMIT 100
        `;

        console.log('[DEBT-SUMMARY] Query by linked_customer_phone:', normalizedPhone);

        const txResult = await db.query(txQuery, [normalizedPhone]);
        const transactions = txResult.rows;

        // Calculate total debt
        const totalDebt = transactions.reduce((sum, t) => sum + (parseInt(t.transfer_amount) || 0), 0);
        const source = transactions.length > 0 ? 'balance_history' : 'no_data';

        console.log('[DEBT-SUMMARY] Found', transactions.length, 'transactions, total:', totalDebt);

        res.json({
            success: true,
            data: {
                phone,
                total_debt: totalDebt,
                transactions: transactions.map(t => ({
                    id: t.id,
                    amount: parseInt(t.transfer_amount) || 0,
                    date: t.transaction_date,
                    content: t.content,
                    debt_added: t.debt_added
                })),
                transaction_count: transactions.length,
                source
            }
        });

    } catch (error) {
        console.error('[DEBT-SUMMARY] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch debt summary',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/debt-summary-batch
 * Get total debt for multiple phone numbers in ONE request
 * Reduces 80 API calls → 1 API call
 *
 * Body: { phones: ["0901234567", "0912345678", ...] }
 * Response: {
 *   success: true,
 *   data: {
 *     "901234567": { total_debt: 500000, source: "balance_history" },
 *     "912345678": { total_debt: 0, source: "no_data" },
 *     ...
 *   }
 * }
 */
router.post('/debt-summary-batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phones (array)'
        });
    }

    // Limit to 200 phones per request
    if (phones.length > 200) {
        return res.status(400).json({
            success: false,
            error: 'Too many phones. Maximum 200 per request.'
        });
    }

    try {
        const results = {};

        // Normalize all phones to full 10-digit format (0xxxxxxxxx)
        const normalizedPhones = phones.map(phone => {
            let normalized = (phone || '').replace(/\D/g, '');
            if (normalized.startsWith('84') && normalized.length > 9) {
                normalized = normalized.substring(2);
            }
            if (!normalized.startsWith('0') && normalized.length === 9) {
                normalized = '0' + normalized; // Add leading 0
            }
            return normalized;
        }).filter(p => p.length === 10);

        const uniquePhones = [...new Set(normalizedPhones)];

        if (uniquePhones.length === 0) {
            return res.json({ success: true, data: {} });
        }

        // NEW SIMPLE LOGIC: Query directly by linked_customer_phone
        // This ensures 1 transaction belongs to exactly 1 customer
        const phonePlaceholders = uniquePhones.map((_, i) => `$${i + 1}`).join(', ');
        const txQuery = `
            SELECT
                linked_customer_phone,
                SUM(transfer_amount) as total_amount,
                COUNT(*) as transaction_count
            FROM balance_history
            WHERE transfer_type = 'in'
              AND linked_customer_phone IN (${phonePlaceholders})
            GROUP BY linked_customer_phone
        `;

        const txResult = await db.query(txQuery, uniquePhones);

        // Build result map from query
        const debtMap = {};
        txResult.rows.forEach(row => {
            if (row.linked_customer_phone) {
                debtMap[row.linked_customer_phone] = {
                    total_debt: parseInt(row.total_amount) || 0,
                    transaction_count: parseInt(row.transaction_count) || 0
                };
            }
        });

        // Build results for all phones (including those with 0 debt)
        for (const phone of uniquePhones) {
            const data = debtMap[phone];
            // Also check without leading 0 for backwards compatibility
            const phoneWithout0 = phone.startsWith('0') ? phone.substring(1) : phone;

            results[phoneWithout0] = {
                total_debt: data ? data.total_debt : 0,
                source: data && data.total_debt > 0 ? 'balance_history' : 'no_data'
            };
        }

        // Log summary (not individual phones to reduce noise)
        console.log(`[DEBT-SUMMARY-BATCH] Processed ${uniquePhones.length} phones, found debt for ${txResult.rows.length}`);

        res.json({
            success: true,
            data: results,
            count: Object.keys(results).length
        });

    } catch (error) {
        console.error('[DEBT-SUMMARY-BATCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch debt summary batch',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/customer-info/:uniqueCode
 * Lấy thông tin khách hàng theo mã giao dịch
 */
router.get('/customer-info/:uniqueCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode } = req.params;

    try {
        const result = await db.query(
            'SELECT unique_code, customer_name, customer_phone, updated_at FROM balance_customer_info WHERE unique_code = $1',
            [uniqueCode]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error fetching:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer info',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/customer-info
 * Lưu hoặc cập nhật thông tin khách hàng
 */
router.post('/customer-info', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode, customerName, customerPhone } = req.body;

    try {
        // Validate input
        if (!uniqueCode) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: uniqueCode'
            });
        }

        // Insert or update customer info
        const query = `
            INSERT INTO balance_customer_info (unique_code, customer_name, customer_phone)
            VALUES ($1, $2, $3)
            ON CONFLICT (unique_code)
            DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await db.query(query, [
            uniqueCode,
            customerName || null,
            customerPhone || null
        ]);

        console.log('[CUSTOMER-INFO] ✅ Saved:', {
            uniqueCode,
            customerName,
            customerPhone
        });

        // NOTE: customers table has been removed - data is now only in balance_customer_info

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error saving:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save customer info',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/customer-info
 * Lấy tất cả thông tin khách hàng
 */
router.get('/customer-info', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query(
            'SELECT unique_code, customer_name, customer_phone, updated_at FROM balance_customer_info ORDER BY updated_at DESC'
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error fetching all:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer info',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/transaction-by-code/:uniqueCode
 * Lấy thông tin giao dịch theo unique code (N2XXXXXXXXXXXXXXXX)
 * Used to get transfer_amount when updating customer debt retroactively
 */
router.get('/transaction-by-code/:uniqueCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode } = req.params;

    if (!uniqueCode) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: uniqueCode'
        });
    }

    try {
        // Find transaction where content contains the unique code
        const query = `
            SELECT
                id,
                sepay_id,
                gateway,
                transaction_date,
                account_number,
                code,
                content,
                transfer_type,
                transfer_amount,
                accumulated,
                sub_account,
                reference_code,
                description,
                created_at
            FROM balance_history
            WHERE content LIKE '%' || $1 || '%'
            ORDER BY transaction_date DESC
            LIMIT 1
        `;

        const result = await db.query(query, [uniqueCode]);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'No transaction found with this unique code'
            });
        }

        console.log('[TRANSACTION-BY-CODE] ✅ Found transaction:', {
            uniqueCode,
            id: result.rows[0].id,
            transfer_type: result.rows[0].transfer_type,
            transfer_amount: result.rows[0].transfer_amount
        });

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[TRANSACTION-BY-CODE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction',
            message: error.message
        });
    }
});

/**
 * 🆕 GET /api/sepay/transactions-by-phone
 * Lấy lịch sử giao dịch theo số điện thoại khách hàng
 * Query params:
 * - phone: Số điện thoại khách hàng (required)
 * - limit: Số lượng giao dịch tối đa (default: 50, max: 200)
 */
router.get('/transactions-by-phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, limit = 50 } = req.query;

    // Validate phone number
    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // Validate limit
        const queryLimit = Math.min(parseInt(limit) || 50, 200);

        // Query to find all transactions for this phone number
        // Join balance_history with balance_customer_info by matching unique code from content
        // Unique code format: N2XXXXXXXXXXXXXXXX (N2 + 16 alphanumeric chars)
        const query = `
            SELECT
                bh.id,
                bh.sepay_id,
                bh.gateway,
                bh.transaction_date,
                bh.account_number,
                bh.code,
                bh.content,
                bh.transfer_type,
                bh.transfer_amount,
                bh.accumulated,
                bh.sub_account,
                bh.reference_code,
                bh.description,
                bh.created_at,
                bci.unique_code,
                bci.customer_name,
                bci.customer_phone
            FROM balance_history bh
            INNER JOIN balance_customer_info bci
                ON UPPER(bci.unique_code) = UPPER((regexp_match(bh.content, 'N2[A-Za-z0-9]{16}', 'i'))[1])
            WHERE bci.customer_phone = $1
            ORDER BY bh.transaction_date DESC
            LIMIT $2
        `;

        const result = await db.query(query, [phone, queryLimit]);

        // Calculate statistics
        let totalIn = 0;
        let totalOut = 0;
        let totalInCount = 0;
        let totalOutCount = 0;

        result.rows.forEach(row => {
            if (row.transfer_type === 'in') {
                totalIn += parseInt(row.transfer_amount) || 0;
                totalInCount++;
            } else {
                totalOut += parseInt(row.transfer_amount) || 0;
                totalOutCount++;
            }
        });

        console.log('[TRANSACTIONS-BY-PHONE] ✅ Found transactions:', {
            phone,
            count: result.rows.length,
            totalIn,
            totalOut
        });

        res.json({
            success: true,
            data: result.rows,
            statistics: {
                total_transactions: result.rows.length,
                total_in_count: totalInCount,
                total_out_count: totalOutCount,
                total_in: totalIn,
                total_out: totalOut,
                net_change: totalIn - totalOut
            },
            customer: {
                phone: phone,
                name: result.rows.length > 0 ? result.rows[0].customer_name : null
            }
        });

    } catch (error) {
        console.error('[TRANSACTIONS-BY-PHONE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions',
            message: error.message
        });
    }
});

/**
 * 🆕 POST /api/sepay/update-debt
 * Admin endpoint to manually update customer debt
 * This updates the customers.debt field directly
 */
/**
 * DEPRECATED: This endpoint relied on customers table which has been removed
 * Debt is now calculated directly from balance_history transactions
 */
router.post('/update-debt', async (req, res) => {
    console.log('[UPDATE-DEBT] ⚠️  Endpoint called but disabled (customers table removed)');

    return res.status(410).json({
        success: false,
        error: 'Endpoint no longer supported',
        message: 'Manual debt adjustment has been removed. Debt is now calculated automatically from transactions in balance_history.',
        deprecated: true
    });
});

// =====================================================
// FAILED WEBHOOK QUEUE ENDPOINTS
// =====================================================

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
        console.log('[FAILED-QUEUE] ✅ Saved webhook to failed queue:', webhookData.id);
        return true;
    } catch (queueError) {
        console.error('[FAILED-QUEUE] ❌ Failed to save to queue:', queueError.message);
        return false;
    }
}

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

            console.log('[FAILED-QUEUE] ✅ Retry successful for queue ID:', id);

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
 *
 * This endpoint caused severe performance degradation:
 * - Full table scan of balance_history (could be 100k+ records)
 * - Complex sorting and gap calculation
 * - Called automatically on every page load
 * - Response times: 60-90 seconds
 *
 * Alternative: Check database logs for missing transaction IDs manually if needed
 */
router.get('/detect-gaps', async (req, res) => {
    console.log('[DETECT-GAPS] ⚠️  Endpoint called but disabled for performance');

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
        // Sepay API: GET /userapi/transactions/list?account_number=xxx&reference_number=xxx
        const sepayUrl = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&reference_number=${referenceCode}`;

        console.log('[FETCH-BY-REF] Calling Sepay API:', sepayUrl);

        const sepayResponse = await fetchWithTimeout(sepayUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }, 15000); // 15 second timeout for SePay API

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
                message: `Không tìm thấy giao dịch với mã tham chiếu ${referenceCode}`
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

            console.log('[FETCH-BY-REF] ✅ Transaction inserted:', result.rows[0].id);

            res.json({
                success: true,
                message: `Đã lấy được giao dịch ${referenceCode}`,
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
                message: 'Giao dịch đã tồn tại trong hệ thống',
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

// =====================================================
// PENDING CUSTOMER MATCHES ENDPOINTS
// =====================================================

/**
 * GET /api/sepay/pending-matches
 * Get all pending customer matches
 * Query params:
 *   - status: pending, resolved, skipped (default: pending)
 *   - limit: max results (default: 50)
 */
router.get('/pending-matches', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { status = 'pending', limit = 50 } = req.query;

    try {
        const limitCount = Math.min(parseInt(limit) || 50, 200);

        const query = `
            SELECT
                pcm.id,
                pcm.transaction_id,
                pcm.extracted_phone,
                pcm.matched_customers,
                pcm.selected_customer_id,
                pcm.status,
                pcm.resolution_notes,
                pcm.created_at,
                pcm.resolved_at,
                pcm.resolved_by,
                bh.content as transaction_content,
                bh.transfer_amount,
                bh.transaction_date,
                bh.gateway
            FROM pending_customer_matches pcm
            INNER JOIN balance_history bh ON pcm.transaction_id = bh.id
            WHERE pcm.status = $1
            ORDER BY pcm.created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [status, limitCount]);

        console.log('[PENDING-MATCHES] Found', result.rows.length, 'matches with status:', status);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('[PENDING-MATCHES] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pending matches',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/pending-matches/:id/resolve
 * Resolve a pending match by selecting a customer
 * Body:
 *   - customer_id: The selected customer ID
 *   - resolved_by: Admin username (optional)
 */
router.post('/pending-matches/:id/resolve', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { customer_id, resolved_by = 'admin' } = req.body;

    if (!customer_id) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: customer_id'
        });
    }

    try {
        // 1. Get pending match details
        const matchResult = await db.query(
            `SELECT
                pcm.transaction_id,
                pcm.extracted_phone,
                pcm.matched_customers,
                bh.transfer_amount,
                bh.content
             FROM pending_customer_matches pcm
             INNER JOIN balance_history bh ON pcm.transaction_id = bh.id
             WHERE pcm.id = $1 AND pcm.status = 'pending'`,
            [id]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pending match not found or already resolved'
            });
        }

        const match = matchResult.rows[0];

        // 2. Parse matched_customers (handle both string and object)
        let matchedCustomers = match.matched_customers;
        if (typeof matchedCustomers === 'string') {
            try {
                matchedCustomers = JSON.parse(matchedCustomers);
            } catch (parseErr) {
                console.error('[RESOLVE-MATCH] Failed to parse matched_customers:', parseErr);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid matched_customers data format'
                });
            }
        }

        // Validate matchedCustomers is an array
        if (!Array.isArray(matchedCustomers)) {
            console.error('[RESOLVE-MATCH] matched_customers is not an array:', typeof matchedCustomers);
            return res.status(400).json({
                success: false,
                error: 'matched_customers is not an array',
                debug_type: typeof matchedCustomers
            });
        }

        console.log('[RESOLVE-MATCH] Looking for customer_id:', customer_id, 'in', matchedCustomers.length, 'phone groups');

        // 3. Find customer in nested structure
        // Structure: [{phone, count, customers: [{id, name, phone}]}]
        // Note: id can be integer (from TPOS) or string like "LOCAL_0901234567" (from local DB)
        let selectedCustomer = null;
        const targetIdStr = String(customer_id);
        const targetIdInt = parseInt(customer_id);

        for (const phoneGroup of matchedCustomers) {
            const customers = phoneGroup.customers || [];
            if (!Array.isArray(customers)) continue;

            for (const c of customers) {
                // Compare as string first (handles both LOCAL_xxx and numeric IDs)
                if (String(c.id) === targetIdStr || c.id === targetIdInt) {
                    selectedCustomer = c;
                    console.log('[RESOLVE-MATCH] ✓ Found customer:', c.name, c.phone);
                    break;
                }
            }
            if (selectedCustomer) break;
        }

        if (!selectedCustomer) {
            // Collect all customer IDs for debugging
            const allCustomerIds = [];
            for (const pg of matchedCustomers) {
                if (pg.customers && Array.isArray(pg.customers)) {
                    for (const c of pg.customers) {
                        allCustomerIds.push({ id: c.id, name: c.name, phone: c.phone });
                    }
                }
            }
            console.error('[RESOLVE-MATCH] Customer not found. Target:', customer_id, 'Available:', allCustomerIds);
            return res.status(400).json({
                success: false,
                error: 'Selected customer not in matched list',
                requested_id: customer_id,
                available_customers: allCustomerIds
            });
        }

        console.log('[RESOLVE-MATCH] Resolving match', id, 'with customer:', selectedCustomer.phone);

        // 3. Mark transaction as processed AND link to customer phone
        const amount = parseInt(match.transfer_amount) || 0;
        await db.query(
            `UPDATE balance_history
             SET debt_added = TRUE, linked_customer_phone = $2
             WHERE id = $1 AND linked_customer_phone IS NULL`,
            [match.transaction_id, selectedCustomer.phone]
        );

        console.log('[RESOLVE-MATCH] ✅ Linked transaction', match.transaction_id, 'to phone:', selectedCustomer.phone);

        // 4. Update pending match status with selected customer info as JSON
        const selectedCustomerJson = JSON.stringify({
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone
        });

        await db.query(
            `UPDATE pending_customer_matches
             SET status = 'resolved',
                 selected_customer_id = $2,
                 resolved_at = CURRENT_TIMESTAMP,
                 resolved_by = $3,
                 resolution_notes = $4
             WHERE id = $1`,
            [
                id,
                customer_id,
                resolved_by,
                selectedCustomerJson
            ]
        );

        // 5. NEW: Save resolved customer to balance_customer_info for debt tracking
        const uniqueCode = `PHONE${selectedCustomer.phone}`;
        await db.query(
            `INSERT INTO balance_customer_info
             (unique_code, customer_phone, customer_name, extraction_note, name_fetch_status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (unique_code) DO UPDATE SET
                 customer_phone = EXCLUDED.customer_phone,
                 customer_name = EXCLUDED.customer_name,
                 extraction_note = EXCLUDED.extraction_note,
                 name_fetch_status = EXCLUDED.name_fetch_status,
                 updated_at = CURRENT_TIMESTAMP`,
            [
                uniqueCode,
                selectedCustomer.phone,
                selectedCustomer.name,
                `RESOLVED_FROM_PENDING:${match.extracted_phone}`,
                'SUCCESS'
            ]
        );

        console.log('[RESOLVE-MATCH] ✅ Saved to balance_customer_info:', uniqueCode);

        console.log('[RESOLVE-MATCH] ✅ Match resolved:', {
            match_id: id,
            transaction_id: match.transaction_id,
            customer_phone: selectedCustomer.phone,
            amount
        });

        res.json({
            success: true,
            message: 'Match resolved successfully',
            data: {
                match_id: id,
                transaction_id: match.transaction_id,
                customer: {
                    phone: selectedCustomer.phone,
                    name: selectedCustomer.name
                },
                amount_added: amount
            }
        });

    } catch (error) {
        console.error('[RESOLVE-MATCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resolve match',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/pending-matches/:id/skip
 * Skip/ignore a pending match
 * Body:
 *   - reason: Reason for skipping (optional)
 *   - resolved_by: Admin username (optional)
 */
router.post('/pending-matches/:id/skip', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { reason = 'Skipped by admin', resolved_by = 'admin' } = req.body;

    try {
        const result = await db.query(
            `UPDATE pending_customer_matches
             SET status = 'skipped',
                 resolved_at = CURRENT_TIMESTAMP,
                 resolved_by = $2,
                 resolution_notes = $3
             WHERE id = $1 AND status = 'pending'
             RETURNING id, transaction_id, extracted_phone`,
            [id, resolved_by, reason]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pending match not found or already resolved'
            });
        }

        console.log('[SKIP-MATCH] Match skipped:', result.rows[0]);

        res.json({
            success: true,
            message: 'Match skipped successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[SKIP-MATCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to skip match',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/pending-matches/:id/undo-skip
 * Undo a skipped pending match - reset to pending status
 * Body:
 *   - resolved_by: Admin username (optional)
 */
router.post('/pending-matches/:id/undo-skip', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { resolved_by = 'admin' } = req.body;

    try {
        // Check if match exists and is skipped
        const checkResult = await db.query(
            `SELECT id, transaction_id, status FROM pending_customer_matches WHERE id = $1`,
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pending match not found'
            });
        }

        if (checkResult.rows[0].status !== 'skipped') {
            return res.status(400).json({
                success: false,
                error: 'Match is not in skipped status',
                current_status: checkResult.rows[0].status
            });
        }

        // Reset to pending status
        const result = await db.query(
            `UPDATE pending_customer_matches
             SET status = 'pending',
                 resolved_at = NULL,
                 resolved_by = NULL,
                 selected_customer_id = NULL,
                 resolution_notes = $2
             WHERE id = $1
             RETURNING id, transaction_id, extracted_phone, status`,
            [id, `Undo skip by ${resolved_by} at ${new Date().toISOString()}`]
        );

        console.log('[UNDO-SKIP] Match reset to pending:', result.rows[0]);

        res.json({
            success: true,
            message: 'Match reset to pending successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[UNDO-SKIP] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to undo skip',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/phone-data
 * Get all phone data from balance_customer_info table
 * Query params:
 *   - limit: max results (default: 100, max: 500)
 *   - offset: pagination offset (default: 0)
 */
router.get('/phone-data', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 50, offset = 0, include_totals = 'false' } = req.query;

    try {
        const limitCount = Math.min(parseInt(limit) || 50, 200); // Reduced from 500 to 200
        const offsetCount = parseInt(offset) || 0;
        const includeTotals = include_totals === 'true';

        console.log(`[PHONE-DATA] Fetching phone data: limit=${limitCount}, offset=${offsetCount}, include_totals=${includeTotals}`);

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM balance_customer_info`
        );
        const total = parseInt(countResult.rows[0]?.total || 0);

        // Get phone data - WITH or WITHOUT transaction totals based on parameter
        let dataResult;

        if (includeTotals) {
            // SLOW query with SUM/COUNT aggregation
            dataResult = await db.query(
                `SELECT
                    bci.id,
                    bci.unique_code,
                    bci.customer_name,
                    bci.customer_phone,
                    bci.extraction_note,
                    bci.name_fetch_status,
                    bci.created_at,
                    bci.updated_at,
                    COALESCE(SUM(CASE WHEN bh.transfer_type = 'in' THEN bh.transfer_amount ELSE 0 END), 0) as total_amount,
                    COUNT(bh.id) as transaction_count
                 FROM balance_customer_info bci
                 LEFT JOIN balance_history bh ON (
                     bh.transfer_type = 'in' AND (
                         -- Match by QR code in content
                         (bci.unique_code ~* '^N2[A-Z0-9]{16}$' AND bh.content ~* bci.unique_code)
                         OR
                         -- Match by partial phone from extraction note
                         (bci.extraction_note LIKE 'AUTO_MATCHED_FROM_PARTIAL:%'
                          AND bh.content LIKE '%' || SUBSTRING(bci.extraction_note FROM 'AUTO_MATCHED_FROM_PARTIAL:(.*)') || '%')
                         OR
                         -- Match by exact phone in content
                         (bci.customer_phone IS NOT NULL AND bh.content LIKE '%' || bci.customer_phone || '%')
                     )
                 )
                 GROUP BY bci.id, bci.unique_code, bci.customer_name, bci.customer_phone,
                          bci.extraction_note, bci.name_fetch_status, bci.created_at, bci.updated_at
                 ORDER BY bci.created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limitCount, offsetCount]
            );
        } else {
            // FAST query without JOIN - just get customer info
            dataResult = await db.query(
                `SELECT
                    id,
                    unique_code,
                    customer_name,
                    customer_phone,
                    extraction_note,
                    name_fetch_status,
                    created_at,
                    updated_at,
                    0 as total_amount,
                    0 as transaction_count
                 FROM balance_customer_info
                 ORDER BY created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limitCount, offsetCount]
            );
        }

        console.log(`[PHONE-DATA] Found ${dataResult.rows.length} records (total: ${total})`);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                total,
                limit: limitCount,
                offset: offsetCount,
                returned: dataResult.rows.length
            }
        });

    } catch (error) {
        console.error('[PHONE-DATA] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch phone data',
            message: error.message
        });
    }
});

/**
 * PUT /api/sepay/customer-info/:unique_code
 * Update customer name and/or fetch status for a specific unique code
 * NOTE: This endpoint is used by backend processes for name fetching from TPOS
 * For transaction-level phone updates, use PUT /api/sepay/transaction/:id/phone instead
 * Body: {
 *   customer_name?: string,
 *   name_fetch_status?: string
 * }
 */
router.put('/customer-info/:unique_code', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { unique_code } = req.params;
    const { customer_name, name_fetch_status } = req.body;

    try {
        // Build dynamic update query for balance_customer_info
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (customer_name !== undefined) {
            updates.push(`customer_name = $${paramIndex++}`);
            values.push(customer_name);
        }

        if (name_fetch_status !== undefined) {
            updates.push(`name_fetch_status = $${paramIndex++}`);
            values.push(name_fetch_status);
        } else if (customer_name !== undefined && customer_name !== null) {
            // Auto-set SUCCESS if setting a name without explicit status
            updates.push(`name_fetch_status = $${paramIndex++}`);
            values.push('SUCCESS');
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update (customer_name or name_fetch_status required)'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(unique_code);

        // Update balance_customer_info
        const query = `
            UPDATE balance_customer_info
            SET ${updates.join(', ')}
            WHERE unique_code = $${paramIndex}
            RETURNING *
        `;

        console.log(`[UPDATE-CUSTOMER-INFO] ${unique_code}:`, { customer_name, name_fetch_status });

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Unique code not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[UPDATE-CUSTOMER-INFO] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update customer info',
            message: error.message
        });
    }
});

/**
 * PUT /api/sepay/transaction/:id/phone
 * Update linked_customer_phone for a specific transaction
 * This allows moving a transaction's debt from one phone to another
 * Body: { phone: string }
 */
router.put('/transaction/:id/phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { phone } = req.body;

    try {
        // Validate inputs
        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction ID'
            });
        }

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        // Get current transaction data
        const currentResult = await db.query(
            'SELECT id, linked_customer_phone, transfer_amount FROM balance_history WHERE id = $1',
            [id]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        const oldPhone = currentResult.rows[0].linked_customer_phone;
        const newPhone = phone;

        // Update the transaction's linked phone
        const updateResult = await db.query(
            'UPDATE balance_history SET linked_customer_phone = $1 WHERE id = $2 RETURNING *',
            [newPhone, id]
        );

        console.log(`[TRANSACTION-PHONE-UPDATE] Transaction #${id}: ${oldPhone || 'NULL'} → ${newPhone}`);

        // Clear any pending_customer_matches (skipped or pending) for this transaction
        // since we're manually setting the phone
        const deletePendingResult = await db.query(
            'DELETE FROM pending_customer_matches WHERE transaction_id = $1 RETURNING id, status',
            [id]
        );
        if (deletePendingResult.rows.length > 0) {
            console.log(`[TRANSACTION-PHONE-UPDATE] Cleared pending_customer_matches:`, deletePendingResult.rows[0]);
        }

        // Try to get customer name from TPOS for the new phone
        let customerName = null;
        let tposResult = null;
        try {
            console.log(`[TRANSACTION-PHONE-UPDATE] Searching TPOS for phone: ${newPhone}`);
            tposResult = await searchTPOSByPartialPhone(newPhone);

            if (tposResult.success && tposResult.uniquePhones.length > 0) {
                const phoneData = tposResult.uniquePhones.find(p => p.phone === newPhone);
                if (phoneData && phoneData.customers.length > 0) {
                    customerName = phoneData.customers[0].name;
                    console.log(`[TRANSACTION-PHONE-UPDATE] Found customer from TPOS: ${customerName}`);

                    // Save/update to balance_customer_info
                    await db.query(
                        `INSERT INTO balance_customer_info (unique_code, customer_phone, customer_name, extraction_note, name_fetch_status)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (unique_code) DO UPDATE SET
                             customer_phone = EXCLUDED.customer_phone,
                             customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), balance_customer_info.customer_name),
                             extraction_note = EXCLUDED.extraction_note,
                             name_fetch_status = EXCLUDED.name_fetch_status,
                             updated_at = CURRENT_TIMESTAMP`,
                        [
                            `PHONE${newPhone}`,
                            newPhone,
                            customerName,
                            'MANUAL_ENTRY_TPOS_LOOKUP',
                            'SUCCESS'
                        ]
                    );
                    console.log(`[TRANSACTION-PHONE-UPDATE] Saved customer info to balance_customer_info`);
                }
            } else {
                console.log(`[TRANSACTION-PHONE-UPDATE] No customer found in TPOS for: ${newPhone}`);
            }
        } catch (tposError) {
            console.error(`[TRANSACTION-PHONE-UPDATE] TPOS lookup error:`, tposError.message);
            // Continue without TPOS data - phone is still updated
        }

        res.json({
            success: true,
            data: updateResult.rows[0],
            old_phone: oldPhone,
            new_phone: newPhone,
            customer_name: customerName,
            tpos_lookup: tposResult ? 'success' : 'failed'
        });

    } catch (error) {
        console.error('[TRANSACTION-PHONE-UPDATE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update transaction phone',
            message: error.message
        });
    }
});

/**
 * PUT /api/sepay/transaction/:id/hidden
 * Toggle hidden status of a transaction
 * Body: { hidden: boolean }
 */
router.put('/transaction/:id/hidden', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { hidden } = req.body;

    try {
        // Validate inputs
        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction ID'
            });
        }

        if (typeof hidden !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'hidden must be a boolean'
            });
        }

        // Update the transaction's hidden status
        const updateResult = await db.query(
            'UPDATE balance_history SET is_hidden = $1 WHERE id = $2 RETURNING id, is_hidden',
            [hidden, id]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        console.log(`[TRANSACTION-HIDDEN] Transaction #${id}: is_hidden = ${hidden}`);

        res.json({
            success: true,
            data: updateResult.rows[0]
        });

    } catch (error) {
        console.error('[TRANSACTION-HIDDEN] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update transaction hidden status',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/tpos/customer/:phone
 * Fetch customer info from TPOS Partner API by phone number
 * Uses automatic TPOS token management from environment variables
 */
router.get('/tpos/customer/:phone', async (req, res) => {
    const { phone } = req.params;

    try {
        if (!phone || !/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number (must be 10 digits)'
            });
        }

        console.log(`[TPOS-CUSTOMER] Fetching customer for phone: ${phone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${phone}&$top=50&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000); // 15 second timeout for TPOS API

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Group by unique 10-digit phone
        const uniqueCustomers = [];
        const seenPhones = new Set();

        if (data.value && Array.isArray(data.value)) {
            for (const customer of data.value) {
                const custPhone = customer.Phone?.replace(/\D/g, '').slice(-10);
                if (custPhone && custPhone.length === 10 && !seenPhones.has(custPhone)) {
                    seenPhones.add(custPhone);
                    uniqueCustomers.push({
                        id: customer.Id,
                        phone: custPhone,
                        name: customer.Name || customer.FullName,
                        email: customer.Email,
                        status: customer.Status,
                        credit: customer.Credit
                    });
                }
            }
        }

        console.log(`[TPOS-CUSTOMER] Found ${uniqueCustomers.length} unique customers for ${phone}`);

        res.json({
            success: true,
            data: uniqueCustomers,
            count: uniqueCustomers.length
        });

    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer from TPOS',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/tpos/search/:partialPhone
 * Search TPOS by partial phone number (5+ digits)
 * Returns customers whose phone ends with the partial phone
 */
router.get('/tpos/search/:partialPhone', async (req, res) => {
    const { partialPhone } = req.params;

    try {
        // Validate partial phone (5-10 digits)
        if (!partialPhone || !/^\d{5,10}$/.test(partialPhone)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid partial phone (must be 5-10 digits)'
            });
        }

        console.log(`[TPOS-SEARCH] Searching for partial phone: ${partialPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${partialPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000);

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Group by unique 10-digit phone
        const phoneGroups = {};

        if (data.value && Array.isArray(data.value)) {
            for (const customer of data.value) {
                const custPhone = customer.Phone?.replace(/\D/g, '').slice(-10);
                if (custPhone && custPhone.length === 10) {
                    if (!phoneGroups[custPhone]) {
                        phoneGroups[custPhone] = {
                            phone: custPhone,
                            count: 0,
                            customers: []
                        };
                    }
                    phoneGroups[custPhone].count++;
                    phoneGroups[custPhone].customers.push({
                        id: customer.Id,
                        phone: custPhone,
                        name: customer.Name || customer.FullName || 'N/A',
                        email: customer.Email,
                        status: customer.Status,
                        credit: customer.Credit
                    });
                }
            }
        }

        const uniquePhones = Object.values(phoneGroups);
        console.log(`[TPOS-SEARCH] Found ${uniquePhones.length} unique phones for ${partialPhone}`);

        res.json({
            success: true,
            data: uniquePhones,
            totalResults: data['@odata.count'] || 0,
            uniquePhoneCount: uniquePhones.length
        });

    } catch (error) {
        console.error('[TPOS-SEARCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search TPOS',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/batch-update-phones
 * Batch update phone numbers for existing transactions
 * This is useful for retroactively extracting phone numbers from old transactions
 */
router.post('/batch-update-phones', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 100, force = false } = req.body;

    try {
        console.log('[BATCH-UPDATE] Starting batch phone update...');

        // Get transactions that need phone extraction
        const filter = force ? '' : 'AND debt_added = FALSE';
        const query = `
            SELECT id, content, transfer_type
            FROM balance_history
            WHERE transfer_type = 'in'
            ${filter}
            ORDER BY transaction_date DESC
            LIMIT $1
        `;

        const result = await db.query(query, [Math.min(limit, 500)]);
        const transactions = result.rows;

        console.log(`[BATCH-UPDATE] Found ${transactions.length} transactions to process`);

        const results = {
            total: transactions.length,
            processed: 0,
            success: 0,
            pending_matches: 0,
            not_found: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        // Process each transaction using processDebtUpdate()
        for (const tx of transactions) {
            results.processed++;

            try {
                const updateResult = await processDebtUpdate(db, tx.id);

                if (updateResult.success) {
                    if (updateResult.method === 'pending_match_created') {
                        results.pending_matches++;
                        results.details.push({
                            transaction_id: tx.id,
                            status: 'pending_match',
                            partial_phone: updateResult.partialPhone,
                            unique_phones_count: updateResult.uniquePhonesCount
                        });
                        console.log(`[BATCH-UPDATE] 📋 Transaction ${tx.id}: pending match (${updateResult.uniquePhonesCount} phones)`);
                    } else {
                        results.success++;
                        results.details.push({
                            transaction_id: tx.id,
                            status: 'success',
                            method: updateResult.method,
                            phone: updateResult.fullPhone || updateResult.qrCode,
                            customer_name: updateResult.customerName
                        });
                        console.log(`[BATCH-UPDATE] ✅ Transaction ${tx.id}: ${updateResult.method}`);
                    }
                } else {
                    if (updateResult.reason === 'No TPOS matches' || updateResult.note === 'NOT_FOUND_IN_TPOS') {
                        results.not_found++;
                        results.details.push({
                            transaction_id: tx.id,
                            status: 'not_found',
                            partial_phone: updateResult.partialPhone,
                            content: tx.content || '',
                            reason: updateResult.reason
                        });
                        console.log(`[BATCH-UPDATE] ⚠️  Transaction ${tx.id}: no TPOS matches for ${updateResult.partialPhone}`);
                    } else {
                        results.skipped++;
                        results.details.push({
                            transaction_id: tx.id,
                            status: 'skipped',
                            content: tx.content || '',
                            reason: updateResult.reason,
                            note: updateResult.note
                        });
                        console.log(`[BATCH-UPDATE] ⊘ Transaction ${tx.id}: ${updateResult.reason}`);
                    }
                }

            } catch (error) {
                results.failed++;
                results.details.push({
                    transaction_id: tx.id,
                    status: 'failed',
                    error: error.message
                });
                console.error(`[BATCH-UPDATE] ❌ Transaction ${tx.id}:`, error.message);
            }
        }

        console.log('[BATCH-UPDATE] Complete:', results);

        res.json({
            success: true,
            message: `Batch update completed: ${results.success} success, ${results.pending_matches} pending matches, ${results.not_found} not found, ${results.skipped} skipped, ${results.failed} failed`,
            data: results
        });

    } catch (error) {
        console.error('[BATCH-UPDATE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to batch update phones',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/debt/:phone
 * Get debt for a specific phone number
 */
router.get('/debt/:phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone } = req.params;

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Phone number is required'
        });
    }

    try {
        // Normalize phone to full 10-digit format (0xxxxxxxxx)
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = normalizedPhone.substring(2); // Remove country code 84
        }
        if (!normalizedPhone.startsWith('0') && normalizedPhone.length === 9) {
            normalizedPhone = '0' + normalizedPhone; // Add leading 0
        }

        console.log(`[DEBT] Fetching debt for phone: ${phone} -> normalized: ${normalizedPhone}`);

        // Query debt from balance_history by linked_customer_phone
        const query = `
            SELECT
                COUNT(*) as transaction_count,
                COALESCE(SUM(transfer_amount), 0) as total_debt
            FROM balance_history
            WHERE transfer_type = 'in'
              AND linked_customer_phone = $1
        `;

        const result = await db.query(query, [normalizedPhone]);
        const row = result.rows[0];

        const debt = parseFloat(row.total_debt) || 0;
        const transactionCount = parseInt(row.transaction_count) || 0;

        console.log(`[DEBT] Phone ${normalizedPhone}: ${debt} VND (${transactionCount} transactions)`);

        res.json({
            success: true,
            phone: normalizedPhone,
            debt: debt,
            transaction_count: transactionCount
        });

    } catch (error) {
        console.error('[DEBT] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch debt',
            message: error.message
        });
    }
});

// =====================================================
// TRANSFER STATS API ENDPOINTS
// Now reads directly from balance_history table (transfer_type = 'in')
// Uses columns: ts_checked, ts_verified, ts_notes in balance_history
// =====================================================

// GET /api/sepay/transfer-stats - Get all incoming transactions from balance_history
router.get('/transfer-stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Ensure ts columns exist in balance_history
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_checked BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_verified BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_notes TEXT`);

        // Query from balance_history JOIN balance_customer_info for customer name
        const result = await db.query(`
            SELECT
                bh.id,
                bh.id as transaction_id,
                COALESCE(bci.customer_name, '') as customer_name,
                bh.linked_customer_phone as customer_phone,
                bh.transfer_amount as amount,
                bh.content,
                bh.ts_notes as notes,
                bh.transaction_date,
                bh.ts_checked as is_checked,
                bh.ts_verified as is_verified,
                bh.created_at
            FROM balance_history bh
            LEFT JOIN (
                SELECT DISTINCT ON (customer_phone)
                    customer_phone, customer_name
                FROM balance_customer_info
                WHERE customer_phone IS NOT NULL
                ORDER BY customer_phone,
                    CASE WHEN customer_name IS NOT NULL AND customer_name != '' THEN 0 ELSE 1 END,
                    created_at DESC
            ) bci ON bci.customer_phone = bh.linked_customer_phone
            WHERE bh.transfer_type = 'in'
            ORDER BY bh.transaction_date DESC, bh.id DESC
        `);

        res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error fetching:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transfer stats'
        });
    }
});

// GET /api/sepay/transfer-stats/count - Get unchecked count
router.get('/transfer-stats/count', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Ensure ts columns exist in balance_history
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_checked BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_verified BOOLEAN DEFAULT FALSE`);
        await db.query(`ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS ts_notes TEXT`);

        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE ts_checked IS NOT TRUE) as unchecked
            FROM balance_history
            WHERE transfer_type = 'in'
        `);

        res.json({
            success: true,
            total: parseInt(result.rows[0].total) || 0,
            unchecked: parseInt(result.rows[0].unchecked) || 0
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error counting:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to count'
        });
    }
});

// PUT /api/sepay/transfer-stats/:id/check - Toggle check status
router.put('/transfer-stats/:id/check', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { checked } = req.body;

    try {
        const result = await db.query(`
            UPDATE balance_history
            SET ts_checked = $1
            WHERE id = $2
            RETURNING *
        `, [checked, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not found'
            });
        }

        console.log(`[TRANSFER-STATS] Marked #${id} as ${checked ? 'checked' : 'unchecked'}`);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error updating:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update'
        });
    }
});

// PUT /api/sepay/transfer-stats/:id/verify - Toggle verify status
router.put('/transfer-stats/:id/verify', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { verified } = req.body;

    try {
        const result = await db.query(`
            UPDATE balance_history
            SET ts_verified = $1
            WHERE id = $2
            RETURNING *
        `, [verified, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not found'
            });
        }

        console.log(`[TRANSFER-STATS] Marked #${id} as ${verified ? 'verified' : 'unverified'}`);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error updating verified:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update'
        });
    }
});

// PUT /api/sepay/transfer-stats/mark-all-checked - Mark multiple as checked
router.put('/transfer-stats/mark-all-checked', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'ids array is required'
        });
    }

    try {
        const result = await db.query(`
            UPDATE balance_history
            SET ts_checked = TRUE
            WHERE id = ANY($1)
            RETURNING id
        `, [ids]);

        console.log(`[TRANSFER-STATS] Marked ${result.rows.length} items as checked`);

        res.json({
            success: true,
            updated: result.rows.length
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error marking all:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark all'
        });
    }
});

// PUT /api/sepay/transfer-stats/:id - Edit transfer stats entry (notes only, customer info is in balance_history)
router.put('/transfer-stats/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { customer_name, customer_phone, notes } = req.body;

    try {
        const result = await db.query(`
            UPDATE balance_history
            SET customer_name = COALESCE($1, customer_name),
                linked_customer_phone = COALESCE($2, linked_customer_phone),
                ts_notes = $3
            WHERE id = $4
            RETURNING *
        `, [customer_name, customer_phone, notes || null, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not found'
            });
        }

        console.log(`[TRANSFER-STATS] Updated #${id}`);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[TRANSFER-STATS] Error editing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to edit'
        });
    }
});

module.exports = router;
