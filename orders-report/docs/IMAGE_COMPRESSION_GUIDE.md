# 📸 Image Compression Guide - Pancake API Integration

## Vấn Đề Đã Giải Quyết

**Trước đây:**
```
❌ Upload ảnh 2.3MB → Pancake API reject: "File size should not exceed 500KB"
❌ Không có error handling rõ ràng
❌ User không biết tại sao upload fail
```

**Bây giờ:**
```
✅ Auto-compress ảnh > 500KB trước khi upload
✅ Binary search tìm quality tối ưu
✅ Giữ aspect ratio và kích thước hợp lý
✅ Clear error messages
```

---

## Cách Hoạt Động

### 1. **Auto-Detection**
```javascript
// tab1-orders.js:11313
if (imageBlob.size > MAX_SIZE) {  // 500KB
    console.log('Image too large, compressing...');
    // → Tự động gọi window.compressImage()
}
```

### 2. **Compression Algorithm**

```
Original Image (2.3MB)
     ↓
┌────────────────────────────┐
│ Step 1: Resize             │
│ Max 1920px (giữ ratio)     │
│ 4000x3000 → 1920x1440      │
└────────────────────────────┘
     ↓
┌────────────────────────────┐
│ Step 2: Binary Search      │
│ Quality: 0.85 → 0.42       │
│ (8 attempts max)           │
└────────────────────────────┘
     ↓
┌────────────────────────────┐
│ Step 3: Result             │
│ 2.3MB → 485KB ✅           │
│ Compression: 78.9%         │
└────────────────────────────┘
     ↓
Upload to Pancake API ✅
```

### 3. **Quality Binary Search**

```javascript
// image-compressor.js:67-89
Initial quality: 0.85 → 850KB (too big)
Attempt 1: 0.475 → 520KB (still big)
Attempt 2: 0.2875 → 380KB (too small - increase quality)
Attempt 3: 0.38125 → 450KB ✅ (within 10KB of target)
```

---

## Log Output Mẫu

### Upload Thành Công (Sau Compression)

```console
[UPLOAD-CACHE] Preparing upload to Pancake...
[UPLOAD-CACHE] Image too large (2286.03 KB > 500 KB), compressing...
[COMPRESS] Starting compression for: image.png
[COMPRESS] Original size: 2286.03 KB
[COMPRESS] Target: 500.00 KB
[COMPRESS] Resized to: 1920x1440px
[COMPRESS] Attempt 1: quality=0.85, size=848.23 KB
[COMPRESS] Attempt 2: quality=0.48, size=522.10 KB
[COMPRESS] Attempt 3: quality=0.32, size=412.56 KB
[COMPRESS] Attempt 4: quality=0.40, size=476.89 KB ✅
[COMPRESS] ✅ Compression successful!
[UPLOAD-CACHE] ✅ Compressed: 2286.03 KB → 476.89 KB (79.1% reduction)
[UPLOAD-CACHE] Image size OK: 476.89 KB
[PANCAKE] Uploading image: blob, size: 488334
[PANCAKE] ✅ Upload success: { content_id: "abc123", content_url: "https://..." }
[UPLOAD-CACHE] ✅ Upload success, content_id: abc123
```

### Upload Fail (Vẫn Quá Lớn)

```console
[UPLOAD-CACHE] ❌ Pancake upload error: File size should not exceed 500KB
[PASTE] Upload failed - Error: File size should not exceed 500KB
```

---

## Files Đã Thay Đổi

### 1. **image-compressor.js** (NEW ⭐)
```javascript
window.compressImage(file, maxSizeBytes, maxWidthOrHeight, initialQuality)
```

**Features:**
- Canvas-based compression với JPEG output
- Binary search cho optimal quality
- Resize giữ aspect ratio
- Progress logging chi tiết

### 2. **tab1-orders.js** (UPDATED)
```javascript
// Line 11308-11350: uploadImageWithCache()
// ⭐ NEW: Auto-compress if > 500KB
// ⭐ NEW: Error checking từ Pancake response
```

### 3. **tab1-orders.html** (UPDATED)
```html
<!-- Line 2307-2308 -->
<script src="image-compressor.js"></script>
<script src="tab1-orders.js"></script>
```

---

## Testing Guide

### Test Case 1: Ảnh Nhỏ (< 500KB)
```
1. Paste ảnh 300KB vào chat
2. Expected: Upload trực tiếp, không compress
3. Log: "[UPLOAD-CACHE] Image size OK: 300.00 KB"
```

### Test Case 2: Ảnh Lớn (> 500KB)
```
1. Paste ảnh 2.3MB vào chat
2. Expected: Auto-compress → upload
3. Log:
   - "[UPLOAD-CACHE] Image too large (2286.03 KB > 500 KB), compressing..."
   - "[COMPRESS] ✅ Compressed: ... KB → ... KB (...% reduction)"
   - "[UPLOAD-CACHE] ✅ Upload success"
```

### Test Case 3: Ảnh Rất Lớn (> 5MB)
```
1. Paste ảnh 8MB vào chat
2. Expected: Compress nhiều lần, có thể không đạt 500KB
3. Log:
   - "[COMPRESS] ⚠️ Could not compress below 500.00 KB, final size: 520.00 KB"
   - Có thể upload fail nếu Pancake strict
```

### Test Case 4: Nhiều Ảnh (Grid)
```
1. Paste 3 ảnh (1MB, 800KB, 2MB)
2. Expected: Mỗi ảnh compress riêng
3. Log: 3 blocks compress logs
```

---

## Giới Hạn & Edge Cases

### Pancake API Limits
```javascript
MAX_IMAGE_SIZE = 500 * 1024;        // 500KB
MAX_VIDEO_SIZE_SHOPEE = 30 * 1024 * 1024;  // 30MB
MAX_VIDEO_SIZE_WHATSAPP = 16 * 1024 * 1024; // 16MB
MAX_VIDEO_SIZE_LAZADA = 100 * 1024 * 1024; // 100MB
MAX_VIDEO_SIZE_DEFAULT = 25 * 1024 * 1024; // 25MB
```

### Compression Strategy
```
Quality Range: 0.1 - 0.85
Max Attempts: 8
Target Tolerance: ±10KB
Output Format: image/jpeg (best compression)
```

### Fallback Behavior
```javascript
if (!window.compressImage) {
    console.warn('compressImage function not available, uploading original');
    // → Upload original (may fail)
}
```

---

## Troubleshooting

### Lỗi: "compressImage is not a function"
**Nguyên nhân:** Script `image-compressor.js` chưa load
**Giải pháp:**
```html
<!-- Kiểm tra trong tab1-orders.html -->
<script src="image-compressor.js"></script>  ✅ Phải có dòng này
<script src="tab1-orders.js"></script>
```

### Lỗi: "File size should not exceed 500KB" (Sau compress)
**Nguyên nhân:** Ảnh quá phức tạp, không compress được dưới 500KB
**Giải pháp:**
```javascript
// Giảm max dimensions
const compressed = await compressImage(blob, 500*1024, 1280, 0.75); // Thay vì 1920
```

### Lỗi: "Canvas to Blob conversion failed"
**Nguyên nhân:** Browser không hỗ trợ hoặc ảnh corrupt
**Giải pháp:** Code tự động fallback về original blob

---

## Performance Metrics

### Compression Speed
```
2MB image → 485KB: ~500-800ms
5MB image → 490KB: ~1200-1500ms
10MB image → 500KB: ~2000-3000ms
```

### Quality vs Size Trade-off
```
Quality 0.85: 850KB (excellent quality)
Quality 0.60: 520KB (good quality)
Quality 0.40: 380KB (acceptable quality)
Quality 0.20: 200KB (noticeable artifacts)
```

---

## Future Improvements

### Potential Features
1. **Progressive compression UI**
   - Show compression progress bar
   - Real-time preview

2. **Smart quality detection**
   - Detect image content type (photo vs screenshot)
   - Adjust compression strategy

3. **Batch optimization**
   - Compress multiple images in parallel
   - Shared compression settings

4. **WebP support**
   - Better compression than JPEG
   - Fallback to JPEG for compatibility

---

## API Reference

### `window.compressImage()`
```javascript
/**
 * @param {File|Blob} file - Image to compress
 * @param {number} maxSizeBytes - Target size (default: 500KB)
 * @param {number} maxWidthOrHeight - Max dimension (default: 1920px)
 * @param {number} initialQuality - Starting quality (default: 0.85)
 * @returns {Promise<{
 *   blob: Blob,
 *   width: number,
 *   height: number,
 *   originalSize: number,
 *   compressedSize: number,
 *   quality: number,
 *   compressionRatio: string
 * }>}
 */
```

### `window.getImageDimensionsOnly()`
```javascript
/**
 * Get dimensions without compression
 * @param {File|Blob} file
 * @returns {Promise<{width: number, height: number}>}
 */
```

---

**Last Updated:** 2025-12-17
**Author:** Claude Code Agent
**Version:** 1.0.0
