// =====================================================
// CACHE MANAGEMENT
// File 3/6: hangrotxa-cache.js
// =====================================================

// In-memory cache object
let memoryCache = {
    data: null,
    timestamp: null,
};

// =====================================================
// CACHE FUNCTIONS
// =====================================================

function getCachedData() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    try {
        if (memoryCache.data && memoryCache.timestamp) {
            if (Date.now() - memoryCache.timestamp < config.CACHE_EXPIRY) {
                console.log("Using cached data");
                return utils.sortDataByNewest([...memoryCache.data]);
            } else {
                console.log("Cache expired, clearing");
                invalidateCache();
            }
        }
    } catch (e) {
        console.warn("Error accessing cache:", e);
        invalidateCache();
    }
    return null;
}

function setCachedData(data) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    try {
        const sortedData = utils.sortDataByNewest([...data]);
        memoryCache.data = sortedData;
        memoryCache.timestamp = Date.now();
        console.log("Data sorted and cached successfully");
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache() {
    memoryCache.data = null;
    memoryCache.timestamp = null;
    console.log("Cache invalidated");
}

// =====================================================
// IMAGE PRELOADING
// =====================================================

function preloadImagesAndCache(dataArray) {
    const imageUrls = [];

    // Collect all image URLs
    dataArray.forEach((product) => {
        if (product.hinhAnh) {
            if (Array.isArray(product.hinhAnh)) {
                imageUrls.push(...product.hinhAnh);
            } else {
                imageUrls.push(product.hinhAnh);
            }
        }
    });

    // Pre-load all images
    const imagePromises = imageUrls.map((url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(url);
            img.src = url;
        });
    });

    Promise.all(imagePromises)
        .then(() => {
            console.log("All images pre-loaded, caching data");
            setCachedData(dataArray);
        })
        .catch((error) => {
            console.warn("Error pre-loading images:", error);
            setTimeout(() => {
                setCachedData(dataArray);
            }, 5000);
        });
}

// =====================================================
// MIGRATION FUNCTIONS
// =====================================================

async function migrateDataWithIDs() {
    // const config = window.HangRotXaConfig;
    // const utils = window.HangRotXaUtils;
    // try {
    //     utils.showLoading("Đang kiểm tra và migration dữ liệu...");
    //     const doc = await config.collectionRef.doc("hangrotxa").get();
    //     if (!doc.exists) {
    //         console.log("Không có dữ liệu để migrate");
    //         utils.hideLoading();
    //         return;
    //     }
    //     const data = doc.data();
    //     if (!Array.isArray(data.data)) {
    //         console.log("Dữ liệu không hợp lệ");
    //         utils.hideLoading();
    //         return;
    //     }
    //     let hasChanges = false;
    //     const migratedData = data.data.map((item) => {
    //         if (!item.id) {
    //             hasChanges = true;
    //             return {
    //                 ...item,
    //                 id: utils.generateUniqueID(),
    //             };
    //         }
    //         return item;
    //     });
    //     if (hasChanges) {
    //         const sortedMigratedData = utils.sortDataByNewest(migratedData);
    //         await config.collectionRef.doc("hangrotxa").update({
    //             data: sortedMigratedData,
    //         });
    //         utils.logAction(
    //             "migration",
    //             `Migration hoàn tất: Thêm ID cho ${migratedData.filter((item) => item.id).length} sản phẩm và sắp xếp theo thời gian`,
    //             null,
    //             null,
    //         );
    //         console.log(
    //             `Migration hoàn tất: Đã thêm ID cho ${migratedData.length} sản phẩm`,
    //         );
    //         utils.showSuccess("Migration hoàn tất!");
    //     } else {
    //         const sortedData = utils.sortDataByNewest(data.data);
    //         const orderChanged =
    //             JSON.stringify(data.data) !== JSON.stringify(sortedData);
    //         if (orderChanged) {
    //             await config.collectionRef.doc("hangrotxa").update({
    //                 data: sortedData,
    //             });
    //             utils.logAction(
    //                 "sort",
    //                 "Sắp xếp lại dữ liệu theo thời gian mới nhất",
    //                 null,
    //                 null,
    //             );
    //             console.log("Đã sắp xếp lại dữ liệu theo thời gian");
    //             utils.showSuccess(
    //                 "Đã sắp xếp dữ liệu theo thời gian mới nhất!",
    //             );
    //         } else {
    //             console.log("Tất cả dữ liệu đã có ID và đã được sắp xếp đúng");
    //             utils.hideLoading();
    //         }
    //     }
    // } catch (error) {
    //     console.error("Lỗi trong quá trình migration:", error);
    //     utils.showError("Lỗi migration: " + error.message);
    // }
}

// =====================================================
// DATA LOADING
// =====================================================

async function displayInventoryData() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const ui = window.HangRotXaUI;

    // Check cache first
    const cachedData = getCachedData();
    if (cachedData) {
        utils.showInfo("Sử dụng dữ liệu cache...");
        // const loadingId = utils.showLoading("Sử dụng dữ liệu cache...");
        const sortedCacheData = utils.sortDataByNewest(cachedData);
        ui.renderDataToTable(sortedCacheData);
        ui.updateSuggestions(sortedCacheData);
        // utils.hideLoading(loadingId);
        utils.showInfo("Tải dữ liệu từ cache hoàn tất!");
        return;
    }

    utils.showInfo("Đang tải dữ liệu từ server...");
    // const loadingId = utils.showLoading("Đang tải dữ liệu từ server...");

    try {
        const doc = await config.collectionRef.doc("hangrotxa").get();

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                const sortedData = utils.sortDataByNewest(data.data);
                ui.renderDataToTable(sortedData);
                ui.updateSuggestions(sortedData);

                // Preload images and cache in background
                preloadImagesAndCache(sortedData);
            }
        }

        // utils.hideLoading(loadingId);
        utils.showSuccess("Tải dữ liệu hoàn tất!");
    } catch (error) {
        console.error(error);
        // utils.hideLoading(loadingId);
        utils.showError("Lỗi khi tải dữ liệu!");
    }
}

async function initializeWithMigration() {
    try {
        await migrateDataWithIDs();
        await displayInventoryData();
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        window.HangRotXaUtils.showError("Lỗi khởi tạo ứng dụng");
    }
}

// =====================================================
// DEBUG FUNCTIONS
// =====================================================

function checkDataIntegrity() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    config.collectionRef
        .doc("hangrotxa")
        .get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                const itemsWithoutId = data.data.filter((item) => !item.id);
                const itemsWithId = data.data.filter((item) => item.id);

                console.log(`Tổng số items: ${data.data.length}`);
                console.log(`Items có ID: ${itemsWithId.length}`);
                console.log(`Items không có ID: ${itemsWithoutId.length}`);

                if (itemsWithoutId.length > 0) {
                    console.log("Items không có ID:", itemsWithoutId);
                    utils.showError(
                        `Tìm thấy ${itemsWithoutId.length} items không có ID. Cần chạy migration!`,
                    );
                } else {
                    utils.showSuccess("Tất cả dữ liệu đã có ID!");
                }

                // Check duplicate ID
                const ids = itemsWithId.map((item) => item.id);
                const uniqueIds = [...new Set(ids)];

                if (ids.length !== uniqueIds.length) {
                    console.warn("Phát hiện duplicate ID!");
                    utils.showWarning(
                        "Cảnh báo: Có ID trùng lặp trong database!",
                    );
                }

                // Check sorting
                const sorted = utils.sortDataByNewest([...data.data]);
                const isAlreadySorted =
                    JSON.stringify(data.data) === JSON.stringify(sorted);

                console.log(`Dữ liệu đã được sắp xếp đúng: ${isAlreadySorted}`);
                if (!isAlreadySorted) {
                    utils.showWarning(
                        "Dữ liệu chưa được sắp xếp theo thời gian!",
                    );
                }
            }
        })
        .catch((error) => {
            console.error("Lỗi kiểm tra data integrity:", error);
            utils.showError("Lỗi kiểm tra data integrity");
        });
}

async function forceSortByTime() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    if (!authManager) {
        utils.showError("Không có quyền thực hiện chức năng này");
        return;
    }

    const confirmSort = confirm(
        "Bạn có chắc chắn muốn sắp xếp lại dữ liệu theo thời gian mới nhất?",
    );
    if (!confirmSort) return;

    try {
        const loadingId = utils.showLoading("Đang sắp xếp dữ liệu...");

        const doc = await config.collectionRef.doc("hangrotxa").get();
        if (!doc.exists) return;

        const data = doc.data();
        if (!Array.isArray(data.data)) return;

        const sortedData = utils.sortDataByNewest(data.data);

        await config.collectionRef.doc("hangrotxa").update({
            data: sortedData,
        });

        utils.logAction(
            "sort",
            "Sắp xếp thủ công dữ liệu theo thời gian mới nhất",
            null,
            null,
        );

        invalidateCache();

        utils.hideLoading(loadingId);
        utils.showSuccess("Đã sắp xếp dữ liệu thành công!");

        setTimeout(() => {
            displayInventoryData();
        }, 1000);
    } catch (error) {
        console.error("Lỗi khi sắp xếp:", error);
        utils.showError("Lỗi khi sắp xếp dữ liệu!");
    }
}

function forceRefreshData() {
    invalidateCache();
    displayInventoryData();
}

// Export functions
window.HangRotXaCache = {
    getCachedData,
    setCachedData,
    invalidateCache,
    preloadImagesAndCache,
    migrateDataWithIDs,
    displayInventoryData,
    initializeWithMigration,
    checkDataIntegrity,
    forceSortByTime,
    forceRefreshData,
};
