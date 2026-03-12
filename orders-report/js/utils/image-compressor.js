/**
 * Image Compressor Utility
 * Auto-compress images to fit Pancake API limit (500KB)
 *
 * Usage:
 *   const compressed = await compressImage(file, 500 * 1024); // 500KB target
 */

/**
 * Compress image to target size using Canvas API
 * @param {File|Blob} file - Image file to compress
 * @param {number} maxSizeBytes - Maximum file size in bytes (default: 500KB)
 * @param {number} maxWidthOrHeight - Maximum width/height (default: 1920px)
 * @param {number} initialQuality - Initial compression quality (default: 0.85)
 * @returns {Promise<{blob: Blob, width: number, height: number, originalSize: number, compressedSize: number, quality: number}>}
 */
window.compressImage = async function compressImage(
    file,
    maxSizeBytes = 500 * 1024,  // 500KB default
    maxWidthOrHeight = 1920,
    initialQuality = 0.85
) {
    console.log(`[COMPRESS] Starting compression for: ${file.name || 'image'}`);
    console.log(`[COMPRESS] Original size: ${(file.size / 1024).toFixed(2)} KB`);
    console.log(`[COMPRESS] Target: ${(maxSizeBytes / 1024).toFixed(2)} KB`);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('Failed to read file'));

        reader.onload = async function(e) {
            try {
                const img = new Image();

                img.onerror = () => reject(new Error('Failed to load image'));

                img.onload = async function() {
                    // Calculate new dimensions while maintaining aspect ratio
                    let { width, height } = img;

                    if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
                        if (width > height) {
                            height = Math.round((height / width) * maxWidthOrHeight);
                            width = maxWidthOrHeight;
                        } else {
                            width = Math.round((width / height) * maxWidthOrHeight);
                            height = maxWidthOrHeight;
                        }
                        console.log(`[COMPRESS] Resized to: ${width}x${height}px`);
                    } else {
                        console.log(`[COMPRESS] No resize needed: ${width}x${height}px`);
                    }

                    // Create canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // Draw image on canvas
                    ctx.drawImage(img, 0, 0, width, height);

                    // Binary search for optimal quality
                    let quality = initialQuality;
                    let blob = null;
                    let attempt = 0;
                    const maxAttempts = 8;

                    // First attempt
                    blob = await canvasToBlob(canvas, quality);
                    console.log(`[COMPRESS] Attempt 1: quality=${quality.toFixed(2)}, size=${(blob.size / 1024).toFixed(2)} KB`);

                    // If first attempt is already under limit, return it
                    if (blob.size <= maxSizeBytes) {
                        console.log(`[COMPRESS] ✅ Success on first try!`);

                        // ⭐ Convert to File object
                        const originalName = file.name || 'image.png';
                        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
                        const compressedFileName = `${nameWithoutExt}_compressed.jpg`;
                        const fileObject = new File([blob], compressedFileName, { type: 'image/jpeg' });

                        console.log(`[COMPRESS] Created File object: ${compressedFileName}, type: ${fileObject.type}`);

                        resolve({
                            blob: fileObject,
                            width,
                            height,
                            originalSize: file.size,
                            compressedSize: fileObject.size,
                            quality: quality,
                            compressionRatio: ((1 - fileObject.size / file.size) * 100).toFixed(1) + '%'
                        });
                        return;
                    }

                    // Binary search for optimal quality
                    let minQuality = 0.1;
                    let maxQuality = quality;

                    while (attempt < maxAttempts && Math.abs(blob.size - maxSizeBytes) > 10 * 1024) {
                        attempt++;

                        if (blob.size > maxSizeBytes) {
                            maxQuality = quality;
                        } else {
                            minQuality = quality;
                        }

                        quality = (minQuality + maxQuality) / 2;
                        blob = await canvasToBlob(canvas, quality);

                        console.log(`[COMPRESS] Attempt ${attempt + 1}: quality=${quality.toFixed(2)}, size=${(blob.size / 1024).toFixed(2)} KB`);

                        if (blob.size <= maxSizeBytes) {
                            break;
                        }
                    }

                    // Final check
                    if (blob.size > maxSizeBytes) {
                        console.warn(`[COMPRESS] ⚠️ Could not compress below ${(maxSizeBytes / 1024).toFixed(2)} KB, final size: ${(blob.size / 1024).toFixed(2)} KB`);
                    } else {
                        console.log(`[COMPRESS] ✅ Compression successful!`);
                    }

                    // ⭐ Convert Blob to File object with proper name and type
                    // This is critical for Pancake API to generate content_url
                    const originalName = file.name || 'image.png';
                    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
                    const compressedFileName = `${nameWithoutExt}_compressed.jpg`;
                    const fileObject = new File([blob], compressedFileName, { type: 'image/jpeg' });

                    console.log(`[COMPRESS] Created File object: ${compressedFileName}, type: ${fileObject.type}`);

                    resolve({
                        blob: fileObject,  // Now it's a File, not just a Blob
                        width,
                        height,
                        originalSize: file.size,
                        compressedSize: fileObject.size,
                        quality: quality,
                        compressionRatio: ((1 - fileObject.size / file.size) * 100).toFixed(1) + '%'
                    });
                };

                img.src = e.target.result;

            } catch (error) {
                reject(error);
            }
        };

        reader.readAsDataURL(file);
    });
};

/**
 * Helper: Convert canvas to blob with specified quality
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Canvas to Blob conversion failed'));
                }
            },
            'image/jpeg',  // Always convert to JPEG for better compression
            quality
        );
    });
}

/**
 * Get image dimensions without compression
 * @param {File|Blob} file
 * @returns {Promise<{width: number, height: number}>}
 */
window.getImageDimensionsOnly = async function getImageDimensionsOnly(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = function(e) {
            const img = new Image();
            img.onerror = () => reject(new Error('Failed to load image'));
            img.onload = function() {
                resolve({ width: img.width, height: img.height });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

console.log('[IMAGE-COMPRESSOR] ✅ Image compressor utility loaded');
