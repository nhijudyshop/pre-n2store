// =====================================================
// MODAL SHORTAGE - INVENTORY TRACKING
// Phase 3: Modal for updating shortage after checking
// =====================================================

let currentShortageShipment = null;

/**
 * Open shortage modal
 */
function openShortageModal(shipment) {
    currentShortageShipment = shipment;

    const modal = document.getElementById('modalShortage');
    const title = document.getElementById('modalShortageTitle');
    const body = document.getElementById('modalShortageBody');

    if (title) {
        title.textContent = `Cap Nhat So Mon Thieu - ${formatDateDisplay(shipment.ngayDiHang)}`;
    }

    if (body) {
        body.innerHTML = renderShortageForm(shipment);
    }

    // Setup save button
    document.getElementById('btnSaveShortage')?.addEventListener('click', saveShortage);

    openModal('modalShortage');

    if (window.lucide) lucide.createIcons();
}

/**
 * Render shortage form
 */
function renderShortageForm(shipment) {
    const invoices = shipment.hoaDon || [];

    if (invoices.length === 0) {
        return '<p>Khong co hoa don nao</p>';
    }

    return `
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>NCC</th>
                    <th>Chi tiet</th>
                    <th class="text-center">Tong mon</th>
                    <th class="text-center">Thieu</th>
                    <th>Ghi chu</th>
                </tr>
            </thead>
            <tbody>
                ${invoices.map((hd, i) => `
                    <tr data-invoice-id="${hd.id}">
                        <td><strong>${hd.sttNCC}</strong></td>
                        <td>
                            ${hd.sanPham?.slice(0, 2).map(p => p.maSP || p.rawText?.split(' ')[1]).join(', ')}
                            ${hd.sanPham?.length > 2 ? '...' : ''}
                        </td>
                        <td class="text-center">${hd.tongMon || 0}</td>
                        <td class="text-center">
                            <input type="number" class="form-input shortage-input"
                                   value="${hd.soMonThieu || ''}"
                                   placeholder="0"
                                   style="width: 80px; text-align: center;">
                        </td>
                        <td>
                            <input type="text" class="form-input shortage-note"
                                   value="${hd.ghiChuThieu || ''}"
                                   placeholder="Ghi chu">
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Save shortage data
 */
async function saveShortage() {
    if (!currentShortageShipment) return;

    try {
        const rows = document.querySelectorAll('#modalShortageBody tbody tr');
        const updates = [];

        rows.forEach(row => {
            const invoiceId = row.dataset.invoiceId;
            const shortage = parseInt(row.querySelector('.shortage-input')?.value) || 0;
            const note = row.querySelector('.shortage-note')?.value || '';

            updates.push({ invoiceId, shortage, note });
        });

        // Update shipment data
        const hoaDon = currentShortageShipment.hoaDon.map(hd => {
            const update = updates.find(u => u.invoiceId === hd.id);
            if (update) {
                return {
                    ...hd,
                    soMonThieu: update.shortage,
                    ghiChuThieu: update.note
                };
            }
            return hd;
        });

        // Calculate total shortage
        const tongMonThieu = hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);

        await updateShipment(currentShortageShipment.id, {
            hoaDon,
            tongMonThieu
        });

        // Refresh data
        await loadShipmentsData();

        closeModal('modalShortage');
        toast.success('Da cap nhat so mon thieu');

    } catch (error) {
        console.error('[SHORTAGE] Error saving:', error);
        toast.error('Khong the luu');
    }
}

console.log('[MODAL] Shortage modal initialized');
