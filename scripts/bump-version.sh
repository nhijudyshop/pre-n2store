#!/bin/bash
# =====================================================
# VERSION BUMP SCRIPT
# Usage: ./scripts/bump-version.sh
# =====================================================

echo "🔢 Incrementing version..."

# Run the Node.js version increment script
node scripts/increment-version.js

if [ $? -eq 0 ]; then
    echo "✅ Version bumped successfully!"
    echo ""
    echo "ℹ️  version.js has been updated and staged."
    echo "ℹ️  Continue with your commit."
else
    echo "❌ Failed to increment version"
    exit 1
fi
