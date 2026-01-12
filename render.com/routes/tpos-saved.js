// =====================================================
// TPOS SAVED CUSTOMERS API
// CRUD operations for customers saved from TPOS Live Campaign
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/tpos-saved
 * Get all saved customers
 * Query params:
 *   - page_id: filter by page (optional)
 *   - limit: max results (default: 100)
 */
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { page_id, limit = 100 } = req.query;

        let query = `
            SELECT
                id,
                customer_id,
                customer_name,
                page_id,
                page_name,
                saved_at,
                saved_by,
                notes
            FROM tpos_saved_customers
        `;
        const params = [];

        if (page_id) {
            query += ` WHERE page_id = $1`;
            params.push(page_id);
        }

        query += ` ORDER BY saved_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit) || 100);

        const result = await db.query(query, params);

        console.log(`[TPOS-SAVED] Fetched ${result.rows.length} saved customers`);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error fetching saved customers:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách đã lưu',
            error: error.message
        });
    }
});

/**
 * POST /api/tpos-saved
 * Save a customer
 * Body: { customerId, customerName, pageId, pageName, savedBy, notes }
 */
router.post('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { customerId, customerName, pageId, pageName, savedBy, notes } = req.body;

        if (!customerId || !customerName) {
            return res.status(400).json({
                success: false,
                message: 'customerId và customerName là bắt buộc'
            });
        }

        // Use INSERT ... ON CONFLICT to handle duplicates
        const query = `
            INSERT INTO tpos_saved_customers (customer_id, customer_name, page_id, page_name, saved_by, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (customer_id)
            DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                page_id = EXCLUDED.page_id,
                page_name = EXCLUDED.page_name,
                saved_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await db.query(query, [
            customerId,
            customerName,
            pageId || null,
            pageName || null,
            savedBy || null,
            notes || null
        ]);

        console.log(`[TPOS-SAVED] Saved customer: ${customerId} - ${customerName}`);

        res.json({
            success: true,
            data: result.rows[0],
            message: `Đã lưu ${customerName}`
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error saving customer:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lưu khách hàng',
            error: error.message
        });
    }
});

/**
 * DELETE /api/tpos-saved/:customerId
 * Remove a customer from saved list
 */
router.delete('/:customerId', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { customerId } = req.params;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                message: 'customerId là bắt buộc'
            });
        }

        const query = `
            DELETE FROM tpos_saved_customers
            WHERE customer_id = $1
            RETURNING *
        `;

        const result = await db.query(query, [customerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khách hàng trong danh sách'
            });
        }

        console.log(`[TPOS-SAVED] Removed customer: ${customerId}`);

        res.json({
            success: true,
            message: 'Đã xóa khỏi danh sách',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error removing customer:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa khách hàng',
            error: error.message
        });
    }
});

/**
 * GET /api/tpos-saved/check/:customerId
 * Check if a customer is saved
 */
router.get('/check/:customerId', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { customerId } = req.params;

        const query = `
            SELECT customer_id FROM tpos_saved_customers WHERE customer_id = $1
        `;

        const result = await db.query(query, [customerId]);

        res.json({
            success: true,
            isSaved: result.rows.length > 0
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error checking customer:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra',
            error: error.message
        });
    }
});

/**
 * GET /api/tpos-saved/ids
 * Get list of all saved customer IDs (for filtering in Pancake)
 */
router.get('/ids', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;

        const query = `SELECT customer_id FROM tpos_saved_customers`;
        const result = await db.query(query);

        const ids = result.rows.map(r => r.customer_id);

        res.json({
            success: true,
            data: ids,
            count: ids.length
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error fetching IDs:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách ID',
            error: error.message
        });
    }
});

module.exports = router;
