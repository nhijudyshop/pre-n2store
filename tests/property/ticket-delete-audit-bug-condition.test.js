/**
 * Bug Condition Exploration Test
 *
 * Property 1: Fault Condition - Xóa phiếu không ghi audit log
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * CRITICAL: Test này PHẢI FAIL trên code chưa fix - failure xác nhận lỗi tồn tại.
 * KHÔNG sửa test hoặc code khi test fail.
 *
 * Bug: Hàm deleteTicket() trong issue-tracking/js/script.js gọi
 * ApiService.deleteTicket() thành công nhưng KHÔNG gọi AuditLogger.logAction()
 * để ghi nhận thao tác xóa vào edit_history. Trong khi 4 thao tác khác
 * (ticket_create, ticket_receive_goods, ticket_payment, ticket_add_debt)
 * đều đã có audit logging đầy đủ.
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
 * Helper: Trích xuất body của hàm deleteTicket() từ source code.
 */
function extractDeleteTicketBody(sourceCode) {
    const funcSignature = 'window.deleteTicket = async function';
    const funcStart = sourceCode.indexOf(funcSignature);
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

describe('Bug Condition Exploration: Xóa phiếu không ghi audit log', () => {
    const SOURCE_PATH = 'issue-tracking/js/script.js';
    const sourceCode = readN2File(SOURCE_PATH);
    const deleteTicketBody = extractDeleteTicketBody(sourceCode);

    /**
     * Property 1a: deleteTicket() PHẢI gọi AuditLogger.logAction sau khi xóa thành công.
     *
     * Trên code chưa fix, hàm deleteTicket KHÔNG chứa bất kỳ lời gọi
     * AuditLogger.logAction nào. So sánh với 4 thao tác khác đều có pattern:
     *   if (window.AuditLogger) { window.AuditLogger.logAction(...) }
     *
     * Test SẼ FAIL vì deleteTicket thiếu hoàn toàn lời gọi AuditLogger.
     *
     * **Validates: Requirements 1.1, 2.1**
     */
    it('Property 1a: deleteTicket() phải chứa lời gọi AuditLogger.logAction', () => {
        expect(deleteTicketBody).not.toBeNull();

        fc.assert(
            fc.property(
                // Sinh random ticket types — property phải đúng cho MỌI loại phiếu
                fc.constantFrom(
                    'RETURN_SHIPPER', 'BOOM', 'CSKH', 'FIX_COD'
                ),
                (_ticketType) => {
                    // deleteTicket PHẢI chứa AuditLogger.logAction
                    const hasAuditLoggerCall = deleteTicketBody.includes('AuditLogger.logAction')
                        || deleteTicketBody.includes('AuditLogger')
                            && deleteTicketBody.includes('logAction');

                    // Hành vi mong đợi: có lời gọi AuditLogger.logAction trong deleteTicket
                    return hasAuditLoggerCall;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 1b: deleteTicket() PHẢI gọi AuditLogger.logAction với actionType 'delete'
     * và module 'issue-tracking'.
     *
     * Trên code chưa fix, không có bất kỳ lời gọi AuditLogger nào trong deleteTicket,
     * nên không thể có actionType 'delete' hay module 'issue-tracking'.
     *
     * Test SẼ FAIL vì deleteTicket thiếu hoàn toàn audit logging.
     *
     * **Validates: Requirements 1.1, 2.1, 2.2**
     */
    it("Property 1b: deleteTicket() phải gọi AuditLogger.logAction('delete', {module: 'issue-tracking', ...})", () => {
        expect(deleteTicketBody).not.toBeNull();

        // Kiểm tra: phải có logAction('delete', ...) với module: 'issue-tracking'
        const hasDeleteActionType = /logAction\s*\(\s*['"]delete['"]/.test(deleteTicketBody);
        const hasIssueTrackingModule = /module\s*:\s*['"]issue-tracking['"]/.test(deleteTicketBody);

        // Hành vi mong đợi: có cả actionType 'delete' VÀ module 'issue-tracking'
        expect(hasDeleteActionType).toBe(true);
        expect(hasIssueTrackingModule).toBe(true);
    });

    /**
     * Property 1c: deleteTicket() PHẢI ghi oldData chứa thông tin phiếu bị xóa
     * (ticketCode, orderId, type, money, phone) và newData là null.
     *
     * Trên code chưa fix, không có audit logging nên không có oldData/newData.
     *
     * Test SẼ FAIL vì deleteTicket thiếu hoàn toàn audit logging.
     *
     * **Validates: Requirements 1.2, 1.3, 2.1**
     */
    it('Property 1c: deleteTicket() phải ghi oldData chứa thông tin phiếu và newData null', () => {
        expect(deleteTicketBody).not.toBeNull();

        fc.assert(
            fc.property(
                // Sinh random ticket fields — property phải đúng cho MỌI trường hợp
                fc.record({
                    ticketCode: fc.constantFrom('RS-001', 'BM-005', 'CSKH-010', 'FC-003'),
                    orderId: fc.constantFrom('ORD-123', 'ORD-456', 'ORD-789'),
                    type: fc.constantFrom('RETURN_SHIPPER', 'BOOM', 'CSKH', 'FIX_COD'),
                    money: fc.constantFrom(100000, 250000, 500000),
                    phone: fc.constantFrom('0901234567', '0912345678', '0987654321')
                }),
                (_ticket) => {
                    // deleteTicket PHẢI chứa oldData với các trường bắt buộc
                    const hasOldData = deleteTicketBody.includes('oldData');
                    const hasNewDataNull = /newData\s*:\s*null/.test(deleteTicketBody);
                    const hasTicketCodeField = /ticketCode/.test(deleteTicketBody)
                        && /oldData/.test(deleteTicketBody);

                    // Hành vi mong đợi: có oldData với thông tin phiếu và newData null
                    return hasOldData && hasNewDataNull && hasTicketCodeField;
                }
            ),
            { numRuns: 20 }
        );
    });

    /**
     * Property 1d: So sánh với các thao tác khác — ticket_create, ticket_receive_goods,
     * ticket_payment, ticket_add_debt ĐỀU có AuditLogger.logAction, nhưng deleteTicket thì KHÔNG.
     *
     * Điều này chứng minh pattern audit logging tồn tại cho các thao tác khác,
     * và deleteTicket bị bỏ sót.
     *
     * Test SẼ FAIL vì deleteTicket thiếu AuditLogger trong khi các thao tác khác có.
     *
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('Property 1d: deleteTicket phải có AuditLogger giống các thao tác khác trong cùng file', () => {
        // Xác nhận các thao tác khác ĐỀU có AuditLogger.logAction
        const hasTicketCreateAudit = sourceCode.includes("logAction('ticket_create'")
            || sourceCode.includes('logAction("ticket_create"');
        const hasTicketReceiveAudit = sourceCode.includes("logAction('ticket_receive_goods'")
            || sourceCode.includes('logAction("ticket_receive_goods"');
        const hasTicketPaymentAudit = sourceCode.includes("logAction('ticket_payment'")
            || sourceCode.includes('logAction("ticket_payment"');
        const hasTicketAddDebtAudit = sourceCode.includes("logAction('ticket_add_debt'")
            || sourceCode.includes('logAction("ticket_add_debt"');

        // Các thao tác khác ĐỀU có audit logging (baseline)
        expect(hasTicketCreateAudit).toBe(true);
        expect(hasTicketReceiveAudit).toBe(true);
        expect(hasTicketPaymentAudit).toBe(true);
        expect(hasTicketAddDebtAudit).toBe(true);

        // deleteTicket CŨNG PHẢI có AuditLogger.logAction
        // Test SẼ FAIL ở đây vì deleteTicket KHÔNG có AuditLogger
        const deleteTicketHasAudit = deleteTicketBody.includes('AuditLogger.logAction')
            || deleteTicketBody.includes('AuditLogger');
        expect(deleteTicketHasAudit).toBe(true);
    });
});
