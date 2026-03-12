/**
 * CORS Headers Utilities
 * Standard CORS configuration for all services
 *
 * @module shared/universal/cors-headers
 */

/**
 * Standard CORS headers used across all services
 */
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang, feature-version, X-Page-Access-Token, X-Auth-Data, X-User-Id',
    'Access-Control-Max-Age': '86400',
};

/**
 * CORS headers for browser fetch responses
 */
export const CORS_HEADERS_SIMPLE = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

/**
 * Create a Response with CORS headers (for Cloudflare Workers / Service Workers)
 * @param {any} body - Response body (will be JSON stringified if object)
 * @param {number} status - HTTP status code
 * @param {object} extraHeaders - Additional headers to include
 * @returns {Response}
 */
export function corsResponse(body, status = 200, extraHeaders = {}) {
    const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;

    return new Response(bodyString, {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            ...extraHeaders,
        },
    });
}

/**
 * Create a CORS preflight response (for OPTIONS requests)
 * @returns {Response}
 */
export function corsPreflightResponse() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

/**
 * Create an error response with CORS headers
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 500)
 * @param {object} extraData - Additional data to include
 * @returns {Response}
 */
export function corsErrorResponse(message, status = 500, extraData = {}) {
    return corsResponse({
        success: false,
        error: message,
        ...extraData,
    }, status);
}

/**
 * Create a success response with CORS headers
 * @param {any} data - Response data
 * @param {object} extraData - Additional data to include
 * @returns {Response}
 */
export function corsSuccessResponse(data, extraData = {}) {
    return corsResponse({
        success: true,
        data,
        ...extraData,
    }, 200);
}

/**
 * Add CORS headers to an existing Response
 * @param {Response} response - Original response
 * @returns {Response} New response with CORS headers
 */
export function addCorsHeaders(response) {
    const newResponse = new Response(response.body, response);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
    });
    return newResponse;
}

/**
 * Clone response and add CORS headers (for proxying)
 * @param {Response} response - Original response from upstream
 * @returns {Response} New response with CORS headers added
 */
export function proxyResponseWithCors(response) {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang, feature-version');
    return newResponse;
}
