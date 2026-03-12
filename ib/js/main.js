// =====================================================
// MAIN APPLICATION INITIALIZATION - MODERN VERSION
// =====================================================

class InboxApp {
    constructor() {
        this.isInitialized = false;
        this.startTime = performance.now();
    }

    // Initialize the application
    async init() {
        if (this.isInitialized) return;

        try {
            console.log("Initializing Modern Inbox Management System...");

            // Check authentication first
            if (!this.checkAuthentication()) {
                return;
            }

            // Update UI based on user
            this.updateUserInterface();

            // Initialize performance monitoring
            this.initializePerformanceMonitoring();

            // Setup global event listeners
            this.setupGlobalEventListeners();

            // Initialize data with migration
            await this.initializeData();

            // Mark as initialized
            this.isInitialized = true;

            // Log successful initialization
            const initTime = performance.now() - this.startTime;
            console.log(
                `Modern Inbox System initialized in ${initTime.toFixed(2)}ms`,
            );

            // Initialize Lucide icons
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        } catch (error) {
            console.error("Failed to initialize application:", error);
            if (uiManager) {
                uiManager.showError(
                    "Lỗi khởi tạo ứng dụng. Vui lòng tải lại trang.",
                );
            }
        }
    }

    // Check authentication
    checkAuthentication() {
        const auth = authManager.getAuthState();
        if (!authManager.isAuthenticated()) {
            console.log("User not authenticated, redirecting...");
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return false;
        }

        console.log("User authenticated:", auth);
        return true;
    }

    // Update UI based on user
    updateUserInterface() {
        const auth = authManager.getAuthState();

        // Update breadcrumb
        const breadcrumb = document.querySelector(".breadcrumb span");
        if (breadcrumb && auth && auth.userType) {
            breadcrumb.textContent = `Check Inbox Khách Hàng`;
        }

        // Update form permissions
        if (window.formHandler) {
            window.formHandler.updateFormPermissions();
        }
    }

    // Initialize performance monitoring
    initializePerformanceMonitoring() {
        // Monitor page load performance
        if (performance && performance.timing) {
            window.addEventListener("load", () => {
                const loadTime =
                    performance.timing.loadEventEnd -
                    performance.timing.navigationStart;
                console.log("Page load time:", loadTime + "ms");
            });
        }

        // Monitor memory usage
        if (performance.memory) {
            setInterval(() => {
                const memInfo = performance.memory;
                if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
                    console.warn("High memory usage detected");
                    this.cleanupMemory();
                }
            }, 60000); // Check every minute
        }
    }

    // Setup global event listeners
    setupGlobalEventListeners() {
        // Refresh button
        const btnRefresh = document.getElementById("btnRefresh");
        if (btnRefresh) {
            btnRefresh.addEventListener("click", () => {
                if (window.tableManager) {
                    window.tableManager.forceRefreshData();
                }
            });
        }

        // Global error handler
        window.addEventListener("error", this.handleGlobalError.bind(this));

        // Cleanup on page unload
        window.addEventListener("beforeunload", this.cleanup.bind(this));

        // Handle visibility change
        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange.bind(this),
        );

        // Handle online/offline status
        window.addEventListener("online", () => {
            if (uiManager) {
                uiManager.showSuccess("Kết nối mạng đã được khôi phục");
            }
        });

        window.addEventListener("offline", () => {
            if (uiManager) {
                uiManager.showError("Mất kết nối mạng");
            }
        });

        // Keyboard shortcuts
        document.addEventListener(
            "keydown",
            this.handleKeyboardShortcuts.bind(this),
        );

        console.log("Global event listeners setup complete");
    }

    // Handle keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Ctrl+R for refresh (prevent default browser refresh)
        if (e.ctrlKey && e.key === "r") {
            e.preventDefault();
            if (window.tableManager) {
                window.tableManager.forceRefreshData();
            }
        }

        // Ctrl+N for new form
        if (e.ctrlKey && e.key === "n" && authManager.hasPagePermission('ib')) {
            e.preventDefault();
            if (window.formHandler) {
                window.formHandler.toggleForm();
            }
        }

        // Esc to close modals
        if (e.key === "Escape") {
            if (uiManager) {
                uiManager.hideAlert();
                uiManager.hideImageOverlay();
            }
        }
    }

    // Initialize data with migration
    async initializeData() {
        if (window.tableManager) {
            await window.tableManager.initializeWithMigration();
        }
    }

    // Handle global errors
    handleGlobalError(e) {
        console.error("Global error:", e.error);

        // Don't show error for script loading issues
        if (e.filename && e.filename.includes(".js")) {
            console.warn("Script loading error, but continuing...");
            return;
        }

        if (uiManager) {
            uiManager.showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
        }
    }

    // Handle visibility change
    handleVisibilityChange() {
        if (document.hidden) {
            console.log("Page hidden");
        } else {
            console.log("Page visible");

            // Refresh cache if expired
            const cacheStatus = cacheManager.getCacheStatus();
            if (cacheStatus.status === "expired") {
                console.log("Cache expired, refreshing...");
                if (window.tableManager) {
                    window.tableManager.forceRefreshData();
                }
            }
        }
    }

    // Cleanup memory
    cleanupMemory() {
        // Clear cache if too large
        const cacheStatus = cacheManager.getCacheStatus();
        if (cacheStatus.size > 1000) {
            console.log("Cleaning up large cache...");
            cacheManager.invalidateCache();
        }

        // Clean up blob URLs
        const images = document.querySelectorAll('img[src^="blob:"]');
        images.forEach((img) => {
            URL.revokeObjectURL(img.src);
        });

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    // General cleanup
    cleanup() {
        this.cleanupMemory();

        // Clear image handler data
        if (window.imageHandler) {
            window.imageHandler.clearData();
        }

        console.log("Application cleanup completed");
    }

    // Get application status
    getStatus() {
        return {
            initialized: this.isInitialized,
            authenticated: authManager.isAuthenticated(),
            cacheStatus: cacheManager.getCacheStatus(),
            loadTime: performance.now() - this.startTime,
            userInfo: authManager.getAuthState(),
        };
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", async function () {
    console.log("DOM Content Loaded");

    // Wait a bit for all dependencies to load
    setTimeout(async () => {
        // Create global app instance
        window.inboxApp = new InboxApp();

        // Initialize the application
        await window.inboxApp.init();

        // Initialize Lucide icons one more time after everything is loaded
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Expose debugging interface
        window.inboxDebug = {
            app: window.inboxApp,
            auth: authManager,
            cache: cacheManager,
            ui: uiManager,
            table: window.tableManager,
            form: window.formHandler,
            image: window.imageHandler,
            utils: Utils,
            config: CONFIG,

            // Debug functions
            getStatus: () => window.inboxApp.getStatus(),
            clearCache: () => cacheManager.invalidateCache(),
            refreshData: () => window.tableManager.forceRefreshData(),
            cleanup: () => window.inboxApp.cleanup(),
            reloadIcons: () => {
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            },
        };

        console.log("Application ready. Debug interface: window.inboxDebug");
    }, 500);
});

// Handle unhandled promise rejections
window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);

    // Don't show UI error for every promise rejection
    if (e.reason && e.reason.message && !e.reason.message.includes("Network")) {
        if (uiManager) {
            uiManager.showError("Có lỗi xảy ra trong quá trình xử lý dữ liệu");
        }
    }

    // Prevent default handling
    e.preventDefault();
});

console.log("Modern Inbox Management System loaded");
