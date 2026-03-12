/**
 * Preservation Property Tests - Capture baseline behavior TRƯỚC KHI sửa lỗi
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation - Các wallet operations hiện tại không bị ảnh hưởng
 *
 * Observation-first methodology:
 * - Observe: processManualDeposit(db, phone, amount, source, referenceId, note) calls processWalletEvent
 *   which creates wallet_transactions record with type = 'DEPOSIT'
 * - Observe: TYPE_LABELS object in wallet-panel.js contains labels for transaction types
 * - Observe: CREDIT_TYPES array in wallet-panel.js lists types considered as credit (positive amount)
 *
 * EXPECTED OUTCOME: All tests PASS on unfixed code (confirms baseline behavior to preserve)
 */

const fc = require('fast-check');
const {
    processManualDeposit,
    WALLET_EVENT_TYPES,
    WALLET_SOURCES
} = require('../wallet-event-processor');

// =====================================================
// Constants from wallet-panel.js (frontend) - captured for preservation
// =====================================================

// Observed from wallet-panel.js lines 4-14
const TYPE_LABELS = {
    'DEPOSIT': 'Nạp tiền',
    'WITHDRAW': 'Rút tiền',
    'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
    'VIRTUAL_CREDIT_ISSUED': 'Cộng công nợ ảo (Thu về)',
    'VIRTUAL_CREDIT_CANCELLED': 'Cộng công nợ ảo (đã hủy)',
    'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
    'VIRTUAL_EXPIRE': 'Công nợ hết hạn',
    'VIRTUAL_CANCEL': 'Thu hồi công nợ ảo',
    'ADJUSTMENT': 'Điều chỉnh số dư'
};

// Observed from wallet-panel.js line 16
const CREDIT_TYPES = ['DEPOSIT', 'VIRTUAL_CREDIT', 'VIRTUAL_CREDIT_ISSUED', 'VIRTUAL_CREDIT_CANCELLED'];

// DB constraint types from migration 023
const DB_CONSTRAINT_TYPES = [
    'DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT',
    'VIRTUAL_DEBIT', 'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL', 'ADJUSTMENT'
];

// =====================================================
// Mock DB helper
// =====================================================

function createMockDb(initialBalance = 100000) {
    const queries = [];

    const mockDb = {
        query: jest.fn(async (sql, params) => {
            queries.push({ sql, params });

            // BEGIN / COMMIT / ROLLBACK
            if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql.trim())) {
                return { rows: [] };
            }

            // SELECT wallet with FOR UPDATE
            if (sql.includes('SELECT') && sql.includes('customer_wallets') && sql.includes('FOR UPDATE')) {
                return {
                    rows: [{
                        id: 1,
                        phone: params[0],
                        customer_id: null,
                        balance: initialBalance,
                        virtual_balance: 0,
                        total_deposited: initialBalance,
                        total_withdrawn: 0,
                        total_virtual_issued: 0,
                        total_virtual_used: 0
                    }]
                };
            }

            // UPDATE customer_wallets
            if (sql.includes('UPDATE customer_wallets')) {
                return {
                    rows: [{
                        id: 1,
                        phone: '0900000000',
                        balance: initialBalance,
                        virtual_balance: 0,
                        total_deposited: initialBalance,
                        total_withdrawn: 0,
                        total_virtual_issued: 0,
                        total_virtual_used: 0
                    }]
                };
            }

            // INSERT INTO wallet_transactions
            if (sql.includes('INSERT INTO wallet_transactions')) {
                return { rows: [{ id: 1000 }] };
            }

            return { rows: [] };
        }),
        getQueries: () => queries
    };

    return mockDb;
}

// =====================================================
// Property Tests
// =====================================================

describe('Preservation Property Tests (Property 2: Preservation)', () => {

    describe('Property: processManualDeposit always creates wallet_transactions with type DEPOSIT and correct amount', () => {
        /**
         * **Validates: Requirements 3.2**
         *
         * Observed behavior: processManualDeposit calls processWalletEvent with type='DEPOSIT',
         * which always INSERTs into wallet_transactions with the given amount.
         *
         * For all (phone, amount > 0, source, referenceId, note):
         *   processManualDeposit(db, phone, amount, source, referenceId, note)
         *   MUST create exactly 1 INSERT INTO wallet_transactions with type containing 'DEPOSIT'
         *   and params containing the exact amount.
         */
        test('processManualDeposit always INSERTs into wallet_transactions with DEPOSIT type and correct amount', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Vietnamese phone format
                    fc.integer({ min: 0, max: 99999999 }).map(n => '09' + String(n).padStart(8, '0')),
                    // Amount > 0 (typical VND range)
                    fc.integer({ min: 1000, max: 10000000 }),
                    // Source
                    fc.constantFrom('RETURN_GOODS', 'BANK_TRANSFER', 'MANUAL_ADJUSTMENT'),
                    // Reference ID
                    fc.string({ minLength: 1, maxLength: 10 }).map(s => 'REF' + s.replace(/[^A-Za-z0-9]/g, '0')),
                    // Note
                    fc.constantFrom('Hoàn tiền', 'Nạp tiền', 'Điều chỉnh'),
                    async (phone, amount, source, referenceId, note) => {
                        const mockDb = createMockDb();

                        const result = await processManualDeposit(mockDb, phone, amount, source, referenceId, note);

                        // Function should succeed
                        expect(result.success).toBe(true);
                        expect(result.transactionId).toBeDefined();

                        // Get all queries
                        const allQueries = mockDb.getQueries();

                        // Find INSERT INTO wallet_transactions
                        const walletTxInserts = allQueries.filter(q =>
                            q.sql.includes('INSERT INTO wallet_transactions')
                        );

                        // PROPERTY: Exactly 1 INSERT INTO wallet_transactions
                        expect(walletTxInserts.length).toBe(1);

                        const txQuery = walletTxInserts[0];

                        // PROPERTY: type param is 'DEPOSIT'
                        // In processWalletEvent, params order is:
                        // [phone, wallet.id, type, amount, balance_before, balance_after,
                        //  virtual_balance_before, virtual_balance_after, source, referenceType, referenceId, note]
                        expect(txQuery.params[2]).toBe('DEPOSIT');

                        // PROPERTY: amount param matches input
                        expect(txQuery.params[3]).toBe(amount);
                    }
                ),
                { numRuns: 50, verbose: 2 }
            );
        });
    });

    describe('Property: TYPE_LABELS contains all DB constraint types', () => {
        /**
         * **Validates: Requirements 3.5**
         *
         * Observed behavior: TYPE_LABELS in wallet-panel.js contains labels for all
         * transaction types that exist in the DB constraint wallet_transactions_type_check.
         *
         * Property: Every type in DB_CONSTRAINT_TYPES has a corresponding label in TYPE_LABELS.
         */
        test('every DB constraint type has a label in TYPE_LABELS', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(...DB_CONSTRAINT_TYPES),
                    (dbType) => {
                        // PROPERTY: TYPE_LABELS must have a label for this DB type
                        expect(TYPE_LABELS).toHaveProperty(dbType);
                        expect(typeof TYPE_LABELS[dbType]).toBe('string');
                        expect(TYPE_LABELS[dbType].length).toBeGreaterThan(0);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Property: CREDIT_TYPES only contains types that are credit (positive amount)', () => {
        /**
         * **Validates: Requirements 3.5**
         *
         * Observed behavior: CREDIT_TYPES array in wallet-panel.js lists types
         * that represent positive/credit transactions (money coming in).
         *
         * Property: Every type in CREDIT_TYPES is semantically a credit type
         * (DEPOSIT or types containing 'CREDIT' that are not DEBIT/EXPIRE/CANCEL).
         */
        test('CREDIT_TYPES only contains credit-semantic types (not DEBIT, EXPIRE, CANCEL, WITHDRAW)', () => {
            // Types that represent money going OUT (debit-semantic)
            const DEBIT_SEMANTIC_TYPES = ['WITHDRAW', 'VIRTUAL_DEBIT', 'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL'];

            fc.assert(
                fc.property(
                    fc.constantFrom(...CREDIT_TYPES),
                    (creditType) => {
                        // PROPERTY: No debit-semantic type should be in CREDIT_TYPES
                        expect(DEBIT_SEMANTIC_TYPES).not.toContain(creditType);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
