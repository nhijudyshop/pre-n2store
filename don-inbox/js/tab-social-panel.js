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

// ===== TAG IMAGE STATE =====
let pendingNewTagImage = null; // base64 image for new tag being added
let pendingEditTagImages = {}; // { tagId: base64 } for tags being edited
let hoveredImageTagId = null; // tag ID whose image area mouse is hovering over

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
        const hoverAttrs = tag.image
            ? `onmouseenter="showTagImageHover(this, '${tag.id}')" onmouseleave="hideTagImageHover()"`
            : '';
        html += `
            <div class="tag-panel-card ${activePanelTagId === tag.id ? 'active' : ''}"
                 onclick="filterByPanelTag('${tag.id}')" ${hoverAttrs}>
                <div class="tag-panel-card-icon" style="background: ${tag.color};">
                    ${tag.image
                        ? `<img src="${tag.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
                        : `<i class="fas fa-tag"></i>`}
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

    // Init paste listener (once)
    initTagImagePasteListener();
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
                    <div class="tag-image-paste-area" id="newTagImagePaste"
                         onclick="triggerTagImageUpload('new')"
                         title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                        <span class="tag-image-paste-placeholder" id="newTagImagePlaceholder">
                            <i class="fas fa-image"></i>
                        </span>
                    </div>
                    <input type="file" id="newTagImageFile" accept="image/*" style="display:none"
                           onchange="handleTagImageFileSelect(event, 'new')">
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
        const tagImage = tag.image || null;
        const editImage = pendingEditTagImages[tag.id] !== undefined ? pendingEditTagImages[tag.id] : tagImage;
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
                <div class="tag-manage-image">
                    ${isEditing
                        ? `<div class="tag-image-paste-area ${editImage ? 'has-image' : ''}" id="editTagImagePaste_${tag.id}"
                                onclick="triggerTagImageUpload('${tag.id}')"
                                title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                               ${editImage
                                   ? `<img src="${editImage}" class="tag-image-thumb">
                                      <button class="tag-image-remove" onclick="event.stopPropagation(); removeTagImage('${tag.id}')" title="Xóa ảnh">&times;</button>`
                                   : `<span class="tag-image-paste-placeholder"><i class="fas fa-image"></i></span>`}
                           </div>
                           <input type="file" id="editTagImageFile_${tag.id}" accept="image/*" style="display:none"
                                  onchange="handleTagImageFileSelect(event, '${tag.id}')">`
                        : `<div class="tag-image-paste-area ${tagImage ? 'has-image' : ''}"
                                onmouseenter="setHoveredImageTag('${tag.id}')"
                                onmouseleave="setHoveredImageTag(null)"
                                onclick="triggerTagImageUpload('${tag.id}')"
                                title="Dán (Ctrl+V) hoặc click để chọn ảnh">
                               ${tagImage
                                   ? `<img src="${tagImage}" class="tag-image-thumb">
                                      <button class="tag-image-remove" onclick="event.stopPropagation(); directRemoveTagImage('${tag.id}')" title="Xóa ảnh">&times;</button>`
                                   : `<span class="tag-image-paste-placeholder"><i class="fas fa-image"></i></span>`}
                           </div>
                           <input type="file" id="editTagImageFile_${tag.id}" accept="image/*" style="display:none"
                                  onchange="handleTagImageFileSelect(event, '${tag.id}')">`
                    }
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
    if (pendingNewTagImage) {
        newTag.image = pendingNewTagImage;
    }
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
    pendingNewTagImage = null;
    clearNewTagImagePreview();

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
    if (editingTagId) delete pendingEditTagImages[editingTagId];
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

    // Update image if changed during edit
    if (pendingEditTagImages[tagId] !== undefined) {
        if (pendingEditTagImages[tagId]) {
            tag.image = pendingEditTagImages[tagId];
        } else {
            delete tag.image;
        }
        delete pendingEditTagImages[tagId];
    }

    editingTagId = null;

    // Save
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Also update tags embedded in orders
    updateTagInOrders(tagId, newName, tag.color, tag.image);

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

function updateTagInOrders(tagId, newName, newColor, newImage) {
    let changed = false;
    SocialOrderState.orders.forEach(order => {
        if (order.tags) {
            const tag = order.tags.find(t => t.id === tagId);
            if (tag) {
                tag.name = newName;
                tag.color = newColor;
                if (newImage) {
                    tag.image = newImage;
                } else {
                    delete tag.image;
                }
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

// ===== TAG IMAGE FUNCTIONS =====

/**
 * Handle paste event on the tag manage modal for image paste
 */
let _tagImagePasteListenerInit = false;
function initTagImagePasteListener() {
    if (_tagImagePasteListenerInit) return;
    const modal = document.getElementById('tagManageModal');
    if (!modal) return;
    _tagImagePasteListenerInit = true;

    modal.addEventListener('paste', function(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                processTagImageFile(file);
                break;
            }
        }
    });
}

/**
 * Determine which tag is being targeted for image paste.
 * Priority: hoveredImageTagId > editingTagId > new tag form
 */
function processTagImageFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;

        compressTagImage(base64, (compressed) => {
            if (hoveredImageTagId) {
                // Mouse is hovering over a tag's image area - directly save
                directSaveTagImage(hoveredImageTagId, compressed);
            } else if (editingTagId) {
                // Tag is in edit mode
                pendingEditTagImages[editingTagId] = compressed;
                renderTagManageList();
                setTimeout(() => {
                    const input = document.getElementById(`editTagName_${editingTagId}`);
                    if (input) input.focus();
                }, 50);
            } else {
                // Adding new tag
                pendingNewTagImage = compressed;
                updateNewTagImagePreview();
            }
        });
    };
    reader.readAsDataURL(file);
}

/**
 * Compress image to reduce storage size
 */
function compressTagImage(base64, callback) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let w = img.width;
        let h = img.height;

        if (w > MAX_SIZE || h > MAX_SIZE) {
            if (w > h) {
                h = Math.round(h * MAX_SIZE / w);
                w = MAX_SIZE;
            } else {
                w = Math.round(w * MAX_SIZE / h);
                h = MAX_SIZE;
            }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function() {
        callback(base64); // fallback to original
    };
    img.src = base64;
}

/**
 * Update the new tag image preview in the add form
 */
function updateNewTagImagePreview() {
    const pasteArea = document.getElementById('newTagImagePaste');
    if (!pasteArea) return;

    if (pendingNewTagImage) {
        pasteArea.classList.add('has-image');
        pasteArea.innerHTML = `
            <img src="${pendingNewTagImage}" class="tag-image-thumb">
            <button class="tag-image-remove" onclick="event.stopPropagation(); clearNewTagImage()" title="Xóa ảnh">&times;</button>
        `;
    } else {
        pasteArea.classList.remove('has-image');
        pasteArea.innerHTML = `<span class="tag-image-paste-placeholder" id="newTagImagePlaceholder"><i class="fas fa-image"></i></span>`;
    }
}

function clearNewTagImage() {
    pendingNewTagImage = null;
    updateNewTagImagePreview();
}

function clearNewTagImagePreview() {
    updateNewTagImagePreview();
}

/**
 * Trigger file input for image upload
 */
function triggerTagImageUpload(tagId) {
    const fileInput = tagId === 'new'
        ? document.getElementById('newTagImageFile')
        : document.getElementById(`editTagImageFile_${tagId}`);
    if (fileInput) fileInput.click();
}

/**
 * Handle file selection from input
 */
function handleTagImageFileSelect(event, tagId) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        compressTagImage(e.target.result, (compressed) => {
            if (tagId === 'new') {
                pendingNewTagImage = compressed;
                updateNewTagImagePreview();
            } else if (editingTagId === tagId) {
                // Tag is in edit mode - store as pending
                pendingEditTagImages[tagId] = compressed;
                renderTagManageList();
            } else {
                // Tag is NOT in edit mode - save directly
                directSaveTagImage(tagId, compressed);
            }
        });
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
}

/**
 * Remove image from a tag being edited
 */
function removeTagImage(tagId) {
    pendingEditTagImages[tagId] = null; // null means explicitly removed
    renderTagManageList();
}

/**
 * Show tag image hover preview (used in manage list and table)
 */
let _tagImageHoverEl = null;

function showTagImageHover(el, tagId) {
    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (!tag || !tag.image) return;

    hideTagImageHover();

    const rect = el.getBoundingClientRect();
    _tagImageHoverEl = document.createElement('div');
    _tagImageHoverEl.className = 'tag-image-hover-popup';

    const img = document.createElement('img');
    img.src = tag.image;
    _tagImageHoverEl.appendChild(img);

    // Add tag name label
    const label = document.createElement('div');
    label.className = 'tag-image-hover-label';
    label.style.cssText = 'background:' + tag.color;
    label.textContent = tag.name;
    _tagImageHoverEl.appendChild(label);

    document.body.appendChild(_tagImageHoverEl);

    // Position above element
    img.onload = () => {
        if (!_tagImageHoverEl) return;
        const hoverRect = _tagImageHoverEl.getBoundingClientRect();
        let top = rect.top - hoverRect.height - 8;
        if (top < 8) top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (hoverRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - hoverRect.width - 8));
        _tagImageHoverEl.style.top = top + 'px';
        _tagImageHoverEl.style.left = left + 'px';
    };

    // Initial position
    _tagImageHoverEl.style.top = (rect.top - 220) + 'px';
    _tagImageHoverEl.style.left = rect.left + 'px';
}

function hideTagImageHover() {
    if (_tagImageHoverEl) {
        _tagImageHoverEl.remove();
        _tagImageHoverEl = null;
    }
}

/**
 * Track which tag's image area the mouse is hovering over.
 * Used by paste handler to know which tag to assign the image to.
 */
function setHoveredImageTag(tagId) {
    hoveredImageTagId = tagId;
}

/**
 * Directly save an image to a tag without entering edit mode.
 * Used when pasting/uploading while hovering over a tag's image area.
 */
function directSaveTagImage(tagId, imageBase64) {
    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (!tag) return;

    tag.image = imageBase64;

    // Save to storage + Firebase
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update tags embedded in orders
    updateTagInOrders(tagId, tag.name, tag.color, tag.image);

    // Update UI
    renderTagManageList();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification(`Đã cập nhật ảnh cho tag "${tag.name}"`, 'success');
}

/**
 * Directly remove an image from a tag without entering edit mode.
 */
function directRemoveTagImage(tagId) {
    const tag = SocialOrderState.tags.find(t => t.id === tagId);
    if (!tag) return;

    delete tag.image;

    // Save to storage + Firebase
    saveSocialTagsToStorage();
    if (typeof saveSocialTagsToFirebase === 'function') {
        saveSocialTagsToFirebase(SocialOrderState.tags);
    }

    // Update tags embedded in orders
    updateTagInOrders(tagId, tag.name, tag.color, undefined);

    // Update UI
    renderTagManageList();
    if (isTagPanelOpen) renderTagPanelCards();

    showNotification(`Đã xóa ảnh tag "${tag.name}"`, 'success');
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
window.triggerTagImageUpload = triggerTagImageUpload;
window.handleTagImageFileSelect = handleTagImageFileSelect;
window.removeTagImage = removeTagImage;
window.clearNewTagImage = clearNewTagImage;
window.showTagImageHover = showTagImageHover;
window.hideTagImageHover = hideTagImageHover;
window.initTagImagePasteListener = initTagImagePasteListener;
window.setHoveredImageTag = setHoveredImageTag;
window.directSaveTagImage = directSaveTagImage;
window.directRemoveTagImage = directRemoveTagImage;
