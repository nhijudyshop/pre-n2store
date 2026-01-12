// =====================================================
// DETAILED PERMISSIONS CONFIGURATION
// =====================================================

const DETAILED_PERMISSIONS = {
    live: {
        id: "live",
        icon: "camera",
        name: "HÌNH ẢNH LIVE",
        description: "Xem và quản lý hình ảnh live stream",
        subPermissions: {
            view: { name: "Xem hình ảnh", icon: "eye" },
            upload: { name: "Upload hình ảnh", icon: "upload" },
        },
    },
    livestream: {
        id: "livestream",
        icon: "video",
        name: "BÁO CÁO LIVESTREAM",
        description: "Xem báo cáo và thống kê livestream",
        subPermissions: {
            view: { name: "Xem báo cáo", icon: "eye" },
            export: { name: "Xuất báo cáo", icon: "file-down" },
            edit: { name: "Chỉnh sửa", icon: "edit" },
            analytics: { name: "Phân tích chi tiết", icon: "trending-up" },
        },
    },
    sanphamlive: {
        id: "sanphamlive",
        icon: "shopping-bag",
        name: "SẢN PHẨM LIVESTREAM",
        description: "Quản lý sản phẩm livestream",
        subPermissions: {
            view: { name: "Xem sản phẩm", icon: "eye" },
            add: { name: "Thêm sản phẩm", icon: "plus-circle" },
            edit: { name: "Sửa sản phẩm", icon: "edit" },
            delete: { name: "Xóa sản phẩm", icon: "trash-2" },
            pricing: { name: "Chỉnh sửa giá", icon: "dollar-sign" },
        },
    },
    nhanhang: {
        id: "nhanhang",
        icon: "package",
        name: "NHẬN HÀNG",
        description: "Quản lý nhận hàng từ nhà cung cấp",
        subPermissions: {
            view: { name: "Xem đơn nhận", icon: "eye" },
            create: { name: "Tạo đơn nhận", icon: "plus-square" },
            confirm: { name: "Xác nhận nhận", icon: "check-circle" },
            edit: { name: "Sửa thông tin", icon: "edit" },
            cancel: { name: "Hủy đơn", icon: "x-circle" },
        },
    },
    hangrotxa: {
        id: "hangrotxa",
        icon: "clipboard-list",
        name: "HÀNG RỚT - XẢ",
        description: "Quản lý hàng rớt và xả hàng",
        subPermissions: {
            view: { name: "Xem danh sách", icon: "eye" },
            mark: { name: "Đánh dấu rớt", icon: "alert-triangle" },
            approve: { name: "Duyệt xả", icon: "check-square" },
            price: { name: "Điều chỉnh giá", icon: "tag" },
            delete: { name: "Xóa", icon: "trash-2" },
        },
    },
    ib: {
        id: "ib",
        icon: "message-square",
        name: "INBOX KHÁCH HÀNG",
        description: "Quản lý tin nhắn khách hàng",
        subPermissions: {
            view: { name: "Xem tin nhắn", icon: "eye" },
            reply: { name: "Trả lời", icon: "reply" },
            assign: { name: "Phân công", icon: "user-plus" },
            archive: { name: "Lưu trữ", icon: "archive" },
            export: { name: "Xuất dữ liệu", icon: "download" },
        },
    },
    ck: {
        id: "ck",
        icon: "credit-card",
        name: "CHUYỂN KHOẢN",
        description: "Quản lý thông tin chuyển khoản",
        subPermissions: {
            view: { name: "Xem thông tin", icon: "eye" },
            verify: { name: "Xác minh", icon: "shield-check" },
            edit: { name: "Sửa thông tin", icon: "edit" },
            export: { name: "Xuất báo cáo", icon: "file-text" },
            delete: { name: "Xóa giao dịch", icon: "trash-2" },
        },
    },
    hanghoan: {
        id: "hanghoan",
        icon: "rotate-ccw",
        name: "HÀNG HOÀN",
        description: "Xử lý hàng hoàn trả",
        subPermissions: {
            view: { name: "Xem đơn hoàn", icon: "eye" },
            approve: { name: "Duyệt hoàn", icon: "check-circle" },
            reject: { name: "Từ chối", icon: "x-circle" },
            refund: { name: "Hoàn tiền", icon: "dollar-sign" },
            update: { name: "Cập nhật", icon: "refresh-cw" },
        },
    },
    hangdat: {
        id: "hangdat",
        icon: "file-text",
        name: "HÀNG ĐẶT",
        description: "Quản lý đơn đặt trước",
        subPermissions: {
            view: { name: "Xem đơn đặt", icon: "eye" },
            create: { name: "Tạo đơn mới", icon: "plus-circle" },
            edit: { name: "Sửa đơn hàng", icon: "edit" },
            confirm: { name: "Xác nhận", icon: "check-square" },
            cancel: { name: "Hủy đơn", icon: "x-square" },
        },
    },
    bangkiemhang: {
        id: "bangkiemhang",
        icon: "check-square",
        name: "BẢNG KIỂM HÀNG",
        description: "Kiểm tra và xác nhận hàng hóa",
        subPermissions: {
            view: { name: "Xem bảng kiểm", icon: "eye" },
            check: { name: "Kiểm hàng", icon: "check-circle" },
            approve: { name: "Duyệt", icon: "clipboard-check" },
            edit: { name: "Sửa", icon: "edit" },
            export: { name: "Xuất", icon: "printer" },
        },
    },
    inventoryTracking: {
        id: "inventoryTracking",
        icon: "package-search",
        name: "THEO DÕI NHẬP HÀNG SL",
        description: "Quản lý theo dõi nhập hàng và công nợ chuyến lấy hàng",
        subPermissions: {
            tab_tracking: { name: "Xem tab Theo dõi", icon: "eye" },
            tab_congNo: { name: "Xem tab Công nợ", icon: "wallet" },
            create_shipment: { name: "Thêm đợt hàng", icon: "plus-circle" },
            edit_shipment: { name: "Sửa đợt hàng", icon: "edit" },
            delete_shipment: { name: "Xóa đợt hàng", icon: "trash-2" },
            view_chiPhiHangVe: { name: "Xem chi phí hàng về", icon: "dollar-sign" },
            edit_chiPhiHangVe: { name: "Sửa chi phí hàng về", icon: "edit-3" },
            view_ghiChuAdmin: { name: "Xem ghi chú Admin", icon: "file-text" },
            edit_ghiChuAdmin: { name: "Sửa ghi chú Admin", icon: "edit-3" },
            edit_soMonThieu: { name: "Cập nhật số thiếu", icon: "clipboard-check" },
            create_prepayment: { name: "Thêm thanh toán trước", icon: "plus" },
            edit_prepayment: { name: "Sửa thanh toán trước", icon: "edit" },
            delete_prepayment: { name: "Xóa thanh toán trước", icon: "trash" },
            create_otherExpense: { name: "Thêm chi phí khác", icon: "plus" },
            edit_otherExpense: { name: "Sửa chi phí khác", icon: "edit" },
            delete_otherExpense: { name: "Xóa chi phí khác", icon: "trash" },
            edit_invoice_from_finance: { name: "Sửa HĐ từ tab Công nợ", icon: "edit-2" },
            edit_shipping_from_finance: { name: "Sửa CP từ tab Công nợ", icon: "edit-2" },
            export_data: { name: "Xuất Excel", icon: "download" },
        },
    },
    "purchase-orders": {
        id: "purchase-orders",
        icon: "clipboard-list",
        name: "QUẢN LÝ ĐẶT HÀNG NCC",
        description: "Quản lý đơn đặt hàng từ nhà cung cấp",
        subPermissions: {
            view: { name: "Xem đơn đặt hàng", icon: "eye" },
            create: { name: "Tạo đơn đặt hàng", icon: "plus-circle" },
            edit: { name: "Sửa đơn đặt hàng", icon: "edit" },
            delete: { name: "Xóa đơn đặt hàng", icon: "trash-2" },
            status_change: { name: "Thay đổi trạng thái", icon: "refresh-cw" },
            copy: { name: "Sao chép đơn", icon: "copy" },
            export: { name: "Xuất Excel", icon: "download" },
            upload_images: { name: "Upload hình ảnh", icon: "upload" },
        },
    },
    // "user-management": {
    //     id: "user-management",
    //     icon: "users",
    //     name: "QUẢN LÝ TÀI KHOẢN",
    //     description: "Quản lý users và phân quyền",
    //     subPermissions: {
    //         view: { name: "Xem users", icon: "eye" },
    //         create: { name: "Tạo tài khoản", icon: "user-plus" },
    //         edit: { name: "Sửa user", icon: "edit" },
    //         delete: { name: "Xóa tài khoản", icon: "user-minus" },
    //         permissions: { name: "Phân quyền", icon: "shield" },
    //     },
    // },
    history: {
        id: "history",
        icon: "bar-chart-2",
        name: "LỊCH SỬ",
        description: "Xem lịch sử thay đổi dữ liệu",
        subPermissions: {
            view: { name: "Xem lịch sử", icon: "eye" },
            export: { name: "Xuất báo cáo", icon: "download" },
            restore: { name: "Khôi phục", icon: "rotate-ccw" },
            delete: { name: "Xóa lịch sử", icon: "trash-2" },
        },
    },
    // NOTE: "soluong-live" permissions are now defined in permissions-registry.js
    // with keys: livestream, social, viewReport
};

// Role Templates
const PERMISSION_TEMPLATES = {
    admin: {
        name: "Admin - Toàn quyền",
        icon: "crown",
        permissions: generatePermissionsForRole("all"),
    },
    manager: {
        name: "Manager - Quản lý",
        icon: "briefcase",
        permissions: generatePermissionsForRole("manager"),
    },
    staff: {
        name: "Staff - Nhân viên",
        icon: "users",
        permissions: generatePermissionsForRole("staff"),
    },
    viewer: {
        name: "Viewer - Chỉ xem",
        icon: "eye",
        permissions: generatePermissionsForRole("viewer"),
    },
    custom: {
        name: "Custom - Tùy chỉnh",
        icon: "sliders",
        permissions: {},
    },
};

function generatePermissionsForRole(role) {
    const permissions = {};

    Object.keys(DETAILED_PERMISSIONS).forEach((pageId) => {
        const page = DETAILED_PERMISSIONS[pageId];
        permissions[pageId] = {};

        Object.keys(page.subPermissions).forEach((subKey) => {
            if (role === "all") {
                permissions[pageId][subKey] = true;
            } else if (role === "manager") {
                if (pageId === "user-management") {
                    permissions[pageId][subKey] = subKey !== "delete";
                } else if (pageId === "history") {
                    permissions[pageId][subKey] =
                        subKey !== "restore" && subKey !== "delete";
                } else {
                    permissions[pageId][subKey] = true;
                }
            } else if (role === "staff") {
                if (pageId === "user-management" || pageId === "history") {
                    permissions[pageId][subKey] = false;
                } else {
                    permissions[pageId][subKey] =
                        subKey === "view" || subKey === "edit";
                }
            } else if (role === "viewer") {
                permissions[pageId][subKey] = subKey === "view";
            }
        });
    });

    return permissions;
}
