// =====================================================
// tab1-chat-facebook.js - Facebook Graph API Integration
// Send message via Facebook Tag (HUMAN_AGENT / POST_PURCHASE_UPDATE),
// 24h policy fallback UI, switchToCommentMode
// =====================================================
// Dependencies: tab1-chat-core.js (state globals), tab1-chat-messages.js (renderChatMessages)
// Exposes: sendMessageViaFacebookTag (file-scoped, called from messages.js),
//          window.show24hFallbackPrompt, window.sendViaFacebookTagFromModal,
//          window.switchToCommentMode, window.close24hFallbackModal,
//          window.current24hPolicyStatus

console.log('[Tab1-Chat-Facebook] Loading...');

/**
 * Send message via Facebook Graph API with HUMAN_AGENT / POST_PURCHASE_UPDATE message tag
 * Used to bypass 24h policy when normal Pancake API fails
 * @param {object} params - Message parameters
 * @param {string} params.pageId - Facebook Page ID
 * @param {string} params.psid - Facebook PSID of recipient
 * @param {string} params.message - Message text to send
 * @param {Array<string>} params.imageUrls - Optional array of image URLs to send
 * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
 */
async function sendMessageViaFacebookTag(params) {
    const { pageId, psid, message, imageUrls, postId, customerName } = params;

    console.log('[FB-TAG-SEND] ========================================');
    console.log('[FB-TAG-SEND] Attempting to send message via Facebook Graph API with HUMAN_AGENT / POST_PURCHASE_UPDATE tag');
    console.log('[FB-TAG-SEND] Page ID:', pageId, 'PSID:', psid);

    try {
        // Get Facebook Page Token from TPOS CRMTeam data (expanded in order)
        // This token is different from Pancake's page_access_token
        let facebookPageToken = null;
        let tokenSourcePageId = null;

        // Source 1: Try from window.currentCRMTeam (set when chat modal opens)
        // IMPORTANT: Check if this CRMTeam matches the requested pageId
        if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
            const crmPageId = window.currentCRMTeam.ChannelId || window.currentCRMTeam.Facebook_AccountId || window.currentCRMTeam.Id;
            tokenSourcePageId = crmPageId;

            // Check if pageId matches CRMTeam's page
            if (String(crmPageId) === String(pageId) ||
                String(window.currentCRMTeam.Facebook_AccountId) === String(pageId)) {
                facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
                console.log('[FB-TAG-SEND] Got matching Facebook Page Token from window.currentCRMTeam');
            } else {
                console.warn(`[FB-TAG-SEND] currentCRMTeam page (${crmPageId}) does not match requested page (${pageId})`);
            }
        }

        // Source 2: Try to get from current order's CRMTeam (if already loaded)
        if (!facebookPageToken && window.currentOrder && window.currentOrder.CRMTeam && window.currentOrder.CRMTeam.Facebook_PageToken) {
            const crmPageId = window.currentOrder.CRMTeam.ChannelId || window.currentOrder.CRMTeam.Facebook_AccountId;
            tokenSourcePageId = crmPageId;

            if (String(crmPageId) === String(pageId) ||
                String(window.currentOrder.CRMTeam.Facebook_AccountId) === String(pageId)) {
                facebookPageToken = window.currentOrder.CRMTeam.Facebook_PageToken;
                console.log('[FB-TAG-SEND] Got matching Facebook Page Token from currentOrder.CRMTeam');
            } else {
                console.warn(`[FB-TAG-SEND] currentOrder.CRMTeam page (${crmPageId}) does not match requested page (${pageId})`);
            }
        }

        // Source 3: Try from cachedChannelsData
        if (!facebookPageToken && window.cachedChannelsData) {
            const channel = window.cachedChannelsData.find(ch =>
                String(ch.ChannelId) === String(pageId) ||
                String(ch.Facebook_AccountId) === String(pageId)
            );
            if (channel && channel.Facebook_PageToken) {
                facebookPageToken = channel.Facebook_PageToken;
                console.log('[FB-TAG-SEND] Got Facebook Page Token from cached channels');
            }
        }

        // Source 4: Fetch CRMTeam directly by pageId from TPOS (NEW!)
        if (!facebookPageToken) {
            console.log('[FB-TAG-SEND] Token not found for page, fetching CRMTeam from TPOS...');
            try {
                const headers = await window.tokenManager?.getAuthHeader() || {};
                // Try to find CRMTeam by ChannelId (pageId)
                const crmUrl = `${window.API_CONFIG.WORKER_URL}/api/odata/CRMTeam?$filter=ChannelId eq '${pageId}' or Facebook_AccountId eq '${pageId}'&$top=1`;
                const response = await fetch(crmUrl, {
                    method: 'GET',
                    headers: { ...headers, 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    const teams = data.value || data;
                    if (teams && teams.length > 0 && teams[0].Facebook_PageToken) {
                        facebookPageToken = teams[0].Facebook_PageToken;
                        console.log('[FB-TAG-SEND] Got Facebook Page Token from CRMTeam API for page:', pageId);
                    }
                }
            } catch (fetchError) {
                console.warn('[FB-TAG-SEND] Could not fetch CRMTeam from TPOS:', fetchError.message);
            }
        }

        // Source 5: Fallback - use currentCRMTeam token anyway (may cause error but better than nothing)
        if (!facebookPageToken && window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
            facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
            console.warn('[FB-TAG-SEND] Using currentCRMTeam token as fallback - may cause page mismatch error!');
            console.warn(`[FB-TAG-SEND] Token is for page: ${tokenSourcePageId}, but sending to page: ${pageId}`);
        }

        if (!facebookPageToken) {
            console.error('[FB-TAG-SEND] No Facebook Page Token found for page:', pageId);
            return {
                success: false,
                error: 'Không tìm thấy Facebook Page Token. Token này khác với Pancake token và cần được thiết lập trong TPOS.'
            };
        }

        // Call Facebook Send API via our worker proxy
        const facebookSendUrl = window.API_CONFIG.buildUrl.facebookSend();
        console.log('[FB-TAG-SEND] Calling:', facebookSendUrl);

        const requestBody = {
            pageId: pageId,
            psid: psid,
            message: message,
            pageToken: facebookPageToken,
            useTag: true, // Use HUMAN_AGENT / POST_PURCHASE_UPDATE tag
            imageUrls: imageUrls || [], // Include image URLs if provided
            postId: postId || window.purchaseFacebookPostId || null, // For Private Reply fallback
            customerName: customerName || window.currentCustomerName || null // For comment search
        };

        const response = await fetch(facebookSendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        console.log('[FB-TAG-SEND] Response:', result);
        console.log('[FB-TAG-SEND] ========================================');

        if (result.success) {
            console.log('[FB-TAG-SEND] Message sent successfully via Facebook Graph API!');
            console.log('[FB-TAG-SEND] Message ID:', result.message_id);
            console.log('[FB-TAG-SEND] Used tag:', result.used_tag);
            return {
                success: true,
                messageId: result.message_id,
                recipientId: result.recipient_id,
                usedTag: result.used_tag
            };
        } else {
            console.error('[FB-TAG-SEND] Facebook API error:', result.error);
            return {
                success: false,
                error: result.error || 'Facebook API error',
                errorCode: result.error_code,
                errorSubcode: result.error_subcode
            };
        }

    } catch (error) {
        console.error('[FB-TAG-SEND] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Global flag to track if 24h policy fallback UI should be shown
window.current24hPolicyStatus = {
    isExpired: false,
    hoursSinceLastMessage: null,
    canUseFacebookTag: false
};

/**
 * Show 24h policy fallback prompt with option to send via Facebook tag
 */
window.show24hFallbackPrompt = function (messageText, pageId, psid) {
    const modalContent = `
        <div style="padding: 20px; max-width: 400px;">
            <h3 style="margin: 0 0 16px; color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-clock"></i>
                Đã quá 24 giờ
            </h3>
            <p style="color: #6b7280; margin: 0 0 16px; line-height: 1.5;">
                Khách hàng chưa tương tác trong 24 giờ qua. Chọn cách gửi tin nhắn:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button onclick="window.sendViaFacebookTagFromModal('${encodeURIComponent(messageText)}', '${pageId}', '${psid}')"
                    style="padding: 12px 16px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fab fa-facebook"></i>
                    Gửi với Message Tag (HUMAN_AGENT / POST_PURCHASE_UPDATE)
                </button>
                <p style="font-size: 12px; color: #9ca3af; margin: 0; padding: 0 8px;">
                    Chỉ dùng cho thông báo liên quan đơn hàng (xác nhận, vận chuyển, yêu cầu hành động)
                </p>
                <button onclick="window.switchToCommentMode()"
                    style="padding: 12px 16px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-comment"></i>
                    Chuyển sang reply Comment
                </button>
                <button onclick="window.close24hFallbackModal()"
                    style="padding: 10px 16px; background: transparent; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                    Hủy
                </button>
            </div>
        </div>
    `;

    // Create modal
    let modal = document.getElementById('fb24hFallbackModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fb24hFallbackModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div style="background: white; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.2);">${modalContent}</div>`;
    modal.style.display = 'flex';
};

window.close24hFallbackModal = function () {
    const modal = document.getElementById('fb24hFallbackModal');
    if (modal) modal.style.display = 'none';
};

window.sendViaFacebookTagFromModal = async function (encodedMessage, pageId, psid, imageUrls = [], postId = null, customerName = null) {
    window.close24hFallbackModal();

    const message = decodeURIComponent(encodedMessage);

    if (window.notificationManager) {
        window.notificationManager.show('Đang gửi qua Facebook Graph API...', 'info');
    }

    const result = await sendMessageViaFacebookTag({ pageId, psid, message, imageUrls, postId, customerName });

    if (result.success) {
        if (window.notificationManager) {
            window.notificationManager.show('Đã gửi tin nhắn thành công qua Facebook!', 'success', 5000);
        }

        // Add optimistic UI update
        const now = new Date().toISOString();
        const tempMessage = {
            Id: `fb_${Date.now()}`,
            id: `fb_${Date.now()}`,
            Message: message + '\n\n[Gửi qua Facebook Message Tag]',
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };
        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        // Refresh messages after a delay
        setTimeout(async () => {
            try {
                if (window.currentChatPSID && window.currentChatChannelId) {
                    const response = await window.chatDataManager.fetchMessages(
                        window.currentChatChannelId,
                        window.currentChatPSID
                    );
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                    }
                }
            } catch (e) {
                console.error('[FB-TAG-SEND] Error refreshing messages:', e);
            }
        }, 1000);
    } else {
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi gửi qua Facebook: ' + result.error, 'error', 8000);
        } else {
            alert('Lỗi gửi qua Facebook: ' + result.error);
        }
    }
};

window.switchToCommentMode = function () {
    window.close24hFallbackModal();
    if (window.notificationManager) {
        window.notificationManager.show('Vui lòng mở lại modal Comment để reply', 'info', 5000);
    }
};

// Expose sendMessageViaFacebookTag for use by tab1-chat-messages.js
window.sendMessageViaFacebookTag = sendMessageViaFacebookTag;

console.log('[Tab1-Chat-Facebook] Loaded successfully.');
