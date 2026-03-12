// =====================================================
// MODAL COMPARE - ORDER BOOKING VS SHIPMENT
// Compare ordered products with received products
// =====================================================

/**
 * Show comparison modal
 */
function showCompareModal(booking, invoice, shipment) {
    const modal = document.getElementById('modalCompare');
    const title = document.getElementById('modalCompareTitle');
    const body = document.getElementById('modalCompareBody');

    if (!modal || !body) return;

    if (title) {
        title.textContent = `So Sánh Đặt Hàng vs Thực Nhận - NCC ${booking.sttNCC}`;
    }

    body.innerHTML = renderCompareContent(booking, invoice, shipment);

    modal.classList.add('active');

    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render comparison content
 */
function renderCompareContent(booking, invoice, shipment) {
    const bookingProducts = booking.sanPham || [];
    const invoiceProducts = invoice.sanPham || [];

    // Build comparison data
    const comparison = buildProductComparison(bookingProducts, invoiceProducts);

    // Summary stats
    const bookingTotal = booking.tongTienHD || 0;
    const invoiceTotal = invoice.tongTienHD || invoice.tongTien || 0;
    const bookingMon = booking.tongMon || 0;
    const invoiceMon = invoice.tongMon || 0;

    const totalDiff = invoiceTotal - bookingTotal;
    const monDiff = invoiceMon - bookingMon;

    return `
        <div class="compare-header">
            <div class="compare-info">
                <div class="compare-info-item">
                    <i data-lucide="calendar"></i>
                    <span><strong>Ngày đặt:</strong> ${formatDateDisplay(booking.ngayDatHang)}</span>
                </div>
                <div class="compare-info-item">
                    <i data-lucide="truck"></i>
                    <span><strong>Ngày nhận:</strong> ${formatDateDisplay(shipment.ngayDiHang)}</span>
                </div>
            </div>
        </div>

        <div class="compare-summary">
            <div class="compare-summary-row">
                <div class="compare-summary-item">
                    <span class="label">Tổng tiền đặt:</span>
                    <span class="value">${formatNumber(bookingTotal)}</span>
                </div>
                <div class="compare-summary-item">
                    <span class="label">Tổng tiền nhận:</span>
                    <span class="value">${formatNumber(invoiceTotal)}</span>
                </div>
                <div class="compare-summary-item ${totalDiff !== 0 ? 'has-diff' : ''}">
                    <span class="label">Chênh lệch:</span>
                    <span class="value ${totalDiff > 0 ? 'positive' : totalDiff < 0 ? 'negative' : ''}">
                        ${totalDiff > 0 ? '+' : ''}${formatNumber(totalDiff)}
                    </span>
                </div>
            </div>
            <div class="compare-summary-row">
                <div class="compare-summary-item">
                    <span class="label">Tổng món đặt:</span>
                    <span class="value">${formatNumber(bookingMon)}</span>
                </div>
                <div class="compare-summary-item">
                    <span class="label">Tổng món nhận:</span>
                    <span class="value">${formatNumber(invoiceMon)}</span>
                </div>
                <div class="compare-summary-item ${monDiff !== 0 ? 'has-diff' : ''}">
                    <span class="label">Chênh lệch:</span>
                    <span class="value ${monDiff > 0 ? 'positive' : monDiff < 0 ? 'negative' : ''}">
                        ${monDiff > 0 ? '+' : ''}${formatNumber(monDiff)} món
                    </span>
                </div>
            </div>
        </div>

        <div class="compare-table-container">
            <table class="compare-table">
                <thead>
                    <tr>
                        <th>Mã SP</th>
                        <th>Đặt hàng</th>
                        <th>Thực nhận</th>
                        <th>Chênh lệch</th>
                    </tr>
                </thead>
                <tbody>
                    ${renderCompareRows(comparison)}
                </tbody>
            </table>
        </div>

        ${comparison.some(c => c.hasDiff) ? `
            <div class="compare-legend">
                <span class="legend-item diff-qty"><i data-lucide="alert-circle"></i> Khác số lượng</span>
                <span class="legend-item diff-price"><i data-lucide="dollar-sign"></i> Khác giá</span>
                <span class="legend-item diff-missing"><i data-lucide="x-circle"></i> Thiếu/Thừa</span>
            </div>
        ` : `
            <div class="compare-match">
                <i data-lucide="check-circle"></i>
                <span>Đơn hàng khớp hoàn toàn!</span>
            </div>
        `}
    `;
}

/**
 * Build product comparison data
 */
function buildProductComparison(bookingProducts, invoiceProducts) {
    const comparison = [];
    const matchedInvoice = new Set();

    // Process booking products
    bookingProducts.forEach(bp => {
        const maSP = normalizeMaSP(bp.maSP);

        // Find matching invoice product
        const matchIdx = invoiceProducts.findIndex((ip, idx) => {
            if (matchedInvoice.has(idx)) return false;
            return normalizeMaSP(ip.maSP) === maSP;
        });

        if (matchIdx !== -1) {
            const ip = invoiceProducts[matchIdx];
            matchedInvoice.add(matchIdx);

            const qtyDiff = (ip.soLuong || 0) - (bp.soLuong || 0);
            const priceDiff = (ip.giaDonVi || 0) - (bp.giaDonVi || 0);
            const hasDiff = qtyDiff !== 0 || priceDiff !== 0;

            comparison.push({
                maSP: bp.maSP,
                booking: bp,
                invoice: ip,
                qtyDiff,
                priceDiff,
                hasDiff,
                status: hasDiff ? 'diff' : 'match'
            });
        } else {
            // Not received
            comparison.push({
                maSP: bp.maSP,
                booking: bp,
                invoice: null,
                qtyDiff: -(bp.soLuong || 0),
                priceDiff: 0,
                hasDiff: true,
                status: 'missing'
            });
        }
    });

    // Check for extra items in invoice
    invoiceProducts.forEach((ip, idx) => {
        if (!matchedInvoice.has(idx)) {
            comparison.push({
                maSP: ip.maSP,
                booking: null,
                invoice: ip,
                qtyDiff: ip.soLuong || 0,
                priceDiff: 0,
                hasDiff: true,
                status: 'extra'
            });
        }
    });

    return comparison;
}

/**
 * Normalize product code for comparison
 */
function normalizeMaSP(maSP) {
    if (!maSP) return '';
    return String(maSP).toLowerCase().trim();
}

/**
 * Render comparison table rows
 */
function renderCompareRows(comparison) {
    if (comparison.length === 0) {
        return '<tr><td colspan="4" class="text-center text-muted">Không có sản phẩm để so sánh</td></tr>';
    }

    return comparison.map(c => {
        const rowClass = c.hasDiff ? `compare-row-${c.status}` : '';
        const isVietnamese = globalState.langMode === 'vi';

        // Booking column
        let bookingText = '-';
        if (c.booking) {
            const rawText = isVietnamese ?
                (c.booking.rawText_vi || translateToVietnamese(c.booking.rawText || '')) :
                c.booking.rawText;
            bookingText = `
                <div class="compare-product-detail">
                    <div class="product-text">${rawText || c.booking.maSP}</div>
                    <div class="product-meta">
                        SL: ${c.booking.soLuong || 0} × ${formatNumber(c.booking.giaDonVi || 0)}
                    </div>
                </div>
            `;
        }

        // Invoice column
        let invoiceText = '-';
        if (c.invoice) {
            const rawText = isVietnamese ?
                (c.invoice.rawText_vi || translateToVietnamese(c.invoice.rawText || '')) :
                c.invoice.rawText;
            invoiceText = `
                <div class="compare-product-detail">
                    <div class="product-text">${rawText || c.invoice.maSP}</div>
                    <div class="product-meta">
                        SL: ${c.invoice.soLuong || 0} × ${formatNumber(c.invoice.giaDonVi || 0)}
                    </div>
                </div>
            `;
        }

        // Difference column
        let diffText = '';
        if (c.status === 'match') {
            diffText = '<span class="diff-match"><i data-lucide="check"></i> Khớp</span>';
        } else if (c.status === 'missing') {
            diffText = '<span class="diff-missing"><i data-lucide="x"></i> Không giao</span>';
        } else if (c.status === 'extra') {
            diffText = '<span class="diff-extra"><i data-lucide="plus"></i> Thêm</span>';
        } else {
            const parts = [];
            if (c.qtyDiff !== 0) {
                parts.push(`<span class="diff-qty">${c.qtyDiff > 0 ? '+' : ''}${c.qtyDiff} món</span>`);
            }
            if (c.priceDiff !== 0) {
                parts.push(`<span class="diff-price">${c.priceDiff > 0 ? '+' : ''}${formatNumber(c.priceDiff)}đ/món</span>`);
            }
            diffText = parts.join('<br>');
        }

        return `
            <tr class="${rowClass}">
                <td class="col-masp"><strong>${c.maSP || '-'}</strong></td>
                <td class="col-booking">${bookingText}</td>
                <td class="col-invoice">${invoiceText}</td>
                <td class="col-diff">${diffText}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Close compare modal
 */
function closeCompareModal() {
    const modal = document.getElementById('modalCompare');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Initialize modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    const btnClose = document.getElementById('btnCloseCompareModal');
    const btnCloseFooter = document.getElementById('btnCloseCompare');
    const modal = document.getElementById('modalCompare');

    if (btnClose) {
        btnClose.addEventListener('click', closeCompareModal);
    }
    if (btnCloseFooter) {
        btnCloseFooter.addEventListener('click', closeCompareModal);
    }

    // Close on overlay click
    const overlay = modal?.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeCompareModal);
    }
});

// Export for global access
window.showCompareModal = showCompareModal;

console.log('[MODAL-COMPARE] Loaded successfully');
