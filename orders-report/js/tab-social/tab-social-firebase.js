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
let _socialTagsUnsubscribe = null;
let _firestoreAvailable = null; // null = unknown, true/false after check
let _lastOrdersSnapshotHash = null; // Track data hash to skip redundant re-renders

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
 * Load tags from Firestore (source of truth).
 * Recovers orphan tags from orders if missing from the tag list.
 * Falls back to localStorage only if Firestore is unavailable.
 * NEVER overwrites Firestore with DEFAULT_TAGS blindly.
 * @returns {Promise<Array>} Array of tags
 */
async function loadSocialTagsFromFirebase() {
    const db = _getFirestoreDB();
    if (!db) {
        console.warn('[SocialFirebase] Firestore not available for tags, using local cache');
        // Prefer IndexedDB (has images), fallback to localStorage
        if (typeof loadSocialTagsFromStorageAsync === 'function') {
            return await loadSocialTagsFromStorageAsync();
        }
        return loadSocialTagsFromStorage();
    }

    try {
        const doc = await db.collection(SOCIAL_TAGS_COLLECTION).doc('tags').get();

        let tags = [];
        if (doc.exists && doc.data().tags && doc.data().tags.length > 0) {
            tags = doc.data().tags;
            console.log('[SocialFirebase] Loaded', tags.length, 'tags from Firestore');
        } else {
            // No tags in Firestore yet. Try local cache first (may have user-created tags)
            let localTags;
            if (typeof loadSocialTagsFromStorageAsync === 'function') {
                localTags = await loadSocialTagsFromStorageAsync();
            } else {
                localTags = loadSocialTagsFromStorage();
            }
            // Only use local tags if they are NOT just the defaults
            const defaultIds = new Set(DEFAULT_TAGS.map(t => t.id));
            const hasCustomTags = localTags.some(t => !defaultIds.has(t.id));
            if (hasCustomTags || localTags.length > DEFAULT_TAGS.length) {
                tags = localTags;
                console.log('[SocialFirebase] Using local cache tags (has custom tags):', tags.length);
            } else {
                tags = DEFAULT_TAGS;
                console.log('[SocialFirebase] Using default tags');
            }
            // Save to Firestore for first time
            await saveSocialTagsToFirebase(tags);
        }

        // Recovery: scan orders for tags not in the tags list
        tags = recoverOrphanTags(tags);

        SocialOrderState.tags = tags;
        saveSocialTagsToStorage(); // Saves to both IndexedDB + localStorage
        return tags;
    } catch (e) {
        console.error('[SocialFirebase] Error loading tags:', e);
        // On error, use local cache but NEVER save back to Firestore
        if (typeof loadSocialTagsFromStorageAsync === 'function') {
            return await loadSocialTagsFromStorageAsync();
        }
        return loadSocialTagsFromStorage();
    }
}

/**
 * Recover tags that exist on orders but are missing from the tag list.
 * This prevents data loss when tags get accidentally removed from the list.
 * @param {Array} currentTags - Current tag list
 * @returns {Array} Tag list with recovered orphan tags
 */
function recoverOrphanTags(currentTags) {
    const tagIds = new Set(currentTags.map(t => t.id));
    const orphanTags = [];

    // Scan all orders for tags not in the current list
    (SocialOrderState.orders || []).forEach(order => {
        (order.tags || []).forEach(tag => {
            if (tag.id && !tagIds.has(tag.id)) {
                tagIds.add(tag.id); // avoid duplicates
                orphanTags.push({
                    id: tag.id,
                    name: tag.name || 'Unknown',
                    color: tag.color || '#6b7280',
                    image: tag.image || undefined,
                    recoveredAt: Date.now()
                });
            }
        });
    });

    if (orphanTags.length > 0) {
        console.warn('[SocialFirebase] Recovered', orphanTags.length, 'orphan tags from orders:', orphanTags.map(t => t.name));
        const merged = [...currentTags, ...orphanTags];
        // Save recovered tags back to Firestore
        saveSocialTagsToFirebase(merged);
        return merged;
    }

    return currentTags;
}

// ===== SAVE TAGS TO FIRESTORE =====
/**
 * Save tags to Firestore. This is the primary storage.
 * @param {Array} tags - Tags array to save
 */
async function saveSocialTagsToFirebase(tags) {
    const db = _getFirestoreDB();
    if (!db) {
        console.warn('[SocialFirebase] Cannot save tags to Firestore (offline)');
        return;
    }

    const tagsToSave = tags || SocialOrderState.tags;
    try {
        await db.collection(SOCIAL_TAGS_COLLECTION).doc('tags').set({
            tags: tagsToSave,
            updatedAt: Date.now()
        });
        console.log('[SocialFirebase] Saved', tagsToSave.length, 'tags to Firestore');
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

                // Quick hash to detect actual data changes (avoid redundant re-renders)
                const snapshotHash = orders.map(o => o.id + ':' + (o.updatedAt || o.createdAt || '')).join('|');
                if (snapshotHash === _lastOrdersSnapshotHash) {
                    console.log('[SocialFirebase] Real-time: no changes detected, skipping re-render (' + orders.length + ' orders)');
                    return;
                }
                _lastOrdersSnapshotHash = snapshotHash;

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

// ===== REAL-TIME LISTENER FOR TAGS =====
/**
 * Setup Firestore real-time listener for tags (cross-device sync).
 * Ensures tags are always up-to-date from Firestore.
 */
function setupSocialTagsListener() {
    const db = _getFirestoreDB();
    if (!db) return () => {};

    if (_socialTagsUnsubscribe) {
        console.log('[SocialFirebase] Tags listener already active');
        return _socialTagsUnsubscribe;
    }

    try {
        _socialTagsUnsubscribe = db.collection(SOCIAL_TAGS_COLLECTION).doc('tags')
            .onSnapshot(doc => {
                if (doc.exists && doc.data().tags) {
                    const remoteTags = doc.data().tags;
                    // Only update if remote has data (never overwrite with empty)
                    if (remoteTags.length > 0) {
                        SocialOrderState.tags = remoteTags;
                        saveSocialTagsToStorage();

                        // Re-render UI if visible
                        if (typeof populateTagFilter === 'function') populateTagFilter();
                        if (typeof renderTagPanelCards === 'function') renderTagPanelCards();

                        console.log('[SocialFirebase] Tags real-time update:', remoteTags.length, 'tags');
                    }
                }
            }, error => {
                console.error('[SocialFirebase] Tags listener error:', error);
                _socialTagsUnsubscribe = null;
            });

        console.log('[SocialFirebase] Tags real-time listener active');
        return _socialTagsUnsubscribe;
    } catch (e) {
        console.error('[SocialFirebase] Error setting up tags listener:', e);
        return () => {};
    }
}

/**
 * Stop the real-time listeners
 */
function stopSocialOrdersListener() {
    if (_socialOrdersUnsubscribe) {
        _socialOrdersUnsubscribe();
        _socialOrdersUnsubscribe = null;
        console.log('[SocialFirebase] Orders listener stopped');
    }
    if (_socialTagsUnsubscribe) {
        _socialTagsUnsubscribe();
        _socialTagsUnsubscribe = null;
        console.log('[SocialFirebase] Tags listener stopped');
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
window.setupSocialTagsListener = setupSocialTagsListener;
window.stopSocialOrdersListener = stopSocialOrdersListener;
window.isFirestoreAvailable = isFirestoreAvailable;
window.getNextSTT = getNextSTT;
window.orderIdExists = orderIdExists;
