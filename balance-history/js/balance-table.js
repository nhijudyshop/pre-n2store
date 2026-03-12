// =====================================================
// BALANCE HISTORY - TABLE MODULE
// Table rendering, row building, pagination, sorting,
// gap detection, source standardization, statistics,
// hide/show transactions
// =====================================================

// NOTE: This module depends on balance-core.js for:
// - formatCurrency, formatDateTime (helpers)
// - API_BASE_URL, allLoadedData, filters, viewMode (state)
// - loadData, loadStatistics, getBHCache, setBHCache, updateHiddenCount (functions)
// - showNotification (notifications)

// NOTE: This module depends on balance-filters.js for filter state

// =====================================================
// SOURCE GROUP STANDARDIZATION FUNCTIONS
// =====================================================

/**
 * Chuan hoa nguon giao dich thanh 1 trong 4 nhom.
 * @param {Object} row - Object giao dich
 * @returns {"manual"|"selected"|"auto"|"unknown"} Nhom nguon chuan hoa
 *
 * Mapping:
 *   manual_entry, manual_link -> "manual" (Nhap tay)
 *   pending_match -> "selected" (Chon KH)
 *   qr_code, exact_phone, single_match -> "auto" (Tu dong)
 *   extraction_note bat dau bang MOMO: hoac VCB: -> "auto" (Tu dong)
 *   Khong co match_method va khong mapping -> "unknown" (Chua xac dinh)
 */
function getStandardizedSourceGroup(row) {
    if (!row) return 'unknown';

    // Check extraction_note first (MOMO/VCB patterns)
    const extractionNote = row.extraction_note || '';
    if (extractionNote.startsWith('MOMO:') || extractionNote.startsWith('VCB:')) {
        return 'auto';
    }

    // Check match_method
    const matchMethod = row.match_method;
    if (matchMethod) {
        switch (matchMethod) {
            case 'manual_entry':
            case 'manual_link':
                return 'manual';
            case 'pending_match':
                return 'selected';
            case 'qr_code':
            case 'exact_phone':
            case 'single_match':
                return 'auto';
        }
    }

    return 'unknown';
}

/**
 * Tra ve nhan tieng Viet cho nhom nguon.
 * @param {"manual"|"selected"|"auto"|"unknown"} groupKey
 * @returns {string} Nhan tieng Viet
 */
function getSourceLabel(groupKey) {
    const labels = {
        manual: 'Nhap tay',
        selected: 'Chon KH',
        auto: 'Tu dong',
        unknown: 'Chua xac dinh'
    };
    return labels[groupKey] || 'Chua xac dinh';
}

/**
 * Tra ve HTML badge voi mau sac phu hop cho nhom nguon.
 * @param {"manual"|"selected"|"auto"|"unknown"} groupKey
 * @returns {string} HTML badge string
 */
function getSourceBadgeHtml(groupKey) {
    const config = {
        manual: { label: 'Nhap tay', color: '#3b82f6', icon: 'pencil' },
        selected: { label: 'Chon KH', color: '#f97316', icon: 'users' },
        auto: { label: 'Tu dong', color: '#10b981', icon: 'check-circle' },
        unknown: { label: 'Chua xac dinh', color: '#d1d5db', icon: 'help-circle' }
    };
    const cfg = config[groupKey] || config.unknown;
    return `<span class="badge" style="background-color: ${cfg.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;" title="${cfg.label}"><i data-lucide="${cfg.icon}" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px;"></i>${cfg.label}</span>`;
}

function getMappingSource(row, uniqueCode) {
    // Use standardized source group from task 1.1
    const groupKey = getStandardizedSourceGroup(row);
    const label = getSourceLabel(groupKey);

    // Config for each standardized group
    const groupConfig = {
        manual: { icon: 'pencil', color: '#3b82f6' },
        selected: { icon: 'users', color: '#f97316' },
        auto: { icon: 'check-circle', color: '#10b981' },
        unknown: { icon: 'help-circle', color: '#d1d5db' }
    };

    const cfg = groupConfig[groupKey] || groupConfig.unknown;

    // Build detailed tooltip (title) based on original source info
    let title = '';
    const extractionNote = row.extraction_note || '';
    const matchMethod = row.match_method;

    if (extractionNote.startsWith('MOMO:')) {
        title = 'Giao dich tu Momo - SDT trich xuat tu noi dung KH ghi';
    } else if (extractionNote.startsWith('VCB:')) {
        title = 'Giao dich tu Vietcombank - SDT trich xuat tu ma MBVCB';
    } else if (matchMethod) {
        switch (matchMethod) {
            case 'manual_entry':
                title = 'NV nhap SDT thu cong - Cho ke toan duyet';
                break;
            case 'manual_link':
                title = 'Ke toan gan KH va duyet';
                break;
            case 'qr_code':
                title = 'Khach hang quet ma QR de chuyen khoan';
                break;
            case 'exact_phone':
                title = 'Match chinh xac 10 so SDT tu noi dung';
                break;
            case 'single_match':
                title = 'Tu dong match 1 KH duy nhat';
                break;
            case 'pending_match':
                title = 'Co nhieu KH match - can chon';
                break;
            default:
                title = `Phuong thuc: ${matchMethod}`;
        }
    } else if (uniqueCode) {
        if (uniqueCode.startsWith('N2') && !uniqueCode.startsWith('N2TX')) {
            title = 'Khach hang quet ma QR de chuyen khoan';
        } else if (uniqueCode.startsWith('PHONE')) {
            title = 'SDT duoc tu dong trich xuat tu noi dung chuyen khoan';
        }
    }

    if (!title) {
        if (row.linked_customer_phone) {
            title = 'Thong tin khach hang duoc nhap thu cong';
        } else if (row.pending_match_status === 'resolved') {
            title = 'Khach hang duoc chon tu danh sach goi y';
        } else if (row.has_pending_match === true) {
            title = 'Dang cho xac nhan khach hang';
        } else if (row.pending_match_skipped === true && row.pending_match_options?.length > 0) {
            title = 'Dang cho xac nhan khach hang';
        } else {
            title = 'Chua co thong tin mapping';
        }
    }

    return {
        label: label,
        icon: cfg.icon,
        color: cfg.color,
        title: title
    };
}

// =====================================================
// TABLE RENDERING
// =====================================================

// Render Table
function renderTable(data, skipGapDetection = false) {
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 48px; color: #bdc3c7;"></i>
                    <p style="margin-top: 15px; color: #7f8c8d;">Khong co du lieu</p>
                </td>
            </tr>
        `;
        return;
    }

    // Build rows with gap detection
    const rows = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const currentRef = parseInt(row.reference_code);

        // Check for gap with the NEXT row (since data is sorted DESC by date)
        // If current is 2567 and next is 2565, there's a gap of 2566
        // Skip gap detection when searching/filtering
        if (!skipGapDetection && i < data.length - 1) {
            const nextRow = data[i + 1];
            const nextRef = parseInt(nextRow.reference_code);

            // Only check if both are valid numbers
            if (!isNaN(currentRef) && !isNaN(nextRef) && currentRef - nextRef > 1) {
                // There are missing reference codes between current and next
                for (let missing = currentRef - 1; missing > nextRef; missing--) {
                    rows.push(renderGapRow(missing, nextRef, currentRef, nextRow.transaction_date, row.transaction_date));
                }
            }
        }

        // Add the actual transaction row
        rows.push(renderTransactionRow(row));
    }

    tableBody.innerHTML = rows.join('');

    // Reinitialize Lucide icons for dynamically added buttons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Generate unique QR code for transaction without existing QR code
 * Format: N2TX{paddedTransactionId} (18 chars total)
 * Example: N2TX000000002734 for transaction ID 2734
 */
function generateUniqueCodeForTransaction(transactionId) {
    // Pad transaction ID to 14 digits (N2 + TX + 14 digits = 18 chars)
    const paddedId = String(transactionId).padStart(14, '0');
    return `N2TX${paddedId}`;
}

/**
 * Render a single transaction row
 */
function renderTransactionRow(row) {
    // Extract unique code from content (look for N2 prefix pattern - exactly 18 chars)
    const content = row.content || '';
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);

    // Use existing QR code from content, OR from row.qr_code (backend JOIN), OR generate new one
    let uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : (row.qr_code || null);

    // If still no unique code, generate one based on transaction ID
    if (!uniqueCode) {
        uniqueCode = generateUniqueCodeForTransaction(row.id);
    }

    // Get customer info - PRIORITY:
    // 1. From backend JOIN (row.customer_phone, row.customer_name) - NEW!
    // 2. From CustomerInfoManager (QR code fallback)
    let customerDisplay = { name: 'Chua co', phone: 'Chua co', hasInfo: false };

    // Priority 1: Use data from backend LEFT JOIN (partial phone match)
    if (row.customer_phone || row.customer_name) {
        customerDisplay = {
            name: row.customer_name || 'Chua co',
            phone: row.customer_phone || 'Chua co',
            hasInfo: !!(row.customer_phone || row.customer_name)
        };
        console.log('[RENDER] Using backend JOIN data:', customerDisplay);
    }
    // Priority 2: Fallback to CustomerInfoManager (QR code)
    else if (window.CustomerInfoManager) {
        const managerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);
        if (managerDisplay.hasInfo) {
            customerDisplay = managerDisplay;
            console.log('[RENDER] Using CustomerInfoManager:', customerDisplay);
        }
    }

    // Check for pending match status
    const hasPendingMatch = row.has_pending_match === true;
    const isSkipped = row.pending_match_skipped === true;
    const pendingMatchOptions = row.pending_match_options || [];
    const pendingMatchId = row.pending_match_id;

    // Determine row class for highlighting
    const isHidden = row.is_hidden === true;
    // Show as pending if has active pending match OR skipped but still has options
    let rowClass = (hasPendingMatch || (isSkipped && pendingMatchOptions.length > 0)) ? 'row-pending-match' : '';
    if (isHidden) rowClass += ' row-hidden';

    // Build customer name cell content
    let customerNameCell = '';
    if (hasPendingMatch && pendingMatchOptions.length > 0) {
        // PENDING MATCH: Show dropdown to select customer
        // Structure: [{phone, count, customers: [{id, name, phone}]}]
        const optionsHtml = pendingMatchOptions.map(opt => {
            const customers = opt.customers || [];
            return customers.map(c => {
                // Ensure we have required fields
                // Use phone as fallback ID for LOCAL_DB records that may have null id
                const customerId = c.id || c.customer_id || (c.phone ? `LOCAL_${c.phone}` : '');
                const customerName = c.name || c.customer_name || 'N/A';
                const customerPhone = c.phone || c.customer_phone || opt.phone || 'N/A';
                if (!customerId) {
                    console.warn('[RENDER] Customer missing ID:', c);
                    return '';
                }
                return `<option value="${customerId}" data-phone="${customerPhone}" data-name="${customerName}">${customerName} - ${customerPhone}</option>`;
            }).join('');
        }).join('');

        customerNameCell = `
            <div class="pending-match-selector">
                <select class="pending-match-dropdown" onchange="resolvePendingMatch(${pendingMatchId}, this)" data-transaction-id="${row.id}" data-extracted-phone="${row.pending_extracted_phone}">
                    <option value="">-- Chon KH (${row.pending_extracted_phone}) --</option>
                    ${optionsHtml}
                </select>
                <button class="btn btn-sm btn-refresh-list" onclick="refreshPendingMatchList(${pendingMatchId}, '${row.pending_extracted_phone}', this)" title="Lay lai danh sach tu TPOS">
                    <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
    } else if (isSkipped && pendingMatchOptions.length > 0) {
        // SKIPPED but has options: Show dropdown again to allow re-selection
        const optionsHtml = pendingMatchOptions.map(opt => {
            const customers = opt.customers || [];
            return customers.map(c => {
                // Use phone as fallback ID for LOCAL_DB records that may have null id
                const customerId = c.id || c.customer_id || (c.phone ? `LOCAL_${c.phone}` : '');
                const customerName = c.name || c.customer_name || 'N/A';
                const customerPhone = c.phone || c.customer_phone || opt.phone || 'N/A';
                if (!customerId) return '';
                return `<option value="${customerId}" data-phone="${customerPhone}" data-name="${customerName}">${customerName} - ${customerPhone}</option>`;
            }).join('');
        }).join('');

        customerNameCell = `
            <div class="pending-match-selector">
                <select class="pending-match-dropdown" onchange="resolvePendingMatch(${pendingMatchId}, this)" data-transaction-id="${row.id}" data-extracted-phone="${row.pending_extracted_phone}">
                    <option value="">-- Chon KH (${row.pending_extracted_phone}) --</option>
                    ${optionsHtml}
                </select>
                <button class="btn btn-sm btn-refresh-list" onclick="refreshPendingMatchList(${pendingMatchId}, '${row.pending_extracted_phone}', this)" title="Lay lai danh sach tu TPOS">
                    <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
    } else {
        // NORMAL: Show customer name with clickable name selector (if has phone)
        // customer_aliases comes from backend JOIN
        const aliases = row.customer_aliases || [];
        const aliasesJson = JSON.stringify(aliases).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const hasAliases = aliases.length > 1 || (row.linked_customer_phone && customerDisplay.hasInfo);

        if (hasAliases && row.linked_customer_phone) {
            // Has phone + potential aliases: show clickable name
            customerNameCell = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span class="clickable-name"
                          onclick="showNameSelector(${row.id}, '${row.linked_customer_phone}', '${customerDisplay.name.replace(/'/g, "\\'")}', ${aliasesJson})"
                          title="Click de chon ten khac"
                          style="cursor: pointer; color: #3b82f6; border-bottom: 1px dashed #3b82f6;">
                        ${customerDisplay.name}
                        <i data-lucide="chevron-down" style="width: 12px; height: 12px; vertical-align: middle;"></i>
                    </span>
                    ${authManager?.hasDetailedPermission('balance-history', 'edit') ? `
                        <button class="btn btn-secondary btn-sm" onclick="editTransactionCustomer(${row.id}, '${row.linked_customer_phone || ''}', '${customerDisplay.name}')" title="Chinh sua thong tin" style="padding: 4px 6px;">
                            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        } else {
            // No aliases or no phone: show normal name with edit button
            customerNameCell = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="${!customerDisplay.hasInfo ? 'color: #999; font-style: italic;' : ''}">${customerDisplay.name}</span>
                    ${authManager?.hasDetailedPermission('balance-history', 'edit') ? `
                        <button class="btn btn-secondary btn-sm" onclick="editTransactionCustomer(${row.id}, '${row.linked_customer_phone || ''}', '${customerDisplay.name}')" title="${customerDisplay.hasInfo ? 'Chinh sua thong tin' : 'Them thong tin khach hang'}" style="padding: 4px 6px;">
                            <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        }
    }

    // Build phone cell content
    let phoneCell = '';
    if (hasPendingMatch) {
        // Show extracted phone hint
        phoneCell = `<span style="color: #f59e0b; font-style: italic;">Tim: ${row.pending_extracted_phone || '?'}</span>`;
    } else if (isSkipped) {
        phoneCell = `<span style="color: #9ca3af;">-</span>`;
    } else if (customerDisplay.hasInfo && customerDisplay.phone !== 'Chua co') {
        phoneCell = `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="btn-copy-phone" onclick="copyPhoneToClipboard('${customerDisplay.phone}', this)" title="Copy SDT" style="padding: 2px 4px; background: transparent; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; display: flex; align-items: center;">
                    <i data-lucide="copy" style="width: 12px; height: 12px; color: #6b7280;"></i>
                </button>
                <a href="javascript:void(0)" onclick="showCustomerQuickView('${customerDisplay.phone}')" class="phone-link" title="Xem thong tin khach hang" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                    ${customerDisplay.phone}
                    <i data-lucide="users" style="width: 12px; height: 12px; vertical-align: middle; margin-left: 4px;"></i>
                </a>
                <button class="btn-push-recent-ck" onclick="pushRecentTransfer('${customerDisplay.phone}', ${row.transfer_amount || 0}, this)" title="Day SDT vao danh sach CK gan day (7 ngay)" style="padding: 2px 5px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600; line-height: 1;">
                    CK
                </button>
            </div>
        `;
    } else {
        // No phone info - show edit icon for manual entry
        // Check permission for manualTransactionEntry
        const canManualEntry = authManager?.hasDetailedPermission('balance-history', 'manualTransactionEntry') ||
            authManager?.hasDetailedPermission('balance-history', 'edit');
        if (canManualEntry) {
            phoneCell = `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="color: #999; font-style: italic;">Chua co</span>
                    <button class="btn btn-outline-primary btn-sm"
                        onclick="editTransactionCustomer(${row.id}, '', '')"
                        title="Nhap SDT khach hang (cho ke toan duyet)"
                        style="padding: 2px 6px; border: 1px dashed #3b82f6; background: transparent; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="pencil" style="width: 12px; height: 12px; color: #3b82f6;"></i>
                        <span style="font-size: 10px; color: #3b82f6;">Nhap</span>
                    </button>
                </div>
            `;
        } else {
            phoneCell = `<span style="color: #999; font-style: italic;">${customerDisplay.phone}</span>`;
        }
    }


    // Get mapping source info
    const mappingSource = getMappingSource(row, uniqueCode);

    return `
    <tr class="${rowClass}" data-transaction-id="${row.id}">
        <td>${formatDateTime(row.transaction_date)}</td>
        <td class="${row.transfer_type === 'in' ? 'amount-in' : 'amount-out'}">
            ${formatCurrency(row.transfer_amount)}
        </td>
        <td style="word-wrap: break-word; max-width: 300px;">${content || 'N/A'}</td>
        <td>${row.reference_code || 'N/A'}</td>
        <td class="customer-info-cell ${hasPendingMatch ? 'pending-match' : (customerDisplay.hasInfo ? '' : 'no-info')}">
            ${customerNameCell}
        </td>
        <td class="customer-info-cell ${customerDisplay.hasInfo ? '' : 'no-info'}">
            ${phoneCell}
        </td>
        <td class="text-center" title="${mappingSource.title}">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: ${mappingSource.color}20; color: ${mappingSource.color}; font-size: 12px; white-space: nowrap;">
                <i data-lucide="${mappingSource.icon}" style="width: 12px; height: 12px;"></i>
                ${mappingSource.label}
            </span>
        </td>
        <td class="text-center">
            <button class="btn btn-success btn-sm" onclick="showTransactionQR('${uniqueCode}', 0)" title="Xem QR Code">
                <i data-lucide="qr-code"></i>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="copyUniqueCode('${uniqueCode}')" title="Copy ma" style="margin-left: 4px;">
                <i data-lucide="copy"></i>
            </button>
            <button class="btn btn-sm ${row.is_hidden ? 'btn-warning' : 'btn-outline-secondary'}" onclick="toggleHideTransaction(${row.id}, ${!row.is_hidden})" title="${row.is_hidden ? 'Bo an giao dich' : 'An giao dich'}" style="margin-left: 4px;">
                <i data-lucide="${row.is_hidden ? 'eye' : 'eye-off'}"></i>
            </button>
        </td>
    </tr>
    `;
}

/**
 * Render a gap warning row for missing reference code
 */
function renderGapRow(missingRef, prevRef, nextRef, prevDate, nextDate) {
    return `
    <tr class="gap-row" style="background: linear-gradient(90deg, #fef3c7 0%, #fffbeb 50%, #fef3c7 100%); border: 2px dashed #f59e0b;">
        <td style="text-align: center; color: #92400e; font-style: italic;">
            <i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #d97706;"></i>
        </td>
        <td colspan="2" style="color: #92400e; font-weight: 500;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="alert-circle" style="width: 18px; height: 18px; color: #d97706;"></i>
                <span>Giao dich bi thieu - Webhook khong nhan duoc</span>
            </div>
        </td>
        <td style="font-family: monospace; font-weight: bold; color: #d97706; font-size: 1.1em; text-align: center;">
            ${missingRef}
        </td>
        <td colspan="3" style="text-align: center;">
            <button class="btn btn-sm" onclick="fetchMissingTransaction('${missingRef}')" title="Lay lai giao dich tu Sepay" style="background: #3b82f6; color: white; border: none; padding: 4px 10px; margin-right: 4px;">
                <i data-lucide="download" style="width: 14px; height: 14px;"></i> Lay lai
            </button>
            <button class="btn btn-sm" onclick="ignoreGap('${missingRef}')" title="Bo qua" style="background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; padding: 4px 8px;">
                <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i>
            </button>
        </td>
        <td></td>
    </tr>
    `;
}

// Render Statistics
function renderStatistics(stats) {
    const totalIn = document.getElementById('totalIn');
    const totalInCount = document.getElementById('totalInCount');
    const totalOut = document.getElementById('totalOut');
    const totalOutCount = document.getElementById('totalOutCount');
    const netChange = document.getElementById('netChange');
    const totalTransactions = document.getElementById('totalTransactions');
    const latestBalance = document.getElementById('latestBalance');

    if (totalIn) totalIn.textContent = formatCurrency(stats.total_in);
    if (totalInCount) totalInCount.textContent = `${stats.total_in_count} giao dich`;
    if (totalOut) totalOut.textContent = formatCurrency(stats.total_out);
    if (totalOutCount) totalOutCount.textContent = `${stats.total_out_count} giao dich`;
    if (netChange) netChange.textContent = formatCurrency(stats.net_change);
    if (totalTransactions) totalTransactions.textContent = `${stats.total_transactions} giao dich`;
    if (latestBalance) latestBalance.textContent = formatCurrency(stats.latest_balance);
}

// =====================================================
// TOGGLE HIDE TRANSACTION
// =====================================================

// Toggle hide transaction
async function toggleHideTransaction(transactionId, hidden) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/hidden`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hidden })
        });

        const result = await response.json();

        if (result.success) {
            // Update the in-memory data
            const itemIndex = allLoadedData.findIndex(item => item.id === transactionId);
            if (itemIndex !== -1) {
                allLoadedData[itemIndex].is_hidden = hidden;
            }

            // Update localStorage cache with new data
            const cached = getBHCache();
            if (cached) {
                setBHCache(allLoadedData, cached.pagination);
            }

            // Update hidden count badge
            updateHiddenCount();

            // Find the row in DOM
            const row = document.querySelector(`tr[data-transaction-id="${transactionId}"]`);
            const currentViewMode = typeof viewMode !== 'undefined' ? viewMode : 'all';

            if (row) {
                // Determine if row should be removed based on viewMode
                const shouldRemoveRow = (hidden && currentViewMode === 'visible') ||
                    (!hidden && currentViewMode === 'hidden');

                if (shouldRemoveRow) {
                    // Remove row with animation
                    row.style.transition = 'opacity 0.3s, transform 0.3s';
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(-20px)';
                    setTimeout(() => row.remove(), 300);
                } else {
                    // Update row styling
                    if (hidden) {
                        row.classList.add('row-hidden');
                    } else {
                        row.classList.remove('row-hidden');
                    }

                    // Update the hide button in this row
                    const hideBtn = row.querySelector('button[onclick^="toggleHideTransaction"]');
                    if (hideBtn) {
                        hideBtn.className = `btn btn-sm ${hidden ? 'btn-warning' : 'btn-outline-secondary'}`;
                        hideBtn.title = hidden ? 'Bo an giao dich' : 'An giao dich';
                        hideBtn.setAttribute('onclick', `toggleHideTransaction(${transactionId}, ${!hidden})`);
                        hideBtn.innerHTML = `<i data-lucide="${hidden ? 'eye' : 'eye-off'}"></i>`;
                        lucide.createIcons();
                    }
                }
            }

            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
                    hidden ? 'Da an giao dich' : 'Da bo an giao dich',
                    'success'
                );
            }

            // Audit logging
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('transaction_adjust', {
                        module: 'balance-history',
                        description: (hidden ? 'An' : 'Bo an') + ' giao dich #' + transactionId,
                        oldData: { is_hidden: !hidden },
                        newData: { is_hidden: hidden },
                        entityId: String(transactionId),
                        entityType: 'transaction'
                    });
                }
            } catch (e) { /* audit log error - ignore */ }
        } else {
            throw new Error(result.error || 'Failed to update');
        }
    } catch (error) {
        console.error('[TOGGLE-HIDE] Error:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Khong the cap nhat trang thai an', 'error');
        } else {
            alert('Khong the cap nhat trang thai an');
        }
    }
}

// =====================================================
// GAP DETECTION (MISSING TRANSACTIONS)
// =====================================================

let gapsData = [];

/**
 * Load gap detection data from backend
 */
async function loadGapData() {
    try {
        console.log('[GAPS] Loading gap data...');

        // First, trigger gap detection
        const detectResponse = await fetch(`${API_BASE_URL}/api/sepay/detect-gaps`);
        const detectResult = await detectResponse.json();

        if (detectResult.success && detectResult.total_gaps > 0) {
            gapsData = detectResult.gaps || [];
            updateGapCard(detectResult.total_gaps);
            console.log('[GAPS] Found', detectResult.total_gaps, 'gaps');
        } else {
            // No gaps found
            gapsData = [];
            updateGapCard(0);
            console.log('[GAPS] No gaps found');
        }

    } catch (error) {
        console.error('[GAPS] Error loading gap data:', error);
        updateGapCard(0);
    }
}

/**
 * Update the gap card in statistics
 */
function updateGapCard(count) {
    const gapCard = document.getElementById('gapCard');
    const totalGaps = document.getElementById('totalGaps');
    const gapHint = document.getElementById('gapHint');

    if (count > 0) {
        gapCard.style.display = 'block';
        totalGaps.textContent = count;
        gapHint.textContent = 'Nhan de xem chi tiet';

        // Add warning animation
        gapCard.classList.add('gap-warning');
    } else {
        gapCard.style.display = 'none';
    }

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Show gaps modal
 */
async function showGapsModal() {
    const modal = document.getElementById('gapsModal');
    const loadingEl = document.getElementById('gapsLoading');
    const emptyEl = document.getElementById('gapsEmpty');
    const contentEl = document.getElementById('gapsContent');

    // Show modal and loading state
    modal.style.display = 'block';
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    contentEl.style.display = 'none';

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();

    try {
        // Fetch gaps from backend
        const response = await fetch(`${API_BASE_URL}/api/sepay/gaps?status=detected`);
        const result = await response.json();

        loadingEl.style.display = 'none';

        if (result.success && result.data && result.data.length > 0) {
            gapsData = result.data;
            renderGapsList(result.data);
            contentEl.style.display = 'block';
        } else if (gapsData.length > 0) {
            // Use cached data from detect-gaps
            renderGapsList(gapsData);
            contentEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'block';
        }

        // Reinitialize icons
        if (window.lucide) lucide.createIcons();

    } catch (error) {
        console.error('[GAPS] Error fetching gaps:', error);
        loadingEl.style.display = 'none';

        if (gapsData.length > 0) {
            renderGapsList(gapsData);
            contentEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'block';
        }
    }
}

/**
 * Render gaps list in modal
 */
function renderGapsList(gaps) {
    const tbody = document.getElementById('gapsTableBody');
    const totalEl = document.getElementById('gapsTotal');

    totalEl.textContent = gaps.length;

    tbody.innerHTML = gaps.map((gap, index) => {
        const status = gap.status || 'detected';
        const statusBadge = status === 'detected'
            ? '<span class="badge badge-warning">Phat hien</span>'
            : status === 'ignored'
                ? '<span class="badge badge-secondary">Bo qua</span>'
                : '<span class="badge badge-success">Da xu ly</span>';

        return `
        <tr>
            <td>${index + 1}</td>
            <td style="font-family: monospace; font-weight: bold; color: #d97706;">
                ${gap.missing_reference_code}
            </td>
            <td style="font-family: monospace; color: #6b7280;">
                ${gap.previous_reference_code || 'N/A'}
                ${gap.previous_date ? `<br><small style="color: #9ca3af;">${formatDateTime(gap.previous_date)}</small>` : ''}
            </td>
            <td style="font-family: monospace; color: #6b7280;">
                ${gap.next_reference_code || 'N/A'}
                ${gap.next_date ? `<br><small style="color: #9ca3af;">${formatDateTime(gap.next_date)}</small>` : ''}
            </td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="ignoreGap('${gap.missing_reference_code}')" title="Bo qua">
                    <i data-lucide="eye-off" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();
}

/**
 * Close gaps modal
 */
function closeGapsModal() {
    const modal = document.getElementById('gapsModal');
    modal.style.display = 'none';
}

/**
 * Ignore a specific gap (mark as not a real transaction)
 */
async function ignoreGap(referenceCode) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/gaps/${referenceCode}/ignore`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(`Da bo qua ma ${referenceCode}`, 'success');
            }

            // DISABLED: Gap detection (performance issue)
            // await loadGapData();

            // Refresh modal if open
            const modal = document.getElementById('gapsModal');
            if (modal.style.display === 'block') {
                showGapsModal();
            }
        } else {
            throw new Error(result.error || 'Failed to ignore gap');
        }

    } catch (error) {
        console.error('[GAPS] Error ignoring gap:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Loi khi bo qua gap: ' + error.message, 'error');
        }
    }
}

/**
 * Re-detect gaps (rescan)
 */
async function rescanGaps() {
    const detectBtn = document.getElementById('detectGapsBtn');
    if (detectBtn) {
        detectBtn.disabled = true;
        detectBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Dang quet...';
    }

    try {
        // DISABLED: Gap detection (performance issue)
        // await loadGapData();

        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Gap detection da bi tat de toi uu hieu suat', 'info');
        }

        // Refresh modal
        showGapsModal();

    } catch (error) {
        console.error('[GAPS] Error rescanning:', error);
    } finally {
        if (detectBtn) {
            detectBtn.disabled = false;
            detectBtn.innerHTML = '<i data-lucide="search"></i> Quet lai';
            if (window.lucide) lucide.createIcons();
        }
    }
}

/**
 * Retry all items in the failed webhook queue
 */
async function retryFailedQueue() {
    const retryBtn = document.getElementById('retryAllGapsBtn');
    if (retryBtn) {
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Dang retry...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/failed-queue/retry-all`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(result.message, 'success');
            }

            // DISABLED: Gap detection (performance issue)
            // await loadGapData();

            // Reload main data
            loadData();
            loadStatistics();

            // Refresh modal
            showGapsModal();
        } else {
            throw new Error(result.error || 'Failed to retry');
        }

    } catch (error) {
        console.error('[GAPS] Error retrying failed queue:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Loi khi retry: ' + error.message, 'error');
        }
    } finally {
        if (retryBtn) {
            retryBtn.disabled = false;
            retryBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Retry Failed Queue';
            if (window.lucide) lucide.createIcons();
        }
    }
}

// Setup Gaps Modal Event Listeners
const gapsModal = document.getElementById('gapsModal');
const closeGapsModalBtn = document.getElementById('closeGapsModalBtn');
const detectGapsBtn = document.getElementById('detectGapsBtn');
const retryAllGapsBtn = document.getElementById('retryAllGapsBtn');

closeGapsModalBtn?.addEventListener('click', closeGapsModal);

gapsModal?.addEventListener('click', (e) => {
    if (e.target === gapsModal) {
        closeGapsModal();
    }
});

detectGapsBtn?.addEventListener('click', rescanGaps);
retryAllGapsBtn?.addEventListener('click', retryFailedQueue);

// Filter Gaps Only Button
let showGapsOnly = false;
const filterGapsOnlyBtn = document.getElementById('filterGapsOnlyBtn');

filterGapsOnlyBtn?.addEventListener('click', () => {
    showGapsOnly = !showGapsOnly;

    if (showGapsOnly) {
        filterGapsOnlyBtn.style.background = '#f59e0b';
        filterGapsOnlyBtn.style.color = 'white';
        filterGapsOnlyBtn.innerHTML = '<i data-lucide="alert-triangle"></i> Dang loc GD thieu';

        // Hide all non-gap rows
        document.querySelectorAll('#tableBody tr:not(.gap-row)').forEach(row => {
            row.style.display = 'none';
        });

        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Dang hien thi chi giao dich thieu', 'info');
        }
    } else {
        filterGapsOnlyBtn.style.background = '#fef3c7';
        filterGapsOnlyBtn.style.color = '#92400e';
        filterGapsOnlyBtn.innerHTML = '<i data-lucide="alert-triangle"></i> Chi GD thieu';

        // Show all rows
        document.querySelectorAll('#tableBody tr').forEach(row => {
            row.style.display = '';
        });
    }

    if (window.lucide) lucide.createIcons();
});

/**
 * Fetch missing transaction from Sepay API by reference code
 */
async function fetchMissingTransaction(referenceCode) {
    if (window.NotificationManager) {
        window.NotificationManager.showNotification(`Dang lay giao dich ${referenceCode}...`, 'info');
    }

    try {
        // Call Sepay API to fetch transaction by reference code
        const response = await fetch(`${API_BASE_URL}/api/sepay/fetch-by-reference/${referenceCode}`, {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(`Da lay duoc giao dich ${referenceCode}!`, 'success');
            }

            // DISABLED: Gap detection (performance issue)
            // await loadGapData();
            loadData();
            loadStatistics();
        } else {
            throw new Error(result.error || result.message || 'Khong tim thay giao dich');
        }

    } catch (error) {
        console.error('[GAPS] Error fetching missing transaction:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(`Khong the lay GD ${referenceCode}: ${error.message}`, 'error');
        }
    }
}

// Export functions for global access
window.showGapsModal = showGapsModal;
window.closeGapsModal = closeGapsModal;
window.ignoreGap = ignoreGap;
window.rescanGaps = rescanGaps;
window.retryFailedQueue = retryFailedQueue;
window.fetchMissingTransaction = fetchMissingTransaction;
