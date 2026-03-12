/**
 * SUPPLIER DETECTOR
 * File: supplier-detector.js
 * Purpose: Detect supplier code from product name
 */

window.SupplierDetector = (function() {
    'use strict';

    /**
     * Pattern definitions for supplier code detection
     * Pattern format: [A-Z]\d{1,4} (1 letter + 1-4 digits)
     * Examples: A43, B1, C1234, Z999
     */
    const SUPPLIER_PATTERNS = [
        // Pattern 1: "0510 A43 SET ÁO DÀI" (date + supplier + product)
        {
            regex: /^\d{4}\s+([A-Z]\d{1,4})\s+/i,
            confidence: 'high',
            description: 'Date prefix pattern (ddmm SUPPLIER product)'
        },
        // Pattern 2: "[TAG] 0510 A43 SET ÁO" (tag + date + supplier)
        {
            regex: /^\[[\w\d]+\]\s*\d{4}\s+([A-Z]\d{1,4})\s+/i,
            confidence: 'high',
            description: 'Tag + date prefix pattern'
        },
        // Pattern 3: "A43 SET ÁO DÀI" (supplier at start)
        {
            regex: /^([A-Z]\d{1,4})\s+/i,
            confidence: 'medium',
            description: 'Supplier at start pattern'
        },
        // Pattern 4: "SET ÁO A43 DÀI" (supplier anywhere)
        {
            regex: /\b([A-Z]\d{1,4})\b/i,
            confidence: 'low',
            description: 'Supplier anywhere pattern'
        }
    ];

    /**
     * Detect supplier code from product name
     * @param {string} name - Product name
     * @returns {string|null} - Supplier code or null
     */
    function detectSupplierFromProductName(name) {
        const result = detectSupplierWithConfidence(name);
        return result.supplierName;
    }

    /**
     * Detect supplier with confidence level and position
     * @param {string} name - Product name
     * @returns {{supplierName: string|null, confidence: string, position: number}}
     */
    function detectSupplierWithConfidence(name) {
        if (!name || typeof name !== 'string') {
            return { supplierName: null, confidence: 'none', position: -1 };
        }

        const trimmed = name.trim().toUpperCase();

        // Try each pattern in order of priority
        for (const pattern of SUPPLIER_PATTERNS) {
            const match = trimmed.match(pattern.regex);
            if (match && match[1]) {
                const supplierCode = match[1].toUpperCase();
                const position = match.index || 0;

                return {
                    supplierName: supplierCode,
                    confidence: pattern.confidence,
                    position: position
                };
            }
        }

        return { supplierName: null, confidence: 'none', position: -1 };
    }

    /**
     * Extract all potential supplier codes from text
     * @param {string} text
     * @returns {Array<{code: string, position: number}>}
     */
    function extractAllSupplierCodes(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const codes = [];
        const regex = /\b([A-Z]\d{1,4})\b/gi;
        let match;

        while ((match = regex.exec(text)) !== null) {
            codes.push({
                code: match[1].toUpperCase(),
                position: match.index
            });
        }

        return codes;
    }

    /**
     * Check if a string looks like a supplier code
     * @param {string} code
     * @returns {boolean}
     */
    function isSupplierCode(code) {
        if (!code || typeof code !== 'string') {
            return false;
        }
        return /^[A-Z]\d{1,4}$/i.test(code.trim());
    }

    /**
     * Remove supplier code from product name
     * @param {string} name - Product name
     * @returns {string} - Name without supplier code
     */
    function removeSupplierFromName(name) {
        if (!name || typeof name !== 'string') {
            return '';
        }

        let result = name.trim();

        // Try to remove supplier using patterns in order
        for (const pattern of SUPPLIER_PATTERNS) {
            const match = result.match(pattern.regex);
            if (match) {
                // Remove the matched supplier code
                result = result.replace(pattern.regex, (fullMatch, supplierCode) => {
                    // Keep everything except the supplier code
                    return fullMatch.replace(supplierCode, '').replace(/\s+/g, ' ');
                });
                break;
            }
        }

        return result.trim();
    }

    /**
     * Get clean product name (without date prefix and supplier)
     * @param {string} name - Full product name like "0510 A43 SET ÁO DÀI"
     * @returns {string} - Clean name like "SET ÁO DÀI"
     */
    function getCleanProductName(name) {
        if (!name || typeof name !== 'string') {
            return '';
        }

        let result = name.trim();

        // Remove [TAG] prefix
        result = result.replace(/^\[[\w\d]+\]\s*/i, '');

        // Remove date prefix (4 digits at start)
        result = result.replace(/^\d{4}\s+/, '');

        // Remove supplier code
        result = result.replace(/^[A-Z]\d{1,4}\s+/i, '');

        return result.trim();
    }

    /**
     * Parse full product info from name
     * @param {string} name - "0510 A43 SET ÁO DÀI"
     * @returns {{dateCode: string|null, supplierCode: string|null, productName: string}}
     */
    function parseProductInfo(name) {
        if (!name || typeof name !== 'string') {
            return { dateCode: null, supplierCode: null, productName: '' };
        }

        let remaining = name.trim();
        let dateCode = null;
        let supplierCode = null;

        // Remove [TAG] prefix if present
        remaining = remaining.replace(/^\[[\w\d]+\]\s*/i, '');

        // Extract date code (4 digits at start)
        const dateMatch = remaining.match(/^(\d{4})\s+/);
        if (dateMatch) {
            dateCode = dateMatch[1];
            remaining = remaining.substring(dateMatch[0].length);
        }

        // Extract supplier code
        const supplierMatch = remaining.match(/^([A-Z]\d{1,4})\s+/i);
        if (supplierMatch) {
            supplierCode = supplierMatch[1].toUpperCase();
            remaining = remaining.substring(supplierMatch[0].length);
        }

        return {
            dateCode,
            supplierCode,
            productName: remaining.trim()
        };
    }

    // Public API
    return {
        detectSupplierFromProductName,
        detectSupplierWithConfidence,
        extractAllSupplierCodes,
        isSupplierCode,
        removeSupplierFromName,
        getCleanProductName,
        parseProductInfo
    };
})();
