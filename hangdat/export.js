// =====================================================
// EXPORT FUNCTIONALITY WITH AUTO UPLOAD TO TPOS
// =====================================================

// Convert image URL to base64
async function imageUrlToBase64(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error converting image to base64:", error);
        return null;
    }
}

// Convert Blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Upload Excel to TPOS
async function uploadExcelToTPOS(excelBase64) {
    console.log("📤 [TPOS] Uploading Excel file...");

    // Add random delay to mimic human behavior
    await randomDelay(300, 800);

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`,
        {
            method: "POST",
            headers: getTPOSHeaders(),
            body: JSON.stringify({
                do_inventory: false,
                file: cleanBase64(excelBase64),
                version: "2701",
            }),
        },
    );

    if (!response.ok) {
        console.error(
            "❌ [TPOS] Excel upload failed:",
            response.status,
            response.statusText,
        );
        const errorText = await response.text();
        console.error("Error details:", errorText);
        throw new Error(`Upload Excel thất bại: ${response.status}`);
    }

    const result = await response.json();

    console.log("✅ [TPOS] Excel upload response:", {
        status: response.status,
        statusText: response.statusText,
        data: result,
    });

    console.log(
        "📋 [TPOS] Full response object:",
        JSON.stringify(result, null, 2),
    );

    return result;
}

// Get latest N products created by configured user
async function getLatestProducts(count) {
    console.log(`📥 [TPOS] Fetching latest ${count} products...`);

    await randomDelay(400, 900);

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2`,
        {
            headers: getTPOSHeaders(),
        },
    );

    if (!response.ok) {
        console.error(
            "❌ [TPOS] Get products failed:",
            response.status,
            response.statusText,
        );
        throw new Error(`Lấy danh sách thất bại: ${response.status}`);
    }

    const data = await response.json();

    console.log("📦 [TPOS] Products list response:", {
        totalProducts: (data.value || data).length,
        firstProduct: (data.value || data)[0],
    });

    const items = (data.value || data).filter(
        (item) => item.CreatedByName === TPOS_CONFIG.CREATED_BY_NAME,
    );

    console.log(
        `🔍 [TPOS] Found ${items.length} products created by "${TPOS_CONFIG.CREATED_BY_NAME}"`,
    );

    if (items.length === 0) {
        throw new Error(
            `Không tìm thấy sản phẩm của "${TPOS_CONFIG.CREATED_BY_NAME}"`,
        );
    }

    const sorted = items.sort((a, b) => b.Id - a.Id).slice(0, count);

    console.log(
        "📋 [TPOS] Latest products:",
        sorted.map((p) => ({
            Id: p.Id,
            Name: p.Name,
            Code: p.Code,
            CreatedBy: p.CreatedByName,
            CreatedOn: p.CreatedOn,
        })),
    );

    return sorted;
}

// Get product detail
async function getProductDetail(productId) {
    console.log(`🔎 [TPOS] Fetching product detail for ID: ${productId}`);

    await randomDelay(200, 600);

    const expand =
        "UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines,UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos";

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${expand}`,
        {
            headers: getTPOSHeaders(),
        },
    );

    if (!response.ok) {
        console.error(
            "❌ [TPOS] Get product detail failed:",
            response.status,
            response.statusText,
        );
        throw new Error(`Lấy chi tiết thất bại: ${response.status}`);
    }

    const detail = await response.json();

    console.log(`📄 [TPOS] Product detail for ID ${productId}:`, {
        Id: detail.Id,
        Name: detail.Name,
        Code: detail.Code,
        ListPrice: detail.ListPrice,
        StandardPrice: detail.StandardPrice,
        HasImage: !!detail.Image,
        ImageSize: detail.Image
            ? `${(detail.Image.length / 1024).toFixed(2)} KB`
            : "N/A",
    });

    return detail;
}

// Update product with image
async function updateProductWithImage(productDetail, imageBase64) {
    console.log(`🖼️ [TPOS] Updating product ${productDetail.Id} with image...`);

    await randomDelay(300, 700);

    const payload = { ...productDetail };
    delete payload["@odata.context"];
    payload.Image = cleanBase64(imageBase64);

    console.log(
        `📊 [TPOS] Update payload size: ${(JSON.stringify(payload).length / 1024).toFixed(2)} KB`,
    );

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`,
        {
            method: "POST",
            headers: getTPOSHeaders(),
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        const errorData = await response.text();
        console.error("❌ [TPOS] Update failed:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
        });

        try {
            const errorJson = JSON.parse(errorData);
            throw new Error(
                errorJson.error || `Cập nhật thất bại: ${response.status}`,
            );
        } catch (e) {
            throw new Error(
                `Cập nhật thất bại: ${response.status} - ${errorData}`,
            );
        }
    }

    const result = await response.json();

    console.log(`✅ [TPOS] Product ${productDetail.Id} updated successfully:`, {
        Id: result.Id,
        Name: result.Name,
        UpdatedOn: result.UpdatedOn,
        HasImage: !!result.Image,
    });

    return result;
}

// Save TPOS Product ID back to Firebase
async function saveTPOSProductId(inventoryItemId, tposProductId) {
    try {
        console.log(
            `💾 [Firebase] Saving TPOS ID ${tposProductId} for item ${inventoryItemId}...`,
        );

        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        }

        const itemIndex = orderData.findIndex(
            (item) => item.id === inventoryItemId,
        );

        if (itemIndex !== -1) {
            const oldData = { ...orderData[itemIndex] };
            orderData[itemIndex].tposProductId = tposProductId;

            await collectionRef.doc("dathang").update({ data: orderData });

            console.log(
                `✅ [Firebase] Saved TPOS ID ${tposProductId} for item ${inventoryItemId}`,
                {
                    itemName: orderData[itemIndex].tenSanPham,
                    itemCode: orderData[itemIndex].maSanPham,
                    oldTPOSId: oldData.tposProductId,
                    newTPOSId: tposProductId,
                },
            );

            return true;
        } else {
            console.warn(
                `⚠️ [Firebase] Item ${inventoryItemId} not found in database`,
            );
            return false;
        }
    } catch (error) {
        console.error("❌ [Firebase] Error saving TPOS Product ID:", error);
        return false;
    }
}

// Show confirmation modal
function showExportConfirmModal(filteredData, excelDataWithImages) {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "export-modal-overlay";

        const productsWithImages = excelDataWithImages.filter(
            (item) => item.imageUrl,
        ).length;
        const productsWithoutImages =
            excelDataWithImages.length - productsWithImages;

        modal.innerHTML = `
            <style>
                .export-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    backdrop-filter: blur(4px);
                    animation: fadeIn 0.2s ease-out;
                }

                .export-modal {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    width: 90%;
                    max-width: 900px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    animation: slideUp 0.3s ease-out;
                }

                .export-modal-header {
                    padding: 24px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .export-modal-header h3 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                }

                .export-modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    font-size: 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .export-modal-close:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.1);
                }

                .export-modal-body {
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                }

                .export-summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .export-stat {
                    background: #f9fafb;
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    border: 2px solid #e5e7eb;
                    transition: all 0.2s;
                }

                .export-stat:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .export-stat.success {
                    background: #ecfdf5;
                    border-color: #10b981;
                }

                .export-stat.warning {
                    background: #fffbeb;
                    border-color: #f59e0b;
                }

                .export-stat-icon {
                    font-size: 32px;
                }

                .export-stat-value {
                    font-size: 28px;
                    font-weight: 700;
                    color: #111827;
                }

                .export-stat-label {
                    font-size: 13px;
                    color: #6b7280;
                    margin-top: 4px;
                }

                .export-preview h4 {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: #111827;
                }

                .export-table-container {
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                    overflow: auto;
                    max-height: 400px;
                }

                .export-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }

                .export-table thead {
                    background: #f9fafb;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .export-table th {
                    padding: 12px 16px;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    border-bottom: 2px solid #e5e7eb;
                }

                .export-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f3f4f6;
                }

                .export-table tr:hover {
                    background: #f9fafb;
                }

                .badge-success {
                    background: #d1fae5;
                    color: #065f46;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .badge-warning {
                    background: #fef3c7;
                    color: #92400e;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .export-modal-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    background: #f9fafb;
                }

                .export-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .export-btn-secondary {
                    background: white;
                    color: #374151;
                    border: 1px solid #d1d5db;
                }

                .export-btn-secondary:hover {
                    background: #f3f4f6;
                }

                .export-btn-download {
                    background: #3b82f6;
                    color: white;
                }

                .export-btn-download:hover {
                    background: #2563eb;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                }

                .export-btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .export-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .export-modal {
                        width: 95%;
                        max-height: 95vh;
                    }
                    
                    .export-summary {
                        grid-template-columns: 1fr;
                    }
                    
                    .export-modal-footer {
                        flex-direction: column;
                    }
                    
                    .export-btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
            
            <div class="export-modal">
                <div class="export-modal-header">
                    <h3>Xác nhận xuất dữ liệu</h3>
                    <button class="export-modal-close" onclick="this.closest('.export-modal-overlay').remove()">×</button>
                </div>
                
                <div class="export-modal-body">
                    <div class="export-summary">
                        <div class="export-stat">
                            <div class="export-stat-icon">📦</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${filteredData.length}</div>
                                <div class="export-stat-label">Tổng sản phẩm</div>
                            </div>
                        </div>
                        
                        <div class="export-stat success">
                            <div class="export-stat-icon">🖼️</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${productsWithImages}</div>
                                <div class="export-stat-label">Có hình ảnh</div>
                            </div>
                        </div>
                        
                        <div class="export-stat warning">
                            <div class="export-stat-icon">⚠️</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${productsWithoutImages}</div>
                                <div class="export-stat-label">Không có ảnh</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="export-preview">
                        <h4>Danh sách sản phẩm</h4>
                        <div class="export-table-container">
                            <table class="export-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Mã SP</th>
                                        <th>Giá bán</th>
                                        <th>Hình ảnh</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${excelDataWithImages
                                        .slice(0, 10)
                                        .map(
                                            (item, index) => `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>${item.excelRow["Tên sản phẩm"] || "-"}</td>
                                            <td>${item.excelRow["Mã sản phẩm"] || "-"}</td>
                                            <td>${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.excelRow["Giá bán"] || 0)}</td>
                                            <td>
                                                ${
                                                    item.imageUrl
                                                        ? '<span class="badge-success">✓ Có ảnh</span>'
                                                        : '<span class="badge-warning">✗ Không có</span>'
                                                }
                                            </td>
                                        </tr>
                                    `,
                                        )
                                        .join("")}
                                    ${
                                        excelDataWithImages.length > 10
                                            ? `
                                        <tr>
                                            <td colspan="5" style="text-align: center; color: #6b7280; padding: 12px;">
                                                ... và ${excelDataWithImages.length - 10} sản phẩm khác
                                            </td>
                                        </tr>
                                    `
                                            : ""
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="export-modal-footer">
                    <button class="export-btn export-btn-secondary" onclick="this.closest('.export-modal-overlay').remove()">
                        Hủy
                    </button>
                    <button class="export-btn export-btn-download" id="exportDownloadBtn">
                        📥 Chỉ tải Excel
                    </button>
                    <button class="export-btn export-btn-primary" id="exportUploadBtn">
                        🚀 Upload lên TPOS
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById("exportDownloadBtn").onclick = () => {
            modal.remove();
            resolve("download");
        };

        document.getElementById("exportUploadBtn").onclick = () => {
            modal.remove();
            resolve("upload");
        };

        const handleEsc = (e) => {
            if (e.key === "Escape") {
                modal.remove();
                document.removeEventListener("keydown", handleEsc);
                resolve("cancel");
            }
        };
        document.addEventListener("keydown", handleEsc);
    });
}

// Main export and upload function
async function exportToExcel() {
    console.log("🚀 [Export] Starting export process...");

    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        notifyManager.warning("Không có dữ liệu để xuất");
        return;
    }

    const notifId = notifyManager.processing("Đang chuẩn bị dữ liệu...");

    try {
        const filteredData = applyFiltersToInventory(cachedData);
        console.log(`📊 [Export] Filtered ${filteredData.length} products`);

        const excelDataWithImages = filteredData.map((order) => ({
            excelRow: {
                "Loại sản phẩm": TPOS_CONFIG.DEFAULT_PRODUCT_TYPE,
                "Mã sản phẩm": order.maSanPham?.toString() || undefined,
                "Mã chốt đơn": undefined,
                "Tên sản phẩm": order.tenSanPham?.toString() || undefined,
                "Giá bán": (order.giaBan || 0) * 1000,
                "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
                "Đơn vị": TPOS_CONFIG.DEFAULT_UOM,
                "Nhóm sản phẩm": TPOS_CONFIG.DEFAULT_CATEGORY,
                "Mã vạch": order.maSanPham?.toString() || undefined,
                "Khối lượng": undefined,
                "Chiết khấu bán": undefined,
                "Chiết khấu mua": undefined,
                "Tồn kho": undefined,
                "Giá vốn": undefined,
                "Ghi chú": order.ghiChu || undefined,
                "Cho phép bán ở công ty khác": "FALSE",
                "Thuộc tính": undefined,
            },
            imageUrl: order.anhSanPham || null,
            imageBase64: null,
        }));

        notifyManager.remove(notifId);

        const action = await showExportConfirmModal(
            filteredData,
            excelDataWithImages,
        );

        if (action === "cancel") {
            console.log("❌ [Export] User cancelled");
            return;
        }

        const excelData = excelDataWithImages.map((item) => item.excelRow);
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        if (action === "download") {
            const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
            XLSX.writeFile(wb, fileName);
            console.log(
                `✅ [Export] Downloaded ${filteredData.length} products to ${fileName}`,
            );
            notifyManager.success(`Đã tải ${filteredData.length} sản phẩm!`);
            return;
        }

        const productsWithImages = excelDataWithImages.filter(
            (item) => item.imageUrl,
        );

        console.log(
            `🖼️ [Export] ${productsWithImages.length}/${excelDataWithImages.length} products have images`,
        );

        if (productsWithImages.length === 0) {
            notifyManager.warning(
                "Không có sản phẩm nào có hình ảnh để upload!",
            );
            return;
        }

        const convertId = notifyManager.processing(
            `Đang chuyển đổi ${productsWithImages.length} hình ảnh...`,
        );

        const batchSize = 5;
        for (let i = 0; i < productsWithImages.length; i += batchSize) {
            const batch = productsWithImages.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async (item) => {
                    try {
                        item.imageBase64 = await imageUrlToBase64(
                            item.imageUrl,
                        );
                    } catch (error) {
                        console.warn("Failed to convert image:", error);
                    }
                }),
            );

            notifyManager.remove(convertId);
            notifyManager.processing(
                `Đã chuyển đổi ${Math.min(i + batchSize, productsWithImages.length)}/${productsWithImages.length} ảnh`,
            );
        }

        console.log("✅ [Export] All images converted to base64");
        notifyManager.success("Chuyển đổi ảnh hoàn tất!");
        await new Promise((r) => setTimeout(r, 500));

        const excelBlob = new Blob(
            [XLSX.write(wb, { bookType: "xlsx", type: "array" })],
            {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        );

        console.log("=".repeat(60));
        console.log("STEP 1: UPLOAD EXCEL TO TPOS");
        console.log("=".repeat(60));

        const step1Id = notifyManager.processing(
            "Bước 1/3: Đang upload Excel...",
        );
        const excelBase64 = await blobToBase64(excelBlob);
        const uploadResult = await uploadExcelToTPOS(excelBase64);
        notifyManager.remove(step1Id);
        notifyManager.success("Bước 1/3: Upload Excel thành công!");
        await new Promise((r) => setTimeout(r, 1000));

        console.log("=".repeat(60));
        console.log("STEP 2: GET LATEST PRODUCTS");
        console.log("=".repeat(60));

        const step2Id = notifyManager.processing(
            "Bước 2/3: Đang lấy danh sách sản phẩm...",
        );
        const latestProducts = await getLatestProducts(
            excelDataWithImages.length,
        );
        notifyManager.remove(step2Id);
        notifyManager.success(
            `Bước 2/3: Tìm thấy ${latestProducts.length} sản phẩm!`,
        );
        await new Promise((r) => setTimeout(r, 500));

        console.log("=".repeat(60));
        console.log("STEP 3: UPDATE PRODUCTS WITH IMAGES & SAVE IDS");
        console.log("=".repeat(60));

        const step3Id = notifyManager.processing(
            "Bước 3/3: Đang upload ảnh và lưu Product IDs...",
        );
        notifyManager.remove(step3Id);

        let successCount = 0;
        let failCount = 0;
        let savedIdCount = 0;

        for (
            let i = 0;
            i < latestProducts.length;
            i += TPOS_CONFIG.CONCURRENT_UPLOADS
        ) {
            const batch = latestProducts.slice(
                i,
                i + TPOS_CONFIG.CONCURRENT_UPLOADS,
            );

            console.log(
                `\n📦 [Batch ${Math.floor(i / TPOS_CONFIG.CONCURRENT_UPLOADS) + 1}] Processing ${batch.length} products...`,
            );

            await Promise.all(
                batch.map(async (product, batchIndex) => {
                    const globalIndex = i + batchIndex;
                    const item = excelDataWithImages[globalIndex];

                    if (!item) return;

                    try {
                        if (item.imageBase64) {
                            const detail = await getProductDetail(product.Id);
                            const updateResult = await updateProductWithImage(
                                detail,
                                item.imageBase64,
                            );
                        }

                        successCount++;

                        const inventoryItemId = filteredData[globalIndex]?.id;
                        if (inventoryItemId) {
                            const saved = await saveTPOSProductId(
                                inventoryItemId,
                                product.Id,
                            );
                            if (saved) savedIdCount++;
                        }

                        notifyManager.success(
                            `Upload ${successCount}/${productsWithImages.length}: ${item.excelRow["Tên sản phẩm"]}`,
                            1500,
                        );
                    } catch (error) {
                        failCount++;
                        console.error(
                            `❌ [Upload] Failed for product ${globalIndex}:`,
                            error,
                        );
                    }
                }),
            );
        }

        console.log("=".repeat(60));
        console.log("EXPORT SUMMARY");
        console.log("=".repeat(60));
        console.log(`✅ Success: ${successCount}/${productsWithImages.length}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`💾 Saved IDs: ${savedIdCount}`);
        console.log("=".repeat(60));

        if (successCount > 0) {
            notifyManager.success(
                `Hoàn thành! Upload ${successCount}/${productsWithImages.length} sản phẩm lên TPOS! Đã lưu ${savedIdCount} Product IDs.`,
                4000,
            );
        }

        if (failCount > 0) {
            notifyManager.warning(`${failCount} sản phẩm thất bại.`, 3000);
        }

        try {
            await refreshCachedDataAndTable();
            notifyManager.info(
                "Đã làm mới dữ liệu với TPOS Product IDs!",
                2000,
            );
        } catch (refreshError) {
            console.warn("Could not refresh table:", refreshError);
        }
    } catch (error) {
        console.error("❌ [Export] Error:", error);
        notifyManager.error(`Lỗi: ${error.message}`);
    }
}

console.log("✅ Export with Auto Upload to TPOS loaded");
