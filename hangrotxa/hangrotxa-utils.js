// =====================================================
// UTILITY FUNCTIONS
// File 2/6: hangrotxa-utils.js
// =====================================================

// =====================================================
// NOTIFICATION FUNCTIONS
// =====================================================

function showLoading(message = "Đang xử lý...") {
    const config = window.HangRotXaConfig;
    if (config.notificationManager) {
        return config.notificationManager.loading(message);
    }
}

function hideLoading(id) {
    const config = window.HangRotXaConfig;
    if (config.notificationManager && id) {
        config.notificationManager.remove(id);
    }
}

function showSuccess(message) {
    const config = window.HangRotXaConfig;
    if (config.notificationManager) {
        config.notificationManager.success(message);
    }
}

function showError(message) {
    const config = window.HangRotXaConfig;
    if (config.notificationManager) {
        config.notificationManager.error(message);
    }
}

function showInfo(message) {
    const config = window.HangRotXaConfig;
    if (config.notificationManager) {
        config.notificationManager.info(message);
    }
}

// =====================================================
// INPUT SANITIZATION
// =====================================================

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

// =====================================================
// DATE FUNCTIONS
// =====================================================

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

function getFormattedDate() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, "0");
    const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const year = currentDate.getFullYear();
    return `${day}-${month}-${year}`;
}

function parseVietnameseDate(dateString) {
    if (!dateString) return null;
    try {
        const cleanDateString = dateString.replace(/,?\s*/g, " ").trim();
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        ];

        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                );
            }
        }

        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

// =====================================================
// ID GENERATION
// =====================================================

function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `id_${timestamp}_${random}`;
}

function generateUniqueFileName() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".jpg";
}

function extractTimestampFromId(id) {
    if (!id || !id.startsWith("id_")) return 0;
    try {
        const parts = id.split("_");
        if (parts.length >= 2) {
            return parseInt(parts[1], 36);
        }
    } catch (error) {
        console.warn("Error extracting timestamp from ID:", id, error);
    }
    return 0;
}

// =====================================================
// SORTING FUNCTIONS
// =====================================================

function sortDataByNewest(dataArray) {
    if (!Array.isArray(dataArray)) return dataArray;

    return dataArray.sort((a, b) => {
        const dotLiveA = parseInt(a.dotLive) || 0;
        const dotLiveB = parseInt(b.dotLive) || 0;

        if (dotLiveA !== dotLiveB) {
            return dotLiveB - dotLiveA;
        }

        const timeA = parseVietnameseDate(a.thoiGianUpload);
        const timeB = parseVietnameseDate(b.thoiGianUpload);

        if (!timeA && !timeB) {
            const timestampA = extractTimestampFromId(a.id);
            const timestampB = extractTimestampFromId(b.id);
            return timestampB - timestampA;
        }

        if (!timeA) return 1;
        if (!timeB) return -1;

        return timeB - timeA;
    });
}

// =====================================================
// DEBOUNCE FUNCTION
// =====================================================

function debounce(func, wait) {
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

// =====================================================
// LOGGING FUNCTIONS
// =====================================================

function logAction(action, description, oldData = null, newData = null) {
    const config = window.HangRotXaConfig;
    const auth = authManager ? authManager.getAuthState() : null;

    const logEntry = {
        timestamp: new Date(),
        user: auth ? auth.displayName || auth.username || "Unknown" : "Unknown",
        page: "Hàng rớt - xả",
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    config.historyCollectionRef.add(logEntry).catch((error) => {
        console.error("Error saving log entry:", error);
    });
}

// =====================================================
// STATS UPDATE
// =====================================================

function updateStats(dataArray) {
    if (!Array.isArray(dataArray)) return;

    const total = dataArray.length;
    const totalQuantity = dataArray.reduce(
        (sum, item) => sum + (parseInt(item.soLuong) || 0),
        0,
    );
    const categories = new Set(dataArray.map((item) => item.phanLoai)).size;
    const liveSessions = new Set(dataArray.map((item) => item.dotLive)).size;

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statCategories").textContent = categories;
    document.getElementById("statLiveSessions").textContent = liveSessions;
    document.getElementById("statQuantity").textContent = totalQuantity;
}

// =====================================================
// OPTIMIZED IMAGE COMPRESSION - 60-90s → 8-15s
// =====================================================

async function compressImage(file) {
    return new Promise((resolve) => {
        // OPTIMIZED SETTINGS FOR SPEED
        const maxWidth = 800; // Increased from 500px for better quality
        const quality = 0.6; // Reduced from 0.8 for smaller file size

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;

            img.onload = function () {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d", {
                    alpha: false, // Disable alpha for performance
                    willReadFrequently: false,
                });

                const width = img.width;
                const height = img.height;

                // Calculate new dimensions
                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    canvas.width = maxWidth;
                    canvas.height = height * ratio;
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }

                // High-quality smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(
                    function (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg", // Force JPEG for better compression
                            lastModified: Date.now(),
                        });
                        console.log(
                            `Compressed: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`,
                        );
                        resolve(compressedFile);
                    },
                    "image/jpeg", // Force JPEG format
                    quality,
                );
            };

            img.onerror = function () {
                console.warn("Image load error, using original file");
                resolve(file);
            };
        };

        reader.onerror = function () {
            console.warn("FileReader error, using original file");
            resolve(file);
        };
    });
}

// Export functions
window.HangRotXaUtils = {
    showLoading,
    hideLoading,
    showSuccess,
    showError,
    showInfo,
    sanitizeInput,
    formatDate,
    getFormattedDate,
    parseVietnameseDate,
    generateUniqueID,
    generateUniqueFileName,
    extractTimestampFromId,
    sortDataByNewest,
    debounce,
    logAction,
    updateStats,
    compressImage,
};
