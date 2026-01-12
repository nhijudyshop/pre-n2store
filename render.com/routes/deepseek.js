// =====================================================
// DEEPSEEK AI PROXY ROUTE
// Proxy requests to DeepSeek API with server-side API key
// =====================================================

const express = require('express');
const router = express.Router();

// API Key from environment variable (set on Render)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DeepSeek AI Proxy',
        hasApiKey: !!DEEPSEEK_API_KEY,
        availableModels: [
            'deepseek-chat',
            'deepseek-coder',
            'deepseek-reasoner'
        ],
        endpoints: [
            'POST /chat - Chat completions',
            'POST /ocr - OCR with vision model'
        ]
    });
});

// Main chat endpoint
// POST /api/deepseek/chat
// Body: { model?: "deepseek-chat", messages: [...], max_tokens?: 4096, temperature?: 0.3 }
router.post('/chat', async (req, res) => {
    try {
        if (!DEEPSEEK_API_KEY) {
            return res.status(500).json({
                error: { message: 'DEEPSEEK_API_KEY not configured on server' }
            });
        }

        const {
            model = 'deepseek-chat',
            messages,
            max_tokens = 4096,
            temperature = 0.3
        } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: { message: 'Invalid request: messages array is required' }
            });
        }

        console.log(`[DEEPSEEK] Chat request to ${model} with ${messages.length} message(s)`);

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens,
                temperature
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('[DEEPSEEK] API error:', data.error.message || data.error);
        } else {
            const tokens = data.usage?.total_tokens || 'N/A';
            console.log(`[DEEPSEEK] Success - Tokens: ${tokens}`);
        }

        res.json(data);

    } catch (error) {
        console.error('[DEEPSEEK] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

// OCR endpoint using DeepSeek Vision
// POST /api/deepseek/ocr
// Body: { image: "base64 or url", prompt?: "custom prompt" }
router.post('/ocr', async (req, res) => {
    try {
        if (!DEEPSEEK_API_KEY) {
            return res.status(500).json({
                error: { message: 'DEEPSEEK_API_KEY not configured on server' }
            });
        }

        const { image, prompt = 'Extract all text from this image. Return only the extracted text, no explanations.' } = req.body;

        if (!image) {
            return res.status(400).json({
                error: { message: 'Invalid request: image is required (base64 or URL)' }
            });
        }

        console.log('[DEEPSEEK] OCR request');

        // Determine if image is URL or base64
        const imageContent = image.startsWith('http')
            ? { type: 'image_url', image_url: { url: image } }
            : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } };

        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    imageContent
                ]
            }
        ];

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: messages,
                max_tokens: 4096
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('[DEEPSEEK] OCR error:', data.error.message || data.error);
            res.json(data);
        } else {
            const extractedText = data.choices?.[0]?.message?.content || '';
            console.log('[DEEPSEEK] OCR success');
            res.json({
                success: true,
                text: extractedText,
                raw: data
            });
        }

    } catch (error) {
        console.error('[DEEPSEEK] OCR error:', error.message);
        res.status(500).json({
            error: { message: 'OCR error: ' + error.message }
        });
    }
});

module.exports = router;
