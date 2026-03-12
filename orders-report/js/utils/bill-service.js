/**
 * Bill Service - Custom bill generation, printing and sending
 * Extracted from tab1-orders.js for better code organization
 */

/**
 * Bill Service Module
 */
const BillService = (function () {

    /**
     * Generate bill HTML from order data (EXACT TPOS template copy)
     *
     * This is a fallback bill template that matches TPOS bill format EXACTLY.
     * Used when TPOS API is unavailable or fails.
     * CSS and HTML structure copied directly from TPOS API response.
     *
     * ===== TEMPLATE VARIABLES =====
     * These variables are extracted from orderResult and can be customized:
     *
     * SHOP INFO:
     *   - shopName: Shop name (default: "NJD Live")
     *
     * ORDER INFO:
     *   - billNumber: orderResult.Number - Bill number (e.g., "NJD/2026/49318")
     *   - dateStr: Bill date formatted as "DD/MM/YYYY HH:mm"
     *   - carrierName: Delivery carrier name
     *   - sttDisplay: Session index / STT number
     *
     * CUSTOMER INFO:
     *   - receiverName: Customer name (Partner.Name, PartnerDisplayName, ReceiverName)
     *   - receiverPhone: Customer phone (Partner.Phone, Ship_Receiver.Phone, ReceiverPhone)
     *   - receiverAddress: Customer address (Partner.Street, Ship_Receiver.Street, ReceiverAddress)
     *   - sellerName: Seller name (from authManager or orderResult.User.Name)
     *
     * PRODUCTS (from orderLines array):
     *   - ProductName / ProductNameGet: Product name
     *   - Quantity / ProductUOMQty: Quantity
     *   - PriceUnit / Price: Unit price
     *   - ProductUOMName: Unit name (default "Cái")
     *   - Note: Product note (optional, displayed in italics)
     *
     * TOTALS:
     *   - totalQuantity: Sum of all quantities
     *   - totalAmount: Sum of all product prices (before shipping/discount)
     *   - shippingFee: Shipping fee (DeliveryPrice)
     *   - discount: Discount amount (DecreaseAmount)
     *   - prepaidAmount: Prepaid/deposit amount (AmountDeposit, PaymentAmount)
     *   - finalTotal: totalAmount - discount + shippingFee
     *   - codAmount: Amount to collect on delivery (còn lại)
     *
     * NOTES:
     *   - deliveryNote: Delivery note (DeliveryNote field)
     *   - comment: General comment (Comment field)
     *
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data (from saleButtonModal)
     * @returns {string} HTML content for the bill (EXACT TPOS format)
     */
    function generateCustomBillHTML(orderResult, options = {}) {
        console.log('[BILL-SERVICE] generateCustomBillHTML called');
        console.log('[BILL-SERVICE] orderResult:', {
            Number: orderResult?.Number,
            Reference: orderResult?.Reference,
            CarrierName: orderResult?.CarrierName,
            State: orderResult?.State,
            ShowState: orderResult?.ShowState,
            SessionIndex: orderResult?.SessionIndex,
            PartnerDisplayName: orderResult?.PartnerDisplayName,
            hasOrderLines: !!(orderResult?.OrderLines || orderResult?.orderLines)
        });

        // Support both saleButtonModal (uses currentSaleOrderData) and FastSale (uses orderResult directly)
        const currentSaleOrderData = options.currentSaleOrderData || null;
        const order = currentSaleOrderData || orderResult;
        const defaultData = window.lastDefaultSaleData || {};
        const company = defaultData.Company || { Name: 'NJD Live' };

        // ========== EXTRACT VARIABLES ==========

        // Shop info
        const shopName = company.Name || 'NJD Live';

        // Only read form fields if saleButtonModal is currently visible (single order flow)
        // This prevents batch flow from using stale form data from previous single order
        const saleModal = document.getElementById('saleButtonModal');
        const isModalVisible = saleModal && saleModal.style.display !== 'none' && saleModal.style.display !== '';

        // Customer info - only use form fields when modal is visible
        const receiverName = (isModalVisible && document.getElementById('saleReceiverName')?.value) ||
            orderResult?.Partner?.Name ||
            orderResult?.PartnerDisplayName ||
            orderResult?.ReceiverName ||
            '';
        const receiverPhone = (isModalVisible && document.getElementById('saleReceiverPhone')?.value) ||
            orderResult?.Partner?.Phone ||
            orderResult?.Ship_Receiver?.Phone ||
            orderResult?.ReceiverPhone ||
            '';
        const receiverAddress = (isModalVisible && document.getElementById('saleReceiverAddress')?.value) ||
            orderResult?.Partner?.Street ||
            orderResult?.Ship_Receiver?.Street ||
            orderResult?.ReceiverAddress ||
            '';

        // Money values
        const shippingFee = (isModalVisible && parseFloat(document.getElementById('saleShippingFee')?.value)) ||
            orderResult?.DeliveryPrice ||
            0;
        const discount = (isModalVisible && parseFloat(document.getElementById('saleDiscount')?.value)) ||
            orderResult?.Discount ||
            orderResult?.DiscountAmount ||
            orderResult?.DecreaseAmount ||
            0;

        // Wallet balance for offline calculation
        // Priority: 1) options.walletBalance (passed explicitly, e.g. from confirmAndPrintSale)
        //           2) form field salePrepaidAmount (when modal visible)
        //           3) orderResult.PaymentAmount (fallback)
        const walletBalance = options.walletBalance ||
            (isModalVisible && parseFloat(document.getElementById('salePrepaidAmount')?.value)) ||
            orderResult?.PaymentAmount ||
            0;

        // Virtual debt flag - true when order uses công nợ ảo from return ticket
        const hasVirtualDebt = options.hasVirtualDebt ||
            orderResult?.hasVirtualDebt ||
            false;

        // ========== PARSE TAGS (for STT merge display) ==========
        let orderTags = [];
        try {
            const tagsRaw = order?.Tags || orderResult?.Tags;
            if (tagsRaw) {
                orderTags = typeof tagsRaw === 'string' ? JSON.parse(tagsRaw) : tagsRaw;
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }

        // Find merge tag (Gộp X Y Z or GỘP X Y Z) for STT display
        let mergeTagNumbers = [];
        const mergeTag = orderTags.find(t => {
            const tagName = (t.Name || '').trim();
            return tagName.toLowerCase().startsWith('gộp ') || tagName.startsWith('Gộp ') || tagName.startsWith('GỘP ');
        });
        if (mergeTag) {
            const numbers = mergeTag.Name.match(/\d+/g);
            if (numbers && numbers.length > 0) {
                mergeTagNumbers = numbers;
            }
        }

        // Order comment - get from form or data (pre-filled by fast sale modal)
        const orderComment = (isModalVisible && document.getElementById('saleReceiverNote')?.value) ||
            orderResult?.Comment ||
            order?.Comment ||
            '';

        // Shop-wide delivery note (hotline warning + return policy)
        // This comes from shop settings or default
        const shopDeliveryNote = defaultData?.DeliveryNote ||
            orderResult?.DeliveryNote ||
            'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ\n\nSản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận hàng, "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI" quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào.';

        // Shop-wide comment (bank account info)
        // This comes from shop settings or default
        const shopComment = defaultData?.Comment ||
            'STK ngân hàng Lại Thụy Yến Nhi\n75918 (ACB)';

        // Carrier info
        const carrierSelect = isModalVisible ? document.getElementById('saleDeliveryPartner') : null;
        const carrierFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
        const isValidDropdownCarrier = carrierFromDropdown && !carrierFromDropdown.includes('Đang tải');
        const carrierName = orderResult?.CarrierName ||
            orderResult?.Carrier?.Name ||
            (isValidDropdownCarrier ? carrierFromDropdown : '') ||
            '';

        // Seller name
        const sellerName = window.authManager?.currentUser?.displayName ||
            defaultData.User?.Name ||
            orderResult?.User?.Name ||
            orderResult?.UserName ||
            '';

        // STT (Session Index) - prioritize merge tag numbers
        let sttDisplay = '';
        if (mergeTagNumbers.length > 1) {
            // If has merge tag "Gộp 745 923", show "745 + 923"
            sttDisplay = mergeTagNumbers.join(' + ');
        } else if (order?.IsMerged && order?.OriginalOrders?.length > 1) {
            // Fallback to merged orders STTs
            const allSTTs = order.OriginalOrders
                .map(o => o.SessionIndex)
                .filter(stt => stt)
                .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
            sttDisplay = allSTTs.join(' + ');
        } else {
            sttDisplay = order?.SessionIndex || orderResult?.SessionIndex || '';
        }

        // Bill number and date (data should already be complete from InvoiceStatusStore)
        const billNumber = orderResult?.Number || '';

        // Use DateInvoice or timestamp from stored data if available, otherwise use current time
        const billDate = orderResult?.DateInvoice
            ? new Date(orderResult.DateInvoice)
            : (orderResult?.timestamp ? new Date(orderResult.timestamp) : new Date());
        const dateStr = `${String(billDate.getDate()).padStart(2, '0')}/${String(billDate.getMonth() + 1).padStart(2, '0')}/${billDate.getFullYear()} ${String(billDate.getHours()).padStart(2, '0')}:${String(billDate.getMinutes()).padStart(2, '0')}`;

        // Barcode URL (TPOS CDN - exact format from TPOS)
        const barcodeUrl = billNumber ?
            `https://statics.tpos.vn/Web/Barcode?type=Code 128&value=${encodeURIComponent(billNumber)}&width=600&height=100` : '';

        // ========== GENERATE PRODUCT ROWS ==========
        const orderLines = order?.orderLines || orderResult?.OrderLines || orderResult?.orderLines || [];

        // Debug log key variables (AFTER orderLines is defined)
        const walletSource = options.walletBalance ? 'options' :
            (isModalVisible && document.getElementById('salePrepaidAmount')?.value) ? 'form' : 'orderResult';
        console.log('[BILL-SERVICE] Bill variables:', {
            shopName, carrierName, billNumber, sellerName, sttDisplay,
            shippingFee, discount, walletBalance, walletSource,
            orderLinesCount: orderLines.length
        });
        let totalQuantity = 0;
        let totalAmount = 0;

        const productsHTML = orderLines.map((item) => {
            const quantity = item.Quantity || item.ProductUOMQty || 1;
            const price = item.PriceUnit || item.Price || 0;
            const total = quantity * price;
            const productName = item.ProductName || item.ProductNameGet || '';
            const uomName = item.ProductUOMName || 'Cái';
            const note = item.Note || '';

            totalQuantity += quantity;
            totalAmount += total;

            // EXACT TPOS format: product name row + quantity/price row
            return `                        <tr>
                            <td class="PaddingProduct word-break" colspan="3" style="border-bottom:none">
                                    <label>
                                        ${productName}${note ? ` <span style="font-weight:bold">(${note})</span>` : ''}

                                                                            </label>


                            </td>
                        </tr>
                        <tr class="">
                            <td class="text-center numberPadding">
                                ${quantity}
${uomName}                            </td>
                            <td class="text-right numberPadding">
                                ${price.toLocaleString('vi-VN')}
                            </td>
                            <td class="text-right numberPadding">
                                ${total.toLocaleString('vi-VN')}
                            </td>
                        </tr>`;
        }).join('\n');

        // ========== CALCULATE TOTALS ==========
        // Offline calculation - same logic as TPOS
        const safeShippingFee = Number(shippingFee) || 0;
        const safeDiscount = Number(discount) || 0;
        const safeTotalAmount = Number(totalAmount) || 0;
        const safeWalletBalance = Number(walletBalance) || 0;

        // finalTotal = tổng sản phẩm - giảm giá + ship
        const finalTotal = safeTotalAmount - safeDiscount + safeShippingFee;

        // Trả trước = min(số dư ví, tổng tiền) - giống TPOS
        const safePrepaidAmount = Math.min(safeWalletBalance, finalTotal);

        // Còn lại = tổng tiền - trả trước
        const codAmount = Math.max(0, finalTotal - safePrepaidAmount);

        console.log('[BILL-SERVICE] Calculation:', {
            totalAmount: safeTotalAmount,
            discount: safeDiscount,
            shippingFee: safeShippingFee,
            finalTotal,
            walletBalance: safeWalletBalance,
            prepaidAmount: safePrepaidAmount,
            codAmount
        });

        // ========== EXACT TPOS HTML TEMPLATE ==========
        // CSS and structure copied directly from TPOS API response (html_bill.txt)
        return `

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phiếu bán hàng - TPOS.VN</title>
    <style>
        @page {
            margin: 1mm  0;
        }
        html, body {
            width: 80mm;
            margin: auto;
            color: #000 !important;
            font-size:  13px;
            font-family: Arial, Helvetica, sans-serif;
            line-height:1.2
        }
        /*---*/
        html {
            font-family: Arial, Helvetica, sans-serif;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .word-break {
            word-break: break-word;
        }

        *, *:before, *:after {
            -webkit-box-sizing: border-box;
            -moz-box-sizing: border-box;
            box-sizing: border-box;
        }

        .container {
            padding-right: 10px;
            padding-left: 10px;
            margin-right: auto;
            margin-left: auto;
        }

        .row {
            margin: 0 !important;
        }

        .form-horizontal .form-group {
            margin-right: -15px;
            margin-left: -15px;
        }

            .form-horizontal .form-group:before, .form-horizontal .form-group:after {
                display: table;
                content: " ";
            }

        .text-center {
            text-align: center;
        }

        .text-left {
            text-align: left;
        }

        .text-right {
            text-align: right;
        }

        .text-muted {
            color: black;
        }

        .hidden {
            display: none !important;
            visibility: hidden !important;
        }
        label {
            display: inline-block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        code {
            padding: 2px 4px;
            font-size: 90%;
            color: black;
            font-weight: 500;
            border-radius: 4px;
        }

        h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6 {
            font-family: "Helvetica Neue",Helvetica,Arial,sans-serif;
            font-weight: 500;
            line-height: 1.1;
        }

        h3 {
            display: block;
            font-size: 1.17em;
            margin-block-start: 1em;
            margin-block-end: 1em;
            margin-inline-start: 0px;
            margin-inline-end: 0px;
            font-weight: bold;
        }

        table {
            max-width: 100%;
            background-color: transparent;
        }

        table {
            border-collapse: collapse;
            border-spacing: 0;
        }

        .table {
            width: 100%;
            margin-bottom: 10px;
        }
        .img-responsive {
            display: block;
            height: auto;
            max-width: 100%;
        }

        img {
            vertical-align: middle;
        }

        img {
            border: 0;
        }

        .image_header img {
            margin-left: auto;
            margin-right: auto;
            width: 100%;
        }
        /*---*/
        .size-18 {
            font-size: 18px;
        }

        .size-20 {
            font-size: 20px;
        }
        .size-16 {
            font-size: 16px;
        }
        .size-12 {
            font-size: 12px;
        }
        .size-13 {
            font-size: 13px;
        }
        .size-18pt {
            font-size: 18pt;
        }
        .size-15pt {
            font-size: 15pt;
        }
        .size-14pt {
            font-size: 14pt;
        }
        .size-11pt {
            font-size: 11pt;
        }
        .size-trackingRef {
            font-size: 1.2em;
        }

        .inline-cs > div {
            display: inline-block !important;
            vertical-align: middle !important;
        }

        .table-custom > thead > tr > th {
            vertical-align: middle !important;
            text-align: center;
        }

        .table-custom > tbody > tr > td {
            vertical-align: middle !important;
        }

        .table.print-header, .table.print-header td, .table.print-header th {
            border: none !important;
            padding: 0 !important;
        }

            .table.print-header th {
                font-weight: 500;
            }

            .table.print-header h1 {
                font-size: 28px;
            }

        h3 {
            font-size: 15px !important;
        }

        .table .table-heading {
            text-transform: uppercase;
        }

        .dataBody {
            margin-top: 0;
        }

        .price_text {
            display: inline-block;
        }

            .price_text:first-letter {
                text-transform: uppercase;
            }

        .table tbody > tr > td.numberPadding {
            padding-top: 0px;
            padding-bottom: 2px;
            border-top: none !important;
        }

        .table tbody > tr > td.PaddingProduct {
            padding-top: 2px;
            padding-bottom: 2px;
            border-bottom: none !important;
        }

        .table tbody > tr > td {
            padding: 1px;
        }

        .table tfoot > tr > td {
            padding: 1px;
        }

        .table thead > tr > th {
            padding: 1px;
        }

        .table thead > tr > th {
            border-top: 2px solid #ddd !important
        }

        .table tfoot > tr > td {
            font-weight: bold !important;
        }

        .oe_page {
            page-break-after: always;
        }

        .form-control-static {
            padding-top: 0;
            padding-bottom: 0;
            margin:0;
        }

        .pre-wrap {
            white-space: pre-wrap !important;
        }

        .footer-cs {
            margin-bottom: 0 !important;
        }

        .column20 {
            float: left;
            width: 20%;
        }

        .column80 {
            float: left;
            width: 80%;
            padding-left: 10px;
        }

        /*.image_header {
            margin-top: -15px;
        }*/

        .image_header img {
            width: 100%;
        }
        /* Clear floats after the columns */
        .row {
            margin: 0 !important;
        }

            .row:after {
                content: "";
                display: table;
                clear: both;
            }

        table tbody.border-none > tr > td {
            border: none;
        }

        .border-top {
            border-top: 1px solid black !important;
        }

        .border-bottom {
            border-bottom: 1px solid black !important;
        }
        /*.table-cs >th > tr {
            border-top: 1px solid black !important;
            border-bottom: 1px solid black !important;
        }*/
        .table-cs > tbody > tr > td, .table-cs > thead > tr > th {
            border-top: 1px solid gray !important;
            border-bottom: 1px solid gray !important;
        }

        .table-cs > tfoot > tr > td {
            border: none !important
        }

        .logo-center img {
            margin-left: auto;
            margin-right: auto;
            max-width: 180px !important;
            max-height: 180px !important;
        }

        hr.dash-cs {
            margin-top: 5px;
            margin-bottom: 5px;
            border-top: 1px dashed black;
        }

        .bottom_0 {
            margin-bottom: 0;
        }

        .bottom-size {
            font-size: 16pt !important;
        }

        .ship-font {
            font-size:  14px;
        }

        .font-ship-bexinh {
            font-size: 14px;
        }
        /*.pos .pos-receipt-container {
            text-align: center;
        }*/
        /*.receipt-total, receipt-paymentlines, receipt-change {
            width: 100%
        }*/
        table {
            width: 100%;
        }

        .pos .pos-sale-ticket {
            text-align: left;
            background-color: white;
            font-size: 13px;
            /*display: inline-block;*/
            /*font-family: "Inconsolata";*/
            /*border: solid 1px rgb(220, 220, 220);*/
            border-radius: 3px;
            overflow: hidden;
        }

        .pos .pos-center-align {
            text-align: center;
        }

        .pos .pos-right-align {
            text-align: right;
        }

        .pos .pos-sale-ticket h3 {
            margin-top: 10px;
            margin-bottom: 5px;
            font-size: 20px;
        }

        .pos .pos-sale-ticket p {
            margin-bottom: 5px;
        }

        table.receipt-orderlines > tbody > tr.border-top {
            border-top: 1px solid #ccc !important;
        }

        table.receipt-orderlines > tbody > tr.border-bottom {
            border-bottom: 1px solid #ccc !important;
        }

        .pos .pos-sale-ticket table {
            width: 100%;
            border: 0;
            table-layout: auto;
        }
            .pos .pos-sale-ticket table tr th,
            .pos .pos-sale-ticket table tr td {
                padding-right: 2px;
            }

            .pos .pos-sale-ticket table td {
                border: 0;
                word-wrap: break-word;
            }

            .pos .pos-sale-ticket table.receipt-orderlines tr td.product-name {
                /*border-top: 1px dashed #333;*/
            }

        .pos .pos-disc-font {
            font-size: 12px;
            font-style: italic;
            color: #808080;
        }

        .pos .pos-sale-ticket .emph {
            font-size: 14px;
            margin: 5px;
        }

        .pos .pos-sale-ticket hr {
            margin-top: 5px;
            margin-bottom: 5px;
            border: 0;
            border-top: 1px dashed #333;
        }

        .text-uppercase {
            text-transform: uppercase;
        }

        .content-thuchi {
            margin-top: 15px;
        }

            .content-thuchi div {
                margin-bottom: 10px;
            }
        .ship-group .form-group{
        margin-bottom: 5px
        }

         .flex-ship {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 50mm;

            margin-left: 0;
            margin-right: 0;
            font-size:12px;
        }

         .flex-ship-80 {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 78mm;

            margin-left: 0;
            margin-right: 0;
            font-size: 11px !important;
            border: 1px solid;
        }
         .flex-ship-80x35 {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 34mm;

            margin-left: 0;
            margin-right: 0;
            font-size: 11px !important;
        }
        .ship-top {
            flex: 1;
        }

        .ship-mid {
            flex: 1;
            text-align: center;
            align-items: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .ship-bottom {
            font-size:  12px;
            flex: 1;
            display: flex;
            align-items: flex-end;
        }
       .ship-bottom .form-group, .ship-top .form-group  {
        margin-bottom: 0 !important;
        }

        .border-bottom{
        border-bottom: 1px solid;
        }
        .container {
            padding-right: 10px;
            padding-left: 10px;
            margin-right: auto;
            margin-left: auto;
        }
      .col-xs-1, .col-xs-2, .col-xs-3, .col-xs-4, .col-xs-5, .col-xs-6, .col-xs-7, .col-xs-8, .col-xs-9, .col-xs-10, .col-xs-11, .col-xs-12, .col-sm-1, .col-sm-2, .col-sm-3, .col-sm-4, .col-sm-5, .col-sm-6, .col-sm-7, .col-sm-8, .col-sm-9, .col-sm-10, .col-sm-11, .col-sm-12, .col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12, .col-lg-1, .col-lg-2, .col-lg-3, .col-lg-4, .col-lg-5, .col-lg-6, .col-lg-7, .col-lg-8, .col-lg-9, .col-lg-10, .col-lg-11, .col-lg-12 {
    position: relative;
    min-height: 1px;
    padding-right: 5px;
    padding-left: 5px;
        }
        .font-bold {
            font-weight: bold;
        }
    .text-clamp {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2; /* number of lines to show */
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    strong {
        font-weight: bold !important;
    }

        .page-break {
            display: block;
            height: 0;
            page-break-before: always;
        }
    </style>
</head>
<body>
    <div class="container body-content">



    <div class="hidden">0</div>
    <div>
        <div class='row'>
                    <div class='text-center'>
                        <span style='font-size:16px; font-weight:bold'>${shopName}</span>
                    </div>
                    <div class='text-center'>
                        <strong><span style='white-space:pre-wrap; word-break:break-word'></span></strong>
                    </div>
                    </div>
        <table class="table print-header table-bordered">
            <thead>
                <tr>
                    <th class="text-center">
                                                                                                <div class='text-center'>
${carrierName ? `<span>${carrierName}</span><br/>` : ''}
${hasVirtualDebt ? `<span style="font-weight:bold; color:#c00;">** CÓ ĐƠN THU VỀ **</span><br/>` : ''}
<p class='size-16 font-bold'>Tiền thu hộ: ${codAmount.toLocaleString('vi-VN')}</p>
</div>
                        <hr class="b-b dash-cs" />
                    </th>

                </tr>
                <tr>
                    <th class="text-center">
                        <h3 style="text-transform:uppercase">Phiếu bán hàng</h3>

                    </th>
                </tr>
                <tr>
                    <th>
                        <div class='text-center'>
                    ${barcodeUrl ? `<div>
                        <img src='${barcodeUrl}' style='width:95%' onerror="this.style.display='none'" />
                    </div>` : ''}
                <strong>Số phiếu</strong>: ${billNumber}
                <div>
                    <strong>Ngày</strong>: ${dateStr}
                </div>
                <hr class='b-b dash-cs' />
                </div>
                    </th>
                </tr>
                <tr>
                    <th class="text-left">
                            <div>
                                <strong>Khách hàng:</strong> ${receiverName}
                            </div>
                                                                            ${receiverAddress ? `<div>
                                <strong>Địa chỉ:</strong> ${receiverAddress}
                            </div>` : ''}
                                                                            <div style="float:right">
                            </div>
                            <div>
                                <strong>Điện thoại:</strong> ${receiverPhone}
                            </div>
                                                    ${sellerName ? `<div>
                                <strong>Người bán:</strong> ${sellerName}
                            </div>` : ''}
${sttDisplay ? `                            <div>
                                <strong>STT:</strong> ${sttDisplay}
                            </div>` : ''}
                                                                                            </th>

                </tr>
            </thead>
        </table>

            <table class="table table-cs ">
                <thead>
                    <tr>
                        <th width="80">Sản phẩm</th>
                        <th class="text-right" width="80">Giá</th>
                        <th class="text-right" width="80">Tổng</th>
                    </tr>
                </thead>
                <tbody>
${productsHTML}
                </tbody>
                <tfoot style="display: table-row-group !important;" class="word-break">
                    <tr>
                        <td colspan="1">
                            <strong>Tổng:</strong>
                        </td>
                         <td>
                            <strong>SL: ${totalQuantity}</strong>
                        </td>
                        <td class="text-right"><strong>${totalAmount.toLocaleString('vi-VN')}</strong> </td>
                    </tr>
                                    ${discount > 0 ? `
                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Giảm giá :</strong>
                            </td>
                             <td style="border-left:none !important" class="text-right">${safeDiscount.toLocaleString('vi-VN')}</td>
                        </tr>` : ''}


                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Tiền ship :</strong>
                            </td>
                             <td style="border-left:none !important" class="text-right">${safeShippingFee.toLocaleString('vi-VN')}</td>
                        </tr>



                        <tr>
                            <td colspan="2" class="text-right">
                                <strong>Tổng tiền :</strong>
                            </td>
                            <td class="text-right">${finalTotal.toLocaleString('vi-VN')}</td>
                        </tr>
${safePrepaidAmount > 0 ? `
                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Trả trước :</strong>
                            </td>
                            <td style="border-left:none !important" class="text-right">${safePrepaidAmount.toLocaleString('vi-VN')}</td>
                        </tr>
                        <tr>
                            <td colspan="2" class="text-right">
                                <strong>Còn lại :</strong>
                            </td>
                            <td class="text-right">${codAmount.toLocaleString('vi-VN')}</td>
                        </tr>
` : ''}
                                    </tfoot>
            </table>
${orderComment ? `
            <div style="word-wrap:break-word">
                <strong>Ghi chú :</strong> ${orderComment}
            </div>
` : ''}
            <div style="word-wrap:break-word">
                <strong>Ghi chú giao hàng :</strong> <span style="white-space:pre-wrap; word-break: break-word;">${shopDeliveryNote}</span>
            </div>
            <div style="word-wrap:break-word">
                <strong>Ghi chú:</strong>
                <p class="form-control-static">
                    ${shopComment.replace(/\n/g, '<br />')}
                </p>
            </div>
        </div>
    </div>
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

        // Use pre-generated HTML if provided (e.g., TPOS bill), otherwise fall back to custom bill
        const html = options.billHtml || generateCustomBillHTML(orderResult, options);

        // Create hidden iframe to render full HTML document with styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 400px;
            height: auto;
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

            // Get actual content height (add small padding)
            const contentHeight = iframeBody.scrollHeight + 20;
            console.log('[BILL-SERVICE] Content height:', contentHeight);

            // Check if html2canvas is available
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            // Generate image using html2canvas with dynamic height
            const canvas = await html2canvas(iframeBody, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: 400,
                windowHeight: contentHeight,
                height: contentHeight
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
                // Generate bill image using custom template (no TPOS API request)
                console.log('[BILL-SERVICE] Step 1: Generating bill image using custom template...');
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

            // Get conversation ID - same logic as chat modal (openChatModal)
            // Uses fetchConversationsByCustomerFbId to ensure we get real conversation data
            let convId = null;

            if (window.pancakeDataManager) {
                console.log('[BILL-SERVICE] Fetching conversation by customer fb_id:', psid, 'pageId:', pageId);
                try {
                    // Same method as chat modal uses in tab1-chat.js line 1888
                    const result = await window.pancakeDataManager.fetchConversationsByCustomerFbId(pageId, psid);

                    if (result.success && result.conversations?.length > 0) {
                        // Filter INBOX conversations (same as chat modal)
                        const inboxConversations = result.conversations.filter(conv => conv.type === 'INBOX');

                        if (inboxConversations.length > 0) {
                            convId = inboxConversations[0].id;
                            console.log('[BILL-SERVICE] ✅ Got INBOX conversation ID:', convId);
                        } else {
                            // Fallback to first conversation if no INBOX found
                            convId = result.conversations[0].id;
                            console.log('[BILL-SERVICE] ✅ Got conversation ID (fallback):', convId);
                        }
                    } else {
                        console.warn('[BILL-SERVICE] No conversations found for customer');
                    }
                } catch (fetchError) {
                    console.error('[BILL-SERVICE] Error fetching conversation:', fetchError.message);
                }
            }

            // No fallback - must have real conversation ID from Pancake
            if (!convId) {
                console.warn('[BILL-SERVICE] No conversation ID found for PSID:', psid);
                return {
                    success: false,
                    error: 'Không tìm thấy conversation. Khách hàng chưa có tin nhắn với page này.'
                };
            }

            // Send via Internal API (pancake.vn) with FormData - same as chat modal for images
            // Ref: tab1-chat.js line 4148-4176
            const accessToken = await window.pancakeDataManager?.getToken();
            if (!accessToken) {
                throw new Error('No Pancake access_token available. Vui lòng đăng nhập Pancake.');
            }

            // Build URL using Internal API (pancake.vn)
            const sendUrl = window.API_CONFIG?.buildUrl?.pancake
                ? window.API_CONFIG.buildUrl.pancake(
                    `pages/${pageId}/conversations/${convId}/messages`,
                    `access_token=${accessToken}`
                )
                : `https://pancake.vn/api/v1/pages/${pageId}/conversations/${convId}/messages?access_token=${accessToken}`;

            // Build FormData - same format as chat modal
            // Note: Only send image, no text message (user preference)
            const formData = new FormData();
            formData.append('action', 'reply_inbox');
            formData.append('message', '');  // Empty message - send image only
            formData.append('content_id', contentId || '');
            formData.append('content_url', contentUrl || '');
            formData.append('send_by_platform', 'web');

            console.log('[BILL-SERVICE] Sending via Internal API (pancake.vn)');
            console.log('[BILL-SERVICE] URL:', sendUrl.replace(/access_token=[^&]+/, 'access_token=***'));
            console.log('[BILL-SERVICE] content_id:', contentId);

            // Fire additional messages in parallel (fire and forget - don't wait)
            sendAdditionalBillMessages(pageId, convId, accessToken);

            const sendResponse = await fetch(sendUrl, {
                method: 'POST',
                body: formData
                // Don't set Content-Type header - browser will set it with boundary
            });

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

                    // Send image only via Facebook API fallback (no text message)
                    const fbFallbackResult = await sendViaFacebookAPI(
                        pageId,
                        psid,
                        null,  // No text message, send image only
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

            // Build request body - only include message if provided (for image-only sends)
            const requestBody = {
                pageId: pageId,
                psid: psid,
                pageToken: facebookPageToken,
                useTag: true, // Use POST_PURCHASE_UPDATE tag to bypass 24h policy
                imageUrls: imageUrl ? [imageUrl] : [] // Include image URL if provided
            };
            // Only add message field if provided (for image-only sends, message is null)
            if (message) {
                requestBody.message = message;
            }

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

    /**
     * Send additional messages after bill send (image + thank you message)
     * Fires in parallel with bill send - fire and forget
     * @param {string} pageId - Facebook Page ID
     * @param {string} convId - Conversation ID
     * @param {string} accessToken - Pancake access token
     */
    function sendAdditionalBillMessages(pageId, convId, accessToken) {
        console.log('[BILL-SERVICE] [ADDITIONAL] Sending additional messages...');

        // Use Cloudflare proxy (same as main bill send)
        const baseUrl = window.API_CONFIG?.buildUrl?.pancake
            ? window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/conversations/${convId}/messages`,
                `access_token=${accessToken}`
            )
            : `https://pancake.vn/api/v1/pages/${pageId}/conversations/${convId}/messages?access_token=${accessToken}`;

        // Message 1: Send image from Pancake CDN (uploaded 2026-01-29)
        const formData1 = new FormData();
        formData1.append('action', 'reply_inbox');
        formData1.append('message', '');
        formData1.append('content_id', '4d0b73b0-8d3f-4dfa-bb9b-11a82096734d');
        formData1.append('content_url', 'https://content.pancake.vn/2-2601/2026/1/29/402e8fd15439d66430ab886e2c122ef15a918cc0.jpg');
        formData1.append('width', '1920');
        formData1.append('height', '1008');
        formData1.append('send_by_platform', 'web');

        // Message 2: Send thank you text
        const formData2 = new FormData();
        formData2.append('action', 'reply_inbox');
        formData2.append('message', 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️');
        formData2.append('send_by_platform', 'web');

        // Fire both requests without waiting (fire and forget)
        fetch(baseUrl, { method: 'POST', body: formData1 })
            .then(response => {
                if (!response.ok) {
                    console.warn('[BILL-SERVICE] [ADDITIONAL] Image message HTTP error:', response.status);
                    return { success: false, httpError: response.status };
                }
                return response.json();
            })
            .then(result => {
                const success = result.success !== false && !result.httpError;
                console.log('[BILL-SERVICE] [ADDITIONAL] Image message:', success ? '✅' : '❌', result);
            })
            .catch(error => {
                console.warn('[BILL-SERVICE] [ADDITIONAL] Image message error:', error.message);
            });

        fetch(baseUrl, { method: 'POST', body: formData2 })
            .then(response => {
                if (!response.ok) {
                    console.warn('[BILL-SERVICE] [ADDITIONAL] Thank you message HTTP error:', response.status);
                    return { success: false, httpError: response.status };
                }
                return response.json();
            })
            .then(result => {
                const success = result.success !== false && !result.httpError;
                console.log('[BILL-SERVICE] [ADDITIONAL] Thank you message:', success ? '✅' : '❌', result);
            })
            .catch(error => {
                console.warn('[BILL-SERVICE] [ADDITIONAL] Thank you message error:', error.message);
            });
    }

    // ========== TPOS BILL FUNCTIONS ==========

    /**
     * Fetch TPOS bill HTML and add STT
     * @param {number} orderId - FastSaleOrder ID from TPOS
     * @param {object} headers - Auth headers for TPOS API
     * @param {object} orderData - Original order data (for getting STT)
     * @returns {Promise<string|null>} Modified HTML with STT, or null if failed
     */
    async function fetchTPOSBillHTML(orderId, headers, orderData) {
        try {
            console.log('[BILL-SERVICE] Fetching TPOS bill HTML for order:', orderId);

            const printUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/print1?ids=${orderId}`;
            const response = await API_CONFIG.smartFetch(printUrl, {
                method: 'GET',
                headers: {
                    ...headers,
                    'accept': 'application/json, text/javascript, */*; q=0.01'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.html) {
                throw new Error('No HTML returned from TPOS API');
            }

            console.log('[BILL-SERVICE] TPOS bill HTML fetched successfully');

            // Get STT from order data
            let sttDisplay = '';
            if (orderData?.IsMerged && orderData?.OriginalOrders?.length > 1) {
                const allSTTs = orderData.OriginalOrders
                    .map(o => o.SessionIndex)
                    .filter(stt => stt)
                    .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
                sttDisplay = allSTTs.join(', ');
            } else {
                sttDisplay = orderData?.SessionIndex || '';
            }
            console.log('[BILL-SERVICE] STT display value:', sttDisplay);

            // Modify HTML to add STT below "Người bán" if STT exists
            let modifiedHtml = result.html;
            if (sttDisplay) {
                // HTML may have "á" as either literal or HTML entity (&#225;)
                const nguoiBanRegex = /(<div[^>]*>\s*<strong>Người\s+b(?:á|&#225;|&aacute;)n:<\/strong>[^<]*<\/div>)/i;

                if (nguoiBanRegex.test(modifiedHtml)) {
                    modifiedHtml = modifiedHtml.replace(
                        nguoiBanRegex,
                        `$1\n                            <div><strong>STT:</strong> ${sttDisplay}</div>`
                    );
                    console.log('[BILL-SERVICE] Added STT to TPOS bill:', sttDisplay);
                }
            }

            // Add "CÓ ĐƠN THU VỀ" when order uses virtual debt from return ticket
            if (orderData?.hasVirtualDebt) {
                const codRegex = /(<p[^>]*class=['"]size-16 font-bold['"][^>]*>Ti(?:ề|&#7873;)n thu h(?:ộ|&#7897;))/i;
                if (codRegex.test(modifiedHtml)) {
                    modifiedHtml = modifiedHtml.replace(
                        codRegex,
                        `<span style="font-weight:bold">** CÓ ĐƠN THU VỀ **</span><br/>\n$1`
                    );
                    console.log('[BILL-SERVICE] Added "CÓ ĐƠN THU VỀ" to TPOS bill');
                }
            }

            return modifiedHtml;

        } catch (error) {
            console.error('[BILL-SERVICE] Error fetching TPOS bill:', error);
            return null;
        }
    }

    /**
     * Open print popup with raw HTML content (for TPOS bills)
     * @param {string} html - HTML content to print
     */
    function openPrintPopupWithHtml(html) {
        console.log('[BILL-SERVICE] Opening print popup with TPOS HTML...');

        const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            window.notificationManager?.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            return;
        }

        // Write the HTML content
        printWindow.document.write(html);
        printWindow.document.close();

        // Use flag to prevent double print
        let printed = false;
        const triggerPrint = () => {
            if (printed || !printWindow || printWindow.closed) return;
            printed = true;
            printWindow.focus();
            printWindow.print();
        };

        // Wait for content to load, then trigger print
        printWindow.onload = function() {
            setTimeout(triggerPrint, 500);
        };

        // Fallback if onload doesn't fire
        setTimeout(triggerPrint, 1500);
    }

    /**
     * Open combined print popup with TPOS bills for multiple orders
     * @param {Array<{orderId: number, orderData: object}>} orders - Array of order info
     * @param {object} headers - Auth headers for TPOS API
     */
    async function openCombinedTPOSPrintPopup(orders, headers) {
        console.log('[BILL-SERVICE] Opening combined TPOS print popup for', orders.length, 'orders...');
        console.log('[BILL-SERVICE] Orders data:', orders.map(o => ({ orderId: o.orderId, hasOrderData: !!o.orderData })));

        if (!orders || orders.length === 0) {
            console.warn('[BILL-SERVICE] No orders to print');
            return;
        }

        // Fetch all TPOS bills in parallel
        console.log('[BILL-SERVICE] Fetching TPOS bills...');
        const billPromises = orders.map(({ orderId, orderData }) => {
            console.log('[BILL-SERVICE] Fetching bill for orderId:', orderId);
            return fetchTPOSBillHTML(orderId, headers, orderData);
        });

        const bills = await Promise.all(billPromises);
        console.log('[BILL-SERVICE] Fetched bills count:', bills.length, 'Valid:', bills.filter(h => h !== null).length);
        const validBills = bills.filter(html => html !== null);

        if (validBills.length === 0) {
            console.error('[BILL-SERVICE] No valid TPOS bills fetched - all returned null');
            window.notificationManager?.error('Không thể tải bill từ TPOS. Kiểm tra Console để biết chi tiết.');
            return;
        }

        // Extract body content from each bill and combine
        const billBodies = validBills.map((html, index) => {
            // Extract content between <body> and </body>
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const bodyContent = bodyMatch ? bodyMatch[1] : html;

            // Add page break after each bill except the last one
            const pageBreak = index < validBills.length - 1
                ? '<div style="page-break-after: always; border-top: 2px dashed #999; margin: 20px 0;"></div>'
                : '';

            return `<div class="bill-container">${bodyContent}</div>${pageBreak}`;
        });

        // Extract styles from first bill
        const styleMatch = validBills[0].match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const styles = styleMatch ? styleMatch[1] : '';

        // Combine all bills
        const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>In ${validBills.length} phiếu bán hàng</title>
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
</body>
</html>`;

        openPrintPopupWithHtml(combinedHtml);
    }

    /**
     * Fetch and print TPOS bill for a single order
     * @param {number} orderId - FastSaleOrder ID
     * @param {object} headers - Auth headers
     * @param {object} orderData - Order data with SessionIndex
     */
    async function fetchAndPrintTPOSBill(orderId, headers, orderData) {
        const html = await fetchTPOSBillHTML(orderId, headers, orderData);
        if (html) {
            openPrintPopupWithHtml(html);
        } else {
            // Fallback to custom bill
            console.log('[BILL-SERVICE] Falling back to custom bill...');
            openPrintPopup({ Id: orderId }, { currentSaleOrderData: orderData });
        }
    }

    // Public API
    return {
        generateCustomBillHTML,
        openPrintPopup,
        openCombinedPrintPopup,
        generateBillImage,
        sendBillToCustomer,
        // TPOS bill functions
        fetchTPOSBillHTML,
        openPrintPopupWithHtml,
        openCombinedTPOSPrintPopup,
        fetchAndPrintTPOSBill
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
// TPOS bill functions
window.fetchTPOSBillHTML = BillService.fetchTPOSBillHTML;
window.openPrintPopupWithHtml = BillService.openPrintPopupWithHtml;
window.openCombinedTPOSPrintPopup = BillService.openCombinedTPOSPrintPopup;
window.fetchAndPrintTPOSBill = BillService.fetchAndPrintTPOSBill;

console.log('[BILL-SERVICE] Bill Service loaded successfully');
