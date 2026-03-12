// =====================================================
// INDEXEDDB STORAGE UTILITY
// Universal IndexedDB wrapper for large data storage
// Replaces localStorage for items exceeding 5MB limit
// =====================================================

export class IndexedDBStorage {
    constructor(dbName = 'N2StoreDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.STORE_NAME = 'key_value_store';
        this.isReady = false;
        this.readyPromise = this.init();
    }

    async init() {
        try {
            this.db = await this.openDatabase();
            this.isReady = true;
            console.log(`[IndexedDB] Database "${this.dbName}" initialized`);
            return true;
        } catch (error) {
            console.error('[IndexedDB] Failed to initialize:', error);
            return false;
        }
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('[IndexedDB] Error opening database:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('[IndexedDB] Created object store:', this.STORE_NAME);
                }
            };
        });
    }

    async ensureReady() {
        if (!this.isReady) {
            await this.readyPromise;
        }
        if (!this.db) {
            throw new Error('IndexedDB not available');
        }
    }

    /**
     * Set item in IndexedDB (similar to localStorage.setItem)
     * @param {string} key - Storage key
     * @param {any} value - Value to store (will be JSON stringified if object)
     * @returns {Promise<boolean>}
     */
    async setItem(key, value) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);

                const data = {
                    key: key,
                    value: value,
                    timestamp: Date.now()
                };

                const request = store.put(data);

                request.onsuccess = () => {
                    console.log(`[IndexedDB] Saved: ${key}`);
                    resolve(true);
                };

                request.onerror = (event) => {
                    console.error(`[IndexedDB] Error saving ${key}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('[IndexedDB] Transaction error:', error);
                reject(error);
            }
        });
    }

    /**
     * Get item from IndexedDB (similar to localStorage.getItem)
     * @param {string} key - Storage key
     * @returns {Promise<any>} - Returns null if not found
     */
    async getItem(key) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(key);

                request.onsuccess = (event) => {
                    const result = event.target.result;
                    if (result) {
                        resolve(result.value);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = (event) => {
                    console.error(`[IndexedDB] Error reading ${key}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('[IndexedDB] Transaction error:', error);
                reject(error);
            }
        });
    }

    /**
     * Remove item from IndexedDB (similar to localStorage.removeItem)
     * @param {string} key - Storage key
     * @returns {Promise<boolean>}
     */
    async removeItem(key) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(key);

                request.onsuccess = () => {
                    console.log(`[IndexedDB] Removed: ${key}`);
                    resolve(true);
                };

                request.onerror = (event) => {
                    console.error(`[IndexedDB] Error removing ${key}:`, event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('[IndexedDB] Transaction error:', error);
                reject(error);
            }
        });
    }

    /**
     * Get all keys matching a pattern
     * @param {string} pattern - Key pattern (supports * wildcard)
     * @returns {Promise<string[]>}
     */
    async getKeys(pattern = '*') {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAllKeys();

                request.onsuccess = (event) => {
                    let keys = event.target.result;

                    // Filter by pattern if not wildcard
                    if (pattern !== '*') {
                        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                        keys = keys.filter(key => regex.test(key));
                    }

                    resolve(keys);
                };

                request.onerror = (event) => {
                    console.error('[IndexedDB] Error getting keys:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('[IndexedDB] Transaction error:', error);
                reject(error);
            }
        });
    }

    /**
     * Clear all items from the store
     * @returns {Promise<boolean>}
     */
    async clear() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('[IndexedDB] Cleared all data');
                    resolve(true);
                };

                request.onerror = (event) => {
                    console.error('[IndexedDB] Error clearing:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('[IndexedDB] Transaction error:', error);
                reject(error);
            }
        });
    }

    /**
     * Get storage statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const countRequest = store.count();
                const allRequest = store.getAll();

                let count = 0;

                countRequest.onsuccess = () => {
                    count = countRequest.result;
                };

                allRequest.onsuccess = () => {
                    const items = allRequest.result;
                    const totalSize = new Blob([JSON.stringify(items)]).size;

                    resolve({
                        itemCount: count,
                        totalSize: totalSize,
                        totalSizeFormatted: this.formatBytes(totalSize)
                    });
                };

                allRequest.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Migrate data from localStorage to IndexedDB
     * @param {string[]} keys - Array of localStorage keys to migrate
     * @returns {Promise<Object>} - Migration results
     */
    async migrateFromLocalStorage(keys) {
        const results = {
            success: [],
            failed: [],
            skipped: []
        };

        for (const key of keys) {
            try {
                const value = localStorage.getItem(key);

                if (value === null) {
                    results.skipped.push(key);
                    continue;
                }

                // Try to parse as JSON, otherwise store as string
                let parsedValue;
                try {
                    parsedValue = JSON.parse(value);
                } catch {
                    parsedValue = value;
                }

                await this.setItem(key, parsedValue);

                // Remove from localStorage after successful migration
                localStorage.removeItem(key);

                results.success.push(key);
                console.log(`[IndexedDB] Migrated: ${key}`);
            } catch (error) {
                console.error(`[IndexedDB] Failed to migrate ${key}:`, error);
                results.failed.push({ key, error: error.message });
            }
        }

        console.log('[IndexedDB] Migration complete:', results);
        return results;
    }
}

/**
 * Create a singleton instance for a given database
 * @param {string} dbName - Database name
 * @param {number} version - Database version
 * @returns {IndexedDBStorage}
 */
export function createIndexedDBStorage(dbName = 'N2StoreDB', version = 1) {
    return new IndexedDBStorage(dbName, version);
}

/**
 * Check if IndexedDB is supported
 * @returns {boolean}
 */
export function isIndexedDBSupported() {
    return typeof indexedDB !== 'undefined';
}

// Default export for convenience
export default IndexedDBStorage;
