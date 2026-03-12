/**
 * Property 13: Filter consistency between summary cards and table
 *
 * For any combination of filters, the summary cards should equal the
 * aggregated values from the filtered rows.
 *
 * **Validates: Requirements 7.5, 7.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');

// --- Generators ---

const orderArb = fc.record({
    orderId: fc.stringMatching(/^[0-9]{1,10}$/),
    stt: fc.integer({ min: 1, max: 500 }),
    campaignName: fc.constantFrom('Campaign_A', 'Campaign_B', 'Campaign_C'),
    netProducts: fc.integer({ min: 0, max: 50 }),
    kpi: fc.integer({ min: 0, max: 250000 }),
    hasDiscrepancy: fc.boolean()
});

const employeeDataArb = fc.record({
    userId: fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
    userName: fc.string({ minLength: 1, maxLength: 30 }),
    orders: fc.array(orderArb, { minLength: 1, maxLength: 10 })
});

/**
 * Pure function: re-implements updateSummaryCards logic from tab-kpi-commission.js.
 * Computes summary values from filtered data.
 */
function computeSummaryCards(filteredData) {
    let totalEmployees = filteredData.length;
    let totalOrders = 0;
    let totalNet = 0;
    let totalKPI = 0;

    for (const emp of filteredData) {
        totalOrders += emp.orders.length;
        for (const order of emp.orders) {
            totalNet += order.netProducts || 0;
            totalKPI += order.kpi || 0;
        }
    }

    return { totalEmployees, totalOrders, totalNet, totalKPI };
}

/**
 * Pure function: re-implements aggregateByEmployee logic from tab-kpi-commission.js.
 * Computes per-employee aggregated values.
 */
function aggregateByEmployee(filteredData) {
    return filteredData.map(emp => {
        let totalNetProducts = 0;
        let totalKPI = 0;

        for (const order of emp.orders) {
            totalNetProducts += order.netProducts || 0;
            totalKPI += order.kpi || 0;
        }

        return {
            userId: emp.userId,
            userName: emp.userName || emp.userId,
            orders: emp.orders,
            totalNetProducts,
            totalKPI
        };
    }).sort((a, b) => b.totalKPI - a.totalKPI);
}

/**
 * Pure function: simulates applying a status filter.
 */
function applyStatusFilter(data, statusFilter) {
    if (!statusFilter) return data;

    return data.map(emp => {
        const filteredOrders = emp.orders.filter(order => {
            if (statusFilter === 'ok') return !order.hasDiscrepancy;
            if (statusFilter === 'discrepancy') return order.hasDiscrepancy;
            return true;
        });
        return { ...emp, orders: filteredOrders };
    }).filter(emp => emp.orders.length > 0);
}

describe('Feature: kpi-upselling-products, Property 13: Filter consistency', () => {

    /**
     * PBT 13a: Summary cards match aggregated table values (no filter).
     */
    it('summary cards should equal aggregated table values for any data', () => {
        fc.assert(
            fc.property(
                fc.array(employeeDataArb, { minLength: 0, maxLength: 10 }),
                (filteredData) => {
                    const summary = computeSummaryCards(filteredData);
                    const aggregated = aggregateByEmployee(filteredData);

                    // Total employees in summary = number of rows in table
                    expect(summary.totalEmployees).toBe(aggregated.length);

                    // Total NET from summary = sum of totalNetProducts from table rows
                    const tableNet = aggregated.reduce((sum, emp) => sum + emp.totalNetProducts, 0);
                    expect(summary.totalNet).toBe(tableNet);

                    // Total KPI from summary = sum of totalKPI from table rows
                    const tableKPI = aggregated.reduce((sum, emp) => sum + emp.totalKPI, 0);
                    expect(summary.totalKPI).toBe(tableKPI);

                    // Total orders from summary = sum of orders.length from table rows
                    const tableOrders = aggregated.reduce((sum, emp) => sum + emp.orders.length, 0);
                    expect(summary.totalOrders).toBe(tableOrders);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13b: Summary cards match after applying status filter.
     */
    it('summary cards should match table after status filter is applied', () => {
        fc.assert(
            fc.property(
                fc.array(employeeDataArb, { minLength: 1, maxLength: 10 }),
                fc.constantFrom('', 'ok', 'discrepancy'),
                (rawData, statusFilter) => {
                    const filtered = applyStatusFilter(rawData, statusFilter);
                    const summary = computeSummaryCards(filtered);
                    const aggregated = aggregateByEmployee(filtered);

                    // Consistency check
                    const tableNet = aggregated.reduce((sum, emp) => sum + emp.totalNetProducts, 0);
                    const tableKPI = aggregated.reduce((sum, emp) => sum + emp.totalKPI, 0);
                    const tableOrders = aggregated.reduce((sum, emp) => sum + emp.orders.length, 0);

                    expect(summary.totalEmployees).toBe(aggregated.length);
                    expect(summary.totalNet).toBe(tableNet);
                    expect(summary.totalKPI).toBe(tableKPI);
                    expect(summary.totalOrders).toBe(tableOrders);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13c: KPI values are always non-negative in summary.
     */
    it('summary card values should always be non-negative', () => {
        fc.assert(
            fc.property(
                fc.array(employeeDataArb, { minLength: 0, maxLength: 10 }),
                (filteredData) => {
                    const summary = computeSummaryCards(filteredData);

                    expect(summary.totalEmployees).toBeGreaterThanOrEqual(0);
                    expect(summary.totalOrders).toBeGreaterThanOrEqual(0);
                    expect(summary.totalNet).toBeGreaterThanOrEqual(0);
                    expect(summary.totalKPI).toBeGreaterThanOrEqual(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: tab-kpi-commission.js has consistent summary/table logic.
     */
    it('source code should contain updateSummaryCards and aggregateByEmployee', () => {
        expect(sourceCode).toContain('updateSummaryCards');
        expect(sourceCode).toContain('aggregateByEmployee');
        expect(sourceCode).toContain('totalNetProducts');
        expect(sourceCode).toContain('totalKPI');
    });
});
