// =====================================================
// RETURN ORDERS API - PostgreSQL Backend
// Trả Hàng (Returns) Management
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Validate return order data
 */
function validateReturnOrderData(data, isUpdate = false) {
    const errors = [];

    // Validate data type
    if (!data || typeof data !== 'object') {
        errors.push('Dữ liệu không hợp lệ - expected JSON object');
        return errors;
    }

    if (!isUpdate) {
        // Required fields for create
        const requiredFields = ['customer_name', 'invoice_number'];
        const missingFields = requiredFields.filter(field =>
            !data[field] || (typeof data[field] === 'string' && data[field].trim() === '')
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

    // Validate status
    const validStatuses = ['Đã xác nhận', 'Nháp', 'Đã hủy'];
    if (data.status && !validStatuses.includes(data.status)) {
        errors.push(`Trạng thái không hợp lệ - phải là: ${validStatuses.join(', ')}`);
    }

    // Validate source
    const validSources = ['TPOS', 'Excel', 'Manual'];
    if (data.source && !validSources.includes(data.source)) {
        errors.push(`Nguồn không hợp lệ - phải là: ${validSources.join(', ')}`);
    }

    // Validate numeric fields
    if (data.total_amount !== undefined && isNaN(parseInt(data.total_amount))) {
        errors.push('Tổng tiền phải là số');
    }
    if (data.remaining_debt !== undefined && isNaN(parseInt(data.remaining_debt))) {
        errors.push('Còn nợ phải là số');
    }

    return errors;
}

/**
 * Map TPOS API data to our schema
 */
function mapTPOSDataToSchema(tposData) {
    return {
        customer_name: tposData.PartnerDisplayName || tposData.PartnerName || tposData.Partner?.Name || '',
        phone: tposData.Phone || tposData.Partner?.Phone || '',
        invoice_number: tposData.Number || '',
        reference: tposData.ReferenceNumber || tposData.InvoiceReference || '',
        invoice_date: tposData.DateInvoice || null,
        total_amount: tposData.AmountTotal || 0,
        remaining_debt: tposData.Residual || 0,
        status: mapTPOSStatus(tposData.State, tposData.ShowState),
        return_reason: tposData.Comment || tposData.Note || '',
        is_returned: false,
        tpos_id: tposData.Id?.toString() || null,
        tpos_data: tposData,
        source: 'TPOS'
    };
}

/**
 * Map TPOS status to our status
 */
function mapTPOSStatus(state, showState) {
    if (showState) {
        if (showState.includes('xác nhận') || showState.includes('confirmed')) {
            return 'Đã xác nhận';
        }
    }

    switch (state) {
        case 'open':
        case 'paid':
            return 'Đã xác nhận';
        case 'draft':
            return 'Nháp';
        case 'cancel':
            return 'Đã hủy';
        default:
            return 'Nháp';
    }
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/return-orders
 * Get all return orders with pagination and filters
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 50, max: 500)
 *   - search: search term (searches customer_name, phone, invoice_number, reference)
 *   - status: filter by status (optional)
 *   - is_returned: filter by return status (true/false, optional)
 *   - start_date: start date for invoice_date filter (ISO format, optional)
 *   - end_date: end date for invoice_date filter (ISO format, optional)
 *   - sort: sort field (default: invoice_date)
 *   - order: sort order (asc/desc, default: desc)
 */
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const {
            page = 1,
            limit = 50,
            search = '',
            status,
            is_returned,
            start_date,
            end_date,
            sort = 'invoice_date',
            order = 'desc'
        } = req.query;

        const pageNum = Math.max(parseInt(page) || 1, 1);
        const limitNum = Math.min(parseInt(limit) || 50, 500);
        const offset = (pageNum - 1) * limitNum;
        const searchTerm = search.trim();

        console.log(`[RETURN-ORDERS-LIST] Page: ${pageNum}, Limit: ${limitNum}, Search: "${searchTerm}"`);

        // Build WHERE clause
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Search filter
        if (searchTerm) {
            conditions.push(`(
                invoice_number LIKE $${paramIndex}
                OR phone LIKE $${paramIndex}
                OR LOWER(customer_name) LIKE LOWER($${paramIndex})
                OR reference LIKE $${paramIndex}
            )`);
            params.push(`%${searchTerm}%`);
            paramIndex++;
        }

        // Status filter
        if (status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        // is_returned filter
        if (is_returned !== undefined && is_returned !== '') {
            conditions.push(`is_returned = $${paramIndex}`);
            params.push(is_returned === 'true');
            paramIndex++;
        }

        // Date range filter
        if (start_date) {
            conditions.push(`invoice_date >= $${paramIndex}`);
            params.push(start_date);
            paramIndex++;
        }
        if (end_date) {
            conditions.push(`invoice_date <= $${paramIndex}`);
            params.push(end_date);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Validate sort field to prevent SQL injection
        const validSortFields = ['invoice_date', 'created_at', 'customer_name', 'total_amount', 'remaining_debt'];
        const sortField = validSortFields.includes(sort) ? sort : 'invoice_date';
        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // Count total
        const countQuery = `SELECT COUNT(*) FROM return_orders ${whereClause}`;
        const countResult = await db.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].count);

        // Fetch data
        const dataQuery = `
            SELECT
                id, customer_name, phone, invoice_number, reference,
                invoice_date, total_amount, remaining_debt, status,
                return_reason, is_returned, tpos_id, source,
                created_at, updated_at
            FROM return_orders
            ${whereClause}
            ORDER BY ${sortField} ${sortOrder}, id DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limitNum, offset);

        const dataResult = await db.query(dataQuery, params);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                total_pages: Math.ceil(totalCount / limitNum)
            }
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-LIST] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách đơn trả hàng',
            error: error.message
        });
    }
});

/**
 * GET /api/return-orders/stats
 * Get statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;

        const query = 'SELECT * FROM return_orders_statistics';
        const result = await db.query(query);

        res.json({
            success: true,
            data: result.rows[0] || {}
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-STATS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê',
            error: error.message
        });
    }
});

/**
 * GET /api/return-orders/:id
 * Get single return order by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;

        const query = `
            SELECT
                id, customer_name, phone, invoice_number, reference,
                invoice_date, total_amount, remaining_debt, status,
                return_reason, is_returned, tpos_id, tpos_data, source,
                created_at, updated_at
            FROM return_orders
            WHERE id = $1
        `;
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đơn trả hàng'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-GET] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin đơn trả hàng',
            error: error.message
        });
    }
});

/**
 * POST /api/return-orders/batch
 * Batch insert return orders (from TPOS or Excel)
 * Prevents duplicates using ON CONFLICT (invoice_number) DO NOTHING
 *
 * Body: {
 *   orders: [{ customer_name, phone, invoice_number, ... }, ...]
 * }
 */
router.post('/batch', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { orders } = req.body;

        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách đơn hàng không hợp lệ'
            });
        }

        console.log(`[RETURN-ORDERS-BATCH] Importing ${orders.length} orders`);

        // Validate all orders first
        const validationErrors = [];
        orders.forEach((order, index) => {
            const errors = validateReturnOrderData(order);
            if (errors.length > 0) {
                validationErrors.push(`Đơn hàng #${index + 1}: ${errors.join(', ')}`);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: validationErrors
            });
        }

        // Prepare batch insert with ON CONFLICT
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        orders.forEach((order) => {
            placeholders.push(`(
                $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3},
                $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7},
                $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}
            )`);

            values.push(
                order.customer_name || '',
                order.phone || null,
                order.invoice_number,
                order.reference || null,
                order.invoice_date || null,
                order.total_amount || 0,
                order.remaining_debt || 0,
                order.status || 'Nháp',
                order.return_reason || null,
                order.is_returned !== undefined ? order.is_returned : false,
                order.tpos_id || null,
                order.tpos_data ? JSON.stringify(order.tpos_data) : null,
                order.source || 'Manual'
            );

            paramIndex += 13;
        });

        // Insert with ON CONFLICT DO NOTHING (prevents duplicates)
        const insertQuery = `
            INSERT INTO return_orders (
                customer_name, phone, invoice_number, reference,
                invoice_date, total_amount, remaining_debt, status,
                return_reason, is_returned, tpos_id, tpos_data, source
            )
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (invoice_number) DO NOTHING
            RETURNING id, invoice_number
        `;

        const result = await db.query(insertQuery, values);

        const insertedCount = result.rows.length;
        const skippedCount = orders.length - insertedCount;

        console.log(`[RETURN-ORDERS-BATCH] Inserted: ${insertedCount}, Skipped (duplicates): ${skippedCount}`);

        res.json({
            success: true,
            message: `Đã nhập ${insertedCount} đơn hàng${skippedCount > 0 ? `, bỏ qua ${skippedCount} đơn trùng lặp` : ''}`,
            inserted: insertedCount,
            skipped: skippedCount,
            data: result.rows
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-BATCH] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi nhập đơn hàng',
            error: error.message
        });
    }
});

/**
 * PUT /api/return-orders/:id
 * Update single return order
 */
router.put('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const updateData = req.body;

        // Validate update data
        const errors = validateReturnOrderData(updateData, true);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors
            });
        }

        // Build UPDATE query dynamically
        const updates = [];
        const values = [];
        let paramIndex = 1;

        const allowedFields = [
            'customer_name', 'phone', 'invoice_number', 'reference',
            'invoice_date', 'total_amount', 'remaining_debt', 'status',
            'return_reason', 'is_returned', 'tpos_id', 'tpos_data', 'source'
        ];

        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updates.push(`${field} = $${paramIndex}`);

                // Handle JSONB field
                if (field === 'tpos_data' && updateData[field]) {
                    values.push(JSON.stringify(updateData[field]));
                } else {
                    values.push(updateData[field]);
                }

                paramIndex++;
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Không có dữ liệu để cập nhật'
            });
        }

        values.push(id);

        const updateQuery = `
            UPDATE return_orders
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, customer_name, invoice_number, status, is_returned
        `;

        const result = await db.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đơn trả hàng'
            });
        }

        console.log(`[RETURN-ORDERS-UPDATE] Updated order ID: ${id}`);

        res.json({
            success: true,
            message: 'Cập nhật đơn trả hàng thành công',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-UPDATE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật đơn trả hàng',
            error: error.message
        });
    }
});

/**
 * DELETE /api/return-orders/:id
 * Delete single return order
 */
router.delete('/:id', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { id } = req.params;

        const deleteQuery = `
            DELETE FROM return_orders
            WHERE id = $1
            RETURNING id, invoice_number
        `;

        const result = await db.query(deleteQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đơn trả hàng'
            });
        }

        console.log(`[RETURN-ORDERS-DELETE] Deleted order ID: ${id}, Invoice: ${result.rows[0].invoice_number}`);

        res.json({
            success: true,
            message: 'Xóa đơn trả hàng thành công',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[RETURN-ORDERS-DELETE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa đơn trả hàng',
            error: error.message
        });
    }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
