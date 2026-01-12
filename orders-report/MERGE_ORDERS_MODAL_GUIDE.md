# Hướng Dẫn Chi Tiết Modal "Gộp Sản Phẩm Đơn Trùng SĐT" - Tab 1

> **Tài liệu tham khảo kỹ thuật đầy đủ về tính năng Gộp Sản Phẩm Đơn Trùng Số Điện Thoại**  
> **Cập nhật:** 2025-12-18

---

## 📋 Mục Lục

1. [Tổng Quan](#1-tổng-quan)
2. [Cấu Trúc HTML](#2-cấu-trúc-html)
3. [Biến Toàn Cục (State Variables)](#3-biến-toàn-cục-state-variables)
4. [Các Hàm JavaScript](#4-các-hàm-javascript)
5. [CSS Styles](#5-css-styles)
6. [Flow Xử Lý Chi Tiết](#6-flow-xử-lý-chi-tiết)
7. [API Endpoints](#7-api-endpoints)
8. [Firebase Integration](#8-firebase-integration)
9. [Tag Assignment Logic](#9-tag-assignment-logic)

---

## 1. Tổng Quan

### 1.1 Mô tả chức năng

Modal **"Gộp Sản Phẩm Đơn Trùng SĐT"** cho phép:
- Tìm các đơn hàng có cùng số điện thoại (duplicate orders)
- Hiển thị preview sản phẩm trước và sau khi gộp
- Gộp sản phẩm từ các đơn STT nhỏ vào đơn STT lớn nhất
- Tự động gán tag sau khi gộp:
  - **Đơn đích (STT lớn nhất):** Nhận tất cả tags từ các đơn + tag "Gộp X Y Z"
  - **Đơn nguồn (STT nhỏ):** Chỉ giữ tag "ĐÃ GỘP KO CHỐT"
- Xem lịch sử gộp đơn

### 1.2 Vị trí trong ứng dụng

- **Tab:** Tab 1 - Orders (Đơn hàng)
- **URL:** https://nhijudyshop.github.io/n2store
- **File chính:**
  - HTML: `orders-report/tab1-orders.html` (dòng 2436-2510)
  - JS: `orders-report/tab1-orders.js` (dòng 16908-18118)
  - CSS: `orders-report/tab1-orders.css` (dòng 3391-3950)

### 1.3 Nút mở Modal

```html
<button class="btn-primary" id="mergeProductsBtn" onclick="showMergeDuplicateOrdersModal()"
    style="background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)"
    title="Gộp sản phẩm từ các đơn có cùng SĐT vào đơn STT lớn nhất">
    <i class="fas fa-compress-arrows-alt"></i>
    Gộp sản phẩm đơn trùng SĐT
</button>
```
- **Vị trí:** Dòng 309-314 trong `tab1-orders.html`

---

## 2. Cấu Trúc HTML

### 2.1 Modal Chính (mergeDuplicateOrdersModal)

```html
<!-- Merge Duplicate Orders Modal -->
<div class="merge-modal" id="mergeDuplicateOrdersModal">
    <div class="merge-modal-content">
        <!-- Header -->
        <div class="merge-modal-header">
            <div class="merge-header-info">
                <h3><i class="fas fa-compress-arrows-alt"></i> Gộp Sản Phẩm Đơn Trùng SĐT</h3>
                <p id="mergeDuplicateModalSubtitle">Chọn các cụm đơn hàng cần gộp</p>
            </div>
            <div class="merge-header-actions">
                <button class="merge-history-btn" onclick="showMergeHistoryModal()" title="Xem lịch sử gộp đơn">
                    <i class="fas fa-history"></i> Lịch sử
                </button>
                <label class="merge-select-all-label">
                    <input type="checkbox" id="mergeSelectAllCheckbox"
                        onchange="toggleSelectAllMergeClusters(this.checked)">
                    <span>Chọn tất cả</span>
                </label>
                <button class="merge-modal-close" onclick="closeMergeDuplicateOrdersModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Body - Clusters List -->
        <div class="merge-modal-body" id="mergeDuplicateModalBody">
            <div class="merge-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải dữ liệu...</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="merge-modal-footer">
            <button class="merge-btn-cancel" onclick="closeMergeDuplicateOrdersModal()">
                <i class="fas fa-times"></i> Hủy
            </button>
            <button class="merge-btn-confirm" id="confirmMergeBtn" onclick="confirmMergeSelectedClusters()">
                <i class="fas fa-check"></i> Xác nhận Gộp Đơn
            </button>
        </div>
    </div>
</div>
```

### 2.2 Modal Lịch Sử (mergeHistoryModal)

```html
<!-- Merge History Modal -->
<div class="merge-modal" id="mergeHistoryModal">
    <div class="merge-modal-content" style="max-width: 1400px;">
        <!-- Header -->
        <div class="merge-modal-header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
            <div class="merge-header-info">
                <h3><i class="fas fa-history"></i> Lịch Sử Gộp Đơn Hàng</h3>
                <p id="mergeHistoryModalSubtitle">Xem lại các lần gộp đơn trước đây</p>
            </div>
            <div class="merge-header-actions">
                <button class="merge-modal-close" onclick="closeMergeHistoryModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Body - History List -->
        <div class="merge-modal-body" id="mergeHistoryModalBody">
            <div class="merge-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải lịch sử...</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="merge-modal-footer">
            <button class="merge-btn-cancel" onclick="closeMergeHistoryModal()">
                <i class="fas fa-times"></i> Đóng
            </button>
        </div>
    </div>
</div>
```

---

## 3. Biến Toàn Cục (State Variables)

### 3.1 Định nghĩa biến

```javascript
// Dữ liệu các cụm đơn hàng trùng SĐT
let mergeClustersData = [];

// Set chứa các cluster ID được chọn
let selectedMergeClusters = new Set();

// Firebase collection cho lịch sử gộp đơn
const MERGE_HISTORY_COLLECTION = 'merge_orders_history';

// Tag constants
const MERGE_TAG_COLOR = '#E3A21A';
const MERGED_ORDER_TAG_NAME = 'ĐÃ GỘP KO CHỐT';
```

### 3.2 Cấu trúc dữ liệu `mergeClustersData`

```javascript
// Mỗi cluster (cụm đơn trùng SĐT) có cấu trúc:
{
    id: "cluster_0",                    // ID duy nhất
    phone: "0912345678",                // Số điện thoại chung
    orders: [                           // Tất cả đơn trong cụm (đã sort theo STT)
        { Id, SessionIndex, PartnerName, Tags, Details: [...] },
        ...
    ],
    targetOrder: { ... },               // Đơn đích (STT lớn nhất)
    sourceOrders: [ ... ],              // Các đơn nguồn (STT nhỏ hơn)
    mergedProducts: [                   // Preview sản phẩm sau khi gộp
        { ProductId, ProductName, Quantity, Price, Note, ... }
    ]
}
```

---

## 4. Các Hàm JavaScript

### 4.1 Hàm Mở/Đóng Modal

#### `showMergeDuplicateOrdersModal()`
**Mục đích:** Mở modal và tải dữ liệu các đơn trùng SĐT

```javascript
async function showMergeDuplicateOrdersModal() {
    const modal = document.getElementById('mergeDuplicateOrdersModal');
    const modalBody = document.getElementById('mergeDuplicateModalBody');
    const subtitle = document.getElementById('mergeDuplicateModalSubtitle');
    const selectAllCheckbox = document.getElementById('mergeSelectAllCheckbox');

    // Reset state
    mergeClustersData = [];
    selectedMergeClusters.clear();
    selectAllCheckbox.checked = false;

    // Show modal with loading state
    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải dữ liệu đơn hàng...</p>
        </div>
    `;

    try {
        // Group orders by phone number to find duplicates
        const phoneGroups = new Map();
        displayedData.forEach(order => {
            const phone = order.Telephone?.trim();
            if (phone) {
                if (!phoneGroups.has(phone)) {
                    phoneGroups.set(phone, []);
                }
                phoneGroups.get(phone).push(order);
            }
        });

        // Find phone numbers with multiple orders (need merging)
        const clusters = [];
        phoneGroups.forEach((orders, phone) => {
            if (orders.length > 1) {
                // Sort by SessionIndex (STT) ascending
                orders.sort((a, b) => (a.SessionIndex || 0) - (b.SessionIndex || 0));

                // Target is highest STT (last after sort)
                const targetOrder = orders[orders.length - 1];
                const sourceOrders = orders.slice(0, -1);

                clusters.push({
                    phone,
                    orders,
                    targetOrder,
                    sourceOrders,
                    minSTT: orders[0].SessionIndex || 0
                });
            }
        });

        // Sort clusters by minSTT
        clusters.sort((a, b) => a.minSTT - b.minSTT);

        // Fetch full details for all orders (in batches)
        // ... fetch order details logic

        // Build clusters with full product details
        mergeClustersData = clusters.map((cluster, index) => ({
            id: `cluster_${index}`,
            phone: cluster.phone,
            orders: ordersWithDetails,
            targetOrder: ordersWithDetails[ordersWithDetails.length - 1],
            sourceOrders: ordersWithDetails.slice(0, -1),
            mergedProducts: calculateMergedProductsPreview(ordersWithDetails)
        }));

        // Render clusters
        renderMergeClusters();

    } catch (error) {
        console.error('[MERGE-MODAL] Error loading data:', error);
        // Show error message
    }
}
```

#### `closeMergeDuplicateOrdersModal()`
**Mục đích:** Đóng modal và reset state

```javascript
function closeMergeDuplicateOrdersModal() {
    const modal = document.getElementById('mergeDuplicateOrdersModal');
    modal.classList.remove('show');

    // Reset state
    mergeClustersData = [];
    selectedMergeClusters.clear();
}
```

---

### 4.2 Hàm Tính Toán Preview

#### `calculateMergedProductsPreview(orders)`
**Mục đích:** Tính toán sản phẩm sau khi gộp (gộp theo ProductId)

```javascript
function calculateMergedProductsPreview(orders) {
    const productMap = new Map(); // key: ProductId, value: merged product

    orders.forEach(order => {
        (order.Details || []).forEach(detail => {
            const key = detail.ProductId;
            if (productMap.has(key)) {
                const existing = productMap.get(key);
                // Cộng dồn số lượng
                existing.Quantity = (existing.Quantity || 0) + (detail.Quantity || 0);
                // Gộp note
                if (detail.Note && !existing.Note?.includes(detail.Note)) {
                    existing.Note = existing.Note ? `${existing.Note}, ${detail.Note}` : detail.Note;
                }
            } else {
                productMap.set(key, { ...detail });
            }
        });
    });

    return Array.from(productMap.values());
}
```

---

### 4.3 Hàm Render UI

#### `renderMergeClusters()`
**Mục đích:** Render tất cả các cluster cards trong modal

```javascript
function renderMergeClusters() {
    const modalBody = document.getElementById('mergeDuplicateModalBody');

    if (mergeClustersData.length === 0) {
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-check-circle"></i>
                <p>Không có đơn hàng nào trùng SĐT cần gộp.</p>
            </div>
        `;
        return;
    }

    const html = mergeClustersData.map(cluster => renderClusterCard(cluster)).join('');
    modalBody.innerHTML = html;

    updateConfirmButtonState();
}
```

#### `renderClusterCard(cluster)`
**Mục đích:** Render một cluster card với bảng so sánh sản phẩm

```javascript
function renderClusterCard(cluster) {
    const isSelected = selectedMergeClusters.has(cluster.id);
    const orderTitles = cluster.orders.map(o => `STT ${o.SessionIndex} - ${o.PartnerName || 'N/A'}`).join(' | ');

    // Build table headers
    const headers = [
        `<th class="merged-col">Sau Khi Gộp<br><small>(STT ${cluster.targetOrder.SessionIndex})</small></th>`
    ];

    cluster.orders.forEach(order => {
        const isTarget = order.Id === cluster.targetOrder.Id;
        const className = isTarget ? 'target-col' : '';
        const targetLabel = isTarget ? ' (Đích)' : '';
        const tagsHtml = renderMergeTagPills(order.Tags);

        headers.push(`<th class="${className}">
            STT ${order.SessionIndex} - ${order.PartnerName || 'N/A'}${targetLabel}
            ${tagsHtml}
        </th>`);
    });

    // Build table rows for products
    // ... row building logic

    return `
        <div class="merge-cluster-card ${isSelected ? 'selected' : ''}" data-cluster-id="${cluster.id}">
            <div class="merge-cluster-header">
                <input type="checkbox" class="merge-cluster-checkbox"
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleMergeClusterSelection('${cluster.id}', this.checked)">
                <div class="merge-cluster-title"># ${orderTitles}</div>
                <div class="merge-cluster-phone"><i class="fas fa-phone"></i> ${cluster.phone}</div>
            </div>
            <div class="merge-cluster-table-wrapper">
                <table class="merge-cluster-table">
                    <thead><tr>${headers.join('')}</tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
        </div>
    `;
}
```

#### `renderProductItem(product)`
**Mục đích:** Render một sản phẩm trong bảng

```javascript
function renderProductItem(product) {
    const imgUrl = product.ProductImageUrl || product.ImageUrl || '';
    const imgHtml = imgUrl
        ? `<img src="${imgUrl}" alt="" class="merge-product-img" onerror="this.style.display='none'">`
        : `<div class="merge-product-img" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;"><i class="fas fa-box"></i></div>`;

    const productName = product.ProductName || 'Sản phẩm';
    const productCode = product.ProductCode || '';
    const price = product.Price ? `${(product.Price).toLocaleString('vi-VN')}đ` : '';
    const note = product.Note || '';

    return `
        <div class="merge-product-item">
            ${imgHtml}
            <div class="merge-product-info">
                <div class="merge-product-name" title="${productName}">${productName}</div>
                ${productCode ? `<span class="merge-product-code">${productCode}</span>` : ''}
                <div class="merge-product-details">
                    <span class="qty">SL: ${product.Quantity || 0}</span>
                    ${price ? ` | <span class="price">${price}</span>` : ''}
                </div>
                ${note ? `<div class="merge-product-note">Note: ${note}</div>` : ''}
            </div>
        </div>
    `;
}
```

#### `renderMergeTagPills(tags)`
**Mục đích:** Render tag pills trong header của bảng

```javascript
function renderMergeTagPills(tags) {
    let tagsArray = [];

    if (!tags) return '';

    // Parse tags if string
    if (typeof tags === 'string' && tags.trim() !== '') {
        try {
            tagsArray = JSON.parse(tags);
        } catch (e) {
            return '';
        }
    } else if (Array.isArray(tags)) {
        tagsArray = tags;
    }

    if (!Array.isArray(tagsArray) || tagsArray.length === 0) return '';

    const pillsHtml = tagsArray.map(t =>
        `<span class="merge-tag-pill" style="background: ${t.Color || '#6b7280'};" title="${escapeHtml(t.Name || '')}">${escapeHtml(t.Name || '')}</span>`
    ).join('');

    return `<div class="merge-header-tags">${pillsHtml}</div>`;
}
```

---

### 4.4 Hàm Selection

#### `toggleMergeClusterSelection(clusterId, checked)`
**Mục đích:** Toggle chọn một cluster

```javascript
function toggleMergeClusterSelection(clusterId, checked) {
    if (checked) {
        selectedMergeClusters.add(clusterId);
    } else {
        selectedMergeClusters.delete(clusterId);
    }

    // Update card visual
    const card = document.querySelector(`.merge-cluster-card[data-cluster-id="${clusterId}"]`);
    if (card) {
        card.classList.toggle('selected', checked);
    }

    // Update select all checkbox
    updateSelectAllCheckbox();
    updateConfirmButtonState();
}
```

#### `toggleSelectAllMergeClusters(checked)`
**Mục đích:** Toggle chọn tất cả clusters

```javascript
function toggleSelectAllMergeClusters(checked) {
    if (checked) {
        mergeClustersData.forEach(cluster => {
            selectedMergeClusters.add(cluster.id);
        });
    } else {
        selectedMergeClusters.clear();
    }

    // Update all checkboxes and cards
    document.querySelectorAll('.merge-cluster-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
    });
    document.querySelectorAll('.merge-cluster-card').forEach(card => {
        card.classList.toggle('selected', checked);
    });

    updateConfirmButtonState();
}
```

---

### 4.5 Hàm Thực Thi Gộp Đơn

#### `confirmMergeSelectedClusters()`
**Mục đích:** Xác nhận và thực hiện gộp các clusters đã chọn

```javascript
async function confirmMergeSelectedClusters() {
    if (selectedMergeClusters.size === 0) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng chọn ít nhất một cụm đơn hàng để gộp.', 'warning');
        }
        return;
    }

    const selectedClusters = mergeClustersData.filter(c => selectedMergeClusters.has(c.id));
    const totalSourceOrders = selectedClusters.reduce((sum, c) => sum + c.sourceOrders.length, 0);

    const confirmMsg = `Bạn sắp gộp ${selectedClusters.length} cụm đơn hàng (${totalSourceOrders + selectedClusters.length} đơn).\n\n` +
        `Hành động này sẽ:\n` +
        `- Gộp sản phẩm từ đơn STT nhỏ → đơn STT lớn\n` +
        `- Xóa sản phẩm khỏi ${totalSourceOrders} đơn nguồn\n\n` +
        `Tiếp tục?`;

    const confirmed = await window.notificationManager.confirm(confirmMsg, "Xác nhận gộp đơn");
    if (!confirmed) return;

    // Close modal and show loading
    closeMergeDuplicateOrdersModal();

    // Load available tags before merge (needed for tag assignment)
    await loadAvailableTags();

    // Execute merge for each selected cluster
    const results = [];
    for (const cluster of selectedClusters) {
        const mergeData = {
            Telephone: cluster.phone,
            TargetOrderId: cluster.targetOrder.Id,
            TargetSTT: cluster.targetOrder.SessionIndex,
            SourceOrderIds: cluster.sourceOrders.map(o => o.Id),
            SourceSTTs: cluster.sourceOrders.map(o => o.SessionIndex),
            IsMerged: true
        };

        const result = await executeMergeOrderProducts(mergeData);
        results.push({ cluster, result });

        // Save merge history to Firebase
        await saveMergeHistory(cluster, result, result.errorResponse || null);

        // If merge successful, assign tags
        if (result.success) {
            const tagResult = await assignTagsAfterMerge(cluster);
            // ... handle tag result
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Show summary notification
    const successCount = results.filter(r => r.result.success).length;
    // ... show notification

    // Refresh table
    await fetchOrders();
}
```

---

### 4.6 Hàm Firebase History

#### `saveMergeHistory(cluster, result, errorResponse)`
**Mục đích:** Lưu lịch sử gộp đơn vào Firestore

```javascript
async function saveMergeHistory(cluster, result, errorResponse = null) {
    if (!db) {
        console.warn('[MERGE-HISTORY] Firebase not available');
        return;
    }

    try {
        const { userId, userName } = getMergeHistoryUserInfo();
        const timestamp = new Date();

        // Build source orders data with original tags
        const sourceOrdersData = cluster.sourceOrders.map(order => ({
            orderId: order.Id,
            stt: order.SessionIndex,
            partnerName: order.PartnerName || '',
            originalTags: getOrderTagsArray(order).map(t => ({
                id: t.Id,
                name: t.Name || '',
                color: t.Color || ''
            })),
            products: (order.Details || []).map(p => ({
                productId: p.ProductId,
                productCode: p.ProductCode || '',
                productName: p.ProductName || '',
                productImage: p.ProductImageUrl || p.ImageUrl || '',
                quantity: p.Quantity || 0,
                price: p.Price || 0,
                note: p.Note || ''
            }))
        }));

        // Build target order data
        const targetOrderData = {
            orderId: cluster.targetOrder.Id,
            stt: cluster.targetOrder.SessionIndex,
            partnerName: cluster.targetOrder.PartnerName || '',
            originalTags: getOrderTagsArray(cluster.targetOrder).map(t => ({
                id: t.Id,
                name: t.Name || '',
                color: t.Color || ''
            })),
            products: (cluster.targetOrder.Details || []).map(p => ({...}))
        };

        const historyEntry = {
            phone: cluster.phone,
            timestamp: firebase.firestore.Timestamp.fromDate(timestamp),
            timestampISO: timestamp.toISOString(),
            userId: userId,
            userName: userName,
            success: result.success,
            errorMessage: result.success ? null : result.message,
            errorResponse: errorResponse ? JSON.stringify(errorResponse) : null,
            sourceOrders: sourceOrdersData,
            targetOrder: targetOrderData,
            mergedProducts: mergedProductsData,
            totalSourceOrders: sourceOrdersData.length,
            totalMergedProducts: mergedProductsData.length
        };

        await db.collection(MERGE_HISTORY_COLLECTION).add(historyEntry);
        
    } catch (error) {
        console.error('[MERGE-HISTORY] Error saving history:', error);
    }
}
```

#### `loadMergeHistory(limit)`
**Mục đích:** Load lịch sử gộp đơn từ Firestore

```javascript
async function loadMergeHistory(limit = 50) {
    if (!db) return [];

    try {
        const snapshot = await db.collection(MERGE_HISTORY_COLLECTION)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const history = [];
        snapshot.forEach(doc => {
            history.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return history;
    } catch (error) {
        console.error('[MERGE-HISTORY] Error loading history:', error);
        return [];
    }
}
```

#### `showMergeHistoryModal()`
**Mục đích:** Mở modal lịch sử và load dữ liệu

```javascript
async function showMergeHistoryModal() {
    const modal = document.getElementById('mergeHistoryModal');
    const modalBody = document.getElementById('mergeHistoryModalBody');

    modal.classList.add('show');
    // Show loading, load history, render entries
}
```

---

### 4.7 Hàm Tag Assignment

#### `ensureMergeTagExists(tagName, color)`
**Mục đích:** Đảm bảo tag tồn tại, tạo mới nếu chưa có

```javascript
async function ensureMergeTagExists(tagName, color = MERGE_TAG_COLOR) {
    // 1. Fetch fresh tags from API
    // 2. Check if tag exists (case-insensitive)
    // 3. If not exists, create new tag via API
    // 4. Update local tags list + Firebase
    // 5. Return tag object { Id, Name, Color }
}
```

#### `assignTagsAfterMerge(cluster)`
**Mục đích:** Gán tags sau khi merge thành công

```javascript
async function assignTagsAfterMerge(cluster) {
    try {
        // Step 1: Ensure "ĐÃ GỘP KO CHỐT" tag exists
        const mergedTag = await ensureMergeTagExists(MERGED_ORDER_TAG_NAME, MERGE_TAG_COLOR);

        // Step 2: Create "Gộp X Y Z" tag (X, Y, Z là các STT)
        const allSTTs = cluster.orders.map(o => o.SessionIndex).sort((a, b) => a - b);
        const mergeTagName = `Gộp ${allSTTs.join(' ')}`;
        const mergeGroupTag = await ensureMergeTagExists(mergeTagName, MERGE_TAG_COLOR);

        // Step 3: Collect all tags from all orders (for target order)
        const allTags = new Map();

        // Exclude merge-related tags when collecting
        const shouldExcludeTag = (tagName) => {
            if (tagName === MERGED_ORDER_TAG_NAME) return true;
            if (tagName.startsWith('Gộp ')) return true;
            return false;
        };

        // Add tags from target order
        const targetTags = getOrderTagsArray(cluster.targetOrder);
        targetTags.forEach(t => {
            if (t.Id && !shouldExcludeTag(t.Name)) {
                allTags.set(t.Id, t);
            }
        });

        // Add tags from source orders
        cluster.sourceOrders.forEach(sourceOrder => {
            const sourceTags = getOrderTagsArray(sourceOrder);
            sourceTags.filter(t => t.Id && !shouldExcludeTag(t.Name)).forEach(t => {
                allTags.set(t.Id, t);
            });
        });

        // Add merge group tag
        allTags.set(mergeGroupTag.Id, mergeGroupTag);

        const targetOrderNewTags = Array.from(allTags.values());

        // Step 4: Assign all collected tags to target order
        await assignTagsToOrder(cluster.targetOrder.Id, targetOrderNewTags);

        // Step 5: Assign only "ĐÃ GỘP KO CHỐT" to source orders
        for (const sourceOrder of cluster.sourceOrders) {
            await assignTagsToOrder(sourceOrder.Id, [mergedTag]);
        }

        return { success: true, ... };

    } catch (error) {
        return { success: false, error };
    }
}
```

#### `getOrderTagsArray(order)`
**Mục đích:** Parse tags từ order object

```javascript
function getOrderTagsArray(order) {
    if (!order || !order.Tags) return [];

    const tagsData = order.Tags;

    // Case 1: Tags đã là array
    if (Array.isArray(tagsData)) return tagsData;

    // Case 2: Tags là JSON string
    if (typeof tagsData === 'string' && tagsData.trim() !== '') {
        try {
            const parsed = JSON.parse(tagsData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    return [];
}
```

---

## 5. CSS Styles

### 5.1 File và vị trí

- **File:** `orders-report/tab1-orders.css`
- **Dòng:** 3391 - 3950

### 5.2 Các CSS Classes chính

| Class | Mô tả | Dòng |
|-------|-------|------|
| `.merge-modal` | Container modal chính | 3395-3407 |
| `.merge-modal.show` | State khi modal hiển thị | 3409-3411 |
| `.merge-modal-content` | Nội dung modal | 3413-3434 |
| `.merge-modal-header` | Header gradient tím | 3436-3456 |
| `.merge-header-actions` | Actions trong header | 3458-3478 |
| `.merge-modal-body` | Body chứa clusters | 3500-3507 |
| `.merge-modal-footer` | Footer với buttons | 3524-3532 |
| `.merge-cluster-card` | Card cho mỗi cluster | 3580-3592 |
| `.merge-cluster-header` | Header của cluster | 3594-3622 |
| `.merge-cluster-table` | Bảng so sánh sản phẩm | 3630-3667 |
| `.merge-product-item` | Item sản phẩm | 3692-3755 |
| `.merge-history-entry` | Entry trong lịch sử | 3804-3902 |
| `.merge-history-error` | Hiển thị lỗi | 3905-3931 |

### 5.3 Animation

```css
@keyframes mergeModalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### 5.4 Color Scheme

| Element | Color | Mô tả |
|---------|-------|-------|
| Modal Header | `#a855f7 → #7c3aed` | Gradient tím |
| Cluster Header | `#6366f1 → #4f46e5` | Gradient indigo |
| Merged Column | `#d8b4fe → #c4b5fd` / `#faf5ff` | Tím nhạt |
| Target Column | `#bbf7d0` / `#f0fdf4` | Xanh lá nhạt |
| Success Status | `#22c55e` / `#dcfce7` | Xanh lá |
| Failed Status | `#ef4444` / `#fee2e2` | Đỏ |

---

## 6. Flow Xử Lý Chi Tiết

### 6.1 Flow Mở Modal

```
1. User click nút "Gộp sản phẩm đơn trùng SĐT"
   ↓
2. showMergeDuplicateOrdersModal() được gọi
   ↓
3. Reset state: mergeClustersData = [], selectedMergeClusters.clear()
   ↓
4. Hiển thị modal với loading spinner
   ↓
5. Group đơn hàng theo SĐT từ displayedData
   ├── Tạo Map<phone, orders[]>
   └── Lọc ra những SĐT có > 1 đơn
   ↓
6. Với mỗi nhóm trùng SĐT:
   ├── Sort đơn theo SessionIndex (tăng dần)
   ├── targetOrder = đơn cuối (STT lớn nhất)
   └── sourceOrders = các đơn còn lại
   ↓
7. Fetch chi tiết sản phẩm (Details) từ API
   ├── Batch 5 đơn/lần để tránh rate limit
   └── Delay 200ms giữa các batch
   ↓
8. calculateMergedProductsPreview() cho mỗi cluster
   ↓
9. renderMergeClusters() - hiển thị các cluster cards
```

### 6.2 Flow Gộp Đơn (Execution)

```
1. User chọn các cluster cần gộp (checkbox)
   ↓
2. User click "Xác nhận Gộp Đơn"
   ↓
3. confirmMergeSelectedClusters() được gọi
   ↓
4. Validate: ít nhất 1 cluster được chọn
   ↓
5. Hiển thị confirm dialog
   ├── Số lượng cluster, số đơn
   └── Cảnh báo: xóa SP khỏi đơn nguồn
   ↓
6. Đóng modal, show loading notification
   ↓
7. await loadAvailableTags() - load tags cho assignment
   ↓
8. FOR EACH selectedCluster:
   │
   ├── Gọi executeMergeOrderProducts(mergeData)
   │   ├── Gộp sản phẩm vào targetOrder
   │   └── Xóa sản phẩm khỏi sourceOrders
   │
   ├── saveMergeHistory() - lưu lịch sử Firebase
   │
   ├── [IF merge success]
   │   └── assignTagsAfterMerge(cluster)
   │       ├── Tạo tag "ĐÃ GỘP KO CHỐT" nếu chưa có
   │       ├── Tạo tag "Gộp X Y Z" (X,Y,Z = STTs)
   │       ├── Gán TẤT CẢ tags vào targetOrder
   │       └── Gán CHỈ "ĐÃ GỘP KO CHỐT" vào sourceOrders
   │
   └── Delay 500ms giữa các cluster
   ↓
9. Hiển thị summary notification (success/failed)
   ↓
10. await fetchOrders() - refresh bảng đơn hàng
```

### 6.3 Flow Tag Assignment

```
                    ┌──────────────────────────────────┐
                    │        TRƯỚC KHI MERGE           │
                    └──────────────────────────────────┘
                    
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │   STT 5 (source) │    │   STT 8 (source) │    │  STT 12 (target)│
    │   Tags: [A, B]   │    │   Tags: [B, C]   │    │   Tags: [D]     │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
    
                              ↓ MERGE ↓
                              
                    ┌──────────────────────────────────┐
                    │         SAU KHI MERGE            │
                    └──────────────────────────────────┘
                    
    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐
    │   STT 5 (source) │    │   STT 8 (source) │    │      STT 12 (target)    │
    │   Tags:          │    │   Tags:          │    │   Tags:                 │
    │   [ĐÃ GỘP KO    │    │   [ĐÃ GỘP KO    │    │   [A, B, C, D,          │
    │    CHỐT]         │    │    CHỐT]         │    │    Gộp 5 8 12]          │
    └─────────────────┘    └─────────────────┘    └─────────────────────────┘
```

---

## 7. API Endpoints

### 7.1 Lấy Chi Tiết Đơn Hàng

```javascript
// Via getOrderDetails(orderId) function
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnlineOrder({orderId})?$expand=Details
```

### 7.2 Cập Nhật Sản Phẩm Đơn Hàng

```javascript
// Via executeMergeOrderProducts()
PATCH https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnlineOrder({orderId})

// Body
{
    "Details": [
        { "ProductId": "...", "Quantity": X, ... }
    ]
}
```

### 7.3 Gán Tag

```javascript
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag

// Body
{
    "Tags": [
        { "Id": 123, "Name": "TAG NAME", "Color": "#hex" }
    ],
    "OrderId": "order-id"
}
```

### 7.4 Tạo Tag Mới

```javascript
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag

// Body
{
    "Name": "ĐÃ GỘP KO CHỐT",
    "Color": "#E3A21A"
}
```

---

## 8. Firebase Integration

### 8.1 Firestore Collection

**Collection:** `merge_orders_history`

### 8.2 Document Structure

```javascript
{
    phone: "0912345678",
    timestamp: Firestore.Timestamp,
    timestampISO: "2025-12-18T00:00:00.000Z",
    userId: "user-id",
    userName: "Tên Người Dùng",
    success: true,
    errorMessage: null,          // hoặc "Error message"
    errorResponse: null,         // hoặc JSON string của error response
    
    sourceOrders: [
        {
            orderId: "...",
            stt: 5,
            partnerName: "Khách hàng A",
            originalTags: [
                { id: 1, name: "Tag A", color: "#fff" }
            ],
            products: [
                { productId, productCode, productName, productImage, quantity, price, note }
            ]
        }
    ],
    
    targetOrder: {
        orderId: "...",
        stt: 12,
        partnerName: "Khách hàng A",
        originalTags: [...],
        products: [...]
    },
    
    mergedProducts: [
        { productId, productCode, productName, productImage, quantity, price, note }
    ],
    
    totalSourceOrders: 2,
    totalMergedProducts: 5
}
```

---

## 9. Tag Assignment Logic

### 9.1 Constants

```javascript
const MERGE_TAG_COLOR = '#E3A21A';                   // Màu vàng cam
const MERGED_ORDER_TAG_NAME = 'ĐÃ GỘP KO CHỐT';     // Tên tag cho đơn nguồn
```

### 9.2 Quy Tắc Gán Tag

| Loại Đơn | Tags Được Gán |
|----------|---------------|
| **Target Order** (STT lớn nhất) | Tất cả tags từ source orders + target order + tag "Gộp X Y Z" |
| **Source Orders** (STT nhỏ) | Chỉ tag "ĐÃ GỘP KO CHỐT" (xóa hết tags cũ) |

### 9.3 Tags Bị Loại Trừ Khi Thu Thập

- `"ĐÃ GỘP KO CHỐT"` - tag cho đơn đã gộp
- Tags bắt đầu bằng `"Gộp "` - tags từ lần gộp trước

### 9.4 Ví Dụ

**Trước merge:**
- STT 5: Tags = ["HOT", "VIP"]
- STT 8: Tags = ["VIP", "ƯU TIÊN"]  
- STT 12 (target): Tags = ["THƯỜNG"]

**Sau merge:**
- STT 5: Tags = ["ĐÃ GỘP KO CHỐT"]
- STT 8: Tags = ["ĐÃ GỘP KO CHỐT"]
- STT 12: Tags = ["HOT", "VIP", "ƯU TIÊN", "THƯỜNG", "Gộp 5 8 12"]

---

## 📝 Lưu Ý Quan Trọng

1. **Rate Limiting:** Fetch chi tiết đơn hàng theo batch 5 đơn/lần, delay 200ms
2. **Merge Direction:** Luôn gộp từ STT nhỏ → STT lớn
3. **Product Merge:** Sản phẩm cùng ProductId được cộng dồn số lượng
4. **Tag Preservation:** Tất cả tags từ source orders được chuyển sang target (trừ merge-related tags)
5. **Source Orders:** Sau merge, source orders chỉ còn tag "ĐÃ GỘP KO CHỐT"
6. **History:** Lưu đầy đủ thông tin bao gồm originalTags trước khi merge
7. **Auto Refresh:** Sau khi gộp xong, tự động refresh bảng đơn hàng

---

*Tài liệu này được tạo tự động từ phân tích code. Cập nhật: 2025-12-18*
