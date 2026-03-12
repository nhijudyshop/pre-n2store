/**
 * TPOS Product Creator
 * Creates products on TPOS after purchase order submission (fire-and-forget)
 *
 * Flow: handleCreateOrder() → Firestore save → syncOrderToTPOS() (fire-and-forget)
 *   → loadAttributeData() from CSV
 *   → groupOrderItems() by productCode
 *   → For each group: buildPayload() → POST TPOS API → updateSyncStatus()
 *
 * Dependencies: TPOSClient (tpos-search.js), Firebase Firestore
 */

window.TPOSProductCreator = (function () {
    'use strict';

    const TPOS_SYNC_CONCURRENCY = 10;
    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TPOS_INSERT_URL = `${PROXY_URL}/api/odata/ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO`;

    // CSV file paths — auto-detect base path for cross-module reuse
    const _csvBase = window.location.pathname.includes('/purchase-orders/') ? '' : 'purchase-orders/';
    const ATTR_VALUES_CSV = `${_csvBase}product_attribute_values_rows.csv`;
    const ATTR_GROUPS_CSV = `${_csvBase}product_attributes_rows.csv`;

    // Cached attribute data
    let attrValueMap = null; // UUID → { value, code, tpos_id, tpos_attribute_id, attribute_id, name_get, sequence }
    let attrGroupMap = null; // attribute UUID → { name, display_order }

    // =====================================================
    // CSV LOADING & ATTRIBUTE MAPPING
    // =====================================================

    /**
     * Parse CSV text into array of objects
     */
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',');
        return lines.slice(1).map(line => {
            const values = line.split(',');
            const obj = {};
            headers.forEach((h, i) => {
                obj[h.trim()] = (values[i] || '').trim();
            });
            return obj;
        });
    }

    /**
     * Load and cache attribute data from CSV files
     * Builds lookup maps: attrValueMap (UUID → TPOS data) and attrGroupMap (UUID → attribute group)
     */
    async function loadAttributeData() {
        if (attrValueMap && attrGroupMap) return;

        try {
            const [valuesResp, groupsResp] = await Promise.all([
                fetch(ATTR_VALUES_CSV),
                fetch(ATTR_GROUPS_CSV)
            ]);

            if (!valuesResp.ok || !groupsResp.ok) {
                throw new Error('Failed to load CSV files');
            }

            const [valuesText, groupsText] = await Promise.all([
                valuesResp.text(),
                groupsResp.text()
            ]);

            // Build attribute groups map
            const groups = parseCSV(groupsText);
            attrGroupMap = new Map();
            groups.forEach(g => {
                attrGroupMap.set(g.id, {
                    name: g.name,
                    display_order: parseInt(g.display_order) || 0
                });
            });

            // Build attribute values map
            const values = parseCSV(valuesText);
            attrValueMap = new Map();
            values.forEach(v => {
                attrValueMap.set(v.id, {
                    value: v.value,
                    code: v.code,
                    tpos_id: parseInt(v.tpos_id) || 0,
                    tpos_attribute_id: parseInt(v.tpos_attribute_id) || 0,
                    attribute_id: v.attribute_id,
                    name_get: v.name_get || '',
                    sequence: parseInt(v.sequence) || 0
                });
            });

            console.log(`[TPOSCreator] Loaded ${attrValueMap.size} attribute values, ${attrGroupMap.size} attribute groups`);
        } catch (error) {
            console.error('[TPOSCreator] Failed to load attribute data:', error);
            throw error;
        }
    }

    /**
     * Resolve UUID array to enriched attribute value objects, sorted by attribute display_order
     */
    function resolveAttributeValues(selectedAttributeValueIds) {
        if (!selectedAttributeValueIds || selectedAttributeValueIds.length === 0) return [];
        if (!attrValueMap || !attrGroupMap) return [];

        const resolved = [];
        for (const uuid of selectedAttributeValueIds) {
            const val = attrValueMap.get(uuid);
            if (!val) {
                console.warn(`[TPOSCreator] Unknown attribute UUID: ${uuid}`);
                continue;
            }
            const group = attrGroupMap.get(val.attribute_id);
            resolved.push({
                ...val,
                attribute_name: group?.name || '',
                attribute_display_order: group?.display_order || 0
            });
        }

        // Sort by attribute display_order
        resolved.sort((a, b) => a.attribute_display_order - b.attribute_display_order);
        return resolved;
    }

    /**
     * Group resolved attribute values by attribute_id
     * Returns Map<attribute_id, value[]> sorted by display_order
     */
    function groupByAttribute(resolvedValues) {
        const groups = new Map();
        for (const val of resolvedValues) {
            if (!groups.has(val.attribute_id)) {
                groups.set(val.attribute_id, []);
            }
            groups.get(val.attribute_id).push(val);
        }
        // Sort groups by display_order
        const sorted = new Map([...groups.entries()].sort((a, b) => {
            const orderA = a[1][0]?.attribute_display_order || 0;
            const orderB = b[1][0]?.attribute_display_order || 0;
            return orderA - orderB;
        }));
        return sorted;
    }

    // =====================================================
    // GROUP ORDER ITEMS
    // =====================================================

    /**
     * Group items by productCode only.
     * All items with the same productCode become 1 TPOS product.
     * Their attribute IDs are merged to build the full variant set.
     */
    function groupOrderItems(items) {
        const groups = new Map();

        for (const item of items) {
            if (!item.productCode || !item.productCode.trim()) continue;

            const groupKey = item.productCode.trim().toUpperCase();

            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey).push(item);
        }

        return groups;
    }

    // =====================================================
    // TPOS PAYLOAD BUILDERS
    // =====================================================

    /** Shared UOM object */
    const UOM_OBJECT = {
        Id: 1,
        Name: "Cái",
        NameNoSign: null,
        Rounding: 0.001,
        Active: true,
        Factor: 1,
        FactorInv: 1,
        UOMType: "reference",
        CategoryId: 1,
        CategoryName: "Đơn vị",
        Description: null,
        ShowUOMType: "Đơn vị gốc của nhóm này",
        NameGet: "Cái",
        ShowFactor: 1,
        DateCreated: "2018-05-25T15:44:44.14+07:00"
    };

    /** Shared Categ object */
    const CATEG_OBJECT = {
        Id: 2,
        Name: "Có thể bán",
        CompleteName: "Có thể bán",
        ParentId: null,
        ParentCompleteName: null,
        ParentLeft: 0,
        ParentRight: 1,
        Sequence: null,
        Type: "normal",
        AccountIncomeCategId: null,
        AccountExpenseCategId: null,
        StockJournalId: null,
        StockAccountInputCategId: null,
        StockAccountOutputCategId: null,
        StockValuationAccountId: null,
        PropertyValuation: null,
        PropertyCostMethod: "average",
        NameNoSign: "Co the ban",
        IsPos: true,
        Version: null,
        IsDelete: false
    };

    /**
     * Build base TPOS payload with all ~60 fields
     */
    function buildBasePayload(productCode, productName, purchasePrice, sellingPrice) {
        return {
            Id: 0,
            Name: productName,
            NameNoSign: null,
            Description: null,
            Type: "product",
            ShowType: "Có thể lưu trữ",
            ListPrice: sellingPrice,
            DiscountSale: 0,
            DiscountPurchase: 0,
            PurchasePrice: purchasePrice,
            StandardPrice: 0,
            SaleOK: true,
            PurchaseOK: true,
            Active: true,
            UOMId: 1,
            UOMName: null,
            UOMPOId: 1,
            UOMPOName: null,
            UOSId: null,
            IsProductVariant: false,
            EAN13: null,
            DefaultCode: productCode,
            QtyAvailable: 0,
            VirtualAvailable: 0,
            OutgoingQty: 0,
            IncomingQty: 0,
            PropertyCostMethod: null,
            CategId: 2,
            CategCompleteName: null,
            CategName: null,
            Weight: 0,
            Tracking: "none",
            DescriptionPurchase: null,
            DescriptionSale: null,
            CompanyId: window.ShopConfig ? window.ShopConfig.getConfig().CompanyId : 1,
            NameGet: null,
            PropertyStockProductionId: null,
            SaleDelay: 0,
            InvoicePolicy: "order",
            PurchaseMethod: "receive",
            PropertyValuation: null,
            Valuation: null,
            AvailableInPOS: true,
            POSCategId: null,
            CostMethod: null,
            Barcode: productCode,
            Image: null,
            ImageUrl: null,
            Thumbnails: [],
            ProductVariantCount: 0,
            LastUpdated: null,
            UOMCategId: null,
            BOMCount: 0,
            Volume: null,
            CategNameNoSign: null,
            UOMNameNoSign: null,
            UOMPONameNoSign: null,
            IsCombo: false,
            EnableAll: false,
            ComboPurchased: null,
            TaxAmount: null,
            Version: 0,
            VariantFirstId: null,
            VariantFistId: null,
            ZaloProductId: null,
            CompanyName: null,
            CompanyNameNoSign: null,
            DateCreated: null,
            InitInventory: 0,
            UOMViewId: null,
            ImporterId: null,
            ImporterName: null,
            ImporterAddress: null,
            ProducerId: null,
            ProducerName: null,
            ProducerAddress: null,
            DistributorId: null,
            DistributorName: null,
            DistributorAddress: null,
            OriginCountryId: null,
            OriginCountryName: null,
            InfoWarning: null,
            Element: null,
            YearOfManufacture: null,
            Specifications: null,
            Tags: null,
            CreatedByName: null,
            OrderTag: null,
            StringExtraProperties: null,
            CreatedById: null,
            Error: null,
            UOM: UOM_OBJECT,
            Categ: CATEG_OBJECT,
            UOMPO: UOM_OBJECT,
            AttributeLines: [],
            Items: [],
            UOMLines: [],
            ComboProducts: [],
            ProductSupplierInfos: [],
            ProductVariants: []
        };
    }

    /**
     * Build AttributeLines from grouped attribute values
     * @param {Map} attrGroups - Map<attribute_id, resolvedValue[]>
     */
    function buildAttributeLines(attrGroups) {
        const lines = [];
        for (const [attrId, values] of attrGroups) {
            const first = values[0];
            lines.push({
                Attribute: {
                    Id: first.tpos_attribute_id,
                    Name: first.attribute_name,
                    Code: first.attribute_name,
                    Sequence: null,
                    CreateVariant: true
                },
                Values: values.map(v => ({
                    Id: v.tpos_id,
                    Name: v.value,
                    Code: v.code,
                    Sequence: v.sequence,
                    AttributeId: v.tpos_attribute_id,
                    AttributeName: v.attribute_name,
                    PriceExtra: null,
                    NameGet: v.name_get,
                    DateCreated: null
                })),
                AttributeId: first.tpos_attribute_id
            });
        }
        return lines;
    }

    /**
     * Generate Cartesian product of arrays
     * @param {Array[]} arrays - array of value arrays
     * @returns {Array[]} - all combinations
     */
    function cartesianProduct(arrays) {
        if (arrays.length === 0) return [];
        if (arrays.length === 1) return arrays[0].map(v => [v]);

        const result = [];
        const [first, ...rest] = arrays;
        const restCombos = cartesianProduct(rest);

        for (const item of first) {
            for (const combo of restCombos) {
                result.push([item, ...combo]);
            }
        }
        return result;
    }

    /**
     * Build ProductVariants from Cartesian product of attribute values
     * @param {string} baseProductCode - e.g. "N4033"
     * @param {number} sellingPrice - in VND
     * @param {Map} attrGroups - grouped attribute values
     */
    function buildProductVariants(baseProductCode, sellingPrice, attrGroups) {
        // Get arrays of values per attribute (in display_order)
        const valueArrays = [...attrGroups.values()];
        const allCombinations = cartesianProduct(valueArrays);

        return allCombinations.map(combo => {
            // NameGet uses REVERSED order (per Section 13.8)
            const variantName = `${baseProductCode} (${[...combo].reverse().map(v => v.value).join(', ')})`;

            return {
                Id: 0,
                EAN13: null,
                DefaultCode: null,
                NameTemplate: baseProductCode,
                NameNoSign: null,
                ProductTmplId: 0,
                UOMId: 0,
                UOMName: null,
                UOMPOId: 0,
                QtyAvailable: 0,
                VirtualAvailable: 0,
                OutgoingQty: null,
                IncomingQty: null,
                NameGet: variantName,
                POSCategId: null,
                Price: null,
                Barcode: null,
                Image: null,
                ImageUrl: null,
                Thumbnails: [],
                PriceVariant: sellingPrice,
                SaleOK: true,
                PurchaseOK: true,
                DisplayAttributeValues: null,
                LstPrice: 0,
                Active: true,
                ListPrice: 0,
                PurchasePrice: null,
                DiscountSale: null,
                DiscountPurchase: null,
                StandardPrice: 0,
                Weight: 0,
                Volume: null,
                OldPrice: null,
                IsDiscount: false,
                ProductTmplEnableAll: false,
                Version: 0,
                Description: null,
                LastUpdated: null,
                Type: "product",
                CategId: 0,
                CostMethod: null,
                InvoicePolicy: "order",
                Variant_TeamId: 0,
                Name: variantName,
                PropertyCostMethod: null,
                PropertyValuation: null,
                PurchaseMethod: "receive",
                SaleDelay: 0,
                Tracking: null,
                Valuation: null,
                AvailableInPOS: true,
                CompanyId: null,
                IsCombo: null,
                NameTemplateNoSign: baseProductCode,
                TaxesIds: [],
                StockValue: null,
                SaleValue: null,
                PosSalesCount: null,
                Factor: null,
                CategName: null,
                AmountTotal: null,
                NameCombos: [],
                RewardName: null,
                Product_UOMId: null,
                Tags: null,
                DateCreated: null,
                InitInventory: 0,
                OrderTag: null,
                StringExtraProperties: null,
                CreatedById: null,
                TaxAmount: null,
                Error: null,
                // AttributeValues keep ORIGINAL order (not reversed)
                AttributeValues: combo.map(v => ({
                    Id: v.tpos_id,
                    Name: v.value,
                    Code: null,
                    Sequence: null,
                    AttributeId: v.tpos_attribute_id,
                    AttributeName: v.attribute_name,
                    PriceExtra: null,
                    NameGet: v.name_get,
                    DateCreated: null
                }))
            };
        });
    }

    // =====================================================
    // IMAGE → BASE64 CONVERSION
    // =====================================================

    /**
     * Convert an image URL (Firebase Storage) to base64 string for TPOS Image field.
     * Resizes to max 800×800 if blob > 500KB. Returns pure base64 (no prefix).
     * @param {string} url - Firebase Storage download URL
     * @returns {Promise<string|null>} base64 string or null on failure
     */
    async function convertImageToBase64(url) {
        if (!url) return null;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn('[TPOSCreator] Failed to fetch image:', response.status, url);
                return null;
            }

            let blob = await response.blob();

            // Resize if > 500KB
            if (blob.size > 512000) {
                blob = await resizeImageBlob(blob, 800, 800, 0.8);
            }

            // Convert blob to base64
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const dataUrl = reader.result;
                    // Strip prefix "data:image/...;base64,"
                    const base64Data = dataUrl.split(',')[1] || null;
                    resolve(base64Data);
                };
                reader.onerror = () => {
                    console.warn('[TPOSCreator] FileReader error');
                    resolve(null);
                };
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.warn('[TPOSCreator] Image conversion failed:', error.message);
            return null;
        }
    }

    /**
     * Resize image blob using canvas
     * @param {Blob} blob - image blob
     * @param {number} maxW - max width
     * @param {number} maxH - max height
     * @param {number} quality - JPEG quality (0-1)
     * @returns {Promise<Blob>}
     */
    function resizeImageBlob(blob, maxW, maxH, quality) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;

                // Scale down proportionally
                if (w > maxW || h > maxH) {
                    const ratio = Math.min(maxW / w, maxH / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                canvas.toBlob(
                    (resizedBlob) => resolve(resizedBlob || blob),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(blob); // fallback to original
            img.src = URL.createObjectURL(blob);
        });
    }

    // =====================================================
    // TPOS API CALLS
    // =====================================================

    /**
     * POST product to TPOS API with retry for 429
     * @param {Object} payload - TPOS product payload
     * @param {number} maxRetries - max retry attempts for 429
     */
    async function createTPOSProduct(payload, maxRetries = 2) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await window.TPOSClient.authenticatedFetch(TPOS_INSERT_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                // Success
                if (response.ok) {
                    const data = await response.json();
                    console.log('[TPOSCreator] Product created:', data.DefaultCode || data.Id);
                    return { success: true, data, alreadyExists: false };
                }

                // 400 - product already exists → treat as success
                if (response.status === 400) {
                    const errorText = await response.text();
                    console.log('[TPOSCreator] Product may already exist (400):', errorText);
                    return { success: true, data: null, alreadyExists: true };
                }

                // 429 - rate limited → retry
                if (response.status === 429 && attempt < maxRetries) {
                    const waitMs = 2000 * (attempt + 1);
                    console.warn(`[TPOSCreator] Rate limited (429), retrying in ${waitMs}ms...`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                // Other error
                const errorText = await response.text();
                console.error(`[TPOSCreator] TPOS API error ${response.status}:`, errorText);
                return { success: false, error: `TPOS API ${response.status}: ${errorText}` };

            } catch (error) {
                console.error('[TPOSCreator] Network error:', error);
                return { success: false, error: error.message };
            }
        }

        return { success: false, error: 'Max retries exceeded (429)' };
    }

    // =====================================================
    // FIRESTORE SYNC STATUS UPDATE
    // =====================================================

    /**
     * Update tposSyncStatus for specific items in a Firestore order document.
     * Uses transaction to prevent race conditions when multiple groups update concurrently.
     */
    async function updateSyncStatus(orderId, itemIds, status, tposProductId, error) {
        try {
            if (!window.firebase || !window.firebase.firestore) return;

            const db = firebase.firestore();
            const docRef = db.collection('purchase_orders').doc(orderId);

            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                if (!doc.exists) return;

                const data = doc.data();
                const items = data.items || [];
                let changed = false;

                for (const item of items) {
                    if (itemIds.includes(item.id)) {
                        item.tposSyncStatus = status;
                        if (tposProductId) item.tposProductId = tposProductId;
                        if (error) item.tposSyncError = error;
                        if (status === 'success') item.tposSynced = true;
                        item.tposSyncCompletedAt = firebase.firestore.Timestamp.now();
                        changed = true;
                    }
                }

                if (changed) {
                    transaction.update(docRef, {
                        items,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            });

            console.log(`[TPOSCreator] Updated sync status for ${itemIds.length} items: ${status}`);
        } catch (err) {
            console.error('[TPOSCreator] Failed to update sync status:', err);
        }
    }

    // =====================================================
    // UPDATE VARIANT BARCODES FROM TPOS RESPONSE
    // =====================================================

    /**
     * Match TPOS response ProductVariants to order items by attribute tpos_ids,
     * then update each item's productCode with the variant's Barcode.
     * @param {string} orderId - Firestore document ID
     * @param {Array} groupItems - order items in this group
     * @param {Array} responseVariants - ProductVariants[] from TPOS response
     * @param {Array} allCombinations - Cartesian product combos (same order as request)
     */
    /**
     * Extract attribute value names from TPOS variant NameGet
     * e.g. "[Q774C3X] AO654 (3, Cam, XXL)" → ["3", "Cam", "XXL"]
     */
    function extractVariantAttrs(nameGet) {
        if (!nameGet) return [];
        const match = nameGet.match(/\(([^)]+)\)\s*$/);
        if (!match) return [];
        return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    /**
     * Remove Vietnamese diacritics for normalization
     */
    function removeDiacritics(str) {
        if (window.ProductCodeGenerator?.removeVietnameseDiacritics) {
            return window.ProductCodeGenerator.removeVietnameseDiacritics(str);
        }
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, d => d === 'đ' ? 'd' : 'D');
    }

    /**
     * Match items to TPOS variant barcodes (in-memory only, no Firestore)
     * Uses 2 strategies: (1) TPOS attribute value IDs, (2) normalized name comparison
     * Returns array of { itemId, barcode, tposVariantId } for batchUpdateSyncResults
     */
    function matchVariantBarcodes(groupItems, responseVariants) {
        console.log(`[TPOSCreator] matchVariantBarcodes: ${groupItems.length} items, ${responseVariants.length} variants`);

        const updates = [];
        const usedVariantIds = new Set();

        for (const item of groupItems) {
            if (!item.variant) continue;

            let matched = null;

            // Strategy 1: Match by TPOS attribute value IDs (most reliable)
            if (!matched && item.selectedAttributeValueIds?.length > 0 && attrValueMap) {
                const itemTposIds = item.selectedAttributeValueIds
                    .map(uuid => attrValueMap.get(uuid)?.tpos_id)
                    .filter(id => id > 0)
                    .sort((a, b) => a - b);

                if (itemTposIds.length > 0) {
                    matched = responseVariants.find(v => {
                        if (usedVariantIds.has(v.Id)) return false;
                        if (!v.AttributeValues?.length) return false;
                        const vTposIds = v.AttributeValues
                            .map(a => a.Id)
                            .sort((a, b) => a - b);
                        return itemTposIds.length === vTposIds.length
                            && itemTposIds.every((id, i) => id === vTposIds[i]);
                    });
                    if (matched) console.log(`[TPOSCreator] ✓ Matched "${item.variant}" by TPOS ID → ${matched.DefaultCode}`);
                }
            }

            // Strategy 2: Match by normalized name (fallback)
            if (!matched) {
                const itemAttrs = item.variant.split(/[\/,|]/).map(s => removeDiacritics(s.trim()).toUpperCase()).filter(Boolean).sort();
                const itemKey = itemAttrs.join('|');
                console.log(`[TPOSCreator] Trying name match: "${item.variant}" → [${itemAttrs}]`);

                matched = responseVariants.find(v => {
                    if (usedVariantIds.has(v.Id)) return false;
                    const vAttrs = extractVariantAttrs(v.NameGet || v.Name)
                        .map(s => removeDiacritics(s.trim()).toUpperCase())
                        .filter(Boolean)
                        .sort();
                    return vAttrs.join('|') === itemKey;
                });
                if (matched) console.log(`[TPOSCreator] ✓ Matched "${item.variant}" by name → ${matched.DefaultCode}`);
            }

            if (matched) {
                usedVariantIds.add(matched.Id);
                updates.push({
                    itemId: item.id,
                    barcode: matched.Barcode || matched.DefaultCode,
                    tposVariantId: matched.Id
                });
            } else {
                console.warn(`[TPOSCreator] ✗ No TPOS variant match for "${item.variant}"`);
            }
        }

        console.log(`[TPOSCreator] Total updates: ${updates.length}/${groupItems.filter(i => i.variant).length}`);
        return updates.length > 0 ? updates : null;
    }

    // =====================================================
    // SAVE TPOS IMAGE URL TO FIREBASE ITEMS
    // =====================================================

    /**
     * Save TPOS ImageUrl to Firebase items' tposImageUrl field.
     * Preserves original productImages (Firebase URLs) so they can be reused when copying orders.
     * Uses transaction to prevent race conditions when multiple groups update concurrently.
     */
    // saveTPOSImageUrl logic is now merged into batchUpdateSyncResults()

    /**
     * Batch update sync results for multiple groups in ONE Firestore transaction.
     * @param {string} orderId
     * @param {Array} groupResults - array of { itemIds, syncData: { status, tposProductId, error, variantUpdates, tposImageUrl } }
     */
    async function batchUpdateSyncResults(orderId, groupResults) {
        if (!groupResults || groupResults.length === 0) return;
        try {
            if (!window.firebase || !window.firebase.firestore) return;

            const db = firebase.firestore();
            const docRef = db.collection('purchase_orders').doc(orderId);

            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                if (!doc.exists) return;

                const data = doc.data();
                const items = data.items || [];
                let changed = false;

                for (const { itemIds, syncData } of groupResults) {
                    if (!itemIds || !syncData) continue;
                    const { status, tposProductId, error, variantUpdates, tposImageUrl } = syncData;

                    // 1. Update sync status
                    for (const item of items) {
                        if (itemIds.includes(item.id)) {
                            item.tposSyncStatus = status;
                            if (tposProductId) item.tposProductId = tposProductId;
                            if (error) item.tposSyncError = error;
                            if (status === 'success') item.tposSynced = true;
                            item.tposSyncCompletedAt = firebase.firestore.Timestamp.now();
                            changed = true;
                        }
                    }

                    // 2. Update variant barcodes
                    if (variantUpdates && variantUpdates.length > 0) {
                        for (const update of variantUpdates) {
                            const item = items.find(i => i.id === update.itemId);
                            if (item && update.barcode) {
                                if (!item.parentProductCode) {
                                    item.parentProductCode = item.productCode;
                                }
                                item.productCode = update.barcode;
                                item.tposProductId = update.tposVariantId;
                                item.tposSynced = true;
                                changed = true;
                            }
                        }
                    }

                    // 3. Save TPOS ImageUrl
                    if (tposImageUrl) {
                        for (const item of items) {
                            if (itemIds.includes(item.id)) {
                                item.tposImageUrl = tposImageUrl;
                                changed = true;
                            }
                        }
                    }
                }

                if (changed) {
                    transaction.update(docRef, { items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                }
            });

            const totalItems = groupResults.reduce((sum, g) => sum + (g.itemIds?.length || 0), 0);
            console.log(`[TPOSCreator] Batch updated ${groupResults.length} groups (${totalItems} items)`);
        } catch (err) {
            console.error('[TPOSCreator] Failed to batch update sync results:', err);
        }
    }

    // =====================================================
    // MAIN SYNC ORCHESTRATOR
    // =====================================================

    /**
     * Process a single group of items → create 1 TPOS product
     * @param {string} orderId - Firestore document ID
     * @param {Array} groupItems - items in this group (same productCode)
     */
    async function processGroup(orderId, groupItems) {
        // Skip if all items already synced to TPOS
        if (groupItems.every(i => i.tposSynced)) {
            console.log(`[TPOSCreator] Skipping ${groupItems[0].productCode} — already synced`);
            return { success: true, productCode: groupItems[0].productCode, skipped: true };
        }

        const firstItem = groupItems[0];
        const productCode = firstItem.productCode.trim().toUpperCase();
        const productName = firstItem.productName.trim().toUpperCase();
        const purchasePrice = firstItem.purchasePrice || 0;
        const sellingPrice = firstItem.sellingPrice || 0;
        const itemIds = groupItems.map(i => i.id);

        // Collect ALL unique attribute IDs from ALL items in this group
        const allAttrIds = new Set();
        for (const item of groupItems) {
            (item.selectedAttributeValueIds || []).forEach(id => allAttrIds.add(id));
        }

        // Collect first available productImages URL from any item in the group
        let imageUrl = null;
        for (const item of groupItems) {
            if (item.productImages && item.productImages.length > 0) {
                imageUrl = item.productImages[0];
                break;
            }
        }

        // Note: 'processing' status is set in batch before parallel launch (see syncOrderToTPOS)

        try {
            // Convert image to base64 for TPOS (fire-and-forget style, don't block on failure)
            let imageBase64 = null;
            if (imageUrl) {
                imageBase64 = await convertImageToBase64(imageUrl);
                if (imageBase64) {
                    console.log(`[TPOSCreator] Image converted for ${productCode} (${Math.round(imageBase64.length / 1024)}KB base64)`);
                }
            }

            let payload;
            let allCombinations = null; // Track combos for variant barcode matching

            if (allAttrIds.size === 0) {
                // CASE 1: Simple product (no variants)
                payload = buildBasePayload(productCode, productName, purchasePrice, sellingPrice);
            } else {
                // CASE 2: Product with variants

                const resolvedValues = resolveAttributeValues([...allAttrIds]);
                if (resolvedValues.length === 0) {
                    throw new Error('No attribute values found for UUIDs');
                }

                const attrGroups = groupByAttribute(resolvedValues);
                const attributeLines = buildAttributeLines(attrGroups);
                const productVariants = buildProductVariants(productCode, sellingPrice, attrGroups);

                // Save combos for matching response variants back to items
                const valueArrays = [...attrGroups.values()];
                allCombinations = cartesianProduct(valueArrays);

                payload = buildBasePayload(productCode, productName, purchasePrice, sellingPrice);
                payload.IsProductVariant = true;
                payload.ProductVariantCount = productVariants.length;
                payload.AttributeLines = attributeLines;
                payload.ProductVariants = productVariants;
            }

            // Set image on payload (only parent product, variant children keep Image: null)
            if (imageBase64) {
                payload.Image = imageBase64;
            }

            // POST to TPOS
            const result = await createTPOSProduct(payload);

            if (result.success) {
                let productData = result.data;

                // If product already exists on TPOS, fetch existing data
                if (result.alreadyExists && allCombinations) {
                    console.log(`[TPOSCreator] Product ${productCode} already exists, fetching from TPOS...`);
                    try {
                        const productUrl = `${PROXY_URL}/api/odata/Product?$filter=startswith(DefaultCode, '${productCode}')&$top=100&$select=Id,DefaultCode,ProductTmplId,Barcode,NameGet,AttributeValues`;
                        console.log(`[TPOSCreator] Fetching: ${productUrl}`);
                        const resp = await window.TPOSClient.authenticatedFetch(productUrl);
                        if (resp.ok) {
                            const fetchData = await resp.json();
                            const variants = fetchData.value || [];
                            console.log(`[TPOSCreator] Fetched ${variants.length} product(s) for ${productCode}:`, variants.map(v => `${v.DefaultCode} ${v.NameGet || ''}`));
                            if (variants.length > 0) {
                                productData = {
                                    Id: variants[0].ProductTmplId,
                                    ProductVariants: variants.map(v => ({
                                        Id: v.Id,
                                        Barcode: v.DefaultCode,
                                        DefaultCode: v.DefaultCode,
                                        NameGet: v.NameGet || null,
                                        AttributeValues: v.AttributeValues || null
                                    }))
                                };
                            }
                        }
                    } catch (fetchErr) {
                        console.warn(`[TPOSCreator] Failed to fetch existing product ${productCode}:`, fetchErr);
                    }
                }

                const tposId = productData?.Id || null;
                const tposImgUrl = productData?.ImageUrl || null;

                // Compute variant barcode updates (in-memory, no Firestore)
                let variantUpdates = null;
                if (allCombinations && productData?.ProductVariants?.length > 0) {
                    variantUpdates = matchVariantBarcodes(groupItems, productData.ProductVariants);
                }

                // Return result data (Firestore write is batched in syncOrderToTPOS)
                return {
                    success: true, productCode, alreadyExists: result.alreadyExists,
                    itemIds,
                    syncData: { status: 'success', tposProductId: tposId, error: null, variantUpdates, tposImageUrl: tposImgUrl }
                };
            } else {
                return {
                    success: false, productCode, error: result.error,
                    itemIds,
                    syncData: { status: 'failed', tposProductId: null, error: result.error, variantUpdates: null, tposImageUrl: null }
                };
            }
        } catch (error) {
            console.error(`[TPOSCreator] Error processing ${productCode}:`, error);
            return {
                success: false, productCode, error: error.message,
                itemIds,
                syncData: { status: 'failed', tposProductId: null, error: error.message, variantUpdates: null, tposImageUrl: null }
            };
        }
    }

    /**
     * Main entry point: sync an order's items to TPOS (fire-and-forget)
     * @param {string} orderId - Firestore document ID
     * @param {Array} items - order items with productCode, selectedAttributeValueIds, etc.
     * @param {Object} supplier - supplier info (not used in TPOS payload currently)
     */
    async function syncOrderToTPOS(orderId, items, supplier) {
        console.log(`[TPOSCreator] Starting TPOS sync for order ${orderId}, ${items.length} items`);

        try {
            // Step 1: Load attribute CSV data
            await loadAttributeData();

            // Step 2: Group items
            const groups = groupOrderItems(items);
            if (groups.size === 0) {
                console.log('[TPOSCreator] No items to sync');
                return;
            }

            console.log(`[TPOSCreator] ${groups.size} product groups to sync`);

            // Step 3: Process groups in parallel batches
            const groupEntries = [...groups.entries()];
            console.log(`[TPOSCreator] Processing ${groupEntries.length} groups in parallel batches of ${TPOS_SYNC_CONCURRENCY}`);

            // Process in batches with single 'processing' status update per batch
            const results = [];
            for (let i = 0; i < groupEntries.length; i += TPOS_SYNC_CONCURRENCY) {
                const batch = groupEntries.slice(i, i + TPOS_SYNC_CONCURRENCY);

                // Collect all itemIds in this batch, mark 'processing' in ONE transaction
                const batchItemIds = [];
                for (const [, groupItems] of batch) {
                    if (!groupItems.every(item => item.tposSynced)) {
                        for (const item of groupItems) batchItemIds.push(item.id);
                    }
                }
                if (batchItemIds.length > 0) {
                    await updateSyncStatus(orderId, batchItemIds, 'processing', null, null);
                }

                // Launch all groups in this batch concurrently
                const batchResults = await Promise.allSettled(
                    batch.map(([groupKey, groupItems]) => processGroup(orderId, groupItems))
                );

                // Collect results and batch-write to Firestore in ONE transaction
                const syncUpdates = [];
                for (const r of batchResults) {
                    const result = r.status === 'fulfilled'
                        ? r.value
                        : { success: false, error: r.reason?.message || 'Unknown error' };
                    results.push(result);
                    if (result.itemIds && result.syncData) {
                        syncUpdates.push({ itemIds: result.itemIds, syncData: result.syncData });
                    }
                }
                if (syncUpdates.length > 0) {
                    await batchUpdateSyncResults(orderId, syncUpdates);
                }

                // Small delay between batches to avoid rate limiting
                if (i + TPOS_SYNC_CONCURRENCY < groupEntries.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            let successCount = 0;
            let failCount = 0;
            for (const result of results) {
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            }

            // Step 4: Show summary toast
            if (window.notificationManager) {
                if (failCount === 0) {
                    window.notificationManager.show(
                        `Đã đồng bộ ${successCount} sản phẩm lên TPOS thành công!`,
                        'success'
                    );
                } else if (successCount > 0) {
                    window.notificationManager.show(
                        `Đồng bộ TPOS: ${successCount} thành công, ${failCount} thất bại`,
                        'warning'
                    );
                } else {
                    const errors = results.filter(r => !r.success).map(r => r.error).join('; ');
                    window.notificationManager.show(
                        `Đồng bộ TPOS thất bại: ${errors}`,
                        'error'
                    );
                }
            }

            console.log(`[TPOSCreator] Sync complete: ${successCount} success, ${failCount} failed`);
            return { successCount, failCount, results };

        } catch (error) {
            console.error('[TPOSCreator] Sync failed:', error);
            if (window.notificationManager) {
                window.notificationManager.show(
                    `Lỗi đồng bộ TPOS: ${error.message}`,
                    'error'
                );
            }
            return { successCount: 0, failCount: 1, error: error.message };
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        syncOrderToTPOS,
        // Exported for testing/debugging
        loadAttributeData,
        groupOrderItems,
        resolveAttributeValues,
        buildBasePayload,
        buildAttributeLines,
        buildProductVariants,
        createTPOSProduct,
        convertImageToBase64
    };

})();

console.log('[TPOSCreator] TPOS Product Creator loaded');
