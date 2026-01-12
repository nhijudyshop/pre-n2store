const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL');

  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'customer_tickets'
    ORDER BY ordinal_position
  `);

  console.log('\n=== CUSTOMER_TICKETS COLUMNS ===');
  res.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type + ' | nullable: ' + r.is_nullable));

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
