/**
 * =====================================================
 * REALTIME CLIENT - Firebase Replacement
 * =====================================================
 *
 * Thay thế Firebase Realtime Database bằng REST API + SSE
 * Sử dụng PostgreSQL (trên Render) cho storage
 * Sử dụng Server-Sent Events (SSE) cho realtime updates
 *
 * Migration Map:
 * - firebase.database().ref(key).once('value') → realtimeClient.get(key)
 * - firebase.database().ref(key).set(value) → realtimeClient.set(key, value)
 * - firebase.database().ref(key).remove() → realtimeClient.remove(key)
 * - firebase.database().ref(key).on('value', cb) → realtimeClient.on(key, cb)
 * - firebase.database().ref(key).off('value', cb) → realtimeClient.off(key, cb)
 *
 * Usage:
 * ```javascript
 * // Initialize and connect
 * const client = new RealtimeClient();
 * client.connect(['held_products', 'kpi_base', 'tpos_token']);
 *
 * // Read once
 * const token = await client.get('tpos_token');
 *
 * // Listen to changes
 * client.on('held_products/ORDER123', (data) => {
 *     console.log('Held products updated:', data);
 * });
 *
 * // Write data
 * await client.set('settings/display', { darkMode: true });
 *
 * // Delete data
 * await client.remove('old_data');
 * ```
 */

class RealtimeClient {
    /**
     * @param {string} baseUrl - Base URL for API (default: current origin)
     */
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || window.location.origin;
        this.eventSource = null;
        this.listeners = new Map(); // key -> Set of callbacks
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
        this.subscribedKeys = [];

        console.log('[RealtimeClient] Initialized with base URL:', this.baseUrl);
    }

    // =====================================================
    // CONNECTION MANAGEMENT
    // =====================================================

    /**
     * Connect to SSE and subscribe to keys
     * Thay thế: firebase.database().ref(key).on('value', callback)
     *
     * @param {string|string[]} keys - Single key or array of keys to subscribe to
     */
    connect(keys) {
        // Convert to array if single key
        this.subscribedKeys = Array.isArray(keys) ? keys : [keys];

        if (this.subscribedKeys.length === 0) {
            console.warn('[RealtimeClient] No keys specified for subscription');
            return;
        }

        // Close existing connection if any
        if (this.eventSource) {
            this.eventSource.close();
        }

        const keysParam = this.subscribedKeys.join(',');
        const url = `${this.baseUrl}/api/realtime/sse?keys=${encodeURIComponent(keysParam)}`;

        console.log('[RealtimeClient] Connecting to SSE:', url);
        console.log('[RealtimeClient] Subscribed keys:', this.subscribedKeys);

        this.eventSource = new EventSource(url);

        // Connection opened
        this.eventSource.onopen = () => {
            console.log('[RealtimeClient] SSE connection opened');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        };

        // Connected event
        this.eventSource.addEventListener('connected', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[RealtimeClient] Connected to SSE server:', data);
                this.isConnected = true;
            } catch (e) {
                console.error('[RealtimeClient] Error parsing connected event:', e);
            }
        });

        // Update event
        this.eventSource.addEventListener('update', (event) => {
            try {
                const { key, data } = JSON.parse(event.data);
                console.log('[RealtimeClient] Received update:', key);
                this._notifyListeners(key, data);
            } catch (e) {
                console.error('[RealtimeClient] Error parsing update event:', e);
            }
        });

        // Deleted event
        this.eventSource.addEventListener('deleted', (event) => {
            try {
                const { key } = JSON.parse(event.data);
                console.log('[RealtimeClient] Received deletion:', key);
                this._notifyListeners(key, null);
            } catch (e) {
                console.error('[RealtimeClient] Error parsing deleted event:', e);
            }
        });

        // Created event
        this.eventSource.addEventListener('created', (event) => {
            try {
                const { key, data } = JSON.parse(event.data);
                console.log('[RealtimeClient] Received creation:', key);
                this._notifyListeners(key, data);
            } catch (e) {
                console.error('[RealtimeClient] Error parsing created event:', e);
            }
        });

        // Error handling
        this.eventSource.onerror = (error) => {
            console.error('[RealtimeClient] SSE error:', error);
            this.isConnected = false;

            // EventSource will auto-reconnect, but we track attempts
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[RealtimeClient] Max reconnect attempts reached. Stopping.');
                this.disconnect();
            } else {
                console.log(`[RealtimeClient] Will auto-reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            }
        };
    }

    /**
     * Disconnect SSE connection
     */
    disconnect() {
        if (this.eventSource) {
            console.log('[RealtimeClient] Disconnecting SSE');
            this.eventSource.close();
            this.eventSource = null;
            this.isConnected = false;
        }
    }

    /**
     * Reconnect to SSE with current subscribed keys
     */
    reconnect() {
        console.log('[RealtimeClient] Reconnecting...');
        this.disconnect();
        this.connect(this.subscribedKeys);
    }

    // =====================================================
    // LISTENERS (REALTIME)
    // =====================================================

    /**
     * Subscribe to changes on a key
     * Thay thế: firebase.database().ref(key).on('value', callback)
     *
     * @param {string} key - Key to watch
     * @param {Function} callback - Callback(data) when data changes
     * @returns {Function} Unsubscribe function
     */
    on(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);

        console.log(`[RealtimeClient] Added listener for key: ${key}`);

        // Return unsubscribe function
        return () => this.off(key, callback);
    }

    /**
     * Unsubscribe from changes
     * Thay thế: firebase.database().ref(key).off('value', callback)
     *
     * @param {string} key - Key to stop watching
     * @param {Function} callback - Specific callback to remove (optional)
     */
    off(key, callback) {
        if (!this.listeners.has(key)) return;

        if (callback) {
            // Remove specific callback
            const callbacks = this.listeners.get(key);
            callbacks.delete(callback);

            if (callbacks.size === 0) {
                this.listeners.delete(key);
            }

            console.log(`[RealtimeClient] Removed listener for key: ${key}`);
        } else {
            // Remove all callbacks for this key
            this.listeners.delete(key);
            console.log(`[RealtimeClient] Removed all listeners for key: ${key}`);
        }
    }

    /**
     * Internal: Notify all listeners for a key
     * @private
     */
    _notifyListeners(key, data) {
        // Exact match
        const callbacks = this.listeners.get(key);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(data, key);
                } catch (e) {
                    console.error('[RealtimeClient] Error in listener callback:', e);
                }
            });
        }

        // Prefix match (for nested paths like held_products/ORDER123)
        // If update is "held_products/ORDER123", notify listeners for "held_products"
        // If update is "held_products", notify listeners for "held_products/ORDER123"
        this.listeners.forEach((cbs, listenerKey) => {
            if (key !== listenerKey) {
                if (key.startsWith(listenerKey + '/') || listenerKey.startsWith(key + '/')) {
                    cbs.forEach(cb => {
                        try {
                            cb(data, key);
                        } catch (e) {
                            console.error('[RealtimeClient] Error in wildcard listener callback:', e);
                        }
                    });
                }
            }
        });
    }

    // =====================================================
    // KEY-VALUE OPERATIONS
    // =====================================================

    /**
     * Get value once (no realtime)
     * Thay thế: firebase.database().ref(key).once('value')
     *
     * @param {string} key - Key to get
     * @returns {Promise<any>} Value or null if not exists
     */
    async get(key) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`);
            const result = await response.json();

            if (!result.exists) {
                return null;
            }

            return result.value;
        } catch (error) {
            console.error('[RealtimeClient] GET error:', error);
            throw error;
        }
    }

    /**
     * Set value
     * Thay thế: firebase.database().ref(key).set(value)
     *
     * @param {string} key - Key to set
     * @param {any} value - Value to set (will be JSON stringified)
     * @returns {Promise<Object>} Response object
     */
    async set(key, value) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] SET error:', error);
            throw error;
        }
    }

    /**
     * Delete value
     * Thay thế: firebase.database().ref(key).remove()
     *
     * @param {string} key - Key to delete
     * @returns {Promise<Object>} Response object
     */
    async remove(key) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] REMOVE error:', error);
            throw error;
        }
    }

    // =====================================================
    // HELD PRODUCTS OPERATIONS
    // =====================================================

    /**
     * Get held products for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Held products object
     */
    async getHeldProducts(orderId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/held-products/${encodeURIComponent(orderId)}`);
            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] GET held products error:', error);
            throw error;
        }
    }

    /**
     * Set held product
     * @param {string} orderId - Order ID
     * @param {string} productId - Product ID
     * @param {string} userId - User ID
     * @param {Object} data - Product data
     * @returns {Promise<Object>} Response object
     */
    async setHeldProduct(orderId, productId, userId, data) {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/realtime/held-products/${encodeURIComponent(orderId)}/${encodeURIComponent(productId)}/${encodeURIComponent(userId)}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] SET held product error:', error);
            throw error;
        }
    }

    /**
     * Remove held product
     * @param {string} orderId - Order ID
     * @param {string} productId - Product ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Response object
     */
    async removeHeldProduct(orderId, productId, userId) {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/realtime/held-products/${encodeURIComponent(orderId)}/${encodeURIComponent(productId)}/${encodeURIComponent(userId)}`,
                {
                    method: 'DELETE'
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] REMOVE held product error:', error);
            throw error;
        }
    }

    // =====================================================
    // KPI OPERATIONS
    // =====================================================

    /**
     * Get KPI base for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} KPI base data or null
     */
    async getKpiBase(orderId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/kpi-base/${encodeURIComponent(orderId)}`);
            const result = await response.json();
            return result.exists ? result.data : null;
        } catch (error) {
            console.error('[RealtimeClient] GET KPI base error:', error);
            throw error;
        }
    }

    /**
     * Set KPI base for an order
     * @param {string} orderId - Order ID
     * @param {Object} data - KPI base data
     * @returns {Promise<Object>} Response object
     */
    async setKpiBase(orderId, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/kpi-base/${encodeURIComponent(orderId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] SET KPI base error:', error);
            throw error;
        }
    }

    /**
     * Get KPI statistics
     * @param {string} userId - User ID
     * @param {string} date - Date (YYYY-MM-DD)
     * @param {string} campaignName - Campaign name (optional)
     * @returns {Promise<Array>} Statistics array
     */
    async getKpiStatistics(userId, date, campaignName = null) {
        try {
            let url = `${this.baseUrl}/api/realtime/kpi-statistics/${encodeURIComponent(userId)}/${encodeURIComponent(date)}`;
            if (campaignName) {
                url += `?campaignName=${encodeURIComponent(campaignName)}`;
            }

            const response = await fetch(url);
            const result = await response.json();
            return result.statistics || [];
        } catch (error) {
            console.error('[RealtimeClient] GET KPI statistics error:', error);
            throw error;
        }
    }

    /**
     * Update KPI statistics
     * @param {string} userId - User ID
     * @param {string} date - Date (YYYY-MM-DD)
     * @param {Object} data - Statistics data
     * @returns {Promise<Object>} Response object
     */
    async updateKpiStatistics(userId, date, data) {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/realtime/kpi-statistics/${encodeURIComponent(userId)}/${encodeURIComponent(date)}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] UPDATE KPI statistics error:', error);
            throw error;
        }
    }

    // =====================================================
    // TAG UPDATES OPERATIONS
    // =====================================================

    /**
     * Get latest tag update for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Tag update data or null
     */
    async getTagUpdate(orderId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/tag-updates/${encodeURIComponent(orderId)}`);
            const result = await response.json();
            return result.exists ? result.data : null;
        } catch (error) {
            console.error('[RealtimeClient] GET tag update error:', error);
            throw error;
        }
    }

    /**
     * Update tags for an order
     * @param {string} orderId - Order ID
     * @param {Object} data - { orderCode, stt, tags, updatedBy }
     * @returns {Promise<Object>} Response object
     */
    async updateTags(orderId, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/tag-updates/${encodeURIComponent(orderId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] UPDATE tags error:', error);
            throw error;
        }
    }

    /**
     * Listen to tag updates
     * @param {Function} callback - Callback(data) when tags updated
     * @returns {Function} Unsubscribe function
     */
    onTagUpdate(callback) {
        return this.on('tag_updates', callback);
    }

    // =====================================================
    // DROPPED PRODUCTS OPERATIONS
    // =====================================================

    /**
     * Get all dropped products (optionally filtered by user)
     * @param {string} userId - User ID (optional)
     * @returns {Promise<Object>} Dropped products object
     */
    async getDroppedProducts(userId = null) {
        try {
            let url = `${this.baseUrl}/api/realtime/dropped-products`;
            if (userId) {
                url += `?userId=${encodeURIComponent(userId)}`;
            }

            const response = await fetch(url);
            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] GET dropped products error:', error);
            throw error;
        }
    }

    /**
     * Add or update a dropped product
     * @param {string} id - Firebase-style ID (e.g., "-OhNkGnH6dnGuTpLhHsX")
     * @param {Object} data - { productCode, productName, size, quantity, userId, userName, orderId, isDraft }
     * @returns {Promise<Object>} Response object
     */
    async setDroppedProduct(id, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/dropped-products/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] SET dropped product error:', error);
            throw error;
        }
    }

    /**
     * Remove a dropped product
     * @param {string} id - Product ID
     * @returns {Promise<Object>} Response object
     */
    async removeDroppedProduct(id) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/dropped-products/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] REMOVE dropped product error:', error);
            throw error;
        }
    }

    /**
     * Listen to dropped products updates
     * @param {Function} callback - Callback(data) when products updated
     * @returns {Function} Unsubscribe function
     */
    onDroppedProducts(callback) {
        return this.on('dropped_products', callback);
    }

    // =====================================================
    // NOTE SNAPSHOTS OPERATIONS
    // =====================================================

    /**
     * Get note snapshot for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Note snapshot data or null
     */
    async getNoteSnapshot(orderId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/note-snapshots/${encodeURIComponent(orderId)}`);
            const result = await response.json();
            return result.exists ? result.data : null;
        } catch (error) {
            console.error('[RealtimeClient] GET note snapshot error:', error);
            throw error;
        }
    }

    /**
     * Save note snapshot (auto-expire after 7 days)
     * @param {string} orderId - Order ID
     * @param {Object} data - { noteText, encodedProducts, snapshotHash }
     * @returns {Promise<Object>} Response object
     */
    async saveNoteSnapshot(orderId, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/note-snapshots/${encodeURIComponent(orderId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] SAVE note snapshot error:', error);
            throw error;
        }
    }

    /**
     * Cleanup expired note snapshots
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupNoteSnapshots() {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/note-snapshots/cleanup`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] CLEANUP note snapshots error:', error);
            throw error;
        }
    }

    // =====================================================
    // UTILITY
    // =====================================================

    /**
     * Get connection status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            connected: this.isConnected,
            subscribedKeys: this.subscribedKeys,
            activeListeners: this.listeners.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Get SSE server statistics
     * @returns {Promise<Object>} Server stats
     */
    async getServerStats() {
        try {
            const response = await fetch(`${this.baseUrl}/api/realtime/sse/stats`);
            return response.json();
        } catch (error) {
            console.error('[RealtimeClient] GET server stats error:', error);
            throw error;
        }
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================

// Create global instance for easy access
if (typeof window !== 'undefined') {
    window.RealtimeClient = RealtimeClient;
    window.realtimeClient = new RealtimeClient();
    console.log('[RealtimeClient] Global instance created: window.realtimeClient');
}
