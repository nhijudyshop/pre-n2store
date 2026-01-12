// =====================================================
// COMMENT MODAL - Separate modal for comments
// =====================================================

// Comment Modal State
let commentModalOrder = null;
let commentModalChannelId = null;
let commentModalPSID = null;
let commentModalComments = [];
let commentModalCursor = null;
let commentModalParentId = null;
let isLoadingMoreComments = false;
let commentModalThreadId = null;
let commentModalThreadKey = null;
let commentModalInboxConvId = null; // Inbox conversation ID for private replies
let commentReplyType = 'private_replies'; // 'private_replies' or 'reply_comment'

/**
 * Open the Comment Modal
 * Now redirects to unified chat modal with COMMENT type
 */
window.openCommentModal = async function (orderId, channelId, psid) {
    console.log('[COMMENT MODAL] Redirecting to unified chat modal with COMMENT type:', { orderId, channelId, psid });

    // Use the unified chat modal with 'comment' type
    // This allows users to toggle between INBOX and COMMENT views
    return window.openChatModal(orderId, channelId, psid, 'comment');

    // Update modal title
    document.getElementById('commentModalTitle').textContent = `Bình luận với ${order.Name}`;
    document.getElementById('commentModalSubtitle').textContent = `SĐT: ${order.Telephone || 'N/A'} • Mã ĐH: ${order.Code}`;

    // Show modal
    document.getElementById('commentModal').classList.add('show');

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Show loading
    const modalBody = document.getElementById('commentModalBody');
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải bình luận...</p>
        </div>`;

    // Fetch order details from TPOS to get Facebook_CommentId
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
        const response = await API_CONFIG.smartFetch(apiUrl, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        if (response.ok) {
            const fullOrderData = await response.json();
            window.purchaseFacebookPostId = fullOrderData.Facebook_PostId || null;
            window.purchaseFacebookASUserId = fullOrderData.Facebook_ASUserId || null;
            window.purchaseCommentId = fullOrderData.Facebook_CommentId || null;

            console.log('[COMMENT MODAL] Order Facebook data loaded:', {
                PostId: window.purchaseFacebookPostId,
                ASUserId: window.purchaseFacebookASUserId,
                CommentId: window.purchaseCommentId
            });
        }
    } catch (error) {
        console.error('[COMMENT MODAL] Error loading order details:', error);
    }

    // Setup reply input
    setupCommentReplyInput();

    // Fetch comments
    try {
        // Truyền postId và customerName để search conversation nếu không tìm thấy trong cache
        const postId = window.purchaseFacebookPostId;
        const customerName = order.Facebook_UserName;
        const response = await window.chatDataManager.fetchComments(channelId, psid, null, postId, customerName);
        commentModalComments = response.comments || [];
        commentModalCursor = response.after;

        // Save customerId for reply comment to use in inbox_preview fetch
        if (response.customerId) {
            window.currentCustomerUUID = response.customerId;
            console.log('[COMMENT MODAL] ✅ Saved currentCustomerUUID:', window.currentCustomerUUID);
        } else {
            console.warn('[COMMENT MODAL] ⚠️ No customerId returned from fetchComments');
        }

        if (commentModalComments.length > 0) {
            const rootComment = commentModalComments.find(c => !c.ParentId) || commentModalComments[0];
            if (rootComment && rootComment.Id) {
                commentModalParentId = getFacebookCommentIdForModal(rootComment);
            }
        }

        renderCommentModalComments(commentModalComments, true);

        // Add scroll listener for pagination
        modalBody.addEventListener('scroll', handleCommentModalScroll);

    } catch (error) {
        console.error('[COMMENT MODAL] Error loading comments:', error);
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Lỗi tải bình luận: ${error.message}</p>
            </div>`;
    }
};

/**
 * Close the Comment Modal
 */
window.closeCommentModal = function () {
    document.getElementById('commentModal').classList.remove('show');

    // Restore body scroll when modal is closed
    document.body.style.overflow = '';

    // Clean up scroll listener
    const modalBody = document.getElementById('commentModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleCommentModalScroll);
    }

    // Reset state
    commentModalOrder = null;
    commentModalChannelId = null;
    commentModalPSID = null;
    commentModalComments = [];
    commentModalCursor = null;
    commentModalParentId = null;
    isLoadingMoreComments = false;
    commentModalThreadId = null;
    commentModalThreadKey = null;

    // Reset purchase comment state
    window.purchaseCommentId = null;
    window.purchaseFacebookPostId = null;
    window.purchaseFacebookASUserId = null;

    // Reset reply state
    cancelCommentReply();
};

/**
 * Setup reply input for comment modal
 */
function setupCommentReplyInput() {
    const replyInput = document.getElementById('commentReplyInput');
    const sendBtn = document.getElementById('commentSendBtn');

    // Disable by default - need to select a comment to reply
    replyInput.disabled = true;
    replyInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
    replyInput.style.background = '#f3f4f6';
    replyInput.style.cursor = 'not-allowed';
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
    sendBtn.style.cursor = 'not-allowed';

    // Clear previous input
    replyInput.value = '';

    // Add keydown listener
    replyInput.onkeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCommentReply();
        }
    };
}

/**
 * Handle scroll for loading more comments
 */
function handleCommentModalScroll() {
    if (isLoadingMoreComments || !commentModalCursor) return;

    const modalBody = document.getElementById('commentModalBody');
    if (modalBody.scrollTop < 100) {
        loadMoreComments();
    }
}

/**
 * Load more comments (pagination)
 */
async function loadMoreComments() {
    if (isLoadingMoreComments || !commentModalCursor) return;

    isLoadingMoreComments = true;
    const loadIndicator = document.getElementById('commentLoadMoreIndicator');
    if (loadIndicator) {
        loadIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
    }

    try {
        const response = await window.chatDataManager.fetchComments(
            commentModalChannelId,
            commentModalPSID,
            commentModalCursor,
            window.purchaseFacebookPostId,
            commentModalOrder?.Facebook_UserName
        );

        const newComments = response.comments || [];
        commentModalCursor = response.after;

        // Add new comments to beginning
        const existingIds = new Set(commentModalComments.map(c => c.id || c.Id));
        const uniqueNewComments = newComments.filter(c => !existingIds.has(c.id || c.Id));

        if (uniqueNewComments.length > 0) {
            commentModalComments = [...uniqueNewComments, ...commentModalComments];
            renderCommentModalComments(commentModalComments, false);
        }
    } catch (error) {
        console.error('[COMMENT MODAL] Error loading more comments:', error);
    } finally {
        isLoadingMoreComments = false;
    }
}

/**
 * Helper function to get Facebook comment ID
 */
function getFacebookCommentIdForModal(comment) {
    if (comment.FacebookId) return comment.FacebookId;
    if (comment.OriginalId) return comment.OriginalId;
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(comment.Id);
    if (comment.Id && !isMongoId) return comment.Id;
    return comment.Id;
}

/**
 * Check if comment is the purchase comment
 */
function isPurchaseCommentCheck(comment) {
    if (!window.purchaseCommentId) return false;

    const commentId = comment.FacebookId || comment.OriginalId || comment.Id || comment.id;
    const purchaseIdParts = window.purchaseCommentId.split('_');
    const purchaseCommentOnlyId = purchaseIdParts.length > 1 ? purchaseIdParts[purchaseIdParts.length - 1] : window.purchaseCommentId;

    if (commentId === window.purchaseCommentId) return true;
    if (commentId === purchaseCommentOnlyId) return true;
    if (commentId && commentId.includes && commentId.includes(purchaseCommentOnlyId)) return true;

    const fullCommentId = `${comment.PostId || ''}_${commentId}`;
    if (fullCommentId === window.purchaseCommentId) return true;

    return false;
}

/**
 * Render comments in the modal
 */
function renderCommentModalComments(comments, scrollToPurchase = false) {
    const modalBody = document.getElementById('commentModalBody');

    if (!comments || comments.length === 0) {
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
        const timeA = new Date(a.inserted_at || a.CreatedTime || 0).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    const commentsHTML = sortedComments.map(comment => {
        // Determine isOwner by comparing from.id with page_id (Pancake API format)
        const pageId = commentModalChannelId || comment.page_id || comment.PostId?.split('_')[0] || null;
        const fromId = comment.from?.id || comment.FromId || null;
        const isOwner = comment.IsOwner !== undefined ? comment.IsOwner : (fromId === pageId);
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Check if purchase comment
        const isPurchase = isPurchaseCommentCheck(comment);
        const purchaseHighlightClass = isPurchase ? 'purchase-comment-highlight' : '';
        const purchaseBadge = isPurchase ? '<span class="purchase-badge"><i class="fas fa-shopping-cart"></i> Bình luận đặt hàng</span>' : '';

        // Get avatar URL - prioritize direct URL from Pancake API
        const cachedToken = window.pancakeTokenManager?.token || null;
        // Check for direct avatar URL from Pancake (avatar, picture, profile_picture fields)
        const directAvatar = comment.from?.avatar || comment.from?.picture || comment.from?.profile_picture || comment.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = comment.from?.name || comment.FromName || '';

        // Debug: log first comment to see structure
        if (sortedComments.indexOf(comment) === 0) {
            console.log('[COMMENT MODAL] First comment object:', comment);
            console.log('[COMMENT MODAL] from:', comment.from, 'fromId:', fromId, 'isOwner:', isOwner);
            // Debug reactions format
            if (comment.reactions || comment.reaction_summary) {
                console.log('[COMMENT MODAL DEBUG] Reactions data:', {
                    reactions: comment.reactions,
                    reaction_summary: comment.reaction_summary
                });
            }
        }

        // Get message text - prioritize original_message (plain text from Pancake API)
        let messageText = comment.original_message || comment.message || comment.Message || '';

        // If message is HTML (from Pancake's "message" field), strip HTML tags
        if (messageText && messageText.includes('<div>')) {
            messageText = messageText.replace(/<[^>]*>/g, '').trim();
        }

        let content = '';
        if (messageText) {
            // Escape HTML to prevent XSS and display issues
            let escapedMessage = messageText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\r/g, '');

            // Convert URLs to clickable links
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            escapedMessage = escapedMessage.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">$1</a>');

            content = `<p class="chat-message-text">${escapedMessage}</p>`;
        }

        // Handle attachments
        if (comment.Attachments && comment.Attachments.length > 0) {
            comment.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        // Handle Pancake API format attachments (lowercase 'attachments')
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(att => {
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
                // Photo: type = "photo", url
                else if (att.type === 'photo' && att.url) {
                    content += `<img src="${att.url}" class="chat-message-image" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-top: 8px; cursor: pointer;" onclick="window.open('${att.url}', '_blank')" />`;
                }
                // Image with mime_type
                else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-top: 8px; cursor: pointer;" onclick="window.open('${att.file_url}', '_blank')" />`;
                }
                // Sticker attachment from Messenger (type = 'sticker')
                else if (att.type === 'sticker' && (att.url || att.file_url)) {
                    const stickerUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${stickerUrl}"
                                 alt="Sticker"
                                 style="max-width: 150px; max-height: 150px;"
                                 loading="lazy" />
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
                                 loading="lazy" />
                        </div>`;
                }
                // Animated sticker (GIF)
                else if (att.type === 'animated_image_share' && (att.url || att.file_url)) {
                    const gifUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${gifUrl}"
                                 alt="GIF"
                                 style="max-width: 200px; max-height: 200px; border-radius: 8px;"
                                 loading="lazy" />
                        </div>`;
                }
            });
        }

        // Handle reactions display
        let reactionsHTML = '';
        const reactions = comment.reactions || comment.reaction_summary;
        if (reactions && Object.keys(reactions).length > 0) {
            const reactionIcons = {
                'LIKE': '👍',
                'LOVE': '❤️',
                'HAHA': '😆',
                'WOW': '😮',
                'SAD': '😢',
                'ANGRY': '😠',
                'CARE': '🤗'
            };

            const reactionsArray = Object.entries(reactions)
                .filter(([type, count]) => count > 0)
                .map(([type, count]) => {
                    const emoji = reactionIcons[type] || '👍';
                    return `<span style="display: inline-flex; align-items: center; background: #fef3c7; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px;">
                        ${emoji} ${count > 1 ? count : ''}
                    </span>`;
                });

            if (reactionsArray.length > 0) {
                reactionsHTML = `<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">${reactionsArray.join('')}</div>`;
            }
        }

        // Status badge
        const statusBadge = comment.Status === 30
            ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Mới</span>'
            : '';

        // Render nested replies
        let repliesHTML = '';
        if (comment.Messages && comment.Messages.length > 0) {
            repliesHTML = comment.Messages.map(reply => {
                const replyIsOwner = reply.IsOwner;
                const replyAlignClass = replyIsOwner ? 'chat-message-right' : 'chat-message-left';
                const replyBgClass = replyIsOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

                // Get avatar for reply - prioritize direct URL from Pancake API
                const replyFromId = reply.from?.id || reply.FromId || null;
                const replyDirectAvatar = reply.from?.avatar || reply.from?.picture || reply.from?.profile_picture || reply.avatar || null;
                const replyAvatarUrl = window.pancakeDataManager?.getAvatarUrl(replyFromId, pageId, cachedToken, replyDirectAvatar) ||
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
                const replySenderName = reply.from?.name || reply.FromName || '';

                // Avatar HTML for reply - only show for customer replies
                const replyAvatarHTML = !replyIsOwner ? `
                    <img src="${replyAvatarUrl}"
                         alt="${replySenderName}"
                         title="Click để phóng to - ${replySenderName}"
                         class="avatar-loading chat-avatar-clickable"
                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 8px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                         onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)'"
                         onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                         onclick="openAvatarZoom('${replyAvatarUrl}', '${replySenderName.replace(/'/g, "\\'")}')); event.stopPropagation();"
                         onload="this.classList.remove('avatar-loading')"
                         onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><circle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%23e5e7eb%22/><circle cx=%2216%22 cy=%2212%22 r=%226%22 fill=%22%239ca3af%22/><ellipse cx=%2216%22 cy=%2226%22 rx=%229%22 ry=%227%22 fill=%22%239ca3af%22/></svg>'"
                    />
                ` : '';

                let replyContent = '';
                if (reply.Message) {
                    replyContent = `<p class="chat-message-text">${reply.Message}</p>`;
                }

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px; display: flex; align-items: flex-start;">
                        ${!replyIsOwner ? replyAvatarHTML : ''}
                        <div style="flex: 1; ${replyIsOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                            <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                                ${!replyIsOwner && replySenderName ? `<p style="font-size: 10px; font-weight: 600; color: #6b7280; margin: 0 0 2px 0;">${replySenderName}</p>` : ''}
                                ${replyContent}
                                <p class="chat-message-time">${formatTime(reply.inserted_at || reply.CreatedTime)}</p>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        // Avatar HTML - only show for customer messages (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}')); event.stopPropagation();"
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
                        ${reactionsHTML}
                        <p class="chat-message-time">
                            ${formatTime(comment.inserted_at || comment.CreatedTime)} ${statusBadge}
                            ${!isOwner ? `<span class="comment-reply-btn" onclick="handleCommentModalReply('${comment.Id}', '${comment.PostId || ''}')" style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">Trả lời</span>` : ''}
                        </p>
                    </div>
                </div>
            </div>
            ${repliesHTML}`;
    }).join('');

    // Loading indicator
    let loadingIndicator = '';
    if (commentModalCursor) {
        loadingIndicator = `
            <div id="commentLoadMoreIndicator" style="
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
    }

    // Post context
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

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Scroll to purchase comment or bottom
    if (scrollToPurchase) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const purchaseElement = modalBody.querySelector('.purchase-comment-highlight');
                if (purchaseElement) {
                    purchaseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    console.log('[COMMENT MODAL] Scrolled to purchase comment');
                } else {
                    modalBody.scrollTop = modalBody.scrollHeight;
                }
            });
        });
    }
}

/**
 * Handle reply to comment
 */
window.handleCommentModalReply = async function (commentId, postId) {
    console.log('[COMMENT MODAL] Reply to comment:', commentId, postId);

    // Find the comment
    const comment = commentModalComments.find(c => c.Id === commentId || c.id === commentId);
    if (!comment) {
        console.warn('[COMMENT MODAL] Comment not found:', commentId);
        return;
    }

    // Store the parent comment ID for reply
    commentModalParentId = getFacebookCommentIdForModal(comment);

    // Reset thread IDs and inbox conversation ID
    commentModalThreadId = null;
    commentModalThreadKey = null;
    commentModalInboxConvId = null;

    // Fetch inbox_preview to get thread_id, thread_key, and inbox_conv_id
    if (window.currentCustomerUUID && window.pancakeDataManager && commentModalChannelId) {
        try {
            console.log('[COMMENT MODAL] Fetching inbox_preview for thread IDs...');
            const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(commentModalChannelId, window.currentCustomerUUID);
            if (inboxPreview.success) {
                commentModalThreadId = inboxPreview.threadId || null;
                commentModalThreadKey = inboxPreview.threadKey || null;
                commentModalInboxConvId = inboxPreview.inboxConversationId || null;
                console.log('[COMMENT MODAL] ✅ Got IDs from inbox_preview:', {
                    threadId: commentModalThreadId,
                    threadKey: commentModalThreadKey,
                    inboxConvId: commentModalInboxConvId
                });
            } else {
                console.warn('[COMMENT MODAL] ⚠️ inbox_preview returned unsuccessfully');
            }
        } catch (inboxError) {
            console.warn('[COMMENT MODAL] ⚠️ Could not fetch inbox_preview:', inboxError.message);
        }
    } else {
        console.warn('[COMMENT MODAL] ⚠️ Missing customerId or pancakeDataManager, cannot fetch thread IDs');
    }

    // Show reply preview
    const previewContainer = document.getElementById('commentReplyPreviewContainer');
    const previewText = document.getElementById('commentReplyPreviewText');
    previewText.textContent = comment.Message || '[Hình ảnh/Media]';
    previewContainer.style.display = 'block';

    // Enable reply input
    const replyInput = document.getElementById('commentReplyInput');
    const sendBtn = document.getElementById('commentSendBtn');

    replyInput.disabled = false;
    replyInput.placeholder = 'Nhập tin nhắn trả lời... (Enter để gửi)';
    replyInput.style.background = 'white';
    replyInput.style.cursor = 'text';
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
    sendBtn.style.cursor = 'pointer';

    replyInput.focus();
};

/**
 * Cancel reply
 */
window.cancelCommentReply = function () {
    const previewContainer = document.getElementById('commentReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    const replyInput = document.getElementById('commentReplyInput');
    const sendBtn = document.getElementById('commentSendBtn');

    if (replyInput) {
        replyInput.value = '';
        replyInput.disabled = true;
        replyInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        replyInput.style.background = '#f3f4f6';
        replyInput.style.cursor = 'not-allowed';
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
    }

    commentModalParentId = null;
    commentReplyType = 'private_replies'; // Reset to default
};

/**
 * Set the reply type (toggle between reply_comment and private_replies)
 * @param {string} type - 'reply_comment' or 'private_replies'
 */
window.setCommentReplyType = function (type) {
    commentReplyType = type;

    const btnPublic = document.getElementById('btnReplyPublic');
    const btnPrivate = document.getElementById('btnReplyPrivate');
    const replyInput = document.getElementById('commentReplyInput');

    if (type === 'reply_comment') {
        // Public reply selected
        btnPublic.style.border = '2px solid #22c55e';
        btnPublic.style.background = '#f0fdf4';
        btnPublic.style.color = '#16a34a';

        btnPrivate.style.border = '2px solid #e5e7eb';
        btnPrivate.style.background = 'white';
        btnPrivate.style.color = '#374151';

        if (replyInput) {
            replyInput.placeholder = 'Nhập nội dung reply công khai trên post...';
        }
    } else {
        // Private reply selected
        btnPrivate.style.border = '2px solid #3b82f6';
        btnPrivate.style.background = '#eff6ff';
        btnPrivate.style.color = '#3b82f6';

        btnPublic.style.border = '2px solid #e5e7eb';
        btnPublic.style.background = 'white';
        btnPublic.style.color = '#374151';

        if (replyInput) {
            replyInput.placeholder = 'Nhập tin nhắn riêng qua Messenger...';
        }
    }

    console.log('[COMMENT MODAL] Reply type set to:', type);
};

/**
 * Send reply comment (supports both reply_comment and private_replies)
 *
 * Pancake API format:
 * - URL: /pages/{pageId}/conversations/{conversationId}/messages
 * - Body: JSON with action "reply_comment" or "private_replies"
 *
 * reply_comment: Reply công khai trên post
 * - Required: action, message_id (comment_id), message
 * - Optional: content_url (image URL), mentions
 *
 * private_replies: Gửi tin nhắn riêng qua Messenger
 * - Required: action, post_id, message_id, from_id, message
 */
window.sendCommentReply = async function () {
    const replyInput = document.getElementById('commentReplyInput');
    const message = replyInput.value.trim();

    if (!message) {
        alert('Vui lòng nhập nội dung trả lời');
        return;
    }

    if (!commentModalParentId) {
        alert('Vui lòng chọn bình luận để trả lời');
        return;
    }

    const sendBtn = document.getElementById('commentSendBtn');
    const originalBtnHTML = sendBtn.innerHTML;

    try {
        // Show sending state
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

        // Get page_access_token for Official API (pages.fm)
        const pageId = commentModalChannelId;
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
        if (!pageAccessToken) {
            throw new Error('Không tìm thấy page_access_token. Vui lòng vào Pancake → Settings → Tools để tạo token.');
        }

        const commentId = commentModalParentId; // Facebook comment ID
        const psid = commentModalPSID; // Customer Facebook ID

        // Extract post ID from comment ID (format: postId_commentId)
        const commentIdParts = commentId.split('_');
        const postIdPart = commentIdParts.length > 1 ? commentIdParts[0] : commentId;
        const postId = `${pageId}_${postIdPart}`;

        let url, payload, conversationId;

        if (commentReplyType === 'reply_comment') {
            // ========== REPLY COMMENT (Public reply on post) ==========
            // conversation_id = comment_id for reply_comment
            conversationId = commentId;

            url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                pageAccessToken
            );

            // Build payload for reply_comment
            payload = {
                action: 'reply_comment',
                message_id: commentId,
                message: message
                // Optional: content_url (image URL), mentions
            };

            console.log('[COMMENT MODAL] Sending PUBLIC reply_comment:', {
                pageId,
                conversationId,
                commentId,
                message
            });

        } else {
            // ========== PRIVATE REPLIES (Private message via Messenger) ==========
            // IMPORTANT: For private_replies, conversationId MUST equal message_id (comment_id)!
            // This matches the real Pancake API format (same as sendCommentInternal in tab1-orders.js)
            conversationId = commentId;

            url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                pageAccessToken
            );

            // Build payload for private_replies
            payload = {
                action: 'private_replies',
                post_id: postId,
                message_id: commentId,
                from_id: psid,
                message: message
            };

            console.log('[COMMENT MODAL] Sending PRIVATE private_replies:', {
                pageId,
                conversationId,
                postId,
                commentId,
                psid,
                message
            });
        }

        console.log('[COMMENT MODAL] Request URL:', url);
        console.log('[COMMENT MODAL] Request payload:', payload);

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 1, true); // maxRetries=1, skipFallback=true: chỉ gọi 1 lần, không retry

        const result = await response.json();

        if (!response.ok || result.success === false || result.error) {
            const errorMsg = result.message || result.error?.message || result.error || 'Lỗi gửi reply';
            throw new Error(errorMsg);
        }

        console.log('[COMMENT MODAL] Reply sent successfully:', result);

        // Clear input and refresh comments
        replyInput.value = '';
        cancelCommentReply();

        // Show success notification
        const successMsg = commentReplyType === 'reply_comment'
            ? '✅ Đã reply công khai thành công'
            : '✅ Đã gửi tin nhắn riêng thành công';

        if (window.notificationManager) {
            window.notificationManager.show(successMsg, 'success');
        }

        // Refresh comments
        const commentsResponse = await window.chatDataManager.fetchComments(
            commentModalChannelId,
            commentModalPSID,
            null,
            window.purchaseFacebookPostId,
            commentModalOrder?.Facebook_UserName
        );
        commentModalComments = commentsResponse.comments || [];
        commentModalCursor = commentsResponse.after;
        renderCommentModalComments(commentModalComments, false);

    } catch (error) {
        console.error('[COMMENT MODAL] Error sending reply:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi gửi trả lời: ' + error.message, 'error');
        } else {
            alert('Lỗi gửi trả lời: ' + error.message);
        }
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnHTML;
    }
};

console.log('[COMMENT MODAL] Module loaded');
