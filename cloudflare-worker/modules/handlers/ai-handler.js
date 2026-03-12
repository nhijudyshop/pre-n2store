/**
 * AI Handler
 * Handles AI-related API endpoints (DeepSeek, OCR)
 *
 * @module cloudflare-worker/modules/handlers/ai-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';

/**
 * Handle POST /api/deepseek
 * DeepSeek AI API proxy
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleDeepSeek(request, url) {
    console.log('[DEEPSEEK] Received request to proxy DeepSeek API');

    try {
        // Get API key from header or body
        let apiKey = request.headers.get('Authorization');
        const body = await request.json();

        // Allow API key in body as fallback
        if (!apiKey && body.api_key) {
            apiKey = `Bearer ${body.api_key}`;
            delete body.api_key;
        }

        if (!apiKey) {
            return errorResponse('Missing Authorization header', 401, {
                usage: 'POST /api/deepseek with Authorization: Bearer <api_key>'
            });
        }

        console.log('[DEEPSEEK] Model:', body.model || 'deepseek-chat');

        // Forward to DeepSeek API
        const deepseekResponse = await fetchWithRetry(
            'https://api.deepseek.com/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': apiKey,
                    'Accept': 'application/json',
                },
                body: JSON.stringify(body),
            },
            3, 1000, 20000 // Higher timeout for AI API
        );

        const result = await deepseekResponse.json();
        console.log('[DEEPSEEK] Response status:', deepseekResponse.status);

        return jsonResponse(result, deepseekResponse.status);

    } catch (error) {
        console.error('[DEEPSEEK] Error:', error.message);
        return errorResponse('DeepSeek proxy failed: ' + error.message, 500);
    }
}

/**
 * Handle POST /api/deepseek-ocr
 * DeepSeek OCR via alphaXiv proxy
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleDeepSeekOcr(request, url) {
    console.log('[DEEPSEEK-OCR] ========================================');
    console.log('[DEEPSEEK-OCR] Received request for DeepSeek-OCR via alphaXiv');

    try {
        // Get the form data from the request
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return errorResponse('Missing file', 400, {
                usage: 'POST /api/deepseek-ocr with FormData containing "file" field'
            });
        }

        console.log('[DEEPSEEK-OCR] File name:', file.name || 'unnamed');
        console.log('[DEEPSEEK-OCR] File size:', file.size, 'bytes');
        console.log('[DEEPSEEK-OCR] File type:', file.type);

        // Create new FormData to forward to alphaXiv
        const forwardFormData = new FormData();
        forwardFormData.append('file', file);

        // Forward to alphaXiv DeepSeek-OCR API
        const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const ocrResponse = await fetchWithRetry(
            `https://alphaxiv--deepseek-ocr-modal-serve.modal.run/run/image?_r=${requestId}`,
            {
                method: 'POST',
                headers: {
                    'cache-control': 'no-cache, no-store',
                    'pragma': 'no-cache',
                    'x-request-id': requestId,
                    'Referer': 'https://alphaxiv.github.io/',
                },
                body: forwardFormData,
            },
            3, 1000, 30000 // OCR can be slow, 30s timeout
        );

        console.log('[DEEPSEEK-OCR] alphaXiv response status:', ocrResponse.status);

        // Get the response
        const result = await ocrResponse.text();
        let parsedResult;

        try {
            parsedResult = JSON.parse(result);
        } catch {
            // If not JSON, wrap the text result
            parsedResult = { text: result, raw: true };
        }

        console.log('[DEEPSEEK-OCR] ========================================');

        return jsonResponse(parsedResult, ocrResponse.status);

    } catch (error) {
        console.error('[DEEPSEEK-OCR] Error:', error.message);
        return errorResponse('DeepSeek-OCR proxy failed: ' + error.message, 500);
    }
}
