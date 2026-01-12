// =====================================================
// UTILITY FUNCTIONS WITH AGGRESSIVE COMPRESSION
// =====================================================

class Utils {
    // Format date to Vietnamese format
    static formatDate(date) {
        if (!date || !(date instanceof Date)) return "";
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // Generate unique filename
    static generateUniqueFileName() {
        return (
            Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".jpg"
        );
    }

    // Debounce function
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function
    static throttle(func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    // Check WebP support
    static supportsWebP() {
        const canvas = document.createElement("canvas");
        if (!canvas.getContext || !canvas.getContext("2d")) {
            return false;
        }
        return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    }

    // OPTIMIZED: Standard Image Compression (for edit modal, etc.)
    static async compressImage(file, type = "storage") {
        const settings = CONFIG.performance.imageCompression[type];

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > settings.maxWidth) {
                            height = (height * settings.maxWidth) / width;
                            width = settings.maxWidth;
                        }
                    } else {
                        if (height > settings.maxHeight) {
                            width = (width * settings.maxHeight) / height;
                            height = settings.maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, ".jpg"),
                                {
                                    type: "image/jpeg",
                                    lastModified: Date.now(),
                                },
                            );
                            resolve(compressedFile);
                        },
                        "image/jpeg",
                        settings.quality,
                    );
                };
            };
        });
    }

    // NEW: Super Aggressive Compression for Form Uploads
    static async compressImageAggressive(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    let width = img.width;
                    let height = img.height;

                    // Max 800px on longest side
                    const MAX_SIZE = 800;
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = (height * MAX_SIZE) / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = (width * MAX_SIZE) / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, width, height);

                    // 0.6 quality JPEG
                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, ".jpg"),
                                {
                                    type: "image/jpeg",
                                    lastModified: Date.now(),
                                },
                            );

                            console.log(
                                `Nén: ${Utils.formatFileSize(file.size)} → ${Utils.formatFileSize(compressedFile.size)}`,
                            );
                            resolve(compressedFile);
                        },
                        "image/jpeg",
                        0.6,
                    );
                };
            };
        });
    }

    // Batch compress multiple images in parallel
    static async compressImageBatch(files, onProgress) {
        let completed = 0;

        const compressionPromises = Array.from(files).map(
            async (file, index) => {
                try {
                    const compressed =
                        await Utils.compressImageAggressive(file);
                    completed++;
                    if (onProgress) {
                        onProgress(completed, files.length);
                    }
                    return compressed;
                } catch (error) {
                    console.error(`Lỗi nén file ${index}:`, error);
                    return file;
                }
            },
        );

        return await Promise.all(compressionPromises);
    }

    static isValidImageUrl(url) {
        return (
            url &&
            (url.startsWith("http") ||
                url.includes("firebasestorage.googleapis.com") ||
                url.startsWith("data:image"))
        );
    }

    static isMobile() {
        return window.innerWidth <= 768;
    }

    static getOptimalImageSize() {
        const width = window.innerWidth;
        if (width < 480) return { width: 250, height: 250 };
        if (width < 768) return { width: 350, height: 350 };
        if (width < 1200) return { width: 450, height: 450 };
        return { width: 550, height: 550 };
    }

    static escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    static createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        Object.keys(attributes).forEach((key) => {
            if (key === "className") {
                element.className = attributes[key];
            } else if (key === "innerHTML") {
                element.innerHTML = attributes[key];
            } else if (key === "style" && typeof attributes[key] === "object") {
                Object.assign(element.style, attributes[key]);
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

    static formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}

// =====================================================
// UPLOAD QUEUE MANAGER FOR CONTROLLED PARALLEL UPLOADS
// =====================================================

class UploadQueueManager {
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
        this.queue = [];
        this.active = 0;
    }

    async add(uploadFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ uploadFn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.active >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        this.active++;
        const { uploadFn, resolve, reject } = this.queue.shift();

        try {
            const result = await uploadFn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.active--;
            this.process();
        }
    }
}

// =====================================================
// STANDALONE UTILITY FUNCTIONS
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}/${month}/${year}`;
}

function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.trim();

        const pattern1 =
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}),?\s*(\d{1,2}):(\d{2})/;
        const match1 = cleanDateString.match(pattern1);
        if (match1) {
            const [, day, month, year, hour, minute] = match1;
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                0,
                0,
            );
        }

        const pattern2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const match2 = cleanDateString.match(pattern2);
        if (match2) {
            const [, day, month, year] = match2;
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                0,
                0,
                0,
                0,
            );
        }

        const pattern3 = /^(\d{4})-(\d{2})-(\d{2})$/;
        const match3 = cleanDateString.match(pattern3);
        if (match3) {
            const [, year, month, day] = match3;
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                0,
                0,
                0,
                0,
            );
        }

        const pattern4 = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;
        const match4 = cleanDateString.match(pattern4);
        if (match4) {
            const [, year, month, day, hour, minute, second] = match4;
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second),
                0,
            );
        }

        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date;
        }

        console.warn("Could not parse date:", dateString);
        return null;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

function getFormattedDateTime() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();
    const hour = now.getHours().toString().padStart(2, "0");
    const minute = now.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

function getCurrentDateForInput() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `inv_${timestamp}_${random}`;
}

function debounce(func, wait) {
    return Utils.debounce(func, wait);
}

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Đặt Hàng",
) {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => console.log("Log entry saved successfully"))
        .catch((error) => console.error("Error saving log entry: ", error));
}

window.Utils = Utils;
window.UploadQueueManager = UploadQueueManager;
window.getCurrentDateForInput = getCurrentDateForInput;
window.parseVietnameseDate = parseVietnameseDate;

console.log("✅ Utility functions loaded with aggressive compression");
