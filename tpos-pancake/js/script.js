/* =====================================================
   TPOS - PANCAKE DUAL COLUMN MANAGER
   ===================================================== */

// Column Configuration
const COLUMN_CONFIG = {
    storageKey: 'tpos_pancake_column_order',
    defaultOrder: ['tpos', 'pancake'], // Left to Right
    columns: {
        tpos: {
            id: 'tposColumn',
            contentId: 'tposContent',
            name: 'TPOS',
            icon: 'shopping-cart'
        },
        pancake: {
            id: 'pancakeColumn',
            contentId: 'pancakeContent',
            name: 'Pancake',
            icon: 'layout-grid'
        }
    }
};

// State
let currentOrder = [...COLUMN_CONFIG.defaultOrder];
let isResizing = false;
let startX = 0;
let startWidths = { left: 0, right: 0 };

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeColumnOrder();
    initializeSettingsPanel();
    initializeResizeHandle();
    initializeLucideIcons();
});

function initializeLucideIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// =====================================================
// COLUMN ORDER MANAGEMENT
// =====================================================

function initializeColumnOrder() {
    // Load saved order from localStorage
    const savedOrder = localStorage.getItem(COLUMN_CONFIG.storageKey);
    if (savedOrder) {
        try {
            currentOrder = JSON.parse(savedOrder);
            if (!Array.isArray(currentOrder) || currentOrder.length !== 2) {
                currentOrder = [...COLUMN_CONFIG.defaultOrder];
            }
        } catch (e) {
            currentOrder = [...COLUMN_CONFIG.defaultOrder];
        }
    }

    applyColumnOrder();
    updateSelectValues();
}

function applyColumnOrder() {
    const container = document.getElementById('dualColumnContainer');
    const tposColumn = document.getElementById('tposColumn');
    const pancakeColumn = document.getElementById('pancakeColumn');
    const resizeHandle = document.getElementById('resizeHandle');

    if (!container || !tposColumn || !pancakeColumn || !resizeHandle) return;

    // Clear container
    container.innerHTML = '';

    // Add columns in order
    currentOrder.forEach((columnKey, index) => {
        if (columnKey === 'tpos') {
            container.appendChild(tposColumn);
        } else {
            container.appendChild(pancakeColumn);
        }

        // Add resize handle between columns
        if (index === 0) {
            container.appendChild(resizeHandle);
        }
    });

    // Re-initialize Lucide icons after DOM manipulation
    initializeLucideIcons();
}

function saveColumnOrder() {
    localStorage.setItem(COLUMN_CONFIG.storageKey, JSON.stringify(currentOrder));
}

function updateSelectValues() {
    const column1Select = document.getElementById('column1Select');
    const column2Select = document.getElementById('column2Select');

    if (column1Select && column2Select) {
        column1Select.value = currentOrder[0];
        column2Select.value = currentOrder[1];
    }
}

function swapColumns() {
    currentOrder = [currentOrder[1], currentOrder[0]];
    applyColumnOrder();
    saveColumnOrder();
    updateSelectValues();
}

// =====================================================
// SETTINGS PANEL
// =====================================================

function initializeSettingsPanel() {
    const btnSettings = document.getElementById('btnColumnSettings');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettings = document.getElementById('closeSettings');
    const btnApply = document.getElementById('btnApplySettings');
    const btnReset = document.getElementById('btnResetSettings');
    const column1Select = document.getElementById('column1Select');
    const column2Select = document.getElementById('column2Select');

    // Toggle settings panel
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            settingsPanel.classList.toggle('show');
        });
    }

    // Close settings panel
    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            settingsPanel.classList.remove('show');
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (settingsPanel && settingsPanel.classList.contains('show')) {
            if (!settingsPanel.contains(e.target) && e.target !== btnSettings && !btnSettings.contains(e.target)) {
                settingsPanel.classList.remove('show');
            }
        }
    });

    // Sync select values - when one changes, update the other
    if (column1Select && column2Select) {
        column1Select.addEventListener('change', () => {
            const value = column1Select.value;
            column2Select.value = value === 'tpos' ? 'pancake' : 'tpos';
        });

        column2Select.addEventListener('change', () => {
            const value = column2Select.value;
            column1Select.value = value === 'tpos' ? 'pancake' : 'tpos';
        });
    }

    // Apply settings
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const newOrder = [column1Select.value, column2Select.value];

            // Validate order
            if (newOrder[0] === newOrder[1]) {
                showNotification('Hai cột không thể giống nhau!', 'error');
                return;
            }

            currentOrder = newOrder;
            applyColumnOrder();
            saveColumnOrder();
            settingsPanel.classList.remove('show');
            showNotification('Đã áp dụng cài đặt vị trí cột!', 'success');
        });
    }

    // Reset settings
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            currentOrder = [...COLUMN_CONFIG.defaultOrder];
            applyColumnOrder();
            saveColumnOrder();
            updateSelectValues();
            showNotification('Đã đặt lại vị trí cột mặc định!', 'info');
        });
    }
}

// =====================================================
// RESIZE HANDLE
// =====================================================

function initializeResizeHandle() {
    const resizeHandle = document.getElementById('resizeHandle');
    const container = document.getElementById('dualColumnContainer');

    if (!resizeHandle || !container) return;

    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    // Touch support
    resizeHandle.addEventListener('touchstart', (e) => {
        startResize(e.touches[0]);
    });
    document.addEventListener('touchmove', (e) => {
        if (isResizing) {
            doResize(e.touches[0]);
        }
    });
    document.addEventListener('touchend', stopResize);
}

function startResize(e) {
    isResizing = true;
    startX = e.clientX;

    const container = document.getElementById('dualColumnContainer');
    const columns = container.querySelectorAll('.column-wrapper');

    if (columns.length >= 2) {
        startWidths.left = columns[0].offsetWidth;
        startWidths.right = columns[1].offsetWidth;
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function doResize(e) {
    if (!isResizing) return;

    const container = document.getElementById('dualColumnContainer');
    const columns = container.querySelectorAll('.column-wrapper');
    const resizeHandle = document.getElementById('resizeHandle');

    if (columns.length < 2) return;

    const dx = e.clientX - startX;
    const containerWidth = container.offsetWidth - resizeHandle.offsetWidth;

    let newLeftWidth = startWidths.left + dx;
    let newRightWidth = startWidths.right - dx;

    // Minimum width constraint
    const minWidth = 300;

    if (newLeftWidth < minWidth) {
        newLeftWidth = minWidth;
        newRightWidth = containerWidth - minWidth;
    }

    if (newRightWidth < minWidth) {
        newRightWidth = minWidth;
        newLeftWidth = containerWidth - minWidth;
    }

    // Apply as flex basis
    const leftPercent = (newLeftWidth / containerWidth) * 100;
    const rightPercent = (newRightWidth / containerWidth) * 100;

    columns[0].style.flex = `0 0 ${leftPercent}%`;
    columns[1].style.flex = `0 0 ${rightPercent}%`;
}

function stopResize() {
    if (!isResizing) return;

    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

// =====================================================
// FULLSCREEN MODE
// =====================================================

function toggleFullscreen(columnKey) {
    const column = document.getElementById(COLUMN_CONFIG.columns[columnKey].id);
    if (!column) return;

    const isFullscreen = column.classList.contains('fullscreen');

    if (isFullscreen) {
        // Exit fullscreen
        column.classList.remove('fullscreen');
        document.body.style.overflow = '';
    } else {
        // Enter fullscreen
        column.classList.add('fullscreen');
        document.body.style.overflow = 'hidden';
    }

    initializeLucideIcons();
}

// Close fullscreen on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const fullscreenColumn = document.querySelector('.column-wrapper.fullscreen');
        if (fullscreenColumn) {
            fullscreenColumn.classList.remove('fullscreen');
            document.body.style.overflow = '';
        }
    }
});

// =====================================================
// NOTIFICATION SYSTEM
// =====================================================

function showNotification(message, type = 'info') {
    // Check if notification container exists
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // Define colors based on type
    const colors = {
        success: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
        error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
        info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
        warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }
    };

    const color = colors[type] || colors.info;

    notification.style.cssText = `
        padding: 12px 16px;
        background: ${color.bg};
        border: 1px solid ${color.border};
        border-radius: 8px;
        color: ${color.text};
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        animation: slideIn 0.3s ease-out;
        max-width: 320px;
    `;

    notification.textContent = message;
    container.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
`;
document.head.appendChild(style);

// =====================================================
// REFRESH BUTTON
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            // Refresh both column contents
            const tposContent = document.getElementById('tposContent');
            const pancakeContent = document.getElementById('pancakeContent');

            // If there are iframes, reload them
            const tposIframe = tposContent?.querySelector('iframe');
            const pancakeIframe = pancakeContent?.querySelector('iframe');

            if (tposIframe) {
                tposIframe.src = tposIframe.src;
            }
            if (pancakeIframe) {
                pancakeIframe.src = pancakeIframe.src;
            }

            showNotification('Đã làm mới nội dung!', 'success');
        });
    }
});

// =====================================================
// UTILITY FUNCTIONS FOR EMBEDDING CONTENT
// =====================================================

/**
 * Set iframe URL for a column
 * @param {string} columnKey - 'tpos' or 'pancake'
 * @param {string} url - URL to embed
 */
function setColumnIframe(columnKey, url) {
    const contentId = COLUMN_CONFIG.columns[columnKey]?.contentId;
    const contentEl = document.getElementById(contentId);

    if (!contentEl) return;

    contentEl.innerHTML = `<iframe src="${url}" allow="fullscreen"></iframe>`;
}

/**
 * Set custom HTML content for a column
 * @param {string} columnKey - 'tpos' or 'pancake'
 * @param {string} html - HTML content
 */
function setColumnContent(columnKey, html) {
    const contentId = COLUMN_CONFIG.columns[columnKey]?.contentId;
    const contentEl = document.getElementById(contentId);

    if (!contentEl) return;

    contentEl.innerHTML = html;
    initializeLucideIcons();
}

// Export functions for external use
window.TposPancake = {
    setColumnIframe,
    setColumnContent,
    swapColumns,
    toggleFullscreen,
    getColumnOrder: () => [...currentOrder]
};
