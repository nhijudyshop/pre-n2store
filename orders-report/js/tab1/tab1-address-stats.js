// #region ═══════════════════════════════════════════════════════════════════════
// ║                       SECTION 16: ADDRESS LOOKUP                            ║
// ║                            search: #ADDRESS                                 ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// ADDRESS LOOKUP LOGIC #ADDRESS
// =====================================================
async function handleAddressLookup() {
    const input = document.getElementById('addressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');
    const keyword = input.value.trim();

    if (!keyword) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng nhập từ khóa tìm kiếm', 'warning');
        } else {
            alert('Vui lòng nhập từ khóa tìm kiếm');
        }
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';

    try {
        // Use the global searchByName function from api-handler.js which returns data without DOM manipulation
        if (typeof window.searchByName !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const items = await window.searchByName(keyword);

        if (!items || items.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        resultsContainer.innerHTML = items.map(item => {
            // Determine display name and type label
            let displayName = item.name || item.ward_name || item.district_name || '';
            let typeLabel = '';
            let fullAddress = displayName; // Default to display name
            let subText = '';

            if (item.type === 'province') {
                typeLabel = 'Tỉnh/Thành phố';
            } else if (item.type === 'district') {
                typeLabel = 'Quận/Huyện';
                if (item.province_name) {
                    fullAddress = `${displayName}, ${item.province_name}`;
                }
            } else if (item.type === 'ward') {
                typeLabel = 'Phường/Xã';
                // Try to construct better address if fields exist
                if (item.district_name && item.province_name) {
                    fullAddress = `${displayName}, ${item.district_name}, ${item.province_name}`;
                } else if (item.merger_details) {
                    // Use merger details as context since district_name is missing
                    subText = `<div style="font-size: 10px; color: #9ca3af; font-style: italic;">${item.merger_details}</div>`;
                    // Construct full address with province
                    if (item.province_name) {
                        fullAddress = `${displayName}, ${item.province_name}`;
                        // Append district info from merger details if possible (simple heuristic)
                        // This is optional, but helps if the user wants the "old" district name in the text
                        fullAddress += ` (${item.merger_details})`;
                    }
                } else if (item.address) {
                    fullAddress = item.address;
                }
            }

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', '${item.type}')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${displayName}</div>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${typeLabel}</div>
                    ${subText}
                </div>
                <i class="fas fa-chevron-right" style="font-size: 12px; color: #d1d5db;"></i>
            </div>
            `;
        }).join('');

        // Add hover effect via JS since we are injecting HTML
        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function handleFullAddressLookup() {
    const input = document.getElementById('fullAddressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');

    if (!input || !resultsContainer) return;

    const keyword = input.value.trim();
    if (!keyword) {
        alert('Vui lòng nhập địa chỉ đầy đủ');
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang phân tích địa chỉ...</div>';

    try {
        if (typeof window.searchFullAddress !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const response = await window.searchFullAddress(keyword);

        if (!response || !response.data || response.data.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        // The API returns data in a simple format: { address: "...", note: "..." }

        const items = response.data;
        resultsContainer.innerHTML = items.map(item => {
            const fullAddress = item.address;

            return `
            <div class="address-result-item" 
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', 'full')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${item.address}</div>
                    ${item.note ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${item.note}</div>` : ''}
                </div>
                <i class="fas fa-check" style="font-size: 12px; color: #059669;"></i>
            </div>
            `;
        }).join('');

        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Full address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function selectAddress(fullAddress, type) {
    const addressTextarea = document.querySelector('textarea[onchange*="updateOrderInfo(\'Address\'"]');
    if (addressTextarea) {
        let newAddress = fullAddress;

        // Logic to append or replace
        if (addressTextarea.value && addressTextarea.value.trim() !== '') {
            // Check if the textarea contains the new address already
            if (!addressTextarea.value.includes(fullAddress)) {
                // Confirm with user using custom popup
                const replaceAddress = await window.notificationManager.confirm(
                    'Bạn có muốn thay thế địa chỉ hiện tại không?\n\nĐồng ý: Thay thế\nHủy: Nối thêm vào sau',
                    'Chọn cách cập nhật địa chỉ'
                );
                if (replaceAddress) {
                    newAddress = fullAddress;
                } else {
                    newAddress = addressTextarea.value + ', ' + fullAddress;
                }
            }
        }

        addressTextarea.value = newAddress;
        updateOrderInfo('Address', newAddress);

        // Hide results and clear input
        document.getElementById('addressLookupResults').style.display = 'none';
        document.getElementById('addressLookupInput').value = '';

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật địa chỉ', 'success');
        }
    }
}

// =====================================================
// PRODUCT STATS MODAL FUNCTIONS
// =====================================================

/**
 * Open the product stats modal and load previous stats if available
 */
function openProductStatsModal() {
    const modal = document.getElementById('productStatsModal');
    if (modal) {
        modal.classList.add('show');
        // Load previous stats from Firebase if available
        loadStatsFromFirebase();
    }
}

/**
 * Close the product stats modal
 */
function closeProductStatsModal() {
    const modal = document.getElementById('productStatsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function (event) {
    const modal = document.getElementById('productStatsModal');
    if (modal && event.target === modal) {
        closeProductStatsModal();
    }
});

/**
 * Get current campaign ID for Firebase storage
 */
function getStatsCampaignId() {
    if (selectedCampaign && selectedCampaign.campaignId) {
        return selectedCampaign.campaignId;
    }
    return 'no_campaign';
}

/**
 * Load stats from Firestore for current campaign
 */
async function loadStatsFromFirebase() {
    const modalBody = document.getElementById('productStatsModalBody');
    const campaignId = getStatsCampaignId();

    try {
        const db = window.firebase.firestore();
        const doc = await db.collection('product_stats').doc(campaignId).get();
        const data = doc.exists ? doc.data() : null;

        if (data && data.statsHtml) {
            // Show campaign info
            const campaignInfo = data.campaignName
                ? `<div class="stats-campaign-info"><i class="fas fa-video"></i>Chiến dịch: ${data.campaignName} | Cập nhật: ${new Date(data.updatedAt).toLocaleString('vi-VN')}</div>`
                : '';
            modalBody.innerHTML = campaignInfo + data.statsHtml;
        } else {
            modalBody.innerHTML = `
                <div class="stats-empty-state">
                    <i class="fas fa-chart-pie"></i>
                    <p>Chưa có dữ liệu thống kê. Bấm nút "Thống kê" để bắt đầu.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('[PRODUCT-STATS] Error loading from Firestore:', error);
        modalBody.innerHTML = `
            <div class="stats-empty-state">
                <i class="fas fa-chart-pie"></i>
                <p>Bấm nút "Thống kê" để bắt đầu</p>
            </div>
        `;
    }
}

/**
 * Save stats to Firestore for current campaign
 */
async function saveStatsToFirebase(statsHtml, summaryData) {
    const campaignId = getStatsCampaignId();
    const campaignName = selectedCampaign ? selectedCampaign.campaignName : '';

    try {
        const db = window.firebase.firestore();
        await db.collection('product_stats').doc(campaignId).set({
            campaignId: campaignId,
            campaignName: campaignName,
            statsHtml: statsHtml,
            totalProducts: summaryData.totalProducts,
            totalQuantity: summaryData.totalQuantity,
            totalOrders: summaryData.totalOrders,
            updatedAt: new Date().toISOString()
        });
        console.log('[PRODUCT-STATS] Saved to Firestore successfully');
    } catch (error) {
        console.error('[PRODUCT-STATS] Error saving to Firestore:', error);
    }
}

/**
 * Run product statistics on all orders in allData
 */
async function runProductStats() {
    const modalBody = document.getElementById('productStatsModalBody');
    const runBtn = document.querySelector('.btn-run-stats');

    // Show loading state
    modalBody.innerHTML = `
        <div class="stats-loading">
            <div class="spinner"></div>
            <p>Đang thống kê sản phẩm...</p>
        </div>
    `;

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        // Check if allData exists
        if (!allData || allData.length === 0) {
            modalBody.innerHTML = `
                <div class="stats-empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                    <p>Không có dữ liệu đơn hàng. Vui lòng tải dữ liệu trước.</p>
                </div>
            `;
            return;
        }

        // Build product statistics
        const productStats = new Map(); // key: ProductCode, value: { name, nameGet, imageUrl, sttList: [{stt, qty}] }
        const orderSet = new Set(); // Track unique orders
        let totalQuantity = 0;

        allData.forEach((order) => {
            const stt = order.SessionIndex || '';
            if (!stt) return; // Skip orders without STT

            orderSet.add(stt);

            const details = order.Details || [];
            details.forEach((product) => {
                const productCode = product.ProductCode || 'N/A';
                const quantity = product.Quantity || product.ProductUOMQty || 1;
                totalQuantity += quantity;

                if (!productStats.has(productCode)) {
                    productStats.set(productCode, {
                        code: productCode,
                        name: product.ProductName || '',
                        nameGet: product.ProductNameGet || product.ProductName || '',
                        imageUrl: product.ImageUrl || '',
                        sttList: [],
                        totalQty: 0
                    });
                }

                const stat = productStats.get(productCode);
                stat.sttList.push({ stt: stt, qty: quantity });
                stat.totalQty += quantity;
            });
        });

        // Sort products by total quantity (descending)
        const sortedProducts = Array.from(productStats.values()).sort((a, b) => b.totalQty - a.totalQty);

        // Summary data
        const summaryData = {
            totalProducts: sortedProducts.length,
            totalQuantity: totalQuantity,
            totalOrders: orderSet.size
        };

        // Build HTML table
        const tableRowsHtml = sortedProducts.map((product) => {
            // Build STT list string with quantity
            const sttListStr = product.sttList.map(item => {
                if (item.qty > 1) {
                    return `${item.stt}<span class="stats-stt-qty">(${item.qty})</span>`;
                }
                return item.stt;
            }).join(', ');

            // Product image
            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" class="stats-product-image" alt="${product.code}" onerror="this.style.display='none'">`
                : `<div class="stats-product-image-placeholder"><i class="fas fa-image"></i></div>`;

            return `
                <tr>
                    <td>
                        <div class="stats-product-info">
                            ${imageHtml}
                            <div class="stats-product-details">
                                <div class="stats-product-code">[${product.code}]</div>
                                <div class="stats-product-name">${product.nameGet || product.name}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="stats-quantity-badge">${product.totalQty}</span>
                    </td>
                    <td>
                        <div class="stats-stt-list">${sttListStr}</div>
                    </td>
                </tr>
            `;
        }).join('');

        const statsHtml = `
            <div class="stats-summary-header" onclick="toggleStatsSummary(this)">
                <i class="fas fa-chevron-down toggle-icon"></i>
                <i class="fas fa-list-alt"></i>
                <span class="stats-summary-content">TỔNG CỘNG: ${summaryData.totalProducts} sản phẩm</span>
                <div class="stats-summary-values">
                    <span>${summaryData.totalQuantity.toLocaleString('vi-VN')} món</span>
                    <span>${summaryData.totalOrders.toLocaleString('vi-VN')} đơn hàng</span>
                </div>
            </div>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>SẢN PHẨM</th>
                            <th>SỐ LƯỢNG</th>
                            <th>MÃ ĐƠN HÀNG (STT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        // Show campaign info
        const campaignName = selectedCampaign ? selectedCampaign.campaignName : 'Không có chiến dịch';
        const campaignInfo = `<div class="stats-campaign-info"><i class="fas fa-video"></i>Chiến dịch: ${campaignName} | Cập nhật: ${new Date().toLocaleString('vi-VN')}</div>`;

        modalBody.innerHTML = campaignInfo + statsHtml;

        // Save to Firebase
        await saveStatsToFirebase(statsHtml, summaryData);

        if (window.notificationManager) {
            window.notificationManager.show(`Đã thống kê ${summaryData.totalProducts} sản phẩm từ ${summaryData.totalOrders} đơn hàng`, 'success');
        }

    } catch (error) {
        console.error('[PRODUCT-STATS] Error running stats:', error);
        modalBody.innerHTML = `
            <div class="stats-empty-state">
                <i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>
                <p>Lỗi khi thống kê: ${error.message}</p>
            </div>
        `;
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '<i class="fas fa-play"></i> Thống kê';
        }
    }
}

/**
 * Toggle stats summary collapse/expand
 */
function toggleStatsSummary(element) {
    element.classList.toggle('collapsed');
    const tableContainer = element.nextElementSibling;
    if (tableContainer) {
        tableContainer.style.display = element.classList.contains('collapsed') ? 'none' : 'block';
    }
}

// Make functions globally accessible
window.openProductStatsModal = openProductStatsModal;
window.closeProductStatsModal = closeProductStatsModal;
window.runProductStats = runProductStats;
window.toggleStatsSummary = toggleStatsSummary;

// =====================================================
// QR CODE MAPPING FOR ORDERS
// Mapping giữa SĐT và mã QR từ balance-history
// =====================================================

const QR_CACHE_KEY = 'orders_phone_qr_cache';
const QR_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

/**
 * Normalize phone number for consistent lookup
 * @param {string} phone - Raw phone number
 * @returns {string} Normalized phone number
 */
function normalizePhoneForQR(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // Handle Vietnam country code: replace leading 84 with 0
    if (cleaned.startsWith('84') && cleaned.length > 9) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

/**
 * Get QR cache from localStorage
 * @returns {Object} Cache object { phone: { uniqueCode, createdAt, synced } }
 */
function getQRCache() {
    try {
        const cache = localStorage.getItem(QR_CACHE_KEY);
        return cache ? JSON.parse(cache) : {};
    } catch (e) {
        console.error('[QR] Error reading cache:', e);
        return {};
    }
}

/**
 * Save QR cache to localStorage
 * @param {Object} cache - Cache object to save
 * @note DISABLED - Cache quá lớn, không cần lưu
 */
function saveQRCache(cache) {
    // DISABLED: Cache quá lớn, gây QuotaExceededError
    // Nếu cần bật lại, uncomment code bên dưới
    return;
    /*
    try {
        localStorage.setItem(QR_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('[QR] Error saving cache:', e);
    }
    */
}

/**
 * Generate unique QR code (same format as balance-history)
 * Format: N2 + 16 characters (total 18 chars) - Base36 encoded
 * @returns {string} Unique code like "N2ABCD1234EFGH5678"
 */
function generateUniqueCode() {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8); // 8 chars
    const random = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
    const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0'); // 2 chars
    return `N2${timestamp}${random}${sequence}`; // N2 (2) + 8 + 6 + 2 = 18 chars
}

/**
 * Get QR code for phone from cache
 * @param {string} phone - Phone number
 * @returns {string|null} Unique code or null
 */
function getQRFromCache(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    const cache = getQRCache();
    return cache[normalizedPhone]?.uniqueCode || null;
}

/**
 * Save QR code to cache
 * @param {string} phone - Phone number
 * @param {string} uniqueCode - QR unique code
 * @param {boolean} synced - Whether synced to API
 */
function saveQRToCache(phone, uniqueCode, synced = false) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone || !uniqueCode) return;

    const cache = getQRCache();
    cache[normalizedPhone] = {
        uniqueCode: uniqueCode,
        createdAt: new Date().toISOString(),
        synced: synced
    };
    saveQRCache(cache);
}

/**
 * Fetch QR codes from balance-history API and populate cache
 * Called once when page loads
 */
async function syncQRFromBalanceHistory() {
    try {
        console.log('[QR] Syncing from balance-history API...');
        const response = await fetch(`${QR_API_URL}/api/sepay/customer-info`);
        const result = await response.json();

        if (result.success && result.data) {
            const cache = getQRCache();
            let newCount = 0;

            result.data.forEach(item => {
                if (item.customer_phone && item.unique_code) {
                    const normalizedPhone = normalizePhoneForQR(item.customer_phone);
                    if (normalizedPhone && !cache[normalizedPhone]) {
                        cache[normalizedPhone] = {
                            uniqueCode: item.unique_code,
                            createdAt: item.updated_at || new Date().toISOString(),
                            synced: true
                        };
                        newCount++;
                    }
                }
            });

            saveQRCache(cache);
            console.log(`[QR] ✅ Synced ${newCount} new phone-QR mappings from balance-history`);
        }
    } catch (error) {
        console.error('[QR] Failed to sync from balance-history:', error);
    }
}

/**
 * Save QR mapping to balance-history API
 * @param {string} phone - Phone number
 * @param {string} uniqueCode - QR unique code
 */
async function syncQRToBalanceHistory(phone, uniqueCode) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone || !uniqueCode) return;

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/customer-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uniqueCode: uniqueCode,
                customerName: '',
                customerPhone: normalizedPhone
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update cache to mark as synced
            saveQRToCache(normalizedPhone, uniqueCode, true);
            console.log(`[QR] ✅ Synced to balance-history: ${normalizedPhone} → ${uniqueCode}`);
        } else {
            console.error('[QR] Failed to sync to balance-history:', result.error);
        }
    } catch (error) {
        console.error('[QR] Error syncing to balance-history:', error);
    }
}

/**
 * Get or create QR code for a phone number
 * @param {string} phone - Phone number
 * @returns {string|null} Unique code or null if no phone
 */
function getOrCreateQRForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    // 1. Check cache first
    let uniqueCode = getQRFromCache(normalizedPhone);

    if (!uniqueCode) {
        // 2. Create new code
        uniqueCode = generateUniqueCode();

        // 3. Save to cache
        saveQRToCache(normalizedPhone, uniqueCode, false);

        // 4. Sync to balance-history API (async, don't wait)
        syncQRToBalanceHistory(normalizedPhone, uniqueCode);

        console.log(`[QR] Created new QR for ${normalizedPhone}: ${uniqueCode}`);
    }

    return uniqueCode;
}

/**
 * Copy QR code to clipboard
 * @param {string} phone - Phone number to get QR for
 */
async function copyQRCode(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);

    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(uniqueCode);
        showNotification('Đã copy QR', 'success');
    } catch (error) {
        // Fallback for older browsers
        try {
            const textarea = document.createElement('textarea');
            textarea.value = uniqueCode;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showNotification('Đã copy QR', 'success');
        } catch (fallbackError) {
            console.error('[QR] Copy failed:', fallbackError);
            showNotification('Không thể copy', 'error');
        }
    }
}

/**
 * Render QR column HTML
 * @param {string} phone - Phone number
 * @returns {string} HTML string for QR column
 */
function renderQRColumn(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        // No phone number - show disabled button
        return `
            <button class="btn-qr" disabled title="Không có SĐT" style="
                padding: 4px 10px;
                border: none;
                border-radius: 4px;
                cursor: not-allowed;
                background: #e5e7eb;
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
            ">
                QR
            </button>
        `;
    }

    // Check if QR exists in cache
    const existingQR = getQRFromCache(normalizedPhone);
    const hasQR = !!existingQR;

    return `
        <button class="btn-qr ${hasQR ? 'has-qr' : ''}"
                onclick="showOrderQRModal('${normalizedPhone}'); event.stopPropagation();"
                title="${hasQR ? 'Xem QR: ' + existingQR : 'Tạo QR mới'}"
                style="
                    padding: 4px 10px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    background: ${hasQR ? '#10b981' : '#3b82f6'};
                    color: white;
                    font-size: 11px;
                    font-weight: 600;
                    transition: all 0.2s;
                "
                onmouseover="this.style.opacity='0.8'"
                onmouseout="this.style.opacity='1'">
            QR
        </button>
    `;
}

/**
 * Show notification (uses existing notification system if available)
 * @param {string} message - Message to show
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    // Try to use existing notification system
    if (window.NotificationManager && window.NotificationManager.show) {
        window.NotificationManager.show(message, type);
        return;
    }

    // Fallback: create simple toast notification
    const toast = document.createElement('div');
    toast.className = `qr-toast qr-toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
    `;

    document.body.appendChild(toast);

    // Auto remove after 2 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Add CSS animation for toast
const toastStyle = document.createElement('style');
toastStyle.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(toastStyle);

// Initialize: Sync QR data from balance-history when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Delay sync to let page load first
    setTimeout(() => {
        syncQRFromBalanceHistory();
    }, 2000);
});

// =====================================================
// QR MODAL FUNCTIONS
// =====================================================

// Bank configuration (same as balance-history)
const QR_BANK_CONFIG = {
    bin: '970416',
    name: 'ACB',
    accountNo: '75918',
    accountName: 'LAI THUY YEN NHI'
};

/**
 * Generate VietQR URL for bank transfer
 * @param {string} uniqueCode - Unique transaction code
 * @param {number} amount - Transfer amount (optional, 0 = no amount shown)
 * @returns {string} VietQR image URL
 */
function generateVietQRUrl(uniqueCode, amount = 0) {
    const baseUrl = 'https://img.vietqr.io/image';
    // Use compact2 when showing amount (has bank branding + amount line)
    // Use compact when no amount (bank branding without amount line)
    const template = amount > 0 ? 'compact2' : 'compact';
    let url = `${baseUrl}/${QR_BANK_CONFIG.bin}-${QR_BANK_CONFIG.accountNo}-${template}.png`;

    const params = new URLSearchParams();
    if (amount > 0) {
        params.append('amount', amount);
    }
    params.append('addInfo', uniqueCode);
    params.append('accountName', QR_BANK_CONFIG.accountName);

    return `${url}?${params.toString()}`;
}

/**
 * Show QR Modal for a phone number
 * @param {string} phone - Phone number
 * @param {number} amount - Transfer amount (optional)
 * @param {object} options - Display options { hideAccountNumber: boolean, showAccountNameOnly: boolean }
 */
function showOrderQRModal(phone, amount = 0, options = {}) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    // Get or create QR code
    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);
    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    // Generate QR URL with amount
    const qrUrl = generateVietQRUrl(uniqueCode, amount);

    // Get modal elements
    const modal = document.getElementById('orderQRModal');
    const modalBody = document.getElementById('orderQRModalBody');

    // Format amount for display
    const amountText = amount > 0 ? `<strong>Số tiền:</strong> <span style="color: #059669; font-weight: 700;">${amount.toLocaleString('vi-VN')}đ</span><br>` : '';

    // Build account info based on options
    let accountInfoHTML = '';
    if (options.showAccountNameOnly) {
        // Only show account name (for copyQRImageFromChat)
        accountInfoHTML = `<strong>Chủ TK:</strong> ${QR_BANK_CONFIG.accountName}<br>`;
    } else {
        // Show full info or hide account number based on hideAccountNumber option
        const bankLine = `<strong>Ngân hàng:</strong> ${QR_BANK_CONFIG.name}<br>`;
        const accountNoLine = options.hideAccountNumber ? '' : `<strong>Số TK:</strong> ${QR_BANK_CONFIG.accountNo}<br>`;
        const accountNameLine = `<strong>Chủ TK:</strong> ${QR_BANK_CONFIG.accountName}<br>`;
        accountInfoHTML = bankLine + accountNoLine + accountNameLine;
    }

    // Render modal content
    modalBody.innerHTML = `
        <img src="${qrUrl}" alt="QR Code" style="width: 280px; max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">

        <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: left; font-size: 13px;">
            <div style="margin-bottom: 8px;">
                ${accountInfoHTML}
                ${amountText}
            </div>
            <div style="padding: 8px; background: white; border: 2px dashed #dee2e6; border-radius: 6px; font-family: monospace; font-size: 13px; font-weight: bold; color: #495057; text-align: center;">
                ${uniqueCode}
            </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button onclick="copyQRCodeFromModal('${uniqueCode}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                <i class="fas fa-copy"></i> Copy mã
            </button>
            <button onclick="copyQRImageUrl('${qrUrl}')" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
                <i class="fas fa-image"></i> Copy URL
            </button>
        </div>

        <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #92400e; text-align: left;">
            <strong>Lưu ý:</strong> Khách hàng cần nhập đúng mã <strong>${uniqueCode}</strong> khi chuyển khoản.
        </div>
    `;

    // Show modal
    modal.style.display = 'flex';
}

/**
 * Close QR Modal
 */
function closeOrderQRModal() {
    const modal = document.getElementById('orderQRModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Copy QR code from modal
 * @param {string} uniqueCode - QR code to copy
 */
async function copyQRCodeFromModal(uniqueCode) {
    try {
        await navigator.clipboard.writeText(uniqueCode);
        showNotification('Đã copy QR', 'success');
    } catch (error) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = uniqueCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Đã copy QR', 'success');
    }
}

/**
 * Copy QR image URL
 * @param {string} url - URL to copy
 */
async function copyQRImageUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showNotification('Đã copy URL', 'success');
    } catch (error) {
        showNotification('Không thể copy', 'error');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function (event) {
    const modal = document.getElementById('orderQRModal');
    if (modal && event.target === modal) {
        closeOrderQRModal();
    }
});

// =====================================================
// QR FUNCTIONS FOR CHAT MODAL
// =====================================================

// QR Amount Toggle Setting
const QR_AMOUNT_SETTING_KEY = 'qr_show_amount';
let qrShowAmountEnabled = true; // Default: show amount

/**
 * Load QR amount toggle setting from localStorage and Firestore
 */
async function loadQRAmountSetting() {
    try {
        // 1. Try localStorage first (for quick load)
        if (window.userStorageManager) {
            const localValue = window.userStorageManager.loadFromLocalStorage(QR_AMOUNT_SETTING_KEY);
            if (localValue !== null) {
                qrShowAmountEnabled = localValue === true || localValue === 'true';
                updateQRAmountToggleUI();
                console.log('[QR-SETTING] Loaded from localStorage:', qrShowAmountEnabled);
            }
        }

        // 2. Try Firestore (source of truth)
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();
            const doc = await db.collection('settings').doc(QR_AMOUNT_SETTING_KEY).get();
            if (doc.exists) {
                const data = doc.data();
                qrShowAmountEnabled = data.enabled === true || data.enabled === 'true';
                // Sync to localStorage
                if (window.userStorageManager) {
                    window.userStorageManager.saveToLocalStorage(QR_AMOUNT_SETTING_KEY, qrShowAmountEnabled);
                }
                updateQRAmountToggleUI();
                console.log('[QR-SETTING] Loaded from Firestore:', qrShowAmountEnabled);
            }
        }
    } catch (error) {
        console.error('[QR-SETTING] Error loading setting:', error);
    }
}

/**
 * Save QR amount toggle setting to localStorage and Firestore
 */
async function saveQRAmountSetting() {
    try {
        // 1. Save to localStorage
        if (window.userStorageManager) {
            window.userStorageManager.saveToLocalStorage(QR_AMOUNT_SETTING_KEY, qrShowAmountEnabled);
            console.log('[QR-SETTING] Saved to localStorage:', qrShowAmountEnabled);
        }

        // 2. Save to Firestore
        if (window.firebase && window.firebase.firestore) {
            const db = window.firebase.firestore();
            await db.collection('settings').doc(QR_AMOUNT_SETTING_KEY).set({
                enabled: qrShowAmountEnabled,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('[QR-SETTING] Saved to Firestore:', qrShowAmountEnabled);
        }
    } catch (error) {
        console.error('[QR-SETTING] Error saving setting:', error);
    }
}

/**
 * Update QR amount toggle button UI
 */
function updateQRAmountToggleUI() {
    const toggleBtn = document.getElementById('qrAmountToggle');
    if (!toggleBtn) return;

    if (qrShowAmountEnabled) {
        toggleBtn.style.background = 'rgba(16, 185, 129, 0.8)'; // Green - enabled
        toggleBtn.title = 'Số tiền: BẬT - Click để tắt';
    } else {
        toggleBtn.style.background = 'rgba(107, 114, 128, 0.6)'; // Gray - disabled
        toggleBtn.title = 'Số tiền: TẮT - Click để bật';
    }
}

/**
 * Toggle QR amount setting
 */
async function toggleQRAmountSetting() {
    qrShowAmountEnabled = !qrShowAmountEnabled;
    updateQRAmountToggleUI();
    await saveQRAmountSetting();

    const statusText = qrShowAmountEnabled ? 'BẬT' : 'TẮT';
    showNotification(`Số tiền trong QR: ${statusText}`, 'info');
}

// Export toggle functions
window.toggleQRAmountSetting = toggleQRAmountSetting;
window.loadQRAmountSetting = loadQRAmountSetting;

// Load setting on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        loadQRAmountSetting();
    }, 1500);
});

/**
 * Copy QR image from chat modal to clipboard
 * Gets the current order's phone and copies the VietQR image with account name text below
 * The copied image includes QR code + "Chủ TK: [Account Name]" text
 */
async function copyQRImageFromChat() {
    if (!currentOrder || !currentOrder.Telephone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    const phone = currentOrder.Telephone;
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        showNotification('Số điện thoại không hợp lệ', 'warning');
        return;
    }

    // Get or create QR code
    const uniqueCode = getOrCreateQRForPhone(normalizedPhone);
    if (!uniqueCode) {
        showNotification('Không thể tạo mã QR', 'error');
        return;
    }

    // Always use 0 amount to allow customer to customize
    const amount = 0;

    // Generate QR URL with amount
    const qrUrl = generateVietQRUrl(uniqueCode, amount);

    try {
        // Fetch the QR image
        const response = await fetch(qrUrl);
        const blob = await response.blob();

        // Create an image element from the blob
        const img = new Image();
        const imageUrl = URL.createObjectURL(blob);

        // Wait for image to load
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });

        // Create canvas to draw QR + text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Canvas dimensions (QR image width + padding + text area)
        const padding = 20;
        const textHeight = 60;
        canvas.width = img.width + (padding * 2);
        canvas.height = img.height + textHeight + (padding * 2);

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw QR image
        ctx.drawImage(img, padding, padding, img.width, img.height);

        // Draw account name text below QR
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.textAlign = 'center';
        const accountNameText = `Chủ TK: ${QR_BANK_CONFIG.accountName}`;
        ctx.fillText(accountNameText, canvas.width / 2, img.height + padding + 30);

        // Convert canvas to blob
        const canvasBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png');
        });

        // Copy to clipboard
        const clipboardItem = new ClipboardItem({
            'image/png': canvasBlob
        });

        await navigator.clipboard.write([clipboardItem]);
        showNotification('Đã copy ảnh QR (có tên Chủ TK)', 'success');
        console.log(`[QR-CHAT] Copied QR image with account name for ${normalizedPhone}: ${uniqueCode}`);

        // Clean up
        URL.revokeObjectURL(imageUrl);
    } catch (error) {
        console.error('[QR-CHAT] Failed to copy image:', error);
        // Fallback: copy URL instead
        try {
            await navigator.clipboard.writeText(qrUrl);
            showNotification('Đã copy URL ảnh QR', 'success');
        } catch (fallbackError) {
            showNotification('Không thể copy ảnh QR', 'error');
        }
    }
}

/**
 * Show QR modal from chat modal
 * Opens the same QR modal as the table button
 * Always shows with amount = 0 to allow customer to customize
 */
function showQRFromChat() {
    if (!currentOrder || !currentOrder.Telephone) {
        showNotification('Không có số điện thoại', 'warning');
        return;
    }

    const phone = currentOrder.Telephone;
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        showNotification('Số điện thoại không hợp lệ', 'warning');
        return;
    }

    // Always use 0 amount to allow customer to customize
    const amount = 0;

    // Use existing QR modal function with amount = 0, hide account number (Số TK)
    showOrderQRModal(normalizedPhone, amount, { hideAccountNumber: true });
}

// Export functions globally
window.copyQRImageFromChat = copyQRImageFromChat;
window.showQRFromChat = showQRFromChat;

// =====================================================
// CHAT MODAL DEBT DISPLAY
// =====================================================

/**
 * Load and display wallet balance in chat modal header
 * NOTE: Always fetches fresh data from wallet API (same source as salePrepaidAmount)
 * @param {string} phone - Phone number
 */
async function loadChatDebt(phone) {
    const debtValueEl = document.getElementById('chatDebtValue');
    if (!debtValueEl) return;

    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        debtValueEl.textContent = '-';
        debtValueEl.style.color = 'rgba(255, 255, 255, 0.6)';
        return;
    }

    // Show loading
    debtValueEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    debtValueEl.style.color = 'rgba(255, 255, 255, 0.8)';

    // Always fetch fresh from wallet API (same source as salePrepaidAmount in fetchDebtForSaleModal)
    try {
        const response = await fetch(`${QR_API_URL}/api/v2/wallets/${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            // Total balance = real balance + virtual balance
            // API returns snake_case: balance, virtual_balance
            const realBalance = parseFloat(result.data.balance) || 0;
            const virtualBalance = parseFloat(result.data.virtual_balance) || 0;
            const totalBalance = realBalance + virtualBalance;
            console.log('[CHAT-DEBT] Wallet balance for phone:', normalizedPhone, '=', totalBalance);

            // Update cache for consistency with debt column
            saveDebtToCache(normalizedPhone, totalBalance);
            updateChatDebtDisplay(totalBalance, normalizedPhone);

            // Also update debt column in orders table to keep them in sync
            updateDebtCellsInTable(normalizedPhone, totalBalance);
        } else {
            updateChatDebtDisplay(0, normalizedPhone);
        }
    } catch (error) {
        console.error('[CHAT-DEBT] Error loading wallet balance:', error);
        debtValueEl.textContent = '-';
        debtValueEl.style.color = 'rgba(255, 255, 255, 0.6)';
    }
}

/**
 * Update chat modal debt display
 * @param {number} debt - Debt amount
 */
function updateChatDebtDisplay(debt, phone) {
    const debtValueEl = document.getElementById('chatDebtValue');
    if (!debtValueEl) return;

    let html = '';
    if (debt > 0) {
        html = `<span style="color: #4ade80;">${formatDebtCurrency(debt)}</span>`;
    } else {
        html = `<span style="color: rgba(255, 255, 255, 0.6);">0đ</span>`;
    }

    // Add recent transfer badge if applicable
    if (phone && typeof isRecentTransfer === 'function' && isRecentTransfer(phone)) {
        html += ' <span style="display: inline-block; background: #10b981; color: white; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 600;">CK</span>';
    }

    debtValueEl.innerHTML = html;
}

// Export chat debt function
window.loadChatDebt = loadChatDebt;

