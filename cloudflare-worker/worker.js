/**
 * Cloudflare Worker - Multi-API Proxy
 * Bypass CORS for tomato.tpos.vn and pancake.vn API calls
 */

// =====================================================
// DYNAMIC HEADERS CACHE (In-memory)
// =====================================================
const dynamicHeaders = {
  tposappversion: null,
  lastUpdated: null,
  updateCooldown: 60 * 60 * 1000 // 1 hour
};

/**
 * Get dynamic header value
 * @param {string} headerName - Header name
 * @returns {string|null}
 */
function getDynamicHeader(headerName) {
  return dynamicHeaders[headerName] || null;
}

/**
 * Update dynamic header from response
 * @param {Response} response - Response object
 */
function learnFromResponse(response) {
  try {
    const tposVersion = response.headers.get('tposappversion');
    if (tposVersion && /^\d+\.\d+\.\d+\.\d+$/.test(tposVersion)) {
      const now = Date.now();
      const lastUpdate = dynamicHeaders.lastUpdated || 0;

      // Only update if cooldown has passed
      if (now - lastUpdate > dynamicHeaders.updateCooldown) {
        if (dynamicHeaders.tposappversion !== tposVersion) {
          console.log(`[DYNAMIC-HEADERS] Updated tposappversion: ${dynamicHeaders.tposappversion || '(none)'} → ${tposVersion}`);
          dynamicHeaders.tposappversion = tposVersion;
          dynamicHeaders.lastUpdated = now;
        }
      }
    }
  } catch (error) {
    console.error('[DYNAMIC-HEADERS] Learning error:', error.message);
  }
}

/**
 * Delays for a given number of milliseconds.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with a timeout.
 * @param {string|Request} resource - The resource to fetch.
 * @param {RequestInit} options - The options for the fetch request.
 * @param {number} timeout - The timeout in milliseconds.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Fetches a URL with retry logic and exponential backoff.
 * @param {string|Request} resource - The resource to fetch.
 * @param {RequestInit} options - The options for the fetch request.
 * @param {number} retries - The number of retries.
 * @param {number} delayMs - The initial delay for exponential backoff.
 * @param {number} timeoutMs - The timeout for each fetch attempt.
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(resource, options = {}, retries = 3, delayMs = 1000, timeoutMs = 10000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetchWithTimeout(resource, options, timeoutMs);
            if (!response.ok && response.status >= 500) { // Retry on server errors
                if (i < retries) {
                    console.warn(`[FETCH-RETRY] Received ${response.status} for ${resource}. Retrying in ${delayMs * Math.pow(2, i)}ms...`);
                    await delay(delayMs * Math.pow(2, i));
                    continue;
                }
            }
            return response;
        } catch (error) {
            if (i < retries && (error.name === 'AbortError' || error instanceof TypeError)) { // Retry on timeout or network errors
                console.warn(`[FETCH-RETRY] Attempt ${i + 1}/${retries + 1} failed for ${resource}: ${error.message}. Retrying in ${delayMs * Math.pow(2, i)}ms...`);
                await delay(delayMs * Math.pow(2, i));
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Failed to fetch ${resource} after ${retries + 1} attempts.`);
}

// =====================================================
// TPOS TOKEN CACHE (In-memory)
// =====================================================
const tokenCache = {
  access_token: null,
  expiry: null,
  expires_in: null,
  token_type: null
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

  console.log('[WORKER-TOKEN] ✅ Token cached, expires at:', new Date(expiryTimestamp).toISOString());
}

/**
 * Get cached token if valid
 * @returns {object|null}
 */
function getCachedToken() {
  if (isCachedTokenValid()) {
    console.log('[WORKER-TOKEN] ✅ Using cached token');
    return {
      access_token: tokenCache.access_token,
      expires_in: Math.floor((tokenCache.expiry - Date.now()) / 1000),
      token_type: tokenCache.token_type
    };
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Auth-Data, X-User-Id, tposappversion, x-tpos-lang, X-Page-Access-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // Parse request URL
      const url = new URL(request.url);
      const pathname = url.pathname;

      // ========== SPECIAL HANDLER: TOKEN ENDPOINT WITH CACHING ==========
      if (pathname === '/api/token' && request.method === 'POST') {
        // Check cache first
        const cachedToken = getCachedToken();
        if (cachedToken) {
          console.log('[WORKER-TOKEN] 🚀 Returning cached token');
          return new Response(JSON.stringify(cachedToken), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // Cache miss - fetch new token from TPOS
        console.log('[WORKER-TOKEN] 🔄 Cache miss, fetching new token from TPOS...');

        try {
          // Get request headers (simple approach like your working code)
          const headers = new Headers(request.headers);
          headers.set('Origin', 'https://tomato.tpos.vn/');
          headers.set('Referer', 'https://tomato.tpos.vn/');

          // Forward to TPOS token endpoint
          const tposResponse = await fetchWithRetry('https://tomato.tpos.vn/token', {
            method: 'POST',
            headers: headers,
            body: await request.arrayBuffer(),
          }, 3, 1000, 10000); // 3 retries, 1s initial delay, 10s timeout per attempt

          if (!tposResponse.ok) {
            const errorText = await tposResponse.text();
            console.error(`[WORKER-TOKEN] ❌ TPOS error ${tposResponse.status}:`, errorText);
            throw new Error(`TPOS API responded with ${tposResponse.status}: ${tposResponse.statusText}`);
          }

          const tokenData = await tposResponse.json();

          // Validate response
          if (!tokenData.access_token) {
            console.error('[WORKER-TOKEN] ❌ Response missing access_token:', tokenData);
            throw new Error('Invalid token response - missing access_token');
          }

          // Cache the token
          cacheToken(tokenData);

          console.log('[WORKER-TOKEN] ✅ New token fetched and cached');

          // Return token data
          return new Response(JSON.stringify(tokenData), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[WORKER-TOKEN] ❌ Error fetching token:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to fetch token',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== IMAGE PROXY ENDPOINT ==========
      if (pathname === '/api/image-proxy' && request.method === 'GET') {
        const imageUrl = url.searchParams.get('url');

        if (!imageUrl) {
          return new Response(JSON.stringify({
            error: 'Missing url parameter',
            usage: '/api/image-proxy?url=<encoded_url>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        console.log('[IMAGE-PROXY] Fetching:', imageUrl);

        try {
          // Fetch image from external source
          const imageResponse = await fetchWithRetry(imageUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
              'Referer': 'https://tomato.tpos.vn/'
            }
          }, 3, 1000, 15000); // 3 retries, 1s initial delay, 15s timeout

          if (!imageResponse.ok) {
            console.error('[IMAGE-PROXY] Failed:', imageResponse.status, imageResponse.statusText);
            return new Response(JSON.stringify({
              error: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
            }), {
              status: imageResponse.status,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Get content type
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

          // Create response with CORS headers
          const newResponse = new Response(imageResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400', // Cache for 1 day
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Accept',
            },
          });

          console.log('[IMAGE-PROXY] Success:', contentType);
          return newResponse;

        } catch (error) {
          console.error('[IMAGE-PROXY] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to proxy image',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== FACEBOOK/PANCAKE AVATAR PROXY ENDPOINT ==========
      if (pathname === '/api/fb-avatar' && request.method === 'GET') {
        const fbId = url.searchParams.get('id');
        const pageId = url.searchParams.get('page') || '270136663390370'; // Default page ID
        const accessToken = url.searchParams.get('token'); // Pancake JWT token (optional)

        if (!fbId) {
          return new Response(JSON.stringify({
            error: 'Missing id parameter',
            usage: '/api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // Use Pancake Avatar API which handles the hash lookup
        let pancakeAvatarUrl = `https://pancake.vn/api/v1/pages/${pageId}/avatar/${fbId}`;
        if (accessToken) {
          pancakeAvatarUrl += `?access_token=${accessToken}`;
        }
        console.log('[FB-AVATAR] Fetching from Pancake:', pancakeAvatarUrl);

        try {
          // Fetch from Pancake Avatar API (it will redirect to content.pancake.vn)
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
                  'Access-Control-Allow-Origin': '*',
                },
              });
            }

            // Return default avatar SVG
            return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Get content type
          const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

          // Create response with CORS headers
          return new Response(avatarResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400', // Cache for 1 day
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Accept',
            },
          });

        } catch (error) {
          console.error('[FB-AVATAR] Error:', error.message);
          // Return default avatar SVG on error
          return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== PANCAKE AVATAR PROXY ENDPOINT ==========
      if (pathname === '/api/pancake-avatar' && request.method === 'GET') {
        const avatarHash = url.searchParams.get('hash');

        if (!avatarHash) {
          return new Response(JSON.stringify({
            error: 'Missing hash parameter',
            usage: '/api/pancake-avatar?hash=<avatar_hash>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
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
            return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';
          return new Response(avatarResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== GENERIC PROXY ENDPOINT (For TinhThanhPho, etc.) ==========
      if (pathname === '/api/proxy') {
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
          return new Response(JSON.stringify({
            error: 'Missing url parameter',
            usage: '/api/proxy?url=<encoded_url>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        console.log('[PROXY] Fetching:', targetUrl);

        try {
          // Read body first before setting up options
          const requestBody = request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : null;

          // Forward request - start with default headers
          const fetchOptions = {
            method: request.method,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/plain, */*',
            },
            body: requestBody,
          };

          // Preserve Content-Type from original request for POST/PUT
          const originalContentType = request.headers.get('Content-Type');
          if (originalContentType && requestBody) {
            fetchOptions.headers['Content-Type'] = originalContentType;
          }

          // Check for custom headers passed via query param 'headers' (JSON string)
          const customHeadersStr = url.searchParams.get('headers');
          if (customHeadersStr) {
            try {
              const customHeaders = JSON.parse(customHeadersStr);
              Object.assign(fetchOptions.headers, customHeaders);
            } catch (e) {
              console.error('[PROXY] Failed to parse custom headers:', e);
            }
          }

          console.log('[PROXY] Request method:', request.method);
          console.log('[PROXY] Headers:', JSON.stringify(fetchOptions.headers));

          const proxyResponse = await fetchWithRetry(targetUrl, fetchOptions, 3, 1000, 15000);

          console.log('[PROXY] Response status:', proxyResponse.status);

          // Clone response and add CORS headers
          const newResponse = new Response(proxyResponse.body, proxyResponse);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang');

          return newResponse;

        } catch (error) {
          console.error('[PROXY] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to proxy request',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== PANCAKE DIRECT API (with custom Referer and JWT cookie) ==========
      // Used for 24h policy bypass - calls fill_admin_name, check_inbox, contents/touch
      if (pathname.startsWith('/api/pancake-direct/')) {
        const apiPath = pathname.replace(/^\/api\/pancake-direct\//, '');
        const pageId = url.searchParams.get('page_id');
        const jwtToken = url.searchParams.get('jwt');

        // Remove our custom params from the search string before forwarding
        const forwardParams = new URLSearchParams(url.search);
        forwardParams.delete('page_id');
        forwardParams.delete('jwt');
        const forwardSearch = forwardParams.toString() ? `?${forwardParams.toString()}` : '';

        const targetUrl = `https://pancake.vn/api/v1/${apiPath}${forwardSearch}`;

        console.log('[PANCAKE-DIRECT] Target URL:', targetUrl);
        console.log('[PANCAKE-DIRECT] Page ID:', pageId);

        // Determine Referer based on pageId
        let refererUrl = 'https://pancake.vn/multi_pages'; // default
        if (pageId === '117267091364524') {
          refererUrl = 'https://pancake.vn/NhiJudyHouse.VietNam';
        } else if (pageId === '270136663390370') {
          refererUrl = 'https://pancake.vn/NhiJudyStore';
        }

        console.log('[PANCAKE-DIRECT] Referer:', refererUrl);

        // Build headers with JWT cookie
        const headers = new Headers();
        headers.set('Accept', 'application/json, text/plain, */*');
        headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
        headers.set('Origin', 'https://pancake.vn');
        headers.set('Referer', refererUrl);
        headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');
        headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
        headers.set('sec-ch-ua-mobile', '?0');
        headers.set('sec-ch-ua-platform', '"macOS"');
        headers.set('sec-fetch-dest', 'empty');
        headers.set('sec-fetch-mode', 'cors');
        headers.set('sec-fetch-site', 'same-origin');

        // Set Content-Type from original request
        const contentType = request.headers.get('Content-Type');
        if (contentType) {
          headers.set('Content-Type', contentType);
        }

        // Set Cookie with JWT if provided
        if (jwtToken) {
          headers.set('Cookie', `jwt=${jwtToken}; locale=vi`);
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

          const newResponse = new Response(response.body, response);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newResponse;
        } catch (error) {
          console.error('[PANCAKE-DIRECT] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Pancake direct API failed',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== PANCAKE OFFICIAL API (pages.fm Public API) ==========
      // For official Pancake Public API that requires page_access_token
      // URL format: /api/pancake-official/{path}?page_access_token=xxx
      // Forwards to: https://pages.fm/api/public_api/v1/{path}?page_access_token=xxx
      if (pathname.startsWith('/api/pancake-official/')) {
        const apiPath = pathname.replace(/^\/api\/pancake-official\//, '');
        const targetUrl = `https://pages.fm/api/public_api/v1/${apiPath}${url.search}`;

        console.log('[PANCAKE-OFFICIAL] Target URL:', targetUrl);

        // Build headers for pages.fm
        const headers = new Headers();
        headers.set('Accept', 'application/json, text/plain, */*');
        headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
        headers.set('Origin', 'https://pages.fm');
        headers.set('Referer', 'https://pages.fm/');
        headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');
        headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
        headers.set('sec-ch-ua-mobile', '?0');
        headers.set('sec-ch-ua-platform', '"macOS"');
        headers.set('sec-fetch-dest', 'empty');
        headers.set('sec-fetch-mode', 'cors');
        headers.set('sec-fetch-site', 'same-origin');

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

          console.log('[PANCAKE-OFFICIAL] Response status:', response.status);

          const newResponse = new Response(response.body, response);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newResponse;
        } catch (error) {
          console.error('[PANCAKE-OFFICIAL] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Pancake Official API failed',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== DEEPSEEK AI API PROXY ==========
      // Bypass CORS for DeepSeek API calls from browser
      // POST /api/deepseek
      // Body: { model, messages, max_tokens, temperature }
      // Header: Authorization: Bearer <api_key>
      if (pathname === '/api/deepseek' && request.method === 'POST') {
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
            return new Response(JSON.stringify({
              error: 'Missing Authorization header',
              usage: 'POST /api/deepseek with Authorization: Bearer <api_key>'
            }), {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          console.log('[DEEPSEEK] Model:', body.model || 'deepseek-chat');

          // Forward to DeepSeek API
          const deepseekResponse = await fetchWithRetry('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': apiKey,
              'Accept': 'application/json',
            },
            body: JSON.stringify(body),
          }, 3, 1000, 20000); // Higher timeout for AI API

          const result = await deepseekResponse.json();
          console.log('[DEEPSEEK] Response status:', deepseekResponse.status);

          return new Response(JSON.stringify(result), {
            status: deepseekResponse.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[DEEPSEEK] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'DeepSeek proxy failed',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== ALPHAXIV DEEPSEEK-OCR API PROXY ==========
      // Proxy to alphaXiv's DeepSeek-OCR for high-quality OCR
      // POST /api/deepseek-ocr
      // Body: FormData with 'file' field (image or PDF)
      // Returns: OCR result from DeepSeek-OCR model
      if (pathname === '/api/deepseek-ocr' && request.method === 'POST') {
        console.log('[DEEPSEEK-OCR] ========================================');
        console.log('[DEEPSEEK-OCR] Received request for DeepSeek-OCR via alphaXiv');

        try {
          // Get the form data from the request
          const formData = await request.formData();
          const file = formData.get('file');

          if (!file) {
            return new Response(JSON.stringify({
              error: 'Missing file',
              usage: 'POST /api/deepseek-ocr with FormData containing "file" field'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          console.log('[DEEPSEEK-OCR] File name:', file.name || 'unnamed');
          console.log('[DEEPSEEK-OCR] File size:', file.size, 'bytes');
          console.log('[DEEPSEEK-OCR] File type:', file.type);

          // Create new FormData to forward to alphaXiv
          const forwardFormData = new FormData();
          forwardFormData.append('file', file);

          // Forward to alphaXiv DeepSeek-OCR API (Modal endpoint)
          const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

          const ocrResponse = await fetchWithRetry(`https://alphaxiv--deepseek-ocr-modal-serve.modal.run/run/image?_r=${requestId}`, {
            method: 'POST',
            headers: {
              'cache-control': 'no-cache, no-store',
              'pragma': 'no-cache',
              'x-request-id': requestId,
              'Referer': 'https://alphaxiv.github.io/',
            },
            body: forwardFormData,
          }, 3, 1000, 30000); // OCR can be slow, 30s timeout

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

          return new Response(JSON.stringify(parsedResult), {
            status: ocrResponse.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[DEEPSEEK-OCR] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'DeepSeek-OCR proxy failed',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== FACEBOOK GRAPH API - SEND MESSAGE WITH TAG ==========
      // For sending messages outside 24h window using POST_PURCHASE_UPDATE tag
      // POST /api/facebook-send
      // Body: { pageId, psid, message, pageToken, useTag: true, recipient: {...} }
      // Supports both PSID direct send and CommentID Private Reply
      if (pathname === '/api/facebook-send' && request.method === 'POST') {
        console.log('[FACEBOOK-SEND] ========================================');
        console.log('[FACEBOOK-SEND] Received request to send message via Facebook Graph API');

        try {
          const body = await request.json();
          // Support recipient object (for Private Reply with comment_id)
          let { pageId, psid, message, pageToken, useTag, imageUrls, recipient } = body;

          // Fallback: Get token from header if not in body
          if (!pageToken) {
            pageToken = request.headers.get('X-Page-Access-Token');
          }

          // Validate required fields (psid OR recipient required)
          if (!pageId || (!psid && !recipient) || !pageToken) {
            console.error('[FACEBOOK-SEND] Missing required fields:', { pageId: !!pageId, psid: !!psid, recipient: !!recipient, pageToken: !!pageToken });
            return new Response(JSON.stringify({
              success: false,
              error: 'Missing required fields',
              required: ['pageId', 'psid OR recipient', 'pageToken'],
              usage: 'POST /api/facebook-send with JSON body { pageId, psid, message, pageToken }'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Build Facebook Graph API URL
          const graphApiUrl = `https://graph.facebook.com/v21.0/${pageId}/messages`;
          console.log('[FACEBOOK-SEND] Graph API URL:', graphApiUrl);

          // Collect all message IDs
          const messageIds = [];
          let lastResult = null;

          // Send images first (if any)
          if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
            console.log('[FACEBOOK-SEND] Sending', imageUrls.length, 'images...');
            for (const imageUrl of imageUrls) {
              const imageFbBody = {
                recipient: recipient || { id: psid },
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

              // Add message tag for 24h bypass (not for Private Reply)
              if (useTag) {
                imageFbBody.messaging_type = 'MESSAGE_TAG';
                imageFbBody.tag = 'POST_PURCHASE_UPDATE';
              } else if (!recipient?.comment_id) {
                imageFbBody.messaging_type = 'RESPONSE';
              }

              console.log('[FACEBOOK-SEND] Sending image:', imageUrl);

              const imageResponse = await fetchWithRetry(`${graphApiUrl}?access_token=${pageToken}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify(imageFbBody),
              }, 3, 1000, 15000);

              const imageResult = await imageResponse.json();
              console.log('[FACEBOOK-SEND] Image response:', JSON.stringify(imageResult));

              if (imageResult.error) {
                console.error('[FACEBOOK-SEND] Image send error:', imageResult.error);
                return new Response(JSON.stringify({
                  success: false,
                  error: imageResult.error.message || 'Failed to send image',
                  error_code: imageResult.error.code,
                  error_subcode: imageResult.error.error_subcode,
                }), {
                  status: imageResponse.status,
                  headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                  },
                });
              }

              messageIds.push(imageResult.message_id);
              lastResult = imageResult;
            }
          }

          // Send text message (if provided)
          // Handle both string message and object message (for passthrough)
          const hasTextMessage = message && (typeof message === 'string' ? message.trim() : message.text);
          if (hasTextMessage) {
            const textFbBody = {
              recipient: recipient || { id: psid },
              message: typeof message === 'object' ? message : { text: message },
            };

            // Add message tag for 24h bypass (not for Private Reply)
            if (useTag) {
              textFbBody.messaging_type = 'MESSAGE_TAG';
              textFbBody.tag = 'POST_PURCHASE_UPDATE';
              console.log('[FACEBOOK-SEND] Using MESSAGE_TAG with POST_PURCHASE_UPDATE');
            } else if (!recipient?.comment_id) {
              textFbBody.messaging_type = 'RESPONSE';
              console.log('[FACEBOOK-SEND] Using standard RESPONSE messaging_type');
            } else {
              console.log('[FACEBOOK-SEND] Using Private Reply (comment_id)');
            }

            console.log('[FACEBOOK-SEND] Sending text message');

            const textResponse = await fetchWithRetry(`${graphApiUrl}?access_token=${pageToken}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(textFbBody),
            }, 3, 1000, 15000);

            const textResult = await textResponse.json();
            console.log('[FACEBOOK-SEND] Text response:', JSON.stringify(textResult));
            console.log('[FACEBOOK-SEND] ========================================');

            if (textResult.error) {
              console.error('[FACEBOOK-SEND] Text send error:', textResult.error);
              return new Response(JSON.stringify({
                success: false,
                error: textResult.error.message || 'Failed to send text',
                error_code: textResult.error.code,
                error_subcode: textResult.error.error_subcode,
              }), {
                status: textResponse.status,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              });
            }

            messageIds.push(textResult.message_id);
            lastResult = textResult;
          }

          console.log('[FACEBOOK-SEND] All messages sent successfully!');
          console.log('[FACEBOOK-SEND] ========================================');

          // Success
          return new Response(JSON.stringify({
            success: true,
            recipient_id: lastResult?.recipient_id,
            message_id: lastResult?.message_id,
            message_ids: messageIds,
            used_tag: useTag ? 'POST_PURCHASE_UPDATE' : null,
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[FACEBOOK-SEND] Error:', error.message);
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to send message via Facebook',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== SEPAY WEBHOOK PROXY ==========
      // Handle SePay webhooks with explicit header forwarding
      if (pathname.startsWith('/api/sepay/')) {
        const sepayPath = pathname.replace(/^\/api\/sepay\//, '');
        const targetUrl = `https://n2store-fallback.onrender.com/api/sepay/${sepayPath}${url.search}`;

        console.log('[SEPAY-PROXY] ========================================');
        console.log('[SEPAY-PROXY] Forwarding to:', targetUrl);
        console.log('[SEPAY-PROXY] Method:', request.method);

        // Build headers - explicitly copy Authorization
        const sepayHeaders = new Headers();
        sepayHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
        sepayHeaders.set('Accept', 'application/json');
        sepayHeaders.set('User-Agent', 'Cloudflare-Worker-SePay-Proxy/1.0');

        // CRITICAL: Forward the Authorization header from SePay
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          sepayHeaders.set('Authorization', authHeader);
          console.log('[SEPAY-PROXY] Authorization header forwarded');
        } else {
          console.log('[SEPAY-PROXY] WARNING: No Authorization header in request');
        }

        try {
          // Read body for POST/PUT requests
          let requestBody = null;
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            requestBody = await request.arrayBuffer();
            console.log('[SEPAY-PROXY] Request body size:', requestBody.byteLength, 'bytes');
          }

          const sepayResponse = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: sepayHeaders,
            body: requestBody,
          }, 3, 1000, 15000);

          console.log('[SEPAY-PROXY] Response status:', sepayResponse.status);
          console.log('[SEPAY-PROXY] ========================================');

          // Clone response and add CORS headers
          const newSepayResponse = new Response(sepayResponse.body, sepayResponse);
          newSepayResponse.headers.set('Access-Control-Allow-Origin', '*');
          newSepayResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newSepayResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newSepayResponse;

        } catch (sepayError) {
          console.error('[SEPAY-PROXY] Error:', sepayError.message);
          return new Response(JSON.stringify({
            success: false,
            error: 'SePay proxy failed',
            message: sepayError.message,
            target: targetUrl
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== FACEBOOK GRAPH API - LIVE VIDEOS (via TPOS) ==========
      // GET /api/facebook-graph/livevideo?pageid=xxx&limit=10&facebook_Type=page
      // Proxies to tomato.tpos.vn/api/facebook-graph/livevideo (TPOS endpoint)
      if (pathname === '/api/facebook-graph/livevideo' && request.method === 'GET') {
        const targetUrl = `https://tomato.tpos.vn/api/facebook-graph/livevideo${url.search}`;

        console.log('[FACEBOOK-GRAPH-LIVE] ========================================');
        console.log('[FACEBOOK-GRAPH-LIVE] Proxying to TPOS:', targetUrl);

        // Build headers for TPOS
        const tposHeaders = new Headers();

        // Copy Authorization header from original request
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          tposHeaders.set('Authorization', authHeader);
        }

        // Set required headers for TPOS
        tposHeaders.set('Accept', '*/*');
        tposHeaders.set('Content-Type', 'application/json;IEEE754Compatible=false;charset=utf-8');
        // Dynamic version from learned responses, fallback for initial requests only
        tposHeaders.set('tposappversion', getDynamicHeader('tposappversion') || '5.12.29.1');
        tposHeaders.set('Origin', 'https://tomato.tpos.vn');
        tposHeaders.set('Referer', 'https://tomato.tpos.vn/');
        tposHeaders.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');

        try {
          const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'GET',
            headers: tposHeaders,
          }, 3, 1000, 15000);

          console.log('[FACEBOOK-GRAPH-LIVE] TPOS Response status:', tposResponse.status);
          console.log('[FACEBOOK-GRAPH-LIVE] ========================================');

          // Learn from TPOS response
          learnFromResponse(tposResponse);

          // Clone response and add CORS headers
          const newResponse = new Response(tposResponse.body, tposResponse);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang');

          return newResponse;

        } catch (error) {
          console.error('[FACEBOOK-GRAPH-LIVE] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to fetch live videos from TPOS',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== TPOS PRODUCT EXCEL EXPORT V2 (ExportProductV2) ==========
      // POST /api/Product/ExportProductV2
      // Headers theo request thành công từ tomato.tpos.vn (hình user gửi)
      if (pathname === '/api/Product/ExportProductV2' && request.method === 'POST') {
        // Extract query params (e.g., ?Active=true)
        const queryParams = url.search || '?Active=true';
        const targetUrl = `https://tomato.tpos.vn/Product/ExportProductV2${queryParams}`;

        console.log('[TPOS-EXPORT-PRODUCT-V2] ========================================');
        console.log('[TPOS-EXPORT-PRODUCT-V2] Proxying to TPOS:', targetUrl);

        // Build headers giống request thành công (từ hình)
        const tposHeaders = new Headers();

        // Copy Authorization header from original request
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          tposHeaders.set('Authorization', authHeader);
        }

        // Set headers theo request thành công
        tposHeaders.set('Content-Type', 'application/json');
        tposHeaders.set('Referer', 'https://tomato.tpos.vn/');
        tposHeaders.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
        tposHeaders.set('sec-ch-ua-mobile', '?0');
        tposHeaders.set('sec-ch-ua-platform', '"macOS"');
        tposHeaders.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');

        try {
          const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'POST',
            headers: tposHeaders,
            body: await request.text(),
          }, 3, 1000, 15000);

          console.log('[TPOS-EXPORT-PRODUCT-V2] TPOS Response status:', tposResponse.status);
          console.log('[TPOS-EXPORT-PRODUCT-V2] Content-Type:', tposResponse.headers.get('Content-Type'));
          console.log('[TPOS-EXPORT-PRODUCT-V2] ========================================');

          // Clone response and add CORS headers
          const newResponse = new Response(tposResponse.body, tposResponse);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newResponse;

        } catch (error) {
          console.error('[TPOS-EXPORT-PRODUCT-V2] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to fetch product Excel from TPOS',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== TPOS PRODUCT EXCEL EXPORT (Standard Price V2 - Giá mua/vốn) ==========
      // POST /api/Product/ExportFileWithStandardPriceV2
      // Cần headers đặc biệt giống như request trực tiếp từ tomato.tpos.vn
      if (pathname === '/api/Product/ExportFileWithStandardPriceV2' && request.method === 'POST') {
        const targetUrl = 'https://tomato.tpos.vn/Product/ExportFileWithStandardPriceV2';

        console.log('[TPOS-EXCEL-STANDARD-PRICE] ========================================');
        console.log('[TPOS-EXCEL-STANDARD-PRICE] Proxying to TPOS:', targetUrl);

        // Build headers giống 100% như request từ browser trên tomato.tpos.vn
        const tposHeaders = new Headers();

        // Copy Authorization header from original request
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          tposHeaders.set('Authorization', authHeader);
        }

        // Set headers giống như browser request trực tiếp
        tposHeaders.set('Accept', '*/*');
        tposHeaders.set('Accept-Language', 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5');
        tposHeaders.set('Content-Type', 'application/json');
        tposHeaders.set('Cache-Control', 'no-cache');
        tposHeaders.set('Pragma', 'no-cache');
        tposHeaders.set('Origin', 'https://tomato.tpos.vn');
        tposHeaders.set('Referer', 'https://tomato.tpos.vn/');
        tposHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');
        tposHeaders.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
        tposHeaders.set('sec-ch-ua-mobile', '?0');
        tposHeaders.set('sec-ch-ua-platform', '"Windows"');
        tposHeaders.set('sec-fetch-dest', 'empty');
        tposHeaders.set('sec-fetch-mode', 'cors');
        tposHeaders.set('sec-fetch-site', 'same-origin');

        try {
          const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'POST',
            headers: tposHeaders,
            body: await request.text(),
          }, 3, 1000, 15000);

          console.log('[TPOS-EXCEL-STANDARD-PRICE] TPOS Response status:', tposResponse.status);
          console.log('[TPOS-EXCEL-STANDARD-PRICE] ========================================');

          // Clone response and add CORS headers
          const newResponse = new Response(tposResponse.body, tposResponse);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newResponse;

        } catch (error) {
          console.error('[TPOS-EXCEL-STANDARD-PRICE] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to fetch standard price Excel from TPOS',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== GENERIC PROXY (like your working code) ==========
      let targetUrl;
      let isTPOSRequest = false;
      let isPancakeRequest = false;

      if (pathname.startsWith('/api/pancake/')) {
        // Pancake API
        const apiPath = pathname.replace(/^\/api\/pancake\//, '');
        targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;
        isPancakeRequest = true;
      } else if (pathname.startsWith('/api/realtime/')) {
        // ALL Realtime routes → dedicated n2store-realtime server
        // Includes: /api/realtime/start, /api/realtime/stop, /api/realtime/status
        //           /api/realtime/tpos/start, /api/realtime/tpos/stop, /api/realtime/tpos/status
        const realtimePath = pathname.replace(/^\/api\/realtime\//, '');
        targetUrl = `https://n2store-realtime.onrender.com/api/realtime/${realtimePath}${url.search}`;
      } else if (pathname.startsWith('/api/chat/')) {
        // Chat Server (Render) - Using same server as realtime
        const chatPath = pathname.replace(/^\/api\/chat\//, '');
        targetUrl = `https://n2store-fallback.onrender.com/api/chat/${chatPath}${url.search}`;
      } else if (pathname.startsWith('/api/customers/') || pathname === '/api/customers') {
        // Customers API (Render) - PostgreSQL backend
        const customersPath = pathname.replace(/^\/api\/customers\/?/, '');
        targetUrl = `https://n2store-fallback.onrender.com/api/customers/${customersPath}${url.search}`;
      } else if (pathname.startsWith('/api/customer360/') || pathname.startsWith('/api/customer/') || pathname.startsWith('/api/wallet/') || pathname.startsWith('/api/ticket') || pathname.startsWith('/api/customer-search') || pathname.startsWith('/api/transactions/') || pathname.startsWith('/api/balance-history/')) {
        // ========== CUSTOMER 360° API (Render) ==========
        // Routes: /api/customer/:phone, /api/wallet/:phone, /api/ticket, /api/customer-search-v2, /api/transactions/consolidated, /api/balance-history/unlinked
        // Forward to n2store-fallback.onrender.com (has Customer 360 routes deployed)
        let apiPath;
        if (pathname.startsWith('/api/customer360/')) {
          apiPath = pathname.replace(/^\/api\/customer360\//, '');
        } else {
          apiPath = pathname.replace(/^\/api\//, '');
        }
        targetUrl = `https://n2store-fallback.onrender.com/api/${apiPath}${url.search}`;
        console.log('[CUSTOMER360] Proxying to:', targetUrl);
      } else if (pathname.match(/^\/tpos\/order\/(\d+)\/lines$/)) {
        // ========== TPOS ORDER LINES (OData API) ==========
        // Example: /tpos/order/409233/lines
        // Forwards to: https://tomato.tpos.vn/odata/FastSaleOrder(409233)/OrderLines?$expand=Product,ProductUOM
        const orderId = pathname.match(/^\/tpos\/order\/(\d+)\/lines$/)[1];

        console.log('[TPOS-ORDER-LINES] Fetching OrderLines for order:', orderId);

        try {
          // Get or fetch TPOS token
          let token = getCachedToken()?.access_token;

          if (!token) {
            console.log('[TPOS-ORDER-LINES] No cached token, fetching new one...');
            const tokenResponse = await fetchWithRetry('https://tomato.tpos.vn/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'grant_type=password&username=nvkt&password=Aa@123456789&client_id=tmtWebApp',
            }, 3, 1000, 10000);

            if (!tokenResponse.ok) {
              throw new Error('Failed to get TPOS token');
            }

            const tokenData = await tokenResponse.json();
            cacheToken(tokenData);
            token = tokenData.access_token;
          }

          // Fetch OrderLines from TPOS OData API
          const odataUrl = `https://tomato.tpos.vn/odata/FastSaleOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account,SaleLine,User`;

          const odataResponse = await fetchWithRetry(odataUrl, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'tposappversion': getDynamicHeader('tposappversion') || '5.12.29.1', // Dynamic header, fallback for initial requests
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': 'https://tomato.tpos.vn/',
              'Origin': 'https://tomato.tpos.vn'
            },
          }, 3, 1000, 15000);

          if (!odataResponse.ok) {
            throw new Error(`TPOS API error: ${odataResponse.status}`);
          }

          // Learn from TPOS response
          learnFromResponse(odataResponse);

          const odataResult = await odataResponse.json();

          return new Response(JSON.stringify({
            success: true,
            data: odataResult.value || []
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[TPOS-ORDER-LINES] Error:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } else if (pathname.startsWith('/tpos/order-ref/') && pathname.endsWith('/lines')) {
        // ========== TPOS ORDER LINES BY REFERENCE (e.g., NJD/2026/42623) ==========
        // Example: /tpos/order-ref/NJD%2F2026%2F42623/lines
        // First search for order by Number (reference), then fetch OrderLines
        const refMatch = pathname.match(/^\/tpos\/order-ref\/(.+)\/lines$/);
        const orderRef = refMatch ? decodeURIComponent(refMatch[1]) : null;

        console.log('[TPOS-ORDER-REF] Searching OrderLines for reference:', orderRef);

        if (!orderRef) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid order reference'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        try {
          // Get or fetch TPOS token
          let token = getCachedToken()?.access_token;

          if (!token) {
            console.log('[TPOS-ORDER-REF] No cached token, fetching new one...');
            const tokenResponse = await fetchWithRetry('https://tomato.tpos.vn/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'grant_type=password&username=nvkt&password=Aa@123456789&client_id=tmtWebApp',
            }, 3, 1000, 10000);

            if (!tokenResponse.ok) {
              throw new Error('Failed to get TPOS token');
            }

            const tokenData = await tokenResponse.json();
            cacheToken(tokenData);
            token = tokenData.access_token;
          }

          // Step 1: Search for order by Number (reference) using ODataService.GetView
          // Use contains filter: contains(Number,'NJD/2026/42586')
          const encodedRef = encodeURIComponent(orderRef);
          const searchUrl = `https://tomato.tpos.vn/odata/FastSaleOrder/ODataService.GetView?$top=1&$filter=contains(Number,'${encodedRef}')&$select=Id,Number`;

          console.log('[TPOS-ORDER-REF] Search URL:', searchUrl);

          const searchResponse = await fetchWithRetry(searchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Authorization': `Bearer ${token}`,
              'tposappversion': getDynamicHeader('tposappversion') || '5.12.29.1', // Dynamic header, fallback for initial requests
              'x-requested-with': 'XMLHttpRequest',
              'Referer': 'https://tomato.tpos.vn/',
              'Origin': 'https://tomato.tpos.vn'
            },
          }, 3, 1000, 15000);

          if (!searchResponse.ok) {
            throw new Error(`TPOS search API error: ${searchResponse.status}`);
          }

          // Learn from TPOS response
          learnFromResponse(searchResponse);

          const searchResult = await searchResponse.json();

          if (!searchResult.value || searchResult.value.length === 0) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Order not found',
              reference: orderRef
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          const orderId = searchResult.value[0].Id;
          console.log('[TPOS-ORDER-REF] Found order ID:', orderId);

          // Step 2: Fetch OrderLines using the order ID
          const odataUrl = `https://tomato.tpos.vn/odata/FastSaleOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account,SaleLine,User`;

          const odataResponse = await fetchWithRetry(odataUrl, {
            method: 'GET',
            headers: {
              'Accept': '*/*',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
              'tposappversion': getDynamicHeader('tposappversion') || '5.12.29.1', // Dynamic header, fallback for initial requests
              'Referer': 'https://tomato.tpos.vn/',
              'Origin': 'https://tomato.tpos.vn'
            },
          }, 3, 1000, 15000);

          if (!odataResponse.ok) {
            throw new Error(`TPOS OrderLines API error: ${odataResponse.status}`);
          }

          // Learn from TPOS response
          learnFromResponse(odataResponse);

          const odataResult = await odataResponse.json();

          return new Response(JSON.stringify({
            success: true,
            orderId: orderId,
            reference: orderRef,
            data: odataResult.value || []
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[TPOS-ORDER-REF] Error:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } else if (pathname.startsWith('/api/rest/')) {
        // ========== TPOS REST API v2.0 (Live Comments, etc.) ==========
        // Example: /api/rest/v2.0/facebookpost/{objectId}/commentsbyuser?userId={userId}
        // Forwards to: https://tomato.tpos.vn/rest/v2.0/...
        const restPath = pathname.replace(/^\/api\/rest\//, '');
        targetUrl = `https://tomato.tpos.vn/rest/${restPath}${url.search}`;
        console.log('[TPOS-REST-API] Forwarding to:', targetUrl);

        // Build headers for TPOS REST API
        const tposRestHeaders = new Headers();

        // Copy Authorization header from original request
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          tposRestHeaders.set('Authorization', authHeader);
        }

        // Set required headers for TPOS
        tposRestHeaders.set('Accept', '*/*');
        tposRestHeaders.set('Content-Type', 'application/json;IEEE754Compatible=false;charset=utf-8');
        // Dynamic version from learned responses, fallback for initial requests only
        tposRestHeaders.set('tposappversion', getDynamicHeader('tposappversion') || '5.12.29.1');
        tposRestHeaders.set('Origin', 'https://tomato.tpos.vn');
        tposRestHeaders.set('Referer', 'https://tomato.tpos.vn/');
        tposRestHeaders.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');

        try {
          const restResponse = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: tposRestHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD'
              ? await request.arrayBuffer()
              : null,
          }, 3, 1000, 15000);

          console.log('[TPOS-REST-API] Response status:', restResponse.status);

          // Learn from TPOS response
          learnFromResponse(restResponse);

          const newRestResponse = new Response(restResponse.body, restResponse);
          newRestResponse.headers.set('Access-Control-Allow-Origin', '*');
          newRestResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newRestResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang');

          return newRestResponse;
        } catch (restError) {
          console.error('[TPOS-REST-API] Error:', restError.message);
          return new Response(JSON.stringify({
            error: 'TPOS REST API failed',
            message: restError.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } else if (pathname.startsWith('/api/')) {
        // TPOS API (catch-all) - forward to tomato.tpos.vn/api/...
        const apiPath = pathname.replace(/^\/api\//, '');
        targetUrl = `https://tomato.tpos.vn/${apiPath}${url.search}`;
        isTPOSRequest = true;
      } else {
        // Unknown route
        return new Response(JSON.stringify({
          error: 'Invalid API route',
          message: 'Use /api/* routes'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Build headers based on target API
      let headers;

      if (isTPOSRequest) {
        // TPOS API headers - copy from original request
        headers = new Headers(request.headers);
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');
      } else if (isPancakeRequest) {
        // Pancake API headers - build clean headers
        headers = new Headers();

        // Only forward essential headers
        const contentType = request.headers.get('Content-Type');
        if (contentType) {
          headers.set('Content-Type', contentType);
        }

        // Set Pancake-specific headers
        headers.set('Accept', 'application/json, text/plain, */*');
        headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
        headers.set('Origin', 'https://pancake.vn');
        headers.set('Referer', 'https://pancake.vn/multi_pages');
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36');
      } else {
        // Other APIs - copy all headers
        headers = new Headers(request.headers);
      }

      // Forward request
      const response = await fetchWithRetry(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : null,
      }, 3, 1000, 15000);

      // Clone response and add CORS headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Auth-Data, X-User-Id, tposappversion, x-tpos-lang');

      return newResponse;

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
