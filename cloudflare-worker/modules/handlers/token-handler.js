/**
 * Token Handler
 * Handles /api/token endpoint - TPOS authentication
 * Caches tokens PER USERNAME to support multiple accounts
 *
 * @module cloudflare-worker/modules/handlers/token-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse } from '../utils/cors-utils.js';
import { getCachedToken, cacheToken } from '../utils/token-cache.js';
import { API_ENDPOINTS } from '../config/endpoints.js';

/**
 * Extract username from request body
 * @param {string} body - URL-encoded form body
 * @returns {string} - Username or '_default'
 */
function extractUsernameFromBody(body) {
    try {
        const params = new URLSearchParams(body);
        const username = params.get('username');
        if (username) {
            return username;
        }
        // For refresh_token grant, use a different key
        const grantType = params.get('grant_type');
        if (grantType === 'refresh_token') {
            return '_refresh_' + (params.get('refresh_token') || '').substring(0, 20);
        }
    } catch (e) {
        console.warn('[TOKEN-HANDLER] Could not parse body for username');
    }
    return '_default';
}

/**
 * Handle POST /api/token
 * Fetches and caches TPOS authentication token
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleTokenRequest(request) {
    // Read body to extract username for cache key
    const bodyBuffer = await request.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);
    const cacheKey = extractUsernameFromBody(bodyText);

    console.log(`[TOKEN-HANDLER] Token request for: "${cacheKey}"`);

    // Check cache first (per username)
    const cachedToken = getCachedToken(cacheKey);
    if (cachedToken) {
        console.log(`[TOKEN-HANDLER] Returning cached token for "${cacheKey}"`);
        return jsonResponse(cachedToken);
    }

    // Cache miss - fetch new token from TPOS
    console.log(`[TOKEN-HANDLER] Cache miss for "${cacheKey}", fetching new token...`);

    try {
        // Build headers
        const headers = new Headers(request.headers);
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');

        // Forward to TPOS token endpoint
        const tposResponse = await fetchWithRetry(
            API_ENDPOINTS.TPOS.TOKEN,
            {
                method: 'POST',
                headers: headers,
                body: bodyBuffer, // Use the already-read buffer
            },
            3, 1000, 10000
        );

        if (!tposResponse.ok) {
            const errorText = await tposResponse.text();
            console.error(`[TOKEN-HANDLER] TPOS error ${tposResponse.status}:`, errorText);
            throw new Error(`TPOS API responded with ${tposResponse.status}: ${tposResponse.statusText}`);
        }

        const tokenData = await tposResponse.json();

        // Validate response
        if (!tokenData.access_token) {
            console.error('[TOKEN-HANDLER] Response missing access_token:', tokenData);
            throw new Error('Invalid token response - missing access_token');
        }

        // Cache the token (per username)
        cacheToken(tokenData, cacheKey);

        console.log(`[TOKEN-HANDLER] New token fetched and cached for "${cacheKey}"`);

        return jsonResponse(tokenData);

    } catch (error) {
        console.error('[TOKEN-HANDLER] Error:', error.message);
        return errorResponse('Failed to fetch token: ' + error.message, 500);
    }
}
