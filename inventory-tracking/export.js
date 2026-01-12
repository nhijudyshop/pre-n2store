// =====================================================
// EXPORT - INVENTORY TRACKING
// Phase 6: Export data to Excel based on permissions
// =====================================================

/**
 * Export shipments to Excel
 */
async function exportToExcel() {
    if (!permissionHelper?.can('export_data')) {
        toast.error('Bạn không có quyền xuất file');
        return;
    }

    try {
        toast.loading('Đang tạo file Excel...');

        const { filteredShipments } = globalState;
        const canExportFinance = permissionHelper?.can('tab_congNo');

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Sheet 1: Shipments
        const shipmentsData = buildShipmentsExportData(filteredShipments, canExportFinance);
        const ws1 = XLSX.utils.aoa_to_array(shipmentsData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Theo Doi Nhap Hang');

        // Sheet 2: Finance (if has permission)
        if (canExportFinance) {
            const financeData = buildFinanceExportData();
            const ws2 = XLSX.utils.aoa_to_array(financeData);
            XLSX.utils.book_append_sheet(wb, ws2, 'Cong No');
        }

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `inventory_tracking_${dateStr}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);

        toast.success('Đã xuất file Excel');

    } catch (error) {
        console.error('[EXPORT] Error:', error);
        toast.error('Không thể xuất file');
    }
}

/**
 * Build shipments export data
 */
function buildShipmentsExportData(shipments, includeFinance) {
    const headers = [
        'Ngay Di Hang',
        'So Kien',
        'Tong Ky',
        'STT NCC',
        'Ma SP',
        'Mo Ta SP',
        'Chi Tiet Mau Sac',
        'Tong So Luong',
        'Don Gia',
        'Thanh Tien',
        'Tong Mon',
        'So Mon Thieu',
    ];

    if (includeFinance) {
        headers.push('Chi Phi Hang Ve', 'Ghi Chu');
    }

    const rows = [headers];

    shipments.forEach(shipment => {
        const packages = shipment.kien || [];
        const totalWeight = packages.reduce((sum, k) => sum + (k.soKy || 0), 0);

        (shipment.hoaDon || []).forEach((hd, hdIndex) => {
            (hd.sanPham || []).forEach((sp, spIndex) => {
                // Format color details for Excel
                const colorDetails = sp.mauSac?.length > 0
                    ? sp.mauSac.map(c => `${c.mau} (${c.soLuong})`).join(', ')
                    : (sp.soMau ? `${sp.soMau} màu` : '');

                const row = [
                    hdIndex === 0 && spIndex === 0 ? formatDateDisplay(shipment.ngayDiHang) : '',
                    hdIndex === 0 && spIndex === 0 ? packages.length : '',
                    hdIndex === 0 && spIndex === 0 ? totalWeight : '',
                    spIndex === 0 ? hd.sttNCC : '',
                    sp.maSP || '',
                    sp.moTa || '',
                    colorDetails,
                    sp.tongSoLuong || sp.soLuong || '',
                    sp.giaDonVi || '',
                    sp.thanhTien || '',
                    spIndex === 0 ? hd.tongMon : '',
                    spIndex === 0 ? (hd.soMonThieu || '') : '',
                ];

                if (includeFinance) {
                    row.push(
                        hdIndex === 0 && spIndex === 0 ? (shipment.chiPhiHangVe || '') : '',
                        hdIndex === 0 && spIndex === 0 ? (shipment.ghiChu || '') : ''
                    );
                }

                rows.push(row);
            });
        });
    });

    return rows;
}

/**
 * Build finance export data
 */
function buildFinanceExportData() {
    const headers = [
        'Ngay',
        'Loai',
        'Mo Ta',
        'Thu (+)',
        'Chi (-)',
        'Ghi Chu'
    ];

    const rows = [headers];
    const transactions = buildTransactionsList();

    transactions.forEach(tx => {
        rows.push([
            formatDateDisplay(tx.ngay),
            getTransactionTypeLabel(tx.type),
            tx.moTa || '',
            tx.isPositive ? tx.soTien : '',
            !tx.isPositive ? tx.soTien : '',
            tx.ghiChu || ''
        ]);
    });

    // Add summary row
    const balance = calculateBalance();
    rows.push([]);
    rows.push(['', '', 'TONG CONG', balance.tongThu, balance.tongChi, '']);
    rows.push(['', '', 'CON LAI', '', '', balance.conLai]);

    return rows;
}

/**
 * Get transaction type label
 */
function getTransactionTypeLabel(type) {
    const labels = {
        [TRANSACTION_TYPES.PREPAYMENT]: 'Thanh toán trước',
        [TRANSACTION_TYPES.INVOICE]: 'Tiền hóa đơn',
        [TRANSACTION_TYPES.SHIPPING_COST]: 'Chi phí hàng về',
        [TRANSACTION_TYPES.OTHER_EXPENSE]: 'Chi phí khác'
    };
    return labels[type] || type;
}

/**
 * Export single shipment details
 */
function exportShipmentDetail(shipmentId) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        toast.error('Không tìm thấy đợt hàng');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // Build detail data
        const data = buildShipmentDetailData(shipment);
        const ws = XLSX.utils.aoa_to_array(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết');

        const filename = `shipment_${shipment.ngayDiHang}_${shipmentId}.xlsx`;
        XLSX.writeFile(wb, filename);

        toast.success('Đã xuất chi tiết');

    } catch (error) {
        console.error('[EXPORT] Error:', error);
        toast.error('Không thể xuất file');
    }
}

/**
 * Build single shipment detail data
 */
function buildShipmentDetailData(shipment) {
    const rows = [];

    // Header info
    rows.push(['THONG TIN DOT HANG']);
    rows.push(['Ngay di hang:', formatDateDisplay(shipment.ngayDiHang)]);
    rows.push([]);

    // Packages
    rows.push(['DANH SACH KIEN']);
    rows.push(['STT', 'So Ky']);
    (shipment.kien || []).forEach((k, i) => {
        rows.push([i + 1, k.soKy]);
    });
    rows.push([]);

    // Invoices
    rows.push(['DANH SACH HOA DON']);
    (shipment.hoaDon || []).forEach(hd => {
        rows.push([`NCC ${hd.sttNCC}`, '', `Tong: ${hd.tongTienHD}`, `${hd.tongMon} mon`]);
        rows.push(['Ma SP', 'So Mau', 'SL', 'Don Gia', 'Thanh Tien']);
        (hd.sanPham || []).forEach(sp => {
            rows.push([sp.maSP || sp.rawText, sp.soMau, sp.soLuong, sp.giaDonVi, sp.thanhTien]);
        });
        rows.push([]);
    });

    return rows;
}

/**
 * Export order tracking data to Excel (non-admin version)
 * Columns: NCC, STT, CHI TIẾT SẢN PHẨM, TIỀN HĐ, TỔNG MÓN, THIẾU
 */
async function exportTrackingToExcel() {
    try {
        toast.loading('Đang tạo file Excel...');

        const { filteredShipments } = globalState;

        if (!filteredShipments || filteredShipments.length === 0) {
            toast.error('Không có dữ liệu để xuất');
            return;
        }

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Build tracking export data
        const trackingData = buildTrackingExportData(filteredShipments);
        const ws = XLSX.utils.aoa_to_sheet(trackingData);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // NCC
            { wch: 6 },   // STT
            { wch: 50 },  // Chi Tiết Sản Phẩm
            { wch: 12 },  // Tiền HĐ
            { wch: 10 },  // Tổng Món
            { wch: 8 }    // Thiếu
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Theo Doi Don Hang');

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `theo_doi_don_hang_${dateStr}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);

        toast.success('Đã xuất file Excel');

    } catch (error) {
        console.error('[EXPORT] Error:', error);
        toast.error('Không thể xuất file');
    }
}

/**
 * Build order tracking export data
 * Format: Grouped by date with NCC, STT, product details, amounts
 */
function buildTrackingExportData(shipments) {
    const rows = [];

    // Sort shipments by date
    const sortedShipments = [...shipments].sort((a, b) =>
        (b.ngayDiHang || '').localeCompare(a.ngayDiHang || '')
    );

    sortedShipments.forEach(shipment => {
        const invoices = shipment.hoaDon || [];
        if (invoices.length === 0) return;

        // Calculate packages info
        const packages = shipment.kienHang || [];
        const packagesCount = packages.length;

        // Add date header row
        rows.push([`Ngày giao: ${formatDateDisplay(shipment.ngayDiHang)}`, '', `${packagesCount} Kiện`, '', '', '']);

        // Add column headers
        rows.push(['NCC', 'STT', 'CHI TIẾT SẢN PHẨM', 'TIỀN HĐ', 'TỔNG MÓN', 'THIẾU']);

        // Group products by invoice (NCC)
        invoices.forEach(hd => {
            const products = hd.sanPham || [];
            const nccDisplay = hd.tenNCC ? `${hd.sttNCC}\n${hd.tenNCC}` : String(hd.sttNCC);
            const tongTienHD = hd.tongTienHD || hd.tongTien || 0;
            const tongMon = hd.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
            const soMonThieu = hd.soMonThieu || 0;

            if (products.length === 0) {
                // No products - single row
                rows.push([
                    nccDisplay,
                    '-',
                    '-',
                    tongTienHD,
                    tongMon,
                    soMonThieu > 0 ? soMonThieu : '-'
                ]);
            } else {
                // Multiple products
                products.forEach((product, idx) => {
                    const isFirstRow = idx === 0;
                    const isVietnamese = globalState.langMode === 'vi';

                    // Get product text
                    let productText = '-';
                    if (isVietnamese) {
                        if (product.rawText_vi) {
                            productText = product.rawText_vi;
                        } else if (product.rawText) {
                            productText = translateToVietnamese(product.rawText);
                        } else {
                            const tenSP = product.tenSP_vi || translateToVietnamese(product.tenSP || '');
                            const soMau = product.soMau_vi || translateToVietnamese(product.soMau || '');
                            productText = `MA ${product.maSP || ''} ${tenSP} MAU ${soMau} SL ${product.soLuong || 0}`;
                        }
                    } else {
                        productText = product.rawText || `MA ${product.maSP || ''} ${product.tenSP || ''} MAU ${product.soMau || ''} SL ${product.soLuong || 0}`;
                    }

                    rows.push([
                        isFirstRow ? nccDisplay : '',
                        idx + 1,
                        productText,
                        isFirstRow ? tongTienHD : '',
                        isFirstRow ? tongMon : '',
                        isFirstRow ? (soMonThieu > 0 ? soMonThieu : '-') : ''
                    ]);
                });
            }
        });

        // Add empty row between shipments
        rows.push([]);
    });

    return rows;
}

console.log('[EXPORT] Export initialized');
