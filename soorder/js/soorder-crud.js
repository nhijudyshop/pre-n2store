// =====================================================
// CRUD OPERATIONS
// File: soorder-crud.js
// =====================================================

window.SoOrderCRUD = {
    // =====================================================
    // LOAD DAY DATA
    // =====================================================

    async loadDayData(dateString, mode = null) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const collectionRef = currentMode === 'returns'
            ? config.returnLogsCollectionRef
            : config.orderLogsCollectionRef;

        utils.showLoading(true, currentMode);

        try {
            // Get document for this day
            const docRef = collectionRef.doc(dateString);
            const doc = await docRef.get();

            const dayData = doc.exists ? doc.data() : {
                date: dateString,
                isHoliday: false,
                orders: [],
            };

            // Store in appropriate state property
            if (currentMode === 'returns') {
                state.currentReturnDayData = dayData;
            } else {
                state.currentDayData = dayData;
            }

            // Render UI
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);

            utils.showLoading(false, currentMode);
        } catch (error) {
            utils.showLoading(false, currentMode);
            console.error("Error loading day data:", error);
            utils.showToast("Lỗi khi tải dữ liệu: " + error.message, "error");
        }
    },

    // =====================================================
    // SAVE DAY DATA
    // =====================================================

    async saveDayData(mode = null) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const collectionRef = currentMode === 'returns'
            ? config.returnLogsCollectionRef
            : config.orderLogsCollectionRef;
        const dayData = currentMode === 'returns'
            ? state.currentReturnDayData
            : state.currentDayData;

        try {
            const dateString = state.currentDateString;
            const docRef = collectionRef.doc(dateString);

            await docRef.set(dayData);

            return true;
        } catch (error) {
            console.error("Error saving day data:", error);
            utils.showToast("Lỗi khi lưu dữ liệu: " + error.message, "error");
            return false;
        }
    },

    // =====================================================
    // ADD ORDER
    // =====================================================

    async addOrder(orderData, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        // Validate
        if (!utils.validateOrder(orderData)) {
            return false;
        }

        // Get appropriate day data
        let dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Initialize if null
        if (!dayData) {
            dayData = {
                date: state.currentDateString,
                isHoliday: false,
                orders: [],
            };
            if (isReturns) {
                state.currentReturnDayData = dayData;
            } else {
                state.currentDayData = dayData;
            }
        }

        // Create new order
        const newOrder = {
            id: utils.generateUUID(),
            supplier: orderData.supplier.trim(),
            amount: Number(orderData.amount) || 0,
            isPaid: false,
            difference: Number(orderData.difference) || 0,
            note: orderData.note || "",
            performer: orderData.performer || "",
            isReconciled: orderData.isReconciled || false,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
        };

        // Add to current day data
        if (!dayData.orders) {
            dayData.orders = [];
        }
        dayData.orders.push(newOrder);

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Đã thêm ${label} thành công`, "success");
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE ORDER
    // =====================================================

    async updateOrder(orderId, updatedData, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Validate
        if (!utils.validateOrder(updatedData)) {
            return false;
        }

        // Check if dayData exists
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find and update order
        const orderIndex = dayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Update order data
        const existingOrder = dayData.orders[orderIndex];
        dayData.orders[orderIndex] = {
            ...existingOrder,
            supplier: updatedData.supplier.trim(),
            amount: Number(updatedData.amount) || 0,
            difference: Number(updatedData.difference) || 0,
            note: updatedData.note || "",
            performer: updatedData.performer || "",
            isReconciled: updatedData.isReconciled || false,
            updatedAt: firebase.firestore.Timestamp.now(),
        };

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Đã cập nhật ${label} thành công`, "success");
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // DELETE ORDER
    // =====================================================

    async deleteOrder(orderId, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Check if dayData exists
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const orderIndex = dayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Remove order
        dayData.orders.splice(orderIndex, 1);

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Đã xóa ${label} thành công`, "success");
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE PAID STATUS
    // =====================================================

    async togglePaidStatus(orderId, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Check if dayData exists
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = dayData.orders.find((o) => o.id === orderId);

        if (!order) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Toggle paid status
        order.isPaid = !order.isPaid;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE RECONCILED STATUS
    // =====================================================

    async toggleReconciledStatus(orderId, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Check if dayData exists
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = dayData.orders.find((o) => o.id === orderId);

        if (!order) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Toggle reconciled status
        order.isReconciled = !order.isReconciled;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE ORDER FIELD
    // =====================================================

    async updateOrderField(orderId, fieldName, value, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Check if dayData exists
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = dayData.orders.find((o) => o.id === orderId);

        if (!order) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Update field
        order[fieldName] = value;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE DIFFERENCE RESOLVED STATUS
    // =====================================================

    async updateDifferenceResolved(orderId, resolved, note, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;
        const config = window.SoOrderConfig;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const collectionRef = isReturns
            ? config.returnLogsCollectionRef
            : config.orderLogsCollectionRef;
        const rangeData = isReturns ? state.returnsRangeData : state.rangeData;
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        // Handle range mode - find order in rangeData
        if (state.isRangeMode && rangeData && rangeData.length > 0) {
            // Find the day and order in rangeData
            let foundDayData = null;
            let foundOrder = null;

            for (const data of rangeData) {
                if (data.orders) {
                    const order = data.orders.find((o) => o.id === orderId);
                    if (order) {
                        foundDayData = data;
                        foundOrder = order;
                        break;
                    }
                }
            }

            if (!foundOrder || !foundDayData) {
                const label = isReturns ? "đơn trả hàng" : "đơn hàng";
                utils.showToast(`Không tìm thấy ${label}`, "error");
                return false;
            }

            // Update the order
            foundOrder.differenceResolved = resolved;
            foundOrder.differenceNote = note;
            foundOrder.updatedAt = firebase.firestore.Timestamp.now();

            // Save to Firebase for the specific day
            try {
                const docRef = collectionRef.doc(foundDayData.date);
                await docRef.set(foundDayData);

                // Re-render
                window.SoOrderUI.renderTable(currentMode);
                window.SoOrderUI.updateFooterSummary(currentMode);
                return true;
            } catch (error) {
                console.error("Error saving day data:", error);
                utils.showToast("Lỗi khi lưu dữ liệu: " + error.message, "error");
                return false;
            }
        }

        // Handle single day mode
        if (!dayData || !dayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = dayData.orders.find((o) => o.id === orderId);

        if (!order) {
            const label = isReturns ? "đơn trả hàng" : "đơn hàng";
            utils.showToast(`Không tìm thấy ${label}`, "error");
            return false;
        }

        // Update difference resolved status and note
        order.differenceResolved = resolved;
        order.differenceNote = note;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData(currentMode);

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.toggleHolidayColumnsVisibility(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);
            return true;
        }

        return false;
    },

    // =====================================================
    // HOLIDAY MANAGEMENT
    // =====================================================

    async toggleHoliday(dateString, isHoliday) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        try {
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            let dayData;
            if (doc.exists) {
                dayData = doc.data();
            } else {
                dayData = {
                    date: dateString,
                    isHoliday: false,
                    orders: [],
                };
            }

            // Update holiday status
            dayData.isHoliday = isHoliday;

            // Save to Firebase
            await docRef.set(dayData);

            // If this is the current day, update state
            if (dateString === state.currentDateString) {
                state.currentDayData.isHoliday = isHoliday;
                window.SoOrderUI.toggleHolidayColumnsVisibility();
            }

            utils.showToast(
                isHoliday
                    ? "Đã đánh dấu là ngày nghỉ"
                    : "Đã bỏ đánh dấu ngày nghỉ",
                "success"
            );

            return true;
        } catch (error) {
            console.error("Error toggling holiday:", error);
            utils.showToast("Lỗi khi cập nhật ngày nghỉ: " + error.message, "error");
            return false;
        }
    },

    // Check if a date is holiday
    async checkIsHoliday(dateString) {
        const config = window.SoOrderConfig;

        try {
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            if (doc.exists) {
                return doc.data().isHoliday || false;
            }
            return false;
        } catch (error) {
            console.error("Error checking holiday:", error);
            return false;
        }
    },

    // =====================================================
    // LOAD DATE RANGE DATA
    // =====================================================

    async loadDateRangeData(startDateStr, endDateStr, mode = null) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const collectionRef = isReturns
            ? config.returnLogsCollectionRef
            : config.orderLogsCollectionRef;

        utils.showLoading(true, currentMode);

        try {
            // Parse dates
            const startDate = utils.parseDate(startDateStr);
            const endDate = utils.parseDate(endDateStr);

            // Generate array of dates in range
            const dateStrings = [];
            const currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                dateStrings.push(utils.formatDate(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Load all documents in PARALLEL using Promise.all
            const promises = dateStrings.map(dateString => {
                const docRef = collectionRef.doc(dateString);
                return docRef.get();
            });

            const docs = await Promise.all(promises);

            // Process results
            const rangeData = docs.map((doc, index) => {
                if (doc.exists) {
                    return doc.data();
                } else {
                    return {
                        date: dateStrings[index],
                        isHoliday: false,
                        orders: [],
                    };
                }
            });

            // Update state
            state.isRangeMode = true;
            state.rangeStartDate = startDateStr;
            state.rangeEndDate = endDateStr;
            if (isReturns) {
                state.returnsRangeData = rangeData;
            } else {
                state.rangeData = rangeData;
            }

            // Update date selector display
            const elements = window.SoOrderElements;
            const dateSelector = isReturns
                ? document.getElementById('returnDateSelector')
                : elements.dateSelector;

            if (dateSelector) {
                const today = new Date();
                const todayStr = utils.formatDate(today);
                const numDays = dateStrings.length;

                // Update the first option text to show range
                const currentOption = dateSelector.querySelector('option[value="current"]');
                if (currentOption) {
                    const startDateObj = utils.parseDate(startDateStr);
                    const endDateObj = utils.parseDate(endDateStr);
                    const startDisplay = utils.formatDateDisplay(startDateObj);
                    const endDisplay = utils.formatDateDisplay(endDateObj);
                    currentOption.textContent = `${startDisplay} - ${endDisplay}`;
                }

                // Set the correct dropdown value based on range
                if (endDateStr === todayStr) {
                    if (numDays === 3) {
                        dateSelector.value = "3days";
                    } else if (numDays === 7) {
                        dateSelector.value = "7days";
                    } else if (numDays === 10) {
                        dateSelector.value = "10days";
                    } else {
                        dateSelector.value = "current";
                    }
                } else {
                    dateSelector.value = "current";
                }
            }

            // Render UI
            window.SoOrderUI.renderTable(currentMode);
            window.SoOrderUI.updateFooterSummary(currentMode);

            utils.showLoading(false, currentMode);
        } catch (error) {
            utils.showLoading(false, currentMode);
            console.error("Error loading date range data:", error);
            utils.showToast("Lỗi khi tải dữ liệu: " + error.message, "error");
        }
    },

    // =====================================================
    // NCC NAMES MANAGEMENT
    // =====================================================

    // Load all NCC names from Firebase
    async loadNCCNames() {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;

        try {
            const snapshot = await config.nccNamesCollectionRef.get();
            state.nccNames = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                // data.tposCode là mã gốc từ TPOS
                // doc.id là mã đã sanitized (dùng làm document ID)
                state.nccNames.push({
                    code: data.axCode || doc.id.toUpperCase(), // Dùng axCode nếu có
                    tposCode: data.tposCode || doc.id, // Mã TPOS gốc
                    tposId: data.tposId || null, // TPOS Partner Id (số nguyên)
                    docId: doc.id, // Document ID (sanitized)
                    name: data.name,
                });
            });

            // Sort by NCC code: letter first, then number (A1, A2, ..., B1, B9, ...)
            state.nccNames.sort((a, b) => {
                const aIsCode = /^[A-Z]\d+$/i.test(a.code);
                const bIsCode = /^[A-Z]\d+$/i.test(b.code);

                if (aIsCode && bIsCode) {
                    const letterA = a.code.charAt(0).toUpperCase();
                    const letterB = b.code.charAt(0).toUpperCase();
                    if (letterA !== letterB) return letterA.localeCompare(letterB);
                    const numA = parseInt(a.code.replace(/^[A-Z]/i, "")) || 0;
                    const numB = parseInt(b.code.replace(/^[A-Z]/i, "")) || 0;
                    return numA - numB;
                }
                if (aIsCode) return -1; // NCC codes first
                if (bIsCode) return 1;
                return a.name.localeCompare(b.name);
            });

            return state.nccNames;
        } catch (error) {
            console.error("Error loading NCC names:", error);
            return [];
        }
    },

    // Save a new NCC name to Firebase
    // Returns: { success: boolean, conflict: boolean, existingName: string|null }
    async saveNCCName(supplierName) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Extract Ax code from name
        const code = this.parseNCCCode(supplierName);
        if (!code) {
            // No valid Ax code, don't save
            return { success: false, conflict: false, existingName: null };
        }

        const trimmedName = supplierName.trim();
        const docId = code.toUpperCase();

        // Check if code already exists with different name
        const existing = state.nccNames.find(
            (n) => n.code.toUpperCase() === docId
        );

        if (existing && existing.name !== trimmedName) {
            // Conflict detected
            return { success: false, conflict: true, existingName: existing.name };
        }

        if (existing && existing.name === trimmedName) {
            // Already exists with same name, no action needed
            return { success: true, conflict: false, existingName: null };
        }

        // Save new NCC name - consistent data structure
        try {
            const docRef = config.nccNamesCollectionRef.doc(docId);
            await docRef.set({
                name: trimmedName,
                axCode: docId,
                tposCode: docId // Manual entries use axCode as tposCode
            });

            // Update state
            state.nccNames.push({
                code: docId,
                tposCode: docId,
                docId: docId,
                name: trimmedName
            });
            state.nccNames.sort((a, b) => {
                const numA = parseInt(a.code.replace(/^A/i, "")) || 0;
                const numB = parseInt(b.code.replace(/^A/i, "")) || 0;
                return numA - numB;
            });

            return { success: true, conflict: false, existingName: null };
        } catch (error) {
            console.error("Error saving NCC name:", error);
            utils.showToast("Lỗi khi lưu tên NCC: " + error.message, "error");
            return { success: false, conflict: false, existingName: null };
        }
    },

    // Update an existing NCC name
    async updateNCCName(code, newName) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        const docId = code.toUpperCase();
        const trimmedName = newName.trim();
        const newAxCode = this.parseNCCCode(trimmedName);

        try {
            const docRef = config.nccNamesCollectionRef.doc(docId);
            await docRef.set({
                name: trimmedName,
                axCode: newAxCode || docId,
                tposCode: docId
            });

            // Update state
            const existing = state.nccNames.find(
                (n) => n.code.toUpperCase() === docId
            );
            if (existing) {
                existing.name = trimmedName;
            }

            return true;
        } catch (error) {
            console.error("Error updating NCC name:", error);
            utils.showToast("Lỗi khi cập nhật tên NCC: " + error.message, "error");
            return false;
        }
    },

    // Delete an NCC name
    async deleteNCCName(code) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        try {
            const docRef = config.nccNamesCollectionRef.doc(code.toUpperCase());
            await docRef.delete();

            // Update state
            state.nccNames = state.nccNames.filter(
                (n) => n.code.toUpperCase() !== code.toUpperCase()
            );

            utils.showToast("Đã xóa tên NCC", "success");
            return true;
        } catch (error) {
            console.error("Error deleting NCC name:", error);
            utils.showToast("Lỗi khi xóa tên NCC: " + error.message, "error");
            return false;
        }
    },

    // Parse NCC code from supplier name (e.g., "A1 Tên gợi nhớ" => "A1", "B9 DIỂM MY" => "B9")
    parseNCCCode(supplierName) {
        if (!supplierName) return null;
        const match = supplierName.trim().match(/^([A-Z]\d+)/i);
        return match ? match[1].toUpperCase() : null;
    },

    // Check if there's a conflict with existing NCC names
    checkNCCConflict(supplierName) {
        const state = window.SoOrderState;
        const code = this.parseNCCCode(supplierName);

        if (!code) return null;

        const trimmedName = supplierName.trim();
        const existing = state.nccNames.find(
            (n) => n.code.toUpperCase() === code.toUpperCase()
        );

        if (existing && existing.name !== trimmedName) {
            return existing.name;
        }

        return null;
    },
};
