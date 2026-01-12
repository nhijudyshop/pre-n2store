// =====================================================
// SỔ ORDER LIVE - MAIN APPLICATION
// Firebase Realtime Sync
// =====================================================

// =====================================================
// GLOBAL STATE
// =====================================================

const AppState = {
    database: null,
    currentUser: null,
    userIdentifier: null,
    sheets: {},
    activeSheetId: null,
    pendingActiveSheetId: null,  // Store pending active sheet from Firebase
    sheetsLoaded: false,         // Track if sheets data has been loaded
    productsData: [],
    isLoadingProducts: false,
    searchDebounceTimer: null,
    saveDebounceTimer: null,
    isSaving: false
};

// Firebase paths
const FIREBASE_PATHS = {
    SHEETS: 'liveOrderTracking/sheets',
    HISTORY: 'liveOrderTracking/history',
    ACTIVE_SHEET: 'liveOrderTracking/activeSheetId'
};

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[APP] Initializing Sổ Order Live...');

    try {
        // Initialize Firebase
        await initFirebase();

        // Initialize Auth
        await initAuth();

        // Setup event listeners with event delegation
        setupEventListeners();

        // Load products data in background
        loadProductsData();

        console.log('[APP] Initialization complete');
    } catch (error) {
        console.error('[APP] Initialization error:', error);
        showToast('Lỗi khởi tạo ứng dụng', 'error');
    }
});

async function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }

        if (firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        AppState.database = firebase.database();
        console.log('[APP] Firebase initialized');
    } catch (error) {
        console.error('[APP] Firebase init error:', error);
        showToast('Lỗi kết nối Firebase', 'error');
        throw error;
    }
}

async function initAuth() {
    try {
        let attempts = 0;
        while (!window.authManager && attempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (window.authManager) {
            const authState = window.authManager.getAuthState();
            if (authState && authState.isLoggedIn === 'true') {
                AppState.currentUser = authState;
                if (authState.userType) {
                    AppState.userIdentifier = authState.userType.includes('-')
                        ? authState.userType.split('-')[0]
                        : authState.userType;
                } else if (authState.username) {
                    AppState.userIdentifier = authState.username;
                } else {
                    AppState.userIdentifier = 'default';
                }
                console.log('[APP] User authenticated:', AppState.userIdentifier);
            } else {
                AppState.userIdentifier = 'guest';
            }
        } else {
            AppState.userIdentifier = 'guest';
        }

        // Setup realtime listeners
        setupRealtimeListeners();
    } catch (error) {
        console.error('[APP] Auth init error:', error);
        AppState.userIdentifier = 'guest';
        setupRealtimeListeners();
    }
}

// =====================================================
// FIREBASE REALTIME LISTENERS
// =====================================================

// Return shared path for all users (no user-specific path)
function getSharedPath(basePath) {
    return `${basePath}/shared`;
}

// Alias for backward compatibility - now uses shared path
function getUserPath(basePath) {
    return getSharedPath(basePath);
}

// Get display name for current user
function getDisplayUsername() {
    if (AppState.currentUser) {
        return AppState.currentUser.username || AppState.userIdentifier || 'Người dùng';
    }
    return AppState.userIdentifier || 'Khách';
}

function setupRealtimeListeners() {
    if (!AppState.database) {
        console.error('[APP] Database not initialized');
        return;
    }

    const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
    const activePath = getUserPath(FIREBASE_PATHS.ACTIVE_SHEET);
    console.log('[APP] Setting up listeners for:', sheetsPath, activePath);

    // Listen to active sheet FIRST - capture the value immediately
    // This ensures we don't miss the active sheet ID due to race conditions
    AppState.database.ref(activePath).on('value', (snapshot) => {
        const activeId = snapshot.val();
        console.log('[APP] Active sheet from Firebase:', activeId);

        // Always store the Firebase value as pending
        AppState.pendingActiveSheetId = activeId;

        // If sheets already loaded, apply the active sheet immediately
        if (AppState.sheetsLoaded) {
            applyActiveSheet(activeId);
        }
    });

    // Listen to sheets changes
    AppState.database.ref(sheetsPath).on('value', (snapshot) => {
        const data = snapshot.val();
        AppState.sheets = data || {};
        AppState.sheetsLoaded = true;
        console.log('[APP] Sheets updated from Firebase:', Object.keys(AppState.sheets).length, 'sheets');

        renderSheetsList();

        // Apply pending active sheet from Firebase (source of truth)
        if (AppState.pendingActiveSheetId) {
            applyActiveSheet(AppState.pendingActiveSheetId);
        } else if (AppState.activeSheetId && AppState.sheets[AppState.activeSheetId]) {
            // Current active sheet still valid
            renderSheetContent();
        } else {
            // No valid active sheet
            AppState.activeSheetId = null;
            showNoSheetSelected();
        }

        updateSyncStatus('synced');
    }, (error) => {
        console.error('[APP] Firebase listen error:', error);
        updateSyncStatus('error');
    });
}

// Helper function to apply active sheet from Firebase
function applyActiveSheet(activeId) {
    if (activeId && AppState.sheets[activeId]) {
        // Valid active sheet from Firebase
        if (activeId !== AppState.activeSheetId) {
            AppState.activeSheetId = activeId;
            console.log('[APP] Applied active sheet from Firebase:', activeId);
            renderSheetsList();
            renderSheetContent();
        } else {
            // Same sheet, just ensure content is rendered
            renderSheetContent();
        }
    } else if (activeId && !AppState.sheets[activeId]) {
        // Active sheet ID from Firebase doesn't exist in sheets - clear it
        console.log('[APP] Active sheet not found in sheets, clearing:', activeId);
        AppState.activeSheetId = null;
        // Clear the invalid active sheet from Firebase
        const activePath = getUserPath(FIREBASE_PATHS.ACTIVE_SHEET);
        AppState.database.ref(activePath).set(null);
        showNoSheetSelected();
    } else {
        // No active sheet set
        AppState.activeSheetId = null;
        showNoSheetSelected();
    }
}

// =====================================================
// EVENT LISTENERS (Event Delegation)
// =====================================================

function setupEventListeners() {
    // Sheet list click handler (Event Delegation)
    const sheetsList = document.getElementById('sheetsList');
    if (sheetsList) {
        sheetsList.addEventListener('click', handleSheetsListClick);
    }

    // Products table click handler
    const productsTable = document.getElementById('productsTable');
    if (productsTable) {
        productsTable.addEventListener('click', handleTableClick);
        productsTable.addEventListener('change', handleTableChange);
    }

    // Search input
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(AppState.searchDebounceTimer);
            AppState.searchDebounceTimer = setTimeout(() => {
                handleSearch(e.target.value);
            }, 300);
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                handleSearch(searchInput.value);
            }
        });
    }

    // Suggestions dropdown click
    const suggestionsDropdown = document.getElementById('suggestionsDropdown');
    if (suggestionsDropdown) {
        suggestionsDropdown.addEventListener('click', handleSuggestionClick);
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            hideSuggestions();
        }
    });

    // Sheet name input enter key
    const sheetNameInput = document.getElementById('sheetNameInput');
    if (sheetNameInput) {
        sheetNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveSheet();
            }
        });
    }

    // Header buttons
    document.getElementById('syncStatus')?.addEventListener('click', () => {
        updateSyncStatus('syncing');
        setTimeout(() => updateSyncStatus('synced'), 1000);
    });
}

function handleSheetsListClick(e) {
    console.log('[APP] Sheet list clicked:', e.target);

    const sheetItem = e.target.closest('.sheet-item');
    const editBtn = e.target.closest('button[data-action="edit"]');
    const deleteBtn = e.target.closest('button[data-action="delete"]');

    console.log('[APP] Found elements:', { sheetItem, editBtn, deleteBtn });

    if (editBtn) {
        e.stopPropagation();
        const sheetId = editBtn.dataset.sheetId;
        console.log('[APP] Edit button clicked for:', sheetId);
        editSheetNameById(sheetId);
        return;
    }

    if (deleteBtn) {
        e.stopPropagation();
        const sheetId = deleteBtn.dataset.sheetId;
        console.log('[APP] Delete button clicked for:', sheetId);
        deleteSheet(sheetId);
        return;
    }

    if (sheetItem) {
        const sheetId = sheetItem.dataset.sheetId;
        console.log('[APP] Sheet item clicked:', sheetId);
        if (sheetId) {
            selectSheet(sheetId);
        }
    }
}

function handleTableClick(e) {
    const deleteBtn = e.target.closest('.btn-delete-row');
    if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index);
        if (!isNaN(index)) {
            deleteItem(index);
        }
    }
}

function handleTableChange(e) {
    const input = e.target.closest('.qty-input');
    if (input) {
        const index = parseInt(input.dataset.index);
        const field = input.dataset.field;
        if (!isNaN(index) && field) {
            updateItemQty(index, field, input.value);
        }
    }
}

function handleSuggestionClick(e) {
    const item = e.target.closest('.suggestion-item');
    if (item && item.dataset.product) {
        try {
            const product = JSON.parse(item.dataset.product);
            addProductToSheet(product);
        } catch (error) {
            console.error('[APP] Error parsing product data:', error);
        }
    }
}

// =====================================================
// SHEETS MANAGEMENT
// =====================================================

function renderSheetsList() {
    const container = document.getElementById('sheetsList');
    if (!container) return;

    const sheetIds = Object.keys(AppState.sheets);

    if (sheetIds.length === 0) {
        // Show empty state
        container.innerHTML = `
            <div class="empty-state" id="emptySheets">
                <i class="bi bi-journal-plus"></i>
                <p>Chưa có trang nào</p>
                <button class="btn btn-primary btn-sm" onclick="createNewSheet()">
                    Tạo trang đầu tiên
                </button>
            </div>
        `;
        return;
    }

    // Render sheets list
    const sortedSheets = sheetIds
        .map(id => ({ id, ...AppState.sheets[id] }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    container.innerHTML = sortedSheets.map(sheet => `
        <div class="sheet-item ${sheet.id === AppState.activeSheetId ? 'active' : ''}"
             data-sheet-id="${sheet.id}">
            <div class="sheet-item-info">
                <div class="sheet-item-name">📄 ${escapeHtml(sheet.name || 'Chưa đặt tên')}</div>
                <div class="sheet-item-meta">${formatDate(sheet.createdAt)} • ${(sheet.items || []).length} SP</div>
            </div>
            <div class="sheet-item-actions">
                <button data-action="edit" data-sheet-id="${sheet.id}" title="Đổi tên">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn-delete" data-action="delete" data-sheet-id="${sheet.id}" title="Xóa">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function selectSheet(sheetId) {
    console.log('[APP] selectSheet called with:', sheetId);

    if (!sheetId) {
        console.warn('[APP] No sheet ID provided');
        return;
    }

    if (!AppState.sheets[sheetId]) {
        console.warn('[APP] Sheet not found in AppState.sheets:', sheetId);
        return;
    }

    // Update both local state and pending state
    AppState.activeSheetId = sheetId;
    AppState.pendingActiveSheetId = sheetId;
    console.log('[APP] Set activeSheetId to:', sheetId);

    // Save to Firebase - this will sync to all other tabs
    const activePath = getUserPath(FIREBASE_PATHS.ACTIVE_SHEET);
    AppState.database.ref(activePath).set(sheetId)
        .then(() => {
            console.log('[APP] Active sheet saved to Firebase:', sheetId);
        })
        .catch((error) => {
            console.error('[APP] Error saving active sheet to Firebase:', error);
        });

    renderSheetsList();
    renderSheetContent();
    closePanels();
}

function showNoSheetSelected() {
    const noSheet = document.getElementById('noSheetSelected');
    const sheetContent = document.getElementById('sheetContent');
    if (noSheet) noSheet.style.display = 'flex';
    if (sheetContent) sheetContent.style.display = 'none';
}

function renderSheetContent() {
    console.log('[APP] renderSheetContent called');
    console.log('[APP] activeSheetId:', AppState.activeSheetId);
    console.log('[APP] sheet data:', AppState.sheets[AppState.activeSheetId]);

    if (!AppState.activeSheetId || !AppState.sheets[AppState.activeSheetId]) {
        console.log('[APP] No active sheet, showing empty state');
        showNoSheetSelected();
        return;
    }

    const noSheetEl = document.getElementById('noSheetSelected');
    const sheetContentEl = document.getElementById('sheetContent');

    console.log('[APP] Elements found:', { noSheetEl: !!noSheetEl, sheetContentEl: !!sheetContentEl });

    if (noSheetEl) noSheetEl.style.display = 'none';
    if (sheetContentEl) sheetContentEl.style.display = 'block';

    const sheet = AppState.sheets[AppState.activeSheetId];
    console.log('[APP] Rendering sheet:', sheet.name);

    const titleEl = document.getElementById('sheetTitle');
    const createdEl = document.getElementById('sheetCreatedAt');
    const countEl = document.getElementById('itemCount');

    if (titleEl) titleEl.textContent = sheet.name || 'Chưa đặt tên';
    if (createdEl) createdEl.textContent = formatDate(sheet.createdAt);
    if (countEl) countEl.textContent = (sheet.items || []).length;

    renderProductsTable(sheet.items || []);
    loadSheetHistory(AppState.activeSheetId);

    console.log('[APP] renderSheetContent completed');
}

// =====================================================
// SHEET CRUD
// =====================================================

let editingSheetId = null;

function createNewSheet() {
    editingSheetId = null;
    document.getElementById('sheetModalTitle').innerHTML = '<i class="bi bi-journal-plus"></i> Tạo trang mới';
    document.getElementById('sheetNameInput').value = '';
    document.getElementById('sheetModalSaveBtn').innerHTML = '<i class="bi bi-check-lg"></i> Tạo';

    const modal = new bootstrap.Modal(document.getElementById('sheetModal'));
    modal.show();

    setTimeout(() => {
        document.getElementById('sheetNameInput').focus();
    }, 300);
}

function editSheetName() {
    if (!AppState.activeSheetId) return;
    editSheetNameById(AppState.activeSheetId);
}

function editSheetNameById(sheetId) {
    editingSheetId = sheetId;
    const sheet = AppState.sheets[sheetId];

    document.getElementById('sheetModalTitle').innerHTML = '<i class="bi bi-pencil"></i> Đổi tên trang';
    document.getElementById('sheetNameInput').value = sheet?.name || '';
    document.getElementById('sheetModalSaveBtn').innerHTML = '<i class="bi bi-check-lg"></i> Lưu';

    const modal = new bootstrap.Modal(document.getElementById('sheetModal'));
    modal.show();

    setTimeout(() => {
        const input = document.getElementById('sheetNameInput');
        input.focus();
        input.select();
    }, 300);
}

async function saveSheet() {
    const nameInput = document.getElementById('sheetNameInput');
    const name = nameInput.value.trim();

    if (!name) {
        nameInput.classList.add('is-invalid');
        return;
    }

    nameInput.classList.remove('is-invalid');
    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);

        if (editingSheetId) {
            // Update existing
            const updates = {};
            updates[`${sheetsPath}/${editingSheetId}/name`] = name;
            updates[`${sheetsPath}/${editingSheetId}/updatedAt`] = Date.now();
            await AppState.database.ref().update(updates);

            await logHistory(editingSheetId, 'edit', `Đổi tên thành "${name}"`);
            showToast('Đã cập nhật tên trang', 'success');
        } else {
            // Create new
            const newSheetId = 'sheet_' + Date.now();
            const newSheet = {
                id: newSheetId,
                name: name,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                items: []
            };

            const updates = {};
            updates[`${sheetsPath}/${newSheetId}`] = newSheet;
            updates[getUserPath(FIREBASE_PATHS.ACTIVE_SHEET)] = newSheetId;
            await AppState.database.ref().update(updates);

            // Update both local state and pending state
            AppState.activeSheetId = newSheetId;
            AppState.pendingActiveSheetId = newSheetId;
            showToast('Đã tạo trang mới', 'success');
        }

        bootstrap.Modal.getInstance(document.getElementById('sheetModal'))?.hide();
    } catch (error) {
        console.error('[APP] Error saving sheet:', error);
        showToast('Lỗi lưu trang', 'error');
        updateSyncStatus('error');
    }
}

let deletingSheetId = null;

function deleteSheet(sheetId) {
    deletingSheetId = sheetId;
    const sheet = AppState.sheets[sheetId];
    document.getElementById('deleteSheetName').textContent = sheet?.name || 'này';

    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    modal.show();
}

function deleteCurrentSheet() {
    if (!AppState.activeSheetId) return;
    deleteSheet(AppState.activeSheetId);
}

async function confirmDeleteSheet() {
    if (!deletingSheetId) return;

    updateSyncStatus('syncing');

    try {
        const updates = {};
        updates[`${getUserPath(FIREBASE_PATHS.SHEETS)}/${deletingSheetId}`] = null;
        updates[`${getUserPath(FIREBASE_PATHS.HISTORY)}/${deletingSheetId}`] = null;

        if (deletingSheetId === AppState.activeSheetId) {
            updates[getUserPath(FIREBASE_PATHS.ACTIVE_SHEET)] = null;
            AppState.activeSheetId = null;
            AppState.pendingActiveSheetId = null;
        }

        await AppState.database.ref().update(updates);
        showToast('Đã xóa trang', 'success');

        bootstrap.Modal.getInstance(document.getElementById('deleteModal'))?.hide();
    } catch (error) {
        console.error('[APP] Error deleting sheet:', error);
        showToast('Lỗi xóa trang', 'error');
        updateSyncStatus('error');
    }

    deletingSheetId = null;
}

// =====================================================
// PRODUCTS TABLE
// =====================================================

function renderProductsTable(items) {
    const tbody = document.getElementById('productsTableBody');
    const emptyTable = document.getElementById('emptyTable');
    const tableFoot = document.getElementById('tableFoot');

    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = '';
        if (emptyTable) emptyTable.style.display = 'block';
        if (tableFoot) tableFoot.style.display = 'none';
        return;
    }

    if (emptyTable) emptyTable.style.display = 'none';
    if (tableFoot) tableFoot.style.display = 'table-footer-group';

    tbody.innerHTML = items.map((item, index) => `
        <tr data-index="${index}">
            <td>
                <div class="product-cell">
                    ${item.imageUrl
            ? `<img src="${item.imageUrl}" class="product-cell-image" alt="" onerror="this.outerHTML='<div class=\\'product-cell-placeholder\\'>📦</div>'">`
            : '<div class="product-cell-placeholder">📦</div>'
        }
                    <div class="product-cell-info">
                        <div class="product-cell-name">${escapeHtml(item.productName || 'Sản phẩm')}</div>
                        <div class="product-cell-code">Mã: ${escapeHtml(item.productCode || '--')}</div>
                    </div>
                </div>
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.qtyLive || 0}"
                       min="0" data-index="${index}" data-field="qtyLive">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.qtyInbox || 0}"
                       min="0" data-index="${index}" data-field="qtyInbox">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.sentToNCC || 0}"
                       min="0" data-index="${index}" data-field="sentToNCC">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.receivedIB || 0}"
                       min="0" data-index="${index}" data-field="receivedIB">
            </td>
            <td class="text-center">
                <input type="number" class="qty-input" value="${item.teamIB || 0}"
                       min="0" data-index="${index}" data-field="teamIB">
            </td>
            <td class="text-center">
                <button class="btn-delete-row" data-index="${index}" title="Xóa">
                    <i class="bi bi-x-lg"></i>
                </button>
            </td>
        </tr>
    `).join('');

    updateTotals(items);
}

function updateTotals(items) {
    let totalLive = 0, totalInbox = 0, totalSentNCC = 0, totalReceivedIB = 0, totalTeamIB = 0;

    items.forEach(item => {
        totalLive += parseInt(item.qtyLive) || 0;
        totalInbox += parseInt(item.qtyInbox) || 0;
        totalSentNCC += parseInt(item.sentToNCC) || 0;
        totalReceivedIB += parseInt(item.receivedIB) || 0;
        totalTeamIB += parseInt(item.teamIB) || 0;
    });

    const el = (id, val) => {
        const e = document.getElementById(id);
        if (e) e.textContent = val;
    };

    el('totalLive', totalLive);
    el('totalInbox', totalInbox);
    el('totalSentNCC', totalSentNCC);
    el('totalReceivedIB', totalReceivedIB);
    el('totalTeamIB', totalTeamIB);
}

// =====================================================
// ITEM CRUD
// =====================================================

async function addProductToSheet(product) {
    if (!AppState.activeSheetId) {
        showToast('Vui lòng chọn trang trước', 'warning');
        return;
    }

    const sheet = AppState.sheets[AppState.activeSheetId];
    if (!sheet) return;

    const items = [...(sheet.items || [])];

    const exists = items.some(item => item.productCode === product.code);
    if (exists) {
        showToast('Sản phẩm đã có trong danh sách', 'warning');
        return;
    }

    showToast('Đang thêm sản phẩm...', 'info');

    // Fetch product with image from TPOS API
    let imageUrl = '';
    if (product.id) {
        const productData = await fetchProductWithImage(product.id);
        if (productData && productData.imageUrl) {
            imageUrl = productData.imageUrl;
        }
    }

    const newItem = {
        id: 'item_' + Date.now(),
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        imageUrl: imageUrl || '',
        qtyLive: 0,
        qtyInbox: 0,
        sentToNCC: 0,
        receivedIB: 0,
        teamIB: 0,
        addedAt: Date.now()
    };

    items.push(newItem);
    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        const updates = {};
        updates[`${sheetsPath}/${AppState.activeSheetId}/items`] = items;
        updates[`${sheetsPath}/${AppState.activeSheetId}/updatedAt`] = Date.now();
        await AppState.database.ref().update(updates);

        await logHistory(AppState.activeSheetId, 'add', `Thêm ${product.code || product.name}`);
        showToast('Đã thêm sản phẩm', 'success');

        document.getElementById('productSearch').value = '';
        hideSuggestions();
    } catch (error) {
        console.error('[APP] Error adding product:', error);
        showToast('Lỗi thêm sản phẩm', 'error');
        updateSyncStatus('error');
    }
}

async function updateItemQty(index, field, value) {
    if (!AppState.activeSheetId) return;

    const sheet = AppState.sheets[AppState.activeSheetId];
    if (!sheet || !sheet.items || !sheet.items[index]) return;

    const oldValue = sheet.items[index][field] || 0;
    const newValue = parseInt(value) || 0;

    if (oldValue === newValue) return;

    // Debounce saves
    clearTimeout(AppState.saveDebounceTimer);
    AppState.saveDebounceTimer = setTimeout(async () => {
        updateSyncStatus('syncing');

        try {
            const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
            const updates = {};
            updates[`${sheetsPath}/${AppState.activeSheetId}/items/${index}/${field}`] = newValue;
            updates[`${sheetsPath}/${AppState.activeSheetId}/updatedAt`] = Date.now();
            await AppState.database.ref().update(updates);

            const fieldNames = {
                qtyLive: 'SL Live',
                qtyInbox: 'SL Inbox',
                sentToNCC: 'Gửi NCC',
                receivedIB: 'Nhận IB',
                teamIB: 'Team IB'
            };
            await logHistory(AppState.activeSheetId, 'edit',
                `${sheet.items[index].productCode}: ${fieldNames[field]} ${oldValue} → ${newValue}`);
        } catch (error) {
            console.error('[APP] Error updating item:', error);
            showToast('Lỗi cập nhật', 'error');
            updateSyncStatus('error');
        }
    }, 500);
}

async function deleteItem(index) {
    if (!AppState.activeSheetId) return;

    const sheet = AppState.sheets[AppState.activeSheetId];
    if (!sheet || !sheet.items || !sheet.items[index]) return;

    const deletedItem = sheet.items[index];
    const items = [...sheet.items];
    items.splice(index, 1);

    updateSyncStatus('syncing');

    try {
        const sheetsPath = getUserPath(FIREBASE_PATHS.SHEETS);
        const updates = {};
        updates[`${sheetsPath}/${AppState.activeSheetId}/items`] = items;
        updates[`${sheetsPath}/${AppState.activeSheetId}/updatedAt`] = Date.now();
        await AppState.database.ref().update(updates);

        await logHistory(AppState.activeSheetId, 'delete', `Xóa ${deletedItem.productName}`);
        showToast('Đã xóa sản phẩm', 'success');
    } catch (error) {
        console.error('[APP] Error deleting item:', error);
        showToast('Lỗi xóa sản phẩm', 'error');
        updateSyncStatus('error');
    }
}

// =====================================================
// PRODUCT SEARCH (TPOS) - Copy from tab3-product-assignment
// =====================================================

// Token state
let bearerToken = null;
let tokenExpiry = null;

// Auth Functions - Server-side token caching
async function getAuthToken() {
    try {
        const response = await API_CONFIG.smartFetch(`${API_CONFIG.WORKER_URL}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=password&username=nvkt&password=Aa%40123456789&client_id=tmtWebApp'
        });

        if (!response.ok) {
            throw new Error('Không thể xác thực');
        }

        const data = await response.json();
        bearerToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);
        console.log('[APP] ✅ Token received');

        return data.access_token;
    } catch (error) {
        console.error('[APP] Lỗi xác thực:', error);
        throw error;
    }
}

async function getValidToken() {
    if (bearerToken && tokenExpiry && tokenExpiry > Date.now() + 300000) {
        console.log('[APP] ✅ Using cached token');
        return bearerToken;
    }
    console.log('[APP] Token expired, fetching new token...');
    return await getAuthToken();
}

async function authenticatedFetch(url, options = {}) {
    const token = await getValidToken();
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        const newToken = await getAuthToken();
        headers.Authorization = `Bearer ${newToken}`;
        return fetch(url, { ...options, headers });
    }

    return response;
}

// Load Products Data
async function loadProductsData() {
    if (AppState.isLoadingProducts) return;
    if (AppState.productsData.length > 0) {
        console.log('[APP] Products already loaded:', AppState.productsData.length);
        return;
    }

    AppState.isLoadingProducts = true;
    console.log('[APP] Loading products from TPOS...');

    try {
        const response = await authenticatedFetch(`${API_CONFIG.WORKER_URL}/api/Product/ExportFileWithVariantPrice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: { Active: "true" },
                ids: ""
            })
        });

        if (!response.ok) {
            throw new Error('Không thể tải dữ liệu sản phẩm');
        }

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        AppState.productsData = jsonData.map(row => {
            const productName = row['Tên sản phẩm'] || '';
            const codeFromName = extractProductCode(productName);
            return {
                id: row['Id sản phẩm (*)'],
                name: productName,
                nameNoSign: removeVietnameseTones(productName || ''),
                code: codeFromName || row['Mã sản phẩm'] || ''
            };
        }).filter(p => p.name);

        console.log('[APP] ✅ Loaded', AppState.productsData.length, 'products');
    } catch (error) {
        console.error('[APP] Error loading products:', error);
        showToast('Lỗi tải sản phẩm: ' + error.message, 'error');
    } finally {
        AppState.isLoadingProducts = false;
    }
}

function extractProductCode(nameGet) {
    if (!nameGet) return '';
    const match = nameGet.match(/\[([^\]]+)\]/);
    return match ? match[1] : '';
}

// Fetch product with image from TPOS API
async function fetchProductWithImage(productId) {
    try {
        const response = await authenticatedFetch(
            `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$select=Id,NameGet,ImageUrl,ProductTmplId,DefaultCode,Barcode`
        );

        if (!response.ok) return null;

        const productData = await response.json();
        let imageUrl = productData.ImageUrl;

        // If no image, try to get from template
        if (!imageUrl && productData.ProductTmplId) {
            try {
                const templateResponse = await authenticatedFetch(
                    `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$select=Id,ImageUrl`
                );
                if (templateResponse.ok) {
                    const templateData = await templateResponse.json();
                    imageUrl = templateData.ImageUrl;
                }
            } catch (e) {
                console.warn('[APP] Could not fetch template image');
            }
        }

        return {
            id: productData.Id,
            name: productData.NameGet,
            code: extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '',
            imageUrl: imageUrl || ''
        };
    } catch (error) {
        console.error('[APP] Error fetching product:', error);
        return null;
    }
}

function searchProducts(keyword) {
    if (!keyword || keyword.length < 2) return [];

    const searchNoSign = removeVietnameseTones(keyword.toLowerCase());

    return AppState.productsData
        .filter(product => {
            const matchName = (product.nameNoSign || '').toLowerCase().includes(searchNoSign);
            const matchCode = product.code && product.code.toLowerCase().includes(keyword.toLowerCase());
            return matchName || matchCode;
        })
        .slice(0, 10);
}

function removeVietnameseTones(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

// =====================================================
// SEARCH UI
// =====================================================

async function handleSearch(keyword) {
    const dropdown = document.getElementById('suggestionsDropdown');
    const loadingEl = document.getElementById('searchLoading');

    if (!keyword || keyword.length < 2) {
        hideSuggestions();
        return;
    }

    // Load products if not loaded yet
    if (AppState.productsData.length === 0 && !AppState.isLoadingProducts) {
        if (loadingEl) loadingEl.style.display = 'block';
        await loadProductsData();
        if (loadingEl) loadingEl.style.display = 'none';
    }

    // Still no products (load failed), show error
    if (AppState.productsData.length === 0) {
        dropdown.innerHTML = `
            <div class="suggestion-item" style="justify-content: center; color: var(--danger);">
                <i class="bi bi-exclamation-circle"></i> Lỗi tải danh sách sản phẩm
            </div>
        `;
        dropdown.classList.add('show');
        return;
    }

    const results = searchProducts(keyword);

    if (results.length === 0) {
        dropdown.innerHTML = `
            <div class="suggestion-item" style="justify-content: center; color: var(--gray-500);">
                <i class="bi bi-search"></i> Không tìm thấy sản phẩm
            </div>
        `;
        dropdown.classList.add('show');
        return;
    }

    dropdown.innerHTML = results.map(product => `
        <div class="suggestion-item" data-product='${JSON.stringify(product).replace(/'/g, "&#39;")}'>
            <div class="suggestion-placeholder">📦</div>
            <div class="suggestion-info">
                <div class="suggestion-name">${escapeHtml(product.name)}</div>
                <div class="suggestion-code">Mã: ${escapeHtml(product.code)}</div>
            </div>
        </div>
    `).join('');

    dropdown.classList.add('show');
}

function hideSuggestions() {
    const dropdown = document.getElementById('suggestionsDropdown');
    if (dropdown) dropdown.classList.remove('show');
}

// =====================================================
// HISTORY
// =====================================================

async function logHistory(sheetId, action, description) {
    try {
        const historyPath = getUserPath(FIREBASE_PATHS.HISTORY);
        const historyId = 'h_' + Date.now();

        await AppState.database.ref(`${historyPath}/${sheetId}/${historyId}`).set({
            id: historyId,
            action: action,
            description: description,
            timestamp: Date.now(),
            // Add user information
            user: getDisplayUsername(),
            userId: AppState.userIdentifier || 'unknown'
        });
    } catch (error) {
        console.error('[APP] Error logging history:', error);
    }
}

function loadSheetHistory(sheetId) {
    const historyPath = getUserPath(FIREBASE_PATHS.HISTORY);

    AppState.database.ref(`${historyPath}/${sheetId}`)
        .orderByChild('timestamp')
        .limitToLast(50)
        .on('value', (snapshot) => {
            renderHistory(snapshot.val());
        });
}

function renderHistory(historyData) {
    const container = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');

    if (!container) return;

    if (!historyData) {
        container.innerHTML = '';
        if (emptyHistory) {
            emptyHistory.style.display = 'block';
            container.appendChild(emptyHistory);
        }
        return;
    }

    if (emptyHistory) emptyHistory.style.display = 'none';

    const items = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

    container.innerHTML = items.map(item => {
        const icons = { add: 'bi-plus-circle', edit: 'bi-pencil', delete: 'bi-trash' };
        const titles = { add: 'Thêm mới', edit: 'Chỉnh sửa', delete: 'Xóa' };
        const userName = item.user || 'Không rõ';

        return `
            <div class="history-item ${item.action}">
                <div class="history-icon">
                    <i class="bi ${icons[item.action] || 'bi-clock'}"></i>
                </div>
                <div class="history-content">
                    <div class="history-title">${titles[item.action] || item.action}</div>
                    <div class="history-desc">${escapeHtml(item.description)}</div>
                    <div class="history-meta">
                        <span class="history-user"><i class="bi bi-person"></i> ${escapeHtml(userName)}</span>
                        <span class="history-time"><i class="bi bi-clock"></i> ${formatDateTime(item.timestamp)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// UI HELPERS
// =====================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar?.classList.toggle('show');
    overlay?.classList.toggle('show');
}

function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const overlay = document.getElementById('overlay');
    panel?.classList.toggle('show');
    overlay?.classList.toggle('show');
}

function closePanels() {
    document.getElementById('sidebar')?.classList.remove('show');
    document.getElementById('historyPanel')?.classList.remove('show');
    document.getElementById('overlay')?.classList.remove('show');
}

function updateSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;

    el.classList.remove('syncing', 'error');

    switch (status) {
        case 'syncing':
            el.classList.add('syncing');
            el.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Đang đồng bộ...</span>';
            break;
        case 'error':
            el.classList.add('error');
            el.innerHTML = '<i class="bi bi-exclamation-circle"></i><span>Lỗi đồng bộ</span>';
            break;
        default:
            el.innerHTML = '<i class="bi bi-cloud-check"></i><span>Đã đồng bộ</span>';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastId = 'toast_' + Date.now();
    const icons = {
        success: 'bi-check-circle',
        error: 'bi-x-circle',
        warning: 'bi-exclamation-circle',
        info: 'bi-info-circle'
    };

    const html = `
        <div id="${toastId}" class="toast toast-${type}" role="alert">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="bi ${icons[type]}"></i>
                ${escapeHtml(message)}
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function viewImage(url) {
    window.open(url, '_blank');
}

// =====================================================
// UTILITIES
// =====================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// =====================================================
// EXPOSE FUNCTIONS TO WINDOW
// =====================================================

window.selectSheet = selectSheet;
window.createNewSheet = createNewSheet;
window.editSheetName = editSheetName;
window.editSheetNameById = editSheetNameById;
window.saveSheet = saveSheet;
window.deleteSheet = deleteSheet;
window.deleteCurrentSheet = deleteCurrentSheet;
window.confirmDeleteSheet = confirmDeleteSheet;
window.addProductToSheet = addProductToSheet;
window.updateItemQty = updateItemQty;
window.deleteItem = deleteItem;
window.toggleSidebar = toggleSidebar;
window.toggleHistoryPanel = toggleHistoryPanel;
window.closePanels = closePanels;
window.viewImage = viewImage;

console.log('[APP] Sổ Order Live app.js loaded');
