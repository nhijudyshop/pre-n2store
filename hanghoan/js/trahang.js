/* =====================================================
   TRẢ HÀNG - RETURN PRODUCT FUNCTIONALITY
   Excel Import & Firebase Storage
   ===================================================== */

// Trả Hàng Module - Firebase version with TPOS Excel Background Fetch
const TraHangModule = (function () {
    'use strict';

    // Cloudflare Worker proxy URL for TPOS API
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // TPOS credentials - per-company accounts
    function getTposCredentials() {
        const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
        return companyId === 2
            ? { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
            : { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' };
    }

    // Background fetch state
    let isBackgroundFetching = false;
    let lastBackgroundFetchTime = null;

    // Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js in index.html)
    // FIREBASE_CONFIG and firebaseConfig are provided by shared/js/firebase-config.js

    // Firebase references (use existing app if available)
    let db = null;
    let traHangCollectionRef = null;

    // State
    let traHangData = [];
    let filteredData = [];
    let isLoading = false;

    // DOM Elements cache
    const elements = {
        tableBody: null,
        emptyState: null,
        loadingState: null,
        searchInput: null,
        statusFilter: null,
        startDate: null,
        endDate: null,
        statTotal: null,
        statConfirmed: null,
        statDraft: null
    };

    // Initialize Firebase
    function initFirebase() {
        try {
            // Check if Firebase is already initialized
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            traHangCollectionRef = db.collection("tra_hang");
            console.log('✅ TraHang Firebase initialized');
            return true;
        } catch (error) {
            console.error('❌ Error initializing Firebase for TraHang:', error);
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
                console.log('[TraHang] Starting background TPOS sync...');
                backgroundFetchFromTPOS();
            }, 1000);
        });
        console.log('TraHangModule initialized (Firebase + TPOS background sync)');
    }

    // Cache DOM elements
    function cacheElements() {
        elements.tableBody = document.getElementById('trahangTableBody');
        elements.emptyState = document.getElementById('trahangEmptyState');
        elements.loadingState = document.getElementById('trahangLoadingState');
        elements.searchInput = document.getElementById('trahangSearchInput');
        elements.statusFilter = document.getElementById('trahangStatusFilter');
        elements.startDate = document.getElementById('trahangStartDate');
        elements.endDate = document.getElementById('trahangEndDate');
        elements.statTotal = document.getElementById('trahangStatTotal');
        elements.statConfirmed = document.getElementById('trahangStatConfirmed');
        elements.statDraft = document.getElementById('trahangStatDraft');
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
            elements.statusFilter.addEventListener('change', applyFilters);
        }

        // Date filters
        if (elements.startDate) {
            elements.startDate.addEventListener('change', applyFilters);
        }
        if (elements.endDate) {
            elements.endDate.addEventListener('change', applyFilters);
        }
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
        if (!traHangCollectionRef) {
            console.error('Firebase not initialized');
            return;
        }

        showLoading();
        if (typeof showNotification === 'function') {
            showNotification('Đang tải dữ liệu từ Firebase...', 'info');
        }

        try {
            // Load all chunks
            const snapshot = await traHangCollectionRef.get();
            let allOrders = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.orders && Array.isArray(data.orders)) {
                    allOrders = allOrders.concat(data.orders);
                }
            });

            traHangData = allOrders;
            filteredData = [...traHangData];

            console.log(`✅ Loaded ${traHangData.length} records from Firebase`);

            hideLoading();
            renderTable(traHangData);
            updateStats();

            if (typeof showNotification === 'function' && traHangData.length > 0) {
                showNotification(`Đã tải ${traHangData.length} đơn hàng từ Firebase`, 'success');
            }

            if (traHangData.length === 0) {
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
        if (!traHangCollectionRef) {
            console.error('Firebase not initialized');
            return false;
        }

        try {
            // Delete all existing documents first
            const snapshot = await traHangCollectionRef.get();
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
                return traHangCollectionRef.doc(`chunk_${index}`).set({
                    orders: chunk,
                    chunkIndex: index,
                    lastUpdated: new Date().toISOString(),
                    count: chunk.length
                });
            });

            // Also save metadata
            savePromises.push(traHangCollectionRef.doc('_metadata').set({
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
        if (statusLower.includes('xác nhận') || statusLower === 'confirmed') {
            return 'confirmed';
        } else if (statusLower.includes('nháp') || statusLower === 'draft') {
            return 'draft';
        } else if (statusLower.includes('hủy') || statusLower === 'cancelled') {
            return 'cancelled';
        }
        return 'draft';
    }

    // Render table - match Excel structure exactly
    function renderTable(data) {
        if (!elements.tableBody) return;

        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '';
            showEmptyState();
            return;
        }

        hideEmptyState();

        const html = data.map((item, index) => `
            <tr data-index="${index}">
                <td class="text-center">${item.stt || index + 1}</td>
                <td>${escapeHtml(item.khachHang || '')}</td>
                <td>${escapeHtml(item.facebook || '')}</td>
                <td><a href="tel:${item.dienThoai || ''}" class="phone-link">${escapeHtml(item.dienThoai || '')}</a></td>
                <td class="col-address">${escapeHtml(item.diaChi || '')}</td>
                <td>${escapeHtml(item.so || '')}</td>
                <td>${escapeHtml(item.thamChieu || '')}</td>
                <td class="text-center">${formatDate(item.ngayBan)}</td>
                <td class="text-right">${formatCurrency(item.tongTien)}</td>
                <td class="text-right">${formatCurrency(item.conNo)}</td>
                <td class="text-center">
                    <span class="trahang-status ${getStatusClass(item.trangThai)}">${escapeHtml(item.trangThai || '')}</span>
                </td>
                <td>${escapeHtml(item.congTy || '')}</td>
            </tr>
        `).join('');

        elements.tableBody.innerHTML = html;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
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
        applyFilters();
    }

    // Apply filters
    function applyFilters() {
        let result = [...traHangData];

        // Search filter
        const searchTerm = elements.searchInput?.value?.toLowerCase()?.trim() || '';
        if (searchTerm) {
            result = result.filter(item => {
                return (
                    (item.khachHang || '').toLowerCase().includes(searchTerm) ||
                    (item.dienThoai || '').toLowerCase().includes(searchTerm) ||
                    (item.so || '').toLowerCase().includes(searchTerm) ||
                    (item.thamChieu || '').toLowerCase().includes(searchTerm) ||
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
        renderTable(result);
        updateStats();
    }

    // Update stats
    function updateStats() {
        const total = filteredData.length;
        const confirmed = filteredData.filter(item => getStatusClass(item.trangThai) === 'confirmed').length;
        const draft = filteredData.filter(item => getStatusClass(item.trangThai) === 'draft').length;

        if (elements.statTotal) elements.statTotal.textContent = total;
        if (elements.statConfirmed) elements.statConfirmed.textContent = confirmed;
        if (elements.statDraft) elements.statDraft.textContent = draft;
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
            // Excel structure: ST, Khách hàng, Facebook, Điện thoại, Địa chỉ, Số, Tham chiếu, Ngày bán, Tổng tiền, Còn nợ, Trạng thái, Công ty
            const importedData = rows.map((row, index) => ({
                id: `${Date.now()}_${index}`, // Unique ID for each record
                stt: row['ST'] || index + 1,
                khachHang: row['Khách hàng'] || '',
                facebook: row['Facebook'] || '',
                dienThoai: String(row['Điện thoại'] || ''),
                diaChi: row['Địa chỉ'] || '',
                so: row['Số'] || '',
                thamChieu: row['Tham chiếu'] || '',
                ngayBan: row['Ngày bán'] || null,
                tongTien: parseFloat(row['Tổng tiền'] || 0),
                conNo: parseFloat(row['Còn nợ'] || 0),
                trangThai: row['Trạng thái'] || 'Nháp',
                congTy: row['Công ty'] || '',
                importedAt: new Date().toISOString()
            }));

            if (typeof showNotification === 'function') {
                showNotification('Đang lưu lên Firebase...', 'info');
            }

            // Merge with existing data (avoid duplicates by checking 'so' - invoice number)
            const existingInvoices = new Set(traHangData.map(item => item.so));
            const newData = importedData.filter(item => !existingInvoices.has(item.so) || !item.so);
            const duplicateCount = importedData.length - newData.length;

            // Merge: new data first, then existing
            const mergedData = [...newData, ...traHangData];

            // Save to Firebase
            const saveSuccess = await saveToFirebase(mergedData);

            if (saveSuccess) {
                // Update local state
                traHangData = mergedData;
                filteredData = [...traHangData];

                hideLoading();
                renderTable(traHangData);
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
            const updatedData = traHangData.filter(item => item.id !== id);
            const saveSuccess = await saveToFirebase(updatedData);

            if (saveSuccess) {
                traHangData = updatedData;
                filteredData = [...traHangData];
                renderTable(traHangData);
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

    // =====================================================
    // TPOS EXCEL BACKGROUND FETCH
    // =====================================================

    /**
     * Get TPOS access token via Cloudflare Worker
     */
    async function getTPOSToken() {
        try {
            console.log('[TraHang] 🔑 Fetching TPOS token...');

            const formData = new URLSearchParams();
            const creds = getTposCredentials();
            formData.append('grant_type', creds.grant_type);
            formData.append('username', creds.username);
            formData.append('password', creds.password);
            formData.append('client_id', creds.client_id);

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

            console.log('[TraHang] ✅ Token retrieved successfully');
            return data.access_token;

        } catch (error) {
            console.error('[TraHang] ❌ Error fetching token:', error);
            throw error;
        }
    }

    /**
     * Build filter for TPOS FastSaleOrder refund export
     * Default: Last 1 month of refund invoices
     */
    function buildTPOSExportFilterRefund() {
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
                    { field: "Type", operator: "eq", value: "refund" },
                    { field: "DateInvoice", operator: "gte", value: startISO },
                    { field: "DateInvoice", operator: "lte", value: endISO },
                    { field: "IsMergeCancel", operator: "neq", value: true }
                ]
            }
        };
    }

    /**
     * Fetch Excel file from TPOS FastSaleOrder/ExportFileRefund endpoint
     * Returns ArrayBuffer of the XLSX file
     */
    async function fetchExcelFromTPOSRefund(token) {
        console.log('[TraHang] 📊 Fetching Excel from TPOS...');

        const filter = buildTPOSExportFilterRefund();
        const body = {
            data: JSON.stringify(filter),
            ids: []
        };

        // Use the proxy endpoint for ExportFileRefund
        const response = await fetch(`${WORKER_URL}/api/FastSaleOrder/ExportFileRefund?TagIds=`, {
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
        console.log('[TraHang] ✅ Excel file received, size:', arrayBuffer.byteLength, 'bytes');

        return arrayBuffer;
    }

    /**
     * Parse Excel ArrayBuffer and convert to data array
     * Matches the structure from manual Excel import
     */
    async function parseTPOSExcel(arrayBuffer) {
        // Load XLSX library if not already loaded
        if (typeof XLSX === 'undefined') {
            console.log('[TraHang] Loading XLSX library...');
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

        console.log('[TraHang] Parsed', rows.length, 'rows from TPOS Excel');

        // Map Excel columns to our data structure
        const parsedData = rows.map((row, index) => ({
            id: `tpos_${Date.now()}_${index}`,
            stt: row['ST'] || index + 1,
            khachHang: row['Khách hàng'] || '',
            facebook: row['Facebook'] || '',
            dienThoai: String(row['Điện thoại'] || ''),
            diaChi: row['Địa chỉ'] || '',
            so: row['Số'] || '',
            thamChieu: row['Tham chiếu'] || '',
            ngayBan: row['Ngày bán'] || null,
            tongTien: parseFloat(row['Tổng tiền'] || 0),
            conNo: parseFloat(row['Còn nợ'] || 0),
            trangThai: row['Trạng thái'] || 'Nháp',
            congTy: row['Công ty'] || '',
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
                console.log(`[TraHang] Hit duplicate at invoice ${tposItem.so}, stopping sync`);
                break;
            }

            // New record from TPOS
            newRecords.push(tposItem);
            newCount++;
        }

        // Prepend new records to existing data
        const mergedData = [...newRecords, ...existingData];

        console.log(`[TraHang] Merge result: ${newCount} new records added`);

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
            console.log('[TraHang] Background fetch already in progress, skipping...');
            return;
        }

        isBackgroundFetching = true;
        console.log('[TraHang] 🔄 Starting background fetch from TPOS...');

        // Show subtle loading indicator
        const indicator = document.getElementById('trahangBackgroundIndicator');

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
            const excelBuffer = await fetchExcelFromTPOSRefund(token);

            // Step 3: Parse Excel data
            const tposData = await parseTPOSExcel(excelBuffer);

            if (tposData.length === 0) {
                console.log('[TraHang] No data from TPOS Excel');
                hideIndicator();
                return;
            }

            // Step 4: Merge with existing data (stops at first duplicate)
            const { data: mergedData, newCount } = mergeTPOSData(tposData, traHangData);

            // Step 5: Save to Firebase if there are new records
            if (newCount > 0) {
                console.log('[TraHang] Saving', newCount, 'new records to Firebase...');
                const saveSuccess = await saveToFirebase(mergedData);

                if (saveSuccess) {
                    // Update local state
                    traHangData = mergedData;
                    applyFilters(); // Re-apply filters and re-render

                    // Show success notification
                    if (typeof showNotification === 'function') {
                        showNotification(`TPOS sync: ${newCount} đơn mới`, 'success');
                    }

                    console.log('[TraHang] ✅ Background sync completed successfully');
                }
            } else {
                console.log('[TraHang] ✅ Dữ liệu đã đồng bộ (không có đơn mới)');
                if (typeof showNotification === 'function') {
                    showNotification('Dữ liệu đã đồng bộ', 'info');
                }
            }

            lastBackgroundFetchTime = new Date();

        } catch (error) {
            console.error('[TraHang] ❌ Background fetch error:', error);
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

    /**
     * Clear all data
     */
    async function clearAllData() {
        if (!confirm('Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu trả hàng?')) {
            return false;
        }

        try {
            const saveSuccess = await saveToFirebase([]);

            if (saveSuccess) {
                traHangData = [];
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
        getData: () => traHangData,
        getFilteredData: () => filteredData,
        isBackgroundFetching: () => isBackgroundFetching
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    // Only initialize if we're on the correct page
    if (document.getElementById('trahangTableBody')) {
        TraHangModule.init();

        // Import Excel button
        const btnImportExcel = document.getElementById('btnImportExcel');
        const excelFileInput = document.getElementById('excelFileInput');

        if (btnImportExcel && excelFileInput) {
            btnImportExcel.addEventListener('click', () => {
                excelFileInput.click();
            });

            excelFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    btnImportExcel.disabled = true;
                    try {
                        await TraHangModule.importExcel(file);
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
        const btnRefreshTraHang = document.getElementById('btnRefreshTraHang');
        if (btnRefreshTraHang) {
            btnRefreshTraHang.addEventListener('click', async () => {
                btnRefreshTraHang.disabled = true;
                try {
                    await TraHangModule.refreshData();
                } finally {
                    btnRefreshTraHang.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }

        // Clear all button
        const btnClearTraHang = document.getElementById('btnClearTraHang');
        if (btnClearTraHang) {
            btnClearTraHang.addEventListener('click', async () => {
                await TraHangModule.clearAllData();
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }

        // Sync TPOS button
        const btnSyncTPOSTraHang = document.getElementById('btnSyncTPOSTraHang');
        if (btnSyncTPOSTraHang) {
            btnSyncTPOSTraHang.addEventListener('click', async () => {
                btnSyncTPOSTraHang.disabled = true;
                try {
                    await TraHangModule.syncFromTPOS();
                } finally {
                    btnSyncTPOSTraHang.disabled = false;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            });
        }
    }
});

// Tab switching functionality with localStorage persistence
function initMainTabs() {
    const tabBtns = document.querySelectorAll('.main-tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const STORAGE_KEY = 'hanghoan_active_tab';

    // Restore saved tab from localStorage
    const savedTab = localStorage.getItem(STORAGE_KEY);
    if (savedTab) {
        const savedTabBtn = document.querySelector(`.main-tab-btn[data-tab="${savedTab}"]`);
        const savedTabContent = document.getElementById(savedTab);

        if (savedTabBtn && savedTabContent) {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Activate saved tab
            savedTabBtn.classList.add('active');
            savedTabContent.classList.add('active');

            // Auto-load data for Đối Soát tab if it was saved
            if (savedTab === 'doiSoatTab' && typeof DoiSoatModule !== 'undefined') {
                setTimeout(() => DoiSoatModule.loadDataOnTabActivation(), 200);
            }
        }
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const targetTab = this.dataset.tab;

            // Save active tab to localStorage
            localStorage.setItem(STORAGE_KEY, targetTab);

            // Remove active from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked tab
            this.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Auto-load data for Đối Soát tab
            if (targetTab === 'doiSoatTab' && typeof DoiSoatModule !== 'undefined') {
                DoiSoatModule.loadDataOnTabActivation();
            }

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    });
}

// Initialize tabs when DOM is ready
document.addEventListener('DOMContentLoaded', initMainTabs);

