// =====================================================
// SỔ QUỸ - REPORT MODULE
// File: soquy-report.js
// =====================================================

const SoquyReport = (function () {
    const config = window.SoquyConfig;
    const dbModule = window.SoquyDatabase;

    // =====================================================
    // REPORT STATE
    // =====================================================

    const reportState = {
        reportType: 'overview', // 'overview', 'payment_cn', 'payment_kd', 'receipt'
        fundType: 'all',
        timeFilter: 'this_year',
        customStartDate: null,
        customEndDate: null,
        categoryFilter: '',
        sourceFilter: '',
        creatorFilter: '',
        topTab: 'expense', // 'expense' | 'income'
        vouchers: [],        // raw fetched vouchers
        filtered: [],        // after filters applied
        isLoading: false
    };

    // =====================================================
    // DATA FETCHING
    // =====================================================

    function getReportDateRange() {
        const now = new Date();
        let startDate, endDate;

        switch (reportState.timeFilter) {
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                break;
            case 'this_quarter': {
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
            }
            case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            case 'custom':
                startDate = reportState.customStartDate ? new Date(reportState.customStartDate + 'T00:00:00') : null;
                endDate = reportState.customEndDate ? new Date(reportState.customEndDate + 'T23:59:59') : null;
                break;
            default:
                startDate = null;
                endDate = null;
        }

        return { startDate, endDate };
    }

    function getPreviousDateRange() {
        const now = new Date();
        let startDate, endDate;

        switch (reportState.timeFilter) {
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59);
                break;
            case 'this_quarter': {
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3 - 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3, 0, 23, 59, 59);
                break;
            }
            case 'this_year':
                startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
                break;
            default:
                return null;
        }

        return { startDate, endDate };
    }

    async function fetchReportData() {
        try {
            reportState.isLoading = true;

            const snapshot = await config.soquyCollectionRef
                .orderBy('voucherDateTime', 'desc')
                .get();

            let vouchers = [];
            snapshot.forEach(doc => {
                vouchers.push({ id: doc.id, ...doc.data() });
            });

            // Normalize legacy 'payment' type
            vouchers = vouchers.map(v => {
                if (v.type === 'payment') {
                    v.type = v.businessAccounting ? 'payment_kd' : 'payment_cn';
                }
                return v;
            });

            // Only paid vouchers for reports
            vouchers = vouchers.filter(v => v.status === config.VOUCHER_STATUS.PAID);

            // Fund type filter
            if (reportState.fundType !== 'all') {
                vouchers = vouchers.filter(v => v.fundType === reportState.fundType);
            }

            // Time filter
            const { startDate, endDate } = getReportDateRange();
            if (startDate && endDate) {
                vouchers = vouchers.filter(v => {
                    const vDate = dbModule.toDate(v.voucherDateTime);
                    return vDate >= startDate && vDate <= endDate;
                });
            }

            reportState.vouchers = vouchers;
            applyReportFilters();

        } catch (error) {
            console.error('[SoquyReport] Error fetching data:', error);
            reportState.vouchers = [];
            reportState.filtered = [];
        } finally {
            reportState.isLoading = false;
        }
    }

    function applyReportFilters() {
        let vouchers = [...reportState.vouchers];

        // Category filter
        if (reportState.categoryFilter) {
            const cat = reportState.categoryFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.category || '').toLowerCase().includes(cat)
            );
        }

        // Source filter
        if (reportState.sourceFilter) {
            const src = reportState.sourceFilter.toLowerCase();
            vouchers = vouchers.filter(v => {
                const code = String(v.sourceCode || v.source || '').toLowerCase();
                const label = dbModule.getSourceLabel(v.sourceCode || v.source).toLowerCase();
                return code.includes(src) || label.includes(src);
            });
        }

        // Creator filter
        if (reportState.creatorFilter) {
            const creator = reportState.creatorFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.createdBy || '').toLowerCase().includes(creator)
            );
        }

        // Permission-based creator filter (before statistics calculation)
        if (typeof SoquyPermissions !== 'undefined') {
            vouchers = SoquyPermissions.filterByCreator(vouchers);
        }

        reportState.filtered = vouchers;
    }

    // =====================================================
    // DATA ANALYSIS
    // =====================================================

    function getFilteredByType(type) {
        return reportState.filtered.filter(v => v.type === type);
    }

    function sumAmount(vouchers) {
        return vouchers.reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);
    }

    function computeSummary() {
        const receipts = getFilteredByType('receipt');
        const paymentsCN = getFilteredByType('payment_cn');
        const paymentsKD = getFilteredByType('payment_kd');

        const totalIncome = sumAmount(receipts);
        const totalExpenseCN = sumAmount(paymentsCN);
        const totalExpenseKD = sumAmount(paymentsKD);
        const totalExpense = totalExpenseCN + totalExpenseKD;
        const balance = totalIncome - totalExpense;

        return { totalIncome, totalExpenseCN, totalExpenseKD, totalExpense, balance };
    }

    // Nhóm 2: Compute previous period for % change
    function computePreviousPeriodSummary() {
        const prevRange = getPreviousDateRange();
        if (!prevRange) return null;

        let prevVouchers = reportState.vouchers; // Already fund-filtered
        // We need ALL vouchers, not just current period. Re-filter from scratch.
        // Actually, vouchers are already fetched with time filter applied.
        // We need to re-fetch or use a broader set. Let's compute from the full snapshot.
        // For simplicity, filter the already-fetched set won't work since it's time-filtered.
        // We'll skip if no previous data available in current set.
        return null; // Will compute during fetchReportData
    }

    function computeCategoryBreakdown() {
        const type = reportState.reportType;
        let vouchers;

        if (type === 'overview') {
            vouchers = reportState.filtered.filter(v =>
                v.type === 'payment_cn' || v.type === 'payment_kd'
            );
        } else if (type === 'payment_cn') {
            vouchers = getFilteredByType('payment_cn');
        } else if (type === 'payment_kd') {
            vouchers = getFilteredByType('payment_kd');
        } else if (type === 'receipt') {
            vouchers = getFilteredByType('receipt');
        } else {
            vouchers = [];
        }

        // Group by category (with source prefix for display)
        const categoryMap = {};
        vouchers.forEach(v => {
            const srcCode = v.sourceCode || v.source || '';
            const rawCat = v.category || '(Chưa phân loại)';
            const displayCat = (srcCode && rawCat !== '(Chưa phân loại)' && v.type !== 'payment_cn')
                ? `${srcCode} ${rawCat}` : rawCat;
            const key = displayCat;
            if (!categoryMap[key]) {
                categoryMap[key] = { category: displayCat, amount: 0, count: 0, type: v.type, vouchers: [] };
            }
            categoryMap[key].amount += Math.abs(v.amount || 0);
            categoryMap[key].count++;
            categoryMap[key].vouchers.push(v);
        });

        const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);
        const total = categories.reduce((s, c) => s + c.amount, 0);

        return categories.map(c => ({
            ...c,
            percentage: total > 0 ? (c.amount / total * 100) : 0
        }));
    }

    function computeMonthlyTrend() {
        const { startDate, endDate } = getReportDateRange();
        if (!startDate || !endDate) return [];

        const months = [];
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        while (current <= last) {
            months.push({
                year: current.getFullYear(),
                month: current.getMonth(),
                label: `T${current.getMonth() + 1}/${current.getFullYear()}`,
                income: 0,
                expenseCN: 0,
                expenseKD: 0,
                balance: 0
            });
            current.setMonth(current.getMonth() + 1);
        }

        reportState.filtered.forEach(v => {
            const vDate = dbModule.toDate(v.voucherDateTime);
            const monthEntry = months.find(m => m.year === vDate.getFullYear() && m.month === vDate.getMonth());
            if (!monthEntry) return;

            const amount = Math.abs(v.amount || 0);
            if (v.type === 'receipt') {
                monthEntry.income += amount;
            } else if (v.type === 'payment_cn') {
                monthEntry.expenseCN += amount;
            } else if (v.type === 'payment_kd') {
                monthEntry.expenseKD += amount;
            }
        });

        months.forEach(m => {
            m.balance = m.income - m.expenseCN - m.expenseKD;
        });

        return months;
    }

    function computeTopTransactions(tabType, limit) {
        let vouchers;

        if (tabType === 'income') {
            vouchers = getFilteredByType('receipt');
        } else {
            // expense tab
            const type = reportState.reportType;
            if (type === 'payment_cn') {
                vouchers = getFilteredByType('payment_cn');
            } else if (type === 'payment_kd') {
                vouchers = getFilteredByType('payment_kd');
            } else if (type === 'receipt') {
                vouchers = getFilteredByType('receipt');
            } else {
                vouchers = reportState.filtered.filter(v =>
                    v.type === 'payment_cn' || v.type === 'payment_kd'
                );
            }
        }

        return vouchers
            .sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
            .slice(0, limit || 10);
    }

    function computeFundBreakdown() {
        const funds = ['cash', 'bank', 'ewallet'];
        return funds.map(fund => {
            const fundVouchers = reportState.filtered.filter(v => v.fundType === fund);
            const income = sumAmount(fundVouchers.filter(v => v.type === 'receipt'));
            const expense = sumAmount(fundVouchers.filter(v => v.type === 'payment_cn' || v.type === 'payment_kd'));
            return {
                fund,
                label: config.FUND_TYPE_LABELS[fund] || fund,
                income,
                expense,
                balance: income - expense
            };
        });
    }

    // Nhóm 1: Source breakdown
    function computeSourceBreakdown() {
        const sourceMap = {};
        reportState.filtered.forEach(v => {
            const srcCode = v.sourceCode || v.source || '';
            const srcLabel = dbModule.getSourceLabel(srcCode) || '(Chưa phân loại)';
            const key = srcCode || '(none)';
            if (!sourceMap[key]) {
                sourceMap[key] = { source: srcLabel, sourceCode: srcCode, income: 0, expense: 0 };
            }
            const amount = Math.abs(v.amount || 0);
            if (v.type === 'receipt') {
                sourceMap[key].income += amount;
            } else {
                sourceMap[key].expense += amount;
            }
        });

        const sources = Object.values(sourceMap).sort((a, b) =>
            (b.income + b.expense) - (a.income + a.expense)
        );
        const grandTotal = sources.reduce((s, src) => s + src.income + src.expense, 0);

        return sources.map(src => ({
            ...src,
            balance: src.income - src.expense,
            percentage: grandTotal > 0 ? ((src.income + src.expense) / grandTotal * 100) : 0
        }));
    }

    // Nhóm 8: Daily cash flow
    function computeDailyCashFlow() {
        if (reportState.timeFilter !== 'this_month' && reportState.timeFilter !== 'last_month') {
            return [];
        }

        const dayMap = {};
        reportState.filtered.forEach(v => {
            const vDate = dbModule.toDate(v.voucherDateTime);
            const key = `${String(vDate.getDate()).padStart(2, '0')}/${String(vDate.getMonth() + 1).padStart(2, '0')}/${vDate.getFullYear()}`;
            if (!dayMap[key]) {
                dayMap[key] = { date: key, dateObj: new Date(vDate.getFullYear(), vDate.getMonth(), vDate.getDate()), income: 0, expense: 0 };
            }
            const amount = Math.abs(v.amount || 0);
            if (v.type === 'receipt') {
                dayMap[key].income += amount;
            } else {
                dayMap[key].expense += amount;
            }
        });

        const days = Object.values(dayMap).sort((a, b) => a.dateObj - b.dateObj);

        let cumulative = 0;
        days.forEach(d => {
            d.net = d.income - d.expense;
            cumulative += d.net;
            d.cumulative = cumulative;
        });

        return days;
    }

    // =====================================================
    // RENDERING
    // =====================================================

    function fmt(amount) {
        return dbModule.formatCurrency(amount);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function updateReportTitle() {
        const titleEl = document.getElementById('reportTitle');
        const periodEl = document.getElementById('reportPeriod');
        const updatedEl = document.getElementById('reportUpdated');

        if (titleEl) {
            const titles = {
                'overview': 'Báo cáo tổng quan',
                'payment_cn': 'Báo cáo chi cá nhân (CN)',
                'payment_kd': 'Báo cáo chi kinh doanh (KD)',
                'receipt': 'Báo cáo thu nhập'
            };
            titleEl.textContent = titles[reportState.reportType] || 'Báo cáo';
        }

        if (periodEl) {
            const labels = {
                'this_month': 'Tháng này',
                'last_month': 'Tháng trước',
                'this_quarter': 'Quý này',
                'this_year': 'Năm nay',
                'custom': 'Tùy chỉnh'
            };
            let periodText = labels[reportState.timeFilter] || '';
            if (reportState.timeFilter === 'custom' && reportState.customStartDate && reportState.customEndDate) {
                periodText = `${reportState.customStartDate} → ${reportState.customEndDate}`;
            }
            const fundLabel = config.FUND_TYPE_LABELS[reportState.fundType] || 'Tổng quỹ';
            periodEl.textContent = `${periodText} · ${fundLabel}`;
        }

        if (updatedEl) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            updatedEl.textContent = `Cập nhật lúc ${hh}:${mm}`;
        }
    }

    // Nhóm 2: % change badge HTML
    function changeHTML(current, previous) {
        if (previous === null || previous === undefined || previous === 0) return '';
        const pct = ((current - previous) / previous * 100);
        if (Math.abs(pct) < 0.1) return '';
        const isUp = pct > 0;
        const icon = isUp ? '▲' : '▼';
        const cls = isUp ? 'stat-change--up' : 'stat-change--down';
        return `<span class="stat-change ${cls}">${icon} ${Math.abs(pct).toFixed(1)}%</span>`;
    }

    function renderSummaryCards() {
        const summary = computeSummary();
        const type = reportState.reportType;

        const cardsContainer = document.getElementById('reportSummaryCards');
        if (!cardsContainer) return;

        if (type === 'overview') {
            // Nhóm 4: Ratio card
            const ratio = summary.totalIncome > 0 ? (summary.totalExpense / summary.totalIncome * 100) : 0;
            const ratioClass = ratio <= 80 ? 'report-card-value--good' : ratio <= 100 ? 'report-card-value--warning' : 'report-card-value--danger';

            cardsContainer.innerHTML = `
                <div class="report-card report-card--income">
                    <div class="report-card-icon"><i data-lucide="trending-up"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng thu</span>
                        <span class="report-card-value">${fmt(summary.totalIncome)}</span>
                    </div>
                </div>
                <div class="report-card report-card--expense-cn">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng chi CN</span>
                        <span class="report-card-value">-${fmt(summary.totalExpenseCN)}</span>
                    </div>
                </div>
                <div class="report-card report-card--expense-kd">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng chi KD</span>
                        <span class="report-card-value">-${fmt(summary.totalExpenseKD)}</span>
                    </div>
                </div>
                <div class="report-card report-card--balance">
                    <div class="report-card-icon"><i data-lucide="wallet"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Số dư</span>
                        <span class="report-card-value ${summary.balance >= 0 ? '' : 'report-card-value--negative'}">${summary.balance >= 0 ? '' : '-'}${fmt(Math.abs(summary.balance))}</span>
                    </div>
                </div>
                <div class="report-card report-card--ratio">
                    <div class="report-card-icon"><i data-lucide="percent"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tỷ lệ chi/thu</span>
                        <span class="report-card-value ${ratioClass}">${summary.totalIncome > 0 ? ratio.toFixed(1) + '%' : 'N/A'}</span>
                    </div>
                </div>
            `;
        } else if (type === 'receipt') {
            // Nhóm 10: Receipt report cards
            const receipts = getFilteredByType('receipt');
            const totalIncome = sumAmount(receipts);
            const avgIncome = receipts.length > 0 ? totalIncome / receipts.length : 0;

            cardsContainer.innerHTML = `
                <div class="report-card report-card--income">
                    <div class="report-card-icon"><i data-lucide="trending-up"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng thu</span>
                        <span class="report-card-value">${fmt(totalIncome)}</span>
                    </div>
                </div>
                <div class="report-card report-card--count">
                    <div class="report-card-icon"><i data-lucide="file-text"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Số phiếu thu</span>
                        <span class="report-card-value">${receipts.length}</span>
                    </div>
                </div>
                <div class="report-card report-card--avg">
                    <div class="report-card-icon"><i data-lucide="divide"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Trung bình/phiếu</span>
                        <span class="report-card-value">${fmt(Math.round(avgIncome))}</span>
                    </div>
                </div>
                <div class="report-card report-card--balance">
                    <div class="report-card-icon"><i data-lucide="wallet"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng chi</span>
                        <span class="report-card-value report-card-value--negative">-${fmt(summary.totalExpense)}</span>
                    </div>
                </div>
            `;
        } else {
            const isCN = type === 'payment_cn';
            const totalExpense = isCN ? summary.totalExpenseCN : summary.totalExpenseKD;
            const label = isCN ? 'Chi cá nhân' : 'Chi kinh doanh';
            const countVouchers = getFilteredByType(type).length;
            const avgExpense = countVouchers > 0 ? totalExpense / countVouchers : 0;

            cardsContainer.innerHTML = `
                <div class="report-card report-card--${isCN ? 'expense-cn' : 'expense-kd'}">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng ${label}</span>
                        <span class="report-card-value">-${fmt(totalExpense)}</span>
                    </div>
                </div>
                <div class="report-card report-card--count">
                    <div class="report-card-icon"><i data-lucide="file-text"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Số phiếu chi</span>
                        <span class="report-card-value">${countVouchers}</span>
                    </div>
                </div>
                <div class="report-card report-card--avg">
                    <div class="report-card-icon"><i data-lucide="divide"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Trung bình/phiếu</span>
                        <span class="report-card-value">${fmt(Math.round(avgExpense))}</span>
                    </div>
                </div>
                <div class="report-card report-card--income">
                    <div class="report-card-icon"><i data-lucide="trending-up"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng thu</span>
                        <span class="report-card-value">${fmt(summary.totalIncome)}</span>
                    </div>
                </div>
            `;
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Nhóm 6: Drill-down category breakdown
    function renderCategoryBreakdown() {
        const tbody = document.getElementById('reportCategoryBody');
        if (!tbody) return;

        const categories = computeCategoryBreakdown();

        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];

        tbody.innerHTML = categories.map((cat, i) => {
            const color = colors[i % colors.length];
            const typeTag = cat.type === 'payment_cn'
                ? '<span class="report-tag report-tag--cn">CN</span>'
                : cat.type === 'payment_kd'
                    ? '<span class="report-tag report-tag--kd">KD</span>'
                    : '<span class="report-tag report-tag--thu">Thu</span>';

            // Nhóm 6: Drill-down voucher list
            const detailRows = cat.vouchers.slice(0, 20).map(v => {
                const dateStr = dbModule.formatVoucherDateTime(v.voucherDateTime);
                const isPayment = v.type === 'payment_cn' || v.type === 'payment_kd';
                const typeLabel = v.type === 'receipt' ? 'Thu' : v.type === 'payment_kd' ? 'Chi KD' : 'Chi CN';
                return `<tr>
                    <td>${escapeHtml(dateStr)}</td>
                    <td>${escapeHtml(v.personName || v.collector || '-')}</td>
                    <td>${typeLabel}</td>
                    <td class="${isPayment ? 'text-danger' : 'text-success'}">${isPayment ? '-' : ''}${fmt(v.amount)}</td>
                    <td>${escapeHtml(v.note || '-')}</td>
                </tr>`;
            }).join('');

            return `<tr class="report-cat-row" data-cat-idx="${i}">
                <td>
                    <div class="report-cat-name">
                        <i data-lucide="chevron-right" class="report-cat-chevron"></i>
                        <span class="report-cat-dot" style="background: ${color};"></span>
                        ${escapeHtml(cat.category)}
                        ${reportState.reportType === 'overview' ? typeTag : ''}
                    </div>
                    <span class="report-cat-count">${cat.count} phiếu</span>
                </td>
                <td style="text-align: right; font-weight: 600;">
                    ${fmt(cat.amount)}
                </td>
                <td style="text-align: right; color: #8c8c8c;">
                    ${cat.percentage.toFixed(1)}%
                </td>
                <td>
                    <div class="report-progress-bar">
                        <div class="report-progress-fill" style="width: ${cat.percentage}%; background: ${color};"></div>
                    </div>
                </td>
            </tr>
            <tr class="report-cat-detail-row" data-cat-detail="${i}" style="display:none;">
                <td colspan="4">
                    <div class="report-cat-details">
                        <table class="report-detail-table">
                            <thead><tr><th>Ngày</th><th>Người</th><th>Loại thu chi</th><th>Số tiền</th><th>Ghi chú</th></tr></thead>
                            <tbody>${detailRows || '<tr><td colspan="5">Không có phiếu</td></tr>'}</tbody>
                        </table>
                        ${cat.vouchers.length > 20 ? `<div class="report-detail-more">Hiện ${cat.vouchers.length - 20} phiếu nữa...</div>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind drill-down click events
        tbody.querySelectorAll('.report-cat-row').forEach(row => {
            row.addEventListener('click', () => {
                const idx = row.dataset.catIdx;
                const detailRow = tbody.querySelector(`[data-cat-detail="${idx}"]`);
                const chevron = row.querySelector('.report-cat-chevron');
                if (detailRow) {
                    const isVisible = detailRow.style.display !== 'none';
                    detailRow.style.display = isVisible ? 'none' : 'table-row';
                    row.classList.toggle('expanded', !isVisible);
                    if (chevron) {
                        chevron.style.transform = isVisible ? '' : 'rotate(90deg)';
                    }
                }
            });
        });
    }

    function renderMonthlyTrend() {
        const tbody = document.getElementById('reportTrendBody');
        const tfoot = document.getElementById('reportTrendFoot');
        if (!tbody) return;

        const type = reportState.reportType;

        // Update thead based on report type
        const thead = document.querySelector('#reportTrendTable thead tr');
        if (thead) {
            if (type === 'overview') {
                thead.innerHTML = `
                    <th>Tháng</th>
                    <th style="text-align: right;">Thu</th>
                    <th style="text-align: right;">Chi CN</th>
                    <th style="text-align: right;">Chi KD</th>
                    <th style="text-align: right;">Số dư</th>
                `;
            } else if (type === 'receipt') {
                thead.innerHTML = `
                    <th>Tháng</th>
                    <th style="text-align: right;">Thu</th>
                    <th style="text-align: right;">Số phiếu</th>
                `;
            } else {
                const label = type === 'payment_cn' ? 'Chi CN' : 'Chi KD';
                thead.innerHTML = `
                    <th>Tháng</th>
                    <th style="text-align: right;">Thu</th>
                    <th style="text-align: right;">${label}</th>
                    <th style="text-align: right;">Số dư</th>
                `;
            }
        }

        const months = computeMonthlyTrend();

        if (months.length === 0) {
            const colspan = type === 'overview' ? 5 : type === 'receipt' ? 3 : 4;
            tbody.innerHTML = `<tr><td colspan="${colspan}" class="report-empty">Không có dữ liệu</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        let totalIncome = 0, totalCN = 0, totalKD = 0;

        tbody.innerHTML = months.map(m => {
            totalIncome += m.income;
            totalCN += m.expenseCN;
            totalKD += m.expenseKD;

            if (type === 'receipt') {
                // Count receipts for this month
                const monthReceipts = reportState.filtered.filter(v => {
                    if (v.type !== 'receipt') return false;
                    const vDate = dbModule.toDate(v.voucherDateTime);
                    return vDate.getFullYear() === m.year && vDate.getMonth() === m.month;
                });
                return `<tr>
                    <td class="report-month-label">${m.label}</td>
                    <td style="text-align: right;" class="text-success">${m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td style="text-align: right;">${monthReceipts.length}</td>
                </tr>`;
            }

            const expense = type === 'payment_cn' ? m.expenseCN : type === 'payment_kd' ? m.expenseKD : null;
            const bal = type === 'overview' ? m.balance : (m.income - (type === 'payment_cn' ? m.expenseCN : m.expenseKD));

            if (type === 'overview') {
                return `<tr>
                    <td class="report-month-label">${m.label}</td>
                    <td style="text-align: right;" class="text-success">${m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${m.expenseCN > 0 ? '-' + fmt(m.expenseCN) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${m.expenseKD > 0 ? '-' + fmt(m.expenseKD) : '-'}</td>
                    <td style="text-align: right; font-weight: 600;" class="${m.balance >= 0 ? 'text-success' : 'text-danger'}">${m.balance >= 0 ? '' : '-'}${fmt(Math.abs(m.balance))}</td>
                </tr>`;
            } else {
                return `<tr>
                    <td class="report-month-label">${m.label}</td>
                    <td style="text-align: right;" class="text-success">${m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${expense > 0 ? '-' + fmt(expense) : '-'}</td>
                    <td style="text-align: right; font-weight: 600;" class="${bal >= 0 ? 'text-success' : 'text-danger'}">${bal >= 0 ? '' : '-'}${fmt(Math.abs(bal))}</td>
                </tr>`;
            }
        }).join('');

        // Footer totals
        if (tfoot) {
            if (type === 'receipt') {
                const totalReceipts = getFilteredByType('receipt').length;
                tfoot.innerHTML = `<tr class="report-trend-total">
                    <td><strong>Tổng</strong></td>
                    <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
                    <td style="text-align: right;"><strong>${totalReceipts}</strong></td>
                </tr>`;
            } else {
                const totalBal = totalIncome - totalCN - totalKD;
                if (type === 'overview') {
                    tfoot.innerHTML = `<tr class="report-trend-total">
                        <td><strong>Tổng</strong></td>
                        <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
                        <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalCN)}</strong></td>
                        <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalKD)}</strong></td>
                        <td style="text-align: right;" class="${totalBal >= 0 ? 'text-success' : 'text-danger'}"><strong>${totalBal >= 0 ? '' : '-'}${fmt(Math.abs(totalBal))}</strong></td>
                    </tr>`;
                } else {
                    const exp = type === 'payment_cn' ? totalCN : totalKD;
                    const bal = totalIncome - exp;
                    tfoot.innerHTML = `<tr class="report-trend-total">
                        <td><strong>Tổng</strong></td>
                        <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
                        <td style="text-align: right;" class="text-danger"><strong>-${fmt(exp)}</strong></td>
                        <td style="text-align: right;" class="${bal >= 0 ? 'text-success' : 'text-danger'}"><strong>${bal >= 0 ? '' : '-'}${fmt(Math.abs(bal))}</strong></td>
                    </tr>`;
                }
            }
        }
    }

    // Nhóm 3: CSS Bar Chart
    function renderBarChart() {
        const container = document.getElementById('reportBarChart');
        const legendEl = document.getElementById('reportBarLegend');
        if (!container) return;

        const months = computeMonthlyTrend();
        const type = reportState.reportType;

        if (months.length === 0) {
            container.innerHTML = '<div class="report-empty">Không có dữ liệu</div>';
            if (legendEl) legendEl.innerHTML = '';
            return;
        }

        // Find max value for scaling
        let maxVal = 0;
        months.forEach(m => {
            maxVal = Math.max(maxVal, m.income, m.expenseCN, m.expenseKD, m.expenseCN + m.expenseKD);
        });
        if (maxVal === 0) maxVal = 1;

        const chartHeight = 180;

        let barsHTML = months.map(m => {
            const incomeH = (m.income / maxVal) * chartHeight;
            const cnH = (m.expenseCN / maxVal) * chartHeight;
            const kdH = (m.expenseKD / maxVal) * chartHeight;

            let bars = '';
            if (type === 'receipt') {
                bars = `<div class="report-bar report-bar--income" style="height: ${incomeH}px;" title="Thu: ${fmt(m.income)}"></div>`;
            } else if (type === 'payment_cn') {
                bars = `<div class="report-bar report-bar--income" style="height: ${incomeH}px;" title="Thu: ${fmt(m.income)}"></div>
                        <div class="report-bar report-bar--cn" style="height: ${cnH}px;" title="Chi CN: ${fmt(m.expenseCN)}"></div>`;
            } else if (type === 'payment_kd') {
                bars = `<div class="report-bar report-bar--income" style="height: ${incomeH}px;" title="Thu: ${fmt(m.income)}"></div>
                        <div class="report-bar report-bar--kd" style="height: ${kdH}px;" title="Chi KD: ${fmt(m.expenseKD)}"></div>`;
            } else {
                bars = `<div class="report-bar report-bar--income" style="height: ${incomeH}px;" title="Thu: ${fmt(m.income)}"></div>
                        <div class="report-bar report-bar--cn" style="height: ${cnH}px;" title="Chi CN: ${fmt(m.expenseCN)}"></div>
                        <div class="report-bar report-bar--kd" style="height: ${kdH}px;" title="Chi KD: ${fmt(m.expenseKD)}"></div>`;
            }

            return `<div class="report-bar-group">
                <div class="report-bar-bars">${bars}</div>
                <div class="report-bar-label">${m.label.replace(/\/\d{4}/, '')}</div>
            </div>`;
        }).join('');

        container.innerHTML = barsHTML;

        // Legend
        if (legendEl) {
            let legendItems = '<span class="report-legend-item"><span class="report-legend-dot report-legend-dot--income"></span>Thu</span>';
            if (type === 'overview' || type === 'payment_cn') {
                legendItems += '<span class="report-legend-item"><span class="report-legend-dot report-legend-dot--cn"></span>Chi CN</span>';
            }
            if (type === 'overview' || type === 'payment_kd') {
                legendItems += '<span class="report-legend-item"><span class="report-legend-dot report-legend-dot--kd"></span>Chi KD</span>';
            }
            legendEl.innerHTML = legendItems;
        }
    }

    // Nhóm 9: Top transactions with tabs
    function renderTopTransactions() {
        const tbody = document.getElementById('reportTopBody');
        if (!tbody) return;

        const tabType = reportState.topTab || 'expense';
        const top = computeTopTransactions(tabType, 10);

        if (top.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        tbody.innerHTML = top.map(v => {
            const isPayment = v.type === 'payment_cn' || v.type === 'payment_kd';
            const typeLabel = config.VOUCHER_TYPE_LABELS[v.type] || v.type;
            const amountClass = isPayment ? 'text-danger' : 'text-success';
            const amountPrefix = isPayment ? '-' : '';
            const dateStr = dbModule.formatVoucherDateTime(v.voucherDateTime);

            return `<tr>
                <td class="text-primary" style="font-weight: 500;">${escapeHtml(v.code)}</td>
                <td>${escapeHtml(dateStr)}</td>
                <td>${escapeHtml(typeLabel)}</td>
                <td>${escapeHtml((() => {
                    const srcCode = v.sourceCode || v.source || '';
                    const cat = v.personName || v.category || '';
                    return (srcCode && cat && v.type !== 'payment_cn') ? `${srcCode} ${cat}` : cat;
                })())}</td>
                <td style="text-align: right; font-weight: 600;" class="${amountClass}">${amountPrefix}${fmt(v.amount)}</td>
            </tr>`;
        }).join('');
    }

    function renderFundBreakdown() {
        const tbody = document.getElementById('reportFundBody');
        if (!tbody) return;

        if (reportState.fundType !== 'all') {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Chọn "Tổng quỹ" để xem phân bổ</td></tr>';
            return;
        }

        const funds = computeFundBreakdown();

        if (funds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        let totalIncome = 0, totalExpense = 0;

        tbody.innerHTML = funds.map(f => {
            totalIncome += f.income;
            totalExpense += f.expense;
            return `<tr>
                <td style="font-weight: 500;">${escapeHtml(f.label)}</td>
                <td style="text-align: right;" class="text-success">${f.income > 0 ? fmt(f.income) : '-'}</td>
                <td style="text-align: right;" class="text-danger">${f.expense > 0 ? '-' + fmt(f.expense) : '-'}</td>
                <td style="text-align: right; font-weight: 600;" class="${f.balance >= 0 ? 'text-success' : 'text-danger'}">${f.balance >= 0 ? '' : '-'}${fmt(Math.abs(f.balance))}</td>
            </tr>`;
        }).join('');

        const totalBal = totalIncome - totalExpense;
        tbody.innerHTML += `<tr class="report-trend-total">
            <td><strong>Tổng</strong></td>
            <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
            <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalExpense)}</strong></td>
            <td style="text-align: right;" class="${totalBal >= 0 ? 'text-success' : 'text-danger'}"><strong>${totalBal >= 0 ? '' : '-'}${fmt(Math.abs(totalBal))}</strong></td>
        </tr>`;
    }

    // Nhóm 1: Source breakdown
    function renderSourceBreakdown() {
        const tbody = document.getElementById('reportSourceBody');
        if (!tbody) return;

        const sources = computeSourceBreakdown();

        if (sources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        let grandIncome = 0, grandExpense = 0;

        tbody.innerHTML = sources.map(src => {
            grandIncome += src.income;
            grandExpense += src.expense;
            return `<tr>
                <td style="font-weight: 500;">${escapeHtml(src.source)}</td>
                <td style="text-align: right;" class="text-success">${src.income > 0 ? fmt(src.income) : '-'}</td>
                <td style="text-align: right;" class="text-danger">${src.expense > 0 ? '-' + fmt(src.expense) : '-'}</td>
                <td style="text-align: right; font-weight: 600;" class="${src.balance >= 0 ? 'text-success' : 'text-danger'}">${src.balance >= 0 ? '' : '-'}${fmt(Math.abs(src.balance))}</td>
                <td>
                    <div class="report-progress-bar">
                        <div class="report-progress-fill" style="width: ${src.percentage}%; background: #1890ff;"></div>
                    </div>
                </td>
            </tr>`;
        }).join('');

        const grandBal = grandIncome - grandExpense;
        tbody.innerHTML += `<tr class="report-trend-total">
            <td><strong>Tổng</strong></td>
            <td style="text-align: right;" class="text-success"><strong>${fmt(grandIncome)}</strong></td>
            <td style="text-align: right;" class="text-danger"><strong>-${fmt(grandExpense)}</strong></td>
            <td style="text-align: right;" class="${grandBal >= 0 ? 'text-success' : 'text-danger'}"><strong>${grandBal >= 0 ? '' : '-'}${fmt(Math.abs(grandBal))}</strong></td>
            <td></td>
        </tr>`;
    }

    // Nhóm 8: Daily cash flow
    function renderDailyCashFlow() {
        const section = document.getElementById('reportDailySection');
        const tbody = document.getElementById('reportDailyBody');
        if (!tbody || !section) return;

        const days = computeDailyCashFlow();

        if (days.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        tbody.innerHTML = days.map(d => {
            const netClass = d.net >= 0 ? 'text-success' : 'text-danger';
            const cumClass = d.cumulative >= 0 ? 'text-success' : 'text-danger';
            return `<tr>
                <td style="font-weight: 500;">${d.date}</td>
                <td style="text-align: right;" class="text-success">${d.income > 0 ? fmt(d.income) : '-'}</td>
                <td style="text-align: right;" class="text-danger">${d.expense > 0 ? '-' + fmt(d.expense) : '-'}</td>
                <td style="text-align: right; font-weight: 600;" class="${netClass}">${d.net >= 0 ? '' : '-'}${fmt(Math.abs(d.net))}</td>
                <td style="text-align: right; font-weight: 600;" class="${cumClass}">${d.cumulative >= 0 ? '' : '-'}${fmt(Math.abs(d.cumulative))}</td>
            </tr>`;
        }).join('');
    }

    // =====================================================
    // EXPORT REPORT
    // =====================================================

    function exportReport() {
        if (reportState.filtered.length === 0) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        const summary = computeSummary();
        const categories = computeCategoryBreakdown();
        const months = computeMonthlyTrend();
        const type = reportState.reportType;

        const titles = {
            'overview': 'Bao_cao_tong_quan',
            'payment_cn': 'Bao_cao_chi_ca_nhan',
            'payment_kd': 'Bao_cao_chi_kinh_doanh',
            'receipt': 'Bao_cao_thu_nhap'
        };

        let csv = '\uFEFF';
        csv += `BÁO CÁO TÀI CHÍNH\n`;
        csv += `Loại: ${type === 'overview' ? 'Tổng quan' : type === 'payment_cn' ? 'Chi cá nhân' : type === 'payment_kd' ? 'Chi kinh doanh' : 'Thu nhập'}\n`;
        csv += `Thời gian: ${document.getElementById('reportPeriod')?.textContent || ''}\n\n`;

        csv += `TỔNG KẾT\n`;
        csv += `Tổng thu,${summary.totalIncome}\n`;
        csv += `Tổng chi CN,${summary.totalExpenseCN}\n`;
        csv += `Tổng chi KD,${summary.totalExpenseKD}\n`;
        csv += `Số dư,${summary.balance}\n\n`;

        csv += `CHI TIẾT THEO LOẠI\n`;
        csv += `Loại thu chi,Số tiền,Tỷ lệ,Số phiếu\n`;
        categories.forEach(c => {
            csv += `"${c.category}",${c.amount},${c.percentage.toFixed(1)}%,${c.count}\n`;
        });
        csv += '\n';

        csv += `XU HƯỚNG THEO THÁNG\n`;
        if (type === 'overview') {
            csv += `Tháng,Thu,Chi CN,Chi KD,Số dư\n`;
            months.forEach(m => {
                csv += `${m.label},${m.income},${m.expenseCN},${m.expenseKD},${m.balance}\n`;
            });
        } else {
            const expLabel = type === 'payment_cn' ? 'Chi CN' : type === 'payment_kd' ? 'Chi KD' : 'Thu';
            csv += `Tháng,Thu,${expLabel},Số dư\n`;
            months.forEach(m => {
                const exp = type === 'payment_cn' ? m.expenseCN : m.expenseKD;
                csv += `${m.label},${m.income},${exp},${m.income - exp}\n`;
            });
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${titles[type] || 'Bao_cao'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // =====================================================
    // FILTER STATE PERSISTENCE (Nhóm 7)
    // =====================================================

    function saveReportFilterState() {
        try {
            localStorage.setItem('soquy_report_filters', JSON.stringify({
                reportType: reportState.reportType,
                fundType: reportState.fundType,
                timeFilter: reportState.timeFilter,
                customStartDate: reportState.customStartDate,
                customEndDate: reportState.customEndDate
            }));
        } catch (e) { /* ignore */ }
    }

    function loadReportFilterState() {
        try {
            const saved = localStorage.getItem('soquy_report_filters');
            if (!saved) return;
            const f = JSON.parse(saved);
            if (f.reportType) reportState.reportType = f.reportType;
            if (f.fundType) reportState.fundType = f.fundType;
            if (f.timeFilter) reportState.timeFilter = f.timeFilter;
            if (f.customStartDate) reportState.customStartDate = f.customStartDate;
            if (f.customEndDate) reportState.customEndDate = f.customEndDate;
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // MAIN REFRESH
    // =====================================================

    async function refreshReport() {
        await fetchReportData();
        renderAll();
        saveReportFilterState();
    }

    function refilterReport() {
        applyReportFilters();
        renderAll();
        saveReportFilterState();
    }

    function renderAll() {
        updateReportTitle();
        renderSummaryCards();
        renderCategoryBreakdown();
        renderMonthlyTrend();
        renderBarChart();
        renderDailyCashFlow();
        renderTopTransactions();
        renderFundBreakdown();
        renderSourceBreakdown();
    }

    // Nhóm 9: Render only top transactions (for tab switching)
    function renderTopOnly() {
        renderTopTransactions();
    }

    // =====================================================
    // SEARCHABLE FILTER DROPDOWNS (Report)
    // =====================================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getReportUniqueValues(field) {
        const values = new Set();
        const vouchers = reportState.vouchers || [];
        vouchers.forEach(v => {
            let val = '';
            switch (field) {
                case 'category': {
                    const srcCode = v.sourceCode || v.source || '';
                    const cat = v.category || '';
                    val = (srcCode && cat && v.type !== 'payment_cn') ? `${srcCode} ${cat}` : cat;
                    break;
                }
                case 'source':
                    val = dbModule.getSourceLabel(v.sourceCode || v.source) || '';
                    break;
                case 'creator':
                    val = v.createdBy || '';
                    break;
            }
            if (val) values.add(val);
        });
        return [...values].sort((a, b) => a.localeCompare(b, 'vi'));
    }

    function showReportFilterDropdown(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        const query = (input.value || '').trim().toLowerCase();
        const allValues = getReportUniqueValues(field);
        const filtered = query ? allValues.filter(v => v.toLowerCase().includes(query)) : allValues;

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="filter-dropdown-empty">Không tìm thấy</div>';
        } else {
            dropdown.innerHTML = filtered.map(val => {
                let display = escapeHtml(val);
                if (query) {
                    const idx = val.toLowerCase().indexOf(query);
                    if (idx >= 0) {
                        const before = escapeHtml(val.substring(0, idx));
                        const match = escapeHtml(val.substring(idx, idx + query.length));
                        const after = escapeHtml(val.substring(idx + query.length));
                        display = `${before}<span class="filter-dropdown-match">${match}</span>${after}`;
                    }
                }
                return `<div class="filter-dropdown-item" data-value="${escapeHtml(val)}">${display}</div>`;
            }).join('');
        }

        dropdown.classList.add('show');

        dropdown.querySelectorAll('.filter-dropdown-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = item.dataset.value;
                dropdown.classList.remove('show');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    function hideReportFilterDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.classList.remove('show');
    }

    function initReportFilterDropdown(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.addEventListener('focus', () => showReportFilterDropdown(inputId, dropdownId, field));
        input.addEventListener('input', () => showReportFilterDropdown(inputId, dropdownId, field));
        input.addEventListener('blur', () => setTimeout(() => hideReportFilterDropdown(dropdownId), 150));
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        reportState,
        refreshReport,
        refilterReport,
        exportReport,
        getReportDateRange,
        renderTopOnly,
        loadReportFilterState,
        saveReportFilterState,
        initReportFilterDropdown
    };
})();

window.SoquyReport = SoquyReport;
