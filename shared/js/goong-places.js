// =====================================================
// GOONG PLACES AUTOCOMPLETE CLIENT
// Sử dụng Goong.io API qua Render.com proxy
// Bấm nút "Tìm" hoặc Enter để gọi API (không auto)
// =====================================================

const GOONG_RENDER_URL = 'https://n2store-fallback.onrender.com';

/**
 * Tìm địa chỉ autocomplete từ Goong.io
 * @param {string} input - Địa chỉ không đầy đủ
 * @param {Object} options - { limit: 5 }
 * @returns {Promise<Array>} Danh sách gợi ý
 */
// Types được xem là địa chỉ (không phải tên công ty/cửa hàng/landmark)
const GOONG_ADDRESS_TYPES = new Set([
    'house_number', 'street_address', 'route', 'street_number',
    'geocode', 'postal_code', 'intersection',
    'neighborhood', 'sublocality', 'sublocality_level_1',
    'locality', 'ward', 'commune',
    'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3'
]);

function isAddressResult(prediction) {
    const types = prediction.types || [];
    // Nếu không có types → giữ lại (fallback)
    if (types.length === 0) return true;
    return types.some(t => GOONG_ADDRESS_TYPES.has(t));
}

async function goongSearchAddress(input, options = {}) {
    if (!input || input.trim().length < 2) return [];

    const params = new URLSearchParams({
        input: input.trim(),
        // Request nhiều hơn vì sẽ filter bớt kết quả business/landmark
        limit: String(options.limit || 10)
    });

    try {
        const response = await fetch(`${GOONG_RENDER_URL}/api/goong-places/autocomplete?${params}`);
        const data = await response.json();

        if (data.status !== 'OK') return [];

        return (data.predictions || [])
            .filter(isAddressResult)
            .slice(0, 5)
            .map(p => ({
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

/**
 * Inject CSS cho address autocomplete (chỉ inject 1 lần)
 */
function goongInjectStyles() {
    if (document.getElementById('goong-places-styles')) return;
    const style = document.createElement('style');
    style.id = 'goong-places-styles';
    style.textContent = `
        .goong-address-wrapper { position: relative; }
        .goong-address-dropdown {
            position: absolute; top: 100%; left: 0; right: 0;
            background: white; border: 1px solid #ddd; border-top: none;
            border-radius: 0 0 8px 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-height: 250px; overflow-y: auto; z-index: 1000; display: none;
        }
        .goong-suggestion {
            padding: 10px 12px; cursor: pointer;
            border-bottom: 1px solid #f0f0f0; transition: background 0.15s;
        }
        .goong-suggestion:hover { background: #f5f5f5; }
        .goong-suggestion:last-child { border-bottom: none; }
        .goong-suggestion strong { display: block; font-size: 13px; color: #333; }
        .goong-suggestion small { display: block; font-size: 11px; color: #888; margin-top: 2px; }
        .goong-search-btn {
            padding: 4px 10px; background: #4CAF50; color: white;
            border: none; border-radius: 4px; cursor: pointer;
            font-size: 12px; white-space: nowrap; transition: background 0.15s;
        }
        .goong-search-btn:hover { background: #43A047; }
        .goong-search-btn:disabled { background: #ccc; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

/**
 * Tự động wrap input với nút Tìm + dropdown
 * @param {HTMLElement} inputEl - Input/textarea element
 * @param {Function} onSelect - Callback khi chọn địa chỉ: (selected) => {}
 */
function goongAttachAutocomplete(inputEl, onSelect) {
    if (!inputEl || inputEl.dataset.goongAttached) return;
    inputEl.dataset.goongAttached = 'true';

    goongInjectStyles();

    // Tạo wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'goong-address-wrapper';

    // Tạo row chứa input + button
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; align-items: flex-start;';

    // Tạo nút tìm
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'goong-search-btn';
    btn.textContent = 'Tìm';
    btn.title = 'Tìm địa chỉ (Goong)';

    // Tạo dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'goong-address-dropdown';

    // Wrap input
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    inputEl.style.flex = '1';
    row.appendChild(inputEl);
    row.appendChild(btn);
    wrapper.appendChild(row);
    wrapper.appendChild(dropdown);

    // Search logic
    async function doSearch() {
        const query = inputEl.value;
        if (!query || query.trim().length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        btn.disabled = true;
        btn.textContent = '...';

        const suggestions = await goongSearchAddress(query);

        btn.disabled = false;
        btn.textContent = 'Tìm';

        if (suggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = suggestions.map((s, i) => `
            <div class="goong-suggestion" data-index="${i}">
                <strong>${s.mainText}</strong>
                <small>${s.secondaryText}</small>
            </div>
        `).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.goong-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                const selected = suggestions[idx];
                inputEl.value = selected.description;
                dropdown.style.display = 'none';
                if (onSelect) onSelect(selected);
            });
        });
    }

    btn.addEventListener('click', doSearch);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
    });
}
