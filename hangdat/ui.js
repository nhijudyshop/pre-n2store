// =====================================================
// UI MANAGEMENT WITH ENHANCED HOVER
// =====================================================

class UIManager {
    constructor() {
        this.notificationManager = null;
        this.imageHoverOverlay = document.getElementById("imageHoverOverlay");
        this.hoverImage = document.getElementById("hoverImage");
        this.currentHoverPreview = null;

        this.initNotificationManager();
        this.initializeImageHover();
        this.initializeOverlayClose();
    }

    // Initialize notification manager
    initNotificationManager() {
        if (typeof NotificationManager !== "undefined") {
            this.notificationManager = new NotificationManager();
        } else {
            setTimeout(() => this.initNotificationManager(), 100);
        }
    }

    // Show loading message
    showLoading(message = "Đang tải...") {
        if (this.notificationManager) {
            return this.notificationManager.loading(message);
        }
    }

    showSuccess(message = "Thành công!", duration = 2000) {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
            return this.notificationManager.success(message, duration);
        }
    }

    showError(message = "Có lỗi xảy ra!", duration = 4000) {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
            return this.notificationManager.error(message, duration);
        }
    }

    showWarning(message, duration = 3000) {
        if (this.notificationManager) {
            return this.notificationManager.warning(message, duration);
        }
    }

    showInfo(message, duration = 3000) {
        if (this.notificationManager) {
            return this.notificationManager.info(message, duration);
        }
    }

    hideAlert() {
        if (this.notificationManager) {
            this.notificationManager.clearAll();
        }
    }

    showUploading(current, total) {
        if (this.notificationManager) {
            return this.notificationManager.uploading(current, total);
        }
    }

    showDeleting(message = "Đang xóa...") {
        if (this.notificationManager) {
            return this.notificationManager.deleting(message);
        }
    }

    // ENHANCED: Initialize image hover with smooth animations
    initializeImageHover() {
        let hoverTimeout;
        let currentTarget = null;

        // Mouseover handler - show preview
        document.addEventListener("mouseover", (e) => {
            if (e.target.classList.contains("product-image")) {
                currentTarget = e.target;

                // Clear any existing timeout
                clearTimeout(hoverTimeout);

                // Show preview after delay
                hoverTimeout = setTimeout(() => {
                    if (currentTarget === e.target) {
                        this.showImageHoverPreview(e.target.src, e);
                    }
                }, CONFIG.ui.hoverDelay);
            }
        });

        // Mouseout handler - hide preview
        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("product-image")) {
                clearTimeout(hoverTimeout);
                currentTarget = null;
                this.hideImageHoverPreview();
            }
        });

        // Click handler - show full overlay
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("product-image")) {
                e.preventDefault();
                this.showImageOverlay(e.target.src);
            }
        });

        // Mouse move handler - update preview position
        document.addEventListener("mousemove", (e) => {
            if (
                this.currentHoverPreview &&
                this.currentHoverPreview.style.display === "block"
            ) {
                this.updateHoverPosition(e);
            }
        });
    }

    // ENHANCED: Show image hover preview with smooth animation
    showImageHoverPreview(imageSrc, event) {
        // Don't show on mobile
        if (Utils.isMobile()) return;

        // Create or get preview element
        if (!this.currentHoverPreview) {
            this.currentHoverPreview = Utils.createElement("img", {
                className: "image-preview-hover",
            });
            document.body.appendChild(this.currentHoverPreview);
        }

        // Set image source
        this.currentHoverPreview.src = imageSrc;
        this.currentHoverPreview.style.display = "block";

        // Get optimal size
        const optimalSize = Utils.getOptimalImageSize();
        this.currentHoverPreview.style.maxWidth = optimalSize.width + "px";
        this.currentHoverPreview.style.maxHeight = optimalSize.height + "px";

        // Position preview
        this.updateHoverPosition(event);

        // Add show class for animation
        requestAnimationFrame(() => {
            this.currentHoverPreview.classList.add("show");
        });
    }

    // Update hover preview position
    updateHoverPosition(event) {
        if (!this.currentHoverPreview) return;

        const preview = this.currentHoverPreview;
        const optimalSize = Utils.getOptimalImageSize();

        // Calculate position (offset from cursor)
        let left = event.clientX + 20;
        let top = event.clientY + 20;

        // Adjust if preview would go off-screen
        if (left + optimalSize.width > window.innerWidth) {
            left = event.clientX - optimalSize.width - 20;
        }

        if (top + optimalSize.height > window.innerHeight) {
            top = window.innerHeight - optimalSize.height - 20;
        }

        // Ensure minimum margins
        left = Math.max(10, left);
        top = Math.max(10, top);

        preview.style.left = left + "px";
        preview.style.top = top + "px";
    }

    // Hide image hover preview
    hideImageHoverPreview() {
        if (this.currentHoverPreview) {
            this.currentHoverPreview.classList.remove("show");
            setTimeout(() => {
                if (this.currentHoverPreview) {
                    this.currentHoverPreview.style.display = "none";
                }
            }, 300);
        }
    }

    // Show full image overlay
    showImageOverlay(imageSrc) {
        if (!this.imageHoverOverlay || !this.hoverImage) return;

        this.hoverImage.src = imageSrc;
        this.imageHoverOverlay.style.display = "flex";
        document.body.style.overflow = "hidden";

        // Hide hover preview when showing full overlay
        this.hideImageHoverPreview();
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
                if (
                    e.target === this.imageHoverOverlay ||
                    e.target === this.hoverImage
                ) {
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
