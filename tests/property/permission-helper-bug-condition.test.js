/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - PermissionHelper thiếu trong các module
 * và Admin Toggle thiếu trong user-management
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * CRITICAL: Test này PHẢI FAIL trên code chưa fix - failure xác nhận lỗi tồn tại.
 * KHÔNG sửa test hoặc code khi test fail.
 * 
 * Test đọc actual files từ disk vì đây là static HTML project.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

/**
 * Helper: Read file content from n2store directory
 */
function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

/**
 * Helper: Extract all <script> tags from HTML and return them in order.
 * Returns array of { src, index } where index is position in the HTML string.
 */
function extractScriptTags(html) {
    const scriptRegex = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const scripts = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        scripts.push({ src: match[1], index: match.index });
    }
    return scripts;
}

describe('Bug Condition Exploration: PermissionHelper missing in modules', () => {
    const AFFECTED_MODULES = ['nhanhang', 'hanghoan', 'ck', 'ib', 'bangkiemhang'];

    const FIRST_MODULE_SCRIPTS = {
        nhanhang: 'js/config.js',
        hanghoan: 'js/hanghoan.js',
        ck: 'js/config-constants.js',
        ib: 'js/config.js',
        bangkiemhang: 'js/config.js',
    };

    /**
     * Property 1a: For ANY affected module, its index.html MUST contain
     * the permissions-helper.js script tag.
     * 
     * On unfixed code, this WILL FAIL because none of the 5 modules
     * include the script.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1a: every affected module must include permissions-helper.js', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...AFFECTED_MODULES),
                (moduleName) => {
                    const html = readN2File(`${moduleName}/index.html`);
                    const hasPermHelper = html.includes(
                        '<script src="../shared/js/permissions-helper.js"></script>'
                    );
                    return hasPermHelper;
                }
            ),
            { numRuns: 50 }
        );
    });

    /**
     * Property 1b: permissions-helper.js MUST be loaded BEFORE the module's
     * first script in each affected module.
     * 
     * On unfixed code, this WILL FAIL because the script doesn't exist at all.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1b: permissions-helper.js must load before first module script', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...AFFECTED_MODULES),
                (moduleName) => {
                    const html = readN2File(`${moduleName}/index.html`);
                    const scripts = extractScriptTags(html);

                    const permHelperScript = scripts.find(s =>
                        s.src.includes('permissions-helper.js')
                    );
                    const firstModuleScript = scripts.find(s =>
                        s.src === FIRST_MODULE_SCRIPTS[moduleName]
                    );

                    // Both must exist
                    if (!permHelperScript || !firstModuleScript) return false;

                    // permissions-helper.js must appear before the first module script
                    return permHelperScript.index < firstModuleScript.index;
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Bug Condition Exploration: Admin Toggle missing in user-management', () => {
    /**
     * Property 1c: user-management/index.html MUST contain the editIsAdmin element.
     * 
     * On unfixed code, this WILL FAIL because the checkbox doesn't exist.
     * 
     * **Validates: Requirements 1.4**
     */
    it('Property 1c: user-management index.html must contain editIsAdmin element', () => {
        const html = readN2File('user-management/index.html');
        expect(html).toContain('editIsAdmin');
    });

    /**
     * Property 1d: updateUser() in user-management-enhanced.js MUST handle isAdmin flag.
     * 
     * On unfixed code, this WILL FAIL because updateUser() doesn't reference isAdmin.
     * 
     * **Validates: Requirements 1.5**
     */
    it('Property 1d: updateUser() must handle isAdmin flag', () => {
        const jsContent = readN2File('user-management/js/user-management-enhanced.js');

        // Extract the updateUser function body
        const updateUserStart = jsContent.indexOf('async function updateUser()');
        expect(updateUserStart).toBeGreaterThan(-1);

        // Find the function body (from start to the next top-level function)
        const afterStart = jsContent.substring(updateUserStart);
        const nextFunctionMatch = afterStart.match(/\n(?:async )?function \w+\(/);
        const updateUserBody = nextFunctionMatch
            ? afterStart.substring(0, nextFunctionMatch.index)
            : afterStart;

        // updateUser must reference isAdmin and editIsAdmin
        expect(updateUserBody).toContain('isAdmin');
        expect(updateUserBody).toContain('editIsAdmin');
    });
});
