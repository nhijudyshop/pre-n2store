/**
 * Image Proxy Handler
 * Handles image proxy endpoints for CORS bypass
 *
 * @module cloudflare-worker/modules/handlers/image-proxy-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';

/**
 * Default SVG avatar for fallback
 */
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`;

/**
 * Handle GET /api/image-proxy
 * Proxies external images with caching
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleImageProxy(request, url) {
    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
        return errorResponse('Missing url parameter', 400, {
            usage: '/api/image-proxy?url=<encoded_url>'
        });
    }

    console.log('[IMAGE-PROXY] Fetching:', imageUrl);

    try {
        const imageResponse = await fetchWithRetry(imageUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://tomato.tpos.vn/'
            }
        }, 3, 1000, 15000);

        if (!imageResponse.ok) {
            console.error('[IMAGE-PROXY] Failed:', imageResponse.status, imageResponse.statusText);
            return errorResponse(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`, imageResponse.status);
        }

        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(imageResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS
            }
        });

    } catch (error) {
        console.error('[IMAGE-PROXY] Error:', error.message);
        return errorResponse('Failed to proxy image: ' + error.message, 500);
    }
}

/**
 * Handle GET /api/fb-avatar
 * Proxies Facebook avatars via Pancake with fallback
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleFacebookAvatar(request, url) {
    const fbId = url.searchParams.get('id');
    const pageId = url.searchParams.get('page') || '270136663390370';
    const accessToken = url.searchParams.get('token');

    if (!fbId) {
        return errorResponse('Missing id parameter', 400, {
            usage: '/api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>'
        });
    }

    // Use Pancake Avatar API
    let pancakeAvatarUrl = `https://pancake.vn/api/v1/pages/${pageId}/avatar/${fbId}`;
    if (accessToken) {
        pancakeAvatarUrl += `?access_token=${accessToken}`;
    }

    console.log('[FB-AVATAR] Fetching from Pancake:', pancakeAvatarUrl);

    try {
        const avatarResponse = await fetchWithRetry(pancakeAvatarUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://pancake.vn/'
            },
            redirect: 'follow'
        }, 3, 1000, 15000);

        if (!avatarResponse.ok) {
            console.error('[FB-AVATAR] Pancake failed:', avatarResponse.status, '- falling back to Facebook');

            // Fallback to Facebook Graph API
            const fbAvatarUrl = `https://graph.facebook.com/${fbId}/picture?width=80&height=80&type=normal`;
            const fbResponse = await fetchWithRetry(fbAvatarUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*,*/*',
                },
                redirect: 'follow'
            }, 3, 1000, 15000);

            if (fbResponse.ok) {
                const contentType = fbResponse.headers.get('content-type') || 'image/jpeg';
                return new Response(fbResponse.body, {
                    status: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=86400',
                        ...CORS_HEADERS
                    }
                });
            }

            // Return default SVG avatar
            return new Response(DEFAULT_AVATAR_SVG, {
                status: 200,
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=3600',
                    ...CORS_HEADERS
                }
            });
        }

        const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(avatarResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS
            }
        });

    } catch (error) {
        console.error('[FB-AVATAR] Error:', error.message);
        return new Response(DEFAULT_AVATAR_SVG, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                ...CORS_HEADERS
            }
        });
    }
}

/**
 * Handle GET /api/pancake-avatar
 * Proxies Pancake content CDN avatars
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handlePancakeAvatar(request, url) {
    const avatarHash = url.searchParams.get('hash');

    if (!avatarHash) {
        return errorResponse('Missing hash parameter', 400, {
            usage: '/api/pancake-avatar?hash=<avatar_hash>'
        });
    }

    const pancakeAvatarUrl = `https://content.pancake.vn/2.1-24/avatars/${avatarHash}`;
    console.log('[PANCAKE-AVATAR] Fetching:', pancakeAvatarUrl);

    try {
        const avatarResponse = await fetchWithRetry(pancakeAvatarUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://pancake.vn/'
            }
        }, 3, 1000, 15000);

        if (!avatarResponse.ok) {
            return new Response(DEFAULT_AVATAR_SVG, {
                status: 200,
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=3600',
                    ...CORS_HEADERS
                }
            });
        }

        const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

        return new Response(avatarResponse.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
                ...CORS_HEADERS
            }
        });

    } catch (error) {
        return new Response(DEFAULT_AVATAR_SVG, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                ...CORS_HEADERS
            }
        });
    }
}

/**
 * imgbb API key (free tier - anonymous uploads)
 * Get free key at: https://api.imgbb.com/
 */
const IMGBB_API_KEY = '7e5f69e00afd2f0da71a994f3eb2f6c5';

/**
 * Handle POST /api/imgbb-upload
 * Uploads image to imgbb as a fallback when Pancake fails
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleImgbbUpload(request) {
    try {
        const body = await request.json();
        const { image } = body; // base64 encoded image

        if (!image) {
            return errorResponse('Missing image parameter (base64)', 400, {
                usage: 'POST /api/imgbb-upload with JSON body { image: "<base64>" }'
            });
        }

        console.log('[IMGBB-UPLOAD] Uploading image to imgbb...');

        // imgbb API expects form data
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', image);

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('[IMGBB-UPLOAD] Failed:', data);
            return new Response(JSON.stringify({
                success: false,
                error: data.error?.message || 'imgbb upload failed',
                status_code: data.status_code || response.status
            }), {
                status: response.status || 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...CORS_HEADERS
                }
            });
        }

        console.log('[IMGBB-UPLOAD] Success:', data.data?.url);

        return new Response(JSON.stringify({
            success: true,
            data: {
                url: data.data.url,
                display_url: data.data.display_url,
                delete_url: data.data.delete_url,
                thumb_url: data.data.thumb?.url,
                width: data.data.width,
                height: data.data.height
            }
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...CORS_HEADERS
            }
        });

    } catch (error) {
        console.error('[IMGBB-UPLOAD] Error:', error);
        return errorResponse('imgbb upload error: ' + error.message, 500);
    }
}
