# Goong.io Places API - Autocomplete

Hướng dẫn tích hợp Goong.io Autocomplete vào n2store.

## Tổng quan

- **Chức năng**: Nhập địa chỉ không đầy đủ → trả về địa chỉ đầy đủ (autocomplete)
- **Free tier**: $100 credit khi đăng ký (~30,000 requests/tháng)
- **Docs**: https://docs.goong.io/rest/place
- **Status**: Đã test thành công (2026-03-08)

## Setup (Đã hoàn thành)

### 1. API Key

- Đăng ký tại https://account.goong.io
- Env variable trên Render.com: `GOONG_API_KEY`

### 2. Server Route

- File: `render.com/routes/goong-places.js`
- Đăng ký: `app.use('/api/goong-places', goongPlacesRoutes)` trong `server.js`

### 3. Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/goong-places/` | Health check |
| GET | `/api/goong-places/autocomplete?input=...` | Autocomplete |

## Kiến trúc

```
Browser (client)
    ↓ GET /api/goong-places/autocomplete?input=...
Render.com (server) - giữ API key an toàn
    ↓ GET https://rsapi.goong.io/Place/AutoComplete?input=...&api_key=...
Goong.io API
    ↓ Response
Render.com → Browser
```

## Query Parameters

| Param | Bắt buộc | Mặc định | Mô tả |
|-------|---------|----------|-------|
| `input` | Có | - | Địa chỉ cần tìm (>= 2 ký tự) |
| `limit` | Không | 5 | Số kết quả trả về |
| `more_compound` | Không | true | Trả thêm thông tin phường/quận/tỉnh |

## Test thực tế

### Request
```
GET https://n2store-fallback.onrender.com/api/goong-places/autocomplete?input=123+nguyễn+huệ
```

### Response (rút gọn)
```json
{
    "predictions": [
        {
            "description": "123 Nguyễn Huệ, Lào Cai, Lào Cai, Lào Cai",
            "place_id": "v1yjbbt-PXX...",
            "structured_formatting": {
                "main_text": "123 Nguyễn Huệ",
                "secondary_text": "Lào Cai, Lào Cai, Lào Cai"
            },
            "compound": {
                "district": "Lào Cai",
                "commune": "Lào Cai",
                "province": "Lào Cai"
            },
            "types": ["house_number"]
        },
        {
            "description": "123 Nguyễn Huệ, An Hội, Bến Tre, Bến Tre",
            "compound": { "district": "Bến Tre", "commune": "An Hội", "province": "Bến Tre" }
        },
        {
            "description": "123 Nguyễn Huệ, Hòa Bình, Hòa Bình",
            "compound": { "district": "Hòa Bình", "commune": "Phương Lâm", "province": "Hòa Bình" }
        },
        {
            "description": "123 Nguyễn Huệ, Phường 2, Sóc Trăng, Sóc Trăng",
            "compound": { "district": "Sóc Trăng", "commune": "Phường 2", "province": "Sóc Trăng" }
        },
        {
            "description": "123 Nguyễn Huệ, Nam Bình, Ninh Bình, Ninh Bình",
            "compound": { "district": "Ninh Bình", "commune": "Nam Bình", "province": "Ninh Bình" }
        }
    ],
    "status": "OK"
}
```

### Cấu trúc mỗi prediction

| Field | Mô tả | Ví dụ |
|-------|--------|-------|
| `description` | Địa chỉ đầy đủ | `"123 Nguyễn Huệ, An Hội, Bến Tre, Bến Tre"` |
| `place_id` | ID duy nhất của địa điểm | `"aJeH0Vpzl..."` |
| `structured_formatting.main_text` | Phần chính | `"123 Nguyễn Huệ"` |
| `structured_formatting.secondary_text` | Phần phụ (khu vực) | `"An Hội, Bến Tre, Bến Tre"` |
| `compound.commune` | Phường/Xã | `"An Hội"` |
| `compound.district` | Quận/Huyện | `"Bến Tre"` |
| `compound.province` | Tỉnh/TP | `"Bến Tre"` |
| `types` | Loại địa điểm | `["house_number"]` |

---

## Hướng dẫn tích hợp vào n2store

### Bước 1: Tạo file shared module

Tạo file `shared/browser/goong-places.js` (hoặc `shared/js/goong-places.js` cho legacy):

```javascript
// =====================================================
// GOONG PLACES AUTOCOMPLETE CLIENT
// Sử dụng Goong.io API qua Render.com proxy
// =====================================================

const RENDER_URL = 'https://n2store-fallback.onrender.com';

/**
 * Tìm địa chỉ autocomplete từ Goong.io
 * @param {string} input - Địa chỉ không đầy đủ (vd: "123 nguyễn huệ")
 * @param {Object} options - { limit: 5 }
 * @returns {Promise<Array>} Danh sách gợi ý
 */
async function searchAddress(input, options = {}) {
    if (!input || input.trim().length < 2) return [];

    const params = new URLSearchParams({
        input: input.trim(),
        ...(options.limit && { limit: String(options.limit) })
    });

    try {
        const response = await fetch(`${RENDER_URL}/api/goong-places/autocomplete?${params}`);
        const data = await response.json();

        if (data.status !== 'OK') return [];

        return (data.predictions || []).map(p => ({
            description: p.description || '',
            placeId: p.place_id || '',
            mainText: p.structured_formatting?.main_text || '',
            secondaryText: p.structured_formatting?.secondary_text || '',
            commune: p.compound?.commune || '',
            district: p.compound?.district || '',
            province: p.compound?.province || ''
        }));
    } catch (error) {
        console.error('[GoongPlaces] Error:', error.message);
        return [];
    }
}

```

### Bước 2: Tích hợp vào form (HTML + JS)

#### HTML - Thêm dropdown container sau input address

```html
<div class="address-wrapper" style="position: relative;">
    <div style="display: flex; gap: 8px;">
        <input type="text" id="addressInput" placeholder="Nhập địa chỉ..."
               autocomplete="off" style="flex: 1;" />
        <button type="button" id="addressSearchBtn" class="btn-address-search"
                title="Tìm địa chỉ">🔍 Tìm</button>
    </div>
    <div id="addressDropdown" class="address-dropdown" style="display: none;"></div>
</div>
```

#### CSS

```css
.address-wrapper {
    position: relative;
}

.address-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-top: none;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-height: 250px;
    overflow-y: auto;
    z-index: 1000;
}

.address-suggestion {
    padding: 10px 12px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    transition: background 0.15s;
}

.address-suggestion:hover {
    background: #f5f5f5;
}

.address-suggestion:last-child {
    border-bottom: none;
}

.address-suggestion strong {
    display: block;
    font-size: 14px;
    color: #333;
}

.address-suggestion small {
    display: block;
    font-size: 12px;
    color: #888;
    margin-top: 2px;
}

.btn-address-search {
    padding: 6px 14px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    transition: background 0.15s;
}

.btn-address-search:hover {
    background: #43A047;
}

.btn-address-search:disabled {
    background: #ccc;
    cursor: not-allowed;
}
```

#### JavaScript - Setup autocomplete

```javascript
function setupAddressAutocomplete(inputEl, btnEl, dropdownEl, onSelect) {
    async function doSearch() {
        const query = inputEl.value;
        if (query.length < 2) {
            dropdownEl.style.display = 'none';
            return;
        }

        btnEl.disabled = true;
        btnEl.textContent = '⏳';

        const suggestions = await searchAddress(query);

        btnEl.disabled = false;
        btnEl.textContent = '🔍 Tìm';

        if (suggestions.length === 0) {
            dropdownEl.style.display = 'none';
            return;
        }

        dropdownEl.innerHTML = suggestions.map((s, i) => `
            <div class="address-suggestion" data-index="${i}">
                <strong>${s.mainText}</strong>
                <small>${s.secondaryText}</small>
            </div>
        `).join('');
        dropdownEl.style.display = 'block';

        // Click handler
        dropdownEl.querySelectorAll('.address-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                const selected = suggestions[idx];

                // Điền địa chỉ vào input
                inputEl.value = selected.description;
                dropdownEl.style.display = 'none';

                // Callback để điền các field khác (phường, quận, tỉnh)
                if (onSelect) onSelect(selected);
            });
        });
    }

    // Bấm nút để tìm
    btnEl.addEventListener('click', doSearch);

    // Enter trong input cũng tìm
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doSearch();
        }
    });

    // Đóng dropdown khi click ngoài
    document.addEventListener('click', (e) => {
        if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target) && !btnEl.contains(e.target)) {
            dropdownEl.style.display = 'none';
        }
    });
}
```

### Bước 3: Sử dụng trong trang cụ thể

#### Ví dụ: Form tạo khách hàng (customer-hub)

```javascript
// Khởi tạo autocomplete
const addressInput = document.getElementById('addressInput');
const addressSearchBtn = document.getElementById('addressSearchBtn');
const addressDropdown = document.getElementById('addressDropdown');

setupAddressAutocomplete(addressInput, addressSearchBtn, addressDropdown, (selected) => {
    // Auto-fill các field liên quan
    const communeInput = document.getElementById('communeInput');     // Phường/Xã
    const districtInput = document.getElementById('districtInput');   // Quận/Huyện
    const provinceInput = document.getElementById('provinceInput');   // Tỉnh/TP

    if (communeInput)  communeInput.value = selected.commune;
    if (districtInput) districtInput.value = selected.district;
    if (provinceInput) provinceInput.value = selected.province;
});
```

#### Ví dụ: Form đơn hàng (orders-report)

```javascript
setupAddressAutocomplete(
    document.getElementById('deliveryAddress'),
    document.getElementById('deliverySearchBtn'),
    document.getElementById('deliveryDropdown'),
    (selected) => {
        // Điền địa chỉ giao hàng đầy đủ
        document.getElementById('deliveryAddress').value = selected.description;
        // Có thể map compound vào các field TPOS tương ứng
        console.log('Phường:', selected.commune);
        console.log('Quận:', selected.district);
        console.log('Tỉnh:', selected.province);
    }
);
```

---

## Lưu ý quan trọng

| Lưu ý | Chi tiết |
|--------|---------|
| **Nút tìm** | API chỉ gọi khi user bấm nút "Tìm" hoặc Enter, không tự động |
| **Min length** | Chỉ gọi API khi input >= 2 ký tự |
| **XSS** | Dùng `textContent` thay `innerHTML` nếu dữ liệu từ user |
| **more_compound** | Mặc định `true`, trả thêm commune/district/province |
| **Free tier** | $100 credit ~ 30,000 requests/tháng |
| **Rate limit** | Max 5 requests/giây |
| **Offline** | Không có offline fallback, cần kết nối internet |
