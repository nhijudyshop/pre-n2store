/**
 * Date Utilities - ES Module Version
 * SOURCE OF TRUTH for date operations
 *
 * @module shared/browser/date-utils
 */

/**
 * Format date to Vietnamese format (DD/MM/YYYY)
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!date) return "";

    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    if (isNaN(date.getTime())) return "";

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Format date with time (DD/MM/YYYY, HH:mm)
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date-time string
 */
export function formatDateTime(date) {
    if (!date) return "";

    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    if (isNaN(date.getTime())) return "";

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

/**
 * Get current date-time formatted
 * @returns {string} Current date-time string
 */
export function getFormattedDateTime() {
    return formatDateTime(new Date());
}

/**
 * Parse Vietnamese date string (DD/MM/YYYY or DD/MM/YYYY HH:mm)
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed Date object or null
 */
export function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.replace(/,/g, "").replace(/\s+/g, " ").trim();
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
                    parseInt(minute)
                );
            }
        }

        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.warn("[DateUtils] Error parsing date:", dateString, error);
        return null;
    }
}

/**
 * Get today's date in Vietnam timezone (YYYY-MM-DD for input fields)
 * @returns {string} Date string for input fields
 */
export function getTodayVN() {
    const now = new Date();
    const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    return vnTime.toISOString().split("T")[0];
}

/**
 * Get current date formatted for HTML date input (YYYY-MM-DD)
 * @returns {string} Date string for input fields
 */
export function getCurrentDateForInput() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Format date for HTML date input (YYYY-MM-DD)
 * @param {string} dateStr - Date string (DD/MM/YYYY)
 * @returns {string} Date string for input fields (YYYY-MM-DD)
 */
export function formatDateForInput(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("/");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Format date from HTML input to display format
 * @param {string} inputValue - Date from input (YYYY-MM-DD)
 * @returns {string} Display format (DD/MM/YYYY)
 */
export function formatDateFromInput(inputValue) {
    if (!inputValue) return "";
    const parts = inputValue.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Compare two date strings (DD/MM/YYYY format)
 * @param {string} date1Str - First date
 * @param {string} date2Str - Second date
 * @returns {number} -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDates(date1Str, date2Str) {
    const date1 = parseVietnameseDate(date1Str);
    const date2 = parseVietnameseDate(date2Str);

    if (!date1 && !date2) return 0;
    if (!date1) return -1;
    if (!date2) return 1;

    return date1.getTime() - date2.getTime();
}

/**
 * Convert date to timestamp
 * @param {Date|string} date - Date to convert
 * @returns {number} Timestamp in milliseconds
 */
export function convertToTimestamp(date) {
    if (!date) return 0;
    if (date instanceof Date) return date.getTime();
    const parsed = parseVietnameseDate(date);
    return parsed ? parsed.getTime() : 0;
}

/**
 * Format number with commas (Vietnamese currency format)
 * @param {number|string} x - Number to format
 * @returns {string} Formatted number string
 */
export function numberWithCommas(x) {
    if (x === null || x === undefined) return "0";
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Export all as DateUtils object for convenience
export const DateUtils = {
    formatDate,
    formatDateTime,
    getFormattedDateTime,
    parseVietnameseDate,
    getTodayVN,
    getCurrentDateForInput,
    formatDateForInput,
    formatDateFromInput,
    compareDates,
    convertToTimestamp,
    numberWithCommas,
};

export default DateUtils;
