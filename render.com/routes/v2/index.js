/**
 * =====================================================
 * API V2 - UNIFIED CUSTOMER 360 ROUTES
 * =====================================================
 *
 * Consolidated API v2 structure for N2Store unified system
 *
 * Routes:
 *   /api/v2/customers/*       - Customer management & 360 view
 *   /api/v2/wallets/*         - Wallet operations
 *   /api/v2/tickets/*         - Ticket management
 *   /api/v2/balance-history/* - Bank transaction linking
 *   /api/v2/analytics/*       - Dashboard & analytics
 *
 * Created: 2026-01-12
 * Part of: Unified Architecture Plan
 * =====================================================
 */

const express = require('express');
const router = express.Router();

// Import sub-routers
const customersRouter = require('./customers');
const walletsRouter = require('./wallets');
const ticketsRouter = require('./tickets');
const balanceHistoryRouter = require('./balance-history');
const analyticsRouter = require('./analytics');
const pendingWithdrawalsRouter = require('./pending-withdrawals');

// Deprecation middleware for v1 endpoints (apply in main app)
const addDeprecationWarning = (req, res, next) => {
    // Add deprecation headers for v1 routes
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/v2/')) {
        res.set('Deprecation', 'true');
        res.set('Sunset', 'Sat, 01 Jul 2025 00:00:00 GMT');
        res.set('Link', '</api/v2/>; rel="successor-version"');
    }
    next();
};

// Mount sub-routers
router.use('/customers', customersRouter);
router.use('/wallets', walletsRouter);
router.use('/tickets', ticketsRouter);
router.use('/balance-history', balanceHistoryRouter);
router.use('/analytics', analyticsRouter);
router.use('/pending-withdrawals', pendingWithdrawalsRouter);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        modules: ['customers', 'wallets', 'tickets', 'balance-history', 'analytics', 'pending-withdrawals']
    });
});

// Export router and middleware
module.exports = router;
module.exports.deprecationMiddleware = addDeprecationWarning;
