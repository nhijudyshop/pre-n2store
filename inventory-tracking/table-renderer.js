// =====================================================
// TABLE RENDERER - INVENTORY TRACKING
// Phase 3: Will be fully implemented
// =====================================================

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// =====================================================

const CHINESE_TO_VIETNAMESE = {
    // =====================================================
    // COLORS - MÀU SẮC (颜色)
    // =====================================================
    // Màu cơ bản
    '黑色': 'Đen',
    '黑': 'Đen',
    '白色': 'Trắng',
    '白': 'Trắng',
    '红色': 'Đỏ',
    '红': 'Đỏ',
    '蓝色': 'Xanh dương',
    '蓝': 'Xanh dương',
    '绿色': 'Xanh lá',
    '绿': 'Xanh lá',
    '黄色': 'Vàng',
    '黄': 'Vàng',
    '紫色': 'Tím',
    '紫': 'Tím',
    '粉色': 'Hồng',
    '粉红色': 'Hồng phấn',
    '粉': 'Hồng',
    '灰色': 'Xám',
    '灰': 'Xám',
    '棕色': 'Nâu',
    '棕': 'Nâu',
    '橙色': 'Cam',
    '橙': 'Cam',
    '桔色': 'Cam',
    '橘色': 'Cam',

    // Màu đặc biệt / Hot trend
    '咖啡色': 'Cà phê',
    '咖色': 'Nâu cà phê',
    '咖': 'Nâu cà phê',
    '米色': 'Kem',
    '米白色': 'Trắng kem',
    '米白': 'Trắng kem',
    '米': 'Kem',
    '杏色': 'Hồng mơ',
    '杏': 'Hồng mơ',
    '酱色': 'Nâu đậm',
    '酱红色': 'Đỏ nâu',
    '酱': 'Nâu đậm',
    '卡其色': 'Khaki',
    '卡其': 'Khaki',
    '驼色': 'Nâu lạc đà',
    '驼': 'Lạc đà',
    '藏青色': 'Xanh than',
    '藏青': 'Xanh than',
    '酒红色': 'Đỏ rượu vang',
    '酒红': 'Đỏ rượu',
    '墨绿色': 'Xanh rêu',
    '墨绿': 'Xanh rêu',
    '军绿色': 'Xanh quân đội',
    '军绿': 'Xanh lính',
    '焦糖色': 'Caramel',
    '焦糖': 'Caramel',
    '牛油果色': 'Xanh bơ',
    '牛油果': 'Xanh bơ',
    '奶白': 'Trắng sữa',
    '奶油': 'Kem sữa',
    '香槟色': 'Champagne',
    '香槟': 'Champagne',
    '银色': 'Bạc',
    '银': 'Bạc',
    '金色': 'Vàng gold',
    '金': 'Vàng gold',
    '玫红': 'Hồng cánh sen',
    '玫瑰红': 'Hồng hoa hồng',
    '宝蓝': 'Xanh hoàng gia',
    '天蓝': 'Xanh da trời',
    '湖蓝': 'Xanh hồ',
    '雾蓝': 'Xanh sương mù',
    '烟灰': 'Xám khói',
    '炭灰': 'Xám than',
    '花灰': 'Xám hoa',
    '杂灰': 'Xám đốm',
    '姜黄': 'Vàng nghệ',
    '土黄': 'Vàng đất',
    '芥末黄': 'Vàng mù tạt',

    // Tiền tố màu
    '浅': 'Nhạt',
    '深': 'Đậm',
    '浅灰': 'Xám nhạt',
    '深灰': 'Xám đậm',
    '浅蓝': 'Xanh nhạt',
    '深蓝': 'Xanh đậm',
    '浅绿': 'Xanh lá nhạt',
    '深绿': 'Xanh lá đậm',
    '浅粉': 'Hồng nhạt',
    '深粉': 'Hồng đậm',
    '浅紫': 'Tím nhạt',
    '深紫': 'Tím đậm',
    '浅咖': 'Nâu nhạt',
    '深咖': 'Nâu đậm',

    // Viết tắt màu (phổ biến trong hóa đơn viết tay)
    '兰': 'Xanh dương',  // Viết tắt của 蓝色

    // =====================================================
    // PATTERNS - HỌA TIẾT
    // =====================================================
    '条': 'Sọc',
    '条纹': 'Sọc',
    '纹': 'Vân',
    '格': 'Caro',
    '格子': 'Caro',
    '花': 'Hoa',
    '碎花': 'Hoa nhỏ',
    '大花': 'Hoa lớn',
    '点': 'Chấm',
    '波点': 'Chấm bi',
    '印': 'In',
    '印花': 'In hoa',
    '刺绣': 'Thêu',
    '绣花': 'Thêu hoa',
    '山茶花': 'Hoa sơn trà',
    '皇冠': 'Vương miện',
    '字母': 'Chữ cái',
    '数字': 'Số',
    '卡通': 'Hoạt hình',

    // =====================================================
    // MATERIALS - CHẤT LIỆU (面料)
    // =====================================================
    '棉': 'Cotton',
    '纯棉': 'Cotton 100%',
    '全棉': 'Cotton 100%',
    '麻': 'Lanh',
    '棉麻': 'Cotton lanh',
    '丝': 'Lụa',
    '真丝': 'Lụa thật',
    '绒': 'Nhung',
    '天鹅绒': 'Nhung thiên nga',
    '金丝绒': 'Nhung vàng',
    '毛': 'Len',
    '羊毛': 'Len cừu',
    '羊绒': 'Len cashmere',
    '皮': 'Da',
    '皮革': 'Da thuộc',
    '革': 'Da thuộc',
    '牛仔': 'Vải jean',
    '雪纺': 'Voan',
    '涤纶': 'Polyester',
    '锦纶': 'Nylon',
    '氨纶': 'Spandex',
    '蕾丝': 'Ren',
    '网纱': 'Lưới',
    '针织': 'Dệt kim',
    '梭织': 'Dệt thoi',
    '弹力': 'Co giãn',

    // =====================================================
    // CLOTHING TYPES - LOẠI TRANG PHỤC (款式)
    // =====================================================
    // Áo
    '上衣': 'Áo',
    'T恤': 'Áo thun',
    'T恤衫': 'Áo thun',
    '衬衫': 'Áo sơ mi',
    '衬衣': 'Áo sơ mi',
    '外套': 'Áo khoác',
    '夹克': 'Áo jacket',
    '风衣': 'Áo măng tô',
    '大衣': 'Áo khoác dài',
    '棉衣': 'Áo cotton',
    '棉袄': 'Áo bông',
    '羽绒服': 'Áo phao',
    '卫衣': 'Áo nỉ',
    '毛衣': 'Áo len',
    '针织衫': 'Áo len',
    '打底衫': 'Áo lót',
    '打底': 'Áo lót',
    '马甲': 'Áo gile',
    '背心': 'Áo ba lỗ',
    '吊带': 'Dây đeo',
    '吊带衫': 'Áo hai dây',
    '西装': 'Vest',
    '西服': 'Vest',
    '开衫': 'Áo cardigan',

    // Quần
    '裤': 'Quần',
    '裤子': 'Quần',
    '短裤': 'Quần short',
    '长裤': 'Quần dài',
    '牛仔裤': 'Quần jean',
    '西裤': 'Quần tây',
    '休闲裤': 'Quần casual',
    '运动裤': 'Quần thể thao',
    '阔腿裤': 'Quần ống rộng',
    '喇叭裤': 'Quần ống loe',
    '直筒裤': 'Quần ống đứng',
    '九分裤': 'Quần 9 phân',
    '七分裤': 'Quần 7 phân',
    '五分裤': 'Quần 5 phân',
    '打底裤': 'Quần legging',

    // Váy
    '裙': 'Váy',
    '裙子': 'Váy',
    '连衣裙': 'Váy liền',
    '半身裙': 'Chân váy',
    '短裙': 'Váy ngắn',
    '长裙': 'Váy dài',
    '百褶裙': 'Váy xếp ly',
    '包臀裙': 'Váy bút chì',
    'A字裙': 'Váy chữ A',
    '蓬蓬裙': 'Váy xòe',

    // Bộ đồ
    '套装': 'Đồ bộ',
    '两件套': 'Bộ 2 món',
    '三件套': 'Bộ 3 món',
    '四件套': 'Bộ 4 món',
    '套': 'Bộ',
    '睡衣': 'Đồ ngủ',
    '家居服': 'Đồ mặc nhà',
    '运动套装': 'Bộ thể thao',

    // Phụ kiện
    '帽子': 'Mũ',
    '围巾': 'Khăn choàng',
    '手套': 'Găng tay',
    '袜子': 'Tất',
    '皮带': 'Thắt lưng',
    '腰带': 'Dây lưng',
    '包': 'Túi',
    '手提包': 'Túi xách',
    '单肩包': 'Túi đeo vai',
    '斜挎包': 'Túi đeo chéo',
    '双肩包': 'Balo',

    // =====================================================
    // DESIGN DETAILS - CHI TIẾT THIẾT KẾ (细节)
    // =====================================================
    // Cổ áo
    '领': 'Cổ',
    '圆领': 'Cổ tròn',
    'V领': 'Cổ chữ V',
    '高领': 'Cổ cao',
    '翻领': 'Cổ lật',
    '方领': 'Cổ vuông',
    '一字领': 'Cổ ngang',
    '娃娃领': 'Cổ búp bê',
    '立领': 'Cổ đứng',
    '半高领': 'Cổ lọ',
    '堆堆领': 'Cổ đống',

    // Tay áo
    '袖': 'Tay áo',
    '长袖': 'Tay dài',
    '短袖': 'Tay ngắn',
    '七分袖': 'Tay 7 phân',
    '无袖': 'Không tay',
    '泡泡袖': 'Tay bồng',
    '蝙蝠袖': 'Tay dơi',
    '喇叭袖': 'Tay loe',
    '灯笼袖': 'Tay lồng đèn',

    // Dáng / Kiểu
    '短款': 'Dáng ngắn',
    '中长款': 'Dáng trung',
    '长款': 'Dáng dài',
    '修身': 'Ôm body',
    '宽松': 'Rộng',
    '直筒': 'Ống đứng',
    '交叉': 'Chéo',
    '斜角': 'Xéo góc',
    '系带': 'Dây buộc',
    '拉链': 'Khoá kéo',
    '纽扣': 'Khuy',
    '扣子': 'Nút',
    '铆钉': 'Đinh tán',
    '流苏': 'Tua rua',
    '荷叶边': 'Viền lượn sóng',
    '木耳边': 'Viền bèo',
    '蝴蝶结': 'Nơ',
    '腰带': 'Đai lưng',
    '口袋': 'Túi',
    '开叉': 'Xẻ',
    '褶皱': 'Xếp ly',
    '收腰': 'Eo',

    // =====================================================
    // SIZES - KÍCH THƯỚC
    // =====================================================
    '均码': 'Freesize',
    'F': 'Freesize',
    '均': 'Freesize',
    'S码': 'Size S',
    'M码': 'Size M',
    'L码': 'Size L',
    'XL码': 'Size XL',
    'XXL码': 'Size XXL',
    '大码': 'Size lớn',
    '加大码': 'Size cực lớn',
    '件': 'Cái',
    '条': 'Chiếc',
    '手': '1 ri',

    // =====================================================
    // ORDER STATUS - TÌNH TRẠNG ĐƠN HÀNG
    // =====================================================
    '现货': 'Có sẵn',
    '预售': 'Pre-order',
    '欠货': 'Nợ hàng',
    '退货': 'Trả hàng',
    '拿货': 'Lấy hàng',
    '补货': 'Bổ sung hàng',
    '断货': 'Hết hàng',
    '缺货': 'Thiếu hàng',

    // =====================================================
    // COMMON TERMS - TỪ THÔNG DỤNG
    // =====================================================
    '色': '',
    '款': 'Kiểu',
    '新款': 'Mẫu mới',
    '热卖': 'Bán chạy',
    '爆款': 'Hot',
    '苏': 'Tô',
    '号': 'Số',
    '小计': 'Tạm tính',
    '合计': 'Tổng cộng',
    '销售合计': 'Tổng bán',
    '数量': 'Số lượng',
    '单价': 'Đơn giá',
    '金额': 'Thành tiền'
};

/**
 * Translate Chinese text to Vietnamese
 */
function translateToVietnamese(text) {
    if (!text) return text;

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE).sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

/**
 * Format color details for display in table
 * @param {Array} mauSac - Array of {mau, soLuong} objects
 * @returns {string} Formatted color string
 */
function formatColors(mauSac) {
    if (!mauSac || mauSac.length === 0) {
        return '<span class="text-muted">-</span>';
    }
    return mauSac.map(c => `${c.mau} (${c.soLuong})`).join(', ');
}

/**
 * Render shipments list
 */
function renderShipments(shipments) {
    const container = document.getElementById('shipmentsContainer');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    if (!container) return;

    // Hide loading
    if (loadingState) loadingState.classList.add('hidden');

    // Clear previous content (except loading/empty states)
    const cards = container.querySelectorAll('.shipment-card');
    cards.forEach(card => card.remove());

    // Show empty state if no data
    if (!shipments || shipments.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render each shipment
    shipments.forEach(shipment => {
        const card = createShipmentCard(shipment);
        container.appendChild(card);
    });

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Create shipment card element
 */
function createShipmentCard(shipment) {
    const card = document.createElement('div');
    card.className = 'shipment-card';
    card.dataset.id = shipment.id;

    const canEdit = permissionHelper?.can('edit_shipment');
    const canDelete = permissionHelper?.can('delete_shipment');
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');
    const canViewNote = permissionHelper?.can('view_ghiChuAdmin');

    // Build packages info string
    const packages = shipment.kienHang || [];
    const totalKg = packages.reduce((sum, p) => sum + (p.soKg || 0), 0);
    const packageWeights = packages.map(p => `${p.soKg} KG`).join(', ');
    const packagesInfo = packages.length > 0
        ? `${packages.length} Kiện : ${packageWeights} | Tổng ${formatNumber(totalKg)} KG`
        : '0 Kiện';

    card.innerHTML = `
        <div class="shipment-header">
            <div class="shipment-date-packages">
                <i data-lucide="calendar"></i>
                <span class="shipment-date-text">Ngày giao: ${formatDateDisplay(shipment.ngayDiHang)}</span>
                <span class="shipment-separator">-</span>
                <span class="shipment-packages-badge">
                    <i data-lucide="box"></i>
                    ${packagesInfo}
                </span>
            </div>
            <div class="shipment-actions">
                ${canEdit ? `
                    <button class="btn btn-sm btn-outline" onclick="editShipment('${shipment.id}')" title="Sửa">
                        <i data-lucide="edit"></i>
                    </button>
                ` : ''}
                ${canDelete ? `
                    <button class="btn btn-sm btn-outline" onclick="deleteShipment('${shipment.id}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-outline" onclick="updateShortage('${shipment.id}')" title="Cập nhật thiếu">
                    <i data-lucide="clipboard-check"></i>
                </button>
            </div>
        </div>
        <div class="shipment-body">
            ${renderInvoicesSection(shipment)}
            ${canViewNote && shipment.ghiChuAdmin ? renderAdminNoteSection(shipment) : ''}
        </div>
    `;

    return card;
}

/**
 * Render packages section
 */
function renderPackagesSection(shipment) {
    const packages = shipment.kienHang || [];
    const totalKg = packages.reduce((sum, p) => sum + (p.soKg || 0), 0);

    // Render badges inline with header
    const packageBadges = packages.map(p => `
        <span class="package-badge">
            <i data-lucide="package"></i>
            Kiện ${p.stt}: ${p.soKg} kg
        </span>
    `).join('');

    return `
        <div class="shipment-section packages-inline">
            <div class="packages-header-inline">
                <i data-lucide="box"></i>
                <span class="packages-summary">KIỆN HÀNG: ${packages.length} kiện | Tổng: ${formatNumber(totalKg)} kg</span>
                <div class="packages-badges-inline">
                    ${packageBadges}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render invoices section with shipping costs as column
 */
function renderInvoicesSection(shipment) {
    const invoices = shipment.hoaDon || [];
    const costs = shipment.chiPhiHangVe || [];
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');

    if (invoices.length === 0) {
        return `
            <div class="shipment-section">
                <div class="section-title">
                    <i data-lucide="receipt"></i>
                    <span>HÓA ĐƠN NHÀ CUNG CẤP</span>
                </div>
                <p style="color: var(--gray-500);">Chưa có hóa đơn</p>
            </div>
        `;
    }

    // Support both tongTienHD (new) and tongTien (old) field names
    const totalAmount = invoices.reduce((sum, hd) => sum + (hd.tongTienHD || hd.tongTien || 0), 0);
    // Calculate tongMon from products if not available
    const totalItems = invoices.reduce((sum, hd) => {
        if (hd.tongMon) return sum + hd.tongMon;
        // Fallback: calculate from products
        const products = hd.sanPham || [];
        return sum + products.reduce((pSum, p) => pSum + (p.soLuong || 0), 0);
    }, 0);
    const totalShortage = invoices.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
    const totalCost = costs.reduce((sum, c) => sum + (c.soTien || 0), 0);

    // Build invoice rows with product lines
    // Costs are for the entire shipment, listed sequentially by absolute row index
    let allRows = [];
    let absoluteRowIdx = 0; // Track row index across all invoices for cost assignment

    invoices.forEach((hd, invoiceIdx) => {
        const products = hd.sanPham || [];
        const imageCount = hd.anhHoaDon?.length || 0;
        const invoiceClass = invoiceIdx % 2 === 0 ? 'invoice-even' : 'invoice-odd';

        // Calculate tongMon for this invoice (fallback from products if not set)
        const invoiceTongMon = hd.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
        const invoiceTongTienHD = hd.tongTienHD || hd.tongTien || 0;

        // Check if invoice has subInvoice
        const hasSubInvoice = !!hd.subInvoice;

        if (products.length === 0) {
            // No products - single row
            const costItem = canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
            allRows.push(renderProductRow({
                invoiceIdx,
                invoiceClass,
                sttNCC: hd.sttNCC,
                tenNCC: hd.tenNCC || '',
                productIdx: 0,
                product: null,
                isFirstRow: true,
                isLastRow: true,
                rowSpan: 1,
                tongTienHD: invoiceTongTienHD,
                tongMon: invoiceTongMon,
                soMonThieu: hd.soMonThieu,
                imageCount,
                ghiChu: hd.ghiChu,
                shipmentId: shipment.id,
                invoiceId: hd.id || invoiceIdx,  // Fallback to index if no id
                costItem,
                canViewCost,
                hasSubInvoice,
                subInvoice: hd.subInvoice
            }));
            absoluteRowIdx++;
        } else {
            // Multiple products - cost assigned by absolute row index
            products.forEach((product, productIdx) => {
                const costItem = canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
                allRows.push(renderProductRow({
                    invoiceIdx,
                    invoiceClass,
                    sttNCC: hd.sttNCC,
                    tenNCC: hd.tenNCC || '',
                    productIdx,
                    product,
                    isFirstRow: productIdx === 0,
                    isLastRow: productIdx === products.length - 1,
                    rowSpan: products.length,
                    tongTienHD: invoiceTongTienHD,
                    tongMon: invoiceTongMon,
                    soMonThieu: hd.soMonThieu,
                    imageCount,
                    ghiChu: hd.ghiChu,
                    shipmentId: shipment.id,
                    invoiceId: hd.id || invoiceIdx,  // Fallback to index if no id
                    costItem,
                    canViewCost,
                    hasSubInvoice,
                    subInvoice: hd.subInvoice
                }));
                absoluteRowIdx++;
            });
        }
    });

    return `
        <div class="shipment-section shipment-table-section">
            <div class="table-container">
                <table class="invoice-table invoice-table-bordered">
                    <thead>
                        <tr>
                            <th class="col-ncc">NCC</th>
                            <th class="col-stt">STT</th>
                            <th class="col-sku">Mã hàng</th>
                            <th class="col-desc">Mô tả</th>
                            <th class="col-colors">Chi tiết màu sắc</th>
                            <th class="col-qty text-center">Tổng SL</th>
                            <th class="col-price text-right">Đơn giá</th>
                            <th class="col-amount text-right">Tiền HĐ</th>
                            <th class="col-total text-center">Tổng Món</th>
                            <th class="col-shortage text-center">Thiếu</th>
                            <th class="col-image text-center">Ảnh</th>
                            <th class="col-invoice-note">Ghi Chú</th>
                            ${canViewCost ? '<th class="col-cost text-right">Chi Phí</th>' : ''}
                            ${canViewCost ? '<th class="col-cost-note">Ghi Chú CP</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${allRows.join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="7" class="text-right"><strong>TỔNG:</strong></td>
                            <td class="text-right"><strong class="total-amount">${formatNumber(totalAmount)}</strong></td>
                            <td class="text-center"><strong class="total-items">${formatNumber(totalItems)}</strong></td>
                            <td class="text-center"><strong>${totalShortage > 0 ? formatNumber(totalShortage) : '-'}</strong></td>
                            <td></td>
                            <td></td>
                            ${canViewCost ? `<td class="text-right cost-total-cell"><strong class="total-cost">${formatNumber(totalCost)}</strong></td>` : ''}
                            ${canViewCost ? '<td class="cost-note-cell"></td>' : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render a single product row
 */
function renderProductRow(opts) {
    const {
        invoiceIdx, invoiceClass, sttNCC, tenNCC, productIdx, product,
        isFirstRow, isLastRow, rowSpan,
        tongTienHD, tongMon, soMonThieu, imageCount, ghiChu,
        shipmentId, invoiceId, costItem, canViewCost,
        hasSubInvoice, subInvoice
    } = opts;

    const rowClass = `${invoiceClass} ${isLastRow ? 'invoice-last-row' : ''}`;

    // Extract product details for new columns
    const maSP = product?.maSP || '-';
    const moTa = product?.moTa || '-';
    const colorDetails = product?.mauSac?.length > 0
        ? formatColors(product.mauSac)
        : (product?.soMau ? `${product.soMau} màu` : '-');
    const tongSoLuong = product?.tongSoLuong || product?.soLuong || '-';
    const giaDonVi = product?.giaDonVi || 0;

    // For rowspanned cells (rendered on first row), always apply invoice-border since their
    // bottom border appears at the end of their rowspan (which is the last row of invoice)
    // For non-rowspanned cells (STT, Products), only apply on last row
    const rowspanBorderClass = 'invoice-border';
    const borderClass = isLastRow ? 'invoice-border' : '';

    // Sub-invoice indicator and click handler
    const subInvoiceIndicator = hasSubInvoice && isFirstRow ? `<span class="sub-invoice-indicator" title="Có hóa đơn phụ - Click để xem">▼</span>` : '';
    const nccClickHandler = hasSubInvoice && isFirstRow ? `onclick="showSubInvoice('${shipmentId}', ${invoiceIdx}); event.stopPropagation();" style="cursor: pointer;"` : '';
    const nccClass = hasSubInvoice ? 'has-sub-invoice' : '';

    // Display NCC with tenNCC if available
    const nccDisplay = tenNCC
        ? `<strong>${sttNCC}</strong><br><span class="ncc-name">${tenNCC}</span>`
        : `<strong>${sttNCC}</strong>`;

    return `
        <tr class="${rowClass}">
            ${isFirstRow ? `<td class="col-ncc ${rowspanBorderClass} ${nccClass}" rowspan="${rowSpan}" ${nccClickHandler}>${nccDisplay}${subInvoiceIndicator}</td>` : ''}
            <td class="col-stt ${borderClass}">${product ? productIdx + 1 : '-'}</td>
            <td class="col-sku ${borderClass}">${maSP}</td>
            <td class="col-desc ${borderClass}">${moTa}</td>
            <td class="col-colors ${borderClass}">${colorDetails}</td>
            <td class="col-qty text-center ${borderClass}">${tongSoLuong !== '-' ? formatNumber(tongSoLuong) : '-'}</td>
            <td class="col-price text-right ${borderClass}">${giaDonVi > 0 ? formatNumber(giaDonVi) : '-'}</td>
            ${isFirstRow ? `
                <td class="col-amount text-right ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="amount-value">${formatNumber(tongTienHD)}</strong>
                </td>
                <td class="col-total text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="total-value">${formatNumber(tongMon)}</strong>
                </td>
                <td class="col-shortage text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="shortage-value">${soMonThieu > 0 ? formatNumber(soMonThieu) : '-'}</strong>
                </td>
                <td class="col-image text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    ${imageCount > 0 ? `
                        <span class="image-count" onclick="viewInvoiceImages('${shipmentId}', '${invoiceId}')">
                            <i data-lucide="image"></i>
                            ${imageCount}
                        </span>
                    ` : '-'}
                </td>
                <td class="col-invoice-note ${rowspanBorderClass}" rowspan="${rowSpan}">
                    ${ghiChu ? `<span class="invoice-note-text">${ghiChu}</span>` : ''}
                </td>
            ` : ''}
            ${canViewCost ? `
                <td class="col-cost text-right cost-cell">
                    ${costItem ? `<strong class="cost-value">${formatNumber(costItem.soTien)}</strong>` : ''}
                </td>
                <td class="col-cost-note cost-note-cell">
                    ${costItem ? `<span class="cost-label">${costItem.loai}</span>` : ''}
                </td>
            ` : ''}
        </tr>
    `;
}


/**
 * Render admin note section
 */
function renderAdminNoteSection(shipment) {
    if (!shipment.ghiChuAdmin) return '';

    return `
        <div class="admin-note-section">
            <div class="admin-note-label">
                <i data-lucide="lock"></i> Ghi Chú Admin:
            </div>
            <div class="admin-note-content">${shipment.ghiChuAdmin}</div>
        </div>
    `;
}

/**
 * View invoice images
 */
function viewInvoiceImages(shipmentId, invoiceIdentifier) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    // Find invoice by id, sttNCC, or index
    let invoiceIdx = -1;

    // Check if invoiceIdentifier is a number or numeric string (index)
    const numericId = typeof invoiceIdentifier === 'number' ? invoiceIdentifier : parseInt(invoiceIdentifier, 10);
    if (!isNaN(numericId) && numericId >= 0 && numericId < (shipment.hoaDon?.length || 0)) {
        // It's a valid index
        invoiceIdx = numericId;
    } else if (typeof invoiceIdentifier === 'string') {
        // Try to find by id or sttNCC
        invoiceIdx = shipment.hoaDon?.findIndex(hd =>
            hd.id === invoiceIdentifier || String(hd.sttNCC) === invoiceIdentifier
        ) ?? -1;
    }

    if (invoiceIdx === -1 || !shipment.hoaDon?.[invoiceIdx]) {
        toast.info('Không tìm thấy hóa đơn');
        return;
    }

    const invoice = shipment.hoaDon[invoiceIdx];
    if (!invoice.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn');
        return;
    }

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = invoice.anhHoaDon.map((url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn" onclick="window.open('${url}', '_blank')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `).join('');
    }

    // Store current invoice index for re-render after delete
    modal.dataset.currentInvoiceIdx = invoiceIdx;
    openModal('modalImageViewer');
}

/**
 * Delete an image from invoice
 */
async function deleteInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find(s => s.id === shipmentId);
        if (!shipment) {
            toast.error('Không tìm thấy shipment');
            return;
        }

        if (invoiceIdx < 0 || invoiceIdx >= (shipment.hoaDon?.length || 0)) {
            toast.error('Không tìm thấy hóa đơn');
            return;
        }

        const invoice = shipment.hoaDon[invoiceIdx];
        if (!invoice.anhHoaDon || imageIndex >= invoice.anhHoaDon.length) {
            toast.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...invoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update hoaDon array
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...invoice,
            anhHoaDon: updatedImages
        };

        // Update Firestore
        await db.collection('inventory_tracking').doc(shipmentId).update({
            hoaDon: updatedHoaDon,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        toast.success('Đã xóa ảnh');
        console.log('[RENDERER] Image deleted from invoice');

    } catch (error) {
        console.error('[RENDERER] Delete image error:', error);
        toast.error('Lỗi xóa ảnh: ' + error.message);
    }
}

/**
 * Show sub-invoice modal
 * Displays the sub-invoice (invoice 2) in a modal table
 */
function showSubInvoice(shipmentId, invoiceIdx) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
        toast.info('Không tìm thấy shipment');
        return;
    }

    const invoice = shipment.hoaDon?.[invoiceIdx];
    if (!invoice || !invoice.subInvoice) {
        toast.info('Không có hóa đơn phụ');
        return;
    }

    const subInvoice = invoice.subInvoice;
    const products = subInvoice.sanPham || [];

    // Build product rows
    let productRows = '';
    products.forEach((product, idx) => {
        const text = product.rawText_vi || product.rawText || 'Sản phẩm ' + (idx + 1);
        productRows += '<tr><td style="text-align:center;padding:8px;border:1px solid #ddd;">' + (idx + 1) + '</td><td style="padding:8px;border:1px solid #ddd;">' + text + '</td></tr>';
    });

    const tongMon = subInvoice.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
    const tongTienHD = subInvoice.tongTienHD || 0;
    const imageCount = subInvoice.anhHoaDon?.length || 0;

    // Build modal HTML
    const modalHtml =
        '<div id="subInvoiceModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;" onclick="if(event.target===this)window.closeSubInvoiceModal()">' +
            '<div style="background:white;border-radius:12px;max-width:800px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
                '<div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:16px 20px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">' +
                    '<h2 style="margin:0;font-size:18px;">Hóa Đơn Phụ - NCC ' + invoice.sttNCC + '</h2>' +
                    '<button onclick="window.closeSubInvoiceModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:20px;">×</button>' +
                '</div>' +
                '<div style="padding:20px;">' +
                    '<div style="margin-bottom:15px;padding:12px;background:#f5f5f5;border-radius:8px;">' +
                        '<p style="margin:5px 0;"><strong>Tiền HĐ:</strong> ' + tongTienHD.toLocaleString() + ' ¥</p>' +
                        '<p style="margin:5px 0;"><strong>Tổng món:</strong> ' + tongMon + '</p>' +
                        (subInvoice.ghiChu ? '<p style="margin:5px 0;"><strong>Ghi chú:</strong> ' + subInvoice.ghiChu + '</p>' : '') +
                        (imageCount > 0 ? '<p style="margin:5px 0;"><strong>Ảnh:</strong> <span style="cursor:pointer;color:#3b82f6;" onclick="window.viewSubInvoiceImages(\'' + shipmentId + '\',' + invoiceIdx + ')">' + imageCount + ' ảnh (click để xem)</span></p>' : '') +
                    '</div>' +
                    '<table style="width:100%;border-collapse:collapse;">' +
                        '<thead><tr style="background:#f0f0f0;"><th style="padding:10px;border:1px solid #ddd;width:60px;">STT</th><th style="padding:10px;border:1px solid #ddd;">Chi Tiết Sản Phẩm</th></tr></thead>' +
                        '<tbody>' + (productRows || '<tr><td colspan="2" style="text-align:center;padding:20px;">Không có sản phẩm</td></tr>') + '</tbody>' +
                        '<tfoot><tr style="background:#e8f4e8;font-weight:bold;"><td style="padding:10px;border:1px solid #ddd;text-align:right;">TỔNG:</td><td style="padding:10px;border:1px solid #ddd;">' + tongMon + ' món - ' + tongTienHD.toLocaleString() + ' ¥</td></tr></tfoot>' +
                    '</table>' +
                '</div>' +
            '</div>' +
        '</div>';

    // Remove existing modal
    const existing = document.getElementById('subInvoiceModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

/**
 * Close sub-invoice modal
 */
function closeSubInvoiceModal() {
    const modal = document.getElementById('subInvoiceModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

/**
 * View sub-invoice images
 */
function viewSubInvoiceImages(shipmentId, invoiceIdx) {
    const shipment = globalState.shipments.find(s => s.id === shipmentId);
    if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice?.anhHoaDon?.length) {
        toast.info('Không có ảnh hóa đơn phụ');
        return;
    }

    const images = shipment.hoaDon[invoiceIdx].subInvoice.anhHoaDon;

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = images.map((url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn phụ" onclick="window.open('${url}', '_blank')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteSubInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `).join('');
    }

    openModal('modalImageViewer');
}

/**
 * Delete sub-invoice image
 */
async function deleteSubInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find(s => s.id === shipmentId);
        if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice) {
            toast.error('Không tìm thấy hóa đơn phụ');
            return;
        }

        const subInvoice = shipment.hoaDon[invoiceIdx].subInvoice;
        if (!subInvoice.anhHoaDon || imageIndex >= subInvoice.anhHoaDon.length) {
            toast.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...subInvoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update subInvoice
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...shipment.hoaDon[invoiceIdx],
            subInvoice: {
                ...subInvoice,
                anhHoaDon: updatedImages
            }
        };

        // Update Firestore
        await db.collection('inventory_tracking').doc(shipmentId).update({
            hoaDon: updatedHoaDon,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewSubInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        toast.success('Đã xóa ảnh');
    } catch (error) {
        console.error('[RENDERER] Delete sub-invoice image error:', error);
        toast.error('Lỗi xóa ảnh: ' + error.message);
    }
}

console.log('[RENDERER] Table renderer initialized');

// Expose functions to global scope for onclick handlers
window.showSubInvoice = showSubInvoice;
window.closeSubInvoiceModal = closeSubInvoiceModal;
window.viewSubInvoiceImages = viewSubInvoiceImages;
window.deleteSubInvoiceImage = deleteSubInvoiceImage;
window.viewInvoiceImages = viewInvoiceImages;
window.deleteInvoiceImage = deleteInvoiceImage;
