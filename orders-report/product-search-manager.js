// =====================================================
// ENHANCED PRODUCT SEARCH MANAGER V2
// Excel Suggestions + Full Product Details
// =====================================================

class EnhancedProductSearchManager {
    constructor() {
        this.excelProducts = []; // Suggestions from Excel
        this.fullProductCache = new Map(); // Full product details cache
        this.isLoaded = false;
        this.isLoading = false;
        this.lastFetchTime = null;
        this.storageKey = "product_excel_cache_v2";
        this.fullProductsKey = "product_full_details_cache";
        this.CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
        this.EXCEL_ENDPOINT =
            "https://chatomni-proxy.nhijudyshop.workers.dev/api/Product/ExportFileWithVariantPrice";
        this.PRODUCT_API_BASE = "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product";

        this.init();
    }

    init() {
        console.log(
            "[PRODUCT] Initializing Enhanced Product Search Manager V2...",
        );
        this.loadFromCache();
        this.loadFullProductCache();
    }

    // ========================================
    // EXCEL CACHE MANAGEMENT
    // ========================================

    loadFromCache() {
        try {
            const cached = sessionStorage.getItem(this.storageKey);
            if (!cached) {
                console.log("[PRODUCT] No Excel cache found");
                return false;
            }

            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;

            if (age > this.CACHE_DURATION) {
                console.log("[PRODUCT] Excel cache expired");
                sessionStorage.removeItem(this.storageKey);
                return false;
            }

            this.excelProducts = data.products || [];
            this.lastFetchTime = new Date(data.timestamp).toLocaleString(
                "vi-VN",
            );
            this.isLoaded = this.excelProducts.length > 0;

            console.log(
                `[PRODUCT] Loaded ${this.excelProducts.length} products from cache`,
            );
            console.log(
                `[PRODUCT] Cache age: ${Math.floor(age / 1000 / 60)} minutes`,
            );

            return true;
        } catch (error) {
            console.error("[PRODUCT] Error loading cache:", error);
            return false;
        }
    }

    saveToCache() {
        try {
            const cacheData = {
                products: this.excelProducts,
                timestamp: Date.now(),
            };

            sessionStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            this.lastFetchTime = new Date().toLocaleString("vi-VN");

            console.log(
                `[PRODUCT] Saved ${this.excelProducts.length} products to cache`,
            );
        } catch (error) {
            console.error("[PRODUCT] Error saving to cache:", error);

            if (error.name === "QuotaExceededError") {
                console.warn(
                    "[PRODUCT] Storage quota exceeded, clearing old cache",
                );
                sessionStorage.removeItem(this.storageKey);
            }
        }
    }

    // ========================================
    // FULL PRODUCT DETAILS CACHE
    // ========================================

    loadFullProductCache() {
        try {
            const cached = localStorage.getItem(this.fullProductsKey);
            if (!cached) return;

            const data = JSON.parse(cached);

            // Load into Map
            Object.entries(data).forEach(([id, product]) => {
                this.fullProductCache.set(parseInt(id), product);
            });

            console.log(
                `[PRODUCT] Loaded ${this.fullProductCache.size} full products from cache`,
            );
        } catch (error) {
            console.error("[PRODUCT] Error loading full product cache:", error);
        }
    }

    saveFullProductCache() {
        try {
            // Convert Map to Object for storage
            const data = {};
            this.fullProductCache.forEach((product, id) => {
                data[id] = product;
            });

            localStorage.setItem(this.fullProductsKey, JSON.stringify(data));
            console.log(
                `[PRODUCT] Saved ${this.fullProductCache.size} full products to cache`,
            );
        } catch (error) {
            console.error("[PRODUCT] Error saving full product cache:", error);
        }
    }

    // ========================================
    // FETCH EXCEL FROM POST ENDPOINT
    // ========================================

    async fetchExcelProducts(force = false) {
        // If already loaded and not forced, return
        if (this.isLoaded && !force) {
            console.log("[PRODUCT] Excel already loaded");
            return this.excelProducts;
        }

        // If currently loading, wait for it
        if (this.isLoading) {
            console.log(
                "[PRODUCT] Excel fetch already in progress, waiting...",
            );
            return this.waitForLoad();
        }

        this.isLoading = true;
        let notificationId = null;

        try {
            // Show loading notification
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    "Đang tải danh sách sản phẩm từ Excel...",
                    "info",
                    0,
                    {
                        showOverlay: true,
                        persistent: true,
                        icon: "file-spreadsheet",
                        title: "Tải Excel",
                    },
                );
            }

            console.log("[PRODUCT] Fetching Excel from POST endpoint...");

            // Get auth headers
            const headers = await window.tokenManager.getAuthHeader();

            // POST request to get Excel file
            const response = await fetch(this.EXCEL_ENDPOINT, {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    model: { Active: "true" },
                    ids: "",
                }),
            });

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            // Get blob data
            const blob = await response.blob();
            console.log(
                `[PRODUCT] Received Excel file: ${(blob.size / 1024).toFixed(2)} KB`,
            );

            // Parse Excel
            const products = await this.parseExcelBlob(blob);

            if (products.length === 0) {
                throw new Error("No products found in Excel file");
            }

            this.excelProducts = products;
            this.isLoaded = true;
            this.saveToCache();

            // Update suggestions with cached full product details
            this.enrichSuggestionsFromCache();

            // Success notification
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success(
                    `Đã tải ${products.length.toLocaleString("vi-VN")} sản phẩm`,
                    2000,
                    "Thành công",
                );
            }

            console.log(
                `[PRODUCT] Successfully loaded ${products.length} products from Excel`,
            );
            return products;
        } catch (error) {
            console.error("[PRODUCT] Error fetching Excel:", error);

            if (window.notificationManager) {
                if (notificationId) {
                    window.notificationManager.remove(notificationId);
                }
                window.notificationManager.error(
                    `Không thể tải Excel: ${error.message}`,
                    4000,
                    "Lỗi",
                );
            }

            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    async waitForLoad() {
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.isLoading && Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (this.isLoaded) {
            return this.excelProducts;
        }

        throw new Error("Excel load timeout");
    }

    // ========================================
    // PARSE EXCEL FILE
    // ========================================

    async parseExcelBlob(blob) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: "array" });

                        const firstSheet =
                            workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
                            header: 1,
                        });

                        if (jsonData.length < 2) {
                            throw new Error("Excel file is empty or invalid");
                        }

                        // Parse rows (skip header)
                        const products = [];
                        const headers = jsonData[0];

                        console.log("[PRODUCT] Excel structure:", {
                            sheet: workbook.SheetNames[0],
                            headers: headers,
                            totalRows: jsonData.length - 1,
                        });

                        for (let i = 1; i < jsonData.length; i++) {
                            const row = jsonData[i];

                            // Skip empty rows
                            if (!row || row.length === 0 || !row[0]) continue;

                            // Excel structure: [Id, Name, Price]
                            // Column 0: Id sản phẩm (*)
                            // Column 1: Tên sản phẩm
                            // Column 2: Giá biến thể
                            const productId = parseInt(row[0]);
                            const productName = row[1] || "";
                            const productPrice = parseFloat(row[2]) || 0;

                            // Skip if no valid ID
                            if (!productId || isNaN(productId)) continue;

                            const product = {
                                Id: productId,
                                Name: productName,
                                NameNoSign:
                                    this.removeVietnameseTones(productName),
                                Price: productPrice,
                                Code: null, // Will be populated from full product details
                                ImageUrl: null, // Will be populated from full product cache
                                Thumbnails: null,
                                QtyAvailable: null,
                                StandardPrice: null,
                                Category: null,
                                IsFromExcel: true,
                                HasFullDetails: false,
                            };

                            // Check if we have full details cached
                            if (this.fullProductCache.has(productId)) {
                                const fullProduct =
                                    this.fullProductCache.get(productId);
                                product.Code =
                                    fullProduct.DefaultCode ||
                                    fullProduct.Barcode ||
                                    product.Code;
                                product.ImageUrl = fullProduct.ImageUrl;
                                product.Thumbnails = fullProduct.Thumbnails;
                                product.QtyAvailable = fullProduct.QtyAvailable;
                                product.StandardPrice =
                                    fullProduct.StandardPrice;
                                product.Category = fullProduct.Categ?.Name;
                                product.Price =
                                    fullProduct.PriceVariant ||
                                    fullProduct.ListPrice ||
                                    product.Price;
                                product.HasFullDetails = true;
                            }

                            products.push(product);
                        }

                        console.log(
                            `[PRODUCT] Parsed ${products.length} products from Excel`,
                        );
                        console.log(
                            `[PRODUCT] Enriched products: ${products.filter((p) => p.HasFullDetails).length}`,
                        );

                        resolve(products);
                    } catch (error) {
                        console.error("[PRODUCT] Error parsing Excel:", error);
                        reject(error);
                    }
                };

                reader.onerror = (error) => {
                    console.error("[PRODUCT] FileReader error:", error);
                    reject(error);
                };

                reader.readAsArrayBuffer(blob);
            } catch (error) {
                console.error("[PRODUCT] Error reading Excel blob:", error);
                reject(error);
            }
        });
    }

    // ========================================
    // SEARCH IN EXCEL SUGGESTIONS
    // ========================================

    search(query, limit = 20) {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const searchTerm = this.removeVietnameseTones(
            query.toLowerCase().trim(),
        );
        const results = [];

        for (const product of this.excelProducts) {
            // Skip if already have enough results
            if (results.length >= limit) break;

            // Search in multiple fields
            const nameMatch =
                product.NameNoSign?.toLowerCase().includes(searchTerm);
            const codeMatch = product.Code?.toLowerCase().includes(searchTerm);
            const idMatch = product.Id?.toString().includes(query);

            if (nameMatch || codeMatch || idMatch) {
                results.push({
                    ...product,
                    _matchType: nameMatch ? "name" : codeMatch ? "code" : "id",
                });
            }
        }

        // Sort by match type priority: code > name > id
        results.sort((a, b) => {
            const priority = { code: 0, name: 1, id: 2 };
            return priority[a._matchType] - priority[b._matchType];
        });

        console.log(
            `[PRODUCT] Search "${query}" found ${results.length} results`,
        );
        return results;
    }

    // ========================================
    // GET FULL PRODUCT DETAILS
    // ========================================

    async getFullProductDetails(productId, forceRefresh = false) {
        // Check cache first (if not forced)
        if (!forceRefresh && this.fullProductCache.has(productId)) {
            console.log(
                `[PRODUCT] Using cached full details for product ${productId}`,
            );
            return this.fullProductCache.get(productId);
        }

        // Fetch from API
        try {
            console.log(
                `[PRODUCT] Fetching full details for product ${productId}`,
            );

            const headers = await window.tokenManager.getAuthHeader();
            const url = `${this.PRODUCT_API_BASE}(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`;

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    ...headers,
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                // If 404, product might not exist
                if (response.status === 404) {
                    console.warn(
                        `[PRODUCT] Product ${productId} not found (404)`,
                    );

                    // Try to refresh Excel cache
                    console.log("[PRODUCT] Refreshing Excel cache...");
                    await this.fetchExcelProducts(true);

                    // Check if product exists in new Excel
                    const existsInExcel = this.excelProducts.some(
                        (p) => p.Id === productId,
                    );

                    if (!existsInExcel) {
                        throw new Error(
                            `Sản phẩm ID ${productId} không tồn tại trong hệ thống`,
                        );
                    }
                }

                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const fullProduct = await response.json();

            // Cache the full product
            this.fullProductCache.set(productId, fullProduct);
            this.saveFullProductCache();

            // Update Excel suggestion with full details
            this.updateExcelSuggestion(productId, fullProduct);

            console.log(
                `[PRODUCT] Successfully fetched and cached product ${productId}`,
            );
            return fullProduct;
        } catch (error) {
            console.error(
                `[PRODUCT] Error fetching product ${productId}:`,
                error,
            );
            throw error;
        }
    }

    // ========================================
    // UPDATE EXCEL SUGGESTION WITH FULL DETAILS
    // ========================================

    updateExcelSuggestion(productId, fullProduct) {
        const index = this.excelProducts.findIndex((p) => p.Id === productId);

        if (index !== -1) {
            // Enrich suggestion with full details
            this.excelProducts[index] = {
                ...this.excelProducts[index],
                ImageUrl: fullProduct.ImageUrl,
                Thumbnails: fullProduct.Thumbnails,
                Price:
                    fullProduct.PriceVariant ||
                    fullProduct.ListPrice ||
                    this.excelProducts[index].Price,
                StandardPrice:
                    fullProduct.StandardPrice ||
                    this.excelProducts[index].StandardPrice,
                Name: fullProduct.NameGet || fullProduct.Name || this.excelProducts[index].Name,
                NameNoSign: this.removeVietnameseTones(
                    fullProduct.NameGet || fullProduct.Name || this.excelProducts[index].Name,
                ),
                Code:
                    fullProduct.DefaultCode ||
                    fullProduct.Barcode ||
                    this.excelProducts[index].Code,
                QtyAvailable:
                    fullProduct.QtyAvailable ??
                    this.excelProducts[index].QtyAvailable,
                Category:
                    fullProduct.Categ?.Name ||
                    this.excelProducts[index].Category,
                HasFullDetails: true,
                LastUpdated: new Date().toISOString(),
            };

            // Save updated cache
            this.saveToCache();
            console.log(
                `[PRODUCT] Updated Excel suggestion for product ${productId} with full details`,
            );
        }
    }

    // ========================================
    // ENRICH SUGGESTIONS FROM CACHED FULL PRODUCTS
    // ========================================

    enrichSuggestionsFromCache() {
        let enrichedCount = 0;

        this.excelProducts.forEach((product, index) => {
            if (this.fullProductCache.has(product.Id)) {
                const fullProduct = this.fullProductCache.get(product.Id);

                this.excelProducts[index] = {
                    ...product,
                    ImageUrl: fullProduct.ImageUrl,
                    Thumbnails: fullProduct.Thumbnails,
                    Price:
                        fullProduct.PriceVariant ||
                        fullProduct.ListPrice ||
                        product.Price,
                    Name: fullProduct.NameGet || fullProduct.Name || product.Name,
                    NameNoSign: this.removeVietnameseTones(
                        fullProduct.NameGet || fullProduct.Name || product.Name,
                    ),
                    HasFullDetails: true,
                };

                enrichedCount++;
            }
        });

        if (enrichedCount > 0) {
            this.saveToCache();
            console.log(
                `[PRODUCT] Enriched ${enrichedCount} suggestions from cached full products`,
            );
        }
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    removeVietnameseTones(str) {
        if (!str) return "";

        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D");
    }

    getStats() {
        return {
            totalSuggestions: this.excelProducts.length,
            cachedFullProducts: this.fullProductCache.size,
            enrichedSuggestions: this.excelProducts.filter(
                (p) => p.HasFullDetails,
            ).length,
            lastFetch: this.lastFetchTime || "Chưa tải",
            isLoaded: this.isLoaded,
            cacheAge: this.getCacheAge(),
        };
    }

    getCacheAge() {
        try {
            const cached = sessionStorage.getItem(this.storageKey);
            if (!cached) return "N/A";

            const data = JSON.parse(cached);
            const ageMinutes = Math.floor(
                (Date.now() - data.timestamp) / 1000 / 60,
            );

            if (ageMinutes < 60) return `${ageMinutes} phút`;

            const ageHours = Math.floor(ageMinutes / 60);
            return `${ageHours} giờ`;
        } catch {
            return "N/A";
        }
    }

    async refresh() {
        console.log("[PRODUCT] Manual refresh requested");
        sessionStorage.removeItem(this.storageKey);
        this.isLoaded = false;
        return await this.fetchExcelProducts(true);
    }

    clearCache() {
        sessionStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.fullProductsKey);
        this.excelProducts = [];
        this.fullProductCache.clear();
        this.isLoaded = false;
        this.lastFetchTime = null;
        console.log("[PRODUCT] All caches cleared");
    }

    // Check if product exists in Excel
    hasProductInExcel(productId) {
        return this.excelProducts.some((p) => p.Id === productId);
    }

    // Get product from Excel by ID
    getFromExcel(productId) {
        return this.excelProducts.find((p) => p.Id === productId);
    }
}

// =====================================================
// INITIALIZE
// =====================================================

const enhancedProductSearchManager = new EnhancedProductSearchManager();
window.enhancedProductSearchManager = enhancedProductSearchManager;

// Backward compatibility
window.productSearchManager = enhancedProductSearchManager;

console.log("[PRODUCT] Enhanced Product Search Manager V2 initialized");
