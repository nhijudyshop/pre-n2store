/**
 * Order Creation History Module
 * Tracks and displays history of orders created via "Phiếu bán hàng" and "Tạo nhanh PBH"
 * Data stored in Firebase Firestore with auto-delete after 14 days
 *
 * Optimized for 4000+ records with:
 * - Server-side date filtering
 * - Client-side pagination (50/100/200 per page)
 * - Debounced search
 */

(function() {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================
    const COLLECTION_NAME = 'order_creation_history';
    const RETENTION_DAYS = 14;
    const DEFAULT_PAGE_SIZE = 50;
    const PAGE_SIZE_OPTIONS = [50, 100, 200];

    // =====================================================
    // STATE
    // =====================================================
    let historyData = [];      // All loaded data from Firebase
    let filteredData = [];     // After applying search/source filter
    let currentPage = 1;
    let pageSize = DEFAULT_PAGE_SIZE;
    let isLoading = false;
    let totalRecords = 0;

    // =====================================================
    // FIREBASE HELPERS
    // =====================================================

    function getFirestore() {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
        console.warn('[ORDER-HISTORY] Firestore not available');
        return null;
    }

    function getCollection() {
        const db = getFirestore();
        if (!db) return null;
        return db.collection(COLLECTION_NAME);
    }

    // =====================================================
    // SAVE HISTORY
    // =====================================================

    async function saveOrderHistory(orderData, source) {
        try {
            const collection = getCollection();
            if (!collection) {
                console.warn('[ORDER-HISTORY] Cannot save - Firestore not available');
                return false;
            }

            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

            // Get current user from multiple sources (authManager preferred)
            const currentUser = getCurrentUsername();

            // Create date string for efficient querying (YYYY-MM-DD)
            const dateStr = now.toISOString().split('T')[0];

            // Get user campaign name from campaignManager (user-defined, not TPOS)
            const userCampaignName = window.campaignManager?.activeCampaign?.name || '';

            const historyRecord = {
                createdAt: firebase.firestore.Timestamp.fromDate(now),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                dateStr: dateStr, // For efficient date range queries

                saleOnlineId: orderData.saleOnlineId || orderData.SaleOnlineIds?.[0] || null,
                reference: orderData.reference || orderData.Reference || '',
                fastSaleOrderId: orderData.fastSaleOrderId || orderData.Id || null,
                liveCampaignId: orderData.liveCampaignId || orderData.LiveCampaignId || null,
                liveCampaignName: orderData.liveCampaignName || orderData.LiveCampaignName || '',
                userCampaignName: userCampaignName, // User-defined campaign name (from modalUserCampaignSelect)
                customerName: orderData.customerName || orderData.PartnerDisplayName || orderData.ReceiverName || '',
                customerPhone: orderData.customerPhone || orderData.Phone || orderData.ReceiverPhone || '',
                address: orderData.address || orderData.ReceiverAddress || orderData.Address || '',
                products: (orderData.products || orderData.OrderLines || []).map(p => ({
                    name: p.ProductName || p.name || '',
                    quantity: p.ProductUOMQty || p.quantity || 1,
                    price: p.PriceUnit || p.price || 0,
                    total: p.PriceTotal || p.total || 0
                })),
                totalAmount: orderData.totalAmount || orderData.AmountTotal || 0,
                shippingFee: orderData.shippingFee || orderData.DeliveryPrice || 0,
                carrierId: orderData.carrierId || orderData.CarrierId || null,
                carrierName: orderData.carrierName || orderData.CarrierName || '',
                source: source,
                createdBy: currentUser,
                sessionIndex: orderData.sessionIndex || orderData.SessionIndex || '',

                // Searchable fields (lowercase for case-insensitive search)
                _searchName: (orderData.customerName || orderData.PartnerDisplayName || '').toLowerCase(),
                _searchPhone: (orderData.customerPhone || orderData.Phone || '').replace(/\D/g, '')
            };

            await collection.add(historyRecord);
            console.log('[ORDER-HISTORY] ✅ Saved order history:', historyRecord.reference);
            updateBadgeCount();
            return true;
        } catch (error) {
            console.error('[ORDER-HISTORY] Error saving history:', error);
            return false;
        }
    }

    async function saveOrderHistoryBatch(ordersData, source) {
        try {
            const collection = getCollection();
            if (!collection) return false;

            const batch = getFirestore().batch();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const dateStr = now.toISOString().split('T')[0];
            // Get current user from multiple sources (authManager preferred)
            const currentUser = getCurrentUsername();

            // Get user campaign name from campaignManager (user-defined, not TPOS)
            const userCampaignName = window.campaignManager?.activeCampaign?.name || '';

            for (const orderData of ordersData) {
                const docRef = collection.doc();
                const customerName = orderData.PartnerDisplayName || orderData.ReceiverName || '';
                const customerPhone = orderData.Phone || orderData.ReceiverPhone || '';

                const historyRecord = {
                    createdAt: firebase.firestore.Timestamp.fromDate(now),
                    expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                    dateStr: dateStr,
                    saleOnlineId: orderData.SaleOnlineIds?.[0] || null,
                    reference: orderData.Reference || '',
                    fastSaleOrderId: orderData.Id || null,
                    liveCampaignId: orderData.LiveCampaignId || null,
                    liveCampaignName: orderData.LiveCampaignName || '',
                    userCampaignName: userCampaignName, // User-defined campaign name
                    customerName: customerName,
                    customerPhone: customerPhone,
                    address: orderData.ReceiverAddress || orderData.Address || '',
                    products: (orderData.OrderLines || []).map(p => ({
                        name: p.ProductName || '',
                        quantity: p.ProductUOMQty || 1,
                        price: p.PriceUnit || 0,
                        total: p.PriceTotal || 0
                    })),
                    totalAmount: orderData.AmountTotal || 0,
                    shippingFee: orderData.DeliveryPrice || 0,
                    carrierId: orderData.CarrierId || null,
                    carrierName: orderData.CarrierName || '',
                    source: source,
                    createdBy: currentUser,
                    sessionIndex: orderData.SessionIndex || '',
                    _searchName: customerName.toLowerCase(),
                    _searchPhone: customerPhone.replace(/\D/g, '')
                };
                batch.set(docRef, historyRecord);
            }

            await batch.commit();
            console.log(`[ORDER-HISTORY] ✅ Saved ${ordersData.length} orders to history`);
            updateBadgeCount();
            return true;
        } catch (error) {
            console.error('[ORDER-HISTORY] Error saving batch history:', error);
            return false;
        }
    }

    // =====================================================
    // LOAD CAMPAIGNS LIST (by campaign NAME, not ID)
    // =====================================================

    let campaignsList = []; // Cache campaigns for dropdown

    async function loadCampaigns() {
        try {
            const collection = getCollection();
            if (!collection) return;

            // Get distinct campaigns from recent records (grouped by NAME)
            const snapshot = await collection
                .orderBy('createdAt', 'desc')
                .limit(2000)
                .get();

            const campaignsMap = new Map();
            snapshot.forEach(doc => {
                const data = doc.data();
                const name = data.liveCampaignName;
                // Group by campaign NAME (not ID) because there are 2 pages
                if (name && !campaignsMap.has(name)) {
                    campaignsMap.set(name, {
                        name: name,
                        date: data.createdAt?.toDate?.() || new Date()
                    });
                }
            });

            // Sort by date descending (most recent first)
            campaignsList = Array.from(campaignsMap.values())
                .sort((a, b) => b.date - a.date);

            console.log(`[ORDER-HISTORY] Found ${campaignsList.length} campaigns (by name)`);
            renderCampaignDropdown();

        } catch (error) {
            console.error('[ORDER-HISTORY] Error loading campaigns:', error);
        }
    }

    function renderCampaignDropdown() {
        const select = document.getElementById('orderHistoryCampaign');
        if (!select) return;

        const currentValue = select.value;

        select.innerHTML = `
            <option value="">-- Chọn chiến dịch --</option>
            ${campaignsList.map(c => `
                <option value="${escapeHtml(c.name)}" ${c.name === currentValue ? 'selected' : ''}>
                    ${escapeHtml(c.name)}
                </option>
            `).join('')}
        `;
    }

    // =====================================================
    // LOAD HISTORY (By Campaign NAME)
    // =====================================================

    async function loadHistory() {
        try {
            isLoading = true;
            renderLoading();

            const collection = getCollection();
            if (!collection) {
                historyData = [];
                renderEmpty('Firestore chưa được khởi tạo');
                return;
            }

            // Get selected campaign NAME (not ID)
            const campaignName = document.getElementById('orderHistoryCampaign')?.value;

            if (!campaignName) {
                historyData = [];
                renderEmpty('Vui lòng chọn chiến dịch để xem lịch sử');
                return;
            }

            console.log(`[ORDER-HISTORY] Loading history for campaign: ${campaignName}`);

            // Query by campaign NAME (not ID) - works across both pages
            const snapshot = await collection
                .where('liveCampaignName', '==', campaignName)
                .orderBy('createdAt', 'desc')
                .limit(5000)
                .get();

            historyData = [];
            const now = new Date();

            snapshot.forEach(doc => {
                const data = doc.data();
                const expiresAt = data.expiresAt?.toDate?.() || new Date(0);
                if (expiresAt > now) {
                    historyData.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        expiresAt: expiresAt
                    });
                }
            });

            console.log(`[ORDER-HISTORY] Loaded ${historyData.length} records for campaign "${campaignName}"`);

            // Reset to page 1 when loading new data
            currentPage = 1;
            applyFilters();
            updateBadgeCount();

        } catch (error) {
            console.error('[ORDER-HISTORY] Error loading history:', error);
            renderEmpty('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            isLoading = false;
        }
    }

    async function cleanupExpiredRecords() {
        try {
            const collection = getCollection();
            if (!collection) return;

            const now = firebase.firestore.Timestamp.fromDate(new Date());
            const snapshot = await collection
                .where('expiresAt', '<', now)
                .limit(100)
                .get();

            if (snapshot.empty) {
                console.log('[ORDER-HISTORY] No expired records to clean');
                return;
            }

            const batch = getFirestore().batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`[ORDER-HISTORY] Cleaned ${snapshot.size} expired records`);

        } catch (error) {
            console.error('[ORDER-HISTORY] Error cleaning expired records:', error);
        }
    }

    // =====================================================
    // FILTER & SEARCH (Client-side for text search)
    // =====================================================

    /**
     * Check if current user is admin
     * Admin: checkLogin === 1 OR userType starts with "admin" (case-insensitive)
     */
    function isAdmin() {
        // Check authManager first
        if (typeof window.authManager !== 'undefined') {
            const authState = window.authManager.getUserInfo?.() || window.authManager.getAuthState?.();
            if (authState) {
                // checkLogin === 1 means admin level
                if (authState.checkLogin === 1) return true;
                // userType starts with "admin" (case-insensitive)
                if (authState.userType?.toLowerCase().startsWith('admin')) return true;
            }
        }

        // Fallback to localStorage
        const storedUserType = localStorage.getItem('userType');
        if (storedUserType?.toLowerCase().startsWith('admin')) return true;

        const storedCheckLogin = localStorage.getItem('checkLogin');
        if (storedCheckLogin === '1') return true;

        return false;
    }

    function applyFilters() {
        const searchInput = document.getElementById('orderHistorySearch');
        const sourceSelect = document.getElementById('orderHistorySource');

        const searchTerm = (searchInput?.value || '').toLowerCase().trim();
        const sourceFilter = sourceSelect?.value || '';

        // Get current username and admin status for permission filtering
        const currentUsername = getCurrentUsername();
        const userIsAdmin = isAdmin();

        // Client-side filtering for search, source, and permission
        filteredData = historyData.filter(record => {
            // Permission filter: non-admin can only see their own records
            if (!userIsAdmin && record.createdBy !== currentUsername) {
                return false;
            }

            // Source filter
            if (sourceFilter && record.source !== sourceFilter) {
                return false;
            }

            // Search filter (client-side for flexibility)
            if (searchTerm) {
                const searchFields = [
                    record.customerName,
                    record.customerPhone,
                    record.reference,
                    record.address,
                    record.carrierName,
                    record.liveCampaignName,
                    record.createdBy,
                    String(record.sessionIndex || '') // STT search (convert to string)
                ].map(f => (f || '').toLowerCase());

                if (!searchFields.some(f => f.includes(searchTerm))) {
                    return false;
                }
            }

            return true;
        });

        totalRecords = filteredData.length;

        // Ensure current page is valid
        const maxPage = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > maxPage) {
            currentPage = maxPage;
        }

        renderTable();
        renderPagination();
        updateFilterStats();
    }

    function updateFilterStats() {
        const statsEl = document.getElementById('orderHistoryFilterStats');
        if (statsEl) {
            const start = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
            const end = Math.min(currentPage * pageSize, totalRecords);
            statsEl.textContent = `${start}-${end} / ${totalRecords} bản ghi`;
        }
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function getCurrentPageData() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return filteredData.slice(start, end);
    }

    function goToPage(page) {
        const maxPage = Math.ceil(totalRecords / pageSize) || 1;
        currentPage = Math.max(1, Math.min(page, maxPage));
        renderTable();
        renderPagination();
        updateFilterStats();

        // Scroll to top of table
        document.querySelector('.order-history-modal .modal-body')?.scrollTo(0, 0);
    }

    function changePageSize(newSize) {
        pageSize = newSize;
        currentPage = 1; // Reset to first page
        renderTable();
        renderPagination();
        updateFilterStats();
    }

    function renderPagination() {
        const container = document.getElementById('orderHistoryPagination');
        if (!container) return;

        const totalPages = Math.ceil(totalRecords / pageSize) || 1;

        let paginationHtml = `
            <div class="pagination-info">
                <select id="orderHistoryPageSize" class="page-size-select">
                    ${PAGE_SIZE_OPTIONS.map(size =>
                        `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}/trang</option>`
                    ).join('')}
                </select>
            </div>
            <div class="pagination-controls">
        `;

        // Previous button
        paginationHtml += `
            <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            paginationHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
            paginationHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        paginationHtml += `
            <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        paginationHtml += '</div>';

        container.innerHTML = paginationHtml;

        // Bind events
        container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    goToPage(parseInt(btn.dataset.page));
                }
            });
        });

        document.getElementById('orderHistoryPageSize')?.addEventListener('change', (e) => {
            changePageSize(parseInt(e.target.value));
        });
    }

    // =====================================================
    // RENDER UI
    // =====================================================

    function renderLoading() {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9">
                        <div class="order-history-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Đang tải lịch sử...</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    function renderEmpty(message = 'Chưa có lịch sử ra đơn') {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9">
                        <div class="order-history-empty">
                            <i class="fas fa-history"></i>
                            <p>${message}</p>
                        </div>
                    </td>
                </tr>
            `;
        }
        renderPagination();
        updateFilterStats();
    }

    function renderTable() {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (!tbody) return;

        const pageData = getCurrentPageData();

        if (pageData.length === 0) {
            renderEmpty(historyData.length === 0 ? 'Chưa có lịch sử ra đơn (chọn ngày để tải)' : 'Không tìm thấy kết quả');
            return;
        }

        tbody.innerHTML = pageData.map(record => {
            const createdAt = record.createdAt;
            const dateStr = createdAt.toLocaleDateString('vi-VN');
            const timeStr = createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            // Check if order details available in localStorage (use for products count)
            const localOrderData = record.saleOnlineId ? getOrderFromLocalStorage(record.saleOnlineId) : null;
            const hasLocalData = !!localOrderData;

            // Use localStorage data for products count (more accurate), fallback to Firebase
            const products = localOrderData?.OrderLines || record.products || [];
            const productsCount = products.length;
            const totalQty = products.reduce((sum, p) => sum + (p.ProductUOMQty || p.quantity || 0), 0) || 0;

            return `
                <tr>
                    <td class="cell-stt" style="text-align:center; font-weight:500; color:#6366f1;">
                        ${escapeHtml(record.sessionIndex || '-')}
                    </td>
                    <td class="cell-time">
                        <div class="date">${dateStr}</div>
                        <div>${timeStr}</div>
                    </td>
                    <td class="cell-customer">
                        <div class="name">${escapeHtml(record.customerName || '-')}</div>
                        <div class="phone">${escapeHtml(record.customerPhone || '-')}</div>
                    </td>
                    <td class="cell-address" title="${escapeHtml(record.address || '')}">
                        ${escapeHtml(record.address || '-')}
                    </td>
                    <td>
                        <span title="${productsCount} SP, ${totalQty} cái">${productsCount} SP</span>
                    </td>
                    <td class="cell-amount">
                        ${formatCurrency(record.totalAmount)}
                    </td>
                    <td class="cell-source">
                        <span class="badge ${record.source === 'fast-sale' ? 'fast-sale' : 'sale-modal'}">
                            ${record.source === 'fast-sale' ? 'Tạo nhanh' : 'Phiếu BH'}
                        </span>
                    </td>
                    <td class="cell-user">
                        ${escapeHtml(record.createdBy || '-')}
                    </td>
                    <td class="cell-action">
                        ${hasLocalData ? `
                            <button class="btn-view-details"
                                onclick="window.OrderHistoryManager.showOrderDetails('${record.saleOnlineId}')"
                                onmouseenter="window.OrderHistoryManager.showBillPreview(this, '${record.saleOnlineId}')"
                                onmouseleave="window.OrderHistoryManager.hideBillPreview()"
                                title="Hover để xem nhanh, Click để xem chi tiết">
                                <i class="fas fa-eye"></i>
                            </button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        }).join('');

        renderPagination();
        updateFilterStats();
    }

    function updateBadgeCount() {
        // Badge disabled - always hide
        const badge = document.querySelector('.order-history-btn .badge');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    // =====================================================
    // MODAL CONTROL
    // =====================================================

    function showModal() {
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.classList.add('show');

            // Load campaigns list first
            loadCampaigns();

            // If a campaign is already selected, load its data
            const campaignName = document.getElementById('orderHistoryCampaign')?.value;
            if (campaignName) {
                loadHistory();
            } else {
                renderEmpty('Vui lòng chọn chiến dịch để xem lịch sử');
            }
        }
    }

    function hideModal() {
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    /**
     * Get current username from multiple sources (authManager preferred)
     * Order: authManager -> billTokenManager -> tokenManager -> 'unknown'
     */
    function getCurrentUsername() {
        // Try localStorage userType first (most reliable)
        const storedUserType = localStorage.getItem('userType');
        if (storedUserType) {
            // userType format: "admin-admin@@" -> take part BEFORE "-"
            if (storedUserType.includes('-')) {
                return storedUserType.split('-')[0];
            }
            return storedUserType;
        }

        // Try authManager (shared auth system)
        if (typeof window.authManager !== 'undefined') {
            const authState = window.authManager.getUserInfo?.() || window.authManager.getAuthState?.();
            if (authState?.userType) {
                const userType = authState.userType;
                // userType format: "admin-admin@@" -> take part BEFORE "-"
                if (userType.includes('-')) {
                    return userType.split('-')[0];
                }
                return userType;
            }
        }

        // Try getUserName function (legacy)
        if (typeof window.getUserName === 'function') {
            const name = window.getUserName();
            if (name && name !== 'unknown') return name;
        }

        // Fallback to tokenManagers
        return window.billTokenManager?.getUsername?.() ||
               window.tokenManager?.getUsername?.() ||
               'unknown';
    }

    /**
     * Get order details from invoiceStatusStore_v2 localStorage
     * @param {string} saleOnlineId - SaleOnline ID to lookup
     * @returns {object|null} Order data or null if not found
     */
    function getOrderFromLocalStorage(saleOnlineId) {
        if (!saleOnlineId) return null;

        try {
            const stored = localStorage.getItem('invoiceStatusStore_v2');
            if (!stored) return null;

            const parsed = JSON.parse(stored);
            const data = parsed.data || parsed;

            // Find the order by saleOnlineId
            for (const [key, value] of Object.entries(data)) {
                if (value && (value.SaleOnlineId === saleOnlineId || key.includes(saleOnlineId))) {
                    return value;
                }
            }
            return null;
        } catch (e) {
            console.warn('[ORDER-HISTORY] Error reading localStorage:', e);
            return null;
        }
    }

    /**
     * Detect carrier name from address when CarrierName is empty
     * Uses extractDistrictFromAddress from tab1-qr-debt.js
     * Maps to correct fee tier based on CARRIER-AUTO-SELECTION.md
     * @param {string} address - Receiver address
     * @returns {string} Carrier name with fee (e.g., "THÀNH PHỐ (20.000 đ)")
     */
    function detectCarrierFromAddress(address) {
        if (!address) return 'SHIP TỈNH';

        const normalized = address.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // District mappings based on CARRIER-AUTO-SELECTION.md
        // 20k: Q1, Q3, Q4, Q5, Q6, Q7, Q8, Q10, Q11, Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp
        const districts20k = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
        const named20k = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];

        // 30k: Q2, Q12, Bình Tân, Thủ Đức
        const districts30k = ['2', '12'];
        const named30k = ['binh tan', 'thu duc'];

        // 35k THÀNH PHỐ: Q9, Bình Chánh, Nhà Bè, Hóc Môn
        const districts35kTP = ['9'];
        const named35kTP = ['binh chanh', 'nha be', 'hoc mon'];

        // SHIP TỈNH: Củ Chi, Cần Giờ, provinces
        const shipTinh = ['cu chi', 'can gio'];

        // Use extractDistrictFromAddress if available
        if (typeof window.extractDistrictFromAddress === 'function') {
            const districtInfo = window.extractDistrictFromAddress(address, null);

            // Province -> SHIP TỈNH
            if (districtInfo.isProvince) {
                return 'SHIP TỈNH';
            }

            // Check district number
            const distNum = districtInfo.districtNumber;
            if (distNum) {
                if (districts20k.includes(distNum)) return 'THÀNH PHỐ (20.000 đ)';
                if (districts30k.includes(distNum)) return 'THÀNH PHỐ (30.000 đ)';
                if (districts35kTP.includes(distNum)) return 'THÀNH PHỐ (35.000 đ)';
            }
        }

        // Fallback pattern matching
        // Check for SHIP TỈNH first
        if (shipTinh.some(kw => normalized.includes(kw))) return 'SHIP TỈNH';

        // Check province keywords
        const provinceKeywords = ['tinh', 'province', 'binh duong', 'dong nai', 'long an', 'tay ninh', 'ba ria', 'can tho'];
        if (provinceKeywords.some(kw => normalized.includes(kw))) return 'SHIP TỈNH';

        // Check named districts (order matters: 35k -> 30k -> 20k)
        if (named35kTP.some(kw => normalized.includes(kw))) return 'THÀNH PHỐ (35.000 đ)';
        if (named30k.some(kw => normalized.includes(kw))) return 'THÀNH PHỐ (30.000 đ)';
        if (named20k.some(kw => normalized.includes(kw))) return 'THÀNH PHỐ (20.000 đ)';

        // Check district number pattern (Q1, Quận 5, etc.)
        const distMatch = normalized.match(/(?:q|quan|quận)\s*\.?\s*(\d+)/);
        if (distMatch) {
            const num = distMatch[1];
            if (districts20k.includes(num)) return 'THÀNH PHỐ (20.000 đ)';
            if (districts30k.includes(num)) return 'THÀNH PHỐ (30.000 đ)';
            if (districts35kTP.includes(num)) return 'THÀNH PHỐ (35.000 đ)';
        }

        // Default to SHIP TỈNH if unsure
        return 'SHIP TỈNH';
    }

    /**
     * Show bill preview on hover (positioned to the left of button)
     * Uses generateCustomBillHTML for consistent bill format
     * @param {HTMLElement} button - The button element
     * @param {string} saleOnlineId - SaleOnline ID
     */
    function showBillPreview(button, saleOnlineId) {
        // Remove any existing preview
        hideBillPreview();

        const orderData = getOrderFromLocalStorage(saleOnlineId);
        if (!orderData) return;

        // Check if generateCustomBillHTML is available
        if (typeof window.generateCustomBillHTML !== 'function') {
            console.warn('[ORDER-HISTORY] generateCustomBillHTML not available');
            return;
        }

        // Create preview container
        const preview = document.createElement('div');
        preview.id = 'billPreviewPopover';
        preview.style.cssText = `
            position: fixed;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            width: 320px;
            z-index: 10002;
            pointer-events: none;
            overflow: hidden;
        `;

        // Generate bill HTML using the official function
        // Transform localStorage data to match orderResult format
        // Auto-detect carrier from address if CarrierName is empty
        const carrierName = orderData.CarrierName || detectCarrierFromAddress(orderData.ReceiverAddress);

        // Freeship conditions:
        // - THÀNH PHỐ: Tổng tiền hàng > 1,500,000đ
        // - TỈNH: Tổng tiền hàng > 3,000,000đ
        const productTotal = orderData.AmountUntaxed || orderData.AmountTotal || 0;
        const isCity = carrierName && carrierName.includes('THÀNH PHỐ');
        const isProvince = carrierName && carrierName.includes('SHIP TỈNH');
        const qualifiesForFreeship = (isCity && productTotal > 1500000) || (isProvince && productTotal > 3000000);
        const shippingFee = qualifiesForFreeship ? 0 : (orderData.DeliveryPrice || 0);

        const orderResult = {
            Number: orderData.Number || orderData.Reference,
            Reference: orderData.Reference,
            CarrierName: carrierName,
            SessionIndex: orderData.SessionIndex,
            PartnerDisplayName: orderData.ReceiverName || orderData.PartnerName,
            ReceiverName: orderData.ReceiverName,
            ReceiverPhone: orderData.ReceiverPhone || orderData.Phone,
            ReceiverAddress: orderData.ReceiverAddress,
            DeliveryPrice: shippingFee,
            Discount: orderData.Discount || orderData.DecreaseAmount || orderData.DiscountAmount || 0,
            PaymentAmount: orderData.PaymentAmount || 0,
            UserName: orderData.UserName || '',
            AmountUntaxed: orderData.AmountUntaxed || orderData.AmountTotal || 0,
            AmountTotal: orderData.AmountTotal || 0,
            Comment: orderData.Comment,
            DateInvoice: orderData.DateInvoice,
            OrderLines: orderData.OrderLines || [],
            Partner: {
                Name: orderData.ReceiverName || orderData.PartnerName,
                Phone: orderData.ReceiverPhone || orderData.Phone,
                Street: orderData.ReceiverAddress
            }
        };

        const billHtml = window.generateCustomBillHTML(orderResult, { walletBalance: orderData.PaymentAmount || 0 });

        // Use iframe to render bill HTML (preserves CSS)
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%; height:400px; border:none; pointer-events:none;';
        preview.appendChild(iframe);

        document.body.appendChild(preview);

        // Write bill HTML to iframe
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(billHtml);
        doc.close();

        // Scale down the bill to fit preview (bill is 80mm wide)
        iframe.onload = function() {
            try {
                const body = doc.body;
                if (body) {
                    body.style.transform = 'scale(0.85)';
                    body.style.transformOrigin = 'top left';
                    body.style.width = '80mm';
                }
            } catch (e) {
                // Cross-origin issues, ignore
            }
        };

        // Position to the LEFT of button (so button is still clickable)
        const rect = button.getBoundingClientRect();
        const previewWidth = 320;
        const gap = 10;

        // Try left side first
        let left = rect.left - previewWidth - gap;
        if (left < 10) {
            // If no room on left, try right side
            left = rect.right + gap;
        }

        let top = rect.top - 100;
        // Keep within viewport
        if (top < 10) top = 10;
        if (top + 420 > window.innerHeight) top = window.innerHeight - 430;

        preview.style.left = left + 'px';
        preview.style.top = top + 'px';
    }

    /**
     * Hide bill preview
     */
    function hideBillPreview() {
        const existing = document.getElementById('billPreviewPopover');
        if (existing) existing.remove();
    }

    /**
     * Show order details modal/popup (on click)
     * Uses generateCustomBillHTML for exact bill preview
     * @param {string} saleOnlineId - SaleOnline ID
     */
    function showOrderDetails(saleOnlineId) {
        hideBillPreview(); // Hide preview first

        const orderData = getOrderFromLocalStorage(saleOnlineId);

        if (!orderData) {
            window.notificationManager?.warning('Không tìm thấy chi tiết đơn hàng trong cache');
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'orderDetailModal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10001;';

        // Create modal container
        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;';

        // Check if generateCustomBillHTML is available
        if (typeof window.generateCustomBillHTML === 'function') {
            // Auto-detect carrier from address if CarrierName is empty
            const carrierName = orderData.CarrierName || detectCarrierFromAddress(orderData.ReceiverAddress);

            // Freeship conditions:
            // - THÀNH PHỐ: Tổng tiền hàng > 1,500,000đ
            // - TỈNH: Tổng tiền hàng > 3,000,000đ
            const productTotal = orderData.AmountUntaxed || orderData.AmountTotal || 0;
            const isCity = carrierName && carrierName.includes('THÀNH PHỐ');
            const isProvince = carrierName && carrierName.includes('SHIP TỈNH');
            const qualifiesForFreeship = (isCity && productTotal > 1500000) || (isProvince && productTotal > 3000000);
            const shippingFee = qualifiesForFreeship ? 0 : (orderData.DeliveryPrice || 0);

            // Transform localStorage data to match orderResult format
            const orderResult = {
                Number: orderData.Number || orderData.Reference,
                Reference: orderData.Reference,
                CarrierName: carrierName,
                SessionIndex: orderData.SessionIndex,
                PartnerDisplayName: orderData.ReceiverName || orderData.PartnerName,
                ReceiverName: orderData.ReceiverName,
                ReceiverPhone: orderData.ReceiverPhone || orderData.Phone,
                ReceiverAddress: orderData.ReceiverAddress,
                DeliveryPrice: shippingFee,
                Discount: orderData.Discount || orderData.DecreaseAmount || orderData.DiscountAmount || 0,
                PaymentAmount: orderData.PaymentAmount || 0,
                UserName: orderData.UserName || '',
                AmountUntaxed: orderData.AmountUntaxed || orderData.AmountTotal || 0,
                AmountTotal: orderData.AmountTotal || 0,
                Comment: orderData.Comment,
                DateInvoice: orderData.DateInvoice,
                OrderLines: orderData.OrderLines || [],
                Partner: {
                    Name: orderData.ReceiverName || orderData.PartnerName,
                    Phone: orderData.ReceiverPhone || orderData.Phone,
                    Street: orderData.ReceiverAddress
                }
            };

            const billHtml = window.generateCustomBillHTML(orderResult, { walletBalance: orderData.PaymentAmount || 0 });

            // Use iframe to render bill HTML (preserves CSS)
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:350px; height:70vh; border:none;';
            modal.appendChild(iframe);

            // Close button
            const closeBtn = document.createElement('div');
            closeBtn.style.cssText = 'padding:12px 16px; text-align:center; border-top:1px solid #e5e7eb;';
            closeBtn.innerHTML = '<button onclick="document.getElementById(\'orderDetailModal\').remove()" style="padding:10px 24px; background:#6366f1; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:500;">Đóng</button>';
            modal.appendChild(closeBtn);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Write bill HTML to iframe after appending to DOM
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(billHtml);
            doc.close();
        } else {
            // Fallback if generateCustomBillHTML not available
            const fallbackHtml = `
                <div style="padding:20px; text-align:center;">
                    <p style="color:#6b7280;">Không thể hiển thị bill. Vui lòng thử lại.</p>
                </div>
                <div style="padding:12px 16px; text-align:center; border-top:1px solid #e5e7eb;">
                    <button onclick="document.getElementById('orderDetailModal').remove()" style="padding:10px 24px; background:#6366f1; color:#fff; border:none; border-radius:6px; cursor:pointer;">Đóng</button>
                </div>
            `;
            modal.innerHTML = fallbackHtml;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    function init() {
        console.log('[ORDER-HISTORY] Initializing...');

        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.querySelector('.modal-overlay')?.addEventListener('click', hideModal);
            modal.querySelector('.close-btn')?.addEventListener('click', hideModal);
            document.getElementById('orderHistoryCloseBtn')?.addEventListener('click', hideModal);
            document.getElementById('orderHistoryRefreshBtn')?.addEventListener('click', () => {
                loadHistory();
            });
        }

        document.getElementById('orderHistoryBtn')?.addEventListener('click', showModal);

        // Campaign filter triggers reload from Firebase
        document.getElementById('orderHistoryCampaign')?.addEventListener('change', loadHistory);

        // Search with debounce (300ms) - client-side on loaded data
        document.getElementById('orderHistorySearch')?.addEventListener('input', debounce(applyFilters, 300));

        // Source filter (immediate) - client-side
        document.getElementById('orderHistorySource')?.addEventListener('change', applyFilters);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal?.classList.contains('show')) {
                hideModal();
            }
        });

        // Cleanup expired records on init (background)
        setTimeout(() => cleanupExpiredRecords(), 5000);

        console.log('[ORDER-HISTORY] ✅ Initialized');
    }

    // =====================================================
    // EXPORT TO GLOBAL
    // =====================================================
    window.OrderHistoryManager = {
        init,
        saveOrderHistory,
        saveOrderHistoryBatch,
        showModal,
        hideModal,
        loadHistory,
        showOrderDetails,
        showBillPreview,
        hideBillPreview,
        getOrderFromLocalStorage
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();
