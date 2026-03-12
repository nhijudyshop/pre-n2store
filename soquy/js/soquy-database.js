// =====================================================
// SỔ QUỸ - DATABASE OPERATIONS (Firestore CRUD)
// File: soquy-database.js
// =====================================================

const SoquyDatabase = (function () {
    const config = window.SoquyConfig;
    const state = window.SoquyState;

    // =====================================================
    // VOUCHER CODE GENERATION (Auto-increment)
    // =====================================================

    /**
     * Get next voucher code for a given type and fund
     * Format: PREFIX + 6-digit number (e.g., CTM003068, TTM000001)
     */
    async function getNextVoucherCode(voucherType, fundType) {
        const prefix = config.VOUCHER_CODE_PREFIX[voucherType][fundType];
        if (!prefix) throw new Error('Invalid voucher type or fund type');

        const counterDocId = `${prefix}_counter`;

        try {
            // Use Firestore transaction for atomic increment
            const counterRef = config.soquyCountersRef.doc(counterDocId);
            const newCode = await config.db.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);

                let nextNumber = 1;
                if (counterDoc.exists) {
                    nextNumber = (counterDoc.data().lastNumber || 0) + 1;
                }

                transaction.set(counterRef, {
                    lastNumber: nextNumber,
                    prefix: prefix,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                return `${prefix}${String(nextNumber).padStart(6, '0')}`;
            });

            return newCode;
        } catch (error) {
            console.error('[SoquyDB] Error generating voucher code:', error);
            // Fallback: use timestamp-based code
            const timestamp = Date.now().toString().slice(-6);
            return `${prefix}${timestamp}`;
        }
    }

    // =====================================================
    // CREATE OPERATIONS
    // =====================================================

    /**
     * Create a new voucher (receipt or payment)
     */
    async function createVoucher(voucherData) {
        try {
            const fundType = state.fundType === config.FUND_TYPES.ALL
                ? config.FUND_TYPES.CASH
                : state.fundType;

            const voucherCode = await getNextVoucherCode(voucherData.type, fundType);

            const now = new Date();
            const voucher = {
                code: voucherCode,
                type: voucherData.type, // 'receipt', 'payment_cn', or 'payment_kd'
                fundType: fundType,
                category: voucherData.category || '',
                collector: voucherData.collector || '',
                objectType: voucherData.objectType || 'Khác',
                personName: voucherData.personName || '',
                personCode: voucherData.personCode || '',
                phone: voucherData.phone || '',
                address: voucherData.address || '',
                amount: Math.abs(Number(voucherData.amount) || 0),
                note: voucherData.note || '',
                imageData: voucherData.imageData || '',
                transferContent: voucherData.transferContent || '',
                accountName: voucherData.accountName || '',
                accountNumber: voucherData.accountNumber || '',
                branch: voucherData.branch || '',
                source: voucherData.source || '', // backward compat
                sourceCode: voucherData.sourceCode || '',
                businessAccounting: voucherData.type === config.VOUCHER_TYPES.PAYMENT_KD,
                status: config.VOUCHER_STATUS.PAID,
                voucherDateTime: voucherData.dateTime
                    ? parseVoucherDateTime(voucherData.dateTime)
                    : firebase.firestore.Timestamp.fromDate(now),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: voucherData.createdBy || getCurrentUserName(),
                cancelledAt: null,
                cancelReason: ''
            };

            const docRef = await config.soquyCollectionRef.add(voucher);
            console.log('[SoquyDB] Voucher created:', voucherCode);

            // Log edit history (fire and forget)
            const typeLabel = config.VOUCHER_TYPE_LABELS[voucher.type] || voucher.type;
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('create', {
                    voucherCode: voucherCode,
                    voucherType: voucher.type,
                    description: `Tạo ${typeLabel} ${voucherCode} - ${formatCurrency(voucher.amount)}đ`
                });
            }

            return { id: docRef.id, ...voucher };
        } catch (error) {
            console.error('[SoquyDB] Error creating voucher:', error);
            throw error;
        }
    }

    // =====================================================
    // READ OPERATIONS
    // =====================================================

    /**
     * Fetch vouchers with filters applied
     */
    async function fetchVouchers() {
        try {
            // Build query with server-side filters to minimize data transfer
            let query = config.soquyCollectionRef;

            // Server-side date range filter (same field as orderBy → no composite index needed)
            const { startDate, endDate } = getDateRange();
            if (startDate && endDate) {
                const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
                const endTimestamp = firebase.firestore.Timestamp.fromDate(endDate);
                query = query
                    .where('voucherDateTime', '>=', startTimestamp)
                    .where('voucherDateTime', '<=', endTimestamp);
            }

            query = query.orderBy('voucherDateTime', 'desc');

            const snapshot = await query.get();

            let vouchers = [];
            snapshot.forEach(doc => {
                vouchers.push({ id: doc.id, ...doc.data() });
            });

            console.log('[SoquyDB] Raw vouchers from Firestore:', vouchers.length);

            // Normalize legacy 'payment' type to payment_cn or payment_kd
            vouchers = vouchers.map(v => {
                if (v.type === 'payment') {
                    v.type = v.businessAccounting ? 'payment_kd' : 'payment_cn';
                }
                return v;
            });

            // Fund type filter (client-side to avoid composite index)
            if (state.fundType !== config.FUND_TYPES.ALL) {
                vouchers = vouchers.filter(v => v.fundType === state.fundType);
                console.log('[SoquyDB] After fundType filter (' + state.fundType + '):', vouchers.length);
            }

            // Status filter (client-side to avoid composite index)
            if (state.statusFilter.length > 0) {
                vouchers = vouchers.filter(v => state.statusFilter.includes(v.status));
                console.log('[SoquyDB] After status filter (' + state.statusFilter.join(',') + '):', vouchers.length);
            }

            // Voucher type filter (supports multiple selections)
            if (state.voucherTypeFilter.length > 0) {
                vouchers = vouchers.filter(v => state.voucherTypeFilter.includes(v.type));
                console.log('[SoquyDB] After voucherType filter:', vouchers.length);
            }

            // NOTE: Search, category, creator, employee filters are applied locally
            // in applyLocalFilters() (soquy-ui.js) to avoid re-fetching on every keystroke.

            return vouchers;
        } catch (error) {
            console.error('[SoquyDB] Error fetching vouchers:', error);
            return [];
        }
    }

    // NOTE: Local filters (search, category, creator, employee) are handled
    // by applyLocalFilters() in soquy-ui.js to avoid re-fetching from Firestore.

    /**
     * Get date range based on current time filter
     */
    function getDateRange() {
        const now = new Date();
        let startDate, endDate;

        switch (state.timeFilter) {
            case config.TIME_FILTERS.THIS_MONTH:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case config.TIME_FILTERS.LAST_MONTH:
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                break;
            case config.TIME_FILTERS.THIS_QUARTER: {
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
            }
            case config.TIME_FILTERS.THIS_YEAR:
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            case config.TIME_FILTERS.CUSTOM:
                startDate = state.customStartDate ? new Date(state.customStartDate + 'T00:00:00') : null;
                endDate = state.customEndDate ? new Date(state.customEndDate + 'T23:59:59') : null;
                break;
            default:
                startDate = null;
                endDate = null;
        }

        return { startDate, endDate };
    }

    /**
     * Fetch single voucher by ID
     */
    async function getVoucher(docId) {
        try {
            const doc = await config.soquyCollectionRef.doc(docId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('[SoquyDB] Error fetching voucher:', error);
            throw error;
        }
    }

    /**
     * Calculate opening balance (all vouchers BEFORE the start date)
     */
    async function calculateOpeningBalance(fundType) {
        try {
            const { startDate } = getDateRange();
            if (!startDate) return 0;

            // Server-side filter: only fetch vouchers BEFORE startDate
            const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
            let query = config.soquyCollectionRef
                .where('voucherDateTime', '<', startTimestamp);

            const snapshot = await query.get();
            let balance = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                // Skip cancelled vouchers
                if (data.status !== config.VOUCHER_STATUS.PAID) return;
                // Fund type filter
                if (fundType !== config.FUND_TYPES.ALL && data.fundType !== fundType) return;
                // Normalize legacy type
                const type = data.type === 'payment'
                    ? (data.businessAccounting ? 'payment_kd' : 'payment_cn')
                    : data.type;
                if (type === config.VOUCHER_TYPES.RECEIPT) {
                    balance += Math.abs(data.amount || 0);
                } else {
                    balance -= Math.abs(data.amount || 0);
                }
            });

            return balance;
        } catch (error) {
            console.error('[SoquyDB] Error calculating opening balance:', error);
            return 0;
        }
    }

    // =====================================================
    // UPDATE OPERATIONS
    // =====================================================

    /**
     * Update voucher details
     */
    async function updateVoucher(docId, updateData) {
        try {
            // Save old data BEFORE update for change tracking
            let oldData = null;
            let voucherCode = '';
            let voucherType = '';
            try {
                const oldDoc = await config.soquyCollectionRef.doc(docId).get();
                if (oldDoc.exists) {
                    oldData = oldDoc.data();
                    voucherCode = oldData.code || '';
                    voucherType = oldData.type || '';
                }
            } catch (e) {
                console.error('[SoquyDB] Error fetching old data for edit log:', e);
            }

            const cleanData = {
                ...updateData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Don't allow changing code
            delete cleanData.code;
            delete cleanData.id;

            if (cleanData.amount !== undefined) {
                cleanData.amount = Math.abs(Number(cleanData.amount) || 0);
            }

            if (cleanData.dateTime) {
                cleanData.voucherDateTime = parseVoucherDateTime(cleanData.dateTime);
                delete cleanData.dateTime;
            }

            await config.soquyCollectionRef.doc(docId).update(cleanData);
            console.log('[SoquyDB] Voucher updated:', docId);

            // Log edit history with changes (fire and forget)
            if (window.SoquyEditHistory && oldData) {
                const changes = SoquyEditHistory.computeChanges(oldData, cleanData);
                // Remove internal fields from changes
                delete changes.updatedAt;
                if (Object.keys(changes).length > 0) {
                    SoquyEditHistory.logEditHistory('edit', {
                        voucherCode: voucherCode,
                        voucherType: voucherType,
                        changes: changes,
                        description: `Sửa phiếu ${voucherCode}`
                    });
                }
            }

            return true;
        } catch (error) {
            console.error('[SoquyDB] Error updating voucher:', error);
            throw error;
        }
    }

    /**
     * Cancel a voucher (soft delete)
     */
    async function cancelVoucher(docId, reason) {
        try {
            // Get voucher info for logging
            let voucherCode = '';
            let voucherType = '';
            try {
                const doc = await config.soquyCollectionRef.doc(docId).get();
                if (doc.exists) {
                    voucherCode = doc.data().code || '';
                    voucherType = doc.data().type || '';
                }
            } catch (e) { /* ignore */ }

            await config.soquyCollectionRef.doc(docId).update({
                status: config.VOUCHER_STATUS.CANCELLED,
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                cancelReason: reason || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('[SoquyDB] Voucher cancelled:', docId);

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                const reasonText = reason ? ` - Lý do: ${reason}` : '';
                SoquyEditHistory.logEditHistory('cancel', {
                    voucherCode: voucherCode,
                    voucherType: voucherType,
                    extra: { cancelReason: reason || '' },
                    description: `Hủy phiếu ${voucherCode}${reasonText}`
                });
            }

            return true;
        } catch (error) {
            console.error('[SoquyDB] Error cancelling voucher:', error);
            throw error;
        }
    }

    // =====================================================
    // DELETE OPERATIONS
    // =====================================================

    /**
     * Permanently delete a voucher (admin only)
     */
    async function deleteVoucher(docId) {
        try {
            // Get voucher info for logging before deletion
            let voucherCode = '';
            let voucherType = '';
            try {
                const doc = await config.soquyCollectionRef.doc(docId).get();
                if (doc.exists) {
                    voucherCode = doc.data().code || '';
                    voucherType = doc.data().type || '';
                }
            } catch (e) { /* ignore */ }

            await config.soquyCollectionRef.doc(docId).delete();
            console.log('[SoquyDB] Voucher deleted:', docId);

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('delete', {
                    voucherCode: voucherCode,
                    voucherType: voucherType,
                    description: `Xóa phiếu ${voucherCode}`
                });
            }

            return true;
        } catch (error) {
            console.error('[SoquyDB] Error deleting voucher:', error);
            throw error;
        }
    }

    /**
     * Delete ALL vouchers from Firestore (and reset counters)
     * @returns {Object} { deleted: number }
     */
    async function deleteAllVouchers() {
        try {
            const snapshot = await config.soquyCollectionRef.get();
            const total = snapshot.size;
            console.log('[SoquyDB] Deleting all vouchers:', total);

            // Delete in batches of 500 (Firestore batch limit)
            const batchSize = 500;
            let deleted = 0;
            const docs = snapshot.docs;

            for (let i = 0; i < docs.length; i += batchSize) {
                const batch = config.soquyCollectionRef.firestore.batch();
                const chunk = docs.slice(i, i + batchSize);
                chunk.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                deleted += chunk.length;
                console.log(`[SoquyDB] Deleted batch: ${deleted}/${total}`);
            }

            // Reset counters
            const countersSnapshot = await config.soquyCountersRef.get();
            if (countersSnapshot.size > 0) {
                const counterBatch = config.soquyCountersRef.firestore.batch();
                countersSnapshot.forEach(doc => counterBatch.delete(doc.ref));
                await counterBatch.commit();
                console.log('[SoquyDB] Counters reset');
            }

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('delete_all', {
                    extra: { deletedCount: deleted },
                    description: `Xóa toàn bộ ${deleted} phiếu`
                });
            }

            return { deleted };
        } catch (error) {
            console.error('[SoquyDB] Error deleting all vouchers:', error);
            throw error;
        }
    }

    // =====================================================
    // IMPORT FROM EXCEL
    // =====================================================

    /**
     * Import vouchers from parsed Excel data
     * @param {Array} rows - Array of row objects from Excel
     * @returns {Object} { success: number, errors: Array }
     */
    async function importVouchers(rows) {
        const results = { success: 0, skipped: [], errors: [] };

        console.log('[SoquyDB] Starting import of', rows.length, 'rows');
        console.log('[SoquyDB] Current state.fundType:', state.fundType);
        if (rows.length > 0) {
            console.log('[SoquyDB] Excel columns:', Object.keys(rows[0]));
            console.log('[SoquyDB] First row data:', JSON.stringify(rows[0]));
        }

        // Pre-fetch all existing voucher codes to check for duplicates
        const existingCodes = new Set();
        try {
            const snapshot = await config.soquyCollectionRef.get();
            snapshot.forEach(doc => {
                const code = (doc.data().code || '').trim();
                if (code) existingCodes.add(code);
            });
            console.log('[SoquyDB] Existing voucher codes:', existingCodes.size);
        } catch (error) {
            console.error('[SoquyDB] Error fetching existing codes:', error);
        }

        for (let i = 0; i < rows.length; i++) {
            try {
                const row = rows[i];
                const voucherType = detectVoucherType(row);
                const detectedFund = detectFundType(row);
                const fundType = detectedFund || state.fundType;
                const effectiveFund = fundType === config.FUND_TYPES.ALL
                    ? config.FUND_TYPES.CASH : fundType;

                // Use Excel code if provided, otherwise generate new one
                const excelCode = String(row['Mã phiếu'] || row['code'] || '').trim();
                const voucherCode = excelCode || await getNextVoucherCode(voucherType, effectiveFund);

                // Skip if voucher code already exists
                if (existingCodes.has(voucherCode)) {
                    console.log(`[SoquyDB] Row ${i + 1}: SKIPPED - code "${voucherCode}" already exists`);
                    results.skipped.push({ row: i + 1, code: voucherCode });
                    continue;
                }

                const now = new Date();
                const rawDateTime = row['Thời gian'] || row['voucherDateTime'];
                const parsedDateTime = parseImportDateTime(rawDateTime);

                const voucher = {
                    code: voucherCode,
                    type: voucherType,
                    fundType: effectiveFund,
                    category: String(row['Loại thu chi'] || row['category'] || '').trim(),
                    collector: String(row['Nhân viên'] || row['collector'] || '').trim(),
                    objectType: String(row['Đối tượng'] || row['objectType'] || 'Khác').trim(),
                    personName: String(row['Người nộp/nhận'] || row['personName'] || '').trim(),
                    personCode: String(row['Mã người nộp/nhận'] || row['personCode'] || '').trim(),
                    phone: String(row['Số điện thoại'] || row['phone'] || '').trim(),
                    address: String(row['Địa chỉ'] || row['address'] || '').trim(),
                    amount: Math.abs(parseImportAmount(row['Giá trị'] || row['amount'] || 0)),
                    note: String(row['Ghi chú'] || row['note'] || '').trim(),
                    transferContent: String(row['Nội dung chuyển khoản'] || row['transferContent'] || '').trim(),
                    accountName: String(row['Tên tài khoản'] || row['accountName'] || '').trim(),
                    accountNumber: String(row['Số tài khoản'] || row['accountNumber'] || '').trim(),
                    branch: String(row['Chi nhánh'] || row['branch'] || '').trim(),
                    businessAccounting: voucherType === config.VOUCHER_TYPES.PAYMENT_KD,
                    status: config.VOUCHER_STATUS.PAID,
                    voucherDateTime: parsedDateTime
                        || firebase.firestore.Timestamp.fromDate(now),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: String(row['Người tạo'] || row['createdBy'] || getCurrentUserName()).trim(),
                    cancelledAt: null,
                    cancelReason: ''
                };

                console.log(`[SoquyDB] Row ${i + 1}: code=${voucher.code}, type=${voucher.type}, fundType=${voucher.fundType}, status=${voucher.status}, dateTime=`, voucher.voucherDateTime);

                await config.soquyCollectionRef.add(voucher);

                // Track this new code to avoid duplicates within the same import batch
                existingCodes.add(voucherCode);

                // Auto-add category if not in predefined list
                if (voucher.category) {
                    await autoAddCategory(voucher.category, voucherType);
                }
                // Auto-add creator if not in predefined list
                if (voucher.createdBy && voucher.createdBy !== 'Admin') {
                    await autoAddCreator(voucher.createdBy);
                }

                results.success++;
            } catch (error) {
                console.error(`[SoquyDB] Error importing row ${i + 1}:`, error);
                results.errors.push({ row: i + 1, error: error.message });
            }
        }

        // Log edit history for import (fire and forget)
        if (window.SoquyEditHistory && results.success > 0) {
            SoquyEditHistory.logEditHistory('import', {
                extra: { importCount: results.success },
                description: `Import ${results.success} phiếu từ Excel`
            });
        }

        return results;
    }

    function detectVoucherType(row) {
        // 1. Check explicit type column
        const type = String(row['Loại'] || row['type'] || '').toLowerCase();
        if (type.includes('thu') || type === 'receipt') return config.VOUCHER_TYPES.RECEIPT;
        if (type.includes('chi kd') || type === 'payment_kd') return config.VOUCHER_TYPES.PAYMENT_KD;
        if (type.includes('chi cn') || type === 'payment_cn') return config.VOUCHER_TYPES.PAYMENT_CN;
        if (type.includes('chi') || type === 'payment') return config.VOUCHER_TYPES.PAYMENT_KD;

        // 2. Detect from voucher code prefix
        const code = String(row['Mã phiếu'] || row['code'] || '').toUpperCase();
        if (code.startsWith('CKD')) return config.VOUCHER_TYPES.PAYMENT_KD;
        if (code.startsWith('CCN')) return config.VOUCHER_TYPES.PAYMENT_CN;
        if (code.startsWith('C')) return config.VOUCHER_TYPES.PAYMENT_KD; // legacy CTM/CNH/CVD
        if (code.startsWith('T')) return config.VOUCHER_TYPES.RECEIPT;

        // 3. Detect by amount sign
        const amount = parseFloat(String(row['Giá trị'] || row['amount'] || '0').replace(/[.,\s]/g, ''));
        return amount < 0 ? config.VOUCHER_TYPES.PAYMENT_KD : config.VOUCHER_TYPES.RECEIPT;
    }

    function detectFundType(row) {
        // 1. Check explicit fund type column
        const fund = String(row['Loại sổ quỹ'] || row['Quỹ'] || row['fundType'] || '').toLowerCase();
        if (fund.includes('mặt') || fund === 'cash') return config.FUND_TYPES.CASH;
        if (fund.includes('ngân') || fund === 'bank') return config.FUND_TYPES.BANK;
        if (fund.includes('ví') || fund === 'ewallet') return config.FUND_TYPES.EWALLET;

        // 2. Detect from voucher code prefix
        const code = String(row['Mã phiếu'] || row['code'] || '').toUpperCase();
        if (code.startsWith('CTM') || code.startsWith('TTM')) return config.FUND_TYPES.CASH;
        if (code.startsWith('CNH') || code.startsWith('TNH')) return config.FUND_TYPES.BANK;
        if (code.startsWith('CVD') || code.startsWith('TVD')) return config.FUND_TYPES.EWALLET;
        // CCN/CKD prefixes don't carry fund type info, fall through to null

        return null;
    }

    function parseImportAmount(value) {
        if (typeof value === 'number') return value;
        const cleaned = String(value).replace(/[.,\s]/g, '');
        return parseInt(cleaned) || 0;
    }

    function parseImportDateTime(value) {
        if (!value) return null;
        // Try dd/MM/yyyy HH:mm format
        const result = parseVoucherDateTime(String(value));
        if (result) return result;
        // Try Date object from Excel
        if (value instanceof Date && !isNaN(value.getTime())) {
            return firebase.firestore.Timestamp.fromDate(value);
        }
        return null;
    }

    function parseBoolean(value, defaultVal) {
        if (value === undefined || value === null || value === '') return defaultVal;
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase().trim();
        if (str === 'có' || str === 'yes' || str === 'true' || str === '1') return true;
        if (str === 'không' || str === 'no' || str === 'false' || str === '0') return false;
        return defaultVal;
    }

    // =====================================================
    // DYNAMIC CATEGORIES & CREATORS
    // =====================================================

    /**
     * Auto-add a category if it doesn't exist in the predefined list
     */
    function getCategoryDocId(voucherType) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) return 'receipt_categories';
        if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) return 'payment_cn_categories';
        return 'payment_kd_categories';
    }

    function getCategoryPredefined(voucherType) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) return config.RECEIPT_CATEGORIES;
        if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) return config.PAYMENT_CN_CATEGORIES;
        return config.PAYMENT_KD_CATEGORIES;
    }

    function getCategoryDynamicList(voucherType) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) return state.dynamicReceiptCategories;
        if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) return state.dynamicPaymentCNCategories;
        return state.dynamicPaymentKDCategories;
    }

    function setCategoryDynamicList(voucherType, list) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) state.dynamicReceiptCategories = list;
        else if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) state.dynamicPaymentCNCategories = list;
        else state.dynamicPaymentKDCategories = list;
    }

    function getRemovedDocId(voucherType) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) return 'removed_receipt_categories';
        if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) return 'removed_payment_cn_categories';
        return 'removed_payment_kd_categories';
    }

    function getRemovedStateKey(voucherType) {
        if (voucherType === config.VOUCHER_TYPES.RECEIPT) return 'removedPredefinedReceiptCategories';
        if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN) return 'removedPredefinedPaymentCNCategories';
        return 'removedPredefinedPaymentKDCategories';
    }

    /**
     * Helper: check if voucher type uses source-linked categories (receipt & KD)
     */
    function isSourceLinkedType(voucherType) {
        return voucherType === config.VOUCHER_TYPES.RECEIPT || voucherType === config.VOUCHER_TYPES.PAYMENT_KD;
    }

    /**
     * Get category name from a category item (string or object)
     */
    function getCategoryName(cat) {
        if (typeof cat === 'object' && cat !== null) return cat.name || '';
        return String(cat || '');
    }

    /**
     * Get category sourceCode from a category item (string or object)
     */
    function getCategorySourceCode(cat) {
        if (typeof cat === 'object' && cat !== null) return cat.sourceCode || '';
        return '';
    }

    async function autoAddCategory(category, voucherType, sourceCode) {
        category = String(category || '').trim();
        if (!category) return;
        sourceCode = String(sourceCode || '').trim();

        const predefined = getCategoryPredefined(voucherType);
        const dynamicList = getCategoryDynamicList(voucherType);

        // Check if already exists
        const allNames = [
            ...predefined.map(c => String(c).toLowerCase()),
            ...dynamicList.map(c => getCategoryName(c).toLowerCase())
        ];
        if (allNames.includes(category.toLowerCase())) return;

        const useSourceLinked = isSourceLinkedType(voucherType);
        const newItem = useSourceLinked ? { name: category, sourceCode } : category;

        try {
            const docId = getCategoryDocId(voucherType);
            const docRef = config.soquyMetaRef.doc(docId);
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            // Migrate old string items for source-linked types
            if (useSourceLinked) {
                items = items.map(c => typeof c === 'string' ? { name: c, sourceCode: '' } : c);
            }

            const itemNames = items.map(c => getCategoryName(c).toLowerCase());
            if (!itemNames.includes(category.toLowerCase())) {
                items.push(newItem);
                await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            // Update local state
            const existsInLocal = dynamicList.some(c => getCategoryName(c).toLowerCase() === category.toLowerCase());
            if (!existsInLocal) {
                dynamicList.push(newItem);
            }

            console.log('[SoquyDB] Auto-added category:', category, sourceCode ? `(source: ${sourceCode})` : '');

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('category_add', {
                    extra: { categoryName: category, categoryType: voucherType },
                    description: `Thêm danh mục ${category}`
                });
            }
        } catch (error) {
            console.error('[SoquyDB] Error auto-adding category:', error);
        }
    }

    /**
     * Delete specific dynamic categories
     * @param {string[]} categories - Array of category names to delete
     * @param {string} voucherType - 'receipt' or 'payment'
     */
    async function deleteDynamicCategories(categories, voucherType) {
        if (!categories || categories.length === 0) return;

        const docId = getCategoryDocId(voucherType);
        const deleteLower = categories.map(c => String(c).toLowerCase());

        try {
            const docRef = config.soquyMetaRef.doc(docId);
            const doc = await docRef.get();

            if (!doc.exists) return;

            let items = doc.data().items || [];
            items = items.filter(item => !deleteLower.includes(getCategoryName(item).toLowerCase()));

            await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

            // Also remove from old payment_categories doc to prevent migration re-adding
            if (voucherType === config.VOUCHER_TYPES.PAYMENT_CN || voucherType === config.VOUCHER_TYPES.PAYMENT_KD) {
                try {
                    const oldDocRef = config.soquyMetaRef.doc('payment_categories');
                    const oldDoc = await oldDocRef.get();
                    if (oldDoc.exists) {
                        let oldItems = oldDoc.data().items || [];
                        const before = oldItems.length;
                        oldItems = oldItems.filter(item => {
                            const name = typeof item === 'string' ? item : (item.name || '');
                            return !deleteLower.includes(name.toLowerCase());
                        });
                        if (oldItems.length !== before) {
                            await oldDocRef.set({ items: oldItems, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                        }
                    }
                } catch (e) { /* ignore old doc cleanup errors */ }
            }

            // Update local state
            const dynamicList = getCategoryDynamicList(voucherType);
            const filtered = dynamicList.filter(c => !deleteLower.includes(getCategoryName(c).toLowerCase()));
            setCategoryDynamicList(voucherType, filtered);

            console.log('[SoquyDB] Deleted categories:', categories);

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('category_delete', {
                    extra: { categoryNames: categories },
                    description: `Xóa danh mục ${categories.join(', ')}`
                });
            }
        } catch (error) {
            console.error('[SoquyDB] Error deleting categories:', error);
            throw error;
        }
    }

    /**
     * Remove a single predefined category (add to removed list in Firestore)
     */
    async function removePredefinedCategory(categoryName, voucherType) {
        return removePredefinedCategories([categoryName], voucherType);
    }

    /**
     * Remove predefined categories by storing them in a "removed" list
     */
    async function removePredefinedCategories(categories, voucherType) {
        if (!categories || categories.length === 0) return;

        const docId = getRemovedDocId(voucherType);
        const stateKey = getRemovedStateKey(voucherType);

        try {
            const docRef = config.soquyMetaRef.doc(docId);
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            categories.forEach(cat => {
                if (!items.some(c => String(c).toLowerCase() === String(cat).toLowerCase())) {
                    items.push(cat);
                }
            });

            await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

            // Update local state
            if (!state[stateKey]) state[stateKey] = [];
            categories.forEach(cat => {
                if (!state[stateKey].includes(cat)) {
                    state[stateKey].push(cat);
                }
            });

            console.log('[SoquyDB] Removed predefined categories:', categories);
        } catch (error) {
            console.error('[SoquyDB] Error removing predefined categories:', error);
            throw error;
        }
    }

    /**
     * Add a source with code and name. Source: { code: 'AA', name: 'Bán hàng' }
     */
    async function addSource(sourceObj) {
        if (!sourceObj || !sourceObj.code || !sourceObj.name) return;
        const code = String(sourceObj.code).trim().toUpperCase();
        const name = String(sourceObj.name).trim();
        if (!code || !name) return;

        const dynamicList = state.dynamicSources;
        if (dynamicList.some(s => s.code === code)) return;

        try {
            const docRef = config.soquyMetaRef.doc('sources');
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            // Migrate: convert old string items to {code, name} objects
            items = items.map(s => typeof s === 'string' ? { code: s, name: s } : s);

            if (!items.some(s => s.code === code)) {
                items.push({ code, name });
                await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            if (!state.dynamicSources.some(s => s.code === code)) {
                state.dynamicSources.push({ code, name });
            }

            console.log('[SoquyDB] Added source:', code, name);

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('source_add', {
                    extra: { sourceCode: code, sourceName: name },
                    description: `Thêm nguồn ${name} (${code})`
                });
            }
        } catch (error) {
            console.error('[SoquyDB] Error adding source:', error);
        }
    }

    /**
     * Get source object by code
     */
    function getSourceByCode(code) {
        if (!code) return null;
        return state.dynamicSources.find(s => s.code === code) || null;
    }

    /**
     * Get display label for a source code (name only)
     */
    function getSourceLabel(code) {
        const src = getSourceByCode(code);
        if (!src) return code || '';
        return src.name;
    }

    /**
     * Set a source as the default source (saved to Firestore)
     */
    async function setDefaultSource(code) {
        try {
            const docRef = config.soquyMetaRef.doc('sources');
            await docRef.set({ defaultSource: code || '' }, { merge: true });
            state.defaultSourceCode = code || '';
            console.log('[SoquyDB] Set default source:', code);
        } catch (error) {
            console.error('[SoquyDB] Error setting default source:', error);
            throw error;
        }
    }

    /**
     * Get the default source code from state
     */
    function getDefaultSource() {
        return state.defaultSourceCode || '';
    }

    /**
     * Delete specific dynamic sources
     */
    async function deleteDynamicSources(codes) {
        if (!codes || codes.length === 0) return;

        try {
            const docRef = config.soquyMetaRef.doc('sources');
            const doc = await docRef.get();

            if (!doc.exists) return;

            let items = doc.data().items || [];
            // Migrate old string items
            items = items.map(s => typeof s === 'string' ? { code: s, name: s } : s);
            items = items.filter(item => !codes.includes(item.code));

            await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

            state.dynamicSources = state.dynamicSources.filter(s => !codes.includes(s.code));

            console.log('[SoquyDB] Deleted sources:', codes);

            // Log edit history (fire and forget)
            if (window.SoquyEditHistory) {
                SoquyEditHistory.logEditHistory('source_delete', {
                    extra: { sourceCode: codes.join(', '), sourceName: codes.join(', ') },
                    description: `Xóa nguồn ${codes.join(', ')}`
                });
            }
        } catch (error) {
            console.error('[SoquyDB] Error deleting sources:', error);
            throw error;
        }
    }

    /**
     * Auto-add a creator if not already known
     */
    async function autoAddCreator(creatorName) {
        creatorName = String(creatorName || '').trim();
        if (!creatorName) return;

        const dynamicList = state.dynamicCreators;
        if (dynamicList.some(c => String(c).toLowerCase() === creatorName.toLowerCase())) return;

        try {
            const docRef = config.soquyMetaRef.doc('creators');
            const doc = await docRef.get();

            let items = [];
            if (doc.exists) {
                items = doc.data().items || [];
            }

            if (!items.some(c => String(c).toLowerCase() === creatorName.toLowerCase())) {
                items.push(creatorName);
                await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            if (!state.dynamicCreators.includes(creatorName)) {
                state.dynamicCreators.push(creatorName);
            }

            console.log('[SoquyDB] Auto-added creator:', creatorName);
        } catch (error) {
            console.error('[SoquyDB] Error auto-adding creator:', error);
        }
    }

    /**
     * Load dynamic categories & creators from Firestore
     */
    async function loadDynamicMeta() {
        try {
            const [rcDoc, pcnDoc, pkdDoc, crDoc, srcDoc, rrcDoc, rpcnDoc, rpkdDoc] = await Promise.all([
                config.soquyMetaRef.doc('receipt_categories').get(),
                config.soquyMetaRef.doc('payment_cn_categories').get(),
                config.soquyMetaRef.doc('payment_kd_categories').get(),
                config.soquyMetaRef.doc('creators').get(),
                config.soquyMetaRef.doc('sources').get(),
                config.soquyMetaRef.doc('removed_receipt_categories').get(),
                config.soquyMetaRef.doc('removed_payment_cn_categories').get(),
                config.soquyMetaRef.doc('removed_payment_kd_categories').get()
            ]);

            if (rcDoc.exists) {
                const rcItems = rcDoc.data().items || [];
                // Migrate: string items → {name, sourceCode: ''} for receipt
                state.dynamicReceiptCategories = rcItems.map(c => typeof c === 'string' ? { name: c, sourceCode: '' } : c);
            }
            if (pcnDoc.exists) state.dynamicPaymentCNCategories = pcnDoc.data().items || [];
            if (pkdDoc.exists) {
                const pkdItems = pkdDoc.data().items || [];
                // Migrate: string items → {name, sourceCode: ''} for KD
                state.dynamicPaymentKDCategories = pkdItems.map(c => typeof c === 'string' ? { name: c, sourceCode: '' } : c);
            }
            if (crDoc.exists) state.dynamicCreators = crDoc.data().items || [];
            if (srcDoc.exists) {
                const srcData = srcDoc.data();
                const rawSources = srcData.items || [];
                // Migrate: convert old string items to {code, name} objects
                state.dynamicSources = rawSources.map(s => typeof s === 'string' ? { code: s, name: s } : s);
                state.defaultSourceCode = srcData.defaultSource || '';
            }
            state.removedPredefinedReceiptCategories = rrcDoc.exists ? (rrcDoc.data().items || []) : [];
            state.removedPredefinedPaymentCNCategories = rpcnDoc.exists ? (rpcnDoc.data().items || []) : [];
            state.removedPredefinedPaymentKDCategories = rpkdDoc.exists ? (rpkdDoc.data().items || []) : [];

            // Migrate: also load old payment_categories into both CN/KD for backward compat
            try {
                const oldPcDoc = await config.soquyMetaRef.doc('payment_categories').get();
                if (oldPcDoc.exists) {
                    const oldItems = oldPcDoc.data().items || [];
                    oldItems.forEach(cat => {
                        const catName = typeof cat === 'string' ? cat : (cat.name || '');
                        if (!state.dynamicPaymentCNCategories.some(c => String(c).toLowerCase() === catName.toLowerCase())) {
                            state.dynamicPaymentCNCategories.push(catName);
                        }
                        if (!state.dynamicPaymentKDCategories.some(c => getCategoryName(c).toLowerCase() === catName.toLowerCase())) {
                            state.dynamicPaymentKDCategories.push({ name: catName, sourceCode: '' });
                        }
                    });
                }
                const oldRpcDoc = await config.soquyMetaRef.doc('removed_payment_categories').get();
                if (oldRpcDoc.exists) {
                    const oldRemoved = oldRpcDoc.data().items || [];
                    oldRemoved.forEach(cat => {
                        if (!state.removedPredefinedPaymentCNCategories.includes(cat)) state.removedPredefinedPaymentCNCategories.push(cat);
                        if (!state.removedPredefinedPaymentKDCategories.includes(cat)) state.removedPredefinedPaymentKDCategories.push(cat);
                    });
                }
            } catch (e) { /* ignore migration errors */ }

            console.log('[SoquyDB] Dynamic meta loaded');
        } catch (error) {
            console.error('[SoquyDB] Error loading dynamic meta:', error);
        }
    }

    // =====================================================
    // EXPORT
    // =====================================================

    /**
     * Export vouchers to CSV format for Excel
     */
    function exportToCSV(vouchers) {
        const isPayment = (type) => type === config.VOUCHER_TYPES.PAYMENT_CN || type === config.VOUCHER_TYPES.PAYMENT_KD;

        const headers = [
            'Mã phiếu',
            'Loại',
            'Quỹ',
            'Thời gian',
            'Mã nguồn',
            'Nguồn',
            'Loại thu chi',
            'Người nộp/nhận',
            'Người thu/chi',
            'Giá trị',
            'Ghi chú',
            'Trạng thái',
            'Người tạo'
        ];

        const rows = vouchers.map(v => {
            const srcCode = v.sourceCode || v.source || '';
            const srcObj = getSourceByCode(srcCode);
            return [
                v.code,
                config.VOUCHER_TYPE_LABELS[v.type] || 'Phiếu chi',
                config.FUND_TYPE_LABELS[v.fundType] || v.fundType,
                formatVoucherDateTime(v.voucherDateTime),
                srcCode,
                srcObj ? srcObj.name : srcCode,
                v.sourceCode ? `${v.sourceCode} ${v.category}` : v.category,
                v.personName,
                v.collector,
                isPayment(v.type) ? -Math.abs(v.amount) : Math.abs(v.amount),
                v.note,
                config.VOUCHER_STATUS_LABELS[v.status] || v.status,
                v.createdBy
            ];
        });

        const BOM = '\uFEFF';
        const csvContent = BOM + [
            headers.join(','),
            ...rows.map(row =>
                row.map(cell => {
                    const str = String(cell || '');
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        link.href = url;
        link.download = `SoQuy_${dateStr}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function toDate(timestamp) {
        if (!timestamp) return new Date(0);
        if (timestamp.toDate) return timestamp.toDate();
        if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
        return new Date(timestamp);
    }

    function formatVoucherDateTime(timestamp) {
        const date = toDate(timestamp);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    function parseVoucherDateTime(dateTimeStr) {
        // Parse "dd/MM/yyyy HH:mm" format
        const match = dateTimeStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (match) {
            const date = new Date(
                parseInt(match[3]),
                parseInt(match[2]) - 1,
                parseInt(match[1]),
                parseInt(match[4]),
                parseInt(match[5])
            );
            return firebase.firestore.Timestamp.fromDate(date);
        }
        // Try ISO format
        const date = new Date(dateTimeStr);
        if (!isNaN(date.getTime())) {
            return firebase.firestore.Timestamp.fromDate(date);
        }
        return firebase.firestore.Timestamp.fromDate(new Date());
    }

    function getCurrentUserName() {
        try {
            // Read from loginindex_auth (sessionStorage first, then localStorage)
            const authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            const authData = JSON.parse(authStr);
            return authData.displayName || authData.username || '';
        } catch {
            return '';
        }
    }

    /**
     * Fetch all users from Firestore 'users' collection
     * Returns array of { username, displayName, isAdmin, roleTemplate, detailedPermissions }
     */
    async function fetchAllUsers() {
        try {
            const snapshot = await config.db.collection('users').get();
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                users.push({
                    username: doc.id,
                    displayName: data.displayName || doc.id,
                    isAdmin: data.isAdmin || false,
                    roleTemplate: data.roleTemplate || '',
                    detailedPermissions: data.detailedPermissions || {}
                });
            });
            state.allUsers = users;
            console.log('[SoquyDB] Loaded users:', users.length);
            return users;
        } catch (error) {
            console.error('[SoquyDB] Error fetching users:', error);
            return [];
        }
    }

    function formatCurrency(amount) {
        if (amount === null || amount === undefined) return '0';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        getNextVoucherCode,
        createVoucher,
        fetchVouchers,
        getVoucher,
        calculateOpeningBalance,
        updateVoucher,
        cancelVoucher,
        deleteVoucher,
        deleteAllVouchers,
        exportToCSV,
        importVouchers,
        autoAddCategory,
        deleteDynamicCategories,
        removePredefinedCategory,
        removePredefinedCategories,
        autoAddCreator,
        addSource,
        deleteDynamicSources,
        setDefaultSource,
        getDefaultSource,
        getSourceByCode,
        getSourceLabel,
        loadDynamicMeta,
        getDateRange,
        toDate,
        formatVoucherDateTime,
        parseVoucherDateTime,
        getCurrentUserName,
        fetchAllUsers,
        formatCurrency,
        getCategoryPredefined,
        getCategoryDynamicList,
        getCategoryName,
        getCategorySourceCode,
        isSourceLinkedType,
        getRemovedStateKey
    };
})();

// Export
window.SoquyDatabase = SoquyDatabase;
