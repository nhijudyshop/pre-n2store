/**
 * TAB3-CORE.JS
 * State management, Firebase config, utilities, auth, note encoding,
 * notification, data loading, save/load, initialization.
 *
 * Load order: tab3-core.js (1st)
 * Exposes: window._tab3 namespace for other tab3 sub-modules
 */
(function () {
    'use strict';

    // =====================================================
    // STATE & FIREBASE CONFIG
    // =====================================================

    let productsData = [];
    let ordersData = [];
    let ordersDataRequestAttempts = 0;
    let assignments = [];
    let isLoadingProducts = false;
    let bearerToken = null;
    let tokenExpiry = null;
    let saveDebounceTimer = null;
    let userStorageManager = null;
    let autoAddVariants = true;
    let productNotes = {};

    // Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    function getUserFirebasePath() {
        if (!userStorageManager) {
            userStorageManager = window.userStorageManager;
        }
        return userStorageManager ? userStorageManager.getUserFirebasePath('orders_productAssignments') : 'productAssignments/guest';
    }

    function removeVietnameseTones(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
        str = str.replace(/đ/g, 'd');
        return str;
    }

    function extractProductCode(productName) {
        if (!productName) return '';
        const match = productName.match(/\[([^\]]+)\]/);
        return match ? match[1].trim() : '';
    }

    function formatCurrency(amount) {
        if (!amount) return '0đ';
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // NOTE ENCODING/DECODING UTILITIES
    // =====================================================
    const ENCODE_KEY = 'live';

    function base64UrlEncode(str) {
        return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function base64UrlDecode(str) {
        const padding = '='.repeat((4 - str.length % 4) % 4);
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
        const binary = atob(base64);
        return new TextDecoder().decode(
            Uint8Array.from(binary, c => c.charCodeAt(0))
        );
    }

    function xorEncrypt(text, key) {
        const textBytes = new TextEncoder().encode(text);
        const keyBytes = new TextEncoder().encode(key);
        const encrypted = new Uint8Array(textBytes.length);

        for (let i = 0; i < textBytes.length; i++) {
            encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        return btoa(String.fromCharCode(...encrypted));
    }

    function xorDecrypt(encoded, key) {
        const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(key);
        const decrypted = new Uint8Array(encrypted.length);

        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        return new TextDecoder().decode(decrypted);
    }

    function encodeFullNote(text) {
        if (!text || text.trim() === '') return '';

        const encrypted = xorEncrypt(text, ENCODE_KEY);
        const encoded = base64UrlEncode(encrypted);

        return `["${encoded}"]`;
    }

    function decodeFullNote(encoded) {
        if (!encoded || encoded.trim() === '') return null;

        try {
            let encodedString = encoded.trim();

            const wrapperMatch = encodedString.match(/^\["(.+)"\]$/);
            if (wrapperMatch) {
                encodedString = wrapperMatch[1];
            }

            const decrypted = base64UrlDecode(encodedString);
            const text = xorDecrypt(decrypted, ENCODE_KEY);

            return text;
        } catch (error) {
            return null;
        }
    }

    function extractNoteComponents(note) {
        if (!note || note.trim() === '') {
            return { plainText: '', encodedContent: null };
        }

        const wrapperMatch = note.match(/\["([A-Za-z0-9\-_]+)"\]/);

        if (wrapperMatch) {
            const encodedContent = wrapperMatch[0];
            const plainText = note.replace(encodedContent, '').trim();
            return { plainText, encodedContent };
        }

        return { plainText: note.trim(), encodedContent: null };
    }

    function buildProductNoteLines(products) {
        if (!products || products.length === 0) return '';

        return products.map(p =>
            `${p.productCode} - ${p.quantity} - ${p.price}`
        ).join('\n');
    }

    function processNoteForUpload(currentNote, products) {
        let plainTextOutside = '';
        let decodedContent = '';

        if (currentNote && currentNote.trim() !== '') {
            const { plainText, encodedContent } = extractNoteComponents(currentNote);
            plainTextOutside = plainText;

            if (encodedContent) {
                console.log('[NOTE] Found encoded content in [""], decoding...');
                decodedContent = decodeFullNote(encodedContent) || '';
            } else {
                const decoded = decodeFullNote(currentNote);
                if (decoded) {
                    console.log('[NOTE] Legacy encoded note, decoding...');
                    decodedContent = decoded;
                    plainTextOutside = '';
                } else {
                    decodedContent = currentNote;
                    plainTextOutside = '';
                }
            }
        }

        const productLines = buildProductNoteLines(products);

        let contentToEncode = '';
        if (decodedContent.trim() !== '' && productLines !== '') {
            contentToEncode = `${decodedContent}\n${productLines}`;
        } else if (decodedContent.trim() !== '') {
            contentToEncode = decodedContent;
        } else if (productLines !== '') {
            contentToEncode = productLines;
        }

        console.log('[NOTE] Content to encode:\n', contentToEncode);

        let finalNote = '';

        if (contentToEncode.trim() !== '') {
            const encoded = encodeFullNote(contentToEncode);
            console.log('[NOTE] Encoded content length:', encoded.length);

            if (plainTextOutside.trim() !== '') {
                finalNote = `${plainTextOutside}\n${encoded}`;
            } else {
                finalNote = encoded;
            }
        } else if (plainTextOutside.trim() !== '') {
            finalNote = plainTextOutside;
        }

        return finalNote;
    }

    // =====================================================
    // NOTIFICATION
    // =====================================================

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, ${type === 'success' ? '#10b981 0%, #059669 100%' : '#ef4444 0%, #dc2626 100%'});
            color: white;
            padding: 16px 24px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 600;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // =====================================================
    // AUTH & API
    // =====================================================

    async function getAuthToken() {
        try {
            const response = await API_CONFIG.smartFetch(`${API_CONFIG.WORKER_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `grant_type=password&username=${(window.ShopConfig?.getConfig?.()?.CompanyId || 1) === 2 ? 'nvktshop1' : 'nvktlive1'}&password=Aa%4028612345678&client_id=tmtWebApp`
            });

            if (!response.ok) {
                throw new Error('Không thể xác thực');
            }

            const data = await response.json();

            bearerToken = data.access_token;
            tokenExpiry = Date.now() + (data.expires_in * 1000);
            console.log('[AUTH] ✅ Token received (server-side cached)');

            return data.access_token;
        } catch (error) {
            console.error('Lỗi xác thực:', error);
            throw error;
        }
    }

    async function getValidToken() {
        if (bearerToken && tokenExpiry && tokenExpiry > Date.now() + 300000) {
            console.log('[AUTH] ✅ Using locally cached token');
            return bearerToken;
        }

        console.log('[AUTH] Token expired or not available, fetching new token...');
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

            return fetch(url, {
                ...options,
                headers
            });
        }

        return response;
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    async function loadProductsData() {
        if (isLoadingProducts || productsData.length > 0) return;

        isLoadingProducts = true;
        const loadingIndicator = document.getElementById('loadingIndicator');
        loadingIndicator.style.display = 'block';

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

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            productsData = jsonData.map(row => {
                const productName = row['Tên sản phẩm'];
                const codeFromName = extractProductCode(productName);
                return {
                    id: row['Id sản phẩm (*)'],
                    name: productName,
                    nameNoSign: removeVietnameseTones(productName || ''),
                    code: codeFromName || row['Mã sản phẩm']
                };
            });

            console.log(`Đã load ${productsData.length} sản phẩm`);
        } catch (error) {
            console.error('Error loading products:', error);
            showNotification('Lỗi khi tải dữ liệu sản phẩm: ' + error.message, 'error');
        } finally {
            loadingIndicator.style.display = 'none';
            isLoadingProducts = false;
        }
    }

    function loadOrdersData() {
        try {
            console.log('[ORDERS] Requesting fresh orders data from tab1...');
            requestOrdersDataFromTab1();
        } catch (error) {
            console.error('Error loading orders:', error);
            ordersData = [];
            requestOrdersDataFromTab1();
        }
    }

    function requestOrdersDataFromTab1() {
        if (window.parent) {
            window.parent.postMessage({
                type: 'REQUEST_ORDERS_DATA_FROM_TAB3'
            }, '*');
            console.log('📤 Đã gửi request lấy orders data từ tab1');
        }
    }

    // =====================================================
    // SAVE/LOAD ASSIGNMENTS
    // =====================================================

    function saveAssignments(immediate = false) {
        try {
            const sanitizedAssignments = assignments.map(a => {
                const cleanAssignment = { ...a };

                if (cleanAssignment.sttList && Array.isArray(cleanAssignment.sttList)) {
                    cleanAssignment.sttList = cleanAssignment.sttList.map(s => {
                        const cleanSTT = { ...s };
                        if (cleanSTT.orderInfo) {
                            cleanSTT.orderInfo = { ...cleanSTT.orderInfo };
                            if (cleanSTT.orderInfo.totalAmount === undefined) {
                                cleanSTT.orderInfo.totalAmount = 0;
                            }
                        }
                        return cleanSTT;
                    });
                }
                return cleanAssignment;
            });

            const dataWithTimestamp = {
                assignments: sanitizedAssignments,
                _timestamp: Date.now(),
                _version: 1
            };

            console.log('[SAVE] 💾 Saving to LocalStorage with timestamp:', dataWithTimestamp._timestamp);

            const performSave = () => {
                try {
                    localStorage.setItem('orders_productAssignments', JSON.stringify(dataWithTimestamp));
                    console.log('[SAVE] ✅ LocalStorage save success');

                    window.dispatchEvent(new Event('storage'));
                } catch (error) {
                    console.error('[SAVE] ❌ LocalStorage save error:', error);
                    showNotification('Lỗi lưu dữ liệu: ' + error.message, 'error');
                }
            };

            if (immediate) {
                performSave();
            } else {
                if (saveDebounceTimer) {
                    clearTimeout(saveDebounceTimer);
                }
                saveDebounceTimer = setTimeout(() => {
                    saveDebounceTimer = null;
                    performSave();
                }, 500);
            }
        } catch (error) {
            console.error('Error saving assignments:', error);
        }
    }

    function loadAssignmentsFromLocalStorage() {
        try {
            console.log('[INIT] 🔄 Loading assignments from LocalStorage...');

            const storedData = localStorage.getItem('orders_productAssignments');

            if (storedData) {
                const parsedData = JSON.parse(storedData);

                if (parsedData && parsedData.assignments && Array.isArray(parsedData.assignments)) {
                    assignments = parsedData.assignments;
                    console.log('[INIT] ✅ Loaded from LocalStorage:', assignments.length, 'assignments');
                } else if (Array.isArray(parsedData)) {
                    console.log('[INIT] 📦 Old LocalStorage format detected, migrating...');
                    assignments = parsedData;
                    saveAssignments();
                } else {
                    console.log('[INIT] ⚠️ Invalid data in LocalStorage');
                    assignments = [];
                }
            } else {
                console.log('[INIT] 📭 LocalStorage is empty');
                assignments = [];
            }

            // renderAssignmentTable will be called after all modules load
            if (window._tab3 && window._tab3.fn.renderAssignmentTable) {
                window._tab3.fn.renderAssignmentTable();
            }
            console.log('[INIT] ✅ Initial load complete, assignments count:', assignments.length);
        } catch (error) {
            console.error('[INIT] ❌ Error loading from LocalStorage:', error);
            assignments = [];
            if (window._tab3 && window._tab3.fn.renderAssignmentTable) {
                window._tab3.fn.renderAssignmentTable();
            }
        }
    }

    function setupLocalStorageListeners() {
        console.log('[SYNC] 🔧 Setting up LocalStorage listeners');

        window.addEventListener('storage', (event) => {
            if (event.key === 'orders_productAssignments') {
                console.log('[SYNC] 🔔 LocalStorage changed (from another tab)');
                loadAssignmentsFromLocalStorage();
                showNotification('🔄 Dữ liệu đã được cập nhật từ tab khác');
            }
        });
    }

    function updateOrdersCount() {
        const countElement = document.getElementById('ordersCount');
        if (countElement) {
            countElement.textContent = ordersData.length;
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    window.addEventListener('load', async () => {
        try {
            console.log('[INIT] 🚀 Initializing Tab3 Product Assignment...');
            console.log('[INIT] ✅ Using server-side token caching (Cloudflare Worker & Render.com)');

            userStorageManager = window.userStorageManager;
            if (!userStorageManager) {
                console.warn('[INIT] ⚠️ UserStorageManager not available, creating fallback');
                userStorageManager = {
                    getUserFirebasePath: (path) => `${path}/guest`,
                    getUserIdentifier: () => 'guest'
                };
            }
            console.log('[INIT] 📱 User identifier:', userStorageManager.getUserIdentifier ? userStorageManager.getUserIdentifier() : 'guest');

            await getValidToken();
            loadOrdersData();

            console.log('[INIT] 📱 Loading from LocalStorage...');
            loadAssignmentsFromLocalStorage();

            console.log('[INIT] 🔧 Setting up listeners...');
            setupLocalStorageListeners();

            await loadProductsData();
            updateOrdersCount();

            console.log('[INIT] ✅ Initialization complete!');
        } catch (error) {
            console.error('[INIT] ❌ Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

    // Listen for orders data updates from parent window
    window.addEventListener('message', (event) => {
        if (event.data.type === 'ORDERS_DATA_UPDATE' || event.data.type === 'ORDERS_DATA_RESPONSE_TAB3') {
            ordersData = event.data.orders;
            ordersDataRequestAttempts = 0;
            console.log('[ORDERS] ✅ Updated orders data in memory:', ordersData.length, 'orders');

            updateOrdersCount();

            if (ordersData.length > 0) {
                showNotification(`📦 Đã load ${ordersData.length} đơn hàng từ Tab Quản Lý`);
            }
        }
    });

    // =====================================================
    // EXPOSE SHARED NAMESPACE
    // =====================================================

    window._tab3 = {
        // Mutable state - accessed directly by other modules
        get state() {
            return {
                get productsData() { return productsData; },
                set productsData(v) { productsData = v; },
                get ordersData() { return ordersData; },
                set ordersData(v) { ordersData = v; },
                get ordersDataRequestAttempts() { return ordersDataRequestAttempts; },
                set ordersDataRequestAttempts(v) { ordersDataRequestAttempts = v; },
                get assignments() { return assignments; },
                set assignments(v) { assignments = v; },
                get isLoadingProducts() { return isLoadingProducts; },
                set isLoadingProducts(v) { isLoadingProducts = v; },
                get bearerToken() { return bearerToken; },
                set bearerToken(v) { bearerToken = v; },
                get tokenExpiry() { return tokenExpiry; },
                set tokenExpiry(v) { tokenExpiry = v; },
                get saveDebounceTimer() { return saveDebounceTimer; },
                set saveDebounceTimer(v) { saveDebounceTimer = v; },
                get userStorageManager() { return userStorageManager; },
                set userStorageManager(v) { userStorageManager = v; },
                get autoAddVariants() { return autoAddVariants; },
                set autoAddVariants(v) { autoAddVariants = v; },
                get productNotes() { return productNotes; },
                set productNotes(v) { productNotes = v; },
            };
        },

        // Shared database reference
        database: database,

        // Utility functions
        utils: {
            removeVietnameseTones: removeVietnameseTones,
            extractProductCode: extractProductCode,
            formatCurrency: formatCurrency,
            escapeHtml: escapeHtml,
            getUserFirebasePath: getUserFirebasePath,
        },

        // Auth functions
        auth: {
            getAuthToken: getAuthToken,
            getValidToken: getValidToken,
            authenticatedFetch: authenticatedFetch,
        },

        // Note encoding
        noteEncoding: {
            ENCODE_KEY: ENCODE_KEY,
            base64UrlEncode: base64UrlEncode,
            base64UrlDecode: base64UrlDecode,
            xorEncrypt: xorEncrypt,
            xorDecrypt: xorDecrypt,
            encodeFullNote: encodeFullNote,
            decodeFullNote: decodeFullNote,
            extractNoteComponents: extractNoteComponents,
            buildProductNoteLines: buildProductNoteLines,
            processNoteForUpload: processNoteForUpload,
        },

        // UI helpers
        ui: {
            showNotification: showNotification,
        },

        // Data functions
        data: {
            loadProductsData: loadProductsData,
            loadOrdersData: loadOrdersData,
            requestOrdersDataFromTab1: requestOrdersDataFromTab1,
            saveAssignments: saveAssignments,
            loadAssignmentsFromLocalStorage: loadAssignmentsFromLocalStorage,
            updateOrdersCount: updateOrdersCount,
        },

        // Functions registered by other modules (filled in later)
        fn: {},
    };

})();
