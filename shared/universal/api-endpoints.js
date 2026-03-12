/**
 * Centralized API Endpoints Configuration
 * All API URLs in one place for easy maintenance
 *
 * @module shared/universal/api-endpoints
 */

export const API_ENDPOINTS = {
    // TPOS API
    TPOS: {
        BASE: 'https://tomato.tpos.vn',
        TOKEN: 'https://tomato.tpos.vn/token',
        ODATA: 'https://tomato.tpos.vn/odata',
        REST: 'https://tomato.tpos.vn/rest',
        API: 'https://tomato.tpos.vn/api',

        // Common OData endpoints
        FAST_SALE_ORDER: 'https://tomato.tpos.vn/odata/FastSaleOrder',
        SALE_ONLINE_ORDER: 'https://tomato.tpos.vn/odata/SaleOnline_Order',
        PRODUCT: 'https://tomato.tpos.vn/odata/Product',
        CRM_TEAM: 'https://tomato.tpos.vn/odata/CRMTeam',
    },

    // Pancake API
    PANCAKE: {
        BASE: 'https://pancake.vn',
        API: 'https://pancake.vn/api/v1',
        CONTENT: 'https://content.pancake.vn',

        // Pancake Official (pages.fm Public API)
        PAGES_FM: 'https://pages.fm/api/public_api/v1',
    },

    // Facebook Graph API
    FACEBOOK: {
        GRAPH: 'https://graph.facebook.com',
        GRAPH_VERSION: 'v21.0',
        get GRAPH_URL() {
            return `${this.GRAPH}/${this.GRAPH_VERSION}`;
        },
    },

    // N2Store Services
    N2STORE: {
        REALTIME: 'https://n2store-realtime.onrender.com',
    },

    // Cloudflare Worker Proxy
    WORKER: {
        URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',

        // Worker API routes
        get TOKEN() { return `${this.URL}/api/token`; },
        get ODATA() { return `${this.URL}/api/odata`; },
        get PANCAKE() { return `${this.URL}/api/pancake`; },
        get PANCAKE_DIRECT() { return `${this.URL}/api/pancake-direct`; },
        get PANCAKE_OFFICIAL() { return `${this.URL}/api/pancake-official`; },
        get FACEBOOK_SEND() { return `${this.URL}/api/facebook-send`; },
        get IMAGE_PROXY() { return `${this.URL}/api/image-proxy`; },
        get FB_AVATAR() { return `${this.URL}/api/fb-avatar`; },
    },

    // External Services
    EXTERNAL: {
        DEEPSEEK: 'https://api.deepseek.com/v1/chat/completions',
        DEEPSEEK_OCR: 'https://alphaxiv--deepseek-ocr-modal-serve.modal.run/run/image',
    },
};

/**
 * Build TPOS OData URL
 * @param {string} endpoint - OData endpoint (e.g., "FastSaleOrder/ODataService.GetView")
 * @param {string} params - Query string (optional)
 * @returns {string} Full URL
 */
export function buildTposODataUrl(endpoint, params = '') {
    const baseUrl = `${API_ENDPOINTS.TPOS.ODATA}/${endpoint}`;
    return params ? `${baseUrl}?${params}` : baseUrl;
}

/**
 * Build Pancake API URL
 * @param {string} endpoint - API endpoint
 * @param {string} params - Query string (optional)
 * @returns {string} Full URL
 */
export function buildPancakeUrl(endpoint, params = '') {
    const baseUrl = `${API_ENDPOINTS.PANCAKE.API}/${endpoint}`;
    return params ? `${baseUrl}?${params}` : baseUrl;
}

/**
 * Build Facebook Graph API URL
 * @param {string} endpoint - Graph endpoint (e.g., "me/messages")
 * @param {string} accessToken - Access token
 * @returns {string} Full URL with token
 */
export function buildFacebookGraphUrl(endpoint, accessToken = '') {
    const baseUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${endpoint}`;
    return accessToken ? `${baseUrl}?access_token=${accessToken}` : baseUrl;
}

/**
 * Build Worker Proxy URL
 * @param {string} route - Worker route (e.g., "pancake", "odata")
 * @param {string} endpoint - API endpoint
 * @param {string} params - Query string (optional)
 * @returns {string} Full URL through worker
 */
export function buildWorkerUrl(route, endpoint = '', params = '') {
    let baseUrl = `${API_ENDPOINTS.WORKER.URL}/api/${route}`;
    if (endpoint) baseUrl += `/${endpoint}`;
    return params ? `${baseUrl}?${params}` : baseUrl;
}
