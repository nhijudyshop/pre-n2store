/**
 * CORS Middleware for Express.js
 * Consistent CORS configuration across all Node.js servers
 *
 * @module shared/node/cors-middleware
 */

import { CORS_HEADERS } from '../universal/cors-headers.js';

/**
 * Default CORS options
 */
export const DEFAULT_CORS_OPTIONS = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'tposappversion',
        'x-tpos-lang',
        'X-Page-Access-Token',
        'X-Auth-Data',
        'X-User-Id'
    ],
    maxAge: 86400, // 24 hours
    credentials: false
};

/**
 * Create CORS middleware for Express
 * @param {object} options - CORS options
 * @returns {Function} Express middleware
 */
export function corsMiddleware(options = {}) {
    const config = { ...DEFAULT_CORS_OPTIONS, ...options };

    return (req, res, next) => {
        // Set CORS headers
        res.header('Access-Control-Allow-Origin', config.origin);
        res.header('Access-Control-Allow-Methods', config.methods.join(', '));
        res.header('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
        res.header('Access-Control-Max-Age', config.maxAge.toString());

        if (config.credentials) {
            res.header('Access-Control-Allow-Credentials', 'true');
        }

        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        next();
    };
}

/**
 * Simple CORS middleware using cors package style
 * @param {object} options - Options
 * @returns {Function} Express middleware
 */
export function simpleCors(options = {}) {
    const origin = options.origin || '*';

    return (req, res, next) => {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }

        next();
    };
}

/**
 * Add CORS headers to response object
 * @param {object} res - Express response object
 * @param {object} options - CORS options
 */
export function setCorsHeaders(res, options = {}) {
    const headers = { ...CORS_HEADERS, ...options };

    Object.entries(headers).forEach(([key, value]) => {
        res.header(key, value);
    });
}

/**
 * Handle CORS preflight request
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @returns {boolean} True if handled preflight
 */
export function handlePreflight(req, res) {
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.status(204).end();
        return true;
    }
    return false;
}

// Default export
export default corsMiddleware;
