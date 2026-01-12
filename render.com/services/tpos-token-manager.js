// =====================================================
// TPOS TOKEN MANAGER
// Auto-fetch and cache TPOS Bearer token from credentials
// =====================================================

const fetch = require('node-fetch');

class TPOSTokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.refreshPromise = null; // Prevent concurrent refresh requests
    }

    /**
     * Get valid TPOS token (auto-refresh if expired)
     */
    async getToken() {
        // Return cached token if still valid
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            console.log('[TPOS-TOKEN] Using cached token (expires in', Math.round((this.tokenExpiry - Date.now()) / 1000), 'seconds)');
            return this.token;
        }

        // If already refreshing, wait for that request
        if (this.refreshPromise) {
            console.log('[TPOS-TOKEN] Waiting for ongoing refresh...');
            return this.refreshPromise;
        }

        // Fetch new token
        this.refreshPromise = this._fetchNewToken();

        try {
            const token = await this.refreshPromise;
            return token;
        } finally {
            this.refreshPromise = null;
        }
    }

    /**
     * Fetch new token from TPOS
     */
    async _fetchNewToken() {
        const username = process.env.TPOS_USERNAME;
        const password = process.env.TPOS_PASSWORD;
        const clientId = process.env.TPOS_CLIENT_ID || 'tmtWebApp';

        if (!username || !password) {
            throw new Error('TPOS credentials not configured. Set TPOS_USERNAME and TPOS_PASSWORD in environment variables.');
        }

        console.log('[TPOS-TOKEN] Fetching new token from TPOS API...');

        try {
            // Call TPOS token endpoint via Cloudflare Worker proxy
            const proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';

            const body = new URLSearchParams({
                grant_type: 'password',
                username: username,
                password: password,
                client_id: clientId
            });

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`TPOS token request failed: ${response.status} ${errorText}`);
            }

            const data = await response.json();

            if (!data.access_token) {
                throw new Error('No access_token in TPOS response');
            }

            this.token = data.access_token;

            // Calculate expiry (default 1 hour if not provided, minus 5 minutes buffer)
            const expiresInSeconds = data.expires_in || 3600;
            const bufferSeconds = 300; // 5 minutes
            this.tokenExpiry = Date.now() + ((expiresInSeconds - bufferSeconds) * 1000);

            console.log('[TPOS-TOKEN] ✅ Token fetched successfully (expires in', expiresInSeconds, 'seconds)');

            return this.token;

        } catch (error) {
            console.error('[TPOS-TOKEN] ❌ Error fetching token:', error.message);
            this.token = null;
            this.tokenExpiry = null;
            throw error;
        }
    }

    /**
     * Get Authorization header
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Force refresh token
     */
    async refresh() {
        this.token = null;
        this.tokenExpiry = null;
        return this.getToken();
    }

    /**
     * Get token info (for debugging)
     */
    getTokenInfo() {
        if (!this.token) {
            return { hasToken: false };
        }

        const now = Date.now();
        const expiresIn = this.tokenExpiry ? Math.round((this.tokenExpiry - now) / 1000) : null;

        return {
            hasToken: true,
            isValid: this.tokenExpiry && now < this.tokenExpiry,
            expiresIn: expiresIn,
            tokenPreview: this.token.substring(0, 20) + '...'
        };
    }
}

// Singleton instance
const tokenManager = new TPOSTokenManager();

module.exports = tokenManager;
