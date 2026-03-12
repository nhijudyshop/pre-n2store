// =====================================================
// ENHANCED UI MANAGEMENT WITH IMPROVED IMAGE HOVER
// =====================================================

class UIManager {
    constructor() {
        this.floatingAlert = document.getElementById("floatingAlert");
        this.alertText = this.floatingAlert?.querySelector(".alert-text");
        this.loadingSpinner =
            this.floatingAlert?.querySelector(".loading-spinner");
        this.copyNotification = document.getElementById("copyNotification");
        this.imageHoverOverlay = document.getElementById("imageHoverOverlay");
        this.hoverImage = document.getElementById("hoverImage");

        // Hover preview settings
        this.hoverDelay = 300; // Faster hover response
        this.hoverTimeout = null;
        this.previewImage = null;

        this.initializeImageHover();
        this.initializeOverlayClose();
    }

    // Helper: Check if mobile
    isMobile() {
        return (
            window.innerWidth <= 768 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent,
            )
        );
    }

    // Helper: Get optimal image size
    getOptimalImageSize() {
        const width = Math.min(600, window.innerWidth * 0.5);
        const height = Math.min(600, window.innerHeight * 0.7);
        return { width, height };
    }

    // Show loading message
    showLoading(message = "Đang tải...") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "flex";
        this.floatingAlert.className = "alert-loading";
        this.floatingAlert.style.display = "block";
    }

    // Show success message
    showSuccess(message = "Thành công!") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "none";
        this.floatingAlert.className = "alert-success";
        this.floatingAlert.style.display = "block";

        setTimeout(() => this.hideAlert(), CONFIG.ui.toastDuration);
    }

    // Show error message
    showError(message = "Có lỗi xảy ra!") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "none";
        this.floatingAlert.className = "alert-error";
        this.floatingAlert.style.display = "block";

        setTimeout(() => this.hideAlert(), CONFIG.ui.toastDuration);
    }

    // Hide alert
    hideAlert() {
        if (this.floatingAlert) {
            this.floatingAlert.style.display = "none";
        }
    }

    // Show copy notification
    showCopyNotification(message = "Đã copy link ảnh!") {
        if (!this.copyNotification) return;

        this.copyNotification.textContent = message;
        this.copyNotification.classList.add("show");

        setTimeout(() => {
            this.copyNotification.classList.remove("show");
        }, 2000);
    }

    // Initialize enhanced image hover functionality
    initializeImageHover() {
        // Create preview image element if it doesn't exist
        if (!this.previewImage) {
            this.previewImage = document.createElement("img");
            this.previewImage.className = "image-preview-hover";
            document.body.appendChild(this.previewImage);
        }

        // Event delegation for better performance
        document.addEventListener("mouseover", (e) => {
            if (e.target.classList.contains("product-image")) {
                // Clear any existing timeout
                clearTimeout(this.hoverTimeout);

                // Set new timeout for showing preview
                this.hoverTimeout = setTimeout(() => {
                    this.showImageHover(e.target.src, e);
                }, this.hoverDelay);
            }
        });

        document.addEventListener("mousemove", (e) => {
            if (
                e.target.classList.contains("product-image") &&
                this.previewImage.style.display === "block"
            ) {
                this.updateImageHoverPosition(e);
            }
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("product-image")) {
                clearTimeout(this.hoverTimeout);
                this.hideImageHover();
            }
        });

        // Click to show full overlay
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("product-image")) {
                e.preventDefault();
                this.hideImageHover(); // Hide preview first
                this.showImageOverlay(e.target.src);
            }
        });
    }

    // Show image hover preview
    showImageHover(imageSrc, event) {
        // Don't show hover preview on mobile
        if (this.isMobile() || !imageSrc) return;

        // Don't show hover for placeholder images
        if (imageSrc.includes("data:image/svg+xml")) return;

        this.previewImage.src = imageSrc;
        this.previewImage.style.display = "block";
        this.previewImage.style.opacity = "1";

        // Position the preview
        this.updateImageHoverPosition(event);
    }

    // Update hover preview position
    updateImageHoverPosition(event) {
        if (!this.previewImage || this.previewImage.style.display !== "block")
            return;

        const offset = 30; // Distance from cursor
        const padding = 20; // Padding from screen edges

        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Wait for image to load to get natural dimensions
        if (this.previewImage.complete) {
            this.positionPreview(
                event,
                offset,
                padding,
                viewportWidth,
                viewportHeight,
            );
        } else {
            this.previewImage.onload = () => {
                this.positionPreview(
                    event,
                    offset,
                    padding,
                    viewportWidth,
                    viewportHeight,
                );
            };
        }
    }

    positionPreview(event, offset, padding, viewportWidth, viewportHeight) {
        // Get natural image dimensions
        const imgWidth = this.previewImage.naturalWidth;
        const imgHeight = this.previewImage.naturalHeight;

        // Calculate scaled dimensions (max 600px)
        const maxSize = 600;
        let displayWidth = imgWidth;
        let displayHeight = imgHeight;

        if (imgWidth > maxSize || imgHeight > maxSize) {
            const scale = Math.min(maxSize / imgWidth, maxSize / imgHeight);
            displayWidth = imgWidth * scale;
            displayHeight = imgHeight * scale;
        }

        // Set the display size
        this.previewImage.style.width = displayWidth + "px";
        this.previewImage.style.height = displayHeight + "px";

        // Default position: right of cursor
        let left = event.clientX + offset;
        let top = event.clientY - displayHeight / 2;

        // Check if preview would go off right edge
        if (left + displayWidth > viewportWidth - padding) {
            // Try positioning to left of cursor
            left = event.clientX - displayWidth - offset;

            // If still off screen, position at right edge
            if (left < padding) {
                left = viewportWidth - displayWidth - padding;
            }
        }

        // Ensure not off left edge
        if (left < padding) {
            left = padding;
        }

        // Check vertical positioning
        if (top + displayHeight > viewportHeight - padding) {
            top = viewportHeight - displayHeight - padding;
        }
        if (top < padding) {
            top = padding;
        }

        // Apply position
        this.previewImage.style.left = left + "px";
        this.previewImage.style.top = top + "px";
    }

    // Hide image hover preview
    hideImageHover() {
        if (this.previewImage) {
            this.previewImage.style.display = "none";
        }
    }

    // Show full image overlay
    showImageOverlay(imageSrc) {
        if (!this.imageHoverOverlay || !this.hoverImage) return;

        this.hoverImage.src = imageSrc;
        this.imageHoverOverlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent scrolling
    }

    // Hide image overlay
    hideImageOverlay() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.classList.remove("active");
            document.body.style.overflow = ""; // Restore scrolling
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
                this.hideImageHover();
            }
        });
    }

    // Update performance indicator
    updatePerformanceIndicator(loadTime) {
        const indicator = document.getElementById("performanceIndicator");
        if (indicator) {
            if (loadTime < 1000) {
                indicator.textContent = "Fast Load";
                indicator.style.background = "#28a745";
            } else if (loadTime < 3000) {
                indicator.textContent = "Good Load";
                indicator.style.background = "#ffc107";
            } else {
                indicator.textContent = "Slow Load";
                indicator.style.background = "#dc3545";
            }
        }
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

    // Smooth height transition for elements
    smoothHeight(element, newHeight) {
        if (!element) return;

        element.style.transition = `height ${CONFIG.ui.animationDuration}ms ease`;
        element.style.height = newHeight;

        setTimeout(() => {
            element.style.transition = "";
            element.style.height = "";
        }, CONFIG.ui.animationDuration);
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
}

// Create global UI manager instance
window.uiManager = new UIManager();

// Global functions for backward compatibility
window.showLoading = (message) => window.uiManager.showLoading(message);
window.showSuccess = (message) => window.uiManager.showSuccess(message);
window.showError = (message) => window.uiManager.showError(message);
window.hideFloatingAlert = () => window.uiManager.hideAlert();

console.log("✅ Enhanced UIManager initialized successfully");
