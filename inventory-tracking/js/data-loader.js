// =====================================================
// DATA LOADER - INVENTORY TRACKING
// Restructured: sttNCC as primary key
// =====================================================

/**
 * Load all NCC documents from Firestore
 * Each NCC document contains datHang[] and dotHang[]
 */
async function loadNCCData() {
    console.log('[DATA] Loading NCC data...');

    try {
        globalState.isLoading = true;

        if (!shipmentsRef) {
            console.warn('[DATA] Firestore not initialized');
            return;
        }

        const snapshot = await shipmentsRef.get();

        globalState.nccList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by sttNCC
        globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));
        globalState.filteredNCCList = [...globalState.nccList];

        console.log(`[DATA] Loaded ${globalState.nccList.length} NCC documents`);

        // Flatten data for backward compatibility
        flattenNCCData();

        // Update NCC filter options
        updateNCCFilterOptions();

        // Apply filters and render
        if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
        }

    } catch (error) {
        console.error('[DATA] Error loading NCC data:', error);
        throw error;
    } finally {
        globalState.isLoading = false;
    }
}

/**
 * Flatten NCC data into shipments and orderBookings for backward compatibility
 */
function flattenNCCData() {
    // Flatten orderBookings (datHang) from all NCCs
    globalState.orderBookings = getAllDatHang();
    globalState.filteredOrderBookings = [...globalState.orderBookings];

    // Flatten shipments (dotHang) from all NCCs - restructure to old format
    globalState.shipments = getAllDotHangAsShipments();
    globalState.filteredShipments = [...globalState.shipments];

    console.log(`[DATA] Flattened: ${globalState.orderBookings.length} datHang, ${globalState.shipments.length} shipments`);
}

/**
 * Legacy function for backward compatibility
 */
async function loadShipmentsData() {
    console.log('[DATA] Loading shipments (via loadNCCData)...');
    await loadNCCData();
}

/**
 * Get NCC document by sttNCC
 */
function getNCCById(sttNCC) {
    return globalState.nccList.find(ncc => ncc.sttNCC === sttNCC);
}

/**
 * Get NCC document by document ID (ncc_1, ncc_2, etc.)
 */
function getNCCByDocId(docId) {
    return globalState.nccList.find(ncc => ncc.id === docId);
}

/**
 * Get or create NCC document
 */
async function getOrCreateNCC(sttNCC) {
    const docId = `ncc_${sttNCC}`;
    const docRef = shipmentsRef.doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
        const newData = {
            sttNCC: sttNCC,
            datHang: [],
            dotHang: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await docRef.set(newData);

        // Add to local state
        const newNCC = { id: docId, ...newData };
        globalState.nccList.push(newNCC);
        globalState.nccList.sort((a, b) => (a.sttNCC || 0) - (b.sttNCC || 0));

        console.log(`[DATA] Created new NCC document: ${docId}`);
        return newNCC;
    }

    return { id: doc.id, ...doc.data() };
}

/**
 * Get all datHang (order bookings) flattened from all NCCs
 */
function getAllDatHang() {
    const all = [];
    globalState.nccList.forEach(ncc => {
        (ncc.datHang || []).forEach(dh => {
            all.push({
                ...dh,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                // For backward compatibility, use booking id as main id if no separate id
                id: dh.id || `${ncc.id}_dh_${dh.ngayDatHang}`
            });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDatHang) - new Date(a.ngayDatHang));
}

/**
 * Get all dotHang (shipments) flattened from all NCCs
 * Returns in format compatible with old shipment structure
 */
function getAllDotHang() {
    const all = [];
    globalState.nccList.forEach(ncc => {
        (ncc.dotHang || []).forEach(dot => {
            all.push({
                ...dot,
                sttNCC: ncc.sttNCC,
                nccDocId: ncc.id,
                id: dot.id || `${ncc.id}_dot_${dot.ngayDiHang}`
            });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));
}

/**
 * Normalize product data to new structure with backward compatibility
 * Converts old product format to new format with moTa, mauSac array, tongSoLuong
 */
function normalizeProductData(product) {
    if (!product) return product;

    // Already has new structure (has mauSac field)
    if (product.mauSac !== undefined) {
        return {
            ...product,
            // Ensure tongSoLuong is calculated if missing
            tongSoLuong: product.tongSoLuong ||
                        (product.mauSac && product.mauSac.length > 0
                            ? product.mauSac.reduce((sum, c) => sum + (c.soLuong || 0), 0)
                            : product.soLuong || 0)
        };
    }

    // Migrate old data to new structure
    return {
        maSP: product.maSP || '',
        moTa: product.tenHang || '',           // Map old tenHang to moTa
        mauSac: [],                            // Empty array for old data
        tongSoLuong: product.soLuong || 0,     // Use old soLuong
        soMau: product.soMau || 0,             // Keep legacy field
        soLuong: product.soLuong || 0,         // Keep for backward compatibility
        giaDonVi: product.giaDonVi || 0,
        thanhTien: product.thanhTien || 0,
        rawText: product.rawText || '',
        dataSource: 'legacy',                  // Mark as migrated data
        aiExtracted: product.aiExtracted || false
    };
}

/**
 * Get all dotHang restructured as shipments (grouped by ngayDiHang)
 * This maintains backward compatibility with the old structure
 */
function getAllDotHangAsShipments() {
    const allDotHang = getAllDotHang();

    // Group by ngayDiHang to create shipment-like structure
    const byDate = {};
    allDotHang.forEach(dot => {
        const date = dot.ngayDiHang;
        if (!byDate[date]) {
            byDate[date] = {
                id: `ship_${date}`,
                ngayDiHang: date,
                kienHang: [],
                hoaDon: [],
                tongKien: 0,
                tongKg: 0,
                tongTienHoaDon: 0,
                tongSoMon: 0,
                tongMonThieu: 0,
                chiPhiHangVe: [],
                tongChiPhi: 0
            };
        }

        // Add as hoaDon entry with normalized products
        byDate[date].hoaDon.push({
            id: dot.id,
            sttNCC: dot.sttNCC,
            tenNCC: dot.tenNCC,
            sanPham: (dot.sanPham || []).map(normalizeProductData),  // Normalize products
            tongTienHD: dot.tongTienHD || 0,
            tongMon: dot.tongMon || 0,
            soMonThieu: dot.soMonThieu || 0,
            ghiChuThieu: dot.ghiChuThieu || '',
            anhHoaDon: dot.anhHoaDon || [],
            ghiChu: dot.ghiChu || ''
        });

        // Merge kienHang if present
        if (dot.kienHang && dot.kienHang.length > 0) {
            byDate[date].kienHang.push(...dot.kienHang);
        }

        // Merge chiPhiHangVe if present
        if (dot.chiPhiHangVe && dot.chiPhiHangVe.length > 0) {
            byDate[date].chiPhiHangVe.push(...dot.chiPhiHangVe);
        }
    });

    // Calculate totals for each date
    const shipments = Object.values(byDate).map(ship => {
        ship.tongKien = ship.kienHang.length;
        ship.tongKg = ship.kienHang.reduce((sum, k) => sum + (k.soKg || 0), 0);
        ship.tongTienHoaDon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongTienHD || 0), 0);
        ship.tongSoMon = ship.hoaDon.reduce((sum, hd) => sum + (hd.tongMon || 0), 0);
        ship.tongMonThieu = ship.hoaDon.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
        ship.tongChiPhi = ship.chiPhiHangVe.reduce((sum, c) => sum + (c.soTien || 0), 0);

        // Re-number kienHang
        ship.kienHang = ship.kienHang.map((k, idx) => ({ ...k, stt: idx + 1 }));

        return ship;
    });

    return shipments.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));
}

/**
 * Find specific datHang in an NCC
 */
function findDatHang(sttNCC, datHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.datHang || []).find(dh => dh.id === datHangId);
}

/**
 * Find specific dotHang in an NCC
 */
function findDotHang(sttNCC, dotHangId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return null;
    return (ncc.dotHang || []).find(dot => dot.id === dotHangId);
}

/**
 * Load prepayments data
 */
async function loadPrepaymentsData() {
    console.log('[DATA] Loading prepayments...');

    try {
        if (!prepaymentsRef) return;

        const snapshot = await prepaymentsRef
            .orderBy('ngay', 'desc')
            .get();

        globalState.prepayments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.prepayments.length} prepayments`);

    } catch (error) {
        console.error('[DATA] Error loading prepayments:', error);
    }
}

/**
 * Load other expenses data
 */
async function loadOtherExpensesData() {
    console.log('[DATA] Loading other expenses...');

    try {
        if (!otherExpensesRef) return;

        const snapshot = await otherExpensesRef
            .orderBy('ngay', 'desc')
            .get();

        globalState.otherExpenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[DATA] Loaded ${globalState.otherExpenses.length} other expenses`);

    } catch (error) {
        console.error('[DATA] Error loading other expenses:', error);
    }
}

/**
 * Update NCC filter dropdown options
 */
function updateNCCFilterOptions() {
    const filterNCC = document.getElementById('filterNCC');
    const filterBookingNCC = document.getElementById('filterBookingNCC');

    // Get unique NCCs from nccList
    const nccs = globalState.nccList
        .map(ncc => ncc.sttNCC)
        .filter(Boolean)
        .sort((a, b) => a - b);

    // Update main filter
    if (filterNCC) {
        const currentValue = filterNCC.value;
        filterNCC.innerHTML = '<option value="all">Tất cả</option>';
        nccs.forEach(ncc => {
            const nccDoc = getNCCById(ncc);
            const tenNCC = getNCCDisplayName(nccDoc);
            const option = document.createElement('option');
            option.value = ncc;
            option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
            filterNCC.appendChild(option);
        });
        if (currentValue && nccs.includes(parseInt(currentValue))) {
            filterNCC.value = currentValue;
        }
    }

    // Update booking filter
    if (filterBookingNCC) {
        const currentValue = filterBookingNCC.value;
        filterBookingNCC.innerHTML = '<option value="all">Tất cả NCC</option>';
        nccs.forEach(ncc => {
            const nccDoc = getNCCById(ncc);
            const tenNCC = getNCCDisplayName(nccDoc);
            const option = document.createElement('option');
            option.value = ncc;
            option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
            filterBookingNCC.appendChild(option);
        });
        if (currentValue && nccs.includes(parseInt(currentValue))) {
            filterBookingNCC.value = currentValue;
        }
    }
}

/**
 * Get display name for NCC from most recent entries
 */
function getNCCDisplayName(ncc) {
    if (!ncc) return '';

    // Try to get tenNCC from most recent datHang or dotHang
    const lastDatHang = (ncc.datHang || []).slice(-1)[0];
    const lastDotHang = (ncc.dotHang || []).slice(-1)[0];

    return lastDatHang?.tenNCC || lastDotHang?.tenNCC || '';
}

/**
 * Generate unique ID
 */
function generateId(prefix = 'id') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}

console.log('[DATA] Data loader initialized');
