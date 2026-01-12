// js/utils.js - Utility Functions

// Utility Functions
function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>\"']/g, "").trim();
}

function numberWithCommas(x) {
    if (x === 0 || x === "0") return "0";
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}-${month}-${year}`;
}

function formatDateWithPeriod(date, startTime = null) {
    if (!date || !(date instanceof Date)) return "";

    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const baseDate = `${day}-${month}-${year}`;

    if (!startTime) return baseDate;

    const timeParts = startTime.split(":");
    if (timeParts.length !== 2) return baseDate;

    const startHour = parseInt(timeParts[0]);
    if (isNaN(startHour)) return baseDate;

    let period = "";
    if (startHour >= 6 && startHour < 12) {
        period = " (Sáng)";
    } else if (startHour >= 12 && startHour < 18) {
        period = " (Chiều)";
    } else {
        period = " (Tối)";
    }

    return baseDate + period;
}

function parseDisplayDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;

    let cleanDateStr = dateStr;
    const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
    const match = dateStr.match(periodPattern);
    if (match) {
        cleanDateStr = dateStr.replace(periodPattern, "").trim();
    }

    const parts = cleanDateStr.split("-");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }

    const result = new Date(year, month, day);
    return isNaN(result.getTime()) ? null : result;
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
    const parts = dateString.split("-");

    if (parts.length !== 3) {
        throw new Error("Invalid date format. Expected DD-MM-YY");
    }

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    let year = parseInt(parts[2]);

    if (year < 100) {
        year = 2000 + year;
    }

    const dateObj = new Date(year, month - 1, day);
    const timestamp =
        dateObj.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;

    return timestamp.toString();
}

function generateUniqueId() {
    return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

function formatTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return null;

    const start = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    if (end <= start) {
        return null;
    }

    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 0) {
        return null;
    }

    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;

    const startFormatted = `${start.getHours().toString().padStart(2, "0")}h${start.getMinutes().toString().padStart(2, "0")}m`;
    const endFormatted = `${end.getHours().toString().padStart(2, "0")}h${end.getMinutes().toString().padStart(2, "0")}m`;

    let duration = "";
    if (hours > 0) {
        duration += `${hours}h`;
    }
    if (minutes > 0) {
        duration += `${minutes}m`;
    }
    if (!duration) {
        duration = "0m";
    }

    return `Từ ${startFormatted} đến ${endFormatted} - ${duration}`;
}

// UI Utility Functions
function showLoading(message = "Đang tải...") {
    const alert = document.getElementById("floatingAlert");
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (alert && spinner && text) {
        alert.className = "loading";
        text.textContent = message;
        spinner.style.display = "block";
        alert.style.display = "block";
    }
}

function showSuccess(message) {
    const alert = document.getElementById("floatingAlert");
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (alert && spinner && text) {
        alert.className = "success";
        text.textContent = message;
        spinner.style.display = "none";
        alert.style.display = "block";

        setTimeout(() => {
            hideFloatingAlert();
        }, 3000);
    }
}

function showError(message) {
    const alert = document.getElementById("floatingAlert");
    const spinner = alert.querySelector(".loading-spinner");
    const text = alert.querySelector(".alert-text");

    if (alert && spinner && text) {
        alert.className = "error";
        text.textContent = message;
        spinner.style.display = "none";
        alert.style.display = "block";

        setTimeout(() => {
            hideFloatingAlert();
        }, 5000);
    }
}

function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    if (alert) {
        alert.style.display = "none";
    }
}

// Export functions
window.sanitizeInput = sanitizeInput;
window.numberWithCommas = numberWithCommas;
window.formatDate = formatDate;
window.formatDateWithPeriod = formatDateWithPeriod;
window.parseDisplayDate = parseDisplayDate;
window.convertToTimestamp = convertToTimestamp;
window.generateUniqueId = generateUniqueId;
window.formatTimeRange = formatTimeRange;
window.showLoading = showLoading;
window.showSuccess = showSuccess;
window.showError = showError;
window.hideFloatingAlert = hideFloatingAlert;

// Action Logging System
function logAction(action, description, oldValue = null, newValue = null) {
    try {
        const auth = getAuthState();
        const userName = auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown";

        const logEntry = {
            timestamp: new Date().toISOString(),
            user: userName,
            action: action, // 'add', 'edit', 'delete'
            description: description,
            oldValue: oldValue,
            newValue: newValue,
        };

        // Log to console
        console.log(`[ACTION LOG] ${action.toUpperCase()}:`, logEntry);

        // Optionally save to Firebase history collection
        if (
            typeof historyCollectionRef !== "undefined" &&
            historyCollectionRef
        ) {
            historyCollectionRef
                .add(logEntry)
                .then(() => {
                    console.log("[ACTION LOG] Saved to Firebase");
                })
                .catch((error) => {
                    console.warn(
                        "[ACTION LOG] Could not save to Firebase:",
                        error,
                    );
                });
        }
    } catch (error) {
        console.error("[ACTION LOG] Error logging action:", error);
    }
}

// Export function
window.logAction = logAction;
