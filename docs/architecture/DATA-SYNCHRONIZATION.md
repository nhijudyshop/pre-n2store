# Data Synchronization - Hướng dẫn đồng bộ dữ liệu

## Mục lục
1. [Vấn đề](#vấn-đề)
2. [Giải pháp hiện tại](#giải-pháp-hiện-tại)
3. [Các giải pháp khác](#các-giải-pháp-khác)
4. [Implementation trong Project](#implementation-trong-project)
5. [Best Practices](#best-practices)

---

## Vấn đề

### Bối cảnh
Khi ứng dụng lưu dữ liệu ở **localStorage** (local) và **Firebase/Firestore** (cloud), sẽ xảy ra vấn đề **bất đồng bộ** giữa nhiều thiết bị/người dùng.

### Ví dụ cụ thể

```
User A (máy 1)              Firebase              User B (máy 2)
─────────────────────────────────────────────────────────────────
localStorage: {order1}  →   {order1}         ←   localStorage: {order1}

User A xóa order1       →   {empty}              localStorage: {order1} ← VẪN CÒN!
localStorage: {empty}
                                                 User B không biết order1 đã bị xóa
```

### Các vấn đề thường gặp

| Vấn đề | Mô tả |
|--------|-------|
| **Stale Data** | Dữ liệu cũ không được cập nhật |
| **Conflict** | 2 người cùng sửa 1 record |
| **Lost Updates** | Thay đổi bị ghi đè |
| **Inconsistent State** | Dữ liệu khác nhau giữa các máy |

---

## Giải pháp hiện tại

### Firebase as Source of Truth + Real-time Listener

**Mô tả**: Firebase là nguồn dữ liệu chính xác. localStorage chỉ là cache để hiển thị khi offline. Real-time listener tự động đồng bộ thay đổi.

```javascript
const Store = {
    _data: new Map(),
    _isListening: false,
    _unsubscribe: null,

    async init() {
        // 1. Load từ Firestore TRƯỚC (source of truth)
        const loaded = await this._loadFromFirestore();

        // 2. Nếu offline, fallback to localStorage cache
        if (!loaded) {
            this._loadFromLocalStorage();
        }

        // 3. Cleanup dữ liệu cũ
        await this.cleanup();

        // 4. Setup real-time listener
        this._setupRealtimeListener();
    },

    async _loadFromFirestore() {
        // CLEAR dữ liệu cũ - Firestore là source of truth
        this._data.clear();

        const doc = await this._getDocRef().get();
        if (doc.exists) {
            // REPLACE (không merge) với data từ Firestore
            Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                this._data.set(k, v);
            });
        }

        this._saveToLocalStorage(); // Cache
        return true;
    },

    // Add/Update: dùng merge:true (an toàn cho concurrent edits)
    _saveToFirestore() {
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(async () => {
            await this._getDocRef().set({
                data: Object.fromEntries(this._data),
                lastUpdated: Date.now()
            }, { merge: true });
        }, 2000);
    },

    save() {
        this._saveToLocalStorage();
        if (!this._isListening) {
            this._saveToFirestore();
        }
    },

    // Delete: dùng FieldValue.delete() để xóa field cụ thể
    async delete(id) {
        this._data.delete(id);
        this._saveToLocalStorage();

        // Xóa field cụ thể, không ảnh hưởng entries khác
        await this._getDocRef().update({
            [`data.${id}`]: firebase.firestore.FieldValue.delete(),
            lastUpdated: Date.now()
        });
    }
};
```

**Ưu điểm**:
- Firebase là single source of truth - không bị conflict
- localStorage chỉ là cache, không gây stale data
- Real-time listener tự động đồng bộ thay đổi từ máy khác
- `merge: true` cho add/update: an toàn khi nhiều tab/device cùng edit
- `FieldValue.delete()` cho delete: xóa chính xác 1 entry, không ảnh hưởng entries khác

**Real-time Listener Pattern**:
```javascript
_setupRealtimeListener() {
    this._unsubscribe = this._getDocRef()
        .onSnapshot((doc) => {
            this._isListening = true;
            // Update _data từ Firestore
            // Update localStorage cache
            this._isListening = false;
        });
}

destroy() {
    if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
    }
}
```

**Nhược điểm**:
- Khi offline sẽ dùng cache cũ

---

## Implementation trong Project

### Stores và Collections (Version 2)

| Store | File | localStorage Key | Firestore Collection |
|-------|------|------------------|---------------------|
| `InvoiceStatusStore` | `tab1-fast-sale-invoice-status.js` | `invoiceStatusStore_v2` | `invoice_status_v2` |
| `InvoiceStatusDeleteStore` | `tab1-fast-sale-workflow.js` | `invoiceStatusDelete_v2` | `invoice_status_delete_v2` |

> **Note**: Đã đổi sang version 2 (`_v2`) để tách biệt hoàn toàn với code cũ.

### Firestore Document Structure

```
invoice_status_v2/
└── {username} (document)
    ├── data: {
    │     "saleOnlineId1": { AmountTotal, Number, State, ... },
    │     "saleOnlineId2": { ... }
    │   }
    ├── sentBills: ["id1", "id2", ...]
    └── lastUpdated: timestamp
```

### Strategy: merge:true + FieldValue.delete()

```javascript
// Add/Update: dùng merge:true (an toàn cho concurrent edits)
await docRef.set({ data: {...} }, { merge: true });

// Delete: dùng FieldValue.delete() để xóa field cụ thể
await docRef.update({
    [`data.${id}`]: firebase.firestore.FieldValue.delete(),
    lastUpdated: Date.now()
});
```

**Tại sao?**
- `merge: true` cho add/update: không ghi đè entries của tab/device khác
- `FieldValue.delete()` cho delete: xóa chính xác 1 field, không ảnh hưởng gì khác

### Admin vs Normal User

```javascript
async _loadFromFirestore() {
    this._data.clear(); // CLEAR trước

    if (this._isAdmin()) {
        // Admin: Load TẤT CẢ documents
        const snapshot = await db.collection('invoice_status_v2').get();
        snapshot.forEach(doc => {
            Object.entries(doc.data().data || {}).forEach(([k, v]) => {
                this._data.set(k, v);
            });
        });
    } else {
        // Normal user: Chỉ load document của mình
        const doc = await this._getDocRef().get();
        // ...
    }

    this._saveToLocalStorage(); // Cache
}
```

### Get Username từ localStorage

```javascript
_getDocRef() {
    const db = firebase.firestore();
    // Fallback to localStorage nếu authManager chưa ready
    const authState = window.authManager?.getAuthState();
    const userType = authState?.userType || localStorage.getItem('userType') || '';
    const username = authState?.username || userType.split('-')[0] || 'default';
    return db.collection(FIRESTORE_COLLECTION).doc(username);
}
```

---

## Best Practices

### 1. Luôn có Timestamp

```javascript
const entry = {
    ...data,
    timestamp: Date.now()
};
```

### 2. Debounce Firestore Writes

```javascript
_saveToFirestore() {
    clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(async () => {
        await this._getDocRef().set(data); // 2s debounce
    }, 2000);
}
```

### 3. Cleanup Old Data

```javascript
async cleanup() {
    const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days
    const now = Date.now();

    for (const [key, value] of this._data) {
        if (now - value.timestamp > maxAge) {
            this._data.delete(key);
        }
    }
    this.save();
}
```

### 4. Real-time Listener với `_isListening` flag

```javascript
save() {
    this._saveToLocalStorage();
    // Tránh infinite loop khi nhận real-time updates
    if (!this._isListening) {
        this._saveToFirestore();
    }
}
```

### 5. Conflict Resolution

| Strategy | Mô tả |
|----------|-------|
| **Firebase Wins** | **ĐANG DÙNG** - Firebase là source of truth, REPLACE local data |
| **Timestamp Compare** | Dữ liệu mới hơn thắng |

---

## Tham khảo

- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
