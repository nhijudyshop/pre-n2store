/**
 * =====================================================
 * API V2 - BALANCE HISTORY ROUTES
 * =====================================================
 *
 * Bank transaction linking endpoints
 *
 * Routes:
 *   GET    /              - List unlinked transactions
 *   GET    /pending       - Get pending customer matches
 *   POST   /:id/link      - Link transaction to customer
 *   POST   /webhook/sepay - SePay webhook (redirect to main handler)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');
const { searchCustomerByPhone } = require('../../services/tpos-customer-service');
const { getOrCreateCustomerFromTPOS } = require('../../services/customer-creation-service');
const { processDeposit } = require('../../services/wallet-event-processor');
const adminSettingsService = require('../../services/admin-settings-service');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[BalanceHistory V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/balance-history
 * List unlinked bank transactions (balance_history without linked customer)
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 20, linked, wallet_processed } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        // Build query based on filters
        let whereClause = '';
        if (linked === 'true') {
            whereClause = 'WHERE bh.linked_customer_phone IS NOT NULL';
        } else if (linked === 'false') {
            whereClause = `
                WHERE bh.linked_customer_phone IS NULL
                  AND bh.transfer_amount > 0
                  AND bh.transfer_type = 'in'
            `;
        } else if (wallet_processed === 'false') {
            // NEW: Transactions linked but wallet not processed
            whereClause = `
                WHERE bh.linked_customer_phone IS NOT NULL
                  AND (bh.wallet_processed = FALSE OR bh.wallet_processed IS NULL)
                  AND bh.transfer_amount > 0
                  AND bh.transfer_type = 'in'
            `;
        } else if (linked === undefined && wallet_processed === undefined) {
            // Default: unlinked
            whereClause = `
                WHERE bh.linked_customer_phone IS NULL
                  AND bh.transfer_amount > 0
                  AND bh.transfer_type = 'in'
            `;
        }

        // Get total count
        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM balance_history bh ${whereClause}
        `);
        const total = parseInt(countResult.rows[0].total);

        // Get transactions with pagination
        const result = await db.query(`
            SELECT
                bh.id,
                bh.sepay_id,
                bh.code as transaction_code,
                bh.content,
                bh.transfer_amount as amount,
                bh.description,
                bh.transaction_date,
                bh.account_number as bank_account,
                bh.reference_code,
                bh.linked_customer_phone,
                bh.customer_id,
                bh.wallet_processed,
                bh.created_at,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            ${whereClause}
            ORDER BY bh.transaction_date DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), offset]);

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
        handleError(res, error, 'Failed to fetch transactions');
    }
});

/**
 * GET /api/v2/balance-history/pending
 * Get pending customer matches
 */
router.get('/pending', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 20 } = req.query;

    try {
        // Get total count
        const countResult = await db.query('SELECT COUNT(*) as total FROM pending_customer_matches');
        const total = parseInt(countResult.rows[0].total);

        // Get pending matches
        const result = await db.query(`
            SELECT
                pcm.*,
                bh.transfer_amount as amount,
                bh.content as transaction_content,
                bh.transaction_date
            FROM pending_customer_matches pcm
            LEFT JOIN balance_history bh ON pcm.balance_history_id = bh.id
            ORDER BY pcm.created_at DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

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
        handleError(res, error, 'Failed to fetch pending matches');
    }
});

/**
 * POST /api/v2/balance-history/:id/link
 * Link a balance_history transaction to a customer
 * NEW: Fetches TPOS data and creates customer with full info
 */
router.post('/:id/link', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { phone, customer_name, auto_deposit = true } = req.body; // Default auto_deposit to true

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone is required' });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // SECURITY: Block re-linking if transaction already credited to wallet
        // This prevents fraud where one transaction is used to credit multiple wallets
        if (tx.wallet_processed === true) {
            await db.query('ROLLBACK');
            console.log(`[SECURITY] Blocked link for tx ${id} - already credited to wallet of ${tx.linked_customer_phone}`);
            return res.status(400).json({
                success: false,
                error: 'Không thể link lại - Giao dịch đã được cộng vào ví khách hàng',
                current_linked_to: tx.linked_customer_phone,
                wallet_processed: true
            });
        }

        // Check if already linked
        if (tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Transaction already linked',
                linked_to: tx.linked_customer_phone
            });
        }

        // 2. NEW: Fetch TPOS data for customer creation
        let tposData = null;
        let customerName = customer_name;

        try {
            const tposResult = await searchCustomerByPhone(normalizedPhone);
            if (tposResult.success && tposResult.customer) {
                tposData = tposResult.customer;
                customerName = tposData.name || customerName || tx.content;
                console.log(`[BalanceHistory V2] Got TPOS data: ${tposData.name} (ID: ${tposData.id})`);
            }
        } catch (e) {
            console.log('[BalanceHistory V2] TPOS fetch failed, using provided name:', e.message);
        }

        // If no TPOS data and customer_name provided, use it
        if (!tposData && customerName) {
            tposData = { name: customerName };
        }

        // 3. Create/update customer with full TPOS data
        const customerResult = await getOrCreateCustomerFromTPOS(db, normalizedPhone, tposData);
        const customerId = customerResult.customerId;
        console.log(`[BalanceHistory V2] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}`);

        // 4. Link transaction to customer
        // Set verification_status = 'PENDING_VERIFICATION' for manual entries
        // This requires accountant approval before wallet is credited
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = $1,
                customer_id = $2,
                match_method = 'manual_entry',
                verification_status = 'PENDING_VERIFICATION',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [normalizedPhone, customerId, id]);

        // 5. Manual entries require accountant approval - DO NOT auto deposit
        // The wallet will be credited when accountant calls /approve endpoint
        let depositResult = {
            deposited: false,
            requires_approval: true,
            message: 'Giao dịch nhập tay cần kế toán duyệt trước khi nạp ví'
        };

        console.log(`[BalanceHistory V2] ⏳ Transaction ${id} linked with PENDING_VERIFICATION - awaiting accountant approval`);

        // Remove from pending matches if exists
        await db.query('DELETE FROM pending_customer_matches WHERE balance_history_id = $1', [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã liên kết giao dịch với khách hàng',
            data: {
                transaction_id: id,
                customer_id: customerId,
                customer_name: customerResult.customerName || customerName,
                phone: normalizedPhone,
                tpos_id: tposData?.id || null,
                deposit: depositResult
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to link transaction');
    }
});

/**
 * POST /api/v2/balance-history/:id/reprocess-wallet
 * Reprocess wallet for linked transactions that failed wallet processing
 * Use case: Transaction was linked but wallet deposit failed
 */
router.post('/:id/reprocess-wallet', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        await db.query('BEGIN');

        // 1. Get transaction and verify it's linked but not wallet processed
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        if (!tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Transaction is not linked to any customer. Use /link first.' });
        }

        if (tx.wallet_processed === true) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Wallet already processed for this transaction' });
        }

        if (tx.transfer_amount <= 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Transaction amount must be greater than 0' });
        }

        // 2. Process wallet deposit
        const walletResult = await processDeposit(
            db,
            tx.linked_customer_phone,
            tx.transfer_amount,
            id,
            `Nạp từ CK ${tx.code || tx.reference_code} (reprocess)`,
            tx.customer_id
        );

        // 3. Mark as wallet processed
        await db.query(`
            UPDATE balance_history
            SET wallet_processed = TRUE
            WHERE id = $1
        `, [id]);

        // 4. Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'WALLET_DEPOSIT', $3, $4, 'balance_history', $5, 'university', 'green')
        `, [
            tx.linked_customer_phone,
            tx.customer_id,
            `Nạp tiền: ${parseFloat(tx.transfer_amount).toLocaleString()}đ`,
            `Chuyển khoản ngân hàng (${tx.code || tx.reference_code}) - reprocess`,
            id
        ]);

        await db.query('COMMIT');

        console.log(`[BalanceHistory V2] ✅ Reprocessed wallet: ${tx.linked_customer_phone} +${tx.transfer_amount}`);

        res.json({
            success: true,
            message: 'Đã cộng tiền vào ví thành công',
            data: {
                transaction_id: id,
                phone: tx.linked_customer_phone,
                amount: parseFloat(tx.transfer_amount),
                wallet_tx_id: walletResult.transactionId,
                new_balance: walletResult.wallet.balance
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to reprocess wallet');
    }
});

/**
 * POST /api/v2/balance-history/:id/unlink
 * Unlink a transaction from customer (for corrections)
 */
router.post('/:id/unlink', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        await db.query('BEGIN');

        // Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // SECURITY: Block unlink for wallet-processed transactions
        // Unlink would allow re-linking and double-crediting
        if (tx.wallet_processed === true) {
            await db.query('ROLLBACK');
            console.log(`[SECURITY] Blocked unlink for tx ${id} - already credited to wallet of ${tx.linked_customer_phone}`);
            return res.status(400).json({
                success: false,
                error: 'Không thể hủy liên kết - Giao dịch đã được cộng vào ví khách hàng',
                wallet_processed: true,
                linked_customer_phone: tx.linked_customer_phone,
                suggestion: 'Sử dụng chức năng "Điều chỉnh công nợ" để hoàn tiền nếu cần'
            });
        }

        if (!tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Transaction is not linked to any customer' });
        }

        // If wallet was processed, need to reverse the deposit
        if (tx.wallet_processed && tx.transfer_amount > 0) {
            await db.query(`
                UPDATE customer_wallets
                SET balance = balance - $2, total_deposited = total_deposited - $2, updated_at = NOW()
                WHERE phone = $1
            `, [tx.linked_customer_phone, tx.transfer_amount]);

            // Log reversal transaction
            await db.query(`
                INSERT INTO wallet_transactions (
                    phone, type, amount, source, reference_type, reference_id, note
                )
                VALUES ($1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'balance_history', $3, $4)
            `, [
                tx.linked_customer_phone, -tx.transfer_amount, id,
                `Hoàn tác liên kết giao dịch ${tx.code || tx.reference_code}`
            ]);
        }

        // Unlink transaction
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = NULL,
                customer_id = NULL,
                wallet_processed = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã hủy liên kết giao dịch',
            data: {
                transaction_id: id,
                previous_phone: tx.linked_customer_phone,
                reversed_amount: tx.wallet_processed ? tx.transfer_amount : 0
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to unlink transaction');
    }
});

/**
 * GET /api/v2/balance-history/stats
 * Get balance history statistics
 */
router.get('/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query(`
            SELECT
                COUNT(*) as total_transactions,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NOT NULL) as linked_count,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NULL AND transfer_type = 'in') as unlinked_count,
                COUNT(*) FILTER (WHERE wallet_processed = TRUE) as processed_to_wallet,
                COUNT(*) FILTER (WHERE verification_status = 'PENDING_VERIFICATION') as pending_verification,
                COUNT(*) FILTER (WHERE verification_status = 'PENDING') as pending,
                COUNT(*) FILTER (WHERE verification_status = 'AUTO_APPROVED') as auto_approved,
                COUNT(*) FILTER (WHERE verification_status = 'APPROVED') as manually_approved,
                COUNT(*) FILTER (WHERE verification_status = 'REJECTED') as rejected,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'in'), 0) as total_in,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'out'), 0) as total_out,
                COALESCE(SUM(transfer_amount) FILTER (WHERE wallet_processed = TRUE), 0) as total_processed_to_wallet
            FROM balance_history
        `);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch balance history stats');
    }
});

// =====================================================
// VERIFICATION WORKFLOW ENDPOINTS
// =====================================================

/**
 * GET /api/v2/balance-history/verification-queue
 * Get transactions pending accountant verification
 * Only for Admin/Accountant roles
 * Supports filters: startDate, endDate, search (content/amount), status
 */
router.get('/verification-queue', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 20, status = 'PENDING_VERIFICATION', startDate, endDate, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const queryParams = [];
        let paramCount = 1;

        // Base status filter
        let whereConditions = [];
        if (status === 'all') {
            whereConditions.push("verification_status IN ('PENDING', 'PENDING_VERIFICATION')");
        } else if (status === 'PENDING') {
            whereConditions.push("verification_status = 'PENDING'");
        } else {
            whereConditions.push("verification_status = 'PENDING_VERIFICATION'");
        }

        whereConditions.push("transfer_type = 'in'");

        // Date filter
        if (startDate && endDate) {
            whereConditions.push(`bh.transaction_date >= $${paramCount++}`);
            queryParams.push(startDate);
            whereConditions.push(`bh.transaction_date <= $${paramCount++}`);
            queryParams.push(`${endDate} 23:59:59`);
        }

        // Search filter
        if (search) {
            whereConditions.push(`(bh.content ILIKE $${paramCount} OR bh.transfer_amount::text ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR bh.linked_customer_phone ILIKE $${paramCount})`);
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            ${whereClause}
        `;
        const countResult = await db.query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Get transactions
        // Add limit and offset to params
        queryParams.push(parseInt(limit));
        queryParams.push(offset);

        const dataQuery = `
            SELECT
                bh.id,
                bh.sepay_id,
                bh.code as transaction_code,
                bh.content,
                bh.transfer_amount as amount,
                bh.transaction_date,
                bh.account_number as bank_account,
                bh.gateway,
                bh.reference_code,
                bh.linked_customer_phone,
                bh.customer_id,
                bh.wallet_processed,
                bh.verification_status,
                bh.match_method,
                bh.verification_note,
                bh.staff_note,
                bh.created_at,
                c.name as customer_name,
                pcm.matched_customers,
                pcm.extracted_phone
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            LEFT JOIN pending_customer_matches pcm ON pcm.transaction_id = bh.id
            ${whereClause}
            ORDER BY bh.transaction_date DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        const result = await db.query(dataQuery, queryParams);

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
        handleError(res, error, 'Failed to fetch verification queue');
    }
});

/**
 * POST /api/v2/balance-history/:id/approve
 * Accountant approves a pending verification transaction
 * This will process wallet deposit
 */
router.post('/:id/approve', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { verified_by, note, verification_image_url } = req.body;

    if (!verified_by) {
        return res.status(400).json({ success: false, error: 'verified_by is required' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction and verify it's pending verification
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // Check if it's pending verification
        if (tx.verification_status !== 'PENDING_VERIFICATION' && tx.verification_status !== 'PENDING') {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Transaction is not pending verification. Current status: ${tx.verification_status}`
            });
        }

        // Check if customer is linked
        if (!tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Transaction is not linked to any customer. Link customer first.'
            });
        }

        // 2. Update verification status to APPROVED (with optional image URL)
        // Build update query dynamically to handle optional image URL
        let updateQuery = `
            UPDATE balance_history
            SET verification_status = 'APPROVED',
                verified_by = $2,
                verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                verification_note = COALESCE($3, verification_note)
        `;
        let updateParams = [id, verified_by, note];

        // Only add image URL column if provided (requires DB column to exist)
        if (verification_image_url) {
            updateQuery = `
                UPDATE balance_history
                SET verification_status = 'APPROVED',
                    verified_by = $2,
                    verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                    verification_note = COALESCE($3, verification_note),
                    verification_image_url = $4
                WHERE id = $1
            `;
            updateParams = [id, verified_by, note, verification_image_url];
        } else {
            updateQuery += ` WHERE id = $1`;
        }

        await db.query(updateQuery, updateParams);

        // 3. Process wallet deposit if not already processed
        let walletResult = null;
        if (!tx.wallet_processed && tx.transfer_amount > 0) {
            try {
                walletResult = await processDeposit(
                    db,
                    tx.linked_customer_phone,
                    tx.transfer_amount,
                    id,
                    `Nạp từ CK (Approved by ${verified_by})`,
                    tx.customer_id
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
                    tx.linked_customer_phone,
                    tx.customer_id,
                    `Nạp tiền: ${parseFloat(tx.transfer_amount).toLocaleString()}đ`,
                    `Chuyển khoản ngân hàng (${tx.code || tx.reference_code}) - Approved by ${verified_by}`,
                    id
                ]);

                console.log(`[BalanceHistory V2] ✅ Approved & wallet updated: ${tx.linked_customer_phone} +${tx.transfer_amount}`);
            } catch (walletErr) {
                console.error('[BalanceHistory V2] Wallet update failed:', walletErr.message);
                // Don't rollback - approval is more important, wallet can be retried
            }
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã duyệt và cộng tiền vào ví thành công',
            data: {
                transaction_id: id,
                phone: tx.linked_customer_phone,
                amount: parseFloat(tx.transfer_amount),
                verification_status: 'APPROVED',
                verified_by,
                wallet_processed: !!walletResult,
                new_balance: walletResult?.wallet?.balance
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to approve transaction');
    }
});

/**
 * POST /api/v2/balance-history/:id/reject
 * Accountant rejects a pending verification transaction
 * Transaction will NOT be processed to wallet
 */
router.post('/:id/reject', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { verified_by, reason } = req.body;

    if (!verified_by) {
        return res.status(400).json({ success: false, error: 'verified_by is required' });
    }

    if (!reason) {
        return res.status(400).json({ success: false, error: 'reason is required for rejection' });
    }

    try {
        await db.query('BEGIN');

        // Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // Check if it's pending verification
        if (tx.verification_status !== 'PENDING_VERIFICATION' && tx.verification_status !== 'PENDING') {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Transaction is not pending verification. Current status: ${tx.verification_status}`
            });
        }

        // Update verification status to REJECTED
        await db.query(`
            UPDATE balance_history
            SET verification_status = 'REJECTED',
                verified_by = $2,
                verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                verification_note = $3
            WHERE id = $1
        `, [id, verified_by, `REJECTED: ${reason}`]);

        // Also update pending_customer_matches if exists
        await db.query(`
            UPDATE pending_customer_matches
            SET status = 'rejected'
            WHERE transaction_id = $1
        `, [id]);

        await db.query('COMMIT');

        console.log(`[BalanceHistory V2] ❌ Rejected transaction ${id} by ${verified_by}: ${reason}`);

        res.json({
            success: true,
            message: 'Đã từ chối giao dịch',
            data: {
                transaction_id: id,
                verification_status: 'REJECTED',
                verified_by,
                reason
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to reject transaction');
    }
});

/**
 * POST /api/v2/balance-history/:id/resolve-match
 * Staff selects a customer from dropdown (pending_match)
 * This sets PENDING_VERIFICATION - requires accountant approval
 */
router.post('/:id/resolve-match', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { phone, performed_by, note } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone is required' });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // SECURITY: Block if already wallet processed
        // This prevents changing customer after wallet has been credited
        if (tx.wallet_processed === true) {
            await db.query('ROLLBACK');
            console.log(`[SECURITY] Blocked resolve-match for tx ${id} - already credited to wallet of ${tx.linked_customer_phone}`);
            return res.status(400).json({
                success: false,
                error: 'Không thể chọn lại - Giao dịch đã được cộng vào ví',
                wallet_processed: true,
                current_phone: tx.linked_customer_phone
            });
        }

        // Check if already resolved
        if (tx.linked_customer_phone && tx.verification_status === 'APPROVED') {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Transaction already resolved and approved',
                linked_to: tx.linked_customer_phone
            });
        }

        // 2. Fetch TPOS data for customer creation
        let tposData = null;
        let customerName = null;

        try {
            const tposResult = await searchCustomerByPhone(normalizedPhone);
            if (tposResult.success && tposResult.customer) {
                tposData = tposResult.customer;
                customerName = tposData.name;
            }
        } catch (e) {
            console.log('[BalanceHistory V2] TPOS fetch failed:', e.message);
        }

        if (!tposData) {
            tposData = { name: customerName || 'Unknown' };
        }

        // 3. Create/update customer
        const customerResult = await getOrCreateCustomerFromTPOS(db, normalizedPhone, tposData);
        const customerId = customerResult.customerId;

        // 4. Link transaction and set PENDING_VERIFICATION (needs accountant approval)
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = $2,
                customer_id = $3,
                verification_status = 'PENDING_VERIFICATION',
                match_method = 'pending_match',
                verification_note = $4
            WHERE id = $1
        `, [id, normalizedPhone, customerId, `NV chọn: ${performed_by || 'Unknown'} - ${note || ''}`]);

        // 5. Update pending_customer_matches
        await db.query(`
            UPDATE pending_customer_matches
            SET status = 'resolved',
                selected_customer = $2,
                resolved_at = CURRENT_TIMESTAMP,
                resolved_by = $3
            WHERE transaction_id = $1
        `, [id, JSON.stringify({ phone: normalizedPhone, name: customerName, id: customerId }), performed_by]);

        await db.query('COMMIT');

        console.log(`[BalanceHistory V2] ✅ Resolved match for ${id} to ${normalizedPhone}, awaiting accountant approval`);

        res.json({
            success: true,
            message: 'Đã chọn khách hàng, chờ kế toán duyệt',
            data: {
                transaction_id: id,
                phone: normalizedPhone,
                customer_id: customerId,
                customer_name: customerName || customerResult.customerName,
                verification_status: 'PENDING_VERIFICATION',
                note: 'Chờ kế toán duyệt để cộng tiền vào ví'
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to resolve match');
    }
});

// =====================================================
// ACCOUNTANT MODULE ENDPOINTS
// =====================================================

/**
 * GET /api/v2/balance-history/accountant/stats
 * Dashboard stats for accountant tab
 */
router.get('/accountant/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Parallel queries for stats
        const [pendingResult, pendingOverdueResult, approvedTodayResult, rejectedTodayResult, adjustmentsTodayResult] = await Promise.all([
            // Pending verification count
            db.query(`
                SELECT COUNT(*) as count
                FROM balance_history
                WHERE verification_status = 'PENDING_VERIFICATION'
                  AND transfer_type = 'in'
            `),
            // Pending > 24h count
            db.query(`
                SELECT COUNT(*) as count
                FROM balance_history
                WHERE verification_status = 'PENDING_VERIFICATION'
                  AND transfer_type = 'in'
                  AND created_at < NOW() - INTERVAL '24 hours'
            `),
            // Approved today count
            db.query(`
                SELECT COUNT(*) as count
                FROM balance_history
                WHERE verification_status = 'APPROVED'
                  AND transfer_type = 'in'
                  AND verified_at >= $1
                  AND verified_at < $2
            `, [today, tomorrow]),
            // Rejected today count
            db.query(`
                SELECT COUNT(*) as count
                FROM balance_history
                WHERE verification_status = 'REJECTED'
                  AND transfer_type = 'in'
                  AND verified_at >= $1
                  AND verified_at < $2
            `, [today, tomorrow]),
            // Manual adjustments today count
            db.query(`
                SELECT COUNT(*) as count
                FROM wallet_transactions
                WHERE type = 'MANUAL_ADJUSTMENT'
                  AND created_at >= $1
                  AND created_at < $2
            `, [today, tomorrow])
        ]);

        res.json({
            success: true,
            stats: {
                pending: parseInt(pendingResult.rows[0].count),
                pendingOverdue: parseInt(pendingOverdueResult.rows[0].count),
                approvedToday: parseInt(approvedTodayResult.rows[0].count),
                rejectedToday: parseInt(rejectedTodayResult.rows[0].count),
                adjustmentsToday: parseInt(adjustmentsTodayResult.rows[0].count)
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to fetch accountant stats');
    }
});

/**
 * GET /api/v2/balance-history/approved-today
 * Get transactions approved within a date range (default: today)
 * Supports filters: startDate, endDate, search, date (legacy)
 */
router.get('/approved-today', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { date, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const queryParams = [];
        let paramCount = 1;

        let whereConditions = [];
        whereConditions.push("bh.verification_status = 'APPROVED'");
        whereConditions.push("bh.transfer_type = 'in'");

        // Date range
        let targetStart, targetEnd;

        if (startDate && endDate) {
            // Custom range
            targetStart = new Date(startDate);
            targetStart.setHours(0, 0, 0, 0);
            targetEnd = new Date(endDate);
            targetEnd.setHours(23, 59, 59, 999);
        } else if (date) {
            // Single date (legacy support)
            targetStart = new Date(date);
            targetStart.setHours(0, 0, 0, 0);
            targetEnd = new Date(targetStart);
            targetEnd.setDate(targetEnd.getDate() + 1);
        } else {
            // Default: Both unset -> Default to today? 
            // Or if explicit filtering is not requested, maybe last 30 days is safer?
            // Existing logic defaulted to today. Let's keep today default if no date param is present.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            targetStart = today;
            targetEnd = new Date(today);
            targetEnd.setDate(targetEnd.getDate() + 1);
        }

        whereConditions.push(`bh.verified_at >= $${paramCount++}`);
        queryParams.push(targetStart);
        whereConditions.push(`bh.verified_at < $${paramCount++}`);
        queryParams.push(targetEnd);

        // Search filter
        if (search) {
            whereConditions.push(`(bh.content ILIKE $${paramCount} OR bh.transfer_amount::text ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR bh.linked_customer_phone ILIKE $${paramCount} OR bh.verified_by ILIKE $${paramCount})`);
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            ${whereClause}
        `;
        const countResult = await db.query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Get transactions
        // Try with verification_image_url column first, fall back if column doesn't exist
        queryParams.push(parseInt(limit));
        queryParams.push(offset);

        let dataQuery = `
            SELECT
                bh.id,
                bh.content,
                bh.transfer_amount as amount,
                bh.transaction_date,
                bh.linked_customer_phone,
                bh.verified_at,
                bh.verified_by,
                bh.verification_note,
                bh.verification_image_url,
                bh.match_method,
                bh.manager_reviewed,
                bh.manager_review_note,
                bh.reviewed_by,
                bh.reviewed_at,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            ${whereClause}
            ORDER BY bh.verified_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        let result;
        try {
            result = await db.query(dataQuery, queryParams);
        } catch (queryError) {
            // If verification_image_url column doesn't exist, retry without it
            if (queryError.message.includes('verification_image_url')) {
                console.log('[BalanceHistory V2] Column verification_image_url not found, retrying without it');
                paramCount = paramCount - 2; // Reset paramCount
                dataQuery = `
                    SELECT
                        bh.id,
                        bh.content,
                        bh.transfer_amount as amount,
                        bh.transaction_date,
                        bh.linked_customer_phone,
                        bh.verified_at,
                        bh.verified_by,
                        bh.verification_note,
                        bh.match_method,
                        bh.manager_reviewed,
                        bh.manager_review_note,
                        bh.reviewed_by,
                        bh.reviewed_at,
                        c.name as customer_name
                    FROM balance_history bh
                    LEFT JOIN customers c ON bh.customer_id = c.id
                    ${whereClause}
                    ORDER BY bh.verified_at DESC
                    LIMIT $${paramCount++} OFFSET $${paramCount++}
                `;
                result = await db.query(dataQuery, queryParams);
            } else {
                throw queryError;
            }
        }

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
        handleError(res, error, 'Failed to fetch approved transactions');
    }
});

/**
 * POST /api/v2/balance-history/bulk-approve
 * Bulk approve multiple transactions
 */
router.post('/bulk-approve', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { transaction_ids, verified_by } = req.body;

    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'transaction_ids array is required' });
    }

    if (!verified_by) {
        return res.status(400).json({ success: false, error: 'verified_by is required' });
    }

    try {
        await db.query('BEGIN');

        let approved = 0;
        let failed = 0;
        const results = [];

        for (const txId of transaction_ids) {
            try {
                // Get transaction
                const txResult = await db.query(
                    'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
                    [parseInt(txId)]
                );

                if (txResult.rows.length === 0) {
                    results.push({ id: txId, success: false, error: 'Not found' });
                    failed++;
                    continue;
                }

                const tx = txResult.rows[0];

                // Skip if already processed
                if (tx.wallet_processed === true) {
                    results.push({ id: txId, success: false, error: 'Already processed' });
                    failed++;
                    continue;
                }

                // Skip if not pending verification
                if (tx.verification_status !== 'PENDING_VERIFICATION' && tx.verification_status !== 'PENDING') {
                    results.push({ id: txId, success: false, error: `Status: ${tx.verification_status}` });
                    failed++;
                    continue;
                }

                // Skip if no customer linked
                if (!tx.linked_customer_phone) {
                    results.push({ id: txId, success: false, error: 'No customer linked' });
                    failed++;
                    continue;
                }

                // Process wallet deposit
                const walletResult = await processDeposit(
                    db,
                    tx.linked_customer_phone,
                    tx.transfer_amount,
                    txId,
                    `Nạp từ CK ${tx.code || tx.reference_code} (bulk approve)`,
                    tx.customer_id
                );

                // Update transaction
                await db.query(`
                    UPDATE balance_history
                    SET verification_status = 'APPROVED',
                        verified_by = $2,
                        verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                        wallet_processed = TRUE,
                        verification_note = 'Bulk approved'
                    WHERE id = $1
                `, [txId, verified_by]);

                results.push({
                    id: txId,
                    success: true,
                    amount: parseFloat(tx.transfer_amount),
                    new_balance: walletResult.wallet.balance
                });
                approved++;

            } catch (txError) {
                console.error(`[BULK APPROVE] Error processing tx ${txId}:`, txError.message);
                results.push({ id: txId, success: false, error: txError.message });
                failed++;
            }
        }

        await db.query('COMMIT');

        console.log(`[BULK APPROVE] Approved ${approved}, Failed ${failed} by ${verified_by}`);

        res.json({
            success: true,
            approved,
            failed,
            total: transaction_ids.length,
            results
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to bulk approve');
    }
});

/**
 * GET /api/v2/wallet/balance
 * Get wallet balance for a phone number
 */
router.get('/wallet/balance', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone is required' });
    }

    const normalizedPhone = normalizePhone(phone);

    try {
        const result = await db.query(
            'SELECT balance FROM customer_wallets WHERE phone = $1',
            [normalizedPhone]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                balance: 0,
                exists: false
            });
        }

        res.json({
            success: true,
            balance: parseFloat(result.rows[0].balance),
            exists: true
        });

    } catch (error) {
        handleError(res, error, 'Failed to fetch balance');
    }
});

// =====================================================
// AUTO-APPROVE SETTINGS ENDPOINTS
// =====================================================

/**
 * GET /api/v2/balance-history/settings/auto-approve
 * Get current auto-approve setting
 * When enabled: QR/exact phone/single match transactions are auto-approved with wallet credit
 * When disabled: All matches require accountant approval before wallet credit
 */
router.get('/settings/auto-approve', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const enabled = await adminSettingsService.isAutoApproveEnabled(db);
        res.json({
            success: true,
            enabled,
            description: enabled
                ? 'Đang BẬT - GD QR/SĐT chính xác/1 KH khớp tự động cộng ví'
                : 'Đang TẮT - Tất cả GD cần kế toán duyệt trước khi cộng ví'
        });
    } catch (error) {
        handleError(res, error, 'Failed to get auto-approve setting');
    }
});

/**
 * PUT /api/v2/balance-history/settings/auto-approve
 * Update auto-approve setting
 * Requires: toggleAutoApprove permission (checked on frontend)
 */
router.put('/settings/auto-approve', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { enabled, updated_by } = req.body;

    // Validate input
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'enabled must be boolean'
        });
    }

    if (!updated_by) {
        return res.status(400).json({
            success: false,
            error: 'updated_by is required'
        });
    }

    try {
        await adminSettingsService.setSetting(
            db,
            'auto_approve_enabled',
            String(enabled),
            updated_by
        );

        console.log(`[SETTINGS] auto_approve_enabled set to ${enabled} by ${updated_by}`);

        res.json({
            success: true,
            enabled,
            message: enabled
                ? 'Đã BẬT tự động duyệt - GD QR/SĐT chính xác sẽ tự cộng ví'
                : 'Đã TẮT tự động duyệt - Tất cả GD cần kế toán duyệt'
        });
    } catch (error) {
        handleError(res, error, 'Failed to update auto-approve setting');
    }
});

// =====================================================
// MANAGER REVIEW ENDPOINTS - Quản lý kiểm tra lần cuối
// =====================================================

/**
 * POST /api/v2/balance-history/:id/manager-review
 * Manager marks a transaction as reviewed with optional notes
 * Used for final verification by management
 */
router.post('/:id/manager-review', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { manager_review_note, reviewed_by } = req.body;

    if (!reviewed_by) {
        return res.status(400).json({ success: false, error: 'reviewed_by is required' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction and verify it exists and is approved
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // Only allow review on approved transactions
        if (tx.verification_status !== 'APPROVED') {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Chỉ có thể kiểm tra giao dịch đã được duyệt. Trạng thái hiện tại: ${tx.verification_status}`
            });
        }

        // Check if already reviewed
        if (tx.manager_reviewed) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Giao dịch này đã được kiểm tra trước đó',
                reviewed_by: tx.reviewed_by,
                reviewed_at: tx.reviewed_at
            });
        }

        // 2. Update transaction with manager review info
        // Append manager note to verification_note with marker for frontend styling
        const managerNoteText = manager_review_note ? `\n[QL: ${manager_review_note}]` : '\n[QL: Đã kiểm tra]';

        await db.query(`
            UPDATE balance_history
            SET manager_reviewed = TRUE,
                manager_review_note = $2,
                reviewed_by = $3,
                reviewed_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                verification_note = COALESCE(verification_note, '') || $4
            WHERE id = $1
        `, [id, manager_review_note || '', reviewed_by, managerNoteText]);

        await db.query('COMMIT');

        console.log(`[MANAGER REVIEW] Transaction ${id} reviewed by ${reviewed_by}`);

        res.json({
            success: true,
            message: 'Đã kiểm tra giao dịch thành công',
            data: {
                id: parseInt(id),
                manager_reviewed: true,
                manager_review_note: manager_review_note || '',
                reviewed_by,
                reviewed_at: new Date().toISOString()
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to mark transaction as reviewed');
    }
});

// =====================================================
// ADJUSTMENT ENDPOINTS - Điều chỉnh giao dịch đã duyệt
// =====================================================

/**
 * GET /api/v2/balance-history/:id/can-adjust
 * Kiểm tra giao dịch có thể điều chỉnh không
 *
 * Quy tắc nghiêm ngặt:
 * - GD phải đã cộng ví (wallet_processed = TRUE)
 * - KH CHƯA sử dụng công nợ (số dư >= số tiền deposit)
 * - Không có WITHDRAW sau khi deposit
 *
 * Response:
 * - canAdjust: boolean
 * - reason: string (nếu không thể điều chỉnh)
 * - transaction: thông tin GD gốc
 * - wallet: thông tin ví KH
 */
router.get('/:id/can-adjust', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        // 1. Lấy thông tin giao dịch
        const txResult = await db.query(`
            SELECT
                bh.id,
                bh.transfer_amount,
                bh.linked_customer_phone,
                bh.customer_id,
                bh.wallet_processed,
                bh.verification_status,
                bh.verified_at,
                bh.verified_by,
                bh.content,
                bh.code as transaction_code,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            WHERE bh.id = $1
        `, [id]);

        if (txResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy giao dịch'
            });
        }

        const tx = txResult.rows[0];

        // 2. Kiểm tra GD đã cộng ví chưa
        if (!tx.wallet_processed) {
            return res.json({
                success: true,
                canAdjust: false,
                reason: 'Giao dịch chưa được cộng vào ví, không cần điều chỉnh',
                transaction: tx
            });
        }

        // 3. Kiểm tra có SĐT KH không
        if (!tx.linked_customer_phone) {
            return res.json({
                success: true,
                canAdjust: false,
                reason: 'Giao dịch không có thông tin khách hàng',
                transaction: tx
            });
        }

        // 4. Lấy số dư ví KH
        const walletResult = await db.query(`
            SELECT balance, virtual_balance
            FROM customer_wallets
            WHERE phone = $1
        `, [tx.linked_customer_phone]);

        const wallet = walletResult.rows[0] || { balance: 0, virtual_balance: 0 };
        const currentBalance = parseFloat(wallet.balance || 0);
        const depositedAmount = parseFloat(tx.transfer_amount);

        // 5. Kiểm tra có giao dịch WITHDRAW sau deposit không
        const withdrawResult = await db.query(`
            SELECT COUNT(*) as count
            FROM wallet_transactions
            WHERE phone = $1
            AND type IN ('WITHDRAW', 'ORDER_PAYMENT', 'VIRTUAL_DEBIT')
            AND created_at > $2
        `, [tx.linked_customer_phone, tx.verified_at]);

        const hasWithdrawals = parseInt(withdrawResult.rows[0].count) > 0;

        // 6. Kiểm tra đã có adjustment cho GD này chưa
        const adjResult = await db.query(`
            SELECT COUNT(*) as count
            FROM wallet_adjustments
            WHERE original_transaction_id = $1
        `, [id]);

        const hasAdjustment = parseInt(adjResult.rows[0].count) > 0;

        // 7. Xác định có thể điều chỉnh không
        let canAdjust = true;
        let reason = '';
        let usedAmount = 0;

        if (hasWithdrawals) {
            canAdjust = false;
            reason = 'Khách hàng đã có giao dịch rút/thanh toán sau khi nạp tiền. Liên hệ Admin để cộng/trừ riêng lẻ.';
        } else if (currentBalance < depositedAmount) {
            canAdjust = false;
            usedAmount = depositedAmount - currentBalance;
            reason = `Khách hàng đã sử dụng ${usedAmount.toLocaleString()}đ công nợ. Không thể điều chỉnh. Liên hệ Admin để cộng/trừ riêng lẻ.`;
        } else if (hasAdjustment) {
            canAdjust = false;
            reason = 'Giao dịch này đã được điều chỉnh trước đó.';
        }

        res.json({
            success: true,
            canAdjust,
            reason,
            transaction: {
                id: tx.id,
                amount: depositedAmount,
                phone: tx.linked_customer_phone,
                customer_name: tx.customer_name,
                verified_at: tx.verified_at,
                verified_by: tx.verified_by,
                transaction_code: tx.transaction_code,
                content: tx.content
            },
            wallet: {
                current_balance: currentBalance,
                deposited_amount: depositedAmount,
                used_amount: usedAmount,
                can_withdraw: currentBalance
            },
            hasWithdrawals,
            hasAdjustment
        });

    } catch (error) {
        handleError(res, error, 'Failed to check adjustment eligibility');
    }
});

/**
 * POST /api/v2/balance-history/:id/adjust
 * Tạo điều chỉnh cho giao dịch đã duyệt
 *
 * Body:
 * - adjustment_type: 'debit_only' | 'transfer_to_correct' | 'amount_correction'
 * - correct_customer_phone: SĐT KH đúng (nếu transfer_to_correct)
 * - amount: số tiền điều chỉnh (mặc định = số tiền GD gốc)
 * - reason: lý do điều chỉnh (bắt buộc, min 10 ký tự)
 * - performed_by: email người thực hiện
 */
router.post('/:id/adjust', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const {
        adjustment_type,
        correct_customer_phone,
        amount,
        reason,
        performed_by
    } = req.body;

    // Validate input
    if (!reason || reason.length < 10) {
        return res.status(400).json({
            success: false,
            error: 'Lý do điều chỉnh phải có ít nhất 10 ký tự'
        });
    }

    if (!performed_by) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu thông tin người thực hiện'
        });
    }

    const validTypes = ['debit_only', 'transfer_to_correct', 'amount_correction'];
    if (!validTypes.includes(adjustment_type)) {
        return res.status(400).json({
            success: false,
            error: `Loại điều chỉnh không hợp lệ. Cho phép: ${validTypes.join(', ')}`
        });
    }

    if (adjustment_type === 'transfer_to_correct' && !correct_customer_phone) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu SĐT khách hàng đúng'
        });
    }

    try {
        await db.query('BEGIN');

        // 1. Lấy thông tin GD và lock row
        const txResult = await db.query(`
            SELECT
                bh.id,
                bh.transfer_amount,
                bh.linked_customer_phone,
                bh.customer_id,
                bh.wallet_processed,
                bh.verified_at,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            WHERE bh.id = $1
            FOR UPDATE OF bh
        `, [id]);

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch' });
        }

        const tx = txResult.rows[0];

        // 2. Kiểm tra wallet_processed
        if (!tx.wallet_processed) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Giao dịch chưa được cộng vào ví, không thể điều chỉnh'
            });
        }

        // 3. Kiểm tra có thể điều chỉnh không (security check)
        const walletResult = await db.query(`
            SELECT balance FROM customer_wallets WHERE phone = $1 FOR UPDATE
        `, [tx.linked_customer_phone]);

        const currentBalance = parseFloat(walletResult.rows[0]?.balance || 0);
        const depositedAmount = parseFloat(tx.transfer_amount);
        const adjustAmount = amount ? parseFloat(amount) : depositedAmount;

        // 4. Kiểm tra có WITHDRAW sau deposit không
        const withdrawResult = await db.query(`
            SELECT COUNT(*) as count
            FROM wallet_transactions
            WHERE phone = $1
            AND type IN ('WITHDRAW', 'ORDER_PAYMENT', 'VIRTUAL_DEBIT')
            AND created_at > $2
        `, [tx.linked_customer_phone, tx.verified_at]);

        if (parseInt(withdrawResult.rows[0].count) > 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Khách hàng đã có giao dịch rút/thanh toán. Liên hệ Admin để điều chỉnh thủ công.'
            });
        }

        // 5. Kiểm tra số dư đủ để trừ
        if (currentBalance < adjustAmount) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Số dư không đủ để trừ. Số dư hiện tại: ${currentBalance.toLocaleString()}đ, cần trừ: ${adjustAmount.toLocaleString()}đ`
            });
        }

        // 6. Kiểm tra đã có adjustment chưa
        const existingAdj = await db.query(`
            SELECT id FROM wallet_adjustments WHERE original_transaction_id = $1
        `, [id]);

        if (existingAdj.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Giao dịch này đã được điều chỉnh trước đó'
            });
        }

        // 7. Thực hiện điều chỉnh
        const adjustments = [];
        const now = new Date();

        // 7a. Trừ ví KH sai
        const newBalance = currentBalance - adjustAmount;
        await db.query(`
            UPDATE customer_wallets
            SET balance = $1, updated_at = NOW()
            WHERE phone = $2
        `, [newBalance, tx.linked_customer_phone]);

        // Log wallet transaction (use valid type and source from CHECK constraints)
        await db.query(`
            INSERT INTO wallet_transactions (
                phone, wallet_id, type, amount,
                balance_before, balance_after,
                source, reference_type, reference_id, note
            )
            SELECT $1::text, id, 'ADJUSTMENT'::text, $2::numeric,
                   $3::numeric, $4::numeric,
                   'MANUAL_ADJUSTMENT'::text, 'balance_history'::text, $5::text, $6::text
            FROM customer_wallets WHERE phone = $1::text
        `, [
            tx.linked_customer_phone,
            -adjustAmount,  // Negative for debit
            currentBalance,
            newBalance,
            String(id),
            `Điều chỉnh trừ ví KH sai: ${reason}`
        ]);

        adjustments.push({
            type: 'DEBIT',
            phone: tx.linked_customer_phone,
            amount: -adjustAmount
        });

        // 7b. Nếu chuyển sang KH đúng
        if (adjustment_type === 'transfer_to_correct') {
            const normalizedCorrectPhone = normalizePhone(correct_customer_phone);

            // Lấy hoặc tạo KH đúng
            const correctCustomer = await getOrCreateCustomerFromTPOS(db, normalizedCorrectPhone);

            // Lấy ví KH đúng
            let correctWallet = await db.query(`
                SELECT id, balance FROM customer_wallets WHERE phone = $1 FOR UPDATE
            `, [normalizedCorrectPhone]);

            if (correctWallet.rows.length === 0) {
                // Tạo ví mới
                await db.query(`
                    INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
                    VALUES ($1, $2, 0, 0)
                `, [normalizedCorrectPhone, correctCustomer.id]);
                correctWallet = await db.query(`
                    SELECT id, balance FROM customer_wallets WHERE phone = $1
                `, [normalizedCorrectPhone]);
            }

            const correctCurrentBalance = parseFloat(correctWallet.rows[0].balance);
            const correctNewBalance = correctCurrentBalance + adjustAmount;

            // Cộng ví KH đúng
            await db.query(`
                UPDATE customer_wallets
                SET balance = $1, updated_at = NOW()
                WHERE phone = $2
            `, [correctNewBalance, normalizedCorrectPhone]);

            // Log wallet transaction (use valid type and source from CHECK constraints)
            await db.query(`
                INSERT INTO wallet_transactions (
                    phone, wallet_id, type, amount,
                    balance_before, balance_after,
                    source, reference_type, reference_id, note
                )
                SELECT $1::text, id, 'ADJUSTMENT'::text, $2::numeric,
                       $3::numeric, $4::numeric,
                       'MANUAL_ADJUSTMENT'::text, 'balance_history'::text, $5::text, $6::text
                FROM customer_wallets WHERE phone = $1::text
            `, [
                normalizedCorrectPhone,
                adjustAmount,  // Positive for credit
                correctCurrentBalance,
                correctNewBalance,
                String(id),
                `Nhận điều chỉnh từ GD #${id}: ${reason}`
            ]);

            adjustments.push({
                type: 'CREDIT',
                phone: normalizedCorrectPhone,
                amount: adjustAmount
            });
        }

        // 8. Ghi nhận adjustment vào bảng wallet_adjustments
        // Map adjustment_type từ frontend sang DB constraint
        const dbAdjustmentType = adjustment_type === 'transfer_to_correct'
            ? 'WRONG_MAPPING_DEBIT'  // Vì ta trừ từ KH sai và cộng cho KH đúng
            : 'WRONG_MAPPING_DEBIT'; // debit_only = chỉ trừ từ KH sai

        await db.query(`
            INSERT INTO wallet_adjustments (
                original_transaction_id,
                adjustment_type,
                wrong_customer_phone,
                correct_customer_phone,
                adjustment_amount,
                reason,
                created_by,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            id,
            dbAdjustmentType,
            tx.linked_customer_phone,
            adjustment_type === 'transfer_to_correct' ? normalizePhone(correct_customer_phone) : null,
            adjustAmount,
            reason,
            performed_by,
            now
        ]);

        // 9. Cập nhật balance_history với flag has_adjustment
        await db.query(`
            UPDATE balance_history
            SET verification_note = COALESCE(verification_note, '') || ' [Đã điều chỉnh: ' || $1 || ']'
            WHERE id = $2
        `, [reason.substring(0, 50), id]);

        // 10. Log customer activities (use WALLET_WITHDRAW since WALLET_ADJUSTMENT not in CHECK constraint)
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description)
            SELECT $1::text, id, 'WALLET_WITHDRAW'::text, $2::text, $3::text
            FROM customers WHERE phone = $1::text
        `, [
            tx.linked_customer_phone,
            'Điều chỉnh công nợ (trừ ví sai)',
            `Trừ ${adjustAmount.toLocaleString()}đ từ GD #${id} - ${reason}`
        ]);

        await db.query('COMMIT');

        console.log(`[ADJUSTMENT] Created adjustment for tx ${id} by ${performed_by}: ${adjustment_type}, amount: ${adjustAmount}`);

        res.json({
            success: true,
            message: adjustment_type === 'transfer_to_correct'
                ? `Đã điều chỉnh ${adjustAmount.toLocaleString()}đ từ ${tx.linked_customer_phone} sang ${correct_customer_phone}`
                : `Đã trừ ${adjustAmount.toLocaleString()}đ từ ví ${tx.linked_customer_phone}`,
            adjustments,
            original_transaction_id: id
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to create adjustment');
    }
});

module.exports = router;
