// =====================================================
// GOOGLE CLOUD VISION PROXY ROUTE
// Proxy requests to Google Cloud Vision API with server-side API key
// =====================================================

const express = require('express');
const router = express.Router();

// API Key from environment variable (set on Render)
const GOOGLE_CLOUD_VISION_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Google Cloud Vision Proxy',
        hasApiKey: !!GOOGLE_CLOUD_VISION_API_KEY
    });
});

// OCR endpoint
// POST /api/google-vision/ocr
// Body: { image: base64String, languageHints?: ['vi', 'en'] }
router.post('/ocr', async (req, res) => {
    try {
        if (!GOOGLE_CLOUD_VISION_API_KEY) {
            return res.status(500).json({
                error: { message: 'GOOGLE_CLOUD_VISION_API_KEY not configured on server' }
            });
        }

        const { image, languageHints = ['vi', 'en'] } = req.body;

        if (!image) {
            return res.status(400).json({
                error: { message: 'Invalid request: image (base64) is required' }
            });
        }

        console.log('[GOOGLE-VISION] OCR request received');

        const apiUrl = `${GOOGLE_VISION_API_URL}?key=${GOOGLE_CLOUD_VISION_API_KEY}`;

        const requestBody = {
            requests: [{
                image: { content: image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                imageContext: { languageHints }
            }]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            console.error('[GOOGLE-VISION] API error:', data.error.message);
        } else {
            const textLength = data.responses?.[0]?.fullTextAnnotation?.text?.length || 0;
            console.log(`[GOOGLE-VISION] Success - Extracted ${textLength} characters`);
        }

        res.json(data);

    } catch (error) {
        console.error('[GOOGLE-VISION] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

module.exports = router;
