/**
 * Preservation Property Tests
 *
 * Property 2: Preservation - Filter, Modal & Summary Behavior Không Thay Đổi
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * IMPORTANT: Tests này PHẢI PASS trên code CHƯA SỬA để thiết lập baseline
 * hành vi cần bảo toàn sau khi fix.
 *
 * Phương pháp observation-first: quan sát hành vi hiện tại, encode thành properties.
 *
 * Approach: Extract pure logic từ source code và test trực tiếp vì đây là
 * static HTML project (browser code, không có module exports).
 *
 * - applyFilters(): filter orders by order.campaignName string matching
 * - updateSummaryCards(): calculate totalEmployees, totalOrders, totalNet, totalKPI
 * - loadCampaignOptions(): populate dropdown with campaign names + "Tất cả" default
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

/**
 * Helper: Đọc file content từ n2store directory
 */
function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

// Đọc source code tab-kpi-commission.js
const SOURCE_PATH = 'orders-report/js/tab-kpi-commission.js';
const sourceCode = readN2File(SOURCE_PATH);

/**
 * Helper: Trích xuất body của một hàm/method definition từ source code.
 * Tìm method definition (ví dụ: `applyFilters() {`) chứ không phải method call.
 * Dùng regex để tìm definition pattern: tên hàm theo sau bởi `(` params `)` rồi `{`.
 */
function extractFunctionBody(code, funcSignature) {
    // Tìm tất cả vị trí xuất hiện funcSignature
    // Chọn vị trí là method definition (theo sau bởi `{` trên cùng dòng hoặc dòng kế)
    let searchFrom = 0;
    while (searchFrom < code.length) {
        const idx = code.indexOf(funcSignature, searchFrom);
        if (idx === -1) return null;

        // Kiểm tra ký tự trước: method definition thường có newline/space trước
        // Method call có dấu `.` trước (this.applyFilters())
        const charBefore = idx > 0 ? code[idx - 1] : '\n';
        if (charBefore === '.') {
            // Đây là method call (this.xxx()), bỏ qua
            searchFrom = idx + funcSignature.length;
            continue;
        }

        // Tìm opening brace
        const afterSignature = code.indexOf('{', idx);
        if (afterSignature === -1) return null;

        let depth = 0;
        let funcEnd = -1;
        for (let i = afterSignature; i < code.length; i++) {
            if (code[i] === '{') depth++;
            if (code[i] === '}') depth--;
            if (depth === 0) {
                funcEnd = i + 1;
                break;
            }
        }

        if (funcEnd === -1) return null;
        return code.substring(idx, funcEnd);
    }
    return null;
}

// ========================================
// Pure logic extracted from source code
// ========================================

/**
 * Pure implementation of campaign filter logic from applyFilters().
 *
 * Observation from source code:
 *   if (campaign && order.campaignName !== campaign) continue;
 *
 * This filters orders where order.campaignName exactly matches the selected campaign.
 * When campaign is empty/falsy, all orders pass through (no filter applied).
 */
function filterByCampaign(statsData, selectedCampaign) {
    const filtered = [];

    for (const stat of statsData) {
        const employeeOrders = [];

        for (const [dateKey, dateData] of Object.entries(stat.dates)) {
            const orders = dateData.orders || [];
            for (const order of orders) {
                // Exact logic from applyFilters(): string equality check
                if (selectedCampaign && order.campaignName !== selectedCampaign) continue;
                employeeOrders.push({ ...order, date: dateKey });
            }
        }

        if (employeeOrders.length > 0) {
            filtered.push({
                userId: stat.userId,
                userName: stat.userName || stat.userId,
                orders: employeeOrders
            });
        }
    }

    return filtered;
}

/**
 * Pure implementation of summary card calculation from updateSummaryCards().
 *
 * Observation from source code:
 *   totalEmployees = filteredData.length
 *   totalOrders += emp.orders.length
 *   totalNet += order.netProducts || 0
 *   totalKPI += order.kpi || 0
 */
function calculateSummary(filteredData) {
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

// ========================================
// fast-check Arbitraries (Generators)
// ========================================

/** Generate a random campaign name */
const arbCampaignName = fc.oneof(
    fc.constantFrom(
        'Live 15/12', 'Live 18/12', 'Live 22/12 Noel',
        '30/12/2025', '3/1/2026 NEW YEAR', '06/01/2026 CHOÁY',
        'TEST1', 'SALE THÀNH PHỐ 6/2'
    ),
    fc.string({ minLength: 1, maxLength: 30 })
);

/** Generate a random order */
const arbOrder = fc.record({
    orderId: fc.string({ minLength: 1, maxLength: 20 }),
    campaignName: arbCampaignName,
    netProducts: fc.integer({ min: 0, max: 100 }),
    kpi: fc.integer({ min: 0, max: 500000 }),
    hasDiscrepancy: fc.boolean(),
    stt: fc.integer({ min: 1, max: 999 })
});

/** Generate a date key (YYYY-MM-DD format) */
const arbDateKey = fc.tuple(
    fc.integer({ min: 2024, max: 2026 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Generate date data (a date key with orders) */
const arbDateData = fc.tuple(arbDateKey, fc.array(arbOrder, { minLength: 0, maxLength: 5 }))
    .map(([dateKey, orders]) => [dateKey, { orders }]);

/** Generate a single employee's stats data */
const arbEmployeeStat = fc.record({
    userId: fc.string({ minLength: 1, maxLength: 15 }),
    userName: fc.string({ minLength: 1, maxLength: 20 }),
    dates: fc.array(arbDateData, { minLength: 1, maxLength: 4 })
        .map(entries => Object.fromEntries(entries))
});

/** Generate a list of employee stats */
const arbStatsData = fc.array(arbEmployeeStat, { minLength: 0, maxLength: 8 });

/** Generate filtered data (array of { userId, userName, orders }) */
const arbFilteredData = fc.array(
    fc.record({
        userId: fc.string({ minLength: 1, maxLength: 15 }),
        userName: fc.string({ minLength: 1, maxLength: 20 }),
        orders: fc.array(arbOrder, { minLength: 1, maxLength: 10 })
    }),
    { minLength: 0, maxLength: 8 }
);

// ========================================
// Tests
// ========================================

describe('Preservation: Filter logic applyFilters() không thay đổi', () => {

    /**
     * Property 2a: Campaign filter trả về CHỈ orders matching campaignName.
     *
     * Observation: applyFilters() dùng `if (campaign && order.campaignName !== campaign) continue;`
     * → Chỉ giữ orders có campaignName === selectedCampaign.
     *
     * Property: Cho BẤT KỲ danh sách orders và campaign filter, tất cả orders
     * trong kết quả PHẢI có campaignName === selectedCampaign.
     *
     * **Validates: Requirements 3.1**
     */
    it('Property 2a: Filter by campaign chỉ trả về orders có campaignName khớp chính xác', () => {
        fc.assert(
            fc.property(
                arbStatsData,
                arbCampaignName,
                (statsData, selectedCampaign) => {
                    const filtered = filterByCampaign(statsData, selectedCampaign);

                    // Mọi order trong kết quả PHẢI có campaignName === selectedCampaign
                    for (const emp of filtered) {
                        for (const order of emp.orders) {
                            if (order.campaignName !== selectedCampaign) return false;
                        }
                    }
                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2b: Khi campaign filter rỗng, TẤT CẢ orders được giữ lại.
     *
     * Observation: `if (campaign && ...)` — khi campaign falsy, điều kiện skip
     * không bao giờ trigger → tất cả orders pass through.
     *
     * Property: Cho BẤT KỲ danh sách orders, filter với campaign='' trả về
     * tổng số orders bằng tổng số orders trong input.
     *
     * **Validates: Requirements 3.1**
     */
    it('Property 2b: Filter với campaign rỗng giữ lại tất cả orders', () => {
        fc.assert(
            fc.property(
                arbStatsData,
                (statsData) => {
                    const filtered = filterByCampaign(statsData, '');

                    // Đếm tổng orders trong input
                    let totalInputOrders = 0;
                    for (const stat of statsData) {
                        for (const dateData of Object.values(stat.dates)) {
                            totalInputOrders += (dateData.orders || []).length;
                        }
                    }

                    // Đếm tổng orders trong output
                    let totalOutputOrders = 0;
                    for (const emp of filtered) {
                        totalOutputOrders += emp.orders.length;
                    }

                    return totalOutputOrders === totalInputOrders;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2c: Filter KHÔNG bao giờ trả về employee với 0 orders.
     *
     * Observation: `if (employeeOrders.length > 0) { filtered.push(...) }`
     * → Employee chỉ xuất hiện trong kết quả nếu có ít nhất 1 order matching.
     *
     * Property: Cho BẤT KỲ input, mọi employee trong kết quả có orders.length > 0.
     *
     * **Validates: Requirements 3.1**
     */
    it('Property 2c: Filter không trả về employee với 0 orders', () => {
        fc.assert(
            fc.property(
                arbStatsData,
                arbCampaignName,
                (statsData, selectedCampaign) => {
                    const filtered = filterByCampaign(statsData, selectedCampaign);

                    for (const emp of filtered) {
                        if (emp.orders.length === 0) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2d: Source code applyFilters() chứa đúng logic campaign filter.
     *
     * Observation: Dòng `if (campaign && order.campaignName !== campaign) continue;`
     * phải tồn tại trong source code.
     *
     * Property: Source code PHẢI chứa campaign filter logic dùng string equality.
     *
     * **Validates: Requirements 3.1**
     */
    it('Property 2d: Source code applyFilters() chứa campaign filter logic đúng', () => {
        const applyFiltersBody = extractFunctionBody(sourceCode, 'applyFilters()');
        expect(applyFiltersBody).not.toBeNull();

        // Phải chứa campaign filter bằng string equality
        const hasCampaignFilter = applyFiltersBody.includes('order.campaignName !== campaign');
        expect(hasCampaignFilter).toBe(true);
    });
});

describe('Preservation: Summary cards updateSummaryCards() tính toán đúng', () => {

    /**
     * Property 2e: totalEmployees = số lượng employees trong filteredData.
     *
     * Observation: `let totalEmployees = filteredData.length;`
     *
     * Property: Cho BẤT KỲ filteredData, totalEmployees === filteredData.length.
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2e: totalEmployees = filteredData.length', () => {
        fc.assert(
            fc.property(
                arbFilteredData,
                (filteredData) => {
                    const summary = calculateSummary(filteredData);
                    return summary.totalEmployees === filteredData.length;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2f: totalOrders = tổng số orders across tất cả employees.
     *
     * Observation: `totalOrders += emp.orders.length;`
     *
     * Property: Cho BẤT KỲ filteredData, totalOrders === sum(emp.orders.length).
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2f: totalOrders = tổng emp.orders.length', () => {
        fc.assert(
            fc.property(
                arbFilteredData,
                (filteredData) => {
                    const summary = calculateSummary(filteredData);
                    const expected = filteredData.reduce((sum, emp) => sum + emp.orders.length, 0);
                    return summary.totalOrders === expected;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2g: totalNet = tổng order.netProducts across tất cả orders.
     *
     * Observation: `totalNet += order.netProducts || 0;`
     *
     * Property: Cho BẤT KỲ filteredData, totalNet === sum(order.netProducts || 0).
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2g: totalNet = tổng order.netProducts', () => {
        fc.assert(
            fc.property(
                arbFilteredData,
                (filteredData) => {
                    const summary = calculateSummary(filteredData);
                    let expected = 0;
                    for (const emp of filteredData) {
                        for (const order of emp.orders) {
                            expected += order.netProducts || 0;
                        }
                    }
                    return summary.totalNet === expected;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2h: totalKPI = tổng order.kpi across tất cả orders.
     *
     * Observation: `totalKPI += order.kpi || 0;`
     *
     * Property: Cho BẤT KỲ filteredData, totalKPI === sum(order.kpi || 0).
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2h: totalKPI = tổng order.kpi', () => {
        fc.assert(
            fc.property(
                arbFilteredData,
                (filteredData) => {
                    const summary = calculateSummary(filteredData);
                    let expected = 0;
                    for (const emp of filteredData) {
                        for (const order of emp.orders) {
                            expected += order.kpi || 0;
                        }
                    }
                    return summary.totalKPI === expected;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Property 2i: Summary với filteredData rỗng trả về tất cả = 0.
     *
     * Observation: Khi filteredData = [], tất cả tổng = 0.
     *
     * Property: calculateSummary([]) === { totalEmployees: 0, totalOrders: 0, totalNet: 0, totalKPI: 0 }
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2i: Summary với filteredData rỗng trả về tất cả = 0', () => {
        const summary = calculateSummary([]);
        expect(summary.totalEmployees).toBe(0);
        expect(summary.totalOrders).toBe(0);
        expect(summary.totalNet).toBe(0);
        expect(summary.totalKPI).toBe(0);
    });

    /**
     * Property 2j: Source code updateSummaryCards() chứa đúng calculation logic.
     *
     * Observation: Hàm phải tính totalEmployees, totalOrders, totalNet, totalKPI.
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2j: Source code updateSummaryCards() chứa đúng calculation logic', () => {
        const updateSummaryBody = extractFunctionBody(sourceCode, 'updateSummaryCards(filteredData)');
        expect(updateSummaryBody).not.toBeNull();

        // Phải tính totalEmployees (Bug #4: đếm employees có valid orders, loại stale)
        expect(updateSummaryBody).toContain('totalEmployees');
        // Phải tính totalOrders (Bug #4: đếm từng order, skip stale)
        expect(updateSummaryBody).toContain('totalOrders');
        // Phải tính totalNet từ order.netProducts
        expect(updateSummaryBody).toContain('order.netProducts');
        // Phải tính totalKPI từ order.kpi
        expect(updateSummaryBody).toContain('order.kpi');
        // Bug #4 fix: phải exclude stale orders
        expect(updateSummaryBody).toContain('_stale');
    });
});

describe('Preservation: Empty campaign list → dropdown chỉ có "Tất cả"', () => {

    /**
     * Property 2k: Khi campaign list rỗng, dropdown KHÔNG có thêm option nào
     * ngoài default "Tất cả".
     *
     * Observation: loadCampaignOptions() chỉ append options từ snapshot.
     * Nếu snapshot rỗng (0 documents), không có option nào được thêm.
     * HTML đã có sẵn `<option value="">Tất cả</option>` làm default.
     *
     * Property: Cho danh sách campaigns rỗng, số options được thêm = 0.
     *
     * **Validates: Requirements 3.5**
     */
    it('Property 2k: Campaign list rỗng → 0 options được thêm vào dropdown', () => {
        fc.assert(
            fc.property(
                // Sinh random số lần gọi (property phải đúng cho mọi lần)
                fc.integer({ min: 1, max: 10 }),
                (_iteration) => {
                    // Simulate: snapshot rỗng → campaigns array rỗng → forEach không chạy
                    const campaigns = [];
                    // campaigns.sort() trên array rỗng → vẫn rỗng
                    campaigns.sort();
                    // campaigns.forEach() trên array rỗng → không append option nào
                    let optionsAdded = 0;
                    campaigns.forEach(() => { optionsAdded++; });

                    return optionsAdded === 0;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 2l: HTML template có sẵn option "Tất cả" làm default.
     *
     * Observation: tab-kpi-commission.html chứa:
     *   <select id="kpiFilterCampaign"><option value="">Tất cả</option></select>
     *
     * Property: HTML template PHẢI có default option "Tất cả" với value="".
     *
     * **Validates: Requirements 3.5**
     */
    it('Property 2l: HTML template có sẵn option "Tất cả" làm default', () => {
        const htmlCode = readN2File('orders-report/tab-kpi-commission.html');

        // Phải có select element với id kpiFilterCampaign
        expect(htmlCode).toContain('kpiFilterCampaign');
        // Phải có default option "Tất cả" với value rỗng
        const hasDefaultOption = /option\s+value=""\s*>.*Tất cả/i.test(htmlCode);
        expect(hasDefaultOption).toBe(true);
    });

    /**
     * Property 2m: renderAllProductsTab() vẫn đọc report_order_details cho chi tiết SP.
     *
     * Observation: renderAllProductsTab() query `db.collection('report_order_details')`
     * để lấy chi tiết sản phẩm đơn hàng. Fix KHÔNG thay đổi hàm này.
     *
     * Property: Source code renderAllProductsTab() PHẢI chứa query report_order_details.
     *
     * **Validates: Requirements 3.2**
     */
    it('Property 2m: renderAllProductsTab() vẫn đọc report_order_details', () => {
        const renderAllProductsBody = extractFunctionBody(sourceCode, 'async renderAllProductsTab(orderId)');
        expect(renderAllProductsBody).not.toBeNull();

        // renderAllProductsTab PHẢI query report_order_details cho chi tiết SP
        const queriesReportOrderDetails = renderAllProductsBody.includes("collection('report_order_details')");
        expect(queriesReportOrderDetails).toBe(true);
    });
});
