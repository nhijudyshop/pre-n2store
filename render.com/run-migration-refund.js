const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL');
  console.log('\n=== RUNNING MIGRATION: Add refund fields ===\n');

  // Add refund_order_id column
  console.log('1. Adding refund_order_id column...');
  await client.query(`
    ALTER TABLE customer_tickets 
    ADD COLUMN IF NOT EXISTS refund_order_id INTEGER
  `);
  console.log('   ✓ refund_order_id added');

  // Add refund_number column
  console.log('2. Adding refund_number column...');
  await client.query(`
    ALTER TABLE customer_tickets 
    ADD COLUMN IF NOT EXISTS refund_number VARCHAR(50)
  `);
  console.log('   ✓ refund_number added');

  // Add index for refund_order_id
  console.log('3. Adding index for refund_order_id...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_refund_order_id 
    ON customer_tickets(refund_order_id) 
    WHERE refund_order_id IS NOT NULL
  `);
  console.log('   ✓ Index created');

  // Verify columns
  console.log('\n=== VERIFICATION ===');
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'customer_tickets' 
    AND column_name IN ('refund_order_id', 'refund_number')
  `);
  res.rows.forEach(r => console.log(`   ${r.column_name}: ${r.data_type}`));

  console.log('\n✅ Migration completed successfully!');
  await client.end();
}

run().catch(e => { 
  console.error('❌ Migration failed:', e); 
  process.exit(1); 
});
