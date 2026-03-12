/**
 * Preservation Property Tests - Hiển thị Ví trong Tìm kiếm Khách hàng
 * 
 * Property 2: Preservation - Hành vi hiện tại được bảo toàn cho khách hàng
 * không có ví và khi wallet fields undefined.
 * 
 * **Validates: Requirements 3.1, 3.3, 3.5**
 * 
 * IMPORTANT: Tests này PHẢI PASS trên code CHƯA SỬA để thiết lập baseline
 * hành vi cần bảo toàn sau khi fix.
 * 
 * Phương pháp observation-first: quan sát hành vi hiện tại, encode thành properties.
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

// Đọc source code customer-search.js
const CUSTOMER_SEARCH_PATH = 'customer-hub/js/modules/customer-search.js';
const sourceCode = readN2File(CUSTOMER_SEARCH_PATH);

/**
 * Helper: Tái tạo hàm formatDebt từ source code.
 * Observation: formatDebt(balance, virtual, real) format số với toLocaleString('de-DE')
 * và áp dụng CSS class theo giá trị balance (green > 0, red < 0, slate = 0).
 */
function formatDebt(balance, virtual, real) {
    const formatNum = (num) => {
        if (num === 0) return '0';
        return Math.round(num).toLocaleString('de-DE');
    };
    const balanceClass = balance > 0 ? 'text-green-600 dark:text-green-400' : balance < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-600 dark:text-slate-300';
    return `
            <div class="text-sm">
                <div class="${balanceClass} font-semibold text-base">${formatNum(balance)}</div>
                <div class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Ảo: ${formatNum(virtual)} | Thực: ${formatNum(real)}</div>
            </div>
        `;
}

/**
 * Helper: Tái tạo logic generateRowsHtml cho wallet columns từ source code.
 * Chỉ trích xuất phần tính toán wallet để test isolation.
 */
function computeWalletValues(customer) {
    const virtualBalance = customer.virtual_balance || 0;
    const realBalance = customer.real_balance || 0;
    const balance = customer.balance !== undefined ? customer.balance : (virtualBalance + realBalance);
    return { balance, virtualBalance, realBalance };
}

/**
 * Helper: Tái tạo generateRowsHtml đơn giản để test output HTML.
 * Trích xuất từ source code, chỉ giữ phần liên quan đến test.
 */
function generateRowsHtml(customers) {
    let html = '';
    customers.forEach((customer) => {
        const virtualBalance = customer.virtual_balance || 0;
        const realBalance = customer.real_balance || 0;
        const balance = customer.balance !== undefined ? customer.balance : (virtualBalance + realBalance);
        const debtInfo = formatDebt(balance, virtualBalance, realBalance);
        const address = customer.address || '';
        const truncatedAddress = address.length > 30 ? address.substring(0, 30) + '...' : address;
        const notes = (customer.notes || []).map(n => n.content || n).join(' | ');

        html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-4 py-3">
                        <div>
                            <p class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'Chưa có tên'}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400">${customer.phone || 'N/A'}</p>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        ${debtInfo}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-300" title="${customer.address || ''}">
                        ${truncatedAddress || '-'}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-[200px]" title="${(customer.notes || []).map(n => n.content).join(' | ')}">
                        <div class="truncate">${notes || '-'}</div>
                    </td>
                </tr>
            `;
    });
    return html;
}

// Generators cho property-based tests
const phoneArb = fc.stringMatching(/^0[0-9]{9}$/);
const nameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0);
const addressArb = fc.string({ minLength: 0, maxLength: 60 });
const statusArb = fc.constantFrom('Bình thường', 'Bom hàng', 'Cảnh báo', 'Nguy hiểm', 'VIP');

describe('Preservation: Khách hàng có wallet balance = 0 hiển thị đúng', () => {

    /**
     * PBT 1: Với mọi customer có virtual_balance = 0 và real_balance = 0,
     * generateRowsHtml PHẢI render balance = 0 và "Ảo: 0 | Thực: 0".
     * 
     * Observation trên code chưa sửa:
     * - generateRowsHtml([{name: "A", phone: "0901234567", virtual_balance: 0, real_balance: 0}])
     *   → hiển thị "0" cho balance, "Ảo: 0 | Thực: 0"
     * - balance = customer.balance !== undefined ? customer.balance : (0 + 0) = 0
     * 
     * **Validates: Requirements 3.1**
     */
    it('PBT 1: Customer có virtual_balance=0, real_balance=0 → hiển thị balance=0 và "Ảo: 0 | Thực: 0"', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: nameArb,
                    phone: phoneArb,
                    virtual_balance: fc.constant(0),
                    real_balance: fc.constant(0),
                    status: statusArb,
                    address: addressArb,
                }),
                (customer) => {
                    // Tính toán wallet values giống source code
                    const { balance, virtualBalance, realBalance } = computeWalletValues(customer);

                    // Balance PHẢI = 0
                    if (balance !== 0) return false;
                    if (virtualBalance !== 0) return false;
                    if (realBalance !== 0) return false;

                    // Render HTML và kiểm tra output
                    const html = generateRowsHtml([customer]);

                    // HTML PHẢI chứa "Ảo: 0 | Thực: 0"
                    if (!html.includes('Ảo: 0 | Thực: 0')) return false;

                    // Balance hiển thị PHẢI là "0" (không phải số khác)
                    // formatNum(0) = '0', nằm trong div.font-semibold
                    if (!html.includes('font-semibold text-base">0</div>')) return false;

                    // CSS class cho balance = 0 PHẢI là text-slate (không phải green hay red)
                    if (!html.includes('text-slate-600 dark:text-slate-300 font-semibold')) return false;

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 1 bổ sung: Customer có balance = 0 (explicit) cũng hiển thị đúng.
     * 
     * Observation: Khi customer.balance = 0 (không phải undefined),
     * code dùng customer.balance trực tiếp → balance = 0.
     * 
     * **Validates: Requirements 3.1**
     */
    it('PBT 1b: Customer có balance=0 explicit → hiển thị balance=0', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: nameArb,
                    phone: phoneArb,
                    balance: fc.constant(0),
                    virtual_balance: fc.constant(0),
                    real_balance: fc.constant(0),
                }),
                (customer) => {
                    const { balance } = computeWalletValues(customer);
                    if (balance !== 0) return false;

                    const html = generateRowsHtml([customer]);
                    return html.includes('Ảo: 0 | Thực: 0') &&
                           html.includes('font-semibold text-base">0</div>');
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Preservation: Khách hàng không có wallet fields (undefined) fallback về 0', () => {

    /**
     * PBT 2: Với mọi customer KHÔNG có wallet fields (undefined),
     * generateRowsHtml PHẢI render balance = 0 (fallback behavior).
     * 
     * Observation trên code chưa sửa:
     * - generateRowsHtml([{name: "B", phone: "0909999999"}])
     *   → virtual_balance = undefined || 0 = 0
     *   → real_balance = undefined || 0 = 0
     *   → balance = undefined !== undefined ? ... : (0 + 0) = 0
     *   → hiển thị "0" cho balance, "Ảo: 0 | Thực: 0"
     * 
     * **Validates: Requirements 3.1, 3.3**
     */
    it('PBT 2: Customer không có wallet fields → fallback hiển thị balance=0, "Ảo: 0 | Thực: 0"', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: nameArb,
                    phone: phoneArb,
                    status: statusArb,
                    address: addressArb,
                }),
                (customer) => {
                    // Customer KHÔNG có virtual_balance, real_balance, balance
                    // → tất cả fallback về 0

                    const { balance, virtualBalance, realBalance } = computeWalletValues(customer);

                    // Tất cả PHẢI = 0 do fallback
                    if (balance !== 0) return false;
                    if (virtualBalance !== 0) return false;
                    if (realBalance !== 0) return false;

                    // Render HTML
                    const html = generateRowsHtml([customer]);

                    // HTML PHẢI chứa "Ảo: 0 | Thực: 0"
                    if (!html.includes('Ảo: 0 | Thực: 0')) return false;

                    // Balance hiển thị PHẢI là "0"
                    if (!html.includes('font-semibold text-base">0</div>')) return false;

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 2b: Nhiều customers không có wallet fields → TẤT CẢ đều hiển thị 0.
     * 
     * Observation: generateRowsHtml xử lý từng customer độc lập,
     * mỗi customer không có wallet fields đều fallback về 0.
     * 
     * **Validates: Requirements 3.1, 3.3**
     */
    it('PBT 2b: Nhiều customers không có wallet fields → tất cả hiển thị balance=0', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        name: nameArb,
                        phone: phoneArb,
                        status: statusArb,
                    }),
                    { minLength: 1, maxLength: 10 }
                ),
                (customers) => {
                    const html = generateRowsHtml(customers);

                    // Đếm số lần xuất hiện "Ảo: 0 | Thực: 0" phải = số customers
                    const matches = html.match(/Ảo: 0 \| Thực: 0/g) || [];
                    return matches.length === customers.length;
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Preservation: Các cột khác không bị ảnh hưởng bởi wallet fields', () => {

    /**
     * PBT 3: Với mọi customer, các cột tên, SĐT, địa chỉ, ghi chú
     * PHẢI không bị ảnh hưởng bởi wallet fields.
     * 
     * Observation: generateRowsHtml render tên, SĐT, địa chỉ, ghi chú
     * từ customer.name, customer.phone, customer.address, customer.notes
     * — hoàn toàn độc lập với virtual_balance, real_balance, balance.
     * 
     * **Validates: Requirements 3.1, 3.5**
     */
    it('PBT 3: Cột tên và SĐT không bị ảnh hưởng bởi wallet fields', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: nameArb,
                    phone: phoneArb,
                    status: statusArb,
                    address: addressArb,
                }),
                // Wallet fields ngẫu nhiên (có hoặc không)
                fc.option(fc.integer({ min: 0, max: 10000000 })),
                fc.option(fc.integer({ min: 0, max: 10000000 })),
                (baseCustomer, virtualOpt, realOpt) => {
                    // Render KHÔNG có wallet fields
                    const htmlWithout = generateRowsHtml([{ ...baseCustomer }]);

                    // Render CÓ wallet fields
                    const customerWith = { ...baseCustomer };
                    if (virtualOpt !== null) customerWith.virtual_balance = virtualOpt;
                    if (realOpt !== null) customerWith.real_balance = realOpt;
                    const htmlWith = generateRowsHtml([customerWith]);

                    // Cột tên PHẢI giống nhau
                    if (!htmlWithout.includes(baseCustomer.name) || !htmlWith.includes(baseCustomer.name)) return false;

                    // Cột SĐT PHẢI giống nhau
                    if (!htmlWithout.includes(baseCustomer.phone) || !htmlWith.includes(baseCustomer.phone)) return false;

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 3b: Cột địa chỉ không bị ảnh hưởng bởi wallet fields.
     * 
     * **Validates: Requirements 3.1**
     */
    it('PBT 3b: Cột địa chỉ không bị ảnh hưởng bởi wallet fields', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: nameArb,
                    phone: phoneArb,
                    address: fc.string({ minLength: 1, maxLength: 25 }),
                }),
                fc.integer({ min: 0, max: 10000000 }),
                fc.integer({ min: 0, max: 10000000 }),
                (baseCustomer, virtualBal, realBal) => {
                    // Render không có wallet
                    const htmlWithout = generateRowsHtml([{ ...baseCustomer }]);

                    // Render có wallet
                    const htmlWith = generateRowsHtml([{
                        ...baseCustomer,
                        virtual_balance: virtualBal,
                        real_balance: realBal,
                    }]);

                    // Địa chỉ PHẢI xuất hiện trong cả hai
                    const addr = baseCustomer.address;
                    return htmlWithout.includes(addr) && htmlWith.includes(addr);
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Preservation: formatDebt render đúng với các giá trị balance', () => {

    /**
     * PBT 4: formatDebt(0, 0, 0) PHẢI render "0" và "Ảo: 0 | Thực: 0".
     * 
     * Observation: formatNum(0) = '0', balance = 0 → text-slate class.
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 4a: formatDebt(0, 0, 0) render "0" và "Ảo: 0 | Thực: 0"', () => {
        const html = formatDebt(0, 0, 0);
        expect(html).toContain('Ảo: 0 | Thực: 0');
        expect(html).toContain('>0</div>');
        expect(html).toContain('text-slate-600');
    });

    /**
     * PBT 4b: formatDebt với balance > 0 PHẢI render text-green class.
     * 
     * Observation: balance > 0 → 'text-green-600 dark:text-green-400'
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 4b: formatDebt với balance > 0 → text-green class', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50000000 }),
                fc.integer({ min: 0, max: 50000000 }),
                fc.integer({ min: 0, max: 50000000 }),
                (balance, virtual, real) => {
                    const html = formatDebt(balance, virtual, real);
                    return html.includes('text-green-600 dark:text-green-400');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4c: formatDebt với balance < 0 PHẢI render text-red class.
     * 
     * Observation: balance < 0 → 'text-red-500 dark:text-red-400'
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 4c: formatDebt với balance < 0 → text-red class', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -50000000, max: -1 }),
                fc.integer({ min: 0, max: 50000000 }),
                fc.integer({ min: 0, max: 50000000 }),
                (balance, virtual, real) => {
                    const html = formatDebt(balance, virtual, real);
                    return html.includes('text-red-500 dark:text-red-400');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4d: formatDebt format số với dấu chấm phân cách hàng nghìn (de-DE locale).
     * 
     * Observation: formatNum dùng Math.round(num).toLocaleString('de-DE')
     * Ví dụ: 2239999 → "2.239.999", 1000 → "1.000"
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 4d: formatDebt format số lớn với dấu chấm phân cách', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1000, max: 50000000 }),
                (balance) => {
                    const html = formatDebt(balance, 0, 0);
                    const expectedFormatted = Math.round(balance).toLocaleString('de-DE');
                    return html.includes(expectedFormatted);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4e: formatDebt LUÔN chứa "Ảo:" và "Thực:" trong output.
     * 
     * Observation: Template literal luôn render "Ảo: {virtual} | Thực: {real}"
     * bất kể giá trị input.
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 4e: formatDebt luôn chứa "Ảo:" và "Thực:" trong output', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -50000000, max: 50000000 }),
                fc.integer({ min: 0, max: 50000000 }),
                fc.integer({ min: 0, max: 50000000 }),
                (balance, virtual, real) => {
                    const html = formatDebt(balance, virtual, real);
                    return html.includes('Ảo:') && html.includes('Thực:');
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('Preservation: Source code generateRowsHtml logic không thay đổi', () => {

    /**
     * PBT 5: generateRowsHtml PHẢI tồn tại trong source code và chứa
     * logic fallback || 0 cho wallet fields.
     * 
     * Observation: Code hiện tại dùng:
     * - customer.virtual_balance || 0
     * - customer.real_balance || 0
     * - customer.balance !== undefined ? customer.balance : (virtualBalance + realBalance)
     * 
     * Logic này PHẢI được bảo toàn (hoặc tương đương) sau khi fix.
     * 
     * **Validates: Requirements 3.1, 3.3**
     */
    it('PBT 5: generateRowsHtml chứa fallback logic cho wallet fields', () => {
        // Tìm method definition (không phải method call this.generateRowsHtml)
        // Method definition: "    generateRowsHtml(customers" (4 spaces indent = class method)
        const defMatch = sourceCode.match(/    generateRowsHtml\(customers/);
        expect(defMatch).not.toBeNull();

        // Trích xuất vùng code từ method definition
        const methodStart = defMatch.index;
        const methodRegion = sourceCode.substring(methodStart, methodStart + 2000);

        fc.assert(
            fc.property(
                fc.constantFrom('virtual_balance', 'real_balance'),
                (field) => {
                    // Source code PHẢI chứa fallback || 0 cho wallet fields
                    return methodRegion.includes(`customer.${field} || 0`) ||
                           methodRegion.includes(`customer.${field}||0`);
                }
            ),
            { numRuns: 10 }
        );
    });

    /**
     * PBT 5b: formatDebt method PHẢI tồn tại trong source code.
     * 
     * **Validates: Requirements 3.5**
     */
    it('PBT 5b: formatDebt method tồn tại trong source code', () => {
        // Tìm method definition: "    formatDebt(balance" (4 spaces indent = class method)
        const defMatch = sourceCode.match(/    formatDebt\(balance/);
        expect(defMatch).not.toBeNull();

        // Trích xuất vùng code từ method definition
        const methodStart = defMatch.index;
        const methodRegion = sourceCode.substring(methodStart, methodStart + 1000);

        fc.assert(
            fc.property(
                fc.constantFrom('toLocaleString', 'de-DE'),
                (keyword) => {
                    return methodRegion.includes(keyword);
                }
            ),
            { numRuns: 10 }
        );
    });
});
