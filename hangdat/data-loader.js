// =====================================================
// DATA LOADING WITH COMPREHENSIVE NOTIFICATIONS
// =====================================================

async function loadInventoryData() {
    const cachedData = getCachedData();
    if (cachedData) {
        notifyManager.info("Sử dụng dữ liệu cache...", 1500);
        globalState.inventoryData = cachedData;
        renderInventoryTable(cachedData);
        updateFilterOptions(cachedData);
        notifyManager.success("Tải dữ liệu từ cache hoàn tất!", 2000);
        return;
    }

    const notifId = notifyManager.loadingData(
        "Đang tải dữ liệu đặt hàng từ Firebase...",
    );

    try {
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
                console.log(`Loaded ${orderData.length} orders from Firebase`);
            } else {
                console.warn("No data array found in dathang document");
                notifyManager.remove(notifId);
                notifyManager.warning("Không tìm thấy dữ liệu đặt hàng!");
                return;
            }
        } else {
            console.warn("dathang document does not exist");
            notifyManager.remove(notifId);
            notifyManager.error("Không tìm thấy collection dathang!");
            return;
        }

        if (orderData.length === 0) {
            notifyManager.remove(notifId);
            notifyManager.info("Chưa có dữ liệu đặt hàng nào!", 3000);
            const tbody = document.getElementById("orderTableBody");
            tbody.innerHTML =
                '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #6c757d;">Chưa có dữ liệu để hiển thị</td></tr>';
            return;
        }

        const inventoryData = transformOrderDataToInventory(orderData);

        const sortedData = inventoryData.sort((a, b) => {
            const dateA = parseVietnameseDate(a.thoiGianUpload);
            const dateB = parseVietnameseDate(b.thoiGianUpload);
            if (dateA && dateB) {
                return dateB - dateA;
            }
            return 0;
        });

        globalState.inventoryData = sortedData;
        renderInventoryTable(sortedData);
        updateFilterOptions(sortedData);
        setCachedData(sortedData);

        notifyManager.remove(notifId);
        notifyManager.success(
            `Đã tải ${sortedData.length} sản phẩm thành công!`,
            2000,
        );

        console.log("Sample loaded data:", sortedData[0]);
    } catch (error) {
        console.error("Error loading inventory data:", error);
        notifyManager.remove(notifId);
        notifyManager.error("Lỗi khi tải dữ liệu: " + error.message);
    }
}

function transformOrderDataToInventory(orderData) {
    if (!Array.isArray(orderData)) return [];

    return orderData
        .filter((order) => order.maSanPham || order.tenSanPham)
        .map((order) => ({
            id: order.id || generateUniqueID(),
            ngayDatHang: order.ngayDatHang,
            ngayNhan: order.thoiGianUpload,
            nhaCungCap: order.nhaCungCap,
            hoaDon: order.hoaDon,
            maSanPham: order.maSanPham || "",
            tenSanPham: order.tenSanPham || "",
            bienThe: order.bienThe || "",
            soLuong: order.soLuong || 0,
            giaMua: order.giaMua || 0,
            giaBan: order.giaBan || 0,
            ghiChu: order.ghiChu || "",
            anhHoaDon: order.anhHoaDon || null,
            anhSanPham: order.anhSanPham || null,
            anhGiaMua: order.anhGiaMua || null,
            thucNhan: order.thucNhan || 0,
            tongNhan: order.tongNhan || 0,
            thoiGianUpload: order.thoiGianUpload,
            user: order.user || getUserName(),
            lastUpdated:
                order.lastUpdated ||
                order.thoiGianUpload ||
                getFormattedDateTime(),
            updatedBy: order.updatedBy || order.user || getUserName(),
            originalOrderId: order.id,
            inventoryUpdated: order.inventoryUpdated || false,
            tposProductId: order.tposProductId || null, // TPOS Product ID
        }));
}

async function refreshInventoryData() {
    const notifId = notifyManager.processing("Đang làm mới dữ liệu...");

    try {
        invalidateCache();
        await loadInventoryData();
        notifyManager.remove(notifId);
        notifyManager.success("Làm mới dữ liệu thành công!");
    } catch (error) {
        console.error("Error refreshing inventory data:", error);
        notifyManager.remove(notifId);
        notifyManager.error("Lỗi khi làm mới dữ liệu!");
    }
}

console.log("Data loader with comprehensive notifications loaded");
