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

        // Run migration 000 - Create customers table first
        console.log('='.repeat(60));
        console.log('Running create_customers_table.sql...');
        console.log('='.repeat(60));
        const sql0 = fs.readFileSync(
            path.join(__dirname, 'migrations', 'create_customers_table.sql'),
            'utf8'
        );
        await client.query(sql0);
        console.log('✓ Create customers table completed successfully!\n');

        // Run migration 001
        console.log('='.repeat(60));
        console.log('Running 001_create_customer_360_schema.sql...');
        console.log('='.repeat(60));
        const sql1 = fs.readFileSync(
            path.join(__dirname, 'migrations', '001_create_customer_360_schema.sql'),
            'utf8'
        );
        await client.query(sql1);
        console.log('✓ Migration 001 completed successfully!\n');

        // Run migration 002
        console.log('='.repeat(60));
        console.log('Running 002_create_customer_360_triggers.sql...');
        console.log('='.repeat(60));
        const sql2 = fs.readFileSync(
            path.join(__dirname, 'migrations', '002_create_customer_360_triggers.sql'),
            'utf8'
        );
        await client.query(sql2);
        console.log('✓ Migration 002 completed successfully!\n');

        // Verify tables
        console.log('='.repeat(60));
        console.log('Verifying tables...');
        console.log('='.repeat(60));
        const tablesResult = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('customers', 'customer_wallets', 'wallet_transactions',
                               'virtual_credits', 'customer_tickets', 'customer_activities', 'customer_notes')
            ORDER BY table_name;
        `);
        console.log('Tables found:');
        tablesResult.rows.forEach(row => console.log('  - ' + row.table_name));

        // Verify new columns on customers
        console.log('\nNew columns on customers table:');
        const columnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'customers'
            AND column_name IN ('tier', 'tags', 'rfm_segment', 'total_orders', 'total_spent', 'return_rate')
            ORDER BY column_name;
        `);
        columnsResult.rows.forEach(row => console.log('  - ' + row.column_name));

        console.log('\n✓ All migrations completed successfully!');

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
