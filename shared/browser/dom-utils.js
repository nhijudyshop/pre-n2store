/**
 * SAFE DOM MANIPULATION UTILITIES
 * SOURCE OF TRUTH - XSS-safe DOM utilities
 *
 * @module shared/browser/dom-utils
 * @description Safe DOM manipulation utilities with XSS protection
 */

// =====================================================
// DOM UTILS
// =====================================================

export const DOMUtils = {
    /**
     * Set text content safely (never uses innerHTML)
     * @param {HTMLElement} element
     * @param {string} text
     */
    setText(element, text) {
        if (element) {
            element.textContent = text;
        }
    },

    /**
     * Set HTML content with sanitization
     * @param {HTMLElement} element
     * @param {string} html
     */
    setHTML(element, html) {
        if (!element) return;
        const sanitized = this.sanitizeHTML(html);
        element.innerHTML = sanitized;
    },

    /**
     * Basic HTML sanitization
     * Removes: <script>, on* attributes, javascript: protocols
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

        // Remove vbscript: protocol
        cleaned = cleaned.replace(/vbscript:/gi, '');

        return cleaned;
    },

    /**
     * Create element with safe attributes
     * @param {string} tagName
     * @param {Object} attributes
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
            } else if (key === 'dataset' && typeof value === 'object') {
                Object.assign(element.dataset, value);
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
        if (typeof text !== 'string') return '';
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
        if (typeof html !== 'string') return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent;
    },

    /**
     * Query selector with null safety
     * @param {string} selector
     * @param {HTMLElement} context
     * @returns {HTMLElement|null}
     */
    $(selector, context = document) {
        return context.querySelector(selector);
    },

    /**
     * Query selector all with array return
     * @param {string} selector
     * @param {HTMLElement} context
     * @returns {HTMLElement[]}
     */
    $$(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
    },

    /**
     * Add event listener with automatic cleanup tracking
     * @param {HTMLElement} element
     * @param {string} event
     * @param {Function} handler
     * @param {Object} options
     * @returns {Function} cleanup function
     */
    on(element, event, handler, options = {}) {
        if (!element) return () => {};

        element.addEventListener(event, handler, options);
        return () => element.removeEventListener(event, handler, options);
    },

    /**
     * Add event listener that fires once
     * @param {HTMLElement} element
     * @param {string} event
     * @param {Function} handler
     */
    once(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler, { once: true });
    },

    /**
     * Toggle class on element
     * @param {HTMLElement} element
     * @param {string} className
     * @param {boolean} force
     */
    toggleClass(element, className, force) {
        if (!element) return;
        if (force !== undefined) {
            element.classList.toggle(className, force);
        } else {
            element.classList.toggle(className);
        }
    },

    /**
     * Check if element has class
     * @param {HTMLElement} element
     * @param {string} className
     * @returns {boolean}
     */
    hasClass(element, className) {
        return element?.classList?.contains(className) || false;
    },

    /**
     * Show element
     * @param {HTMLElement} element
     * @param {string} display
     */
    show(element, display = 'block') {
        if (element) {
            element.style.display = display;
        }
    },

    /**
     * Hide element
     * @param {HTMLElement} element
     */
    hide(element) {
        if (element) {
            element.style.display = 'none';
        }
    },

    /**
     * Get/set data attribute
     * @param {HTMLElement} element
     * @param {string} key
     * @param {*} value
     * @returns {string|undefined}
     */
    data(element, key, value) {
        if (!element) return undefined;

        if (value === undefined) {
            return element.dataset[key];
        }

        element.dataset[key] = value;
    },

    /**
     * Wait for element to appear in DOM
     * @param {string} selector
     * @param {number} timeout
     * @returns {Promise<HTMLElement>}
     */
    waitFor(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                return resolve(element);
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }
};

// =====================================================
// EXPORTS
// =====================================================

// Export individual functions
export const {
    setText,
    setHTML,
    sanitizeHTML,
    createElement,
    appendChild,
    clearChildren,
    escapeHTML,
    unescapeHTML,
    $,
    $$,
    on,
    once,
    toggleClass,
    hasClass,
    show,
    hide,
    data,
    waitFor
} = DOMUtils;

console.log('[DOM-UTILS] Module loaded');

export default DOMUtils;
