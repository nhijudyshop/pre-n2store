// =====================================================
// N2STORE API FALLBACK SERVER
// Deployed on Render.com as fallback when Cloudflare fails
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - Allow requests from GitHub Pages
// CORS - Allow specific origins
app.use(cors({
    origin: [
        'https://nhijudyshop.github.io', // Primary frontend
        'http://localhost:5500',         // Local development for frontend
        'http://localhost:3000'          // Local development for this server itself
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Data', 'X-User-Id'],
    credentials: false // credentials cannot be true when origin is *
}));

// Body parsing - increased limit for large customer imports (80k+ records)
app.use(express.json({ limit: '100mb' }));

// Serve static files from public folder (merged from /api)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// DATABASE CONNECTION
// =====================================================

// Initialize PostgreSQL connection pool for SePay and Customers routes
const chatDbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,                      // Maximum 20 connections
    idleTimeoutMillis: 30000,     // Close idle connections after 30s
    connectionTimeoutMillis: 10000 // Timeout waiting for connection
});

// Make pool available to routes via app.locals
app.locals.chatDb = chatDbPool;

// Test database connection on startup
chatDbPool.query('SELECT NOW()')
    .then(() => console.log('[DATABASE] PostgreSQL connected successfully'))
    .catch(err => console.error('[DATABASE] PostgreSQL connection error:', err.message));

// =====================================================
// REALTIME CREDENTIALS MANAGEMENT
// =====================================================

/**
 * Save realtime credentials to database for auto-reconnect on server restart
 */
async function saveRealtimeCredentials(db, clientType, credentials) {
    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type) DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;
        await db.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null
        ]);
        console.log(`[CREDENTIALS] Saved ${clientType} credentials for auto-reconnect`);
        return true;
    } catch (error) {
        // Table might not exist yet, ignore error
        console.log(`[CREDENTIALS] Could not save ${clientType} credentials:`, error.message);
        return false;
    }
}

/**
 * Load and auto-connect realtime clients on server startup
 */
async function autoConnectRealtimeClients(db) {
    try {
        console.log('[AUTO-CONNECT] Checking for saved credentials...');

        const result = await db.query(`
            SELECT client_type, token, user_id, page_ids, cookie, room
            FROM realtime_credentials
            WHERE is_active = TRUE
        `);

        if (result.rows.length === 0) {
            console.log('[AUTO-CONNECT] No saved credentials found. Waiting for manual start.');
            return;
        }

        for (const row of result.rows) {
            if (row.client_type === 'pancake' && row.token && row.user_id && row.page_ids) {
                const pageIds = JSON.parse(row.page_ids);
                console.log(`[AUTO-CONNECT] Starting Pancake client with ${pageIds.length} pages...`);
                realtimeClient.start(row.token, row.user_id, pageIds, row.cookie);
            } else if (row.client_type === 'tpos' && row.token) {
                console.log(`[AUTO-CONNECT] Starting TPOS client for room: ${row.room || 'tomato.tpos.vn'}...`);
                tposRealtimeClient.start(row.token, row.room || 'tomato.tpos.vn');
            }
        }
    } catch (error) {
        // Table might not exist yet
        console.log('[AUTO-CONNECT] Could not load credentials (table may not exist yet):', error.message);
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', async (req, res) => {
    try {
        await chatDbPool.query('SELECT 1'); // Test DB connection
        res.json({
            status: 'ok',
            message: 'N2Store API Fallback Server is running',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (dbError) {
        console.error('[HEALTH] Database check failed:', dbError.message);
        res.status(503).json({
            status: 'degraded',
            message: 'N2Store API Fallback Server is running but database is disconnected',
            database: 'disconnected',
            error: dbError.message,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
});

// Server time diagnostic endpoint for debugging Facebook 24-hour policy
app.get('/api/debug/time', (req, res) => {
    const now = new Date();
    res.json({
        utc: now.toISOString(),
        unix_timestamp: now.getTime(),
        unix_seconds: Math.floor(now.getTime() / 1000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone_offset_minutes: now.getTimezoneOffset(),
        server_time_string: now.toString(),
        vietnam_time: new Date(now.getTime() + (7 * 60 * 60 * 1000)).toISOString(), // UTC+7
        note: 'Compare this with your local time to check for clock drift'
    });
});

// Import route modules
const tokenRoutes = require('./routes/token');
const odataRoutes = require('./routes/odata');
const pancakeRoutes = require('./routes/pancake');
const imageProxyRoutes = require('./routes/image-proxy');
const sepayWebhookRoutes = require('./routes/sepay-webhook');
const customersRoutes = require('./routes/customers');
const returnOrdersRoutes = require('./routes/return-orders');
const cloudflareBackupRoutes = require('./routes/cloudflare-backup');
const realtimeRoutes = require('./routes/realtime');
const { saveRealtimeUpdate } = require('./routes/realtime');
const geminiRoutes = require('./routes/gemini');
const deepseekRoutes = require('./routes/deepseek');
const telegramBotRoutes = require('./routes/telegram-bot');
const uploadImageRoutes = require('./routes/upload');

// === FIREBASE REPLACEMENT ROUTES (SSE + PostgreSQL) ===
const realtimeSseRoutes = require('./routes/realtime-sse');
const realtimeDbRoutes = require('./routes/realtime-db');
const adminMigrationRoutes = require('./routes/admin-migration');

// === ROUTES MERGED FROM /api ===
const uploadRoutes = require('./routes/upload.routes');
const productsRoutes = require('./routes/products.routes');
const attributeRoutes = require('./routes/attribute.routes');
const facebookRoutes = require('./routes/facebook.routes');
const dynamicHeadersRoutes = require('./routes/dynamic-headers.routes');
const customer360Routes = require('./routes/customer-360');
const tposSavedRoutes = require('./routes/tpos-saved');

// Mount routes
app.use('/api/token', tokenRoutes);
app.use('/api/odata', odataRoutes);
app.use('/api/pancake', pancakeRoutes);
app.use('/api/image-proxy', imageProxyRoutes);
app.use('/api/sepay', sepayWebhookRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/tpos-saved', tposSavedRoutes);
app.use('/api', customer360Routes);  // Customer 360° routes: /api/customer, /api/wallet, /api/ticket
app.use('/api/return-orders', returnOrdersRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/deepseek', deepseekRoutes);
app.use('/api/telegram', telegramBotRoutes);
app.use('/api/upload', uploadImageRoutes);

// === FIREBASE REPLACEMENT ROUTES ===
// SSE for realtime updates (replaces Firebase listeners)
app.use('/api/realtime', realtimeSseRoutes);
// REST API for CRUD operations (replaces Firebase database operations)
app.use('/api/realtime', realtimeDbRoutes);
// Admin migration endpoint
app.use('/api/admin', adminMigrationRoutes);

// Initialize SSE notifiers in realtime-db routes
const { initializeNotifiers } = require('./routes/realtime-db');
initializeNotifiers(
    realtimeSseRoutes.notifyClients,
    realtimeSseRoutes.notifyClientsWildcard
);

// Cloudflare Worker Backup Routes (fb-avatar, pancake-avatar, proxy, pancake-direct, pancake-official, facebook-send, rest)
app.use('/api', cloudflareBackupRoutes);

// === ROUTES MERGED FROM /api ===
app.use(uploadRoutes);       // /upload, /upload-batch
app.use(productsRoutes);     // /products
app.use(attributeRoutes);    // /attributes
app.use(facebookRoutes);     // /facebook/*
app.use(dynamicHeadersRoutes); // /dynamic-headers/*
// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================

class RealtimeClient {
    constructor(db = null) {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // New: Max reconnect attempts
        this.db = db; // PostgreSQL connection pool

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
    }

    setDb(db) {
        this.db = db;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        // Generate 64-char random string to match browser behavior
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        // Ensure pageIds are strings
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[SERVER-WS] Connecting to Pancake... (attempt', this.reconnectAttempts + 1, ')');
        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        // Add cookie if available (critical for Cloudflare/Auth)
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, {
            headers: headers
        });

        this.ws.on('open', () => {
            console.log('[SERVER-WS] Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0; // Reset on successful connect
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[SERVER-WS] Closed', code, reason);
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000); // 2s, 4s, 8s, ... max 60s
                this.reconnectAttempts++;
                console.log(`[SERVER-WS] Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[SERVER-WS] ❌ Max reconnect attempts reached. Stopping reconnection.');
            }
        });

        this.ws.on('error', (err) => {
            console.error('[SERVER-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[SERVER-WS] Parse error:', e);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                this.ws.send(JSON.stringify([null, ref, "phoenix", "heartbeat", {}]));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // 1. Join User Channel
        const userRef = this.makeRef();
        const userJoinMsg = [
            userRef, userRef, `users:${this.userId}`, "phx_join",
            { accessToken: this.token, userId: this.userId, platform: "web" }
        ];
        this.ws.send(JSON.stringify(userJoinMsg));

        // 2. Join Multiple Pages Channel
        const pagesRef = this.makeRef();
        const pagesJoinMsg = [
            pagesRef, pagesRef, `multiple_pages:${this.userId}`, "phx_join",
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds,
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));

        // 3. Get Online Status (Mimic browser)
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            const statusMsg = [
                pagesRef, statusRef, `multiple_pages:${this.userId}`, "get_online_status", {}
            ];
            this.ws.send(JSON.stringify(statusMsg));
        }, 1000);
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log('[SERVER-WS] New Message/Comment:', conversation.id);

            // Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });

            // Save to PostgreSQL for later retrieval
            if (this.db && conversation) {
                const updateData = {
                    conversationId: conversation.id,
                    type: conversation.type || 'INBOX',
                    snippet: conversation.snippet || conversation.last_message?.message,
                    unreadCount: conversation.unread_count || 0,
                    pageId: conversation.page_id || (conversation.id ? conversation.id.split('_')[0] : null),
                    psid: conversation.from_psid || conversation.customers?.[0]?.fb_id,
                    customerName: conversation.from?.name || conversation.customers?.[0]?.name
                };

                saveRealtimeUpdate(this.db, updateData)
                    .then(() => console.log('[SERVER-WS] Update saved to DB'))
                    .catch(err => console.error('[SERVER-WS] Failed to save update:', err.message));
            }
        }
    }
}

// =====================================================
// TPOS REALTIME CLIENT (Socket.IO Protocol)
// =====================================================

class TposRealtimeClient {
    constructor() {
        this.ws = null;
        // Use rt-2.tpos.app with room parameter (from browser DevTools analysis)
        this.baseUrl = "wss://rt-2.tpos.app/socket.io/";
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Server-provided timing (will be updated from transport info)
        this.pingInterval = 25000;  // Default 25s
        this.pingTimeout = 20000;   // Default 20s

        // Last activity tracking
        this.lastPingTime = null;
        this.lastPongTime = null;

        // TPOS specific data
        this.token = null;
        this.room = 'tomato.tpos.vn';
    }

    getWebSocketUrl() {
        // Build URL with room parameter like browser does
        return `${this.baseUrl}?room=${encodeURIComponent(this.room)}&EIO=4&transport=websocket`;
    }

    start(token, room = 'tomato.tpos.vn') {
        this.token = token;
        this.room = room;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[TPOS-WS] Connecting to TPOS... (attempt', this.reconnectAttempts + 1, ')');

        // Build URL with room parameter
        const wsUrl = this.getWebSocketUrl();
        console.log('[TPOS-WS] Connection URL:', wsUrl.replace(/token=[^&]+/, 'token=***'));

        const headers = {
            'Origin': 'https://tomato.tpos.vn',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        this.ws = new WebSocket(wsUrl, {
            headers: headers
        });

        this.ws.on('open', () => {
            console.log('[TPOS-WS] ✅ WebSocket connected, sending handshake...');
            this.reconnectAttempts = 0; // Reset on successful connect

            // Socket.IO namespace connect
            const namespaceMsg = '40/chatomni,';
            this.ws.send(namespaceMsg);
            console.log('[TPOS-WS] 📤 Sent namespace connect:', namespaceMsg);
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = reason?.toString() || 'No reason provided';
            console.log(`[TPOS-WS] Closed - Code: ${code}, Reason: ${reasonText}`);

            // Log close code meanings for debugging
            const closeReasons = {
                1000: 'Normal Closure',
                1001: 'Going Away (server/browser closing)',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received (abnormal closure)',
                1006: 'Abnormal Closure (no close frame)',
                1007: 'Invalid Frame Payload Data',
                1008: 'Policy Violation',
                1009: 'Message Too Big',
                1010: 'Mandatory Extension Missing',
                1011: 'Internal Server Error',
                1015: 'TLS Handshake Failed'
            };
            console.log(`[TPOS-WS] Close reason: ${closeReasons[code] || 'Unknown'}`);

            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect: 2s, 4s, 8s, 16s, 32s (max 60s)
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(`[TPOS-WS] Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[TPOS-WS] ❌ Max reconnect attempts reached. Stopping reconnection.');
            }
        });

        this.ws.on('error', (err) => {
            console.error('[TPOS-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            const message = data.toString();
            // Log all raw messages for debugging (can comment out after troubleshooting)
            if (!message.startsWith('2') && !message.startsWith('3')) {
                console.log('[TPOS-WS] 📥 Raw message:', message.substring(0, 200)); // Truncate long messages
            }
            this.handleMessage(message);
        });
    }

    handleMessage(data) {
        // Socket.IO protocol messages
        if (data === '2') {
            // Ping from server, respond with pong immediately
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('3');
            }
            this.lastPongTime = Date.now();
            // console.log('[TPOS-WS] 🏓 Received ping, sent pong'); // Uncomment for verbose logging
            return;
        }

        if (data === '3') {
            // Pong response from server (for our ping)
            this.lastPongTime = Date.now();
            // console.log('[TPOS-WS] 🏓 Received pong from server'); // Uncomment for verbose logging
            return;
        }

        if (data.startsWith('0{')) {
            // Transport info (sid, upgrades, pingInterval, pingTimeout, etc.)
            try {
                const info = JSON.parse(data.substring(1));
                console.log('[TPOS-WS] Received transport info:', JSON.stringify(info));

                // Update timing from server
                if (info.pingInterval) {
                    this.pingInterval = info.pingInterval;
                }
                if (info.pingTimeout) {
                    this.pingTimeout = info.pingTimeout;
                }
                console.log(`[TPOS-WS] Server timing: pingInterval=${this.pingInterval}ms, pingTimeout=${this.pingTimeout}ms`);
            } catch (e) {
                console.log('[TPOS-WS] Received transport info (parse failed)');
            }
            return;
        }

        if (data.startsWith('40/chatomni,')) {
            // Namespace connected, now join room
            console.log('[TPOS-WS] ✅ Namespace connected successfully');
            console.log('[TPOS-WS] Joining room:', this.room);
            this.isConnected = true;
            this.joinRoom();
            this.startHeartbeat();
            return;
        }

        if (data.startsWith('42/chatomni,')) {
            // Event message
            const jsonStr = data.substring('42/chatomni,'.length);
            try {
                const [eventName, payload] = JSON.parse(jsonStr);
                this.handleEvent(eventName, payload);
            } catch (e) {
                console.error('[TPOS-WS] Parse error:', e);
            }
        }
    }

    handleEvent(eventName, payload) {
        console.log('[TPOS-WS] 📨 Event received:', eventName);

        // Handle join response
        if (eventName === 'join') {
            console.log('[TPOS-WS] ✅ Join room response:', JSON.stringify(payload));
        }

        // Handle authentication errors
        if (eventName === 'error' || eventName === 'unauthorized') {
            console.error('[TPOS-WS] ❌ Authentication/Error event:', JSON.stringify(payload));
        }

        // Broadcast raw event to connected frontend clients
        broadcastToClients({
            type: 'tpos:event',
            event: eventName,
            payload: payload
        });

        // Handle 'on-events' - main TPOS realtime events
        if (eventName === 'on-events') {
            try {
                // payload is a serialized JSON string, need to parse it
                const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;

                // TPOS format: { C: "Conversation", d: { t: "SaleOnline_Order", ... } }
                const context = eventData.C || eventData.Context;
                const data = eventData.d || eventData.data || eventData;
                const eventType = data.t || data.Type || data.EventName;

                console.log('[TPOS-WS] 📦 TPOS Event:', {
                    context: context,
                    type: eventType,
                    message: data.Message ? data.Message.substring(0, 50) + '...' : null
                });

                // Broadcast parsed event data with structured format
                broadcastToClients({
                    type: 'tpos:parsed-event',
                    context: context,
                    eventType: eventType,
                    data: data
                });

                // Handle specific event types
                if (eventType === 'SaleOnline_Order') {
                    console.log('[TPOS-WS] 🔥 NEW ORDER:', data.Message);
                    broadcastToClients({
                        type: 'tpos:new-order',
                        data: data
                    });
                } else if (eventType === 'SaleOnline_Update') {
                    console.log('[TPOS-WS] 📝 ORDER UPDATE:', data.Id);
                    broadcastToClients({
                        type: 'tpos:order-update',
                        data: data
                    });
                }

            } catch (e) {
                console.error('[TPOS-WS] Error parsing on-events payload:', e.message);
            }
        }
    }

    joinRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[TPOS-WS] ⚠️ Cannot join room - WebSocket not ready');
            return;
        }

        const joinMessage = `42/chatomni,["join",{"room":"${this.room}","token":"${this.token ? '***' : 'MISSING'}"}]`;
        this.ws.send(`42/chatomni,["join",{"room":"${this.room}","token":"${this.token}"}]`);
        console.log('[TPOS-WS] 📤 Sent join request:', joinMessage);
    }

    startHeartbeat() {
        this.stopHeartbeat();

        // Use interval slightly less than server's pingInterval to ensure we respond in time
        // Server sends ping every pingInterval, expects pong within pingTimeout
        // We send our own ping at 80% of pingInterval to stay ahead
        const heartbeatMs = Math.floor(this.pingInterval * 0.8);

        console.log(`[TPOS-WS] ❤️ Starting heartbeat every ${heartbeatMs}ms`);

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Check if we received pong recently
                const timeSinceLastPong = Date.now() - (this.lastPongTime || 0);
                if (this.lastPongTime && timeSinceLastPong > this.pingTimeout) {
                    console.error(`[TPOS-WS] ⚠️ No pong received for ${timeSinceLastPong}ms (timeout: ${this.pingTimeout}ms)`);
                    console.log('[TPOS-WS] Connection appears dead, forcing reconnect...');
                    this.ws.close();
                    return;
                }

                this.ws.send('2'); // Ping
                this.lastPingTime = Date.now();
                // console.log('[TPOS-WS] 💓 Ping sent'); // Uncomment for verbose logging
            }
        }, heartbeatMs);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    stop() {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;
        console.log('[TPOS-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            room: this.room,
            hasToken: !!this.token,
            reconnectAttempts: this.reconnectAttempts,
            pingInterval: this.pingInterval,
            pingTimeout: this.pingTimeout,
            lastPingTime: this.lastPingTime,
            lastPongTime: this.lastPongTime
        };
    }
}

// Initialize Global TPOS Client
const tposRealtimeClient = new TposRealtimeClient();

// Initialize Global Client with DB connection
const realtimeClient = new RealtimeClient();
realtimeClient.setDb(chatDbPool); // Pass PostgreSQL pool for saving updates

// API to start the Pancake client from the browser
app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    realtimeClient.start(token, userId, pageIds, cookie);

    // Save credentials for auto-reconnect on server restart
    await saveRealtimeCredentials(chatDbPool, 'pancake', { token, userId, pageIds, cookie });

    res.json({ success: true, message: 'Realtime client started on server (credentials saved for auto-reconnect)' });
});

// API to start the TPOS client from the browser
app.post('/api/realtime/tpos/start', async (req, res) => {
    const { token, room } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    tposRealtimeClient.start(token, room || 'tomato.tpos.vn');

    // Save credentials for auto-reconnect on server restart
    await saveRealtimeCredentials(chatDbPool, 'tpos', { token, room: room || 'tomato.tpos.vn' });

    res.json({ success: true, message: 'TPOS Realtime client started on server (credentials saved for auto-reconnect)' });
});

// API to get Pancake client status
app.get('/api/realtime/status', (req, res) => {
    res.json({
        connected: realtimeClient.isConnected,
        hasToken: !!realtimeClient.token,
        userId: realtimeClient.userId,
        pageCount: realtimeClient.pageIds?.length || 0
    });
});

// API to stop Pancake client and disable auto-connect
app.post('/api/realtime/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(`UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'pancake'`);
    } catch (e) { /* ignore */ }

    // Close WebSocket if connected
    if (realtimeClient.ws) {
        realtimeClient.ws.close();
        realtimeClient.ws = null;
    }
    realtimeClient.isConnected = false;
    realtimeClient.token = null;

    res.json({ success: true, message: 'Pancake Realtime client stopped (auto-connect disabled)' });
});

// API to stop the TPOS client
app.post('/api/realtime/tpos/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(`UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'tpos'`);
    } catch (e) { /* ignore */ }

    tposRealtimeClient.stop();
    res.json({ success: true, message: 'TPOS Realtime client stopped (auto-connect disabled)' });
});

// API to get TPOS client status
app.get('/api/realtime/tpos/status', (req, res) => {
    res.json(tposRealtimeClient.getStatus());
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store API Fallback Server',
        version: '2.0.0',
        description: 'Backup server for Cloudflare Worker - Full API compatibility',
        endpoints: {
            core: [
                'POST /api/token - TPOS Token with caching',
                'GET /api/odata/* - TPOS OData proxy',
                'GET /api/rest/* - TPOS REST API v2.0'
            ],
            pancake: [
                'GET /api/pancake/* - Pancake API proxy',
                'ALL /api/pancake-direct/* - Pancake 24h bypass',
                'ALL /api/pancake-official/* - pages.fm Public API'
            ],
            facebook: [
                'POST /api/facebook-send - Send message with tag',
                'GET /api/fb-avatar - Facebook/Pancake avatar',
                'GET /api/pancake-avatar - Pancake content avatar'
            ],
            media: [
                'GET /api/image-proxy - Image proxy bypass CORS'
            ],
            utility: [
                'GET /api/proxy - Generic proxy',
                'GET /api/customers/* - Customers API (PostgreSQL)',
                'POST /api/sepay/* - SePay webhook & balance'
            ],
            realtime: [
                'POST /api/realtime/start - Start Pancake WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/stop - Stop Pancake WebSocket (disables auto-reconnect)',
                'GET /api/realtime/status - Get Pancake client status',
                'GET /api/realtime/new-messages?since={timestamp} - Get new messages since timestamp',
                'GET /api/realtime/summary?since={timestamp} - Get summary count only',
                'POST /api/realtime/mark-seen - Mark updates as seen',
                'DELETE /api/realtime/cleanup?days={n} - Cleanup old records',
                'POST /api/realtime/tpos/start - Start TPOS WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/tpos/stop - Stop TPOS WebSocket (disables auto-reconnect)',
                'GET /api/realtime/tpos/status - Get TPOS client status'
            ],
            telegram: [
                'GET /api/telegram - Telegram bot status',
                'POST /api/telegram/webhook - Telegram webhook (Gemini AI)',
                'POST /api/telegram/setWebhook - Set webhook URL',
                'GET /api/telegram/webhookInfo - Get webhook info',
                'POST /api/telegram/deleteWebhook - Delete webhook'
            ],
            upload: [
                'POST /api/upload/image - Upload image to Firebase Storage',
                'DELETE /api/upload/image - Delete image from Firebase Storage',
                'GET /api/upload/health - Upload service health check'
            ],
            health: [
                'GET /health - Server health check',
                'GET /api/debug/time - Server time diagnostic'
            ]
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.url
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[GLOBAL_ERROR]', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: err.name || 'ServerError',
        message: message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================
const WebSocket = require('ws');
const http = require('http');

// Create HTTP server from Express app
const server = http.createServer(app);

// Create WebSocket Server for Frontend Clients
const wss = new WebSocket.Server({ server });

// Broadcast function
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Heartbeat for Frontend Clients (Keep-Alive)
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        // if (ws.isAlive === false) return ws.terminate(); // Disable for stability

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', function close() {
    clearInterval(interval);
});



// =====================================================
// START SERVER
// =====================================================

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 N2Store API Fallback Server');
    console.log('='.repeat(50));
    console.log(`📍 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(50));

    // Auto-connect realtime clients after server starts (with delay to ensure DB is ready)
    setTimeout(() => {
        autoConnectRealtimeClients(chatDbPool);
    }, 3000);
});

// Start cron jobs
require('./cron/scheduler');
