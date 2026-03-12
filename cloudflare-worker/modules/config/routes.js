/**
 * Route Configuration
 * Maps URL patterns to handlers
 *
 * @module cloudflare-worker/modules/config/routes
 */

/**
 * Route definitions
 * Each route has: pattern, handler, method (optional)
 */
export const ROUTES = {
    // Token
    TOKEN: { pattern: '/api/token', method: 'POST' },

    // Image proxies
    IMAGE_PROXY: { pattern: '/api/image-proxy', method: 'GET' },
    FB_AVATAR: { pattern: '/api/fb-avatar', method: 'GET' },
    PANCAKE_AVATAR: { pattern: '/api/pancake-avatar', method: 'GET' },
    IMGBB_UPLOAD: { pattern: '/api/imgbb-upload', method: 'POST' },

    // Upload (proxy to render.com)
    UPLOAD: { pattern: '/api/upload/*' },

    // Facebook
    FACEBOOK_SEND: { pattern: '/api/facebook-send', method: 'POST' },
    FACEBOOK_LIVE: { pattern: '/api/facebook-graph/livevideo', method: 'GET' },

    // Pancake
    PANCAKE_DIRECT: { pattern: '/api/pancake-direct/*' },
    PANCAKE_OFFICIAL: { pattern: '/api/pancake-official/*' },
    PANCAKE: { pattern: '/api/pancake/*' },

    // TPOS
    TPOS_EXPORT_V2: { pattern: '/api/Product/ExportProductV2', method: 'POST' },
    TPOS_EXPORT_STANDARD: { pattern: '/api/Product/ExportFileWithStandardPriceV2', method: 'POST' },
    TPOS_ORDER_LINES: { pattern: '/tpos/order/:id/lines', method: 'GET' },
    TPOS_ORDER_REF_LINES: { pattern: '/tpos/order-ref/:ref/lines', method: 'GET' },
    TPOS_REST: { pattern: '/api/rest/*' },

    // AI
    DEEPSEEK: { pattern: '/api/deepseek', method: 'POST' },
    DEEPSEEK_OCR: { pattern: '/api/deepseek-ocr', method: 'POST' },

    // Proxy
    GENERIC_PROXY: { pattern: '/api/proxy' },
    SEPAY: { pattern: '/api/sepay/*' },
    REALTIME: { pattern: '/api/realtime/*' },
    CHAT: { pattern: '/api/chat/*' },
    CUSTOMERS: { pattern: '/api/customers/*' },

    // Customer 360 v2 (NEW - unified API)
    CUSTOMERS_V2: { pattern: '/api/v2/customers/*' },
    WALLETS_V2: { pattern: '/api/v2/wallets/*' },
    TICKETS_V2: { pattern: '/api/v2/tickets/*' },
    BALANCE_HISTORY_V2: { pattern: '/api/v2/balance-history/*' },
    ANALYTICS_V2: { pattern: '/api/v2/analytics/*' },

    // Customer 360 v1 (legacy)
    CUSTOMER_360: { pattern: '/api/customer360/*' },
    CUSTOMER: { pattern: '/api/customer/*' },
    WALLET: { pattern: '/api/wallet/*' },
    TICKET: { pattern: '/api/ticket*' },
    CUSTOMER_SEARCH: { pattern: '/api/customer-search*' },
    TRANSACTIONS: { pattern: '/api/transactions/*' },
    BALANCE_HISTORY: { pattern: '/api/balance-history/*' },
};

/**
 * Match a pathname against route patterns
 * @param {string} pathname - URL pathname
 * @returns {string|null} Route key or null
 */
export function matchRoute(pathname) {
    // Exact matches first
    if (pathname === '/api/token') return 'TOKEN';
    if (pathname === '/api/image-proxy') return 'IMAGE_PROXY';
    if (pathname === '/api/fb-avatar') return 'FB_AVATAR';
    if (pathname === '/api/pancake-avatar') return 'PANCAKE_AVATAR';
    if (pathname === '/api/imgbb-upload') return 'IMGBB_UPLOAD';
    if (pathname === '/api/facebook-send') return 'FACEBOOK_SEND';
    if (pathname === '/api/facebook-graph/livevideo') return 'FACEBOOK_LIVE';
    if (pathname === '/api/facebook-graph') return 'FACEBOOK_GRAPH';
    if (pathname === '/api/deepseek') return 'DEEPSEEK';
    if (pathname === '/api/deepseek-ocr') return 'DEEPSEEK_OCR';
    if (pathname === '/api/Product/ExportProductV2') return 'TPOS_EXPORT_V2';
    if (pathname === '/api/Product/ExportFileWithStandardPriceV2') return 'TPOS_EXPORT_STANDARD';
    if (pathname === '/api/proxy') return 'GENERIC_PROXY';

    // Pattern matches
    if (pathname.startsWith('/api/upload/')) return 'UPLOAD';
    if (pathname.startsWith('/api/pancake-direct/')) return 'PANCAKE_DIRECT';
    if (pathname.startsWith('/api/pancake-official/')) return 'PANCAKE_OFFICIAL';
    if (pathname.startsWith('/api/pancake/')) return 'PANCAKE';

    if (pathname.startsWith('/api/rest/')) return 'TPOS_REST';

    if (pathname.startsWith('/api/sepay/')) return 'SEPAY';
    if (pathname.startsWith('/api/realtime/')) return 'REALTIME';
    if (pathname.startsWith('/api/chat/')) return 'CHAT';
    if (pathname.startsWith('/api/customers/') || pathname === '/api/customers') return 'CUSTOMERS';

    // Customer 360 v2 routes (match FIRST before v1)
    if (pathname.startsWith('/api/v2/customers/') || pathname === '/api/v2/customers') return 'CUSTOMERS_V2';
    if (pathname.startsWith('/api/v2/wallets/') || pathname === '/api/v2/wallets') return 'WALLETS_V2';
    if (pathname.startsWith('/api/v2/wallet/')) return 'WALLETS_V2'; // Singular alias
    if (pathname.startsWith('/api/v2/tickets/') || pathname === '/api/v2/tickets') return 'TICKETS_V2';
    if (pathname.startsWith('/api/v2/balance-history/')) return 'BALANCE_HISTORY_V2';
    if (pathname.startsWith('/api/v2/analytics/') || pathname === '/api/v2/analytics') return 'ANALYTICS_V2';

    // Customer 360 v1 routes (legacy)
    if (pathname.startsWith('/api/customer360/')) return 'CUSTOMER_360';
    if (pathname.startsWith('/api/customer/')) return 'CUSTOMER';
    if (pathname.startsWith('/api/wallet/')) return 'WALLET';
    if (pathname.startsWith('/api/ticket')) return 'TICKET';
    if (pathname.startsWith('/api/customer-search')) return 'CUSTOMER_SEARCH';
    if (pathname.startsWith('/api/transactions/')) return 'TRANSACTIONS';
    if (pathname.startsWith('/api/balance-history/')) return 'BALANCE_HISTORY';

    // TPOS Order patterns
    if (/^\/tpos\/order\/\d+\/lines$/.test(pathname)) return 'TPOS_ORDER_LINES';
    if (/^\/tpos\/order-ref\/.+\/lines$/.test(pathname)) return 'TPOS_ORDER_REF_LINES';

    // Catch-all for /api/* (TPOS generic)
    if (pathname.startsWith('/api/')) return 'TPOS_GENERIC';

    return null;
}
