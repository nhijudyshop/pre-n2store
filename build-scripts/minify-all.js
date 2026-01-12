#!/usr/bin/env node

/**
 * MINIFICATION SCRIPT
 * Minify all JS, CSS, and HTML files
 */

const fs = require('fs');
const path = require('path');

console.log('🔨 N2Store Build Script - Minification');
console.log('=' .repeat(60));

// Check if dependencies are installed
try {
    require('terser');
    require('clean-css');
    require('html-minifier-terser');
} catch (error) {
    console.error('❌ Error: Required dependencies not installed!');
    console.error('Please run: npm install');
    process.exit(1);
}

const { minify } = require('terser');
const CleanCSS = require('clean-css');
const { minify: minifyHTML } = require('html-minifier-terser');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const SKIP_DIRS = ['node_modules', '.git', 'build-scripts', 'api', 'dist', 'build'];
const SKIP_FILES = ['.min.js', '.min.css', '.min.html'];

let stats = {
    js: { count: 0, originalSize: 0, minifiedSize: 0 },
    css: { count: 0, originalSize: 0, minifiedSize: 0 },
    html: { count: 0, originalSize: 0, minifiedSize: 0 }
};

// Helper: Check if file should be skipped
function shouldSkip(filePath) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    return SKIP_DIRS.some(dir => relativePath.startsWith(dir)) ||
           SKIP_FILES.some(ext => filePath.endsWith(ext));
}

// Helper: Get file size in KB
function getFileSizeKB(filePath) {
    const sizeBytes = fs.statSync(filePath).size;
    return (sizeBytes / 1024).toFixed(2);
}

// Minify JavaScript file
async function minifyJS(filePath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const originalSize = Buffer.byteLength(code);

        const result = await minify(code, {
            compress: {
                dead_code: true,
                drop_console: false, // Keep console for logger
                drop_debugger: true,
                unused: true
            },
            mangle: false, // Don't mangle names (safer for Firebase)
            format: {
                comments: /^\/*!|@preserve|@license|@cc_on/i
            }
        });

        if (result.code) {
            const minifiedSize = Buffer.byteLength(result.code);
            const outputPath = filePath.replace(/\.js$/, '.min.js');

            fs.writeFileSync(outputPath, result.code);

            stats.js.count++;
            stats.js.originalSize += originalSize;
            stats.js.minifiedSize += minifiedSize;

            const saved = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
            console.log(`  ✅ ${path.relative(ROOT_DIR, filePath)} (-${saved}%)`);
        }
    } catch (error) {
        console.error(`  ❌ ${path.relative(ROOT_DIR, filePath)}: ${error.message}`);
    }
}

// Minify CSS file
function minifyCSS(filePath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const originalSize = Buffer.byteLength(code);

        const result = new CleanCSS({
            level: 2,
            compatibility: 'ie11'
        }).minify(code);

        if (!result.errors.length) {
            const minifiedSize = Buffer.byteLength(result.styles);
            const outputPath = filePath.replace(/\.css$/, '.min.css');

            fs.writeFileSync(outputPath, result.styles);

            stats.css.count++;
            stats.css.originalSize += originalSize;
            stats.css.minifiedSize += minifiedSize;

            const saved = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
            console.log(`  ✅ ${path.relative(ROOT_DIR, filePath)} (-${saved}%)`);
        } else {
            console.error(`  ❌ ${path.relative(ROOT_DIR, filePath)}: ${result.errors.join(', ')}`);
        }
    } catch (error) {
        console.error(`  ❌ ${path.relative(ROOT_DIR, filePath)}: ${error.message}`);
    }
}

// Minify HTML file
async function minifyHTMLFile(filePath) {
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const originalSize = Buffer.byteLength(code);

        const result = await minifyHTML(code, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            minifyCSS: true,
            minifyJS: true
        });

        const minifiedSize = Buffer.byteLength(result);
        const outputPath = filePath.replace(/\.html$/, '.min.html');

        fs.writeFileSync(outputPath, result);

        stats.html.count++;
        stats.html.originalSize += originalSize;
        stats.html.minifiedSize += minifiedSize;

        const saved = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        console.log(`  ✅ ${path.relative(ROOT_DIR, filePath)} (-${saved}%)`);
    } catch (error) {
        console.error(`  ❌ ${path.relative(ROOT_DIR, filePath)}: ${error.message}`);
    }
}

// Walk directory recursively
function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);

        if (shouldSkip(filePath)) {
            return;
        }

        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDir(filePath, callback);
        } else {
            callback(filePath);
        }
    });
}

// Main function
async function main() {
    console.log('\n📦 Minifying JavaScript files...');
    const jsFiles = [];
    walkDir(ROOT_DIR, (filePath) => {
        if (filePath.endsWith('.js') && !filePath.endsWith('.min.js')) {
            jsFiles.push(filePath);
        }
    });
    for (const file of jsFiles) {
        await minifyJS(file);
    }

    console.log('\n🎨 Minifying CSS files...');
    walkDir(ROOT_DIR, (filePath) => {
        if (filePath.endsWith('.css') && !filePath.endsWith('.min.css')) {
            minifyCSS(filePath);
        }
    });

    console.log('\n📄 Minifying HTML files...');
    const htmlFiles = [];
    walkDir(ROOT_DIR, (filePath) => {
        if (filePath.endsWith('.html') && !filePath.endsWith('.min.html')) {
            htmlFiles.push(filePath);
        }
    });
    for (const file of htmlFiles) {
        await minifyHTMLFile(file);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MINIFICATION SUMMARY');
    console.log('='.repeat(60));

    const totalOriginal = stats.js.originalSize + stats.css.originalSize + stats.html.originalSize;
    const totalMinified = stats.js.minifiedSize + stats.css.minifiedSize + stats.html.minifiedSize;
    const totalSaved = totalOriginal - totalMinified;
    const totalSavedPercent = ((totalSaved / totalOriginal) * 100).toFixed(1);

    console.log(`JavaScript:  ${stats.js.count} files, ${(stats.js.originalSize/1024).toFixed(2)} KB → ${(stats.js.minifiedSize/1024).toFixed(2)} KB`);
    console.log(`CSS:         ${stats.css.count} files, ${(stats.css.originalSize/1024).toFixed(2)} KB → ${(stats.css.minifiedSize/1024).toFixed(2)} KB`);
    console.log(`HTML:        ${stats.html.count} files, ${(stats.html.originalSize/1024).toFixed(2)} KB → ${(stats.html.minifiedSize/1024).toFixed(2)} KB`);
    console.log('='.repeat(60));
    console.log(`TOTAL:       ${(totalOriginal/1024).toFixed(2)} KB → ${(totalMinified/1024).toFixed(2)} KB (saved ${totalSavedPercent}%)`);
    console.log('='.repeat(60));
    console.log('✅ Minification complete!\n');
}

// Run
main().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
});
