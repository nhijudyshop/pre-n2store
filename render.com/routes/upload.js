// =====================================================
// UPLOAD ROUTE
// Handles image uploads from web frontend to Firebase Storage
// Uses Firebase Admin SDK to bypass CORS issues
// =====================================================

const express = require('express');
const router = express.Router();
const firebaseStorageService = require('../services/firebase-storage-service');

// CORS middleware for all upload routes
const setCorsHeaders = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Data, X-User-Id');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    next();
};

// Apply CORS to all routes in this router
router.use(setCorsHeaders);

// Handle OPTIONS preflight requests
router.options('*', (req, res) => {
    res.status(204).send();
});

/**
 * Upload image from web frontend
 * POST /api/upload/image
 * Body: { image: "base64_string", fileName: "invoice_123.jpg", folderPath: "invoices", mimeType: "image/jpeg" }
 */
router.post('/image', async (req, res) => {
    try {
        const { image, fileName, folderPath, mimeType } = req.body;

        // Validation
        if (!image || !fileName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: image, fileName'
            });
        }

        // Upload to Firebase Storage using shared service
        const imageUrl = await firebaseStorageService.uploadBase64Image(
            image,
            fileName,
            folderPath || 'uploads',
            mimeType || 'image/jpeg'
        );

        console.log('[UPLOAD] Frontend image uploaded:', imageUrl);

        res.json({
            success: true,
            url: imageUrl,
            fileName: fileName,
            folderPath: folderPath || 'uploads'
        });

    } catch (error) {
        console.error('[UPLOAD] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Delete image
 * DELETE /api/upload/image
 * Body: { url: "https://firebasestorage.googleapis.com/..." }
 */
router.delete('/image', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Missing image URL'
            });
        }

        const deleted = await firebaseStorageService.deleteImage(url);

        res.json({
            success: deleted,
            message: deleted ? 'Image deleted successfully' : 'Image not found or already deleted'
        });

    } catch (error) {
        console.error('[UPLOAD] Delete error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check
 * GET /api/upload/health
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Upload Service',
        features: ['image_upload', 'image_delete', 'firebase_admin_sdk'],
        supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
});

module.exports = router;
