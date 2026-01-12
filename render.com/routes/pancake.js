// =====================================================
// PANCAKE ROUTE - /api/pancake/*
// Proxy to Pancake Chat API endpoint
// =====================================================

const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const PANCAKE_BASE = 'https://pancake.vn/api/v1';

// Create HTTPS agent (for consistency, though Pancake likely has valid cert)
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

// GET /api/pancake/* - Proxy all Pancake requests
router.all('/*', async (req, res) => {
    try {
        const path = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        const fullUrl = `${PANCAKE_BASE}/${path}${queryString ? '?' + queryString : ''}`;

        console.log(`[PANCAKE] ${req.method} ${fullUrl}`);

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json'
        };

        // Copy authorization if present
        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

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

        // Forward request to Pancake API
        const response = await fetchWithTimeout(fullUrl, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Pancake API responded with ${response.status}: ${response.statusText}. Details: ${errorText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const rawText = await response.text();
            throw new Error(`Invalid JSON response from Pancake. Original error: ${parseError.message}. Raw response: ${rawText}`);
        }

        console.log(`[PANCAKE] ✅ Success`);

        // Return data
        res.json(data);

    } catch (error) {
        console.error('[PANCAKE] ❌ Error:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.name || 'PancakeError',
            message: error.message
        });
    }
});

module.exports = router;
