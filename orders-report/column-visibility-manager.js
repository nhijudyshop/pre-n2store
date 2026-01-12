// =====================================================
// COLUMN VISIBILITY MANAGER
// =====================================================

// LocalStorage key for column visibility settings
const COLUMN_VISIBILITY_KEY = 'orderTableColumnVisibility';

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

    // Show success indicator
    showSaveIndicator('Đã lưu cài đặt cột');

    // Close modal
    closeColumnSettingsModal();
}

/**
 * Reset column settings to default
 */
function resetColumnSettings() {
    // Update checkboxes to default
    updateColumnCheckboxes(DEFAULT_COLUMN_VISIBILITY);

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
});

// Export functions for use in other scripts
window.columnVisibility = {
    initialize: initializeColumnVisibility,
    apply: applyColumnVisibility,
    load: loadColumnVisibility,
    save: saveColumnVisibilityToStorage,
    addAttributesToRow: addColumnAttributesToRow
};
