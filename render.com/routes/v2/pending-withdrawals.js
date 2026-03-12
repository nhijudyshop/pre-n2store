/**
 * =====================================================
 * API V2 - PENDING WALLET WITHDRAWALS
 * =====================================================
 *
 * Outbox pattern for wallet withdrawals
 * Ensures 100% no lost transactions even on network failures
 *
 * Routes:
 *   POST   /                    - Create pending withdrawal (idempotent)
 *   GET    /                    - List pending withdrawals (admin)
 *   GET    /stats               - Get statistics
 *   POST   /:id/retry           - Manual retry a pending record
 *   POST   /:id/cancel          - Cancel a pending record
 *   POST   /process-pending     - Cron endpoint to process pending records
 *
 * Created: 2026-01-27
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[PENDING-WITHDRAW] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

/**
 * Process a single withdrawal (async, non-blocking)
 * Called after creating pending record or by cron job
 */
async function processWithdrawal(db, pendingId) {
    try {
        // Get pending record
        const pendingResult = await db.query(`
            SELECT id, order_id, phone, amount, note, retry_count, max_retries
            FROM pending_wallet_withdrawals
            WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')
            FOR UPDATE SKIP LOCKED
        `, [pendingId]);

        if (pendingResult.rows.length === 0) {
            console.log(`[PENDING-WITHDRAW] Record ${pendingId} not found or already processed`);
            return { success: false, reason: 'not_found_or_locked' };
        }

        const pending = pendingResult.rows[0];

        // Update status to PROCESSING
        await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'PROCESSING', updated_at = NOW()
            WHERE id = $1
        `, [pendingId]);

        // Call FIFO withdrawal function
        const result = await db.query(`
            SELECT * FROM wallet_withdraw_fifo($1, $2, $3, $4)
        `, [pending.phone, pending.amount, pending.order_id, pending.note]);

        const withdrawal = result.rows[0];

        if (withdrawal.success) {
            // Success - mark as completed
            await db.query(`
                UPDATE pending_wallet_withdrawals
                SET status = 'COMPLETED',
                    virtual_used = $2,
                    real_used = $3,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
            `, [pendingId, withdrawal.virtual_used, withdrawal.real_used]);

            console.log(`[PENDING-WITHDRAW] ✅ Completed #${pendingId}: ${pending.amount}đ (virtual: ${withdrawal.virtual_used}, real: ${withdrawal.real_used})`);

            return {
                success: true,
                pending_id: pendingId,
                virtual_used: withdrawal.virtual_used,
                real_used: withdrawal.real_used,
                new_balance: withdrawal.new_balance,
                new_virtual_balance: withdrawal.new_virtual_balance
            };
        } else {
            // Failed - check retry count
            const newRetryCount = pending.retry_count + 1;

            if (newRetryCount >= pending.max_retries) {
                // Max retries reached - mark as FAILED
                await db.query(`
                    UPDATE pending_wallet_withdrawals
                    SET status = 'FAILED',
                        retry_count = $2,
                        last_error = $3,
                        last_retry_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `, [pendingId, newRetryCount, withdrawal.error_message]);

                // Create alert activity for admin
                await db.query(`
                    INSERT INTO customer_activities
                        (phone, activity_type, title, description, icon, color, metadata)
                    VALUES ($1, 'WITHDRAWAL_FAILED',
                        'Trừ ví thất bại - Cần xử lý thủ công',
                        $2, 'alert-triangle', 'red', $3)
                `, [
                    pending.phone,
                    `Đơn ${pending.order_id}: Không thể trừ ${pending.amount}đ sau ${newRetryCount} lần thử. Lỗi: ${withdrawal.error_message}`,
                    JSON.stringify({
                        pending_id: pendingId,
                        order_id: pending.order_id,
                        amount: parseFloat(pending.amount),
                        error: withdrawal.error_message,
                        retry_count: newRetryCount
                    })
                ]);

                console.log(`[PENDING-WITHDRAW] 🚨 FAILED #${pendingId}: Max retries reached - ${withdrawal.error_message}`);

                return {
                    success: false,
                    pending_id: pendingId,
                    status: 'FAILED',
                    error: withdrawal.error_message,
                    retry_count: newRetryCount
                };
            } else {
                // Still have retries - mark as PENDING for next cron run
                await db.query(`
                    UPDATE pending_wallet_withdrawals
                    SET status = 'PENDING',
                        retry_count = $2,
                        last_error = $3,
                        last_retry_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `, [pendingId, newRetryCount, withdrawal.error_message]);

                console.log(`[PENDING-WITHDRAW] ⏱️ Retry later #${pendingId}: ${withdrawal.error_message} (attempt ${newRetryCount}/${pending.max_retries})`);

                return {
                    success: false,
                    pending_id: pendingId,
                    status: 'PENDING',
                    error: withdrawal.error_message,
                    retry_count: newRetryCount,
                    will_retry: true
                };
            }
        }
    } catch (error) {
        // Unexpected error - mark as pending for retry
        await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'PENDING',
                retry_count = retry_count + 1,
                last_error = $2,
                last_retry_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [pendingId, error.message]);

        console.error(`[PENDING-WITHDRAW] ❌ Error processing #${pendingId}:`, error.message);

        return {
            success: false,
            pending_id: pendingId,
            error: error.message
        };
    }
}

// =====================================================
// ROUTES
// =====================================================

/**
 * POST /api/v2/pending-withdrawals
 * Create a pending withdrawal record (idempotent)
 * This should be called IMMEDIATELY after TPOS order creation succeeds
 */
router.post('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { order_id, order_number, phone, amount, source, note, created_by } = req.body;

    // Validation
    if (!order_id) {
        return res.status(400).json({ success: false, error: 'order_id is required' });
    }
    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone is required' });
    }
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be positive' });
    }

    try {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }

        // Check if record already exists (idempotency check)
        const existingResult = await db.query(`
            SELECT id, status, virtual_used, real_used, wallet_transaction_id, completed_at
            FROM pending_wallet_withdrawals
            WHERE order_id = $1 AND phone = $2
        `, [order_id, normalizedPhone]);

        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];

            if (existing.status === 'COMPLETED') {
                // Already completed - return success with existing data
                console.log(`[PENDING-WITHDRAW] ⏭️ Already completed for order ${order_id}`);
                return res.json({
                    success: true,
                    skipped: true,
                    message: 'Withdrawal already completed for this order',
                    data: {
                        pending_id: existing.id,
                        status: 'COMPLETED',
                        virtual_used: parseFloat(existing.virtual_used),
                        real_used: parseFloat(existing.real_used),
                        completed_at: existing.completed_at
                    }
                });
            }

            if (existing.status === 'FAILED') {
                // Previously failed - allow retry by resetting status
                await db.query(`
                    UPDATE pending_wallet_withdrawals
                    SET status = 'PENDING',
                        retry_count = 0,
                        last_error = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                `, [existing.id]);

                console.log(`[PENDING-WITHDRAW] 🔄 Reset failed record #${existing.id} for retry`);

                // Process immediately (non-blocking)
                setImmediate(() => processWithdrawal(db, existing.id));

                return res.json({
                    success: true,
                    pending_id: existing.id,
                    status: 'PENDING',
                    message: 'Previous failed record reset, retrying...'
                });
            }

            // PENDING or PROCESSING - return existing record
            console.log(`[PENDING-WITHDRAW] ⏭️ Record exists for order ${order_id}, status: ${existing.status}`);
            return res.json({
                success: true,
                pending_id: existing.id,
                status: existing.status,
                message: 'Pending withdrawal already exists, will be processed'
            });
        }

        // Get customer_id if available
        const customerResult = await db.query(
            'SELECT id FROM customers WHERE phone = $1',
            [normalizedPhone]
        );
        const customerId = customerResult.rows[0]?.id || null;

        // Insert new pending record
        const insertResult = await db.query(`
            INSERT INTO pending_wallet_withdrawals
                (order_id, order_number, phone, customer_id, amount, source, note, created_by, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
            RETURNING id
        `, [
            order_id,
            order_number || order_id,
            normalizedPhone,
            customerId,
            amount,
            source || 'SALE_ORDER',
            note || `Thanh toán công nợ đơn hàng #${order_number || order_id}`,
            created_by
        ]);

        const pendingId = insertResult.rows[0].id;

        console.log(`[PENDING-WITHDRAW] ✅ Created #${pendingId} for order ${order_id}, phone ${normalizedPhone}, amount ${amount}`);

        // Log ORDER_CREATED activity (non-blocking)
        setImmediate(async () => {
            try {
                // Ensure activity_type constraint includes ORDER_CREATED
                await db.query(`ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check`).catch(() => {});
                await db.query(`ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
                    CHECK (activity_type IN (
                        'WALLET_DEPOSIT','WALLET_WITHDRAW','WALLET_VIRTUAL_CREDIT','WALLET_REFUND',
                        'TICKET_CREATED','TICKET_UPDATED','TICKET_COMPLETED','TICKET_DELETED',
                        'ORDER_CREATED','ORDER_CANCELLED','ORDER_DELIVERED','ORDER_RETURNED',
                        'MESSAGE_SENT','MESSAGE_RECEIVED','PROFILE_UPDATED','TAG_ADDED','NOTE_ADDED'
                    ))`).catch(() => {});

                const orderDisplay = order_number || order_id;
                const debtAmount = parseFloat(amount) || 0;
                await db.query(`
                    INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by)
                    VALUES ($1, $2, 'ORDER_CREATED', $3, $4, 'order', $5, $6, 'shopping_cart', 'green', $7)
                `, [
                    normalizedPhone,
                    customerId,
                    `Tạo đơn #${orderDisplay} (CK ${debtAmount.toLocaleString()}đ)`,
                    `Tạo đơn hàng #${orderDisplay}. Sử dụng công nợ: ${debtAmount.toLocaleString()}đ`,
                    orderDisplay,
                    JSON.stringify({ order_number: orderDisplay, order_id, debt_used: debtAmount, source: source || 'FAST_SALE' }),
                    created_by || 'system'
                ]);
                console.log(`[PENDING-WITHDRAW] ✅ ORDER_CREATED activity logged for ${normalizedPhone}, order ${orderDisplay}`);
            } catch (actErr) {
                console.warn('[PENDING-WITHDRAW] Activity logging failed (non-critical):', actErr.message);
            }
        });

        // Process immediately (non-blocking) - don't wait for result
        setImmediate(() => processWithdrawal(db, pendingId));

        res.json({
            success: true,
            pending_id: pendingId,
            status: 'PENDING',
            message: 'Pending withdrawal created, processing...'
        });

    } catch (error) {
        // Handle unique constraint violation gracefully
        if (error.code === '23505') {
            // Duplicate key - race condition, record was just created
            const existingResult = await db.query(`
                SELECT id, status FROM pending_wallet_withdrawals
                WHERE order_id = $1 AND phone = $2
            `, [order_id, normalizePhone(phone)]);

            if (existingResult.rows.length > 0) {
                return res.json({
                    success: true,
                    pending_id: existingResult.rows[0].id,
                    status: existingResult.rows[0].status,
                    message: 'Record already exists (race condition handled)'
                });
            }
        }

        handleError(res, error, 'Failed to create pending withdrawal');
    }
});

/**
 * GET /api/v2/pending-withdrawals
 * List pending withdrawals (admin view)
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { status, phone, page = 1, limit = 50 } = req.query;

    try {
        let query = `
            SELECT pw.*,
                   c.name as customer_name
            FROM pending_wallet_withdrawals pw
            LEFT JOIN customers c ON pw.customer_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND pw.status = $${params.length}`;
        }

        if (phone) {
            params.push(normalizePhone(phone));
            query += ` AND pw.phone = $${params.length}`;
        }

        // Count total
        const countQuery = query.replace(/SELECT pw\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY pw.created_at DESC`;
        params.push(parseInt(limit));
        query += ` LIMIT $${params.length}`;
        params.push((parseInt(page) - 1) * parseInt(limit));
        query += ` OFFSET $${params.length}`;

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
        handleError(res, error, 'Failed to fetch pending withdrawals');
    }
});

/**
 * GET /api/v2/pending-withdrawals/stats
 * Get statistics about pending withdrawals
 */
router.get('/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query(`
            SELECT
                status,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total_amount
            FROM pending_wallet_withdrawals
            GROUP BY status
            ORDER BY
                CASE status
                    WHEN 'PENDING' THEN 1
                    WHEN 'PROCESSING' THEN 2
                    WHEN 'FAILED' THEN 3
                    WHEN 'COMPLETED' THEN 4
                    WHEN 'CANCELLED' THEN 5
                END
        `);

        // Get recent failures for alert
        const failedResult = await db.query(`
            SELECT id, order_id, phone, amount, last_error, created_at
            FROM pending_wallet_withdrawals
            WHERE status = 'FAILED'
            ORDER BY created_at DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                by_status: result.rows.reduce((acc, row) => {
                    acc[row.status] = {
                        count: parseInt(row.count),
                        total_amount: parseFloat(row.total_amount)
                    };
                    return acc;
                }, {}),
                recent_failures: failedResult.rows
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch statistics');
    }
});

/**
 * POST /api/v2/pending-withdrawals/:id/retry
 * Manually retry a pending/failed record
 */
router.post('/:id/retry', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        // Reset status to PENDING and reset retry count
        const updateResult = await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'PENDING',
                retry_count = 0,
                last_error = NULL,
                updated_at = NOW()
            WHERE id = $1 AND status IN ('PENDING', 'FAILED')
            RETURNING id
        `, [id]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Record not found or already completed/cancelled'
            });
        }

        // Process immediately
        const result = await processWithdrawal(db, parseInt(id));

        res.json({
            success: true,
            message: 'Retry initiated',
            result
        });
    } catch (error) {
        handleError(res, error, 'Failed to retry');
    }
});

/**
 * POST /api/v2/pending-withdrawals/:id/cancel
 * Cancel a pending record (e.g., when order is cancelled)
 */
router.post('/:id/cancel', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { reason } = req.body;

    try {
        const updateResult = await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'CANCELLED',
                last_error = $2,
                updated_at = NOW()
            WHERE id = $1 AND status IN ('PENDING', 'FAILED')
            RETURNING id, order_id, phone, amount
        `, [id, reason || 'Cancelled by admin']);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Record not found or cannot be cancelled (already completed or processing)'
            });
        }

        const cancelled = updateResult.rows[0];
        console.log(`[PENDING-WITHDRAW] ❌ Cancelled #${id}: Order ${cancelled.order_id}`);

        res.json({
            success: true,
            message: 'Pending withdrawal cancelled',
            data: cancelled
        });
    } catch (error) {
        handleError(res, error, 'Failed to cancel');
    }
});

/**
 * POST /api/v2/pending-withdrawals/process-pending
 * Cron endpoint to process all pending records
 * Called by scheduler every 5 minutes
 */
router.post('/process-pending', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 50 } = req.body;

    try {
        // Get pending records older than 1 minute (to avoid racing with immediate processing)
        const pendingResult = await db.query(`
            SELECT id
            FROM pending_wallet_withdrawals
            WHERE status = 'PENDING'
              AND created_at < NOW() - INTERVAL '1 minute'
              AND retry_count < max_retries
            ORDER BY created_at ASC
            LIMIT $1
        `, [parseInt(limit)]);

        if (pendingResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'No pending withdrawals to process',
                processed: 0
            });
        }

        console.log(`[PENDING-WITHDRAW] Processing ${pendingResult.rows.length} pending records...`);

        let successCount = 0;
        let failCount = 0;
        let retryLaterCount = 0;

        for (const row of pendingResult.rows) {
            const result = await processWithdrawal(db, row.id);

            if (result.success) {
                successCount++;
            } else if (result.status === 'FAILED') {
                failCount++;
            } else {
                retryLaterCount++;
            }
        }

        const summary = {
            success: true,
            message: `Processed ${pendingResult.rows.length} pending withdrawals`,
            stats: {
                total: pendingResult.rows.length,
                success: successCount,
                failed: failCount,
                retry_later: retryLaterCount
            }
        };

        console.log(`[PENDING-WITHDRAW] ✅ Cron complete: ${successCount} success, ${failCount} failed, ${retryLaterCount} retry later`);

        res.json(summary);
    } catch (error) {
        handleError(res, error, 'Failed to process pending withdrawals');
    }
});

/**
 * POST /api/v2/pending-withdrawals/cancel-by-order
 * Cancel pending withdrawal when order is cancelled
 */
router.post('/cancel-by-order', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { order_id, reason } = req.body;

    if (!order_id) {
        return res.status(400).json({ success: false, error: 'order_id is required' });
    }

    try {
        const updateResult = await db.query(`
            UPDATE pending_wallet_withdrawals
            SET status = 'CANCELLED',
                last_error = $2,
                updated_at = NOW()
            WHERE order_id = $1 AND status IN ('PENDING', 'FAILED')
            RETURNING id, phone, amount
        `, [order_id, reason || 'Order cancelled']);

        if (updateResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'No pending withdrawal found for this order (may already be completed)'
            });
        }

        console.log(`[PENDING-WITHDRAW] ❌ Cancelled ${updateResult.rows.length} record(s) for order ${order_id}`);

        res.json({
            success: true,
            message: `Cancelled ${updateResult.rows.length} pending withdrawal(s)`,
            data: updateResult.rows
        });
    } catch (error) {
        handleError(res, error, 'Failed to cancel by order');
    }
});

module.exports = router;
module.exports.processWithdrawal = processWithdrawal;
