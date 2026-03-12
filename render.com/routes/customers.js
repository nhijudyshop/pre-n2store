/**
 * =====================================================
 * CUSTOMERS ROUTES - V1 REMOVED (410 Gone)
 * =====================================================
 *
 * All V1 endpoints have been permanently removed.
 * Source of truth: /api/v2/customers/*
 *
 * Monitor: Search logs for [V1-GONE] to find stragglers.
 * Safe to delete after no [V1-GONE] logs for 2 weeks.
 * =====================================================
 */

const express = require('express');
const router = express.Router();

router.all('*', (req, res) => {
    console.warn(`[V1-GONE] ${req.method} /api/customers${req.url} from ${req.ip}`);
    res.status(410).json({
        success: false,
        error: 'This V1 endpoint has been permanently removed. Use /api/v2/customers/ instead.',
        migration: { '/api/customers/*': '/api/v2/customers/*' }
    });
});

module.exports = router;
