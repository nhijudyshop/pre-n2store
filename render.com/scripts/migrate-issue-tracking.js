/**
 * =====================================================
 * ISSUE-TRACKING MIGRATION: Firebase → PostgreSQL
 * =====================================================
 *
 * Migrate data from Firebase Realtime Database to PostgreSQL on Render.com
 *
 * Usage:
 *   # Dry run (test without writing)
 *   DRY_RUN=true node scripts/migrate-issue-tracking.js
 *
 *   # Live migration
 *   node scripts/migrate-issue-tracking.js
 *
 * Environment Variables Required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - FIREBASE_DATABASE_URL: Firebase Realtime DB URL
 *   - FIREBASE_SERVICE_ACCOUNT: Path to service account JSON OR base64 encoded JSON
 *
 * Created: 2026-01-07
 * Source: issue-tracking/customer360plan.md
 * =====================================================
 */

const admin = require('firebase-admin');
const { Pool } = require('pg');
require('dotenv').config();

// =====================================================
// CONFIGURATION
// =====================================================

const CONFIG = {
    DRY_RUN: process.env.DRY_RUN === 'true',
    BATCH_SIZE: 100,
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || 'https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app',
};

// PostgreSQL Pool
let pool;

// Stats tracking
const STATS = {
    customers: { found: 0, migrated: 0, skipped: 0, errors: 0 },
    wallets: { found: 0, migrated: 0, skipped: 0, errors: 0 },
    tickets: { found: 0, migrated: 0, skipped: 0, errors: 0 },
    transactions: { found: 0, migrated: 0, skipped: 0, errors: 0 },
    virtualCredits: { found: 0, migrated: 0, skipped: 0, errors: 0 },
    activities: { created: 0, errors: 0 },
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function log(message, type = 'info') {
    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = {
        info: '📋',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        step: '🔹',
        dry: '🔍',
    }[type] || '📋';

    console.log(`[${timestamp}] ${prefix} ${message}`);
}

function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('84')) cleaned = '0' + cleaned.slice(2);
    if (cleaned.startsWith('+84')) cleaned = '0' + cleaned.slice(3);
    if (!cleaned.startsWith('0') && cleaned.length === 9) cleaned = '0' + cleaned;
    return cleaned.length >= 10 && cleaned.length <= 11 ? cleaned : null;
}

function timestampToDate(ts) {
    if (!ts) return null;
    if (typeof ts === 'number') {
        // Firebase timestamps are in milliseconds
        const date = new Date(ts > 1e12 ? ts : ts * 1000);
        return date.toISOString();
    }
    return new Date(ts).toISOString();
}

function mapTicketStatus(status) {
    const mapping = {
        'PENDING_GOODS': 'PENDING_GOODS',
        'PENDING_FINANCE': 'PENDING_FINANCE',
        'COMPLETED': 'COMPLETED',
        // Fallback mappings
        'NEW': 'PENDING',
        'PENDING_RETURN': 'PENDING_GOODS',
        'RECEIVED_VERIFIED': 'PENDING_FINANCE',
        'ACCOUNTING_DONE': 'PENDING_FINANCE',
        'VIRTUAL_CREDIT_ISSUED': 'PENDING_FINANCE',
    };
    return mapping[status] || 'PENDING';
}

// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

function initFirebase() {
    log('Initializing Firebase Admin SDK...', 'step');

    try {
        let credential;

        // Option 1: Service account file path
        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            credential = admin.credential.cert(serviceAccount);
            log(`Using service account from file: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`);
        }
        // Option 2: Base64 encoded service account (for Render.com)
        else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
            const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
            const serviceAccount = JSON.parse(decoded);
            credential = admin.credential.cert(serviceAccount);
            log('Using service account from FIREBASE_SERVICE_ACCOUNT_BASE64');
        }
        // Option 3: Default credentials (Google Cloud environment)
        else {
            credential = admin.credential.applicationDefault();
            log('Using application default credentials');
        }

        admin.initializeApp({
            credential: credential,
            databaseURL: CONFIG.FIREBASE_DATABASE_URL,
        });

        log('Firebase Admin SDK initialized', 'success');
        return admin.database();
    } catch (error) {
        log(`Firebase initialization failed: ${error.message}`, 'error');
        throw error;
    }
}

// =====================================================
// POSTGRESQL INITIALIZATION
// =====================================================

function initPostgres() {
    log('Initializing PostgreSQL connection...', 'step');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    log('PostgreSQL pool created', 'success');
    return pool;
}

// =====================================================
// STEP 1: MIGRATE CUSTOMERS
// =====================================================

async function migrateCustomers(db) {
    log('\n========== STEP 1: MIGRATE CUSTOMERS ==========', 'step');

    const customerMap = new Map(); // phone → { name, firstSeen }

    // Read tickets to collect customer phones
    log('Reading tickets for customer phones...', 'step');
    const ticketsSnap = await db.ref('issue_tracking/tickets').once('value');
    ticketsSnap.forEach(child => {
        const ticket = child.val();
        const phone = normalizePhone(ticket.phone);
        if (phone && !customerMap.has(phone)) {
            customerMap.set(phone, {
                phone,
                name: ticket.customer || 'Unknown',
                firstSeen: ticket.createdAt,
            });
        }
        STATS.tickets.found++;
    });

    // Read wallets to collect more customer info
    log('Reading wallets for customer phones...', 'step');
    const walletsSnap = await db.ref('customer_wallets').once('value');
    walletsSnap.forEach(child => {
        const wallet = child.val();
        const phone = normalizePhone(wallet.phone);
        if (phone) {
            const existing = customerMap.get(phone) || {};
            customerMap.set(phone, {
                ...existing,
                phone,
                name: wallet.customerName || existing.name || 'Unknown',
                firstSeen: Math.min(existing.firstSeen || Infinity, wallet.createdAt || Infinity),
            });
        }
        STATS.wallets.found++;
    });

    log(`Found ${customerMap.size} unique customers from ${STATS.tickets.found} tickets and ${STATS.wallets.found} wallets`);

    if (CONFIG.DRY_RUN) {
        log('[DRY RUN] Would insert/update customers', 'dry');
        STATS.customers.found = customerMap.size;
        return;
    }

    // Batch insert customers
    const customers = Array.from(customerMap.values());
    for (let i = 0; i < customers.length; i += CONFIG.BATCH_SIZE) {
        const batch = customers.slice(i, i + CONFIG.BATCH_SIZE);

        for (const customer of batch) {
            try {
                await pool.query(`
                    INSERT INTO customers (phone, name, created_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (phone) DO UPDATE SET
                        name = COALESCE(NULLIF(customers.name, 'Unknown'), EXCLUDED.name),
                        updated_at = NOW()
                `, [
                    customer.phone,
                    customer.name,
                    timestampToDate(customer.firstSeen) || new Date().toISOString(),
                ]);
                STATS.customers.migrated++;
            } catch (error) {
                log(`Error inserting customer ${customer.phone}: ${error.message}`, 'error');
                STATS.customers.errors++;
            }
        }

        log(`Processed customers batch ${Math.ceil((i + 1) / CONFIG.BATCH_SIZE)}/${Math.ceil(customers.length / CONFIG.BATCH_SIZE)}`);
    }

    STATS.customers.found = customerMap.size;
    log(`Migrated ${STATS.customers.migrated} customers`, 'success');
}

// =====================================================
// STEP 2: MIGRATE WALLETS
// =====================================================

async function migrateWallets(db) {
    log('\n========== STEP 2: MIGRATE WALLETS ==========', 'step');

    const walletsSnap = await db.ref('customer_wallets').once('value');
    const wallets = [];

    walletsSnap.forEach(child => {
        const wallet = child.val();
        const phone = normalizePhone(wallet.phone);
        if (!phone) {
            STATS.wallets.skipped++;
            return;
        }

        wallets.push({
            phone,
            balance: wallet.balance || 0,
            virtualBalance: wallet.virtualBalance || 0,
            virtualCredits: wallet.virtualCredits || [],
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
        });
    });

    log(`Found ${wallets.length} wallets to migrate`);

    if (CONFIG.DRY_RUN) {
        log('[DRY RUN] Would insert wallets', 'dry');
        return;
    }

    for (const wallet of wallets) {
        try {
            // Get customer_id
            const customerResult = await pool.query(
                'SELECT id FROM customers WHERE phone = $1',
                [wallet.phone]
            );
            const customerId = customerResult.rows[0]?.id || null;

            // Insert wallet
            const walletResult = await pool.query(`
                INSERT INTO customer_wallets (customer_id, phone, balance, virtual_balance, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (phone) DO UPDATE SET
                    customer_id = COALESCE(customer_wallets.customer_id, EXCLUDED.customer_id),
                    balance = EXCLUDED.balance,
                    virtual_balance = EXCLUDED.virtual_balance,
                    updated_at = NOW()
                RETURNING id
            `, [
                customerId,
                wallet.phone,
                wallet.balance,
                wallet.virtualBalance,
                timestampToDate(wallet.createdAt),
                timestampToDate(wallet.updatedAt),
            ]);

            const walletId = walletResult.rows[0]?.id;

            // Migrate active virtual credits
            for (const vc of wallet.virtualCredits || []) {
                if (vc.status !== 'ACTIVE') continue;

                try {
                    await pool.query(`
                        INSERT INTO virtual_credits
                        (phone, wallet_id, original_amount, remaining_amount, issued_at, expires_at, status, source_type, source_id, note)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [
                        wallet.phone,
                        walletId,
                        vc.amount,
                        vc.amount,
                        timestampToDate(vc.issuedAt),
                        timestampToDate(vc.expiresAt),
                        vc.status,
                        'RETURN_SHIPPER',
                        vc.ticketId || null,
                        'Migrated from Firebase',
                    ]);
                    STATS.virtualCredits.migrated++;
                } catch (vcError) {
                    log(`Error migrating virtual credit for ${wallet.phone}: ${vcError.message}`, 'error');
                    STATS.virtualCredits.errors++;
                }
            }

            STATS.wallets.migrated++;
        } catch (error) {
            log(`Error migrating wallet ${wallet.phone}: ${error.message}`, 'error');
            STATS.wallets.errors++;
        }
    }

    log(`Migrated ${STATS.wallets.migrated} wallets, ${STATS.virtualCredits.migrated} virtual credits`, 'success');
}

// =====================================================
// STEP 3: MIGRATE TICKETS
// =====================================================

async function migrateTickets(db) {
    log('\n========== STEP 3: MIGRATE TICKETS ==========', 'step');

    const ticketsSnap = await db.ref('issue_tracking/tickets').once('value');
    const tickets = [];

    ticketsSnap.forEach(child => {
        const firebaseId = child.key;
        const ticket = child.val();
        const phone = normalizePhone(ticket.phone);

        if (!phone) {
            STATS.tickets.skipped++;
            return;
        }

        tickets.push({
            firebaseId,
            phone,
            customerName: ticket.customer,
            orderId: ticket.orderId,
            trackingCode: ticket.trackingCode,
            type: ticket.type,
            status: mapTicketStatus(ticket.status),
            products: ticket.products || [],
            originalCod: ticket.originalCod,
            newCod: ticket.newCod,
            refundAmount: ticket.money,
            fixCodReason: ticket.fixReason,
            virtualCredit: ticket.virtualCredit,
            carrierDeadline: ticket.carrierRecoveryDeadline,
            internalNote: ticket.note,
            actionHistory: ticket.actionHistory || [],
            metadata: {
                channel: ticket.channel,
                extendedStatus: ticket.extendedStatus,
                hasDefectiveItems: ticket.hasDefectiveItems,
                defectiveItemsNote: ticket.defectiveItemsNote,
            },
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            completedAt: ticket.completedAt,
            createdBy: ticket.createdBy,
        });
    });

    log(`Found ${tickets.length} tickets to migrate (skipped ${STATS.tickets.skipped} invalid)`);

    if (CONFIG.DRY_RUN) {
        log('[DRY RUN] Would insert tickets', 'dry');
        return;
    }

    for (const ticket of tickets) {
        try {
            // Get customer_id
            const customerResult = await pool.query(
                'SELECT id FROM customers WHERE phone = $1',
                [ticket.phone]
            );
            const customerId = customerResult.rows[0]?.id || null;

            // Insert ticket (ticket_code will be auto-generated by trigger)
            const ticketResult = await pool.query(`
                INSERT INTO customer_tickets (
                    firebase_id, phone, customer_id, customer_name,
                    order_id, tracking_code, type, status,
                    products, original_cod, new_cod, refund_amount,
                    fix_cod_reason, virtual_credit_amount, carrier_deadline,
                    internal_note, action_history,
                    created_at, updated_at, completed_at, created_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (firebase_id) DO NOTHING
                RETURNING id, ticket_code
            `, [
                ticket.firebaseId,
                ticket.phone,
                customerId,
                ticket.customerName,
                ticket.orderId,
                ticket.trackingCode,
                ticket.type,
                ticket.status,
                JSON.stringify(ticket.products),
                ticket.originalCod,
                ticket.newCod,
                ticket.refundAmount,
                ticket.fixCodReason,
                ticket.virtualCredit?.amount,
                timestampToDate(ticket.carrierDeadline),
                ticket.internalNote,
                JSON.stringify(ticket.actionHistory),
                timestampToDate(ticket.createdAt),
                timestampToDate(ticket.updatedAt),
                timestampToDate(ticket.completedAt),
                ticket.createdBy,
            ]);

            if (ticketResult.rows.length > 0) {
                STATS.tickets.migrated++;

                // Create activity for this ticket
                try {
                    await pool.query(`
                        INSERT INTO customer_activities
                        (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color, created_at)
                        VALUES ($1, $2, 'TICKET_CREATED', $3, $4, 'ticket', $5, 'clipboard-list', 'blue', $6)
                    `, [
                        ticket.phone,
                        customerId,
                        `Sự vụ ${ticket.type} - ${ticket.orderId || 'N/A'}`,
                        ticket.internalNote || '',
                        ticketResult.rows[0].ticket_code,
                        timestampToDate(ticket.createdAt),
                    ]);
                    STATS.activities.created++;
                } catch (actError) {
                    STATS.activities.errors++;
                }
            } else {
                STATS.tickets.skipped++;
            }
        } catch (error) {
            log(`Error migrating ticket ${ticket.firebaseId}: ${error.message}`, 'error');
            STATS.tickets.errors++;
        }
    }

    log(`Migrated ${STATS.tickets.migrated} tickets, created ${STATS.activities.created} activities`, 'success');
}

// =====================================================
// STEP 4: MIGRATE WALLET TRANSACTIONS
// =====================================================

async function migrateWalletTransactions(db) {
    log('\n========== STEP 4: MIGRATE WALLET TRANSACTIONS ==========', 'step');

    const txSnap = await db.ref('wallet_transactions').once('value');
    const transactions = [];

    txSnap.forEach(child => {
        const tx = child.val();
        const phone = normalizePhone(tx.phone);
        if (!phone) {
            STATS.transactions.skipped++;
            return;
        }

        transactions.push({
            phone,
            type: tx.type,
            amount: tx.amount,
            balanceAfter: tx.balanceAfter,
            source: tx.source,
            referenceId: tx.reference,
            note: tx.note,
            createdAt: tx.createdAt,
            createdBy: tx.createdBy,
        });
        STATS.transactions.found++;
    });

    log(`Found ${transactions.length} transactions to migrate`);

    if (CONFIG.DRY_RUN) {
        log('[DRY RUN] Would insert transactions', 'dry');
        return;
    }

    for (const tx of transactions) {
        try {
            // Get wallet_id
            const walletResult = await pool.query(
                'SELECT id FROM customer_wallets WHERE phone = $1',
                [tx.phone]
            );
            const walletId = walletResult.rows[0]?.id || null;

            await pool.query(`
                INSERT INTO wallet_transactions
                (phone, wallet_id, type, amount, balance_after, source, reference_id, note, created_at, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                tx.phone,
                walletId,
                tx.type,
                tx.amount,
                tx.balanceAfter,
                tx.source,
                tx.referenceId,
                tx.note,
                timestampToDate(tx.createdAt),
                tx.createdBy,
            ]);
            STATS.transactions.migrated++;
        } catch (error) {
            log(`Error migrating transaction for ${tx.phone}: ${error.message}`, 'error');
            STATS.transactions.errors++;
        }
    }

    log(`Migrated ${STATS.transactions.migrated} transactions`, 'success');
}

// =====================================================
// STEP 5: VERIFICATION
// =====================================================

async function verifyMigration() {
    log('\n========== STEP 5: VERIFICATION ==========', 'step');

    if (CONFIG.DRY_RUN) {
        log('[DRY RUN] Skipping verification', 'dry');
        return;
    }

    const counts = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM customers) as customers,
            (SELECT COUNT(*) FROM customer_wallets) as wallets,
            (SELECT COUNT(*) FROM customer_tickets) as tickets,
            (SELECT COUNT(*) FROM wallet_transactions) as transactions,
            (SELECT COUNT(*) FROM virtual_credits) as virtual_credits,
            (SELECT COUNT(*) FROM customer_activities) as activities
    `);

    log('Database counts after migration:');
    log(`  Customers:        ${counts.rows[0].customers}`);
    log(`  Wallets:          ${counts.rows[0].wallets}`);
    log(`  Tickets:          ${counts.rows[0].tickets}`);
    log(`  Transactions:     ${counts.rows[0].transactions}`);
    log(`  Virtual Credits:  ${counts.rows[0].virtual_credits}`);
    log(`  Activities:       ${counts.rows[0].activities}`);

    // Sample ticket check
    const sampleTicket = await pool.query(`
        SELECT ticket_code, type, status, phone, created_at
        FROM customer_tickets
        ORDER BY created_at DESC
        LIMIT 1
    `);

    if (sampleTicket.rows.length > 0) {
        log('\nSample migrated ticket:');
        log(`  Code: ${sampleTicket.rows[0].ticket_code}`);
        log(`  Type: ${sampleTicket.rows[0].type}`);
        log(`  Status: ${sampleTicket.rows[0].status}`);
        log(`  Phone: ${sampleTicket.rows[0].phone}`);
    }
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║   ISSUE-TRACKING MIGRATION: Firebase → PostgreSQL (Render.com)    ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    log(`Mode: ${CONFIG.DRY_RUN ? '🔍 DRY RUN (no writes)' : '🚀 LIVE MIGRATION'}`);
    log(`Batch size: ${CONFIG.BATCH_SIZE}`);
    log(`Firebase URL: ${CONFIG.FIREBASE_DATABASE_URL}\n`);

    try {
        // Initialize connections
        const db = initFirebase();
        initPostgres();

        // Test PostgreSQL connection
        log('Testing PostgreSQL connection...', 'step');
        await pool.query('SELECT NOW()');
        log('PostgreSQL connection OK', 'success');

        // Run migration steps
        await migrateCustomers(db);
        await migrateWallets(db);
        await migrateTickets(db);
        await migrateWalletTransactions(db);
        await verifyMigration();

        // Print summary
        console.log('\n════════════════════════════════════════════════════════════════════');
        console.log('                        MIGRATION SUMMARY                            ');
        console.log('════════════════════════════════════════════════════════════════════\n');

        console.log('Entity          | Found    | Migrated | Skipped  | Errors');
        console.log('----------------|----------|----------|----------|--------');
        console.log(`Customers       | ${String(STATS.customers.found).padEnd(8)} | ${String(STATS.customers.migrated).padEnd(8)} | ${String(STATS.customers.skipped).padEnd(8)} | ${STATS.customers.errors}`);
        console.log(`Wallets         | ${String(STATS.wallets.found).padEnd(8)} | ${String(STATS.wallets.migrated).padEnd(8)} | ${String(STATS.wallets.skipped).padEnd(8)} | ${STATS.wallets.errors}`);
        console.log(`Tickets         | ${String(STATS.tickets.found).padEnd(8)} | ${String(STATS.tickets.migrated).padEnd(8)} | ${String(STATS.tickets.skipped).padEnd(8)} | ${STATS.tickets.errors}`);
        console.log(`Transactions    | ${String(STATS.transactions.found).padEnd(8)} | ${String(STATS.transactions.migrated).padEnd(8)} | ${String(STATS.transactions.skipped).padEnd(8)} | ${STATS.transactions.errors}`);
        console.log(`Virtual Credits | ${String(STATS.virtualCredits.found).padEnd(8)} | ${String(STATS.virtualCredits.migrated).padEnd(8)} | -        | ${STATS.virtualCredits.errors}`);
        console.log(`Activities      | -        | ${String(STATS.activities.created).padEnd(8)} | -        | ${STATS.activities.errors}`);

        const totalErrors = Object.values(STATS).reduce((sum, s) => sum + (s.errors || 0), 0);

        if (totalErrors > 0) {
            console.log(`\n⚠️  Migration completed with ${totalErrors} errors`);
        } else {
            console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY');
        }

    } catch (error) {
        log(`\nMIGRATION FAILED: ${error.message}`, 'error');
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Cleanup
        if (pool) {
            await pool.end();
            log('PostgreSQL pool closed');
        }
        if (admin.apps.length > 0) {
            await admin.app().delete();
            log('Firebase app deleted');
        }
    }
}

// Run migration
main().catch(console.error);
