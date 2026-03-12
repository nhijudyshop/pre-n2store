/**
 * Unit Tests - KPI Bug Fixes (Task 21)
 *
 * Tests for bug fixes implemented in Tasks 16-20:
 * - Bug #1: BASE saved with empty products (saveAutoBaseSnapshot)
 * - Bug #2: recalculateAndSaveKPI using wrong userId (Employee_Range lookup)
 * - Bug #3: Old audit logs causing wrong KPI after reset (timestamp filtering)
 * - Bug #4: Tab KPI showing stale/wrong data (name resolution, stale detection)
 *
 * Pure function re-implementations tested against known inputs/outputs.
 * No Firestore or browser environment required.
 *
 * **Validates: Requirements 1.8, 1.9, 3.9, 3.10, 3.12, 7.11, 7.13, 10.2, 10.5**
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
// Pure function: 3-tier product resolution for saveAutoBaseSnapshot
// Mirrors the product resolution logic in kpi-manager.js saveAutoBaseSnapshot
// ============================================================

/**
 * Resolves products for an order using 3-tier fallback:
 * Tier 1: report_order_details
 * Tier 2: local data from successOrders
 * Tier 3: TPOS API fallback
 *
 * @param {Object} order - Order from successOrders
 * @param {Object} reportOrdersMap - Map of orderId → report order data
 * @param {Function} fetchFromTPOS - Simulated TPOS API call, returns products array
 * @returns {{ products: Array, source: string, shouldSave: boolean, failedBase: boolean }}
 */
function resolveProductsForBase(order, reportOrdersMap, fetchFromTPOS) {
    const orderId = String(order.Id || order.id || '');
    let products = [];
    let source = 'none';

    // Tier 1: report_order_details
    const reportOrder = reportOrdersMap[orderId];
    if (reportOrder && reportOrder.Details && reportOrder.Details.length > 0) {
        products = reportOrder.Details.map(d => ({
            ProductId: d.ProductId || null,
            ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
            ProductName: d.ProductName || d.Name || '',
            Quantity: d.Quantity || 1,
            Price: d.Price || 0
        })).filter(p => p.ProductCode);
        if (products.length > 0) source = 'report_order_details';
    }

    // Tier 2: local data from successOrders
    if (products.length === 0) {
        const localProducts = order.Details || order.products || order.mainProducts || [];
        products = localProducts.map(p => ({
            ProductId: p.ProductId || null,
            ProductCode: p.ProductCode || p.Code || p.DefaultCode || '',
            ProductName: p.ProductName || p.Name || '',
            Quantity: p.Quantity || 1,
            Price: p.Price || 0
        })).filter(p => p.ProductCode);
        if (products.length > 0) source = 'local_data';
    }

    // Tier 3: TPOS API fallback
    if (products.length === 0 && fetchFromTPOS) {
        try {
            products = fetchFromTPOS(orderId);
            if (products.length > 0) source = 'tpos_api';
        } catch (e) {
            // TPOS API failed
        }
    }

    // Validate: KHÔNG lưu BASE với products rỗng
    if (products.length === 0) {
        return { products: [], source: 'none', shouldSave: false, failedBase: true };
    }

    return { products, source, shouldSave: true, failedBase: false };
}

/**
 * Simulates saveAutoBaseSnapshot logic for multiple orders.
 * Returns { saved, skipped, failed, failedBaseOrders }.
 */
function simulateSaveAutoBaseSnapshot(successOrders, reportOrdersMap, existingBases, fetchFromTPOS) {
    let saved = 0;
    let skipped = 0;
    let failed = 0;
    const failedBaseOrders = [];

    for (const order of successOrders) {
        const orderId = String(order.Id || order.id || '');
        if (!orderId) continue;

        // Skip if BASE already exists
        if (existingBases.has(orderId)) {
            skipped++;
            continue;
        }

        const result = resolveProductsForBase(order, reportOrdersMap, fetchFromTPOS);

        if (result.shouldSave) {
            saved++;
        } else {
            failedBaseOrders.push(orderId);
            failed++;
        }
    }

    return { saved, skipped, failed, failedBaseOrders };
}

// ============================================================
// Pure function: Employee determination via Employee_Range
// Mirrors getAssignedEmployeeForSTT from kpi-manager.js
// ============================================================

/**
 * Find the employee assigned to an order based on its STT.
 * Campaign-specific ranges take priority over general ranges.
 *
 * @param {number} stt - Order STT
 * @param {string} campaignName - Campaign name
 * @param {Object|null} campaignRangesData - { [campaignName]: Array<{userId, userName, fromSTT, toSTT}> }
 * @param {Array|null} generalRanges - [{userId, userName, fromSTT, toSTT}, ...]
 * @returns {{ userId: string, userName: string }}
 */
function getAssignedEmployeeForSTT(stt, campaignName, campaignRangesData, generalRanges) {
    const unassigned = { userId: 'unassigned', userName: 'Chưa phân' };

    if (!stt && stt !== 0) return unassigned;

    const sttNum = Number(stt);

    // 1. Try campaign-specific ranges first (priority)
    if (campaignName && campaignRangesData) {
        const campaignRanges = campaignRangesData[campaignName];
        if (campaignRanges && Array.isArray(campaignRanges)) {
            for (const range of campaignRanges) {
                const from = range.fromSTT || range.from || range.start || 0;
                const to = range.toSTT || range.to || range.end || Infinity;
                if (sttNum >= from && sttNum <= to) {
                    return {
                        userId: range.userId || 'unassigned',
                        userName: range.userName || range.userId || 'Chưa phân'
                    };
                }
            }
        }
    }

    // 2. Fallback to general ranges
    if (generalRanges && Array.isArray(generalRanges)) {
        for (const range of generalRanges) {
            const from = range.fromSTT || range.from || range.start || 0;
            const to = range.toSTT || range.to || range.end || Infinity;
            if (sttNum >= from && sttNum <= to) {
                return {
                    userId: range.userId || 'unassigned',
                    userName: range.userName || range.userId || 'Chưa phân'
                };
            }
        }
    }

    return unassigned;
}

// ============================================================
// Pure function: calculateNetKPI with timestamp filtering + empty products validation
// Extended version from existing tests, adding Bug #3 fixes
// ============================================================

/**
 * Calculate NET KPI with Bug #3 fixes:
 * - Validates BASE products not empty
 * - Filters audit logs by base.timestamp
 *
 * @param {Object} base - { products: Array, timestamp: { seconds: number } }
 * @param {Array} auditLogs - Array of audit log entries with timestamp.seconds
 * @param {Object} options - { employeeUserId, adminUserIds }
 * @returns {{ netProducts: number, kpiAmount: number, details: Object }}
 */
function calculateNetKPIWithTimestamp(base, auditLogs, options = {}) {
    const emptyResult = { netProducts: 0, kpiAmount: 0, details: {} };

    if (!base) return emptyResult;

    // Bug #3 fix: Validate BASE products not empty
    if (!base.products || base.products.length === 0) {
        return emptyResult;
    }

    const baseProductIds = new Set(base.products.map(p => Number(p.ProductId)));

    let filteredLogs = [...auditLogs];

    // Bug #3 fix: Filter audit logs by base.timestamp
    if (base.timestamp) {
        const baseTs = base.timestamp.seconds || 0;
        filteredLogs = filteredLogs.filter(log => {
            const logTs = log.timestamp && log.timestamp.seconds ? log.timestamp.seconds : 0;
            return logTs >= baseTs;
        });
    }

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
// Pure function: cleanupStaleStatistics
// Mirrors the logic from kpi-manager.js
// ============================================================

/**
 * Simulates cleanupStaleStatistics: removes order entries from statistics
 * when BASE no longer exists.
 *
 * @param {string} orderId - Order to clean up
 * @param {Array} statisticsDocs - Array of { userId, date, data: { orders, totalNetProducts, totalKPI } }
 * @returns {{ updatedDocs: Array, updateCount: number }}
 */
function simulateCleanupStaleStatistics(orderId, statisticsDocs) {
    let updateCount = 0;
    const updatedDocs = [];

    for (const doc of statisticsDocs) {
        const orders = doc.data.orders || [];
        const hasOrder = orders.some(o => o.orderId === orderId);
        if (!hasOrder) {
            updatedDocs.push({ ...doc, changed: false });
            continue;
        }

        const updatedOrders = orders.filter(o => o.orderId !== orderId);

        let totalNetProducts = 0;
        let totalKPI = 0;
        for (const o of updatedOrders) {
            totalNetProducts += (o.netProducts || 0);
            totalKPI += (o.kpi || 0);
        }

        updatedDocs.push({
            ...doc,
            changed: true,
            data: {
                orders: updatedOrders,
                totalNetProducts,
                totalKPI
            }
        });
        updateCount++;
    }

    return { updatedDocs, updateCount };
}

// ============================================================
// Pure function: resolveEmployeeName
// Mirrors the logic from tab-kpi-commission.js
// ============================================================

/**
 * Resolve employee name from multiple sources with priority order.
 * Never returns raw userId alone.
 *
 * @param {string} userId
 * @param {Object} sources - { statsData, kpiBaseData, employeeRanges, usersCollection }
 * @returns {string} resolved display name
 */
function resolveEmployeeNameLogic(userId, sources) {
    if (!userId) return 'Không xác định';

    let name = null;

    // Source 1: kpi_statistics
    if (!name && sources.statsData) {
        for (const stat of sources.statsData) {
            if (stat.userId === userId && stat.userName && stat.userName !== userId) {
                name = stat.userName;
                break;
            }
        }
    }

    // Source 2: kpi_base collection
    if (!name && sources.kpiBaseData) {
        const baseEntry = sources.kpiBaseData[userId];
        if (baseEntry && baseEntry.userName && baseEntry.userName !== userId) {
            name = baseEntry.userName;
        }
    }

    // Source 3: settings/employee_ranges
    if (!name && sources.employeeRanges) {
        const ranges = sources.employeeRanges;
        const found = ranges.find(r => r.userId === userId);
        if (found && found.userName) name = found.userName;
    }

    // Source 4: users collection
    if (!name && sources.usersCollection) {
        const userData = sources.usersCollection[userId];
        if (userData) {
            name = userData.displayName || userData.name || null;
        }
    }

    // Fallback: formatted userId (never raw userId alone)
    if (!name) {
        name = `Nhân viên (${userId})`;
    }

    return name;
}

// ============================================================
// Pure function: detectStaleStatistics
// Mirrors the logic from tab-kpi-commission.js
// ============================================================

/**
 * Detect stale statistics by checking BASE existence for each order.
 * Marks orders with missing BASE as _stale: true.
 *
 * @param {Array} statsData - Array of { userId, dates: { [date]: { orders: [...] } } }
 * @param {Set} existingBaseIds - Set of orderId strings that have valid BASE
 * @returns {Array} statsData with stale markers added
 */
function detectStaleStatisticsLogic(statsData, existingBaseIds) {
    if (!statsData || statsData.length === 0) return statsData;

    let staleCount = 0;
    for (const stat of statsData) {
        for (const dateData of Object.values(stat.dates || {})) {
            for (const order of (dateData.orders || [])) {
                if (order.orderId && !existingBaseIds.has(order.orderId)) {
                    order._stale = true;
                    order._staleReason = 'BASE đã bị xóa';
                    staleCount++;
                }
            }
        }
    }

    return statsData;
}


// ============================================================
// 21.1 - saveAutoBaseSnapshot: TPOS API fallback saves BASE successfully
// Validates: Requirement 1.8
// ============================================================
describe('21.1 saveAutoBaseSnapshot: TPOS API fallback when report_order_details and local data empty', () => {
    const tposProducts = [
        { ProductId: 5001, ProductCode: 'T1', ProductName: 'TPOS Product 1', Quantity: 2, Price: 150000 },
        { ProductId: 5002, ProductCode: 'T2', ProductName: 'TPOS Product 2', Quantity: 1, Price: 200000 }
    ];

    const fetchFromTPOS = (orderId) => {
        if (orderId === 'order_100') return tposProducts;
        return [];
    };

    it('should use TPOS API when report_order_details has no data and local data is empty', () => {
        const order = { Id: 'order_100', stt: 5, code: 'ORD100', customerName: 'Customer A' };
        // No report data, no local products
        const reportOrdersMap = {};

        const result = resolveProductsForBase(order, reportOrdersMap, fetchFromTPOS);

        expect(result.shouldSave).toBe(true);
        expect(result.source).toBe('tpos_api');
        expect(result.products.length).toBe(2);
        expect(result.products[0].ProductCode).toBe('T1');
        expect(result.products[1].ProductCode).toBe('T2');
    });

    it('should save BASE successfully via TPOS fallback in batch simulation', () => {
        const successOrders = [
            { Id: 'order_100', stt: 5, code: 'ORD100', customerName: 'Customer A' }
        ];
        const reportOrdersMap = {};
        const existingBases = new Set();

        const result = simulateSaveAutoBaseSnapshot(successOrders, reportOrdersMap, existingBases, fetchFromTPOS);

        expect(result.saved).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.failedBaseOrders.length).toBe(0);
    });

    it('should prefer report_order_details over TPOS API', () => {
        const order = {
            Id: 'order_100', stt: 5,
            // No local products
        };
        const reportOrdersMap = {
            'order_100': {
                Details: [
                    { ProductId: 9001, ProductCode: 'R1', ProductName: 'Report Product', Quantity: 3, Price: 100000 }
                ]
            }
        };

        const result = resolveProductsForBase(order, reportOrdersMap, fetchFromTPOS);

        expect(result.source).toBe('report_order_details');
        expect(result.products[0].ProductCode).toBe('R1');
    });

    it('should prefer local data over TPOS API when report_order_details is empty', () => {
        const order = {
            Id: 'order_100', stt: 5,
            Details: [
                { ProductId: 8001, ProductCode: 'L1', ProductName: 'Local Product', Quantity: 1, Price: 50000 }
            ]
        };
        const reportOrdersMap = {};

        const result = resolveProductsForBase(order, reportOrdersMap, fetchFromTPOS);

        expect(result.source).toBe('local_data');
        expect(result.products[0].ProductCode).toBe('L1');
    });

    it('should handle TPOS API failure gracefully and mark as failed', () => {
        const failingTPOS = () => { throw new Error('TPOS API timeout'); };
        const order = { Id: 'order_200', stt: 10 };
        const reportOrdersMap = {};

        const result = resolveProductsForBase(order, reportOrdersMap, failingTPOS);

        expect(result.shouldSave).toBe(false);
        expect(result.failedBase).toBe(true);
    });

    it('source code should contain fetchProductsFromTPOS function', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');
        expect(sourceCode).toContain('async function fetchProductsFromTPOS(orderId)');
        expect(sourceCode).toContain('tposAPI.getOrderById');
    });
});

// ============================================================
// 21.2 - saveAutoBaseSnapshot: all sources empty → no BASE, failedBaseOrders
// Validates: Requirement 1.9
// ============================================================
describe('21.2 saveAutoBaseSnapshot: all sources empty → KHÔNG lưu BASE, thêm vào failedBaseOrders', () => {
    const noProductsTPOS = () => [];

    it('should NOT save BASE when all sources return empty products', () => {
        const order = { Id: 'order_empty', stt: 1, code: 'EMPTY' };
        const reportOrdersMap = {};

        const result = resolveProductsForBase(order, reportOrdersMap, noProductsTPOS);

        expect(result.shouldSave).toBe(false);
        expect(result.failedBase).toBe(true);
        expect(result.products.length).toBe(0);
        expect(result.source).toBe('none');
    });

    it('should add orderId to failedBaseOrders when no products available', () => {
        const successOrders = [
            { Id: 'order_no_products', stt: 1 },
            { Id: 'order_has_products', stt: 2, Details: [{ ProductId: 1, ProductCode: 'P1', ProductName: 'Product', Quantity: 1, Price: 100 }] }
        ];
        const reportOrdersMap = {};
        const existingBases = new Set();

        const result = simulateSaveAutoBaseSnapshot(successOrders, reportOrdersMap, existingBases, noProductsTPOS);

        expect(result.failedBaseOrders).toContain('order_no_products');
        expect(result.failedBaseOrders).not.toContain('order_has_products');
        expect(result.saved).toBe(1);
        expect(result.failed).toBe(1);
    });

    it('should handle multiple orders with no products', () => {
        const successOrders = [
            { Id: 'empty1', stt: 1 },
            { Id: 'empty2', stt: 2 },
            { Id: 'empty3', stt: 3 }
        ];
        const reportOrdersMap = {};
        const existingBases = new Set();

        const result = simulateSaveAutoBaseSnapshot(successOrders, reportOrdersMap, existingBases, noProductsTPOS);

        expect(result.failedBaseOrders.length).toBe(3);
        expect(result.saved).toBe(0);
        expect(result.failed).toBe(3);
    });

    it('should skip existing BASE and not count as failed', () => {
        const successOrders = [
            { Id: 'existing_order', stt: 1 },
            { Id: 'new_empty_order', stt: 2 }
        ];
        const reportOrdersMap = {};
        const existingBases = new Set(['existing_order']);

        const result = simulateSaveAutoBaseSnapshot(successOrders, reportOrdersMap, existingBases, noProductsTPOS);

        expect(result.skipped).toBe(1);
        expect(result.failedBaseOrders).toEqual(['new_empty_order']);
        expect(result.failedBaseOrders).not.toContain('existing_order');
    });

    it('should filter out products with empty ProductCode', () => {
        const order = {
            Id: 'order_bad_products', stt: 1,
            Details: [
                { ProductId: 1, ProductCode: '', ProductName: 'No Code', Quantity: 1, Price: 100 },
                { ProductId: 2, ProductCode: null, ProductName: 'Null Code', Quantity: 1, Price: 100 }
            ]
        };
        const reportOrdersMap = {};

        const result = resolveProductsForBase(order, reportOrdersMap, noProductsTPOS);

        // Products with empty ProductCode are filtered out
        expect(result.shouldSave).toBe(false);
        expect(result.failedBase).toBe(true);
    });

    it('source code should validate products.length before saving BASE', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');
        expect(sourceCode).toContain('products.length === 0');
        expect(sourceCode).toContain('failedBaseOrders.push');
        expect(sourceCode).toContain('Cannot save BASE for order');
    });
});

// ============================================================
// 21.3 - recalculateAndSaveKPI: employee via Employee_Range, NOT base.userId
// Validates: Requirements 3.9, 3.10
// ============================================================
describe('21.3 recalculateAndSaveKPI: employee determined via Employee_Range (STT → employee)', () => {
    const campaignRanges = {
        'Live_Sale_25_12': [
            { userId: 'emp_A', userName: 'Nhân viên A', fromSTT: 1, toSTT: 20 },
            { userId: 'emp_B', userName: 'Nhân viên B', fromSTT: 21, toSTT: 40 }
        ]
    };

    const generalRanges = [
        { userId: 'emp_C', userName: 'Nhân viên C', fromSTT: 1, toSTT: 50 }
    ];

    it('should find employee from campaign-specific range by STT', () => {
        const result = getAssignedEmployeeForSTT(15, 'Live_Sale_25_12', campaignRanges, generalRanges);

        expect(result.userId).toBe('emp_A');
        expect(result.userName).toBe('Nhân viên A');
    });

    it('should find correct employee when STT is in second range', () => {
        const result = getAssignedEmployeeForSTT(30, 'Live_Sale_25_12', campaignRanges, generalRanges);

        expect(result.userId).toBe('emp_B');
        expect(result.userName).toBe('Nhân viên B');
    });

    it('should NOT use base.userId - uses STT lookup instead', () => {
        // base.userId = 'admin_sender' (person who sent bulk message)
        // STT 15 belongs to emp_A via Employee_Range
        const baseUserId = 'admin_sender';
        const baseStt = 15;

        const assigned = getAssignedEmployeeForSTT(baseStt, 'Live_Sale_25_12', campaignRanges, generalRanges);

        // The assigned employee should be emp_A (from range), NOT admin_sender
        expect(assigned.userId).not.toBe(baseUserId);
        expect(assigned.userId).toBe('emp_A');
    });

    it('should fallback to general range when campaign has no ranges', () => {
        const result = getAssignedEmployeeForSTT(25, 'Unknown_Campaign', campaignRanges, generalRanges);

        expect(result.userId).toBe('emp_C');
        expect(result.userName).toBe('Nhân viên C');
    });

    it('should return "unassigned" when STT is not in any range', () => {
        const result = getAssignedEmployeeForSTT(100, 'Live_Sale_25_12', campaignRanges, generalRanges);

        expect(result.userId).toBe('unassigned');
        expect(result.userName).toBe('Chưa phân');
    });

    it('should return "unassigned" when STT is null/undefined', () => {
        expect(getAssignedEmployeeForSTT(null, 'Live_Sale_25_12', campaignRanges, generalRanges).userId).toBe('unassigned');
        expect(getAssignedEmployeeForSTT(undefined, 'Live_Sale_25_12', campaignRanges, generalRanges).userId).toBe('unassigned');
    });

    it('should handle boundary STT values (exact from/to)', () => {
        // STT 1 = start of emp_A range
        expect(getAssignedEmployeeForSTT(1, 'Live_Sale_25_12', campaignRanges, generalRanges).userId).toBe('emp_A');
        // STT 20 = end of emp_A range
        expect(getAssignedEmployeeForSTT(20, 'Live_Sale_25_12', campaignRanges, generalRanges).userId).toBe('emp_A');
        // STT 21 = start of emp_B range
        expect(getAssignedEmployeeForSTT(21, 'Live_Sale_25_12', campaignRanges, generalRanges).userId).toBe('emp_B');
    });

    it('source code should use getAssignedEmployeeForSTT in recalculateAndSaveKPI', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

        // recalculateAndSaveKPI should call getAssignedEmployeeForSTT
        const fnStart = sourceCode.indexOf('async function recalculateAndSaveKPI');
        expect(fnStart).toBeGreaterThan(-1);
        const fnBody = sourceCode.substring(fnStart, fnStart + 1500);

        expect(fnBody).toContain('getAssignedEmployeeForSTT');
        // Should NOT use base.userId directly for employee determination
        expect(fnBody).not.toMatch(/employeeUserId\s*=\s*base\.userId/);
    });
});


// ============================================================
// 21.4 - calculateNetKPI: BASE with empty products → KPI = 0
// Validates: Requirement 3.12
// ============================================================
describe('21.4 calculateNetKPI: BASE with empty products → KPI = 0', () => {
    const auditLogs = [
        { orderId: '500', action: 'add', productId: 3001, productCode: 'X1', productName: 'Product X', quantity: 3, userId: 'emp1', timestamp: { seconds: 2000 } },
        { orderId: '500', action: 'add', productId: 3002, productCode: 'X2', productName: 'Product Y', quantity: 2, userId: 'emp1', timestamp: { seconds: 2100 } }
    ];

    it('should return KPI = 0 when BASE products is empty array', () => {
        const base = { products: [], timestamp: { seconds: 1000 } };

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
        expect(Object.keys(result.details).length).toBe(0);
    });

    it('should return KPI = 0 when BASE products is null', () => {
        const base = { products: null, timestamp: { seconds: 1000 } };

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
    });

    it('should return KPI = 0 when BASE products is undefined', () => {
        const base = { timestamp: { seconds: 1000 } };

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
    });

    it('should return KPI = 0 when BASE is null (no BASE)', () => {
        const result = calculateNetKPIWithTimestamp(null, auditLogs);

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
    });

    it('should NOT treat all products as "new" when BASE products is empty', () => {
        // This is the critical bug: empty BASE products means ALL audit log products
        // would be considered "new" if we don't validate. We must return 0 instead.
        const base = { products: [], timestamp: { seconds: 1000 } };

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        // Should NOT have any details (no products counted)
        expect(result.netProducts).toBe(0);
        // If the bug existed, netProducts would be 5 (3+2) and kpiAmount would be 25000
        expect(result.kpiAmount).not.toBe(25000);
    });

    it('should calculate normally when BASE has valid products', () => {
        const base = {
            products: [{ ProductId: 3001, ProductCode: 'X1', ProductName: 'Product X', Quantity: 1, Price: 100 }],
            timestamp: { seconds: 1000 }
        };

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        // X1 (3001) is in BASE → ignored. X2 (3002) is new → net = 2
        expect(result.netProducts).toBe(2);
        expect(result.kpiAmount).toBe(10000);
    });

    it('source code should validate BASE products in calculateNetKPI', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');
        const fnStart = sourceCode.indexOf('async function calculateNetKPI');
        const fnBody = sourceCode.substring(fnStart, fnStart + 2000);

        expect(fnBody).toContain('base.products.length === 0');
        expect(fnBody).toContain('empty products - treating as invalid');
    });
});

// ============================================================
// 21.5 - calculateNetKPI: timestamp filtering, ignore old logs before BASE
// Validates: Requirement 10.5
// ============================================================
describe('21.5 calculateNetKPI: filters audit logs by base.timestamp, ignores old logs', () => {
    const base = {
        products: [{ ProductId: 1001, ProductCode: 'A', ProductName: 'Product A', Quantity: 1, Price: 100 }],
        timestamp: { seconds: 5000 }
    };

    it('should only count audit logs with timestamp >= base.timestamp', () => {
        const auditLogs = [
            // Old log (before BASE) - should be IGNORED
            { orderId: '600', action: 'add', productId: 2001, productCode: 'B', productName: 'Product B', quantity: 2, userId: 'emp1', timestamp: { seconds: 3000 } },
            // New log (after BASE) - should be COUNTED
            { orderId: '600', action: 'add', productId: 2002, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', timestamp: { seconds: 6000 } }
        ];

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        // Only C should be counted (timestamp 6000 >= 5000)
        expect(result.netProducts).toBe(1);
        expect(result.kpiAmount).toBe(5000);
        expect(result.details['2001']).toBeUndefined(); // Old log filtered out
        expect(result.details['2002']).toBeDefined();
    });

    it('should include audit log with exact same timestamp as BASE', () => {
        const auditLogs = [
            { orderId: '600', action: 'add', productId: 2001, productCode: 'B', productName: 'Product B', quantity: 1, userId: 'emp1', timestamp: { seconds: 5000 } }
        ];

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        // Timestamp 5000 >= 5000 → should be included
        expect(result.netProducts).toBe(1);
        expect(result.kpiAmount).toBe(5000);
    });

    it('should exclude ALL logs when all are before BASE timestamp', () => {
        const auditLogs = [
            { orderId: '600', action: 'add', productId: 2001, productCode: 'B', productName: 'Product B', quantity: 3, userId: 'emp1', timestamp: { seconds: 1000 } },
            { orderId: '600', action: 'add', productId: 2002, productCode: 'C', productName: 'Product C', quantity: 2, userId: 'emp1', timestamp: { seconds: 2000 } }
        ];

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        expect(result.netProducts).toBe(0);
        expect(result.kpiAmount).toBe(0);
    });

    it('should handle logs without timestamp (treat as 0, excluded)', () => {
        const auditLogs = [
            { orderId: '600', action: 'add', productId: 2001, productCode: 'B', productName: 'Product B', quantity: 1, userId: 'emp1' },
            { orderId: '600', action: 'add', productId: 2002, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', timestamp: { seconds: 6000 } }
        ];

        const result = calculateNetKPIWithTimestamp(base, auditLogs);

        // Log without timestamp → seconds = 0 < 5000 → excluded
        expect(result.netProducts).toBe(1);
        expect(result.details['2001']).toBeUndefined();
        expect(result.details['2002']).toBeDefined();
    });

    it('should handle BASE without timestamp (no filtering applied)', () => {
        const baseNoTs = {
            products: [{ ProductId: 1001, ProductCode: 'A', ProductName: 'Product A', Quantity: 1, Price: 100 }]
            // No timestamp field
        };

        const auditLogs = [
            { orderId: '600', action: 'add', productId: 2001, productCode: 'B', productName: 'Product B', quantity: 1, userId: 'emp1', timestamp: { seconds: 100 } },
            { orderId: '600', action: 'add', productId: 2002, productCode: 'C', productName: 'Product C', quantity: 1, userId: 'emp1', timestamp: { seconds: 200 } }
        ];

        const result = calculateNetKPIWithTimestamp(baseNoTs, auditLogs);

        // No timestamp filtering → all logs counted
        expect(result.netProducts).toBe(2);
        expect(result.kpiAmount).toBe(10000);
    });

    it('source code should filter audit logs by base.timestamp', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');
        const fnStart = sourceCode.indexOf('async function calculateNetKPI');
        const fnBody = sourceCode.substring(fnStart, fnStart + 4000);

        expect(fnBody).toContain('baseTimestamp');
        expect(fnBody).toContain('logTs >= baseTs');
    });
});

// ============================================================
// 21.6 - cleanupStaleStatistics: removes entry when BASE doesn't exist
// Validates: Requirement 10.2
// ============================================================
describe('21.6 cleanupStaleStatistics: removes entry in kpi_statistics when BASE missing', () => {
    it('should remove order entry from statistics document', () => {
        const statisticsDocs = [
            {
                userId: 'emp1', date: '2024-12-25',
                data: {
                    orders: [
                        { orderId: 'order_100', netProducts: 3, kpi: 15000 },
                        { orderId: 'order_200', netProducts: 2, kpi: 10000 }
                    ],
                    totalNetProducts: 5,
                    totalKPI: 25000
                }
            }
        ];

        const result = simulateCleanupStaleStatistics('order_100', statisticsDocs);

        expect(result.updateCount).toBe(1);
        const updatedDoc = result.updatedDocs[0];
        expect(updatedDoc.changed).toBe(true);
        expect(updatedDoc.data.orders.length).toBe(1);
        expect(updatedDoc.data.orders[0].orderId).toBe('order_200');
    });

    it('should recalculate totals after removing order', () => {
        const statisticsDocs = [
            {
                userId: 'emp1', date: '2024-12-25',
                data: {
                    orders: [
                        { orderId: 'order_100', netProducts: 3, kpi: 15000 },
                        { orderId: 'order_200', netProducts: 2, kpi: 10000 }
                    ],
                    totalNetProducts: 5,
                    totalKPI: 25000
                }
            }
        ];

        const result = simulateCleanupStaleStatistics('order_100', statisticsDocs);

        const updatedDoc = result.updatedDocs[0];
        expect(updatedDoc.data.totalNetProducts).toBe(2);
        expect(updatedDoc.data.totalKPI).toBe(10000);
    });

    it('should handle order not found in any statistics document', () => {
        const statisticsDocs = [
            {
                userId: 'emp1', date: '2024-12-25',
                data: {
                    orders: [{ orderId: 'order_100', netProducts: 3, kpi: 15000 }],
                    totalNetProducts: 3,
                    totalKPI: 15000
                }
            }
        ];

        const result = simulateCleanupStaleStatistics('order_nonexistent', statisticsDocs);

        expect(result.updateCount).toBe(0);
        expect(result.updatedDocs[0].changed).toBe(false);
    });

    it('should clean up from multiple statistics documents', () => {
        const statisticsDocs = [
            {
                userId: 'emp1', date: '2024-12-25',
                data: {
                    orders: [{ orderId: 'order_100', netProducts: 3, kpi: 15000 }],
                    totalNetProducts: 3,
                    totalKPI: 15000
                }
            },
            {
                userId: 'emp2', date: '2024-12-25',
                data: {
                    orders: [
                        { orderId: 'order_100', netProducts: 1, kpi: 5000 },
                        { orderId: 'order_300', netProducts: 4, kpi: 20000 }
                    ],
                    totalNetProducts: 5,
                    totalKPI: 25000
                }
            }
        ];

        const result = simulateCleanupStaleStatistics('order_100', statisticsDocs);

        expect(result.updateCount).toBe(2);
        // emp1: order_100 removed → empty
        expect(result.updatedDocs[0].data.orders.length).toBe(0);
        expect(result.updatedDocs[0].data.totalNetProducts).toBe(0);
        expect(result.updatedDocs[0].data.totalKPI).toBe(0);
        // emp2: order_100 removed, order_300 remains
        expect(result.updatedDocs[1].data.orders.length).toBe(1);
        expect(result.updatedDocs[1].data.totalNetProducts).toBe(4);
        expect(result.updatedDocs[1].data.totalKPI).toBe(20000);
    });

    it('should handle empty statistics documents', () => {
        const statisticsDocs = [
            {
                userId: 'emp1', date: '2024-12-25',
                data: { orders: [], totalNetProducts: 0, totalKPI: 0 }
            }
        ];

        const result = simulateCleanupStaleStatistics('order_100', statisticsDocs);

        expect(result.updateCount).toBe(0);
    });

    it('source code should call cleanupStaleStatistics when BASE missing', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');
        const fnStart = sourceCode.indexOf('async function recalculateAndSaveKPI');
        const fnBody = sourceCode.substring(fnStart, fnStart + 1500);

        expect(fnBody).toContain('cleanupStaleStatistics');
    });
});


// ============================================================
// 21.7 - resolveEmployeeName: multi-source resolution, fallback
// Validates: Requirement 7.11
// ============================================================
describe('21.7 resolveEmployeeName: multi-source name resolution with fallback', () => {
    it('should resolve name from kpi_statistics (Source 1 - highest priority)', () => {
        const sources = {
            statsData: [{ userId: 'user_abc', userName: 'Nguyễn Văn A' }],
            kpiBaseData: { 'user_abc': { userName: 'Tên Khác' } },
            employeeRanges: [{ userId: 'user_abc', userName: 'Tên Ranges' }],
            usersCollection: { 'user_abc': { displayName: 'Tên Users' } }
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        expect(result).toBe('Nguyễn Văn A');
    });

    it('should resolve name from kpi_base (Source 2) when stats has no name', () => {
        const sources = {
            statsData: [{ userId: 'user_abc', userName: null }],
            kpiBaseData: { 'user_abc': { userName: 'Tên từ BASE' } },
            employeeRanges: [],
            usersCollection: {}
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        expect(result).toBe('Tên từ BASE');
    });

    it('should resolve name from employee_ranges (Source 3) when stats and base have no name', () => {
        const sources = {
            statsData: [],
            kpiBaseData: {},
            employeeRanges: [{ userId: 'user_abc', userName: 'Tên từ Ranges' }],
            usersCollection: {}
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        expect(result).toBe('Tên từ Ranges');
    });

    it('should resolve name from users collection (Source 4) as last resort', () => {
        const sources = {
            statsData: [],
            kpiBaseData: {},
            employeeRanges: [],
            usersCollection: { 'user_abc': { displayName: 'Tên từ Users' } }
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        expect(result).toBe('Tên từ Users');
    });

    it('should fallback to "Nhân viên ({userId})" when no source has a name', () => {
        const sources = {
            statsData: [],
            kpiBaseData: {},
            employeeRanges: [],
            usersCollection: {}
        };

        const result = resolveEmployeeNameLogic('user_xyz', sources);

        expect(result).toBe('Nhân viên (user_xyz)');
    });

    it('should NEVER return raw userId alone', () => {
        const sources = {
            statsData: [],
            kpiBaseData: {},
            employeeRanges: [],
            usersCollection: {}
        };

        const result = resolveEmployeeNameLogic('raw_user_id', sources);

        // Must contain "Nhân viên" prefix, not just the raw userId
        expect(result).not.toBe('raw_user_id');
        expect(result).toContain('Nhân viên');
        expect(result).toContain('raw_user_id');
    });

    it('should skip stats userName that equals userId (not a real name)', () => {
        const sources = {
            statsData: [{ userId: 'user_abc', userName: 'user_abc' }], // userName = userId → skip
            kpiBaseData: { 'user_abc': { userName: 'Tên Thật' } },
            employeeRanges: [],
            usersCollection: {}
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        // Should skip stats (userName = userId) and use kpi_base
        expect(result).toBe('Tên Thật');
    });

    it('should return "Không xác định" for null/undefined userId', () => {
        const sources = { statsData: [], kpiBaseData: {}, employeeRanges: [], usersCollection: {} };

        expect(resolveEmployeeNameLogic(null, sources)).toBe('Không xác định');
        expect(resolveEmployeeNameLogic(undefined, sources)).toBe('Không xác định');
        expect(resolveEmployeeNameLogic('', sources)).toBe('Không xác định');
    });

    it('should use users.name as fallback when displayName is missing', () => {
        const sources = {
            statsData: [],
            kpiBaseData: {},
            employeeRanges: [],
            usersCollection: { 'user_abc': { name: 'Tên Name Field' } }
        };

        const result = resolveEmployeeNameLogic('user_abc', sources);

        expect(result).toBe('Tên Name Field');
    });

    it('source code should contain resolveEmployeeName with multi-source lookup', () => {
        const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');
        expect(sourceCode).toContain('async resolveEmployeeName(userId)');
        expect(sourceCode).toContain('employeeNameCache');
        expect(sourceCode).toContain('kpi_base');
        expect(sourceCode).toContain('employee_ranges');
        expect(sourceCode).toContain(`Nhân viên (`);
    });
});

// ============================================================
// 21.8 - detectStaleStatistics: marks orders with missing BASE
// Validates: Requirement 7.13
// ============================================================
describe('21.8 detectStaleStatistics: marks orders with missing BASE as stale', () => {
    it('should mark orders whose BASE does not exist as _stale', () => {
        const statsData = [
            {
                userId: 'emp1',
                dates: {
                    '2024-12-25': {
                        orders: [
                            { orderId: 'order_100', netProducts: 3, kpi: 15000 },
                            { orderId: 'order_200', netProducts: 2, kpi: 10000 }
                        ]
                    }
                }
            }
        ];
        // Only order_100 has a BASE
        const existingBaseIds = new Set(['order_100']);

        detectStaleStatisticsLogic(statsData, existingBaseIds);

        const orders = statsData[0].dates['2024-12-25'].orders;
        expect(orders[0]._stale).toBeUndefined(); // order_100 has BASE
        expect(orders[1]._stale).toBe(true); // order_200 missing BASE
        expect(orders[1]._staleReason).toBe('BASE đã bị xóa');
    });

    it('should not mark orders that have valid BASE', () => {
        const statsData = [
            {
                userId: 'emp1',
                dates: {
                    '2024-12-25': {
                        orders: [
                            { orderId: 'order_100', netProducts: 3, kpi: 15000 },
                            { orderId: 'order_200', netProducts: 2, kpi: 10000 }
                        ]
                    }
                }
            }
        ];
        const existingBaseIds = new Set(['order_100', 'order_200']);

        detectStaleStatisticsLogic(statsData, existingBaseIds);

        const orders = statsData[0].dates['2024-12-25'].orders;
        expect(orders[0]._stale).toBeUndefined();
        expect(orders[1]._stale).toBeUndefined();
    });

    it('should mark ALL orders as stale when no BASE exists', () => {
        const statsData = [
            {
                userId: 'emp1',
                dates: {
                    '2024-12-25': {
                        orders: [
                            { orderId: 'order_100', netProducts: 3, kpi: 15000 },
                            { orderId: 'order_200', netProducts: 2, kpi: 10000 }
                        ]
                    }
                }
            }
        ];
        const existingBaseIds = new Set(); // No BASE exists

        detectStaleStatisticsLogic(statsData, existingBaseIds);

        const orders = statsData[0].dates['2024-12-25'].orders;
        expect(orders[0]._stale).toBe(true);
        expect(orders[1]._stale).toBe(true);
    });

    it('should handle multiple employees and dates', () => {
        const statsData = [
            {
                userId: 'emp1',
                dates: {
                    '2024-12-25': {
                        orders: [{ orderId: 'order_100', netProducts: 3, kpi: 15000 }]
                    },
                    '2024-12-26': {
                        orders: [{ orderId: 'order_300', netProducts: 1, kpi: 5000 }]
                    }
                }
            },
            {
                userId: 'emp2',
                dates: {
                    '2024-12-25': {
                        orders: [{ orderId: 'order_200', netProducts: 2, kpi: 10000 }]
                    }
                }
            }
        ];
        // Only order_100 has BASE
        const existingBaseIds = new Set(['order_100']);

        detectStaleStatisticsLogic(statsData, existingBaseIds);

        expect(statsData[0].dates['2024-12-25'].orders[0]._stale).toBeUndefined(); // order_100 OK
        expect(statsData[0].dates['2024-12-26'].orders[0]._stale).toBe(true); // order_300 stale
        expect(statsData[1].dates['2024-12-25'].orders[0]._stale).toBe(true); // order_200 stale
    });

    it('should handle empty statsData gracefully', () => {
        const result = detectStaleStatisticsLogic([], new Set());
        expect(result).toEqual([]);

        const result2 = detectStaleStatisticsLogic(null, new Set());
        expect(result2).toBeNull();
    });

    it('should handle stats with empty dates/orders', () => {
        const statsData = [
            { userId: 'emp1', dates: {} },
            { userId: 'emp2', dates: { '2024-12-25': { orders: [] } } }
        ];
        const existingBaseIds = new Set();

        detectStaleStatisticsLogic(statsData, existingBaseIds);

        // No errors, no stale markers (no orders to mark)
        expect(statsData[0].dates).toEqual({});
        expect(statsData[1].dates['2024-12-25'].orders.length).toBe(0);
    });

    it('source code should contain detectStaleStatistics with batch BASE checking', () => {
        const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');
        expect(sourceCode).toContain('async detectStaleStatistics(statsData)');
        expect(sourceCode).toContain('_stale');
        expect(sourceCode).toContain('BASE đã bị xóa');
        expect(sourceCode).toContain('existingBases');
    });
});
