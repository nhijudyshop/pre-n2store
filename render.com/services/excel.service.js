const XLSX = require("xlsx");

function createExcelBase64(products) {
    const excelData = products.map((p) => ({
        "Loại sản phẩm": "Có thể lưu trữ",
        "Mã sản phẩm": p.maSanPham || undefined,
        "Mã chốt đơn": undefined,
        "Tên sản phẩm": p.tenSanPham || undefined,
        "Giá bán": (p.giaBan || 0) * 1000,
        "Giá mua": (p.giaMua || 0) * 1000,
        "Đơn vị": "CÁI",
        "Nhóm sản phẩm": "QUẦN ÁO",
        "Mã vạch": p.maSanPham || undefined,
        "Khối lượng": undefined,
        "Chiết khấu bán": undefined,
        "Chiết khấu mua": undefined,
        "Tồn kho": undefined,
        "Giá vốn": undefined,
        "Ghi chú": p.ghiChu || undefined,
        "Cho phép bán ở công ty khác": "FALSE",
        "Thuộc tính": undefined,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    return buffer.toString("base64");
}

module.exports = { createExcelBase64 };
