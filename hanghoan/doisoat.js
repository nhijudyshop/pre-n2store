/* =====================================================
   ĐỐI SOÁT MODULE
   Cross-check product history management
   Using N2Store shared utilities and TPOS proxy
   With Firebase caching + background sync
   ===================================================== */

const DoiSoatModule = (function () {
    // Module state
    let currentPage = 1;
    let pageSize = 20;
    let totalCount = 0;
    let currentData = [];
    let cachedData = []; // Firebase cached data
    let tokenManager = null;
    let isBackgroundFetching = false;

    // Firebase
    let db = null;
    let doiSoatCollectionRef = null;
    const MAX_RECORDS_PER_DOC = 500; // Firestore document size limit

    // API Configuration - MUST use Cloudflare Worker Proxy (theo ARCHITECTURE.md)
    // Uses TPOS_CONFIG from js/tpos-config.js for centralized version management
    const API_CONFIG = {
        proxyUrl: window.TPOS_CONFIG?.proxyUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev',
        fallbackUrl: 'https://n2store-api-fallback.onrender.com',
        endpoint: '/api/odata/FastSaleOrder/ODataService.GetHistoryCrossCheckProductView',
        get tposAppVersion() { return window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'; }
    };

    // DOM Elements
    let elements = {};

    /**
     * Initialize the module
     */
    function init() {
        // Wait for core utilities to load
        if (typeof window.tokenManager === 'undefined') {
            console.log('[DoiSoat] Waiting for core utilities...');
            document.addEventListener('coreUtilitiesLoaded', () => {
                console.log('[DoiSoat] Core utilities loaded');
                initModule();
            });
        } else {
            initModule();
        }
    }

    /**
     * Initialize Firebase for caching
     */
    function initFirebase() {
        try {
            // Check if Firebase is already initialized
            if (typeof firebase === 'undefined') {
                console.warn('[DoiSoat] Firebase not available');
                return false;
            }
            if (firebase.apps.length === 0) {
                // Firebase should be initialized by other modules (trahang.js or banhang.js)
                console.warn('[DoiSoat] Firebase not initialized yet, will use direct API only');
                return false;
            }
            db = firebase.firestore();
            doiSoatCollectionRef = db.collection("doi_soat");
            console.log('[DoiSoat] ✅ Firebase initialized');
            return true;
        } catch (error) {
            console.error('[DoiSoat] ❌ Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Initialize module after utilities are loaded
     */
    function initModule() {
        tokenManager = window.tokenManager;
        initFirebase();
        initElements();
        initEventListeners();
        initDefaultDates();
        console.log('[DoiSoat] Module initialized successfully');

        // Auto-load data if the Đối Soát tab is already active on page load
        setTimeout(() => {
            const doiSoatTab = document.getElementById('doiSoatTab');
            if (doiSoatTab && doiSoatTab.classList.contains('active')) {
                console.log('[DoiSoat] Tab is active on init, loading data...');
                loadDataWithCache();
            }
        }, 100);
    }

    /**
     * Load data with Firebase cache first, then background sync from TPOS
     */
    async function loadDataWithCache() {
        // Try to load from Firebase cache first
        const cacheLoaded = await loadFromFirebase();

        // Then background fetch from TPOS to get latest data
        setTimeout(() => {
            console.log('[DoiSoat] Starting background TPOS sync...');
            backgroundFetchFromTPOS();
        }, 500);
    }

    /**
     * Initialize DOM element references
     */
    function initElements() {
        elements = {
            // Filters
            startDate: document.getElementById('doiSoatStartDate'),
            endDate: document.getElementById('doiSoatEndDate'),
            numberInput: document.getElementById('doiSoatNumber'),
            maDonVanInput: document.getElementById('doiSoatMaDonVan'),
            searchBtn: document.getElementById('btnSearchDoiSoat'),

            // Table
            tableBody: document.getElementById('doiSoatTableBody'),

            // Pagination
            prevBtn: document.getElementById('btnPrevDoiSoat'),
            nextBtn: document.getElementById('btnNextDoiSoat'),
            pageInfo: document.getElementById('doiSoatPageInfo'),

            // States
            loadingState: document.getElementById('doiSoatLoadingState'),
            emptyState: document.getElementById('doiSoatEmptyState')
        };
    }

    /**
     * Initialize event listeners
     */
    function initEventListeners() {
        // Search button
        elements.searchBtn?.addEventListener('click', handleSearch);

        // Enter key on inputs
        [elements.numberInput, elements.maDonVanInput].forEach(input => {
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleSearch();
                }
            });
        });

        // Pagination
        elements.prevBtn?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                handleSearch();
            }
        });

        elements.nextBtn?.addEventListener('click', () => {
            const maxPage = Math.ceil(totalCount / pageSize);
            if (currentPage < maxPage) {
                currentPage++;
                handleSearch();
            }
        });
    }

    /**
     * Initialize default date range (last 30 days)
     */
    function initDefaultDates() {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        // Format as datetime-local: YYYY-MM-DDTHH:mm
        const formatDateTime = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        if (elements.startDate) {
            elements.startDate.value = formatDateTime(thirtyDaysAgo);
        }
        if (elements.endDate) {
            elements.endDate.value = formatDateTime(endOfToday);
        }
    }

    /**
     * Handle search button click
     */
    async function handleSearch() {
        currentPage = 1; // Reset to first page on new search
        await fetchData();
    }

    /**
     * Smart fetch with fallback support
     */
    async function smartFetch(url, options) {
        try {
            console.log('[DoiSoat] Trying primary proxy:', API_CONFIG.proxyUrl + url);
            const response = await fetch(API_CONFIG.proxyUrl + url, options);
            console.log('[DoiSoat] Primary proxy response status:', response.status);

            if (!response.ok && response.status >= 500) {
                throw new Error('Primary proxy failed, trying fallback');
            }
            return response;
        } catch (error) {
            console.warn('[DoiSoat] Primary proxy failed, using fallback:', error.message);
            console.log('[DoiSoat] Fallback URL:', API_CONFIG.fallbackUrl + url);
            const fallbackResponse = await fetch(API_CONFIG.fallbackUrl + url, options);
            console.log('[DoiSoat] Fallback response status:', fallbackResponse.status);
            return fallbackResponse;
        }
    }

    /**
     * Fetch data from API using TPOS proxy
     */
    async function fetchData() {
        try {
            showLoading(true);

            // Get fresh token from TokenManager
            let token = '';
            if (tokenManager) {
                token = await tokenManager.getToken();
            } else {
                console.warn('[DoiSoat] TokenManager not available, using fallback auth');
                // Fallback to manual token retrieval
                const authData = JSON.parse(localStorage.getItem('bearer_token_data') || '{}');
                token = authData.access_token || '';
            }

            if (!token) {
                throw new Error('Không tìm thấy token xác thực. Vui lòng đăng nhập lại.');
            }

            const params = buildQueryParams();
            const url = `${API_CONFIG.endpoint}?${params}`;

            // Gọi qua Cloudflare Worker Proxy (bắt buộc để bypass CORS)
            const response = await smartFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            currentData = data.value || [];
            totalCount = data['@odata.count'] || 0;

            renderTable(currentData);
            updatePagination();
            showLoading(false);

            // Use notification system if available
            if (typeof showNotification === 'function') {
                showNotification(`Đã tải ${currentData.length} bản ghi`, 'success');
            }

        } catch (error) {
            console.error('[DoiSoat] Error fetching data:', error);

            // Use notification system if available
            if (typeof showNotification === 'function') {
                showNotification('Lỗi khi tải dữ liệu: ' + error.message, 'error');
            } else {
                alert('Lỗi khi tải dữ liệu: ' + error.message);
            }

            showLoading(false);
            showEmptyState(true);
        }
    }

    /**
     * Build query parameters for API request
     * Format theo TPOS API: Number=&DateFrom=...&DateTo=...&&$top=20&$count=true
     */
    function buildQueryParams() {
        const parts = [];

        // Number filter (always include, even if empty)
        const number = elements.numberInput?.value.trim() || '';
        parts.push(`Number=${encodeURIComponent(number)}`);

        // Tracking Reference (Mã đơn vận) filter - optional
        const trackingRef = elements.maDonVanInput?.value.trim() || '';
        if (trackingRef) {
            parts.push(`TrackingRef=${encodeURIComponent(trackingRef)}`);
        }

        // Date range
        if (elements.startDate?.value) {
            const startDate = new Date(elements.startDate.value);
            parts.push(`DateFrom=${encodeURIComponent(startDate.toISOString())}`);
        }

        if (elements.endDate?.value) {
            const endDate = new Date(elements.endDate.value);
            parts.push(`DateTo=${encodeURIComponent(endDate.toISOString())}`);
        }

        // CompanyId (required by TPOS API)
        parts.push('CompanyId=1');

        // Join parts with & and add && before pagination params (như TPOS format)
        let queryString = parts.join('&');

        // Add double && before OData params (theo format của TPOS)
        queryString += `&&$top=${pageSize}&$count=true`;

        return queryString;
    }

    /**
     * Render table with data
     */
    function renderTable(data) {
        if (!elements.tableBody) return;

        elements.tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            showEmptyState(true);
            return;
        }

        showEmptyState(false);

        data.forEach(item => {
            const row = createTableRow(item);
            elements.tableBody.appendChild(row);
        });

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Create a table row element
     */
    function createTableRow(item) {
        const tr = document.createElement('tr');

        // Number
        const tdNumber = document.createElement('td');
        tdNumber.className = 'col-number';
        tdNumber.textContent = item.Number || '-';
        tr.appendChild(tdNumber);

        // Tracking Reference
        const tdTracking = document.createElement('td');
        tdTracking.className = 'col-tracking';
        tdTracking.textContent = item.TrackingRef || '-';
        tr.appendChild(tdTracking);

        // Username
        const tdUsername = document.createElement('td');
        tdUsername.className = 'col-username';
        tdUsername.textContent = item.UserName || '-';
        tr.appendChild(tdUsername);

        // Date Created
        const tdDate = document.createElement('td');
        tdDate.className = 'col-date';
        tdDate.textContent = formatDate(item.DateCreated);
        tr.appendChild(tdDate);

        // Status
        const tdStatus = document.createElement('td');
        tdStatus.className = 'col-status';
        const statusSpan = document.createElement('span');
        statusSpan.className = `doisoat-status ${item.Success ? 'success' : 'error'}`;
        statusSpan.textContent = item.Success ? 'Thành công' : 'Lỗi';
        tdStatus.appendChild(statusSpan);
        tr.appendChild(tdStatus);

        // Content
        const tdContent = document.createElement('td');
        tdContent.className = 'col-content';
        const contentDiv = createContentElement(item.Content, item.Error);
        tdContent.appendChild(contentDiv);
        tr.appendChild(tdContent);

        return tr;
    }

    /**
     * Create content element with expand/collapse functionality
     */
    function createContentElement(content, error) {
        const container = document.createElement('div');

        const contentText = content || error || '-';
        const decodedContent = decodeUnicodeContent(contentText);

        const previewDiv = document.createElement('div');
        previewDiv.className = 'doisoat-content-preview';

        const contentP = document.createElement('p');
        contentP.className = 'doisoat-content';
        contentP.textContent = decodedContent;
        previewDiv.appendChild(contentP);

        container.appendChild(previewDiv);

        // Add "Xem thêm" button if content is long
        if (decodedContent.length > 100) {
            const toggleBtn = document.createElement('span');
            toggleBtn.className = 'doisoat-content-toggle';
            toggleBtn.textContent = 'Xem thêm';
            toggleBtn.addEventListener('click', () => {
                previewDiv.classList.toggle('expanded');
                toggleBtn.textContent = previewDiv.classList.contains('expanded')
                    ? 'Thu gọn'
                    : 'Xem thêm';
            });
            container.appendChild(toggleBtn);
        }

        return container;
    }

    /**
     * Decode Unicode escape sequences in content
     */
    function decodeUnicodeContent(str) {
        if (!str) return '';
        try {
            return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
                return String.fromCharCode(parseInt(code, 16));
            });
        } catch (e) {
            return str;
        }
    }

    /**
     * Format date string
     */
    function formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Update pagination controls
     */
    function updatePagination() {
        const maxPage = Math.ceil(totalCount / pageSize);

        // Update page info
        if (elements.pageInfo) {
            elements.pageInfo.textContent = `Trang ${currentPage} / ${maxPage || 1} (Tổng: ${totalCount})`;
        }

        // Update button states
        if (elements.prevBtn) {
            elements.prevBtn.disabled = currentPage <= 1;
        }

        if (elements.nextBtn) {
            elements.nextBtn.disabled = currentPage >= maxPage;
        }
    }

    /**
     * Show/hide loading state
     */
    function showLoading(show) {
        if (elements.loadingState) {
            if (show) {
                elements.loadingState.classList.add('show');
                if (elements.tableBody) {
                    elements.tableBody.style.display = 'none';
                }
            } else {
                elements.loadingState.classList.remove('show');
                if (elements.tableBody) {
                    elements.tableBody.style.display = '';
                }
            }
        }
    }

    /**
     * Show/hide empty state
     */
    function showEmptyState(show) {
        if (elements.emptyState) {
            if (show) {
                elements.emptyState.classList.add('show');
            } else {
                elements.emptyState.classList.remove('show');
            }
        }
    }

    /**
     * Load data on tab activation - Use cache + background sync
     */
    function loadDataOnTabActivation() {
        // Check if we're on the Đối Soát tab
        const doiSoatTab = document.getElementById('doiSoatTab');
        if (doiSoatTab && doiSoatTab.classList.contains('active')) {
            // Auto-load data when tab is activated
            if (elements.tableBody) {
                console.log('[DoiSoat] Auto-loading data on tab activation');
                loadDataWithCache();
            }
        }
    }

    // =====================================================
    // FIREBASE CACHING FUNCTIONS
    // =====================================================

    /**
     * Load data from Firebase cache
     */
    async function loadFromFirebase() {
        if (!doiSoatCollectionRef) {
            console.log('[DoiSoat] Firebase not available, skipping cache load');
            return false;
        }

        try {
            showLoading(true);
            console.log('[DoiSoat] Loading from Firebase cache...');

            // Load all chunks
            const snapshot = await doiSoatCollectionRef.get();
            let allRecords = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.records && Array.isArray(data.records)) {
                    allRecords = allRecords.concat(data.records);
                }
            });

            if (allRecords.length > 0) {
                cachedData = allRecords;
                currentData = allRecords;
                totalCount = allRecords.length;

                console.log(`[DoiSoat] ✅ Loaded ${allRecords.length} records from Firebase cache`);

                renderTable(currentData);
                updatePagination();
                showLoading(false);

                if (typeof showNotification === 'function') {
                    showNotification(`Đã tải ${allRecords.length} bản ghi từ cache`, 'success');
                }

                return true;
            } else {
                console.log('[DoiSoat] No cached data found');
                showLoading(false);
                return false;
            }
        } catch (error) {
            console.error('[DoiSoat] Error loading from Firebase:', error);
            showLoading(false);
            return false;
        }
    }

    /**
     * Save data to Firebase - split into chunks to avoid size limit
     */
    async function saveToFirebase(data) {
        if (!doiSoatCollectionRef) {
            console.log('[DoiSoat] Firebase not available, skipping save');
            return false;
        }

        try {
            // Delete all existing documents first
            const snapshot = await doiSoatCollectionRef.get();
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
                return doiSoatCollectionRef.doc(`chunk_${index}`).set({
                    records: chunk,
                    chunkIndex: index,
                    lastUpdated: new Date().toISOString(),
                    count: chunk.length
                });
            });

            // Also save metadata
            savePromises.push(doiSoatCollectionRef.doc('_metadata').set({
                totalCount: data.length,
                chunkCount: chunks.length,
                lastUpdated: new Date().toISOString()
            }));

            await Promise.all(savePromises);
            console.log(`[DoiSoat] ✅ Saved ${data.length} records to Firebase in ${chunks.length} chunks`);
            return true;
        } catch (error) {
            console.error('[DoiSoat] Error saving to Firebase:', error);
            return false;
        }
    }

    /**
     * Merge TPOS data with cached data
     * Uses Number (Số HĐ) as unique key to detect duplicates
     */
    function mergeData(newData, existingData) {
        const existingSet = new Set();
        existingData.forEach(item => {
            if (item.Number) {
                existingSet.add(item.Number);
            }
        });

        let newCount = 0;
        const newRecords = [];

        // Iterate through new data (newest first based on DateCreated)
        for (const newItem of newData) {
            if (!newItem.Number) continue;

            if (existingSet.has(newItem.Number)) {
                // Hit a duplicate - this record already exists
                // Continue checking others as TPOS may have updates at different times
                continue;
            }

            // New record
            newRecords.push(newItem);
            newCount++;
        }

        // Prepend new records to existing data (newest first)
        const mergedData = [...newRecords, ...existingData];

        console.log(`[DoiSoat] Merge result: ${newCount} new records added`);

        return {
            data: mergedData,
            newCount
        };
    }

    /**
     * Background fetch from TPOS and update cache
     */
    async function backgroundFetchFromTPOS() {
        if (isBackgroundFetching) {
            console.log('[DoiSoat] Background fetch already in progress, skipping...');
            return;
        }

        isBackgroundFetching = true;
        console.log('[DoiSoat] 🔄 Starting background fetch from TPOS...');

        try {
            // Get fresh token
            let token = '';
            if (tokenManager) {
                token = await tokenManager.getToken();
            } else {
                const authData = JSON.parse(localStorage.getItem('bearer_token_data') || '{}');
                token = authData.access_token || '';
            }

            if (!token) {
                console.warn('[DoiSoat] No token available for background sync');
                isBackgroundFetching = false;
                return;
            }

            const params = buildQueryParams();
            const url = `${API_CONFIG.endpoint}?${params}`;

            const response = await smartFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const tposData = data.value || [];
            const tposCount = data['@odata.count'] || 0;

            if (tposData.length === 0) {
                console.log('[DoiSoat] No data from TPOS');
                isBackgroundFetching = false;
                return;
            }

            // Merge with cached data
            const { data: mergedData, newCount } = mergeData(tposData, cachedData);

            // Save to Firebase if there are changes
            if (newCount > 0 || cachedData.length === 0) {
                console.log(`[DoiSoat] Saving ${mergedData.length} records to Firebase...`);
                await saveToFirebase(mergedData);

                // Update local state
                cachedData = mergedData;
                currentData = mergedData;
                totalCount = tposCount;

                // Re-render
                renderTable(currentData);
                updatePagination();

                if (typeof showNotification === 'function') {
                    if (newCount > 0) {
                        showNotification(`TPOS sync: ${newCount} bản ghi mới`, 'success');
                    } else {
                        showNotification('Dữ liệu đã được cập nhật từ TPOS', 'info');
                    }
                }

                console.log('[DoiSoat] ✅ Background sync completed successfully');
            } else {
                console.log('[DoiSoat] ✅ Data already up-to-date');
                // Still update from TPOS for latest data even if no new records
                currentData = tposData;
                totalCount = tposCount;
                renderTable(currentData);
                updatePagination();
            }

        } catch (error) {
            console.error('[DoiSoat] ❌ Background fetch error:', error);
            // If cache was empty, try direct fetch
            if (currentData.length === 0) {
                console.log('[DoiSoat] Cache empty, falling back to direct fetch');
                await fetchData();
            }
        }

        isBackgroundFetching = false;
    }

    // Public API
    return {
        init,
        loadDataOnTabActivation,
        loadDataWithCache,
        backgroundFetchFromTPOS
    };
})();

// Initialize module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    DoiSoatModule.init();
});
