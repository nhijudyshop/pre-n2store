// =====================================================
// DATA LOADING AND PROCESSING
// =====================================================

async function loadInventoryData() {
    const cachedData = getCachedData();
    if (cachedData) {
        const cacheId = notificationManager.info(
            "Sử dụng dữ liệu cache...",
            1500,
        );
        globalState.inventoryData = cachedData;
        renderInventoryTable(cachedData);
        updateFilterOptions(cachedData);
        notificationManager.remove(cacheId);
        notificationManager.success("Tải dữ liệu từ cache hoàn tất!", 2000);
        return;
    }

    const loadingId = notificationManager.loadingData(
        "Đang tải dữ liệu từ Firebase...",
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
                notificationManager.remove(loadingId);
                notificationManager.warning(
                    "Không tìm thấy dữ liệu đặt hàng!",
                    3000,
                );
                console.warn("No data array found in dathang document");
                return;
            }
        } else {
            notificationManager.remove(loadingId);
            notificationManager.error(
                "Không tìm thấy collection dathang!",
                3000,
            );
            console.warn("dathang document does not exist");
            return;
        }

        if (orderData.length === 0) {
            notificationManager.remove(loadingId);
            notificationManager.info("Chưa có dữ liệu đặt hàng nào!", 3000);
            const tbody = document.getElementById("orderTableBody");
            tbody.innerHTML =
                '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #6c757d;">Chưa có dữ liệu để hiển thị</td></tr>';
            return;
        }

        // Transform and process data
        const inventoryData = transformOrderDataToInventory(orderData);
        const sortedData = inventoryData.sort((a, b) => {
            // Sắp xếp theo ngày đặt hàng (mới nhất lên trước)
            const dateA = parseVietnameseDate(a.ngayDatHang);
            const dateB = parseVietnameseDate(b.ngayDatHang);

            if (dateA && dateB) {
                return dateB - dateA; // Ngày mới hơn (lớn hơn) sẽ lên trước
            }

            // Nếu một trong hai không có ngày đặt hàng
            if (dateA && !dateB) return -1; // A lên trước
            if (!dateA && dateB) return 1; // B lên trước

            return 0;
        });

        globalState.inventoryData = sortedData;
        renderInventoryTable(sortedData);
        updateFilterOptions(sortedData);
        setCachedData(sortedData);

        notificationManager.remove(loadingId);
        notificationManager.success(
            `Tải thành công ${sortedData.length} sản phẩm!`,
            2000,
            "Hoàn tất",
        );
    } catch (error) {
        console.error("Error loading inventory data:", error);
        notificationManager.remove(loadingId);
        notificationManager.error(
            "Lỗi khi tải dữ liệu: " + error.message,
            4000,
        );
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
            maSanPham: order.maSanPham || "",
            tenSanPham: order.tenSanPham || "",
            soLuong: order.soLuong || 0,
            thucNhan: order.thucNhan || 0,
            tongNhan: order.tongNhan || 0,
            originalOrderId: order.id,
            lastUpdated: order.lastUpdated || getFormattedDateTime(),
            updatedBy: order.updatedBy || getUserName(),
            inventoryUpdated: order.inventoryUpdated || false,
        }));
}

async function refreshInventoryData() {
    try {
        const refreshId = notificationManager.processing(
            "Đang làm mới dữ liệu...",
        );
        invalidateCache();

        await loadInventoryData();

        notificationManager.remove(refreshId);
        notificationManager.success("Làm mới dữ liệu thành công!", 2000);

        // Log refresh action
        logAction("refresh", "Làm mới dữ liệu kiểm hàng");
    } catch (error) {
        console.error("Error refreshing inventory data:", error);
        notificationManager.error(
            "Lỗi khi làm mới dữ liệu: " + error.message,
            4000,
        );
    }
}

console.log("Data loader system loaded");
