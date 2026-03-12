// =====================================================
// GOONG.IO PLACES API PROXY ROUTE
// Proxy requests to Goong.io Autocomplete API with server-side API key
// Docs: https://docs.goong.io/rest/place
// =====================================================

const express = require('express');
const router = express.Router();

const GOONG_API_KEY = process.env.GOONG_API_KEY;
const GOONG_API_URL = 'https://rsapi.goong.io/Place/AutoComplete';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Goong.io Places Autocomplete Proxy',
        hasApiKey: !!GOONG_API_KEY
    });
});

// Autocomplete endpoint
// GET /api/goong-places/autocomplete?input=123+nguyễn+huệ
router.get('/autocomplete', async (req, res) => {
    try {
        if (!GOONG_API_KEY) {
            return res.status(500).json({
                error: { message: 'GOONG_API_KEY not configured on server' }
            });
        }

        const { input, limit = 5, more_compound = true } = req.query;

        if (!input || input.trim().length < 2) {
            return res.status(400).json({
                error: { message: 'Input must be at least 2 characters' }
            });
        }

        console.log(`[GOONG-PLACES] Autocomplete request: "${input.trim()}"`);

        const params = new URLSearchParams({
            input: input.trim(),
            api_key: GOONG_API_KEY,
            limit: String(limit),
            more_compound: String(more_compound)
        });

        const response = await fetch(`${GOONG_API_URL}?${params}`);
        const data = await response.json();

        if (data.status === 'OK') {
            const count = data.predictions?.length || 0;
            console.log(`[GOONG-PLACES] Success - ${count} predictions`);
        } else {
            console.error('[GOONG-PLACES] API error:', data.status);
        }

        res.json(data);

    } catch (error) {
        console.error('[GOONG-PLACES] Server error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

module.exports = router;
