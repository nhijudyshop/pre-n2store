/**
 * Attendance Module - Quản lý chấm công
 * Đọc dữ liệu từ Firestore (được sync bởi attendance-sync service)
 * Hiển thị bảng chấm công theo tuần trên web
 */
(function () {
    'use strict';

    // ================================================================
    // CONSTANTS
    // ================================================================
    const COLLECTIONS = {
        records: 'attendance_records',
        deviceUsers: 'attendance_device_users',
        commands: 'attendance_commands',
        syncStatus: 'attendance_sync_status',
    };

    const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const SHORT_DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    // Salary calculation constants
    const SALARY = {
        DAILY_RATE: 200000,         // VND per day (ca 8:00-20:00, 12h)
        HOURLY_RATE: 200000 / 12,   // ~16,667 VND/hour
        LATE_PENALTY_PER_MIN: 5000, // VND per minute late after 8:00
        WORK_START_HOUR: 8,         // 8:00
        WORK_END_HOUR: 16,          // 16:00 - về trước giờ này = lương chia đôi
        OT_START_HOUR: 20,          // 20:00 - hết ca, sau giờ này = OT
        OT_MULTIPLIER: 2,           // double rate for OT
    };

    // ================================================================
    // STATE
    // ================================================================
    let db = null;
    let currentWeekStart = null; // Monday of current view
    let employees = [];          // From attendance_device_users
    let weekRecords = [];        // Attendance records for current week
    let syncStatus = null;       // Sync service status
    let unsubSyncStatus = null;  // Firestore listener unsubscribe
    let showHidden = false;      // Toggle hiển thị nhân viên ẩn
    let viewPeriod = 'week';     // 'week' or 'month'
    let currentMonth = null;     // { year, month } for monthly view
    let monthRecords = [];       // Records for entire month
    let monthlyEmpData = [];     // Cached monthly calc data for detail view

    // Load hidden employees from localStorage
    const HIDDEN_KEY = 'attendance_hidden_employees';
    let hiddenEmployees = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));

    function saveHidden() {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenEmployees]));
    }

    function isHidden(empId) {
        return hiddenEmployees.has(String(empId));
    }

    // Full-day salary override (skip early leave halving)
    const FULLDAY_KEY = 'attendance_fullday_overrides';
    let fullDayOverrides = new Set(JSON.parse(localStorage.getItem(FULLDAY_KEY) || '[]'));

    function saveFullDay() {
        localStorage.setItem(FULLDAY_KEY, JSON.stringify([...fullDayOverrides]));
    }

    function isFullDay(empId, dateKey) {
        return fullDayOverrides.has(`${empId}_${dateKey}`);
    }

    function toggleFullDay(empId, dateKey) {
        const key = `${empId}_${dateKey}`;
        if (fullDayOverrides.has(key)) {
            fullDayOverrides.delete(key);
        } else {
            fullDayOverrides.add(key);
        }
        saveFullDay();
        renderTimesheet();
        renderSchedule();
    }

    function hideEmployee(empId) {
        hiddenEmployees.add(String(empId));
        saveHidden();
        renderTimesheet();
        renderSchedule();
    }

    function unhideEmployee(empId) {
        hiddenEmployees.delete(String(empId));
        saveHidden();
        renderTimesheet();
        renderSchedule();
    }

    function toggleHidden() {
        showHidden = !showHidden;
        renderTimesheet();
        renderSchedule();
    }

    // ================================================================
    // INIT
    // ================================================================
    function init() {
        db = firebase.firestore();
        if (!db) {
            console.error('[Attendance] Firestore chưa khởi tạo');
            return;
        }

        currentWeekStart = getMonday(new Date());
        const now = new Date();
        currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

        bindEvents();
        injectTestButton();
        loadEmployees().then(() => {
            loadWeekData();
        });
        listenSyncStatus();

        console.log('[Attendance] Module loaded');
    }

    // ================================================================
    // DATE HELPERS
    // ================================================================

    /** Lấy thứ Hai của tuần chứa ngày cho trước */
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=CN, 1=T2, ...
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /** Lấy mảng 7 ngày trong tuần (T2 → CN) */
    function getWeekDates() {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            dates.push(d);
        }
        return dates;
    }

    /** Format date thành YYYY-MM-DD (dùng làm dateKey) */
    function toDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Format giờ HH:mm */
    function formatTime(date) {
        if (!date) return '--:--';
        const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    /** Lấy tên tuần + tháng hiển thị */
    function getWeekLabel() {
        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 6);

        // Tuần thứ mấy trong tháng
        const weekNum = Math.ceil(currentWeekStart.getDate() / 7);
        const month = currentWeekStart.getMonth() + 1;
        const year = currentWeekStart.getFullYear();

        // Nếu tuần qua 2 tháng
        if (currentWeekStart.getMonth() !== end.getMonth()) {
            const m2 = end.getMonth() + 1;
            return `Tuần ${weekNum} - Th.${month}/${year} → Th.${m2}`;
        }

        return `Tuần ${weekNum} - Th.${month} ${year}`;
    }

    /** Kiểm tra ngày hôm nay */
    function isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate()
            && date.getMonth() === today.getMonth()
            && date.getFullYear() === today.getFullYear();
    }

    // ================================================================
    // DATA LOADING
    // ================================================================

    /** Load danh sách nhân viên từ máy chấm công */
    async function loadEmployees() {
        try {
            const snapshot = await db.collection(COLLECTIONS.deviceUsers).get();
            employees = [];
            snapshot.forEach(doc => {
                employees.push({ id: doc.id, ...doc.data() });
            });
            employees.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
            console.log(`[Attendance] Loaded ${employees.length} employees`);
        } catch (err) {
            console.error('[Attendance] Lỗi load employees:', err);
            employees = [];
        }
    }

    /** Load dữ liệu chấm công cho tuần hiện tại */
    async function loadWeekData() {
        const dates = getWeekDates();
        const startKey = toDateKey(dates[0]);
        const endKey = toDateKey(dates[6]);

        try {
            const snapshot = await db.collection(COLLECTIONS.records)
                .where('dateKey', '>=', startKey)
                .where('dateKey', '<=', endKey)
                .get();

            weekRecords = [];
            snapshot.forEach(doc => {
                weekRecords.push({ id: doc.id, ...doc.data() });
            });

            console.log(`[Attendance] Loaded ${weekRecords.length} records (${startKey} → ${endKey})`);
        } catch (err) {
            console.error('[Attendance] Lỗi load attendance:', err);
            weekRecords = [];
        }

        // Gộp test data nếu có
        if (testEmployees.length > 0 || testRecords.length > 0) {
            mergeTestData();
        } else {
            renderTimesheet();
            renderSchedule();
        }
    }

    /** Load dữ liệu chấm công cho cả tháng */
    async function loadMonthData() {
        const y = currentMonth.year;
        const m = currentMonth.month;
        const startKey = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        try {
            const snapshot = await db.collection(COLLECTIONS.records)
                .where('dateKey', '>=', startKey)
                .where('dateKey', '<=', endKey)
                .get();

            monthRecords = [];
            snapshot.forEach(doc => {
                monthRecords.push({ id: doc.id, ...doc.data() });
            });
            console.log(`[Attendance] Month: ${monthRecords.length} records (${startKey} → ${endKey})`);
        } catch (err) {
            console.error('[Attendance] Lỗi load month data:', err);
            monthRecords = [];
        }

        renderMonthlySchedule();
    }

    /** Lắng nghe trạng thái sync (real-time) */
    function listenSyncStatus() {
        if (unsubSyncStatus) unsubSyncStatus();

        unsubSyncStatus = db.collection(COLLECTIONS.syncStatus)
            .doc('current')
            .onSnapshot(doc => {
                syncStatus = doc.exists ? doc.data() : null;
                renderSyncStatus();
            }, err => {
                console.warn('[Attendance] Lỗi listen sync status:', err);
            });
    }

    // ================================================================
    // RENDERING - TIMESHEET VIEW
    // ================================================================

    function renderTimesheet() {
        renderTimesheetHeader();
        renderTimesheetBody();
        renderWeekLabel();
    }

    /** Render header với ngày tháng đúng */
    function renderTimesheetHeader() {
        const thead = document.querySelector('#viewTimesheet .ts-grid thead tr');
        if (!thead) return;

        const dates = getWeekDates();

        thead.innerHTML = `
            <th class="ts-col-fixed" style="display:flex; justify-content:space-between; align-items:center; border-bottom:none; border-right:none;">
                Nhân viên
                <span class="ts-sync-indicator" id="syncIndicator" title="Trạng thái đồng bộ"></span>
            </th>
            ${dates.map(d => {
            const dayName = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            const todayClass = isToday(d) ? 'ts-day-active' : '';
            return `<th class="${todayClass}">${dayName} <span>${dayNum}</span></th>`;
        }).join('')}
            <th style="min-width:90px; text-align:right;">Tổng giờ</th>
            <th style="min-width:110px; text-align:right;">Lương</th>
        `;
    }

    /** Render body với dữ liệu chấm công */
    function renderTimesheetBody() {
        const tbody = document.querySelector('#viewTimesheet .ts-grid tbody');
        if (!tbody) return;

        // Nếu chưa có nhân viên
        if (employees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:14px;">
                        <div style="margin-bottom:12px;">
                            <i data-lucide="fingerprint" style="width:48px; height:48px; color:#d1d5db;"></i>
                        </div>
                        <div style="font-weight:500; margin-bottom:4px;">Chưa có dữ liệu chấm công</div>
                        <div style="font-size:12px;">Cài đặt sync service trên PC công ty để bắt đầu đồng bộ</div>
                    </td>
                </tr>
            `;
            refreshIcons();
            return;
        }

        const dates = getWeekDates();
        let html = '';
        let grandTotalSalary = 0;
        let grandTotalMinutes = 0;

        // Tính lương trước để sắp xếp theo lương giảm dần
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            let totalMinutes = 0;
            let weekSalary = 0;
            let workedDays = 0;
            const dayCells = [];

            const empRate = emp.dailyRate || SALARY.DAILY_RATE;
            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                totalMinutes += cellData.workedMinutes;
                const daySalary = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey));
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey });
            }

            return { emp, empId, totalMinutes, weekSalary, workedDays, dayCells };
        });

        // Sắp xếp theo lương giảm dần
        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        // Tách visible / hidden
        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));
        const hiddenCount = hiddenData.length;

        for (const { emp, empId, totalMinutes, weekSalary, workedDays, dayCells } of visibleData) {
            grandTotalSalary += weekSalary;
            grandTotalMinutes += totalMinutes;

            html += '<tr>';

            html += renderEmpNameCell(emp, empId, false);

            // 7 cột cho 7 ngày
            for (const { cellData, daySalary, dateKey } of dayCells) {
                html += `<td>${renderDayCell(cellData, daySalary, emp, dateKey)}</td>`;
            }

            // Cột tổng giờ
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const totalDisplay = totalMinutes > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : '-';

            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:600; font-size:13px; color:#1e293b;">${totalDisplay}</div>
                    ${workedDays > 0 ? `<div style="font-size:11px; color:#8c8c8c;">${workedDays} ngày</div>` : ''}
                </td>
            `;

            // Cột lương
            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:700; font-size:13px; color:${weekSalary > 0 ? '#1e293b' : '#bfbfbf'};">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div>
                </td>
            `;

            html += '</tr>';
        }

        // Hàng tổng cộng
        if (visibleData.length > 0) {
            const gtHours = Math.floor(grandTotalMinutes / 60);
            const gtMins = grandTotalMinutes % 60;
            const gtDisplay = grandTotalMinutes > 0 ? `${gtHours}h${gtMins > 0 ? gtMins + 'm' : ''}` : '-';

            html += `
                <tr style="background:#fafafa; border-top:2px solid #e2e8f0;">
                    <td class="ts-col-fixed" style="background:#fafafa;">
                        <div style="font-weight:700; color:#1e293b;">Tổng cộng</div>
                        <div style="font-size:11px; color:#8c8c8c;">${visibleData.length} nhân viên</div>
                    </td>
                    <td colspan="7"></td>
                    <td style="text-align:right; vertical-align:middle;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b;">${gtDisplay}</div>
                    </td>
                    <td style="text-align:right; vertical-align:middle;">
                        <div style="font-weight:700; font-size:14px; color:#d4380d;">${formatVND(grandTotalSalary)}đ</div>
                    </td>
                </tr>
            `;
        }

        // Hàng nhân viên đã ẩn
        if (hiddenCount > 0) {
            html += `
                <tr>
                    <td colspan="10" style="text-align:center; padding:8px; border:none;">
                        <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                            ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenCount} nhân viên đã ẩn
                        </span>
                    </td>
                </tr>
            `;

            if (showHidden) {
                for (const { emp, empId, totalMinutes, weekSalary, workedDays, dayCells } of hiddenData) {
                    html += `<tr style="opacity:0.5;">`;
                    html += renderEmpNameCell(emp, empId, true);
                    for (const { cellData, daySalary, dateKey } of dayCells) {
                        html += `<td>${renderDayCell(cellData, daySalary, emp, dateKey)}</td>`;
                    }
                    const hours = Math.floor(totalMinutes / 60);
                    const mins = totalMinutes % 60;
                    const totalDisplay = totalMinutes > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : '-';
                    html += `<td style="text-align:right;"><div style="font-weight:500; color:#8c8c8c;">${totalDisplay}</div></td>`;
                    html += `<td style="text-align:right;"><div style="font-weight:500; color:#8c8c8c;">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div></td>`;
                    html += '</tr>';
                }
            }
        }

        tbody.innerHTML = html;
        refreshIcons();
    }

    /**
     * Xử lý records của 1 nhân viên trong 1 ngày
     * → xác định check-in, check-out, trạng thái
     */
    function processDayRecords(records) {
        if (!records.length) {
            return { status: 'absent', checkIn: null, checkOut: null, workedMinutes: 0, records };
        }

        // Sắp xếp theo thời gian
        const sorted = records
            .map(r => ({
                ...r,
                time: r.checkTime ? (r.checkTime.toDate ? r.checkTime.toDate() : new Date(r.checkTime)) : null
            }))
            .filter(r => r.time)
            .sort((a, b) => a.time - b.time);

        if (sorted.length === 0) {
            return { status: 'absent', checkIn: null, checkOut: null, workedMinutes: 0, records };
        }

        const checkIn = sorted[0].time;
        const checkOut = sorted.length > 1 ? sorted[sorted.length - 1].time : null;

        // Tính thời gian làm việc
        let workedMinutes = 0;
        if (checkIn && checkOut) {
            workedMinutes = Math.round((checkOut - checkIn) / (1000 * 60));
        }

        // Xác định trạng thái
        let status = 'on_time'; // blue
        if (!checkOut) {
            status = 'incomplete'; // red - chỉ có vào mà không có ra
        }

        return { status, checkIn, checkOut, workedMinutes, records: sorted };
    }

    /**
     * Tính lương 1 ngày dựa trên dữ liệu chấm công
     * - Đúng giờ: vào <= 8:00, ra 16:00-20:00 → 200,000 VND
     * - Đi muộn: sau 8:00 → trừ 5,000/phút
     * - Về sớm: ra trước 16:00 → lương chia đôi (100,000)
     * - Làm thêm: ra 20:00-24:00 → đủ lương + OT nhân đôi
     */
    function calculateDaySalary(cellData, dailyRate, forceFullDay) {
        const rate = dailyRate || SALARY.DAILY_RATE;
        const hourlyRate = rate / 12;
        const result = { baseSalary: 0, lateDeduction: 0, lateMinutes: 0, otPay: 0, otMinutes: 0, totalSalary: 0, dailyRate: rate };

        if (cellData.status === 'absent' || cellData.status === 'incomplete') {
            return result;
        }

        const checkIn = cellData.checkIn;
        const checkOut = cellData.checkOut;
        if (!checkIn || !checkOut) return result;

        // --- Late penalty ---
        const startOfDay = new Date(checkIn);
        startOfDay.setHours(SALARY.WORK_START_HOUR, 0, 0, 0);
        if (checkIn > startOfDay) {
            result.lateMinutes = Math.floor((checkIn - startOfDay) / (1000 * 60));
            result.lateDeduction = result.lateMinutes * SALARY.LATE_PENALTY_PER_MIN;
        }

        // --- Base salary = hourlyRate × giờ làm (8:00-20:00) ---
        const hour8 = new Date(checkIn);
        hour8.setHours(SALARY.WORK_START_HOUR, 0, 0, 0);
        const hour16 = new Date(checkOut);
        hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
        const hour20 = new Date(checkOut);
        hour20.setHours(SALARY.OT_START_HOUR, 0, 0, 0);

        const workStart = checkIn > hour8 ? checkIn : hour8; // max(checkin, 8:00)
        const workEnd = checkOut < hour20 ? checkOut : hour20; // min(checkout, 20:00)
        const baseMinutes = Math.max(0, Math.floor((workEnd - workStart) / (1000 * 60)));
        result.baseMinutes = baseMinutes;

        if (forceFullDay) {
            // Check Full → nhận đủ lương cơ bản của ngày
            result.baseSalary = rate;
            result.fullDayOverride = true;
            if (checkOut < hour16) result.earlyLeave = true;
        } else {
            result.baseSalary = Math.round(hourlyRate * baseMinutes / 60);
            // Về trước 16h → lương chia đôi
            if (checkOut < hour16) {
                result.earlyLeave = true;
                result.baseSalary = Math.round(result.baseSalary / 2);
            }
        }

        // --- OT after 20:00 at double rate ---
        if (checkOut > hour20) {
            result.otMinutes = Math.floor((checkOut - hour20) / (1000 * 60));
            result.otPay = Math.round(result.otMinutes / 60 * hourlyRate * SALARY.OT_MULTIPLIER);
        }

        result.totalSalary = Math.max(0, result.baseSalary - result.lateDeduction + result.otPay);
        return result;
    }

    /** Render ô tên nhân viên (dùng chung cho cả 3 view) */
    function renderEmpNameCell(emp, empId, isHiddenRow) {
        const rate = emp.dailyRate || SALARY.DAILY_RATE;
        const rateLabel = formatVND(rate) + 'đ/ngày';
        const nameColor = isHiddenRow ? '#8c8c8c' : '#1e293b';
        const subColor = isHiddenRow ? '#bfbfbf' : '#8c8c8c';

        if (isHiddenRow) {
            return `
                <td class="ts-col-fixed">
                    <div style="display:flex; align-items:center; gap:4px;">
                        <div style="font-weight:600; color:${nameColor}; flex:1;">${escapeHtml(emp.name || 'N/A')}</div>
                        <span onclick="window._attendance.unhideEmployee('${empId}')" title="Bỏ ẩn" style="cursor:pointer; color:#52c41a; font-size:12px;">Hiện</span>
                    </div>
                    <div style="font-size:11px; color:${subColor};">
                        <span onclick="window._attendance.showSalaryModal('${empId}')" style="cursor:pointer;" title="Chỉnh lương">${rateLabel}</span>
                    </div>
                </td>
            `;
        }

        return `
            <td class="ts-col-fixed">
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="font-weight:600; color:${nameColor}; flex:1;">${escapeHtml(emp.name || 'N/A')}</div>
                    <span onclick="window._attendance.hideEmployee('${empId}')" title="Ẩn nhân viên" style="cursor:pointer; color:#d9d9d9; font-size:14px; line-height:1;">✕</span>
                </div>
                <div style="font-size:11px; color:${subColor};">
                    <span onclick="window._attendance.showSalaryModal('${empId}')" style="cursor:pointer; color:${rate !== SALARY.DAILY_RATE ? '#1890ff' : subColor};" title="Chỉnh lương">${rateLabel}</span>
                </div>
            </td>
        `;
    }

    /** Format số tiền VND */
    function formatVND(amount) {
        if (!amount) return '-';
        return amount.toLocaleString('vi-VN');
    }

    /** Render 1 ô ngày */
    function renderDayCell(cellData, daySalary, emp, dateKey) {
        const { status, checkIn, checkOut } = cellData;
        const empId = emp.userId || emp.uid || emp.id;

        if (status === 'absent') {
            const cellDate = new Date(dateKey);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (cellDate > today) return '';

            return `
                <div class="ts-block" style="border-left:3px solid #faad14; background:#fff7e6; cursor:pointer;"
                     onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                    <div style="color:#faad14; font-size:12px;">--:--</div>
                    <div style="color:#d48806; font-size:11px; margin-top:2px;">Nghỉ</div>
                </div>
            `;
        }

        // Xác định style theo trạng thái
        let borderColor, bgColor, statusText, statusColor;

        if (status === 'incomplete') {
            borderColor = '#ff4d4f';
            bgColor = '#fff2f0';
            statusText = 'Thiếu giờ ra';
            statusColor = '#cf1322';
        } else if (daySalary.otMinutes > 0) {
            // Làm thêm (ưu tiên hiển thị OT)
            borderColor = '#1890ff';
            bgColor = '#e6f7ff';
            const otH = Math.floor(daySalary.otMinutes / 60);
            const otM = daySalary.otMinutes % 60;
            const otDisplay = otH > 0 ? `${otH}h${otM > 0 ? otM + 'p' : ''}` : `${otM}p`;
            statusText = `OT ${otDisplay} +${formatVND(daySalary.otPay)}đ`;
            if (daySalary.lateMinutes > 0) statusText = `Muộn ${daySalary.lateMinutes}p · ${statusText}`;
            statusColor = '#096dd9';
        } else if (checkOut) {
            const hour16 = new Date(checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (checkOut < hour16) {
                // Về sớm
                borderColor = '#722ed1';
                bgColor = '#f9f0ff';
                statusText = `Về sớm ${formatVND(daySalary.baseSalary)}đ`;
                if (daySalary.lateMinutes > 0) statusText = `Muộn ${daySalary.lateMinutes}p · ${statusText}`;
                statusColor = '#531dab';
            } else if (daySalary.lateMinutes > 0) {
                // Đi muộn nhưng ra đúng
                borderColor = '#fa8c16';
                bgColor = '#fff7e6';
                statusText = `Muộn ${daySalary.lateMinutes}p`;
                statusColor = '#d46b08';
            } else {
                // Đúng giờ
                borderColor = '#52c41a';
                bgColor = '#f6ffed';
                statusText = 'Đúng giờ';
                statusColor = '#389e0d';
            }
        } else {
            borderColor = '#52c41a';
            bgColor = '#f6ffed';
            statusText = 'Đúng giờ';
            statusColor = '#389e0d';
        }

        const inTime = formatTime(checkIn);
        const outTime = checkOut ? formatTime(checkOut) : '--:--';
        const checked = isFullDay(empId, dateKey);
        const showCb = status !== 'incomplete' && checkOut;

        return `
            <div class="ts-block" style="border-left:3px solid ${borderColor}; background:${bgColor}; cursor:pointer;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:12px; color:#1e293b;">${inTime} - ${outTime}</div>
                <div style="font-size:11px; color:${statusColor}; margin-top:3px;">${statusText}</div>
                ${showCb ? `<label onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:3px; margin-top:3px; cursor:pointer; font-size:10px; color:#8c8c8c;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._attendance.toggleFullDay('${empId}','${dateKey}')" style="margin:0; cursor:pointer;">
                    <span>Full</span>
                </label>` : ''}
            </div>
        `;
    }

    // ================================================================
    // RENDERING - SCHEDULE VIEW (Lịch làm việc)
    // ================================================================

    function renderSchedule() {
        if (viewPeriod === 'month') {
            renderMonthlySchedule();
        } else {
            renderScheduleHeader();
            renderScheduleBody();
            renderWeekLabel();
        }
    }

    function renderScheduleHeader() {
        const thead = document.querySelector('#scheduleGrid thead tr');
        if (!thead) return;

        const dates = getWeekDates();
        thead.innerHTML = `
            <th class="ts-col-fixed">Nhân viên</th>
            ${dates.map(d => {
                const dayName = DAY_NAMES[d.getDay()];
                const dayNum = d.getDate();
                const todayClass = isToday(d) ? 'ts-day-active' : '';
                return `<th class="${todayClass}">${dayName} <span>${dayNum}</span></th>`;
            }).join('')}
            <th style="min-width:130px; text-align:right;">Lương tuần</th>
        `;
    }

    function renderScheduleBody() {
        const tbody = document.querySelector('#scheduleGrid tbody');
        if (!tbody) return;

        if (employees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:14px;">
                        <div style="font-weight:500;">Chưa có dữ liệu nhân viên</div>
                    </td>
                </tr>
            `;
            return;
        }

        const dates = getWeekDates();
        let html = '';
        let grandTotalSalary = 0;

        // Tính lương + sắp xếp giảm dần
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            let weekSalary = 0;
            let workedDays = 0;
            const dayCells = [];

            const empRate = emp.dailyRate || SALARY.DAILY_RATE;
            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                const daySalary = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey));
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey, date });
            }

            return { emp, empId, weekSalary, workedDays, dayCells };
        });

        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        // Tách visible / hidden
        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));
        const hiddenCount = hiddenData.length;

        // Hàng tổng cộng trên đầu
        const totalSalary = visibleData.reduce((s, e) => s + e.weekSalary, 0);
        html += `
            <tr style="background:#fafafa;">
                <td class="ts-col-fixed" style="border:none; background:#fafafa;"></td>
                <td colspan="7" style="border:none;"></td>
                <td style="text-align:right; font-weight:700; font-size:15px; color:#d4380d; border:none;">
                    ${formatVND(totalSalary)}đ
                </td>
            </tr>
        `;

        for (const { emp, empId, weekSalary, workedDays, dayCells } of visibleData) {
            html += '<tr>';

            html += renderEmpNameCell(emp, empId, false);

            // 7 ngày - hiện block trạng thái
            for (const { cellData, daySalary, dateKey, date } of dayCells) {
                html += `<td>${renderScheduleCell(cellData, daySalary, emp, dateKey, date)}</td>`;
            }

            // Cột lương
            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:700; font-size:14px; color:${weekSalary > 0 ? '#1e293b' : '#bfbfbf'};">
                        ${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}
                    </div>
                    ${workedDays > 0 ? `<div style="font-size:11px; color:#8c8c8c;">${workedDays} ngày</div>` : ''}
                </td>
            `;

            html += '</tr>';
        }

        // Hàng nhân viên đã ẩn
        if (hiddenCount > 0) {
            html += `
                <tr>
                    <td colspan="9" style="text-align:center; padding:8px; border:none;">
                        <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                            ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenCount} nhân viên đã ẩn
                        </span>
                    </td>
                </tr>
            `;

            if (showHidden) {
                for (const { emp, empId, weekSalary, workedDays, dayCells } of hiddenData) {
                    html += `<tr style="opacity:0.5;">`;
                    html += renderEmpNameCell(emp, empId, true);
                    for (const { cellData, daySalary, dateKey, date } of dayCells) {
                        html += `<td>${renderScheduleCell(cellData, daySalary, emp, dateKey, date)}</td>`;
                    }
                    html += `
                        <td style="text-align:right;">
                            <div style="font-weight:500; color:#8c8c8c;">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div>
                        </td>
                    `;
                    html += '</tr>';
                }
            }
        }

        tbody.innerHTML = html;
    }

    /** Render 1 ô ngày trong schedule view */
    function renderScheduleCell(cellData, daySalary, emp, dateKey, date) {
        const { status } = cellData;
        const empId = emp.userId || emp.uid || emp.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Tương lai → trống
        if (date > today && status === 'absent') return '';

        // Nghỉ
        if (status === 'absent') {
            return `
                <div class="ts-block" style="border-left:3px solid #d9d9d9; background:#fafafa; cursor:pointer; text-align:center;"
                     onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                    <div style="color:#bfbfbf; font-size:11px;">Nghỉ</div>
                </div>
            `;
        }

        // Xác định style
        let bgClass, label, labelColor;

        if (status === 'incomplete') {
            bgClass = 'background:#fff2f0; border-left:3px solid #ff4d4f;';
            label = 'Thiếu giờ ra';
            labelColor = '#cf1322';
        } else if (daySalary.otMinutes > 0) {
            bgClass = 'background:#e6f7ff; border-left:3px solid #1890ff;';
            label = 'LÀM THÊM';
            labelColor = '#096dd9';
        } else if (daySalary.lateMinutes > 0) {
            const hour16 = new Date(cellData.checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (cellData.checkOut < hour16) {
                bgClass = 'background:#f9f0ff; border-left:3px solid #722ed1;';
                label = 'MUỘN + VỀ SỚM';
                labelColor = '#531dab';
            } else {
                bgClass = 'background:#fff7e6; border-left:3px solid #fa8c16;';
                label = 'ĐI MUỘN';
                labelColor = '#d46b08';
            }
        } else if (cellData.checkOut) {
            const hour16 = new Date(cellData.checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (cellData.checkOut < hour16) {
                bgClass = 'background:#f9f0ff; border-left:3px solid #722ed1;';
                label = 'VỀ SỚM';
                labelColor = '#531dab';
            } else {
                bgClass = 'background:#f6ffed; border-left:3px solid #52c41a;';
                label = 'ĐÚNG GIỜ';
                labelColor = '#389e0d';
            }
        } else {
            bgClass = 'background:#f6ffed; border-left:3px solid #52c41a;';
            label = 'ĐÚNG GIỜ';
            labelColor = '#389e0d';
        }

        const salaryText = daySalary.totalSalary > 0 ? `${formatVND(daySalary.totalSalary)}đ` : '';
        const checked = isFullDay(empId, dateKey);
        const showCheckbox = status !== 'absent' && status !== 'incomplete' && cellData.checkOut;

        return `
            <div class="ts-block" style="${bgClass} cursor:pointer; position:relative;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:11px; color:${labelColor};">${label}</div>
                ${salaryText ? `<div style="font-size:10px; color:#8c8c8c; margin-top:2px;">${salaryText}</div>` : ''}
                ${showCheckbox ? `<label onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:3px; margin-top:3px; cursor:pointer; font-size:10px; color:#8c8c8c;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._attendance.toggleFullDay('${empId}','${dateKey}')" style="margin:0; cursor:pointer;">
                    <span>Full</span>
                </label>` : ''}
            </div>
        `;
    }

    // ================================================================
    // RENDERING - MONTHLY VIEW (Theo tháng)
    // ================================================================

    function renderMonthlySchedule() {
        const thead = document.querySelector('#scheduleGrid thead tr');
        const tbody = document.querySelector('#scheduleGrid tbody');
        if (!thead || !tbody) return;

        // Update pager label
        const scLabel = document.querySelector('#viewSchedule .ts-pager span');
        if (scLabel) {
            const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
            scLabel.textContent = `${monthNames[currentMonth.month]} ${currentMonth.year}`;
        }

        // Header
        thead.innerHTML = `
            <th class="ts-col-fixed">Nhân viên</th>
            <th style="text-align:center;">Ngày công</th>
            <th style="text-align:right;">Lương CB</th>
            <th style="text-align:right;">Trừ muộn</th>
            <th style="text-align:right;">OT</th>
            <th style="text-align:right; min-width:130px;">Tổng lương tháng</th>
        `;

        if (employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:60px 20px; color:#94a3b8;">Chưa có dữ liệu</td></tr>`;
            return;
        }

        const records = monthRecords;
        const y = currentMonth.year;
        const m = currentMonth.month;
        const lastDay = new Date(y, m, 0).getDate();

        // Tính lương tháng cho từng nhân viên
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            let totalBase = 0, totalLate = 0, totalOT = 0, totalSalary = 0, workedDays = 0;
            const lateDays = []; // chi tiết ngày bị trừ muộn
            const otDays = []; // chi tiết ngày có OT

            const empRate = emp.dailyRate || SALARY.DAILY_RATE;
            for (let d = 1; d <= lastDay; d++) {
                const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayRecs = records.filter(r => String(r.deviceUserId) === empId && r.dateKey === dateKey);
                const cellData = processDayRecords(dayRecs);
                const sal = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey));
                totalBase += sal.baseSalary;
                totalLate += sal.lateDeduction;
                totalOT += sal.otPay;
                totalSalary += sal.totalSalary;
                if (sal.totalSalary > 0) workedDays++;
                if (sal.lateDeduction > 0) lateDays.push({ dateKey, minutes: sal.lateMinutes, amount: sal.lateDeduction });
                if (sal.otPay > 0) otDays.push({ dateKey, minutes: sal.otMinutes, amount: sal.otPay });
            }

            return { emp, empId, workedDays, totalBase, totalLate, totalOT, totalSalary, lateDays, otDays };
        });

        empData.sort((a, b) => b.totalSalary - a.totalSalary);
        monthlyEmpData = empData; // cache for detail view

        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));

        let html = '';

        // Grand total row
        const gt = visibleData.reduce((acc, e) => {
            acc.base += e.totalBase; acc.late += e.totalLate; acc.ot += e.totalOT; acc.total += e.totalSalary; acc.days += e.workedDays;
            return acc;
        }, { base: 0, late: 0, ot: 0, total: 0, days: 0 });

        html += `
            <tr style="background:#fafafa;">
                <td class="ts-col-fixed" style="border:none; background:#fafafa;"></td>
                <td style="border:none;"></td>
                <td style="border:none;"></td>
                <td style="border:none;"></td>
                <td style="border:none;"></td>
                <td style="text-align:right; font-weight:700; font-size:15px; color:#d4380d; border:none;">
                    ${formatVND(gt.total)}đ
                </td>
            </tr>
        `;

        for (const d of visibleData) {
            const { emp, empId, workedDays, totalBase, totalLate, totalOT, totalSalary, lateDays, otDays } = d;
            const lateId = `late_${empId}`;
            const otId = `ot_${empId}`;
            html += `
                <tr>
                    ${renderEmpNameCell(emp, empId, false)}
                    <td style="text-align:center; font-weight:600;">${workedDays > 0 ? workedDays + ' ngày' : '-'}</td>
                    <td style="text-align:right; color:#1e293b;">${totalBase > 0 ? formatVND(totalBase) + 'đ' : '-'}</td>
                    <td style="text-align:right; color:${totalLate > 0 ? '#cf1322' : '#bfbfbf'}; ${totalLate > 0 ? 'cursor:pointer; text-decoration:underline;' : ''}"
                        ${totalLate > 0 ? `onclick="window._attendance.showMonthlyDetail('${empId}','late')"` : ''}>
                        ${totalLate > 0 ? '-' + formatVND(totalLate) + 'đ' : '-'}
                    </td>
                    <td style="text-align:right; color:${totalOT > 0 ? '#096dd9' : '#bfbfbf'}; ${totalOT > 0 ? 'cursor:pointer; text-decoration:underline;' : ''}"
                        ${totalOT > 0 ? `onclick="window._attendance.showMonthlyDetail('${empId}','ot')"` : ''}>
                        ${totalOT > 0 ? '+' + formatVND(totalOT) + 'đ' : '-'}
                    </td>
                    <td style="text-align:right;">
                        <div style="font-weight:700; font-size:14px; color:${totalSalary > 0 ? '#1e293b' : '#bfbfbf'};">
                            ${totalSalary > 0 ? formatVND(totalSalary) + 'đ' : '-'}
                        </div>
                    </td>
                </tr>
            `;
        }

        // Hidden employees
        if (hiddenData.length > 0) {
            html += `
                <tr><td colspan="6" style="text-align:center; padding:8px; border:none;">
                    <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                        ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenData.length} nhân viên đã ẩn
                    </span>
                </td></tr>
            `;
            if (showHidden) {
                for (const { emp, empId, workedDays, totalBase, totalLate, totalOT, totalSalary } of hiddenData) {
                    html += `
                        <tr style="opacity:0.5;">
                            ${renderEmpNameCell(emp, empId, true)}
                            <td style="text-align:center; color:#8c8c8c;">${workedDays > 0 ? workedDays + ' ngày' : '-'}</td>
                            <td style="text-align:right; color:#8c8c8c;">${totalBase > 0 ? formatVND(totalBase) + 'đ' : '-'}</td>
                            <td style="text-align:right; color:#8c8c8c;">${totalLate > 0 ? '-' + formatVND(totalLate) + 'đ' : '-'}</td>
                            <td style="text-align:right; color:#8c8c8c;">${totalOT > 0 ? '+' + formatVND(totalOT) + 'đ' : '-'}</td>
                            <td style="text-align:right; color:#8c8c8c;">${totalSalary > 0 ? formatVND(totalSalary) + 'đ' : '-'}</td>
                        </tr>
                    `;
                }
            }
        }

        tbody.innerHTML = html;
    }

    /** Hiện chi tiết trừ muộn / OT theo ngày */
    function showMonthlyDetail(empId, type) {
        const data = monthlyEmpData.find(d => d.empId === String(empId));
        if (!data) return;

        const empName = data.emp.name || `User ${empId}`;
        const items = type === 'late' ? data.lateDays : data.otDays;
        const title = type === 'late' ? 'Chi tiết trừ muộn' : 'Chi tiết OT';
        const color = type === 'late' ? '#cf1322' : '#096dd9';

        let total = 0;
        let listHtml = items.map(item => {
            total += item.amount;
            const d = new Date(item.dateKey);
            const dayName = SHORT_DAY_NAMES[d.getDay()];
            const dayNum = item.dateKey.split('-').reverse().join('/');
            if (type === 'late') {
                return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0;">
                    <span>${dayName} ${dayNum} — muộn ${item.minutes} phút</span>
                    <span style="color:${color}; font-weight:600;">-${formatVND(item.amount)}đ</span>
                </div>`;
            } else {
                const h = Math.floor(item.minutes / 60);
                const m = item.minutes % 60;
                const display = h > 0 ? `${h}h${m > 0 ? m + 'p' : ''}` : `${m}p`;
                return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0;">
                    <span>${dayName} ${dayNum} — OT ${display}</span>
                    <span style="color:${color}; font-weight:600;">+${formatVND(item.amount)}đ</span>
                </div>`;
            }
        }).join('');

        const sign = type === 'late' ? '-' : '+';

        // Show in a simple popup modal
        let modal = document.getElementById('monthlyDetailModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'monthlyDetailModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; padding:20px; width:400px; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div>
                        <div style="font-size:15px; font-weight:600; color:#1e293b;">${title}</div>
                        <div style="font-size:12px; color:#8c8c8c;">${empName}</div>
                    </div>
                    <button onclick="document.getElementById('monthlyDetailModal').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:#8c8c8c;">✕</button>
                </div>
                <div style="font-size:13px;">${listHtml}</div>
                <div style="display:flex; justify-content:space-between; padding:10px 0 0; margin-top:4px; font-weight:700; font-size:14px;">
                    <span>Tổng (${items.length} ngày)</span>
                    <span style="color:${color};">${sign}${formatVND(total)}đ</span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /** Render trạng thái sync */
    function renderSyncStatus() {
        const el = document.getElementById('syncIndicator');
        if (!el) return;

        if (!syncStatus) {
            el.style.cssText = 'width:8px; height:8px; border-radius:50%; background:#d1d5db; display:inline-block;';
            el.title = 'Chưa có kết nối sync service';
            return;
        }

        const connected = syncStatus.connected;
        const lastSync = syncStatus.lastSyncTime;
        let lastSyncStr = '';

        if (lastSync) {
            const d = lastSync.toDate ? lastSync.toDate() : new Date(lastSync);
            lastSyncStr = d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        }

        el.style.cssText = `width:8px; height:8px; border-radius:50%; display:inline-block; background:${connected ? '#52c41a' : '#ff4d4f'};`;
        el.title = connected
            ? `Đã kết nối máy chấm công\nSync lần cuối: ${lastSyncStr}`
            : `Mất kết nối máy chấm công\n${syncStatus.lastError || ''}`;
    }

    /** Cập nhật label tuần */
    function renderWeekLabel() {
        // Timesheet view
        const tsLabel = document.querySelector('#viewTimesheet .ts-pager span');
        if (tsLabel) tsLabel.textContent = getWeekLabel();

        // Schedule view
        const scLabel = document.querySelector('#viewSchedule .ts-pager span');
        if (scLabel) scLabel.textContent = getWeekLabel();
    }

    // ================================================================
    // EVENTS
    // ================================================================

    function bindEvents() {
        // Week navigation - Timesheet
        const tsPager = document.querySelector('#viewTimesheet .ts-pager');
        if (tsPager) {
            const btns = tsPager.querySelectorAll('button');
            if (btns[0]) btns[0].addEventListener('click', () => changeWeek(-1));
            if (btns[1]) btns[1].addEventListener('click', () => changeWeek(1));
        }

        // Week navigation - Schedule
        const scPager = document.querySelector('#viewSchedule .ts-pager');
        if (scPager) {
            const btns = scPager.querySelectorAll('button');
            if (btns[0]) btns[0].addEventListener('click', () => changeWeek(-1));
            if (btns[1]) btns[1].addEventListener('click', () => changeWeek(1));
        }

        // "Tuần này / Tháng này" button
        const btnSchedNow = document.getElementById('btnSchedNow');
        if (btnSchedNow) {
            btnSchedNow.addEventListener('click', () => {
                if (viewPeriod === 'month') {
                    const now = new Date();
                    currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
                    loadMonthData();
                } else {
                    currentWeekStart = getMonday(new Date());
                    loadWeekData();
                }
            });
        }

        // Period select (Theo tuần / Theo tháng)
        const periodSelect = document.getElementById('schedPeriodSelect');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                viewPeriod = e.target.value;
                if (viewPeriod === 'month') {
                    btnSchedNow.textContent = 'Tháng này';
                    if (!currentMonth) {
                        const now = new Date();
                        currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
                    }
                    loadMonthData();
                } else {
                    btnSchedNow.textContent = 'Tuần này';
                    loadWeekData();
                }
            });
        }

        // Reload button
        const btnReload = document.getElementById('btnSchedReload');
        if (btnReload) {
            btnReload.addEventListener('click', () => {
                loadEmployees().then(() => {
                    if (viewPeriod === 'month') loadMonthData();
                    else loadWeekData();
                });
            });
        }

        // "Chọn" button in timesheet → go to this week
        const btnChoose = document.querySelector('#viewTimesheet .ts-header-left .ts-btn');
        if (btnChoose && btnChoose.textContent.trim() === 'Chọn') {
            btnChoose.textContent = 'Tuần này';
            btnChoose.addEventListener('click', () => {
                currentWeekStart = getMonday(new Date());
                loadWeekData();
            });
        }

        // Search employee
        const searchInputs = document.querySelectorAll('.ts-search input');
        searchInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                filterEmployees(e.target.value);
            });
        });

        // Sync buttons
        const moreBtn = document.querySelector('#viewTimesheet .ts-header-right .ts-btn:last-child');
        if (moreBtn) {
            moreBtn.title = 'Đồng bộ ngay';
            moreBtn.addEventListener('click', () => sendSyncCommand());
        }
        const btnSchedSync = document.getElementById('btnSchedSync');
        if (btnSchedSync) {
            btnSchedSync.addEventListener('click', () => sendSyncCommand());
        }
    }

    function changeWeek(delta) {
        if (viewPeriod === 'month') {
            let m = currentMonth.month + delta;
            let y = currentMonth.year;
            if (m > 12) { m = 1; y++; }
            if (m < 1) { m = 12; y--; }
            currentMonth = { year: y, month: m };
            loadMonthData();
        } else {
            currentWeekStart.setDate(currentWeekStart.getDate() + (7 * delta));
            loadWeekData();
        }
    }

    function filterEmployees(keyword) {
        if (!keyword) {
            renderTimesheetBody();
            renderScheduleBody();
            return;
        }

        const kw = keyword.toLowerCase();

        // Lọc cả 2 view
        ['#viewTimesheet .ts-grid tbody', '#scheduleGrid tbody'].forEach(sel => {
            const tbody = document.querySelector(sel);
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(row => {
                const nameCell = row.querySelector('.ts-col-fixed div');
                if (nameCell) {
                    const name = nameCell.textContent.toLowerCase();
                    row.style.display = name.includes(kw) ? '' : 'none';
                }
            });
        });
    }

    // ================================================================
    // COMMANDS - Gửi lệnh xuống sync service
    // ================================================================

    /** Yêu cầu sync ngay lập tức */
    async function sendSyncCommand() {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'sync_now',
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification('Đã gửi lệnh đồng bộ', 'success');
            // Reload data sau 5s
            setTimeout(() => loadWeekData(), 5000);
        } catch (err) {
            showNotification('Lỗi gửi lệnh: ' + err.message, 'error');
        }
    }

    /** Thêm user vào máy chấm công (bước 1 trước khi đăng ký vân tay) */
    async function addDeviceUser(name, deviceUserId) {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'add_user',
                employeeName: name,
                deviceUserId: String(deviceUserId),
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification(`Đang thêm "${name}" vào máy chấm công...`, 'info');
        } catch (err) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    }

    /** Yêu cầu đăng ký vân tay */
    async function enrollFingerprint(name, deviceUserId) {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'enroll_fingerprint',
                employeeName: name,
                deviceUserId: String(deviceUserId),
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification(`Đang đăng ký vân tay cho "${name}". Nhân viên cần đến máy chấm công để quẹt tay.`, 'info');
        } catch (err) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    }

    // ================================================================
    // DETAIL MODAL
    // ================================================================

    /** Hiện chi tiết chấm công 1 nhân viên 1 ngày */
    function showDetail(empId, dateKey) {
        const modal = document.getElementById('attendanceModal');
        if (!modal) return;

        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        const empName = emp ? emp.name : `User ${empId}`;

        // Header: tên + ngày + ca
        const nameEl = modal.querySelector('#detailEmpName');
        const subEl = modal.querySelector('#detailSubInfo');
        if (nameEl) nameEl.textContent = empName;
        if (subEl) subEl.textContent = `${dateKey} · Vân tay (DG-600)`;

        // Tìm records cho ngày này
        const dayRecords = weekRecords
            .filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
            .map(r => ({
                ...r,
                time: r.checkTime ? (r.checkTime.toDate ? r.checkTime.toDate() : new Date(r.checkTime)) : null
            }))
            .filter(r => r.time)
            .sort((a, b) => a.time - b.time);

        // Giờ vào / Giờ ra
        const timeInputs = modal.querySelectorAll('input[type="time"]');
        if (timeInputs[0]) timeInputs[0].value = dayRecords.length > 0 ? formatTime(dayRecords[0].time) : '';
        if (timeInputs[1]) timeInputs[1].value = dayRecords.length > 1 ? formatTime(dayRecords[dayRecords.length - 1].time) : '';

        // Hiện danh sách tất cả lần quẹt + tính lương
        const noteArea = modal.querySelector('textarea');
        if (noteArea && dayRecords.length > 0) {
            const lines = dayRecords.map((r, i) =>
                `Lần ${i + 1}: ${formatTime(r.time)} (${r.type === 1 ? 'Ra' : 'Vào'})`
            );

            // Tính lương cho ngày này
            const cellData = processDayRecords(
                weekRecords.filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
            );
            const empRate = emp ? (emp.dailyRate || SALARY.DAILY_RATE) : SALARY.DAILY_RATE;
            const fdOverride = isFullDay(String(empId), dateKey);
            const salary = calculateDaySalary(cellData, empRate, fdOverride);

            lines.push('');
            lines.push('════════════════════════════');

            if (cellData.status === 'incomplete') {
                lines.push('Chấm công thiếu → Không tính lương');
            } else {
                // Tổng giờ làm
                const workedMs = cellData.checkOut - cellData.checkIn;
                const workedH = Math.floor(workedMs / (1000 * 60 * 60));
                const workedM = Math.floor((workedMs % (1000 * 60 * 60)) / (1000 * 60));
                lines.push(`TỔNG GIỜ LÀM: ${workedH}h${workedM > 0 ? workedM + 'p' : ''}`);
                lines.push('────────────────────────────');

                const hourlyRate = empRate / 12;
                const baseH = Math.floor(salary.baseMinutes / 60);
                const baseM = salary.baseMinutes % 60;
                const baseDisplay = `${baseH}h${baseM > 0 ? baseM + 'p' : ''}`;

                if (salary.fullDayOverride) {
                    lines.push(`✅ Check Full → Lương CB: ${formatVND(salary.baseSalary)}đ`);
                } else {
                    lines.push(`Lương/giờ: ${formatVND(empRate)}đ ÷ 12 = ${formatVND(hourlyRate)}đ/h`);
                    lines.push(`Giờ cơ bản: ${baseDisplay} (8:00-20:00)`);
                    if (salary.earlyLeave) {
                        const fullBase = Math.round(hourlyRate * salary.baseMinutes / 60);
                        lines.push(`→ Lương CB: ${formatVND(hourlyRate)}đ/h × ${baseDisplay} = ${formatVND(fullBase)}đ`);
                        lines.push(`⚠ Về sớm (trước 16:00) → chia đôi: ${formatVND(salary.baseSalary)}đ`);
                    } else {
                        lines.push(`→ Lương CB: ${formatVND(hourlyRate)}đ/h × ${baseDisplay} = ${formatVND(salary.baseSalary)}đ`);
                    }
                }

                if (salary.lateMinutes > 0) {
                    lines.push('');
                    lines.push(`⏰ Đi muộn ${salary.lateMinutes} phút (sau 8:00)`);
                    lines.push(`→ Trừ: ${salary.lateMinutes}p × ${formatVND(SALARY.LATE_PENALTY_PER_MIN)}đ = -${formatVND(salary.lateDeduction)}đ`);
                }

                if (salary.otMinutes > 0) {
                    const otH = Math.floor(salary.otMinutes / 60);
                    const otM = salary.otMinutes % 60;
                    const otDisplay = otH > 0 ? `${otH}h${otM > 0 ? otM + 'p' : ''}` : `${otM}p`;
                    const otRate = hourlyRate * SALARY.OT_MULTIPLIER;
                    lines.push('');
                    lines.push(`🌙 Làm thêm ${otDisplay} (sau 20:00)`);
                    lines.push(`→ OT: ${formatVND(otRate)}đ/h × ${otDisplay} = +${formatVND(salary.otPay)}đ`);
                }

                lines.push('────────────────────────────');
                lines.push(`💰 TỔNG LƯƠNG: ${formatVND(salary.totalSalary)}đ`);
            }

            noteArea.value = lines.join('\n');
        } else if (noteArea) {
            noteArea.value = 'Không có bản ghi chấm công';
        }

        modal.style.display = 'flex';

        // Close button
        const closeBtn = modal.querySelector('.btn-icon');
        if (closeBtn) {
            closeBtn.onclick = () => { modal.style.display = 'none'; };
        }
    }

    // ================================================================
    // SALARY EDIT MODAL
    // ================================================================

    function showSalaryModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const currentRate = emp.dailyRate || SALARY.DAILY_RATE;
        const modal = document.getElementById('salaryModal');
        if (!modal) return;

        const nameEl = modal.querySelector('#salaryEmpName');
        const input = modal.querySelector('#salaryRateInput');
        const saveBtn = modal.querySelector('#btnSaveSalary');
        const closeBtn = modal.querySelector('.btn-icon');

        if (nameEl) nameEl.textContent = emp.name || `User ${empId}`;
        if (input) input.value = currentRate;

        modal.style.display = 'flex';

        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };

        if (saveBtn) {
            saveBtn.onclick = async () => {
                const newRate = parseInt(input.value);
                if (isNaN(newRate) || newRate <= 0) {
                    showNotification('Vui lòng nhập lương hợp lệ', 'error');
                    return;
                }

                try {
                    const docId = String(emp.id || emp.userId);
                    // Test employees (in-memory only) → skip Firestore
                    if (!docId.startsWith('test_')) {
                        await db.collection(COLLECTIONS.deviceUsers).doc(docId).update({
                            dailyRate: newRate
                        });
                    }
                    emp.dailyRate = newRate;
                    modal.style.display = 'none';
                    showNotification(`Đã cập nhật lương ${emp.name}: ${formatVND(newRate)}đ/ngày`, 'success');
                    renderTimesheet();
                    renderSchedule();
                } catch (err) {
                    console.error('[Attendance] Lỗi lưu lương:', err);
                    showNotification('Lỗi: ' + err.message, 'error');
                }
            };
        }
    }

    // ================================================================
    // HELPERS
    // ================================================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function refreshIcons() {
        if (typeof lucide !== 'undefined') {
            try { lucide.createIcons(); } catch (e) { }
        }
    }

    function showNotification(message, type) {
        // Sử dụng notification manager nếu có
        if (window.notificationManager && window.notificationManager.show) {
            window.notificationManager.show(message, type);
            return;
        }

        // Fallback: tạo notification đơn giản
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            padding: 12px 20px; border-radius: 8px; font-size: 14px;
            color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#1890ff'};
            transition: opacity 0.3s;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    }

    // ================================================================
    // TEST DATA - Tạo nhân viên ảo để test lương (không lưu, F5 mất)
    // ================================================================

    let testEmployees = [];
    let testRecords = [];

    function showTestModal() {
        // Xoá modal cũ nếu có
        let modal = document.getElementById('testDataModal');
        if (modal) modal.remove();

        const dates = getWeekDates();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        modal = document.createElement('div');
        modal.id = 'testDataModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; padding:24px; width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:16px; color:#1e293b;">Tạo nhân viên test</h3>
                    <button onclick="document.getElementById('testDataModal').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:#8c8c8c;">✕</button>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="font-size:13px; font-weight:500; color:#475569;">Tên nhân viên</label>
                    <input id="testEmpName" type="text" value="NV Test" style="width:100%; padding:8px 12px; border:1px solid #d9d9d9; border-radius:6px; margin-top:4px; font-size:14px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px; font-size:13px; font-weight:500; color:#475569;">Giờ vào - ra cho từng ngày:</div>
                <div id="testDayRows" style="display:flex; flex-direction:column; gap:8px;">
                    ${dates.map((d, i) => {
                        const dayName = DAY_NAMES[d.getDay()];
                        const dayNum = d.getDate();
                        const isPast = d <= today;
                        return `
                            <div style="display:flex; align-items:center; gap:8px; padding:8px; background:${isPast ? '#fafafa' : '#f8f8f8'}; border-radius:6px; opacity:${isPast ? 1 : 0.5};">
                                <label style="width:90px; font-size:12px; font-weight:500; color:#475569; flex-shrink:0;">${dayName} ${dayNum}</label>
                                <input type="checkbox" id="testDay${i}" ${isPast && d.getDay() !== 0 ? 'checked' : ''} style="margin:0;">
                                <input type="text" id="testIn${i}" value="07:55" placeholder="HH:MM" maxlength="5" style="width:60px; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; font-size:13px; text-align:center;">
                                <span style="color:#8c8c8c;">→</span>
                                <input type="text" id="testOut${i}" value="19:50" placeholder="HH:MM" maxlength="5" style="width:60px; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; font-size:13px; text-align:center;">
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="display:flex; gap:8px; margin-top:20px;">
                    <button id="btnAddTest" style="flex:1; padding:10px; background:#1890ff; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer;">Thêm nhân viên test</button>
                    <button id="btnClearTest" style="padding:10px 16px; background:#fff; color:#ff4d4f; border:1px solid #ff4d4f; border-radius:6px; font-size:14px; cursor:pointer;">Xoá test</button>
                </div>
                <div style="margin-top:12px; font-size:11px; color:#8c8c8c; text-align:center;">Dữ liệu test chỉ tồn tại trong phiên này, F5 sẽ mất</div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add test employee
        document.getElementById('btnAddTest').addEventListener('click', () => {
            const name = document.getElementById('testEmpName').value.trim() || 'NV Test';
            const testId = 'test_' + Date.now();

            // Thêm employee ảo
            testEmployees.push({ id: testId, userId: testId, name, isTest: true });

            // Thêm records ảo cho từng ngày được chọn
            for (let i = 0; i < 7; i++) {
                const cb = document.getElementById(`testDay${i}`);
                if (!cb || !cb.checked) continue;

                const inVal = document.getElementById(`testIn${i}`).value;
                const outVal = document.getElementById(`testOut${i}`).value;
                if (!inVal) continue;

                const date = dates[i];
                const dateKey = toDateKey(date);

                // Check-in record
                const [inH, inM] = inVal.split(':').map(Number);
                const checkInTime = new Date(date);
                checkInTime.setHours(inH, inM, 0, 0);
                testRecords.push({
                    id: `test_rec_${testId}_${i}_in`,
                    deviceUserId: testId,
                    dateKey,
                    checkTime: checkInTime,
                    type: 0
                });

                // Check-out record
                if (outVal) {
                    const [outH, outM] = outVal.split(':').map(Number);
                    const checkOutTime = new Date(date);
                    checkOutTime.setHours(outH, outM, 0, 0);
                    testRecords.push({
                        id: `test_rec_${testId}_${i}_out`,
                        deviceUserId: testId,
                        dateKey,
                        checkTime: checkOutTime,
                        type: 1
                    });
                }
            }

            // Merge vào data hiện tại và re-render
            mergeTestData();
            modal.remove();
            showNotification(`Đã thêm nhân viên test "${name}"`, 'success');
        });

        // Clear all test data
        document.getElementById('btnClearTest').addEventListener('click', () => {
            clearTestData();
            modal.remove();
            showNotification('Đã xoá tất cả dữ liệu test', 'info');
        });
    }

    function mergeTestData() {
        // Gộp test employees vào employees (loại bỏ duplicates)
        employees = employees.filter(e => !e.isTest);
        employees.push(...testEmployees);
        employees.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

        // Gộp test records vào weekRecords
        weekRecords = weekRecords.filter(r => !String(r.id).startsWith('test_rec_'));
        weekRecords.push(...testRecords);

        renderTimesheet();
        renderSchedule();
    }

    function clearTestData() {
        testEmployees = [];
        testRecords = [];
        employees = employees.filter(e => !e.isTest);
        weekRecords = weekRecords.filter(r => !String(r.id).startsWith('test_rec_'));
        renderTimesheet();
        renderSchedule();
    }

    // Inject test button vào header
    function injectTestButton() {
        // Inject vào cả 2 view
        ['#viewTimesheet .ts-header-right', '#viewSchedule .ts-header-right'].forEach(sel => {
            const headerRight = document.querySelector(sel);
            if (!headerRight) return;

            const btn = document.createElement('button');
            btn.className = 'ts-btn';
            btn.style.cssText = 'background:#fff7e6; color:#d46b08; border:1px solid #ffd591;';
            btn.innerHTML = '<i data-lucide="user-plus" style="width:14px; height:14px;"></i> Test';
            btn.title = 'Tạo nhân viên ảo để test lương';
            btn.addEventListener('click', showTestModal);

            // Chèn trước nút reload/more
            const lastBtn = headerRight.querySelector('.ts-btn:last-child');
            headerRight.insertBefore(btn, lastBtn);
        });
        refreshIcons();
    }

    // ================================================================
    // PUBLIC API
    // ================================================================
    window._attendance = {
        init,
        showDetail,
        showSalaryModal,
        addDeviceUser,
        enrollFingerprint,
        sendSync: sendSyncCommand,
        reload: () => loadEmployees().then(() => loadWeekData()),
        showTestModal,
        hideEmployee,
        unhideEmployee,
        toggleHidden,
        toggleFullDay,
        showMonthlyDetail,
    };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Chờ firebase init xong
            setTimeout(init, 500);
        });
    } else {
        setTimeout(init, 500);
    }
})();
