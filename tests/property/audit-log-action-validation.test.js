/**
 * Property-Based Tests - Audit Log Action Validation & Badge Mapping
 *
 * Property 3: Validation actionType chỉ chấp nhận giá trị hợp lệ
 * Property 10: ActionType badge mapping đầy đủ
 *
 * **Validates: Yêu cầu 2.4, 8.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure functions extracted from source
// ============================================================

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

const ACTION_BADGE_MAP = {
    'wallet_add_debt':          { text: 'Cộng công nợ',       color: '#52c41a' },
    'wallet_subtract_debt':     { text: 'Trừ công nợ',        color: '#ff4d4f' },
    'wallet_adjust_debt':       { text: 'Điều chỉnh công nợ', color: '#fa8c16' },
    'customer_info_update':     { text: 'Cập nhật KH',        color: '#1890ff' },
    'wallet_transaction':       { text: 'Giao dịch ví',       color: '#722ed1' },
    'ticket_create':            { text: 'Tạo phiếu',          color: '#52c41a' },
    'ticket_add_debt':          { text: 'Cộng nợ ticket',     color: '#13c2c2' },
    'ticket_receive_goods':     { text: 'Nhận hàng',          color: '#2f54eb' },
    'ticket_payment':           { text: 'Thanh toán',         color: '#eb2f96' },
    'ticket_update':            { text: 'Cập nhật ticket',    color: '#1890ff' },
    'transaction_assign':       { text: 'Gán giao dịch',      color: '#52c41a' },
    'livemode_confirm_customer':{ text: 'Xác nhận KH',        color: '#13c2c2' },
    'transaction_approve':      { text: 'Duyệt GD',           color: '#2f54eb' },
    'transaction_adjust':       { text: 'Điều chỉnh GD',      color: '#fa8c16' },
    'customer_info_update_bh':  { text: 'Cập nhật KH (BH)',   color: '#1890ff' },
    'transaction_verify':       { text: 'Kiểm tra GD',        color: '#722ed1' },
    'accountant_entry_create':  { text: 'Kế toán duyệt',      color: '#eb2f96' },
    'add':    { text: 'Thêm',    color: '#52c41a' },
    'edit':   { text: 'Sửa',     color: '#1890ff' },
    'delete': { text: 'Xóa',     color: '#ff4d4f' },
    'update': { text: 'Cập nhật', color: '#fa8c16' },
    'mark':   { text: 'Đánh dấu', color: '#8c8c8c' }
};

function getActionBadge(actionType) {
    return ACTION_BADGE_MAP[actionType] || { text: actionType || 'Không xác định', color: '#8c8c8c' };
}

// ============================================================
// Arbitraries
// ============================================================

const arbValidActionType = fc.constantFrom(...VALID_ACTION_TYPES);
const arbRandomString = fc.string({ minLength: 0, maxLength: 30 });

// ============================================================
// Property 3: Validation actionType
// **Validates: Yêu cầu 2.4**
// ============================================================
describe('Property 3: Validation actionType chỉ chấp nhận giá trị hợp lệ', () => {
    it('isValidActionType trả về true khi và chỉ khi string thuộc VALID_ACTION_TYPES', () => {
        fc.assert(
            fc.property(arbRandomString, (s) => {
                const result = isValidActionType(s);
                const expected = VALID_ACTION_TYPES.indexOf(s) !== -1;
                expect(result).toBe(expected);
            }),
            { numRuns: 500 }
        );
    });

    it('Tất cả VALID_ACTION_TYPES đều trả về true', () => {
        fc.assert(
            fc.property(arbValidActionType, (actionType) => {
                expect(isValidActionType(actionType)).toBe(true);
            }),
            { numRuns: 200 }
        );
    });

    it('Non-string inputs trả về false', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
                (val) => {
                    expect(isValidActionType(val)).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ============================================================
// Property 10: ActionType badge mapping đầy đủ
// **Validates: Yêu cầu 8.4**
// ============================================================
describe('Property 10: ActionType badge mapping đầy đủ', () => {
    it('Mỗi actionType hợp lệ đều có badge với text và color hợp lệ', () => {
        fc.assert(
            fc.property(arbValidActionType, (actionType) => {
                const badge = getActionBadge(actionType);
                expect(badge).toHaveProperty('text');
                expect(badge).toHaveProperty('color');
                expect(typeof badge.text).toBe('string');
                expect(badge.text.length).toBeGreaterThan(0);
                expect(typeof badge.color).toBe('string');
                expect(badge.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }),
            { numRuns: 200 }
        );
    });

    it('ActionType không hợp lệ trả về fallback badge', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).filter(s =>
                    VALID_ACTION_TYPES.indexOf(s) === -1 && !ACTION_BADGE_MAP.hasOwnProperty(s)
                    && !Object.prototype.hasOwnProperty(s)
                ),
                (invalidType) => {
                    const badge = getActionBadge(invalidType);
                    expect(badge).toHaveProperty('text');
                    expect(badge).toHaveProperty('color');
                    expect(badge.color).toBe('#8c8c8c');
                }
            ),
            { numRuns: 100 }
        );
    });
});
