// =====================================================
// UTILITY FUNCTIONS
// File 2/6: hangrotxa-utils.js
// Common utils are now in shared/js/date-utils.js and shared/js/form-utils.js
// =====================================================

// =====================================================
// PAGE-SPECIFIC NOTIFICATION FUNCTIONS
// =====================================================

function showLoading(message = "Đang xử lý...") {
    const config = window.HangRotXaConfig;
    if (config && config.notificationManager) {
        return config.notificationManager.loading(message);
    }
}

function hideLoading(id) {
    const config = window.HangRotXaConfig;
    if (config && config.notificationManager && id) {
        config.notificationManager.remove(id);
    }
}

function showSuccess(message) {
    const config = window.HangRotXaConfig;
    if (config && config.notificationManager) {
        config.notificationManager.success(message);
    }
}

function showError(message) {
    const config = window.HangRotXaConfig;
    if (config && config.notificationManager) {
        config.notificationManager.error(message);
    }
}

function showInfo(message) {
    const config = window.HangRotXaConfig;
    if (config && config.notificationManager) {
        config.notificationManager.info(message);
    }
}

// =====================================================
// PAGE-SPECIFIC ID FUNCTIONS
// =====================================================

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
// DATE PARSING HELPER
// =====================================================

function parseVietnameseDate(dateStr) {
    if (!dateStr) return null;
    // Format: "HH:MM DD/MM/YYYY" or "DD/MM/YYYY"
    const parts = dateStr.trim().split(" ");
    let datePart, timePart;

    if (parts.length >= 2 && parts[0].includes(":")) {
        timePart = parts[0];
        datePart = parts[1];
    } else if (parts.length >= 2 && parts[1].includes("/")) {
        timePart = parts[0];
        datePart = parts[1];
    } else {
        datePart = parts[0];
    }

    if (!datePart || !datePart.includes("/")) return null;

    const dateComponents = datePart.split("/");
    if (dateComponents.length !== 3) return null;

    const day = parseInt(dateComponents[0], 10);
    const month = parseInt(dateComponents[1], 10) - 1;
    const year = parseInt(dateComponents[2], 10);

    let hours = 0, minutes = 0;
    if (timePart && timePart.includes(":")) {
        const timeComponents = timePart.split(":");
        hours = parseInt(timeComponents[0], 10) || 0;
        minutes = parseInt(timeComponents[1], 10) || 0;
    }

    const date = new Date(year, month, day, hours, minutes);
    return isNaN(date.getTime()) ? null : date.getTime();
}

// =====================================================
// PAGE-SPECIFIC SORTING
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
// PAGE-SPECIFIC LOGGING
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
        id: generateUniqueID("log"),
    };

    if (config && config.historyCollectionRef) {
        config.historyCollectionRef.add(logEntry).catch((error) => {
            console.error("Error saving log entry:", error);
        });
    }
}

// =====================================================
// PAGE-SPECIFIC STATS UPDATE
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

    const statTotal = document.getElementById("statTotal");
    const statCategories = document.getElementById("statCategories");
    const statLiveSessions = document.getElementById("statLiveSessions");
    const statQuantity = document.getElementById("statQuantity");

    if (statTotal) statTotal.textContent = total;
    if (statCategories) statCategories.textContent = categories;
    if (statLiveSessions) statLiveSessions.textContent = liveSessions;
    if (statQuantity) statQuantity.textContent = totalQuantity;
}

// =====================================================
// PAGE-SPECIFIC IMAGE COMPRESSION
// =====================================================

async function compressImage(file) {
    return new Promise((resolve) => {
        const maxWidth = 800;
        const quality = 0.6;

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;

            img.onload = function () {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d", {
                    alpha: false,
                    willReadFrequently: false,
                });

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

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(
                    function (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg",
                            lastModified: Date.now(),
                        });
                        console.log(
                            `Compressed: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`,
                        );
                        resolve(compressedFile);
                    },
                    "image/jpeg",
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

// =====================================================
// EXPORTS - Delegates to shared functions where possible
// =====================================================

window.HangRotXaUtils = {
    showLoading,
    hideLoading,
    showSuccess,
    showError,
    showInfo,
    // Delegate to shared functions - call at runtime to ensure window.* is available
    sanitizeInput: (input) => {
        if (typeof input !== "string") return "";
        return input.replace(/[<>"'&]/g, "").trim();
    },
    formatDate: (date) => {
        if (window.formatDate) return window.formatDate(date);
        if (!date) return "";
        const d = new Date(date);
        return isNaN(d.getTime()) ? "" : d.toLocaleDateString("vi-VN");
    },
    getFormattedDate: () => {
        if (window.getFormattedDateTime) return window.getFormattedDateTime();
        const now = new Date();
        return now.toLocaleString("vi-VN");
    },
    parseVietnameseDate: (str) => {
        if (window.parseVietnameseDate) return window.parseVietnameseDate(str);
        if (!str) return null;
        const parts = str.split("/");
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return null;
    },
    generateUniqueID: () => {
        if (window.generateUniqueID) return window.generateUniqueID();
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    },
    generateUniqueFileName: () => {
        if (window.generateUniqueFileName) return window.generateUniqueFileName();
        return Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".jpg";
    },
    debounce: (fn, delay = 300) => {
        if (window.debounce) return window.debounce(fn, delay);
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    },
    // Page-specific functions
    extractTimestampFromId,
    sortDataByNewest,
    logAction,
    updateStats,
    compressImage,
};

console.log("✅ HangRotXa Utils loaded (using shared utils)");
