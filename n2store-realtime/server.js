// =====================================================
// N2STORE REALTIME SERVER
// WebSocket proxy for Pancake.vn
// With PostgreSQL for message persistence
// Deployed on Render.com (Standard Plan)
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// DATABASE CONNECTION
// =====================================================

let dbPool = null;

async function initDatabase() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.warn('[DATABASE] ⚠️ DATABASE_URL not set - running without database persistence');
        return null;
    }

    try {
        dbPool = new Pool({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        // Test connection
        const client = await dbPool.connect();
        await client.query('SELECT 1');
        client.release();

        console.log('[DATABASE] ✅ PostgreSQL connected successfully');

        // Initialize tables
        await ensureTablesExist();

        return dbPool;
    } catch (error) {
        console.error('[DATABASE] ❌ Failed to connect:', error.message);
        return null;
    }
}

async function ensureTablesExist() {
    if (!dbPool) return;

    try {
        // Create realtime_credentials table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS realtime_credentials (
                id SERIAL PRIMARY KEY,
                client_type VARCHAR(20) NOT NULL UNIQUE,
                token TEXT NOT NULL,
                user_id VARCHAR(50),
                page_ids TEXT,
                cookie TEXT,
                room VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create pending_customers table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS pending_customers (
                id SERIAL PRIMARY KEY,
                psid VARCHAR(50) NOT NULL,
                page_id VARCHAR(50) NOT NULL,
                customer_name VARCHAR(200),
                last_message_snippet TEXT,
                last_message_time TIMESTAMP DEFAULT NOW(),
                message_count INTEGER DEFAULT 1,
                type VARCHAR(20) DEFAULT 'INBOX' CHECK (type IN ('INBOX', 'COMMENT')),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(psid, page_id)
            )
        `);

        // Create indexes
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_pending_customers_psid ON pending_customers(psid, page_id);
            CREATE INDEX IF NOT EXISTS idx_pending_customers_time ON pending_customers(last_message_time DESC);
        `);

        // Drop old conversation_post_types table (replaced by livestream_conversations)
        await dbPool.query(`DROP TABLE IF EXISTS conversation_post_types`);

        // Create livestream_conversations table (single source of truth for livestream tab + labels)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS livestream_conversations (
                conv_id VARCHAR(500) PRIMARY KEY,
                post_id VARCHAR(500) NOT NULL,
                post_name TEXT,
                name VARCHAR(200),
                avatar TEXT,
                last_message TEXT,
                conv_time TIMESTAMP,
                type VARCHAR(20),
                page_id VARCHAR(255),
                page_name VARCHAR(200),
                psid VARCHAR(100),
                customer_id VARCHAR(255),
                label TEXT DEFAULT 'new',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Add post_name column if missing (for existing tables)
        await dbPool.query(`ALTER TABLE livestream_conversations ADD COLUMN IF NOT EXISTS post_name TEXT`).catch(() => {});
        // Widen label column from VARCHAR(50) to TEXT (supports JSON arrays of multiple labels)
        await dbPool.query(`ALTER TABLE livestream_conversations ALTER COLUMN label TYPE TEXT`).catch(() => {});
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_livestream_conv_post ON livestream_conversations(post_id);
        `);

        // Drop old tables that are no longer needed
        await dbPool.query(`
            DROP TABLE IF EXISTS livestream_customers;
            DROP TABLE IF EXISTS pinned_conversations;
        `);

        // Create conversation_labels table (dedicated label storage, separate from livestream)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS conversation_labels (
                conv_id VARCHAR(500) PRIMARY KEY,
                labels TEXT NOT NULL DEFAULT '["new"]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // One-time migration: copy labels from livestream_conversations to conversation_labels
        await dbPool.query(`
            INSERT INTO conversation_labels (conv_id, labels, updated_at)
            SELECT conv_id, label, updated_at FROM livestream_conversations
            WHERE label IS NOT NULL AND label != 'new' AND label != '["new"]'
            ON CONFLICT (conv_id) DO NOTHING
        `).catch(() => {});

        // Clean up: remove fake 'inbox' rows from livestream_conversations (created by old label upsert)
        await dbPool.query(`DELETE FROM livestream_conversations WHERE post_id = 'inbox'`).catch(() => {});

        // Create inbox_groups table (group definitions synced across devices)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS inbox_groups (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                color VARCHAR(20) DEFAULT '#3b82f6',
                note TEXT,
                sort_order INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('[DATABASE] ✅ Tables initialized');
    } catch (error) {
        console.error('[DATABASE] Error creating tables:', error.message);
    }
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

async function upsertPendingCustomer(data) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
            VALUES ($1, $2, $3, $4, NOW(), 1, $5)
            ON CONFLICT (psid, page_id)
            DO UPDATE SET
                customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                last_message_snippet = EXCLUDED.last_message_snippet,
                last_message_time = NOW(),
                message_count = pending_customers.message_count + 1
        `;

        await dbPool.query(query, [
            data.psid,
            data.pageId,
            data.customerName,
            data.snippet?.substring(0, 200),
            data.type || 'INBOX'
        ]);

        console.log(`[DATABASE] ✅ Upserted pending customer: ${data.psid} (${data.type})`);
    } catch (error) {
        console.error('[DATABASE] Error upserting pending customer:', error.message);
    }
}

/**
 * Auto-cleanup: Delete pending_customers older than 3 days
 */
async function cleanupExpiredPendingCustomers() {
    if (!dbPool) return;

    try {
        const result = await dbPool.query(`
            DELETE FROM pending_customers
            WHERE last_message_time < NOW() - INTERVAL '3 days'
        `);

        if (result.rowCount > 0) {
            console.log(`[DATABASE] 🧹 Cleaned up ${result.rowCount} expired pending customers (>3 days)`);
        }
    } catch (error) {
        console.error('[DATABASE] Error cleaning up expired customers:', error.message);
    }
}

async function saveRealtimeCredentials(clientType, credentials) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type)
            DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;

        await dbPool.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null
        ]);

        console.log(`[DATABASE] ✅ Saved ${clientType} credentials for auto-reconnect`);
    } catch (error) {
        console.error('[DATABASE] Error saving credentials:', error.message);
    }
}

async function loadRealtimeCredentials(clientType) {
    if (!dbPool) return null;

    try {
        const result = await dbPool.query(
            'SELECT * FROM realtime_credentials WHERE client_type = $1 AND is_active = TRUE',
            [clientType]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[DATABASE] Error loading credentials:', error.message);
        return null;
    }
}

async function disableRealtimeCredentials(clientType) {
    if (!dbPool) return;

    try {
        await dbPool.query(
            'UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = $1',
            [clientType]
        );
        console.log(`[DATABASE] Disabled ${clientType} auto-connect`);
    } catch (error) {
        console.error('[DATABASE] Error disabling credentials:', error.message);
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// PANCAKE REALTIME CLIENT
// =====================================================

class RealtimeClient {
    constructor() {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50; // Increased for 24/7 operation

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async start(token, userId, pageIds, cookie = null, saveCredentials = true) {
        // Always force reconnect with fresh credentials
        // Old connection may be zombie (heartbeat works but no data)
        if (this.ws) {
            console.log('[PANCAKE-WS] Closing existing connection for fresh start...');
            this.stopHeartbeat();
            clearTimeout(this.reconnectTimer);
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }

        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;

        // Save credentials for auto-reconnect
        if (saveCredentials) {
            await saveRealtimeCredentials('pancake', {
                token,
                userId,
                pageIds: this.pageIds,
                cookie
            });
        }

        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[PANCAKE-WS] Connecting to Pancake...');
        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log('[PANCAKE-WS] ✅ Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[PANCAKE-WS] Closed', code, reason?.toString());
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff with max 5 minutes
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 300000);
                this.reconnectAttempts++;
                console.log(`[PANCAKE-WS] Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts})...`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error('[PANCAKE-WS] ❌ Max reconnect attempts reached. Will try again in 30 minutes.');
                // Reset and try again after 30 minutes
                setTimeout(() => {
                    this.reconnectAttempts = 0;
                    this.connect();
                }, 30 * 60 * 1000);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[PANCAKE-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[PANCAKE-WS] Parse error:', e, 'raw:', data?.toString?.()?.substring(0, 200));
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
        console.log(`[PANCAKE-WS] Joining users:${this.userId} channel...`);
        console.log(`[PANCAKE-WS] Token (first 20 chars): ${this.token?.substring(0, 20)}...`);
        console.log(`[PANCAKE-WS] Cookie present: ${!!this.cookie}, length: ${this.cookie?.length || 0}`);

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
        console.log(`[PANCAKE-WS] Joining multiple_pages:${this.userId} with ${this.pageIds.length} pages: [${this.pageIds.join(', ')}]`);

        // 3. Get Online Status
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

        // Debug: log ALL messages from Pancake (để thấy phx_reply, heartbeat, errors)
        if (event === 'phx_reply') {
            const status = payload?.status || 'unknown';
            const resp = payload?.response;
            console.log(`[PANCAKE-WS] 📋 phx_reply [${topic}] status=${status}`, resp ? JSON.stringify(resp).substring(0, 200) : '');
            if (status === 'error') {
                console.error(`[PANCAKE-WS] ❌ Channel join FAILED: ${topic}`, JSON.stringify(resp));
            }
        } else if (event === 'phx_error') {
            console.error(`[PANCAKE-WS] ❌ phx_error [${topic}]`, JSON.stringify(payload).substring(0, 300));
        } else if (event === 'phx_close') {
            console.warn(`[PANCAKE-WS] ⚠️ phx_close [${topic}]`);
        } else if (event !== 'pages:update_conversation' && event !== 'order:tags_updated') {
            // Log mọi event khác để debug
            console.log(`[PANCAKE-WS] 📨 Event: ${event} [${topic}]`, JSON.stringify(payload).substring(0, 300));
        }

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log('[PANCAKE-WS] 📩 New Message:', conversation?.id, '- Type:', conversation?.type);

            // 1. Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });

            // 2. Save to database for persistence
            if (conversation) {
                const customerPsid = conversation.from_psid ||
                                    conversation.customers?.[0]?.fb_id ||
                                    conversation.from?.id;

                if (customerPsid) {
                    upsertPendingCustomer({
                        psid: customerPsid,
                        pageId: conversation.page_id,
                        customerName: conversation.from?.name || conversation.customers?.[0]?.name,
                        snippet: conversation.snippet || conversation.last_message?.message,
                        type: conversation.type || 'INBOX'
                    });
                }

                // 3. Livestream detection for COMMENT conversations
                const postType = conversation.post?.type;
                const isLivestream = postType === 'livestream' || conversation.post?.live_video_status === 'vod' || conversation.post?.live_video_status === 'live';

                if (conversation.type === 'COMMENT' && isLivestream && customerPsid) {
                    // Save to livestream_conversations table (single source of truth)
                    const postName = conversation.post?.message || null;
                    saveLivestreamConversation(conversation.id, conversation.post_id, {
                        postName,
                        name: conversation.from?.name || conversation.customers?.[0]?.name,
                        type: conversation.type,
                        pageId: conversation.page_id,
                        psid: customerPsid,
                        customerId: conversation.customers?.[0]?.id
                    });

                    // WS payload often lacks post.message — fetch from API and update DB
                    if (!postName) {
                        fetchAndSavePostName(conversation.id, conversation.page_id, conversation.post_id);
                    }
                }

                if (conversation.type === 'COMMENT' && conversation.post_id) {
                    if (postType) {
                        // Cache known post type in memory
                        postTypeCache.set(conversation.post_id, { postType, liveVideoStatus: conversation.post?.live_video_status || null, postMessage: conversation.post?.message || null });
                    } else {
                        // No post data in payload — fallback to cache + Pancake API
                        lookupPostType(conversation.id, conversation.page_id, conversation.post_id)
                            .then(result => {
                                if (result) {
                                    broadcastToClients({
                                        type: 'post_type_detected',
                                        conversationId: conversation.id,
                                        postId: conversation.post_id,
                                        postType: result.postType,
                                        liveVideoStatus: result.liveVideoStatus
                                    });
                                    if (result.postType === 'livestream' && customerPsid) {
                                        saveLivestreamConversation(conversation.id, conversation.post_id, {
                                            postName: result.postMessage || null,
                                            name: conversation.from?.name || conversation.customers?.[0]?.name,
                                            type: conversation.type,
                                            pageId: conversation.page_id,
                                            psid: customerPsid,
                                            customerId: conversation.customers?.[0]?.id
                                        });
                                    }
                                }
                            })
                            .catch(err => console.error('[LIVESTREAM] Detection error:', err.message));
                    }
                }
            }
        } else if (event === 'order:tags_updated') {
            console.log('[PANCAKE-WS] 🏷️ Tags Updated:', payload);
            broadcastToClients({
                type: 'order:tags_updated',
                payload: payload
            });
        }
    }

    async stop(disableAutoConnect = true) {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.token = null;

        if (disableAutoConnect) {
            await disableRealtimeCredentials('pancake');
        }

        console.log('[PANCAKE-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            wsReadyState: this.ws?.readyState ?? 'no_ws', // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
            hasToken: !!this.token,
            tokenFirst20: this.token?.substring(0, 20) || null,
            userId: this.userId,
            pageIds: this.pageIds || [],
            pageCount: this.pageIds?.length || 0,
            hasCookie: !!this.cookie,
            cookieLength: this.cookie?.length || 0,
            reconnectAttempts: this.reconnectAttempts,
            heartbeatActive: !!this.heartbeatInterval,
            refCounter: this.refCounter,
        };
    }
}

// =====================================================
// GLOBAL INSTANCES
// =====================================================

const realtimeClient = new RealtimeClient();

// =====================================================
// LIVESTREAM DETECTION (server-side, per post_id)
// =====================================================

const postTypeCache = new Map();          // post_id → { postType, liveVideoStatus } (in-memory only)
const pageAccessTokenCache = new Map();   // page_id → { token, cachedAt }
const postTypeLookupInFlight = new Set(); // dedupe concurrent lookups for same post_id
const PAGE_TOKEN_TTL = 3600000;           // 1 hour

/**
 * Save a conversation to livestream_conversations table (single source of truth)
 */
async function saveLivestreamConversation(convId, postId, data) {
    if (!dbPool || !convId || !postId) return;
    try {
        await dbPool.query(`
            INSERT INTO livestream_conversations (conv_id, post_id, post_name, name, type, page_id, psid, customer_id, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (conv_id) DO UPDATE SET
                post_id = EXCLUDED.post_id,
                post_name = COALESCE(EXCLUDED.post_name, livestream_conversations.post_name),
                name = COALESCE(EXCLUDED.name, livestream_conversations.name),
                type = COALESCE(EXCLUDED.type, livestream_conversations.type),
                page_id = COALESCE(EXCLUDED.page_id, livestream_conversations.page_id),
                psid = COALESCE(EXCLUDED.psid, livestream_conversations.psid),
                customer_id = COALESCE(EXCLUDED.customer_id, livestream_conversations.customer_id),
                updated_at = CURRENT_TIMESTAMP
        `, [
            convId, postId,
            data.postName || null,
            data.name || null,
            data.type || null,
            data.pageId || null,
            data.psid || null,
            data.customerId || null
        ]);
        console.log(`[LIVESTREAM] ✅ Saved livestream conversation: ${convId} → post ${postId}`);
    } catch (error) {
        console.error('[LIVESTREAM] Error saving livestream conversation:', error.message);
    }
}


/**
 * Fetch post name from Pancake messages API and update DB
 * Used when WS payload lacks post.message
 */
async function fetchAndSavePostName(conversationId, pageId, postId) {
    try {
        // Check if we already have the name in cache
        const cached = postTypeCache.get(postId);
        if (cached?.postMessage) {
            await dbPool.query(
                `UPDATE livestream_conversations SET post_name = $1 WHERE post_id = $2 AND post_name IS NULL`,
                [cached.postMessage, postId]
            );
            return;
        }

        const pageAccessToken = await getOrFetchPageAccessToken(pageId);
        if (!pageAccessToken) return;

        const url = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?page_access_token=${pageAccessToken}&limit=1`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const data = await response.json();
        const post = data.post || data.conversation?.post;
        // Livestream posts have message=null, fallback to story or date+admin
        const postName = post?.message
            || post?.story
            || (post?.inserted_at ? `Live ${new Date(post.inserted_at).toLocaleDateString('vi-VN')}${post.admin_creator?.name ? ' - ' + post.admin_creator.name : ''}` : null);

        if (postName && dbPool) {
            await dbPool.query(
                `UPDATE livestream_conversations SET post_name = $1 WHERE post_id = $2 AND post_name IS NULL`,
                [postName, postId]
            );
            if (cached) cached.postMessage = postName;
            console.log(`[LIVESTREAM] ✅ Fetched & saved post name for ${postId}: "${postName.substring(0, 50)}"`);
        }
    } catch (error) {
        console.error(`[LIVESTREAM] Error fetching post name for ${postId}:`, error.message);
    }
}

/**
 * Get or fetch page_access_token for a page (cached 1 hour)
 */
async function getOrFetchPageAccessToken(pageId) {
    const cached = pageAccessTokenCache.get(pageId);
    if (cached && (Date.now() - cached.cachedAt) < PAGE_TOKEN_TTL) {
        return cached.token;
    }

    if (!realtimeClient.token) {
        console.warn('[LIVESTREAM] No JWT token available for page_access_token generation');
        return null;
    }

    try {
        const url = `https://pancake.vn/api/v1/pages/${pageId}/generate_page_access_token?access_token=${realtimeClient.token}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`[LIVESTREAM] Failed to get page_access_token for ${pageId}: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.success && data.page_access_token) {
            pageAccessTokenCache.set(pageId, { token: data.page_access_token, cachedAt: Date.now() });
            console.log(`[LIVESTREAM] ✅ Cached page_access_token for page ${pageId}`);
            return data.page_access_token;
        }

        console.warn(`[LIVESTREAM] No page_access_token in response for ${pageId}:`, data.message || '');
        return null;
    } catch (error) {
        console.error(`[LIVESTREAM] Error fetching page_access_token for ${pageId}:`, error.message);
        return null;
    }
}

/**
 * Lookup post type for a COMMENT conversation
 * 2-step: in-memory cache → Pancake API (once per post_id)
 */
async function lookupPostType(conversationId, pageId, postId) {
    if (!postId || !pageId) return null;

    // 1. Check in-memory cache
    const cached = postTypeCache.get(postId);
    if (cached) return cached;

    // 2. Dedupe: skip if another lookup for same post_id is in-flight
    if (postTypeLookupInFlight.has(postId)) return null;
    postTypeLookupInFlight.add(postId);

    try {
        const pageAccessToken = await getOrFetchPageAccessToken(pageId);
        if (!pageAccessToken) return null;

        const url = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?page_access_token=${pageAccessToken}&limit=1`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        const post = data.post || data.conversation?.post;

        if (post && post.type) {
            const postMessage = post.message || post.story || (post.inserted_at ? `Live ${new Date(post.inserted_at).toLocaleDateString('vi-VN')}${post.admin_creator?.name ? ' - ' + post.admin_creator.name : ''}` : null);
            const entry = { postType: post.type, liveVideoStatus: post.live_video_status || null, postMessage };
            postTypeCache.set(postId, entry);
            console.log(`[LIVESTREAM] ✅ API detected post ${postId}: ${entry.postType} (${entry.liveVideoStatus || 'n/a'})`);
            return entry;
        }

        return null;
    } catch (error) {
        console.error(`[LIVESTREAM] Error looking up post_type for ${postId}:`, error.message);
        return null;
    } finally {
        postTypeLookupInFlight.delete(postId);
    }
}

// =====================================================
// AUTO-CONNECT ON SERVER START
// =====================================================

async function autoConnectClients() {
    console.log('[AUTO-CONNECT] Checking for saved credentials...');

    // Auto-connect Pancake
    const pancakeCredentials = await loadRealtimeCredentials('pancake');
    if (pancakeCredentials && pancakeCredentials.token) {
        console.log('[AUTO-CONNECT] Found Pancake credentials, starting...');
        const pageIds = pancakeCredentials.page_ids ? JSON.parse(pancakeCredentials.page_ids) : [];
        await realtimeClient.start(
            pancakeCredentials.token,
            pancakeCredentials.user_id,
            pageIds,
            pancakeCredentials.cookie,
            false // Don't save again
        );
    } else {
        console.log('[AUTO-CONNECT] No Pancake credentials found');
    }

}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'N2Store Realtime Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbPool ? 'connected' : 'not configured',
        clients: {
            pancake: realtimeClient.getStatus()
        }
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Realtime Server',
        version: '2.1.0',
        description: 'WebSocket proxy for Pancake.vn with database persistence',
        database: dbPool ? 'connected' : 'not configured',
        endpoints: {
            pancake: [
                'POST /api/realtime/start - Start Pancake WebSocket',
                'POST /api/realtime/stop - Stop Pancake WebSocket',
                'GET /api/realtime/status - Get Pancake status'
            ],
            pendingCustomers: [
                'GET /api/realtime/pending-customers - Get pending customers',
                'POST /api/realtime/mark-replied - Mark customer as replied'
            ],
            health: [
                'GET /health - Server health check'
            ]
        }
    });
});

// ===== PANCAKE REALTIME =====

app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters: token, userId, pageIds required' });
    }

    await realtimeClient.start(token, userId, pageIds, cookie);
    res.json({
        success: true,
        message: 'Pancake Realtime client started (credentials saved for auto-reconnect)'
    });
});

app.post('/api/realtime/stop', async (req, res) => {
    await realtimeClient.stop();
    res.json({ success: true, message: 'Pancake Realtime client stopped' });
});

app.get('/api/realtime/status', (req, res) => {
    res.json(realtimeClient.getStatus());
});

// Debug: force reconnect to test
app.post('/api/realtime/reconnect', async (req, res) => {
    console.log('[PANCAKE-WS] 🔄 Force reconnect requested');
    if (realtimeClient.ws) {
        realtimeClient.ws.close();
        realtimeClient.ws = null;
    }
    realtimeClient.isConnected = false;
    realtimeClient.reconnectAttempts = 0;
    realtimeClient.connect();
    res.json({ success: true, message: 'Force reconnect initiated' });
});

// ===== PENDING CUSTOMERS API =====

app.get('/api/realtime/pending-customers', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured'
        });
    }

    try {
        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        const result = await dbPool.query(`
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                last_message_time,
                message_count,
                type
            FROM pending_customers
            ORDER BY last_message_time DESC
            LIMIT $1
        `, [limit]);

        res.json({
            success: true,
            count: result.rows.length,
            customers: result.rows
        });
    } catch (error) {
        console.error('[API] Error fetching pending customers:', error);
        res.status(500).json({ error: 'Failed to fetch pending customers' });
    }
});

app.post('/api/realtime/mark-replied', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured'
        });
    }

    try {
        const { psid, pageId } = req.body;

        if (!psid) {
            return res.status(400).json({ error: 'Missing psid parameter' });
        }

        let query, params;
        if (pageId) {
            query = 'DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2 RETURNING *';
            params = [psid, pageId];
        } else {
            query = 'DELETE FROM pending_customers WHERE psid = $1 RETURNING *';
            params = [psid];
        }

        const result = await dbPool.query(query, params);

        console.log(`[API] ✅ Marked replied: ${psid} (${result.rowCount} removed)`);

        res.json({
            success: true,
            removed: result.rowCount
        });
    } catch (error) {
        console.error('[API] Error marking replied:', error);
        res.status(500).json({ error: 'Failed to mark as replied' });
    }
});

// Clear all pending customers (for debugging)
app.post('/api/realtime/clear-pending', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }

    const { confirm } = req.body;
    if (confirm !== 'yes') {
        return res.status(400).json({ error: 'Must confirm with { "confirm": "yes" }' });
    }

    try {
        const result = await dbPool.query('DELETE FROM pending_customers RETURNING *');
        console.log(`[API] ⚠️ Cleared ${result.rowCount} pending customers`);
        res.json({ success: true, cleared: result.rowCount });
    } catch (error) {
        console.error('[API] Error clearing pending:', error);
        res.status(500).json({ error: 'Failed to clear pending customers' });
    }
});



// =====================================================
// LIVESTREAM CONVERSATIONS ROUTES (single source of truth)
// =====================================================

// GET /api/realtime/livestream-conversations - All conversations grouped by post_id
app.get('/api/realtime/livestream-conversations', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const result = await dbPool.query(
            'SELECT * FROM livestream_conversations ORDER BY updated_at DESC'
        );

        // Group by post_id + collect post names
        const posts = {};
        const postNames = {};
        for (const row of result.rows) {
            if (!posts[row.post_id]) posts[row.post_id] = [];
            posts[row.post_id].push({
                conv_id: row.conv_id,
                name: row.name,
                type: row.type,
                page_id: row.page_id,
                psid: row.psid,
                customer_id: row.customer_id,
                label: row.label,
                updated_at: row.updated_at
            });
            // First non-null post_name wins per post_id
            if (row.post_name && !postNames[row.post_id]) {
                postNames[row.post_id] = row.post_name;
            }
        }

        res.json({
            success: true,
            posts,
            postNames,
            totalConversations: result.rows.length
        });
    } catch (error) {
        console.error('[API] Error getting livestream conversations:', error);
        res.status(500).json({ error: 'Failed to get livestream conversations' });
    }
});

// PUT /api/realtime/livestream-conversation - Upsert one conversation
app.put('/api/realtime/livestream-conversation', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const { convId, postId, postName, name, type, pageId, psid, customerId, label } = req.body;
        if (!convId || !postId) {
            return res.status(400).json({ error: 'convId and postId required' });
        }

        await saveLivestreamConversation(convId, postId, {
            postName, name, type, pageId, psid, customerId
        });

        // Update label if provided
        if (label) {
            await dbPool.query('UPDATE livestream_conversations SET label = $2 WHERE conv_id = $1', [convId, label]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[API] Error saving livestream conversation:', error);
        res.status(500).json({ error: 'Failed to save livestream conversation' });
    }
});

// DELETE /api/realtime/livestream-conversations - Delete by post_id, conv_id, or all
app.delete('/api/realtime/livestream-conversations', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const postId = req.query.post_id;
        const convId = req.query.conv_id;
        let result;
        if (convId) {
            result = await dbPool.query('DELETE FROM livestream_conversations WHERE conv_id = $1', [convId]);
        } else if (postId) {
            result = await dbPool.query('DELETE FROM livestream_conversations WHERE post_id = $1', [postId]);
        } else {
            result = await dbPool.query('DELETE FROM livestream_conversations');
        }

        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[API] Error deleting livestream conversations:', error);
        res.status(500).json({ error: 'Failed to delete livestream conversations' });
    }
});

// GET /api/realtime/conversation-labels - Get all labels from dedicated table
app.get('/api/realtime/conversation-labels', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const result = await dbPool.query(`
            SELECT conv_id, labels FROM conversation_labels
            WHERE labels != '["new"]' AND labels != 'new'
            ORDER BY updated_at DESC LIMIT 5000
        `);
        const labelMap = {};
        for (const row of result.rows) {
            labelMap[row.conv_id] = row.labels;
        }
        res.json({ success: true, labelMap, total: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/conversation-label - Upsert label for any conversation
app.put('/api/realtime/conversation-label', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { convId, labels } = req.body;
        // Support both old format {convId, label} and new format {convId, labels}
        const labelsStr = labels || req.body.label;
        if (!convId || !labelsStr) return res.status(400).json({ error: 'convId and labels required' });
        const result = await dbPool.query(`
            INSERT INTO conversation_labels (conv_id, labels, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (conv_id) DO UPDATE SET labels = $2, updated_at = NOW()
        `, [convId, labelsStr]);
        res.json({ success: true, upserted: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/conversation-labels/bulk - Bulk upsert labels (for initial sync from localStorage)
app.put('/api/realtime/conversation-labels/bulk', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { labelMap } = req.body;
        if (!labelMap || typeof labelMap !== 'object') return res.status(400).json({ error: 'labelMap required' });
        let upserted = 0;
        for (const [convId, labels] of Object.entries(labelMap)) {
            const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);
            if (labelsStr === '["new"]' || labelsStr === 'new') continue;
            await dbPool.query(`
                INSERT INTO conversation_labels (conv_id, labels, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (conv_id) DO UPDATE SET labels = $2, updated_at = NOW()
            `, [convId, labelsStr]);
            upserted++;
        }
        res.json({ success: true, upserted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/realtime/inbox-groups - Get all group definitions
app.get('/api/realtime/inbox-groups', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const result = await dbPool.query('SELECT id, name, color, note, sort_order FROM inbox_groups ORDER BY sort_order ASC');
        res.json({ success: true, groups: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/inbox-groups - Bulk save group definitions (upsert + delete missing)
app.put('/api/realtime/inbox-groups', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { groups } = req.body;
        if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups array required' });

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            // Get current group IDs
            const incomingIds = groups.map(g => g.id).filter(Boolean);

            // Delete groups not in the new list
            if (incomingIds.length > 0) {
                await client.query(
                    `DELETE FROM inbox_groups WHERE id NOT IN (${incomingIds.map((_, i) => `$${i + 1}`).join(',')})`,
                    incomingIds
                );
            } else {
                await client.query('DELETE FROM inbox_groups');
            }

            // Upsert each group
            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (!g.id || !g.name) continue;
                await client.query(`
                    INSERT INTO inbox_groups (id, name, color, note, sort_order, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        color = EXCLUDED.color,
                        note = EXCLUDED.note,
                        sort_order = EXCLUDED.sort_order,
                        updated_at = NOW()
                `, [g.id, g.name, g.color || '#3b82f6', g.note || '', g.sort_order ?? i]);
            }

            await client.query('COMMIT');
            console.log(`[API] Saved ${groups.length} inbox groups`);
            res.json({ success: true, count: groups.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error saving inbox groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// WEBSOCKET SERVER FOR FRONTEND CLIENTS
// =====================================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast to all connected frontend clients
const broadcastToClients = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Keep-alive ping for frontend clients
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    console.log('[WSS] Frontend client connected. Total:', wss.clients.size);
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('close', () => {
        console.log('[WSS] Frontend client disconnected. Total:', wss.clients.size);
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

// =====================================================
// 404 & ERROR HANDLERS
// =====================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.url });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
    // Initialize database first
    await initDatabase();

    // Start HTTP server
    server.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log('🚀 N2Store Realtime Server v2.1');
        console.log('='.repeat(60));
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💾 Database: ${dbPool ? 'Connected' : 'Not configured'}`);
        console.log(`⏰ Started: ${new Date().toISOString()}`);
        console.log('='.repeat(60));

        // Auto-connect after 3 seconds (give DB time to init)
        setTimeout(() => {
            autoConnectClients();
        }, 3000);

        // Cleanup expired pending_customers on start and every hour
        setTimeout(() => {
            cleanupExpiredPendingCustomers();
        }, 5000);

        // Run cleanup every hour (3600000ms)
        setInterval(() => {
            cleanupExpiredPendingCustomers();
        }, 3600000);
    });
}

startServer();
