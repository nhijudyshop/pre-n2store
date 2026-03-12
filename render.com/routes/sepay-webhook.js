// =====================================================
// SEPAY WEBHOOK ROUTES - AGGREGATOR
// Imports and combines all sub-modules into a single router
// =====================================================

const express = require('express');
const router = express.Router();

// Import sub-modules
const core = require('./sepay-webhook-core');
const matching = require('./sepay-transaction-matching');
const walletOps = require('./sepay-wallet-operations');
const notification = require('./sepay-notification');

// Shared helper functions passed to sub-modules
const helpers = {
    fetchWithTimeout: core.fetchWithTimeout,
    upsertRecentTransfer: core.upsertRecentTransfer,
    broadcastBalanceUpdate: core.broadcastBalanceUpdate,
    searchTPOSByPartialPhone: matching.searchTPOSByPartialPhone
};

// Register all routes on the shared router
// Order matters: more specific routes should be registered first

// 1. Core routes: webhook handler, SSE stream, history, statistics, failed queue, gaps
core.registerRoutes(router, {
    processDebtUpdate: matching.processDebtUpdate
});

// 2. Transaction matching routes: debt summary, pending matches, TPOS search, batch update
matching.registerRoutes(router, helpers);

// 3. Wallet operation routes: customer info, transfer stats, aliases, transaction updates
walletOps.registerRoutes(router, helpers);

// 4. Notification routes: Telegram alerts (placeholder for future use)
notification.registerRoutes(router, helpers);

module.exports = router;
