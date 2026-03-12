/**
 * Shared Universal Modules
 * Works in both Browser and Node.js environments
 *
 * @module shared/universal
 */

// Fetch utilities
export {
    delay,
    fetchWithTimeout,
    simpleFetch,
    safeFetch,
} from './fetch-utils.js';

// API endpoints configuration
export {
    API_ENDPOINTS,
    buildTposODataUrl,
    buildPancakeUrl,
    buildFacebookGraphUrl,
    buildWorkerUrl,
} from './api-endpoints.js';

// CORS utilities
export {
    CORS_HEADERS,
    CORS_HEADERS_SIMPLE,
    corsResponse,
    corsPreflightResponse,
    corsErrorResponse,
    corsSuccessResponse,
    addCorsHeaders,
    proxyResponseWithCors,
} from './cors-headers.js';

// Facebook constants
export {
    FACEBOOK_CONFIG,
    isCommentConversation,
    buildGraphUrl,
    buildMessagePayload,
    buildImageAttachment,
    buildAttachmentById,
} from './facebook-constants.js';

// TPOS Client
export {
    TPOS_CONFIG,
    TPOSClient,
    TPOS_ENDPOINTS,
    buildODataFilter,
    buildODataExpand,
    createBrowserTPOSClient,
    createNodeTPOSClient,
} from './tpos-client.js';

// TPOS OData Service
export {
    TPOSODataService,
    ORDER_STATUS,
    getTodayRange,
    getLastNDaysRange,
    getThisMonthRange,
    createODataService,
} from './tpos-odata.js';
