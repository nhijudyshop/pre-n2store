#!/usr/bin/env node

/**
 * =====================================================
 * FIREBASE TO POSTGRESQL MIGRATION SCRIPT
 * Migrate customers from Firebase Firestore to PostgreSQL
 * =====================================================
 *
 * Usage:
 *   node migrate-firebase-to-postgres.js [--dry-run] [--batch-size=500]
 *
 * Options:
 *   --dry-run       Test run without actually inserting data
 *   --batch-size    Number of records per batch (default: 500)
 *   --limit         Limit total records to migrate (for testing)
 *
 * Environment Variables:
 *   DATABASE_URL    PostgreSQL connection string (required)
 *   FIREBASE_*      Firebase config (see code below)
 */

require('dotenv').config();
const { Pool } = require('pg');

// =====================================================
// CONFIGURATION
// =====================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const limitArg = args.find(arg => arg.startsWith('--limit='));

const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 500;
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Firebase Admin SDK
const admin = require('firebase-admin');

// Firebase config (from your firebase-config.js)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase Admin (server-side)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: FIREBASE_CONFIG.projectId,
            // Note: For local development, use service account key
            // For production, use environment variables or default credentials
        }),
        projectId: FIREBASE_CONFIG.projectId
    });
}

const db = admin.firestore();
const customersCollection = db.collection('customers');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Detect carrier from phone number
 */
function detectCarrier(phone) {
    if (!phone) return null;

    const phoneClean = phone.replace(/\D/g, '');

    // Viettel prefixes
    if (/^(086|096|097|098|032|033|034|035|036|037|038|039)/.test(phoneClean)) {
        return 'Viettel';
    }
    // Vinaphone prefixes
    if (/^(088|091|094|083|084|085|081|082)/.test(phoneClean)) {
        return 'Vinaphone';
    }
    // Mobifone prefixes
    if (/^(089|090|093|070|079|077|076|078)/.test(phoneClean)) {
        return 'Mobifone';
    }
    // Vietnamobile prefixes
    if (/^(092|056|058)/.test(phoneClean)) {
        return 'Vietnamobile';
    }
    // Gmobile prefixes
    if (/^(099|059)/.test(phoneClean)) {
        return 'Gmobile';
    }

    return null;
}

/**
 * Convert Firebase Timestamp to JavaScript Date
 */
function convertTimestamp(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate) {
        return timestamp.toDate();
    }
    if (timestamp._seconds !== undefined) {
        return new Date(timestamp._seconds * 1000);
    }
    return new Date(timestamp);
}

/**
 * Format progress bar
 */
function progressBar(current, total, barLength = 40) {
    const percentage = (current / total) * 100;
    const filledLength = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    return `[${bar}] ${percentage.toFixed(1)}% (${current}/${total})`;
}

// =====================================================
// MIGRATION LOGIC
// =====================================================

async function migrateCustomers() {
    console.log('='.repeat(60));
    console.log('🚀 FIREBASE TO POSTGRESQL MIGRATION');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no data will be inserted)' : '✅ LIVE RUN'}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    if (LIMIT) console.log(`Limit: ${LIMIT} records`);
    console.log('='.repeat(60));
    console.log('');

    const stats = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        startTime: Date.now()
    };

    try {
        // Test PostgreSQL connection
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL connection OK');

        // Test Firebase connection
        const testQuery = await customersCollection.limit(1).get();
        console.log('✅ Firebase connection OK');
        console.log('');

        // Count total records
        console.log('📊 Counting Firebase records...');
        let query = customersCollection.orderBy('createdAt', 'desc');
        if (LIMIT) {
            query = query.limit(LIMIT);
        }

        const snapshot = await query.get();
        stats.total = snapshot.size;
        console.log(`   Found: ${stats.total} customers`);
        console.log('');

        if (stats.total === 0) {
            console.log('⚠️  No customers found in Firebase');
            return;
        }

        // Process in batches
        let batch = [];
        let batchCount = 0;

        console.log('🔄 Starting migration...');
        console.log('');

        for (const doc of snapshot.docs) {
            const firebaseData = doc.data();
            const firebaseId = doc.id;

            // Map Firebase data to PostgreSQL schema
            const customer = {
                firebase_id: firebaseId,
                phone: firebaseData.phone?.trim() || '',
                name: firebaseData.name?.trim() || '',
                email: firebaseData.email?.trim() || null,
                address: firebaseData.address?.trim() || null,
                carrier: firebaseData.carrier || detectCarrier(firebaseData.phone),
                status: firebaseData.status || 'Bình thường',
                debt: parseInt(firebaseData.debt) || 0,
                active: firebaseData.active !== false,
                tpos_id: firebaseData.tposId || null,
                tpos_data: firebaseData.tposData ? JSON.stringify(firebaseData.tposData) : null,
                created_at: convertTimestamp(firebaseData.createdAt) || new Date(),
                updated_at: convertTimestamp(firebaseData.updatedAt) || new Date()
            };

            // Validate required fields
            if (!customer.phone || !customer.name) {
                console.log(`   ⚠️  Skipped: ${firebaseId} (missing phone or name)`);
                stats.skipped++;
                continue;
            }

            batch.push(customer);

            // Insert batch when full
            if (batch.length >= BATCH_SIZE) {
                await insertBatch(batch, stats, isDryRun);
                batchCount++;

                // Progress update
                const processed = stats.success + stats.failed + stats.skipped;
                console.log(progressBar(processed, stats.total));

                batch = []; // Reset batch
            }
        }

        // Insert remaining batch
        if (batch.length > 0) {
            await insertBatch(batch, stats, isDryRun);
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('✅ MIGRATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`Total:    ${stats.total}`);
        console.log(`Success:  ${stats.success} ✅`);
        console.log(`Failed:   ${stats.failed} ❌`);
        console.log(`Skipped:  ${stats.skipped} ⚠️`);
        console.log(`Duration: ${((Date.now() - stats.startTime) / 1000).toFixed(2)}s`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('');
        console.error('='.repeat(60));
        console.error('❌ MIGRATION FAILED');
        console.error('='.repeat(60));
        console.error(error);
        console.error('='.repeat(60));
        process.exit(1);
    } finally {
        await pool.end();
        await admin.app().delete();
    }
}

/**
 * Insert batch of customers into PostgreSQL
 */
async function insertBatch(batch, stats, isDryRun = false) {
    if (isDryRun) {
        console.log(`   [DRY-RUN] Would insert ${batch.length} customers`);
        stats.success += batch.length;
        return;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const customer of batch) {
            try {
                await client.query(`
                    INSERT INTO customers (
                        firebase_id, phone, name, email, address, carrier, status,
                        debt, active, tpos_id, tpos_data, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (firebase_id) DO UPDATE SET
                        phone = EXCLUDED.phone,
                        name = EXCLUDED.name,
                        email = EXCLUDED.email,
                        address = EXCLUDED.address,
                        carrier = EXCLUDED.carrier,
                        status = EXCLUDED.status,
                        debt = EXCLUDED.debt,
                        active = EXCLUDED.active,
                        tpos_id = EXCLUDED.tpos_id,
                        tpos_data = EXCLUDED.tpos_data,
                        updated_at = EXCLUDED.updated_at
                `, [
                    customer.firebase_id,
                    customer.phone,
                    customer.name,
                    customer.email,
                    customer.address,
                    customer.carrier,
                    customer.status,
                    customer.debt,
                    customer.active,
                    customer.tpos_id,
                    customer.tpos_data,
                    customer.created_at,
                    customer.updated_at
                ]);

                stats.success++;
            } catch (error) {
                console.error(`   ❌ Failed to insert: ${customer.phone} - ${error.message}`);
                stats.failed++;
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// =====================================================
// RUN MIGRATION
// =====================================================

if (require.main === module) {
    migrateCustomers().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { migrateCustomers };
