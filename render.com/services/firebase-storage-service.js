// =====================================================
// FIREBASE STORAGE SERVICE
// Reusable server-side Firebase Admin SDK module
// Used by: Telegram bot, Web upload endpoint, etc.
// =====================================================

const admin = require('firebase-admin');

const FIREBASE_STORAGE_BUCKET = 'n2shop-69e37-ne0q1';
let storageInstance = null;
let isFirebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK (singleton pattern)
 */
function initializeFirebase() {
    if (isFirebaseInitialized) {
        console.log('[FIREBASE-STORAGE] Already initialized');
        return;
    }

    try {
        // Check if Firebase is already initialized by another module
        if (admin.apps.length === 0) {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (!projectId || !clientEmail || !privateKey) {
                throw new Error('Missing Firebase credentials in environment variables');
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey
                }),
                storageBucket: FIREBASE_STORAGE_BUCKET
            });

            console.log('[FIREBASE-STORAGE] Initialized for project:', projectId);
        }

        isFirebaseInitialized = true;
    } catch (error) {
        console.error('[FIREBASE-STORAGE] Initialization error:', error.message);
        throw error;
    }
}

/**
 * Get Firebase Storage bucket instance
 */
function getStorageBucket() {
    if (storageInstance) {
        return storageInstance;
    }

    // Ensure Firebase is initialized
    initializeFirebase();

    try {
        storageInstance = admin.storage().bucket(FIREBASE_STORAGE_BUCKET);
        console.log('[FIREBASE-STORAGE] Storage bucket ready:', FIREBASE_STORAGE_BUCKET);
        return storageInstance;
    } catch (error) {
        console.error('[FIREBASE-STORAGE] Bucket initialization error:', error.message);
        throw error;
    }
}

/**
 * Upload image buffer to Firebase Storage
 * @param {Buffer} imageBuffer - Image data as buffer
 * @param {string} fileName - File name for storage
 * @param {string} folderPath - Folder path (e.g., "invoices", "order_bookings")
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<string>} Public download URL
 */
async function uploadImageBuffer(imageBuffer, fileName, folderPath = 'uploads', mimeType = 'image/jpeg') {
    const bucket = getStorageBucket();

    const filePath = `inventory-tracking/${folderPath}/${fileName}`;
    const file = bucket.file(filePath);

    // Generate a unique download token
    const crypto = require('crypto');
    const uuid = crypto.randomUUID();

    // Upload the file with metadata
    await file.save(imageBuffer, {
        metadata: {
            contentType: mimeType,
            metadata: {
                firebaseStorageDownloadTokens: uuid
            }
        }
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Generate Firebase Storage download URL
    const encodedPath = encodeURIComponent(filePath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${uuid}`;

    console.log('[FIREBASE-STORAGE] Image uploaded:', downloadUrl);
    return downloadUrl;
}

/**
 * Upload base64 image to Firebase Storage
 * @param {string} base64Image - Base64 encoded image (with or without data URI prefix)
 * @param {string} fileName - File name for storage
 * @param {string} folderPath - Folder path (e.g., "invoices", "order_bookings")
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<string>} Public download URL
 */
async function uploadBase64Image(base64Image, fileName, folderPath = 'uploads', mimeType = 'image/jpeg') {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    return uploadImageBuffer(buffer, fileName, folderPath, mimeType);
}

/**
 * Delete image from Firebase Storage
 * @param {string} imageUrl - Public URL of the image to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteImage(imageUrl) {
    const bucket = getStorageBucket();

    let filePath = null;

    // Handle Firebase Storage download URL format
    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?alt=media&token={token}
    const firebaseUrlPattern = /firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/;
    const firebaseMatch = imageUrl.match(firebaseUrlPattern);
    if (firebaseMatch) {
        filePath = decodeURIComponent(firebaseMatch[1]);
    }

    // Handle Google Cloud Storage URL format
    // https://storage.googleapis.com/{bucket}/{path}
    const gcsBaseUrl = `https://storage.googleapis.com/${FIREBASE_STORAGE_BUCKET}/`;
    if (!filePath && imageUrl.startsWith(gcsBaseUrl)) {
        filePath = imageUrl.replace(gcsBaseUrl, '');
    }

    if (!filePath) {
        console.log('[FIREBASE-STORAGE] Unknown URL format, skipping delete:', imageUrl);
        return false;
    }

    const file = bucket.file(filePath);

    try {
        await file.delete();
        console.log('[FIREBASE-STORAGE] Image deleted:', filePath);
        return true;
    } catch (error) {
        console.error('[FIREBASE-STORAGE] Delete error:', error.message);
        return false;
    }
}

/**
 * Get Firestore database instance
 */
function getFirestore() {
    initializeFirebase();
    return admin.firestore();
}

module.exports = {
    initializeFirebase,
    getStorageBucket,
    uploadImageBuffer,
    uploadBase64Image,
    deleteImage,
    getFirestore
};
