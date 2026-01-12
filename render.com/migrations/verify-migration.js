// =====================================================
// SEPAY BALANCE HISTORY - DATABASE VERIFICATION
// Node.js script to verify database migration
// =====================================================

const { Client } = require('pg');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

async function verifyMigration(databaseUrl) {
    const client = new Client({
        connectionString: databaseUrl,
    });

    try {
        console.log('======================================================');
        console.log('🔍 VERIFYING DATABASE MIGRATION');
        console.log('======================================================\n');

        // Connect to database
        console.log(`${colors.yellow}Connecting to database...${colors.reset}`);
        await client.connect();
        console.log(`${colors.green}✅ Connected${colors.reset}\n`);

        // Check tables
        console.log(`${colors.blue}Checking tables...${colors.reset}`);
        const tablesResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('balance_history', 'sepay_webhook_logs')
            ORDER BY table_name
        `);

        const tables = tablesResult.rows.map(row => row.table_name);
        const expectedTables = ['balance_history', 'sepay_webhook_logs'];
        const missingTables = expectedTables.filter(t => !tables.includes(t));

        if (missingTables.length === 0) {
            console.log(`${colors.green}✅ All tables exist:${colors.reset}`);
            tables.forEach(t => console.log(`   - ${t}`));
        } else {
            console.log(`${colors.red}❌ Missing tables:${colors.reset}`);
            missingTables.forEach(t => console.log(`   - ${t}`));
            return false;
        }

        // Check columns for balance_history
        console.log(`\n${colors.blue}Checking balance_history columns...${colors.reset}`);
        const columnsResult = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'balance_history'
            ORDER BY ordinal_position
        `);

        const requiredColumns = [
            'id', 'sepay_id', 'gateway', 'transaction_date', 'account_number',
            'transfer_type', 'transfer_amount', 'accumulated'
        ];

        const actualColumns = columnsResult.rows.map(row => row.column_name);
        const missingColumns = requiredColumns.filter(c => !actualColumns.includes(c));

        if (missingColumns.length === 0) {
            console.log(`${colors.green}✅ All required columns exist (${actualColumns.length} total)${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Missing columns:${colors.reset}`);
            missingColumns.forEach(c => console.log(`   - ${c}`));
            return false;
        }

        // Check indexes
        console.log(`\n${colors.blue}Checking indexes...${colors.reset}`);
        const indexesResult = await client.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE tablename IN ('balance_history', 'sepay_webhook_logs')
            AND indexname LIKE 'idx_%'
            ORDER BY indexname
        `);

        const indexes = indexesResult.rows.map(row => row.indexname);
        console.log(`${colors.green}✅ Found ${indexes.length} indexes${colors.reset}`);
        indexes.forEach(idx => console.log(`   - ${idx}`));

        // Check view
        console.log(`\n${colors.blue}Checking views...${colors.reset}`);
        const viewsResult = await client.query(`
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
            AND table_name = 'balance_statistics'
        `);

        if (viewsResult.rows.length > 0) {
            console.log(`${colors.green}✅ View 'balance_statistics' exists${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ View 'balance_statistics' not found${colors.reset}`);
            return false;
        }

        // Test insert and select
        console.log(`\n${colors.blue}Testing insert/select operations...${colors.reset}`);

        const testData = {
            sepay_id: 999999999,
            gateway: 'Test Bank',
            transaction_date: new Date(),
            account_number: '0000000000',
            transfer_type: 'in',
            transfer_amount: 1000000,
            accumulated: 5000000,
            content: 'Test transaction from verification script',
            raw_data: JSON.stringify({ test: true })
        };

        // Insert test record
        await client.query(`
            INSERT INTO balance_history (
                sepay_id, gateway, transaction_date, account_number,
                transfer_type, transfer_amount, accumulated, content, raw_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (sepay_id) DO NOTHING
        `, [
            testData.sepay_id,
            testData.gateway,
            testData.transaction_date,
            testData.account_number,
            testData.transfer_type,
            testData.transfer_amount,
            testData.accumulated,
            testData.content,
            testData.raw_data
        ]);

        // Select test record
        const selectResult = await client.query(
            'SELECT * FROM balance_history WHERE sepay_id = $1',
            [testData.sepay_id]
        );

        if (selectResult.rows.length > 0) {
            console.log(`${colors.green}✅ Insert/Select operations working${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Insert/Select operations failed${colors.reset}`);
            return false;
        }

        // Clean up test data
        await client.query('DELETE FROM balance_history WHERE sepay_id = $1', [testData.sepay_id]);

        // Get row counts
        console.log(`\n${colors.blue}Database statistics:${colors.reset}`);
        const statsResult = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM balance_history) as balance_count,
                (SELECT COUNT(*) FROM sepay_webhook_logs) as webhook_logs_count
        `);

        const stats = statsResult.rows[0];
        console.log(`   - balance_history: ${stats.balance_count} records`);
        console.log(`   - sepay_webhook_logs: ${stats.webhook_logs_count} records`);

        console.log(`\n======================================================`);
        console.log(`${colors.green}✅ VERIFICATION SUCCESSFUL!${colors.reset}`);
        console.log(`======================================================\n`);

        return true;

    } catch (error) {
        console.error(`\n${colors.red}❌ Verification failed:${colors.reset}`, error.message);
        console.error(error.stack);
        return false;
    } finally {
        await client.end();
    }
}

// Main execution
if (require.main === module) {
    const databaseUrl = process.env.DATABASE_URL || process.argv[2];

    if (!databaseUrl) {
        console.error(`${colors.red}❌ Error: Database URL not provided${colors.reset}\n`);
        console.log('Usage:');
        console.log('  node verify-migration.js "postgresql://user:pass@host:port/dbname"');
        console.log('\nOr set DATABASE_URL environment variable:');
        console.log('  export DATABASE_URL="postgresql://user:pass@host:port/dbname"');
        console.log('  node verify-migration.js\n');
        process.exit(1);
    }

    verifyMigration(databaseUrl)
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(`${colors.red}Fatal error:${colors.reset}`, error);
            process.exit(1);
        });
}

module.exports = { verifyMigration };
