# Pull Request: Complete Phone Extraction & TPOS Customer Name Integration

## 📋 Summary

This PR implements a complete phone extraction and customer name lookup system for the balance history feature, enabling automatic tracking of customer phone numbers from bank transactions and fetching customer names from TPOS Partner API.

## ✨ Key Features

### 1. **Phone Extraction from Transaction Content**
- Automatically extracts phone numbers (>4 digits) from bank transaction content
- Takes last occurrence of 5+ consecutive digits
- Handles "GD" separator in content (parses text before "GD")
- Saves extracted phones to `balance_customer_info` table with unique code format: `PHONE{phone}`

### 2. **Phone Data Viewer Modal**
- New "Xem Phone Data" button to view all phone records
- Displays table with: Unique Code, Phone, Customer Name, Created At, Updated At
- Pagination support (up to 500 records)
- Real-time data from database

### 3. **Batch Phone Update**
- New "Cập nhật Phone" button for retroactive processing
- Extracts phones from old transactions that weren't processed
- Configurable limit (default: 100 transactions)
- Shows progress alert with success/skipped/failed counts

### 4. **TPOS Partner API Integration**
- New "Lấy Tên từ TPOS" button to auto-fetch customer names
- Backend token management from environment variables (no frontend login required)
- Automatic token caching with 1-hour expiry (5-minute buffer)
- Validates 10-digit Vietnamese phone numbers
- Groups customers by unique phone number
- Rate limiting (200ms delay between API calls)

## 🔧 Technical Implementation

### Backend Changes

**New Service: `render.com/services/tpos-token-manager.js`**
- Singleton token manager for TPOS authentication
- Auto-refresh on token expiry
- Uses credentials from environment variables:
  - `TPOS_USERNAME`
  - `TPOS_PASSWORD`
  - `TPOS_CLIENT_ID` (optional, defaults to "tmtWebApp")

**New API Endpoints:**
1. `GET /api/sepay/phone-data` - Fetch phone records with pagination
2. `PUT /api/sepay/customer-info/:unique_code` - Update customer name
3. `GET /api/sepay/tpos/customer/:phone` - Fetch customer from TPOS by phone
4. `POST /api/sepay/batch-update-phones` - Batch extract phones from old transactions

**Updated Endpoints:**
- `GET /api/customers/search` - Now queries `balance_customer_info` instead of deleted `customers` table

### Frontend Changes

**New Buttons:**
- "Xem Phone Data" - Opens modal with phone records table
- "Lấy Tên từ TPOS" - Fetches customer names from TPOS API
- "Cập nhật Phone" - Batch updates phones from old transactions

**New Modal:**
- Phone Data Modal with table view
- Auto-refresh after fetching names
- Loading states and progress alerts

**New Functions:**
- `showPhoneDataModal()` - Display phone records in modal
- `fetchCustomerNamesFromTPOS()` - Auto-fetch names using backend API
- `batchUpdatePhones()` - Trigger batch phone extraction

## 🐛 Bug Fixes

1. **Fixed unclosed comment block** causing syntax error in `sepay-webhook.js`
2. **Fixed customer search endpoint** to query `balance_customer_info` instead of deleted `customers` table
3. **Refactored token management** from frontend localStorage to backend environment variables

## 📝 Database Schema

No new tables required. Uses existing `balance_customer_info` table with columns:
- `unique_code` (VARCHAR 50, UNIQUE) - Format: `PHONE{phone}`
- `customer_phone` (VARCHAR 50)
- `customer_name` (VARCHAR 255)
- `created_at`, `updated_at` (TIMESTAMP)

## 🚀 Deployment Steps

### 1. Set Environment Variables on Render.com
```bash
TPOS_USERNAME=your_tpos_username
TPOS_PASSWORD=your_tpos_password
TPOS_CLIENT_ID=tmtWebApp  # Optional
```

### 2. Restart Server
- Render.com will auto-deploy on merge to main
- Or manually trigger deploy from dashboard

### 3. Test Workflow
1. Click "Cập nhật Phone" to extract phones from transactions
2. Click "Lấy Tên từ TPOS" to fetch customer names
3. Click "Xem Phone Data" to view all records

## 📊 Expected Flow

```
1. Webhook receives transaction → Extract phone from content
                                    ↓
2. Generate unique_code → "PHONE0901234567"
                                    ↓
3. UPSERT to balance_customer_info
                                    ↓
4. Mark transaction debt_added = TRUE
                                    ↓
5. Admin clicks "Lấy Tên từ TPOS"
                                    ↓
6. Backend fetches customer name from TPOS API
                                    ↓
7. Update customer_name in database
                                    ↓
                                  Done ✅
```

## 🧪 Testing

**Test phone extraction:**
```bash
# Send test webhook
curl -X POST https://your-domain.com/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999999,
    "gateway": "YOUR_GATEWAY",
    "content": "CT DEN:0123456789 ND:0901234567 thanh toan",
    "transferType": "in",
    "transferAmount": 500000
  }'
```

**Verify in database:**
```sql
SELECT unique_code, customer_phone, customer_name
FROM balance_customer_info
WHERE unique_code LIKE 'PHONE%'
ORDER BY created_at DESC
LIMIT 10;
```

## 📚 Documentation

All guides available in `balance-history/` directory:
- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `PHONE_PARTNER_FETCH_GUIDE.md` - TPOS API integration guide
- `DEBUG_SCRIPT.sql` - Debugging queries
- `SETUP_ALL.sql` - Database setup (if needed)

## ⚠️ Breaking Changes

None. All changes are additive.

## ✅ Checklist

- [x] Phone extraction from transaction content
- [x] Save to balance_customer_info table
- [x] Phone data viewer modal
- [x] Batch phone update button
- [x] TPOS Partner API integration
- [x] Backend token management from env vars
- [x] Customer search endpoint fixed
- [x] All bugs resolved
- [x] Documentation updated
- [x] Ready for production deployment

## 🎯 Benefits

1. **Automatic tracking** - No manual phone entry needed
2. **Customer identification** - Auto-fetch names from TPOS
3. **Retroactive processing** - Update old transactions with one click
4. **No frontend login** - TPOS credentials managed on backend
5. **Secure** - Tokens cached and auto-refreshed
6. **User-friendly** - Simple button interface

## 📦 Commits Included

```
5f8131d refactor: Use backend TPOS token from environment variables
2f90894 feat: Add TPOS Partner API integration to fetch customer names
138c6c4 feat: Add phone data viewer modal
772ad2f feat: Add batch phone update button for retroactive processing
3673682 fix: Search in balance_customer_info instead of customers table
4039109 fix: Remove unclosed comment block causing syntax error
```

---

**Ready to merge and deploy! 🚀**

Set the required environment variables on Render.com, then merge to main for automatic deployment.

## 🔗 Create Pull Request

Visit: https://github.com/nhijudyshop/n2store/compare/main...claude/review-balance-history-yRCqn

Or merge directly:
```bash
git checkout main
git merge claude/review-balance-history-yRCqn
git push origin main
```
