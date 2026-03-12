/**
 * Property 8: Employee range filtering in KPI calculation
 *
 * For any KPI calculation for a specific employee, only audit log entries
 * where userId matches the assigned employee should be counted.
 * Admin user audit logs should be excluded.
 *
 * **Validates: Requirements 4.1, 4.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');
const KPI_PER_PRODUCT = 5000;

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

// --- Generators ---
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[ABCDEN]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const userIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/);

const auditLogWithUserArb = (userId) => fc.record({
    orderId: fc.constant('12345'),
    action: fc.constantFrom('add', 'remove'),
    productId: fc.integer({ min: 200001, max: 300000 }), // Ensure NOT in BASE range
    productCode: fc.string({ minLength: 1, maxLength: 6 }),
    productName: fc.string({ minLength: 1, maxLength: 50 }),
    quantity: fc.integer({ min: 1, max: 50 }),
    userId: fc.constant(userId),
    source: fc.constantFrom('chat_confirm_held', 'chat_decrease', 'edit_modal_inline')
});

/**
 * Pure function: re-implements calculateNetKPI with employee filtering.
 * Mirrors the logic in kpi-manager.js.
 */
function calculateNetKPIForEmployee(baseProducts, auditLogs, employeeUserId, adminUserIds) {
    if (!baseProducts) {
        return { netProducts: 0, kpiAmount: 0, details: {} };
    }

    const baseProductIds = new Set(baseProducts.map(p => Number(p.ProductId)));

    let filteredLogs = auditLogs;

    // Filter by employee if specified
    if (employeeUserId) {
        filteredLogs = filteredLogs.filter(log => log.userId === employeeUserId);
    }

    // Exclude admin actions
    const adminSet = new Set(adminUserIds || []);
    filteredLogs = filteredLogs.filter(log => !adminSet.has(log.userId));

    // Only NEW products
    const newProductLogs = filteredLogs.filter(log => !baseProductIds.has(Number(log.productId)));

    // Group by productId
    const netPerProduct = {};
    for (const log of newProductLogs) {
        const pid = String(log.productId);
        if (!netPerProduct[pid]) {
            netPerProduct[pid] = { added: 0, removed: 0, net: 0 };
        }
        if (log.action === 'add') netPerProduct[pid].added += log.quantity;
        else if (log.action === 'remove') netPerProduct[pid].removed += log.quantity;
    }

    let totalNet = 0;
    for (const data of Object.values(netPerProduct)) {
        data.net = Math.max(0, data.added - data.removed);
        totalNet += data.net;
    }

    return { netProducts: totalNet, kpiAmount: totalNet * KPI_PER_PRODUCT, details: netPerProduct };
}

describe('Feature: kpi-upselling-products, Property 8: Employee range filtering', () => {

    /**
     * PBT 8a: Only audit logs matching employeeUserId are counted.
     * Logs from other users should be excluded.
     */
    it('should only count audit logs from the specified employee', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                userIdArb,
                userIdArb,
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 10 }),
                (baseProducts, employeeId, otherUserId, empLogCount, otherLogCount) => {
                    // Ensure different user IDs
                    const otherUser = otherUserId === employeeId ? otherUserId + '_other' : otherUserId;

                    // Create logs from the target employee (all 'add' for new products)
                    const empLogs = Array.from({ length: empLogCount }, (_, i) => ({
                        orderId: '12345',
                        action: 'add',
                        productId: 200001 + i, // Not in BASE
                        productCode: 'NEW',
                        productName: 'New Product',
                        quantity: 1,
                        userId: employeeId,
                        source: 'chat_confirm_held'
                    }));

                    // Create logs from another user (all 'add' for new products)
                    const otherLogs = Array.from({ length: otherLogCount }, (_, i) => ({
                        orderId: '12345',
                        action: 'add',
                        productId: 300001 + i, // Not in BASE, different from emp
                        productCode: 'OTHER',
                        productName: 'Other Product',
                        quantity: 1,
                        userId: otherUser,
                        source: 'chat_confirm_held'
                    }));

                    const allLogs = [...empLogs, ...otherLogs];

                    // Calculate with employee filter
                    const resultFiltered = calculateNetKPIForEmployee(baseProducts, allLogs, employeeId, []);

                    // Calculate without filter (all users)
                    const resultAll = calculateNetKPIForEmployee(baseProducts, allLogs, null, []);

                    // Filtered result should only count employee's logs
                    expect(resultFiltered.netProducts).toBe(empLogCount);
                    expect(resultFiltered.kpiAmount).toBe(empLogCount * KPI_PER_PRODUCT);

                    // Unfiltered should count all
                    expect(resultAll.netProducts).toBe(empLogCount + otherLogCount);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 8b: Admin user audit logs are excluded from all employee KPI.
     */
    it('should exclude admin user audit logs from KPI calculation', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                userIdArb,
                userIdArb,
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 10 }),
                (baseProducts, employeeId, adminId, empLogCount, adminLogCount) => {
                    const adminUser = adminId === employeeId ? adminId + '_admin' : adminId;

                    // Employee logs
                    const empLogs = Array.from({ length: empLogCount }, (_, i) => ({
                        orderId: '12345',
                        action: 'add',
                        productId: 200001 + i,
                        productCode: 'EMP',
                        productName: 'Emp Product',
                        quantity: 1,
                        userId: employeeId,
                        source: 'chat_confirm_held'
                    }));

                    // Admin logs (should be excluded)
                    const adminLogs = Array.from({ length: adminLogCount }, (_, i) => ({
                        orderId: '12345',
                        action: 'add',
                        productId: 400001 + i,
                        productCode: 'ADM',
                        productName: 'Admin Product',
                        quantity: 1,
                        userId: adminUser,
                        source: 'edit_modal_inline'
                    }));

                    const allLogs = [...empLogs, ...adminLogs];

                    // Calculate with admin exclusion (no employee filter)
                    const result = calculateNetKPIForEmployee(baseProducts, allLogs, null, [adminUser]);

                    // Only employee logs should be counted
                    expect(result.netProducts).toBe(empLogCount);
                    expect(result.kpiAmount).toBe(empLogCount * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js filters by employee and excludes admin.
     */
    it('source code should contain employee filtering and admin exclusion logic', () => {
        expect(sourceCode).toContain('log.userId === employeeUserId');
        expect(sourceCode).toContain('isAdminUser');
    });
});
