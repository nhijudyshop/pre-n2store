/**
 * Preservation Property Tests
 * 
 * Property 2: Preservation - Hành vi hiện tại của hangrotxa và user-management
 * không bị ảnh hưởng. Các module không dùng PermissionHelper cũng không bị ảnh hưởng.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * IMPORTANT: Tests này PHẢI PASS trên code CHƯA FIX.
 * Chúng thiết lập baseline hành vi cần bảo toàn sau khi fix.
 * 
 * Test đọc actual files từ disk vì đây là static HTML project.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

/**
 * Helper: Read file content from n2store directory
 */
function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

/**
 * Helper: Extract all <script> tags with src from HTML in order.
 * Returns array of src strings.
 */
function extractScriptSrcs(html) {
    const scriptRegex = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const srcs = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        srcs.push(match[1]);
    }
    return srcs;
}

describe('Preservation: hangrotxa already includes permissions-helper.js correctly', () => {
    /**
     * Property 2a: hangrotxa/index.html MUST continue to include
     * permissions-helper.js in the correct position (before module scripts).
     * 
     * This is already working on unfixed code - must remain working after fix.
     * 
     * **Validates: Requirements 3.1**
     */
    it('Property 2a: hangrotxa must include permissions-helper.js before module scripts', () => {
        const html = readN2File('hangrotxa/index.html');
        const scripts = extractScriptSrcs(html);

        // Must contain permissions-helper.js
        expect(scripts).toContain('../shared/js/permissions-helper.js');

        // permissions-helper.js must appear before the first hangrotxa module script
        const permIdx = scripts.indexOf('../shared/js/permissions-helper.js');
        const firstModuleIdx = scripts.indexOf('js/hangrotxa-config.js');
        expect(firstModuleIdx).toBeGreaterThan(-1);
        expect(permIdx).toBeLessThan(firstModuleIdx);
    });
});

describe('Preservation: user-management-enhanced.js existing functions', () => {
    const REQUIRED_FUNCTIONS = [
        'createUser',
        'loadUsers',
        'loadPermissionsOverview',
        'updateUser',
    ];

    /**
     * Property 2b: user-management-enhanced.js MUST continue to have
     * all existing functions intact and unchanged.
     * 
     * **Validates: Requirements 3.4**
     */
    it('Property 2b: all existing core functions must exist in user-management-enhanced.js', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...REQUIRED_FUNCTIONS),
                (funcName) => {
                    const jsContent = readN2File('user-management/js/user-management-enhanced.js');
                    // Each function must be declared (async function X() or function X())
                    const funcPattern = new RegExp(`(?:async\\s+)?function\\s+${funcName}\\s*\\(`);
                    return funcPattern.test(jsContent);
                }
            ),
            { numRuns: 20 }
        );
    });
});

describe('Preservation: affected modules maintain existing script load order', () => {
    /**
     * Current script load order for each affected module (observed on unfixed code).
     * These are the scripts that ALREADY exist - we only check these are preserved.
     * We do NOT check for permissions-helper.js here (that's the bug).
     */
    const EXISTING_SCRIPTS = {
        nhanhang: [
            'js/config.js',
            'js/utility.js?v=20260118',
            'js/ui.js',
            'js/camera.js',
            'js/crud.js',
            'js/main.js',
        ],
        hanghoan: [
            'js/hanghoan.js',
            'js/trahang.js',
            'js/banhang.js',
            'js/doisoat.js',
        ],
        ck: [
            'js/config-constants.js',
            'js/utils-helpers.js',
            'js/virtual-scrolling.js',
            'js/date-slider.js',
            'js/filter-system.js',
            'js/search-system.js',
            'js/main-optimized.js',
        ],
        ib: [
            'js/config.js',
            'js/utils.js',
            'js/ui.js',
            'js/image-handler.js',
            'js/form-handler.js',
            'js/table-manager.js',
            'js/main.js',
        ],
        bangkiemhang: [
            'js/config.js',
            'js/utils.js',
            'js/ui-components.js',
            'js/data-loader.js',
            'js/filters.js',
            'js/table-renderer.js',
            'js/crud-operations.js',
            'js/export.js',
            'js/main.js',
        ],
    };

    /**
     * Property 2c: For each affected module, existing scripts must maintain
     * their current relative load order.
     * 
     * **Validates: Requirements 3.2, 3.3**
     */
    it('Property 2c: existing scripts in affected modules maintain their load order', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('nhanhang', 'hanghoan', 'ck', 'ib', 'bangkiemhang'),
                (moduleName) => {
                    const html = readN2File(`${moduleName}/index.html`);
                    const allScripts = extractScriptSrcs(html);

                    const expectedOrder = EXISTING_SCRIPTS[moduleName];

                    // Filter allScripts to only those in expectedOrder
                    const actualModuleScripts = allScripts.filter(s => expectedOrder.includes(s));

                    // Must have all expected scripts
                    if (actualModuleScripts.length !== expectedOrder.length) return false;

                    // Must be in the same order
                    for (let i = 0; i < expectedOrder.length; i++) {
                        if (actualModuleScripts[i] !== expectedOrder[i]) return false;
                    }
                    return true;
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Preservation: non-PermissionHelper modules are not affected', () => {
    const NON_AFFECTED_MODULES = ['live', 'order-management', 'soluong-live', 'soorder'];

    /**
     * Property 2d: Modules that don't use PermissionHelper must NOT contain
     * any reference to permissions-helper.js in their index.html.
     * This ensures the fix doesn't accidentally add scripts to unrelated modules.
     * 
     * **Validates: Requirements 3.5**
     */
    it('Property 2d: non-PermissionHelper modules do not reference permissions-helper.js', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...NON_AFFECTED_MODULES),
                (moduleName) => {
                    const htmlPath = resolve(N2STORE_ROOT, `${moduleName}/index.html`);
                    if (!existsSync(htmlPath)) {
                        // Module directory doesn't have index.html - that's fine, not affected
                        return true;
                    }
                    const html = readN2File(`${moduleName}/index.html`);
                    // Must NOT contain permissions-helper.js
                    return !html.includes('permissions-helper.js');
                }
            ),
            { numRuns: 20 }
        );
    });
});
