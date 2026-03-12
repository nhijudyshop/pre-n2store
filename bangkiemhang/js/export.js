// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        notificationManager.warning("Không có dữ liệu để xuất", 3000);
        return;
    }

    const processingId = notificationManager.processing(
        "Đang tạo file Excel...",
    );

    try {
        const filteredData = applyFiltersToInventory(cachedData);

        if (filteredData.length === 0) {
            notificationManager.remove(processingId);
            notificationManager.warning(
                "Không có dữ liệu phù hợp với bộ lọc để xuất",
                3000,
            );
            return;
        }

        const excelData = filteredData.map((item, index) => ({
            STT: index + 1,
            "Ngày đặt hàng": item.ngayDatHang || "",
            "Nhà cung cấp": item.nhaCungCap || "",
            "Ngày nhận hàng": item.ngayNhan || "",
            "Mã sản phẩm": item.maSanPham || "",
            "Tên sản phẩm": item.tenSanPham || "",
            "Số lượng đặt": item.soLuong || 0,
            "Thực nhận": item.thucNhan || 0,
            "Tổng nhận": item.tongNhan || 0,
            "Cập nhật lúc": item.lastUpdated || "",
            "Người cập nhật": item.updatedBy || "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-fit column widths
        const colWidths = [];
        const headers = Object.keys(excelData[0] || {});
        headers.forEach((header, i) => {
            const maxLength = Math.max(
                header.length,
                ...excelData.map((row) => String(row[header] || "").length),
            );
            colWidths[i] = { width: Math.min(maxLength + 2, 50) };
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kiểm Hàng");

        const fileName = `KiemHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}_${new Date().getHours()}h${new Date().getMinutes()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        notificationManager.remove(processingId);
        notificationManager.success(
            `Đã xuất ${filteredData.length} sản phẩm`,
            2500,
            "Xuất Excel thành công",
        );

        // Log export action
        logAction(
            "export",
            `Xuất Excel file "${fileName}" với ${filteredData.length} sản phẩm`,
        );
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        notificationManager.remove(processingId);
        notificationManager.error("Lỗi khi xuất Excel: " + error.message, 4000);
    }
}

console.log("Export functionality loaded");
