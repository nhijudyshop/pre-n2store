// =====================================================
// tab1-chat.js - Chat Module Aggregator
// This file was split from a 6,665-line monolith into 5 sub-modules.
// It verifies all sub-modules loaded correctly and logs status.
// =====================================================
// Load order (defined in tab1-orders.html):
//   1. tab1-chat-core.js      - State, modals, selectors, mark-read, infinite scroll
//   2. tab1-chat-messages.js   - Render, send, queue, reply state
//   3. tab1-chat-facebook.js   - Facebook Graph API, 24h fallback
//   4. tab1-chat-images.js     - Upload, paste, preview, compression
//   5. tab1-chat-realtime.js   - WebSocket, polling, live updates
//   6. tab1-chat.js            - This aggregator (loaded last)
// =====================================================

(function () {
    'use strict';

    console.log('[Tab1-Chat] Aggregator loading - verifying sub-modules...');

    // Required globals from each sub-module
    const checks = [
        // tab1-chat-core.js
        { name: 'tab1-chat-core', globals: ['openChatModal', 'closeChatModal', 'scrollToMessage', 'markChatAsRead'] },
        // tab1-chat-messages.js
        { name: 'tab1-chat-messages', globals: ['renderChatMessages', 'renderComments', 'sendMessage', 'sendComment', 'sendReplyComment'] },
        // tab1-chat-facebook.js
        { name: 'tab1-chat-facebook', globals: ['sendMessageViaFacebookTag', 'sendViaFacebookTagFromModal', 'show24hFallbackPrompt'] },
        // tab1-chat-images.js
        { name: 'tab1-chat-images', globals: ['uploadImageWithCache', 'updateMultipleImagesPreview', 'clearAllImages', 'sendImageToChat', 'sendProductToChat'] },
        // tab1-chat-realtime.js
        { name: 'tab1-chat-realtime', globals: ['setupRealtimeMessages', 'cleanupRealtimeMessages', 'fetchAndUpdateMessages'] }
    ];

    let allPassed = true;

    checks.forEach(check => {
        const missing = check.globals.filter(g => typeof window[g] === 'undefined');
        if (missing.length > 0) {
            console.error(`[Tab1-Chat] ${check.name} MISSING globals:`, missing.join(', '));
            allPassed = false;
        } else {
            console.log(`[Tab1-Chat] ${check.name} OK`);
        }
    });

    if (allPassed) {
        console.log('[Tab1-Chat] All 5 sub-modules loaded successfully.');
    } else {
        console.error('[Tab1-Chat] Some sub-modules failed to load! Check script tags in tab1-orders.html.');
    }
})();
