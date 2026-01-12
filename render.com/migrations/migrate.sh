#!/bin/bash

# =====================================================
# SEPAY BALANCE HISTORY - DATABASE MIGRATION SCRIPT
# Tự động chạy migration cho PostgreSQL database
# =====================================================

set -e  # Exit on error

echo "======================================================"
echo "🗄️  SEPAY BALANCE HISTORY - DATABASE MIGRATION"
echo "======================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if database URL is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Database URL not provided${NC}"
    echo ""
    echo "Usage:"
    echo "  ./render.com/migrations/migrate.sh \"postgresql://user:pass@host:port/dbname\""
    echo ""
    echo "Or set DATABASE_URL environment variable:"
    echo "  export DATABASE_URL=\"postgresql://user:pass@host:port/dbname\""
    echo "  ./render.com/migrations/migrate.sh"
    echo ""
    exit 1
fi

DATABASE_URL="$1"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed${NC}"
    echo ""
    echo "Install PostgreSQL client:"
    echo "  macOS:   brew install postgresql"
    echo "  Ubuntu:  sudo apt-get install postgresql-client"
    echo "  Windows: Download from https://www.postgresql.org/download/windows/"
    echo ""
    exit 1
fi

echo -e "${BLUE}📍 Database URL: ${DATABASE_URL:0:30}...${NC}"
echo ""

# Test connection
echo -e "${YELLOW}🔍 Testing database connection...${NC}"
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Connection successful${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo ""
    echo "Please check your database URL and network connection."
    exit 1
fi

echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MIGRATION_FILES=(
    "$SCRIPT_DIR/create_balance_history.sql"
    "$SCRIPT_DIR/create_customer_info.sql"
)

# Check if migration files exist
for MIGRATION_FILE in "${MIGRATION_FILES[@]}"; do
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${RED}❌ Error: Migration file not found: $MIGRATION_FILE${NC}"
        exit 1
    fi
done

# Run migrations
echo -e "${YELLOW}🚀 Running migrations...${NC}"
echo ""

for MIGRATION_FILE in "${MIGRATION_FILES[@]}"; do
    echo -e "${BLUE}   Applying: $(basename $MIGRATION_FILE)${NC}"

    if psql "$DATABASE_URL" -f "$MIGRATION_FILE"; then
        echo -e "${GREEN}   ✅ Success${NC}"
    else
        echo ""
        echo -e "${RED}❌ Migration failed: $(basename $MIGRATION_FILE)${NC}"
        exit 1
    fi
    echo ""
done

echo -e "${GREEN}✅ All migrations completed successfully!${NC}"

echo ""
echo "======================================================"
echo -e "${YELLOW}🔍 Verifying migration...${NC}"
echo "======================================================"
echo ""

# Verify tables
echo -e "${BLUE}Checking tables...${NC}"
TABLES=$(psql "$DATABASE_URL" -t -c "\dt" | grep -E "balance_history|sepay_webhook_logs|balance_customer_info" | wc -l)

if [ "$TABLES" -ge 3 ]; then
    echo -e "${GREEN}✅ Tables created:${NC}"
    psql "$DATABASE_URL" -c "\dt balance_history"
    psql "$DATABASE_URL" -c "\dt sepay_webhook_logs"
    psql "$DATABASE_URL" -c "\dt balance_customer_info"
else
    echo -e "${RED}❌ Tables not found (expected 3, found ${TABLES})${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Checking views...${NC}"
VIEWS=$(psql "$DATABASE_URL" -t -c "\dv" | grep "balance_statistics" | wc -l)

if [ "$VIEWS" -ge 1 ]; then
    echo -e "${GREEN}✅ View created:${NC}"
    psql "$DATABASE_URL" -c "\dv balance_statistics"
else
    echo -e "${RED}❌ View not found${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Checking indexes...${NC}"
INDEXES=$(psql "$DATABASE_URL" -t -c "\di" | grep -E "idx_balance_history|idx_webhook_logs" | wc -l)

if [ "$INDEXES" -ge 5 ]; then
    echo -e "${GREEN}✅ Indexes created (${INDEXES} found)${NC}"
else
    echo -e "${YELLOW}⚠️  Expected more indexes (found ${INDEXES})${NC}"
fi

echo ""
echo "======================================================"
echo -e "${GREEN}✅ MIGRATION COMPLETE!${NC}"
echo "======================================================"
echo ""
echo "Next steps:"
echo "  1. Configure Sepay webhook in dashboard"
echo "  2. Add SEPAY_API_KEY to Render environment variables"
echo "  3. Test webhook endpoint"
echo ""
echo "Test webhook:"
echo "  curl -X POST https://your-worker.workers.dev/api/sepay/webhook \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -H \"Authorization: Apikey YOUR_API_KEY\" \\"
echo "    -d '{\"id\": 12345, \"gateway\": \"Test\", ...}'"
echo ""
