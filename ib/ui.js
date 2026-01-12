// =====================================================
// UI MANAGEMENT WITH NOTIFICATION SYSTEM
// =====================================================

class UIManager {
    constructor() {
        this.notificationManager = null;
        this.imageHoverOverlay = document.getElementById("imageHoverOverlay");
        this.hoverImage = document.getElementById("hoverImage");

        // Wait for NotificationManager to be available
        this.initNotificationManager();
        this.initializeImageHover();
        this.initializeOverlayClose();
    }

    // Initialize notification manager
    initNotificationManager() {
        if (typeof NotificationManager !== "undefined") {
            this.notificationManager = new NotificationManager();
        } else {
            // Retry after a short delay if not loaded yet
            setTimeout(() => this.initNotificationManager(), 100);
        }
    }

    // Show loading message
    showLoading(message = "Đang tải...") {
        if (this.notificationManager) {
            return this.notificationManager.loading(message);
        }
    }

    // Show success message
    showSuccess(message = "Thành công!", duration = 2000) {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
            return this.notificationManager.success(message, duration);
        }
    }

    // Show error message
    showError(message = "Có lỗi xảy ra!", duration = 4000) {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
            return this.notificationManager.error(message, duration);
        }
    }

    // Show warning message
    showWarning(message, duration = 3000) {
        if (this.notificationManager) {
            return this.notificationManager.warning(message, duration);
        }
    }

    // Show info message
    showInfo(message, duration = 3000) {
        if (this.notificationManager) {
            return this.notificationManager.info(message, duration);
        }
    }

    // Hide alert/notification
    hideAlert() {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
        }
    }

    // Show uploading progress
    showUploading(current, total) {
        if (this.notificationManager) {
            return this.notificationManager.uploading(current, total);
        }
    }

    // Show deleting notification
    showDeleting(message = "Đang xóa...") {
        if (this.notificationManager) {
            return this.notificationManager.deleting(message);
        }
    }

    // Initialize enhanced image hover functionality
    initializeImageHover() {
        let hoverTimeout;

        // Event delegation for better performance
        document.addEventListener("mouseover", (e) => {
            if (e.target.classList.contains("product-image")) {
                hoverTimeout = setTimeout(() => {
                    this.showImageHover(e.target.src, e);
                }, CONFIG.ui.hoverDelay);
            }
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("product-image")) {
                clearTimeout(hoverTimeout);
                this.hideImageHover();
            }
        });

        // Click to show full overlay
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("product-image")) {
                e.preventDefault();
                this.showImageOverlay(e.target.src);
            }
        });
    }

    // Show image hover preview
    showImageHover(imageSrc, event) {
        if (!this.imageHoverOverlay || Utils.isMobile()) return;

        // Create or update preview image
        let previewImg = document.querySelector(".image-preview-hover");
        if (!previewImg) {
            previewImg = Utils.createElement("img", {
                className: "image-preview-hover",
                src: imageSrc,
            });
            document.body.appendChild(previewImg);
        } else {
            previewImg.src = imageSrc;
        }

        // Position the preview
        const rect = event.target.getBoundingClientRect();
        const optimalSize = Utils.getOptimalImageSize();

        previewImg.style.display = "block";
        previewImg.style.maxWidth = optimalSize.width + "px";
        previewImg.style.maxHeight = optimalSize.height + "px";
        previewImg.style.position = "fixed";
        previewImg.style.zIndex = "1500";
        previewImg.style.pointerEvents = "none";
        previewImg.style.borderRadius = "var(--radius-lg)";
        previewImg.style.boxShadow = "var(--shadow-xl)";

        // Position to avoid viewport edges
        let left = rect.right + 10;
        let top = rect.top;

        if (left + optimalSize.width > window.innerWidth) {
            left = rect.left - optimalSize.width - 10;
        }

        if (top + optimalSize.height > window.innerHeight) {
            top = window.innerHeight - optimalSize.height - 10;
        }

        previewImg.style.left = Math.max(10, left) + "px";
        previewImg.style.top = Math.max(10, top) + "px";
    }

    // Hide image hover preview
    hideImageHover() {
        const previewImg = document.querySelector(".image-preview-hover");
        if (previewImg) {
            previewImg.style.display = "none";
        }
    }

    // Show full image overlay
    showImageOverlay(imageSrc) {
        if (!this.imageHoverOverlay || !this.hoverImage) return;

        this.hoverImage.src = imageSrc;
        this.imageHoverOverlay.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    // Hide image overlay
    hideImageOverlay() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.style.display = "none";
            document.body.style.overflow = "";
        }
    }

    // Initialize overlay close functionality
    initializeOverlayClose() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.addEventListener("click", (e) => {
                if (e.target === this.imageHoverOverlay) {
                    this.hideImageOverlay();
                }
            });
        }

        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.hideImageOverlay();
            }
        });
    }

    // Update performance indicator
    updatePerformanceIndicator(loadTime) {
        console.log(`Performance: ${loadTime.toFixed(2)}ms`);
    }

    // Animate element entrance
    animateIn(element, animation = "fadeIn") {
        if (!element) return;

        element.style.animation = `${animation} ${CONFIG.ui.animationDuration}ms ease-in-out`;
        element.addEventListener(
            "animationend",
            () => {
                element.style.animation = "";
            },
            { once: true },
        );
    }

    // Show/hide form with animation
    toggleForm(form, show) {
        if (!form) return;

        if (show) {
            form.style.display = "block";
            this.animateIn(form);
        } else {
            form.style.animation = `fadeOut ${CONFIG.ui.animationDuration}ms ease-in-out`;
            setTimeout(() => {
                form.style.display = "none";
                form.style.animation = "";
            }, CONFIG.ui.animationDuration);
        }
    }

    // Highlight element temporarily
    highlightElement(element, duration = 2000) {
        if (!element) return;

        const originalBackground = element.style.background;
        element.style.background = "rgba(102, 126, 234, 0.1)";
        element.style.transition = "background 0.3s ease";

        setTimeout(() => {
            element.style.background = originalBackground;
            setTimeout(() => {
                element.style.transition = "";
            }, 300);
        }, duration);
    }

    // Update stats
    updateStats(data) {
        if (!Array.isArray(data)) return;

        const total = data.length;
        const ao = data.filter((item) => item.phanLoai === "Áo").length;
        const quan = data.filter((item) => item.phanLoai === "Quần").length;
        const other = total - ao - quan;

        const statElements = {
            total: document.getElementById("statTotalInbox"),
            ao: document.getElementById("statAo"),
            quan: document.getElementById("statQuan"),
            other: document.getElementById("statOther"),
        };

        if (statElements.total) statElements.total.textContent = total;
        if (statElements.ao) statElements.ao.textContent = ao;
        if (statElements.quan) statElements.quan.textContent = quan;
        if (statElements.other) statElements.other.textContent = other;

        // Initialize Lucide icons if needed
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Create global UI manager instance
window.uiManager = new UIManager();

// Global functions for backward compatibility
window.showLoading = (message) => uiManager.showLoading(message);
window.showSuccess = (message) => uiManager.showSuccess(message);
window.showError = (message) => uiManager.showError(message);
window.hideFloatingAlert = () => uiManager.hideAlert();
