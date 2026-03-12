/**
 * Tab Social Orders - Modal Module
 * Create/Edit order modal functionality
 */

// ===== MODAL STATE =====
let isEditMode = false;
let _currentTposPartnerId = null; // TPOS Partner Id from phone lookup or customer creation

// ===== OPEN MODAL =====
function openCreateOrderModal() {
    isEditMode = false;
    _currentTposPartnerId = null;

    // Reset form
    document.getElementById('orderForm')?.reset();
    document.getElementById('orderId').value = '';
    document.getElementById('orderProducts').value = '[]';
    document.getElementById('selectedPostId').value = '';
    document.getElementById('selectedPostThumbnail').value = '';

    // Hide post preview
    const preview = document.getElementById('selectedPostPreview');
    if (preview) {
        preview.style.display = 'none';
    }

    // Set default source to Facebook Post
    const orderSourceSelect = document.getElementById('orderSource');
    if (orderSourceSelect) {
        orderSourceSelect.value = 'facebook_post';
    }

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo đơn hàng mới';
    }

    // Init product section with empty list
    _initSocialProductSection([]);

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function openEditOrderModal(orderId) {
    isEditMode = true;

    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    _currentTposPartnerId = order.tposPartnerId || null;
    SocialOrderState.currentEditingOrder = order;
    const mappedProducts = (order.products || []).map(_mapLegacyProduct);

    // Fill form
    document.getElementById('orderId').value = order.id;
    document.getElementById('customerName').value = order.customerName || '';
    document.getElementById('customerPhone').value = order.phone || '';
    document.getElementById('customerAddress').value = order.address || '';
    document.getElementById('postUrl').value = order.postUrl || '';
    document.getElementById('orderSource').value = order.source || 'manual';
    document.getElementById('orderNote').value = order.note || '';
    document.getElementById('orderProducts').value = JSON.stringify(order.products || []);

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = `<i class="fas fa-edit"></i> Sửa đơn hàng ${order.id}`;
    }

    // Init product section with existing products
    _initSocialProductSection(mappedProducts);

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.remove('show');
    }

    // Cleanup purchaseOrderFormModal reference
    if (window.purchaseOrderFormModal) {
        window.purchaseOrderFormModal.modalElement = null;
    }

    SocialOrderState.currentEditingOrder = null;
}

// ===== PRODUCT SECTION HELPERS (Borrowed State Pattern) =====
function _mapLegacyProduct(p) {
    const mapped = {
        id: p.id || p.productId || `item_${Date.now()}_${Math.random()}`,
        productName: p.productName || p.name || '',
        variant: p.variant || '',
        productCode: p.productCode || p.code || '',
        quantity: p.quantity || 1,
        purchasePrice: p.purchasePrice || 0,
        sellingPrice: p.sellingPrice || p.price || 0,
        productImages: p.productImages || [],
        priceImages: p.priceImages || [],
        selectedAttributeValueIds: p.selectedAttributeValueIds || []
    };
    if (p.tposProductId) mapped.tposProductId = p.tposProductId;
    if (p.tposProductTmplId) mapped.tposProductTmplId = p.tposProductTmplId;
    return mapped;
}

function _initSocialProductSection(existingProducts = []) {
    if (!window.purchaseOrderFormModal) {
        console.warn('[SocialModal] purchaseOrderFormModal not available');
        return;
    }

    // 1. Reset state
    window.purchaseOrderFormModal.formData.items = [];
    window.purchaseOrderFormModal.itemCounter = 0;
    window.purchaseOrderFormModal.pendingImages = { invoice: [], products: {}, prices: {} };

    // 2. Trỏ modalElement vào container của modal social
    window.purchaseOrderFormModal.modalElement = document.getElementById('orderModalOverlay');

    // 3. Load items
    if (existingProducts.length > 0) {
        window.purchaseOrderFormModal.formData.items = existingProducts.map((p, i) => {
            const item = {
                id: p.id || `item_${Date.now()}_${i}`,
                productName: p.productName || '',
                variant: p.variant || '',
                productCode: p.productCode || '',
                quantity: p.quantity || 1,
                purchasePrice: p.purchasePrice || 0,
                sellingPrice: p.sellingPrice || 0,
                productImages: p.productImages || [],
                priceImages: p.priceImages || [],
                selectedAttributeValueIds: p.selectedAttributeValueIds || [],
                _isExistingItem: true
            };
            if (p.tposProductId) item.tposProductId = p.tposProductId;
            if (p.tposProductTmplId) item.tposProductTmplId = p.tposProductTmplId;
            return item;
        });
        window.purchaseOrderFormModal.itemCounter = existingProducts.length;
    } else {
        window.purchaseOrderFormModal.addItem();
    }

    // 4. Render + bind
    window.purchaseOrderFormModal.refreshItemsTable();
}

function _collectSocialProducts() {
    if (!window.purchaseOrderFormModal) return [];
    window.purchaseOrderFormModal.collectFormData();
    return window.purchaseOrderFormModal.formData.items.map(item => {
        const mapped = {
            id: item.id,
            productName: item.productName || '',
            variant: item.variant || '',
            productCode: item.productCode || '',
            quantity: parseInt(item.quantity) || 1,
            purchasePrice: window.purchaseOrderFormModal?.parsePrice(item.purchasePrice) || parseFloat(String(item.purchasePrice).replace(/[,.]/g, '')) || 0,
            sellingPrice: window.purchaseOrderFormModal?.parsePrice(item.sellingPrice) || parseFloat(String(item.sellingPrice).replace(/[,.]/g, '')) || 0,
            productImages: item.productImages || [],
            priceImages: item.priceImages || [],
            selectedAttributeValueIds: item.selectedAttributeValueIds || []
        };
        if (item.tposProductId) mapped.tposProductId = item.tposProductId;
        if (item.tposProductTmplId) mapped.tposProductTmplId = item.tposProductTmplId;
        return mapped;
    });
}

// ===== SAVE ORDER =====
function saveOrder() {
    const customerName = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    const postUrl = document.getElementById('postUrl').value.trim();
    const source = document.getElementById('orderSource').value;
    const note = document.getElementById('orderNote').value.trim();
    const orderId = document.getElementById('orderId').value;

    // Validation
    if (!customerName) {
        showNotification('Vui lòng nhập tên khách hàng', 'error');
        document.getElementById('customerName').focus();
        return;
    }

    if (!phone) {
        showNotification('Vui lòng nhập số điện thoại', 'error');
        document.getElementById('customerPhone').focus();
        return;
    }

    // Calculate totals using borrowed state
    const products = _collectSocialProducts();
    const totals = window.purchaseOrderFormModal
        ? window.purchaseOrderFormModal.calculateTotals()
        : { totalQuantity: 0, totalAmount: 0 };
    const totalQuantity = totals.totalQuantity;
    const totalAmount = totals.totalAmount;

    // Generate post label from URL
    let postLabel = '';
    if (postUrl) {
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const sourceLabel =
            source === 'facebook_post'
                ? 'FB'
                : source === 'instagram'
                  ? 'IG'
                  : source === 'tiktok'
                    ? 'TT'
                    : 'Post';
        postLabel = `${sourceLabel} ${dateStr}`;
    }

    if (isEditMode && orderId) {
        // Update existing order
        const orderIndex = SocialOrderState.orders.findIndex((o) => o.id === orderId);
        if (orderIndex > -1) {
            const existingOrder = SocialOrderState.orders[orderIndex];
            SocialOrderState.orders[orderIndex] = {
                ...existingOrder,
                customerName,
                phone,
                address,
                postUrl,
                postLabel,
                source,
                products: products,
                totalQuantity,
                totalAmount,
                note,
                tposPartnerId: _currentTposPartnerId || existingOrder.tposPartnerId || null,
                updatedAt: Date.now(),
            };
            saveSocialOrdersToStorage();
            // Fire-and-forget: sync to Firestore
            updateSocialOrder(orderId, SocialOrderState.orders[orderIndex]);
            showNotification('Đã cập nhật đơn hàng', 'success');

            // Fire-and-forget: sync updated products to TPOS
            if (window.TPOSProductCreator && products.length > 0) {
                window.TPOSProductCreator.syncOrderToTPOS(orderId, products, '');
            }
        }
    } else {
        // Create new order
        const newOrder = {
            id: generateOrderId(),
            stt: SocialOrderState.orders.length + 1,
            customerName,
            phone,
            address,
            postUrl,
            postLabel,
            source,
            products: products,
            totalQuantity,
            totalAmount,
            tags: [],
            status: 'draft',
            note,
            tposPartnerId: _currentTposPartnerId || null,
            pageId: '',
            psid: '',
            conversationId: '',
            assignedUserId: '',
            assignedUserName: '',
            createdBy: 'admin',
            createdByName: 'Admin',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        SocialOrderState.orders.unshift(newOrder);
        saveSocialOrdersToStorage();
        // Fire-and-forget: sync to Firestore
        createSocialOrder(newOrder);
        showNotification('Đã tạo đơn hàng mới', 'success');

        // Fire-and-forget: sync products to TPOS
        if (window.TPOSProductCreator && products.length > 0) {
            window.TPOSProductCreator.syncOrderToTPOS(newOrder.id, products, '');
        }
    }

    // Close modal and refresh
    closeOrderModal();
    performTableSearch();
}

// ===== CLOSE MODAL ON OUTSIDE CLICK =====
document.addEventListener('click', function (e) {
    const modalOverlay = document.getElementById('orderModalOverlay');
    if (e.target === modalOverlay) {
        closeOrderModal();
    }
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function (e) {
    // ESC to close modal
    if (e.key === 'Escape') {
        closeOrderModal();
        closeTagModal();
        closeConfirmDeleteModal();
    }
});

// ===== FACEBOOK POST SELECTION =====
let cachedPosts = [];
let filteredPosts = [];
const BASE_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const PAGE_ID = '270136663390370'; // NhiJudy Store

async function openPostSelectionModal() {
    const modal = document.getElementById('postSelectionModal');
    if (modal) {
        modal.classList.add('show');
    }

    // Show loading
    document.getElementById('postLoading').style.display = 'flex';
    document.getElementById('postList').innerHTML = '';

    // Load posts if not cached
    if (cachedPosts.length === 0) {
        await fetchFacebookPosts();
    } else {
        renderPostList(cachedPosts);
    }
}

function closePostSelectionModal() {
    const modal = document.getElementById('postSelectionModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function fetchFacebookPosts() {
    try {
        // Get JWT token from "Kỹ Thuật NJD" account specifically
        let jwtToken = null;
        if (window.pancakeTokenManager) {
            // Get all accounts and find "Kỹ Thuật NJD"
            const accounts = window.pancakeTokenManager.getAllAccounts();
            for (const [accountId, account] of Object.entries(accounts)) {
                if (account.name === 'Kỹ Thuật NJD') {
                    jwtToken = account.token;
                    console.log('[SOCIAL-POST] Using token from account:', account.name);
                    break;
                }
            }

            // Fallback to active account if "Kỹ Thuật NJD" not found
            if (!jwtToken) {
                console.log('[SOCIAL-POST] Account "Kỹ Thuật NJD" not found, using active account');
                jwtToken = await window.pancakeTokenManager.getToken();
            }
        }

        if (!jwtToken) {
            document.getElementById('postLoading').style.display = 'none';
            document.getElementById('postList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
                    <p>Chưa đăng nhập Pancake. Vui lòng cài đặt JWT token trong tab Quản Lý Đơn Hàng.</p>
                </div>
            `;
            return;
        }

        // Fetch posts via Cloudflare worker
        // Note: access_token must be passed in URL for Pancake API, jwt is for cloudflare worker headers
        const url = `${BASE_URL}/api/pancake-direct/pages/posts?types=&current_count=0&page_id=${PAGE_ID}&jwt=${encodeURIComponent(jwtToken)}&page_ids=${PAGE_ID}&access_token=${encodeURIComponent(jwtToken)}`;

        console.log('[SOCIAL-POST] Fetching posts from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success && result.data) {
            cachedPosts = result.data;
            filteredPosts = cachedPosts;
            renderPostList(cachedPosts);
            console.log('[SOCIAL-POST] Loaded', cachedPosts.length, 'posts');
        } else {
            throw new Error(result.message || 'Failed to load posts');
        }

    } catch (error) {
        console.error('[SOCIAL-POST] Error fetching posts:', error);
        document.getElementById('postLoading').style.display = 'none';
        document.getElementById('postList').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
                <p>Không thể tải danh sách bài viết. Vui lòng thử lại.</p>
                <p style="font-size: 11px; color: #6b7280; margin-top: 8px;">${error.message}</p>
            </div>
        `;
    }
}

function renderPostList(posts) {
    document.getElementById('postLoading').style.display = 'none';

    if (!posts || posts.length === 0) {
        document.getElementById('postList').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #6b7280;">
                <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 12px;"></i>
                <p>Không có bài viết nào.</p>
            </div>
        `;
        return;
    }

    const html = posts.map(post => {
        // Get thumbnail
        const thumbnail = post.attachments?.data?.[0]?.url || null;
        const hasMultipleImages = (post.attachments?.data?.length || 0) > 1;

        // Get message/title
        let title = post.message || 'Không có tiêu đề';
        if (title.length > 80) {
            title = title.substring(0, 80) + '...';
        }

        // Format date
        const date = new Date(post.inserted_at);
        const dateStr = date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get post type icon
        let typeIcon = '';
        let typeLabel = '';
        switch (post.type) {
            case 'livestream':
                typeIcon = '<i class="fas fa-video"></i>';
                typeLabel = 'Live';
                break;
            case 'video':
                typeIcon = '<i class="fas fa-play"></i>';
                typeLabel = 'Video';
                break;
            case 'photo':
                typeIcon = '<i class="fas fa-image"></i>';
                typeLabel = 'Ảnh';
                break;
            default:
                typeIcon = '<i class="fas fa-file-alt"></i>';
                typeLabel = 'Text';
        }

        // Get post URL
        const postUrl = post.attachments?.target?.url || `https://www.facebook.com/${post.id}`;

        // Build thumbnail proxy URL
        const thumbnailProxyUrl = thumbnail ? `${BASE_URL}/api/image-proxy?url=${encodeURIComponent(thumbnail)}` : '';

        return `
            <div class="post-item" onclick="selectPost('${post.id}', '${postUrl.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}', '${thumbnailProxyUrl.replace(/'/g, "\\'")}')">
                <div class="post-thumbnail">
                    ${thumbnail
                        ? `<img src="${thumbnailProxyUrl}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='<i class=\\'fas fa-image no-image\\'></i>';">`
                        : '<i class="fas fa-image no-image"></i>'
                    }
                    ${hasMultipleImages ? `<span class="post-type-icon">+${post.attachments.data.length - 1}</span>` : ''}
                    ${post.type === 'livestream' || post.type === 'video' ? `<span class="post-type-icon">${typeIcon}</span>` : ''}
                </div>
                <div class="post-info">
                    <div class="post-title">${title}</div>
                    <div class="post-date">${dateStr} ${timeStr}</div>
                    <div class="post-meta">
                        ${post.phone_number_count > 0 ? `<span class="post-meta-item"><i class="fas fa-phone"></i> ${post.phone_number_count}</span>` : ''}
                        ${post.comment_count > 0 ? `<span class="post-meta-item"><i class="fas fa-comment"></i> ${formatNumber(post.comment_count)}</span>` : ''}
                        ${post.share_count > 0 ? `<span class="post-meta-item"><i class="fas fa-share"></i> ${post.share_count}</span>` : ''}
                    </div>
                </div>
                <div class="post-stats">
                    <button class="post-copy-btn" onclick="event.stopPropagation(); copyPostId('${post.id}')" title="Sao chép ID">
                        <i class="far fa-copy"></i> Sao chép ID
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('postList').innerHTML = html;
}

function filterPosts() {
    const input = document.getElementById('postFilterInput');
    const term = input.value.toLowerCase().trim();

    if (!term) {
        filteredPosts = cachedPosts;
    } else {
        filteredPosts = cachedPosts.filter(post => {
            const message = (post.message || '').toLowerCase();
            return message.includes(term);
        });
    }

    renderPostList(filteredPosts);
}

function selectPost(postId, postUrl, postTitle, thumbnailUrl) {
    // Update the form fields
    document.getElementById('postUrl').value = postUrl;
    document.getElementById('selectedPostId').value = postId;
    document.getElementById('selectedPostThumbnail').value = thumbnailUrl || '';

    // Show preview
    const preview = document.getElementById('selectedPostPreview');
    const thumbImg = document.getElementById('selectedPostThumb');
    const titleEl = document.getElementById('selectedPostTitle');

    if (preview && thumbImg && titleEl) {
        if (thumbnailUrl) {
            thumbImg.src = thumbnailUrl;
            thumbImg.style.display = 'block';
        } else {
            thumbImg.style.display = 'none';
        }
        titleEl.textContent = postTitle || 'Bài viết đã chọn';
        preview.style.display = 'flex';
    }

    // Close modal
    closePostSelectionModal();

    // Show notification
    if (typeof showNotification === 'function') {
        showNotification('Đã chọn bài viết', 'success');
    }
}

function clearSelectedPost(event) {
    if (event) {
        event.stopPropagation();
    }

    // Clear form fields
    document.getElementById('postUrl').value = '';
    document.getElementById('selectedPostId').value = '';
    document.getElementById('selectedPostThumbnail').value = '';

    // Hide preview
    const preview = document.getElementById('selectedPostPreview');
    if (preview) {
        preview.style.display = 'none';
    }
}

function copyPostId(postId) {
    navigator.clipboard.writeText(postId).then(() => {
        if (typeof showNotification === 'function') {
            showNotification('Đã sao chép ID: ' + postId, 'success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// ===== UTILITY =====
function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ===== TPOS CUSTOMER AUTO-FILL BY PHONE =====
let _tposPhoneLookupTimeout = null;

function initPhoneAutoLookup() {
    const phoneInput = document.getElementById('customerPhone');
    if (!phoneInput) return;

    phoneInput.addEventListener('input', function () {
        const phone = this.value.replace(/\D/g, '');

        if (_tposPhoneLookupTimeout) {
            clearTimeout(_tposPhoneLookupTimeout);
        }

        if (phone.length !== 10) {
            const statusEl = document.getElementById('tposCustomerStatus');
            if (statusEl) statusEl.style.display = 'none';
            return;
        }

        _tposPhoneLookupTimeout = setTimeout(async () => {
            if (!window.fetchTPOSCustomer) return;

            try {
                console.log('[SOCIAL-MODAL] Looking up TPOS customer for phone:', phone);
                const result = await fetchTPOSCustomer(phone);

                if (result.success && result.count > 0) {
                    const customer = result.customers[0];
                    const nameInput = document.getElementById('customerName');
                    const addressInput = document.getElementById('customerAddress');
                    const statusEl = document.getElementById('tposCustomerStatus');

                    // Save TPOS Partner Id for later use in sale order creation
                    _currentTposPartnerId = customer.id || null;
                    console.log('[SOCIAL-MODAL] Saved TPOS Partner Id:', _currentTposPartnerId);

                    if (nameInput && customer.name) {
                        nameInput.value = customer.name;
                    }
                    if (addressInput && customer.address) {
                        addressInput.value = customer.address;
                    }

                    // Show customer status badge
                    if (statusEl && customer.statusText) {
                        const statusColors = {
                            'Bình thường': '#22c55e',
                            'Bom hàng': '#ef4444',
                            'Cảnh báo': '#f59e0b',
                            'Nguy hiểm': '#dc2626',
                            'VIP': '#6366f1'
                        };
                        const color = statusColors[customer.statusText] || '#6b7280';
                        statusEl.innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600;color:#fff;background:${color}">Trạng thái TPOS: ${customer.statusText}</span>`;
                        statusEl.style.display = 'block';
                    } else if (statusEl) {
                        statusEl.style.display = 'none';
                    }

                    console.log('[SOCIAL-MODAL] Auto-filled customer:', customer.name, '| Status:', customer.statusText);
                    if (typeof showNotification === 'function') {
                        showNotification(`Tìm thấy KH: ${customer.name}`, 'success');
                    }
                } else {
                    // No customer found - clear partner Id
                    _currentTposPartnerId = null;
                    const statusEl = document.getElementById('tposCustomerStatus');
                    if (statusEl) statusEl.style.display = 'none';
                }
            } catch (error) {
                console.error('[SOCIAL-MODAL] TPOS lookup error:', error);
            }
        }, 500);
    });
}

// Init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPhoneAutoLookup);
} else {
    initPhoneAutoLookup();
}

// ===== RETAIL SALE FROM SOCIAL ORDER =====
/**
 * Mở phiếu bán hàng lẻ từ đơn Social
 * Mở modal sale ngay trong Social tab (không jump sang Tab1)
 * Dùng chung hàm confirmAndPrintSale từ tab1-sale.js
 */
function openRetailSaleFromSocial(orderId) {
    const order = SocialOrderState.orders.find(o => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    // Open sale modal directly within Social tab
    if (typeof openSaleModalInSocialTab === 'function') {
        openSaleModalInSocialTab(orderId);
    } else {
        showNotification('Chức năng tạo phiếu bán hàng chưa sẵn sàng', 'error');
    }
}

// ===== CREATE CUSTOMER (shared) =====
function openCreateCustomerModal() {
    if (!window.CustomerCreator) {
        showNotification('Chưa tải module tạo khách hàng', 'error');
        return;
    }
    window.CustomerCreator.open({
        onSuccess: (customer) => {
            // Auto-fill customer info into the order form
            const nameInput = document.getElementById('customerName');
            const phoneInput = document.getElementById('customerPhone');
            const addressInput = document.getElementById('customerAddress');
            if (nameInput) nameInput.value = customer.name || '';
            if (phoneInput) phoneInput.value = customer.phone || '';
            if (addressInput) addressInput.value = customer.address || '';

            // Save TPOS Partner Id from newly created customer
            _currentTposPartnerId = customer.id || null;
            console.log('[SOCIAL-MODAL] Created customer, TPOS Partner Id:', _currentTposPartnerId);
        }
    });
}

// ===== EXPORTS =====
window.openCreateOrderModal = openCreateOrderModal;
window.openEditOrderModal = openEditOrderModal;
window.closeOrderModal = closeOrderModal;
window.saveOrder = saveOrder;
window.openPostSelectionModal = openPostSelectionModal;
window.closePostSelectionModal = closePostSelectionModal;
window.filterPosts = filterPosts;
window.selectPost = selectPost;
window.clearSelectedPost = clearSelectedPost;
window.copyPostId = copyPostId;
window.openRetailSaleFromSocial = openRetailSaleFromSocial;
window.openCreateCustomerModal = openCreateCustomerModal;
