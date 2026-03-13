/**
 * Tab Social Orders - Panel Module
 * Right-side tag grouping panel with toggle, pin, and tag management
 */

// ===== STATE =====
const SOCIAL_PANEL_PIN_KEY = 'socialTagPanelPinned';
let isTagPanelOpen = false;
let isTagPanelPinned = false;
let activePanelTagId = null; // null = show all

// ===== PRESET COLORS =====
const TAG_PRESET_COLORS = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#a855f7',
    '#e11d48', '#84cc16', '#06b6d4', '#7c3aed', '#db2777'
];

// ===== INIT =====
function initTagPanel() {
    // Read pin state from localStorage
    const pinned = localStorage.getItem(SOCIAL_PANEL_PIN_KEY);
    isTagPanelPinned = pinned === 'true';

    // If pinned, auto-open panel
    if (isTagPanelPinned) {
        openTagPanel();
    }
}

// ===== TOGGLE PANEL =====
function toggleTagPanel() {
    if (isTagPanelOpen) {
        closeTagPanel();
    } else {
        openTagPanel();
    }
}

function openTagPanel() {
    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.add('open');
    isTagPanelOpen = true;

    // Update toggle button
    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.add('active');

    // Update pin button
    updatePinButtonUI();

    // Render cards
    renderTagPanelCards();

    // Show overlay on mobile
    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay && window.innerWidth <= 1024) {
        overlay.classList.add('show');
    }
}

function closeTagPanel() {
    // Don't close if pinned
    if (isTagPanelPinned) return;

    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.remove('open');
    isTagPanelOpen = false;

    // Update toggle button
    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.remove('active');

    // Hide overlay on mobile
    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay) overlay.classList.remove('show');
}

// Force close (even if pinned - used by close button)
function forceCloseTagPanel() {
    isTagPanelPinned = false;
    localStorage.setItem(SOCIAL_PANEL_PIN_KEY, 'false');

    const panel = document.getElementById('tagPanel');
    if (!panel) return;

    panel.classList.remove('open');
    isTagPanelOpen = false;

    const toggleBtn = document.getElementById('btnToggleTagPanel');
    if (toggleBtn) toggleBtn.classList.remove('active');

    const overlay = document.getElementById('tagPanelOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ===== PIN =====
function togglePinTagPanel() {
    isTagPanelPinned = !isTagPanelPinned;
    localStorage.setItem(SOCIAL_PANEL_PIN_KEY, isTagPanelPinned.toString());
    updatePinButtonUI();

    if (isTagPanelPinned) {
        showNotification('Đã ghim panel', 'success');
    } else {
        showNotification('Đã bỏ ghim panel', 'success');
    }
}

function updatePinButtonUI() {
    const pinBtn = document.getElementById('btnPinPanel');
    if (!pinBtn) return;

    if (isTagPanelPinned) {
        pinBtn.classList.add('pinned');
        pinBtn.title = 'Bỏ ghim panel';
    } else {
        pinBtn.classList.remove('pinned');
        pinBtn.title = 'Ghim panel';
    }
}

// ===== RENDER TAG CARDS =====
function renderTagPanelCards() {
    const body = document.getElementById('tagPanelBody');
    if (!body) return;

    const counts = getTagOrderCounts();
    const totalOrders = SocialOrderState.orders.length;

    let html = '';

    // "All" card
    html += `
        <div class="tag-panel-card ${activePanelTagId === null ? 'active' : ''}"
             onclick="filterByPanelTag(null)">
            <div class="tag-panel-card-icon" style="background: #6b7280;">
                <i class="fas fa-globe"></i>
            </div>
            <div class="tag-panel-card-info">
                <div class="tag-panel-card-name">TẤT CẢ</div>
                <div class="tag-panel-card-count">${totalOrders} đơn hàng</div>
            </div>
        </div>
    `;

    // "No tag" card
    const noTagCount = SocialOrderState.orders.filter(o => !o.tags || o.tags.length === 0).length;
    html += `
        <div class="tag-panel-card ${activePanelTagId === '__no_tag__' ? 'active' : ''}"
             onclick="filterByPanelTag('__no_tag__')">
            <div class="tag-panel-card-icon" style="background: #d1d5db;">
                <i class="fas fa-tag" style="color: #6b7280;"></i>
            </div>
            <div class="tag-panel-card-info">
                <div class="tag-panel-card-name">CHƯA GÁN TAG</div>
                <div class="tag-panel-card-count">${noTagCount} đơn hàng</div>
            </div>
        </div>
    `;

    // Tag cards
    SocialOrderState.tags.forEach(tag => {
        const count = counts[tag.id] || 0;
        html += `
            <div class="tag-panel-card ${activePanelTagId === tag.id ? 'active' : ''}"
                 onclick="filterByPanelTag('${tag.id}')">
                <div class="tag-panel-card-icon" style="background: ${tag.color};">
                    <i class="fas fa-tag"></i>
                </div>
                <div class="tag-panel-card-info">
                    <div class="tag-panel-card-name">${tag.name}</div>
                    <div class="tag-panel-card-count">${count} đơn hàng</div>
                </div>
            </div>
        `;
    });

    body.innerHTML = html;
}

function getTagOrderCounts() {
    const counts = {};
    SocialOrderState.tags.forEach(tag => { counts[tag.id] = 0; });

    SocialOrderState.orders.forEach(order => {
        (order.tags || []).forEach(t => {
            if (counts[t.id] !== undefined) counts[t.id]++;
        });
    });

    return counts;
}

// ===== FILTER BY PANEL TAG =====
function filterByPanelTag(tagId) {
    activePanelTagId = tagId;

    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
        if (tagId === null || tagId === '__no_tag__') {
            tagFilter.value = 'all';
        } else {
            tagFilter.value = tagId;
        }
    }

    // For "no tag" filter, we need custom logic since performTableSearch doesn't support it natively
    if (tagId === '__no_tag__') {
        // Temporarily override: filter orders without tags
        performTableSearchWithNoTag();
    } else {
        performTableSearch();
    }

    // Update active card UI
    renderTagPanelCards();
}

// Custom search that filters orders with no tags
function performTableSearchWithNoTag() {
    const searchInput = document.getElementById('tableSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');

    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const statusValue = statusFilter?.value || 'all';
    const sourceValue = sourceFilter?.value || 'all';

    const dateRange = getDateRange(currentDateFilter);

    SocialOrderState.filters = {
        search: searchTerm,
        status: statusValue,
        source: sourceValue,
        tag: 'all',
        dateFilter: currentDateFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
    };

    SocialOrderState.filteredOrders = SocialOrderState.orders.filter(order => {
        // Date filter
        if (dateRange.from || dateRange.to) {
            const orderDate = new Date(order.createdAt);
            if (dateRange.from && orderDate < dateRange.from) return false;
            if (dateRange.to && orderDate > dateRange.to) return false;
        }
        // Status filter
        if (statusValue !== 'all' && order.status !== statusValue) return false;
        // Source filter
        if (sourceValue !== 'all' && order.source !== sourceValue) return false;
        // No tag filter
        if (order.tags && order.tags.length > 0) return false;
        // Search filter
        if (searchTerm) {
            const searchFields = [order.id, order.customerName, order.phone, order.address, order.note]
                .filter(Boolean).join(' ').toLowerCase();
            if (!searchFields.includes(searchTerm)) return false;
        }
        return true;
    });

    renderTable();
    updateSearchResultCount();
    updateSearchClearButton();
}

// ===== TAG MANAGEMENT MODAL =====
let tagManageModalCreated = false;
let editingTagId = null;

function openTagManageModal() {
    if (!tagManageModalCreated) {
        createTagManageModal();
        tagManageModalCreated = true;
    }

    renderTagManageList();

    const modal = document.getElementById('tagManageModal');
    if (modal) modal.classList.add('show');
}

function closeTagManageModal() {
    const modal = document.getElementById('tagManageModal');
    if (modal) modal.classList.remove('show');
    editingTagId = null;
}

function createTagManageModal() {
    const modal = document.createElement('div');
    modal.id = 'tagManageModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i class="fas fa-cog"></i> Quản Lý Tags</h3>
                <button class="modal-close" onclick="closeTagManageModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="tag-manage-list" id="tagManageList"></div>
                <div class="tag-add-form" id="tagAddForm">
                    <input type="color" id="newTagColor" value="#8b5cf6" title="Chọn màu">
                    <input type="text" id="newTagName" placeholder="Tên tag mới..."
                           onkeydown="if(event.key==='Enter') addNewTag()">
                    <button onclick="addNewTag()">
                        <i class="fas fa-plus"></i> Thêm
                    </button>
                </div>
                <div class="color-presets" id="colorPresets">
                    ${TAG_PRESET_COLORS.map(c => `
                        <div class="color-preset" style="background: ${c};"
                             onclick="selectPresetColor('${c}')" title="${c}"></div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="closeTagManageModal()">Đóng</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderTagManageList() {
    const list = document.getElementById('tagManageList');
    if (!list) return;

    if (SocialOrderState.tags.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">Chưa có tag nào</div>';
        return;
    }

    list.innerHTML = SocialOrderState.tags.map(tag => {
        const isEditing = editingTagId === tag.id;
        return `
            <div class="tag-manage-item" data-tag-id="${tag.id}">
                <input type="color" class="tag-manage-color" value="${tag.color}"
                       style="width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer;"
                       ${isEditing ? '' : 'disabled'}
                       onchange="updateTagColor('${tag.id}', this.value)">
                <div class="tag-manage-name">
                    ${isEditing
                        ? `<input type="text" value="${tag.name}" id="editTagName_${tag.id}"
                                  onkeydown="if(event.key==='Enter') saveTagEdit('${tag.id}')">`
                        : tag.name}
                </div>
                <div class="tag-manage-actions">
                    ${isEditing
                        ? `<button class="btn-edit-tag" onclick="saveTagEdit('${tag.id}')" title="Lưu">
                               <i class="fas fa-check"></i>
                           </button>
                           <button class="btn-delete-tag" onclick="cancelTagEdit()" title="Hủy">
                               <i class="fas fa-times"></i>
                           </button>`
                        : `<button class="btn-edit-tag" onclick="startTagEdit('${tag.id}')" title="Sửa">
                               <i class="fas fa-edit"></i>
                           </button>
                           <button class="btn-delete-tag" onclick="deleteTag('${tag.id}')" title="Xóa">
                               <i class="fas fa-trash"></i>
                           </button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

function selectPresetColor(color) {
    const colorInput = document.getElementById('newTagColor');
    if (colorInput) colorInput.value = color;

    // Update preset selection UI
    document.querySelectorAll('.color-preset').forEach(el => {
        el.classList.toggle('selected', el.style.background === color);
    });
}

function addNewTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');

    const name = (nameInput?.value || '').trim();
    const color = colorInput?.value || '#8b5cf6';

    if (!name) {
        showNotification('Vui lòng nhập tên tag', 'warning');
        nameInput?.focus();
        return;
    }

    // Check duplicate name
    if (SocialOrderState.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        showNotification('Tag này đã tồn tại', 'warning');
        return;
    }

    // Generate ID
    const id = 'tag_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();

    const newTag = { id, name, color };
    SocialOrderState.tags.push(newTag);

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update UI
    renderTagManageList();
    populateTagFilter();
    if (isTagPanelOpen) renderTagPanelCards();

    // Clear input
    nameInput.value = '';

    showNotification(`Đã thêm tag "${name}"`, 'success');
}

function startTagEdit(tagId) {
    editingTagId = tagId;
    renderTagManageList();

    // Focus input
    setTimeout(() => {
        const input = document.getElementById(`editTagName_${tagId}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 50);
}

function cancelTagEdit() {
    editingTagId = null;
    renderTagManageList();
}

function saveTagEdit(tagId) {
    const input = document.getElementById(`editTagName_${tagId}`);
    const newName = (input?.value || '').trim();

    if (!newName) {
        showNotification('Tên tag không được để trống', 'warning');
        return;
    }

    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (!tag) return;

    // Get color from the color input
    const colorInput = document.querySelector(`.tag-manage-item[data-tag-id="${tagId}"] input[type="color"]`);
    if (colorInput) tag.color = colorInput.value;

    tag.name = newName;
    editingTagId = null;

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Also update tags embedded in orders
    updateTagInOrders(tagId, newName, tag.color);

    // Update UI
    renderTagManageList();
    populateTagFilter();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification('Đã cập nhật tag', 'success');
}

function updateTagColor(tagId, newColor) {
    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (tag) tag.color = newColor;
}

function deleteTag(tagId) {
    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (!tag) return;

    if (!confirm(`Bạn có chắc muốn xóa tag "${tag.name}"?`)) return;

    // Remove from tag list
    SocialOrderState.tags = SocialOrderState.tags.filter(t => t.id !== tagId);

    // Remove from all orders
    SocialOrderState.orders.forEach(order => {
        if (order.tags) {
            order.tags = order.tags.filter(t => t.id !== tagId);
            // Fire-and-forget: sync to Firestore
            if (typeof updateSocialOrderTags === 'function') {
                updateSocialOrderTags(order.id, order.tags);
            }
        }
    });

    // Save
    saveSocialOrdersToStorage();
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update UI
    renderTagManageList();
    populateTagFilter();
    performTableSearch();
    if (isTagPanelOpen) renderTagPanelCards();

    // Reset filter if deleted tag was active
    if (activePanelTagId === tagId) {
        activePanelTagId = null;
    }

    showNotification(`Đã xóa tag "${tag.name}"`, 'success');
}

function updateTagInOrders(tagId, newName, newColor) {
    let changed = false;
    SocialOrderState.orders.forEach(order => {
        if (order.tags) {
            const tag = order.tags.find(t => t.id === tagId);
            if (tag) {
                tag.name = newName;
                tag.color = newColor;
                changed = true;
                // Fire-and-forget: sync to Firestore
                if (typeof updateSocialOrderTags === 'function') {
                    updateSocialOrderTags(order.id, order.tags);
                }
            }
        }
    });

    if (changed) {
        saveSocialOrdersToStorage();
        performTableSearch();
    }
}

// ===== EXPORTS =====
window.initTagPanel = initTagPanel;
window.toggleTagPanel = toggleTagPanel;
window.forceCloseTagPanel = forceCloseTagPanel;
window.togglePinTagPanel = togglePinTagPanel;
window.renderTagPanelCards = renderTagPanelCards;
window.filterByPanelTag = filterByPanelTag;
window.openTagManageModal = openTagManageModal;
window.closeTagManageModal = closeTagManageModal;
window.addNewTag = addNewTag;
window.startTagEdit = startTagEdit;
window.cancelTagEdit = cancelTagEdit;
window.saveTagEdit = saveTagEdit;
window.updateTagColor = updateTagColor;
window.deleteTag = deleteTag;
window.selectPresetColor = selectPresetColor;
