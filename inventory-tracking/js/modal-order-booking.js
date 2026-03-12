// =====================================================
// MODAL ORDER BOOKING - INVENTORY TRACKING
// Modal for add/edit order booking
// =====================================================

let currentOrderBookingData = null;
let pendingOrderBookingImages = [];

/**
 * Open order booking modal
 */
function openOrderBookingModal(booking = null) {
    currentOrderBookingData = booking;
    pendingOrderBookingImages = booking?.anhHoaDon ? [...booking.anhHoaDon] : [];

    const modal = document.getElementById('modalOrderBooking');
    const title = document.getElementById('modalOrderBookingTitle');
    const body = document.getElementById('modalOrderBookingBody');

    if (title) {
        title.textContent = booking ? 'Sửa Đơn Đặt Hàng' : 'Thêm Đơn Đặt Hàng';
    }

    if (body) {
        body.innerHTML = renderOrderBookingForm(booking);
    }

    // Setup form event listeners
    setupOrderBookingFormListeners();

    // Open modal
    if (modal) {
        modal.classList.add('active');
    }

    // Initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render order booking form
 */
function renderOrderBookingForm(booking) {
    const isEdit = !!booking;
    const date = booking?.ngayDatHang || new Date().toISOString().split('T')[0];
    const products = booking?.sanPham || [];
    const productLines = products.map(p => p.rawText || `MA ${p.maSP} ${p.soMau || ''} MAU ${p.soLuong || 0}X${p.giaDonVi || 0}`).join('\n');

    return `
        <div class="form-row">
            <div class="form-group form-group-half">
                <label>Ngày Đặt Hàng</label>
                <input type="date" id="bookingDate" class="form-input" value="${date}">
            </div>
            <div class="form-group form-group-half">
                <label>Số NCC</label>
                <input type="number" id="bookingNCC" class="form-input" value="${booking?.sttNCC || ''}" placeholder="Nhập số NCC">
            </div>
        </div>

        <div class="form-group">
            <label>Tên NCC (tùy chọn)</label>
            <input type="text" id="bookingTenNCC" class="form-input" value="${booking?.tenNCC || ''}" placeholder="VD: Công ty ABC">
            <div class="form-hint">Tên NCC sẽ được gợi ý tự động khi nhập số NCC</div>
        </div>

        <div class="form-section">
            <h4><i data-lucide="package"></i> Sản Phẩm</h4>
            <div class="form-group">
                <label>Nhập sản phẩm (Format: MA [mã] [số màu] MÀU [SL]X[giá] hoặc [SL]*[giá])</label>
                <textarea id="bookingProducts" class="form-textarea" rows="6" placeholder="MA 721 2 MAU 10X54&#10;ma 720 2 mau 10*57">${productLines}</textarea>
            </div>
            <div class="products-preview">
                <div class="preview-label">Xem trước:</div>
                <div class="preview-content" id="bookingProductsPreview"></div>
            </div>
            <div class="products-totals">
                <span>Tổng tiền: <strong id="bookingTotalAmount">${formatNumber(booking?.tongTienHD || 0)}</strong></span>
                <span>Tổng món: <strong id="bookingTotalItems">${formatNumber(booking?.tongMon || 0)}</strong></span>
            </div>
        </div>

        <div class="form-section">
            <h4><i data-lucide="image"></i> Ảnh Hóa Đơn</h4>
            <div class="image-upload-area" id="bookingImageUpload">
                <input type="file" id="bookingImageInput" multiple accept="image/*" style="display: none;">
                <button type="button" class="btn btn-sm btn-outline" id="btnSelectBookingImages">
                    <i data-lucide="upload"></i> Chọn ảnh
                </button>
                <div class="image-preview-list" id="bookingImagePreviewList">
                    ${renderExistingImages()}
                </div>
            </div>
        </div>

        <div class="form-group">
            <label>Ghi Chú</label>
            <input type="text" id="bookingNote" class="form-input" value="${booking?.ghiChu || ''}" placeholder="Ghi chú (tùy chọn)">
        </div>
    `;
}

/**
 * Render existing images
 */
function renderExistingImages() {
    if (!pendingOrderBookingImages || pendingOrderBookingImages.length === 0) {
        return '';
    }

    return pendingOrderBookingImages.map((url, index) => `
        <div class="image-preview-item" data-index="${index}">
            <img src="${url}" alt="Ảnh ${index + 1}">
            <button type="button" class="btn-remove-image" onclick="removeBookingImage(${index})">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');
}

/**
 * Remove booking image from pending list
 */
function removeBookingImage(index) {
    pendingOrderBookingImages.splice(index, 1);
    const previewList = document.getElementById('bookingImagePreviewList');
    if (previewList) {
        previewList.innerHTML = renderExistingImages();
        if (window.lucide) lucide.createIcons();
    }
}

/**
 * Setup form event listeners
 */
function setupOrderBookingFormListeners() {
    // Products textarea - parse and preview
    const productsTextarea = document.getElementById('bookingProducts');
    if (productsTextarea) {
        productsTextarea.addEventListener('input', debounce(updateBookingProductsPreview, 300));
        // Initial parse
        updateBookingProductsPreview();
    }

    // Image upload
    const imageInput = document.getElementById('bookingImageInput');
    const btnSelectImages = document.getElementById('btnSelectBookingImages');

    if (btnSelectImages && imageInput) {
        btnSelectImages.addEventListener('click', () => imageInput.click());
    }

    if (imageInput) {
        imageInput.addEventListener('change', handleBookingImageSelect);
    }

    // Auto-fill tenNCC when sttNCC changes
    const nccInput = document.getElementById('bookingNCC');
    const tenNCCInput = document.getElementById('bookingTenNCC');
    if (nccInput && tenNCCInput) {
        nccInput.addEventListener('change', () => {
            const sttNCC = parseInt(nccInput.value, 10);
            if (sttNCC && typeof getSuggestedTenNCC === 'function') {
                const suggestedName = getSuggestedTenNCC(sttNCC);
                if (suggestedName && !tenNCCInput.value) {
                    tenNCCInput.value = suggestedName;
                }
            }
        });
    }
}

/**
 * Handle image selection
 */
async function handleBookingImageSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const previewList = document.getElementById('bookingImagePreviewList');
    if (!previewList) return;

    // Show loading
    window.notificationManager?.info('Đang tải ảnh...');

    try {
        const uploadedUrls = await uploadBookingImages(files);

        // Add to pending images
        pendingOrderBookingImages.push(...uploadedUrls);

        // Update preview
        previewList.innerHTML = renderExistingImages();
        if (window.lucide) lucide.createIcons();

        window.notificationManager?.success(`Đã tải ${uploadedUrls.length} ảnh`);
    } catch (error) {
        console.error('Error uploading images:', error);
        window.notificationManager?.error('Lỗi khi tải ảnh');
    }

    // Reset input
    event.target.value = '';
}

/**
 * Update products preview
 */
function updateBookingProductsPreview() {
    const textarea = document.getElementById('bookingProducts');
    const preview = document.getElementById('bookingProductsPreview');
    const totalAmount = document.getElementById('bookingTotalAmount');
    const totalItems = document.getElementById('bookingTotalItems');

    if (!textarea || !preview) return;

    const text = textarea.value.trim();
    if (!text) {
        preview.innerHTML = '<span class="text-muted">Chưa có sản phẩm</span>';
        if (totalAmount) totalAmount.textContent = '0';
        if (totalItems) totalItems.textContent = '0';
        return;
    }

    // Parse products using existing parser
    const products = parseProductLines(text);

    if (products.length === 0) {
        preview.innerHTML = '<span class="text-muted">Không parse được sản phẩm</span>';
        return;
    }

    // Calculate totals
    const total = products.reduce((sum, p) => sum + ((p.soLuong || 0) * (p.giaDonVi || 0)), 0);
    const items = products.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    if (totalAmount) totalAmount.textContent = formatNumber(total);
    if (totalItems) totalItems.textContent = formatNumber(items);

    // Render preview
    const isVietnamese = globalState.langMode === 'vi';
    preview.innerHTML = products.map(p => {
        const displayText = isVietnamese && p.rawText ?
            translateToVietnamese(p.rawText) : p.rawText;
        return `<div class="preview-item">${displayText}</div>`;
    }).join('');
}

/**
 * Parse product lines (simple parser)
 */
function parseProductLines(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const products = [];

    lines.forEach(line => {
        const parsed = parseProductLine(line);
        if (parsed) {
            products.push(parsed);
        }
    });

    return products;
}

/**
 * Parse single product line
 */
function parseProductLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Try to parse format: MA [mã] [màu] MAU [SL]X[giá] or [SL]*[giá]
    // Also support: MA [mã] [tên/màu] SL X/x/* [số]
    const maMatch = trimmed.match(/^MA\s*(\S+)\s*/i);

    if (maMatch) {
        const maSP = maMatch[1];
        const rest = trimmed.substring(maMatch[0].length);

        // Find SL pattern: [number]X[number] or [number]*[number]
        const slMatch = rest.match(/(\d+)\s*[xX*]\s*(\d+)/);

        if (slMatch) {
            const soLuong = parseInt(slMatch[1], 10);
            const giaDonVi = parseInt(slMatch[2], 10);

            // Everything between MA xxx and SLxGia is color/description
            const colorPart = rest.substring(0, rest.indexOf(slMatch[0])).trim();
            // Remove "MAU" or "mau" keyword if present
            const soMau = colorPart.replace(/^MAU\s*/i, '').replace(/\s*MAU$/i, '').trim();

            return {
                maSP,
                soMau,
                soLuong,
                giaDonVi,
                rawText: trimmed
            };
        }
    }

    // Fallback: just store as raw text
    return {
        maSP: '',
        soMau: '',
        soLuong: 0,
        giaDonVi: 0,
        rawText: trimmed
    };
}

/**
 * Save order booking
 */
async function saveOrderBooking() {
    const dateInput = document.getElementById('bookingDate');
    const nccInput = document.getElementById('bookingNCC');
    const tenNCCInput = document.getElementById('bookingTenNCC');
    const productsInput = document.getElementById('bookingProducts');
    const noteInput = document.getElementById('bookingNote');

    // Validate
    if (!dateInput?.value) {
        window.notificationManager?.error('Vui lòng nhập ngày đặt hàng');
        return;
    }

    if (!nccInput?.value) {
        window.notificationManager?.error('Vui lòng nhập số NCC');
        return;
    }

    // Parse products
    const products = parseProductLines(productsInput?.value || '');
    const tongTienHD = products.reduce((sum, p) => sum + ((p.soLuong || 0) * (p.giaDonVi || 0)), 0);
    const tongMon = products.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    const bookingData = {
        ngayDatHang: dateInput.value,
        sttNCC: parseInt(nccInput.value, 10),
        tenNCC: tenNCCInput?.value?.trim() || '',
        sanPham: products,
        tongTienHD,
        tongMon,
        anhHoaDon: pendingOrderBookingImages,
        ghiChu: noteInput?.value || ''
    };

    try {
        if (currentOrderBookingData) {
            // Update existing
            await updateOrderBooking(currentOrderBookingData.id, bookingData);
            window.notificationManager?.success('Đã cập nhật đơn đặt hàng');
        } else {
            // Create new
            await createOrderBooking(bookingData);
            window.notificationManager?.success('Đã thêm đơn đặt hàng');
        }

        // Close modal
        closeOrderBookingModal();

        // Re-render
        renderOrderBookings(globalState.filteredOrderBookings || globalState.orderBookings);
    } catch (error) {
        console.error('Error saving order booking:', error);
        window.notificationManager?.error('Lỗi khi lưu đơn đặt hàng');
    }
}

/**
 * Close order booking modal
 */
function closeOrderBookingModal() {
    const modal = document.getElementById('modalOrderBooking');
    if (modal) {
        modal.classList.remove('active');
    }
    currentOrderBookingData = null;
    pendingOrderBookingImages = [];
}

/**
 * Simple debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Add order booking button
    const btnAdd = document.getElementById('btnAddOrderBooking');
    if (btnAdd) {
        btnAdd.addEventListener('click', () => openOrderBookingModal(null));
    }

    // Save button
    const btnSave = document.getElementById('btnSaveOrderBooking');
    if (btnSave) {
        btnSave.addEventListener('click', saveOrderBooking);
    }

    // Cancel/Close buttons
    const btnCancel = document.getElementById('btnCancelOrderBooking');
    const btnClose = document.getElementById('btnCloseOrderBookingModal');

    if (btnCancel) {
        btnCancel.addEventListener('click', closeOrderBookingModal);
    }
    if (btnClose) {
        btnClose.addEventListener('click', closeOrderBookingModal);
    }

    // Close on overlay click
    const modal = document.getElementById('modalOrderBooking');
    const overlay = modal?.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeOrderBookingModal);
    }
});

// Export for global access
window.openOrderBookingModal = openOrderBookingModal;

console.log('[MODAL-ORDER-BOOKING] Loaded successfully');
