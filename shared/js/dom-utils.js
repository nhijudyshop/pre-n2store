/**
 * SAFE DOM MANIPULATION UTILITIES
 * File: dom-utils.js
 *
 * WRAPPER FILE - Backward compatibility layer
 * SOURCE OF TRUTH: /shared/browser/dom-utils.js
 *
 * This file is kept for backward compatibility with existing code using:
 *   <script src="../shared/js/dom-utils.js"></script>
 *
 * For new ES Module code, import directly from:
 *   import { DOMUtils } from '/shared/browser/dom-utils.js';
 */

const DOMUtils = {
    /**
     * Set text content safely (không dùng innerHTML)
     * @param {HTMLElement} element
     * @param {string} text
     */
    setText(element, text) {
        if (element) {
            element.textContent = text;
        }
    },

    /**
     * Set HTML content với sanitization
     * @param {HTMLElement} element
     * @param {string} html
     */
    setHTML(element, html) {
        if (!element) return;

        // Sanitize HTML để loại bỏ script tags và event handlers
        const sanitized = this.sanitizeHTML(html);
        element.innerHTML = sanitized;
    },

    /**
     * Basic HTML sanitization
     * Loại bỏ: <script>, on* attributes, javascript: protocols
     * @param {string} html
     * @returns {string}
     */
    sanitizeHTML(html) {
        if (typeof html !== 'string') return '';

        let cleaned = html;

        // Remove script tags
        cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove event handlers (onclick, onerror, etc.)
        cleaned = cleaned.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        cleaned = cleaned.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

        // Remove javascript: protocol
        cleaned = cleaned.replace(/javascript:/gi, '');

        // Remove data: protocol (can be used for XSS)
        cleaned = cleaned.replace(/data:text\/html/gi, '');

        return cleaned;
    },

    /**
     * Create element với attributes an toàn
     * @param {string} tagName
     * @param {object} attributes
     * @param {string} textContent
     * @returns {HTMLElement}
     */
    createElement(tagName, attributes = {}, textContent = '') {
        const element = document.createElement(tagName);

        // Set attributes safely
        for (const [key, value] of Object.entries(attributes)) {
            // Skip dangerous attributes
            if (key.startsWith('on')) continue;
            if (key === 'innerHTML') continue;

            if (key === 'className' || key === 'class') {
                element.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else {
                element.setAttribute(key, value);
            }
        }

        // Set text content
        if (textContent) {
            element.textContent = textContent;
        }

        return element;
    },

    /**
     * Append child safely
     * @param {HTMLElement} parent
     * @param {HTMLElement} child
     */
    appendChild(parent, child) {
        if (parent && child) {
            parent.appendChild(child);
        }
    },

    /**
     * Remove all children
     * @param {HTMLElement} element
     */
    clearChildren(element) {
        if (element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }
    },

    /**
     * Escape HTML entities
     * @param {string} text
     * @returns {string}
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Unescape HTML entities
     * @param {string} html
     * @returns {string}
     */
    unescapeHTML(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent;
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMUtils };
}
