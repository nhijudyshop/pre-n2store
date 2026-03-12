// ============================================
// PANCAKE SETTINGS MODAL & TAG FILTER & API TOGGLE
// Extracted from tab1-orders.html
// ============================================

// ====== PANCAKE SETTINGS ======

// Open Pancake Settings Modal
window.openPancakeSettingsModal = async function() {
    document.getElementById('pancakeSettingsModal').style.display = 'flex';

    // Check admin permission and show/hide buttons accordingly
    const isAdmin = isUserAdmin();

    // Hide/show add/delete buttons for non-admin
    const btnAddAccount = document.getElementById('btnAddAccount');
    const btnAddPageToken = document.getElementById('btnAddPageToken');
    const btnClearAllAccounts = document.getElementById('btnClearAllAccounts');

    if (btnAddAccount) btnAddAccount.style.display = isAdmin ? 'inline-block' : 'none';
    if (btnAddPageToken) btnAddPageToken.style.display = isAdmin ? 'inline-block' : 'none';
    if (btnClearAllAccounts) btnClearAllAccounts.style.display = isAdmin ? 'inline-block' : 'none';

    // Load accounts list
    if (window.pancakeTokenManager) {
        await window.pancakeTokenManager.initialize();
        await window.refreshAccountsList();
    }
};

// Close Pancake Settings Modal
window.closePancakeSettingsModal = function() {
    document.getElementById('pancakeSettingsModal').style.display = 'none';
    window.hideAddAccountForm();
};

// Show Add Account Form
window.showAddAccountForm = function() {
    document.getElementById('addAccountForm').style.display = 'block';
    document.getElementById('newAccountTokenInput').value = '';
    document.getElementById('newAccountTokenInput').focus();
};

// Hide Add Account Form
window.hideAddAccountForm = function() {
    document.getElementById('addAccountForm').style.display = 'none';
    document.getElementById('newAccountTokenInput').value = '';
    document.getElementById('tokenValidationMessage').style.display = 'none';
};

// Validate Token Input (real-time)
window.validateTokenInput = function() {
    const input = document.getElementById('newAccountTokenInput').value;
    const messageDiv = document.getElementById('tokenValidationMessage');

    if (!input || input.trim() === '') {
        messageDiv.style.display = 'none';
        return;
    }

    try {
        // Clean token
        let cleanedToken = input.trim();
        if (cleanedToken.toLowerCase().startsWith('jwt=')) {
            cleanedToken = cleanedToken.substring(4).trim();
        }
        cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');
        cleanedToken = cleanedToken.replace(/\s+/g, '');
        cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

        // Check format
        const parts = cleanedToken.split('.');
        if (parts.length !== 3) {
            messageDiv.innerHTML = `<span style="color: #f59e0b;">⚠️ Token có ${parts.length} phần, cần 3 phần (header.payload.signature)</span>`;
            messageDiv.style.display = 'block';
            return;
        }

        // Check each part
        if (!parts[0] || !parts[1] || !parts[2]) {
            messageDiv.innerHTML = '<span style="color: #f59e0b;">⚠️ Token có phần trống</span>';
            messageDiv.style.display = 'block';
            return;
        }

        // Try to decode (basic check)
        if (window.pancakeTokenManager) {
            const payload = window.pancakeTokenManager.decodeToken(cleanedToken);
            if (payload) {
                const isExpired = window.pancakeTokenManager.isTokenExpired(payload.exp);
                if (isExpired) {
                    const expiryDate = new Date(payload.exp * 1000).toLocaleDateString('vi-VN');
                    messageDiv.innerHTML = `<span style="color: #ef4444;">❌ Token đã hết hạn: ${expiryDate}</span>`;
                } else {
                    const expiryDate = new Date(payload.exp * 1000).toLocaleDateString('vi-VN');
                    messageDiv.innerHTML = `<span style="color: #10b981;">✅ Token hợp lệ - ${payload.name || 'N/A'} - Hết hạn: ${expiryDate}</span>`;
                }
                messageDiv.style.display = 'block';
                return;
            }
        }

        messageDiv.innerHTML = '<span style="color: #f59e0b;">⚠️ Không thể giải mã token, vui lòng kiểm tra lại</span>';
        messageDiv.style.display = 'block';

    } catch (error) {
        messageDiv.innerHTML = '<span style="color: #ef4444;">❌ Lỗi: ' + error.message + '</span>';
        messageDiv.style.display = 'block';
    }
};

// Debug Token Input
window.debugTokenInput = function() {
    const input = document.getElementById('newAccountTokenInput').value;

    if (!input || input.trim() === '') {
        alert('Vui lòng nhập token vào ô trên trước khi debug');
        return;
    }

    if (!window.pancakeTokenManager) {
        alert('PancakeTokenManager not available');
        return;
    }

    console.log('='.repeat(80));
    console.log('🔍 DEBUG TOKEN ANALYSIS');
    console.log('='.repeat(80));

    const result = window.pancakeTokenManager.debugToken(input);

    console.log('📊 THÔNG TIN CƠ BẢN:');
    console.log('  - Độ dài gốc:', result.info.originalLength);
    console.log('  - Có khoảng trắng:', result.info.hasSpaces ? 'Có ⚠️' : 'Không');
    console.log('  - Có newline:', result.info.hasNewlines ? 'Có ⚠️' : 'Không');
    console.log('  - Có prefix jwt=:', result.info.hasPrefix ? 'Có' : 'Không');
    console.log('  - Độ dài sau làm sạch:', result.info.cleanedLength);
    console.log('  - Số phần:', result.info.parts);
    if (result.info.partLengths) {
        console.log('  - Độ dài từng phần:', result.info.partLengths.join(', '));
    }

    if (result.valid) {
        console.log('\n✅ TOKEN HỢP LỆ:');
        console.log('  - Tên:', result.info.name);
        console.log('  - UID:', result.info.uid);
        console.log('  - Hết hạn:', result.info.expiryDate);
        console.log('  - Đã hết hạn:', result.info.isExpired ? 'Có ❌' : 'Không ✅');
    } else {
        console.log('\n❌ TOKEN KHÔNG HỢP LỆ:');
        result.issues.forEach((issue, index) => {
            console.log(`  ${index + 1}. ${issue}`);
        });
    }

    console.log('='.repeat(80));

    // Show alert with summary
    let message = '🔍 KẾT QUẢ DEBUG:\n\n';
    message += `Độ dài token: ${result.info.originalLength} → ${result.info.cleanedLength} (sau làm sạch)\n`;
    message += `Số phần: ${result.info.parts}\n\n`;

    if (result.valid) {
        message += `✅ Token hợp lệ!\n\n`;
        message += `Tên: ${result.info.name}\n`;
        message += `Hết hạn: ${result.info.expiryDate}\n`;
        message += `Trạng thái: ${result.info.isExpired ? 'Đã hết hạn ❌' : 'Còn hạn ✅'}`;
    } else {
        message += '❌ Token không hợp lệ!\n\n';
        message += 'Vấn đề:\n';
        result.issues.forEach((issue, index) => {
            message += `${index + 1}. ${issue}\n`;
        });
        message += '\n📋 Chi tiết đã được in ra console (F12)';
    }

    alert(message);
};

// Refresh Accounts List
window.refreshAccountsList = async function() {
    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const accounts = window.pancakeTokenManager.getAllAccounts();
        const activeAccountId = window.pancakeTokenManager.activeAccountId;
        const listDiv = document.getElementById('pancakeAccountsList');
        const isAdmin = isUserAdmin();

        if (!accounts || Object.keys(accounts).length === 0) {
            listDiv.innerHTML = `
                <div style="text-align: center; color: #9ca3af; padding: 20px;">
                    <i class="fas fa-users" style="font-size: 32px; margin-bottom: 8px;"></i>
                    <div>Chưa có tài khoản nào</div>
                    <div style="font-size: 12px; margin-top: 4px;">Bấm "Thêm tài khoản" để bắt đầu</div>
                </div>
            `;
            return;
        }

        let html = '';
        for (const [accountId, account] of Object.entries(accounts)) {
            const isActive = accountId === activeAccountId;
            const isExpired = window.pancakeTokenManager.isTokenExpired(account.exp);
            const statusColor = isExpired ? '#ef4444' : '#10b981';
            const statusText = isExpired ? '❌ Hết hạn' : '✅ Còn hạn';
            const activeStyle = isActive ? 'border: 2px solid #3b82f6; background: #eff6ff;' : 'border: 1px solid #e5e7eb; background: white;';

            html += `
                <div style="padding: 12px; ${activeStyle} border-radius: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="font-size: 14px; font-weight: 500; color: #1f2937; margin-bottom: 4px;">
                                ${isActive ? '<i class="fas fa-check-circle" style="color: #3b82f6;"></i> ' : ''}
                                ${account.name || 'Unknown User'}
                            </div>
                            <div style="font-size: 11px; color: #6b7280; font-family: monospace;">
                                UID: ${account.uid || 'N/A'}
                            </div>
                            <div id="accountPages_${accountId}" style="font-size: 11px; color: #9ca3af; margin-top: 4px;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 10px;"></i> Đang kiểm tra pages...
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; color: ${statusColor}; font-weight: 500;">
                                ${statusText}
                            </div>
                            <div style="font-size: 10px; color: #9ca3af;">
                                ${new Date(account.exp * 1000).toLocaleDateString('vi-VN')}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${!isActive && !isExpired ? `
                            <button onclick="selectAccount('${accountId}')"
                                style="padding: 4px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                <i class="fas fa-check"></i> Chọn
                            </button>
                        ` : ''}
                        ${isActive ? `
                            <span style="padding: 4px 10px; background: #3b82f6; color: white; border-radius: 4px; font-size: 11px;">
                                <i class="fas fa-star"></i> Đang dùng
                            </span>
                        ` : ''}
                        ${isAdmin ? `
                            <button onclick="deleteAccount('${accountId}')"
                                style="padding: 4px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                <i class="fas fa-trash"></i> Xóa
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        listDiv.innerHTML = html;

        // Async: fetch pages for each valid account to show which pages they have access to
        for (const [accountId, account] of Object.entries(accounts)) {
            const isExpired = window.pancakeTokenManager.isTokenExpired(account.exp);
            if (!isExpired && account.token) {
                fetchPagesForAccount(accountId, account.token);
            } else {
                const div = document.getElementById(`accountPages_${accountId}`);
                if (div) div.innerHTML = '<span style="color: #ef4444; font-size: 11px;">Token hết hạn</span>';
            }
        }

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error refreshing accounts list:', error);
        document.getElementById('pancakeAccountsList').innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 20px;">
                <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 8px;"></i>
                <div>Lỗi: ${error.message}</div>
            </div>
        `;
    }
};

// Fetch pages for a specific account to show access info
async function fetchPagesForAccount(accountId, token) {
    const div = document.getElementById(`accountPages_${accountId}`);
    if (!div) return;

    try {
        const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${token}`);
        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.categorized?.activated) {
            const pages = data.categorized.activated.filter(p => !p.id.startsWith('igo_'));
            if (pages.length > 0) {
                const pageNames = pages.map(p => `<span style="display: inline-block; padding: 1px 6px; background: #ede9fe; color: #6d28d9; border-radius: 3px; margin: 1px 2px; font-size: 10px;">${p.name}</span>`).join('');
                div.innerHTML = `<i class="fas fa-file-alt" style="color: #8b5cf6; font-size: 10px;"></i> <strong>${pages.length} pages</strong>: ${pageNames}`;
                div.style.color = '#374151';
            } else {
                div.innerHTML = '<span style="color: #f59e0b;">⚠️ 0 pages</span>';
            }
        } else {
            div.innerHTML = '<span style="color: #f59e0b;">⚠️ Không thể kiểm tra</span>';
        }
    } catch (err) {
        console.error(`[PANCAKE-SETTINGS] Error fetching pages for ${accountId}:`, err);
        div.innerHTML = '<span style="color: #ef4444;">❌ Lỗi</span>';
    }
}

// Helper function to check if user is admin
function isUserAdmin() {
    // Check via authManager using roleTemplate
    if (window.authManager?.isAdminTemplate) {
        return window.authManager.isAdminTemplate();
    }
    // Fallback: check localStorage directly
    try {
        const authData = JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}');
        return authData.roleTemplate === 'admin';
    } catch {
        return false;
    }
}

// Helper function to check admin permission
function checkAdminPermission(action = 'thực hiện thao tác này') {
    if (!isUserAdmin()) {
        const message = `⛔ Chỉ Admin mới có quyền ${action}`;
        if (window.notificationManager) {
            window.notificationManager.show(message, 'error');
        } else {
            alert(message);
        }
        return false;
    }
    return true;
}

// Add Account From Cookie
window.addAccountFromCookie = async function() {
    try {
        // Admin check
        if (!checkAdminPermission('thêm tài khoản Pancake')) return;

        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const token = window.pancakeTokenManager.getTokenFromCookie();
        if (!token) {
            throw new Error('Không tìm thấy JWT token trong cookie. Vui lòng đăng nhập vào pancake.vn trước.');
        }

        // Save to Firebase
        const accountId = await window.pancakeTokenManager.saveTokenToFirebase(token);

        if (!accountId) {
            throw new Error('Failed to save token');
        }

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã thêm tài khoản từ cookie!', 'success');
        } else {
            alert('✅ Đã thêm tài khoản từ cookie!');
        }

        // Refresh list and hide form
        await window.refreshAccountsList();
        window.hideAddAccountForm();

        // Re-initialize PancakeDataManager
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.initialize();
        }

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error adding account from cookie:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi: ' + error.message);
        }
    }
};

// Add Account Manual
window.addAccountManual = async function() {
    try {
        // Admin check
        if (!checkAdminPermission('thêm tài khoản Pancake')) return;

        const tokenInput = document.getElementById('newAccountTokenInput').value.trim();

        if (!tokenInput) {
            throw new Error('Vui lòng nhập JWT token hoặc bấm "Lấy từ Cookie"');
        }

        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const accountId = await window.pancakeTokenManager.setTokenManual(tokenInput);

        if (!accountId) {
            throw new Error('Failed to save token');
        }

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã thêm tài khoản!', 'success');
        } else {
            alert('✅ Đã thêm tài khoản!');
        }

        // Refresh list and hide form
        await window.refreshAccountsList();
        window.hideAddAccountForm();

        // Re-initialize PancakeDataManager
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.initialize();
        }

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error adding account manually:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi: ' + error.message);
        }
    }
};

// Select Account (cho phép tất cả user chọn account để dùng)
window.selectAccount = async function(accountId) {
    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const success = await window.pancakeTokenManager.setActiveAccount(accountId);

        if (!success) {
            throw new Error('Failed to set active account');
        }

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã chọn tài khoản!', 'success');
        } else {
            alert('✅ Đã chọn tài khoản!');
        }

        // Refresh list
        await window.refreshAccountsList();

        // Re-initialize PancakeDataManager
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.initialize();
        }

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error selecting account:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi: ' + error.message);
        }
    }
};

// Delete Account
window.deleteAccount = async function(accountId) {
    // Admin check
    if (!checkAdminPermission('xóa tài khoản Pancake')) return;

    if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) {
        return;
    }

    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const success = await window.pancakeTokenManager.deleteAccount(accountId);

        if (!success) {
            throw new Error('Failed to delete account');
        }

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã xóa tài khoản!', 'success');
        } else {
            alert('✅ Đã xóa tài khoản!');
        }

        // Refresh list
        await window.refreshAccountsList();

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error deleting account:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi: ' + error.message);
        }
    }
};

// Clear All Accounts
window.clearAllPancakeAccounts = async function() {
    // Admin check
    if (!checkAdminPermission('xóa tất cả tài khoản Pancake')) return;

    if (!confirm('Bạn có chắc muốn xóa TẤT CẢ tài khoản?')) {
        return;
    }

    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        await window.pancakeTokenManager.clearToken();

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã xóa tất cả tài khoản!', 'success');
        } else {
            alert('✅ Đã xóa tất cả tài khoản!');
        }

        // Refresh list
        await window.refreshAccountsList();

    } catch (error) {
        console.error('[PANCAKE-SETTINGS] Error clearing all accounts:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi: ' + error.message);
        }
    }
};

// ====== TAG FILTER ======
const TAG_FILTER_LIMIT = 12; // Show only 12 tags initially

/**
 * Load available tags from API
 */
window.loadAvailableTags = async function() {
    try {
        console.log('[TAG-FILTER] Loading available tags from API...');

        const response = await window.tokenManager.authenticatedFetch("https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag?$format=json&$count=true&$top=1000", {
            headers: {
                "accept": "application/json",
                "content-type": "application/json"
            },
            method: "GET"
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.value && Array.isArray(data.value)) {
            window.availableTags = data.value;
            console.log(`[TAG-FILTER] Loaded ${data.value.length} tags from API`);
            window.populateTagFilterOptions();
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error('[TAG-FILTER] Error loading tags:', error);
        window.availableTags = [];
    }
};

// ====== MULTI-SELECT TAG FILTER ======
// NOTE: Tag filter functions have been moved to tab1-tags.js for earlier loading
// The following functions are now defined in tab1-tags.js:
// - toggleTagFilterDropdown, closeTagFilterDropdown
// - populateTagFilterOptions, filterTagOptions
// - toggleTagFilterOption, selectAllTagFilters, clearTagFilters
// - getSelectedTagFilters, saveSelectedTagFilters
// - toggleExcludeTagFilterDropdown, closeExcludeTagFilterDropdown
// - populateExcludeTagFilterOptions, filterExcludeTagOptions
// - toggleExcludeTagFilterOption, clearExcludeTagFilters
// - getExcludedTagFilters, saveExcludedTagFilters
// - updateExcludedTagsMainDisplay, removeExcludedTagFromMain

// ====== TAG SETTINGS ======
const TAG_SETTINGS_KEY = 'tagSettingsCustomData';

/**
 * Get tag custom data from localStorage
 */
window.getTagSettings = function() {
    try {
        const saved = localStorage.getItem(TAG_SETTINGS_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (error) {
        console.error('[TAG-SETTINGS] Error loading tag settings:', error);
        return {};
    }
};

/**
 * Save tag custom data to localStorage
 */
window.setTagSettings = function(settings) {
    try {
        localStorage.setItem(TAG_SETTINGS_KEY, JSON.stringify(settings));
        console.log('[TAG-SETTINGS] Tag settings saved');
    } catch (error) {
        console.error('[TAG-SETTINGS] Error saving tag settings:', error);
    }
};

/**
 * Open tag settings modal
 */
window.openTagSettingsModal = async function() {
    const modal = document.getElementById('tagSettingsModal');
    modal.style.display = 'flex';

    // Load available tags if not loaded
    if (!window.availableTags || window.availableTags.length === 0) {
        await window.loadAvailableTags();
    }

    // Render tag settings list
    window.renderTagSettingsList();
};

/**
 * Close tag settings modal
 */
window.closeTagSettingsModal = function() {
    document.getElementById('tagSettingsModal').style.display = 'none';
    document.getElementById('tagSettingsSearchInput').value = '';
};

/**
 * Render tag settings list
 */
window.renderTagSettingsList = function(filteredTags = null) {
    const listContainer = document.getElementById('tagSettingsList');
    if (!listContainer) return;

    const tags = filteredTags || window.availableTags || [];
    const settings = window.getTagSettings();

    if (tags.length === 0) {
        listContainer.innerHTML = `
            <div class="no-tags-message">
                <i class="fas fa-info-circle"></i>
                <p>Không tìm thấy tag nào</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = tags.map(tag => {
        const customValue = settings[tag.Id] || '';
        const hasSavedValue = customValue !== '';
        return `
            <div class="tag-settings-item" data-tag-id="${tag.Id}">
                <div class="tag-settings-color" style="background-color: ${tag.Color || '#6b7280'}"></div>
                <div class="tag-settings-name">${tag.Name}</div>
                <input
                    type="text"
                    class="tag-settings-input"
                    id="tagInput_${tag.Id}"
                    data-tag-id="${tag.Id}"
                    value="${customValue}"
                    placeholder="Nhập ghi chú..."
                />
                <button
                    class="tag-settings-save-btn"
                    onclick="saveTagSettingItem('${tag.Id}')"
                    title="Lưu ghi chú">
                    <i class="fas fa-save"></i> Lưu
                </button>
                ${hasSavedValue ? `<div class="tag-settings-saved-badge" id="savedBadge_${tag.Id}"><i class="fas fa-check"></i></div>` : ''}
            </div>
        `;
    }).join('');
};

/**
 * Filter tag settings based on search input
 */
window.filterTagSettings = function() {
    const searchTerm = document.getElementById('tagSettingsSearchInput').value.toLowerCase().trim();

    if (!window.availableTags) return;

    if (!searchTerm) {
        window.renderTagSettingsList();
        return;
    }

    const filtered = window.availableTags.filter(tag =>
        tag.Name.toLowerCase().includes(searchTerm)
    );

    window.renderTagSettingsList(filtered);
};

/**
 * Save individual tag setting
 */
window.saveTagSettingItem = function(tagId) {
    const input = document.getElementById(`tagInput_${tagId}`);
    if (!input) return;

    const value = input.value.trim();
    const settings = window.getTagSettings();

    if (value) {
        settings[tagId] = value;
    } else {
        delete settings[tagId];
    }

    window.setTagSettings(settings);

    // Show saved badge
    let badge = document.getElementById(`savedBadge_${tagId}`);
    if (value && !badge) {
        const item = input.closest('.tag-settings-item');
        badge = document.createElement('div');
        badge.className = 'tag-settings-saved-badge';
        badge.id = `savedBadge_${tagId}`;
        badge.innerHTML = '<i class="fas fa-check"></i>';
        item.appendChild(badge);
    } else if (!value && badge) {
        badge.remove();
    }

    // Show notification
    if (window.notificationManager) {
        window.notificationManager.show('✅ Đã lưu!', 'success');
    }
};

/**
 * Save all tag settings (for footer Save button)
 */
window.saveTagSettings = function() {
    const inputs = document.querySelectorAll('.tag-settings-input');
    const settings = window.getTagSettings();

    inputs.forEach(input => {
        const tagId = input.dataset.tagId;
        const value = input.value.trim();

        if (value) {
            settings[tagId] = value;
        } else {
            delete settings[tagId];
        }
    });

    window.setTagSettings(settings);

    if (window.notificationManager) {
        window.notificationManager.show('✅ Đã lưu tất cả cài đặt tag!', 'success');
    } else {
        alert('✅ Đã lưu tất cả cài đặt tag!');
    }

    window.closeTagSettingsModal();
};

// ====== CHAT API SOURCE TOGGLE ======
/**
 * Toggle giữa Pancake API và ChatOmni API
 */
window.toggleChatAPISource = function() {
    if (!window.chatAPISettings) {
        console.error('[CHAT-API-TOGGLE] chatAPISettings not available');
        alert('❌ Lỗi: chatAPISettings không khả dụng');
        return;
    }

    // Toggle source
    const newSource = window.chatAPISettings.toggle();
    const displayName = window.chatAPISettings.getDisplayName(newSource);

    console.log(`[CHAT-API-TOGGLE] Switched to: ${displayName}`);

    // Update UI label
    window.updateChatAPISourceLabel();

    // Show notification
    if (window.notificationManager) {
        window.notificationManager.show(`✅ Đã chuyển sang ${displayName}`, 'success');
    } else {
        alert(`✅ Đã chuyển sang ${displayName}`);
    }

    // Reload table để hiển thị dữ liệu mới
    if (typeof performSearch === 'function') {
        console.log('[CHAT-API-TOGGLE] Reloading table...');
        performSearch();
    } else {
        console.warn('[CHAT-API-TOGGLE] performSearch function not found, please reload manually');
    }
};

/**
 * Update UI label cho button
 */
window.updateChatAPISourceLabel = function() {
    const label = document.getElementById('chatApiSourceLabel');
    if (!label || !window.chatAPISettings) return;

    const displayName = window.chatAPISettings.getDisplayName();
    label.textContent = displayName;
};

// ====== REALTIME TOGGLE ======
window.toggleRealtimeMode = function(enabled) {
    if (!window.chatAPISettings) {
        console.error('[REALTIME-TOGGLE] chatAPISettings not available');
        return;
    }

    window.chatAPISettings.setRealtimeEnabled(enabled);
    window.updateRealtimeCheckbox(); // Update UI visibility

    if (window.notificationManager) {
        const status = enabled ? 'BẬT' : 'TẮT';
        window.notificationManager.show(`✅ Realtime: ${status}`, 'success');
    }
};

window.changeRealtimeMode = function(mode) {
    if (!window.chatAPISettings) return;
    window.chatAPISettings.setRealtimeMode(mode);

    if (window.notificationManager) {
        const label = mode === 'browser' ? 'Browser (Trực tiếp)' : 'Server (24/7)';
        window.notificationManager.show(`✅ Chế độ Realtime: ${label}`, 'success');
    }
};

window.updateRealtimeCheckbox = function() {
    const checkbox = document.getElementById('realtimeToggleCheckbox');
    const modeContainer = document.getElementById('realtimeModeContainer');
    const modeSelect = document.getElementById('realtimeModeSelect');

    if (!checkbox || !window.chatAPISettings) return;

    const isEnabled = window.chatAPISettings.isRealtimeEnabled();
    checkbox.checked = isEnabled;

    // Show/Hide mode selector
    if (modeContainer) {
        modeContainer.style.display = isEnabled ? 'block' : 'none';
    }

    // Set current mode
    if (modeSelect) {
        modeSelect.value = window.chatAPISettings.getRealtimeMode();
    }
};

// Update label khi page load
document.addEventListener('DOMContentLoaded', function () {
    window.updateChatAPISourceLabel();
    window.updateRealtimeCheckbox();

    // Listen for API source changes from other sources
    window.addEventListener('chatApiSourceChanged', function (e) {
        console.log('[CHAT-API-TOGGLE] API source changed:', e.detail.source);
        window.updateChatAPISourceLabel();
        window.updateRealtimeCheckbox();
    });
});

// ====== PAGE ACCESS TOKEN MANAGEMENT ======

// Show Add Page Token Form
window.showAddPageTokenForm = async function() {
    // Admin check
    if (!checkAdminPermission('thêm Page Access Token')) return;

    document.getElementById('addPageTokenForm').style.display = 'block';
    document.getElementById('newPageAccessTokenInput').value = '';
    document.getElementById('pageTokenValidationMessage').style.display = 'none';

    // Load pages to selector
    await loadPagesToSelector();
};

// Hide Add Page Token Form
window.hideAddPageTokenForm = function() {
    document.getElementById('addPageTokenForm').style.display = 'none';
    document.getElementById('newPageAccessTokenInput').value = '';
    document.getElementById('pageTokenValidationMessage').style.display = 'none';
};

// Load pages to selector dropdown
async function loadPagesToSelector() {
    const selector = document.getElementById('pageTokenPageSelector');
    if (!selector) return;

    selector.innerHTML = '<option value="">-- Đang tải pages... --</option>';

    try {
        if (!window.pancakeDataManager) {
            throw new Error('PancakeDataManager not available');
        }

        // Fetch pages from Pancake
        const pages = await window.pancakeDataManager.fetchPages(true);

        if (!pages || pages.length === 0) {
            selector.innerHTML = '<option value="">-- Không có page nào --</option>';
            return;
        }

        let options = '<option value="">-- Chọn page --</option>';
        pages.forEach(page => {
            options += `<option value="${page.id}" data-name="${page.name}">${page.name} (${page.id})</option>`;
        });
        selector.innerHTML = options;

        console.log('[PAGE-TOKEN] Loaded', pages.length, 'pages to selector');
    } catch (error) {
        console.error('[PAGE-TOKEN] Error loading pages:', error);
        selector.innerHTML = '<option value="">-- Lỗi tải pages --</option>';
    }
}

// Generate page token from API
window.generatePageTokenFromAPI = async function() {
    try {
        // Admin check
        if (!checkAdminPermission('tạo Page Access Token')) return;

        const selector = document.getElementById('pageTokenPageSelector');
        const pageId = selector.value;

        if (!pageId) {
            throw new Error('Vui lòng chọn page trước');
        }

        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const pageName = selector.options[selector.selectedIndex].dataset.name || '';

        // Show loading
        const messageDiv = document.getElementById('pageTokenValidationMessage');
        messageDiv.innerHTML = '<span style="color: #3b82f6;"><i class="fas fa-spinner fa-spin"></i> Đang tạo token...</span>';
        messageDiv.style.display = 'block';

        // Generate token via API
        const newToken = await window.pancakeTokenManager.generatePageAccessToken(pageId);

        if (newToken) {
            // Show in textarea
            document.getElementById('newPageAccessTokenInput').value = newToken;
            messageDiv.innerHTML = '<span style="color: #10b981;">✅ Token đã được tạo và lưu tự động!</span>';

            // Refresh list
            await refreshPageTokensList();

            if (window.notificationManager) {
                window.notificationManager.show('✅ Đã tạo Page Access Token!', 'success');
            }
        } else {
            throw new Error('Không thể tạo token. Kiểm tra quyền admin của account.');
        }
    } catch (error) {
        console.error('[PAGE-TOKEN] Error generating token:', error);
        const messageDiv = document.getElementById('pageTokenValidationMessage');
        messageDiv.innerHTML = `<span style="color: #ef4444;">❌ Lỗi: ${error.message}</span>`;
        messageDiv.style.display = 'block';

        if (window.notificationManager) {
            window.notificationManager.show('❌ ' + error.message, 'error');
        }
    }
};

// Add page access token manually
window.addPageAccessTokenManual = async function() {
    try {
        // Admin check
        if (!checkAdminPermission('thêm Page Access Token')) return;

        const selector = document.getElementById('pageTokenPageSelector');
        const pageId = selector.value;
        const token = document.getElementById('newPageAccessTokenInput').value.trim();

        if (!pageId) {
            throw new Error('Vui lòng chọn page');
        }

        if (!token) {
            throw new Error('Vui lòng nhập Page Access Token');
        }

        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const pageName = selector.options[selector.selectedIndex].dataset.name || '';

        // Save token
        const success = await window.pancakeTokenManager.savePageAccessToken(pageId, token, pageName);

        if (success) {
            const messageDiv = document.getElementById('pageTokenValidationMessage');
            messageDiv.innerHTML = '<span style="color: #10b981;">✅ Token đã được lưu!</span>';
            messageDiv.style.display = 'block';

            // Refresh list and hide form
            await refreshPageTokensList();
            setTimeout(() => window.hideAddPageTokenForm(), 1500);

            if (window.notificationManager) {
                window.notificationManager.show('✅ Đã lưu Page Access Token!', 'success');
            }
        } else {
            throw new Error('Không thể lưu token');
        }
    } catch (error) {
        console.error('[PAGE-TOKEN] Error saving token:', error);
        const messageDiv = document.getElementById('pageTokenValidationMessage');
        messageDiv.innerHTML = `<span style="color: #ef4444;">❌ Lỗi: ${error.message}</span>`;
        messageDiv.style.display = 'block';

        if (window.notificationManager) {
            window.notificationManager.show('❌ ' + error.message, 'error');
        }
    }
};

// Refresh page tokens list
window.refreshPageTokensList = async function() {
    const listDiv = document.getElementById('pageAccessTokensList');
    if (!listDiv) return;

    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        const tokens = window.pancakeTokenManager.getAllPageAccessTokens();
        const isAdmin = isUserAdmin();

        if (!tokens || tokens.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align: center; color: #9ca3af; padding: 20px;">
                    <i class="fas fa-key" style="font-size: 24px; margin-bottom: 8px;"></i>
                    <div>Chưa có page token nào</div>
                    <div style="font-size: 11px; margin-top: 4px;">Page token giúp gửi tin nhắn không bị giới hạn rate limit</div>
                </div>
            `;
            return;
        }

        let html = '';
        tokens.forEach(item => {
            const savedDate = item.savedAt ? new Date(item.savedAt).toLocaleDateString('vi-VN') : 'N/A';
            const tokenPreview = item.token ? (item.token.substring(0, 20) + '...') : 'N/A';

            html += `
                <div style="padding: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px;">
                                <i class="fas fa-file-alt" style="color: #8b5cf6;"></i>
                                ${item.pageName || 'Page ' + item.pageId}
                            </div>
                            <div style="font-size: 11px; color: #6b7280; font-family: monospace;">
                                ID: ${item.pageId}
                            </div>
                            <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">
                                Token: ${tokenPreview} | Lưu: ${savedDate}
                            </div>
                        </div>
                        ${isAdmin ? `
                            <button onclick="deletePageAccessToken('${item.pageId}')"
                                style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        listDiv.innerHTML = html;
        console.log('[PAGE-TOKEN] Displayed', tokens.length, 'page tokens');
    } catch (error) {
        console.error('[PAGE-TOKEN] Error refreshing page tokens list:', error);
        listDiv.innerHTML = `
            <div style="text-align: center; color: #ef4444; padding: 20px;">
                <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 8px;"></i>
                <div>Lỗi: ${error.message}</div>
            </div>
        `;
    }
};

// Delete page access token
window.deletePageAccessToken = async function(pageId) {
    // Admin check
    if (!checkAdminPermission('xóa Page Access Token')) return;

    if (!confirm('Bạn có chắc muốn xóa Page Access Token này?')) {
        return;
    }

    try {
        if (!window.pancakeTokenManager) {
            throw new Error('PancakeTokenManager not available');
        }

        // Remove from pageAccessTokens
        delete window.pancakeTokenManager.pageAccessTokens[pageId];

        // Save to storage
        await window.pancakeTokenManager.savePageAccessTokensToStorage();

        // Sync to Firebase - delete the field for this pageId
        if (window.pancakeTokenManager.pageTokensRef) {
            const firebase = window.firebase;
            await window.pancakeTokenManager.pageTokensRef.update({
                [pageId]: firebase.firestore.FieldValue.delete()
            });
        }

        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã xóa Page Access Token!', 'success');
        }

        // Refresh list
        await refreshPageTokensList();
    } catch (error) {
        console.error('[PAGE-TOKEN] Error deleting token:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi: ' + error.message, 'error');
        }
    }
};

// Update openPancakeSettingsModal to also refresh page tokens list
const originalOpenPancakeSettingsModal = window.openPancakeSettingsModal;
window.openPancakeSettingsModal = async function() {
    await originalOpenPancakeSettingsModal();
    await window.refreshPageTokensList();
};

console.log('[TAB1-PANCAKE-SETTINGS] Module loaded');
