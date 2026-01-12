/**
 * PostgreSQL Connection Pool
 * Singleton pattern - returns same pool instance
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        pool.on('error', (err) => {
            console.error('[DB POOL] Unexpected error:', err);
        });

        console.log('[DB POOL] PostgreSQL pool initialized');
    }
    return pool;
}

// Export as singleton
module.exports = getPool();
