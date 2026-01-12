// =====================================================
// MODAL DETAIL INVOICE - INVENTORY TRACKING
// Phase 4: Modal for viewing invoice details by date
// =====================================================

/**
 * Open invoice detail modal for a specific date
 * Shows all invoices from shipments on that date
 */
function openInvoiceDetailModal(ngay) {
    const modal = document.getElementById('modalInvoiceDetail');
    const title = document.getElementById('modalInvoiceDetailTitle');
    const body = document.getElementById('modalInvoiceDetailBody');

    if (title) {
        title.textContent = `Chi Tiết Hóa Đơn - ${formatDateDisplay(ngay)}`;
    }

    // Get all shipments for this date
    const shipments = globalState.shipments.filter(s => s.ngayDiHang === ngay);

    if (body) {
        body.innerHTML = renderInvoiceDetailTable(shipments, ngay);
    }

    openModal('modalInvoiceDetail');

    if (window.lucide) lucide.createIcons();
}

/**
 * Render invoice detail table
 */
function renderInvoiceDetailTable(shipments, ngay) {
    const allInvoices = [];

    shipments.forEach(shipment => {
        (shipment.hoaDon || []).forEach(hd => {
            allInvoices.push({
                ...hd,
                shipmentId: shipment.id
            });
        });
    });

    if (allInvoices.length === 0) {
        return '<p class="text-center">Không có hóa đơn nào</p>';
    }

    const totalAmount = allInvoices.reduce((sum, hd) => sum + (hd.tongTienHD || 0), 0);
    const totalItems = allInvoices.reduce((sum, hd) => sum + (hd.tongMon || 0), 0);

    return `
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>STT NCC</th>
                    <th>Sản phẩm</th>
                    <th class="text-right">Tiền HĐ</th>
                    <th class="text-center">Tổng món</th>
                    <th class="text-center">Thiếu</th>
                    <th>Ghi chú</th>
                    ${permissionHelper?.can('edit_invoice_from_finance') ? '<th class="text-center">Sửa</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${allInvoices.map(hd => `
                    <tr>
                        <td><strong>${hd.sttNCC}</strong></td>
                        <td>
                            <div class="product-list-preview">
                                ${(hd.sanPham || []).slice(0, 2).map(p =>
                                    `<span class="product-code">${p.maSP || p.rawText?.split(' ')[1] || ''}</span>`
                                ).join('')}
                                ${(hd.sanPham || []).length > 2 ? `<span class="more">+${hd.sanPham.length - 2}</span>` : ''}
                            </div>
                        </td>
                        <td class="text-right">${formatCurrency(hd.tongTienHD || 0)}</td>
                        <td class="text-center">${hd.tongMon || 0}</td>
                        <td class="text-center ${hd.soMonThieu ? 'text-danger' : ''}">${hd.soMonThieu || 0}</td>
                        <td>${hd.ghiChu || ''}</td>
                        ${permissionHelper?.can('edit_invoice_from_finance') ? `
                            <td class="text-center">
                                <button class="btn-icon" onclick="editInvoiceFromDetail('${hd.shipmentId}', '${hd.id}')">
                                    <i data-lucide="pencil"></i>
                                </button>
                            </td>
                        ` : ''}
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="2"><strong>Tổng cộng</strong></td>
                    <td class="text-right"><strong>${formatCurrency(totalAmount)}</strong></td>
                    <td class="text-center"><strong>${totalItems}</strong></td>
                    <td colspan="${permissionHelper?.can('edit_invoice_from_finance') ? '3' : '2'}"></td>
                </tr>
            </tfoot>
        </table>
    `;
}

/**
 * Edit invoice from detail modal
 */
function editInvoiceFromDetail(shipmentId, invoiceId) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        toast.error('Không tìm thấy đợt hàng');
        return;
    }

    const invoice = (shipment.hoaDon || []).find(hd => hd.id === invoiceId);
    if (!invoice) {
        toast.error('Không tìm thấy hóa đơn');
        return;
    }

    closeModal('modalInvoiceDetail');

    // Open edit invoice modal (to be implemented in modal-shipment.js)
    if (typeof openEditInvoiceModal === 'function') {
        openEditInvoiceModal(shipment, invoice);
    }
}

console.log('[MODAL] Invoice detail modal initialized');
