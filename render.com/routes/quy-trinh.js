// =====================================================
// QUY TRINH ROUTES
// API endpoints for quy trình contributions MD export
// =====================================================

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../services/firebase-storage-service');

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

router.options('*', (req, res) => res.status(204).send());

/**
 * GET /api/quy-trinh/md
 * Returns the auto-generated contributions MD from Firestore
 */
router.get('/md', async (req, res) => {
    try {
        const db = getFirestore();
        const doc = await db.collection('quy-trinh-md').doc('contributions').get();

        if (!doc.exists) {
            return res.type('text/markdown').send('# Đóng góp Quy trình N2Store\n\n> Chưa có đóng góp nào.\n');
        }

        const data = doc.data();
        res.type('text/markdown').send(data.content || '');
    } catch (err) {
        console.error('[QuyTrinh] MD export error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/quy-trinh/notes
 * Returns all notes as JSON (for AI agent consumption)
 */
router.get('/notes', async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('quy-trinh-notes')
            .orderBy('createdAt', 'asc')
            .get();

        const notes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            notes.push({
                id: doc.id,
                noteId: data.noteId,
                content: data.content,
                images: data.images || [],
                author: data.author,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null
            });
        });

        res.json({ success: true, count: notes.length, notes });
    } catch (err) {
        console.error('[QuyTrinh] Notes fetch error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
