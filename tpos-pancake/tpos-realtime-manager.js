// =====================================================
// TPOS REALTIME MANAGER - Browser-side WebSocket Client
// Connects to render.com server to receive TPOS events
// =====================================================

class TposRealtimeManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Server URLs - Use dedicated realtime server
        this.serverBaseUrl = 'https://n2store-realtime.onrender.com';
        this.wsUrl = 'wss://n2store-realtime.onrender.com';

        // Event callbacks
        this.onConversationUpdate = null;
        this.onConnectionChange = null;
    }

    /**
     * Initialize and auto-connect if realtime is enabled
     */
    async initialize() {
        console.log('[TPOS-REALTIME] Initializing...');

        // Check if TPOS realtime is enabled
        const isEnabled = localStorage.getItem('tpos_realtime_enabled') !== 'false';
        if (!isEnabled) {
            console.log('[TPOS-REALTIME] Disabled by user setting');
            return;
        }

        // Start the server-side WebSocket connection first
        await this.startServerConnection();

        // Then connect to receive events
        this.connectToServer();
    }

    /**
     * Start server-side WebSocket connection to TPOS
     */
    async startServerConnection() {
        try {
            // Get token from tposTokenManager
            if (!window.tposTokenManager) {
                console.error('[TPOS-REALTIME] tposTokenManager not available');
                return false;
            }

            const token = await window.tposTokenManager.getToken();
            if (!token) {
                console.error('[TPOS-REALTIME] No TPOS token available');
                return false;
            }

            // Get room from settings or use default
            const room = localStorage.getItem('tpos_realtime_room') || 'tomato.tpos.vn';

            console.log('[TPOS-REALTIME] Starting server connection for room:', room);

            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, room })
            });

            const data = await response.json();
            if (data.success) {
                console.log('[TPOS-REALTIME] Server connection started successfully');
                return true;
            } else {
                console.error('[TPOS-REALTIME] Server failed to start:', data.error);
                return false;
            }
        } catch (error) {
            console.error('[TPOS-REALTIME] Error starting server connection:', error);
            return false;
        }
    }

    /**
     * Connect to server WebSocket to receive events
     */
    connectToServer() {
        if (this.isConnected || this.isConnecting) {
            console.log('[TPOS-REALTIME] Already connected or connecting');
            return;
        }

        this.isConnecting = true;
        console.log('[TPOS-REALTIME] Connecting to proxy server:', this.wsUrl);

        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log('[TPOS-REALTIME] Connected to proxy server');
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;

                // Notify UI
                if (this.onConnectionChange) {
                    this.onConnectionChange(true);
                }

                // Dispatch event
                window.dispatchEvent(new CustomEvent('tposRealtimeConnected'));
            };

            this.ws.onclose = () => {
                console.log('[TPOS-REALTIME] Disconnected from proxy server');
                this.isConnected = false;
                this.isConnecting = false;

                // Notify UI
                if (this.onConnectionChange) {
                    this.onConnectionChange(false);
                }

                // Dispatch event
                window.dispatchEvent(new CustomEvent('tposRealtimeDisconnected'));

                // Auto reconnect with exponential backoff
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                    this.reconnectAttempts++;
                    console.log(`[TPOS-REALTIME] Reconnecting in ${delay / 1000}s...`);
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = setTimeout(() => this.connectToServer(), delay);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[TPOS-REALTIME] WebSocket error:', error);
                this.isConnecting = false;
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };
        } catch (error) {
            console.error('[TPOS-REALTIME] Connection error:', error);
            this.isConnecting = false;
        }
    }

    /**
     * Handle incoming messages from proxy server
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            // Handle different TPOS message types
            switch (message.type) {
                case 'tpos:event':
                    // Raw event from server
                    console.log('[TPOS-REALTIME] Raw event:', message.event);
                    break;

                case 'tpos:parsed-event':
                    // Parsed event with structured data
                    console.log('[TPOS-REALTIME] Parsed event:', message.eventType);
                    this.handleParsedEvent(message);
                    break;

                case 'tpos:new-order':
                    // New order notification
                    console.log('[TPOS-REALTIME] 🔥 NEW ORDER:', message.data?.Message);
                    this.handleNewOrder(message.data);
                    break;

                case 'tpos:order-update':
                    // Order status update
                    console.log('[TPOS-REALTIME] 📝 ORDER UPDATE:', message.data?.Id);
                    this.handleOrderUpdate(message.data);
                    break;

                default:
                    console.log('[TPOS-REALTIME] Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[TPOS-REALTIME] Error parsing message:', error);
        }
    }

    /**
     * Handle parsed TPOS event data
     * Format: { context: "Conversation", eventType: "SaleOnline_Order", data: {...} }
     */
    handleParsedEvent(message) {
        const { context, eventType, data } = message;

        if (!data) return;

        // Dispatch generic event
        window.dispatchEvent(new CustomEvent('tposParsedEvent', {
            detail: { context, eventType, data }
        }));

        // Handle based on context
        if (context === 'Conversation') {
            this.handleConversationEvent(eventType, data);
        }
    }

    /**
     * Handle conversation-related events
     */
    handleConversationEvent(eventType, data) {
        console.log('[TPOS-REALTIME] Conversation event:', eventType);

        // Build conversation object from TPOS data
        const conversation = {
            Id: data.Id || data.ConversationId,
            Message: data.Message,
            IsRead: data.IsRead,
            Customer: data.Customer,
            Product: data.Product,
            Type: eventType
        };

        // Dispatch event for UI to handle
        window.dispatchEvent(new CustomEvent('tposConversationUpdate', {
            detail: {
                conversation: conversation,
                eventType: eventType,
                rawData: data
            }
        }));

        // Call callback if set
        if (this.onConversationUpdate) {
            this.onConversationUpdate(conversation, data);
        }
    }

    /**
     * Handle new order event (SaleOnline_Order)
     */
    handleNewOrder(data) {
        if (!data) return;

        // Parse message: "Huyền Nhỏ: Áo đen 50kg..."
        const messageParts = (data.Message || '').split(':');
        const customerName = messageParts[0]?.trim() || 'Unknown';
        const orderContent = messageParts.slice(1).join(':').trim() || '';

        const orderInfo = {
            id: data.Id,
            conversationId: data.ConversationId,
            customerName: customerName,
            content: orderContent,
            fullMessage: data.Message,
            customer: data.Customer,
            product: data.Product,
            isRead: data.IsRead,
            timestamp: Date.now()
        };

        // Dispatch event
        window.dispatchEvent(new CustomEvent('tposNewOrder', {
            detail: orderInfo
        }));

        console.log('[TPOS-REALTIME] 🛒 Order processed:', {
            customer: customerName,
            content: orderContent.substring(0, 30) + '...'
        });
    }

    /**
     * Handle order update event (SaleOnline_Update)
     */
    handleOrderUpdate(data) {
        if (!data) return;

        // Dispatch event
        window.dispatchEvent(new CustomEvent('tposOrderUpdate', {
            detail: data
        }));
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        console.log('[TPOS-REALTIME] Disconnecting...');
        clearTimeout(this.reconnectTimer);

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
    }

    /**
     * Stop server-side connection
     */
    async stopServerConnection() {
        try {
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/stop`, {
                method: 'POST'
            });
            const data = await response.json();
            console.log('[TPOS-REALTIME] Server connection stopped:', data.message);
            return data.success;
        } catch (error) {
            console.error('[TPOS-REALTIME] Error stopping server connection:', error);
            return false;
        }
    }

    /**
     * Get connection status
     */
    async getStatus() {
        try {
            const response = await fetch(`${this.serverBaseUrl}/api/realtime/tpos/status`);
            return await response.json();
        } catch (error) {
            console.error('[TPOS-REALTIME] Error getting status:', error);
            return { connected: false, error: error.message };
        }
    }

    /**
     * Manual reconnect
     */
    async reconnect() {
        console.log('[TPOS-REALTIME] Manual reconnect requested');
        this.disconnect();
        this.reconnectAttempts = 0;
        await this.startServerConnection();
        this.connectToServer();
    }
}

// Create global instance
window.tposRealtimeManager = new TposRealtimeManager();
console.log('[TPOS-REALTIME] TposRealtimeManager loaded');
