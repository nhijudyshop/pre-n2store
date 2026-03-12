        let orderProducts = {};
        let filteredProducts = [];
        let searchKeyword = '';
        let pageBeforeSearch = 1;
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
        let isMergeVariants = false;
        let orderIsHideEditControls = false;

        // Campaign ID from localStorage (set by admin page)
        let currentCampaignId = localStorage.getItem('om_current_campaign_id') || null;

        let normalizedProductNames = new Map();

        let searchInputDebounceTimer = null;
        let firebaseSyncDebounceTimer = null;
        const SEARCH_INPUT_DEBOUNCE_MS = 300;
        const FIREBASE_SYNC_DEBOUNCE_MS = 500;

        // Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
        // Firebase is auto-initialized by shared config
        const database = firebase.database();

        let isSyncingFromFirebase = false;
        let bearerToken = null;
        let tokenExpiry = null;

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
                database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync page:', error);
                });

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
            localStorage.setItem('orderIsMergeVariants', JSON.stringify(isMergeVariants));

            if (!isSyncingFromFirebase) {
                database.ref('orderIsMergeVariants').set(isMergeVariants).catch(error => {
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
            orderIsHideEditControls = !orderIsHideEditControls;
            localStorage.setItem('orderIsHideEditControls', JSON.stringify(orderIsHideEditControls));

            updateHideEditControlsUI();
            console.log(orderIsHideEditControls ? '👁️ Đã ẩn các nút chỉnh sửa' : '👁️ Đã hiện các nút chỉnh sửa');
        }

        function updateHideEditControlsUI() {
            const btnToggle = document.getElementById('btnToggleEdit');

            if (orderIsHideEditControls) {
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
            try {
                const snapshot = await database.ref('orderIsMergeVariants').once('value');
                const firebaseValue = snapshot.val();

                if (firebaseValue !== null && firebaseValue !== undefined) {
                    isMergeVariants = firebaseValue;
                    console.log('🔥 Loaded merge variants mode from Firebase:', isMergeVariants);
                } else {
                    const saved = localStorage.getItem('orderIsMergeVariants');
                    if (saved !== null) {
                        isMergeVariants = JSON.parse(saved);
                        console.log('💾 Loaded merge variants mode from localStorage:', isMergeVariants);
                    }
                }
            } catch (error) {
                console.error('❌ Error loading merge variants mode from Firebase:', error);
                const saved = localStorage.getItem('orderIsMergeVariants');
                if (saved !== null) {
                    isMergeVariants = JSON.parse(saved);
                }
            }

            updateMergeVariantsUI();
        }

        function loadHideEditControlsMode() {
            const saved = localStorage.getItem('orderIsHideEditControls');
            if (saved !== null) {
                orderIsHideEditControls = JSON.parse(saved);
                console.log('💾 Loaded hide edit controls mode from localStorage:', orderIsHideEditControls);
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
            // Load settings from hiddenProductsDisplaySettings
            try {
                const snapshot = await database.ref('hiddenProductsDisplaySettings').once('value');
                const settings = snapshot.val();
                if (settings) {
                    displaySettings = {
                        columns: settings.columns || 4,
                        rows: settings.rows || 2,
                        gap: settings.gap || 15,
                        itemHeight: 500,
                        nameMargin: 3,
                        itemsPerPage: settings.itemsPerPage || ((settings.columns || 4) * (settings.rows || 2))
                    };
                    itemsPerPage = displaySettings.itemsPerPage;
                    console.log('🔥 Loaded hidden products display settings from Firebase:', displaySettings);
                } else {
                    displaySettings = {
                        columns: 4,
                        rows: 2,
                        gap: 15,
                        itemHeight: 500,
                        nameMargin: 3,
                        itemsPerPage: 8
                    };
                    itemsPerPage = 8;
                    console.log('💾 Using default hidden products display settings');
                }
            } catch (error) {
                console.error('❌ Error loading hidden products settings from Firebase:', error);
                displaySettings = {
                    columns: 4,
                    rows: 2,
                    gap: 15,
                    itemHeight: 500,
                    nameMargin: 3,
                    itemsPerPage: 8
                };
                itemsPerPage = 8;
            }
            applySettings();
        }

        function applySettings() {
            // Apply grid layout settings from displaySettings
            document.documentElement.style.setProperty('--grid-columns', displaySettings.columns);
            document.documentElement.style.setProperty('--grid-rows', displaySettings.rows);
            document.documentElement.style.setProperty('--grid-gap', `${displaySettings.gap}px`);

            // Apply other CSS variables
            document.documentElement.style.setProperty('--name-line-clamp', displaySettings.nameLineClamp || 1);
            document.documentElement.style.setProperty('--image-border-radius', `${displaySettings.imageBorderRadius || 8}px`);
            document.documentElement.style.setProperty('--image-border-width', `${displaySettings.imageBorderWidth || 2}px`);
            document.documentElement.style.setProperty('--image-margin-bottom', `${displaySettings.imageMarginBottom || 4}px`);
            document.documentElement.style.setProperty('--name-font-size', `${displaySettings.nameFontSize || 13}px`);
            document.documentElement.style.setProperty('--name-font-weight', displaySettings.nameFontWeight || 700);
            document.documentElement.style.setProperty('--name-margin', `${displaySettings.nameMargin || 3}px`);
            document.documentElement.style.setProperty('--name-line-height', displaySettings.nameLineHeight || 1.2);
            document.documentElement.style.setProperty('--stats-value-size', `${displaySettings.statsValueSize || 16}px`);
            document.documentElement.style.setProperty('--stats-label-size', `${displaySettings.statsLabelSize || 9}px`);
            document.documentElement.style.setProperty('--stats-padding', `${displaySettings.statsPadding || 3}px`);
            document.documentElement.style.setProperty('--stats-gap', `${displaySettings.statsGap || 4}px`);
            document.documentElement.style.setProperty('--stats-border-radius', `${displaySettings.statsBorderRadius || 6}px`);
            document.documentElement.style.setProperty('--stats-margin-top', `${displaySettings.statsMarginTop || 4}px`);

            console.log(`✅ Applied settings: ${displaySettings.columns} columns x ${displaySettings.rows} rows, gap: ${displaySettings.gap}px`);
        }

        async function loadProducts() {
            if (!currentCampaignId) {
                console.log('⚠️ No campaign selected');
                showEmptyState();
                return;
            }
            try {
                orderProducts = await loadAllProductsFromFirebase(database, currentCampaignId);
                console.log('🔥 Loaded from Firebase:', Object.keys(orderProducts).length, 'products');

                if (Object.keys(orderProducts).length === 0) {
                    showEmptyState();
                } else {
                    updateProductGrid();
                }
            } catch (error) {
                console.error('❌ Error loading from Firebase:', error);
                orderProducts = {};
                console.log('⚠️ Using empty product list');
            }
        }

        function showEmptyState() {
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="empty-state">
                    <h2>📦 Chưa có sản phẩm nào đã ẩn</h2>
                    <p>Vui lòng quay lại trang tìm kiếm để ẩn sản phẩm</p>
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
            const groupedProducts = {};

            products.forEach(product => {
                const tmplId = product.ProductTmplId;

                if (!tmplId) {
                    const uniqueKey = `no-template-${product.Id}`;
                    groupedProducts[uniqueKey] = [product];
                    return;
                }

                if (!groupedProducts[tmplId]) {
                    groupedProducts[tmplId] = [];
                }
                groupedProducts[tmplId].push(product);
            });

            const mergedProducts = [];

            Object.entries(groupedProducts).forEach(([tmplId, variants]) => {
                if (variants.length === 1) {
                    mergedProducts.push(variants[0]);
                } else {
                    const firstVariant = variants[0];

                    let commonName = firstVariant.NameGet;
                    commonName = commonName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

                    const totalQtyAvailable = variants.reduce((sum, v) => sum + (v.QtyAvailable || 0), 0);
                    const totalSoldQty = variants.reduce((sum, v) => sum + (v.soldQty || 0), 0);

                    const soldQtyList = variants.map(v => ({
                        id: v.Id,
                        name: v.NameGet,
                        qty: v.soldQty || 0,
                        maxQty: v.QtyAvailable || 0
                    }));

                    const remainingQtyList = variants.map(v => ({
                        id: v.Id,
                        name: v.NameGet,
                        qty: v.remainingQty || 0
                    }));

                    const mostRecentAddedAt = Math.max(...variants.map(v => v.addedAt || 0));

                    const mergedProduct = {
                        ...firstVariant,
                        NameGet: commonName,
                        QtyAvailable: totalQtyAvailable,
                        soldQty: totalSoldQty,
                        remainingQty: 0,
                        soldQtyList: soldQtyList,
                        remainingQtyList: remainingQtyList,
                        addedAt: mostRecentAddedAt,
                        isMerged: true,
                        variantCount: variants.length,
                        variants: variants
                    };

                    mergedProducts.push(mergedProduct);
                }
            });

            mergedProducts.sort((a, b) => {
                const timeA = a.addedAt || 0;
                const timeB = b.addedAt || 0;
                return timeB - timeA;
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

            const hiddenProducts = Object.values(orderProducts).filter(p => p.isHidden === true);

            let baseProducts = searchKeyword ? filteredProducts.filter(p => p.isHidden === true) : hiddenProducts;

            const displayProducts = (isMergeVariants && !searchKeyword) ? mergeProductsByTemplate(baseProducts) : baseProducts;

            const totalPages = Math.ceil(displayProducts.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentProducts = displayProducts.slice(startIndex, endIndex);

            productGrid.innerHTML = currentProducts.map(product => {
                const cacheVersion = product.lastRefreshed || product.addedAt || product.Id;
                let imageUrlWithVersion = product.imageUrl;

                if (imageUrlWithVersion && !imageUrlWithVersion.startsWith('data:')) {
                    imageUrlWithVersion = `${imageUrlWithVersion}${imageUrlWithVersion.includes('?') ? '&' : '?'}v=${cacheVersion}`;
                }

                const imageHtml = imageUrlWithVersion
                    ? `<img src="${imageUrlWithVersion}" class="grid-item-image" alt="${product.NameGet}">`
                    : `<div class="grid-item-image no-image"><span class="icon-emoji">📦</span></div>`;

                const isMerged = product.isMerged || false;
                const disableEdit = isMerged ? 'disabled title="Tắt chế độ gộp để chỉnh sửa"' : '';

                let unhideButtonOnclick;
                let unhideButtonTitle;

                if (isMerged && product.variants && product.variants.length > 0) {
                    const variantIds = product.variants.map(v => v.Id).join(',');
                    unhideButtonOnclick = `unhideProducts([${variantIds}])`;
                    unhideButtonTitle = 'Hiện tất cả biến thể';
                } else {
                    unhideButtonOnclick = `unhideProduct(${product.Id})`;
                    unhideButtonTitle = 'Hiện sản phẩm';
                }

                const productPrice = product.ListPrice || 0;
                const productNameDisplay = productPrice > 0
                    ? `${product.NameGet} ${productPrice / 1000}K`
                    : product.NameGet;

                return `
                    <div class="grid-item" data-product-id="${product.Id}">
                        ${imageHtml}
                        <div class="grid-item-name">
                            <span class="grid-item-name-text">${productNameDisplay}</span>
                            ${!orderIsHideEditControls ? `<button class="btn-unhide" onclick="${unhideButtonOnclick}" title="${unhideButtonTitle}">Hiện</button>` : ''}
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
            pageInfo.textContent = `Trang ${currentPage}/${totalPages || 1} (${displayProducts.length} sản phẩm đã ẩn${isMergeVariants ? ' đã gộp' : ''})${searchInfo}`;
            btnPrev.disabled = currentPage === 1;
            btnNext.disabled = currentPage >= totalPages;
        }

        function changePage(direction) {
            const hiddenProducts = Object.values(orderProducts).filter(p => p.isHidden === true);
            let baseProducts = searchKeyword ? filteredProducts.filter(p => p.isHidden === true) : hiddenProducts;

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
                database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
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

        function buildNormalizedCache(products) {
            normalizedProductNames.clear();
            products.forEach(product => {
                if (product && product.Id && product.NameGet) {
                    normalizedProductNames.set(product.Id, removeVietnameseTones(product.NameGet));
                }
            });
        }

        function getNormalizedName(product) {
            if (!product || !product.Id) return '';

            if (normalizedProductNames.has(product.Id)) {
                return normalizedProductNames.get(product.Id);
            }

            const normalized = removeVietnameseTones(product.NameGet || '');
            normalizedProductNames.set(product.Id, normalized);
            return normalized;
        }

        function performSearch(keyword, syncToFirebase = true) {
            searchKeyword = keyword.trim();

            if (!searchKeyword) {
                filteredProducts = [];
                currentPage = pageBeforeSearch;
                updateProductGrid();

                if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
                    syncSearchKeywordToFirebase('');
                }
                return;
            }

            if (!filteredProducts.length) {
                pageBeforeSearch = currentPage;
            }

            const searchLower = searchKeyword.toLowerCase();
            const searchNoSign = removeVietnameseTones(searchKeyword);

            const hiddenProducts = Object.values(orderProducts).filter(p => p.isHidden === true);

            const productsToSearch = isMergeVariants ? mergeProductsByTemplate(hiddenProducts) : hiddenProducts;

            if (normalizedProductNames.size === 0) {
                buildNormalizedCache(productsToSearch);
            }

            const matchedProducts = productsToSearch.filter(product => {
                const nameNoSign = getNormalizedName(product);
                const matchName = nameNoSign.includes(searchNoSign);

                const matchNameOriginal = product.NameGet && product.NameGet.toLowerCase().includes(searchLower);

                return matchName || matchNameOriginal;
            });

            matchedProducts.sort((a, b) => {
                const extractBracket = (name) => {
                    const match = name?.match(/\[([^\]]+)\]/);
                    return match ? match[1].toLowerCase().trim() : '';
                };

                const aBracket = extractBracket(a.NameGet);
                const bBracket = extractBracket(b.NameGet);

                const aMatchInBracket = aBracket && aBracket.includes(searchLower);
                const bMatchInBracket = bBracket && bBracket.includes(searchLower);

                if (aMatchInBracket && !bMatchInBracket) return -1;
                if (!aMatchInBracket && bMatchInBracket) return 1;

                if (aMatchInBracket && bMatchInBracket) {
                    const aExactMatch = aBracket === searchLower;
                    const bExactMatch = bBracket === searchLower;
                    if (aExactMatch && !bExactMatch) return -1;
                    if (!aExactMatch && bExactMatch) return 1;

                    if (aBracket.length !== bBracket.length) {
                        return aBracket.length - bBracket.length;
                    }

                    return aBracket.localeCompare(bBracket);
                }

                return a.NameGet.localeCompare(b.NameGet);
            });

            filteredProducts = matchedProducts;

            const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
            if (currentPage > totalPages && totalPages > 0) {
                currentPage = totalPages;
            }

            updateProductGrid();

            if (isSyncMode && syncToFirebase && !isSyncingFromFirebase) {
                syncSearchKeywordToFirebase(searchKeyword);
            }
        }

        function syncSearchKeywordToFirebase(keyword) {
            if (firebaseSyncDebounceTimer) {
                clearTimeout(firebaseSyncDebounceTimer);
            }

            firebaseSyncDebounceTimer = setTimeout(() => {
                const syncData = {
                    keyword: keyword || '',
                    timestamp: Date.now()
                };

                database.ref('orderSyncSearchData').set(syncData).catch(error => {
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

            currentPage = pageBeforeSearch;

            updateProductGrid();

            if (isSyncMode && !isSyncingFromFirebase) {
                syncSearchKeywordToFirebase('');
            }
        }

        function updateProductQty(productId, change) {
            const productKey = `product_${productId}`;
            const product = orderProducts[productKey];
            if (!product) return;

            const currentSoldQty = product.soldQty || 0;
            const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, currentSoldQty + change));
            if (newSoldQty === currentSoldQty) return;

            if (!isSyncingFromFirebase) {
                updateProductQtyInFirebase(database, currentCampaignId, productId, change, orderProducts).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
        }

        function updateVariantQty(variantId, change) {
            const variantKey = `product_${variantId}`;
            const variant = orderProducts[variantKey];
            if (!variant) return;

            const currentSoldQty = variant.soldQty || 0;
            const newSoldQty = Math.max(0, Math.min(variant.QtyAvailable, currentSoldQty + change));
            if (newSoldQty === currentSoldQty) return;

            if (!isSyncingFromFirebase) {
                updateProductQtyInFirebase(database, currentCampaignId, variantId, change, orderProducts).catch(error => {
                    console.error('❌ Lỗi sync products:', error);
                });
            }

            if (searchKeyword) {
                performSearch(searchKeyword, false);
            } else {
                updateProductGrid();
            }
        }

        function unhideProduct(productId) {
            if (!confirm('Bạn có chắc muốn hiện sản phẩm này?')) return;

            const productKey = `product_${productId}`;
            const product = orderProducts[productKey];
            if (!product) return;

            product.isHidden = false;

            if (!isSyncingFromFirebase) {
                updateProductVisibility(database, currentCampaignId, productId, false, orderProducts).catch(error => {
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

        function unhideProducts(productIds) {
            const count = productIds.length;
            if (!confirm(`Bạn có chắc muốn hiện tất cả ${count} biến thể?`)) return;

            let unhiddenCount = 0;
            productIds.forEach(productId => {
                const productKey = `product_${productId}`;
                const product = orderProducts[productKey];
                if (product) {
                    product.isHidden = false;
                    unhiddenCount++;
                }
            });

            if (unhiddenCount > 0 && !isSyncingFromFirebase) {
                const updates = {};
                productIds.forEach(productId => {
                    const productKey = `product_${productId}`;
                    if (orderProducts[productKey]) {
                        updates[`${getProductsPath(currentCampaignId)}/${productKey}/isHidden`] = false;
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
            console.log(`👁️ Đã hiện ${unhiddenCount} biến thể`);
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

        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');

        // Use mouse position tracking instead of hover areas to avoid blocking input clicks
        let mouseX = 0;
        const edgeThreshold = 80; // Distance from edge to show buttons

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            const windowWidth = window.innerWidth;

            // Check if mouse is near left edge
            if (mouseX < edgeThreshold && !btnPrev.disabled) {
                btnPrev.classList.add('active');
            } else {
                btnPrev.classList.remove('active');
            }

            // Check if mouse is near right edge
            if (mouseX > windowWidth - edgeThreshold && !btnNext.disabled) {
                btnNext.classList.add('active');
            } else {
                btnNext.classList.remove('active');
            }
        });

        // Keep buttons visible when hovering over them
        [btnPrev, btnNext].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) {
                    btn.classList.add('active');
                }
            });

            btn.addEventListener('mouseleave', () => {
                // Recheck mouse position after leaving button
                const windowWidth = window.innerWidth;
                if (btn === btnPrev && mouseX >= edgeThreshold) {
                    btn.classList.remove('active');
                } else if (btn === btnNext && mouseX <= windowWidth - edgeThreshold) {
                    btn.classList.remove('active');
                }
            });
        });

        function setupFirebaseListeners() {
            // Listen for hidden products display settings changes
            database.ref('hiddenProductsDisplaySettings').on('value', (snapshot) => {
                const settings = snapshot.val();
                if (settings && !isSyncingFromFirebase) {
                    isSyncingFromFirebase = true;
                    displaySettings = {
                        columns: settings.columns || 4,
                        rows: settings.rows || 2,
                        gap: settings.gap || 15,
                        itemHeight: 500,
                        nameMargin: 3,
                        itemsPerPage: settings.itemsPerPage || ((settings.columns || 4) * (settings.rows || 2))
                    };
                    itemsPerPage = displaySettings.itemsPerPage;
                    applySettings();
                    updateProductGrid();
                    console.log('🔥 Hidden products display settings synced from Firebase');
                    setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                }
            });

            // Listen for merge variants mode changes
            database.ref('orderIsMergeVariants').on('value', (snapshot) => {
                const mergeMode = snapshot.val();
                if (mergeMode !== null && mergeMode !== undefined && !isSyncingFromFirebase) {
                    isSyncingFromFirebase = true;
                    isMergeVariants = mergeMode;
                    localStorage.setItem('orderIsMergeVariants', JSON.stringify(isMergeVariants));
                    updateMergeVariantsUI();
                    updateProductGrid();
                    console.log('🔥 Merge variants mode synced from Firebase:', isMergeVariants);
                    setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                }
            });

            // Products listener - USE CHILD LISTENERS (campaign-scoped)
            if (currentCampaignId) {
                setupFirebaseChildListeners(database, currentCampaignId, orderProducts, {
                onProductAdded: (product) => {
                    if (!isSyncingFromFirebase) {
                        console.log('🔥 Product added from Firebase:', product.NameGet);
                        buildNormalizedCache(Object.values(orderProducts));
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
                        buildNormalizedCache(Object.values(orderProducts));
                        if (searchKeyword) {
                            performSearch(searchKeyword, false);
                        } else {
                            updateProductGrid();
                        }
                    }
                },
                onProductRemoved: (product) => {
                    if (!isSyncingFromFirebase) {
                        console.log('🔥 Product removed from Firebase:', product.NameGet);
                        buildNormalizedCache(Object.values(orderProducts));
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
            }

            database.ref('orderSyncCurrentPage').on('value', (snapshot) => {
                const page = snapshot.val();

                if (isSyncMode && page && !isSyncingFromFirebase && page !== currentPage) {
                    isSyncingFromFirebase = true;

                    const totalPages = Math.ceil(Object.keys(orderProducts).length / itemsPerPage);

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

            let lastSyncedSearchTimestamp = 0;
            database.ref('orderSyncSearchData').on('value', (snapshot) => {
                const searchData = snapshot.val();

                if (isSyncMode && !isSyncingFromFirebase && searchData) {
                    const keyword = searchData.keyword || '';
                    const timestamp = searchData.timestamp || 0;

                    if (timestamp > lastSyncedSearchTimestamp) {
                        const currentKeyword = document.getElementById('searchInput')?.value || '';

                        if (keyword !== currentKeyword) {
                            isSyncingFromFirebase = true;
                            lastSyncedSearchTimestamp = timestamp;

                            const searchInput = document.getElementById('searchInput');
                            const searchClear = document.getElementById('searchClear');
                            const searchContainer = document.getElementById('searchContainer');

                            if (searchInput) {
                                searchInput.value = keyword;

                                if (keyword) {
                                    searchClear.classList.add('show');
                                    searchContainer.classList.add('active');
                                } else {
                                    searchClear.classList.remove('show');
                                    searchContainer.classList.remove('active');
                                }
                            }

                            performSearch(keyword, false);

                            console.log('🔥 Search synced from Firebase:', keyword, '@', new Date(timestamp).toLocaleTimeString());

                            setTimeout(() => { isSyncingFromFirebase = false; }, 100);
                        }
                    }
                }
            });
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'orderProducts') {
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

            if (isSyncMode && !wasSyncMode) {
                database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync page khi vào sync mode:', error);
                });
            }

            if (params.page) {
                const totalPages = Math.ceil(Object.keys(orderProducts).length / itemsPerPage);
                if (params.page >= 1 && params.page <= totalPages) {
                    currentPage = params.page;
                    updateProductGrid();

                    if (isSyncMode && !isSyncingFromFirebase) {
                        database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
                            console.error('❌ Lỗi sync page từ hash change:', error);
                        });
                    }
                }
            } else {
                if (currentPage !== 1) {
                    currentPage = 1;
                    updateProductGrid();

                    if (isSyncMode && !isSyncingFromFirebase) {
                        database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
                            console.error('❌ Lỗi sync page reset:', error);
                        });
                    }
                }
            }
        });

        window.addEventListener('load', async () => {
            loadSettings();
            loadMergeVariantsMode();
            loadHideEditControlsMode();

            await loadProducts();

            setupFirebaseListeners();

            const params = parseHashParams();

            isSyncMode = true;

            if (params.page && params.page > 1) {
                currentPage = params.page;
                updateProductGrid();
            }

            updateHashUrl();
            updateSyncToggleButton();

            if (isSyncMode) {
                database.ref('orderSyncCurrentPage').set(currentPage).catch(error => {
                    console.error('❌ Lỗi sync initial page lên Firebase:', error);
                });

                try {
                    const snapshot = await database.ref('orderSyncSearchData').once('value');
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

                        performSearch(keyword, false);
                        console.log('🔥 Loaded search from Firebase:', keyword);
                    }
                } catch (error) {
                    console.error('❌ Lỗi loading search từ Firebase:', error);
                }
            }

            const searchInput = document.getElementById('searchInput');
            const searchClear = document.getElementById('searchClear');
            const searchContainer = document.getElementById('searchContainer');

            if (searchInput) {
                searchContainer.addEventListener('click', () => {
                    searchInput.focus();
                });

                searchInput.addEventListener('input', (e) => {
                    const value = e.target.value;

                    if (value) {
                        searchClear.classList.add('show');
                        searchContainer.classList.add('active');
                    } else {
                        searchClear.classList.remove('show');
                        searchContainer.classList.remove('active');
                    }

                    if (searchInputDebounceTimer) {
                        clearTimeout(searchInputDebounceTimer);
                    }

                    searchInputDebounceTimer = setTimeout(() => {
                        performSearch(value);
                    }, SEARCH_INPUT_DEBOUNCE_MS);
                });

                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        if (searchInputDebounceTimer) {
                            clearTimeout(searchInputDebounceTimer);
                        }
                        performSearch(e.target.value);
                    }
                });

                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        clearSearch();
                    }
                });
            }
        });