# Hướng dẫn chuyển đổi giao diện Mobile App cho N2Store

## Mục tiêu

Chuyển đổi các trang web N2Store thành giao diện **thuần mobile app** — không scroll ngang, layout cố định, UX giống native app.

---

## 1. Viewport & Meta Tag

```html
<!-- Thay thế viewport mặc định bằng dòng này -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

**Lý do:** `maximum-scale=1.0, user-scalable=no` ngăn iOS tự zoom khi focus vào input.

---

## 2. CSS — Nguyên tắc layout mobile

Thêm vào file CSS của page (trong `@media (max-width: 768px)`):

```css
@media (max-width: 768px) {

    /* === CHẶN SCROLL NGANG === */
    html, body {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100vw !important;
        padding-top: 0 !important;
        -webkit-overflow-scrolling: touch;
    }

    body {
        padding-bottom: 65px !important; /* chừa chỗ cho bottom nav */
    }

    /* === ẨN SIDEBAR DESKTOP === */
    .sidebar {
        display: none !important;
    }

    .sidebar-toggle-fixed {
        display: none !important;
    }

    /* === ẨN MOBILE TOP BAR (header user info) === */
    .mobile-top-bar {
        display: none !important;
    }

    /* === MAIN CONTENT FULL WIDTH === */
    .main-content {
        margin-left: 0 !important;
        padding-top: 0 !important;
        width: 100% !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
    }

    /* === TOP BAR STICKY === */
    .top-bar {
        position: sticky;
        top: 0;
        z-index: 100;
        background: #fff;
        border-bottom: 1px solid #e5e7eb;
    }

    /* === LAYOUT WRAPPER: bỏ margin âm gây overflow === */
    .your-layout-class {
        margin: 0 !important;
        overflow-x: hidden;
        width: 100%;
    }

    /* === MAIN CONTENT AREA: padding bottom tránh bị bottom nav che === */
    .your-main-area {
        padding-bottom: 80px;
        overflow-y: auto;
    }

    /* === MODAL FULL SCREEN === */
    .modal {
        align-items: stretch;
        z-index: 1100; /* cao hơn bottom nav (1000) */
    }

    .modal-content.k-modal {
        width: 100vw;
        max-width: 100vw;
        height: 100dvh;
        height: 100vh;
        border-radius: 0;
        margin: 0;
    }

    /* Fix iOS zoom trong modal */
    .modal input,
    .modal select,
    .modal textarea {
        font-size: 16px !important; /* iOS zoom khi font < 16px */
    }

    /* === ẨN NÚT AI CHAT MẶC ĐỊNH (tích hợp vào FAB) === */
    .ai-chat-fab {
        display: none !important;
    }
}
```

---

## 3. FAB (Floating Action Button)

Thay thế các nút action trên desktop bằng FAB menu trên mobile.

### HTML

```html
<!-- Đặt trong tab content chính -->
<div class="mobile-fab-container" id="mobileFabContainer">
    <div class="mobile-fab-menu" id="mobileFabMenu">
        <!-- Option AI (luôn có) -->
        <button class="mobile-fab-item" id="fabOpenAI">
            <span class="mobile-fab-item-label">Trợ lý AI</span>
            <span class="mobile-fab-item-icon fab-icon-ai">AI</span>
        </button>
        <!-- Các action của page -->
        <button class="mobile-fab-item" id="fabActionOne">
            <span class="mobile-fab-item-label">Tên action</span>
            <span class="mobile-fab-item-icon fab-icon-custom">A1</span>
        </button>
    </div>
    <button class="mobile-fab-btn" id="mobileFabBtn" aria-label="Thêm mới">
        <i data-lucide="plus"></i>
    </button>
</div>
```

### CSS cho FAB

```css
/* Desktop: ẩn FAB */
@media (min-width: 769px) {
    .mobile-fab-container {
        display: none !important;
    }
}

@media (max-width: 768px) {
    .mobile-fab-container {
        display: block;
        position: fixed;
        bottom: 80px; /* trên bottom nav 65px + khoảng cách */
        right: 20px;
        z-index: 1050;
    }

    .mobile-fab-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1890ff, #40a9ff);
        color: #fff;
        border: none;
        box-shadow: 0 4px 16px rgba(24, 144, 255, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease;
    }

    .mobile-fab-btn svg {
        width: 24px;
        height: 24px;
        transition: transform 0.3s ease;
    }

    .mobile-fab-container.open .mobile-fab-btn svg {
        transform: rotate(45deg);
    }

    .mobile-fab-menu {
        position: absolute;
        bottom: 68px;
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(10px) scale(0.9);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
    }

    .mobile-fab-container.open .mobile-fab-menu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
        pointer-events: auto;
    }

    .mobile-fab-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #fff;
        border: 1px solid #e8ecf1;
        border-radius: 24px;
        padding: 10px 14px 10px 16px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
        cursor: pointer;
        white-space: nowrap;
    }

    .mobile-fab-item-label {
        font-size: 13px;
        font-weight: 500;
        color: #334155;
    }

    .mobile-fab-item-icon {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 4px;
    }

    /* Màu icon theo loại */
    .fab-icon-ai   { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
    .fab-icon-add  { background: #e6f7ff; color: #1890ff; }
    .fab-icon-edit { background: #f0fdf4; color: #16a34a; }
}
```

### JavaScript — bind events FAB

```javascript
function bindMobileFabEvents() {
    const mobileFabBtn = document.getElementById('mobileFabBtn');
    const mobileFabContainer = document.getElementById('mobileFabContainer');

    if (!mobileFabBtn || !mobileFabContainer) return;

    // Toggle menu
    mobileFabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileFabContainer.classList.toggle('open');
    });

    // Đóng khi click ngoài
    document.addEventListener('click', (e) => {
        if (!mobileFabContainer.contains(e.target)) {
            mobileFabContainer.classList.remove('open');
        }
    });

    // Nút AI
    const fabOpenAI = document.getElementById('fabOpenAI');
    if (fabOpenAI) {
        fabOpenAI.addEventListener('click', () => {
            mobileFabContainer.classList.remove('open');
            if (window.AIChatWidget?.toggle) window.AIChatWidget.toggle();
        });
    }

    // Các nút action khác
    const fabActionOne = document.getElementById('fabActionOne');
    if (fabActionOne) {
        fabActionOne.addEventListener('click', () => {
            mobileFabContainer.classList.remove('open');
            // gọi hàm mở modal/form tương ứng
        });
    }
}
```

---

## 4. Danh sách dạng Card (thay thế Table)

Desktop dùng `<table>`, mobile dùng card list. Cần render 2 dạng song song.

### HTML container

```html
<!-- Desktop table (ẩn trên mobile) -->
<div class="table-container desktop-only">
    <table>...</table>
</div>

<!-- Mobile card list (ẩn trên desktop) -->
<div class="mobile-card-list" id="mobileCardList"></div>
```

### CSS

```css
@media (min-width: 769px) {
    .mobile-card-list { display: none !important; }
}

@media (max-width: 768px) {
    .desktop-only { display: none !important; }

    .mobile-card-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 4px 0;
    }
}
```

### Cấu trúc card chuẩn

```javascript
function renderMobileCard(item) {
    return `
        <div class="m-card" data-id="${item.id}">
            <!-- HEADER: mã + badge + giá trị -->
            <div class="m-card-header">
                <div class="m-card-header-left">
                    <span class="m-card-code">#${item.code}</span>
                    <span class="m-card-badge badge-${item.type}">${item.typeLabel}</span>
                    ${item.sourceCode ? `<span class="m-card-badge badge-${item.type} m-src-badge">${item.sourceCode}</span>` : ''}
                </div>
                <span class="m-card-value ${item.isNegative ? 'text-danger' : 'text-success'}">
                    ${item.displayValue}
                </span>
            </div>
            <!-- BODY: các dòng label-value -->
            <div class="m-card-body">
                <div class="m-card-row">
                    <span class="m-card-label">Loại:</span>
                    <span class="m-card-value-text">${item.category}</span>
                </div>
                ${item.note ? `
                <div class="m-card-row">
                    <span class="m-card-label">Ghi chú:</span>
                    <span class="m-card-value-text">${item.note}</span>
                </div>` : ''}
                <div class="m-card-row">
                    <span class="m-card-label">Thời gian:</span>
                    <span class="m-card-value-text">${item.dateStr}</span>
                </div>
            </div>
        </div>`;
}
```

### CSS card chuẩn

```css
@media (max-width: 768px) {
    .m-card {
        background: #fff;
        border-radius: 12px;
        padding: 14px 16px;
        border: 1px solid #f1f5f9;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        cursor: pointer;
        transition: transform 0.15s ease;
    }

    .m-card:active { transform: scale(0.98); }

    .m-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 10px;
        margin-bottom: 8px;
        border-bottom: 1px solid #f1f5f9;
    }

    .m-card-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .m-card-code {
        font-size: 14px;
        font-weight: 700;
        color: #1890ff;
    }

    .m-card-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
    }

    /* Màu badge theo loại — tùy chỉnh theo page */
    .badge-receipt    { background: #f0fdf4; color: #16a34a; }
    .badge-payment_kd { background: #fef2f2; color: #991b1b; }
    .badge-payment_cn { background: #fef3c7; color: #92400e; }

    .m-src-badge { opacity: 0.75; font-size: 9px; }

    .m-card-value {
        font-size: 15px;
        font-weight: 700;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .m-card-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .m-card-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        line-height: 1.5;
    }

    .m-card-label {
        font-size: 12px;
        color: #94a3b8;
        flex-shrink: 0;
    }

    .m-card-value-text {
        font-size: 13px;
        font-weight: 600;
        color: #334155;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
```

---

## 5. Thứ tự thông tin trong card

Sắp xếp theo mức độ quan trọng từ trên xuống:

1. **Header:** Mã phiếu + Badge loại + Badge nguồn | Giá trị tiền
2. **Loại/Danh mục** (thông tin chính)
3. **Ghi chú** (nếu có)
4. **Thời gian** (luôn ở dưới cùng)

---

## 6. Checklist khi làm mobile cho 1 page mới

- [ ] Thêm `maximum-scale=1.0, user-scalable=no` vào viewport
- [ ] Ẩn `.sidebar`, `.sidebar-toggle-fixed`, `.mobile-top-bar`
- [ ] Reset `margin-left: 0`, `padding-top: 0` cho `.main-content`
- [ ] Thêm `overflow-x: hidden` cho `html, body, .main-content`
- [ ] Bỏ `margin: -20px` hoặc margin âm trên layout wrapper
- [ ] Thêm `padding-bottom: 80px` cho vùng scroll chính
- [ ] Ẩn table desktop, render card list mobile
- [ ] Thêm FAB thay thế action buttons desktop
- [ ] FAB `bottom: 80px` (trên bottom nav 65px)
- [ ] Modal `z-index: 1100` (cao hơn bottom nav 1000)
- [ ] Input/select/textarea trong modal: `font-size: 16px !important`
- [ ] Ẩn `.ai-chat-fab`, thêm option AI vào FAB menu
- [ ] Test scroll dọc mượt, không có scroll ngang

---

## 7. Z-index hierarchy

| Layer | Z-index | Ghi chú |
|---|---|---|
| Bottom nav | 1000 | `navigation-modern.js` |
| AI chat fab | 1000 | `ai-chat-widget.js` |
| FAB button | 1050 | Trên bottom nav |
| Modal | 1100 | Trên tất cả |
| Sidebar drawer | 1100 | Khi mở trên mobile |
| Overlay scrim | 1099 | Dưới modal/drawer |

---

## 8. Lưu ý quan trọng

- **Không dùng `height: 100vh` cho layout wrapper** — dùng `min-height` thay thế, vì `100vh` trên iOS bao gồm cả thanh địa chỉ.
- **Dùng `100dvh`** (dynamic viewport height) khi cần full screen thực sự (modal).
- **`-webkit-overflow-scrolling: touch`** cho vùng scroll dọc để cuộn mượt trên iOS.
- **Không dùng `position: fixed` cho các phần tử trong scroll container** — sẽ bị lỗi trên iOS.
- **Test trên Safari iOS** — Chrome Android ít lỗi hơn nhiều so với Safari.

---

## 9. Upload ảnh trên Mobile

Ảnh chụp từ camera điện thoại thường rất nặng (3–10MB). Cần nén client-side trước khi upload để tránh chờ lâu trên mạng 4G/Wi-Fi yếu.

### 9.1. Nén ảnh bằng Canvas API

Luôn nén ảnh trước khi upload. Dùng hàm `compressImage()` chuẩn:

```javascript
/**
 * Nén ảnh client-side bằng Canvas API
 * @param {File|Blob} file - File ảnh gốc
 * @param {number} maxWidth - Chiều rộng tối đa (px), default 1920
 * @param {number} quality - Chất lượng JPEG 0-1, default 0.7
 * @returns {Promise<Blob>} - Blob ảnh đã nén
 */
function compressImage(file, maxWidth = 1920, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = function () {
            URL.revokeObjectURL(url);

            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Không thể nén ảnh"));
                },
                "image/jpeg",
                quality,
            );
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("Không thể đọc file ảnh"));
        };

        img.src = url;
    });
}
```

### 9.2. Thông số nén khuyến nghị

| Thông số | Giá trị | Lý do |
|---|---|---|
| `maxWidth` | 1920px | Đủ rõ cho xem trên web, giảm đáng kể kích thước |
| `quality` | 0.7 | Cân bằng chất lượng/dung lượng, ảnh 5MB → ~300KB |
| Max file size (trước nén) | 15MB | Cho phép ảnh gốc lớn vì sẽ nén lại |

### 9.3. File input trên Mobile

Trên mobile, dùng `<input type="file" accept="image/*">` thay vì camera API (WebRTC). Lý do:
- Camera API (`getUserMedia`) không ổn định trên nhiều trình duyệt mobile
- File input tự mở camera hoặc gallery tùy user chọn
- Tương thích tốt hơn trên cả Android và iOS

```html
<!-- Pattern chuẩn: input nằm trong label, ẩn bằng clip -->
<label class="mobile-upload-label" for="mobileFileInput">
    <i data-lucide="camera"></i>
    <span>Chụp / Chọn ảnh</span>
</label>
<input type="file" id="mobileFileInput" accept="image/*"
    style="position:absolute;width:1px;height:1px;clip:rect(0,0,0,0);overflow:hidden;">
```

**Lưu ý Android:** Dùng `clip: rect(0,0,0,0)` thay vì `display: none` — một số trình duyệt Android không trigger file picker khi input bị `display: none`.

### 9.4. Flow xử lý ảnh chuẩn

```
User chọn ảnh → Validate type (image/*) → Validate size (< 15MB)
    → Hiện notification "Đang nén ảnh..."
    → compressImage(file, 1920, 0.7)
    → Lưu blob đã nén → Hiển thị preview
    → Upload blob nén lên Storage
```

Luôn có fallback dùng ảnh gốc nếu nén lỗi:

```javascript
compressImage(file, 1920, 0.7)
    .then((compressedBlob) => {
        // Dùng blob đã nén
        capturedImageBlob = compressedBlob;
    })
    .catch((error) => {
        // Fallback: dùng file gốc
        capturedImageBlob = file;
    });
```

### 9.5. Checklist upload ảnh mobile

- [ ] Nén ảnh client-side trước khi upload (Canvas API, JPEG 0.7)
- [ ] Resize xuống max 1920px width
- [ ] Giới hạn file gốc 15MB (trước nén)
- [ ] Dùng `<input type="file">` thay vì camera API trên mobile
- [ ] Ẩn input bằng `clip: rect(0,0,0,0)`, không dùng `display: none`
- [ ] Hiển thị kích thước sau nén trong notification
- [ ] Có fallback dùng ảnh gốc nếu nén lỗi
- [ ] Camera capture (desktop): dùng `canvas.toBlob('image/jpeg', 0.7)` với resize
