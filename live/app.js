// =====================================================
// CONFIGURATION
// =====================================================
const CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    MAX_CONCURRENT_LOADS: 4,
    BATCH_SIZE: 3,
    MAX_IMAGE_SIZE: 600,
    IMAGE_QUALITY: 0.7,
    UNIFORM_SIZE: 600,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,
    LAZY_LOAD_MARGIN: "50px 0px 100px 0px",
    ui: {
        toastDuration: 3000,
        animationDuration: 300,
        hoverDelay: 500,
    },
};

const AUTH_STORAGE_KEY = "loginindex_auth";
const uploadMetadata = { cacheControl: "public,max-age=31536000" };

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
};

// =====================================================
// AUTH MANAGER - Using Shared AuthManager from core-loader.js
// =====================================================
// AuthManager is now loaded from /js/shared-auth-manager.js via core-loader.js
// No need to redeclare it here

// =====================================================
// ENHANCED CACHE MANAGER WITH PERSISTENT STORAGE
// =====================================================
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.maxAge = CONFIG.CACHE_EXPIRY;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = "app_persistent_cache";
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

    invalidateBatch(batchName) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(`live/${batchName}`)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.saveToStorage();
        console.log(
            `Invalidated ${invalidated} cache entries for batch: ${batchName}`,
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

    invalidate() {
        const cleaned = this.cleanExpired();
        const stats = this.getStats();
        console.log(`Cache cleaned: ${cleaned} expired entries. Stats:`, stats);
    }
}

// =====================================================
// FIREBASE MANAGER
// =====================================================
class FirebaseManager {
    constructor() {
        this.app = null;
        this.storage = null;
        this.db = null;
        this.init();
    }

    init() {
        try {
            this.app = firebase.initializeApp(firebaseConfig);
            this.storage = firebase.storage();
            this.db = firebase.firestore();
            console.log("Firebase initialized");
        } catch (error) {
            console.error("Firebase init failed:", error);
            notificationManager.error(
                "Lỗi kết nối hệ thống",
                4000,
                "Lỗi Firebase",
            );
        }
    }

    getStorageRef() {
        return this.storage.ref();
    }

    async listFolder(path) {
        const cacheKey = `folder_${path}`;
        const cached = cacheManager.get(cacheKey, "folders");
        if (cached) {
            console.log(`📦 Sử dụng cache cho folder: ${path}`);
            return cached;
        }

        console.log(`☁️ Tải từ Firebase: ${path}`);
        try {
            const result = await this.getStorageRef().child(path).listAll();

            const folderData = {
                items: result.items.map((ref) => ({
                    fullPath: ref.fullPath,
                    name: ref.name,
                })),
                prefixes: result.prefixes.map((ref) => ({
                    fullPath: ref.fullPath,
                    name: ref.name,
                })),
                path,
            };

            cacheManager.set(cacheKey, folderData, "folders");
            console.log(`💾 Đã lưu vào cache: ${path}`);
            return folderData;
        } catch (error) {
            console.error(`Error listing ${path}:`, error);
            return { items: [], prefixes: [], path };
        }
    }

    async getImageUrl(imagePath) {
        const cacheKey = `url_${imagePath}`;
        const cached = cacheManager.get(cacheKey, "urls");
        if (cached) {
            return cached;
        }

        try {
            const imageRef = this.getStorageRef().child(imagePath);
            const url = await imageRef.getDownloadURL();

            cacheManager.set(cacheKey, url, "urls");
            return url;
        } catch (error) {
            console.error(`Error getting URL for ${imagePath}:`, error);
            return null;
        }
    }

    async uploadImage(file, path) {
        const imageRef = this.getStorageRef().child(path);
        const uploadTask = imageRef.put(file, uploadMetadata);

        return new Promise((resolve, reject) => {
            uploadTask.on(
                "state_changed",
                (snapshot) => {
                    const progress =
                        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log(`Upload: ${progress.toFixed(1)}%`);
                },
                (error) => reject(error),
                () => resolve(uploadTask.snapshot),
            );
        });
    }

    async deleteFolder(path) {
        try {
            const folderRef = this.getStorageRef().child(path);
            const result = await folderRef.listAll();
            let deletedCount = 0;

            for (let i = 0; i < result.items.length; i += CONFIG.BATCH_SIZE) {
                const batch = result.items.slice(i, i + CONFIG.BATCH_SIZE);
                await Promise.allSettled(
                    batch.map(async (fileRef) => {
                        try {
                            await fileRef.delete();
                            deletedCount++;
                            return true;
                        } catch (error) {
                            return false;
                        }
                    }),
                );

                if (i + CONFIG.BATCH_SIZE < result.items.length) {
                    const currentNotif = notificationManager.deleting(
                        `Đã xóa ${deletedCount}/${result.items.length} file...`,
                    );
                    await new Promise((r) => setTimeout(r, 200));
                }
            }

            return { success: true, deletedCount };
        } catch (error) {
            return { success: false, error };
        }
    }
}

// =====================================================
// LAZY LOAD MANAGER
// =====================================================
class LazyLoadManager {
    constructor() {
        this.imageQueue = [];
        this.loadingQueue = new Set();
        this.maxConcurrentLoads = CONFIG.MAX_CONCURRENT_LOADS;
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            {
                root: null,
                rootMargin: CONFIG.LAZY_LOAD_MARGIN,
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

    resetProgress() {
        this.loadingProgress = { loaded: 0, total: 0, failed: 0 };
    }
}

// =====================================================
// IMAGE UTILITIES
// =====================================================
class ImageUtils {
    static async compressImage(
        file,
        targetSize = CONFIG.UNIFORM_SIZE,
        quality = CONFIG.IMAGE_QUALITY,
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

    static createLazyImageElement(url, priority = "normal") {
        const wrapper = document.createElement("div");
        wrapper.className = "image-item";

        const img = document.createElement("img");
        img.className = "product-image lazy-image";
        if (url) {
            img.dataset.src = url;
        }
        img.alt = "Đang tải...";

        wrapper.appendChild(img);
        return wrapper;
    }
}

// =====================================================
// UI MANAGER
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
                    CONFIG.ui.hoverDelay,
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
// MAIN APPLICATION
// =====================================================
class ImageManagementApp {
    constructor() {
        this.firebase = null;
        this.lazyLoader = null;
        this.categories = ["shirt", "pants", "dress-set", "accessories"];
        this.pathMapping = {
            Áo: "ao",
            Quần: "quan",
            "Set và Đầm": "setvadam",
            PKGD: "pkgd",
        };
        this.currentCategory = "all";
        this.init();
    }

    async init() {
        if (!authManager.isAuthenticated()) {
            notificationManager.error(
                "Vui lòng đăng nhập để tiếp tục",
                3000,
                "Chưa xác thực",
            );
            setTimeout(() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = "../index.html";
            }, 1500);
            return;
        }

        try {
            this.firebase = new FirebaseManager();
            this.lazyLoader = new LazyLoadManager();
            this.setupEventListeners();
            await this.updateLiveBatchFilterDropdown();
            await this.loadImages();
        } catch (error) {
            console.error("App initialization error:", error);
            notificationManager.error("Lỗi khởi tạo hệ thống", 4000, "Lỗi");
        }
    }

    setupEventListeners() {
        const uploadForm = document.getElementById("uploadForm");
        if (uploadForm) {
            uploadForm.addEventListener("submit", (e) =>
                this.handleFormSubmit(e),
            );
        }

        const fileUploadArea = document.getElementById("fileUploadArea");
        const imageFileInput = document.getElementById("imageFileInput");
        if (fileUploadArea && imageFileInput) {
            fileUploadArea.addEventListener("click", () =>
                imageFileInput.click(),
            );
            imageFileInput.addEventListener("change", (e) =>
                this.handleFileSelect(e),
            );
        }

        const liveBatchFilter = document.getElementById("liveBatchFilter");
        if (liveBatchFilter) {
            liveBatchFilter.addEventListener("change", () => this.loadImages());
        }

        document.querySelectorAll(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                document
                    .querySelectorAll(".tab-btn")
                    .forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                this.currentCategory = btn.dataset.category;
                this.filterImagesByCategory();
            });
        });

        document
            .getElementById("btnShowUpload")
            ?.addEventListener("click", () => {
                document
                    .getElementById("uploadSection")
                    ?.classList.toggle("show");
            });

        document
            .getElementById("closeUpload")
            ?.addEventListener("click", () => {
                document
                    .getElementById("uploadSection")
                    ?.classList.remove("show");
            });

        document.getElementById("btnRefresh")?.addEventListener("click", () => {
            cacheManager.invalidate();
            notificationManager.info(
                "Đang làm mới dữ liệu...",
                1500,
                "Làm mới",
            );
            setTimeout(() => this.loadImages(), 500);
        });

        document
            .getElementById("btnClearCache")
            ?.addEventListener("click", () => {
                if (confirm("Xóa toàn bộ cache và tải lại từ Firebase?")) {
                    cacheManager.clear();
                    const stats = cacheManager.getStats();
                    notificationManager.success(
                        `Cache đã được xóa! Stats: ${stats.hitRate} hit rate`,
                        3000,
                        "Thành công",
                    );
                    setTimeout(() => this.loadImages(), 500);
                }
            });

        document
            .getElementById("btnDelete")
            ?.addEventListener("click", () => this.handleDelete());

        document.getElementById("btnReset")?.addEventListener("click", () => {
            document.getElementById("uploadForm")?.reset();
            document.getElementById("filePreview").innerHTML = "";
        });

        document.getElementById("menuToggle")?.addEventListener("click", () => {
            document.getElementById("sidebar")?.classList.toggle("active");
        });
    }

    handleFileSelect(e) {
        const files = e.target.files;
        const preview = document.getElementById("filePreview");
        preview.innerHTML = "";

        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement("div");
                div.className = "file-preview-item";
                div.innerHTML = `<img src="${e.target.result}" alt="${file.name}">`;
                preview.appendChild(div);
            };
            reader.readAsDataURL(file);
        });
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        if (!authManager.hasPermissionLevel(3)) {
            notificationManager.error(
                "Không có quyền upload",
                3000,
                "Truy cập bị từ chối",
            );
            return;
        }

        const category = document.getElementById("categorySelect")?.value;
        const liveBatch = document.getElementById("liveBatchInput")?.value;
        const files = document.getElementById("imageFileInput")?.files;

        if (!liveBatch || !category || !files || files.length === 0) {
            notificationManager.error(
                "Vui lòng điền đầy đủ thông tin",
                3000,
                "Thiếu thông tin",
            );
            return;
        }

        let notifId = notificationManager.uploading(0, files.length);

        try {
            const uploadPath = `live/${liveBatch}/${this.pathMapping[category]}/`;
            let uploaded = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const compressed = await ImageUtils.compressImage(file);
                await this.firebase.uploadImage(
                    compressed,
                    uploadPath + file.name,
                );
                uploaded++;

                notificationManager.remove(notifId);
                notifId = notificationManager.uploading(uploaded, files.length);
            }

            cacheManager.invalidateBatch(liveBatch);

            notificationManager.clearAll();
            notificationManager.success(
                `Đã tải lên ${uploaded} ảnh thành công!`,
                3000,
                "Hoàn thành",
            );
            setTimeout(() => window.location.reload(), 2000);
        } catch (error) {
            console.error("Upload error:", error);
            notificationManager.clearAll();
            notificationManager.error(
                "Không thể tải lên ảnh. Vui lòng thử lại",
                4000,
                "Lỗi upload",
            );
        }
    }

    async handleDelete() {
        if (!authManager.hasPermissionLevel(0)) {
            notificationManager.error(
                "Bạn không có quyền xóa dữ liệu",
                3000,
                "Truy cập bị từ chối",
            );
            return;
        }

        const selectedBatch = document.getElementById("liveBatchFilter")?.value;
        if (!selectedBatch || selectedBatch === "all") {
            notificationManager.warning(
                "Vui lòng chọn đợt live cụ thể để xóa",
                3000,
                "Chưa chọn đợt",
            );
            return;
        }

        if (!confirm(`Xóa đợt live ${selectedBatch}?`)) return;

        const notifId = notificationManager.deleting(
            `Đang xóa đợt ${selectedBatch}...`,
        );

        try {
            const result = await this.firebase.deleteFolder(
                `live/${selectedBatch}`,
            );

            notificationManager.remove(notifId);

            if (result.success) {
                cacheManager.invalidateBatch(selectedBatch);

                notificationManager.success(
                    `Đã xóa ${result.deletedCount} file thành công!`,
                    3000,
                    "Xóa thành công",
                );
                setTimeout(() => window.location.reload(), 2000);
            } else {
                notificationManager.error(
                    "Không thể xóa dữ liệu",
                    4000,
                    "Lỗi xóa",
                );
            }
        } catch (error) {
            notificationManager.remove(notifId);
            notificationManager.error(
                "Có lỗi xảy ra khi xóa",
                4000,
                "Lỗi hệ thống",
            );
        }
    }

    async updateLiveBatchFilterDropdown() {
        const filter = document.getElementById("liveBatchFilter");
        if (!filter) return;

        try {
            const liveFolder = await this.firebase.listFolder("live/");
            const batches = liveFolder.prefixes
                .map((f) => f.name)
                .sort()
                .reverse();

            batches.forEach((batch) => {
                const option = document.createElement("option");
                option.value = batch;
                option.textContent = batch;
                filter.appendChild(option);
            });

            document.getElementById("liveBatchInput").value = batches[0] || "1";
            document.getElementById("statLiveSessions").textContent =
                batches.length;
        } catch (error) {
            console.error("Error loading batches:", error);
        }
    }

    async loadImages() {
        const selectedBatch =
            document.getElementById("liveBatchFilter")?.value || "all";
        const imageGrid = document.getElementById("imageGrid");
        const emptyState = document.getElementById("emptyState");

        imageGrid.innerHTML = "";
        this.lazyLoader.resetProgress();

        let notifId = notificationManager.info("Đang tải...", 0, "Khởi tạo");

        try {
            console.log("=== BẮT ĐẦU TẢI ẢNH ===");

            const liveFolder = await this.firebase.listFolder("live/");
            const batches =
                selectedBatch === "all"
                    ? liveFolder.prefixes.map((f) => f.name)
                    : [selectedBatch];

            let totalImages = 0;

            // BƯỚC 1: Tạo placeholders ngay lập tức
            for (const batch of batches) {
                for (const cat of this.categories) {
                    const path = `live/${batch}/${this.getCategoryPath(cat)}/`;
                    const folder = await this.firebase.listFolder(path);

                    for (const item of folder.items) {
                        const wrapper = ImageUtils.createLazyImageElement(null);
                        wrapper.dataset.category = cat;
                        wrapper.dataset.imagePath = item.fullPath;
                        imageGrid.appendChild(wrapper);
                        totalImages++;
                    }
                }
            }

            // Hiển thị UI ngay
            document.getElementById("statTotalImages").textContent =
                totalImages;
            emptyState.style.display = totalImages === 0 ? "flex" : "none";
            this.filterImagesByCategory();

            console.log(`📊 Đã tạo ${totalImages} placeholders`);

            // BƯỚC 2: Load URLs progressively
            notificationManager.remove(notifId);
            notifId = notificationManager.info(
                `Đang tải 0/${totalImages}`,
                0,
                "Tải ảnh",
            );

            let loadedCount = 0;
            const allWrappers = imageGrid.querySelectorAll(".image-item");

            const loadPromises = Array.from(allWrappers).map(
                async (wrapper) => {
                    const imagePath = wrapper.dataset.imagePath;
                    const imgElement = wrapper.querySelector(".product-image");

                    try {
                        const url = await this.firebase.getImageUrl(imagePath);

                        if (url && imgElement) {
                            imgElement.dataset.src = url;
                            this.lazyLoader.observe(imgElement);
                        }

                        loadedCount++;

                        if (
                            loadedCount % 10 === 0 ||
                            loadedCount === totalImages
                        ) {
                            const percent = Math.round(
                                (loadedCount / totalImages) * 100,
                            );
                            notificationManager.remove(notifId);
                            notifId = notificationManager.info(
                                `Đã tải ${loadedCount}/${totalImages} (${percent}%)`,
                                0,
                                "Tải ảnh",
                            );
                        }
                    } catch (error) {
                        console.error(`Error loading ${imagePath}:`, error);
                        if (imgElement) {
                            imgElement.classList.add("lazy-error");
                        }
                    }
                },
            );

            await Promise.allSettled(loadPromises);

            notificationManager.remove(notifId);

            const stats = cacheManager.getStats();
            notificationManager.success(
                `${totalImages} ảnh (Cache: ${stats.hitRate})`,
                2000,
                "Hoàn tất",
            );

            console.log("=== HOÀN TẤT ===");
            console.log("📈 Cache Stats:", stats);
        } catch (error) {
            console.error("Load error:", error);
            notificationManager.remove(notifId);
            notificationManager.error(
                "Không thể tải ảnh. Vui lòng thử lại",
                4000,
                "Lỗi",
            );
        }
    }

    getCategoryPath(category) {
        const map = {
            shirt: "ao",
            pants: "quan",
            "dress-set": "setvadam",
            accessories: "pkgd",
        };
        return map[category] || category;
    }

    filterImagesByCategory() {
        const images = document.querySelectorAll(".image-item");
        images.forEach((item) => {
            if (this.currentCategory === "all") {
                item.style.display = "block";
            } else {
                item.style.display =
                    item.dataset.category === this.currentCategory
                        ? "block"
                        : "none";
            }
        });
    }
}

// =====================================================
// INITIALIZE
// =====================================================
let notificationManager;
let authManager;
let cacheManager;
let uiManager;
let app;

// Wait for both DOM and core utilities to be ready
function initializeApp() {
    notificationManager = new NotificationManager();
    // Initialize shared AuthManager with configuration
    authManager = new AuthManager({
        storageKey: AUTH_STORAGE_KEY,
        redirectUrl: "../index.html",
        sessionDuration: CONFIG.SESSION_TIMEOUT
    });
    cacheManager = new CacheManager();
    uiManager = new UIManager();
    app = new ImageManagementApp();

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// Track readiness states
let domReady = false;
let coreReady = false;

function checkAndInitialize() {
    if (domReady && coreReady) {
        initializeApp();
    }
}

// Listen for DOM ready
document.addEventListener("DOMContentLoaded", function () {
    domReady = true;
    checkAndInitialize();
});

// Listen for core utilities loaded
document.addEventListener("coreUtilitiesLoaded", function () {
    coreReady = true;
    checkAndInitialize();
});

// In case core utilities are already loaded
if (window.CORE_UTILITIES_LOADED) {
    coreReady = true;
}
