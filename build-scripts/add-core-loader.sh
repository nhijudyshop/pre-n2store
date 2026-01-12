#!/bin/bash

###
# Script: add-core-loader.sh
# Purpose: Tự động thêm core-loader.js vào tất cả HTML files
# Safe: Chỉ thêm nếu chưa có, không duplicate
###

echo "🔧 Adding core-loader.js to all HTML files..."
echo "================================================"

# Modules to update
MODULES=(
    "bangkiemhang"
    "ck"
    "hangdat"
    "hanghoan"
    "hangrotxa"
    "ib"
    "lichsuchinhsua"
    "livestream"
    "nhanhang"
    "sanphamlive"
    "tpos-import"
    "tpos-manager"
    "user-management"
)

SUCCESS=0
SKIPPED=0
FAILED=0

# Process each module
for module in "${MODULES[@]}"; do
    HTML_FILE="/home/user/n2store/$module/index.html"

    if [ ! -f "$HTML_FILE" ]; then
        echo "  ⏭️  Skip: $module (file not found)"
        ((SKIPPED++))
        continue
    fi

    # Check if already has core-loader
    if grep -q "core-loader.js" "$HTML_FILE"; then
        echo "  ✓  Skip: $module (already has core-loader)"
        ((SKIPPED++))
        continue
    fi

    # Find insertion point (after last CSS link, before first script)
    # We'll add it before the first <script> tag

    # Create backup
    cp "$HTML_FILE" "$HTML_FILE.bak"

    # Use sed to insert core-loader before first <script> tag
    sed -i '0,/<script/s|<script|<!-- N2Store Optimization: Core Utilities Loader -->\n        <script src="../js/core-loader.js"></script>\n\n        <script|' "$HTML_FILE"

    if [ $? -eq 0 ]; then
        echo "  ✅ Added: $module"
        ((SUCCESS++))
        # Remove backup
        rm "$HTML_FILE.bak"
    else
        echo "  ❌ Failed: $module"
        ((FAILED++))
        # Restore from backup
        mv "$HTML_FILE.bak" "$HTML_FILE"
    fi
done

echo ""
echo "================================================"
echo "📊 SUMMARY:"
echo "  Success: $SUCCESS"
echo "  Skipped: $SKIPPED"
echo "  Failed:  $FAILED"
echo "================================================"
echo ""

if [ $SUCCESS -gt 0 ]; then
    echo "✅ Core loader added to $SUCCESS modules"
else
    echo "⚠️  No modules were updated"
fi
