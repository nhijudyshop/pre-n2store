/**
 * TPOS Purchase Order Creator
 * Flow: Excel → PurchaseByExcel API (get OrderLines) → FastPurchaseOrder API (create PO)
 * Uses TPOSClient.authenticatedFetch() for token management
 */

window.TPOSPurchase = (function() {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // =====================================================
    // STATIC CONFIG - per company (from real TPOS payloads)
    // =====================================================

    function getCompanyId() {
        return window.ShopConfig?.getConfig()?.CompanyId || 1;
    }

    const STATIC = {
        UserId: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',

        // Per-company config (extracted from real TPOS payloads)
        Config: {
            1: {
                JournalId: 4, AccountId: 4, PickingTypeId: 1, PaymentJournalId: 1,
                Company: {
                    Id: 1, Name: 'NJD Live',
                    Sender: 'Tổng đài:19003357', Phone: '19003357',
                    Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                    CurrencyId: 1, Active: true, AllowSaleNegative: true,
                    Customer: false, Supplier: false,
                    DepositAccountId: 11, DeliveryCarrierId: 7,
                    City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                    District: { name: 'Quận 12', code: '761', cityCode: '79' },
                    Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' }
                },
                User: { Id: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc', Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt', CompanyId: 1, CompanyName: 'NJD Live', Active: true },
                Journal: { Id: 4, Name: 'Nhật ký mua hàng', Type: 'purchase', TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false },
                PaymentJournal: { Id: 1, Name: 'Tiền mặt', Type: 'cash', TypeGet: 'Tiền mặt', UpdatePosted: true },
                PickingType: { Id: 1, Code: 'incoming', Name: 'Nhận hàng', Active: true, WarehouseId: 1, UseCreateLots: true, UseExistingLots: true, NameGet: 'Nhi Judy Store: Nhận hàng' },
                Account: { Id: 4, Name: 'Phải trả người bán', Code: '331', Active: true, NameGet: '331 Phải trả người bán', Reconcile: false }
            },
            2: {
                JournalId: 11, AccountId: 32, PickingTypeId: 5, PaymentJournalId: 8,
                Company: {
                    Id: 2, Name: 'NJD Shop',
                    Sender: 'Tổng đài:19003357', Phone: '19003357',
                    Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                    CurrencyId: 1, Active: true, AllowSaleNegative: true,
                    Customer: false, Supplier: false,
                    DepositAccountId: 11, DeliveryCarrierId: 7,
                    City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                    District: { name: 'Quận 12', code: '761', cityCode: '79' },
                    Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' }
                },
                User: { Id: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc', Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt', CompanyId: 2, CompanyName: 'NJD Shop', Active: true },
                Journal: { Id: 11, Name: 'Nhật ký mua hàng', Type: 'purchase', TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false },
                PaymentJournal: { Id: 8, Name: 'Tiền mặt', Type: 'cash', TypeGet: 'Tiền mặt', UpdatePosted: true },
                PickingType: { Id: 5, Code: 'incoming', Name: 'Nhận hàng', Active: true, WarehouseId: 2, UseCreateLots: true, UseExistingLots: true, NameGet: 'Shop NJD: Nhận hàng' },
                Account: { Id: 32, Name: 'Phải trả người bán', Code: '331', Active: true, NameGet: '331 Phải trả người bán', Reconcile: false }
            }
        }
    };

    function getConfig() {
        return STATIC.Config[getCompanyId()] || STATIC.Config[1];
    }

    // Format date as Vietnam timezone (+07:00) matching TPOS payload format
    function toVNDateString(date) {
        const d = date || new Date();
        const offset = 7 * 60; // +07:00 in minutes
        const local = new Date(d.getTime() + offset * 60000);
        return local.toISOString().replace('Z', '') + '+07:00';
    }

    // =====================================================
    // STEP 1: PurchaseByExcel - Convert Excel → OrderLines
    // =====================================================

    async function purchaseByExcel(base64File, partnerId, dateOrder) {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        const url = `${PROXY_URL}/api/odata/FastPurchaseOrderLine/ODataService.PurchaseByExcel?$expand=OrderLines($expand=ProductUOM,Account,Product)`;

        const body = {
            file: base64File,
            paramModel: {
                PartnerId: partnerId,
                DateOrder: dateOrder
            }
        };

        console.log('[TPOSPurchase] PurchaseByExcel → PartnerId:', partnerId);

        const response = await window.TPOSClient.authenticatedFetch(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`PurchaseByExcel API error ${response.status}: ${text}`);
        }

        const data = await response.json();

        if (data.Errors && data.Errors.length > 0) {
            console.warn('[TPOSPurchase] PurchaseByExcel errors:', data.Errors);
        }

        const orderLines = data.OrderLines || [];
        console.log(`[TPOSPurchase] PurchaseByExcel returned ${orderLines.length} OrderLines`);

        return { orderLines, errors: data.Errors || [], isError: data.IsError };
    }

    // =====================================================
    // STEP 2: FastPurchaseOrder - Create PO on TPOS
    // =====================================================

    async function createPurchaseOrder(orderLines, partnerData, orderInfo) {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        const partnerId = partnerData.tposId || partnerData.Id || partnerData.id;
        if (!partnerId) throw new Error('Partner has no TPOS ID');

        // Get per-company config (Journal/Account/PickingType IDs)
        const companyConfig = getConfig();

        // Calculate totals from orderLines
        let amountTotal = 0;
        for (const line of orderLines) {
            amountTotal += (line.PriceUnit || 0) * (line.ProductQty || 0);
        }

        const decreaseAmount = orderInfo.decreaseAmount || orderInfo.discountAmount || 0;
        const costsIncurred = orderInfo.costsIncurred || orderInfo.shippingFee || 0;
        const tposNote = orderInfo.tposNote || orderInfo.notes || '';
        const finalAmount = amountTotal - decreaseAmount + costsIncurred;

        // Build Partner object from Firebase data (full TPOS response)
        const partner = {
            Id: partnerId,
            Name: partnerData.Name || partnerData.name,
            DisplayName: partnerData.DisplayName || `[${partnerData.Ref || ''}] ${partnerData.Name || partnerData.name}`,
            Ref: partnerData.Ref || partnerData.tposCode,
            Supplier: true,
            Customer: partnerData.Customer || false,
            Active: true,
            NameNoSign: partnerData.NameNoSign || null,
            Street: partnerData.Street || null,
            Phone: partnerData.Phone || null,
            Email: partnerData.Email || null,
            Type: partnerData.Type || 'contact',
            CompanyType: partnerData.CompanyType || 'person',
            Status: partnerData.Status || 'Normal',
            StatusText: partnerData.StatusText || 'Bình thường',
            Source: partnerData.Source || 'Default',
            DateCreated: partnerData.DateCreated || toVNDateString()
        };

        // Build payload
        const now = new Date();
        const payload = {
            Id: 0,
            Name: null,
            PartnerId: partnerId,
            PartnerDisplayName: null,
            State: 'draft',
            Date: null,
            PickingTypeId: companyConfig.PickingTypeId,
            AmountTotal: finalAmount,
            TotalQuantity: 0,
            Amount: null,
            Discount: 0,
            DiscountAmount: 0,
            DecreaseAmount: decreaseAmount,
            AmountTax: 0,
            AmountUntaxed: amountTotal,
            TaxId: null,
            Note: tposNote,
            CompanyId: getCompanyId(),
            JournalId: companyConfig.JournalId,
            DateInvoice: toVNDateString(now),
            Number: null,
            Type: 'invoice',
            Residual: null,
            RefundOrderId: null,
            Reconciled: null,
            AccountId: companyConfig.AccountId,
            UserId: STATIC.UserId,
            AmountTotalSigned: null,
            ResidualSigned: null,
            ShowState: 'Nháp',
            UserName: null,
            PartnerNameNoSign: null,
            PaymentJournalId: companyConfig.PaymentJournalId,
            PaymentAmount: 0,
            Origin: null,
            CompanyName: null,
            PartnerPhone: null,
            Address: null,
            DateCreated: toVNDateString(now),
            TaxView: null,
            CostsIncurred: costsIncurred,
            VatInvoiceNumber: null,
            ExchangeRate: null,
            DestConvertCurrencyUnitId: null,
            FormAction: 'SaveAndPrint',
            PaymentInfo: [],
            Error: null,

            // Nested objects (per company)
            Company: companyConfig.Company,
            PickingType: companyConfig.PickingType,
            Journal: companyConfig.Journal,
            User: companyConfig.User,
            PaymentJournal: companyConfig.PaymentJournal,
            DestConvertCurrencyUnit: null,
            Partner: partner,
            Account: companyConfig.Account,

            // OrderLines from PurchaseByExcel response
            OrderLines: orderLines.map(line => ({
                ProductUOM: line.ProductUOM,
                Name: line.Name,
                Account: line.Account,
                PriceUnit: line.PriceUnit,
                AccountId: line.Account?.Id || companyConfig.AccountId,
                PriceRecent: line.PriceRecent || line.PriceUnit,
                ProductQty: line.ProductQty,
                Product: line.Product,
                ProductId: line.ProductId,
                ProductUOMId: line.ProductUOMId || 1,
                Discount: line.Discount || 0,
                PriceSubTotal: (line.PriceUnit || 0) * (line.ProductQty || 0)
            }))
        };

        console.log('[TPOSPurchase] FastPurchaseOrder → PartnerId:', partnerId, 'Lines:', orderLines.length, 'Total:', finalAmount);

        const url = `${PROXY_URL}/api/odata/FastPurchaseOrder`;
        const response = await window.TPOSClient.authenticatedFetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`FastPurchaseOrder API error ${response.status}: ${text}`);
        }

        const result = await response.json();
        console.log('[TPOSPurchase] Purchase order created:', result.Id, result.Number, result.ShowState);

        return result;
    }

    // =====================================================
    // MAIN: Full flow - Excel → PurchaseByExcel → FastPurchaseOrder
    // =====================================================

    let _createInProgress = false;

    async function createFromExcel(workbook, order, options = {}) {
        const showToast = window.notificationManager?.show?.bind(window.notificationManager)
            || ((msg, type) => console.log(`[TPOSPurchase] ${type}: ${msg}`));

        // Guard: prevent concurrent/duplicate submissions
        if (_createInProgress) {
            console.warn('[TPOSPurchase] createFromExcel already in progress, skipping duplicate call');
            showToast('Đang tạo đơn TPOS, vui lòng chờ...', 'warning');
            return { success: false, error: 'Đang xử lý, vui lòng chờ' };
        }
        _createInProgress = true;

        try {
            // 1. Find NCC (accept from caller or lookup)
            const supplierName = order.supplier?.name;
            const ncc = options.ncc || window.NCCManager?.findByName(supplierName);
            if (!ncc || !ncc.tposId) {
                throw new Error(`Không tìm thấy NCC "${supplierName}" hoặc NCC chưa có TPOS ID. Hãy đồng bộ NCC từ TPOS trước.`);
            }

            showToast('Đang tạo đơn mua hàng trên TPOS...', 'info');

            // 2. Convert workbook to base64
            const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

            // 3+4. PurchaseByExcel + getFullPartnerData in parallel
            const orderDate = toVNDateString();

            const [excelResult, partnerData] = await Promise.all([
                purchaseByExcel(base64, ncc.tposId, orderDate),
                window.NCCManager.getFullPartnerData(ncc.docId)
            ]);

            if (excelResult.orderLines.length === 0) {
                throw new Error('TPOS không nhận diện được sản phẩm nào từ Excel');
            }
            if (!partnerData) {
                throw new Error('Không lấy được dữ liệu NCC từ Firebase');
            }

            // 5. FastPurchaseOrder → create PO
            const poResult = await createPurchaseOrder(excelResult.orderLines, partnerData, order);

            showToast(`Đã tạo đơn mua hàng TPOS: ${poResult.Number || 'ID ' + poResult.Id}`, 'success');

            return {
                success: true,
                poId: poResult.Id,
                poNumber: poResult.Number,
                state: poResult.ShowState,
                linesCount: excelResult.orderLines.length,
                excelErrors: excelResult.errors,
                orderLines: excelResult.orderLines
            };
        } catch (error) {
            console.error('[TPOSPurchase] createFromExcel failed:', error);
            showToast('Lỗi tạo đơn TPOS: ' + error.message, 'error');
            return { success: false, error: error.message };
        } finally {
            _createInProgress = false;
        }
    }

    // =====================================================
    // STEP 3: Print Barcode Labels
    // =====================================================

    /**
     * Show PDF in a full-screen modal overlay (avoids popup blocker)
     */
    function showPdfModal(pdfUrl) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:8px 16px;background:#333;';

        const btnPrint = document.createElement('button');
        btnPrint.textContent = 'In';
        btnPrint.style.cssText = 'padding:6px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        const btnNewTab = document.createElement('button');
        btnNewTab.textContent = 'Mở tab mới';
        btnNewTab.style.cssText = 'padding:6px 16px;background:#059669;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        const btnClose = document.createElement('button');
        btnClose.textContent = 'Đóng';
        btnClose.style.cssText = 'padding:6px 16px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        const iframe = document.createElement('iframe');
        iframe.src = pdfUrl;
        iframe.style.cssText = 'flex:1;border:none;background:#fff;';

        btnPrint.onclick = () => {
            try { iframe.contentWindow.print(); } catch(e) { window.open(pdfUrl, '_blank'); }
        };
        btnNewTab.onclick = () => window.open(pdfUrl, '_blank');
        btnClose.onclick = () => { overlay.remove(); URL.revokeObjectURL(pdfUrl); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(pdfUrl); } };

        toolbar.append(btnPrint, btnNewTab, btnClose);
        overlay.append(toolbar, iframe);
        document.body.appendChild(overlay);
    }

    async function printBarcodeLabel(fastPurchaseOrderId, orderLines) {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        console.log('[TPOSPurchase] Creating barcode label for PO:', fastPurchaseOrderId, 'Lines:', orderLines.length);

        // Step 1: POST BarcodeProductLabel
        const payload = {
            '@odata.context': 'http://tomato.tpos.vn/odata/$metadata#BarcodeProductLabel(Warehouse())/$entity',
            Id: 0,
            PaperId: 7,
            PriceListId: 1,
            ShowCurrency: false,
            ShowBold: true,
            ShowPrice: true,
            ShowProductName: true,
            IsInventory: null,
            ShowCompany: null,
            BarcodeTemplateIds: [],
            FastPurchaseOrderId: fastPurchaseOrderId,
            IsHideBarcode: null,
            ExtraProperty: null,
            Warehouse: {
                Id: 1, Code: 'WH', Name: 'Nhi Judy Store',
                CompanyId: 0, LocationId: 0,
                NameGet: '[WH] Nhi Judy Store',
                CompanyName: null, LocationActive: true
            },
            PriceList: {
                Id: 1, Name: 'Bảng giá mặc định',
                CurrencyId: 1, CurrencyName: 'VND',
                Active: true, CompanyId: null,
                PartnerCateName: null, Sequence: 1,
                DateStart: null, DateEnd: null, CreatedById: null
            },
            Paper: {
                Id: 7, Name: '2 Tem',
                SheetWidth: 66, SheetHeight: 21,
                LabelWidth: 25, LabelHeight: 21,
                LabelsPerSheet: 2, TopMargin: 0.5,
                LeftMargin: 0.5, BottomMargin: 0.5,
                RightMargin: 0.5, HSpacing: null, VSpacing: null,
                TypePrint: 'Default', FontSize: 6,
                TypePrintText: null, LabelsPerRow: 3
            },
            Lines: orderLines.map(line => ({
                Id: 0,
                ProductId: line.Product?.Id || line.ProductId,
                ProductTmplId: 0,
                Quantity: line.ProductQty || 1,
                Price: line.Product?.PriceVariant || line.PriceUnit || 0,
                Product: line.Product || null
            }))
        };

        const resp1 = await window.TPOSClient.authenticatedFetch(
            `${PROXY_URL}/api/odata/BarcodeProductLabel`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                body: JSON.stringify(payload)
            }
        );

        if (!resp1.ok) throw new Error('BarcodeProductLabel failed: ' + resp1.status);
        const labelData = await resp1.json();
        const labelId = labelData.Id;

        console.log('[TPOSPurchase] BarcodeProductLabel created, Id:', labelId);

        // Step 2: GET PrintBarcodePDF — NOT under /odata/, use /api/ catch-all
        const resp2 = await window.TPOSClient.authenticatedFetch(
            `${PROXY_URL}/api/BarcodeProductLabel/PrintBarcodePDF?id=${labelId}`
        );

        if (!resp2.ok) throw new Error('PrintBarcodePDF failed: ' + resp2.status);

        const blob = await resp2.blob();
        const pdfUrl = URL.createObjectURL(blob);

        // Show PDF in modal overlay (avoids popup blocker)
        showPdfModal(pdfUrl);

        return labelId;
    }

    /**
     * Print barcode labels from saved Firebase order data
     * Uses tposPoId and tposOrderLines stored after TPOS PO creation
     */
    async function printBarcodeFromOrder(order) {
        if (!order.tposPoId || !order.tposOrderLines?.length) {
            throw new Error('Đơn hàng chưa có dữ liệu TPOS');
        }
        return printBarcodeLabel(order.tposPoId, order.tposOrderLines);
    }

    // =====================================================
    // INIT
    // =====================================================

    console.log('[TPOSPurchase] Module loaded');

    return {
        purchaseByExcel,
        createPurchaseOrder,
        createFromExcel,
        printBarcodeLabel,
        printBarcodeFromOrder
    };
})();
