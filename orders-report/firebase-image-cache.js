/**
 * Firebase Image Cache Manager
 * Manages cached product images uploaded to Pancake server
 * Structure: pancake_images/{sanitized_key} = { product_name, product_code, content_id, content_url?, product_id?, updated_at }
 * Key priority: productCode (best) > productName > productId
 * content_id is REQUIRED for Pancake API reuse, content_url is optional
 */

(function() {
    'use strict';

    class FirebaseImageCache {
        constructor() {
            this.cacheRef = null;
            this.isInitialized = false;
            this.initPromise = this.init();
        }

        /**
         * Initialize Firebase reference
         * @returns {Promise<boolean>}
         */
        async init() {
            try {
                // Check if Firebase is available
                if (typeof firebase === 'undefined' || !firebase.database) {
                    console.warn('[FIREBASE-CACHE] Firebase database not available');
                    this.isInitialized = false;
                    return false;
                }

                // Check if Firebase is initialized
                if (!firebase.apps || firebase.apps.length === 0) {
                    console.warn('[FIREBASE-CACHE] Firebase not initialized');
                    this.isInitialized = false;
                    return false;
                }

                this.cacheRef = firebase.database().ref('pancake_images');
                this.isInitialized = true;
                console.log('[FIREBASE-CACHE] ✅ Initialized successfully');
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Init error:', error);
                this.isInitialized = false;
                return false;
            }
        }

        /**
         * Sanitize string to be a valid Firebase key
         * Firebase keys cannot contain: . # $ / [ ]
         * @param {string} str - String to sanitize
         * @returns {string} - Sanitized string safe for Firebase key
         */
        sanitizeKey(str) {
            if (!str) return '';
            return String(str)
                .replace(/[.#$/\[\]]/g, '_')  // Replace forbidden chars with underscore
                .replace(/\s+/g, '_')          // Replace spaces with underscore
                .substring(0, 200);            // Limit length
        }

        /**
         * Generate cache key from product info
         * Priority: productCode > productName > productId
         * @param {string|number} productId - Product ID (optional)
         * @param {string} productName - Product name (optional)
         * @param {string} productCode - Product code (optional)
         * @returns {string|null} - Cache key or null if no valid key
         */
        generateKey(productId, productName = null, productCode = null) {
            // Use productCode first if available (most stable identifier)
            if (productCode && productCode.trim()) {
                return this.sanitizeKey(productCode.trim());
            }

            // Fallback to productName if available (sanitized)
            if (productName && productName.trim()) {
                return this.sanitizeKey(productName.trim());
            }

            // Last resort: use productId if it's a valid number
            if (productId && !isNaN(Number(productId))) {
                return String(productId);
            }

            return null;
        }

        /**
         * Get cached image for a product
         * @param {string|number} productId - Product ID
         * @param {string} productName - Product name (fallback key)
         * @param {string} productCode - Product code (fallback key)
         * @returns {Promise<{product_name: string, content_url: string, content_id?: string}|null>}
         */
        async get(productId, productName = null, productCode = null) {
            try {
                // Wait for initialization
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    console.warn('[FIREBASE-CACHE] Not initialized, skipping cache get');
                    return null;
                }

                const cacheKey = this.generateKey(productId, productName, productCode);
                if (!cacheKey) {
                    console.warn('[FIREBASE-CACHE] No valid cache key available');
                    return null;
                }

                const snapshot = await this.cacheRef.child(cacheKey).once('value');

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    console.log(`[FIREBASE-CACHE] ✅ Cache HIT for "${cacheKey}":`, data.content_id);
                    return data;
                } else {
                    console.log(`[FIREBASE-CACHE] ❌ Cache MISS for "${cacheKey}"`);
                    return null;
                }

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error getting cache:', error);
                // Return null on error to fallback to normal upload
                return null;
            }
        }

        /**
         * Save image to cache
         * @param {string|number} productId - Product ID
         * @param {string} productName - Product name
         * @param {string} contentUrl - Pancake content URL (optional)
         * @param {string} contentId - Pancake image ID for reuse (required)
         * @param {string} productCode - Product code (optional)
         * @param {number} width - Image width (optional)
         * @param {number} height - Image height (optional)
         * @returns {Promise<boolean>}
         */
        async set(productId, productName, contentUrl, contentId = null, productCode = null, width = null, height = null) {
            try {
                // Wait for initialization
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    console.warn('[FIREBASE-CACHE] Not initialized, skipping cache set');
                    return false;
                }

                // Require content_id (most important for Pancake API reuse)
                if (!contentId) {
                    console.warn('[FIREBASE-CACHE] Missing content_id, skipping cache set');
                    return false;
                }

                const cacheKey = this.generateKey(productId, productName, productCode);
                if (!cacheKey) {
                    console.warn('[FIREBASE-CACHE] No valid cache key (need productId, productName, or productCode)');
                    return false;
                }

                const cacheData = {
                    product_name: productName || '',
                    product_code: productCode || '',
                    content_id: contentId,  // Required
                    updated_at: firebase.database.ServerValue.TIMESTAMP
                };

                // Store content_url if provided (optional)
                if (contentUrl) {
                    cacheData.content_url = contentUrl;
                }

                // Store dimensions if provided (optional)
                if (width && width > 0) {
                    cacheData.width = width;
                }
                if (height && height > 0) {
                    cacheData.height = height;
                }

                // Store original productId if available
                if (productId && !isNaN(Number(productId))) {
                    cacheData.product_id = Number(productId);
                }

                await this.cacheRef.child(cacheKey).set(cacheData);

                console.log(`[FIREBASE-CACHE] ✅ Saved to cache: "${cacheKey}", content_id:`, contentId);
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error saving to cache:', error);
                // Don't throw error - just log and continue (upload still succeeded)
                return false;
            }
        }

        /**
         * Check if cache is available
         * @returns {boolean}
         */
        isAvailable() {
            return this.isInitialized && this.cacheRef !== null;
        }

        /**
         * Clear cache for a specific product (for admin use)
         * @param {string|number} productId
         * @param {string} productName
         * @param {string} productCode
         * @returns {Promise<boolean>}
         */
        async clear(productId, productName = null, productCode = null) {
            try {
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    return false;
                }

                const cacheKey = this.generateKey(productId, productName, productCode);
                if (!cacheKey) {
                    return false;
                }

                await this.cacheRef.child(cacheKey).remove();
                console.log(`[FIREBASE-CACHE] ✅ Cleared cache for "${cacheKey}"`);
                return true;

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error clearing cache:', error);
                return false;
            }
        }

        /**
         * Get all cached images (for debugging)
         * @returns {Promise<Object>}
         */
        async getAll() {
            try {
                await this.initPromise;

                if (!this.isInitialized || !this.cacheRef) {
                    return {};
                }

                const snapshot = await this.cacheRef.once('value');
                return snapshot.val() || {};

            } catch (error) {
                console.error('[FIREBASE-CACHE] ❌ Error getting all cache:', error);
                return {};
            }
        }
    }

    // Initialize and expose globally
    window.firebaseImageCache = new FirebaseImageCache();

    console.log('[FIREBASE-CACHE] Module loaded');

})();
