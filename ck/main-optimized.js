// main-optimized.js - ENHANCED VERSION WITH FULL NOTIFICATIONS
// Complete notification system for all actions

class MoneyTransferApp {
    constructor() {
        this.firebase = null;
        this.db = null;
        this.collectionRef = null;
        this.historyCollectionRef = null;
        this.virtualScrollManager = null;
        this.filterManager = null;
        this.notificationManager = null;
        this.isInitialized = false;
        this.initStartTime = performance.now();
        this.activeNotificationId = null;

        console.log("MoneyTransferApp initializing...");
    }

    async init() {
        let notificationId = null;

        try {
            performanceMonitor.start("appInit");

            // Show loading notification
            notificationId = this.showNotification(
                "Đang khởi tạo ứng dụng...",
                "loading",
                0,
                { showOverlay: true, persistent: true },
            );

            // Check authentication
            if (!this.checkAuthentication()) {
                this.hideNotification(notificationId);
                return;
            }

            // Initialize NotificationManager
            this.notificationManager = new NotificationManager();

            // Initialize Firebase
            this.updateNotification(notificationId, "Đang kết nối Firebase...");
            await this.initFirebase();

            // Initialize managers
            this.updateNotification(notificationId, "Đang khởi tạo modules...");
            this.initManagers();

            // Initialize UI
            this.updateNotification(
                notificationId,
                "Đang chuẩn bị giao diện...",
            );
            this.initUI();

            // Load initial data
            this.updateNotification(notificationId, "Đang tải dữ liệu...");
            await this.loadInitialData();

            this.isInitialized = true;
            const initTime = performanceMonitor.end("appInit");

            // Hide loading and show success
            this.hideNotification(notificationId);
            this.notificationManager.success(
                `Ứng dụng sẵn sàng (${initTime.toFixed(0)}ms)`,
                2000,
                "Thành công",
            );

            console.log(
                `App initialized successfully in ${initTime.toFixed(0)}ms`,
            );
        } catch (error) {
            console.error("App initialization failed:", error);

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Không thể khởi tạo ứng dụng: " + error.message,
                5000,
                "Lỗi khởi tạo",
            );
        }
    }

    // Notification helpers
    showNotification(message, type = "info", duration = 0, options = {}) {
        if (this.notificationManager) {
            return this.notificationManager.show(
                message,
                type,
                duration,
                options,
            );
        }
        // Fallback to window functions
        if (window.showOperationLoading && type === "loading") {
            window.showOperationLoading(message);
        }
        return null;
    }

    updateNotification(id, message) {
        // For now, just log - could be enhanced to update existing notification
        console.log("Update notification:", message);
    }

    hideNotification(id) {
        if (this.notificationManager && id) {
            this.notificationManager.remove(id);
        }
        if (window.hideOperationLoading) {
            window.hideOperationLoading();
        }
    }

    checkAuthentication() {
        const auth = this.getAuthState();
        if (!auth || auth.isLoggedIn !== "true") {
            console.log("User not authenticated, redirecting...");
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return false;
        }

        console.log("User authenticated:", auth.userType);
        this.updateUIForUser(auth);
        return true;
    }

    getAuthState() {
        try {
            const stored = localStorage.getItem(CONFIG.data.AUTH_STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error("Error reading auth state:", error);
            return null;
        }
    }

    updateUIForUser(auth) {
        if (auth.userType) {
            const titleElement = domManager.get(".page-title");
            if (titleElement) {
                titleElement.textContent +=
                    " - " + (auth.displayName || auth.userType);
            }
        }
    }

    async initFirebase() {
        try {
            this.firebase = firebase.initializeApp(CONFIG.firebase);
            this.db = firebase.firestore();
            this.collectionRef = this.db.collection(
                CONFIG.data.COLLECTION_NAME,
            );
            this.historyCollectionRef = this.db.collection(
                CONFIG.data.HISTORY_COLLECTION_NAME,
            );
            console.log("Firebase initialized successfully");
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            throw new Error("Không thể kết nối Firebase");
        }
    }

    initManagers() {
        try {
            this.virtualScrollManager = new VirtualScrollManager();
            window.virtualScrollManager = this.virtualScrollManager;

            this.filterManager = new FilterManager();
            window.filterManager = this.filterManager;

            // Initialize simple search system
            if (typeof SimpleSearchManager !== "undefined") {
                this.searchManager = new SimpleSearchManager();
                this.searchManager.init();
                window.searchManager = this.searchManager;
                console.log("✅ Simple Search Manager initialized");
            }

            console.log("Managers initialized successfully");
        } catch (error) {
            console.error("Manager initialization failed:", error);
            throw new Error("Không thể khởi tạo các module");
        }
    }

    initUI() {
        try {
            this.initForm();
            this.initTableEvents();
            this.initUIComponents();
            console.log("UI initialized successfully");
        } catch (error) {
            console.error("UI initialization failed:", error);
            throw new Error("Không thể khởi tạo giao diện");
        }
    }

    initForm() {
        const ngayck = domManager.get(SELECTORS.ngayck);
        if (ngayck) {
            const vietnamToday = VietnamTime.getDateString();
            ngayck.value = vietnamToday;
            console.log("Form initialized with Vietnam date:", vietnamToday);
        }

        const toggleFormButton = domManager.get(SELECTORS.toggleFormButton);
        const dataForm = domManager.get(SELECTORS.dataForm);

        if (toggleFormButton && dataForm) {
            toggleFormButton.addEventListener("click", () => {
                if (APP_STATE.isOperationInProgress) {
                    this.notificationManager.warning(
                        "Có thao tác đang thực hiện, vui lòng đợi...",
                        2000,
                    );
                    return;
                }

                if (this.hasPermission(3)) {
                    const isHidden =
                        dataForm.style.display === "none" ||
                        dataForm.style.display === "";

                    if (isHidden) {
                        dataForm.style.display = "block";
                        toggleFormButton.textContent = "Ẩn biểu mẫu";

                        setTimeout(() => {
                            const firstInput = domManager.get(
                                SELECTORS.transferNote,
                            );
                            if (firstInput) firstInput.focus();
                        }, 200);
                    } else {
                        dataForm.style.display = "none";
                        toggleFormButton.textContent = "Hiện biểu mẫu";
                    }
                } else {
                    this.notificationManager.error(
                        "Không có quyền truy cập form",
                        3000,
                        "Không đủ quyền",
                    );
                }
            });
        }

        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            moneyTransferForm.addEventListener("submit", (e) =>
                this.handleFormSubmit(e),
            );
        }

        const transferAmountInput = domManager.get(SELECTORS.transferAmount);
        if (transferAmountInput) {
            transferAmountInput.addEventListener("blur", function () {
                let value = this.value.replace(/[,\.]/g, "");
                value = parseFloat(value);
                if (!isNaN(value) && value > 0) {
                    this.value = numberWithCommas(value);
                }
            });
        }

        const clearDataButton = domManager.get(SELECTORS.clearDataButton);
        if (clearDataButton) {
            clearDataButton.addEventListener("click", () => {
                if (APP_STATE.isOperationInProgress) return;

                const formInputs = moneyTransferForm.querySelectorAll(
                    "input, select, textarea",
                );
                formInputs.forEach((input) => {
                    input.value = "";
                });

                if (ngayck) {
                    ngayck.value = VietnamTime.getDateString();
                }

                this.notificationManager.info("Đã xóa dữ liệu form", 1500);
            });
        }
    }

    initTableEvents() {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        tableBody.addEventListener("click", (e) => {
            if (APP_STATE.isOperationInProgress) {
                this.notificationManager.warning(
                    "Có thao tác đang thực hiện, vui lòng đợi...",
                    2000,
                );
                return;
            }

            const auth = this.getAuthState();
            if (!auth || auth.checkLogin == "777") {
                if (e.target.type === "checkbox") {
                    e.target.checked = false;
                }
                return;
            }

            // Check if click is on edit button or its children (icon)
            const editButton = e.target.closest(".edit-button");
            if (editButton) {
                this.handleEditButton(e);
                return;
            }

            // Check if click is on delete button or its children (icon)
            const deleteButton = e.target.closest(".delete-button");
            if (deleteButton) {
                this.handleDeleteButton(e);
                return;
            }

            // Check if click is on checkbox
            if (e.target.type === "checkbox") {
                this.handleCheckboxClick(e);
                return;
            }
        });
    }

    initUIComponents() {
        const toggleLogoutButton = domManager.get(SELECTORS.toggleLogoutButton);
        if (toggleLogoutButton) {
            toggleLogoutButton.addEventListener("click", () =>
                this.handleLogout(),
            );
        }

        window.exportToExcel = () => this.exportToExcel();
        window.closeModal = () => this.closeModal();
        window.saveChanges = () => this.saveChanges();
    }

    // ===== DATA LOADING =====
    async loadInitialData() {
        let notificationId = null;

        try {
            performanceMonitor.start("initialDataLoad");

            const cachedData = cacheManager.get();
            if (cachedData) {
                console.log("Loading from cache...");
                await this.renderInitialData(cachedData);
                performanceMonitor.end("initialDataLoad");

                this.notificationManager.success(
                    `Đã tải ${cachedData.length} giao dịch từ bộ nhớ đệm`,
                    2000,
                );
                return;
            }

            console.log("Loading from Firebase...");
            notificationId = this.notificationManager.loadingData(
                "Đang tải dữ liệu từ Firebase...",
            );

            const doc = await this.collectionRef
                .doc(CONFIG.data.COLLECTION_NAME)
                .get();

            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data["data"]) && data["data"].length > 0) {
                    console.log(
                        `Loading ${data["data"].length} transactions from Firebase...`,
                    );

                    const processedData = data["data"].map((item) => {
                        const processedItem = ensureUniqueId(item);

                        if (item.muted !== undefined) {
                            processedItem.completed = Boolean(item.muted);
                            delete processedItem.muted;
                        } else {
                            processedItem.completed = false;
                        }

                        return processedItem;
                    });

                    console.log("Data conversion summary:", {
                        total: processedData.length,
                        completed: processedData.filter(
                            (item) => item.completed,
                        ).length,
                        active: processedData.filter((item) => !item.completed)
                            .length,
                    });

                    cacheManager.set(processedData);
                    await this.renderInitialData(processedData);

                    this.hideNotification(notificationId);
                    this.notificationManager.success(
                        `Đã tải xong ${processedData.length} giao dịch!`,
                        2000,
                        "Hoàn thành",
                    );
                } else {
                    console.log("No data found or data array is empty");
                    this.filterManager.createFilterUI();

                    this.hideNotification(notificationId);
                    this.notificationManager.warning("Không có dữ liệu", 3000);
                }
            } else {
                console.log("Document does not exist");
                this.filterManager.createFilterUI();

                this.hideNotification(notificationId);
                this.notificationManager.error("Tài liệu không tồn tại", 3000);
            }

            performanceMonitor.end("initialDataLoad");
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.filterManager.createFilterUI();

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Lỗi khi tải dữ liệu từ Firebase: " + error.message,
                5000,
                "Lỗi tải dữ liệu",
            );
        }
    }

    async renderInitialData(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            console.log("No data to render");
            return;
        }

        performanceMonitor.start("renderInitialData");

        APP_STATE.arrayData = [...dataArray];

        const sortedData = ArrayUtils.fastSort([...dataArray], (a, b) => {
            const timestampA = parseInt(a.dateCell) || 0;
            const timestampB = parseInt(b.dateCell) || 0;
            return timestampB - timestampA;
        });

        APP_STATE.filteredData = [...sortedData];

        console.log("Initial render with Vietnam today filter:", {
            dataCount: sortedData.length,
        });

        await this.filterManager.applyFilters(sortedData);

        performanceMonitor.end("renderInitialData");
    }

    // ===== FORM SUBMIT =====
    async handleFormSubmit(e) {
        e.preventDefault();

        if (APP_STATE.isOperationInProgress) {
            this.notificationManager.warning(
                "Có thao tác đang thực hiện, vui lòng đợi...",
                2000,
            );
            return;
        }

        if (!this.hasPermission(3)) {
            this.notificationManager.error(
                "Không có quyền thêm giao dịch",
                3000,
                "Không đủ quyền",
            );
            return;
        }

        const formData = this.getFormData();
        if (!formData) return;

        let notificationId = null;

        try {
            this.blockInteraction("add");

            notificationId = this.notificationManager.show(
                "Đang thêm giao dịch...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "plus-circle",
                    title: "Thêm giao dịch",
                },
            );

            const newTransaction = this.createTransaction(formData);

            this.updateNotification(
                notificationId,
                "Đang cập nhật giao diện...",
            );
            this.addTransactionToUI(newTransaction);

            this.resetForm();

            this.updateNotification(notificationId, "Đang lưu vào Firebase...");
            await this.uploadTransaction(newTransaction);

            APP_STATE.arrayData.unshift(newTransaction);
            cacheManager.invalidate();

            this.logAction(
                "add",
                `Thêm giao dịch chuyển khoản: ${formData.transferNote}`,
                null,
                newTransaction,
            );

            this.hideNotification(notificationId);
            this.notificationManager.success(
                `Đã thêm giao dịch: ${formData.transferNote}`,
                3000,
                "Thành công",
            );

            setTimeout(() => {
                const firstInput = domManager.get(SELECTORS.transferNote);
                if (firstInput) firstInput.focus();
            }, 100);
        } catch (error) {
            console.error("Error adding transaction:", error);

            const tableBody = domManager.get(SELECTORS.tableBody);
            if (tableBody && tableBody.firstChild) {
                tableBody.removeChild(tableBody.firstChild);
            }

            this.restoreFormData(formData);

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Lỗi khi thêm giao dịch: " + error.message,
                5000,
                "Lỗi",
            );
        } finally {
            this.unblockInteraction();
        }
    }

    getFormData() {
        const ngayck = domManager.get(SELECTORS.ngayck);
        const transferNote = domManager.get(SELECTORS.transferNote);
        const transferAmount = domManager.get(SELECTORS.transferAmount);
        const bank = domManager.get(SELECTORS.bank);
        const customerInfo = domManager.get(SELECTORS.customerInfo);

        if (
            !ngayck ||
            !transferNote ||
            !transferAmount ||
            !bank ||
            !customerInfo
        ) {
            this.notificationManager.error(
                "Không tìm thấy các trường form",
                3000,
            );
            return null;
        }

        const currentDate = new Date(ngayck.value);
        const noteValue = sanitizeInput(transferNote.value);
        let amountValue = transferAmount.value.replace(/[,\.]/g, "");
        amountValue = parseFloat(amountValue);
        const selectedBank = sanitizeInput(bank.value);
        const customerInfoValue = sanitizeInput(customerInfo.value);

        if (isNaN(amountValue) || amountValue <= 0) {
            this.notificationManager.error(
                "Vui lòng nhập số tiền chuyển hợp lệ",
                3000,
                "Dữ liệu không hợp lệ",
            );
            return null;
        }

        if (!noteValue.trim()) {
            this.notificationManager.error(
                "Vui lòng nhập ghi chú chuyển khoản",
                3000,
                "Thiếu thông tin",
            );
            return null;
        }

        return {
            currentDate,
            transferNote: noteValue,
            transferAmount: amountValue,
            selectedBank,
            customerInfo: customerInfoValue,
        };
    }

    createTransaction(formData) {
        const vietnamDate = new Date(formData.currentDate.getTime());
        const tempTimeStamp = VietnamTime.now();

        const timestamp =
            vietnamDate.getTime() +
            (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) *
                1000;

        const auth = this.getAuthState();

        const newTransaction = {
            uniqueId: generateUniqueId(),
            dateCell: timestamp.toString(),
            noteCell: formData.transferNote,
            amountCell: numberWithCommas(formData.transferAmount),
            bankCell: formData.selectedBank,
            customerInfoCell: formData.customerInfo,
            user: auth
                ? auth.userType
                    ? auth.userType.split("-")[0]
                    : "Unknown"
                : "Unknown",
            completed: false,
        };

        return newTransaction;
    }

    addTransactionToUI(transaction) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        const timestamp = parseFloat(transaction.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);

        if (this.filterManager) {
            const newRow = this.filterManager.createTableRow(
                transaction,
                formattedTime,
            );
            if (newRow) {
                if (tableBody.firstChild) {
                    tableBody.insertBefore(newRow, tableBody.firstChild);
                } else {
                    tableBody.appendChild(newRow);
                }
            }
        }
    }

    resetForm() {
        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        const ngayck = domManager.get(SELECTORS.ngayck);

        if (moneyTransferForm) {
            moneyTransferForm.reset();
        }

        if (ngayck) {
            const vietnamToday = VietnamTime.getDateString();
            ngayck.value = vietnamToday;
        }
    }

    restoreFormData(formData) {
        const transferNote = domManager.get(SELECTORS.transferNote);
        const transferAmount = domManager.get(SELECTORS.transferAmount);
        const bank = domManager.get(SELECTORS.bank);
        const customerInfo = domManager.get(SELECTORS.customerInfo);
        const ngayck = domManager.get(SELECTORS.ngayck);

        if (transferNote) transferNote.value = formData.transferNote;
        if (transferAmount)
            transferAmount.value = numberWithCommas(formData.transferAmount);
        if (bank) bank.value = formData.selectedBank;
        if (customerInfo) customerInfo.value = formData.customerInfo;
        if (ngayck) ngayck.valueAsDate = formData.currentDate;
    }

    async uploadTransaction(transaction) {
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();

        const transactionForFirebase = {
            ...transaction,
            muted: transaction.completed,
        };
        delete transactionForFirebase.completed;

        const updateData = doc.exists
            ? {
                  ["data"]: firebase.firestore.FieldValue.arrayUnion(
                      transactionForFirebase,
                  ),
              }
            : { ["data"]: [transactionForFirebase] };

        const operation = doc.exists
            ? this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .update(updateData)
            : this.collectionRef
                  .doc(CONFIG.data.COLLECTION_NAME)
                  .set(updateData);

        return operation;
    }

    // ===== CHECKBOX HANDLER =====
    async handleCheckboxClick(e) {
        if (!this.hasPermission(1)) {
            this.notificationManager.error(
                "Không đủ quyền thực hiện chức năng này",
                3000,
                "Không đủ quyền",
            );
            e.preventDefault();
            return;
        }

        const checkbox = e.target;
        const row = checkbox.closest("tr");
        const uniqueId = row.getAttribute("data-unique-id");
        const newCheckedState = checkbox.checked;

        const currentItem = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );

        if (!currentItem) {
            console.error("Transaction not found");
            e.preventDefault();
            return;
        }

        const confirmationMessage = newCheckedState
            ? "Bạn có chắc đơn này đã được đi?"
            : "Bạn có chắc muốn đánh dấu đơn này là chưa đi?";

        if (!confirm(confirmationMessage)) {
            e.preventDefault();
            return;
        }

        let notificationId = null;

        try {
            this.blockInteraction("status_update");

            notificationId = this.notificationManager.show(
                newCheckedState
                    ? "Đang đánh dấu đã đi đơn..."
                    : "Đang hủy đánh dấu...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "check-square",
                    title: "Cập nhật",
                },
            );

            const newCompletedValue = newCheckedState;

            this.updateRowCompletedState(row, newCompletedValue);

            await this.updateCompletedStateInFirebase(
                uniqueId,
                row,
                newCompletedValue,
            );

            this.updateCompletedStateInData(uniqueId, newCompletedValue);

            if (this.filterManager) {
                this.filterManager.updateTotalAmount();
            }
            cacheManager.invalidate();

            const dataForLog = this.extractRowData(row);
            this.logAction(
                "update",
                `${newCompletedValue ? "Đánh dấu đã đi đơn" : "Hủy đánh dấu đi đơn"}: ${dataForLog.noteCell}`,
                { ...dataForLog, completed: !newCompletedValue },
                { ...dataForLog, completed: newCompletedValue },
            );

            this.hideNotification(notificationId);
            this.notificationManager.success(
                newCompletedValue
                    ? "Đã đánh dấu đơn này đã đi"
                    : "Đã hủy đánh dấu",
                2000,
                "Cập nhật thành công",
            );
        } catch (error) {
            console.error("Error updating status:", error);

            this.updateRowCompletedState(row, !newCompletedValue);
            checkbox.checked = !newCheckedState;

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Lỗi khi cập nhật trạng thái: " + error.message,
                5000,
                "Lỗi",
            );
        } finally {
            this.unblockInteraction();
        }
    }

    updateRowCompletedState(row, isCompleted) {
        if (!row) return;

        row.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

        if (isCompleted === true) {
            row.style.opacity = "0.4";
            row.style.backgroundColor = "#f8f9fa";
            row.classList.add(CSS_CLASSES.muted);
            row.classList.remove(CSS_CLASSES.active);
        } else {
            row.style.opacity = "1.0";
            row.style.backgroundColor = "";
            row.classList.add(CSS_CLASSES.active);
            row.classList.remove(CSS_CLASSES.muted);
        }
    }

    updateCompletedStateInData(uniqueId, newCompletedValue) {
        const updateCompleted = (item) => {
            if (item.uniqueId === uniqueId) {
                item.completed = newCompletedValue;
                return true;
            }
            return false;
        };

        APP_STATE.arrayData.forEach(updateCompleted);
        APP_STATE.filteredData.forEach(updateCompleted);
    }

    async updateCompletedStateInFirebase(uniqueId, row, newCompletedValue) {
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        let itemIndex = dataArray.findIndex(
            (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex === -1) {
            itemIndex = dataArray.findIndex(
                (item) => item.dateCell === row.querySelector("td").id,
            );
        }

        if (itemIndex === -1) {
            throw new Error("Item not found in Firebase");
        }

        dataArray[itemIndex].muted = newCompletedValue;

        return await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });
    }

    // ===== EDIT HANDLERS =====
    handleEditButton(e) {
        if (APP_STATE.isOperationInProgress) {
            this.notificationManager.warning(
                "Có thao tác đang thực hiện, vui lòng đợi...",
                2000,
            );
            return;
        }

        const editModal = domManager.get(SELECTORS.editModal);
        if (!editModal) {
            this.notificationManager.error(
                "Không tìm thấy modal chỉnh sửa",
                2000,
            );
            return;
        }

        const row = e.target.closest("tr");
        if (!row) {
            this.notificationManager.error("Không tìm thấy giao dịch", 2000);
            return;
        }

        const uniqueId = row.getAttribute("data-unique-id");
        if (!uniqueId) {
            this.notificationManager.error("Không tìm thấy ID giao dịch", 2000);
            return;
        }

        const transaction = APP_STATE.arrayData.find(
            (item) => item.uniqueId === uniqueId,
        );

        if (!transaction) {
            this.notificationManager.error(
                "Không tìm thấy giao dịch để chỉnh sửa",
                3000,
            );
            return;
        }

        console.log("Opening edit modal for transaction:", {
            uniqueId: transaction.uniqueId,
            noteCell: transaction.noteCell,
            timestamp: transaction.dateCell,
            completed: transaction.completed,
        });

        const canEditAll = this.hasPermission(1);
        const canEditDateAmountInfo = this.hasPermission(3); // CẢI TIẾN: Có thể edit date, amount, info

        const editFields = {
            editDate: domManager.get(SELECTORS.editDate),
            editNote: domManager.get(SELECTORS.editNote),
            editAmount: domManager.get(SELECTORS.editAmount),
            editBank: domManager.get(SELECTORS.editBank),
            editInfo: domManager.get(SELECTORS.editInfo),
        };

        if (
            !editFields.editDate ||
            !editFields.editNote ||
            !editFields.editAmount ||
            !editFields.editBank ||
            !editFields.editInfo
        ) {
            this.notificationManager.error(
                "Không tìm thấy form chỉnh sửa",
                3000,
            );
            return;
        }

        const timestamp = parseFloat(transaction.dateCell);
        const formattedDate = VietnamTime.formatVietnamDate(timestamp);

        // Populate form fields
        editFields.editDate.value = formattedDate;
        editFields.editNote.value = transaction.noteCell || "";
        editFields.editAmount.value = transaction.amountCell || "";
        editFields.editBank.value = transaction.bankCell || "";
        editFields.editInfo.value = transaction.customerInfoCell || "";

        // Set permissions and styling
        if (canEditAll) {
            // Full permissions - can edit everything
            editFields.editDate.disabled = false;
            editFields.editNote.disabled = false;
            editFields.editAmount.disabled = false;
            editFields.editBank.disabled = false;
            editFields.editInfo.disabled = false;

            // Reset styles for editable fields
            Object.values(editFields).forEach((field) => {
                field.style.backgroundColor = "white";
                field.style.color = "#495057";
                field.style.cursor = "text";
            });
        } else if (canEditDateAmountInfo) {
            // FIXED: Có thể edit date, amount và customer info
            editFields.editDate.disabled = false;
            editFields.editNote.disabled = true;
            editFields.editAmount.disabled = false; // ✅ CHO PHÉP EDIT AMOUNT
            editFields.editBank.disabled = true;
            editFields.editInfo.disabled = false;

            // Style disabled fields
            [editFields.editNote, editFields.editBank].forEach((field) => {
                field.style.backgroundColor = "#f8f9fa";
                field.style.color = "#6c757d";
                field.style.cursor = "not-allowed";
            });

            // Style enabled fields
            [
                editFields.editDate,
                editFields.editAmount,
                editFields.editInfo,
            ].forEach((field) => {
                field.style.backgroundColor = "white";
                field.style.color = "#495057";
                field.style.cursor = "text";
            });

            this.notificationManager.info(
                "Bạn có thể chỉnh sửa ngày, số tiền và thông tin khách hàng",
                3000,
            );
        } else {
            // Can only edit customer info
            editFields.editDate.disabled = true;
            editFields.editNote.disabled = true;
            editFields.editAmount.disabled = true;
            editFields.editBank.disabled = true;
            editFields.editInfo.disabled = false;

            // Style disabled fields
            [
                editFields.editDate,
                editFields.editNote,
                editFields.editAmount,
                editFields.editBank,
            ].forEach((field) => {
                field.style.backgroundColor = "#f8f9fa";
                field.style.color = "#6c757d";
                field.style.cursor = "not-allowed";
            });

            // Style enabled field
            editFields.editInfo.style.backgroundColor = "white";
            editFields.editInfo.style.color = "#495057";
            editFields.editInfo.style.cursor = "text";

            this.notificationManager.info(
                "Bạn chỉ có thể chỉnh sửa thông tin khách hàng",
                3000,
            );
        }

        APP_STATE.editingRow = row;
        APP_STATE.editingTransaction = transaction;

        editModal.style.display = "block";

        setTimeout(() => {
            if (canEditAll) {
                editFields.editNote.focus();
            } else if (canEditDateAmountInfo) {
                editFields.editDate.focus();
            } else {
                editFields.editInfo.focus();
            }
        }, 100);

        console.log("Edit modal opened successfully");
    }

    async handleDeleteButton(e) {
        if (!this.hasPermission(0)) {
            this.notificationManager.error(
                "Không đủ quyền thực hiện chức năng này",
                3000,
                "Không đủ quyền",
            );
            return;
        }

        const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
        if (!confirmDelete) return;

        const row = e.target.closest("tr");
        const uniqueId = row.getAttribute("data-unique-id");

        if (!row || !uniqueId) {
            this.notificationManager.error(
                "Không tìm thấy ID giao dịch để xóa",
                3000,
            );
            return;
        }

        let notificationId = null;

        try {
            this.blockInteraction("delete");

            notificationId = this.notificationManager.deleting(
                "Đang xóa giao dịch...",
            );

            const oldData = this.extractRowData(row);

            this.updateNotification(notificationId, "Đang xóa từ Firebase...");
            await this.deleteFromFirebase(uniqueId, row);

            row.remove();
            this.removeFromState(uniqueId);

            if (this.filterManager) {
                this.filterManager.updateTotalAmount();
            }
            cacheManager.invalidate();

            this.logAction(
                "delete",
                `Xóa giao dịch: ${oldData.noteCell}`,
                oldData,
                null,
            );

            this.hideNotification(notificationId);
            this.notificationManager.success(
                "Đã xóa giao dịch thành công",
                2000,
                "Thành công",
            );
        } catch (error) {
            console.error("Error deleting transaction:", error);

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Lỗi khi xóa giao dịch: " + error.message,
                5000,
                "Lỗi",
            );
        } finally {
            this.unblockInteraction();
        }
    }

    closeModal() {
        const editModal = domManager.get(SELECTORS.editModal);
        if (editModal) {
            editModal.style.display = "none";
        }

        APP_STATE.editingRow = null;
        APP_STATE.editingTransaction = null;
    }

    async saveChanges() {
        if (APP_STATE.isOperationInProgress) {
            this.notificationManager.warning(
                "Có thao tác đang thực hiện, vui lòng đợi...",
                2000,
            );
            return;
        }

        if (!APP_STATE.editingRow || !APP_STATE.editingTransaction) {
            this.notificationManager.error(
                "Không tìm thấy giao dịch cần chỉnh sửa",
                3000,
            );
            return;
        }

        const editFields = {
            editDate: domManager.get(SELECTORS.editDate),
            editNote: domManager.get(SELECTORS.editNote),
            editAmount: domManager.get(SELECTORS.editAmount),
            editBank: domManager.get(SELECTORS.editBank),
            editInfo: domManager.get(SELECTORS.editInfo),
        };

        console.log("Starting save changes for transaction:", {
            uniqueId: APP_STATE.editingTransaction.uniqueId,
            formValues: {
                date: editFields.editDate?.value,
                note: editFields.editNote?.value,
                amount: editFields.editAmount?.value,
                bank: editFields.editBank?.value,
                info: editFields.editInfo?.value,
            },
        });

        const validation = this.validateEditForm(editFields);
        if (!validation.isValid) {
            this.notificationManager.error(
                validation.message,
                3000,
                "Dữ liệu không hợp lệ",
            );
            return;
        }

        let notificationId = null;

        try {
            this.blockInteraction("edit");

            notificationId = this.notificationManager.show(
                "Đang lưu thay đổi...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "save",
                    title: "Lưu",
                },
            );

            console.log("Validation passed, proceeding with edit...");

            await this.performEdit(editFields, validation.data);

            this.hideNotification(notificationId);
            this.notificationManager.success(
                "Đã lưu thay đổi thành công",
                2000,
                "Thành công",
            );

            console.log("Save changes completed successfully");

            this.closeModal();
        } catch (error) {
            console.error("Error saving changes:", error);

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Lỗi khi cập nhật dữ liệu: " + error.message,
                5000,
                "Lỗi",
            );
        } finally {
            this.unblockInteraction();
        }
    }

    validateEditForm(editFields) {
        const { editDate, editNote, editAmount, editBank, editInfo } =
            editFields;

        if (!editDate || !editNote || !editAmount || !editBank || !editInfo) {
            return {
                isValid: false,
                message: "Các trường nhập liệu không tồn tại",
            };
        }

        const dateValue = editDate.value.trim();
        const noteValue = sanitizeInput(editNote.value.trim());
        const amountValue = editAmount.value.trim();
        const bankValue = sanitizeInput(editBank.value.trim());
        const infoValue = sanitizeInput(editInfo.value.trim());

        console.log("Validating edit form:", {
            dateValue,
            noteValue,
            amountValue,
            bankValue,
            infoValue,
        });

        if (!isValidDateFormat(dateValue)) {
            return {
                isValid: false,
                message: "Nhập đúng định dạng ngày: DD-MM-YY",
            };
        }

        if (!noteValue || !amountValue || !bankValue) {
            return {
                isValid: false,
                message: "Vui lòng điền đầy đủ thông tin bắt buộc",
            };
        }

        const cleanAmount = amountValue.replace(/[,\.]/g, "");
        const numAmount = parseFloat(cleanAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return { isValid: false, message: "Số tiền không hợp lệ" };
        }

        console.log("Validation successful");

        return {
            isValid: true,
            data: {
                dateValue,
                noteValue,
                amountValue,
                bankValue,
                infoValue,
                numAmount,
            },
        };
    }

    async performEdit(editFields, validatedData) {
        const transaction = APP_STATE.editingTransaction;
        const uniqueId = transaction.uniqueId;

        console.log("=== PERFORMING EDIT ===");
        console.log("Transaction to edit:", {
            uniqueId: uniqueId,
            currentData: transaction,
        });

        let editDateTimestamp = transaction.dateCell;

        // Update date if user has permission and date was changed
        if (
            (this.hasPermission(1) || this.hasPermission(3)) &&
            validatedData.dateValue
        ) {
            const newTimestamp = convertToTimestamp(validatedData.dateValue);
            console.log("Date conversion:", {
                original: transaction.dateCell,
                newFormatted: validatedData.dateValue,
                newTimestamp: newTimestamp,
            });
            editDateTimestamp = newTimestamp;
        }

        // Load document from Firebase
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        console.log("Firebase data array length:", dataArray.length);

        // Find item index
        let itemIndex = dataArray.findIndex(
            (item) => item.uniqueId === uniqueId,
        );

        if (itemIndex === -1) {
            console.warn(
                "Item not found by uniqueId, trying dateCell fallback",
            );
            itemIndex = dataArray.findIndex(
                (item) => item.dateCell === transaction.dateCell,
            );
        }

        if (itemIndex === -1) {
            throw new Error("Transaction not found in Firebase");
        }

        console.log("Found item at index:", itemIndex);
        console.log("Original item:", dataArray[itemIndex]);

        const auth = this.getAuthState();
        const userInfo = auth
            ? auth.userType
                ? auth.userType.split("-")[0]
                : "Unknown"
            : "Unknown";

        // Update item based on permissions
        if (this.hasPermission(1)) {
            // Full edit permission - update all fields
            dataArray[itemIndex] = {
                ...dataArray[itemIndex],
                dateCell: editDateTimestamp,
                noteCell: validatedData.noteValue,
                amountCell: numberWithCommas(validatedData.numAmount),
                bankCell: validatedData.bankValue,
                customerInfoCell: validatedData.infoValue,
                user: userInfo,
            };
            console.log("Updated with full permissions");
        } else if (this.hasPermission(3)) {
            // FIXED: Có thể edit date, amount và customer info
            dataArray[itemIndex] = {
                ...dataArray[itemIndex],
                dateCell: editDateTimestamp,
                amountCell: numberWithCommas(validatedData.numAmount), // ✅ CẬP NHẬT AMOUNT
                customerInfoCell: validatedData.infoValue,
                user: userInfo,
            };
            console.log(
                "Updated with date, amount and customer info permissions",
            );
        } else {
            // Limited permission - only update customer info
            dataArray[itemIndex] = {
                ...dataArray[itemIndex],
                customerInfoCell: validatedData.infoValue,
                user: userInfo,
            };
            console.log(
                "Updated with limited permissions (customer info only)",
            );
        }

        console.log("Updated item:", dataArray[itemIndex]);

        // Save to Firebase
        await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: dataArray });
        console.log("Firebase update successful");

        // Update local data and UI
        this.updateRowAfterEdit(validatedData);
        this.updateStateAfterEdit(uniqueId, validatedData, editDateTimestamp);
        cacheManager.invalidate();

        // Log the action
        this.logAction(
            "edit",
            `Sửa giao dịch: ${validatedData.noteValue || transaction.noteCell}`,
            transaction,
            dataArray[itemIndex],
        );

        console.log("=== EDIT COMPLETED ===");
    }

    updateRowAfterEdit(validatedData) {
        const row = APP_STATE.editingRow;
        if (!row || !row.cells) {
            console.error("Cannot update row: row or cells not found");
            return;
        }

        console.log("Updating row display with validated data:", validatedData);

        if (this.hasPermission(1)) {
            // Full permissions - update all visible cells
            if (row.cells[0]) {
                row.cells[0].textContent = validatedData.dateValue;
                row.cells[0].id = convertToTimestamp(validatedData.dateValue);
            }
            if (row.cells[1])
                row.cells[1].textContent = validatedData.noteValue;
            if (row.cells[2])
                row.cells[2].textContent = numberWithCommas(
                    validatedData.numAmount,
                );
            if (row.cells[3])
                row.cells[3].textContent = validatedData.bankValue;
            if (row.cells[5])
                row.cells[5].textContent = validatedData.infoValue;

            console.log("Updated all cells (full permission)");
        } else if (this.hasPermission(3)) {
            // FIXED: Cập nhật date, amount và customer info
            if (row.cells[0]) {
                row.cells[0].textContent = validatedData.dateValue;
                row.cells[0].id = convertToTimestamp(validatedData.dateValue);
            }
            if (row.cells[2])
                row.cells[2].textContent = numberWithCommas(
                    validatedData.numAmount,
                ); // ✅ CẬP NHẬT AMOUNT
            if (row.cells[5])
                row.cells[5].textContent = validatedData.infoValue;

            console.log("Updated date, amount and customer info cells");
        } else {
            // Only update customer info
            if (row.cells[5])
                row.cells[5].textContent = validatedData.infoValue;

            console.log("Updated customer info cell only (limited permission)");
        }

        // Visual feedback
        row.style.transition = "background-color 0.3s ease";
        row.style.backgroundColor = "#d4edda";

        setTimeout(() => {
            row.style.backgroundColor = "";
        }, 2000);

        console.log("Row visual update completed");
    }

    updateStateAfterEdit(uniqueId, validatedData, editDateTimestamp = null) {
        console.log("Updating state for uniqueId:", uniqueId);

        let arrayDataUpdated = false;
        let filteredDataUpdated = false;

        const updateItem = (item) => {
            if (item.uniqueId === uniqueId) {
                if (this.hasPermission(1)) {
                    // Full edit - update all fields
                    if (editDateTimestamp) item.dateCell = editDateTimestamp;
                    item.noteCell = validatedData.noteValue;
                    item.amountCell = numberWithCommas(validatedData.numAmount);
                    item.bankCell = validatedData.bankValue;
                    item.customerInfoCell = validatedData.infoValue;
                } else if (this.hasPermission(3)) {
                    // FIXED: Cập nhật date, amount và customer info
                    if (editDateTimestamp) item.dateCell = editDateTimestamp;
                    item.amountCell = numberWithCommas(validatedData.numAmount); // ✅ CẬP NHẬT AMOUNT
                    item.customerInfoCell = validatedData.infoValue;
                } else {
                    // Only customer info
                    item.customerInfoCell = validatedData.infoValue;
                }

                console.log("Updated item in state:", {
                    uniqueId: item.uniqueId,
                    updated: item,
                });

                return true;
            }
            return false;
        };

        // Update arrayData
        APP_STATE.arrayData.forEach((item) => {
            if (updateItem(item)) {
                arrayDataUpdated = true;
            }
        });

        // Update filteredData
        APP_STATE.filteredData.forEach((item) => {
            if (updateItem(item)) {
                filteredDataUpdated = true;
            }
        });

        console.log("State update verification:", {
            arrayDataUpdated,
            filteredDataUpdated,
        });

        // Update total amount
        if (this.filterManager) {
            this.filterManager.updateTotalAmount();
        }

        console.log("State update completed");
    }

    // ===== EXPORT AND LOGOUT =====
    exportToExcel() {
        if (APP_STATE.isOperationInProgress) {
            this.notificationManager.warning(
                "Có thao tác đang thực hiện, vui lòng đợi...",
                2000,
            );
            return;
        }

        if (!this.hasPermission(1)) {
            this.notificationManager.error(
                "Không có quyền xuất dữ liệu",
                3000,
                "Không đủ quyền",
            );
            return;
        }

        let notificationId = null;

        try {
            this.blockInteraction("export");

            notificationId = this.notificationManager.show(
                "Đang chuẩn bị file Excel...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "file-spreadsheet",
                    title: "Xuất Excel",
                },
            );

            const wsData = [
                [
                    "Ngày",
                    "Ghi chú chuyển khoản",
                    "Số tiền chuyển",
                    "Ngân hàng",
                    "Đi đơn",
                    "Tên FB + SĐT",
                ],
            ];

            const tableRows = Array.from(domManager.getAll("#tableBody tr"));
            let exportedRowCount = 0;

            tableRows.forEach((row) => {
                if (
                    row.style.display !== "none" &&
                    row.cells &&
                    row.cells.length >= 6
                ) {
                    const rowData = [];
                    rowData.push(row.cells[0].textContent || "");
                    rowData.push(row.cells[1].textContent || "");
                    rowData.push(row.cells[2].textContent || "");
                    rowData.push(row.cells[3].textContent || "");

                    const checkbox = row.cells[4].querySelector(
                        'input[type="checkbox"]',
                    );
                    rowData.push(
                        checkbox && checkbox.checked
                            ? "Đã đi đơn"
                            : "Chưa đi đơn",
                    );
                    rowData.push(row.cells[5].textContent || "");

                    wsData.push(rowData);
                    exportedRowCount++;
                }
            });

            if (exportedRowCount === 0) {
                this.hideNotification(notificationId);
                this.notificationManager.warning(
                    "Không có dữ liệu để xuất ra Excel",
                    3000,
                );
                return;
            }

            if (typeof XLSX === "undefined") {
                this.hideNotification(notificationId);
                this.notificationManager.error(
                    "Thư viện Excel không khả dụng. Vui lòng tải lại trang",
                    5000,
                );
                return;
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu chuyển khoản");

            const fileName = `dulieu_${new Date().toISOString().split("T")[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            this.hideNotification(notificationId);
            this.notificationManager.success(
                `Đã xuất ${exportedRowCount} giao dịch ra file ${fileName}`,
                3000,
                "Xuất Excel thành công",
            );
        } catch (error) {
            console.error("Error exporting to Excel:", error);

            if (notificationId) {
                this.hideNotification(notificationId);
            }

            this.notificationManager.error(
                "Có lỗi xảy ra khi xuất dữ liệu ra Excel: " + error.message,
                5000,
                "Lỗi xuất Excel",
            );
        } finally {
            setTimeout(() => {
                this.unblockInteraction();
            }, 2000);
        }
    }

    handleLogout() {
        if (APP_STATE.isOperationInProgress) {
            this.notificationManager.warning(
                "Có thao tác đang thực hiện, vui lòng đợi trước khi đăng xuất...",
                3000,
            );
            return;
        }

        const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
        if (confirmLogout) {
            this.blockInteraction("logout");

            const notificationId = this.notificationManager.show(
                "Đang đăng xuất...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "log-out",
                    title: "Đăng xuất",
                },
            );

            setTimeout(() => {
                this.clearAuthState();
                cacheManager.invalidate();
                localStorage.clear();
                sessionStorage.clear();
                this.hideNotification(notificationId);
                window.location.href = "../index.html";
            }, 1000);
        }
    }

    clearAuthState() {
        try {
            localStorage.removeItem(CONFIG.data.AUTH_STORAGE_KEY);
            localStorage.removeItem("isLoggedIn");
            localStorage.removeItem("userType");
            localStorage.removeItem("checkLogin");
            sessionStorage.clear();
        } catch (error) {
            console.error("Error clearing auth state:", error);
        }
    }

    // ===== UTILITY METHODS =====
    /**
     * Check permission using detailedPermissions
     * Maps legacy levels to specific actions:
     * - Level 0: 'delete' permission (admin actions)
     * - Level 1: 'edit' permission (can edit all)
     * - Level 3: 'view' or 'verify' permission (basic access)
     */
    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth?.detailedPermissions?.['ck']) return false;

        const ckPerms = auth.detailedPermissions['ck'];

        // Map levels to detailedPermissions
        switch (requiredLevel) {
            case 0: // Admin level - needs delete permission
                return ckPerms['delete'] === true;
            case 1: // Higher permission - needs edit permission
                return ckPerms['edit'] === true;
            case 3: // Basic permission - needs view or verify
            default:
                return ckPerms['view'] === true || ckPerms['verify'] === true;
        }
    }

    extractRowData(row) {
        return {
            uniqueId: row.getAttribute("data-unique-id"),
            dateCell: row.querySelector("td").id,
            noteCell: row.cells[1].innerText,
            amountCell: row.cells[2].innerText,
            bankCell: row.cells[3].innerText,
            customerInfoCell: row.cells[5].innerText,
        };
    }

    removeFromState(uniqueId) {
        APP_STATE.arrayData = APP_STATE.arrayData.filter(
            (item) => item.uniqueId !== uniqueId,
        );
        APP_STATE.filteredData = APP_STATE.filteredData.filter(
            (item) => item.uniqueId !== uniqueId,
        );
    }

    async deleteFromFirebase(uniqueId, row) {
        const doc = await this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .get();
        if (!doc.exists) {
            throw new Error("Document does not exist");
        }

        const data = doc.data();
        const dataArray = data["data"] || [];

        const updatedArray = dataArray.filter(
            (item) => item.uniqueId !== uniqueId,
        );

        if (updatedArray.length === dataArray.length) {
            const updatedArrayFallback = dataArray.filter(
                (item) => item.dateCell !== row.querySelector("td").id,
            );
            return this.collectionRef
                .doc(CONFIG.data.COLLECTION_NAME)
                .update({ data: updatedArrayFallback });
        }

        return this.collectionRef
            .doc(CONFIG.data.COLLECTION_NAME)
            .update({ data: updatedArray });
    }

    logAction(
        action,
        description,
        oldData = null,
        newData = null,
        pageName = "Chuyển khoản",
    ) {
        const auth = this.getAuthState();
        const logEntry = {
            timestamp: new Date(),
            user: auth
                ? auth.userType
                    ? auth.userType.split("-")[0]
                    : "Unknown"
                : "Unknown",
            page: pageName,
            action: action,
            description: description,
            oldData: oldData,
            newData: newData,
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        };

        this.historyCollectionRef
            .add(logEntry)
            .then(() => {
                console.log("Log entry saved successfully");
            })
            .catch((error) => {
                console.error("Error saving log entry: ", error);
            });
    }

    blockInteraction(operationType) {
        APP_STATE.isOperationInProgress = true;
        APP_STATE.currentOperationType = operationType;

        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                input.disabled = true;
            });
        }

        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "none";
            tableBody.style.opacity = "0.7";
        }
    }

    unblockInteraction() {
        APP_STATE.isOperationInProgress = false;
        APP_STATE.currentOperationType = null;

        const moneyTransferForm = domManager.get(SELECTORS.moneyTransferForm);
        if (moneyTransferForm) {
            const inputs = moneyTransferForm.querySelectorAll(
                "input, select, button, textarea",
            );
            inputs.forEach((input) => {
                input.disabled = false;
            });
        }

        const tableBody = domManager.get(SELECTORS.tableBody);
        if (tableBody) {
            tableBody.style.pointerEvents = "auto";
            tableBody.style.opacity = "1";
        }
    }

    destroy() {
        if (this.virtualScrollManager) {
            this.virtualScrollManager.destroy();
        }
        if (this.filterManager) {
            this.filterManager.destroy();
        }

        performanceMonitor.metrics.clear();
        throttleManager.clearAll();
        cacheManager.invalidate();
        domManager.clearCache();

        Object.assign(APP_STATE, {
            arrayData: [],
            filteredData: [],
            isOperationInProgress: false,
            currentOperationType: null,
            editingRow: null,
        });

        this.isInitialized = false;
        console.log("MoneyTransferApp destroyed");
    }
}

// Global app instance
let moneyTransferApp = null;

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", async function () {
    try {
        console.log("DOM loaded, initializing app...");
        moneyTransferApp = new MoneyTransferApp();
        await moneyTransferApp.init();
        window.moneyTransferApp = moneyTransferApp;
        console.log(
            "Money Transfer Management System initialized successfully with FULL NOTIFICATIONS",
        );
    } catch (error) {
        console.error(
            "Failed to initialize Money Transfer Management System:",
            error,
        );

        // Fallback notification if NotificationManager not available
        if (window.NotificationManager) {
            const notificationManager = new NotificationManager();
            notificationManager.error(
                "Không thể khởi tạo ứng dụng. Vui lòng tải lại trang.",
                0,
                "Lỗi nghiêm trọng",
            );
        } else if (window.showError) {
            window.showError(
                "Không thể khởi tạo ứng dụng. Vui lòng tải lại trang.",
            );
        } else {
            alert("Không thể khởi tạo ứng dụng. Vui lòng tải lại trang.");
        }
    }
});

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);

    if (moneyTransferApp && APP_STATE.isOperationInProgress) {
        moneyTransferApp.unblockInteraction();
        if (moneyTransferApp.notificationManager) {
            moneyTransferApp.notificationManager.error(
                "Có lỗi xảy ra. Vui lòng tải lại trang.",
                5000,
                "Lỗi",
            );
        }
    }
});

// Handle page unload during operations
window.addEventListener("beforeunload", function (e) {
    if (APP_STATE.isOperationInProgress) {
        e.preventDefault();
        e.returnValue =
            "Có thao tác đang thực hiện. Bạn có chắc muốn rời khỏi trang?";
        return e.returnValue;
    }
});

// Export
if (typeof module !== "undefined" && module.exports) {
    module.exports = { MoneyTransferApp };
} else {
    window.MoneyTransferApp = MoneyTransferApp;
}
