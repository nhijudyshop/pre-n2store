/**
 * =====================================================
 * CUSTOMER 360 ROUTES - V1 REMOVED (410 Gone)
 * =====================================================
 *
 * All V1 endpoints have been permanently removed.
 * All logic lives in V2 routes:
 *   - /api/v2/customers/*
 *   - /api/v2/wallets/*
 *   - /api/v2/tickets/*
 *   - /api/v2/balance-history/*
 *
 * This file returns 410 Gone for any remaining callers
 * so we can track and update them via server logs.
 *
 * Monitor: Search logs for [V1-GONE] to find stragglers.
 * Safe to delete after no [V1-GONE] logs for 2 weeks.
 * =====================================================
 */

const express = require('express');
const router = express.Router();

function gone(req, res) {
    console.warn(`[V1-GONE] ${req.method} ${req.originalUrl} from ${req.ip}`);
    res.status(410).json({
        success: false,
        error: 'This V1 endpoint has been permanently removed. Use /api/v2/ instead.',
        migration: {
            '/api/customer/*': '/api/v2/customers/*',
            '/api/wallet/*': '/api/v2/wallets/*',
            '/api/ticket/*': '/api/v2/tickets/*',
            '/api/balance-history/*': '/api/v2/balance-history/*',
            '/api/customer-search-v2': '/api/v2/customers/search',
            '/api/transactions/*': '/api/v2/customers/:id/transactions'
        }
    });
}

router.all('/customer-search-v2', gone);
router.all('/customer/*', gone);
router.all('/customer', gone);
router.all('/wallet/batch-summary', gone);
router.all('/wallet/cron/*', gone);
router.all('/wallet/:phone', gone);
router.all('/wallet/:phone/*', gone);
router.all('/ticket/*', gone);
router.all('/ticket', gone);
router.all('/balance-history/*', gone);
router.all('/transactions/*', gone);

module.exports = router;
