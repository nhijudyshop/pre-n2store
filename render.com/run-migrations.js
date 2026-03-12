/**
 * Run migrations script
 * Usage: node run-migrations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrations = [
    '005_rfm_configuration.sql',
    '006_schema_normalization.sql',
    '007_updated_rfm_function.sql'
];

async function runMigrations() {
    const client = await pool.connect();

    try {
        for (const migration of migrations) {
            const filePath = path.join(__dirname, 'migrations', migration);
            console.log(`\n========================================`);
            console.log(`Running: ${migration}`);
            console.log(`========================================`);

            const sql = fs.readFileSync(filePath, 'utf8');

            try {
                await client.query(sql);
                console.log(`✅ ${migration} - SUCCESS`);
            } catch (err) {
                console.error(`❌ ${migration} - ERROR:`, err.message);
                // Continue with next migration even if one fails
            }
        }

        console.log(`\n========================================`);
        console.log(`All migrations completed!`);
        console.log(`========================================`);

    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations().catch(console.error);
