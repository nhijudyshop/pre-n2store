// =====================================================
// BASE STORE - Firebase as Source of Truth + Real-time Listener
// Script-tag compatible (IIFE pattern)
//
// Cung cấp base class cho pattern quản lý state:
// - Load từ Firestore (source of truth)
// - Fallback sang localStorage khi offline
// - Real-time listener cho sync across devices
// - Auto-cleanup entries cũ
// - Subscriber pattern cho UI updates
//
// Dependencies (global):
//   - firebase (Firebase SDK — firebase.firestore())
//
// Usage:
//   <script src="../shared/js/base-store.js"></script>
//   <script>
//     const store = new BaseStore({
//       collectionPath: 'invoice_status_v2',
//       localStorageKey: 'invoiceStatusStore_v2',
//       maxLocalAge: 14 * 24 * 60 * 60 * 1000 // 14 days
//     });
//     await store.load();
//     store.subscribe(function(data) { console.log('Data changed:', data); });
//   </script>
// =====================================================

(function () {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================

    var DEFAULT_MAX_LOCAL_AGE = 24 * 60 * 60 * 1000; // 24 hours
    var RECONNECT_BASE_DELAY = 1000; // 1 second
    var RECONNECT_MAX_DELAY = 30000; // 30 seconds
    var MAX_RECONNECT_ATTEMPTS = 10;
    var LOCAL_STORAGE_VERSION = 1;

    // =====================================================
    // BaseStore CLASS
    // =====================================================

    /**
     * BaseStore - Base class for Firebase-backed stores with localStorage fallback.
     *
     * @param {Object} options - Configuration options
     * @param {string} options.collectionPath - Firestore collection path
     * @param {string} options.localStorageKey - localStorage key for caching
     * @param {number} [options.maxLocalAge] - Max age in ms for local entries (default: 24h)
     */
    function BaseStore(options) {
        if (!options || !options.collectionPath || !options.localStorageKey) {
            throw new Error('[BaseStore] collectionPath and localStorageKey are required');
        }

        this.collectionPath = options.collectionPath;
        this.localStorageKey = options.localStorageKey;
        this.maxLocalAge = options.maxLocalAge || DEFAULT_MAX_LOCAL_AGE;

        // Internal state
        this._data = new Map();
        this._initialized = false;
        this._unsubscribe = null;
        this._subscribers = [];
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._destroyed = false;
    }

    // =====================================================
    // PUBLIC METHODS
    // =====================================================

    /**
     * Load data from Firestore (source of truth), fallback to localStorage.
     * Notifies subscribers after loading.
     *
     * @returns {Promise<boolean>} true if loaded successfully from Firestore
     */
    BaseStore.prototype.load = async function load() {
        if (this._destroyed) return false;

        try {
            // 1. Try Firestore first (source of truth)
            var loadedFromFirestore = await this._loadFromFirestore();

            // 2. Fallback to localStorage if Firestore fails
            if (!loadedFromFirestore) {
                this._loadFromLocal();
                console.log('[BaseStore:' + this.collectionPath + '] Offline mode — loaded ' + this._data.size + ' entries from localStorage');
            }

            // 3. Cleanup old entries
            this._cleanupOldEntries();

            this._initialized = true;
            console.log('[BaseStore:' + this.collectionPath + '] Initialized with ' + this._data.size + ' entries');

            // 4. Notify subscribers
            this._notifySubscribers();

            return loadedFromFirestore;
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] Error during load:', e);

            // Attempt localStorage fallback on any error
            try {
                this._loadFromLocal();
            } catch (localErr) {
                console.error('[BaseStore:' + this.collectionPath + '] localStorage fallback also failed:', localErr);
            }

            this._initialized = true;
            this._notifySubscribers();
            return false;
        }
    };

    /**
     * Setup Firestore real-time listener for cross-device sync.
     * Auto-reconnects on listener errors with exponential backoff.
     */
    BaseStore.prototype.setupRealtimeListener = function setupRealtimeListener() {
        if (this._destroyed) return;

        // Don't setup if already listening
        if (this._unsubscribe) {
            console.log('[BaseStore:' + this.collectionPath + '] Real-time listener already active');
            return;
        }

        var self = this;
        this._reconnectAttempts = 0;

        try {
            var db = this._getFirestore();
            if (!db) {
                console.warn('[BaseStore:' + this.collectionPath + '] Firestore not available, skipping real-time listener');
                return;
            }

            this._unsubscribe = db.collection(this.collectionPath)
                .onSnapshot(function (snapshot) {
                    self._reconnectAttempts = 0; // Reset on success
                    self._handleSnapshot(snapshot);
                }, function (error) {
                    console.error('[BaseStore:' + self.collectionPath + '] Real-time listener error:', error);
                    self._unsubscribe = null;
                    self._attemptReconnect();
                });

            console.log('[BaseStore:' + this.collectionPath + '] Real-time listener active');
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] Failed to setup real-time listener:', e);
            this._attemptReconnect();
        }
    };

    /**
     * Subscribe to data changes. Callback receives the current data Map.
     *
     * @param {Function} callback - Called with (data: Map) when data changes
     * @returns {Function} Unsubscribe function
     */
    BaseStore.prototype.subscribe = function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('[BaseStore] subscribe callback must be a function');
        }

        this._subscribers.push(callback);

        // Immediately call with current data if already initialized
        if (this._initialized) {
            try {
                callback(this._data);
            } catch (e) {
                console.error('[BaseStore:' + this.collectionPath + '] Subscriber callback error:', e);
            }
        }

        var self = this;
        return function unsubscribe() {
            var index = self._subscribers.indexOf(callback);
            if (index !== -1) {
                self._subscribers.splice(index, 1);
            }
        };
    };

    /**
     * Get current data as a Map.
     * @returns {Map} Current data
     */
    BaseStore.prototype.getData = function getData() {
        return this._data;
    };

    /**
     * Get a single entry by key.
     * @param {string} key
     * @returns {*} Entry value or undefined
     */
    BaseStore.prototype.get = function get(key) {
        return this._data.get(key);
    };

    /**
     * Check if store has been initialized.
     * @returns {boolean}
     */
    BaseStore.prototype.isInitialized = function isInitialized() {
        return this._initialized;
    };

    /**
     * Cleanup: unsubscribe listener, clear timers, remove subscribers.
     */
    BaseStore.prototype.destroy = function destroy() {
        this._destroyed = true;

        // Unsubscribe Firestore listener
        if (this._unsubscribe) {
            try {
                this._unsubscribe();
            } catch (e) {
                console.error('[BaseStore:' + this.collectionPath + '] Error unsubscribing:', e);
            }
            this._unsubscribe = null;
        }

        // Clear reconnect timer
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }

        // Clear subscribers
        this._subscribers = [];

        console.log('[BaseStore:' + this.collectionPath + '] Destroyed');
    };

    // =====================================================
    // INTERNAL: FIRESTORE
    // =====================================================

    /**
     * Get Firestore instance.
     * @returns {firebase.firestore.Firestore|null}
     */
    BaseStore.prototype._getFirestore = function _getFirestore() {
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                return firebase.firestore();
            }
            if (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) {
                return window.firebase.firestore();
            }
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] Cannot get Firestore instance:', e);
        }
        return null;
    };

    /**
     * Load all documents from Firestore collection.
     * Firestore is source of truth — replaces local data entirely.
     *
     * @returns {Promise<boolean>} true if loaded successfully
     */
    BaseStore.prototype._loadFromFirestore = async function _loadFromFirestore() {
        var db = this._getFirestore();
        if (!db) return false;

        try {
            var snapshot = await db.collection(this.collectionPath).get();

            // Clear local data — Firestore is source of truth
            this._data.clear();

            var self = this;
            snapshot.forEach(function (doc) {
                var docData = doc.data();
                // Store each document's data keyed by document ID
                self._data.set(doc.id, docData);
            });

            // Cache to localStorage
            this._saveToLocal();

            console.log('[BaseStore:' + this.collectionPath + '] Loaded ' + this._data.size + ' entries from Firestore');
            return true;
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] Firestore load error:', e);
            return false;
        }
    };

    /**
     * Handle Firestore snapshot from real-time listener.
     * Firestore always wins on conflict.
     *
     * @param {firebase.firestore.QuerySnapshot} snapshot
     */
    BaseStore.prototype._handleSnapshot = function _handleSnapshot(snapshot) {
        if (this._destroyed) return;

        var hasChanges = false;
        var self = this;

        // Build set of all current doc IDs from server
        var serverDocIds = new Set();
        snapshot.docs.forEach(function (doc) {
            serverDocIds.add(doc.id);
        });

        // Remove entries not in server (deleted remotely)
        this._data.forEach(function (value, key) {
            if (!serverDocIds.has(key)) {
                self._data.delete(key);
                hasChanges = true;
            }
        });

        // Process changes — Firestore always wins
        snapshot.docChanges().forEach(function (change) {
            var doc = change.doc;

            if (change.type === 'added' || change.type === 'modified') {
                self._data.set(doc.id, doc.data());
                hasChanges = true;
            } else if (change.type === 'removed') {
                self._data.delete(doc.id);
                hasChanges = true;
            }
        });

        if (hasChanges) {
            this._saveToLocal();
            this._notifySubscribers();
        }
    };

    // =====================================================
    // INTERNAL: LOCAL STORAGE
    // =====================================================

    /**
     * Save current data to localStorage as cache.
     */
    BaseStore.prototype._saveToLocal = function _saveToLocal() {
        try {
            var serialized = JSON.stringify({
                data: Array.from(this._data.entries()),
                timestamp: Date.now(),
                version: LOCAL_STORAGE_VERSION
            });
            localStorage.setItem(this.localStorageKey, serialized);
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] localStorage save error:', e);

            // If quota exceeded, cleanup and retry
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                this._cleanupOldEntries();
                try {
                    var serialized = JSON.stringify({
                        data: Array.from(this._data.entries()),
                        timestamp: Date.now(),
                        version: LOCAL_STORAGE_VERSION
                    });
                    localStorage.setItem(this.localStorageKey, serialized);
                } catch (retryErr) {
                    console.error('[BaseStore:' + this.collectionPath + '] localStorage save failed even after cleanup:', retryErr);
                }
            }
        }
    };

    /**
     * Load data from localStorage (fallback when Firestore unavailable).
     * Validates data integrity — fetches fresh on corruption.
     */
    BaseStore.prototype._loadFromLocal = function _loadFromLocal() {
        try {
            var raw = localStorage.getItem(this.localStorageKey);
            if (!raw) return;

            var parsed = JSON.parse(raw);

            // Validate structure
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Invalid cache structure');
            }

            // Check version compatibility
            if (parsed.version && parsed.version !== LOCAL_STORAGE_VERSION) {
                console.warn('[BaseStore:' + this.collectionPath + '] Cache version mismatch, discarding');
                localStorage.removeItem(this.localStorageKey);
                return;
            }

            // Load data
            if (Array.isArray(parsed.data)) {
                this._data = new Map(parsed.data);
            } else if (parsed.data && typeof parsed.data === 'object') {
                this._data = new Map(Object.entries(parsed.data));
            }
        } catch (e) {
            console.error('[BaseStore:' + this.collectionPath + '] localStorage load error (data corruption?):', e);
            // Clear corrupted data
            try {
                localStorage.removeItem(this.localStorageKey);
            } catch (removeErr) {
                // Ignore
            }
            // Data will be fetched fresh from Firestore on next load()
        }
    };

    /**
     * Cleanup entries older than maxLocalAge from the data Map.
     * Entries must have a `timestamp` field to be eligible for cleanup.
     */
    BaseStore.prototype._cleanupOldEntries = function _cleanupOldEntries() {
        var now = Date.now();
        var maxAge = this.maxLocalAge;
        var removedCount = 0;
        var self = this;

        this._data.forEach(function (value, key) {
            // Check entry-level timestamp
            var entryTimestamp = null;
            if (value && typeof value === 'object' && value.timestamp) {
                entryTimestamp = value.timestamp;
            } else if (value && typeof value === 'object' && value.lastUpdated) {
                entryTimestamp = value.lastUpdated;
            }

            if (entryTimestamp && (now - entryTimestamp) > maxAge) {
                self._data.delete(key);
                removedCount++;
            }
        });

        if (removedCount > 0) {
            console.log('[BaseStore:' + this.collectionPath + '] Cleaned up ' + removedCount + ' old entries');
            this._saveToLocal();
        }
    };

    // =====================================================
    // INTERNAL: RECONNECT
    // =====================================================

    /**
     * Attempt to reconnect the real-time listener with exponential backoff.
     */
    BaseStore.prototype._attemptReconnect = function _attemptReconnect() {
        if (this._destroyed) return;

        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('[BaseStore:' + this.collectionPath + '] Max reconnect attempts reached (' + MAX_RECONNECT_ATTEMPTS + ')');
            return;
        }

        this._reconnectAttempts++;
        var delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this._reconnectAttempts - 1),
            RECONNECT_MAX_DELAY
        );

        console.log('[BaseStore:' + this.collectionPath + '] Reconnecting in ' + delay + 'ms (attempt ' + this._reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')');

        var self = this;
        this._reconnectTimer = setTimeout(function () {
            self._reconnectTimer = null;
            self.setupRealtimeListener();
        }, delay);
    };

    // =====================================================
    // INTERNAL: SUBSCRIBERS
    // =====================================================

    /**
     * Notify all subscribers with current data.
     */
    BaseStore.prototype._notifySubscribers = function _notifySubscribers() {
        var data = this._data;
        this._subscribers.forEach(function (callback) {
            try {
                callback(data);
            } catch (e) {
                console.error('[BaseStore] Subscriber callback error:', e);
            }
        });
    };

    // =====================================================
    // STATIC: resolveConflict
    // =====================================================

    /**
     * Resolve conflict between Firestore and local data.
     * Firestore always wins (source of truth).
     *
     * @param {*} firestoreData - Data from Firestore
     * @param {*} localData - Data from localStorage
     * @returns {*} Resolved data (always firestoreData)
     */
    BaseStore.resolveConflict = function resolveConflict(firestoreData, localData) {
        return firestoreData;
    };

    // =====================================================
    // EXPORT
    // =====================================================

    // Export to window for script-tag usage
    if (typeof window !== 'undefined') {
        window.BaseStore = BaseStore;
    }

    // Support CommonJS/Node.js for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BaseStore;
    }

})();
