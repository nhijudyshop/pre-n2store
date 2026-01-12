/**
 * Customer 360° Migration Script
 * Run SQL migrations for Customer 360° system
 *
 * Usage: node run-migration.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🔗 Connected to PostgreSQL database');
        console.log('');

        // Migration files in order
        const migrations = [
            '001_create_customer_360_schema.sql',
            '002_create_customer_360_triggers.sql'
        ];

        for (const migrationFile of migrations) {
            const filePath = path.join(__dirname, '..', 'migrations', migrationFile);

            if (!fs.existsSync(filePath)) {
                console.log(`⚠️ Migration file not found: ${migrationFile}`);
                continue;
            }

            console.log(`📄 Running migration: ${migrationFile}`);
            console.log('─'.repeat(50));

            const sql = fs.readFileSync(filePath, 'utf8');

            // Split by semicolons but keep CREATE FUNCTION blocks together
            // Simple approach: execute the whole file
            try {
                await client.query(sql);
                console.log(`✅ ${migrationFile} completed successfully`);
            } catch (err) {
                // Some errors are expected (IF NOT EXISTS, etc)
                if (err.message.includes('already exists')) {
                    console.log(`⚠️ ${migrationFile}: Some objects already exist (OK)`);
                } else {
                    console.error(`❌ Error in ${migrationFile}:`, err.message);
                    // Continue with other migrations
                }
            }
            console.log('');
        }

        // Verify tables
        console.log('📊 Verifying tables...');
        console.log('─'.repeat(50));

        const tablesResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN (
                'customers', 'customer_wallets', 'wallet_transactions',
                'virtual_credits', 'customer_tickets', 'customer_activities',
                'customer_notes', 'balance_history'
            )
            ORDER BY table_name
        `);

        console.log('Tables found:');
        tablesResult.rows.forEach(row => {
            console.log(`  ✓ ${row.table_name}`);
        });
        console.log('');

        // Check customers columns
        const columnsResult = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'customers'
            AND column_name IN ('tier', 'tags', 'rfm_segment', 'total_orders', 'return_rate')
            ORDER BY column_name
        `);

        console.log('New columns in customers table:');
        columnsResult.rows.forEach(row => {
            console.log(`  ✓ ${row.column_name}`);
        });
        console.log('');

        // Check balance_history columns
        const bhColumnsResult = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'balance_history'
            AND column_name IN ('linked_customer_phone', 'customer_phone', 'wallet_processed', 'transfer_amount', 'content')
            ORDER BY column_name
        `);

        console.log('Columns in balance_history:');
        bhColumnsResult.rows.forEach(row => {
            console.log(`  ✓ ${row.column_name}`);
        });
        console.log('');

        // Count records ready for sync
        const syncCountResult = await client.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NOT NULL) as with_phone,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NOT NULL AND (wallet_processed = FALSE OR wallet_processed IS NULL)) as pending_sync
            FROM balance_history
        `);

        const counts = syncCountResult.rows[0];
        console.log('📈 Balance History Stats:');
        console.log(`  Total records: ${counts.total}`);
        console.log(`  With customer phone: ${counts.with_phone}`);
        console.log(`  Pending wallet sync: ${counts.pending_sync}`);
        console.log('');

        console.log('✅ Migration completed!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Deploy to Render.com');
        console.log('2. Call /api/wallet/cron/process-bank-transactions to sync wallet data');

    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run
runMigration().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
