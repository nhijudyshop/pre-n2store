/**
 * CORS Utilities for Cloudflare Worker
 *
 * @module cloudflare-worker/modules/utils/cors-utils
 */

import {
    CORS_HEADERS,
    corsResponse,
    corsPreflightResponse,
    corsErrorResponse,
    corsSuccessResponse,
    addCorsHeaders,
    proxyResponseWithCors
} from '../../../shared/universal/cors-headers.js';

// Re-export all
export {
    CORS_HEADERS,
    corsResponse,
    corsPreflightResponse,
    corsErrorResponse,
    corsSuccessResponse,
    addCorsHeaders,
    proxyResponseWithCors
};

/**
 * Handle CORS preflight request
 * @param {Request} request
 * @returns {Response|null}
 */
export function handleCorsPreflightHandler(request) {
    if (request.method === 'OPTIONS') {
        return corsPreflightResponse();
    }
    return null;
}

/**
 * Create JSON response with CORS headers
 * @param {object} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
        }
    });
}

/**
 * Create error JSON response with CORS headers
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {object} extra - Extra data
 * @returns {Response}
 */
export function errorResponse(message, status = 500, extra = {}) {
    return jsonResponse({
        success: false,
        error: message,
        ...extra
    }, status);
}

/**
 * Create success JSON response with CORS headers
 * @param {any} data - Response data
 * @param {object} extra - Extra data
 * @returns {Response}
 */
export function successResponse(data, extra = {}) {
    return jsonResponse({
        success: true,
        data,
        ...extra
    }, 200);
}
