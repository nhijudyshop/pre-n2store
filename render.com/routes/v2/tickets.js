/**
 * =====================================================
 * API V2 - TICKETS ROUTES
 * =====================================================
 *
 * Ticket management endpoints
 *
 * Routes:
 *   GET    /              - List all tickets (paginated, filtered)
 *   GET    /stats         - Get ticket statistics
 *   GET    /:id           - Get ticket detail
 *   POST   /              - Create ticket
 *   PATCH  /:id           - Update ticket
 *   POST   /:id/notes     - Add note to ticket
 *   POST   /:id/resolve   - Resolve ticket with compensation
 *   DELETE /:id           - Delete ticket
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone, getOrCreateCustomer } = require('../../utils/customer-helpers');
const { processDeposit, processManualDeposit, issueVirtualCredit } = require('../../services/wallet-event-processor');

// Try to import SSE router for notifications
let sseRouter;
try {
    sseRouter = require('../realtime-sse');
} catch (e) {
    sseRouter = { notifyClients: () => {} };
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Tickets V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/tickets
 * List tickets (filtered, paginated)
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        page = 1,
        limit = 50,
        status,
        type,
        phone,
        order_id,
        assigned_to,
        priority,
        customer_id
    } = req.query;

    try {
        let query = `
            SELECT t.*, c.name as customer_full_name
            FROM customer_tickets t
            LEFT JOIN customers c ON t.customer_id = c.id
            WHERE t.status != 'DELETED'
        `;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND t.status = $${paramIndex++}`;
            params.push(status);
        }
        if (type) {
            query += ` AND t.type = $${paramIndex++}`;
            params.push(type);
        }
        if (phone) {
            query += ` AND t.phone = $${paramIndex++}`;
            params.push(normalizePhone(phone));
        }
        if (order_id) {
            query += ` AND t.order_id ILIKE $${paramIndex++}`;
            params.push(`%${order_id}%`);
        }
        if (assigned_to) {
            query += ` AND t.assigned_to = $${paramIndex++}`;
            params.push(assigned_to);
        }
        if (priority) {
            query += ` AND t.priority = $${paramIndex++}`;
            params.push(priority);
        }
        if (customer_id) {
            query += ` AND t.customer_id = $${paramIndex++}`;
            params.push(parseInt(customer_id));
        }

        // Count total
        const countQuery = query.replace(/SELECT t\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
        handleError(res, error, 'Failed to fetch tickets');
    }
});

/**
 * GET /api/v2/tickets/stats
 * Get ticket statistics
 */
router.get('/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM ticket_statistics');
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch ticket statistics');
    }
});

/**
 * GET /api/v2/tickets/:id
 * Get single ticket by code or ID
 */
router.get('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        const result = await db.query(`
            SELECT t.*, c.name as customer_full_name,
                   w.balance as wallet_balance, w.virtual_balance as wallet_virtual
            FROM customer_tickets t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN customer_wallets w ON t.phone = w.phone
            WHERE t.ticket_code = $1 OR t.firebase_id = $1 OR t.id = $2
        `, [id, parseInt(id) || 0]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch ticket');
    }
});

/**
 * POST /api/v2/tickets
 * Create new ticket
 */
router.post('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        phone,
        customer_name,
        customer_address,  // NEW: Address from order
        order_id,
        tpos_order_id,
        tracking_code,
        carrier,
        type,
        status,
        priority,
        subject,
        description,
        products,
        original_cod,
        new_cod,
        refund_amount,
        fix_cod_reason,
        boom_reason,  // For BOOM type: BOOM_HANG, TRUNG_DON, DOI_DIA_CHI
        internal_note,
        created_by,
        return_from_order_id,  // For RETURN_OLD_ORDER
        return_from_tpos_id    // For RETURN_OLD_ORDER
    } = req.body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !type) {
        return res.status(400).json({ success: false, error: 'Phone and type are required' });
    }

    try {
        // FRAUD PREVENTION: Check for duplicate RETURN tickets (1 order = 1 return ticket)
        if ((type === 'RETURN_CLIENT' || type === 'RETURN_SHIPPER') && order_id) {
            const existingReturn = await db.query(`
                SELECT id, ticket_code, type
                FROM customer_tickets
                WHERE order_id = $1
                  AND type IN ('RETURN_CLIENT', 'RETURN_SHIPPER')
                  AND status != 'CANCELLED'
                LIMIT 1
            `, [order_id]);

            if (existingReturn.rows.length > 0) {
                const existing = existingReturn.rows[0];
                const typeLabel = existing.type === 'RETURN_CLIENT' ? 'Khách gửi về' : 'Thu về';
                return res.status(400).json({
                    success: false,
                    error: 'DUPLICATE_RETURN_TICKET',
                    message: `Đơn hàng ${order_id} đã có ticket hoàn hàng: ${existing.ticket_code} (${typeLabel})`,
                    existing_ticket: {
                        id: existing.id,
                        ticket_code: existing.ticket_code,
                        type: existing.type
                    }
                });
            }
        }

        // Get or create customer
        const customerId = await getOrCreateCustomer(db, normalizedPhone, customer_name);

        // Sync customer address from order if provided and customer has no address
        if (customer_address && customerId) {
            await db.query(`
                UPDATE customers
                SET address = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND (address IS NULL OR TRIM(address) = '')
            `, [customer_address, customerId]);
        }

        // Insert ticket (ticket_code generated by trigger)
        const result = await db.query(`
            INSERT INTO customer_tickets (
                phone, customer_id, customer_name, order_id, tpos_order_id, tracking_code, carrier,
                type, status, priority, subject, description, products, original_cod, new_cod,
                refund_amount, fix_cod_reason, boom_reason, internal_note, created_by,
                return_from_order_id, return_from_tpos_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING *
        `, [
            normalizedPhone, customerId, customer_name, order_id, tpos_order_id || null,
            tracking_code, carrier, type, status || 'PENDING', priority || 'normal',
            subject, description, JSON.stringify(products || []),
            original_cod, new_cod, refund_amount, fix_cod_reason, boom_reason || null, internal_note, created_by,
            return_from_order_id || null, return_from_tpos_id || null
        ]);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'TICKET_CREATED', $3, 'ticket', $4, 'clipboard-list', 'blue')
        `, [normalizedPhone, customerId, `Sự vụ ${type} - ${order_id || 'N/A'}`, result.rows[0].ticket_code]);

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'created', ticket: result.rows[0] }, 'created');

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to create ticket');
    }
});

/**
 * PATCH /api/v2/tickets/:id
 * Update ticket
 */
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const updates = req.body;

    try {
        // Build dynamic update query
        const allowedFields = [
            'status', 'priority', 'subject', 'description', 'products',
            'original_cod', 'new_cod', 'refund_amount', 'fix_cod_reason',
            'assigned_to', 'internal_note', 'received_at', 'settled_at',
            'completed_at', 'carrier_deadline', 'virtual_credit_id',
            'refund_order_id', 'refund_number'
        ];

        const setClauses = [];
        const params = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex++}`);
                params.push(field === 'products' ? JSON.stringify(updates[field]) : updates[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        // Support lookup by ticket_code, firebase_id, or id
        params.push(id);
        params.push(parseInt(id) || 0);

        const query = `
            UPDATE customer_tickets
            SET ${setClauses.join(', ')}, updated_at = NOW()
            WHERE ticket_code = $${paramIndex} OR firebase_id = $${paramIndex} OR id = $${paramIndex + 1}
            RETURNING *
        `;

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'updated', ticket: result.rows[0] }, 'update');

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to update ticket');
    }
});

/**
 * POST /api/v2/tickets/:id/notes
 * Add note to ticket
 */
router.post('/:id/notes', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { note, performed_by } = req.body;

    if (!note) {
        return res.status(400).json({ success: false, error: 'Note is required' });
    }

    try {
        // Get ticket
        const ticketResult = await db.query(`
            SELECT * FROM customer_tickets
            WHERE ticket_code = $1 OR firebase_id = $1 OR id = $2
        `, [id, parseInt(id) || 0]);

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = ticketResult.rows[0];

        // Add note to action_history
        const actionLog = {
            action: 'note_added',
            note,
            performed_by: performed_by || 'system',
            performed_at: new Date().toISOString()
        };

        const actionHistory = ticket.action_history || [];
        actionHistory.push(actionLog);

        // Update ticket
        const result = await db.query(`
            UPDATE customer_tickets
            SET action_history = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [ticket.id, JSON.stringify(actionHistory)]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to add ticket note');
    }
});

/**
 * POST /api/v2/tickets/:id/resolve
 * Resolve ticket with optional compensation
 */
router.post('/:id/resolve', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { compensation_amount, compensation_type = 'virtual_credit', note, performed_by } = req.body;

    try {
        await db.query('BEGIN');

        // Get ticket
        const ticketResult = await db.query(`
            SELECT * FROM customer_tickets
            WHERE (ticket_code = $1 OR firebase_id = $1 OR id = $2) AND status != 'DELETED'
            FOR UPDATE
        `, [id, parseInt(id) || 0]);

        if (ticketResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = ticketResult.rows[0];
        const updates = {
            status: 'COMPLETED',
            completed_at: new Date().toISOString()
        };

        // Issue compensation if requested
        if (compensation_amount && compensation_amount > 0) {
            if (compensation_type === 'virtual_credit') {
                // Use centralized wallet-event-processor for virtual credit
                const vcResult = await issueVirtualCredit(
                    db,
                    ticket.phone,
                    compensation_amount,
                    ticket.ticket_code,
                    note || `Bồi thường ticket ${ticket.ticket_code}`,
                    15 // expires in 15 days
                );

                updates.virtual_credit_amount = compensation_amount;
                updates.wallet_credited = true;

            } else if (compensation_type === 'deposit') {
                // Use processManualDeposit for RETURN_CLIENT (return goods)
                // processDeposit is only for bank transfers with balance_history
                await processManualDeposit(
                    db,
                    ticket.phone,
                    compensation_amount,
                    'RETURN_GOODS', // Source: hàng trả về
                    ticket.ticket_code, // Reference ID
                    note || `Hoàn tiền ticket ${ticket.ticket_code}`,
                    ticket.customer_id
                );

                updates.refund_amount = compensation_amount;
                updates.wallet_credited = true;
            }
        }

        // Update action history
        const actionLog = {
            action: 'resolved',
            old_status: ticket.status,
            new_status: 'COMPLETED',
            compensation_amount,
            compensation_type,
            performed_by: performed_by || 'system',
            performed_at: new Date().toISOString(),
            note
        };

        const actionHistory = ticket.action_history || [];
        actionHistory.push(actionLog);

        // Update ticket
        await db.query(`
            UPDATE customer_tickets
            SET status = $2, completed_at = $3,
                virtual_credit_id = COALESCE($4, virtual_credit_id),
                virtual_credit_amount = COALESCE($5, virtual_credit_amount),
                refund_amount = COALESCE($6, refund_amount),
                wallet_credited = COALESCE($7, wallet_credited),
                action_history = $8,
                updated_at = NOW()
            WHERE id = $1
        `, [
            ticket.id, updates.status, updates.completed_at,
            updates.virtual_credit_id, updates.virtual_credit_amount,
            updates.refund_amount, updates.wallet_credited,
            JSON.stringify(actionHistory)
        ]);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'TICKET_COMPLETED', $3, $4, 'ticket', $5, 'check-circle', 'green')
        `, [
            ticket.phone, ticket.customer_id,
            `Hoàn thành ticket ${ticket.ticket_code}`,
            compensation_amount ? `Bồi thường: ${parseFloat(compensation_amount).toLocaleString()}đ` : 'Không bồi thường',
            ticket.ticket_code
        ]);

        await db.query('COMMIT');

        // Fetch updated ticket
        const updatedResult = await db.query('SELECT * FROM customer_tickets WHERE id = $1', [ticket.id]);

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'resolved', ticket: updatedResult.rows[0] }, 'update');

        res.json({ success: true, data: updatedResult.rows[0] });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to resolve ticket');
    }
});

/**
 * GET /api/v2/tickets/:id/can-delete
 * Check if ticket can be deleted (virtual credit not used)
 */
router.get('/:id/can-delete', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        // Find ticket
        const findResult = await db.query(`
            SELECT * FROM customer_tickets
            WHERE ticket_code = $1 OR firebase_id = $1 OR id = $2
        `, [id, parseInt(id) || 0]);

        if (findResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = findResult.rows[0];

        // Check if ticket is RETURN_SHIPPER with virtual credit
        if (ticket.type === 'RETURN_SHIPPER') {
            // Check for linked virtual credit
            const creditResult = await db.query(`
                SELECT id, original_amount, remaining_amount, used_in_orders, status
                FROM virtual_credits
                WHERE source_id IN ($1, $2) AND source_type = 'RETURN_SHIPPER' AND status = 'ACTIVE'
                LIMIT 1
            `, [ticket.ticket_code, ticket.order_id]);

            if (creditResult.rows.length > 0) {
                const vc = creditResult.rows[0];
                const usedOrders = vc.used_in_orders || [];
                const originalAmount = parseFloat(vc.original_amount);
                const remainingAmount = parseFloat(vc.remaining_amount);

                // Check if virtual credit has been used
                if (usedOrders.length > 0 || remainingAmount < originalAmount) {
                    return res.json({
                        success: true,
                        canDelete: false,
                        reason: `Công nợ ảo đã được sử dụng (đã dùng: ${(originalAmount - remainingAmount).toLocaleString()}đ, còn lại: ${remainingAmount.toLocaleString()}đ)`,
                        virtualCredit: {
                            id: vc.id,
                            originalAmount: originalAmount,
                            remainingAmount: remainingAmount,
                            usedOrdersCount: usedOrders.length
                        }
                    });
                }

                // Virtual credit exists but not used - can delete
                return res.json({
                    success: true,
                    canDelete: true,
                    virtualCreditId: vc.id,
                    message: 'Công nợ ảo chưa sử dụng sẽ được hủy khi xóa ticket'
                });
            }
        }

        // No virtual credit linked - can delete
        res.json({ success: true, canDelete: true });
    } catch (error) {
        handleError(res, error, 'Failed to check delete permission');
    }
});

/**
 * DELETE /api/v2/tickets/:id
 * Delete ticket (soft or hard delete)
 * For RETURN_SHIPPER: Also cancels unused virtual credit
 */
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { hard } = req.query;

    try {
        // Find ticket
        const findResult = await db.query(`
            SELECT * FROM customer_tickets
            WHERE ticket_code = $1 OR firebase_id = $1 OR id = $2
        `, [id, parseInt(id) || 0]);

        if (findResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = findResult.rows[0];

        // =====================================================
        // RETURN_SHIPPER: Check and cancel unused virtual credit
        // =====================================================
        let virtualCreditCancelled = false;
        if (ticket.type === 'RETURN_SHIPPER') {
            // Check for linked virtual credit
            const creditResult = await db.query(`
                SELECT id, original_amount, remaining_amount, used_in_orders, wallet_id
                FROM virtual_credits
                WHERE source_id IN ($1, $2) AND source_type = 'RETURN_SHIPPER' AND status = 'ACTIVE'
            `, [ticket.ticket_code, ticket.order_id]);

            if (creditResult.rows.length > 0) {
                const vc = creditResult.rows[0];
                const usedOrders = vc.used_in_orders || [];
                const originalAmount = parseFloat(vc.original_amount);
                const remainingAmount = parseFloat(vc.remaining_amount);

                // Check if virtual credit has been used - BLOCK DELETE
                if (usedOrders.length > 0 || remainingAmount < originalAmount) {
                    return res.status(400).json({
                        success: false,
                        error: 'CANNOT_DELETE_USED_CREDIT',
                        message: `Không thể xóa: Công nợ ảo đã được sử dụng (đã dùng: ${(originalAmount - remainingAmount).toLocaleString()}đ)`
                    });
                }

                // Cancel unused virtual credit
                await db.query(`
                    UPDATE virtual_credits
                    SET status = 'CANCELLED', updated_at = NOW()
                    WHERE id = $1
                `, [vc.id]);

                // Update wallet virtual_balance and log transaction for audit trail
                if (vc.wallet_id) {
                    // Get current balance before update
                    const walletBefore = await db.query(
                        'SELECT virtual_balance FROM customer_wallets WHERE id = $1',
                        [vc.wallet_id]
                    );
                    const virtualBalanceBefore = parseFloat(walletBefore.rows[0]?.virtual_balance || 0);
                    const virtualBalanceAfter = virtualBalanceBefore - originalAmount;

                    await db.query(`
                        UPDATE customer_wallets
                        SET virtual_balance = virtual_balance - $1, updated_at = NOW()
                        WHERE id = $2
                    `, [originalAmount, vc.wallet_id]);

                    // LOG TRANSACTION FOR AUDIT TRAIL
                    await db.query(`
                        INSERT INTO wallet_transactions (
                            phone, wallet_id, type, amount,
                            virtual_balance_before, virtual_balance_after,
                            source, reference_type, reference_id, note
                        ) VALUES ($1, $2, 'VIRTUAL_CANCEL', $3, $4, $5,
                            'VIRTUAL_CREDIT_CANCEL', 'ticket', $6, $7)
                    `, [
                        ticket.phone,
                        vc.wallet_id,
                        -originalAmount,  // Negative amount for cancellation
                        virtualBalanceBefore,
                        virtualBalanceAfter,
                        ticket.ticket_code,
                        `Thu hồi công nợ ảo - Xóa phiếu ${ticket.ticket_code}`
                    ]);
                    console.log(`[Tickets V2] Logged wallet transaction for virtual credit cancellation`);
                }

                virtualCreditCancelled = true;
                console.log(`[Tickets V2] Cancelled virtual credit ${vc.id} (${originalAmount}đ) for ticket ${ticket.ticket_code}`);
            }
        }

        if (hard === 'true') {
            // Hard delete
            await db.query('DELETE FROM customer_tickets WHERE id = $1', [ticket.id]);
        } else {
            // Soft delete
            await db.query(`
                UPDATE customer_tickets
                SET status = 'DELETED', updated_at = NOW()
                WHERE id = $1
            `, [ticket.id]);
        }

        // Log activity
        const activityTitle = virtualCreditCancelled
            ? `Xóa ticket ${ticket.ticket_code} + Hủy công nợ ảo`
            : `Xóa ticket ${ticket.ticket_code}`;
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'TICKET_DELETED', $3, 'ticket', $4, 'trash', 'red')
        `, [ticket.phone, ticket.customer_id, activityTitle, ticket.ticket_code]);

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'deleted', ticketCode: ticket.ticket_code }, 'deleted');

        res.json({
            success: true,
            message: hard === 'true' ? 'Ticket permanently deleted' : 'Ticket soft deleted',
            ticketCode: ticket.ticket_code,
            virtualCreditCancelled: virtualCreditCancelled
        });
    } catch (error) {
        handleError(res, error, 'Failed to delete ticket');
    }
});

/**
 * POST /api/v2/tickets/:id/resolve-credit
 * Issue virtual credit when creating RETURN_SHIPPER ticket
 * This is called immediately after ticket creation (before goods are returned)
 */
router.post('/:id/resolve-credit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { phone, amount, ticket_code, note, expires_in_days = 15 } = req.body;

    console.log(`[Tickets V2] resolve-credit called: id=${id}, phone=${phone}, amount=${amount}, ticket_code=${ticket_code}`);
    console.log(`[Tickets V2] db available:`, !!db);

    if (!db) {
        console.error('[Tickets V2] ERROR: chatDb is not available!');
        return res.status(500).json({
            success: false,
            error: 'Database connection not available'
        });
    }

    if (!phone || !amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Phone and positive amount are required'
        });
    }

    try {
        // FRAUD PREVENTION: Check if virtual credit already issued for this ticket
        const ticketRef = ticket_code || id;
        const existingCredit = await db.query(`
            SELECT id, original_amount, created_at
            FROM virtual_credits
            WHERE source_id = $1 AND source_type = 'RETURN_SHIPPER' AND status = 'ACTIVE'
            LIMIT 1
        `, [ticketRef]);

        if (existingCredit.rows.length > 0) {
            const existing = existingCredit.rows[0];
            console.log(`[Tickets V2] FRAUD BLOCKED: Virtual credit already exists for ${ticketRef}`);
            return res.status(400).json({
                success: false,
                error: 'DUPLICATE_VIRTUAL_CREDIT',
                message: `Ticket ${ticketRef} đã được cấp công nợ ảo: ${parseFloat(existing.original_amount).toLocaleString()}đ`,
                existing_credit: {
                    id: existing.id,
                    amount: existing.original_amount,
                    created_at: existing.created_at
                }
            });
        }

        console.log(`[Tickets V2] Issuing virtual credit: ${phone} - ${amount}đ for ticket ${ticket_code || id}`);

        // Issue virtual credit using wallet-event-processor
        const result = await issueVirtualCredit(
            db,
            phone,
            parseFloat(amount),
            ticket_code || id,
            note || `Công nợ ảo - Thu về đơn hàng`,
            expires_in_days
        );

        console.log(`[Tickets V2] Virtual credit issued successfully:`, result);

        // Update ticket with virtual_credit_id for tracking
        if (result.virtual_credit_id) {
            await db.query(`
                UPDATE customer_tickets
                SET virtual_credit_id = $1, updated_at = NOW()
                WHERE ticket_code = $2 OR firebase_id = $2 OR id = $3
            `, [result.virtual_credit_id, ticketRef, parseInt(id) || 0]);
            console.log(`[Tickets V2] Updated ticket ${ticketRef} with virtual_credit_id: ${result.virtual_credit_id}`);
        }

        res.json({
            success: true,
            data: result,
            message: `Đã cấp ${parseFloat(amount).toLocaleString()}đ công nợ ảo cho ${phone}`
        });
    } catch (error) {
        console.error(`[Tickets V2] resolve-credit ERROR:`, error.message);
        console.error(`[Tickets V2] Full error:`, error);
        handleError(res, error, 'Failed to issue virtual credit');
    }
});

module.exports = router;
