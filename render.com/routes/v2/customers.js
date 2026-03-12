/**
 * =====================================================
 * API V2 - CUSTOMERS ROUTES (CONSOLIDATED)
 * =====================================================
 *
 * Single source of truth for all customer endpoints.
 * Replaces: customer-360.js (V1) + customers.js (V1)
 *
 * Routes:
 *   GET    /                    - List customers (paginated, filtered)
 *   GET    /stats               - Customer statistics
 *   GET    /duplicates          - Duplicate phone detection
 *   GET    /recent              - Recently active customers
 *   GET    /:id                 - Customer 360° view (by ID or phone)
 *   GET    /:id/quick-view      - Quick info for modals
 *   GET    /:id/activity        - Activity timeline
 *   GET    /:id/rfm             - RFM analysis
 *   GET    /:id/transactions    - Consolidated transactions
 *   POST   /                    - Create customer
 *   POST   /batch               - Batch lookup
 *   POST   /search              - Search customers
 *   POST   /import              - Batch import (upsert)
 *   PATCH  /:id                 - Update customer
 *   DELETE /:id                 - Delete customer
 *   POST   /:id/notes           - Add note
 *
 * Created: 2026-01-12
 * Consolidated: 2026-02-11
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone, getOrCreateCustomer, detectCarrier, validateCustomerData } = require('../../utils/customer-helpers');
const { searchCustomerByPhone } = require('../../services/tpos-customer-service');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Customers V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// STATIC ROUTES (must be before /:id to avoid conflicts)
// =====================================================

/**
 * GET /api/v2/customers
 * List customers with pagination and filters
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const {
        page = 1,
        limit = 50,
        tier,
        segment,
        status,
        search,
        sort = 'created_at',
        order = 'desc'
    } = req.query;

    try {
        let query = `
            SELECT c.*,
                w.balance as wallet_balance,
                w.virtual_balance as wallet_virtual_balance,
                (COALESCE(w.balance, 0) + COALESCE(w.virtual_balance, 0)) as wallet_total
            FROM customers c
            LEFT JOIN customer_wallets w ON c.id = w.customer_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (tier) {
            query += ` AND c.tier = $${paramIndex++}`;
            params.push(tier);
        }
        if (segment) {
            query += ` AND c.rfm_segment = $${paramIndex++}`;
            params.push(segment);
        }
        if (status) {
            query += ` AND c.status = $${paramIndex++}`;
            params.push(status);
        }
        if (search) {
            query += ` AND (c.phone ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const countQuery = query.replace(/SELECT c\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        const validSorts = ['created_at', 'name', 'total_orders', 'total_spent', 'last_order_date'];
        const sortField = validSorts.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        query += ` ORDER BY c.${sortField} ${sortOrder} NULLS LAST`;
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
        handleError(res, error, 'Failed to list customers');
    }
});

/**
 * GET /api/v2/customers/stats
 * Customer statistics (fast aggregation)
 */
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;

        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Bình thường') as normal,
                COUNT(*) FILTER (WHERE status = 'Bom hàng') as danger,
                COUNT(*) FILTER (WHERE status = 'Cảnh báo') as warning,
                COUNT(*) FILTER (WHERE status = 'Nguy hiểm') as critical,
                COUNT(*) FILTER (WHERE status = 'VIP') as vip,
                COUNT(*) FILTER (WHERE active = true) as active,
                COUNT(*) FILTER (WHERE active = false) as inactive,
                SUM(debt) as total_debt,
                AVG(debt) as avg_debt
            FROM customers
        `);

        const stats = result.rows[0];

        res.json({
            success: true,
            data: {
                total: parseInt(stats.total),
                normal: parseInt(stats.normal),
                danger: parseInt(stats.danger),
                warning: parseInt(stats.warning),
                critical: parseInt(stats.critical),
                vip: parseInt(stats.vip),
                active: parseInt(stats.active),
                inactive: parseInt(stats.inactive),
                total_debt: parseInt(stats.total_debt) || 0,
                avg_debt: parseFloat(stats.avg_debt) || 0
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to get customer stats');
    }
});

/**
 * GET /api/v2/customers/duplicates
 * Get customers with duplicate phone numbers
 */
router.get('/duplicates', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { page = 1, limit = 100 } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(parseInt(limit) || 100, 500);
        const offset = (pageNum - 1) * limitNum;

        const duplicatePhonesResult = await db.query(`
            SELECT phone, COUNT(*) as count
            FROM customers
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone
            HAVING COUNT(*) > 1
        `);
        const duplicatePhones = duplicatePhonesResult.rows.map(r => r.phone);

        if (duplicatePhones.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0, duplicate_phones_count: 0 }
            });
        }

        const countResult = await db.query('SELECT COUNT(*) FROM customers WHERE phone = ANY($1)', [duplicatePhones]);
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(`
            SELECT c.*, COALESCE(dp.duplicate_count, 1) as duplicate_count
            FROM customers c
            LEFT JOIN (
                SELECT phone, COUNT(*) as duplicate_count
                FROM customers
                WHERE phone IS NOT NULL AND phone != ''
                GROUP BY phone
            ) AS dp ON c.phone = dp.phone
            WHERE c.phone = ANY($1)
            ORDER BY c.phone, c.created_at DESC
            LIMIT $2 OFFSET $3
        `, [duplicatePhones, limitNum, offset]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                duplicate_phones_count: duplicatePhones.length
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to get duplicate customers');
    }
});

/**
 * GET /api/v2/customers/recent
 * Get most recently active customers
 */
router.get('/recent', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(parseInt(limit) || 20, 100);
        const offset = (pageNum - 1) * limitNum;

        const countResult = await db.query('SELECT COUNT(*) FROM customers WHERE active = true');
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(`
            SELECT
                c.*,
                COALESCE(w.balance, 0) + COALESCE(w.virtual_balance, 0) as balance,
                COALESCE(w.virtual_balance, 0) as virtual_balance,
                COALESCE(w.balance, 0) as real_balance
            FROM customers c
            LEFT JOIN customer_wallets w ON c.phone = w.phone
            WHERE c.active = true
            ORDER BY COALESCE(c.last_interaction_date, c.updated_at, c.created_at) DESC
            LIMIT $1 OFFSET $2
        `, [limitNum, offset]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to get recent customers');
    }
});

// =====================================================
// PARAMETERIZED ROUTES (/:id and sub-routes)
// =====================================================

/**
 * GET /api/v2/customers/:id
 * Get full Customer 360° view by ID or phone
 */
router.get('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        const customerQuery = isPhone
            ? `SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
               FROM customers c
               LEFT JOIN customer_wallets w ON c.id = w.customer_id
               WHERE c.phone = $1`
            : `SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
               FROM customers c
               LEFT JOIN customer_wallets w ON c.id = w.customer_id
               WHERE c.id = $1`;

        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);
        const customerResult = await db.query(customerQuery, [lookupValue]);

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];
        const phone = customer.phone;

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT id, original_amount, remaining_amount, issued_at, expires_at, status, source_type
            FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        // Get recent tickets (last 10)
        const ticketsResult = await db.query(`
            SELECT ticket_code, type, status, order_id, tpos_order_id, refund_amount, products, internal_note, created_at
            FROM customer_tickets
            WHERE phone = $1 AND status != 'DELETED'
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
                COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'DELETED')) as pending,
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
                    balance: parseFloat(customer.wallet_balance) || 0,
                    virtualBalance: parseFloat(customer.wallet_virtual_balance) || 0,
                    total: (parseFloat(customer.wallet_balance) || 0) + (parseFloat(customer.wallet_virtual_balance) || 0),
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
 * GET /api/v2/customers/:id/quick-view
 * Quick customer info for modal (Balance-History uses this)
 */
router.get('/:id/quick-view', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Resolve phone number
        let lookupPhone;
        if (isPhone) {
            lookupPhone = normalizePhone(id);
        } else {
            const result = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(id)]);
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            lookupPhone = result.rows[0].phone;
        }

        if (!lookupPhone) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }

        // 1. Find customer in DB
        const customerResult = await db.query(`
            SELECT c.*,
                   w.balance as wallet_balance,
                   w.virtual_balance as wallet_virtual_balance
            FROM customers c
            LEFT JOIN customer_wallets w ON w.phone = c.phone
            WHERE c.phone = $1
        `, [lookupPhone]);

        let customer = customerResult.rows[0];
        let source = 'customer360';
        let isFromTpos = false;

        // 2. If not in DB, search TPOS
        if (!customer) {
            try {
                const tposResult = await searchCustomerByPhone(lookupPhone);
                if (tposResult && tposResult.customers && tposResult.customers.length > 0) {
                    const tposCustomer = tposResult.customers[0];
                    customer = {
                        id: null,
                        name: tposCustomer.Name || tposCustomer.DisplayName,
                        phone: lookupPhone,
                        address: tposCustomer.FullAddress || tposCustomer.Street || '',
                        status: tposCustomer.Status || 'Bình thường',
                        tpos_id: tposCustomer.Id,
                        wallet_balance: 0,
                        wallet_virtual_balance: 0
                    };
                    source = 'tpos';
                    isFromTpos = true;
                }
            } catch (tposError) {
                console.error('[V2 QUICK-VIEW] TPOS search error:', tposError.message);
            }
        }

        if (!customer) {
            return res.json({ success: false, message: 'Không tìm thấy khách hàng' });
        }

        // 3. Get pending deposits
        const pendingResult = await db.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(transfer_amount), 0) as total
            FROM balance_history
            WHERE linked_customer_phone = $1
              AND verification_status = 'PENDING_VERIFICATION'
              AND wallet_processed = FALSE
        `, [lookupPhone]);

        // 4. Get 5 recent wallet transactions
        const transactionsResult = await db.query(`
            SELECT type, amount, note, created_at
            FROM wallet_transactions
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT 5
        `, [lookupPhone]);

        res.json({
            success: true,
            data: {
                customer: customer,
                source: source,
                isFromTpos: isFromTpos,
                wallet: {
                    balance: parseFloat(customer.wallet_balance) || 0,
                    virtual_balance: parseFloat(customer.wallet_virtual_balance) || 0,
                    total: (parseFloat(customer.wallet_balance) || 0) + (parseFloat(customer.wallet_virtual_balance) || 0)
                },
                pending_deposits: {
                    count: parseInt(pendingResult.rows[0].count) || 0,
                    total: parseFloat(pendingResult.rows[0].total) || 0
                },
                recent_transactions: transactionsResult.rows
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to fetch customer quick-view');
    }
});

/**
 * GET /api/v2/customers/:id/activity
 * Get customer activity timeline
 */
router.get('/:id/activity', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        let phone;
        if (isPhone) {
            phone = normalizePhone(id);
        } else {
            const customerResult = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            phone = customerResult.rows[0].phone;
        }

        const result = await db.query(`
            SELECT * FROM customer_activities
            WHERE phone = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [phone, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

        const countResult = await db.query('SELECT COUNT(*) FROM customer_activities WHERE phone = $1', [phone]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch customer activities');
    }
});

/**
 * GET /api/v2/customers/:id/rfm
 * Get RFM analysis for customer
 */
router.get('/:id/rfm', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        let customerId;
        if (isPhone) {
            const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [normalizePhone(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            customerId = customerResult.rows[0].id;
        } else {
            customerId = parseInt(id);
        }

        const result = await db.query('SELECT * FROM analyze_customer_rfm($1)', [customerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to get RFM analysis');
    }
});

/**
 * GET /api/v2/customers/:id/transactions
 * Consolidated transactions (wallet_transactions + customer_activities + customer_tickets)
 */
router.get('/:id/transactions', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { page = 1, limit = 10, startDate, endDate, type } = req.query;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        let phone;
        if (isPhone) {
            phone = normalizePhone(id);
        } else {
            const customerResult = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            phone = customerResult.rows[0].phone;
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const params = [phone];
        let paramIndex = 2;

        let dateConditions = '';
        if (startDate) {
            dateConditions += ` AND sub.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            dateConditions += ` AND sub.created_at < ($${paramIndex}::date + interval '1 day')`;
            params.push(endDate);
            paramIndex++;
        }

        const walletQuery = `
            SELECT wt.id, 'wallet_transaction' as source_type, wt.type as type,
                (wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
                wt.amount, wt.note as description, c.name as customer_name, wt.phone as customer_phone,
                'dollar-sign' as icon,
                CASE WHEN wt.type IN ('DEPOSIT','VIRTUAL_CREDIT') THEN 'green'
                     WHEN wt.type IN ('WITHDRAW','VIRTUAL_DEBIT') THEN 'red' ELSE 'blue' END as color
            FROM wallet_transactions wt LEFT JOIN customers c ON c.phone = wt.phone
            WHERE wt.phone = $1
        `;

        const activityQuery = `
            SELECT ca.id, 'customer_activity' as source_type, ca.activity_type as type,
                (ca.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
                NULL::bigint as amount,
                COALESCE(ca.title, '') || CASE WHEN ca.description IS NOT NULL THEN ' - ' || ca.description ELSE '' END as description,
                c.name as customer_name, ca.phone as customer_phone,
                COALESCE(ca.icon, 'event') as icon, COALESCE(ca.color, 'blue') as color
            FROM customer_activities ca LEFT JOIN customers c ON c.phone = ca.phone
            WHERE ca.phone = $1
        `;

        const ticketQuery = `
            SELECT ct.id, 'customer_ticket' as source_type, ct.type as type,
                (ct.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
                ct.refund_amount as amount,
                'Sự vụ ' || ct.type || ' - ' || COALESCE(ct.ticket_code, '') as description,
                c.name as customer_name, ct.phone as customer_phone,
                'confirmation_number' as icon,
                CASE WHEN ct.status = 'pending' THEN 'yellow' WHEN ct.status = 'completed' THEN 'green'
                     WHEN ct.status = 'cancelled' THEN 'red' ELSE 'blue' END as color
            FROM customer_tickets ct LEFT JOIN customers c ON c.phone = ct.phone
            WHERE ct.phone = $1 AND ct.status != 'DELETED'
        `;

        let finalWallet = walletQuery;
        let finalActivity = activityQuery;
        let finalTicket = ticketQuery;
        const nullQuery = `SELECT NULL::int as id, NULL as source_type, NULL as type, NULL::timestamp as created_at, NULL::bigint as amount, NULL as description, NULL as customer_name, NULL as customer_phone, NULL as icon, NULL as color WHERE false`;

        if (type && type !== 'all' && type !== '') {
            const walletTypes = ['DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT', 'VIRTUAL_DEBIT'];
            const ticketTypes = ['RETURN_CLIENT', 'RETURN_SHIPPER', 'OTHER', 'COD_ADJUSTMENT', 'BOOM'];

            if (walletTypes.includes(type)) {
                finalWallet += ` AND wt.type = '${type}'`;
                finalActivity = nullQuery;
                finalTicket = nullQuery;
            } else if (ticketTypes.includes(type)) {
                finalWallet = nullQuery;
                finalActivity = nullQuery;
                finalTicket += ` AND ct.type = '${type}'`;
            } else {
                finalWallet = nullQuery;
                finalActivity += ` AND ca.activity_type = '${type}'`;
                finalTicket = nullQuery;
            }
        }

        const countQuery = `
            SELECT COUNT(*) FROM (
                SELECT created_at FROM (${finalWallet}) w
                UNION ALL SELECT created_at FROM (${finalActivity}) a
                UNION ALL SELECT created_at FROM (${finalTicket}) t
            ) as sub WHERE 1=1 ${dateConditions}
        `;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        const combinedQuery = `
            SELECT * FROM (
                ${finalWallet} UNION ALL ${finalActivity} UNION ALL ${finalTicket}
            ) as sub WHERE 1=1 ${dateConditions}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const result = await db.query(combinedQuery, [...params, parseInt(limit), offset]);

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
// WRITE OPERATIONS (POST, PATCH, DELETE)
// =====================================================

/**
 * POST /api/v2/customers
 * Create new customer
 */
router.post('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, name, email, address, status, tier, tags } = req.body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        const result = await db.query(`
            INSERT INTO customers (phone, name, email, address, status, tier, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (phone) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, customers.name),
                email = COALESCE(EXCLUDED.email, customers.email),
                address = COALESCE(EXCLUDED.address, customers.address),
                status = COALESCE(EXCLUDED.status, customers.status),
                tier = COALESCE(EXCLUDED.tier, customers.tier),
                tags = COALESCE(EXCLUDED.tags, customers.tags),
                updated_at = NOW()
            RETURNING *
        `, [
            normalizedPhone,
            name || 'Khách hàng ' + normalizedPhone,
            email,
            address,
            status || 'Bình thường',
            tier || 'normal',
            JSON.stringify(tags || [])
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to create customer');
    }
});

/**
 * POST /api/v2/customers/batch
 * Batch lookup multiple customers
 */
router.post('/batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones, ids } = req.body;

    if ((!phones || !Array.isArray(phones)) && (!ids || !Array.isArray(ids))) {
        return res.status(400).json({ success: false, error: 'phones or ids array is required' });
    }

    try {
        let result;
        if (phones && phones.length > 0) {
            const normalizedPhones = phones.map(normalizePhone).filter(Boolean);
            result = await db.query(`
                SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.phone = ANY($1)
            `, [normalizedPhones]);
        } else {
            result = await db.query(`
                SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.id = ANY($1)
            `, [ids.map(id => parseInt(id))]);
        }

        const customerMap = {};
        result.rows.forEach(row => {
            const key = phones ? row.phone : row.id;
            customerMap[key] = {
                ...row,
                wallet: {
                    balance: parseFloat(row.wallet_balance) || 0,
                    virtualBalance: parseFloat(row.wallet_virtual_balance) || 0,
                    total: (parseFloat(row.wallet_balance) || 0) + (parseFloat(row.wallet_virtual_balance) || 0)
                }
            };
        });

        res.json({
            success: true,
            data: customerMap,
            found: result.rows.length,
            total: phones ? phones.length : ids.length
        });
    } catch (error) {
        handleError(res, error, 'Failed to batch lookup customers');
    }
});

/**
 * POST /api/v2/customers/search
 * Search customers
 */
router.post('/search', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { query, limit = 50 } = req.body;

    if (!query || query.length < 2) {
        return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    try {
        try {
            const result = await db.query('SELECT * FROM search_customers_priority($1, $2)', [query, parseInt(limit)]);
            return res.json({ success: true, data: result.rows });
        } catch (fnError) {
            const result = await db.query(`
                SELECT c.*, w.balance as wallet_balance, w.virtual_balance as wallet_virtual_balance
                FROM customers c
                LEFT JOIN customer_wallets w ON c.id = w.customer_id
                WHERE c.phone ILIKE $1 OR c.name ILIKE $1
                ORDER BY
                    CASE WHEN c.phone = $2 THEN 0
                         WHEN c.phone LIKE $3 THEN 1
                         ELSE 2 END,
                    c.total_orders DESC NULLS LAST
                LIMIT $4
            `, [`%${query}%`, query, `${query}%`, parseInt(limit)]);

            return res.json({ success: true, data: result.rows });
        }
    } catch (error) {
        handleError(res, error, 'Failed to search customers');
    }
});

/**
 * POST /api/v2/customers/import
 * Batch import customers (upsert, preserves existing debt)
 */
router.post('/import', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { customers } = req.body;

        if (!Array.isArray(customers) || customers.length === 0) {
            return res.status(400).json({ success: false, error: 'Danh sách khách hàng không hợp lệ' });
        }

        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const customer of customers) {
            if (!customer.phone || !customer.name) continue;

            const carrier = customer.carrier || detectCarrier(customer.phone);

            values.push(
                customer.phone?.trim(),
                customer.name?.trim(),
                customer.email?.trim() || null,
                customer.address?.trim() || null,
                carrier,
                customer.status || 'Bình thường',
                0,
                customer.active !== false,
                customer.firebase_id || null,
                customer.tpos_id || null,
                customer.tpos_data ? JSON.stringify(customer.tpos_data) : null
            );

            placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`);
            paramIndex += 11;
        }

        if (placeholders.length === 0) {
            return res.status(400).json({ success: false, error: 'Không có khách hàng hợp lệ để import' });
        }

        const query = `
            INSERT INTO customers (
                phone, name, email, address, carrier, status, debt, active, firebase_id, tpos_id, tpos_data
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT (phone) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                address = EXCLUDED.address,
                carrier = EXCLUDED.carrier,
                status = EXCLUDED.status,
                active = EXCLUDED.active,
                firebase_id = COALESCE(EXCLUDED.firebase_id, customers.firebase_id),
                tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
                tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
                updated_at = CURRENT_TIMESTAMP
        `;

        const result = await db.query(query, values);
        const successCount = result.rowCount || 0;

        res.json({
            success: true,
            message: `Import thành công ${successCount}/${customers.length} khách hàng`,
            data: {
                success: successCount,
                failed: 0,
                skipped: customers.length - successCount
            }
        });

    } catch (error) {
        handleError(res, error, 'Failed to import customers');
    }
});

/**
 * PATCH /api/v2/customers/:id
 * Update customer
 */
router.patch('/:id', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const updates = req.body;

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        const allowedFields = ['name', 'email', 'address', 'status', 'tier', 'tags', 'internal_note'];
        const setClauses = [];
        const params = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex++}`);
                params.push(field === 'tags' ? JSON.stringify(updates[field]) : updates[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        const whereClause = isPhone ? `phone = $${paramIndex}` : `id = $${paramIndex}`;
        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);
        params.push(lookupValue);

        const query = `
            UPDATE customers
            SET ${setClauses.join(', ')}, updated_at = NOW()
            WHERE ${whereClause}
            RETURNING *
        `;

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to update customer');
    }
});

/**
 * DELETE /api/v2/customers/:id
 * Delete customer (soft delete by default, hard delete with ?hard_delete=true)
 */
router.delete('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { hard_delete = false } = req.query;

        const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);
        const whereClause = isPhone ? 'phone = $1' : 'id = $1';
        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);

        let result;
        if (hard_delete === 'true') {
            result = await db.query(`DELETE FROM customers WHERE ${whereClause} RETURNING *`, [lookupValue]);
        } else {
            result = await db.query(
                `UPDATE customers SET active = false, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause} RETURNING *`,
                [lookupValue]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        handleError(res, error, 'Failed to delete customer');
    }
});

/**
 * POST /api/v2/customers/:id/notes
 * Add note to customer
 */
router.post('/:id/notes', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { content, category, is_pinned, created_by } = req.body;

    if (!content) {
        return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        const customerQuery = isPhone
            ? 'SELECT id, phone FROM customers WHERE phone = $1'
            : 'SELECT id, phone FROM customers WHERE id = $1';
        const lookupValue = isPhone ? normalizePhone(id) : parseInt(id);

        const customerResult = await db.query(customerQuery, [lookupValue]);
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];

        const result = await db.query(`
            INSERT INTO customer_notes (phone, customer_id, content, category, is_pinned, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [customer.phone, customer.id, content, category || 'general', is_pinned || false, created_by || 'system']);

        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, icon, color)
            VALUES ($1, $2, 'NOTE_ADDED', $3, 'sticky-note', 'yellow')
        `, [customer.phone, customer.id, content.substring(0, 100)]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to add customer note');
    }
});

/**
 * POST /api/v2/customers/:id/activities
 * Log a customer activity (from frontend order operations)
 */
// Auto-migrate activity_type constraint on first use
let activityConstraintMigrated = false;
async function ensureActivityTypeConstraint(db) {
    if (activityConstraintMigrated) return;
    try {
        await db.query(`ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check`);
        await db.query(`ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
            CHECK (activity_type IN (
                'WALLET_DEPOSIT','WALLET_WITHDRAW','WALLET_VIRTUAL_CREDIT','WALLET_REFUND',
                'TICKET_CREATED','TICKET_UPDATED','TICKET_COMPLETED','TICKET_DELETED',
                'ORDER_CREATED','ORDER_CANCELLED','ORDER_DELIVERED','ORDER_RETURNED',
                'MESSAGE_SENT','MESSAGE_RECEIVED','PROFILE_UPDATED','TAG_ADDED','NOTE_ADDED'
            ))`);
        activityConstraintMigrated = true;
        console.log('[Customers V2] ✅ Activity type constraint migrated (added ORDER_CREATED, ORDER_CANCELLED, WALLET_REFUND)');
    } catch (err) {
        console.warn('[Customers V2] Constraint migration warning:', err.message);
        activityConstraintMigrated = true; // Don't retry on every request
    }
}

router.post('/:id/activities', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by } = req.body;

    if (!activity_type || !title) {
        return res.status(400).json({ success: false, error: 'activity_type and title are required' });
    }

    const isPhone = /^0\d{9}$/.test(id) || /^\d{10,11}$/.test(id);

    try {
        // Ensure constraint allows new activity types
        await ensureActivityTypeConstraint(db);

        let phone, customerId;
        if (isPhone) {
            phone = normalizePhone(id);
            const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
            customerId = customerResult.rows[0]?.id || null;
        } else {
            const customerResult = await db.query('SELECT id, phone FROM customers WHERE id = $1', [parseInt(id)]);
            if (customerResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Customer not found' });
            }
            phone = customerResult.rows[0].phone;
            customerId = customerResult.rows[0].id;
        }

        // If customer doesn't exist, auto-create with phone only
        if (!customerId && phone) {
            const insertResult = await db.query(
                `INSERT INTO customers (phone, name, status) VALUES ($1, $2, 'active') ON CONFLICT (phone) DO UPDATE SET updated_at = NOW() RETURNING id`,
                [phone, 'Khách mới']
            );
            customerId = insertResult.rows[0].id;
        }

        const result = await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            phone, customerId, activity_type, title,
            description || null, reference_type || null, reference_id || null,
            metadata ? JSON.stringify(metadata) : '{}',
            icon || null, color || null, created_by || 'system'
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to log customer activity');
    }
});

module.exports = router;
