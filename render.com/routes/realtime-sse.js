// =====================================================
// REALTIME SSE (Server-Sent Events)
// Thay thế Firebase Realtime Database Listeners
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// SSE CLIENT MANAGEMENT
// =====================================================

/**
 * Store connected SSE clients
 * Map<string, Set<Response>>
 * key: Firebase path (e.g., "held_products/ORDER123", "tpos_token")
 * value: Set of Express Response objects listening to that key
 */
const sseClients = new Map();

/**
 * Store client metadata for debugging
 * Map<Response, Object>
 */
const clientMetadata = new WeakMap();

/**
 * Get current connection stats
 * @returns {Object} Connection statistics
 */
function getConnectionStats() {
    let totalClients = 0;
    const keyStats = {};

    sseClients.forEach((clients, key) => {
        keyStats[key] = clients.size;
        totalClients += clients.size;
    });

    return {
        totalClients,
        uniqueKeys: sseClients.size,
        keyStats
    };
}

// =====================================================
// SSE ENDPOINT
// =====================================================

/**
 * SSE endpoint for realtime updates
 * Client connects to: /api/realtime/sse?keys=key1,key2,key3
 *
 * Thay thế: firebase.database().ref(key).on('value', callback)
 *
 * Query Parameters:
 * - keys: Comma-separated list of keys to subscribe to
 *
 * Example:
 * - /api/realtime/sse?keys=tpos_token
 * - /api/realtime/sse?keys=held_products,kpi_base,settings
 * - /api/realtime/sse?keys=held_products/ORDER123
 */
router.get('/sse', (req, res) => {
    // Parse keys to subscribe to
    const keysParam = req.query.keys || '';
    const keys = keysParam.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

    if (keys.length === 0) {
        return res.status(400).json({
            error: 'No keys specified',
            usage: 'GET /api/realtime/sse?keys=key1,key2,key3'
        });
    }

    // Validate key length
    if (keys.some(k => k.length > 500)) {
        return res.status(400).json({ error: 'Key too long (max 500 characters)' });
    }

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Send initial connection message
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({
        keys,
        connectionId,
        timestamp: new Date().toISOString()
    })}\n\n`);

    // Store client metadata
    clientMetadata.set(res, {
        connectionId,
        keys,
        connectedAt: new Date(),
        ip: req.ip || req.connection.remoteAddress
    });

    // Register this client for each key
    keys.forEach(key => {
        if (!sseClients.has(key)) {
            sseClients.set(key, new Set());
        }
        sseClients.get(key).add(res);
    });

    console.log(`[SSE] Client connected (${connectionId}), watching: ${keys.join(', ')}`);
    console.log(`[SSE] Active connections:`, getConnectionStats().totalClients);

    // Heartbeat every 30 seconds to keep connection alive
    // This prevents proxies/load balancers from closing idle connections
    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat ${Date.now()}\n\n`);
        } catch (error) {
            // Client disconnected, clear interval
            clearInterval(heartbeat);
        }
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);

        // Remove client from all subscribed keys
        keys.forEach(key => {
            const clients = sseClients.get(key);
            if (clients) {
                clients.delete(res);
                if (clients.size === 0) {
                    sseClients.delete(key);
                }
            }
        });

        const metadata = clientMetadata.get(res);
        const duration = metadata ?
            ((Date.now() - metadata.connectedAt.getTime()) / 1000).toFixed(1) :
            'unknown';

        console.log(`[SSE] Client disconnected (${metadata?.connectionId || 'unknown'}) after ${duration}s`);
        console.log(`[SSE] Active connections:`, getConnectionStats().totalClients);

        // Cleanup metadata
        clientMetadata.delete(res);
    });

    // Handle errors
    req.on('error', (error) => {
        console.error('[SSE] Request error:', error.message);
        clearInterval(heartbeat);
    });
});

// =====================================================
// NOTIFICATION FUNCTIONS
// =====================================================

/**
 * Notify all clients watching a specific key
 * Called from other routes when data changes
 *
 * @param {string} key - Firebase path key
 * @param {any} data - Data to send (will be JSON stringified)
 * @param {string} eventType - Event type ('update', 'deleted', 'created')
 */
function notifyClients(key, data, eventType = 'update') {
    const clients = sseClients.get(key);
    if (!clients || clients.size === 0) {
        console.log(`[SSE] No clients listening to key: ${key}`);
        return 0;
    }

    const message = JSON.stringify({
        key,
        data,
        timestamp: Date.now(),
        event: eventType
    });

    let successCount = 0;
    let failureCount = 0;

    // Send to all clients watching this key
    clients.forEach(client => {
        try {
            client.write(`event: ${eventType}\n`);
            client.write(`data: ${message}\n\n`);
            successCount++;
        } catch (error) {
            console.error('[SSE] Error sending to client:', error.message);
            failureCount++;
            // Client will be cleaned up on 'close' event
        }
    });

    console.log(`[SSE] Notified ${successCount} clients for key: ${key}` +
        (failureCount > 0 ? ` (${failureCount} failed)` : ''));

    return successCount;
}

/**
 * Wildcard notify - notify all clients watching keys that match a pattern
 * Useful for nested paths like:
 * - "held_products/ORDER123" should notify "held_products" watchers
 * - "kpi_base/ORDER456" should notify "kpi_base" watchers
 *
 * @param {string} keyPrefix - Key prefix to match
 * @param {any} data - Data to send
 * @param {string} eventType - Event type
 */
function notifyClientsWildcard(keyPrefix, data, eventType = 'update') {
    let totalNotified = 0;

    sseClients.forEach((clients, key) => {
        // Match if:
        // 1. key starts with keyPrefix (e.g., "held_products" matches "held_products/ORDER123")
        // 2. keyPrefix starts with key (e.g., "held_products/ORDER123" matches "held_products")
        if (key.startsWith(keyPrefix) || keyPrefix.startsWith(key + '/')) {
            const message = JSON.stringify({
                key: keyPrefix,
                data,
                timestamp: Date.now(),
                event: eventType,
                matchedKey: key
            });

            clients.forEach(client => {
                try {
                    client.write(`event: ${eventType}\n`);
                    client.write(`data: ${message}\n\n`);
                    totalNotified++;
                } catch (error) {
                    console.error('[SSE] Error sending to client:', error.message);
                }
            });
        }
    });

    if (totalNotified > 0) {
        console.log(`[SSE] Wildcard notified ${totalNotified} clients for pattern: ${keyPrefix}`);
    }

    return totalNotified;
}

/**
 * Broadcast to ALL connected clients (use sparingly)
 * @param {any} data - Data to broadcast
 * @param {string} eventType - Event type
 */
function broadcastToAll(data, eventType = 'broadcast') {
    let totalNotified = 0;

    const message = JSON.stringify({
        data,
        timestamp: Date.now(),
        event: eventType
    });

    sseClients.forEach((clients) => {
        clients.forEach(client => {
            try {
                client.write(`event: ${eventType}\n`);
                client.write(`data: ${message}\n\n`);
                totalNotified++;
            } catch (error) {
                console.error('[SSE] Error broadcasting to client:', error.message);
            }
        });
    });

    console.log(`[SSE] Broadcast to ${totalNotified} clients`);
    return totalNotified;
}

// =====================================================
// DIAGNOSTIC ENDPOINTS
// =====================================================

/**
 * GET /api/realtime/sse/stats
 * Get SSE connection statistics (for debugging)
 */
router.get('/sse/stats', (req, res) => {
    const stats = getConnectionStats();
    res.json({
        success: true,
        ...stats,
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/realtime/sse/test
 * Send a test message to all clients watching a key (for debugging)
 */
router.post('/sse/test', (req, res) => {
    const { key, data } = req.body;

    if (!key) {
        return res.status(400).json({ error: 'Missing key parameter' });
    }

    const count = notifyClients(key, data || { test: true, timestamp: Date.now() }, 'test');

    res.json({
        success: true,
        key,
        clientsNotified: count
    });
});

// =====================================================
// WALLET EVENT SUBSCRIPTION
// Subscribe to wallet events and broadcast to SSE clients
// =====================================================

const { walletEvents } = require('../services/wallet-event-processor');

// Listen for wallet updates and notify SSE clients
walletEvents.on('wallet:update', (data) => {
    const { phone, wallet, transaction } = data;

    // Notify clients subscribed to this specific phone's wallet
    const key = `wallet:${phone}`;
    const clients = sseClients.get(key);

    if (clients && clients.size > 0) {
        const message = JSON.stringify({
            key,
            data: {
                phone,
                wallet,
                transaction,
                timestamp: Date.now()
            },
            timestamp: Date.now(),
            event: 'wallet_update'
        });

        let successCount = 0;
        clients.forEach(client => {
            try {
                client.write(`event: wallet_update\n`);
                client.write(`data: ${message}\n\n`);
                successCount++;
            } catch (error) {
                console.error('[SSE-WALLET] Error sending to client:', error.message);
            }
        });

        console.log(`[SSE-WALLET] ✅ Notified ${successCount} clients for wallet:${phone}`);
    }

    // Also notify wildcard watchers for "wallet" key (admin dashboard)
    notifyClientsWildcard('wallet', data, 'wallet_update');
});

console.log('[SSE] Wallet event subscription initialized');

// =====================================================
// EXPORTS
// =====================================================

// Export router with attached functions
router.notifyClients = notifyClients;
router.notifyClientsWildcard = notifyClientsWildcard;
router.broadcastToAll = broadcastToAll;
router.getConnectionStats = getConnectionStats;

module.exports = router;
