// =====================================================
// IMAGE PROXY ROUTE
// Proxy images from img1.tpos.vn to bypass CORS
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * GET /api/image-proxy?url=<encoded_url>
 *
 * Proxies image requests to bypass CORS restrictions
 * Used by order-image-generator.js to fetch product images
 */
router.get('/', async (req, res) => {
    try {
        const imageUrl = req.query.url;

        if (!imageUrl) {
            return res.status(400).json({
                error: 'Missing url parameter',
                usage: '/api/image-proxy?url=<encoded_url>'
            });
        }

        console.log('[IMAGE-PROXY] Fetching:', imageUrl);

        // Fetch image from external source
        const response = await fetch(imageUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://tomato.tpos.vn/'
            }
        });

        if (!response.ok) {
            console.error('[IMAGE-PROXY] Failed:', response.status, response.statusText);
            return res.status(response.status).json({
                error: `Failed to fetch image: ${response.status} ${response.statusText}`
            });
        }

        // Get content type
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // Get image buffer
        const buffer = await response.arrayBuffer();

        console.log('[IMAGE-PROXY] Success:', buffer.byteLength, 'bytes', contentType);

        // Set CORS headers (already set by app.use(cors()) but explicit here)
        res.set({
            'Content-Type': contentType,
            'Content-Length': buffer.byteLength,
            'Cache-Control': 'public, max-age=86400', // Cache for 1 day
            'Access-Control-Allow-Origin': '*'
        });

        // Send image buffer
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('[IMAGE-PROXY] Error:', error);
        res.status(500).json({
            error: 'Failed to proxy image',
            message: error.message
        });
    }
});

module.exports = router;
