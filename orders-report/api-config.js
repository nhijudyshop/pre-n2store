/**
 * API Configuration
 * Central configuration for all API endpoints
 * Primary: Cloudflare Worker | Backup: Nginx Server
 * Auto-fallback when primary fails
 */

// =====================================================
// SERVER CONFIGURATION
// =====================================================
const PRIMARY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BACKUP_URL = 'https://n2store-fallback.onrender.com'; // Render.com backup server

// Current active server (will switch to backup on failure)
let currentServerURL = PRIMARY_URL;
let isUsingBackup = false;
let lastFailureTime = null;
const RETRY_PRIMARY_AFTER = 5 * 60 * 1000; // Thử lại primary sau 5 phút

// For backward compatibility
const WORKER_URL = currentServerURL;

/**
 * Get current active server URL
 * @returns {string}
 */
function getCurrentServerURL() {
    // Check if we should retry primary
    if (isUsingBackup && lastFailureTime) {
        const timeSinceFailure = Date.now() - lastFailureTime;
        if (timeSinceFailure > RETRY_PRIMARY_AFTER) {
            console.log('[API-CONFIG] 🔄 Attempting to switch back to primary server...');
            currentServerURL = PRIMARY_URL;
            isUsingBackup = false;
        }
    }
    return currentServerURL;
}

/**
 * Switch to backup server
 */
function switchToBackup() {
    if (!isUsingBackup) {
        console.warn('[API-CONFIG] ⚠️ Switching to BACKUP server:', BACKUP_URL);
        currentServerURL = BACKUP_URL;
        isUsingBackup = true;
        lastFailureTime = Date.now();
    }
}

/**
 * Replace URL with current server
 * @param {string} url - URL with any server base
 * @returns {string} - URL with current active server
 */
function replaceServerInURL(url) {
    const serverURL = getCurrentServerURL();
    if (url.startsWith(PRIMARY_URL)) {
        return url.replace(PRIMARY_URL, serverURL);
    }
    if (url.startsWith(BACKUP_URL)) {
        return url.replace(BACKUP_URL, serverURL);
    }
    return url;
}

// API Configuration
const API_CONFIG = {
    // Server URLs
    PRIMARY_URL: PRIMARY_URL,
    BACKUP_URL: BACKUP_URL,

    // Backward compatibility - dynamic getter
    get WORKER_URL() {
        return getCurrentServerURL();
    },

    // TPOS OData API (SaleOnline_Order, AuditLog, etc.)
    get TPOS_ODATA() {
        return `${getCurrentServerURL()}/api/odata`;
    },

    // Pancake API (Pages, Conversations) - Via proxy
    get PANCAKE() {
        return `${getCurrentServerURL()}/api/pancake`;
    },

    // Helper functions
    buildUrl: {
        /**
         * Build TPOS OData URL
         * @param {string} endpoint - e.g., "SaleOnline_Order/ODataService.GetView"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL through current server
         */
        tposOData: (endpoint, params = '') => {
            const baseUrl = `${getCurrentServerURL()}/api/odata/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake API URL
         * @param {string} endpoint - e.g., "pages", "conversations"
         * @param {string} params - Query string (optional)
         * @returns {string} - Full URL via current server
         */
        pancake: (endpoint, params = '') => {
            const baseUrl = `${getCurrentServerURL()}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        /**
         * Build Pancake Direct API URL (with custom Referer and JWT cookie)
         * Used for 24h policy bypass - fill_admin_name, check_inbox, contents/touch
         * @param {string} endpoint - e.g., "pages/123/check_inbox"
         * @param {string} pageId - Page ID for Referer mapping
         * @param {string} jwtToken - JWT token for Cookie header
         * @param {string} accessToken - Pancake access token
         * @returns {string} - Full URL via current server
         */
        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${getCurrentServerURL()}/api/pancake-direct/${endpoint}?${params.toString()}`;
        },

        /**
         * Build Pancake Official API URL (pages.fm Public API)
         * Uses page_access_token (from Settings → Tools, never expires)
         * @param {string} endpoint - e.g., "pages/123/conversations/456/messages"
         * @param {string} pageAccessToken - Page access token (from Pancake Settings → Tools)
         * @returns {string} - Full URL via current server
         */
        pancakeOfficial: (endpoint, pageAccessToken) => {
            const baseUrl = `${getCurrentServerURL()}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
        },

        /**
         * Get Facebook Send API URL (for sending messages with message_tag)
         * Used to bypass 24h policy with POST_PURCHASE_UPDATE tag
         * @returns {string} - Full URL via current server
         */
        facebookSend: () => {
            return `${getCurrentServerURL()}/api/facebook-send`;
        }
    },

    /**
     * Smart Fetch - Auto-fallback to backup server on failure
     * @param {string} url - Full URL (will auto-replace server if needed)
     * @param {object} options - Fetch options
     * @returns {Promise<Response>}
     */
    smartFetch: async function (url, options = {}) {
        // Replace server URL with current active server
        const activeUrl = replaceServerInURL(url);

        try {
            const response = await fetch(activeUrl, options);

            // Check for server errors (500+)
            if (response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }

            return response;
        } catch (error) {
            // If using primary and it failed, try backup
            if (!isUsingBackup) {
                console.error('[API-CONFIG] ❌ Primary server failed:', error.message);
                switchToBackup();

                // Retry with backup server
                const backupUrl = url.replace(PRIMARY_URL, BACKUP_URL);
                console.log('[API-CONFIG] 🔄 Retrying with backup:', backupUrl);

                try {
                    const backupResponse = await fetch(backupUrl, options);
                    console.log('[API-CONFIG] ✅ Backup server responded:', backupResponse.status);
                    return backupResponse;
                } catch (backupError) {
                    console.error('[API-CONFIG] ❌ Backup server also failed:', backupError.message);
                    throw backupError;
                }
            }

            // Already using backup and it failed
            throw error;
        }
    },

    /**
     * Get current server status
     */
    getStatus: function () {
        return {
            primary: PRIMARY_URL,
            backup: BACKUP_URL,
            current: getCurrentServerURL(),
            isUsingBackup: isUsingBackup,
            lastFailureTime: lastFailureTime ? new Date(lastFailureTime).toISOString() : null
        };
    },

    /**
     * Force switch to backup (manual trigger)
     */
    forceBackup: function () {
        switchToBackup();
        console.log('[API-CONFIG] 🔧 Force switched to backup server');
    },

    /**
     * Force switch back to primary (manual trigger)
     */
    forcePrimary: function () {
        currentServerURL = PRIMARY_URL;
        isUsingBackup = false;
        lastFailureTime = null;
        console.log('[API-CONFIG] 🔧 Force switched to primary server');
    },

    /**
     * Get current server URL (for dynamic URL building)
     */
    getCurrentServer: getCurrentServerURL,

    /**
     * Replace server in URL with current active server
     */
    replaceServer: replaceServerInURL
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
    window.getCurrentServerURL = getCurrentServerURL;
}

console.log('[API-CONFIG] 🚀 API configuration loaded:', {
    primary: PRIMARY_URL,
    backup: BACKUP_URL,
    current: getCurrentServerURL(),
    tposOData: API_CONFIG.TPOS_ODATA,
    pancake: API_CONFIG.PANCAKE
});
