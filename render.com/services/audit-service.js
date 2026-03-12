// =====================================================
// BALANCE HISTORY AUDIT SERVICE
// Purpose: Log all changes to balance_history for audit trail
// =====================================================

/**
 * Audit Action Types
 */
const AUDIT_ACTIONS = {
    MANUAL_PHONE_ENTRY: 'MANUAL_PHONE_ENTRY',      // NV nhập SĐT tay
    TPOS_LOOKUP: 'TPOS_LOOKUP',                     // Hệ thống lookup TPOS tự động
    PENDING_MATCH_SELECTED: 'PENDING_MATCH_SELECTED', // NV chọn từ dropdown
    APPROVED: 'APPROVED',                           // Kế toán duyệt
    REJECTED: 'REJECTED',                           // Kế toán từ chối
    CHANGED_AND_APPROVED: 'CHANGED_AND_APPROVED',   // Kế toán thay đổi + duyệt
    WALLET_CREDITED: 'WALLET_CREDITED',             // Tiền đã cộng vào ví
    WALLET_ADJUSTMENT: 'WALLET_ADJUSTMENT',         // Điều chỉnh ví
    SKIP_MATCH: 'SKIP_MATCH',                       // Bỏ qua GD
    UNDO_SKIP: 'UNDO_SKIP'                          // Hoàn tác bỏ qua
};

/**
 * Log an audit entry for balance_history changes
 *
 * @param {Object} db - Database connection/pool
 * @param {Object} params - Audit parameters
 * @param {number} params.transactionId - ID of balance_history record
 * @param {string} params.action - Action type (from AUDIT_ACTIONS)
 * @param {Object} params.oldValue - Previous values (phone, name, status, etc.)
 * @param {Object} params.newValue - New values
 * @param {string} params.performedBy - Email/username of person performing action
 * @param {string} [params.notes] - Additional notes
 * @param {string} [params.ipAddress] - IP address (optional)
 * @param {string} [params.userAgent] - Browser info (optional)
 * @returns {Promise<{success: boolean, id?: number, error?: string}>}
 */
async function logAudit(db, {
    transactionId,
    action,
    oldValue,
    newValue,
    performedBy,
    notes = null,
    ipAddress = null,
    userAgent = null
}) {
    try {
        // Validate required fields
        if (!transactionId || !action || !performedBy) {
            throw new Error('Missing required audit fields: transactionId, action, performedBy');
        }

        // Validate action type
        if (!Object.values(AUDIT_ACTIONS).includes(action)) {
            console.warn(`[AUDIT] Unknown action type: ${action}`);
        }

        const result = await db.query(`
            INSERT INTO balance_history_audit
            (transaction_id, action, old_value, new_value, performed_by, notes, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            transactionId,
            action,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            performedBy,
            notes,
            ipAddress,
            userAgent
        ]);

        console.log(`[AUDIT] Logged action ${action} for transaction ${transactionId} by ${performedBy}`);

        return {
            success: true,
            id: result.rows[0]?.id
        };

    } catch (error) {
        console.error('[AUDIT] Error logging audit:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get audit history for a transaction
 *
 * @param {Object} db - Database connection/pool
 * @param {number} transactionId - ID of balance_history record
 * @returns {Promise<Array>} Array of audit entries
 */
async function getAuditHistory(db, transactionId) {
    try {
        const result = await db.query(`
            SELECT
                id,
                transaction_id,
                action,
                old_value,
                new_value,
                performed_by,
                performed_at,
                notes
            FROM balance_history_audit
            WHERE transaction_id = $1
            ORDER BY performed_at DESC
        `, [transactionId]);

        return result.rows;

    } catch (error) {
        console.error('[AUDIT] Error getting audit history:', error);
        return [];
    }
}

/**
 * Get recent audit entries (for admin dashboard)
 *
 * @param {Object} db - Database connection/pool
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Max entries to return
 * @param {string} [options.action] - Filter by action type
 * @param {string} [options.performedBy] - Filter by performer
 * @returns {Promise<Array>} Array of audit entries
 */
async function getRecentAudits(db, { limit = 50, action = null, performedBy = null } = {}) {
    try {
        let query = `
            SELECT
                a.id,
                a.transaction_id,
                a.action,
                a.old_value,
                a.new_value,
                a.performed_by,
                a.performed_at,
                a.notes,
                bh.content as transaction_content,
                bh.amount as transaction_amount
            FROM balance_history_audit a
            LEFT JOIN balance_history bh ON a.transaction_id = bh.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (action) {
            paramCount++;
            query += ` AND a.action = $${paramCount}`;
            params.push(action);
        }

        if (performedBy) {
            paramCount++;
            query += ` AND a.performed_by = $${paramCount}`;
            params.push(performedBy);
        }

        paramCount++;
        query += ` ORDER BY a.performed_at DESC LIMIT $${paramCount}`;
        params.push(limit);

        const result = await db.query(query, params);
        return result.rows;

    } catch (error) {
        console.error('[AUDIT] Error getting recent audits:', error);
        return [];
    }
}

/**
 * Helper: Log manual phone entry by staff
 */
async function logManualPhoneEntry(db, transactionId, { oldPhone, newPhone, oldName, newName, performedBy, notes }) {
    return logAudit(db, {
        transactionId,
        action: AUDIT_ACTIONS.MANUAL_PHONE_ENTRY,
        oldValue: { phone: oldPhone, name: oldName },
        newValue: { phone: newPhone, name: newName },
        performedBy,
        notes: notes || 'Manual phone entry via balance-history UI'
    });
}

/**
 * Helper: Log approval action
 */
async function logApproval(db, transactionId, { verificationStatus, walletAmount, performedBy, notes }) {
    return logAudit(db, {
        transactionId,
        action: AUDIT_ACTIONS.APPROVED,
        oldValue: { verification_status: 'PENDING_VERIFICATION' },
        newValue: {
            verification_status: verificationStatus || 'APPROVED',
            wallet_credited: true,
            wallet_amount: walletAmount
        },
        performedBy,
        notes
    });
}

/**
 * Helper: Log rejection action
 */
async function logRejection(db, transactionId, { performedBy, reason }) {
    return logAudit(db, {
        transactionId,
        action: AUDIT_ACTIONS.REJECTED,
        oldValue: { verification_status: 'PENDING_VERIFICATION' },
        newValue: { verification_status: 'REJECTED' },
        performedBy,
        notes: reason
    });
}

/**
 * Helper: Log change and approve action by accountant
 */
async function logChangeAndApprove(db, transactionId, { oldPhone, newPhone, oldName, newName, walletAmount, performedBy, notes }) {
    return logAudit(db, {
        transactionId,
        action: AUDIT_ACTIONS.CHANGED_AND_APPROVED,
        oldValue: { phone: oldPhone, name: oldName, verification_status: 'PENDING_VERIFICATION' },
        newValue: { phone: newPhone, name: newName, verification_status: 'APPROVED', wallet_credited: true, wallet_amount: walletAmount },
        performedBy,
        notes: notes || `Changed by accountant to ${newPhone}`
    });
}

module.exports = {
    AUDIT_ACTIONS,
    logAudit,
    getAuditHistory,
    getRecentAudits,
    logManualPhoneEntry,
    logApproval,
    logRejection,
    logChangeAndApprove
};
