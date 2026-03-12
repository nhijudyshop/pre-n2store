/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - Admin thiếu quyền supplier-debt sau migration
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 * 
 * GOAL: Tìm counterexample chứng minh bug tồn tại
 * EXPECTED: Test FAIL trên code chưa sửa (xác nhận bug tồn tại)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Bug Condition Exploration: Admin supplier-debt permissions', () => {
    let generateFullAdminPermissions;

    beforeAll(() => {
        // Load the source file into jsdom's window context
        const sourceCode = readFileSync(
            resolve(__dirname, '../../user-management/js/migration-admin-full-permissions.js'),
            'utf-8'
        );

        // Set up minimal globals needed by the script
        globalThis.FIREBASE_CONFIG = undefined;
        globalThis.firebase = undefined;
        globalThis.db = undefined;

        // Execute the source in the global (window) context
        // The script assigns functions to window.*
        const scriptFn = new Function(sourceCode);
        scriptFn();

        generateFullAdminPermissions = window.generateFullAdminPermissions;
    });

    /**
     * Property 1: Fault Condition - Admin thiếu quyền supplier-debt sau migration
     * 
     * _For any_ action trong ['payment', 'deletePayment', 'editNoteBill', 'editNotePayment'],
     * generateFullAdminPermissions() PHẢI chứa key 'supplier-debt' với action đó = true
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
     */
    it('should include supplier-debt key in generateFullAdminPermissions() result', () => {
        const result = generateFullAdminPermissions();

        // supplier-debt key must exist
        expect(result['supplier-debt']).toBeDefined();
    });

    it('Property 1: supplier-debt permissions must have all 4 actions set to true', () => {
        const supplierDebtActions = ['payment', 'deletePayment', 'editNoteBill', 'editNotePayment'];

        fc.assert(
            fc.property(
                fc.constantFrom(...supplierDebtActions),
                (action) => {
                    const result = generateFullAdminPermissions();

                    // supplier-debt key must exist
                    if (result['supplier-debt'] === undefined) {
                        return false; // Bug: key missing entirely
                    }

                    // Each action must be true
                    return result['supplier-debt'][action] === true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
