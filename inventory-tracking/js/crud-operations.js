// =====================================================
// CRUD OPERATIONS - INVENTORY TRACKING
// Restructured: dotHang[] nested in NCC documents
// =====================================================

/**
 * Create new shipment (dotHang entries for multiple NCCs)
 * data.hoaDon contains multiple invoice entries, each for a different NCC
 */
async function createShipment(data) {
    console.log('[CRUD] Creating shipment...', data);

    try {
        const now = new Date().toISOString();
        const userName = authManager?.getUserInfo()?.displayName || authManager?.getUserInfo()?.username || 'unknown';
        const ngayDiHang = data.ngayDiHang;

        // Process each invoice (hoaDon) and save to respective NCC document
        for (const invoice of (data.hoaDon || [])) {
            const sttNCC = parseInt(invoice.sttNCC, 10);
            if (!sttNCC) continue;

            // Get or create NCC document
            const ncc = await getOrCreateNCC(sttNCC);

            // Create dotHang entry
            const newDotHang = {
                id: generateId('dot'),
                ngayDiHang: ngayDiHang,
                tenNCC: invoice.tenNCC || '',
                kienHang: data.kienHang || [],  // Shared across all NCCs in this shipment
                tongKien: data.tongKien || 0,
                tongKg: data.tongKg || 0,
                sanPham: invoice.sanPham || [],
                tongTienHD: invoice.tongTienHD || 0,
                tongMon: invoice.tongMon || 0,
                soMonThieu: invoice.soMonThieu || 0,
                ghiChuThieu: invoice.ghiChuThieu || '',
                anhHoaDon: invoice.anhHoaDon || [],
                ghiChu: invoice.ghiChu || '',
                chiPhiHangVe: data.chiPhiHangVe || [],  // Shared
                tongChiPhi: data.tongChiPhi || 0,
                createdAt: now,
                createdBy: userName,
                updatedAt: now,
                updatedBy: userName
            };

            // Update NCC document - push to dotHang array
            await shipmentsRef.doc(ncc.id).update({
                dotHang: firebase.firestore.FieldValue.arrayUnion(newDotHang),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update local state
            const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
            if (nccIndex !== -1) {
                if (!globalState.nccList[nccIndex].dotHang) {
                    globalState.nccList[nccIndex].dotHang = [];
                }
                globalState.nccList[nccIndex].dotHang.push(newDotHang);
            }

            console.log(`[CRUD] Created dotHang for NCC ${sttNCC}:`, newDotHang.id);
        }

        // Log edit history
        await logEditHistory('create', 'shipment', ngayDiHang, null, data);

        // Refresh flattened data
        flattenNCCData();

        window.notificationManager?.success('Đã tạo đợt hàng mới');
        return data;

    } catch (error) {
        console.error('[CRUD] Error creating shipment:', error);
        window.notificationManager?.error('Không thể tạo đợt hàng');
        throw error;
    }
}

/**
 * Update existing shipment/dotHang
 * For the new structure, we update individual dotHang entries
 */
async function updateShipment(id, data) {
    console.log('[CRUD] Updating shipment...', id, data);

    try {
        const now = new Date().toISOString();
        const userName = authManager?.getUserInfo()?.displayName || authManager?.getUserInfo()?.username || 'unknown';

        // Find the shipment in flattened data
        const existingShipment = globalState.shipments.find(s => s.id === id);

        if (!existingShipment) {
            throw new Error('Shipment not found');
        }

        // For each hoaDon in the update, update the corresponding dotHang
        for (const invoice of (data.hoaDon || [])) {
            const sttNCC = parseInt(invoice.sttNCC, 10);
            if (!sttNCC) continue;

            // Find NCC document
            const ncc = globalState.nccList.find(n => n.sttNCC === sttNCC);
            if (!ncc) continue;

            // Find the dotHang entry by id
            const dotHang = [...(ncc.dotHang || [])];
            const dotHangIndex = dotHang.findIndex(d => d.id === invoice.id);

            if (dotHangIndex !== -1) {
                // Update existing dotHang
                dotHang[dotHangIndex] = {
                    ...dotHang[dotHangIndex],
                    ngayDiHang: data.ngayDiHang,
                    tenNCC: invoice.tenNCC || dotHang[dotHangIndex].tenNCC,
                    kienHang: data.kienHang || dotHang[dotHangIndex].kienHang,
                    tongKien: data.tongKien || dotHang[dotHangIndex].tongKien,
                    tongKg: data.tongKg || dotHang[dotHangIndex].tongKg,
                    sanPham: invoice.sanPham || dotHang[dotHangIndex].sanPham,
                    tongTienHD: invoice.tongTienHD || dotHang[dotHangIndex].tongTienHD,
                    tongMon: invoice.tongMon || dotHang[dotHangIndex].tongMon,
                    soMonThieu: invoice.soMonThieu ?? dotHang[dotHangIndex].soMonThieu,
                    ghiChuThieu: invoice.ghiChuThieu ?? dotHang[dotHangIndex].ghiChuThieu,
                    anhHoaDon: invoice.anhHoaDon || dotHang[dotHangIndex].anhHoaDon,
                    ghiChu: invoice.ghiChu ?? dotHang[dotHangIndex].ghiChu,
                    chiPhiHangVe: data.chiPhiHangVe || dotHang[dotHangIndex].chiPhiHangVe,
                    tongChiPhi: data.tongChiPhi || dotHang[dotHangIndex].tongChiPhi,
                    updatedAt: now,
                    updatedBy: userName
                };

                // Update Firestore
                await shipmentsRef.doc(ncc.id).update({
                    dotHang: dotHang,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Update local state
                const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
                if (nccIndex !== -1) {
                    globalState.nccList[nccIndex].dotHang = dotHang;
                }

                console.log(`[CRUD] Updated dotHang for NCC ${sttNCC}:`, invoice.id);
            }
        }

        // Log edit history
        await logEditHistory('update', 'shipment', id, existingShipment, data);

        // Refresh flattened data
        flattenNCCData();

        window.notificationManager?.success('Đã cập nhật đợt hàng');
        return data;

    } catch (error) {
        console.error('[CRUD] Error updating shipment:', error);
        window.notificationManager?.error('Không thể cập nhật đợt hàng');
        throw error;
    }
}

/**
 * Delete shipment - removes all dotHang entries for the given date
 */
async function deleteShipment(id) {
    if (!confirm('Bạn có chắc muốn xóa đợt hàng này?')) {
        return false;
    }

    console.log('[CRUD] Deleting shipment...', id);

    try {
        // Find the shipment in flattened data
        const existingShipment = globalState.shipments.find(s => s.id === id);
        if (!existingShipment) {
            throw new Error('Shipment not found');
        }

        // Get all dotHang IDs in this shipment
        const dotHangIds = (existingShipment.hoaDon || []).map(hd => hd.id);

        // Remove from each NCC document
        for (const ncc of globalState.nccList) {
            const dotHang = (ncc.dotHang || []).filter(d => !dotHangIds.includes(d.id));

            if (dotHang.length !== (ncc.dotHang || []).length) {
                // Some entries were removed, update Firestore
                await shipmentsRef.doc(ncc.id).update({
                    dotHang: dotHang,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Update local state
                const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
                if (nccIndex !== -1) {
                    globalState.nccList[nccIndex].dotHang = dotHang;
                }
            }
        }

        // Log edit history
        await logEditHistory('delete', 'shipment', id, existingShipment, null);

        // Refresh flattened data
        flattenNCCData();

        window.notificationManager?.success('Đã xóa đợt hàng');
        return true;

    } catch (error) {
        console.error('[CRUD] Error deleting shipment:', error);
        window.notificationManager?.error('Không thể xóa đợt hàng');
        throw error;
    }
}

/**
 * Delete a single invoice (dotHang) from shipment
 */
async function deleteInvoiceFromShipment(sttNCC, dotHangId) {
    try {
        const ncc = globalState.nccList.find(n => n.sttNCC === sttNCC);
        if (!ncc) {
            throw new Error('NCC not found');
        }

        const dotHang = (ncc.dotHang || []).filter(d => d.id !== dotHangId);

        await shipmentsRef.doc(ncc.id).update({
            dotHang: dotHang,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
        if (nccIndex !== -1) {
            globalState.nccList[nccIndex].dotHang = dotHang;
        }

        flattenNCCData();
        return true;

    } catch (error) {
        console.error('[CRUD] Error deleting invoice:', error);
        throw error;
    }
}

/**
 * Update shortage information for a dotHang
 */
async function updateDotHangShortage(sttNCC, dotHangId, shortageData) {
    try {
        const ncc = globalState.nccList.find(n => n.sttNCC === sttNCC);
        if (!ncc) {
            throw new Error('NCC not found');
        }

        const dotHang = [...(ncc.dotHang || [])];
        const dotHangIndex = dotHang.findIndex(d => d.id === dotHangId);

        if (dotHangIndex === -1) {
            throw new Error('dotHang not found');
        }

        dotHang[dotHangIndex] = {
            ...dotHang[dotHangIndex],
            soMonThieu: shortageData.soMonThieu || 0,
            ghiChuThieu: shortageData.ghiChuThieu || '',
            updatedAt: new Date().toISOString(),
            updatedBy: authManager?.getUserInfo()?.displayName || authManager?.getUserInfo()?.username || 'unknown'
        };

        await shipmentsRef.doc(ncc.id).update({
            dotHang: dotHang,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
        if (nccIndex !== -1) {
            globalState.nccList[nccIndex].dotHang = dotHang;
        }

        flattenNCCData();
        return true;

    } catch (error) {
        console.error('[CRUD] Error updating shortage:', error);
        throw error;
    }
}

/**
 * Edit shipment (open modal)
 */
function editShipment(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        window.notificationManager?.error('Không tìm thấy đợt hàng');
        return;
    }

    if (typeof openShipmentModal === 'function') {
        openShipmentModal(shipment);
    }
}

/**
 * Update shortage (open modal)
 */
function updateShortage(id) {
    const shipment = globalState.shipments.find(s => s.id === id);
    if (!shipment) {
        window.notificationManager?.error('Không tìm thấy đợt hàng');
        return;
    }

    if (typeof openShortageModal === 'function') {
        openShortageModal(shipment);
    }
}

/**
 * Log edit history
 */
async function logEditHistory(action, type, id, oldData, newData) {
    try {
        if (!editHistoryRef) return;

        await editHistoryRef.add({
            action,
            type,
            targetId: id,
            oldData: oldData || null,
            newData: newData || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userName: authManager?.getUserInfo()?.displayName || authManager?.getUserInfo()?.username || 'unknown'
        });
    } catch (error) {
        console.error('[CRUD] Error logging edit history:', error);
    }
}

console.log('[CRUD] CRUD operations initialized');
