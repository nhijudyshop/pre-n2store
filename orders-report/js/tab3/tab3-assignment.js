/**
 * TAB3-ASSIGNMENT.JS
 * Product assignment CRUD: add/remove products, add/remove STTs,
 * clear all, reload with cache clear.
 *
 * Load order: tab3-assignment.js (4th, after tab3-table.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, auth, ui, data: dataFns } = window._tab3;

    // =====================================================
    // ADD PRODUCT TO ASSIGNMENT
    // =====================================================

    async function addProductToAssignment(productId) {
        try {
            const response = await auth.authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
            );

            if (!response.ok) {
                throw new Error('Không thể tải thông tin sản phẩm');
            }

            const productData = await response.json();
            let imageUrl = productData.ImageUrl;
            let templateData = null;

            if (productData.ProductTmplId) {
                try {
                    const templateResponse = await auth.authenticatedFetch(
                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
                    );

                    if (templateResponse.ok) {
                        templateData = await templateResponse.json();
                        if (!imageUrl) {
                            imageUrl = templateData.ImageUrl;
                        }
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
                }
            }

            if (state.autoAddVariants && templateData && templateData.ProductVariants && templateData.ProductVariants.length > 0) {
                const activeVariants = templateData.ProductVariants.filter(v => v.Active === true);

                const sortedVariants = window._tab3.fn.sortVariants(activeVariants);

                if (sortedVariants.length === 0) {
                    const existingIndex = state.assignments.findIndex(a => a.productId === productData.Id);
                    if (existingIndex !== -1) {
                        ui.showNotification('Sản phẩm đã có trong danh sách', 'error');
                        return;
                    }

                    const productCode = utils.extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                    const assignment = {
                        id: Date.now(),
                        productId: productData.Id,
                        productName: productData.NameGet,
                        productCode: productCode,
                        imageUrl: imageUrl,
                        sttList: []
                    };

                    state.assignments.push(assignment);
                    dataFns.saveAssignments();
                    window._tab3.fn.renderAssignmentTable();
                    ui.showNotification('Đã thêm sản phẩm vào danh sách');
                    return;
                }

                let addedCount = 0;
                let skippedCount = 0;

                for (const variant of sortedVariants) {
                    const existingIndex = state.assignments.findIndex(a => a.productId === variant.Id);
                    if (existingIndex !== -1) {
                        skippedCount++;
                        continue;
                    }

                    const variantImageUrl = variant.ImageUrl || imageUrl;
                    const productCode = utils.extractProductCode(variant.NameGet) || variant.DefaultCode || variant.Barcode || '';

                    const assignment = {
                        id: Date.now() + addedCount,
                        productId: variant.Id,
                        productName: variant.NameGet,
                        productCode: productCode,
                        imageUrl: variantImageUrl,
                        sttList: []
                    };

                    state.assignments.push(assignment);
                    addedCount++;
                }

                dataFns.saveAssignments();
                window._tab3.fn.renderAssignmentTable();

                if (addedCount > 0 && skippedCount > 0) {
                    ui.showNotification(`✅ Đã thêm ${addedCount} biến thể, bỏ qua ${skippedCount} biến thể đã tồn tại`);
                } else if (skippedCount > 0) {
                    ui.showNotification(`⚠️ Tất cả ${skippedCount} biến thể đã tồn tại trong danh sách`, 'error');
                } else if (addedCount > 0) {
                    ui.showNotification(`✅ Đã thêm ${addedCount} biến thể sản phẩm`);
                }
            } else {
                const existingIndex = state.assignments.findIndex(a => a.productId === productData.Id);
                if (existingIndex !== -1) {
                    ui.showNotification('Sản phẩm đã có trong danh sách', 'error');
                    return;
                }

                const productCode = utils.extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                const assignment = {
                    id: Date.now(),
                    productId: productData.Id,
                    productName: productData.NameGet,
                    productCode: productCode,
                    imageUrl: imageUrl,
                    sttList: []
                };

                state.assignments.push(assignment);
                dataFns.saveAssignments();
                window._tab3.fn.renderAssignmentTable();
                ui.showNotification('Đã thêm sản phẩm vào danh sách');
            }
        } catch (error) {
            console.error('Error adding product:', error);
            ui.showNotification('Lỗi: ' + error.message, 'error');
        }
    }

    // =====================================================
    // STT MANAGEMENT
    // =====================================================

    function addSTTToAssignment(assignmentId, stt, orderData) {
        const assignment = state.assignments.find(a => a.id === assignmentId);
        if (!assignment) return;

        if (!assignment.sttList) {
            assignment.sttList = [];
        }

        assignment.sttList.push({
            stt: stt,
            orderInfo: orderData,
            addedAt: Date.now()
        });

        dataFns.saveAssignments();
        window._tab3.fn.renderAssignmentTable();

        setTimeout(() => {
            const input = document.querySelector(`input[data-assignment-id="${assignmentId}"]`);
            if (input) {
                input.focus();
            }
        }, 0);

        const count = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = count > 1 ? ` (x${count})` : '';
        ui.showNotification(`✅ Đã thêm STT ${stt}${countText} - ${orderData.customerName || 'N/A'}`);
        window._tab3.fn.hideOrderTooltip();
    }

    window.removeSTTByIndex = function (assignmentId, index) {
        const assignment = state.assignments.find(a => a.id === assignmentId);
        if (!assignment || !assignment.sttList) return;

        const stt = assignment.sttList[index].stt;
        assignment.sttList.splice(index, 1);

        dataFns.saveAssignments(true);
        window._tab3.fn.renderAssignmentTable();

        const remainingCount = assignment.sttList.filter(item => item.stt === stt).length;
        const countText = remainingCount > 0 ? ` (còn ${remainingCount})` : '';
        ui.showNotification(`🗑️ Đã xóa STT ${stt}${countText}`);
    };

    // =====================================================
    // REMOVE / CLEAR
    // =====================================================

    window.removeAssignment = function (assignmentId) {
        if (confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
            state.assignments = state.assignments.filter(a => a.id !== assignmentId);
            dataFns.saveAssignments(true);
            window._tab3.fn.renderAssignmentTable();
            ui.showNotification('Đã xóa sản phẩm');
        }
    };

    window.clearAllAssignments = function () {
        if (state.assignments.length === 0) {
            ui.showNotification('Danh sách đã trống', 'error');
            return;
        }

        if (confirm(`Bạn có chắc muốn xóa tất cả ${state.assignments.length} sản phẩm?`)) {
            state.assignments = [];
            dataFns.saveAssignments(true);
            window._tab3.fn.renderAssignmentTable();
            ui.showNotification('Đã xóa tất cả sản phẩm');
        }
    };

    // =====================================================
    // RELOAD WITH CACHE CLEAR
    // =====================================================

    window.reloadWithCacheClear = function () {
        console.log('[RELOAD] 🔄 Reload with cache clear requested...');

        if (window.cacheManager) {
            window.cacheManager.clear("orders");
            window.cacheManager.clear("campaigns");
            console.log('[RELOAD] ✅ Cache cleared (orders + campaigns)');
        }

        state.ordersData = [];
        dataFns.updateOrdersCount();
        ui.showNotification('🔄 Đang tải lại dữ liệu từ Tab Quản Lý...', 'info');

        if (window.parent) {
            window.parent.postMessage({
                type: 'RELOAD_TAB1_ONLY'
            }, '*');
            console.log('[RELOAD] 📤 Sent RELOAD_TAB1_ONLY message to parent');
        } else {
            window.location.reload();
        }
    };

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window._tab3.fn.addProductToAssignment = addProductToAssignment;
    window._tab3.fn.addSTTToAssignment = addSTTToAssignment;

})();
