// =====================================================
// MODAL SHIPMENT - INVENTORY TRACKING
// Phase 3: Modal for add/edit shipment
// =====================================================

let currentShipmentData = null;

/**
 * Open shipment modal
 */
function openShipmentModal(shipment = null) {
    currentShipmentData = shipment;

    const modal = document.getElementById('modalShipment');
    const title = document.getElementById('modalShipmentTitle');
    const body = document.getElementById('modalShipmentBody');

    if (title) {
        title.textContent = shipment ? 'Sửa Đợt Hàng' : 'Thêm Đợt Hàng Mới';
    }

    if (body) {
        body.innerHTML = renderShipmentForm(shipment);
    }

    // Setup form event listeners
    setupShipmentFormListeners();

    openModal('modalShipment');

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render shipment form
 */
function renderShipmentForm(shipment) {
    const isEdit = !!shipment;
    const date = shipment?.ngayDiHang || new Date().toISOString().split('T')[0];
    const packages = shipment?.kienHang || [];
    const invoices = shipment?.hoaDon || [];
    const costs = shipment?.chiPhiHangVe || [];

    // Convert packages array to string (e.g., "10 20 50 88")
    const packagesString = packages.map(p => p.soKg).filter(kg => kg > 0).join(' ');

    const canEditCost = permissionHelper?.can('edit_chiPhiHangVe');
    const canEditNote = permissionHelper?.can('edit_ghiChuAdmin');

    return `
        <div class="form-group">
            <label>Ngày Đi Hàng</label>
            <input type="date" id="shipmentDate" class="form-input" value="${date}">
        </div>

        <div class="form-section">
            <h4><i data-lucide="box"></i> Kiện Hàng</h4>
            <div class="form-group">
                <label>Nhập số kg các kiện (cách nhau bởi dấu cách hoặc dấu phẩy)</label>
                <input type="text" id="packagesInput" class="form-input" value="${packagesString}" placeholder="VD: 10 20 50 88 hoặc 10, 20, 50, 88">
                <div class="packages-hint">Ví dụ: "10 20 50 88" = 4 kiện (10kg, 20kg, 50kg, 88kg)</div>
            </div>
            <div class="packages-total">Tổng: <span id="totalPackages">0</span> kiện, <span id="totalKg">0</span> kg</div>
        </div>

        <div class="form-section">
            <h4><i data-lucide="receipt"></i> Hóa Đơn Nhà Cung Cấp</h4>
            <div id="invoicesContainer">
                ${invoices.length > 0 ? invoices.map((inv, i) => renderInvoiceForm(inv, i)).join('') : renderInvoiceForm(null, 0)}
            </div>
            <div class="invoice-buttons">
                <button type="button" class="btn btn-sm btn-outline" id="btnAddInvoice">
                    <i data-lucide="plus"></i> Thêm hóa đơn NCC mới
                </button>
                <button type="button" class="btn btn-sm btn-primary" id="btnAddInvoiceAI">
                    <i data-lucide="sparkles"></i> Tạo hóa đơn từ ảnh bằng AI
                </button>
            </div>
        </div>

        ${canEditCost ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Chi Phí Hàng Về (Admin)</h4>
                <div id="costsContainer">
                    ${costs.length > 0 ? costs.map((c, i) => `
                        <div class="cost-row" data-index="${i}">
                            <input type="text" class="form-input cost-type" value="${c.loai || ''}" placeholder="Loại chi phí">
                            <input type="number" class="form-input cost-amount" value="${c.soTien || ''}" placeholder="Số tiền">
                            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    `).join('') : ''}
                </div>
                <button type="button" class="btn btn-sm btn-outline" id="btnAddCost">
                    <i data-lucide="plus"></i> Thêm chi phí
                </button>
                <div class="cost-total">Tổng chi phí: <span id="totalCost">0</span></div>
            </div>
        ` : ''}

        ${canEditNote ? `
            <div class="form-section admin-section">
                <h4><i data-lucide="lock"></i> Ghi Chú Admin</h4>
                <textarea id="adminNote" class="form-textarea" placeholder="Ghi chú...">${shipment?.ghiChuAdmin || ''}</textarea>
            </div>
        ` : ''}
    `;
}

/**
 * Render invoice form
 */
function renderInvoiceForm(invoice, index) {
    const products = invoice?.sanPham || [];
    const productLines = products.map(p => p.rawText || `MA ${p.maSP} ${p.soMau} MAU ${p.soLuong}X${p.giaDonVi}`).join('\n');

    return `
        <div class="invoice-form" data-index="${index}">
            <div class="invoice-header">
                <label>NCC #</label>
                <input type="number" class="form-input invoice-ncc" value="${invoice?.sttNCC || ''}" placeholder="STT" style="width: 70px;">
                <input type="text" class="form-input invoice-ten-ncc" value="${invoice?.tenNCC || ''}" placeholder="Tên NCC (tùy chọn)" style="flex: 1; margin-left: 8px;">
                <button type="button" class="btn btn-sm btn-outline btn-remove-invoice" title="Xóa hóa đơn">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div class="form-group">
                <label>Sản phẩm (Format: MA [mã] [số màu] MÀU [SL]X[giá] hoặc [SL]*[giá])</label>
                <textarea class="form-textarea invoice-products" rows="4" placeholder="MA 721 2 MAU 10X54&#10;ma 720 2 mau 10*57">${productLines}</textarea>
            </div>
            <div class="invoice-preview">
                <div class="preview-label">Xem trước:</div>
                <div class="preview-content"></div>
            </div>
            <div class="invoice-totals">
                <span>Tổng tiền: <strong class="invoice-total-amount">0</strong></span>
                <span>Tổng món: <strong class="invoice-total-items">0</strong></span>
            </div>
            <div class="form-group">
                <label>Ảnh hóa đơn</label>
                <div class="image-upload-area" data-invoice="${index}">
                    <input type="file" class="image-input" multiple accept="image/*" style="display: none;">
                    <button type="button" class="btn btn-sm btn-outline btn-upload">
                        <i data-lucide="upload"></i> Chọn file
                    </button>
                    <div class="image-preview-list"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup form event listeners
 */
function setupShipmentFormListeners() {
    // Add invoice
    document.getElementById('btnAddInvoice')?.addEventListener('click', addInvoiceForm);

    // Add invoice with AI
    document.getElementById('btnAddInvoiceAI')?.addEventListener('click', openAIImageUploader);

    // Add cost
    document.getElementById('btnAddCost')?.addEventListener('click', addCostRow);

    // Packages input listener
    document.getElementById('packagesInput')?.addEventListener('input', updatePackageTotals);

    // Remove buttons delegation
    document.getElementById('modalShipmentBody')?.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-invoice')) {
            e.target.closest('.invoice-form')?.remove();
        }
        if (e.target.closest('.btn-remove-cost')) {
            e.target.closest('.cost-row')?.remove();
            updateCostTotal();
        }
        if (e.target.closest('.btn-upload')) {
            e.target.closest('.image-upload-area')?.querySelector('.image-input')?.click();
        }
    });

    // Input delegation
    document.getElementById('modalShipmentBody')?.addEventListener('input', (e) => {
        if (e.target.classList.contains('invoice-products')) {
            updateInvoicePreview(e.target.closest('.invoice-form'));
        }
        if (e.target.classList.contains('cost-amount')) {
            updateCostTotal();
        }
    });

    // Auto-fill tenNCC when sttNCC changes
    document.getElementById('modalShipmentBody')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('invoice-ncc')) {
            const form = e.target.closest('.invoice-form');
            const tenNCCInput = form?.querySelector('.invoice-ten-ncc');
            const sttNCC = parseInt(e.target.value, 10);
            if (sttNCC && tenNCCInput && !tenNCCInput.value && typeof getSuggestedTenNCC === 'function') {
                const suggestedName = getSuggestedTenNCC(sttNCC);
                if (suggestedName) {
                    tenNCCInput.value = suggestedName;
                }
            }
        }
    });

    // Save button
    document.getElementById('btnSaveShipment')?.addEventListener('click', saveShipment);

    // Initial calculations
    updatePackageTotals();
    updateCostTotal();
}

function addInvoiceForm() {
    const container = document.getElementById('invoicesContainer');
    const count = container.querySelectorAll('.invoice-form').length;
    container.insertAdjacentHTML('beforeend', renderInvoiceForm(null, count));
    if (window.lucide) lucide.createIcons();
}

function addCostRow() {
    const container = document.getElementById('costsContainer');
    const count = container.querySelectorAll('.cost-row').length;
    const html = `
        <div class="cost-row" data-index="${count}">
            <input type="text" class="form-input cost-type" placeholder="Loại chi phí">
            <input type="number" class="form-input cost-amount" placeholder="Số tiền">
            <button type="button" class="btn btn-sm btn-outline btn-remove-cost">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
}

/**
 * Parse packages from input string
 * Accepts: "10 20 50 88" or "10, 20, 50, 88" or "10,20,50,88"
 */
function parsePackagesInput(inputString) {
    if (!inputString || !inputString.trim()) return [];

    // Replace commas with spaces, then split by whitespace
    const normalized = inputString.replace(/,/g, ' ').trim();
    const parts = normalized.split(/\s+/).filter(p => p.length > 0);

    const packages = [];
    parts.forEach((part, index) => {
        const kg = parseFloat(part);
        if (!isNaN(kg) && kg > 0) {
            packages.push({
                stt: index + 1,
                soKg: kg
            });
        }
    });

    return packages;
}

function updatePackageTotals() {
    const input = document.getElementById('packagesInput');
    const packages = parsePackagesInput(input?.value || '');

    const totalKg = packages.reduce((sum, p) => sum + p.soKg, 0);

    const totalPackagesEl = document.getElementById('totalPackages');
    const totalKgEl = document.getElementById('totalKg');

    if (totalPackagesEl) totalPackagesEl.textContent = packages.length;
    if (totalKgEl) totalKgEl.textContent = formatNumber(totalKg);
}

function updateCostTotal() {
    const costs = document.querySelectorAll('.cost-row');
    let total = 0;
    costs.forEach(row => {
        const amount = parseFloat(row.querySelector('.cost-amount')?.value) || 0;
        total += amount;
    });
    const totalEl = document.getElementById('totalCost');
    if (totalEl) totalEl.textContent = formatNumber(total);
}

function updateInvoicePreview(invoiceForm) {
    if (!invoiceForm) return;

    const textarea = invoiceForm.querySelector('.invoice-products');
    const previewContent = invoiceForm.querySelector('.preview-content');
    const totalAmount = invoiceForm.querySelector('.invoice-total-amount');
    const totalItems = invoiceForm.querySelector('.invoice-total-items');

    if (!textarea || !previewContent) return;

    const text = textarea.value.trim();
    if (!text) {
        previewContent.innerHTML = '<span class="preview-empty">Nhập sản phẩm để xem trước</span>';
        if (totalAmount) totalAmount.textContent = '0';
        if (totalItems) totalItems.textContent = '0';
        return;
    }

    // Parse products
    const products = parseMultipleProducts(text);
    const validProducts = products.filter(p => p.isValid);
    const invalidProducts = products.filter(p => !p.isValid);

    // Calculate totals
    const totals = calculateProductTotals(validProducts);

    // Render preview table
    if (validProducts.length > 0) {
        previewContent.innerHTML = `
            <table class="preview-table">
                <thead>
                    <tr>
                        <th>Mã SP</th>
                        <th>Màu</th>
                        <th>SL</th>
                        <th>Giá</th>
                        <th>Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${validProducts.map(p => `
                        <tr>
                            <td>${p.maSP}</td>
                            <td>${p.soMau}</td>
                            <td>${p.soLuong}</td>
                            <td>${formatNumber(p.giaDonVi)}</td>
                            <td>${formatNumber(p.thanhTien)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${invalidProducts.length > 0 ? `
                <div class="preview-errors">
                    <strong>Lỗi parse:</strong>
                    ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
                </div>
            ` : ''}
        `;
    } else {
        previewContent.innerHTML = `
            <div class="preview-errors">
                <strong>Không parse được sản phẩm nào</strong>
                ${invalidProducts.map(p => `<div class="error-line">${p.rawText}: ${p.error}</div>`).join('')}
            </div>
        `;
    }

    // Update totals
    if (totalAmount) totalAmount.textContent = formatNumber(totals.tongTienHD);
    if (totalItems) totalItems.textContent = formatNumber(totals.tongMon);
}

async function saveShipment() {
    try {
        // Validate date
        const dateInput = document.getElementById('shipmentDate');
        const ngayDiHang = dateInput?.value;
        if (!ngayDiHang) {
            toast.warning('Vui lòng chọn ngày đi hàng');
            return;
        }

        // Collect packages from single input
        const packagesInput = document.getElementById('packagesInput');
        const kienHang = parsePackagesInput(packagesInput?.value || '');

        // Collect invoices
        const invoiceForms = document.querySelectorAll('.invoice-form');
        const hoaDon = [];
        let invoiceIndex = 0;

        for (const form of invoiceForms) {
            const sttNCC = parseInt(form.querySelector('.invoice-ncc')?.value);
            const tenNCC = form.querySelector('.invoice-ten-ncc')?.value?.trim() || '';
            const productText = form.querySelector('.invoice-products')?.value?.trim();

            if (!sttNCC) continue;

            // Parse products
            const products = productText ? parseMultipleProducts(productText) : [];
            const validProducts = products.filter(p => p.isValid);

            // Calculate totals
            const totals = calculateProductTotals(validProducts);

            // Get existing invoice data if editing
            const existingInvoice = currentShipmentData?.hoaDon?.[invoiceIndex];

            hoaDon.push({
                id: existingInvoice?.id || generateId('hd'),
                sttNCC: sttNCC,
                tenNCC: tenNCC,
                sanPham: validProducts,
                tongTienHD: totals.tongTienHD,
                tongMon: totals.tongMon,
                soMonThieu: existingInvoice?.soMonThieu || 0,
                ghiChuThieu: existingInvoice?.ghiChuThieu || '',
                anhHoaDon: existingInvoice?.anhHoaDon || []
            });

            invoiceIndex++;
        }

        // Validate at least one invoice
        if (hoaDon.length === 0) {
            toast.warning('Vui lòng nhập ít nhất 1 hóa đơn NCC');
            return;
        }

        // Collect shipping costs (admin only)
        const costRows = document.querySelectorAll('.cost-row');
        const chiPhiHangVe = [];
        costRows.forEach((row, index) => {
            const loai = row.querySelector('.cost-type')?.value?.trim();
            const soTien = parseFloat(row.querySelector('.cost-amount')?.value) || 0;
            if (loai && soTien > 0) {
                chiPhiHangVe.push({
                    id: generateId('cp'),
                    loai: loai,
                    soTien: soTien
                });
            }
        });

        // Admin note
        const ghiChuAdmin = document.getElementById('adminNote')?.value?.trim() || '';

        // Calculate totals
        const tongKien = kienHang.length;
        const tongKg = kienHang.reduce((sum, k) => sum + k.soKg, 0);
        const tongTienHoaDon = hoaDon.reduce((sum, hd) => sum + hd.tongTienHD, 0);
        const tongSoMon = hoaDon.reduce((sum, hd) => sum + hd.tongMon, 0);
        const tongMonThieu = hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
        const tongChiPhi = chiPhiHangVe.reduce((sum, c) => sum + c.soTien, 0);

        // Prepare data
        const shipmentData = {
            ngayDiHang,
            kienHang,
            tongKien,
            tongKg,
            hoaDon,
            tongTienHoaDon,
            tongSoMon,
            tongMonThieu,
            chiPhiHangVe,
            tongChiPhi,
            ghiChuAdmin
        };

        // Show loading
        const loadingToast = toast.loading('Đang lưu...');

        if (currentShipmentData) {
            // Update existing
            await updateShipment(currentShipmentData.id, shipmentData);
        } else {
            // Create new
            await createShipment(shipmentData);
        }

        toast.remove(loadingToast);
        closeModal('modalShipment');

        // Reload data
        await loadShipmentsData();

    } catch (error) {
        console.error('[MODAL] Error saving shipment:', error);
        toast.error('Không thể lưu đợt hàng');
    }
}

// =====================================================
// AI IMAGE UPLOAD FUNCTIONS
// =====================================================

/**
 * Open file picker for AI image upload
 */
function openAIImageUploader() {
    console.log('[MODAL] Opening AI image uploader');

    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';

    input.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleAIImageUpload(files);
        }
    });

    input.click();
}

/**
 * Handle AI image upload
 * @param {FileList} files - Selected image files
 */
async function handleAIImageUpload(files) {
    console.log(`[MODAL] Handling ${files.length} images for AI processing`);

    // Validate files
    for (const file of files) {
        if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
            toast.error(`File ${file.name} không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG, GIF, WebP.`);
            return;
        }
        if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
            toast.error(`File ${file.name} quá lớn. Kích thước tối đa 5MB.`);
            return;
        }
    }

    toast.info(`Đang xử lý ${files.length} ảnh bằng AI...`);

    // Setup queue callbacks
    aiQueueManager.onProgress = (current, total, status) => {
        console.log(`[AI] Processing image ${current}/${total} - ${status}`);
    };

    aiQueueManager.onComplete = (index, result) => {
        console.log(`[AI] Image ${index} processed:`, result.success ? 'SUCCESS' : 'FAILED');

        // Show first preview immediately
        if (index === 1) {
            openAIPreviewModal(result, index, files.length);
        }
    };

    aiQueueManager.onAllComplete = (results) => {
        console.log('[AI] All images processed:', results.size);
    };

    // Start processing
    await aiQueueManager.addBatch(files);
}

/**
 * Add AI invoice to form (NEW: handles productsData structure)
 * @param {Object} data - AI extracted data
 * @param {number} data.sttNCC - NCC number
 * @param {string} data.tenNCC - NCC name
 * @param {Array} data.productsData - Structured product array with mauSac
 * @param {string} data.imageUrl - Uploaded image URL
 * @param {string} data.notes - Notes
 */
async function addAIInvoiceToForm(data) {
    console.log('[MODAL] Adding AI invoice to form with productsData:', data);

    // Add new invoice form
    addInvoiceForm();

    // Wait for DOM update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the last (newest) invoice form
    const forms = document.querySelectorAll('.invoice-form');
    const lastForm = forms[forms.length - 1];

    if (!lastForm) {
        console.error('[MODAL] Could not find invoice form');
        return;
    }

    // Populate NCC fields
    const nccInput = lastForm.querySelector('.invoice-ncc');
    const nccNameInput = lastForm.querySelector('.invoice-ncc-name');

    if (nccInput) nccInput.value = data.sttNCC || '';
    if (nccNameInput) nccNameInput.value = data.tenNCC || '';

    // NEW: Convert productsData to textarea format for compatibility
    // The existing preview system still uses text parsing
    const productText = (data.productsData || [])
        .map(p => p.rawText || `MA ${p.maSP} ${p.soMau} MÀU ${p.tongSoLuong || p.soLuong}X${p.giaDonVi}`)
        .join('\n');

    const productsTextarea = lastForm.querySelector('.invoice-products');
    if (productsTextarea) {
        productsTextarea.value = productText;
        // Trigger preview update
        updateInvoicePreview(lastForm);
    }

    // Store the full structured data in a custom property for later use
    lastForm._aiProductsData = data.productsData;

    // Add invoice image
    if (data.imageUrl) {
        const imageContainer = lastForm.querySelector('.invoice-images-container');
        if (imageContainer) {
            const imageCard = document.createElement('div');
            imageCard.className = 'image-preview-item';
            imageCard.innerHTML = `
                <img src="${data.imageUrl}" alt="Invoice">
                <button type="button" class="btn-remove-image" onclick="removeInvoiceImage(this, '${data.imageUrl}')">
                    <i data-lucide="x"></i>
                </button>
            `;
            imageContainer.appendChild(imageCard);

            if (window.lucide) {
                lucide.createIcons();
            }
        }

        // Store image URL in hidden field
        const imagesInput = lastForm.querySelector('.invoice-images-data');
        if (imagesInput) {
            const existingImages = JSON.parse(imagesInput.value || '[]');
            existingImages.push(data.imageUrl);
            imagesInput.value = JSON.stringify(existingImages);
        }
    }

    console.log('[MODAL] AI invoice added successfully');
}

console.log('[MODAL] Shipment modal initialized with AI support');
