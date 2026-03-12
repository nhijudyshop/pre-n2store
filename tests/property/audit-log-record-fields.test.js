/**
 * Property-Based Tests - Audit Log Record Fields
 *
 * Property 1: Audit record chứa đầy đủ trường bắt buộc
 * Property 2: Audit record chứa trường tùy chọn khi được cung cấp
 *
 * **Validates: Yêu cầu 1.1, 1.2, 2.1, 2.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure functions extracted from audit-logger.js for testing
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

const OPTIONAL_FIELDS = [
    'approverUserId', 'approverUserName',
    'creatorUserId', 'creatorUserName',
    'entityId', 'entityType', 'metadata'
];

function buildRecord(actionType, details, user) {
    var record = {
        timestamp: 'SERVER_TIMESTAMP',
        performerUserId: user.userId,
        performerUserName: user.userName,
        module: details.module,
        actionType: actionType,
        description: details.description || '',
        oldData: details.oldData || null,
        newData: details.newData || null
    };
    for (var i = 0; i < OPTIONAL_FIELDS.length; i++) {
        var field = OPTIONAL_FIELDS[i];
        if (details[field] !== undefined && details[field] !== null) {
            record[field] = details[field];
        }
    }
    return record;
}

function isValidActionType(actionType) {
    return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
}

// ============================================================
// Arbitraries
// ============================================================

const arbActionType = fc.constantFrom(...VALID_ACTION_TYPES);

const arbUser = fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    userName: fc.string({ minLength: 1, maxLength: 30 })
});

const arbModule = fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history');

const arbSimpleValue = fc.oneof(
    fc.string({ minLength: 0, maxLength: 30 }),
    fc.integer({ min: -9999, max: 9999 }),
    fc.boolean(),
    fc.constant(null)
);

const arbDataObject = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    arbSimpleValue,
    { minKeys: 0, maxKeys: 5 }
);

const arbDetails = fc.record({
    module: arbModule,
    description: fc.string({ minLength: 0, maxLength: 50 }),
    oldData: fc.option(arbDataObject, { nil: null }),
    newData: fc.option(arbDataObject, { nil: null })
});

// ============================================================
// Property 1: Audit record chứa đầy đủ trường bắt buộc
// **Validates: Yêu cầu 1.1, 2.1, 2.2**
// ============================================================
describe('Property 1: Audit record chứa đầy đủ trường bắt buộc', () => {
    it('Với bất kỳ actionType hợp lệ + details + user, record phải chứa tất cả trường bắt buộc', () => {
        fc.assert(
            fc.property(
                arbActionType,
                arbDetails,
                arbUser,
                (actionType, details, user) => {
                    const record = buildRecord(actionType, details, user);

                    // Trường bắt buộc phải tồn tại
                    expect(record).toHaveProperty('timestamp');
                    expect(record).toHaveProperty('performerUserId');
                    expect(record).toHaveProperty('performerUserName');
                    expect(record).toHaveProperty('module');
                    expect(record).toHaveProperty('actionType');
                    expect(record).toHaveProperty('description');
                    expect(record).toHaveProperty('oldData');
                    expect(record).toHaveProperty('newData');

                    // Giá trị phải khớp input
                    expect(record.performerUserId).toBe(user.userId);
                    expect(record.performerUserName).toBe(user.userName);
                    expect(record.module).toBe(details.module);
                    expect(record.actionType).toBe(actionType);
                }
            ),
            { numRuns: 200 }
        );
    });
});


// ============================================================
// Property 2: Audit record chứa trường tùy chọn khi được cung cấp
// **Validates: Yêu cầu 1.2**
// ============================================================

/** Arbitrary: random subset of optional fields */
const arbOptionalDetails = fc.record({
    module: arbModule,
    description: fc.string({ minLength: 0, maxLength: 50 }),
    oldData: fc.option(arbDataObject, { nil: null }),
    newData: fc.option(arbDataObject, { nil: null }),
    approverUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    approverUserName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    creatorUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    creatorUserName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    entityId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    entityType: fc.option(fc.constantFrom('customer', 'ticket', 'transaction', 'accountant_entry'), { nil: undefined }),
    metadata: fc.option(arbDataObject, { nil: undefined })
});

describe('Property 2: Audit record chứa trường tùy chọn khi được cung cấp', () => {
    it('Record chứa chính xác các trường tùy chọn đã cung cấp, không chứa trường không cung cấp', () => {
        fc.assert(
            fc.property(
                arbActionType,
                arbOptionalDetails,
                arbUser,
                (actionType, details, user) => {
                    const record = buildRecord(actionType, details, user);

                    for (const field of OPTIONAL_FIELDS) {
                        if (details[field] !== undefined && details[field] !== null) {
                            // Trường được cung cấp → phải có trong record
                            expect(record).toHaveProperty(field);
                            expect(record[field]).toBe(details[field]);
                        } else {
                            // Trường không cung cấp → không có trong record
                            expect(record).not.toHaveProperty(field);
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });
});
