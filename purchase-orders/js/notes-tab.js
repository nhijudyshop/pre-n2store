/**
 * PURCHASE ORDERS MODULE - NOTES TAB (Ghi chú)
 * File: notes-tab.js
 * Purpose: Manage product notes from History tab with 15-day countdown & 30-day auto-delete
 * Data stored in Firestore: purchase_notes/items
 */

window.PurchaseOrderNotes = (function () {
    'use strict';

    const FIRESTORE_DOC = 'purchase_notes/items';
    const EXPIRE_DAYS = 30;
    const OVERDUE_DAYS = 15;

    let items = []; // Array of note items
    let loaded = false;
    let searchTerm = '';

    // DOM containers
    let tableContainer = null;
    let paginationContainer = null;
    let filterContainer = null;

    // =====================================================
    // FIRESTORE CRUD
    // =====================================================

    async function loadItems() {
        if (loaded) return;
        try {
            const db = firebase.firestore();
            const doc = await db.doc(FIRESTORE_DOC).get();
            if (doc.exists) {
                items = doc.data().items || [];
            }
            // Cleanup expired items (> 30 days)
            const now = Date.now();
            const before = items.length;
            items = items.filter(it => (now - it.createdAt) < EXPIRE_DAYS * 24 * 60 * 60 * 1000);
            if (items.length !== before) saveItems();
            loaded = true;
        } catch (e) {
            console.warn('[Notes] Failed to load:', e);
        }
    }

    function saveItems() {
        try {
            const db = firebase.firestore();
            db.doc(FIRESTORE_DOC).set({ items, lastUpdated: Date.now() });
        } catch (e) {
            console.warn('[Notes] Failed to save:', e);
        }
    }

    function addItem(noteItem) {
        // Avoid duplicates by key
        if (items.some(it => it.key === noteItem.key)) return;
        items.push(noteItem);
        saveItems();
    }

    function removeByKey(key) {
        items = items.filter(it => it.key !== key);
        saveItems();
    }

    function removeItem(index) {
        items.splice(index, 1);
        saveItems();
        renderNotesTable();
    }

    function updateNote(index, newNote) {
        if (items[index]) {
            items[index].note = newNote;
            saveItems();
        }
    }

    // =====================================================
    // OVERDUE CHECK (used by main.js across all tabs)
    // =====================================================

    /**
     * Get overdue items (older than 15 days), grouped by supplier
     */
    async function getOverdueItems() {
        await loadItems();
        const now = Date.now();
        const threshold = OVERDUE_DAYS * 24 * 60 * 60 * 1000;
        const overdue = items.filter(it => (now - it.createdAt) >= threshold);

        // Group by supplier
        const grouped = {};
        overdue.forEach(it => {
            const key = it.supplierName || 'Không rõ';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(it);
        });
        return grouped;
    }

    // =====================================================
    // COUNTDOWN HELPERS
    // =====================================================

    function getCountdown(createdAt) {
        const elapsed = Date.now() - createdAt;
        const remaining = (OVERDUE_DAYS * 24 * 60 * 60 * 1000) - elapsed;
        if (remaining <= 0) return { days: 0, overdue: true };
        const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        return { days, overdue: false };
    }

    function formatDate(ts) {
        const d = new Date(ts);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${d.getFullYear()}`;
    }

    // =====================================================
    // RENDER
    // =====================================================

    async function init() {
        tableContainer = document.getElementById('tableContainer');
        paginationContainer = document.getElementById('pagination');
        filterContainer = document.getElementById('filterBar');

        if (paginationContainer) paginationContainer.innerHTML = '';

        if (filterContainer) {
            filterContainer.innerHTML = `
                <div class="filter-bar">
                    <div class="filter-group">
                        <label class="filter-label" style="font-weight: 600; font-size: 14px;">
                            Hàng bán dùm từ tab Lịch sử
                        </label>
                        <span style="font-size: 12px; color: var(--color-text-muted);">
                            Tự xóa sau ${EXPIRE_DAYS} ngày · Cảnh báo sau ${OVERDUE_DAYS} ngày
                        </span>
                    </div>
                    <div class="filter-group filter-group--search">
                        <label class="filter-label">Tìm NCC</label>
                        <div class="input-icon">
                            <i data-lucide="search"></i>
                            <input type="text" id="notesSearchInput" class="filter-input"
                                   value="${searchTerm}"
                                   placeholder="Tên NCC... (Enter để tìm)">
                        </div>
                    </div>
                    <div class="filter-group filter-group--actions">
                        <button id="btnNotesReload" class="btn btn-outline" title="Tải lại">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                    </div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            document.getElementById('btnNotesReload')?.addEventListener('click', () => {
                loaded = false;
                init();
            });
            const searchInput = document.getElementById('notesSearchInput');
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); searchTerm = searchInput.value.trim(); renderNotesTable(); }
            });
            searchInput.addEventListener('input', () => {
                if (searchInput.value === '' && searchTerm !== '') { searchTerm = ''; renderNotesTable(); }
            });
        }

        await loadItems();
        renderNotesTable();
    }

    function renderNotesTable() {
        if (!tableContainer) return;

        // Filter by search
        const filtered = searchTerm
            ? items.filter(it => (it.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase()))
            : items;

        if (!filtered || filtered.length === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty">
                    <div class="table-empty__icon"><i data-lucide="clipboard"></i></div>
                    <div class="table-empty__title">Chưa có ghi chú</div>
                    <div class="table-empty__description">Vào tab Lịch sử, mở chi tiết đơn hàng và check sản phẩm để thêm ghi chú</div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const rows = filtered.map((item, idx) => {
            const realIdx = items.indexOf(item);
            const cd = getCountdown(item.createdAt);
            const countdownHtml = cd.overdue
                ? '<span style="color: var(--color-danger); font-weight: 700;">Quá hạn!</span>'
                : `<span style="color: ${cd.days <= 3 ? 'var(--color-warning)' : 'var(--color-text-muted)'}; font-weight: 600;">${cd.days} ngày</span>`;

            return `
                <tr style="border-top: ${idx > 0 ? '1px solid var(--color-border-light)' : 'none'};">
                    <td style="width: 40px; text-align: center; font-size: 12px; color: var(--color-text-muted);">${idx + 1}</td>
                    <td><span style="font-size: 13px;">${escapeHtml(item.supplierName || '')}</span></td>
                    <td>
                        <div style="font-weight: 500; font-size: 13px;">${escapeHtml(item.productName || '')}</div>
                        <div style="font-size: 11px; color: var(--color-text-muted);">${escapeHtml(item.productCode || '')}</div>
                    </td>
                    <td style="text-align: right;"><span style="font-size: 13px;">${item.quantity || ''}</span></td>
                    <td>
                        <input type="text" class="note-edit-input" data-idx="${realIdx}"
                               value="${escapeHtml(item.note || '')}"
                               style="width: 100%; border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 8px; font-size: 13px; background: white;">
                    </td>
                    <td style="text-align: center;">${countdownHtml}</td>
                    <td style="text-align: center; font-size: 12px; color: var(--color-text-muted);">${formatDate(item.createdAt)}</td>
                    <td style="text-align: center; width: 40px;">
                        <button class="btn-icon text-danger note-delete-btn" data-idx="${realIdx}" title="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <table class="po-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th>Nhà cung cấp</th>
                            <th>Sản phẩm</th>
                            <th style="text-align: right; width: 70px;">SL</th>
                            <th>Ghi chú</th>
                            <th style="text-align: center; width: 90px;">Còn lại</th>
                            <th style="text-align: center; width: 90px;">Ngày thêm</th>
                            <th style="width: 40px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind note edit (save on blur/enter)
        tableContainer.querySelectorAll('.note-edit-input').forEach(input => {
            const save = () => {
                const idx = parseInt(input.dataset.idx, 10);
                updateNote(idx, input.value);
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });
        });

        // Bind delete
        tableContainer.querySelectorAll('.note-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                removeItem(idx);
            });
        });
    }

    function destroy() {
        // Nothing to cleanup, data persists
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function hasKey(key) {
        return items.some(it => it.key === key);
    }

    return {
        init,
        destroy,
        addItem,
        removeByKey,
        getOverdueItems,
        loadItems,
        hasKey
    };
})();

console.log('[Purchase Orders] Notes tab loaded');
