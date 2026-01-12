# 🔄 Reusable Patterns in render.com

Tài liệu này tổng hợp các patterns đã được implement và có thể tái sử dụng cho các features mới.

## 📊 Tổng Quan

| Pattern | Source File | Reused In | Status |
|---------|-------------|-----------|--------|
| Database Connection | `server.js:42-57` | All routes | ✅ Active |
| Migration Verification | `migrations/verify-migration.js` | `verify-customers-migration.js` | ✅ Reused |
| Validation Pattern | `routes/sepay-webhook.js:64-104` | `routes/customers.js:52-106` | ✅ Reused |
| Search by Phone | `routes/sepay-webhook.js:594-688` | `routes/customers.js:115-189` | ✅ Inspired |
| ON CONFLICT Pattern | `routes/sepay-webhook.js:108-119` | `routes/customers.js:462-475` | ✅ Reused |
| Error Handling | `routes/sepay-webhook.js` | All routes | ✅ Standard |

---

## 1️⃣ Database Connection Pattern

### Source: `server.js:42-57`

```javascript
const { Pool } = require('pg');

const chatDbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Make pool available to routes
app.locals.chatDb = chatDbPool;
```

### Usage in Routes:

```javascript
router.get('/endpoint', async (req, res) => {
    const db = req.app.locals.chatDb; // ✅ Get connection

    const result = await db.query('SELECT * FROM table');

    res.json({ success: true, data: result.rows });
});
```

### ✅ Reused In:
- `routes/sepay-webhook.js:16`
- `routes/customers.js:117`
- `routes/chat-*.js`

---

## 2️⃣ Migration Verification Pattern

### Source: `migrations/verify-migration.js`

Pattern for verifying database migrations with:
- ✅ Table existence check
- ✅ Column validation
- ✅ Index verification
- ✅ CRUD operations test
- ✅ Performance test
- ✅ Colorized console output

### Template Structure:

```javascript
const { Client } = require('pg');

async function verifyMigration(databaseUrl) {
    const client = new Client({ connectionString: databaseUrl });

    try {
        await client.connect();

        // 1. Check tables
        const tablesResult = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_name IN ('table1', 'table2')
        `);

        // 2. Check columns
        const columnsResult = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'table1'
        `);

        // 3. Check indexes
        const indexesResult = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'table1'
        `);

        // 4. Test CRUD operations
        await client.query('INSERT INTO table1 ...');
        await client.query('SELECT * FROM table1 ...');
        await client.query('UPDATE table1 ...');
        await client.query('DELETE FROM table1 ...');

        // 5. Get statistics
        const statsResult = await client.query('SELECT COUNT(*) FROM table1');

        console.log('✅ VERIFICATION SUCCESSFUL!');
        return true;

    } catch (error) {
        console.error('❌ Verification failed:', error);
        return false;
    } finally {
        await client.end();
    }
}
```

### ✅ Reused In:
- `migrations/verify-customers-migration.js` - Full verification for customers table

---

## 3️⃣ Validation Pattern

### Source: `routes/sepay-webhook.js:64-104`

Comprehensive validation pattern:

```javascript
function validateData(data, requiredFields) {
    const errors = [];

    // 1. Validate data type
    if (!data || typeof data !== 'object') {
        errors.push('Invalid data type - expected JSON object');
        return errors; // Early return
    }

    // 2. Check required fields
    const missingFields = requiredFields.filter(field =>
        data[field] === undefined || data[field] === null
    );

    if (missingFields.length > 0) {
        errors.push(`Missing required fields: ${missingFields.join(', ')}`);
        return errors; // Early return
    }

    // 3. Validate field formats
    if (data.email && !emailRegex.test(data.email)) {
        errors.push('Invalid email format');
    }

    // 4. Validate enums
    const validStatuses = ['status1', 'status2'];
    if (data.status && !validStatuses.includes(data.status)) {
        errors.push(`Invalid status - must be: ${validStatuses.join(', ')}`);
    }

    return errors;
}
```

### ✅ Reused In:
- `routes/customers.js:56-106` - Customer data validation

---

## 4️⃣ Search by Phone Pattern

### Source: `routes/sepay-webhook.js:594-688`

Optimized search pattern với:
- ✅ Query parameter validation
- ✅ Limit enforcement (prevent abuse)
- ✅ LEFT JOIN for related data
- ✅ Statistics calculation
- ✅ Structured response format

```javascript
router.get('/search-by-phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, limit = 50 } = req.query;

    // 1. Validate required parameters
    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // 2. Enforce limit (prevent abuse)
        const queryLimit = Math.min(parseInt(limit) || 50, 200);

        // 3. Execute query with JOIN
        const query = `
            SELECT t1.*, t2.related_field
            FROM main_table t1
            LEFT JOIN related_table t2 ON t1.id = t2.foreign_id
            WHERE t1.phone = $1
            ORDER BY t1.created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [phone, queryLimit]);

        // 4. Calculate statistics
        const stats = {
            total: result.rows.length,
            // ... more stats
        };

        // 5. Structured response
        res.json({
            success: true,
            data: result.rows,
            statistics: stats,
            query_time_ms: Date.now() - startTime
        });

    } catch (error) {
        console.error('[SEARCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed',
            message: error.message
        });
    }
});
```

### ✅ Inspired/Adapted In:
- `routes/customers.js:115-189` - Customer search with priority

---

## 5️⃣ ON CONFLICT Pattern (Atomic Duplicate Handling)

### Source: `routes/sepay-webhook.js:108-119`

Prevents race conditions with atomic duplicate handling:

```javascript
const insertQuery = `
    INSERT INTO table_name (
        unique_field, field1, field2
    ) VALUES (
        $1, $2, $3
    )
    ON CONFLICT (unique_field) DO NOTHING
    RETURNING id
`;

const result = await db.query(insertQuery, [value1, value2, value3]);

if (result.rows.length === 0) {
    // Duplicate detected - ON CONFLICT triggered
    console.log('Duplicate ignored (atomic check)');
    return res.status(200).json({
        success: true,
        message: 'Duplicate - already processed'
    });
}

// New record inserted
const newId = result.rows[0].id;
```

### Advantages:
- ✅ **Atomic**: No race condition
- ✅ **Efficient**: Single query (vs check then insert)
- ✅ **Safe**: No duplicate errors thrown

### Alternative: DO UPDATE

```javascript
ON CONFLICT (unique_field) DO UPDATE SET
    field1 = EXCLUDED.field1,
    field2 = EXCLUDED.field2,
    updated_at = CURRENT_TIMESTAMP
```

### ✅ Reused In:
- `routes/customers.js:462-475` - Customer insert with duplicate handling
- `migrations/migrate-firebase-to-postgres.js:195` - Migration with upsert

---

## 6️⃣ Error Handling Pattern

### Standard Pattern Across All Routes:

```javascript
router.post('/endpoint', async (req, res) => {
    try {
        // Validate input
        if (!req.body.field) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field'
            });
        }

        // Process request
        const result = await doSomething();

        // Success response
        res.json({
            success: true,
            data: result,
            message: 'Operation successful'
        });

    } catch (error) {
        console.error('[ENDPOINT] Error:', error);

        // Handle specific errors
        if (error.code === '23505') { // PostgreSQL unique violation
            return res.status(409).json({
                success: false,
                error: 'Duplicate entry',
                message: error.message
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            error: 'Operation failed',
            message: error.message
        });
    }
});
```

### Response Format Standard:

```javascript
// Success response
{
    success: true,
    data: {...},           // Main data
    message: "...",        // User-friendly message (optional)
    query_time_ms: 123     // Performance metric (optional)
}

// Error response
{
    success: false,
    error: "Error title",  // Short error description
    message: "...",        // Detailed error message
    missing: [...],        // Missing fields (optional)
    code: "..."           // Error code (optional)
}
```

---

## 7️⃣ Logging Pattern

### Console Logging Standard:

```javascript
// Request received
console.log('[ENDPOINT] Received request:', {
    method: req.method,
    params: req.query,
    body: req.body
});

// Processing
console.log('[ENDPOINT] Processing:', { userId: 123 });

// Success
console.log('[ENDPOINT] ✅ Success:', { count: 10, duration: '25ms' });

// Warning
console.warn('[ENDPOINT] ⚠️  Warning:', { message: 'Cache miss' });

// Error
console.error('[ENDPOINT] ❌ Error:', error.message);
```

### Log Levels:
- `console.log` - Normal operation
- `console.warn` - Warnings (non-critical)
- `console.error` - Errors (critical)

---

## 8️⃣ Performance Measurement Pattern

```javascript
router.get('/endpoint', async (req, res) => {
    const startTime = Date.now();

    try {
        const result = await query();
        const duration = Date.now() - startTime;

        console.log(`[ENDPOINT] ✅ Completed in ${duration}ms`);

        res.json({
            success: true,
            data: result,
            query_time_ms: duration
        });
    } catch (error) {
        // ...
    }
});
```

---

## 📋 Checklist for New Features

When creating a new feature/route, follow these patterns:

- [ ] Use `req.app.locals.chatDb` for database connection
- [ ] Implement input validation (type, required fields, format)
- [ ] Use parameterized queries ($1, $2) to prevent SQL injection
- [ ] Use `ON CONFLICT` for atomic duplicate handling
- [ ] Implement proper error handling (try-catch)
- [ ] Return standardized response format (success, data, message)
- [ ] Add console logging ([FEATURE] prefix)
- [ ] Measure and log performance (query_time_ms)
- [ ] Enforce limits on query results (prevent abuse)
- [ ] Create verification script for migrations

---

## 🚀 Quick Reference

### Create New API Endpoint

```javascript
// routes/new-feature.js
const express = require('express');
const router = express.Router();

router.get('/endpoint', async (req, res) => {
    const db = req.app.locals.chatDb; // ✅ Reuse DB connection
    const { param, limit = 50 } = req.query;

    // ✅ Validate
    if (!param) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: param'
        });
    }

    try {
        const queryLimit = Math.min(parseInt(limit) || 50, 200); // ✅ Enforce limit
        const startTime = Date.now(); // ✅ Performance tracking

        // ✅ Parameterized query
        const result = await db.query(`
            SELECT * FROM table WHERE field = $1 LIMIT $2
        `, [param, queryLimit]);

        const duration = Date.now() - startTime;

        console.log('[NEW-FEATURE] ✅ Success:', { count: result.rows.length, duration: `${duration}ms` });

        // ✅ Structured response
        res.json({
            success: true,
            data: result.rows,
            query_time_ms: duration
        });

    } catch (error) {
        console.error('[NEW-FEATURE] ❌ Error:', error);
        res.status(500).json({
            success: false,
            error: 'Operation failed',
            message: error.message
        });
    }
});

module.exports = router;
```

### Add to server.js

```javascript
const newFeatureRoutes = require('./routes/new-feature');
app.use('/api/new-feature', newFeatureRoutes);
```

---

## 📚 Related Documentation

- [PostgreSQL Patterns](https://www.postgresql.org/docs/current/sql-insert.html) - ON CONFLICT
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [pg Module Docs](https://node-postgres.com/) - Node.js PostgreSQL client

---

**Last Updated**: 2025-12-06
**Maintained By**: Development Team
