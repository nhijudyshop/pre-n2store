/**
 * Token Cache for Cloudflare Worker
 * In-memory token caching with expiry management
 * Caches tokens PER USERNAME to support multiple accounts
 *
 * @module cloudflare-worker/modules/utils/token-cache
 */

/**
 * TPOS Token Cache - Map of username -> token data
 */
const tokenCacheMap = new Map();

/**
 * Check if cached token for a user is still valid
 * @param {string} username - The username to check
 * @returns {boolean}
 */
export function isCachedTokenValid(username = '_default') {
    const cache = tokenCacheMap.get(username);
    if (!cache || !cache.access_token || !cache.expiry) {
        return false;
    }

    // Add 5-minute buffer before expiry
    const buffer = 5 * 60 * 1000;
    const now = Date.now();

    return now < (cache.expiry - buffer);
}

/**
 * Cache token data for a user
 * @param {object} tokenData - Token response from TPOS
 * @param {string} username - The username (key for cache)
 */
export function cacheToken(tokenData, username = '_default') {
    const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

    tokenCacheMap.set(username, {
        access_token: tokenData.access_token,
        expiry: expiryTimestamp,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type || 'Bearer'
    });

    console.log(`[TOKEN-CACHE] Token cached for user "${username}", expires at:`, new Date(expiryTimestamp).toISOString());
}

/**
 * Get cached token if valid for a user
 * @param {string} username - The username to get token for
 * @returns {object|null}
 */
export function getCachedToken(username = '_default') {
    if (isCachedTokenValid(username)) {
        const cache = tokenCacheMap.get(username);
        console.log(`[TOKEN-CACHE] Using cached token for user "${username}"`);
        return {
            access_token: cache.access_token,
            expires_in: Math.floor((cache.expiry - Date.now()) / 1000),
            token_type: cache.token_type
        };
    }
    return null;
}

/**
 * Clear cached token for a user
 * @param {string} username - The username to clear (or all if not specified)
 */
export function clearCachedToken(username = null) {
    if (username) {
        tokenCacheMap.delete(username);
        console.log(`[TOKEN-CACHE] Token cache cleared for user "${username}"`);
    } else {
        tokenCacheMap.clear();
        console.log('[TOKEN-CACHE] All token caches cleared');
    }
}

/**
 * Get token cache status
 * @param {string} username - The username to check
 * @returns {object}
 */
export function getTokenCacheStatus(username = '_default') {
    const cache = tokenCacheMap.get(username);
    return {
        hasToken: !!cache?.access_token,
        isValid: isCachedTokenValid(username),
        expiresAt: cache?.expiry ? new Date(cache.expiry).toISOString() : null,
        remainingSec: cache?.expiry ? Math.floor((cache.expiry - Date.now()) / 1000) : 0,
        cachedUsers: Array.from(tokenCacheMap.keys())
    };
}
