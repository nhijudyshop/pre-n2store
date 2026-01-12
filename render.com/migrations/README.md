# Database Migration Scripts

Tự động chạy migration và verify database cho Sepay Balance History.

## Prerequisites

### Bash Script (`migrate.sh`)
Requires:
- PostgreSQL client (`psql`)
- Bash shell

**Install psql:**
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Windows
# Download from https://www.postgresql.org/download/windows/
```

### Node.js Script (`verify-migration.js`)
Requires:
- Node.js >= 14
- `pg` package

**Install dependencies:**
```bash
cd render.com/migrations
npm install pg
```

Or add to your `render.com/package.json`:
```json
{
  "dependencies": {
    "pg": "^8.11.0"
  }
}
```

## Usage

### Option 1: Bash Script (Recommended)

**Run migration:**
```bash
# With database URL as argument
./render.com/migrations/migrate.sh "postgresql://user:pass@host:port/dbname"

# Or using environment variable
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
./render.com/migrations/migrate.sh "$DATABASE_URL"
```

**Features:**
✅ Connection test before migration
✅ Run SQL migration file
✅ Automatic verification after migration
✅ Color-coded output
✅ Error handling

### Option 2: Node.js Verification Script

**Verify existing migration:**
```bash
# With database URL as argument
node render.com/migrations/verify-migration.js "postgresql://user:pass@host:port/dbname"

# Or using environment variable
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
node render.com/migrations/verify-migration.js
```

**What it checks:**
✅ Database connection
✅ Tables existence (balance_history, sepay_webhook_logs)
✅ Required columns
✅ Indexes
✅ Views (balance_statistics)
✅ Insert/Select operations
✅ Database statistics

## Examples

### Complete Migration Workflow

```bash
# 1. Get database URL from Render.com
# Render Dashboard → PostgreSQL → External Database URL

# 2. Set environment variable (optional)
export DATABASE_URL="postgresql://n2store_user:abc123@dpg-xyz.oregon-postgres.render.com:5432/n2store_db"

# 3. Run migration
./render.com/migrations/migrate.sh "$DATABASE_URL"

# 4. Verify (optional - migrate.sh already verifies)
node render.com/migrations/verify-migration.js "$DATABASE_URL"
```

### Quick Test

```bash
# One-liner migration
./render.com/migrations/migrate.sh "$(grep DATABASE_URL .env | cut -d '=' -f2)"
```

## Troubleshooting

### Error: `psql: command not found`
Install PostgreSQL client (see Prerequisites above)

### Error: `Connection failed`
- Check database URL is correct
- Check network connection
- Verify database is running
- Check firewall/security groups

### Error: `Migration failed`
- Check if tables already exist (migration is idempotent, should be safe to re-run)
- Check database permissions
- View detailed error message in output

### Error: `Cannot find module 'pg'`
```bash
cd render.com/migrations
npm install pg
```

## Output Examples

### Successful Migration
```
======================================================
🗄️  SEPAY BALANCE HISTORY - DATABASE MIGRATION
======================================================

📍 Database URL: postgresql://user:pass@...

🔍 Testing database connection...
✅ Connection successful

🚀 Running migration...
   File: /path/to/create_balance_history.sql

✅ Migration completed successfully!

======================================================
🔍 Verifying migration...
======================================================

Checking tables...
✅ Tables created:
   - balance_history
   - sepay_webhook_logs

Checking views...
✅ View created:
   - balance_statistics

Checking indexes...
✅ Indexes created (7 found)

======================================================
✅ MIGRATION COMPLETE!
======================================================
```

## Files

- `create_balance_history.sql` - Main migration file
- `migrate.sh` - Bash migration script
- `verify-migration.js` - Node.js verification script
- `README.md` - This file

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Database Migration

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install PostgreSQL client
        run: sudo apt-get install postgresql-client

      - name: Run migration
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: ./render.com/migrations/migrate.sh "$DATABASE_URL"
```

### Render.com Build Command

Add to your `render.yaml`:
```yaml
services:
  - type: web
    name: n2store-api
    env: node
    buildCommand: |
      npm install
      psql $DATABASE_URL -f render.com/migrations/create_balance_history.sql
    startCommand: node render.com/server.js
```

## Safety

✅ Scripts are **idempotent** - safe to run multiple times
✅ Uses `IF NOT EXISTS` clauses
✅ No data deletion (only creates tables/indexes)
✅ Transaction-safe (migrations in single transaction)

## Support

For issues or questions, check:
- Main README: `balance-history/README.md`
- Sepay docs: https://docs.sepay.vn/
