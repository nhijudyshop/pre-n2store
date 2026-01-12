# Firebase Cloud Functions - n2store

Firebase Cloud Functions for automatic TAG updates cleanup in n2store Orders Report system.

## 📦 Structure

```
firebase-functions/
├── functions/
│   ├── index.js                  # Main entry point (exports all functions)
│   ├── cleanup-tag-updates.js    # TAG cleanup functions
│   ├── package.json              # Dependencies
│   └── node_modules/             # (generated after npm install)
├── firebase.json                 # Firebase configuration
├── .firebaserc                   # Firebase project config
├── DEPLOYMENT_GUIDE.md           # Detailed deployment instructions
└── README.md                     # This file
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd functions
npm install
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Deploy
```bash
firebase deploy --only functions
```

## 📋 Available Functions

### cleanupOldTagUpdates (Scheduled)
- **Type:** Scheduled Function
- **Schedule:** Daily at 2:00 AM (Asia/Ho_Chi_Minh timezone)
- **Purpose:** Automatically deletes TAG updates older than 7 days
- **Trigger:** Cloud Scheduler (automatic)

### manualCleanupTagUpdates (HTTP)
- **Type:** HTTP Trigger
- **URL:** `https://asia-southeast1-n2shop-69e37.cloudfunctions.net/manualCleanupTagUpdates`
- **Purpose:** Manually trigger cleanup on-demand
- **Method:** POST

### getCleanupStats (HTTP)
- **Type:** HTTP Endpoint
- **URL:** `https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats`
- **Purpose:** Get statistics about TAG updates (old vs new)
- **Method:** GET

## 📖 Documentation

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

## 🔧 Configuration

### Retention Period
Edit `functions/cleanup-tag-updates.js`:
```javascript
const RETENTION_DAYS = 7; // Change to desired number of days
```

### Timezone
Default: `Asia/Ho_Chi_Minh` (UTC+7)

### Region
Default: `asia-southeast1` (Singapore - closest to Vietnam)

## 💰 Cost Estimate

- **Scheduled Function:** ~$0.01/month
- **HTTP Functions:** $0.40/million invocations (rarely used)
- **Total:** < $1/month

## 📊 Monitoring

### View Logs
```bash
firebase functions:log --only cleanupOldTagUpdates
```

### Firebase Console
https://console.firebase.google.com/project/n2shop-69e37/functions/logs

## 🐛 Troubleshooting

**Function not deploying?**
- Make sure you're on Blaze plan (pay-as-you-go)
- Check billing account is configured

**Scheduled function not running?**
- Check function logs for errors
- Verify timezone setting
- Ensure Cloud Scheduler API is enabled

**Need help?**
- Check DEPLOYMENT_GUIDE.md
- View Firebase Functions docs: https://firebase.google.com/docs/functions

## 📝 Version

- **Version:** 1.0.0
- **Created:** 2025-12-02
- **Firebase Project:** n2shop-69e37
- **Node Version:** 20

## 🔗 Related Files

- Main TAG implementation: `/orders-report/tab1-orders.js`
- Realtime sync docs: `/orders-report/TAG_REALTIME_SYNC.md`
- Realtime manager: `/orders-report/realtime-manager.js`
