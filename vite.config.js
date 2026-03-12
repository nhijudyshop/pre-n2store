import { defineConfig } from 'vitest/config';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

// Auto-detect module entry points (directories with index.html)
// Excludes non-module directories that should never be treated as entry points
const EXCLUDED_DIRS = [
    '.git', '.github', '.kiro', '.claude',
    'node_modules', 'build-scripts', 'docs', 'AI',
    'cloudflare-worker', 'shared', 'tests', 'dist',
    'firebase-functions', 'render.com', 'scripts'
];

function getModuleEntries() {
    const entries = {};
    const dirs = readdirSync('.', { withFileTypes: true });

    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        if (EXCLUDED_DIRS.includes(dir.name)) continue;
        if (dir.name.startsWith('.')) continue;

        const indexPath = resolve(dir.name, 'index.html');
        if (existsSync(indexPath)) {
            entries[dir.name] = indexPath;
        }
    }

    return entries;
}

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                ...getModuleEntries()
            }
            // Note: manualChunks removed because shared/js/ files use script tags
            // (window globals), not ES module exports. Bundling them as chunks
            // would produce empty or broken output. Tree-shaking handles the rest.
        },
        outDir: 'dist',
        sourcemap: process.env.NODE_ENV === 'development',
        target: 'es2020',
        emptyOutDir: true
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
        coverage: {
            provider: 'v8',
            include: ['shared/js/**', 'shared/browser/**', 'shared/universal/**'],
            exclude: ['**/node_modules/**', '**/tests/**'],
            thresholds: {
                lines: 60,
                branches: 60,
                functions: 60,
                statements: 60
            }
        }
    }
});
