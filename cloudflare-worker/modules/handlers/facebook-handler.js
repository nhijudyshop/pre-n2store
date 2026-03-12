/**
 * Facebook Handler
 * Handles Facebook Graph API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/facebook-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildTposHeaders, learnFromResponse } from '../utils/header-learner.js';
import { API_ENDPOINTS } from '../config/endpoints.js';

/**
 * Handle POST /api/facebook-send
 * Sends messages via Facebook Graph API with MESSAGE_TAG support
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleFacebookSend(request, url) {
    console.log('[FACEBOOK-SEND] ========================================');
    console.log('[FACEBOOK-SEND] Received request to send message via Facebook Graph API');

    try {
        const body = await request.json();
        let { pageId, psid, message, pageToken, useTag, imageUrls, recipient, postId, customerName, commentId } = body;

        // Fallback: Get token from header if not in body
        if (!pageToken) {
            pageToken = request.headers.get('X-Page-Access-Token');
        }

        // === DIRECT PRIVATE REPLY MODE ===
        // If commentId is provided, skip Send API and go straight to Private Reply
        if (commentId && message && pageToken) {
            console.log('[FACEBOOK-SEND] Direct Private Reply mode → commentId:', commentId);
            const messageText = typeof message === 'string' ? message : message.text;
            const prUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${commentId}/private_replies`;
            try {
                const resp = await fetchWithRetry(
                    `${prUrl}?access_token=${pageToken}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ message: messageText }),
                    },
                    2, 1000, 15000
                );
                const result = await resp.json();

                if (result.error) {
                    console.error('[FACEBOOK-SEND] Private Reply error:', result.error.message);
                    return jsonResponse({
                        success: false,
                        error: result.error.message,
                        error_code: result.error.code,
                        error_subcode: result.error.error_subcode,
                        method: 'private_reply',
                    }, resp.status || 400);
                }

                console.log('[FACEBOOK-SEND] ✅ Direct Private Reply succeeded!');
                return jsonResponse({
                    success: true,
                    recipient_id: result.recipient_id,
                    message_id: result.id,
                    method: 'private_reply',
                    comment_id: commentId,
                });
            } catch (err) {
                return errorResponse('Private Reply error: ' + err.message, 500);
            }
        }

        // Validate required fields
        if (!pageId || (!psid && !recipient) || !pageToken) {
            console.error('[FACEBOOK-SEND] Missing required fields');
            return errorResponse('Missing required fields', 400, {
                required: ['pageId', 'psid OR recipient', 'pageToken'],
                usage: 'POST /api/facebook-send with JSON body { pageId, psid, message, pageToken }'
            });
        }

        const graphApiUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/messages`;
        console.log('[FACEBOOK-SEND] Graph API URL:', graphApiUrl);
        if (postId) console.log('[FACEBOOK-SEND] Post ID for Private Reply fallback:', postId);

        // Tag priority: HUMAN_AGENT → CUSTOMER_FEEDBACK
        const TAG_SEQUENCE = ['HUMAN_AGENT', 'CUSTOMER_FEEDBACK'];

        const messageIds = [];
        let lastResult = null;
        let usedTag = null;
        let sendFailed551 = false;
        let lastError = null;

        // Helper: send a single request to Facebook Graph API
        async function sendToGraph(fbBody) {
            const resp = await fetchWithRetry(
                `${graphApiUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(fbBody),
                },
                3, 1000, 15000
            );
            return { response: resp, result: await resp.json() };
        }

        // Helper: send with tag fallback (HUMAN_AGENT → CUSTOMER_FEEDBACK)
        async function sendWithTagFallback(baseFbBody) {
            if (!useTag) {
                if (!baseFbBody.recipient?.comment_id) {
                    baseFbBody.messaging_type = 'RESPONSE';
                }
                const { response, result } = await sendToGraph(baseFbBody);
                if (result.error) return { success: false, result, status: response.status };
                return { success: true, result, tag: null };
            }

            for (const tag of TAG_SEQUENCE) {
                const body = { ...baseFbBody, messaging_type: 'MESSAGE_TAG', tag };
                console.log(`[FACEBOOK-SEND] Trying tag: ${tag}`);

                const { response, result } = await sendToGraph(body);
                console.log(`[FACEBOOK-SEND] ${tag} response:`, JSON.stringify(result));

                if (!result.error) {
                    console.log(`[FACEBOOK-SEND] ✅ Success with tag: ${tag}`);
                    return { success: true, result, tag };
                }

                // Track 551 error (no inbox conversation)
                if (result.error.code === 551) {
                    sendFailed551 = true;
                }
                lastError = result.error;

                console.warn(`[FACEBOOK-SEND] ⚠️ ${tag} failed (${result.error.code}): ${result.error.message}`);
            }

            // All tags failed
            return { success: false, result: { error: lastError }, status: 400 };
        }

        // Helper: Search comments on a single post/video for the customer
        async function searchCommentsOnObject(objectId, customerAsid, customerName, filter, diagnostics) {
            const graphUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${objectId}/comments`;
            const params = new URLSearchParams({
                access_token: pageToken,
                fields: 'from{id,name},id,message,created_time',
                limit: '200',
                order: 'reverse_chronological'
            });
            if (filter) params.set('filter', filter);

            const queryKey = `${objectId}/comments?filter=${filter || 'default'}`;

            try {
                const resp = await fetchWithRetry(
                    `${graphUrl}?${params.toString()}`,
                    { method: 'GET', headers: { 'Accept': 'application/json' } },
                    2, 1000, 15000
                );
                const data = await resp.json();

                if (data.error) {
                    diagnostics.queries.push({ query: queryKey, error: data.error.message });
                    return null;
                }

                const comments = data.data || [];
                diagnostics.queries.push({ query: queryKey, count: comments.length });
                console.log(`[PRIVATE-REPLY] ${queryKey} → ${comments.length} comments`);

                if (comments.length === 0) return null;

                // Collect commenters for diagnostics
                const uniqueCommenters = [...new Map(
                    comments.filter(c => c.from).map(c => [c.from.id, { id: c.from.id, name: c.from.name }])
                ).values()];
                diagnostics.commentersFound = uniqueCommenters.slice(0, 20);

                // Match by ID
                let match = comments.find(c => c.from && String(c.from.id) === String(customerAsid));
                if (match) {
                    console.log(`[PRIVATE-REPLY] ✅ ID match: ${match.id} (${match.from.name})`);
                    return { commentId: match.id, matchedBy: 'id', on: objectId };
                }

                // Match by name
                if (customerName) {
                    const norm = customerName.trim().toLowerCase();
                    match = comments.find(c => c.from?.name?.trim().toLowerCase() === norm);
                    if (match) {
                        console.log(`[PRIVATE-REPLY] ✅ Name match: ${match.id} (${match.from.name}, from.id=${match.from.id})`);
                        return { commentId: match.id, matchedBy: 'name', on: objectId };
                    }
                }

                return null;
            } catch (err) {
                diagnostics.queries.push({ query: queryKey, error: err.message });
                return null;
            }
        }

        // Helper: Find real Facebook comment ID
        // Step 1: Try stored postId directly
        // Step 2: If postId is invalid, search page's live_videos and feed
        async function findRealCommentId(fbPostId, customerAsid, customerName) {
            const diagnostics = {
                postId: fbPostId, psid: customerAsid,
                customerName: customerName || null,
                queries: [], commentersFound: [],
            };

            console.log('[PRIVATE-REPLY] ========================================');
            console.log('[PRIVATE-REPLY] PostId:', fbPostId, '| PSID:', customerAsid, '| Name:', customerName);

            // === STEP 1: Try stored postId directly ===
            const postIdVariants = [fbPostId];
            if (fbPostId.includes('_')) {
                postIdVariants.push(fbPostId.split('_').slice(1).join('_'));
            }

            let allFailed = true;
            for (const pid of postIdVariants) {
                for (const filter of ['stream', null]) {
                    const result = await searchCommentsOnObject(pid, customerAsid, customerName, filter, diagnostics);
                    if (result) {
                        return { ...result, diagnostics };
                    }
                    // Check if query succeeded (even with 0 comments) vs errored
                    const lastQuery = diagnostics.queries[diagnostics.queries.length - 1];
                    if (lastQuery && !lastQuery.error) allFailed = false;
                }
            }

            // === STEP 2: PostId invalid → search page's live videos and feed ===
            if (allFailed) {
                console.log('[PRIVATE-REPLY] Stored postId invalid → searching page content...');

                // 2a: Search live_videos
                try {
                    const lvUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/live_videos`;
                    const lvParams = new URLSearchParams({
                        access_token: pageToken,
                        fields: 'id,title,created_time',
                        limit: '10'
                    });
                    const lvResp = await fetchWithRetry(
                        `${lvUrl}?${lvParams.toString()}`,
                        { method: 'GET', headers: { 'Accept': 'application/json' } },
                        2, 1000, 15000
                    );
                    const lvData = await lvResp.json();

                    if (!lvData.error && lvData.data?.length > 0) {
                        console.log(`[PRIVATE-REPLY] Found ${lvData.data.length} live videos on page`);
                        diagnostics.liveVideos = lvData.data.map(v => ({ id: v.id, title: v.title, created: v.created_time }));

                        for (const video of lvData.data) {
                            console.log(`[PRIVATE-REPLY] Searching live video: ${video.id} (${video.title || 'untitled'})`);
                            const result = await searchCommentsOnObject(video.id, customerAsid, customerName, 'stream', diagnostics);
                            if (result) {
                                return { ...result, diagnostics };
                            }
                        }
                    } else {
                        diagnostics.queries.push({ query: `${pageId}/live_videos`, error: lvData.error?.message || 'no data' });
                    }
                } catch (err) {
                    diagnostics.queries.push({ query: `${pageId}/live_videos`, error: err.message });
                }

                // 2b: Search page feed (regular posts)
                try {
                    const feedUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/feed`;
                    const feedParams = new URLSearchParams({
                        access_token: pageToken,
                        fields: 'id,message,created_time,type',
                        limit: '15'
                    });
                    const feedResp = await fetchWithRetry(
                        `${feedUrl}?${feedParams.toString()}`,
                        { method: 'GET', headers: { 'Accept': 'application/json' } },
                        2, 1000, 15000
                    );
                    const feedData = await feedResp.json();

                    if (!feedData.error && feedData.data?.length > 0) {
                        console.log(`[PRIVATE-REPLY] Found ${feedData.data.length} posts in page feed`);
                        diagnostics.feedPosts = feedData.data.map(p => ({ id: p.id, type: p.type, created: p.created_time }));

                        for (const post of feedData.data) {
                            console.log(`[PRIVATE-REPLY] Searching post: ${post.id} (${post.type || 'unknown'})`);
                            const result = await searchCommentsOnObject(post.id, customerAsid, customerName, null, diagnostics);
                            if (result) {
                                return { ...result, diagnostics };
                            }
                        }
                    } else {
                        diagnostics.queries.push({ query: `${pageId}/feed`, error: feedData.error?.message || 'no data' });
                    }
                } catch (err) {
                    diagnostics.queries.push({ query: `${pageId}/feed`, error: err.message });
                }
            }

            console.error('[PRIVATE-REPLY] ❌ No match found after full search');
            return { commentId: null, diagnostics };
        }

        // Helper: Send Private Reply via Facebook Graph API
        async function sendPrivateReply(realCommentId, messageText) {
            const prUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${realCommentId}/private_replies`;
            console.log('[PRIVATE-REPLY] Sending Private Reply to comment:', realCommentId);

            const resp = await fetchWithRetry(
                `${prUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                },
                2, 1000, 15000
            );
            const result = await resp.json();

            if (result.error) {
                console.error('[PRIVATE-REPLY] ❌ Failed:', result.error.message);
                return { success: false, result, status: resp.status };
            }

            console.log('[PRIVATE-REPLY] ✅ Private Reply sent successfully!', JSON.stringify(result));
            return { success: true, result };
        }

        // Send images first (if any)
        if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
            console.log('[FACEBOOK-SEND] Sending', imageUrls.length, 'images...');

            for (const imageUrl of imageUrls) {
                const imageFbBody = {
                    recipient: recipient || { id: psid },
                    message: {
                        attachment: {
                            type: 'image',
                            payload: { url: imageUrl, is_reusable: true }
                        }
                    }
                };

                console.log('[FACEBOOK-SEND] Sending image:', imageUrl);
                const imgResult = await sendWithTagFallback(imageFbBody);

                if (!imgResult.success) {
                    console.error('[FACEBOOK-SEND] Image send error:', imgResult.result.error);
                    // Don't return yet - try Private Reply fallback below
                    break;
                }

                messageIds.push(imgResult.result.message_id);
                lastResult = imgResult.result;
                usedTag = imgResult.tag;
            }
        }

        // Send text message (if provided)
        const hasTextMessage = message && (typeof message === 'string' ? message.trim() : message.text);
        if (hasTextMessage && !sendFailed551) {
            const textFbBody = {
                recipient: recipient || { id: psid },
                message: typeof message === 'object' ? message : { text: message },
            };

            console.log('[FACEBOOK-SEND] Sending text message');
            const txtResult = await sendWithTagFallback(textFbBody);

            if (!txtResult.success) {
                console.error('[FACEBOOK-SEND] Text send error:', txtResult.result.error);
                // Don't return yet - try Private Reply fallback below
            } else {
                messageIds.push(txtResult.result.message_id);
                lastResult = txtResult.result;
                usedTag = txtResult.tag;
            }
        }

        // ===== PRIVATE REPLY FALLBACK =====
        // If Send API failed (551=no inbox, or other errors like 100=invalid param/24h policy)
        // and we have a postId, query Facebook Graph API for the real comment ID and use Private Reply
        const sendApiFailed = messageIds.length === 0 && lastError;
        if (sendApiFailed && postId && hasTextMessage) {
            console.log('[FACEBOOK-SEND] ========================================');
            console.log('[FACEBOOK-SEND] Send API failed with 551 → trying Private Reply fallback');

            const messageText = typeof message === 'string' ? message : message.text;
            const lookup = await findRealCommentId(postId, psid, customerName);

            if (lookup.commentId) {
                const prResult = await sendPrivateReply(lookup.commentId, messageText);

                if (prResult.success) {
                    console.log('[FACEBOOK-SEND] ✅ Private Reply succeeded!');
                    return jsonResponse({
                        success: true,
                        recipient_id: prResult.result.recipient_id,
                        message_id: prResult.result.id,
                        message_ids: [prResult.result.id],
                        used_tag: 'PRIVATE_REPLY',
                        method: 'private_reply',
                        real_comment_id: lookup.commentId,
                        matched_by: lookup.matchedBy,
                    });
                }

                // Private Reply failed
                return jsonResponse({
                    success: false,
                    error: prResult.result.error?.message || 'Private Reply failed',
                    error_code: prResult.result.error?.code,
                    error_subcode: prResult.result.error?.error_subcode,
                    method: 'private_reply',
                    real_comment_id: lookup.commentId,
                    send_api_error: lastError?.message,
                    _debug: lookup.diagnostics,
                }, prResult.status || 400);
            }

            // Could not find comment - return diagnostics so client can see why
            return jsonResponse({
                success: false,
                error: lastError?.message || 'Không tìm thấy comment của khách trên bài viết',
                error_code: lastError?.code || 551,
                private_reply_error: 'comment_not_found',
                _debug: lookup.diagnostics,
            }, 400);
        }

        // If Send API failed (non-551) without Private Reply fallback
        if (messageIds.length === 0 && lastError) {
            return jsonResponse({
                success: false,
                error: lastError.message || 'Failed to send message',
                error_code: lastError.code,
                error_subcode: lastError.error_subcode,
            }, 400);
        }

        console.log('[FACEBOOK-SEND] All messages sent successfully!');
        console.log('[FACEBOOK-SEND] ========================================');

        return jsonResponse({
            success: true,
            recipient_id: lastResult?.recipient_id,
            message_id: lastResult?.message_id,
            message_ids: messageIds,
            used_tag: usedTag,
        });

    } catch (error) {
        console.error('[FACEBOOK-SEND] Error:', error.message);
        return errorResponse('Failed to send message via Facebook: ' + error.message, 500);
    }
}

/**
 * Handle GET /api/facebook-graph/livevideo
 * Proxies to TPOS endpoint for live videos
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
/**
 * Handle GET /api/facebook-graph
 * Generic Facebook Graph API proxy for client-side queries
 * Usage: GET /api/facebook-graph?path={graphPath}&access_token={token}&fields=...&limit=...
 */
export async function handleFacebookGraph(request, url) {
    const path = url.searchParams.get('path');
    const accessToken = url.searchParams.get('access_token') || request.headers.get('X-Page-Access-Token');

    if (!path || !accessToken) {
        return errorResponse('Missing path or access_token', 400);
    }

    // Forward all params except 'path' to Facebook
    const fbParams = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        if (key !== 'path') fbParams.set(key, value);
    }
    if (!fbParams.has('access_token')) {
        fbParams.set('access_token', accessToken);
    }

    const fbUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${path}?${fbParams.toString()}`;
    console.log(`[FB-GRAPH] Proxying: ${path}`);

    try {
        const resp = await fetchWithRetry(fbUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        }, 2, 1000, 15000);

        const body = await resp.text();
        return new Response(body, {
            status: resp.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
            },
        });
    } catch (error) {
        console.error('[FB-GRAPH] Error:', error.message);
        return errorResponse('Facebook Graph API error: ' + error.message, 500);
    }
}

export async function handleFacebookLiveVideos(request, url) {
    const targetUrl = `https://tomato.tpos.vn/api/facebook-graph/livevideo${url.search}`;

    console.log('[FACEBOOK-GRAPH-LIVE] ========================================');
    console.log('[FACEBOOK-GRAPH-LIVE] Proxying to TPOS:', targetUrl);

    const tposHeaders = buildTposHeaders(request);

    try {
        const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'GET',
            headers: tposHeaders,
        }, 3, 1000, 15000);

        console.log('[FACEBOOK-GRAPH-LIVE] TPOS Response status:', tposResponse.status);
        console.log('[FACEBOOK-GRAPH-LIVE] ========================================');

        // Learn from response
        learnFromResponse(tposResponse);

        // Clone response and add CORS headers
        const newResponse = new Response(tposResponse.body, tposResponse);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang');

        return newResponse;

    } catch (error) {
        console.error('[FACEBOOK-GRAPH-LIVE] Error:', error.message);
        return errorResponse('Failed to fetch live videos from TPOS: ' + error.message, 500);
    }
}
