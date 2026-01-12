const { Client } = require('pg');

const connectionString = 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

async function checkTables() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database!\n');

        // List all tables
        const result = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log('Existing tables in database:');
        if (result.rows.length === 0) {
            console.log('  (No tables found)');
        } else {
            result.rows.forEach(row => console.log('  - ' + row.table_name));
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await client.end();
    }
}

checkTables();
