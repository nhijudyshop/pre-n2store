#!/bin/bash
# =====================================================
# Migration: Add debt_added column to balance_history
# =====================================================

# Database connection
DATABASE_URL="postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat?sslmode=require"

echo "🚀 Running migration: Add debt_added column..."

psql "$DATABASE_URL" << 'EOF'
ALTER TABLE customers ADD COLUMN IF NOT EXISTS debt_adjusted_at TIMESTAMP WITH TIME ZONE;
EOF

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
