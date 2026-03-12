// =====================================================
// SEPAY WALLET OPERATIONS
// Customer info CRUD, transfer stats, aliases management,
// transaction phone/hidden updates, phone data
// =====================================================

const tposTokenManager = require('../services/tpos-token-manager');
const { getOrCreateCustomerFromTPOS } = require('../services/customer-creation-service');
const { processDeposit } = require('../services/wallet-event-processor');

/**
 * Register wallet operation routes on the given router
 * @param {express.Router} router - Express router instance
 * @param {Object} helpers - Shared helper functions { fetchWithTimeout, searchTPOSByPartialPhone, upsertRecentTransfer }
 */
function registerRoutes(router, helpers) {
    const { fetchWithTimeout, searchTPOSByPartialPhone, upsertRecentTransfer } = helpers;

    // =====================================================
    // CUSTOMER INFO ENDPOINTS
    // =====================================================

    /**
     * GET /api/sepay/customer-info/:uniqueCode
     * Lay thong tin khach hang theo ma giao dich
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
     * Luu hoac cap nhat thong tin khach hang
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

            console.log('[CUSTOMER-INFO] Processing:', {
                uniqueCode,
                customerName,
                customerPhone
            });

            // PHASE 1.3: Chi tao/cap nhat customer trong bang customers (Source of Truth)
            let customerId = null;
            if (customerPhone) {
                try {
                    const customerResult = await getOrCreateCustomerFromTPOS(db, customerPhone, null);
                    customerId = customerResult.customerId;
                    console.log('[CUSTOMER-INFO] Also synced to customers table:', {
                        phone: customerPhone,
                        customerId,
                        created: customerResult.created
                    });

                    // Cap nhat balance_history.customer_id neu tim thay giao dich
                    if (!uniqueCode.startsWith('PHONE')) {
                        const updateResult = await db.query(`
                            UPDATE balance_history
                            SET customer_id = $1,
                                linked_customer_phone = $2,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE (transaction_content LIKE '%' || $3 || '%' OR reference_code = $3)
                              AND customer_id IS NULL
                        `, [customerId, customerPhone, uniqueCode]);

                        if (updateResult.rowCount > 0) {
                            console.log('[CUSTOMER-INFO] Linked', updateResult.rowCount, 'balance_history records to customer');
                        }
                    } else {
                        console.log('[CUSTOMER-INFO] uniqueCode is phone-based, skipping balance_history update');
                    }
                } catch (customerError) {
                    console.error('[CUSTOMER-INFO] Failed to sync to customers table:', customerError.message);
                }
            }

            res.json({
                success: true,
                data: {
                    unique_code: uniqueCode,
                    customer_name: customerName,
                    customer_phone: customerPhone
                },
                customerId
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
     * Lay tat ca thong tin khach hang
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
     * Lay thong tin giao dich theo unique code (N2XXXXXXXXXXXXXXXX)
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

            console.log('[TRANSACTION-BY-CODE] Found transaction:', {
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
     * GET /api/sepay/transactions-by-phone
     * Lay lich su giao dich theo so dien thoai khach hang
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

            console.log('[TRANSACTIONS-BY-PHONE] Found transactions:', {
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
     * GET /api/sepay/phone-data
     * Get all phone data from balance_customer_info table
     */
    router.get('/phone-data', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { limit = 50, offset = 0, include_totals = 'false' } = req.query;

        try {
            const limitCount = Math.min(parseInt(limit) || 50, 200);
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
     * DEPRECATED: balance_customer_info is now a snapshot table (Phase 1.3)
     */
    router.put('/customer-info/:unique_code', async (req, res) => {
        const { unique_code } = req.params;
        const { customer_name, name_fetch_status } = req.body;

        console.log(`[UPDATE-CUSTOMER-INFO] DEPRECATED - Skipping update to balance_customer_info for ${unique_code}:`, {
            customer_name,
            name_fetch_status
        });

        // Return success for backward compatibility
        res.json({
            success: true,
            deprecated: true,
            message: 'balance_customer_info is now a snapshot table. Customer data is stored in customers table.'
        });
    });

    // =====================================================
    // TRANSACTION UPDATE ENDPOINTS
    // =====================================================

    /**
     * PUT /api/sepay/transaction/:id/phone
     * Update linked_customer_phone for a specific transaction
     */
    router.put('/transaction/:id/phone', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const {
            phone,
            name,
            customer_name,
            is_manual_entry = false,
            entered_by = 'staff',
            is_accountant_correction = false,
            note,
            verification_image_url,
            staff_note
        } = req.body;

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
                'SELECT id, linked_customer_phone, transfer_amount, verification_status, wallet_processed FROM balance_history WHERE id = $1',
                [id]
            );

            if (currentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            const currentTx = currentResult.rows[0];
            const oldPhone = currentTx.linked_customer_phone;
            const newPhone = phone;

            // SECURITY: Block phone change if transaction already credited to wallet
            if (currentTx.wallet_processed === true) {
                console.log(`[SECURITY] Blocked phone change for tx ${id} - already credited to wallet of ${oldPhone}`);
                return res.status(400).json({
                    success: false,
                    error: 'Khong the doi SDT - Giao dich da duoc cong vao vi khach hang',
                    details: {
                        transaction_id: parseInt(id),
                        current_phone: oldPhone,
                        wallet_processed: true,
                        suggestion: 'Su dung chuc nang "Dieu chinh cong no" de tru vi cu va cong vi moi'
                    }
                });
            }

            // Build update query based on is_manual_entry flag
            let updateQuery;
            let updateParams;

            if (is_manual_entry) {
                updateQuery = `UPDATE balance_history
                    SET linked_customer_phone = $1,
                        match_method = 'manual_entry',
                        verification_status = 'PENDING_VERIFICATION',
                        verification_note = $3,
                        wallet_processed = FALSE,
                        staff_note = COALESCE($4, staff_note)
                    WHERE id = $2
                    RETURNING *`;
                updateParams = [newPhone, id, `Manual entry by ${entered_by} at ${new Date().toISOString()}`, staff_note || null];
                console.log(`[TRANSACTION-PHONE-UPDATE] Manual entry - requires accountant approval${staff_note ? `, staff_note: "${staff_note}"` : ''}`);
            } else if (is_accountant_correction) {
                const finalNote = note || `Thay doi SDT boi ${entered_by}`;
                updateQuery = `UPDATE balance_history
                    SET linked_customer_phone = $1,
                        customer_name = COALESCE($5, customer_name),
                        match_method = 'manual_link',
                        verification_status = 'APPROVED',
                        verified_by = $3,
                        verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                        verification_note = $4,
                        verification_image_url = COALESCE($6, verification_image_url)
                    WHERE id = $2
                    RETURNING *`;
                updateParams = [newPhone, id, entered_by, finalNote, customer_name || name || null, verification_image_url || null];
                console.log(`[TRANSACTION-PHONE-UPDATE] Accountant correction with custom note/image - auto-approving`);
            } else {
                updateQuery = `UPDATE balance_history
                    SET linked_customer_phone = $1,
                        match_method = 'manual_link',
                        verification_status = 'APPROVED',
                        verified_by = $3,
                        verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                        verification_note = $4
                    WHERE id = $2
                    RETURNING *`;
                updateParams = [newPhone, id, entered_by, `Auto-approved by accountant ${entered_by} at ${new Date().toISOString()}`];
                console.log(`[TRANSACTION-PHONE-UPDATE] Accountant edit - auto-approving`);
            }

            const updateResult = await db.query(updateQuery, updateParams);

            console.log(`[TRANSACTION-PHONE-UPDATE] Transaction #${id}: ${oldPhone || 'NULL'} -> ${newPhone} (manual_entry=${is_manual_entry})`);

            // Clear any pending_customer_matches for this transaction
            const deletePendingResult = await db.query(
                'DELETE FROM pending_customer_matches WHERE transaction_id = $1 RETURNING id, status',
                [id]
            );
            if (deletePendingResult.rows.length > 0) {
                console.log(`[TRANSACTION-PHONE-UPDATE] Cleared pending_customer_matches:`, deletePendingResult.rows[0]);
            }

            // Try to get customer name - priority: request body > TPOS lookup
            let customerName = name || null;
            let tposResult = null;

            // Only lookup TPOS if no name provided
            if (!customerName) {
                try {
                    console.log(`[TRANSACTION-PHONE-UPDATE] Searching TPOS for phone: ${newPhone}`);
                    tposResult = await searchTPOSByPartialPhone(newPhone, fetchWithTimeout);

                    if (tposResult.success && tposResult.uniquePhones.length > 0) {
                        const phoneData = tposResult.uniquePhones.find(p => p.phone === newPhone);
                        if (phoneData && phoneData.customers.length > 0) {
                            customerName = phoneData.customers[0].name;
                            console.log(`[TRANSACTION-PHONE-UPDATE] Found customer from TPOS: ${customerName}`);
                        }
                    } else {
                        console.log(`[TRANSACTION-PHONE-UPDATE] No customer found in TPOS for: ${newPhone}`);
                    }
                } catch (tposError) {
                    console.error(`[TRANSACTION-PHONE-UPDATE] TPOS lookup error:`, tposError.message);
                }
            } else {
                console.log(`[TRANSACTION-PHONE-UPDATE] Using provided name: ${customerName}`);
            }

            // PHASE 1.3: Create/update customer in customers table (Source of Truth)
            let customerId = null;
            try {
                const customerResult = await getOrCreateCustomerFromTPOS(db, newPhone, null);
                customerId = customerResult.customerId;
                customerName = customerResult.name || customerName;
                console.log(`[TRANSACTION-PHONE-UPDATE] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}, Name: ${customerName}`);

                // Update balance_history with customer_id
                await db.query(`
                    UPDATE balance_history
                    SET customer_id = $1
                    WHERE id = $2
                `, [customerId, id]);
                console.log(`[TRANSACTION-PHONE-UPDATE] Updated balance_history with customer_id: ${customerId}`);
            } catch (customerError) {
                console.error(`[TRANSACTION-PHONE-UPDATE] Failed to create/find customer:`, customerError.message);
            }

            // For accountant edit (is_manual_entry = false), credit wallet immediately
            let walletResult = null;
            let walletCredited = false;
            const tx = updateResult.rows[0];

            if (!is_manual_entry && tx.transfer_amount > 0 && !tx.wallet_processed) {
                try {
                    console.log(`[TRANSACTION-PHONE-UPDATE] Accountant edit - crediting wallet for ${newPhone}`);

                    walletResult = await processDeposit(
                        db,
                        newPhone,
                        tx.transfer_amount,
                        id,
                        `Nap tu CK (Auto-approved by ${entered_by})`,
                        customerId || tx.customer_id
                    );

                    // Mark as wallet processed
                    await db.query(`
                        UPDATE balance_history
                        SET wallet_processed = TRUE
                        WHERE id = $1
                    `, [id]);

                    // Log activity
                    await db.query(`
                        INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
                        VALUES ($1, $2, 'WALLET_DEPOSIT', $3, $4, 'balance_history', $5, 'university', 'green')
                    `, [
                        newPhone,
                        customerId || tx.customer_id,
                        `Nap tien: ${parseFloat(tx.transfer_amount).toLocaleString()}d`,
                        `Chuyen khoan ngan hang (${tx.code || tx.reference_code}) - Auto-approved by ${entered_by}`,
                        id
                    ]);

                    walletCredited = true;
                    console.log(`[TRANSACTION-PHONE-UPDATE] Wallet credited: ${newPhone} +${tx.transfer_amount}`);
                } catch (walletErr) {
                    console.error(`[TRANSACTION-PHONE-UPDATE] Wallet credit failed:`, walletErr.message);
                }
            }

            // Track recent transfer phone (7-day TTL, total amount)
            await upsertRecentTransfer(db, newPhone);

            res.json({
                success: true,
                data: updateResult.rows[0],
                old_phone: oldPhone,
                new_phone: newPhone,
                customer_name: customerName,
                tpos_lookup: tposResult ? 'success' : 'failed',
                is_manual_entry: is_manual_entry,
                requires_approval: is_manual_entry,
                verification_status: is_manual_entry ? 'PENDING_VERIFICATION' : 'APPROVED',
                wallet_credited: walletCredited,
                wallet_amount: walletCredited ? tx.transfer_amount : null,
                new_balance: walletResult?.wallet?.balance || null
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
     */
    router.put('/transaction/:id/hidden', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { hidden, staff_note } = req.body;

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

            // Update the transaction's hidden status and staff_note if provided
            let query, params;
            if (staff_note !== undefined) {
                query = 'UPDATE balance_history SET is_hidden = $1, staff_note = $2 WHERE id = $3 RETURNING id, is_hidden, staff_note';
                params = [hidden, staff_note, id];
            } else {
                query = 'UPDATE balance_history SET is_hidden = $1 WHERE id = $2 RETURNING id, is_hidden, staff_note';
                params = [hidden, id];
            }

            const updateResult = await db.query(query, params);

            if (updateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            console.log(`[TRANSACTION-HIDDEN] Transaction #${id}: is_hidden = ${hidden}${staff_note ? `, staff_note = "${staff_note}"` : ''}`);

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

            const result = await db.query(`
                SELECT
                    bh.id,
                    bh.id as transaction_id,
                    COALESCE(NULLIF(bh.customer_name, ''), c.name, bci.customer_name, '') as customer_name,
                    COALESCE(c.phone, bh.linked_customer_phone) as customer_phone,
                    bh.transfer_amount as amount,
                    bh.content,
                    bh.ts_notes as notes,
                    bh.transaction_date,
                    bh.ts_checked as is_checked,
                    bh.ts_verified as is_verified,
                    bh.created_at
                FROM balance_history bh
                LEFT JOIN customers c ON c.id = bh.customer_id
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

    // PUT /api/sepay/transfer-stats/:id - Edit transfer stats entry
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

    // =====================================================
    // ALIASES MANAGEMENT ENDPOINTS
    // For Multiple Reference Names per Phone Number feature
    // =====================================================

    /**
     * GET /api/sepay/customer/:phone/aliases
     * Get all aliases (reference names) for a customer by phone
     */
    router.get('/customer/:phone/aliases', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phone } = req.params;

        try {
            // Normalize phone
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            if (normalizedPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number'
                });
            }

            const result = await db.query(
                'SELECT id, phone, name, aliases FROM customers WHERE phone = $1',
                [normalizedPhone]
            );

            if (result.rows.length === 0) {
                return res.json({
                    success: true,
                    phone: normalizedPhone,
                    name: null,
                    aliases: []
                });
            }

            const customer = result.rows[0];
            let aliases = customer.aliases || [];

            // Ensure aliases is an array
            if (typeof aliases === 'string') {
                try {
                    aliases = JSON.parse(aliases);
                } catch (e) {
                    aliases = [];
                }
            }
            if (!Array.isArray(aliases)) {
                aliases = [];
            }

            res.json({
                success: true,
                phone: normalizedPhone,
                name: customer.name,
                aliases: aliases
            });

        } catch (error) {
            console.error('[ALIASES] Error getting aliases:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get aliases'
            });
        }
    });

    /**
     * POST /api/sepay/customer/:phone/alias
     * Add a new alias for a customer
     */
    router.post('/customer/:phone/alias', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phone } = req.params;
        const { alias } = req.body;

        try {
            // Validate input
            if (!alias || alias.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: 'Alias is required'
                });
            }

            // Normalize phone
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            if (normalizedPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number'
                });
            }

            // Check if customer exists
            const customerResult = await db.query(
                'SELECT id, aliases FROM customers WHERE phone = $1',
                [normalizedPhone]
            );

            if (customerResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Customer not found'
                });
            }

            // Add alias using the SQL function
            const addResult = await db.query(
                'SELECT add_customer_alias($1, $2) as added',
                [normalizedPhone, alias.trim()]
            );

            const added = addResult.rows[0]?.added ?? false;

            if (added) {
                console.log(`[ALIASES] Added alias "${alias}" for ${normalizedPhone}`);
            } else {
                console.log(`[ALIASES] Alias "${alias}" already exists for ${normalizedPhone}`);
            }

            // Get updated aliases
            const updatedResult = await db.query(
                'SELECT aliases FROM customers WHERE phone = $1',
                [normalizedPhone]
            );

            res.json({
                success: true,
                added: added,
                aliases: updatedResult.rows[0]?.aliases || []
            });

        } catch (error) {
            console.error('[ALIASES] Error adding alias:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add alias'
            });
        }
    });

    /**
     * DELETE /api/sepay/customer/:phone/alias
     * Remove an alias from a customer
     */
    router.delete('/customer/:phone/alias', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phone } = req.params;
        const { alias } = req.body;

        try {
            // Validate input
            if (!alias || alias.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: 'Alias is required'
                });
            }

            // Normalize phone
            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            if (normalizedPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number'
                });
            }

            // Remove alias using the SQL function
            const removeResult = await db.query(
                'SELECT remove_customer_alias($1, $2) as removed',
                [normalizedPhone, alias.trim()]
            );

            const removed = removeResult.rows[0]?.removed ?? false;

            if (removed) {
                console.log(`[ALIASES] Removed alias "${alias}" from ${normalizedPhone}`);
            } else {
                console.log(`[ALIASES] Alias "${alias}" not found for ${normalizedPhone}`);
            }

            // Get updated aliases
            const updatedResult = await db.query(
                'SELECT aliases FROM customers WHERE phone = $1',
                [normalizedPhone]
            );

            res.json({
                success: true,
                removed: removed,
                aliases: updatedResult.rows[0]?.aliases || []
            });

        } catch (error) {
            console.error('[ALIASES] Error removing alias:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove alias'
            });
        }
    });

    /**
     * PUT /api/sepay/transaction/:id/display-name
     * Update display_name for a specific transaction
     */
    router.put('/transaction/:id/display-name', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { display_name, add_to_aliases = true } = req.body;

        try {
            // Validate input
            if (!display_name || display_name.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: 'Display name is required'
                });
            }

            // Get transaction to verify it exists and get linked phone
            const txResult = await db.query(
                'SELECT id, linked_customer_phone, customer_id FROM balance_history WHERE id = $1',
                [id]
            );

            if (txResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            const tx = txResult.rows[0];

            // Update display_name
            await db.query(
                'UPDATE balance_history SET display_name = $1 WHERE id = $2',
                [display_name.trim(), id]
            );

            console.log(`[ALIASES] Updated display_name for TX #${id}: "${display_name}"`);

            // Optionally add to customer aliases if phone is linked
            if (add_to_aliases && tx.linked_customer_phone) {
                try {
                    await db.query(
                        'SELECT add_customer_alias($1, $2)',
                        [tx.linked_customer_phone, display_name.trim()]
                    );
                    console.log(`[ALIASES] Also added "${display_name}" to aliases for ${tx.linked_customer_phone}`);
                } catch (aliasError) {
                    console.error('[ALIASES] Could not add to aliases:', aliasError.message);
                }
            }

            res.json({
                success: true,
                transaction_id: id,
                display_name: display_name.trim()
            });

        } catch (error) {
            console.error('[ALIASES] Error updating display_name:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update display name'
            });
        }
    });
}

module.exports = {
    registerRoutes
};
