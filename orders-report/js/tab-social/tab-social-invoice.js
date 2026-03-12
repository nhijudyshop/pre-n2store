/**
 * Tab Social Orders - Invoice Adapter Module
 * Bridges social orders with Tab 1's InvoiceStatusStore, Messenger send, and Cancel order functions.
 * Reuses ALL core functions from Tab 1 — only UI rendering is social-specific.
 */

(function () {
    'use strict';

    // =====================================================
    // RENDER: Phiếu bán hàng column cell for social orders
    // Mirrors Tab1 renderInvoiceStatusCell() but uses social order data
    // =====================================================

    function renderSocialInvoiceCell(order) {
        if (!order || !order.id) {
            return '<span style="color: #9ca3af;">—</span>';
        }

        // Use social order ID as key in InvoiceStatusStore
        const invoiceData = window.InvoiceStatusStore?.get(order.id);

        if (!invoiceData) {
            return '<span style="color: #9ca3af;">—</span>';
        }

        const showState = invoiceData.ShowState || '';
        const showStateConfig = window.getShowStateConfig ? window.getShowStateConfig(showState) : { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' };
        const stateCode = invoiceData.StateCode || 'None';
        const isMergeCancel = invoiceData.IsMergeCancel === true;
        const stateCodeConfig = window.getStateCodeConfig ? window.getStateCodeConfig(stateCode, isMergeCancel) : { color: '#9ca3af', label: '' };
        const stateCodeStyle = stateCodeConfig.style || '';

        // Check if bill was sent
        const billSent = window.InvoiceStatusStore?.isBillSent(order.id);

        let html = `<div class="social-invoice-cell" style="display: flex; flex-direction: column; gap: 2px;">`;

        // Row 1: ShowState badge + UserName + Messenger button + Cancel button
        html += `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">`;

        // ShowState badge
        if (showState) {
            html += `<span style="background: ${showStateConfig.bgColor}; color: ${showStateConfig.color}; border: 1px solid ${showStateConfig.borderColor}; font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 500;" title="So phieu: ${invoiceData.Number || ''}">${showState}</span>`;
        }

        // UserName badge
        if (invoiceData.UserName) {
            html += `<span style="background: #e0e7ff; color: #4338ca; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;" title="Nguoi tao bill">${invoiceData.UserName}</span>`;
        }

        // Messenger button
        const canSendBill = showState === 'Đã xác nhận' || showState === 'Đã thanh toán';
        if (billSent) {
            html += `
                <button type="button"
                    class="btn-send-bill-social"
                    data-order-id="${order.id}"
                    onclick="window.socialInvoiceSendBill('${order.id}'); event.stopPropagation();"
                    title="Xem bill (da gui) - chi in, khong gui lai"
                    style="background: #d1fae5; color: #059669; border: 1px solid #6ee7b7; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    ✓
                </button>
            `;
        } else if (canSendBill) {
            html += `
                <button type="button"
                    class="btn-send-bill-social"
                    data-order-id="${order.id}"
                    onclick="window.socialInvoiceSendBill('${order.id}'); event.stopPropagation();"
                    title="Gui bill qua Messenger"
                    style="background: #0084ff; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/>
                    </svg>
                </button>
            `;
        }

        // X button for cancel order
        if (canSendBill) {
            html += `
                <button type="button"
                    class="btn-cancel-order-social"
                    data-order-id="${order.id}"
                    onclick="window.socialInvoiceCancelOrder('${order.id}'); event.stopPropagation();"
                    title="Nho huy don"
                    style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px; margin-left: 2px;">
                    ✕
                </button>
            `;
        }
        html += `</div>`;

        // Row 2: StateCode text
        if (stateCodeConfig.label) {
            html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}</div>`;
        }

        html += `</div>`;
        return html;
    }

    // =====================================================
    // SEND BILL VIA MESSENGER (reuse Tab 1 core functions)
    // =====================================================

    async function socialInvoiceSendBill(socialOrderId) {
        const socialOrder = window.SocialOrderState?.orders?.find(o => o.id === socialOrderId);

        const invoiceData = window.InvoiceStatusStore?.get(socialOrderId);
        if (!invoiceData) {
            window.notificationManager?.error('Don hang chua co phieu ban hang');
            return;
        }

        const billAlreadySent = window.InvoiceStatusStore?.isBillSent(socialOrderId);

        // Get Messenger info from social order or invoice data
        const psid = socialOrder?.psid || socialOrder?.Facebook_ASUserId || '';
        const pageId = socialOrder?.pageId || '';
        const channelId = pageId || (socialOrder?.postUrl ? extractPageIdFromPostUrl(socialOrder.postUrl) : '');

        // Only require Messenger info if bill not sent yet
        if (!billAlreadySent && (!psid || !channelId)) {
            window.notificationManager?.error('Khong co thong tin Messenger cua khach hang. Vui long cap nhat PSID va Page ID trong don hang.');
            return;
        }

        // Auto-detect carrier from address
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress && typeof window.extractDistrictFromAddress === 'function') {
            const districtInfo = window.extractDistrictFromAddress(invoiceData.ReceiverAddress, null);
            if (districtInfo) {
                carrierName = getCarrierNameFromDistrictInfo(districtInfo);
            }
        }

        // Build enriched order (same format as Tab 1)
        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference,
            DateInvoice: invoiceData.DateInvoice,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,
            Discount: invoiceData.Discount,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [socialOrderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress
            }
        };

        const walletBalance = invoiceData.PaymentAmount || 0;
        const orderCode = invoiceData.Number || invoiceData.Reference || socialOrderId;

        // Use bill preview modal (reuse Tab 1's showBillPreviewModal)
        if (typeof window.showBillPreviewModal === 'function') {
            await window.showBillPreviewModal(enrichedOrder, channelId, psid, socialOrderId, orderCode, 'social', null, billAlreadySent, walletBalance);
        } else {
            // Fallback: direct send
            if (billAlreadySent) {
                window.notificationManager?.info('Bill da duoc gui truoc do');
                return;
            }
            const confirmed = confirm(`Xac nhan gui bill cho don hang ${orderCode}?`);
            if (!confirmed) return;

            try {
                const result = await window.sendBillToCustomer(enrichedOrder, channelId, psid, {});
                if (result.success) {
                    window.InvoiceStatusStore?.markBillSent(socialOrderId);
                    window.notificationManager?.success(`Da gui bill cho ${orderCode}`);
                    refreshSocialInvoiceCell(socialOrderId);
                } else {
                    throw new Error(result.error || 'Gui bill that bai');
                }
            } catch (error) {
                window.notificationManager?.error(`Loi: ${error.message}`);
            }
        }
    }

    // =====================================================
    // CANCEL ORDER (reuse Tab 1 core functions)
    // =====================================================

    function socialInvoiceCancelOrder(socialOrderId) {
        if (!socialOrderId) {
            window.notificationManager?.error('Khong tim thay Order ID');
            return;
        }

        const invoiceData = window.InvoiceStatusStore?.get(socialOrderId);
        if (!invoiceData) {
            window.notificationManager?.error('Khong tim thay du lieu phieu ban hang');
            return;
        }

        const socialOrder = window.SocialOrderState?.orders?.find(o => o.id === socialOrderId);

        // Build compatible order object for the cancel modal
        const order = {
            Id: invoiceData.Id,
            SaleOnlineIds: [socialOrderId],
            Reference: invoiceData.Reference || socialOrderId,
            Number: invoiceData.Number,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName || socialOrder?.customerName,
            ShowState: invoiceData.ShowState,
            ReceiverPhone: invoiceData.ReceiverPhone || socialOrder?.phone || '',
            Phone: invoiceData.ReceiverPhone || socialOrder?.phone || '',
            AmountTotal: invoiceData.AmountTotal || socialOrder?.totalAmount || 0
        };

        // Store in temp global (Tab 1's confirmCancelOrderFromMain reads this)
        window._cancelOrderFromMain = order;
        // Also store social order ID for post-cancel status update
        window._cancelSocialOrderId = socialOrderId;

        // Auto-detect carrier
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress && typeof window.extractDistrictFromAddress === 'function') {
            const districtInfo = window.extractDistrictFromAddress(invoiceData.ReceiverAddress, null);
            if (districtInfo) {
                carrierName = getCarrierNameFromDistrictInfo(districtInfo);
            }
        }

        // Build enriched order for bill preview in cancel modal
        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,
            Discount: invoiceData.Discount,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [socialOrderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress
            }
        };

        // Create cancel modal HTML (same UI as Tab 1)
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 1200px; width: 98%; max-height: 95vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nho Huy Don
                        </h3>
                        <button onclick="closeSocialCancelModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                        <!-- Left: Bill Preview -->
                        <div style="flex: 1.2; min-width: 400px;">
                            <div id="socialCancelBillPreview" style="border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; min-height: 600px; max-height: 75vh; overflow: auto;">
                                <p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Dang tao bill...</p>
                            </div>
                        </div>

                        <!-- Right: Order Info & Reason -->
                        <div style="flex: 0.8; min-width: 320px;">
                            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                                <p style="margin: 0 0 8px 0; font-weight: 600;">Thong tin don:</p>
                                <p style="margin: 0; font-size: 14px;">
                                    <strong>Ma:</strong> ${order.Reference || 'N/A'}<br>
                                    <strong>So phieu:</strong> ${order.Number || 'N/A'}<br>
                                    <strong>Khach:</strong> ${order.PartnerDisplayName || 'N/A'}<br>
                                    <strong>Trang thai:</strong> ${order.ShowState || 'N/A'}
                                </p>
                            </div>

                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Ly do huy don:</label>
                                <textarea id="socialCancelReasonInput" rows="4" placeholder="Nhap ly do khach huy / doi y..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px;"></textarea>
                            </div>

                            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button onclick="closeSocialCancelModal()" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer;">
                                    Dong
                                </button>
                                <button id="socialCancelConfirmBtn" onclick="confirmSocialCancelOrder()" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    <i class="fas fa-check"></i> Xac nhan huy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('cancelOrderModal');
        if (existingModal) existingModal.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Generate bill preview
        const previewContainer = document.getElementById('socialCancelBillPreview');
        if (previewContainer && typeof window.generateCustomBillHTML === 'function') {
            try {
                const walletBalance = invoiceData.PaymentAmount || 0;
                const billHTML = window.generateCustomBillHTML(enrichedOrder, { walletBalance });

                if (billHTML) {
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'width: 100%; height: 600px; border: none; background: white;';
                    previewContainer.innerHTML = '';
                    previewContainer.appendChild(iframe);

                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(billHTML);
                    iframeDoc.close();
                } else {
                    previewContainer.innerHTML = '<p style="color: #9ca3af; padding: 20px; text-align: center;">Khong the tao bill preview</p>';
                }
            } catch (e) {
                console.error('[SOCIAL-INVOICE] Error generating bill preview:', e);
                previewContainer.innerHTML = '<p style="color: #ef4444; padding: 20px; text-align: center;">Loi tao bill</p>';
            }
        }
    }

    // =====================================================
    // CONFIRM CANCEL ORDER (reuses Tab 1's TPOS API cancel + InvoiceStatusDeleteStore)
    // =====================================================

    async function confirmSocialCancelOrder() {
        const cancelBtn = document.getElementById('socialCancelConfirmBtn');
        if (cancelBtn?.disabled) return;

        const reason = document.getElementById('socialCancelReasonInput')?.value?.trim();
        if (!reason) {
            window.notificationManager?.warning('Vui long nhap ly do huy don');
            return;
        }

        const order = window._cancelOrderFromMain;
        if (!order) {
            window.notificationManager?.error('Khong tim thay du lieu don huy');
            closeSocialCancelModal();
            return;
        }

        const saleOnlineId = order.SaleOnlineIds?.[0];
        const socialOrderId = window._cancelSocialOrderId || saleOnlineId;
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);

        if (!invoiceData) {
            window.notificationManager?.error('Khong tim thay du lieu phieu ban hang');
            closeSocialCancelModal();
            return;
        }

        // Disable button
        const originalBtnText = cancelBtn?.innerHTML;
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Dang xu ly...';
        }

        try {
            // Step 1: Call TPOS API to cancel the order (reuse Tab 1 logic)
            const fastSaleOrderId = parseInt(order.Id, 10);
            if (fastSaleOrderId && !isNaN(fastSaleOrderId) && window.tokenManager?.authenticatedFetch) {
                console.log(`[SOCIAL-INVOICE] Calling TPOS API to cancel order ID: ${fastSaleOrderId}`);
                const cancelResponse = await window.tokenManager.authenticatedFetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.ActionCancel', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ ids: [fastSaleOrderId] })
                });

                if (!cancelResponse.ok) {
                    const errorText = await cancelResponse.text();
                    console.error('[SOCIAL-INVOICE] TPOS cancel API error:', cancelResponse.status, errorText);
                    window.notificationManager?.error(`Loi huy don tren TPOS: ${cancelResponse.status}`);
                    return;
                }

                const responseText = await cancelResponse.text();
                const cancelResult = responseText ? JSON.parse(responseText) : { success: true };
                console.log('[SOCIAL-INVOICE] TPOS cancel result:', cancelResult);
            } else {
                console.warn('[SOCIAL-INVOICE] No valid FastSaleOrder ID found, skipping TPOS cancel API');
            }

            // Step 2: Ensure currentUserIdentifier is loaded before saving
            if (!window.currentUserIdentifier) {
                try {
                    const auth = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
                    if (auth?.username && typeof firebase !== 'undefined' && firebase.firestore) {
                        const db = firebase.firestore();
                        const userDoc = await db.collection('users').doc(auth.username).get();
                        if (userDoc.exists) {
                            window.currentUserIdentifier = userDoc.data().identifier || null;
                            console.log('[SOCIAL-INVOICE] Loaded user identifier from Firestore:', window.currentUserIdentifier);
                        }
                    }
                    // Fallback: use displayName from authManager if Firestore lookup failed
                    if (!window.currentUserIdentifier) {
                        const authFallback = window.authManager?.getAuthData?.();
                        window.currentUserIdentifier = authFallback?.displayName || authFallback?.username || null;
                        console.log('[SOCIAL-INVOICE] Using auth displayName as fallback:', window.currentUserIdentifier);
                    }
                } catch (e) {
                    console.warn('[SOCIAL-INVOICE] Could not load user identifier:', e);
                    // Last resort fallback
                    const authFallback = window.authManager?.getAuthData?.();
                    if (authFallback?.displayName || authFallback?.username) {
                        window.currentUserIdentifier = authFallback.displayName || authFallback.username;
                    }
                }
            }

            // Save to delete store (reuse Tab 1's InvoiceStatusDeleteStore)
            if (window.InvoiceStatusDeleteStore?.add) {
                await window.InvoiceStatusDeleteStore.add(saleOnlineId, {
                    ...invoiceData,
                    ...order,
                    SaleOnlineId: saleOnlineId
                }, reason);
            }

            // Step 3: Delete from InvoiceStatusStore
            if (window.InvoiceStatusStore?.delete) {
                await window.InvoiceStatusStore.delete(saleOnlineId);
                console.log(`[SOCIAL-INVOICE] Deleted invoice from InvoiceStatusStore: ${saleOnlineId}`);
            }

            // Step 4: Update social order status back to "draft" (Nhap)
            const socialOrder = window.SocialOrderState?.orders?.find(o => o.id === socialOrderId);
            if (socialOrder) {
                socialOrder.status = 'draft';
                // Also clear invoice-related fields
                delete socialOrder.invoiceNumber;
                delete socialOrder.invoiceCreatedBy;
                // Save to storage + Firebase
                if (typeof saveSocialOrdersToStorage === 'function') {
                    saveSocialOrdersToStorage();
                }
                if (typeof updateSocialOrder === 'function') {
                    updateSocialOrder(socialOrderId, { status: 'draft' });
                }
            }

            // Step 5: Log cancel activity (reuse Tab 1 pattern - async, non-blocking)
            const customerPhone = order.ReceiverPhone || order.Phone || '';
            const orderNumber = order.Number || order.Reference || '';
            if (customerPhone && typeof window.logCancelOrderActivity === 'function') {
                window.logCancelOrderActivity(customerPhone, orderNumber, order, reason);
            }

            window.notificationManager?.success(`Da luu yeu cau huy don: ${order.Number || order.Reference}`);
            closeSocialCancelModal();

            // Refresh table
            if (typeof performTableSearch === 'function') {
                performTableSearch();
            } else if (typeof renderTable === 'function') {
                renderTable();
            }

            // Clear temp data
            delete window._cancelOrderFromMain;
            delete window._cancelSocialOrderId;

        } catch (error) {
            console.error('[SOCIAL-INVOICE] Error cancelling order:', error);
            window.notificationManager?.error('Loi luu yeu cau huy don');

            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML = originalBtnText || '<i class="fas fa-check"></i> Xac nhan huy';
            }
        }
    }

    function closeSocialCancelModal() {
        const modal = document.getElementById('cancelOrderModal');
        if (modal) modal.remove();
        delete window._cancelOrderFromMain;
        delete window._cancelSocialOrderId;
    }

    // =====================================================
    // HELPER: Refresh a single invoice cell in the table
    // =====================================================

    function refreshSocialInvoiceCell(socialOrderId) {
        const row = document.querySelector(`tr[data-order-id="${socialOrderId}"]`);
        if (row) {
            const cell = row.querySelector('td[data-column="invoice-status"]');
            if (cell) {
                const order = window.SocialOrderState?.orders?.find(o => o.id === socialOrderId);
                if (order) {
                    cell.innerHTML = renderSocialInvoiceCell(order);
                }
            }
        }
    }

    // =====================================================
    // HELPER: Extract page ID from post URL
    // =====================================================

    function extractPageIdFromPostUrl(postUrl) {
        if (!postUrl) return '';
        // Try to extract page ID from Facebook post URL patterns
        // e.g., https://www.facebook.com/123456789/posts/...
        const match = postUrl.match(/facebook\.com\/(\d+)/);
        return match ? match[1] : '';
    }

    // =====================================================
    // HELPER: Get carrier name from district info
    // =====================================================

    function getCarrierNameFromDistrictInfo(districtInfo) {
        if (!districtInfo) return 'SHIP TINH';
        if (districtInfo.isProvince) return 'SHIP TINH';

        const districts20k = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
        const districts30k = ['2', '12'];
        const districts35k = ['9'];

        if (districtInfo.districtNumber) {
            const num = districtInfo.districtNumber;
            if (districts20k.includes(num)) return 'THANH PHO (20.000 d)';
            if (districts30k.includes(num)) return 'THANH PHO (30.000 d)';
            if (districts35k.includes(num)) return 'THANH PHO (35.000 d)';
        }

        return 'SHIP TINH';
    }

    // =====================================================
    // UPDATE SOCIAL ORDER AFTER BILL CREATION
    // Called after confirmAndPrintSale() succeeds
    // =====================================================

    function updateSocialOrderAfterBillCreation(socialOrderId) {
        if (!socialOrderId) return;

        const order = window.SocialOrderState?.orders?.find(o => o.id === socialOrderId);
        if (!order) return;

        // Change status to 'order' (Don hang)
        order.status = 'order';

        // Save to storage + Firebase
        if (typeof saveSocialOrdersToStorage === 'function') {
            saveSocialOrdersToStorage();
        }
        if (typeof updateSocialOrder === 'function') {
            updateSocialOrder(socialOrderId, { status: 'order' });
        }

        // Refresh table
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        } else if (typeof renderTable === 'function') {
            renderTable();
        }

        console.log(`[SOCIAL-INVOICE] Updated social order ${socialOrderId} status to "order"`);
    }

    // =====================================================
    // PATCH: InvoiceStatusStore.storeFromApiResult for social orders
    // Social orders have empty SaleOnlineIds, so storeFromApiResult skips them.
    // This patch stores the created order data using the social order ID as key.
    // =====================================================

    function patchStoreForSocialOrders() {
        if (!window.InvoiceStatusStore?.storeFromApiResult) {
            // InvoiceStatusStore not ready yet, retry
            setTimeout(patchStoreForSocialOrders, 200);
            return;
        }

        const originalStore = window.InvoiceStatusStore.storeFromApiResult.bind(window.InvoiceStatusStore);
        window.InvoiceStatusStore.storeFromApiResult = function (apiResult) {
            // Call original (stores by SaleOnlineIds for Tab 1 orders)
            originalStore(apiResult);

            // For social orders: also store with social order ID
            const socialOrderId = window._lastSocialSaleOrderId;
            if (socialOrderId && apiResult?.OrdersSucessed?.length > 0) {
                const createdOrder = apiResult.OrdersSucessed[0];
                // Store using social order ID as key
                window.InvoiceStatusStore.set(socialOrderId, createdOrder);
                console.log('[SOCIAL-INVOICE] Stored invoice for social order:', socialOrderId, 'Number:', createdOrder.Number);
            }
        };

        console.log('[SOCIAL-INVOICE] Patched InvoiceStatusStore.storeFromApiResult for social orders');
    }

    patchStoreForSocialOrders();

    // =====================================================
    // OVERRIDE: closeSaleButtonModal to update social order status
    // =====================================================

    // Override to handle social order status update after bill creation
    window.closeSaleButtonModal = function (clearSelection = false) {
        if (clearSelection && window._lastSocialSaleOrderId) {
            const socialOrderId = window._lastSocialSaleOrderId;
            window._lastSocialSaleOrderId = null;
            // storeFromApiResult already ran before closeSaleButtonModal is called
            // (confirmAndPrintSale: storeFromApiResult at T=0, closeSaleButtonModal at T=500ms)
            // So data is already in InvoiceStatusStore - call directly, no setTimeout needed
            updateSocialOrderAfterBillCreation(socialOrderId);
        }

        // Close the modal
        const modal = document.getElementById('saleButtonModal');
        if (modal) modal.style.display = 'none';
        currentSaleOrderData = null;
        currentSalePartnerData = null;
        currentSaleLastDeposit = null;
    };

    // =====================================================
    // EXPORTS
    // =====================================================

    window.renderSocialInvoiceCell = renderSocialInvoiceCell;
    window.socialInvoiceSendBill = socialInvoiceSendBill;
    window.socialInvoiceCancelOrder = socialInvoiceCancelOrder;
    window.confirmSocialCancelOrder = confirmSocialCancelOrder;
    window.closeSocialCancelModal = closeSocialCancelModal;
    window.refreshSocialInvoiceCell = refreshSocialInvoiceCell;
    window.updateSocialOrderAfterBillCreation = updateSocialOrderAfterBillCreation;

})();
