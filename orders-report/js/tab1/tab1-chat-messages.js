// =====================================================
// tab1-chat-messages.js - Message Rendering & Sending Module
// Message queue, reply state, input handling, send wrappers,
// sendMessageInternal, sendCommentInternal, handleReplyToComment,
// renderChatMessages, renderComments, new message indicator
// =====================================================
// Dependencies: tab1-chat-core.js (state globals), tab1-chat-facebook.js (sendMessageViaFacebookTag),
//               tab1-chat-images.js (updateSendButtonState)
// Exposes: renderChatMessages, renderComments, window.sendMessage, window.sendComment, etc.

console.log('[Tab1-Chat-Messages] Loading...');

// Message Queue Management
window.chatMessageQueue = window.chatMessageQueue || [];
window.chatIsProcessingQueue = false;

// Reply Message State
window.currentReplyingToMessage = null; // Stores the message being replied to

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scrollHeight, but don't exceed max-height
    const maxHeight = 120; // matches max-height in CSS
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
}

/**
 * Handle Enter key in chat input - prevent double submission, allow Shift+Enter for newlines
 */
function handleChatInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        // Skip if autocomplete is active (let quick-reply-manager handle the Enter)
        if (window.quickReplyManager && window.quickReplyManager.autocompleteActive) {
            console.log('[CHAT] Enter pressed but autocomplete is active, skipping sendReplyComment');
            return; // Don't prevent default - let quick-reply-manager handle it
        }

        event.preventDefault(); // Prevent default form submission and double trigger
        event.stopPropagation(); // Stop event bubbling

        // Call sendReplyComment only once
        window.sendReplyComment();
    }
    // Shift+Enter will use default behavior (insert newline)
    // After newline is inserted, resize will happen via input event
}

/**
 * Handle input event for auto-resize
 */
function handleChatInputInput(event) {
    autoResizeTextarea(event.target);
}

/**
 * Set a message to reply to by ID (lookup from chatMessagesById map)
 */
window.setReplyMessageById = function (messageId) {
    const message = window.chatMessagesById?.[messageId];
    if (message) {
        window.setReplyMessage(message);
    } else {
        console.warn('[REPLY] Message not found in map:', messageId);
    }
};

/**
 * Set a message to reply to
 */
window.setReplyMessage = function (message) {
    window.currentReplyingToMessage = message;

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText) {
        // Extract text from message (handle both text and HTML)
        const messageText = extractMessageText(message);
        const truncated = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

        // Get sender name and Facebook ID
        const senderName = message.FromName || message.from?.name || 'Khách hàng';
        const fbId = message.From?.id || message.from?.id || message.FromId || null;

        // Get timestamp
        const timestamp = message.CreatedTime || message.updated_at || message.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        // Verify fb_id matches current conversation's customer (if available)
        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] Facebook ID mismatch!', {
                messageFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        // Display with timestamp
        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncated}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';
    }

    // Focus input
    const input = document.getElementById('chatReplyInput');
    if (input) input.focus();

    console.log('[REPLY] Set reply to message:', message.id || message.Id, 'fb_id:', message.From?.id || message.from?.id);
};

/**
 * Cancel replying to a message
 */
window.cancelReplyMessage = function () {
    window.currentReplyingToMessage = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    console.log('[REPLY] Cancelled reply');
};

/**
 * Cancel replying to a comment
 */
window.cancelReplyComment = function () {
    // Clear reply state
    currentParentCommentId = null;
    currentPostId = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    // Reset input and disable it (only allow replying to comments)
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        input.value = ''; // Clear input content
        input.disabled = true;
        input.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        input.style.background = '#f3f4f6';
        input.style.cursor = 'not-allowed';
    }

    // Disable send button
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
    }

    console.log('[REPLY] Cancelled comment reply');
};

/**
 * Cancel reply - works for both messages and comments
 */
window.cancelReply = function () {
    // Check if we're in comment or message mode
    if (currentChatType === 'comment') {
        window.cancelReplyComment();
    } else {
        window.cancelReplyMessage();
    }
};

/**
 * Extract text from message object (handles both text and HTML)
 */
function extractMessageText(message) {
    // Try different message fields
    let text = message.message || message.Message || message.text || '';

    // If HTML, extract text
    if (text.includes('<')) {
        const div = document.createElement('div');
        div.innerHTML = text;
        text = div.textContent || div.innerText || '';
    }

    return text.trim();
}

/**
 * Show/Hide sending indicator in chat modal
 */
window.showChatSendingIndicator = function (text = 'Đang gửi...', queueCount = 0) {
    const indicator = document.getElementById('chatSendingIndicator');
    const textSpan = document.getElementById('chatSendingText');
    const queueSpan = document.getElementById('chatQueueCount');

    if (indicator) {
        indicator.style.display = 'flex';
        if (textSpan) textSpan.textContent = text;
        if (queueSpan) {
            if (queueCount > 0) {
                queueSpan.textContent = `+${queueCount}`;
                queueSpan.style.display = 'block';
            } else {
                queueSpan.style.display = 'none';
            }
        }
    }
}

window.hideChatSendingIndicator = function () {
    const indicator = document.getElementById('chatSendingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

/**
 * Process message queue
 */
async function processChatMessageQueue() {
    if (window.chatIsProcessingQueue || window.chatMessageQueue.length === 0) {
        return;
    }

    window.chatIsProcessingQueue = true;

    while (window.chatMessageQueue.length > 0) {
        const queueCount = window.chatMessageQueue.length - 1;
        showChatSendingIndicator('Đang gửi...', queueCount);

        const messageData = window.chatMessageQueue.shift();
        try {
            // Route to correct function based on chatType
            if (messageData.chatType === 'message') {
                await sendMessageInternal(messageData);
            } else if (messageData.chatType === 'comment') {
                await sendCommentInternal(messageData);
            } else {
                console.error('[QUEUE] Unknown chatType:', messageData.chatType);
                throw new Error('Unknown chatType: ' + messageData.chatType);
            }
        } catch (error) {
            console.error('[QUEUE] Error sending:', error);
            // Continue with next message even if this one fails
        }
    }

    window.chatIsProcessingQueue = false;
    hideChatSendingIndicator();
}

// =====================================================
// PUBLIC API - Message Modal
// =====================================================

/**
 * Split long messages into multiple parts (max 2000 characters each)
 * This is required because Facebook Messenger API has a 2000 character limit per message.
 * Splits at newlines first, then spaces, to avoid breaking words.
 * @param {string} message - The message to split
 * @param {number} maxLength - Maximum length per part (default: 2000)
 * @returns {string[]} Array of message parts
 */
function splitMessageIntoParts(message, maxLength = 2000) {
    if (!message || message.length <= maxLength) {
        return [message];
    }

    const parts = [];
    let remaining = message;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }

        // Find the nearest newline before maxLength
        let cutIndex = remaining.lastIndexOf('\n', maxLength);

        // If no newline found or too far back, find nearest space
        if (cutIndex === -1 || cutIndex < maxLength * 0.5) {
            cutIndex = remaining.lastIndexOf(' ', maxLength);
        }

        // If still no good cut point, hard cut at maxLength
        if (cutIndex === -1 || cutIndex < maxLength * 0.3) {
            cutIndex = maxLength;
        }

        const part = remaining.substring(0, cutIndex).trim();
        if (part.length > 0) {
            parts.push(part);
        }
        remaining = remaining.substring(cutIndex).trim();
    }

    console.log(`[MESSAGE] Split message into ${parts.length} parts (${message.length} chars total)`);
    return parts;
}

/**
 * Send message (MESSAGE modal only)
 * Public wrapper - adds to queue
 */
window.sendMessage = async function () {
    if (isSendingMessage) {
        console.log('[MESSAGE] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[MESSAGE] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[MESSAGE] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập tin nhắn hoặc dán ảnh!');
            return;
        }

        // Validate required info
        if (!currentOrder || !window.currentConversationId || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi tin nhắn. Vui lòng đóng và mở lại modal.');
            console.error('[MESSAGE] Missing required info');
            return;
        }

        // Capture replied message ID
        const repliedMessageId = window.currentReplyingToMessage ?
            (window.currentReplyingToMessage.id || window.currentReplyingToMessage.Id || null) : null;

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[MESSAGE] Adding to queue', {
            repliedMessageId,
            imageCount: window.uploadedImagesData?.length || 0,
            sendPageId,
            replyType: messageReplyType
        });

        // Split message into parts if too long (Facebook Messenger limit: 2000 chars)
        const messageParts = splitMessageIntoParts(message);
        const uploadedImages = window.uploadedImagesData || [];

        // Add each message part to the queue
        for (let i = 0; i < messageParts.length; i++) {
            const messagePart = messageParts[i];
            const isLastPart = i === messageParts.length - 1;

            // Build queue data for this part
            const queueData = {
                message: messagePart,
                // Only include images in the last part
                uploadedImagesData: isLastPart ? uploadedImages : [],
                order: currentOrder,
                conversationId: window.currentConversationId,
                channelId: sendPageId,
                chatType: 'message', // EXPLICITLY set to message
                // Only include repliedMessageId in the first part
                repliedMessageId: i === 0 ? repliedMessageId : null,
                customerId: window.currentCustomerUUID, // Add customer_id for Pancake API
                messageReplyType: messageReplyType // Add reply type for private_replies support
            };

            // Add Facebook data if using private_replies (only for first part)
            if (messageReplyType === 'private_replies' && i === 0) {
                queueData.postId = window.purchaseFacebookPostId;
                queueData.commentId = window.purchaseCommentId;
                queueData.psid = window.currentChatPSID;
                console.log('[MESSAGE] Private reply data:', {
                    postId: queueData.postId,
                    commentId: queueData.commentId,
                    psid: queueData.psid
                });
            }

            window.chatMessageQueue.push(queueData);

            if (messageParts.length > 1) {
                console.log(`[MESSAGE] Queued part ${i + 1}/${messageParts.length} (${messagePart.length} chars)`);
            }
        }

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state
        window.cancelReply();

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// PUBLIC API - Comment Modal
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Public wrapper - adds to queue
 */
window.sendComment = async function () {
    if (isSendingMessage) {
        console.log('[COMMENT] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[COMMENT] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[COMMENT] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập bình luận hoặc dán ảnh!');
            return;
        }

        // Validate required info
        if (!currentOrder || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi bình luận. Vui lòng đóng và mở lại modal.');
            console.error('[COMMENT] Missing required info');
            return;
        }

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[COMMENT] Adding to queue', { imageCount: window.uploadedImagesData?.length || 0, sendPageId });

        // Split message into parts if too long (Facebook limit: 2000 chars)
        const messageParts = splitMessageIntoParts(message);
        const uploadedImages = window.uploadedImagesData || [];

        // Add each message part to the queue
        for (let i = 0; i < messageParts.length; i++) {
            const messagePart = messageParts[i];
            const isLastPart = i === messageParts.length - 1;

            window.chatMessageQueue.push({
                message: messagePart,
                // Only include images in the last part
                uploadedImagesData: isLastPart ? uploadedImages : [],
                order: currentOrder,
                conversationId: window.currentConversationId,
                channelId: sendPageId,
                chatType: 'comment', // EXPLICITLY set to comment
                // Only include parentCommentId in the first part
                parentCommentId: i === 0 ? currentParentCommentId : null,
                postId: currentPostId || currentOrder.Facebook_PostId,
                customerId: window.currentCustomerUUID // Add customer_id for Pancake API
            });

            if (messageParts.length > 1) {
                console.log(`[COMMENT] Queued part ${i + 1}/${messageParts.length} (${messagePart.length} chars)`);
            }
        }

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state (for nested comments)
        if (window.cancelReply) {
            window.cancelReply();
        }

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// LEGACY WRAPPER - For backwards compatibility
// =====================================================

/**
 * Legacy wrapper - routes to correct function based on currentChatType
 * @deprecated Use window.sendMessage() or window.sendComment() directly
 */
window.sendReplyComment = async function () {
    console.log('[LEGACY] sendReplyComment called, routing to:', currentChatType);

    // Route to correct function based on chat type
    if (currentChatType === 'message') {
        return window.sendMessage();
    } else if (currentChatType === 'comment') {
        return window.sendComment();
    } else {
        console.error('[LEGACY] Unknown currentChatType:', currentChatType);
        alert('Lỗi: Không xác định được loại modal (message/comment)');
    }
};

/**
 * Get image dimensions from blob/file
 * @param {Blob|File} blob
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

// =====================================================
// MESSAGE MODAL - Send message functions
// =====================================================

/**
 * Send message (MESSAGE modal only)
 * Called by queue processor
 * Supports both reply_inbox and private_replies actions
 */
async function sendMessageInternal(messageData) {
    const {
        message,
        uploadedImagesData,
        order,
        conversationId,
        channelId,
        repliedMessageId,
        customerId,
        messageReplyType = 'reply_inbox', // Default to reply_inbox
        postId,
        commentId,
        psid
    } = messageData;

    try {
        // Get page_access_token for Official API (pages.fm)
        let pageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
        if (!pageAccessToken) {
            const activeToken = window.pancakeTokenManager?.currentToken;
            if (activeToken) {
                pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, activeToken);
            }
            if (!pageAccessToken && window.pancakeTokenManager) {
                console.log('[MESSAGE] Active account cannot access page', channelId, '- trying other accounts...');
                if (Object.keys(window.pancakeTokenManager.accountPageAccessMap).length === 0) {
                    await window.pancakeTokenManager.prefetchAllAccountPages();
                }
                const fallbackAccount = window.pancakeTokenManager.findAccountWithPageAccess(channelId, window.pancakeTokenManager.activeAccountId);
                if (fallbackAccount) {
                    console.log('[MESSAGE] Fallback account:', fallbackAccount.name);
                    pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, fallbackAccount.token);
                }
            }
        }
        if (!pageAccessToken) {
            throw new Error('Không tìm thấy page_access_token. Không có account nào có quyền truy cập page này.');
        }

        showChatSendingIndicator('Đang gửi tin nhắn...');

        // Step 1: Process multiple images
        let imagesDataArray = [];
        let hasFallbackImages = false;
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            console.log('[MESSAGE] Processing', uploadedImagesData.length, 'images');
            showChatSendingIndicator(`Đang xử lý ${uploadedImagesData.length} ảnh...`);

            for (let i = 0; i < uploadedImagesData.length; i++) {
                const imageData = uploadedImagesData[i];

                try {
                    if ((imageData.content_id || imageData.id) && !imageData.uploadFailed) {
                        console.log(`[MESSAGE] Image ${i + 1}: Using pre-uploaded ID:`, imageData.content_id || imageData.id);
                        imagesDataArray.push(imageData);
                    } else if (imageData.fallback_url) {
                        console.log(`[MESSAGE] Image ${i + 1}: Using fallback URL (imgbb):`, imageData.fallback_url);
                        imagesDataArray.push(imageData);
                        hasFallbackImages = true;
                    } else if (imageData.blob) {
                        console.log(`[MESSAGE] Image ${i + 1}: Retrying upload...`);
                        showChatSendingIndicator(`Đang tải ảnh ${i + 1}/${uploadedImagesData.length}...`);

                        const result = await window.uploadImageWithCache(
                            imageData.blob,
                            imageData.productId || null,
                            imageData.productName || null,
                            channelId,
                            imageData.productCode || null
                        );

                        if (!result.success) {
                            throw new Error(`Ảnh ${i + 1} upload failed: ${result.error || 'Unknown error'}`);
                        }

                        console.log(`[MESSAGE] Image ${i + 1}: Uploaded:`, result.data.content_url);
                        imagesDataArray.push(result.data);

                        if (result.data.fallback_url || result.data.fallback_source) {
                            hasFallbackImages = true;
                            console.log(`[MESSAGE] Image ${i + 1}: Detected fallback source:`, result.data.fallback_source);
                        }
                    }
                } catch (uploadError) {
                    console.error(`[MESSAGE] Image ${i + 1} processing failed:`, uploadError);
                    throw new Error(`Tải ảnh ${i + 1} thất bại: ${uploadError.message}`);
                }
            }

            console.log('[MESSAGE] All images processed:', imagesDataArray.length, 'hasFallbackImages:', hasFallbackImages);
        }

        // Step 1.5: If we have fallback images (no content_id), go directly to Facebook Graph API
        if (hasFallbackImages && imagesDataArray.length > 0) {
            console.log('[MESSAGE] Fallback images detected - sending directly via Facebook Graph API');
            showChatSendingIndicator('Đang gửi qua Facebook Graph API...');

            const imageUrls = imagesDataArray
                .map(img => img.fallback_url || img.content_url)
                .filter(url => url);

            if (imageUrls.length > 0) {
                let realPsid = psid || window.currentRealFacebookPSID || window.currentChatPSID;

                const fbResult = await sendMessageViaFacebookTag({
                    pageId: channelId,
                    psid: realPsid,
                    message: message,
                    imageUrls: imageUrls
                });

                if (fbResult.success) {
                    console.log('[MESSAGE] Facebook Graph API send success!');
                    if (window.notificationManager) {
                        window.notificationManager.show('Đã gửi tin nhắn qua Facebook!', 'success');
                    }

                    // Optimistic UI update
                    const now = new Date().toISOString();
                    const tempMessage = {
                        Id: `temp_${Date.now()}`,
                        id: `temp_${Date.now()}`,
                        Message: message,
                        CreatedTime: now,
                        IsOwner: true,
                        is_temp: true,
                        Attachments: imageUrls.map(url => ({
                            Type: 'image',
                            Payload: { Url: url }
                        }))
                    };
                    window.allChatMessages.push(tempMessage);
                    renderChatMessages(window.allChatMessages, true);

                    return; // Success - exit early
                } else {
                    console.error('[MESSAGE] Facebook Graph API send failed:', fbResult.error);
                    throw new Error('Gửi qua Facebook Graph API thất bại: ' + (fbResult.error || 'Unknown error'));
                }
            }
        }

        // Step 2: Build JSON payload based on reply type
        let payload;
        let actualConversationId = conversationId;

        if (messageReplyType === 'private_replies') {
            if (!postId || !commentId || !psid) {
                throw new Error('Thiếu thông tin comment để gửi tin nhắn riêng. Vui lòng thử lại.');
            }

            actualConversationId = commentId;

            payload = {
                action: 'private_replies',
                post_id: postId,
                message_id: commentId,
                from_id: psid,
                message: message
            };

            console.log('[MESSAGE] Building PRIVATE_REPLIES payload:', {
                postId,
                commentId,
                psid,
                conversationId: actualConversationId
            });
        } else {
            payload = {
                action: 'reply_inbox',
                message: message
            };

            if (repliedMessageId) {
                payload.replied_message_id = repliedMessageId;
                console.log('[MESSAGE] Adding replied_message_id:', repliedMessageId);
            }

            console.log('[MESSAGE] Building REPLY_INBOX payload');
        }

        // Step 3: Send message
        let replyUrl;
        let requestOptions;
        let apiSuccess = false;
        let apiError = null;

        if (imagesDataArray.length > 0) {
            // SEND WITH IMAGES via Internal API (multipart/form-data)
            console.log('[MESSAGE] Adding', imagesDataArray.length, 'images to payload');

            const accessToken = await window.pancakeDataManager?.getToken();
            if (!accessToken) {
                throw new Error('No Pancake access_token available for image send');
            }

            replyUrl = window.API_CONFIG.buildUrl.pancake(
                `pages/${channelId}/conversations/${actualConversationId}/messages`,
                `access_token=${accessToken}`
            ) + (customerId ? `&customer_id=${customerId}` : '');

            const firstImage = imagesDataArray[0];
            const formData = new FormData();
            formData.append('action', payload.action || 'reply_inbox');
            formData.append('message', message || '');
            formData.append('content_id', firstImage.content_id || firstImage.id || '');
            formData.append('attachment_id', firstImage.fb_id || '');
            formData.append('content_url', firstImage.content_url || '');
            formData.append('width', String(firstImage.width || 0));
            formData.append('height', String(firstImage.height || 0));
            formData.append('send_by_platform', 'web');

            if (repliedMessageId) {
                formData.append('replied_message_id', repliedMessageId);
            }

            requestOptions = {
                method: 'POST',
                body: formData
            };

            console.log('[MESSAGE] Using Internal API with multipart/form-data');
            console.log('[MESSAGE] content_id:', firstImage.content_id || firstImage.id);

            if (imagesDataArray.length > 1) {
                console.warn('[MESSAGE] Multiple images not fully supported yet - only first image will be sent');
            }
        } else {
            // SEND TEXT ONLY via Official API (JSON)
            replyUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${channelId}/conversations/${actualConversationId}/messages`,
                pageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            };
        }

        console.log('[MESSAGE] Sending message...');
        console.log('[MESSAGE] URL:', replyUrl.replace(/access_token=[^&]+/, 'access_token=***'));

        try {
            const replyResponse = await API_CONFIG.smartFetch(replyUrl, requestOptions, 1, true);

            if (!replyResponse.ok) {
                const errorText = await replyResponse.text();
                console.error('[MESSAGE] Send failed:', errorText);
                throw new Error(`Gửi tin nhắn thất bại: ${replyResponse.status} ${replyResponse.statusText}`);
            }

            const replyData = await replyResponse.json();
            console.log('[MESSAGE] Response:', replyData);

            if (!replyData.success) {
                console.error('[MESSAGE] API Error:', replyData);

                const is24HourError = (replyData.e_code === 10 && replyData.e_subcode === 2018278) ||
                    (replyData.message && replyData.message.includes('khoảng thời gian cho phép'));

                if (is24HourError) {
                    console.warn('[MESSAGE] 24-hour policy violation detected');
                    const error24h = new Error('24H_POLICY_ERROR');
                    error24h.is24HourError = true;
                    error24h.originalMessage = replyData.message;
                    throw error24h;
                }

                const isUserUnavailable = (replyData.e_code === 551) ||
                    (replyData.message && replyData.message.includes('không có mặt'));

                if (isUserUnavailable) {
                    console.warn('[MESSAGE] User unavailable (551) error detected');
                    const error551 = new Error('USER_UNAVAILABLE');
                    error551.isUserUnavailable = true;
                    error551.originalMessage = replyData.message;
                    throw error551;
                }

                const errorMessage = replyData.error || replyData.message || replyData.reason || 'Unknown error';
                throw new Error('Gửi tin nhắn thất bại: ' + errorMessage);
            }

            apiSuccess = true;

            // Auto-mark as read after successful message send
            console.log('[MARK-READ] Message sent successfully');
            autoMarkAsRead(0);
        } catch (err) {
            apiError = err;
            console.warn('[MESSAGE] API failed:', err.message);

            // Fallback: Private Reply (for error 551 only)
            if (!apiSuccess && err.isUserUnavailable) {
                console.log('[MESSAGE] User unavailable (#551), checking for Private Reply context...');

                if (window.notificationManager) {
                    window.notificationManager.show(
                        'Lỗi 551: Không thể gửi inbox. Đang thử Private Reply...',
                        'warning',
                        5000
                    );
                }

                const facebookPostId = order.Facebook_PostId || window.purchaseFacebookPostId;
                const facebookCommentId = order.Facebook_CommentId || window.purchaseCommentId;
                const facebookASUserId = order.Facebook_ASUserId || window.purchaseFacebookASUserId || psid;
                const realFacebookPageToken = window.currentCRMTeam?.Facebook_PageToken;

                if (facebookPostId && facebookCommentId && facebookASUserId && realFacebookPageToken) {
                    console.log('[MESSAGE] Found comment context, attempting Private Reply fallback...');
                    showChatSendingIndicator('Khách chưa nhắn tin, đang thử Private Reply...');

                    try {
                        const commentIds = facebookCommentId.toString().split(',').map(id => id.trim());
                        const targetCommentId = commentIds[0];

                        const privateReplyUrl = window.API_CONFIG.buildUrl.facebookSend();

                        const privatePayload = {
                            pageId: channelId,
                            recipient: {
                                comment_id: targetCommentId
                            },
                            message: {
                                text: message
                            },
                            pageToken: realFacebookPageToken
                        };

                        console.log('[MESSAGE] Sending Private Reply (Graph API) payload:', JSON.stringify(privatePayload));

                        const prResponse = await API_CONFIG.smartFetch(privateReplyUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(privatePayload)
                        }, 1, true);

                        if (prResponse.ok) {
                            const prData = await prResponse.json();
                            if (prData.success !== false) {
                                console.log('[MESSAGE] Private Reply fallback succeeded!');
                                apiSuccess = true;
                                apiError = null;

                                if (window.notificationManager) {
                                    window.notificationManager.show('Đã gửi tin nhắn (Private Reply) thành công!', 'success');
                                }

                                autoMarkAsRead(0);
                            } else {
                                console.warn('[MESSAGE] Private Reply API error:', prData);
                            }
                        } else {
                            const errorData = await prResponse.json().catch(() => ({}));
                            console.warn('[MESSAGE] Private Reply HTTP error:', prResponse.status, errorData);
                        }
                    } catch (prError) {
                        console.error('[MESSAGE] Private Reply fallback failed:', prError);
                    }
                } else {
                    console.warn('[MESSAGE] Cannot try Private Reply: Missing context');

                    if (window.notificationManager) {
                        window.notificationManager.show(
                            'Lỗi 551: Không thể gửi inbox! Hãy dùng COMMENT để trả lời khách!',
                            'error',
                            8000
                        );
                    }
                }
            }
        }

        // If API failed, throw error
        if (!apiSuccess && apiError) {
            throw apiError;
        }

        // Step 4: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempMessage = {
            Id: `temp_${Date.now()}`,
            id: `temp_${Date.now()}`,
            Message: message,
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };

        // Add image attachments
        if (imagesDataArray && imagesDataArray.length > 0) {
            tempMessage.Attachments = imagesDataArray.map(img => ({
                Type: 'image',
                Payload: { Url: img.content_url }
            }));
        }

        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        console.log('[MESSAGE] Added optimistic message to UI');

        // Step 5: Refresh messages from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                        console.log('[MESSAGE] Replaced temp messages with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.show('Đã gửi tin nhắn thành công!', 'success');
        }

        console.log('[MESSAGE] Sent successfully');

        // Mark as replied on server (remove from pending_customers)
        const replyPsid = psid || window.currentChatPSID;
        const replyPageId = channelId || window.currentChatChannelId;
        if (replyPsid && window.newMessagesNotifier?.markReplied) {
            window.newMessagesNotifier.markReplied(replyPsid, replyPageId).then(() => {
                const row = document.querySelector(`tr[data-psid="${replyPsid}"]`);
                if (row) {
                    row.querySelectorAll('.new-msg-badge').forEach(b => b.remove());
                    row.classList.remove('pending-customer-row', 'product-row-highlight');
                }
            }).catch(err => {
                console.warn('[MESSAGE] Failed to mark replied:', err);
            });
        }

    } catch (error) {
        console.error('[MESSAGE] Error:', error);

        // Special handling for 24-hour policy error or user unavailable (551) error
        if (error.is24HourError || error.isUserUnavailable) {
            const errorType = error.is24HourError ? '24H' : '551';
            console.log(`[MESSAGE] Showing Facebook Tag fallback for ${errorType} error`);

            const originalMessage = messageData.message || '';
            const pageId = messageData.channelId || window.currentChatChannelId;

            let psid = null;

            if (window.currentRealFacebookPSID) {
                psid = window.currentRealFacebookPSID;
                console.log('[MESSAGE] Using saved real Facebook PSID:', psid);
            }
            else if (window.currentConversationId && window.pancakeDataManager) {
                const convId = window.currentConversationId;
                for (const [key, conv] of window.pancakeDataManager.inboxMapByPSID) {
                    if (conv.id === convId) {
                        psid = conv.from_psid || (conv.customers && conv.customers[0]?.fb_id);
                        if (psid) {
                            console.log('[MESSAGE] Got real PSID from cached conversation:', psid);
                            break;
                        }
                    }
                }
            }

            if (!psid) {
                psid = window.currentChatPSID;
                console.log('[MESSAGE] Using currentChatPSID as last fallback:', psid);
            }

            // Auto-send via Facebook Tag for 24h error or 551 error
            if ((error.is24HourError || error.isUserUnavailable) && originalMessage && pageId && psid) {
                const errorType = error.is24HourError ? '24h error' : '551 (user unavailable)';
                console.log(`[MESSAGE] Auto-sending via Facebook Tag for ${errorType}`);

                const imageUrls = [];
                if (messageData.uploadedImagesData && messageData.uploadedImagesData.length > 0) {
                    for (const imgData of messageData.uploadedImagesData) {
                        if (imgData.fallback_url) {
                            imageUrls.push(imgData.fallback_url);
                        }
                        else if (imgData.content_url) {
                            imageUrls.push(imgData.content_url);
                        }
                        else if (imgData.content_id || imgData.id) {
                            const contentId = imgData.content_id || imgData.id;
                            imageUrls.push(`https://content.pancake.vn/2.1-25/contents/${contentId}`);
                        }
                    }
                    console.log('[MESSAGE] Extracted image URLs for Facebook Tag:', imageUrls);
                }

                window.sendViaFacebookTagFromModal(encodeURIComponent(originalMessage), pageId, psid, imageUrls);
            } else {
                let message = error.is24HourError
                    ? 'Không thể gửi Inbox (đã quá 24h). Thử gửi qua Facebook Message Tag hoặc dùng COMMENT!'
                    : 'Không thể gửi Inbox (người dùng không có mặt). Đang thử gửi qua Facebook...';

                if (window.notificationManager) {
                    window.notificationManager.show(message, 'warning', 8000);
                } else {
                    alert(message);
                }
            }
            return;
        }

        if (window.notificationManager) {
            window.notificationManager.show('Lỗi khi gửi tin nhắn: ' + error.message, 'error');
        } else {
            alert('Lỗi khi gửi tin nhắn: ' + error.message);
        }
        throw error;
    }
}

// =====================================================
// COMMENT MODAL - Send comment functions
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Called by queue processor
 */
async function sendCommentInternal(commentData) {
    const { message, uploadedImagesData, order, conversationId, channelId, parentCommentId, postId, customerId } = commentData;

    try {
        // Get page_access_token for Official API (pages.fm)
        let pageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
        if (!pageAccessToken) {
            const activeToken = window.pancakeTokenManager?.currentToken;
            if (activeToken) {
                pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, activeToken);
            }
            if (!pageAccessToken && window.pancakeTokenManager) {
                console.log('[COMMENT] Active account cannot access page', channelId, '- trying other accounts...');
                if (Object.keys(window.pancakeTokenManager.accountPageAccessMap).length === 0) {
                    await window.pancakeTokenManager.prefetchAllAccountPages();
                }
                const fallbackAccount = window.pancakeTokenManager.findAccountWithPageAccess(channelId, window.pancakeTokenManager.activeAccountId);
                if (fallbackAccount) {
                    console.log('[COMMENT] Fallback account:', fallbackAccount.name);
                    pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, fallbackAccount.token);
                }
            }
        }
        if (!pageAccessToken) {
            throw new Error('Không tìm thấy page_access_token. Không có account nào có quyền truy cập page này.');
        }

        showChatSendingIndicator('Đang gửi bình luận...');

        // Step 1: Process single image (comments only support 1 image)
        let imageData = null;
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            const firstImage = uploadedImagesData[0];
            console.log('[COMMENT] Processing image');
            showChatSendingIndicator('Đang xử lý ảnh...');

            try {
                if ((firstImage.content_id || firstImage.id) && !firstImage.uploadFailed) {
                    console.log('[COMMENT] Using pre-uploaded image ID:', firstImage.content_id || firstImage.id);
                    imageData = firstImage;
                } else if (firstImage.blob) {
                    console.log('[COMMENT] Uploading image...');
                    const result = await window.uploadImageWithCache(
                        firstImage.blob,
                        firstImage.productId || null,
                        firstImage.productName || null,
                        channelId,
                        firstImage.productCode || null
                    );

                    if (!result.success) {
                        throw new Error(`Upload failed: ${result.error || 'Unknown error'}`);
                    }

                    console.log('[COMMENT] Image uploaded:', result.data.content_url);
                    imageData = result.data;
                }
            } catch (uploadError) {
                console.error('[COMMENT] Image processing failed:', uploadError);
                throw new Error(`Tải ảnh thất bại: ${uploadError.message}`);
            }
        }

        // Step 2: Build conversationId and validate order data
        const facebookName = order.Facebook_UserName;
        const facebookASUserId = order.Facebook_ASUserId;
        const facebookCommentId = order.Facebook_CommentId;
        const facebookPostId = order.Facebook_PostId;

        if (!facebookName || !facebookASUserId || !facebookCommentId || !facebookPostId) {
            throw new Error('Thiếu thông tin: Facebook_UserName, Facebook_ASUserId, Facebook_CommentId, hoặc Facebook_PostId');
        }

        const pageId = channelId || facebookPostId.split('_')[0];
        console.log('[COMMENT] Using pageId from selection:', pageId);

        let messageId;
        if (parentCommentId) {
            messageId = parentCommentId;
            console.log('[COMMENT] Using parentCommentId as messageId:', messageId);
        } else {
            const commentIds = facebookCommentId.split(',').map(id => id.trim());
            messageId = commentIds[0];
            console.log('[COMMENT] Using order comment ID as messageId:', messageId);
        }

        const finalConversationId = messageId;

        // Step 3: Fetch inbox_preview to get thread_id_preview, thread_key_preview, and inbox_conv_id
        let threadId = null;
        let threadKey = null;
        let inboxConvId = null;
        const fromId = facebookASUserId;

        if (customerId && window.pancakeDataManager) {
            try {
                console.log('[COMMENT] Fetching inbox_preview for thread IDs...');
                showChatSendingIndicator('Đang lấy thông tin thread...');
                const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(pageId, customerId);
                if (inboxPreview.success) {
                    threadId = inboxPreview.threadId || null;
                    threadKey = inboxPreview.threadKey || null;
                    inboxConvId = inboxPreview.inboxConversationId || null;
                    console.log('[COMMENT] Got thread IDs from inbox_preview:', { threadId, threadKey, inboxConvId });
                } else {
                    console.warn('[COMMENT] inbox_preview returned unsuccessfully, using null thread IDs');
                }
            } catch (inboxError) {
                console.warn('[COMMENT] Could not fetch inbox_preview, using null thread IDs:', inboxError.message);
            }
        } else {
            console.warn('[COMMENT] Missing customerId or pancakeDataManager, using null thread IDs');
        }

        // Step 4: Send private_replies via Official API (pages.fm)
        showChatSendingIndicator('Đang gửi tin nhắn riêng...');

        let imagePayload = {};
        if (imageData) {
            const contentId = imageData.content_id || imageData.id;
            if (contentId) {
                imagePayload = { content_ids: [contentId], attachment_type: 'PHOTO' };
            }
        }

        let sendSuccess = false;

        // Attempt 1: private_replies with comment conversation ID
        try {
            const apiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${finalConversationId}/messages`,
                pageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            const privateRepliesPayload = {
                action: 'private_replies',
                post_id: facebookPostId,
                message_id: messageId,
                from_id: fromId,
                message: message,
                ...imagePayload
            };

            console.log('[COMMENT] Attempt 1: private_replies with comment conv ID');
            console.log('[COMMENT] Payload:', JSON.stringify(privateRepliesPayload));

            const response = await API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(privateRepliesPayload)
            }, 1, true);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`private_replies failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (data.success === false) {
                throw new Error(`private_replies API error: ${data.error || data.message || 'Unknown'}`);
            }

            console.log('[COMMENT] private_replies succeeded:', data);
            sendSuccess = true;
        } catch (err) {
            console.warn('[COMMENT] private_replies failed:', err.message);
        }

        // Attempt 2: Fallback to reply_inbox on inbox conversation (if private_replies failed)
        if (!sendSuccess && inboxConvId) {
            try {
                console.log('[COMMENT] Attempt 2: reply_inbox fallback with inbox conv ID:', inboxConvId);
                showChatSendingIndicator('Đang gửi tin nhắn qua inbox...');

                const inboxApiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${pageId}/conversations/${inboxConvId}/messages`,
                    pageAccessToken
                ) + (customerId ? `&customer_id=${customerId}` : '');

                const inboxPayload = {
                    action: 'reply_inbox',
                    message: message,
                    ...imagePayload
                };

                console.log('[COMMENT] Inbox payload:', JSON.stringify(inboxPayload));

                const response = await API_CONFIG.smartFetch(inboxApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(inboxPayload)
                }, 1, true);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`reply_inbox failed: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (data.success === false) {
                    throw new Error(`reply_inbox API error: ${data.error || data.message || 'Unknown'}`);
                }

                console.log('[COMMENT] reply_inbox fallback succeeded:', data);
                sendSuccess = true;
            } catch (err2) {
                console.warn('[COMMENT] reply_inbox fallback also failed:', err2.message);
            }
        }

        if (!sendSuccess) {
            throw new Error('Gửi tin nhắn riêng thất bại (private_replies + reply_inbox fallback)');
        }

        console.log('[COMMENT] Message sent successfully!');

        // Step 6: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempComment = {
            Id: `temp_${Date.now()}`,
            Message: message,
            From: {
                Name: 'Me',
                Id: channelId
            },
            CreatedTime: now,
            is_temp: true,
            ParentId: parentCommentId
        };

        window.allChatComments.push(tempComment);
        renderComments(window.allChatComments, true);

        console.log('[COMMENT] Added optimistic comment to UI');

        // Step 6: Refresh comments from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchComments(channelId, window.currentChatPSID);
                    if (response.comments && response.comments.length > 0) {
                        window.allChatComments = window.allChatComments.filter(c => !c.is_temp);

                        response.comments.forEach(newComment => {
                            const exists = window.allChatComments.some(c => c.Id === newComment.Id);
                            if (!exists) {
                                window.allChatComments.push(newComment);
                            }
                        });

                        renderComments(window.allChatComments, false);
                        console.log('[COMMENT] Replaced temp comments with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.show('Đã gửi tin nhắn riêng thành công!', 'success');
        }

        console.log('[COMMENT] Sent successfully!');

    } catch (error) {
        console.error('[COMMENT] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi khi gửi bình luận: ' + error.message, 'error');
        } else {
            alert('Lỗi khi gửi bình luận: ' + error.message);
        }
        throw error;
    }
}

/**
 * Handle click on "Trả lời" button in comment list
 * @param {string} commentId - ID of the comment being replied to
 * @param {string} postId - Post ID of the comment
 */
function handleReplyToComment(commentId, postId) {
    console.log(`[CHAT] Replying to comment: ${commentId}, post: ${postId}`);

    const comment = window.allChatComments.find(c => (c.Id || c.id) === commentId);

    if (comment) {
        currentParentCommentId = getFacebookCommentId(comment);
        console.log(`[CHAT] Selected parent comment ID: ${currentParentCommentId} (from ${comment.Id})`);
    } else {
        currentParentCommentId = commentId;
        console.warn(`[CHAT] Could not find comment object for ${commentId}, using raw ID`);
    }

    if (postId && postId !== 'undefined' && postId !== 'null') {
        currentPostId = postId;
    } else {
        currentPostId = null;
    }

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText && comment) {
        let commentText = comment.Message || comment.message || comment.text || '';

        if (commentText.includes('<')) {
            const div = document.createElement('div');
            div.innerHTML = commentText;
            commentText = div.textContent || div.innerText || '';
        }

        const senderName = comment.FromName || comment.from?.name || 'Khách hàng';
        const fbId = comment.From?.id || comment.from?.id || comment.FromId || null;

        const timestamp = comment.CreatedTime || comment.updated_at || comment.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] Facebook ID mismatch!', {
                commentFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        const maxLength = 100;
        const truncatedText = commentText.length > maxLength
            ? commentText.substring(0, maxLength) + '...'
            : commentText;

        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncatedText}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';

        console.log('[REPLY] Showing preview for comment:', senderName, truncatedText);
    }

    // Focus input and enable it for replying
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        input.disabled = false;
        input.style.cursor = 'text';
        input.style.background = '#f9fafb';
        input.focus();
        input.placeholder = `Nhập nội dung trả lời...`;

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
        }

        input.style.borderColor = '#3b82f6';
        setTimeout(() => {
            input.style.borderColor = '#d1d5db';
        }, 1000);
    }
}

// =====================================================
// RENDER CHAT MESSAGES
// =====================================================
// References: window.currentChatCursor (from tab1-chat-core.js),
// window.allChatMessages, window.allChatComments (from tab1-chat-core.js),
// window.formatTimeVN (global utility),
// window.pancakeDataManager, window.pancakeTokenManager (global managers),
// showNewMessageIndicator (defined below)

function renderChatMessages(messages, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!messages || messages.length === 0) {
        // Don't overwrite loading state with empty state
        if (modalBody.querySelector('.chat-loading')) {
            return;
        }
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có tin nhắn</p>
            </div>`;
        // Hide ad click badge when no messages
        const adClickBadge = document.getElementById('chatAdClickBadge');
        if (adClickBadge) adClickBadge.style.display = 'none';
        return;
    }

    // Check if any message has ad_click attachment and show badge
    const hasAdClick = messages.some(msg => {
        const attachments = msg.Attachments || msg.attachments || [];
        return attachments.some(att => att.type === 'ad_click' || att.Type === 'ad_click');
    });
    const adClickBadge = document.getElementById('chatAdClickBadge');
    if (adClickBadge) {
        adClickBadge.style.display = hasAdClick ? 'inline-flex' : 'none';
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort messages by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedMessages = messages.slice().sort((a, b) => {
        const timeA = new Date(a.inserted_at || a.CreatedTime || 0).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Initialize map to store messages by ID for reply functionality
    if (!window.chatMessagesById) {
        window.chatMessagesById = {};
    }

    const messagesHTML = sortedMessages.map(msg => {
        // Store message in map for reply button lookup
        const msgId = msg.id || msg.Id || null;
        if (msgId) {
            window.chatMessagesById[msgId] = msg;
        }
        // Determine isOwner by comparing from.id with page_id (Pancake API format)
        const pageId = window.currentChatChannelId || msg.page_id || null;
        const fromId = msg.from?.id || msg.FromId || null;
        const isOwner = msg.IsOwner !== undefined ? msg.IsOwner : (fromId === pageId);
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar URL - prioritize direct URL from Pancake API
        const cachedToken = window.pancakeTokenManager?.token || null;
        // Check for direct avatar URL from Pancake (avatar, picture, profile_picture fields)
        const directAvatar = msg.from?.avatar || msg.from?.picture || msg.from?.profile_picture || msg.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = msg.from?.name || msg.FromName || '';

        // Debug: log ALL messages with reactions data to identify format
        const hasReactionData = msg.reactions || msg.reaction_summary;
        if (hasReactionData) {
            console.log('[CHAT REACTIONS DEBUG] Message with reactions:', {
                messageId: msg.id || msg.Id,
                senderName: senderName,
                reactions: msg.reactions,
                reaction_summary: msg.reaction_summary,
                allReactionFields: Object.keys(msg).filter(key => key.toLowerCase().includes('react'))
            });
        } else {
            // Log first message even without reactions to see full structure
            if (sortedMessages.indexOf(msg) === 0) {
                console.log('[CHAT REACTIONS DEBUG] First message (no reactions):', {
                    allFields: Object.keys(msg),
                    fullMessage: msg
                });
            }
        }
        // Admin name for page messages (Pancake API returns from.admin_name for staff-sent messages)
        const adminName = msg.from?.admin_name || null;

        // Get message text - prioritize original_message (plain text from Pancake API)
        let messageText = msg.original_message || msg.message || msg.Message || '';

        // If message is HTML (from Pancake's "message" field), strip HTML tags
        if (messageText && messageText.includes('<div>')) {
            messageText = messageText.replace(/<[^>]*>/g, '').trim();
        }

        let content = '';

        // Check for special message types
        const isPostReply = messageText && messageText.includes('đã trả lời về một bài viết');
        const hasPhone = msg.has_phone && msg.phone_info && msg.phone_info.length > 0;

        if (isPostReply) {
            // Post reply notification - format nicely with link
            const linkMatch = messageText.match(/https?:\/\/[^\s\)]+/);
            const linkUrl = linkMatch ? linkMatch[0] : null;
            const displayText = messageText.replace(/\s*Xem bài viết\([^)]+\)/, '').trim();

            content = `
                <div class="chat-post-reply" style="background: #f8fafc; border-left: 3px solid #8b5cf6; padding: 10px 12px; border-radius: 0 8px 8px 0;">
                    <p style="font-size: 13px; color: #475569; margin: 0;">
                        <i class="fas fa-reply" style="margin-right: 6px; color: #8b5cf6;"></i>${displayText}
                    </p>
                    ${linkUrl ? `
                        <a href="${linkUrl}" target="_blank" style="font-size: 12px; color: #3b82f6; text-decoration: none; display: inline-flex; align-items: center; margin-top: 6px;">
                            <i class="fas fa-external-link-alt" style="margin-right: 4px;"></i>Xem bài viết
                        </a>
                    ` : ''}
                </div>`;
        } else if (hasPhone && messageText) {
            // Message with phone number - show full message with phone highlight and copy button
            const phoneNumber = msg.phone_info[0].phone_number;

            // Escape HTML to prevent XSS
            let escapedMessage = messageText
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\r/g, '');

            // Highlight phone numbers in the message
            const phoneRegex = /(0[0-9]{9,10})/g;
            escapedMessage = escapedMessage.replace(phoneRegex, '<span style="background: #ecfdf5; color: #047857; font-weight: 600; padding: 1px 4px; border-radius: 4px;">$1</span>');

            content = `
                <div class="chat-phone-message-container">
                    <p class="chat-message-text" style="word-wrap: break-word; white-space: pre-wrap; margin-bottom: 8px;">${escapedMessage}</p>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="phone-highlight" style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); color: #047857; font-weight: 600; padding: 6px 12px; border-radius: 8px; font-size: 15px; letter-spacing: 0.5px; border: 1px solid #a7f3d0;">
                            <i class="fas fa-phone" style="margin-right: 6px; font-size: 12px;"></i>${phoneNumber}
                        </span>
                        <button onclick="navigator.clipboard.writeText('${phoneNumber}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Đã copy'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 1500);"
                                style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; color: #6b7280; transition: all 0.2s;">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>`;
        } else if (hasPhone) {
            // Phone number only (no message text)
            const phoneNumber = msg.phone_info[0].phone_number;
            content = `
                <div class="chat-phone-message" style="display: flex; align-items: center; gap: 8px;">
                    <span class="phone-highlight" style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); color: #047857; font-weight: 600; padding: 6px 12px; border-radius: 8px; font-size: 15px; letter-spacing: 0.5px; border: 1px solid #a7f3d0;">
                        <i class="fas fa-phone" style="margin-right: 6px; font-size: 12px;"></i>${phoneNumber}
                    </span>
                    <button onclick="navigator.clipboard.writeText('${phoneNumber}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Đã copy'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 1500);"
                            style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; color: #6b7280; transition: all 0.2s;">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>`;
        } else if (messageText) {
            // Regular text message
            // Escape HTML to prevent XSS but preserve emoji and special characters
            let escapedMessage = messageText
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\r/g, '');

            // Process URLs first, then highlight phone numbers only outside URLs
            // This prevents phone numbers inside URLs from being wrapped with spans
            const urlRegex = /(https?:\/\/[^\s<>]+)/g;
            const phoneRegex = /(0[0-9]{9,10})/g;

            // Split by URLs, process each part separately
            const urlMatches = escapedMessage.match(urlRegex) || [];
            const parts = escapedMessage.split(urlRegex);

            escapedMessage = parts.map((part, index) => {
                if (urlMatches.includes(part)) {
                    // This is a URL - convert to link without phone highlighting
                    return `<a href="${part}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${part}</a>`;
                } else {
                    // This is regular text - highlight phone numbers
                    return part.replace(phoneRegex, '<span style="background: #ecfdf5; color: #047857; font-weight: 600; padding: 1px 4px; border-radius: 4px;">$1</span>');
                }
            }).join('');

            content = `<p class="chat-message-text" style="word-wrap: break-word; white-space: pre-wrap;">${escapedMessage}</p>`;
        }

        // Handle attachments (images and audio)
        if (msg.Attachments && msg.Attachments.length > 0) {
            msg.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments (lowercase 'attachments')
        if (msg.attachments && msg.attachments.length > 0) {
            // Collect all images first for grid layout
            const images = [];

            msg.attachments.forEach(att => {
                // Collect images
                if (att.type === 'photo' && att.url) {
                    images.push(att.url);
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    images.push(att.file_url);
                }
            });

            // Render images in grid if multiple
            if (images.length > 0) {
                const gridClass = images.length === 1 ? 'chat-image-grid-single' :
                    images.length === 2 ? 'chat-image-grid-two' :
                        images.length === 3 ? 'chat-image-grid-three' :
                            'chat-image-grid-multi';

                content += `<div class="chat-image-grid ${gridClass}">`;
                images.forEach((imageUrl, idx) => {
                    const escapedUrl = imageUrl.replace(/'/g, "\\'");
                    content += `<img src="${imageUrl}"
                        class="chat-grid-image"
                        loading="lazy"
                        onclick="showImageZoom('${escapedUrl}', 'Ảnh ${idx + 1}/${images.length}')"
                        title="Click để phóng to" />`;
                });
                content += `</div>`;
            }

            // Now process other attachments
            msg.attachments.forEach(att => {
                // Skip images (already rendered)
                if ((att.type === 'photo' && att.url) ||
                    (att.mime_type && att.mime_type.startsWith('image/') && att.file_url)) {
                    return;
                }

                // Replied Message (Quoted message)
                if (att.type === 'replied_message') {
                    // Debug: Log replied_message structure to find the correct ID field
                    console.log('[REPLIED_MESSAGE] Full attachment object:', JSON.stringify(att, null, 2));

                    const quotedText = att.message || '';
                    const quotedFrom = att.from?.name || att.from?.admin_name || 'Unknown';
                    const quotedHasAttachment = att.attachments && att.attachments.length > 0;
                    const quotedMessageId = att.id || att.message_id || att.mid || '';

                    console.log('[REPLIED_MESSAGE] Extracted ID:', quotedMessageId, 'from fields:', {
                        'att.id': att.id,
                        'att.message_id': att.message_id,
                        'att.mid': att.mid
                    });

                    // Build attachment preview content
                    let attachmentPreview = '';
                    if (quotedHasAttachment) {
                        att.attachments.forEach(qAtt => {
                            // Image attachment
                            if ((qAtt.type === 'photo' && qAtt.url) ||
                                (qAtt.mime_type && qAtt.mime_type.startsWith('image/') && qAtt.file_url)) {
                                const imgUrl = qAtt.url || qAtt.file_url;
                                attachmentPreview += `
                                    <div style="margin-top: 4px;">
                                        <img src="${imgUrl}" style="max-width: 80px; max-height: 60px; border-radius: 4px; object-fit: cover;" loading="lazy" />
                                    </div>`;
                            }
                            // Audio attachment
                            else if (qAtt.mime_type === 'audio/mp4' && qAtt.file_url) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-microphone" style="margin-right: 4px;"></i>
                                        <span>Tin nhắn thoại</span>
                                    </div>`;
                            }
                            // Video attachment
                            else if ((qAtt.type === 'video_inline' || qAtt.type === 'video_direct_response' || qAtt.type === 'video') && qAtt.url) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-video" style="margin-right: 4px;"></i>
                                        <span>Video</span>
                                    </div>`;
                            }
                            // Sticker attachment
                            else if (qAtt.type === 'sticker' && (qAtt.url || qAtt.file_url)) {
                                const stickerUrl = qAtt.url || qAtt.file_url;
                                attachmentPreview += `
                                    <div style="margin-top: 4px;">
                                        <img src="${stickerUrl}" style="max-width: 50px; max-height: 50px;" loading="lazy" />
                                    </div>`;
                            }
                            // File attachment
                            else if (qAtt.type === 'file' || (qAtt.mime_type && qAtt.file_url)) {
                                const fileName = qAtt.name || 'Tệp đính kèm';
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-file" style="margin-right: 4px;"></i>
                                        <span>${fileName}</span>
                                    </div>`;
                            }
                            // Generic attachment fallback
                            else if (!attachmentPreview) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-paperclip" style="margin-right: 4px;"></i>
                                        <span>Tệp đính kèm</span>
                                    </div>`;
                            }
                        });
                    }

                    // Display text content (if any)
                    const textContent = quotedText ? `<div style="font-size: 12px; color: #374151;">${quotedText}</div>` : '';
                    const displayContent = textContent || attachmentPreview || '<div style="font-size: 12px; color: #9ca3af;">[Không có nội dung]</div>';

                    // Add click handler if we have a message ID
                    const clickHandler = quotedMessageId ? `onclick="window.scrollToMessage('${quotedMessageId}')"` : '';
                    const cursorStyle = quotedMessageId ? 'cursor: pointer;' : '';

                    content = `
                        <div class="quoted-message" ${clickHandler} style="background: #f3f4f6; border-left: 3px solid #3b82f6; padding: 8px 10px; margin-bottom: 8px; border-radius: 4px; ${cursorStyle} transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#e5e7eb'" onmouseout="this.style.backgroundColor='#f3f4f6'">
                            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">
                                <i class="fas fa-reply" style="margin-right: 4px;"></i>${quotedFrom}
                            </div>
                            ${displayContent}
                            ${textContent && attachmentPreview ? attachmentPreview : ''}
                        </div>
                    ` + content;
                    return;
                }

                // Debug: Log attachment structure to identify sticker format
                if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_share') {
                    console.log('[DEBUG STICKER] Attachment object:', JSON.stringify(att, null, 2));
                }

                // Audio: mime_type = "audio/mp4", file_url
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message" style="display: flex; align-items: center; background: #f3f4f6; padding: 10px 14px; border-radius: 20px; margin-top: 8px;">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 10px; font-size: 16px;"></i>
                            <audio controls style="height: 36px; flex: 1;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
                // Link attachment with comment (private reply preview from Pancake)
                else if (att.type === 'link' && att.comment) {
                    const commentFrom = att.comment.from || '';
                    const commentContent = att.comment.content || '';
                    const postName = att.name || '';
                    const postUrl = att.url || '#';
                    // Show post thumbnail if available
                    const thumbnail = att.post_attachments?.[0]?.url || '';
                    content += `
                        <div class="chat-link-attachment" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 8px; overflow: hidden;">
                            ${thumbnail ? `<img src="${thumbnail}" style="width: 100%; max-height: 120px; object-fit: cover; border-bottom: 1px solid #e2e8f0;" loading="lazy" />` : ''}
                            <div style="padding: 10px 12px;">
                                <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;"><i class="fas fa-comment" style="margin-right: 6px;"></i>Bình luận từ ${commentFrom}</p>
                                <p style="font-size: 13px; color: #1e293b; margin: 0 0 6px 0; font-weight: 500;">"${commentContent}"</p>
                                <a href="${postUrl}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="fas fa-external-link-alt" style="margin-right: 4px;"></i>${postName || 'Xem bài viết'}
                                </a>
                            </div>
                        </div>`;
                }
                // Video attachment
                else if ((att.type === 'video_inline' || att.type === 'video_direct_response' || att.type === 'video') && att.url) {
                    content += `
                        <div class="chat-video-attachment" style="margin-top: 8px;">
                            <img src="${att.url}" style="max-width: 100%; border-radius: 8px; cursor: pointer;" onclick="window.open('${att.url}', '_blank')" loading="lazy" />
                        </div>`;
                }
                // Sticker attachment from Messenger (type = 'sticker')
                else if (att.type === 'sticker' && (att.url || att.file_url)) {
                    const stickerUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${stickerUrl}"
                                 alt="Sticker"
                                 style="max-width: 150px; max-height: 150px;"
                                 loading="lazy"
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'color:#9ca3af;\\'>Sticker</span>';" />
                        </div>`;
                }
                // Sticker with sticker_id (alternative Pancake format)
                else if (att.sticker_id && (att.url || att.file_url)) {
                    const stickerUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${stickerUrl}"
                                 alt="Sticker"
                                 style="max-width: 150px; max-height: 150px;"
                                 loading="lazy"
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'color:#9ca3af;\\'>Sticker</span>';" />
                        </div>`;
                }
                // Animated sticker (GIF format)
                else if (att.type === 'animated_image_share' && (att.url || att.file_url)) {
                    const gifUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${gifUrl}"
                                 alt="GIF Sticker"
                                 style="max-width: 200px; max-height: 200px; border-radius: 8px;"
                                 loading="lazy" />
                        </div>`;
                }
                // Ad click attachment - show ad preview
                else if (att.type === 'ad_click') {
                    const adPhoto = att.ad_click_photo_url || att.post_attachments?.[0]?.url || '';
                    const adName = att.name || 'Quảng cáo';
                    const adUrl = att.url || '#';
                    content += `
                        <div class="chat-ad-click" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; margin-top: 8px; overflow: hidden;">
                            ${adPhoto ? `<img src="${adPhoto}" style="width: 100%; max-height: 200px; object-fit: cover;" loading="lazy" onerror="this.style.display='none'" />` : ''}
                            <div style="padding: 10px 12px;">
                                <p style="font-size: 11px; color: #0284c7; margin: 0 0 4px 0; font-weight: 500;">
                                    <i class="fas fa-ad" style="margin-right: 6px;"></i>Đã click vào quảng cáo
                                </p>
                                <p style="font-size: 13px; color: #1e293b; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${adName}
                                </p>
                                <a href="${adUrl}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; display: inline-block; margin-top: 6px;">
                                    <i class="fas fa-external-link-alt" style="margin-right: 4px;"></i>Xem bài viết
                                </a>
                            </div>
                        </div>`;
                }
            });
        }

        // Handle reactions display
        let reactionsHTML = '';

        // Collect reactions from attachments (Pancake API format)
        const reactionAttachments = [];
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                if (att.type === 'reaction' && att.emoji) {
                    reactionAttachments.push(att.emoji);
                }
            });
        }

        // Collect reactions from msg.reactions or msg.reaction_summary
        const reactions = msg.reactions || msg.reaction_summary;
        const reactionsArray = [];

        if (reactions && Object.keys(reactions).length > 0) {
            const reactionIcons = {
                'LIKE': '\ud83d\udc4d',
                'LOVE': '\u2764\ufe0f',
                'HAHA': '\ud83d\ude06',
                'WOW': '\ud83d\ude2e',
                'SAD': '\ud83d\ude22',
                'ANGRY': '\ud83d\ude20',
                'CARE': '\ud83e\udd17'
            };

            Object.entries(reactions)
                .filter(([type, count]) => count > 0)
                .forEach(([type, count]) => {
                    const emoji = reactionIcons[type] || '\ud83d\udc4d';
                    reactionsArray.push(`<span style="display: inline-flex; align-items: center; background: #fef3c7; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px;">
                        ${emoji} ${count > 1 ? count : ''}
                    </span>`);
                });
        }

        // Add reactions from attachments
        if (reactionAttachments.length > 0) {
            reactionAttachments.forEach(emoji => {
                reactionsArray.push(`<span style="display: inline-flex; align-items: center; background: #fef3c7; padding: 2px 8px; border-radius: 12px; font-size: 14px; margin-right: 4px;">
                    ${emoji}
                </span>`);
            });
        }

        // Build final reactions HTML
        if (reactionsArray.length > 0) {
            reactionsHTML = `<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">${reactionsArray.join('')}</div>`;
        }

        // Reply button for customer messages
        const messageId = msg.id || msg.Id || null;
        const replyButton = !isOwner && messageId ? `
            <span class="message-reply-btn"
                  onclick="window.setReplyMessageById('${messageId}')"
                  style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">
                Trả lời
            </span>
        ` : '';

        // Avatar HTML - only show for customer messages (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}'); event.stopPropagation();"
                 onload="this.classList.remove('avatar-loading')"
                 onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%23e5e7eb%22/><circle cx=%2224%22 cy=%2218%22 r=%228%22 fill=%22%239ca3af%22/><ellipse cx=%2224%22 cy=%2238%22 rx=%2213%22 ry=%2210%22 fill=%22%239ca3af%22/></svg>'"
            />
        ` : '';

        return `
            <div class="chat-message ${alignClass}" style="display: flex; align-items: flex-start;">
                ${!isOwner ? avatarHTML : ''}
                <div style="flex: 1; ${isOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                    <div class="chat-bubble ${bgClass}">
                        ${!isOwner && senderName ? `<p style="font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${senderName}</p>` : ''}
                        ${isOwner && adminName ? `<p style="font-size: 10px; font-weight: 500; color: #9ca3af; margin: 0 0 4px 0; text-align: right;"><i class="fas fa-user-tie" style="margin-right: 4px; font-size: 9px;"></i>${adminName}</p>` : ''}
                        ${content}
                        ${reactionsHTML}
                        <p class="chat-message-time">
                            ${formatTime(msg.inserted_at || msg.CreatedTime)}
                            ${replyButton}
                        </p>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more messages to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm tin nhắn</span>
            </div>`;
    } else if (window.allChatMessages.length > 0 && !currentChatCursor) {
        // No more messages (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết tin nhắn cũ
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${messagesHTML}</div>`;

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalBody.scrollTop = modalBody.scrollHeight;
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

function renderComments(comments, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!comments || comments.length === 0) {
        // Don't overwrite loading state with empty state
        if (modalBody.querySelector('.chat-loading')) {
            return;
        }
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có bình luận</p>
            </div>`;
        return;
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort comments by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedComments = comments.slice().sort((a, b) => {
        const timeA = new Date(a.CreatedTime || a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.CreatedTime || b.updated_at || b.created_at || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Helper function to check if comment is the purchase comment
    const isPurchaseComment = (comment) => {
        if (!window.purchaseCommentId) return false;

        // Get comment ID (handle different formats)
        const commentId = comment.FacebookId || comment.OriginalId || comment.Id || comment.id;

        // Facebook_CommentId format: "postId_commentId" (e.g., "1672237127083024_2168976250601862")
        // Extract just the comment ID part for comparison
        const purchaseIdParts = window.purchaseCommentId.split('_');
        const purchaseCommentOnlyId = purchaseIdParts.length > 1 ? purchaseIdParts[purchaseIdParts.length - 1] : window.purchaseCommentId;

        // Check if this comment matches the purchase comment
        if (commentId === window.purchaseCommentId) return true;
        if (commentId === purchaseCommentOnlyId) return true;

        // Also check if commentId contains the purchase comment ID
        if (commentId && commentId.includes(purchaseCommentOnlyId)) return true;

        // Check full format match (postId_commentId)
        // Support both uppercase (PostId) and lowercase (post_id) field names from Pancake API
        const fullCommentId = `${comment.PostId || comment.post_id || ''}_${commentId}`;
        if (fullCommentId === window.purchaseCommentId) return true;

        return false;
    };

    const commentsHTML = sortedComments.map(comment => {
        // Handle both old format (IsOwner) and Pancake API format (is_owner)
        const isOwner = comment.IsOwner || comment.is_owner || false;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar URL for comments (same logic as messages)
        const cachedToken = window.pancakeTokenManager?.token || null;
        const pageId = window.currentChatChannelId || comment.page_id || null;
        const fromId = comment.from?.id || comment.FromId || null;
        const directAvatar = comment.from?.avatar || comment.from?.picture || comment.from?.profile_picture || comment.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = comment.from?.name || comment.FromName || '';

        // Check if this is the purchase comment (comment where user made the order)
        const isPurchase = isPurchaseComment(comment);
        const purchaseHighlightClass = isPurchase ? 'purchase-comment-highlight' : '';
        const purchaseBadge = isPurchase ? '<span class="purchase-badge"><i class="fas fa-shopping-cart"></i> Bình luận đặt hàng</span>' : '';

        let content = '';
        // Handle both old format (Message) and Pancake API format (message)
        const messageText = comment.Message || comment.message || '';
        if (messageText) {
            content = `<p class="chat-message-text">${messageText}</p>`;
        }

        // Handle attachments (images and audio) for comments
        if (comment.Attachments && comment.Attachments.length > 0) {
            comment.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments for comments
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(att => {
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        // Status badge for unread comments
        const statusBadge = comment.Status === 30
            ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Mới</span>'
            : '';

        // Render nested replies if any
        let repliesHTML = '';
        if (comment.Messages && comment.Messages.length > 0) {
            repliesHTML = comment.Messages.map(reply => {
                // Handle both old format (IsOwner) and Pancake API format (is_owner)
                const replyIsOwner = reply.IsOwner || reply.is_owner || false;
                const replyAlignClass = replyIsOwner ? 'chat-message-right' : 'chat-message-left';
                const replyBgClass = replyIsOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

                // Get avatar URL for reply
                const replyFromId = reply.from?.id || reply.FromId || null;
                const replyDirectAvatar = reply.from?.avatar || reply.from?.picture || reply.from?.profile_picture || reply.avatar || null;
                const replyAvatarUrl = window.pancakeDataManager?.getAvatarUrl(replyFromId, pageId, cachedToken, replyDirectAvatar) ||
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
                const replySenderName = reply.from?.name || reply.FromName || '';

                let replyContent = '';
                // Handle both old format (Message) and Pancake API format (message)
                const replyMessageText = reply.Message || reply.message || '';
                if (replyMessageText) {
                    replyContent = `<p class="chat-message-text">${replyMessageText}</p>`;
                }

                // Handle attachments in replies
                if (reply.Attachments && reply.Attachments.length > 0) {
                    reply.Attachments.forEach(att => {
                        if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                            replyContent += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                        } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.Payload.Url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        }
                    });
                }

                // Handle Pancake API format in replies
                if (reply.attachments && reply.attachments.length > 0) {
                    reply.attachments.forEach(att => {
                        if (att.mime_type === 'audio/mp4' && att.file_url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.file_url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                            replyContent += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                        }
                    });
                }

                // Handle both old format (CreatedTime) and Pancake API format (inserted_at/created_at/updated_at)
                const replyTimestamp = reply.inserted_at || reply.CreatedTime || reply.created_at || reply.updated_at || new Date();

                // Avatar HTML for reply
                const replyAvatarHTML = !replyIsOwner ? `
                    <img src="${replyAvatarUrl}"
                         alt="${replySenderName}"
                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 8px; border: 2px solid #e5e7eb; background: #f3f4f6;"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><circle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%23e5e7eb%22/><circle cx=%2216%22 cy=%2212%22 r=%225%22 fill=%22%239ca3af%22/><ellipse cx=%2216%22 cy=%2224%22 rx=%228%22 ry=%226%22 fill=%22%239ca3af%22/></svg>'"
                    />
                ` : '';

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px; display: flex; align-items: flex-start;">
                        ${!replyIsOwner ? replyAvatarHTML : ''}
                        <div style="flex: 1; ${replyIsOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                            <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                                ${!replyIsOwner && replySenderName ? `<p style="font-size: 10px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${replySenderName}</p>` : ''}
                                ${replyContent}
                                <p class="chat-message-time">${formatTime(replyTimestamp)}</p>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        // Handle both old format (CreatedTime) and Pancake API format (inserted_at/created_at/updated_at)
        const timestamp = comment.inserted_at || comment.CreatedTime || comment.created_at || comment.updated_at || new Date();

        // Avatar HTML - only show for customer comments (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}'); event.stopPropagation();"
                 onload="this.classList.remove('avatar-loading')"
                 onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%23e5e7eb%22/><circle cx=%2224%22 cy=%2218%22 r=%228%22 fill=%22%239ca3af%22/><ellipse cx=%2224%22 cy=%2238%22 rx=%2213%22 ry=%2210%22 fill=%22%239ca3af%22/></svg>'"
            />
        ` : '';

        return `
            <div class="chat-message ${alignClass} ${purchaseHighlightClass}" data-comment-id="${comment.Id || comment.id || ''}" style="display: flex; align-items: flex-start;">
                ${!isOwner ? avatarHTML : ''}
                <div style="flex: 1; ${isOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                    ${purchaseBadge}
                    <div class="chat-bubble ${bgClass}">
                        ${!isOwner && senderName ? `<p style="font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${senderName}</p>` : ''}
                        ${content}
                        <p class="chat-message-time">
                            ${formatTime(timestamp)} ${statusBadge}
                            ${!isOwner ? `<span class="reply-btn" onclick="handleReplyToComment('${comment.Id || comment.id}', '${comment.PostId || comment.post_id || ''}')" style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">Trả lời</span>` : ''}
                        </p>
                    </div>
                </div>
            </div>
            ${repliesHTML}`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more comments to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm bình luận</span>
            </div>`;
    } else if (window.allChatComments.length > 0 && !currentChatCursor) {
        // No more comments (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết bình luận cũ
            </div>`;
    }

    // Add post/video context at the top if available
    let postContext = '';
    if (comments[0] && comments[0].Object) {
        const obj = comments[0].Object;
        postContext = `
            <div style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
                    <i class="fas fa-video"></i> ${obj.ObjectType === 1 ? 'Video' : 'Bài viết'} Live
                </div>
                <div style="font-size: 13px; font-weight: 500; color: #1f2937;">
                    ${obj.Description || obj.Title || 'Không có mô tả'}
                </div>
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Check if there's a purchase comment to scroll to (only on initial load)
    const purchaseCommentElement = modalBody.querySelector('.purchase-comment-highlight');

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Priority: scroll to purchase comment if exists, otherwise scroll to bottom
                if (purchaseCommentElement && scrollToBottom) {
                    // Scroll to purchase comment with smooth behavior
                    purchaseCommentElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    console.log('[CHAT] Scrolled to purchase comment');
                } else {
                    modalBody.scrollTop = modalBody.scrollHeight;
                }
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

// =====================================================
// NEW MESSAGE INDICATOR
// =====================================================

/**
 * Show visual indicator for new messages (without flash animation)
 */
function showNewMessageIndicator() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Check if indicator already exists
    let indicator = document.getElementById('chatNewMessageIndicator');

    if (!indicator) {
        // Create indicator element
        indicator = document.createElement('div');
        indicator.id = 'chatNewMessageIndicator';
        indicator.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 20px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                border-radius: 24px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.5)';"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)';">
                <i class="fas fa-arrow-down" style="font-size: 12px;"></i>
                <span>Tin nhắn mới</span>
            </div>
        `;

        // Position indicator at bottom center
        indicator.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10;
            display: none;
        `;

        // Scroll to bottom when clicked
        indicator.onclick = () => {
            modalBody.scrollTo({
                top: modalBody.scrollHeight,
                behavior: 'smooth'
            });
            indicator.style.display = 'none';
        };

        // Append to modal body's parent to position it correctly
        const chatModal = document.getElementById('chatModal');
        const modalContent = chatModal?.querySelector('.modal-body');
        if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.appendChild(indicator);
        }
    }

    // Show indicator with smooth appearance (no flash)
    indicator.style.display = 'block';
}

/**
 * Setup scroll listener to auto-hide indicator when user scrolls to bottom
 */
function setupNewMessageIndicatorListener() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    modalBody.addEventListener('scroll', () => {
        const isAtBottom = (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
        const indicator = document.getElementById('chatNewMessageIndicator');

        if (indicator && isAtBottom) {
            indicator.style.display = 'none';
        }
    });
}

// Expose rendering functions globally
window.renderChatMessages = renderChatMessages;
window.renderComments = renderComments;
window.showNewMessageIndicator = showNewMessageIndicator;
window.setupNewMessageIndicatorListener = setupNewMessageIndicatorListener;
window.handleReplyToComment = handleReplyToComment;
window.handleChatInputKeyDown = handleChatInputKeyDown;
window.handleChatInputInput = handleChatInputInput;
window.autoResizeTextarea = autoResizeTextarea;
window.extractMessageText = extractMessageText;

console.log('[Tab1-Chat-Messages] Loaded successfully.');
