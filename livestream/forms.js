// js/forms.js - Form Management System (Updated - No Inbox Input)

function initializeUpdatedForm() {
    if (ngayLive) {
        ngayLive.valueAsDate = new Date();
    }

    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", () => {
            if (hasPermission(3)) {
                if (
                    dataForm.style.display === "none" ||
                    dataForm.style.display === ""
                ) {
                    dataForm.style.display = "block";
                    toggleFormButton.innerHTML =
                        '<i data-lucide="x"></i><span>Đóng Form</span>';
                } else {
                    dataForm.style.display = "none";
                    toggleFormButton.innerHTML =
                        '<i data-lucide="plus-circle"></i><span>Thêm Báo Cáo</span>';
                }
                // Re-initialize Lucide icons
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            } else {
                if (globalNotificationManager) {
                    globalNotificationManager.error(
                        "Không có quyền truy cập form",
                        3000,
                        "Từ chối truy cập",
                    );
                } else {
                    showError("Không có quyền truy cập form");
                }
            }
        });
    }

    // Form submit handler
    if (livestreamForm) {
        livestreamForm.addEventListener("submit", handleUpdatedFormSubmit);
    }

    // Amount input formatting - Morning
    const tienQCMorning = document.getElementById("tienQC_morning");
    if (tienQCMorning) {
        tienQCMorning.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        tienQCMorning.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = numberWithCommas(value);
            } else {
                this.value = "";
            }
        });
    }

    // Amount input formatting - Evening
    const tienQCEvening = document.getElementById("tienQC_evening");
    if (tienQCEvening) {
        tienQCEvening.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        tienQCEvening.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = numberWithCommas(value);
            } else {
                this.value = "";
            }
        });
    }

    // Số món live input - Morning
    const soMonLiveMorning = document.getElementById("soMonLive_morning");
    if (soMonLiveMorning) {
        soMonLiveMorning.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d]/g, "");
        });
    }

    // Số món live input - Evening
    const soMonLiveEvening = document.getElementById("soMonLive_evening");
    if (soMonLiveEvening) {
        soMonLiveEvening.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d]/g, "");
        });
    }

    // Clear form button
    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", function () {
            const currentDate = new Date(ngayLive.value);
            livestreamForm.reset();
            ngayLive.valueAsDate = currentDate;

            if (globalNotificationManager) {
                globalNotificationManager.info("Form đã được làm mới", 2000);
            }
        });
    }
}

function handleUpdatedFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(3)) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không có quyền thêm báo cáo",
                3000,
                "Từ chối truy cập",
            );
        } else {
            showError("Không có quyền thêm báo cáo");
        }
        return;
    }

    const currentDate = new Date(ngayLive.value);
    const auth = getAuthState();
    const userName = auth
        ? auth.userType
            ? auth.userType.split("-")[0]
            : "Unknown"
        : "Unknown";

    // Collect data for both sessions
    const morningData = collectSessionData("morning");
    const eveningData = collectSessionData("evening");

    // Validate that at least one session has data
    if (!morningData && !eveningData) {
        if (globalNotificationManager) {
            globalNotificationManager.warning(
                "Vui lòng nhập dữ liệu cho ít nhất một phiên (Sáng hoặc Chiều)",
                4000,
                "Thiếu dữ liệu",
            );
        } else {
            showError(
                "Vui lòng nhập dữ liệu cho ít nhất một phiên (Sáng hoặc Chiều)",
            );
        }
        return;
    }

    const reportsToUpload = [];

    // Create morning report if has data
    if (morningData) {
        const morningReport = createReportObject(
            currentDate,
            morningData,
            0,
            userName,
        );
        reportsToUpload.push(morningReport);
    }

    // Create evening report if has data
    if (eveningData) {
        const eveningReport = createReportObject(
            currentDate,
            eveningData,
            0,
            userName,
        );
        reportsToUpload.push(eveningReport);
    }

    // Upload all reports
    uploadReports(reportsToUpload, currentDate);
}

function collectSessionData(session) {
    const prefix = session === "morning" ? "morning" : "evening";

    const tienQCInput = document.getElementById(`tienQC_${prefix}`);
    const startTimeInput = document.getElementById(`${prefix}_start_time`);
    const endTimeInput = document.getElementById(`${prefix}_end_time`);
    const soMonLiveInput = document.getElementById(`soMonLive_${prefix}`);

    // Get values
    let tienQC = tienQCInput ? tienQCInput.value.replace(/[,\.]/g, "") : "";
    const startTime = startTimeInput ? startTimeInput.value : "";
    const endTime = endTimeInput ? endTimeInput.value : "";
    const soMonLive = soMonLiveInput ? soMonLiveInput.value.trim() : "";

    // Check if this session has any data
    const hasData = tienQC || startTime || endTime || soMonLive;

    if (!hasData) {
        return null;
    }

    // Validate if session has data
    tienQC = parseFloat(tienQC);
    if (isNaN(tienQC) || tienQC < 0) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Tiền QC phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
                3000,
                "Dữ liệu không hợp lệ",
            );
        } else {
            showError(
                `Tiền QC phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
            );
        }
        return null;
    }

    if (!startTime || !endTime) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Vui lòng nhập đầy đủ thời gian cho phiên ${session === "morning" ? "Sáng" : "Chiều"}`,
                3000,
                "Thiếu thông tin",
            );
        } else {
            showError(
                `Vui lòng nhập đầy đủ thời gian cho phiên ${session === "morning" ? "Sáng" : "Chiều"}`,
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
                "Thời gian không hợp lệ",
            );
        } else {
            showError(
                `Thời gian phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
            );
        }
        return null;
    }

    if (!soMonLive || isNaN(soMonLive) || parseInt(soMonLive) < 0) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                `Số món live phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
                3000,
                "Dữ liệu không hợp lệ",
            );
        } else {
            showError(
                `Số món live phiên ${session === "morning" ? "Sáng" : "Chiều"} không hợp lệ`,
            );
        }
        return null;
    }

    return {
        tienQC: tienQC,
        thoiGian: thoiGian,
        startTime: startTime,
        soMonLive: parseInt(soMonLive),
        hasInbox: false,
    };
}

function createReportObject(currentDate, sessionData, inboxCount, userName) {
    const tempTimeStamp = new Date();
    const timestamp =
        currentDate.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    return {
        id: uniqueId,
        dateCell: timestamp.toString(),
        tienQC: numberWithCommas(sessionData.tienQC),
        thoiGian: sessionData.thoiGian,
        soMonLive: sessionData.soMonLive + " món",
        soMonInbox: "",
        user: userName,
        createdBy: userName,
        createdAt: new Date().toISOString(),
        editHistory: [],
    };
}

function uploadReports(reports, currentDate) {
    let uploadNotificationId = null;

    if (globalNotificationManager) {
        uploadNotificationId = globalNotificationManager.saving(
            `Đang lưu ${reports.length} báo cáo...`,
        );
    } else {
        showLoading(`Đang lưu ${reports.length} báo cáo...`);
    }

    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            const updateData = doc.exists
                ? {
                      data: firebase.firestore.FieldValue.arrayUnion(
                          ...reports,
                      ),
                  }
                : { data: reports };

            const operation = doc.exists
                ? collectionRef.doc("reports").update(updateData)
                : collectionRef.doc("reports").set(updateData);

            return operation;
        })
        .then(() => {
            // Log actions for all reports (safe call)
            reports.forEach((report) => {
                if (typeof logAction === "function") {
                    logAction(
                        "add",
                        `Thêm báo cáo livestream: ${report.tienQC}`,
                        null,
                        report,
                    );
                } else {
                    console.log(`[ACTION] Add report: ${report.tienQC}`);
                }
            });

            // Invalidate cache and reload table
            invalidateCache();

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.success(
                    `Đã thêm ${reports.length} báo cáo thành công!`,
                    2000,
                    "Thành công",
                );
            } else {
                showSuccess(`Đã thêm ${reports.length} báo cáo thành công!`);
            }

            // Reset form
            livestreamForm.reset();
            ngayLive.valueAsDate = currentDate;

            // Close form
            if (dataForm) {
                dataForm.style.display = "none";
            }
            if (toggleFormButton) {
                toggleFormButton.innerHTML =
                    '<i data-lucide="plus-circle"></i><span>Thêm Báo Cáo</span>';
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }

            // Reload table data with a slight delay for better UX
            setTimeout(() => {
                console.log("[FORMS] Reloading table after adding reports...");
                if (typeof updateTable === "function") {
                    updateTable(true); // Giữ nguyên filter hiện tại
                }
            }, 500);
        })
        .catch((error) => {
            console.error("Error uploading reports: ", error);

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Lỗi khi tải báo cáo lên: " + error.message,
                    4000,
                    "Lỗi",
                );
            } else {
                showError("Lỗi khi tải báo cáo lên.");
            }
        });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = "block";

    const editDate = document.getElementById("editDate");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const row = e.target.closest("tr");
    const cells = row.cells;

    // Find the date cell (first cell with data-id)
    let dateCell = null;
    let cellIndex = 0;
    for (let i = 0; i < cells.length; i++) {
        if (cells[i].getAttribute("data-id")) {
            dateCell = cells[i];
            cellIndex = i;
            break;
        }
    }

    if (!dateCell) {
        if (globalNotificationManager) {
            globalNotificationManager.error(
                "Không tìm thấy thông tin ngày",
                3000,
            );
        } else {
            showError("Không tìm thấy thông tin ngày");
        }
        return;
    }

    const date = dateCell.innerText;
    const tienQC = cells[cellIndex + 1].innerText;
    const thoiGian = cells[cellIndex + 2].innerText;
    const soMonLive = cells[cellIndex + 3].innerText;
    const soMonInbox = cells[cellIndex + 4].innerText;

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Set values for all fields first
    if (editDate) {
        let cleanDate = date;
        const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
        if (periodPattern.test(date)) {
            cleanDate = date.replace(periodPattern, "").trim();
        }

        const parts = cleanDate.split("-");
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

    if (editTienQC) {
        editTienQC.value = tienQC;
    }

    // Parse time from format "Từ 20h00m đến 22h00m - 2h0m"
    if (thoiGian && thoiGian.trim()) {
        const timePattern =
            /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m/;
        const match = thoiGian.match(timePattern);

        if (match) {
            const [, startHour, startMin, endHour, endMin] = match;
            if (hh1) hh1.value = startHour;
            if (mm1) mm1.value = startMin;
            if (hh2) hh2.value = endHour;
            if (mm2) mm2.value = endMin;
            if (hh1.value < 12 && !hasPermission(0)) {
                editModal.style.display = "none";
                if (globalNotificationManager) {
                    globalNotificationManager.warning(
                        "Bạn không có quyền chỉnh sửa phiên Sáng",
                        3000,
                        "Từ chối truy cập",
                    );
                }
                return;
            }
        } else {
            if (hh1) hh1.value = "";
            if (mm1) mm1.value = "";
            if (hh2) hh2.value = "";
            if (mm2) mm2.value = "";
        }
    } else {
        if (hh1) hh1.value = "";
        if (mm1) mm1.value = "";
        if (hh2) hh2.value = "";
        if (mm2) mm2.value = "";
    }

    if (editSoMonLive) {
        let cleanSoMonLive = soMonLive.replace(" món", "");
        editSoMonLive.value = cleanSoMonLive;
    }

    // Handle soMonInbox - if empty, set to 0 for editing
    if (editSoMonInbox) {
        if (soMonInbox.trim() === "") {
            editSoMonInbox.value = "0";
        } else {
            let cleanSoMonInbox = soMonInbox.replace(" món", "");
            editSoMonInbox.value = cleanSoMonInbox;
        }
    }

    // Apply permissions based on user level
    if (userLevel <= 1) {
        // Level 0 and 1: Full edit permission
        if (editDate) editDate.disabled = false;
        if (editTienQC) editTienQC.disabled = false;
        if (hh1) hh1.disabled = false;
        if (mm1) mm1.disabled = false;
        if (hh2) hh2.disabled = false;
        if (mm2) mm2.disabled = false;
        if (editSoMonLive) editSoMonLive.disabled = false;
        if (editSoMonInbox) editSoMonInbox.disabled = false;
    } else if (userLevel === 2) {
        // Level 2: Only can edit soMonInbox
        if (editDate) {
            editDate.disabled = true;
            editDate.style.backgroundColor = "#f8f9fa";
        }
        if (editTienQC) {
            editTienQC.readOnly = true;
            editTienQC.style.backgroundColor = "#f8f9fa";
        }
        if (hh1) {
            hh1.readOnly = true;
            hh1.style.backgroundColor = "#f8f9fa";
        }
        if (mm1) {
            mm1.readOnly = true;
            mm1.style.backgroundColor = "#f8f9fa";
        }
        if (hh2) {
            hh2.readOnly = true;
            hh2.style.backgroundColor = "#f8f9fa";
        }
        if (mm2) {
            mm2.readOnly = true;
            mm2.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonLive) {
            editSoMonLive.readOnly = true;
            editSoMonLive.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonInbox) {
            editSoMonInbox.disabled = false;
            editSoMonInbox.readOnly = false;
            editSoMonInbox.style.backgroundColor = "white";
        }
    } else {
        // Level 3 and above: No edit permissions
        if (editDate) editDate.disabled = true;
        if (editTienQC) editTienQC.disabled = true;
        if (hh1) hh1.disabled = true;
        if (mm1) mm1.disabled = true;
        if (hh2) hh2.disabled = true;
        if (mm2) mm2.disabled = true;
        if (editSoMonLive) editSoMonLive.disabled = true;
        if (editSoMonInbox) editSoMonInbox.disabled = true;
    }

    editingRow = row;
}

// Export functions
window.initializeUpdatedForm = initializeUpdatedForm;
window.handleUpdatedFormSubmit = handleUpdatedFormSubmit;
window.handleEditButton = handleEditButton;
window.collectSessionData = collectSessionData;
window.createReportObject = createReportObject;
window.uploadReports = uploadReports;
