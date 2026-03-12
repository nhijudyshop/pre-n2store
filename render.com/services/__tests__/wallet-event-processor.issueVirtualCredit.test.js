/**
 * Bug Condition Exploration Test - issueVirtualCredit() thiếu wallet_transactions record
 *
 * **Validates: Requirements 1.2, 1.4, 2.2**
 *
 * GOAL: Tìm counterexample chứng minh issueVirtualCredit() không tạo record wallet_transactions
 *
 * Property 1: Fault Condition - issueVirtualCredit Thiếu wallet_transactions Record
 * Với mọi (phone, amount > 0, ticketId, reason), gọi issueVirtualCredit() phải tạo
 * ít nhất 1 INSERT INTO wallet_transactions với type = 'VIRTUAL_CREDIT' và source = 'VIRTUAL_CREDIT_ISSUE'
 *
 * EXPECTED OUTCOME trên code CHƯA SỬA: Test FAIL (xác nhận bug tồn tại)
 */

const fc = require('fast-check');
const { issueVirtualCredit } = require('../wallet-event-processor');

/**
 * Tạo mock DB object track tất cả SQL queries
 * Trả về kết quả phù hợp cho từng query pattern
 */
function createMockDb() {
    const queries = [];

    const mockDb = {
        query: jest.fn(async (sql, params) => {
            queries.push({ sql, params });

            // getOrCreateWallet - SELECT existing wallet
            if (sql.includes('SELECT') && sql.includes('customer_wallets') && sql.includes('WHERE phone')) {
                return {
                    rows: [{
                        id: 1,
                        phone: params[0],
                        customer_id: null,
                        balance: 0,
                        virtual_balance: 50000,
                        total_deposited: 0,
                        total_withdrawn: 0,
                        total_virtual_issued: 50000,
                        total_virtual_used: 0
                    }]
                };
            }

            // BEGIN / COMMIT / ROLLBACK
            if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql.trim())) {
                return { rows: [] };
            }

            // INSERT INTO virtual_credits
            if (sql.includes('INSERT INTO virtual_credits')) {
                return { rows: [{ id: 999 }] };
            }

            // UPDATE customer_wallets
            if (sql.includes('UPDATE customer_wallets')) {
                return {
                    rows: [{
                        id: 1,
                        phone: params ? params[0] || '0900000000' : '0900000000',
                        balance: 0,
                        virtual_balance: 100000,
                        total_virtual_issued: 100000
                    }]
                };
            }

            // INSERT INTO wallet_transactions (this is what the bug SHOULD create)
            if (sql.includes('INSERT INTO wallet_transactions')) {
                return { rows: [{ id: 1000 }] };
            }

            return { rows: [] };
        }),
        getQueries: () => queries
    };

    return mockDb;
}

describe('issueVirtualCredit - Bug Condition Exploration (Property 1: Fault Condition)', () => {
    test('Property: issueVirtualCredit() MUST INSERT INTO wallet_transactions with type VIRTUAL_CREDIT', async () => {
        /**
         * **Validates: Requirements 1.2, 1.4, 2.2**
         *
         * Property: For all (phone, amount > 0, ticketId, reason),
         * issueVirtualCredit(db, phone, amount, ticketId, reason) MUST execute
         * at least one INSERT INTO wallet_transactions with type = 'VIRTUAL_CREDIT'
         * and source = 'VIRTUAL_CREDIT_ISSUE'
         */
        await fc.assert(
            fc.asyncProperty(
                // Generate random phone (Vietnamese format 09xxxxxxxx)
                fc.integer({ min: 0, max: 99999999 }).map(n => '09' + String(n).padStart(8, '0')),
                // Generate random amount > 0 (typical range: 1000 - 10,000,000 VND)
                fc.integer({ min: 1000, max: 10000000 }),
                // Generate random ticketId (e.g. T001, TK123)
                fc.string({ minLength: 3, maxLength: 10 }).map(s => 'T' + s.replace(/[^A-Za-z0-9]/g, '0').slice(0, 5)),
                // Generate random reason
                fc.constantFrom('Thu về', 'Hoàn hàng', 'Đền bù', 'Cấp công nợ ảo'),
                async (phone, amount, ticketId, reason) => {
                    const mockDb = createMockDb();

                    const result = await issueVirtualCredit(mockDb, phone, amount, ticketId, reason);

                    // Function should succeed
                    expect(result.success).toBe(true);
                    expect(result.virtual_credit_id).toBeDefined();

                    // Get all queries executed
                    const allQueries = mockDb.getQueries();

                    // Find INSERT INTO wallet_transactions queries
                    const walletTxInserts = allQueries.filter(q =>
                        q.sql.includes('INSERT INTO wallet_transactions')
                    );

                    // PROPERTY: There MUST be at least 1 INSERT INTO wallet_transactions
                    expect(walletTxInserts.length).toBeGreaterThanOrEqual(1);

                    if (walletTxInserts.length > 0) {
                        const txQuery = walletTxInserts[0];

                        // The INSERT must include type = 'VIRTUAL_CREDIT'
                        expect(txQuery.sql).toContain('VIRTUAL_CREDIT');

                        // The INSERT must include source = 'VIRTUAL_CREDIT_ISSUE'
                        expect(txQuery.sql).toContain('VIRTUAL_CREDIT_ISSUE');

                        // The amount in params must match input amount
                        expect(txQuery.params).toContain(amount);
                    }
                }
            ),
            {
                numRuns: 50,
                verbose: 2
            }
        );
    });
});
