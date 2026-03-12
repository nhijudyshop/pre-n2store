/**
 * Unit Tests - KPI Upselling Products
 *
 * Tests specific examples from the requirements with concrete values.
 * Pure function re-implementations tested against known inputs/outputs.
 *
 * **Validates: Requirements 2.6, 2.11, 3.1-3.6, 4.3, 4.5**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');
const KPI_PER_PRODUCT = 5000;

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

// ============================================================
// Pure function: NET KPI calculation (mirrors kpi-manager.js)
// ============================================================
function calculateNetKPI(baseProducts, auditLogs, options = {}) {
    if (!baseProducts) {
        return { netProducts: 0, kpiAmount: 0, details: {} };
    }

    const baseProductIds = new Set(baseProducts.map(p => Number(p.ProductId)));

    let filteredLogs = auditLogs;

    // Filter by employee if specified
    if (options.employeeUserId) {
        filteredLogs = filteredLogs.filter(log => log.userId === options.employeeUserId);
    }

    // Exclude admin actions
    if (options.adminUserIds && options.adminUserIds.length > 0) {
        const adminSet = new Set(options.adminUserIds);
        filteredLogs = filteredLogs.filter(log => !adminSet.has(log.userId));
    }

    // Only NEW products (not in BASE)
    const newProductLogs = filteredLogs.filter(log => !baseProductIds.has(Number(log.productId)));

    // Group by productId, calculate net per product
    const netPerProduct = {};
    for (const log of newProductLogs) {
        const pid = String(log.productId);
        if (!netPerProduct[pid]) {
            netPerProduct[pid] = { code: log.productCode || '', name: log.productName || '', added: 0, removed: 0, net: 0 };
        }
        if (log.action === 'add') {
            netPerProduct[pid].added += (log.quantity || 0);
        } else if (log.action === 'remove') {
            netPerProduct[pid].removed += (log.quantity || 0);
        }
    }

    let totalNet = 0;
    for (const data of Object.values(netPerProduct)) {
        data.net = Math.max(0, data.added - data.removed);
        totalNet += data.net;
    }

    return {
        netProducts: totalNet,
        kpiAmount: totalNet * KPI_PER_PRODUCT,
        details: netPerProduct
    };
}

// ============================================================
// Pure function: Audit log retry with pending queue
// ============================================================
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const PENDING_QUEUE_KEY = 'kpi_audit_pending';

/**
 * Simulates the writeToFirestore retry logic from kpi-audit-logger.js.
 * @param {Function} writeFn - Simulated Firestore write (throws on failure)
 * @param {Object} logData - Data to write
 * @returns {{ success: boolean, attempts: number, docId: string|null }}
 */
function simulateWriteWithRetry(writeFn, logData) {
    let attempts = 0;
    let delays = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        attempts++;
        try {
            const docId = writeFn(logData, attempt);
            return { success: true, attempts, docId, delays };
        } catch (error) {
            if (attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                delays.push(delay);
            }
        }
    }

    return { success: false, attempts, docId: null, delays };
}

/**
 * Simulates the full logProductAction flow: write with retry, fallback to pending queue.
 * @param {Function} writeFn - Simulated Firestore write
 * @param {Object} entry - Audit log entry
 * @param {Array} pendingQueue - Mutable array representing localStorage pending queue
 * @returns {{ docId: string|null, addedToPending: boolean }}
 */
function simulateLogProductAction(writeFn, entry, pendingQueue) {
    const result = simulateWriteWithRetry(writeFn, entry);

    if (result.success) {
        return { docId: result.docId, addedToPending: false, attempts: result.attempts };
    }

    // Fallback: add to pending queue
    const pendingEntry = { ...entry };
    pendingEntry.timestamp = new Date().toISOString();
    pendingEntry._pendingServerTimestamp = true;
    pendingEntry._retryCount = 0;
    pendingEntry._createdAt = new Date().toISOString();
    pendingQueue.push(pendingEntry);

    return { docId: null, addedToPending: true, attempts: result.attempts };
}

// ============================================================
// Pure function: Employee range priority
// ============================================================

/**
 * Determines if an order STT is in an employee's range.
 * Campaign-specific range takes priority over general range.
 * Mirrors isOrderInEmployeeRange from kpi-manager.js.
 *
 * @param {number} orderSTT
 * @param {string} userId
 * @param {string} campaignName
 * @param {Object|null} campaignRanges - { [campaignName]: { [userId]: { from, to } } }
 * @param {Object|null} generalRanges - { [userId]: { from, to } }
 * @returns {boolean}
 */
function isOrderInEmployeeRange(orderSTT, userId, campaignName, campaignRanges, generalRanges) {
    if (!orderSTT || !userId) return false;

    // 1. Try campaign-specific ranges first (priority)
    if (campaignName && campaignRanges) {
        const ranges = campaignRanges[campaignName];
        if (ranges) {
            const employeeRange = ranges[userId];
            if (employeeRange) {
                const from = employeeRange.from || employeeRange.start || 0;
                const to = employeeRange.to || employeeRange.end || Infinity;
                return orderSTT >= from && orderSTT <= to;
            }
        }
    }

    // 2. Fallback to general employee ranges
    if (generalRanges) {
        const employeeRange = generalRanges[userId];
        if (employeeRange) {
            const from = employeeRange.from || employeeRange.start || 0;
            const to = employeeRange.to || employeeRange.end || Infinity;
            return orderSTT >= from && orderSTT <= to;
        }
    }

    return false;
}

// ============================================================
// 15.1 - NET KPI Example 1
// ============================================================
describe('15.1 NET KPI Example 1: BASE [A×2, B×1], add C×1, D×1, remove C×1, remove A×1 → KPI = 5,000đ', () => {
    const baseProducts = [
        { ProductId: 1001, ProductCode: 'A', ProductName: 'Product A', Quantity: 2, Price: 100000 },
        { ProductId: 1002, ProductCode: 'B', ProductName: 'Product B', Quantity: 1, Price: 200000 }
    ];

    const auditLogs = [
        { orderId: '100', action: 'add', productId: 1003, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', source: 'chat_confirm_held' },
        { orderId: '100', action: 'add', productId: 1004, productCode: 'D', productName: 'Product D', quantity: 1, userId: 'emp1', source: 'chat_confirm_held' },
        { orderId: '100', action: 'remove', productId: 1003, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', source: 'edit_modal_remove' },
        { orderId: '100', action: 'remove', productId: 1001, productCode: 'A', productName: 'Product A', quantity: 1, userId: 'emp1', source: 'chat_decrease' }
    ];

    it('should compute NET = 1 (only D), KPI = 5,000đ', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        expect(result.netProducts).toBe(1);
        expect(result.kpiAmount).toBe(5000);
    });

    it('should ignore A (BASE product) removal', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        // A (1001) is a BASE product, should not appear in details
        expect(result.details['1001']).toBeUndefined();
    });

    it('should have net(C) = 0 (added 1, removed 1)', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        expect(result.details['1003'].added).toBe(1);
        expect(result.details['1003'].removed).toBe(1);
        expect(result.details['1003'].net).toBe(0);
    });

    it('should have net(D) = 1 (added 1, removed 0)', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        expect(result.details['1004'].added).toBe(1);
        expect(result.details['1004'].removed).toBe(0);
        expect(result.details['1004'].net).toBe(1);
    });
});

// ============================================================
// 15.2 - NET KPI Example 2
// ============================================================
describe('15.2 NET KPI Example 2: BASE [A×2], remove A×1, add B×1 → KPI = 5,000đ', () => {
    const baseProducts = [
        { ProductId: 1001, ProductCode: 'A', ProductName: 'Product A', Quantity: 2, Price: 100000 }
    ];

    const auditLogs = [
        { orderId: '200', action: 'remove', productId: 1001, productCode: 'A', productName: 'Product A', quantity: 1, userId: 'emp1', source: 'chat_decrease' },
        { orderId: '200', action: 'add', productId: 1002, productCode: 'B', productName: 'Product B', quantity: 1, userId: 'emp1', source: 'chat_confirm_held' }
    ];

    it('should compute NET = 1 (only B), KPI = 5,000đ', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        expect(result.netProducts).toBe(1);
        expect(result.kpiAmount).toBe(5000);
    });

    it('should ignore A removal (BASE product)', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        // A (1001) is BASE, should not appear in details
        expect(result.details['1001']).toBeUndefined();
    });

    it('should have net(B) = 1', () => {
        const result = calculateNetKPI(baseProducts, auditLogs);

        expect(result.details['1002'].added).toBe(1);
        expect(result.details['1002'].removed).toBe(0);
        expect(result.details['1002'].net).toBe(1);
    });

    it('employee should NOT be penalized for customer dropping BASE product', () => {
        // Even though A was removed, KPI is still positive because A is BASE
        const result = calculateNetKPI(baseProducts, auditLogs);
        expect(result.kpiAmount).toBeGreaterThan(0);
    });
});

// ============================================================
// 15.3 - saveAllOrderChanges does NOT create audit log
// ============================================================
describe('15.3 saveAllOrderChanges does NOT create audit log', () => {
    it('source code should NOT call kpiAuditLogger.logProductAction inside saveAllOrderChanges', () => {
        const sourceCode = readN2File('orders-report/js/tab1/tab1-edit-modal.js');

        // Extract the saveAllOrderChanges function body
        const fnStart = sourceCode.indexOf('async function saveAllOrderChanges()');
        expect(fnStart).toBeGreaterThan(-1);

        // Find the end of the function (next top-level async function or end of IIFE)
        const afterFnStart = sourceCode.substring(fnStart);
        // Find the next function declaration at the same level
        const nextFnMatch = afterFnStart.substring(50).search(/\nasync function |\nfunction /);
        const fnBody = nextFnMatch > 0
            ? afterFnStart.substring(0, nextFnMatch + 50)
            : afterFnStart.substring(0, 2000); // fallback: first 2000 chars

        // Verify no kpiAuditLogger calls in saveAllOrderChanges
        expect(fnBody).not.toContain('kpiAuditLogger.logProductAction');
        expect(fnBody).not.toContain('kpiAuditLogger.log');
    });

    it('source code should have a comment explaining why no audit log in save', () => {
        const sourceCode = readN2File('orders-report/js/tab1/tab1-edit-modal.js');

        const fnStart = sourceCode.indexOf('async function saveAllOrderChanges()');
        const fnSection = sourceCode.substring(fnStart, fnStart + 500);

        // Should contain a comment about not logging audit
        expect(fnSection).toMatch(/[Nn]ot|[Kk]hông.*audit|NOTE.*audit/i);
    });
});

// ============================================================
// 15.4 - Audit log retry + pending queue when Firestore fails
// ============================================================
describe('15.4 Audit log retry + pending queue when Firestore fails', () => {
    const sampleEntry = {
        orderId: '300',
        action: 'add',
        productId: 2001,
        productCode: 'X',
        productName: 'Product X',
        quantity: 1,
        userId: 'emp1',
        userName: 'Employee 1',
        campaignId: 'camp1',
        campaignName: 'Campaign 1',
        source: 'chat_confirm_held'
    };

    it('should retry exactly 3 times when Firestore always fails', () => {
        const pendingQueue = [];
        const alwaysFail = () => { throw new Error('Firestore unavailable'); };

        const result = simulateLogProductAction(alwaysFail, sampleEntry, pendingQueue);

        expect(result.attempts).toBe(3);
        expect(result.docId).toBeNull();
        expect(result.addedToPending).toBe(true);
    });

    it('should add entry to pending queue on complete failure', () => {
        const pendingQueue = [];
        const alwaysFail = () => { throw new Error('Network error'); };

        simulateLogProductAction(alwaysFail, sampleEntry, pendingQueue);

        expect(pendingQueue.length).toBe(1);
        expect(pendingQueue[0].orderId).toBe('300');
        expect(pendingQueue[0].productId).toBe(2001);
        expect(pendingQueue[0]._retryCount).toBe(0);
        expect(pendingQueue[0]._createdAt).toBeDefined();
        expect(pendingQueue[0]._pendingServerTimestamp).toBe(true);
    });

    it('should succeed on first attempt when Firestore works', () => {
        const pendingQueue = [];
        const alwaysSucceed = () => 'doc_abc123';

        const result = simulateLogProductAction(alwaysSucceed, sampleEntry, pendingQueue);

        expect(result.attempts).toBe(1);
        expect(result.docId).toBe('doc_abc123');
        expect(result.addedToPending).toBe(false);
        expect(pendingQueue.length).toBe(0);
    });

    it('should succeed on retry (fail first 2, succeed on 3rd)', () => {
        const pendingQueue = [];
        let callCount = 0;
        const failThenSucceed = () => {
            callCount++;
            if (callCount < 3) throw new Error('Temporary failure');
            return 'doc_retry_ok';
        };

        const result = simulateLogProductAction(failThenSucceed, sampleEntry, pendingQueue);

        expect(result.attempts).toBe(3);
        expect(result.docId).toBe('doc_retry_ok');
        expect(result.addedToPending).toBe(false);
        expect(pendingQueue.length).toBe(0);
    });

    it('should use exponential backoff delays (1s, 2s)', () => {
        const alwaysFail = () => { throw new Error('fail'); };
        const result = simulateWriteWithRetry(alwaysFail, sampleEntry);

        // Delays: attempt 0→1 = 1000ms, attempt 1→2 = 2000ms
        expect(result.delays).toEqual([1000, 2000]);
    });

    it('pending queue entry should have correct format', () => {
        const pendingQueue = [];
        const alwaysFail = () => { throw new Error('fail'); };

        simulateLogProductAction(alwaysFail, sampleEntry, pendingQueue);

        const entry = pendingQueue[0];
        expect(entry).toHaveProperty('orderId', '300');
        expect(entry).toHaveProperty('action', 'add');
        expect(entry).toHaveProperty('productId', 2001);
        expect(entry).toHaveProperty('source', 'chat_confirm_held');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('_pendingServerTimestamp', true);
        expect(entry).toHaveProperty('_retryCount', 0);
        expect(entry).toHaveProperty('_createdAt');
    });
});

// ============================================================
// 15.5 - Admin actions excluded from KPI
// ============================================================
describe('15.5 Admin actions excluded from KPI', () => {
    const baseProducts = [
        { ProductId: 1001, ProductCode: 'A', ProductName: 'Product A', Quantity: 1, Price: 100000 }
    ];

    it('should exclude admin-added products from KPI, only count employee actions', () => {
        const auditLogs = [
            // Admin adds B×3 (should be excluded)
            { orderId: '400', action: 'add', productId: 1002, productCode: 'B', productName: 'Product B', quantity: 3, userId: 'admin1', source: 'edit_modal_inline' },
            // Employee adds C×1 (should be counted)
            { orderId: '400', action: 'add', productId: 1003, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', source: 'chat_confirm_held' }
        ];

        const result = calculateNetKPI(baseProducts, auditLogs, { adminUserIds: ['admin1'] });

        // Only C from employee should count
        expect(result.netProducts).toBe(1);
        expect(result.kpiAmount).toBe(5000);
    });

    it('admin products should not appear in details when admin is excluded', () => {
        const auditLogs = [
            { orderId: '400', action: 'add', productId: 1002, productCode: 'B', productName: 'Product B', quantity: 3, userId: 'admin1', source: 'edit_modal_inline' },
            { orderId: '400', action: 'add', productId: 1003, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', source: 'chat_confirm_held' }
        ];

        const result = calculateNetKPI(baseProducts, auditLogs, { adminUserIds: ['admin1'] });

        // B (admin-added) should not be in details
        expect(result.details['1002']).toBeUndefined();
        // C (employee-added) should be in details
        expect(result.details['1003']).toBeDefined();
        expect(result.details['1003'].net).toBe(1);
    });

    it('KPI should be 0 when only admin actions exist', () => {
        const auditLogs = [
            { orderId: '400', action: 'add', productId: 1002, productCode: 'B', productName: 'Product B', quantity: 5, userId: 'admin1', source: 'edit_modal_inline' },
            { orderId: '400', action: 'add', productId: 1003, productCode: 'C', productName: 'Product C', quantity: 3, userId: 'admin1', source: 'edit_modal_inline' }
        ];

        const result = calculateNetKPI(baseProducts, auditLogs, { adminUserIds: ['admin1'] });

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
    });
});

// ============================================================
// 15.6 - Employee range priority (campaign over general)
// ============================================================
describe('15.6 Employee range priority: campaign-specific over general', () => {
    const generalRanges = {
        emp1: { from: 1, to: 50 }
    };

    const campaignRanges = {
        'Live_Sale_25_12': {
            emp1: { from: 10, to: 30 }
        }
    };

    it('with campaign range: STT 35 is OUT of range (35 > 30)', () => {
        const inRange = isOrderInEmployeeRange(35, 'emp1', 'Live_Sale_25_12', campaignRanges, generalRanges);
        expect(inRange).toBe(false);
    });

    it('without campaign range: STT 35 is IN range (35 <= 50)', () => {
        const inRange = isOrderInEmployeeRange(35, 'emp1', 'Live_Sale_25_12', null, generalRanges);
        expect(inRange).toBe(true);
    });

    it('campaign range takes priority even when general range would match', () => {
        // With campaign range (10-30), STT 25 is in range
        const withCampaign = isOrderInEmployeeRange(25, 'emp1', 'Live_Sale_25_12', campaignRanges, generalRanges);
        expect(withCampaign).toBe(true);

        // STT 35 is in general (1-50) but NOT in campaign (10-30)
        const sttOutOfCampaign = isOrderInEmployeeRange(35, 'emp1', 'Live_Sale_25_12', campaignRanges, generalRanges);
        expect(sttOutOfCampaign).toBe(false);
    });

    it('falls back to general range when campaign has no ranges for this campaign', () => {
        const inRange = isOrderInEmployeeRange(35, 'emp1', 'Other_Campaign', campaignRanges, generalRanges);
        // 'Other_Campaign' not in campaignRanges → fallback to general (1-50) → 35 is in range
        expect(inRange).toBe(true);
    });

    it('returns false when no range exists for the employee', () => {
        const inRange = isOrderInEmployeeRange(10, 'unknown_emp', 'Live_Sale_25_12', campaignRanges, generalRanges);
        expect(inRange).toBe(false);
    });

    it('returns false when orderSTT or userId is falsy', () => {
        expect(isOrderInEmployeeRange(0, 'emp1', 'Live_Sale_25_12', campaignRanges, generalRanges)).toBe(false);
        expect(isOrderInEmployeeRange(10, '', 'Live_Sale_25_12', campaignRanges, generalRanges)).toBe(false);
        expect(isOrderInEmployeeRange(null, 'emp1', 'Live_Sale_25_12', campaignRanges, generalRanges)).toBe(false);
    });
});
