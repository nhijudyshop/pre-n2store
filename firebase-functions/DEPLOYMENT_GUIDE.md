# Firebase Cloud Function - Deployment Guide

## 📋 Tổng quan

Hướng dẫn deploy Cloud Function tự động xóa TAG updates cũ hơn 7 ngày.

**File:** `cleanup-tag-updates.js`
**Functions:**
- `cleanupOldTagUpdates` - Scheduled (chạy tự động mỗi ngày 2h sáng)
- `manualCleanupTagUpdates` - HTTP Trigger (gọi manual khi cần)
- `getCleanupStats` - HTTP Endpoint (xem thống kê)

---

## 🔧 Bước 1: Cài đặt Firebase CLI

### 1.1. Cài đặt Node.js (nếu chưa có)
```bash
# Kiểm tra Node.js đã cài chưa
node --version

# Nếu chưa có, download từ: https://nodejs.org/
# Yêu cầu: Node.js 20 trở lên (Node 18 đã bị decommission)
```

### 1.2. Cài đặt Firebase CLI
```bash
npm install -g firebase-tools

# Verify installation
firebase --version
```

### 1.3. Đăng nhập Firebase
```bash
firebase login
```
- Mở browser → Đăng nhập bằng Google Account có quyền truy cập Firebase project
- CLI sẽ tự động nhận token

---

## 🚀 Bước 2: Khởi tạo Firebase Functions

### 2.1. Di chuyển vào thư mục firebase-functions
```bash
cd /home/user/n2store/firebase-functions
```

### 2.2. Khởi tạo Firebase project (nếu chưa init)
```bash
firebase init functions
```

**Chọn các options sau:**
- ✅ Use an existing project → Chọn project **n2shop-69e37**
- ✅ Language: **JavaScript**
- ✅ ESLint: **No** (hoặc Yes nếu muốn)
- ✅ Install dependencies with npm: **Yes**

**Lưu ý:** Nếu đã có file `cleanup-tag-updates.js`, Firebase CLI sẽ tạo folder `functions/` với structure:
```
firebase-functions/
├── functions/
│   ├── index.js          ← File chính (export các functions)
│   ├── package.json
│   └── node_modules/
├── cleanup-tag-updates.js ← File hiện tại (cần move vào functions/)
└── firebase.json
```

### 2.3. Di chuyển file cleanup-tag-updates.js vào functions/
```bash
mv cleanup-tag-updates.js functions/cleanup-tag-updates.js
```

### 2.4. Tạo file index.js
File `functions/index.js` sẽ export tất cả functions:

```javascript
const cleanupFunctions = require('./cleanup-tag-updates');

// Export all cleanup functions
exports.cleanupOldTagUpdates = cleanupFunctions.cleanupOldTagUpdates;
exports.manualCleanupTagUpdates = cleanupFunctions.manualCleanupTagUpdates;
exports.getCleanupStats = cleanupFunctions.getCleanupStats;
```

### 2.5. Cập nhật package.json
File `functions/package.json`:

```json
{
  "name": "functions",
  "description": "Cloud Functions for Firebase",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

### 2.6. Cài đặt dependencies
```bash
cd functions
npm install
```

---

## ☁️ Bước 3: Upgrade Firebase Plan (QUAN TRỌNG!)

Cloud Functions yêu cầu **Blaze Plan** (pay-as-you-go).

### 3.1. Upgrade Plan
1. Vào Firebase Console: https://console.firebase.google.com/
2. Chọn project **n2shop-69e37**
3. Click **Upgrade** ở góc dưới bên trái
4. Chọn **Blaze Plan** → Nhập thông tin thanh toán

### 3.2. Chi phí ước tính

**Scheduled Function (cleanupOldTagUpdates):**
- Chạy: 1 lần/ngày
- Chi phí: ~$0.01/tháng (rất rẻ)

**HTTP Functions (manualCleanupTagUpdates, getCleanupStats):**
- Chạy: Khi cần (thường ít khi dùng)
- Chi phí: $0.40/million invocations

**Realtime Database:**
- Bandwidth: ~$1/GB
- Storage: $5/GB/month
- TAG updates (7 days retention) ước tính: < $0.1/month

**Tổng chi phí dự kiến: < $1/month**

---

## 📤 Bước 4: Deploy Functions

### 4.1. Test locally trước (Optional)
```bash
cd functions
firebase emulators:start
```
- Mở http://localhost:4000 → Test functions
- Ctrl+C để thoát

### 4.2. Deploy lên Firebase
```bash
cd /home/user/n2store/firebase-functions
firebase deploy --only functions
```

**Output sẽ như sau:**
```
✔  functions: Finished running predeploy script.
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (X.XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: creating function cleanupOldTagUpdates(asia-southeast1)...
i  functions: creating function manualCleanupTagUpdates(asia-southeast1)...
i  functions: creating function getCleanupStats(asia-southeast1)...
✔  functions[asia-southeast1-cleanupOldTagUpdates]: Successful create operation.
✔  functions[asia-southeast1-manualCleanupTagUpdates]: Successful create operation.
✔  functions[asia-southeast1-getCleanupStats]: Successful create operation.

✔  Deploy complete!
```

### 4.3. Lấy URLs của HTTP Functions
```bash
firebase functions:list
```

**Copy URLs:**
```
cleanupOldTagUpdates (scheduled)
manualCleanupTagUpdates: https://asia-southeast1-n2shop-69e37.cloudfunctions.net/manualCleanupTagUpdates
getCleanupStats: https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats
```

---

## ✅ Bước 5: Test Functions

### 5.1. Test Scheduled Function
Scheduled function sẽ tự chạy lúc 2h sáng hàng ngày. Để test ngay:

**Option 1: Trigger manually từ Firebase Console**
1. Vào Firebase Console → Functions
2. Click vào function **cleanupOldTagUpdates**
3. Tab **Logs** → Click **Run now** (nếu có)

**Option 2: Gọi HTTP trigger để test**
```bash
curl -X POST https://asia-southeast1-n2shop-69e37.cloudfunctions.net/manualCleanupTagUpdates
```

**Expected Response:**
```json
{
  "success": true,
  "deletedCount": 10,
  "totalScanned": 50,
  "retentionDays": 7,
  "cutoffDate": "2025-11-25T02:00:00.000Z"
}
```

### 5.2. Test Get Stats
```bash
curl https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats
```

**Expected Response:**
```json
{
  "totalRecords": 50,
  "oldRecords": 10,
  "newRecords": 40,
  "retentionDays": 7,
  "cutoffDate": "2025-11-25T02:00:00.000Z",
  "estimatedStorageKB": 12.5
}
```

---

## 📊 Bước 6: Monitoring

### 6.1. Xem Logs
```bash
# Xem logs realtime
firebase functions:log --only cleanupOldTagUpdates

# Hoặc xem trên Firebase Console
# Console → Functions → Logs tab
```

### 6.2. Check Scheduled Execution
Vào Firebase Console → Functions → **cleanupOldTagUpdates** → **Logs**

Sẽ thấy logs mỗi ngày lúc 2h sáng:
```
🧹 Starting TAG updates cleanup...
Cutoff timestamp: 1732492800000 (2025-11-25T02:00:00.000Z)
✅ Deleted: 271b0000-5d1c-0015-8724-08de31a99b47 (DH001) - 2025-11-20T10:30:00.000Z
✅ Deleted: 382c0000-6e2d-0016-9835-19ef42b00c58 (DH002) - 2025-11-21T14:20:00.000Z
🎉 Cleanup completed!
📊 Summary: { deletedCount: 10, keptCount: 40, totalScanned: 50 }
```

### 6.3. Setup Alert (Optional)
Firebase Console → Functions → **cleanupOldTagUpdates** → **Health** tab
- Enable email alerts khi function fail
- Set threshold: > 10% error rate

---

## 🔄 Bước 7: Update Functions (Sau này)

Khi cần update code (ví dụ thay đổi RETENTION_DAYS):

### 7.1. Edit file
```bash
nano /home/user/n2store/firebase-functions/functions/cleanup-tag-updates.js
```

### 7.2. Deploy lại
```bash
firebase deploy --only functions:cleanupOldTagUpdates
```

---

## 🐛 Troubleshooting

### Issue 1: "Missing permissions" khi deploy
**Fix:**
```bash
# Đảm bảo user có quyền Editor hoặc Owner của Firebase project
# Vào Firebase Console → Settings → Users and Permissions → Add user
```

### Issue 2: "Billing account not configured"
**Fix:**
- Vào Firebase Console → Upgrade to Blaze Plan
- Thêm billing account

### Issue 3: Scheduled function không chạy
**Check:**
1. Function có được deploy thành công không?
   ```bash
   firebase functions:list
   ```
2. Xem logs để check errors:
   ```bash
   firebase functions:log --only cleanupOldTagUpdates
   ```
3. Verify timezone: Phải là `Asia/Ho_Chi_Minh`

### Issue 4: Function timeout
**Fix:**
Nếu có quá nhiều records (>10,000), tăng timeout:
```javascript
exports.cleanupOldTagUpdates = functions
  .region('asia-southeast1')
  .runWith({
    timeoutSeconds: 540, // 9 minutes (default là 60s)
    memory: '1GB'
  })
  .pubsub
  .schedule('0 2 * * *')
  // ...
```

---

## 📝 Notes

### Retention Period Config
Để thay đổi retention period (mặc định 7 ngày):
```javascript
const RETENTION_DAYS = 14; // Tăng lên 14 ngày
```

### Timezone
Scheduled function chạy theo timezone `Asia/Ho_Chi_Minh` (UTC+7):
- 2 AM Hanoi Time = 7 PM UTC (ngày hôm trước)

### Database Rules
Đảm bảo Firebase Realtime Database Rules cho phép Cloud Functions write:
```json
{
  "rules": {
    "tag_updates": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

---

## 📞 Support

**Logs:**
- Firebase Console: https://console.firebase.google.com/project/n2shop-69e37/functions/logs
- CLI: `firebase functions:log`

**Documentation:**
- Firebase Functions: https://firebase.google.com/docs/functions
- Scheduled Functions: https://firebase.google.com/docs/functions/schedule-functions

---

**Deployed by:** Claude AI Assistant
**Date:** 2025-12-02
**Version:** 1.0.0
