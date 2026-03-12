/**
 * Dynamic Header Learner
 * Learns and caches dynamic headers (e.g., tposappversion) from responses
 *
 * @module cloudflare-worker/modules/utils/header-learner
 */

/**
 * In-memory cache for dynamic headers
 */
const dynamicHeaders = {
    tposappversion: null,
    lastUpdated: null,
    updateCooldown: 60 * 60 * 1000 // 1 hour cooldown between updates
};

/**
 * Default header values (fallback when not learned yet)
 */
export const DEFAULT_HEADERS = {
    tposappversion: '5.12.29.1'
};

/**
 * Get dynamic header value
 * @param {string} headerName - Header name
 * @returns {string|null}
 */
export function getDynamicHeader(headerName) {
    return dynamicHeaders[headerName] || DEFAULT_HEADERS[headerName] || null;
}

/**
 * Set dynamic header value
 * @param {string} headerName - Header name
 * @param {string} value - Header value
 */
export function setDynamicHeader(headerName, value) {
    dynamicHeaders[headerName] = value;
    dynamicHeaders.lastUpdated = Date.now();
}

/**
 * Learn dynamic headers from response
 * Updates cached values based on response headers
 * @param {Response} response - Response object
 */
export function learnFromResponse(response) {
    try {
        const tposVersion = response.headers.get('tposappversion');

        // Validate version format (x.x.x.x)
        if (tposVersion && /^\d+\.\d+\.\d+\.\d+$/.test(tposVersion)) {
            const now = Date.now();
            const lastUpdate = dynamicHeaders.lastUpdated || 0;

            // Only update if cooldown has passed
            if (now - lastUpdate > dynamicHeaders.updateCooldown) {
                if (dynamicHeaders.tposappversion !== tposVersion) {
                    console.log(`[HEADER-LEARNER] Updated tposappversion: ${dynamicHeaders.tposappversion || '(none)'} → ${tposVersion}`);
                    dynamicHeaders.tposappversion = tposVersion;
                    dynamicHeaders.lastUpdated = now;
                }
            }
        }
    } catch (error) {
        console.error('[HEADER-LEARNER] Error:', error.message);
    }
}

/**
 * Get all learned headers
 * @returns {object}
 */
export function getAllDynamicHeaders() {
    return {
        tposappversion: getDynamicHeader('tposappversion'),
        lastUpdated: dynamicHeaders.lastUpdated
            ? new Date(dynamicHeaders.lastUpdated).toISOString()
            : null
    };
}

/**
 * Build TPOS request headers
 * @param {Request} request - Original request (to copy Authorization)
 * @returns {Headers}
 */
export function buildTposHeaders(request) {
    const headers = new Headers();

    // Copy Authorization from request
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        headers.set('Authorization', authHeader);
    }

    // Set standard TPOS headers
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7');
    headers.set('Content-Type', 'application/json;IEEE754Compatible=false;charset=utf-8');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Pragma', 'no-cache');
    headers.set('Origin', 'https://tomato.tpos.vn');
    headers.set('Referer', 'https://tomato.tpos.vn/');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Dynamic version header
    headers.set('tposappversion', getDynamicHeader('tposappversion'));

    // Security headers
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    return headers;
}

/**
 * Build Pancake request headers
 * @param {string} refererUrl - Referer URL
 * @param {string} jwtToken - JWT token for Cookie (optional)
 * @returns {Headers}
 */
export function buildPancakeHeaders(refererUrl = 'https://pancake.vn/multi_pages', jwtToken = null) {
    const headers = new Headers();

    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', refererUrl);
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Security headers
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    // JWT cookie
    if (jwtToken) {
        headers.set('Cookie', `jwt=${jwtToken}; locale=vi`);
    }

    return headers;
}
