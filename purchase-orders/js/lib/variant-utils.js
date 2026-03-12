/**
 * VARIANT UTILS
 * File: variant-utils.js
 * Purpose: Parse, format, and generate variant strings
 */

window.VariantUtils = (function() {
    'use strict';

    /**
     * Parse variant string like "variant_name - product_code" or "Đỏ, M"
     * @param {string} variant - Variant string
     * @returns {{name: string, code: string|null}}
     */
    function parseVariant(variant) {
        if (!variant || typeof variant !== 'string') {
            return { name: '', code: null };
        }

        const trimmed = variant.trim();

        // Pattern: "variant_name - product_code"
        const dashIndex = trimmed.lastIndexOf(' - ');
        if (dashIndex > 0) {
            return {
                name: trimmed.substring(0, dashIndex).trim(),
                code: trimmed.substring(dashIndex + 3).trim() || null
            };
        }

        // No code, just the name
        return { name: trimmed, code: null };
    }

    /**
     * Format variant from name and code
     * @param {string} name - Variant name (e.g., "Đỏ, M")
     * @param {string|null} code - Product code (optional)
     * @returns {string}
     */
    function formatVariant(name, code) {
        if (!name) return '';
        if (!code) return name;
        return `${name} - ${code}`;
    }

    /**
     * Format variant string from attribute values
     * @param {Array<{attrName: string, values: string[]}>} attrs - Attribute with values
     * @param {boolean} isParent - If true, use pipe separator with parentheses
     * @returns {string}
     *
     * Examples:
     * - isParent=true:  "(Đỏ | Xanh) (S | M | L)"
     * - isParent=false: "Đỏ, S"
     */
    function formatVariantFromAttributeValues(attrs, isParent = false) {
        if (!attrs || !Array.isArray(attrs) || attrs.length === 0) {
            return '';
        }

        if (isParent) {
            // Parent format: "(Đỏ | Xanh) (S | M | L)"
            return attrs
                .filter(attr => attr.values && attr.values.length > 0)
                .map(attr => {
                    if (attr.values.length === 1) {
                        return attr.values[0];
                    }
                    return `(${attr.values.join(' | ')})`;
                })
                .join(' ');
        }

        // Child format: "Đỏ, S"
        return attrs
            .filter(attr => attr.values && attr.values.length > 0)
            .map(attr => attr.values[0])
            .join(', ');
    }

    /**
     * Format variant from TPOS AttributeLines structure
     * @param {Array} lines - TPOS AttributeLines
     * @returns {string} - Parent format "(Đỏ | Xanh) (S | M)"
     */
    function formatVariantFromTPOSAttributeLines(lines) {
        if (!lines || !Array.isArray(lines)) {
            return '';
        }

        return lines
            .filter(line => line.Values && line.Values.length > 0)
            .map(line => {
                const valueNames = line.Values.map(v => v.Name || v.name);
                if (valueNames.length === 1) {
                    return valueNames[0];
                }
                return `(${valueNames.join(' | ')})`;
            })
            .join(' ');
    }

    /**
     * Generate Cartesian product of attribute values
     * @param {Object.<string, Array<{id: string, name: string}>>} selectedValues - Attribute ID to values map
     * @returns {Array<{combinationString: string, selectedAttributeValueIds: string[]}>}
     *
     * Example input:
     * {
     *   "attr1": [{id: "uuid1", name: "Đỏ"}, {id: "uuid2", name: "Xanh"}],
     *   "attr2": [{id: "uuid3", name: "S"}, {id: "uuid4", name: "M"}]
     * }
     *
     * Output: 4 combinations (2x2)
     */
    function generateCombinations(selectedValues) {
        if (!selectedValues || typeof selectedValues !== 'object') {
            return [];
        }

        // Convert to array of arrays
        const arrays = Object.entries(selectedValues)
            .filter(([_, values]) => values && values.length > 0)
            .map(([attrId, values]) =>
                values.map(v => ({
                    attrId,
                    valueId: v.id,
                    valueName: v.name
                }))
            );

        if (arrays.length === 0) {
            return [];
        }

        // Cartesian product
        const cartesian = arrays.reduce(
            (acc, curr) => acc.flatMap(a => curr.map(b => [...a, b])),
            [[]]
        );

        return cartesian.map(combo => ({
            combinationString: combo.map(c => c.valueName).join(', '),
            selectedAttributeValueIds: combo.map(c => c.valueId)
        }));
    }

    /**
     * Parse variant string to array of values
     * @param {string} variant - "Đỏ, M, 2" or "Đỏ | Xanh, M | L"
     * @returns {string[]}
     */
    function parseVariantToValues(variant) {
        if (!variant || typeof variant !== 'string') {
            return [];
        }

        // Check for pipe separator (parent format)
        if (variant.includes('|')) {
            // Extract individual values from parentheses groups
            const groups = variant.match(/\(([^)]+)\)|([^()\s]+)/g) || [];
            return groups.map(g => {
                // Remove parentheses and split by pipe
                const clean = g.replace(/[()]/g, '').trim();
                return clean.split('|').map(v => v.trim());
            }).flat();
        }

        // Simple comma-separated format
        return variant.split(',').map(v => v.trim()).filter(v => v);
    }

    /**
     * Check if two variants match
     * @param {string} variant1
     * @param {string} variant2
     * @returns {boolean}
     */
    function variantsMatch(variant1, variant2) {
        const values1 = parseVariantToValues(variant1).sort();
        const values2 = parseVariantToValues(variant2).sort();

        if (values1.length !== values2.length) {
            return false;
        }

        return values1.every((v, i) =>
            v.toLowerCase() === values2[i].toLowerCase()
        );
    }

    /**
     * Sort attribute values with special logic for sizes
     * @param {Array<{name: string, id?: string}>} values
     * @returns {Array}
     */
    function sortAttributeValues(values) {
        if (!values || !Array.isArray(values)) {
            return [];
        }

        // Size order mapping
        const sizeOrder = {
            'FREESIZE': 0, 'FREE': 0, 'F': 0,
            'XXS': 1,
            'XS': 2,
            'S': 3,
            'M': 4,
            'L': 5,
            'XL': 6,
            'XXL': 7, '2XL': 7,
            'XXXL': 8, '3XL': 8,
            'XXXXL': 9, '4XL': 9,
            'XXXXXL': 10, '5XL': 10
        };

        // Priority color names - exact match only (common colors first)
        var priorityColors = ['TRẮNG', 'ĐEN', 'XÁM', 'XANH', 'VÀNG', 'HỒNG', 'CAM', 'TÍM', 'NÂU', 'NU', 'RÊU'];

        function getColorPriority(name) {
            var upper = name.toUpperCase().trim();
            var idx = priorityColors.indexOf(upper);
            return idx !== -1 ? idx : -1;
        }

        return [...values].sort((a, b) => {
            const nameA = (a.name || a).toString().toUpperCase().trim();
            const nameB = (b.name || b).toString().toUpperCase().trim();

            // Check if both are sizes
            const orderA = sizeOrder[nameA];
            const orderB = sizeOrder[nameB];

            if (orderA !== undefined && orderB !== undefined) {
                return orderA - orderB;
            }

            // Check if both are numbers
            const numA = parseFloat(nameA);
            const numB = parseFloat(nameB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }

            // Sizes first, then numbers, then colors, then alphabetical
            if (orderA !== undefined) return -1;
            if (orderB !== undefined) return 1;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;

            // Priority color sorting
            var colorA = getColorPriority(nameA);
            var colorB = getColorPriority(nameB);
            if (colorA !== -1 && colorB !== -1) {
                if (colorA !== colorB) return colorA - colorB;
                // Same base color group, sort alphabetically within group
                return nameA.localeCompare(nameB, 'vi');
            }
            if (colorA !== -1) return -1;
            if (colorB !== -1) return 1;

            // Alphabetical fallback
            return nameA.localeCompare(nameB, 'vi');
        });
    }

    /**
     * Extract base values from variant (first value of each attribute)
     * @param {string} variant - "Đỏ, M" or "(Đỏ | Xanh) (S | M)"
     * @returns {string[]}
     */
    function extractBaseValues(variant) {
        if (!variant) return [];

        // Parent format with parentheses
        if (variant.includes('(')) {
            const matches = variant.match(/\(([^)]+)\)|([^()\s,]+)/g) || [];
            return matches.map(m => {
                const clean = m.replace(/[()]/g, '').trim();
                // Get first value if pipe-separated
                return clean.split('|')[0].trim();
            }).filter(v => v);
        }

        // Simple comma format
        return variant.split(',').map(v => v.trim()).filter(v => v);
    }

    // Public API
    return {
        parseVariant,
        formatVariant,
        formatVariantFromAttributeValues,
        formatVariantFromTPOSAttributeLines,
        generateCombinations,
        parseVariantToValues,
        variantsMatch,
        sortAttributeValues,
        extractBaseValues
    };
})();
