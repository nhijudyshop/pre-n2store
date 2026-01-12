// =====================================================
// PERMISSIONS REGISTRY - Single Source of Truth
// Quản lý tập trung tất cả pages và permissions
// =====================================================

/**
 * PAGES_REGISTRY - Danh sách đầy đủ tất cả các trang trong hệ thống
 *
 * Cấu trúc mỗi page:
 * - id: Unique identifier (dùng trong URL và code)
 * - name: Tên hiển thị đầy đủ
 * - shortName: Tên ngắn gọn (cho mobile/sidebar collapsed)
 * - icon: Lucide icon name
 * - href: Đường dẫn tương đối đến trang
 * - description: Mô tả chức năng
 * - adminOnly: Chỉ admin mới có thể truy cập (mặc định false)
 * - category: Phân loại trang (sales, warehouse, report, admin)
 * - detailedPermissions: Các quyền chi tiết trong trang
 */

const PAGES_REGISTRY = {
    // =====================================================
    // CATEGORY: SALES - Bán hàng & Livestream
    // =====================================================
    live: {
        id: "live",
        name: "Hình Ảnh Live",
        shortName: "Live",
        icon: "image",
        href: "../live/index.html",
        description: "Xem và quản lý hình ảnh live stream",
        adminOnly: false,
        category: "sales",
        detailedPermissions: {
            view: { name: "Xem hình ảnh", icon: "eye", description: "Xem danh sách hình ảnh live" },
            upload: { name: "Upload hình ảnh", icon: "upload", description: "Tải lên hình ảnh mới" },
            edit: { name: "Chỉnh sửa", icon: "edit", description: "Sửa thông tin hình ảnh" },
            delete: { name: "Xóa hình ảnh", icon: "trash-2", description: "Xóa hình ảnh khỏi hệ thống" }
        }
    },

    livestream: {
        id: "livestream",
        name: "Báo Cáo Livestream",
        shortName: "Báo Cáo",
        icon: "video",
        href: "../livestream/index.html",
        description: "Xem báo cáo và thống kê livestream",
        adminOnly: false,
        category: "sales",
        detailedPermissions: {
            view: { name: "Xem báo cáo", icon: "eye", description: "Xem thống kê livestream" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export báo cáo ra file" },
            edit: { name: "Chỉnh sửa", icon: "edit", description: "Sửa thông tin livestream" },
            analytics: { name: "Phân tích chi tiết", icon: "trending-up", description: "Xem phân tích nâng cao" }
        }
    },

    sanphamlive: {
        id: "sanphamlive",
        name: "Sản Phẩm Livestream",
        shortName: "Sản Phẩm",
        icon: "shopping-bag",
        href: "../sanphamlive/index.html",
        description: "Quản lý sản phẩm livestream",
        adminOnly: true,
        category: "sales",
        detailedPermissions: {
            view: { name: "Xem sản phẩm", icon: "eye", description: "Xem danh sách sản phẩm" },
            add: { name: "Thêm sản phẩm", icon: "plus-circle", description: "Thêm sản phẩm mới" },
            edit: { name: "Sửa sản phẩm", icon: "edit", description: "Chỉnh sửa thông tin sản phẩm" },
            delete: { name: "Xóa sản phẩm", icon: "trash-2", description: "Xóa sản phẩm khỏi hệ thống" },
            pricing: { name: "Chỉnh sửa giá", icon: "dollar-sign", description: "Thay đổi giá sản phẩm" },
            stock: { name: "Quản lý tồn kho", icon: "package", description: "Cập nhật số lượng tồn" }
        }
    },

    ib: {
        id: "ib",
        name: "Check Inbox Khách",
        shortName: "Inbox",
        icon: "message-circle",
        href: "../ib/index.html",
        description: "Kiểm tra inbox và tin nhắn khách hàng",
        adminOnly: false,
        category: "sales",
        detailedPermissions: {
            view: { name: "Xem tin nhắn", icon: "eye", description: "Xem danh sách tin nhắn" },
            reply: { name: "Trả lời tin nhắn", icon: "reply", description: "Phản hồi khách hàng" },
            assign: { name: "Phân công", icon: "user-plus", description: "Phân công xử lý cho nhân viên" },
            archive: { name: "Lưu trữ", icon: "archive", description: "Lưu trữ tin nhắn đã xử lý" },
            export: { name: "Xuất dữ liệu", icon: "download", description: "Export tin nhắn" }
        }
    },

    // =====================================================
    // CATEGORY: WAREHOUSE - Kho & Nhận hàng
    // =====================================================
    nhanhang: {
        id: "nhanhang",
        name: "Cân Nặng Hàng",
        shortName: "Cân Hàng",
        icon: "scale",
        href: "../nhanhang/index.html",
        description: "Quản lý cân nặng và nhận hàng từ NCC",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            view: { name: "Xem đơn nhận", icon: "eye", description: "Xem danh sách đơn nhận hàng" },
            create: { name: "Tạo đơn nhận", icon: "plus-square", description: "Tạo đơn nhận hàng mới" },
            confirm: { name: "Xác nhận nhận", icon: "check-circle", description: "Xác nhận đã nhận hàng" },
            edit: { name: "Sửa thông tin", icon: "edit", description: "Chỉnh sửa đơn nhận" },
            cancel: { name: "Hủy đơn", icon: "x-circle", description: "Hủy đơn nhận hàng" },
            weigh: { name: "Cân hàng", icon: "scale", description: "Nhập cân nặng hàng hóa" }
        }
    },

    inventoryTracking: {
        id: "inventoryTracking",
        name: "Theo Dõi Nhập Hàng SL",
        shortName: "Nhập Hàng",
        icon: "package-search",
        href: "../inventory-tracking/index.html",
        description: "Theo dõi nhập hàng số lượng và công nợ chuyến lấy hàng",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            tab_tracking: { name: "Xem tab Theo dõi", icon: "eye", description: "Truy cập tab theo dõi đơn hàng" },
            tab_congNo: { name: "Xem tab Công nợ", icon: "wallet", description: "Truy cập tab quản lý tài chính" },
            create_shipment: { name: "Thêm đợt hàng", icon: "plus-circle", description: "Tạo đợt hàng mới" },
            edit_shipment: { name: "Sửa đợt hàng", icon: "edit", description: "Chỉnh sửa thông tin đợt hàng" },
            delete_shipment: { name: "Xóa đợt hàng", icon: "trash-2", description: "Xóa đợt hàng khỏi hệ thống" },
            view_chiPhiHangVe: { name: "Xem chi phí hàng về", icon: "dollar-sign", description: "Xem chi phí vận chuyển" },
            edit_chiPhiHangVe: { name: "Sửa chi phí hàng về", icon: "edit-3", description: "Chỉnh sửa chi phí vận chuyển" },
            view_ghiChuAdmin: { name: "Xem ghi chú Admin", icon: "file-text", description: "Xem ghi chú nội bộ" },
            edit_ghiChuAdmin: { name: "Sửa ghi chú Admin", icon: "edit-3", description: "Chỉnh sửa ghi chú nội bộ" },
            edit_soMonThieu: { name: "Cập nhật số thiếu", icon: "clipboard-check", description: "Ghi nhận hàng thiếu" },
            create_prepayment: { name: "Thêm thanh toán trước", icon: "plus", description: "Tạo khoản thanh toán trước" },
            edit_prepayment: { name: "Sửa thanh toán trước", icon: "edit", description: "Chỉnh sửa thanh toán trước" },
            delete_prepayment: { name: "Xóa thanh toán trước", icon: "trash", description: "Xóa khoản thanh toán trước" },
            create_otherExpense: { name: "Thêm chi phí khác", icon: "plus", description: "Tạo chi phí phát sinh" },
            edit_otherExpense: { name: "Sửa chi phí khác", icon: "edit", description: "Chỉnh sửa chi phí phát sinh" },
            delete_otherExpense: { name: "Xóa chi phí khác", icon: "trash", description: "Xóa chi phí phát sinh" },
            edit_invoice_from_finance: { name: "Sửa HĐ từ Công nợ", icon: "edit-2", description: "Sửa hóa đơn từ tab công nợ" },
            edit_shipping_from_finance: { name: "Sửa CP từ Công nợ", icon: "edit-2", description: "Sửa chi phí từ tab công nợ" },
            export_data: { name: "Xuất Excel", icon: "download", description: "Export dữ liệu ra Excel" }
        }
    },

    hangrotxa: {
        id: "hangrotxa",
        name: "Hàng Rớt - Xả",
        shortName: "Rớt/Xả",
        icon: "clipboard-list",
        href: "../hangrotxa/index.html",
        description: "Quản lý hàng rớt và xả hàng",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            view: { name: "Xem danh sách", icon: "eye", description: "Xem hàng rớt/xả" },
            mark: { name: "Đánh dấu rớt", icon: "alert-triangle", description: "Đánh dấu hàng rớt" },
            approve: { name: "Duyệt xả", icon: "check-square", description: "Phê duyệt xả hàng" },
            price: { name: "Điều chỉnh giá", icon: "tag", description: "Thay đổi giá xả" },
            delete: { name: "Xóa", icon: "trash-2", description: "Xóa khỏi danh sách" }
        }
    },

    hanghoan: {
        id: "hanghoan",
        name: "Hàng Hoàn",
        shortName: "Hoàn",
        icon: "corner-up-left",
        href: "../hanghoan/index.html",
        description: "Xử lý hàng hoàn trả từ khách",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            view: { name: "Xem đơn hoàn", icon: "eye", description: "Xem danh sách hàng hoàn" },
            approve: { name: "Duyệt hoàn", icon: "check-circle", description: "Phê duyệt yêu cầu hoàn" },
            reject: { name: "Từ chối", icon: "x-circle", description: "Từ chối yêu cầu hoàn" },
            refund: { name: "Hoàn tiền", icon: "dollar-sign", description: "Xử lý hoàn tiền" },
            update: { name: "Cập nhật", icon: "refresh-cw", description: "Cập nhật trạng thái" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export danh sách hoàn" }
        }
    },

    "product-search": {
        id: "product-search",
        name: "Tìm Kiếm Sản Phẩm",
        shortName: "Tìm SP",
        icon: "search",
        href: "../product-search/index.html",
        description: "Tìm kiếm và tra cứu sản phẩm trong kho",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            view: { name: "Xem & tìm kiếm", icon: "eye", description: "Tìm kiếm sản phẩm" },
            viewStock: { name: "Xem tồn kho", icon: "package", description: "Xem số lượng tồn kho" },
            viewPrice: { name: "Xem giá", icon: "dollar-sign", description: "Xem giá sản phẩm" },
            export: { name: "Xuất danh sách", icon: "download", description: "Export kết quả tìm kiếm" }
        }
    },

    "soluong-live": {
        id: "soluong-live",
        name: "Số Lượng Live",
        shortName: "Số Lượng",
        icon: "package-check",
        href: "../soluong-live/index.html",
        description: "Theo dõi số lượng sản phẩm khi livestream và bán qua social",
        adminOnly: false,
        category: "warehouse",
        detailedPermissions: {
            livestream: { name: "Bán hàng Livestream", icon: "video", description: "Truy cập trang bán hàng Livestream" },
            social: { name: "Bán hàng Social", icon: "message-circle", description: "Truy cập trang bán hàng Social (Facebook, etc.)" },
            viewReport: { name: "Xem báo cáo bán", icon: "bar-chart", description: "Xem báo cáo thống kê bán hàng" }
        }
    },

    // =====================================================
    // CATEGORY: ORDERS - Đơn hàng & Thanh toán
    // =====================================================
    ck: {
        id: "ck",
        name: "Thông Tin Chuyển Khoản",
        shortName: "CK",
        icon: "credit-card",
        href: "../ck/index.html",
        description: "Quản lý thông tin chuyển khoản",
        adminOnly: false,
        category: "orders",
        detailedPermissions: {
            view: { name: "Xem thông tin", icon: "eye", description: "Xem danh sách chuyển khoản" },
            verify: { name: "Xác minh", icon: "shield-check", description: "Xác minh chuyển khoản" },
            edit: { name: "Sửa thông tin", icon: "edit", description: "Chỉnh sửa thông tin CK" },
            export: { name: "Xuất báo cáo", icon: "file-text", description: "Export báo cáo CK" },
            delete: { name: "Xóa giao dịch", icon: "trash-2", description: "Xóa giao dịch CK" }
        }
    },

    "order-management": {
        id: "order-management",
        name: "Quản Lý Order",
        shortName: "Order",
        icon: "package-check",
        href: "../order-management/index.html",
        description: "Quản lý đơn hàng tổng hợp",
        adminOnly: false,
        category: "orders",
        detailedPermissions: {
            view: { name: "Xem đơn hàng", icon: "eye", description: "Xem danh sách đơn" },
            create: { name: "Tạo đơn", icon: "plus-circle", description: "Tạo đơn hàng mới" },
            edit: { name: "Sửa đơn", icon: "edit", description: "Chỉnh sửa đơn hàng" },
            updateStatus: { name: "Cập nhật trạng thái", icon: "refresh-cw", description: "Thay đổi status đơn" },
            cancel: { name: "Hủy đơn", icon: "x-circle", description: "Hủy đơn hàng" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export đơn hàng" },
            print: { name: "In đơn", icon: "printer", description: "In phiếu đơn hàng" }
        }
    },

    "order-log": {
        id: "order-log",
        name: "Sổ Order",
        shortName: "Sổ Order",
        icon: "book-open",
        href: "../soorder/index.html",
        description: "Sổ ghi chép đơn hàng",
        adminOnly: false,
        category: "orders",
        detailedPermissions: {
            view: { name: "Xem sổ order", icon: "eye", description: "Xem sổ ghi chép" },
            add: { name: "Thêm ghi chép", icon: "plus-circle", description: "Thêm entry mới" },
            edit: { name: "Sửa ghi chép", icon: "edit", description: "Chỉnh sửa entry" },
            delete: { name: "Xóa ghi chép", icon: "trash-2", description: "Xóa entry" },
            export: { name: "Xuất sổ", icon: "download", description: "Export sổ order" }
        }
    },

    "order-live-tracking": {
        id: "order-live-tracking",
        name: "Sổ Order Live",
        shortName: "Order Live",
        icon: "radio",
        href: "../order-live-tracking/index.html",
        description: "Theo dõi order live realtime",
        adminOnly: false,
        category: "orders",
        detailedPermissions: {
            view: { name: "Xem order live", icon: "eye", description: "Xem đơn live realtime" },
            track: { name: "Theo dõi", icon: "radio", description: "Theo dõi trạng thái live" },
            update: { name: "Cập nhật", icon: "refresh-cw", description: "Cập nhật thông tin" },
            export: { name: "Xuất dữ liệu", icon: "download", description: "Export order live" }
        }
    },

    // =====================================================
    // CATEGORY: REPORTS - Báo cáo & Thống kê
    // =====================================================
    baocaosaleonline: {
        id: "baocaosaleonline",
        name: "Báo Cáo Sale-Online",
        shortName: "SaleOnline",
        icon: "shopping-cart",
        href: "../orders-report/main.html",
        description: "Báo cáo bán hàng online tổng hợp",
        adminOnly: false,
        category: "reports",
        detailedPermissions: {
            view: { name: "Xem báo cáo", icon: "eye", description: "Xem thống kê sale online" },
            viewRevenue: { name: "Xem doanh thu", icon: "dollar-sign", description: "Xem số liệu doanh thu" },
            viewDetails: { name: "Xem chi tiết", icon: "list", description: "Xem báo cáo chi tiết" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export báo cáo" },
            compare: { name: "So sánh", icon: "git-compare", description: "So sánh các kỳ báo cáo" },
            viewAnalysis: { name: "Xem Phân tích hiệu quả", icon: "trending-up", description: "Truy cập tab Phân tích hiệu quả" },
            editAnalysis: { name: "Chỉnh sửa Phân tích", icon: "edit", description: "Chỉnh sửa thông số trong tab Phân tích" }
        }
    },

    "tpos-pancake": {
        id: "tpos-pancake",
        name: "Tpos - Pancake",
        shortName: "Tpos-Pancake",
        icon: "columns",
        href: "../tpos-pancake/index.html",
        description: "Tích hợp và đồng bộ TPOS - Pancake",
        adminOnly: false,
        category: "reports",
        detailedPermissions: {
            view: { name: "Xem dữ liệu", icon: "eye", description: "Xem dữ liệu đồng bộ" },
            sync: { name: "Đồng bộ", icon: "refresh-cw", description: "Thực hiện đồng bộ dữ liệu" },
            import: { name: "Import dữ liệu", icon: "upload", description: "Import từ TPOS/Pancake" },
            export: { name: "Export dữ liệu", icon: "download", description: "Export dữ liệu" },
            configure: { name: "Cấu hình", icon: "settings", description: "Cấu hình kết nối" }
        }
    },

    // =====================================================
    // CATEGORY: ADMIN - Quản trị hệ thống
    // =====================================================
    "user-management": {
        id: "user-management",
        name: "Quản Lý Tài Khoản",
        shortName: "Users",
        icon: "users",
        href: "../user-management/index.html",
        description: "Quản lý users và phân quyền hệ thống",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem users", icon: "eye", description: "Xem danh sách tài khoản" },
            create: { name: "Tạo tài khoản", icon: "user-plus", description: "Tạo user mới" },
            edit: { name: "Sửa user", icon: "edit", description: "Chỉnh sửa thông tin user" },
            delete: { name: "Xóa tài khoản", icon: "user-minus", description: "Xóa user khỏi hệ thống" },
            permissions: { name: "Phân quyền", icon: "shield", description: "Cấp/thu hồi quyền" },
            resetPassword: { name: "Reset mật khẩu", icon: "key", description: "Đặt lại mật khẩu user" },
            manageTemplates: { name: "Quản lý Templates", icon: "layout-template", description: "Thêm/sửa/xóa các mẫu phân quyền" }
        }
    },

    "balance-history": {
        id: "balance-history",
        name: "Lịch Sử Biến Động Số Dư",
        shortName: "Số Dư",
        icon: "wallet",
        href: "../balance-history/index.html",
        description: "Theo dõi lịch sử biến động số dư",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem lịch sử", icon: "eye", description: "Xem biến động số dư" },
            viewDetails: { name: "Xem chi tiết", icon: "list", description: "Xem chi tiết giao dịch" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export lịch sử" },
            adjust: { name: "Điều chỉnh", icon: "sliders", description: "Điều chỉnh số dư" },
            resolveMatch: { name: "Chọn khách hàng", icon: "user-check", description: "Chọn KH từ danh sách nhiều SĐT khớp" },
            skipMatch: { name: "Bỏ qua match", icon: "user-x", description: "Bỏ qua khi không khớp KH" },
            undoSkip: { name: "Hoàn tác bỏ qua", icon: "rotate-ccw", description: "Hoàn tác các match đã bỏ qua" }
        }
    },

    "customer-management": {
        id: "customer-management",
        name: "Quản Lý Khách Hàng",
        shortName: "Khách Hàng",
        icon: "user-check",
        href: "../customer-management/index.html",
        description: "Quản lý thông tin khách hàng",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem khách hàng", icon: "eye", description: "Xem danh sách KH" },
            add: { name: "Thêm khách hàng", icon: "user-plus", description: "Thêm KH mới" },
            edit: { name: "Sửa thông tin", icon: "edit", description: "Chỉnh sửa thông tin KH" },
            delete: { name: "Xóa khách hàng", icon: "user-minus", description: "Xóa KH khỏi hệ thống" },
            export: { name: "Xuất danh sách", icon: "download", description: "Export danh sách KH" },
            viewHistory: { name: "Xem lịch sử", icon: "history", description: "Xem lịch sử mua hàng" }
        }
    },

    "customer-hub": {
        id: "customer-hub",
        name: "Customer 360°",
        shortName: "KH 360",
        icon: "users",
        href: "../customer-hub/index.html",
        description: "Hệ thống Customer 360° - Xem toàn diện thông tin khách hàng",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem Customer 360", icon: "eye", description: "Xem tổng quan khách hàng" },
            viewWallet: { name: "Xem ví tiền", icon: "wallet", description: "Xem số dư và giao dịch ví" },
            manageWallet: { name: "Quản lý ví", icon: "credit-card", description: "Nạp/rút/cấp công nợ ảo" },
            viewTickets: { name: "Xem sự vụ", icon: "clipboard-list", description: "Xem lịch sử sự vụ KH" },
            createTicket: { name: "Tạo sự vụ", icon: "plus-circle", description: "Tạo sự vụ mới cho KH" },
            viewActivities: { name: "Xem hoạt động", icon: "activity", description: "Xem timeline hoạt động" },
            addNote: { name: "Thêm ghi chú", icon: "sticky-note", description: "Thêm ghi chú về KH" },
            editCustomer: { name: "Sửa thông tin", icon: "edit", description: "Chỉnh sửa thông tin KH" },
            linkTransactions: { name: "Liên kết giao dịch", icon: "link", description: "Liên kết giao dịch ngân hàng với KH" }
        }
    },

    "issue-tracking": {
        id: "issue-tracking",
        name: "CSKH - Quản Lý Sự Vụ",
        shortName: "CSKH",
        icon: "headphones",
        href: "../issue-tracking/index.html",
        description: "Chăm sóc khách hàng - Quản lý sự vụ, hoàn tiền, đổi COD",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem sự vụ", icon: "eye", description: "Xem danh sách sự vụ" },
            create: { name: "Tạo sự vụ", icon: "plus-circle", description: "Tạo sự vụ mới" },
            edit: { name: "Sửa sự vụ", icon: "edit", description: "Chỉnh sửa thông tin sự vụ" },
            delete: { name: "Xóa sự vụ", icon: "trash-2", description: "Xóa sự vụ khỏi hệ thống" },
            searchOrder: { name: "Tìm đơn hàng", icon: "search", description: "Tìm kiếm đơn hàng theo SĐT/mã đơn" },
            processRefund: { name: "Xử lý hoàn tiền", icon: "dollar-sign", description: "Thực hiện hoàn tiền cho khách" },
            receiveGoods: { name: "Nhận hàng hoàn", icon: "package-check", description: "Xác nhận nhận hàng hoàn" },
            updateStatus: { name: "Cập nhật trạng thái", icon: "refresh-cw", description: "Thay đổi trạng thái sự vụ" },
            viewFinance: { name: "Xem tài chính", icon: "wallet", description: "Xem thông tin tài chính sự vụ" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export danh sách sự vụ" }
        }
    },

    "invoice-compare": {
        id: "invoice-compare",
        name: "So Sánh Đơn Hàng",
        shortName: "So Sánh",
        icon: "file-check-2",
        href: "../invoice-compare/index.html",
        description: "So sánh và đối chiếu đơn hàng",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem so sánh", icon: "eye", description: "Xem kết quả so sánh" },
            compare: { name: "Thực hiện so sánh", icon: "git-compare", description: "So sánh đơn hàng" },
            import: { name: "Import dữ liệu", icon: "upload", description: "Import đơn để so sánh" },
            export: { name: "Xuất kết quả", icon: "download", description: "Export kết quả so sánh" },
            resolve: { name: "Xử lý sai lệch", icon: "check-circle", description: "Giải quyết sai lệch" }
        }
    },

    lichsuchinhsua: {
        id: "lichsuchinhsua",
        name: "Lịch Sử Chỉnh Sửa",
        shortName: "Lịch Sử",
        icon: "bar-chart-2",
        href: "../lichsuchinhsua/index.html",
        description: "Xem lịch sử thay đổi dữ liệu hệ thống",
        adminOnly: true,
        category: "admin",
        detailedPermissions: {
            view: { name: "Xem lịch sử", icon: "eye", description: "Xem log thay đổi" },
            viewDetails: { name: "Xem chi tiết", icon: "list", description: "Xem chi tiết từng thay đổi" },
            export: { name: "Xuất báo cáo", icon: "download", description: "Export lịch sử" },
            restore: { name: "Khôi phục", icon: "rotate-ccw", description: "Khôi phục dữ liệu cũ" },
            delete: { name: "Xóa lịch sử", icon: "trash-2", description: "Xóa log lịch sử" }
        }
    }
};

// =====================================================
// CATEGORY DEFINITIONS - Phân loại trang
// =====================================================
const PAGE_CATEGORIES = {
    sales: {
        id: "sales",
        name: "Bán Hàng & Livestream",
        icon: "shopping-bag",
        color: "#10b981", // green
        order: 1
    },
    warehouse: {
        id: "warehouse",
        name: "Kho & Nhận Hàng",
        icon: "package",
        color: "#f59e0b", // amber
        order: 2
    },
    orders: {
        id: "orders",
        name: "Đơn Hàng & Thanh Toán",
        icon: "credit-card",
        color: "#6366f1", // indigo
        order: 3
    },
    reports: {
        id: "reports",
        name: "Báo Cáo & Thống Kê",
        icon: "bar-chart-2",
        color: "#8b5cf6", // violet
        order: 4
    },
    admin: {
        id: "admin",
        name: "Quản Trị Hệ Thống",
        icon: "shield",
        color: "#ef4444", // red
        order: 5
    }
};

// =====================================================
// PERMISSION TEMPLATES - Mẫu phân quyền theo vai trò
// =====================================================
const PERMISSION_TEMPLATES = {
    admin: {
        id: "admin",
        name: "Admin - Toàn quyền",
        icon: "crown",
        description: "Có tất cả quyền trong hệ thống",
        color: "#ef4444"
    },
    manager: {
        id: "manager",
        name: "Manager - Quản lý",
        icon: "briefcase",
        description: "Quản lý nhân viên, không xóa user",
        color: "#f59e0b"
    },
    "sales-team": {
        id: "sales-team",
        name: "Sales Team - Nhóm bán hàng",
        icon: "shopping-cart",
        description: "Quyền liên quan đến bán hàng và livestream",
        color: "#10b981"
    },
    "warehouse-team": {
        id: "warehouse-team",
        name: "Warehouse Team - Nhóm kho",
        icon: "package",
        description: "Quyền liên quan đến kho và nhận hàng",
        color: "#6366f1"
    },
    staff: {
        id: "staff",
        name: "Staff - Nhân viên",
        icon: "users",
        description: "Chỉ xem và chỉnh sửa cơ bản",
        color: "#3b82f6"
    },
    viewer: {
        id: "viewer",
        name: "Viewer - Chỉ xem",
        icon: "eye",
        description: "Chỉ có quyền xem, không thao tác",
        color: "#6b7280"
    },
    custom: {
        id: "custom",
        name: "Custom - Tùy chỉnh",
        icon: "sliders",
        description: "Quyền được tùy chỉnh riêng",
        color: "#8b5cf6"
    }
};

// =====================================================
// HELPER FUNCTIONS - Các hàm tiện ích
// =====================================================

/**
 * Lấy danh sách tất cả pages
 * @returns {Array} Mảng các page objects
 */
function getPagesList() {
    return Object.values(PAGES_REGISTRY);
}

/**
 * Lấy danh sách pages IDs
 * @returns {Array} Mảng các page IDs
 */
function getPagesIds() {
    return Object.keys(PAGES_REGISTRY);
}

/**
 * Lấy thông tin page theo ID
 * @param {string} pageId - ID của trang
 * @returns {Object|null} Thông tin page hoặc null nếu không tìm thấy
 */
function getPageById(pageId) {
    return PAGES_REGISTRY[pageId] || null;
}

/**
 * Lấy danh sách pages theo category
 * @param {string} categoryId - ID của category
 * @returns {Array} Mảng các page thuộc category
 */
function getPagesByCategory(categoryId) {
    return Object.values(PAGES_REGISTRY).filter(page => page.category === categoryId);
}

/**
 * Lấy danh sách pages grouped by category
 * @returns {Object} Object với key là category ID, value là mảng pages
 */
function getPagesGroupedByCategory() {
    const grouped = {};

    Object.values(PAGE_CATEGORIES).forEach(cat => {
        grouped[cat.id] = {
            ...cat,
            pages: getPagesByCategory(cat.id)
        };
    });

    return grouped;
}

/**
 * Lấy danh sách pages chỉ dành cho Admin
 * @returns {Array} Mảng các admin-only pages
 */
function getAdminOnlyPages() {
    return Object.values(PAGES_REGISTRY).filter(page => page.adminOnly);
}

/**
 * Lấy danh sách pages cho user thường (không adminOnly)
 * @returns {Array} Mảng các pages không phải admin-only
 */
function getNonAdminPages() {
    return Object.values(PAGES_REGISTRY).filter(page => !page.adminOnly);
}

/**
 * Lấy detailed permissions của một page
 * @param {string} pageId - ID của trang
 * @returns {Object|null} Object chứa detailed permissions hoặc null
 */
function getDetailedPermissions(pageId) {
    const page = PAGES_REGISTRY[pageId];
    return page ? page.detailedPermissions : null;
}

/**
 * Lấy tất cả detailed permissions của tất cả pages
 * @returns {Object} Object với key là page ID, value là detailed permissions
 */
function getAllDetailedPermissions() {
    const result = {};
    Object.entries(PAGES_REGISTRY).forEach(([pageId, page]) => {
        result[pageId] = {
            id: page.id,
            name: page.name,
            icon: page.icon,
            description: page.description,
            subPermissions: page.detailedPermissions
        };
    });
    return result;
}

/**
 * Đếm tổng số detailed permissions trong hệ thống
 * @returns {number} Tổng số permissions
 */
function getTotalPermissionsCount() {
    let count = 0;
    Object.values(PAGES_REGISTRY).forEach(page => {
        count += Object.keys(page.detailedPermissions).length;
    });
    return count;
}

/**
 * Generate permissions object cho một template
 * @param {string} templateId - ID của template
 * @returns {Object} Object chứa page permissions và detailed permissions
 */
function generateTemplatePermissions(templateId) {
    const pagePermissions = [];
    const detailedPermissions = {};

    Object.entries(PAGES_REGISTRY).forEach(([pageId, page]) => {
        detailedPermissions[pageId] = {};

        switch (templateId) {
            case "admin":
                // Admin có tất cả quyền
                pagePermissions.push(pageId);
                Object.keys(page.detailedPermissions).forEach(subKey => {
                    detailedPermissions[pageId][subKey] = true;
                });
                break;

            case "manager":
                // Manager có hầu hết quyền, trừ delete user và restore history
                pagePermissions.push(pageId);
                Object.keys(page.detailedPermissions).forEach(subKey => {
                    if (pageId === "user-management" && subKey === "delete") {
                        detailedPermissions[pageId][subKey] = false;
                    } else if (pageId === "lichsuchinhsua" && (subKey === "restore" || subKey === "delete")) {
                        detailedPermissions[pageId][subKey] = false;
                    } else {
                        detailedPermissions[pageId][subKey] = true;
                    }
                });
                break;

            case "sales-team":
                // Sales team có quyền ở sales và orders categories
                if (page.category === "sales" || page.category === "orders") {
                    pagePermissions.push(pageId);
                    Object.keys(page.detailedPermissions).forEach(subKey => {
                        // Không có quyền delete
                        detailedPermissions[pageId][subKey] = subKey !== "delete";
                    });
                }
                break;

            case "warehouse-team":
                // Warehouse team có quyền ở warehouse category
                if (page.category === "warehouse") {
                    pagePermissions.push(pageId);
                    Object.keys(page.detailedPermissions).forEach(subKey => {
                        detailedPermissions[pageId][subKey] = true;
                    });
                }
                // Thêm quyền xem ở một số trang khác
                if (page.category === "orders" || page.category === "reports") {
                    pagePermissions.push(pageId);
                    Object.keys(page.detailedPermissions).forEach(subKey => {
                        detailedPermissions[pageId][subKey] = subKey === "view" || subKey === "export";
                    });
                }
                break;

            case "staff":
                // Staff chỉ có quyền view và edit ở các trang không phải admin
                if (!page.adminOnly) {
                    pagePermissions.push(pageId);
                    Object.keys(page.detailedPermissions).forEach(subKey => {
                        detailedPermissions[pageId][subKey] =
                            subKey === "view" ||
                            subKey === "edit" ||
                            subKey === "update" ||
                            subKey.startsWith("view");
                    });
                }
                break;

            case "viewer":
                // Viewer chỉ có quyền view ở các trang không phải admin
                if (!page.adminOnly) {
                    pagePermissions.push(pageId);
                    Object.keys(page.detailedPermissions).forEach(subKey => {
                        detailedPermissions[pageId][subKey] =
                            subKey === "view" ||
                            subKey.startsWith("view");
                    });
                }
                break;

            default:
                // Custom - không có quyền mặc định
                break;
        }
    });

    return {
        pagePermissions,
        detailedPermissions
    };
}

/**
 * Kiểm tra xem một page ID có tồn tại không
 * @param {string} pageId - ID của trang
 * @returns {boolean} true nếu tồn tại
 */
function isValidPageId(pageId) {
    return !!PAGES_REGISTRY[pageId];
}

/**
 * Kiểm tra xem một permission có tồn tại trong page không
 * @param {string} pageId - ID của trang
 * @param {string} permissionKey - Key của permission
 * @returns {boolean} true nếu tồn tại
 */
function isValidPermission(pageId, permissionKey) {
    const page = PAGES_REGISTRY[pageId];
    return page && !!page.detailedPermissions[permissionKey];
}

/**
 * Lấy danh sách categories đã sắp xếp theo order
 * @returns {Array} Mảng categories đã sắp xếp
 */
function getSortedCategories() {
    return Object.values(PAGE_CATEGORIES).sort((a, b) => a.order - b.order);
}

/**
 * Validate và clean permissions object
 * @param {Object} permissions - Object permissions cần validate
 * @returns {Object} Object permissions đã được clean
 */
function validatePermissions(permissions) {
    const cleaned = {
        pagePermissions: [],
        detailedPermissions: {}
    };

    // Validate page permissions
    if (Array.isArray(permissions.pagePermissions)) {
        cleaned.pagePermissions = permissions.pagePermissions.filter(pageId =>
            isValidPageId(pageId)
        );
    }

    // Validate detailed permissions
    if (typeof permissions.detailedPermissions === 'object') {
        Object.entries(permissions.detailedPermissions).forEach(([pageId, perms]) => {
            if (isValidPageId(pageId) && typeof perms === 'object') {
                cleaned.detailedPermissions[pageId] = {};
                Object.entries(perms).forEach(([permKey, value]) => {
                    if (isValidPermission(pageId, permKey)) {
                        cleaned.detailedPermissions[pageId][permKey] = !!value;
                    }
                });
            }
        });
    }

    return cleaned;
}

// =====================================================
// SIMPLIFIED PERMISSION SYSTEM - Hệ thống quyền đơn giản
// Chỉ dùng detailedPermissions, bỏ pagePermissions
// =====================================================

/**
 * Kiểm tra user có quyền truy cập trang không
 * User có quyền nếu có ít nhất 1 detailed permission = true cho trang đó
 *
 * @param {Object} detailedPermissions - Object detailedPermissions của user
 * @param {string} pageId - ID của trang cần kiểm tra
 * @returns {boolean} true nếu có quyền truy cập
 */
function hasPageAccess(detailedPermissions, pageId) {
    if (!detailedPermissions || !detailedPermissions[pageId]) {
        return false;
    }

    const pagePerms = detailedPermissions[pageId];
    return Object.values(pagePerms).some(value => value === true);
}

/**
 * Lấy danh sách các trang mà user có quyền truy cập
 *
 * @param {Object} detailedPermissions - Object detailedPermissions của user
 * @returns {Array} Mảng các page IDs mà user có quyền
 */
function getAccessiblePages(detailedPermissions) {
    if (!detailedPermissions) return [];

    return Object.entries(detailedPermissions)
        .filter(([pageId, perms]) => {
            return Object.values(perms).some(value => value === true);
        })
        .map(([pageId]) => pageId);
}

/**
 * Kiểm tra user có quyền cụ thể không
 *
 * @param {Object} detailedPermissions - Object detailedPermissions của user
 * @param {string} pageId - ID của trang
 * @param {string} permissionKey - Key của quyền cần kiểm tra (view, edit, delete, etc.)
 * @returns {boolean} true nếu có quyền
 */
function hasPermission(detailedPermissions, pageId, permissionKey) {
    if (!detailedPermissions || !detailedPermissions[pageId]) {
        return false;
    }

    return detailedPermissions[pageId][permissionKey] === true;
}

/**
 * Đếm số quyền đã được cấp cho user
 *
 * @param {Object} detailedPermissions - Object detailedPermissions của user
 * @returns {Object} { total, granted, pages }
 */
function countGrantedPermissions(detailedPermissions) {
    const result = {
        total: getTotalPermissionsCount(),
        granted: 0,
        pages: 0
    };

    if (!detailedPermissions) return result;

    const pagesWithAccess = new Set();

    Object.entries(detailedPermissions).forEach(([pageId, perms]) => {
        Object.entries(perms).forEach(([key, value]) => {
            if (value === true) {
                result.granted++;
                pagesWithAccess.add(pageId);
            }
        });
    });

    result.pages = pagesWithAccess.size;
    return result;
}

/**
 * Tạo full permissions cho tất cả pages (tất cả quyền = true)
 * Dùng cho migration hoặc tạo admin user
 *
 * @returns {Object} detailedPermissions với tất cả quyền = true
 */
function generateFullDetailedPermissions() {
    const fullPerms = {};

    Object.entries(PAGES_REGISTRY).forEach(([pageId, page]) => {
        fullPerms[pageId] = {};

        if (page.detailedPermissions) {
            Object.keys(page.detailedPermissions).forEach(permKey => {
                fullPerms[pageId][permKey] = true;
            });
        }
    });

    return fullPerms;
}

/**
 * Tạo empty permissions (tất cả quyền = false)
 * Dùng khi tạo user mới
 *
 * @returns {Object} detailedPermissions với tất cả quyền = false
 */
function generateEmptyDetailedPermissions() {
    const emptyPerms = {};

    Object.entries(PAGES_REGISTRY).forEach(([pageId, page]) => {
        emptyPerms[pageId] = {};

        if (page.detailedPermissions) {
            Object.keys(page.detailedPermissions).forEach(permKey => {
                emptyPerms[pageId][permKey] = false;
            });
        }
    });

    return emptyPerms;
}

// =====================================================
// BACKWARD COMPATIBILITY - Tương thích ngược
// =====================================================

/**
 * Tạo PAGE_PERMISSIONS_CONFIG tương thích với code cũ
 * @returns {Array} Mảng config tương thích với page-permissions-ui.js cũ
 */
function getLegacyPagePermissionsConfig() {
    return Object.values(PAGES_REGISTRY).map(page => ({
        id: page.id,
        icon: page.icon,
        name: page.name,
        description: page.description,
        adminOnly: page.adminOnly
    }));
}

/**
 * Tạo DETAILED_PERMISSIONS tương thích với code cũ
 * @returns {Object} Object tương thích với detailed-permissions-config.js cũ
 */
function getLegacyDetailedPermissions() {
    return getAllDetailedPermissions();
}

// =====================================================
// EXPORTS
// =====================================================

// Export tất cả constants và functions
if (typeof window !== 'undefined') {
    window.PAGES_REGISTRY = PAGES_REGISTRY;
    window.PAGE_CATEGORIES = PAGE_CATEGORIES;
    window.PERMISSION_TEMPLATES = PERMISSION_TEMPLATES;

    // Backward compatibility - DETAILED_PERMISSIONS for legacy code
    window.DETAILED_PERMISSIONS = getAllDetailedPermissions();

    // Helper functions
    window.PermissionsRegistry = {
        getPagesList,
        getPagesIds,
        getPageById,
        getPagesByCategory,
        getPagesGroupedByCategory,
        getAdminOnlyPages,
        getNonAdminPages,
        getDetailedPermissions,
        getAllDetailedPermissions,
        getTotalPermissionsCount,
        generateTemplatePermissions,
        isValidPageId,
        isValidPermission,
        getSortedCategories,
        validatePermissions,
        getLegacyPagePermissionsConfig,
        getLegacyDetailedPermissions,
        // Simplified permission system
        hasPageAccess,
        getAccessiblePages,
        hasPermission,
        countGrantedPermissions,
        generateFullDetailedPermissions,
        generateEmptyDetailedPermissions
    };
}

console.log("[Permissions Registry] Loaded successfully with", Object.keys(PAGES_REGISTRY).length, "pages and", getTotalPermissionsCount(), "permissions");
