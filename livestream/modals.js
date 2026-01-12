// =====================================================
// MODAL MANAGEMENT SYSTEM - Fixed Stack Overflow
// =====================================================

// Close Modal Function
function closeModal() {
    const editModal = document.getElementById("editModal");
    if (editModal) {
        editModal.style.display = "none";
    }
    editingRow = null;
    window.editingContext = null;
}

// Clear all edit modal fields
function clearEditModalFields() {
    const allInputs = [
        "editDate",
        "editTienQC_morning",
        "editMorning_start_time",
        "editMorning_end_time",
        "editSoMonLive_morning",
        "editTienQC_evening",
        "editEvening_start_time",
        "editEvening_end_time",
        "editSoMonLive_evening",
        "editSoMonInbox",
    ];

    allInputs.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = "";
            input.disabled = false;
            input.readOnly = false;
            input.style.backgroundColor = "white";
        }
    });
}

// Handle Edit Button Click
function handleEditButton(e) {
    const editModal = document.getElementById("editModal");
    if (!editModal) return;

    const row = e.target.closest("tr");
    const reportId = row.getAttribute("data-report-id");

    if (!reportId) {
        if (globalNotificationManager) {
            globalNotificationManager.error("Không tìm thấy ID báo cáo", 3000);
        }
        return;
    }

    // Find the clicked report from arrayData
    const clickedReport = arrayData.find((item) => item.id === reportId);

    if (!clickedReport) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy dữ liệu báo cáo",
                3000,
            );
        }
        return;
    }

    // Get period of clicked report
    const clickedPeriod = getTimePeriodFromData(clickedReport);

    // Find date cell
    let dateCell = row.querySelector("[data-id]");
    if (!dateCell) {
        let currentRow = row.previousElementSibling;
        while (currentRow && !dateCell) {
            dateCell = currentRow.querySelector("[data-id]");
            currentRow = currentRow.previousElementSibling;
        }
    }

    if (!dateCell) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy thông tin ngày",
                3000,
            );
        }
        return;
    }

    const currentDate = dateCell.innerText.trim();

    // Get all reports for this date from arrayData
    const reportsForDate = arrayData.filter((item) => {
        const itemDate = formatDate(new Date(parseInt(item.dateCell)));
        return itemDate === currentDate;
    });

    // Separate reports by period
    const morningReport = reportsForDate.find(
        (r) => getTimePeriodFromData(r) === "Sáng",
    );
    const eveningReport = reportsForDate.find(
        (r) => getTimePeriodFromData(r) === "Chiều",
    );

    // Get auth state for permissions
    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Check permissions for morning session
    if (clickedPeriod === "Sáng" && !hasPermission(0)) {
        if (globalNotificationManager) {
            globalNotificationManager.warning(
                "Bạn không có quyền chỉnh sửa phiên Sáng",
                3000,
                "Từ chối truy cập",
            );
        }
        return;
    }

    // Clear all fields first
    clearEditModalFields();

    // Set date
    const editDate = document.getElementById("editDate");
    if (editDate && currentDate) {
        const parts = currentDate.split("-");
        if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            let year = parseInt(parts[2]);
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            editDate.value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    // Populate fields
    if (morningReport) {
        populateSessionFields("morning", morningReport);
    }

    if (eveningReport) {
        populateSessionFields("evening", eveningReport);
    }

    // Populate inbox
    const editSoMonInbox = document.getElementById("editSoMonInbox");
    if (editSoMonInbox) {
        if (eveningReport && eveningReport.soMonInbox) {
            const cleanInbox = eveningReport.soMonInbox
                .toString()
                .replace(" món", "")
                .trim();
            editSoMonInbox.value = cleanInbox || "0";
        } else {
            editSoMonInbox.value = "0";
        }
    }

    // Apply permissions
    applyEditModalPermissions(userLevel);

    // Store editing context
    editingRow = row;
    window.editingContext = {
        dateCell: dateCell,
        morningReport: morningReport,
        eveningReport: eveningReport,
        currentDate: currentDate,
        clickedPeriod: clickedPeriod,
        clickedReport: clickedReport,
    };

    // Show modal
    editModal.style.display = "flex";

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    console.log(
        `[EDIT] Opening modal for ${clickedPeriod} session on ${currentDate}`,
    );
}

// Populate session fields
function populateSessionFields(session, reportData) {
    const prefix = session === "morning" ? "Morning" : "Evening";

    const tienQCInput = document.getElementById(`editTienQC_${session}`);
    const startTimeInput = document.getElementById(`edit${prefix}_start_time`);
    const endTimeInput = document.getElementById(`edit${prefix}_end_time`);
    const soMonLiveInput = document.getElementById(`editSoMonLive_${session}`);

    if (reportData) {
        if (tienQCInput) {
            tienQCInput.value = reportData.tienQC || "";
        }

        if (reportData.thoiGian) {
            const timePattern =
                /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m/;
            const match = reportData.thoiGian.match(timePattern);

            if (match) {
                const [, startHour, startMin, endHour, endMin] = match;
                if (startTimeInput) {
                    startTimeInput.value = `${startHour.padStart(2, "0")}:${startMin.padStart(2, "0")}`;
                }
                if (endTimeInput) {
                    endTimeInput.value = `${endHour.padStart(2, "0")}:${endMin.padStart(2, "0")}`;
                }
            }
        }

        if (soMonLiveInput && reportData.soMonLive) {
            const cleanSoMon = reportData.soMonLive
                .toString()
                .replace(" món", "")
                .trim();
            soMonLiveInput.value = cleanSoMon || "0";
        }
    } else {
        if (tienQCInput) tienQCInput.value = "";
        if (startTimeInput) startTimeInput.value = "";
        if (endTimeInput) endTimeInput.value = "";
        if (soMonLiveInput) soMonLiveInput.value = "";
    }
}

// Apply edit modal permissions
function applyEditModalPermissions(userLevel) {
    const allInputs = [
        "editDate",
        "editTienQC_morning",
        "editMorning_start_time",
        "editMorning_end_time",
        "editSoMonLive_morning",
        "editTienQC_evening",
        "editEvening_start_time",
        "editEvening_end_time",
        "editSoMonLive_evening",
        "editSoMonInbox",
    ];

    if (userLevel <= 1) {
        allInputs.forEach((id) => {
            const input = document.getElementById(id);
            if (input) {
                input.disabled = false;
                input.readOnly = false;
                input.style.backgroundColor = "white";
            }
        });
    } else if (userLevel === 2) {
        allInputs.forEach((id) => {
            const input = document.getElementById(id);
            if (input) {
                if (id === "editSoMonInbox") {
                    input.disabled = false;
                    input.readOnly = false;
                    input.style.backgroundColor = "white";
                } else {
                    input.readOnly = true;
                    input.style.backgroundColor = "#f8f9fa";
                }
            }
        });
    } else {
        allInputs.forEach((id) => {
            const input = document.getElementById(id);
            if (input) {
                input.disabled = true;
                input.style.backgroundColor = "#f8f9fa";
            }
        });
    }
}

// Collect edit session data
function collectEditSessionData(session, existingReport) {
    const tienQCInput = document.getElementById(`editTienQC_${session}`);
    const startTimeInput = document.getElementById(
        `edit${session === "morning" ? "Morning" : "Evening"}_start_time`,
    );
    const endTimeInput = document.getElementById(
        `edit${session === "morning" ? "Morning" : "Evening"}_end_time`,
    );
    const soMonLiveInput = document.getElementById(`editSoMonLive_${session}`);

    const tienQC = tienQCInput ? tienQCInput.value.trim() : "";
    const startTime = startTimeInput ? startTimeInput.value : "";
    const endTime = endTimeInput ? endTimeInput.value : "";
    const soMonLive = soMonLiveInput ? soMonLiveInput.value.trim() : "";

    if (!tienQC && !startTime && !endTime && !soMonLive) {
        return null;
    }

    const cleanAmount = tienQC.replace(/[,\.]/g, "");
    const numAmount = parseFloat(cleanAmount);

    if (isNaN(numAmount) || numAmount < 0) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Tiền QC phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
                3000,
            );
        }
        return null;
    }

    if (!startTime || !endTime) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Vui lòng nhập đầy đủ thời gian cho phiên ${session === "morning" ? "Sáng" : "Chiều"}`,
                3000,
            );
        }
        return null;
    }

    const thoiGian = formatTimeRange(startTime, endTime);
    if (!thoiGian) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Thời gian phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
                3000,
            );
        }
        return null;
    }

    if (!soMonLive || isNaN(soMonLive) || parseInt(soMonLive) < 0) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Số món live phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
                3000,
            );
        }
        return null;
    }

    return {
        tienQC: numberWithCommas(numAmount),
        thoiGian: thoiGian,
        soMonLive: parseInt(soMonLive) + " món",
        soMonInbox: existingReport ? existingReport.soMonInbox : "",
    };
}

// FIXED: Create clean data objects without circular references
function createCleanReportData(reportData) {
    // Only copy necessary fields, avoiding any potential circular references
    return {
        id: reportData.id,
        dateCell: reportData.dateCell,
        tienQC: reportData.tienQC,
        thoiGian: reportData.thoiGian,
        soMonLive: reportData.soMonLive,
        soMonInbox: reportData.soMonInbox || "",
        user: reportData.user,
        createdBy: reportData.createdBy,
        createdAt: reportData.createdAt,
        editHistory: Array.isArray(reportData.editHistory)
            ? [...reportData.editHistory]
            : [],
    };
}

// Save updated changes - FIXED to prevent stack overflow
function saveUpdatedChanges() {
    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    if (!window.editingContext) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy thông tin chỉnh sửa",
                3000,
            );
        }
        return;
    }

    const { morningReport, eveningReport } = window.editingContext;

    const morningData = collectEditSessionData("morning", morningReport);
    const eveningData = collectEditSessionData("evening", eveningReport);

    const editSoMonInbox = document.getElementById("editSoMonInbox");
    const inboxValue = editSoMonInbox ? parseInt(editSoMonInbox.value) || 0 : 0;

    if (userLevel <= 1) {
        if (!morningData && !eveningData) {
            if (globalNotificationManager) {
                globalNotificationManager.warning(
                    "Vui lòng nhập dữ liệu cho ít nhất một phiên",
                    3000,
                );
            }
            return;
        }
    }

    if (globalNotificationManager) {
        globalNotificationManager.saving("Đang lưu thay đổi...");
    }

    const updates = [];
    const currentUser = auth.userType ? auth.userType.split("-")[0] : "Unknown";

    // Morning session update
    if (morningReport && morningData) {
        const cleanOldData = createCleanReportData(morningReport);
        const cleanNewData = createCleanReportData({
            ...morningReport,
            ...morningData,
        });

        updates.push({
            id: morningReport.id,
            oldData: cleanOldData,
            newData: cleanNewData,
        });
    } else if (!morningReport && morningData && userLevel <= 1) {
        const editDate = document.getElementById("editDate");
        const dateObj = new Date(editDate.value);
        const timestamp =
            dateObj.getTime() +
            (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;

        updates.push({
            id: null,
            newData: createCleanReportData({
                id: generateUniqueId(),
                dateCell: timestamp.toString(),
                ...morningData,
                user: currentUser,
                createdBy: currentUser,
                createdAt: new Date().toISOString(),
                editHistory: [],
            }),
        });
    }

    // Evening session update
    if (eveningReport && eveningData) {
        const cleanOldData = createCleanReportData(eveningReport);
        const cleanNewData = createCleanReportData({
            ...eveningReport,
            ...eveningData,
            soMonInbox: inboxValue === 0 ? "" : `${inboxValue} món`,
        });

        updates.push({
            id: eveningReport.id,
            oldData: cleanOldData,
            newData: cleanNewData,
        });
    } else if (!eveningReport && eveningData && userLevel <= 1) {
        const editDate = document.getElementById("editDate");
        const dateObj = new Date(editDate.value);
        const timestamp =
            dateObj.getTime() +
            (new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000;

        updates.push({
            id: null,
            newData: createCleanReportData({
                id: generateUniqueId(),
                dateCell: timestamp.toString(),
                ...eveningData,
                soMonInbox: inboxValue === 0 ? "" : `${inboxValue} món`,
                user: currentUser,
                createdBy: currentUser,
                createdAt: new Date().toISOString(),
                editHistory: [],
            }),
        });
    } else if (eveningReport && userLevel === 2) {
        const cleanOldData = createCleanReportData(eveningReport);
        const cleanNewData = createCleanReportData({
            ...eveningReport,
            soMonInbox: inboxValue === 0 ? "" : `${inboxValue} món`,
        });

        updates.push({
            id: eveningReport.id,
            oldData: cleanOldData,
            newData: cleanNewData,
        });
    }

    // Apply updates
    performFirebaseUpdate(updates, currentUser);
}

// FIXED: Separate function for Firebase update with clean data
function performFirebaseUpdate(updates, currentUser) {
    if (updates.length === 0) {
        if (globalNotificationManager) {
            globalNotificationManager.clearAll();
            globalNotificationManager.warning(
                "Không có thay đổi nào để lưu",
                2000,
            );
        }
        closeModal();
        return;
    }

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error("Document does not exist");
            }

            const data = doc.data();
            let dataArray = data["data"] || [];

            // Create a clean copy of the array
            const cleanDataArray = dataArray.map((item) =>
                createCleanReportData(item),
            );

            updates.forEach((update) => {
                if (update.id) {
                    const itemIndex = cleanDataArray.findIndex(
                        (item) => item.id === update.id,
                    );
                    if (itemIndex !== -1) {
                        const editHistoryEntry = {
                            timestamp: new Date().toISOString(),
                            editedBy: currentUser,
                            oldData: update.oldData,
                            newData: update.newData,
                        };

                        const updatedReport = createCleanReportData(
                            update.newData,
                        );
                        updatedReport.editHistory = [
                            ...(update.newData.editHistory || []),
                            editHistoryEntry,
                        ];

                        cleanDataArray[itemIndex] = updatedReport;
                    }
                } else {
                    cleanDataArray.push(createCleanReportData(update.newData));
                }
            });

            // Update with clean data
            return collectionRef
                .doc("reports")
                .update({ data: cleanDataArray });
        })
        .then(() => {
            if (typeof logAction === "function") {
                logAction(
                    "edit",
                    `Sửa báo cáo livestream (${updates.length} phiên)`,
                    null,
                    null,
                );
            }

            invalidateCache();
            closeModal();

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.success(
                    "Đã lưu thay đổi thành công!",
                    2000,
                );
            }

            // Reload table after a delay
            setTimeout(() => {
                if (typeof updateTable === "function") {
                    updateTable(true);
                }
            }, 500);
        })
        .catch((error) => {
            console.error("Error updating:", error);
            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Lỗi khi cập nhật: " + error.message,
                    4000,
                );
            }
        });
}

// Export functions
window.closeModal = closeModal;
window.saveUpdatedChanges = saveUpdatedChanges;
window.handleEditButton = handleEditButton;
window.populateSessionFields = populateSessionFields;
window.applyEditModalPermissions = applyEditModalPermissions;
window.collectEditSessionData = collectEditSessionData;
window.performFirebaseUpdate = performFirebaseUpdate;
window.clearEditModalFields = clearEditModalFields;
window.createCleanReportData = createCleanReportData;

// Setup close modal event listener when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    setTimeout(() => {
        const closeEditModalBtn = document.getElementById("closeEditModalBtn");
        if (closeEditModalBtn) {
            const newBtn = closeEditModalBtn.cloneNode(true);
            closeEditModalBtn.parentNode.replaceChild(
                newBtn,
                closeEditModalBtn,
            );
            newBtn.addEventListener("click", closeModal);
            console.log("[MODALS] Close modal button event listener attached");
        }

        const editModal = document.getElementById("editModal");
        if (editModal) {
            editModal.addEventListener("click", function (e) {
                if (e.target === editModal) {
                    closeModal();
                }
            });
        }

        document.addEventListener("keydown", function (e) {
            if (
                e.key === "Escape" &&
                editModal &&
                editModal.style.display === "flex"
            ) {
                closeModal();
            }
        });
    }, 100);
});
