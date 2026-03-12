/**
 * BarcodeLabelDialog - Custom HTML barcode label printing
 * Generates barcode labels matching TPOS "2 Tem" format:
 * - Product name on top
 * - Barcode (CODE128) in middle
 * - Product code + price at bottom
 * Paper: 66mm × 21mm sheet, 25mm × 21mm labels, 2 per row
 */
window.BarcodeLabelDialog = (function () {
    let overlay = null;

    function open(order) {
        if (!order?.items?.length) return;

        const items = order.items.map((item, idx) => ({
            id: item.id || idx,
            name: item.productName || '',
            code: item.productCode || '',
            variant: item.variant || '',
            quantity: item.quantity || 1,
            price: item.sellingPrice || 0,
            checked: true
        }));

        showSelectionModal(order, items);
    }

    function showSelectionModal(order, items) {
        // Remove existing
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:8px;width:90%;max-width:700px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = `
            <h3 style="margin:0;font-size:16px;font-weight:600;">In tem Barcode</h3>
            <button id="bld-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;padding:4px 8px;">✕</button>
        `;

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

        // Select all checkbox
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'margin-bottom:12px;padding:8px 0;border-bottom:1px solid #f3f4f6;';
        selectAllDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:14px;">
                <input type="checkbox" id="bld-select-all" checked style="width:16px;height:16px;cursor:pointer;">
                Chọn tất cả
            </label>
        `;
        body.appendChild(selectAllDiv);

        // Items table
        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
        table.innerHTML = `
            <thead>
                <tr style="background:#f9fafb;">
                    <th style="padding:8px 6px;text-align:center;width:36px;"></th>
                    <th style="padding:8px 6px;text-align:left;">Sản phẩm</th>
                    <th style="padding:8px 6px;text-align:left;width:80px;">Mã SP</th>
                    <th style="padding:8px 6px;text-align:center;width:50px;">SL</th>
                    <th style="padding:8px 6px;text-align:right;width:90px;">Giá bán</th>
                </tr>
            </thead>
            <tbody id="bld-items-body"></tbody>
        `;

        const tbody = table.querySelector('#bld-items-body');
        items.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid #f3f4f6;';
            const variantText = item.variant ? `<span style="color:#6b7280;font-size:11px;display:block;">${item.variant}</span>` : '';
            tr.innerHTML = `
                <td style="padding:6px;text-align:center;">
                    <input type="checkbox" class="bld-item-check" data-index="${i}" checked style="width:15px;height:15px;cursor:pointer;">
                </td>
                <td style="padding:6px;">
                    <span style="font-weight:500;">${item.name}</span>
                    ${variantText}
                </td>
                <td style="padding:6px;font-family:monospace;font-size:12px;">${item.code}</td>
                <td style="padding:6px;text-align:center;">${item.quantity}</td>
                <td style="padding:6px;text-align:right;">${formatPrice(item.price)}</td>
            `;
            tbody.appendChild(tr);
        });
        body.appendChild(table);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:8px;';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Hủy';
        btnCancel.style.cssText = 'padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;';

        // "In tem TPOS" button if order has tposPoId
        let btnTpos = null;
        if (order.tposPoId) {
            btnTpos = document.createElement('button');
            btnTpos.textContent = 'In tem TPOS';
            btnTpos.style.cssText = 'padding:8px 16px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;';
        }

        const btnPrint = document.createElement('button');
        btnPrint.id = 'bld-btn-print';
        btnPrint.style.cssText = 'padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;';

        footer.appendChild(btnCancel);
        if (btnTpos) footer.appendChild(btnTpos);
        footer.appendChild(btnPrint);

        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Update button text
        function updateCount() {
            const checked = items.filter(it => it.checked);
            const totalLabels = checked.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = `In tem (${totalLabels})`;
        }
        updateCount();

        // Event: select all
        const selectAllCheckbox = document.getElementById('bld-select-all');
        selectAllCheckbox.addEventListener('change', () => {
            const val = selectAllCheckbox.checked;
            items.forEach(it => it.checked = val);
            body.querySelectorAll('.bld-item-check').forEach(cb => cb.checked = val);
            updateCount();
        });

        // Event: individual checkboxes
        body.addEventListener('change', (e) => {
            if (e.target.classList.contains('bld-item-check')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].checked = e.target.checked;
                // Update select-all state
                selectAllCheckbox.checked = items.every(it => it.checked);
                updateCount();
            }
        });

        // Event: close
        const closeModal = () => { overlay.remove(); overlay = null; };
        header.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        // Event: print TPOS (existing flow)
        if (btnTpos) {
            btnTpos.addEventListener('click', async () => {
                closeModal();
                try {
                    await window.TPOSPurchase.printBarcodeFromOrder(order);
                } catch (err) {
                    console.error('[BarcodeLabelDialog] TPOS print failed:', err);
                }
            });
        }

        // Event: print local
        btnPrint.addEventListener('click', () => {
            const selected = items.filter(it => it.checked);
            if (!selected.length) return;
            closeModal();
            generateAndPrint(selected);
        });
    }

    function generateAndPrint(items) {
        // Build label data: each item × quantity
        const labels = [];
        for (const item of items) {
            for (let i = 0; i < item.quantity; i++) {
                labels.push({
                    name: item.name,
                    code: item.code,
                    price: item.price
                });
            }
        }

        // Build HTML document for printing
        const html = buildLabelHTML(labels);

        // Show in overlay with iframe
        showPrintOverlay(html);
    }

    function buildLabelHTML(labels) {
        // Paper: 66mm × 21mm, Label: 25mm × 21mm, 2 per row
        // Margins: 0.5mm all sides, FontSize: 6pt
        const labelRows = [];
        for (let i = 0; i < labels.length; i += 2) {
            const pair = [labels[i]];
            if (labels[i + 1]) pair.push(labels[i + 1]);
            labelRows.push(pair);
        }

        let labelsHTML = '';
        for (const row of labelRows) {
            labelsHTML += '<div class="label-row">';
            for (const label of row) {
                const displayPrice = formatPrice(label.price);
                labelsHTML += `
                    <div class="label">
                        <div class="label-name">${escapeHtml(label.name)}</div>
                        <div class="label-barcode">
                            <svg class="barcode" data-code="${escapeHtml(label.code)}"></svg>
                        </div>
                        <div class="label-footer">
                            <div class="label-code">${escapeHtml(label.code)}</div>
                            <div class="label-price">${displayPrice}</div>
                        </div>
                    </div>
                `;
            }
            labelsHTML += '</div>';
        }

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcode Labels</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
        size: 66mm 21mm;
        margin: 0;
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .label-row {
        display: flex;
        width: 66mm;
        height: 21mm;
        page-break-after: always;
        overflow: hidden;
    }

    .label-row:last-child {
        page-break-after: auto;
    }

    .label {
        width: 33mm;
        height: 21mm;
        padding: 0.3mm 0.5mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
    }

    .label-name {
        font-size: 7pt;
        font-weight: bold;
        text-align: center;
        line-height: 1.15;
        max-height: 6mm;
        overflow: hidden;
        width: 100%;
        word-break: break-word;
    }

    .label-barcode {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 0;
        padding: 0.3mm 0;
    }

    .label-barcode svg {
        width: 100%;
        max-height: 10mm;
    }

    .label-footer {
        text-align: center;
        width: 100%;
        font-weight: bold;
        line-height: 1.15;
    }

    .label-code {
        font-size: 8pt;
        font-weight: bold;
    }

    .label-price {
        font-size: 8pt;
        font-weight: bold;
    }

    /* Screen preview styles */
    @media screen {
        body {
            background: #e5e7eb;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .label-row {
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            border: 1px solid #d1d5db;
        }
    }
</style>
</head>
<body>
${labelsHTML}
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script>
    document.querySelectorAll('.barcode').forEach(function(svg) {
        var code = svg.getAttribute('data-code');
        if (code) {
            try {
                JsBarcode(svg, code, {
                    format: 'CODE128',
                    width: 1,
                    height: 30,
                    displayValue: false,
                    margin: 0
                });
            } catch(e) {
                console.warn('Barcode error for:', code, e);
            }
        }
    });
<\/script>
</body>
</html>`;
    }

    function showPrintOverlay(html) {
        const printOverlay = document.createElement('div');
        printOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:8px 16px;background:#333;';

        const btnPrint = document.createElement('button');
        btnPrint.textContent = 'In';
        btnPrint.style.cssText = 'padding:6px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        const btnClose = document.createElement('button');
        btnClose.textContent = 'Đóng';
        btnClose.style.cssText = 'padding:6px 16px;background:#666;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'flex:1;border:none;background:#e5e7eb;';

        // Write HTML to iframe
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;

        btnPrint.onclick = () => {
            try { iframe.contentWindow.print(); } catch (e) { console.error('Print error:', e); }
        };
        btnClose.onclick = () => { printOverlay.remove(); URL.revokeObjectURL(blobUrl); };
        printOverlay.onclick = (e) => { if (e.target === printOverlay) { printOverlay.remove(); URL.revokeObjectURL(blobUrl); } };

        toolbar.append(btnPrint, btnClose);
        printOverlay.append(toolbar, iframe);
        document.body.appendChild(printOverlay);
    }

    function formatPrice(price) {
        const num = parseInt(price) || 0;
        return num.toLocaleString('de-DE');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    return { open };
})();
