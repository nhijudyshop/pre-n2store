// js/totals.js - Total Calculation System

function initializeTotalCalculation() {
    showTotalDetailsAlways();
    updateAllTotals();
}

function showTotalDetailsAlways() {
    const totalGrid = document.querySelector(".total-grid");
    const totalSummary = document.querySelector(".total-summary");

    if (totalGrid) {
        const totalCards = totalGrid.querySelectorAll(".total-card");
        totalCards.forEach((card) => {
            card.style.display = "block";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        });

        totalGrid.style.gridTemplateColumns =
            "repeat(auto-fit, minmax(180px, 1fr))";
    }

    if (totalSummary) {
        totalSummary.style.cursor = "default";
        updateTotalSummaryTitle("Tổng kết Tiền QC");
    }
}

function updateTotalSummaryTitle(newTitle) {
    const summaryTitle = document.querySelector(".total-summary h2");
    if (summaryTitle) {
        summaryTitle.textContent = newTitle;
    }
}

function calculateTotalAmounts() {
    if (!arrayData || arrayData.length === 0) {
        return {
            all: { amount: 0, count: 0 },
            today: { amount: 0, count: 0 },
            week: { amount: 0, count: 0 },
            month: { amount: 0, count: 0 },
            filtered: { amount: 0, count: 0 },
        };
    }

    const today = new Date();
    const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    );
    const endOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
    );

    // Sửa logic tính tuần: Tuần bắt đầu từ thứ 2 (Monday)
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Nếu là CN thì lùi 6 ngày, nếu không thì lùi (dayOfWeek - 1) ngày
    startOfWeek.setDate(today.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Thêm 6 ngày để có 7 ngày (Thứ 2 đến CN)
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59,
    );

    const totals = {
        all: { amount: 0, count: 0 },
        today: { amount: 0, count: 0 },
        week: { amount: 0, count: 0 },
        month: { amount: 0, count: 0 },
        filtered: { amount: 0, count: 0 },
    };

    // Debug log để kiểm tra
    console.log("Today:", today.toLocaleDateString("vi-VN"));
    console.log("Start of week:", startOfWeek.toLocaleDateString("vi-VN"));
    console.log("End of week:", endOfWeek.toLocaleDateString("vi-VN"));

    arrayData.forEach((item) => {
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        const itemDate = new Date(parseInt(item.dateCell));

        // Debug log cho từng item
        console.log(
            "Item date:",
            itemDate.toLocaleDateString("vi-VN"),
            "Amount:",
            amount,
        );

        totals.all.amount += amount;
        totals.all.count++;

        if (itemDate >= startOfToday && itemDate <= endOfToday) {
            totals.today.amount += amount;
            totals.today.count++;
            console.log("Added to today:", amount);
        }

        if (itemDate >= startOfWeek && itemDate <= endOfWeek) {
            totals.week.amount += amount;
            totals.week.count++;
            console.log("Added to week:", amount);
        }

        if (itemDate >= startOfMonth && itemDate <= endOfMonth) {
            totals.month.amount += amount;
            totals.month.count++;
            console.log("Added to month:", amount);
        }
    });

    filteredDataForTotal = getFilteredDataForTotal();
    filteredDataForTotal.forEach((item) => {
        let amount = 0;
        if (item.tienQC) {
            const cleanAmount = item.tienQC.toString().replace(/[,\.]/g, "");
            amount = parseFloat(cleanAmount) || 0;
        }

        totals.filtered.amount += amount;
        totals.filtered.count++;
    });

    console.log("Week totals:", totals.week);
    return totals;
}

function getFilteredDataForTotal() {
    if (!arrayData || arrayData.length === 0) return [];

    if (
        currentFilters &&
        (currentFilters.startDate || currentFilters.endDate)
    ) {
        const startDate = currentFilters.startDate;
        const endDate = currentFilters.endDate;

        if (!startDate || !endDate) {
            return arrayData;
        }

        const startTime = new Date(startDate + "T00:00:00").getTime();
        const endTime = new Date(endDate + "T23:59:59").getTime();

        return arrayData.filter((item) => {
            const itemTime = parseInt(item.dateCell);
            return itemTime >= startTime && itemTime <= endTime;
        });
    }

    return arrayData;
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return "0 ₫";
    return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

function updateAllTotals() {
    const totals = calculateTotalAmounts();

    const totalAllAmount = document.getElementById("totalAllAmount");
    const totalAllCount = document.getElementById("totalAllCount");
    const totalTodayAmount = document.getElementById("totalTodayAmount");
    const totalTodayCount = document.getElementById("totalTodayCount");
    const totalWeekAmount = document.getElementById("totalWeekAmount");
    const totalWeekCount = document.getElementById("totalWeekCount");
    const totalMonthAmount = document.getElementById("totalMonthAmount");
    const totalMonthCount = document.getElementById("totalMonthCount");
    const totalFilteredAmount = document.getElementById("totalFilteredAmount");
    const totalFilteredCount = document.getElementById("totalFilteredCount");

    if (totalAllAmount)
        totalAllAmount.textContent = formatCurrency(totals.all.amount);
    if (totalAllCount)
        totalAllCount.textContent = totals.all.count + " báo cáo";

    if (totalTodayAmount)
        totalTodayAmount.textContent = formatCurrency(totals.today.amount);
    if (totalTodayCount)
        totalTodayCount.textContent = totals.today.count + " báo cáo";

    if (totalWeekAmount)
        totalWeekAmount.textContent = formatCurrency(totals.week.amount);
    if (totalWeekCount)
        totalWeekCount.textContent = totals.week.count + " báo cáo";

    if (totalMonthAmount)
        totalMonthAmount.textContent = formatCurrency(totals.month.amount);
    if (totalMonthCount)
        totalMonthCount.textContent = totals.month.count + " báo cáo";

    if (totalFilteredAmount)
        totalFilteredAmount.textContent = formatCurrency(
            totals.filtered.amount,
        );
    if (totalFilteredCount)
        totalFilteredCount.textContent = totals.filtered.count + " báo cáo";

    console.log("Updated totals:", totals);
}

// Export functions
window.initializeTotalCalculation = initializeTotalCalculation;
window.updateAllTotals = updateAllTotals;
window.calculateTotalAmounts = calculateTotalAmounts;
window.formatCurrency = formatCurrency;
