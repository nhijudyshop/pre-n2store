/**
 * Bill Service - Custom bill generation, printing and sending
 * Extracted from tab1-orders.js for better code organization
 */

/**
 * Bill Service Module
 */
const BillService = (function () {

    /**
     * Generate custom bill HTML from order data
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data (from saleButtonModal)
     * @returns {string} HTML content for the bill
     */
    function generateCustomBillHTML(orderResult, options = {}) {
        // Get bill template settings from localStorage
        const settings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};

        // Support both saleButtonModal (uses currentSaleOrderData) and FastSale (uses orderResult directly)
        const currentSaleOrderData = options.currentSaleOrderData || null;
        const order = currentSaleOrderData || orderResult;
        const defaultData = window.lastDefaultSaleData || {};
        const company = defaultData.Company || { Name: 'NJD Live', Phone: '090 8888 674' };

        // Use settings for shop info if provided, otherwise fallback to company data
        const shopName = settings.shopName || company.Name || 'NJD Live';
        const shopPhone = settings.shopPhone || company.Phone || '090 8888 674';
        const shopAddress = settings.shopAddress || '';
        const billTitle = settings.billTitle || 'PHIẾU BÁN HÀNG';
        const footerText = settings.footerText || 'Cảm ơn quý khách! Hẹn gặp lại!';

        // Section visibility settings (default all visible)
        const showHeader = settings.showHeader !== false;
        const showTitle = settings.showTitle !== false;
        const showSTT = settings.showSTT !== false;
        const showBarcode = settings.showBarcode !== false;
        const showOrderInfo = settings.showOrderInfo !== false;
        const showCarrier = settings.showCarrier !== false;
        const showCustomer = settings.showCustomer !== false;
        const showSeller = settings.showSeller !== false;
        const showProducts = settings.showProducts !== false;
        const showTotals = settings.showTotals !== false;
        const showCOD = settings.showCOD !== false;
        const showDeliveryNote = settings.showDeliveryNote !== false;
        const showFooter = settings.showFooter !== false;

        // Style settings
        const fontShopName = settings.fontShopName || 18;
        const fontTitle = settings.fontTitle || 16;
        const fontContent = settings.fontContent || 13;
        const fontCOD = settings.fontCOD || 18;
        const billWidth = settings.billWidth || '80mm';
        const billPadding = settings.billPadding || 20;
        const codBackground = settings.codBackground || '#fef3c7';
        const codBorder = settings.codBorder || '#f59e0b';

        // Get form values - try form fields first, then fallback to orderResult data
        const receiverName = document.getElementById('saleReceiverName')?.value ||
            orderResult?.Partner?.Name ||
            orderResult?.PartnerDisplayName ||
            '';
        const receiverPhone = document.getElementById('saleReceiverPhone')?.value ||
            orderResult?.Partner?.Phone ||
            orderResult?.Ship_Receiver?.Phone ||
            '';
        const receiverAddress = document.getElementById('saleReceiverAddress')?.value ||
            orderResult?.Partner?.Street ||
            orderResult?.Ship_Receiver?.Street ||
            '';
        const deliveryNote = document.getElementById('saleDeliveryNote')?.value ||
            orderResult?.Ship_Note ||
            orderResult?.Comment ||
            '';
        const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) ||
            orderResult?.DeliveryPrice ||
            0;
        const discount = parseFloat(document.getElementById('saleDiscount')?.value) ||
            orderResult?.Discount ||
            orderResult?.DiscountAmount ||
            0;
        const codAmount = parseFloat(document.getElementById('saleCOD')?.value) ||
            orderResult?.CashOnDelivery ||
            orderResult?.AmountTotal ||
            0;
        const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) ||
            orderResult?.AmountDeposit ||
            0;

        // Get carrier info - prioritize orderResult.CarrierName (set by FastSale enrichment)
        // Only use saleDeliveryPartner dropdown as fallback for saleButtonModal
        const carrierSelect = document.getElementById('saleDeliveryPartner');
        const carrierFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
        // Skip dropdown value if it's a loading placeholder
        const isValidDropdownCarrier = carrierFromDropdown && !carrierFromDropdown.includes('Đang tải');
        const carrierName = orderResult?.CarrierName ||
            orderResult?.Carrier?.Name ||
            (isValidDropdownCarrier ? carrierFromDropdown : '') ||
            '';

        // Get seller name from current user
        const sellerName = window.authManager?.currentUser?.displayName ||
            defaultData.User?.Name ||
            orderResult?.User?.Name ||
            orderResult?.UserName ||
            '';

        // Get STT
        let sttDisplay = '';
        if (order?.IsMerged && order?.OriginalOrders?.length > 1) {
            const allSTTs = order.OriginalOrders
                .map(o => o.SessionIndex)
                .filter(stt => stt)
                .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
            sttDisplay = allSTTs.join(', ');
        } else {
            sttDisplay = order?.SessionIndex || orderResult?.SessionIndex || '';
        }

        // Get products from orderLines - support multiple field names
        const orderLines = order?.orderLines || orderResult?.OrderLines || orderResult?.orderLines || [];
        let totalQuantity = 0;
        let totalAmount = 0;

        const productsHTML = orderLines.map((item, index) => {
            const quantity = item.Quantity || item.ProductUOMQty || 1;
            const price = item.PriceUnit || item.Price || 0;
            const total = quantity * price;
            const productName = item.ProductName || item.ProductNameGet || '';
            const note = item.Note || '';

            totalQuantity += quantity;
            totalAmount += total;

            return `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                        ${productName}
                        ${note ? `<div style="font-size: 11px; color: #6b7280; font-style: italic;">${note}</div>` : ''}
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${quantity}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${price.toLocaleString('vi-VN')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${total.toLocaleString('vi-VN')}</td>
                </tr>
            `;
        }).join('');

        // Calculate final total
        const finalTotal = totalAmount - discount + shippingFee;
        const remainingBalance = codAmount - prepaidAmount;

        // Format date
        const now = new Date();
        const dateStr = now.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Phiếu bán hàng - ${orderResult?.Number || ''}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: ${fontContent}px;
            line-height: 1.4;
            padding: ${billPadding}px;
            max-width: ${billWidth};
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px dashed #333;
        }
        .shop-name {
            font-size: ${fontShopName}px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .shop-phone {
            font-size: 14px;
            color: #333;
        }
        .shop-address {
            font-size: 12px;
            color: #666;
            margin-top: 3px;
        }
        .bill-title {
            font-size: ${fontTitle}px;
            font-weight: bold;
            text-align: center;
            margin: 10px 0;
        }
        .order-info {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ccc;
        }
        .order-info div {
            margin-bottom: 3px;
        }
        .stt-display {
            font-size: 20px;
            font-weight: bold;
            text-align: center;
            background: #f3f4f6;
            padding: 8px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .customer-info {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ccc;
        }
        .customer-info div {
            margin-bottom: 3px;
        }
        .label {
            font-weight: bold;
            display: inline-block;
            min-width: 80px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }
        th {
            background: #f3f4f6;
            padding: 8px 4px;
            text-align: left;
            font-weight: bold;
            border-bottom: 2px solid #333;
        }
        th:nth-child(1) { width: 30px; text-align: center; }
        th:nth-child(3) { width: 40px; text-align: center; }
        th:nth-child(4), th:nth-child(5) { width: 70px; text-align: right; }
        .totals {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 2px dashed #333;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }
        .total-row.final {
            font-size: ${fontTitle}px;
            font-weight: bold;
            padding-top: 5px;
            border-top: 1px solid #333;
            margin-top: 5px;
        }
        .cod-amount {
            font-size: ${fontCOD}px;
            font-weight: bold;
            text-align: center;
            background: ${codBackground};
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border: 2px solid ${codBorder};
        }
        .delivery-note {
            margin-top: 10px;
            padding: 10px;
            background: #fef2f2;
            border-radius: 4px;
            font-size: 11px;
            color: #dc2626;
        }
        .footer {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 2px dashed #333;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        .barcode-container {
            text-align: center;
            margin: 10px 0;
        }
        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }
        @media print {
            body { padding: 5px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    ${showHeader ? `
    <div class="header">
        <div class="shop-name">${shopName}</div>
        <div class="shop-phone">Hotline: ${shopPhone}</div>
        ${shopAddress ? `<div class="shop-address">${shopAddress}</div>` : ''}
    </div>
    ` : ''}

    ${showTitle ? `<div class="bill-title">${billTitle}</div>` : ''}

    ${showSTT && sttDisplay ? `<div class="stt-display">STT: ${sttDisplay}</div>` : ''}

    ${showBarcode ? `
    <!-- Barcode for order number -->
    <div class="barcode-container">
        <svg id="barcode"></svg>
    </div>
    ` : ''}

    ${showOrderInfo ? `
    <div class="order-info">
        <div><span class="label">Số HĐ:</span> ${orderResult?.Number || 'N/A'}</div>
        <div><span class="label">Ngày:</span> ${dateStr}</div>
        ${showCarrier && carrierName ? `<div><span class="label">ĐVVC:</span> ${carrierName}</div>` : ''}
    </div>
    ` : ''}

    ${showCustomer ? `
    <div class="customer-info">
        <div><span class="label">Khách hàng:</span> ${receiverName}</div>
        <div><span class="label">SĐT:</span> ${receiverPhone}</div>
        <div><span class="label">Địa chỉ:</span> ${receiverAddress}</div>
        ${showSeller && sellerName ? `<div><span class="label">Người bán:</span> ${sellerName}</div>` : ''}
    </div>
    ` : ''}

    ${showProducts ? `
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Sản phẩm</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
            </tr>
        </thead>
        <tbody>
            ${productsHTML}
        </tbody>
    </table>
    ` : ''}

    ${showTotals ? `
    <div class="totals">
        <div class="total-row">
            <span>Tổng SL:</span>
            <span>${totalQuantity}</span>
        </div>
        <div class="total-row">
            <span>Tổng tiền hàng:</span>
            <span>${totalAmount.toLocaleString('vi-VN')} đ</span>
        </div>
        ${discount > 0 ? `
        <div class="total-row">
            <span>Chiết khấu:</span>
            <span>-${discount.toLocaleString('vi-VN')} đ</span>
        </div>
        ` : ''}
        <div class="total-row">
            <span>Phí giao hàng:</span>
            <span>${shippingFee.toLocaleString('vi-VN')} đ</span>
        </div>
        ${prepaidAmount > 0 ? `
        <div class="total-row">
            <span>Trả trước (Công nợ):</span>
            <span>-${prepaidAmount.toLocaleString('vi-VN')} đ</span>
        </div>
        ` : ''}
        <div class="total-row final">
            <span>TỔNG CỘNG:</span>
            <span>${finalTotal.toLocaleString('vi-VN')} đ</span>
        </div>
    </div>
    ` : ''}

    ${showCOD ? `
    <div class="cod-amount">
        THU HỘ (COD): ${codAmount.toLocaleString('vi-VN')} đ
    </div>
    ` : ''}

    ${showDeliveryNote && deliveryNote ? `
    <div class="delivery-note">
        <strong>Ghi chú giao hàng:</strong><br>
        ${deliveryNote}
    </div>
    ` : ''}

    ${showFooter ? `
    <div class="footer">
        <div>${footerText}</div>
        <div>Mọi thắc mắc vui lòng liên hệ: ${shopPhone}</div>
    </div>
    ` : ''}

    <!-- JsBarcode library -->
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>
        // Generate barcode after page loads
        document.addEventListener('DOMContentLoaded', function() {
            ${showBarcode ? `
            try {
                JsBarcode("#barcode", "${orderResult?.Number || ''}", {
                    format: "CODE128",
                    width: 1.5,
                    height: 40,
                    displayValue: false,
                    margin: 5
                });
            } catch (e) {
                console.error('Barcode generation failed:', e);
            }
            ` : ''}
        });
    </script>
</body>
</html>
        `;
    }

    /**
     * Open print popup with custom bill
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     */
    function openPrintPopup(orderResult, options = {}) {
        console.log('[BILL-SERVICE] Opening print popup with custom bill...');

        // Generate custom bill HTML
        const html = generateCustomBillHTML(orderResult, options);

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            if (window.notificationManager) {
                window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        };

        // Fallback if onload doesn't fire
        setTimeout(() => {
            if (printWindow && !printWindow.closed) {
                printWindow.focus();
                printWindow.print();
            }
        }, 1500);
    }

    /**
     * Open ONE combined print popup with multiple bills
     * @param {Array<Object>} orders - Array of enriched order objects
     * @param {Object} options - Optional parameters
     */
    function openCombinedPrintPopup(orders, options = {}) {
        console.log('[BILL-SERVICE] Opening combined print popup for', orders.length, 'bills...');

        if (!orders || orders.length === 0) {
            console.warn('[BILL-SERVICE] No orders to print');
            return;
        }

        // Generate HTML for each bill (extract body content only)
        const billBodies = orders.map((order, index) => {
            const fullHtml = generateCustomBillHTML(order, options);
            // Extract content between <body> and </body>
            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const bodyContent = bodyMatch ? bodyMatch[1] : fullHtml;

            // Add page break after each bill except the last one
            const pageBreak = index < orders.length - 1
                ? '<div style="page-break-after: always; border-top: 2px dashed #999; margin: 20px 0; padding-top: 20px;"></div>'
                : '';

            return `<div class="bill-container" data-bill-index="${index}">${bodyContent}</div>${pageBreak}`;
        });

        // Get styles from first bill
        const firstHtml = generateCustomBillHTML(orders[0], options);
        const styleMatch = firstHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const styles = styleMatch ? styleMatch[1] : '';

        // Combine all bills into one HTML document
        const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>In ${orders.length} phiếu bán hàng</title>
    <style>
        ${styles}
        .bill-container {
            margin-bottom: 20px;
        }
        @media print {
            .bill-container {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${billBodies.join('\n')}

    <!-- JsBarcode library -->
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>
        // Generate barcodes for all bills after page loads
        document.addEventListener('DOMContentLoaded', function() {
            const barcodes = document.querySelectorAll('#barcode');
            barcodes.forEach((svg, index) => {
                // Give each barcode a unique ID
                svg.id = 'barcode_' + index;
                const orderNumber = '${orders.map(o => o.Number || '').join("','")}';
                const numbers = orderNumber.split("','");
                try {
                    JsBarcode('#barcode_' + index, numbers[index] || '', {
                        format: "CODE128",
                        width: 1.5,
                        height: 40,
                        displayValue: false,
                        margin: 5
                    });
                } catch (e) {
                    console.error('Barcode generation failed for bill ' + index + ':', e);
                }
            });
        });
    </script>
</body>
</html>
        `;

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=800,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            if (window.notificationManager) {
                window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(combinedHtml);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        let printed = false;
        printWindow.onload = function () {
            setTimeout(() => {
                if (!printed) {
                    printed = true;
                    printWindow.focus();
                    printWindow.print();
                }
            }, 800); // Longer wait for multiple barcodes
        };

        // Fallback if onload doesn't fire
        setTimeout(() => {
            if (printWindow && !printWindow.closed && !printed) {
                printed = true;
                printWindow.focus();
                printWindow.print();
            }
        }, 2000);

        console.log('[BILL-SERVICE] Combined print popup opened successfully');
    }

    /**
     * Generate bill image from HTML using html2canvas
     * @param {Object} orderResult - The created order result
     * @param {Object} options - Optional parameters
     * @returns {Promise<Blob>} - Image blob
     */
    async function generateBillImage(orderResult, options = {}) {
        console.log('[BILL-SERVICE] Generating bill image...');

        // Use the same HTML as the print bill
        const html = generateCustomBillHTML(orderResult, options);

        // Create hidden iframe to render full HTML document with styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 400px;
            height: 1200px;
            border: none;
        `;
        document.body.appendChild(iframe);

        // Write full HTML to iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        // Wait for scripts to load and barcode to render (JsBarcode needs time)
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            // Get the body element from iframe
            const iframeBody = iframeDoc.body;

            // Check if html2canvas is available
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            // Generate image using html2canvas
            const canvas = await html2canvas(iframeBody, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: 400,
                windowHeight: 1200
            });

            // Remove iframe
            document.body.removeChild(iframe);

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            console.log('[BILL-SERVICE] Bill image generated:', blob.size, 'bytes');
            return blob;

        } catch (error) {
            document.body.removeChild(iframe);
            console.error('[BILL-SERVICE] Error generating image:', error);
            throw error;
        }
    }

    /**
     * Send bill image to customer via Messenger
     * @param {Object} orderResult - The created order result
     * @param {string} pageId - Facebook Page ID (channelId)
     * @param {string} psid - Customer's Facebook PSID
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data for conversation lookup
     * @param {string} options.preGeneratedContentUrl - Pre-uploaded image URL (skip generation & upload if provided)
     * @param {string} options.preGeneratedContentId - Pre-uploaded content ID
     * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
     */
    async function sendBillToCustomer(orderResult, pageId, psid, options = {}) {
        console.log('[BILL-SERVICE] ========================================');
        console.log('[BILL-SERVICE] Sending bill image to customer...');
        console.log('[BILL-SERVICE] Page ID:', pageId, 'PSID:', psid);

        if (!pageId || !psid) {
            console.warn('[BILL-SERVICE] Missing pageId or psid, cannot send bill');
            return { success: false, error: 'Missing pageId or psid' };
        }

        try {
            let contentUrl = options.preGeneratedContentUrl || null;
            let contentId = options.preGeneratedContentId || null;

            // Use pre-generated content if available, otherwise generate and upload
            if (contentUrl && contentId) {
                console.log('[BILL-SERVICE] ⚡ Using pre-generated bill image:', contentUrl);
            } else {
                // Step 1: Generate bill image
                console.log('[BILL-SERVICE] Step 1: Generating bill image...');
                const imageBlob = await generateBillImage(orderResult, options);

                // Convert blob to File for upload
                const imageFile = new File([imageBlob], `bill_${orderResult?.Number || Date.now()}.png`, {
                    type: 'image/png'
                });

                // Step 2: Upload image to Pancake
                console.log('[BILL-SERVICE] Step 2: Uploading image to Pancake...');
                if (!window.pancakeDataManager) {
                    throw new Error('PancakeDataManager not available');
                }

                const uploadResult = await window.pancakeDataManager.uploadImage(pageId, imageFile);
                contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
                // IMPORTANT: Use content_id (hash), not id (UUID) - Pancake API expects content_id
                contentId = typeof uploadResult === 'object' ? (uploadResult.content_id || uploadResult.id) : null;

                if (!contentUrl) {
                    throw new Error('Upload failed - no content_url returned');
                }
                console.log('[BILL-SERVICE] Image uploaded:', contentUrl, 'content_id:', contentId);
            }

            // Step 3: Send message with image via Pancake API
            console.log('[BILL-SERVICE] Step 3: Sending message with image...');

            // Get conversation ID - try multiple sources
            const currentSaleOrderData = options.currentSaleOrderData || null;
            let convId = currentSaleOrderData?.Facebook_ConversationId ||
                currentSaleOrderData?.Conversation_Id ||
                currentSaleOrderData?.ConversationId;

            // Try to get conversation from Pancake conversations map by PSID
            if (!convId && window.pancakeDataManager) {
                const pancakeConv = window.pancakeDataManager.getConversationByUserId(psid);
                if (pancakeConv && pancakeConv.id) {
                    convId = pancakeConv.id;
                    console.log('[BILL-SERVICE] Got conversation ID from Pancake map:', convId);
                }
            }

            // Fallback: construct conversationId from pageId_psid (standard Pancake format)
            if (!convId && pageId && psid) {
                convId = `${pageId}_${psid}`;
                console.log('[BILL-SERVICE] Using fallback conversation ID:', convId);
            }

            if (!convId) {
                console.warn('[BILL-SERVICE] No conversation ID found');
                return { success: false, error: 'No conversation ID available' };
            }

            // Send via Pancake API (use same method as chat modal)
            const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error('No page_access_token available. Vui lòng vào Pancake Settings → Tools để tạo token.');
            }

            const sendResponse = await fetch(
                `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${convId}/messages?page_access_token=${pageAccessToken}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'reply_inbox',
                        message: `📋 Phiếu bán hàng #${orderResult?.Number || ''}`,
                        ...(contentId ? { content_ids: [contentId], attachment_type: 'PHOTO' } : {})
                    })
                }
            );

            if (!sendResponse.ok) {
                const errorText = await sendResponse.text();
                throw new Error(`Send failed: ${sendResponse.status} - ${errorText}`);
            }

            const sendResult = await sendResponse.json();

            // Check if API returned success: false (Facebook policy errors, etc.)
            if (sendResult.success === false) {
                const errorMessage = sendResult.message || `Error code: ${sendResult.e_code}`;
                console.warn('[BILL-SERVICE] ⚠️ Bill send failed (API error):', {
                    e_code: sendResult.e_code,
                    e_subcode: sendResult.e_subcode,
                    message: sendResult.message
                });

                // Check for 24-hour policy error - try Facebook API fallback
                const is24HourError = (sendResult.e_code === 10 && sendResult.e_subcode === 2018278) ||
                    (sendResult.message && sendResult.message.includes('khoảng thời gian cho phép'));

                if (is24HourError) {
                    console.log('[BILL-SERVICE] 🔄 24h policy error detected - trying Facebook API fallback...');

                    const fbFallbackResult = await sendViaFacebookAPI(
                        pageId,
                        psid,
                        `📋 Phiếu bán hàng #${orderResult?.Number || ''}\n\n🖼️ Xem hình: ${contentUrl}`,
                        contentUrl
                    );

                    if (fbFallbackResult.success) {
                        console.log('[BILL-SERVICE] ✅ Facebook API fallback succeeded!');
                        return { success: true, messageId: fbFallbackResult.messageId, viafallback: true };
                    } else {
                        console.warn('[BILL-SERVICE] ❌ Facebook API fallback also failed:', fbFallbackResult.error);
                    }
                }

                return {
                    success: false,
                    error: errorMessage,
                    e_code: sendResult.e_code,
                    e_subcode: sendResult.e_subcode
                };
            }

            console.log('[BILL-SERVICE] ✅ Bill sent successfully:', sendResult);
            return { success: true, messageId: sendResult.id };

        } catch (error) {
            console.error('[BILL-SERVICE] Error sending bill:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send message via Facebook Graph API with POST_PURCHASE_UPDATE tag
     * Used as fallback when Pancake API fails with 24h policy error
     * Same logic as sendMessageViaFacebookTag in tab1-orders.js
     * @param {string} pageId - Facebook Page ID
     * @param {string} psid - Customer's Facebook PSID
     * @param {string} message - Text message to send
     * @param {string} imageUrl - Optional image URL to include
     * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
     */
    async function sendViaFacebookAPI(pageId, psid, message, imageUrl = null) {
        console.log('[BILL-SERVICE] [FB-FALLBACK] ========================================');
        console.log('[BILL-SERVICE] [FB-FALLBACK] Attempting Facebook API fallback...');
        console.log('[BILL-SERVICE] [FB-FALLBACK] Page ID:', pageId, 'PSID:', psid);

        try {
            // Get Facebook Page Token from various sources (same as tab1-orders.js)
            let facebookPageToken = null;

            // Source 1: Try from window.currentCRMTeam (set when chat modal opens)
            if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
                const crmPageId = window.currentCRMTeam.ChannelId || window.currentCRMTeam.Facebook_AccountId || window.currentCRMTeam.Id;
                if (String(crmPageId) === String(pageId) ||
                    String(window.currentCRMTeam.Facebook_AccountId) === String(pageId)) {
                    facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
                    console.log('[BILL-SERVICE] [FB-FALLBACK] ✅ Got matching Facebook Page Token from window.currentCRMTeam');
                }
            }

            // Source 2: Try from current order's CRMTeam
            if (!facebookPageToken && window.currentOrder && window.currentOrder.CRMTeam && window.currentOrder.CRMTeam.Facebook_PageToken) {
                const crmPageId = window.currentOrder.CRMTeam.ChannelId || window.currentOrder.CRMTeam.Facebook_AccountId;
                if (String(crmPageId) === String(pageId) ||
                    String(window.currentOrder.CRMTeam.Facebook_AccountId) === String(pageId)) {
                    facebookPageToken = window.currentOrder.CRMTeam.Facebook_PageToken;
                    console.log('[BILL-SERVICE] [FB-FALLBACK] ✅ Got matching Facebook Page Token from currentOrder.CRMTeam');
                }
            }

            // Source 3: Try from cachedChannelsData
            if (!facebookPageToken && window.cachedChannelsData) {
                const channel = window.cachedChannelsData.find(ch =>
                    String(ch.ChannelId) === String(pageId) ||
                    String(ch.Facebook_AccountId) === String(pageId)
                );
                if (channel && channel.Facebook_PageToken) {
                    facebookPageToken = channel.Facebook_PageToken;
                    console.log('[BILL-SERVICE] [FB-FALLBACK] ✅ Got Facebook Page Token from cached channels');
                }
            }

            // Source 4: Fetch CRMTeam directly by pageId from TPOS
            if (!facebookPageToken) {
                console.log('[BILL-SERVICE] [FB-FALLBACK] Token not found, fetching CRMTeam from TPOS...');
                try {
                    const headers = await window.tokenManager?.getAuthHeader() || {};
                    const crmUrl = `${window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'}/api/odata/CRMTeam?$filter=ChannelId eq '${pageId}' or Facebook_AccountId eq '${pageId}'&$top=1`;
                    const response = await fetch(crmUrl, {
                        method: 'GET',
                        headers: { ...headers, 'Accept': 'application/json' }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const teams = data.value || data;
                        if (teams && teams.length > 0 && teams[0].Facebook_PageToken) {
                            facebookPageToken = teams[0].Facebook_PageToken;
                            console.log('[BILL-SERVICE] [FB-FALLBACK] ✅ Got Facebook Page Token from CRMTeam API');
                        }
                    }
                } catch (fetchError) {
                    console.warn('[BILL-SERVICE] [FB-FALLBACK] ⚠️ Could not fetch CRMTeam from TPOS:', fetchError.message);
                }
            }

            // Source 5: Fallback - use currentCRMTeam token anyway
            if (!facebookPageToken && window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
                facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
                console.warn('[BILL-SERVICE] [FB-FALLBACK] ⚠️ Using currentCRMTeam token as last resort fallback');
            }

            if (!facebookPageToken) {
                console.error('[BILL-SERVICE] [FB-FALLBACK] ❌ No Facebook Page Token found');
                return {
                    success: false,
                    error: 'Không tìm thấy Facebook Page Token để gửi fallback'
                };
            }

            // Call Facebook Send API via worker proxy
            const facebookSendUrl = window.API_CONFIG?.buildUrl?.facebookSend?.() ||
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/facebook-send';
            console.log('[BILL-SERVICE] [FB-FALLBACK] Calling:', facebookSendUrl);

            const requestBody = {
                pageId: pageId,
                psid: psid,
                message: message,
                pageToken: facebookPageToken,
                useTag: true, // Use POST_PURCHASE_UPDATE tag to bypass 24h policy
                imageUrls: imageUrl ? [imageUrl] : [] // Include image URL if provided
            };

            const response = await fetch(facebookSendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            console.log('[BILL-SERVICE] [FB-FALLBACK] Response:', result);
            console.log('[BILL-SERVICE] [FB-FALLBACK] ========================================');

            if (result.success) {
                console.log('[BILL-SERVICE] [FB-FALLBACK] ✅ Message sent successfully via Facebook Graph API!');
                console.log('[BILL-SERVICE] [FB-FALLBACK] Used tag:', result.used_tag);
                return {
                    success: true,
                    messageId: result.message_id
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Facebook API error'
                };
            }

        } catch (error) {
            console.error('[BILL-SERVICE] [FB-FALLBACK] ❌ Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Public API
    return {
        generateCustomBillHTML,
        openPrintPopup,
        openCombinedPrintPopup,
        generateBillImage,
        sendBillToCustomer
    };

})();

// Expose to window for global access
window.BillService = BillService;

// Also expose individual functions for backward compatibility
window.generateCustomBillHTML = BillService.generateCustomBillHTML;
window.openPrintPopup = BillService.openPrintPopup;
window.openCombinedPrintPopup = BillService.openCombinedPrintPopup;
window.generateBillImage = BillService.generateBillImage;
window.sendBillToCustomer = BillService.sendBillToCustomer;

console.log('[BILL-SERVICE] Bill Service loaded successfully');
