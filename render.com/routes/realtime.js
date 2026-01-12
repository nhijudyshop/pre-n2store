// =====================================================
// REALTIME UPDATES API
// Lưu và truy vấn tin nhắn/bình luận mới từ Pancake
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * Lưu một realtime update vào database
 * Được gọi từ WebSocket handler trong server.js
 */
async function saveRealtimeUpdate(db, updateData) {
    const {
        conversationId,
        type,
        snippet,
        unreadCount,
        pageId,
        psid,
        customerName
    } = updateData;

    try {
        const query = `
            INSERT INTO realtime_updates
            (conversation_id, type, snippet, unread_count, page_id, psid, customer_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `;

        const result = await db.query(query, [
            conversationId,
            type || 'INBOX',
            snippet ? snippet.substring(0, 200) : null, // Limit snippet length
            unreadCount || 0,
            pageId,
            psid,
            customerName
        ]);

        console.log(`[REALTIME-DB] Saved update: ${type} from ${customerName || psid}`);
        return result.rows[0];
    } catch (error) {
        console.error('[REALTIME-DB] Error saving update:', error.message);
        return null;
    }
}

/**
 * GET /api/realtime/new-messages
 * Lấy tin nhắn/bình luận mới kể từ timestamp
 *
 * Query params:
 * - since: Unix timestamp (ms) - bắt buộc
 * - limit: Số lượng tối đa (default: 100)
 */
router.get('/new-messages', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const since = parseInt(req.query.since) || 0;
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);

        // Convert timestamp to Date
        const sinceDate = since > 0 ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

        const query = `
            SELECT
                id,
                conversation_id,
                type,
                snippet,
                unread_count,
                page_id,
                psid,
                customer_name,
                created_at
            FROM realtime_updates
            WHERE created_at > $1
            ORDER BY created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [sinceDate, limit]);

        // Group by type
        const messages = result.rows.filter(r => r.type === 'INBOX');
        const comments = result.rows.filter(r => r.type === 'COMMENT');

        // Get unique customers
        const uniquePsids = [...new Set(result.rows.map(r => r.psid).filter(Boolean))];

        res.json({
            success: true,
            total: result.rows.length,
            messages: {
                count: messages.length,
                items: messages
            },
            comments: {
                count: comments.length,
                items: comments
            },
            uniqueCustomers: uniquePsids.length,
            since: sinceDate.toISOString(),
            serverTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('[REALTIME-API] Error fetching new messages:', error);
        res.status(500).json({ error: 'Failed to fetch new messages' });
    }
});

/**
 * GET /api/realtime/summary
 * Lấy tóm tắt tin mới (count only, không chi tiết)
 */
router.get('/summary', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const since = parseInt(req.query.since) || 0;
        const sinceDate = since > 0 ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

        const query = `
            SELECT
                type,
                COUNT(*) as count,
                COUNT(DISTINCT psid) as unique_customers
            FROM realtime_updates
            WHERE created_at > $1
            GROUP BY type
        `;

        const result = await db.query(query, [sinceDate]);

        const summary = {
            messages: 0,
            comments: 0,
            uniqueCustomers: 0
        };

        result.rows.forEach(row => {
            if (row.type === 'INBOX') {
                summary.messages = parseInt(row.count);
            } else if (row.type === 'COMMENT') {
                summary.comments = parseInt(row.count);
            }
        });

        // Get total unique customers across all types
        const uniqueQuery = `
            SELECT COUNT(DISTINCT psid) as total
            FROM realtime_updates
            WHERE created_at > $1 AND psid IS NOT NULL
        `;
        const uniqueResult = await db.query(uniqueQuery, [sinceDate]);
        summary.uniqueCustomers = parseInt(uniqueResult.rows[0]?.total || 0);

        res.json({
            success: true,
            ...summary,
            total: summary.messages + summary.comments,
            since: sinceDate.toISOString(),
            serverTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('[REALTIME-API] Error fetching summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * POST /api/realtime/mark-seen
 * Đánh dấu đã xem các updates
 */
router.post('/mark-seen', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { ids, before } = req.body;

        let query, params;

        if (ids && Array.isArray(ids) && ids.length > 0) {
            // Mark specific IDs as seen
            query = `UPDATE realtime_updates SET seen = TRUE WHERE id = ANY($1)`;
            params = [ids];
        } else if (before) {
            // Mark all before timestamp as seen
            query = `UPDATE realtime_updates SET seen = TRUE WHERE created_at <= $1`;
            params = [new Date(before)];
        } else {
            return res.status(400).json({ error: 'Missing ids or before parameter' });
        }

        const result = await db.query(query, params);

        res.json({
            success: true,
            updated: result.rowCount
        });

    } catch (error) {
        console.error('[REALTIME-API] Error marking seen:', error);
        res.status(500).json({ error: 'Failed to mark as seen' });
    }
});

/**
 * DELETE /api/realtime/cleanup
 * Xóa records cũ (admin only)
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const days = parseInt(req.query.days) || 7;

        const query = `
            DELETE FROM realtime_updates
            WHERE created_at < NOW() - INTERVAL '${days} days'
            RETURNING id
        `;

        const result = await db.query(query);

        console.log(`[REALTIME-DB] Cleaned up ${result.rowCount} old records`);

        res.json({
            success: true,
            deleted: result.rowCount
        });

    } catch (error) {
        console.error('[REALTIME-API] Error cleaning up:', error);
        res.status(500).json({ error: 'Failed to cleanup' });
    }
});

// Export both router and helper function
module.exports = router;
module.exports.saveRealtimeUpdate = saveRealtimeUpdate;
