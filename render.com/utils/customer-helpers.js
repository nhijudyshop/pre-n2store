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

/**
 * Detect carrier from phone number prefix
 * Supports: Viettel, Vinaphone, Mobifone, Vietnamobile, Gmobile
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
 * Validate customer data
 * @param {object} data - Customer data to validate
 * @param {boolean} isUpdate - If true, required fields are not enforced
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateCustomerData(data, isUpdate = false) {
    const errors = [];

    if (!data || typeof data !== 'object') {
        errors.push('Dữ liệu không hợp lệ - expected JSON object');
        return errors;
    }

    if (!isUpdate) {
        const requiredFields = ['name', 'phone'];
        const missingFields = requiredFields.filter(field =>
            !data[field] || data[field].trim() === ''
        );

        if (missingFields.length > 0) {
            errors.push(`Thiếu trường bắt buộc: ${missingFields.join(', ')}`);
            return errors;
        }
    }

    // Validate phone format if provided
    if (data.phone) {
        const phoneClean = data.phone.replace(/\D/g, '');
        if (phoneClean.length < 10 || phoneClean.length > 11) {
            errors.push('Số điện thoại không hợp lệ (phải có 10-11 số)');
        }
    }

    // Validate email format if provided
    if (data.email && data.email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            errors.push('Email không hợp lệ');
        }
    }

    // Validate status
    const validStatuses = ['Bình thường', 'Bom hàng', 'Cảnh báo', 'Nguy hiểm', 'VIP'];
    if (data.status && !validStatuses.includes(data.status)) {
        errors.push(`Trạng thái không hợp lệ - phải là: ${validStatuses.join(', ')}`);
    }

    // Validate debt (must be number)
    if (data.debt !== undefined && isNaN(parseInt(data.debt))) {
        errors.push('Nợ phải là số');
    }

    return errors;
}

module.exports = {
    normalizePhone,
    getOrCreateCustomer,
    detectCarrier,
    validateCustomerData
};
