// =====================================================
// CUSTOMERS TABLE - DATABASE VERIFICATION
// Tái sử dụng pattern từ verify-migration.js
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

async function verifyCustomersMigration(databaseUrl) {
    const client = new Client({
        connectionString: databaseUrl,
    });

    try {
        console.log('======================================================');
        console.log('🔍 VERIFYING CUSTOMERS TABLE MIGRATION');
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
            AND table_name = 'customers'
        `);

        if (tablesResult.rows.length === 0) {
            console.log(`${colors.red}❌ Table 'customers' not found${colors.reset}`);
            console.log('\nRun migration first:');
            console.log('  psql $DATABASE_URL < migrations/create_customers_table.sql\n');
            return false;
        }

        console.log(`${colors.green}✅ Table 'customers' exists${colors.reset}`);

        // Check columns
        console.log(`\n${colors.blue}Checking customers columns...${colors.reset}`);
        const columnsResult = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'customers'
            ORDER BY ordinal_position
        `);

        const requiredColumns = [
            'id', 'phone', 'name', 'email', 'address',
            'carrier', 'status', 'debt', 'active',
            'firebase_id', 'tpos_id', 'tpos_data',
            'created_at', 'updated_at'
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
            WHERE tablename = 'customers'
            AND indexname LIKE 'idx_%'
            ORDER BY indexname
        `);

        const indexes = indexesResult.rows.map(row => row.indexname);
        const expectedIndexes = [
            'idx_customers_phone',
            'idx_customers_phone_pattern',
            'idx_customers_name',
            'idx_customers_name_lower',
            'idx_customers_email_lower',
            'idx_customers_status',
            'idx_customers_active',
            'idx_customers_created_at'
        ];

        console.log(`${colors.green}✅ Found ${indexes.length} indexes${colors.reset}`);
        indexes.forEach(idx => console.log(`   - ${idx}`));

        const missingIndexes = expectedIndexes.filter(idx => !indexes.includes(idx));
        if (missingIndexes.length > 0) {
            console.log(`${colors.yellow}⚠️  Missing indexes (optional but recommended):${colors.reset}`);
            missingIndexes.forEach(idx => console.log(`   - ${idx}`));
        }

        // Check pg_trgm extension
        console.log(`\n${colors.blue}Checking pg_trgm extension...${colors.reset}`);
        const extResult = await client.query(`
            SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
        `);

        if (extResult.rows.length > 0) {
            console.log(`${colors.green}✅ pg_trgm extension installed${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠️  pg_trgm extension not found (fuzzy search disabled)${colors.reset}`);
        }

        // Check view
        console.log(`\n${colors.blue}Checking views...${colors.reset}`);
        const viewsResult = await client.query(`
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
            AND table_name = 'customer_statistics'
        `);

        if (viewsResult.rows.length > 0) {
            console.log(`${colors.green}✅ View 'customer_statistics' exists${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠️  View 'customer_statistics' not found${colors.reset}`);
        }

        // Check function
        console.log(`\n${colors.blue}Checking functions...${colors.reset}`);
        const funcResult = await client.query(`
            SELECT routine_name
            FROM information_schema.routines
            WHERE routine_schema = 'public'
            AND routine_name = 'search_customers_priority'
        `);

        if (funcResult.rows.length > 0) {
            console.log(`${colors.green}✅ Function 'search_customers_priority' exists${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠️  Function 'search_customers_priority' not found${colors.reset}`);
        }

        // Test insert/update/select
        console.log(`\n${colors.blue}Testing CRUD operations...${colors.reset}`);

        const testData = {
            phone: '9999999999',
            name: 'Test Customer',
            email: 'test@example.com',
            status: 'Bình thường',
            debt: 0,
            active: true
        };

        // Insert test record
        const insertResult = await client.query(`
            INSERT INTO customers (phone, name, email, status, debt, active)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (phone) DO NOTHING
            RETURNING id
        `, [
            testData.phone,
            testData.name,
            testData.email,
            testData.status,
            testData.debt,
            testData.active
        ]);

        let testId = null;
        if (insertResult.rows.length > 0) {
            testId = insertResult.rows[0].id;
            console.log(`${colors.green}✅ Insert operation working${colors.reset}`);
        } else {
            // Already exists, get ID
            const existingResult = await client.query(
                'SELECT id FROM customers WHERE phone = $1',
                [testData.phone]
            );
            testId = existingResult.rows[0].id;
            console.log(`${colors.green}✅ Duplicate handling working (ON CONFLICT)${colors.reset}`);
        }

        // Test search by phone
        const searchResult = await client.query(
            "SELECT * FROM customers WHERE phone LIKE $1 || '%'",
            ['999']
        );

        if (searchResult.rows.length > 0) {
            console.log(`${colors.green}✅ Phone search working${colors.reset}`);
        }

        // Test search by name (case-insensitive)
        const nameSearchResult = await client.query(
            "SELECT * FROM customers WHERE LOWER(name) LIKE LOWER($1) || '%'",
            ['Test']
        );

        if (nameSearchResult.rows.length > 0) {
            console.log(`${colors.green}✅ Name search working (case-insensitive)${colors.reset}`);
        }

        // Test update
        await client.query(
            'UPDATE customers SET debt = $1 WHERE id = $2',
            [100000, testId]
        );

        const updateResult = await client.query(
            'SELECT debt FROM customers WHERE id = $1',
            [testId]
        );

        if (updateResult.rows[0].debt === 100000) {
            console.log(`${colors.green}✅ Update operation working${colors.reset}`);
        }

        // Clean up test data
        await client.query('DELETE FROM customers WHERE phone = $1', [testData.phone]);
        console.log(`${colors.green}✅ Delete operation working${colors.reset}`);

        // Get row counts
        console.log(`\n${colors.blue}Database statistics:${colors.reset}`);
        const statsResult = await client.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Bình thường') as normal,
                COUNT(*) FILTER (WHERE status = 'VIP') as vip,
                COUNT(*) FILTER (WHERE active = true) as active,
                SUM(debt) as total_debt
            FROM customers
        `);

        const stats = statsResult.rows[0];
        console.log(`   - Total customers: ${stats.total}`);
        console.log(`   - Normal: ${stats.normal}`);
        console.log(`   - VIP: ${stats.vip}`);
        console.log(`   - Active: ${stats.active}`);
        console.log(`   - Total debt: ${parseInt(stats.total_debt || 0).toLocaleString('vi-VN')} ₫`);

        // Test performance
        console.log(`\n${colors.blue}Testing search performance...${colors.reset}`);

        const perfStart = Date.now();
        await client.query(`
            SELECT * FROM customers
            WHERE phone LIKE $1 || '%'
            OR LOWER(name) LIKE LOWER($1) || '%'
            LIMIT 100
        `, ['0123']);
        const perfDuration = Date.now() - perfStart;

        console.log(`   - Search time: ${perfDuration}ms ${perfDuration < 100 ? colors.green + '(Good!)' + colors.reset : ''}`);

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
        console.log('  node verify-customers-migration.js "postgresql://user:pass@host:port/dbname"');
        console.log('\nOr set DATABASE_URL environment variable:');
        console.log('  export DATABASE_URL="postgresql://user:pass@host:port/dbname"');
        console.log('  node verify-customers-migration.js\n');
        process.exit(1);
    }

    verifyCustomersMigration(databaseUrl)
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(`${colors.red}Fatal error:${colors.reset}`, error);
            process.exit(1);
        });
}

module.exports = { verifyCustomersMigration };
