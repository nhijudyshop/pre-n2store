// =====================================================
// IMAGE MANAGEMENT SYSTEM - REUSABLE MODULE
// File: image-system.js
// =====================================================

// Default configuration - có thể override khi khởi tạo
const DEFAULT_CONFIG = {
    CACHE_EXPIRY: 30 * 60 * 1000,
    MAX_CONCURRENT_LOADS: 4,
    MAX_IMAGE_SIZE: 600,
    IMAGE_QUALITY: 0.7,
    UNIFORM_SIZE: 600,
    LAZY_LOAD_MARGIN: "50px 0px 100px 0px",
};

// =====================================================
// PERSISTENT CACHE MANAGER
// =====================================================
class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || DEFAULT_CONFIG.CACHE_EXPIRY;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "app_persistent_cache";
        this.saveTimeout = null;
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`💾 Đã lưu ${cacheData.length} items vào localStorage`);
        } catch (error) {
            console.warn("Không thể lưu cache:", error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            console.log(`📦 Đã load ${validCount} items từ localStorage`);
        } catch (error) {
            console.warn("Không thể load cache:", error);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`✔ Cache HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        console.log(`✗ Cache MISS: ${cacheKey}`);
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) this.cache.delete(key);
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
        this.stats = { hits: 0, misses: 0 };
    }

    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.saveToStorage();
        }
        return cleaned;
    }

    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.saveToStorage();
        console.log(
            `Invalidated ${invalidated} cache entries matching: ${pattern}`,
        );
        return invalidated;
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate =
            total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            storageSize: this.getStorageSize(),
        };
    }

    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return "0 KB";
            const sizeKB = (stored.length / 1024).toFixed(2);
            return `${sizeKB} KB`;
        } catch {
            return "N/A";
        }
    }
}

// =====================================================
// LAZY LOAD MANAGER
// =====================================================
class LazyLoadManager {
    constructor(config = {}) {
        this.imageQueue = [];
        this.loadingQueue = new Set();
        this.maxConcurrentLoads =
            config.MAX_CONCURRENT_LOADS || DEFAULT_CONFIG.MAX_CONCURRENT_LOADS;
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            {
                root: null,
                rootMargin:
                    config.LAZY_LOAD_MARGIN || DEFAULT_CONFIG.LAZY_LOAD_MARGIN,
                threshold: [0, 0.1],
            },
        );
    }

    handleIntersection(entries) {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const priority = img.dataset.priority === "high" ? 0 : 1;
                this.queueImageLoad(img, priority);
                this.observer.unobserve(img);
            }
        });
        this.processQueue();
    }

    queueImageLoad(img, priority = 1) {
        if (!img.dataset.src) {
            console.warn("Skipping image with no URL set");
            return;
        }

        const imageData = {
            element: img,
            url: img.dataset.src,
            priority,
            id: Math.random().toString(36).substr(2, 9),
        };

        if (priority === 0) {
            this.imageQueue.unshift(imageData);
        } else {
            this.imageQueue.push(imageData);
        }

        this.loadingProgress.total++;
        this.processQueue();
    }

    async processQueue() {
        while (
            this.imageQueue.length > 0 &&
            this.loadingQueue.size < this.maxConcurrentLoads
        ) {
            const imageData = this.imageQueue.shift();
            this.loadingQueue.add(imageData.id);
            this.loadImage(imageData);
        }
    }

    async loadImage(imageData) {
        const { element, url, id } = imageData;

        try {
            element.classList.add("lazy-loading");
            const img = new Image();

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("Timeout")),
                    15000,
                );
                img.onload = () => {
                    clearTimeout(timeout);
                    element.src = url;
                    element.classList.remove("lazy-loading");
                    element.classList.add("lazy-loaded");
                    this.loadingProgress.loaded++;
                    resolve();
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    element.classList.add("lazy-error");
                    this.loadingProgress.failed++;
                    reject();
                };
                img.src = url;
            });
        } catch (error) {
            console.error("Load error:", error);
        } finally {
            this.loadingQueue.delete(id);
            this.processQueue();
        }
    }

    observe(element, priority = "normal") {
        element.dataset.priority = priority;
        this.observer.observe(element);
    }

    unobserve(element) {
        this.observer.unobserve(element);
    }

    disconnect() {
        this.observer.disconnect();
    }

    resetProgress() {
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };
    }

    getProgress() {
        return { ...this.loadingProgress };
    }
}

// =====================================================
// IMAGE UTILITIES
// =====================================================
class ImageUtils {
    static async compressImage(
        file,
        targetSize = DEFAULT_CONFIG.UNIFORM_SIZE,
        quality = DEFAULT_CONFIG.IMAGE_QUALITY,
    ) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    canvas.width = targetSize;
                    canvas.height = targetSize;

                    const scale = Math.max(
                        targetSize / img.width,
                        targetSize / img.height,
                    );

                    const scaledWidth = img.width * scale;
                    const scaledHeight = img.height * scale;

                    const offsetX = (targetSize - scaledWidth) / 2;
                    const offsetY = (targetSize - scaledHeight) / 2;

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";

                    ctx.fillStyle = "#FFFFFF";
                    ctx.fillRect(0, 0, targetSize, targetSize);

                    ctx.drawImage(
                        img,
                        offsetX,
                        offsetY,
                        scaledWidth,
                        scaledHeight,
                    );

                    canvas.toBlob(
                        (blob) => {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, ".jpg"),
                                { type: "image/jpeg" },
                            );

                            console.log(
                                `Nén: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`,
                            );
                            resolve(compressedFile);
                        },
                        "image/jpeg",
                        quality,
                    );
                };
            };
        });
    }

    static createLazyImageElement(url, className = "product-image") {
        const wrapper = document.createElement("div");
        wrapper.className = "image-item";

        const img = document.createElement("img");
        img.className = `${className} lazy-image`;
        if (url) {
            img.dataset.src = url;
        }
        img.alt = "Đang tải...";

        wrapper.appendChild(img);
        return wrapper;
    }

    static async loadImagePreview(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    static validateImageFile(file, maxSize = 10 * 1024 * 1024) {
        const validTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ];

        if (!validTypes.includes(file.type)) {
            return { valid: false, error: "Định dạng file không hợp lệ" };
        }

        if (file.size > maxSize) {
            return { valid: false, error: "File quá lớn (tối đa 10MB)" };
        }

        return { valid: true };
    }
}

// =====================================================
// UI MANAGER (Optional - có thể không cần cho mọi page)
// =====================================================
class UIManager {
    constructor() {
        this.imageHoverOverlay = document.getElementById("imageHoverOverlay");
        this.hoverImage = document.getElementById("hoverImage");
        this.initializeImageHover();
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    initializeImageHover() {
        let hoverTimeout;

        document.addEventListener("mouseover", (e) => {
            if (e.target.classList.contains("product-image")) {
                hoverTimeout = setTimeout(
                    () => this.showImageHover(e.target.src, e),
                    500,
                );
            }
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("product-image")) {
                clearTimeout(hoverTimeout);
                this.hideImageHover();
            }
        });

        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("product-image")) {
                e.preventDefault();
                this.showImageOverlay(e.target.src);
            }
        });

        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.addEventListener("click", (e) => {
                if (e.target === this.imageHoverOverlay)
                    this.hideImageOverlay();
            });
        }

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.hideImageOverlay();
        });
    }

    showImageHover(imageSrc, event) {
        if (this.isMobile()) return;

        let previewImg = document.querySelector(".image-preview-hover");
        if (!previewImg) {
            previewImg = document.createElement("img");
            previewImg.className = "image-preview-hover";
            document.body.appendChild(previewImg);
        }

        previewImg.src = imageSrc;
        previewImg.style.display = "block";

        const rect = event.target.getBoundingClientRect();
        let left = rect.right + 10;
        if (left + 400 > window.innerWidth) left = rect.left - 410;

        previewImg.style.left = Math.max(10, left) + "px";
        previewImg.style.top = Math.max(10, rect.top) + "px";
    }

    hideImageHover() {
        const previewImg = document.querySelector(".image-preview-hover");
        if (previewImg) previewImg.style.display = "none";
    }

    showImageOverlay(imageSrc) {
        if (!this.imageHoverOverlay) return;
        this.hoverImage.src = imageSrc;
        this.imageHoverOverlay.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    hideImageOverlay() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.style.display = "none";
            document.body.style.overflow = "";
        }
    }
}

// =====================================================
// EXPORT FOR USE
// =====================================================
// Nếu dùng ES6 modules:
// export { CacheManager, LazyLoadManager, ImageUtils, UIManager, DEFAULT_CONFIG };

// Nếu dùng global scope (thêm vào window):
if (typeof window !== "undefined") {
    window.ImageSystem = {
        CacheManager,
        LazyLoadManager,
        ImageUtils,
        UIManager,
        DEFAULT_CONFIG,
    };
}
