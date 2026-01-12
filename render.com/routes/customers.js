// =====================================================
// CUSTOMERS API - PostgreSQL Backend
// Replaces Firebase Firestore for customer management
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// MIDDLEWARE - Authentication (optional)
// =====================================================

// For now, we'll skip auth to keep it simple
// Add Firebase Admin auth later if needed

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
 * Validate customer data
 * Pattern inspired by sepay-webhook.js validation (line 64-104)
 */
function validateCustomerData(data, isUpdate = false) {
    const errors = [];

    // Validate data type (like sepay-webhook.js:64-71)
    if (!data || typeof data !== 'object') {
        errors.push('Dữ liệu không hợp lệ - expected JSON object');
        return errors;
    }

    if (!isUpdate) {
        // Required fields for create (like sepay-webhook.js:73-91)
        const requiredFields = ['name', 'phone'];
        const missingFields = requiredFields.filter(field =>
            !data[field] || data[field].trim() === ''
        );

        if (missingFields.length > 0) {
            errors.push(`Thiếu trường bắt buộc: ${missingFields.join(', ')}`);
            return errors; // Early return if missing required fields
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

    // Validate status (like sepay-webhook.js:93-104)
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

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/customers/search
 * Search customers with priority: phone → name → email
 * Query params:
 *   - q: search term (required)
 *   - limit: max results (default: 100)
 *   - status: filter by status (optional)
 */
router.get('/search', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { q, limit = 100, status } = req.query;

        if (!q || q.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Tham số tìm kiếm (q) là bắt buộc'
            });
        }

        const searchTerm = q.trim();
        const limitCount = Math.min(parseInt(limit) || 100, 500);

        console.log(`[CUSTOMERS-SEARCH] Term: "${searchTerm}", Limit: ${limitCount}, Status: ${status || 'all'}`);

        // Detect search type: phone (digits only) vs text
        const isPhoneSearch = /^\d+$/.test(searchTerm);

        let query;
        let params;

        if (isPhoneSearch) {
            // FALLBACK: Search in balance_customer_info if customers table is empty
            // This allows phone search to work even when customers table doesn't exist
            query = `
                SELECT
                    NULL::integer as id,
                    NULL::text as firebase_id,
                    customer_phone as phone,
                    customer_name as name,
                    NULL::text as email,
                    NULL::text as address,
                    NULL::text as carrier,
                    NULL::text as status,
                    NULL::numeric as debt,
                    NULL::boolean as active,
                    NULL::integer as tpos_id,
                    NULL::jsonb as tpos_data,
                    created_at,
                    updated_at,
                    CASE
                        WHEN customer_phone = $1 THEN 100
                        WHEN customer_phone LIKE $1 || '%' THEN 95
                        ELSE 90
                    END AS priority
                FROM balance_customer_info
                WHERE customer_phone LIKE $1 || '%' OR customer_phone LIKE '%' || $1
            `;
            params = [searchTerm];
        } else {
            // FALLBACK: Search in balance_customer_info by customer_name
            const searchLower = searchTerm.toLowerCase();
            query = `
                SELECT
                    NULL::integer as id,
                    NULL::text as firebase_id,
                    customer_phone as phone,
                    customer_name as name,
                    NULL::text as email,
                    NULL::text as address,
                    NULL::text as carrier,
                    NULL::text as status,
                    NULL::numeric as debt,
                    NULL::boolean as active,
                    NULL::integer as tpos_id,
                    NULL::jsonb as tpos_data,
                    created_at,
                    updated_at,
                    CASE
                        WHEN LOWER(customer_name) = $1 THEN 100
                        WHEN LOWER(customer_name) LIKE $1 || '%' THEN 90
                        ELSE 50
                    END AS priority
                FROM balance_customer_info
                WHERE customer_name IS NOT NULL
                  AND (LOWER(customer_name) LIKE $1 || '%' OR LOWER(customer_name) LIKE '%' || $1 || '%')
            `;
            params = [searchLower];
        }

        // Note: Status filter not supported when searching balance_customer_info
        // (status column doesn't exist in that table)

        query += ` ORDER BY priority DESC, created_at DESC LIMIT $${params.length + 1}`;
        params.push(limitCount);

        const startTime = Date.now();
        const result = await db.query(query, params);
        const duration = Date.now() - startTime;

        console.log(`[CUSTOMERS-SEARCH] Found ${result.rows.length} results in ${duration}ms (${isPhoneSearch ? 'phone' : 'text'} search)`);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
            query_time_ms: duration
        });

    } catch (error) {
        console.error('[CUSTOMERS-SEARCH] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm khách hàng',
            error: error.message
        });
    }
});

/**
 * GET /api/customers/stats
 * Get customer statistics (fast aggregation)
 */
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;

        const startTime = Date.now();

        // Use aggregation (1 query instead of 6 in Firebase)
        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Bình thường') as normal,
                COUNT(*) FILTER (WHERE status = 'Bom hàng') as danger,
                COUNT(*) FILTER (WHERE status = 'Cảnh báo') as warning,
                COUNT(*) FILTER (WHERE status = 'Nguy hiểm') as critical,
                COUNT(*) FILTER (WHERE status = 'VIP') as vip,
                COUNT(*) FILTER (WHERE active = true) as active,
                COUNT(*) FILTER (WHERE active = false) as inactive,
                SUM(debt) as total_debt,
                AVG(debt) as avg_debt
            FROM customers
        `);

        const duration = Date.now() - startTime;

        const stats = result.rows[0];

        console.log(`[CUSTOMERS-STATS] Loaded in ${duration}ms`);

        res.json({
            success: true,
            data: {
                total: parseInt(stats.total),
                normal: parseInt(stats.normal),
                danger: parseInt(stats.danger),
                warning: parseInt(stats.warning),
                critical: parseInt(stats.critical),
                vip: parseInt(stats.vip),
                active: parseInt(stats.active),
                inactive: parseInt(stats.inactive),
                total_debt: parseInt(stats.total_debt) || 0,
                avg_debt: parseFloat(stats.avg_debt) || 0
            },
            query_time_ms: duration
        });

    } catch (error) {
        console.error('[CUSTOMERS-STATS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải thống kê',
            error: error.message
        });
    }
});

/**
 * GET /api/customers
 * Get paginated list of customers
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 100)
 *   - status: filter by status (optional)
 *   - active: filter by active status (optional)
 */
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const {
            page = 1,
            limit = 100,
            status,
            active
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(parseInt(limit) || 100, 500);
        const offset = (pageNum - 1) * limitNum;

        console.log(`[CUSTOMERS-LIST] Page: ${pageNum}, Limit: ${limitNum}, Status: ${status || 'all'}`);

        // Build query
        let query = 'SELECT * FROM customers WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        if (active !== undefined) {
            params.push(active === 'true');
            query += ` AND active = $${params.length}`;
        }

        // Get total count
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limitNum, offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        console.error('[CUSTOMERS-LIST] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải danh sách khách hàng',
            error: error.message
        });
    }
});

/**
 * GET /api/customers/duplicates
 * Get customers with duplicate phone numbers
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 100)
 */
router.get('/duplicates', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const {
            page = 1,
            limit = 100
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(parseInt(limit) || 100, 500);
        const offset = (pageNum - 1) * limitNum;

        console.log(`[CUSTOMERS-DUPLICATES] Page: ${pageNum}, Limit: ${limitNum}`);

        // Find phones that appear more than once
        const duplicatePhonesQuery = `
            SELECT phone, COUNT(*) as count
            FROM customers
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone
            HAVING COUNT(*) > 1
        `;

        const duplicatePhonesResult = await db.query(duplicatePhonesQuery);
        const duplicatePhones = duplicatePhonesResult.rows.map(r => r.phone);

        if (duplicatePhones.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: 0,
                    total_pages: 0,
                    duplicate_phones_count: 0
                }
            });
        }

        // Get total count of customers with duplicate phones
        const countQuery = `
            SELECT COUNT(*) FROM customers
            WHERE phone = ANY($1)
        `;
        const countResult = await db.query(countQuery, [duplicatePhones]);
        const total = parseInt(countResult.rows[0].count);

        // Get customers with duplicate phones
        const customersQuery = `
            SELECT c.*,
                   (SELECT COUNT(*) FROM customers c2 WHERE c2.phone = c.phone) as duplicate_count
            FROM customers c
            WHERE c.phone = ANY($1)
            ORDER BY c.phone, c.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await db.query(customersQuery, [duplicatePhones, limitNum, offset]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum),
                duplicate_phones_count: duplicatePhones.length
            }
        });

    } catch (error) {
        console.error('[CUSTOMERS-DUPLICATES] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải danh sách khách hàng trùng SĐT',
            error: error.message
        });
    }
});

/**
 * GET /api/customers/recent
 * Get most recently active customers
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 20)
 */
router.get('/recent', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const {
            page = 1,
            limit = 20
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(parseInt(limit) || 20, 100);
        const offset = (pageNum - 1) * limitNum;

        console.log(`[CUSTOMERS-RECENT] Page: ${pageNum}, Limit: ${limitNum}`);

        // Get total count of active customers
        const countResult = await db.query('SELECT COUNT(*) FROM customers WHERE active = true');
        const total = parseInt(countResult.rows[0].count);

        // Get recent customers ordered by last_interaction_date or updated_at
        const result = await db.query(`
            SELECT * FROM customers
            WHERE active = true
            ORDER BY COALESCE(last_interaction_date, updated_at, created_at) DESC
            LIMIT $1 OFFSET $2
        `, [limitNum, offset]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        console.error('[CUSTOMERS-RECENT] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải danh sách khách hàng gần đây',
            error: error.message
        });
    }
});

/**
 * GET /api/customers/:id
 * Get single customer by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM customers WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khách hàng'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[CUSTOMERS-GET] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải thông tin khách hàng',
            error: error.message
        });
    }
});

/**
 * POST /api/customers
 * Create new customer
 */
router.post('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const customerData = req.body;

        // Validate data
        const errors = validateCustomerData(customerData, false);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: errors
            });
        }

        // Auto-detect carrier if not provided
        const carrier = customerData.carrier || detectCarrier(customerData.phone);

        // Insert customer
        const result = await db.query(`
            INSERT INTO customers (
                phone, name, email, address, carrier, status, debt, active, firebase_id, tpos_id, tpos_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            customerData.phone.trim(),
            customerData.name.trim(),
            customerData.email?.trim() || null,
            customerData.address?.trim() || null,
            carrier,
            customerData.status || 'Bình thường',
            customerData.debt || 0,
            customerData.active !== false,
            customerData.firebase_id || null,
            customerData.tpos_id || null,
            customerData.tpos_data ? JSON.stringify(customerData.tpos_data) : null
        ]);

        console.log(`[CUSTOMERS-CREATE] Created customer: ${result.rows[0].name} (${result.rows[0].phone})`);

        res.status(201).json({
            success: true,
            message: 'Thêm khách hàng thành công',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[CUSTOMERS-CREATE] Error:', error);

        // Handle duplicate phone
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Số điện thoại đã tồn tại',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo khách hàng',
            error: error.message
        });
    }
});

/**
 * PUT /api/customers/:id
 * Update customer
 */
router.put('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const customerData = req.body;

        // Validate data
        const errors = validateCustomerData(customerData, true);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: errors
            });
        }

        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (customerData.name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            params.push(customerData.name.trim());
        }
        if (customerData.phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            params.push(customerData.phone.trim());

            // Auto-detect carrier when phone changes
            const carrier = detectCarrier(customerData.phone);
            if (carrier) {
                updates.push(`carrier = $${paramCount++}`);
                params.push(carrier);
            }
        }
        if (customerData.email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            params.push(customerData.email?.trim() || null);
        }
        if (customerData.address !== undefined) {
            updates.push(`address = $${paramCount++}`);
            params.push(customerData.address?.trim() || null);
        }
        if (customerData.carrier !== undefined) {
            updates.push(`carrier = $${paramCount++}`);
            params.push(customerData.carrier);
        }
        if (customerData.status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            params.push(customerData.status);
        }
        if (customerData.debt !== undefined) {
            updates.push(`debt = $${paramCount++}`);
            params.push(customerData.debt);
        }
        if (customerData.active !== undefined) {
            updates.push(`active = $${paramCount++}`);
            params.push(customerData.active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu để cập nhật'
            });
        }

        // Add ID parameter
        params.push(id);

        const query = `
            UPDATE customers
            SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khách hàng'
            });
        }

        console.log(`[CUSTOMERS-UPDATE] Updated customer: ${result.rows[0].name} (${result.rows[0].phone})`);

        res.json({
            success: true,
            message: 'Cập nhật khách hàng thành công',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[CUSTOMERS-UPDATE] Error:', error);

        // Handle duplicate phone
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'Số điện thoại đã tồn tại',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật khách hàng',
            error: error.message
        });
    }
});

/**
 * DELETE /api/customers/:id
 * Delete customer (soft delete - set active = false)
 */
router.delete('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { hard_delete = false } = req.query;

        let result;

        if (hard_delete === 'true') {
            // Hard delete
            result = await db.query(
                'DELETE FROM customers WHERE id = $1 RETURNING *',
                [id]
            );
            console.log(`[CUSTOMERS-DELETE] Hard deleted customer ID: ${id}`);
        } else {
            // Soft delete
            result = await db.query(
                'UPDATE customers SET active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
                [id]
            );
            console.log(`[CUSTOMERS-DELETE] Soft deleted customer ID: ${id}`);
        }

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy khách hàng'
            });
        }

        res.json({
            success: true,
            message: 'Xóa khách hàng thành công',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[CUSTOMERS-DELETE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa khách hàng',
            error: error.message
        });
    }
});

/**
 * DELETE /api/customers/all
 * Delete ALL customers (DANGEROUS - use with caution)
 */
router.delete('/all', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { confirm } = req.query;

        // Require confirmation parameter
        if (confirm !== 'yes-delete-all') {
            return res.status(400).json({
                success: false,
                message: 'Cần xác nhận xóa. Thêm ?confirm=yes-delete-all vào URL'
            });
        }

        console.log('[CUSTOMERS-DELETE-ALL] ⚠️ Starting deletion of ALL customers...');

        // Get count first
        const countResult = await db.query('SELECT COUNT(*) as total FROM customers');
        const totalCount = parseInt(countResult.rows[0].total);

        console.log(`[CUSTOMERS-DELETE-ALL] Deleting ${totalCount} customers...`);

        // Use DELETE instead of TRUNCATE (safer, works with constraints)
        const deleteResult = await db.query('DELETE FROM customers');

        // Reset sequence
        try {
            await db.query('ALTER SEQUENCE customers_id_seq RESTART WITH 1');
        } catch (seqError) {
            console.log('[CUSTOMERS-DELETE-ALL] Could not reset sequence:', seqError.message);
        }

        console.log(`[CUSTOMERS-DELETE-ALL] ✅ Deleted ${deleteResult.rowCount} customers`);

        res.json({
            success: true,
            message: `Đã xóa ${deleteResult.rowCount} khách hàng`,
            deleted_count: deleteResult.rowCount
        });

    } catch (error) {
        console.error('[CUSTOMERS-DELETE-ALL] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa khách hàng',
            error: error.message
        });
    }
});

/**
 * POST /api/customers/batch
 * Batch create customers (for import/migration)
 * UPSERT logic: Insert new customers with debt=0, update existing but PRESERVE debt
 */
router.post('/batch', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { customers } = req.body;

        if (!Array.isArray(customers) || customers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách khách hàng không hợp lệ'
            });
        }

        console.log(`[CUSTOMERS-BATCH] Importing ${customers.length} customers...`);
        const startTime = Date.now();

        // Prepare values for multi-row INSERT
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const customer of customers) {
            if (!customer.phone || !customer.name) continue; // Skip invalid

            const carrier = customer.carrier || detectCarrier(customer.phone);

            values.push(
                customer.phone?.trim(),
                customer.name?.trim(),
                customer.email?.trim() || null,
                customer.address?.trim() || null,
                carrier,
                customer.status || 'Bình thường',
                0, // Always set debt = 0 for NEW customers
                customer.active !== false,
                customer.firebase_id || null,
                customer.tpos_id || null,
                customer.tpos_data ? JSON.stringify(customer.tpos_data) : null
            );

            placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`);
            paramIndex += 11;
        }

        if (placeholders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có khách hàng hợp lệ để import'
            });
        }

        // UPSERT: Insert new customers or update existing ones
        // IMPORTANT: When conflict on phone, update all fields EXCEPT debt (preserve existing debt)
        const query = `
            INSERT INTO customers (
                phone, name, email, address, carrier, status, debt, active, firebase_id, tpos_id, tpos_data
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT (phone) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                address = EXCLUDED.address,
                carrier = EXCLUDED.carrier,
                status = EXCLUDED.status,
                -- debt = customers.debt (KEEP EXISTING - don't update),
                active = EXCLUDED.active,
                firebase_id = COALESCE(EXCLUDED.firebase_id, customers.firebase_id),
                tpos_id = COALESCE(EXCLUDED.tpos_id, customers.tpos_id),
                tpos_data = COALESCE(EXCLUDED.tpos_data, customers.tpos_data),
                updated_at = CURRENT_TIMESTAMP
        `;

        const result = await db.query(query, values);
        const duration = Date.now() - startTime;

        const successCount = result.rowCount || 0;

        console.log(`[CUSTOMERS-BATCH] Processed: ${successCount} customers (inserted/updated), Time: ${duration}ms`);

        res.json({
            success: true,
            message: `Import thành công ${successCount}/${customers.length} khách hàng`,
            data: {
                success: successCount,
                failed: 0,
                skipped: customers.length - successCount,
                duration_ms: duration
            }
        });

    } catch (error) {
        console.error('[CUSTOMERS-BATCH] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi import khách hàng',
            error: error.message
        });
    }
});

module.exports = router;
