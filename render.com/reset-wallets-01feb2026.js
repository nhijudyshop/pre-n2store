/**
 * Reset Wallets before 01/02/2026 11:00 AM
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat',
    ssl: { rejectUnauthorized: false }
});

const RESET_DATETIME = '2026-02-01 11:00:00';
const RESET_ID = 'RESET_01FEB2026_11AM';

async function resetWallets() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('RESET VÍ TRƯỚC 11h 01/02/2026');
        console.log('─'.repeat(50));

        // Xóa reset cũ nếu có
        await client.query(`DELETE FROM wallet_transactions WHERE reference_id = $1`, [RESET_ID]);

        // Reset tất cả ví về 0
        await client.query(`UPDATE customer_wallets SET balance = 0, virtual_balance = 0`);

        // Tính số dư trước mốc reset và thêm giao dịch điều chỉnh
        const balanceBefore = await client.query(`
            SELECT wt.phone, cw.id as wallet_id,
                COALESCE(SUM(CASE WHEN wt.type = 'DEPOSIT' THEN wt.amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN wt.type = 'WITHDRAW' THEN ABS(wt.amount) ELSE 0 END), 0) as real_bal,
                COALESCE(SUM(CASE WHEN wt.type = 'VIRTUAL_CREDIT' THEN wt.amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN wt.type IN ('VIRTUAL_DEBIT', 'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL') THEN ABS(wt.amount) ELSE 0 END), 0) as virtual_bal
            FROM wallet_transactions wt
            JOIN customer_wallets cw ON cw.phone = wt.phone
            WHERE wt.created_at < $1 AND wt.type != 'ADJUSTMENT'
            GROUP BY wt.phone, cw.id
        `, [RESET_DATETIME]);

        let adjustCount = 0;
        for (const row of balanceBefore.rows) {
            const real = parseFloat(row.real_bal);
            const virtual = parseFloat(row.virtual_bal);
            if (real > 0 || virtual > 0) {
                await client.query(`
                    INSERT INTO wallet_transactions (phone, wallet_id, type, amount, balance_before, balance_after,
                        virtual_balance_before, virtual_balance_after, source, reference_type, reference_id, note, created_at)
                    VALUES ($1, $2, 'ADJUSTMENT', $3, $4, 0, $5, 0, 'MANUAL_ADJUSTMENT', 'system', $6, $7, '2026-02-01 10:59:59')
                `, [row.phone, row.wallet_id, -(real + virtual), real, virtual, RESET_ID,
                    'Điều chỉnh số dư trước 11h 01/02/2026 - Thật: ' + real.toLocaleString('vi-VN') + ', Ảo: ' + virtual.toLocaleString('vi-VN')]);
                adjustCount++;
            }
        }
        console.log('Đã thêm', adjustCount, 'giao dịch điều chỉnh');

        // Tính lại số dư từ giao dịch sau mốc reset
        const balanceAfter = await client.query(`
            SELECT phone,
                COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN type = 'WITHDRAW' THEN ABS(amount) ELSE 0 END), 0) as real_bal,
                COALESCE(SUM(CASE WHEN type = 'VIRTUAL_CREDIT' THEN amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN type IN ('VIRTUAL_DEBIT', 'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL') THEN ABS(amount) ELSE 0 END), 0) as virtual_bal
            FROM wallet_transactions
            WHERE created_at >= $1 AND type != 'ADJUSTMENT'
            GROUP BY phone
        `, [RESET_DATETIME]);

        let recalcCount = 0;
        for (const row of balanceAfter.rows) {
            const real = Math.max(0, parseFloat(row.real_bal));
            const virtual = Math.max(0, parseFloat(row.virtual_bal));
            if (real > 0 || virtual > 0) {
                await client.query(`UPDATE customer_wallets SET balance = $1, virtual_balance = $2 WHERE phone = $3`, [real, virtual, row.phone]);
                recalcCount++;
            }
        }
        console.log('Đã cập nhật', recalcCount, 'ví từ giao dịch sau 01/02/2026');

        await client.query('COMMIT');

        // Kết quả
        const stats = await client.query(`
            SELECT COUNT(*) FILTER (WHERE balance > 0 OR virtual_balance > 0) as count,
                SUM(balance) as total_real, SUM(virtual_balance) as total_virtual
            FROM customer_wallets
        `);
        console.log('─'.repeat(50));
        console.log('Ví có số dư:', stats.rows[0].count);
        console.log('Tổng thật:', Number(stats.rows[0].total_real).toLocaleString('vi-VN'), 'đ');
        console.log('Tổng ảo:', Number(stats.rows[0].total_virtual).toLocaleString('vi-VN'), 'đ');
        console.log('✅ HOÀN TẤT!');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Lỗi:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

resetWallets();
