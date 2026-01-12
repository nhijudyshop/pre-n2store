/**
 * Firebase Cloud Functions - Main Index
 *
 * Export all cloud functions here
 */

const cleanupFunctions = require('./cleanup-tag-updates');

// ==========================================
// TAG Cleanup Functions
// ==========================================

/**
 * Scheduled Function - Auto cleanup old TAG updates
 * Chạy mỗi ngày lúc 2h sáng (Asia/Ho_Chi_Minh timezone)
 * Xóa TAG updates cũ hơn 7 ngày
 */
exports.cleanupOldTagUpdates = cleanupFunctions.cleanupOldTagUpdates;

/**
 * HTTP Trigger - Manual cleanup
 * Call: https://asia-southeast1-n2shop-69e37.cloudfunctions.net/manualCleanupTagUpdates
 */
exports.manualCleanupTagUpdates = cleanupFunctions.manualCleanupTagUpdates;

/**
 * HTTP Endpoint - Get cleanup statistics
 * Call: https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats
 */
exports.getCleanupStats = cleanupFunctions.getCleanupStats;

console.log('✅ Firebase Functions loaded: TAG cleanup functions');
