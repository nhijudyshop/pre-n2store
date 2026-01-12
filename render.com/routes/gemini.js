// =====================================================
// GEMINI AI PROXY ROUTE
// Proxy requests to Gemini API with server-side API key
// =====================================================

const express = require('express');
const router = express.Router();

// API Key from environment variable (set on Render)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Gemini AI Proxy',
        hasApiKey: !!GEMINI_API_KEY,
        availableModels: [
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ]
    });
});

// Main chat endpoint
// POST /api/gemini/chat
// Body: { model?: "gemini-2.0-flash", contents: [...] }
router.post('/chat', async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: { message: 'GEMINI_API_KEY not configured on server' }
            });
        }

        const { model = 'gemini-2.0-flash', contents, generationConfig } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: { message: 'Invalid request: contents array is required' }
            });
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        console.log(`[GEMINI] Request to ${model} with ${contents.length} content(s)`);

        const requestBody = { contents };
        if (generationConfig) {
            requestBody.generationConfig = generationConfig;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            console.error('[GEMINI] API error:', data.error.message);
        } else {
            console.log('[GEMINI] Success');
        }

        res.json(data);

    } catch (error) {
        console.error('[GEMINI] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

// Stream chat endpoint (for future use)
// POST /api/gemini/stream
router.post('/stream', async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: { message: 'GEMINI_API_KEY not configured on server' }
            });
        }

        const { model = 'gemini-2.0-flash', contents } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: { message: 'Invalid request: contents array is required' }
            });
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`;

        console.log(`[GEMINI] Stream request to ${model}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Pipe the response
        response.body.pipe(res);

    } catch (error) {
        console.error('[GEMINI] Stream error:', error.message);
        res.status(500).json({
            error: { message: 'Stream error: ' + error.message }
        });
    }
});

module.exports = router;
