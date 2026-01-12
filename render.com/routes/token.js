// =====================================================
// TOKEN ROUTE - /api/token
// Proxy to TPOS OAuth token endpoint with server-side caching
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

// Dynamic header manager for centralized tposappversion
const { getDynamicHeaderManager } = require('../helpers/dynamic-header-manager');
const dynamicHeaders = getDynamicHeaderManager();

const TPOS_TOKEN_URL = 'https://tomato.tpos.vn/token';

// Create HTTPS agent that ignores SSL certificate errors
// TPOS uses self-signed certificate
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function fetchWithTimeout(url, options = {}, timeout = 10000) { // 10 second timeout for token
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

// =====================================================
// TPOS TOKEN CACHE (In-memory)
// =====================================================
const tokenCache = {
    access_token: null,
    expiry: null,
    expires_in: null,
    token_type: null,
    refresh_token: null
};

/**
 * Check if cached token is still valid
 * @returns {boolean}
 */
function isCachedTokenValid() {
    if (!tokenCache.access_token || !tokenCache.expiry) {
        return false;
    }

    // Add 5-minute buffer before expiry
    const buffer = 5 * 60 * 1000;
    const now = Date.now();

    return now < (tokenCache.expiry - buffer);
}

/**
 * Cache token data
 * @param {object} tokenData - Token response from TPOS
 */
function cacheToken(tokenData) {
    const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

    tokenCache.access_token = tokenData.access_token;
    tokenCache.expiry = expiryTimestamp;
    tokenCache.expires_in = tokenData.expires_in;
    tokenCache.token_type = tokenData.token_type || 'Bearer';
    tokenCache.refresh_token = tokenData.refresh_token || null;

    console.log('[RENDER-TOKEN] ✅ Token cached, expires at:', new Date(expiryTimestamp).toISOString());
    console.log('[RENDER-TOKEN] Token lifetime:', Math.floor(tokenData.expires_in / 3600), 'hours');
}

/**
 * Get cached token if valid
 * @returns {object|null}
 */
function getCachedToken() {
    if (isCachedTokenValid()) {
        const remainingSeconds = Math.floor((tokenCache.expiry - Date.now()) / 1000);
        console.log('[RENDER-TOKEN] ✅ Using cached token, expires in:', Math.floor(remainingSeconds / 60), 'minutes');
        return {
            access_token: tokenCache.access_token,
            expires_in: remainingSeconds,
            token_type: tokenCache.token_type,
            refresh_token: tokenCache.refresh_token
        };
    }
    return null;
}

// POST /api/token - Get OAuth token with caching
router.post('/', async (req, res) => {
    try {
        // Check cache first
        const cachedToken = getCachedToken();
        if (cachedToken) {
            console.log('[RENDER-TOKEN] 🚀 Returning cached token');
            return res.json(cachedToken);
        }

        // Cache miss - fetch new token from TPOS
        console.log('[RENDER-TOKEN] 🔄 Cache miss, fetching new token from TPOS...');

        // Get credentials from request body
        const { grant_type, username, password, client_id } = req.body;

        // Validate required fields
        if (!grant_type || !username || !password || !client_id) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['grant_type', 'username', 'password', 'client_id']
            });
        }

        // Create form data (URL-encoded format)
        const formBody = `grant_type=${encodeURIComponent(grant_type)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&client_id=${encodeURIComponent(client_id)}`;

        // Request token from TPOS
        const response = await fetchWithTimeout(TPOS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=UTF-8',
                'tposappversion': dynamicHeaders.getHeader('tposappversion'),
                'x-tpos-lang': 'vi',
                'Referer': 'https://tomato.tpos.vn/'
            },
            body: formBody,
            agent: httpsAgent  // Use agent that ignores SSL errors
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TOKEN] ❌ TPOS error ${response.status}:`, errorText);
            throw new Error(`TPOS API responded with ${response.status}: ${response.statusText}. Details: ${errorText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const rawText = await response.text();
            throw new Error(`Invalid JSON response from TPOS token endpoint. Original error: ${parseError.message}. Raw response: ${rawText}`);
        }

        // Validate response contains access_token
        if (!data.access_token || !data.expires_in || !data.token_type) {
            console.error('[RENDER-TOKEN] ❌ Response missing access_token or expiry:', data);
            throw new Error('Invalid token response - missing access_token, expires_in, or token_type');
        }

        console.log('[RENDER-TOKEN] ✅ Token obtained successfully');
        console.log('[RENDER-TOKEN] Token expires in:', data.expires_in, 'seconds');
        console.log('[RENDER-TOKEN] Token type:', data.token_type);

        // Cache the token
        cacheToken(data);

        // Return token data (includes access_token, expires_in, refresh_token, etc.)
        res.json(data);

    } catch (error) {
        console.error('[TOKEN] ❌ Error:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.name || 'TokenError',
            message: error.message
        });
    }
});

module.exports = router;
