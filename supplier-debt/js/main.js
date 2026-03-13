/**
 * Supplier Debt Report - Main JavaScript
 * Công nợ nhà cung cấp
 */

// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
    API_BASE: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata',
    API_BASE_PARTNER: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',
    ENDPOINT: 'Report/PartnerDebtReport',
    RESULT_SELECTION: 'supplier',
    DEFAULT_PAGE_SIZE: 1000,
    DETAIL_PAGE_SIZE: 20,
    COLUMN_VISIBILITY_KEY: 'supplierDebt_columnVisibility',
    FIREBASE_COLLECTION: 'supplier_debt_notes'
};

// =====================================================
// AUTHENTICATED FETCH HELPER (401 retry via TokenManager)
// =====================================================

async function tposFetch(url, options = {}) {
    return window.tokenManager.authenticatedFetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'tposappversion': '6.2.6.1',
            ...options.headers
        }
    });
}

// =====================================================
// PERMISSION HELPERS
// =====================================================

function hasSupplierDebtPermission(action) {
    return window.authManager?.hasDetailedPermission?.('supplier-debt', action) ?? true;
}

function canEditNoteForMoveName(moveName) {
    if (/^BILL\//.test(moveName)) {
        return hasSupplierDebtPermission('editNoteBill');
    }
    if (/^(CSH2|CSH|BANK|TK)\//.test(moveName)) {
        return hasSupplierDebtPermission('editNotePayment');
    }
    // Other move types: allow if user has either permission
    return hasSupplierDebtPermission('editNoteBill') || hasSupplierDebtPermission('editNotePayment');
}

// =====================================================
// WEB NOTES STORAGE (Firebase)
// =====================================================

const WebNotesStore = {
    _data: new Map(),
    _isListening: false,
    _unsubscribe: null,

    // Generate key from supplier code and MoveName (Bút toán)
    _makeKey(supplierCode, moveName) {
        // moveName is unique (e.g., BILL/2026/0485, CSH2/2026/0018)
        return `${supplierCode}_${moveName.replace(/\//g, '-')}`;
    },

    // Get Firestore document reference
    _getDocRef() {
        // Use window.db (set by firebase-config.js) or try getFirestore()
        const db = window.db || (typeof getFirestore === 'function' ? getFirestore() : null);
        if (!db) {
            console.error('[WebNotesStore] Firebase not initialized');
            return null;
        }
        return db.collection(CONFIG.FIREBASE_COLLECTION).doc('notes');
    },

    // Initialize store
    async init() {
        console.log('[WebNotesStore] Initializing...');

        // Load from localStorage first (cache)
        this._loadFromLocalStorage();

        // Then load from Firestore (source of truth)
        await this._loadFromFirestore();

        // Setup real-time listener
        this._setupRealtimeListener();

        console.log('[WebNotesStore] Initialized with', this._data.size, 'notes');
    },

    _loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('supplierDebt_webNotes');
            if (saved) {
                const parsed = JSON.parse(saved);
                this._data = new Map(Object.entries(parsed));
            }
        } catch (e) {
            console.error('[WebNotesStore] Error loading from localStorage:', e);
        }
    },

    _saveToLocalStorage() {
        try {
            const obj = Object.fromEntries(this._data);
            localStorage.setItem('supplierDebt_webNotes', JSON.stringify(obj));
        } catch (e) {
            console.error('[WebNotesStore] Error saving to localStorage:', e);
        }
    },

    async _loadFromFirestore() {
        const docRef = this._getDocRef();
        if (!docRef) return false;

        try {
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                if (data && data.notes) {
                    this._data = new Map(Object.entries(data.notes));
                    this._saveToLocalStorage();
                }
            }
            return true;
        } catch (e) {
            console.error('[WebNotesStore] Error loading from Firestore:', e);
            return false;
        }
    },

    async _saveToFirestore() {
        const docRef = this._getDocRef();
        if (!docRef) return;

        try {
            await docRef.set({
                notes: Object.fromEntries(this._data),
                lastUpdated: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error('[WebNotesStore] Error saving to Firestore:', e);
        }
    },

    _setupRealtimeListener() {
        const docRef = this._getDocRef();
        if (!docRef) return;

        this._unsubscribe = docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data && data.notes) {
                    this._isListening = true;
                    this._data = new Map(Object.entries(data.notes));
                    this._saveToLocalStorage();
                    this._isListening = false;
                }
            }
        }, (error) => {
            console.error('[WebNotesStore] Realtime listener error:', error);
        });
    },

    // Get note text for a supplier code and moveName (Bút toán)
    get(supplierCode, moveName) {
        const key = this._makeKey(supplierCode, moveName);
        const data = this._data.get(key);
        // Support both old format (string) and new format (object with note/history)
        if (!data) return '';
        if (typeof data === 'string') return data;
        return data.note || '';
    },

    // Get note history for a supplier code and moveName
    getHistory(supplierCode, moveName) {
        const key = this._makeKey(supplierCode, moveName);
        const data = this._data.get(key);
        if (!data) return [];
        if (typeof data === 'string') return []; // Old format has no history
        return data.history || [];
    },

    // Set note for a supplier code and moveName (Bút toán)
    async set(supplierCode, moveName, note) {
        const key = this._makeKey(supplierCode, moveName);
        const existingData = this._data.get(key);
        const oldNote = typeof existingData === 'string' ? existingData : (existingData?.note || '');
        const oldHistory = typeof existingData === 'string' ? [] : (existingData?.history || []);

        const newHistory = [...oldHistory];

        if (note && note.trim()) {
            // Add old note to history if it exists and is different
            if (oldNote && oldNote !== note.trim()) {
                newHistory.unshift({
                    text: oldNote,
                    timestamp: Date.now()
                });
            }

            // Keep only last 10 history items
            if (newHistory.length > 10) {
                newHistory.pop();
            }

            this._data.set(key, {
                note: note.trim(),
                history: newHistory
            });
        } else if (oldNote) {
            // Note is being deleted - add "Xóa ghi chú" to history
            newHistory.unshift({
                text: `Xóa ghi chú "${oldNote}"`,
                timestamp: Date.now(),
                isDeleted: true
            });

            // Keep only last 10 history items
            if (newHistory.length > 10) {
                newHistory.pop();
            }

            this._data.set(key, {
                note: '',
                history: newHistory
            });
        } else {
            // No old note and no new note - nothing to do
            return;
        }

        this._saveToLocalStorage();

        if (!this._isListening) {
            await this._saveToFirestore();
        }
    },

    // Delete note
    async delete(supplierCode, moveName) {
        const key = this._makeKey(supplierCode, moveName);
        this._data.delete(key);
        this._saveToLocalStorage();

        const docRef = this._getDocRef();
        if (docRef && !this._isListening) {
            try {
                await docRef.update({
                    [`notes.${key}`]: firebase.firestore.FieldValue.delete(),
                    lastUpdated: Date.now()
                });
            } catch (e) {
                console.error('[WebNotesStore] Error deleting from Firestore:', e);
            }
        }
    }
};

// =====================================================
// SUPPLIER NOTES STORAGE (Firebase) - per-supplier notes
// =====================================================

const SupplierNotesStore = {
    _data: new Map(),
    _unsubscribe: null,
    _isListening: false,
    COLLECTION: 'supplier_debt_supplier_notes',

    _getDocRef() {
        const db = window.db || (typeof getFirestore === 'function' ? getFirestore() : null);
        if (!db) return null;
        return db.collection(this.COLLECTION).doc('notes');
    },

    async init() {
        // Load from localStorage cache
        try {
            const saved = localStorage.getItem('supplierDebt_supplierNotes');
            if (saved) this._data = new Map(Object.entries(JSON.parse(saved)));
        } catch (e) { /* ignore */ }

        // Load from Firestore
        const docRef = this._getDocRef();
        if (docRef) {
            try {
                const doc = await docRef.get();
                if (doc.exists && doc.data()?.notes) {
                    this._data = new Map(Object.entries(doc.data().notes));
                    this._saveLocal();
                }
            } catch (e) { console.error('[SupplierNotesStore] Firestore load error:', e); }

            // Real-time listener
            this._unsubscribe = docRef.onSnapshot((doc) => {
                if (doc.exists && doc.data()?.notes) {
                    this._isListening = true;
                    this._data = new Map(Object.entries(doc.data().notes));
                    this._saveLocal();
                    this._isListening = false;
                }
            }, (err) => console.error('[SupplierNotesStore] Listener error:', err));
        }
        console.log('[SupplierNotesStore] Initialized with', this._data.size, 'notes');
    },

    _saveLocal() {
        try { localStorage.setItem('supplierDebt_supplierNotes', JSON.stringify(Object.fromEntries(this._data))); } catch (e) { /* ignore */ }
    },

    get(supplierCode) {
        return this._data.get(supplierCode) || '';
    },

    async set(supplierCode, note) {
        if (note && note.trim()) {
            this._data.set(supplierCode, note.trim());
        } else {
            this._data.delete(supplierCode);
        }
        this._saveLocal();

        const docRef = this._getDocRef();
        if (docRef && !this._isListening) {
            try {
                if (note && note.trim()) {
                    await docRef.set({ notes: Object.fromEntries(this._data), lastUpdated: Date.now() }, { merge: true });
                } else {
                    await docRef.update({ [`notes.${supplierCode}`]: firebase.firestore.FieldValue.delete(), lastUpdated: Date.now() });
                }
            } catch (e) { console.error('[SupplierNotesStore] Save error:', e); }
        }
    }
};

// Column definitions for visibility toggle
const COLUMNS = [
    { id: 'code', index: 1, label: 'Mã NCC' },
    { id: 'name', index: 2, label: 'Tên NCC' },
    { id: 'debit', index: 3, label: 'Phát sinh' },
    { id: 'credit', index: 4, label: 'Thanh toán' },
    { id: 'end', index: 5, label: 'Nợ cuối kỳ' }
];

// =====================================================
// STATE
// =====================================================

const State = {
    data: [],
    filteredData: [],
    allSuppliers: [],
    currentPage: 1,
    pageSize: CONFIG.DEFAULT_PAGE_SIZE,
    totalCount: 0,
    isLoading: false,
    dateFrom: null,
    dateTo: null,
    display: 'all',
    selectedSupplier: '',
    // Expanded row state
    expandedRows: new Map(), // partnerId -> { congNo, info, invoices, debtDetails, activeTab, ... }
    // Column visibility state
    columnVisibility: {
        code: true,
        name: true,
        debit: true,
        credit: true,
        end: true
    }
};

// =====================================================
// DOM ELEMENTS
// =====================================================

const DOM = {
    get dateFromDisplay() { return document.getElementById('dateFromDisplay'); },
    get dateFrom() { return document.getElementById('dateFrom'); },
    get dateToDisplay() { return document.getElementById('dateToDisplay'); },
    get dateTo() { return document.getElementById('dateTo'); },
    get displayRadios() { return document.querySelectorAll('input[name="display"]'); },
    get supplierFilter() { return document.getElementById('supplierFilter'); },
    get clearSupplier() { return document.getElementById('clearSupplier'); },
    get btnSearch() { return document.getElementById('btnSearch'); },
    get btnExport() { return document.getElementById('btnExport'); },
    get btnRefresh() { return document.getElementById('btnRefresh'); },
    get loadingIndicator() { return document.getElementById('loadingIndicator'); },
    get tableBody() { return document.getElementById('tableBody'); },
    get totalDebit() { return document.getElementById('totalDebit'); },
    get totalCredit() { return document.getElementById('totalCredit'); },
    get totalEnd() { return document.getElementById('totalEnd'); },
    get pageNumbers() { return document.getElementById('pageNumbers'); },
    get pageSize() { return document.getElementById('pageSize'); },
    get pageInfo() { return document.getElementById('pageInfo'); },
    get btnFirst() { return document.getElementById('btnFirst'); },
    get btnPrev() { return document.getElementById('btnPrev'); },
    get btnNext() { return document.getElementById('btnNext'); },
    get btnLast() { return document.getElementById('btnLast'); },
    get btnFilterToggle() { return document.getElementById('btnFilterToggle'); },
    get filterSection() { return document.getElementById('filterSection'); },
    get btnColumnToggle() { return document.getElementById('btnColumnToggle'); },
    get columnToggleDropdown() { return document.getElementById('columnToggleDropdown'); },
    get dataTable() { return document.getElementById('dataTable'); }
};

// =====================================================
// COLUMN VISIBILITY
// =====================================================

function loadColumnVisibility() {
    try {
        const saved = localStorage.getItem(CONFIG.COLUMN_VISIBILITY_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            State.columnVisibility = { ...State.columnVisibility, ...parsed };
        }
    } catch (e) {
        console.error('[SupplierDebt] Error loading column visibility:', e);
    }
}

function saveColumnVisibility() {
    try {
        localStorage.setItem(CONFIG.COLUMN_VISIBILITY_KEY, JSON.stringify(State.columnVisibility));
    } catch (e) {
        console.error('[SupplierDebt] Error saving column visibility:', e);
    }
}

function applyColumnVisibility() {
    const table = DOM.dataTable;
    if (!table) return;

    COLUMNS.forEach(col => {
        const isVisible = State.columnVisibility[col.id];

        // Update all cells with this data-col attribute (header, body, footer)
        const cells = table.querySelectorAll(`[data-col="${col.id}"]`);
        cells.forEach(cell => {
            cell.classList.toggle('col-hidden', !isVisible);
        });

        // Update checkbox in dropdown
        const checkbox = document.getElementById(`col-${col.id}`);
        if (checkbox) {
            checkbox.checked = isVisible;
        }
    });
}

function toggleColumn(colId, isVisible) {
    State.columnVisibility[colId] = isVisible;
    saveColumnVisibility();
    applyColumnVisibility();
}

function initColumnToggle() {
    // Load saved visibility
    loadColumnVisibility();

    // Toggle dropdown visibility
    DOM.btnColumnToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.columnToggleDropdown?.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.column-toggle-wrapper')) {
            DOM.columnToggleDropdown?.classList.remove('show');
        }
    });

    // Handle checkbox changes
    COLUMNS.forEach(col => {
        const checkbox = document.getElementById(`col-${col.id}`);
        if (checkbox) {
            checkbox.checked = State.columnVisibility[col.id];
            checkbox.addEventListener('change', (e) => {
                toggleColumn(col.id, e.target.checked);
            });
        }
    });

    // Apply initial visibility
    applyColumnVisibility();
}

// =====================================================
// UTILITIES
// =====================================================

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.round(num).toLocaleString('vi-VN');
}

function formatNumberWithDots(num) {
    if (num === null || num === undefined || num === 0) return '0';
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatPaymentAmountInput(input) {
    // Get cursor position
    const cursorPos = input.selectionStart;
    const oldLength = input.value.length;

    // Remove all non-digit characters
    let value = input.value.replace(/\D/g, '');

    // Format with dots as thousand separators
    if (value) {
        value = parseInt(value, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    input.value = value;

    // Adjust cursor position
    const newLength = input.value.length;
    const diff = newLength - oldLength;
    const newPos = cursorPos + diff;
    input.setSelectionRange(newPos, newPos);
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseVietnameseDate(dateStr) {
    // Parse dd/mm/yyyy format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return null;
}

function toISODateString(date, isEndOfDay = false) {
    const d = new Date(date);
    if (isEndOfDay) {
        d.setHours(23, 59, 59, 999);
    } else {
        d.setHours(0, 0, 0, 0);
    }
    return d.toISOString();
}

function getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getLastDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// =====================================================
// DATE INPUT HANDLING
// =====================================================

function initDateInputs() {
    // Set default dates (first and last day of current month)
    const firstDay = getFirstDayOfMonth();
    const lastDay = getLastDayOfMonth();

    State.dateFrom = firstDay;
    State.dateTo = lastDay;

    DOM.dateFromDisplay.value = formatDate(firstDay);
    DOM.dateToDisplay.value = formatDate(lastDay);

    // Sync display input with hidden datetime-local input
    DOM.dateFromDisplay.addEventListener('change', function() {
        const parsed = parseVietnameseDate(this.value);
        if (parsed) {
            State.dateFrom = parsed;
        }
    });

    DOM.dateToDisplay.addEventListener('change', function() {
        const parsed = parseVietnameseDate(this.value);
        if (parsed) {
            State.dateTo = parsed;
            State.dateTo.setHours(23, 59, 59, 999);
        }
    });

    // Handle hidden input clicks
    DOM.dateFrom.addEventListener('change', function() {
        if (this.value) {
            const date = new Date(this.value);
            State.dateFrom = date;
            DOM.dateFromDisplay.value = formatDate(date);
        }
    });

    DOM.dateTo.addEventListener('change', function() {
        if (this.value) {
            const date = new Date(this.value);
            date.setHours(23, 59, 59, 999);
            State.dateTo = date;
            DOM.dateToDisplay.value = formatDate(date);
        }
    });

    // Auto-format date input
    [DOM.dateFromDisplay, DOM.dateToDisplay].forEach(input => {
        input.addEventListener('input', function(e) {
            let value = this.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2);
            }
            if (value.length >= 5) {
                value = value.slice(0, 5) + '/' + value.slice(5, 9);
            }
            this.value = value;
        });
    });
}

// =====================================================
// API CALLS
// =====================================================

async function fetchData() {
    if (State.isLoading) return;

    State.isLoading = true;
    showLoading(true);

    try {
        // Build URL with parameters
        const params = new URLSearchParams();
        params.set('Display', State.display);
        params.set('DateFrom', toISODateString(State.dateFrom, false));
        params.set('DateTo', toISODateString(State.dateTo, true));
        params.set('ResultSelection', CONFIG.RESULT_SELECTION);
        params.set('$top', State.pageSize);
        params.set('$skip', (State.currentPage - 1) * State.pageSize);
        params.set('$count', 'true');
        params.set('$orderby', 'Code asc');

        const url = `${CONFIG.API_BASE}/${CONFIG.ENDPOINT}?${params.toString()}`;

        const response = await tposFetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        State.data = result.value || [];
        State.totalCount = result['@odata.count'] || 0;

        // Apply client-side filter for supplier
        applySupplierFilter();

        // Update supplier dropdown on first load
        if (State.allSuppliers.length === 0 && State.data.length > 0) {
            await fetchAllSuppliers();
        }

        renderTable();
        renderPagination();
        calculateTotals();

    } catch (error) {
        console.error('[SupplierDebt] Error fetching data:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi tải dữ liệu: ${error.message}`);
        }
        renderEmptyState();
    } finally {
        State.isLoading = false;
        showLoading(false);
    }
}

async function fetchAllSuppliers() {
    try {
        // Fetch all data to populate supplier dropdown (limited to 1000)
        const params = new URLSearchParams();
        params.set('Display', 'all');
        params.set('DateFrom', toISODateString(State.dateFrom, false));
        params.set('DateTo', toISODateString(State.dateTo, true));
        params.set('ResultSelection', CONFIG.RESULT_SELECTION);
        params.set('$top', '1000');

        const url = `${CONFIG.API_BASE}/${CONFIG.ENDPOINT}?${params.toString()}`;
        const response = await tposFetch(url);

        if (response.ok) {
            const result = await response.json();
            State.allSuppliers = (result.value || []).sort((a, b) =>
                (a.Code || '').localeCompare(b.Code || '', 'vi', { numeric: true })
            );
            populateSupplierDropdown();
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching suppliers:', error);
    }
}

function applySupplierFilter() {
    if (State.selectedSupplier) {
        State.filteredData = State.data.filter(item =>
            item.Code === State.selectedSupplier
        );
    } else {
        State.filteredData = [...State.data];
    }
    // Sort by Code A->Z with numeric sorting (B1, B2, B3... B10, MM...)
    State.filteredData.sort((a, b) =>
        (a.Code || '').localeCompare(b.Code || '', 'vi', { numeric: true })
    );
}

// =====================================================
// RENDERING
// =====================================================

function showLoading(show) {
    DOM.loadingIndicator.style.display = show ? 'flex' : 'none';
    DOM.tableBody.style.opacity = show ? '0.5' : '1';
}

function renderTable() {
    const tbody = DOM.tableBody;
    tbody.innerHTML = '';

    if (State.filteredData.length === 0) {
        renderEmptyState();
        return;
    }

    State.filteredData.forEach(item => {
        const partnerId = item.PartnerId;
        const isExpanded = State.expandedRows.has(partnerId);
        const rowState = State.expandedRows.get(partnerId);
        const activeTab = rowState?.activeTab || '';
        const supplierDisplay = `[${escapeHtml(item.Code || '')}] ${escapeHtml(item.PartnerName || '')}`;
        const endAmount = item.End || 0;

        // Main row
        const tr = document.createElement('tr');
        tr.className = 'data-row';
        tr.dataset.partnerId = partnerId;
        tr.innerHTML = `
            <td data-col="code" class="col-code-actions">
                <span class="supplier-code">${escapeHtml(item.Code || '')}</span>
                <span class="action-buttons">
                    ${hasSupplierDebtPermission('payment') ? `<button class="btn-action btn-action-payment" onclick="openPaymentModal(${partnerId}, '${supplierDisplay.replace(/'/g, "\\'")}', ${endAmount})" title="Thanh toán">💳</button>` : ''}
                    <button class="btn-action btn-action-expand ${isExpanded ? 'expanded' : ''}" onclick="toggleRowExpand(${partnerId}, this)" title="Mở rộng">▶</button>
                </span>
            </td>
            <td data-col="name">
                <div class="supplier-name-cell">
                    <span>${escapeHtml(item.PartnerName || '')}</span>
                    <button class="btn-supplier-note" onclick="openSupplierNoteEdit('${escapeHtml(item.Code || '')}', '${escapeHtml((item.PartnerName || '').replace(/'/g, "\\'"))}')" title="Ghi chú">
                        <i data-lucide="pencil" style="width: 12px; height: 12px;"></i>
                    </button>
                </div>
                ${(() => { const note = SupplierNotesStore.get(item.Code || ''); return note ? `<div class="supplier-note-preview">${escapeHtml(note)}</div>` : ''; })()}
            </td>
            <td data-col="debit" class="col-number">${formatNumber(item.Debit)}</td>
            <td data-col="credit" class="col-number">${formatNumber(item.Credit)}</td>
            <td data-col="end" class="col-number">${formatNumber(item.End)}</td>
        `;
        tbody.appendChild(tr);

        // Detail row (hidden by default)
        const detailTr = document.createElement('tr');
        detailTr.className = `detail-row ${isExpanded ? 'expanded' : ''}`;
        detailTr.id = `detail-row-${partnerId}`;
        detailTr.innerHTML = `
            <td colspan="5">
                <div class="detail-panel" id="detail-panel-${partnerId}">
                    ${isExpanded ? renderDetailPanel(partnerId) : ''}
                </div>
            </td>
        `;
        tbody.appendChild(detailTr);
    });

    // Re-render Lucide icons with delay to ensure DOM is ready
    setTimeout(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, 10);

    // Apply column visibility
    applyColumnVisibility();
}

function renderEmptyState() {
    DOM.tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                <i data-lucide="inbox"></i>
                <p>Không có dữ liệu</p>
            </td>
        </tr>
    `;
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function calculateTotals() {
    let totalDebit = 0, totalCredit = 0, totalEnd = 0;

    State.filteredData.forEach(item => {
        totalDebit += item.Debit || 0;
        totalCredit += item.Credit || 0;
        totalEnd += item.End || 0;
    });

    DOM.totalDebit.textContent = formatNumber(totalDebit);
    DOM.totalCredit.textContent = formatNumber(totalCredit);
    DOM.totalEnd.textContent = formatNumber(totalEnd);
}

function renderPagination() {
    const totalPages = Math.ceil(State.totalCount / State.pageSize);
    const currentPage = State.currentPage;

    // Update page info
    const start = State.totalCount > 0 ? (currentPage - 1) * State.pageSize + 1 : 0;
    const end = Math.min(currentPage * State.pageSize, State.totalCount);
    DOM.pageInfo.textContent = `${start} - ${end} của ${State.totalCount} dòng`;

    // Update navigation buttons
    DOM.btnFirst.disabled = currentPage <= 1;
    DOM.btnPrev.disabled = currentPage <= 1;
    DOM.btnNext.disabled = currentPage >= totalPages;
    DOM.btnLast.disabled = currentPage >= totalPages;

    // Render page numbers
    const pageNumbers = DOM.pageNumbers;
    pageNumbers.innerHTML = '';

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `btn-page ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => goToPage(i));
        pageNumbers.appendChild(btn);
    }
}

function populateSupplierDropdown() {
    const select = DOM.supplierFilter;
    select.innerHTML = '<option value="">Chọn nhà cung cấp</option>';

    State.allSuppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.Code;
        option.textContent = `[${supplier.Code}] ${supplier.PartnerName}`;
        select.appendChild(option);
    });
}

// =====================================================
// EXPANDABLE ROW FUNCTIONS
// =====================================================

async function toggleRowExpandTab(partnerId, tabName) {
    const detailRow = document.getElementById(`detail-row-${partnerId}`);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);

    if (State.expandedRows.has(partnerId)) {
        const rowState = State.expandedRows.get(partnerId);

        if (rowState.activeTab === tabName) {
            // Clicking same tab - collapse
            State.expandedRows.delete(partnerId);
            detailRow.classList.remove('expanded');
            detailPanel.innerHTML = '';
            updateActionButtonsState(partnerId, '');
        } else {
            // Clicking different tab - switch tab
            rowState.activeTab = tabName;
            detailPanel.innerHTML = renderDetailPanel(partnerId);
            if (window.lucide) window.lucide.createIcons();
            await loadTabData(partnerId, tabName);
            updateActionButtonsState(partnerId, tabName);
        }
    } else {
        // Expand with specified tab
        const partnerData = State.filteredData.find(item => item.PartnerId === partnerId);
        State.expandedRows.set(partnerId, {
            partnerData,
            congNo: null,
            congNoPage: 1,
            congNoTotal: 0,
            congNoEndBalances: new Map(), // Store end balance of each page for pagination
            info: null,
            invoices: null,
            invoicePage: 1,
            invoiceTotal: 0,
            debtDetails: null,
            debtPage: 1,
            debtTotal: 0,
            activeTab: tabName,
            isLoading: {}
        });

        detailRow.classList.add('expanded');
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
        await loadTabData(partnerId, tabName);
        updateActionButtonsState(partnerId, tabName);
    }
}

function updateActionButtonsState(partnerId, activeTab) {
    // Update active state of action buttons in the main table row
    const row = document.querySelector(`tr[data-partner-id="${partnerId}"]`);
    if (row) {
        row.querySelectorAll('.btn-action-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        if (activeTab) {
            const activeBtn = row.querySelector(`.btn-action-tab[onclick*="'${activeTab}'"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }
}

// Toggle row expand with arrow button
async function toggleRowExpand(partnerId, expandBtn) {
    const detailRow = document.getElementById(`detail-row-${partnerId}`);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);

    if (State.expandedRows.has(partnerId)) {
        // Collapse
        State.expandedRows.delete(partnerId);
        detailRow.classList.remove('expanded');
        if (expandBtn) expandBtn.classList.remove('expanded');
        detailPanel.innerHTML = '';
    } else {
        // Expand - only set up state, don't fetch all data
        const partnerData = State.filteredData.find(item => item.PartnerId === partnerId);
        State.expandedRows.set(partnerId, {
            partnerData,
            // Tab data (null = not loaded yet)
            congNo: null,
            congNoPage: 1,
            congNoTotal: 0,
            congNoEndBalances: new Map(), // Store end balance of each page for pagination
            info: null,
            invoices: null,
            invoicePage: 1,
            invoiceTotal: 0,
            debtDetails: null,
            debtPage: 1,
            debtTotal: 0,
            activeTab: 'congno', // Default to first tab
            isLoading: {} // Track which tabs are loading
        });

        detailRow.classList.add('expanded');
        if (expandBtn) expandBtn.classList.add('expanded');

        // Render panel with first tab selected
        detailPanel.innerHTML = renderDetailPanel(partnerId);

        // Fetch data for the default tab (congno)
        await loadTabData(partnerId, 'congno');
    }
}

function renderDetailPanel(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return '';

    const activeTab = rowState.activeTab || 'congno';

    return `
        <div class="detail-tabs">
            <button class="detail-tab ${activeTab === 'congno' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'congno')">Công nợ</button>
            <button class="detail-tab ${activeTab === 'invoice' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'invoice')">Hóa đơn</button>
            <button class="detail-tab ${activeTab === 'debt' ? 'active' : ''}" onclick="switchDetailTab(${partnerId}, 'debt')">Chi tiết nợ</button>
        </div>
        <div class="detail-tab-content ${activeTab === 'congno' ? 'active' : ''}" id="tab-congno-${partnerId}">
            ${renderCongNoTab(partnerId)}
        </div>
        <div class="detail-tab-content ${activeTab === 'invoice' ? 'active' : ''}" id="tab-invoice-${partnerId}">
            ${renderInvoiceTab(partnerId)}
        </div>
        <div class="detail-tab-content ${activeTab === 'debt' ? 'active' : ''}" id="tab-debt-${partnerId}">
            ${renderDebtTab(partnerId)}
        </div>
    `;
}

async function switchDetailTab(partnerId, tabName) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return;

    rowState.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll(`#detail-panel-${partnerId} .detail-tab`).forEach(tab => {
        tab.classList.remove('active');
    });
    const tabIndex = { congno: 1, invoice: 2, debt: 3 }[tabName] || 1;
    document.querySelector(`#detail-panel-${partnerId} .detail-tab:nth-child(${tabIndex})`).classList.add('active');

    // Update tab content
    document.querySelectorAll(`#detail-panel-${partnerId} .detail-tab-content`).forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}-${partnerId}`).classList.add('active');

    // Lazy load data for this tab if not already loaded
    await loadTabData(partnerId, tabName);
}

// Load data for a specific tab (lazy loading)
async function loadTabData(partnerId, tabName) {
    const rowState = State.expandedRows.get(partnerId);
    if (!rowState) return;

    // Check if already loaded or loading
    const dataKey = {
        congno: 'congNo',
        info: 'info',
        invoice: 'invoices',
        debt: 'debtDetails'
    }[tabName];

    if (rowState[dataKey] !== null || rowState.isLoading[tabName]) {
        return; // Already loaded or loading
    }

    // Mark as loading
    rowState.isLoading[tabName] = true;

    // Show loading state in the tab content
    const tabContent = document.getElementById(`tab-${tabName}-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    // Fetch data based on tab
    switch (tabName) {
        case 'congno':
            await fetchPartnerCongNo(partnerId, 1);
            break;
        case 'info':
            await fetchPartnerInfo(partnerId);
            break;
        case 'invoice':
            await fetchPartnerInvoices(partnerId, 1);
            break;
        case 'debt':
            await fetchPartnerDebtDetails(partnerId, 1);
            break;
    }

    // Mark as loaded
    rowState.isLoading[tabName] = false;

    // Re-render the tab content
    if (tabContent) {
        switch (tabName) {
            case 'congno':
                tabContent.innerHTML = renderCongNoTab(partnerId);
                break;
            case 'info':
                tabContent.innerHTML = renderInfoTab(partnerId);
                break;
            case 'invoice':
                tabContent.innerHTML = renderInvoiceTab(partnerId);
                break;
            case 'debt':
                tabContent.innerHTML = renderDebtTab(partnerId);
                break;
        }
        if (window.lucide) window.lucide.createIcons();
    }
}

// =====================================================
// DETAIL TAB RENDERERS
// =====================================================

function renderCongNoTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const congNo = rowState?.congNo || [];
    const page = rowState?.congNoPage || 1;
    const total = rowState?.congNoTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);
    const partnerData = rowState?.partnerData || {};
    const supplierCode = partnerData.Code || '';

    // Check if not loaded yet
    if (rowState?.congNo === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (congNo.length === 0) {
        return '<div class="detail-loading">Không có dữ liệu công nợ</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Nhập diễn giải</th>
                    <th>Ghi chú</th>
                    <th>Bút toán</th>
                    <th class="col-number">Nợ đầu kỳ</th>
                    <th class="col-number">Phát sinh</th>
                    <th class="col-number">Thanh toán</th>
                    <th class="col-number">Nợ cuối kỳ</th>
                    <th style="width: 40px;"></th>
                </tr>
            </thead>
            <tbody>
    `;

    // Calculate running balance ourselves since API returns inconsistent Begin values when sorted by date
    // For page 1: use first row's Begin from API
    // For page 2+: use stored end balance from previous page
    const prevPageEndBalance = rowState?.congNoEndBalances?.get(page - 1);
    let runningBalance = (page > 1 && prevPageEndBalance !== undefined)
        ? prevPageEndBalance
        : (congNo.length > 0 ? (congNo[0].Begin || 0) : 0);

    congNo.forEach((item, index) => {
        const dateStr = formatDateFromISO(item.Date);
        const tposNote = item.Ref || '';
        const moveName = item.MoveName || '';
        const webNote = WebNotesStore.get(supplierCode, moveName);
        const noteHistory = WebNotesStore.getHistory(supplierCode, moveName);
        // Determine note button class:
        // multi-edit (red) if history has entries (2+ total edits including deletions)
        // has-note (green) if has note but no history (first edit)
        // no color if never edited
        const noteButtonClass = noteHistory.length >= 1 ? 'multi-edit' : (webNote ? 'has-note' : '');

        // Escape for HTML attributes
        const escapedSupplierCode = escapeHtmlAttr(supplierCode);
        const escapedMoveName = escapeHtmlAttr(moveName);
        const escapedTposNote = escapeHtmlAttr(tposNote);
        const escapedWebNote = escapeHtmlAttr(webNote);

        const debit = item.Debit || 0;
        const credit = item.Credit || 0;

        // Use running balance calculated from previous rows
        const currentBegin = runningBalance;
        const currentEnd = currentBegin + debit - credit;

        // Update running balance for next row
        runningBalance = currentEnd;

        // Check if this is a payment entry (can be deleted)
        // Payments typically have Credit > 0 and MoveName starts with CSH, BANK, etc.
        const isPayment = credit > 0 && /^(CSH|BANK|TK)/.test(moveName);
        // Check if this is an invoice entry (can view details)
        const isInvoice = /^BILL\//.test(moveName);
        const moveId = item.MoveId || item.Id || 0;

        tableHtml += `
            <tr>
                <td>${dateStr}</td>
                <td>${escapeHtml(item.Name || '')}</td>
                <td class="note-cell">
                    <div class="note-content">
                        ${tposNote ? `<span class="note-tpos" title="Dữ liệu TPOS (không thể sửa)">${escapeHtml(tposNote)}</span>` : ''}
                        ${webNote ? `<span class="note-web" title="Ghi chú web">${escapeHtml(webNote)}</span>` : ''}
                    </div>
                    ${canEditNoteForMoveName(moveName) ? `<button class="btn-edit-note ${noteButtonClass}"
                        data-supplier="${escapedSupplierCode}"
                        data-movename="${escapedMoveName}"
                        data-tpos="${escapedTposNote}"
                        data-web="${escapedWebNote}"
                        onclick="handleNoteEditClick(this)"
                        title="${webNote ? 'Đã có ghi chú - Bấm để sửa' : 'Thêm ghi chú web'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>` : ''}
                </td>
                <td class="move-name-cell">
                    ${isInvoice ? `<button class="btn-view-invoice" onclick="openInvoiceDetailByMoveName('${escapedMoveName}', ${partnerId})" title="Xem chi tiết hóa đơn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg></button>` : ''}
                    ${escapeHtml(moveName)}
                </td>
                <td class="col-number">${formatNumber(currentBegin)}</td>
                <td class="col-number">${formatNumber(debit)}</td>
                <td class="col-number">${formatNumber(credit)}</td>
                <td class="col-number">${formatNumber(currentEnd)}</td>
                <td style="text-align: center;">
                    ${isPayment && hasSupplierDebtPermission('deletePayment') ? `
                        <button class="btn-delete-row"
                            onclick="handleDeletePayment('${escapeHtmlAttr(item.Date || '')}', '${escapedMoveName}', ${partnerId})"
                            title="Xóa thanh toán">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });

    // Store end balance of this page for pagination to next page
    if (rowState?.congNoEndBalances) {
        rowState.congNoEndBalances.set(page, runningBalance);
    }

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, 1)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${page - 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'congno')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${page + 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeCongNoPage(${partnerId}, ${totalPages})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeCongNoPageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20" ${CONFIG.DETAIL_PAGE_SIZE === 20 ? 'selected' : ''}>20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshCongNo(${partnerId})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></button>
        </div>
    `;

    return tableHtml;
}

function renderInfoTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const partnerData = rowState?.partnerData || {};
    const info = rowState?.info;

    // Check if not loaded yet
    if (info === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    const infoData = info || {};
    const supplierDisplay = `[${escapeHtml(partnerData.Code || '')}] ${escapeHtml(partnerData.PartnerName || '')}`;
    const endAmount = partnerData.End || 0;

    return `
        <button class="btn-payment" onclick="openPaymentModal(${partnerId}, '${supplierDisplay.replace(/'/g, "\\'")}', ${endAmount})">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            Thanh toán
        </button>
        <div class="info-grid">
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">Mã :</span>
                    <span class="info-value">${escapeHtml(partnerData.Code || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Tên:</span>
                    <span class="info-value">${escapeHtml(partnerData.PartnerName || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nhóm:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Mã số thuế:</span>
                    <span class="info-value"></span>
                </div>
            </div>
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">Email:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Điện thoại:</span>
                    <span class="info-value">${escapeHtml(partnerData.PartnerPhone || '')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Di động:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Địa chỉ:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Zalo:</span>
                    <span class="info-value"></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Facebook:</span>
                    <span class="info-value"></span>
                </div>
            </div>
        </div>
        <div class="revenue-summary">
            <div class="revenue-row">
                <span class="revenue-label">Doanh số đầu kỳ:</span>
                <span class="revenue-value">${formatNumber(infoData.RevenueBegan || 0)}</span>
            </div>
            <div class="revenue-row">
                <span class="revenue-label">Doanh số :</span>
                <span class="revenue-value">${formatNumber(infoData.Revenue || 0)}</span>
            </div>
            <div class="revenue-row">
                <span class="revenue-label">Tổng doanh số :</span>
                <span class="revenue-value">${formatNumber(infoData.RevenueTotal || 0)}</span>
            </div>
        </div>
    `;
}

function renderInvoiceTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const invoices = rowState?.invoices;
    const page = rowState?.invoicePage || 1;
    const total = rowState?.invoiceTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);

    // Check if not loaded yet
    if (invoices === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (!invoices || invoices.length === 0) {
        return '<div class="detail-loading">Không có hóa đơn</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Mã</th>
                    <th>Ngày hóa đơn</th>
                    <th>Loại</th>
                    <th>Người lập</th>
                    <th>Nguồn</th>
                    <th>Trạng thái</th>
                    <th class="col-number">Tổng tiền</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    invoices.forEach(inv => {
        const statusClass = inv.StateFast === 'open' ? 'status-open' : inv.StateFast === 'cancel' ? 'status-cancel' : inv.StateFast === 'paid' ? 'status-paid' : 'status-draft';
        const invoiceId = inv.Id;
        tableHtml += `
            <tr>
                <td>${escapeHtml(inv.Number || inv.MoveName || '')}</td>
                <td>${formatDateFromISO(inv.DateInvoice)}</td>
                <td>${escapeHtml(inv.ShowType || '')}</td>
                <td>${escapeHtml(inv.UserName || '')}</td>
                <td></td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(inv.ShowStateFast || '')}</span></td>
                <td class="col-number">${formatNumber(inv.AmountTotal)}</td>
                <td><button class="btn-view" onclick="openInvoiceDetailModal(${invoiceId})" title="Xem chi tiết"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg></button></td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, 1)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${page - 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'invoice')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${page + 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeInvoicePage(${partnerId}, ${totalPages})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeInvoicePageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20" ${CONFIG.DETAIL_PAGE_SIZE === 20 ? 'selected' : ''}>20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshInvoices(${partnerId})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></button>
        </div>
    `;

    return tableHtml;
}

function renderDebtTab(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    const debtDetails = rowState?.debtDetails;
    const page = rowState?.debtPage || 1;
    const total = rowState?.debtTotal || 0;
    const totalPages = Math.ceil(total / CONFIG.DETAIL_PAGE_SIZE);

    // Check if not loaded yet
    if (debtDetails === null) {
        return `
            <div class="detail-loading">
                <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px;"></i>
                Đang tải dữ liệu...
            </div>
        `;
    }

    if (!debtDetails || debtDetails.length === 0) {
        return '<div class="detail-loading">Không có chi tiết nợ</div>';
    }

    let tableHtml = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Chứng từ/Hóa đơn</th>
                    <th class="col-number">Còn nợ</th>
                </tr>
            </thead>
            <tbody>
    `;

    debtDetails.forEach(debt => {
        tableHtml += `
            <tr>
                <td>${formatDateFromDotNet(debt.Date)}</td>
                <td>${escapeHtml(debt.DisplayedName || '')}</td>
                <td class="col-number">${formatNumber(debt.AmountResidual)}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';

    // Pagination
    const start = total > 0 ? (page - 1) * CONFIG.DETAIL_PAGE_SIZE + 1 : 0;
    const end = Math.min(page * CONFIG.DETAIL_PAGE_SIZE, total);

    tableHtml += `
        <div class="detail-pagination">
            <div class="detail-pagination-nav">
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, 1)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg></button>
                <button class="btn-page" ${page <= 1 ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${page - 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                ${renderDetailPageNumbers(page, totalPages, partnerId, 'debt')}
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${page + 1})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                <button class="btn-page" ${page >= totalPages ? 'disabled' : ''} onclick="changeDebtPage(${partnerId}, ${totalPages})"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg></button>
            </div>
            <select class="page-size-select" style="font-size:12px;padding:4px 8px;" onchange="changeDebtPageSize(${partnerId}, this.value)">
                <option value="10" ${CONFIG.DETAIL_PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                <option value="20" ${CONFIG.DETAIL_PAGE_SIZE === 20 ? 'selected' : ''}>20</option>
                <option value="50">50</option>
            </select>
            <span class="detail-pagination-info">Số dòng trên trang</span>
            <span class="detail-pagination-info">${start} - ${end} của ${total} dòng</span>
            <button class="btn-refresh" onclick="refreshDebtDetails(${partnerId})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></button>
        </div>
    `;

    return tableHtml;
}

function renderDetailPageNumbers(currentPage, totalPages, partnerId, type) {
    let html = '';
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
        let onclick;
        switch (type) {
            case 'congno':
                onclick = `changeCongNoPage(${partnerId}, ${i})`;
                break;
            case 'invoice':
                onclick = `changeInvoicePage(${partnerId}, ${i})`;
                break;
            case 'debt':
                onclick = `changeDebtPage(${partnerId}, ${i})`;
                break;
            default:
                onclick = '';
        }
        html += `<button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="${onclick}">${i}</button>`;
    }

    return html;
}

// =====================================================
// DETAIL API CALLS
// =====================================================

async function fetchPartnerCongNo(partnerId, page) {
    try {
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;

        // Build date params from current filter state
        const dateFrom = toISODateString(State.dateFrom, false);
        const dateTo = toISODateString(State.dateTo, true);

        const params = new URLSearchParams();
        params.set('ResultSelection', 'supplier');
        params.set('PartnerId', partnerId);
        params.set('DateFrom', dateFrom);
        params.set('DateTo', dateTo);
        params.set('CompanyId', '');
        params.set('$format', 'json');
        params.set('$top', CONFIG.DETAIL_PAGE_SIZE);
        params.set('$skip', skip);
        params.set('$count', 'true');
        params.set('$orderby', 'Date asc');

        const url = `${CONFIG.API_BASE}/Report/PartnerDebtReportDetail?${params.toString()}`;
        const response = await tposFetch(url);

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.congNo = data.value || [];
                rowState.congNoTotal = data['@odata.count'] || 0;
                rowState.congNoPage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching cong no:', error);
        const rowState = State.expandedRows.get(partnerId);
        if (rowState) {
            rowState.congNo = []; // Set empty array on error
        }
    }
}

async function fetchPartnerInfo(partnerId) {
    try {
        const url = `${CONFIG.API_BASE_PARTNER}/partner/GetPartnerRevenueById?id=${partnerId}&supplier=true`;
        const response = await tposFetch(url);

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.info = data;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching partner info:', error);
    }
}

async function fetchPartnerInvoices(partnerId, page) {
    try {
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;
        const url = `${CONFIG.API_BASE}/AccountInvoice/ODataService.GetInvoicePartner?partnerId=${partnerId}&$format=json&$top=${CONFIG.DETAIL_PAGE_SIZE}&$skip=${skip}&$orderby=DateInvoice+desc&$filter=PartnerId+eq+${partnerId}&$count=true`;
        const response = await tposFetch(url);

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.invoices = data.value || [];
                rowState.invoiceTotal = data['@odata.count'] || 0;
                rowState.invoicePage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching invoices:', error);
    }
}

async function fetchPartnerDebtDetails(partnerId, page) {
    try {
        const skip = (page - 1) * CONFIG.DETAIL_PAGE_SIZE;
        const url = `${CONFIG.API_BASE_PARTNER}/Partner/CreditDebitSupplierDetail?partnerId=${partnerId}&take=${CONFIG.DETAIL_PAGE_SIZE}&skip=${skip}&page=${page}&pageSize=${CONFIG.DETAIL_PAGE_SIZE}`;
        const response = await tposFetch(url);

        if (response.ok) {
            const data = await response.json();
            const rowState = State.expandedRows.get(partnerId);
            if (rowState) {
                rowState.debtDetails = data.Data || [];
                rowState.debtTotal = data.Total || 0;
                rowState.debtPage = page;
            }
        }
    } catch (error) {
        console.error('[SupplierDebt] Error fetching debt details:', error);
    }
}

// =====================================================
// DETAIL PAGINATION HANDLERS
// =====================================================

async function changeCongNoPage(partnerId, page) {
    await fetchPartnerCongNo(partnerId, page);
    const tabContent = document.getElementById(`tab-congno-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = renderCongNoTab(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshCongNo(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerCongNo(partnerId, rowState?.congNoPage || 1);
    const tabContent = document.getElementById(`tab-congno-${partnerId}`);
    if (tabContent) {
        tabContent.innerHTML = renderCongNoTab(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function changeInvoicePage(partnerId, page) {
    await fetchPartnerInvoices(partnerId, page);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function changeDebtPage(partnerId, page) {
    await fetchPartnerDebtDetails(partnerId, page);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshInvoices(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerInvoices(partnerId, rowState?.invoicePage || 1);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

async function refreshDebtDetails(partnerId) {
    const rowState = State.expandedRows.get(partnerId);
    await fetchPartnerDebtDetails(partnerId, rowState?.debtPage || 1);
    const detailPanel = document.getElementById(`detail-panel-${partnerId}`);
    if (detailPanel) {
        detailPanel.innerHTML = renderDetailPanel(partnerId);
        if (window.lucide) window.lucide.createIcons();
    }
}

// =====================================================
// PAYMENT MODAL
// =====================================================

let currentPaymentPartnerId = null;
let paymentMethods = [];

function openPaymentModal(partnerId, supplierName, amount) {
    currentPaymentPartnerId = partnerId;

    // Set supplier name
    document.getElementById('paymentSupplierName').textContent = supplierName;

    // Set amount (Nợ cuối kỳ) with thousand separators
    document.getElementById('paymentAmount').value = formatNumberWithDots(amount);

    // Set current datetime
    const now = new Date();
    const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    document.getElementById('paymentDate').value = localDatetime;

    // Clear content field
    document.getElementById('paymentContent').value = '';

    // Load payment methods if not loaded
    if (paymentMethods.length === 0) {
        loadPaymentMethods();
    }

    // Show modal
    document.getElementById('paymentModal').classList.add('show');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('show');
    currentPaymentPartnerId = null;
}

async function loadPaymentMethods() {
    try {
        const url = `${CONFIG.API_BASE}/AccountJournal?$filter=Type eq 'cash' or Type eq 'bank'&$format=json`;
        const response = await tposFetch(url);

        if (response.ok) {
            const data = await response.json();
            paymentMethods = data.value || [];
            populatePaymentMethods();
        }
    } catch (error) {
        console.error('[SupplierDebt] Error loading payment methods:', error);
    }
}

function populatePaymentMethods() {
    const select = document.getElementById('paymentMethod');
    select.innerHTML = '<option value="">-- Chọn phương thức --</option>';

    // Deduplicate by Name and rename "Ngân hàng" to "Chuyển khoản"
    const uniqueMethods = new Map();
    let defaultMethodId = null;

    paymentMethods.forEach(method => {
        let displayName = method.Name;

        // Rename "Ngân hàng" to "Chuyển khoản"
        if (method.Type === 'bank' || method.Name.toLowerCase().includes('ngân hàng')) {
            displayName = 'Chuyển khoản';
        }

        // Only add if not already exists (dedupe by displayName)
        if (!uniqueMethods.has(displayName)) {
            uniqueMethods.set(displayName, { id: method.Id, name: displayName, type: method.Type });

            // Set "Chuyển khoản" as default
            if (displayName === 'Chuyển khoản' && !defaultMethodId) {
                defaultMethodId = method.Id;
            }
        }
    });

    // Add unique methods to select
    uniqueMethods.forEach((method) => {
        const option = document.createElement('option');
        option.value = method.id;
        option.textContent = method.name;
        option.dataset.type = method.type || '';
        if (method.id === defaultMethodId) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Add "Khuyến mãi" option
    const promoOption = document.createElement('option');
    promoOption.value = 'promotion';
    promoOption.textContent = 'Khuyến mãi';
    promoOption.dataset.type = 'promotion';
    select.appendChild(promoOption);
}

function onPaymentMethodChange() {
    const select = document.getElementById('paymentMethod');
    const contentInput = document.getElementById('paymentContent');
    const selectedOption = select.options[select.selectedIndex];

    // If "Khuyến mãi" is selected, auto-fill content
    if (selectedOption && selectedOption.dataset.type === 'promotion') {
        contentInput.value = 'Khuyến mãi';
    } else {
        // If switching away from "Khuyến mãi", clear the auto-filled content
        if (contentInput.value === 'Khuyến mãi') {
            contentInput.value = '';
        }
    }
}

async function submitPayment() {
    if (!hasSupplierDebtPermission('payment')) {
        window.notificationManager?.error('Bạn không có quyền đăng ký thanh toán');
        return;
    }

    const partnerId = currentPaymentPartnerId;
    const select = document.getElementById('paymentMethod');
    let journalId = select.value;
    // Remove dots from formatted amount before parsing
    const amountStr = document.getElementById('paymentAmount').value.replace(/\./g, '');
    const amount = parseFloat(amountStr) || 0;
    const paymentDateValue = document.getElementById('paymentDate').value;
    const content = document.getElementById('paymentContent').value;

    // Validation
    if (!journalId) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn phương thức thanh toán');
        }
        return;
    }

    // Get the selected journal object
    let selectedJournal = null;
    const isPromotion = journalId === 'promotion';

    if (isPromotion) {
        // "Khuyến mãi" uses bank journal (Ngân hàng)
        selectedJournal = paymentMethods.find(m => m.Name === 'Ngân hàng' || m.Type === 'bank');
        if (!selectedJournal) {
            if (window.notificationManager) {
                window.notificationManager.warning('Không tìm thấy phương thức ngân hàng');
            }
            return;
        }
        journalId = selectedJournal.Id;
    } else {
        selectedJournal = paymentMethods.find(m => m.Id === parseInt(journalId));
    }

    if (!selectedJournal) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không tìm thấy phương thức thanh toán');
        }
        return;
    }

    if (amount <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Số tiền phải lớn hơn 0');
        }
        return;
    }

    try {
        const paymentDate = new Date(paymentDateValue);
        const paymentDateISO = paymentDate.toISOString();
        const localDatetime = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000).toISOString();

        // Get partner data from expanded rows
        const rowState = State.expandedRows.get(partnerId);
        const partnerData = rowState?.partnerData || {};

        // Build full payload matching the TPOS API format
        const payload = {
            Id: 0,
            CompanyId: null,
            CurrencyId: 1,
            PartnerId: partnerId,
            ApproveUserId: null,
            ApproveUserName: null,
            CreatedUserName: null,
            CreatedUserId: null,
            PartnerDisplayName: null,
            ContactId: null,
            ContactName: null,
            PaymentMethodId: 2,
            PartnerType: 'supplier',
            PaymentDate: paymentDateISO,
            DateCreated: localDatetime,
            JournalId: parseInt(journalId),
            JournalName: null,
            JournalType: null,
            State: 'draft',
            Name: null,
            PaymentType: 'outbound',
            Amount: amount,
            AmountStr: null,
            Communication: content || null,
            SearchDate: null,
            StateGet: 'Nháp',
            PaymentType2: null,
            Description: null,
            PaymentDifferenceHandling: 'open',
            WriteoffAccountId: null,
            PaymentDifference: 0,
            SenderReceiver: null,
            Phone: null,
            Address: null,
            AccountId: null,
            AccountName: null,
            CompanyName: null,
            OrderCode: null,
            SaleOrderId: null,
            Currency: {
                Id: 1,
                Name: 'VND',
                Code: null,
                Rounding: 1,
                Symbol: null,
                Active: true,
                Position: 'after',
                Rate: 0,
                DecimalPlaces: 0
            },
            Journal: selectedJournal,
            Partner: {
                Id: partnerId,
                Name: partnerData.PartnerName || '',
                DisplayName: `[${partnerData.Code || ''}] ${partnerData.PartnerName || ''}`,
                Street: null,
                Website: null,
                Phone: partnerData.PartnerPhone || null,
                Supplier: true,
                Customer: false,
                IsCompany: false,
                Ref: partnerData.Code || null,
                Active: true,
                Employee: false,
                Type: 'contact',
                CompanyType: 'person',
                OverCredit: false,
                CreditLimit: 0,
                Discount: 0,
                AmountDiscount: 0,
                NameNoSign: (partnerData.PartnerName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                DateCreated: localDatetime,
                Status: 'Normal',
                StatusText: 'Bình thường',
                Source: 'Default',
                IsNewAddress: false,
                Ward_District_City: ''
            }
        };

        const url = `${CONFIG.API_BASE}/AccountPayment`;

        const tposPostHeaders = { 'Content-Type': 'application/json;charset=UTF-8', 'feature-version': '2', 'x-tpos-lang': 'vi' };
        const response = await tposFetch(url, {
            method: 'POST',
            headers: tposPostHeaders,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const paymentData = await response.json();
            const paymentId = paymentData.Id;

            // Step 2: Call ActionPost to confirm the payment
            const actionPostUrl = `${CONFIG.API_BASE}/AccountPayment/ODataService.ActionPost`;
            const actionPostResponse = await tposFetch(actionPostUrl, {
                method: 'POST',
                headers: tposPostHeaders,
                body: JSON.stringify({ id: paymentId })
            });

            if (actionPostResponse.ok) {
                if (window.notificationManager) {
                    window.notificationManager.success('Thanh toán thành công');
                }
                closePaymentModal();
                // Refresh detail panels trước (theo pattern deletePayment)
                try {
                    await refreshCongNo(partnerId);
                    await refreshDebtDetails(partnerId);
                } catch (e) {
                    console.error('[SupplierDebt] Error refreshing detail panels:', e);
                }
                // Refresh bảng tổng
                await fetchData();
            } else {
                const actionError = await actionPostResponse.json();
                throw new Error(actionError.error?.message || 'Lỗi xác nhận thanh toán');
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Lỗi thanh toán');
        }
    } catch (error) {
        console.error('[SupplierDebt] Payment error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

function initPaymentModal() {
    // Close modal handlers
    document.getElementById('btnCloseModal')?.addEventListener('click', closePaymentModal);
    document.getElementById('btnCancelPayment')?.addEventListener('click', closePaymentModal);

    // Submit payment handler
    document.getElementById('btnSubmitPayment')?.addEventListener('click', submitPayment);

    // Payment method change handler (for "Khuyến mãi" auto-fill)
    document.getElementById('paymentMethod')?.addEventListener('change', onPaymentMethodChange);

    // Close on overlay click
    document.getElementById('paymentModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'paymentModal') {
            closePaymentModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('paymentModal')?.classList.contains('show')) {
            closePaymentModal();
        }
    });
}

// =====================================================
// INVOICE DETAIL MODAL
// =====================================================

let currentInvoiceDetail = null;

async function openInvoiceDetailModal(invoiceId) {
    if (!invoiceId) {
        console.error('[SupplierDebt] No invoice ID provided');
        return;
    }

    // Show loading state
    const modal = document.getElementById('invoiceDetailModal');
    const modalBody = document.getElementById('invoiceDetailBody');

    if (!modal || !modalBody) {
        console.error('[SupplierDebt] Invoice detail modal not found');
        return;
    }

    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="detail-loading">
            <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Đang tải chi tiết hóa đơn...
        </div>
    `;

    try {
        const url = `${CONFIG.API_BASE}/FastPurchaseOrder(${invoiceId})?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit`;
        const response = await tposFetch(url, {
            headers: { 'feature-version': '2', 'x-tpos-lang': 'vi' }
        });

        if (!response.ok) {
            throw new Error('Không thể tải chi tiết hóa đơn');
        }

        const data = await response.json();
        currentInvoiceDetail = data;
        renderInvoiceDetailModal(data);

    } catch (error) {
        console.error('[SupplierDebt] Error fetching invoice detail:', error);
        modalBody.innerHTML = `
            <div class="detail-loading" style="color: #dc2626;">
                Lỗi tải chi tiết hóa đơn: ${error.message}
            </div>
        `;
    }
}

function renderInvoiceDetailModal(data) {
    const modalBody = document.getElementById('invoiceDetailBody');
    if (!modalBody) return;

    const partnerDisplay = data.PartnerDisplayName || `[${data.Partner?.Ref || ''}] ${data.Partner?.Name || ''}`;
    const dateInvoice = formatDateTimeFromISO(data.DateInvoice);
    const paymentMethod = data.PaymentJournal?.Name || 'Không xác định';
    const paymentAmount = data.PaymentAmount || 0;
    const amountTotal = data.AmountTotal || 0;
    const residual = data.Residual || 0;
    // Calculate total quantity from order lines
    let totalQuantity = 0;

    // Build order lines table
    let orderLinesHtml = '';
    if (data.OrderLines && data.OrderLines.length > 0) {
        data.OrderLines.forEach((line, index) => {
            totalQuantity += (line.ProductQty || 0);
            const productName = line.Name || line.ProductName || '';
            const note = line.Note || '';
            orderLinesHtml += `
                <tr>
                    <td class="col-stt">${index + 1}</td>
                    <td class="col-product">
                        <div class="product-name">${escapeHtml(productName)}</div>
                        ${note ? `<div class="product-note">${escapeHtml(note)}</div>` : '<div class="product-note text-muted">Ghi chú</div>'}
                    </td>
                    <td class="col-number">${formatNumber(line.ProductQty)}</td>
                    <td class="col-number">${formatNumber(line.PriceUnit)}</td>
                    <td class="col-number">${formatNumber(line.PriceSubTotal)}</td>
                </tr>
            `;
        });
    }

    modalBody.innerHTML = `
        <div class="invoice-detail-header">
            <div class="invoice-header-row">
                <div class="invoice-header-item">
                    <span class="label">Nhà cung cấp:</span>
                    <span class="value"><em>${escapeHtml(partnerDisplay)}</em></span>
                </div>
                <div class="invoice-header-item">
                    <span class="label">Ngày đơn hàng:</span>
                    <span class="value"><u>${dateInvoice}</u></span>
                </div>
                <div class="invoice-header-item">
                    <span class="label">Phương thức thanh toán:</span>
                    <span class="value"><em>${escapeHtml(paymentMethod)}</em></span>
                </div>
            </div>
            <div class="invoice-header-row">
                <div class="invoice-header-item">
                    <span class="label">Số tiền thanh toán:</span>
                    <span class="value"><em>${formatNumber(paymentAmount)}</em></span>
                </div>
            </div>
        </div>

        <table class="invoice-detail-table">
            <thead>
                <tr>
                    <th class="col-stt">STT</th>
                    <th class="col-product">Sản phẩm</th>
                    <th class="col-number">Số lượng</th>
                    <th class="col-number">Đơn giá</th>
                    <th class="col-number">Tổng</th>
                </tr>
            </thead>
            <tbody>
                ${orderLinesHtml}
            </tbody>
        </table>

        <div class="invoice-detail-footer">
            <div class="footer-row">
                <span class="label">Tổng số lượng:</span>
                <span class="value">${formatNumber(totalQuantity)}</span>
            </div>
            <div class="footer-row">
                <span class="label">Tổng tiền:</span>
                <span class="value total">${formatNumber(amountTotal)}</span>
            </div>
            <div class="footer-row">
                <span class="label">Còn nợ:</span>
                <span class="value debt">${formatNumber(residual)}</span>
            </div>
        </div>
    `;
}

function formatDateTimeFromISO(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function openInvoiceDetailByMoveName(moveName, partnerId) {
    if (!moveName) {
        console.error('[SupplierDebt] No moveName provided');
        return;
    }

    // Show loading state
    const modal = document.getElementById('invoiceDetailModal');
    const modalBody = document.getElementById('invoiceDetailBody');

    if (!modal || !modalBody) {
        console.error('[SupplierDebt] Invoice detail modal not found');
        return;
    }

    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="detail-loading">
            <svg class="spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Đang tìm hóa đơn...
        </div>
    `;

    try {
        // First, search for the invoice by MoveName (Number) using GetInvoicePartner
        const searchUrl = `${CONFIG.API_BASE}/AccountInvoice/ODataService.GetInvoicePartner?partnerId=${partnerId}&$format=json&$top=100&$orderby=DateInvoice+desc&$filter=PartnerId+eq+${partnerId}&$count=true`;
        const searchResponse = await tposFetch(searchUrl);

        if (!searchResponse.ok) {
            throw new Error('Không thể tìm kiếm hóa đơn');
        }

        const searchData = await searchResponse.json();
        const invoices = searchData.value || [];

        // Find invoice by Number or MoveName
        const invoice = invoices.find(inv => inv.Number === moveName || inv.MoveName === moveName);

        if (!invoice) {
            throw new Error(`Không tìm thấy hóa đơn "${moveName}"`);
        }

        // Now fetch the full invoice details
        await openInvoiceDetailModal(invoice.Id);

    } catch (error) {
        console.error('[SupplierDebt] Error finding invoice by moveName:', error);
        modalBody.innerHTML = `
            <div class="detail-loading" style="color: #dc2626;">
                Lỗi: ${error.message}
            </div>
        `;
    }
}

function closeInvoiceDetailModal() {
    document.getElementById('invoiceDetailModal')?.classList.remove('show');
    currentInvoiceDetail = null;
}

function initInvoiceDetailModal() {
    // Close handlers
    document.getElementById('btnCloseInvoiceDetail')?.addEventListener('click', closeInvoiceDetailModal);
    document.getElementById('btnCloseInvoiceDetailFooter')?.addEventListener('click', closeInvoiceDetailModal);

    // Close on overlay click
    document.getElementById('invoiceDetailModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'invoiceDetailModal') {
            closeInvoiceDetailModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('invoiceDetailModal')?.classList.contains('show')) {
            closeInvoiceDetailModal();
        }
    });
}

// =====================================================
// NOTE EDIT MODAL
// =====================================================

let currentNoteEdit = {
    supplierCode: null,
    moveName: null
};

function openNoteEditModal(supplierCode, moveName, tposNote, webNote) {
    currentNoteEdit.supplierCode = supplierCode;
    currentNoteEdit.moveName = moveName;

    // Set modal content
    document.getElementById('noteEditSupplier').textContent = `[${supplierCode}] - ${moveName}`;
    document.getElementById('noteEditTpos').textContent = tposNote || '(Không có)';
    document.getElementById('noteEditWeb').value = webNote || '';

    // Load and display history
    const history = WebNotesStore.getHistory(supplierCode, moveName);
    const historySection = document.getElementById('noteHistorySection');
    const historyList = document.getElementById('noteHistoryList');

    if (history && history.length > 0) {
        historySection.style.display = 'block';
        historyList.innerHTML = history.map(item => {
            const date = new Date(item.timestamp);
            const timeStr = date.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            return `
                <div class="note-history-item">
                    <div class="note-history-time">${timeStr}</div>
                    <div class="note-history-text">${escapeHtml(item.text)}</div>
                </div>
            `;
        }).join('');
    } else {
        historySection.style.display = 'none';
        historyList.innerHTML = '';
    }

    // Show modal
    document.getElementById('noteEditModal').classList.add('show');

    // Focus on textarea
    document.getElementById('noteEditWeb').focus();
}

function closeNoteEditModal() {
    document.getElementById('noteEditModal').classList.remove('show');
    currentNoteEdit.supplierCode = null;
    currentNoteEdit.moveName = null;
}

async function saveNoteEdit() {
    const { supplierCode, moveName } = currentNoteEdit;
    const webNote = document.getElementById('noteEditWeb').value;

    if (!supplierCode || !moveName) {
        console.error('[NoteEdit] No supplier code or moveName');
        return;
    }

    if (!canEditNoteForMoveName(moveName)) {
        window.notificationManager?.error('Bạn không có quyền sửa ghi chú cho bút toán này');
        return;
    }

    try {
        await WebNotesStore.set(supplierCode, moveName, webNote);

        if (window.notificationManager) {
            window.notificationManager.success('Đã lưu ghi chú');
        }

        closeNoteEditModal();

        // Refresh the current expanded row's congno tab
        const partnerData = State.filteredData.find(p => p.Code === supplierCode);
        if (partnerData) {
            const partnerId = partnerData.PartnerId;
            const tabContent = document.getElementById(`tab-congno-${partnerId}`);
            if (tabContent) {
                tabContent.innerHTML = renderCongNoTab(partnerId);
                if (window.lucide) window.lucide.createIcons();
            }
        }
    } catch (error) {
        console.error('[NoteEdit] Error saving note:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi lưu ghi chú: ' + error.message);
        }
    }
}

function initNoteEditModal() {
    // Close handlers
    document.getElementById('btnCloseNoteModal')?.addEventListener('click', closeNoteEditModal);
    document.getElementById('btnCancelNote')?.addEventListener('click', closeNoteEditModal);

    // Save handler
    document.getElementById('btnSaveNote')?.addEventListener('click', saveNoteEdit);

    // Close on overlay click
    document.getElementById('noteEditModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'noteEditModal') {
            closeNoteEditModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('noteEditModal')?.classList.contains('show')) {
            closeNoteEditModal();
        }
    });

    // Save on Ctrl+Enter
    document.getElementById('noteEditWeb')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            saveNoteEdit();
        }
    });
}

// =====================================================
// DATE FORMATTING HELPERS
// =====================================================

function formatDateFromISO(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return formatDate(date);
}

function formatDateFromDotNet(dotNetDate) {
    if (!dotNetDate) return '';
    // Parse /Date(1768708149760)/ format
    const match = dotNetDate.match(/\/Date\((\d+)\)\//);
    if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        return formatDate(date);
    }
    return '';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeHtmlAttr(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function handleNoteEditClick(btn) {
    const supplierCode = btn.dataset.supplier || '';
    const moveName = btn.dataset.movename || '';
    const tposNote = btn.dataset.tpos || '';
    const webNote = btn.dataset.web || '';
    openNoteEditModal(supplierCode, moveName, tposNote, webNote);
}

// =====================================================
// DELETE PAYMENT
// =====================================================

async function handleDeleteLastPayment(partnerId, supplierCode) {
    // Find the most recent payment for this supplier
    try {
        // Get partner data
        const partnerData = State.filteredData.find(item => item.PartnerId === partnerId);
        if (!partnerData) {
            if (window.notificationManager) {
                window.notificationManager.warning('Không tìm thấy thông tin nhà cung cấp');
            }
            return;
        }

        // Fetch recent payments for this partner
        const url = `${CONFIG.API_BASE}/AccountPayment?$filter=PartnerId eq ${partnerId} and State eq 'posted'&$orderby=PaymentDate desc&$top=1&$format=json`;
        const response = await tposFetch(url);

        if (!response.ok) {
            throw new Error('Không thể lấy danh sách thanh toán');
        }

        const data = await response.json();
        if (!data.value || data.value.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.warning('Không tìm thấy thanh toán nào để xóa');
            }
            return;
        }

        const lastPayment = data.value[0];
        const paymentId = lastPayment.Id;
        const paymentName = lastPayment.Name || `#${paymentId}`;

        // Show confirm dialog
        if (window.notificationManager && window.notificationManager.confirm) {
            const confirmed = await window.notificationManager.confirm(
                `Bạn có chắc chắn muốn xóa thanh toán gần nhất "${paymentName}" của nhà cung cấp [${supplierCode}]?`,
                'Xác nhận xóa'
            );

            if (confirmed) {
                await deletePayment(paymentId, partnerId);
            }
        } else {
            if (confirm(`Bạn có chắc chắn muốn xóa thanh toán gần nhất "${paymentName}"?`)) {
                await deletePayment(paymentId, partnerId);
            }
        }

    } catch (error) {
        console.error('[SupplierDebt] Error in handleDeleteLastPayment:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

async function handleDeletePayment(paymentDate, moveName, partnerId) {
    if (!hasSupplierDebtPermission('deletePayment')) {
        window.notificationManager?.error('Bạn không có quyền xóa thanh toán');
        return;
    }

    // Show custom confirm dialog first
    let confirmed = false;
    if (window.notificationManager && window.notificationManager.confirm) {
        confirmed = await window.notificationManager.confirm(
            `Bạn có chắc chắn muốn xóa thanh toán "${moveName}"?`,
            'Xác nhận xóa'
        );
    } else {
        confirmed = confirm(`Bạn có chắc chắn muốn xóa thanh toán "${moveName}"?`);
    }

    if (!confirmed) return;

    // Lookup payment ID by PaymentDate using GetAccountPaymentList API
    const paymentId = await lookupPaymentIdByDate(partnerId, paymentDate);
    if (!paymentId) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy ID thanh toán. Có thể thanh toán đã bị xóa hoặc không tồn tại.');
        }
        return;
    }

    // Delete the payment
    await deletePayment(paymentId, partnerId);
}

async function lookupPaymentIdByDate(partnerId, paymentDate) {
    // Lookup payment ID by PartnerDisplayName and PaymentDate using GetAccountPaymentList API
    try {
        // Get partner display name from state
        const rowState = State.expandedRows.get(partnerId);
        const partnerData = rowState?.partnerData || {};
        const partnerDisplayName = `[${partnerData.Code || ''}] ${partnerData.PartnerName || ''}`;

        if (!partnerDisplayName || partnerDisplayName === '[] ') {
            console.error('[SupplierDebt] Could not determine PartnerDisplayName');
            return null;
        }

        const encodedDisplayName = encodeURIComponent(partnerDisplayName);

        // Call GetAccountPaymentList API with PartnerDisplayName filter
        const url = `${CONFIG.API_BASE}/AccountPayment/OdataService.GetAccountPaymentList?partnerType=supplier&$top=50&$orderby=PaymentDate desc,Name desc&$filter=contains(PartnerDisplayName,'${encodedDisplayName}')&$count=true`;

        console.log('[SupplierDebt] Looking up payment ID by date:', { partnerDisplayName, paymentDate, url });

        const response = await tposFetch(url, {
            headers: { 'x-tpos-lang': 'vi' }
        });

        if (!response.ok) {
            console.error('[SupplierDebt] GetAccountPaymentList API error:', response.status);
            return null;
        }

        const data = await response.json();
        console.log('[SupplierDebt] GetAccountPaymentList response:', data);

        if (!data.value || data.value.length === 0) {
            console.warn('[SupplierDebt] No payments found for partner');
            return null;
        }

        // Find payment matching the PaymentDate
        // Compare date strings - normalize both to ISO format for comparison
        const targetDate = new Date(paymentDate).getTime();

        const matchingPayment = data.value.find(payment => {
            const apiDate = new Date(payment.PaymentDate).getTime();
            // Allow 1 second tolerance for date matching
            return Math.abs(apiDate - targetDate) < 1000;
        });

        if (matchingPayment) {
            console.log('[SupplierDebt] Found matching payment:', matchingPayment);
            return matchingPayment.Id;
        }

        // If exact match not found, try matching by date only (ignore time)
        const targetDateOnly = paymentDate.split('T')[0];
        const matchByDateOnly = data.value.find(payment => {
            const apiDateOnly = payment.PaymentDate.split('T')[0];
            return apiDateOnly === targetDateOnly;
        });

        if (matchByDateOnly) {
            console.log('[SupplierDebt] Found payment by date (ignoring time):', matchByDateOnly);
            return matchByDateOnly.Id;
        }

        console.warn('[SupplierDebt] No payment found matching date:', paymentDate);
        return null;

    } catch (error) {
        console.error('[SupplierDebt] Error looking up payment ID by date:', error);
        return null;
    }
}

async function deletePayment(paymentId, partnerId) {
    try {
        const tposPostHeaders = { 'Content-Type': 'application/json;charset=UTF-8', 'feature-version': '2', 'x-tpos-lang': 'vi' };

        // Step 1: Call ActionCancel to cancel the payment
        const cancelUrl = `${CONFIG.API_BASE}/AccountPayment/ODataService.ActionCancel`;
        const cancelResponse = await tposFetch(cancelUrl, {
            method: 'POST',
            headers: tposPostHeaders,
            body: JSON.stringify({ id: paymentId })
        });

        if (!cancelResponse.ok) {
            const errorData = await cancelResponse.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Lỗi hủy thanh toán');
        }

        // Step 2: DELETE the payment
        const deleteUrl = `${CONFIG.API_BASE}/AccountPayment(${paymentId})`;
        const deleteResponse = await tposFetch(deleteUrl, {
            method: 'DELETE',
            headers: { 'feature-version': '2', 'x-tpos-lang': 'vi' }
        });

        if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Lỗi xóa thanh toán');
        }

        if (window.notificationManager) {
            window.notificationManager.success('Đã xóa thanh toán thành công');
        }

        // Refresh the congNo tab
        await refreshCongNo(partnerId);

        // Refresh main data
        await fetchData();

    } catch (error) {
        console.error('[SupplierDebt] Delete payment error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`);
        }
    }
}

// =====================================================
// PAGINATION HANDLERS
// =====================================================

function goToPage(page) {
    const totalPages = Math.ceil(State.totalCount / State.pageSize);
    if (page < 1 || page > totalPages) return;

    State.currentPage = page;
    fetchData();
}

function changePageSize(size) {
    State.pageSize = parseInt(size, 10);
    State.currentPage = 1;
    fetchData();
}

// =====================================================
// EXPORT TO EXCEL
// =====================================================

async function exportToExcel() {
    if (State.filteredData.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có dữ liệu để xuất');
        }
        return;
    }

    try {
        // Create CSV content
        const headers = ['Mã NCC', 'Tên NCC', 'Phát sinh', 'Thanh toán', 'Nợ cuối kỳ'];
        const rows = State.filteredData.map(item => [
            item.Code || '',
            item.PartnerName || '',
            item.Debit || 0,
            item.Credit || 0,
            item.End || 0
        ]);

        // Add totals row
        let totalDebit = 0, totalCredit = 0, totalEnd = 0;
        State.filteredData.forEach(item => {
            totalDebit += item.Debit || 0;
            totalCredit += item.Credit || 0;
            totalEnd += item.End || 0;
        });
        rows.push(['Tổng', '', totalDebit, totalCredit, totalEnd]);

        // Build CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell =>
                typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell
            ).join(','))
        ].join('\n');

        // Add BOM for Excel UTF-8 support
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // Download
        const link = document.createElement('a');
        const dateStr = formatDate(new Date()).replace(/\//g, '-');
        link.download = `cong-no-nha-cung-cap-${dateStr}.csv`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);

        if (window.notificationManager) {
            window.notificationManager.success('Đã xuất file Excel thành công');
        }
    } catch (error) {
        console.error('[SupplierDebt] Export error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi xuất file');
        }
    }
}

// =====================================================
// SUPPLIER NOTE EDIT (modal)
// =====================================================

let _supplierNoteEditCode = '';

function openSupplierNoteEdit(supplierCode, supplierName) {
    _supplierNoteEditCode = supplierCode;
    const modal = document.getElementById('supplierNoteModal');
    const label = document.getElementById('supplierNoteLabel');
    const textarea = document.getElementById('supplierNoteText');
    label.textContent = `[${supplierCode}] ${supplierName}`;
    textarea.value = SupplierNotesStore.get(supplierCode);
    modal.classList.add('show');
    setTimeout(() => textarea.focus(), 100);
}

function closeSupplierNoteModal() {
    document.getElementById('supplierNoteModal')?.classList.remove('show');
    _supplierNoteEditCode = '';
}

function saveSupplierNote() {
    const note = document.getElementById('supplierNoteText').value;
    SupplierNotesStore.set(_supplierNoteEditCode, note).then(() => {
        closeSupplierNoteModal();
        renderTable();
        if (window.lucide) window.lucide.createIcons();
        if (window.notificationManager) {
            window.notificationManager.success(note ? 'Đã lưu ghi chú' : 'Đã xóa ghi chú');
        }
    });
}

function initSupplierNoteModal() {
    document.getElementById('btnCloseSupplierNote')?.addEventListener('click', closeSupplierNoteModal);
    document.getElementById('btnCancelSupplierNote')?.addEventListener('click', closeSupplierNoteModal);
    document.getElementById('btnSaveSupplierNote')?.addEventListener('click', saveSupplierNote);
    document.getElementById('supplierNoteModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'supplierNoteModal') closeSupplierNoteModal();
    });
    document.getElementById('supplierNoteText')?.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') saveSupplierNote();
    });
}

// =====================================================
// CREATE SUPPLIER (API + modal)
// =====================================================

function openCreateSupplierModal() {
    const modal = document.getElementById('createSupplierModal');
    document.getElementById('newSupplierRef').value = '';
    document.getElementById('newSupplierName').value = '';
    document.getElementById('newSupplierNote').value = '';
    modal.classList.add('show');
    setTimeout(() => document.getElementById('newSupplierRef').focus(), 100);
}

function closeCreateSupplierModal() {
    document.getElementById('createSupplierModal')?.classList.remove('show');
}

async function submitCreateSupplier() {
    const ref = document.getElementById('newSupplierRef').value.trim();
    const name = document.getElementById('newSupplierName').value.trim();
    const note = document.getElementById('newSupplierNote').value.trim();

    if (!ref || !name) {
        if (window.notificationManager) window.notificationManager.warning('Vui lòng nhập Mã NCC và Tên NCC');
        return;
    }

    try {
        const body = {
            Id: 0, Name: name, Ref: ref, Supplier: true, Customer: false,
            Active: true, Employee: false, IsCompany: false, CompanyId: 1,
            Type: 'contact', CompanyType: 'person', Credit: 0, Debit: 0,
            Discount: 0, AmountDiscount: 0, CreditLimit: 0, OverCredit: false,
            CategoryId: 0, Status: 'Normal', StatusText: 'Bình thường',
            Source: 'Default', IsNewAddress: false, Ward_District_City: '',
            DateCreated: new Date().toISOString(),
            City: {}, District: {}, Ward: {},
            ExtraAddress: { Street: null, City: {}, District: {}, Ward: {} },
            AccountPayable: { Id: 4, Name: 'Phải trả người bán', Code: '331', UserTypeId: 2, UserTypeName: 'Payable', Active: true, CompanyId: 1, CompanyName: 'NJD Live', InternalType: 'payable', NameGet: '331 Phải trả người bán', Reconcile: true },
            AccountReceivable: { Id: 1, Name: 'Phải thu của khách hàng', Code: '131', UserTypeId: 1, UserTypeName: 'Receivable', Active: true, CompanyId: 1, CompanyName: 'NJD Live', InternalType: 'receivable', NameGet: '131 Phải thu của khách hàng', Reconcile: true },
            StockCustomer: { Id: 9, Usage: 'customer', ScrapLocation: false, Name: 'Khách hàng', CompleteName: 'Địa điểm đối tác / Khách hàng', ParentLocationId: 2, Active: true, ParentLeft: 13, NameGet: 'Địa điểm đối tác/Khách hàng' },
            StockSupplier: { Id: 8, Usage: 'supplier', ScrapLocation: false, Name: 'Nhà cung cấp', CompleteName: 'Địa điểm đối tác / Nhà cung cấp', ParentLocationId: 2, Active: true, ParentLeft: 15, NameGet: 'Địa điểm đối tác/Nhà cung cấp' }
        };

        const url = `${CONFIG.API_BASE_PARTNER}/odata/Partner`;
        const response = await tposFetch(url, {
            method: 'POST',
            headers: { 'feature-version': '2' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `HTTP ${response.status}`);
        }

        await response.json();

        // Save note if provided
        if (note) {
            await SupplierNotesStore.set(ref, note);
        }

        closeCreateSupplierModal();
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo NCC [${ref}] ${name}`);
        }

        // Refresh supplier list and data
        State.allSuppliers = [];
        await fetchData();

    } catch (error) {
        console.error('[SupplierDebt] Error creating supplier:', error);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi tạo NCC: ${error.message}`);
        }
    }
}

function initCreateSupplierModal() {
    document.getElementById('btnCreateSupplier')?.addEventListener('click', openCreateSupplierModal);
    document.getElementById('btnCloseCreateSupplier')?.addEventListener('click', closeCreateSupplierModal);
    document.getElementById('btnCancelCreateSupplier')?.addEventListener('click', closeCreateSupplierModal);
    document.getElementById('btnSubmitCreateSupplier')?.addEventListener('click', submitCreateSupplier);
    document.getElementById('createSupplierModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'createSupplierModal') closeCreateSupplierModal();
    });
}

// =====================================================
// SEARCHABLE SUPPLIER DROPDOWN
// =====================================================

function initSearchableSupplierDropdown() {
    const input = document.getElementById('supplierSearchInput');
    const dropdown = document.getElementById('supplierDropdown');
    const clearBtn = DOM.clearSupplier;
    if (!input || !dropdown) return;

    function renderDropdownItems(filter = '') {
        const lowerFilter = filter.toLowerCase();
        const filtered = State.allSuppliers.filter(s => {
            const text = `[${s.Code}] ${s.PartnerName}`.toLowerCase();
            return !filter || text.includes(lowerFilter);
        });

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="searchable-dropdown-item disabled">Không tìm thấy</div>';
        } else {
            dropdown.innerHTML = filtered.map(s =>
                `<div class="searchable-dropdown-item" data-value="${escapeHtml(s.Code)}">[${escapeHtml(s.Code)}] ${escapeHtml(s.PartnerName)}</div>`
            ).join('');
        }
        dropdown.style.display = 'block';
    }

    input.addEventListener('focus', () => renderDropdownItems(input.value));
    input.addEventListener('input', () => renderDropdownItems(input.value));

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.searchable-dropdown-item');
        if (!item || item.classList.contains('disabled')) return;
        const value = item.dataset.value;
        input.value = item.textContent;
        dropdown.style.display = 'none';
        State.selectedSupplier = value;
        clearBtn.style.display = 'flex';
        applySupplierFilter();
        renderTable();
        calculateTotals();
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        State.selectedSupplier = '';
        clearBtn.style.display = 'none';
        dropdown.style.display = 'none';
        applySupplierFilter();
        renderTable();
        calculateTotals();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#supplierSearchWrapper')) {
            dropdown.style.display = 'none';
        }
    });
}

// =====================================================
// EVENT HANDLERS
// =====================================================

function initEventHandlers() {
    // Filter toggle button
    DOM.btnFilterToggle.addEventListener('click', () => {
        const section = DOM.filterSection;
        const btn = DOM.btnFilterToggle;
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? '' : 'none';
        btn.classList.toggle('active', isHidden);
        if (isHidden) lucide.createIcons({ nodes: [section] });
    });

    // Search button
    DOM.btnSearch.addEventListener('click', () => {
        State.currentPage = 1;
        fetchData();
    });

    // Export button
    DOM.btnExport.addEventListener('click', exportToExcel);

    // Refresh button
    DOM.btnRefresh.addEventListener('click', () => {
        fetchData();
    });

    // Display radio buttons
    DOM.displayRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            State.display = this.value;
        });
    });

    // Page size
    DOM.pageSize.addEventListener('change', function() {
        changePageSize(this.value);
    });

    // Pagination buttons
    DOM.btnFirst.addEventListener('click', () => goToPage(1));
    DOM.btnPrev.addEventListener('click', () => goToPage(State.currentPage - 1));
    DOM.btnNext.addEventListener('click', () => goToPage(State.currentPage + 1));
    DOM.btnLast.addEventListener('click', () => goToPage(Math.ceil(State.totalCount / State.pageSize)));

    // Enter key on date inputs
    [DOM.dateFromDisplay, DOM.dateToDisplay].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                DOM.btnSearch.click();
            }
        });
    });
}

// =====================================================
// INITIALIZATION
// =====================================================

async function init() {
    console.log('[SupplierDebt] Initializing...');

    // Wait for token manager to be ready
    if (window.tokenManager && window.tokenManager.initPromise) {
        await window.tokenManager.initPromise;
    }

    // Initialize date inputs
    initDateInputs();

    // Initialize event handlers
    initEventHandlers();

    // Initialize column toggle
    initColumnToggle();

    // Initialize payment modal
    initPaymentModal();

    // Initialize note edit modal
    initNoteEditModal();

    // Initialize invoice detail modal
    initInvoiceDetailModal();

    // Initialize supplier note modal
    initSupplierNoteModal();

    // Initialize create supplier modal
    initCreateSupplierModal();

    // Initialize searchable supplier dropdown
    initSearchableSupplierDropdown();

    // Initialize web notes store
    await WebNotesStore.init();

    // Initialize supplier notes store
    await SupplierNotesStore.init();

    // Load initial data
    await fetchData();

    console.log('[SupplierDebt] Initialization complete');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
