/**
 * Firebase Statistics Dashboard
 * Thống kê toàn bộ dữ liệu Firebase sử dụng trong dự án
 */

// =====================================================
// FIREBASE CONFIG - use shared config (loaded via shared/js/firebase-config.js)
// =====================================================

// Initialize Firebase (shared config auto-initializes)
let db, rtdb;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
    rtdb = firebase.database();
    console.log('[Firebase Stats] Firebase initialized');
} catch (error) {
    console.error('[Firebase Stats] Firebase init error:', error);
}

// =====================================================
// DATA DEFINITIONS
// =====================================================

const FIRESTORE_COLLECTIONS = [
    {
        name: 'users',
        description: 'Thông tin người dùng, permissions, roleTemplate',
        modules: ['login', 'user-management', 'navigation'],
        countable: true
    },
    {
        name: 'dathang',
        description: 'Dữ liệu đặt hàng chính',
        modules: ['bangkiemhang'],
        countable: true
    },
    {
        name: 'edit_history',
        description: 'Lịch sử chỉnh sửa của tất cả modules',
        modules: ['all modules'],
        countable: true
    },
    {
        name: 'livestream_reports',
        description: 'Báo cáo livestream và orders',
        modules: ['orders-report', 'livestream', 'tpos-pancake'],
        countable: true
    },
    {
        name: 'customers',
        description: 'Thông tin khách hàng',
        modules: ['balance-history', 'customer-hub'],
        countable: true
    },
    {
        name: 'hangrotxa',
        description: 'Quản lý hàng rớt xa',
        modules: ['hangrotxa'],
        countable: true
    },
    {
        name: 'ib',
        description: 'Quản lý inbox/messages',
        modules: ['ib'],
        countable: true
    },
    {
        name: 'tokens',
        description: 'Lưu trữ API tokens (TPOS)',
        modules: ['orders-report', 'tpos-pancake'],
        countable: true
    },
    {
        name: 'pancake_tokens',
        description: 'Lưu trữ Pancake JWT tokens',
        modules: ['orders-report', 'tpos-pancake'],
        countable: true
    },
    {
        name: 'settings',
        description: 'Cài đặt chung (table_name, etc.)',
        modules: ['orders-report'],
        countable: true
    },
    {
        name: 'nhanhang',
        description: 'Quản lý nhận hàng',
        modules: ['nhanhang'],
        countable: true
    },
    {
        name: 'report_order_details',
        description: 'Chi tiết báo cáo orders (cache)',
        modules: ['orders-report'],
        countable: true
    },
    {
        name: 'app_config',
        description: 'Cấu hình ứng dụng, version',
        modules: ['navigation-modern'],
        countable: true
    },
    {
        name: 'order-logs',
        description: 'Logs đơn hàng',
        modules: ['soorder'],
        countable: true
    },
    {
        name: 'ncc-names',
        description: 'Tên nhà cung cấp',
        modules: ['soorder'],
        countable: true
    },
    {
        name: 'employeeRanges',
        description: 'Phân chia dãy nhân viên theo campaign',
        modules: ['orders-report'],
        countable: true
    }
];

const REALTIME_NODES = [
    // Active - Order Management
    { name: 'cartHistory', description: 'Lịch sử giỏ hàng snapshots', status: 'active' },
    { name: 'cartHistoryMeta', description: 'Metadata của cartHistory', status: 'active' },
    { name: 'orderProducts', description: 'Sản phẩm trong đơn hàng', status: 'active' },
    { name: 'orderProductsMeta', description: 'Metadata của orderProducts', status: 'active' },
    { name: 'orderDisplaySettings', description: 'Cài đặt hiển thị orders', status: 'active' },
    { name: 'orderIsMergeVariants', description: 'Cài đặt gộp variants', status: 'active' },
    { name: 'orderSyncCurrentPage', description: 'Sync trang hiện tại', status: 'active' },
    { name: 'orderSyncSearchData', description: 'Sync dữ liệu tìm kiếm', status: 'active' },
    { name: 'hiddenProductsDisplaySettings', description: 'Cài đặt hiển thị sản phẩm ẩn', status: 'active' },
    { name: 'bulkTagHistory', description: 'Lịch sử gắn tag hàng loạt', status: 'active' },
    { name: 'bulkTagDeleteHistory', description: 'Lịch sử xóa tag hàng loạt', status: 'active' },
    { name: 'syncSearchKeyword', description: 'Sync từ khóa tìm kiếm', status: 'active' },
    { name: 'order_products', description: 'Sản phẩm cho chat/message', status: 'active' },

    // Active - Soluong Live
    { name: 'soluongProducts', description: 'Sản phẩm inventory', status: 'active' },
    { name: 'soluongProductsMeta', description: 'Metadata inventory', status: 'active' },
    { name: 'soluongDisplaySettings', description: 'Cài đặt hiển thị inventory', status: 'active' },
    { name: 'soluongIsMergeVariants', description: 'Gộp variants inventory', status: 'active' },
    { name: 'soluongSyncCurrentPage', description: 'Sync trang inventory', status: 'active' },
    { name: 'soluongSyncSearchData', description: 'Sync search inventory', status: 'active' },
    { name: 'soluongCartHistory', description: 'Lịch sử cart inventory', status: 'active' },
    { name: 'soluongCartHistoryMeta', description: 'Metadata cart inventory', status: 'active' },

    // Active - Core Features
    { name: 'tag_updates', description: 'Sync tags giữa users (multi-user)', status: 'migration' },
    { name: 'dropped_products', description: 'Sản phẩm bị drop', status: 'migration' },
    { name: 'dropped_products_history', description: 'Lịch sử sản phẩm drop', status: 'migration' },
    { name: 'kpi_base', description: 'Dữ liệu KPI thống kê', status: 'migration' },
    { name: 'issue_tracking', description: 'Theo dõi issues', status: 'active' },
    { name: 'liveOrderTracking', description: 'Theo dõi orders realtime', status: 'active' },
    { name: 'pancake_jwt_token', description: 'JWT token Pancake (single)', status: 'active' },
    { name: 'pancake_jwt_tokens', description: 'JWT tokens Pancake (multi)', status: 'active' },
    { name: 'pancake_images', description: 'Cache hình ảnh Pancake', status: 'active' },
    { name: 'productAssignments', description: 'Phân công sản phẩm', status: 'active' },
    { name: 'productAssignments_v2_history', description: 'Lịch sử phân công v2', status: 'active' },
    { name: 'settings', description: 'Cài đặt chung (employee ranges)', status: 'active' },
    { name: 'report_order_details', description: 'Cache chi tiết báo cáo', status: 'active' },

    // Verify before delete
    { name: 'user_campaigns', description: 'Campaigns của user', status: 'verify' },
    { name: 'user_preferences', description: 'Preferences của user', status: 'verify' },
    { name: 'soluongSalesLog', description: 'Log bán hàng inventory', status: 'verify' },

    // Can be deleted
    { name: 'adminCurrentPage', description: 'Không còn sử dụng', status: 'deletable' },
    { name: 'app_version', description: 'Không còn sử dụng', status: 'deletable' },
    { name: 'isHideEditControls', description: 'Không còn sử dụng', status: 'deletable' },
    { name: 'uploadSessionFinalize', description: 'Không còn sử dụng', status: 'deletable' }
];

// Store document counts
const documentCounts = {
    firestore: {},
    realtime: {}
};

// =====================================================
// DOM ELEMENTS
// =====================================================

const elements = {
    mainContainer: document.getElementById('mainContainer'),
    accessDenied: document.getElementById('accessDenied'),
    firestoreCount: document.getElementById('firestoreCount'),
    realtimeCount: document.getElementById('realtimeCount'),
    firestoreTable: document.getElementById('firestoreTable'),
    realtimeTable: document.getElementById('realtimeTable'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnCountFirestore: document.getElementById('btnCountFirestore'),
    btnCountRealtime: document.getElementById('btnCountRealtime'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    filterBtns: document.querySelectorAll('.filter-btn')
};

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!checkAuth()) {
        elements.accessDenied.style.display = 'flex';
        elements.mainContainer.style.display = 'none';
        lucide.createIcons();
        return;
    }

    // Show main container
    elements.mainContainer.style.display = 'flex';
    elements.accessDenied.style.display = 'none';

    // Initialize
    initTabs();
    initFilters();
    renderData();
    setupEventListeners();

    // Initialize Lucide icons
    lucide.createIcons();

    console.log('[Firebase Stats] Initialized');
});

// =====================================================
// AUTHENTICATION
// =====================================================

function checkAuth() {
    try {
        let authData = sessionStorage.getItem('loginindex_auth');
        if (!authData) {
            authData = localStorage.getItem('loginindex_auth');
        }

        if (!authData) return false;

        const auth = JSON.parse(authData);
        return auth.isLoggedIn === 'true' || auth.isLoggedIn === true;
    } catch (error) {
        console.error('[Firebase Stats] Auth check error:', error);
        return false;
    }
}

// =====================================================
// TABS
// =====================================================

function initTabs() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Update active tab
            elements.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active content
            elements.tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${tabId}`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// =====================================================
// FILTERS
// =====================================================

function initFilters() {
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            // Update active filter
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter table
            filterRealtimeTable(filter);
        });
    });
}

function filterRealtimeTable(filter) {
    const rows = elements.realtimeTable.querySelectorAll('tr');

    rows.forEach(row => {
        const status = row.dataset.status;

        if (filter === 'all') {
            row.style.display = '';
        } else if (filter === status) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// =====================================================
// RENDER DATA
// =====================================================

function renderData() {
    renderFirestoreTable();
    renderRealtimeTable();
    updateCounts();
}

function renderFirestoreTable() {
    const tbody = elements.firestoreTable;
    tbody.innerHTML = '';

    FIRESTORE_COLLECTIONS.forEach(collection => {
        const count = documentCounts.firestore[collection.name];
        const countDisplay = count !== undefined
            ? `<span class="doc-count">${count.toLocaleString()}</span>`
            : `<span class="doc-count loading">--</span>`;

        const row = document.createElement('tr');
        row.dataset.collection = collection.name;
        row.innerHTML = `
            <td><code>${collection.name}</code></td>
            <td>${countDisplay}</td>
            <td>${collection.description}</td>
            <td>${collection.modules.join(', ')}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderRealtimeTable() {
    const tbody = elements.realtimeTable;
    tbody.innerHTML = '';

    REALTIME_NODES.forEach(node => {
        const count = documentCounts.realtime[node.name];
        const countDisplay = count !== undefined
            ? `<span class="doc-count">${count.toLocaleString()}</span>`
            : `<span class="doc-count loading">--</span>`;

        const row = document.createElement('tr');
        row.dataset.status = node.status;
        row.dataset.node = node.name;
        row.innerHTML = `
            <td><code>${node.name}</code></td>
            <td>${countDisplay}</td>
            <td>${node.description}</td>
            <td><span class="status ${node.status}">${getStatusLabel(node.status)}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function getStatusLabel(status) {
    const labels = {
        active: 'Đang dùng',
        deletable: 'Có thể xóa',
        migration: 'Cần migrate',
        verify: 'Cần kiểm tra'
    };
    return labels[status] || status;
}

function updateCounts() {
    elements.firestoreCount.textContent = FIRESTORE_COLLECTIONS.length;
    elements.realtimeCount.textContent = REALTIME_NODES.length;
}

// =====================================================
// COUNT DOCUMENTS - FIRESTORE
// =====================================================

async function countFirestoreDocuments() {
    const btn = elements.btnCountFirestore;
    btn.classList.add('loading');
    btn.disabled = true;

    console.log('[Firebase Stats] Counting Firestore documents...');

    let totalDocs = 0;

    for (const collection of FIRESTORE_COLLECTIONS) {
        if (!collection.countable) continue;

        try {
            // Update UI to show loading
            updateFirestoreCount(collection.name, 'loading');

            // Count documents (limit to avoid excessive reads for large collections)
            const snapshot = await db.collection(collection.name).limit(10000).get();
            const count = snapshot.size;

            documentCounts.firestore[collection.name] = count;
            totalDocs += count;

            // Update UI
            updateFirestoreCount(collection.name, count);

            console.log(`[Firebase Stats] ${collection.name}: ${count} docs`);
        } catch (error) {
            console.error(`[Firebase Stats] Error counting ${collection.name}:`, error);
            updateFirestoreCount(collection.name, 'error');
        }
    }

    btn.classList.remove('loading');
    btn.disabled = false;

    console.log(`[Firebase Stats] Total Firestore documents: ${totalDocs}`);
    return totalDocs;
}

function updateFirestoreCount(collectionName, count) {
    const row = elements.firestoreTable.querySelector(`tr[data-collection="${collectionName}"]`);
    if (!row) return;

    const countCell = row.querySelector('.doc-count');
    if (!countCell) return;

    if (count === 'loading') {
        countCell.textContent = '...';
        countCell.className = 'doc-count loading';
    } else if (count === 'error') {
        countCell.textContent = 'Error';
        countCell.className = 'doc-count error';
    } else {
        countCell.textContent = count.toLocaleString();
        countCell.className = 'doc-count';
    }
}

// =====================================================
// COUNT RECORDS - REALTIME DATABASE
// =====================================================

async function countRealtimeRecords() {
    const btn = elements.btnCountRealtime;
    btn.classList.add('loading');
    btn.disabled = true;

    console.log('[Firebase Stats] Counting Realtime DB records...');

    let totalRecords = 0;

    for (const node of REALTIME_NODES) {
        try {
            // Update UI to show loading
            updateRealtimeCount(node.name, 'loading');

            // Get shallow count (only keys, not full data)
            const snapshot = await rtdb.ref(node.name).once('value');

            let count = 0;
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (typeof data === 'object' && data !== null) {
                    count = Object.keys(data).length;
                } else {
                    count = 1; // Single value
                }
            }

            documentCounts.realtime[node.name] = count;
            totalRecords += count;

            // Update UI
            updateRealtimeCount(node.name, count);

            console.log(`[Firebase Stats] ${node.name}: ${count} records`);
        } catch (error) {
            console.error(`[Firebase Stats] Error counting ${node.name}:`, error);
            updateRealtimeCount(node.name, 'error');
        }
    }

    btn.classList.remove('loading');
    btn.disabled = false;

    console.log(`[Firebase Stats] Total Realtime DB records: ${totalRecords}`);
    return totalRecords;
}

function updateRealtimeCount(nodeName, count) {
    const row = elements.realtimeTable.querySelector(`tr[data-node="${nodeName}"]`);
    if (!row) return;

    const countCell = row.querySelector('.doc-count');
    if (!countCell) return;

    if (count === 'loading') {
        countCell.textContent = '...';
        countCell.className = 'doc-count loading';
    } else if (count === 'error') {
        countCell.textContent = 'Error';
        countCell.className = 'doc-count error';
    } else {
        countCell.textContent = count.toLocaleString();
        countCell.className = 'doc-count';
    }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Refresh button
    if (elements.btnRefresh) {
        elements.btnRefresh.addEventListener('click', () => {
            // Clear counts
            documentCounts.firestore = {};
            documentCounts.realtime = {};

            renderData();
            lucide.createIcons();

            // Visual feedback
            elements.btnRefresh.classList.add('loading');
            setTimeout(() => {
                elements.btnRefresh.classList.remove('loading');
            }, 500);
        });
    }

    // Count Firestore button
    if (elements.btnCountFirestore) {
        elements.btnCountFirestore.addEventListener('click', () => {
            countFirestoreDocuments();
        });
    }

    // Count Realtime button
    if (elements.btnCountRealtime) {
        elements.btnCountRealtime.addEventListener('click', () => {
            countRealtimeRecords();
        });
    }
}

// =====================================================
// EXPORTS (for debugging)
// =====================================================

window.FirebaseStats = {
    FIRESTORE_COLLECTIONS,
    REALTIME_NODES,
    documentCounts,
    renderData,
    filterRealtimeTable,
    countFirestoreDocuments,
    countRealtimeRecords
};

console.log('[Firebase Stats] Module loaded');
