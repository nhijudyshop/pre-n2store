// #region ═══════════════════════════════════════════════════════════════════════
// ║                        SECTION 5: TAG MANAGEMENT                            ║
// ║                            search: #TAG                                     ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// TAG MANAGEMENT FUNCTIONS #TAG
// =====================================================

// Helper function to fetch all tags with pagination (TPOS max $top=1000)
async function fetchAllTagsWithPagination(headers) {
    const PAGE_SIZE = 1000;
    let allTags = [];
    let skip = 0;
    let totalCount = 0;

    // First request to get count and first batch
    const firstResponse = await API_CONFIG.smartFetch(
        `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=${PAGE_SIZE}&$skip=0&$count=true`,
        {
            method: "GET",
            headers: {
                ...headers,
                accept: "application/json",
                "content-type": "application/json",
            },
        },
    );

    if (!firstResponse.ok) {
        throw new Error(`HTTP ${firstResponse.status}`);
    }

    const firstData = await firstResponse.json();
    allTags = firstData.value || [];
    totalCount = firstData["@odata.count"] || allTags.length;

    console.log(`[TAG] First batch: ${allTags.length} tags, total count: ${totalCount}`);

    // If more tags exist, fetch remaining with pagination
    if (totalCount > PAGE_SIZE) {
        skip = PAGE_SIZE;

        while (skip < totalCount) {
            console.log(`[TAG] Fetching more tags with skip=${skip}...`);

            const response = await API_CONFIG.smartFetch(
                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$top=${PAGE_SIZE}&$skip=${skip}&$count=true`,
                {
                    method: "GET",
                    headers: {
                        ...headers,
                        accept: "application/json",
                        "content-type": "application/json",
                    },
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} at skip=${skip}`);
            }

            const data = await response.json();
            const batchTags = data.value || [];

            if (batchTags.length === 0) {
                break; // No more tags
            }

            allTags = allTags.concat(batchTags);
            skip += PAGE_SIZE;

            console.log(`[TAG] Fetched ${batchTags.length} more tags, total now: ${allTags.length}`);
        }
    }

    console.log(`[TAG] Pagination complete: ${allTags.length}/${totalCount} tags fetched`);
    return allTags;
}

async function loadAvailableTags() {
    try {
        const cached = window.cacheManager.get("tags", "tags");
        if (cached) {
            console.log("[TAG] Using cached tags");
            availableTags = cached;
            window.availableTags = availableTags; // Export to window
            populateTagFilter(); // Populate filter dropdown
            return;
        }

        console.log("[TAG] Loading tags from API...");
        const headers = await window.tokenManager.getAuthHeader();

        // Use pagination helper to fetch all tags
        availableTags = await fetchAllTagsWithPagination(headers);

        window.availableTags = availableTags; // Export to window
        window.cacheManager.set("tags", availableTags, "tags");
        console.log(`[TAG] Loaded ${availableTags.length} tags from API`);
        populateTagFilter(); // Populate filter dropdown
    } catch (error) {
        console.error("[TAG] Error loading tags:", error);
        availableTags = [];
        window.availableTags = availableTags; // Export to window
    }
}

async function refreshTags() {
    const btn = document.querySelector('.tag-btn-refresh');
    const icon = btn ? btn.querySelector('i') : null;

    try {
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');

        console.log("[TAG] Refreshing tags from TPOS...");
        const headers = await window.tokenManager.getAuthHeader();

        // Use pagination helper to fetch all tags (TPOS max $top=1000)
        const newTags = await fetchAllTagsWithPagination(headers);

        console.log(`[TAG] Fetched ${newTags.length} tags from TPOS`);

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(newTags);
            console.log('[TAG] Saved tags to Firebase settings/tags');
        }

        // Update local state
        availableTags = newTags;
        window.availableTags = availableTags;
        window.cacheManager.set("tags", availableTags, "tags");

        // Update UI
        populateTagFilter();

        // Clear search input and render full tag list
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }

        // Update current order tags with new tag info (if modal is open)
        if (currentOrderTags && currentOrderTags.length > 0) {
            currentOrderTags = currentOrderTags.map(selectedTag => {
                const updatedTag = newTags.find(t => t.Id === selectedTag.Id);
                return updatedTag ? { Id: updatedTag.Id, Name: updatedTag.Name, Color: updatedTag.Color } : selectedTag;
            });
            updateSelectedTagsDisplay();
        }

        // Render tag list without search filter
        renderTagList("");

        if (window.notificationManager) {
            window.notificationManager.success(`Đã cập nhật ${newTags.length} tags thành công!`);
        } else {
            alert(`✅ Đã cập nhật ${newTags.length} tags thành công!`);
        }

    } catch (error) {
        console.error("[TAG] Error refreshing tags:", error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi cập nhật tags: ${error.message}`);
        } else {
            alert(`❌ Lỗi cập nhật tags: ${error.message}`);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

// Open Create Tag Modal
function openCreateTagModal() {
    const modal = document.getElementById('createTagModal');
    if (modal) {
        modal.style.display = 'flex';

        // Reset form
        document.getElementById('newTagName').value = '';
        document.getElementById('newTagColor').value = '#3b82f6';
        document.getElementById('newTagColorHex').value = '#3b82f6';
        document.getElementById('colorPreview').style.background = '#3b82f6';

        // Hide status message
        const status = document.getElementById('createTagStatus');
        if (status) {
            status.style.display = 'none';
        }

        // Setup color input sync (only once)
        const colorInput = document.getElementById('newTagColor');
        if (colorInput && !colorInput.dataset.listenerAdded) {
            colorInput.addEventListener('input', function () {
                const color = this.value;
                document.getElementById('newTagColorHex').value = color;
                document.getElementById('colorPreview').style.background = color;
            });
            colorInput.dataset.listenerAdded = 'true';
        }

        // Focus on name input
        setTimeout(() => {
            document.getElementById('newTagName').focus();
        }, 100);
    }
}

// Close Create Tag Modal
function closeCreateTagModal() {
    const modal = document.getElementById('createTagModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Generate Random Color for auto-create tag
function generateRandomColor() {
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
        '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
        '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
        '#ec4899', '#f43f5e', '#78716c', '#737373', '#71717a'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Auto-create tag when search yields no results and user presses Enter
async function autoCreateAndAddTag(tagName) {
    if (!tagName || tagName.trim() === '') return;

    const name = tagName.trim().toUpperCase(); // Convert to uppercase for consistency
    const color = generateRandomColor();

    try {
        // Show loading notification
        if (window.notificationManager) {
            window.notificationManager.info(`Đang tạo tag "${name}"...`);
        }

        console.log('[AUTO-CREATE-TAG] Creating tag:', { name, color });

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // Create tag via API
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({
                    Name: name,
                    Color: color
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const newTag = await response.json();
        console.log('[AUTO-CREATE-TAG] Tag created successfully:', newTag);

        // Remove @odata.context from newTag (Firebase doesn't allow keys with dots)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
        }

        // Update local tags list
        if (Array.isArray(availableTags)) {
            availableTags.push(newTag);
            window.availableTags = availableTags;
            window.cacheManager.set("tags", availableTags, "tags");
        }

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(availableTags);
            console.log('[AUTO-CREATE-TAG] Saved updated tags to Firebase');
        }

        // Update filter dropdowns
        populateTagFilter();

        // Add the new tag to current selection
        currentOrderTags.push({
            Id: newTag.Id,
            Name: newTag.Name,
            Color: newTag.Color
        });

        // Clear search input and update UI
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }
        updateSelectedTagsDisplay();
        renderTagList("");

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo và thêm tag "${name}"!`);
        }

        console.log('[AUTO-CREATE-TAG] Tag added to order selection');

    } catch (error) {
        console.error('[AUTO-CREATE-TAG] Error creating tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    }
}

// =====================================================
// QUICK TAG FEATURE - Load user identifier and quick assign
// =====================================================

/**
 * Load current user identifier from Firestore
 */
async function loadCurrentUserIdentifier() {
    try {
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        if (!auth || !auth.username) {
            console.warn('[QUICK-TAG] No auth or username available');
            return;
        }

        // Get Firestore instance
        const db = firebase.firestore();
        if (!db) {
            console.warn('[QUICK-TAG] Firestore not available');
            return;
        }

        // Load user data from Firestore
        const userDoc = await db.collection('users').doc(auth.username).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUserIdentifier = userData.identifier || null;
            // Expose to window for other modules (workflow, etc.)
            window.currentUserIdentifier = currentUserIdentifier;
            console.log('[QUICK-TAG] Loaded user identifier:', currentUserIdentifier);
        } else {
            console.warn('[QUICK-TAG] User document not found:', auth.username);
        }
    } catch (error) {
        console.error('[QUICK-TAG] Error loading user identifier:', error);
    }
}

/**
 * Quick assign tag to order
 * @param {string} orderId - Order ID
 * @param {string} orderCode - Order code for display
 * @param {string} tagPrefix - Tag prefix ("xử lý" or "ok")
 */
async function quickAssignTag(orderId, orderCode, tagPrefix) {
    // Check if identifier is loaded
    if (!currentUserIdentifier) {
        if (window.notificationManager) {
            window.notificationManager.warning('Chưa có tên định danh. Vui lòng cập nhật trong Quản lý User.');
        }
        return;
    }

    const tagName = `${tagPrefix} ${currentUserIdentifier}`.toUpperCase();

    // Store original tags for rollback
    const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }
    const originalTags = order.Tags; // Save for rollback

    try {
        // Check if tag exists in availableTags
        let existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);

        // If tag doesn't exist in local cache, fetch ALL tags from API using pagination
        if (!existingTag) {
            console.log('[QUICK-TAG] Tag not found in local cache, fetching ALL tags from API with pagination...');
            const headers = await window.tokenManager.getAuthHeader();

            // Use pagination helper to fetch ALL tags (TPOS max $top=1000)
            try {
                availableTags = await fetchAllTagsWithPagination(headers);
                window.availableTags = availableTags;
                window.cacheManager.set("tags", availableTags, "tags");
                console.log(`[QUICK-TAG] Refreshed ${availableTags.length} tags from API (with pagination)`);

                // Check again after refresh
                existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);
                if (existingTag) {
                    console.log('[QUICK-TAG] Found tag after refresh:', existingTag.Name);
                }
            } catch (fetchError) {
                console.warn('[QUICK-TAG] Failed to fetch fresh tags:', fetchError);
            }
        }

        // If tag still doesn't exist after refresh, create it
        if (!existingTag) {
            console.log('[QUICK-TAG] Tag not found after refresh, creating:', tagName);
            const color = generateRandomColor();
            const headers = await window.tokenManager.getAuthHeader();

            const createResponse = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'accept': 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({
                        Name: tagName,
                        Color: color
                    })
                }
            );

            if (!createResponse.ok) {
                // Handle "tag already exists" error (400) - fetch fresh and find the tag
                if (createResponse.status === 400) {
                    console.log('[QUICK-TAG] Create returned 400 (tag may already exist), fetching fresh tags...');
                    try {
                        const freshHeaders = await window.tokenManager.getAuthHeader();
                        availableTags = await fetchAllTagsWithPagination(freshHeaders);
                        window.availableTags = availableTags;
                        window.cacheManager.set("tags", availableTags, "tags");

                        existingTag = availableTags.find(t => t.Name.toUpperCase() === tagName);
                        if (existingTag) {
                            console.log('[QUICK-TAG] Found existing tag after 400 error:', existingTag.Name);
                        } else {
                            throw new Error(`Tag "${tagName}" đã tồn tại nhưng không tìm thấy trong hệ thống`);
                        }
                    } catch (fetchError) {
                        console.error('[QUICK-TAG] Failed to recover from 400 error:', fetchError);
                        throw new Error(`Lỗi tạo tag: ${createResponse.status} - Tag có thể đã tồn tại`);
                    }
                } else {
                    throw new Error(`Lỗi tạo tag: ${createResponse.status}`);
                }
            } else {
                existingTag = await createResponse.json();

                // Remove @odata.context
                if (existingTag['@odata.context']) {
                    delete existingTag['@odata.context'];
                }

                // Update local tags list
                availableTags.push(existingTag);
                window.availableTags = availableTags;
                window.cacheManager.set("tags", availableTags, "tags");

                // Save to Firebase
                if (database) {
                    await database.ref('settings/tags').set(availableTags);
                }

                // Update dropdowns
                populateTagFilter();

                console.log('[QUICK-TAG] Created new tag:', existingTag);
            }
        }

        // Parse existing tags
        let orderTags = [];
        try {
            if (order.Tags) {
                orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }

        // Remove opposite tag if exists (xử lý <-> ok)
        const oppositePrefix = tagPrefix.toLowerCase() === 'xử lý' ? 'OK' : 'XỬ LÝ';
        const oppositeTagName = `${oppositePrefix} ${currentUserIdentifier}`.toUpperCase();
        const oppositeTagIndex = orderTags.findIndex(t => t.Name && t.Name.toUpperCase() === oppositeTagName);

        // Track removed tag ID for filter re-apply check
        let removedTagId = null;

        if (oppositeTagIndex !== -1) {
            const removedTag = orderTags[oppositeTagIndex];
            removedTagId = removedTag.Id;
            orderTags.splice(oppositeTagIndex, 1);
            console.log('[QUICK-TAG] Removed opposite tag:', removedTag.Name, 'ID:', removedTagId);
        }

        // Check if tag already assigned
        if (orderTags.some(t => t.Id === existingTag.Id)) {
            if (window.notificationManager) {
                window.notificationManager.info(`Tag "${tagName}" đã được gán cho đơn này rồi.`);
            }
            return;
        }

        // Add new tag to order tags
        orderTags.push({
            Id: existingTag.Id,
            Name: existingTag.Name,
            Color: existingTag.Color
        });

        // ═══════════════════════════════════════════════════════════════════
        // OPTIMISTIC UPDATE: Update UI immediately BEFORE API call
        // ═══════════════════════════════════════════════════════════════════
        const newTagsJson = JSON.stringify(orderTags);

        // 1. Update local UI immediately
        updateOrderInTable(orderId, { Tags: newTagsJson });

        // 2. Emit to Firebase immediately (so other users see it too)
        await emitTagUpdateToFirebase(orderId, orderTags);

        console.log('[QUICK-TAG] Optimistic update applied, calling API...');

        // 3. Now call API in background
        const headers = await window.tokenManager.getAuthHeader();
        const assignResponse = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    Tags: orderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: orderId
                })
            }
        );

        if (!assignResponse.ok) {
            // API failed - need to rollback
            throw new Error(`Lỗi gán tag: ${assignResponse.status}`);
        }

        // Clear cache
        window.cacheManager.clear("orders");

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã gán tag "${tagName}" cho đơn ${orderCode}!`, 2000);
        }

        console.log('[QUICK-TAG] Tag assigned successfully:', tagName, 'to order:', orderCode);

        // Re-apply filters to hide order if it no longer matches the current tag filter
        const currentTagFilter = document.getElementById('tagFilter')?.value || 'all';
        if (currentTagFilter !== 'all') {
            // Check if the removed tag matches the current filter - if so, always re-filter
            const removedTagMatchesFilter = removedTagId && String(removedTagId) === String(currentTagFilter);

            // Also check if filter tag name starts with opposite prefix (handle Unicode comparison issues)
            // e.g., if we're adding "OK" tag and filter is set to a "XỬ LÝ" tag, always re-filter
            let filterTagMatchesOppositePrefix = false;
            if (window.availableTags) {
                const filterTag = window.availableTags.find(t => String(t.Id) === String(currentTagFilter));
                if (filterTag && filterTag.Name) {
                    const filterTagNameUpper = filterTag.Name.toUpperCase();
                    // oppositePrefix is "XỬ LÝ" when tagPrefix is "ok", or "OK" when tagPrefix is "xử lý"
                    filterTagMatchesOppositePrefix = filterTagNameUpper.startsWith(oppositePrefix);
                    if (filterTagMatchesOppositePrefix) {
                        console.log('[QUICK-TAG] Filter tag matches opposite prefix:', filterTag.Name, '→', oppositePrefix);
                    }
                }
            }

            if (removedTagMatchesFilter || filterTagMatchesOppositePrefix) {
                // The tag that was removed matches the current filter - re-filter immediately
                if (typeof window.performTableSearch === 'function') {
                    window.performTableSearch();
                    console.log('[QUICK-TAG] Order hidden - removed tag matches current filter or filter matches opposite prefix');
                }
            } else {
                // Fallback: Check if order still matches the filter
                const orderStillMatchesFilter = orderTags.some(tag => String(tag.Id) === String(currentTagFilter));
                if (!orderStillMatchesFilter) {
                    // Order no longer matches filter - re-filter the table
                    if (typeof window.performTableSearch === 'function') {
                        window.performTableSearch();
                        console.log('[QUICK-TAG] Order hidden - no longer matches tag filter');
                    }
                }
            }
        }

    } catch (error) {
        console.error('[QUICK-TAG] Error:', error);

        // ═══════════════════════════════════════════════════════════════════
        // ROLLBACK: Revert to original tags on error
        // ═══════════════════════════════════════════════════════════════════
        console.log('[QUICK-TAG] Rolling back optimistic update...');

        // Parse original tags for Firebase emit
        let originalOrderTags = [];
        try {
            if (originalTags) {
                originalOrderTags = JSON.parse(originalTags);
                if (!Array.isArray(originalOrderTags)) originalOrderTags = [];
            }
        } catch (e) {
            originalOrderTags = [];
        }

        // 1. Revert local UI
        updateOrderInTable(orderId, { Tags: originalTags || '[]' });

        // 2. Emit rollback to Firebase (so other users also revert)
        await emitTagUpdateToFirebase(orderId, originalOrderTags);

        console.log('[QUICK-TAG] Rollback completed');

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

// Expose quickAssignTag to window for external use (e.g., cancel order workflow)
window.quickAssignTag = quickAssignTag;

/**
 * Quick remove tag from order
 * @param {string} orderId - Order ID
 * @param {string} orderCode - Order code for display
 * @param {string} tagId - Tag ID to remove
 */
async function quickRemoveTag(orderId, orderCode, tagId) {
    console.log('[QUICK-TAG] Removing tag:', { orderId, orderCode, tagId });

    // Get current order from data - O(1) via OrderStore with fallback
    const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }

    // Store original tags for rollback
    const originalTags = order.Tags;

    // Parse existing tags
    let orderTags = [];
    try {
        if (order.Tags) {
            orderTags = JSON.parse(order.Tags);
            if (!Array.isArray(orderTags)) orderTags = [];
        }
    } catch (e) {
        orderTags = [];
    }

    console.log('[QUICK-TAG] Current tags:', orderTags);

    // Find tag to remove (compare as string to handle both number and string IDs)
    const tagIdStr = String(tagId);
    const tagToRemove = orderTags.find(t => String(t.Id) === tagIdStr);
    if (!tagToRemove) {
        console.warn('[QUICK-TAG] Tag not found in order:', tagId, 'Available:', orderTags.map(t => t.Id));
        return;
    }

    // Remove tag from list
    const newOrderTags = orderTags.filter(t => String(t.Id) !== tagIdStr);

    try {
        // ═══════════════════════════════════════════════════════════════════
        // OPTIMISTIC UPDATE: Update UI immediately BEFORE API call
        // ═══════════════════════════════════════════════════════════════════
        const newTagsJson = JSON.stringify(newOrderTags);

        // 1. Update local UI immediately
        updateOrderInTable(orderId, { Tags: newTagsJson });

        // 2. Emit to Firebase immediately (so other users see it too)
        await emitTagUpdateToFirebase(orderId, newOrderTags);

        console.log('[QUICK-TAG] Optimistic update applied, calling API...');

        // 3. Now call API in background
        const headers = await window.tokenManager.getAuthHeader();
        const assignResponse = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    Tags: newOrderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: orderId
                })
            }
        );

        if (!assignResponse.ok) {
            // API failed - need to rollback
            throw new Error(`Lỗi xóa tag: ${assignResponse.status}`);
        }

        // Clear cache
        window.cacheManager.clear("orders");

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã xóa tag "${tagToRemove.Name}" khỏi đơn ${orderCode}!`, 2000);
        }

        console.log('[QUICK-TAG] Tag removed successfully:', tagToRemove.Name, 'ID:', tagToRemove.Id, 'from order:', orderCode);

        // Re-apply filters to hide order if it no longer matches the current tag filter
        const currentTagFilter = document.getElementById('tagFilter')?.value || 'all';
        if (currentTagFilter !== 'all') {
            // Check if the removed tag matches the current filter - if so, always re-filter
            const removedTagMatchesFilter = String(tagToRemove.Id) === String(currentTagFilter);

            if (removedTagMatchesFilter) {
                // The tag that was removed matches the current filter - re-filter immediately
                if (typeof window.performTableSearch === 'function') {
                    window.performTableSearch();
                    console.log('[QUICK-TAG] Order hidden - removed tag matches current filter, ID:', tagToRemove.Id);
                }
            } else {
                // Fallback: Check if order still matches the filter
                const orderStillMatchesFilter = newOrderTags.some(tag => String(tag.Id) === String(currentTagFilter));
                if (!orderStillMatchesFilter) {
                    // Order no longer matches filter - re-filter the table
                    if (typeof window.performTableSearch === 'function') {
                        window.performTableSearch();
                        console.log('[QUICK-TAG] Order hidden - no longer matches tag filter after removal');
                    }
                }
            }
        }

    } catch (error) {
        console.error('[QUICK-TAG] Error removing tag:', error);

        // ═══════════════════════════════════════════════════════════════════
        // ROLLBACK: Revert to original tags on error
        // ═══════════════════════════════════════════════════════════════════
        console.log('[QUICK-TAG] Rolling back optimistic update...');

        // Parse original tags for Firebase emit
        let originalOrderTags = [];
        try {
            if (originalTags) {
                originalOrderTags = JSON.parse(originalTags);
                if (!Array.isArray(originalOrderTags)) originalOrderTags = [];
            }
        } catch (e) {
            originalOrderTags = [];
        }

        // 1. Revert local UI
        updateOrderInTable(orderId, { Tags: originalTags || '[]' });

        // 2. Emit rollback to Firebase (so other users also revert)
        await emitTagUpdateToFirebase(orderId, originalOrderTags);

        console.log('[QUICK-TAG] Rollback completed');

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

// Update Color Preview
function updateColorPreview() {
    const hexInput = document.getElementById('newTagColorHex');
    const colorInput = document.getElementById('newTagColor');
    const preview = document.getElementById('colorPreview');

    let hex = hexInput.value.trim();

    // Add # if missing
    if (hex && !hex.startsWith('#')) {
        hex = '#' + hex;
    }

    // Validate hex color (3 or 6 digits)
    const validHex = /^#([0-9A-F]{3}){1,2}$/i.test(hex);

    if (validHex) {
        colorInput.value = hex;
        preview.style.background = hex;
        hexInput.style.borderColor = '#d1d5db';
    } else if (hex === '#') {
        // Just started typing
        hexInput.style.borderColor = '#d1d5db';
    } else {
        // Invalid hex
        hexInput.style.borderColor = '#ef4444';
    }
}

// Select Preset Color
function selectPresetColor(color) {
    document.getElementById('newTagColor').value = color;
    document.getElementById('newTagColorHex').value = color;
    document.getElementById('colorPreview').style.background = color;
}

// Create New Tag
async function createNewTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    const statusDiv = document.getElementById('createTagStatus');
    const createBtn = document.getElementById('createTagBtn');

    const name = nameInput.value.trim();
    const color = colorInput.value;

    // Validate
    if (!name) {
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Vui lòng nhập tên tag';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        nameInput.focus();
        return;
    }

    // Validate color
    const validHex = /^#([0-9A-F]{3}){1,2}$/i.test(color);
    if (!validHex) {
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Màu không hợp lệ';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        return;
    }

    try {
        // Disable button
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

        // Show loading status
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo tag...';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#dbeafe';
        statusDiv.style.color = '#1e40af';

        console.log('[CREATE-TAG] Creating tag:', { name, color });

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // Create tag via API (through Cloudflare proxy)
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({
                    Name: name,
                    Color: color
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const newTag = await response.json();
        console.log('[CREATE-TAG] Tag created successfully:', newTag);

        // Remove @odata.context from newTag (Firebase doesn't allow keys with dots)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
            console.log('[CREATE-TAG] Removed @odata.context from newTag');
        }

        // Show success status
        statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Tạo tag thành công!';
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';

        // Update local tags list
        if (Array.isArray(availableTags)) {
            availableTags.push(newTag);
            window.availableTags = availableTags;
            window.cacheManager.set("tags", availableTags, "tags");
        }

        // Save to Firebase
        if (database) {
            await database.ref('settings/tags').set(availableTags);
            console.log('[CREATE-TAG] Saved updated tags to Firebase');
        }

        // Update UI
        populateTagFilter();

        // Clear search and render updated tag list
        const searchInput = document.getElementById("tagSearchInput");
        if (searchInput) {
            searchInput.value = "";
        }
        renderTagList("");

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo tag "${name}" thành công!`);
        }

        // Close modal after 1 second
        setTimeout(() => {
            closeCreateTagModal();
        }, 1000);

    } catch (error) {
        console.error('[CREATE-TAG] Error creating tag:', error);
        statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Lỗi: ' + error.message;
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#991b1b';

        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    } finally {
        // Re-enable button
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="fas fa-check"></i> Tạo tag';
    }
}

function populateTagFilter() {
    // Call the inline script function if available
    if (typeof populateTagFilterOptions === 'function') {
        populateTagFilterOptions();
    }
    // Update selected tags display on main page
    if (typeof window.updateSelectedTagsMainDisplay === 'function') {
        window.updateSelectedTagsMainDisplay();
    }
    // Update excluded tags display on main page
    if (typeof updateExcludedTagsMainDisplay === 'function') {
        updateExcludedTagsMainDisplay();
    }
    console.log('[TAG-FILTER] populateTagFilter called');
}

function openTagModal(orderId, orderCode) {
    currentEditingOrderId = orderId;
    // O(1) via OrderStore with fallback
    const order = window.OrderStore?.get(orderId) || allData.find((o) => o.Id === orderId);
    currentOrderTags = order && order.Tags ? JSON.parse(order.Tags) : [];

    renderTagList();
    updateSelectedTagsDisplay();
    document.getElementById("tagModal").classList.add("show");

    // Auto-refresh tags when modal opens
    refreshTags();

    // Focus on search input
    setTimeout(() => {
        document.getElementById("tagSearchInput").focus();
    }, 100);
}

function closeTagModal() {
    document.getElementById("tagModal").classList.remove("show");
    document.getElementById("tagSearchInput").value = "";
    currentEditingOrderId = null;
    currentOrderTags = [];
    pendingDeleteTagIndex = -1;
}

function renderTagList(searchQuery = "") {
    const tagList = document.getElementById("tagList");
    if (availableTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-exclamation-circle"></i><p>Không có tag nào</p></div>`;
        return;
    }

    // Filter out selected tags and apply search query
    const filteredTags = availableTags.filter((tag) => {
        // Don't show already selected tags
        const isSelected = currentOrderTags.some((t) => t.Id === tag.Id);
        if (isSelected) return false;

        // Apply search filter
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            tag.Name.toLowerCase().includes(query) ||
            tag.NameNosign.toLowerCase().includes(query)
        );
    });

    if (filteredTags.length === 0) {
        tagList.innerHTML = `<div class="no-tags-message"><i class="fas fa-search"></i><p>Không tìm thấy tag phù hợp</p></div>`;
        return;
    }

    tagList.innerHTML = filteredTags
        .map((tag, index) => {
            const isFirstItem = index === 0;
            return `
            <div class="tag-dropdown-item ${isFirstItem ? 'highlighted' : ''}" onclick="toggleTag(${tag.Id})" data-tag-id="${tag.Id}">
                <div class="tag-item-name">${tag.Name}</div>
            </div>`;
        })
        .join("");
}

function toggleTag(tagId) {
    const tag = availableTags.find((t) => t.Id === tagId);
    if (!tag) return;

    const existingIndex = currentOrderTags.findIndex((t) => t.Id === tagId);
    if (existingIndex >= 0) {
        currentOrderTags.splice(existingIndex, 1);
    } else {
        currentOrderTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
    }

    updateSelectedTagsDisplay();
    renderTagList(document.getElementById("tagSearchInput").value);
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById("selectedTagsPills");
    if (currentOrderTags.length === 0) {
        container.innerHTML = '';
        pendingDeleteTagIndex = -1;
        return;
    }
    container.innerHTML = currentOrderTags
        .map(
            (tag, index) => {
                const isPendingDelete = index === pendingDeleteTagIndex;
                const bgColor = isPendingDelete ? '#ef4444' : '#3b82f6'; // Red if pending delete, blue otherwise
                return `
        <span class="selected-tag-pill ${isPendingDelete ? 'deletion-pending' : ''}" style="background-color: ${bgColor}" data-tag-index="${index}">
            ${tag.Name}
            <button class="selected-tag-remove" onclick="event.stopPropagation(); removeTag(${index})" title="Xóa tag">
                ✕
            </button>
        </span>`;
            }
        )
        .join("");
}

function filterTags() {
    renderTagList(document.getElementById("tagSearchInput").value);
}

function removeTag(index) {
    if (index >= 0 && index < currentOrderTags.length) {
        currentOrderTags.splice(index, 1);
        pendingDeleteTagIndex = -1;
        updateSelectedTagsDisplay();
        renderTagList(document.getElementById("tagSearchInput").value);
    }
}

function handleTagInputKeydown(event) {
    const inputValue = document.getElementById("tagSearchInput").value;

    if (event.key === 'Enter') {
        event.preventDefault();

        // Find the highlighted tag (first one in the list)
        const highlightedTag = document.querySelector('.tag-dropdown-item.highlighted');
        if (highlightedTag) {
            const tagId = highlightedTag.getAttribute('data-tag-id');
            if (tagId) {
                toggleTag(parseInt(tagId));
                // Clear search input after selecting
                document.getElementById("tagSearchInput").value = "";
                // Re-render to show all available tags again
                renderTagList("");
                pendingDeleteTagIndex = -1;
            }
        } else if (inputValue.trim() !== '') {
            // No matching tag found - auto-create new tag with the search term
            autoCreateAndAddTag(inputValue);
        }
    } else if (event.key === 'Backspace' && inputValue === '') {
        event.preventDefault();

        if (currentOrderTags.length === 0) return;

        if (pendingDeleteTagIndex >= 0) {
            // Second backspace - delete the tag
            removeTag(pendingDeleteTagIndex);
        } else {
            // First backspace - mark last tag for deletion
            pendingDeleteTagIndex = currentOrderTags.length - 1;
            updateSelectedTagsDisplay();
        }
    } else {
        // Any other key resets the pending delete
        if (pendingDeleteTagIndex >= 0) {
            pendingDeleteTagIndex = -1;
            updateSelectedTagsDisplay();
        }
    }
}

function toggleQuickAccess(tagName, buttonElement) {
    if (!window.quickTagManager) {
        console.error('[TAG] Quick tag manager not available');
        return;
    }

    const isActive = window.quickTagManager.toggleQuickTag(tagName);

    // Update button state
    if (isActive) {
        buttonElement.classList.add('active');
        buttonElement.title = 'Bỏ khỏi chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`⭐ Đã thêm "${tagName}" vào chọn nhanh`, 'success');
        }
    } else {
        buttonElement.classList.remove('active');
        buttonElement.title = 'Thêm vào chọn nhanh';
        if (window.notificationManager) {
            window.notificationManager.show(`Đã bỏ "${tagName}" khỏi chọn nhanh`, 'info');
        }
    }

    console.log(`[TAG] Quick access toggled for "${tagName}": ${isActive ? 'ADDED' : 'REMOVED'}`);
}

async function saveOrderTags() {
    if (!currentEditingOrderId) return;
    try {
        showLoading(true);
        const payload = {
            Tags: currentOrderTags.map((tag) => ({
                Id: tag.Id,
                Color: tag.Color,
                Name: tag.Name,
            })),
            OrderId: currentEditingOrderId,
        };
        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
            {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            },
        );
        if (!response.ok)
            throw new Error(
                `HTTP ${response.status}: ${await response.text()}`,
            );

        // 🔄 Cập nhật tags trong data
        const updatedData = { Tags: JSON.stringify(currentOrderTags) };
        updateOrderInTable(currentEditingOrderId, updatedData);

        // 🔥 Emit TAG update to Firebase for realtime sync
        await emitTagUpdateToFirebase(currentEditingOrderId, currentOrderTags);

        window.cacheManager.clear("orders");
        showLoading(false);
        closeTagModal();

        if (window.notificationManager) {
            window.notificationManager.success(
                `Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
                2000
            );
        } else {
            showInfoBanner(
                `✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`,
            );
        }
    } catch (error) {
        console.error("[TAG] Error saving tags:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi khi lưu tag: ${error.message}`, 4000);
        } else {
            alert(`Lỗi khi lưu tag:\n${error.message}`);
        }
    }
}

// =====================================================
// MULTI-SELECT TAG FILTER FUNCTIONS
// =====================================================

/**
 * Remove Vietnamese diacritics for search
 * Example: "GIẢM GIÁ" -> "giam gia", "CHỜ HÀNG VỀ" -> "cho hang ve"
 */
function removeVietnameseDiacritics(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

// Store selected tag IDs (multi-select)
const SELECTED_TAGS_KEY = 'orderTableSelectedTags';
const EXCLUDED_TAGS_FILTER_KEY = 'orderTableExcludedTags';

/**
 * Get selected tags from localStorage
 */
window.getSelectedTagFilters = function() {
    try {
        const saved = localStorage.getItem(SELECTED_TAGS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (error) {
        console.error('[TAG-FILTER] Error loading selected tags:', error);
        return [];
    }
};

/**
 * Save selected tags to localStorage
 */
window.saveSelectedTagFilters = function(tagIds) {
    try {
        localStorage.setItem(SELECTED_TAGS_KEY, JSON.stringify(tagIds));
        console.log('[TAG-FILTER] Saved selected tags:', tagIds);
    } catch (error) {
        console.error('[TAG-FILTER] Error saving selected tags:', error);
    }
};

/**
 * Toggle tag filter dropdown
 */
window.toggleTagFilterDropdown = function() {
    const dropdown = document.getElementById('tagFilterDropdown');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('open');

    // Close all other dropdowns
    document.querySelectorAll('.tag-filter-dropdown.open').forEach(d => d.classList.remove('open'));

    if (!isOpen) {
        dropdown.classList.add('open');
        // Load tags if not loaded
        if (!window.availableTags || window.availableTags.length === 0) {
            if (typeof loadAvailableTags === 'function') {
                loadAvailableTags().then(() => {
                    window.populateTagFilterOptions();
                });
            }
        } else {
            window.populateTagFilterOptions();
        }
        // Focus search input
        setTimeout(() => {
            const searchInput = document.getElementById('tagFilterSearchInput');
            if (searchInput) searchInput.focus();
        }, 100);
    }
};

/**
 * Close tag filter dropdown
 */
window.closeTagFilterDropdown = function() {
    const dropdown = document.getElementById('tagFilterDropdown');
    if (dropdown) dropdown.classList.remove('open');
};

/**
 * Populate tag filter options (Multi-select with checkboxes)
 */
window.populateTagFilterOptions = function(searchTerm = '') {
    const optionsContainer = document.getElementById('tagFilterOptions');
    if (!optionsContainer) return;

    const tags = window.availableTags || [];
    const selectedTags = window.getSelectedTagFilters();
    const search = removeVietnameseDiacritics(searchTerm.trim());

    // Filter tags by search term (diacritic-free matching)
    let filteredTags = tags;
    if (search) {
        filteredTags = tags.filter(tag =>
            removeVietnameseDiacritics(tag.Name || '').includes(search)
        );
    }

    // Build options HTML with checkboxes
    let html = '';

    filteredTags.forEach(tag => {
        const isSelected = selectedTags.includes(String(tag.Id));
        const colorStyle = tag.Color ? `background-color: ${tag.Color}` : 'background-color: #9ca3af';
        html += `
            <label class="tag-filter-option" style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; transition: background 0.15s; ${isSelected ? 'background: #eff6ff;' : ''}"
                onmouseover="this.style.background='${isSelected ? '#dbeafe' : '#f9fafb'}'"
                onmouseout="this.style.background='${isSelected ? '#eff6ff' : 'transparent'}'">
                <input type="checkbox" ${isSelected ? 'checked' : ''}
                    onchange="toggleTagFilterOption('${tag.Id}')"
                    style="margin-right: 10px; cursor: pointer; width: 16px; height: 16px;">
                <span class="tag-color-dot" style="${colorStyle}; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px;"></span>
                <span class="tag-name" style="flex: 1;">${tag.Name || 'Unnamed'}</span>
            </label>
        `;
    });

    if (filteredTags.length === 0) {
        html = `<div style="padding: 12px; text-align: center; color: #9ca3af;">Không tìm thấy tag</div>`;
    }

    optionsContainer.innerHTML = html;

    // Update display text
    updateTagFilterDisplayText();
};

/**
 * Toggle a tag in the filter selection
 */
window.toggleTagFilterOption = function(tagId) {
    const selectedTags = window.getSelectedTagFilters();
    const tagIdStr = String(tagId);
    const index = selectedTags.indexOf(tagIdStr);

    if (index > -1) {
        selectedTags.splice(index, 1);
    } else {
        selectedTags.push(tagIdStr);
    }

    window.saveSelectedTagFilters(selectedTags);

    // Update hidden input for backward compatibility
    const hiddenInput = document.getElementById('tagFilter');
    if (hiddenInput) {
        hiddenInput.value = selectedTags.length === 0 ? 'all' : selectedTags.join(',');
    }

    // Update display text
    updateTagFilterDisplayText();

    // Re-render options to update checkbox states
    const searchInput = document.getElementById('tagFilterSearchInput');
    window.populateTagFilterOptions(searchInput?.value || '');

    // Trigger table search
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }

    console.log(`[TAG-FILTER] Toggled tag ${tagId}, selected: ${selectedTags.join(', ')}`);
};

/**
 * Select all visible tags in filter
 */
window.selectAllTagFilters = function() {
    const tags = window.availableTags || [];
    const searchInput = document.getElementById('tagFilterSearchInput');
    const search = (searchInput?.value || '').toLowerCase().trim();

    // Get currently visible tags
    let visibleTags = tags;
    if (search) {
        visibleTags = tags.filter(tag => (tag.Name || '').toLowerCase().includes(search));
    }

    const selectedTags = window.getSelectedTagFilters();

    // Add all visible tags to selection
    visibleTags.forEach(tag => {
        const tagIdStr = String(tag.Id);
        if (!selectedTags.includes(tagIdStr)) {
            selectedTags.push(tagIdStr);
        }
    });

    window.saveSelectedTagFilters(selectedTags);

    // Update hidden input
    const hiddenInput = document.getElementById('tagFilter');
    if (hiddenInput) {
        hiddenInput.value = selectedTags.length === 0 ? 'all' : selectedTags.join(',');
    }

    // Update display and trigger search
    updateTagFilterDisplayText();
    window.populateTagFilterOptions(search);

    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
};

/**
 * Clear all tag filters
 */
window.clearTagFilters = function() {
    window.saveSelectedTagFilters([]);

    // Update hidden input
    const hiddenInput = document.getElementById('tagFilter');
    if (hiddenInput) hiddenInput.value = 'all';

    // Update display
    updateTagFilterDisplayText();

    // Re-render options
    const searchInput = document.getElementById('tagFilterSearchInput');
    window.populateTagFilterOptions(searchInput?.value || '');

    // Trigger table search
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
};

/**
 * Update the tag filter display text
 */
function updateTagFilterDisplayText() {
    const displayText = document.getElementById('tagFilterText');
    if (!displayText) return;

    const selectedTags = window.getSelectedTagFilters();
    const tags = window.availableTags || [];

    if (selectedTags.length === 0) {
        displayText.textContent = 'Tất cả';
        displayText.style.color = '';
    } else if (selectedTags.length === 1) {
        const tag = tags.find(t => String(t.Id) === selectedTags[0]);
        displayText.textContent = tag ? tag.Name : '1 tag';
        displayText.style.color = tag?.Color || '';
    } else {
        displayText.textContent = `${selectedTags.length} tags`;
        displayText.style.color = '#3b82f6';
    }

    // Also update the main display
    if (typeof window.updateSelectedTagsMainDisplay === 'function') {
        window.updateSelectedTagsMainDisplay();
    }
}

/**
 * Filter tag options based on search input
 */
window.filterTagOptions = function() {
    const searchInput = document.getElementById('tagFilterSearchInput');
    const searchTerm = searchInput ? searchInput.value : '';
    window.populateTagFilterOptions(searchTerm);
};

// =====================================================
// EXCLUDE TAG FILTER FUNCTIONS
// =====================================================

/**
 * Get excluded tags from localStorage
 */
window.getExcludedTagFilters = function() {
    try {
        const saved = localStorage.getItem(EXCLUDED_TAGS_FILTER_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (error) {
        console.error('[EXCLUDE-TAG-FILTER] Error loading excluded tags:', error);
        return [];
    }
};

/**
 * Save excluded tags to localStorage
 */
window.saveExcludedTagFilters = function(tagIds) {
    try {
        localStorage.setItem(EXCLUDED_TAGS_FILTER_KEY, JSON.stringify(tagIds));
        console.log('[EXCLUDE-TAG-FILTER] Saved excluded tags:', tagIds);
    } catch (error) {
        console.error('[EXCLUDE-TAG-FILTER] Error saving excluded tags:', error);
    }
};

/**
 * Toggle exclude tag filter dropdown
 */
window.toggleExcludeTagFilterDropdown = function() {
    const dropdown = document.getElementById('excludeTagFilterDropdown');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('open');

    // Close all other dropdowns
    document.querySelectorAll('.tag-filter-dropdown.open').forEach(d => d.classList.remove('open'));

    if (!isOpen) {
        dropdown.classList.add('open');
        // Load tags if not loaded
        if (!window.availableTags || window.availableTags.length === 0) {
            if (typeof loadAvailableTags === 'function') {
                loadAvailableTags().then(() => {
                    window.populateExcludeTagFilterOptions();
                });
            }
        } else {
            window.populateExcludeTagFilterOptions();
        }
        // Focus search input
        setTimeout(() => {
            const searchInput = document.getElementById('excludeTagFilterSearchInput');
            if (searchInput) searchInput.focus();
        }, 100);
    }
};

/**
 * Close exclude tag filter dropdown
 */
window.closeExcludeTagFilterDropdown = function() {
    const dropdown = document.getElementById('excludeTagFilterDropdown');
    if (dropdown) dropdown.classList.remove('open');
};

/**
 * Populate exclude tag filter options
 */
window.populateExcludeTagFilterOptions = function(searchTerm = '') {
    const optionsContainer = document.getElementById('excludeTagFilterOptions');
    if (!optionsContainer) return;

    const tags = window.availableTags || [];
    const excludedTags = window.getExcludedTagFilters();
    const search = removeVietnameseDiacritics(searchTerm.trim());

    // Filter tags by search term (diacritic-free matching)
    let filteredTags = tags;
    if (search) {
        filteredTags = tags.filter(tag =>
            removeVietnameseDiacritics(tag.Name || '').includes(search)
        );
    }

    // Build options HTML with checkboxes
    let html = '';

    filteredTags.forEach(tag => {
        const isExcluded = excludedTags.includes(String(tag.Id));
        const colorStyle = tag.Color ? `background-color: ${tag.Color}` : 'background-color: #9ca3af';
        html += `
            <label class="tag-filter-option" style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; transition: background 0.15s; ${isExcluded ? 'background: #fef2f2;' : ''}"
                onmouseover="this.style.background='${isExcluded ? '#fee2e2' : '#f9fafb'}'"
                onmouseout="this.style.background='${isExcluded ? '#fef2f2' : 'transparent'}'">
                <input type="checkbox" ${isExcluded ? 'checked' : ''}
                    onchange="toggleExcludeTagFilterOption('${tag.Id}')"
                    style="margin-right: 10px; cursor: pointer; width: 16px; height: 16px;">
                <span class="tag-color-dot" style="${colorStyle}; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px;"></span>
                <span class="tag-name" style="flex: 1;">${tag.Name || 'Unnamed'}</span>
            </label>
        `;
    });

    if (filteredTags.length === 0) {
        html = `<div style="padding: 12px; text-align: center; color: #9ca3af;">Không tìm thấy tag</div>`;
    }

    optionsContainer.innerHTML = html;

    // Update display text
    updateExcludeTagFilterDisplayText();

    // Update the main display area
    window.updateExcludedTagsMainDisplay();
};

/**
 * Toggle a tag in the exclude filter selection
 */
window.toggleExcludeTagFilterOption = function(tagId) {
    const excludedTags = window.getExcludedTagFilters();
    const tagIdStr = String(tagId);
    const index = excludedTags.indexOf(tagIdStr);

    if (index > -1) {
        excludedTags.splice(index, 1);
    } else {
        excludedTags.push(tagIdStr);
    }

    window.saveExcludedTagFilters(excludedTags);

    // Update display text
    updateExcludeTagFilterDisplayText();

    // Re-render options to update checkbox states
    const searchInput = document.getElementById('excludeTagFilterSearchInput');
    window.populateExcludeTagFilterOptions(searchInput?.value || '');

    // Trigger table search
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }

    console.log(`[EXCLUDE-TAG-FILTER] Toggled tag ${tagId}, excluded: ${excludedTags.join(', ')}`);
};

/**
 * Clear all exclude tag filters
 */
window.clearExcludeTagFilters = function() {
    window.saveExcludedTagFilters([]);

    // Update display
    updateExcludeTagFilterDisplayText();

    // Re-render options
    const searchInput = document.getElementById('excludeTagFilterSearchInput');
    window.populateExcludeTagFilterOptions(searchInput?.value || '');

    // Trigger table search
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
};

/**
 * Update the exclude tag filter display text
 */
function updateExcludeTagFilterDisplayText() {
    const displayText = document.getElementById('excludeTagFilterText');
    if (!displayText) return;

    const excludedTags = window.getExcludedTagFilters();
    const tags = window.availableTags || [];

    if (excludedTags.length === 0) {
        displayText.textContent = 'Không ẩn';
        displayText.style.color = '';
    } else if (excludedTags.length === 1) {
        const tag = tags.find(t => String(t.Id) === excludedTags[0]);
        displayText.textContent = tag ? tag.Name : '1 tag';
        displayText.style.color = '#ef4444';
    } else {
        displayText.textContent = `${excludedTags.length} tags`;
        displayText.style.color = '#ef4444';
    }
}

/**
 * Filter exclude tag options based on search input
 */
window.filterExcludeTagOptions = function() {
    const searchInput = document.getElementById('excludeTagFilterSearchInput');
    const searchTerm = searchInput ? searchInput.value : '';
    window.populateExcludeTagFilterOptions(searchTerm);
};

/**
 * Update selected tags display in main area
 */
window.updateSelectedTagsMainDisplay = function() {
    const parentContainer = document.getElementById('activeFiltersDisplay');
    const container = document.getElementById('selectedTagsDisplay');
    const listEl = document.getElementById('selectedTagsDisplayList');
    if (!container || !listEl) return;

    const selectedTags = window.getSelectedTagFilters();
    const tags = window.availableTags || [];

    if (selectedTags.length === 0) {
        container.style.display = 'none';
        updateActiveFiltersVisibility();
        return;
    }

    container.style.display = 'block';

    // If tags not loaded yet, show loading state
    if (tags.length === 0) {
        listEl.innerHTML = `<span style="font-size: 11px; color: #9ca3af;"><i class="fas fa-spinner fa-spin"></i> ${selectedTags.length} tag...</span>`;
        updateActiveFiltersVisibility();
        return;
    }

    listEl.innerHTML = selectedTags.map(tagId => {
        const tag = tags.find(t => String(t.Id) === String(tagId));
        const tagColor = tag?.Color || '#3b82f6';
        const tagName = tag?.Name || `Tag #${tagId}`;
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${tagColor}20; color: ${tagColor}; border: 1px solid ${tagColor}40;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tagColor}; margin-right: 4px;"></span>
            ${tagName}
            <button onclick="removeSelectedTagFromMain('${tagId}')" style="margin-left: 6px; background: none; border: none; cursor: pointer; padding: 0; color: ${tagColor}; font-size: 12px; line-height: 1; opacity: 0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Bỏ lọc tag này">×</button>
        </span>`;
    }).join('');

    updateActiveFiltersVisibility();
};

/**
 * Remove a tag from selected filter list directly from main page
 */
window.removeSelectedTagFromMain = function(tagId) {
    const selectedTags = window.getSelectedTagFilters();
    const index = selectedTags.indexOf(String(tagId));
    if (index > -1) {
        selectedTags.splice(index, 1);
        window.saveSelectedTagFilters(selectedTags);
        updateTagFilterDisplayText();
        window.updateSelectedTagsMainDisplay();
        // Update dropdown checkboxes
        const searchInput = document.getElementById('tagFilterSearchInput');
        window.populateTagFilterOptions(searchInput?.value || '');
        // Re-apply filter
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
    }
};

/**
 * Update excluded tags display in main area
 */
window.updateExcludedTagsMainDisplay = function() {
    const container = document.getElementById('excludedTagsDisplay');
    const listEl = document.getElementById('excludedTagsDisplayList');
    if (!container || !listEl) return;

    const excludedTags = window.getExcludedTagFilters();
    const tags = window.availableTags || [];

    if (excludedTags.length === 0) {
        container.style.display = 'none';
        updateActiveFiltersVisibility();
        return;
    }

    container.style.display = 'block';

    // If tags not loaded yet, show loading state
    if (tags.length === 0) {
        listEl.innerHTML = `<span style="font-size: 11px; color: #9ca3af;"><i class="fas fa-spinner fa-spin"></i> ${excludedTags.length} tag...</span>`;
        updateActiveFiltersVisibility();
        return;
    }

    listEl.innerHTML = excludedTags.map(tagId => {
        const tag = tags.find(t => String(t.Id) === String(tagId));
        const tagColor = tag?.Color || '#6b7280';
        const tagName = tag?.Name || `Tag #${tagId}`;
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${tagColor}20; color: ${tagColor}; border: 1px solid ${tagColor}40;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tagColor}; margin-right: 4px;"></span>
            ${tagName}
            <button onclick="removeExcludedTagFromMain('${tagId}')" style="margin-left: 6px; background: none; border: none; cursor: pointer; padding: 0; color: ${tagColor}; font-size: 12px; line-height: 1; opacity: 0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Bỏ ẩn tag này">×</button>
        </span>`;
    }).join('');

    updateActiveFiltersVisibility();
};

/**
 * Update activeFiltersDisplay container visibility
 */
function updateActiveFiltersVisibility() {
    const parentContainer = document.getElementById('activeFiltersDisplay');
    const selectedDisplay = document.getElementById('selectedTagsDisplay');
    const excludedDisplay = document.getElementById('excludedTagsDisplay');

    if (!parentContainer) return;

    const hasSelected = selectedDisplay && selectedDisplay.style.display !== 'none';
    const hasExcluded = excludedDisplay && excludedDisplay.style.display !== 'none';

    parentContainer.style.display = (hasSelected || hasExcluded) ? 'block' : 'none';
}

/**
 * Remove a tag from excluded list directly from main page
 */
window.removeExcludedTagFromMain = function(tagId) {
    const excludedTags = window.getExcludedTagFilters();
    const index = excludedTags.indexOf(String(tagId));
    if (index > -1) {
        excludedTags.splice(index, 1);
        window.saveExcludedTagFilters(excludedTags);
        updateExcludeTagFilterDisplayText();
        window.updateExcludedTagsMainDisplay();
        // Re-apply filter
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
    }
};

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    const tagDropdown = document.getElementById('tagFilterDropdown');
    const excludeDropdown = document.getElementById('excludeTagFilterDropdown');

    if (tagDropdown && !tagDropdown.contains(event.target)) {
        window.closeTagFilterDropdown();
    }
    if (excludeDropdown && !excludeDropdown.contains(event.target)) {
        window.closeExcludeTagFilterDropdown();
    }
});

