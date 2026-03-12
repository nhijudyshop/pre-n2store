Technical Migration Blueprint: Firebase to Self-Hosted (Render.com)
Bản Thiết Kế Chuyển Đổi Kỹ Thuật: Từ Firebase sang Tự Host trên Render.com
🚨 PHẦN 0: PHÂN TÍCH VẤN ĐỀ FIREBASE HIỆN TẠI - TẠI SAO TỐN NHIỀU TIỀN?
Tổng Kết Vấn Đề
Số lượng Listeners đang hoạt động đồng thời trên mỗi trang:

Trang	.on() Listeners	Vấn đề chính
index.html (Admin)	4 listeners	soluongDisplaySettings, 3x child_* listeners
soluong-list.html (Display)	7 listeners	displaySettings, mergeVariants, syncCurrentPage, syncSearchData, 3x child_*
social-sales.html	4 listeners	displaySettings, 3x child_* listeners
hidden-soluong.html	7 listeners	hiddenDisplaySettings, mergeVariants, syncCurrentPage, syncSearchData, 3x child_*
Tổng: Nếu mở 4 trang cùng lúc = 22 persistent listeners!

VẤN ĐỀ #1: child_changed DOWNLOAD TOÀN BỘ PRODUCT (CHI PHÍ CAO NHẤT)
Hiện trạng:

// firebase-helpers.js:379
productsRef.on('child_changed', (snapshot) => {
    const updatedProduct = snapshot.val();  // 👈 TOÀN BỘ PRODUCT OBJECT
    // ...
});
Vấn đề:
Khi chỉ thay đổi soldQty (+1), Firebase vẫn gửi TOÀN BỘ product object
Mỗi product có thể 500 bytes - 2KB (tùy thuộc vào image URL, name, etc.)
Nếu 100 products, mỗi phút có 10 updates = 10 x 100 clients x 1KB = 1MB/phút = 60MB/giờ
Ước tính chi phí:
Firebase charges: $5/GB downloaded
60MB/giờ x 8 giờ livestream = 480MB/ngày
30 ngày = 14.4GB/tháng = ~$72/tháng chỉ cho product updates!
VẤN ĐỀ #2: child_added FIRE CHO MỌI PRODUCT KHI LOAD TRANG
Hiện trạng:

// firebase-helpers.js:328
productsRef.on('child_added', (snapshot) => {
    // Fires for EVERY existing child on initial setup
    // Then fires for new children
});
Vấn đề:
Khi mở trang, Firebase fire child_added cho MỌI product hiện có
Nếu có 200 products, đó là 200 events khi load trang
Code có check alreadyLoaded nhưng vẫn nhận events (chỉ bỏ qua xử lý)
Chi phí:
Mỗi lần load trang = 200 events x 1KB = 200KB
100 page loads/ngày = 20MB/ngày = 600MB/tháng = ~$3/tháng
VẤN ĐỀ #3: SYNC LISTENERS LUÔN ACTIVE (KỂ CẢ KHI KHÔNG CẦN)
Hiện trạng trong soluong-list.html:

// Line 2351 - LUÔN LUÔN LISTEN
database.ref('soluongSyncCurrentPage').on('value', ...);

// Line 2373 - LUÔN LUÔN LISTEN
database.ref('soluongSyncSearchData').on('value', ...);
Vấn đề:
Listeners này chỉ cần khi isSyncMode = true
Nhưng code setup listeners TRƯỚC KHI check sync mode
Kể cả khi không sync, vẫn nhận mọi update
Chi phí:
Mỗi thay đổi page/search = broadcast đến tất cả clients
10 clients mở soluong-list.html, admin navigate 50 lần = 500 reads
Nhỏ nhưng tích lũy
VẤN ĐỀ #4: KHÔNG CÓ .off() KHI CHUYỂN TRANG
Hiện trạng:

// main.js, soluong-list.html
function setupFirebaseListeners() {
    database.ref('soluongDisplaySettings').on('value', ...);
    // ... các listeners khác

    // KHÔNG CÓ cleanup khi user rời trang!
}
Vấn đề:
Khi user navigate đi (trong SPA), listeners vẫn active
"Zombie listeners" tiếp tục nhận data
Memory leak + bandwidth waste
VẤN ĐỀ #5: loadAllProductsFromFirebase + child_added = DOUBLE LOAD
Hiện trạng trong main.js:

// Line 2259
soluongProducts = await loadAllProductsFromFirebase(database);
// ^^ Đã load TẤT CẢ products

// Line 2280
setupFirebaseListeners();
// ^^ Setup child_added listener, Firebase sẽ fire cho mỗi product AGAIN
Vấn đề:
Load 1 lần bằng once('value') - đúng
Nhưng child_added vẫn fire cho mỗi product khi setup
Code có check alreadyLoaded nhưng Firebase vẫn gửi data
VẤN ĐỀ #6: getAllCartSnapshots - N+1 QUERIES
Hiện trạng:

// firebase-helpers.js:550-593
async function getAllCartSnapshots(database) {
    const metaSnapshot = await database.ref('cartHistoryMeta').once('value');
    // ... get sortedIds

    for (const snapshotId of sortedIds) {
        const snapshot = await getCartSnapshot(database, snapshotId);  // 1 query mỗi snapshot
    }
}
Vấn đề:
10 snapshots = 11 queries (1 meta + 10 data)
Mỗi snapshot có thể lớn (chứa products data)
Không cache, load lại mỗi lần mở Cart History
BẢNG TÓM TẮT CHI PHÍ ƯỚC TÍNH
Vấn đề	Bandwidth/tháng	Chi phí ước tính
child_changed full object	14.4 GB	$72
child_added initial load	600 MB	$3
Sync listeners unnecessary	200 MB	$1
Double load products	300 MB	$1.5
Cart snapshots N+1	100 MB	$0.5
TỔNG	~15.6 GB	~$78/tháng
GIẢI PHÁP TỐI ƯU (TRƯỚC KHI MIGRATE)
Giải pháp #1: Tách soldQty ra node riêng

// Thay vì:
soluongProducts/product_123: { Id, Name, soldQty, ... }  // Full object

// Đổi thành:
soluongProducts/product_123: { Id, Name, ... }  // Static data
soluongProductsQty/product_123: { soldQty: 5 }  // Dynamic data - nhỏ gọn
Lợi ích: Khi chỉ update qty, chỉ gửi ~20 bytes thay vì 1KB

Giải pháp #2: Chỉ listen sync khi cần

// Thay vì listen luôn:
database.ref('soluongSyncCurrentPage').on('value', ...);

// Chỉ listen khi sync mode ON:
if (isSyncMode) {
    syncPageListener = database.ref('soluongSyncCurrentPage').on('value', ...);
}

// Cleanup khi sync mode OFF:
function disableSyncMode() {
    database.ref('soluongSyncCurrentPage').off('value', syncPageListener);
}
Giải pháp #3: Cleanup listeners khi rời trang

window.addEventListener('beforeunload', () => {
    // Cleanup tất cả listeners
    database.ref('soluongDisplaySettings').off('value');
    database.ref('soluongProducts').off();
    // ... etc
});
Giải pháp #4: Cache cart snapshots

// localStorage cache với TTL
const CACHE_KEY = 'cartSnapshots';
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function getAllCartSnapshotsCached(database) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
            return data;
        }
    }

    const snapshots = await getAllCartSnapshots(database);
    localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: snapshots,
        timestamp: Date.now()
    }));
    return snapshots;
}
Giải pháp #5: Batch load cart snapshots

// Thay vì N+1 queries, load tất cả trong 1 query
async function getAllCartSnapshotsBatch(database) {
    const allSnapshots = await database.ref('cartHistory').once('value');
    return Object.entries(allSnapshots.val() || {}).map(([id, data]) => ({
        id,
        ...data
    }));
}
ƯỚC TÍNH SAU KHI TỐI ƯU
Vấn đề	Trước	Sau	Tiết kiệm
child_changed	$72	$7 (90% giảm)	$65
Sync listeners	$1	$0.2	$0.8
Cart snapshots	$0.5	$0.1	$0.4
TỔNG	$78	$10-15	$63-68/tháng
🔧 KẾ HOẠCH TỐI ƯU FIREBASE CHI TIẾT
TỔNG QUAN CÁC BƯỚC
Bước	Giải pháp	File cần sửa	Độ phức tạp	Rủi ro
1	Tách soldQty ra node riêng	firebase-helpers.js, tất cả HTML	CAO	CAO - thay đổi cấu trúc data
2	Chỉ listen sync khi cần	soluong-list.html, hidden-soluong.html	TRUNG BÌNH	THẤP
3	Cleanup listeners khi rời trang	Tất cả HTML files	THẤP	THẤP
4	Cache cart snapshots	firebase-helpers.js	THẤP	THẤP
5	Batch load cart snapshots	firebase-helpers.js	THẤP	THẤP
BƯỚC 1: TÁCH soldQty RA NODE RIÊNG (TIẾT KIỆM ~$65/THÁNG)
1.1 Phân tích chi tiết
Vấn đề hiện tại:

child_changed listener download TOÀN BỘ product object (~1KB) khi chỉ thay đổi soldQty (+1)
Đây là nguyên nhân chính gây tốn tiền (~92% bandwidth)
Giải pháp:

Tách soldQty ra node riêng: soluongProductsQty/product_123
Chỉ listen child_changed trên node qty (~20 bytes thay vì 1KB)
1.2 Cấu trúc dữ liệu mới

Firebase Database:
├── soluongProducts/           # Static data (ít thay đổi)
│   ├── product_123/
│   │   ├── Id: 123
│   │   ├── NameGet: "Áo thun trắng"
│   │   ├── QtyAvailable: 100
│   │   ├── imageUrl: "https://..."
│   │   ├── ListPrice: 250000
│   │   ├── addedAt: 1705123456789
│   │   └── isHidden: false
│   └── product_456/...
│
├── soluongProductsQty/        # Dynamic data (thay đổi thường xuyên) - MỚI
│   ├── product_123: { soldQty: 5 }
│   └── product_456: { soldQty: 3 }
│
└── soluongProductsMeta/...
1.3 Files cần sửa
File	Thay đổi	Dòng
firebase-helpers.js	updateProductQtyInFirebase() - ghi vào node mới	137-153
firebase-helpers.js	setupFirebaseChildListeners() - thêm listener cho qty	312-434
firebase-helpers.js	loadAllProductsFromFirebase() - merge qty vào product	289-306
firebase-helpers.js	addProductToFirebase() - ghi qty vào node mới	13-58
firebase-helpers.js	removeProductFromFirebase() - xóa cả qty	117-132
soluong-list.html	Cập nhật callback onQtyChanged	2309-2349
social-sales.html	Cập nhật callback onQtyChanged	1178-1215
hidden-soluong.html	Cập nhật callback onQtyChanged	2031-2069
js/main.js	Cập nhật callback onQtyChanged	2232-2254
1.4 Code thay đổi chi tiết
1.4.1 firebase-helpers.js - Hàm update qty (sửa)

// TRƯỚC (line 137-153):
async function updateProductQtyInFirebase(database, productId, change, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));
    if (newSoldQty === product.soldQty) return;

    product.soldQty = newSoldQty;
    await database.ref(`soluongProducts/${productKey}`).update({
        soldQty: newSoldQty
    });
}

// SAU:
async function updateProductQtyInFirebase(database, productId, change, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));
    if (newSoldQty === product.soldQty) return;

    // Update local first (optimistic update)
    product.soldQty = newSoldQty;

    // CHỈ GHI VÀO NODE QTY (nhỏ gọn ~20 bytes)
    await database.ref(`soluongProductsQty/${productKey}`).set({
        soldQty: newSoldQty
    });
}
1.4.2 firebase-helpers.js - Load products (sửa)

// SAU - loadAllProductsFromFirebase():
async function loadAllProductsFromFirebase(database) {
    try {
        // Load products (static data)
        const productsSnapshot = await database.ref('soluongProducts').once('value');
        const productsObject = productsSnapshot.val() || {};

        // Load qty data (dynamic data)
        const qtySnapshot = await database.ref('soluongProductsQty').once('value');
        const qtyObject = qtySnapshot.val() || {};

        // Merge qty into products
        Object.keys(productsObject).forEach(key => {
            if (qtyObject[key]) {
                productsObject[key].soldQty = qtyObject[key].soldQty || 0;
            } else {
                productsObject[key].soldQty = 0;
            }
        });

        return productsObject;

    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}
1.4.3 firebase-helpers.js - Setup listeners (sửa)

// SAU - setupFirebaseChildListeners():
function setupFirebaseChildListeners(database, localProductsObject, callbacks) {
    const productsRef = database.ref('soluongProducts');
    const qtyRef = database.ref('soluongProductsQty');  // MỚI

    // ... existing code for child_added, child_removed ...

    // CHỈ DÙNG CHO STATIC DATA (thêm product mới, xóa product)
    productsRef.on('child_added', (snapshot) => { ... });
    productsRef.on('child_removed', (snapshot) => { ... });

    // KHÔNG DÙNG child_changed cho productsRef nữa!
    // productsRef.on('child_changed', ...);  // XÓA DÒNG NÀY

    // MỚI: Listen qty changes (nhỏ gọn ~20 bytes)
    qtyRef.on('child_changed', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [qty_changed] Qty updated:', productKey, qtyData);

        // Update local object
        if (localProductsObject[productKey]) {
            localProductsObject[productKey].soldQty = qtyData.soldQty || 0;

            if (callbacks.onQtyChanged) {
                callbacks.onQtyChanged(localProductsObject[productKey], productKey);
            }
        }
    });

    return {
        detach: () => {
            productsRef.off('child_added');
            productsRef.off('child_removed');
            qtyRef.off('child_changed');  // MỚI
        }
    };
}
1.5 Migration Script (chạy 1 lần)

// migration-script.js - Chạy 1 lần để migrate data
async function migrateQtyToSeparateNode(database) {
    console.log('🔄 Starting migration...');

    // Load all products
    const productsSnapshot = await database.ref('soluongProducts').once('value');
    const products = productsSnapshot.val() || {};

    const qtyUpdates = {};

    Object.entries(products).forEach(([key, product]) => {
        // Extract soldQty to separate node
        qtyUpdates[`soluongProductsQty/${key}`] = {
            soldQty: product.soldQty || 0
        };
    });

    // Batch write qty data
    await database.ref().update(qtyUpdates);

    console.log('✅ Migration complete!', Object.keys(qtyUpdates).length, 'products migrated');
}
1.6 TEST PLAN - BƯỚC 1
#	Test Case	Cách test	Kết quả mong đợi
1.1	Migration script	Chạy migration-script.js	soluongProductsQty có data cho tất cả products
1.2	Load products	Mở index.html, kiểm tra console	Products load với soldQty đúng
1.3	Update qty (+1)	Click +1 trên product	- soldQty tăng 1
- Firebase console: chỉ soluongProductsQty thay đổi
- soluongProducts KHÔNG thay đổi
1.4	Realtime sync	Mở 2 browser, click +1	- Cả 2 browser thấy update
- Console: [qty_changed] event
1.5	Add new product	Thêm product mới từ Excel	- Product xuất hiện
- soluongProductsQty có entry mới
1.6	Remove product	Xóa product	- Product biến mất
- soluongProductsQty entry bị xóa
1.7	Firebase Usage	Kiểm tra Firebase Console → Usage	Bandwidth giảm đáng kể
1.7 Rollback Plan
Nếu gặp lỗi, có thể rollback bằng cách:

Revert code về version cũ
Data vẫn an toàn (chỉ thêm node mới, không xóa node cũ)
BƯỚC 2: CHỈ LISTEN SYNC KHI CẦN (TIẾT KIỆM ~$1/THÁNG)
2.1 Phân tích chi tiết
Vấn đề hiện tại:


// soluong-list.html:2351, hidden-soluong.html:2071
// Listeners luôn active, kể cả khi isSyncMode = false
database.ref('soluongSyncCurrentPage').on('value', ...);
database.ref('soluongSyncSearchData').on('value', ...);
Giải pháp:

Chỉ setup listeners khi isSyncMode = true
Cleanup listeners khi toggle off
2.2 Files cần sửa
File	Dòng	Thay đổi
soluong-list.html	2351-2416	Di chuyển sync listeners vào function riêng
soluong-list.html	2438-2455	Gọi setup/cleanup khi toggle sync mode
hidden-soluong.html	2071-2130	Tương tự
hidden-soluong.html	2139-2155	Tương tự
2.3 Code thay đổi chi tiết

// soluong-list.html - THÊM MỚI
let syncListenersAttached = false;
let syncPageListener = null;
let syncSearchListener = null;

function setupSyncListeners() {
    if (syncListenersAttached) return;

    console.log('🔄 Setting up sync listeners...');

    syncPageListener = database.ref('soluongSyncCurrentPage').on('value', (snapshot) => {
        const page = snapshot.val();
        if (page && !isSyncingFromFirebase && page !== currentPage) {
            // ... existing code
        }
    });

    syncSearchListener = database.ref('soluongSyncSearchData').on('value', (snapshot) => {
        // ... existing code
    });

    syncListenersAttached = true;
}

function cleanupSyncListeners() {
    if (!syncListenersAttached) return;

    console.log('🔄 Cleaning up sync listeners...');

    database.ref('soluongSyncCurrentPage').off('value', syncPageListener);
    database.ref('soluongSyncSearchData').off('value', syncSearchListener);

    syncListenersAttached = false;
}

// SỬA setupFirebaseListeners()
function setupFirebaseListeners() {
    // ... existing displaySettings, mergeVariants, products listeners ...

    // CHỈ SETUP SYNC LISTENERS NẾU CẦN
    if (isSyncMode) {
        setupSyncListeners();
    }
}

// SỬA phần hashchange handler
window.addEventListener('hashchange', () => {
    const params = parseHashParams();
    const wasSyncMode = isSyncMode;

    if (params.sync !== undefined) {
        isSyncMode = params.sync;
    } else {
        isSyncMode = false;
    }

    // TOGGLE SYNC LISTENERS
    if (isSyncMode && !wasSyncMode) {
        setupSyncListeners();
    } else if (!isSyncMode && wasSyncMode) {
        cleanupSyncListeners();
    }

    updateSyncToggleButton();
    // ... rest of existing code
});
2.4 TEST PLAN - BƯỚC 2
#	Test Case	Cách test	Kết quả mong đợi
2.1	Page load (sync ON)	Mở soluong-list.html#sync=true	Console: "Setting up sync listeners..."
2.2	Page load (sync OFF)	Mở soluong-list.html (không có #sync)	Console: KHÔNG có "Setting up sync listeners..."
2.3	Toggle sync ON	Click nút Sync để bật	Console: "Setting up sync listeners..."
2.4	Toggle sync OFF	Click nút Sync để tắt	Console: "Cleaning up sync listeners..."
2.5	Sync hoạt động	Bật sync, thay đổi page từ Admin	Display cập nhật page
2.6	Sync tắt không nhận	Tắt sync, thay đổi page từ Admin	Display KHÔNG thay đổi
BƯỚC 3: CLEANUP LISTENERS KHI RỜI TRANG
3.1 Phân tích chi tiết
Vấn đề hiện tại:

Không có cleanup khi user rời trang
Có thể gây "zombie listeners" trong SPA context
3.2 Files cần sửa
File	Thay đổi
soluong-list.html	Thêm beforeunload handler
hidden-soluong.html	Thêm beforeunload handler
social-sales.html	Thêm beforeunload handler
js/main.js	Thêm beforeunload handler
3.3 Code thay đổi chi tiết

// Thêm vào cuối mỗi file (trước </script>)

// Global variable để lưu detach function
let firebaseDetachFn = null;

// Trong setupFirebaseListeners():
firebaseDetachFn = setupFirebaseChildListeners(database, soluongProducts, { ... });

// Cleanup khi rời trang
window.addEventListener('beforeunload', () => {
    console.log('🧹 Cleaning up Firebase listeners...');

    // Cleanup product listeners
    if (firebaseDetachFn) {
        firebaseDetachFn.detach();
    }

    // Cleanup settings listener
    database.ref('soluongDisplaySettings').off('value');
    database.ref('soluongIsMergeVariants').off('value');

    // Cleanup sync listeners (if applicable)
    if (typeof cleanupSyncListeners === 'function') {
        cleanupSyncListeners();
    }
});
3.4 TEST PLAN - BƯỚC 3
#	Test Case	Cách test	Kết quả mong đợi
3.1	Page unload	Mở DevTools Network, navigate đi	Console: "Cleaning up Firebase listeners..."
3.2	Không zombie	Mở trang, đóng tab, kiểm tra Firebase console	Connections giảm
3.3	Chức năng bình thường	Sau khi thêm cleanup, test các chức năng	Tất cả hoạt động bình thường
BƯỚC 4: CACHE CART SNAPSHOTS
4.1 Phân tích chi tiết
Vấn đề hiện tại:

getAllCartSnapshots() load lại từ Firebase mỗi lần mở Cart History
Không cache, gây tốn bandwidth
4.2 Files cần sửa
File	Hàm	Thay đổi
firebase-helpers.js	getAllCartSnapshots()	Thêm cache layer
4.3 Code thay đổi chi tiết

// THÊM MỚI - Cache helper
const CART_CACHE_KEY = 'soluong_cartSnapshots_cache';
const CART_CACHE_TTL = 5 * 60 * 1000; // 5 phút

function getCartCache() {
    try {
        const cached = localStorage.getItem(CART_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CART_CACHE_TTL) {
                console.log('📦 [getAllCartSnapshots] Using cached data');
                return data;
            }
        }
    } catch (e) {
        console.warn('Cache read error:', e);
    }
    return null;
}

function setCartCache(data) {
    try {
        localStorage.setItem(CART_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

function invalidateCartCache() {
    localStorage.removeItem(CART_CACHE_KEY);
}

// SỬA getAllCartSnapshots()
async function getAllCartSnapshots(database, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
        const cached = getCartCache();
        if (cached) return cached;
    }

    console.log('🔵 [getAllCartSnapshots] Loading from Firebase...');

    // ... existing code to load from Firebase ...

    // Cache result
    setCartCache(snapshots);

    return snapshots;
}

// SỬA saveCartSnapshot() - invalidate cache
async function saveCartSnapshot(database, snapshot) {
    // ... existing code ...

    // Invalidate cache after saving
    invalidateCartCache();

    return snapshotId;
}

// SỬA deleteCartSnapshot() - invalidate cache
async function deleteCartSnapshot(database, snapshotId) {
    // ... existing code ...

    // Invalidate cache after deleting
    invalidateCartCache();
}
4.4 TEST PLAN - BƯỚC 4
#	Test Case	Cách test	Kết quả mong đợi
4.1	First load	Mở Cart History lần đầu	Console: "Loading from Firebase..."
4.2	Cached load	Đóng mở Cart History trong 5 phút	Console: "Using cached data"
4.3	Cache expired	Đợi 5 phút, mở lại	Console: "Loading from Firebase..."
4.4	Save invalidates	Save snapshot mới, mở lại	Thấy snapshot mới
4.5	Delete invalidates	Xóa snapshot, mở lại	Snapshot đã bị xóa
BƯỚC 5: BATCH LOAD CART SNAPSHOTS
5.1 Phân tích chi tiết
Vấn đề hiện tại:


// N+1 queries:
// 1. Load metadata
// 2. Load snapshot 1
// 3. Load snapshot 2
// ...
// N. Load snapshot N-1
Giải pháp:


// 1 query:
// Load tất cả snapshots cùng lúc
5.2 Files cần sửa
File	Hàm	Thay đổi
firebase-helpers.js	getAllCartSnapshots()	Batch load thay vì N+1
5.3 Code thay đổi chi tiết

// SỬA getAllCartSnapshots() - Batch load
async function getAllCartSnapshots(database, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
        const cached = getCartCache();
        if (cached) return cached;
    }

    console.log('🔵 [getAllCartSnapshots] Loading from Firebase (batch)...');

    // BATCH LOAD - 1 query thay vì N+1
    const allSnapshotsRef = await database.ref('cartHistory').once('value');
    const allSnapshots = allSnapshotsRef.val() || {};

    // Load metadata for sort order
    const metaSnapshot = await database.ref('cartHistoryMeta').once('value');
    const meta = metaSnapshot.val() || { sortedIds: [] };
    const sortedIds = Array.isArray(meta.sortedIds) ? meta.sortedIds : [];

    // Convert to array and sort
    const snapshots = Object.entries(allSnapshots)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => {
            const indexA = sortedIds.indexOf(a.id);
            const indexB = sortedIds.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });

    console.log(`✅ [getAllCartSnapshots] Loaded ${snapshots.length} snapshots (batch)`);

    // Cache result
    setCartCache(snapshots);

    return snapshots;
}
5.4 TEST PLAN - BƯỚC 5
#	Test Case	Cách test	Kết quả mong đợi
5.1	Batch load	Có 5 snapshots, mở Cart History	Console: chỉ 2 Firebase calls (cartHistory + cartHistoryMeta)
5.2	Sort order	Có nhiều snapshots	Hiển thị đúng thứ tự (newest first)
5.3	Performance	Có 10+ snapshots	Load nhanh hơn trước
THỨ TỰ THỰC HIỆN ĐỀ XUẤT
Thứ tự	Bước	Lý do
1	Bước 3 (Cleanup listeners)	Đơn giản, rủi ro thấp, test nhanh
2	Bước 4+5 (Cache + Batch)	Đơn giản, rủi ro thấp, cải thiện UX
3	Bước 2 (Sync listeners)	Trung bình, cần test kỹ toggle
4	Bước 1 (Tách soldQty)	Phức tạp nhất, cần migration, test nhiều
CHECKLIST TỔNG HỢP TRƯỚC KHI DEPLOY
 Backup Firebase data
 Test trên môi trường staging (nếu có)
 Test tất cả 5 bước riêng lẻ
 Test tích hợp (tất cả thay đổi cùng lúc)
 Monitor Firebase Usage 24h sau deploy
 So sánh bandwidth trước/sau
PHẦN A: GIẢI THÍCH DỄ HIỂU (KHÔNG CODE)
Tại sao cần chuyển đổi?
Firebase giống như thuê một căn hộ dịch vụ:

✅ Tiện lợi, không cần lo bảo trì
❌ Chi phí tăng theo lượng sử dụng (không dự đoán được)
❌ Phụ thuộc hoàn toàn vào Google
❌ Khó tùy chỉnh logic nghiệp vụ phức tạp
Self-hosted trên Render giống như xây nhà riêng:

✅ Chi phí cố định, dễ dự toán (~$24/tháng)
✅ Toàn quyền kiểm soát dữ liệu
✅ Tùy chỉnh mọi thứ theo ý muốn
❌ Cần tự bảo trì (nhưng Render làm hộ phần lớn)
1. KIẾN TRÚC MỚI - GIẢI THÍCH ĐƠN GIẢN
Hình dung hệ thống như một nhà hàng:
HIỆN TẠI (Firebase):


Khách hàng (Browser) ──→ Firebase (Đầu bếp + Nhà kho + Bồi bàn)
                              │
                              └── Google quản lý tất cả
SAU KHI CHUYỂN (Render):


Khách hàng (Browser)
        │
        ▼
┌───────────────────────────────────────┐
│           Nhà hàng của BẠN            │
│  ┌─────────────┐  ┌─────────────────┐ │
│  │ Bồi bàn     │  │ Đầu bếp        │ │
│  │ (WebSocket) │  │ (Node.js)      │ │
│  └─────────────┘  └─────────────────┘ │
│                                       │
│  ┌─────────────┐  ┌─────────────────┐ │
│  │ Bảng thông  │  │ Nhà kho        │ │
│  │ báo (Redis) │  │ (PostgreSQL)   │ │
│  └─────────────┘  └─────────────────┘ │
└───────────────────────────────────────┘
        │
        └── BẠN kiểm soát hoàn toàn
Vai trò của từng thành phần:
Thành phần	Vai trò	Ví dụ thực tế
Node.js + Fastify	"Đầu bếp" - Xử lý mọi yêu cầu	Khi admin click +1, đầu bếp nhận order và nấu
WebSocket	"Bồi bàn" - Giao tiếp real-time	Bồi bàn chạy đi chạy lại báo tin tức mới nhất
PostgreSQL	"Nhà kho" - Lưu trữ dữ liệu	Ghi chép tất cả đơn hàng, không mất
Redis	"Bảng thông báo" - Nhắn tin nhanh	Dán thông báo lên bảng để tất cả nhân viên thấy ngay
2. REAL-TIME HOẠT ĐỘNG NHƯ THẾ NÀO?
Firebase hiện tại:

Admin click +1 ──→ Firebase ──→ Tự động gửi đến Display
                       │
              (Firebase lo hết)
Hệ thống mới:

Admin click +1
      │
      ▼
┌─────────────┐
│  Browser    │ Gửi tin nhắn qua WebSocket
└─────────────┘
      │
      ▼
┌─────────────┐
│  Server     │ 1. Nhận tin nhắn
│  (Node.js)  │ 2. Lưu vào PostgreSQL
│             │ 3. Gửi thông báo vào Redis
└─────────────┘
      │
      ▼
┌─────────────┐
│   Redis     │ Pub/Sub: "Này, product_123 vừa thay đổi!"
└─────────────┘
      │
      ├──→ Display nhận được ──→ Cập nhật UI
      ├──→ Social-sales nhận được ──→ Cập nhật UI
      └──→ Tất cả clients nhận được
Giải thích Redis Pub/Sub:

Pub = Publish = Đăng tin
Sub = Subscribe = Đăng ký nhận tin
Giống như group Zalo: Ai đăng gì, tất cả thành viên đều thấy ngay
3. SYNC MODE HOẠT ĐỘNG NHƯ THẾ NÀO?
Mục đích: Admin điều khiển màn hình Display từ xa (cho OBS/Livestream)

Hình dung như điều khiển TV:


Admin (Remote)                    Display (TV)
     │                                 │
     │  "Chuyển trang 2"               │
     └────────────────────────────────►│ Hiện trang 2
                                       │
     │  "Tìm áo thun"                  │
     └────────────────────────────────►│ Lọc sản phẩm "áo thun"
                                       │
     │  "Grid 5x3"                     │
     └────────────────────────────────►│ Đổi layout 5x3
Cách hoạt động:

Admin thay đổi → Gửi lệnh qua WebSocket
Server lưu trạng thái vào Redis (nhanh)
Server broadcast đến tất cả Display đang online
Display nhận lệnh → Cập nhật giao diện
Tại sao dùng Redis cho sync?

Cực nhanh (chỉ ~1ms)
Không cần lưu vĩnh viễn (chỉ cần biết trạng thái hiện tại)
Tiết kiệm PostgreSQL cho dữ liệu quan trọng hơn
4. XỬ LÝ XUNG ĐỘT - TRÁNH "MÀ HỘI ĐẬP"
Vấn đề: 2 admin click +1 cùng lúc trên cùng 1 sản phẩm

Ví dụ:


Sản phẩm có soldQty = 5

Admin A click +1 (nghĩ sẽ thành 6)    │    Admin B click +1 (nghĩ sẽ thành 6)
            │                          │                  │
            └──────────────────────────┴──────────────────┘
                                       │
                               Đến server cùng lúc
                                       │
                        Kết quả đúng phải là 7, không phải 6!
Firebase (hiện tại): Last-write-wins (cuối cùng ghi là thắng)

Có thể sai: Cả 2 đều ghi 6 → Kết quả = 6 (mất 1 đơn!)
Hệ thống mới: Row-level locking (khóa hàng)


Admin A yêu cầu +1
        │
        ▼
┌─────────────────────────┐
│ Server: "Khóa product   │◄── Admin B phải đợi
│ _123, không ai chạm vào"│
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ Đọc: soldQty = 5        │
│ Tính: 5 + 1 = 6         │
│ Ghi: soldQty = 6        │
│ Mở khóa                 │
└─────────────────────────┘
        │
        ▼
Admin B được chạy
        │
        ▼
┌─────────────────────────┐
│ Đọc: soldQty = 6        │ (đã cập nhật)
│ Tính: 6 + 1 = 7         │
│ Ghi: soldQty = 7        │ ✅ Đúng!
└─────────────────────────┘
5. OPTIMISTIC UPDATE - CẬP NHẬT NGAY, SỬA SAU
Vấn đề: Chờ server xác nhận mất 200ms → UI lag

Giải pháp:


Admin click +1
        │
        ├──→ 1. CẬP NHẬT UI NGAY (giả sử thành công)
        │         User thấy ngay: 5 → 6
        │
        └──→ 2. GỬI ĐẾN SERVER (trong nền)
                      │
                      ├── Server OK → Xong, không làm gì
                      │
                      └── Server lỗi → HOÀN TÁC UI
                                       6 → 5 (quay lại)
                                       Hiện thông báo lỗi
Giống như: Đặt đồ ăn qua app

Bạn click "Đặt" → App hiện "Đã đặt thành công" ngay
Trong nền, app gửi đến nhà hàng
Nếu hết đồ → App báo lỗi và hoàn tiền
6. LƯU TRỮ DỮ LIỆU - TỪ JSON TREE SANG BẢNG
Firebase (JSON Tree):


{
  "soluongProducts": {
    "product_123": {
      "Id": 123,
      "NameGet": "Áo thun trắng",
      "soldQty": 5
    }
  }
}
PostgreSQL (Bảng):


┌────┬────────────┬─────────────────┬──────────┐
│ id │ product_id │ name            │ sold_qty │
├────┼────────────┼─────────────────┼──────────┤
│ 1  │ 123        │ Áo thun trắng   │ 5        │
│ 2  │ 456        │ Quần jean       │ 3        │
└────┴────────────┴─────────────────┴──────────┘
Tại sao đổi sang bảng?

✅ Tìm kiếm nhanh hơn (có index)
✅ Truy vấn phức tạp (GROUP BY, JOIN)
✅ An toàn dữ liệu (ACID transactions)
✅ Dễ backup và restore
7. CHI PHÍ & SO SÁNH
Hạng mục	Firebase	Render
Database	Theo dung lượng	$7/tháng (cố định)
Server	Không cần	$7/tháng
Cache	Không cần	$10/tháng
Tổng	$5-25/tháng	$24/tháng
Dự đoán chi phí	❌ Khó	✅ Dễ
Kiểm soát	❌ Hạn chế	✅ Toàn quyền
8. LỘ TRÌNH THỰC HIỆN
Tuần	Công việc	Chi tiết
1	Chuẩn bị	Tạo tài khoản Render, setup database
2	Xây backend	Code server WebSocket + APIs
3	Sửa frontend	Thay firebase-helpers.js bằng ws-client
4	Test	Chạy song song Firebase + Render
5	Chuyển đổi	Đổi nguồn chính sang Render
6	Dọn dẹp	Xóa code Firebase cũ
9. RỦI RO VÀ CÁCH GIẢM THIỂU
Rủi ro	Xác suất	Cách xử lý
Server restart → Mất connection	Cao	Auto-reconnect (tự kết nối lại)
Mất điện Render	Thấp	Render có redundancy
Dữ liệu không đồng bộ	Trung bình	Version control + Rollback
Quá tải server	Thấp	Scale lên plan cao hơn
PHẦN B: CHI TIẾT KỸ THUẬT (CÓ CODE)
1. Backend Tech Stack on Render
1.1 Server Runtime Recommendation
Option	Pros	Cons	Verdict
Node.js + Fastify	Fast JSON parsing, low overhead, familiar ecosystem	Single-threaded (but fine for I/O-bound)	RECOMMENDED
Node.js + Express	Most popular, huge ecosystem	Slower than Fastify (~30-40%)	Good alternative
Go + Gorilla WebSocket	Excellent concurrency, low memory	Different ecosystem, learning curve	Overkill for this scale
Bun + Elysia	Fastest benchmarks	Newer, less battle-tested	Future consideration
Recommendation: Node.js 20 LTS + Fastify + @fastify/websocket

Rationale:

Your use case is "high-frequency small text updates" (~50-200 bytes per message)
Fastify handles JSON serialization 2-3x faster than Express
Node.js event loop is perfect for I/O-bound WebSocket connections
Same JavaScript ecosystem as frontend - easier maintenance
1.2 Real-time Engine Recommendation
Library	Max Connections	Message Latency	Memory per Connection	Verdict
uWebSockets.js	1M+	<1ms	~4KB	BEST PERFORMANCE
ws	100K+	1-5ms	~10KB	Simpler, good enough
Socket.io	50K+	5-20ms	~20KB	Feature-rich but heavy
Recommendation: uWebSockets.js (via @fastify/websocket or standalone)

Rationale:

Render Web Service (free/starter): Limited to ~100 concurrent connections
Render Pro: Can handle 1000+ with uWebSockets
uWebSockets written in C++, ~10x faster than pure JS implementations
Alternative: Use ws library if you need simpler debugging. Performance difference only matters at scale (>1000 concurrent).

1.3 Data Persistence Recommendation
Option	Type	Cost on Render	Fits Firebase JSON?	Verdict
Render PostgreSQL	SQL	$7/mo (starter)	Needs conversion	RECOMMENDED
Render Redis	Key-Value	$10/mo	Good for JSON	For caching only
SQLite + Persistent Disk	SQL	$0.25/GB/mo	Needs conversion	Budget option
MongoDB Atlas (external)	NoSQL	Free tier available	Direct fit	Adds external dependency
Recommendation: PostgreSQL + Redis Caching

Rationale:

PostgreSQL for persistent storage:

ACID transactions (replaces Firebase transactions)
JSONB columns for flexible schema (hybrid SQL/NoSQL)
Mature indexing for salesLog queries by date
Redis for real-time state:

Pub/Sub for broadcasting changes to WebSocket clients
Cache hot data (current products, sync state)
Supports atomic operations (INCR, LPUSH)
1.4 Architecture Diagram

┌─────────────────────────────────────────────────────────────────────────┐
│                           RENDER.COM                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Web Service (Node.js)                            │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │ │
│  │  │   Fastify    │    │  WebSocket   │    │   Business Logic     │  │ │
│  │  │   REST API   │◄──►│   Server     │◄──►│   (Products, Logs)   │  │ │
│  │  │   (backup)   │    │ (uWebSockets)│    │                      │  │ │
│  │  └──────────────┘    └──────┬───────┘    └──────────┬───────────┘  │ │
│  │                             │                        │              │ │
│  │                             │ Pub/Sub                │              │ │
│  │                             ▼                        ▼              │ │
│  │                      ┌──────────────┐         ┌──────────────┐     │ │
│  │                      │    Redis     │         │  PostgreSQL  │     │ │
│  │                      │   (Cache +   │         │ (Persistent  │     │ │
│  │                      │   Pub/Sub)   │         │   Storage)   │     │ │
│  │                      └──────────────┘         └──────────────┘     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ WebSocket (wss://)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  index.html   │          │ soluong-list  │          │ social-sales  │
│   (Admin)     │          │   (Display)   │          │   (Staff)     │
└───────────────┘          └───────────────┘          └───────────────┘
2. Data Schema Conversion Strategy
2.1 Analysis: NoSQL vs SQL
Current Firebase Structure:

soluongProducts: Flat key-value (product_123: {...})
soluongSalesLog: Append-only log with date indexing
soluongCartHistory: Nested snapshots (metadata + products)
sync*: Simple key-value pairs
Recommendation: Hybrid PostgreSQL (Relational + JSONB)

Entity	Strategy	Rationale
Products	Relational table	Fixed schema, need indexes on Id, isHidden
SalesLog	Relational table	Query by date, staff, source
CartHistory	JSONB column	Variable product count, infrequent access
SyncState	Redis only	Ephemeral, high-frequency updates
DisplaySettings	JSONB column	Flexible schema, low-frequency
2.2 PostgreSQL Schema Design

-- =====================================================
-- PRODUCTS TABLE
-- =====================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    product_id INTEGER UNIQUE NOT NULL,     -- TPOS ID (e.g., 123456)
    name VARCHAR(255) NOT NULL,             -- NameGet
    qty_available INTEGER DEFAULT 0,        -- From TPOS
    sold_qty INTEGER DEFAULT 0,             -- Tracked locally
    remaining_qty INTEGER GENERATED ALWAYS AS (qty_available - sold_qty) STORED,
    image_url TEXT,
    product_tmpl_id INTEGER,                -- For variant grouping
    list_price DECIMAL(12,2) DEFAULT 0,
    price_variant DECIMAL(12,2) DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    last_refreshed TIMESTAMPTZ,

    -- Indexes
    CONSTRAINT valid_qty CHECK (sold_qty >= 0 AND sold_qty <= qty_available)
);

CREATE INDEX idx_products_is_hidden ON products(is_hidden);
CREATE INDEX idx_products_added_at ON products(added_at DESC);
CREATE INDEX idx_products_tmpl_id ON products(product_tmpl_id);

-- =====================================================
-- PRODUCTS METADATA TABLE
-- =====================================================
CREATE TABLE products_meta (
    id INTEGER PRIMARY KEY DEFAULT 1,       -- Singleton
    sorted_ids INTEGER[] DEFAULT '{}',      -- Array of product_ids
    product_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT single_row CHECK (id = 1)
);

-- =====================================================
-- SALES LOG TABLE (Append-only, optimized for queries)
-- =====================================================
CREATE TABLE sales_logs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(255) NOT NULL,     -- Snapshot at time of sale
    change_qty INTEGER NOT NULL,            -- +1 or -1
    source VARCHAR(50) NOT NULL,            -- 'livestream', 'facebook', 'unknown'
    staff_name VARCHAR(100),
    staff_username VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sale_date DATE GENERATED ALWAYS AS (created_at::DATE) STORED
);

CREATE INDEX idx_sales_logs_date ON sales_logs(sale_date);
CREATE INDEX idx_sales_logs_source ON sales_logs(source);
CREATE INDEX idx_sales_logs_staff ON sales_logs(staff_username);
CREATE INDEX idx_sales_logs_product ON sales_logs(product_id);

-- =====================================================
-- CART HISTORY TABLE (Snapshots stored as JSONB)
-- =====================================================
CREATE TABLE cart_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_name VARCHAR(255) NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    product_count INTEGER DEFAULT 0,
    products_data JSONB NOT NULL            -- Full product objects
);

CREATE INDEX idx_cart_snapshots_saved_at ON cart_snapshots(saved_at DESC);

-- =====================================================
-- DISPLAY SETTINGS TABLE
-- =====================================================
CREATE TABLE display_settings (
    id VARCHAR(50) PRIMARY KEY,             -- 'main', 'hidden'
    settings JSONB NOT NULL DEFAULT '{}'
);

-- Insert defaults
INSERT INTO display_settings (id, settings) VALUES
('main', '{
    "gridColumns": 4,
    "gridRows": 2,
    "gridGap": 15,
    "imageBorderRadius": 8,
    "nameFontSize": 13,
    "statsValueSize": 16
}'),
('hidden', '{}');
2.3 Redis Data Structure

# Real-time sync state (ephemeral)
sync:currentPage     -> "2"                    # Current page number
sync:searchData      -> "áo thun"              # Search keyword
sync:mergeVariants   -> "true"                 # Boolean as string

# Product cache (TTL: 1 hour)
products:all         -> JSON string            # Full products object
products:meta        -> JSON string            # Metadata

# Pub/Sub channels
channel:products     -> Broadcast product changes
channel:sync         -> Broadcast sync state changes
channel:settings     -> Broadcast display settings changes
3. Replicating Key Features (The "How-To")
3.1 The Sync Logic (Section 7)
Firebase Current Flow:


// Admin writes
database.ref('soluongSyncCurrentPage').set(2);

// Display listens
database.ref('soluongSyncCurrentPage').on('value', callback);
New WebSocket Implementation:


// ============= SERVER SIDE =============
// server/sync-manager.js

import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
const redisPub = new Redis(process.env.REDIS_URL);

// Store sync state
async function setSyncState(key, value) {
    await redis.set(`sync:${key}`, JSON.stringify(value));

    // Broadcast to all connected clients
    redisPub.publish('channel:sync', JSON.stringify({
        type: 'sync:changed',
        key: key,
        value: value,
        timestamp: Date.now()
    }));
}

// WebSocket handler
wss.on('connection', (ws, req) => {
    // Subscribe to Redis pub/sub
    const redisSub = new Redis(process.env.REDIS_URL);
    redisSub.subscribe('channel:sync');

    redisSub.on('message', (channel, message) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });

    // Send current sync state on connect
    const currentState = await getAllSyncState();
    ws.send(JSON.stringify({
        type: 'sync:init',
        data: currentState
    }));

    // Handle incoming messages
    ws.on('message', async (data) => {
        const msg = JSON.parse(data);

        if (msg.type === 'sync:set') {
            await setSyncState(msg.key, msg.value);
        }
    });

    ws.on('close', () => {
        redisSub.unsubscribe();
        redisSub.quit();
    });
});

// ============= CLIENT SIDE =============
// Replace firebase-helpers.js sync functions

class SyncManager {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.listeners = new Map();

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'sync:init') {
                // Initial state received
                this.syncState = msg.data;
                this.notifyAllListeners();
            }

            if (msg.type === 'sync:changed') {
                // Specific key changed
                this.syncState[msg.key] = msg.value;
                this.notifyListeners(msg.key, msg.value);
            }
        };
    }

    // Replaces: database.ref('soluongSyncCurrentPage').set(value)
    setSyncValue(key, value) {
        this.ws.send(JSON.stringify({
            type: 'sync:set',
            key: key,
            value: value
        }));
    }

    // Replaces: database.ref('soluongSyncCurrentPage').on('value', callback)
    onSyncValue(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);

        // Immediately call with current value
        if (this.syncState && this.syncState[key] !== undefined) {
            callback(this.syncState[key]);
        }
    }
}
3.2 Optimistic Updates with Rollback
Current Firebase Pattern (Section 9.1):


product.soldQty++;
updateProductCardUI(product);
await database.ref(`products/${key}`).update({ soldQty: product.soldQty });
// No rollback on failure
New Pattern with Rollback:


// ============= CLIENT SIDE =============
class ProductManager {
    constructor(wsManager) {
        this.ws = wsManager;
        this.pendingUpdates = new Map(); // Track optimistic updates
    }

    async updateProductQty(productId, change) {
        const product = this.products[`product_${productId}`];
        const originalQty = product.soldQty;
        const newQty = Math.max(0, Math.min(product.QtyAvailable, originalQty + change));

        if (newQty === originalQty) return;

        // Generate unique request ID
        const requestId = `${productId}_${Date.now()}`;

        // 1. Optimistic update
        product.soldQty = newQty;
        product.remainingQty = product.QtyAvailable - newQty;
        this.updateProductCardUI(product);

        // 2. Track pending update for potential rollback
        this.pendingUpdates.set(requestId, {
            productId,
            originalQty,
            newQty,
            timestamp: Date.now()
        });

        // 3. Send to server
        this.ws.send(JSON.stringify({
            type: 'product:updateQty',
            requestId: requestId,
            productId: productId,
            change: change,
            expectedNewQty: newQty
        }));

        // 4. Set timeout for rollback if no confirmation
        setTimeout(() => {
            if (this.pendingUpdates.has(requestId)) {
                console.warn('Update timeout, rolling back:', requestId);
                this.rollbackUpdate(requestId);
            }
        }, 5000); // 5 second timeout
    }

    rollbackUpdate(requestId) {
        const pending = this.pendingUpdates.get(requestId);
        if (!pending) return;

        const product = this.products[`product_${pending.productId}`];
        product.soldQty = pending.originalQty;
        product.remainingQty = product.QtyAvailable - pending.originalQty;
        this.updateProductCardUI(product);

        this.pendingUpdates.delete(requestId);

        // Show user notification
        this.showNotification('Cập nhật thất bại, đã khôi phục', 'error');
    }

    handleServerConfirmation(msg) {
        if (msg.type === 'product:updateQty:ack') {
            // Success - remove from pending
            this.pendingUpdates.delete(msg.requestId);
        }

        if (msg.type === 'product:updateQty:error') {
            // Server rejected - rollback
            this.rollbackUpdate(msg.requestId);
        }
    }
}

// ============= SERVER SIDE =============
async function handleProductQtyUpdate(ws, msg, db) {
    const { requestId, productId, change, expectedNewQty } = msg;

    try {
        // Use database transaction for atomicity
        await db.transaction(async (trx) => {
            // Lock the row for update
            const product = await trx('products')
                .where('product_id', productId)
                .forUpdate()
                .first();

            if (!product) {
                throw new Error('Product not found');
            }

            const newQty = Math.max(0, Math.min(
                product.qty_available,
                product.sold_qty + change
            ));

            // Validate expected qty matches (detect race conditions)
            if (newQty !== expectedNewQty) {
                throw new Error('Conflict detected');
            }

            // Update database
            await trx('products')
                .where('product_id', productId)
                .update({
                    sold_qty: newQty,
                    last_refreshed: new Date()
                });

            // Log sale transaction
            await trx('sales_logs').insert({
                product_id: productId,
                product_name: product.name,
                change_qty: change,
                source: msg.source || 'unknown',
                staff_name: msg.staffName,
                staff_username: msg.staffUsername
            });
        });

        // Send confirmation
        ws.send(JSON.stringify({
            type: 'product:updateQty:ack',
            requestId: requestId
        }));

        // Broadcast change to all clients
        broadcastProductChange(productId);

    } catch (error) {
        // Send error
        ws.send(JSON.stringify({
            type: 'product:updateQty:error',
            requestId: requestId,
            error: error.message
        }));
    }
}
3.3 Conflict Resolution (Race Conditions)
Scenario: Two admins click "+1" on same product at same time.

Firebase Behavior: Last-write-wins (both see final result via listener)

New Implementation: Server-side locking + Version control


// ============= SERVER SIDE =============
// Using PostgreSQL row-level locking

async function atomicQtyUpdate(db, productId, change, expectedVersion) {
    return await db.transaction(async (trx) => {
        // SELECT FOR UPDATE locks the row
        const product = await trx('products')
            .where('product_id', productId)
            .forUpdate()
            .first();

        // Version check (optional - for stricter conflict detection)
        if (expectedVersion && product.version !== expectedVersion) {
            throw new ConflictError('Product was modified by another user');
        }

        const newQty = product.sold_qty + change;

        // Boundary validation
        if (newQty < 0 || newQty > product.qty_available) {
            throw new ValidationError('Invalid quantity');
        }

        // Update with version increment
        await trx('products')
            .where('product_id', productId)
            .update({
                sold_qty: newQty,
                version: product.version + 1,
                last_refreshed: new Date()
            });

        return { ...product, sold_qty: newQty, version: product.version + 1 };
    });
}
Alternative: Redis-based Distributed Lock


import Redlock from 'redlock';

const redlock = new Redlock([redis], {
    retryCount: 3,
    retryDelay: 100
});

async function updateWithLock(productId, change) {
    const lockKey = `lock:product:${productId}`;

    // Acquire lock (1 second TTL)
    const lock = await redlock.acquire([lockKey], 1000);

    try {
        // Perform update
        const result = await updateProductQty(productId, change);
        return result;
    } finally {
        // Release lock
        await lock.release();
    }
}
3.4 Replicating Firebase Child Events

// ============= SERVER SIDE =============
// server/product-broadcaster.js

class ProductBroadcaster {
    constructor(wss, redisPub) {
        this.wss = wss;
        this.redisPub = redisPub;
        this.subscribedClients = new Map(); // path -> Set of WebSocket clients
    }

    // Called after any product mutation
    async broadcastChange(type, productId, productData) {
        const message = JSON.stringify({
            type: `product:${type}`, // 'child_added', 'child_changed', 'child_removed'
            key: `product_${productId}`,
            data: productData,
            timestamp: Date.now()
        });

        // Broadcast via Redis Pub/Sub (for multi-instance support)
        this.redisPub.publish('channel:products', message);

        // Also direct broadcast to local WebSocket clients
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    async onProductAdded(productId, productData) {
        await this.broadcastChange('child_added', productId, productData);
    }

    async onProductChanged(productId, productData) {
        await this.broadcastChange('child_changed', productId, productData);
    }

    async onProductRemoved(productId, productData) {
        await this.broadcastChange('child_removed', productId, productData);
    }
}

// ============= CLIENT SIDE =============
// Replaces setupFirebaseChildListeners()

function setupWebSocketListeners(ws, localProductsObject, callbacks) {
    let initialLoadComplete = false;

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        // Initial load (replaces once('value'))
        if (msg.type === 'products:init') {
            Object.assign(localProductsObject, msg.data);
            initialLoadComplete = true;
            callbacks.onInitialLoadComplete?.();
            return;
        }

        // Child added (replaces on('child_added'))
        if (msg.type === 'product:child_added') {
            if (!localProductsObject[msg.key]) {
                localProductsObject[msg.key] = msg.data;
                callbacks.onProductAdded?.(msg.data);
            }
        }

        // Child changed (replaces on('child_changed'))
        if (msg.type === 'product:child_changed') {
            localProductsObject[msg.key] = msg.data;
            callbacks.onProductChanged?.(msg.data, msg.key);
        }

        // Child removed (replaces on('child_removed'))
        if (msg.type === 'product:child_removed') {
            const removed = localProductsObject[msg.key];
            delete localProductsObject[msg.key];
            callbacks.onProductRemoved?.(removed, msg.key);
        }
    };

    // Request initial data
    ws.send(JSON.stringify({ type: 'products:subscribe' }));

    // Return cleanup function (replaces off())
    return {
        detach: () => {
            ws.send(JSON.stringify({ type: 'products:unsubscribe' }));
        }
    };
}
4. Frontend Refactoring Plan
4.1 Firebase to WebSocket Method Mapping
Firebase Method	WebSocket Event	Direction
database.ref('path').set(value)	{ type: 'set', path, value }	Client → Server
database.ref('path').update(obj)	{ type: 'update', path, value }	Client → Server
database.ref('path').remove()	{ type: 'remove', path }	Client → Server
database.ref('path').push()	{ type: 'push', path, value }	Client → Server
database.ref('path').once('value')	{ type: 'get', path } + Response	Request-Response
database.ref('path').on('value')	{ type: 'subscribe', path }	Subscribe pattern
database.ref('path').on('child_added')	product:child_added event	Server → Client
database.ref('path').on('child_changed')	product:child_changed event	Server → Client
database.ref('path').on('child_removed')	product:child_removed event	Server → Client
database.ref('path').off()	{ type: 'unsubscribe', path }	Client → Server
database.ref('path').transaction()	HTTP POST /api/transaction	REST fallback
4.2 New Client SDK Structure

soluong-live/
├── js/
│   ├── main.js                 # Keep, refactor imports
│   ├── firebase-helpers.js     # DELETE - Replace entirely
│   └── ws-client/              # NEW FOLDER
│       ├── index.js            # Main export
│       ├── WebSocketManager.js # Connection management
│       ├── ProductManager.js   # Product CRUD
│       ├── SyncManager.js      # Sync state
│       ├── SalesLogManager.js  # Sales logging
│       └── SnapshotManager.js  # Cart snapshots
4.3 WebSocketManager.js (Core)

// js/ws-client/WebSocketManager.js

export class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.messageQueue = [];
        this.pendingRequests = new Map();
        this.eventHandlers = new Map();
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.flushMessageQueue();
                resolve();
            };

            this.ws.onclose = (event) => {
                console.log('🔌 WebSocket disconnected', event.code);
                this.isConnected = false;
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('🔌 WebSocket error:', error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => this.connect(), delay);
    }

    send(message) {
        const msgString = JSON.stringify(message);

        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(msgString);
        } else {
            // Queue for later
            this.messageQueue.push(msgString);
        }
    }

    // Request-Response pattern (replaces once('value'))
    request(type, data, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const requestId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, timeout);

            this.pendingRequests.set(requestId, { resolve, reject, timer });

            this.send({ type, requestId, ...data });
        });
    }

    handleMessage(msg) {
        // Handle request-response
        if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
            const { resolve, reject, timer } = this.pendingRequests.get(msg.requestId);
            clearTimeout(timer);
            this.pendingRequests.delete(msg.requestId);

            if (msg.error) {
                reject(new Error(msg.error));
            } else {
                resolve(msg.data);
            }
            return;
        }

        // Handle events
        const handlers = this.eventHandlers.get(msg.type) || [];
        handlers.forEach(handler => handler(msg));
    }

    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) handlers.splice(index, 1);
        }
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            this.ws.send(this.messageQueue.shift());
        }
    }
}
4.4 Migration Strategy
Phase 1: Parallel Operation (1 week)

Deploy WebSocket server alongside Firebase
Frontend writes to BOTH Firebase and WebSocket
Frontend reads from Firebase (primary)
Monitor WebSocket for correctness
Phase 2: Switch Primary (1 week)

Frontend reads from WebSocket (primary)
Frontend still writes to both
Monitor for issues
Phase 3: Firebase Removal (1 week)

Stop Firebase writes
Remove Firebase SDK
Clean up Firebase database
4.5 Replacing firebase-helpers.js Functions
Original Function	New Implementation
addProductToFirebase()	ProductManager.addProduct()
addProductsToFirebase()	ProductManager.addProducts()
removeProductFromFirebase()	ProductManager.removeProduct()
updateProductQtyInFirebase()	ProductManager.updateQty()
updateProductVisibility()	ProductManager.setVisibility()
loadAllProductsFromFirebase()	ProductManager.loadAll()
setupFirebaseChildListeners()	ProductManager.subscribe()
saveCartSnapshot()	SnapshotManager.save()
restoreProductsFromSnapshot()	SnapshotManager.restore()
logSaleTransaction()	Automatic in updateQty()
5. Render.com Deployment Configuration
5.1 render.yaml (Blueprint)

services:
  # Main Web Service
  - type: web
    name: soluong-live-api
    env: node
    plan: starter  # $7/month - upgrade to standard for production
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: soluong-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: soluong-redis
          type: redis
          property: connectionString
    healthCheckPath: /health

  # Redis for Pub/Sub and Caching
  - type: redis
    name: soluong-redis
    plan: starter  # $10/month
    maxmemoryPolicy: allkeys-lru

databases:
  # PostgreSQL Database
  - name: soluong-db
    plan: starter  # $7/month
    postgresMajorVersion: 15
5.2 Server Entry Point

// server/index.js
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { Pool } from 'pg';
import Redis from 'ioredis';

const fastify = Fastify({ logger: true });

// Database connection
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Redis connections
const redis = new Redis(process.env.REDIS_URL);
const redisPub = new Redis(process.env.REDIS_URL);
const redisSub = new Redis(process.env.REDIS_URL);

// Register WebSocket
await fastify.register(fastifyWebsocket);

// WebSocket route
fastify.get('/ws', { websocket: true }, (connection, req) => {
    // ... WebSocket handlers
});

// Health check
fastify.get('/health', async () => ({ status: 'ok' }));

// Start server
const start = async () => {
    try {
        await fastify.listen({
            port: process.env.PORT || 3000,
            host: '0.0.0.0'
        });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
6. Cost Comparison
Service	Firebase (Current)	Render (Proposed)
Realtime Database	Pay-per-use (~$5-20/mo)	N/A
Hosting	Free (static)	$7/mo (Web Service)
PostgreSQL	N/A	$7/mo
Redis	N/A	$10/mo
Authentication	Free tier	Keep Firebase Auth OR implement JWT
Storage	Pay-per-use	Keep Firebase Storage OR S3
Total	~$5-25/mo	~$24/mo
Trade-offs:

Render is slightly more expensive
But: Full control, no vendor lock-in, predictable pricing
Better for: Data privacy requirements, custom business logic
7. Implementation Timeline
Week	Phase	Tasks
1	Setup	Create Render services, PostgreSQL schema, basic WebSocket server
2	Core API	Implement product CRUD, sync logic, error handling
3	Frontend	Create ws-client SDK, parallel Firebase/WS mode
4	Testing	Integration testing, performance testing, bug fixes
5	Migration	Switch primary to WebSocket, monitor
6	Cleanup	Remove Firebase, documentation
8. Verification Checklist
After implementation, verify:

 WebSocket latency < 200ms for product updates
 Sync mode works between Admin and Display
 Optimistic updates with proper rollback on failure
 No data loss during reconnection
 Sales logs correctly recorded
 Cart snapshots save/restore correctly
 Performance under 50+ concurrent users
 Graceful degradation when server restarts
Blueprint Version: 1.0
Target Platform: Render.com
Estimated Implementation: 6 weeks

