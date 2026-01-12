#!/bin/bash

# ============================================
# Firebase Functions Deployment Script
# ============================================

set -e  # Exit on error

echo "🚀 Firebase Functions Deployment Script"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found!${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found!${NC}"
    exit 1
fi
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm found: $NPM_VERSION${NC}"
echo ""

# Check Firebase CLI
echo "🔥 Checking Firebase CLI..."
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found!${NC}"
    echo "Installing Firebase CLI..."
    npm install -g firebase-tools
    echo -e "${GREEN}✅ Firebase CLI installed${NC}"
else
    FIREBASE_VERSION=$(firebase --version)
    echo -e "${GREEN}✅ Firebase CLI found: $FIREBASE_VERSION${NC}"
fi
echo ""

# Check Firebase login
echo "🔐 Checking Firebase authentication..."
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Firebase${NC}"
    echo "Running: firebase login"
    firebase login
else
    echo -e "${GREEN}✅ Already logged in to Firebase${NC}"
fi
echo ""

# Navigate to functions directory
echo "📁 Navigating to functions directory..."
cd functions

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi
echo ""

# Go back to root
cd ..

# Ask user to confirm
echo ""
echo -e "${YELLOW}Ready to deploy to Firebase project: n2shop-69e37${NC}"
echo ""
echo "Functions to be deployed:"
echo "  • cleanupOldTagUpdates (Scheduled)"
echo "  • manualCleanupTagUpdates (HTTP)"
echo "  • getCleanupStats (HTTP)"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Deploy
echo ""
echo "🚀 Deploying functions..."
firebase deploy --only functions

# Check deployment status
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "📋 Next steps:"
    echo "  1. View logs: firebase functions:log"
    echo "  2. Monitor: https://console.firebase.google.com/project/n2shop-69e37/functions"
    echo "  3. Test cleanup stats:"
    echo "     curl https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats"
    echo ""
    echo "⏰ Scheduled cleanup will run daily at 2:00 AM (Vietnam time)"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. Make sure you're on Blaze plan (pay-as-you-go)"
    echo "  2. Check billing account is configured"
    echo "  3. Verify you have Editor/Owner role on project"
    echo ""
    echo "For detailed troubleshooting, see DEPLOYMENT_GUIDE.md"
    exit 1
fi
