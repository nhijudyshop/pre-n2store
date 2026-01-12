// =====================================================
// FIREBASE CONFIGURATION
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const historyCollectionRef = db.collection("edit_history");

// =====================================================
// GLOBAL VARIABLES
// =====================================================
let allHistoryData = [];
let filteredData = [];
const notify = new NotificationManager();

// =====================================================
// AUTH CHECK - Admin has FULL BYPASS
// =====================================================
const auth = authManager ? authManager.getAuthState() : null;

if (!auth || auth.isLoggedIn !== "true") {
    notify.error("Vui lòng đăng nhập để tiếp tục!");
    setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "../index.html";
    }, 1500);
}

// ALL users (including Admin) check detailedPermissions - NO bypass
const hasPageAccess = auth?.detailedPermissions?.['lichsuchinhsua'] &&
    Object.values(auth.detailedPermissions['lichsuchinhsua']).some(v => v === true);

if (!hasPageAccess) {
    notify.error("Bạn không có quyền truy cập trang này!");
    setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "../index.html";
    }, 1500);
}

// =====================================================
// DOM ELEMENTS
// =====================================================
const tbody = document.getElementById("historyTableBody");
const userFilter = document.getElementById("userFilter");
const pageFilter = document.getElementById("pageFilter");
const actionFilter = document.getElementById("actionFilter");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const filterInfo = document.getElementById("filterInfo");
const filteredCount = document.getElementById("filteredCount");
const emptyState = document.getElementById("emptyState");
const detailModal = document.getElementById("detailModal");
const modalDetailContent = document.getElementById("modalDetailContent");

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function getActionText(action) {
    const actionMap = {
        add: "Thêm",
        edit: "Sửa",
        delete: "Xóa",
        update: "Cập nhật",
        mark: "Đánh dấu",
        unmark: "Bỏ đánh dấu",
        check: "Đánh dấu",
        uncheck: "Bỏ đánh dấu",
        toggle: "Chuyển đổi",
        flag: "Gắn cờ",
        unflag: "Bỏ cờ",
    };
    return actionMap[action.toLowerCase()] || action;
}

function isMarkAction(action) {
    const markActions = [
        "mark",
        "unmark",
        "check",
        "uncheck",
        "toggle",
        "flag",
        "unflag",
    ];
    return markActions.includes(action.toLowerCase());
}

function formatTimestamp(timestamp) {
    // Handle both Firestore Timestamp and Date objects
    if (timestamp && typeof timestamp.toDate === "function") {
        return timestamp.toDate().toLocaleString("vi-VN");
    } else if (timestamp instanceof Date) {
        return timestamp.toLocaleString("vi-VN");
    } else if (timestamp && timestamp.seconds) {
        // Firestore Timestamp object with seconds
        return new Date(timestamp.seconds * 1000).toLocaleString("vi-VN");
    }
    return "N/A";
}

// =====================================================
// DATA LOADING
// =====================================================

async function loadHistoryData() {
    const loadingId = notify.loadingData("Đang tải lịch sử...");

    try {
        const snapshot = await historyCollectionRef
            .orderBy("timestamp", "desc")
            .get();

        allHistoryData = [];
        const users = new Set();
        const pages = new Set();
        let todayCount = 0;
        let currentUserCount = 0;
        const today = new Date().toDateString();
        const currentUser = userType ? userType.split("-")[0] : "";

        snapshot.forEach((doc) => {
            const data = doc.data();
            data.docId = doc.id;
            allHistoryData.push(data);
            users.add(data.user);

            // Add page to set for filter
            if (data.page) {
                pages.add(data.page);
            }

            // Convert timestamp to Date object
            let dateObj;
            if (data.timestamp && typeof data.timestamp.toDate === "function") {
                dateObj = data.timestamp.toDate();
            } else if (data.timestamp instanceof Date) {
                dateObj = data.timestamp;
            } else if (data.timestamp && data.timestamp.seconds) {
                dateObj = new Date(data.timestamp.seconds * 1000);
            } else {
                dateObj = new Date();
            }

            if (dateObj.toDateString() === today) {
                todayCount++;
            }

            if (data.user === currentUser) {
                currentUserCount++;
            }
        });

        // Update stats
        document.getElementById("totalLogs").textContent =
            allHistoryData.length;
        document.getElementById("todayLogs").textContent = todayCount;
        document.getElementById("activeUsers").textContent = users.size;
        document.getElementById("currentUserLogs").textContent =
            currentUserCount;

        // Update user filter
        updateUserFilter(users);

        // Update page filter
        updatePageFilter(pages);

        // Display data
        displayFilteredData(allHistoryData);

        notify.remove(loadingId);
        notify.success("Tải dữ liệu thành công!");
    } catch (error) {
        console.error("Error loading history:", error);
        notify.remove(loadingId);
        notify.error("Lỗi khi tải dữ liệu!");
    }
}

function updateUserFilter(users) {
    userFilter.innerHTML = '<option value="all">Tất cả</option>';
    users.forEach((user) => {
        const option = document.createElement("option");
        option.value = user;
        option.textContent = user;
        userFilter.appendChild(option);
    });
}

function updatePageFilter(pages) {
    pageFilter.innerHTML = '<option value="all">Tất cả</option>';

    // Sort pages alphabetically
    const sortedPages = Array.from(pages).sort();

    sortedPages.forEach((page) => {
        const option = document.createElement("option");
        option.value = page;
        option.textContent = page;
        pageFilter.appendChild(option);
    });
}

// =====================================================
// DATA DISPLAY
// =====================================================

function displayFilteredData(data) {
    tbody.innerHTML = "";
    filteredData = data;

    if (data.length === 0) {
        emptyState.classList.add("show");
        filterInfo.classList.remove("active");
        return;
    }

    emptyState.classList.remove("show");

    data.forEach((item, index) => {
        addRowToTable(item, index + 1);
    });

    // Update filter info
    if (data.length !== allHistoryData.length) {
        filterInfo.classList.add("active");
        filteredCount.textContent = data.length;
    } else {
        filterInfo.classList.remove("active");
    }

    // Initialize Lucide icons for new elements
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function addRowToTable(data, stt) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-doc-id", data.docId);

    tr.innerHTML = `
        <td data-label="STT">${stt}</td>
        <td data-label="Thời gian">${formatTimestamp(data.timestamp)}</td>
        <td data-label="Người dùng">${data.user}</td>
        <td data-label="Trang"><span class="page-badge">${data.page || "Không xác định"}</span></td>
        <td data-label="Hành động"><span class="action-badge action-${data.action}">${getActionText(data.action)}</span></td>
        <td data-label="Mô tả">${data.description}</td>
        <td data-label="Dữ liệu cũ">${renderDataCell(data.oldData, data.action, "old", data.oldData, data.newData)}</td>
        <td data-label="Dữ liệu mới">${renderDataCell(data.newData, data.action, "new", data.oldData, data.newData)}</td>
    `;

    tr.addEventListener("click", () => showDetailModal(data));
    tbody.appendChild(tr);
}

function renderDataCell(data, action, cellType, oldData, newData) {
    if (isMarkAction(action)) {
        return '<span style="color:#6c757d; font-style:italic; font-size:11px;">-</span>';
    }

    if (action === "delete") {
        if (cellType === "old") {
            return '<span style="color:#6c757d; font-style:italic; font-size:11px;">-</span>';
        } else {
            return `<span class="deleted-indicator" style="font-size:11px; padding:4px 8px;">Đã Xóa</span>`;
        }
    } else if (action === "edit" || action === "update") {
        return renderChangedFields(oldData, newData, cellType);
    } else if (action === "add") {
        if (cellType === "old") {
            return '<span style="color:#6c757d; font-style:italic; font-size:11px;">-</span>';
        } else {
            return `<span class="added-indicator" style="font-size:11px; padding:4px 8px;">Tạo Mới</span>`;
        }
    }

    return renderCompactSummary(data);
}

function renderChangedFields(oldData, newData, cellType) {
    if (!oldData || !newData) return "-";

    const changedFields = {};
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    allKeys.forEach((key) => {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
            changedFields[key] =
                cellType === "old" ? oldData[key] : newData[key];
        }
    });

    if (Object.keys(changedFields).length === 0) {
        return '<span style="color:#6c757d; font-style:italic; font-size:11px;">-</span>';
    }

    return renderCompactChangedFields(changedFields, cellType);
}

function renderCompactChangedFields(changedFields, cellType) {
    const keys = Object.keys(changedFields);
    if (keys.length === 0) return "-";

    let html = '<div style="font-size:11px;">';
    let fieldsShown = 0;
    const maxFields = 2;

    keys.forEach((key) => {
        if (fieldsShown >= maxFields) return;

        let value = changedFields[key];
        let displayValue = "";

        if (value === null || value === undefined) {
            displayValue = cellType === "old" ? "Có giá trị" : "Đã xóa";
        } else if (typeof value === "string") {
            displayValue =
                value.length > 20 ? value.substring(0, 20) + "..." : value;
        } else if (typeof value === "object") {
            displayValue = JSON.stringify(value).substring(0, 20) + "...";
        } else {
            displayValue = String(value);
        }

        const className =
            cellType === "old" ? "change-removed" : "change-added";
        html += `<div class="${className}" style="margin:1px 0; padding:2px 4px; font-size:10px; border-radius:3px;">
                <strong>${key}:</strong> ${displayValue}
             </div>`;
        fieldsShown++;
    });

    if (keys.length > maxFields) {
        html += `<div style="color:#6c757d; font-size:10px;">+${keys.length - maxFields} thay đổi khác</div>`;
    }

    html += "</div>";
    return html;
}

function renderCompactSummary(data) {
    if (!data || typeof data !== "object") return "-";

    if (data.image || data.img || data.hinh) {
        let imgUrl = data.image || data.img || data.hinh;
        return `<img src="${imgUrl}" alt="Img" style="max-width:40px; max-height:40px; border-radius:4px;">`;
    }

    const priorityFields = [
        "tenSanPham",
        "name",
        "title",
        "dotLive",
        "soLuong",
        "quantity",
    ];
    let displayText = "";

    for (let field of priorityFields) {
        if (data[field]) {
            displayText = String(data[field]);
            if (displayText.length > 25) {
                displayText = displayText.substring(0, 25) + "...";
            }
            break;
        }
    }

    if (!displayText) {
        const keys = Object.keys(data);
        if (keys.length > 0) {
            displayText = String(data[keys[0]]);
            if (displayText.length > 25) {
                displayText = displayText.substring(0, 25) + "...";
            }
        }
    }

    return `<span style="font-size:11px; padding:2px 6px; border-radius:4px; display:inline-block;">${displayText || "Dữ liệu"}</span>`;
}

// =====================================================
// MODAL
// =====================================================

function showDetailModal(data) {
    const isMarkActionType = isMarkAction(data.action);

    modalDetailContent.innerHTML = `
        <div class="detail-section">
            <p><strong>Thời gian:</strong> ${formatTimestamp(data.timestamp)}</p>
            <p><strong>Người dùng:</strong> ${data.user}</p>
            <p><strong>Trang:</strong> ${data.page || "Không xác định"}</p>
            <p><strong>Hành động:</strong> ${getActionText(data.action)}</p>
            <p><strong>Mô tả:</strong> ${data.description}</p>
        </div>
        
        ${
            !isMarkActionType
                ? `
        <div class="detail-section">
            <h4>Dữ liệu trước khi thay đổi:</h4>
            ${renderObjectAsTable(data.oldData)}
        </div>
        
        <div class="detail-section">
            <h4>Dữ liệu sau khi thay đổi:</h4>
            ${data.action === "delete" ? '<div class="deleted-indicator" style="padding:12px; font-size:14px;">Đã Xóa</div>' : renderObjectAsTable(data.newData)}
        </div>
        
        <div class="detail-section">
            <h4>Thay đổi cụ thể:</h4>
            <div>${generateChangeDiff(data.oldData, data.newData, data.action)}</div>
        </div>
        `
                : `
        <div class="detail-section">
            <h4>Thông tin:</h4>
            <p style="color:#667eea; font-style:italic;">Đây là hành động đánh dấu/bỏ đánh dấu, không có dữ liệu thay đổi cụ thể.</p>
        </div>
        `
        }
    `;

    detailModal.classList.add("show");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeDetailModal() {
    detailModal.classList.remove("show");
}

function renderObjectAsTable(obj) {
    if (!obj || typeof obj !== "object") return "<i>Không có dữ liệu</i>";

    let html = "<table><tr><th>Trường</th><th>Giá trị</th></tr>";
    for (let key in obj) {
        html += `<tr><td><strong>${key}</strong></td><td>${JSON.stringify(obj[key])}</td></tr>`;
    }
    html += "</table>";
    return html;
}

function generateChangeDiff(oldData, newData, action) {
    if (action === "delete") {
        return '<span class="removed">- Xóa toàn bộ dữ liệu</span>';
    }

    if (!oldData && !newData) return "Không có thay đổi";
    if (!oldData) return '<span class="added">+ Tạo mới toàn bộ dữ liệu</span>';
    if (!newData) return '<span class="removed">- Xóa toàn bộ dữ liệu</span>';

    let diff = "";
    const allKeys = new Set([
        ...Object.keys(oldData || {}),
        ...Object.keys(newData || {}),
    ]);

    allKeys.forEach((key) => {
        const oldValue = oldData[key];
        const newValue = newData[key];

        if (oldValue !== newValue) {
            if (oldValue === undefined) {
                diff += `<div class="change-item"><strong>${key}:</strong> <span class="added">+ ${JSON.stringify(newValue)}</span></div>`;
            } else if (newValue === undefined) {
                diff += `<div class="change-item"><strong>${key}:</strong> <span class="removed">- ${JSON.stringify(oldValue)}</span></div>`;
            } else {
                diff += `<div class="change-item"><strong>${key}:</strong><br/>
                     <span class="removed">- ${JSON.stringify(oldValue)}</span><br/>
                     <span class="added">+ ${JSON.stringify(newValue)}</span></div>`;
            }
        }
    });

    return diff || "Không có thay đổi";
}

// =====================================================
// FILTERS
// =====================================================

function applyFilters() {
    const selectedUser = userFilter.value;
    const selectedPage = pageFilter.value;
    const selectedAction = actionFilter.value;
    const startDateValue = startDate.value;
    const endDateValue = endDate.value;

    const isShowingAll =
        selectedUser === "all" &&
        selectedPage === "all" &&
        selectedAction === "all" &&
        !startDateValue &&
        !endDateValue;

    if (isShowingAll) {
        displayFilteredData(allHistoryData);
        notify.info("Hiển thị tất cả dữ liệu!");
        return;
    }

    const loadingId = notify.loading("Đang lọc dữ liệu...");

    setTimeout(() => {
        let filtered = allHistoryData.filter((item) => {
            if (selectedUser !== "all" && item.user !== selectedUser)
                return false;
            if (selectedPage !== "all" && item.page !== selectedPage)
                return false;
            if (selectedAction !== "all" && item.action !== selectedAction)
                return false;

            // Convert timestamp to Date
            let itemDate;
            if (item.timestamp && typeof item.timestamp.toDate === "function") {
                itemDate = item.timestamp.toDate();
            } else if (item.timestamp instanceof Date) {
                itemDate = item.timestamp;
            } else if (item.timestamp && item.timestamp.seconds) {
                itemDate = new Date(item.timestamp.seconds * 1000);
            } else {
                itemDate = new Date();
            }

            if (startDateValue && itemDate < new Date(startDateValue))
                return false;
            if (endDateValue && itemDate > new Date(endDateValue + " 23:59:59"))
                return false;

            return true;
        });

        displayFilteredData(filtered);
        notify.remove(loadingId);
        notify.success(`Đã lọc! Hiển thị ${filtered.length} kết quả.`);
    }, 300);
}

function resetFilters() {
    userFilter.value = "all";
    pageFilter.value = "all";
    actionFilter.value = "all";
    startDate.value = "";
    endDate.value = "";
    displayFilteredData(allHistoryData);
    notify.info("Đã xóa bộ lọc!");
}

// =====================================================
// DELETE FILTERED HISTORY
// =====================================================

async function clearFilteredHistory() {
    // Check for delete permission in detailedPermissions
    if (!auth?.detailedPermissions?.['lichsuchinhsua']?.['delete']) {
        notify.warning("Không đủ quyền thực hiện hành động này!");
        return;
    }

    if (filteredData.length === 0) {
        notify.warning("Không có dữ liệu để xóa!");
        return;
    }

    const confirmMessage =
        filteredData.length === allHistoryData.length
            ? `Bạn có chắc chắn muốn xóa toàn bộ ${filteredData.length} bản ghi lịch sử? Hành động này không thể hoàn tác!`
            : `Bạn có chắc chắn muốn xóa ${filteredData.length} bản ghi lịch sử đã lọc? Hành động này không thể hoàn tác!`;

    if (!confirm(confirmMessage)) return;

    const deletingId = notify.deleting(
        `Đang xóa ${filteredData.length} bản ghi...`,
    );

    try {
        const batch = db.batch();
        filteredData.forEach((item) => {
            if (item.docId) {
                const docRef = historyCollectionRef.doc(item.docId);
                batch.delete(docRef);
            }
        });

        await batch.commit();

        // Log action
        const actionDescription =
            filteredData.length === allHistoryData.length
                ? "Xóa toàn bộ lịch sử chỉnh sửa"
                : `Xóa ${filteredData.length} bản ghi lịch sử đã lọc`;

        logAction("delete", actionDescription);

        notify.remove(deletingId);
        notify.success(`Đã xóa ${filteredData.length} bản ghi thành công!`);

        // Reload data
        loadHistoryData();
    } catch (error) {
        console.error("Error clearing history:", error);
        notify.remove(deletingId);
        notify.error("Lỗi khi xóa lịch sử!");
    }
}

// =====================================================
// LOG ACTION UTILITY
// =====================================================

function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Lịch sử chỉnh sửa",
) {
    const logEntry = {
        timestamp: new Date(),
        user: userType ? userType.split("-")[0] : "Unknown",
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => console.log("Log entry saved"))
        .catch((error) => console.error("Error saving log:", error));
}

// =====================================================
// EVENT LISTENERS
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    // Load data
    loadHistoryData();

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Sidebar toggle
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebarToggleFixed = document.getElementById("sidebarToggleFixed");
    const menuToggle = document.getElementById("menuToggle");

    function toggleSidebar() {
        sidebar.classList.toggle("collapsed");
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
    if (sidebarToggleFixed)
        sidebarToggleFixed.addEventListener("click", toggleSidebar);
    if (menuToggle) menuToggle.addEventListener("click", toggleSidebar);

    // Filter buttons
    document
        .getElementById("btnApplyFilter")
        .addEventListener("click", applyFilters);
    document
        .getElementById("btnResetFilter")
        .addEventListener("click", resetFilters);

    // Auto apply filters on change
    userFilter.addEventListener("change", applyFilters);
    pageFilter.addEventListener("change", applyFilters);
    actionFilter.addEventListener("change", applyFilters);
    startDate.addEventListener("change", applyFilters);
    endDate.addEventListener("change", applyFilters);

    // Refresh button
    document.getElementById("btnRefresh").addEventListener("click", () => {
        const loadingId = notify.loading("Đang làm mới...");
        setTimeout(() => {
            loadHistoryData();
            notify.remove(loadingId);
        }, 500);
    });

    // Clear filtered button
    document
        .getElementById("btnClearFiltered")
        .addEventListener("click", clearFilteredHistory);

    // Modal close
    document
        .getElementById("closeModal")
        .addEventListener("click", closeDetailModal);
    detailModal.addEventListener("click", (e) => {
        if (e.target === detailModal) closeDetailModal();
    });

    // Logout button
    document.getElementById("btnLogout").addEventListener("click", () => {
        if (authManager) {
            authManager.logout();
        }
    });

    // Auto-refresh every 5 minutes
    setInterval(
        () => {
            loadHistoryData();
        },
        5 * 60 * 1000,
    );
});
