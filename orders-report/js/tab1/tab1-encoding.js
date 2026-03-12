// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 14: NOTE ENCODING/DECODING                        ║
// ║                            search: #ENCODE                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// PRODUCT ENCODING/DECODING UTILITIES (for Note verification) #ENCODE
// =====================================================
const ENCODE_KEY = 'live';
const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

/**
 * Base64URL decode
 * @param {string} str - Base64URL encoded string
 * @returns {string} Decoded string
 */
function base64UrlDecode(str) {
    const padding = '='.repeat((4 - str.length % 4) % 4);
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
    const binary = atob(base64);
    return new TextDecoder().decode(
        Uint8Array.from(binary, c => c.charCodeAt(0))
    );
}

/**
 * Generate short checksum (6 characters)
 * @param {string} str - String to checksum
 * @returns {string} Checksum in base36 (6 chars)
 */
function shortChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * XOR decryption with key
 * @param {string} encoded - Base64 encoded encrypted text
 * @param {string} key - Decryption key
 * @returns {string} Decrypted text
 */
function xorDecrypt(encoded, key) {
    // Decode from base64
    const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(key);
    const decrypted = new Uint8Array(encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }

    return new TextDecoder().decode(decrypted);
}

/**
 * Decode product line - supports both old and new formats
 * NEW FORMAT: Base64URL, comma separator, orderId, checksum
 * OLD FORMAT: Base64, pipe separator, no orderId
 * @param {string} encoded - Encoded string
 * @param {number} expectedOrderId - Expected order ID (for verification in new format)
 * @returns {object|null} { orderId?, productCode, quantity, price, timestamp } or null if invalid
 */
function decodeProductLine(encoded, expectedOrderId = null) {
    try {
        // Detect format by checking for Base64URL characters
        const isNewFormat = encoded.includes('-') || encoded.includes('_') || (!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

        if (isNewFormat) {
            // ===== NEW FORMAT: Base64URL + orderId + checksum =====
            try {
                // Base64URL decode
                const decrypted = base64UrlDecode(encoded);

                // XOR decrypt
                const fullData = xorDecrypt(decrypted, ENCODE_KEY);

                // Parse
                const parts = fullData.split(',');
                if (parts.length !== 6) {
                    // Not new format, fallback to old format
                    throw new Error('Not new format');
                }

                const [orderId, productCode, quantity, price, relativeTime, checksum] = parts;

                // Verify checksum
                const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
                if (checksum !== shortChecksum(data)) {
                    console.debug('[DECODE] Checksum mismatch - data may be corrupted');
                    return null;
                }

                // Verify order ID if provided
                if (expectedOrderId !== null && orderId !== expectedOrderId.toString()) {
                    console.debug(`[DECODE] OrderId mismatch: encoded=${orderId}, expected=${expectedOrderId}`);
                    return null;
                }

                // Convert relative timestamp back to absolute
                const timestamp = parseInt(relativeTime) * 1000 + BASE_TIME;

                return {
                    orderId: parseInt(orderId),
                    productCode,
                    quantity: parseInt(quantity),
                    price: parseFloat(price),
                    timestamp
                };
            } catch (newFormatError) {
                // Fallback to old format
                console.debug('[DECODE] New format decode failed, trying old format...');
            }
        }

        // ===== OLD FORMAT: Base64 + pipe separator =====
        const decoded = xorDecrypt(encoded, ENCODE_KEY);
        const parts = decoded.split('|');

        // Support both old format (3 parts) and old format with timestamp (4 parts)
        if (parts.length !== 3 && parts.length !== 4) return null;

        const result = {
            productCode: parts[0],
            quantity: parseInt(parts[1]),
            price: parseFloat(parts[2])
        };

        // Add timestamp if present
        if (parts.length === 4) {
            result.timestamp = parseInt(parts[3]);
        }

        return result;
    } catch (error) {
        console.debug('[DECODE] Decode error:', error);
        return null;
    }
}

// =====================================================
// NOTE EDITED DETECTION VIA FIREBASE SNAPSHOT
// =====================================================

/**
 * Load all note snapshots from Firebase
 * @returns {Promise<Object>} - Map of orderId -> snapshot data
 */
async function loadNoteSnapshots() {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return {};
    }

    try {
        console.log('[NOTE-TRACKER] Loading note snapshots from Firebase...');
        const snapshot = await database.ref('order_notes_snapshot').once('value');
        const data = snapshot.val() || {};

        // Clean up expired snapshots (older than 30 days)
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const cleanedData = {};
        let expiredCount = 0;

        Object.keys(data).forEach(orderId => {
            const snapshot = data[orderId];
            if (snapshot.timestamp && snapshot.timestamp > thirtyDaysAgo) {
                cleanedData[orderId] = snapshot;
            } else {
                expiredCount++;
                // Delete expired snapshot
                database.ref(`order_notes_snapshot/${orderId}`).remove();
            }
        });

        console.log(`[NOTE-TRACKER] Loaded ${Object.keys(cleanedData).length} snapshots, cleaned ${expiredCount} expired`);
        return cleanedData;
    } catch (error) {
        console.error('[NOTE-TRACKER] Error loading snapshots:', error);
        return {};
    }
}

/**
 * Check if note contains VALID encoded products (belongs to this order)
 * Verifies orderId to prevent cross-order copy attacks
 * @param {string} note - Order note
 * @param {number} expectedOrderId - Order ID to verify against
 * @returns {boolean} - True if has valid encoded products belonging to this order
 */
function hasValidEncodedProducts(note, expectedOrderId) {
    if (!note || !note.trim()) return false;

    const lines = note.split('\n');
    let foundValid = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Quick pattern check (NEW format: Base64URL - compact, no padding)
        const isNewFormat = /^[A-Za-z0-9_-]{40,65}$/.test(trimmed);

        // Quick pattern check (OLD format: Base64 with padding)
        const isOldFormat = /^[A-Za-z0-9+/]{50,80}={0,2}$/.test(trimmed);

        if (!isNewFormat && !isOldFormat) {
            continue; // Not an encoded line
        }

        try {
            // ===== NEW FORMAT: Has orderId → Verify! =====
            if (isNewFormat) {
                // Decode with expectedOrderId to verify
                const decoded = decodeProductLine(trimmed, expectedOrderId);

                if (decoded && decoded.orderId === expectedOrderId) {
                    // ✅ Valid encoded product for THIS order
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ✅ Valid encoded line for order #${expectedOrderId}`);
                } else {
                    // ⚠️ Encoded line from ANOTHER order (copy attack) or decode failed
                    // Try decode without verification to see original orderId
                    const decodedNoCheck = decodeProductLine(trimmed, null);
                    if (decodedNoCheck && decodedNoCheck.orderId) {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} contains COPIED encoded line from Order #${decodedNoCheck.orderId} - REJECTED`
                        );
                    } else {
                        console.warn(
                            `[NOTE-TRACKER] ⚠️ Order #${expectedOrderId} has invalid encoded line (checksum fail or corrupted)`
                        );
                    }
                }
            }

            // ===== OLD FORMAT: No orderId → Accept for backward compatibility =====
            else if (isOldFormat) {
                const decoded = decodeProductLine(trimmed);
                if (decoded && decoded.productCode) {
                    // Old format doesn't have orderId to verify
                    // Accept as valid (backward compatibility)
                    foundValid = true;
                    console.log(`[NOTE-TRACKER] ℹ️ Found old format encoded line (no orderId verification available)`);
                }
            }

        } catch (e) {
            // Decode failed, not a valid encoded line
            console.debug(`[NOTE-TRACKER] Failed to decode line: ${trimmed.substring(0, 20)}...`);
            continue;
        }
    }

    return foundValid;
}

/**
 * Compare current notes with snapshots and detect edits
 * @param {Array} orders - Array of order objects
 * @param {Object} snapshots - Map of orderId -> snapshot
 * @returns {Promise<void>}
 */
async function compareAndUpdateNoteStatus(orders, snapshots) {
    if (!orders || orders.length === 0) return;

    console.log('[NOTE-TRACKER] Comparing notes with snapshots...');

    let editedCount = 0;
    let newSnapshotsToSave = {};

    orders.forEach(order => {
        const orderId = order.Id;
        const currentNote = (order.Note || '').trim();
        const snapshot = snapshots[orderId];

        if (snapshot) {
            // Compare with existing snapshot
            const savedNote = (snapshot.note || '').trim();

            if (currentNote !== savedNote) {
                // Note has been edited!
                order.noteEdited = true;
                editedCount++;
                console.log(`[NOTE-TRACKER] ✏️ Edited: STT ${order.SessionIndex}, "${savedNote}" → "${currentNote}"`);
            } else {
                order.noteEdited = false;
            }
        } else {
            // No snapshot exists - only save if note has valid encoded products
            order.noteEdited = false;

            // ✅ NEW: Verify orderId in encoded products to prevent cross-order copy
            if (hasValidEncodedProducts(currentNote, orderId)) {
                // Has valid encoded products belonging to THIS order → Save snapshot
                console.log(`[NOTE-TRACKER] 📸 Saving snapshot for order #${orderId} (has valid encoded products)`);

                newSnapshotsToSave[orderId] = {
                    note: currentNote,
                    code: order.Code,
                    stt: order.SessionIndex,
                    timestamp: Date.now()
                };
            }
            // else: No valid encoded products → Skip silently
        }
    });

    // Save new snapshots in batch
    if (Object.keys(newSnapshotsToSave).length > 0) {
        await saveNoteSnapshots(newSnapshotsToSave);
    }

    console.log(`[NOTE-TRACKER] ✅ Found ${editedCount} edited notes out of ${orders.length} orders`);
}

/**
 * Save note snapshots to Firebase
 * @param {Object} snapshots - Map of orderId -> snapshot data
 * @returns {Promise<void>}
 */
async function saveNoteSnapshots(snapshots) {
    if (!database) {
        console.warn('[NOTE-TRACKER] Firebase not initialized');
        return;
    }

    try {
        const updates = {};
        Object.keys(snapshots).forEach(orderId => {
            updates[`order_notes_snapshot/${orderId}`] = snapshots[orderId];
        });

        await database.ref().update(updates);
        console.log(`[NOTE-TRACKER] Saved ${Object.keys(snapshots).length} new snapshots to Firebase`);
    } catch (error) {
        console.error('[NOTE-TRACKER] Error saving snapshots:', error);
    }
}

/**
 * Main function to detect edited notes using Firebase snapshots
 * Call this after loading orders
 */
async function detectEditedNotes() {
    if (!allData || allData.length === 0) {
        console.log('[NOTE-TRACKER] No data to check');
        return;
    }

    console.log('[NOTE-TRACKER] Starting note edit detection for', allData.length, 'orders...');

    // Load snapshots from Firebase (1 call for all orders)
    const snapshots = await loadNoteSnapshots();

    // Compare and update note status
    await compareAndUpdateNoteStatus(allData, snapshots);

    console.log('[NOTE-TRACKER] Note edit detection completed');
}

/**
 * Helper to extract the correct Facebook Comment ID from a comment object
 * Prioritizes FacebookId, OriginalId, then checks if Id is not a Mongo ID
 */
function getFacebookCommentId(comment) {
    if (!comment) return null;

    // 1. Explicit fields
    if (comment.PlatformId) return comment.PlatformId;
    if (comment.FacebookId) return comment.FacebookId;
    if (comment.OriginalId) return comment.OriginalId;
    if (comment.SocialId) return comment.SocialId;

    // 2. Check if Id is NOT a Mongo ID (24 hex chars)
    // Facebook IDs are usually numeric or have underscores
    // Support both uppercase (Id) and lowercase (id) field names from Pancake API
    const commentId = comment.Id || comment.id;
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(commentId);
    if (commentId && !isMongoId) {
        return commentId;
    }

    // 3. Fallback to Id if nothing else found (might fail if it's internal)
    return commentId;
}

/**
 * Helper to extract just the post ID from a Facebook post identifier
 * Facebook_PostId format: "pageId_postId" (e.g., "117267091364524_1382798016618291")
 * Returns: just the postId part (e.g., "1382798016618291")
 */
function extractPostId(facebookPostId) {
    if (!facebookPostId) return null;

    // If it contains underscore, it's in format pageId_postId
    if (facebookPostId.includes('_')) {
        const parts = facebookPostId.split('_');
        // Return the second part (postId)
        return parts.length >= 2 ? parts[1] : facebookPostId;
    }

    // Otherwise return as-is (already just the postId)
    return facebookPostId;
}
// =====================================================
// REALTIME UI UPDATES
// =====================================================
window.addEventListener('realtimeConversationUpdate', function (event) {
    const conversation = event.detail;
    if (!conversation) return;

    // console.log('[TAB1] Handling realtime update:', conversation);

    let psid = conversation.from_psid || (conversation.customers && conversation.customers[0]?.fb_id);
    let pageId = conversation.page_id;

    // Fallback: Extract from conversation.id (format: pageId_psid)
    if ((!psid || !pageId) && conversation.id && conversation.id.includes('_')) {
        const parts = conversation.id.split('_');
        if (parts.length === 2) {
            if (!pageId) pageId = parts[0];
            if (!psid) psid = parts[1];
        }
    }

    if (!psid) return;

    // 1. UPDATE DATA MANAGERS (Crucial for filters to work)
    if (window.pancakeDataManager) {
        const convType = conversation.type || 'INBOX';
        if (convType === 'INBOX') {
            if (psid) window.pancakeDataManager.inboxMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.inboxMapByFBID.set(conversation.from.id, conversation);
        } else if (convType === 'COMMENT') {
            if (psid) window.pancakeDataManager.commentMapByPSID.set(psid, conversation);
            if (conversation.from && conversation.from.id) window.pancakeDataManager.commentMapByFBID.set(conversation.from.id, conversation);
        }
    }

    // NOTE: Chat modal updates are handled by tab1-chat.js (handleRealtimeConversationEvent)
    // This listener only updates the TABLE COLUMNS, not the modal content

    // 2. CHECK FILTER
    // If filtering by read/unread, we MUST re-run search to show/hide rows
    const currentFilter = document.getElementById('conversationFilter') ? document.getElementById('conversationFilter').value : 'all';
    if (currentFilter === 'unread' || currentFilter === 'read') {
        console.log(`[TAB1] Realtime update with filter '${currentFilter}' - Triggering re-search`);
        performTableSearch();
        return; // Stop here, let search handle the rendering
    }

    const message = conversation.snippet || '';
    const unreadCount = conversation.unread_count || 0;
    const isUnread = unreadCount > 0 || !conversation.seen;
    const type = conversation.type || 'INBOX'; // INBOX or COMMENT

    // Find matching orders in displayedData
    // Match both PSID and PageID (via Facebook_PostId which starts with PageID)
    const matchingOrders = displayedData.filter(o => {
        const matchesPsid = o.Facebook_ASUserId === psid;
        // If we have a pageId, check if Facebook_PostId starts with it
        const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
        return matchesPsid && matchesPage;
    });

    if (matchingOrders.length === 0) return;

    console.log(`[TAB1] Updating ${matchingOrders.length} rows for PSID ${psid} on Page ${pageId}`);

    matchingOrders.forEach(order => {
        // Find row
        const checkbox = document.querySelector(`input[value="${order.Id}"]`);
        if (!checkbox) return;
        const row = checkbox.closest('tr');
        if (!row) return;

        // Determine column based on type
        const colType = type === 'INBOX' ? 'messages' : 'comments';
        const cell = row.querySelector(`td[data-column="${colType}"]`);

        if (cell) {
            // Construct HTML directly
            const fontWeight = isUnread ? '700' : '400';
            const color = isUnread ? '#111827' : '#6b7280';
            const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';
            const unreadText = unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${unreadCount} tin mới</span>` : '';

            // Truncate message
            let displayMessage = message;
            if (displayMessage.length > 30) displayMessage = displayMessage.substring(0, 30) + '...';

            // Update innerHTML
            cell.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                            ${displayMessage}
                        </span>
                        ${unreadText}
                    </div>
                </div>
            `;

            // Add click event and styling
            // Use separate modals: openChatModal for messages, openCommentModal for comments
            const clickHandler = type === 'INBOX'
                ? `openChatModal('${order.Id}', '${pageId}', '${psid}')`
                : `openCommentModal('${order.Id}', '${pageId}', '${psid}')`;

            const tooltipText = type === 'INBOX'
                ? 'Click để xem toàn bộ tin nhắn'
                : 'Click để xem bình luận';

            cell.setAttribute('onclick', clickHandler);
            cell.style.cursor = 'pointer';
            cell.title = tooltipText;

            // Highlight
            row.classList.add('product-row-highlight');
            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
        }
    });

    // 🔄 UPDATE ALL DATA & RE-FILTER IF NEEDED
    // Even if the order is not currently displayed (filtered out), we need to update its state in allData
    // and check if it should now be displayed based on current filters.

    // 1. Update PancakeDataManager Cache (Crucial for performTableSearch)
    if (window.pancakeDataManager) {
        // We need to manually update the cache because performTableSearch uses getMessageUnreadInfoForOrder
        // which reads from this cache.
        // The conversation object from the event has the structure we need.

        // We need to find where to put it. 
        // PancakeDataManager stores conversations in inboxMapByPSID and inboxMapByFBID
        // We can try to call a method to update it, or manually set it if exposed.
        // Looking at PancakeDataManager, it doesn't seem to have a public 'updateConversation' method 
        // that takes a raw payload easily without fetching.
        // However, we can try to update the map if we can access it, but it's better to rely on 
        // what we have.

        // Actually, let's just update the order's internal state if possible, OR
        // since performTableSearch calls window.pancakeDataManager.getMessageUnreadInfoForOrder(order),
        // and that function looks up in inboxMapByPSID.

        // Let's try to update the map directly if possible, or add a helper in PancakeDataManager.
        // Since we can't easily modify PancakeDataManager right now without switching files,
        // let's assume for now we can't easily update the private maps if they are not exposed.

        // WAIT: window.pancakeDataManager.inboxMapByPSID is likely accessible.
        if (window.pancakeDataManager.inboxMapByPSID) {
            window.pancakeDataManager.inboxMapByPSID.set(String(psid), conversation);
        }
    }

    // 2. Check if we need to refresh the table (if order was hidden but now matches filter)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    // Only care if we are filtering by 'unread'
    if (conversationFilter === 'unread') {
        // Check if any matching order is NOT in displayedData
        // We need to find orders in allData that match this PSID/PageID
        const allMatchingOrders = allData.filter(o => {
            const matchesPsid = o.Facebook_ASUserId === psid;
            const matchesPage = pageId ? (o.Facebook_PostId && o.Facebook_PostId.startsWith(pageId)) : true;
            return matchesPsid && matchesPage;
        });

        const hiddenOrders = allMatchingOrders.filter(o => !displayedData.includes(o));

        if (hiddenOrders.length > 0) {
            console.log(`[TAB1] Found ${hiddenOrders.length} hidden orders matching realtime update. Refreshing table...`);

            // We need to ensure the filter logic sees them as "unread".
            // Since we updated the PancakeDataManager cache above, performTableSearch should now
            // correctly identify them as unread.

            performTableSearch();

            // After refresh, highlight them
            setTimeout(() => {
                hiddenOrders.forEach(order => {
                    const checkbox = document.querySelector(`input[value="${order.Id}"]`);
                    if (checkbox) {
                        const row = checkbox.closest('tr');
                        if (row) {
                            row.classList.add('product-row-highlight');
                            setTimeout(() => row.classList.remove('product-row-highlight'), 2000);
                        }
                    }
                });
            }, 100);
        }
    }
});

// =====================================================
// INCREMENTAL MESSAGE UPDATE HELPERS
// =====================================================

/**
 * Create DOM element for a single message (without re-rendering all)
 */
function createMessageElement(msg, chatType = 'message') {
    const div = document.createElement('div');
    const isOwner = msg.IsOwner || msg.is_owner;

    div.className = `chat-message ${isOwner ? 'chat-message-right' : 'chat-message-left'}`;
    div.dataset.messageId = msg.id || msg.Id;

    const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

    let content = '';

    // Message text
    if (msg.Message || msg.message) {
        const messageText = msg.Message || msg.message;
        content += `<p class="chat-message-text">${messageText}</p>`;
    }

    // Attachments (capital A - messages)
    if (msg.Attachments && msg.Attachments.length > 0) {
        msg.Attachments.forEach(att => {
            if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy">`;
            } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                content += `<div class="chat-audio-message">
                    <audio controls><source src="${att.Payload.Url}" type="audio/mp4"></audio>
                </div>`;
            }
        });
    }

    // attachments (lowercase a - comments)
    if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
            if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy">`;
            } else if (att.mime_type === 'audio/mp4' && att.file_url) {
                content += `<div class="chat-audio-message">
                    <audio controls><source src="${att.file_url}" type="audio/mp4"></audio>
                </div>`;
            }
        });
    }

    // Format time - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    const timeStr = formatTime(msg.CreatedTime || msg.created_at);

    div.innerHTML = `
        <div class="chat-bubble ${bgClass}">
            ${content}
            <p class="chat-message-time">${timeStr}</p>
        </div>
    `;

    return div;
}

/**
 * Append new messages to chat (incremental update)
 */
function appendNewMessages(messages, chatType = 'message') {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) {
        console.warn('[APPEND] No modal body found');
        return;
    }

    const container = modalBody.querySelector('.chat-messages-container');
    if (!container) {
        console.warn('[APPEND] No messages container found');
        return;
    }

    // Check if user is at bottom (before adding new messages)
    const wasAtBottom = modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100;

    // Create document fragment for batch append (better performance)
    const fragment = document.createDocumentFragment();

    messages.forEach(msg => {
        const msgEl = createMessageElement(msg, chatType);
        fragment.appendChild(msgEl);
    });

    // Append all at once
    container.appendChild(fragment);

    // Smart scroll - only auto-scroll if user was already at bottom
    if (wasAtBottom) {
        requestAnimationFrame(() => {
            modalBody.scrollTop = modalBody.scrollHeight;

            // Hide new message indicator
            const indicator = document.getElementById('chatNewMessageIndicator');
            if (indicator) indicator.style.display = 'none';
        });
    } else {
        // Show "new messages" indicator if user scrolled up
        showNewMessageIndicator();
    }

    console.log('[APPEND] Added', messages.length, 'new messages to DOM');
}

// =====================================================
// QUICK ADD PRODUCT LOGIC
// =====================================================
// Note: Variables and functions are defined in tab1-chat-products.js
// This file uses window.quickAddSelectedProducts directly

