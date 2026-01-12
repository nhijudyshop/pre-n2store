// =====================================================
// REALTIME DATABASE REST API
// Thay thế Firebase Realtime Database Operations
// =====================================================

const express = require('express');
const router = express.Router();

// Import SSE notification functions
let notifyClients, notifyClientsWildcard;

/**
 * Initialize SSE notifiers (called from server.js after route registration)
 * @param {Function} notify - notifyClients function
 * @param {Function} notifyWildcard - notifyClientsWildcard function
 */
function initializeNotifiers(notify, notifyWildcard) {
    notifyClients = notify;
    notifyClientsWildcard = notifyWildcard;
    console.log('[REALTIME-DB] SSE notifiers initialized');
}

// =====================================================
// KEY-VALUE API
// Thay thế: firebase.database().ref('key')
// =====================================================

/**
 * GET /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).once('value')
 *
 * Returns: { exists: boolean, value: any }
 */
router.get('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT value, created_at, updated_at FROM realtime_kv WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return res.json({
                exists: false,
                value: null
            });
        }

        res.json({
            exists: true,
            value: result.rows[0].value,
            createdAt: result.rows[0].created_at,
            updatedAt: result.rows[0].updated_at
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).set(value)
 *
 * Body: { value: any }
 */
router.put('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (value === undefined) {
            return res.status(400).json({ error: 'Missing value in request body' });
        }

        await pool.query(`
            INSERT INTO realtime_kv (key, value, created_at, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [key, JSON.stringify(value)]);

        // Notify SSE clients
        if (notifyClients) {
            notifyClients(key, value, 'update');
        }

        console.log(`[REALTIME-DB] Updated key: ${key}`);

        res.json({
            success: true,
            key,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).remove()
 */
router.delete('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM realtime_kv WHERE key = $1 RETURNING key',
            [key]
        );

        // Notify SSE clients
        if (notifyClients) {
            notifyClients(key, null, 'deleted');
        }

        console.log(`[REALTIME-DB] Deleted key: ${key}`);

        res.json({
            success: true,
            deleted: result.rowCount > 0,
            key
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kv error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELD PRODUCTS API
// Thay thế: firebase.database().ref('held_products')
// =====================================================

/**
 * GET /api/realtime/held-products/:orderId
 * Thay thế: firebase.database().ref(`held_products/${orderId}`).once('value')
 *
 * Returns Firebase-compatible structure:
 * {
 *   "productId1": {
 *     "userId1": { quantity: 1, isDraft: false, ... },
 *     "userId2": { quantity: 2, isDraft: true, ... }
 *   }
 * }
 */
router.get('/held-products/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT product_id, user_id, data, is_draft, created_at, updated_at FROM held_products WHERE order_id = $1',
            [orderId]
        );

        // Convert to Firebase-like structure
        const heldProducts = {};

        result.rows.forEach(row => {
            if (!heldProducts[row.product_id]) {
                heldProducts[row.product_id] = {};
            }

            heldProducts[row.product_id][row.user_id] = {
                ...row.data,
                isDraft: row.is_draft,
                _createdAt: row.created_at,
                _updatedAt: row.updated_at
            };
        });

        res.json(heldProducts);
    } catch (error) {
        console.error('[REALTIME-DB] GET /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/held-products/:orderId/:productId/:userId
 * Thay thế: firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).set(data)
 *
 * Body: { data object with product details }
 */
router.put('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const data = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!data || typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid data object' });
        }

        const isDraft = data.isDraft !== undefined ? data.isDraft : false;

        // Remove isDraft from data before storing (stored separately)
        const dataToStore = { ...data };
        delete dataToStore.isDraft;
        delete dataToStore._createdAt;
        delete dataToStore._updatedAt;

        await pool.query(`
            INSERT INTO held_products (order_id, product_id, user_id, data, is_draft, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (order_id, product_id, user_id) DO UPDATE SET
                data = $4,
                is_draft = $5,
                updated_at = CURRENT_TIMESTAMP
        `, [orderId, productId, userId, JSON.stringify(dataToStore), isDraft]);

        // Notify SSE clients watching this order
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId,
                userId,
                data: { ...dataToStore, isDraft }
            }, 'update');
        }

        console.log(`[REALTIME-DB] Updated held product: ${orderId}/${productId}/${userId}`);

        res.json({
            success: true,
            orderId,
            productId,
            userId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/held-products/:orderId/:productId/:userId
 * Thay thế: firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).remove()
 */
router.delete('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3 RETURNING *',
            [orderId, productId, userId]
        );

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                productId,
                userId,
                deleted: true
            }, 'deleted');
        }

        console.log(`[REALTIME-DB] Deleted held product: ${orderId}/${productId}/${userId}`);

        res.json({
            success: true,
            deleted: result.rowCount > 0,
            orderId,
            productId,
            userId
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/held-products/:orderId
 * Delete all held products for an order
 */
router.delete('/held-products/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM held_products WHERE order_id = $1 RETURNING product_id, user_id',
            [orderId]
        );

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`held_products/${orderId}`, {
                cleared: true,
                count: result.rowCount
            }, 'deleted');
        }

        console.log(`[REALTIME-DB] Cleared ${result.rowCount} held products for order: ${orderId}`);

        res.json({
            success: true,
            deletedCount: result.rowCount,
            orderId
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /held-products/:orderId error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI BASE API
// Thay thế: firebase.database().ref('kpi_base')
// =====================================================

/**
 * GET /api/realtime/kpi-base/:orderId
 * Get KPI base data for an order
 */
router.get('/kpi-base/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT * FROM kpi_base WHERE order_id = $1',
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderId: row.order_id,
                campaignName: row.campaign_name,
                userId: row.user_id,
                userName: row.user_name,
                stt: row.stt,
                products: row.products,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kpi-base/:orderId
 * Save KPI base data
 */
router.put('/kpi-base/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { campaignName, userId, userName, stt, products } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'products must be an array' });
        }

        await pool.query(`
            INSERT INTO kpi_base (order_id, campaign_name, user_id, user_name, stt, products, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (order_id) DO UPDATE SET
                campaign_name = $2,
                user_id = $3,
                user_name = $4,
                stt = $5,
                products = $6,
                updated_at = CURRENT_TIMESTAMP
        `, [orderId, campaignName, userId, userName, stt, JSON.stringify(products)]);

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`kpi_base/${orderId}`, {
                orderId,
                campaignName,
                userId,
                products
            }, 'update');
        }

        console.log(`[REALTIME-DB] Updated KPI base for order: ${orderId}`);

        res.json({ success: true, orderId });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kpi-base/:orderId
 * Delete KPI base data
 */
router.delete('/kpi-base/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM kpi_base WHERE order_id = $1 RETURNING *',
            [orderId]
        );

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`kpi_base/${orderId}`, null, 'deleted');
        }

        res.json({
            success: true,
            deleted: result.rowCount > 0
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /kpi-base error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI STATISTICS API
// =====================================================

/**
 * GET /api/realtime/kpi-statistics/:userId/:date
 * Get KPI statistics for user on specific date
 */
router.get('/kpi-statistics/:userId/:date', async (req, res) => {
    try {
        const { userId, date } = req.params;
        const { campaignName } = req.query;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        let query, params;

        if (campaignName) {
            query = 'SELECT * FROM kpi_statistics WHERE user_id = $1 AND stat_date = $2 AND campaign_name = $3';
            params = [userId, date, campaignName];
        } else {
            query = 'SELECT * FROM kpi_statistics WHERE user_id = $1 AND stat_date = $2';
            params = [userId, date];
        }

        const result = await pool.query(query, params);

        res.json({
            success: true,
            statistics: result.rows
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /kpi-statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kpi-statistics/:userId/:date
 * Update KPI statistics
 */
router.put('/kpi-statistics/:userId/:date', async (req, res) => {
    try {
        const { userId, date } = req.params;
        const { campaignName, totalDifferences, totalAmount, orderCount, data } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        await pool.query(`
            INSERT INTO kpi_statistics (user_id, stat_date, campaign_name, total_differences, total_amount, order_count, data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, stat_date, campaign_name) DO UPDATE SET
                total_differences = $4,
                total_amount = $5,
                order_count = $6,
                data = $7,
                updated_at = CURRENT_TIMESTAMP
        `, [
            userId,
            date,
            campaignName || null,
            totalDifferences || 0,
            totalAmount || 0,
            orderCount || 0,
            data ? JSON.stringify(data) : null
        ]);

        // Notify SSE clients
        if (notifyClients) {
            notifyClients(`kpi_statistics/${userId}/${date}`, {
                userId,
                date,
                campaignName,
                totalDifferences,
                totalAmount,
                orderCount
            }, 'update');
        }

        res.json({ success: true, userId, date });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /kpi-statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// TAG UPDATES API (Multi-User Realtime Tag Sync)
// =====================================================

/**
 * GET /api/realtime/tag-updates/:orderId
 * Get latest tag update for an order
 */
router.get('/tag-updates/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT * FROM tag_updates WHERE order_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderId: row.order_id,
                orderCode: row.order_code,
                stt: row.stt,
                tags: row.tags,
                updatedBy: row.updated_by,
                timestamp: row.updated_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /tag-updates error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/tag-updates/:orderId
 * Update tags for an order
 */
router.put('/tag-updates/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { orderCode, stt, tags, updatedBy } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'tags must be an array' });
        }

        await pool.query(`
            INSERT INTO tag_updates (order_id, order_code, stt, tags, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [orderId, orderCode, stt, JSON.stringify(tags), updatedBy]);

        // Notify SSE clients
        if (notifyClientsWildcard) {
            notifyClientsWildcard(`tag_updates/${orderId}`, {
                orderId,
                orderCode,
                stt,
                tags,
                updatedBy,
                timestamp: Date.now()
            }, 'update');
        }

        console.log(`[REALTIME-DB] Tag update for order: ${orderId} by ${updatedBy}`);

        res.json({ success: true, orderId });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /tag-updates error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/tag-updates/since/:timestamp
 * Get all tag updates since a timestamp (for polling)
 */
router.get('/tag-updates/since/:timestamp', async (req, res) => {
    try {
        const { timestamp } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const sinceDate = new Date(parseInt(timestamp));
        const result = await pool.query(
            'SELECT * FROM tag_updates WHERE updated_at > $1 ORDER BY updated_at DESC LIMIT 100',
            [sinceDate]
        );

        res.json({
            success: true,
            updates: result.rows.map(row => ({
                orderId: row.order_id,
                orderCode: row.order_code,
                stt: row.stt,
                tags: row.tags,
                updatedBy: row.updated_by,
                timestamp: row.updated_at
            }))
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /tag-updates/since error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// DROPPED PRODUCTS API (Multi-User Collaboration)
// =====================================================

/**
 * GET /api/realtime/dropped-products
 * Get all dropped products (optionally filtered by user)
 */
router.get('/dropped-products', async (req, res) => {
    try {
        const { userId } = req.query;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        let query, params;
        if (userId) {
            query = 'SELECT * FROM dropped_products WHERE user_id = $1 ORDER BY created_at DESC';
            params = [userId];
        } else {
            query = 'SELECT * FROM dropped_products ORDER BY created_at DESC LIMIT 100';
            params = [];
        }

        const result = await pool.query(query, params);

        // Convert to Firebase-like structure
        const products = {};
        result.rows.forEach(row => {
            products[row.id] = {
                productCode: row.product_code,
                productName: row.product_name,
                size: row.size,
                quantity: row.quantity,
                userId: row.user_id,
                userName: row.user_name,
                orderId: row.order_id,
                isDraft: row.is_draft,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
        });

        res.json(products);
    } catch (error) {
        console.error('[REALTIME-DB] GET /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/dropped-products/:id
 * Add or update a dropped product
 */
router.put('/dropped-products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { productCode, productName, size, quantity, userId, userName, orderId, isDraft } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        await pool.query(`
            INSERT INTO dropped_products (id, product_code, product_name, size, quantity, user_id, user_name, order_id, is_draft, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                product_code = $2,
                product_name = $3,
                size = $4,
                quantity = $5,
                user_id = $6,
                user_name = $7,
                order_id = $8,
                is_draft = $9,
                updated_at = CURRENT_TIMESTAMP
        `, [id, productCode, productName, size, quantity || 1, userId, userName, orderId, isDraft || false]);

        // Notify SSE clients
        if (notifyClients) {
            notifyClients('dropped_products', {
                id,
                productCode,
                productName,
                size,
                quantity,
                userId,
                userName,
                orderId,
                isDraft
            }, 'update');
        }

        console.log(`[REALTIME-DB] Dropped product added/updated: ${id} by ${userName}`);

        res.json({ success: true, id });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/dropped-products/:id
 * Remove a dropped product
 */
router.delete('/dropped-products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM dropped_products WHERE id = $1 RETURNING *',
            [id]
        );

        // Notify SSE clients
        if (notifyClients) {
            notifyClients('dropped_products', {
                id,
                deleted: true
            }, 'deleted');
        }

        console.log(`[REALTIME-DB] Dropped product deleted: ${id}`);

        res.json({
            success: true,
            deleted: result.rowCount > 0
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /dropped-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// NOTE SNAPSHOTS API (Note Edit Tracking)
// =====================================================

/**
 * GET /api/realtime/note-snapshots/:orderId
 * Get note snapshot for an order
 */
router.get('/note-snapshots/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'SELECT * FROM note_snapshots WHERE order_id = $1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)',
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false, data: null });
        }

        const row = result.rows[0];
        res.json({
            exists: true,
            data: {
                orderId: row.order_id,
                noteText: row.note_text,
                encodedProducts: row.encoded_products,
                snapshotHash: row.snapshot_hash,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                expiresAt: row.expires_at
            }
        });
    } catch (error) {
        console.error('[REALTIME-DB] GET /note-snapshots error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/note-snapshots/:orderId
 * Save note snapshot (auto-expire after 7 days)
 */
router.put('/note-snapshots/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { noteText, encodedProducts, snapshotHash } = req.body;
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Set expiration to 7 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await pool.query(`
            INSERT INTO note_snapshots (order_id, note_text, encoded_products, snapshot_hash, created_at, updated_at, expires_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5)
            ON CONFLICT (order_id) DO UPDATE SET
                note_text = $2,
                encoded_products = $3,
                snapshot_hash = $4,
                updated_at = CURRENT_TIMESTAMP,
                expires_at = $5
        `, [orderId, noteText, encodedProducts, snapshotHash, expiresAt]);

        console.log(`[REALTIME-DB] Note snapshot saved for order: ${orderId}`);

        res.json({ success: true, orderId, expiresAt });
    } catch (error) {
        console.error('[REALTIME-DB] PUT /note-snapshots error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/note-snapshots/cleanup
 * Cleanup expired snapshots
 */
router.delete('/note-snapshots/cleanup', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;

        if (!pool) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await pool.query(
            'DELETE FROM note_snapshots WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP RETURNING order_id'
        );

        console.log(`[REALTIME-DB] Cleaned up ${result.rowCount} expired note snapshots`);

        res.json({
            success: true,
            deletedCount: result.rowCount
        });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE /note-snapshots/cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// EXPORTS
// =====================================================

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
