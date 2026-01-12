const db = require('../db/pool'); // Assuming db connection is available via module.exports

function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/\s/g, ''); // Remove all spaces
    // If phone starts with +84, remove it
    if (normalized.startsWith('+84')) {
        normalized = '0' + normalized.substring(3);
    }
    // Ensure it starts with 0
    if (!normalized.startsWith('0')) {
        normalized = '0' + normalized;
    }
    return normalized;
}

async function getOrCreateCustomer(db, phone, name) {
    const normalized = normalizePhone(phone);

    let result = await db.query('SELECT id FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Auto-create customer
    result = await db.query(`
        INSERT INTO customers (phone, name, status, tier, created_at)
        VALUES ($1, $2, 'Bình thường', 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [normalized, name || 'Khách hàng mới']);

    console.log(`[AUTO-CREATE] Created customer: ${name || 'Khách hàng mới'} (${normalized})`);
    return result.rows[0].id;
}

module.exports = {
    normalizePhone,
    getOrCreateCustomer
};
