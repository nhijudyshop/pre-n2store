// =====================================================
// tab1-chat-realtime.js - Realtime Message Listeners
// WebSocket event handling, polling backup, Facebook API
// message fetching, notification sounds
// =====================================================
// Dependencies: tab1-chat-core.js (window.currentChatType, window.currentChatChannelId, etc.),
//               tab1-chat-messages.js (renderChatMessages, showNewMessageIndicator)
// Exposes: window.setupRealtimeMessages, window.cleanupRealtimeMessages,
//          window.fetchAndUpdateMessages

console.log('[Tab1-Chat-Realtime] Loading...');

/**
 * Global variables for realtime messages
 */
window.realtimeMessagesInterval = null;
window.realtimeMessagesHandler = null;
window.lastMessageTimestamp = null;
const REALTIME_POLL_INTERVAL = 10000; // 10 seconds polling interval

/**
 * Setup realtime messages when chat modal opens
 * Uses both WebSocket events and polling as backup
 */
function setupRealtimeMessages() {
    console.log('[REALTIME-MSG] Setting up realtime messages...');

    // Cleanup any existing listeners first
    cleanupRealtimeMessages();

    // 1. Listen for WebSocket events from RealtimeManager
    window.realtimeMessagesHandler = handleRealtimeConversationEvent;
    window.addEventListener('realtimeConversationUpdate', window.realtimeMessagesHandler);
    console.log('[REALTIME-MSG] WebSocket event listener added');

    // 2. Start polling as backup (only if WebSocket is not connected)
    // Polling is disabled by default since we have WebSocket realtime
    // startRealtimePolling();
}

/**
 * Handle realtime conversation update from WebSocket
 * Trực tiếp lấy tin nhắn từ WebSocket payload, không cần gọi API
 * @param {CustomEvent} event - Event with conversation data
 */
async function handleRealtimeConversationEvent(event) {
    const conversation = event.detail;
    if (!conversation) return;

    // Check if this update is for the current conversation
    const currentConvId = window.currentConversationId;
    const currentPSID = window.currentChatPSID;
    const currentChannelId = window.currentChatChannelId;

    // Match by conversation ID or by page_id + customer PSID
    const isMatchingConv = (conversation.id === currentConvId) ||
        (conversation.page_id === currentChannelId &&
            (conversation.from?.id === currentPSID || conversation.from_psid === currentPSID));

    if (!isMatchingConv) {
        // Log quietly - this is expected for updates to other conversations
        return;
    }

    console.log('[REALTIME-MSG] Received realtime update for current conversation:', conversation.id);

    // Try to get the new message directly from WebSocket payload
    const lastMessage = conversation.last_message || conversation.message;

    if (lastMessage && lastMessage.id) {
        // Check if this message already exists
        const existingIds = new Set(window.allChatMessages.map(m => m.id || m.Id));

        if (!existingIds.has(lastMessage.id)) {
            console.log('[REALTIME-MSG] Adding message directly from WebSocket:', lastMessage.id);

            // Add the new message directly (instant realtime!)
            window.allChatMessages.push(lastMessage);

            // Update timestamp
            window.lastMessageTimestamp = lastMessage.inserted_at || lastMessage.created_time;

            // Check if user is at bottom before updating
            const modalBody = document.getElementById('chatModalBody');
            const wasAtBottom = modalBody &&
                (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);

            // Re-render messages
            renderChatMessages(window.allChatMessages, wasAtBottom);

            // Show indicator if not at bottom
            if (!wasAtBottom) {
                showNewMessageIndicator();
            }

            // Play notification sound
            playNewMessageSound();

            return; // Done - no need to call API
        } else {
            console.log('[REALTIME-MSG] Message already exists:', lastMessage.id);
            return;
        }
    }

    // Fallback: If last_message not in payload, check snippet
    // This means we only got a notification, need to fetch the full message
    if (conversation.snippet) {
        console.log('[REALTIME-MSG] WebSocket has snippet but not full message, fetching via API...');
        await fetchAndUpdateMessages();
    }
}

/**
 * Start polling for new messages
 */
function startRealtimePolling() {
    // Clear any existing interval
    if (window.realtimeMessagesInterval) {
        clearInterval(window.realtimeMessagesInterval);
    }

    // Store initial timestamp
    if (window.allChatMessages && window.allChatMessages.length > 0) {
        const latestMsg = window.allChatMessages.reduce((latest, msg) => {
            const msgTime = new Date(msg.inserted_at || msg.CreatedTime || 0).getTime();
            const latestTime = new Date(latest.inserted_at || latest.CreatedTime || 0).getTime();
            return msgTime > latestTime ? msg : latest;
        });
        window.lastMessageTimestamp = latestMsg.inserted_at || latestMsg.CreatedTime;
    }

    console.log('[REALTIME-MSG] Starting polling every', REALTIME_POLL_INTERVAL / 1000, 'seconds');

    // Start polling
    window.realtimeMessagesInterval = setInterval(async () => {
        // Only poll if chat modal is open
        const chatModal = document.getElementById('chatModal');
        if (!chatModal || !chatModal.classList.contains('show')) {
            console.log('[REALTIME-MSG] Chat modal closed, stopping poll');
            cleanupRealtimeMessages();
            return;
        }

        // Only poll for message type (not comments)
        if (currentChatType !== 'message') {
            return;
        }

        await fetchAndUpdateMessages();
    }, REALTIME_POLL_INTERVAL);
}

/**
 * Fetch latest messages using Facebook Graph API via Pancake
 * Only fetches new messages since last update
 */
async function fetchAndUpdateMessages() {
    if (!window.currentChatChannelId || !window.currentChatPSID) {
        return;
    }

    // Prevent concurrent fetches
    if (window.isFetchingRealtimeMessages) {
        console.log('[REALTIME-MSG] Already fetching, skipping...');
        return;
    }

    window.isFetchingRealtimeMessages = true;

    try {
        console.log('[REALTIME-MSG] Fetching latest messages...');

        // Try Facebook Graph API first if we have page token
        let newMessages = [];
        const facebookPageToken = await getFacebookPageToken();

        if (facebookPageToken && window.currentConversationId) {
            // Use Facebook Graph API directly
            newMessages = await fetchMessagesFromFacebookAPI(facebookPageToken);
        } else {
            // Fallback to Pancake API
            const response = await window.chatDataManager.fetchMessages(
                window.currentChatChannelId,
                window.currentChatPSID,
                window.currentConversationId,
                window.currentCustomerUUID
            );
            newMessages = response.messages || [];
        }

        if (newMessages.length === 0) {
            console.log('[REALTIME-MSG] No messages returned');
            window.isFetchingRealtimeMessages = false;
            return;
        }

        // Find truly new messages by comparing IDs
        const existingIds = new Set(window.allChatMessages.map(m => m.id || m.Id));
        const trulyNewMessages = newMessages.filter(msg => {
            const msgId = msg.id || msg.Id;
            return msgId && !existingIds.has(msgId);
        });

        if (trulyNewMessages.length > 0) {
            console.log('[REALTIME-MSG] Found', trulyNewMessages.length, 'new messages');

            // Add new messages to the array
            window.allChatMessages = [...window.allChatMessages, ...trulyNewMessages];

            // Update timestamp
            const latestMsg = trulyNewMessages.reduce((latest, msg) => {
                const msgTime = new Date(msg.inserted_at || msg.CreatedTime || 0).getTime();
                const latestTime = new Date(latest.inserted_at || latest.CreatedTime || 0).getTime();
                return msgTime > latestTime ? msg : latest;
            });
            window.lastMessageTimestamp = latestMsg.inserted_at || latestMsg.CreatedTime;

            // Check if user is at bottom before updating
            const modalBody = document.getElementById('chatModalBody');
            const wasAtBottom = modalBody &&
                (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);

            // Re-render messages
            renderChatMessages(window.allChatMessages, wasAtBottom);

            // Show indicator if not at bottom
            if (!wasAtBottom) {
                showNewMessageIndicator();
            }

            // Play notification sound if available
            playNewMessageSound();
        } else {
            console.log('[REALTIME-MSG] No new messages to display');
        }

    } catch (error) {
        console.error('[REALTIME-MSG] Error fetching messages:', error);
    } finally {
        window.isFetchingRealtimeMessages = false;
    }
}

/**
 * Get Facebook Page Token from various sources
 * @returns {string|null} Facebook Page Token
 */
async function getFacebookPageToken() {
    // Try CRMTeam first
    if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
        return window.currentCRMTeam.Facebook_PageToken;
    }

    // Try current order
    if (window.currentOrder && window.currentOrder.CRMTeam && window.currentOrder.CRMTeam.Facebook_PageToken) {
        return window.currentOrder.CRMTeam.Facebook_PageToken;
    }

    // Try pancake token manager
    if (window.pancakeTokenManager && window.currentChatChannelId) {
        const pageAccessToken = await window.pancakeTokenManager.getOrGeneratePageAccessToken(window.currentChatChannelId);
        return pageAccessToken;
    }

    return null;
}

/**
 * Fetch messages directly from Facebook Graph API
 * Uses the conversation endpoint with page access token
 * @param {string} pageToken - Facebook Page Token
 * @returns {Array} Messages array
 */
async function fetchMessagesFromFacebookAPI(pageToken) {
    try {
        // Build the Facebook Graph API URL
        // GET /{conversation-id}/messages?access_token={page_token}
        const conversationId = window.currentConversationId;

        if (!conversationId) {
            console.warn('[REALTIME-MSG] No conversation ID for Facebook API call');
            return [];
        }

        // Use Pancake Official API which proxies to Facebook
        // This respects the same format and avoids CORS issues
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(window.currentChatChannelId);

        if (!pageAccessToken) {
            console.warn('[REALTIME-MSG] No page access token for Facebook API');
            return [];
        }

        // Build URL using existing API config
        let extraParams = '';
        if (window.currentCustomerUUID) {
            extraParams = `&customer_id=${window.currentCustomerUUID}`;
        }

        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${window.currentChatChannelId}/conversations/${conversationId}/messages`,
            pageAccessToken
        ) + extraParams;

        console.log('[REALTIME-MSG] Calling Facebook API via Pancake:', url.substring(0, 100) + '...');

        const response = await API_CONFIG.smartFetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }, 2, true); // 2 retries, skip fallback

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[REALTIME-MSG] Facebook API returned', data.messages?.length || 0, 'messages');

        return data.messages || [];

    } catch (error) {
        console.error('[REALTIME-MSG] Error calling Facebook API:', error);
        return [];
    }
}

/**
 * Play notification sound for new messages
 */
function playNewMessageSound() {
    try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        // Silently fail if audio not supported
    }
}

/**
 * Cleanup realtime messages listeners and intervals
 */
function cleanupRealtimeMessages() {
    console.log('[REALTIME-MSG] Cleaning up realtime messages...');

    // Remove WebSocket event listener
    if (window.realtimeMessagesHandler) {
        window.removeEventListener('realtimeConversationUpdate', window.realtimeMessagesHandler);
        window.realtimeMessagesHandler = null;
    }

    // Clear polling interval
    if (window.realtimeMessagesInterval) {
        clearInterval(window.realtimeMessagesInterval);
        window.realtimeMessagesInterval = null;
    }

    // Reset state
    window.lastMessageTimestamp = null;
    window.isFetchingRealtimeMessages = false;
}

// Expose for external use
window.setupRealtimeMessages = setupRealtimeMessages;
window.cleanupRealtimeMessages = cleanupRealtimeMessages;
window.fetchAndUpdateMessages = fetchAndUpdateMessages;

console.log('[Tab1-Chat-Realtime] Loaded successfully.');
