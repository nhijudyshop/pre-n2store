/**
 * EVENT LISTENER MANAGER
 * File: event-manager.js
 * Purpose: Prevent memory leaks bằng cách track và cleanup event listeners
 */

class EventManager {
    constructor() {
        this.listeners = new Map();
        this.listenerCounter = 0;
    }

    /**
     * Add event listener và track nó
     * @param {HTMLElement|Window|Document} element
     * @param {string} event
     * @param {Function} handler
     * @param {object} options
     * @returns {number} Listener ID
     */
    add(element, event, handler, options = {}) {
        if (!element || !event || !handler) {
            logger.warn('EventManager.add: Missing required parameters');
            return null;
        }

        // Add listener
        element.addEventListener(event, handler, options);

        // Track listener
        const listenerId = ++this.listenerCounter;
        this.listeners.set(listenerId, {
            element,
            event,
            handler,
            options,
            addedAt: new Date()
        });

        logger.log(`✅ Event listener added: ${event} (ID: ${listenerId})`);
        return listenerId;
    }

    /**
     * Remove event listener by ID
     * @param {number} listenerId
     */
    remove(listenerId) {
        const listener = this.listeners.get(listenerId);
        if (!listener) {
            logger.warn(`EventManager.remove: Listener ${listenerId} not found`);
            return false;
        }

        const { element, event, handler, options } = listener;
        element.removeEventListener(event, handler, options);
        this.listeners.delete(listenerId);

        logger.log(`🗑️ Event listener removed: ${event} (ID: ${listenerId})`);
        return true;
    }

    /**
     * Remove tất cả listeners từ một element
     * @param {HTMLElement} element
     */
    removeFromElement(element) {
        let removed = 0;
        for (const [id, listener] of this.listeners.entries()) {
            if (listener.element === element) {
                this.remove(id);
                removed++;
            }
        }
        logger.log(`🗑️ Removed ${removed} listeners from element`);
        return removed;
    }

    /**
     * Remove tất cả listeners của một event type
     * @param {string} eventType
     */
    removeByEvent(eventType) {
        let removed = 0;
        for (const [id, listener] of this.listeners.entries()) {
            if (listener.event === eventType) {
                this.remove(id);
                removed++;
            }
        }
        logger.log(`🗑️ Removed ${removed} listeners for event: ${eventType}`);
        return removed;
    }

    /**
     * Remove ALL listeners (cleanup khi chuyển trang)
     */
    removeAll() {
        const count = this.listeners.size;
        for (const [id] of this.listeners.entries()) {
            this.remove(id);
        }
        logger.log(`🗑️ Removed all ${count} listeners`);
        return count;
    }

    /**
     * Get stats về listeners hiện tại
     */
    getStats() {
        const stats = {
            total: this.listeners.size,
            byEvent: {},
            byElement: new Map()
        };

        for (const listener of this.listeners.values()) {
            // Count by event type
            stats.byEvent[listener.event] = (stats.byEvent[listener.event] || 0) + 1;

            // Count by element
            const elementCount = stats.byElement.get(listener.element) || 0;
            stats.byElement.set(listener.element, elementCount + 1);
        }

        return stats;
    }

    /**
     * Delegated event listener (hiệu quả hơn cho dynamic elements)
     * @param {HTMLElement} parent
     * @param {string} event
     * @param {string} selector
     * @param {Function} handler
     */
    delegate(parent, event, selector, handler) {
        const delegatedHandler = (e) => {
            const target = e.target.closest(selector);
            if (target) {
                handler.call(target, e);
            }
        };

        return this.add(parent, event, delegatedHandler);
    }

    /**
     * One-time event listener (tự động remove sau khi trigger)
     * @param {HTMLElement} element
     * @param {string} event
     * @param {Function} handler
     */
    once(element, event, handler) {
        const onceHandler = (e) => {
            handler(e);
            this.remove(listenerId);
        };

        const listenerId = this.add(element, event, onceHandler);
        return listenerId;
    }
}

// Global instance
const eventManager = new EventManager();

// Auto cleanup khi page unload (CRITICAL để prevent memory leaks)
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        eventManager.removeAll();
    });

    // Export to window
    window.EventManager = EventManager;
    window.eventManager = eventManager;
}

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventManager, eventManager };
}
