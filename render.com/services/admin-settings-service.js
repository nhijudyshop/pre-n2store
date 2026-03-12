/**
 * =====================================================
 * ADMIN SETTINGS SERVICE
 * =====================================================
 * Cached reads with 1-minute TTL for runtime configuration
 * Created: 2026-01-23
 * =====================================================
 */

'use strict';

// In-memory cache for settings
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get a setting value by key
 * Uses in-memory cache with 1-minute TTL
 * @param {Object} db - Database connection
 * @param {string} key - Setting key
 * @returns {Promise<string|null>} Setting value or null if not found
 */
async function getSetting(db, key) {
    // Check cache first
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }

    try {
        // Query database
        const result = await db.query(
            'SELECT setting_value FROM admin_settings WHERE setting_key = $1',
            [key]
        );

        const value = result.rows[0]?.setting_value ?? null;

        // Update cache
        cache.set(key, { value, timestamp: Date.now() });

        return value;
    } catch (error) {
        // If table doesn't exist yet, return null (will use default)
        if (error.code === '42P01') { // undefined_table
            console.warn('[ADMIN_SETTINGS] Table not found, returning null');
            return null;
        }
        throw error;
    }
}

/**
 * Set a setting value
 * Invalidates cache after update
 * @param {Object} db - Database connection
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @param {string} updatedBy - Username/email of updater
 * @returns {Promise<string>} The set value
 */
async function setSetting(db, key, value, updatedBy) {
    await db.query(`
        INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET
            setting_value = $2,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
    `, [key, value, updatedBy]);

    // Invalidate cache
    cache.delete(key);

    console.log(`[ADMIN_SETTINGS] ${key} set to "${value}" by ${updatedBy}`);

    return value;
}

/**
 * Convenience method to check if auto-approve is enabled
 * Returns TRUE by default to maintain backward compatibility
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} True if auto-approve is enabled
 */
async function isAutoApproveEnabled(db) {
    const value = await getSetting(db, 'auto_approve_enabled');
    // Default to TRUE if not set (backward compatibility)
    return value === null || value === 'true';
}

/**
 * Get all settings (for admin dashboard)
 * @param {Object} db - Database connection
 * @returns {Promise<Array>} Array of all settings
 */
async function getAllSettings(db) {
    try {
        const result = await db.query(`
            SELECT setting_key, setting_value, description, updated_at, updated_by
            FROM admin_settings
            ORDER BY setting_key
        `);
        return result.rows;
    } catch (error) {
        if (error.code === '42P01') {
            return [];
        }
        throw error;
    }
}

/**
 * Invalidate cache for a specific key or all keys
 * @param {string|null} key - Key to invalidate, or null for all
 */
function invalidateCache(key = null) {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
}

/**
 * Get cache stats (for debugging)
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
    return {
        size: cache.size,
        keys: Array.from(cache.keys()),
        ttl: CACHE_TTL
    };
}

module.exports = {
    getSetting,
    setSetting,
    isAutoApproveEnabled,
    getAllSettings,
    invalidateCache,
    getCacheStats
};
