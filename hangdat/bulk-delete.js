// =====================================================
// BULK DELETE SYSTEM
// =====================================================

class BulkDeleteManager {
    constructor() {
        this.selectedIds = new Set();
        this.init();
    }

    init() {
        this.createBulkActionBar();
        this.setupEventListeners();
    }

    createBulkActionBar() {
        const existingBar = document.getElementById("bulkActionBar");
        if (existingBar) return;

        const bar = document.createElement("div");
        bar.id = "bulkActionBar";
        bar.className = "bulk-action-bar";
        bar.innerHTML = `
            <div class="bulk-action-content">
                <div class="bulk-action-left">
                    <span class="selected-count">Đã chọn: <strong>0</strong> sản phẩm</span>
                </div>
                <div class="bulk-action-right">
                    <button class="btn btn-secondary" id="deselectAllBtn">
                        <i data-lucide="x"></i>
                        <span>Bỏ chọn tất cả</span>
                    </button>
                    <button class="btn btn-danger" id="bulkDeleteBtn">
                        <i data-lucide="trash-2"></i>
                        <span>Xóa đã chọn</span>
                    </button>
                </div>
            </div>
        `;

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.insertBefore(bar, mainContent.firstChild);
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        document.addEventListener("click", (e) => {
            if (
                e.target.id === "selectAllCheckbox" ||
                e.target.closest("#selectAllCheckbox")
            ) {
                this.handleSelectAll(e);
            } else if (e.target.classList.contains("row-checkbox")) {
                this.handleRowCheckbox(e);
            } else if (
                e.target.id === "bulkDeleteBtn" ||
                e.target.closest("#bulkDeleteBtn")
            ) {
                this.handleBulkDelete();
            } else if (
                e.target.id === "deselectAllBtn" ||
                e.target.closest("#deselectAllBtn")
            ) {
                this.deselectAll();
            }
        });
    }

    handleSelectAll(e) {
        const checkbox =
            e.target.type === "checkbox"
                ? e.target
                : e.target.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        const isChecked = checkbox.checked;
        const allCheckboxes = document.querySelectorAll(".row-checkbox");

        allCheckboxes.forEach((cb) => {
            cb.checked = isChecked;
            const id = cb.dataset.itemId;
            if (isChecked) {
                this.selectedIds.add(id);
            } else {
                this.selectedIds.delete(id);
            }
        });

        this.updateUI();
    }

    handleRowCheckbox(e) {
        const checkbox = e.target;
        const id = checkbox.dataset.itemId;

        if (checkbox.checked) {
            this.selectedIds.add(id);
        } else {
            this.selectedIds.delete(id);
        }

        this.updateSelectAllCheckbox();
        this.updateUI();
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById("selectAllCheckbox");
        if (!selectAllCheckbox) return;

        const allCheckboxes = document.querySelectorAll(".row-checkbox");
        const checkedCheckboxes = document.querySelectorAll(
            ".row-checkbox:checked",
        );

        if (allCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    updateUI() {
        const bar = document.getElementById("bulkActionBar");
        const countSpan = bar?.querySelector(".selected-count strong");

        if (this.selectedIds.size > 0) {
            bar?.classList.add("show");
            if (countSpan) {
                countSpan.textContent = this.selectedIds.size;
            }
        } else {
            bar?.classList.remove("show");
        }
    }

    async handleBulkDelete() {
        if (this.selectedIds.size === 0) {
            notifyManager.warning("Chưa chọn sản phẩm nào để xóa!");
            return;
        }

        const auth = getAuthState();
        if (
            !auth ||
            (parseInt(auth.checkLogin) > 0 && parseInt(auth.checkLogin) !== 3)
        ) {
            notifyManager.warning("Không đủ quyền thực hiện chức năng này.");
            return;
        }

        const count = this.selectedIds.size;
        const confirmMessage = `Bạn có chắc chắn muốn xóa ${count} sản phẩm đã chọn?\n\nThao tác này không thể hoàn tác!`;

        if (!confirm(confirmMessage)) {
            notifyManager.info("Đã hủy thao tác xóa", 2000);
            return;
        }

        const notifId = notifyManager.deleting(`Đang xóa ${count} sản phẩm...`);

        try {
            const idsToDelete = Array.from(this.selectedIds);

            // Get current data
            const doc = await collectionRef.doc("dathang").get();
            let orderData = [];

            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    orderData = data.data;
                }
            } else {
                throw new Error("Không tìm thấy document dathang");
            }

            // Filter out selected items
            const beforeCount = orderData.length;
            const filteredData = orderData.filter(
                (order) => !idsToDelete.includes(order.id),
            );
            const afterCount = filteredData.length;
            const actualDeleted = beforeCount - afterCount;

            if (actualDeleted === 0) {
                throw new Error("Không tìm thấy sản phẩm để xóa");
            }

            // Update Firebase
            await collectionRef.doc("dathang").update({ data: filteredData });

            // Log action
            logAction(
                "bulk_delete",
                `Xóa hàng loạt ${actualDeleted} sản phẩm`,
                { deletedIds: idsToDelete },
                null,
            );

            // Refresh UI
            this.deselectAll();
            await refreshCachedDataAndTable();

            notifyManager.remove(notifId);
            notifyManager.success(
                `Đã xóa ${actualDeleted} sản phẩm thành công!`,
            );
        } catch (error) {
            console.error("Lỗi khi xóa hàng loạt:", error);
            notifyManager.remove(notifId);
            notifyManager.error("Lỗi khi xóa: " + error.message);
        }
    }

    deselectAll() {
        this.selectedIds.clear();

        const allCheckboxes = document.querySelectorAll(".row-checkbox");
        allCheckboxes.forEach((cb) => (cb.checked = false));

        const selectAllCheckbox = document.getElementById("selectAllCheckbox");
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }

        this.updateUI();
    }

    getSelectedCount() {
        return this.selectedIds.size;
    }

    getSelectedIds() {
        return Array.from(this.selectedIds);
    }
}

// Initialize global bulk delete manager
window.bulkDeleteManager = new BulkDeleteManager();

// Add CSS styles
const bulkDeleteStyles = `
<style>
/* Bulk Action Bar */
.bulk-action-bar {
    position: fixed;
    bottom: -80px;
    left: var(--sidebar-width, 260px);
    right: 0;
    height: 72px;
    background: white;
    border-top: 2px solid var(--primary);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    transition: bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.bulk-action-bar.show {
    bottom: 0;
}

.bulk-action-content {
    max-width: 100%;
    height: 100%;
    padding: 0 var(--spacing-xl, 24px);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.bulk-action-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg, 16px);
}

.selected-count {
    font-size: 0.9375rem;
    color: var(--text-secondary, #6b7280);
}

.selected-count strong {
    color: var(--primary, #6366f1);
    font-size: 1.125rem;
    margin-left: 4px;
}

.bulk-action-right {
    display: flex;
    gap: var(--spacing-md, 12px);
}

.btn-danger {
    background: var(--danger, #ef4444);
    color: white;
}

.btn-danger:hover {
    background: #dc2626;
}

/* Checkbox Styles */
.checkbox-cell {
    width: 40px;
    text-align: center;
    vertical-align: middle;
}

.row-checkbox,
#selectAllCheckbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--primary, #6366f1);
}

#selectAllCheckbox {
    margin: 0;
}

/* Row highlight when selected */
tr.selected {
    background-color: rgba(99, 102, 241, 0.05) !important;
}

tr.selected:hover {
    background-color: rgba(99, 102, 241, 0.1) !important;
}

/* Mobile adjustments */
@media (max-width: 768px) {
    .bulk-action-bar {
        left: 0;
    }
    
    .bulk-action-content {
        padding: 0 var(--spacing-md, 12px);
        flex-direction: column;
        gap: var(--spacing-sm, 8px);
        justify-content: center;
    }
    
    .bulk-action-bar {
        height: auto;
        padding: var(--spacing-md, 12px) 0;
    }
    
    .bulk-action-right {
        width: 100%;
        justify-content: center;
    }
}
</style>
`;

document.head.insertAdjacentHTML("beforeend", bulkDeleteStyles);

console.log("✅ Bulk Delete System initialized");
