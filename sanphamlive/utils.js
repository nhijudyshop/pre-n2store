// js/utils.js - Utility Functions (Fixed for Vietnam Timezone GMT+7)

// Date Formatting with Vietnam Timezone
function formatDate(timestamp) {
    // Convert timestamp to Vietnam timezone (GMT+7)
    const date = new Date(timestamp);

    // Get Vietnam time by adding timezone offset
    const vnOffset = 7 * 60; // GMT+7 in minutes
    const localOffset = date.getTimezoneOffset(); // Local timezone offset in minutes
    const vnTime = new Date(date.getTime() + (vnOffset + localOffset) * 60000);

    const day = String(vnTime.getDate()).padStart(2, "0");
    const month = String(vnTime.getMonth() + 1).padStart(2, "0");
    const year = vnTime.getFullYear();

    return `${day}-${month}-${year}`;
}

function getTodayVN() {
    // Get current time in Vietnam (GMT+7)
    const now = new Date();
    const vnOffset = 7 * 60; // GMT+7 in minutes
    const localOffset = now.getTimezoneOffset();
    const vnTime = new Date(now.getTime() + (vnOffset + localOffset) * 60000);

    const day = String(vnTime.getDate()).padStart(2, "0");
    const month = String(vnTime.getMonth() + 1).padStart(2, "0");
    const year = vnTime.getFullYear();

    return `${day}-${month}-${year}`;
}

function formatDateForInput(dateStr) {
    // Convert from dd-mm-yyyy to yyyy-mm-dd for input type="date"
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function formatDateFromInput(inputValue) {
    // Convert from yyyy-mm-dd to dd-mm-yyyy
    if (!inputValue) return "";
    const parts = inputValue.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function compareDates(date1Str, date2Str) {
    // Compare two dates in format dd-mm-yyyy
    // Returns: -1 if date1 < date2, 0 if equal, 1 if date1 > date2
    const d1 = date1Str.split("-").reverse().join("-");
    const d2 = date2Str.split("-").reverse().join("-");

    if (d1 < d2) return -1;
    if (d1 > d2) return 1;
    return 0;
}

// Notification System
function showNotification(message, type = "success") {
    const notification = document.getElementById("notification");
    const notificationText = document.getElementById("notificationText");

    if (!notification || !notificationText) return;

    // Remove existing classes
    notification.classList.remove("success", "error", "info", "hidden");

    // Add new class based on type
    notification.classList.add(type);
    notificationText.textContent = message;

    // Auto hide after 3 seconds
    setTimeout(() => {
        notification.classList.add("hidden");
    }, 3000);
}

// Input Sanitization
function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"']/g, "").trim();
}

// Number Formatting
function numberWithCommas(x) {
    if (x === 0 || x === "0") return "0";
    if (!x && x !== 0) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Copy to Clipboard
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                showNotification("Đã copy vào clipboard!", "success");
            })
            .catch((err) => {
                console.error("Failed to copy:", err);
                showNotification("Không thể copy", "error");
            });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand("copy");
            showNotification("Đã copy vào clipboard!", "success");
        } catch (err) {
            console.error("Failed to copy:", err);
            showNotification("Không thể copy", "error");
        }

        document.body.removeChild(textArea);
    }
}

// Export CSV
function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showNotification("Không có dữ liệu để xuất", "error");
        return;
    }

    let csvContent = "Ngày,NCC,Tên SP,Mã SP,SL NCC,SL Khách,Mã ĐH\n";

    data.forEach((item) => {
        const row = [
            formatDate(item.dateCell),
            item.supplier || "",
            item.productName || "",
            item.productCode || "",
            item.supplierQty || 0,
            item.customerOrders || 0,
            item.orderCodes ? item.orderCodes.join("; ") : "",
        ]
            .map((field) => {
                // Escape commas and quotes
                const str = String(field);
                if (
                    str.includes(",") ||
                    str.includes('"') ||
                    str.includes("\n")
                ) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            })
            .join(",");

        csvContent += row + "\n";
    });

    // Create blob and download
    const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", filename || `inventory_${getTodayVN()}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification("Đã xuất file CSV!", "success");
}

// Debounce Function
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

// Initialize Lucide Icons
function initIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Export functions
window.formatDate = formatDate;
window.getTodayVN = getTodayVN;
window.formatDateForInput = formatDateForInput;
window.formatDateFromInput = formatDateFromInput;
window.compareDates = compareDates;
window.showNotification = showNotification;
window.sanitizeInput = sanitizeInput;
window.numberWithCommas = numberWithCommas;
window.copyToClipboard = copyToClipboard;
window.exportToCSV = exportToCSV;
window.debounce = debounce;
window.initIcons = initIcons;

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
