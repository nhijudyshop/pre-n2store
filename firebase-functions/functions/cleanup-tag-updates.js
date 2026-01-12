/**
 * Firebase Cloud Function: Auto Cleanup Old TAG Updates
 *
 * Tự động xóa TAG updates cũ hơn 7 ngày
 * Chạy mỗi ngày lúc 2h sáng (Asia/Ho_Chi_Minh timezone)
 *
 * Deploy: firebase deploy --only functions:cleanupOldTagUpdates
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (chỉ init 1 lần)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Scheduled Function - Chạy mỗi ngày lúc 2h sáng
 * Cron format: '0 2 * * *' = "At 02:00 every day"
 */
exports.cleanupOldTagUpdates = functions
  .region('asia-southeast1') // Chọn region gần Việt Nam
  .pubsub
  .schedule('0 2 * * *') // Mỗi ngày lúc 2h sáng
  .timeZone('Asia/Ho_Chi_Minh')
  .onRun(async (context) => {
    console.log('🧹 Starting TAG updates cleanup...');

    const db = admin.database();
    const now = Date.now();

    // ⚙️ Config: Xóa data cũ hơn 7 ngày
    const RETENTION_DAYS = 7;
    const cutoff = now - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

    console.log(`Cutoff timestamp: ${cutoff} (${new Date(cutoff).toISOString()})`);

    try {
      // Lấy tất cả TAG updates
      const snapshot = await db.ref('tag_updates').once('value');
      const updates = snapshot.val();

      if (!updates) {
        console.log('No TAG updates found in database');
        return { success: true, deletedCount: 0, message: 'No data to cleanup' };
      }

      // Filter và xóa data cũ
      let deleteCount = 0;
      let keepCount = 0;
      const deletePromises = [];

      for (const [orderId, data] of Object.entries(updates)) {
        if (!data.timestamp) {
          console.warn(`⚠️ Missing timestamp for orderId: ${orderId}`);
          continue;
        }

        if (data.timestamp < cutoff) {
          // Data cũ → Xóa
          deletePromises.push(
            db.ref(`tag_updates/${orderId}`).remove()
              .then(() => {
                console.log(`✅ Deleted: ${orderId} (${data.orderCode || 'unknown'}) - ${new Date(data.timestamp).toISOString()}`);
                deleteCount++;
              })
              .catch(err => {
                console.error(`❌ Error deleting ${orderId}:`, err);
              })
          );
        } else {
          // Data mới → Giữ lại
          keepCount++;
        }
      }

      // Chờ tất cả delete hoàn thành
      await Promise.all(deletePromises);

      const summary = {
        success: true,
        deletedCount: deleteCount,
        keptCount: keepCount,
        totalScanned: Object.keys(updates).length,
        retentionDays: RETENTION_DAYS,
        cutoffDate: new Date(cutoff).toISOString(),
        completedAt: new Date().toISOString()
      };

      console.log('🎉 Cleanup completed!');
      console.log(`📊 Summary:`, summary);

      return summary;

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Manual Trigger Function (for testing)
 * Call: https://[region]-[project-id].cloudfunctions.net/manualCleanupTagUpdates
 */
exports.manualCleanupTagUpdates = functions
  .region('asia-southeast1')
  .https
  .onRequest(async (req, res) => {
    console.log('🔧 Manual cleanup triggered');

    const db = admin.database();
    const now = Date.now();
    const RETENTION_DAYS = 7;
    const cutoff = now - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const snapshot = await db.ref('tag_updates').once('value');
      const updates = snapshot.val();

      if (!updates) {
        res.status(200).json({
          success: true,
          message: 'No TAG updates to cleanup'
        });
        return;
      }

      let deleteCount = 0;
      const deletePromises = [];

      for (const [orderId, data] of Object.entries(updates)) {
        if (data.timestamp && data.timestamp < cutoff) {
          deletePromises.push(
            db.ref(`tag_updates/${orderId}`).remove()
              .then(() => { deleteCount++; })
          );
        }
      }

      await Promise.all(deletePromises);

      res.status(200).json({
        success: true,
        deletedCount: deleteCount,
        totalScanned: Object.keys(updates).length,
        retentionDays: RETENTION_DAYS,
        cutoffDate: new Date(cutoff).toISOString()
      });

    } catch (error) {
      console.error('❌ Manual cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Get Cleanup Stats (for monitoring)
 * Call: https://[region]-[project-id].cloudfunctions.net/getCleanupStats
 */
exports.getCleanupStats = functions
  .region('asia-southeast1')
  .https
  .onRequest(async (req, res) => {
    const db = admin.database();
    const now = Date.now();
    const RETENTION_DAYS = 7;
    const cutoff = now - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const snapshot = await db.ref('tag_updates').once('value');
      const updates = snapshot.val();

      if (!updates) {
        res.status(200).json({
          totalRecords: 0,
          oldRecords: 0,
          newRecords: 0,
          retentionDays: RETENTION_DAYS
        });
        return;
      }

      let oldCount = 0;
      let newCount = 0;

      for (const [orderId, data] of Object.entries(updates)) {
        if (data.timestamp) {
          if (data.timestamp < cutoff) {
            oldCount++;
          } else {
            newCount++;
          }
        }
      }

      res.status(200).json({
        totalRecords: Object.keys(updates).length,
        oldRecords: oldCount,
        newRecords: newCount,
        retentionDays: RETENTION_DAYS,
        cutoffDate: new Date(cutoff).toISOString(),
        estimatedStorageKB: JSON.stringify(updates).length / 1024
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
