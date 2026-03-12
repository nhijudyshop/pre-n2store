/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - Phantom transactions từ customer_tickets
 * và customer_activities trong modal lịch sử giao dịch ví
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 * 
 * CRITICAL: Test này PHẢI FAIL trên code chưa fix - failure xác nhận lỗi tồn tại.
 * KHÔNG sửa test hoặc code khi test fail.
 * 
 * Bug: Hàm _showTransactionHistory() trong wallet-panel.js gọi endpoint
 * consolidated `/v2/customers/:phone/transactions` thay vì wallet-only
 * endpoint `/v2/wallets/:phone/transactions`. Điều này khiến entries từ
 * customer_tickets và customer_activities xuất hiện như giao dịch ví.
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
 * Helper: Trích xuất body của hàm _showTransactionHistory() từ source code.
 * Tìm hàm và trả về toàn bộ body bao gồm cả fetch URL.
 */
function extractShowTransactionHistoryBody(sourceCode) {
    const funcStart = sourceCode.indexOf('async _showTransactionHistory()');
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

describe('Bug Condition Exploration: Phantom transactions trong modal lịch sử ví', () => {
    // Đọc source code wallet-panel.js
    const WALLET_PANEL_PATH = 'customer-hub/js/modules/wallet-panel.js';
    const sourceCode = readN2File(WALLET_PANEL_PATH);
    const functionBody = extractShowTransactionHistoryBody(sourceCode);

    /**
     * Property 1a: _showTransactionHistory() PHẢI gọi wallet-only endpoint
     * `/v2/wallets/` thay vì consolidated endpoint `/v2/customers/`.
     * 
     * Kiểm tra trực tiếp trong source code: fetch URL phải chứa
     * `/v2/wallets/` và KHÔNG chứa `/v2/customers/`.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì hàm gọi:
     * `/v2/customers/${this.customerPhone}/transactions?limit=50`
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 1a: _showTransactionHistory() phải sử dụng wallet-only endpoint /v2/wallets/', () => {
        expect(functionBody).not.toBeNull();

        fc.assert(
            fc.property(
                // Sinh random phone numbers — property phải đúng cho MỌI phone
                fc.constantFrom(
                    '0901234567', '0912345678', '84901234567',
                    '0987654321', '0123456789'
                ),
                (_phone) => {
                    // Hàm PHẢI chứa /v2/wallets/ trong fetch URL
                    const hasWalletEndpoint = functionBody.includes('/v2/wallets/');
                    // Hàm KHÔNG ĐƯỢC chứa /v2/customers/ trong fetch URL
                    const hasConsolidatedEndpoint = functionBody.includes('/v2/customers/');

                    // Hành vi mong đợi: dùng wallet-only, KHÔNG dùng consolidated
                    return hasWalletEndpoint && !hasConsolidatedEndpoint;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 1b: URL trong fetch() call của _showTransactionHistory()
     * PHẢI chứa path segment `/v2/wallets/` kết hợp với `/transactions`.
     * 
     * Trên code chưa fix, test này SẼ FAIL vì URL chứa `/v2/customers/`
     * thay vì `/v2/wallets/`.
     * 
     * **Validates: Requirements 1.3, 2.3**
     */
    it('Property 1b: fetch URL phải match pattern /v2/wallets/.../transactions', () => {
        expect(functionBody).not.toBeNull();

        // Regex kiểm tra: URL phải có pattern /v2/wallets/...something.../transactions
        const walletEndpointPattern = /\/v2\/wallets\/[^/]+\/transactions/;
        const consolidatedEndpointPattern = /\/v2\/customers\/[^/]+\/transactions/;

        // Hành vi mong đợi: có wallet-only endpoint pattern
        expect(walletEndpointPattern.test(functionBody)).toBe(true);
        // KHÔNG có consolidated endpoint pattern
        expect(consolidatedEndpointPattern.test(functionBody)).toBe(false);
    });

    /**
     * Property 1c: Với BẤT KỲ wallet transaction type nào, endpoint
     * được gọi bởi _showTransactionHistory() KHÔNG ĐƯỢC là consolidated
     * endpoint (UNION 3 bảng).
     * 
     * Consolidated endpoint `/v2/customers/:phone/transactions` trả về
     * phantom entries từ customer_tickets (RETURN_SHIPPER) và
     * customer_activities (TICKET_CREATED).
     * 
     * Trên code chưa fix, test này SẼ FAIL.
     * 
     * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
     */
    it('Property 1c: _showTransactionHistory() không được gọi consolidated endpoint', () => {
        expect(functionBody).not.toBeNull();

        // Regex pattern cho consolidated endpoint: /v2/customers/.../transactions
        const consolidatedPattern = /\/v2\/customers\/[^/]+\/transactions/;
        const usesConsolidatedEndpoint = consolidatedPattern.test(functionBody);

        fc.assert(
            fc.property(
                // Sinh các loại wallet transaction types hợp lệ
                fc.constantFrom(
                    'DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT',
                    'VIRTUAL_DEBIT', 'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL',
                    'ADJUSTMENT'
                ),
                (_txType) => {
                    // Hành vi mong đợi: KHÔNG sử dụng consolidated endpoint
                    // Nếu usesConsolidatedEndpoint = true → return false → test FAIL
                    return !usesConsolidatedEndpoint;
                }
            ),
            { numRuns: 20 }
        );
    });
});
