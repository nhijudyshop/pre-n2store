/**
 * =====================================================
 * API V2 - ANALYTICS ROUTES
 * =====================================================
 *
 * Dashboard and analytics endpoints
 *
 * Routes:
 *   GET    /dashboard       - Overview dashboard stats
 *   GET    /rfm-segments    - RFM customer segments
 *   GET    /ticket-metrics  - Ticket resolution metrics
 *   GET    /wallet-summary  - Wallet statistics
 *   GET    /daily-summary   - Daily transaction summary
 *   GET    /activity-feed   - Consolidated activity feed (all customers)
 *   POST   /rfm/recalculate - Recalculate all RFM scores
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Analytics V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/analytics/dashboard
 * Overview dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Execute multiple queries in parallel
        const [
            customerStats,
            walletStats,
            ticketStats,
            recentActivity,
            topCustomers
        ] = await Promise.all([
            // Customer statistics
            db.query(`
                SELECT
                    COUNT(*) as total_customers,
                    COUNT(*) FILTER (WHERE tier = 'vip') as vip_count,
                    COUNT(*) FILTER (WHERE tier = 'danger' OR tier = 'blacklist') as risky_count,
                    COUNT(*) FILTER (WHERE last_order_date > NOW() - INTERVAL '30 days') as active_30d,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_7d,
                    COALESCE(SUM(total_spent), 0) as total_revenue,
                    COALESCE(AVG(total_orders), 0) as avg_orders_per_customer
                FROM customers
            `),

            // Wallet statistics
            db.query('SELECT * FROM wallet_statistics'),

            // Ticket statistics
            db.query('SELECT * FROM ticket_statistics'),

            // Recent activity count
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d
                FROM customer_activities
            `),

            // Top customers by spending
            db.query(`
                SELECT id, name, phone, total_spent, total_orders, rfm_segment
                FROM customers
                WHERE total_spent > 0
                ORDER BY total_spent DESC
                LIMIT 5
            `)
        ]);

        res.json({
            success: true,
            data: {
                customers: customerStats.rows[0],
                wallets: walletStats.rows[0],
                tickets: ticketStats.rows[0],
                activity: recentActivity.rows[0],
                topCustomers: topCustomers.rows,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch dashboard stats');
    }
});

/**
 * GET /api/v2/analytics/rfm-segments
 * RFM customer segment distribution
 */
router.get('/rfm-segments', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Get segment distribution
        const segmentResult = await db.query(`
            SELECT
                rfm_segment as segment,
                COUNT(*) as customer_count,
                ROUND(AVG(total_orders)::numeric, 1) as avg_orders,
                ROUND(AVG(total_spent)::numeric, 0) as avg_spent,
                ROUND(AVG(EXTRACT(DAY FROM NOW() - last_order_date))::numeric, 0) as avg_days_since_order
            FROM customers
            WHERE rfm_segment IS NOT NULL
            GROUP BY rfm_segment
            ORDER BY customer_count DESC
        `);

        // Get RFM score distribution
        const scoreDistResult = await db.query(`
            SELECT
                rfm_recency_score as recency,
                rfm_frequency_score as frequency,
                rfm_monetary_score as monetary,
                COUNT(*) as count
            FROM customers
            WHERE rfm_recency_score > 0 OR rfm_frequency_score > 0 OR rfm_monetary_score > 0
            GROUP BY rfm_recency_score, rfm_frequency_score, rfm_monetary_score
            ORDER BY count DESC
            LIMIT 20
        `);

        // Get tier distribution
        const tierResult = await db.query(`
            SELECT tier, COUNT(*) as count
            FROM customers
            GROUP BY tier
            ORDER BY count DESC
        `);

        res.json({
            success: true,
            data: {
                segments: segmentResult.rows,
                scoreDistribution: scoreDistResult.rows,
                tierDistribution: tierResult.rows
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch RFM segments');
    }
});

/**
 * GET /api/v2/analytics/ticket-metrics
 * Ticket resolution metrics
 */
router.get('/ticket-metrics', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { days = 30 } = req.query;

    try {
        // Overall metrics
        const overallResult = await db.query('SELECT * FROM ticket_resolution_metrics');

        // Metrics by day
        const dailyResult = await db.query(`
            SELECT
                DATE(created_at) as date,
                COUNT(*) as created,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
                COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
                SUM(COALESCE(refund_amount, 0)) as total_refunds
            FROM customer_tickets
            WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        // Average resolution time by type
        const resolutionTimeResult = await db.query(`
            SELECT
                type,
                COUNT(*) as total,
                ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600)::numeric, 1) as avg_hours
            FROM customer_tickets
            WHERE status = 'COMPLETED' AND completed_at IS NOT NULL
            GROUP BY type
            ORDER BY total DESC
        `);

        // Pending by priority
        const pendingResult = await db.query(`
            SELECT
                priority,
                COUNT(*) as count
            FROM customer_tickets
            WHERE status IN ('PENDING', 'IN_PROGRESS', 'PENDING_GOODS', 'PENDING_FINANCE')
            GROUP BY priority
            ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'low' THEN 4
                END
        `);

        res.json({
            success: true,
            data: {
                overall: overallResult.rows,
                daily: dailyResult.rows,
                resolutionTime: resolutionTimeResult.rows,
                pending: pendingResult.rows
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch ticket metrics');
    }
});

/**
 * GET /api/v2/analytics/wallet-summary
 * Wallet statistics summary
 */
router.get('/wallet-summary', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Overall wallet stats
        const overallResult = await db.query('SELECT * FROM wallet_statistics');

        // Daily summary
        const dailyResult = await db.query('SELECT * FROM daily_wallet_summary LIMIT 30');

        // Top wallets by balance
        const topWalletsResult = await db.query(`
            SELECT
                w.phone,
                c.name as customer_name,
                w.balance,
                w.virtual_balance,
                (w.balance + w.virtual_balance) as total
            FROM customer_wallets w
            LEFT JOIN customers c ON w.customer_id = c.id
            WHERE w.balance > 0 OR w.virtual_balance > 0
            ORDER BY (w.balance + w.virtual_balance) DESC
            LIMIT 10
        `);

        // Virtual credits expiring soon
        const expiringResult = await db.query(`
            SELECT
                COUNT(*) as count,
                SUM(remaining_amount) as total_amount
            FROM virtual_credits
            WHERE status = 'ACTIVE'
              AND expires_at > NOW()
              AND expires_at < NOW() + INTERVAL '7 days'
        `);

        res.json({
            success: true,
            data: {
                overall: overallResult.rows[0],
                dailySummary: dailyResult.rows,
                topWallets: topWalletsResult.rows,
                expiringCredits: expiringResult.rows[0]
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet summary');
    }
});

/**
 * GET /api/v2/analytics/daily-summary
 * Daily transaction summary for a date range
 */
router.get('/daily-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { start_date, end_date, days = 30 } = req.query;

    try {
        let dateFilter;
        const params = [];

        if (start_date && end_date) {
            dateFilter = 'created_at >= $1 AND created_at <= $2';
            params.push(start_date, end_date);
        } else {
            dateFilter = `created_at > NOW() - INTERVAL '${parseInt(days)} days'`;
        }

        const result = await db.query(`
            SELECT
                DATE(created_at) as date,
                type,
                COUNT(*) as transaction_count,
                SUM(ABS(amount)) as total_amount
            FROM wallet_transactions
            WHERE ${dateFilter}
            GROUP BY DATE(created_at), type
            ORDER BY date DESC, type
        `, params);

        // Pivot data by date
        const pivoted = {};
        result.rows.forEach(row => {
            const dateKey = row.date.toISOString().split('T')[0];
            if (!pivoted[dateKey]) {
                pivoted[dateKey] = {
                    date: dateKey,
                    DEPOSIT: { count: 0, amount: 0 },
                    WITHDRAW: { count: 0, amount: 0 },
                    VIRTUAL_CREDIT: { count: 0, amount: 0 },
                    VIRTUAL_DEBIT: { count: 0, amount: 0 },
                    VIRTUAL_EXPIRE: { count: 0, amount: 0 }
                };
            }
            if (pivoted[dateKey][row.type]) {
                pivoted[dateKey][row.type] = {
                    count: parseInt(row.transaction_count),
                    amount: parseFloat(row.total_amount)
                };
            }
        });

        res.json({
            success: true,
            data: Object.values(pivoted).sort((a, b) => b.date.localeCompare(a.date))
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch daily summary');
    }
});

/**
 * POST /api/v2/analytics/rfm/recalculate
 * Recalculate RFM scores for all customers
 */
router.post('/rfm/recalculate', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Use the batch update function
        const result = await db.query('SELECT * FROM update_all_customers_rfm()');

        res.json({
            success: true,
            data: {
                updatedCount: result.rows[0].updated_count,
                segmentDistribution: result.rows[0].segment_distribution,
                completedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to recalculate RFM');
    }
});

/**
 * GET /api/v2/analytics/rfm/config
 * Get current RFM configuration
 */
router.get('/rfm/config', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM get_rfm_thresholds()');

        // Group by metric type
        const config = {
            recency: [],
            frequency: [],
            monetary: []
        };

        result.rows.forEach(row => {
            if (config[row.metric_type]) {
                config[row.metric_type].push({
                    score: row.score,
                    minValue: row.min_value,
                    maxValue: row.max_value,
                    description: row.description,
                    isActive: row.is_active
                });
            }
        });

        res.json({ success: true, data: config });
    } catch (error) {
        handleError(res, error, 'Failed to fetch RFM config');
    }
});

/**
 * POST /api/v2/analytics/rfm/config
 * Update RFM configuration threshold
 */
router.post('/rfm/config', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { metric_type, score, min_value, max_value, description } = req.body;

    if (!metric_type || !score) {
        return res.status(400).json({
            success: false,
            error: 'metric_type and score are required'
        });
    }

    try {
        await db.query(
            'SELECT update_rfm_threshold($1, $2, $3, $4, $5)',
            [metric_type, score, min_value, max_value, description]
        );

        res.json({
            success: true,
            message: 'RFM threshold updated successfully'
        });
    } catch (error) {
        handleError(res, error, 'Failed to update RFM config');
    }
});

/**
 * GET /api/v2/analytics/activity-feed
 * Consolidated activity feed across all customers (paginated)
 * Combines: wallet_transactions, customer_activities, customer_tickets
 * Query params: page, limit, startDate, endDate, phone, type, query
 */
router.get('/activity-feed', async (req, res) => {
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
        walletWhereConditions.push(`wt.created_at < ($${paramIndex}::date + interval '1 day')`);
        activityWhereConditions.push(`ca.created_at < ($${paramIndex}::date + interval '1 day')`);
        ticketWhereConditions.push(`ct.created_at < ($${paramIndex}::date + interval '1 day')`);
        params.push(endDate);
        paramIndex++;
    }

    const walletWhere = walletWhereConditions.length > 0 ? 'WHERE ' + walletWhereConditions.join(' AND ') : '';
    const activityWhere = activityWhereConditions.length > 0 ? 'WHERE ' + activityWhereConditions.join(' AND ') : '';
    const ticketWhere = ticketWhereConditions.length > 0 ? 'WHERE ' + ticketWhereConditions.join(' AND ') : '';

    const nullQuery = `SELECT NULL::int as id, NULL as source_type, NULL as type, NULL::timestamp as created_at, NULL::bigint as amount, NULL as description, NULL as customer_name, NULL as customer_phone, NULL as icon, NULL as color WHERE false`;

    let walletQuery = `
        SELECT wt.id, 'wallet_transaction' as source_type, wt.type as type,
            (wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
            wt.amount, wt.note as description, c.name as customer_name, wt.phone as customer_phone,
            'dollar-sign' as icon,
            CASE WHEN wt.type IN ('DEPOSIT','VIRTUAL_CREDIT') THEN 'green'
                 WHEN wt.type IN ('WITHDRAW','VIRTUAL_DEBIT') THEN 'red' ELSE 'blue' END as color
        FROM wallet_transactions wt LEFT JOIN customers c ON c.phone = wt.phone
        ${walletWhere}
    `;

    let activityQuery = `
        SELECT ca.id, 'customer_activity' as source_type, ca.activity_type as type,
            (ca.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
            NULL::bigint as amount,
            COALESCE(ca.title, '') || CASE WHEN ca.description IS NOT NULL THEN ' - ' || ca.description ELSE '' END as description,
            c.name as customer_name, ca.phone as customer_phone,
            COALESCE(ca.icon, 'event') as icon, COALESCE(ca.color, 'blue') as color
        FROM customer_activities ca LEFT JOIN customers c ON c.phone = ca.phone
        ${activityWhere}
    `;

    let ticketQuery = `
        SELECT ct.id, 'customer_ticket' as source_type, ct.type as type,
            (ct.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as created_at,
            ct.refund_amount as amount,
            'Sự vụ ' || ct.type || ' - ' || COALESCE(ct.ticket_code, '') as description,
            c.name as customer_name, ct.phone as customer_phone,
            'confirmation_number' as icon,
            CASE WHEN ct.status = 'pending' THEN 'yellow'
                 WHEN ct.status = 'completed' THEN 'green'
                 WHEN ct.status = 'cancelled' THEN 'red' ELSE 'blue' END as color
        FROM customer_tickets ct LEFT JOIN customers c ON c.phone = ct.phone
        ${ticketWhere}
    `;

    // Apply type filter
    if (type && type !== 'all' && type !== '') {
        const walletTypes = ['DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT', 'VIRTUAL_DEBIT'];
        const ticketTypes = ['RETURN_CLIENT', 'RETURN_SHIPPER', 'OTHER', 'COD_ADJUSTMENT', 'BOOM'];

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
        const countQuery = `
            SELECT COUNT(*) FROM (
                ${walletQuery} UNION ALL ${activityQuery} UNION ALL ${ticketQuery}
            ) as combined_counts
        `;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        const combinedQuery = `
            ${walletQuery} UNION ALL ${activityQuery} UNION ALL ${ticketQuery}
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
        handleError(res, error, 'Failed to fetch activity feed');
    }
});

module.exports = router;
