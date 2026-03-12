/**
 * Preservation Property Tests
 * 
 * Property 2: Preservation - Quyền các module khác không thay đổi
 * 
 * **Validates: Requirements 3.3, 3.4**
 * 
 * Phương pháp observation-first:
 * - Snapshot toàn bộ output generateFullAdminPermissions() trên code CHƯA SỬA
 * - Assert từng module (trừ supplier-debt) không thay đổi
 * - Tests PHẢI PASS trên code chưa sửa (xác nhận baseline)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Preservation: Admin permissions for non-supplier-debt modules', () => {
    let generateFullAdminPermissions;
    let countPermissions;

    beforeAll(() => {
        const sourceCode = readFileSync(
            resolve(__dirname, '../../user-management/js/migration-admin-full-permissions.js'),
            'utf-8'
        );

        globalThis.FIREBASE_CONFIG = undefined;
        globalThis.firebase = undefined;
        globalThis.db = undefined;

        const scriptFn = new Function(sourceCode);
        scriptFn();

        generateFullAdminPermissions = window.generateFullAdminPermissions;
        countPermissions = window.countPermissions;
    });

    /**
     * Observed baseline snapshot from code CHƯA SỬA.
     * Captured by reading generateFullAdminPermissions() source directly.
     * This is the "ground truth" that must be preserved after the fix.
     */
    const BASELINE_SNAPSHOT = {
        live: { view: true, upload: true, edit: true, delete: true },
        ib: { view: true, reply: true, assign: true, archive: true, export: true, delete: true },
        nhanhang: { view: true, create: true, confirm: true, edit: true, cancel: true, weigh: true, delete: true },
        inventoryTracking: {
            tab_tracking: true, tab_congNo: true,
            create_shipment: true, edit_shipment: true, delete_shipment: true,
            view_chiPhiHangVe: true, edit_chiPhiHangVe: true,
            view_ghiChuAdmin: true, edit_ghiChuAdmin: true,
            edit_soMonThieu: true,
            create_prepayment: true, edit_prepayment: true, delete_prepayment: true,
            create_otherExpense: true, edit_otherExpense: true, delete_otherExpense: true,
            edit_invoice_from_finance: true, edit_shipping_from_finance: true,
            export_data: true
        },
        "purchase-orders": { view: true, create: true, edit: true, delete: true, status_change: true, copy: true, export: true, upload_images: true },
        hangrotxa: { view: true, mark: true, approve: true, price: true, delete: true },
        hanghoan: { view: true, approve: true, reject: true, refund: true, update: true, export: true },
        "product-search": { view: true, viewStock: true, viewPrice: true, export: true },
        "soluong-live": { view: true, edit: true, adjust: true, export: true },
        ck: { view: true, verify: true, edit: true, export: true, delete: true },
        "order-management": { view: true, create: true, edit: true, updateStatus: true, cancel: true, export: true, print: true },
        "order-log": { view: true, add: true, edit: true, delete: true, export: true },
        baocaosaleonline: { view: true, viewRevenue: true, viewDetails: true, export: true, compare: true },
        "tpos-pancake": { view: true, sync: true, import: true, export: true, configure: true },
        "user-management": { view: true, create: true, edit: true, delete: true, permissions: true, resetPassword: true, manageTemplates: true },
        "balance-history": { view: true, viewDetails: true, export: true, adjust: true },
        "invoice-compare": { view: true, compare: true, import: true, export: true, resolve: true }
    };

    const ALL_NON_SUPPLIER_DEBT_MODULES = Object.keys(BASELINE_SNAPSHOT);

    /**
     * Property 2: Preservation - For ANY module other than supplier-debt,
     * the permissions object returned by generateFullAdminPermissions()
     * MUST be identical to the observed baseline.
     * 
     * Uses property-based testing to randomly select modules and verify
     * their permissions match the snapshot exactly.
     * 
     * **Validates: Requirements 3.3, 3.4**
     */
    it('Property 2: every non-supplier-debt module permissions must match baseline snapshot', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ALL_NON_SUPPLIER_DEBT_MODULES),
                (moduleId) => {
                    const result = generateFullAdminPermissions();
                    const actual = result[moduleId];
                    const expected = BASELINE_SNAPSHOT[moduleId];

                    // Module must exist
                    if (actual === undefined) return false;

                    // All expected keys must be present with same values
                    const expectedKeys = Object.keys(expected);
                    const actualKeys = Object.keys(actual);

                    if (expectedKeys.length !== actualKeys.length) return false;

                    for (const key of expectedKeys) {
                        if (actual[key] !== expected[key]) return false;
                    }

                    return true;
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * Verify the total number of modules in the output matches baseline.
     * On unfixed code: 18 modules (no supplier-debt).
     * After fix: should be 19 modules (18 + supplier-debt).
     * This test checks that at LEAST all 18 baseline modules exist.
     * 
     * **Validates: Requirements 3.3, 3.4**
     */
    it('all 18 baseline modules must be present in output', () => {
        const result = generateFullAdminPermissions();
        const resultKeys = Object.keys(result);

        for (const moduleId of ALL_NON_SUPPLIER_DEBT_MODULES) {
            expect(resultKeys).toContain(moduleId);
        }

        // On unfixed code, exactly 18 modules
        expect(resultKeys.length).toBeGreaterThanOrEqual(ALL_NON_SUPPLIER_DEBT_MODULES.length);
    });

    /**
     * Verify total permission count for non-supplier-debt modules is preserved.
     * Baseline count observed on unfixed code.
     * 
     * **Validates: Requirements 3.3, 3.4**
     */
    it('total permission count for non-supplier-debt modules must match baseline', () => {
        const result = generateFullAdminPermissions();

        // Count permissions only for non-supplier-debt modules
        let baselineCount = 0;
        let actualCount = 0;

        for (const moduleId of ALL_NON_SUPPLIER_DEBT_MODULES) {
            baselineCount += Object.keys(BASELINE_SNAPSHOT[moduleId]).length;
            actualCount += Object.keys(result[moduleId] || {}).length;
        }

        expect(actualCount).toBe(baselineCount);
    });

    /**
     * Property-based: for any random module and any of its permission keys,
     * the value must be exactly true (matching baseline).
     * 
     * **Validates: Requirements 3.3, 3.4**
     */
    it('Property 2b: every permission in every non-supplier-debt module must be true', () => {
        // Build a flat list of [moduleId, permissionKey] pairs from baseline
        const modulePermPairs = [];
        for (const moduleId of ALL_NON_SUPPLIER_DEBT_MODULES) {
            for (const permKey of Object.keys(BASELINE_SNAPSHOT[moduleId])) {
                modulePermPairs.push([moduleId, permKey]);
            }
        }

        fc.assert(
            fc.property(
                fc.constantFrom(...modulePermPairs),
                ([moduleId, permKey]) => {
                    const result = generateFullAdminPermissions();
                    return result[moduleId] !== undefined
                        && result[moduleId][permKey] === true;
                }
            ),
            { numRuns: 300 }
        );
    });
});
