// =====================================================
// TEXT PARSER - INVENTORY TRACKING
// Phase 2: Parse product text format
// =====================================================

/**
 * Parse product text to structured data
 * Format: MA [mã SP] [số màu] MÀU [số lượng]X[giá]
 *
 * Supports flexible input:
 * - MA/ma/Mã/mã (case insensitive, with/without diacritics)
 * - MÀU/màu/MAU/mau (with/without diacritics)
 * - X or * as multiplier separator
 *
 * Examples:
 * - MA 721 2 MAU 10X54
 * - ma 721 2 mau 10*54
 * - Mã AO TAY DÀI 999 60x25
 * - MA ABC123 3 màu 20*100
 */

/**
 * Normalize text to remove Vietnamese diacritics and standardize format
 * @param {string} text - Raw text
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    // Replace Vietnamese diacritics for "MÃ" and "MÀU"
    let normalized = text
        // Normalize "MÃ/Mã/mã" to "MA"
        .replace(/[mM][ãÃáÁàÀạẠảẢ]/g, 'MA')
        // Normalize "MÀU/Màu/màu/MẪU/mẫu" to "MAU"
        .replace(/[mM][àÀáÁãÃạẠảẢ][uUưƯ]/gi, 'MAU')
        // Replace * with X for multiplier
        .replace(/\*/g, 'X');

    return normalized;
}

// Regex patterns - now more flexible
const PRODUCT_REGEX = /^MA\s+(.+?)\s+(\d+)\s*MAU\s+(\d+)\s*X\s*(\d+)$/i;
const PRODUCT_NO_COLOR_REGEX = /^MA\s+(.+?)\s+(\d+)\s*X\s*(\d+)$/i;

/**
 * Parse a single product text line
 * @param {string} text - Raw text input
 * @returns {Object} Parsed product object
 */
function parseProductText(text) {
    const originalText = text.trim();
    // Normalize the text first (handle diacritics and * symbol)
    const normalized = normalizeText(originalText).toUpperCase();

    // Try with color
    let match = normalized.match(PRODUCT_REGEX);
    if (match) {
        const soLuong = parseInt(match[3]);
        const giaDonVi = parseInt(match[4]);
        return {
            maSP: match[1].trim(),
            moTa: '',                  // NEW: Empty for manual entry
            mauSac: [],                // NEW: Empty array (no color detail)
            tongSoLuong: soLuong,      // NEW: Direct quantity
            soMau: parseInt(match[2]), // Keep legacy field
            soLuong: soLuong,          // Keep for backward compatibility
            giaDonVi: giaDonVi,
            thanhTien: soLuong * giaDonVi,
            rawText: originalText,
            aiExtracted: false,        // NEW: Flag as manual
            dataSource: 'manual',      // NEW: Explicit source tracking
            isValid: true
        };
    }

    // Try without color (default 1 mau)
    match = normalized.match(PRODUCT_NO_COLOR_REGEX);
    if (match) {
        const soLuong = parseInt(match[2]);
        const giaDonVi = parseInt(match[3]);
        return {
            maSP: match[1].trim(),
            moTa: '',                  // NEW: Empty for manual entry
            mauSac: [],                // NEW: Empty array
            tongSoLuong: soLuong,      // NEW
            soMau: 1,
            soLuong: soLuong,
            giaDonVi: giaDonVi,
            thanhTien: soLuong * giaDonVi,
            rawText: originalText,
            aiExtracted: false,        // NEW
            dataSource: 'manual',      // NEW
            isValid: true
        };
    }

    return {
        rawText: originalText,
        isValid: false,
        error: 'Không parse được. Format: MA [mã] [số màu] MÀU [SL]X[giá] hoặc MA [mã] [SL]*[giá]'
    };
}

/**
 * Parse multiple product lines
 * @param {string} text - Multi-line text input
 * @returns {Object[]} Array of parsed products
 */
function parseMultipleProducts(text) {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => parseProductText(line));
}

/**
 * Validate product text format
 * @param {string} text - Text to validate
 * @returns {boolean} Is valid format
 */
function isValidProductFormat(text) {
    const normalized = normalizeText(text.trim()).toUpperCase();
    return PRODUCT_REGEX.test(normalized) || PRODUCT_NO_COLOR_REGEX.test(normalized);
}

/**
 * Calculate totals from product array
 * @param {Object[]} products - Array of parsed products
 * @returns {Object} Totals object
 */
function calculateProductTotals(products) {
    const validProducts = products.filter(p => p.isValid);
    return {
        tongTienHD: validProducts.reduce((sum, p) => sum + (p.thanhTien || 0), 0),
        tongMon: validProducts.reduce((sum, p) => sum + (p.soLuong || 0), 0),
        tongSanPham: validProducts.length
    };
}

console.log('[PARSER] Text parser initialized');
