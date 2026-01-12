const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

async function runMigration() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected successfully!\n');

        // Run migration 004
        console.log('='.repeat(60));
        console.log('Running 004_add_link_columns_to_balance_history.sql...');
        console.log('='.repeat(60));
        const sql = fs.readFileSync(
            path.join(__dirname, 'migrations', '004_add_link_columns_to_balance_history.sql'),
            'utf8'
        );
        console.log('SQL:\n', sql);
        await client.query(sql);
        console.log('✓ Migration 004 completed successfully!\n');

        // Verify columns on balance_history
        console.log('='.repeat(60));
        console.log('Verifying new columns on balance_history...');
        console.log('='.repeat(60));
        const columnsResult = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'balance_history'
            AND column_name IN ('linked_customer_phone', 'customer_id', 'wallet_processed')
            ORDER BY column_name;
        `);
        console.log('New columns found:');
        columnsResult.rows.forEach(row => console.log(`  - ${row.column_name} (${row.data_type})`));

        console.log('\n✓ Migration 004 completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error.message);
        if (error.position) {
            console.error('Error position:', error.position);
        }
        process.exit(1);
    } finally {
        await client.end();
        console.log('\nDatabase connection closed.');
    }
}

runMigration();
