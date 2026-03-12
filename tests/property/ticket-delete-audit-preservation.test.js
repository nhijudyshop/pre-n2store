/**
 * Preservation Property Test
 *
 * Property 2: Preservation — Audit logging các thao tác khác không bị ảnh hưởng
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Tests này PHẢI PASS trên code chưa sửa — xác nhận baseline hành vi cần bảo toàn.
 * Sau khi fix bug, tests này vẫn PHẢI PASS (không có regression).
 *
 * Observation-first methodology:
 * - AuditLogger.logAction('ticket_create', {...}) được gọi khi tạo phiếu mới
 * - AuditLogger.logAction('ticket_receive_goods', {...}) được gọi khi nhận hàng hoàn
 * - AuditLogger.logAction('ticket_payment', {...}) được gọi khi thanh toán
 * - AuditLogger.logAction('ticket_add_debt', {...}) được gọi khi cấp công nợ ảo
 *
 * Test đọc actual source code từ disk vì đây là static HTML project,
 * và trực tiếp test AuditLogger module functions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
 * Recreate AuditLogger module functions for direct testing.
 * Extracted from shared/js/audit-logger.js to test in isolation.
 */
function createAuditLoggerModule() {
    const VALID_ACTION_TYPES = [
        'wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt',
        'customer_info_update', 'wallet_transaction',
        'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
        'ticket_payment', 'ticket_update',
        'transaction_assign', 'livemode_confirm_customer',
        'transaction_approve', 'transaction_adjust',
        'customer_info_update_bh', 'transaction_verify',
        'accountant_entry_create',
        'add', 'edit', 'delete', 'update', 'mark'
    ];

    function isValidActionType(actionType) {
        return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
    }

    function buildRecord(actionType, details, user) {
        var record = {
            timestamp: new Date(),
            performerUserId: user.userId,
            performerUserName: user.userName,
            module: details.module,
            actionType: actionType,
            description: details.description || '',
            oldData: details.oldData || null,
            newData: details.newData || null
        };
        var optionalFields = [
            'approverUserId', 'approverUserName',
            'creatorUserId', 'creatorUserName',
            'entityId', 'entityType', 'metadata'
        ];
        for (var i = 0; i < optionalFields.length; i++) {
            var field = optionalFields[i];
            if (details[field] !== undefined && details[field] !== null) {
                record[field] = details[field];
            }
        }
        return record;
    }

    return { VALID_ACTION_TYPES, isValidActionType, buildRecord };
}

describe('Preservation: Audit logging các thao tác khác không bị ảnh hưởng', () => {
    const SOURCE_PATH = 'issue-tracking/js/script.js';
    const AUDIT_LOGGER_PATH = 'shared/js/audit-logger.js';
    let sourceCode;
    let auditLoggerCode;
    let AuditLogger;

    beforeEach(() => {
        sourceCode = readN2File(SOURCE_PATH);
        auditLoggerCode = readN2File(AUDIT_LOGGER_PATH);
        AuditLogger = createAuditLoggerModule();
    });

    // =========================================================================
    // Property 2a: isValidActionType trả về true cho tất cả action types hiện có
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it('Property 2a: isValidActionType trả về true cho tất cả ticket action types', () => {
        const ticketActionTypes = [
            'ticket_create',
            'ticket_receive_goods',
            'ticket_payment',
            'ticket_add_debt'
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...ticketActionTypes),
                (actionType) => {
                    return AuditLogger.isValidActionType(actionType) === true;
                }
            ),
            { numRuns: 40 }
        );
    });

    // =========================================================================
    // Property 2b: 'delete' là action type hợp lệ trong VALID_ACTION_TYPES
    // **Validates: Requirements 3.5, 3.6**
    // =========================================================================
    it("Property 2b: 'delete' là action type hợp lệ", () => {
        expect(AuditLogger.isValidActionType('delete')).toBe(true);
        expect(AuditLogger.VALID_ACTION_TYPES).toContain('delete');
    });

    // =========================================================================
    // Property 2c: VALID_ACTION_TYPES chứa đầy đủ các action type hiện có
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it('Property 2c: VALID_ACTION_TYPES chứa đầy đủ các action type cần thiết', () => {
        const requiredTypes = [
            'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
            'ticket_payment', 'ticket_update',
            'add', 'edit', 'delete', 'update', 'mark'
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...requiredTypes),
                (actionType) => {
                    return AuditLogger.VALID_ACTION_TYPES.indexOf(actionType) !== -1;
                }
            ),
            { numRuns: 50 }
        );
    });

    // =========================================================================
    // Property 2d: Sinh ngẫu nhiên action types hợp lệ (trừ delete) —
    // isValidActionType luôn trả về true
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it('Property 2d: Random valid action types (trừ delete) luôn được nhận diện hợp lệ', () => {
        const nonDeleteValidTypes = AuditLogger.VALID_ACTION_TYPES.filter(t => t !== 'delete');

        fc.assert(
            fc.property(
                fc.constantFrom(...nonDeleteValidTypes),
                (actionType) => {
                    return AuditLogger.isValidActionType(actionType) === true;
                }
            ),
            { numRuns: 100 }
        );
    });

    // =========================================================================
    // Property 2e: buildRecord tạo đúng cấu trúc cho mỗi ticket action type
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it('Property 2e: buildRecord tạo đúng cấu trúc cho mỗi ticket action type', () => {
        const ticketActionTypes = [
            'ticket_create',
            'ticket_receive_goods',
            'ticket_payment',
            'ticket_add_debt'
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...ticketActionTypes),
                fc.record({
                    module: fc.constant('issue-tracking'),
                    description: fc.string({ minLength: 1, maxLength: 100 }),
                    oldData: fc.oneof(
                        fc.constant(null),
                        fc.record({
                            ticketCode: fc.string({ minLength: 1, maxLength: 20 }),
                            orderId: fc.string({ minLength: 1, maxLength: 20 }),
                            type: fc.constantFrom('RETURN_SHIPPER', 'BOOM', 'CSKH', 'FIX_COD')
                        })
                    ),
                    newData: fc.oneof(
                        fc.constant(null),
                        fc.record({
                            status: fc.constantFrom('pending', 'completed', 'cancelled'),
                            money: fc.integer({ min: 0, max: 10000000 })
                        })
                    ),
                    entityId: fc.string({ minLength: 1, maxLength: 30 }),
                    entityType: fc.constant('ticket')
                }),
                fc.record({
                    userId: fc.string({ minLength: 1, maxLength: 30 }),
                    userName: fc.string({ minLength: 1, maxLength: 50 })
                }),
                (actionType, details, user) => {
                    const record = AuditLogger.buildRecord(actionType, details, user);

                    // Record phải có đầy đủ các trường bắt buộc
                    return (
                        record.actionType === actionType &&
                        record.module === 'issue-tracking' &&
                        record.performerUserId === user.userId &&
                        record.performerUserName === user.userName &&
                        record.description === details.description &&
                        record.oldData === (details.oldData || null) &&
                        record.newData === (details.newData || null) &&
                        record.entityId === details.entityId &&
                        record.entityType === 'ticket' &&
                        record.timestamp instanceof Date
                    );
                }
            ),
            { numRuns: 100 }
        );
    });

    // =========================================================================
    // Property 2f: Source code vẫn chứa audit logging cho 4 thao tác không phải xóa
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it('Property 2f: Source code chứa audit logging cho tất cả thao tác không phải xóa', () => {
        const auditPatterns = [
            { actionType: 'ticket_create', pattern: /logAction\s*\(\s*['"]ticket_create['"]/ },
            { actionType: 'ticket_receive_goods', pattern: /logAction\s*\(\s*['"]ticket_receive_goods['"]/ },
            { actionType: 'ticket_payment', pattern: /logAction\s*\(\s*['"]ticket_payment['"]/ },
            { actionType: 'ticket_add_debt', pattern: /logAction\s*\(\s*['"]ticket_add_debt['"]/ }
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...auditPatterns),
                ({ actionType, pattern }) => {
                    // Source code PHẢI chứa logAction call cho action type này
                    const hasCall = pattern.test(sourceCode);
                    return hasCall === true;
                }
            ),
            { numRuns: 40 }
        );
    });

    // =========================================================================
    // Property 2g: Source code chứa đúng module 'issue-tracking' cho mỗi audit call
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    // =========================================================================
    it("Property 2g: Mỗi audit call trong source code đều dùng module 'issue-tracking'", () => {
        const actionTypes = ['ticket_create', 'ticket_receive_goods', 'ticket_payment', 'ticket_add_debt'];

        fc.assert(
            fc.property(
                fc.constantFrom(...actionTypes),
                (actionType) => {
                    // Tìm vị trí logAction call
                    const callPattern = new RegExp("logAction\\s*\\(\\s*['\"]" + actionType + "['\"]");
                    const match = callPattern.exec(sourceCode);
                    if (!match) return false;

                    // Kiểm tra module: 'issue-tracking' xuất hiện gần sau logAction call
                    const contextAfterCall = sourceCode.substring(match.index, match.index + 500);
                    return /module\s*:\s*['"]issue-tracking['"]/.test(contextAfterCall);
                }
            ),
            { numRuns: 40 }
        );
    });

    // =========================================================================
    // Property 2h: AuditLogger VALID_ACTION_TYPES trong source code khớp với module
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
    // =========================================================================
    it('Property 2h: AuditLogger source code chứa đầy đủ VALID_ACTION_TYPES', () => {
        const requiredInSource = [
            'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
            'ticket_payment', 'delete'
        ];

        fc.assert(
            fc.property(
                fc.constantFrom(...requiredInSource),
                (actionType) => {
                    // VALID_ACTION_TYPES trong source code phải chứa action type này
                    return auditLoggerCode.includes("'" + actionType + "'")
                        || auditLoggerCode.includes('"' + actionType + '"');
                }
            ),
            { numRuns: 50 }
        );
    });

    // =========================================================================
    // Property 2i: isValidActionType trả về false cho invalid action types
    // **Validates: Requirements 3.5, 3.6**
    // =========================================================================
    it('Property 2i: isValidActionType trả về false cho invalid action types', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 50 }).filter(
                    s => AuditLogger.VALID_ACTION_TYPES.indexOf(s) === -1
                ),
                (invalidType) => {
                    return AuditLogger.isValidActionType(invalidType) === false;
                }
            ),
            { numRuns: 100 }
        );
    });
});
