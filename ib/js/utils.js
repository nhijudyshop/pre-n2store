// =====================================================
// UTILITY FUNCTIONS
// Common utils (formatDate, debounce, etc.) are now in
// shared/js/date-utils.js and shared/js/form-utils.js
// =====================================================

// =====================================================
// CACHE MANAGER
// =====================================================

class CacheManager {
    constructor(cacheKey = "ib_cache", expiryTime = 24 * 60 * 60 * 1000) {
        this.cacheKey = cacheKey;
        this.expiryTime = expiryTime;
    }

    getCachedData() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();

            if (now - timestamp > this.expiryTime) {
                this.invalidateCache();
                return null;
            }

            return data;
        } catch (e) {
            console.warn("[CacheManager] Error reading cache:", e);
            return null;
        }
    }

    setCachedData(data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.warn("[CacheManager] Error setting cache:", e);
        }
    }

    invalidateCache() {
        try {
            localStorage.removeItem(this.cacheKey);
            console.log("[CacheManager] Cache invalidated");
        } catch (e) {
            console.warn("[CacheManager] Error invalidating cache:", e);
        }
    }

    getCacheStatus() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return { valid: false, age: null };

            const { timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            const valid = age < this.expiryTime;

            return {
                valid,
                age,
                ageFormatted: this.formatAge(age),
                expiresIn: valid ? this.expiryTime - age : 0
            };
        } catch (e) {
            return { valid: false, age: null };
        }
    }

    formatAge(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}

// Create global cacheManager instance
const cacheManager = new CacheManager("ib_cache", CONFIG?.cache?.expiry || 24 * 60 * 60 * 1000);
window.cacheManager = cacheManager;

// =====================================================
// UTILS CLASS
// =====================================================

class Utils {
    // Format date - delegates to shared function
    static formatDate(date) {
        return window.formatDate ? window.formatDate(date) : "";
    }

    // Generate unique filename - delegates to shared function
    static generateUniqueFileName() {
        return window.generateUniqueFileName ? window.generateUniqueFileName("png") :
            Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".png";
    }

    // Debounce - delegates to shared function
    static debounce(func, wait) {
        return window.debounce ? window.debounce(func, wait) : func;
    }

    // Throttle - delegates to shared function
    static throttle(func, limit) {
        return window.throttle ? window.throttle(func, limit) : func;
    }

    // Compress image for better performance
    static compressImage(
        file,
        maxWidth = CONFIG.performance.imageCompression.maxWidth,
    ) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const width = img.width;
                    const height = img.height;

                    if (width > maxWidth) {
                        const ratio = maxWidth / width;
                        canvas.width = maxWidth;
                        canvas.height = height * ratio;
                    } else {
                        canvas.width = width;
                        canvas.height = height;
                    }

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: file.type,
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        },
                        file.type,
                        CONFIG.performance.imageCompression.quality,
                    );
                };
            };
        });
    }

    // Validate image URL
    static isValidImageUrl(url) {
        return (
            url &&
            (url.startsWith("http") ||
                url.includes("firebasestorage.googleapis.com") ||
                url.startsWith("data:image"))
        );
    }

    // Check if device is mobile
    static isMobile() {
        return window.innerWidth <= 768;
    }

    // Get optimal image size for device
    static getOptimalImageSize() {
        const width = window.innerWidth;
        if (width < 480) return { width: 300, height: 300 };
        if (width < 768) return { width: 400, height: 400 };
        if (width < 1200) return { width: 500, height: 500 };
        return { width: 600, height: 600 };
    }

    // Escape HTML to prevent XSS
    static escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // Create element with attributes
    static createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);

        Object.keys(attributes).forEach((key) => {
            if (key === "className") {
                element.className = attributes[key];
            } else if (key === "innerHTML") {
                element.innerHTML = attributes[key];
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });

        children.forEach((child) => {
            if (typeof child === "string") {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });

        return element;
    }

    // Check if element is in viewport
    static isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <=
                (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <=
                (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Smooth scroll to element
    static scrollToElement(element, offset = 0) {
        const elementPosition =
            element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
        });
    }

    // Performance measurement
    static measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    }

    // Safe JSON parse
    static safeJsonParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn("Failed to parse JSON:", e);
            return defaultValue;
        }
    }

    // Format file size
    static formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}

// Export Utils globally
window.Utils = Utils;

console.log("✅ Utils loaded (using shared utils)");
