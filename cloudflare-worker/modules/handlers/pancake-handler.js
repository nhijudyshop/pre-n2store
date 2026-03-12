/**
 * Pancake Handler
 * Handles Pancake API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/pancake-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { errorResponse, proxyResponseWithCors, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildPancakeHeaders } from '../utils/header-learner.js';

/**
 * Handle /api/pancake-direct/*
 * Pancake Direct API with custom Referer and JWT cookie
 * Used for 24h policy bypass
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeDirect(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-direct\//, '');
    const pageId = url.searchParams.get('page_id');
    const jwtToken = url.searchParams.get('jwt');

    // Remove custom params from forwarding
    const forwardParams = new URLSearchParams(url.search);
    forwardParams.delete('page_id');
    forwardParams.delete('jwt');
    const forwardSearch = forwardParams.toString() ? `?${forwardParams.toString()}` : '';

    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${forwardSearch}`;

    console.log('[PANCAKE-DIRECT] Target URL:', targetUrl);
    console.log('[PANCAKE-DIRECT] Page ID:', pageId);

    // Determine Referer based on pageId
    let refererUrl = 'https://pancake.vn/multi_pages';
    if (pageId === '117267091364524') {
        refererUrl = 'https://pancake.vn/NhiJudyHouse.VietNam';
    } else if (pageId === '270136663390370') {
        refererUrl = 'https://pancake.vn/NhiJudyStore';
    }

    console.log('[PANCAKE-DIRECT] Referer:', refererUrl);

    // Build headers
    const headers = buildPancakeHeaders(refererUrl, jwtToken);

    // Set Content-Type from original request
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[PANCAKE-DIRECT] Response status:', response.status);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE-DIRECT] Error:', error.message);
        return errorResponse('Pancake direct API failed: ' + error.message, 500);
    }
}

/**
 * Handle /api/pancake-official/*
 * Pancake Official API (pages.fm Public API)
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeOfficial(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-official\//, '');
    const targetUrl = `https://pages.fm/api/public_api/v1/${apiPath}${url.search}`;

    console.log('[PANCAKE-OFFICIAL] Target URL:', targetUrl);

    // Build headers for pages.fm
    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
    headers.set('Origin', 'https://pages.fm');
    headers.set('Referer', 'https://pages.fm/');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[PANCAKE-OFFICIAL] Response status:', response.status);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE-OFFICIAL] Error:', error.message);
        return errorResponse('Pancake Official API failed: ' + error.message, 500);
    }
}

/**
 * Handle /api/pancake/*
 * Generic Pancake API proxy
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeGeneric(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake\//, '');
    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;

    console.log('[PANCAKE] Target URL:', targetUrl);

    // Build headers
    const headers = new Headers();
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', 'https://pancake.vn/multi_pages');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE] Error:', error.message);
        return errorResponse('Pancake API failed: ' + error.message, 500);
    }
}
