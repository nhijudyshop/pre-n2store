/**
 * Facebook Graph API Constants
 * Centralized configuration for Facebook integrations
 *
 * @module shared/universal/facebook-constants
 */

/**
 * Facebook Graph API configuration
 */
export const FACEBOOK_CONFIG = {
    // API Version
    API_VERSION: 'v21.0',

    // Base URLs
    GRAPH_URL: 'https://graph.facebook.com/v21.0',

    // Message Tags for 24h policy bypass
    MESSAGE_TAGS: {
        POST_PURCHASE_UPDATE: 'POST_PURCHASE_UPDATE',
        CONFIRMED_EVENT_UPDATE: 'CONFIRMED_EVENT_UPDATE',
        ACCOUNT_UPDATE: 'ACCOUNT_UPDATE',
    },

    // Messaging Types
    MESSAGING_TYPES: {
        RESPONSE: 'RESPONSE',
        UPDATE: 'UPDATE',
        MESSAGE_TAG: 'MESSAGE_TAG',
    },

    // Sender Actions
    SENDER_ACTIONS: {
        MARK_SEEN: 'mark_seen',
        TYPING_ON: 'typing_on',
        TYPING_OFF: 'typing_off',
    },

    // Attachment Types
    ATTACHMENT_TYPES: {
        IMAGE: 'image',
        VIDEO: 'video',
        AUDIO: 'audio',
        FILE: 'file',
    },
};

/**
 * Check if a conversation ID is a Comment (format: postId_commentId)
 * @param {string} convId - Conversation ID
 * @returns {boolean}
 */
export function isCommentConversation(convId) {
    return /^\d+_\d+$/.test(convId);
}

/**
 * Build Facebook Graph API URL
 * @param {string} endpoint - API endpoint
 * @param {string} accessToken - Access token (optional)
 * @returns {string}
 */
export function buildGraphUrl(endpoint, accessToken = '') {
    const url = `${FACEBOOK_CONFIG.GRAPH_URL}/${endpoint}`;
    return accessToken ? `${url}?access_token=${accessToken}` : url;
}

/**
 * Build message payload for Send API
 * @param {object} options - Message options
 * @param {string} options.recipientId - Recipient PSID
 * @param {string} options.text - Message text (optional)
 * @param {object} options.attachment - Attachment object (optional)
 * @param {boolean} options.useTag - Use POST_PURCHASE_UPDATE tag
 * @returns {object}
 */
export function buildMessagePayload({ recipientId, text, attachment, useTag = false }) {
    const payload = {
        recipient: { id: recipientId },
        message: {},
    };

    if (text) {
        payload.message.text = text;
    } else if (attachment) {
        payload.message.attachment = attachment;
    }

    if (useTag) {
        payload.messaging_type = FACEBOOK_CONFIG.MESSAGING_TYPES.MESSAGE_TAG;
        payload.tag = FACEBOOK_CONFIG.MESSAGE_TAGS.POST_PURCHASE_UPDATE;
    } else {
        payload.messaging_type = FACEBOOK_CONFIG.MESSAGING_TYPES.RESPONSE;
    }

    return payload;
}

/**
 * Build attachment payload for image URL
 * @param {string} imageUrl - Image URL
 * @param {boolean} isReusable - Make attachment reusable
 * @returns {object}
 */
export function buildImageAttachment(imageUrl, isReusable = true) {
    return {
        type: FACEBOOK_CONFIG.ATTACHMENT_TYPES.IMAGE,
        payload: {
            url: imageUrl,
            is_reusable: isReusable,
        },
    };
}

/**
 * Build attachment payload using attachment_id
 * @param {string} attachmentId - Pre-uploaded attachment ID
 * @param {string} type - Attachment type (image, video, audio, file)
 * @returns {object}
 */
export function buildAttachmentById(attachmentId, type = 'image') {
    return {
        type,
        payload: {
            attachment_id: attachmentId,
        },
    };
}
