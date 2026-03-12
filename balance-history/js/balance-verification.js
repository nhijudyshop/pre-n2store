// =====================================================
// BALANCE HISTORY - VERIFICATION MODULE
// Transaction verification, phone matching, customer lookup,
// pending match resolution, QR code, customer edit,
// phone data modal, name selector, customer quick view
// =====================================================

// NOTE: This module depends on balance-core.js for:
// - API_BASE_URL (config)
// - showNotification, formatCurrency, formatDateTime (helpers)
// - loadData, loadStatistics (data loading)

// NOTE: Permission checks use authManager.hasDetailedPermission() from shared-auth-manager.js
// No admin bypass - ALL users must have detailedPermissions

// =====================================================
// PENDING MATCH FUNCTIONS - Customer selection from dropdown
// =====================================================

/**
 * Resolve a pending match by selecting a customer
 * Called when user selects an option from dropdown
 * @param {number} pendingMatchId - ID of pending_customer_matches record
 * @param {HTMLSelectElement} selectElement - The dropdown element
 */
async function resolvePendingMatch(pendingMatchId, selectElement) {
    const selectedValue = selectElement.value;

    if (!selectedValue) {
        return; // User selected placeholder option
    }

    // Check permission using central authManager (no admin bypass)
    if (!authManager?.hasDetailedPermission('balance-history', 'resolveMatch')) {
        showNotification('Ban khong co quyen thuc hien thao tac nay', 'error');
        selectElement.value = '';
        return;
    }

    const transactionId = selectElement.dataset.transactionId;

    // Get selected customer info from data attributes
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const customerName = selectedOption.dataset.name || 'Unknown';
    const customerPhone = selectedOption.dataset.phone || 'Unknown';

    console.log('[RESOLVE-MATCH] Resolving:', {
        pendingMatchId,
        customer_id: selectedValue,
        customerName,
        customerPhone
    });

    try {
        // Disable dropdown while processing
        selectElement.disabled = true;
        selectElement.style.opacity = '0.5';

        // Handle both LOCAL_xxx (string) and numeric customer IDs
        const customerId = selectedValue.startsWith('LOCAL_')
            ? selectedValue
            : parseInt(selectedValue);

        const requestBody = {
            customer_id: customerId,
            resolved_by: JSON.parse(localStorage.getItem('n2shop_current_user') || '{}').username || 'admin'
        };
        console.log('[RESOLVE-MATCH] Request body:', requestBody);

        const response = await fetch(`${API_BASE_URL}/api/sepay/pending-matches/${pendingMatchId}/resolve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        console.log('[RESOLVE-MATCH] Response:', result);

        if (result.success) {
            showNotification(`Da chon khach hang: ${customerName} (${customerPhone})`, 'success');

            // Audit logging
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('transaction_assign', {
                        module: 'balance-history',
                        description: 'Gan giao dich #' + transactionId + ' cho KH ' + customerName + ' (' + customerPhone + ')',
                        oldData: null,
                        newData: { txId: transactionId, customerId: selectedValue, customerName: customerName, customerPhone: customerPhone },
                        entityId: String(transactionId),
                        entityType: 'transaction'
                    });
                }
            } catch (e) { /* audit log error - ignore */ }

            // Small delay to ensure DB is updated, then refresh table
            setTimeout(async () => {
                await loadData();
            }, 300);
        } else {
            console.error('[RESOLVE-MATCH] Error response:', result);
            const errorMsg = result.message || result.error || 'Khong the luu';
            showNotification(`Loi: ${errorMsg}`, 'error');
            selectElement.disabled = false;
            selectElement.style.opacity = '1';
            selectElement.value = '';
        }
    } catch (error) {
        console.error('[RESOLVE-MATCH] Network error:', error);
        showNotification(`Loi ket noi: ${error.message}`, 'error');
        selectElement.disabled = false;
        selectElement.style.opacity = '1';
        selectElement.value = '';
    }
}

/**
 * Refresh pending match list by fetching from TPOS
 * @param {number} pendingMatchId - ID of pending_customer_matches record
 * @param {string} partialPhone - The extracted partial phone number
 * @param {HTMLButtonElement} buttonElement - The refresh button
 */
async function refreshPendingMatchList(pendingMatchId, partialPhone, buttonElement) {
    // Check permission using central authManager (no admin bypass)
    if (!authManager?.hasDetailedPermission('balance-history', 'resolveMatch')) {
        showNotification('Ban khong co quyen thuc hien thao tac nay', 'error');
        return;
    }

    const dropdown = buttonElement.previousElementSibling;
    if (!dropdown || !dropdown.classList.contains('pending-match-dropdown')) {
        showNotification('Khong tim thay dropdown', 'error');
        return;
    }

    try {
        // Disable button and show loading
        buttonElement.disabled = true;
        buttonElement.style.opacity = '0.5';
        const icon = buttonElement.querySelector('i');
        if (icon) icon.style.animation = 'spin 1s linear infinite';

        console.log(`[REFRESH-LIST] Fetching TPOS for partial phone: ${partialPhone}`);

        const response = await fetch(`${API_BASE_URL}/api/sepay/tpos/search/${partialPhone}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch from TPOS');
        }

        const uniquePhones = result.data || [];
        console.log(`[REFRESH-LIST] Found ${uniquePhones.length} unique phones`);

        if (uniquePhones.length === 0) {
            showNotification(`Khong tim thay khach hang nao voi SDT "${partialPhone}"`, 'warning');
            buttonElement.disabled = false;
            buttonElement.style.opacity = '1';
            if (icon) icon.style.animation = '';
            return;
        }

        // Update matched_customers in DB so resolve will work correctly
        try {
            const updateResponse = await fetch(`${API_BASE_URL}/api/sepay/pending-matches/${pendingMatchId}/customers`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ matched_customers: uniquePhones })
            });
            const updateResult = await updateResponse.json();
            if (!updateResult.success) {
                console.warn('[REFRESH-LIST] Failed to update matched_customers in DB:', updateResult.error);
            } else {
                console.log('[REFRESH-LIST] Updated matched_customers in DB successfully');
            }
        } catch (updateErr) {
            console.warn('[REFRESH-LIST] Failed to update matched_customers:', updateErr.message);
        }

        // Build new options HTML
        const optionsHtml = uniquePhones.map(opt => {
            const customers = opt.customers || [];
            return customers.map(c => {
                // Use phone as fallback ID for LOCAL_DB records that may have null id
                const customerId = c.id || (c.phone ? `LOCAL_${c.phone}` : '');
                const customerName = c.name || 'N/A';
                const customerPhone = c.phone || opt.phone || 'N/A';
                if (!customerId) return '';
                return `<option value="${customerId}" data-phone="${customerPhone}" data-name="${customerName}">${customerName} - ${customerPhone}</option>`;
            }).join('');
        }).join('');

        // Update dropdown
        dropdown.innerHTML = `
            <option value="">-- Chon KH (${partialPhone}) --</option>
            ${optionsHtml}
        `;

        // Re-initialize lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        showNotification(`Da tim thay ${uniquePhones.length} SDT khac nhau`, 'success');

    } catch (error) {
        console.error('[REFRESH-LIST] Error:', error);
        showNotification(`Loi: ${error.message}`, 'error');
    } finally {
        buttonElement.disabled = false;
        buttonElement.style.opacity = '1';
        const icon = buttonElement.querySelector('i');
        if (icon) icon.style.animation = '';
    }
}

/**
 * Copy phone number to clipboard
 * @param {string} phone - Phone number to copy
 * @param {HTMLButtonElement} button - The button element for visual feedback
 */
async function copyPhoneToClipboard(phone, button) {
    try {
        await navigator.clipboard.writeText(phone);

        // Visual feedback - change icon temporarily
        const icon = button.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'check');
            icon.style.color = '#10b981';
            lucide.createIcons();

            // Revert after 1.5 seconds
            setTimeout(() => {
                icon.setAttribute('data-lucide', 'copy');
                icon.style.color = '#6b7280';
                lucide.createIcons();
            }, 1500);
        }

        showNotification(`Da copy: ${phone}`, 'success');
    } catch (error) {
        console.error('[COPY] Failed to copy:', error);
        showNotification('Khong the copy', 'error');
    }
}

/**
 * Push phone to recent_transfer_phones (7-day TTL)
 */
async function pushRecentTransfer(phone, amount, button) {
    try {
        button.disabled = true;
        button.textContent = '...';
        const response = await fetch(`${API_BASE_URL}/api/sepay/recent-transfers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, amount })
        });
        const result = await response.json();
        if (result.success) {
            button.textContent = '\u2713';
            button.style.background = '#6b7280';
            showNotification(`Da day ${phone} vao CK gan day (7 ngay)`, 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('[RECENT-CK] Error:', error);
        button.textContent = 'CK';
        button.disabled = false;
        button.style.background = '#10b981';
        showNotification('Loi day SDT: ' + error.message, 'error');
    }
}

// =====================================================
// QR CODE FUNCTIONS
// =====================================================

// Generate and show a new deposit QR code
function generateDepositQR() {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const qrData = window.QRGenerator.generateDepositQR(0); // 0 = customer fills amount
    showQRModal(qrData, true); // true = is new QR
}

// Show QR code for an existing transaction
function showTransactionQR(uniqueCode, amount = 0) {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const qrData = window.QRGenerator.regenerateQR(uniqueCode, amount);
    showQRModal(qrData);
}

// Display QR modal with QR code
function showQRModal(qrData, isNewQR = false) {
    const qrModal = document.getElementById('qrModal');
    const qrModalBody = document.getElementById('qrModalBody');

    // Get existing customer info if available
    const customerInfo = window.CustomerInfoManager ? window.CustomerInfoManager.getCustomerInfo(qrData.uniqueCode) : null;

    qrModalBody.innerHTML = `
        <div style="padding: 20px;">
            <img src="${qrData.qrUrl}" alt="QR Code" style="width: 300px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="margin-bottom: 12px;">
                    <strong>Ngan hang:</strong> ${qrData.bankInfo.bank}<br>
                    <strong>So tai khoan:</strong> ${qrData.bankInfo.accountNo}<br>
                    <strong>Chu tai khoan:</strong> ${qrData.bankInfo.accountName}
                </div>
                <div style="margin-top: 12px; padding: 10px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: bold; color: #495057;">
                    Ma giao dich: ${qrData.uniqueCode}
                </div>
                ${qrData.amount > 0 ? `<div style="margin-top: 8px;"><strong>So tien:</strong> ${formatCurrency(qrData.amount)}</div>` : '<div style="margin-top: 8px; color: #6c757d;"><em>Khach hang tu dien so tien</em></div>'}
            </div>

            ${isNewQR ? `
                <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 8px; border: 1px solid #b3d9ff;">
                    <div style="margin-bottom: 10px; font-weight: 600; color: #0056b3;">
                        <i data-lucide="user-plus" style="width: 16px; height: 16px; vertical-align: middle;"></i> Thong tin khach hang (tuy chon)
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <input type="text" id="qrCustomerName" class="filter-input" placeholder="Ten khach hang" value="${customerInfo?.name || ''}" style="width: 100%;">
                        <input type="tel" id="qrCustomerPhone" class="filter-input" placeholder="So dien thoai" value="${customerInfo?.phone || ''}" style="width: 100%;">
                        <button class="btn btn-success btn-sm" onclick="saveQRCustomerInfo('${qrData.uniqueCode}')" style="width: 100%;">
                            <i data-lucide="save"></i> Luu thong tin khach hang
                        </button>
                    </div>
                </div>
            ` : ''}

            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="copyQRUrl('${qrData.qrUrl}')">
                    <i data-lucide="image"></i> Copy URL QR
                </button>
                <button class="btn btn-success" onclick="copyUniqueCode('${qrData.uniqueCode}')">
                    <i data-lucide="hash"></i> Copy Ma GD
                </button>
                <button class="btn btn-secondary" onclick="downloadQR('${qrData.qrUrl}', '${qrData.uniqueCode}')">
                    <i data-lucide="download"></i> Tai QR
                </button>
                ${!isNewQR ? `
                    <button class="btn btn-info" onclick="editCustomerInfo('${qrData.uniqueCode}')">
                        <i data-lucide="pencil"></i> Sua TT Khach
                    </button>
                ` : ''}
            </div>

            <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 13px; color: #856404;">
                <strong>Luu y:</strong> Khach hang phai nhap dung ma giao dich <strong>${qrData.uniqueCode}</strong> khi chuyen khoan de he thong tu dong xac nhan.
            </div>
        </div>
    `;

    qrModal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Copy QR URL to clipboard
async function copyQRUrl(qrUrl) {
    if (!window.QRGenerator) return;

    const success = await window.QRGenerator.copyQRUrl(qrUrl);
    if (success) {
        showNotification('Da copy URL QR code!', 'success');
    } else {
        showNotification('Khong the copy URL', 'error');
    }
}

// Copy unique code to clipboard
async function copyUniqueCode(uniqueCode) {
    if (!window.QRGenerator) return;

    const success = await window.QRGenerator.copyUniqueCode(uniqueCode);
    if (success) {
        showNotification(`Da copy ma: ${uniqueCode}`, 'success');
    } else {
        showNotification('Khong the copy ma', 'error');
    }
}

// Download QR code image
async function downloadQR(qrUrl, uniqueCode) {
    if (!window.QRGenerator) return;

    const filename = `QR-${uniqueCode}-${Date.now()}.png`;
    const success = await window.QRGenerator.downloadQRImage(qrUrl, filename);

    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Dang tai QR code...', 'success');
        }
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Khong the tai QR code', 'error');
        } else {
            alert('Khong the tai QR code');
        }
    }
}

// =====================================================
// QR CODE MODAL EVENT LISTENERS
// =====================================================

const generateQRBtn = document.getElementById('generateQRBtn');
const qrModal = document.getElementById('qrModal');
const closeQRModalBtn = document.getElementById('closeQRModalBtn');

// Generate QR Button (without customer info)
generateQRBtn?.addEventListener('click', () => {
    generateDepositQR();
});

// Inline QR Form - Generate QR with Customer Info
const inlineGenerateQRBtn = document.getElementById('inlineGenerateQRBtn');
const inlineCustomerName = document.getElementById('inlineCustomerName');
const inlineCustomerPhone = document.getElementById('inlineCustomerPhone');
const inlineQRDisplay = document.getElementById('inlineQRDisplay');
const inlineQRImage = document.getElementById('inlineQRImage');
const inlineQRCode = document.getElementById('inlineQRCode');
const copyInlineQRBtn = document.getElementById('copyInlineQRBtn');
const closeInlineQRBtn = document.getElementById('closeInlineQRBtn');

// Store current QR URL for copy function
let currentInlineQRUrl = '';
let hasCopiedCurrentQR = false; // Track if current QR has been copied
let currentCustomerInfo = ''; // Store customer name/phone for QR image

inlineGenerateQRBtn?.addEventListener('click', () => {
    generateDepositQRInline();
});

// Handle Enter key on inline inputs
inlineCustomerName?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateDepositQRInline();
    }
});

inlineCustomerPhone?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateDepositQRInline();
    }
});

// Copy QR image to clipboard
copyInlineQRBtn?.addEventListener('click', async () => {
    if (!currentInlineQRUrl) return;

    const alreadyCopied = hasCopiedCurrentQR;

    try {
        // Fetch image via proxy to bypass CORS
        const WORKER_URL = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const proxyUrl = `${WORKER_URL}/api/proxy?url=${encodeURIComponent(currentInlineQRUrl)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) throw new Error('Fetch failed');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Load image and draw to canvas for proper PNG format
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = blobUrl;
        });

        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Clean up blob URL
        URL.revokeObjectURL(blobUrl);

        // Get PNG blob from canvas
        const pngBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png');
        });

        // Copy to clipboard
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
        ]);

        // Visual feedback
        copyInlineQRBtn.classList.remove('btn-primary');
        copyInlineQRBtn.classList.add('btn-success');
        setTimeout(() => {
            copyInlineQRBtn.classList.remove('btn-success');
            copyInlineQRBtn.classList.add('btn-primary');
        }, 1500);

        if (window.NotificationManager) {
            if (alreadyCopied) {
                window.NotificationManager.showNotification('Da copy lan 2!', 'warning');
            } else {
                window.NotificationManager.showNotification('Da copy hinh QR!', 'success');
            }
        }
        hasCopiedCurrentQR = true;

    } catch (error) {
        console.error('Copy QR failed:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Khong the copy anh', 'error');
        }
    }
});

// Close inline QR display
closeInlineQRBtn?.addEventListener('click', () => {
    if (inlineQRDisplay) {
        inlineQRDisplay.style.display = 'none';
        currentInlineQRUrl = '';
    }
});

// Generate QR inline (no popup)
async function generateDepositQRInline() {
    if (!window.QRGenerator) {
        console.error('QR Generator not loaded');
        return;
    }

    const customerName = inlineCustomerName?.value?.trim() || '';
    const customerPhone = inlineCustomerPhone?.value?.trim() || '';

    // Generate QR code
    // If phone is provided, use last 6 digits as the transfer content (addInfo/uniqueCode)
    // Otherwise, generate a unique code
    let qrData;
    if (customerPhone) {
        // Use last 6 digits of phone number as the unique code for transfer content
        const last6Digits = customerPhone.slice(-6);
        qrData = window.QRGenerator.regenerateQR(last6Digits, 0);
    } else {
        // Generate normal unique code
        qrData = window.QRGenerator.generateDepositQR(0); // 0 = customer fills amount
    }

    // If customer info is provided, save it
    if ((customerName || customerPhone) && window.CustomerInfoManager) {
        await window.CustomerInfoManager.saveCustomerInfo(qrData.uniqueCode, {
            name: customerName,
            phone: customerPhone
        });
    }

    // Display QR inline
    const inlineCustomerInfoEl = document.getElementById('inlineCustomerInfo');
    if (inlineQRDisplay && inlineQRImage && inlineQRCode) {
        currentInlineQRUrl = qrData.qrUrl;
        inlineQRImage.src = qrData.qrUrl;
        inlineQRCode.textContent = qrData.uniqueCode;

        // Show customer name only (no phone)
        if (inlineCustomerInfoEl) {
            const displayInfo = customerName || '';
            inlineCustomerInfoEl.textContent = displayInfo;
            inlineCustomerInfoEl.title = displayInfo; // Full text on hover
            inlineCustomerInfoEl.style.display = displayInfo ? 'inline' : 'none';
        }

        // Store customer info for QR image (name or phone)
        currentCustomerInfo = customerName || customerPhone || '';

        inlineQRDisplay.style.display = 'flex';
        hasCopiedCurrentQR = false; // Reset copy tracking for new QR

        // Reinitialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // Clear the inline inputs after generating QR
    if (inlineCustomerName) inlineCustomerName.value = '';
    if (inlineCustomerPhone) inlineCustomerPhone.value = '';

    // Show notification
    if (window.NotificationManager) {
        const msg = customerName ? `QR tao cho ${customerName}` : 'Da tao QR code!';
        window.NotificationManager.showNotification(msg, 'success');
    }
}

// Close QR Modal
closeQRModalBtn?.addEventListener('click', () => {
    qrModal.style.display = 'none';
});

// Close modal when clicking outside
qrModal?.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.style.display = 'none';
    }
});

// =====================================================
// CUSTOMER INFO FUNCTIONS
// =====================================================

// Save customer info from QR modal
async function saveQRCustomerInfo(uniqueCode) {
    if (!window.CustomerInfoManager) return;

    const name = document.getElementById('qrCustomerName')?.value || '';
    const phone = document.getElementById('qrCustomerPhone')?.value || '';

    const success = await window.CustomerInfoManager.saveCustomerInfo(uniqueCode, { name, phone });

    if (success) {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Da luu thong tin khach hang!', 'success');
        } else {
            alert('Da luu thong tin khach hang!');
        }
        // Reload table to show updated customer info
        loadData();
    } else {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Khong the luu thong tin', 'error');
        } else {
            alert('Khong the luu thong tin');
        }
    }
}

// Edit customer info - show edit modal
function editCustomerInfo(uniqueCode) {
    if (!window.CustomerInfoManager) return;

    const editCustomerModal = document.getElementById('editCustomerModal');
    const editCustomerUniqueCode = document.getElementById('editCustomerUniqueCode');
    const editCustomerName = document.getElementById('editCustomerName');
    const editCustomerPhone = document.getElementById('editCustomerPhone');

    // Get existing customer info
    const customerInfo = window.CustomerInfoManager.getCustomerInfo(uniqueCode) || { name: '', phone: '' };

    // Fill form
    editCustomerUniqueCode.textContent = uniqueCode;
    editCustomerName.value = customerInfo.name || '';
    editCustomerPhone.value = customerInfo.phone || '';

    // Store unique code for form submission
    editCustomerForm.dataset.uniqueCode = uniqueCode;

    // Show modal
    editCustomerModal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// =====================================================
// EDIT CUSTOMER MODAL EVENT LISTENERS
// =====================================================

const editCustomerModal = document.getElementById('editCustomerModal');
const closeEditCustomerModalBtn = document.getElementById('closeEditCustomerModalBtn');
const cancelEditCustomerBtn = document.getElementById('cancelEditCustomerBtn');
const editCustomerForm = document.getElementById('editCustomerForm');

// Close Edit Customer Modal
closeEditCustomerModalBtn?.addEventListener('click', () => {
    editCustomerModal.style.display = 'none';
});

// Cancel Edit Customer
cancelEditCustomerBtn?.addEventListener('click', () => {
    editCustomerModal.style.display = 'none';
});

// Close modal when clicking outside
editCustomerModal?.addEventListener('click', (e) => {
    if (e.target === editCustomerModal) {
        editCustomerModal.style.display = 'none';
    }
});

// Submit Edit Customer Form
editCustomerForm?.addEventListener('submit', saveEditCustomerInfo);

// Save customer info from edit modal
async function saveEditCustomerInfo(event) {
    event.preventDefault();

    // Check if Live Mode is handling this modal - skip if so
    const modal = document.getElementById('editCustomerModal');
    if (modal?.dataset.isLiveMode === 'true') {
        console.log('[EDIT-CUSTOMER] Skipping - Live Mode is handling this form');
        return;
    }

    const form = document.getElementById('editCustomerForm');
    const phone = document.getElementById('editCustomerPhone').value;

    // Check if this is a transaction-level edit
    const isTransactionEdit = form.dataset.isTransactionEdit === 'true';
    const isAccountantChange = form.dataset.isAccountantChange === 'true';
    const transactionId = form.dataset.transactionId;
    const customerName = document.getElementById('editCustomerName').value; // Get name from form

    // Handle accountant change flow (change SDT + auto approve)
    if (isAccountantChange && transactionId) {
        console.log('[EDIT-TRANSACTION] Accountant change flow:', { transactionId, phone, name: customerName });

        // Clear flags before calling
        delete form.dataset.isTransactionEdit;
        delete form.dataset.transactionId;
        delete form.dataset.isAccountantChange;

        // Use the verification module's function
        if (typeof changeAndApproveTransaction === 'function') {
            await changeAndApproveTransaction(parseInt(transactionId), phone, customerName);
        } else if (window.VerificationModule?.changeAndApproveTransaction) {
            await window.VerificationModule.changeAndApproveTransaction(parseInt(transactionId), phone, customerName);
        } else {
            showNotification('Khong tim thay ham xu ly thay doi', 'error');
        }
        return;
    }

    if (isTransactionEdit && transactionId) {
        // Transaction-level edit: Update only this transaction's phone and name
        // This is a manual entry by staff, requires accountant approval
        console.log('[EDIT-TRANSACTION] Saving manual entry:', { transactionId, phone, name: customerName });

        const result = await saveTransactionCustomer(transactionId, phone, { isManualEntry: true, name: customerName });

        if (result.success) {
            // Mark as hidden so it moves to "DA XAC NHAN" in Live Mode
            try {
                await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/hidden`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hidden: true })
                });
                console.log('[EDIT-TRANSACTION] Marked transaction as hidden for Live Mode');
            } catch (e) {
                console.warn('[EDIT-TRANSACTION] Failed to set hidden:', e);
            }

            // Show appropriate message based on whether approval is required
            let message;
            if (result.requiresApproval) {
                message = 'Da luu SDT - Cho ke toan duyet!';
            } else {
                message = 'Da cap nhat SDT cho giao dich!';
            }

            showNotification(message, 'success');

            // Close modal and reload with force refresh (bypass cache)
            document.getElementById('editCustomerModal').style.display = 'none';
            loadData(true); // Force refresh to show updated data immediately

            // Sync Transfer Stats tab if it's active, or mark for reload
            const tsPanel = document.getElementById('transferStatsPanel');
            if (tsPanel?.classList.contains('active') && typeof window.loadTransferStats === 'function') {
                window.loadTransferStats();
            } else {
                // Mark for reload when tab becomes active
                window._transferStatsNeedsReload = true;
            }

            // Clear flags
            delete form.dataset.isTransactionEdit;
            delete form.dataset.transactionId;
        } else {
            const errorMsg = result.error || 'Khong the cap nhat SDT';
            showNotification(errorMsg, 'error');
        }
        return;
    }


    // QR-code level edit (original logic)
    if (!window.CustomerInfoManager) return;

    const uniqueCode = form.dataset.uniqueCode;
    const name = document.getElementById('editCustomerName').value;

    console.log('[EDIT-CUSTOMER] Saving:', { uniqueCode, name, phone });

    if (!uniqueCode) {
        console.error('[EDIT-CUSTOMER] No uniqueCode found in form dataset');
        alert('Loi: Khong tim thay ma giao dich!');
        return;
    }

    const success = await window.CustomerInfoManager.saveCustomerInfo(uniqueCode, { name, phone });

    if (success) {
        showNotification('Da cap nhat thong tin khach hang!', 'success');

        // Audit logging
        try {
            if (window.AuditLogger) {
                window.AuditLogger.logAction('customer_info_update_bh', {
                    module: 'balance-history',
                    description: 'Cap nhat thong tin KH cho ma ' + uniqueCode + ': ' + name + ' (' + phone + ')',
                    oldData: null,
                    newData: { name: name, phone: phone, uniqueCode: uniqueCode },
                    entityId: uniqueCode,
                    entityType: 'customer'
                });
            }
        } catch (e) { /* audit log error - ignore */ }

        // Close modal
        document.getElementById('editCustomerModal').style.display = 'none';

        // Reload table to show updated customer info
        loadData();
    } else {
        showNotification('Khong the cap nhat thong tin', 'error');
    }
}

// =====================================================
// TRANSACTION-LEVEL CUSTOMER EDIT
// =====================================================

// TPOS Customer lookup - function moved to shared/js/tpos-customer-lookup.js
// window.fetchTPOSCustomer(phone) is available globally via shared script
let tposLookupTimeout = null;

/**
 * Handle phone input for TPOS auto-lookup
 * Called when phone input changes
 */
function handlePhoneInputForTPOS() {
    const phoneInput = document.getElementById('editCustomerPhone');
    const phone = phoneInput.value.replace(/\D/g, ''); // Remove non-digits

    // Clear previous timeout
    if (tposLookupTimeout) {
        clearTimeout(tposLookupTimeout);
    }

    // Hide all TPOS result containers
    const tposResult = document.getElementById('tposLookupResult');
    const tposSingle = document.getElementById('tposLookupSingle');
    const tposMultiple = document.getElementById('tposLookupMultiple');
    const tposEmpty = document.getElementById('tposLookupEmpty');
    const tposLoading = document.getElementById('tposLookupLoading');

    if (tposResult) tposResult.style.display = 'none';
    if (tposSingle) tposSingle.style.display = 'none';
    if (tposMultiple) tposMultiple.style.display = 'none';
    if (tposEmpty) tposEmpty.style.display = 'none';
    if (tposLoading) tposLoading.style.display = 'none';

    // Only lookup when we have exactly 10 digits
    if (phone.length !== 10) {
        return;
    }

    // Show loading
    if (tposLoading) tposLoading.style.display = 'block';

    // Debounce: wait 500ms before making API call
    tposLookupTimeout = setTimeout(async () => {
        try {
            const result = await fetchTPOSCustomer(phone);

            // Hide loading
            if (tposLoading) tposLoading.style.display = 'none';

            // Show result container
            if (tposResult) tposResult.style.display = 'block';

            if (result.success && result.count > 0) {
                if (result.count === 1) {
                    // Single customer found - show name directly
                    if (tposSingle) {
                        tposSingle.style.display = 'block';
                        const nameSpan = document.getElementById('tposLookupName');
                        if (nameSpan) nameSpan.textContent = result.customers[0].name || 'Khong co ten';
                    }
                    // Auto-fill name field
                    const nameInput = document.getElementById('editCustomerName');
                    if (nameInput && result.customers[0].name) {
                        nameInput.value = result.customers[0].name;
                    }
                } else {
                    // Multiple customers - show dropdown
                    if (tposMultiple) {
                        tposMultiple.style.display = 'block';
                        const dropdown = document.getElementById('tposCustomerDropdown');
                        if (dropdown) {
                            dropdown.innerHTML = '<option value="">-- Chon khach hang --</option>';
                            result.customers.forEach(c => {
                                const opt = document.createElement('option');
                                opt.value = c.name || '';
                                opt.textContent = `${c.name || 'Khong ten'} (${c.phone})`;
                                dropdown.appendChild(opt);
                            });
                        }
                    }
                }
            } else {
                // No customer found
                if (tposEmpty) tposEmpty.style.display = 'block';
            }

            // Re-render icons
            if (window.lucide) lucide.createIcons();

        } catch (error) {
            console.error('[TPOS-LOOKUP] Error:', error);
            if (tposLoading) tposLoading.style.display = 'none';
            if (tposEmpty) {
                tposEmpty.style.display = 'block';
                tposEmpty.textContent = 'Loi khi tim TPOS';
            }
        }
    }, 500);
}

/**
 * Handle TPOS dropdown selection
 */
function handleTPOSDropdownChange() {
    const dropdown = document.getElementById('tposCustomerDropdown');
    const nameInput = document.getElementById('editCustomerName');

    if (dropdown && nameInput && dropdown.value) {
        nameInput.value = dropdown.value;
    }
}

// Edit customer info for a specific transaction
function editTransactionCustomer(transactionId, currentPhone, currentName) {
    const editCustomerModal = document.getElementById('editCustomerModal');
    const editCustomerUniqueCode = document.getElementById('editCustomerUniqueCode');
    const editCustomerName = document.getElementById('editCustomerName');
    const editCustomerPhone = document.getElementById('editCustomerPhone');
    const editCustomerForm = document.getElementById('editCustomerForm');
    const tposContainer = document.getElementById('tposLookupContainer');

    // Fill form with current values
    editCustomerUniqueCode.textContent = `Transaction #${transactionId}`;
    editCustomerName.value = currentName || '';
    editCustomerPhone.value = currentPhone || '';

    // Store transaction ID for form submission
    editCustomerForm.dataset.transactionId = transactionId;
    editCustomerForm.dataset.isTransactionEdit = 'true';

    // Enable TPOS lookup mode for transaction edits
    if (tposContainer) {
        tposContainer.style.display = 'block';

        // Make name field readonly (will be auto-filled from TPOS or dropdown)
        editCustomerName.readOnly = true;
        editCustomerName.placeholder = 'Tu dong tim tu TPOS...';
        editCustomerName.style.backgroundColor = '#f3f4f6';

        // Setup phone input listener for TPOS lookup
        editCustomerPhone.removeEventListener('input', handlePhoneInputForTPOS);
        editCustomerPhone.addEventListener('input', handlePhoneInputForTPOS);

        // Setup dropdown change listener
        const dropdown = document.getElementById('tposCustomerDropdown');
        if (dropdown) {
            dropdown.removeEventListener('change', handleTPOSDropdownChange);
            dropdown.addEventListener('change', handleTPOSDropdownChange);
        }

        // Reset TPOS lookup UI
        const tposResult = document.getElementById('tposLookupResult');
        const tposLoading = document.getElementById('tposLookupLoading');
        if (tposResult) tposResult.style.display = 'none';
        if (tposLoading) tposLoading.style.display = 'none';

        // If phone already has 10 digits, trigger lookup immediately
        const phone = currentPhone?.replace(/\D/g, '') || '';
        if (phone.length === 10) {
            handlePhoneInputForTPOS();
        }
    }

    // Show modal
    editCustomerModal.style.display = 'block';

    // Reinitialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Save transaction customer info
// @param {number} transactionId - Transaction ID
// @param {string} newPhone - New phone number
// @param {Object} options - Additional options
// @param {string} options.name - Customer name (optional)
// @param {boolean} options.isManualEntry - If true, triggers verification workflow (requires accountant approval)
async function saveTransactionCustomer(transactionId, newPhone, options = {}) {
    const API_BASE = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const { isManualEntry = false, name = '' } = options;

    // Check if user is accountant/admin - MUST use === true to prevent undefined becoming truthy
    const hasApprovePermission = authManager?.hasDetailedPermission('balance-history', 'approveTransaction');
    const isAccountant = hasApprovePermission === true;
    const shouldRequireApproval = isManualEntry && !isAccountant;

    // Get current user for audit trail
    const currentUser = authManager?.getUserInfo?.();
    const currentUsername = currentUser?.username || currentUser?.displayName || 'staff';

    try {
        const response = await fetch(`${API_BASE}/api/sepay/transaction/${transactionId}/phone`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: newPhone,
                name: name, // Send customer name too
                is_manual_entry: shouldRequireApproval,
                entered_by: currentUsername
            })
        });

        const result = await response.json();

        if (result.success) {
            // Return result with verification info
            return {
                success: true,
                requiresApproval: result.requires_approval || false,
                customerName: result.customer_name,
                verificationStatus: result.verification_status
            };
        } else {
            console.error('[SAVE-TRANSACTION-PHONE] Error:', result.error);
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error('[SAVE-TRANSACTION-PHONE] Error:', error);
        return { success: false, error: error.message };
    }
}

// Make functions globally available
window.editTransactionCustomer = editTransactionCustomer;
window.saveTransactionCustomer = saveTransactionCustomer;

// =====================================================
// CUSTOMER LIST BY PHONE - MAPPING FEATURE
// =====================================================

const CUSTOMER_API_URL = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Cache for customer data by phone
const customerListCache = {};
const CUSTOMER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fallback to TPOS OData API when proxy API returns empty
 * @param {string} phone - Phone number to search
 * @returns {Promise<Array>} - Array of customers from TPOS
 */
async function fetchCustomersFromTpos(phone) {
    if (!window.tokenManager) {
        console.warn('[CUSTOMER-LIST] No tokenManager available for TPOS fallback');
        return [];
    }

    try {
        const tposUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Name=${encodeURIComponent(phone)}&$top=50&$orderby=DateCreated+desc&$filter=Type+eq+'Customer'&$count=true`;

        console.log('[CUSTOMER-LIST] Fallback to TPOS OData API via proxy');

        const response = await window.tokenManager.authenticatedFetch(tposUrl);

        if (!response.ok) {
            console.warn('[CUSTOMER-LIST] TPOS API returned status:', response.status);
            return [];
        }

        const result = await response.json();

        if (!result.value || result.value.length === 0) {
            console.log('[CUSTOMER-LIST] TPOS API returned no results');
            return [];
        }

        console.log('[CUSTOMER-LIST] TPOS API found', result.value.length, 'customers');

        // Transform TPOS response to match expected customer format
        return result.value.map(tposCustomer => ({
            id: tposCustomer.Id,
            tpos_id: tposCustomer.Id,
            name: tposCustomer.Name || tposCustomer.DisplayName || '',
            phone: tposCustomer.Phone || '',
            address: tposCustomer.Street || tposCustomer.FullAddress || '',
            email: tposCustomer.Email || '',
            status: tposCustomer.StatusText || tposCustomer.Status || 'Binh thuong',
            debt: tposCustomer.Debit || 0,
            source: 'TPOS',
            // Additional TPOS fields
            facebook_id: tposCustomer.FacebookASIds || null,
            zalo: tposCustomer.Zalo || null,
            created_at: tposCustomer.DateCreated || null,
            updated_at: tposCustomer.LastUpdated || null
        }));

    } catch (error) {
        console.error('[CUSTOMER-LIST] TPOS fallback error:', error);
        return [];
    }
}

/**
 * Show customers list by phone number
 * @param {string} phone - Phone number to search
 */
async function showCustomersByPhone(phone) {
    // Redirect to new showCustomerQuickView function
    return showCustomerQuickView(phone);
}

// =====================================================
// CUSTOMER QUICK VIEW MODAL
// =====================================================

/**
 * Show quick customer info modal
 * @param {string} phone - Phone number
 */
async function showCustomerQuickView(phone) {
    if (!phone || phone === 'N/A') {
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Khong co so dien thoai de tim kiem', 'warning');
        }
        return;
    }

    const modal = document.getElementById('customerQuickViewModal');
    const loadingEl = document.getElementById('customerQuickViewLoading');
    const emptyEl = document.getElementById('customerQuickViewEmpty');
    const contentEl = document.getElementById('customerQuickViewContent');
    const linkEl = document.getElementById('customerQuickViewLink');
    const phoneEl = document.getElementById('customerQuickViewPhone');

    // Show modal
    modal.style.display = 'flex';
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    contentEl.style.display = 'none';
    phoneEl.textContent = phone;

    // Update Customer 360 link - use hash routing format (no leading slash)
    linkEl.href = `../customer-hub/index.html#customer/${encodeURIComponent(phone)}`;

    // Reinitialize icons
    if (window.lucide) lucide.createIcons();

    try {
        const response = await fetch(`${CUSTOMER_API_URL}/api/v2/customers/${phone}/quick-view`);
        const result = await response.json();

        loadingEl.style.display = 'none';

        if (!result.success || !result.data) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = `
                <i data-lucide="user-x" style="width: 48px; height: 48px; color: #9ca3af;"></i>
                <p style="margin-top: 15px; color: #6b7280;">Khong tim thay khach hang</p>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        contentEl.style.display = 'block';
        contentEl.innerHTML = renderCustomerQuickViewContent(result.data);

        if (window.lucide) lucide.createIcons();

    } catch (error) {
        console.error('[CUSTOMER-QUICK-VIEW] Error:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = `
            <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
            <p style="margin-top: 15px; color: #ef4444;">Loi khi tai thong tin</p>
            <p style="color: #9ca3af; font-size: 13px;">${error.message}</p>
        `;
        if (window.lucide) lucide.createIcons();
    }
}

/**
 * Render customer quick view content
 * @param {Object} data - Data from API
 */
function renderCustomerQuickViewContent(data) {
    const { customer, wallet, pending_deposits, recent_transactions, isFromTpos, source } = data;
    const pendingCount = pending_deposits?.count || 0;
    const pendingTotal = pending_deposits?.total || 0;

    // Warning banner if not in Customer360
    const tposWarning = isFromTpos ? `
        <div class="tpos-warning">
            <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
            <span>Khach hang chua tao trong Customer360 (Thong tin tu TPOS)</span>
        </div>
    ` : '';

    // Source badge
    const sourceBadge = isFromTpos
        ? '<span class="source-badge tpos">Tu TPOS</span>'
        : '<span class="source-badge local">Customer360</span>';

    // Wallet section
    let walletContent = '';
    if (wallet.total > 0 || pendingCount > 0) {
        walletContent = `
            <div class="wallet-balance-main">
                <span class="wallet-total">${formatCurrency(wallet.total)}</span>
            </div>
            <div class="wallet-breakdown">
                <div class="wallet-row">
                    <span>Thuc:</span>
                    <span class="amount-real">${formatCurrency(wallet.balance)}</span>
                </div>
                <div class="wallet-row">
                    <span>Ao:</span>
                    <span class="amount-virtual">${formatCurrency(wallet.virtual_balance)}</span>
                </div>
            </div>
            ${pendingCount > 0 ? `
            <div class="pending-deposits">
                <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
                <span>Cho duyet: <strong>${formatCurrency(pendingTotal)}</strong></span>
                <span class="pending-note">(${pendingCount} GD - chua cong vao so du)</span>
            </div>
            ` : ''}
        `;
    } else {
        walletContent = `
            <div class="wallet-empty">
                <i data-lucide="wallet" style="width: 24px; height: 24px; color: #9ca3af;"></i>
                <span>Chua co vi</span>
            </div>
        `;
    }

    // Recent transactions
    let transactionsContent = '';
    if (recent_transactions && recent_transactions.length > 0) {
        transactionsContent = `
            <div class="quick-view-section">
                <h4><i data-lucide="history"></i> Giao dich vi gan day</h4>
                <div class="transactions-list">
                    ${recent_transactions.map(tx => {
                        const isPositive = tx.amount > 0;
                        const amountClass = isPositive ? 'amount-positive' : 'amount-negative';
                        const icon = isPositive ? '\u2191' : '\u2193';
                        const date = new Date(tx.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                        return `
                            <div class="transaction-row">
                                <span class="tx-date">${date}</span>
                                <span class="tx-amount ${amountClass}">${icon} ${formatCurrency(Math.abs(tx.amount))}</span>
                                <span class="tx-note">${tx.note || tx.type || ''}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    return `
        ${tposWarning}

        <!-- Thong tin co ban -->
        <div class="quick-view-section">
            <h4><i data-lucide="user"></i> Thong tin co ban ${sourceBadge}</h4>
            <div class="info-grid">
                <div class="info-row">
                    <span class="label">Ten:</span>
                    <span class="value"><strong>${customer.name || 'Chua co'}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">SDT:</span>
                    <span class="value">
                        <strong style="color: #3b82f6;">${customer.phone}</strong>
                        <button onclick="copyPhoneToClipboard('${customer.phone}', this)" class="btn-copy-small" title="Copy">
                            <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                        </button>
                        <a href="https://zalo.me/${customer.phone}" target="_blank" class="btn-zalo-small" title="Chat Zalo">
                            <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i>
                        </a>
                    </span>
                </div>
                <div class="info-row">
                    <span class="label">Dia chi:</span>
                    <span class="value" style="max-width: 280px; text-align: right;">${customer.address || 'Chua co'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Trang thai:</span>
                    <span class="value">
                        <span class="badge ${getStatusBadgeClass(customer.status)}">${customer.status || 'Binh thuong'}</span>
                    </span>
                </div>
                ${customer.tpos_id ? `
                <div class="info-row">
                    <span class="label">TPOS ID:</span>
                    <span class="value"><code style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">${customer.tpos_id}</code></span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- So du vi -->
        <div class="quick-view-section wallet-section">
            <h4><i data-lucide="wallet"></i> So du vi</h4>
            ${walletContent}
        </div>

        ${transactionsContent}
    `;
}

/**
 * Close customer quick view modal
 */
function closeCustomerQuickViewModal() {
    const modal = document.getElementById('customerQuickViewModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Legacy function for backward compatibility
function closeCustomerListModal() {
    closeCustomerQuickViewModal();
}

/**
 * Get status badge CSS class
 */
function getStatusBadgeClass(status) {
    const statusMap = {
        'Binh thuong': 'badge-secondary',
        'Bom hang': 'badge-danger',
        'Canh bao': 'badge-warning',
        'Nguy hiem': 'badge-danger',
        'VIP': 'badge-success'
    };
    return statusMap[status] || 'badge-secondary';
}

// Setup Customer Quick View Modal Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('customerQuickViewModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCustomerQuickViewModal();
            }
        });
    }
});

// Export functions
window.showCustomersByPhone = showCustomersByPhone;
window.showCustomerQuickView = showCustomerQuickView;
window.closeCustomerQuickViewModal = closeCustomerQuickViewModal;
window.closeCustomerListModal = closeCustomerListModal;

// =====================================================
// PHONE DATA MODAL
// =====================================================

// Phone data modal pagination state
let phoneDataCurrentPage = 1;
let phoneDataPageSize = 50; // Records per page
let phoneDataTotalRecords = 0;

/**
 * Show phone data modal with data from balance_customer_info
 */
async function showPhoneDataModal(page = 1) {
    const modal = document.getElementById('phoneDataModal');
    const loading = document.getElementById('phoneDataLoading');
    const empty = document.getElementById('phoneDataEmpty');
    const content = document.getElementById('phoneDataContent');
    const tableBody = document.getElementById('phoneDataTableBody');
    const totalSpan = document.getElementById('phoneDataTotal');
    const shownSpan = document.getElementById('phoneDataShown');

    // Show modal and loading state
    modal.style.display = 'flex';
    loading.style.display = 'block';
    empty.style.display = 'none';
    content.style.display = 'none';

    try {
        console.log(`[PHONE-DATA] Fetching phone data... (page ${page}, size ${phoneDataPageSize})`);

        // Calculate offset
        const offset = (page - 1) * phoneDataPageSize;

        // Fetch with pagination
        const response = await fetch(`${API_BASE_URL}/api/sepay/phone-data?limit=${phoneDataPageSize}&offset=${offset}&include_totals=false`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to fetch phone data');
        }

        const data = result.data || [];
        const total = result.pagination?.total || 0;

        console.log(`[PHONE-DATA] Loaded ${data.length} records (total: ${total})`);

        // Update pagination state
        phoneDataCurrentPage = page;
        phoneDataTotalRecords = total;

        // Hide loading
        loading.style.display = 'none';

        if (data.length === 0 && page === 1) {
            // Show empty state (only on first page)
            empty.style.display = 'block';
            return;
        }

        // Show content
        content.style.display = 'block';
        totalSpan.textContent = total;

        // Calculate range
        const startRecord = offset + 1;
        const endRecord = Math.min(offset + data.length, total);
        shownSpan.textContent = `${startRecord}-${endRecord}`;

        // Render table
        tableBody.innerHTML = data.map((row, index) => {
            const createdAt = new Date(row.created_at).toLocaleString('vi-VN');
            const updatedAt = new Date(row.updated_at).toLocaleString('vi-VN');
            const customerName = row.customer_name || '<em style="color: #9ca3af;">Chua co</em>';
            const rowNumber = offset + index + 1; // Correct row number with pagination

            // Format extraction_note with color coding
            const extractionNote = row.extraction_note || '-';
            let noteColor = '#6b7280';
            let noteIcon = '';
            if (extractionNote.startsWith('PHONE_EXTRACTED')) {
                noteColor = '#10b981';
                noteIcon = '\u2713';
            } else if (extractionNote.startsWith('QR_CODE_FOUND')) {
                noteColor = '#3b82f6';
                noteIcon = '\uD83D\uDD17';
            } else if (extractionNote.startsWith('INVALID_PHONE_LENGTH')) {
                noteColor = '#f59e0b';
                noteIcon = '\u26A0\uFE0F';
            } else if (extractionNote.startsWith('NO_PHONE_FOUND')) {
                noteColor = '#9ca3af';
                noteIcon = '\u2717';
            } else if (extractionNote.startsWith('MULTIPLE_PHONES_FOUND')) {
                noteColor = '#8b5cf6';
                noteIcon = '\uD83D\uDCDE';
            }

            // Format name_fetch_status with badges
            const fetchStatus = row.name_fetch_status || '-';
            let statusBadge = '';
            if (fetchStatus === 'SUCCESS') {
                statusBadge = `<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">\u2713 SUCCESS</span>`;
            } else if (fetchStatus === 'PENDING') {
                statusBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">\u23F3 PENDING</span>`;
            } else if (fetchStatus === 'NOT_FOUND_IN_TPOS') {
                statusBadge = `<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">\u2717 NOT FOUND</span>`;
            } else if (fetchStatus === 'INVALID_PHONE') {
                statusBadge = `<span style="background: #fed7aa; color: #9a3412; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">\u26A0 INVALID</span>`;
            } else if (fetchStatus === 'NO_PHONE_TO_FETCH') {
                statusBadge = `<span style="background: #e5e7eb; color: #4b5563; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">- N/A</span>`;
            } else {
                statusBadge = `<span style="color: #9ca3af;">${fetchStatus}</span>`;
            }

            return `
                <tr>
                    <td>${rowNumber}</td>
                    <td><code style="font-size: 11px; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${row.unique_code}</code></td>
                    <td><strong style="color: #3b82f6;">${row.customer_phone || '-'}</strong></td>
                    <td>${customerName}</td>
                    <td>
                        ${row.customer_phone ? `
                            <button class="btn btn-primary btn-sm" onclick="showDebtForPhone('${row.customer_phone}')" style="padding: 4px 8px; font-size: 12px;">
                                <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Xem
                            </button>
                        ` : '<span style="color: #9ca3af;">-</span>'}
                    </td>
                    <td style="font-size: 12px; color: ${noteColor};">${noteIcon} ${extractionNote}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 12px; color: #6b7280;">${createdAt}</td>
                    <td style="font-size: 12px; color: #6b7280;">${updatedAt}</td>
                </tr>
            `;
        }).join('');

        // Render pagination controls
        renderPhoneDataPagination();

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (error) {
        console.error('[PHONE-DATA] Error:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        empty.innerHTML = `
            <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
            <p style="margin-top: 15px; color: #ef4444;">Loi khi tai du lieu!</p>
            <p style="color: #9ca3af; font-size: 14px;">${error.message}</p>
        `;
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

/**
 * Render pagination controls for phone data modal
 */
function renderPhoneDataPagination() {
    const paginationContainer = document.getElementById('phoneDataPagination');
    const pageInfo = document.getElementById('phoneDataPageInfo');
    const prevBtn = document.getElementById('phoneDataPrevBtn');
    const nextBtn = document.getElementById('phoneDataNextBtn');

    if (!paginationContainer || !pageInfo || !prevBtn || !nextBtn) {
        console.error('[PHONE-DATA] Pagination elements not found');
        return;
    }

    // Calculate total pages
    const totalPages = Math.ceil(phoneDataTotalRecords / phoneDataPageSize);

    // Show/hide pagination based on total pages
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';
    paginationContainer.style.gap = '8px';
    paginationContainer.style.alignItems = 'center';

    // Update page info
    pageInfo.textContent = `Trang ${phoneDataCurrentPage} / ${totalPages}`;

    // Enable/disable buttons
    prevBtn.disabled = phoneDataCurrentPage <= 1;
    nextBtn.disabled = phoneDataCurrentPage >= totalPages;

    // Update button styles
    if (prevBtn.disabled) {
        prevBtn.style.opacity = '0.5';
        prevBtn.style.cursor = 'not-allowed';
    } else {
        prevBtn.style.opacity = '1';
        prevBtn.style.cursor = 'pointer';
    }

    if (nextBtn.disabled) {
        nextBtn.style.opacity = '0.5';
        nextBtn.style.cursor = 'not-allowed';
    } else {
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';
    }
}

/**
 * Close phone data modal
 */
function closePhoneDataModal() {
    const modal = document.getElementById('phoneDataModal');
    modal.style.display = 'none';

    // Reset pagination state
    phoneDataCurrentPage = 1;
}

/**
 * Filter phone data table based on search input
 */
function filterPhoneDataTable() {
    const searchInput = document.getElementById('phoneDataSearch');
    const tableBody = document.getElementById('phoneDataTableBody');
    const shownSpan = document.getElementById('phoneDataShown');

    if (!searchInput || !tableBody) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const rows = tableBody.getElementsByTagName('tr');
    let visibleCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const text = row.textContent.toLowerCase();

        if (text.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    }

    // Update shown count
    if (shownSpan) {
        if (searchTerm) {
            shownSpan.textContent = `${visibleCount} (loc)`;
        } else {
            const totalSpan = document.getElementById('phoneDataTotal');
            const total = totalSpan ? totalSpan.textContent : rows.length;
            shownSpan.textContent = `1-${rows.length}`;
        }
    }
}

/**
 * Show debt information for a specific phone number
 */
async function showDebtForPhone(phone) {
    if (!phone) {
        alert('Khong co so dien thoai!');
        return;
    }

    try {
        // Show loading notification
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(`Dang tai cong no cho ${phone}...`, 'info');
        }

        // Fetch balance from wallet API
        const response = await fetch(`${API_BASE_URL}/api/v2/wallet/balance?phone=${encodeURIComponent(phone)}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Khong the tai so du vi');
        }

        const balance = result.balance || 0;

        // Format currency
        const balanceFormatted = new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(balance);

        // Show result
        const message = `SDT: ${phone}\nSo du vi: ${balanceFormatted}`;

        if (window.NotificationManager) {
            window.NotificationManager.showNotification(message, 'success');
        } else {
            alert(message);
        }

    } catch (error) {
        console.error('[DEBT] Error fetching debt:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(`Loi: ${error.message}`, 'error');
        } else {
            alert(`Loi: ${error.message}`);
        }
    }
}

// Export phone data functions
window.showPhoneDataModal = showPhoneDataModal;
window.closePhoneDataModal = closePhoneDataModal;
window.filterPhoneDataTable = filterPhoneDataTable;
window.showDebtForPhone = showDebtForPhone;

// =====================================================
// FETCH CUSTOMER NAMES FROM TPOS
// =====================================================

/**
 * Fetch customer names from TPOS Partner API for phones without names
 */
async function fetchCustomerNamesFromTPOS() {
    try {
        // Fetch phone data from database (without totals for speed)
        const response = await fetch(`${API_BASE_URL}/api/sepay/phone-data?limit=500&include_totals=false`);
        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error('Failed to fetch phone data');
        }

        // Filter phones that are PENDING (valid 10-digit phones without names)
        const phonesToFetch = result.data.filter(row => {
            const phone = row.customer_phone || '';
            const status = row.name_fetch_status || '';
            // Only fetch if: has valid 10-digit phone AND status is PENDING
            return phone.length === 10 && /^0\d{9}$/.test(phone) && status === 'PENDING';
        });

        if (phonesToFetch.length === 0) {
            alert('Khong co phone nao can fetch!\n\nTat ca phone hop le da duoc xu ly.');
            return;
        }

        if (!confirm(`Tim thay ${phonesToFetch.length} phone numbers chua co ten.\n\nGoi TPOS API de lay ten?`)) {
            return;
        }

        console.log(`[FETCH-NAMES] Processing ${phonesToFetch.length} phones...`);

        let success = 0;
        let notFound = 0;
        let failed = 0;

        // Process each phone
        for (const row of phonesToFetch) {
            try {
                const phone = row.customer_phone;
                console.log(`[FETCH-NAMES] Fetching name for: ${phone}`);

                // Call backend API (uses automatic TPOS token from environment)
                const tposResponse = await fetch(`${API_BASE_URL}/api/sepay/tpos/customer/${phone}`);
                const tposData = await tposResponse.json();

                if (!tposData.success || !tposData.data || tposData.data.length === 0) {
                    console.log(`[FETCH-NAMES] No customer found for ${phone}`);

                    // Mark as NOT_FOUND_IN_TPOS
                    await fetch(`${API_BASE_URL}/api/sepay/customer-info/${row.unique_code}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            customer_name: null,
                            name_fetch_status: 'NOT_FOUND_IN_TPOS'
                        })
                    });

                    notFound++;
                    continue;
                }

                // Take first match
                const customer = tposData.data[0];
                const customerName = customer.name || 'Unknown';

                console.log(`[FETCH-NAMES] Found: ${customerName} (${tposData.count} matches)`);

                // Update database
                const updateResponse = await fetch(`${API_BASE_URL}/api/sepay/customer-info/${row.unique_code}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        customer_name: customerName
                    })
                });

                const updateResult = await updateResponse.json();

                if (updateResult.success) {
                    console.log(`[FETCH-NAMES] Updated ${row.unique_code} -> ${customerName}`);
                    success++;
                } else {
                    console.error(`[FETCH-NAMES] Failed to update ${row.unique_code}`);
                    failed++;
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`[FETCH-NAMES] Error for ${row.customer_phone}:`, error);
                failed++;
            }
        }

        alert(`Hoan thanh!\n\nThanh cong: ${success}\nKhong tim thay: ${notFound}\nLoi: ${failed}`);

        // Reload data
        loadData();
        if (document.getElementById('phoneDataModal').style.display === 'flex') {
            showPhoneDataModal(phoneDataCurrentPage); // Refresh phone data modal at current page
        }

    } catch (error) {
        console.error('[FETCH-NAMES] Error:', error);
        alert('Loi: ' + error.message);
    }
}

// =====================================================
// REPROCESS OLD TRANSACTIONS
// =====================================================

/**
 * Reprocess old transactions to extract phones and fetch from TPOS
 */
async function reprocessOldTransactions() {
    console.log('[REPROCESS] Function called');

    const limit = prompt('Nhap so luong giao dich can xu ly (toi da 500):', '100');

    if (!limit) {
        console.log('[REPROCESS] User cancelled prompt');
        return; // User cancelled
    }

    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
        alert('So luong khong hop le! Vui long nhap tu 1-500.');
        return;
    }

    // Ask if user wants to force reprocess (including already processed transactions)
    const forceReprocess = confirm(
        `Xu ly lai ${limitNum} giao dich cu?\n\n` +
        `BAM "OK" = Xu ly LAI TAT CA (ke ca da xu ly truoc do)\n` +
        `BAM "Cancel" = Chi xu ly GD chua duoc xu ly\n\n` +
        `He thong se:\n` +
        `- Extract phone tu noi dung (>= 5 so hoac 10 so)\n` +
        `- Tim kiem TPOS de lay SDT day du + ten KH\n` +
        `- Luu thong tin khach hang\n` +
        `- Hien thi trong bang`
    );

    try {
        console.log(`[REPROCESS] Starting batch reprocess for ${limitNum} transactions (force: ${forceReprocess})...`);

        // Show loading indicator (reuse the button as status)
        const btn = document.getElementById('reprocessOldTransactionsBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> Dang xu ly...';
        lucide.createIcons();

        const response = await fetch(`${API_BASE_URL}/api/sepay/batch-update-phones`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                limit: limitNum,
                force: forceReprocess  // TRUE = reprocess all, FALSE = only unprocessed
            })
        });

        const result = await response.json();

        // Restore button
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();

        if (!result.success) {
            throw new Error(result.message || 'Failed to reprocess transactions');
        }

        console.log('[REPROCESS] Complete:', result.data);

        const summary = result.data;

        // Build detailed message
        let message = `Xu ly hoan tat!\n\n` +
            `Tong so: ${summary.total}\n` +
            `Thanh cong: ${summary.success}\n` +
            `Pending (nhieu SDT): ${summary.pending_matches}\n` +
            `Khong tim thay TPOS: ${summary.not_found}\n` +
            `Bo qua: ${summary.skipped}\n` +
            `Loi: ${summary.failed}`;

        // If there are not_found items, show details
        if (summary.not_found > 0 && summary.details) {
            const notFoundItems = summary.details.filter(d => d.status === 'not_found');

            if (notFoundItems.length > 0) {
                message += `\n\nChi tiet KHONG TIM THAY TPOS (${notFoundItems.length}):\n`;

                // Show first 10 items in alert (to avoid too long message)
                const itemsToShow = notFoundItems.slice(0, 10);
                itemsToShow.forEach((item, index) => {
                    const contentPreview = item.content ?
                        (item.content.length > 40 ? item.content.substring(0, 40) + '...' : item.content) :
                        'N/A';
                    message += `\n${index + 1}. GD #${item.transaction_id}\n   Phone: ${item.partial_phone || 'N/A'}\n   ND: "${contentPreview}"\n`;
                });

                if (notFoundItems.length > 10) {
                    message += `\n... va ${notFoundItems.length - 10} giao dich khac`;
                }

                // Also log full details to console
                console.group('[REPROCESS] Chi tiet KHONG TIM THAY TPOS:');
                console.table(notFoundItems.map(item => ({
                    'GD #': item.transaction_id,
                    'Partial Phone': item.partial_phone || 'N/A',
                    'Noi dung': item.content || '',
                    'Ly do': item.reason
                })));
                console.groupEnd();

                message += `\n\nXem console (F12) de thay danh sach day du`;
            }
        }

        alert(message);

        // Reload data to show updated customer info
        loadData();
        loadStatistics();

    } catch (error) {
        console.error('[REPROCESS] Error:', error);
        alert('Loi: ' + error.message);

        // Restore button
        const btn = document.getElementById('reprocessOldTransactionsBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="rotate-cw"></i> Xu ly lai GD cu';
            lucide.createIcons();
        }
    }
}

// =====================================================
// NAME SELECTOR POPUP
// For selecting different reference names (Facebook nicknames)
// =====================================================

/**
 * Show popup to select a different display name for the transaction
 * @param {number} transactionId - The transaction ID
 * @param {string} phone - Customer phone number
 * @param {string} currentName - Current display name
 * @param {Array} aliases - Array of alias names from backend
 */
function showNameSelector(transactionId, phone, currentName, aliases = []) {
    console.log('[NAME-SELECTOR] Showing selector for TX:', transactionId, 'Phone:', phone, 'Current:', currentName, 'Aliases:', aliases);

    // Remove any existing popup
    closeNameSelector();

    // Ensure aliases is an array
    if (!Array.isArray(aliases)) {
        try {
            aliases = JSON.parse(aliases) || [];
        } catch (e) {
            aliases = [];
        }
    }

    // Build popup content
    let optionsHtml = '';

    if (aliases.length > 0) {
        // Show alias options
        optionsHtml = aliases.map((alias, index) => {
            const isSelected = alias === currentName;
            return `
                <div class="name-option ${isSelected ? 'selected' : ''}"
                     onclick="selectDisplayName(${transactionId}, '${alias.replace(/'/g, "\\'")}', '${phone}')">
                    <span class="name-text">${alias}</span>
                    ${isSelected ? '<i data-lucide="check" class="check-icon"></i>' : ''}
                </div>
            `;
        }).join('');
    } else {
        optionsHtml = '<div class="no-aliases">Chua co ten tham khao nao</div>';
    }

    // Add custom input option
    optionsHtml += `
        <div class="name-option custom-input-option">
            <input type="text" id="customNameInput" placeholder="Nhap ten moi..."
                   onkeypress="if(event.key==='Enter') submitCustomName(${transactionId}, '${phone}')"
                   style="flex: 1; border: none; background: transparent; outline: none; font-size: 14px;">
            <button onclick="submitCustomName(${transactionId}, '${phone}')"
                    class="btn btn-sm btn-primary"
                    style="padding: 4px 8px; margin-left: 8px;">
                <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `;

    // Create popup element
    const popup = document.createElement('div');
    popup.id = 'nameSelectorPopup';
    popup.className = 'name-selector-popup';
    popup.innerHTML = `
        <div class="popup-header">
            <span>Chon ten tham khao</span>
            <button onclick="closeNameSelector()" class="close-btn">
                <i data-lucide="x" style="width: 16px; height: 16px;"></i>
            </button>
        </div>
        <div class="popup-body">
            ${optionsHtml}
        </div>
        <div class="popup-footer">
            <span class="phone-hint">SDT: ${phone}</span>
        </div>
    `;

    document.body.appendChild(popup);

    // Position popup near the clicked element
    positionPopup(popup, event);

    // Re-render Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Close popup when clicking outside
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 100);
}

/**
 * Position the popup near the triggering event
 */
function positionPopup(popup, event) {
    const rect = event.target.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    popup.style.position = 'absolute';
    popup.style.top = (rect.bottom + scrollTop + 5) + 'px';
    popup.style.left = (rect.left + scrollLeft) + 'px';
    popup.style.zIndex = '10000';

    // Ensure popup doesn't go off-screen
    requestAnimationFrame(() => {
        const popupRect = popup.getBoundingClientRect();
        if (popupRect.right > window.innerWidth) {
            popup.style.left = (window.innerWidth - popupRect.width - 10 + scrollLeft) + 'px';
        }
        if (popupRect.bottom > window.innerHeight) {
            popup.style.top = (rect.top + scrollTop - popupRect.height - 5) + 'px';
        }
    });
}

/**
 * Handle click outside popup to close it
 */
function handleOutsideClick(event) {
    const popup = document.getElementById('nameSelectorPopup');
    if (popup && !popup.contains(event.target) && !event.target.closest('.clickable-name')) {
        closeNameSelector();
    }
}

/**
 * Close the name selector popup
 */
function closeNameSelector() {
    const popup = document.getElementById('nameSelectorPopup');
    if (popup) {
        popup.remove();
    }
    document.removeEventListener('click', handleOutsideClick);
}

/**
 * Select a display name for the transaction
 * @param {number} transactionId - The transaction ID
 * @param {string} newName - The selected name
 * @param {string} phone - Customer phone number
 */
async function selectDisplayName(transactionId, newName, phone) {
    console.log('[NAME-SELECTOR] Selecting name:', newName, 'for TX:', transactionId);

    try {
        const response = await fetch(`${API_BASE}/sepay/transaction/${transactionId}/display-name`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                display_name: newName,
                add_to_aliases: true
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('[NAME-SELECTOR] Updated successfully');

            // Close popup
            closeNameSelector();

            // Update the row in the table
            updateTransactionNameInTable(transactionId, newName);

            // Show success notification
            if (window.showNotification) {
                window.showNotification('Da cap nhat ten tham khao', 'success');
            }
        } else {
            console.error('[NAME-SELECTOR] Failed:', result.error);
            if (window.showNotification) {
                window.showNotification('Loi: ' + result.error, 'error');
            }
        }
    } catch (error) {
        console.error('[NAME-SELECTOR] Error:', error);
        if (window.showNotification) {
            window.showNotification('Loi ket noi server', 'error');
        }
    }
}

/**
 * Submit custom name input
 */
async function submitCustomName(transactionId, phone) {
    const input = document.getElementById('customNameInput');
    const newName = input?.value?.trim();

    if (!newName) {
        if (window.showNotification) {
            window.showNotification('Vui long nhap ten', 'warning');
        }
        return;
    }

    await selectDisplayName(transactionId, newName, phone);
}

/**
 * Update the customer name in the table row without full reload
 */
function updateTransactionNameInTable(transactionId, newName) {
    const row = document.querySelector(`tr[data-id="${transactionId}"]`);
    if (!row) {
        // If row not found, reload data
        loadData(false);
        return;
    }

    // Find the name cell and update it
    const nameCell = row.querySelector('.clickable-name');
    if (nameCell) {
        // Update the text content but preserve the icon
        const textSpan = nameCell.querySelector('.name-text') || nameCell.childNodes[0];
        if (textSpan) {
            if (textSpan.nodeType === Node.TEXT_NODE) {
                textSpan.textContent = newName + ' ';
            } else {
                textSpan.textContent = newName;
            }
        } else {
            // Fallback: just update the text
            const icon = nameCell.querySelector('i');
            nameCell.textContent = newName + ' ';
            if (icon) nameCell.appendChild(icon);
        }
    } else {
        // Reload the row
        loadData(false);
    }
}

// Export name selector functions for global access
window.showNameSelector = showNameSelector;
window.closeNameSelector = closeNameSelector;
window.selectDisplayName = selectDisplayName;
window.submitCustomName = submitCustomName;

// Export for global access
window.showDetail = showDetail;
window.showTransactionQR = showTransactionQR;
window.copyUniqueCode = copyUniqueCode;
window.copyQRUrl = copyQRUrl;
window.downloadQR = downloadQR;
window.editCustomerInfo = editCustomerInfo;
window.saveQRCustomerInfo = saveQRCustomerInfo;
