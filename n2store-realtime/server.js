// =====================================================
// N2STORE REALTIME SERVER
// WebSocket proxy for Pancake.vn and TPOS ChatOmni
// Deployed on Render.com (Standard Plan)
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

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

    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
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
            console.log('[PANCAKE-WS] Connected');
            this.isConnected = true;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[PANCAKE-WS] Closed', code, reason?.toString());
            this.isConnected = false;
            this.stopHeartbeat();

            // Reconnect
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error('[PANCAKE-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[PANCAKE-WS] Parse error:', e);
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
        console.log('[PANCAKE-WS] Joining users channel...');

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
        console.log('[PANCAKE-WS] Joining multiple_pages channel...');

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

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log('[PANCAKE-WS] New Message:', conversation?.id);

            // Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });
        } else if (event === 'order:tags_updated') {
            console.log('[PANCAKE-WS] Tags Updated:', payload);
            broadcastToClients({
                type: 'order:tags_updated',
                payload: payload
            });
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
        this.token = null;
        console.log('[PANCAKE-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            hasToken: !!this.token,
            userId: this.userId,
            pageCount: this.pageIds?.length || 0
        };
    }
}

// =====================================================
// TPOS REALTIME CLIENT (Socket.IO Protocol)
// =====================================================

class TposRealtimeClient {
    constructor() {
        this.ws = null;
        this.url = "wss://ws.chatomni.tpos.app/socket.io/?EIO=4&transport=websocket";
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.pingInterval = 25000;
        this.pingTimeout = 20000;
        this.lastPingTime = null;
        this.lastPongTime = null;

        this.token = null;
        this.room = 'tomato.tpos.vn';
    }

    start(token, room = 'tomato.tpos.vn') {
        this.token = token;
        this.room = room;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[TPOS-WS] Connecting... (attempt', this.reconnectAttempts + 1, ')');

        const urlWithToken = `${this.url}&token=${encodeURIComponent(this.token)}`;

        const headers = {
            'Origin': 'https://nhijudyshop.github.io',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8'
        };

        this.ws = new WebSocket(urlWithToken, { headers });

        this.ws.on('open', () => {
            console.log('[TPOS-WS] WebSocket connected, sending handshake...');
            this.reconnectAttempts = 0;
            const namespaceMsg = '40/chatomni,';
            this.ws.send(namespaceMsg);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[TPOS-WS] Closed - Code: ${code}`);
            this.isConnected = false;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(`[TPOS-WS] Reconnecting in ${delay/1000}s...`);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[TPOS-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });
    }

    handleMessage(data) {
        if (data === '2') {
            // Only send pong if WebSocket is open
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('3');
            }
            this.lastPongTime = Date.now();
            return;
        }

        if (data === '3') {
            this.lastPongTime = Date.now();
            return;
        }

        if (data.startsWith('0{')) {
            try {
                const info = JSON.parse(data.substring(1));
                if (info.pingInterval) this.pingInterval = info.pingInterval;
                if (info.pingTimeout) this.pingTimeout = info.pingTimeout;
                console.log(`[TPOS-WS] Server timing: pingInterval=${this.pingInterval}ms`);
            } catch (e) {}
            return;
        }

        if (data.startsWith('40/chatomni,')) {
            console.log('[TPOS-WS] Namespace connected');
            this.isConnected = true;
            this.joinRoom();
            this.startHeartbeat();
            return;
        }

        if (data.startsWith('42/chatomni,')) {
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
        console.log('[TPOS-WS] Event:', eventName);

        broadcastToClients({
            type: 'tpos:event',
            event: eventName,
            payload: payload
        });

        if (eventName === 'on-events') {
            try {
                const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
                console.log('[TPOS-WS] TPOS Event:', eventData.EventName || eventData.Type);
                broadcastToClients({
                    type: 'tpos:parsed-event',
                    data: eventData
                });
            } catch (e) {}
        }
    }

    joinRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(`42/chatomni,["join",{"room":"${this.room}","token":"${this.token}"}]`);
        console.log('[TPOS-WS] Joining room:', this.room);
    }

    startHeartbeat() {
        this.stopHeartbeat();
        const heartbeatMs = Math.floor(this.pingInterval * 0.8);
        console.log(`[TPOS-WS] Starting heartbeat every ${heartbeatMs}ms`);

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const timeSinceLastPong = Date.now() - (this.lastPongTime || 0);
                if (this.lastPongTime && timeSinceLastPong > this.pingTimeout) {
                    console.error(`[TPOS-WS] No pong for ${timeSinceLastPong}ms, reconnecting...`);
                    this.ws.close();
                    return;
                }
                this.ws.send('2');
                this.lastPingTime = Date.now();
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
            lastPongTime: this.lastPongTime
        };
    }
}

// =====================================================
// GLOBAL INSTANCES
// =====================================================

const realtimeClient = new RealtimeClient();
const tposRealtimeClient = new TposRealtimeClient();

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
        clients: {
            pancake: realtimeClient.getStatus(),
            tpos: tposRealtimeClient.getStatus()
        }
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Realtime Server',
        version: '1.0.0',
        description: 'WebSocket proxy for Pancake.vn and TPOS ChatOmni',
        endpoints: {
            pancake: [
                'POST /api/realtime/start - Start Pancake WebSocket',
                'POST /api/realtime/stop - Stop Pancake WebSocket',
                'GET /api/realtime/status - Get Pancake status'
            ],
            tpos: [
                'POST /api/realtime/tpos/start - Start TPOS WebSocket',
                'POST /api/realtime/tpos/stop - Stop TPOS WebSocket',
                'GET /api/realtime/tpos/status - Get TPOS status'
            ],
            health: [
                'GET /health - Server health check'
            ]
        }
    });
});

// ===== PANCAKE REALTIME =====

app.post('/api/realtime/start', (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters: token, userId, pageIds required' });
    }

    realtimeClient.start(token, userId, pageIds, cookie);
    res.json({ success: true, message: 'Pancake Realtime client started' });
});

app.post('/api/realtime/stop', (req, res) => {
    realtimeClient.stop();
    res.json({ success: true, message: 'Pancake Realtime client stopped' });
});

app.get('/api/realtime/status', (req, res) => {
    res.json(realtimeClient.getStatus());
});

// ===== TPOS REALTIME =====

app.post('/api/realtime/tpos/start', (req, res) => {
    const { token, room } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    tposRealtimeClient.start(token, room || 'tomato.tpos.vn');
    res.json({ success: true, message: 'TPOS Realtime client started' });
});

app.post('/api/realtime/tpos/stop', (req, res) => {
    tposRealtimeClient.stop();
    res.json({ success: true, message: 'TPOS Realtime client stopped' });
});

app.get('/api/realtime/tpos/status', (req, res) => {
    res.json(tposRealtimeClient.getStatus());
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

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('N2Store Realtime Server');
    console.log('='.repeat(50));
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
});
