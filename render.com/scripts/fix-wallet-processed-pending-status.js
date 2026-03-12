/**
 * Fix: Transactions that have wallet_processed=TRUE but verification_status is still PENDING
 *
 * Problem: Some transactions before Jan 25 have been credited to wallet (wallet_processed=TRUE)
 * but their verification_status is still PENDING_VERIFICATION, causing them to appear in
 * the "chờ duyệt" (pending approval) tab.
 *
 * Solution: Update these transactions to APPROVED status with verified_at = today
 *
 * Usage: node fix-wallet-processed-pending-status.js [--dry-run]
 */

const { Pool } = require('pg');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const isDryRun = process.argv.includes('--dry-run');

async function fixWalletProcessedPendingStatus() {
    const client = await pool.connect();

    try {
        console.log('🔗 Connected to PostgreSQL database');
        console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
        console.log('');

        // 1. First, show the affected transactions
        console.log('📊 Finding transactions with wallet_processed=TRUE but status=PENDING...');
        console.log('─'.repeat(60));

        const affectedResult = await client.query(`
            SELECT
                bh.id,
                bh.sepay_id,
                bh.content,
                bh.transfer_amount,
                bh.transaction_date,
                bh.linked_customer_phone,
                bh.wallet_processed,
                bh.verification_status,
                bh.match_method,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            WHERE bh.wallet_processed = TRUE
              AND bh.verification_status IN ('PENDING_VERIFICATION', 'PENDING')
              AND bh.transfer_type = 'in'
            ORDER BY bh.transaction_date DESC
        `);

        console.log(`Found ${affectedResult.rows.length} transactions to fix:`);
        console.log('');

        if (affectedResult.rows.length === 0) {
            console.log('✅ No transactions need fixing!');
            return;
        }

        // Show summary by date
        const byDate = {};
        let totalAmount = 0;

        affectedResult.rows.forEach(tx => {
            const date = tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('vi-VN') : 'Unknown';
            if (!byDate[date]) {
                byDate[date] = { count: 0, amount: 0 };
            }
            byDate[date].count++;
            byDate[date].amount += parseFloat(tx.transfer_amount || 0);
            totalAmount += parseFloat(tx.transfer_amount || 0);
        });

        console.log('Summary by date:');
        Object.entries(byDate).forEach(([date, data]) => {
            console.log(`  ${date}: ${data.count} transactions, ${data.amount.toLocaleString()}đ`);
        });
        console.log(`  TOTAL: ${affectedResult.rows.length} transactions, ${totalAmount.toLocaleString()}đ`);
        console.log('');

        // Show first 10 transactions as sample
        console.log('Sample transactions (first 10):');
        console.log('─'.repeat(100));
        affectedResult.rows.slice(0, 10).forEach(tx => {
            console.log(`  ID: ${tx.id} | ${tx.transaction_date ? new Date(tx.transaction_date).toLocaleString('vi-VN') : 'N/A'} | ${parseFloat(tx.transfer_amount).toLocaleString()}đ | ${tx.linked_customer_phone || 'N/A'} | ${(tx.customer_name || 'Unknown').substring(0, 20)}`);
        });
        console.log('');

        if (isDryRun) {
            console.log('⚠️ DRY RUN: No changes made. Remove --dry-run flag to execute.');
            return;
        }

        // 2. Update the transactions
        console.log('🔄 Updating verification_status to APPROVED...');
        console.log('');

        await client.query('BEGIN');

        const updateResult = await client.query(`
            UPDATE balance_history
            SET
                verification_status = 'APPROVED',
                verified_by = 'system-migration-fix',
                verified_at = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                verification_note = COALESCE(verification_note, '') || ' [Auto-fixed: wallet already processed]'
            WHERE wallet_processed = TRUE
              AND verification_status IN ('PENDING_VERIFICATION', 'PENDING')
              AND transfer_type = 'in'
            RETURNING id
        `);

        await client.query('COMMIT');

        console.log(`✅ Updated ${updateResult.rowCount} transactions to APPROVED status`);
        console.log('');

        // 3. Verify the fix
        console.log('📊 Verifying fix...');
        const verifyResult = await client.query(`
            SELECT
                COUNT(*) as remaining
            FROM balance_history
            WHERE wallet_processed = TRUE
              AND verification_status IN ('PENDING_VERIFICATION', 'PENDING')
              AND transfer_type = 'in'
        `);

        const remaining = parseInt(verifyResult.rows[0].remaining);
        if (remaining === 0) {
            console.log('✅ All transactions fixed successfully!');
        } else {
            console.log(`⚠️ ${remaining} transactions still need attention`);
        }

        // 4. Show current stats
        console.log('');
        console.log('📈 Current verification stats:');
        const statsResult = await client.query(`
            SELECT
                verification_status,
                COUNT(*) as count,
                SUM(transfer_amount) as total_amount
            FROM balance_history
            WHERE transfer_type = 'in'
            GROUP BY verification_status
            ORDER BY count DESC
        `);

        statsResult.rows.forEach(row => {
            console.log(`  ${row.verification_status || 'NULL'}: ${row.count} transactions, ${parseFloat(row.total_amount || 0).toLocaleString()}đ`);
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run
fixWalletProcessedPendingStatus().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
