/**
 * =====================================================
 * EVENTS MODULE - Index
 * =====================================================
 *
 * Central export for all event modules
 *
 * Created: 2026-01-12
 * =====================================================
 */

const customerEvents = require('./customer-events');

module.exports = {
    ...customerEvents
};
