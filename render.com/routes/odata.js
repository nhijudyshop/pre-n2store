// =====================================================
// ODATA ROUTE - /api/odata/*
// Proxy to TPOS OData endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const TPOS_ODATA_BASE = 'https://services.tpos.dev/api/odata';

// Create HTTPS agent that ignores SSL certificate errors
// TPOS uses self-signed certificate
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

// GET /api/odata/* - Proxy all OData requests
router.all('/*', async (req, res) => {
    try {
        const path = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const fullUrl = `${TPOS_ODATA_BASE}/${path}${queryString ? '?' + queryString : ''}`;

        console.log(`[ODATA] ${req.method} ${fullUrl}`);

        // Get authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'Missing Authorization header'
            });
        }

        // Prepare headers
        const headers = {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        };

        // Prepare request options
        const options = {
            method: req.method,
            headers: headers,
            agent: httpsAgent  // Use agent that ignores SSL errors
        };

        // Add body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            options.body = JSON.stringify(req.body);
        }

        // Forward request to TPOS
        const response = await fetchWithTimeout(fullUrl, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`TPOS OData API responded with ${response.status}: ${response.statusText}. Details: ${errorText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const rawText = await response.text();
            throw new Error(`Invalid JSON response from TPOS. Original error: ${parseError.message}. Raw response: ${rawText}`);
        }

        console.log(`[ODATA] ✅ Success`);

        // Return data
        res.json(data);

    } catch (error) {
        console.error('[ODATA] ❌ Error:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.name || 'ODataError',
            message: error.message
        });
    }
});

module.exports = router;
