/**
 * Live Comments Readonly Modal
 * Hiển thị tất cả bình luận của khách hàng từ các bài post/video live trên Facebook
 */

(function () {
    'use strict';

    const API_BASE = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const CACHE_KEY = 'pageCompanyIdMapping';

    /**
     * Format datetime: "15/12/2025 19:36"
     */
    function formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Fetch mapping pageId → companyId từ TPOS API và cache vào localStorage
     */
    async function fetchAndCachePageCompanyIds() {
        try {
            const url = 'https://tomato.tpos.vn/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs';

            const headers = await window.tokenManager.getAuthHeader();
            const response = await fetch(url, {
                headers: {
                    ...headers,
                    'Accept': 'application/json',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const mapping = {};

            // Build mapping: Facebook_PageId → Id (companyId)
            (data.value || []).forEach(user => {
                (user.Childs || []).forEach(page => {
                    if (page.Facebook_PageId && page.Id) {
                        mapping[page.Facebook_PageId] = page.Id;
                    }
                });
            });

            // Cache to localStorage
            localStorage.setItem(CACHE_KEY, JSON.stringify(mapping));
            console.log('[LiveComments] Cached page-company mapping:', mapping);
            return mapping;

        } catch (error) {
            console.error('[LiveComments] Error fetching page company IDs:', error);
            throw error;
        }
    }

    /**
     * Lấy companyId từ cache hoặc fetch nếu chưa có
     */
    async function getCompanyIdByPageId(pageId) {
        // Thử lấy từ cache trước
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const mapping = JSON.parse(cached);
                if (mapping[pageId]) {
                    return mapping[pageId];
                }
            } catch (e) {
                console.warn('[LiveComments] Failed to parse cached mapping:', e);
            }
        }

        // Nếu không có trong cache, fetch lại
        console.log('[LiveComments] Cache miss, fetching page company IDs...');
        const mapping = await fetchAndCachePageCompanyIds();

        if (!mapping[pageId]) {
            throw new Error(`Cannot find companyId for pageId: ${pageId}`);
        }

        return mapping[pageId];
    }

    /**
     * Hiện toast notification
     */
    function showToast(message, type = 'info') {
        const existingToast = document.querySelector('.live-comments-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'live-comments-toast';

        const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6b7280';
        const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle';

        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100002;
            animation: liveToastSlideUp 0.3s ease;
        `;

        if (!document.getElementById('live-comments-toast-style')) {
            const style = document.createElement('style');
            style.id = 'live-comments-toast-style';
            style.textContent = `
                @keyframes liveToastSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Fetch live comments từ TPOS API
     */
    async function fetchLiveCommentsByUser(pageId, postId, userId) {
        // Lấy companyId từ cache hoặc fetch từ API
        const companyId = await getCompanyIdByPageId(pageId);

        const objectId = `${companyId}_${pageId}_${postId}`;
        const url = `${API_BASE}/api/rest/v2.0/facebookpost/${objectId}/commentsbyuser?userId=${userId}`;

        const headers = await window.tokenManager.getAuthHeader();
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                ...headers,
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            items: data.Items || [],
            objectIds: data.ObjectIds || [],
            liveCampaignId: data.LiveCampaignId
        };
    }

    /**
     * Tìm các đơn hàng có cùng số điện thoại trong allData
     * @param {Object} currentOrder - Đơn hàng hiện tại
     * @returns {Array} - Danh sách đơn hàng có cùng SĐT (đơn hiện tại đầu tiên, còn lại theo thời gian)
     */
    function findRelatedOrdersByPhone(currentOrder) {
        const phone = currentOrder.Telephone;
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];

        if (!phone || allOrders.length === 0) return [{ order: currentOrder, indexInAllData: -1 }];

        // Lọc các đơn có cùng SĐT (không cần check Facebook fields vì sẽ fetch sau)
        const relatedOrders = [];
        allOrders.forEach((order, index) => {
            if (order.Telephone === phone) {
                relatedOrders.push({ order, indexInAllData: index });
            }
        });

        if (relatedOrders.length === 0) return [{ order: currentOrder, indexInAllData: -1 }];

        // Sắp xếp: đơn hiện tại đầu tiên, còn lại theo thời gian (mới nhất trước)
        relatedOrders.sort((a, b) => {
            // Đơn hiện tại luôn đầu tiên
            if (a.order.Id === currentOrder.Id) return -1;
            if (b.order.Id === currentOrder.Id) return 1;
            // Còn lại sort theo DateCreated (mới nhất trước)
            const dateA = new Date(a.order.DateCreated || 0);
            const dateB = new Date(b.order.DateCreated || 0);
            return dateB - dateA;
        });

        return relatedOrders;
    }

    /**
     * Fetch full order data từ API
     */
    async function fetchFullOrderData(orderId) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const url = `${API_BASE}/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
            const response = await fetch(url, {
                headers: {
                    ...headers,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.warn('[LiveComments] Error fetching order', orderId, ':', err.message);
            return null;
        }
    }

    /**
     * Gộp và sort comments theo timeline
     */
    function mergeAndSortComments(comments) {
        return comments.sort((a, b) => {
            const timeA = new Date(a.ChannelCreatedTime || a.CreatedTime || 0);
            const timeB = new Date(b.ChannelCreatedTime || b.CreatedTime || 0);
            return timeA - timeB;
        });
    }

    /**
     * Tạo HTML cho modal với dữ liệu từ nhiều đơn hàng liên quan
     * @param {Array} ordersWithComments - Mảng {order, comments, indexInAllData} đã có dữ liệu
     * @param {string} phone - Số điện thoại chung
     */
    function createRelatedOrdersModalHTML(ordersWithComments, phone) {
        // Lọc chỉ các đơn có comments
        const ordersWithData = ordersWithComments.filter(item => item.comments.length > 0);
        const totalComments = ordersWithData.reduce((sum, item) => sum + item.comments.length, 0);
        const totalOrders = ordersWithData.length;

        let contentHTML = '';

        if (totalComments === 0) {
            contentHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                    <i class="fas fa-comment-slash" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không tìm thấy bình luận nào</p>
                </div>
            `;
        } else {
            ordersWithData.forEach((item) => {
                const order = item.order;
                const comments = mergeAndSortComments(item.comments);
                const customerName = order.Partner?.Name || order.Facebook_UserName || order.Name || 'Khách hàng';
                const pageName = order.CRMTeam?.Name || 'Page';
                // STT là vị trí trong allData (1-based)
                const stt = item.indexInAllData >= 0 ? item.indexInAllData + 1 : '?';

                // Header section cho mỗi đơn hàng
                contentHTML += `
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; margin-bottom: 12px;">
                            <span style="background: white; color: #667eea; font-weight: 700; font-size: 14px; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 14px; display: flex; align-items: center; justify-content: center;">${stt}</span>
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: 600; color: white;">${escapeHtml(customerName)}</div>
                                <div style="font-size: 12px; color: rgba(255,255,255,0.85);">Page: ${escapeHtml(pageName)}</div>
                            </div>
                            <span style="font-size: 12px; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px;">${comments.length} bình luận</span>
                        </div>
                        <div style="padding-left: 14px; border-left: 3px solid #e2e8f0;">
                `;

                // Render comments theo timeline (đã được sort)
                comments.forEach(comment => {
                    const message = comment.Message || comment.Data?.message || '';
                    const time = formatDateTime(comment.ChannelCreatedTime || comment.CreatedTime);
                    const isOwner = comment.IsOwner;

                    contentHTML += `
                        <div style="padding: 10px 12px; margin-bottom: 6px; background: ${isOwner ? '#f0fdf4' : '#ffffff'}; border-radius: 8px; border: 1px solid ${isOwner ? '#bbf7d0' : '#e5e7eb'};">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                <div style="flex: 1; font-size: 14px; color: #1f2937; line-height: 1.5; word-break: break-word;">
                                    ${isOwner ? '<span style="color: #16a34a; font-weight: 500;">[Shop] </span>' : ''}${escapeHtml(message)}
                                </div>
                                <div style="font-size: 12px; color: #9ca3af; white-space: nowrap;">${time}</div>
                            </div>
                        </div>
                    `;
                });

                contentHTML += `
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div id="liveCommentsModal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 100001;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: liveModalFadeIn 0.2s ease;
            ">
                <div style="
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    animation: liveModalSlideUp 0.3s ease;
                ">
                    <!-- Header -->
                    <div style="
                        padding: 20px 24px;
                        border-bottom: 1px solid #e5e7eb;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div>
                            <h3 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-list-alt" style="color: #6366f1;"></i>
                                Lịch sử bình luận Live
                            </h3>
                            <p style="margin: 0; font-size: 13px; color: #6b7280;">
                                SĐT: <strong>${escapeHtml(phone)}</strong> • ${totalOrders} đơn hàng liên quan
                            </p>
                        </div>
                        <button onclick="closeLiveCommentsModal()" style="
                            background: none;
                            border: none;
                            width: 36px;
                            height: 36px;
                            border-radius: 50%;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #6b7280;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                            <i class="fas fa-times" style="font-size: 18px;"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div style="
                        flex: 1;
                        overflow-y: auto;
                        padding: 20px 24px;
                    ">
                        ${contentHTML}
                    </div>

                    <!-- Footer -->
                    <div style="
                        padding: 16px 24px;
                        border-top: 1px solid #e5e7eb;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: #f9fafb;
                        border-radius: 0 0 16px 16px;
                    ">
                        <span style="font-size: 13px; color: #6b7280;">
                            Tổng: <strong>${totalComments}</strong> bình luận từ <strong>${totalOrders}</strong> đơn hàng
                        </span>
                        <button onclick="closeLiveCommentsModal()" style="
                            padding: 8px 20px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#4f46e5'" onmouseout="this.style.background='#6366f1'">
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Escape HTML để tránh XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Inject CSS animations
     */
    function injectStyles() {
        if (document.getElementById('live-comments-modal-style')) return;

        const style = document.createElement('style');
        style.id = 'live-comments-modal-style';
        style.textContent = `
            @keyframes liveModalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes liveModalSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Main function: Mở modal hiển thị live comments từ tất cả đơn hàng có cùng SĐT
     */
    window.openLiveCommentsModal = async function () {
        try {
            injectStyles();

            // Lấy order data hiện tại (đã có đầy đủ từ API expand)
            const fullOrderData = window.currentChatOrderData;
            if (!fullOrderData) {
                showToast('Không có thông tin đơn hàng', 'error');
                return;
            }

            const phone = fullOrderData.Telephone;
            if (!phone) {
                showToast('Đơn hàng không có số điện thoại', 'error');
                return;
            }

            // Tìm tất cả đơn hàng có cùng SĐT (trả về {order, indexInAllData})
            const relatedOrdersInfo = findRelatedOrdersByPhone(fullOrderData);
            console.log('[LiveComments] Found', relatedOrdersInfo.length, 'related orders for phone:', phone);

            if (relatedOrdersInfo.length === 0) {
                showToast('Không tìm thấy đơn hàng', 'error');
                return;
            }

            // Hiển thị loading
            showToast(`Đang tải bình luận từ ${relatedOrdersInfo.length} đơn hàng...`, 'info');

            // Tạo danh sách các fetch tasks cho mỗi đơn hàng
            const fetchTasks = relatedOrdersInfo.map(async (info) => {
                try {
                    const { order: basicOrder, indexInAllData } = info;

                    // Nếu là đơn hiện tại, dùng fullOrderData đã có sẵn
                    // Nếu không, fetch full data từ API
                    let orderData;
                    if (basicOrder.Id === fullOrderData.Id) {
                        orderData = fullOrderData;
                    } else {
                        orderData = await fetchFullOrderData(basicOrder.Id);
                        if (!orderData) {
                            return { order: basicOrder, comments: [], indexInAllData };
                        }
                    }

                    const facebookPostId = orderData.Facebook_PostId;
                    const userId = orderData.Facebook_ASUserId;

                    if (!facebookPostId || !userId) {
                        console.log('[LiveComments] Order', basicOrder.Id, 'missing Facebook data');
                        return { order: orderData, comments: [], indexInAllData };
                    }

                    // Parse pageId và postId từ Facebook_PostId (format: pageId_postId)
                    const parts = facebookPostId.split('_');
                    if (parts.length < 2) {
                        return { order: orderData, comments: [], indexInAllData };
                    }

                    const pageId = parts[0];
                    const postId = parts[1];

                    // Fetch comments cho đơn hàng này
                    const result = await fetchLiveCommentsByUser(pageId, postId, userId);
                    return { order: orderData, comments: result.items || [], indexInAllData };
                } catch (err) {
                    console.warn('[LiveComments] Error fetching for order', info.order.Id, ':', err.message);
                    return { order: info.order, comments: [], indexInAllData: info.indexInAllData };
                }
            });

            // Fetch song song tất cả đơn hàng
            const ordersWithComments = await Promise.all(fetchTasks);

            // Đóng toast loading
            const loadingToast = document.querySelector('.live-comments-toast');
            if (loadingToast) loadingToast.remove();

            // Tạo và hiển thị modal
            const modalHTML = createRelatedOrdersModalHTML(ordersWithComments, phone);

            // Remove existing modal if any
            const existingModal = document.getElementById('liveCommentsModal');
            if (existingModal) existingModal.remove();

            // Insert modal
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Close on backdrop click
            const modal = document.getElementById('liveCommentsModal');
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeLiveCommentsModal();
                }
            });

            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeLiveCommentsModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            const totalComments = ordersWithComments.reduce((sum, item) => sum + item.comments.length, 0);
            console.log('[LiveComments] Modal opened with', totalComments, 'comments from', ordersWithComments.length, 'orders');

        } catch (error) {
            console.error('[LiveComments] Error:', error);
            showToast('Lỗi khi tải bình luận: ' + error.message, 'error');
        }
    };

    /**
     * Đóng modal
     */
    window.closeLiveCommentsModal = function () {
        const modal = document.getElementById('liveCommentsModal');
        if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.2s ease';
            setTimeout(() => modal.remove(), 200);
        }
    };

    console.log('[LiveComments] live-comments-readonly-modal.js loaded');

})();
