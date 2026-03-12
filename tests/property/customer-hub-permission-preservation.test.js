/**
 * Preservation Property Tests - Customer Hub PermissionHelper
 * 
 * Property 2: Preservation - User có đầy đủ quyền hoạt động bình thường sau fix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
 * 
 * IMPORTANT: Tests này PHẢI PASS trên code CHƯA FIX.
 * Chúng thiết lập baseline hành vi cần bảo toàn sau khi fix.
 * 
 * Tests xác nhận PermissionHelper class hoạt động đúng:
 * - hasPermission() trả về đúng giá trị được truyền vào constructor
 * - hasPageAccess() trả về true khi ít nhất 1 quyền = true
 * - Constructor nhận format { "customer-hub": { view: true, ... } }
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PermissionHelper } from '../../customer-hub/js/utils/permissions.js';

/**
 * 9 quyền customer-hub theo permissions-registry
 */
const CUSTOMER_HUB_PERMISSIONS = [
    'view', 'viewWallet', 'manageWallet', 'viewTickets',
    'createTicket', 'viewActivities', 'addNote', 'editCustomer',
    'linkTransactions'
];

/**
 * Arbitrary: sinh ngẫu nhiên object 9 quyền customer-hub (true/false)
 */
const customerHubPermsArb = fc.record({
    view: fc.boolean(),
    viewWallet: fc.boolean(),
    manageWallet: fc.boolean(),
    viewTickets: fc.boolean(),
    createTicket: fc.boolean(),
    viewActivities: fc.boolean(),
    addNote: fc.boolean(),
    editCustomer: fc.boolean(),
    linkTransactions: fc.boolean(),
});

describe('Preservation: PermissionHelper hasPermission() returns exact value from constructor', () => {

    /**
     * PBT 1: Sinh ngẫu nhiên tổ hợp 9 quyền customer-hub (true/false),
     * tạo PermissionHelper với tổ hợp đó, xác nhận hasPermission() trả về
     * đúng giá trị được truyền vào cho MỌI quyền.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
     */
    it('PBT 1: hasPermission() returns exact value passed in constructor for every permission', () => {
        fc.assert(
            fc.property(
                customerHubPermsArb,
                (perms) => {
                    const helper = new PermissionHelper({ 'customer-hub': perms });

                    for (const key of CUSTOMER_HUB_PERMISSIONS) {
                        const result = helper.hasPermission('customer-hub', key);
                        if (result !== perms[key]) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });
});

describe('Preservation: Full permissions behave identically to hardcoded behavior', () => {

    /**
     * PBT 2: Với tất cả 9 quyền = true, xác nhận hasPermission() trả về true
     * cho mọi quyền — giống hệt hành vi hardcode gốc trong main.js.
     * 
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
     */
    it('PBT 2: with all permissions = true, hasPermission() returns true for all 9 permissions', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...CUSTOMER_HUB_PERMISSIONS),
                (permKey) => {
                    const allTrue = {};
                    for (const key of CUSTOMER_HUB_PERMISSIONS) {
                        allTrue[key] = true;
                    }
                    const helper = new PermissionHelper({ 'customer-hub': allTrue });
                    return helper.hasPermission('customer-hub', permKey) === true;
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Preservation: hasPageAccess() logic', () => {

    /**
     * PBT 3: hasPageAccess('customer-hub') trả về true khi ít nhất 1 quyền = true,
     * false khi tất cả = false.
     * 
     * **Validates: Requirements 3.9, 3.10**
     */
    it('PBT 3: hasPageAccess returns true when at least 1 permission is true, false when all false', () => {
        fc.assert(
            fc.property(
                customerHubPermsArb,
                (perms) => {
                    const helper = new PermissionHelper({ 'customer-hub': perms });
                    const hasAccess = helper.hasPageAccess('customer-hub');
                    const hasAnyTrue = Object.values(perms).some(v => v === true);
                    return hasAccess === hasAnyTrue;
                }
            ),
            { numRuns: 200 }
        );
    });
});

describe('Preservation: PermissionHelper constructor format', () => {

    /**
     * Test 4: PermissionHelper constructor nhận format { "customer-hub": { view: true, ... } }
     * và hoạt động đúng — xác nhận interface contract.
     * 
     * **Validates: Requirements 3.9, 3.10**
     */
    it('Test 4: constructor accepts { "customer-hub": { ... } } format and works correctly', () => {
        // Format chính xác như main.js truyền vào
        const permissions = {
            'customer-hub': {
                view: true,
                viewWallet: true,
                manageWallet: false,
                viewTickets: true,
                createTicket: false,
                viewActivities: true,
                addNote: true,
                editCustomer: false,
                linkTransactions: true,
            }
        };

        const helper = new PermissionHelper(permissions);

        // Quyền = true phải trả về true
        expect(helper.hasPermission('customer-hub', 'view')).toBe(true);
        expect(helper.hasPermission('customer-hub', 'viewWallet')).toBe(true);
        expect(helper.hasPermission('customer-hub', 'viewActivities')).toBe(true);
        expect(helper.hasPermission('customer-hub', 'addNote')).toBe(true);
        expect(helper.hasPermission('customer-hub', 'linkTransactions')).toBe(true);

        // Quyền = false phải trả về false
        expect(helper.hasPermission('customer-hub', 'manageWallet')).toBe(false);
        expect(helper.hasPermission('customer-hub', 'createTicket')).toBe(false);
        expect(helper.hasPermission('customer-hub', 'editCustomer')).toBe(false);

        // hasPageAccess phải trả về true (có ít nhất 1 quyền = true)
        expect(helper.hasPageAccess('customer-hub')).toBe(true);

        // Page không tồn tại phải trả về false
        expect(helper.hasPageAccess('non-existent')).toBe(false);
        expect(helper.hasPermission('non-existent', 'view')).toBe(false);
    });

    /**
     * Test 4b: Constructor với empty object → deny-by-default
     */
    it('Test 4b: constructor with empty object denies all access', () => {
        const helper = new PermissionHelper({});

        for (const key of CUSTOMER_HUB_PERMISSIONS) {
            expect(helper.hasPermission('customer-hub', key)).toBe(false);
        }
        expect(helper.hasPageAccess('customer-hub')).toBe(false);
    });

    /**
     * Test 4c: Constructor với all false → hasPageAccess returns false
     */
    it('Test 4c: constructor with all permissions false denies page access', () => {
        const allFalse = {};
        for (const key of CUSTOMER_HUB_PERMISSIONS) {
            allFalse[key] = false;
        }
        const helper = new PermissionHelper({ 'customer-hub': allFalse });

        for (const key of CUSTOMER_HUB_PERMISSIONS) {
            expect(helper.hasPermission('customer-hub', key)).toBe(false);
        }
        expect(helper.hasPageAccess('customer-hub')).toBe(false);
    });
});
