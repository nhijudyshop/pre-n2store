// =====================================================
// ORDER BOOKING CRUD OPERATIONS
// Restructured: datHang[] nested in NCC documents
// =====================================================

/**
 * Load all order bookings from NCC documents
 * Uses getAllDatHang() from data-loader.js
 */
async function loadOrderBookings() {
    try {
        console.log('[ORDER-BOOKING-CRUD] Loading order bookings from NCC data...');

        // Load NCC data if not already loaded
        if (globalState.nccList.length === 0) {
            await loadNCCData();
        }

        // Get flattened datHang from all NCCs
        const bookings = getAllDatHang();

        // Check for differences with linked shipments
        bookings.forEach(booking => {
            if (booking.linkedDotHangId) {
                booking.hasDifference = checkBookingDifference(booking);
            }
        });

        globalState.orderBookings = bookings;
        globalState.filteredOrderBookings = [...bookings];

        console.log(`[ORDER-BOOKING-CRUD] Loaded ${bookings.length} order bookings`);

        return bookings;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error loading order bookings:', error);
        toast.error('Lỗi khi tải dữ liệu đơn đặt hàng');
        return [];
    }
}

/**
 * Create new order booking (datHang) in NCC document
 */
async function createOrderBooking(data) {
    try {
        const sttNCC = parseInt(data.sttNCC, 10);
        if (!sttNCC) {
            throw new Error('sttNCC is required');
        }

        const auth = authManager?.getAuthState();
        const username = auth?.userType?.split('-')[0] || 'unknown';

        // Get or create NCC document
        const ncc = await getOrCreateNCC(sttNCC);

        // Create new booking entry
        const newBooking = {
            id: generateId('booking'),
            ngayDatHang: data.ngayDatHang,
            tenNCC: data.tenNCC || '',
            trangThai: data.trangThai || 'pending',
            sanPham: data.sanPham || [],
            tongTienHD: data.tongTienHD || 0,
            tongMon: data.tongMon || 0,
            anhHoaDon: data.anhHoaDon || [],
            ghiChu: data.ghiChu || '',
            linkedDotHangId: null,
            createdAt: new Date().toISOString(),
            createdBy: username,
            updatedAt: new Date().toISOString(),
            updatedBy: username
        };

        // Update NCC document - push to datHang array
        await shipmentsRef.doc(ncc.id).update({
            datHang: firebase.firestore.FieldValue.arrayUnion(newBooking),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        const nccIndex = globalState.nccList.findIndex(n => n.id === ncc.id);
        if (nccIndex !== -1) {
            if (!globalState.nccList[nccIndex].datHang) {
                globalState.nccList[nccIndex].datHang = [];
            }
            globalState.nccList[nccIndex].datHang.push(newBooking);
        }

        // Refresh flattened data
        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Created order booking:', newBooking.id);

        return { ...newBooking, sttNCC, nccDocId: ncc.id };
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error creating order booking:', error);
        throw error;
    }
}

/**
 * Update existing order booking in NCC document
 */
async function updateOrderBooking(bookingId, data) {
    try {
        const auth = authManager?.getAuthState();
        const username = auth?.userType?.split('-')[0] || 'unknown';

        // Find booking in flattened list to get sttNCC and nccDocId
        const existingBooking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!existingBooking) {
            throw new Error('Booking not found');
        }

        const nccDocId = existingBooking.nccDocId;
        const sttNCC = existingBooking.sttNCC;

        // Find NCC document
        const ncc = globalState.nccList.find(n => n.id === nccDocId);
        if (!ncc) {
            throw new Error('NCC not found');
        }

        // Find and update the booking in datHang array
        const datHang = [...(ncc.datHang || [])];
        const bookingIndex = datHang.findIndex(b => b.id === bookingId);
        if (bookingIndex === -1) {
            throw new Error('Booking not found in NCC');
        }

        // Update booking data
        datHang[bookingIndex] = {
            ...datHang[bookingIndex],
            ...data,
            updatedAt: new Date().toISOString(),
            updatedBy: username
        };

        // Remove undefined fields
        Object.keys(datHang[bookingIndex]).forEach(key => {
            if (datHang[bookingIndex][key] === undefined) {
                delete datHang[bookingIndex][key];
            }
        });

        // Update Firestore
        await shipmentsRef.doc(nccDocId).update({
            datHang: datHang,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        const nccIndex = globalState.nccList.findIndex(n => n.id === nccDocId);
        if (nccIndex !== -1) {
            globalState.nccList[nccIndex].datHang = datHang;
        }

        // Refresh flattened data
        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Updated order booking:', bookingId);

        return { ...datHang[bookingIndex], sttNCC, nccDocId };
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error updating order booking:', error);
        throw error;
    }
}

/**
 * Delete order booking from NCC document
 */
async function deleteOrderBookingFromDB(bookingId) {
    try {
        // Find booking in flattened list
        const existingBooking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!existingBooking) {
            throw new Error('Booking not found');
        }

        const nccDocId = existingBooking.nccDocId;

        // Find NCC document
        const ncc = globalState.nccList.find(n => n.id === nccDocId);
        if (!ncc) {
            throw new Error('NCC not found');
        }

        // Remove booking from datHang array
        const datHang = (ncc.datHang || []).filter(b => b.id !== bookingId);

        // Update Firestore
        await shipmentsRef.doc(nccDocId).update({
            datHang: datHang,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update local state
        const nccIndex = globalState.nccList.findIndex(n => n.id === nccDocId);
        if (nccIndex !== -1) {
            globalState.nccList[nccIndex].datHang = datHang;
        }

        // Refresh flattened data
        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Deleted order booking:', bookingId);

        return true;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error deleting order booking:', error);
        throw error;
    }
}

/**
 * Edit order booking - open modal with data
 */
function editOrderBooking(bookingId) {
    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) {
        toast.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    if (!permissionHelper?.can('edit_orderBooking')) {
        toast.error('Bạn không có quyền sửa đơn đặt hàng');
        return;
    }

    // Open modal with booking data
    if (window.openOrderBookingModal) {
        openOrderBookingModal(booking);
    }
}

/**
 * Delete order booking with confirmation
 */
async function deleteOrderBooking(bookingId) {
    if (!permissionHelper?.can('delete_orderBooking')) {
        toast.error('Bạn không có quyền xóa đơn đặt hàng');
        return;
    }

    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) {
        toast.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    const confirmed = confirm(`Bạn có chắc muốn xóa đơn đặt hàng NCC ${booking.sttNCC}?`);
    if (!confirmed) return;

    try {
        await deleteOrderBookingFromDB(bookingId);

        // Re-render
        renderOrderBookings(globalState.filteredOrderBookings);

        toast.success('Đã xóa đơn đặt hàng');
    } catch (error) {
        toast.error('Lỗi khi xóa đơn đặt hàng');
    }
}

/**
 * Upload images for order booking
 * Uses server endpoint to bypass CORS
 */
async function uploadBookingImages(files) {
    const uploadedUrls = [];

    for (const file of files) {
        try {
            // Validate file
            if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
                toast.warning(`Bỏ qua ${file.name} - định dạng không hỗ trợ`);
                continue;
            }

            if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
                toast.warning(`Bỏ qua ${file.name} - vượt quá 5MB`);
                continue;
            }

            // Generate unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const ext = file.name.split('.').pop();
            const filename = `order_booking_${timestamp}_${randomStr}.${ext}`;

            // Convert file to base64
            const base64 = await fileToBase64(file);

            // Upload via dedicated upload endpoint (uses shared Firebase Storage service)
            const serverUrl = 'https://n2shop.onrender.com/api/upload/image';

            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: base64,
                    fileName: filename,
                    folderPath: 'order_bookings',
                    mimeType: file.type
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            console.log('[ORDER-BOOKING-CRUD] Image uploaded via server:', result.url);
            uploadedUrls.push(result.url);
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error(`Lỗi upload ${file.name}`);
        }
    }

    return uploadedUrls;
}

/**
 * Convert File to base64 string (helper for uploadBookingImages)
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Get NCC list from order bookings for filter
 */
function getBookingNCCList() {
    const nccSet = new Set();
    globalState.orderBookings.forEach(booking => {
        if (booking.sttNCC) {
            nccSet.add(String(booking.sttNCC));
        }
    });
    return Array.from(nccSet).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Populate NCC filter dropdown for bookings
 */
function populateBookingNCCFilter() {
    const select = document.getElementById('filterBookingNCC');
    if (!select) return;

    const nccList = getBookingNCCList();
    const currentValue = select.value;

    // Keep first option
    select.innerHTML = '<option value="all">Tất cả NCC</option>';

    nccList.forEach(ncc => {
        const nccDoc = getNCCById(parseInt(ncc));
        const tenNCC = getNCCDisplayName(nccDoc);
        const option = document.createElement('option');
        option.value = ncc;
        option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
        select.appendChild(option);
    });

    // Restore selection
    if (currentValue && nccList.includes(currentValue)) {
        select.value = currentValue;
    }
}

/**
 * Get suggested tenNCC from existing NCC data
 */
function getSuggestedTenNCC(sttNCC) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return '';
    return getNCCDisplayName(ncc);
}

console.log('[ORDER-BOOKING-CRUD] Loaded successfully');
