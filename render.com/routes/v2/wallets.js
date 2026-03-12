/**
 * =====================================================
 * API V2 - WALLETS ROUTES
 * =====================================================
 *
 * Wallet management endpoints
 *
 * Routes:
 *   GET    /:customerId              - Get wallet summary
 *   POST   /:customerId/deposit      - Add real balance
 *   POST   /:customerId/credit       - Add virtual credit
 *   POST   /:customerId/withdraw     - FIFO withdrawal
 *   GET    /:customerId/transactions - Transaction history
 *   POST   /batch-summary            - Batch wallet lookup
 *   POST   /cron/expire              - Expire virtual credits (cron)
 *   POST   /cron/process-bank        - Process bank transactions (cron)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');
const { processManualDeposit, issueVirtualCredit } = require('../../services/wallet-event-processor');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Wallets V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// Helper to get customer phone from ID or phone
async function getCustomerPhone(db, customerId) {
    const isPhone = /^0\d{9}$/.test(customerId) || /^\d{10,11}$/.test(customerId);
    if (isPhone) {
        return normalizePhone(customerId);
    }

    const result = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(customerId)]);
    return result.rows[0]?.phone || null;
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/wallets/:customerId
 * Get wallet summary with active virtual credits
 */
router.get('/:customerId', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const walletResult = await db.query(`
            SELECT * FROM customer_wallets WHERE phone = $1
        `, [phone]);

        if (walletResult.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    phone,
                    balance: 0,
                    virtualBalance: 0,
                    total: 0,
                    virtualCredits: []
                }
            });
        }

        const wallet = walletResult.rows[0];

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT id, original_amount, remaining_amount, issued_at, expires_at, status, source_type, source_id
            FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        // Get last deposit transaction (for payment note generation)
        const lastDepositResult = await db.query(`
            SELECT amount, created_at
            FROM wallet_transactions
            WHERE phone = $1 AND type = 'DEPOSIT'
            ORDER BY created_at DESC
            LIMIT 1
        `, [phone]);

        const lastDeposit = lastDepositResult.rows[0] || null;

        res.json({
            success: true,
            data: {
                ...wallet,
                total: parseFloat(wallet.balance) + parseFloat(wallet.virtual_balance),
                virtualCredits: creditsResult.rows,
                lastDepositAmount: lastDeposit ? parseFloat(lastDeposit.amount) : null,
                lastDepositDate: lastDeposit ? lastDeposit.created_at : null
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet');
    }
});

/**
 * POST /api/v2/wallets/:customerId/deposit
 * Deposit to wallet (real balance)
 */
router.post('/:customerId/deposit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, source, reference_id, note, created_by } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Get customer ID if available
        const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
        const customerIdNum = customerResult.rows[0]?.id || null;

        // Use centralized wallet-event-processor for consistency and SSE
        const result = await processManualDeposit(
            db,
            phone,
            amount,
            source || 'MANUAL_ADJUSTMENT',
            reference_id || created_by || 'admin',
            note || 'Nạp tiền thủ công',
            customerIdNum
        );

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
            VALUES ($1, 'WALLET_DEPOSIT', $2, $3, 'dollar-sign', 'green')
        `, [phone, `Nạp tiền: ${parseFloat(amount).toLocaleString()}đ`, note || '']);

        res.json({
            success: true,
            data: {
                phone,
                deposited: parseFloat(amount),
                previousBalance: result.wallet.balance - parseFloat(amount),
                newBalance: result.wallet.balance,
                transactionId: result.transactionId
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to deposit to wallet');
    }
});

/**
 * POST /api/v2/wallets/:customerId/credit
 * Issue virtual credit
 */
router.post('/:customerId/credit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, source_type, source_id, expiry_days = 15, note, created_by } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Use centralized wallet-event-processor for consistency and SSE
        const result = await issueVirtualCredit(
            db,
            phone,
            amount,
            source_id || created_by || 'admin',
            note || `Cấp công nợ ảo (${source_type || 'ADMIN'})`,
            expiry_days
        );

        // Calculate expiry for response
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiry_days);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
            VALUES ($1, 'WALLET_VIRTUAL_CREDIT', $2, $3, 'gift', 'purple')
        `, [phone, `Cấp công nợ ảo: ${parseFloat(amount).toLocaleString()}đ`, `Hết hạn: ${expiresAt.toLocaleDateString('vi-VN')}`]);

        res.json({
            success: true,
            data: {
                phone,
                amount: parseFloat(amount),
                newVirtualBalance: result.wallet.virtual_balance,
                expiresAt: expiresAt.toISOString(),
                transactionId: result.transactionId
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to issue virtual credit');
    }
});

/**
 * POST /api/v2/wallets/:customerId/withdraw
 * Withdraw from wallet (FIFO virtual credits first)
 */
router.post('/:customerId/withdraw', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, order_id, note } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Use FIFO withdrawal function
        const result = await db.query(`
            SELECT * FROM wallet_withdraw_fifo($1, $2, $3, $4)
        `, [phone, amount, order_id || 'MANUAL', note]);

        const withdrawal = result.rows[0];

        if (!withdrawal.success) {
            return res.status(400).json({ success: false, error: withdrawal.error_message });
        }

        res.json({
            success: true,
            data: {
                phone,
                requested: parseFloat(amount),
                virtualUsed: parseFloat(withdrawal.virtual_used),
                realUsed: parseFloat(withdrawal.real_used),
                totalUsed: parseFloat(withdrawal.total_used),
                newBalance: parseFloat(withdrawal.new_balance),
                newVirtualBalance: parseFloat(withdrawal.new_virtual_balance)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to withdraw from wallet');
    }
});

/**
 * GET /api/v2/wallets/:customerId/transactions
 * Get wallet transaction history
 */
router.get('/:customerId/transactions', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { page = 1, limit = 50, type } = req.query;

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        let query = 'SELECT * FROM wallet_transactions WHERE phone = $1';
        const params = [phone];

        if (type) {
            query += ' AND type = $2';
            params.push(type);
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await db.query(query, params);

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
        handleError(res, error, 'Failed to fetch wallet transactions');
    }
});

/**
 * POST /api/v2/wallets/batch-summary
 * Get wallet summary for multiple customers
 */
router.post('/batch-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones, customer_ids } = req.body;

    if ((!phones || !Array.isArray(phones)) && (!customer_ids || !Array.isArray(customer_ids))) {
        return res.status(400).json({ success: false, error: 'phones or customer_ids array is required' });
    }

    try {
        let result;
        let phonesForDeposit;
        if (phones && phones.length > 0) {
            phonesForDeposit = phones.map(normalizePhone).filter(Boolean);
            result = await db.query(`
                SELECT phone, balance, virtual_balance, (balance + virtual_balance) as total
                FROM customer_wallets
                WHERE phone = ANY($1)
            `, [phonesForDeposit]);
        } else {
            result = await db.query(`
                SELECT w.phone, w.balance, w.virtual_balance, (w.balance + w.virtual_balance) as total
                FROM customer_wallets w
                JOIN customers c ON w.customer_id = c.id
                WHERE c.id = ANY($1)
            `, [customer_ids.map(id => parseInt(id))]);
            phonesForDeposit = result.rows.map(r => r.phone);
        }

        const walletMap = {};
        result.rows.forEach(row => {
            walletMap[row.phone] = {
                balance: parseFloat(row.balance),
                virtualBalance: parseFloat(row.virtual_balance),
                total: parseFloat(row.total)
            };
        });

        // Fetch last deposit transaction for each phone (for payment note generation)
        if (phonesForDeposit.length > 0) {
            const depositResult = await db.query(`
                SELECT DISTINCT ON (phone) phone, amount, created_at
                FROM wallet_transactions
                WHERE phone = ANY($1) AND type = 'DEPOSIT'
                ORDER BY phone, created_at DESC
            `, [phonesForDeposit]);

            depositResult.rows.forEach(row => {
                if (walletMap[row.phone]) {
                    walletMap[row.phone].lastDepositAmount = parseFloat(row.amount);
                    walletMap[row.phone].lastDepositDate = row.created_at;
                }
            });
        }

        res.json({ success: true, data: walletMap });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet batch summary');
    }
});

/**
 * POST /api/v2/wallets/cron/expire
 * Cron endpoint to expire virtual credits
 */
router.post('/cron/expire', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');

        res.json({
            success: true,
            data: {
                expiredCount: result.rows[0].expired_count,
                totalExpiredAmount: parseFloat(result.rows[0].total_expired_amount) || 0
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to expire virtual credits');
    }
});

/**
 * POST /api/v2/wallets/cron/process-bank
 * Process unprocessed bank transactions from balance_history
 */
router.post('/cron/process-bank', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 100 } = req.body;

    try {
        await db.query('BEGIN');

        // Get unprocessed bank transactions with linked customer
        const unprocessedResult = await db.query(`
            SELECT
                bh.id,
                bh.linked_customer_phone as phone,
                bh.transfer_amount as amount,
                bh.content as description,
                bh.transaction_date
            FROM balance_history bh
            WHERE bh.linked_customer_phone IS NOT NULL
              AND (bh.wallet_processed = FALSE OR bh.wallet_processed IS NULL)
              AND bh.transfer_amount > 0
              AND bh.transfer_type = 'in'
            ORDER BY bh.transaction_date ASC
            LIMIT $1
        `, [parseInt(limit)]);

        const processed = [];
        const errors = [];

        for (const tx of unprocessedResult.rows) {
            try {
                const normalizedPhone = normalizePhone(tx.phone);
                if (!normalizedPhone) {
                    errors.push({ id: tx.id, error: 'Invalid phone number' });
                    continue;
                }

                // Get or create wallet
                const walletResult = await db.query(`
                    INSERT INTO customer_wallets (phone, balance)
                    VALUES ($1, 0)
                    ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
                    RETURNING *
                `, [normalizedPhone]);

                const wallet = walletResult.rows[0];
                const newBalance = parseFloat(wallet.balance) + parseFloat(tx.amount);

                // Update wallet
                await db.query(`
                    UPDATE customer_wallets
                    SET balance = $2, total_deposited = total_deposited + $3, updated_at = NOW()
                    WHERE id = $1
                `, [wallet.id, newBalance, tx.amount]);

                // Log wallet transaction
                await db.query(`
                    INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note)
                    VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'BANK_TRANSFER', $6, $7)
                `, [normalizedPhone, wallet.id, tx.amount, wallet.balance, newBalance, tx.id, tx.description]);

                // Mark as processed
                await db.query(`
                    UPDATE balance_history
                    SET wallet_processed = TRUE, customer_phone = $2
                    WHERE id = $1
                `, [tx.id, normalizedPhone]);

                // Log activity
                await db.query(`
                    INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
                    VALUES ($1, 'WALLET_DEPOSIT', $2, $3, 'university', 'green')
                `, [normalizedPhone, `Nạp tiền: ${parseFloat(tx.amount).toLocaleString()}đ`, tx.description || 'Chuyển khoản ngân hàng']);

                processed.push({
                    id: tx.id,
                    phone: normalizedPhone,
                    amount: parseFloat(tx.amount),
                    newBalance
                });
            } catch (txError) {
                errors.push({ id: tx.id, error: txError.message });
            }
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            data: {
                processedCount: processed.length,
                errorCount: errors.length,
                processed,
                errors
            }
        });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to process bank transactions');
    }
});

// =====================================================
// WALLET ADJUSTMENTS (for wrong mapping corrections)
// =====================================================

/**
 * POST /api/v2/wallets/adjustment
 * Create a wallet adjustment (for wrong customer mapping, etc.)
 * Only for Admin/Accountant roles
 */
router.post('/adjustment', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        original_transaction_id,
        adjustment_type,
        wrong_customer_phone,
        correct_customer_phone,
        amount,
        reason,
        created_by
    } = req.body;

    // Validate required fields
    if (!adjustment_type || !amount || !reason || !created_by) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: adjustment_type, amount, reason, created_by'
        });
    }

    // Validate adjustment_type
    const validTypes = ['WRONG_MAPPING_CREDIT', 'WRONG_MAPPING_DEBIT', 'DUPLICATE_REVERSAL', 'ADMIN_CORRECTION'];
    if (!validTypes.includes(adjustment_type)) {
        return res.status(400).json({
            success: false,
            error: `Invalid adjustment_type. Must be one of: ${validTypes.join(', ')}`
        });
    }

    try {
        await db.query('BEGIN');

        let walletTxId = null;
        let affectedWallet = null;

        // Process based on adjustment type
        if (adjustment_type === 'WRONG_MAPPING_DEBIT' && wrong_customer_phone) {
            // Debit from wrong customer (they shouldn't have received this money)
            const normalizedPhone = normalizePhone(wrong_customer_phone);

            const walletResult = await db.query(`
                UPDATE customer_wallets
                SET balance = balance - $2, updated_at = NOW()
                WHERE phone = $1
                RETURNING *
            `, [normalizedPhone, Math.abs(amount)]);

            if (walletResult.rows.length > 0) {
                affectedWallet = walletResult.rows[0];

                // Log wallet transaction
                const txResult = await db.query(`
                    INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note)
                    VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'WRONG_MAPPING_CORRECTION', $6, $7)
                    RETURNING id
                `, [
                    normalizedPhone,
                    affectedWallet.id,
                    -Math.abs(amount),
                    parseFloat(affectedWallet.balance) + Math.abs(amount),
                    affectedWallet.balance,
                    original_transaction_id,
                    `Điều chỉnh: ${reason}`
                ]);
                walletTxId = txResult.rows[0].id;
            }
        }

        if (adjustment_type === 'WRONG_MAPPING_CREDIT' && correct_customer_phone) {
            // Credit to correct customer
            const normalizedPhone = normalizePhone(correct_customer_phone);

            // Get or create wallet for correct customer
            const walletResult = await db.query(`
                INSERT INTO customer_wallets (phone, balance)
                VALUES ($1, $2)
                ON CONFLICT (phone) DO UPDATE
                SET balance = customer_wallets.balance + $2, updated_at = NOW()
                RETURNING *
            `, [normalizedPhone, Math.abs(amount)]);

            if (walletResult.rows.length > 0) {
                affectedWallet = walletResult.rows[0];

                // Log wallet transaction
                const txResult = await db.query(`
                    INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note)
                    VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'WRONG_MAPPING_CORRECTION', $6, $7)
                    RETURNING id
                `, [
                    normalizedPhone,
                    affectedWallet.id,
                    Math.abs(amount),
                    parseFloat(affectedWallet.balance) - Math.abs(amount),
                    affectedWallet.balance,
                    original_transaction_id,
                    `Điều chỉnh: ${reason}`
                ]);
                walletTxId = txResult.rows[0].id;
            }
        }

        if (adjustment_type === 'DUPLICATE_REVERSAL' && wrong_customer_phone) {
            // Reverse duplicate entry
            const normalizedPhone = normalizePhone(wrong_customer_phone);

            const walletResult = await db.query(`
                UPDATE customer_wallets
                SET balance = balance - $2, updated_at = NOW()
                WHERE phone = $1
                RETURNING *
            `, [normalizedPhone, Math.abs(amount)]);

            if (walletResult.rows.length > 0) {
                affectedWallet = walletResult.rows[0];

                const txResult = await db.query(`
                    INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note)
                    VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'DUPLICATE_REVERSAL', $6, $7)
                    RETURNING id
                `, [
                    normalizedPhone,
                    affectedWallet.id,
                    -Math.abs(amount),
                    parseFloat(affectedWallet.balance) + Math.abs(amount),
                    affectedWallet.balance,
                    original_transaction_id,
                    `Hoàn tác trùng: ${reason}`
                ]);
                walletTxId = txResult.rows[0].id;
            }
        }

        // Record the adjustment
        const adjustmentResult = await db.query(`
            INSERT INTO wallet_adjustments (
                original_transaction_id,
                wallet_transaction_id,
                adjustment_type,
                wrong_customer_phone,
                correct_customer_phone,
                adjustment_amount,
                reason,
                created_by,
                approved_by,
                approved_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            original_transaction_id,
            walletTxId,
            adjustment_type,
            wrong_customer_phone ? normalizePhone(wrong_customer_phone) : null,
            correct_customer_phone ? normalizePhone(correct_customer_phone) : null,
            amount,
            reason,
            created_by
        ]);

        await db.query('COMMIT');

        console.log(`[Wallets V2] ✅ Adjustment created: ${adjustment_type} by ${created_by}`);

        res.json({
            success: true,
            message: 'Điều chỉnh ví thành công',
            data: {
                adjustment: adjustmentResult.rows[0],
                wallet_transaction_id: walletTxId,
                affected_wallet: affectedWallet ? {
                    phone: affectedWallet.phone,
                    new_balance: parseFloat(affectedWallet.balance)
                } : null
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to create wallet adjustment');
    }
});

/**
 * GET /api/v2/wallets/adjustments
 * Get wallet adjustment history
 */
router.get('/adjustments', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 50 } = req.query;

    try {
        // Get total count
        const countResult = await db.query('SELECT COUNT(*) as total FROM wallet_adjustments');
        const total = parseInt(countResult.rows[0].total);

        // Get adjustments with pagination
        const result = await db.query(`
            SELECT
                wa.*,
                bh.content as original_transaction_content,
                bh.transfer_amount as original_amount,
                bh.transaction_date as original_date
            FROM wallet_adjustments wa
            LEFT JOIN balance_history bh ON wa.original_transaction_id = bh.id
            ORDER BY wa.created_at DESC
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
        handleError(res, error, 'Failed to fetch wallet adjustments');
    }
});

/**
 * POST /api/v2/wallets/refund-by-order
 * Refund wallet when order is cancelled
 * Checks if a pending withdrawal was completed for this order and reverses it
 */
// Auto-migrate activity_type constraint on first use
let walletActivityConstraintMigrated = false;
async function ensureActivityTypeConstraintForWallet(db) {
    if (walletActivityConstraintMigrated) return;
    try {
        await db.query(`ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check`);
        await db.query(`ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
            CHECK (activity_type IN (
                'WALLET_DEPOSIT','WALLET_WITHDRAW','WALLET_VIRTUAL_CREDIT','WALLET_REFUND',
                'TICKET_CREATED','TICKET_UPDATED','TICKET_COMPLETED','TICKET_DELETED',
                'ORDER_CREATED','ORDER_CANCELLED','ORDER_DELIVERED','ORDER_RETURNED',
                'MESSAGE_SENT','MESSAGE_RECEIVED','PROFILE_UPDATED','TAG_ADDED','NOTE_ADDED'
            ))`);
        walletActivityConstraintMigrated = true;
        console.log('[Wallets V2] ✅ Activity type constraint migrated');
    } catch (err) {
        console.warn('[Wallets V2] Constraint migration warning:', err.message);
        walletActivityConstraintMigrated = true;
    }
}

router.post('/refund-by-order', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { order_id, phone, reason, created_by } = req.body;

    if (!order_id) {
        return res.status(400).json({ success: false, error: 'order_id is required' });
    }
    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone is required' });
    }

    try {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }

        // Step 1: Find COMPLETED withdrawal for this order
        const withdrawalResult = await db.query(`
            SELECT id, amount, virtual_used, real_used, phone, completed_at
            FROM pending_wallet_withdrawals
            WHERE order_id = $1 AND phone = $2 AND status = 'COMPLETED'
        `, [order_id, normalizedPhone]);

        if (withdrawalResult.rows.length === 0) {
            // Check if it's still PENDING - cancel it instead
            const pendingResult = await db.query(`
                UPDATE pending_wallet_withdrawals
                SET status = 'CANCELLED', last_error = $3, updated_at = NOW()
                WHERE order_id = $1 AND phone = $2 AND status IN ('PENDING', 'FAILED')
                RETURNING id, amount
            `, [order_id, normalizedPhone, reason || 'Đơn hàng bị hủy']);

            if (pendingResult.rows.length > 0) {
                return res.json({
                    success: true,
                    refunded: false,
                    cancelled_pending: true,
                    message: 'Pending withdrawal cancelled (not yet processed)',
                    data: { pending_id: pendingResult.rows[0].id, amount: parseFloat(pendingResult.rows[0].amount) }
                });
            }

            return res.json({
                success: true,
                refunded: false,
                message: 'No wallet withdrawal found for this order'
            });
        }

        const withdrawal = withdrawalResult.rows[0];
        const refundAmount = parseFloat(withdrawal.amount);
        const virtualUsed = parseFloat(withdrawal.virtual_used) || 0;
        const realUsed = parseFloat(withdrawal.real_used) || 0;

        // Step 2: Refund to wallet (transaction: wallet update + transaction log + withdrawal status)
        await db.query('BEGIN');

        // Get current wallet
        const walletResult = await db.query(`
            SELECT * FROM customer_wallets WHERE phone = $1 FOR UPDATE
        `, [normalizedPhone]);

        if (walletResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Wallet not found' });
        }

        const wallet = walletResult.rows[0];
        const balanceBefore = parseFloat(wallet.balance);
        const virtualBefore = parseFloat(wallet.virtual_balance);

        // Refund real balance portion
        if (realUsed > 0) {
            await db.query(`
                UPDATE customer_wallets
                SET balance = balance + $2, updated_at = NOW()
                WHERE phone = $1
            `, [normalizedPhone, realUsed]);
        }

        // Refund virtual balance portion (re-credit virtual credits)
        if (virtualUsed > 0) {
            await db.query(`
                UPDATE customer_wallets
                SET virtual_balance = virtual_balance + $2, updated_at = NOW()
                WHERE phone = $1
            `, [normalizedPhone, virtualUsed]);

            // Try to restore the most recently consumed virtual credits
            await db.query(`
                UPDATE virtual_credits
                SET remaining_amount = LEAST(original_amount, remaining_amount + $2),
                    status = 'ACTIVE',
                    updated_at = NOW()
                WHERE phone = $1 AND status IN ('USED', 'ACTIVE')
                  AND expires_at > NOW()
                ORDER BY expires_at ASC
                LIMIT 1
            `, [normalizedPhone, virtualUsed]);
        }

        // Step 3: Log wallet transaction (refund)
        const txResult = await db.query(`
            INSERT INTO wallet_transactions
            (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note, created_by)
            VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'ORDER_CANCEL_REFUND', $6, $7, $8)
            RETURNING id
        `, [
            normalizedPhone,
            wallet.id,
            refundAmount,
            balanceBefore + virtualBefore,
            balanceBefore + virtualBefore + refundAmount,
            order_id,
            `Hoàn tiền hủy đơn #${order_id} (Thật: ${realUsed.toLocaleString()}đ, Công nợ: ${virtualUsed.toLocaleString()}đ)`,
            created_by || 'system'
        ]);

        // Step 4: Mark withdrawal as REFUNDED
        await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'CANCELLED', last_error = $2, updated_at = NOW()
            WHERE id = $1
        `, [withdrawal.id, `Refunded: ${reason || 'Đơn hàng bị hủy'}`]);

        await db.query('COMMIT');

        console.log(`[Wallets V2] ✅ Refund for order ${order_id}: ${refundAmount}đ (real: ${realUsed}, virtual: ${virtualUsed})`);

        // Step 5: Log customer activity AFTER commit (non-blocking, won't rollback refund)
        try {
            await ensureActivityTypeConstraintForWallet(db);
            await db.query(`
                INSERT INTO customer_activities (phone, activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by)
                VALUES ($1, 'WALLET_REFUND', $2, $3, 'order', $4, $5, 'undo', 'blue', $6)
            `, [
                normalizedPhone,
                `Hoàn công nợ: ${refundAmount.toLocaleString()}đ`,
                `Hoàn tiền do hủy đơn #${order_id}. Tiền thật: ${realUsed.toLocaleString()}đ, Công nợ ảo: ${virtualUsed.toLocaleString()}đ. Lý do: ${reason || 'N/A'}`,
                order_id,
                JSON.stringify({
                    order_id,
                    total_refunded: refundAmount,
                    real_refunded: realUsed,
                    virtual_refunded: virtualUsed,
                    reason: reason || '',
                    original_withdrawal_id: withdrawal.id
                }),
                created_by || 'system'
            ]);
        } catch (activityErr) {
            console.warn('[Wallets V2] Activity logging failed (refund still succeeded):', activityErr.message);
        }

        res.json({
            success: true,
            refunded: true,
            data: {
                phone: normalizedPhone,
                refund_amount: refundAmount,
                real_refunded: realUsed,
                virtual_refunded: virtualUsed,
                new_balance: balanceBefore + realUsed,
                new_virtual_balance: virtualBefore + virtualUsed,
                transaction_id: txResult.rows[0].id,
                withdrawal_id: withdrawal.id
            }
        });
    } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        handleError(res, error, 'Failed to refund wallet');
    }
});

module.exports = router;
