// =====================================================
// STANDARD PRICE MANAGER
// Fetch và cache giá vốn từ API ExportProductV2
// Sử dụng IndexedDB thay vì localStorage để lưu data lớn
// =====================================================

class StandardPriceManager {
    constructor() {
        this.products = new Map(); // Map<productId, productData>
        this.productsByCode = new Map(); // Map<code, productData>
        this.isLoaded = false;
        this.isLoading = false;
        this.lastFetchTime = null;

        // IndexedDB config
        this.DB_NAME = "StandardPriceDB";
        this.DB_VERSION = 1;
        this.STORE_NAME = "products_cache";
        this.CACHE_KEY = "standard_price_cache_v3";
        this.CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

        // API endpoint
        this.API_ENDPOINT = "https://chatomni-proxy.nhijudyshop.workers.dev/api/Product/ExportFileWithStandardPriceV2";

        this.db = null;
        this.init();
    }

    async init() {
        console.log("[STANDARD-PRICE] Initializing Standard Price Manager with IndexedDB...");
        try {
            await this.openDatabase();
            await this.loadFromCache();
        } catch (error) {
            console.error("[STANDARD-PRICE] Init error:", error);
        }
    }

    // ========================================
    // INDEXEDDB SETUP
    // ========================================

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = (event) => {
                console.error("[STANDARD-PRICE] IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("[STANDARD-PRICE] IndexedDB opened successfully");
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if not exists
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: "key" });
                    console.log("[STANDARD-PRICE] Object store created");
                }
            };
        });
    }

    // ========================================
    // CACHE MANAGEMENT (IndexedDB)
    // ========================================

    async loadFromCache() {
        try {
            if (!this.db) {
                console.log("[STANDARD-PRICE] Database not ready");
                return false;
            }

            const cached = await this.getFromIndexedDB(this.CACHE_KEY);

            if (!cached) {
                console.log("[STANDARD-PRICE] No cache found in IndexedDB");
                // Try migrate from localStorage
                await this.migrateFromLocalStorage();
                return false;
            }

            const age = Date.now() - cached.timestamp;

            if (age > this.CACHE_DURATION) {
                console.log("[STANDARD-PRICE] Cache expired");
                await this.deleteFromIndexedDB(this.CACHE_KEY);
                return false;
            }

            // Load into Maps
            if (cached.products && Array.isArray(cached.products)) {
                cached.products.forEach(p => {
                    this.products.set(p.Id, p);
                    if (p.Code) {
                        this.productsByCode.set(p.Code.toUpperCase(), p);
                    }
                });
            }

            this.lastFetchTime = new Date(cached.timestamp).toLocaleString("vi-VN");
            this.isLoaded = this.products.size > 0;

            console.log(`[STANDARD-PRICE] Loaded ${this.products.size} products from IndexedDB cache`);
            console.log(`[STANDARD-PRICE] Cache age: ${Math.floor(age / 1000 / 60)} minutes`);

            return true;
        } catch (error) {
            console.error("[STANDARD-PRICE] Error loading cache:", error);
            return false;
        }
    }

    async saveToCache() {
        try {
            if (!this.db) {
                console.warn("[STANDARD-PRICE] Database not ready, skipping cache save");
                return;
            }

            const productsArray = Array.from(this.products.values());
            const cacheData = {
                key: this.CACHE_KEY,
                products: productsArray,
                timestamp: Date.now(),
            };

            await this.saveToIndexedDB(cacheData);
            this.lastFetchTime = new Date().toLocaleString("vi-VN");

            console.log(`[STANDARD-PRICE] Saved ${productsArray.length} products to IndexedDB cache`);
        } catch (error) {
            console.error("[STANDARD-PRICE] Error saving to IndexedDB:", error);
        }
    }

    // IndexedDB CRUD operations
    getFromIndexedDB(key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction([this.STORE_NAME], "readonly");
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    saveToIndexedDB(data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error("Database not ready"));
                return;
            }

            const transaction = this.db.transaction([this.STORE_NAME], "readwrite");
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    deleteFromIndexedDB(key) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }

            const transaction = this.db.transaction([this.STORE_NAME], "readwrite");
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Migrate old data from localStorage to IndexedDB
    async migrateFromLocalStorage() {
        try {
            const oldKey = "standard_price_cache_v3";
            const cached = localStorage.getItem(oldKey);

            if (!cached) return;

            console.log("[STANDARD-PRICE] Migrating from localStorage to IndexedDB...");

            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;

            // Only migrate if not expired
            if (age <= this.CACHE_DURATION && data.products) {
                // Load into Maps
                data.products.forEach(p => {
                    this.products.set(p.Id, p);
                    if (p.Code) {
                        this.productsByCode.set(p.Code.toUpperCase(), p);
                    }
                });

                this.lastFetchTime = new Date(data.timestamp).toLocaleString("vi-VN");
                this.isLoaded = this.products.size > 0;

                // Save to IndexedDB
                await this.saveToCache();

                console.log(`[STANDARD-PRICE] Migrated ${this.products.size} products from localStorage`);
            }

            // Remove from localStorage to free space
            localStorage.removeItem(oldKey);
            console.log("[STANDARD-PRICE] Cleared old localStorage cache");

        } catch (error) {
            console.error("[STANDARD-PRICE] Migration error:", error);
        }
    }

    // ========================================
    // FETCH FROM API
    // ========================================

    async fetchProducts(force = false) {
        // If already loaded and not forced, return
        if (this.isLoaded && !force) {
            console.log("[STANDARD-PRICE] Data already loaded");
            return this.products;
        }

        // If currently loading, wait for it
        if (this.isLoading) {
            console.log("[STANDARD-PRICE] Fetch already in progress, waiting...");
            return this.waitForLoad();
        }

        this.isLoading = true;
        let notificationId = null;

        try {
            // Show loading notification
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    "Đang tải danh sách giá vốn...",
                    "info",
                    0,
                    {
                        showOverlay: false,
                        persistent: true,
                        icon: "file-spreadsheet",
                        title: "Tải Giá Vốn",
                    }
                );
            }

            console.log("[STANDARD-PRICE] Fetching from API...");

            // Get auth headers
            const headers = await window.tokenManager.getAuthHeader();

            // POST request to get Excel file from ExportFileWithStandardPriceV2
            const response = await fetch(this.API_ENDPOINT, {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    model: { Active: "true" },
                    ids: "",
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Get blob data
            const blob = await response.blob();
            console.log(`[STANDARD-PRICE] Received Excel file: ${(blob.size / 1024).toFixed(2)} KB`);

            // Parse Excel
            const products = await this.parseExcelBlob(blob);

            if (products.length === 0) {
                throw new Error("No products found in Excel file");
            }

            // Clear and reload maps
            this.products.clear();
            this.productsByCode.clear();

            products.forEach(p => {
                this.products.set(p.Id, p);
                if (p.Code) {
                    this.productsByCode.set(p.Code.toUpperCase(), p);
                }
            });

            this.isLoaded = true;
            await this.saveToCache();

            // Success notification
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success(
                    `Đã tải ${products.length.toLocaleString("vi-VN")} sản phẩm với giá vốn`,
                    2000,
                    "Thành công"
                );
            }

            console.log(`[STANDARD-PRICE] Successfully loaded ${products.length} products`);
            return this.products;
        } catch (error) {
            console.error("[STANDARD-PRICE] Error fetching:", error);

            if (window.notificationManager) {
                if (notificationId) {
                    window.notificationManager.remove(notificationId);
                }
                window.notificationManager.error(
                    `Không thể tải giá vốn: ${error.message}`,
                    4000,
                    "Lỗi"
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
            return this.products;
        }

        throw new Error("Load timeout");
    }

    // ========================================
    // PARSE EXCEL FILE
    // Cấu trúc: Id(*) | Mã SP | Tên SP | Giá mua | Giá vốn(*)
    // ========================================

    async parseExcelBlob(blob) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: "array" });

                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                        if (jsonData.length < 2) {
                            throw new Error("Excel file is empty or invalid");
                        }

                        // Parse rows (skip header)
                        const products = [];
                        const headers = jsonData[0];

                        console.log("[STANDARD-PRICE] Excel structure:", {
                            sheet: workbook.SheetNames[0],
                            headers: headers,
                            totalRows: jsonData.length - 1,
                        });

                        for (let i = 1; i < jsonData.length; i++) {
                            const row = jsonData[i];

                            // Skip empty rows
                            if (!row || row.length === 0 || !row[0]) continue;

                            // Excel structure:
                            // Column 0 (A): Id (*) - Product ID
                            // Column 1 (B): Mã sản phẩm - Product Code
                            // Column 2 (C): Tên sản phẩm - Product Name
                            // Column 3 (D): Giá mua - Purchase Price
                            // Column 4 (E): Giá vốn (*) - Standard/Cost Price
                            const productId = parseInt(row[0]);
                            const productCode = row[1] || "";
                            const productName = row[2] || "";
                            const purchasePrice = parseFloat(row[3]) || 0;
                            const standardPrice = parseFloat(row[4]) || 0;

                            // Skip if no valid ID
                            if (!productId || isNaN(productId)) continue;

                            const product = {
                                Id: productId,
                                Code: productCode,
                                Name: productName,
                                PurchasePrice: purchasePrice, // Giá mua
                                StandardPrice: standardPrice, // Giá vốn
                                // Sử dụng giá vốn làm giá cơ sở để tính margin
                                CostPrice: standardPrice || purchasePrice,
                            };

                            products.push(product);
                        }

                        console.log(`[STANDARD-PRICE] Parsed ${products.length} products from Excel`);
                        resolve(products);
                    } catch (error) {
                        console.error("[STANDARD-PRICE] Error parsing Excel:", error);
                        reject(error);
                    }
                };

                reader.onerror = (error) => {
                    console.error("[STANDARD-PRICE] FileReader error:", error);
                    reject(error);
                };

                reader.readAsArrayBuffer(blob);
            } catch (error) {
                console.error("[STANDARD-PRICE] Error reading Excel blob:", error);
                reject(error);
            }
        });
    }

    // ========================================
    // LOOKUP METHODS
    // ========================================

    /**
     * Lấy thông tin sản phẩm theo ID
     * @param {number} productId
     * @returns {object|null}
     */
    getById(productId) {
        return this.products.get(parseInt(productId)) || null;
    }

    /**
     * Lấy thông tin sản phẩm theo Code
     * @param {string} code
     * @returns {object|null}
     */
    getByCode(code) {
        if (!code) return null;
        return this.productsByCode.get(code.toUpperCase()) || null;
    }

    /**
     * Lấy giá vốn của sản phẩm
     * @param {number|string} productIdOrCode
     * @returns {number|null}
     */
    getCostPrice(productIdOrCode) {
        let product = null;

        if (typeof productIdOrCode === 'number') {
            product = this.getById(productIdOrCode);
        } else if (typeof productIdOrCode === 'string') {
            // Try by code first, then by ID
            product = this.getByCode(productIdOrCode);
            if (!product) {
                const id = parseInt(productIdOrCode);
                if (!isNaN(id)) {
                    product = this.getById(id);
                }
            }
        }

        return product ? product.CostPrice : null;
    }

    /**
     * Lấy giá bán gốc (ListPrice) - cần kết hợp với productSearchManager
     * @param {number} productId
     * @returns {number|null}
     */
    getListPrice(productId) {
        // Giá bán lấy từ productSearchManager nếu có
        if (window.productSearchManager) {
            const excelProduct = window.productSearchManager.excelProducts.find(p => p.Id === productId);
            if (excelProduct && excelProduct.Price) {
                return excelProduct.Price;
            }
        }
        return null;
    }

    /**
     * Kiểm tra đã load dữ liệu chưa
     */
    isReady() {
        return this.isLoaded && this.products.size > 0;
    }

    /**
     * Lấy thống kê
     */
    getStats() {
        return {
            totalProducts: this.products.size,
            isLoaded: this.isLoaded,
            lastFetchTime: this.lastFetchTime,
            storageType: "IndexedDB",
            dbName: this.DB_NAME,
        };
    }

    /**
     * Clear cache và reload
     */
    async refresh() {
        await this.deleteFromIndexedDB(this.CACHE_KEY);
        this.products.clear();
        this.productsByCode.clear();
        this.isLoaded = false;
        return this.fetchProducts(true);
    }

    /**
     * Get storage size estimate
     */
    async getStorageEstimate() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                return {
                    usage: (estimate.usage / 1024 / 1024).toFixed(2) + " MB",
                    quota: (estimate.quota / 1024 / 1024).toFixed(2) + " MB",
                    percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2) + "%"
                };
            }
        } catch (e) {
            console.warn("[STANDARD-PRICE] Cannot estimate storage:", e);
        }
        return null;
    }
}

// Create global instance
window.standardPriceManager = new StandardPriceManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandardPriceManager;
}
