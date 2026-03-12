/**
 * PRODUCT CODE GENERATOR
 * File: product-code-generator.js
 * Purpose: Auto-generate product codes using configurable prefix mapping
 *
 * Rules are loaded from Firestore `settings/product_code_rules`.
 * Each rule maps a product name prefix (e.g., "MM", "B") to a code prefix (e.g., "MM", "B").
 */

window.ProductCodeGenerator = (function() {
    'use strict';

    /**
     * Default prefix rules (used when Firestore config not available)
     * match: product name starts with this string (case-insensitive)
     * codePrefix: the prefix used for generated code
     */
    const DEFAULT_PREFIX_RULES = [
        { match: 'MM', codePrefix: 'MM' },
        { match: 'HH', codePrefix: 'HH' },
        { match: 'B', codePrefix: 'B' },
        { match: 'S', codePrefix: 'S' },
        { match: 'C', codePrefix: 'C' },
    ];

    const DEFAULT_PREFIX = 'N';

    // Cache for loaded rules
    let cachedConfig = null;

    /**
     * Load prefix rules from Firestore, fallback to defaults
     * @returns {Promise<{rules: Array, defaultPrefix: string}>}
     */
    async function loadPrefixConfig() {
        if (cachedConfig) return cachedConfig;

        try {
            if (window.firebase && window.firebase.firestore) {
                const doc = await firebase.firestore()
                    .collection('settings').doc('product_code_rules').get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data.rules && Array.isArray(data.rules)) {
                        cachedConfig = {
                            rules: data.rules,
                            defaultPrefix: data.defaultPrefix || DEFAULT_PREFIX
                        };
                        console.log('[ProductCodeGen] Loaded prefix rules from Firestore:', cachedConfig.rules.length, 'rules');
                        return cachedConfig;
                    }
                }
            }
        } catch (e) {
            console.warn('[ProductCodeGen] Failed to load rules from Firestore:', e.message);
        }

        cachedConfig = {
            rules: DEFAULT_PREFIX_RULES,
            defaultPrefix: DEFAULT_PREFIX
        };
        console.log('[ProductCodeGen] Using default prefix rules');
        return cachedConfig;
    }

    /**
     * Clear cached config (call after saving new rules)
     */
    function clearCache() {
        cachedConfig = null;
    }

    /**
     * Detect code prefix from product name using prefix rules
     * @param {string} productName
     * @param {Array} rules - Prefix rules array
     * @param {string} defaultPrefix - Fallback prefix when no rule matches
     * @returns {string|null}
     */
    function detectCodePrefix(productName, rules, defaultPrefix) {
        if (!productName || typeof productName !== 'string') {
            return null;
        }

        const name = productName.trim();
        if (!name) return null;

        // Sort rules by match length desc (longer matches first to avoid ambiguity)
        const sorted = [...rules].sort((a, b) => b.match.length - a.match.length);

        for (const rule of sorted) {
            if (name.toLowerCase().startsWith(rule.match.toLowerCase())) {
                return rule.codePrefix;
            }
        }

        // Fallback to configurable default prefix
        return defaultPrefix || DEFAULT_PREFIX;
    }

    /**
     * Get max number from form items
     * @param {Array} items - Form items
     * @param {string} prefix - Code prefix (N, P, MM, etc.)
     * @returns {number}
     */
    function getMaxNumberFromItems(items, prefix) {
        if (!items || !Array.isArray(items) || !prefix) {
            return 0;
        }

        const regex = new RegExp(`^${prefix}(\\d+)`, 'i');
        let maxNum = 0;

        for (const item of items) {
            const code = item.productCode || item.product_code || item._tempProductCode;
            if (code) {
                const match = code.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        }

        return maxNum;
    }

    /**
     * Get max number from Firestore (purchase_orders collection → items array)
     * @param {string} prefix
     * @returns {Promise<number>}
     */
    async function getMaxNumberFromFirestore(prefix) {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('Firestore not available');
                return 0;
            }

            const db = firebase.firestore();
            const upperPrefix = prefix.toUpperCase();
            const regex = new RegExp(`^${upperPrefix}(\\d+)`, 'i');

            const snapshot = await db.collection('purchase_orders').get();

            let maxNum = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const items = data.items || [];
                for (const item of items) {
                    const code = item.productCode || '';
                    if (code) {
                        const match = code.match(regex);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            if (num > maxNum) {
                                maxNum = num;
                            }
                        }
                    }
                }
            });

            console.log(`[ProductCodeGen] Firestore max for ${upperPrefix}: ${maxNum}`);
            return maxNum;
        } catch (error) {
            console.error('Error getting max number from Firestore:', error);
            return 0;
        }
    }

    /**
     * Get max number from TPOS via TPOSClient.getMaxProductCode
     * @param {string} prefix - Code prefix
     * @returns {Promise<number>}
     */
    async function getMaxNumberFromTPOS(prefix) {
        try {
            if (!window.TPOSClient || !window.TPOSClient.getMaxProductCode) {
                return 0;
            }
            return await window.TPOSClient.getMaxProductCode(prefix);
        } catch (error) {
            console.error('Error getting max number from TPOS:', error);
            return 0;
        }
    }

    /**
     * Check if product code exists in form items
     * @param {string} code
     * @param {Array} items
     * @returns {boolean}
     */
    function codeExistsInItems(code, items) {
        if (!code || !items) return false;
        const upperCode = code.toUpperCase();
        return items.some(item => {
            const itemCode = (item.productCode || item.product_code || item._tempProductCode || '').toUpperCase();
            return itemCode === upperCode;
        });
    }

    /**
     * Check if product code exists in Firestore
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsInFirestore(code) {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                return false;
            }

            const db = firebase.firestore();
            const upperCode = code.toUpperCase();

            const snapshot = await db.collection('purchase_orders').get();

            for (const doc of snapshot.docs) {
                const items = doc.data().items || [];
                for (const item of items) {
                    if ((item.productCode || '').toUpperCase() === upperCode) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('Error checking code in Firestore:', error);
            return false;
        }
    }

    /**
     * Check if product code exists on TPOS
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsOnTPOS(code) {
        try {
            if (!window.TPOSClient || !window.TPOSClient.searchProduct) {
                return false;
            }

            const result = await window.TPOSClient.searchProduct(code);
            return result && result.length > 0;
        } catch (error) {
            console.error('Error checking code on TPOS:', error);
            return false;
        }
    }

    /**
     * Generate product code from max number using prefix rules
     * @param {string} productName - Product name for prefix detection
     * @param {Array} existingItems - Form items to check against
     * @param {number} maxAttempts - Max attempts before giving up
     * @returns {Promise<string|null>}
     */
    async function generateProductCodeFromMax(productName, existingItems = [], maxAttempts = 30) {
        // Load prefix config
        const config = await loadPrefixConfig();

        // Detect code prefix from product name
        const codePrefix = detectCodePrefix(productName, config.rules, config.defaultPrefix);
        if (!codePrefix) {
            console.warn('Could not detect code prefix for:', productName);
            return null;
        }

        // Get max numbers from all sources (parallel)
        const [maxFromFirestore, maxFromTPOS] = await Promise.all([
            getMaxNumberFromFirestore(codePrefix),
            getMaxNumberFromTPOS(codePrefix)
        ]);
        const maxFromItems = getMaxNumberFromItems(existingItems, codePrefix);
        const maxNumber = Math.max(maxFromItems, maxFromFirestore, maxFromTPOS);
        console.log(`[ProductCodeGen] Max for ${codePrefix}: form=${maxFromItems}, firestore=${maxFromFirestore}, tpos=${maxFromTPOS} → next=${maxNumber + 1}`);

        // Try to find unused code
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const number = maxNumber + attempt;
            const candidateCode = `${codePrefix}${number}`;

            // Check form items
            if (codeExistsInItems(candidateCode, existingItems)) {
                continue;
            }

            // Check Firestore
            const existsInDB = await codeExistsInFirestore(candidateCode);
            if (existsInDB) {
                continue;
            }

            // Check TPOS
            const existsOnTPOS = await codeExistsOnTPOS(candidateCode);
            if (existsOnTPOS) {
                continue;
            }

            // Found unused code
            return candidateCode;
        }

        console.warn(`Failed to generate code after ${maxAttempts} attempts for:`, productName);
        return null;
    }

    /**
     * Generate product code from a custom prefix (e.g., "MM" → MM01, MM02, ...)
     * @param {string} prefix - The prefix to use (e.g., "MM")
     * @param {Array} existingItems - Form items to check against
     * @param {number} maxAttempts - Max attempts before giving up
     * @returns {Promise<string|null>}
     */
    async function generateCodeWithPrefix(prefix, existingItems = [], maxAttempts = 30) {
        if (!prefix || typeof prefix !== 'string') return null;

        const upperPrefix = prefix.toUpperCase();

        // Get max numbers from all sources (parallel)
        const [maxFromFirestore, maxFromTPOS] = await Promise.all([
            getMaxNumberFromFirestore(upperPrefix),
            getMaxNumberFromTPOS(upperPrefix)
        ]);
        const maxFromItems = getMaxNumberFromItems(existingItems, upperPrefix);
        const maxNumber = Math.max(maxFromItems, maxFromFirestore, maxFromTPOS);
        console.log(`[ProductCodeGen] Prefix "${upperPrefix}" max: form=${maxFromItems}, firestore=${maxFromFirestore}, tpos=${maxFromTPOS} → next=${maxNumber + 1}`);

        // Try to find unused code
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const number = maxNumber + attempt;
            const candidateCode = `${upperPrefix}${number}`;

            if (codeExistsInItems(candidateCode, existingItems)) continue;

            const existsInDB = await codeExistsInFirestore(candidateCode);
            if (existsInDB) continue;

            const existsOnTPOS = await codeExistsOnTPOS(candidateCode);
            if (existsOnTPOS) continue;

            return candidateCode;
        }

        console.warn(`Failed to generate code with prefix "${upperPrefix}" after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Check if a string is a pure letter prefix (no digits)
     * @param {string} str
     * @returns {boolean}
     */
    function isPurePrefix(str) {
        return /^[A-Za-z]{2,}$/.test(str?.trim());
    }

    /**
     * Simple synchronous code generation (without DB checks)
     * Uses cached rules if available, otherwise defaults
     * @param {string} productName
     * @param {Array} existingItems
     * @returns {string|null}
     */
    function generateProductCodeSync(productName, existingItems = []) {
        const config = cachedConfig || { rules: DEFAULT_PREFIX_RULES, defaultPrefix: DEFAULT_PREFIX };
        const codePrefix = detectCodePrefix(productName, config.rules, config.defaultPrefix);
        if (!codePrefix) {
            return null;
        }

        const maxFromItems = getMaxNumberFromItems(existingItems, codePrefix);
        const number = maxFromItems + 1;
        return `${codePrefix}${number}`;
    }

    /**
     * Extract base product code from variant code
     * @param {string} code - "N123VX" or "P045-01"
     * @returns {string} - "N123" or "P045"
     */
    function extractBaseProductCode(code) {
        if (!code || typeof code !== 'string') {
            return '';
        }
        const match = code.match(/^([A-Z]+\d+)/i);
        return match ? match[1].toUpperCase() : code.toUpperCase();
    }

    /**
     * Validate product code format
     * @param {string} code
     * @returns {boolean}
     */
    function isValidProductCode(code) {
        if (!code || typeof code !== 'string') {
            return false;
        }
        return /^[A-Z]+\d{1,}[A-Z0-9]*$/i.test(code.trim());
    }

    // Public API
    return {
        detectCodePrefix,
        loadPrefixConfig,
        clearCache,
        getMaxNumberFromItems,
        getMaxNumberFromFirestore,
        getMaxNumberFromTPOS,
        generateProductCodeFromMax,
        generateCodeWithPrefix,
        isPurePrefix,
        generateProductCodeSync,
        extractBaseProductCode,
        isValidProductCode,
        codeExistsInItems,
        codeExistsInFirestore,
        codeExistsOnTPOS,
        // Constants for reference
        DEFAULT_PREFIX_RULES,
        DEFAULT_PREFIX
    };
})();
