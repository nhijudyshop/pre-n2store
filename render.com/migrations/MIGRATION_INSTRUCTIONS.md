# Database Migration Instructions

## New Feature: Customer Info Storage

This migration adds support for storing customer information (name and phone number) in the database, associated with transaction unique codes.

## Migration Steps

### Option 1: Automatic Migration (Recommended)

Run the migration script:

```bash
cd render.com/migrations
./migrate.sh
```

The script will:
1. Apply `create_balance_history.sql` (if not already applied)
2. Apply `create_customer_info.sql` (new table)

### Option 2: Manual Migration

If you prefer to run the SQL manually:

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Run the customer info migration
\i render.com/migrations/create_customer_info.sql

# Verify the table was created
\dt balance_customer_info
```

## Database Schema

### New Table: `balance_customer_info`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| unique_code | VARCHAR(50) | Transaction unique code (e.g., N2ABC123) - UNIQUE |
| customer_name | VARCHAR(255) | Customer name (optional) |
| customer_phone | VARCHAR(50) | Customer phone number (optional) |
| created_at | TIMESTAMP | Record creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp (auto-updated) |

### Indexes

- `idx_customer_info_unique_code` on `unique_code` for fast lookups

## API Endpoints

### Save/Update Customer Info

```
POST /api/sepay/customer-info
Content-Type: application/json

{
  "uniqueCode": "N2ABC123",
  "customerName": "Nguyen Van A",
  "customerPhone": "0123456789"
}
```

### Get Customer Info by Code

```
GET /api/sepay/customer-info/N2ABC123
```

### Get All Customer Info

```
GET /api/sepay/customer-info
```

## Frontend Changes

The frontend now:
1. Loads customer info from the database on page load
2. Saves customer info to both localStorage (for offline support) and database
3. Syncs data between localStorage and database

## Rollback

To rollback this migration:

```sql
DROP TABLE IF EXISTS balance_customer_info;
```

**Note:** This will permanently delete all customer information stored in the database.
