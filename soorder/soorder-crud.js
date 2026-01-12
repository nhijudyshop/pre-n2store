// =====================================================
// CRUD OPERATIONS
// File: soorder-crud.js
// =====================================================

window.SoOrderCRUD = {
    // =====================================================
    // LOAD DAY DATA
    // =====================================================

    async loadDayData(dateString) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        utils.showLoading(true);

        try {
            // Get document for this day
            const docRef = config.orderLogsCollectionRef.doc(dateString);
            const doc = await docRef.get();

            if (doc.exists) {
                state.currentDayData = doc.data();
            } else {
                // Initialize empty day data
                state.currentDayData = {
                    date: dateString,
                    isHoliday: false,
                    orders: [],
                };
            }

            // Render UI
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();

            utils.showLoading(false);
        } catch (error) {
            utils.showLoading(false);
            console.error("Error loading day data:", error);
            utils.showToast("Lỗi khi tải dữ liệu: " + error.message, "error");
        }
    },

    // =====================================================
    // SAVE DAY DATA
    // =====================================================

    async saveDayData() {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        try {
            const dateString = state.currentDateString;
            const docRef = config.orderLogsCollectionRef.doc(dateString);

            await docRef.set(state.currentDayData);

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

    async addOrder(orderData) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Validate
        if (!utils.validateOrder(orderData)) {
            return false;
        }

        // Initialize currentDayData if null
        if (!state.currentDayData) {
            state.currentDayData = {
                date: state.currentDateString,
                isHoliday: false,
                orders: [],
            };
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
        if (!state.currentDayData.orders) {
            state.currentDayData.orders = [];
        }
        state.currentDayData.orders.push(newOrder);

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã thêm đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE ORDER
    // =====================================================

    async updateOrder(orderId, updatedData) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Validate
        if (!utils.validateOrder(updatedData)) {
            return false;
        }

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find and update order
        const orderIndex = state.currentDayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Update order data
        const existingOrder = state.currentDayData.orders[orderIndex];
        state.currentDayData.orders[orderIndex] = {
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
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã cập nhật đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // DELETE ORDER
    // =====================================================

    async deleteOrder(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const orderIndex = state.currentDayData.orders.findIndex(
            (o) => o.id === orderId
        );

        if (orderIndex === -1) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Remove order
        state.currentDayData.orders.splice(orderIndex, 1);

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            utils.showToast("Đã xóa đơn hàng thành công", "success");
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE PAID STATUS
    // =====================================================

    async togglePaidStatus(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Toggle paid status
        order.isPaid = !order.isPaid;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // TOGGLE RECONCILED STATUS
    // =====================================================

    async toggleReconciledStatus(orderId) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Toggle reconciled status
        order.isReconciled = !order.isReconciled;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE ORDER FIELD
    // =====================================================

    async updateOrderField(orderId, fieldName, value) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Check if currentDayData exists
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Update field
        order[fieldName] = value;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            return true;
        }

        return false;
    },

    // =====================================================
    // UPDATE DIFFERENCE RESOLVED STATUS
    // =====================================================

    async updateDifferenceResolved(orderId, resolved, note) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;
        const config = window.SoOrderConfig;

        // Handle range mode - find order in rangeData
        if (state.isRangeMode && state.rangeData && state.rangeData.length > 0) {
            // Find the day and order in rangeData
            let foundDayData = null;
            let foundOrder = null;

            for (const dayData of state.rangeData) {
                if (dayData.orders) {
                    const order = dayData.orders.find((o) => o.id === orderId);
                    if (order) {
                        foundDayData = dayData;
                        foundOrder = order;
                        break;
                    }
                }
            }

            if (!foundOrder || !foundDayData) {
                utils.showToast("Không tìm thấy đơn hàng", "error");
                return false;
            }

            // Update the order
            foundOrder.differenceResolved = resolved;
            foundOrder.differenceNote = note;
            foundOrder.updatedAt = firebase.firestore.Timestamp.now();

            // Save to Firebase for the specific day
            try {
                const docRef = config.orderLogsCollectionRef.doc(foundDayData.date);
                await docRef.set(foundDayData);

                // Re-render
                window.SoOrderUI.renderTable();
                window.SoOrderUI.updateFooterSummary();
                return true;
            } catch (error) {
                console.error("Error saving day data:", error);
                utils.showToast("Lỗi khi lưu dữ liệu: " + error.message, "error");
                return false;
            }
        }

        // Handle single day mode
        if (!state.currentDayData || !state.currentDayData.orders) {
            utils.showToast("Không tìm thấy dữ liệu ngày", "error");
            return false;
        }

        // Find order
        const order = state.currentDayData.orders.find((o) => o.id === orderId);

        if (!order) {
            utils.showToast("Không tìm thấy đơn hàng", "error");
            return false;
        }

        // Update difference resolved status and note
        order.differenceResolved = resolved;
        order.differenceNote = note;
        order.updatedAt = firebase.firestore.Timestamp.now();

        // Save to Firebase
        const success = await this.saveDayData();

        if (success) {
            // Re-render
            window.SoOrderUI.renderTable();
            window.SoOrderUI.toggleHolidayColumnsVisibility();
            window.SoOrderUI.updateFooterSummary();
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

    async loadDateRangeData(startDateStr, endDateStr) {
        const config = window.SoOrderConfig;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        utils.showLoading(true);

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
                const docRef = config.orderLogsCollectionRef.doc(dateString);
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
            state.rangeData = rangeData;

            // Update date selector display
            const elements = window.SoOrderElements;
            if (elements.dateSelector) {
                const today = new Date();
                const todayStr = utils.formatDate(today);
                const numDays = dateStrings.length;

                // Update the first option text to show range
                const currentOption = elements.dateSelector.querySelector('option[value="current"]');
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
                        elements.dateSelector.value = "3days";
                    } else if (numDays === 7) {
                        elements.dateSelector.value = "7days";
                    } else if (numDays === 10) {
                        elements.dateSelector.value = "10days";
                    } else {
                        elements.dateSelector.value = "current";
                    }
                } else {
                    elements.dateSelector.value = "current";
                }
            }

            // Render UI
            window.SoOrderUI.renderTable();
            window.SoOrderUI.updateFooterSummary();

            utils.showLoading(false);
        } catch (error) {
            utils.showLoading(false);
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
                    docId: doc.id, // Document ID (sanitized)
                    name: data.name,
                });
            });

            // Sort by Ax code number (nếu là Ax code), sau đó theo tên
            state.nccNames.sort((a, b) => {
                const aIsAx = /^A\d+$/i.test(a.code);
                const bIsAx = /^A\d+$/i.test(b.code);

                if (aIsAx && bIsAx) {
                    const numA = parseInt(a.code.replace(/^A/i, "")) || 0;
                    const numB = parseInt(b.code.replace(/^A/i, "")) || 0;
                    return numA - numB;
                }
                if (aIsAx) return -1; // Ax codes first
                if (bIsAx) return 1;
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

    // Parse Ax code from supplier name (e.g., "A1 Tên gợi nhớ" => "A1")
    parseNCCCode(supplierName) {
        if (!supplierName) return null;
        const match = supplierName.trim().match(/^(A\d+)/i);
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
