/**
 * =====================================================
 * CUSTOMER CREATION SERVICE
 * =====================================================
 *
 * Dịch vụ tạo/cập nhật khách hàng với thông tin đầy đủ từ TPOS
 *
 * Functions:
 *   - getOrCreateCustomerFromTPOS(db, phone, tposData) - Tạo/update customer với TPOS data
 *   - updateCustomerFromTPOS(db, customerId, tposData) - Update customer từ TPOS
 *   - ensureCustomerWithTPOS(db, phone) - Đảm bảo customer tồn tại (auto-fetch TPOS nếu cần)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const { searchCustomerByPhone, searchAllCustomersByPhone, normalizePhone } = require('./tpos-customer-service');

// =====================================================
// CUSTOMER CREATION FUNCTIONS
// =====================================================

/**
 * Get or create customer with full TPOS data
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Customer phone number
 * @param {Object|null} tposData - TPOS customer data (optional, will fetch if not provided)
 * @returns {Promise<{customerId: number, created: boolean, customerName: string}>}
 */
async function getOrCreateCustomerFromTPOS(db, phone, tposData = null) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        throw new Error('Invalid phone number');
    }

    // 1. Check if customer exists
    let result = await db.query('SELECT id, name FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        const existing = result.rows[0];

        // Customer exists - update with TPOS data if provided
        if (tposData && tposData.id) {
            await db.query(`
                UPDATE customers SET
                    name = COALESCE($2, name),
                    address = COALESCE($3, address),
                    tpos_id = COALESCE($4, tpos_id),
                    tpos_data = COALESCE($5, tpos_data),
                    status = COALESCE($6, status),
                    updated_at = CURRENT_TIMESTAMP
                WHERE phone = $1
            `, [
                normalized,
                tposData.name,
                tposData.address,
                tposData.id?.toString(),
                JSON.stringify(tposData),
                tposData.status || null
            ]);
            console.log(`[CUSTOMER-SERVICE] Updated customer ${normalized} with TPOS data (ID: ${tposData.id}, Status: ${tposData.status || 'unchanged'})`);
        }

        return {
            customerId: existing.id,
            created: false,
            customerName: tposData?.name || existing.name
        };
    }

    // 2. Customer not exists - fetch TPOS data if not provided
    if (!tposData) {
        console.log(`[CUSTOMER-SERVICE] No TPOS data provided, fetching from TPOS for ${normalized}`);
        try {
            const tposResult = await searchCustomerByPhone(normalized);

            if (tposResult.success && tposResult.customer) {
                tposData = tposResult.customer;
                console.log(`[CUSTOMER-SERVICE] Got TPOS data: ${tposData.name} (ID: ${tposData.id})`);
            }
        } catch (tposError) {
            // Log error but continue - customer will be created without TPOS data
            console.error(`[CUSTOMER-SERVICE] TPOS fetch failed for ${normalized}:`, tposError.message);
        }
    }

    // 3. Create customer with full TPOS data
    const name = tposData?.name || 'Khách hàng mới';
    const address = tposData?.address || null;
    const tposId = tposData?.id?.toString() || null;
    const tposDataJson = tposData ? JSON.stringify(tposData) : null;
    // Status từ TPOS hoặc NULL nếu không có TPOS data
    const status = tposData?.status || null;

    result = await db.query(`
        INSERT INTO customers (phone, name, address, tpos_id, tpos_data, status, tier, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            address = COALESCE(EXCLUDED.address, customers.address),
            tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
            tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
            status = COALESCE(EXCLUDED.status, customers.status),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, name
    `, [normalized, name, address, tposId, tposDataJson, status]);

    const newCustomer = result.rows[0];
    console.log(`[CUSTOMER-SERVICE] Created customer: ${name} (${normalized}) - ID: ${newCustomer.id}, TPOS: ${tposId || 'N/A'}`);

    return {
        customerId: newCustomer.id,
        created: true,
        customerName: newCustomer.name
    };
}

/**
 * Update existing customer with TPOS data
 *
 * @param {Object} db - Database connection
 * @param {number} customerId - Customer ID in database
 * @param {Object} tposData - TPOS customer data
 * @returns {Promise<boolean>} Success status
 */
async function updateCustomerFromTPOS(db, customerId, tposData) {
    if (!customerId || !tposData) {
        return false;
    }

    try {
        await db.query(`
            UPDATE customers SET
                name = COALESCE($2, name),
                address = COALESCE($3, address),
                tpos_id = COALESCE($4, tpos_id),
                tpos_data = COALESCE($5, tpos_data),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [
            customerId,
            tposData.name,
            tposData.address,
            tposData.id?.toString(),
            JSON.stringify(tposData)
        ]);

        console.log(`[CUSTOMER-SERVICE] Updated customer ID ${customerId} with TPOS data`);
        return true;
    } catch (error) {
        console.error(`[CUSTOMER-SERVICE] Error updating customer ${customerId}:`, error);
        return false;
    }
}

/**
 * Ensure customer exists for a phone number
 * If not exists, fetch from TPOS and create
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @returns {Promise<{customerId: number, customerName: string, created: boolean}>}
 */
async function ensureCustomerWithTPOS(db, phone) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        throw new Error('Invalid phone number');
    }

    // Check if customer exists
    const existing = await db.query('SELECT id, name FROM customers WHERE phone = $1', [normalized]);

    if (existing.rows.length > 0) {
        return {
            customerId: existing.rows[0].id,
            customerName: existing.rows[0].name,
            created: false
        };
    }

    // Customer not exists - fetch from TPOS and create
    console.log(`[CUSTOMER-SERVICE] Customer ${normalized} not found, fetching from TPOS...`);

    const tposResult = await searchCustomerByPhone(normalized);
    const tposData = tposResult.success ? tposResult.customer : null;

    return await getOrCreateCustomerFromTPOS(db, normalized, tposData);
}

/**
 * Batch ensure customers exist for multiple phones
 * Useful for migration and cron jobs
 *
 * @param {Object} db - Database connection
 * @param {string[]} phones - Array of phone numbers
 * @returns {Promise<{success: number, failed: number, results: array}>}
 */
async function batchEnsureCustomers(db, phones) {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const phone of phones) {
        try {
            const result = await ensureCustomerWithTPOS(db, phone);
            results.push({ phone, ...result, error: null });
            success++;
        } catch (error) {
            results.push({ phone, error: error.message });
            failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[CUSTOMER-SERVICE] Batch complete: ${success} success, ${failed} failed`);
    return { success, failed, results };
}

/**
 * Get customer info by phone, including TPOS refresh if needed
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @param {boolean} forceRefresh - Force refresh from TPOS
 * @returns {Promise<Object|null>} Customer data
 */
async function getCustomerByPhone(db, phone, forceRefresh = false) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        return null;
    }

    // Get from database
    const result = await db.query(`
        SELECT id, phone, name, address, tpos_id, tpos_data, status, tier, created_at, updated_at
        FROM customers
        WHERE phone = $1
    `, [normalized]);

    if (result.rows.length === 0) {
        return null;
    }

    const customer = result.rows[0];

    // Force refresh from TPOS if requested
    if (forceRefresh) {
        const tposResult = await searchCustomerByPhone(normalized);

        if (tposResult.success && tposResult.customer) {
            await updateCustomerFromTPOS(db, customer.id, tposResult.customer);
            customer.tpos_data = tposResult.customer;
            customer.name = tposResult.customer.name || customer.name;
            customer.address = tposResult.customer.address || customer.address;
        }
    }

    return customer;
}

/**
 * Collect all names from TPOS for a phone number and update aliases
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @returns {Promise<{success: boolean, allNames: string[], primaryName: string|null}>}
 */
async function collectAllNamesFromTPOS(db, phone) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        return { success: false, allNames: [], primaryName: null };
    }

    try {
        // Fetch ALL customers with this phone from TPOS
        const tposResult = await searchAllCustomersByPhone(normalized);

        if (!tposResult.success || !tposResult.customers || tposResult.customers.length === 0) {
            console.log(`[CUSTOMER-SERVICE] No TPOS customers found for ${normalized}`);
            return { success: true, allNames: [], primaryName: null };
        }

        // Collect all unique names
        const allNames = [];
        for (const customer of tposResult.customers) {
            if (customer.name && customer.name.trim() !== '' && !allNames.includes(customer.name)) {
                allNames.push(customer.name);
            }
        }

        console.log(`[CUSTOMER-SERVICE] Collected ${allNames.length} unique names for ${normalized}: ${allNames.join(', ')}`);

        // Update customer aliases in database
        if (allNames.length > 0) {
            // Get current aliases
            const currentResult = await db.query(
                'SELECT aliases FROM customers WHERE phone = $1',
                [normalized]
            );

            if (currentResult.rows.length > 0) {
                const currentAliases = currentResult.rows[0].aliases || [];
                const currentAliasesArray = Array.isArray(currentAliases) ? currentAliases : [];

                // Merge new names with existing aliases (keep unique)
                const mergedAliases = [...new Set([...currentAliasesArray, ...allNames])];

                await db.query(
                    'UPDATE customers SET aliases = $2, name = COALESCE(name, $3), updated_at = CURRENT_TIMESTAMP WHERE phone = $1',
                    [normalized, JSON.stringify(mergedAliases), allNames[0]]
                );

                console.log(`[CUSTOMER-SERVICE] Updated aliases for ${normalized}: ${mergedAliases.join(', ')}`);
            }
        }

        return {
            success: true,
            allNames,
            primaryName: allNames[0] || null
        };
    } catch (error) {
        console.error(`[CUSTOMER-SERVICE] Error collecting names for ${normalized}:`, error.message);
        return { success: false, allNames: [], primaryName: null, error: error.message };
    }
}

/**
 * Get or create customer with ALL names from TPOS
 * This is the enhanced version that collects all aliases
 *
 * @param {Object} db - Database connection
 * @param {string} phone - Customer phone number
 * @param {Object|null} tposData - TPOS customer data (optional, will fetch all if not provided)
 * @returns {Promise<{customerId: number, created: boolean, customerName: string, allNames: string[]}>}
 */
async function getOrCreateCustomerWithAliases(db, phone, tposData = null) {
    const normalized = normalizePhone(phone);

    if (!normalized) {
        throw new Error('Invalid phone number');
    }

    // 1. Check if customer exists
    let result = await db.query('SELECT id, name, aliases FROM customers WHERE phone = $1', [normalized]);

    // 2. Fetch ALL names from TPOS
    let allNames = [];
    if (!tposData) {
        console.log(`[CUSTOMER-SERVICE] Fetching ALL names from TPOS for ${normalized}`);
        try {
            const tposResult = await searchAllCustomersByPhone(normalized);

            if (tposResult.success && tposResult.customers && tposResult.customers.length > 0) {
                // Collect all unique names
                for (const customer of tposResult.customers) {
                    if (customer.name && customer.name.trim() !== '' && !allNames.includes(customer.name)) {
                        allNames.push(customer.name);
                    }
                }
                // Use first (most recent) customer as primary tposData
                tposData = tposResult.customers[0];
                console.log(`[CUSTOMER-SERVICE] Got ${allNames.length} names from TPOS: ${allNames.join(', ')}`);
            }
        } catch (tposError) {
            console.error(`[CUSTOMER-SERVICE] TPOS fetch failed for ${normalized}:`, tposError.message);
        }
    } else if (tposData.name) {
        // Single tposData provided - add to allNames
        allNames = [tposData.name];
    }

    if (result.rows.length > 0) {
        const existing = result.rows[0];
        const currentAliases = existing.aliases || [];
        const currentAliasesArray = Array.isArray(currentAliases) ? currentAliases : [];

        // Merge new names with existing aliases
        const mergedAliases = [...new Set([...currentAliasesArray, ...allNames])];

        // Customer exists - update with TPOS data and aliases
        if (tposData && tposData.id) {
            await db.query(`
                UPDATE customers SET
                    name = COALESCE($2, name),
                    address = COALESCE($3, address),
                    tpos_id = COALESCE($4, tpos_id),
                    tpos_data = COALESCE($5, tpos_data),
                    status = COALESCE($6, status),
                    aliases = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE phone = $1
            `, [
                normalized,
                tposData.name,
                tposData.address,
                tposData.id?.toString(),
                JSON.stringify(tposData),
                tposData.status || null,
                JSON.stringify(mergedAliases)
            ]);
            console.log(`[CUSTOMER-SERVICE] Updated customer ${normalized} with ${mergedAliases.length} aliases`);
        } else if (mergedAliases.length > currentAliasesArray.length) {
            // Just update aliases if no TPOS ID
            await db.query(
                'UPDATE customers SET aliases = $2, updated_at = CURRENT_TIMESTAMP WHERE phone = $1',
                [normalized, JSON.stringify(mergedAliases)]
            );
        }

        return {
            customerId: existing.id,
            created: false,
            customerName: tposData?.name || existing.name,
            allNames: mergedAliases
        };
    }

    // 3. Customer not exists - create with aliases
    const name = tposData?.name || allNames[0] || 'Khách hàng mới';
    const address = tposData?.address || null;
    const tposId = tposData?.id?.toString() || null;
    const tposDataJson = tposData ? JSON.stringify(tposData) : null;
    const status = tposData?.status || null;
    const aliasesJson = JSON.stringify(allNames.length > 0 ? allNames : (name !== 'Khách hàng mới' ? [name] : []));

    result = await db.query(`
        INSERT INTO customers (phone, name, address, tpos_id, tpos_data, status, aliases, tier, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            address = COALESCE(EXCLUDED.address, customers.address),
            tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
            tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
            status = COALESCE(EXCLUDED.status, customers.status),
            aliases = CASE
                WHEN customers.aliases IS NULL OR customers.aliases = '[]'::jsonb
                THEN EXCLUDED.aliases
                ELSE customers.aliases || EXCLUDED.aliases
            END,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, name, aliases
    `, [normalized, name, address, tposId, tposDataJson, status, aliasesJson]);

    const newCustomer = result.rows[0];
    console.log(`[CUSTOMER-SERVICE] Created customer: ${name} (${normalized}) with ${allNames.length} aliases`);

    return {
        customerId: newCustomer.id,
        created: true,
        customerName: newCustomer.name,
        allNames: newCustomer.aliases || allNames
    };
}

module.exports = {
    getOrCreateCustomerFromTPOS,
    updateCustomerFromTPOS,
    ensureCustomerWithTPOS,
    batchEnsureCustomers,
    getCustomerByPhone,
    normalizePhone,
    // New functions for aliases support
    collectAllNamesFromTPOS,
    getOrCreateCustomerWithAliases
};
