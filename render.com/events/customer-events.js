/**
 * =====================================================
 * CUSTOMER EVENTS - Event-Driven Architecture
 * =====================================================
 *
 * Central event system for Customer 360, Wallet, Ticket, and Balance History
 *
 * Events:
 *   customer.created     - New customer created
 *   customer.updated     - Customer info updated
 *   wallet.deposited     - Real balance deposited
 *   wallet.credited      - Virtual credit issued
 *   wallet.withdrawn     - Balance withdrawn
 *   wallet.expired       - Virtual credit expired
 *   ticket.created       - New ticket created
 *   ticket.updated       - Ticket status changed
 *   ticket.resolved      - Ticket resolved with/without compensation
 *   balance.linked       - Bank transaction linked to customer
 *   rfm.updated          - Customer RFM score recalculated
 *
 * Created: 2026-01-12
 * Part of: Unified Architecture Plan
 * =====================================================
 */

const EventEmitter = require('events');

class CustomerEventEmitter extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Allow many listeners
    }
}

// Singleton instance
const customerEvents = new CustomerEventEmitter();

// =====================================================
// EVENT DEFINITIONS
// =====================================================

const EVENTS = {
    // Customer events
    CUSTOMER_CREATED: 'customer.created',
    CUSTOMER_UPDATED: 'customer.updated',

    // Wallet events
    WALLET_DEPOSITED: 'wallet.deposited',
    WALLET_CREDITED: 'wallet.credited',
    WALLET_WITHDRAWN: 'wallet.withdrawn',
    WALLET_EXPIRED: 'wallet.expired',

    // Ticket events
    TICKET_CREATED: 'ticket.created',
    TICKET_UPDATED: 'ticket.updated',
    TICKET_RESOLVED: 'ticket.resolved',

    // Balance History events
    BALANCE_LINKED: 'balance.linked',
    BALANCE_UNLINKED: 'balance.unlinked',

    // RFM events
    RFM_UPDATED: 'rfm.updated',
    RFM_BATCH_COMPLETED: 'rfm.batch.completed'
};

// =====================================================
// EVENT HANDLERS SETUP
// =====================================================

/**
 * Setup default event handlers
 * @param {Object} dependencies - { db, logger, notificationService }
 */
function setupEventHandlers(dependencies = {}) {
    const { db, logger = console, notificationService } = dependencies;

    // =====================================================
    // TICKET RESOLVED → WALLET CREDIT
    // =====================================================
    customerEvents.on(EVENTS.TICKET_RESOLVED, async (data) => {
        try {
            const { ticket_code, customer_id, phone, compensation_amount, compensation_type } = data;

            if (compensation_amount && compensation_amount > 0 && compensation_type === 'virtual_credit') {
                logger.info(`[Event] Ticket ${ticket_code} resolved with compensation ${compensation_amount}`);

                // This is now handled inline in the resolve endpoint
                // But we can add additional processing here like notifications
                if (notificationService) {
                    await notificationService.notify(phone, {
                        type: 'ticket_resolved',
                        message: `Ticket ${ticket_code} đã được giải quyết. Bạn đã nhận ${compensation_amount.toLocaleString()}đ công nợ ảo.`
                    });
                }
            }
        } catch (error) {
            logger.error('[Event] Failed to process ticket resolved event:', error);
        }
    });

    // =====================================================
    // BALANCE LINKED → WALLET DEPOSIT
    // =====================================================
    customerEvents.on(EVENTS.BALANCE_LINKED, async (data) => {
        try {
            const { transaction_id, phone, amount, auto_deposited } = data;

            if (auto_deposited) {
                logger.info(`[Event] Balance ${transaction_id} linked and deposited: ${amount} to ${phone}`);

                if (notificationService) {
                    await notificationService.notify(phone, {
                        type: 'wallet_deposit',
                        message: `Tài khoản đã được nạp ${amount.toLocaleString()}đ từ chuyển khoản ngân hàng.`
                    });
                }
            }
        } catch (error) {
            logger.error('[Event] Failed to process balance linked event:', error);
        }
    });

    // =====================================================
    // WALLET CREDITED → RFM UPDATE
    // =====================================================
    customerEvents.on(EVENTS.WALLET_CREDITED, async (data) => {
        try {
            const { customer_id, phone, amount, source_type } = data;
            logger.info(`[Event] Wallet credited: ${amount} to ${phone} (${source_type})`);

            // Could trigger RFM recalculation or other processing
        } catch (error) {
            logger.error('[Event] Failed to process wallet credited event:', error);
        }
    });

    // =====================================================
    // CUSTOMER CREATED → AUTO ACTIONS
    // =====================================================
    customerEvents.on(EVENTS.CUSTOMER_CREATED, async (data) => {
        try {
            const { customer_id, phone, name } = data;
            logger.info(`[Event] New customer created: ${name} (${phone})`);

            // Wallet is auto-created by trigger, but we can do additional setup
        } catch (error) {
            logger.error('[Event] Failed to process customer created event:', error);
        }
    });

    // =====================================================
    // RFM BATCH COMPLETED → LOGGING
    // =====================================================
    customerEvents.on(EVENTS.RFM_BATCH_COMPLETED, async (data) => {
        try {
            const { updated_count, segment_distribution, duration_ms } = data;
            logger.info(`[Event] RFM batch completed: ${updated_count} customers updated in ${duration_ms}ms`);
            logger.info(`[Event] Segment distribution:`, segment_distribution);
        } catch (error) {
            logger.error('[Event] Failed to process RFM batch completed event:', error);
        }
    });

    logger.info('[Events] Customer event handlers initialized');
}

// =====================================================
// HELPER FUNCTIONS FOR EMITTING EVENTS
// =====================================================

/**
 * Emit customer created event
 */
function emitCustomerCreated(data) {
    customerEvents.emit(EVENTS.CUSTOMER_CREATED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit wallet deposited event
 */
function emitWalletDeposited(data) {
    customerEvents.emit(EVENTS.WALLET_DEPOSITED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit wallet credited event
 */
function emitWalletCredited(data) {
    customerEvents.emit(EVENTS.WALLET_CREDITED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit ticket created event
 */
function emitTicketCreated(data) {
    customerEvents.emit(EVENTS.TICKET_CREATED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit ticket resolved event
 */
function emitTicketResolved(data) {
    customerEvents.emit(EVENTS.TICKET_RESOLVED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit balance linked event
 */
function emitBalanceLinked(data) {
    customerEvents.emit(EVENTS.BALANCE_LINKED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit RFM updated event
 */
function emitRfmUpdated(data) {
    customerEvents.emit(EVENTS.RFM_UPDATED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Emit RFM batch completed event
 */
function emitRfmBatchCompleted(data) {
    customerEvents.emit(EVENTS.RFM_BATCH_COMPLETED, {
        ...data,
        timestamp: new Date().toISOString()
    });
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    customerEvents,
    EVENTS,
    setupEventHandlers,
    // Emit helpers
    emitCustomerCreated,
    emitWalletDeposited,
    emitWalletCredited,
    emitTicketCreated,
    emitTicketResolved,
    emitBalanceLinked,
    emitRfmUpdated,
    emitRfmBatchCompleted
};
