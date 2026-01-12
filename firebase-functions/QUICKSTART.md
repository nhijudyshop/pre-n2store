# Quick Start - Deploy Firebase Functions

## 🚀 Fastest Way (Automated Script)

```bash
cd /home/user/n2store/firebase-functions
./deploy.sh
```

Script will automatically:
- ✅ Check prerequisites (Node.js, npm, Firebase CLI)
- ✅ Install Firebase CLI if missing
- ✅ Login to Firebase
- ✅ Install dependencies
- ✅ Deploy functions

---

## 📋 Manual Deployment (3 Steps)

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Step 2: Install Dependencies
```bash
cd /home/user/n2store/firebase-functions/functions
npm install
```

### Step 3: Deploy
```bash
cd /home/user/n2store/firebase-functions
firebase deploy --only functions
```

---

## ⚠️ Requirements

### 1. Upgrade to Blaze Plan
Firebase Cloud Functions require **Blaze Plan** (pay-as-you-go).

**How to upgrade:**
1. Go to: https://console.firebase.google.com/project/n2shop-69e37
2. Click **Upgrade** (bottom left)
3. Select **Blaze Plan**
4. Add billing information

**Cost:** ~$1/month for this project

### 2. Node.js 20+
```bash
node --version  # Should be v20 or higher
```

If not installed: https://nodejs.org/

---

## 📊 After Deployment

### View Deployed Functions
```bash
firebase functions:list
```

### Test Cleanup Stats
```bash
curl https://asia-southeast1-n2shop-69e37.cloudfunctions.net/getCleanupStats
```

### Manual Trigger Cleanup
```bash
curl -X POST https://asia-southeast1-n2shop-69e37.cloudfunctions.net/manualCleanupTagUpdates
```

### View Logs
```bash
firebase functions:log --only cleanupOldTagUpdates
```

### Monitor in Console
https://console.firebase.google.com/project/n2shop-69e37/functions

---

## ⏰ Cleanup Schedule

**Scheduled Function:** `cleanupOldTagUpdates`
- Runs: **Daily at 2:00 AM** (Vietnam time)
- Deletes: TAG updates older than **7 days**
- Region: **asia-southeast1** (Singapore)

---

## 🐛 Common Issues

### "Billing account not configured"
→ Upgrade to Blaze plan (see Requirements above)

### "Missing permissions"
→ Make sure your Google account has Editor/Owner role on project

### "Functions not running"
→ Check logs: `firebase functions:log`

---

## 📖 Full Documentation

- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Project README:** [README.md](./README.md)
- **TAG Sync Docs:** [../orders-report/TAG_REALTIME_SYNC.md](../orders-report/TAG_REALTIME_SYNC.md)

---

## ✅ Success Indicators

After deployment, you should see:
```
✔  functions[asia-southeast1-cleanupOldTagUpdates]: Successful create operation.
✔  functions[asia-southeast1-manualCleanupTagUpdates]: Successful create operation.
✔  functions[asia-southeast1-getCleanupStats]: Successful create operation.

✔  Deploy complete!
```

Firebase Console will show 3 functions in **asia-southeast1** region.

---

**Need help?** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.
