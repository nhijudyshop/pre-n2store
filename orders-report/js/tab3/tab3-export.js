/**
 * TAB3-EXPORT.JS
 * Export Excel functionality.
 *
 * Load order: tab3-export.js (5th, after tab3-assignment.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { ui } = window._tab3;

    // =====================================================
    // EXPORT EXCEL FUNCTIONALITY
    // =====================================================

    let exportExcelModal = null;

    /**
     * Open Export Excel Modal
     */
    window.openExportExcelModal = function () {
        console.log('[EXPORT] Opening Export Excel Modal...');

        if (!exportExcelModal) {
            const modalEl = document.getElementById('exportExcelModal');
            if (modalEl) {
                exportExcelModal = new bootstrap.Modal(modalEl);
            }
        }

        const progressEl = document.getElementById('exportProgress');
        const footerEl = document.getElementById('exportModalFooter');
        const exportBtn = document.getElementById('exportExcelBtn');

        if (progressEl) progressEl.style.display = 'none';
        if (footerEl) footerEl.style.display = 'flex';
        if (exportBtn) exportBtn.disabled = false;

        const progressBar = document.getElementById('exportProgressBar');
        if (progressBar) progressBar.style.width = '0%';

        if (exportExcelModal) {
            exportExcelModal.show();
        }
    };

    /**
     * Close Export Excel Modal
     */
    window.closeExportExcelModal = function () {
        if (exportExcelModal) {
            exportExcelModal.hide();
        }
    };

    /**
     * Format date to DD/MM/YYYY HH:mm
     */
    function formatDateForExcel(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Format date for filename (DD-MM-YYYY)
     */
    function formatDateForFilename(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    /**
     * Export Orders to Excel
     */
    window.exportOrdersToExcel = async function () {
        console.log('[EXPORT] Starting export to Excel...');

        const skipRange = document.getElementById('exportSkipRange');
        const skip = parseInt(skipRange?.value || '0', 10);

        console.log(`[EXPORT] Skip value: ${skip}`);

        const progressEl = document.getElementById('exportProgress');
        const exportBtn = document.getElementById('exportExcelBtn');
        const progressText = document.getElementById('exportProgressText');
        const progressBar = document.getElementById('exportProgressBar');

        if (progressEl) progressEl.style.display = 'block';
        if (exportBtn) exportBtn.disabled = true;
        if (progressText) progressText.textContent = 'Đang tải đơn hàng từ TPOS...';
        if (progressBar) progressBar.style.width = '20%';

        try {
            const headers = await window.tokenManager.getAuthHeader();

            const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=3000&$skip=${skip}&$orderby=DateCreated desc&$count=true`;

            console.log(`[EXPORT] Fetching from: ${url}`);
            if (progressBar) progressBar.style.width = '40%';

            const response = await API_CONFIG.smartFetch(url, {
                headers: { ...headers, accept: 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const orders = data.value || [];
            const totalCount = data['@odata.count'] || orders.length;

            console.log(`[EXPORT] Loaded ${orders.length} orders (total: ${totalCount})`);
            if (progressText) progressText.textContent = `Đã tải ${orders.length} đơn hàng. Đang tạo file Excel...`;
            if (progressBar) progressBar.style.width = '70%';

            if (orders.length === 0) {
                alert('Không có đơn hàng nào để xuất!');
                if (progressEl) progressEl.style.display = 'none';
                if (exportBtn) exportBtn.disabled = false;
                return;
            }

            let minDate = orders[0].DateCreated;
            let maxDate = orders[0].DateCreated;

            orders.forEach(order => {
                if (order.DateCreated < minDate) minDate = order.DateCreated;
                if (order.DateCreated > maxDate) maxDate = order.DateCreated;
            });

            const excelData = orders.map((order, index) => ({
                'STT': index + 1,
                'Khách hàng': order.Name || '',
                'SĐT': order.Telephone || '',
                'Địa Chỉ': order.Address || '',
                'Tổng tiền': order.TotalAmount || 0,
                'SL': order.TotalQuantity || 0,
                'Trạng thái': order.StatusText || order.Status || '',
                'Ngày Tạo': formatDateForExcel(order.DateCreated)
            }));

            if (progressBar) progressBar.style.width = '85%';

            const ws = XLSX.utils.json_to_sheet(excelData);

            const colWidths = [];
            const headerKeys = Object.keys(excelData[0] || {});
            headerKeys.forEach((header, i) => {
                const maxLength = Math.max(
                    header.length,
                    ...excelData.map(row => String(row[header] || '').length)
                );
                colWidths[i] = { width: Math.min(maxLength + 2, 50) };
            });
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');

            const minDateStr = formatDateForFilename(minDate);
            const maxDateStr = formatDateForFilename(maxDate);
            const fileName = `Đơn hàng ${minDateStr} - ${maxDateStr}.xlsx`;

            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = 'Hoàn thành! Đang tải file...';

            XLSX.writeFile(wb, fileName);

            console.log(`[EXPORT] Excel file exported: ${fileName}`);

            setTimeout(() => {
                closeExportExcelModal();
                if (progressEl) progressEl.style.display = 'none';
                if (exportBtn) exportBtn.disabled = false;
                if (progressBar) progressBar.style.width = '0%';
            }, 1000);

        } catch (error) {
            console.error('[EXPORT] Error exporting to Excel:', error);
            alert(`Lỗi xuất Excel: ${error.message}`);

            if (progressEl) progressEl.style.display = 'none';
            if (exportBtn) exportBtn.disabled = false;
            if (progressBar) progressBar.style.width = '0%';
        }
    };

})();
