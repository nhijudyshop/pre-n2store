/**
 * Tab Social Orders - Column Visibility Manager
 * Manage which columns are visible in the table
 */

// ===== CONSTANTS =====
const SOCIAL_COLUMN_VISIBILITY_KEY = 'socialOrderTableColumnVisibility';

// Default column visibility settings for Social Orders
const DEFAULT_SOCIAL_COLUMN_VISIBILITY = {
    actions: true,
    stt: true,
    tag: true,
    customer: true,
    phone: true,
    chat: true,
    products: true,
    post: true,
    address: false, // Hidden by default
    note: true,
    total: true,
    'created-date': true,
    'invoice-status': true,
    status: true,
};

// ===== LOAD/SAVE FUNCTIONS =====

/**
 * Load column visibility settings from localStorage
 */
function loadColumnVisibility() {
    try {
        const saved = localStorage.getItem(SOCIAL_COLUMN_VISIBILITY_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with DEFAULT to ensure new columns are visible by default
            return { ...DEFAULT_SOCIAL_COLUMN_VISIBILITY, ...parsed };
        }
    } catch (error) {
        console.error('[COLUMN] Error loading column visibility:', error);
    }
    return { ...DEFAULT_SOCIAL_COLUMN_VISIBILITY };
}

/**
 * Save column visibility settings to localStorage
 */
function saveColumnVisibilityToStorage(settings) {
    try {
        localStorage.setItem(SOCIAL_COLUMN_VISIBILITY_KEY, JSON.stringify(settings));
        console.log('[COLUMN] Column visibility saved:', settings);
    } catch (error) {
        console.error('[COLUMN] Error saving column visibility:', error);
    }
}

// ===== APPLY VISIBILITY =====

/**
 * Apply column visibility to table
 */
function applyColumnVisibility(settings) {
    console.log('[COLUMN] Applying column visibility:', settings);

    // Apply to table headers
    document.querySelectorAll('th[data-column]').forEach((th) => {
        const column = th.getAttribute('data-column');
        if (settings[column] === false) {
            th.classList.add('hidden');
        } else {
            th.classList.remove('hidden');
        }
    });

    // Apply to table cells
    document.querySelectorAll('td[data-column]').forEach((td) => {
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
    document.querySelectorAll('.column-setting-item input[type="checkbox"]').forEach((checkbox) => {
        const column = checkbox.getAttribute('data-column');
        checkbox.checked = settings[column] !== false;
    });
}

// ===== MODAL FUNCTIONS =====

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
    document.querySelectorAll('.column-setting-item input[type="checkbox"]').forEach((checkbox) => {
        const column = checkbox.getAttribute('data-column');
        settings[column] = checkbox.checked;
    });

    // Save to localStorage
    saveColumnVisibilityToStorage(settings);

    // Apply to table
    applyColumnVisibility(settings);

    // Show success notification
    showNotification('Đã lưu cài đặt cột', 'success');

    // Close modal
    closeColumnSettingsModal();
}

/**
 * Reset column settings to default
 */
function resetColumnSettings() {
    // Update checkboxes to default
    updateColumnCheckboxes(DEFAULT_SOCIAL_COLUMN_VISIBILITY);

    // Show notification
    showNotification('Đã đặt lại về mặc định', 'info');
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

// ===== CLOSE MODAL ON OUTSIDE CLICK =====
document.addEventListener('click', function (e) {
    const modal = document.getElementById('columnSettingsModal');
    if (e.target === modal) {
        closeColumnSettingsModal();
    }
});

// ===== EXPORT =====
window.socialColumnVisibility = {
    initialize: initializeColumnVisibility,
    apply: applyColumnVisibility,
    load: loadColumnVisibility,
    save: saveColumnVisibilityToStorage,
};

window.openColumnSettingsModal = openColumnSettingsModal;
window.closeColumnSettingsModal = closeColumnSettingsModal;
window.saveColumnSettings = saveColumnSettings;
window.resetColumnSettings = resetColumnSettings;
window.initializeColumnVisibility = initializeColumnVisibility;
