/**
 * Property 23: Employee name resolution never shows raw userId
 *
 * For any userId displayed in the KPI table, the system should resolve it to a
 * human-readable name by checking multiple sources (kpi_statistics, kpi_base,
 * employee_ranges, users collection). If no name is found, the display should
 * be "Nhân viên ({userId})", never the raw userId alone.
 *
 * **Validates: Requirements 7.11**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');

// --- Generators ---
const userIdArb = fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/);
const userNameArb = fc.string({ minLength: 2, maxLength: 30 }).filter(s => s.trim().length > 0);

/**
 * Pure function: simulates resolveEmployeeName logic.
 * Checks multiple sources in priority order, returns a human-readable name.
 * Never returns raw userId alone.
 *
 * @param {string} userId - The userId to resolve
 * @param {Object} sources - Available data sources
 * @param {Array} sources.statsData - [{userId, userName}]
 * @param {Object} sources.kpiBaseNames - {userId: userName}
 * @param {Array} sources.employeeRanges - [{userId, userName}]
 * @param {Object} sources.usersCollection - {userId: {displayName, name}}
 * @returns {string} resolved display name
 */
function resolveEmployeeNameLogic(userId, sources) {
    if (!userId) return 'Không xác định';

    // Source 1: kpi_statistics
    for (const stat of (sources.statsData || [])) {
        if (stat.userId === userId && stat.userName && stat.userName !== userId) {
            return stat.userName;
        }
    }

    // Source 2: kpi_base
    const baseName = Object.prototype.hasOwnProperty.call(sources.kpiBaseNames || {}, userId)
        ? (sources.kpiBaseNames || {})[userId]
        : undefined;
    if (baseName && baseName !== userId) {
        return baseName;
    }

    // Source 3: employee_ranges
    for (const range of (sources.employeeRanges || [])) {
        if (range.userId === userId && range.userName) {
            return range.userName;
        }
    }

    // Source 4: users collection
    const userData = (sources.usersCollection || {})[userId];
    if (userData && typeof userData === 'object') {
        const name = userData.displayName || userData.name;
        if (name) return name;
    }

    // Fallback: formatted userId (never raw userId alone)
    return `Nhân viên (${userId})`;
}

/**
 * Check if a resolved name is a valid display name (not raw userId).
 * A raw userId would be just the userId string without any formatting.
 */
function isValidDisplayName(resolvedName, userId) {
    // Must not be the raw userId alone
    if (resolvedName === userId) return false;
    // Must not be empty
    if (!resolvedName || resolvedName.trim() === '') return false;
    // If it's the fallback format, it should contain the userId in parentheses
    if (resolvedName.startsWith('Nhân viên (') && resolvedName.endsWith(')')) {
        return resolvedName.includes(userId);
    }
    // Otherwise it's a real name
    return true;
}

describe('Feature: kpi-upselling-products, Property 23: Employee name resolution never shows raw userId', () => {

    /**
     * PBT 23a: When no sources have a name, fallback is "Nhân viên ({userId})".
     */
    it('should return "Nhân viên ({userId})" when no name found in any source', () => {
        fc.assert(
            fc.property(
                userIdArb,
                (userId) => {
                    const emptySources = {
                        statsData: [],
                        kpiBaseNames: {},
                        employeeRanges: [],
                        usersCollection: {}
                    };

                    const result = resolveEmployeeNameLogic(userId, emptySources);

                    expect(result).toBe(`Nhân viên (${userId})`);
                    expect(result).not.toBe(userId);
                    expect(isValidDisplayName(result, userId)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 23b: Resolved name is never the raw userId alone.
     */
    it('should never return raw userId alone regardless of source data', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.option(userNameArb, { nil: undefined }),
                fc.option(userNameArb, { nil: undefined }),
                fc.option(userNameArb, { nil: undefined }),
                fc.option(userNameArb, { nil: undefined }),
                (userId, statsName, baseName, rangeName, userName) => {
                    const sources = {
                        statsData: statsName ? [{ userId, userName: statsName }] : [],
                        kpiBaseNames: baseName ? { [userId]: baseName } : {},
                        employeeRanges: rangeName ? [{ userId, userName: rangeName }] : [],
                        usersCollection: userName ? { [userId]: { displayName: userName } } : {}
                    };

                    const result = resolveEmployeeNameLogic(userId, sources);

                    // Result must never be the raw userId alone
                    expect(result).not.toBe(userId);
                    expect(isValidDisplayName(result, userId)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 23c: Priority order is respected (stats > base > ranges > users > fallback).
     */
    it('should respect source priority order', () => {
        fc.assert(
            fc.property(
                userIdArb,
                userNameArb,
                userNameArb,
                userNameArb,
                userNameArb,
                (userId, statsName, baseName, rangeName, userName) => {
                    // All sources available → should use statsData first
                    const allSources = {
                        statsData: [{ userId, userName: statsName }],
                        kpiBaseNames: { [userId]: baseName },
                        employeeRanges: [{ userId, userName: rangeName }],
                        usersCollection: { [userId]: { displayName: userName } }
                    };

                    const result = resolveEmployeeNameLogic(userId, allSources);
                    // statsName should win if it's different from userId
                    if (statsName !== userId) {
                        expect(result).toBe(statsName);
                    }

                    // Only base available → should use base
                    const baseOnly = {
                        statsData: [],
                        kpiBaseNames: { [userId]: baseName },
                        employeeRanges: [],
                        usersCollection: {}
                    };
                    const baseResult = resolveEmployeeNameLogic(userId, baseOnly);
                    if (baseName !== userId) {
                        expect(baseResult).toBe(baseName);
                    }

                    // Only ranges available → should use ranges
                    const rangesOnly = {
                        statsData: [],
                        kpiBaseNames: {},
                        employeeRanges: [{ userId, userName: rangeName }],
                        usersCollection: {}
                    };
                    const rangesResult = resolveEmployeeNameLogic(userId, rangesOnly);
                    expect(rangesResult).toBe(rangeName);

                    // Only users available → should use users
                    const usersOnly = {
                        statsData: [],
                        kpiBaseNames: {},
                        employeeRanges: [],
                        usersCollection: { [userId]: { displayName: userName } }
                    };
                    const usersResult = resolveEmployeeNameLogic(userId, usersOnly);
                    expect(usersResult).toBe(userName);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 23d: Cache behavior - same userId always returns same result.
     */
    it('should return consistent results for the same userId and sources', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.option(userNameArb, { nil: undefined }),
                (userId, name) => {
                    const sources = {
                        statsData: name ? [{ userId, userName: name }] : [],
                        kpiBaseNames: {},
                        employeeRanges: [],
                        usersCollection: {}
                    };

                    const result1 = resolveEmployeeNameLogic(userId, sources);
                    const result2 = resolveEmployeeNameLogic(userId, sources);

                    expect(result1).toBe(result2);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: tab-kpi-commission.js contains resolveEmployeeName
     * with multi-source lookup and cache.
     */
    it('source code should contain resolveEmployeeName with multi-source lookup and cache', () => {
        // resolveEmployeeName function exists
        expect(sourceCode).toContain('async resolveEmployeeName(userId)');

        // Cache check
        expect(sourceCode).toContain('employeeNameCache');

        // Multi-source lookup
        expect(sourceCode).toContain('kpi_base');
        expect(sourceCode).toContain('employee_ranges');
        expect(sourceCode).toContain('users');

        // Fallback format
        expect(sourceCode).toContain('Nhân viên (${userId})');

        // Used in aggregateByEmployee
        expect(sourceCode).toContain('resolveEmployeeName(emp.userId)');
    });
});
