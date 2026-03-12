/**
 * Shared Fetch Utilities
 * Works in both Browser and Node.js environments
 *
 * @module shared/universal/fetch-utils
 */

/**
 * Delays execution for a specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with a timeout
 * @param {string|Request} resource - The resource to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
 * @throws {Error} When request times out
 */
export async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
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
 * Simple fetch wrapper with default error handling
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} When response is not ok
 */
export async function simpleFetch(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Fetch with automatic JSON parsing and error handling
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {object} config - Additional configuration
 * @param {number} config.timeout - Timeout in ms
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function safeFetch(url, options = {}, config = {}) {
    const { timeout = 10000 } = config;

    try {
        const response = await fetchWithTimeout(url, options, timeout);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string|Request} resource - The resource to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} initialDelay - Initial delay in ms (default: 1000)
 * @param {number} timeout - Timeout per request in ms (default: 10000)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(resource, options = {}, maxRetries = 3, initialDelay = 1000, timeout = 10000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(resource, options, timeout);
            return response;
        } catch (error) {
            lastError = error;
            console.warn(`[FETCH-RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

            if (attempt < maxRetries) {
                const delayMs = initialDelay * Math.pow(2, attempt);
                console.log(`[FETCH-RETRY] Retrying in ${delayMs}ms...`);
                await delay(delayMs);
            }
        }
    }

    throw lastError;
}
