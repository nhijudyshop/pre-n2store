/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - API tìm kiếm/recent không trả về wallet data,
 * cột ví luôn hiển thị 0 trong kết quả tìm kiếm khách hàng.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 * 
 * CRITICAL: Test này PHẢI FAIL trên code chưa fix - failure xác nhận lỗi tồn tại.
 * KHÔNG sửa test hoặc code khi test fail.
 * 
 * Bug: CustomerSearchModule.generateRowsHtml() đọc customer.virtual_balance || 0
 * và customer.real_balance || 0 từ kết quả API tìm kiếm/recent. Nhưng API không
 * trả về các trường này (undefined), nên cột ví luôn hiển thị 0.
 * Thiếu bước gọi getWalletBatch() để enrich dữ liệu ví trước khi render.
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
 * Helper: Trích xuất body của một method từ source code của class.
 */
function extractMethodBody(sourceCode, methodName) {
    // Match both async and non-async methods
    const patterns = [
        `async ${methodName}(`,
        `${methodName}(`
    ];

    let funcStart = -1;
    for (const pattern of patterns) {
        funcStart = sourceCode.indexOf(pattern);
        if (funcStart !== -1) break;
    }
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

describe('Bug Condition Exploration: Ví khách hàng hiển thị 0 trong tìm kiếm', () => {
    const CUSTOMER_SEARCH_PATH = 'customer-hub/js/modules/customer-search.js';
    const sourceCode = readN2File(CUSTOMER_SEARCH_PATH);

    /**
     * Property 1a: CustomerSearchModule PHẢI có method enrichCustomersWithWallet()
     * để bổ sung dữ liệu ví cho kết quả tìm kiếm trước khi render.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì method không tồn tại.
     * 
     * **Validates: Requirements 2.1, 2.2, 2.3**
     */
    it('Property 1a: CustomerSearchModule phải có method enrichCustomersWithWallet', () => {
        fc.assert(
            fc.property(
                // Sinh random phone numbers — property phải đúng cho MỌI customer
                fc.record({
                    phone: fc.stringMatching(/^0[0-9]{9}$/),
                    name: fc.string({ minLength: 1, maxLength: 20 }),
                }),
                (_customer) => {
                    // Method enrichCustomersWithWallet PHẢI tồn tại trong source code
                    const hasEnrichMethod = sourceCode.includes('enrichCustomersWithWallet');
                    return hasEnrichMethod;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 1b: performSearch() PHẢI gọi enrichCustomersWithWallet() hoặc
     * getWalletBatch() TRƯỚC khi render kết quả.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì performSearch() không gọi
     * bất kỳ wallet enrichment nào.
     * 
     * **Validates: Requirements 1.1, 2.1**
     */
    it('Property 1b: performSearch() phải gọi wallet enrichment trước khi render', () => {
        const performSearchBody = extractMethodBody(sourceCode, 'performSearch');
        expect(performSearchBody).not.toBeNull();

        fc.assert(
            fc.property(
                fc.constantFrom('search', 'recent', 'loadMore'),
                (_source) => {
                    // performSearch PHẢI gọi enrichCustomersWithWallet hoặc getWalletBatch
                    const callsEnrich = performSearchBody.includes('enrichCustomersWithWallet')
                        || performSearchBody.includes('getWalletBatch');
                    return callsEnrich;
                }
            ),
            { numRuns: 10 }
        );
    });

    /**
     * Property 1c: loadRecentCustomers() PHẢI gọi wallet enrichment
     * TRƯỚC khi render kết quả.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì loadRecentCustomers() không gọi
     * bất kỳ wallet enrichment nào.
     * 
     * **Validates: Requirements 1.2, 2.2**
     */
    it('Property 1c: loadRecentCustomers() phải gọi wallet enrichment trước khi render', () => {
        const loadRecentBody = extractMethodBody(sourceCode, 'loadRecentCustomers');
        expect(loadRecentBody).not.toBeNull();

        fc.assert(
            fc.property(
                fc.record({
                    phone: fc.stringMatching(/^0[0-9]{9}$/),
                    virtual_balance: fc.integer({ min: 1, max: 10000000 }),
                    real_balance: fc.integer({ min: 1, max: 10000000 }),
                }),
                (_walletData) => {
                    const callsEnrich = loadRecentBody.includes('enrichCustomersWithWallet')
                        || loadRecentBody.includes('getWalletBatch');
                    return callsEnrich;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 1d: loadMore() PHẢI gọi wallet enrichment TRƯỚC khi
     * append kết quả mới.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì loadMore() không gọi
     * bất kỳ wallet enrichment nào.
     * 
     * **Validates: Requirements 1.3, 2.3**
     */
    it('Property 1d: loadMore() phải gọi wallet enrichment trước khi append', () => {
        const loadMoreBody = extractMethodBody(sourceCode, 'loadMore');
        expect(loadMoreBody).not.toBeNull();

        fc.assert(
            fc.property(
                fc.record({
                    phone: fc.stringMatching(/^0[0-9]{9}$/),
                    virtual_balance: fc.integer({ min: 1, max: 10000000 }),
                    real_balance: fc.integer({ min: 1, max: 10000000 }),
                }),
                (_walletData) => {
                    const callsEnrich = loadMoreBody.includes('enrichCustomersWithWallet')
                        || loadMoreBody.includes('getWalletBatch');
                    return callsEnrich;
                }
            ),
            { numRuns: 20 }
        );
    });
});
