// =====================================================
// CLOUDFLARE BACKUP ROUTES
// These routes replicate Cloudflare Worker endpoints
// for fallback when Cloudflare is unavailable
// =====================================================

const express = require('express');
const router = express.Router();

// Dynamic header manager for centralized tposappversion
const { getDynamicHeaderManager } = require('../helpers/dynamic-header-manager');
const dynamicHeaders = getDynamicHeaderManager();

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
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
// FACEBOOK/PANCAKE AVATAR PROXY
// GET /api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>
// =====================================================
router.get('/fb-avatar', async (req, res) => {
    const { id: fbId, page: pageId = '270136663390370', token: accessToken } = req.query;

    if (!fbId) {
        return res.status(400).json({
            error: 'Missing id parameter',
            usage: '/api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>'
        });
    }

    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`;

    try {
        // Try Pancake Avatar API first
        let pancakeUrl = `https://pancake.vn/api/v1/pages/${pageId}/avatar/${fbId}`;
        if (accessToken) {
            pancakeUrl += `?access_token=${accessToken}`;
        }

        console.log('[FB-AVATAR] Fetching from Pancake:', pancakeUrl);

        const pancakeRes = await fetchWithTimeout(pancakeUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://pancake.vn/'
            },
            redirect: 'follow'
        });

        if (pancakeRes.ok) {
            const contentType = pancakeRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await pancakeRes.arrayBuffer();

            res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });
            return res.send(Buffer.from(buffer));
        }

        // Fallback to Facebook Graph API
        console.log('[FB-AVATAR] Pancake failed, trying Facebook...');
        const fbUrl = `https://graph.facebook.com/${fbId}/picture?width=80&height=80&type=normal`;
        const fbRes = await fetchWithTimeout(fbUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*'
            },
            redirect: 'follow'
        });

        if (fbRes.ok) {
            const contentType = fbRes.headers.get('content-type') || 'image/jpeg';
            const buffer = await fbRes.arrayBuffer();

            res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });
            return res.send(Buffer.from(buffer));
        }

        // Return default SVG
        res.set({
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });
        return res.send(defaultSvg);

    } catch (error) {
        console.error('[FB-AVATAR] Error:', error.message);
        res.set({
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });
        return res.send(defaultSvg);
    }
});

// =====================================================
// PANCAKE AVATAR PROXY
// GET /api/pancake-avatar?hash=<avatar_hash>
// =====================================================
router.get('/pancake-avatar', async (req, res) => {
    const { hash: avatarHash } = req.query;

    if (!avatarHash) {
        return res.status(400).json({
            error: 'Missing hash parameter',
            usage: '/api/pancake-avatar?hash=<avatar_hash>'
        });
    }

    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`;

    try {
        const pancakeUrl = `https://content.pancake.vn/2.1-24/avatars/${avatarHash}`;
        console.log('[PANCAKE-AVATAR] Fetching:', pancakeUrl);

        const response = await fetchWithTimeout(pancakeUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://pancake.vn/'
            }
        });

        if (response.ok) {
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const buffer = await response.arrayBuffer();

            res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });
            return res.send(Buffer.from(buffer));
        }

        // Return default SVG
        res.set({
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });
        return res.send(defaultSvg);

    } catch (error) {
        console.error('[PANCAKE-AVATAR] Error:', error.message);
        res.set({
            'Content-Type': 'image/svg+xml',
            'Access-Control-Allow-Origin': '*'
        });
        return res.send(defaultSvg);
    }
});

// =====================================================
// GENERIC PROXY ENDPOINT
// GET/POST /api/proxy?url=<encoded_url>&headers=<json_headers>
// =====================================================
router.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({
            error: 'Missing url parameter',
            usage: '/api/proxy?url=<encoded_url>'
        });
    }

    console.log('[PROXY] Forwarding to:', targetUrl);

    try {
        // Build headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*'
        };

        // Preserve Content-Type
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'];
        }

        // Parse custom headers from query param
        if (req.query.headers) {
            try {
                const customHeaders = JSON.parse(req.query.headers);
                Object.assign(headers, customHeaders);
            } catch (e) {
                console.error('[PROXY] Failed to parse custom headers:', e);
            }
        }

        const fetchOptions = {
            method: req.method,
            headers: headers
        };

        // Add body for non-GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetchWithTimeout(targetUrl, fetchOptions);
        const contentType = response.headers.get('content-type') || 'application/json';

        // Get response body
        let body;
        if (contentType.includes('json')) {
            body = await response.json();
        } else {
            body = await response.text();
        }

        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang'
        });

        return res.status(response.status).send(body);

    } catch (error) {
        console.error('[PROXY] Error:', error.message);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.name || 'ProxyError',
            message: error.message
        });
    }
});

// =====================================================
// PANCAKE DIRECT API (24h policy bypass)
// ALL /api/pancake-direct/*
// =====================================================
router.all('/pancake-direct/*', async (req, res) => {
    const apiPath = req.params[0]; // Everything after /pancake-direct/
    const { page_id: pageId, jwt: jwtToken, ...otherParams } = req.query;

    // Build query string without our custom params
    const forwardParams = new URLSearchParams(otherParams);
    const queryString = forwardParams.toString() ? `?${forwardParams.toString()}` : '';

    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${queryString}`;

    console.log('[PANCAKE-DIRECT] Target URL:', targetUrl);
    console.log('[PANCAKE-DIRECT] Page ID:', pageId);

    // Determine Referer based on pageId
    let refererUrl = 'https://pancake.vn/multi_pages';
    if (pageId === '117267091364524') {
        refererUrl = 'https://pancake.vn/NhiJudyHouse.VietNam';
    } else if (pageId === '270136663390370') {
        refererUrl = 'https://pancake.vn/NhiJudyStore';
    }

    // Build headers
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Origin': 'https://pancake.vn',
        'Referer': refererUrl,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
    };

    // Set Content-Type
    if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
    }

    // Set Cookie with JWT
    if (jwtToken) {
        headers['Cookie'] = `jwt=${jwtToken}; locale=vi`;
    }

    try {
        const fetchOptions = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetchWithTimeout(targetUrl, fetchOptions);
        const data = await response.json();

        console.log('[PANCAKE-DIRECT] Response status:', response.status);

        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
        });

        return res.status(response.status).json(data);

    } catch (error) {
        console.error('[PANCAKE-DIRECT] Error:', error.message);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.name || 'PancakeDirectError',
            message: error.message
        });
    }
});

// =====================================================
// PANCAKE OFFICIAL API (pages.fm Public API)
// ALL /api/pancake-official/*
// =====================================================
router.all('/pancake-official/*', async (req, res) => {
    const apiPath = req.params[0];
    const queryString = req.originalUrl.split('?')[1] || '';

    const targetUrl = `https://pages.fm/api/public_api/v1/${apiPath}${queryString ? '?' + queryString : ''}`;

    console.log('[PANCAKE-OFFICIAL] Target URL:', targetUrl);

    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Origin': 'https://pages.fm',
        'Referer': 'https://pages.fm/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    };

    if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
    }

    try {
        const fetchOptions = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetchWithTimeout(targetUrl, fetchOptions);
        const data = await response.json();

        console.log('[PANCAKE-OFFICIAL] Response status:', response.status);

        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
        });

        return res.status(response.status).json(data);

    } catch (error) {
        console.error('[PANCAKE-OFFICIAL] Error:', error.message);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.name || 'PancakeOfficialError',
            message: error.message
        });
    }
});

// =====================================================
// FACEBOOK GRAPH API - SEND MESSAGE WITH TAG
// POST /api/facebook-send
// Body: { pageId, psid, message, pageToken, useTag: true, imageUrls: [] }
// =====================================================
router.post('/facebook-send', async (req, res) => {
    console.log('[FACEBOOK-SEND] ========================================');
    console.log('[FACEBOOK-SEND] Received request to send message via Facebook Graph API');

    const { pageId, psid, message, pageToken, useTag, imageUrls = [] } = req.body;

    // Validate required fields
    if (!pageId || !psid || !pageToken) {
        console.error('[FACEBOOK-SEND] Missing required fields');
        return res.status(400).json({
            success: false,
            error: 'Missing required fields',
            required: ['pageId', 'psid', 'pageToken'],
            usage: 'POST /api/facebook-send with JSON body { pageId, psid, message, pageToken, useTag: true, imageUrls: [] }'
        });
    }

    const graphApiUrl = `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageToken}`;
    const messageIds = [];
    let lastResult = null;

    try {
        // Send images first
        for (const imageUrl of imageUrls) {
            const imageFbBody = {
                recipient: { id: psid },
                message: {
                    attachment: {
                        type: 'image',
                        payload: {
                            url: imageUrl,
                            is_reusable: true
                        }
                    }
                }
            };

            if (useTag) {
                imageFbBody.messaging_type = 'MESSAGE_TAG';
                imageFbBody.tag = 'POST_PURCHASE_UPDATE';
            } else {
                imageFbBody.messaging_type = 'RESPONSE';
            }

            console.log('[FACEBOOK-SEND] Sending image:', imageUrl);

            const imageResponse = await fetchWithTimeout(graphApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(imageFbBody)
            });

            const imageResult = await imageResponse.json();
            console.log('[FACEBOOK-SEND] Image response:', JSON.stringify(imageResult));

            if (imageResult.error) {
                return res.status(imageResponse.status).json({
                    success: false,
                    error: imageResult.error.message || 'Failed to send image',
                    error_code: imageResult.error.code,
                    error_subcode: imageResult.error.error_subcode
                });
            }

            messageIds.push(imageResult.message_id);
            lastResult = imageResult;
        }

        // Send text message
        if (message && message.trim()) {
            const textFbBody = {
                recipient: { id: psid },
                message: { text: message }
            };

            if (useTag) {
                textFbBody.messaging_type = 'MESSAGE_TAG';
                textFbBody.tag = 'POST_PURCHASE_UPDATE';
                console.log('[FACEBOOK-SEND] Using MESSAGE_TAG with POST_PURCHASE_UPDATE');
            } else {
                textFbBody.messaging_type = 'RESPONSE';
            }

            const textResponse = await fetchWithTimeout(graphApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(textFbBody)
            });

            const textResult = await textResponse.json();
            console.log('[FACEBOOK-SEND] Text response:', JSON.stringify(textResult));

            if (textResult.error) {
                return res.status(textResponse.status).json({
                    success: false,
                    error: textResult.error.message || 'Failed to send text',
                    error_code: textResult.error.code,
                    error_subcode: textResult.error.error_subcode
                });
            }

            messageIds.push(textResult.message_id);
            lastResult = textResult;
        }

        console.log('[FACEBOOK-SEND] All messages sent successfully!');
        console.log('[FACEBOOK-SEND] ========================================');

        return res.json({
            success: true,
            recipient_id: lastResult?.recipient_id,
            message_id: lastResult?.message_id,
            message_ids: messageIds,
            used_tag: useTag ? 'POST_PURCHASE_UPDATE' : null
        });

    } catch (error) {
        console.error('[FACEBOOK-SEND] Error:', error.message);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.name || 'FacebookSendError',
            message: error.message
        });
    }
});

// =====================================================
// TPOS REST API v2.0 (Live Comments, etc.)
// ALL /api/rest/*
// =====================================================
router.all('/rest/*', async (req, res) => {
    const restPath = req.params[0];
    const queryString = req.originalUrl.split('?')[1] || '';

    const targetUrl = `https://tomato.tpos.vn/rest/${restPath}${queryString ? '?' + queryString : ''}`;

    console.log('[TPOS-REST-API] Forwarding to:', targetUrl);

    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
        'tposappversion': dynamicHeaders.getHeader('tposappversion'),
        'Origin': 'https://tomato.tpos.vn',
        'Referer': 'https://tomato.tpos.vn/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
    };

    // Forward Authorization header
    if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
    }

    try {
        const fetchOptions = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetchWithTimeout(targetUrl, fetchOptions);

        console.log('[TPOS-REST-API] Response status:', response.status);

        const contentType = response.headers.get('content-type') || 'application/json';
        let body;

        if (contentType.includes('json')) {
            body = await response.json();
        } else {
            body = await response.text();
        }

        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang'
        });

        return res.status(response.status).send(body);

    } catch (error) {
        console.error('[TPOS-REST-API] Error:', error.message);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: error.name || 'TposRestApiError',
            message: error.message
        });
    }
});

module.exports = router;
