#!/usr/bin/env node
// =====================================================
// VERSION INCREMENT SCRIPT
// Auto-increment build number before commit
// =====================================================

const fs = require('fs');
const path = require('path');

const navigationFilePath = path.join(__dirname, '../shared/js/navigation-modern.js');

// Read navigation-modern.js
const content = fs.readFileSync(navigationFilePath, 'utf8');

// Extract current build number from window.APP_VERSION
const buildMatch = content.match(/window\.APP_VERSION\s*=\s*\{[^}]*build:\s*(\d+)/);
if (!buildMatch) {
    console.error('❌ Could not find build number in navigation-modern.js');
    process.exit(1);
}

const currentBuild = parseInt(buildMatch[1]);
const newBuild = currentBuild + 1;

// Get git branch name
const { execSync } = require('child_process');
let branch = 'main';
try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
    console.warn('⚠️ Could not get git branch name');
}

const timestamp = new Date().toISOString();

// Generate new APP_VERSION block
const newVersionBlock = `window.APP_VERSION = {
    version: '1.0.0',
    build: ${newBuild},
    timestamp: '${timestamp}',
    branch: '${branch}'
};`;

// Replace the APP_VERSION block in navigation-modern.js
const newContent = content.replace(
    /window\.APP_VERSION\s*=\s*\{[^}]*\};/,
    newVersionBlock
);

// Write updated navigation-modern.js
fs.writeFileSync(navigationFilePath, newContent, 'utf8');

console.log(`✅ Version incremented: build ${currentBuild} → ${newBuild}`);
console.log(`📅 Timestamp: ${timestamp}`);
console.log(`🌿 Branch: ${branch}`);

// Stage the navigation file for commit
try {
    execSync('git add js/navigation-modern.js', { stdio: 'inherit' });
    console.log('✅ navigation-modern.js staged for commit');
} catch (e) {
    console.warn('⚠️ Could not stage navigation-modern.js');
}
