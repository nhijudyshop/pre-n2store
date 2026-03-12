/**
 * Bug Condition Exploration Test
 *
 * Property 1: Fault Condition - Campaign Dropdown Sai Collection & Firebase Race Condition
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * CRITICAL: Test này PHẢI FAIL trên code chưa fix - failure xác nhận lỗi tồn tại.
 * KHÔNG sửa test hoặc code khi test fail.
 *
 * Bug 1: loadCampaignOptions() query `report_order_details` (chỉ ~11 campaign đã sync)
 * thay vì `campaigns` (tất cả ~20+ chiến dịch). Dùng `doc.id` thay vì `doc.data().name`.
 *
 * Bug 2: DOMContentLoaded handler dùng `setTimeout(500ms)` cố định thay vì polling
 * chờ Firebase SDK sẵn sàng. Nếu SDK load > 500ms, getDb() trả về null.
 *
 * Test đọc actual source code từ disk vì đây là static HTML project.
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

/**
 * Helper: Trích xuất body của hàm loadCampaignOptions() từ source code.
 */
function extractFunctionBody(sourceCode, funcSignature) {
    const funcStart = sourceCode.indexOf(funcSignature);
    if (funcStart === -1) return null;

    const afterSignature = sourceCode.indexOf('{', funcStart);
    if (afterSignature === -1) return null;

    let depth = 0;
    let funcEnd = -1;
    for (let i = afterSignature; i < sourceCode.length; i++) {
        if (sourceCode[i] === '{') depth++;
        if (sourceCode[i] === '}') depth--;
        if (depth === 0) {
            funcEnd = i + 1;
            break;
        }
    }

    if (funcEnd === -1) return null;
    return sourceCode.substring(funcStart, funcEnd);
}

/**
 * Helper: Trích xuất DOMContentLoaded handler block từ source code.
 */
function extractDOMContentLoadedBlock(sourceCode) {
    const marker = "document.addEventListener('DOMContentLoaded'";
    const start = sourceCode.indexOf(marker);
    if (start === -1) return null;

    const afterMarker = sourceCode.indexOf('{', start);
    if (afterMarker === -1) return null;

    // Find the matching closing brace for the outer callback
    let depth = 0;
    let end = -1;
    for (let i = afterMarker; i < sourceCode.length; i++) {
        if (sourceCode[i] === '{') depth++;
        if (sourceCode[i] === '}') depth--;
        if (depth === 0) {
            end = i + 1;
            break;
        }
    }

    if (end === -1) return null;
    return sourceCode.substring(start, end);
}

describe('Bug Condition Exploration: KPI Campaign Dropdown Sai Collection & Firebase Race Condition', () => {
    const SOURCE_PATH = 'orders-report/js/tab-kpi-commission.js';
    const sourceCode = readN2File(SOURCE_PATH);
    const loadCampaignBody = extractFunctionBody(sourceCode, 'async loadCampaignOptions()');
    const domContentBlock = extractDOMContentLoadedBlock(sourceCode);

    /**
     * Bug 1a: loadCampaignOptions() PHẢI query collection `campaigns`
     * thay vì `report_order_details`.
     *
     * Trên code chưa fix, hàm gọi:
     *   db.collection('report_order_details').get()
     * thay vì:
     *   db.collection('campaigns').get()
     *
     * Test SẼ FAIL vì source code chứa 'report_order_details' trong loadCampaignOptions.
     *
     * **Validates: Requirements 1.1, 2.1**
     */
    it('Bug 1a: loadCampaignOptions() phải query collection campaigns, không phải report_order_details', () => {
        expect(loadCampaignBody).not.toBeNull();

        fc.assert(
            fc.property(
                // Sinh random campaign names — property phải đúng cho MỌI campaign
                fc.constantFrom(
                    'Live 15/12', 'Live 18/12', 'Live 22/12 Noel',
                    '30/12/2025', '3/1/2026 NEW YEAR', '06/01/2026 CHOÁY',
                    '10/01/2026 LÊNNN', '12/01/2026 QQ', 'TEST1',
                    'SALE THÀNH PHỐ 6/2'
                ),
                (_campaignName) => {
                    // loadCampaignOptions PHẢI chứa collection('campaigns')
                    const queriesCampaignsCollection = loadCampaignBody.includes("collection('campaigns')");
                    // loadCampaignOptions KHÔNG ĐƯỢC chứa collection('report_order_details')
                    const queriesReportOrderDetails = loadCampaignBody.includes("collection('report_order_details')");

                    // Hành vi mong đợi: dùng campaigns, KHÔNG dùng report_order_details
                    return queriesCampaignsCollection && !queriesReportOrderDetails;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Bug 1b: loadCampaignOptions() PHẢI extract campaign name từ doc.data().name
     * thay vì dùng doc.id.
     *
     * Trên code chưa fix, hàm dùng:
     *   campaigns.push(doc.id)
     * thay vì:
     *   campaigns.push(doc.data().name)
     *
     * Collection `campaigns` dùng auto-ID, campaign name nằm trong doc.data().name.
     * Dùng doc.id sẽ trả về auto-generated ID thay vì tên chiến dịch.
     *
     * Test SẼ FAIL vì source code dùng doc.id.
     *
     * **Validates: Requirements 1.2, 2.2**
     */
    it('Bug 1b: loadCampaignOptions() phải extract doc.data().name thay vì doc.id', () => {
        expect(loadCampaignBody).not.toBeNull();

        // Kiểm tra source code: phải dùng doc.data().name hoặc tương đương
        const usesDocDataName = /doc\.data\(\)\.name/.test(loadCampaignBody)
            || /data\.name/.test(loadCampaignBody);
        // Không nên dùng doc.id làm campaign name trong loadCampaignOptions
        const usesDocId = /campaigns\.push\(doc\.id\)/.test(loadCampaignBody);

        // Hành vi mong đợi: dùng doc.data().name, KHÔNG dùng doc.id
        expect(usesDocDataName).toBe(true);
        expect(usesDocId).toBe(false);
    });

    /**
     * Bug 2a: DOMContentLoaded handler KHÔNG ĐƯỢC dùng setTimeout cố định.
     * PHẢI dùng polling/waitForFirebase để chờ Firebase SDK sẵn sàng.
     *
     * Trên code chưa fix, handler dùng:
     *   setTimeout(function() { KPICommission.init(); }, 500);
     *
     * Test SẼ FAIL vì source code dùng setTimeout thay vì polling.
     *
     * **Validates: Requirements 1.3, 1.4, 2.3**
     */
    it('Bug 2a: DOMContentLoaded handler phải dùng polling waitForFirebase, không phải setTimeout cố định', () => {
        expect(domContentBlock).not.toBeNull();

        fc.assert(
            fc.property(
                // Sinh random SDK load times — property phải đúng cho MỌI thời gian load
                fc.integer({ min: 100, max: 5000 }),
                (_sdkLoadTimeMs) => {
                    // DOMContentLoaded block KHÔNG ĐƯỢC chứa setTimeout cố định
                    const usesSetTimeout = /setTimeout\s*\(/.test(domContentBlock);
                    // PHẢI chứa waitForFirebase hoặc cơ chế polling tương đương
                    const usesPolling = domContentBlock.includes('waitForFirebase')
                        || domContentBlock.includes('setInterval')
                        || /poll/i.test(domContentBlock);

                    // Hành vi mong đợi: dùng polling, KHÔNG dùng setTimeout cố định
                    return !usesSetTimeout && usesPolling;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Bug 2b: Init mechanism PHẢI có timeout handling (hiển thị lỗi khi
     * Firebase SDK không load được) thay vì silently fail.
     *
     * Trên code chưa fix, không có error handling cho trường hợp
     * Firebase SDK không load được — loading spinner hiển thị vô hạn.
     *
     * Test SẼ FAIL vì source code không có timeout error handling.
     *
     * **Validates: Requirements 1.4, 2.4**
     */
    it('Bug 2b: Init mechanism phải có timeout error handling khi Firebase SDK không load được', () => {
        // Kiểm tra toàn bộ source code cho timeout/error handling pattern
        // Phải có cơ chế catch timeout và hiển thị lỗi
        const hasTimeoutHandling = sourceCode.includes('waitForFirebase')
            || (sourceCode.includes('.catch') && /firebase|sdk|timeout/i.test(sourceCode));
        const hasErrorDisplay = /không thể kết nối|error|lỗi.*firebase|firebase.*lỗi|timeout.*error/i.test(sourceCode)
            && /tải lại|reload|retry/i.test(sourceCode);

        // Hành vi mong đợi: có timeout handling VÀ error display
        expect(hasTimeoutHandling).toBe(true);
        expect(hasErrorDisplay).toBe(true);
    });
});
