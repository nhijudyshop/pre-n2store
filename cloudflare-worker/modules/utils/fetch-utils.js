/**
 * Fetch Utilities for Cloudflare Worker
 * Re-exports from shared library
 *
 * @module cloudflare-worker/modules/utils/fetch-utils
 */

export {
    delay,
    fetchWithTimeout,
    fetchWithRetry,
    simpleFetch,
    safeFetch
} from '../../../shared/universal/fetch-utils.js';
