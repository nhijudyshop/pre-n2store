// =====================================================
// COLUMN VISIBILITY MANAGER
// =====================================================

// LocalStorage key for column visibility settings
const COLUMN_VISIBILITY_KEY = 'orderTableColumnVisibility';
const EXCLUDED_TAGS_KEY = 'orderTableExcludedTags';

// Default column visibility settings
const DEFAULT_COLUMN_VISIBILITY = {
    'actions': true,
    'stt': true,
    'employee': false,
    'tag': true,
    'order-code': false,
    'customer': true,
    'messages': true,
    'messagesContent': true,  // NEW: Hiển thị nội dung tin nhắn (true) hoặc chỉ "-" (false)
    'comments': true,
    'phone': true,
    'qr': true,
    'debt': true,
    'address': false,
    'notes': false,
    'total': true,
    'quantity': true,
    'created-date': false,
    'invoice-status': true,   // Phiếu bán hàng (StateCode + Messenger button)
    'status': true
};

// =====================================================
// COLUMN VISIBILITY FUNCTIONS
// =====================================================

/**
 * Load column visibility settings from localStorage
 * Merges with DEFAULT to ensure new columns are visible by default
 */
function loadColumnVisibility() {
    try {
        const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge với DEFAULT để đảm bảo các cột mới (như debt, qr) được hiển thị mặc định
            // Nếu user đã explicitly set debt: false, giá trị đó sẽ được giữ lại
            return { ...DEFAULT_COLUMN_VISIBILITY, ...parsed };
        }
    } catch (error) {
        console.error('[COLUMN] Error loading column visibility:', error);
    }
    return { ...DEFAULT_COLUMN_VISIBILITY };
}

/**
 * Save column visibility settings to localStorage
 */
function saveColumnVisibilityToStorage(settings) {
    try {
        localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(settings));
        console.log('[COLUMN] Column visibility saved:', settings);
    } catch (error) {
        console.error('[COLUMN] Error saving column visibility:', error);
    }
}

/**
 * Apply column visibility to table
 */
function applyColumnVisibility(settings) {
    console.log('[COLUMN] Applying column visibility:', settings);

    // Apply to table headers
    document.querySelectorAll('th[data-column]').forEach(th => {
        const column = th.getAttribute('data-column');
        if (settings[column] === false) {
            th.classList.add('hidden');
        } else {
            th.classList.remove('hidden');
        }
    });

    // Apply to table cells
    document.querySelectorAll('td[data-column]').forEach(td => {
        const column = td.getAttribute('data-column');
        if (settings[column] === false) {
            td.classList.add('hidden');
        } else {
            td.classList.remove('hidden');
        }
    });
}

/**
 * Update checkbox states in modal based on current settings
 */
function updateColumnCheckboxes(settings) {
    document.querySelectorAll('.column-setting-item input[type="checkbox"]').forEach(checkbox => {
        const column = checkbox.getAttribute('data-column');
        checkbox.checked = settings[column] !== false;
    });
}

/**
 * Open column settings modal
 */
function openColumnSettingsModal() {
    const modal = document.getElementById('columnSettingsModal');
    const settings = loadColumnVisibility();

    // Update checkboxes based on current settings
    updateColumnCheckboxes(settings);

    // Initialize temp state from localStorage
    tempSelectedExcludedTags = loadExcludedTags();

    // Populate excluded tags list
    populateExcludedTagsList();

    // Clear search input
    const searchInput = document.getElementById('excludedTagsSearchInput');
    if (searchInput) searchInput.value = '';

    // Show modal
    modal.classList.add('show');
}

/**
 * Close column settings modal
 */
function closeColumnSettingsModal() {
    const modal = document.getElementById('columnSettingsModal');
    modal.classList.remove('show');
}

/**
 * Save column settings from modal
 */
function saveColumnSettings() {
    const settings = {};

    // Get checkbox states
    document.querySelectorAll('.column-setting-item input[type="checkbox"]').forEach(checkbox => {
        const column = checkbox.getAttribute('data-column');
        settings[column] = checkbox.checked;
    });

    // Save to localStorage
    saveColumnVisibilityToStorage(settings);

    // Apply to table
    applyColumnVisibility(settings);

    // Save excluded tags
    const excludedTags = getSelectedExcludedTags();
    saveExcludedTagsToStorage(excludedTags);

    // Show success indicator
    showSaveIndicator('Đã lưu cài đặt cột');

    // Close modal
    closeColumnSettingsModal();

    // Update main page display
    updateExcludedTagsMainDisplay();

    // Re-apply search filter to hide/show rows based on excluded tags
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
}

/**
 * Reset column settings to default
 */
function resetColumnSettings() {
    // Update checkboxes to default
    updateColumnCheckboxes(DEFAULT_COLUMN_VISIBILITY);

    // Clear excluded tags
    clearExcludedTags();

    // Show notification
    showSaveIndicator('Đã đặt lại về mặc định');
}

/**
 * Initialize column visibility on page load
 */
function initializeColumnVisibility() {
    console.log('[COLUMN] Initializing column visibility...');

    // Load settings from localStorage
    const settings = loadColumnVisibility();

    // Apply settings to table
    applyColumnVisibility(settings);

    console.log('[COLUMN] Column visibility initialized');
}

/**
 * Add data-column attributes to table cells when rendering rows
 * This function should be called after rendering each row
 */
function addColumnAttributesToRow(row) {
    const cells = row.querySelectorAll('td');
    const columns = ['', 'stt', 'tag', 'order-code', 'customer', 'messages', 'comments', 'phone', 'address', 'notes', 'total', 'quantity', 'created-date', 'status', 'actions'];

    cells.forEach((cell, index) => {
        if (columns[index] && columns[index] !== '') {
            cell.setAttribute('data-column', columns[index]);
        }
    });
}

/**
 * Show save indicator
 */
function showSaveIndicator(message) {
    const indicator = document.getElementById('saveIndicator');
    const text = document.getElementById('saveIndicatorText');

    if (indicator && text) {
        text.textContent = message;
        indicator.classList.add('show', 'success');

        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

// Close modal when clicking outside
document.addEventListener('click', function (e) {
    const modal = document.getElementById('columnSettingsModal');
    if (e.target === modal) {
        closeColumnSettingsModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('columnSettingsModal');
        if (modal && modal.classList.contains('show')) {
            closeColumnSettingsModal();
        }
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('[COLUMN] Column visibility manager loaded');
    // Initialize will be called after table is rendered
    // Show excluded tags display immediately (will update when tags are loaded)
    updateExcludedTagsMainDisplay();

    // If tags not loaded yet, retry when they become available
    const excludedTags = loadExcludedTags();
    if (excludedTags.length > 0 && (!window.availableTags || window.availableTags.length === 0)) {
        const retryInterval = setInterval(() => {
            if (window.availableTags && window.availableTags.length > 0) {
                console.log('[COLUMN] Tags loaded, updating excluded tags display');
                updateExcludedTagsMainDisplay();
                clearInterval(retryInterval);
            }
        }, 500);
        // Stop retrying after 30 seconds
        setTimeout(() => clearInterval(retryInterval), 30000);
    }
});

// =====================================================
// EXCLUDED TAGS FUNCTIONS
// (Now delegates to the main exclude tag filter functions in tab1-pancake-settings.js)
// =====================================================

// Temporary state for selected excluded tags while modal is open
let tempSelectedExcludedTags = [];

/**
 * Load excluded tags from localStorage
 * Now delegates to the global function if available
 */
function loadExcludedTags() {
    if (window.getExcludedTagFilters) {
        return window.getExcludedTagFilters();
    }
    try {
        const saved = localStorage.getItem(EXCLUDED_TAGS_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.error('[COLUMN] Error loading excluded tags:', error);
    }
    return [];
}

/**
 * Save excluded tags to localStorage
 * Now delegates to the global function if available
 */
function saveExcludedTagsToStorage(tagIds) {
    if (window.saveExcludedTagFilters) {
        window.saveExcludedTagFilters(tagIds);
        return;
    }
    try {
        localStorage.setItem(EXCLUDED_TAGS_KEY, JSON.stringify(tagIds));
        console.log('[COLUMN] Excluded tags saved:', tagIds);
    } catch (error) {
        console.error('[COLUMN] Error saving excluded tags:', error);
    }
}

/**
 * Populate excluded tags list in modal
 */
function populateExcludedTagsList(searchTerm = '') {
    const container = document.getElementById('excludedTagsList');
    if (!container) return;

    const tags = window.availableTags || [];
    const search = searchTerm.toLowerCase().trim();

    // Filter tags by search term
    const filteredTags = tags.filter(tag => {
        if (!search) return true;
        return (tag.Name || '').toLowerCase().includes(search);
    });

    if (filteredTags.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #9ca3af; padding: 12px;">
                ${tags.length === 0 ? '<i class="fas fa-spinner fa-spin"></i> Đang tải tags...' : 'Không tìm thấy tag nào'}
            </div>
        `;
        // Still update count to show selected tags even when search has no results
        updateExcludedTagCount();
        return;
    }

    container.innerHTML = filteredTags.map(tag => {
        const isExcluded = tempSelectedExcludedTags.includes(String(tag.Id));
        const tagColor = tag.Color || '#6b7280';
        return `
            <label class="excluded-tag-item" style="display: flex; align-items: center; padding: 8px 10px; cursor: pointer; border-radius: 6px; margin-bottom: 4px; transition: background 0.15s; ${isExcluded ? 'background: #fef2f2;' : ''}"
                onmouseover="this.style.background='${isExcluded ? '#fee2e2' : '#f9fafb'}'"
                onmouseout="this.style.background='${isExcluded ? '#fef2f2' : 'transparent'}'">
                <input type="checkbox" data-tag-id="${tag.Id}" ${isExcluded ? 'checked' : ''}
                    onchange="toggleExcludedTag('${tag.Id}')"
                    style="margin-right: 10px; cursor: pointer;">
                <span style="display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; background: ${tagColor}20; color: ${tagColor}; border: 1px solid ${tagColor}40;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${tagColor}; margin-right: 6px;"></span>
                    ${tag.Name || 'Không tên'}
                </span>
            </label>
        `;
    }).join('');

    updateExcludedTagCount();
}

/**
 * Toggle a tag in/out of excluded list
 */
function toggleExcludedTag(tagId) {
    const tagIdStr = String(tagId);
    const index = tempSelectedExcludedTags.indexOf(tagIdStr);
    if (index > -1) {
        tempSelectedExcludedTags.splice(index, 1);
    } else {
        tempSelectedExcludedTags.push(tagIdStr);
    }
    updateExcludedTagCount();
}

/**
 * Filter excluded tags options based on search input
 */
function filterExcludedTagOptions() {
    const searchInput = document.getElementById('excludedTagsSearchInput');
    const searchTerm = searchInput ? searchInput.value : '';
    populateExcludedTagsList(searchTerm);
}

/**
 * Update excluded tag count display and show tag names
 */
function updateExcludedTagCount() {
    const countEl = document.getElementById('excludedTagsCountNumber');
    const namesEl = document.getElementById('excludedTagsNames');

    if (countEl) {
        countEl.textContent = tempSelectedExcludedTags.length;
    }

    // Show selected tag names
    if (namesEl) {
        const tags = window.availableTags || [];

        if (tempSelectedExcludedTags.length === 0) {
            namesEl.innerHTML = '';
        } else {
            namesEl.innerHTML = tempSelectedExcludedTags.map(tagId => {
                const tag = tags.find(t => String(t.Id) === String(tagId));
                if (!tag) return '';
                const tagColor = tag.Color || '#6b7280';
                return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${tagColor}20; color: ${tagColor}; border: 1px solid ${tagColor}40;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tagColor}; margin-right: 4px;"></span>
                    ${tag.Name || 'Không tên'}
                </span>`;
            }).filter(Boolean).join('');
        }
    }
}

/**
 * Clear all excluded tags selection
 */
function clearExcludedTags() {
    tempSelectedExcludedTags = [];
    // Uncheck visible checkboxes
    const checkboxes = document.querySelectorAll('#excludedTagsList input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    // Clear tag names display
    const namesEl = document.getElementById('excludedTagsNames');
    if (namesEl) namesEl.innerHTML = '';
    updateExcludedTagCount();
}

/**
 * Get currently selected excluded tag IDs from modal
 */
function getSelectedExcludedTags() {
    return [...tempSelectedExcludedTags];
}

/**
 * Update the excluded tags display on main page (outside modal)
 */
function updateExcludedTagsMainDisplay() {
    const container = document.getElementById('excludedTagsDisplay');
    const listEl = document.getElementById('excludedTagsDisplayList');
    if (!container || !listEl) return;

    const excludedTags = loadExcludedTags();
    const tags = window.availableTags || [];

    if (excludedTags.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // If tags not loaded yet, show loading state
    if (tags.length === 0) {
        listEl.innerHTML = `<span style="font-size: 11px; color: #9ca3af;"><i class="fas fa-spinner fa-spin"></i> ${excludedTags.length} tag...</span>`;
        return;
    }

    listEl.innerHTML = excludedTags.map(tagId => {
        const tag = tags.find(t => String(t.Id) === String(tagId));
        // Show tag even if not found in availableTags (fallback)
        const tagColor = tag?.Color || '#6b7280';
        const tagName = tag?.Name || `Tag #${tagId}`;
        return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${tagColor}20; color: ${tagColor}; border: 1px solid ${tagColor}40;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tagColor}; margin-right: 4px;"></span>
            ${tagName}
            <button onclick="removeExcludedTagFromMain('${tagId}')" style="margin-left: 6px; background: none; border: none; cursor: pointer; padding: 0; color: ${tagColor}; font-size: 12px; line-height: 1; opacity: 0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Bỏ ẩn tag này">×</button>
        </span>`;
    }).join('');
}

/**
 * Remove a tag from excluded list directly from main page
 */
function removeExcludedTagFromMain(tagId) {
    const excludedTags = loadExcludedTags();
    const index = excludedTags.indexOf(String(tagId));
    if (index > -1) {
        excludedTags.splice(index, 1);
        saveExcludedTagsToStorage(excludedTags);
        updateExcludedTagsMainDisplay();
        // Re-apply filter
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
    }
}

// Export functions for use in other scripts
window.columnVisibility = {
    initialize: initializeColumnVisibility,
    apply: applyColumnVisibility,
    load: loadColumnVisibility,
    save: saveColumnVisibilityToStorage,
    addAttributesToRow: addColumnAttributesToRow,
    loadExcludedTags: loadExcludedTags,
    saveExcludedTags: saveExcludedTagsToStorage,
    populateExcludedTagsList: populateExcludedTagsList,
    updateMainDisplay: updateExcludedTagsMainDisplay
};

// Make functions globally available
window.filterExcludedTagOptions = filterExcludedTagOptions;
window.clearExcludedTags = clearExcludedTags;
window.updateExcludedTagCount = updateExcludedTagCount;
window.toggleExcludedTag = toggleExcludedTag;
window.updateExcludedTagsMainDisplay = updateExcludedTagsMainDisplay;
window.removeExcludedTagFromMain = removeExcludedTagFromMain;
