/**
 * =====================================================
 * CUSTOMER 360° API ROUTES
 * =====================================================
 *
 * RESTful API endpoints for Customer 360° system
 *
 * Routes:
 *   /api/customer/:phone        - Customer 360° view
 *   /api/wallet/:phone          - Wallet operations
 *   /api/ticket                 - Ticket operations
 *
 * Created: 2026-01-07
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const sseRouter = require('./realtime-sse');
const { normalizePhone, getOrCreateCustomer } = require('../utils/customer-helpers');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Customer360] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// CUSTOMER ROUTES
// =====================================================

/**
 * GET /api/customer/:phone
 * Get full Customer 360° view
 */
router.get('/customer/:phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        // Get customer info
        const customerResult = await db.query(`
            SELECT c.*,
                w.balance as wallet_balance,
                w.virtual_balance as wallet_virtual_balance,
                (w.balance + w.virtual_balance) as wallet_total
            FROM customers c
            LEFT JOIN customer_wallets w ON c.phone = w.phone
            WHERE c.phone = $1
        `, [phone]);

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT id, original_amount, remaining_amount, issued_at, expires_at, status, source_type
            FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        // Get recent tickets (last 10)
        const ticketsResult = await db.query(`
            SELECT ticket_code, type, status, order_id, refund_amount, created_at
            FROM customer_tickets
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT 10
        `, [phone]);

        // Get recent activities (last 20)
        const activitiesResult = await db.query(`
            SELECT activity_type, title, description, icon, color, created_at
            FROM customer_activities
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT 20
        `, [phone]);

        // Get notes
        const notesResult = await db.query(`
            SELECT id, content, is_pinned, category, created_by, created_at
            FROM customer_notes
            WHERE phone = $1
            ORDER BY is_pinned DESC, created_at DESC
        `, [phone]);

        // Get ticket statistics
        const ticketStatsResult = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED')) as pending,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
                SUM(refund_amount) FILTER (WHERE status = 'COMPLETED') as total_refunded
            FROM customer_tickets
            WHERE phone = $1
        `, [phone]);

        res.json({
            success: true,
            data: {
                customer: {
                    ...customer,
                    ticketStats: ticketStatsResult.rows[0],
                },
                wallet: {
                    balance: customer.wallet_balance || 0,
                    virtualBalance: customer.wallet_virtual_balance || 0,
                    total: customer.wallet_total || 0,
                    virtualCredits: creditsResult.rows,
                },
                recentTickets: ticketsResult.rows,
                recentActivities: activitiesResult.rows,
                notes: notesResult.rows,
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer 360 data');
    }
});

/**
 * POST /api/customer
 * Create new customer
 */
router.post('/customer', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, name, email, address, status, tags } = req.body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        const result = await db.query(`
            INSERT INTO customers (phone, name, email, address, status, tags)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (phone) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, customers.name),
                email = COALESCE(EXCLUDED.email, customers.email),
                address = COALESCE(EXCLUDED.address, customers.address),
                status = COALESCE(EXCLUDED.status, customers.status),
                tags = COALESCE(EXCLUDED.tags, customers.tags),
                updated_at = NOW()
            RETURNING *
        `, [normalizedPhone, name || 'Unknown', email, address, status || 'Bình thường', JSON.stringify(tags || [])]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to create customer');
    }
});

/**
 * PUT /api/customer/:phone
 * Update customer
 */
router.put('/customer/:phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { name, email, address, status, tier, tags, internal_note } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        const result = await db.query(`
            UPDATE customers SET
                name = COALESCE($2, name),
                email = COALESCE($3, email),
                address = COALESCE($4, address),
                status = COALESCE($5, status),
                tier = COALESCE($6, tier),
                tags = COALESCE($7, tags),
                internal_note = COALESCE($8, internal_note),
                updated_at = NOW()
            WHERE phone = $1
            RETURNING *
        `, [phone, name, email, address, status, tier, tags ? JSON.stringify(tags) : null, internal_note]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to update customer');
    }
});

/**
 * GET /api/customer/:phone/tickets
 * Get customer tickets (paginated)
 */
router.get('/customer/:phone/tickets', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { page = 1, limit = 20, status } = req.query;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        let query = `
            SELECT * FROM customer_tickets
            WHERE phone = $1
        `;
        const params = [phone];

        if (status) {
            query += ` AND status = $2`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await db.query(query, params);

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM customer_tickets WHERE phone = $1${status ? ' AND status = $2' : ''}`,
            status ? [phone, status] : [phone]
        );

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit),
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer tickets');
    }
});

/**
 * GET /api/customer/:phone/activities
 * Get customer activity timeline (paginated)
 */
router.get('/customer/:phone/activities', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { page = 1, limit = 50 } = req.query;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        const result = await db.query(`
            SELECT * FROM customer_activities
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [phone, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer activities');
    }
});

/**
 * POST /api/customer/:phone/note
 * Add note to customer
 */
router.post('/customer/:phone/note', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { content, category, is_pinned, created_by } = req.body;

    if (!phone || !content) {
        return res.status(400).json({ success: false, error: 'Phone and content are required' });
    }

    try {
        // Get customer_id
        const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
        const customerId = customerResult.rows[0]?.id;

        const result = await db.query(`
            INSERT INTO customer_notes (phone, customer_id, content, category, is_pinned, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [phone, customerId, content, category || 'general', is_pinned || false, created_by || 'system']);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, icon, color)
            VALUES ($1, $2, 'NOTE_ADDED', $3, 'sticky-note', 'yellow')
        `, [phone, customerId, content.substring(0, 100)]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to add customer note');
    }
});

/**
 * GET /api/customer/:phone/transactions
 * Get wallet transaction history (paginated)
 */
router.get('/customer/:phone/transactions', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { page = 1, limit = 50, type } = req.query;

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        let query = `SELECT * FROM wallet_transactions WHERE phone = $1`;
        const params = [phone];

        if (type) {
            query += ` AND type = $2`;
            params.push(type);
        }

        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

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
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer transactions');
    }
});

/**
 * POST /api/customer/batch
 * Batch lookup multiple customers by phone
 */
router.post('/customer/batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ success: false, error: 'Phones array is required' });
    }

    const normalizedPhones = phones.map(normalizePhone).filter(Boolean);

    if (normalizedPhones.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid phone numbers provided' });
    }

    try {
        const result = await db.query(`
            SELECT c.*,
                w.balance as wallet_balance,
                w.virtual_balance as wallet_virtual_balance,
                (COALESCE(w.balance, 0) + COALESCE(w.virtual_balance, 0)) as wallet_total
            FROM customers c
            LEFT JOIN customer_wallets w ON c.phone = w.phone
            WHERE c.phone = ANY($1)
        `, [normalizedPhones]);

        const customerMap = {};
        result.rows.forEach(row => {
            customerMap[row.phone] = {
                ...row,
                wallet: {
                    balance: parseFloat(row.wallet_balance) || 0,
                    virtualBalance: parseFloat(row.wallet_virtual_balance) || 0,
                    total: parseFloat(row.wallet_total) || 0,
                },
            };
        });

        res.json({
            success: true,
            data: customerMap,
            found: result.rows.length,
            notFound: normalizedPhones.filter(p => !customerMap[p]),
        });
    } catch (error) {
        handleError(res, error, 'Failed to batch lookup customers');
    }
});

/**
 * POST /api/customer/search
 * Search customers
 */
router.post('/customer-search-v2', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { query, limit = 50 } = req.body;

    if (!query || query.length < 2) {
        return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    try {
        const result = await db.query(`
            SELECT * FROM search_customers_priority($1, $2)
        `, [query, parseInt(limit)]);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        handleError(res, error, 'Failed to search customers');
    }
});

// =====================================================
// WALLET ROUTES
// =====================================================

/**
 * GET /api/wallet/:phone
 * Get wallet info with active virtual credits
 */
router.get('/wallet/:phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
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
                    virtualCredits: [],
                },
            });
        }

        const wallet = walletResult.rows[0];

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT * FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        res.json({
            success: true,
            data: {
                ...wallet,
                virtualCredits: creditsResult.rows,
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet');
    }
});

/**
 * POST /api/wallet/:phone/deposit
 * Deposit to wallet (real balance)
 */
router.post('/wallet/:phone/deposit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { amount, source, reference_id, note, created_by } = req.body;

    if (!phone || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
    }

    try {
        // Begin transaction
        await db.query('BEGIN');

        // Get or create wallet
        let walletResult = await db.query(`
            INSERT INTO customer_wallets (phone, balance)
            VALUES ($1, 0)
            ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
            RETURNING *
        `, [phone]);

        const wallet = walletResult.rows[0];

        // Update balance
        const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
        await db.query(`
            UPDATE customer_wallets
            SET balance = $2, total_deposited = total_deposited + $3, updated_at = NOW()
            WHERE id = $1
        `, [wallet.id, newBalance, amount]);

        // Log transaction
        await db.query(`
            INSERT INTO wallet_transactions
            (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note, created_by)
            VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, $6, $7, $8, $9)
        `, [phone, wallet.id, amount, wallet.balance, newBalance, source || 'MANUAL_ADJUSTMENT', reference_id, note, created_by]);

        await db.query('COMMIT');

        res.json({
            success: true,
            data: {
                phone,
                deposited: amount,
                newBalance,
            },
        });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to deposit to wallet');
    }
});

/**
 * POST /api/wallet/:phone/withdraw
 * Withdraw from wallet (FIFO virtual credits first)
 */
router.post('/wallet/:phone/withdraw', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { amount, order_id, note } = req.body;

    if (!phone || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
    }

    try {
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
                requested: amount,
                virtualUsed: withdrawal.virtual_used,
                realUsed: withdrawal.real_used,
                totalUsed: withdrawal.total_used,
                newBalance: withdrawal.new_balance,
                newVirtualBalance: withdrawal.new_virtual_balance,
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to withdraw from wallet');
    }
});

/**
 * POST /api/wallet/:phone/virtual-credit
 * Issue virtual credit
 */
router.post('/wallet/:phone/virtual-credit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const phone = normalizePhone(req.params.phone);
    const { amount, source_type, source_id, expiry_days = 15, note, created_by } = req.body;

    if (!phone || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid phone or amount' });
    }

    try {
        await db.query('BEGIN');

        // Get or create wallet
        let walletResult = await db.query(`
            INSERT INTO customer_wallets (phone, virtual_balance)
            VALUES ($1, 0)
            ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
            RETURNING *
        `, [phone]);

        const wallet = walletResult.rows[0];

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiry_days);

        // Create virtual credit
        const vcResult = await db.query(`
            INSERT INTO virtual_credits
            (phone, wallet_id, original_amount, remaining_amount, expires_at, source_type, source_id, note, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [phone, wallet.id, amount, amount, expiresAt.toISOString(), source_type || 'RETURN_SHIPPER', source_id, note, created_by]);

        // Update wallet virtual balance
        const newVirtualBalance = parseFloat(wallet.virtual_balance) + parseFloat(amount);
        await db.query(`
            UPDATE customer_wallets
            SET virtual_balance = $2, total_virtual_issued = total_virtual_issued + $3, updated_at = NOW()
            WHERE id = $1
        `, [wallet.id, newVirtualBalance, amount]);

        // Log transaction
        await db.query(`
            INSERT INTO wallet_transactions
            (phone, wallet_id, type, amount, virtual_balance_before, virtual_balance_after, source, reference_id, note, created_by)
            VALUES ($1, $2, 'VIRTUAL_CREDIT', $3, $4, $5, 'VIRTUAL_CREDIT_ISSUE', $6, $7, $8)
        `, [phone, wallet.id, amount, wallet.virtual_balance, newVirtualBalance, vcResult.rows[0].id, note, created_by]);

        await db.query('COMMIT');

        res.json({
            success: true,
            data: {
                virtualCredit: vcResult.rows[0],
                newVirtualBalance,
            },
        });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to issue virtual credit');
    }
});

/**
 * POST /api/wallet/batch-summary
 * Get wallet summary for multiple phones
 */
router.post('/wallet/batch-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ success: false, error: 'Phones array is required' });
    }

    const normalizedPhones = phones.map(normalizePhone).filter(Boolean);

    try {
        const result = await db.query(`
            SELECT phone, balance, virtual_balance, (balance + virtual_balance) as total
            FROM customer_wallets
            WHERE phone = ANY($1)
        `, [normalizedPhones]);

        // Build map
        const walletMap = {};
        result.rows.forEach(row => {
            walletMap[row.phone] = {
                balance: parseFloat(row.balance),
                virtualBalance: parseFloat(row.virtual_balance),
                total: parseFloat(row.total),
            };
        });

        // Fill missing phones with zeros
        normalizedPhones.forEach(phone => {
            if (!walletMap[phone]) {
                walletMap[phone] = { balance: 0, virtualBalance: 0, total: 0 };
            }
        });

        res.json({ success: true, data: walletMap });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet batch summary');
    }
});

/**
 * POST /api/wallet/cron/expire
 * Cron endpoint to expire virtual credits
 */
router.post('/wallet/cron/expire', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');

        res.json({
            success: true,
            data: {
                expiredCount: result.rows[0].expired_count,
                totalExpiredAmount: result.rows[0].total_expired_amount,
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to expire virtual credits');
    }
});

/**
 * POST /api/wallet/cron/process-bank-transactions
 * Process unprocessed bank transactions from balance_history
 * Links transactions to customer wallets and updates balances
 *
 * NOTE: balance_history uses linked_customer_phone (set by sepay-webhook.js)
 *       and transfer_amount for the transaction amount
 */
router.post('/wallet/cron/process-bank-transactions', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 100 } = req.body;

    try {
        await db.query('BEGIN');

        // Get unprocessed bank transactions that have customer phone linked
        // Uses linked_customer_phone (set by sepay-webhook processDebtUpdate)
        // and transfer_amount (original SePay column name)
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

                // Update wallet balance
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
                `, [normalizedPhone, `Nạp tiền: ${tx.amount.toLocaleString()}đ`, tx.description || 'Chuyển khoản ngân hàng']);

                processed.push({
                    id: tx.id,
                    phone: normalizedPhone,
                    amount: tx.amount,
                    newBalance,
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
                errors,
            },
        });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to process bank transactions');
    }
});

// =====================================================
// TICKET ROUTES
// =====================================================

/**
 * GET /api/ticket
 * List tickets (filtered, paginated)
 */
router.get('/ticket', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 50, status, type, phone, order_id, assigned_to } = req.query;

    try {
        let query = `SELECT * FROM customer_tickets WHERE 1=1`;
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = $${paramIndex++}`;
            params.push(status);
        }
        if (type) {
            query += ` AND type = $${paramIndex++}`;
            params.push(type);
        }
        if (phone) {
            const normalizedPhone = normalizePhone(phone);
            query += ` AND phone = $${paramIndex++}`;
            params.push(normalizedPhone);
        }
        if (order_id) {
            query += ` AND order_id ILIKE $${paramIndex++}`;
            params.push(`%${order_id}%`);
        }
        if (assigned_to) {
            query += ` AND assigned_to = $${paramIndex++}`;
            params.push(assigned_to);
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch tickets');
    }
});

/**
 * GET /api/ticket/stats
 * Get ticket statistics
 */
router.get('/ticket/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM ticket_statistics');
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch ticket statistics');
    }
});

/**
 * GET /api/ticket/:code
 * Get single ticket by code
 */
router.get('/ticket/:code', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { code } = req.params;

    try {
        const result = await db.query(`
            SELECT t.*, c.name as customer_full_name, w.balance as wallet_balance, w.virtual_balance as wallet_virtual
            FROM customer_tickets t
            LEFT JOIN customers c ON t.phone = c.phone
            LEFT JOIN customer_wallets w ON t.phone = w.phone
            WHERE t.ticket_code = $1 OR t.firebase_id = $1
        `, [code]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch ticket');
    }
});

/**
 * POST /api/ticket
 * Create new ticket
 */
router.post('/ticket', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        phone, customer_name, order_id, tpos_order_id, tracking_code, carrier,
        type, status, priority, products, original_cod, new_cod,
        refund_amount, fix_cod_reason, internal_note, created_by,
    } = req.body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !type) {
        return res.status(400).json({ success: false, error: 'Phone and type are required' });
    }

    try {
        const customerId = await getOrCreateCustomer(db, normalizedPhone, customer_name);

        // Insert ticket (ticket_code generated by trigger)
        const result = await db.query(`
            INSERT INTO customer_tickets (
                phone, customer_id, customer_name, order_id, tpos_order_id, tracking_code, carrier,
                type, status, priority, products, original_cod, new_cod,
                refund_amount, fix_cod_reason, internal_note, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `, [
            normalizedPhone, customerId, customer_name, order_id, tpos_order_id || null, tracking_code, carrier,
            type, status || 'PENDING', priority || 'normal', JSON.stringify(products || []),
            original_cod, new_cod, refund_amount, fix_cod_reason, internal_note, created_by,
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
 * PUT /api/ticket/:code
 * Update ticket
 */
router.put('/ticket/:code', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { code } = req.params;
    const updates = req.body;

    try {
        // Build dynamic update query
        const allowedFields = [
            'status', 'priority', 'products', 'original_cod', 'new_cod',
            'refund_amount', 'fix_cod_reason', 'assigned_to', 'internal_note',
            'received_at', 'settled_at', 'completed_at', 'refund_order_id', 'refund_number',
        ];

        const setClauses = [];
        const params = [code];
        let paramIndex = 2;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex++}`);
                params.push(field === 'products' ? JSON.stringify(updates[field]) : updates[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        const query = `
            UPDATE customer_tickets
            SET ${setClauses.join(', ')}, updated_at = NOW()
            WHERE ticket_code = $1 OR firebase_id = $1
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
 * POST /api/ticket/:code/action
 * Perform action on ticket (receive_goods, settle, complete)
 */
router.post('/ticket/:code/action', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { code } = req.params;
    const { action, note, performed_by } = req.body;

    const validActions = ['receive_goods', 'settle', 'complete', 'cancel'];
    if (!validActions.includes(action)) {
        return res.status(400).json({ success: false, error: `Invalid action. Valid: ${validActions.join(', ')}` });
    }

    try {
        await db.query('BEGIN');

        // Get current ticket
        const ticketResult = await db.query(`
            SELECT * FROM customer_tickets WHERE ticket_code = $1 OR firebase_id = $1 FOR UPDATE
        `, [code]);

        if (ticketResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const ticket = ticketResult.rows[0];
        let newStatus = ticket.status;
        const updates = { updated_at: new Date().toISOString() };

        // Process action
        switch (action) {
            case 'receive_goods':
                newStatus = 'PENDING_FINANCE';
                updates.received_at = new Date().toISOString();
                break;

            case 'settle':
                newStatus = 'PENDING_FINANCE';
                updates.settled_at = new Date().toISOString();
                break;

            case 'complete':
                newStatus = 'COMPLETED';
                updates.completed_at = new Date().toISOString();

                // Issue virtual credit if RETURN_SHIPPER and has refund amount
                if (ticket.type === 'RETURN_SHIPPER' && ticket.refund_amount > 0 && !ticket.wallet_credited) {
                    const vcResult = await db.query(`
                        INSERT INTO virtual_credits
                        (phone, original_amount, remaining_amount, expires_at, source_type, source_id, note)
                        VALUES ($1, $2, $2, NOW() + INTERVAL '15 days', 'RETURN_SHIPPER', $3, $4)
                        RETURNING id
                    `, [ticket.phone, ticket.refund_amount, ticket.ticket_code, `Cong no ao tu ticket ${ticket.ticket_code}`]);

                    // Update wallet virtual balance
                    await db.query(`
                        UPDATE customer_wallets
                        SET virtual_balance = virtual_balance + $2, total_virtual_issued = total_virtual_issued + $2
                        WHERE phone = $1
                    `, [ticket.phone, ticket.refund_amount]);

                    updates.virtual_credit_id = vcResult.rows[0].id;
                    updates.virtual_credit_amount = ticket.refund_amount;
                    updates.wallet_credited = true;
                }
                break;

            case 'cancel':
                newStatus = 'CANCELLED';
                break;
        }

        // Update action history
        const actionLog = {
            action,
            old_status: ticket.status,
            new_status: newStatus,
            performed_by: performed_by || 'system',
            performed_at: new Date().toISOString(),
            note,
        };

        const actionHistory = ticket.action_history || [];
        actionHistory.push(actionLog);

        // Update ticket
        await db.query(`
            UPDATE customer_tickets
            SET status = $2, action_history = $3,
                received_at = COALESCE($4, received_at),
                settled_at = COALESCE($5, settled_at),
                completed_at = COALESCE($6, completed_at),
                virtual_credit_id = COALESCE($7, virtual_credit_id),
                virtual_credit_amount = COALESCE($8, virtual_credit_amount),
                wallet_credited = COALESCE($9, wallet_credited),
                updated_at = NOW()
            WHERE id = $1
        `, [
            ticket.id, newStatus, JSON.stringify(actionHistory),
            updates.received_at, updates.settled_at, updates.completed_at,
            updates.virtual_credit_id, updates.virtual_credit_amount, updates.wallet_credited,
        ]);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'TICKET_UPDATED', $3, $4, 'ticket', $5, 'clipboard-check', $6)
        `, [
            ticket.phone, ticket.customer_id,
            `Ticket ${action}: ${ticket.ticket_code}`,
            note || '',
            ticket.ticket_code,
            action === 'complete' ? 'green' : action === 'cancel' ? 'red' : 'blue',
        ]);

        await db.query('COMMIT');

        // Fetch updated ticket
        const updatedResult = await db.query('SELECT * FROM customer_tickets WHERE id = $1', [ticket.id]);

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'updated', ticket: updatedResult.rows[0] }, 'update');

        res.json({ success: true, data: updatedResult.rows[0] });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to perform ticket action');
    }
});

/**
 * GET /api/balance-history/unlinked
 * Get unlinked bank transactions (balance_history without linked customer)
 * Query params:
 *   - page: page number (default 1)
 *   - limit: items per page (default 10)
 */
router.get('/balance-history/unlinked', async (req, res) => {
    const db = req.app.locals.chatDb;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // Get total count of unlinked transactions
        const countResult = await db.query(`
            SELECT COUNT(*) as total
            FROM balance_history
            WHERE linked_customer_phone IS NULL
              AND transfer_amount > 0
              AND transfer_type = 'in'
        `);
        const total = parseInt(countResult.rows[0].total);

        // Get unlinked transactions with pagination
        const result = await db.query(`
            SELECT id, sepay_id, code as transaction_code, content as customer_name,
                   transfer_amount as amount, description,
                   transaction_date, account_number as bank_account, reference_code, created_at
            FROM balance_history
            WHERE linked_customer_phone IS NULL
              AND transfer_amount > 0
              AND transfer_type = 'in'
            ORDER BY transaction_date DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({
            success: true,
            data: {
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch unlinked transactions');
    }
});

/**
 * POST /api/balance-history/link-customer
 * Links a balance_history transaction to a customer and optionally deposits to wallet.
 * Auto-creates customer if not found.
 */
router.post('/balance-history/link-customer', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { transaction_id, phone, auto_deposit = false } = req.body;

    if (!transaction_id || !phone) {
        return res.status(400).json({ success: false, error: 'Transaction ID and phone are required' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [transaction_id]
        );

        if (txResult.rows.length === 0) {
            throw new Error('Transaction not found');
        }

        const tx = txResult.rows[0];

        // 2. Get or create customer
        const customerId = await getOrCreateCustomer(db, phone, tx.customer_name);

        // 3. Link transaction to customer
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = $1,
                customer_id = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [phone, customerId, transaction_id]);

        // 4. Optional: Auto deposit to wallet
        if (auto_deposit && tx.transfer_amount > 0) {
            // Get or create wallet (should exist after customer creation, but ensure)
            let walletResult = await db.query(`
                INSERT INTO customer_wallets (phone, balance)
                VALUES ($1, 0)
                ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
                RETURNING *
            `, [phone]);
            const wallet = walletResult.rows[0];

            // Update wallet balance
            const newBalance = parseFloat(wallet.balance) + parseFloat(tx.transfer_amount);
            await db.query(`
                UPDATE customer_wallets
                SET balance = $2, total_deposited = total_deposited + $3, updated_at = NOW()
                WHERE id = $1
            `, [wallet.id, newBalance, tx.transfer_amount]);

            // Log wallet transaction
            await db.query(`
                INSERT INTO wallet_transactions (
                    phone, wallet_id, type, amount, balance_before, balance_after, source,
                    reference_type, reference_id, note
                )
                SELECT $1, id, 'DEPOSIT', $2, $3, $4, 'BANK_TRANSFER',
                       'balance_history', $5::text, $6
                FROM customer_wallets WHERE phone = $1
            `, [phone, tx.transfer_amount, wallet.balance, newBalance, transaction_id, `Nạp từ CK ${tx.code || tx.reference_code}`]);

            // Mark balance_history transaction as wallet processed
            await db.query(`
                UPDATE balance_history
                SET wallet_processed = TRUE
                WHERE id = $1
            `, [transaction_id]);

            // Log activity
            await db.query(`
                INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
                VALUES ($1, $2, 'WALLET_DEPOSIT', $3, $4, 'balance_history', $5, 'university', 'green')
            `, [phone, customerId, `Nạp tiền: ${tx.transfer_amount.toLocaleString()}đ`, `Chuyển khoản ngân hàng (${tx.code || tx.reference_code})`, transaction_id]);
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã liên kết giao dịch với khách hàng',
            data: { customer_id: customerId, auto_deposited: auto_deposit }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('[LINK-CUSTOMER] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/ticket/:code
 * Delete a ticket (soft or hard delete)
 * Query params:
 *   - hard=true: permanently delete the ticket
 *   - (default): soft delete - marks ticket as deleted
 */
router.delete('/ticket/:code', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { code } = req.params;
    const { hard } = req.query;

    try {
        // Find the ticket first
        const findResult = await db.query(
            'SELECT * FROM customer_tickets WHERE ticket_code = $1',
            [code]
        );

        if (findResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }

        const ticket = findResult.rows[0];

        if (hard === 'true') {
            // Hard delete - permanently remove from database
            await db.query('DELETE FROM customer_tickets WHERE ticket_code = $1', [code]);
            console.log(`[DELETE] Hard deleted ticket: ${code}`);
        } else {
            // Soft delete - mark as deleted
            await db.query(
                `UPDATE customer_tickets
                 SET status = 'DELETED', updated_at = NOW()
                 WHERE ticket_code = $1`,
                [code]
            );
            console.log(`[DELETE] Soft deleted ticket: ${code}`);
        }

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'TICKET_DELETED', $3, $4, 'ticket', $5, 'trash', 'red')
        `, [
            ticket.phone, ticket.customer_id,
            `Ticket deleted: ${code}`,
            hard === 'true' ? 'Permanently deleted' : 'Soft deleted',
            code,
        ]);

        // Notify SSE clients
        sseRouter.notifyClients('tickets', { action: 'deleted', ticketCode: code }, 'deleted');

        res.json({
            success: true,
            message: hard === 'true' ? 'Ticket permanently deleted' : 'Ticket soft deleted',
            ticketCode: code
        });
    } catch (error) {
        handleError(res, error, 'Failed to delete ticket');
    }
});

/**
 * GET /api/transactions/consolidated
 * Get consolidated transactions and activities for all customers (paginated)
 * Includes: wallet_transactions, customer_activities, customer_tickets
 */
router.get('/transactions/consolidated', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 10, startDate, endDate, phone, type, query: searchQuery } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let paramIndex = 1;

    // Build WHERE conditions for each table
    let walletWhereConditions = [];
    let activityWhereConditions = [];
    let ticketWhereConditions = [];

    if (phone) {
        const normalizedPhone = normalizePhone(phone);
        walletWhereConditions.push(`wt.phone = $${paramIndex}`);
        activityWhereConditions.push(`ca.phone = $${paramIndex}`);
        ticketWhereConditions.push(`ct.phone = $${paramIndex}`);
        params.push(normalizedPhone);
        paramIndex++;
    }
    if (startDate) {
        walletWhereConditions.push(`wt.created_at >= $${paramIndex}`);
        activityWhereConditions.push(`ca.created_at >= $${paramIndex}`);
        ticketWhereConditions.push(`ct.created_at >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
    }
    if (endDate) {
        walletWhereConditions.push(`wt.created_at <= $${paramIndex}`);
        activityWhereConditions.push(`ca.created_at <= $${paramIndex}`);
        ticketWhereConditions.push(`ct.created_at <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
    }

    // Build WHERE clauses
    const walletWhere = walletWhereConditions.length > 0 ? 'WHERE ' + walletWhereConditions.join(' AND ') : '';
    const activityWhere = activityWhereConditions.length > 0 ? 'WHERE ' + activityWhereConditions.join(' AND ') : '';
    const ticketWhere = ticketWhereConditions.length > 0 ? 'WHERE ' + ticketWhereConditions.join(' AND ') : '';

    // Build queries based on type filter
    let walletQuery, activityQuery, ticketQuery;
    const nullQuery = `SELECT NULL::int as id, NULL as source_type, NULL as type, NULL::timestamp as created_at, NULL::bigint as amount, NULL as description, NULL as customer_name, NULL as customer_phone, NULL as icon, NULL as color WHERE false`;

    // Wallet transactions query
    walletQuery = `
        SELECT
            wt.id,
            'wallet_transaction' as source_type,
            wt.type as type,
            wt.created_at,
            wt.amount,
            wt.note as description,
            c.name as customer_name,
            wt.phone as customer_phone,
            'dollar-sign' as icon,
            CASE
                WHEN wt.type = 'DEPOSIT' OR wt.type = 'VIRTUAL_CREDIT' THEN 'green'
                WHEN wt.type = 'WITHDRAW' OR wt.type = 'VIRTUAL_DEBIT' THEN 'red'
                ELSE 'blue'
            END as color
        FROM wallet_transactions wt
        LEFT JOIN customers c ON c.phone = wt.phone
        ${walletWhere}
    `;

    // Customer activities query
    activityQuery = `
        SELECT
            ca.id,
            'customer_activity' as source_type,
            ca.activity_type as type,
            ca.created_at,
            NULL::bigint as amount,
            COALESCE(ca.title, '') || CASE WHEN ca.description IS NOT NULL THEN ' - ' || ca.description ELSE '' END as description,
            c.name as customer_name,
            ca.phone as customer_phone,
            COALESCE(ca.icon, 'event') as icon,
            COALESCE(ca.color, 'blue') as color
        FROM customer_activities ca
        LEFT JOIN customers c ON c.phone = ca.phone
        ${activityWhere}
    `;

    // Customer tickets query
    ticketQuery = `
        SELECT
            ct.id,
            'customer_ticket' as source_type,
            ct.type as type,
            ct.created_at,
            ct.refund_amount as amount,
            'Sự vụ ' || ct.type || ' - ' || COALESCE(ct.ticket_code, '') as description,
            c.name as customer_name,
            ct.phone as customer_phone,
            'confirmation_number' as icon,
            CASE
                WHEN ct.status = 'pending' THEN 'yellow'
                WHEN ct.status = 'completed' THEN 'green'
                WHEN ct.status = 'cancelled' THEN 'red'
                ELSE 'blue'
            END as color
        FROM customer_tickets ct
        LEFT JOIN customers c ON c.phone = ct.phone
        ${ticketWhere}
    `;

    // Apply type filter - only include relevant sources
    if (type && type !== 'all' && type !== '') {
        const walletTypes = ['DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT', 'VIRTUAL_DEBIT'];
        const ticketTypes = ['RETURN_CLIENT', 'RETURN_SHIPPER', 'OTHER', 'COD_ADJUSTMENT'];

        if (walletTypes.includes(type)) {
            walletQuery += ` AND wt.type = '${type}'`;
            activityQuery = nullQuery;
            ticketQuery = nullQuery;
        } else if (ticketTypes.includes(type)) {
            walletQuery = nullQuery;
            activityQuery = nullQuery;
            ticketQuery += (ticketWhere ? ' AND ' : ' WHERE ') + `ct.type = '${type}'`;
        } else {
            walletQuery = nullQuery;
            activityQuery += (activityWhere ? ' AND ' : ' WHERE ') + `ca.activity_type = '${type}'`;
            ticketQuery = nullQuery;
        }
    }

    try {
        // Get total count of combined results
        const countQuery = `
            SELECT COUNT(*) FROM (
                ${walletQuery}
                UNION ALL
                ${activityQuery}
                UNION ALL
                ${ticketQuery}
            ) as combined_counts
        `;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Get combined and paginated data
        const combinedQuery = `
            ${walletQuery}
            UNION ALL
            ${activityQuery}
            UNION ALL
            ${ticketQuery}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const queryParams = [...params, parseInt(limit), offset];

        const result = await db.query(combinedQuery, queryParams);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch consolidated transactions');
    }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
