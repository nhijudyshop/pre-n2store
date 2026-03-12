// =====================================================
// tab1-chat-images.js - Image Upload & Paste Handling Module
// Upload with Firebase cache, paste handling, file input,
// multi-image preview, compression, send image/product to chat
// =====================================================
// Dependencies: tab1-chat-core.js (window.currentChatChannelId),
//               tab1-chat-messages.js (getImageDimensions - exposed via window)
// Exposes: window.uploadImageWithCache, window.updateMultipleImagesPreview,
//          window.clearAllImages, window.removeImageAtIndex, window.retryUploadAtIndex,
//          window.sendImageToChat, window.sendProductToChat, window.clearPastedImage,
//          handleChatInputPaste, handleFileInputChange (file-scoped, referenced by core.js)

console.log('[Tab1-Chat-Images] Loading...');

/**
 * Upload image with Firebase cache check
 * Returns uploaded image data or error
 * @param {Blob} imageBlob - Image blob to upload
 * @param {string|number} productId - Product ID (optional, for cache)
 * @param {string} productName - Product name (optional, for cache)
 * @param {string} channelId - Channel ID for Pancake upload
 * @param {string} productCode - Product code (optional, for cache key)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
window.uploadImageWithCache = async function uploadImageWithCache(imageBlob, productId, productName, channelId, productCode = null) {
    try {
        let contentUrl = null;
        let contentId = null;
        let dimensions = null;

        // Check Firebase cache if productId exists
        if ((productId || productName || productCode) && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Checking Firebase cache for product:', productId, productName, 'Code:', productCode);

            const cached = await window.firebaseImageCache.get(productId, productName, productCode);

            if (cached && (cached.content_id || cached.content_url)) {
                // CACHE HIT - prioritize content_id over content_url
                console.log('[UPLOAD-CACHE] Cache HIT! Reusing content_id:', cached.content_id, 'content_url:', cached.content_url);
                contentUrl = cached.content_url || null;
                contentId = cached.content_id || null;
                dimensions = await getImageDimensions(imageBlob);

                return {
                    success: true,
                    data: {
                        content_url: contentUrl,
                        content_id: contentId,
                        width: dimensions.width,
                        height: dimensions.height,
                        cached: true
                    }
                };
            }
        }

        // Cache miss or no productId - Upload to Pancake
        console.log('[UPLOAD-CACHE] Preparing upload to Pancake...');

        // Auto-compress if image is too large (Pancake limit: 500KB)
        const MAX_SIZE = 500 * 1024; // 500KB
        let blobToUpload = imageBlob;
        let compressionInfo = null;

        if (imageBlob.size > MAX_SIZE) {
            console.log(`[UPLOAD-CACHE] Image too large (${(imageBlob.size / 1024).toFixed(2)} KB > 500 KB), compressing...`);

            if (window.compressImage) {
                try {
                    const compressed = await window.compressImage(imageBlob, MAX_SIZE, 1920, 0.85);
                    blobToUpload = compressed.blob;
                    compressionInfo = compressed;
                    console.log(`[UPLOAD-CACHE] Compressed: ${(compressed.originalSize / 1024).toFixed(2)} KB → ${(compressed.compressedSize / 1024).toFixed(2)} KB (${compressed.compressionRatio} reduction)`);
                } catch (compressError) {
                    console.warn('[UPLOAD-CACHE] Compression failed, uploading original:', compressError);
                    // Continue with original blob
                }
            } else {
                console.warn('[UPLOAD-CACHE] compressImage function not available, uploading original (may fail)');
            }
        } else {
            console.log(`[UPLOAD-CACHE] Image size OK: ${(imageBlob.size / 1024).toFixed(2)} KB`);
        }

        // Upload to Pancake
        const [uploadResult, dims] = await Promise.all([
            window.pancakeDataManager.uploadImage(channelId, blobToUpload),
            compressionInfo ? Promise.resolve({ width: compressionInfo.width, height: compressionInfo.height }) : getImageDimensions(imageBlob)
        ]);

        // Check for error response from Pancake
        if (uploadResult.success === false || (!uploadResult.content_url && !uploadResult.id)) {
            const errorMsg = uploadResult.message || 'Upload failed';
            console.error('[UPLOAD-CACHE] Pancake upload error:', errorMsg);
            throw new Error(errorMsg);
        }

        contentUrl = uploadResult.content_url;
        contentId = uploadResult.id;
        dimensions = dims;

        console.log('[UPLOAD-CACHE] Upload success, content_id:', contentId);

        // Save to Firebase cache
        if ((productId || productName || productCode) && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Saving to Firebase cache...');
            await window.firebaseImageCache.set(productId, productName, contentUrl, contentId, productCode, dimensions?.width, dimensions?.height)
                .catch(err => {
                    console.warn('[UPLOAD-CACHE] Cache save failed (non-critical):', err);
                });
        }

        return {
            success: true,
            data: {
                content_url: contentUrl,
                content_id: contentId,
                width: dimensions.width,
                height: dimensions.height,
                cached: false
            }
        };

    } catch (error) {
        console.error('[UPLOAD-CACHE] Upload failed:', error);
        return {
            success: false,
            error: error.message || 'Upload failed'
        };
    }
}

/**
 * Handle paste event on chat input
 * NOW: Upload immediately after paste
 */
function handleChatInputPaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let hasImage = false;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            hasImage = true;
            event.preventDefault(); // Prevent default paste to avoid clearing text input

            const blob = item.getAsFile();
            currentPastedImage = blob;

            // Keep input enabled so user can press Enter to send or type additional text
            const chatInput = document.getElementById('chatReplyInput');
            if (chatInput) {
                chatInput.placeholder = 'Bấm Enter để gửi ảnh, hoặc nhập thêm tin nhắn...';
            }

            // Show preview with loading state
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const previewContainer = document.getElementById('chatImagePreviewContainer');
                    if (!previewContainer) return;

                    // Show preview with loading overlay
                    previewContainer.style.display = 'flex';
                    previewContainer.style.alignItems = 'center';
                    previewContainer.style.justifyContent = 'space-between';

                    previewContainer.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; position: relative;">
                        <img id="pastedImagePreview" src="${e.target.result}" style="height: 50px; border-radius: 4px; border: 1px solid #ddd; opacity: 0.5;">
                        <div id="uploadOverlay" style="position: absolute; left: 0; top: 0; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                        <span id="uploadStatus" style="font-size: 12px; color: #3b82f6;">Đang tải lên Pancake...</span>
                    </div>
                    <button onclick="clearPastedImage()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                    // Upload immediately
                    const productId = null; // Paste doesn't have productId
                    const productName = null;
                    const channelId = window.currentChatChannelId;

                    if (!channelId) {
                        console.warn('[PASTE] No channelId available, skipping upload');
                        // Initialize array if needed
                        if (!window.uploadedImagesData) {
                            window.uploadedImagesData = [];
                        }
                        window.uploadedImagesData.push({
                            blob: blob,
                            productId: null,
                            productName: null,
                            error: 'Thiếu thông tin channel',
                            uploadFailed: true
                        });
                        updateMultipleImagesPreview();
                        return;
                    }

                    const result = await uploadImageWithCache(blob, productId, productName, channelId);

                    // Initialize array if needed
                    if (!window.uploadedImagesData) {
                        window.uploadedImagesData = [];
                    }

                    if (result.success) {
                        // Upload success - ADD to array (not replace)
                        window.uploadedImagesData.push({
                            ...result.data,
                            blob: blob,
                            productId: productId,
                            productName: productName
                        });
                        updateMultipleImagesPreview(); // Update preview with all images
                    } else {
                        // Upload failed - still show in preview with error
                        window.uploadedImagesData.push({
                            blob: blob,
                            productId: productId,
                            productName: productName,
                            error: result.error,
                            uploadFailed: true
                        });
                        updateMultipleImagesPreview();
                    }
                } catch (error) {
                    console.error('[PASTE] Error handling paste:', error);
                    // Initialize array if needed
                    if (!window.uploadedImagesData) {
                        window.uploadedImagesData = [];
                    }
                    // Add failed image to array
                    window.uploadedImagesData.push({
                        blob: blob,
                        productId: null,
                        productName: null,
                        error: error.message || 'Lỗi không xác định',
                        uploadFailed: true
                    });
                    updateMultipleImagesPreview();
                }
            };
            reader.readAsDataURL(blob);
            break; // Only handle first image
        }
    }
}

/**
 * Handle file input change event (when user selects files via attachment button)
 * Supports multiple files selection
 */
function handleFileInputChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const channelId = window.currentChatChannelId;
    if (!channelId) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi file', 'warning');
        }
        return;
    }

    // Initialize array if needed
    if (!window.uploadedImagesData) {
        window.uploadedImagesData = [];
    }

    // Process each selected file
    Array.from(files).forEach(async (file) => {
        // Only process image files for now
        if (!file.type.startsWith('image/')) {
            console.log('[FILE-INPUT] Skipping non-image file:', file.name, file.type);
            if (window.notificationManager) {
                window.notificationManager.show(`Bỏ qua file không phải ảnh: ${file.name}`, 'warning');
            }
            return;
        }

        console.log('[FILE-INPUT] Processing image:', file.name, file.size, file.type);

        // Add to preview first (showing as uploading)
        const tempIndex = window.uploadedImagesData.length;
        window.uploadedImagesData.push({
            blob: file,
            productId: null,
            productName: file.name,
            uploading: true
        });
        updateMultipleImagesPreview();

        try {
            // Upload image
            const result = await window.uploadImageWithCache(file, null, file.name, channelId, null);

            if (result.success) {
                // Update with success data
                window.uploadedImagesData[tempIndex] = {
                    ...result.data,
                    blob: file,
                    productId: null,
                    productName: file.name
                };
                console.log('[FILE-INPUT] Upload success:', file.name);
            } else {
                // Update with error
                window.uploadedImagesData[tempIndex] = {
                    blob: file,
                    productId: null,
                    productName: file.name,
                    error: result.error || 'Upload failed',
                    uploadFailed: true
                };
                console.error('[FILE-INPUT] Upload failed:', file.name, result.error);
            }
        } catch (error) {
            console.error('[FILE-INPUT] Error uploading:', file.name, error);
            window.uploadedImagesData[tempIndex] = {
                blob: file,
                productId: null,
                productName: file.name,
                error: error.message || 'Lỗi không xác định',
                uploadFailed: true
            };
        }

        updateMultipleImagesPreview();
    });

    // Reset file input so same file can be selected again
    event.target.value = '';

    // Focus on chat input
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.focus();
    }
}

/**
 * Update preview UI for multiple images (horizontal scroll)
 */
window.updateMultipleImagesPreview = function updateMultipleImagesPreview() {
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (!previewContainer) return;

    if (!window.uploadedImagesData || window.uploadedImagesData.length === 0) {
        // No images - hide preview
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';

        // Re-enable text input
        const chatInput = document.getElementById('chatReplyInput');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.style.opacity = '1';
            chatInput.style.cursor = 'text';
            chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        }
        return;
    }

    // Show preview with horizontal scroll
    previewContainer.style.display = 'block';
    previewContainer.style.overflowX = 'auto';
    previewContainer.style.whiteSpace = 'nowrap';
    previewContainer.style.padding = '8px';
    previewContainer.style.background = '#f9fafb';
    previewContainer.style.borderRadius = '4px';

    let html = '<div style="display: flex; gap: 8px; align-items: flex-start;">';

    window.uploadedImagesData.forEach((imageData, index) => {
        const imageUrl = imageData.blob ? URL.createObjectURL(imageData.blob) : '';
        // Check content_id (from upload) instead of content_url (not returned by API)
        const hasContentId = !!(imageData.content_id || imageData.id);
        const isUploading = !hasContentId && !imageData.uploadFailed;
        const isSuccess = hasContentId && !imageData.uploadFailed;
        const isFailed = imageData.uploadFailed;
        const isCached = imageData.cached;

        html += `
            <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; position: relative;">
                <!-- Image preview -->
                <div style="position: relative; width: 80px; height: 80px;">
                    <img src="${imageUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid ${isFailed ? '#ef4444' : isSuccess ? '#10b981' : '#3b82f6'}; opacity: ${isUploading ? '0.5' : '1'};">

                    ${isUploading ? `
                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                    ` : ''}

                    <!-- Delete button (top-right) -->
                    <button onclick="removeImageAtIndex(${index})" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: 2px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; padding: 0;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Status text -->
                <span style="font-size: 10px; max-width: 80px; text-align: center; white-space: normal; line-height: 1.2;">
                    ${isUploading ? '<span style="color: #3b82f6;">Đang tải...</span>' :
                isFailed ? `<span style="color: #ef4444;">${imageData.error || 'Lỗi'}</span><br><button onclick="retryUploadAtIndex(${index})" style="margin-top: 2px; padding: 2px 6px; font-size: 9px; background: #3b82f6; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>` :
                    isCached ? '<span style="color: #10b981;"><i class="fas fa-recycle"></i> Đã có sẵn</span>' :
                        `<span style="color: #10b981;"><i class="fas fa-check"></i> ${Math.round((imageData.blob?.size || 0) / 1024)} KB</span>`}
                </span>
            </div>
        `;
    });

    html += `
        <!-- Clear all button -->
        <button onclick="clearAllImages()" style="margin-left: 8px; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; align-self: center; white-space: normal; font-size: 12px;">
            <i class="fas fa-trash"></i><br>Xóa tất cả
        </button>
    </div>`;

    previewContainer.innerHTML = html;

    // Keep input enabled so user can press Enter to send or type additional text
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.style.opacity = '1';
        chatInput.style.cursor = 'text';
        chatInput.placeholder = 'Bấm Enter để gửi ảnh, hoặc nhập thêm tin nhắn...';
    }

    // Update send button state based on upload status
    updateSendButtonState();
};

/**
 * Update send button state - disable if any image is still uploading
 */
function updateSendButtonState() {
    const sendBtn = document.getElementById('chatSendBtn');
    if (!sendBtn) return;

    // Check if any image is still uploading (check content_id instead of content_url)
    const hasUploadingImages = window.uploadedImagesData && window.uploadedImagesData.some(img =>
        !(img.content_id || img.id) && !img.uploadFailed
    );

    if (hasUploadingImages) {
        // Disable send button
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.title = 'Đang tải ảnh... Vui lòng đợi';
        window.isUploadingImages = true;
    } else {
        // Enable send button
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        sendBtn.title = 'Gửi tin nhắn';
        window.isUploadingImages = false;
    }
}

/**
 * Update upload preview UI based on upload result (DEPRECATED - use updateMultipleImagesPreview)
 */
window.updateUploadPreviewUI = function updateUploadPreviewUI(success, message, cached) {
    const preview = document.getElementById('pastedImagePreview');
    const overlay = document.getElementById('uploadOverlay');
    const status = document.getElementById('uploadStatus');

    if (!preview || !overlay || !status) return;

    if (success) {
        // Success - show normal preview
        preview.style.opacity = '1';
        overlay.style.display = 'none';

        if (cached) {
            status.innerHTML = '<i class="fas fa-recycle" style="color: #10b981; margin-right: 4px;"></i>Ảnh đã có sẵn';
            status.style.color = '#10b981';
        } else {
            status.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i>' + message;
            status.style.color = '#10b981';
        }
    } else {
        // Failed - show error with retry option
        preview.style.opacity = '1';
        overlay.style.display = 'none';
        status.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 4px;"></i>${message} <button onclick="retryUpload()" style="margin-left: 6px; padding: 2px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">Retry</button>`;
        status.style.color = '#ef4444';
    }
}

/**
 * Remove a single image at index
 */
window.removeImageAtIndex = function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    // Revoke blob URL if exists
    const imageData = window.uploadedImagesData[index];
    if (imageData.blob) {
        URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
    }

    // Remove from array
    window.uploadedImagesData.splice(index, 1);

    // Update preview
    updateMultipleImagesPreview();

    console.log('[REMOVE-IMAGE] Removed image at index', index, '- remaining:', window.uploadedImagesData.length);
};

/**
 * Clear all images
 */
window.clearAllImages = function () {
    // Revoke all blob URLs
    if (window.uploadedImagesData) {
        window.uploadedImagesData.forEach(imageData => {
            if (imageData.blob) {
                URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
            }
        });
    }

    // Clear array
    window.uploadedImagesData = [];

    // Update preview (will hide it)
    updateMultipleImagesPreview();

    console.log('[CLEAR-ALL-IMAGES] Cleared all images');
};

/**
 * Retry upload at specific index (for failed uploads)
 */
window.retryUploadAtIndex = async function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    const imageData = window.uploadedImagesData[index];
    if (!imageData.blob) return;

    console.log('[RETRY-UPLOAD] Retrying upload at index', index);

    // Mark as uploading
    window.uploadedImagesData[index] = {
        blob: imageData.blob,
        productId: imageData.productId,
        productName: imageData.productName
    };
    updateMultipleImagesPreview();

    // Retry upload
    const channelId = window.currentChatChannelId;
    if (!channelId) {
        window.uploadedImagesData[index].uploadFailed = true;
        window.uploadedImagesData[index].error = 'Không thể upload: Thiếu thông tin';
        updateMultipleImagesPreview();
        return;
    }

    const result = await window.uploadImageWithCache(
        imageData.blob,
        imageData.productId,
        imageData.productName,
        channelId,
        imageData.productCode
    );

    if (result.success) {
        // Update with success data
        window.uploadedImagesData[index] = {
            ...result.data,
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName
        };
    } else {
        // Update with error
        window.uploadedImagesData[index] = {
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName,
            error: result.error,
            uploadFailed: true
        };
    }

    updateMultipleImagesPreview();
};

/**
 * Retry upload when failed (DEPRECATED - use retryUploadAtIndex)
 */
window.retryUpload = async function () {
    if (!currentPastedImage) return;

    const status = document.getElementById('uploadStatus');
    const overlay = document.getElementById('uploadOverlay');
    const preview = document.getElementById('pastedImagePreview');

    if (status && overlay && preview) {
        status.textContent = 'Đang thử lại...';
        status.style.color = '#3b82f6';
        overlay.style.display = 'flex';
        preview.style.opacity = '0.5';
    }

    const productId = window.currentPastedImageProductId || null;
    const productName = window.currentPastedImageProductName || null;
    const channelId = window.currentChatChannelId;

    const result = await uploadImageWithCache(currentPastedImage, productId, productName, channelId);

    if (result.success) {
        uploadedImageData = result.data;
        window.uploadedImageData = result.data;
        updateUploadPreviewUI(true, `${Math.round(currentPastedImage.size / 1024)} KB`, result.data.cached);
    } else {
        uploadedImageData = null;
        window.uploadedImageData = null;
        updateUploadPreviewUI(false, result.error, false);
    }
};

/**
 * Clear pasted image (UI only - keeps uploaded image on Pancake/Firebase)
 */
window.clearPastedImage = function () {
    // Use clearAllImages for multiple images
    clearAllImages();

    // Legacy cleanup
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.currentPastedImageProductId = null;
    window.currentPastedImageProductName = null;

    console.log('[CLEAR-IMAGE] Cleared all images (UI only - images still on Pancake/Firebase)');
}

/**
 * Send product image to chat input
 * Checks Firebase cache first, if found uses cached content_id
 * Otherwise fetches image from URL, uploads to Pancake, and caches result
 * Called from Dropped Products tab and Orders tab (right-click on product image)
 * @param {string} imageUrl - URL of the product image
 * @param {string} productName - Name of the product
 * @param {number|string} productId - Product ID (optional, for Firebase cache)
 * @param {string} productCode - Product code (optional, for Firebase cache key)
 */
window.sendImageToChat = async function (imageUrl, productName, productId = null, productCode = null) {
    // Check if chat modal is open
    const chatModal = document.getElementById('chatModal');
    if (!chatModal || !chatModal.classList.contains('show')) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi ảnh', 'warning');
        } else {
            alert('Vui lòng mở chat trước khi gửi ảnh');
        }
        return;
    }

    // Check if we have channel ID for upload
    const channelId = window.currentChatChannelId;
    if (!channelId) {
        if (window.notificationManager) {
            window.notificationManager.show('Không có thông tin channel để upload ảnh', 'error');
        }
        return;
    }

    // Initialize uploaded images array if needed
    if (!window.uploadedImagesData) {
        window.uploadedImagesData = [];
    }

    try {
        console.log('[SEND-IMAGE-TO-CHAT] Product:', productId, productName, 'Code:', productCode);
        console.log('[SEND-IMAGE-TO-CHAT] Image URL:', imageUrl);

        // Check Firebase cache first (using productCode as primary cache key)
        if (window.firebaseImageCache && (productId || productName || productCode)) {
            console.log('[SEND-IMAGE-TO-CHAT] Checking Firebase cache...');

            // Pass productId, productName, and productCode - cache will use productCode as primary key
            const cached = await window.firebaseImageCache.get(productId, productName, productCode);

            if (cached && cached.content_id) {
                // CACHE HIT - Use cached content_id directly (no upload needed!)
                console.log('[SEND-IMAGE-TO-CHAT] Cache HIT! Using cached content_id:', cached.content_id);

                if (window.notificationManager) {
                    window.notificationManager.show('Đã dùng ảnh đã lưu (không cần upload)', 'success');
                }

                // Fetch blob from imageUrl for preview display
                const WORKER_URL = API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const proxyUrl = `${WORKER_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;

                let blob = null;
                try {
                    const response = await fetch(proxyUrl);
                    if (response.ok) {
                        blob = await response.blob();
                    }
                } catch (err) {
                    console.warn('[SEND-IMAGE-TO-CHAT] Could not fetch blob for preview:', err);
                }

                // Add to preview with cached data
                window.uploadedImagesData.push({
                    content_url: cached.content_url || null,
                    content_id: cached.content_id,
                    width: cached.width || 0,
                    height: cached.height || 0,
                    blob: blob,  // Include blob for preview
                    productId: productId,
                    productName: productName,
                    productCode: productCode,
                    cached: true
                });
                window.updateMultipleImagesPreview();

                // Focus on chat input
                const chatInput = document.getElementById('chatReplyInput');
                if (chatInput) {
                    chatInput.focus();
                }

                return; // Done - no need to upload
            }

            console.log('[SEND-IMAGE-TO-CHAT] Cache miss, proceeding to upload...');
        }

        // Show loading notification
        if (window.notificationManager) {
            window.notificationManager.show('Đang tải ảnh...', 'info');
        }

        // Use Cloudflare Worker image proxy to bypass CORS
        const WORKER_URL = API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const proxyUrl = `${WORKER_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;

        console.log('[SEND-IMAGE-TO-CHAT] Using proxy URL:', proxyUrl);

        // Fetch image through proxy and convert to blob
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error('Không thể tải ảnh từ URL');
        }

        const blob = await response.blob();

        // Add to preview first (showing as uploading)
        window.uploadedImagesData.push({
            blob: blob,
            productId: productId,
            productName: productName,
            productCode: productCode,
            uploading: true
        });
        window.updateMultipleImagesPreview();

        // Upload to Pancake
        console.log('[SEND-IMAGE-TO-CHAT] Uploading to Pancake...');

        const uploadResult = await window.pancakeDataManager.uploadImage(channelId, blob);

        // Update the last added item with upload result
        const lastIndex = window.uploadedImagesData.length - 1;

        if (uploadResult && uploadResult.id) {
            const contentId = uploadResult.id;
            const contentUrl = uploadResult.content_url;

            // Get dimensions for cache storage
            const dimensions = await getImageDimensions(blob);

            window.uploadedImagesData[lastIndex] = {
                content_url: contentUrl,
                content_id: contentId,
                blob: blob,
                width: dimensions.width,
                height: dimensions.height,
                productId: productId,
                productName: productName,
                productCode: productCode
            };

            console.log('[SEND-IMAGE-TO-CHAT] Upload success! content_id:', contentId);

            // Save to Firebase cache (using productCode as primary cache key)
            if (window.firebaseImageCache && (productId || productName || productCode)) {
                console.log('[SEND-IMAGE-TO-CHAT] Saving to Firebase cache...');
                await window.firebaseImageCache.set(productId, productName, contentUrl, contentId, productCode, dimensions.width, dimensions.height)
                    .catch(err => {
                        console.warn('[SEND-IMAGE-TO-CHAT] Cache save failed (non-critical):', err);
                    });
            }

            if (window.notificationManager) {
                window.notificationManager.show('Đã thêm ảnh vào tin nhắn', 'success');
            }
        } else {
            window.uploadedImagesData[lastIndex] = {
                blob: blob,
                productId: productId,
                productName: productName,
                productCode: productCode,
                error: 'Upload failed - no content_id returned',
                uploadFailed: true
            };
            console.error('[SEND-IMAGE-TO-CHAT] Upload failed: no content_id');
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi upload ảnh', 'error');
            }
        }

        // Update preview
        window.updateMultipleImagesPreview();

        // Focus on chat input
        const chatInput = document.getElementById('chatReplyInput');
        if (chatInput) {
            chatInput.focus();
        }

    } catch (error) {
        console.error('[SEND-IMAGE-TO-CHAT] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi khi gửi ảnh: ' + error.message, 'error');
        }
    }
};

/**
 * Send product name/info to chat input
 * Inserts product name into the chat message textarea
 * Called from Dropped Products tab (click on send button)
 * @param {number} productId - Product ID
 * @param {string} productName - Name of the product
 */
window.sendProductToChat = function (productId, productName) {
    // Check if chat modal is open
    const chatModal = document.getElementById('chatModal');
    if (!chatModal || !chatModal.classList.contains('show')) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi tên sản phẩm', 'warning');
        } else {
            alert('Vui lòng mở chat trước khi gửi tên sản phẩm');
        }
        return;
    }

    const chatInput = document.getElementById('chatReplyInput');
    if (!chatInput) {
        console.error('[SEND-PRODUCT-TO-CHAT] Chat input not found');
        return;
    }

    // Insert product name at cursor position or append
    const currentValue = chatInput.value;
    const cursorPos = chatInput.selectionStart;

    if (currentValue) {
        // Append with newline if there's existing text
        const before = currentValue.substring(0, cursorPos);
        const after = currentValue.substring(cursorPos);
        const separator = before.endsWith('\n') || before === '' ? '' : '\n';
        chatInput.value = before + separator + productName + after;
    } else {
        chatInput.value = productName;
    }

    // Focus and trigger resize
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));

    console.log('[SEND-PRODUCT-TO-CHAT] Added product name:', productName);

    if (window.notificationManager) {
        window.notificationManager.show('Đã thêm tên sản phẩm vào tin nhắn', 'success');
    }
};

// Expose file-scoped functions for use by other modules
window.handleChatInputPaste = handleChatInputPaste;
window.handleFileInputChange = handleFileInputChange;
window.updateSendButtonState = updateSendButtonState;

console.log('[Tab1-Chat-Images] Loaded successfully.');
