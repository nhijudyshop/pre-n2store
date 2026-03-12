/**
 * Shared Customer Creator Modal
 * Tạo khách hàng mới - dùng chung cho nhiều page (customer-hub, orders-report, ...)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TÍNH NĂNG: TẠO KHÁCH HÀNG MỚI (Create New Customer)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * MÔ TẢ:
 *   Modal popup cho phép tạo nhanh khách hàng (Partner) trên hệ thống TPOS.
 *   Được thiết kế dùng chung (shared module) cho nhiều trang: customer-hub,
 *   orders-report, và các module khác cần tạo khách hàng.
 *
 * TÍNH NĂNG GỢI Ý KHÁCH HÀNG:
 *   - Khi nhập SĐT đủ 10 số, tự động tìm khách hàng trên TPOS
 *   - Nếu tìm thấy 1 KH → auto-fill tên, địa chỉ, hiện badge trạng thái
 *   - Nếu tìm thấy nhiều KH → hiện dropdown để chọn đúng KH
 *   - Chọn KH có sẵn → nút đổi thành "Chọn khách hàng" (không tạo mới)
 *   - Không tìm thấy → tiếp tục tạo KH mới như bình thường
 *
 * FORM FIELDS:
 *   ┌──────────────────┬──────────┬───────────────────────────────────────┐
 *   │ Field            │ Bắt buộc │ Validation                            │
 *   ├──────────────────┼──────────┼───────────────────────────────────────┤
 *   │ Tên khách hàng   │ Có (*)   │ Không được để trống                   │
 *   │ Số điện thoại    │ Có (*)   │ Regex /^0\d{8,9}$/ (VN format,       │
 *   │                  │          │ bắt đầu bằng 0, tổng 10-11 số)       │
 *   │ Địa chỉ          │ Không    │ Không validation                      │
 *   └──────────────────┴──────────┴───────────────────────────────────────┘
 *
 * LUỒNG HOẠT ĐỘNG (Flow):
 *   1. User click nút "Tạo KH" → gọi CustomerCreator.open({ onSuccess })
 *   2. Modal hiện lên, reset form, focus vào ô SĐT
 *   3. User nhập SĐT → debounce 500ms → tìm KH trên TPOS
 *   4. Nếu có KH → hiện dropdown gợi ý / auto-fill
 *   5. Nếu không có → user điền tên, địa chỉ → click "Tạo khách hàng"
 *   6. Validate: tên (required), SĐT (required + regex VN)
 *   7. Gọi API tạo Partner trên TPOS hoặc chọn KH có sẵn
 *   8. Thành công → gọi callback onSuccess với { id, name, phone, address, status }
 *   9. Tự đóng modal sau 1 giây
 *
 * Requires: window.tokenManager (from pancake-token-manager.js)
 * Optional: window.ShopConfig (for CompanyId)
 *           window.apiService (preferred API layer)
 *           window.fetchTPOSCustomer (from tpos-customer-lookup.js)
 *
 * Usage:
 *   window.CustomerCreator.open({
 *       onSuccess: (customer) => {
 *           // customer = { id, name, phone, address, status }
 *           console.log('Created:', customer.name, customer.phone);
 *       }
 *   });
 *
 * Exposed API:
 *   window.CustomerCreator.open(options)  — Mở modal tạo KH
 *   window.CustomerCreator.close()        — Đóng modal
 */
(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TPOS_ODATA = `${WORKER_URL}/api/odata`;

    let modalEl = null;
    let _phoneLookupTimeout = null;
    let _selectedExistingCustomer = null; // KH có sẵn được chọn từ dropdown

    function getModalHTML() {
        return `
            <div class="cc-backdrop"></div>
            <div class="cc-center">
                <div class="cc-dialog">
                    <div class="cc-header">
                        <h3 class="cc-title">
                            <i class="fas fa-user-plus"></i>
                            Tạo khách hàng mới
                        </h3>
                        <button class="cc-close-btn" data-cc-close>×</button>
                    </div>
                    <div class="cc-body">
                        <div class="cc-field cc-field-phone">
                            <label>Số điện thoại <span class="cc-required">*</span></label>
                            <input type="tel" id="cc-phone" placeholder="Nhập số điện thoại" autocomplete="off" />
                            <div id="cc-phone-loading" class="cc-phone-loading" style="display:none;">
                                <i class="fas fa-spinner fa-spin"></i> Đang tìm khách hàng...
                            </div>
                            <div id="cc-customer-dropdown" class="cc-customer-dropdown" style="display:none;"></div>
                        </div>
                        <div id="cc-existing-badge" class="cc-existing-badge" style="display:none;"></div>
                        <div class="cc-field">
                            <label>Tên khách hàng <span class="cc-required">*</span></label>
                            <input type="text" id="cc-name" placeholder="Nhập tên khách hàng" />
                        </div>
                        <div class="cc-field">
                            <label>Địa chỉ</label>
                            <input type="text" id="cc-street" placeholder="Nhập địa chỉ" />
                        </div>
                        <div id="cc-error" class="cc-msg cc-msg-error" style="display:none;"></div>
                        <div id="cc-success" class="cc-msg cc-msg-success" style="display:none;"></div>
                    </div>
                    <div class="cc-footer">
                        <button class="cc-btn-cancel" data-cc-close>Hủy</button>
                        <button class="cc-btn-submit" id="cc-submit">
                            <i class="fas fa-save"></i> Tạo khách hàng
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function getStyles() {
        return `
            .cc-modal { position: fixed; inset: 0; z-index: 10000; display: none; }
            .cc-modal.cc-show { display: block; }
            .cc-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(2px); }
            .cc-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
            .cc-dialog { background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 420px; overflow: hidden; }
            .cc-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
            .cc-title { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px; }
            .cc-title i { color: #3b82f6; }
            .cc-close-btn { background: none; border: none; font-size: 22px; color: #9ca3af; cursor: pointer; padding: 0 4px; line-height: 1; }
            .cc-close-btn:hover { color: #374151; }
            .cc-body { padding: 20px; }
            .cc-field { margin-bottom: 14px; }
            .cc-field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 5px; }
            .cc-required { color: #ef4444; }
            .cc-field input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
            .cc-field input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
            .cc-field input.cc-input-matched { border-color: #22c55e; background: #f0fdf4; }
            .cc-msg { font-size: 13px; padding: 8px 12px; border-radius: 8px; margin-top: 8px; }
            .cc-msg-error { color: #dc2626; background: #fef2f2; }
            .cc-msg-success { color: #16a34a; background: #f0fdf4; }
            .cc-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid #e5e7eb; }
            .cc-btn-cancel { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #6b7280; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            .cc-btn-cancel:hover { background: #f3f4f6; }
            .cc-btn-submit { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #fff; background: #3b82f6; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
            .cc-btn-submit:hover { background: #2563eb; }
            .cc-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
            .cc-btn-submit.cc-btn-select { background: #22c55e; }
            .cc-btn-submit.cc-btn-select:hover { background: #16a34a; }

            /* Phone lookup loading */
            .cc-phone-loading { font-size: 12px; color: #6b7280; padding: 4px 0; }
            .cc-phone-loading i { color: #3b82f6; }

            /* Customer suggestion dropdown */
            .cc-field-phone { position: relative; }
            .cc-customer-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 2px solid #3b82f6; border-radius: 0 0 8px 8px; max-height: 240px; overflow-y: auto; z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
            .cc-dropdown-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
            .cc-dropdown-item:last-child { border-bottom: none; }
            .cc-dropdown-item:hover { background: #f0f9ff; }
            .cc-dropdown-name { font-size: 13px; font-weight: 600; color: #1e293b; }
            .cc-dropdown-phone { font-size: 12px; color: #6b7280; }
            .cc-dropdown-address { font-size: 11px; color: #9ca3af; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cc-dropdown-status { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; margin-left: 6px; }
            .cc-dropdown-footer { padding: 8px 12px; text-align: center; font-size: 12px; color: #3b82f6; cursor: pointer; border-top: 1px solid #e5e7eb; font-weight: 500; }
            .cc-dropdown-footer:hover { background: #f0f9ff; }

            /* Existing customer badge */
            .cc-existing-badge { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; margin-bottom: 14px; font-size: 13px; }
            .cc-existing-badge .cc-badge-icon { color: #22c55e; font-size: 16px; }
            .cc-existing-badge .cc-badge-text { flex: 1; color: #166534; font-weight: 500; }
            .cc-existing-badge .cc-badge-status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; }
            .cc-existing-badge .cc-badge-clear { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 16px; padding: 0 2px; }
            .cc-existing-badge .cc-badge-clear:hover { color: #ef4444; }
        `;
    }

    const STATUS_COLORS = {
        'Bình thường': '#22c55e',
        'Bom hàng': '#ef4444',
        'Cảnh báo': '#f59e0b',
        'Nguy hiểm': '#dc2626',
        'VIP': '#6366f1'
    };

    let _phoneLookupBound = false;

    function ensureModal() {
        if (modalEl) return;

        console.log('[CustomerCreator] Creating modal...');

        // Inject styles
        const style = document.createElement('style');
        style.textContent = getStyles();
        document.head.appendChild(style);

        // Create modal element
        modalEl = document.createElement('div');
        modalEl.className = 'cc-modal';
        modalEl.innerHTML = getModalHTML();
        document.body.appendChild(modalEl);

        // Close handlers
        modalEl.querySelectorAll('[data-cc-close]').forEach(btn => {
            btn.addEventListener('click', close);
        });
        modalEl.querySelector('.cc-backdrop').addEventListener('click', close);

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (modalEl && !modalEl.querySelector('.cc-field-phone')?.contains(e.target)) {
                hideDropdown();
            }
        });

        console.log('[CustomerCreator] Modal created. fetchTPOSCustomer available:', typeof window.fetchTPOSCustomer === 'function');
    }

    function bindPhoneLookup() {
        // Bind phone input lookup - called every time open() runs to ensure handler is attached
        const phoneInput = modalEl.querySelector('#cc-phone');
        if (!phoneInput) {
            console.error('[CustomerCreator] Phone input #cc-phone not found!');
            return;
        }

        if (_phoneLookupBound) return; // Already bound
        _phoneLookupBound = true;

        console.log('[CustomerCreator] Binding phone lookup handler...');

        phoneInput.addEventListener('input', function () {
            const rawValue = this.value;
            const phone = rawValue.replace(/\D/g, '');

            console.log('[CustomerCreator] Phone input:', rawValue, '→ digits:', phone, '(length:', phone.length + ')');

            // Clear previous timeout
            if (_phoneLookupTimeout) {
                clearTimeout(_phoneLookupTimeout);
            }

            // Hide dropdown & loading when typing
            hideDropdown();
            modalEl.querySelector('#cc-phone-loading').style.display = 'none';

            // If user edits phone after selecting existing customer, clear selection
            if (_selectedExistingCustomer) {
                clearExistingSelection();
            }

            // Only lookup when phone is 10+ digits (VN format: 10 or 11 digits)
            if (phone.length < 10) return;

            console.log('[CustomerCreator] Phone valid, will lookup in 500ms...');

            // Show loading
            modalEl.querySelector('#cc-phone-loading').style.display = 'block';

            _phoneLookupTimeout = setTimeout(async () => {
                await lookupCustomerByPhone(phone);
            }, 500);
        });

        console.log('[CustomerCreator] Phone lookup handler bound successfully');
    }

    async function lookupCustomerByPhone(phone) {
        const loadingEl = modalEl.querySelector('#cc-phone-loading');

        if (!window.fetchTPOSCustomer) {
            loadingEl.style.display = 'none';
            console.warn('[CustomerCreator] fetchTPOSCustomer not available! Make sure tpos-customer-lookup.js is loaded.');
            // Show inline warning
            const errorEl = modalEl.querySelector('#cc-error');
            errorEl.textContent = 'Không thể tìm KH (module lookup chưa sẵn sàng)';
            errorEl.style.display = 'block';
            return;
        }

        try {
            console.log('[CustomerCreator] Calling fetchTPOSCustomer for phone:', phone);
            const result = await window.fetchTPOSCustomer(phone);
            console.log('[CustomerCreator] Lookup result:', JSON.stringify(result));
            loadingEl.style.display = 'none';

            if (result.success && result.count > 0) {
                if (result.count === 1) {
                    // Single match → auto-fill and show badge
                    selectExistingCustomer(result.customers[0]);
                } else {
                    // Multiple matches → show dropdown
                    showDropdown(result.customers);
                }
            } else {
                console.log('[CustomerCreator] No existing customer found for', phone);
            }
        } catch (error) {
            loadingEl.style.display = 'none';
            console.error('[CustomerCreator] Phone lookup error:', error);
        }
    }

    function showDropdown(customers) {
        const dropdown = modalEl.querySelector('#cc-customer-dropdown');
        let html = '';

        customers.forEach((c, idx) => {
            const color = STATUS_COLORS[c.statusText] || '#6b7280';
            html += `
                <div class="cc-dropdown-item" data-cc-idx="${idx}">
                    <div>
                        <span class="cc-dropdown-name">${escapeHtml(c.name)}</span>
                        <span class="cc-dropdown-status" style="background:${color}">${escapeHtml(c.statusText || 'N/A')}</span>
                    </div>
                    <div class="cc-dropdown-phone">${escapeHtml(c.phone || '')}</div>
                    ${c.address ? `<div class="cc-dropdown-address"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(c.address)}</div>` : ''}
                </div>
            `;
        });

        html += `<div class="cc-dropdown-footer" data-cc-new>
            <i class="fas fa-plus"></i> Tạo khách hàng mới với SĐT này
        </div>`;

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        // Click handlers for items
        dropdown.querySelectorAll('.cc-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.ccIdx);
                selectExistingCustomer(customers[idx]);
                hideDropdown();
            });
        });

        // "Create new" option
        dropdown.querySelector('[data-cc-new]').addEventListener('click', () => {
            hideDropdown();
            modalEl.querySelector('#cc-name').focus();
        });
    }

    function hideDropdown() {
        if (!modalEl) return;
        const dropdown = modalEl.querySelector('#cc-customer-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    function selectExistingCustomer(customer) {
        _selectedExistingCustomer = customer;

        // Auto-fill fields
        const nameInput = modalEl.querySelector('#cc-name');
        const streetInput = modalEl.querySelector('#cc-street');
        const phoneInput = modalEl.querySelector('#cc-phone');

        nameInput.value = customer.name || '';
        streetInput.value = customer.address || '';
        phoneInput.classList.add('cc-input-matched');

        // Make name & address read-only to indicate auto-filled
        nameInput.readOnly = true;
        streetInput.readOnly = true;
        nameInput.style.background = '#f0fdf4';
        streetInput.style.background = '#f0fdf4';

        // Show existing customer badge
        const badgeEl = modalEl.querySelector('#cc-existing-badge');
        const color = STATUS_COLORS[customer.statusText] || '#6b7280';
        badgeEl.innerHTML = `
            <i class="fas fa-user-check cc-badge-icon"></i>
            <span class="cc-badge-text">KH có sẵn: ${escapeHtml(customer.name)} (ID: ${customer.id})</span>
            <span class="cc-badge-status" style="background:${color}">${escapeHtml(customer.statusText || 'N/A')}</span>
            <button class="cc-badge-clear" title="Bỏ chọn, tạo KH mới">×</button>
        `;
        badgeEl.style.display = 'flex';

        // Clear badge handler
        badgeEl.querySelector('.cc-badge-clear').addEventListener('click', () => {
            clearExistingSelection();
            modalEl.querySelector('#cc-name').focus();
        });

        // Change submit button to "Chọn khách hàng"
        const submitBtn = modalEl.querySelector('#cc-submit');
        submitBtn.innerHTML = '<i class="fas fa-user-check"></i> Chọn khách hàng';
        submitBtn.classList.add('cc-btn-select');

        // Update modal title
        modalEl.querySelector('.cc-title').innerHTML = '<i class="fas fa-user-check"></i> Chọn khách hàng có sẵn';

        console.log('[CustomerCreator] Selected existing customer:', customer.name, 'ID:', customer.id);
    }

    function clearExistingSelection() {
        _selectedExistingCustomer = null;

        const nameInput = modalEl.querySelector('#cc-name');
        const streetInput = modalEl.querySelector('#cc-street');
        const phoneInput = modalEl.querySelector('#cc-phone');

        nameInput.readOnly = false;
        streetInput.readOnly = false;
        nameInput.style.background = '';
        streetInput.style.background = '';
        nameInput.value = '';
        streetInput.value = '';
        phoneInput.classList.remove('cc-input-matched');

        // Hide badge
        modalEl.querySelector('#cc-existing-badge').style.display = 'none';

        // Restore submit button
        const submitBtn = modalEl.querySelector('#cc-submit');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Tạo khách hàng';
        submitBtn.classList.remove('cc-btn-select');

        // Restore modal title
        modalEl.querySelector('.cc-title').innerHTML = '<i class="fas fa-user-plus"></i> Tạo khách hàng mới';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function open(options = {}) {
        ensureModal();
        bindPhoneLookup(); // Ensure phone lookup is bound

        console.log('[CustomerCreator] Opening modal. fetchTPOSCustomer:', typeof window.fetchTPOSCustomer);

        const onSuccess = options.onSuccess || function () { };

        // Reset state
        _selectedExistingCustomer = null;

        // Reset form
        modalEl.querySelector('#cc-phone').value = '';
        modalEl.querySelector('#cc-phone').classList.remove('cc-input-matched');
        modalEl.querySelector('#cc-name').value = '';
        modalEl.querySelector('#cc-name').readOnly = false;
        modalEl.querySelector('#cc-name').style.background = '';
        modalEl.querySelector('#cc-street').value = '';
        modalEl.querySelector('#cc-street').readOnly = false;
        modalEl.querySelector('#cc-street').style.background = '';
        modalEl.querySelector('#cc-phone-loading').style.display = 'none';
        modalEl.querySelector('#cc-existing-badge').style.display = 'none';
        hideDropdown();

        const errorEl = modalEl.querySelector('#cc-error');
        const successEl = modalEl.querySelector('#cc-success');
        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        // Restore title & button
        modalEl.querySelector('.cc-title').innerHTML = '<i class="fas fa-user-plus"></i> Tạo khách hàng mới';
        const submitBtn = modalEl.querySelector('#cc-submit');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Tạo khách hàng';
        submitBtn.classList.remove('cc-btn-select');

        // Remove old listener, add new one
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener('click', () => submitCreateCustomer(onSuccess));

        // Goong Places autocomplete cho địa chỉ
        if (typeof goongAttachAutocomplete === 'function') {
            goongAttachAutocomplete(modalEl.querySelector('#cc-street'));
        }

        // Show modal
        modalEl.classList.add('cc-show');
        document.body.style.overflow = 'hidden';

        // Focus on phone input first (since lookup starts from phone)
        setTimeout(() => modalEl.querySelector('#cc-phone').focus(), 100);
    }

    function close() {
        if (!modalEl) return;
        modalEl.classList.remove('cc-show');
        document.body.style.overflow = '';
    }

    async function submitCreateCustomer(onSuccess) {
        const name = modalEl.querySelector('#cc-name').value.trim();
        const phone = modalEl.querySelector('#cc-phone').value.trim();
        const street = modalEl.querySelector('#cc-street').value.trim();
        const errorEl = modalEl.querySelector('#cc-error');
        const successEl = modalEl.querySelector('#cc-success');
        const submitBtn = modalEl.querySelector('#cc-submit');

        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        // If existing customer is selected, return it directly
        if (_selectedExistingCustomer) {
            successEl.textContent = `Đã chọn: ${_selectedExistingCustomer.name} (ID: ${_selectedExistingCustomer.id})`;
            successEl.style.display = 'block';

            if (typeof onSuccess === 'function') {
                onSuccess({
                    id: _selectedExistingCustomer.id,
                    name: _selectedExistingCustomer.name,
                    phone: _selectedExistingCustomer.phone || phone,
                    address: _selectedExistingCustomer.address || '',
                    status: _selectedExistingCustomer.statusText || 'Bình thường'
                });
            }

            setTimeout(() => close(), 1000);
            return;
        }

        // Validate for new customer creation
        if (!name) {
            errorEl.textContent = 'Vui lòng nhập tên khách hàng';
            errorEl.style.display = 'block';
            return;
        }
        if (!phone) {
            errorEl.textContent = 'Vui lòng nhập số điện thoại';
            errorEl.style.display = 'block';
            return;
        }
        if (!/^0\d{8,9}$/.test(phone)) {
            errorEl.textContent = 'Số điện thoại không hợp lệ (VD: 0909123456)';
            errorEl.style.display = 'block';
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

        try {
            const result = await createPartnerOnTPOS({ name, phone, street });

            successEl.textContent = `Tạo thành công: ${result.Name} (ID: ${result.Id})`;
            successEl.style.display = 'block';

            // Callback with created customer data
            if (typeof onSuccess === 'function') {
                onSuccess({
                    id: result.Id,
                    name: result.Name || name,
                    phone: result.Phone || phone,
                    address: result.Street || street || '',
                    status: result.StatusText || 'Bình thường'
                });
            }

            // Close modal after 1s
            setTimeout(() => close(), 1000);
        } catch (error) {
            console.error('[CustomerCreator] Create partner failed:', error);
            errorEl.textContent = error.message || 'Tạo khách hàng thất bại';
            errorEl.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Tạo khách hàng';
        }
    }

    async function createPartnerOnTPOS({ name, phone, street }) {
        // If apiService is available, use it
        if (window.apiService && typeof window.apiService.createPartner === 'function') {
            return window.apiService.createPartner({ name, phone, street });
        }

        // Otherwise, call TPOS directly via tokenManager
        if (!window.tokenManager || typeof window.tokenManager.authenticatedFetch !== 'function') {
            throw new Error('Không thể kết nối TPOS (thiếu tokenManager)');
        }

        const companyId = window.ShopConfig ? window.ShopConfig.getConfig().CompanyId : 1;
        const now = new Date().toISOString();

        const payload = {
            Id: 0,
            Name: name,
            DisplayName: null,
            Street: street || null,
            Phone: phone,
            Customer: true,
            Supplier: false,
            IsCompany: false,
            Active: true,
            Employee: false,
            CompanyId: companyId,
            Type: "contact",
            CompanyType: "person",
            Credit: 0,
            Debit: 0,
            CreditLimit: 0,
            OverCredit: false,
            Discount: 0,
            AmountDiscount: 0,
            CategoryId: 0,
            DateCreated: now,
            Status: "Normal",
            StatusText: "Bình thường",
            Source: "Default",
            IsNewAddress: false,
            Ward_District_City: "",
            ExtraAddress: {
                Street: street || "",
                City: {},
                District: {},
                Ward: {}
            },
            City: {},
            District: {},
            Ward: {},
            AccountPayable: {
                Id: 4, Name: "Phải trả người bán", Code: "331",
                UserTypeId: 2, UserTypeName: "Payable", Active: true,
                CompanyId: companyId, InternalType: "payable",
                NameGet: "331 Phải trả người bán", Reconcile: true
            },
            AccountReceivable: {
                Id: 1, Name: "Phải thu của khách hàng", Code: "131",
                UserTypeId: 1, UserTypeName: "Receivable", Active: true,
                CompanyId: companyId, InternalType: "receivable",
                NameGet: "131 Phải thu của khách hàng", Reconcile: true
            },
            StockCustomer: {
                Id: 9, Usage: "customer", ScrapLocation: false,
                Name: "Khách hàng", CompleteName: "Địa điểm đối tác / Khách hàng",
                ParentLocationId: 2, Active: true, ParentLeft: 13,
                ShowUsage: "Địa điểm khách hàng",
                NameGet: "Địa điểm đối tác/Khách hàng"
            },
            StockSupplier: {
                Id: 8, Usage: "supplier", ScrapLocation: false,
                Name: "Nhà cung cấp", CompleteName: "Địa điểm đối tác / Nhà cung cấp",
                ParentLocationId: 2, Active: true, ParentLeft: 15,
                ShowUsage: "Địa điểm nhà cung cấp",
                NameGet: "Địa điểm đối tác/Nhà cung cấp"
            }
        };

        console.log('[CustomerCreator] Creating TPOS Partner:', { name, phone, street, companyId });

        const response = await window.tokenManager.authenticatedFetch(
            `${TPOS_ODATA}/Partner`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8',
                    'feature-version': '2'
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CustomerCreator] Create Partner failed:', errorText);
            throw new Error(`Tạo khách hàng thất bại: ${response.status}`);
        }

        const result = await response.json();
        console.log('[CustomerCreator] Partner created:', result.Id, result.Name);
        return result;
    }

    // Expose globally
    window.CustomerCreator = { open, close };
})();
