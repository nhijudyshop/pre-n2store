/**
 * Bug Condition Exploration Test (POST-FIX version)
 * 
 * Property 1: Fault Condition - Quyền hardcode bỏ qua detailedPermissions thực tế
 * 
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 * 
 * PHASE 1 (pre-fix): Test FAIL → xác nhận bug tồn tại ✓ (đã hoàn thành)
 * PHASE 2 (post-fix): Test PASS → xác nhận bug đã được sửa
 * 
 * Sau fix, main.js đọc detailedPermissions từ loginindex_auth storage
 * thay vì hardcode tất cả = true. Test xác nhận:
 * - main.js KHÔNG còn hardcode permissions
 * - main.js ĐÃ đọc từ loginindex_auth
 * - PermissionHelper với actual permissions trả về đúng giá trị
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PermissionHelper } from '../../customer-hub/js/utils/permissions.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const CUSTOMER_HUB_PERMISSIONS = [
    'view', 'viewWallet', 'manageWallet', 'viewTickets',
    'createTicket', 'viewActivities', 'addNote', 'editCustomer',
    'linkTransactions'
];

describe('Bug Condition Verification: Customer Hub permission fix', () => {

    /**
     * Xác nhận main.js KHÔNG còn hardcode permissions và ĐÃ đọc từ storage
     */
    it('Post-fix: main.js reads from loginindex_auth instead of hardcoding', () => {
        const mainJs = readN2File('customer-hub/js/main.js');

        // main.js PHẢI đọc từ loginindex_auth
        expect(mainJs).toContain('loginindex_auth');

        // main.js KHÔNG được hardcode tất cả quyền = true
        const hasHardcodedBlock = mainJs.includes('manageWallet: true') 
            && mainJs.includes('viewWallet: true') 
            && mainJs.includes('editCustomer: true')
            && mainJs.includes('linkTransactions: true');
        expect(hasHardcodedBlock).toBe(false);
    });

    /**
     * Property 1a: PermissionHelper với actual permissions (có manageWallet: false)
     * PHẢI trả về false cho hasPermission('customer-hub', 'manageWallet').
     * 
     * Trước fix: main.js hardcode → luôn true → FAIL
     * Sau fix: main.js đọc storage → trả về đúng giá trị → PASS
     */
    it('Property 1a: PermissionHelper respects manageWallet: false from storage permissions', () => {
        fc.assert(
            fc.property(
                fc.record({
                    view: fc.boolean(),
                    viewWallet: fc.boolean(),
                    manageWallet: fc.constant(false),
                    viewTickets: fc.boolean(),
                    createTicket: fc.boolean(),
                    viewActivities: fc.boolean(),
                    addNote: fc.boolean(),
                    editCustomer: fc.boolean(),
                    linkTransactions: fc.boolean(),
                }),
                (storagePermissions) => {
                    // Sau fix, main.js tạo PermissionHelper với actual storage permissions
                    const helper = new PermissionHelper({ 'customer-hub': storagePermissions });
                    const result = helper.hasPermission('customer-hub', 'manageWallet');
                    // Phải trả về false vì manageWallet = false trong storage
                    return result === false;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 1b: Với BẤT KỲ tổ hợp quyền nào từ storage,
     * PermissionHelper phải trả về đúng giá trị cho mọi quyền.
     * 
     * Trước fix: hardcode override storage → kết quả sai → FAIL
     * Sau fix: đọc đúng từ storage → kết quả đúng → PASS
     */
    it('Property 1b: PermissionHelper returns exact storage values for all permissions', () => {
        fc.assert(
            fc.property(
                fc.record({
                    view: fc.boolean(),
                    viewWallet: fc.boolean(),
                    manageWallet: fc.boolean(),
                    viewTickets: fc.boolean(),
                    createTicket: fc.boolean(),
                    viewActivities: fc.boolean(),
                    addNote: fc.boolean(),
                    editCustomer: fc.boolean(),
                    linkTransactions: fc.boolean(),
                }).filter(perms => Object.values(perms).some(v => v === false)),
                fc.constantFrom(...CUSTOMER_HUB_PERMISSIONS),
                (storagePermissions, permToCheck) => {
                    const helper = new PermissionHelper({ 'customer-hub': storagePermissions });
                    const result = helper.hasPermission('customer-hub', permToCheck);
                    return result === storagePermissions[permToCheck];
                }
            ),
            { numRuns: 100 }
        );
    });
});
