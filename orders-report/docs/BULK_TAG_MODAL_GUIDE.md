# Hướng Dẫn Chi Tiết Modal "Gán Tag Hàng Loạt" - Tab 1

> **Tài liệu tham khảo kỹ thuật đầy đủ về tính năng Gán Tag Hàng Loạt**  
> **Cập nhật:** 2025-12-17

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

---

## 1. Tổng Quan

### 1.1 Mô tả chức năng

Modal **"Gán Tag Hàng Loạt"** cho phép người dùng:
- Thêm nhiều tag khác nhau vào danh sách
- Nhập STT (Số Thứ Tự) đơn hàng tương ứng cho mỗi tag
- Gán tag cho nhiều đơn hàng cùng lúc
- Xem lịch sử gán tag
- Lưu bản nháp vào localStorage để tiếp tục sau

### 1.2 Vị trí trong ứng dụng

- **Tab:** Tab 1 - Orders (Đơn hàng)
- **URL:** https://nhijudyshop.github.io/n2store
- **File chính:**
  - HTML: `orders-report/tab1-orders.html` (dòng 2513-2617)
  - JS: `orders-report/tab1-orders.js` (dòng 2891-4177)
  - CSS: `orders-report/tab1-orders.css` (dòng 5219-6215)

### 1.3 Nút mở Modal

```html
<button class="btn-primary" id="bulkTagModalBtn" onclick="showBulkTagModal()"
    style="background: linear-gradient(135deg, #10b981 0%, #059669 100%)"
    title="Gán tag hàng loạt cho nhiều đơn hàng">
    <i class="fas fa-tags"></i>
    Gán Tag Hàng Loạt
</button>
```
- **Vị trí:** Dòng 315-320 trong `tab1-orders.html`

---

## 2. Cấu Trúc HTML

### 2.1 Modal Chính (bulkTagModal)

```html
<!-- Bulk Tag Modal -->
<div class="bulk-tag-modal" id="bulkTagModal">
    <div class="bulk-tag-modal-content">
        <!-- Header -->
        <div class="bulk-tag-modal-header">
            <div class="bulk-tag-header-info">
                <h3><i class="fas fa-tags"></i> Gán Tag Hàng Loạt</h3>
                <p id="bulkTagModalSubtitle">Thêm tag và nhập STT đơn hàng tương ứng</p>
            </div>
            <div class="bulk-tag-header-actions">
                <button class="bulk-tag-history-btn" onclick="showBulkTagHistoryModal()" title="Xem lịch sử gán tag">
                    <i class="fas fa-history"></i> Lịch sử
                </button>
                <button class="bulk-tag-modal-close" onclick="closeBulkTagModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Search and Controls -->
        <div class="bulk-tag-search-section">
            <div class="bulk-tag-search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="bulkTagModalSearchInput" 
                       placeholder="Tìm kiếm tag (nhập tên tag)..."
                       oninput="filterBulkTagModalOptions()"
                       onfocus="showBulkTagModalDropdown()"
                       onkeydown="handleBulkTagModalSearchKeydown(event)">
                <div class="bulk-tag-search-dropdown" id="bulkTagModalSearchDropdown">
                    <!-- Tag options will be populated here -->
                </div>
            </div>
            <button class="bulk-tag-clear-all-btn" onclick="clearAllBulkTagRows()" title="Xóa tất cả tag">
                <i class="fas fa-trash-alt"></i> Xóa tất cả
            </button>
        </div>

        <!-- Select All Checkbox -->
        <div class="bulk-tag-select-all-row">
            <label class="bulk-tag-select-all-label">
                <input type="checkbox" id="bulkTagSelectAllCheckbox" 
                       onchange="toggleBulkTagSelectAll(this.checked)">
                <span>Chọn tất cả</span>
            </label>
            <span class="bulk-tag-count" id="bulkTagRowCount">0 tag đã thêm</span>
        </div>

        <!-- Body - Tag Table -->
        <div class="bulk-tag-modal-body" id="bulkTagModalBody">
            <div class="bulk-tag-table">
                <div class="bulk-tag-table-header">
                    <div class="bulk-tag-col-tag">Tag cần gán</div>
                    <div class="bulk-tag-col-stt">STT Đơn Hàng</div>
                    <div class="bulk-tag-col-action">Thao tác</div>
                </div>
                <div class="bulk-tag-table-body" id="bulkTagTableBody">
                    <div class="bulk-tag-empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="bulk-tag-modal-footer">
            <button class="bulk-tag-btn-cancel" onclick="closeBulkTagModal()">
                <i class="fas fa-times"></i> Hủy
            </button>
            <button class="bulk-tag-btn-confirm" id="bulkTagConfirmBtn" 
                    onclick="executeBulkTagModalAssignment()">
                <i class="fas fa-check"></i> Gán Tag Đã Chọn
            </button>
        </div>
    </div>
</div>
```

### 2.2 Modal Lịch Sử (bulkTagHistoryModal)

```html
<!-- Bulk Tag History Modal -->
<div class="bulk-tag-modal" id="bulkTagHistoryModal">
    <div class="bulk-tag-modal-content" style="max-width: 1000px;">
        <!-- Header -->
        <div class="bulk-tag-modal-header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
            <div class="bulk-tag-header-info">
                <h3><i class="fas fa-history"></i> Lịch Sử Gán Tag Hàng Loạt</h3>
                <p id="bulkTagHistoryModalSubtitle">Xem lại các lần gán tag trước đây</p>
            </div>
            <div class="bulk-tag-header-actions">
                <button class="bulk-tag-modal-close" onclick="closeBulkTagHistoryModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Body - History List -->
        <div class="bulk-tag-modal-body" id="bulkTagHistoryModalBody">
            <div class="bulk-tag-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải lịch sử...</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="bulk-tag-modal-footer">
            <button class="bulk-tag-btn-cancel" onclick="closeBulkTagHistoryModal()">
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
// State variables for bulk tag modal
// Mỗi tag item có cấu trúc: {tagId, tagName, tagColor, sttList: Array, errorMessage: string|null}
let bulkTagModalData = [];

// Set chứa các tagId đã được chọn (checked)
let selectedBulkTagModalRows = new Set();

// LocalStorage key để lưu bản nháp
const BULK_TAG_DRAFT_KEY = 'bulkTagModalDraft';
```

### 3.2 Cấu trúc dữ liệu `bulkTagModalData`

```javascript
// Mỗi phần tử trong mảng có cấu trúc:
{
    tagId: "12345",           // ID của tag từ API
    tagName: "ĐÃ CHỐT",       // Tên tag
    tagColor: "#10b981",      // Màu hex của tag
    sttList: [1, 5, 12, 23],  // Mảng các STT đơn hàng - GIỮ NGUYÊN THỨ TỰ NHẬP
    errorMessage: null        // Thông báo lỗi nếu có (hiển thị dưới tag)
}
```

---

## 4. Các Hàm JavaScript

### 4.1 Hàm LocalStorage

#### `saveBulkTagToLocalStorage()`
**Mục đích:** Lưu dữ liệu modal vào localStorage để khôi phục sau

```javascript
function saveBulkTagToLocalStorage() {
    try {
        const dataToSave = bulkTagModalData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));
        localStorage.setItem(BULK_TAG_DRAFT_KEY, JSON.stringify(dataToSave));
        console.log("[BULK-TAG-MODAL] Saved draft to localStorage:", dataToSave);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving to localStorage:", error);
    }
}
```

#### `loadBulkTagFromLocalStorage()`
**Mục đích:** Khôi phục dữ liệu từ localStorage khi mở modal

```javascript
function loadBulkTagFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(BULK_TAG_DRAFT_KEY);
        if (!savedData) return false;

        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return false;

        bulkTagModalData = parsedData.map(tag => ({
            tagId: tag.tagId,
            tagName: tag.tagName,
            tagColor: tag.tagColor,
            sttList: tag.sttList || [],
            errorMessage: tag.errorMessage || null
        }));

        // Tự động chọn các tag đã có STT
        selectedBulkTagModalRows.clear();
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });

        console.log("[BULK-TAG-MODAL] Loaded draft from localStorage:", bulkTagModalData);
        return true;
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading from localStorage:", error);
        return false;
    }
}
```

#### `clearBulkTagLocalStorage()`
**Mục đích:** Xóa dữ liệu nháp từ localStorage

```javascript
function clearBulkTagLocalStorage() {
    try {
        localStorage.removeItem(BULK_TAG_DRAFT_KEY);
        console.log("[BULK-TAG-MODAL] Cleared localStorage draft");
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error clearing localStorage:", error);
    }
}
```

---

### 4.2 Hàm Điều Khiển Modal

#### `showBulkTagModal()`
**Mục đích:** Mở modal và khởi tạo dữ liệu

```javascript
async function showBulkTagModal() {
    console.log("[BULK-TAG-MODAL] Opening bulk tag modal");

    // Thử load từ localStorage trước
    const hasStoredData = loadBulkTagFromLocalStorage();

    if (!hasStoredData) {
        // Reset state nếu không có dữ liệu đã lưu
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
    }

    // Cập nhật UI
    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    updateSelectAllCheckbox();
    document.getElementById('bulkTagModalSearchInput').value = '';

    // Load tags cho dropdown
    await loadBulkTagModalOptions();

    // Hiển thị modal
    document.getElementById('bulkTagModal').classList.add('show');
}
```

#### `closeBulkTagModal()`
**Mục đích:** Đóng modal và lưu bản nháp

```javascript
function closeBulkTagModal() {
    // Lưu state hiện tại vào localStorage trước khi đóng
    if (bulkTagModalData.length > 0) {
        saveBulkTagToLocalStorage();
    }

    document.getElementById('bulkTagModal').classList.remove('show');
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
    // KHÔNG xóa dữ liệu - giữ trong bộ nhớ để khi mở lại modal
}
```

---

### 4.3 Hàm Dropdown Tìm Kiếm Tag

#### `loadBulkTagModalOptions()`
**Mục đích:** Load danh sách tag có sẵn

```javascript
async function loadBulkTagModalOptions() {
    try {
        // Sử dụng availableTags đã có hoặc fetch từ API
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }
        populateBulkTagModalDropdown();
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading tags:", error);
    }
}
```

#### `populateBulkTagModalDropdown()`
**Mục đích:** Render danh sách tag vào dropdown

```javascript
function populateBulkTagModalDropdown() {
    const dropdown = document.getElementById('bulkTagModalSearchDropdown');
    const searchValue = document.getElementById('bulkTagModalSearchInput').value.toLowerCase().trim();

    const tags = window.availableTags || availableTags || [];

    // Kiểm tra nếu chưa có tags
    if (!tags || tags.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                Đang tải danh sách tag...
                <br><br>
                <button onclick="refreshBulkTagModalDropdown()" 
                        style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
        `;
        return;
    }

    // Lọc tags theo search
    const filteredTags = tags.filter(tag =>
        tag.Name && tag.Name.toLowerCase().includes(searchValue)
    );

    // Kiểm tra tags đã thêm
    const addedTagIds = new Set(bulkTagModalData.map(t => t.tagId));

    // Giới hạn hiển thị 100 tags đầu tiên để tối ưu performance
    const displayTags = filteredTags.slice(0, 100);

    // Highlight tag đầu tiên chưa được thêm
    let firstAvailableFound = false;

    dropdown.innerHTML = displayTags.map(tag => {
        const isAdded = addedTagIds.has(tag.Id);
        const tagName = tag.Name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

        let isHighlighted = false;
        if (!isAdded && !firstAvailableFound) {
            isHighlighted = true;
            firstAvailableFound = true;
        }

        return `
            <div class="bulk-tag-search-option ${isAdded ? 'disabled' : ''} ${isHighlighted ? 'highlighted' : ''}"
                 data-tag-id="${tag.Id}"
                 data-tag-name="${tagName}"
                 data-tag-color="${tag.Color || '#6b7280'}"
                 onclick="${isAdded ? '' : `addTagToBulkTagModal('${tag.Id}', '${tagName}', '${tag.Color || '#6b7280'}')`}">
                <span class="tag-color-dot" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tag.Name}</span>
                ${isAdded ? '<span class="tag-added">Đã thêm</span>' : ''}
            </div>
        `;
    }).join('');

    // Hiển thị số lượng nếu còn nhiều tags
    if (filteredTags.length > 100) {
        dropdown.innerHTML += `
            <div style="padding: 10px 14px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
                Hiển thị 100/${filteredTags.length} tag. Nhập từ khóa để lọc.
            </div>
        `;
    }
}
```

#### `handleBulkTagModalSearchKeydown(event)`
**Mục đích:** Xử lý keyboard navigation

```javascript
function handleBulkTagModalSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const searchValue = document.getElementById('bulkTagModalSearchInput').value.trim();

        // Tìm tag được highlight (tag đầu tiên available)
        const highlightedTag = document.querySelector('.bulk-tag-search-option.highlighted');

        if (highlightedTag) {
            // Có tag highlight → chọn nó
            const tagId = highlightedTag.getAttribute('data-tag-id');
            const tagName = highlightedTag.getAttribute('data-tag-name');
            const tagColor = highlightedTag.getAttribute('data-tag-color');
            addTagToBulkTagModal(tagId, tagName, tagColor);
        } else if (searchValue !== '') {
            // Không có tag matching → tự động tạo tag mới
            autoCreateAndAddTagToBulkModal(searchValue);
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
        document.getElementById('bulkTagModalSearchInput').blur();
    }
}
```

#### `autoCreateAndAddTagToBulkModal(tagName)`
**Mục đích:** Tự động tạo tag mới khi không tìm thấy

```javascript
async function autoCreateAndAddTagToBulkModal(tagName) {
    if (!tagName || tagName.trim() === '') return;

    const name = tagName.trim().toUpperCase(); // Chuyển thành chữ hoa
    const color = generateRandomColor();

    try {
        // Hiển thị loading notification
        if (window.notificationManager) {
            window.notificationManager.info(`Đang tạo tag "${name}"...`);
        }

        console.log('[BULK-TAG-MODAL] Creating tag:', { name, color });

        // Lấy auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // Gọi API tạo tag
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({
                    Name: name,
                    Color: color
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const newTag = await response.json();
        console.log('[BULK-TAG-MODAL] Tag created successfully:', newTag);

        // Xóa @odata.context (Firebase không cho phép keys có dấu chấm)
        if (newTag['@odata.context']) {
            delete newTag['@odata.context'];
        }

        // Reload tất cả tags từ TPOS API để đảm bảo sync
        await loadAvailableTags();

        // Cập nhật filter dropdowns
        populateTagFilter();
        populateBulkTagDropdown();
        populateBulkTagModalDropdown();

        // Thêm tag mới vào bảng bulk tag modal
        addTagToBulkTagModal(newTag.Id, newTag.Name, newTag.Color);

        // Hiển thị success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo và thêm tag "${name}"!`);
        }

    } catch (error) {
        console.error('[BULK-TAG-MODAL] Error creating tag:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi tạo tag: ' + error.message);
        }
    }
}
```

---

### 4.4 Hàm Quản Lý Tag Rows

#### `addTagToBulkTagModal(tagId, tagName, tagColor)`
**Mục đích:** Thêm tag vào bảng

```javascript
function addTagToBulkTagModal(tagId, tagName, tagColor) {
    console.log("[BULK-TAG-MODAL] Adding tag:", tagName);

    // Kiểm tra đã tồn tại chưa
    if (bulkTagModalData.some(t => t.tagId === tagId)) {
        return;
    }

    // Thêm vào data
    bulkTagModalData.push({
        tagId: tagId,
        tagName: tagName,
        tagColor: tagColor,
        sttList: []
    });

    // Cập nhật UI
    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();

    // Clear search input
    document.getElementById('bulkTagModalSearchInput').value = '';
    document.getElementById('bulkTagModalSearchDropdown').classList.remove('show');
}
```

#### `removeTagFromBulkTagModal(tagId)`
**Mục đích:** Xóa tag khỏi bảng

```javascript
function removeTagFromBulkTagModal(tagId) {
    bulkTagModalData = bulkTagModalData.filter(t => t.tagId !== tagId);
    selectedBulkTagModalRows.delete(tagId);

    updateBulkTagModalTable();
    updateBulkTagModalRowCount();
    populateBulkTagModalDropdown();
}
```

#### `clearAllBulkTagRows()`
**Mục đích:** Xóa tất cả tags

```javascript
function clearAllBulkTagRows() {
    if (bulkTagModalData.length === 0) return;

    if (confirm('Bạn có chắc muốn xóa tất cả tag đã thêm?')) {
        bulkTagModalData = [];
        selectedBulkTagModalRows.clear();
        document.getElementById('bulkTagSelectAllCheckbox').checked = false;

        // Xóa localStorage
        clearBulkTagLocalStorage();

        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        populateBulkTagModalDropdown();
    }
}
```

---

### 4.5 Hàm Quản Lý STT

#### `addSTTToBulkTagRow(tagId, inputElement)`
**Mục đích:** Thêm STT vào một tag

```javascript
function addSTTToBulkTagRow(tagId, inputElement) {
    const sttValue = inputElement.value.trim();
    if (!sttValue) return;

    const stt = parseInt(sttValue);
    if (isNaN(stt) || stt <= 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('STT phải là số nguyên dương', 2000);
        }
        return;
    }

    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    // Kiểm tra STT có tồn tại trong dữ liệu hiện tại không
    const order = displayedData.find(o => o.SessionIndex === stt);
    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} không tồn tại trong danh sách hiện tại`, 2000);
        }
        return;
    }

    // Kiểm tra đã thêm chưa
    if (tagData.sttList.includes(stt)) {
        if (window.notificationManager) {
            window.notificationManager.warning(`STT ${stt} đã được thêm`, 2000);
        }
        inputElement.value = '';
        return;
    }

    // Thêm STT (giữ nguyên thứ tự nhập)
    tagData.sttList.push(stt);
    inputElement.value = '';

    updateBulkTagModalTable();

    // Re-focus vào input sau khi re-render
    setTimeout(() => {
        const newInput = document.querySelector(`.bulk-tag-row[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
        if (newInput) {
            newInput.focus();
        }
    }, 10);
}
```

#### `removeSTTFromBulkTagRow(tagId, stt)`
**Mục đích:** Xóa STT khỏi một tag

```javascript
function removeSTTFromBulkTagRow(tagId, stt) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData) return;

    tagData.sttList = tagData.sttList.filter(s => s !== stt);

    // Nếu hết STT, bỏ chọn row
    if (tagData.sttList.length === 0) {
        selectedBulkTagModalRows.delete(tagId);
    }

    updateBulkTagModalTable();
    updateSelectAllCheckbox();
}
```

---

### 4.6 Hàm Checkbox Selection

#### `toggleBulkTagSelectAll(checked)`
**Mục đích:** Chọn/bỏ chọn tất cả

```javascript
function toggleBulkTagSelectAll(checked) {
    if (checked) {
        bulkTagModalData.forEach(tag => {
            if (tag.sttList.length > 0) {
                selectedBulkTagModalRows.add(tag.tagId);
            }
        });
    } else {
        selectedBulkTagModalRows.clear();
    }

    updateBulkTagModalTable();
}
```

#### `toggleBulkTagRowSelection(tagId)`
**Mục đích:** Toggle chọn từng row

```javascript
function toggleBulkTagRowSelection(tagId) {
    const tagData = bulkTagModalData.find(t => t.tagId === tagId);
    if (!tagData || tagData.sttList.length === 0) return;

    if (selectedBulkTagModalRows.has(tagId)) {
        selectedBulkTagModalRows.delete(tagId);
    } else {
        selectedBulkTagModalRows.add(tagId);
    }

    updateBulkTagModalTable();
    updateSelectAllCheckbox();
}
```

#### `updateSelectAllCheckbox()`
**Mục đích:** Cập nhật trạng thái checkbox "Chọn tất cả"

```javascript
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('bulkTagSelectAllCheckbox');
    const tagsWithSTT = bulkTagModalData.filter(t => t.sttList.length > 0);

    if (tagsWithSTT.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size === tagsWithSTT.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedBulkTagModalRows.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}
```

---

### 4.7 Hàm Render Table

#### `updateBulkTagModalTable()`
**Mục đích:** Render lại bảng tag

```javascript
function updateBulkTagModalTable() {
    const tableBody = document.getElementById('bulkTagTableBody');

    if (bulkTagModalData.length === 0) {
        tableBody.innerHTML = `
            <div class="bulk-tag-empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
            </div>
        `;
        return;
    }

    tableBody.innerHTML = bulkTagModalData.map(tagData => {
        const isSelected = selectedBulkTagModalRows.has(tagData.tagId);
        const sttArray = tagData.sttList || []; // Giữ nguyên thứ tự nhập
        const sttCount = sttArray.length;
        const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;

        // Lấy tên khách hàng cho từng STT
        const sttPillsHtml = sttArray.map(stt => {
            const order = displayedData.find(o => o.SessionIndex === stt);
            const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
            return `
                <div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="removeSTTFromBulkTagRow('${tagData.tagId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Error message HTML
        const errorHtml = hasError ? `
            <div class="bulk-tag-row-error">
                ${tagData.errorMessage}
            </div>
        ` : '';

        return `
            <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                <div class="bulk-tag-row-tag">
                    <input type="checkbox"
                           ${isSelected ? 'checked' : ''}
                           ${sttCount === 0 ? 'disabled' : ''}
                           onchange="toggleBulkTagRowSelection('${tagData.tagId}')"
                           title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để gán tag'}">
                    <div class="bulk-tag-row-tag-info">
                        <span class="tag-color-dot" style="background-color: ${tagData.tagColor}"></span>
                        <span class="tag-name">${tagData.tagName}</span>
                    </div>
                    ${errorHtml}
                </div>
                <div class="bulk-tag-row-stt">
                    <div class="bulk-tag-stt-pills">
                        ${sttPillsHtml || '<span style="color: #9ca3af; font-size: 13px;">Chưa có STT nào</span>'}
                    </div>
                    <div class="bulk-tag-stt-input-wrapper">
                        <input type="number"
                               class="bulk-tag-stt-input"
                               placeholder="Nhập STT và Enter"
                               onkeydown="handleBulkTagSTTInputKeydown(event, '${tagData.tagId}')">
                        <span class="bulk-tag-stt-counter">(${sttCount})</span>
                    </div>
                </div>
                <div class="bulk-tag-row-action">
                    <button class="bulk-tag-remove-row-btn" onclick="removeTagFromBulkTagModal('${tagData.tagId}')" title="Xóa tag này">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
```

---

### 4.8 Hàm Thực Thi Gán Tag

#### `normalizePhoneForBulkTag(phone)`
**Mục đích:** Chuẩn hóa số điện thoại

```javascript
function normalizePhoneForBulkTag(phone) {
    if (!phone) return '';
    // Xóa tất cả ký tự không phải số
    let cleaned = phone.replace(/\D/g, '');
    // Xử lý mã vùng Vietnam: thay 84 đầu bằng 0
    if (cleaned.startsWith('84')) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}
```

#### `executeBulkTagModalAssignment()`
**Mục đích:** Thực hiện gán tag hàng loạt (HÀM CHÍNH)

**Flow xử lý đặc biệt:**
1. Kiểm tra tag "ĐÃ GỘP KO CHỐT" trước khi gán
2. Nếu đơn có tag này → tìm đơn thay thế cùng SĐT với STT cao nhất
3. Gán tag vào đơn thay thế thay vì đơn gốc
4. Theo dõi success/failed cho từng tag
5. Sau khi gán xong, xóa STT thành công, giữ lại STT thất bại
6. Lưu lịch sử vào Firebase
7. Hiển thị modal kết quả
8. KHÔNG tự động đóng modal

```javascript
async function executeBulkTagModalAssignment() {
    console.log("[BULK-TAG-MODAL] Executing bulk tag assignment");

    // Lấy tags đã chọn có STT (chỉ các rows được checked)
    const selectedTags = bulkTagModalData.filter(t =>
        selectedBulkTagModalRows.has(t.tagId) && t.sttList.length > 0
    );

    // Validate: ít nhất 1 tag được chọn + có STT
    if (selectedTags.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để gán', 3000);
        }
        return;
    }

    try {
        showLoading(true);

        // Results tracking
        const successResults = []; // Array of {tagName, tagColor, sttList: [], redirectedList: []}
        const failedResults = [];  // Array of {tagName, tagColor, sttList: [], reason}

        // Xử lý từng tag đã chọn
        for (const selectedTag of selectedTags) {
            const tagInfo = {
                Id: parseInt(selectedTag.tagId, 10),
                Name: selectedTag.tagName,
                Color: selectedTag.tagColor
            };

            const sttArray = selectedTag.sttList || [];
            const successSTT = [];
            const failedSTT = [];
            let failReason = null;

            // Tìm orders matching với STT
            const matchingOrders = displayedData.filter(order =>
                sttArray.includes(order.SessionIndex)
            );

            if (matchingOrders.length === 0) {
                console.warn(`[BULK-TAG-MODAL] No orders found for tag "${tagInfo.Name}"`);
                continue;
            }

            // Xử lý từng order
            for (const order of matchingOrders) {
                try {
                    // Parse current tags
                    const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                    const currentTags = rawTags.map(t => ({
                        Id: parseInt(t.Id, 10),
                        Name: t.Name,
                        Color: t.Color
                    }));

                    // *** XỬ LÝ ĐẶC BIỆT: Kiểm tra tag "ĐÃ GỘP KO CHỐT" ***
                    const hasBlockedTag = currentTags.some(t => t.Name === "ĐÃ GỘP KO CHỐT");
                    if (hasBlockedTag) {
                        // Tìm đơn thay thế cùng SĐT
                        const normalizedPhone = normalizePhoneForBulkTag(order.Telephone);

                        if (!normalizedPhone) {
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Đơn có tag "ĐÃ GỘP KO CHỐT" và không có SĐT';
                            continue;
                        }

                        // Tìm các đơn cùng SĐT
                        const samePhoneOrders = displayedData.filter(o =>
                            o.Id !== order.Id && normalizePhoneForBulkTag(o.Telephone) === normalizedPhone
                        );

                        if (samePhoneOrders.length === 0) {
                            failedSTT.push(order.SessionIndex);
                            failReason = 'Không tìm thấy đơn thay thế cùng SĐT';
                            continue;
                        }

                        // Chọn đơn có STT cao nhất
                        const replacementOrder = samePhoneOrders.sort((a, b) =>
                            b.SessionIndex - a.SessionIndex
                        )[0];

                        // Gán tag vào đơn thay thế
                        // ... (logic gọi API cho replacementOrder)

                        successSTT.push({
                            original: order.SessionIndex,
                            redirectTo: replacementOrder.SessionIndex,
                            redirected: true
                        });
                        continue;
                    }

                    // Kiểm tra tag đã tồn tại
                    const tagExists = currentTags.some(t => t.Id === tagInfo.Id);
                    if (tagExists) {
                        successSTT.push(order.SessionIndex);
                        continue;
                    }

                    // Build updated tags array
                    const updatedTags = [
                        ...currentTags,
                        { Id: tagInfo.Id, Name: tagInfo.Name, Color: tagInfo.Color }
                    ];

                    // Gọi API gán tag
                    const authHeaders = await window.tokenManager.getAuthHeader();
                    const response = await fetch(
                        "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                        {
                            method: "POST",
                            headers: {
                                ...authHeaders,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                Tags: updatedTags,
                                OrderId: order.Id
                            }),
                        }
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    // Cập nhật local data
                    updateOrderInTable(order.Id, { Tags: JSON.stringify(updatedTags) });

                    // Emit Firebase update
                    await emitTagUpdateToFirebase(order.Id, updatedTags);

                    successSTT.push(order.SessionIndex);

                } catch (error) {
                    failedSTT.push(order.SessionIndex);
                    failReason = failReason || `Lỗi API: ${error.message}`;
                }
            }

            // Thu thập kết quả cho tag này
            // ... (collect results)

            // Cập nhật modal data: xóa STT thành công, giữ STT thất bại
            const tagDataInModal = bulkTagModalData.find(t => t.tagId === selectedTag.tagId);
            if (tagDataInModal) {
                tagDataInModal.sttList = tagDataInModal.sttList.filter(stt => !successSTT.includes(stt));
                if (failedSTT.length > 0) {
                    tagDataInModal.errorMessage = `⚠️ STT ${failedSTT.join(', ')} - ${failReason}`;
                }
            }
        }

        // Clear cache
        window.cacheManager.clear("orders");

        // Xóa tags không còn STT
        bulkTagModalData = bulkTagModalData.filter(tag => tag.sttList.length > 0);

        // Lưu lịch sử vào Firebase
        await saveBulkTagHistory({ success: successResults, failed: failedResults });

        showLoading(false);

        // Cập nhật UI modal
        updateBulkTagModalTable();
        updateBulkTagModalRowCount();
        updateSelectAllCheckbox();

        // Hiển thị modal kết quả
        showBulkTagResultModal(successResults, failedResults);

        // KHÔNG đóng modal tự động

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error:", error);
        showLoading(false);
        if (window.notificationManager) {
            window.notificationManager.error(`Lỗi: ${error.message}`, 5000);
        }
    }
}
```

---

### 4.9 Hàm Firebase & History

#### `saveBulkTagHistory(results)`
**Mục đích:** Lưu lịch sử gán tag vào Firebase

```javascript
async function saveBulkTagHistory(results) {
    try {
        const timestamp = Date.now();
        const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');

        // Lấy tên định danh người dùng
        let username = 'Unknown';
        try {
            if (currentUserIdentifier) {
                username = currentUserIdentifier;
            } else {
                const tokenData = window.tokenManager?.getTokenData?.();
                username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
            }
        } catch (e) {
            console.warn("[BULK-TAG-MODAL] Could not get username:", e);
        }

        const historyEntry = {
            timestamp: timestamp,
            dateFormatted: dateFormatted,
            username: username,
            results: results, // {success: [...], failed: [...]}
            summary: {
                totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
            }
        };

        // Lưu vào Firebase
        const historyRef = database.ref(`bulkTagHistory/${timestamp}`);
        await historyRef.set(historyEntry);

        console.log("[BULK-TAG-MODAL] History saved to Firebase:", historyEntry);
    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error saving history:", error);
    }
}
```

#### `showBulkTagHistoryModal()`
**Mục đích:** Mở modal lịch sử và load dữ liệu từ Firebase

```javascript
async function showBulkTagHistoryModal() {
    console.log("[BULK-TAG-MODAL] Opening history modal");

    const historyBody = document.getElementById('bulkTagHistoryModalBody');
    historyBody.innerHTML = `
        <div class="bulk-tag-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải lịch sử...</p>
        </div>
    `;

    document.getElementById('bulkTagHistoryModal').classList.add('show');

    try {
        // Load history từ Firebase
        const historyRef = database.ref('bulkTagHistory');
        const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
        const historyData = snapshot.val();

        if (!historyData) {
            historyBody.innerHTML = `
                <div class="bulk-tag-history-empty">
                    <i class="fas fa-history"></i>
                    <p>Chưa có lịch sử gán tag nào</p>
                </div>
            `;
            return;
        }

        // Convert sang array và sort theo timestamp giảm dần
        const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);

        historyBody.innerHTML = `
            <div class="bulk-tag-history-list">
                ${historyArray.map((entry, index) => renderBulkTagHistoryItem(entry, index)).join('')}
            </div>
        `;

    } catch (error) {
        console.error("[BULK-TAG-MODAL] Error loading history:", error);
        historyBody.innerHTML = `
            <div class="bulk-tag-history-empty">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                <p>Lỗi tải lịch sử: ${error.message}</p>
            </div>
        `;
    }
}
```

---

## 5. CSS Styles

### 5.1 File và vị trí

- **File:** `orders-report/tab1-orders.css`
- **Dòng:** 5219 - 6215

### 5.2 Các CSS Classes chính

| Class | Mô tả | Dòng |
|-------|-------|------|
| `.bulk-tag-modal` | Container modal chính | 5223-5235 |
| `.bulk-tag-modal.show` | State khi modal hiển thị | 5237-5239 |
| `.bulk-tag-modal-content` | Nội dung modal | 5241-5261 |
| `.bulk-tag-modal-header` | Header với gradient xanh | 5264-5327 |
| `.bulk-tag-search-section` | Phần tìm kiếm tag | 5331-5452 |
| `.bulk-tag-search-dropdown` | Dropdown tìm kiếm | 5369-5432 |
| `.bulk-tag-select-all-row` | Row checkbox chọn tất cả | 5456-5485 |
| `.bulk-tag-modal-body` | Body chứa bảng | 5488-5509 |
| `.bulk-tag-table` | Container bảng | 5512-5550 |
| `.bulk-tag-row` | Mỗi row trong bảng | 5554-5720 |
| `.bulk-tag-stt-pill` | Pill hiển thị STT | 5620-5661 |
| `.bulk-tag-modal-footer` | Footer với buttons | 5724-5776 |
| `.bulk-tag-history-*` | Các styles cho lịch sử | 5780-5963 |
| `.bulk-tag-row.has-error` | Row có lỗi | 5966-5978 |
| `.bulk-tag-result-modal` | Modal kết quả | 5982-6151 |

### 5.3 Animation

```css
@keyframes bulkTagModalSlideIn {
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

### 5.4 CSS Grid Layout

```css
.bulk-tag-row {
    display: grid;
    grid-template-columns: 280px 1fr 80px;
    /* [Tag Column] [STT Column] [Action Column] */
}

.bulk-tag-table-header {
    display: grid;
    grid-template-columns: 280px 1fr 80px;
}
```

---

## 6. Flow Xử Lý Chi Tiết

### 6.1 Flow Mở Modal

```
1. User click nút "Gán Tag Hàng Loạt"
   ↓
2. showBulkTagModal() được gọi
   ↓
3. loadBulkTagFromLocalStorage() - thử load bản nháp
   ├── Có data → Khôi phục bulkTagModalData và selectedBulkTagModalRows
   └── Không có data → Reset state
   ↓
4. updateBulkTagModalTable() - render bảng
   ↓
5. updateBulkTagModalRowCount() - cập nhật số lượng
   ↓
6. updateSelectAllCheckbox() - cập nhật checkbox
   ↓
7. loadBulkTagModalOptions() - load danh sách tag từ API
   ↓
8. Modal hiển thị (classList.add('show'))
```

### 6.2 Flow Thêm Tag

```
1. User nhập tên tag vào ô tìm kiếm
   ↓
2. filterBulkTagModalOptions() được gọi (oninput)
   ↓
3. populateBulkTagModalDropdown() - render dropdown với kết quả lọc
   ↓
4. User click vào tag HOẶC nhấn Enter
   ↓
5. [Nếu có tag matching]
   ├── addTagToBulkTagModal(tagId, tagName, tagColor)
   └── Thêm vào bulkTagModalData, cập nhật UI
   ↓
   [Nếu không có tag matching + Enter]
   ├── autoCreateAndAddTagToBulkModal(searchValue)
   ├── Gọi API tạo tag mới
   ├── Reload availableTags
   └── Thêm tag mới vào modal
```

### 6.3 Flow Thêm STT

```
1. User focus vào input STT của một tag row
   ↓
2. User nhập số STT và nhấn Enter
   ↓
3. handleBulkTagSTTInputKeydown(event, tagId) được gọi
   ↓
4. addSTTToBulkTagRow(tagId, inputElement)
   ├── Validate: phải là số nguyên dương
   ├── Kiểm tra STT có tồn tại trong displayedData không
   ├── Kiểm tra STT chưa được thêm
   ├── Thêm vào tagData.sttList (giữ thứ tự nhập)
   └── updateBulkTagModalTable() - render lại
   ↓
5. Re-focus vào input để tiếp tục nhập
```

### 6.4 Flow Gán Tag (Execution)

```
1. User click "Gán Tag Đã Chọn"
   ↓
2. executeBulkTagModalAssignment() được gọi
   ↓
3. Lọc selectedTags từ bulkTagModalData (chỉ rows đã check + có STT)
   ↓
4. Validate: ít nhất 1 tag được chọn
   ↓
5. showLoading(true)
   ↓
6. FOR EACH selectedTag:
   │
   ├── Tìm matching orders từ displayedData theo STT
   │
   ├── FOR EACH order:
   │   │
   │   ├── Parse current tags của order
   │   │
   │   ├── [Kiểm tra tag "ĐÃ GỘP KO CHỐT"]
   │   │   ├── Có → Tìm đơn thay thế cùng SĐT
   │   │   │       ├── Tìm được → Gán tag vào đơn thay thế
   │   │   │       └── Không tìm được → Add to failedSTT
   │   │   └── Không → Tiếp tục
   │   │
   │   ├── [Kiểm tra tag đã tồn tại]
   │   │   ├── Có → Count as success (skip API call)
   │   │   └── Không → Tiếp tục
   │   │
   │   ├── Gọi API AssignTag
   │   │   ├── Success → Add to successSTT
   │   │   │           → updateOrderInTable()
   │   │   │           → emitTagUpdateToFirebase()
   │   │   └── Error → Add to failedSTT
   │   │
   │   └── END FOR order
   │
   ├── Collect results (successResults, failedResults)
   │
   ├── Update modal data:
   │   ├── Xóa successful STTs từ sttList
   │   └── Set errorMessage nếu có failures
   │
   └── END FOR selectedTag
   ↓
7. window.cacheManager.clear("orders")
   ↓
8. Xóa tags không còn STT khỏi bulkTagModalData
   ↓
9. saveBulkTagHistory() - lưu vào Firebase
   ↓
10. showLoading(false)
    ↓
11. Cập nhật UI modal
    ↓
12. showBulkTagResultModal() - hiển thị kết quả
    ↓
13. [KHÔNG đóng modal tự động]
```

### 6.5 Flow Đóng Modal

```
1. User click "Hủy" hoặc nút X
   ↓
2. closeBulkTagModal() được gọi
   ↓
3. [Nếu còn data]
   └── saveBulkTagToLocalStorage() - lưu bản nháp
   ↓
4. Modal ẩn (classList.remove('show'))
   ↓
5. Dữ liệu VẪN giữ trong bộ nhớ (bulkTagModalData)
```

---

## 7. API Endpoints

### 7.1 Lấy danh sách Tag

```javascript
// Endpoint: qua loadAvailableTags() (defined elsewhere)
// Base URL: https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag
```

### 7.2 Tạo Tag mới

```javascript
// Endpoint
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag

// Headers
{
    ...authHeaders,
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8'
}

// Body
{
    "Name": "TÊN TAG",
    "Color": "#hexcolor"
}
```

### 7.3 Gán Tag vào Order

```javascript
// Endpoint
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag

// Headers
{
    ...authHeaders,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

// Body
{
    "Tags": [
        { "Id": 123, "Name": "TAG NAME", "Color": "#hexcolor" },
        // ... more tags
    ],
    "OrderId": "order-id-here"
}
```

---

## 8. Firebase Integration

### 8.1 Cấu trúc dữ liệu lịch sử

```javascript
// Path: bulkTagHistory/{timestamp}
{
    timestamp: 1702839600000,
    dateFormatted: "17/12/2025, 23:00:00",
    username: "Tên Người Dùng",
    results: {
        success: [
            {
                tagName: "ĐÃ CHỐT",
                tagColor: "#10b981",
                sttList: [1, 5, 12],
                redirectedList: [
                    { original: 3, redirectTo: 15, redirected: true }
                ]
            }
        ],
        failed: [
            {
                tagName: "CHƯA XỬ LÝ",
                tagColor: "#f59e0b",
                sttList: [8, 9],
                reason: "Lỗi API: HTTP 500"
            }
        ]
    },
    summary: {
        totalSuccess: 4,
        totalFailed: 2
    }
}
```

### 8.2 Firebase Realtime Updates

```javascript
// Emit tag update để sync realtime
await emitTagUpdateToFirebase(orderId, updatedTags);
```

---

## 📝 Lưu Ý Quan Trọng

1. **LocalStorage Draft:** Bản nháp được lưu tự động khi đóng modal, khôi phục khi mở lại
2. **STT Order:** Thứ tự STT được giữ nguyên theo thứ tự nhập (không sort)
3. **Tag "ĐÃ GỘP KO CHỐT":** Đơn có tag này sẽ được redirect sang đơn cùng SĐT có STT cao nhất
4. **Modal không tự đóng:** Sau khi gán xong, modal vẫn mở để user có thể tiếp tục
5. **Checkbox disabled:** Rows không có STT sẽ bị disable checkbox

---

*Tài liệu này được tạo tự động từ phân tích code. Cập nhật: 2025-12-17*
