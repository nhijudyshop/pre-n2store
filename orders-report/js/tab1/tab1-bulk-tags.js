// #region ═══════════════════════════════════════════════════════════════════════
// ║                     SECTION 6: BULK TAG ASSIGNMENT                          ║
// ║                            search: #BULK-TAG                                ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// BULK TAG ASSIGNMENT FUNCTIONS #BULK-TAG
// =====================================================

/**
 * Parse STT input string into array of numbers
 * Supports formats: "1, 2, 3", "1-5", "1, 5-10, 15"
 */
function parseBulkSTTInput(input) {
    const sttNumbers = new Set();

    if (!input || !input.trim()) {
        return sttNumbers;
    }

    // Split by comma or space
    const parts = input.split(/[,\s]+/).filter(p => p.trim());

    parts.forEach(part => {
        part = part.trim();

        // Check if it's a range (e.g., "5-10")
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    sttNumbers.add(i);
                }
            }
        } else {
            // Single number
            const num = parseInt(part);
            if (!isNaN(num)) {
                sttNumbers.add(num);
            }
        }
    });

    return sttNumbers;
}

// =====================================================
// BULK TAG MODAL FUNCTIONS
// =====================================================

// State variables for bulk tag modal
// Each tag item: {tagId, tagName, tagColor, sttList: Array (giữ thứ tự nhập), errorMessage: string|null}
let bulkTagModalData = [];
let selectedBulkTagModalRows = new Set(); // Set of selected tag IDs

// LocalStorage key for bulk tag modal draft
const BULK_TAG_DRAFT_KEY = 'bulkTagModalDraft';

// ===== LocalStorage Functions =====

// Save bulk tag modal data to localStorage
function saveBulkTagToLocalStorage() {
    try {
        const dataToSave = bulkTagModalData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));
        localStorage.setItem(BULK_TAG_DRAFT_KEY, JSON.stringify(dataToSave));
        console.log("[BULK-TAG-MODAL] Saved draft to localStorage:", dataToSave);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving to localStorage:", error);
    }
}

// Load bulk tag modal data from localStorage
function loadBulkTagFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(BULK_TAG_DRAFT_KEY);
        if (!savedData) return false;

        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return false;

        bulkTagModalData = parsedData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));

        // Auto-select tags with STTs
        selectedBulkTagModalRows.clear();
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });

        console.log("[BULK-TAG-MODAL] Loaded draft from localStorage:", bulkTagModalData);
        return true;
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading from localStorage:", error);
        return false;
    }
}

// Clear bulk tag localStorage
function clearBulkTagLocalStorage() {
    try {
        localStorage.removeItem(BULK_TAG_DRAFT_KEY);
        console.log("[BULK-TAG-MODAL] Cleared localStorage draft");
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error clearing localStorage:", error);
    }
}

// Show bulk tag modal
async function showBulkTagModal() {
    console.log("[BULK-TAG-MODAL] Opening bulk tag modal");

    // Try to load from localStorage first
    const hasStoredData = loadBulkTagFromLocalStorage();

    if (!hasStoredData) {
        // Reset state if no stored data
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
    }

    // Update UI
    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    updateBulkTagSelectAllCheckbox();
    document.getElementById('bulkTagModalSearchInput').value = '';

    // Load tags for dropdown
    await loadBulkTagModalOptions();

    // Show modal
    document.getElementById('bulkTagModal').classList.add('show');
}

// Close bulk tag modal
function closeBulkTagModal() {
    // Save current state to localStorage before closing
    if (bulkTagModalData.length > 0) {
        saveBulkTagToLocalStorage();
    }

    document.getElementById('bulkTagModal').classList.remove('show');
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
    // Don't clear data - keep in memory for when modal reopens
}

// Load tag options for search dropdown
async function loadBulkTagModalOptions() {
    try {
        // Use existing availableTags or fetch from API
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }
        populateBulkTagModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading tags:", error);
    }
}

// Populate dropdown with tag options
function populateBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    const searchValue = document.getElementById('bulkTagModalSearchInput').value.toLowerCase().trim();

    // Use window.availableTags (from HTML) or local availableTags (from JS)
    const tags = window.availableTags || availableTags || [];

    console.log("[BULK-TAG-MODAL] Populating dropdown, tags count:", tags.length);

    // Check if tags is loaded
    if (!tags || tags.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                Đang tải danh sách tag...
                <br><br>
                <button onclick="refreshBulkTagModalDropdown()" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
        `;
        return;
    }

    // Filter tags by search
    const filteredTags = tags.filter(tag =>
        tag.Name && tag.Name.toLowerCase().includes(searchValue)
    );

    if (filteredTags.length === 0) {
        const escapedSearch = searchValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                Không tìm thấy tag "${escapedSearch}" - <b style="color: #10b981;">Nhấn Enter để tạo</b>
            </div>
        `;
        return;
    }

    // Check which tags are already added
    const addedTagIds = new Set(bulkTagModalData.map(t => t.tagId));

    // Limit display to first 100 tags for performance
    const displayTags = filteredTags.slice(0, 100);

    // Track first available (not added) tag for highlighting
    let firstAvailableFound = false;

    dropdown.innerHTML = displayTags.map(tag => {
        const isAdded = addedTagIds.has(tag.Id);
        const tagName = tag.Name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        // Highlight first tag that is NOT already added
        let isHighlighted = false;
        if (!isAdded && !firstAvailableFound) {
            isHighlighted = true;
            firstAvailableFound = true;
        }

        return `
            <div class="bulk-tag-search-option ${isAdded ? 'disabled' : ''} ${isHighlighted ? 'highlighted' : ''}"
                 data-tag-id="${tag.Id}"
                 data-tag-name="${tagName}"
                 data-tag-color="${tag.Color || '#6b7280'}"
                 onclick="${isAdded ? '' : `addTagToBulkTagModal('${tag.Id}', '${tagName}', '${tag.Color || '#6b7280'}')`}">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isAdded ? '<span class="tag-added">Đã thêm</span>' : ''}
            </div>
        `;
    }).join('');

    // Show count if there are more tags
    if (filteredTags.length > 100) {
        dropdown.innerHTML += `
            <div style="padding: 10px 14px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
                Hiển thị 100/${filteredTags.length} tag. Nhập từ khóa để lọc.
            </div>
        `;
    }
}

// Show bulk tag modal dropdown (on focus)
function showBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    populateBulkTagModalDropdown();
    dropdown.classList.add('show');
}

// Refresh bulk tag modal dropdown (used by "Tải lại" button)
async function refreshBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');

    // Show loading state
    dropdown.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #9ca3af;">
            <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
            Đang tải danh sách tag...
        </div>
    `;

    try {
        // Force reload tags from API
        await loadAvailableTags();
        populateBulkTagModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error refreshing tags:", error);
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                Lỗi tải danh sách tag
                <br><br>
                <button onclick="refreshBulkTagModalDropdown()" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Thử lại
                </button>
            </div>
        `;
    }
}

// Filter bulk tag modal options based on search input
function filterBulkTagModalOptions() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    populateBulkTagModalDropdown();
    dropdown.classList.add('show');
}

// Handle keydown on search input
function handleBulkTagModalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const searchValue = document.getElementById('bulkTagModalSearchInput').value.trim();

        // Find highlighted tag (first available tag)
        const highlightedTag = document.querySelector('.bulk-tag-search-option.highlighted');

        if (highlightedTag) {
            // Has highlighted tag → select it
            const tagId = highlightedTag.getAttribute('data-tag-id');
            const tagName = highlightedTag.getAttribute('data-tag-name');
            const tagColor = highlightedTag.getAttribute('data-tag-color');
            addTagToBulkTagModal(tagId, tagName, tagColor);
        } else if (searchValue !== '') {
            // No matching tag → create new tag
            autoCreateAndAddTagToBulkModal(searchValue);
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
        document.getElementById('bulkTagModalSearchInput').blur();
    }
}

// Auto-create tag and add to bulk tag modal when search yields no results
async function autoCreateAndAddTagToBulkModal(tagName) {
    if (!tagName || tagName.trim() === '') return;

    const name = tagName.trim().toUpperCase(); // Convert to uppercase for consistency
    const color = generateRandomColor();

    try {
        // Show loading notification
        if (window.notificationManager) {
            window.notificationManager.info(`Đang tạo tag "${name}"...`);
        }

        console.log('[BULK-TAG-MODAL] Creating tag:', { name, color });

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
        console.log('[BULK-TAG-MODAL] Tag created successfully:', newTag);

        // Remove @odata.context from newTag (Firebase doesn't allow keys with dots)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
        }

        // IMPORTANT: Add new tag directly to availableTags first (before reload)
        // This ensures the tag appears immediately in dropdown even if TPOS hasn't indexed it yet
        if (Array.isArray(availableTags)) {
            // Check if not already exists
            const existsInAvailable = availableTags.some(t => t.Id === newTag.Id);
            if (!existsInAvailable) {
                availableTags.push(newTag);
                window.availableTags = availableTags;
                console.log('[BULK-TAG-MODAL] Added new tag directly to availableTags:', newTag.Name);
            }
        }

        // Clear tags cache and update with new list
        window.cacheManager.clear("tags");
        window.cacheManager.set("tags", availableTags, "tags");
        console.log('[BULK-TAG-MODAL] Updated tags cache with new tag');

        // Update filter dropdowns
        populateTagFilter();
        populateBulkTagModalDropdown();

        // Add the new tag to bulk tag modal table using response data
        // newTag from API response contains: Id, Name, Color, NameNosign, Type
        addTagToBulkTagModal(newTag.Id, newTag.Name, newTag.Color);

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo và thêm tag "${name}"!`);
        }

        console.log('[BULK-TAG-MODAL] Tag created and added to bulk modal');

    } catch (error) {
        console.error('[BULK-TAG-MODAL] Error creating tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    }
}

// Add tag to bulk tag modal
function addTagToBulkTagModal(tagId, tagName, tagColor) {
    console.log("[BULK-TAG-MODAL] Adding tag:", tagName);

    // Check if already exists
    if (bulkTagModalData.some(t => t.tagId === tagId)) {
        return;
    }

    // Add to data
    bulkTagModalData.push({
        tagId: tagId,
        tagName: tagName,
        tagColor: tagColor,
        sttList: []
    });

    // Update UI
    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();

    // Clear search input
    document.getElementById('bulkTagModalSearchInput').value = '';
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
}

// Remove tag row from modal
function removeTagFromBulkTagModal(tagId) {
    bulkTagModalData = bulkTagModalData.filter(t => t.tagId !== tagId);
    selectedBulkTagModalRows.delete(tagId);

    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();
}

// Clear all tag rows
function clearAllBulkTagRows() {
    if (bulkTagModalData.length === 0) return;

    if (confirm('Bạn có chắc muốn xóa tất cả tag đã thêm?')) {
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
        document.getElementById('bulkTagSelectAllCheckbox').checked = false;

        // Clear localStorage
        clearBulkTagLocalStorage();

        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        populateBulkTagModalDropdown();
    }
}

// Update row count display
function updateBulkTagModalRowCount() {
    const countEl = document.getElementById('bulkTagRowCount');
    countEl.textContent = `${bulkTagModalData.length} tag đã thêm`;
}

// Toggle select all
function toggleBulkTagSelectAll(checked) {
    if (checked) {
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });
    } else {
        selectedBulkTagModalRows.clear();
    }

    updateBulkTagModalTable();
}

// Toggle individual row selection
function toggleBulkTagRowSelection(tagId) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData || tagData.sttList.length === 0) return;

    if (selectedBulkTagModalRows.has(tagId)) {
        selectedBulkTagModalRows.delete(tagId);
    } else {
        selectedBulkTagModalRows.add(tagId);
    }

    updateBulkTagModalTable();
    updateBulkTagSelectAllCheckbox();
}

// Update select all checkbox state
function updateBulkTagSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('bulkTagSelectAllCheckbox');
    const tagsWithSTT = bulkTagModalData.filter(t => t.sttList.length > 0);

    if (tagsWithSTT.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size === tagsWithSTT.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// Add STT to a tag
function addSTTToBulkTagRow(tagId, inputElement) {
    const sttValue = inputElement.value.trim();
    if (!sttValue) return;

    const stt = parseInt(sttValue);
    if (isNaN(stt) || stt <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('STT phải là số nguyên dương', 2000);
        }
        return;
    }

    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    // Check if STT exists in current data - O(1) via OrderStore.getBySTT
    const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} không tồn tại trong danh sách hiện tại`, 2000);
        }
        return;
    }

    // Check if already added (using Array.includes)
    if (tagData.sttList.includes(stt)) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} đã được thêm`, 2000);
        }
        inputElement.value = '';
        return;
    }

    // Add STT (giữ nguyên thứ tự nhập)
    tagData.sttList.push(stt);
    inputElement.value = '';

    updateBulkTagModalTable();

    // Re-focus on the input after table re-render
    setTimeout(() => {
        const newInput = document.querySelector(`.bulk-tag-row[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
        if (newInput) {
            newInput.focus();
        }
    }, 10);
}

// Handle Enter key on STT input
function handleBulkTagSTTInputKeydown(event, tagId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSTTToBulkTagRow(tagId, event.target);
    }
}

// Remove STT from a tag
function removeSTTFromBulkTagRow(tagId, stt) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    tagData.sttList = tagData.sttList.filter(s => s !== stt);

    // If no more STTs, deselect the row
    if (tagData.sttList.length === 0) {
        selectedBulkTagModalRows.delete(tagId);
    }

    updateBulkTagModalTable();
    updateBulkTagSelectAllCheckbox();
}

// Update the bulk tag modal table
function updateBulkTagModalTable() {
    const tableBody = document.getElementById('bulkTagTableBody');

    if (bulkTagModalData.length === 0) {
        tableBody.innerHTML = `
            <div class="bulk-tag-empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
            </div>
        `;
        return;
    }

    tableBody.innerHTML = bulkTagModalData.map(tagData => {
        const isSelected = selectedBulkTagModalRows.has(tagData.tagId);
        const sttArray = tagData.sttList || []; // Giữ nguyên thứ tự nhập, không sort
        const sttCount = sttArray.length;
        const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;

        // Get customer names for STTs - O(1) via OrderStore.getBySTT
        const sttPillsHtml = sttArray.map(stt => {
            const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);
            const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
            return `
                <div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="removeSTTFromBulkTagRow('${tagData.tagId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Error message HTML
        const errorHtml = hasError ? `
            <div class="bulk-tag-row-error">
                ${tagData.errorMessage}
            </div>
        ` : '';

        return `
            <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                <div class="bulk-tag-row-tag">
                    <input type="checkbox"
                           ${isSelected ? 'checked' : ''}
                           ${sttCount === 0 ? 'disabled' : ''}
                           onchange="toggleBulkTagRowSelection('${tagData.tagId}')"
                           title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để gán tag'}">
                    <div class="bulk-tag-row-tag-info">
                        <span class="tag-color-dot" style="background-color: ${tagData.tagColor}"></span>
                        <span class="tag-name">${tagData.tagName}</span>
                    </div>
                    ${errorHtml}
                </div>
                <div class="bulk-tag-row-stt">
                    <div class="bulk-tag-stt-pills">
                        ${sttPillsHtml || '<span style="color: #9ca3af; font-size: 13px;">Chưa có STT nào</span>'}
                    </div>
                    <div class="bulk-tag-stt-input-wrapper">
                        <input type="number"
                               class="bulk-tag-stt-input"
                               placeholder="Nhập STT và Enter"
                               onkeydown="handleBulkTagSTTInputKeydown(event, '${tagData.tagId}')">
                        <span class="bulk-tag-stt-counter">(${sttCount})</span>
                    </div>
                </div>
                <div class="bulk-tag-row-action">
                    <button class="bulk-tag-remove-row-btn" onclick="removeTagFromBulkTagModal('${tagData.tagId}')" title="Xóa tag này">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Execute bulk tag modal assignment
/**
 * Execute bulk tag assignment from modal
 * New flow:
 * 1. Check for "ĐÃ GỘP KO CHỐT" tag before assigning
 * 2. Track success/failed for each tag
 * 3. After assignment, remove successful tags/STTs, keep failed ones
 * 4. Save to Firebase with new format
 * 5. Show result modal
 * 6. DON'T close modal automatically
 */

// Helper function to normalize phone numbers
function normalizePhoneForBulkTag(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // Handle Vietnam country code: replace leading 84 with 0
    if (cleaned.startsWith('84')) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

async function executeBulkTagModalAssignment() {
    console.log("[BULK-TAG-MODAL] Executing bulk tag assignment");

    // Get selected tags with STTs (checked rows only)
    const selectedTags = bulkTagModalData.filter(t =>
        selectedBulkTagModalRows.has(t.tagId) && t.sttList.length > 0
    );

    // Validate: at least one tag selected with STTs
    if (selectedTags.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để gán', 3000);
        } else {
            alert('Vui lòng chọn ít nhất một tag có STT để gán');
        }
        return;
    }

    try {
        showLoading(true);

        // Results tracking
        const successResults = []; // Array of {tagName, tagColor, sttList: []}
        const failedResults = [];  // Array of {tagName, tagColor, sttList: [], reason}

        // Process each selected tag
        for (const selectedTag of selectedTags) {
            const tagInfo = {
                Id: parseInt(selectedTag.tagId, 10),
                Name: selectedTag.tagName,
                Color: selectedTag.tagColor
            };

            const sttArray = selectedTag.sttList || [];
            const successSTT = [];
            const failedSTT = [];
            let failReason = null;

            // Find orders matching STT
            const matchingOrders = displayedData.filter(order =>
                sttArray.includes(order.SessionIndex)
            );

            if (matchingOrders.length === 0) {
                console.warn(`[BULK-TAG-MODAL] No orders found for tag "${tagInfo.Name}"`);
                continue;
            }

            console.log(`[BULK-TAG-MODAL] Processing tag "${tagInfo.Name}" for ${matchingOrders.length} orders`);

            // Process each order
            for (const order of matchingOrders) {
                try {
                    // Parse current tags
                    const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                    const currentTags = rawTags.map(t => ({
                        Id: parseInt(t.Id, 10),
                        Name: t.Name,
                        Color: t.Color
                    }));

                    // Check if order has "ĐÃ GỘP KO CHỐT" tag (exact match)
                    const hasBlockedTag = currentTags.some(t => t.Name === "ĐÃ GỘP KO CHỐT");
                    if (hasBlockedTag) {
                        console.log(`[BULK-TAG-MODAL] Order ${order.Code} has blocked tag "ĐÃ GỘP KO CHỐT", finding replacement...`);

                        // Get normalized phone number
                        const originalSTT = order.SessionIndex;
                        const normalizedPhone = normalizePhoneForBulkTag(order.Telephone);

                        if (!normalizedPhone) {
                            console.log(`[BULK-TAG-MODAL] Order ${order.Code} has no phone number`);
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Đơn có tag "ĐÃ GỘP KO CHỐT" và không có SĐT';
                            continue;
                        }

                        // Find all orders with same phone number (excluding current order)
                        const samePhoneOrders = displayedData.filter(o =>
                            o.Id !== order.Id && normalizePhoneForBulkTag(o.Telephone) === normalizedPhone
                        );

                        if (samePhoneOrders.length === 0) {
                            console.log(`[BULK-TAG-MODAL] No replacement order found for phone ${normalizedPhone}`);
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Không tìm thấy đơn thay thế cùng SĐT';
                            continue;
                        }

                        // Select order with highest STT
                        const replacementOrder = samePhoneOrders.sort((a, b) =>
                            b.SessionIndex - a.SessionIndex
                        )[0];

                        console.log(`[BULK-TAG-MODAL] Found replacement order ${replacementOrder.Code} (STT ${replacementOrder.SessionIndex}) for blocked order ${order.Code} (STT ${originalSTT})`);

                        // Parse replacement order's tags
                        const replacementRawTags = replacementOrder.Tags ? JSON.parse(replacementOrder.Tags) : [];
                        const replacementCurrentTags = replacementRawTags.map(t => ({
                            Id: parseInt(t.Id, 10),
                            Name: t.Name,
                            Color: t.Color
                        }));

                        // Check if tag already exists on replacement order
                        const tagExistsOnReplacement = replacementCurrentTags.some(t => t.Id === tagInfo.Id);
                        if (tagExistsOnReplacement) {
                            console.log(`[BULK-TAG-MODAL] Tag already exists on replacement order ${replacementOrder.Code}`);
                            successSTT.push({
                                original: originalSTT,
                                redirectTo: replacementOrder.SessionIndex,
                                redirected: true
                            });
                            continue;
                        }

                        // Build updated tags for replacement order
                        const replacementUpdatedTags = [
                            ...replacementCurrentTags,
                            {
                                Id: tagInfo.Id,
                                Name: tagInfo.Name,
                                Color: tagInfo.Color
                            }
                        ];

                        // Call API to assign tag to replacement order
                        try {
                            const authHeaders = await window.tokenManager.getAuthHeader();
                            const response = await fetch(
                                "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                                {
                                    method: "POST",
                                    headers: {
                                        ...authHeaders,
                                        "Content-Type": "application/json",
                                        "Accept": "application/json"
                                    },
                                    body: JSON.stringify({
                                        Tags: replacementUpdatedTags,
                                        OrderId: replacementOrder.Id
                                    }),
                                }
                            );

                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }

                            // Update local data for replacement order
                            const updatedData = { Tags: JSON.stringify(replacementUpdatedTags) };
                            updateOrderInTable(replacementOrder.Id, updatedData);

                            // Emit Firebase update for replacement order
                            await emitTagUpdateToFirebase(replacementOrder.Id, replacementUpdatedTags);

                            // Record success with redirect info
                            successSTT.push({
                                original: originalSTT,
                                redirectTo: replacementOrder.SessionIndex,
                                redirected: true
                            });
                            console.log(`[BULK-TAG-MODAL] Successfully tagged replacement order ${replacementOrder.Code} with "${tagInfo.Name}" (redirected from STT ${originalSTT})`);

                        } catch (apiError) {
                            console.error(`[BULK-TAG-MODAL] Error tagging replacement order ${replacementOrder.Code}:`, apiError);
                            failedSTT.push(order.SessionIndex);
                            failReason = failReason || `Lỗi API khi gán cho đơn thay thế: ${apiError.message}`;
                        }

                        continue;
                    }

                    // Check if tag already exists
                    const tagExists = currentTags.some(t => t.Id === tagInfo.Id);
                    if (tagExists) {
                        console.log(`[BULK-TAG-MODAL] Tag already exists for order ${order.Code}`);
                        successSTT.push(order.SessionIndex);
                        continue;
                    }

                    // Build updated tags array
                    const updatedTags = [
                        ...currentTags,
                        {
                            Id: tagInfo.Id,
                            Name: tagInfo.Name,
                            Color: tagInfo.Color
                        }
                    ];

                    // Call API to assign tag
                    const authHeaders = await window.tokenManager.getAuthHeader();
                    const response = await fetch(
                        "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                        {
                            method: "POST",
                            headers: {
                                ...authHeaders,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                Tags: updatedTags,
                                OrderId: order.Id
                            }),
                        }
                    );

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}`);
                    }

                    // Update local data
                    const updatedData = { Tags: JSON.stringify(updatedTags) };
                    updateOrderInTable(order.Id, updatedData);

                    // Emit Firebase update
                    await emitTagUpdateToFirebase(order.Id, updatedTags);

                    successSTT.push(order.SessionIndex);
                    console.log(`[BULK-TAG-MODAL] Successfully tagged order ${order.Code} with "${tagInfo.Name}"`);

                } catch (error) {
                    console.error(`[BULK-TAG-MODAL] Error tagging order ${order.Code}:`, error);
                    failedSTT.push(order.SessionIndex);
                    failReason = failReason || `Lỗi API: ${error.message}`;
                }
            }

            // Collect results for this tag
            // Separate normal STTs and redirected STTs
            const normalSTT = successSTT.filter(s => typeof s === 'number');
            const redirectedSTT = successSTT.filter(s => typeof s === 'object' && s.redirected);

            if (successSTT.length > 0) {
                successResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: normalSTT.sort((a, b) => a - b),
                    redirectedList: redirectedSTT.sort((a, b) => a.original - b.original)
                });
            }

            if (failedSTT.length > 0) {
                failedResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: failedSTT.sort((a, b) => a - b),
                    reason: failReason || 'Lỗi không xác định'
                });
            }

            // Update modal data: remove successful STTs, keep failed ones
            const tagDataInModal = bulkTagModalData.find(t => t.tagId === selectedTag.tagId);
            if (tagDataInModal) {
                // Get all successful original STTs (both normal and redirected)
                const successOriginalSTTs = [
                    ...normalSTT,
                    ...redirectedSTT.map(r => r.original)
                ];
                // Remove successful STTs
                tagDataInModal.sttList = tagDataInModal.sttList.filter(stt => !successOriginalSTTs.includes(stt));

                // Set error message if there are failures
                if (failedSTT.length > 0) {
                    tagDataInModal.errorMessage = `⚠️ STT ${failedSTT.join(', ')} - ${failReason}`;
                } else {
                    tagDataInModal.errorMessage = null;
                }
            }

            console.log(`[BULK-TAG-MODAL] Tag "${tagInfo.Name}" result: ${successSTT.length} success, ${failedSTT.length} failed`);
        }

        // Clear cache
        window.cacheManager.clear("orders");

        // Remove tags with no remaining STTs
        bulkTagModalData = bulkTagModalData.filter(tag => tag.sttList.length > 0);

        // Update selected rows
        selectedBulkTagModalRows.clear();
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });

        // Save/clear localStorage based on remaining data
        if (bulkTagModalData.length > 0) {
            saveBulkTagToLocalStorage();
        } else {
            clearBulkTagLocalStorage();
        }

        // Save history to Firebase
        const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length + (r.redirectedList?.length || 0), 0);
        const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

        if (totalSuccess > 0 || totalFailed > 0) {
            await saveBulkTagHistory({
                success: successResults,
                failed: failedResults
            });
        }

        showLoading(false);

        // Update modal UI
        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        updateBulkTagSelectAllCheckbox();

        // Show result modal
        showBulkTagResultModal(successResults, failedResults);

        // DON'T close modal - user must click "Hủy" to close

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error in bulk tag assignment:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 5000);
        } else {
            alert(`Lỗi: ${error.message}`);
        }
    }
}

// Save bulk tag history to Firebase
async function saveBulkTagHistory(results) {
    try {
        const timestamp = Date.now();
        const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');

        // Get identifier name (tên định danh) - fallback to DisplayName if not available
        let username = 'Unknown';
        try {
            // Ưu tiên dùng identifier name (tên định danh)
            if (currentUserIdentifier) {
                username = currentUserIdentifier;
            } else {
                // Fallback to DisplayName from tokenManager
                const tokenData = window.tokenManager?.getTokenData?.();
                username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
            }
        } catch (e) {
            console.warn("[BULK-TAG-MODAL] Could not get username:", e);
        }

        const historyEntry = {
            timestamp: timestamp,
            dateFormatted: dateFormatted,
            username: username,
            results: results, // {success: [...], failed: [...]}
            summary: {
                totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
            }
        };

        // Save to Firebase
        const historyRef = database.ref(`bulkTagHistory/${timestamp}`);
        await historyRef.set(historyEntry);

        console.log("[BULK-TAG-MODAL] History saved to Firebase:", historyEntry);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving history:", error);
    }
}

// Show bulk tag result modal
function showBulkTagResultModal(successResults, failedResults) {
    const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length + (r.redirectedList?.length || 0), 0);
    const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

    // Build success HTML
    let successHtml = '';
    if (successResults.length > 0) {
        successHtml = `
            <div class="bulk-tag-result-section success">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-check-circle"></i>
                    <span>Thành công (${totalSuccess} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${successResults.map(r => {
            // Build normal STT display
            const normalSttDisplay = r.sttList.length > 0
                ? `STT ${r.sttList.join(', ')}`
                : '';

            // Build redirected STT display
            const redirectedDisplay = r.redirectedList?.length > 0
                ? r.redirectedList.map(rd => `${rd.original} → ${rd.redirectTo}`).join(', ')
                : '';

            // Combine displays
            let sttDisplay = '';
            if (normalSttDisplay && redirectedDisplay) {
                sttDisplay = `${normalSttDisplay}, ${redirectedDisplay}`;
            } else if (normalSttDisplay) {
                sttDisplay = normalSttDisplay;
            } else if (redirectedDisplay) {
                sttDisplay = `STT ${redirectedDisplay}`;
            }

            // Add redirect note if there are redirected items
            const redirectNote = r.redirectedList?.length > 0
                ? `<div class="redirect-note" style="font-size: 11px; color: #6b7280; margin-top: 2px;">↳ Chuyển sang đơn cùng SĐT</div>`
                : '';

            return `
                            <div class="bulk-tag-result-item">
                                <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                                <span class="tag-name">${r.tagName}:</span>
                                <span class="stt-list">${sttDisplay}</span>
                                ${redirectNote}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    // Build failed HTML
    let failedHtml = '';
    if (failedResults.length > 0) {
        failedHtml = `
            <div class="bulk-tag-result-section failed">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-times-circle"></i>
                    <span>Thất bại (${totalFailed} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${failedResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Create and show modal
    const modalHtml = `
        <div class="bulk-tag-result-modal" id="bulkTagResultModal">
            <div class="bulk-tag-result-modal-content">
                <div class="bulk-tag-result-modal-header">
                    <h3><i class="fas fa-clipboard-list"></i> Kết Quả Gán Tag</h3>
                    <button class="bulk-tag-result-modal-close" onclick="closeBulkTagResultModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bulk-tag-result-modal-body">
                    ${successHtml}
                    ${failedHtml}
                    ${totalSuccess === 0 && totalFailed === 0 ? '<p style="text-align: center; color: #9ca3af;">Không có kết quả nào</p>' : ''}
                </div>
                <div class="bulk-tag-result-modal-footer">
                    <button class="bulk-tag-btn-confirm" onclick="closeBulkTagResultModal()">
                        <i class="fas fa-check"></i> Đóng
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('bulkTagResultModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    setTimeout(() => {
        document.getElementById('bulkTagResultModal').classList.add('show');
    }, 10);
}

// Close bulk tag result modal
function closeBulkTagResultModal() {
    const modal = document.getElementById('bulkTagResultModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

// Show bulk tag history modal
async function showBulkTagHistoryModal() {
    console.log("[BULK-TAG-MODAL] Opening history modal");

    const historyBody = document.getElementById('bulkTagHistoryModalBody');
    historyBody.innerHTML = `
        <div class="bulk-tag-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử...</p>
        </div>
    `;

    document.getElementById('bulkTagHistoryModal').classList.add('show');

    try {
        // Load history from Firebase
        const historyRef = database.ref('bulkTagHistory');
        const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
        const historyData = snapshot.val();

        if (!historyData) {
            historyBody.innerHTML = `
                <div class="bulk-tag-history-empty">
                    <i class="fas fa-history"></i>
                    <p>Chưa có lịch sử gán tag nào</p>
                </div>
            `;
            return;
        }

        // Convert to array and sort by timestamp descending
        const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

        historyBody.innerHTML = `
            <div class="bulk-tag-history-list">
                ${historyArray.map((entry, index) => renderBulkTagHistoryItem(entry, index)).join('')}
            </div>
        `;

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading history:", error);
        historyBody.innerHTML = `
            <div class="bulk-tag-history-empty">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}

// Render a single history item (new format)
function renderBulkTagHistoryItem(entry, index) {
    const { dateFormatted, username, results, summary } = entry;

    // Build success section
    let successHtml = '';
    if (results.success && results.success.length > 0) {
        successHtml = `
            <div class="bulk-tag-history-success">
                <div class="bulk-tag-history-success-title">
                    <i class="fas fa-check-circle"></i>
                    Thành công (${summary.totalSuccess} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.success.map(r => `
                        <div class="bulk-tag-history-tag-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${(r.sttList || []).join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build failed section
    let failedHtml = '';
    if (results.failed && results.failed.length > 0) {
        failedHtml = `
            <div class="bulk-tag-history-failed">
                <div class="bulk-tag-history-failed-title">
                    <i class="fas fa-times-circle"></i>
                    Thất bại (${summary.totalFailed} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.failed.map(r => `
                        <div class="bulk-tag-history-tag-item failed">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${(r.sttList || []).join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="bulk-tag-history-item" id="bulkTagHistoryItem${index}">
            <div class="bulk-tag-history-header" onclick="toggleBulkTagHistoryItem(${index})">
                <div class="history-info">
                    <div class="history-time">
                        <i class="fas fa-clock"></i>
                        ${dateFormatted}
                    </div>
                    <div class="history-user">
                        <i class="fas fa-user"></i>
                        ${username || 'Unknown'}
                    </div>
                </div>
                <div class="history-summary">
                    <span class="success-count"><i class="fas fa-check"></i> ${summary.totalSuccess}</span>
                    <span class="failed-count"><i class="fas fa-times"></i> ${summary.totalFailed}</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="bulk-tag-history-body">
                ${successHtml}
                ${failedHtml}
            </div>
        </div>
    `;
}

// Toggle history item expand/collapse
function toggleBulkTagHistoryItem(index) {
    const item = document.getElementById(`bulkTagHistoryItem${index}`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

// Close bulk tag history modal
function closeBulkTagHistoryModal() {
    document.getElementById('bulkTagHistoryModal').classList.remove('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    const searchWrapper = document.querySelector('.bulk-tag-search-wrapper');
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');

    if (searchWrapper && dropdown && !searchWrapper.contains(event.target)) {
        dropdown.classList.remove('show');
    }

    // Also handle bulk tag delete modal dropdown
    const deleteSearchWrapper = document.querySelector('#bulkTagDeleteModal .bulk-tag-search-wrapper');
    const deleteDropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');

    if (deleteSearchWrapper && deleteDropdown && !deleteSearchWrapper.contains(event.target)) {
        deleteDropdown.classList.remove('show');
    }
});

// =====================================================
// BULK TAG DELETE MODAL FUNCTIONS
// =====================================================

// State variables for bulk tag delete modal
// Each tag item: {tagId, tagName, tagColor, sttList: Array, errorMessage: string|null}
let bulkTagDeleteModalData = [];
let selectedBulkTagDeleteModalRows = new Set(); // Set of selected tag IDs

// LocalStorage key for bulk tag delete modal draft
const BULK_TAG_DELETE_DRAFT_KEY = 'bulkTagDeleteModalDraft';

// ===== LocalStorage Functions =====

// Save bulk tag delete modal data to localStorage
function saveBulkTagDeleteToLocalStorage() {
    try {
        const dataToSave = bulkTagDeleteModalData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));
        localStorage.setItem(BULK_TAG_DELETE_DRAFT_KEY, JSON.stringify(dataToSave));
        console.log("[BULK-TAG-DELETE] Saved draft to localStorage:", dataToSave);
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error saving to localStorage:", error);
    }
}

// Load bulk tag delete modal data from localStorage
function loadBulkTagDeleteFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(BULK_TAG_DELETE_DRAFT_KEY);
        if (!savedData) return false;

        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return false;

        bulkTagDeleteModalData = parsedData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));

        // Auto-select tags with STTs
        selectedBulkTagDeleteModalRows.clear();
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });

        console.log("[BULK-TAG-DELETE] Loaded draft from localStorage:", bulkTagDeleteModalData);
        return true;
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading from localStorage:", error);
        return false;
    }
}

// Clear bulk tag delete localStorage
function clearBulkTagDeleteLocalStorage() {
    try {
        localStorage.removeItem(BULK_TAG_DELETE_DRAFT_KEY);
        console.log("[BULK-TAG-DELETE] Cleared localStorage draft");
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error clearing localStorage:", error);
    }
}

// Show bulk tag delete modal
async function showBulkTagDeleteModal() {
    console.log("[BULK-TAG-DELETE] Opening bulk tag delete modal");

    // Try to load from localStorage first
    const hasStoredData = loadBulkTagDeleteFromLocalStorage();

    if (!hasStoredData) {
        // Reset state if no stored data
        bulkTagDeleteModalData = [];
        selectedBulkTagDeleteModalRows.clear();
    }

    // Update UI
    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    updateBulkTagDeleteSelectAllCheckbox();
    document.getElementById('bulkTagDeleteModalSearchInput').value = '';

    // Load tags for dropdown
    await loadBulkTagDeleteModalOptions();

    // Show modal
    document.getElementById('bulkTagDeleteModal').classList.add('show');
}

// Close bulk tag delete modal
function closeBulkTagDeleteModal() {
    // Save current state to localStorage before closing
    if (bulkTagDeleteModalData.length > 0) {
        saveBulkTagDeleteToLocalStorage();
    }

    document.getElementById('bulkTagDeleteModal').classList.remove('show');
    document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
    // Don't clear data - keep in memory for when modal reopens
}

// Load tag options for search dropdown
async function loadBulkTagDeleteModalOptions() {
    try {
        // Use existing availableTags or fetch from API
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }
        populateBulkTagDeleteModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading tags:", error);
    }
}

// Populate dropdown with tag options
function populateBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    const searchValue = document.getElementById('bulkTagDeleteModalSearchInput').value.toLowerCase().trim();

    // Use window.availableTags (from HTML) or local availableTags (from JS)
    const tags = window.availableTags || availableTags || [];

    console.log("[BULK-TAG-DELETE] Populating dropdown, tags count:", tags.length);

    // Check if tags is loaded
    if (!tags || tags.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                Đang tải danh sách tag...
                <br><br>
                <button onclick="refreshBulkTagDeleteModalDropdown()" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
        `;
        return;
    }

    // Filter tags by search
    const filteredTags = tags.filter(tag =>
        tag.Name && tag.Name.toLowerCase().includes(searchValue)
    );

    if (filteredTags.length === 0) {
        const escapedSearch = searchValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                Không tìm thấy tag "${escapedSearch}"
            </div>
        `;
        return;
    }

    // Check which tags are already added
    const addedTagIds = new Set(bulkTagDeleteModalData.map(t => t.tagId));

    // Limit display to first 100 tags for performance
    const displayTags = filteredTags.slice(0, 100);

    // Track first available (not added) tag for highlighting
    let firstAvailableFound = false;

    dropdown.innerHTML = displayTags.map(tag => {
        const isAdded = addedTagIds.has(tag.Id);
        const tagName = tag.Name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        // Highlight first tag that is NOT already added
        let isHighlighted = false;
        if (!isAdded && !firstAvailableFound) {
            isHighlighted = true;
            firstAvailableFound = true;
        }

        return `
            <div class="bulk-tag-search-option ${isAdded ? 'disabled' : ''} ${isHighlighted ? 'highlighted' : ''}"
                 data-tag-id="${tag.Id}"
                 data-tag-name="${tagName}"
                 data-tag-color="${tag.Color || '#6b7280'}"
                 onclick="${isAdded ? '' : `addTagToBulkTagDeleteModal('${tag.Id}', '${tagName}', '${tag.Color || '#6b7280'}')`}">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isAdded ? '<span class="tag-added">Đã thêm</span>' : ''}
            </div>
        `;
    }).join('');

    // Show count if there are more tags
    if (filteredTags.length > 100) {
        dropdown.innerHTML += `
            <div style="padding: 10px 14px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
                Hiển thị 100/${filteredTags.length} tag. Nhập từ khóa để lọc.
            </div>
        `;
    }
}

// Show bulk tag delete modal dropdown (on focus)
function showBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    populateBulkTagDeleteModalDropdown();
    dropdown.classList.add('show');
}

// Refresh bulk tag delete modal dropdown (used by "Tải lại" button)
async function refreshBulkTagDeleteModalDropdown() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');

    // Show loading state
    dropdown.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #9ca3af;">
            <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
            Đang tải danh sách tag...
        </div>
    `;

    try {
        // Force reload tags from API
        await loadAvailableTags();
        populateBulkTagDeleteModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error refreshing tags:", error);
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                Lỗi tải danh sách tag
                <br><br>
                <button onclick="refreshBulkTagDeleteModalDropdown()" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Thử lại
                </button>
            </div>
        `;
    }
}

// Filter bulk tag delete modal options based on search input
function filterBulkTagDeleteModalOptions() {
    const dropdown = document.getElementById('bulkTagDeleteModalSearchDropdown');
    populateBulkTagDeleteModalDropdown();
    dropdown.classList.add('show');
}

// Handle keydown on search input
function handleBulkTagDeleteModalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();

        // Find highlighted tag (first available tag)
        const highlightedTag = document.querySelector('#bulkTagDeleteModal .bulk-tag-search-option.highlighted');

        if (highlightedTag) {
            // Has highlighted tag → select it
            const tagId = highlightedTag.getAttribute('data-tag-id');
            const tagName = highlightedTag.getAttribute('data-tag-name');
            const tagColor = highlightedTag.getAttribute('data-tag-color');
            addTagToBulkTagDeleteModal(tagId, tagName, tagColor);
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
        document.getElementById('bulkTagDeleteModalSearchInput').blur();
    }
}

// Add tag to bulk tag delete modal
function addTagToBulkTagDeleteModal(tagId, tagName, tagColor) {
    console.log("[BULK-TAG-DELETE] Adding tag:", tagName);

    // Check if already exists
    if (bulkTagDeleteModalData.some(t => t.tagId === tagId)) {
        return;
    }

    // Add to data
    bulkTagDeleteModalData.push({
        tagId: tagId,
        tagName: tagName,
        tagColor: tagColor,
        sttList: []
    });

    // Update UI
    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    populateBulkTagDeleteModalDropdown();

    // Clear search input
    document.getElementById('bulkTagDeleteModalSearchInput').value = '';
    document.getElementById('bulkTagDeleteModalSearchDropdown').classList.remove('show');
}

// Remove tag row from modal
function removeTagFromBulkTagDeleteModal(tagId) {
    bulkTagDeleteModalData = bulkTagDeleteModalData.filter(t => t.tagId !== tagId);
    selectedBulkTagDeleteModalRows.delete(tagId);

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteModalRowCount();
    populateBulkTagDeleteModalDropdown();
}

// Clear all tag rows
function clearAllBulkTagDeleteRows() {
    if (bulkTagDeleteModalData.length === 0) return;

    if (confirm('Bạn có chắc muốn xóa tất cả tag đã thêm?')) {
        bulkTagDeleteModalData = [];
        selectedBulkTagDeleteModalRows.clear();
        document.getElementById('bulkTagDeleteSelectAllCheckbox').checked = false;

        // Clear localStorage
        clearBulkTagDeleteLocalStorage();

        updateBulkTagDeleteModalTable();
        updateBulkTagDeleteModalRowCount();
        populateBulkTagDeleteModalDropdown();
    }
}

// Update row count display
function updateBulkTagDeleteModalRowCount() {
    const countEl = document.getElementById('bulkTagDeleteRowCount');
    countEl.textContent = `${bulkTagDeleteModalData.length} tag đã thêm`;
}

// Toggle select all
function toggleBulkTagDeleteSelectAll(checked) {
    if (checked) {
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });
    } else {
        selectedBulkTagDeleteModalRows.clear();
    }

    updateBulkTagDeleteModalTable();
}

// Toggle individual row selection
function toggleBulkTagDeleteRowSelection(tagId) {
    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData || tagData.sttList.length === 0) return;

    if (selectedBulkTagDeleteModalRows.has(tagId)) {
        selectedBulkTagDeleteModalRows.delete(tagId);
    } else {
        selectedBulkTagDeleteModalRows.add(tagId);
    }

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteSelectAllCheckbox();
}

// Update select all checkbox state
function updateBulkTagDeleteSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('bulkTagDeleteSelectAllCheckbox');
    const tagsWithSTT = bulkTagDeleteModalData.filter(t => t.sttList.length > 0);

    if (tagsWithSTT.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagDeleteModalRows.size === tagsWithSTT.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagDeleteModalRows.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// Add STT to a tag
function addSTTToBulkTagDeleteRow(tagId, inputElement) {
    const sttValue = inputElement.value.trim();
    if (!sttValue) return;

    const stt = parseInt(sttValue);
    if (isNaN(stt) || stt <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('STT phải là số nguyên dương', 2000);
        }
        return;
    }

    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    // Check if STT exists in current data - O(1) via OrderStore.getBySTT
    const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} không tồn tại trong danh sách hiện tại`, 2000);
        }
        return;
    }

    // Check if already added (using Array.includes)
    if (tagData.sttList.includes(stt)) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} đã được thêm`, 2000);
        }
        inputElement.value = '';
        return;
    }

    // Add STT (giữ nguyên thứ tự nhập)
    tagData.sttList.push(stt);
    inputElement.value = '';

    updateBulkTagDeleteModalTable();

    // Re-focus on the input after table re-render
    setTimeout(() => {
        const newInput = document.querySelector(`#bulkTagDeleteModal .bulk-tag-row[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
        if (newInput) {
            newInput.focus();
        }
    }, 10);
}

// Handle Enter key on STT input
function handleBulkTagDeleteSTTInputKeydown(event, tagId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSTTToBulkTagDeleteRow(tagId, event.target);
    }
}

// Remove STT from a tag
function removeSTTFromBulkTagDeleteRow(tagId, stt) {
    const tagData = bulkTagDeleteModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    tagData.sttList = tagData.sttList.filter(s => s !== stt);

    // If no more STTs, deselect the row
    if (tagData.sttList.length === 0) {
        selectedBulkTagDeleteModalRows.delete(tagId);
    }

    updateBulkTagDeleteModalTable();
    updateBulkTagDeleteSelectAllCheckbox();
}

// Update the bulk tag delete modal table
function updateBulkTagDeleteModalTable() {
    const tableBody = document.getElementById('bulkTagDeleteTableBody');

    if (bulkTagDeleteModalData.length === 0) {
        tableBody.innerHTML = `
            <div class="bulk-tag-empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag cần xóa.</p>
            </div>
        `;
        return;
    }

    tableBody.innerHTML = bulkTagDeleteModalData.map(tagData => {
        const isSelected = selectedBulkTagDeleteModalRows.has(tagData.tagId);
        const sttArray = tagData.sttList || []; // Giữ nguyên thứ tự nhập, không sort
        const sttCount = sttArray.length;
        const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;

        // Get customer names for STTs - O(1) via OrderStore.getBySTT
        const sttPillsHtml = sttArray.map(stt => {
            const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);
            const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
            return `
                <div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="removeSTTFromBulkTagDeleteRow('${tagData.tagId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Error message HTML
        const errorHtml = hasError ? `
            <div class="bulk-tag-row-error">
                ${tagData.errorMessage}
            </div>
        ` : '';

        return `
            <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                <div class="bulk-tag-row-tag">
                    <input type="checkbox"
                           ${isSelected ? 'checked' : ''}
                           ${sttCount === 0 ? 'disabled' : ''}
                           onchange="toggleBulkTagDeleteRowSelection('${tagData.tagId}')"
                           title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để xóa tag'}">
                    <div class="bulk-tag-row-tag-info">
                        <span class="tag-color-dot" style="background-color: ${tagData.tagColor}"></span>
                        <span class="tag-name">${tagData.tagName}</span>
                    </div>
                    ${errorHtml}
                </div>
                <div class="bulk-tag-row-stt">
                    <div class="bulk-tag-stt-pills">
                        ${sttPillsHtml || '<span style="color: #9ca3af; font-size: 13px;">Chưa có STT nào</span>'}
                    </div>
                    <div class="bulk-tag-stt-input-wrapper">
                        <input type="number"
                               class="bulk-tag-stt-input"
                               placeholder="Nhập STT và Enter"
                               onkeydown="handleBulkTagDeleteSTTInputKeydown(event, '${tagData.tagId}')">
                        <span class="bulk-tag-stt-counter">(${sttCount})</span>
                    </div>
                </div>
                <div class="bulk-tag-row-action">
                    <button class="bulk-tag-remove-row-btn" onclick="removeTagFromBulkTagDeleteModal('${tagData.tagId}')" title="Xóa tag này">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Execute bulk tag delete modal removal
/**
 * Execute bulk tag removal from modal
 * Flow:
 * 1. Check if order HAS the tag before removing
 * 2. If order doesn't have the tag → fail with message "đơn không có tag X"
 * 3. Track success/failed for each tag
 * 4. After removal, remove successful tags/STTs, keep failed ones
 * 5. Save to Firebase with new format (bulkTagDeleteHistory)
 * 6. Show result modal
 * 7. DON'T close modal automatically
 */
async function executeBulkTagDeleteModalRemoval() {
    console.log("[BULK-TAG-DELETE] Executing bulk tag removal");

    // Get selected tags with STTs (checked rows only)
    const selectedTags = bulkTagDeleteModalData.filter(t =>
        selectedBulkTagDeleteModalRows.has(t.tagId) && t.sttList.length > 0
    );

    // Validate: at least one tag selected with STTs
    if (selectedTags.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để xóa', 3000);
        } else {
            alert('Vui lòng chọn ít nhất một tag có STT để xóa');
        }
        return;
    }

    try {
        showLoading(true);

        // Results tracking
        const successResults = []; // Array of {tagName, tagColor, sttList: []}
        const failedResults = [];  // Array of {tagName, tagColor, sttList: [], reason}

        // Process each selected tag
        for (const selectedTag of selectedTags) {
            const tagInfo = {
                Id: parseInt(selectedTag.tagId, 10),
                Name: selectedTag.tagName,
                Color: selectedTag.tagColor
            };

            const sttArray = selectedTag.sttList || [];
            const successSTT = [];
            const failedSTT = [];
            let failReason = null;

            // Find orders matching STT
            const matchingOrders = displayedData.filter(order =>
                sttArray.includes(order.SessionIndex)
            );

            if (matchingOrders.length === 0) {
                console.warn(`[BULK-TAG-DELETE] No orders found for tag "${tagInfo.Name}"`);
                continue;
            }

            console.log(`[BULK-TAG-DELETE] Processing tag "${tagInfo.Name}" for ${matchingOrders.length} orders`);

            // Process each order
            for (const order of matchingOrders) {
                try {
                    // Parse current tags
                    const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                    const currentTags = rawTags.map(t => ({
                        Id: parseInt(t.Id, 10),
                        Name: t.Name,
                        Color: t.Color
                    }));

                    // Check if order HAS the tag
                    const hasTag = currentTags.some(t => t.Id === tagInfo.Id);
                    if (!hasTag) {
                        console.log(`[BULK-TAG-DELETE] Order ${order.Code} doesn't have tag "${tagInfo.Name}"`);
                        failedSTT.push(order.SessionIndex);
                        failReason = failReason || `Đơn không có tag "${tagInfo.Name}"`;
                        continue;
                    }

                    // Build updated tags array (REMOVE the tag)
                    const updatedTags = currentTags.filter(t => t.Id !== tagInfo.Id);

                    // Call API to assign (updated) tags
                    const authHeaders = await window.tokenManager.getAuthHeader();
                    const response = await fetch(
                        "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                        {
                            method: "POST",
                            headers: {
                                ...authHeaders,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                Tags: updatedTags,
                                OrderId: order.Id
                            }),
                        }
                    );

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP ${response.status}`);
                    }

                    // Update local data
                    const updatedData = { Tags: JSON.stringify(updatedTags) };
                    updateOrderInTable(order.Id, updatedData);

                    // Emit Firebase update
                    await emitTagUpdateToFirebase(order.Id, updatedTags);

                    successSTT.push(order.SessionIndex);
                    console.log(`[BULK-TAG-DELETE] Successfully removed tag "${tagInfo.Name}" from order ${order.Code}`);

                } catch (error) {
                    console.error(`[BULK-TAG-DELETE] Error removing tag from order ${order.Code}:`, error);
                    failedSTT.push(order.SessionIndex);
                    failReason = failReason || `Lỗi API: ${error.message}`;
                }
            }

            // Collect results for this tag
            if (successSTT.length > 0) {
                successResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: successSTT.sort((a, b) => a - b)
                });
            }

            if (failedSTT.length > 0) {
                failedResults.push({
                    tagName: tagInfo.Name,
                    tagColor: tagInfo.Color,
                    sttList: failedSTT.sort((a, b) => a - b),
                    reason: failReason || 'Lỗi không xác định'
                });
            }

            // Update modal data: remove successful STTs, keep failed ones
            const tagDataInModal = bulkTagDeleteModalData.find(t => t.tagId === selectedTag.tagId);
            if (tagDataInModal) {
                // Remove successful STTs
                tagDataInModal.sttList = tagDataInModal.sttList.filter(stt => !successSTT.includes(stt));

                // Set error message if there are failures
                if (failedSTT.length > 0) {
                    tagDataInModal.errorMessage = `⚠️ STT ${failedSTT.join(', ')} - ${failReason}`;
                } else {
                    tagDataInModal.errorMessage = null;
                }
            }

            console.log(`[BULK-TAG-DELETE] Tag "${tagInfo.Name}" result: ${successSTT.length} success, ${failedSTT.length} failed`);
        }

        // Clear cache
        window.cacheManager.clear("orders");

        // Remove tags with no remaining STTs
        bulkTagDeleteModalData = bulkTagDeleteModalData.filter(tag => tag.sttList.length > 0);

        // Update selected rows
        selectedBulkTagDeleteModalRows.clear();
        bulkTagDeleteModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagDeleteModalRows.add(tag.tagId);
            }
        });

        // Save/clear localStorage based on remaining data
        if (bulkTagDeleteModalData.length > 0) {
            saveBulkTagDeleteToLocalStorage();
        } else {
            clearBulkTagDeleteLocalStorage();
        }

        // Save history to Firebase (separate path: bulkTagDeleteHistory)
        const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length, 0);
        const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

        if (totalSuccess > 0 || totalFailed > 0) {
            await saveBulkTagDeleteHistory({
                success: successResults,
                failed: failedResults
            });
        }

        showLoading(false);

        // Update modal UI
        updateBulkTagDeleteModalTable();
        updateBulkTagDeleteModalRowCount();
        updateBulkTagDeleteSelectAllCheckbox();

        // Show result modal
        showBulkTagDeleteResultModal(successResults, failedResults);

        // DON'T close modal - user must click "Hủy" to close

    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error in bulk tag removal:", error);
        showLoading(false);

        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 5000);
        } else {
            alert(`Lỗi: ${error.message}`);
        }
    }
}

// Save bulk tag delete history to Firebase
async function saveBulkTagDeleteHistory(results) {
    try {
        const timestamp = Date.now();
        const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');

        // Get identifier name (tên định danh) - fallback to DisplayName if not available
        let username = 'Unknown';
        try {
            // Ưu tiên dùng identifier name (tên định danh)
            if (currentUserIdentifier) {
                username = currentUserIdentifier;
            } else {
                // Fallback to DisplayName from tokenManager
                const tokenData = window.tokenManager?.getTokenData?.();
                username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
            }
        } catch (e) {
            console.warn("[BULK-TAG-DELETE] Could not get username:", e);
        }

        const historyEntry = {
            timestamp: timestamp,
            dateFormatted: dateFormatted,
            username: username,
            results: results, // {success: [...], failed: [...]}
            summary: {
                totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
            }
        };

        // Save to Firebase (separate path for delete history)
        const historyRef = database.ref(`bulkTagDeleteHistory/${timestamp}`);
        await historyRef.set(historyEntry);

        console.log("[BULK-TAG-DELETE] History saved to Firebase:", historyEntry);
    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error saving history:", error);
    }
}

// Show bulk tag delete result modal
function showBulkTagDeleteResultModal(successResults, failedResults) {
    const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length, 0);
    const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

    // Build success HTML
    let successHtml = '';
    if (successResults.length > 0) {
        successHtml = `
            <div class="bulk-tag-result-section success">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-check-circle"></i>
                    <span>Xóa thành công (${totalSuccess} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${successResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build failed HTML
    let failedHtml = '';
    if (failedResults.length > 0) {
        failedHtml = `
            <div class="bulk-tag-result-section failed">
                <div class="bulk-tag-result-section-header">
                    <i class="fas fa-times-circle"></i>
                    <span>Thất bại (${totalFailed} đơn)</span>
                </div>
                <div class="bulk-tag-result-section-body">
                    ${failedResults.map(r => `
                        <div class="bulk-tag-result-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${r.sttList.join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Create and show modal
    const modalHtml = `
        <div class="bulk-tag-result-modal bulk-tag-delete-result" id="bulkTagDeleteResultModal">
            <div class="bulk-tag-result-modal-content">
                <div class="bulk-tag-result-modal-header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                    <h3><i class="fas fa-clipboard-list"></i> Kết Quả Xóa Tag</h3>
                    <button class="bulk-tag-result-modal-close" onclick="closeBulkTagDeleteResultModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bulk-tag-result-modal-body">
                    ${successHtml}
                    ${failedHtml}
                    ${totalSuccess === 0 && totalFailed === 0 ? '<p style="text-align: center; color: #9ca3af;">Không có kết quả nào</p>' : ''}
                </div>
                <div class="bulk-tag-result-modal-footer">
                    <button class="bulk-tag-btn-confirm" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);" onclick="closeBulkTagDeleteResultModal()">
                        <i class="fas fa-check"></i> Đóng
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('bulkTagDeleteResultModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    setTimeout(() => {
        document.getElementById('bulkTagDeleteResultModal').classList.add('show');
    }, 10);
}

// Close bulk tag delete result modal
function closeBulkTagDeleteResultModal() {
    const modal = document.getElementById('bulkTagDeleteResultModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

// Show bulk tag delete history modal
async function showBulkTagDeleteHistoryModal() {
    console.log("[BULK-TAG-DELETE] Opening history modal");

    const historyBody = document.getElementById('bulkTagDeleteHistoryModalBody');
    historyBody.innerHTML = `
        <div class="bulk-tag-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử...</p>
        </div>
    `;

    document.getElementById('bulkTagDeleteHistoryModal').classList.add('show');

    try {
        // Load history from Firebase (separate path)
        const historyRef = database.ref('bulkTagDeleteHistory');
        const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
        const historyData = snapshot.val();

        if (!historyData) {
            historyBody.innerHTML = `
                <div class="bulk-tag-history-empty">
                    <i class="fas fa-history"></i>
                    <p>Chưa có lịch sử xóa tag nào</p>
                </div>
            `;
            return;
        }

        // Convert to array and sort by timestamp descending
        const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

        historyBody.innerHTML = `
            <div class="bulk-tag-history-list">
                ${historyArray.map((entry, index) => renderBulkTagDeleteHistoryItem(entry, index)).join('')}
            </div>
        `;

    } catch (error) {
        console.error("[BULK-TAG-DELETE] Error loading history:", error);
        historyBody.innerHTML = `
            <div class="bulk-tag-history-empty">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}

// Render a single delete history item
function renderBulkTagDeleteHistoryItem(entry, index) {
    const { dateFormatted, username, results, summary } = entry;

    // Build success section
    let successHtml = '';
    if (results.success && results.success.length > 0) {
        successHtml = `
            <div class="bulk-tag-history-success">
                <div class="bulk-tag-history-success-title">
                    <i class="fas fa-check-circle"></i>
                    Xóa thành công (${summary.totalSuccess} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.success.map(r => `
                        <div class="bulk-tag-history-tag-item">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${(r.sttList || []).join(', ')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build failed section
    let failedHtml = '';
    if (results.failed && results.failed.length > 0) {
        failedHtml = `
            <div class="bulk-tag-history-failed">
                <div class="bulk-tag-history-failed-title">
                    <i class="fas fa-times-circle"></i>
                    Thất bại (${summary.totalFailed} đơn):
                </div>
                <div class="bulk-tag-history-tag-list">
                    ${results.failed.map(r => `
                        <div class="bulk-tag-history-tag-item failed">
                            <span class="tag-color-dot" style="background-color: ${r.tagColor || '#6b7280'}"></span>
                            <span class="tag-name">${r.tagName}:</span>
                            <span class="stt-list">STT ${(r.sttList || []).join(', ')}</span>
                            <div class="fail-reason">→ ${r.reason}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="bulk-tag-history-item" id="bulkTagDeleteHistoryItem${index}">
            <div class="bulk-tag-history-header" onclick="toggleBulkTagDeleteHistoryItem(${index})">
                <div class="history-info">
                    <div class="history-time">
                        <i class="fas fa-clock"></i>
                        ${dateFormatted}
                    </div>
                    <div class="history-user">
                        <i class="fas fa-user"></i>
                        ${username || 'Unknown'}
                    </div>
                </div>
                <div class="history-summary">
                    <span class="success-count"><i class="fas fa-check"></i> ${summary.totalSuccess}</span>
                    <span class="failed-count"><i class="fas fa-times"></i> ${summary.totalFailed}</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="bulk-tag-history-body">
                ${successHtml}
                ${failedHtml}
            </div>
        </div>
    `;
}

// Toggle delete history item expand/collapse
function toggleBulkTagDeleteHistoryItem(index) {
    const item = document.getElementById(`bulkTagDeleteHistoryItem${index}`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

// Close bulk tag delete history modal
function closeBulkTagDeleteHistoryModal() {
    document.getElementById('bulkTagDeleteHistoryModal').classList.remove('show');
}

// =====================================================
// BULK REMOVE TAG FOR SELECTED ORDERS
// Xóa 1 tag từ tất cả các đơn đang được chọn (via checkbox)
// =====================================================

/**
 * Show modal to select tag to remove from selected orders
 */
function showBulkRemoveTagForSelectedModal() {
    // Check if any orders are selected
    if (!window.selectedOrderIds || window.selectedOrderIds.size === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng', 3000);
        } else {
            alert('Vui lòng chọn ít nhất 1 đơn hàng');
        }
        return;
    }

    // Update selected count
    document.getElementById('bulkRemoveTagSelectedCount').textContent = window.selectedOrderIds.size;

    // Populate tag dropdown
    populateBulkRemoveTagDropdown();

    // Show modal
    document.getElementById('bulkRemoveTagForSelectedModal').style.display = 'flex';
}

/**
 * Close bulk remove tag modal
 */
function closeBulkRemoveTagForSelectedModal() {
    document.getElementById('bulkRemoveTagForSelectedModal').style.display = 'none';
    // Clear selected tags
    bulkRemoveSelectedTagIds.clear();
}

// Set to store selected tag IDs for bulk remove
let bulkRemoveSelectedTagIds = new Set();

/**
 * Populate the tag dropdown with available tags (searchable list with checkboxes)
 */
function populateBulkRemoveTagDropdown() {
    const container = document.getElementById('bulkRemoveTagOptions');
    const searchInput = document.getElementById('bulkRemoveTagSearchInput');

    // Clear search and selection
    if (searchInput) searchInput.value = '';
    bulkRemoveSelectedTagIds.clear();
    document.getElementById('bulkRemoveTagSelect').value = '';

    // Get available tags from window.availableTags (loaded by tab1-tags.js)
    const tags = window.availableTags || [];

    if (tags.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">Không có tag nào</div>';
        return;
    }

    container.innerHTML = tags.map(tag => {
        const color = tag.Color || '#6b7280';
        return `
            <div class="bulk-remove-tag-option" data-tag-id="${tag.Id}" data-tag-name="${tag.Name.toLowerCase()}"
                onclick="toggleBulkRemoveTagOption('${tag.Id}')"
                style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.15s;"
                onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <input type="checkbox" id="bulkRemoveTag_${tag.Id}" style="cursor: pointer; width: 16px; height: 16px;">
                <span style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
                <span style="font-size: 14px; color: #374151;">${tag.Name}</span>
            </div>
        `;
    }).join('');
}

/**
 * Toggle tag selection in bulk remove modal
 */
function toggleBulkRemoveTagOption(tagId) {
    const checkbox = document.getElementById(`bulkRemoveTag_${tagId}`);
    if (!checkbox) return;

    // Toggle checkbox
    checkbox.checked = !checkbox.checked;

    if (checkbox.checked) {
        bulkRemoveSelectedTagIds.add(String(tagId));
    } else {
        bulkRemoveSelectedTagIds.delete(String(tagId));
    }

    // Update hidden input with first selected tag (for single select behavior)
    // Or all selected tags separated by comma (for multi-select)
    document.getElementById('bulkRemoveTagSelect').value = Array.from(bulkRemoveSelectedTagIds).join(',');
}

/**
 * Filter tag options based on search input
 */
function filterBulkRemoveTagOptions() {
    const searchInput = document.getElementById('bulkRemoveTagSearchInput');
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const options = document.querySelectorAll('.bulk-remove-tag-option');

    options.forEach(option => {
        const tagName = option.getAttribute('data-tag-name') || '';
        if (tagName.includes(searchTerm)) {
            option.style.display = 'flex';
        } else {
            option.style.display = 'none';
        }
    });
}

/**
 * Select all visible tags in bulk remove modal
 */
function selectAllBulkRemoveTags() {
    const options = document.querySelectorAll('.bulk-remove-tag-option');
    options.forEach(option => {
        if (option.style.display !== 'none') {
            const tagId = option.getAttribute('data-tag-id');
            const checkbox = document.getElementById(`bulkRemoveTag_${tagId}`);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                bulkRemoveSelectedTagIds.add(String(tagId));
            }
        }
    });
    document.getElementById('bulkRemoveTagSelect').value = Array.from(bulkRemoveSelectedTagIds).join(',');
}

/**
 * Clear all selected tags in bulk remove modal
 */
function clearBulkRemoveTags() {
    const options = document.querySelectorAll('.bulk-remove-tag-option');
    options.forEach(option => {
        const tagId = option.getAttribute('data-tag-id');
        const checkbox = document.getElementById(`bulkRemoveTag_${tagId}`);
        if (checkbox) {
            checkbox.checked = false;
        }
    });
    bulkRemoveSelectedTagIds.clear();
    document.getElementById('bulkRemoveTagSelect').value = '';
}

/**
 * Execute bulk remove tag for selected orders
 */
async function executeBulkRemoveTagForSelected() {
    // Get selected tag IDs from the Set
    const selectedTagIds = Array.from(bulkRemoveSelectedTagIds);

    if (selectedTagIds.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất 1 tag cần xóa', 2000);
        }
        return;
    }

    // Get tag names for confirmation message
    const selectedTagNames = selectedTagIds.map(tagId => {
        const tag = (window.availableTags || []).find(t => String(t.Id) === String(tagId));
        return tag ? tag.Name : 'Unknown';
    });

    // Get selected order IDs
    const orderIds = Array.from(window.selectedOrderIds || []);

    if (orderIds.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có đơn hàng nào được chọn', 2000);
        }
        return;
    }

    // Confirm action
    const tagNamesDisplay = selectedTagNames.length <= 3
        ? selectedTagNames.join(', ')
        : `${selectedTagNames.slice(0, 3).join(', ')} và ${selectedTagNames.length - 3} tag khác`;
    const confirmMessage = `Bạn có chắc muốn xóa ${selectedTagNames.length} tag (${tagNamesDisplay}) khỏi ${orderIds.length} đơn hàng?`;
    if (!confirm(confirmMessage)) {
        return;
    }

    // Close modal and show loading
    closeBulkRemoveTagForSelectedModal();
    if (typeof showLoading === 'function') {
        showLoading(true);
    }

    let successCount = 0;
    let failedCount = 0;

    try {
        const headers = await window.tokenManager.getAuthHeader();

        for (const orderId of orderIds) {
            try {
                // Get order data
                const order = window.OrderStore?.get(orderId) ||
                              window.displayedData?.find(o => String(o.Id) === String(orderId));

                if (!order) {
                    console.warn(`[BULK-REMOVE-TAG] Order not found: ${orderId}`);
                    failedCount++;
                    continue;
                }

                // Parse current tags
                let orderTags = [];
                try {
                    if (order.Tags) {
                        orderTags = JSON.parse(order.Tags);
                        if (!Array.isArray(orderTags)) orderTags = [];
                    }
                } catch (e) {
                    orderTags = [];
                }

                // Check if order has any of the selected tags
                const hasAnySelectedTag = orderTags.some(t => selectedTagIds.includes(String(t.Id)));
                if (!hasAnySelectedTag) {
                    // None of selected tags present, skip but count as success
                    successCount++;
                    continue;
                }

                // Filter out all selected tags
                const newOrderTags = orderTags.filter(t => !selectedTagIds.includes(String(t.Id)));

                // Call API to update tags
                const response = await API_CONFIG.smartFetch(
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

                if (response.ok) {
                    // Update local data
                    const newTagsJson = JSON.stringify(newOrderTags);
                    if (typeof updateOrderInTable === 'function') {
                        updateOrderInTable(orderId, { Tags: newTagsJson });
                    }

                    // Update OrderStore
                    if (window.OrderStore && window.OrderStore.update) {
                        window.OrderStore.update(orderId, { Tags: newTagsJson });
                    }

                    // Emit to Firebase
                    if (typeof emitTagUpdateToFirebase === 'function') {
                        await emitTagUpdateToFirebase(orderId, newOrderTags);
                    }

                    successCount++;
                } else {
                    console.error(`[BULK-REMOVE-TAG] Failed for order ${orderId}:`, response.status);
                    failedCount++;
                }
            } catch (orderError) {
                console.error(`[BULK-REMOVE-TAG] Error for order ${orderId}:`, orderError);
                failedCount++;
            }
        }

        // Show result notification
        if (window.notificationManager) {
            if (failedCount === 0) {
                window.notificationManager.success(`Đã xóa ${selectedTagNames.length} tag khỏi ${successCount} đơn hàng`, 4000);
            } else if (successCount > 0) {
                window.notificationManager.warning(`Xóa tag: ${successCount} thành công, ${failedCount} thất bại`, 4000);
            } else {
                window.notificationManager.error(`Không thể xóa tag khỏi ${failedCount} đơn hàng`, 4000);
            }
        }

        console.log(`[BULK-REMOVE-TAG] Completed: ${successCount} success, ${failedCount} failed`);

    } catch (error) {
        console.error('[BULK-REMOVE-TAG] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Có lỗi xảy ra khi xóa tag', 3000);
        }
    } finally {
        if (typeof showLoading === 'function') {
            showLoading(false);
        }
    }
}

// Expose functions to window
window.showBulkRemoveTagForSelectedModal = showBulkRemoveTagForSelectedModal;
window.closeBulkRemoveTagForSelectedModal = closeBulkRemoveTagForSelectedModal;
window.executeBulkRemoveTagForSelected = executeBulkRemoveTagForSelected;
window.filterBulkRemoveTagOptions = filterBulkRemoveTagOptions;
window.toggleBulkRemoveTagOption = toggleBulkRemoveTagOption;
window.selectAllBulkRemoveTags = selectAllBulkRemoveTags;
window.clearBulkRemoveTags = clearBulkRemoveTags;

