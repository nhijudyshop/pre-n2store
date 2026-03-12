/**
 * TPOS Handler
 * Handles TPOS API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/tpos-handler
 */

import { fetchWithRetry, fetchWithTimeout } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse, proxyResponseWithCors, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildTposHeaders, learnFromResponse, getDynamicHeader } from '../utils/header-learner.js';
import { getCachedToken, cacheToken } from '../utils/token-cache.js';
import { API_ENDPOINTS } from '../config/endpoints.js';

/**
 * Handle POST /api/Product/ExportProductV2
 * TPOS Product Excel Export
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleTposExportProductV2(request, url) {
    const queryParams = url.search || '?Active=true';
    const targetUrl = `https://tomato.tpos.vn/Product/ExportProductV2${queryParams}`;

    console.log('[TPOS-EXPORT-PRODUCT-V2] ========================================');
    console.log('[TPOS-EXPORT-PRODUCT-V2] Proxying to TPOS:', targetUrl);

    const tposHeaders = new Headers();
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        tposHeaders.set('Authorization', authHeader);
    }

    tposHeaders.set('Content-Type', 'application/json');
    tposHeaders.set('Referer', 'https://tomato.tpos.vn/');
    tposHeaders.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    try {
        const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'POST',
            headers: tposHeaders,
            body: await request.text(),
        }, 3, 1000, 15000);

        console.log('[TPOS-EXPORT-PRODUCT-V2] Response status:', tposResponse.status);

        return proxyResponseWithCors(tposResponse);

    } catch (error) {
        console.error('[TPOS-EXPORT-PRODUCT-V2] Error:', error.message);
        return errorResponse('Failed to fetch product Excel from TPOS: ' + error.message, 500);
    }
}

/**
 * Handle POST /api/Product/ExportFileWithStandardPriceV2
 * TPOS Standard Price Excel Export
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleTposExportStandardPrice(request, url) {
    const targetUrl = 'https://tomato.tpos.vn/Product/ExportFileWithStandardPriceV2';

    console.log('[TPOS-EXCEL-STANDARD-PRICE] ========================================');
    console.log('[TPOS-EXCEL-STANDARD-PRICE] Proxying to TPOS:', targetUrl);

    const tposHeaders = buildTposHeaders(request);

    try {
        const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'POST',
            headers: tposHeaders,
            body: await request.text(),
        }, 3, 1000, 15000);

        console.log('[TPOS-EXCEL-STANDARD-PRICE] Response status:', tposResponse.status);

        return proxyResponseWithCors(tposResponse);

    } catch (error) {
        console.error('[TPOS-EXCEL-STANDARD-PRICE] Error:', error.message);
        return errorResponse('Failed to fetch standard price Excel from TPOS: ' + error.message, 500);
    }
}

/**
 * Handle /tpos/order/:orderId/lines
 * TPOS Order Lines by Order ID
 * @param {Request} request
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleTposOrderLines(request, pathname) {
    const orderId = pathname.match(/^\/tpos\/order\/(\d+)\/lines$/)?.[1];

    console.log('[TPOS-ORDER-LINES] Fetching OrderLines for order:', orderId);

    try {
        // Get or fetch TPOS token
        let token = getCachedToken()?.access_token;

        if (!token) {
            console.log('[TPOS-ORDER-LINES] No cached token, fetching new one...');
            const tokenResponse = await fetchWithRetry(API_ENDPOINTS.TPOS.TOKEN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'grant_type=password&username=nvkt&password=Aa@123456789&client_id=tmtWebApp',
            }, 3, 1000, 10000);

            if (!tokenResponse.ok) {
                throw new Error('Failed to get TPOS token');
            }

            const tokenData = await tokenResponse.json();
            cacheToken(tokenData);
            token = tokenData.access_token;
        }

        // Fetch OrderLines
        const odataUrl = `${API_ENDPOINTS.TPOS.ODATA}/FastSaleOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account,SaleLine,User`;

        const odataResponse = await fetchWithRetry(odataUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                'tposappversion': getDynamicHeader('tposappversion'),
                'Referer': 'https://tomato.tpos.vn/',
                'Origin': 'https://tomato.tpos.vn'
            },
        }, 3, 1000, 15000);

        if (!odataResponse.ok) {
            throw new Error(`TPOS API error: ${odataResponse.status}`);
        }

        learnFromResponse(odataResponse);

        const odataResult = await odataResponse.json();

        return jsonResponse({
            success: true,
            data: odataResult.value || []
        });

    } catch (error) {
        console.error('[TPOS-ORDER-LINES] Error:', error);
        return errorResponse(error.message, 500);
    }
}

/**
 * Handle /tpos/order-ref/:ref/lines
 * TPOS Order Lines by Reference Number
 * @param {Request} request
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleTposOrderLinesByRef(request, pathname) {
    const refMatch = pathname.match(/^\/tpos\/order-ref\/(.+)\/lines$/);
    const orderRef = refMatch ? decodeURIComponent(refMatch[1]) : null;

    console.log('[TPOS-ORDER-REF] Searching OrderLines for reference:', orderRef);

    if (!orderRef) {
        return errorResponse('Invalid order reference', 400);
    }

    try {
        // Get token
        let token = getCachedToken()?.access_token;

        if (!token) {
            const tokenResponse = await fetchWithRetry(API_ENDPOINTS.TPOS.TOKEN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'grant_type=password&username=nvkt&password=Aa@123456789&client_id=tmtWebApp',
            }, 3, 1000, 10000);

            if (!tokenResponse.ok) {
                throw new Error('Failed to get TPOS token');
            }

            const tokenData = await tokenResponse.json();
            cacheToken(tokenData);
            token = tokenData.access_token;
        }

        // Search for order by reference
        const encodedRef = encodeURIComponent(orderRef);
        const searchUrl = `${API_ENDPOINTS.TPOS.ODATA}/FastSaleOrder/ODataService.GetView?$top=1&$filter=contains(Number,'${encodedRef}')&$select=Id,Number`;

        console.log('[TPOS-ORDER-REF] Search URL:', searchUrl);

        const searchResponse = await fetchWithRetry(searchUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Authorization': `Bearer ${token}`,
                'tposappversion': getDynamicHeader('tposappversion'),
                'Referer': 'https://tomato.tpos.vn/',
            },
        }, 3, 1000, 15000);

        if (!searchResponse.ok) {
            throw new Error(`TPOS search API error: ${searchResponse.status}`);
        }

        learnFromResponse(searchResponse);

        const searchResult = await searchResponse.json();

        if (!searchResult.value || searchResult.value.length === 0) {
            return jsonResponse({
                success: false,
                error: 'Order not found',
                reference: orderRef
            }, 404);
        }

        const orderId = searchResult.value[0].Id;
        console.log('[TPOS-ORDER-REF] Found order ID:', orderId);

        // Fetch OrderLines
        const odataUrl = `${API_ENDPOINTS.TPOS.ODATA}/FastSaleOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account,SaleLine,User`;

        const odataResponse = await fetchWithRetry(odataUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                'tposappversion': getDynamicHeader('tposappversion'),
                'Referer': 'https://tomato.tpos.vn/',
            },
        }, 3, 1000, 15000);

        if (!odataResponse.ok) {
            throw new Error(`TPOS OrderLines API error: ${odataResponse.status}`);
        }

        learnFromResponse(odataResponse);

        const odataResult = await odataResponse.json();

        return jsonResponse({
            success: true,
            orderId: orderId,
            reference: orderRef,
            data: odataResult.value || []
        });

    } catch (error) {
        console.error('[TPOS-ORDER-REF] Error:', error);
        return errorResponse(error.message, 500);
    }
}

/**
 * Handle /api/rest/*
 * TPOS REST API v2.0
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleTposRest(request, url, pathname) {
    const restPath = pathname.replace(/^\/api\/rest\//, '');
    const targetUrl = `https://tomato.tpos.vn/rest/${restPath}${url.search}`;

    console.log('[TPOS-REST-API] Forwarding to:', targetUrl);

    const tposHeaders = buildTposHeaders(request);

    try {
        const restResponse = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: tposHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[TPOS-REST-API] Response status:', restResponse.status);

        learnFromResponse(restResponse);

        return proxyResponseWithCors(restResponse);

    } catch (error) {
        console.error('[TPOS-REST-API] Error:', error.message);
        return errorResponse('TPOS REST API failed: ' + error.message, 500);
    }
}

/**
 * Handle generic TPOS API (catch-all)
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleTposGeneric(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\//, '');
    const targetUrl = `https://tomato.tpos.vn/${apiPath}${url.search}`;

    console.log('[TPOS] Forwarding to:', targetUrl);

    // Build headers
    const headers = new Headers(request.headers);
    headers.set('Origin', 'https://tomato.tpos.vn/');
    headers.set('Referer', 'https://tomato.tpos.vn/');

    const body = request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : null;

    try {
        let response;

        if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
            // Non-idempotent methods: NO retry, longer timeout (60s)
            // Retrying POST creates duplicate data (e.g. FastPurchaseOrder)
            response = await fetchWithTimeout(targetUrl, {
                method: request.method,
                headers: headers,
                body: body,
            }, 60000);
        } else {
            // GET/DELETE: safe to retry with standard timeout
            response = await fetchWithRetry(targetUrl, {
                method: request.method,
                headers: headers,
                body: body,
            }, 3, 1000, 15000);
        }

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[TPOS] Error:', error.message);
        return errorResponse('TPOS API failed: ' + error.message, 500);
    }
}
