/**
 * Form Utilities - ES Module Version
 * SOURCE OF TRUTH for form/input helpers
 *
 * @module shared/browser/form-utils
 */

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique ID string
 */
export function generateUniqueID(prefix = "") {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Generate a unique filename for uploads
 * @param {string} extension - File extension (default: 'png')
 * @returns {string} Unique filename
 */
export function generateUniqueFileName(extension = "png") {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
}

/**
 * Debounce function to limit execution frequency
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
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

/**
 * Throttle function to limit execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textArea);
        return success;
    } catch (error) {
        console.error("[FormUtils] Copy to clipboard failed:", error);
        return false;
    }
}

/**
 * Export array data to CSV file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Output filename
 * @param {Array} headers - Optional custom headers
 */
export function exportToCSV(data, filename = "export.csv", headers = null) {
    if (!data || !data.length) {
        console.warn("[FormUtils] No data to export");
        return;
    }

    const keys = headers || Object.keys(data[0]);
    const csvRows = [];

    // Header row
    csvRows.push(keys.join(","));

    // Data rows
    for (const row of data) {
        const values = keys.map((key) => {
            const val = row[key];
            if (val === null || val === undefined) return "";
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(","));
    }

    const csvString = csvRows.join("\n");
    const blob = new Blob(["\ufeff" + csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number (Vietnamese format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Is valid phone
 */
export function isValidPhone(phone) {
    const phoneRegex = /^(0|\+84)[0-9]{9,10}$/;
    return phoneRegex.test(phone.replace(/\s/g, ""));
}

/**
 * Get value from form input safely
 * @param {string} elementId - Element ID
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Input value or default
 */
export function getInputValue(elementId, defaultValue = "") {
    const element = document.getElementById(elementId);
    return element ? element.value : defaultValue;
}

/**
 * Set value to form input safely
 * @param {string} elementId - Element ID
 * @param {*} value - Value to set
 */
export function setInputValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.value = value;
    }
}

// Export all as FormUtils object for convenience
export const FormUtils = {
    sanitizeInput,
    generateUniqueID,
    generateUniqueFileName,
    debounce,
    throttle,
    copyToClipboard,
    exportToCSV,
    isValidEmail,
    isValidPhone,
    getInputValue,
    setInputValue,
};

export default FormUtils;
