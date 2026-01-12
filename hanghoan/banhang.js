/* =====================================================
   BÁN HÀNG - SALES FUNCTIONALITY
   Excel Import & Firebase Storage
   ===================================================== */

// Bán Hàng Module - Firebase version with TPOS Excel Background Fetch
const BanHangModule = (function () {
    'use strict';

    // Cloudflare Worker proxy URL for TPOS API
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // TPOS credentials for authentication
    const TPOS_CREDENTIALS = {
        grant_type: 'password',
        username: 'nvkt',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    };

    // Background fetch state
    let isBackgroundFetching = false;
    let lastBackgroundFetchTime = null;

    // Firebase Configuration (same as hanghoan.js)
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    };

    // Firebase references (use existing app if available)
    let db = null;
    let banHangCollectionRef = null;

    // State
    let banHangData = [];
    let filteredData = [];
    let isLoading = false;

    // Pagination state
    let currentPage = 1;
    let pageSize = 50;

    // DOM Elements cache
    const elements = {
        tableBody: null,
        emptyState: null,
        loadingState: null,
        searchInput: null,
        statusFilter: null,
        startDate: null,
        endDate: null,
        pageSize: null,
        statTotal: null,
        statConfirmed: null,
        statPaid: null,
        statTotalAmount: null,
        // Pagination elements
        pagination: null,
        showingFrom: null,
        showingTo: null,
        totalRecords: null,
        currentPageEl: null,
        totalPages: null,
        firstPage: null,
        prevPage: null,
        nextPage: null,
        lastPage: null
    };

    // Initialize Firebase
    function initFirebase() {
        try {
            // Check if Firebase is already initialized
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            banHangCollectionRef = db.collection("ban_hang");
            console.log('✅ BanHang Firebase initialized');
            return true;
        } catch (error) {
            console.error('❌ Error initializing Firebase for BanHang:', error);
            return false;
        }
    }

    // Initialize
    function init() {
        initFirebase();
        cacheElements();
        bindEvents();
        setDefaultDates();
        // Load data from Firebase first, then background fetch from TPOS
        loadFromFirebase().then(() => {
            // Start background fetch from TPOS after Firebase data is displayed
            // Use setTimeout to ensure UI is updated first
            setTimeout(() => {
                console.log('[BanHang] Starting background TPOS sync...');
                backgroundFetchFromTPOS();
            }, 1000);
        });
        console.log('BanHangModule initialized (Firebase + TPOS background sync)');
    }

    // Cache DOM elements
    function cacheElements() {
        elements.tableBody = document.getElementById('banhangTableBody');
        elements.emptyState = document.getElementById('banhangEmptyState');
        elements.loadingState = document.getElementById('banhangLoadingState');
        elements.searchInput = document.getElementById('banhangSearchInput');
        elements.statusFilter = document.getElementById('banhangStatusFilter');
        elements.startDate = document.getElementById('banhangStartDate');
        elements.endDate = document.getElementById('banhangEndDate');
        elements.pageSize = document.getElementById('banhangPageSize');
        elements.statTotal = document.getElementById('banhangStatTotal');
        elements.statConfirmed = document.getElementById('banhangStatConfirmed');
        elements.statPaid = document.getElementById('banhangStatPaid');
        elements.statTotalAmount = document.getElementById('banhangStatTotalAmount');
        // Pagination elements
        elements.pagination = document.getElementById('banhangPagination');
        elements.showingFrom = document.getElementById('banhangShowingFrom');
        elements.showingTo = document.getElementById('banhangShowingTo');
        elements.totalRecords = document.getElementById('banhangTotalRecords');
        elements.currentPageEl = document.getElementById('banhangCurrentPage');
        elements.totalPages = document.getElementById('banhangTotalPages');
        elements.firstPage = document.getElementById('banhangFirstPage');
        elements.prevPage = document.getElementById('banhangPrevPage');
        elements.nextPage = document.getElementById('banhangNextPage');
        elements.lastPage = document.getElementById('banhangLastPage');
    }

    // Set default dates (1 month ago to today)
    function setDefaultDates() {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        if (elements.startDate) {
            elements.startDate.value = formatDateForInput(oneMonthAgo);
        }
        if (elements.endDate) {
            elements.endDate.value = formatDateForInput(today);
        }
    }

    // Format date for input[type="date"]
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Bind events
    function bindEvents() {
        // Search input
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Status filter
        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }

        // Date filters
        if (elements.startDate) {
            elements.startDate.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }
        if (elements.endDate) {
            elements.endDate.addEventListener('change', () => {
                currentPage = 1;
                applyFilters();
            });
        }

        // Page size
        if (elements.pageSize) {
            elements.pageSize.addEventListener('change', (e) => {
                pageSize = parseInt(e.target.value) || 50;
                currentPage = 1;
                renderCurrentPage();
            });
        }

        // Pagination buttons
        if (elements.firstPage) {
            elements.firstPage.addEventListener('click', () => goToPage(1));
        }
        if (elements.prevPage) {
            elements.prevPage.addEventListener('click', () => goToPage(currentPage - 1));
        }
        if (elements.nextPage) {
            elements.nextPage.addEventListener('click', () => goToPage(currentPage + 1));
        }
        if (elements.lastPage) {
            elements.lastPage.addEventListener('click', () => goToPage(getTotalPages()));
        }
    }

    // Get total pages
    function getTotalPages() {
        return Math.ceil(filteredData.length / pageSize) || 1;
    }

    // Go to specific page
    function goToPage(page) {
        const totalPages = getTotalPages();
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPage = page;
        renderCurrentPage();
    }

    // Render current page
    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredData.length);
        const pageData = filteredData.slice(startIndex, endIndex);

        renderTable(pageData, startIndex);
        updatePagination();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Update pagination UI
    function updatePagination() {
        const totalPages = getTotalPages();
        const totalRecords = filteredData.length;
        const startIndex = (currentPage - 1) * pageSize + 1;
        const endIndex = Math.min(currentPage * pageSize, totalRecords);

        if (elements.showingFrom) elements.showingFrom.textContent = totalRecords > 0 ? startIndex : 0;
        if (elements.showingTo) elements.showingTo.textContent = endIndex;
        if (elements.totalRecords) elements.totalRecords.textContent = totalRecords;
        if (elements.currentPageEl) elements.currentPageEl.textContent = currentPage;
        if (elements.totalPages) elements.totalPages.textContent = totalPages;

        // Update button states
        if (elements.firstPage) elements.firstPage.disabled = currentPage <= 1;
        if (elements.prevPage) elements.prevPage.disabled = currentPage <= 1;
        if (elements.nextPage) elements.nextPage.disabled = currentPage >= totalPages;
        if (elements.lastPage) elements.lastPage.disabled = currentPage >= totalPages;
    }

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Show loading state
    function showLoading() {
        isLoading = true;
        if (elements.loadingState) {
            elements.loadingState.classList.add('show');
        }
        if (elements.tableBody) {
            elements.tableBody.innerHTML = '';
        }
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Hide loading state
    function hideLoading() {
        isLoading = false;
        if (elements.loadingState) {
            elements.loadingState.classList.remove('show');
        }
    }

    // Show empty state
    function showEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.add('show');
        }
    }

    // Hide empty state
    function hideEmptyState() {
        if (elements.emptyState) {
            elements.emptyState.classList.remove('show');
        }
    }

    // Format currency
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    // Constants
    const MAX_RECORDS_PER_DOC = 500; // Firebase document size limit workaround

    /**
     * Load data from Firebase on page init
     */
    async function loadFromFirebase() {
        if (!banHangCollectionRef) {
            console.error('Firebase not initialized');
            return;
        }

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang tải dữ liệu từ Firebase...', 'info');
        }

        try {
            // Load all chunks
            const snapshot = await banHangCollectionRef.get();
            let allOrders = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.orders && Array.isArray(data.orders)) {
                    allOrders = allOrders.concat(data.orders);
                }
            });

            banHangData = allOrders;
            filteredData = [...banHangData];

            console.log(`✅ Loaded ${banHangData.length} records from Firebase`);

            hideLoading();
            currentPage = 1;
            renderCurrentPage();
            updateStats();

            if (typeof showNotification === 'function' && banHangData.length > 0) {
                showNotification(`Đã tải ${banHangData.length} đơn hàng từ Firebase`, 'success');
            }

            if (banHangData.length === 0) {
                showEmptyState();
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi tải dữ liệu: ' + error.message, 'error');
            }
        }
    }

    /**
     * Save data to Firebase - split into chunks to avoid size limit
     */
    async function saveToFirebase(data) {
        if (!banHangCollectionRef) {
            console.error('Firebase not initialized');
            return false;
        }

        try {
            // Delete all existing documents first
            const snapshot = await banHangCollectionRef.get();
            const deletePromises = [];
            snapshot.forEach(doc => {
                deletePromises.push(doc.ref.delete());
            });
            await Promise.all(deletePromises);

            // Split data into chunks
            const chunks = [];
            for (let i = 0; i < data.length; i += MAX_RECORDS_PER_DOC) {
                chunks.push(data.slice(i, i + MAX_RECORDS_PER_DOC));
            }

            // Save each chunk as a separate document
            const savePromises = chunks.map((chunk, index) => {
                return banHangCollectionRef.doc(`chunk_${index}`).set({
                    orders: chunk,
                    chunkIndex: index,
                    lastUpdated: new Date().toISOString(),
                    count: chunk.length
                });
            });

            // Also save metadata
            savePromises.push(banHangCollectionRef.doc('_metadata').set({
                totalCount: data.length,
                chunkCount: chunks.length,
                lastUpdated: new Date().toISOString()
            }));

            await Promise.all(savePromises);
            console.log(`✅ Saved ${data.length} records to Firebase in ${chunks.length} chunks`);
            return true;
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            return false;
        }
    }

    // Get status class
    function getStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('thanh toán') || statusLower === 'paid') {
            return 'paid';
        } else if (statusLower.includes('xác nhận') || statusLower === 'confirmed') {
            return 'confirmed';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'draft';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled') {
            return 'cancelled';
        }
        return 'draft';
    }

    // Render table - match Excel structure
    function renderTable(data, startIndex = 0) {
        if (!elements.tableBody) return;

        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '';
            if (filteredData.length === 0) {
                showEmptyState();
            }
            return;
        }

        hideEmptyState();

        const html = data.map((item, index) => `
            <tr data-index="${startIndex + index}" data-id="${item.id || ''}" data-order-id="${item.so || ''}" class="order-row" style="cursor: pointer;">
                <td class="text-center">${startIndex + index + 1}</td>
                <td>${escapeHtml(item.khachHang || '')}</td>
                <td>${escapeHtml(item.email || '')}</td>
                <td>${escapeHtml(item.facebook || '')}</td>
                <td><a href="tel:${item.dienThoai || ''}" class="phone-link">${escapeHtml(item.dienThoai || '')}</a></td>
                <td class="col-address">${escapeHtml(item.diaChi || '')}</td>
                <td>${escapeHtml(item.so || '')}</td>
                <td class="text-center">${formatDate(item.ngayBan)}</td>
                <td class="text-center">${formatDate(item.ngayXacNhan)}</td>
                <td class="text-right">${formatCurrency(item.tongTien)}</td>
                <td class="text-right">${formatCurrency(item.conNo)}</td>
                <td class="text-center">
                    <span class="banhang-status ${getStatusClass(item.trangThai)}">${escapeHtml(item.trangThai || '')}</span>
                </td>
                <td>${escapeHtml(item.doiTacGH || '')}</td>
                <td>${escapeHtml(item.maVanDon || '')}</td>
                <td class="text-right">${formatCurrency(item.cod)}</td>
                <td class="text-right">${escapeHtml(item.phiShipGH || '')}</td>
                <td class="text-right">${formatCurrency(item.tienCoc)}</td>
                <td class="text-right">${formatCurrency(item.traTruoc)}</td>
                <td class="text-center">${escapeHtml(item.khoiLuongShip || '')}</td>
                <td class="text-center">
                    <span class="banhang-status-gh ${getDeliveryStatusClass(item.trangThaiGH)}">${escapeHtml(item.trangThaiGH || '')}</span>
                </td>
                <td>${escapeHtml(item.doiSoatGH || '')}</td>
                <td class="col-note">${escapeHtml(item.ghiChuGH || '')}</td>
                <td class="col-note">${escapeHtml(item.ghiChu || '')}</td>
                <td>${escapeHtml(item.nguoiBan || '')}</td>
                <td>${escapeHtml(item.nguon || '')}</td>
                <td>${escapeHtml(item.kenh || '')}</td>
                <td>${escapeHtml(item.congTy || '')}</td>
                <td>${escapeHtml(item.thamChieu || '')}</td>
                <td class="text-right">${escapeHtml(item.phiGiaoHang || '')}</td>
                <td>${escapeHtml(item.nhan || '')}</td>
                <td class="text-right">${formatCurrency(item.tienGiam)}</td>
                <td class="text-right">${item.chietKhau || 0}%</td>
                <td class="text-right">${formatCurrency(item.thanhTienChietKhau)}</td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Add click handlers for row expansion
        attachRowClickHandlers();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Attach click handlers to rows for expanding order details
    function attachRowClickHandlers() {
        const rows = document.querySelectorAll('.order-row');
        rows.forEach(row => {
            row.addEventListener('click', async (e) => {
                // Don't expand if clicking on a link or button
                if (e.target.tagName === 'A' || e.target.closest('a')) {
                    return;
                }

                const orderId = row.getAttribute('data-order-id');
                if (!orderId) {
                    console.log('[EXPAND] No order ID found');
                    return;
                }

                // Toggle expansion
                const existingDetailRow = row.nextElementSibling;
                if (existingDetailRow && existingDetailRow.classList.contains('order-detail-row')) {
                    // Already expanded, collapse it
                    existingDetailRow.remove();
                    row.style.backgroundColor = '';
                } else {
                    // Expand and fetch details
                    row.style.backgroundColor = '#e3f2fd';
                    await expandOrderDetails(row, orderId);
                }
            });
        });
    }

    // Expand order details by fetching from TPOS with 2 API calls
    async function expandOrderDetails(row, orderId) {
        try {
            console.log('[EXPAND] Fetching details for order:', orderId);

            // Create a loading row
            const loadingRow = document.createElement('tr');
            loadingRow.classList.add('order-detail-row');
            loadingRow.innerHTML = `
                <td colspan="100%" style="padding: 20px; text-align: center; background: #f5f5f5;">
                    <i class="fas fa-spinner fa-spin"></i> Đang tải chi tiết đơn hàng...
                </td>
            `;
            row.insertAdjacentElement('afterend', loadingRow);

            // Get token first
            const token = await getTPOSToken();

            // Build date range for filter (last 2 months to ensure we find the order)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 2);
            const startISO = startDate.toISOString();
            const endISO = endDate.toISOString();

            // FETCH 1: Get order details by Number to get the internal ID
            const filterQuery = `(Type eq 'invoice' and IsMergeCancel ne true and DateInvoice ge ${startISO} and DateInvoice le ${endISO} and contains(Number,'${orderId}'))`;
            const fetch1Url = `${WORKER_URL}/api/odata/FastSaleOrder/ODataService.GetView?&$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filterQuery)}&$count=true`;

            console.log('[EXPAND] Fetch 1 - GetView URL:', fetch1Url);

            const response1 = await fetch(fetch1Url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
                }
            });

            const result1 = await response1.json();
            console.log('[EXPAND] Fetch 1 result:', result1);

            if (!result1.value || result1.value.length === 0) {
                loadingRow.innerHTML = `
                    <td colspan="100%" style="padding: 20px; text-align: center; background: #fff3cd; color: #856404;">
                        <i class="fas fa-exclamation-triangle"></i> Không tìm thấy đơn hàng ${orderId}
                    </td>
                `;
                return;
            }

            // Get the order data from fetch 1
            const orderData = result1.value[0];
            const internalId = orderData.Id;

            console.log('[EXPAND] Found order with internal ID:', internalId);

            // FETCH 2: Get OrderLines using internal ID
            const fetch2Url = `${WORKER_URL}/api/odata/FastSaleOrder(${internalId})/OrderLines?$expand=Product,ProductUOM,Account,SaleLine,User`;

            console.log('[EXPAND] Fetch 2 - OrderLines URL:', fetch2Url);

            const response2 = await fetch(fetch2Url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
                }
            });

            const result2 = await response2.json();
            console.log('[EXPAND] Fetch 2 result:', result2);

            const orderLines = result2.value || [];

            if (orderLines.length === 0) {
                loadingRow.innerHTML = `
                    <td colspan="100%" style="padding: 20px; text-align: center; background: #fff3cd; color: #856404;">
                        <i class="fas fa-exclamation-triangle"></i> Không tìm thấy chi tiết sản phẩm
                    </td>
                `;
                return;
            }

            // Render order details with both order info and order lines
            renderOrderDetails(loadingRow, orderLines, orderData);

        } catch (error) {
            console.error('[EXPAND] Error fetching order details:', error);
            const errorRow = row.nextElementSibling;
            if (errorRow && errorRow.classList.contains('order-detail-row')) {
                errorRow.innerHTML = `
                    <td colspan="100%" style="padding: 20px; text-align: center; background: #f8d7da; color: #721c24;">
                        <i class="fas fa-exclamation-circle"></i> Lỗi khi tải chi tiết: ${error.message}
                    </td>
                `;
            }
        }
    }

    // Render order details table with order info and product lines
    function renderOrderDetails(detailRow, orderLines, orderData = {}) {
        // Calculate totals from order lines
        const productTotal = orderLines.reduce((sum, line) => sum + (line.PriceTotal || 0), 0);

        // Get order-level data from fetch 1 result
        const deliveryFee = orderData.DeliveryPrice || orderData.AmountDelivery || 0;
        const totalAmount = orderData.AmountTotal || (productTotal + deliveryFee);
        const amountResidual = orderData.Residual || orderData.AmountResidual || totalAmount;

        const detailHtml = `
            <td colspan="100%" style="padding: 0; background: #f8f9fa;">
                <div style="padding: 20px; margin: 10px 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <table class="table table-bordered" style="margin: 0;">
                        <thead style="background: #e9ecef;">
                            <tr>
                                <th style="width: 50px;">STT</th>
                                <th>Sản phẩm</th>
                                <th style="width: 120px;">Đơn vị tính</th>
                                <th style="width: 100px;">Số lượng</th>
                                <th style="width: 120px;">Đơn giá</th>
                                <th style="width: 120px;">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orderLines.map((line, index) => `
                                <tr>
                                    <td class="text-center">${index + 1}</td>
                                    <td>
                                        <div>${escapeHtml(line.ProductNameGet || line.Name || '')}</div>
                                        ${line.Product && line.Product.NameNoSign ? `<small style="color: #6c757d;">${escapeHtml(line.Product.NameNoSign || '')}</small>` : ''}
                                    </td>
                                    <td>${escapeHtml(line.ProductUOM?.Name || line.ProductUOMName || '')}</td>
                                    <td class="text-center">${line.ProductUOMQty || 0}</td>
                                    <td class="text-right">${formatCurrency(line.PriceUnit || 0)}</td>
                                    <td class="text-right">${formatCurrency(line.PriceTotal || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot style="background: #f8f9fa;">
                            <tr>
                                <td colspan="5" class="text-right" style="font-weight: bold;">Tổng</td>
                                <td class="text-right" style="font-weight: bold;">${formatCurrency(productTotal)}</td>
                            </tr>
                            <tr>
                                <td colspan="5" class="text-right">Phí giao hàng:</td>
                                <td class="text-right">${formatCurrency(deliveryFee)}</td>
                            </tr>
                            <tr>
                                <td colspan="5" class="text-right" style="font-weight: bold;">Tổng tiền:</td>
                                <td class="text-right" style="font-weight: bold;">${formatCurrency(totalAmount)}</td>
                            </tr>
                            <tr>
                                <td colspan="5" class="text-right" style="font-weight: bold; color: #dc3545;">Còn nợ:</td>
                                <td class="text-right" style="font-weight: bold; color: #dc3545;">${formatCurrency(amountResidual)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </td>
        `;
        detailRow.innerHTML = detailHtml;
    }

    // Get delivery status class
    function getDeliveryStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('giao thành công') || statusLower.includes('hoàn tất')) {
            return 'delivered';
        } else if (statusLower.includes('đang giao') || statusLower.includes('đã tiếp nhận')) {
            return 'shipping';
        } else if (statusLower.includes('chưa tiếp nhận')) {
            return 'pending';
        } else if (statusLower.includes('hoàn') || statusLower.includes('thất bại')) {
            return 'failed';
        }
        return 'pending';
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle search
    function handleSearch() {
        currentPage = 1;
        applyFilters();
    }

    // Apply filters
    function applyFilters() {
        let result = [...banHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.khachHang || '').toLowerCase().includes(searchTerm) ||
                    (item.dienThoai || '').toLowerCase().includes(searchTerm) ||
                    (item.so || '').toLowerCase().includes(searchTerm) ||
                    (item.maVanDon || '').toLowerCase().includes(searchTerm) ||
                    (item.diaChi || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Status filter
        const statusValue = elements.statusFilter?.value || 'all';
        if (statusValue !== 'all') {
            result = result.filter(item => {
                const statusClass = getStatusClass(item.trangThai);
                return statusClass === statusValue;
            });
        }

        // Date range filter
        const startDate = elements.startDate?.value;
        const endDate = elements.endDate?.value;

        if (startDate || endDate) {
            result = result.filter(item => {
                if (!item.ngayBan) return false;

                const itemDate = new Date(item.ngayBan);
                if (isNaN(itemDate.getTime())) return false;

                if (startDate) {
                    const start = new Date(startDate);
                    if (itemDate < start) return false;
                }

                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (itemDate > end) return false;
                }

                return true;
            });
        }

        filteredData = result;
        renderCurrentPage();
        updateStats();
    }

    // Update stats
    function updateStats() {
        const total = filteredData.length;
        const confirmed = filteredData.filter(item => getStatusClass(item.trangThai) === 'confirmed').length;
        const paid = filteredData.filter(item => getStatusClass(item.trangThai) === 'paid').length;
        const totalAmount = filteredData.reduce((sum, item) => sum + (parseFloat(item.tongTien) || 0), 0);

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statPaid) elements.statPaid.textContent = paid;
        if (elements.statTotalAmount) elements.statTotalAmount.textContent = formatCurrency(totalAmount);
    }

    /**
     * Import Excel file and save to Firebase
     */
    async function importExcel(file) {
        if (!file) return;

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang đọc file Excel...', 'info');
        }

        try {
            // Load XLSX library if not already loaded
            if (typeof XLSX === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                document.head.appendChild(script);
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
            }

            // Read Excel file
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Read with header row starting at row 3 (skip title rows)
            const rows = XLSX.utils.sheet_to_json(firstSheet, {
                range: 2, // Start from row 3 (0-indexed, so 2)
                defval: null // Default value for empty cells
            });

            console.log(`Read ${rows.length} rows from Excel`);

            if (rows.length === 0) {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('File Excel không có dữ liệu', 'warning');
                }
                return;
            }

            // Map Excel rows - match exact column names from Excel file
            // Excel structure: STT, Khách hàng, Email, Facebook, Điện thoại, Địa chỉ, Số, Ngày bán, Ngày xác nhận, Tổng tiền, Còn nợ, Trạng thái, Đối tác giao hàng, Mã vận đơn, COD, ...
            const importedData = rows.map((row, index) => ({
                id: `${Date.now()}_${index}`, // Unique ID for each record
                stt: row['STT'] || index + 1,
                khachHang: row['Khách hàng'] || '',
                email: row['Email'] || '',
                facebook: row['Facebook'] || '',
                dienThoai: String(row['Điện thoại'] || ''),
                diaChi: row['Địa chỉ'] || '',
                so: row['Số'] || '',
                ngayBan: row['Ngày bán'] || null,
                ngayXacNhan: row['Ngày xác nhận'] || null,
                tongTien: parseFloat(row['Tổng tiền'] || 0),
                conNo: parseFloat(row['Còn nợ'] || 0),
                trangThai: row['Trạng thái'] || 'Nháp',
                doiTacGH: row['Đối tác giao hàng'] || '',
                maVanDon: row['Mã vận đơn'] || '',
                cod: parseFloat(row['COD'] || 0),
                phiShipGH: row['Phí ship giao hàng'] || '',
                tienCoc: parseFloat(row['Tiền cọc'] || 0),
                traTruoc: parseFloat(row['Trả trước'] || 0),
                khoiLuongShip: row['Khối lượng ship (g)'] || '',
                trangThaiGH: row['Trạng thái GH'] || '',
                doiSoatGH: row['Đối soát GH'] || '',
                ghiChuGH: row['Ghi chú giao hàng'] || '',
                ghiChu: row['Ghi chú'] || '',
                nguoiBan: row['Người bán'] || '',
                nguon: row['Nguồn'] || '',
                kenh: row['Kênh'] || '',
                congTy: row['Công ty'] || '',
                thamChieu: row['Tham chiếu'] || '',
                phiGiaoHang: row['Phí giao hàng'] || '',
                nhan: row['Nhãn'] || '',
                tienGiam: parseFloat(row['Tiền giảm'] || 0),
                chietKhau: parseFloat(row['Chiết khấu (%)'] || 0),
                thanhTienChietKhau: parseFloat(row['Thành tiền chiết khấu'] || 0),
                importedAt: new Date().toISOString()
            }));

            if (typeof showNotification === 'function') {
                showNotification('Đang lưu lên Firebase...', 'info');
            }

            // Merge with existing data (avoid duplicates by checking 'so' - invoice number)
            const existingInvoices = new Set(banHangData.map(item => item.so));
            const newData = importedData.filter(item => !existingInvoices.has(item.so) || !item.so);
            const duplicateCount = importedData.length - newData.length;

            // Merge: new data first, then existing
            const mergedData = [...newData, ...banHangData];

            // Save to Firebase
            const saveSuccess = await saveToFirebase(mergedData);

            if (saveSuccess) {
                // Update local state
                banHangData = mergedData;
                filteredData = [...banHangData];

                hideLoading();
                currentPage = 1;
                renderCurrentPage();
                updateStats();

                let message = `Đã nhập ${newData.length} đơn hàng từ Excel và lưu lên Firebase`;
                if (duplicateCount > 0) {
                    message += ` (bỏ qua ${duplicateCount} đơn trùng)`;
                }

                if (typeof showNotification === 'function') {
                    showNotification(message, 'success');
                }
            } else {
                hideLoading();
                if (typeof showNotification === 'function') {
                    showNotification('Lỗi khi lưu lên Firebase', 'error');
                }
            }

        } catch (error) {
            console.error('Error importing Excel:', error);
            hideLoading();

            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi nhập Excel: ' + error.message, 'error');
            }
        }
    }

    /**
     * Refresh data from Firebase
     */
    async function refreshData() {
        await loadFromFirebase();
    }

    /**
     * Delete a record by ID
     */
    async function deleteRecord(id) {
        if (!id) return false;

        try {
            const updatedData = banHangData.filter(item => item.id !== id);
            const saveSuccess = await saveToFirebase(updatedData);

            if (saveSuccess) {
                banHangData = updatedData;
                filteredData = [...banHangData];
                renderCurrentPage();
                updateStats();

                if (typeof showNotification === 'function') {
                    showNotification('Đã xóa thành công', 'success');
                }
                return true;
            }
        } catch (error) {
            console.error('Error deleting record:', error);
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi xóa: ' + error.message, 'error');
            }
        }
        return false;
    }

    /**
     * Clear all data
     */
    async function clearAllData() {
        if (!confirm('Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu bán hàng?')) {
            return false;
        }

        try {
            const saveSuccess = await saveToFirebase([]);

            if (saveSuccess) {
                banHangData = [];
                filteredData = [];
                renderTable([]);
                updateStats();

                if (typeof showNotification === 'function') {
                    showNotification('Đã xóa tất cả dữ liệu', 'success');
                }
                return true;
            }
        } catch (error) {
            console.error('Error clearing data:', error);
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi xóa dữ liệu: ' + error.message, 'error');
            }
        }
        return false;
    }

    // =====================================================
    // TPOS EXCEL BACKGROUND FETCH
    // =====================================================

    /**
     * Get TPOS access token via Cloudflare Worker
     */
    async function getTPOSToken() {
        try {
            console.log('[BanHang] 🔑 Fetching TPOS token...');

            const formData = new URLSearchParams();
            formData.append('grant_type', TPOS_CREDENTIALS.grant_type);
            formData.append('username', TPOS_CREDENTIALS.username);
            formData.append('password', TPOS_CREDENTIALS.password);
            formData.append('client_id', TPOS_CREDENTIALS.client_id);

            const response = await fetch(`${WORKER_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.status}`);
            }

            const data = await response.json();
            if (!data.access_token) {
                throw new Error('Invalid token response');
            }

            console.log('[BanHang] ✅ Token retrieved successfully');
            return data.access_token;

        } catch (error) {
            console.error('[BanHang] ❌ Error fetching token:', error);
            throw error;
        }
    }

    /**
     * Build filter for TPOS FastSaleOrder export
     * Default: Last 1 month of invoices
     */
    function buildTPOSExportFilter() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        // Format dates for TPOS API (ISO 8601 with timezone offset)
        // TPOS expects UTC time, Vietnam is UTC+7
        const startISO = new Date(startDate.setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000).toISOString();
        const endISO = new Date(endDate.setHours(23, 59, 59, 999) - 7 * 60 * 60 * 1000).toISOString();

        return {
            Filter: {
                logic: "and",
                filters: [
                    { field: "Type", operator: "eq", value: "invoice" },
                    { field: "DateInvoice", operator: "gte", value: startISO },
                    { field: "DateInvoice", operator: "lte", value: endISO },
                    { field: "IsMergeCancel", operator: "neq", value: true }
                ]
            }
        };
    }

    /**
     * Fetch Excel file from TPOS FastSaleOrder/ExportFile endpoint
     * Returns ArrayBuffer of the XLSX file
     */
    async function fetchExcelFromTPOS(token) {
        console.log('[BanHang] 📊 Fetching Excel from TPOS...');

        const filter = buildTPOSExportFilter();
        const body = {
            data: JSON.stringify(filter),
            ids: []
        };

        // Use the proxy endpoint
        const response = await fetch(`${WORKER_URL}/api/FastSaleOrder/ExportFile?TagIds=`, {
            method: 'POST',
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`TPOS Export failed: ${response.status}`);
        }

        // Response is binary XLSX file
        const arrayBuffer = await response.arrayBuffer();
        console.log('[BanHang] ✅ Excel file received, size:', arrayBuffer.byteLength, 'bytes');

        return arrayBuffer;
    }

    /**
     * Parse Excel ArrayBuffer and convert to data array
     * Matches the structure from manual Excel import
     */
    async function parseTPOSExcel(arrayBuffer) {
        // Load XLSX library if not already loaded
        if (typeof XLSX === 'undefined') {
            console.log('[BanHang] Loading XLSX library...');
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
            document.head.appendChild(script);
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Read with header row starting at row 3 (skip title rows)
        const rows = XLSX.utils.sheet_to_json(firstSheet, {
            range: 2,
            defval: null
        });

        console.log('[BanHang] Parsed', rows.length, 'rows from TPOS Excel');

        // Map Excel columns to our data structure
        const parsedData = rows.map((row, index) => ({
            id: `tpos_${Date.now()}_${index}`,
            stt: row['STT'] || index + 1,
            khachHang: row['Khách hàng'] || '',
            email: row['Email'] || '',
            facebook: row['Facebook'] || '',
            dienThoai: String(row['Điện thoại'] || ''),
            diaChi: row['Địa chỉ'] || '',
            so: row['Số'] || '',
            ngayBan: row['Ngày bán'] || null,
            ngayXacNhan: row['Ngày xác nhận'] || null,
            tongTien: parseFloat(row['Tổng tiền'] || 0),
            conNo: parseFloat(row['Còn nợ'] || 0),
            trangThai: row['Trạng thái'] || 'Nháp',
            doiTacGH: row['Đối tác giao hàng'] || '',
            maVanDon: row['Mã vận đơn'] || '',
            cod: parseFloat(row['COD'] || 0),
            phiShipGH: row['Phí ship giao hàng'] || '',
            tienCoc: parseFloat(row['Tiền cọc'] || 0),
            traTruoc: parseFloat(row['Trả trước'] || 0),
            khoiLuongShip: row['Khối lượng ship (g)'] || '',
            trangThaiGH: row['Trạng thái GH'] || '',
            doiSoatGH: row['Đối soát GH'] || '',
            ghiChuGH: row['Ghi chú giao hàng'] || '',
            ghiChu: row['Ghi chú'] || '',
            nguoiBan: row['Người bán'] || '',
            nguon: row['Nguồn'] || '',
            kenh: row['Kênh'] || '',
            congTy: row['Công ty'] || '',
            thamChieu: row['Tham chiếu'] || '',
            phiGiaoHang: row['Phí giao hàng'] || '',
            nhan: row['Nhãn'] || '',
            tienGiam: parseFloat(row['Tiền giảm'] || 0),
            chietKhau: parseFloat(row['Chiết khấu (%)'] || 0),
            thanhTienChietKhau: parseFloat(row['Thành tiền chiết khấu'] || 0),
            importedAt: new Date().toISOString(),
            source: 'tpos_background'
        }));

        return parsedData;
    }

    /**
     * Merge TPOS data with existing Firebase data
     * Uses invoice number (so) as unique key to detect duplicates
     * STOPS when hitting first duplicate (Excel is sorted newest first)
     */
    function mergeTPOSData(tposData, existingData) {
        const existingSet = new Set();
        existingData.forEach(item => {
            if (item.so) {
                existingSet.add(item.so);
            }
        });

        let newCount = 0;
        const newRecords = [];

        // Iterate through TPOS data (newest first)
        // Stop when we hit a duplicate - all subsequent records already exist
        for (const tposItem of tposData) {
            if (!tposItem.so) continue; // Skip items without invoice number

            if (existingSet.has(tposItem.so)) {
                // Hit a duplicate - stop processing
                console.log(`[BanHang] Hit duplicate at invoice ${tposItem.so}, stopping sync`);
                break;
            }

            // New record from TPOS
            newRecords.push(tposItem);
            newCount++;
        }

        // Prepend new records to existing data
        const mergedData = [...newRecords, ...existingData];

        console.log(`[BanHang] Merge result: ${newCount} new records added`);

        return {
            data: mergedData,
            newCount,
            updatedCount: 0
        };
    }

    /**
     * Background fetch Excel from TPOS and update data
     * Called automatically after Firebase data is loaded
     */
    async function backgroundFetchFromTPOS() {
        if (isBackgroundFetching) {
            console.log('[BanHang] Background fetch already in progress, skipping...');
            return;
        }

        isBackgroundFetching = true;
        console.log('[BanHang] 🔄 Starting background fetch from TPOS...');

        // Show subtle loading indicator
        const indicator = document.getElementById('banhangBackgroundIndicator');

        const hideIndicator = () => {
            isBackgroundFetching = false;
            if (indicator) {
                indicator.classList.remove('show');
            }
        };

        try {
            if (indicator) {
                indicator.classList.add('show');
            }

            // Step 1: Get TPOS token
            const token = await getTPOSToken();

            // Step 2: Fetch Excel from TPOS
            const excelBuffer = await fetchExcelFromTPOS(token);

            // Step 3: Parse Excel data
            const tposData = await parseTPOSExcel(excelBuffer);

            if (tposData.length === 0) {
                console.log('[BanHang] No data from TPOS Excel');
                hideIndicator();
                return;
            }

            // Step 4: Merge with existing data (stops at first duplicate)
            const { data: mergedData, newCount } = mergeTPOSData(tposData, banHangData);

            // Step 5: Save to Firebase if there are new records
            if (newCount > 0) {
                console.log('[BanHang] Saving', newCount, 'new records to Firebase...');
                const saveSuccess = await saveToFirebase(mergedData);

                if (saveSuccess) {
                    // Update local state
                    banHangData = mergedData;
                    applyFilters(); // Re-apply filters and re-render

                    // Show success notification
                    if (typeof showNotification === 'function') {
                        showNotification(`TPOS sync: ${newCount} đơn mới`, 'success');
                    }

                    console.log('[BanHang] ✅ Background sync completed successfully');
                }
            } else {
                console.log('[BanHang] ✅ Dữ liệu đã đồng bộ (không có đơn mới)');
                if (typeof showNotification === 'function') {
                    showNotification('Dữ liệu đã đồng bộ', 'info');
                }
            }

            lastBackgroundFetchTime = new Date();

        } catch (error) {
            console.error('[BanHang] ❌ Background fetch error:', error);
            // Show error for debugging
            if (typeof showNotification === 'function') {
                showNotification('Lỗi sync TPOS: ' + error.message, 'error');
            }
        }

        // Always hide indicator
        hideIndicator();
    }

    /**
     * Manual trigger for TPOS sync
     */
    async function syncFromTPOS() {
        if (isBackgroundFetching) {
            if (typeof showNotification === 'function') {
                showNotification('Đang đồng bộ, vui lòng đợi...', 'info');
            }
            return;
        }

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang đồng bộ dữ liệu từ TPOS...', 'info');
        }

        try {
            await backgroundFetchFromTPOS();
        } finally {
            hideLoading();
        }
    }

    // Public API
    return {
        init,
        importExcel,
        refreshData,
        loadFromFirebase,
        deleteRecord,
        clearAllData,
        syncFromTPOS,
        backgroundFetchFromTPOS,
        getData: () => banHangData,
        getFilteredData: () => filteredData,
        isBackgroundFetching: () => isBackgroundFetching
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    // Only initialize if we're on the correct page
    if (document.getElementById('banhangTableBody')) {
        BanHangModule.init();

        // Import Excel button
        const btnImportExcel = document.getElementById('btnImportExcelBanHang');
        const excelFileInput = document.getElementById('excelFileInputBanHang');

        if (btnImportExcel && excelFileInput) {
            btnImportExcel.addEventListener('click', () => {
                excelFileInput.click();
            });

            excelFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    btnImportExcel.disabled = true;
                    try {
                        await BanHangModule.importExcel(file);
                    } finally {
                        btnImportExcel.disabled = false;
                        excelFileInput.value = ''; // Reset file input
                        // Reinitialize Lucide icons
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    }
                }
            });
        }

        // Refresh button
        const btnRefreshBanHang = document.getElementById('btnRefreshBanHang');
        if (btnRefreshBanHang) {
            btnRefreshBanHang.addEventListener('click', async () => {
                btnRefreshBanHang.disabled = true;
                try {
                    await BanHangModule.refreshData();
                } finally {
                    btnRefreshBanHang.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }

        // Clear all button
        const btnClearBanHang = document.getElementById('btnClearBanHang');
        if (btnClearBanHang) {
            btnClearBanHang.addEventListener('click', async () => {
                await BanHangModule.clearAllData();
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }

        // Sync TPOS button
        const btnSyncTPOS = document.getElementById('btnSyncTPOS');
        if (btnSyncTPOS) {
            btnSyncTPOS.addEventListener('click', async () => {
                btnSyncTPOS.disabled = true;
                try {
                    await BanHangModule.syncFromTPOS();
                } finally {
                    btnSyncTPOS.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }
    }
});
