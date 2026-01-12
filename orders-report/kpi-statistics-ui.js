/**
 * KPI Statistics UI - Hiển thị thống kê KPI trong tab2-statistics.html
 *
 * Tích hợp với kpi-manager.js để hiển thị:
 * - Bảng thống kê KPI theo user/ngày
 * - Chi tiết BASE vs Note comparison
 * - Timeline KPI
 *
 * Firebase Collections:
 * - kpi_base/{orderId} - BASE snapshots
 * - kpi_statistics/{userId}/{date} - Thống kê KPI
 */

(function () {
    'use strict';

    const KPI_BASE_COLLECTION = 'kpi_base';
    const KPI_STATISTICS_COLLECTION = 'kpi_statistics';
    const KPI_AMOUNT_PER_DIFFERENCE = 5000;

    // State
    let kpiStatsData = {};
    let kpiBaseData = {};

    /**
     * Load KPI Statistics from Firebase
     * @param {string} dateFilter - Optional date filter (YYYY-MM-DD)
     * @returns {Promise<object>}
     */
    async function loadKPIStatistics(dateFilter = null) {
        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[KPI-UI] Firebase not available');
                return {};
            }

            const snapshot = await window.firebase.database()
                .ref(KPI_STATISTICS_COLLECTION)
                .once('value');

            const data = snapshot.val() || {};
            kpiStatsData = data;

            console.log('[KPI-UI] Loaded KPI statistics:', Object.keys(data).length, 'users');
            return data;
        } catch (error) {
            console.error('[KPI-UI] Error loading KPI statistics:', error);
            return {};
        }
    }

    /**
     * Load KPI BASE for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<object|null>}
     */
    async function loadKPIBase(orderId) {
        try {
            if (!window.firebase || !window.firebase.database) {
                return null;
            }

            const snapshot = await window.firebase.database()
                .ref(`${KPI_BASE_COLLECTION}/${orderId}`)
                .once('value');

            if (!snapshot.exists()) {
                return null;
            }

            const data = snapshot.val();
            kpiBaseData[orderId] = data;
            return data;
        } catch (error) {
            console.error('[KPI-UI] Error loading KPI BASE:', error);
            return null;
        }
    }

    /**
     * Aggregate KPI statistics by user for display
     * @param {object} statsData - Raw statistics data
     * @param {string} dateFilter - Optional date filter
     * @returns {Array} - Array of user stats
     */
    function aggregateByUser(statsData, dateFilter = null) {
        const userAggregates = {};

        Object.keys(statsData).forEach(userId => {
            const userDates = statsData[userId] || {};

            Object.keys(userDates).forEach(date => {
                // Apply date filter if provided
                if (dateFilter && date !== dateFilter) {
                    return;
                }

                const dateStats = userDates[date];

                if (!userAggregates[userId]) {
                    userAggregates[userId] = {
                        userId,
                        userName: 'Unknown',
                        totalDifferences: 0,
                        totalKPI: 0,
                        orderCount: 0,
                        dates: [],
                        orders: []
                    };
                }

                // Get username from first order
                if (dateStats.orders && dateStats.orders.length > 0) {
                    // Try to get username from orders
                }

                userAggregates[userId].totalDifferences += dateStats.totalDifferences || 0;
                userAggregates[userId].totalKPI += dateStats.totalKPI || 0;
                userAggregates[userId].orderCount += (dateStats.orders || []).length;
                userAggregates[userId].dates.push(date);
                userAggregates[userId].orders.push(...(dateStats.orders || []));
            });
        });

        return Object.values(userAggregates).sort((a, b) => b.totalKPI - a.totalKPI);
    }

    /**
     * Render KPI Statistics Table
     * @param {string} containerId - Container element ID
     * @param {string} dateFilter - Optional date filter
     */
    async function renderKPIStatisticsTable(containerId, dateFilter = null) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[KPI-UI] Container not found:', containerId);
            return;
        }

        // Show loading
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-spinner fa-spin mb-2"></i><br>Đang tải thống kê KPI...
            </div>
        `;

        // Load data
        const statsData = await loadKPIStatistics(dateFilter);

        if (Object.keys(statsData).length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <i class="fas fa-chart-pie mb-2" style="font-size: 32px; opacity: 0.5;"></i><br>
                    Chưa có dữ liệu KPI<br>
                    <small>KPI sẽ được tính khi user xác nhận sản phẩm và chọn "Tính KPI"</small>
                </div>
            `;
            return;
        }

        // Aggregate by user
        const userStats = aggregateByUser(statsData, dateFilter);

        // Calculate totals
        const totalDifferences = userStats.reduce((sum, u) => sum + u.totalDifferences, 0);
        const totalKPI = userStats.reduce((sum, u) => sum + u.totalKPI, 0);
        const totalOrders = userStats.reduce((sum, u) => sum + u.orderCount, 0);

        // Render table
        container.innerHTML = `
            <div class="kpi-stats-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
                <div class="summary-card" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 16px; border-radius: 12px; color: white;">
                    <div style="font-size: 24px; font-weight: 700;">${totalOrders}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Đơn hàng có KPI</div>
                </div>
                <div class="summary-card" style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 16px; border-radius: 12px; color: white;">
                    <div style="font-size: 24px; font-weight: 700;">${totalDifferences}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Tổng SP khác biệt</div>
                </div>
                <div class="summary-card" style="background: linear-gradient(135deg, #10b981, #059669); padding: 16px; border-radius: 12px; color: white;">
                    <div style="font-size: 24px; font-weight: 700;">${formatCurrency(totalKPI)}</div>
                    <div style="font-size: 12px; opacity: 0.8;">Tổng KPI</div>
                </div>
            </div>

            <table class="table table-hover" style="font-size: 13px;">
                <thead style="background: #f1f5f9;">
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>Nhân viên</th>
                        <th style="text-align: center;">Số đơn</th>
                        <th style="text-align: center;">SP khác biệt</th>
                        <th style="text-align: right;">KPI</th>
                        <th style="text-align: center;">Chi tiết</th>
                    </tr>
                </thead>
                <tbody>
                    ${userStats.map((user, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>
                                <strong>${escapeHtml(user.userName || user.userId)}</strong>
                                <br><small class="text-muted">${user.dates.length} ngày</small>
                            </td>
                            <td style="text-align: center;">${user.orderCount}</td>
                            <td style="text-align: center; font-weight: 600; color: #f59e0b;">${user.totalDifferences}</td>
                            <td style="text-align: right; font-weight: 600; color: #10b981;">${formatCurrency(user.totalKPI)}</td>
                            <td style="text-align: center;">
                                <button class="btn btn-sm btn-outline-primary" onclick="window.kpiStatisticsUI.showUserKPIDetail('${user.userId}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot style="background: #f8fafc; font-weight: 600;">
                    <tr>
                        <td colspan="2">Tổng cộng</td>
                        <td style="text-align: center;">${totalOrders}</td>
                        <td style="text-align: center; color: #f59e0b;">${totalDifferences}</td>
                        <td style="text-align: right; color: #10b981;">${formatCurrency(totalKPI)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    /**
     * Show User KPI Detail Modal
     * @param {string} userId - User ID
     */
    async function showUserKPIDetail(userId) {
        const userData = kpiStatsData[userId];
        if (!userData) {
            console.warn('[KPI-UI] No data for user:', userId);
            return;
        }

        // Build orders list from all dates
        const allOrders = [];
        let userName = userId;

        Object.keys(userData).forEach(date => {
            const dateStats = userData[date];
            if (dateStats.orders) {
                dateStats.orders.forEach(order => {
                    allOrders.push({
                        ...order,
                        date
                    });
                });
            }
        });

        // Sort by date descending
        allOrders.sort((a, b) => b.date.localeCompare(a.date));

        // Create modal content
        const modalContent = `
            <div class="modal fade" id="kpiUserDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-user-chart"></i> Chi tiết KPI - ${escapeHtml(userName)}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                            <table class="table table-sm table-striped" style="font-size: 12px;">
                                <thead>
                                    <tr>
                                        <th>Ngày</th>
                                        <th>STT</th>
                                        <th style="text-align: center;">SP khác biệt</th>
                                        <th style="text-align: right;">KPI</th>
                                        <th style="text-align: center;">Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allOrders.map(order => `
                                        <tr>
                                            <td>${order.date}</td>
                                            <td><strong>${order.stt || '-'}</strong></td>
                                            <td style="text-align: center; color: #f59e0b;">${order.differences || 0}</td>
                                            <td style="text-align: right; color: #10b981;">${formatCurrency(order.kpi || 0)}</td>
                                            <td style="text-align: center;">
                                                <button class="btn btn-xs btn-outline-secondary" onclick="window.kpiStatisticsUI.showOrderKPIComparison('${order.orderId}')" title="Xem so sánh BASE vs Note">
                                                    <i class="fas fa-balance-scale"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('kpiUserDetailModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalContent);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('kpiUserDetailModal'));
        modal.show();
    }

    /**
     * Show Order KPI Comparison (BASE vs Note)
     * @param {string} orderId - Order ID
     */
    async function showOrderKPIComparison(orderId) {
        // Load BASE
        const base = await loadKPIBase(orderId);

        if (!base) {
            alert('Không tìm thấy BASE cho đơn hàng này');
            return;
        }

        const baseProducts = base.products || [];

        // Create comparison modal
        const modalContent = `
            <div class="modal fade" id="kpiComparisonModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-balance-scale"></i> BASE - STT ${base.stt || orderId}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info" style="font-size: 12px;">
                                <i class="fas fa-info-circle"></i>
                                <strong>BASE được lưu lúc:</strong> ${formatTimestamp(base.timestamp)}<br>
                                <strong>Người lưu:</strong> ${escapeHtml(base.userName || 'Unknown')}
                            </div>

                            <h6><i class="fas fa-box"></i> Sản phẩm trong BASE (${baseProducts.length})</h6>
                            <table class="table table-sm table-bordered" style="font-size: 12px;">
                                <thead style="background: #f1f5f9;">
                                    <tr>
                                        <th>Mã SP</th>
                                        <th style="text-align: center;">Số lượng</th>
                                        <th style="text-align: right;">Giá</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${baseProducts.map(p => `
                                        <tr>
                                            <td><code>${escapeHtml(p.code)}</code></td>
                                            <td style="text-align: center;">${p.quantity}</td>
                                            <td style="text-align: right;">${formatCurrency(p.price)}</td>
                                        </tr>
                                    `).join('')}
                                    ${baseProducts.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">Không có sản phẩm</td></tr>' : ''}
                                </tbody>
                            </table>

                            <div class="mt-3 p-3" style="background: #fef3c7; border-radius: 8px; font-size: 12px;">
                                <i class="fas fa-lightbulb text-warning"></i>
                                <strong>Công thức tính KPI:</strong><br>
                                KPI = Số SP khác biệt × ${formatCurrency(KPI_AMOUNT_PER_DIFFERENCE)}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('kpiComparisonModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalContent);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('kpiComparisonModal'));
        modal.show();
    }

    /**
     * Render KPI Timeline Chart
     * @param {string} canvasId - Canvas element ID
     * @param {string} userId - Optional user filter
     */
    async function renderKPITimelineChart(canvasId, userId = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn('[KPI-UI] Canvas not found:', canvasId);
            return;
        }

        // Load data if not already loaded
        if (Object.keys(kpiStatsData).length === 0) {
            await loadKPIStatistics();
        }

        // Aggregate by date
        const dateAggregates = {};

        Object.keys(kpiStatsData).forEach(uid => {
            if (userId && uid !== userId) return;

            const userDates = kpiStatsData[uid] || {};

            Object.keys(userDates).forEach(date => {
                const dateStats = userDates[date];

                if (!dateAggregates[date]) {
                    dateAggregates[date] = {
                        differences: 0,
                        kpi: 0,
                        orders: 0
                    };
                }

                dateAggregates[date].differences += dateStats.totalDifferences || 0;
                dateAggregates[date].kpi += dateStats.totalKPI || 0;
                dateAggregates[date].orders += (dateStats.orders || []).length;
            });
        });

        // Sort dates
        const sortedDates = Object.keys(dateAggregates).sort();
        const labels = sortedDates.map(d => formatDateShort(d));
        const kpiData = sortedDates.map(d => dateAggregates[d].kpi);
        const diffData = sortedDates.map(d => dateAggregates[d].differences);

        // Destroy existing chart
        if (window.kpiTimelineChartInstance) {
            window.kpiTimelineChartInstance.destroy();
        }

        // Create chart
        const ctx = canvas.getContext('2d');
        window.kpiTimelineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'KPI (VNĐ)',
                        data: kpiData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'SP khác biệt',
                        data: diffData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'KPI (VNĐ)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'SP khác biệt'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (context.datasetIndex === 0) {
                                    return `KPI: ${formatCurrency(context.raw)}`;
                                }
                                return `SP khác biệt: ${context.raw}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Helper Functions
    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount || 0) + 'đ';
    }

    function formatTimestamp(ts) {
        if (!ts) return 'N/A';
        const date = new Date(ts);
        return date.toLocaleString('vi-VN');
    }

    function formatDateShort(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`;
        }
        return dateStr;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =====================================================
    // REALTIME LISTENERS
    // =====================================================

    let kpiBaseListenerRef = null;
    let kpiStatsListenerRef = null;

    /**
     * Setup realtime listener for KPI BASE changes
     * Listens for new BASE saves and updates
     */
    function setupKPIBaseRealtimeListener() {
        if (!window.firebase || !window.firebase.database) {
            console.warn('[KPI-UI] Firebase not available for realtime');
            return;
        }

        // Don't setup duplicate listeners
        if (kpiBaseListenerRef) {
            console.log('[KPI-UI] KPI BASE listener already active');
            return;
        }

        console.log('[KPI-UI] Setting up KPI BASE realtime listener...');

        kpiBaseListenerRef = window.firebase.database().ref(KPI_BASE_COLLECTION);

        // Listen for new BASE entries
        kpiBaseListenerRef.on('child_added', (snapshot) => {
            const orderId = snapshot.key;
            const data = snapshot.val();
            kpiBaseData[orderId] = data;
            console.log('[KPI-UI] KPI BASE added for order:', orderId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        // Listen for BASE updates
        kpiBaseListenerRef.on('child_changed', (snapshot) => {
            const orderId = snapshot.key;
            const data = snapshot.val();
            kpiBaseData[orderId] = data;
            console.log('[KPI-UI] KPI BASE updated for order:', orderId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        // Listen for BASE removals
        kpiBaseListenerRef.on('child_removed', (snapshot) => {
            const orderId = snapshot.key;
            delete kpiBaseData[orderId];
            console.log('[KPI-UI] KPI BASE removed for order:', orderId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        console.log('[KPI-UI] ✓ KPI BASE realtime listener active');
    }

    /**
     * Setup realtime listener for KPI Statistics changes
     */
    function setupKPIStatisticsRealtimeListener() {
        if (!window.firebase || !window.firebase.database) {
            console.warn('[KPI-UI] Firebase not available for realtime');
            return;
        }

        // Don't setup duplicate listeners
        if (kpiStatsListenerRef) {
            console.log('[KPI-UI] KPI Statistics listener already active');
            return;
        }

        console.log('[KPI-UI] Setting up KPI Statistics realtime listener...');

        kpiStatsListenerRef = window.firebase.database().ref(KPI_STATISTICS_COLLECTION);

        // Listen for user stats changes
        kpiStatsListenerRef.on('child_added', (snapshot) => {
            const userId = snapshot.key;
            const data = snapshot.val();
            kpiStatsData[userId] = data;
            console.log('[KPI-UI] KPI stats added for user:', userId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        kpiStatsListenerRef.on('child_changed', (snapshot) => {
            const userId = snapshot.key;
            const data = snapshot.val();
            kpiStatsData[userId] = data;
            console.log('[KPI-UI] KPI stats updated for user:', userId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        kpiStatsListenerRef.on('child_removed', (snapshot) => {
            const userId = snapshot.key;
            delete kpiStatsData[userId];
            console.log('[KPI-UI] KPI stats removed for user:', userId);

            // Trigger UI refresh if stats table is visible
            refreshKPITableIfVisible();
        });

        console.log('[KPI-UI] ✓ KPI Statistics realtime listener active');
    }

    /**
     * Refresh KPI table if it's currently visible
     */
    function refreshKPITableIfVisible() {
        const kpiContainer = document.getElementById('kpiStatisticsContainer');
        if (kpiContainer && kpiContainer.offsetParent !== null) {
            // Get current filter values
            const dateFilter = document.getElementById('kpiDateFilter')?.value || null;
            renderKPIStatisticsTable(dateFilter);
        }
    }

    /**
     * Cleanup realtime listeners
     */
    function cleanupKPIRealtimeListeners() {
        if (kpiBaseListenerRef) {
            console.log('[KPI-UI] Cleaning up KPI BASE listener');
            kpiBaseListenerRef.off();
            kpiBaseListenerRef = null;
        }

        if (kpiStatsListenerRef) {
            console.log('[KPI-UI] Cleaning up KPI Statistics listener');
            kpiStatsListenerRef.off();
            kpiStatsListenerRef = null;
        }
    }

    /**
     * Initialize all KPI realtime listeners
     */
    function initKPIRealtimeListeners() {
        setupKPIBaseRealtimeListener();
        setupKPIStatisticsRealtimeListener();
    }

    // Export to window
    window.kpiStatisticsUI = {
        loadKPIStatistics,
        loadKPIBase,
        aggregateByUser,
        renderKPIStatisticsTable,
        showUserKPIDetail,
        showOrderKPIComparison,
        renderKPITimelineChart,

        // Realtime listeners
        initRealtimeListeners: initKPIRealtimeListeners,
        cleanupRealtimeListeners: cleanupKPIRealtimeListeners,

        // Expose state for debugging
        getStatsData: () => kpiStatsData,
        getBaseData: () => kpiBaseData
    };

    // Auto-initialize realtime listeners when module loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initKPIRealtimeListeners, 1000);
        });
    } else {
        setTimeout(initKPIRealtimeListeners, 1000);
    }

    console.log('[KPI-UI] ✓ KPI Statistics UI initialized');

})();
