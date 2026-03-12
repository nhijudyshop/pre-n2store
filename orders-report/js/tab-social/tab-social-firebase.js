/**
 * Tab Social Orders - Firebase Module
 * Firestore CRUD operations + real-time sync
 *
 * Collection: social_orders
 * Each order = 1 document, doc ID = order.id
 * Firestore is source of truth, localStorage is offline cache
 */

// ===== CONSTANTS =====
const SOCIAL_ORDERS_COLLECTION = 'social_orders';
const SOCIAL_TAGS_COLLECTION = 'social_tags';

// ===== INTERNAL STATE =====
let _socialOrdersUnsubscribe = null;
let _firestoreAvailable = null; // null = unknown, true/false after check

// ===== FIRESTORE HELPER =====
function _getFirestoreDB() {
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
    } catch (e) {
        console.error('[SocialFirebase] Cannot get Firestore:', e);
    }
    return null;
}

/**
 * Check if Firestore is available (cached after first check)
 */
function isFirestoreAvailable() {
    if (_firestoreAvailable !== null) return _firestoreAvailable;
    _firestoreAvailable = _getFirestoreDB() !== null;
    return _firestoreAvailable;
}

// ===== LOAD ALL ORDERS FROM FIRESTORE =====
/**
 * Load all social orders from Firestore (source of truth).
 * Falls back to localStorage if Firestore unavailable.
 * @returns {Promise<Array>} Array of orders
 */
async function loadSocialOrdersFromFirebase() {
    const db = _getFirestoreDB();
    if (!db) {
        console.warn('[SocialFirebase] Firestore not available, using localStorage');
        return loadSocialOrdersFromStorage();
    }

    try {
        const snapshot = await db.collection(SOCIAL_ORDERS_COLLECTION)
            .orderBy('createdAt', 'desc')
            .get();

        const orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        console.log('[SocialFirebase] Loaded', orders.length, 'orders from Firestore');

        // Cache to localStorage
        SocialOrderState.orders = orders;
        saveSocialOrdersToStorage();

        return orders;
    } catch (e) {
        console.error('[SocialFirebase] Error loading orders:', e);
        // Fallback to localStorage
        return loadSocialOrdersFromStorage();
    }
}

// ===== LOAD TAGS FROM FIRESTORE =====
/**
 * Load tags from Firestore. Falls back to localStorage/defaults.
 * @returns {Promise<Array>} Array of tags
 */
async function loadSocialTagsFromFirebase() {
    const db = _getFirestoreDB();
    if (!db) {
        return loadSocialTagsFromStorage();
    }

    try {
        const doc = await db.collection(SOCIAL_TAGS_COLLECTION).doc('tags').get();

        if (doc.exists && doc.data().tags) {
            const tags = doc.data().tags;
            console.log('[SocialFirebase] Loaded', tags.length, 'tags from Firestore');
            SocialOrderState.tags = tags;
            saveSocialTagsToStorage();
            return tags;
        }

        // No tags doc yet — use defaults and save them
        const defaults = loadSocialTagsFromStorage();
        await saveSocialTagsToFirebase(defaults);
        return defaults;
    } catch (e) {
        console.error('[SocialFirebase] Error loading tags:', e);
        return loadSocialTagsFromStorage();
    }
}

// ===== SAVE TAGS TO FIRESTORE =====
async function saveSocialTagsToFirebase(tags) {
    const db = _getFirestoreDB();
    if (!db) return;

    try {
        await db.collection(SOCIAL_TAGS_COLLECTION).doc('tags').set({
            tags: tags || SocialOrderState.tags,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('[SocialFirebase] Error saving tags:', e);
    }
}

// ===== CREATE ORDER =====
/**
 * Save a new order to Firestore + localStorage
 * @param {Object} order - Order object to save
 * @returns {Promise<string>} Order ID
 */
async function createSocialOrder(order) {
    // Always save to localStorage first (instant UI)
    saveSocialOrdersToStorage();

    const db = _getFirestoreDB();
    if (!db) {
        console.warn('[SocialFirebase] Offline — order saved to localStorage only');
        return order.id;
    }

    try {
        // Use order.id as document ID for easy lookup
        await db.collection(SOCIAL_ORDERS_COLLECTION).doc(order.id).set({
            ...order,
            createdAt: order.createdAt || Date.now(),
            updatedAt: order.updatedAt || Date.now()
        });
        console.log('[SocialFirebase] Created order:', order.id);
    } catch (e) {
        console.error('[SocialFirebase] Error creating order:', e);
        showNotification('Lỗi lưu Firestore, đã lưu cục bộ', 'warning');
    }

    return order.id;
}

// ===== UPDATE ORDER =====
/**
 * Update an existing order in Firestore + localStorage
 * @param {string} orderId - Order ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateSocialOrder(orderId, updates) {
    // Always save to localStorage first
    saveSocialOrdersToStorage();

    const db = _getFirestoreDB();
    if (!db) return;

    try {
        await db.collection(SOCIAL_ORDERS_COLLECTION).doc(orderId).update({
            ...updates,
            updatedAt: Date.now()
        });
        console.log('[SocialFirebase] Updated order:', orderId);
    } catch (e) {
        console.error('[SocialFirebase] Error updating order:', e);
    }
}

// ===== DELETE ORDER =====
/**
 * Delete an order from Firestore + localStorage
 * @param {string} orderId - Order ID
 * @returns {Promise<void>}
 */
async function deleteSocialOrder(orderId) {
    // Always save to localStorage first
    saveSocialOrdersToStorage();

    const db = _getFirestoreDB();
    if (!db) return;

    try {
        await db.collection(SOCIAL_ORDERS_COLLECTION).doc(orderId).delete();
        console.log('[SocialFirebase] Deleted order:', orderId);
    } catch (e) {
        console.error('[SocialFirebase] Error deleting order:', e);
    }
}

// ===== BULK DELETE ORDERS =====
/**
 * Delete multiple orders from Firestore
 * @param {Array<string>} orderIds - Array of order IDs to delete
 * @returns {Promise<void>}
 */
async function bulkDeleteSocialOrders(orderIds) {
    // Always save to localStorage first
    saveSocialOrdersToStorage();

    const db = _getFirestoreDB();
    if (!db) return;

    try {
        const batch = db.batch();
        orderIds.forEach(id => {
            batch.delete(db.collection(SOCIAL_ORDERS_COLLECTION).doc(id));
        });
        await batch.commit();
        console.log('[SocialFirebase] Bulk deleted', orderIds.length, 'orders');
    } catch (e) {
        console.error('[SocialFirebase] Error bulk deleting:', e);
    }
}

// ===== UPDATE TAGS FOR ORDER =====
/**
 * Update tags for a specific order
 * @param {string} orderId - Order ID
 * @param {Array} tags - Array of tag objects
 * @returns {Promise<void>}
 */
async function updateSocialOrderTags(orderId, tags) {
    return updateSocialOrder(orderId, { tags });
}

// ===== GET SINGLE ORDER =====
/**
 * Get a single order by ID from Firestore
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} Order object or null
 */
async function getSocialOrderById(orderId) {
    const db = _getFirestoreDB();
    if (!db) {
        // Fallback to local state
        return SocialOrderState.orders.find(o => o.id === orderId) || null;
    }

    try {
        const doc = await db.collection(SOCIAL_ORDERS_COLLECTION).doc(orderId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (e) {
        console.error('[SocialFirebase] Error getting order:', e);
        return SocialOrderState.orders.find(o => o.id === orderId) || null;
    }
}

// ===== REAL-TIME LISTENER =====
/**
 * Setup Firestore real-time listener for cross-device sync
 * @returns {Function} Unsubscribe function
 */
function setupSocialOrdersListener() {
    const db = _getFirestoreDB();
    if (!db) {
        console.warn('[SocialFirebase] Firestore not available, skipping real-time listener');
        return () => {};
    }

    // Don't setup duplicate listeners
    if (_socialOrdersUnsubscribe) {
        console.log('[SocialFirebase] Listener already active');
        return _socialOrdersUnsubscribe;
    }

    try {
        _socialOrdersUnsubscribe = db.collection(SOCIAL_ORDERS_COLLECTION)
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                const orders = [];
                snapshot.forEach(doc => {
                    orders.push({ id: doc.id, ...doc.data() });
                });

                // Update state
                SocialOrderState.orders = orders;
                SocialOrderState.filteredOrders = [...orders];
                saveSocialOrdersToStorage();

                // Re-render if table is visible
                if (typeof performTableSearch === 'function') {
                    performTableSearch();
                }

                console.log('[SocialFirebase] Real-time update:', orders.length, 'orders');
            }, error => {
                console.error('[SocialFirebase] Listener error:', error);
                _socialOrdersUnsubscribe = null;
            });

        console.log('[SocialFirebase] Real-time listener active');
        return _socialOrdersUnsubscribe;
    } catch (e) {
        console.error('[SocialFirebase] Error setting up listener:', e);
        return () => {};
    }
}

/**
 * Stop the real-time listener
 */
function stopSocialOrdersListener() {
    if (_socialOrdersUnsubscribe) {
        _socialOrdersUnsubscribe();
        _socialOrdersUnsubscribe = null;
        console.log('[SocialFirebase] Listener stopped');
    }
}

// ===== HELPER FUNCTIONS =====

/**
 * Generate next STT (sequential number)
 * @returns {number} Next STT
 */
function getNextSTT() {
    if (SocialOrderState.orders.length === 0) return 1;
    const maxSTT = Math.max(...SocialOrderState.orders.map(o => o.stt || 0));
    return maxSTT + 1;
}

/**
 * Check if order ID exists
 * @param {string} orderId - Order ID to check
 * @returns {boolean}
 */
function orderIdExists(orderId) {
    return SocialOrderState.orders.some(o => o.id === orderId);
}

// ===== CLEANUP ON PAGE UNLOAD =====
window.addEventListener('beforeunload', () => {
    stopSocialOrdersListener();
});

// ===== EXPORTS =====
window.loadSocialOrdersFromFirebase = loadSocialOrdersFromFirebase;
window.loadSocialTagsFromFirebase = loadSocialTagsFromFirebase;
window.saveSocialTagsToFirebase = saveSocialTagsToFirebase;
window.createSocialOrder = createSocialOrder;
window.updateSocialOrder = updateSocialOrder;
window.deleteSocialOrder = deleteSocialOrder;
window.bulkDeleteSocialOrders = bulkDeleteSocialOrders;
window.updateSocialOrderTags = updateSocialOrderTags;
window.getSocialOrderById = getSocialOrderById;
window.setupSocialOrdersListener = setupSocialOrdersListener;
window.stopSocialOrdersListener = stopSocialOrdersListener;
window.isFirestoreAvailable = isFirestoreAvailable;
window.getNextSTT = getNextSTT;
window.orderIdExists = orderIdExists;
