// ============================================================================
// SALE MODAL - COMMON FUNCTIONS (shared between Tab1 and Social Tab)
// Extracted from tab1-qr-debt.js to eliminate duplication.
// Both tab1-orders.html and tab-social-orders.html load this file.
//
// REQUIRES (declared by each tab before this file loads):
//   - currentSaleOrderData (let) - current order being edited
//   - currentSaleLastDeposit (let) - last deposit info for note generation
//   - saveDebtToCache(phone, debt) - save debt to tab-specific cache
//   - updateDebtCellsInTable(phone, debt) - update debt display (no-op in social)
//   - QR_API_URL (const) - wallet API base URL
//   - normalizePhoneForQR(phone) - normalize phone number
// ============================================================================

// =====================================================
// DELIVERY CARRIER CACHE
// =====================================================
const DELIVERY_CARRIER_CACHE_KEY = 'tpos_delivery_carriers';
const DELIVERY_CARRIER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let deliveryCarrierCacheMemory = null;
let deliveryCarrierCacheLoaded = false;

async function initDeliveryCarrierCache() {
    if (deliveryCarrierCacheLoaded) return;

    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.readyPromise;
            const cached = await window.indexedDBStorage.getItem(DELIVERY_CARRIER_CACHE_KEY);
            if (cached) {
                deliveryCarrierCacheMemory = cached;
                console.log('[DELIVERY-CARRIER] Loaded cache from IndexedDB');
            }
        }

        // Migrate from localStorage if exists
        const localCache = localStorage.getItem(DELIVERY_CARRIER_CACHE_KEY);
        if (localCache) {
            const parsed = JSON.parse(localCache);
            deliveryCarrierCacheMemory = parsed;
            localStorage.removeItem(DELIVERY_CARRIER_CACHE_KEY);
            saveDeliveryCarriersAsync(parsed);
            console.log('[DELIVERY-CARRIER] Migrated cache from localStorage to IndexedDB');
        }

        deliveryCarrierCacheLoaded = true;
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error initializing cache:', e);
        deliveryCarrierCacheLoaded = true;
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initDeliveryCarrierCache, 200));
} else {
    setTimeout(initDeliveryCarrierCache, 200);
}

async function saveDeliveryCarriersAsync(cacheData) {
    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.setItem(DELIVERY_CARRIER_CACHE_KEY, cacheData);
        }
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error saving to IndexedDB:', e);
    }
}

function getCachedDeliveryCarriers() {
    try {
        if (!deliveryCarrierCacheMemory) return null;
        const { data, timestamp } = deliveryCarrierCacheMemory;
        if (Date.now() - timestamp > DELIVERY_CARRIER_CACHE_TTL) {
            deliveryCarrierCacheMemory = null;
            if (window.indexedDBStorage) {
                window.indexedDBStorage.removeItem(DELIVERY_CARRIER_CACHE_KEY);
            }
            return null;
        }
        return data;
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error reading cache:', e);
        return null;
    }
}

function saveDeliveryCarriersToCache(carriers) {
    try {
        const cacheData = { data: carriers, timestamp: Date.now() };
        deliveryCarrierCacheMemory = cacheData;
        saveDeliveryCarriersAsync(cacheData);
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Error saving cache:', e);
    }
}

async function fetchDeliveryCarriers() {
    const cached = getCachedDeliveryCarriers();
    if (cached) {
        console.log('[DELIVERY-CARRIER] Using cached data:', cached.length, 'carriers');
        return cached;
    }

    let token = null;
    try {
        if (window.tokenManager) {
            token = await window.tokenManager.getToken();
        }
    } catch (e) {
        console.error('[DELIVERY-CARRIER] Token error:', e);
    }

    if (!token) {
        console.warn('[DELIVERY-CARRIER] No auth token available');
        return [];
    }

    try {
        const proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier?$format=json&$orderby=DateCreated+desc&$filter=Active+eq+true&$count=true';
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'authorization': `Bearer ${token}`,
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const carriers = data.value || [];
        console.log('[DELIVERY-CARRIER] Fetched:', carriers.length, 'carriers');
        saveDeliveryCarriersToCache(carriers);
        return carriers;
    } catch (error) {
        console.error('[DELIVERY-CARRIER] Error fetching:', error);
        return [];
    }
}

// =====================================================
// FORMAT HELPERS
// =====================================================
function formatNumber(num) {
    return (num || 0).toLocaleString('vi-VN');
}

function formatDateTimeDisplay(date) {
    return date.toLocaleString('vi-VN');
}

function formatDateTimeLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

function formatCurrencyVND(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// =====================================================
// DISCOUNT HELPERS
// =====================================================
function parseDiscountFromNoteForDisplay(note) {
    if (!note || typeof note !== 'string') return 0;
    const cleanNote = note.trim().toLowerCase();
    if (!cleanNote) return 0;

    const kMatch = cleanNote.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);
    if (kMatch) {
        return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
    }

    const plainMatch = cleanNote.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)$/);
    if (plainMatch) {
        const num = parseInt(plainMatch[1].replace(/[.,]/g, ''), 10);
        if (num >= 1000) return num;
        if (num > 0) return num * 1000;
    }
    return 0;
}

function currentSaleOrderHasDiscountTag() {
    if (!currentSaleOrderData?.Tags) return false;
    try {
        const tags = typeof currentSaleOrderData.Tags === 'string'
            ? JSON.parse(currentSaleOrderData.Tags)
            : currentSaleOrderData.Tags;
        if (Array.isArray(tags)) {
            return tags.some(tag => {
                const tagName = (tag.Name || '').toUpperCase();
                return tagName.includes('GIẢM GIÁ') || tagName.includes('GIAM GIA');
            });
        }
    } catch (e) {}
    return false;
}

// =====================================================
// DELIVERY CARRIER DROPDOWN
// =====================================================
async function populateDeliveryCarrierDropdown(selectedId = null) {
    const select = document.getElementById('saleDeliveryPartner');
    if (!select) return;

    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    const carriers = await fetchDeliveryCarriers();

    let optionsHtml = '<option value="">-- Chọn đối tác giao hàng --</option>';
    carriers.forEach(carrier => {
        const fee = carrier.Config_DefaultFee || carrier.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        const selected = selectedId && carrier.Id == selectedId ? 'selected' : '';
        optionsHtml += `<option value="${carrier.Id}" data-fee="${fee}" data-name="${carrier.Name}"${selected}>${carrier.Name}${feeText}</option>`;
    });

    select.innerHTML = optionsHtml;
    select.disabled = false;

    select.onchange = function () {
        const selectedOption = this.options[this.selectedIndex];
        const fee = parseFloat(selectedOption.dataset.fee) || 0;

        const shippingFeeInput = document.getElementById('saleShippingFee');
        if (shippingFeeInput) {
            shippingFeeInput.value = fee;
        }

        // Full recalculation: discount, free shipping, COD, goods value, remaining balance
        const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
        const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
        updateSaleTotals(totalQuantity, totalAmount);
    };

    if (selectedId) {
        select.dispatchEvent(new Event('change'));
    }
}

// =====================================================
// COD & REMAINING BALANCE
// =====================================================
function updateSaleCOD() {
    const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
    const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) || 0;
    const codInput = document.getElementById('saleCOD');
    if (codInput) {
        codInput.value = finalTotal + shippingFee;
    }
    const goodsValueInput = document.getElementById('saleGoodsValue');
    if (goodsValueInput) {
        goodsValueInput.value = finalTotal;
    }
    updateSaleRemainingBalance();
}

function updateSaleRemainingBalance() {
    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    const remainingElement = document.getElementById('saleRemainingBalance');
    if (remainingElement) {
        let remaining = 0;
        if (prepaidAmount < codValue) {
            remaining = codValue - prepaidAmount;
        }
        remainingElement.textContent = formatNumber(remaining);
    }
}

window.updateSaleRemainingBalance = updateSaleRemainingBalance;
window.fetchDeliveryCarriers = fetchDeliveryCarriers;
window.populateDeliveryCarrierDropdown = populateDeliveryCarrierDropdown;
window.getCachedDeliveryCarriers = getCachedDeliveryCarriers;

// =====================================================
// SMART DELIVERY PARTNER SELECTION
// =====================================================
function smartSelectDeliveryPartner(address, extraAddress = null) {
    console.log('[SMART-DELIVERY] Starting smart selection...');

    const select = document.getElementById('saleDeliveryPartner');
    if (!select || select.options.length <= 1) return;

    let districtInfo = extractDistrictFromAddress(address, extraAddress);

    if (!districtInfo) {
        selectCarrierByName(select, 'SHIP TỈNH', true);
        return;
    }

    if (districtInfo.isProvince) {
        selectCarrierByName(select, 'SHIP TỈNH', false);
        if (window.notificationManager) {
            window.notificationManager.success(`Tự động chọn: SHIP TỈNH (${districtInfo.cityName || 'tỉnh'})`, 2000);
        }
        return;
    }

    const matchedCarrier = findMatchingCarrier(select, districtInfo);

    if (matchedCarrier) {
        select.value = matchedCarrier.id;
        select.dispatchEvent(new Event('change'));
        if (window.notificationManager) {
            window.notificationManager.success(`Tự động chọn: ${matchedCarrier.name}`, 2000);
        }
    } else {
        selectCarrierByName(select, 'SHIP TỈNH', true);
    }
}

function extractDistrictFromAddress(address, extraAddress) {
    let result = {
        districtName: null,
        districtNumber: null,
        wardName: null,
        cityName: null,
        isProvince: false,
        originalText: address
    };

    if (extraAddress) {
        if (extraAddress.District?.name) {
            result.districtName = extraAddress.District.name;
            const numMatch = extraAddress.District.name.match(/(\d+)/);
            if (numMatch) result.districtNumber = numMatch[1];
        }
        if (extraAddress.Ward?.name) result.wardName = extraAddress.Ward.name;
        if (extraAddress.City?.name) {
            result.cityName = extraAddress.City.name;
            const cityNorm = extraAddress.City.name.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (!cityNorm.includes('ho chi minh') && !cityNorm.includes('ha noi') &&
                !cityNorm.includes('hcm') && !cityNorm.includes('sai gon')) {
                result.isProvince = true;
            }
        }
    }

    if (address) {
        let cleanedAddress = address
            .replace(/\b0\d{9,10}\b/g, '')
            .replace(/\bD\.\s*/gi, '')
            .replace(/[/.]{2,}/g, ' ')
            .replace(/\.\s+\./g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        const normalizedAddress = cleanedAddress.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // 61 provinces (excluding HCM and Hanoi)
        const provinces = [
            'hai phong', 'haiphong', 'da nang', 'danang', 'can tho', 'cantho',
            'ha giang', 'hagiang', 'cao bang', 'caobang', 'bac kan', 'backan',
            'tuyen quang', 'tuyenquang', 'lao cai', 'laocai',
            'dien bien', 'dienbien', 'lai chau', 'laichau', 'son la', 'sonla',
            'yen bai', 'yenbai', 'hoa binh', 'hoabinh',
            'thai nguyen', 'thainguyen', 'lang son', 'langson',
            'quang ninh', 'quangninh', 'bac giang', 'bacgiang',
            'phu tho', 'phutho', 'vinh phuc', 'vinhphuc',
            'bac ninh', 'bacninh', 'hai duong', 'haiduong',
            'hung yen', 'hungyen', 'thai binh', 'thaibinh',
            'ha nam', 'hanam', 'nam dinh', 'namdinh', 'ninh binh', 'ninhbinh',
            'thanh hoa', 'thanhhoa', 'nghe an', 'nghean',
            'ha tinh', 'hatinh', 'quang binh', 'quangbinh',
            'quang tri', 'quangtri', 'thua thien hue', 'thuathienhue',
            'quang nam', 'quangnam', 'quang ngai', 'quangngai',
            'binh dinh', 'binhdinh', 'phu yen', 'phuyen',
            'khanh hoa', 'khanhhoa', 'ninh thuan', 'ninhthuan',
            'binh thuan', 'binhthuan',
            'kon tum', 'kontum', 'gia lai', 'gialai',
            'dak lak', 'daklak', 'dac lak', 'daclak',
            'dak nong', 'daknong', 'dac nong', 'dacnong',
            'lam dong', 'lamdong',
            'binh phuoc', 'binhphuoc', 'tay ninh', 'tayninh',
            'binh duong', 'binhduong', 'dong nai', 'dongnai',
            'ba ria', 'baria', 'vung tau', 'vungtau', 'ba ria vung tau', 'bariavungtau',
            'long an', 'longan', 'tien giang', 'tiengiang',
            'ben tre', 'bentre', 'tra vinh', 'travinh',
            'vinh long', 'vinhlong', 'dong thap', 'dongthap',
            'an giang', 'angiang', 'kien giang', 'kiengiang',
            'hau giang', 'haugiang', 'soc trang', 'soctrang',
            'bac lieu', 'baclieu', 'ca mau', 'camau'
        ];

        const parts = normalizedAddress.split(/[,\s]+/).filter(p => p.length > 1);
        const endParts = parts.slice(-4).join(' ');

        for (const province of provinces) {
            if (endParts.includes(province)) {
                result.isProvince = true;
                result.cityName = province;
                return result;
            }
        }

        // Extract district number
        const districtPatterns = [
            /quan\s*\.?\s*(\d+)/i,
            /q\s*\.?\s*(\d+)/i,
            /district\s*(\d+)/i,
            /\bq(\d+)\b/i,
        ];

        for (const pattern of districtPatterns) {
            const match = normalizedAddress.match(pattern);
            if (match) {
                result.districtNumber = match[1];
                break;
            }
        }

        // Match named districts (HCM)
        const namedDistricts = [
            { normalized: 'binh tan', original: 'Bình Tân' },
            { normalized: 'binh thanh', original: 'Bình Thạnh' },
            { normalized: 'go vap', original: 'Gò Vấp' },
            { normalized: 'phu nhuan', original: 'Phú Nhuận' },
            { normalized: 'tan binh', original: 'Tân Bình' },
            { normalized: 'tan phu', original: 'Tân Phú' },
            { normalized: 'thu duc', original: 'Thủ Đức' },
            { normalized: 'tp thu duc', original: 'Thủ Đức' },
            { normalized: 'thanh pho thu duc', original: 'Thủ Đức' },
            { normalized: 'binh chanh', original: 'Bình Chánh' },
            { normalized: 'can gio', original: 'Cần Giờ' },
            { normalized: 'cu chi', original: 'Củ Chi' },
            { normalized: 'hoc mon', original: 'Hóc Môn' },
            { normalized: 'nha be', original: 'Nhà Bè' }
        ];

        for (const district of namedDistricts) {
            const lastThreeParts = parts.slice(-3).join(' ');
            const districtPattern = new RegExp(
                `(quan|huyen|phuong|xa|thi tran|tp|thanh pho|q\\.?)?\\s*${district.normalized}(?:\\s|,|$)`,
                'i'
            );
            const hasApPrefix = normalizedAddress.includes(`ap ${district.normalized}`) ||
                                normalizedAddress.includes(`xom ${district.normalized}`) ||
                                normalizedAddress.includes(`thon ${district.normalized}`);

            if (!hasApPrefix && (districtPattern.test(lastThreeParts) || lastThreeParts.endsWith(district.normalized))) {
                result.districtName = district.original;
                break;
            }
        }
    }

    if (!result.districtName && !result.districtNumber && !result.isProvince) {
        return null;
    }
    return result;
}

function findMatchingCarrier(select, districtInfo) {
    const CARRIER_20K = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
    const CARRIER_20K_NAMED = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];
    const CARRIER_30K = ['2', '12'];
    const CARRIER_30K_NAMED = ['binh tan', 'thu duc'];
    const CARRIER_35K_TP = ['9'];
    const CARRIER_35K_TP_NAMED = ['binh chanh', 'nha be', 'hoc mon'];
    const SHIP_TINH_NAMED = ['cu chi', 'can gio'];

    let targetGroup = null;
    const districtNum = districtInfo.districtNumber;
    const districtName = districtInfo.districtName?.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';

    if (districtNum) {
        if (CARRIER_20K.includes(districtNum)) targetGroup = '20k';
        else if (CARRIER_30K.includes(districtNum)) targetGroup = '30k';
        else if (CARRIER_35K_TP.includes(districtNum)) targetGroup = '35k_tp';
    }

    if (!targetGroup && districtName) {
        if (CARRIER_20K_NAMED.some(d => districtName.includes(d))) targetGroup = '20k';
        else if (CARRIER_30K_NAMED.some(d => districtName.includes(d))) targetGroup = '30k';
        else if (CARRIER_35K_TP_NAMED.some(d => districtName.includes(d))) targetGroup = '35k_tp';
        else if (SHIP_TINH_NAMED.some(d => districtName.includes(d))) targetGroup = 'ship_tinh';
    }

    if (!targetGroup) return null;

    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (!option.value) continue;

        const carrierName = option.dataset.name || option.text;
        const carrierNorm = carrierName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const carrierFee = parseFloat(option.dataset.fee) || 0;

        if (carrierNorm.includes('gop') || carrierName === 'BÁN HÀNG SHOP') continue;

        if (targetGroup === '20k' && carrierFee === 20000 && carrierNorm.includes('thanh pho')) {
            return { id: option.value, name: carrierName };
        }
        if (targetGroup === '30k' && carrierFee === 30000 && carrierNorm.includes('thanh pho')) {
            return { id: option.value, name: carrierName };
        }
        if (targetGroup === '35k_tp' && carrierFee === 35000 && carrierNorm.includes('thanh pho')) {
            return { id: option.value, name: carrierName };
        }
        if (targetGroup === 'ship_tinh' && carrierNorm.includes('ship tinh')) {
            return { id: option.value, name: carrierName };
        }
    }
    return null;
}

function selectCarrierByName(select, namePattern, showWarning = false) {
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        const carrierName = option.dataset.name || option.text;
        if (carrierName.includes(namePattern)) {
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
            if (showWarning && window.notificationManager) {
                window.notificationManager.info(
                    `Không xác định được quận/huyện, đã chọn: ${carrierName}`,
                    3000
                );
            }
            return true;
        }
    }
    return false;
}

window.smartSelectDeliveryPartner = smartSelectDeliveryPartner;
window.extractDistrictFromAddress = extractDistrictFromAddress;
window.findMatchingCarrier = findMatchingCarrier;

// =====================================================
// POPULATE SALE MODAL
// =====================================================
function populateSaleModalWithOrder(order) {
    const customerName = order.PartnerName || order.Name || '';
    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerNameHeader').textContent = customerName;
    document.getElementById('saleCustomerStatus').textContent = '';
    document.getElementById('saleCustomerStatusHeader').textContent = '';
    document.getElementById('saleLoyaltyPoints').textContent = '0';
    document.getElementById('saleLoyaltyPointsHeader').textContent = '0';
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = '0';
    document.getElementById('saleOldDebt').textContent = '0';

    document.getElementById('saleReceiverName').value = order.PartnerName || order.Name || '';
    document.getElementById('saleReceiverPhone').value = order.PartnerPhone || order.Telephone || '';
    document.getElementById('saleReceiverAddress').value = order.PartnerAddress || order.Address || '';
    document.getElementById('saleReceiverNote').value = '';

    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue) : 35000;
    const totalAmount = order.TotalAmount || 0;

    document.getElementById('saleCOD').value = totalAmount + shippingFee;

    const defaultDeliveryNote = 'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CỦA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ';
    document.getElementById('saleDeliveryNote').value = order.Comment || defaultDeliveryNote;
    document.getElementById('saleGoodsValue').value = totalAmount;

    const now = new Date();
    document.getElementById('saleDeliveryDate').value = formatDateTimeLocal(now);
    document.getElementById('saleInvoiceDate').textContent = formatDateTimeDisplay(now);

    // Convert Details to orderLines format if needed, then use shared display
    if (order.orderLines && order.orderLines.length > 0) {
        populateSaleOrderLinesFromAPI(order.orderLines);
    } else if (order.Details && order.Details.length > 0) {
        const orderLines = order.Details.map(detail => ({
            ProductId: detail.ProductId || 0,
            Product: null,
            ProductUOMId: 1,
            ProductUOM: { Id: 1, Name: 'Cái', Factor: 1, FactorInv: 1 },
            ProductUOMQty: detail.Quantity || 1,
            Quantity: detail.Quantity || 1,
            PriceUnit: detail.PriceUnit || detail.Price || 0,
            Price: detail.Price || detail.PriceUnit || 0,
            ProductName: detail.ProductName || detail.ProductNameGet || '',
            ProductNameGet: detail.ProductNameGet || detail.ProductName || '',
            ProductUOMName: 'Cái',
            Note: detail.Note || '',
            SaleOnlineDetailId: null,
            Discount: 0,
            Weight: 0
        }));
        populateSaleOrderLinesFromAPI(orderLines);
    } else {
        const container = document.getElementById('saleOrderItems');
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
    }
}

// =====================================================
// ORDER LINES DISPLAY (from API with Product details)
// =====================================================
function populateSaleOrderLinesFromAPI(orderLines) {
    const container = document.getElementById('saleOrderItems');

    if (!orderLines || orderLines.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
        return;
    }

    currentSaleOrderData.orderLines = orderLines;
    const hasDiscountTag = currentSaleOrderHasDiscountTag();

    let totalQuantity = 0;
    let totalAmount = 0;
    let totalDiscount = 0;

    const itemsHTML = orderLines.map((item, index) => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;

        const productName = item.Product?.NameGet || item.ProductName || '';
        const productNote = item.Note || '';

        const notePrice = hasDiscountTag ? parseDiscountFromNoteForDisplay(productNote) : 0;
        const discountPerUnit = notePrice > 0 ? Math.max(0, price - notePrice) : 0;
        const productDiscount = discountPerUnit * qty;
        const isDiscountedProduct = productDiscount > 0;
        if (isDiscountedProduct) totalDiscount += productDiscount;

        const rowStyle = isDiscountedProduct ? 'background-color: #fef3c7;' : '';
        const noteStyle = isDiscountedProduct
            ? 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 600;'
            : 'font-size: 11px; color: #6b7280;';

        const productImage = item.Product?.Thumbnails?.[1] || item.Product?.ImageUrl || '';
        const imageHTML = productImage
            ? `<img src="${productImage}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;">`
            : `<div style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #9ca3af;"></i></div>`;

        totalQuantity += qty;
        totalAmount += total;

        const noteDisplay = productNote
            ? (isDiscountedProduct
                ? `<span style="${noteStyle}"><i class="fas fa-tag"></i> -${discountPerUnit.toLocaleString('vi-VN')}đ (${productNote})</span>`
                : `<div style="${noteStyle}">${productNote}</div>`)
            : '<div style="font-size: 11px; color: #9ca3af;">Ghi chú</div>';

        return `
            <tr style="${rowStyle}">
                <td>${index + 1}</td>
                <td>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        ${imageHTML}
                        <div>
                            <div class="sale-product-name">${productName}</div>
                            ${noteDisplay}
                        </div>
                    </div>
                </td>
                <td>
                    <input type="number" class="sale-input" value="${qty}" min="1"
                        onchange="updateSaleItemQuantityFromAPI(${index}, this.value)"
                        style="width: 60px; text-align: center;">
                </td>
                <td style="text-align: right;">${formatNumber(price)}</td>
                <td style="text-align: right;">${formatNumber(total)}</td>
                <td style="text-align: center;">
                    <button onclick="removeSaleItemFromAPI(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = itemsHTML;

    if (hasDiscountTag && totalDiscount > 0) {
        const discountInput = document.getElementById('saleDiscount');
        if (discountInput) discountInput.value = totalDiscount;
        const discountEl = document.getElementById('saleDiscountFromTag');
        if (discountEl) {
            discountEl.textContent = `-${totalDiscount.toLocaleString('vi-VN')}`;
            discountEl.parentElement.style.display = 'flex';
        }
    }

    updateSaleTotals(totalQuantity, totalAmount);
}

// =====================================================
// ITEM QUANTITY / REMOVE (with API sync)
// =====================================================
async function updateSaleItemQuantityFromAPI(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    const oldQty = currentSaleOrderData.orderLines[index].ProductUOMQty || currentSaleOrderData.orderLines[index].Quantity || 1;
    const newQty = parseInt(value) || 1;

    currentSaleOrderData.orderLines[index].ProductUOMQty = newQty;
    currentSaleOrderData.orderLines[index].Quantity = newQty;

    let totalQuantity = 0;
    let totalAmount = 0;
    currentSaleOrderData.orderLines.forEach(item => {
        const itemQty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += itemQty;
        totalAmount += itemQty * price;
    });
    updateSaleTotals(totalQuantity, totalAmount);

    // Sync to API (updateSaleOrderWithAPI from tab1-sale.js)
    if (typeof updateSaleOrderWithAPI === 'function') {
        try {
            await updateSaleOrderWithAPI();
        } catch (apiError) {
            console.error('[SALE-UPDATE-QTY] API update failed:', apiError);
            currentSaleOrderData.orderLines[index].ProductUOMQty = oldQty;
            currentSaleOrderData.orderLines[index].Quantity = oldQty;
            populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);
            if (window.notificationManager) {
                window.notificationManager.error('Không thể cập nhật số lượng. Vui lòng thử lại.');
            }
        }
    }
}

async function removeSaleItemFromAPI(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    const productName = currentSaleOrderData.orderLines[index].Product?.NameGet ||
        currentSaleOrderData.orderLines[index].ProductName || 'sản phẩm này';

    const confirmed = window.notificationManager ?
        await window.notificationManager.confirm(`Bạn có chắc muốn xóa ${productName}?`, 'Xóa sản phẩm') : true;
    if (!confirmed) return;

    const removedItem = currentSaleOrderData.orderLines[index];
    const removedIndex = index;

    currentSaleOrderData.orderLines.splice(index, 1);
    populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);

    // Sync to API
    if (typeof updateSaleOrderWithAPI === 'function') {
        try {
            await updateSaleOrderWithAPI();
            if (window.notificationManager) {
                window.notificationManager.success(`Đã xóa ${productName}`);
            }
        } catch (apiError) {
            console.error('[SALE-REMOVE-PRODUCT] API update failed:', apiError);
            currentSaleOrderData.orderLines.splice(removedIndex, 0, removedItem);
            populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);
            if (window.notificationManager) {
                window.notificationManager.error('Không thể xóa sản phẩm. Vui lòng thử lại.');
            }
        }
    } else {
        if (window.notificationManager) {
            window.notificationManager.success(`Đã xóa ${productName}`);
        }
    }
}

// =====================================================
// UPDATE TOTALS
// =====================================================
function updateSaleTotals(quantity, amount) {
    document.getElementById('saleTotalQuantity').textContent = quantity;
    document.getElementById('saleTotalAmount').textContent = formatNumber(amount);

    const discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    const finalTotal = amount - discount;
    document.getElementById('saleFinalTotal').textContent = formatNumber(finalTotal);

    // Free shipping logic
    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (carrierSelect && shippingFeeInput && carrierSelect.value) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        const carrierName = selectedOption?.dataset?.name || '';
        const baseFee = parseFloat(selectedOption?.dataset?.fee) || 0;
        const isThanhPho = carrierName.startsWith('THÀNH PHỐ');
        const isTinh = carrierName.includes('TỈNH');

        if (isThanhPho && finalTotal > 1500000) {
            shippingFeeInput.value = 0;
        } else if (isTinh && finalTotal > 3000000) {
            shippingFeeInput.value = 0;
        } else if (parseFloat(shippingFeeInput.value) === 0 && baseFee > 0) {
            shippingFeeInput.value = baseFee;
        }
    }

    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue) : 0;
    document.getElementById('saleCOD').value = finalTotal + shippingFee;
    document.getElementById('saleGoodsValue').value = finalTotal;

    updateSaleRemainingBalance();
}

// =====================================================
// POPULATE PARTNER DATA
// =====================================================
function populatePartnerData(partner) {
    if (!partner) return;

    const customerName = partner.DisplayName || partner.Name || '';
    const customerStatus = partner.StatusText || 'Bình thường';
    const loyaltyPoints = partner.LoyaltyPoints || 0;

    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerStatus').textContent = customerStatus;
    document.getElementById('saleLoyaltyPoints').textContent = loyaltyPoints;
    document.getElementById('saleCustomerNameHeader').textContent = customerName;
    document.getElementById('saleCustomerStatusHeader').textContent = customerStatus;
    document.getElementById('saleLoyaltyPointsHeader').textContent = loyaltyPoints;
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = loyaltyPoints;

    const receiverName = document.getElementById('saleReceiverName');
    const receiverPhone = document.getElementById('saleReceiverPhone');
    const receiverAddress = document.getElementById('saleReceiverAddress');

    if (!receiverName.value) receiverName.value = partner.DisplayName || partner.Name || '';
    if (!receiverPhone.value) receiverPhone.value = partner.Phone || partner.Mobile || '';

    if (!receiverAddress.value) {
        let address = partner.FullAddress || partner.Street || '';
        if (!address && partner.ExtraAddress) {
            const ea = partner.ExtraAddress;
            const parts = [ea.Street, ea.Ward?.name, ea.District?.name, ea.City?.name].filter(p => p);
            address = parts.join(', ');
        }
        receiverAddress.value = address;
    }
}

// =====================================================
// FETCH DEBT FOR SALE MODAL
// =====================================================
async function fetchDebtForSaleModal(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    if (prepaidAmountField) prepaidAmountField.value = '...';

    try {
        const response = await fetch(`${QR_API_URL}/api/v2/wallets/${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            const realBalance = parseFloat(result.data.balance) || 0;
            const virtualBalance = parseFloat(result.data.virtual_balance) || 0;
            const totalBalance = realBalance + virtualBalance;

            // Store last deposit info for note generation
            if (result.data.lastDepositAmount && result.data.lastDepositDate) {
                currentSaleLastDeposit = {
                    amount: parseFloat(result.data.lastDepositAmount),
                    date: result.data.lastDepositDate
                };
            } else {
                currentSaleLastDeposit = null;
            }

            if (prepaidAmountField) {
                prepaidAmountField.value = totalBalance > 0 ? totalBalance : 0;
            }

            const oldDebtField = document.getElementById('saleOldDebt');
            if (oldDebtField) {
                oldDebtField.textContent = formatCurrencyVND(totalBalance);
            }

            if (prepaidAmountField) {
                prepaidAmountField.dataset.hasVirtualDebt = virtualBalance > 0 ? '1' : '0';
            }

            saveDebtToCache(normalizedPhone, totalBalance);
            updateDebtCellsInTable(normalizedPhone, totalBalance);
            updateSaleRemainingBalance();
        } else {
            currentSaleLastDeposit = null;
            if (prepaidAmountField) {
                prepaidAmountField.value = 0;
                prepaidAmountField.dataset.hasVirtualDebt = '0';
            }
            updateSaleRemainingBalance();
        }
    } catch (error) {
        console.error('[SALE-MODAL] Error fetching wallet balance:', error);
        if (prepaidAmountField) {
            prepaidAmountField.value = 0;
            prepaidAmountField.dataset.hasVirtualDebt = '0';
        }
        updateSaleRemainingBalance();
    }
}

// =====================================================
// AUTO-FILL SALE NOTE
// =====================================================
function autoFillSaleNote() {
    const noteField = document.getElementById('saleReceiverNote');
    if (!noteField || noteField.value.trim()) return;

    const order = currentSaleOrderData;
    if (!order) return;

    const noteParts = [];

    // 1. CK from wallet balance
    const walletBalance = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    if (walletBalance > 0) {
        let ckAmount = walletBalance;
        let dateStr;
        if (currentSaleLastDeposit?.amount && currentSaleLastDeposit?.date) {
            ckAmount = currentSaleLastDeposit.amount;
            const depositDate = new Date(currentSaleLastDeposit.date);
            dateStr = `${String(depositDate.getDate()).padStart(2, '0')}/${String(depositDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
            const today = new Date();
            dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
        const amountStr = ckAmount >= 1000 ? `${Math.round(ckAmount / 1000)}K` : ckAmount;
        noteParts.push(`CK ${amountStr} ACB ${dateStr}`);
    }

    // Parse order tags
    let orderTags = [];
    try {
        if (order.Tags) {
            orderTags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : order.Tags;
            if (!Array.isArray(orderTags)) orderTags = [];
        }
    } catch (e) { orderTags = []; }

    // 2. GG from discount
    const totalDiscount = parseFloat(document.getElementById('saleDiscount')?.value) || 0;
    if (totalDiscount > 0) {
        const discountStr = totalDiscount >= 1000 ? `${Math.round(totalDiscount / 1000)}K` : totalDiscount;
        noteParts.push(`GG ${discountStr}`);
    }

    // 3. Gộp from merge tag
    const mergeTag = orderTags.find(tag =>
        (tag.Name || '').toLowerCase().startsWith('gộp ')
    );
    if (mergeTag) {
        const numbers = mergeTag.Name.match(/\d+/g);
        if (numbers && numbers.length > 1) {
            noteParts.push(`ĐƠN GỘP ${numbers.join(' + ')}`);
        }
    }

    // 4. Freeship
    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
    if (carrierSelect && carrierSelect.value) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        const carrierName = selectedOption?.dataset?.name || '';
        const isThanhPho = carrierName.startsWith('THÀNH PHỐ');
        const isTinh = carrierName.includes('TỈNH');
        if ((isThanhPho && finalTotal > 1500000) || (isTinh && finalTotal > 3000000)) {
            noteParts.push('FREESHIP');
        }
    }

    if (noteParts.length > 0) {
        noteField.value = noteParts.join(', ');
    }
}

// =====================================================
// WALLET HISTORY (shared)
// =====================================================
function showCustomerWalletHistory() {
    const phoneField = document.getElementById('saleReceiverPhone');
    if (!phoneField || !phoneField.value) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có số điện thoại khách hàng');
        }
        return;
    }
    const phone = normalizePhoneForQR(phoneField.value);
    if (!phone) {
        if (window.notificationManager) {
            window.notificationManager.warning('Số điện thoại không hợp lệ');
        }
        return;
    }
    if (typeof WalletIntegration !== 'undefined' && WalletIntegration.showWalletModal) {
        WalletIntegration.showWalletModal(phone);
    } else {
        if (window.notificationManager) {
            window.notificationManager.error('Chức năng xem ví chưa sẵn sàng');
        }
    }
}

// Export all shared functions to window for cross-file access and onclick handlers
window.showCustomerWalletHistory = showCustomerWalletHistory;
window.populateSaleModalWithOrder = populateSaleModalWithOrder;
window.populatePartnerData = populatePartnerData;
window.fetchDebtForSaleModal = fetchDebtForSaleModal;
window.autoFillSaleNote = autoFillSaleNote;
window.populateSaleOrderLinesFromAPI = populateSaleOrderLinesFromAPI;
window.updateSaleItemQuantityFromAPI = updateSaleItemQuantityFromAPI;
window.removeSaleItemFromAPI = removeSaleItemFromAPI;
window.updateSaleTotals = updateSaleTotals;
window.formatNumber = formatNumber;
window.formatDateTimeDisplay = formatDateTimeDisplay;
window.formatCurrencyVND = formatCurrencyVND;
