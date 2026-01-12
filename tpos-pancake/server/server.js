/**
 * TPOS-Pancake Server
 * Backend API for TPOS-Pancake integration
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Make db available to routes
app.locals.db = pool;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database debug endpoint
app.get('/api/debug/db', async (req, res) => {
    try {
        // Test connection
        const connResult = await pool.query('SELECT NOW() as time');

        // Check if table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'tpos_saved_customers'
            ) as table_exists
        `);

        // Count rows if table exists
        let rowCount = 0;
        if (tableCheck.rows[0].table_exists) {
            const countResult = await pool.query('SELECT COUNT(*) as count FROM tpos_saved_customers');
            rowCount = parseInt(countResult.rows[0].count);
        }

        res.json({
            success: true,
            database: {
                connected: true,
                time: connResult.rows[0].time,
                hasTable: tableCheck.rows[0].table_exists,
                rowCount: rowCount
            },
            env: {
                hasDbUrl: !!process.env.DATABASE_URL,
                nodeEnv: process.env.NODE_ENV
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            env: {
                hasDbUrl: !!process.env.DATABASE_URL,
                nodeEnv: process.env.NODE_ENV
            }
        });
    }
});

// Initialize table endpoint (run once to create table)
app.post('/api/init-table', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tpos_saved_customers (
                id SERIAL PRIMARY KEY,
                customer_id VARCHAR(100) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                page_id VARCHAR(100),
                page_name VARCHAR(255),
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                saved_by VARCHAR(100),
                notes TEXT,
                UNIQUE(customer_id)
            )
        `);

        // Create indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tpos_saved_customers_customer_id ON tpos_saved_customers(customer_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tpos_saved_customers_page_id ON tpos_saved_customers(page_id)`);

        res.json({
            success: true,
            message: 'Table tpos_saved_customers created/verified successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================
// TPOS SAVED CUSTOMERS API
// =====================================================

/**
 * GET /api/tpos-saved
 * Get all saved customers
 */
app.get('/api/tpos-saved', async (req, res) => {
    try {
        const { page_id, limit = 100 } = req.query;

        let query = `
            SELECT id, customer_id, customer_name, page_id, page_name, saved_at, saved_by, notes
            FROM tpos_saved_customers
        `;
        const params = [];

        if (page_id) {
            query += ` WHERE page_id = $1`;
            params.push(page_id);
        }

        query += ` ORDER BY saved_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit) || 100);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách',
            error: error.message
        });
    }
});

/**
 * GET /api/tpos-saved/ids
 * Get list of all saved customer IDs (for filtering)
 */
app.get('/api/tpos-saved/ids', async (req, res) => {
    try {
        const result = await pool.query('SELECT customer_id FROM tpos_saved_customers');
        const ids = result.rows.map(r => r.customer_id);

        res.json({
            success: true,
            data: ids,
            count: ids.length
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách ID',
            error: error.message
        });
    }
});

/**
 * POST /api/tpos-saved
 * Save a customer
 */
app.post('/api/tpos-saved', async (req, res) => {
    try {
        const { customerId, customerName, pageId, pageName, savedBy, notes } = req.body;

        if (!customerId || !customerName) {
            return res.status(400).json({
                success: false,
                message: 'customerId và customerName là bắt buộc'
            });
        }

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

        const result = await pool.query(query, [
            customerId,
            customerName,
            pageId || null,
            pageName || null,
            savedBy || null,
            notes || null
        ]);

        console.log(`[TPOS-SAVED] Saved: ${customerId} - ${customerName}`);

        res.json({
            success: true,
            data: result.rows[0],
            message: `Đã lưu ${customerName}`
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lưu',
            error: error.message
        });
    }
});

/**
 * DELETE /api/tpos-saved/:customerId
 * Remove a customer from saved list
 */
app.delete('/api/tpos-saved/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;

        const result = await pool.query(
            'DELETE FROM tpos_saved_customers WHERE customer_id = $1 RETURNING *',
            [customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy'
            });
        }

        console.log(`[TPOS-SAVED] Removed: ${customerId}`);

        res.json({
            success: true,
            message: 'Đã xóa',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa',
            error: error.message
        });
    }
});

/**
 * GET /api/tpos-saved/check/:customerId
 * Check if a customer is saved
 */
app.get('/api/tpos-saved/check/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const result = await pool.query(
            'SELECT customer_id FROM tpos_saved_customers WHERE customer_id = $1',
            [customerId]
        );

        res.json({
            success: true,
            isSaved: result.rows.length > 0
        });
    } catch (error) {
        console.error('[TPOS-SAVED] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`[TPOS-PANCAKE] Server running on port ${PORT}`);
    console.log(`[TPOS-PANCAKE] Health check: http://localhost:${PORT}/health`);
});
