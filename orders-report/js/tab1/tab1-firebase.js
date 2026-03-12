// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 2: FIREBASE & REALTIME TAG SYNC                   ║
// ║                            search: #FIREBASE                                ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// FIREBASE DATABASE REFERENCE FOR NOTE TRACKING #FIREBASE
// =====================================================
// Note: Firebase is already initialized in config.js which loads before this file
let database = null;
try {
    database = firebase.database();
    console.log('[NOTE-TRACKER] Firebase Realtime Database reference obtained');
} catch (error) {
    console.error('[NOTE-TRACKER] Firebase Realtime Database reference error:', error);
}

// Firestore reference for settings migration (employee_ranges, campaigns, etc.)
let firestoreDb = null;
try {
    firestoreDb = firebase.firestore();
    window.firestoreDb = firestoreDb; // Expose globally for debugging
    console.log('[TAB1] Firestore reference obtained');
} catch (error) {
    console.error('[TAB1] Firestore reference error:', error);
}

// =====================================================
// FILTER PREFERENCES - Firebase Sync #FIREBASE
// =====================================================

/**
 * Get current user ID for filter preferences (per-user storage)
 * @returns {string} - User ID from Firebase auth or localStorage fallback
 */
function getFilterPrefsUserId() {
    // Try to get from Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid;
    }
    // Try to get from window.campaignManager (initialized in HTML)
    if (window.campaignManager && window.campaignManager.currentUserId) {
        return window.campaignManager.currentUserId;
    }
    // Fallback to localStorage
    let userId = localStorage.getItem('orders_campaign_user_id');
    if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem('orders_campaign_user_id', userId);
    }
    return userId;
}

/**
 * Get filter preferences Firebase path for current user
 * @returns {string} - Firebase path like "user_preferences/{userId}/filter_preferences"
 */
function getFilterPrefsPath() {
    const userId = getFilterPrefsUserId();
    return `user_preferences/${userId}/filter_preferences`;
}

/**
 * [DEPRECATED] Save filter preferences to Firebase (per-user)
 * Dates are now stored in campaign objects directly.
 * This function is kept as a no-op stub for backward compatibility.
 */
async function saveFilterPreferencesToFirebase(prefs) {
    // No-op: Dates are now stored in campaign objects
    console.log('[FILTER-PREFS] ⚠️ DEPRECATED - Dates stored in campaign now');
    return;
}

/**
 * [DEPRECATED] Load filter preferences from Firebase (per-user)
 * Dates are now loaded from campaign objects directly.
 * This function is kept as a no-op stub for backward compatibility.
 */
async function loadFilterPreferencesFromFirebase() {
    // No-op: Dates are now loaded from campaign objects
    console.log('[FILTER-PREFS] ⚠️ DEPRECATED - Dates loaded from campaign now');
    return null;
}

// =====================================================
// REALTIME TAG SYNC - Firebase & WebSocket #FIREBASE
// =====================================================
let tagListenersSetup = false; // Flag to prevent duplicate listener setup

/**
 * Emit TAG update to Firebase for realtime sync across users
 */
async function emitTagUpdateToFirebase(orderId, tags) {
    if (!database) {
        console.warn('[TAG-REALTIME] Firebase not available, skipping emit');
        return;
    }

    try {
        // Get current order data - O(1) via OrderStore with fallback
        const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
        if (!order) {
            console.warn('[TAG-REALTIME] Order not found in allData:', orderId);
            return;
        }

        // Get current user display name from authManager
        let userName = 'Unknown User';
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        if (auth && auth.displayName) {
            userName = auth.displayName;
        }

        // ✅ Validate and normalize tags array
        const normalizedTags = Array.isArray(tags) ? tags : [];

        console.log('[TAG-REALTIME] Preparing to emit:', {
            orderId,
            orderCode: order.Code,
            STT: order.SessionIndex,
            tagsCount: normalizedTags.length,
            tags: normalizedTags,
            updatedBy: userName
        });

        // Emit to Firebase
        const updateData = {
            orderId: orderId,
            orderCode: order.Code || 'Unknown',
            STT: order.SessionIndex || 0,
            tags: normalizedTags, // Array of tag objects (can be empty array)
            updatedBy: userName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // Write to Firebase path: /tag_updates/{orderId}
        const refPath = `tag_updates/${orderId}`;
        await database.ref(refPath).set(updateData);

        console.log('[TAG-REALTIME] ✅ Tag update emitted successfully to Firebase:', refPath);
        console.log('[TAG-REALTIME] Data written:', updateData);
    } catch (error) {
        console.error('[TAG-REALTIME] ❌ Error emitting tag update:', error);
        console.error('[TAG-REALTIME] Error stack:', error.stack);
    }
}

/**
 * Setup Firebase & WebSocket listeners for realtime TAG updates
 */
function setupTagRealtimeListeners() {
    // Prevent duplicate setup
    if (tagListenersSetup) {
        console.log('[TAG-REALTIME] Listeners already setup, skipping...');
        return;
    }

    // 1. Setup Firebase listener
    if (database) {
        const refPath = `tag_updates`;
        // ═══════════════════════════════════════════════════════════════════
        // PHASE D: startAt(now) - Chỉ lắng nghe updates MỚI từ thời điểm này
        // Không tải toàn bộ lịch sử tag_updates cũ (có thể 10,000+ records)
        // ═══════════════════════════════════════════════════════════════════
        const startTime = Date.now();
        console.log('[TAG-REALTIME] Setting up Firebase listener on:', refPath);
        console.log('[TAG-REALTIME] Only listening for updates after:', new Date(startTime).toLocaleString());

        // Get current user name
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const currentUserName = auth && auth.displayName ? auth.displayName : 'Unknown';
        console.log('[TAG-REALTIME] Current user:', currentUserName);

        // ═══════════════════════════════════════════════════════════════════
        // PHASE D: Query với orderByChild + startAt để chỉ nhận updates mới
        // ═══════════════════════════════════════════════════════════════════
        const tagUpdatesRef = database.ref(refPath).orderByChild('timestamp').startAt(startTime);

        // Listen for tag updates (child_changed on existing entries)
        tagUpdatesRef.on('child_changed', (snapshot) => {
            const updateData = snapshot.val();
            console.log('[TAG-REALTIME] Firebase tag update received:', updateData);

            // Only process if update is from another user
            if (updateData.updatedBy !== currentUserName) {
                handleRealtimeTagUpdate(updateData, 'firebase');
            } else {
                console.log('[TAG-REALTIME] Skipping own update');
            }
        });

        // Listen for NEW tag updates (child_added after startTime)
        // Nhờ startAt(startTime), Firebase chỉ gửi các entries mới
        tagUpdatesRef.on('child_added', (snapshot) => {
            const updateData = snapshot.val();
            console.log('[TAG-REALTIME] Firebase new tag update:', updateData);

            // Only process if update is from another user
            if (updateData.updatedBy !== currentUserName) {
                handleRealtimeTagUpdate(updateData, 'firebase');
            } else {
                console.log('[TAG-REALTIME] Skipping own update');
            }
        });

        tagListenersSetup = true;
        console.log('[TAG-REALTIME] ✅ Firebase listeners setup complete (optimized with startAt)');
    }

    // 2. Setup WebSocket listener (for future backend support)
    window.addEventListener('realtimeOrderTagsUpdate', (event) => {
        const updateData = event.detail;
        console.log('[TAG-REALTIME] WebSocket tag update received:', updateData);
        handleRealtimeTagUpdate(updateData, 'websocket');
    });
}

/**
 * Handle realtime TAG update from Firebase or WebSocket
 */
function handleRealtimeTagUpdate(updateData, source) {
    const { orderId, orderCode, STT, tags, updatedBy } = updateData;

    console.log(`[TAG-REALTIME] Processing update from ${source}:`, updateData);

    // ✅ Validate tags - treat undefined/null as empty array for "delete all tags" case
    const normalizedTags = tags === undefined || tags === null ? [] : tags;
    if (!Array.isArray(normalizedTags)) {
        console.error('[TAG-REALTIME] Invalid tags data (not an array):', tags);
        console.error('[TAG-REALTIME] Full updateData:', updateData);
        return;
    }

    console.log('[TAG-REALTIME] Normalized tags:', normalizedTags);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A OPTIMIZATION: Sử dụng OrderStore O(1) lookup thay vì findIndex
    // ═══════════════════════════════════════════════════════════════════

    // ✅ FIX SCROLL ISSUE: Check if order is in DISPLAYED data (after employee filter)
    // This prevents unnecessary re-renders for orders not in current user's view
    const orderInDisplayed = displayedData.find(o => o.Id === orderId);
    if (!orderInDisplayed) {
        console.log('[TAG-REALTIME] Order not in displayed data (not my range), skipping update');
        // Still update OrderStore and allData silently for data consistency

        // Update via OrderStore O(1)
        if (window.OrderStore && window.OrderStore.isInitialized) {
            window.OrderStore.update(orderId, { Tags: JSON.stringify(normalizedTags) });
            console.log('[TAG-REALTIME] ✅ Updated silently via OrderStore O(1)');
        } else {
            // Fallback to findIndex if OrderStore not ready
            const indexInAll = allData.findIndex(o => o.Id === orderId);
            if (indexInAll !== -1) {
                allData[indexInAll].Tags = JSON.stringify(normalizedTags);
            }
        }
        return;
    }

    // 🚨 CONFLICT RESOLUTION: Check if user is currently editing this order's tags
    if (currentEditingOrderId === orderId) {
        console.warn('[TAG-REALTIME] Conflict detected: User is editing this order!');

        // Close modal and show warning
        const modal = document.getElementById('tagModal');
        if (modal && modal.style.display !== 'none') {
            closeTagModal();
        }
    }

    // ✅ SIMPLIFIED: Always update TAG cell realtime (removed tag filter check)
    // updateTagCellOnly() only updates innerHTML of cell - NO scroll jump
    // Data arrays are updated inside updateTagCellOnly()
    updateTagCellOnly(orderId, orderCode, normalizedTags);
}

/**
 * Update only the TAG cell in DOM without re-rendering entire table
 * This preserves scroll position when realtime tag updates occur
 *
 * PHASE A OPTIMIZED: Sử dụng OrderStore O(1) thay vì 3x findIndex O(n)
 */
function updateTagCellOnly(orderId, orderCode, tags) {
    console.log('[TAG-REALTIME] Updating only TAG cell for order:', orderId);

    // 1. Update data arrays first
    const tagsJson = JSON.stringify(tags);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A OPTIMIZATION: Sử dụng OrderStore O(1) lookup
    // Thay vì 3 lần findIndex O(n), chỉ cần 1 lần OrderStore.update O(1)
    // ═══════════════════════════════════════════════════════════════════

    if (window.OrderStore && window.OrderStore.isInitialized) {
        // O(1) update - cập nhật trong OrderStore
        window.OrderStore.update(orderId, { Tags: tagsJson });
        console.log('[TAG-REALTIME] ✅ Updated Tags via OrderStore O(1)');
    }

    // Vẫn cập nhật filteredData và displayedData vì chúng là các arrays riêng
    // (không share reference với OrderStore trong trường hợp filter đã tạo copies mới)
    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered].Tags = tagsJson;
    }

    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed].Tags = tagsJson;
    }

    // 2. Find the row in DOM by checkbox value
    const checkbox = document.querySelector(`#tableBody input[type="checkbox"][value="${orderId}"]`);
    if (!checkbox) {
        // Order might be in employee section tables
        const allCheckboxes = document.querySelectorAll(`input[type="checkbox"][value="${orderId}"]`);
        if (allCheckboxes.length === 0) {
            console.log('[TAG-REALTIME] Row not found in DOM, skipping cell update');
            return;
        }
    }

    const row = checkbox ? checkbox.closest('tr') : document.querySelector(`input[type="checkbox"][value="${orderId}"]`)?.closest('tr');
    if (!row) {
        console.log('[TAG-REALTIME] Row not found in DOM');
        return;
    }

    // 3. Find the TAG cell
    const tagCell = row.querySelector('td[data-column="tag"]');
    if (!tagCell) {
        console.log('[TAG-REALTIME] TAG cell not found');
        return;
    }

    // 4. Generate new tag HTML
    const tagsHTML = parseOrderTags(tagsJson, orderId, orderCode);

    // 5. Update only the tag cell content (preserve buttons)
    tagCell.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <div style="display: flex; gap: 2px;">
                <button class="tag-icon-btn" onclick="openTagModal('${orderId}', '${orderCode}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                    <i class="fas fa-tags"></i>
                </button>
                <button class="quick-tag-btn" onclick="quickAssignTag('${orderId}', '${orderCode}', 'xử lý'); event.stopPropagation();" title="Xử lý + định danh">
                    <i class="fas fa-clock"></i>
                </button>
                <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${orderId}', '${orderCode}', 'ok'); event.stopPropagation();" title="OK + định danh">
                    <i class="fas fa-check"></i>
                </button>
            </div>
            ${tagsHTML}
        </div>
    `;

    console.log('[TAG-REALTIME] ✓ TAG cell updated successfully (no scroll change)');
}

/**
 * Cleanup Firebase listeners when changing campaign
 */
function cleanupTagRealtimeListeners() {
    if (database) {
        const refPath = `tag_updates`;
        database.ref(refPath).off();
        console.log('[TAG-REALTIME] Cleaned up Firebase listeners for:', refPath);
    }
}

/**
 * TEST FUNCTION - Check if TAG listeners are working
 * Call from Console: testTagListeners()
 */
window.testTagListeners = function () {
    console.log('=== TAG REALTIME LISTENER TEST ===');
    console.log('1. Firebase:', database ? '✅ Available' : '❌ Not available');
    console.log('2. Listeners setup:', tagListenersSetup ? '✅ Yes' : '❌ No');

    const auth = window.authManager ? window.authManager.getAuthState() : null;
    const currentUser = auth && auth.displayName ? auth.displayName : 'Unknown';
    console.log('3. Current user:', currentUser);

    console.log('4. Orders loaded:', allData ? allData.length : 0);

    if (database) {
        console.log('\n🔥 Setting up test listener...');

        // Add a one-time listener to test
        database.ref('tag_updates').once('value', (snapshot) => {
            console.log('✅ Firebase connection working!');
            console.log('Total TAG updates in database:', snapshot.numChildren());
        });

        // Listen for any changes
        const testRef = database.ref('tag_updates');
        const testListener = (snapshot) => {
            console.log('🔥🔥🔥 FIREBASE EVENT TRIGGERED! 🔥🔥🔥');
            console.log('Event type: child_changed');
            console.log('Data:', snapshot.val());
        };

        testRef.on('child_changed', testListener);
        console.log('✅ Test listener attached');
        console.log('Now save a TAG and watch for 🔥 events...');

        // Cleanup after 30 seconds
        setTimeout(() => {
            testRef.off('child_changed', testListener);
            console.log('🧹 Test listener removed');
        }, 30000);
    }

    console.log('\n=== TEST COMPLETE ===');
};

// =====================================================
// KPI BASE STATUS PRELOAD #FIREBASE
// =====================================================

/**
 * Preload KPI BASE status for all orders
 * This allows synchronous checking in createRowHTML
 */
async function preloadKPIBaseStatus() {
    if (!database) {
        console.warn('[KPI-BASE] Firebase database not available');
        return;
    }

    try {
        const snapshot = await database.ref('kpi_base').once('value');
        const allBases = snapshot.val() || {};

        // Clear and rebuild the cache
        ordersWithKPIBase.clear();
        for (const orderId in allBases) {
            ordersWithKPIBase.add(orderId);
        }

        console.log(`[KPI-BASE] Preloaded ${ordersWithKPIBase.size} orders with BASE`);

        // Re-render table if data is already loaded
        if (allData && allData.length > 0) {
            performTableSearch();
        }
    } catch (error) {
        console.error('[KPI-BASE] Error preloading BASE status:', error);
    }
}

/**
 * Setup realtime listener for KPI BASE changes
 */
function setupKPIBaseRealtimeListener() {
    if (!database) return;

    // Cleanup existing listener before setting up new one
    cleanupKPIBaseRealtimeListener();

    // Store reference for cleanup
    kpiBaseRef = database.ref('kpi_base');

    kpiBaseRef.on('child_added', (snapshot) => {
        const orderId = snapshot.key;
        ordersWithKPIBase.add(orderId);
        console.log('[KPI-BASE] BASE added for order:', orderId);

        // Update the specific row if visible
        updateKPIBaseIndicator(orderId, true);
    });

    kpiBaseRef.on('child_removed', (snapshot) => {
        const orderId = snapshot.key;
        ordersWithKPIBase.delete(orderId);
        console.log('[KPI-BASE] BASE removed for order:', orderId);

        // Update the specific row if visible
        updateKPIBaseIndicator(orderId, false);
    });

    console.log('[KPI-BASE] Realtime listener setup complete');
}

/**
 * Update KPI BASE indicator for a specific order row
 */
function updateKPIBaseIndicator(orderId, hasBase) {
    // Find the row by order ID
    const checkbox = document.querySelector(`input[type="checkbox"][value="${orderId}"]`);
    if (!checkbox) return;

    const row = checkbox.closest('tr');
    if (!row) return;

    const sttCell = row.querySelector('td[data-column="stt"]');
    if (!sttCell) return;

    // Check if indicator already exists
    let indicator = sttCell.querySelector('.kpi-base-indicator');

    if (hasBase && !indicator) {
        // Add indicator
        const div = sttCell.querySelector('div') || sttCell;
        const indicatorEl = document.createElement('span');
        indicatorEl.className = 'kpi-base-indicator';
        indicatorEl.title = 'Đã lưu BASE tính KPI';
        indicatorEl.innerHTML = '<i class="fas fa-lock" style="color: #10b981; font-size: 10px;"></i>';
        indicatorEl.style.marginLeft = '4px';
        div.appendChild(indicatorEl);
    } else if (!hasBase && indicator) {
        // Remove indicator
        indicator.remove();
    }
}

// Store KPI Base reference for cleanup
let kpiBaseRef = null;

/**
 * Cleanup KPI Base realtime listeners to prevent memory leaks
 */
function cleanupKPIBaseRealtimeListener() {
    if (kpiBaseRef) {
        kpiBaseRef.off();
        kpiBaseRef = null;
        console.log('[KPI-BASE] Realtime listeners cleaned up');
    }
}

// Cleanup all Firebase listeners on page unload
window.addEventListener('beforeunload', () => {
    cleanupTagRealtimeListeners();
    cleanupKPIBaseRealtimeListener();
});

// Export cleanup function for external use
window.cleanupKPIBaseRealtimeListener = cleanupKPIBaseRealtimeListener;

