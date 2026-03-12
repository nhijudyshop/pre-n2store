// ========================================
// SOCIAL SALES - MAIN SCRIPT
// Key difference: isSyncMode = false (no UI sync)
// ========================================

let soluongProducts = {};
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

// KEY DIFFERENCE: isSyncMode always false for Social
let isSyncMode = false;
let isMergeVariants = false;
let isSyncingFromFirebase = false;
let firebaseDetachFn = null; // Store detach function for cleanup on page unload

// Staff info from AuthManager
const authManager = new AuthManager();
let staffName = 'Unknown';
let staffUsername = 'unknown';

// Optimization: Cache normalized product names
let normalizedProductNames = new Map();
let searchInputDebounceTimer = null;
const SEARCH_INPUT_DEBOUNCE_MS = 300;

// Firebase Configuration - use shared config (loaded via shared/js/firebase-config.js)
// Firebase is auto-initialized by shared config
const database = firebase.database();

async function loadSettings() {
    try {
        const cachedSettings = localStorage.getItem('soluongDisplaySettings');
        if (cachedSettings) {
            const settings = JSON.parse(cachedSettings);
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
            applySettings();
        }
    } catch (e) {
        console.log('📋 No cached settings');
    }

    try {
        const snapshot = await database.ref('soluongDisplaySettings').once('value');
        const settings = snapshot.val();
        if (settings) {
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
            localStorage.setItem('soluongDisplaySettings', JSON.stringify(settings));
        }
    } catch (error) {
        console.error('❌ Error loading settings:', error);
    }
    applySettings();
}

function applySettings() {
    const productGrid = document.getElementById('productGrid');
    productGrid.style.gridTemplateColumns = `repeat(${displaySettings.columns}, 1fr)`;
    productGrid.style.gridTemplateRows = `repeat(${displaySettings.rows}, 1fr)`;
    productGrid.style.gap = `${displaySettings.gap}px`;
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
    }
}

function showEmptyState() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <div class="empty-state">
            <h2>📦 Chưa có sản phẩm nào</h2>
            <p>Vui lòng thêm sản phẩm từ trang quản lý live</p>
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

    const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);
    let baseProducts = searchKeyword ? filteredProducts.filter(p => !p.isHidden) : visibleProducts;
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

        const productPrice = product.ListPrice || 0;
        const productNameDisplay = productPrice > 0
            ? `${product.NameGet} ${productPrice / 1000}K`
            : product.NameGet;

        return `
            <div class="grid-item" data-product-id="${product.Id}">
                ${imageHtml}
                <div class="grid-item-name">
                    <span class="grid-item-name-text">${productNameDisplay}</span>
                </div>
                <div class="grid-item-stats">
                    <div class="grid-stat grid-stat-total">
                        <div class="grid-stat-label">📦 TỔNG</div>
                        <div class="grid-stat-value">${product.QtyAvailable || 0}</div>
                    </div>
                    <div class="grid-stat grid-stat-sold">
                        <div class="grid-stat-label">🛒 BÁN</div>
                        <div class="qty-controls">
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, -1)" ${product.soldQty <= 0 || isMerged ? 'disabled' : ''} ${disableEdit}>−</button>
                            <div class="grid-stat-value">${product.soldQty || 0}</div>
                            <button class="qty-btn" onclick="updateProductQty(${product.Id}, 1)" ${product.soldQty >= product.QtyAvailable || isMerged ? 'disabled' : ''} ${disableEdit}>+</button>
                        </div>
                    </div>
                    <div class="grid-stat grid-stat-remaining">
                        <div class="grid-stat-label">✅ CÒN</div>
                        <div class="grid-stat-value">${product.remainingQty || 0}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const searchInfo = searchKeyword ? ` - 🔍 "${searchKeyword}"` : '';
    pageInfo.textContent = `Trang ${currentPage}/${totalPages || 1} (${displayProducts.length} sản phẩm)${searchInfo}`;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage >= totalPages;
}

function changePage(direction) {
    let baseProducts = searchKeyword ? filteredProducts : Object.values(soluongProducts);
    const displayProducts = (isMergeVariants && !searchKeyword) ? mergeProductsByTemplate(baseProducts) : baseProducts;
    const totalPages = Math.ceil(displayProducts.length / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }

    updateProductGrid();
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

function performSearch(keyword) {
    searchKeyword = keyword.trim();

    if (!searchKeyword) {
        filteredProducts = [];
        currentPage = pageBeforeSearch;
        updateProductGrid();
        return;
    }

    if (!filteredProducts.length) {
        pageBeforeSearch = currentPage;
    }

    const searchLower = searchKeyword.toLowerCase();
    const searchNoSign = removeVietnameseTones(searchKeyword);

    const visibleProducts = Object.values(soluongProducts).filter(p => !p.isHidden);
    const productsToSearch = isMergeVariants ? mergeProductsByTemplate(visibleProducts) : visibleProducts;

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
}

function clearSearch() {
    searchKeyword = '';
    filteredProducts = [];
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('show');
    currentPage = pageBeforeSearch;
    updateProductGrid();
}

// KEY FUNCTION: Update quantity with logging
function updateProductQty(productId, change) {
    const productKey = `product_${productId}`;
    const product = soluongProducts[productKey];
    if (!product) return;

    const currentSoldQty = product.soldQty || 0;
    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, currentSoldQty + change));
    if (newSoldQty === currentSoldQty) return;

    // Get sale source from dropdown
    const source = document.getElementById('saleSource').value;

    // Update with logging
    updateProductQtyInFirebase(
        database,
        productId,
        change,
        soluongProducts,
        {
            source: source,
            staffName: staffName,
            staffUsername: staffUsername
        }
    ).catch(error => {
        console.error('❌ Lỗi sync products:', error);
    });

    // Recalculate remainingQty after helper updates soldQty
    product.remainingQty = product.QtyAvailable - (product.soldQty || 0);

    if (searchKeyword) {
        performSearch(searchKeyword);
    } else {
        updateProductGrid();
    }
}

function setupFirebaseListeners() {
    database.ref('soluongDisplaySettings').on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings && !isSyncingFromFirebase) {
            isSyncingFromFirebase = true;
            displaySettings = settings;
            itemsPerPage = settings.itemsPerPage || (settings.columns * settings.rows);
            localStorage.setItem('soluongDisplaySettings', JSON.stringify(settings));
            applySettings();
            updateProductGrid();
            setTimeout(() => { isSyncingFromFirebase = false; }, 100);
        }
    });

    // Products listener - real-time sync
    firebaseDetachFn = setupFirebaseChildListeners(database, soluongProducts, {
        onProductAdded: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product added:', product.NameGet);
                buildNormalizedCache(Object.values(soluongProducts));
                if (searchKeyword) {
                    performSearch(searchKeyword);
                } else {
                    updateProductGrid();
                }
            }
        },
        onProductChanged: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product updated:', product.NameGet);
                buildNormalizedCache(Object.values(soluongProducts));
                if (searchKeyword) {
                    performSearch(searchKeyword);
                } else {
                    updateProductGrid();
                }
            }
        },
        onQtyChanged: (product, productKey) => {
            // Recalculate remainingQty when soldQty changes
            product.remainingQty = product.QtyAvailable - (product.soldQty || 0);
            console.log('🔥 Qty updated:', product.NameGet, '→ soldQty:', product.soldQty, 'remainingQty:', product.remainingQty);

            // Update UI
            buildNormalizedCache(Object.values(soluongProducts));
            if (searchKeyword) {
                performSearch(searchKeyword);
            } else {
                updateProductGrid();
            }
        },
        onProductRemoved: (product) => {
            if (!isSyncingFromFirebase) {
                console.log('🔥 Product removed:', product.NameGet);
                buildNormalizedCache(Object.values(soluongProducts));
                if (searchKeyword) {
                    performSearch(searchKeyword);
                } else {
                    updateProductGrid();
                }
            }
        },
        onInitialLoadComplete: () => {
            console.log('✅ Firebase listeners setup complete');
        }
    });

    // NOTE: We do NOT listen to soluongSyncCurrentPage or soluongSyncSearchData
    // because Social page should NOT sync UI with live page
}

document.getElementById('btnPrev').addEventListener('click', () => changePage('prev'));
document.getElementById('btnNext').addEventListener('click', () => changePage('next'));

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        changePage('prev');
    } else if (e.key === 'ArrowRight') {
        changePage('next');
    }
});

// Hover areas for nav buttons
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

window.addEventListener('load', async () => {
    // Get staff info from AuthManager
    const userInfo = authManager.getUserInfo();
    if (userInfo) {
        staffName = userInfo.displayName || userInfo.username || 'Unknown';
        staffUsername = userInfo.username || 'unknown';
        document.getElementById('staffName').textContent = staffName;
        console.log('👤 Staff logged in:', staffName);
    } else {
        // If not authenticated, show as guest but still allow access
        document.getElementById('staffName').textContent = 'Khách';
        staffName = 'Khách';
        staffUsername = 'guest';
        console.log('⚠️ User not authenticated, continuing as guest');
    }

    await loadSettings();
    await loadProducts();
    setupFirebaseListeners();

    // Setup search input
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

// Cleanup Firebase listeners when leaving page
window.addEventListener('beforeunload', () => {
    console.log('🧹 Cleaning up Firebase listeners...');

    // Cleanup product listeners
    if (firebaseDetachFn) {
        firebaseDetachFn.detach();
    }

    // Cleanup settings listener
    database.ref('soluongDisplaySettings').off('value');
});
