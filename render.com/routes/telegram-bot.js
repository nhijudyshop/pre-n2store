// =====================================================
// TELEGRAM BOT WITH GEMINI AI INTEGRATION
// Webhook endpoint for Telegram bot powered by Gemini 3 Flash
// Supports: Text chat, Invoice image processing, Group chats
// =====================================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const firebaseStorageService = require('../services/firebase-storage-service');

// API Keys from environment variables (set on Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview'; // Latest Gemini 3 Flash model

// =====================================================
// FIREBASE INITIALIZATION (using shared service)
// =====================================================

function getFirestoreDb() {
    return firebaseStorageService.getFirestore();
}

/**
 * Delete image from Firebase Storage (delegates to shared service)
 */
async function deleteImageFromStorage(imageUrl) {
    return firebaseStorageService.deleteImage(imageUrl);
}

/**
 * Generate unique ID with prefix
 */
function generateId(prefix = 'id') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Check if NCC document exists
 */
async function checkNCCExists(sttNCC) {
    const firestore = getFirestoreDb();
    if (!firestore) return false;

    const docId = `ncc_${sttNCC}`;
    const doc = await firestore.collection('inventory_tracking').doc(docId).get();
    return doc.exists;
}

/**
 * Convert products to sanPham format
 */
function convertProducts(products) {
    return (products || []).map(p => {
        const maSP = p.sku || '';
        const tenSP = p.name || '';
        const soMau = p.color || '';
        const soLuong = p.quantity || 0;
        const giaDonVi = p.price || 0;

        // Vietnamese translation for display
        const tenSP_vi = translateToVietnamese(tenSP);
        const soMau_vi = translateToVietnamese(soMau);

        // Build rawText for display
        const rawText = `MA ${maSP} ${tenSP} MAU ${soMau} SL ${soLuong}`;
        const rawText_vi = `MA ${maSP} ${tenSP_vi} MAU ${soMau_vi} SL ${soLuong}`;

        return {
            maSP,
            tenSP,
            tenSP_vi,
            soMau,
            soMau_vi,
            soLuong,
            giaDonVi,
            rawText,
            rawText_vi
        };
    });
}

/**
 * Calculate soMonThieu (difference between order and delivery)
 */
function calculateSoMonThieu(datHangList, tongMonThucGiao) {
    if (!datHangList || datHangList.length === 0) return 0;

    // Get tongMon from latest datHang
    const latestDatHang = datHangList[datHangList.length - 1];
    const tongMonDat = latestDatHang.tongMon || 0;

    return Math.max(0, tongMonDat - tongMonThucGiao);
}

/**
 * Create datHang entry (Tab 1 - Đặt hàng) for NEW NCC
 * Creates NCC document and adds first datHang entry
 */
async function createDatHang(invoiceData, imageUrl, chatId, userId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const sttNCC = parseInt(invoiceData.ncc, 10);
    const docId = `ncc_${sttNCC}`;
    const sanPham = convertProducts(invoiceData.products);
    const tongMon = sanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    const datHangEntry = {
        id: generateId('booking'),
        ngayDatHang: getTodayDate(),
        tenNCC: invoiceData.supplier || '',
        trangThai: 'pending',
        sanPham: sanPham,
        tongTienHD: invoiceData.totalAmount || 0,
        tongMon: tongMon,
        anhHoaDon: imageUrl ? [imageUrl] : [],
        ghiChu: invoiceData.notes || '',
        source: 'telegram_bot',
        telegramChatId: chatId,
        createdAt: new Date().toISOString(),
        createdBy: `telegram_${userId}`,
        updatedAt: new Date().toISOString(),
        updatedBy: `telegram_${userId}`
    };

    // Create new NCC document with datHang
    await firestore.collection('inventory_tracking').doc(docId).set({
        sttNCC: sttNCC,
        datHang: [datHangEntry],
        dotHang: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[FIREBASE] Created NCC ${sttNCC} with datHang:`, datHangEntry.id);

    return {
        docId: docId,
        entryId: datHangEntry.id,
        type: 'datHang',
        isNew: true,
        tongMon: tongMon
    };
}

/**
 * Add or Update dotHang entry (Tab 2 - Theo dõi đơn hàng) for EXISTING NCC
 * - If dotHang with same ngayDiHang exists: UPDATE it
 * - If no dotHang with same ngayDiHang: ADD new dotHang
 */
async function addOrUpdateDotHang(invoiceData, imageUrl, chatId, userId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const sttNCC = parseInt(invoiceData.ncc, 10);
    const docId = `ncc_${sttNCC}`;
    const today = getTodayDate();

    // Get NCC document
    const docRef = firestore.collection('inventory_tracking').doc(docId);
    const doc = await docRef.get();
    const data = doc.data();

    const dotHang = data.dotHang || [];
    const datHang = data.datHang || [];
    const sanPham = convertProducts(invoiceData.products);
    const tongMon = sanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    // Calculate soMonThieu
    const soMonThieu = calculateSoMonThieu(datHang, tongMon);

    // Find existing dotHang with same date
    const existingIndex = dotHang.findIndex(d => d.ngayDiHang === today);

    let isUpdate = false;
    let entryId = '';

    if (existingIndex !== -1) {
        // UPDATE existing dotHang
        isUpdate = true;
        entryId = dotHang[existingIndex].id;

        // Merge sanPham arrays
        const existingSanPham = dotHang[existingIndex].sanPham || [];
        const mergedSanPham = [...existingSanPham, ...sanPham];

        // Merge anhHoaDon arrays
        const existingImages = dotHang[existingIndex].anhHoaDon || [];
        const mergedImages = imageUrl ? [...existingImages, imageUrl] : existingImages;

        // Update the entry
        dotHang[existingIndex] = {
            ...dotHang[existingIndex],
            sanPham: mergedSanPham,
            tongTienHD: (dotHang[existingIndex].tongTienHD || 0) + (invoiceData.totalAmount || 0),
            tongMon: mergedSanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0),
            soMonThieu: calculateSoMonThieu(datHang, mergedSanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0)),
            anhHoaDon: mergedImages,
            ghiChu: dotHang[existingIndex].ghiChu
                ? `${dotHang[existingIndex].ghiChu}\n${invoiceData.notes || ''}`.trim()
                : (invoiceData.notes || ''),
            updatedAt: new Date().toISOString(),
            updatedBy: `telegram_${userId}`
        };

        console.log(`[FIREBASE] Updated dotHang for NCC ${sttNCC}, date ${today}`);
    } else {
        // ADD new dotHang
        entryId = generateId('dot');

        const newDotHang = {
            id: entryId,
            ngayDiHang: today,
            tenNCC: invoiceData.supplier || data.datHang?.[0]?.tenNCC || '',
            sanPham: sanPham,
            tongTienHD: invoiceData.totalAmount || 0,
            tongMon: tongMon,
            soMonThieu: soMonThieu,
            ghiChuThieu: '',
            anhHoaDon: imageUrl ? [imageUrl] : [],
            ghiChu: invoiceData.notes || '',
            source: 'telegram_bot',
            telegramChatId: chatId,
            createdAt: new Date().toISOString(),
            createdBy: `telegram_${userId}`,
            updatedAt: new Date().toISOString(),
            updatedBy: `telegram_${userId}`
        };

        dotHang.push(newDotHang);
        console.log(`[FIREBASE] Added new dotHang for NCC ${sttNCC}:`, entryId);
    }

    // Update Firestore
    await docRef.update({
        dotHang: dotHang,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        docId: docId,
        entryId: entryId,
        type: 'dotHang',
        isUpdate: isUpdate,
        soMonThieu: isUpdate
            ? dotHang[existingIndex].soMonThieu
            : soMonThieu,
        tongMon: isUpdate
            ? dotHang[existingIndex].tongMon
            : tongMon
    };
}

/**
 * Force save to Tab 2 (dotHang) with custom delivery date
 * Used when user sends photo with /2 DD.MM.YYYY command
 * NCC is extracted from image analysis, date is from caption
 */
async function saveInvoiceToDotHangWithDate(invoiceData, imageUrl, chatId, userId, deliveryDate) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const sttNCC = parseInt(invoiceData.ncc, 10);
    const docId = `ncc_${sttNCC}`;

    // Check if NCC exists
    const nccExists = await checkNCCExists(invoiceData.ncc);
    if (!nccExists) {
        throw new Error(`NCC ${invoiceData.ncc} chưa tồn tại trong hệ thống. Vui lòng gửi ảnh không có caption trước để tạo NCC mới.`);
    }

    // Get NCC document
    const docRef = firestore.collection('inventory_tracking').doc(docId);
    const doc = await docRef.get();
    const data = doc.data();

    const dotHang = data.dotHang || [];
    const datHang = data.datHang || [];
    const sanPham = convertProducts(invoiceData.products);
    const tongMon = sanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    // Calculate soMonThieu
    const soMonThieu = calculateSoMonThieu(datHang, tongMon);

    // Find existing dotHang with same date
    const existingIndex = dotHang.findIndex(d => d.ngayDiHang === deliveryDate);

    let isUpdate = false;
    let entryId = '';

    if (existingIndex !== -1) {
        // UPDATE existing dotHang with same delivery date
        isUpdate = true;
        entryId = dotHang[existingIndex].id;

        // Merge sanPham arrays
        const existingSanPham = dotHang[existingIndex].sanPham || [];
        const mergedSanPham = [...existingSanPham, ...sanPham];

        // Merge anhHoaDon arrays
        const existingImages = dotHang[existingIndex].anhHoaDon || [];
        const mergedImages = imageUrl ? [...existingImages, imageUrl] : existingImages;

        // Update the entry
        dotHang[existingIndex] = {
            ...dotHang[existingIndex],
            sanPham: mergedSanPham,
            tongTienHD: (dotHang[existingIndex].tongTienHD || 0) + (invoiceData.totalAmount || 0),
            tongMon: mergedSanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0),
            soMonThieu: calculateSoMonThieu(datHang, mergedSanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0)),
            anhHoaDon: mergedImages,
            ghiChu: dotHang[existingIndex].ghiChu
                ? `${dotHang[existingIndex].ghiChu}\n${invoiceData.notes || ''}`.trim()
                : (invoiceData.notes || ''),
            updatedAt: new Date().toISOString(),
            updatedBy: `telegram_${userId}`
        };

        console.log(`[FIREBASE] Updated dotHang for NCC ${sttNCC}, delivery date ${deliveryDate}`);
    } else {
        // ADD new dotHang with custom delivery date
        entryId = generateId('dot');

        const newDotHang = {
            id: entryId,
            ngayDiHang: deliveryDate,
            tenNCC: invoiceData.supplier || data.datHang?.[0]?.tenNCC || '',
            sanPham: sanPham,
            tongTienHD: invoiceData.totalAmount || 0,
            tongMon: tongMon,
            soMonThieu: soMonThieu,
            ghiChuThieu: '',
            anhHoaDon: imageUrl ? [imageUrl] : [],
            ghiChu: invoiceData.notes || '',
            source: 'telegram_bot',
            telegramChatId: chatId,
            createdAt: new Date().toISOString(),
            createdBy: `telegram_${userId}`,
            updatedAt: new Date().toISOString(),
            updatedBy: `telegram_${userId}`
        };

        dotHang.push(newDotHang);
        console.log(`[FIREBASE] Added new dotHang for NCC ${sttNCC}, delivery date ${deliveryDate}`);
    }

    // Update Firestore
    await docRef.update({
        dotHang: dotHang,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        docId: docId,
        entryId: entryId,
        type: 'dotHang',
        isUpdate: isUpdate,
        deliveryDate: deliveryDate,
        soMonThieu: isUpdate
            ? dotHang[existingIndex].soMonThieu
            : soMonThieu,
        tongMon: isUpdate
            ? dotHang[existingIndex].tongMon
            : tongMon
    };
}

/**
 * Main function: Save invoice with new NCC-based structure
 * - NCC doesn't exist: Create datHang (Tab 1 - Đặt hàng)
 * - NCC exists: Add/Update dotHang (Tab 2 - Theo dõi đơn hàng)
 */
async function saveInvoiceToFirebase(invoiceData, chatId, userId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const nccCode = invoiceData.ncc;
    if (!nccCode) {
        throw new Error('Không tìm thấy mã NCC trong hóa đơn');
    }

    // Upload image to Firebase Storage if photoFileId exists
    let imageUrl = null;
    if (invoiceData.photoFileId) {
        try {
            const { buffer, mimeType } = await downloadTelegramFile(invoiceData.photoFileId);
            const timestamp = Date.now();
            const extension = mimeType.split('/')[1] || 'jpg';
            const fileName = `invoice_${nccCode}_${timestamp}.${extension}`;
            // Use shared Firebase Storage service
            imageUrl = await firebaseStorageService.uploadImageBuffer(buffer, fileName, 'invoices', mimeType);
            console.log('[FIREBASE] Invoice image uploaded:', imageUrl);
        } catch (error) {
            console.error('[FIREBASE] Image upload error:', error.message);
        }
    }

    // Check if NCC exists
    const nccExists = await checkNCCExists(nccCode);

    if (!nccExists) {
        // NCC không tồn tại → Tạo datHang (Tab 1)
        return await createDatHang(invoiceData, imageUrl, chatId, userId);
    } else {
        // NCC đã tồn tại → Thêm/Update dotHang (Tab 2)
        return await addOrUpdateDotHang(invoiceData, imageUrl, chatId, userId);
    }
}

/**
 * Find NCC document by sttNCC
 * Returns the NCC document with datHang and dotHang arrays
 */
async function findNCCDocument(nccCode) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const docId = `ncc_${nccCode}`;
    const doc = await firestore.collection('inventory_tracking').doc(docId).get();

    if (!doc.exists) {
        throw new Error(`Không tìm thấy NCC ${nccCode}`);
    }

    return {
        id: doc.id,
        ...doc.data()
    };
}

/**
 * Get latest entry (datHang or dotHang) for display
 */
function getLatestEntry(nccDoc) {
    const datHang = nccDoc.datHang || [];
    const dotHang = nccDoc.dotHang || [];

    // Get latest from each array
    const latestDatHang = datHang.length > 0 ? datHang[datHang.length - 1] : null;
    const latestDotHang = dotHang.length > 0 ? dotHang[dotHang.length - 1] : null;

    // Compare timestamps to find the most recent
    const datHangTime = latestDatHang ? new Date(latestDatHang.createdAt || 0).getTime() : 0;
    const dotHangTime = latestDotHang ? new Date(latestDotHang.createdAt || 0).getTime() : 0;

    if (dotHangTime > datHangTime && latestDotHang) {
        return { entry: latestDotHang, type: 'dotHang', date: latestDotHang.ngayDiHang };
    } else if (latestDatHang) {
        return { entry: latestDatHang, type: 'datHang', date: latestDatHang.ngayDatHang };
    }

    return null;
}

/**
 * Add image to NCC (either datHang or dotHang based on date)
 * Downloads from Telegram, uploads to Firebase Storage, and saves URL
 */
async function addImageToNCC(nccCode, fileId, targetType = 'latest') {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    // Download image from Telegram
    const { buffer, mimeType } = await downloadTelegramFile(fileId);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `ncc_${nccCode}_${timestamp}.${extension}`;

    // Upload to Firebase Storage using shared service
    const imageUrl = await firebaseStorageService.uploadImageBuffer(buffer, fileName, 'invoices', mimeType);

    // Get NCC document
    const docId = `ncc_${nccCode}`;
    const docRef = firestore.collection('inventory_tracking').doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
        throw new Error(`Không tìm thấy NCC ${nccCode}`);
    }

    const data = doc.data();
    const today = getTodayDate();
    let arrayType = '';
    let entryIndex = -1;
    let imageCount = 0;

    // Try to add to today's dotHang first
    const dotHang = data.dotHang || [];
    const todayDotHangIndex = dotHang.findIndex(d => d.ngayDiHang === today);

    if (todayDotHangIndex !== -1) {
        // Add to today's dotHang
        arrayType = 'dotHang';
        entryIndex = todayDotHangIndex;
        if (!dotHang[todayDotHangIndex].anhHoaDon) {
            dotHang[todayDotHangIndex].anhHoaDon = [];
        }
        dotHang[todayDotHangIndex].anhHoaDon.push(imageUrl);
        imageCount = dotHang[todayDotHangIndex].anhHoaDon.length;

        await docRef.update({
            dotHang: dotHang,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        // Add to latest datHang
        const datHang = data.datHang || [];
        if (datHang.length > 0) {
            arrayType = 'datHang';
            entryIndex = datHang.length - 1;
            if (!datHang[entryIndex].anhHoaDon) {
                datHang[entryIndex].anhHoaDon = [];
            }
            datHang[entryIndex].anhHoaDon.push(imageUrl);
            imageCount = datHang[entryIndex].anhHoaDon.length;

            await docRef.update({
                datHang: datHang,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            throw new Error(`NCC ${nccCode} không có datHang hoặc dotHang để thêm ảnh`);
        }
    }

    console.log(`[FIREBASE] Added image to NCC ${nccCode} (${arrayType})`);
    return {
        docId: docId,
        nccCode: nccCode,
        arrayType: arrayType,
        imageCount: imageCount,
        imageUrl: imageUrl
    };
}

/**
 * Download file from Telegram as buffer
 */
async function downloadTelegramFile(fileId) {
    // Get file path from Telegram
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
        throw new Error('Không thể lấy thông tin file từ Telegram');
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Download the file
    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error('Không thể tải file từ Telegram');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine MIME type from file path
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension] || 'image/jpeg';

    return { buffer, mimeType };
}

/**
 * Format NCC details for Telegram message
 * Shows both datHang and dotHang info
 */
function formatNCCDetails(nccDoc) {
    const sttNCC = nccDoc.sttNCC;
    const datHang = nccDoc.datHang || [];
    const dotHang = nccDoc.dotHang || [];

    let text = `📋 NCC ${sttNCC}\n`;
    text += `${'═'.repeat(30)}\n\n`;

    // Get tenNCC from latest entry
    const tenNCC = datHang[datHang.length - 1]?.tenNCC || dotHang[dotHang.length - 1]?.tenNCC || '';
    if (tenNCC) {
        text += `🏪 Tên NCC: ${tenNCC}\n\n`;
    }

    // Show datHang (Tab 1 - Đặt hàng)
    if (datHang.length > 0) {
        text += `📦 ĐẶT HÀNG (Tab 1): ${datHang.length} đơn\n`;
        text += `${'─'.repeat(30)}\n`;

        const latestDatHang = datHang[datHang.length - 1];
        const products = latestDatHang.sanPham || [];
        const tongMon = products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
        const imageCount = latestDatHang.anhHoaDon?.length || 0;

        text += `📅 Ngày đặt: ${latestDatHang.ngayDatHang || 'N/A'}\n`;
        text += `📊 Tổng món: ${tongMon}\n`;
        text += `💰 Tiền HĐ: ${(latestDatHang.tongTienHD || 0).toLocaleString()}\n`;
        text += `🖼️ Ảnh: ${imageCount}\n`;

        if (products.length > 0) {
            text += `\n📝 Sản phẩm:\n`;
            products.slice(0, 5).forEach((p, idx) => {
                const name = p.tenSP_vi || translateToVietnamese(p.tenSP) || p.tenSP || '';
                text += `  ${idx + 1}. ${p.maSP || ''} ${name} x${p.soLuong || 0}\n`;
            });
            if (products.length > 5) {
                text += `  ... và ${products.length - 5} sản phẩm khác\n`;
            }
        }
        text += `\n`;
    }

    // Show dotHang (Tab 2 - Theo dõi đơn hàng)
    if (dotHang.length > 0) {
        text += `🚚 GIAO HÀNG (Tab 2): ${dotHang.length} đợt\n`;
        text += `${'─'.repeat(30)}\n`;

        const latestDotHang = dotHang[dotHang.length - 1];
        const products = latestDotHang.sanPham || [];
        const tongMon = products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
        const imageCount = latestDotHang.anhHoaDon?.length || 0;

        text += `📅 Ngày giao: ${latestDotHang.ngayDiHang || 'N/A'}\n`;
        text += `📊 Tổng món: ${tongMon}\n`;
        text += `💰 Tiền HĐ: ${(latestDotHang.tongTienHD || 0).toLocaleString()}\n`;
        text += `🖼️ Ảnh: ${imageCount}\n`;

        if (latestDotHang.soMonThieu > 0) {
            text += `⚠️ Thiếu: ${latestDotHang.soMonThieu} món\n`;
        }

        if (products.length > 0) {
            text += `\n📝 Sản phẩm:\n`;
            products.slice(0, 5).forEach((p, idx) => {
                const name = p.tenSP_vi || translateToVietnamese(p.tenSP) || p.tenSP || '';
                text += `  ${idx + 1}. ${p.maSP || ''} ${name} x${p.soLuong || 0}\n`;
            });
            if (products.length > 5) {
                text += `  ... và ${products.length - 5} sản phẩm khác\n`;
            }
        }
    }

    if (datHang.length === 0 && dotHang.length === 0) {
        text += `(Chưa có dữ liệu)\n`;
    }

    return text;
}

/**
 * Build inline keyboard for NCC with add image button
 */
function buildNccKeyboard(nccCode) {
    return {
        inline_keyboard: [
            [
                { text: '🖼️ Thêm ảnh', callback_data: `add_img_${nccCode}` }
            ]
        ]
    };
}

// Bot username (will be fetched on first request)
let BOT_USERNAME = null;

// Store conversation history per chat (in-memory, resets on server restart)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per chat

// Store pending invoice confirmations
const pendingInvoices = new Map();

// Store pending image edits (chatId -> { nccCode, invoiceType: 1 or 2 })
const pendingImageEdits = new Map();

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// =====================================================

const CHINESE_TO_VIETNAMESE = {
    // =====================================================
    // COLORS - MÀU SẮC (颜色)
    // =====================================================
    // Màu cơ bản
    '黑色': 'Đen',
    '黑': 'Đen',
    '白色': 'Trắng',
    '白': 'Trắng',
    '红色': 'Đỏ',
    '红': 'Đỏ',
    '蓝色': 'Xanh dương',
    '蓝': 'Xanh dương',
    '绿色': 'Xanh lá',
    '绿': 'Xanh lá',
    '黄色': 'Vàng',
    '黄': 'Vàng',
    '紫色': 'Tím',
    '紫': 'Tím',
    '粉色': 'Hồng',
    '粉红色': 'Hồng phấn',
    '粉': 'Hồng',
    '灰色': 'Xám',
    '灰': 'Xám',
    '棕色': 'Nâu',
    '棕': 'Nâu',
    '橙色': 'Cam',
    '橙': 'Cam',
    '桔色': 'Cam',
    '橘色': 'Cam',

    // Màu đặc biệt / Hot trend
    '咖啡色': 'Cà phê',
    '咖色': 'Nâu cà phê',
    '咖': 'Nâu cà phê',
    '米色': 'Kem',
    '米白色': 'Trắng kem',
    '米白': 'Trắng kem',
    '米': 'Kem',
    '杏色': 'Hồng mơ',
    '杏': 'Hồng mơ',
    '酱色': 'Nâu đậm',
    '酱红色': 'Đỏ nâu',
    '酱': 'Nâu đậm',
    '卡其色': 'Khaki',
    '卡其': 'Khaki',
    '驼色': 'Nâu lạc đà',
    '驼': 'Lạc đà',
    '藏青色': 'Xanh than',
    '藏青': 'Xanh than',
    '酒红色': 'Đỏ rượu vang',
    '酒红': 'Đỏ rượu',
    '墨绿色': 'Xanh rêu',
    '墨绿': 'Xanh rêu',
    '军绿色': 'Xanh quân đội',
    '军绿': 'Xanh lính',
    '焦糖色': 'Caramel',
    '焦糖': 'Caramel',
    '牛油果色': 'Xanh bơ',
    '牛油果': 'Xanh bơ',
    '奶白': 'Trắng sữa',
    '奶油': 'Kem sữa',
    '香槟色': 'Champagne',
    '香槟': 'Champagne',
    '银色': 'Bạc',
    '银': 'Bạc',
    '金色': 'Vàng gold',
    '金': 'Vàng gold',
    '玫红': 'Hồng cánh sen',
    '玫瑰红': 'Hồng hoa hồng',
    '宝蓝': 'Xanh hoàng gia',
    '天蓝': 'Xanh da trời',
    '湖蓝': 'Xanh hồ',
    '雾蓝': 'Xanh sương mù',
    '烟灰': 'Xám khói',
    '炭灰': 'Xám than',
    '花灰': 'Xám hoa',
    '杂灰': 'Xám đốm',
    '姜黄': 'Vàng nghệ',
    '土黄': 'Vàng đất',
    '芥末黄': 'Vàng mù tạt',

    // Tiền tố màu
    '浅': 'Nhạt',
    '深': 'Đậm',
    '浅灰': 'Xám nhạt',
    '深灰': 'Xám đậm',
    '浅蓝': 'Xanh nhạt',
    '深蓝': 'Xanh đậm',
    '浅绿': 'Xanh lá nhạt',
    '深绿': 'Xanh lá đậm',
    '浅粉': 'Hồng nhạt',
    '深粉': 'Hồng đậm',
    '浅紫': 'Tím nhạt',
    '深紫': 'Tím đậm',
    '浅咖': 'Nâu nhạt',
    '深咖': 'Nâu đậm',

    // Viết tắt màu (phổ biến trong hóa đơn viết tay)
    '兰': 'Xanh dương',  // Viết tắt của 蓝色

    // =====================================================
    // PATTERNS - HỌA TIẾT
    // =====================================================
    '条': 'Sọc',
    '条纹': 'Sọc',
    '纹': 'Vân',
    '格': 'Caro',
    '格子': 'Caro',
    '花': 'Hoa',
    '碎花': 'Hoa nhỏ',
    '大花': 'Hoa lớn',
    '点': 'Chấm',
    '波点': 'Chấm bi',
    '印': 'In',
    '印花': 'In hoa',
    '刺绣': 'Thêu',
    '绣花': 'Thêu hoa',
    '山茶花': 'Hoa sơn trà',
    '皇冠': 'Vương miện',
    '字母': 'Chữ cái',
    '数字': 'Số',
    '卡通': 'Hoạt hình',

    // =====================================================
    // MATERIALS - CHẤT LIỆU (面料)
    // =====================================================
    '棉': 'Cotton',
    '纯棉': 'Cotton 100%',
    '全棉': 'Cotton 100%',
    '麻': 'Lanh',
    '棉麻': 'Cotton lanh',
    '丝': 'Lụa',
    '真丝': 'Lụa thật',
    '绒': 'Nhung',
    '天鹅绒': 'Nhung thiên nga',
    '金丝绒': 'Nhung vàng',
    '毛': 'Len',
    '羊毛': 'Len cừu',
    '羊绒': 'Len cashmere',
    '皮': 'Da',
    '皮革': 'Da thuộc',
    '革': 'Da thuộc',
    '牛仔': 'Vải jean',
    '雪纺': 'Voan',
    '涤纶': 'Polyester',
    '锦纶': 'Nylon',
    '氨纶': 'Spandex',
    '蕾丝': 'Ren',
    '网纱': 'Lưới',
    '针织': 'Dệt kim',
    '梭织': 'Dệt thoi',
    '弹力': 'Co giãn',

    // =====================================================
    // CLOTHING TYPES - LOẠI TRANG PHỤC (款式)
    // =====================================================
    // Áo
    '上衣': 'Áo',
    'T恤': 'Áo thun',
    'T恤衫': 'Áo thun',
    '衬衫': 'Áo sơ mi',
    '衬衣': 'Áo sơ mi',
    '外套': 'Áo khoác',
    '夹克': 'Áo jacket',
    '风衣': 'Áo măng tô',
    '大衣': 'Áo khoác dài',
    '棉衣': 'Áo cotton',
    '棉袄': 'Áo bông',
    '羽绒服': 'Áo phao',
    '卫衣': 'Áo nỉ',
    '毛衣': 'Áo len',
    '针织衫': 'Áo len',
    '打底衫': 'Áo lót',
    '打底': 'Áo lót',
    '马甲': 'Áo gile',
    '背心': 'Áo ba lỗ',
    '吊带': 'Dây đeo',
    '吊带衫': 'Áo hai dây',
    '西装': 'Vest',
    '西服': 'Vest',
    '开衫': 'Áo cardigan',

    // Quần
    '裤': 'Quần',
    '裤子': 'Quần',
    '短裤': 'Quần short',
    '长裤': 'Quần dài',
    '牛仔裤': 'Quần jean',
    '西裤': 'Quần tây',
    '休闲裤': 'Quần casual',
    '运动裤': 'Quần thể thao',
    '阔腿裤': 'Quần ống rộng',
    '喇叭裤': 'Quần ống loe',
    '直筒裤': 'Quần ống đứng',
    '九分裤': 'Quần 9 phân',
    '七分裤': 'Quần 7 phân',
    '五分裤': 'Quần 5 phân',
    '打底裤': 'Quần legging',

    // Váy
    '裙': 'Váy',
    '裙子': 'Váy',
    '连衣裙': 'Váy liền',
    '半身裙': 'Chân váy',
    '短裙': 'Váy ngắn',
    '长裙': 'Váy dài',
    '百褶裙': 'Váy xếp ly',
    '包臀裙': 'Váy bút chì',
    'A字裙': 'Váy chữ A',
    '蓬蓬裙': 'Váy xòe',

    // Bộ đồ
    '套装': 'Đồ bộ',
    '两件套': 'Bộ 2 món',
    '三件套': 'Bộ 3 món',
    '四件套': 'Bộ 4 món',
    '套': 'Bộ',
    '睡衣': 'Đồ ngủ',
    '家居服': 'Đồ mặc nhà',
    '运动套装': 'Bộ thể thao',

    // Phụ kiện
    '帽子': 'Mũ',
    '围巾': 'Khăn choàng',
    '手套': 'Găng tay',
    '袜子': 'Tất',
    '皮带': 'Thắt lưng',
    '腰带': 'Dây lưng',
    '包': 'Túi',
    '手提包': 'Túi xách',
    '单肩包': 'Túi đeo vai',
    '斜挎包': 'Túi đeo chéo',
    '双肩包': 'Balo',

    // =====================================================
    // DESIGN DETAILS - CHI TIẾT THIẾT KẾ (细节)
    // =====================================================
    // Cổ áo
    '领': 'Cổ',
    '圆领': 'Cổ tròn',
    'V领': 'Cổ chữ V',
    '高领': 'Cổ cao',
    '翻领': 'Cổ lật',
    '方领': 'Cổ vuông',
    '一字领': 'Cổ ngang',
    '娃娃领': 'Cổ búp bê',
    '立领': 'Cổ đứng',
    '半高领': 'Cổ lọ',
    '堆堆领': 'Cổ đống',

    // Tay áo
    '袖': 'Tay áo',
    '长袖': 'Tay dài',
    '短袖': 'Tay ngắn',
    '七分袖': 'Tay 7 phân',
    '无袖': 'Không tay',
    '泡泡袖': 'Tay bồng',
    '蝙蝠袖': 'Tay dơi',
    '喇叭袖': 'Tay loe',
    '灯笼袖': 'Tay lồng đèn',

    // Dáng / Kiểu
    '短款': 'Dáng ngắn',
    '中长款': 'Dáng trung',
    '长款': 'Dáng dài',
    '修身': 'Ôm body',
    '宽松': 'Rộng',
    '直筒': 'Ống đứng',
    '交叉': 'Chéo',
    '斜角': 'Xéo góc',
    '系带': 'Dây buộc',
    '拉链': 'Khoá kéo',
    '纽扣': 'Khuy',
    '扣子': 'Nút',
    '铆钉': 'Đinh tán',
    '流苏': 'Tua rua',
    '荷叶边': 'Viền lượn sóng',
    '木耳边': 'Viền bèo',
    '蝴蝶结': 'Nơ',
    '腰带': 'Đai lưng',
    '口袋': 'Túi',
    '开叉': 'Xẻ',
    '褶皱': 'Xếp ly',
    '收腰': 'Eo',

    // =====================================================
    // SIZES - KÍCH THƯỚC
    // =====================================================
    '均码': 'Freesize',
    'F': 'Freesize',
    '均': 'Freesize',
    'S码': 'Size S',
    'M码': 'Size M',
    'L码': 'Size L',
    'XL码': 'Size XL',
    'XXL码': 'Size XXL',
    '大码': 'Size lớn',
    '加大码': 'Size cực lớn',
    '件': 'Cái',
    '条': 'Chiếc',
    '手': '1 ri',

    // =====================================================
    // ORDER STATUS - TÌNH TRẠNG ĐƠN HÀNG
    // =====================================================
    '现货': 'Có sẵn',
    '预售': 'Pre-order',
    '欠货': 'Nợ hàng',
    '退货': 'Trả hàng',
    '拿货': 'Lấy hàng',
    '补货': 'Bổ sung hàng',
    '断货': 'Hết hàng',
    '缺货': 'Thiếu hàng',

    // =====================================================
    // COMMON TERMS - TỪ THÔNG DỤNG
    // =====================================================
    '色': '',
    '款': 'Kiểu',
    '新款': 'Mẫu mới',
    '热卖': 'Bán chạy',
    '爆款': 'Hot',
    '苏': 'Tô',
    '号': 'Số',
    '小计': 'Tạm tính',
    '合计': 'Tổng cộng',
    '销售合计': 'Tổng bán',
    '数量': 'Số lượng',
    '单价': 'Đơn giá',
    '金额': 'Thành tiền'
};

/**
 * Translate Chinese text to Vietnamese
 */
function translateToVietnamese(text) {
    if (!text) return text;

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE).sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

// =====================================================
// INVOICE EXTRACTION PROMPT
// =====================================================

const INVOICE_EXTRACTION_PROMPT = `Bạn là chuyên gia kiểm kê hàng hóa thông thạo tiếng Trung chuyên ngành may mặc và tiếng Việt. Hãy phân tích ảnh hóa đơn này (có thể là HÓA ĐƠN IN hoặc HÓA ĐƠN VIẾT TAY) và trích xuất thông tin theo format JSON.

=== NGUYÊN TẮC QUAN TRỌNG ===

1. **DỊCH THUẬT TRIỆT ĐỂ**:
   - Chuyển TOÀN BỘ nội dung sang tiếng Việt
   - TUYỆT ĐỐI KHÔNG để sót ký tự tiếng Trung nào
   - Dịch cả tên sản phẩm, màu sắc, mô tả chi tiết
   - VD: "卡其色" → "Khaki" (KHÔNG giữ "卡其")
   - VD: "黑色" → "Đen" (KHÔNG giữ "黑色")
   - VD: "铆钉" → "Đinh tán" (KHÔNG giữ "铆钉")

2. **KIỂM TRA ĐỘ CHÍNH XÁC**:
   - Cộng tổng số lượng từng màu để đối chiếu với cột "Tổng cộng"
   - Nếu có sai lệch giữa các màu và tổng số → Đưa ra CẢNH BÁO trong notes
   - VD: "⚠️ CẢNH BÁO: Tổng màu (48) ≠ Tổng ghi (50) - Chênh lệch 2 món"

3. **THÔNG TIN NCC**:
   - CHỈ lấy STT được khoanh tròn
   - BỎ QUA tên, số điện thoại, địa chỉ NCC
   - Chỉ trả về ncc: "4" (số thuần túy)

=== TỪ ĐIỂN MỞ RỘNG TIẾNG TRUNG → TIẾNG VIỆT ===

**MÀU SẮC CƠ BẢN (颜色):**
黑/黑色 = Đen, 白/白色 = Trắng, 红/红色 = Đỏ, 蓝/蓝色 = Xanh dương, 绿/绿色 = Xanh lá
黄/黄色 = Vàng, 紫/紫色 = Tím, 粉/粉色/粉红色 = Hồng, 灰/灰色 = Xám, 棕/棕色 = Nâu
橙/橙色/桔色/橘色 = Cam

**MÀU ĐẶC BIỆT / HOT TREND:**
咖/咖色/咖啡色 = Nâu cà phê, 米/米色 = Kem, 米白/米白色 = Trắng kem
杏/杏色 = Hồng mơ (Hạnh nhân), 酱/酱色 = Nâu đậm, 酱红色 = Đỏ nâu
卡其/卡其色 = Khaki, 驼/驼色 = Nâu lạc đà
藏青/藏青色 = Xanh than, 酒红/酒红色 = Đỏ rượu vang
墨绿/墨绿色 = Xanh rêu, 军绿/军绿色 = Xanh quân đội
焦糖/焦糖色 = Caramel, 牛油果/牛油果色 = Xanh bơ (Avocado)
香槟/香槟色 = Champagne, 奶白 = Trắng sữa, 奶油 = Kem sữa
银/银色 = Bạc, 金/金色 = Vàng gold
玫红/玫瑰红 = Hồng cánh sen, 宝蓝 = Xanh hoàng gia
天蓝 = Xanh da trời, 湖蓝 = Xanh hồ, 雾蓝 = Xanh sương mù
烟灰 = Xám khói, 炭灰 = Xám than, 花灰 = Xám hoa
姜黄 = Vàng nghệ, 土黄 = Vàng đất, 芥末黄 = Vàng mù tạt
浅 = Nhạt, 深 = Đậm, 色 = (bỏ từ này)
浅灰/深灰 = Xám nhạt/đậm, 浅蓝/深蓝 = Xanh nhạt/đậm
浅绿/深绿 = Xanh lá nhạt/đậm, 浅粉/深粉 = Hồng nhạt/đậm
浅紫/深紫 = Tím nhạt/đậm, 浅咖/深咖 = Nâu nhạt/đậm

**VIẾT TẮT MÀU (PHỔNG BIẾN TRONG HÓA ĐƠN VIẾT TAY):**
兰 = Xanh dương (viết tắt của 蓝)
啡 = Nâu cà phê (viết tắt của 咖啡)

**LOẠI TRANG PHỤC (款式):**
上衣 = Áo, T恤/T恤衫 = Áo thun, 衬衫/衬衣 = Áo sơ mi
外套 = Áo khoác, 夹克 = Jacket, 风衣 = Măng tô, 大衣 = Áo khoác dài
卫衣 = Áo nỉ (Hoodie), 毛衣/针织衫 = Áo len
打底/打底衫 = Áo lót/Áo giữ nhiệt, 马甲 = Áo gile
背心 = Áo ba lỗ, 吊带/吊带衫 = Áo hai dây
西装/西服 = Vest, 开衫 = Cardigan, 羽绒服 = Áo phao
裤/裤子 = Quần, 短裤 = Quần short, 长裤 = Quần dài
牛仔裤 = Quần jean, 西裤 = Quần tây
阔腿裤 = Quần ống rộng, 打底裤 = Legging
裙/裙子 = Váy, 连衣裙 = Váy liền, 半身裙 = Chân váy
百褶裙 = Váy xếp ly, A字裙 = Váy chữ A

**BỘ ĐỒ (套装):**
套装 = Đồ bộ, 套/两件套 = Bộ 2 món, 三件套 = Bộ 3 món, 四件套 = Bộ 4 món
睡衣 = Đồ ngủ, 家居服 = Đồ mặc nhà, 运动套装 = Bộ thể thao

**CHI TIẾT THIẾT KẾ (细节):**
领 = Cổ, 圆领 = Cổ tròn, V领 = Cổ chữ V, 高领 = Cổ cao, 翻领 = Cổ lật
袖 = Tay áo, 长袖 = Tay dài, 短袖 = Tay ngắn, 无袖 = Không tay
短款 = Dáng ngắn (Croptop), 长款 = Dáng dài, 中长款 = Dáng trung
交叉 = Chéo, 斜角 = Xéo góc, 条纹 = Sọc, 格子 = Caro, 花 = Hoa
纽扣 = Khuy, 拉链 = Khoá kéo, 铆钉 = Đinh tán
印花 = In hoa, 刺绣/绣花 = Thêu, 蕾丝 = Ren, 网纱 = Lưới
山茶花 = Hoa sơn trà, 皇冠 = Vương miện, 荷叶边 = Viền lượn sóng

**CHẤT LIỆU (面料):**
棉/纯棉 = Cotton, 麻 = Lanh, 丝/真丝 = Lụa, 绒 = Nhung
毛/羊毛 = Len, 皮/皮革 = Da, 牛仔 = Vải jean, 雪纺 = Voan
蕾丝 = Ren, 针织 = Dệt kim, 弹力 = Co giãn

**SIZE/KÍCH THƯỚC:**
均码/均/F = Freesize (Size chung)
S码/M码/L码/XL码/XXL码 = Size S/M/L/XL/XXL
大码 = Size lớn (Plus size), 加大码 = Size cực lớn
件 = Cái, 手 = 1 ri (1 dây đủ size)

**TÌNH TRẠNG HÀNG:**
现货 = Có sẵn, 欠货 = Nợ hàng, 退货 = Trả hàng
拿货 = Lấy hàng, 补货 = Bổ sung hàng, 断货/缺货 = Hết hàng

===============================================
=== HƯỚNG DẪN ĐỌC HÓA ĐƠN VIẾT TAY ===
===============================================

**NHẬN DIỆN HÓA ĐƠN VIẾT TAY:**
Hóa đơn viết tay thường có đặc điểm:
- Chữ viết bằng tay, có thể mờ hoặc nguệch ngoạc
- Không có bảng kẻ chuẩn như hóa đơn in
- Format thường là: [MÃ] [MÀU] [SỐ LƯỢNG]x[ĐƠN GIÁ]=[THÀNH TIỀN]

**CÁCH ĐỌC TỪNG DÒNG VIẾT TAY:**

1. **Format phổ biến nhất:** [MÃ SP] [MÀU VIẾT TẮT] [SL]x[GIÁ]=[TỔNG]
   - VD: "5/01 去10 30x46=1380" → Mã: 5/01, Màu: 去10, SL: 30, Giá: 46, Tiền: 1380
   - VD: "283-6 去6啡 10x41=410" → Mã: 283-6, Màu: 6 màu nâu cà phê, SL: 10, Giá: 41
   - VD: "山茶花 去5颗 20x41=820" → Mã: Hoa sơn trà, Màu: 5 màu, SL: 20, Giá: 41
   - VD: "126 去10 10x65=650" → Mã: 126, Màu: 10 màu, SL: 10, Giá: 65
   - VD: "718-9 去6 15x74=1110" → Mã: 718-9, Màu: 6 màu, SL: 15, Giá: 74

2. **Cách hiểu "去X" (qù X):** Có nghĩa "lấy X màu" hoặc "X cái"
   - "去10" = Lấy 10 màu hoặc 10 cái
   - "去6啡" = Lấy 6 màu nâu cà phê (啡 = nâu)
   - "去白" = Lấy màu trắng
   - "去5颗" = Lấy 5 cái/5 màu

3. **SUY LUẬN TỪ PHÉP TÍNH:**
   - Khi chữ viết mờ/khó đọc, dùng phép tính để suy luận
   - VD: "?x46=1380" → ? = 1380/46 = 30 (số lượng là 30)
   - VD: "20x?=820" → ? = 820/20 = 41 (đơn giá là 41)
   - VD: "10x65=?" → ? = 10x65 = 650 (thành tiền là 650)

4. **KÝ HIỆU ĐẶC BIỆT TRONG VIẾT TAY:**
   - Dấu "✓" hoặc "V" = Đã kiểm tra/Đã bốc hàng
   - Dấu gạch chéo "—" = Bỏ qua/Số lượng bằng 0
   - Số trong vòng tròn = Mã NCC (quan trọng!)
   - Chữ viết tay "Nhi" = Tên người mua (thường là 何祥 - Hà Tường)

5. **CỘNG DỒN SỐ LƯỢNG:**
   - Nếu thấy nhiều số trên một dòng (VD: "5 5 5" dưới cột S-M-L)
   - Cộng tất cả: 5+5+5 = 15 là tổng số lượng

6. **XỬ LÝ CHỮ MỜ/GẠ̣CH BỎ:**
   - Khi số bị gạch bỏ và viết số mới → Lấy số MỚI
   - Khi không đọc được → Dùng phép tính suy luận ngược

===============================================
=== HƯỚNG DẪN ĐỌC HÓA ĐƠN IN ===
===============================================

**CẤU TRÚC HÓA ĐƠN IN ĐIỂN HÌNH:**

| 款号/商品 | 颜色 | 均码 | 数量 | 单价 | 小计 |
|----------|------|------|------|------|------|
| 835#/T恤衫 | 黑色 | 均码 | 10 | 64 | 640 |
| 835#/T恤衫 | 白色 | 均码 | 10 | 64 | 640 |
| 小计 |  |  | 50 |  | 3,200 |

**LƯU Ý:**
- MỖI DÒNG trong hóa đơn = 1 OBJECT trong products[]
- MỖI MÀU khác nhau = 1 DÒNG RIÊNG
- BỎ QUA dòng "小计" (tổng nhỏ của nhóm)

===============================================
=== TRÍCH XUẤT DỮ LIỆU (CHUNG CHO CẢ 2 LOẠI) ===
===============================================

**1. MÃ NCC (ncc) - QUAN TRỌNG NHẤT:**
   - Tìm SỐ được KHOANH TRÒN bằng bút (thường màu đỏ, ở cuối hóa đơn)
   - Chỉ lấy STT số, BỎ QUA mọi thông tin khác về NCC
   - VD: Thấy số "7" khoanh tròn → ncc: "7"
   - VD: Thấy số "15" khoanh tròn → ncc: "15"
   - KHÔNG lấy tên shop, SĐT, địa chỉ

**2. TÊN NHÀ CUNG CẤP (supplier):**
   - Tên shop/cửa hàng IN ĐẬM ở đầu hóa đơn
   - VD: "菠酷服饰" → supplier: "菠酷服饰"
   - VD: "伊芙诺 (Eveno)" → supplier: "Eveno"

**3. NGÀY THÁNG (date):**
   - Tìm ngày in trên hóa đơn, chuyển sang DD/MM/YYYY

**4. DANH SÁCH SẢN PHẨM (products):**
   Mỗi sản phẩm là 1 object:
   {"sku": "mã", "name": "tên tiếng Việt", "color": "màu tiếng Việt", "quantity": số, "price": giá}

   - **sku**: Mã hàng từ cột đầu
   - **name**: Tên SP dịch sang tiếng Việt
   - **color**: Màu sắc dịch sang tiếng Việt
   - **quantity**: Số lượng (từ phép tính hoặc cột số lượng)
   - **price**: Đơn giá (từ phép tính hoặc cột đơn giá)

**5. TỔNG SỐ MÓN (totalItems):**
   - Cộng tất cả quantity của từng product

**6. TỔNG TIỀN (totalAmount):**
   - Tìm dòng "销售合计", "合计", "总计" hoặc số ghi cuối hóa đơn
   - HĐ viết tay: Tìm số lớn nhất ghi ở cuối

**7. KIỂM TRA VÀ CẢNH BÁO:**
   - Dùng phép tính để verify: SL x Giá phải = Thành tiền
   - Nếu CHÊNH LỆCH → Thêm cảnh báo vào notes

=== FORMAT JSON OUTPUT ===

Trả về JSON CHÍNH XÁC (không markdown, không dấu \`\`\`):

{
  "success": true,
  "ncc": "7",
  "supplier": "菠酷服饰",
  "date": "26/12/2025",
  "products": [
    {"sku": "5/01", "name": "Sản phẩm 5/01", "color": "10 màu", "quantity": 30, "price": 46},
    {"sku": "山茶花", "name": "Hoa sơn trà", "color": "5 màu", "quantity": 20, "price": 41}
  ],
  "totalItems": 155,
  "totalAmount": 8645,
  "notes": "Hóa đơn viết tay. Đã verify bằng phép tính. NCC khoanh số 7."
}

=== CHECKLIST TRƯỚC KHI TRẢ VỀ ===

- [ ] Mã NCC: Đã lấy đúng số khoanh tròn (thường ở cuối HĐ)
- [ ] Loại hóa đơn: Đã nhận diện đúng (in hay viết tay)
- [ ] Tên sản phẩm: Đã dịch HOÀN TOÀN sang tiếng Việt
- [ ] Màu sắc: Đã dịch hoặc ghi nhận số màu
- [ ] Số lượng: Đã tính từ phép tính [SL]x[GIÁ]=[TỔNG]
- [ ] Đơn giá: Đã trích xuất từ phép tính
- [ ] Tổng tiền: Đã tìm hoặc tính tổng
- [ ] Verify: Đã kiểm tra phép tính có khớp không
- [ ] Không bỏ sót: Đã đọc hết tất cả dòng sản phẩm

=== NẾU KHÔNG XỬ LÝ ĐƯỢC ===

{
  "success": false,
  "error": "Lý do cụ thể: Ảnh mờ không đọc được/Không phải hóa đơn/Thiếu thông tin quan trọng/Không tìm thấy mã NCC khoanh tròn"
}`;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get bot info (username)
 */
async function getBotUsername() {
    if (BOT_USERNAME) return BOT_USERNAME;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok) {
            BOT_USERNAME = data.result.username;
            console.log('[TELEGRAM] Bot username:', BOT_USERNAME);
        }
    } catch (error) {
        console.error('[TELEGRAM] Failed to get bot info:', error.message);
    }
    return BOT_USERNAME;
}

/**
 * Send message to Telegram chat
 */
async function sendTelegramMessage(chatId, text, replyToMessageId = null, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const body = {
            chat_id: chatId,
            text: text
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[TELEGRAM] Send error:', data.description);
        }
        return data;
    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        return null;
    }
}

/**
 * Answer callback query (for inline buttons)
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text
            })
        });
    } catch (error) {
        console.error('[TELEGRAM] answerCallbackQuery error:', error.message);
    }
}

/**
 * Edit message text
 */
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text
        };
        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error('[TELEGRAM] editMessageText error:', error.message);
        return null;
    }
}

/**
 * Send "typing" or "upload_photo" action
 */
async function sendChatAction(chatId, action = 'typing') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: action
            })
        });
    } catch (error) {
        // Ignore action errors
    }
}

/**
 * Get file from Telegram and return as base64
 */
async function getTelegramFileAsBase64(fileId) {
    // Get file path
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
        throw new Error('Could not get file info from Telegram');
    }

    // Download file
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileResponse = await fetch(fileUrl);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine mime type
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension] || 'image/jpeg';

    return { base64, mimeType };
}

/**
 * Call Gemini Vision API with image
 */
async function analyzeInvoiceImage(base64Image, mimeType) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: INVOICE_EXTRACTION_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 4096
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    try {
        // Clean response (remove markdown code blocks if present)
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        return JSON.parse(cleanJson);
    } catch (parseError) {
        console.error('[TELEGRAM] JSON parse error:', parseError.message);
        console.error('[TELEGRAM] Raw response:', responseText);
        return {
            success: false,
            error: 'Không thể parse kết quả từ AI',
            rawResponse: responseText
        };
    }
}

/**
 * Call Gemini API with conversation history (for text chat)
 */
async function callGeminiAI(historyKey, userMessage, userName = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    if (!conversationHistory.has(historyKey)) {
        conversationHistory.set(historyKey, []);
    }
    const history = conversationHistory.get(historyKey);

    const messageText = userName ? `[${userName}]: ${userMessage}` : userMessage;

    history.push({
        role: 'user',
        parts: [{ text: messageText }]
    });

    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: history,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
        throw new Error('Empty response from Gemini');
    }

    history.push({
        role: 'model',
        parts: [{ text: aiResponse }]
    });

    return aiResponse;
}

/**
 * Clear conversation history for a chat
 */
function clearHistory(historyKey) {
    conversationHistory.delete(historyKey);
}

/**
 * Check if bot should respond in group
 */
function shouldRespondInGroup(message, botUsername) {
    const text = message.text || message.caption || '';

    // Always respond to commands
    if (text.startsWith('/')) {
        return true;
    }

    // Always respond to photos (invoice processing)
    if (message.photo) {
        return true;
    }

    // Check Telegram entities for mention
    const entities = message.entities || message.caption_entities || [];
    if (entities.length > 0 && botUsername) {
        for (const entity of entities) {
            if (entity.type === 'mention') {
                const mentionText = text.substring(entity.offset, entity.offset + entity.length);
                if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
                    console.log('[TELEGRAM] Bot mentioned via entity:', mentionText);
                    return true;
                }
            }
        }
    }

    // Fallback: check if bot username appears in text
    if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        console.log('[TELEGRAM] Bot mentioned in text');
        return true;
    }

    // Respond if message is a reply to bot's message
    if (message.reply_to_message && message.reply_to_message.from?.is_bot) {
        console.log('[TELEGRAM] Reply to bot message');
        return true;
    }

    return false;
}

/**
 * Remove bot mention from text
 */
function removeBotMention(text, botUsername) {
    if (!botUsername) return text;
    const regex = new RegExp(`@${botUsername}\\s*`, 'gi');
    return text.replace(regex, '').trim();
}

/**
 * Format invoice preview with language mode
 * @param {object} invoiceData - Invoice data from AI
 * @param {string} langMode - 'vi' for Vietnamese (default) or 'cn' for Chinese original
 */
function formatInvoicePreview(invoiceData, langMode = 'vi') {
    if (!invoiceData.success) {
        return `❌ Không thể xử lý hóa đơn:\n${invoiceData.error}`;
    }

    const isVietnamese = langMode === 'vi';
    const langLabel = isVietnamese ? '🇻🇳 Việt hóa' : '🇨🇳 Tiếng Trung';

    let text = `📋 KẾT QUẢ PHÂN TÍCH HÓA ĐƠN [${langLabel}]\n`;
    text += `${'─'.repeat(30)}\n`;

    // Mã NCC (số khoanh tròn) - hiển thị đầu tiên và nổi bật
    if (invoiceData.ncc) {
        text += `🔢 MÃ NCC: ${invoiceData.ncc}\n`;
    }
    if (invoiceData.supplier) {
        const supplier = isVietnamese ? translateToVietnamese(invoiceData.supplier) : invoiceData.supplier;
        text += `🏪 Tên NCC: ${supplier}\n`;
    }
    if (invoiceData.date) {
        text += `📅 Ngày: ${invoiceData.date}\n`;
    }

    text += `\n📦 DANH SÁCH SẢN PHẨM:\n`;

    if (invoiceData.products && invoiceData.products.length > 0) {
        invoiceData.products.forEach((p, i) => {
            const name = isVietnamese ? translateToVietnamese(p.name) : p.name;
            const color = p.color
                ? ` (${isVietnamese ? translateToVietnamese(p.color) : p.color})`
                : '';
            text += `${i + 1}. ${p.sku || '?'} - ${name || 'N/A'}${color}: ${p.quantity} cái\n`;
        });
    } else {
        text += `(Không có sản phẩm)\n`;
    }

    text += `\n📊 Tổng: ${invoiceData.totalItems || 0} sản phẩm`;

    if (invoiceData.totalAmount) {
        text += `\n💰 Thành tiền: ¥${invoiceData.totalAmount.toLocaleString()}`;
    }

    if (invoiceData.notes) {
        const notes = isVietnamese ? translateToVietnamese(invoiceData.notes) : invoiceData.notes;
        text += `\n📝 Ghi chú: ${notes}`;
    }

    return text;
}

/**
 * Build inline keyboard for invoice preview
 */
function buildInvoiceKeyboard(invoiceId, langMode = 'vi') {
    const toggleButton = langMode === 'vi'
        ? { text: '🇨🇳 Xem tiếng Trung', callback_data: `lang_cn_${invoiceId}` }
        : { text: '🇻🇳 Xem Việt hóa', callback_data: `lang_vi_${invoiceId}` };

    return {
        inline_keyboard: [
            [toggleButton],
            [
                { text: '✅ Xác nhận lưu', callback_data: `confirm_invoice_${invoiceId}` },
                { text: '❌ Hủy', callback_data: `cancel_invoice_${invoiceId}` }
            ]
        ]
    };
}

// =====================================================
// ROUTES
// =====================================================

// Health check
router.get('/', (req, res) => {
    const firestore = getFirestoreDb();
    res.json({
        status: 'ok',
        service: 'Telegram Bot with Gemini AI',
        model: GEMINI_MODEL,
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        hasFirebase: !!firestore,
        botUsername: BOT_USERNAME,
        activeConversations: conversationHistory.size,
        pendingInvoices: pendingInvoices.size,
        features: ['text_chat', 'invoice_processing', 'group_chat', 'mention_trigger', 'firebase_storage']
    });
});

// Telegram Webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        // Respond immediately to Telegram
        res.sendStatus(200);

        const update = req.body;

        // Handle callback queries (button clicks)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id);

            // Handle language toggle
            if (data.startsWith('lang_vi_') || data.startsWith('lang_cn_')) {
                const langMode = data.startsWith('lang_vi_') ? 'vi' : 'cn';
                const invoiceId = data.replace(/^lang_(vi|cn)_/, '');
                const invoiceData = pendingInvoices.get(invoiceId);

                if (invoiceData) {
                    const previewText = formatInvoicePreview(invoiceData, langMode);
                    const keyboard = buildInvoiceKeyboard(invoiceId, langMode);
                    await editMessageText(chatId, messageId, previewText, keyboard);
                } else {
                    await editMessageText(chatId, messageId,
                        `⚠️ Hóa đơn đã hết hạn. Vui lòng gửi lại ảnh.`
                    );
                }
            }
            // Handle confirm invoice
            else if (data.startsWith('confirm_invoice_')) {
                const invoiceId = data.replace('confirm_invoice_', '');
                const invoiceData = pendingInvoices.get(invoiceId);

                if (invoiceData) {
                    try {
                        // Save to Firebase with new NCC-based structure
                        const userId = callbackQuery.from.id;
                        const result = await saveInvoiceToFirebase(invoiceData, chatId, userId);
                        pendingInvoices.delete(invoiceId);

                        // Build success message based on result type
                        let successMsg = '';
                        if (result.type === 'datHang') {
                            // New NCC - created datHang (Tab 1)
                            successMsg = `✅ ĐÃ TẠO ĐƠN ĐẶT HÀNG MỚI!\n\n` +
                                `📋 Document: ${result.docId}\n` +
                                `🔢 Mã NCC: ${invoiceData.ncc || 'N/A'}\n` +
                                `🏪 Tên NCC: ${translateToVietnamese(invoiceData.supplier) || 'N/A'}\n` +
                                `📦 Tổng món: ${result.tongMon || 0}\n\n` +
                                `📝 Tab 1 - Đặt hàng\n` +
                                `💡 NCC mới được tạo với đơn đặt hàng đầu tiên.`;
                        } else if (result.type === 'dotHang') {
                            // Existing NCC - added/updated dotHang (Tab 2)
                            if (result.isUpdate) {
                                successMsg = `✅ ĐÃ CẬP NHẬT ĐỢT HÀNG!\n\n` +
                                    `📋 Document: ${result.docId}\n` +
                                    `🔢 Mã NCC: ${invoiceData.ncc || 'N/A'}\n` +
                                    `📦 Tổng món: ${result.tongMon || 0}\n`;
                                if (result.soMonThieu > 0) {
                                    successMsg += `⚠️ Thiếu: ${result.soMonThieu} món\n`;
                                }
                                successMsg += `\n📝 Tab 2 - Theo dõi đơn hàng\n` +
                                    `💡 Đã gộp vào đợt hàng hôm nay.`;
                            } else {
                                successMsg = `✅ ĐÃ THÊM ĐỢT HÀNG MỚI!\n\n` +
                                    `📋 Document: ${result.docId}\n` +
                                    `🔢 Mã NCC: ${invoiceData.ncc || 'N/A'}\n` +
                                    `📦 Tổng món: ${result.tongMon || 0}\n`;
                                if (result.soMonThieu > 0) {
                                    successMsg += `⚠️ Thiếu: ${result.soMonThieu} món\n`;
                                }
                                successMsg += `\n📝 Tab 2 - Theo dõi đơn hàng\n` +
                                    `💡 NCC ${invoiceData.ncc} đã tồn tại, thêm đợt giao hàng mới.`;
                            }
                        }

                        await editMessageText(chatId, messageId, successMsg);
                    } catch (error) {
                        console.error('[TELEGRAM] Firebase save error:', error.message);
                        await editMessageText(chatId, messageId,
                            `❌ Lỗi lưu hóa đơn:\n${error.message}\n\nVui lòng thử lại.`
                        );
                    }
                } else {
                    await editMessageText(chatId, messageId,
                        `⚠️ Hóa đơn đã hết hạn. Vui lòng gửi lại ảnh.`
                    );
                }
            }
            // Handle cancel invoice
            else if (data.startsWith('cancel_invoice_')) {
                const invoiceId = data.replace('cancel_invoice_', '');
                pendingInvoices.delete(invoiceId);

                await editMessageText(chatId, messageId,
                    `❌ Đã hủy. Bạn có thể gửi lại ảnh hóa đơn khác.`
                );
            }
            // Handle add image button
            else if (data.startsWith('add_img_')) {
                const nccCode = data.replace('add_img_', '');

                // Store pending add image state
                pendingImageEdits.set(chatId, {
                    nccCode,
                    timestamp: Date.now()
                });

                // Auto-expire after 5 minutes
                setTimeout(() => {
                    const edit = pendingImageEdits.get(chatId);
                    if (edit && edit.nccCode === nccCode) {
                        pendingImageEdits.delete(chatId);
                    }
                }, 5 * 60 * 1000);

                await sendTelegramMessage(chatId,
                    `📤 Gửi ảnh để thêm vào NCC ${nccCode}\n\n` +
                    `⏳ Bạn có 5 phút để gửi ảnh.\n` +
                    `❌ Gửi /cancel để hủy.`
                );
            }
            return;
        }

        // Handle message updates
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const chatType = message.chat.type;
            const userId = message.from.id;
            const text = message.text || message.caption || '';
            const firstName = message.from.first_name || 'User';
            const messageId = message.message_id;

            const isGroup = chatType === 'group' || chatType === 'supergroup';
            const chatName = isGroup ? message.chat.title : firstName;

            await getBotUsername();

            console.log(`[TELEGRAM] ${isGroup ? 'Group' : 'Private'} message from ${firstName} in ${chatName}`);

            // In groups, check if should respond
            if (isGroup && !shouldRespondInGroup(message, BOT_USERNAME)) {
                console.log('[TELEGRAM] Skipping - not triggered in group');
                return;
            }

            const historyKey = isGroup ? `group_${chatId}` : `user_${userId}`;

            // ==========================================
            // HANDLE PHOTO MESSAGES
            // ==========================================
            if (message.photo) {
                const caption = message.caption || '';
                const nccMatch = caption.match(/^\/(\d+)$/);

                // ==========================================
                // CASE 0: Photo with /2 DD.MM.YYYY - Save to Tab 2 with delivery date
                // Example: /2 28.12.2025 - saves to Tab 2 (Theo dõi đơn hàng)
                // NCC is extracted from image, date is from caption
                // ==========================================
                const tab2Match = caption.match(/^\/2\s+(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (tab2Match) {
                    const day = tab2Match[1].padStart(2, '0');
                    const month = tab2Match[2].padStart(2, '0');
                    const year = tab2Match[3];
                    const deliveryDate = `${day}/${month}/${year}`;

                    console.log(`[TELEGRAM] Photo with /2 command - Save to Tab 2 with delivery date: ${deliveryDate}`);

                    await sendChatAction(chatId, 'typing');
                    await sendTelegramMessage(chatId, `🔍 Đang phân tích hóa đơn...\n📅 Ngày giao: ${deliveryDate}`, messageId);

                    try {
                        // Get the largest photo
                        const photo = message.photo[message.photo.length - 1];
                        const { base64, mimeType } = await getTelegramFileAsBase64(photo.file_id);

                        // Analyze with Gemini Vision
                        const invoiceData = await analyzeInvoiceImage(base64, mimeType);

                        if (!invoiceData.success) {
                            await sendTelegramMessage(chatId,
                                `❌ Không thể phân tích hóa đơn:\n${invoiceData.error || 'Lỗi không xác định'}`,
                                messageId
                            );
                            return;
                        }

                        if (!invoiceData.ncc) {
                            await sendTelegramMessage(chatId,
                                `❌ Không tìm thấy mã NCC trong ảnh.\n💡 Đảm bảo hóa đơn có ghi số NCC.`,
                                messageId
                            );
                            return;
                        }

                        // Upload image to Firebase Storage
                        let imageUrl = null;
                        try {
                            const { buffer, mimeType: fileMimeType } = await downloadTelegramFile(photo.file_id);
                            const timestamp = Date.now();
                            const extension = fileMimeType.split('/')[1] || 'jpg';
                            const fileName = `invoice_${invoiceData.ncc}_${timestamp}.${extension}`;
                            imageUrl = await firebaseStorageService.uploadImageBuffer(buffer, fileName, 'invoices', fileMimeType);
                        } catch (error) {
                            console.error('[FIREBASE] Image upload error:', error.message);
                        }

                        // Save directly to Tab 2 with custom delivery date
                        const result = await saveInvoiceToDotHangWithDate(invoiceData, imageUrl, chatId, userId, deliveryDate);

                        // Format products summary
                        const productsList = invoiceData.products.slice(0, 5)
                            .map(p => `  • ${p.sku || ''} ${p.name || ''}: ${p.quantity || 0}`)
                            .join('\n');
                        const moreProducts = invoiceData.products.length > 5
                            ? `\n  ... và ${invoiceData.products.length - 5} sản phẩm khác`
                            : '';

                        const successMsg = result.isUpdate
                            ? `✅ ĐÃ CẬP NHẬT THEO DÕI ĐƠN HÀNG!\n\n`
                            : `✅ ĐÃ TẠO THEO DÕI ĐƠN HÀNG MỚI!\n\n`;

                        await sendTelegramMessage(chatId,
                            successMsg +
                            `📋 Document: ${result.docId}\n` +
                            `🔢 Mã NCC: ${invoiceData.ncc}\n` +
                            `🏪 Tên NCC: ${translateToVietnamese(invoiceData.supplier) || 'N/A'}\n` +
                            `📅 Ngày giao: ${deliveryDate}\n` +
                            `📦 Tổng món: ${result.tongMon}\n` +
                            `⚠️ Còn thiếu: ${result.soMonThieu}\n\n` +
                            `📝 Sản phẩm:\n${productsList}${moreProducts}\n\n` +
                            `🔗 Tab 2 - Theo dõi đơn hàng\n` +
                            `Xem tại: https://nhijudyshop.github.io/n2store/inventory-tracking/`,
                            messageId
                        );

                    } catch (error) {
                        console.error('[TELEGRAM] Tab 2 save error:', error.message);
                        await sendTelegramMessage(chatId,
                            `❌ Lỗi lưu vào Tab 2:\n${error.message}`,
                            messageId
                        );
                    }
                    return;
                }

                // ==========================================
                // CASE 1: Photo with /NCC command - Add image to NCC
                // Example: /15 with photo attached
                // ==========================================
                if (nccMatch) {
                    const nccCode = nccMatch[1];
                    console.log(`[TELEGRAM] Photo with NCC command: /${nccCode}`);

                    await sendChatAction(chatId, 'upload_photo');
                    await sendTelegramMessage(chatId, '📤 Đang upload ảnh lên Firebase Storage...', messageId);

                    try {
                        // Get the largest photo
                        const photo = message.photo[message.photo.length - 1];

                        // Add image to NCC document (uploads to Firebase Storage)
                        const result = await addImageToNCC(nccCode, photo.file_id);

                        const tabLabel = result.arrayType === 'datHang' ? 'Tab 1 - Đặt hàng' : 'Tab 2 - Theo dõi';
                        await sendTelegramMessage(chatId,
                            `✅ Đã thêm ảnh vào NCC ${nccCode}\n\n` +
                            `📋 Document: ${result.docId}\n` +
                            `📝 ${tabLabel}\n` +
                            `🖼️ Tổng ảnh: ${result.imageCount}\n` +
                            `☁️ Đã lưu lên Firebase Storage\n\n` +
                            `Xem tại: https://nhijudyshop.github.io/n2store/inventory-tracking/`,
                            messageId
                        );
                    } catch (error) {
                        console.error('[TELEGRAM] Add image error:', error.message);
                        await sendTelegramMessage(chatId,
                            `❌ Lỗi thêm ảnh:\n${error.message}\n\n` +
                            `💡 Đảm bảo đã có NCC ${nccCode} trong hệ thống.`,
                            messageId
                        );
                    }
                    return;
                }

                // ==========================================
                // CASE 2: Check for pending image add
                // ==========================================
                const pendingEdit = pendingImageEdits.get(chatId);
                if (pendingEdit) {
                    console.log(`[TELEGRAM] Processing pending image add for NCC ${pendingEdit.nccCode}`);

                    await sendChatAction(chatId, 'upload_photo');
                    await sendTelegramMessage(chatId, '📤 Đang upload ảnh...', messageId);

                    try {
                        const photo = message.photo[message.photo.length - 1];

                        // Add image to NCC
                        const result = await addImageToNCC(pendingEdit.nccCode, photo.file_id);

                        // Clear pending edit
                        pendingImageEdits.delete(chatId);

                        const tabLabel = result.arrayType === 'datHang' ? 'Tab 1 - Đặt hàng' : 'Tab 2 - Theo dõi';
                        await sendTelegramMessage(chatId,
                            `✅ Đã thêm ảnh vào NCC ${pendingEdit.nccCode}\n\n` +
                            `📝 ${tabLabel}\n` +
                            `🖼️ Tổng ảnh: ${result.imageCount}\n` +
                            `☁️ Đã lưu lên Firebase Storage`,
                            messageId
                        );

                    } catch (error) {
                        console.error('[TELEGRAM] Add image error:', error.message);
                        pendingImageEdits.delete(chatId);
                        await sendTelegramMessage(chatId,
                            `❌ Lỗi thêm ảnh:\n${error.message}`,
                            messageId
                        );
                    }
                    return;
                }

                // ==========================================
                // CASE 3: Photo without command - Process as invoice
                // ==========================================
                console.log('[TELEGRAM] Photo received - processing invoice');

                await sendChatAction(chatId, 'typing');
                await sendTelegramMessage(chatId, '🔍 Đang phân tích hóa đơn...', messageId);

                try {
                    // Get the largest photo
                    const photo = message.photo[message.photo.length - 1];
                    const { base64, mimeType } = await getTelegramFileAsBase64(photo.file_id);

                    // Analyze with Gemini Vision
                    const invoiceData = await analyzeInvoiceImage(base64, mimeType);

                    // Format and send preview (default: Vietnamese mode)
                    const previewText = formatInvoicePreview(invoiceData, 'vi');

                    if (invoiceData.success) {
                        // Generate unique invoice ID
                        const invoiceId = `${chatId}_${Date.now()}`;
                        // Store file_id for uploading image later
                        invoiceData.photoFileId = photo.file_id;
                        pendingInvoices.set(invoiceId, invoiceData);

                        // Auto-expire after 10 minutes
                        setTimeout(() => pendingInvoices.delete(invoiceId), 10 * 60 * 1000);

                        // Send with language toggle and confirmation buttons (default: Vietnamese)
                        const keyboard = buildInvoiceKeyboard(invoiceId, 'vi');
                        await sendTelegramMessage(chatId, previewText, messageId, keyboard);
                    } else {
                        await sendTelegramMessage(chatId, previewText, messageId);
                    }

                } catch (error) {
                    console.error('[TELEGRAM] Invoice processing error:', error.message);
                    await sendTelegramMessage(chatId,
                        `❌ Lỗi xử lý hóa đơn:\n${error.message}`,
                        messageId
                    );
                }
                return;
            }

            // ==========================================
            // HANDLE TEXT MESSAGES
            // ==========================================

            const commandText = text?.split('@')[0];

            // /start command
            if (commandText === '/start') {
                clearHistory(historyKey);
                const groupNote = isGroup
                    ? `\n\nTrong nhóm:\n- Tag @${BOT_USERNAME} để hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `Xin chào ${firstName}! 👋\n\n` +
                    `Tôi là Gemini AI Assistant.\n\n` +
                    `📸 Gửi ẢNH HÓA ĐƠN để tôi phân tích\n` +
                    `💬 Hoặc nhắn tin để trò chuyện với AI\n\n` +
                    `Các lệnh:\n` +
                    `/start - Bắt đầu lại\n` +
                    `/clear - Xóa lịch sử chat\n` +
                    `/help - Hướng dẫn` +
                    groupNote,
                    messageId
                );
                return;
            }

            // /clear command
            if (commandText === '/clear') {
                clearHistory(historyKey);
                await sendTelegramMessage(chatId,
                    'Đã xóa lịch sử trò chuyện!',
                    messageId
                );
                return;
            }

            // /cancel command - Cancel pending image edit
            if (commandText === '/cancel') {
                const hadPending = pendingImageEdits.has(chatId);
                pendingImageEdits.delete(chatId);

                if (hadPending) {
                    await sendTelegramMessage(chatId,
                        '❌ Đã hủy thao tác sửa ảnh.',
                        messageId
                    );
                } else {
                    await sendTelegramMessage(chatId,
                        '✓ Không có thao tác nào đang chờ.',
                        messageId
                    );
                }
                return;
            }

            // /help command
            if (commandText === '/help') {
                const groupHelp = isGroup
                    ? `\n\nCách dùng trong nhóm:\n- Tag @${BOT_USERNAME} + câu hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `📖 HƯỚNG DẪN SỬ DỤNG\n` +
                    `${'─'.repeat(25)}\n\n` +
                    `📸 XỬ LÝ HÓA ĐƠN:\n` +
                    `- Gửi ảnh hóa đơn viết tay\n` +
                    `- Bot sẽ phân tích và trích xuất dữ liệu\n` +
                    `- Xác nhận để lưu vào hệ thống\n\n` +
                    `📦 THEO DÕI ĐƠN HÀNG (Tab 2):\n` +
                    `- Gửi ảnh + caption "/2 DD.MM.YYYY"\n` +
                    `- VD: /2 28.12.2025\n` +
                    `- NCC lấy từ ảnh, ngày giao từ caption\n` +
                    `- Lưu trực tiếp vào Tab 2\n\n` +
                    `📋 XEM CHI TIẾT HÓA ĐƠN:\n` +
                    `- Gửi /NCC (VD: /15)\n` +
                    `- Hiển thị chi tiết hóa đơn của NCC đó\n\n` +
                    `🖼️ THÊM ẢNH VÀO HÓA ĐƠN:\n` +
                    `- Gửi ảnh với caption /NCC\n` +
                    `- VD: Gửi ảnh + caption "/15"\n` +
                    `- Ảnh sẽ upload lên Firebase Storage\n\n` +
                    `💬 TRÒ CHUYỆN AI:\n` +
                    `- Gửi tin nhắn bất kỳ\n` +
                    `- Bot sẽ trả lời bằng Gemini AI\n\n` +
                    `Model: ${GEMINI_MODEL}` +
                    groupHelp,
                    messageId
                );
                return;
            }

            // /NCC command (e.g., /15) - Show NCC details with add image button
            const nccTextMatch = commandText?.match(/^\/(\d+)$/);
            if (nccTextMatch) {
                const nccCode = nccTextMatch[1];
                console.log(`[TELEGRAM] NCC command: /${nccCode}`);

                await sendChatAction(chatId, 'typing');

                try {
                    const nccDoc = await findNCCDocument(nccCode);
                    const detailsText = formatNCCDetails(nccDoc);
                    const keyboard = buildNccKeyboard(nccCode);

                    await sendTelegramMessage(chatId, detailsText, messageId, keyboard);
                } catch (error) {
                    console.error('[TELEGRAM] NCC lookup error:', error.message);
                    await sendTelegramMessage(chatId,
                        `❌ ${error.message}\n\n` +
                        `💡 Gửi ảnh hóa đơn để tạo mới, hoặc kiểm tra lại mã NCC.`,
                        messageId
                    );
                }
                return;
            }

            // Regular text message - chat with AI
            if (!text) {
                await sendTelegramMessage(chatId,
                    'Gửi tin nhắn văn bản hoặc ảnh hóa đơn để tôi xử lý.',
                    messageId
                );
                return;
            }

            if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
                await sendTelegramMessage(chatId,
                    'Bot chưa được cấu hình đầy đủ.',
                    messageId
                );
                return;
            }

            const cleanText = removeBotMention(text, BOT_USERNAME);

            if (!cleanText) {
                await sendTelegramMessage(chatId, 'Bạn muốn hỏi gì?', messageId);
                return;
            }

            await sendChatAction(chatId, 'typing');

            try {
                const aiResponse = await callGeminiAI(
                    historyKey,
                    cleanText,
                    isGroup ? firstName : null
                );

                if (aiResponse.length > 4000) {
                    const chunks = aiResponse.match(/[\s\S]{1,4000}/g) || [];
                    for (let i = 0; i < chunks.length; i++) {
                        await sendTelegramMessage(
                            chatId,
                            chunks[i],
                            i === 0 ? messageId : null
                        );
                    }
                } else {
                    await sendTelegramMessage(chatId, aiResponse, messageId);
                }

            } catch (error) {
                console.error('[TELEGRAM] Gemini error:', error.message);
                await sendTelegramMessage(chatId,
                    `Có lỗi xảy ra:\n${error.message}`,
                    messageId
                );
            }
        }

    } catch (error) {
        console.error('[TELEGRAM] Webhook error:', error.message);
    }
});

// Manual send endpoint
router.post('/send', async (req, res) => {
    try {
        const { chatId, text } = req.body;

        if (!chatId || !text) {
            return res.status(400).json({ error: 'Missing chatId or text' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const result = await sendTelegramMessage(chatId, text);
        res.json(result);

    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Set webhook URL
router.post('/setWebhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'Missing webhookUrl' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query']
            })
        });

        const data = await response.json();
        console.log('[TELEGRAM] Webhook set:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] setWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get webhook info
router.get('/webhookInfo', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] webhookInfo error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete webhook
router.post('/deleteWebhook', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
        const response = await fetch(url);
        const data = await response.json();

        console.log('[TELEGRAM] Webhook deleted:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] deleteWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
