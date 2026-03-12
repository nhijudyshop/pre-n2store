/**
 * IMAGE UTILS
 * File: image-utils.js
 * Purpose: Image compression and manipulation utilities
 */

window.ImageUtils = (function() {
    'use strict';

    /**
     * Compress image file using canvas
     * @param {File} file - Image file to compress
     * @param {number} maxSizeMB - Maximum size in MB (default: 1)
     * @param {number} maxWidth - Maximum width in pixels (default: 1920)
     * @param {number} maxHeight - Maximum height in pixels (default: 1920)
     * @returns {Promise<File>}
     */
    async function compressImage(file, maxSizeMB = 1, maxWidth = 1920, maxHeight = 1920) {
        // Skip if already small enough
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (file.size <= maxSizeBytes) {
            return file;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    try {
                        // Calculate new dimensions keeping aspect ratio
                        let { width, height } = img;
                        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);

                        // Create canvas and draw resized image
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Try different quality levels
                        let quality = 0.9;
                        const minQuality = 0.5;

                        const tryCompress = () => {
                            canvas.toBlob((blob) => {
                                if (!blob) {
                                    reject(new Error('Failed to compress image'));
                                    return;
                                }

                                if (blob.size <= maxSizeBytes || quality <= minQuality) {
                                    // Success or reached minimum quality
                                    const compressedFile = new File(
                                        [blob],
                                        file.name.replace(/\.\w+$/, '.jpg'),
                                        { type: 'image/jpeg' }
                                    );
                                    resolve(compressedFile);
                                } else {
                                    // Reduce quality and try again
                                    quality -= 0.1;
                                    tryCompress();
                                }
                            }, 'image/jpeg', quality);
                        };

                        tryCompress();
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Convert image URL to base64
     * @param {string} url - Image URL
     * @param {number} maxWidth - Max width for resize (optional)
     * @param {number} maxHeight - Max height for resize (optional)
     * @returns {Promise<string>} - Base64 string without data: prefix
     */
    async function urlToBase64(url, maxWidth = 800, maxHeight = 800) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    // Calculate dimensions
                    let { width, height } = img;
                    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);

                    // Draw to canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Get base64 without prefix
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

                    resolve(base64);
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        });
    }

    /**
     * Convert File/Blob to base64
     * @param {File|Blob} file
     * @returns {Promise<string>} - Base64 string without data: prefix
     */
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.replace(/^data:.*?;base64,/, '');
                resolve(base64);
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Convert base64 to Blob
     * @param {string} base64 - Base64 string (with or without data: prefix)
     * @param {string} mimeType - MIME type (default: image/jpeg)
     * @returns {Blob}
     */
    function base64ToBlob(base64, mimeType = 'image/jpeg') {
        // Remove data: prefix if present
        const cleanBase64 = base64.replace(/^data:.*?;base64,/, '');

        const byteCharacters = atob(cleanBase64);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);

            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type: mimeType });
    }

    /**
     * Get image dimensions
     * @param {string|File} source - Image URL or File
     * @returns {Promise<{width: number, height: number}>}
     */
    function getImageDimensions(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };

            img.onerror = () => reject(new Error('Failed to load image'));

            if (source instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => { img.src = e.target.result; };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(source);
            } else {
                img.src = source;
            }
        });
    }

    /**
     * Generate order image for clipboard (product image + variant/quantity label)
     * @param {string} imageUrl - Product image URL
     * @param {string} variant - Variant string (e.g., "ĐỎ, M")
     * @param {number} quantity - Quantity
     * @param {string} productName - Product name (optional, for tooltip)
     * @returns {Promise<void>} - Copies to clipboard
     */
    async function generateOrderImage(imageUrl, variant, quantity, productName = '') {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = async () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Canvas dimensions
                    const canvasWidth = 400;
                    const imageHeight = Math.round(canvasWidth * 0.75); // 3:4 aspect
                    const labelHeight = 50;
                    const canvasHeight = imageHeight + labelHeight;

                    canvas.width = canvasWidth;
                    canvas.height = canvasHeight;

                    // Draw image (object-fit: cover)
                    const imgRatio = img.width / img.height;
                    const targetRatio = canvasWidth / imageHeight;

                    let sx, sy, sWidth, sHeight;
                    if (imgRatio > targetRatio) {
                        // Image wider than target
                        sHeight = img.height;
                        sWidth = sHeight * targetRatio;
                        sx = (img.width - sWidth) / 2;
                        sy = 0;
                    } else {
                        // Image taller than target
                        sWidth = img.width;
                        sHeight = sWidth / targetRatio;
                        sx = 0;
                        sy = (img.height - sHeight) / 2;
                    }

                    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, imageHeight);

                    // Draw label background (red)
                    ctx.fillStyle = '#dc2626';
                    ctx.fillRect(0, imageHeight, canvasWidth, labelHeight);

                    // Draw label text
                    const labelText = `${variant || ''} - ${quantity}`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Auto-scale font size
                    let fontSize = 24;
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    const textWidth = ctx.measureText(labelText).width;
                    if (textWidth > canvasWidth * 0.9) {
                        fontSize = Math.floor((canvasWidth * 0.9 / textWidth) * fontSize);
                        ctx.font = `bold ${fontSize}px sans-serif`;
                    }

                    ctx.fillText(labelText, canvasWidth / 2, imageHeight + labelHeight / 2);

                    // Copy to clipboard
                    canvas.toBlob(async (blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create image blob'));
                            return;
                        }

                        try {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            resolve();
                        } catch (clipboardError) {
                            reject(new Error('Failed to copy to clipboard: ' + clipboardError.message));
                        }
                    }, 'image/png');
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageUrl;
        });
    }

    /**
     * Check if file is an image
     * @param {File} file
     * @returns {boolean}
     */
    function isImageFile(file) {
        if (!file) return false;
        return file.type.startsWith('image/') ||
            /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
    }

    /**
     * Get priority-based image URL
     * @param {string[]|null} productImages - Uploaded images (priority 1)
     * @param {string|null} tposImageUrl - TPOS image (priority 2)
     * @param {string|null} parentImageUrl - Parent's image (priority 3)
     * @returns {string|null}
     */
    function getProductImageUrl(productImages, tposImageUrl, parentImageUrl = null) {
        // Priority 1: Uploaded images
        if (productImages && productImages.length > 0) {
            return productImages[0];
        }

        // Priority 2: TPOS image
        if (tposImageUrl) {
            return tposImageUrl;
        }

        // Priority 3: Parent image
        if (parentImageUrl) {
            return parentImageUrl;
        }

        return null;
    }

    /**
     * Create image cache for TPOS payload
     * @param {string[]} urls - Image URLs to cache
     * @param {number} maxWidth
     * @param {number} maxHeight
     * @returns {Promise<Map<string, string>>} - URL to base64 map
     */
    async function createImageCache(urls, maxWidth = 800, maxHeight = 800) {
        const cache = new Map();

        for (const url of urls) {
            if (!url) continue;

            try {
                const base64 = await urlToBase64(url, maxWidth, maxHeight);
                cache.set(url, base64);
            } catch (error) {
                console.warn(`Failed to cache image: ${url}`, error);
            }
        }

        return cache;
    }

    // Public API
    return {
        compressImage,
        urlToBase64,
        fileToBase64,
        base64ToBlob,
        getImageDimensions,
        generateOrderImage,
        isImageFile,
        getProductImageUrl,
        createImageCache
    };
})();
