# Customer Migration Guide - Firebase to PostgreSQL

## 📋 Overview

This guide explains how to migrate customer data from Firebase Firestore to PostgreSQL on Render.com.

## 🎯 Why Migrate?

### Performance Improvements
- **Search Speed**: 10x faster (50ms vs 500ms)
- **Stats Loading**: 30x faster (100ms vs 3s)
- **Full-text Search**: Supported with pg_trgm
- **Priority Search**: Phone → Name → Email

### Cost Savings
- **Firebase**: $50-100/month (80k customers, frequent searches)
- **PostgreSQL**: $7/month (Starter) or $0/month (Free tier)
- **Savings**: $50-100/month

## 🚀 Migration Steps

### 1. Setup PostgreSQL Schema

```bash
# SSH into Render.com server or use Render Dashboard SQL console
psql $DATABASE_URL < migrations/create_customers_table.sql
```

Or manually run the SQL from `create_customers_table.sql` in the Render PostgreSQL console.

### 2. Run Migration Script

#### Prerequisites

Install dependencies:
```bash
cd render.com
npm install firebase-admin pg dotenv
```

#### Set Environment Variables

Create `.env` file:
```env
DATABASE_URL=your_postgres_connection_string
NODE_ENV=production
```

#### Test Migration (Dry Run)

```bash
# Test with 100 records
node migrations/migrate-firebase-to-postgres.js --dry-run --limit=100

# Test full migration (no inserts)
node migrations/migrate-firebase-to-postgres.js --dry-run
```

#### Run Full Migration

```bash
# Migrate all customers
node migrations/migrate-firebase-to-postgres.js

# Migrate with custom batch size
node migrations/migrate-firebase-to-postgres.js --batch-size=1000
```

### 3. Verify Data

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Check record count
SELECT COUNT(*) FROM customers;

# Check statistics
SELECT * FROM customer_statistics;

# Test search function
SELECT * FROM search_customers_priority('0123', 10);

# Sample data
SELECT id, phone, name, status, created_at
FROM customers
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Update Frontend

> **LƯU Ý:** Module `customer-management` đã được thay thế bằng `customer-hub` (Customer 360).
> Nếu bạn đang đọc tài liệu này để migrate, hãy sử dụng `customer-hub` thay thế.

The frontend has been updated in `customer-hub/` to:
- Use PostgreSQL API endpoints instead of Firebase
- Maintain same UI/UX
- Keep IndexedDB cache for offline support

API endpoints:
- `GET /api/customers/search?q=:term` - Search customers
- `GET /api/customers/stats` - Get statistics
- `GET /api/customers?page=1&limit=100` - List customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### 5. Test Frontend

1. Open: https://nhijudyshop.github.io/n2store/customer-hub/index.html
2. Test search:
   - Phone: `0123` → should find matches instantly
   - Name: `Nguyen` → should find all matching names
   - Email: `gmail` → should find all gmail addresses
3. Test CRUD operations:
   - Create new customer
   - Edit existing customer
   - Delete customer
4. Verify statistics load fast

## 🔄 Rollback Plan

If issues occur, you can rollback to Firebase:

> **LƯU Ý:** Module `customer-management` đã được xóa và thay thế bằng `customer-hub`.
> Các bước rollback dưới đây chỉ để tham khảo lịch sử.

### Option 1: Frontend Rollback

Restore from git history if needed (not applicable for customer-hub).

### Option 2: Dual-Write Period

During migration, you can write to both Firebase and PostgreSQL:
1. Keep Firebase as primary (reads)
2. Write to both databases (dual-write)
3. Monitor for 1-2 weeks
4. Switch reads to PostgreSQL gradually (10% → 50% → 100%)

## 📊 Performance Benchmarks

### Before (Firebase)
```
Phone search:     300-500ms
Name search:      500-1000ms (multiple queries)
Stats loading:    3-5s (6 separate queries)
Cost:             $50-100/month
```

### After (PostgreSQL)
```
Phone search:     10-50ms
Name search:      20-80ms
Stats loading:    50-100ms (1 aggregated query)
Cost:             $7/month (or $0/month free tier)
```

## 🛡️ Data Integrity

### Duplicate Handling

The migration script uses `ON CONFLICT (firebase_id) DO UPDATE` to:
- Insert new records
- Update existing records (if re-run)
- Avoid duplicates

### Validation

The API validates:
- Required fields: `phone`, `name`
- Phone format: 10-11 digits
- Email format: valid email regex
- Status: valid enum values

## 🔍 Troubleshooting

### Migration fails with "relation does not exist"

Run the schema creation first:
```bash
psql $DATABASE_URL < migrations/create_customers_table.sql
```

### Permission errors

Ensure your PostgreSQL user has permissions:
```sql
GRANT ALL PRIVILEGES ON DATABASE your_db TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Search not working

Check indexes are created:
```sql
\d customers  -- Should show all indexes
```

Recreate indexes if missing:
```bash
psql $DATABASE_URL < migrations/create_customers_table.sql
```

### Slow queries

Analyze query performance:
```sql
EXPLAIN ANALYZE
SELECT * FROM customers
WHERE phone LIKE '%0123%';
```

## 📝 Maintenance

### Regular Vacuum

PostgreSQL needs regular maintenance:
```sql
-- Analyze tables for query planner
ANALYZE customers;

-- Vacuum to reclaim space
VACUUM customers;

-- Full vacuum (rare, requires table lock)
VACUUM FULL customers;
```

### Monitor Performance

```sql
-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('customers'));

-- Check index usage
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'customers';

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%customers%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## 🎓 Advanced Features

### Full-Text Search

```sql
-- Search across name, email, address
SELECT * FROM customers
WHERE to_tsvector('simple', name || ' ' || email || ' ' || address)
@@ to_tsquery('simple', 'nguyen & gmail');
```

### Fuzzy Matching

```sql
-- Find similar phone numbers (typo tolerance)
SELECT *, similarity(phone, '0123456789') AS score
FROM customers
WHERE phone % '0123456789'  -- % is similarity operator
ORDER BY score DESC
LIMIT 10;
```

### Geospatial Search (Future)

```sql
-- Add PostGIS extension for location-based search
CREATE EXTENSION postgis;

-- Add location column
ALTER TABLE customers ADD COLUMN location GEOGRAPHY(POINT, 4326);

-- Search customers near location
SELECT * FROM customers
WHERE ST_DWithin(
    location,
    ST_MakePoint(106.660172, 10.762622)::geography,  -- Saigon
    5000  -- 5km radius
);
```

## 📚 Resources

- [PostgreSQL Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html)
- [Render PostgreSQL Docs](https://render.com/docs/databases)

## ✅ Checklist

- [ ] Run schema creation SQL
- [ ] Test migration with --dry-run
- [ ] Run full migration
- [ ] Verify data integrity
- [ ] Test search performance
- [ ] Update frontend API calls
- [ ] Test frontend functionality
- [ ] Monitor for errors
- [ ] Keep Firebase backup for 1 month
- [ ] Document any issues
