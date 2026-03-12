/**
 * Run single migration script
 * Usage: node run-single-migration.js <migration_file>
 * Example: node run-single-migration.js 008_fix_customer_0932422070.sql
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrationFile = process.argv[2] || '008_fix_customer_0932422070.sql';

async function runMigration() {
    const client = await pool.connect();

    try {
        const filePath = path.join(__dirname, 'migrations', migrationFile);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Migration file not found: ${filePath}`);
            return;
        }

        console.log(`\n========================================`);
        console.log(`Running: ${migrationFile}`);
        console.log(`========================================`);

        const sql = fs.readFileSync(filePath, 'utf8');

        try {
            const result = await client.query(sql);
            console.log(`\n✅ ${migrationFile} - SUCCESS`);

            // Print results if any
            if (result && Array.isArray(result)) {
                result.forEach((r, i) => {
                    if (r.rows && r.rows.length > 0) {
                        console.log(`\n--- Result ${i + 1} ---`);
                        console.table(r.rows);
                    }
                });
            } else if (result && result.rows && result.rows.length > 0) {
                console.log(`\n--- Results ---`);
                console.table(result.rows);
            }
        } catch (err) {
            console.error(`\n❌ ${migrationFile} - ERROR:`, err.message);
        }

        console.log(`\n========================================`);
        console.log(`Migration completed!`);
        console.log(`========================================`);

    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(console.error);
