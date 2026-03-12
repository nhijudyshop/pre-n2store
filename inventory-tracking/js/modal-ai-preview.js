// =====================================================
// MODAL AI PREVIEW - Preview Modal UI Component
// Displays AI-extracted invoice data with editing capability
// =====================================================

console.log('[AI-PREVIEW] Modal AI Preview initialized');

// =====================================================
// STATE MANAGEMENT
// =====================================================

let currentAIPreviewResult = null; // Current result being previewed
let currentPreviewIndex = 0; // Current preview index (1-based)

// =====================================================
// MODAL FUNCTIONS
// =====================================================

/**
 * Open AI preview modal with result
 * @param {Object} result - Processed result from queue manager
 * @param {number} imageIndex - Current image index (1-based)
 * @param {number} totalImages - Total number of images
 */
function openAIPreviewModal(result, imageIndex, totalImages) {
    console.log(`[AI-PREVIEW] Opening modal for image ${imageIndex}/${totalImages}`);

    currentAIPreviewResult = result;
    currentPreviewIndex = imageIndex;

    const modal = document.getElementById('modalAIPreview');
    const body = document.getElementById('modalAIPreviewBody');

    if (!modal || !body) {
        console.error('[AI-PREVIEW] Modal elements not found');
        return;
    }

    // Render content based on success/error
    if (!result.success) {
        body.innerHTML = renderErrorState(result, imageIndex, totalImages);
    } else {
        body.innerHTML = renderSuccessState(result, imageIndex, totalImages);
    }

    // Open modal
    openModal('modalAIPreview');

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render success state (editable preview with detailed product table)
 * @param {Object} result - Successful result
 * @param {number} imageIndex - Current image index
 * @param {number} totalImages - Total images
 * @returns {string} HTML content
 */
function renderSuccessState(result, imageIndex, totalImages) {
    const data = result.data;

    // Check for warnings in notes
    const hasWarning = data.notes && data.notes.includes('⚠️ CẢNH BÁO');
    const warningClass = hasWarning ? 'has-warning' : '';

    return `
        <div class="ai-preview-container ${warningClass}">
            <div class="ai-preview-left">
                <div class="ai-preview-header">
                    <h4>Ảnh hóa đơn ${imageIndex}/${totalImages}</h4>
                    <span class="ai-badge">🤖 AI Processed</span>
                </div>
                <img src="${result.imageUrl}" alt="Invoice ${imageIndex}" class="ai-preview-image">
                ${hasWarning ? `
                    <div class="ai-warning-box">
                        ${data.notes}
                    </div>
                ` : ''}
            </div>
            <div class="ai-preview-right">
                <h4>Dữ liệu AI trích xuất</h4>

                <div class="form-group">
                    <label>NCC # ${!data.sttNCC ? '<span class="required">*</span>' : ''}</label>
                    <input type="number" id="aiNCC" class="form-input ${!data.sttNCC ? 'input-warning' : ''}"
                           value="${data.sttNCC || ''}"
                           placeholder="STT NCC (bắt buộc)">
                    ${!data.sttNCC ? '<small class="text-warning">⚠️ AI không tìm thấy NCC, vui lòng nhập</small>' : ''}
                </div>

                <div class="form-group">
                    <label>Tên NCC</label>
                    <input type="text" id="aiTenNCC" class="form-input"
                           value="${data.tenNCC || ''}"
                           placeholder="Tên nhà cung cấp (tùy chọn)">
                </div>

                <div class="form-group">
                    <label>Sản phẩm chi tiết</label>
                    ${renderProductsDetailTable(data.productsData || [])}
                </div>

                <div class="ai-preview-totals">
                    <div class="total-item">
                        <span class="total-label">Tổng tiền:</span>
                        <strong class="total-value">${formatNumber(data.totalAmount || 0)}</strong>
                    </div>
                    <div class="total-item">
                        <span class="total-label">Tổng món:</span>
                        <strong class="total-value">${data.totalItems || 0}</strong>
                    </div>
                </div>

                ${data.date ? `
                    <div class="form-group">
                        <label>Ngày hóa đơn</label>
                        <input type="text" id="aiDate" class="form-input"
                               value="${data.date}" readonly>
                    </div>
                ` : ''}

                ${data.notes && !hasWarning ? `
                    <div class="form-group">
                        <label>Ghi chú</label>
                        <textarea id="aiNotes" class="form-textarea" rows="2">${data.notes}</textarea>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Render detailed products table with color breakdown
 * @param {Array} productsData - Array of product objects with color details
 * @returns {string} HTML table
 */
function renderProductsDetailTable(productsData) {
    if (!productsData || productsData.length === 0) {
        return '<p class="text-muted">Không có sản phẩm</p>';
    }

    return `
        <div class="products-detail-table-container">
            <table class="products-detail-table">
                <thead>
                    <tr>
                        <th class="col-sku">Mã hàng</th>
                        <th class="col-desc">Mô tả SP</th>
                        <th class="col-colors">Chi tiết màu sắc</th>
                        <th class="col-qty">Tổng SL</th>
                        <th class="col-price">Đơn giá</th>
                        <th class="col-amount">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${productsData.map((product, idx) => renderProductDetailRow(product, idx)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render a single product row with editable fields
 * @param {Object} product - Product object
 * @param {number} idx - Product index
 * @returns {string} HTML row
 */
function renderProductDetailRow(product, idx) {
    const colors = product.mauSac || [];
    const tongSoLuong = product.tongSoLuong || 0;
    const thanhTien = product.thanhTien || 0;

    // Format color details: "Trắng (10), Đen (13), Xám (10)"
    const colorText = formatColors(colors);

    return `
        <tr class="product-detail-row" data-idx="${idx}">
            <td class="col-sku">
                <input type="text" class="input-inline product-sku"
                       value="${product.maSP || ''}"
                       data-idx="${idx}">
            </td>
            <td class="col-desc">
                <input type="text" class="input-inline product-desc"
                       value="${product.moTa || ''}"
                       placeholder="Mô tả sản phẩm"
                       data-idx="${idx}">
            </td>
            <td class="col-colors">
                <div class="colors-display" onclick="editColors(${idx})">
                    ${colorText}
                    <button type="button" class="btn-edit-colors" onclick="editColors(${idx}); event.stopPropagation();">
                        <i data-lucide="edit-2"></i>
                    </button>
                </div>
                <input type="hidden" class="product-colors-data"
                       data-idx="${idx}"
                       value='${JSON.stringify(colors)}'>
            </td>
            <td class="col-qty text-center">
                <strong class="product-qty" data-idx="${idx}">${tongSoLuong}</strong>
            </td>
            <td class="col-price">
                <input type="number" class="input-inline product-price"
                       value="${product.giaDonVi || ''}"
                       data-idx="${idx}"
                       onchange="recalculateProductTotal(${idx})">
            </td>
            <td class="col-amount text-right">
                <strong class="product-amount" data-idx="${idx}">${formatNumber(thanhTien)}</strong>
            </td>
        </tr>
    `;
}

/**
 * Format color array for display
 * @param {Array} mauSac - Color array [{mau, soLuong}]
 * @returns {string} Formatted string
 */
function formatColors(mauSac) {
    if (!mauSac || mauSac.length === 0) {
        return '<span class="text-muted">Chưa có màu</span>';
    }
    return mauSac.map(c => `${c.mau} (${c.soLuong})`).join(', ');
}

/**
 * Render error state
 * @param {Object} result - Failed result
 * @param {number} imageIndex - Current image index
 * @param {number} totalImages - Total images
 * @returns {string} HTML content
 */
function renderErrorState(result, imageIndex, totalImages) {
    return `
        <div class="ai-preview-error">
            <div class="error-icon">
                <i data-lucide="alert-circle"></i>
            </div>
            <h4>Không thể xử lý ảnh ${imageIndex}/${totalImages}</h4>
            <p class="error-message">${result.error || 'Lỗi không xác định'}</p>
            <p class="error-hint">Bạn có thể bỏ qua, thử lại, hoặc nhập thủ công.</p>
            <img src="${result.imageUrl}" alt="Failed image" class="ai-preview-image" style="max-height: 300px; margin-top: 20px;">
        </div>
    `;
}

// =====================================================
// COLOR EDITING FUNCTIONS
// =====================================================

/**
 * Edit colors for a product - opens a simple prompt-based editor
 * @param {number} productIdx - Product index
 */
function editColors(productIdx) {
    const row = document.querySelector(`.product-detail-row[data-idx="${productIdx}"]`);
    if (!row) return;

    const colorsInput = row.querySelector(`.product-colors-data[data-idx="${productIdx}"]`);
    const mauSac = JSON.parse(colorsInput.value || '[]');

    // Create a simple text representation for editing
    const colorText = mauSac.map(c => `${c.mau}: ${c.soLuong}`).join('\n');

    const newText = prompt(
        'Chỉnh sửa màu sắc (mỗi dòng: Tên màu: Số lượng)\nVí dụ:\nĐen: 10\nTrắng: 13',
        colorText
    );

    if (newText === null) return; // Cancelled

    // Parse the edited text
    const newColors = [];
    const lines = newText.split('\n').filter(l => l.trim());

    for (const line of lines) {
        const match = line.match(/^(.+?):\s*(\d+)$/);
        if (match) {
            newColors.push({
                mau: match[1].trim(),
                soLuong: parseInt(match[2]) || 0
            });
        }
    }

    // Update hidden input
    colorsInput.value = JSON.stringify(newColors);

    // Update display
    const display = row.querySelector('.colors-display');
    if (display) {
        display.innerHTML = formatColors(newColors) + `
            <button type="button" class="btn-edit-colors" onclick="editColors(${productIdx}); event.stopPropagation();">
                <i data-lucide="edit-2"></i>
            </button>
        `;
    }

    // Recalculate totals
    recalculateProductTotal(productIdx);

    // Reinitialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Confirm AI preview and add to invoice form
 */
async function confirmAIPreview() {
    const result = currentAIPreviewResult;
    if (!result) {
        console.error('[AI-PREVIEW] No current result');
        return;
    }

    // For error state, just skip
    if (!result.success) {
        handleSkipAIPreview();
        return;
    }

    // Get edited values
    const sttNCC = parseInt(document.getElementById('aiNCC')?.value);
    const tenNCC = document.getElementById('aiTenNCC')?.value?.trim() || '';
    const notes = document.getElementById('aiNotes')?.value?.trim() || '';

    // NEW: Extract edited product data from table
    const productsData = extractProductsFromTable();

    // Validate required fields
    if (!sttNCC || isNaN(sttNCC)) {
        if (typeof toast !== 'undefined') {
            window.notificationManager?.error('Vui lòng nhập mã NCC!');
        } else {
            alert('Vui lòng nhập mã NCC!');
        }
        document.getElementById('aiNCC')?.focus();
        return;
    }

    if (!productsData || productsData.length === 0) {
        if (typeof toast !== 'undefined') {
            window.notificationManager?.error('Vui lòng kiểm tra sản phẩm!');
        } else {
            alert('Vui lòng kiểm tra sản phẩm!');
        }
        return;
    }

    console.log('[AI-PREVIEW] Confirming with data:', { sttNCC, tenNCC, productsData });

    // Upload image to Firebase Storage
    const loadingToast = typeof toast !== 'undefined' ? window.notificationManager?.loading('Đang tải ảnh lên Firebase...') : null;

    try {
        // Upload image
        const timestamp = Date.now();
        const imageUrl = await uploadImage(result.file, `invoices/${timestamp}`);

        console.log('[AI-PREVIEW] Image uploaded:', imageUrl);

        // Prepare data with structured products
        const editedData = {
            sttNCC,
            tenNCC,
            productsData,  // NEW: Structured array instead of text
            notes,
            imageUrl,
            totalAmount: productsData.reduce((sum, p) => sum + (p.thanhTien || 0), 0),
            totalItems: productsData.reduce((sum, p) => sum + (p.tongSoLuong || 0), 0)
        };

        // Add to invoice form in shipment modal
        await addAIInvoiceToForm(editedData);

        if (loadingToast && typeof toast !== 'undefined') {
            window.notificationManager?.remove(loadingToast);
            window.notificationManager?.success(`Đã thêm hóa đơn NCC ${sttNCC}`);
        }

        // Close modal
        closeModal('modalAIPreview');

        // Show next preview if available
        showNextAIPreview();

    } catch (error) {
        console.error('[AI-PREVIEW] Error uploading image:', error);

        if (loadingToast && typeof toast !== 'undefined') {
            window.notificationManager?.remove(loadingToast);
            window.notificationManager?.error('Không thể tải ảnh lên: ' + error.message);
        } else {
            alert('Không thể tải ảnh lên: ' + error.message);
        }
    }
}

/**
 * Extract product data from preview table (edited by user)
 * @returns {Array} Array of product objects
 */
function extractProductsFromTable() {
    const rows = document.querySelectorAll('.product-detail-row');

    return Array.from(rows).map(row => {
        const idx = row.dataset.idx;
        const maSP = row.querySelector(`.product-sku[data-idx="${idx}"]`).value.trim();
        const moTa = row.querySelector(`.product-desc[data-idx="${idx}"]`).value.trim();
        const colorsInput = row.querySelector(`.product-colors-data[data-idx="${idx}"]`);
        const giaDonVi = parseInt(row.querySelector(`.product-price[data-idx="${idx}"]`).value) || 0;

        const mauSac = JSON.parse(colorsInput.value || '[]');
        const tongSoLuong = mauSac.reduce((sum, c) => sum + (c.soLuong || 0), 0);
        const thanhTien = tongSoLuong * giaDonVi;

        return {
            maSP,
            moTa,
            mauSac,
            tongSoLuong,
            soMau: mauSac.length,
            giaDonVi,
            thanhTien,
            rawText: `MA ${maSP}${moTa ? ' ' + moTa : ''} ${mauSac.length} MÀU ${tongSoLuong}X${giaDonVi}`,
            aiExtracted: true,
            dataSource: 'ai'
        };
    }).filter(p => p.maSP); // Filter out empty rows
}

/**
 * Recalculate product total when price changes
 * @param {number} productIdx - Product index
 */
function recalculateProductTotal(productIdx) {
    const row = document.querySelector(`.product-detail-row[data-idx="${productIdx}"]`);
    if (!row) return;

    const colorsInput = row.querySelector(`.product-colors-data[data-idx="${productIdx}"]`);
    const priceInput = row.querySelector(`.product-price[data-idx="${productIdx}"]`);

    const mauSac = JSON.parse(colorsInput.value || '[]');
    const tongSoLuong = mauSac.reduce((sum, c) => sum + (c.soLuong || 0), 0);
    const giaDonVi = parseInt(priceInput.value) || 0;
    const thanhTien = tongSoLuong * giaDonVi;

    // Update display
    const qtyCell = row.querySelector(`.product-qty[data-idx="${productIdx}"]`);
    const amountCell = row.querySelector(`.product-amount[data-idx="${productIdx}"]`);

    if (qtyCell) qtyCell.textContent = tongSoLuong;
    if (amountCell) amountCell.textContent = formatNumber(thanhTien);
}

/**
 * Skip current preview and move to next
 */
function handleSkipAIPreview() {
    console.log('[AI-PREVIEW] Skipping image', currentPreviewIndex);

    if (typeof toast !== 'undefined') {
        window.notificationManager?.warning(`Đã bỏ qua ảnh ${currentPreviewIndex}`);
    }

    closeModal('modalAIPreview');
    showNextAIPreview();
}

/**
 * Create manual invoice form and skip AI
 */
function handleManualEntry() {
    console.log('[AI-PREVIEW] Creating manual entry');

    // Add empty invoice form
    if (typeof addInvoiceForm === 'function') {
        addInvoiceForm();
    }

    if (typeof toast !== 'undefined') {
        window.notificationManager?.info('Đã tạo form nhập thủ công');
    }

    closeModal('modalAIPreview');
    showNextAIPreview();
}

/**
 * Show next AI preview if available
 */
function showNextAIPreview() {
    const nextIndex = currentPreviewIndex + 1;

    console.log('[AI-PREVIEW] Checking for next preview:', nextIndex);

    // Check if next result is ready
    const nextResult = aiQueueManager.getResult(nextIndex);

    if (nextResult) {
        console.log('[AI-PREVIEW] Next result ready, showing preview');
        openAIPreviewModal(nextResult, nextIndex, currentAIPreviewResult.totalImages);
    } else {
        console.log('[AI-PREVIEW] No more previews');

        // Check if all images are processed
        const status = aiQueueManager.getStatus();
        if (!status.isProcessing && status.queueLength === 0) {
            if (typeof toast !== 'undefined') {
                window.notificationManager?.success('Đã xử lý xong tất cả ảnh');
            }
        }
    }
}

/**
 * Add AI invoice to invoice form in shipment modal
 * @param {Object} data - Invoice data
 */
async function addAIInvoiceToForm(data) {
    console.log('[AI-PREVIEW] Adding invoice to form:', data);

    const container = document.getElementById('invoicesContainer');
    if (!container) {
        throw new Error('invoicesContainer not found');
    }

    const count = container.querySelectorAll('.invoice-form').length;

    // Check for duplicate NCC
    const existingForms = container.querySelectorAll('.invoice-form');
    let duplicateForm = null;

    for (const form of existingForms) {
        const existingNCC = parseInt(form.querySelector('.invoice-ncc')?.value);
        if (existingNCC === data.sttNCC) {
            duplicateForm = form;
            break;
        }
    }

    if (duplicateForm) {
        // Ask user if they want to merge
        const shouldMerge = confirm(
            `NCC ${data.sttNCC} đã tồn tại trong danh sách.\n\n` +
            `Bấm OK để gộp sản phẩm vào hóa đơn hiện có.\n` +
            `Bấm Cancel để tạo hóa đơn riêng.`
        );

        if (shouldMerge) {
            // Merge products
            const existingProducts = duplicateForm.querySelector('.invoice-products').value.trim();
            const mergedProducts = existingProducts + '\n' + data.productText;
            duplicateForm.querySelector('.invoice-products').value = mergedProducts;

            // Update preview
            if (typeof updateInvoicePreview === 'function') {
                updateInvoicePreview(duplicateForm);
            }

            // Add image to existing invoice
            const imageArea = duplicateForm.querySelector('.image-upload-area');
            const previewList = imageArea.querySelector('.image-preview-list');
            addImagePreview(previewList, data.imageUrl);

            console.log('[AI-PREVIEW] Merged into existing invoice');
            return;
        }
    }

    // Create new invoice form
    if (typeof renderInvoiceForm === 'function') {
        container.insertAdjacentHTML('beforeend', renderInvoiceForm(null, count));
    } else {
        // Fallback: simple form creation
        console.warn('[AI-PREVIEW] renderInvoiceForm not found, using fallback');
        return;
    }

    const newForm = container.lastElementChild;

    // Populate with AI data
    newForm.querySelector('.invoice-ncc').value = data.sttNCC;
    newForm.querySelector('.invoice-ten-ncc').value = data.tenNCC;
    newForm.querySelector('.invoice-products').value = data.productText;

    // Trigger preview update
    if (typeof updateInvoicePreview === 'function') {
        updateInvoicePreview(newForm);
    }

    // Add image to preview list
    const imageArea = newForm.querySelector('.image-upload-area');
    const previewList = imageArea.querySelector('.image-preview-list');
    addImagePreview(previewList, data.imageUrl);

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }

    console.log('[AI-PREVIEW] Created new invoice form');
}

/**
 * Add image preview to list
 * @param {HTMLElement} previewList - Preview list container
 * @param {string} imageUrl - Image URL
 */
function addImagePreview(previewList, imageUrl) {
    if (!previewList) return;

    const preview = document.createElement('div');
    preview.className = 'image-preview-item';
    preview.innerHTML = `
        <img src="${imageUrl}" alt="Preview">
        <button type="button" class="btn-remove-image" data-url="${imageUrl}">
            <i data-lucide="x"></i>
        </button>
    `;

    previewList.appendChild(preview);

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Helper: Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    return num.toLocaleString('vi-VN');
}

// =====================================================
// EVENT LISTENERS - Setup after DOM loads
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Confirm button
    const btnConfirm = document.getElementById('btnConfirmAIPreview');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', confirmAIPreview);
    }

    // Skip button
    const btnCancel = document.getElementById('btnCancelAIPreview');
    if (btnCancel) {
        btnCancel.addEventListener('click', handleSkipAIPreview);
    }

    // Manual entry button
    const btnManual = document.getElementById('btnEditManually');
    if (btnManual) {
        btnManual.addEventListener('click', handleManualEntry);
    }

    // Close modal button
    const btnClose = document.getElementById('btnCloseAIPreviewModal');
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            const shouldClose = confirm('Bạn có muốn hủy xử lý AI và đóng cửa sổ?');
            if (shouldClose) {
                aiQueueManager.cancel();
                closeModal('modalAIPreview');
            }
        });
    }

    console.log('[AI-PREVIEW] Event listeners attached');
});

console.log('[AI-PREVIEW] Functions exported: openAIPreviewModal, confirmAIPreview, handleSkipAIPreview, handleManualEntry');
