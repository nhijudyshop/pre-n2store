        let soluongProducts = {}; // Object-based structure
        let filteredProducts = []; // For search results
        let searchKeyword = ''; // Current search keyword
        let pageBeforeSearch = 1; // Save page before searching
        let currentPage = 1;
        let itemsPerPage = 8;
        let displaySettings = {
            columns: 4,
            rows: 2,
            gap: 15,
            itemHeight: 500,
            nameMargin: 3
        };
        let isSyncMode = false;
        let isMergeVariants = false; // Merge variants mode disabled by default
        let soluongIsHideEditControls = false; // Hide edit controls mode disabled by default
        let firebaseDetachFn = null; // Store detach function for cleanup on page unload

        // Sync listeners state (Optimization - Step 2: Only listen when needed)
        let syncListenersAttached = false;
        let syncPageListenerRef = null;
        let syncSearchListenerRef = null;
        let lastSyncedSearchTimestamp = 0; // Move here for cleanup function access

        // Optimization: Cache normalized product names for faster search
        let normalizedProductNames = new Map(); // productId -> normalized name

        // Optimization: Debounce timers for search input and Firebase sync
        let searchInputDebounceTimer = null;
        let firebaseSyncDebounceTimer = null;
        const SEARCH_INPUT_DEBOUNCE_MS = 300; // Wait 300ms after user stops typing
        const FIREBASE_SYNC_DEBOUNCE_MS = 500; // Wait 500ms before syncing to Firebase

        // Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
        // Firebase is auto-initialized by shared config
        const database = firebase.database();

        let isSyncingFromFirebase = false;
        let bearerToken = null;
        let tokenExpiry = null;

        // Staff info for logging sales
        const authManager = new AuthManager({ redirectUrl: '../index.html' });
        window.authManager = authManager; // Expose to window for navigation-core.js
        let staffName = 'Livestream Operator';
        let staffUsername = 'livestream';

        // Load staff info on page ready
        (function loadStaffInfo() {
            const userInfo = authManager.getUserInfo();
            if (userInfo) {
                staffName = userInfo.displayName || userInfo.username || 'Livestream Operator';
                staffUsername = userInfo.username || 'livestream';
                console.log('👤 Staff logged in:', staffName);
            }
        })();

        async function getAuthToken() {
            try {
                const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/token', {
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
                localStorage.setItem('bearerToken', bearerToken);
                localStorage.setItem('tokenExpiry', tokenExpiry.toString());
                console.log('✅ Đã xác thực thành công');
                return bearerToken;
            } catch (error) {
                console.error('❌ Lỗi xác thực:', error);
                throw error;
            }
        }

        async function getValidToken() {
            const storedToken = localStorage.getItem('bearerToken');
            const storedExpiry = localStorage.getItem('tokenExpiry');

            if (storedToken && storedExpiry) {
                const expiry = parseInt(storedExpiry);
                if (expiry > Date.now() + 300000) {
                    bearerToken = storedToken;
                    tokenExpiry = expiry;
                    console.log('✅ Sử dụng token đã lưu');
                    return bearerToken;
                }
            }

            return await getAuthToken();
        }

        async function authenticatedFetch(url, options = {}) {
            const token = await getValidToken();

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'feature-version': '2',
                'tposappversion': '6.2.6.1',
                ...options.headers
            };

            const response = await fetch(url, {
                ...options,
                headers
            });

            const needsRetry = response.status === 401 ||
                (response.ok && (response.headers.get('content-type') || '').includes('text/html'));

            if (needsRetry) {
                const reason = response.status === 401 ? '401' : '200+HTML';
                console.log(`🔄 TPOS ${reason}, đang lấy token mới...`);
                localStorage.removeItem('bearerToken');
                localStorage.removeItem('tokenExpiry');
                bearerToken = null;
                tokenExpiry = null;
                const newToken = await getAuthToken();
                headers.Authorization = `Bearer ${newToken}`;

                return fetch(url, {
                    ...options,
                    headers
                });
            }

            return response;
        }

        function toggleSyncMode() {
            isSyncMode = !isSyncMode;
            updateHashUrl();
            updateSyncToggleButton();

            if (isSyncMode) {
                database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync page:', error);
                });

                // Sync current search data when enabling sync mode
                syncSearchKeywordToFirebase(searchKeyword);
            }

            console.log(isSyncMode ? '🔄 Đã bật chế độ đồng bộ' : '⏸️ Đã tắt chế độ đồng bộ');
        }

        function updateSyncToggleButton() {
            const btnToggle = document.getElementById('btnToggleSync');
            if (btnToggle) {
                if (isSyncMode) {
                    btnToggle.classList.add('active');
                    btnToggle.textContent = '🔄 Đang đồng bộ';
                } else {
                    btnToggle.classList.remove('active');
                    btnToggle.textContent = '⏸️ Đồng bộ';
                }
            }
        }

        function toggleMergeVariants() {
            isMergeVariants = !isMergeVariants;
            // Save to localStorage for backward compatibility
            localStorage.setItem('soluongIsMergeVariants', JSON.stringify(isMergeVariants));

            // Sync to Firebase to sync between machines
            if (!isSyncingFromFirebase) {
                database.ref('soluongIsMergeVariants').set(isMergeVariants).catch(error => {
                    console.error('❌ Lỗi sync merge variants:', error);
                });
            }

            updateMergeVariantsUI();
            updateProductGrid();
            console.log(isMergeVariants ? '📦 Đã bật chế độ gộp biến thể' : '📋 Đã tắt chế độ gộp biến thể');
        }

        function updateMergeVariantsUI() {
            const btnToggle = document.getElementById('btnMergeVariants');

            if (isMergeVariants) {
                if (btnToggle) {
                    btnToggle.classList.add('active');
                    btnToggle.textContent = '📦 Đang gộp';
                }
            } else {
                if (btnToggle) {
                    btnToggle.classList.remove('active');
                    btnToggle.textContent = '📋 Gộp biến thể';
                }
            }
        }

        function toggleHideEditControls() {
            soluongIsHideEditControls = !soluongIsHideEditControls;
            // Save to localStorage only (no sync between machines)
            localStorage.setItem('soluongIsHideEditControls', JSON.stringify(soluongIsHideEditControls));

            updateHideEditControlsUI();
            console.log(soluongIsHideEditControls ? '👁️ Đã ẩn các nút chỉnh sửa' : '👁️ Đã hiện các nút chỉnh sửa');
        }

        function updateHideEditControlsUI() {
            const btnToggle = document.getElementById('btnToggleEdit');

            if (soluongIsHideEditControls) {
                document.body.classList.add('hide-edit-controls');
                if (btnToggle) {
                    btnToggle.classList.add('active');
                    btnToggle.textContent = '👁️ Đang ẩn';
                }
            } else {
                document.body.classList.remove('hide-edit-controls');
                if (btnToggle) {
                    btnToggle.classList.remove('active');
                    btnToggle.textContent = '👁️ Ẩn chỉnh sửa';
                }
            }
        }

        async function loadMergeVariantsMode() {
            // Try to load from Firebase first, fallback to localStorage
            try {
                const snapshot = await database.ref('soluongIsMergeVariants').once('value');
                const firebaseValue = snapshot.val();

                if (firebaseValue !== null && firebaseValue !== undefined) {
                    isMergeVariants = firebaseValue;
                    console.log('🔥 Loaded merge variants mode from Firebase:', isMergeVariants);
                } else {
                    // Fallback to localStorage
                    const saved = localStorage.getItem('soluongIsMergeVariants');
                    if (saved !== null) {
                        isMergeVariants = JSON.parse(saved);
                        console.log('💾 Loaded merge variants mode from localStorage:', isMergeVariants);
                    }
                }
            } catch (error) {
                console.error('❌ Error loading merge variants mode from Firebase:', error);
                // Fallback to localStorage
                const saved = localStorage.getItem('soluongIsMergeVariants');
                if (saved !== null) {
                    isMergeVariants = JSON.parse(saved);
                }
            }

            updateMergeVariantsUI();
        }

        function loadHideEditControlsMode() {
            // Load from localStorage only (no sync between machines)
            const saved = localStorage.getItem('soluongIsHideEditControls');
            if (saved !== null) {
                soluongIsHideEditControls = JSON.parse(saved);
                console.log('💾 Loaded hide edit controls mode from localStorage:', soluongIsHideEditControls);
            }

            updateHideEditControlsUI();
        }

        function parseHashParams() {
            const hash = window.location.hash.substring(1);
            const params = {};

            if (!hash) return params;

            if (hash.includes('sync') || hash.includes('admin')) {
                params.sync = true;
            }

            const pageMatch = hash.match(/page=(\d+)/);
            if (pageMatch) {
                params.page = parseInt(pageMatch[1]);
            }

            return params;
        }

        function updateHashUrl() {
            const parts = [];

            if (isSyncMode) {
                parts.push('sync');
            }

            if (currentPage > 1) {
                parts.push(`page=${currentPage}`);
            }

            const newHash = parts.length > 0 ? '#' + parts.join('&') : '';

            if (window.location.hash !== newHash) {
                window.history.replaceState(null, null, newHash || window.location.pathname);
            }
        }

        async function loadSettings() {
            // Try localStorage first for instant load
            try {
                const cachedSettings = localStorage.getItem('soluongDisplaySettings');
                if (cachedSettings) {
                    const settings = JSON.parse(cachedSettings);
                    displaySettings = settings;
                    itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
                    console.log('⚡ Settings loaded from localStorage cache');
                    applySettings();
                }
            } catch (e) {
                console.log('📋 No cached settings, loading from Firebase');
            }

            // Then sync from Firebase (source of truth)
            try {
                const snapshot = await database.ref('soluongDisplaySettings').once('value');
                const settings = snapshot.val();
                if (settings) {
                    displaySettings = settings;
                    itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
                    // Cache to localStorage
                    localStorage.setItem('soluongDisplaySettings', JSON.stringify(settings));
                    console.log('🔥 Settings synced from Firebase');
                }
            } catch (error) {
                console.error('❌ Error loading settings from Firebase:', error);
            }
            applySettings();
        }

        function applySettings() {
            const productGrid = document.getElementById('productGrid');
            productGrid.style.gridTemplateColumns = `repeat(${displaySettings.columns}, 1fr)`;
            productGrid.style.gridTemplateRows = `repeat(${displaySettings.rows}, 1fr)`;
            productGrid.style.gap = `${displaySettings.gap}px`;

            // Apply Frame Layout CSS Variables
            document.documentElement.style.setProperty('--name-line-clamp', displaySettings.nameLineClamp || 1);

            // Apply Image CSS Variables
            document.documentElement.style.setProperty('--image-border-radius', `${displaySettings.imageBorderRadius || 8}px`);
            document.documentElement.style.setProperty('--image-border-width', `${displaySettings.imageBorderWidth || 2}px`);
            document.documentElement.style.setProperty('--image-margin-bottom', `${displaySettings.imageMarginBottom || 4}px`);

            // Apply Name CSS Variables
            document.documentElement.style.setProperty('--name-font-size', `${displaySettings.nameFontSize || 13}px`);
            document.documentElement.style.setProperty('--name-font-weight', displaySettings.nameFontWeight || 700);
            document.documentElement.style.setProperty('--name-margin', `${displaySettings.nameMargin || 3}px`);
            document.documentElement.style.setProperty('--name-line-height', displaySettings.nameLineHeight || 1.2);

            // Apply Stats CSS Variables
            document.documentElement.style.setProperty('--stats-value-size', `${displaySettings.statsValueSize || 16}px`);
            document.documentElement.style.setProperty('--stats-label-size', `${displaySettings.statsLabelSize || 9}px`);
            document.documentElement.style.setProperty('--stats-padding', `${displaySettings.statsPadding || 3}px`);
            document.documentElement.style.setProperty('--stats-gap', `${displaySettings.statsGap || 4}px`);
            document.documentElement.style.setProperty('--stats-border-radius', `${displaySettings.statsBorderRadius || 6}px`);
            document.documentElement.style.setProperty('--stats-margin-top', `${displaySettings.statsMarginTop || 4}px`);
        }

        async function loadProducts() {
            try {
                soluongProducts = await loadAllProductsFromFirebase(database);
                console.log('🔥 Loaded from Firebase:', Object.keys(soluongProducts).length, 'products');

                if (Object.keys(soluongProducts).length === 0) {
                    showEmptyState();
                } else {
                    updateProductGrid();
                }
            } catch (error) {
                console.error('❌ Error loading from Firebase:', error);
                soluongProducts = {};
                console.log('⚠️ Using empty product list');
            }
        }

        function showEmptyState() {
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="empty-state">
                    <h2>📦 Chưa có sản phẩm nào</h2>
                    <p>Vui lòng quay lại trang tìm kiếm để thêm sản phẩm</p>
                    <a href="index.html" class="btn-back" style="font-size: 1.1em; padding: 12px 24px;">
                        ← Quay lại trang tìm kiếm
                    </a>
                </div>
            `;

            document.getElementById('btnPrev').style.display = 'none';
            document.getElementById('btnNext').style.display = 'none';
            document.getElementById('pageInfo').style.display = 'none';
        }

        function mergeProductsByTemplate(products) {
            // Group products by ProductTmplId
            const groupedProducts = {};

            products.forEach(product => {
                const tmplId = product.ProductTmplId;

                // If product doesn't have ProductTmplId, treat it as individual product
                if (!tmplId) {
                    // Use a unique key for products without template
                    const uniqueKey = `no-template-${product.Id}`;
                    groupedProducts[uniqueKey] = [product];
                    return;
                }

                if (!groupedProducts[tmplId]) {
                    groupedProducts[tmplId] = [];
                }
                groupedProducts[tmplId].push(product);
            });

            // Merge each group into a single product
            const mergedProducts = [];

            Object.entries(groupedProducts).forEach(([tmplId, variants]) => {
                if (variants.length === 1) {
                    // Only one variant, keep as is
                    mergedProducts.push(variants[0]);
                } else {
                    // Multiple variants, merge them
                    const firstVariant = variants[0];

                    // Extract common name (remove variant-specific parts in parentheses)
                    let commonName = firstVariant.NameGet;
                    // Remove content within parentheses () to get base name
                    commonName = commonName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

                    // Sum up quantities
                    const totalQtyAvailable = variants.reduce((sum, v) => sum + (v.QtyAvailable || 0), 0);
                    const totalSoldQty = variants.reduce((sum, v) => sum + (v.soldQty || 0), 0);

                    // Create list of sold quantities for each variant
                    const soldQtyList = variants.map(v => ({
                        id: v.Id,
                        name: v.NameGet,
                        qty: v.soldQty || 0,
                        maxQty: v.QtyAvailable || 0
                    }));

                    // Create list of remaining quantities for each variant
                    const remainingQtyList = variants.map(v => ({
                        id: v.Id,
                        name: v.NameGet,
                        qty: v.remainingQty || 0
                    }));

                    // Get the most recent addedAt timestamp from all variants
                    const mostRecentAddedAt = Math.max(...variants.map(v => v.addedAt || 0));

                    // Create merged product
                    const mergedProduct = {
                        ...firstVariant,
                        NameGet: commonName,
                        QtyAvailable: totalQtyAvailable,
                        soldQty: totalSoldQty,
                        remainingQty: 0, // Not used for merged products
                        soldQtyList: soldQtyList, // List of sold qty for each variant
                        remainingQtyList: remainingQtyList, // List of remaining qty for each variant
                        addedAt: mostRecentAddedAt, // Use most recent timestamp for sorting
                        isMerged: true,
                        variantCount: variants.length,
                        variants: variants // Keep reference to original variants for future use
                    };

                    mergedProducts.push(mergedProduct);
                }
            });

            // Sort merged products by addedAt (newest first) to maintain sort order
            mergedProducts.sort((a, b) => {
                const timeA = a.addedAt || 0;
                const timeB = b.addedAt || 0;
                return timeB - timeA; // Descending order (newest first)
            });

            return mergedProducts;
        }

        function updateProductGrid() {
            const productGrid = document.getElementById('productGrid');
            const pageInfo = document.getElementById('pageInfo');
            const btnPrev = document.getElementById('btnPrev');
            const btnNext = document.getElementById('btnNext');

            btnPrev.style.display = 'block';
            btnNext.style.display = 'block';
            pageInfo.style.display = 'block';

            // Filter out hidden products first
            const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);

            // Use filtered products if searching, otherwise use all visible products
            // Note: filteredProducts are already merged if merge mode is enabled
            let baseProducts = searchKeyword ? filteredProducts.filter(p => !p.isHidden) : visibleProducts;

            // Use merged products if merge mode is enabled (only when not searching)
            const displayProducts = (isMergeVariants && !searchKeyword) ? mergeProductsByTemplate(baseProducts) : baseProducts;

            const totalPages = Math.ceil(displayProducts.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentProducts = displayProducts.slice(startIndex, endIndex);

            productGrid.innerHTML = currentProducts.map(product => {
                // Add cache-busting version to image URL (only for HTTP URLs, not base64)
                // Use lastRefreshed (if exists) or addedAt (fallback) or Id (final fallback)
                const cacheVersion = product.lastRefreshed || product.addedAt || product.Id;
                let imageUrlWithVersion = product.imageUrl;

                // Only add cache-busting parameter for HTTP URLs, not base64 data URIs
                if (imageUrlWithVersion && !imageUrlWithVersion.startsWith('data:')) {
                    imageUrlWithVersion = `${imageUrlWithVersion}${imageUrlWithVersion.includes('?') ? '&' : '?'}v=${cacheVersion}`;
                }

                const imageHtml = imageUrlWithVersion
                    ? `<img src="${imageUrlWithVersion}" class="grid-item-image" alt="${product.NameGet}">`
                    : `<div class="grid-item-image no-image"><span class="icon-emoji">📦</span></div>`;

                // Disable edit buttons for merged products
                const isMerged = product.isMerged || false;
                const disableEdit = isMerged ? 'disabled title="Tắt chế độ gộp để chỉnh sửa"' : '';

                // For hide button, create proper onclick handler
                let hideButtonOnclick;
                let hideButtonTitle;

                if (isMerged && product.variants && product.variants.length > 0) {
                    const variantIds = product.variants.map(v => v.Id).join(',');
                    hideButtonOnclick = `hideProducts([${variantIds}])`;
                    hideButtonTitle = 'Ẩn tất cả biến thể';
                } else {
                    hideButtonOnclick = `hideProduct(${product.Id})`;
                    hideButtonTitle = 'Ẩn sản phẩm';
                }

                // Format product name with price
                const productPrice = product.ListPrice || 0;
                const productNameDisplay = productPrice > 0
                    ? `${product.NameGet} ${productPrice / 1000}K`
                    : product.NameGet;

                return `
                    <div class="grid-item" data-product-id="${product.Id}">
                        ${imageHtml}
                        <div class="grid-item-name">
                            <span class="grid-item-name-text">${productNameDisplay}</span>
                            ${!soluongIsHideEditControls ? `<button class="btn-hide" onclick="${hideButtonOnclick}" title="${hideButtonTitle}">Ẩn</button>` : ''}
                        </div>
                        <div class="grid-item-stats">
                            <div class="grid-stat grid-stat-total">
                                <div class="grid-stat-label">📦 TỔNG</div>
                                ${isMerged && product.remainingQtyList ? `
                                    <div class="remaining-qty-list">
                                        ${product.remainingQtyList.map(item => {
                                            const totalQty = (product.soldQtyList.find(s => s.id === item.id)?.maxQty) || 0;
                                            return `
                                                <div class="remaining-qty-item">
                                                    <div class="remaining-qty-item-value">${totalQty}</div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="grid-stat-value">${product.QtyAvailable || 0}</div>
                                `}
                            </div>
                            <div class="grid-stat grid-stat-sold">
                                <div class="grid-stat-label">🛒 BÁN</div>
                                ${isMerged && product.soldQtyList ? `
                                    <div class="remaining-qty-list">
                                        ${product.soldQtyList.map(item => {
                                            return `
                                                <div class="remaining-qty-item" style="justify-content: center;">
                                                    <button class="variant-qty-btn" onclick="updateVariantQty(${item.id}, -1)" ${item.qty <= 0 ? 'disabled' : ''}>−</button>
                                                    <div class="remaining-qty-item-value">${item.qty}</div>
                                                    <button class="variant-qty-btn" onclick="updateVariantQty(${item.id}, 1)" ${item.qty >= item.maxQty ? 'disabled' : ''}>+</button>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="qty-controls">
                                        <button class="qty-btn" onclick="updateProductQty(${product.Id}, -1)" ${product.soldQty <= 0 || isMerged ? 'disabled' : ''} ${disableEdit}>−</button>
                                        <div class="grid-stat-value">${product.soldQty || 0}</div>
                                        <button class="qty-btn" onclick="updateProductQty(${product.Id}, 1)" ${product.soldQty >= product.QtyAvailable || isMerged ? 'disabled' : ''} ${disableEdit}>+</button>
                                    </div>
                                `}
                            </div>
                            <div class="grid-stat grid-stat-remaining">
                                <div class="grid-stat-label">✅ CÒN</div>
                                ${isMerged && product.remainingQtyList ? `
                                    <div class="remaining-qty-list">
                                        ${product.remainingQtyList.map(item => {
                                            // Extract only the part in parentheses () at the end
                                            const lastParenMatch = item.name.match(/\(([^)]+)\)[^(]*$/);
                                            const variantName = lastParenMatch ? '(' + lastParenMatch[1] + ')' : item.name;
                                            return `
                                                <div class="remaining-qty-item">
                                                    <div class="remaining-qty-item-name">${variantName}</div>
                                                    <div class="remaining-qty-item-value">${item.qty}</div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="grid-stat-value">${product.remainingQty || 0}</div>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const searchInfo = searchKeyword ? ` - 🔍 "${searchKeyword}"` : '';
            pageInfo.textContent = `Trang ${currentPage}/${totalPages || 1} (${displayProducts.length} sản phẩm${isMergeVariants ? ' đã gộp' : ''})${searchInfo}`;
            btnPrev.disabled = currentPage === 1;
            btnNext.disabled = currentPage >= totalPages;
        }

        function changePage(direction) {
            // Use filtered products if searching, otherwise use all products
            // Note: filteredProducts are already merged if merge mode is enabled
            let baseProducts = searchKeyword ? filteredProducts : Object.values(soluongProducts);

            // Use merged products if merge mode is enabled (only when not searching)
            const displayProducts = (isMergeVariants && !searchKeyword) ? mergeProductsByTemplate(baseProducts) : baseProducts;
            const totalPages = Math.ceil(displayProducts.length / itemsPerPage);

            if (direction === 'prev' && currentPage > 1) {
                currentPage--;
            } else if (direction === 'next' && currentPage < totalPages) {
                currentPage++;
            }

            updateProductGrid();
            updateHashUrl();

            if (isSyncMode && !isSyncingFromFirebase) {
                database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync page lên Firebase:', error);
                });
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
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

        // Optimization: Build cache of normalized product names
        function buildNormalizedCache(products) {
            normalizedProductNames.clear();
            products.forEach(product => {
                if (product && product.Id && product.NameGet) {
                    normalizedProductNames.set(product.Id, removeVietnameseTones(product.NameGet));
                }
            });
        }

        // Optimization: Get normalized name from cache (or compute if not cached)
        function getNormalizedName(product) {
            if (!product || !product.Id) return '';

            // Check cache first
            if (normalizedProductNames.has(product.Id)) {
                return normalizedProductNames.get(product.Id);
            }

            // Compute and cache
            const normalized = removeVietnameseTones(product.NameGet || '');
            normalizedProductNames.set(product.Id, normalized);
            return normalized;
        }

        function performSearch(keyword, syncToFirebase = true) {
            searchKeyword = keyword.trim();

            if (!searchKeyword) {
                // Clear search - restore to page before search
                filteredProducts = [];
                currentPage = pageBeforeSearch;
                updateProductGrid();

                // Sync empty search to Firebase if in sync mode (with debounce)
                if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
                    syncSearchKeywordToFirebase('');
                }
                return;
            }

            // Save current page before searching (only on first search)
            if (!filteredProducts.length) {
                pageBeforeSearch = currentPage;
            }

            const searchLower = searchKeyword.toLowerCase();
            const searchNoSign = removeVietnameseTones(searchKeyword);

            // Filter out hidden products first
            const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);

            // Apply merge first if enabled, then search on merged products
            const productsToSearch = isMergeVariants ? mergeProductsByTemplate(visibleProducts) : visibleProducts;

            // Optimization: Build cache if needed (only once per search)
            if (normalizedProductNames.size === 0) {
                buildNormalizedCache(productsToSearch);
            }

            // Filter products that match
            const matchedProducts = productsToSearch.filter(product => {
                // Optimization: Use cached normalized name
                const nameNoSign = getNormalizedName(product);
                const matchName = nameNoSign.includes(searchNoSign);

                // Match in original name (lowercase, for special chars like [Q5X1])
                const matchNameOriginal = product.NameGet && product.NameGet.toLowerCase().includes(searchLower);

                return matchName || matchNameOriginal;
            });

            // Sort by priority: match in [] first, then by name alphabetically
            matchedProducts.sort((a, b) => {
                // Extract text within [] brackets
                const extractBracket = (name) => {
                    const match = name?.match(/\[([^\]]+)\]/);
                    return match ? match[1].toLowerCase().trim() : '';
                };

                const aBracket = extractBracket(a.NameGet);
                const bBracket = extractBracket(b.NameGet);

                // Check if search term matches in brackets
                const aMatchInBracket = aBracket && aBracket.includes(searchLower);
                const bMatchInBracket = bBracket && bBracket.includes(searchLower);

                // Priority 1: Match in brackets
                if (aMatchInBracket && !bMatchInBracket) return -1;
                if (!aMatchInBracket && bMatchInBracket) return 1;

                // Priority 2: When both match in brackets,
                // prioritize exact match in bracket code (e.g., [Q5] before [Q5X1])
                if (aMatchInBracket && bMatchInBracket) {
                    const aExactMatch = aBracket === searchLower;
                    const bExactMatch = bBracket === searchLower;
                    if (aExactMatch && !bExactMatch) return -1;
                    if (!aExactMatch && bExactMatch) return 1;

                    // If both exact or both not exact, sort by bracket content length (shorter first)
                    if (aBracket.length !== bBracket.length) {
                        return aBracket.length - bBracket.length;
                    }

                    // If same length, sort alphabetically
                    return aBracket.localeCompare(bBracket);
                }

                // Priority 3: Sort alphabetically by product name
                return a.NameGet.localeCompare(b.NameGet);
            });

            filteredProducts = matchedProducts;

            // Adjust current page if it exceeds total pages of search results
            const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
            if (currentPage > totalPages && totalPages > 0) {
                currentPage = totalPages;
            }

            updateProductGrid();

            // Sync search keyword to Firebase if in sync mode (with debounce)
            if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
                syncSearchKeywordToFirebase(searchKeyword);
            }
        }

        // Optimization: Debounced Firebase sync for search keyword
        function syncSearchKeywordToFirebase(keyword) {
            // Clear existing timer
            if (firebaseSyncDebounceTimer) {
                clearTimeout(firebaseSyncDebounceTimer);
            }

            // Set new timer to sync after delay
            firebaseSyncDebounceTimer = setTimeout(() => {
                // Add timestamp to detect which search is most recent (avoid race conditions)
                const syncData = {
                    keyword: keyword || '',
                    timestamp: Date.now()
                };

                database.ref('soluongSyncSearchData').set(syncData).catch(error => {
                    console.error('❌ Lỗi sync search keyword:', error);
                });

                console.log('🔄 Synced search to Firebase:', keyword);
            }, FIREBASE_SYNC_DEBOUNCE_MS);
        }

        function clearSearch() {
            searchKeyword = '';
            filteredProducts = [];
            document.getElementById('searchInput').value = '';
            document.getElementById('searchClear').classList.remove('show');

            // Restore to page before search
            currentPage = pageBeforeSearch;

            updateProductGrid();

            // Sync empty search to Firebase if in sync mode (with debounce)
            if (isSyncMode && !isSyncingFromFirebase) {
                syncSearchKeywordToFirebase('');
            }
        }

        function updateProductQty(productId, change) {
            const productKey = `product_${productId}`;
            const product = soluongProducts[productKey];
            if (!product) return;

            // Check if update is valid before calling helper
            const currentSoldQty = product.soldQty || 0;
            const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, currentSoldQty + change));
            if (newSoldQty === currentSoldQty) return;

            // Let helper function update both local and Firebase
            // DO NOT update local here - helper will do it
            if (!isSyncingFromFirebase) {
                updateProductQtyInFirebase(database, productId, change, soluongProducts, {
                    source: 'livestream',
                    staffName: staffName,
                    staffUsername: staffUsername
                }).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            // Recalculate remainingQty after helper updates soldQty
            product.remainingQty = product.QtyAvailable - (product.soldQty || 0);

            // Update UI after helper updates local (helper updates synchronously)
            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
        }

        function updateVariantQty(variantId, change) {
            const variantKey = `product_${variantId}`;
            const variant = soluongProducts[variantKey];
            if (!variant) return;

            // Check if update is valid before calling helper
            const currentSoldQty = variant.soldQty || 0;
            const newSoldQty = Math.max(0, Math.min(variant.QtyAvailable, currentSoldQty + change));
            if (newSoldQty === currentSoldQty) return;

            // Let helper function update both local and Firebase
            // DO NOT update local here - helper will do it
            if (!isSyncingFromFirebase) {
                updateProductQtyInFirebase(database, variantId, change, soluongProducts, {
                    source: 'livestream',
                    staffName: staffName,
                    staffUsername: staffUsername
                }).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            // Recalculate remainingQty after helper updates soldQty
            variant.remainingQty = variant.QtyAvailable - (variant.soldQty || 0);

            // Update UI after helper updates local (helper updates synchronously)
            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
        }

        function hideProduct(productId) {
            if (!confirm('Bạn có chắc muốn ẩn sản phẩm này?')) return;

            const productKey = `product_${productId}`;
            const product = soluongProducts[productKey];
            if (!product) return;

            product.isHidden = true;

            if (!isSyncingFromFirebase) {
                updateProductVisibility(database, productId, true, soluongProducts).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
            console.log(`👁️ Đã ẩn sản phẩm: ${product.NameGet}`);
        }

        function hideProducts(productIds) {
            const count = productIds.length;
            if (!confirm(`Bạn có chắc muốn ẩn tất cả ${count} biến thể?`)) return;

            let hiddenCount = 0;
            productIds.forEach(productId => {
                const productKey = `product_${productId}`;
                const product = soluongProducts[productKey];
                if (product) {
                    product.isHidden = true;
                    hiddenCount++;
                }
            });

            if (hiddenCount > 0 && !isSyncingFromFirebase) {
                // Batch update for all products
                const updates = {};
                productIds.forEach(productId => {
                    const productKey = `product_${productId}`;
                    if (soluongProducts[productKey]) {
                        updates[`soluongProducts/${productKey}/isHidden`] = true;
                    }
                });
                database.ref().update(updates).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
            console.log(`👁️ Đã ẩn ${hiddenCount} biến thể`);
        }

        function unhideProduct(productId) {
            const productKey = `product_${productId}`;
            const product = soluongProducts[productKey];
            if (!product) return;

            product.isHidden = false;

            if (!isSyncingFromFirebase) {
                updateProductVisibility(database, productId, false, soluongProducts).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
            console.log(`👁️ Đã hiện sản phẩm: ${product.NameGet}`);
        }

        function updateProductTotal(productId, change) {
            const productKey = `product_${productId}`;
            const product = soluongProducts[productKey];
            if (!product) return;

            const newQtyAvailable = Math.max(0, product.QtyAvailable + change);
            if (newQtyAvailable === product.QtyAvailable) return;

            product.QtyAvailable = newQtyAvailable;

            // Ensure soldQty doesn't exceed new total
            if (product.soldQty > product.QtyAvailable) {
                product.soldQty = product.QtyAvailable;
            }

            product.remainingQty = product.QtyAvailable - product.soldQty;

            if (!isSyncingFromFirebase) {
                database.ref(`soluongProducts/${productKey}`).update({
                    QtyAvailable: product.QtyAvailable,
                    soldQty: product.soldQty,
                    remainingQty: product.remainingQty
                }).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
        }

        async function cleanupOldProductsLocal() {
            if (!isSyncingFromFirebase) {
                const result = await cleanupOldProducts(database, soluongProducts);
                if (result.removed > 0) {
                    console.log(`🗑️ Đã xóa ${result.removed} sản phẩm cũ hơn 7 ngày`);

                    if (Object.keys(soluongProducts).length === 0) {
                        showEmptyState();
                    } else {
                        updateProductGrid();
                    }
                }
            }
        }

        async function clearAllProductsLocal() {
            const productCount = Object.keys(soluongProducts).length;
            if (productCount === 0) {
                alert('⚠️ Danh sách đã trống');
                return;
            }

            if (confirm(`Bạn có chắc muốn xóa tất cả ${productCount} sản phẩm không?`)) {
                if (!isSyncingFromFirebase) {
                    await clearAllProducts(database, soluongProducts);
                }
                showEmptyState();
            }
        }

        async function refreshProduct(productId) {
            const btnRefresh = event.target;
            const statTotal = btnRefresh.closest('.grid-stat-total');

            btnRefresh.classList.add('loading');
            btnRefresh.disabled = true;

            try {
                const response = await authenticatedFetch(
                    `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
                );

                if (!response.ok) {
                    throw new Error('Không thể tải thông tin sản phẩm từ TPOS');
                }

                const productData = await response.json();
                const productKey = `product_${productId}`;
                const product = soluongProducts[productKey];
                if (!product) {
                    throw new Error('Không tìm thấy sản phẩm trong danh sách');
                }

                const oldQtyAvailable = product.QtyAvailable;
                product.QtyAvailable = productData.QtyAvailable || 0;
                product.remainingQty = product.QtyAvailable - (product.soldQty || 0);

                // Update price information from API
                product.ListPrice = productData.ListPrice || 0;
                product.PriceVariant = productData.PriceVariant || 0;

                // Update image URL from API
                let newImageUrl = productData.ImageUrl;

                // If no image, try to get from template
                if (!newImageUrl && productData.ProductTmplId) {
                    try {
                        const templateResponse = await authenticatedFetch(
                            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/ProductTemplate(${productData.ProductTmplId})?$select=ImageUrl`
                        );
                        if (templateResponse.ok) {
                            const templateData = await templateResponse.json();
                            newImageUrl = templateData.ImageUrl;
                        }
                    } catch (err) {
                        console.warn('Could not load template image:', err);
                    }
                }

                // Update image if we got a new one
                if (newImageUrl) {
                    product.imageUrl = newImageUrl;
                }

                // Add timestamp to track last refresh (for cache-busting)
                product.lastRefreshed = Date.now();

                if (!isSyncingFromFirebase) {
                    database.ref(`soluongProducts/${productKey}`).update({
                        QtyAvailable: product.QtyAvailable,
                        remainingQty: product.remainingQty,
                        ListPrice: product.ListPrice,
                        PriceVariant: product.PriceVariant,
                        imageUrl: product.imageUrl,
                        lastRefreshed: product.lastRefreshed
                    }).catch(error => {
                        console.error('❌ Lỗi sync products:', error);
                    });
                }

                // Fix: If searching, re-run search to update filteredProducts
                if (searchKeyword) {
                    performSearch(searchKeyword, false); // Don't sync to Firebase, just update UI
                } else {
                    updateProductGrid();
                }

                console.log(`✅ Đã cập nhật sản phẩm ${product.NameGet}:`, {
                    oldTotal: oldQtyAvailable,
                    newTotal: product.QtyAvailable,
                    sold: product.soldQty,
                    remaining: product.remainingQty,
                    imageUpdated: !!newImageUrl
                });

                statTotal.style.background = 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)';
                setTimeout(() => {
                    statTotal.style.background = '';
                }, 500);

            } catch (error) {
                console.error('❌ Lỗi refresh product:', error);
                alert('Lỗi khi cập nhật sản phẩm: ' + error.message);

                statTotal.style.background = 'linear-gradient(135deg, #ffcdd2 0%, #ef9a9a 100%)';
                setTimeout(() => {
                    statTotal.style.background = '';
                }, 500);
            } finally {
                btnRefresh.classList.remove('loading');
                btnRefresh.disabled = false;
            }
        }

        document.getElementById('btnPrev').addEventListener('click', () => changePage('prev'));
        document.getElementById('btnNext').addEventListener('click', () => changePage('next'));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                changePage('prev');
            } else if (e.key === 'ArrowRight') {
                changePage('next');
            } else if (e.key === 'Escape') {
                window.location.href = 'index.html';
            }
        });

        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;

        const productGrid = document.getElementById('productGrid');

        productGrid.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        productGrid.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            const swipeThreshold = 50;
            const horizontalSwipe = Math.abs(touchEndX - touchStartX);
            const verticalSwipe = Math.abs(touchEndY - touchStartY);

            if (horizontalSwipe > verticalSwipe && horizontalSwipe > swipeThreshold) {
                if (touchEndX < touchStartX) {
                    changePage('next');
                } else if (touchEndX > touchStartX) {
                    changePage('prev');
                }
            }
        }

        const hoverAreas = document.querySelectorAll('.nav-hover-area');
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');

        hoverAreas.forEach(area => {
            area.addEventListener('mouseenter', () => {
                if (area.classList.contains('left') && !btnPrev.disabled) {
                    btnPrev.classList.add('active');
                } else if (area.classList.contains('right') && !btnNext.disabled) {
                    btnNext.classList.add('active');
                }
            });

            area.addEventListener('mouseleave', () => {
                btnPrev.classList.remove('active');
                btnNext.classList.remove('active');
            });
        });

        [btnPrev, btnNext].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) {
                    btn.classList.add('active');
                }
            });

            btn.addEventListener('mouseleave', () => {
                btn.classList.remove('active');
            });
        });

        /**
         * Setup sync listeners (Optimization - Step 2)
         * Only called when isSyncMode = true
         */
        function setupSyncListeners() {
            if (syncListenersAttached) {
                console.log('🔄 [setupSyncListeners] Sync listeners already attached, skipping');
                return;
            }

            console.log('🔄 [setupSyncListeners] Setting up sync listeners...');

            // Listen for page sync
            syncPageListenerRef = database.ref('soluongSyncCurrentPage').on('value', (snapshot) => {
                const page = snapshot.val();

                if (isSyncMode && page && !isSyncingFromFirebase && page !== currentPage) {
                    isSyncingFromFirebase = true;

                    const totalPages = Math.ceil(Object.keys(soluongProducts).length / itemsPerPage);

                    if (page >= 1 && page <= totalPages) {
                        currentPage = page;
                        updateProductGrid();
                        updateHashUrl();
                        console.log('🔥 Sync page synced from Firebase: page', page);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }

                    setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                }
            });

            // Listen for search data sync
            syncSearchListenerRef = database.ref('soluongSyncSearchData').on('value', (snapshot) => {
                const searchData = snapshot.val();

                // Only sync if in sync mode and not already syncing
                if (isSyncMode && !isSyncingFromFirebase && searchData) {
                    const keyword = searchData.keyword || '';
                    const timestamp = searchData.timestamp || 0;

                    // Optimization: Only apply if this is a newer search (prevent race conditions)
                    if (timestamp > lastSyncedSearchTimestamp) {
                        const currentKeyword = document.getElementById('searchInput')?.value || '';

                        // Only update if keyword is different
                        if (keyword !== currentKeyword) {
                            isSyncingFromFirebase = true;
                            lastSyncedSearchTimestamp = timestamp;

                            const searchInput = document.getElementById('searchInput');
                            const searchClear = document.getElementById('searchClear');
                            const searchContainer = document.getElementById('searchContainer');

                            if (searchInput) {
                                searchInput.value = keyword;

                                // Show/hide clear button
                                if (keyword) {
                                    searchClear.classList.add('show');
                                    searchContainer.classList.add('active');
                                } else {
                                    searchClear.classList.remove('show');
                                    searchContainer.classList.remove('active');
                                }
                            }

                            // Perform search without syncing back to Firebase (prevent loop)
                            performSearch(keyword, false);

                            console.log('🔥 Search synced from Firebase:', keyword, '@', new Date(timestamp).toLocaleTimeString());

                            setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                        }
                    }
                }
            });

            syncListenersAttached = true;
            console.log('✅ [setupSyncListeners] Sync listeners attached');
        }

        /**
         * Cleanup sync listeners (Optimization - Step 2)
         * Called when isSyncMode = false or on page unload
         */
        function cleanupSyncListeners() {
            if (!syncListenersAttached) {
                return;
            }

            console.log('🔄 [cleanupSyncListeners] Cleaning up sync listeners...');

            database.ref('soluongSyncCurrentPage').off('value', syncPageListenerRef);
            database.ref('soluongSyncSearchData').off('value', syncSearchListenerRef);

            syncPageListenerRef = null;
            syncSearchListenerRef = null;
            syncListenersAttached = false;
            lastSyncedSearchTimestamp = 0; // Reset timestamp

            console.log('✅ [cleanupSyncListeners] Sync listeners detached');
        }

        function setupFirebaseListeners() {
            database.ref('soluongDisplaySettings').on('value', (snapshot) => {
                const settings = snapshot.val();
                if (settings && !isSyncingFromFirebase) {
                    isSyncingFromFirebase = true;
                    displaySettings = settings;
                    itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
                    // Cache to localStorage for faster next load
                    localStorage.setItem('soluongDisplaySettings', JSON.stringify(settings));
                    applySettings();
                    updateProductGrid();
                    console.log('🔥 Settings synced from Firebase');
                    setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                }
            });

            // Listen for merge variants mode changes
            database.ref('soluongIsMergeVariants').on('value', (snapshot) => {
                const mergeMode = snapshot.val();
                if (mergeMode !== null && mergeMode !== undefined && !isSyncingFromFirebase) {
                    isSyncingFromFirebase = true;
                    isMergeVariants = mergeMode;
                    localStorage.setItem('soluongIsMergeVariants', JSON.stringify(isMergeVariants));
                    updateMergeVariantsUI();
                    updateProductGrid();
                    console.log('🔥 Merge variants mode synced from Firebase:', isMergeVariants);
                    setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                }
            });

            // Products listener - USE CHILD LISTENERS
            firebaseDetachFn = setupFirebaseChildListeners(database, soluongProducts, {
                onProductAdded: (product) => {
                    if (!isSyncingFromFirebase) {
                        console.log('🔥 Product added from Firebase:', product.NameGet);
                        // Rebuild normalized cache
                        buildNormalizedCache(Object.values(soluongProducts));
                        if (searchKeyword) {
                            performSearch(searchKeyword, false);
                        } else {
                            updateProductGrid();
                        }
                    }
                },
                onProductChanged: (product) => {
                    if (!isSyncingFromFirebase) {
                        console.log('🔥 Product updated from Firebase:', product.NameGet);
                        // Rebuild normalized cache
                        buildNormalizedCache(Object.values(soluongProducts));
                        if (searchKeyword) {
                            performSearch(searchKeyword, false);
                        } else {
                            updateProductGrid();
                        }
                    }
                },
                onQtyChanged: (product, productKey) => {
                    // Recalculate remainingQty when soldQty changes
                    product.remainingQty = product.QtyAvailable - (product.soldQty || 0);
                    console.log('🔥 Qty updated from Firebase:', product.NameGet, '→ soldQty:', product.soldQty, 'remainingQty:', product.remainingQty);

                    // Update UI
                    if (searchKeyword) {
                        performSearch(searchKeyword, false);
                    } else {
                        updateProductGrid();
                    }
                },
                onProductRemoved: (product) => {
                    if (!isSyncingFromFirebase) {
                        console.log('🔥 Product removed from Firebase:', product.NameGet);
                        // Rebuild normalized cache
                        buildNormalizedCache(Object.values(soluongProducts));
                        if (searchKeyword) {
                            performSearch(searchKeyword, false);
                        } else {
                            updateProductGrid();
                        }
                    }
                },
                onInitialLoadComplete: () => {
                    console.log('✅ Firebase listeners setup complete');
                }
            });

            // Only setup sync listeners if isSyncMode is already true (from URL hash)
            if (isSyncMode) {
                setupSyncListeners();
            }
        }

        const settingsChannel = new BroadcastChannel('soluong-settings');

        settingsChannel.onmessage = (event) => {
            if (event.data.type === 'settingsChanged') {
                console.log('⚙️ Settings updated from same device!');
                loadSettings();
                updateProductGrid();
            }
        };

        window.addEventListener('storage', (e) => {
            if (e.key === 'soluongProducts') {
                loadProducts();
            } else if (e.key === 'soluongDisplaySettings') {
                loadSettings();
                loadProducts();
            }
        });

        window.addEventListener('hashchange', () => {
            const params = parseHashParams();
            const wasSyncMode = isSyncMode;

            if (params.sync !== undefined) {
                isSyncMode = params.sync;
            } else {
                isSyncMode = false;
            }

            updateSyncToggleButton();

            // Toggle sync listeners based on sync mode (Optimization - Step 2)
            if (isSyncMode && !wasSyncMode) {
                // Sync mode just turned ON - setup listeners
                setupSyncListeners();
                database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync page khi vào sync mode:', error);
                });
            } else if (!isSyncMode && wasSyncMode) {
                // Sync mode just turned OFF - cleanup listeners
                cleanupSyncListeners();
            }

            if (params.page) {
                const totalPages = Math.ceil(Object.keys(soluongProducts).length / itemsPerPage);
                if (params.page >= 1 && params.page <= totalPages) {
                    currentPage = params.page;
                    updateProductGrid();

                    if (isSyncMode && !isSyncingFromFirebase) {
                        database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                            console.error('❌ Lỗi sync page từ hash change:', error);
                        });
                    }
                }
            } else {
                if (currentPage !== 1) {
                    currentPage = 1;
                    updateProductGrid();

                    if (isSyncMode && !isSyncingFromFirebase) {
                        database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                            console.error('❌ Lỗi sync page reset:', error);
                        });
                    }
                }
            }
        });

        window.addEventListener('load', async () => {
            loadSettings();
            loadMergeVariantsMode(); // Load merge variants mode from localStorage
            loadHideEditControlsMode(); // Load hide edit controls mode from localStorage

            // Parse hash params and set sync mode BEFORE setting up listeners
            const params = parseHashParams();

            // Auto-enable sync mode by default
            isSyncMode = true;

            // Load products FIRST (before listeners)
            await loadProducts();

            // THEN setup Firebase listeners (after isSyncMode is set)
            setupFirebaseListeners();

            // Cleanup products older than 7 days
            await cleanupOldProductsLocal();

            if (params.page && params.page > 1) {
                currentPage = params.page;
                updateProductGrid();
            }

            updateHashUrl();
            updateSyncToggleButton();

            if (isSyncMode) {
                database.ref('soluongSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync initial page lên Firebase:', error);
                });

                // Load current search data from Firebase when in sync mode
                try {
                    const snapshot = await database.ref('soluongSyncSearchData').once('value');
                    const searchData = snapshot.val();

                    if (searchData && searchData.keyword) {
                        const keyword = searchData.keyword;
                        const searchInput = document.getElementById('searchInput');
                        const searchClear = document.getElementById('searchClear');
                        const searchContainer = document.getElementById('searchContainer');

                        if (searchInput) {
                            searchInput.value = keyword;
                            searchClear.classList.add('show');
                            searchContainer.classList.add('active');
                        }

                        // Perform initial search without syncing back
                        performSearch(keyword, false);
                        console.log('🔥 Loaded search from Firebase:', keyword);
                    }
                } catch (error) {
                    console.error('❌ Lỗi loading search từ Firebase:', error);
                }
            }

            // Setup search input event listener
            const searchInput = document.getElementById('searchInput');
            const searchClear = document.getElementById('searchClear');
            const searchContainer = document.getElementById('searchContainer');

            if (searchInput) {
                // Focus on click anywhere on search container
                searchContainer.addEventListener('click', () => {
                    searchInput.focus();
                });

                // Optimization: Debounced search input to reduce Firebase calls
                searchInput.addEventListener('input', (e) => {
                    const value = e.target.value;

                    // Show/hide clear button (immediate visual feedback)
                    if (value) {
                        searchClear.classList.add('show');
                        searchContainer.classList.add('active'); // Keep visible while typing
                    } else {
                        searchClear.classList.remove('show');
                        searchContainer.classList.remove('active');
                    }

                    // Clear existing debounce timer
                    if (searchInputDebounceTimer) {
                        clearTimeout(searchInputDebounceTimer);
                    }

                    // Perform search after user stops typing (debounced)
                    searchInputDebounceTimer = setTimeout(() => {
                        performSearch(value);
                    }, SEARCH_INPUT_DEBOUNCE_MS);
                });

                // Handle Enter key - perform search immediately (bypass debounce)
                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        // Clear debounce timer
                        if (searchInputDebounceTimer) {
                            clearTimeout(searchInputDebounceTimer);
                        }
                        // Perform search immediately
                        performSearch(e.target.value);
                    }
                });

                // Handle Escape key to clear search
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        clearSearch();
                    }
                });
            }
        });

        // Cleanup Firebase listeners when leaving page
        window.addEventListener('beforeunload', () => {
            console.log('🧹 Cleaning up Firebase listeners...');

            // Cleanup product listeners
            if (firebaseDetachFn) {
                firebaseDetachFn.detach();
            }

            // Cleanup settings listeners
            database.ref('soluongDisplaySettings').off('value');
            database.ref('soluongIsMergeVariants').off('value');

            // Cleanup sync listeners (using dedicated function)
            cleanupSyncListeners();
        });
