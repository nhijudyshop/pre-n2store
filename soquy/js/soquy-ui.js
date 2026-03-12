// =====================================================
// SỔ QUỸ - UI RENDERING & INTERACTIONS
// File: soquy-ui.js
// =====================================================

const SoquyUI = (function () {
    const config = window.SoquyConfig;
    const state = window.SoquyState;
    const db = window.SoquyDatabase;
    const els = window.SoquyElements;

    // Helper: check if type is a payment type (CN or KD)
    function isPaymentType(type) {
        return type === config.VOUCHER_TYPES.PAYMENT_CN || type === config.VOUCHER_TYPES.PAYMENT_KD;
    }

    // Throttle click utility - prevents rapid/double clicks
    const _uiClickTimestamps = {};
    let _uiClickId = 0;
    function throttleClick(fn, delay = 350) {
        const id = ++_uiClickId;
        return function (...args) {
            const now = Date.now();
            if (now - (_uiClickTimestamps[id] || 0) < delay) return;
            _uiClickTimestamps[id] = now;
            return fn.apply(this, args);
        };
    }

    // Modal open timestamp - overlay close handlers ignore clicks too soon after opening
    let _modalOpenedAt = 0;
    function markModalOpened() {
        _modalOpenedAt = Date.now();
    }
    function isModalJustOpened(grace = 400) {
        return Date.now() - _modalOpenedAt < grace;
    }

    // Protect <select> elements from double-click toggling
    function protectSelectElements(container) {
        if (!container) return;
        const selects = container.querySelectorAll('select');
        selects.forEach(sel => {
            if (sel._dblClickProtected) return;
            sel._dblClickProtected = true;
            let lastMouseDown = 0;
            sel.addEventListener('mousedown', (e) => {
                const now = Date.now();
                if (now - lastMouseDown < 350) {
                    e.preventDefault();
                    return;
                }
                lastMouseDown = now;
            });
        });
    }

    // =====================================================
    // IMAGE UPLOAD HANDLER
    // =====================================================

    // Module-level image handler references
    let receiptImageHandler = null;
    let paymentImageHandler = null;

    const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB (before compression)

    /** Detect mobile device */
    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
    }

    // Mobile: nén mạnh hơn (1024px, quality 0.5) để upload nhanh
    const COMPRESS_MAX_WIDTH = isMobileDevice() ? 1024 : 1920;
    const COMPRESS_QUALITY = isMobileDevice() ? 0.5 : 0.7;

    /**
     * Compress image using Canvas API
     * @param {File|Blob} file - Original image file
     * @param {number} maxWidth - Max width in px
     * @param {number} quality - JPEG quality 0-1
     * @returns {Promise<Blob>} - Compressed image as Blob
     */
    function compressImage(file, maxWidth, quality) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            var url = URL.createObjectURL(file);

            img.onload = function () {
                URL.revokeObjectURL(url);

                var width = img.width;
                var height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                var canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    function (blob) {
                        if (blob) {
                            console.log('[SoquyUI] Compressed image: ' +
                                (file.size / 1024 / 1024).toFixed(2) + 'MB → ' +
                                (blob.size / 1024 / 1024).toFixed(2) + 'MB');
                            resolve(blob);
                        } else {
                            reject(new Error('Cannot compress image'));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Cannot read image file'));
            };

            img.src = url;
        });
    }

    // =====================================================
    // UPLOAD PROGRESS OVERLAY UI
    // =====================================================

    function showUploadProgressOverlay(container, percent) {
        if (!container) return;
        var bar = container.querySelector('.upload-progress-overlay');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'upload-progress-overlay';
            bar.innerHTML = '<div class="upload-progress-bar"></div><span class="upload-progress-text">0%</span>';
            container.style.position = 'relative';
            container.appendChild(bar);
        }
        var fill = bar.querySelector('.upload-progress-bar');
        var text = bar.querySelector('.upload-progress-text');
        if (fill) fill.style.width = percent + '%';
        if (text) text.textContent = Math.round(percent) + '%';
    }

    function showUploadDoneOverlay(container) {
        if (!container) return;
        var bar = container.querySelector('.upload-progress-overlay');
        if (bar) {
            bar.innerHTML = '<span class="upload-progress-text upload-done">✓ Đã tải lên</span>';
            setTimeout(function () { if (bar.parentNode) bar.remove(); }, 2000);
        }
    }

    function showUploadErrorOverlay(container) {
        if (!container) return;
        var bar = container.querySelector('.upload-progress-overlay');
        if (bar) {
            bar.innerHTML = '<span class="upload-progress-text upload-error">✗ Lỗi tải lên</span>';
        }
    }

    function removeUploadProgressOverlay(container) {
        if (!container) return;
        var bar = container.querySelector('.upload-progress-overlay');
        if (bar) bar.remove();
    }

    function initImageUpload(containerEl, fileInputEl, placeholderEl, previewEl, previewImgEl, removeBtnEl) {
        if (!containerEl || !fileInputEl || !placeholderEl || !previewEl || !previewImgEl || !removeBtnEl) {
            console.warn('[SoquyUI] initImageUpload: missing DOM elements');
            return {
                getImageData: function () { return Promise.resolve(''); },
                getUploadState: function () { return 'idle'; },
                setExistingImageUrl: function () {},
                clearImage: function () {}
            };
        }

        // Background upload state
        var uploadState = 'idle'; // 'idle' | 'uploading' | 'done' | 'error'
        var uploadedUrl = '';
        var uploadPromise = null;
        var currentUploadTask = null;
        var lastBlob = null; // Store blob for fallback direct upload

        function generateSoquyFileName() {
            return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.jpg';
        }

        function startBackgroundUpload(blob) {
            cancelUpload();
            uploadState = 'uploading';
            lastBlob = blob; // Store for fallback

            console.log('[SoquyUI] Eager upload started. Blob size:', (blob.size / 1024).toFixed(0) + 'KB');
            showNotification('[Debug] Eager upload bắt đầu (' + (blob.size / 1024).toFixed(0) + 'KB)', 'info');

            // Use firebase.storage().ref() directly — same pattern as nhanhang (proven working)
            var sRef;
            try {
                sRef = firebase.storage().ref();
            } catch (e) {
                showNotification('[Debug] firebase.storage().ref() EXCEPTION: ' + e.message, 'error');
                uploadState = 'error';
                return Promise.reject(e);
            }

            var imageName = generateSoquyFileName();
            // Use nhanhang/photos/ path — proven working with Firebase Storage rules
            var imageRef = sRef.child('nhanhang/photos/' + imageName);

            showNotification('[Debug] Upload path: nhanhang/photos/' + imageName, 'info');

            // Show progress bar on container
            showUploadProgressOverlay(containerEl, 0);

            var newMetadata = {
                cacheControl: 'public,max-age=31536000'
            };

            uploadPromise = new Promise(function (resolve, reject) {
                try {
                    currentUploadTask = imageRef.put(blob, newMetadata);
                } catch (putError) {
                    showNotification('[Debug] put() EXCEPTION: ' + putError.message, 'error');
                    uploadState = 'error';
                    showUploadErrorOverlay(containerEl);
                    reject(putError);
                    return;
                }

                currentUploadTask.on('state_changed',
                    function (snapshot) {
                        var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        showUploadProgressOverlay(containerEl, progress);
                    },
                    function (error) {
                        if (error.code === 'storage/canceled') {
                            removeUploadProgressOverlay(containerEl);
                            return;
                        }
                        uploadState = 'error';
                        uploadedUrl = '';
                        showUploadErrorOverlay(containerEl);
                        showNotification('[Debug] Upload LỖI: code=' + (error.code || 'none') + ' msg=' + error.message, 'error');
                        reject(error);
                    },
                    function () {
                        currentUploadTask.snapshot.ref.getDownloadURL()
                            .then(function (downloadURL) {
                                uploadState = 'done';
                                uploadedUrl = downloadURL;
                                showUploadDoneOverlay(containerEl);
                                showNotification('[Debug] Eager upload XONG!', 'success');
                                resolve(downloadURL);
                            })
                            .catch(function (error) {
                                uploadState = 'error';
                                showUploadErrorOverlay(containerEl);
                                showNotification('[Debug] getURL LỖI: ' + error.message, 'error');
                                reject(error);
                            });
                    }
                );
            });

            return uploadPromise;
        }

        function cancelUpload() {
            if (currentUploadTask) {
                currentUploadTask.cancel();
                currentUploadTask = null;
            }
            uploadState = 'idle';
            uploadedUrl = '';
            uploadPromise = null;
            lastBlob = null;
            removeUploadProgressOverlay(containerEl);
        }

        // Make container focusable so paste events work on it
        containerEl.setAttribute('tabindex', '0');

        // Auto-focus container on hover so Ctrl+V works without clicking first
        containerEl.addEventListener('mouseenter', function () {
            var active = document.activeElement;
            var isTyping = active && (active.tagName === 'INPUT' && active.type === 'text' || active.tagName === 'TEXTAREA');
            if (!isTyping) {
                containerEl.focus();
            }
        });

        function showPreview(src) {
            previewImgEl.src = src;
            placeholderEl.style.display = 'none';
            previewEl.style.display = '';
        }

        function clearImage() {
            cancelUpload();
            previewImgEl.src = '';
            previewEl.style.display = 'none';
            placeholderEl.style.display = '';
            fileInputEl.value = '';
        }

        async function getImageData() {
            showNotification('[Debug] getImageData: status=' + uploadState, 'info');
            if (uploadState === 'idle') return '';
            if (uploadState === 'done') {
                showNotification('[Debug] Dùng eager result ✓', 'success');
                return uploadedUrl;
            }
            if (uploadState === 'uploading' && uploadPromise) {
                showNotification('[Debug] Đang chờ eager upload...', 'info');
                try {
                    var url = await uploadPromise;
                    showNotification('[Debug] Eager xong sau khi chờ ✓', 'success');
                    return url;
                } catch (err) {
                    console.error('[SoquyUI] Upload failed while waiting:', err);
                    showNotification('[Debug] Eager lỗi khi chờ, thử fallback...', 'error');
                    // Fall through to fallback
                }
            }

            // Fallback: direct upload if eager failed but we still have the blob
            if (lastBlob) {
                showNotification('[Debug] Fallback direct upload...', 'info');
                try {
                    var sRef = firebase.storage().ref();
                    var imageName = generateSoquyFileName();
                    var imageRef = sRef.child('nhanhang/photos/' + imageName);
                    var snapshot = await imageRef.put(lastBlob, { cacheControl: 'public,max-age=31536000' });
                    var downloadURL = await snapshot.ref.getDownloadURL();
                    uploadState = 'done';
                    uploadedUrl = downloadURL;
                    showNotification('[Debug] Fallback upload XONG ✓', 'success');
                    return downloadURL;
                } catch (fallbackErr) {
                    showNotification('[Debug] Fallback lỗi: code=' + (fallbackErr.code || 'none') + ' msg=' + fallbackErr.message, 'error');
                    return '';
                }
            }

            showNotification('[Debug] Không có blob để fallback, status=' + uploadState, 'error');
            return '';
        }

        function getUploadState() {
            return uploadState;
        }

        function setExistingImageUrl(url) {
            if (!url) return;
            cancelUpload();
            uploadState = 'done';
            uploadedUrl = url;
            showPreview(url);
        }

        function handleImageFile(file) {
            if (!file.type.startsWith('image/')) {
                return;
            }
            if (file.size > MAX_IMAGE_SIZE) {
                if (typeof SoquyUI !== 'undefined' && SoquyUI.showNotification) {
                    SoquyUI.showNotification('Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 15MB', 'error');
                }
                return;
            }
            compressImage(file, COMPRESS_MAX_WIDTH, COMPRESS_QUALITY)
                .then(function (blob) {
                    showPreview(URL.createObjectURL(blob));
                    startBackgroundUpload(blob).catch(function (err) {
                        console.warn('[SoquyUI] Background upload failed (will retry on save):', err.message);
                    });
                })
                .catch(function (err) {
                    console.error('[SoquyUI] Image compression error:', err);
                    showPreview(URL.createObjectURL(file));
                    startBackgroundUpload(file).catch(function (err2) {
                        console.warn('[SoquyUI] Background upload fallback failed:', err2.message);
                    });
                });
        }

        // Click container → trigger file input
        containerEl.addEventListener('click', function (e) {
            if (e.target === removeBtnEl || removeBtnEl.contains(e.target)) {
                return;
            }
            fileInputEl.click();
        });

        // File input change → handle selected file
        fileInputEl.addEventListener('change', function () {
            var file = fileInputEl.files && fileInputEl.files[0];
            if (file) {
                handleImageFile(file);
            }
        });

        // Paste event (Ctrl+V) on container
        containerEl.addEventListener('paste', function (e) {
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image/') === 0) {
                    var file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        handleImageFile(file);
                    }
                    return;
                }
            }
        });

        // Remove button → clear image
        removeBtnEl.addEventListener('click', function (e) {
            e.stopPropagation();
            clearImage();
        });

        return {
            getImageData: getImageData,
            getUploadState: getUploadState,
            setExistingImageUrl: setExistingImageUrl,
            clearImage: clearImage
        };
    }

    // =====================================================
    // TABLE RENDERING (Dynamic Columns)
    // =====================================================

    function getVisibleColumns() {
        return config.COLUMN_DEFINITIONS.filter(col => state.columnVisibility[col.key]);
    }

    function getCellValue(voucher, colKey) {
        const isPayment = isPaymentType(voucher.type);
        switch (colKey) {
            case 'code':
                return null; // Special rendering (link)
            case 'voucherDateTime':
                return escapeHtml(db.formatVoucherDateTime(voucher.voucherDateTime));
            case 'createdAt':
                return voucher.createdAt ? escapeHtml(db.formatVoucherDateTime(voucher.createdAt)) : '';
            case 'createdBy':
                return escapeHtml(voucher.createdBy || '');
            case 'collector':
                return escapeHtml(voucher.collector || '');
            case 'branch':
                return escapeHtml(voucher.branch || '');
            case 'category': {
                const srcCode = voucher.sourceCode || voucher.source || '';
                const cat = voucher.category || '';
                if (srcCode && cat && voucher.type !== 'payment_cn') {
                    return escapeHtml(`${srcCode} ${cat}`);
                }
                return escapeHtml(cat);
            }
            case 'accountName':
                return escapeHtml(voucher.accountName || '');
            case 'accountNumber':
                return escapeHtml(voucher.accountNumber || '');
            case 'personCode':
                return escapeHtml(voucher.personCode || '');
            case 'personName':
                return escapeHtml(voucher.personName || '');
            case 'phone':
                return escapeHtml(voucher.phone || '');
            case 'address':
                return escapeHtml(voucher.address || '');
            case 'amount':
                return null; // Special rendering (colored)
            case 'transferContent':
                return escapeHtml(voucher.transferContent || '');
            case 'note':
                return escapeHtml(voucher.note || '');
            case 'source':
                return escapeHtml(db.getSourceLabel(voucher.sourceCode || voucher.source) || '');
            case 'fundType':
                return escapeHtml(config.FUND_TYPE_LABELS[voucher.fundType] || voucher.fundType || '');
            case 'status':
                return voucher.status === config.VOUCHER_STATUS.CANCELLED
                    ? '<span class="badge-cancelled">Đã hủy</span>'
                    : '<span class="badge-paid">Đã thanh toán</span>';
            case 'image':
                return null; // Special rendering (thumbnail)
            default:
                return escapeHtml(voucher[colKey] || '');
        }
    }

    function renderTableHeader() {
        const thead = document.querySelector('.cashbook-table thead tr');
        if (!thead) return;

        const visibleCols = getVisibleColumns();
        let html = `<th style="width: 40px;"><input type="checkbox" id="selectAllCheckbox"></th>`;
        html += `<th style="width: 40px;"><i data-lucide="star"></i></th>`;

        visibleCols.forEach(col => {
            const align = col.key === 'amount' ? ' style="text-align: right;"' : '';
            html += `<th${align}>${escapeHtml(col.label)}</th>`;
        });

        thead.innerHTML = html;

        // Re-bind select all
        const newSelectAll = document.getElementById('selectAllCheckbox');
        if (newSelectAll) {
            newSelectAll.addEventListener('change', (e) => {
                document.querySelectorAll('.voucher-checkbox').forEach(cb => cb.checked = e.target.checked);
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderTable() {
        if (!els.tableBody) return;

        const visibleCols = getVisibleColumns();
        const totalCols = visibleCols.length + 2; // +2 for checkbox and star

        const start = (state.currentPage - 1) * state.pageSize;
        const end = start + state.pageSize;
        state.displayedVouchers = state.filteredVouchers.slice(start, end);

        const mobileContainer = document.getElementById('mobileVoucherCards');

        if (state.displayedVouchers.length === 0) {
            els.tableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="${totalCols}" style="text-align: center; padding: 40px; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 12px;">
                            <i data-lucide="inbox" style="width: 48px; height: 48px;"></i>
                        </div>
                        <div>Không có dữ liệu phiếu thu chi</div>
                    </td>
                </tr>`;
            if (mobileContainer) {
                mobileContainer.innerHTML = `
                    <div class="m-voucher-empty">
                        <i data-lucide="inbox"></i>
                        <div>Không có dữ liệu phiếu thu chi</div>
                    </div>`;
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Desktop: render table rows
        els.tableBody.innerHTML = state.displayedVouchers.map(v => {
            const isPayment = isPaymentType(v.type);
            const isCancelled = v.status === config.VOUCHER_STATUS.CANCELLED;

            let rowHtml = `<tr class="${isCancelled ? 'row-cancelled' : ''}" data-id="${v.id}">`;
            rowHtml += `<td><input type="checkbox" class="voucher-checkbox" data-id="${v.id}"></td>`;
            rowHtml += `<td class="star-cell"><i data-lucide="star" class="${v.starred ? 'text-warning star-filled' : 'star-empty'}"></i></td>`;

            visibleCols.forEach(col => {
                if (col.key === 'code') {
                    rowHtml += `<td>
                        <a href="#" class="voucher-code-link text-primary" data-id="${v.id}">${escapeHtml(v.code)}</a>
                        ${isCancelled && !state.columnVisibility.status ? '<span class="badge-cancelled">Đã hủy</span>' : ''}
                    </td>`;
                } else if (col.key === 'amount') {
                    const displayAmount = isPayment
                        ? `-${db.formatCurrency(v.amount)}`
                        : db.formatCurrency(v.amount);
                    const amountClass = isPayment ? 'text-danger' : 'text-success';
                    rowHtml += `<td style="text-align: right;" class="${amountClass}">${displayAmount}</td>`;
                } else if (col.key === 'image') {
                    if (v.imageData) {
                        rowHtml += `<td class="image-cell">
                            <div class="voucher-thumb-wrapper">
                                <img src="${v.imageData}" alt="Ảnh chứng từ" class="voucher-thumb" />
                            </div>
                        </td>`;
                    } else {
                        rowHtml += `<td class="image-cell">-</td>`;
                    }
                } else {
                    rowHtml += `<td>${getCellValue(v, col.key)}</td>`;
                }
            });

            rowHtml += `</tr>`;
            return rowHtml;
        }).join('');

        // Mobile: render card list
        if (mobileContainer) {
            mobileContainer.innerHTML = state.displayedVouchers.map(v => {
                const isPayment = isPaymentType(v.type);
                const isCancelled = v.status === config.VOUCHER_STATUS.CANCELLED;
                const typeLabel = config.VOUCHER_TYPE_LABELS[v.type] || '';
                const dateStr = db.formatVoucherDateTime(v.voucherDateTime);
                const displayAmount = isPayment
                    ? `-${db.formatCurrency(v.amount)}`
                    : `+${db.formatCurrency(v.amount)}`;
                const amountClass = isPayment ? 'text-danger' : 'text-success';

                // Category with source prefix (same as desktop)
                const srcCode = v.sourceCode || v.source || '';
                const cat = v.category || '';
                const categoryDisplay = (srcCode && cat && v.type !== 'payment_cn')
                    ? `${srcCode} ${cat}`
                    : (cat || '-');

                return `
                    <div class="m-voucher-card ${isCancelled ? 'row-cancelled' : ''}" data-id="${v.id}">
                        <div class="m-voucher-header">
                            <div class="m-voucher-header-left">
                                <span class="m-voucher-code">#${escapeHtml(v.code)}</span>
                                <span class="m-voucher-type-badge ${v.type}">${escapeHtml(typeLabel)}</span>
                                ${(srcCode && v.type !== 'payment_cn') ? `<span class="m-voucher-type-badge ${v.type} m-voucher-src-badge">${escapeHtml(srcCode)}</span>` : ''}
                                ${isCancelled ? '<span class="badge-cancelled">Đã hủy</span>' : ''}
                            </div>
                            <span class="m-voucher-amount ${amountClass}">${displayAmount}</span>
                        </div>
                        <div class="m-voucher-details">
                            <div class="m-voucher-row">
                                <span class="m-voucher-label">Loại phiếu:</span>
                                <span class="m-voucher-value">${escapeHtml(categoryDisplay)}</span>
                            </div>
                            ${v.note ? `<div class="m-voucher-row">
                                <span class="m-voucher-label">Ghi chú:</span>
                                <span class="m-voucher-value">${escapeHtml(v.note)}</span>
                            </div>` : ''}
                            <div class="m-voucher-row">
                                <span class="m-voucher-label">Thời gian:</span>
                                <span class="m-voucher-value">${escapeHtml(dateStr)}</span>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
        bindTableEvents();
    }

    function bindTableEvents() {
        // Voucher code click -> open detail (throttled)
        document.querySelectorAll('.voucher-code-link').forEach(link => {
            link.addEventListener('click', throttleClick((e) => {
                e.preventDefault();
                const id = e.currentTarget.dataset.id;
                openDetailModal(id);
            }));
        });

        // Row double-click -> open detail (desktop)
        document.querySelectorAll('.cashbook-table tbody tr[data-id]').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.dataset.id;
                openDetailModal(id);
            });
        });

        // Mobile card tap -> open detail (throttled)
        document.querySelectorAll('.m-voucher-card[data-id]').forEach(card => {
            card.addEventListener('click', throttleClick(() => {
                const id = card.dataset.id;
                openDetailModal(id);
            }));
        });

        // Image thumbnail hover -> show zoomed preview
        bindImageHoverZoom();
    }

    function bindImageHoverZoom() {
        let zoomEl = document.getElementById('voucherThumbZoom');
        if (!zoomEl) {
            zoomEl = document.createElement('img');
            zoomEl.id = 'voucherThumbZoom';
            zoomEl.className = 'voucher-thumb-zoom';
            document.body.appendChild(zoomEl);
        }

        document.querySelectorAll('.voucher-thumb').forEach(thumb => {
            thumb.addEventListener('mouseenter', (e) => {
                zoomEl.src = e.target.src;
                zoomEl.style.display = 'block';
                // Wait for image to load to get actual dimensions
                zoomEl.onload = () => positionZoom(e, zoomEl);
                positionZoom(e, zoomEl);
            });
            thumb.addEventListener('mousemove', (e) => {
                positionZoom(e, zoomEl);
            });
            thumb.addEventListener('mouseleave', () => {
                zoomEl.style.display = 'none';
                zoomEl.src = '';
            });
            thumb.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(e.target.src, '_blank');
            });
        });

        function positionZoom(e, el) {
            const padding = 10;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const elW = el.offsetWidth || 300;
            const elH = el.offsetHeight || 200;

            // Try to place to the left of cursor (since images are on the right side of table)
            let left = e.clientX - elW - padding;
            let top = e.clientY - Math.round(elH / 2);

            // If overflows left, place to right of cursor
            if (left < padding) left = e.clientX + padding;
            // If overflows right, clamp to viewport
            if (left + elW > vw - padding) left = vw - elW - padding;
            // Clamp top/bottom to viewport
            if (top < padding) top = padding;
            if (top + elH > vh - padding) top = vh - elH - padding;

            el.style.left = left + 'px';
            el.style.top = top + 'px';
        }
    }

    // =====================================================
    // SUMMARY STATS
    // =====================================================

    function updateSummaryStats() {
        // Calculate from filtered vouchers (only paid ones for the period)
        const paidVouchers = state.filteredVouchers.filter(
            v => v.status === config.VOUCHER_STATUS.PAID
        );

        state.totalReceipts = paidVouchers
            .filter(v => v.type === config.VOUCHER_TYPES.RECEIPT)
            .reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);

        state.totalPaymentsCN = paidVouchers
            .filter(v => v.type === config.VOUCHER_TYPES.PAYMENT_CN)
            .reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);

        state.totalPaymentsKD = paidVouchers
            .filter(v => v.type === config.VOUCHER_TYPES.PAYMENT_KD)
            .reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);

        state.totalPayments = state.totalPaymentsCN + state.totalPaymentsKD;
        state.closingBalance = state.openingBalance + state.totalReceipts - state.totalPayments;

        if (els.statOpeningBalance) {
            els.statOpeningBalance.textContent = db.formatCurrency(state.openingBalance);
            els.statOpeningBalance.className = 'stat-value ' +
                (state.openingBalance >= 0 ? 'text-dark' : 'text-danger');
        }
        if (els.statTotalReceipts) {
            els.statTotalReceipts.textContent = db.formatCurrency(state.totalReceipts);
        }
        if (els.statTotalPaymentsCN) {
            els.statTotalPaymentsCN.textContent = state.totalPaymentsCN > 0
                ? `-${db.formatCurrency(state.totalPaymentsCN)}`
                : '0';
        }
        if (els.statTotalPaymentsKD) {
            els.statTotalPaymentsKD.textContent = state.totalPaymentsKD > 0
                ? `-${db.formatCurrency(state.totalPaymentsKD)}`
                : '0';
        }
        if (els.statClosingBalance) {
            els.statClosingBalance.textContent = db.formatCurrency(state.closingBalance);
            els.statClosingBalance.className = 'stat-value ' +
                (state.closingBalance >= 0 ? 'text-success' : 'text-danger');
        }
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function updatePagination() {
        state.totalItems = state.filteredVouchers.length;
        state.totalPages = Math.max(1, Math.ceil(state.totalItems / state.pageSize));

        if (state.currentPage > state.totalPages) {
            state.currentPage = state.totalPages;
        }

        const start = state.totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const end = Math.min(state.currentPage * state.pageSize, state.totalItems);

        if (els.currentPageSpan) els.currentPageSpan.textContent = state.currentPage;
        if (els.pageInfoSpan) {
            els.pageInfoSpan.textContent = `${start} - ${end} trong ${state.totalItems} phiếu thu chi`;
        }

        if (els.btnFirstPage) els.btnFirstPage.disabled = state.currentPage <= 1;
        if (els.btnPrevPage) els.btnPrevPage.disabled = state.currentPage <= 1;
        if (els.btnNextPage) els.btnNextPage.disabled = state.currentPage >= state.totalPages;
        if (els.btnLastPage) els.btnLastPage.disabled = state.currentPage >= state.totalPages;
    }

    function goToPage(page) {
        const newPage = Math.max(1, Math.min(page, state.totalPages));
        if (newPage !== state.currentPage) {
            state.currentPage = newPage;
            renderTable();
            updatePagination();
        }
    }

    // =====================================================
    // SIDEBAR TITLE UPDATE
    // =====================================================

    function updateSidebarTitle() {
        if (els.sidebarTitle) {
            els.sidebarTitle.textContent = 'Sổ quỹ tiền mặt';
        }
    }

    // =====================================================
    // MODAL: CREATE RECEIPT
    // =====================================================

    function populateSourceSelect(selectEl) {
        if (!selectEl) return;
        const sources = state.dynamicSources || [];
        selectEl.innerHTML = '<option value="">-- Chọn nguồn --</option>' +
            sources.map(s => {
                const code = typeof s === 'string' ? s : s.code;
                const name = typeof s === 'string' ? s : s.name;
                return `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(name)}</option>`;
            }).join('');
    }

    function openReceiptModal() {
        if (!els.receiptModal) return;

        // Reset form
        resetReceiptForm();

        // Set current date time
        const now = new Date();
        const dateStr = formatDateTimeForInput(now);
        if (els.receiptDateTime) els.receiptDateTime.value = dateStr;

        // Set initial save button state based on category selection
        toggleSaveButton('receipt');

        // Show modal
        markModalOpened();
        protectSelectElements(els.receiptModal);
        els.receiptModal.style.display = 'flex';
    }

    function resetReceiptForm() {
        if (els.receiptDateTime) els.receiptDateTime.value = '';
        if (els.receiptCategory) els.receiptCategory.selectedIndex = 0;
        if (els.receiptCollector) setSelectValue(els.receiptCollector, db.getCurrentUserName());
        if (els.receiptAmount) els.receiptAmount.value = '0';
        if (els.receiptNote) els.receiptNote.value = '';
        if (receiptImageHandler) receiptImageHandler.clearImage();
    }

    function closeReceiptModal() {
        if (els.receiptModal) els.receiptModal.style.display = 'none';
    }

    async function saveReceipt() {
        try {
            const amount = parseAmountInput(els.receiptAmount?.value);
            if (amount <= 0) {
                showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
                return;
            }

            showLoadingOverlay(true);

            // Derive sourceCode from selected category option
            const catEl = els.receiptCategory;
            const selectedOpt = catEl?.options[catEl.selectedIndex];
            const sourceCode = selectedOpt?.dataset?.source || '';

            const voucherData = {
                type: config.VOUCHER_TYPES.RECEIPT,
                category: els.receiptCategory?.value || '',
                collector: els.receiptCollector?.value || '',
                amount: amount,
                note: els.receiptNote?.value || '',
                sourceCode: sourceCode,
                source: sourceCode, // backward compat
                dateTime: els.receiptDateTime?.value || '',
                imageData: receiptImageHandler ? await receiptImageHandler.getImageData() : ''
            };

            const savedVoucher = await db.createVoucher(voucherData);

            closeReceiptModal();
            showNotification('Tạo phiếu thu thành công!', 'success');

            // Optimistic update: insert locally instead of full refresh
            insertVoucherOptimistic(savedVoucher);
        } catch (error) {
            console.error('[SoquyUI] Error saving receipt:', error);
            showNotification('Lỗi khi tạo phiếu thu: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: CREATE PAYMENT
    // =====================================================

    function openPaymentModal(subType) {
        if (!els.paymentModal) return;

        state.paymentSubType = subType || 'cn';

        resetPaymentForm();
        populatePaymentCategoryDropdown(state.paymentSubType);

        const now = new Date();
        const dateStr = formatDateTimeForInput(now);
        if (els.paymentDateTime) els.paymentDateTime.value = dateStr;

        // Update modal title with CN/KD badge (Nhóm 5)
        const titleEl = els.paymentModal.querySelector('.k-modal-header h3');
        if (titleEl) {
            const badge = subType === 'kd'
                ? '<span class="modal-type-badge badge-kd">KD</span>'
                : '<span class="modal-type-badge badge-cn">CN</span>';
            titleEl.innerHTML = `Tạo phiếu chi ${badge}`;
        }

        // Set initial save button state based on category selection
        toggleSaveButton('payment');

        markModalOpened();
        protectSelectElements(els.paymentModal);
        els.paymentModal.style.display = 'flex';
    }

    function resetPaymentForm() {
        if (els.paymentDateTime) els.paymentDateTime.value = '';
        if (els.paymentCategory) els.paymentCategory.selectedIndex = 0;
        if (els.paymentCollector) setSelectValue(els.paymentCollector, db.getCurrentUserName());
        if (els.paymentAmount) els.paymentAmount.value = '0';
        if (els.paymentNote) els.paymentNote.value = '';
        if (paymentImageHandler) paymentImageHandler.clearImage();
    }

    function closePaymentModal() {
        if (els.paymentModal) els.paymentModal.style.display = 'none';
    }

    async function savePayment() {
        try {
            const amount = parseAmountInput(els.paymentAmount?.value);
            if (amount <= 0) {
                showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
                return;
            }

            const paymentType = state.paymentSubType === 'kd'
                ? config.VOUCHER_TYPES.PAYMENT_KD
                : config.VOUCHER_TYPES.PAYMENT_CN;

            showLoadingOverlay(true);

            // Derive sourceCode from selected category option
            const catEl = els.paymentCategory;
            const selectedOpt = catEl?.options[catEl.selectedIndex];
            const sourceCode = selectedOpt?.dataset?.source || '';

            const voucherData = {
                type: paymentType,
                category: els.paymentCategory?.value || '',
                collector: els.paymentCollector?.value || '',
                amount: amount,
                note: els.paymentNote?.value || '',
                sourceCode: sourceCode,
                source: sourceCode, // backward compat
                dateTime: els.paymentDateTime?.value || '',
                imageData: paymentImageHandler ? await paymentImageHandler.getImageData() : ''
            };

            const savedVoucher = await db.createVoucher(voucherData);

            // Auto-add category if new (with sourceCode for KD types) - fire and forget
            if (voucherData.category) {
                db.autoAddCategory(voucherData.category, paymentType, sourceCode)
                    .then(() => populateCategoryDropdowns())
                    .catch(err => console.error('[SoquyUI] autoAddCategory error:', err));
            }

            closePaymentModal();
            const typeLabel = state.paymentSubType === 'kd' ? 'chi KD' : 'chi CN';
            showNotification(`Tạo phiếu ${typeLabel} thành công!`, 'success');

            // Optimistic update: insert locally instead of full refresh
            insertVoucherOptimistic(savedVoucher);
        } catch (error) {
            console.error('[SoquyUI] Error saving payment:', error);
            showNotification('Lỗi khi tạo phiếu chi: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: VOUCHER DETAIL (View/Edit)
    // =====================================================

    async function openDetailModal(voucherId) {
        const voucher = state.filteredVouchers.find(v => v.id === voucherId);
        if (!voucher) return;

        state.viewingVoucherId = voucherId;

        const detailModal = els.detailModal;
        if (!detailModal) return;

        const isReceipt = voucher.type === config.VOUCHER_TYPES.RECEIPT;
        const isPayment = isPaymentType(voucher.type);
        const isCancelled = voucher.status === config.VOUCHER_STATUS.CANCELLED;
        const dateStr = db.formatVoucherDateTime(voucher.voucherDateTime);
        const typeLabel = (config.VOUCHER_TYPE_LABELS[voucher.type] || 'PHIẾU CHI').toUpperCase();
        const amountDisplay = isReceipt
            ? db.formatCurrency(voucher.amount)
            : `-${db.formatCurrency(voucher.amount)}`;

        const detailBody = detailModal.querySelector('.modal-body');
        if (detailBody) {
            detailBody.innerHTML = `
                <div class="detail-header-section">
                    <div class="detail-voucher-code">
                        <span class="code-label">${typeLabel}</span>
                        <span class="code-value">${escapeHtml(voucher.code)}</span>
                        ${isCancelled ? '<span class="badge-cancelled-lg">Đã hủy</span>' : '<span class="badge-paid">Đã thanh toán</span>'}
                    </div>
                </div>

                <div class="detail-grid">
                    <div class="detail-row">
                        <span class="detail-label">Thời gian:</span>
                        <span class="detail-value">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Quỹ:</span>
                        <span class="detail-value">${escapeHtml(config.FUND_TYPE_LABELS[voucher.fundType] || voucher.fundType)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Loại thu:' : 'Loại chi:'}</span>
                        <span class="detail-value">${escapeHtml((() => {
                            const srcCode = voucher.sourceCode || voucher.source || '';
                            const cat = voucher.category || '-';
                            return (srcCode && cat !== '-' && voucher.type !== 'payment_cn') ? `${srcCode} ${cat}` : cat;
                        })())}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Người thu:' : 'Người chi:'}</span>
                        <span class="detail-value">${escapeHtml(voucher.collector || '-')}</span>
                    </div>
                    ${voucher.personName ? `<div class="detail-row">
                        <span class="detail-label">${isReceipt ? 'Người nộp:' : 'Người nhận:'}</span>
                        <span class="detail-value">${escapeHtml(voucher.personName)}</span>
                    </div>` : ''}
                    ${voucher.recipientType ? `<div class="detail-row">
                        <span class="detail-label">Đối tượng:</span>
                        <span class="detail-value">${escapeHtml(voucher.recipientType)}</span>
                    </div>` : ''}
                    ${voucher.recipientName ? `<div class="detail-row">
                        <span class="detail-label">Tên ${isReceipt ? 'người nộp' : 'người nhận'}:</span>
                        <span class="detail-value">${escapeHtml(voucher.recipientName)}</span>
                    </div>` : ''}
                    ${voucher.type !== 'payment_cn' ? `<div class="detail-row">
                        <span class="detail-label">Nguồn:</span>
                        <span class="detail-value">${escapeHtml(db.getSourceLabel(voucher.sourceCode || voucher.source) || '(Chưa phân loại)')}</span>
                    </div>` : ''}
                    ${voucher.businessAccounting !== undefined ? `<div class="detail-row">
                        <span class="detail-label">Hạch toán KQKD:</span>
                        <span class="detail-value">${voucher.businessAccounting ? 'Có' : 'Không'}</span>
                    </div>` : ''}
                    <div class="detail-row detail-row-highlight">
                        <span class="detail-label">Giá trị:</span>
                        <span class="detail-value detail-amount ${isReceipt ? 'text-success' : 'text-danger'}">${amountDisplay}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Ghi chú:</span>
                        <span class="detail-value" style="white-space: pre-wrap;">${escapeHtml(voucher.note || '-')}</span>
                    </div>
                    ${voucher.imageData ? `<div class="detail-row">
                        <span class="detail-label">Ảnh chứng từ:</span>
                        <span class="detail-value"><img src="${voucher.imageData}" alt="Ảnh chứng từ" style="max-width: 200px; max-height: 200px; border-radius: 4px; cursor: pointer;" onclick="window.open(this.src, '_blank')" /></span>
                    </div>` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Người tạo:</span>
                        <span class="detail-value">${escapeHtml(voucher.createdBy || '-')}</span>
                    </div>
                    ${isCancelled ? `
                    <div class="detail-row detail-row-cancelled">
                        <span class="detail-label">Lý do hủy:</span>
                        <span class="detail-value">${escapeHtml(voucher.cancelReason || '-')}</span>
                    </div>` : ''}
                </div>`;
        }

        // Show/hide action buttons based on status
        const detailFooter = detailModal.querySelector('.modal-footer');
        if (detailFooter) {
            const canCancel = typeof SoquyPermissions !== 'undefined' && SoquyPermissions.canCancelVoucher();
            const canEdit = typeof SoquyPermissions !== 'undefined' && SoquyPermissions.canEditVoucher();
            detailFooter.innerHTML = `
                <button class="btn-outline-secondary" id="btnCloseDetailFooter">Đóng</button>
                ${!isCancelled && canCancel ? `
                <button class="btn-outline-danger" id="btnCancelVoucher" data-id="${voucherId}">
                    <i data-lucide="x-circle"></i> Hủy phiếu
                </button>` : ''}
                ${!isCancelled && canEdit ? `
                <button class="btn-primary" id="btnEditVoucher" data-id="${voucherId}">
                    <i data-lucide="edit-3"></i> Sửa phiếu
                </button>` : ''}`;

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Bind footer button events
            const btnClose = detailFooter.querySelector('#btnCloseDetailFooter');
            if (btnClose) btnClose.addEventListener('click', throttleClick(closeDetailModal));

            const btnCancel = detailFooter.querySelector('#btnCancelVoucher');
            if (btnCancel) btnCancel.addEventListener('click', throttleClick(() => openCancelModal(voucherId)));

            const btnEdit = detailFooter.querySelector('#btnEditVoucher');
            if (btnEdit) btnEdit.addEventListener('click', throttleClick(() => openEditFromDetail(voucherId)));
        }

        // Update modal title
        const detailTitle = detailModal.querySelector('.modal-header h3');
        if (detailTitle) {
            detailTitle.textContent = `Chi tiết phiếu ${voucher.code}`;
        }

        markModalOpened();
        detailModal.style.display = 'flex';
    }

    function closeDetailModal() {
        if (els.detailModal) {
            els.detailModal.style.display = 'none';
            state.viewingVoucherId = null;
        }
    }

    // =====================================================
    // MODAL: EDIT VOUCHER (Opens from detail)
    // =====================================================

    function openEditFromDetail(voucherId) {
        const voucher = state.filteredVouchers.find(v => v.id === voucherId);
        if (!voucher) return;

        closeDetailModal();

        const isReceipt = voucher.type === config.VOUCHER_TYPES.RECEIPT;

        if (isReceipt) {
            openReceiptModal();
            // Fill in existing data
            if (els.receiptDateTime) els.receiptDateTime.value = db.formatVoucherDateTime(voucher.voucherDateTime);
            if (els.receiptCategory) setSelectValue(els.receiptCategory, voucher.category);
            if (els.receiptCollector) setSelectValue(els.receiptCollector, voucher.collector || '');
            if (els.receiptAmount) els.receiptAmount.value = db.formatCurrency(voucher.amount);
            if (els.receiptNote) els.receiptNote.value = voucher.note || '';
            if (voucher.imageData && receiptImageHandler) {
                receiptImageHandler.setExistingImageUrl(voucher.imageData);
            }

            // Re-check save button state after setting category
            toggleSaveButton('receipt');

            // Switch save button to update mode
            state.editingVoucherId = voucherId;
        } else {
            const subType = voucher.type === config.VOUCHER_TYPES.PAYMENT_KD ? 'kd' : 'cn';
            openPaymentModal(subType);
            if (els.paymentDateTime) els.paymentDateTime.value = db.formatVoucherDateTime(voucher.voucherDateTime);
            if (els.paymentCategory) setSelectValue(els.paymentCategory, voucher.category);
            if (els.paymentCollector) setSelectValue(els.paymentCollector, voucher.collector || '');
            if (els.paymentAmount) els.paymentAmount.value = db.formatCurrency(voucher.amount);
            if (els.paymentNote) els.paymentNote.value = voucher.note || '';
            if (voucher.imageData && paymentImageHandler) {
                paymentImageHandler.setExistingImageUrl(voucher.imageData);
            }

            // Re-check save button state after setting category
            toggleSaveButton('payment');

            // Update title for edit mode with badge (Nhóm 5)
            const titleEl = els.paymentModal.querySelector('.k-modal-header h3');
            if (titleEl) {
                const badge = subType === 'kd'
                    ? '<span class="modal-type-badge badge-kd">KD</span>'
                    : '<span class="modal-type-badge badge-cn">CN</span>';
                titleEl.innerHTML = `Sửa phiếu chi ${badge}`;
            }

            state.editingVoucherId = voucherId;
        }
    }

    async function saveEditedVoucher(voucherType) {
        if (!state.editingVoucherId) return;

        try {
            showLoadingOverlay(true);
            const isReceipt = voucherType === config.VOUCHER_TYPES.RECEIPT;

            const isCN = !isReceipt && state.paymentSubType === 'cn';
            const catEl = isReceipt ? els.receiptCategory : els.paymentCategory;
            const selectedOpt = catEl?.options[catEl.selectedIndex];
            const selectedSrcCode = isCN ? '' : (selectedOpt?.dataset?.source || '');
            const updateData = {
                category: isReceipt ? els.receiptCategory?.value : els.paymentCategory?.value,
                collector: isReceipt ? els.receiptCollector?.value : els.paymentCollector?.value,
                amount: parseAmountInput(isReceipt ? els.receiptAmount?.value : els.paymentAmount?.value),
                note: isReceipt ? els.receiptNote?.value : els.paymentNote?.value,
                sourceCode: selectedSrcCode,
                source: selectedSrcCode, // backward compat
                businessAccounting: !isReceipt ? (state.paymentSubType === 'kd') : false,
                type: isReceipt ? config.VOUCHER_TYPES.RECEIPT
                    : (state.paymentSubType === 'kd' ? config.VOUCHER_TYPES.PAYMENT_KD : config.VOUCHER_TYPES.PAYMENT_CN),
                dateTime: isReceipt ? els.receiptDateTime?.value : els.paymentDateTime?.value,
                imageData: isReceipt
                    ? (receiptImageHandler ? await receiptImageHandler.getImageData() : '')
                    : (paymentImageHandler ? await paymentImageHandler.getImageData() : '')
            };

            await db.updateVoucher(state.editingVoucherId, updateData);
            const editedId = state.editingVoucherId;
            state.editingVoucherId = null;

            if (isReceipt) closeReceiptModal();
            else closePaymentModal();

            showNotification('Cập nhật phiếu thành công!', 'success');

            // Optimistic update: modify voucher in local state instead of full refresh
            const idx = state.vouchers.findIndex(v => v.id === editedId);
            if (idx !== -1) {
                Object.assign(state.vouchers[idx], updateData);
                if (updateData.dateTime) {
                    state.vouchers[idx].voucherDateTime = new Date(updateData.dateTime);
                }
                applyLocalFilters();
                updateSummaryStats();
                updatePagination();
                renderTable();
                updateSidebarTitle();
            } else {
                await refreshData();
            }
        } catch (error) {
            console.error('[SoquyUI] Error updating voucher:', error);
            showNotification('Lỗi khi cập nhật: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // MODAL: CANCEL VOUCHER
    // =====================================================

    function openCancelModal(voucherId) {
        closeDetailModal();
        state.viewingVoucherId = voucherId;

        if (els.cancelModal) {
            if (els.cancelReason) els.cancelReason.value = '';
            markModalOpened();
            els.cancelModal.style.display = 'flex';
        }
    }

    function closeCancelModal() {
        if (els.cancelModal) {
            els.cancelModal.style.display = 'none';
            state.viewingVoucherId = null;
        }
    }

    async function confirmCancelVoucher() {
        if (!state.viewingVoucherId) return;

        try {
            showLoadingOverlay(true);
            const reason = els.cancelReason?.value || '';
            await db.cancelVoucher(state.viewingVoucherId, reason);
            closeCancelModal();
            showNotification('Đã hủy phiếu thành công!', 'success');
            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error cancelling voucher:', error);
            showNotification('Lỗi khi hủy phiếu: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // COLUMN VISIBILITY TOGGLE
    // =====================================================

    function renderColumnToggleDropdown() {
        const dropdown = document.getElementById('columnToggleDropdown');
        if (!dropdown) return;

        dropdown.innerHTML = config.COLUMN_DEFINITIONS.map(col => `
            <label class="column-toggle-item">
                <input type="checkbox" data-col-key="${col.key}"
                    ${state.columnVisibility[col.key] ? 'checked' : ''}>
                <span>${escapeHtml(col.label)}</span>
            </label>
        `).join('');

        // Bind change events
        dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const key = e.target.dataset.colKey;
                state.columnVisibility[key] = e.target.checked;
                saveColumnVisibility();
                renderTableHeader();
                renderTable();
            });
        });
    }

    function toggleColumnDropdown() {
        const dropdown = document.getElementById('columnToggleDropdown');
        if (!dropdown) return;
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            renderColumnToggleDropdown();
            // Close on click outside
            const closeHandler = (e) => {
                if (!dropdown.contains(e.target) && !e.target.closest('#btnColumnToggle')) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    }

    function saveColumnVisibility() {
        try {
            localStorage.setItem('soquy_column_visibility', JSON.stringify(state.columnVisibility));
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // FILTER STATE PERSISTENCE (Nhóm 7)
    // =====================================================

    function saveFilterState() {
        try {
            const filters = {
                timeFilter: state.timeFilter,
                customStartDate: state.customStartDate,
                customEndDate: state.customEndDate,
                voucherTypeFilter: state.voucherTypeFilter,
                sourceFilter: state.sourceFilter,
                categoryFilter: state.categoryFilter
            };
            localStorage.setItem('soquy_filters', JSON.stringify(filters));
        } catch (e) { /* ignore */ }
    }

    function loadFilterState() {
        try {
            const saved = localStorage.getItem('soquy_filters');
            if (!saved) return;
            const filters = JSON.parse(saved);
            if (filters.timeFilter) state.timeFilter = filters.timeFilter;
            if (filters.customStartDate) state.customStartDate = filters.customStartDate;
            if (filters.customEndDate) state.customEndDate = filters.customEndDate;
            if (filters.voucherTypeFilter) state.voucherTypeFilter = filters.voucherTypeFilter;
            // statusFilter always defaults to ['paid'] on page load (not restored from localStorage)
            if (filters.sourceFilter) state.sourceFilter = filters.sourceFilter;
            if (filters.categoryFilter) state.categoryFilter = filters.categoryFilter;
        } catch (e) { /* ignore */ }
    }

    function restoreFilterUI() {
        // Restore time filter
        const timeSelect = document.getElementById('timeFilterSelect');
        if (timeSelect && state.timeFilter !== 'custom') {
            timeSelect.value = state.timeFilter;
        }

        // Restore voucher type checkboxes
        const rcb = document.getElementById('filterReceipt');
        const pcnCb = document.getElementById('filterPaymentCN');
        const pkdCb = document.getElementById('filterPaymentKD');
        if (rcb) rcb.checked = state.voucherTypeFilter.includes('receipt');
        if (pcnCb) pcnCb.checked = state.voucherTypeFilter.includes('payment_cn');
        if (pkdCb) pkdCb.checked = state.voucherTypeFilter.includes('payment_kd');

        // Restore status checkboxes
        const spCb = document.getElementById('filterStatusPaid');
        const scCb = document.getElementById('filterStatusCancelled');
        if (spCb) spCb.checked = state.statusFilter.includes('paid');
        if (scCb) scCb.checked = state.statusFilter.includes('cancelled');

        // Restore text filters
        const catInput = document.getElementById('filterCategory');
        if (catInput && state.categoryFilter) catInput.value = state.categoryFilter;
        const srcInput = document.getElementById('filterSource');
        if (srcInput && state.sourceFilter) srcInput.value = state.sourceFilter;
    }

    function loadColumnVisibility() {
        try {
            const saved = localStorage.getItem('soquy_column_visibility');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.keys(parsed).forEach(key => {
                    if (key in state.columnVisibility) {
                        state.columnVisibility[key] = parsed[key];
                    }
                });
            }
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // IMPORT FROM EXCEL
    // =====================================================

    function openImportModal() {
        const modal = document.getElementById('soquyImportModal');
        if (modal) {
            // Reset
            const fileInput = document.getElementById('importFileInput');
            if (fileInput) fileInput.value = '';
            const preview = document.getElementById('importPreview');
            if (preview) preview.innerHTML = '';
            const resultDiv = document.getElementById('importResult');
            if (resultDiv) resultDiv.innerHTML = '';
            const btnConfirm = document.getElementById('btnConfirmImport');
            if (btnConfirm) btnConfirm.disabled = true;

            state._importData = null;
            markModalOpened();
            modal.style.display = 'flex';
        }
    }

    function closeImportModal() {
        const modal = document.getElementById('soquyImportModal');
        if (modal) {
            modal.style.display = 'none';
            state._importData = null;
        }
    }

    function handleImportFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Show file name
        const fileNameSpan = document.getElementById('importFileName');
        if (fileNameSpan) fileNameSpan.textContent = file.name;

        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                if (typeof XLSX === 'undefined') {
                    showNotification('Thư viện SheetJS chưa tải xong, vui lòng thử lại', 'error');
                    return;
                }

                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

                if (rows.length === 0) {
                    showNotification('File không có dữ liệu', 'error');
                    return;
                }

                state._importData = rows;

                // Show preview
                const preview = document.getElementById('importPreview');
                if (preview) {
                    const previewRows = rows.slice(0, 5);
                    const cols = Object.keys(rows[0]);
                    preview.innerHTML = `
                        <p style="margin-bottom: 8px; font-size: 13px; color: #666;">
                            Tìm thấy <strong>${rows.length}</strong> dòng dữ liệu. Xem trước ${previewRows.length} dòng đầu:
                        </p>
                        <div class="import-preview-table-wrapper">
                            <table class="import-preview-table">
                                <thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
                                <tbody>${previewRows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(String(r[c] || ''))}</td>`).join('')}</tr>`).join('')}</tbody>
                            </table>
                        </div>`;
                }

                const btnConfirm = document.getElementById('btnConfirmImport');
                if (btnConfirm) btnConfirm.disabled = false;

            } catch (error) {
                console.error('[SoquyUI] Error reading Excel file:', error);
                showNotification('Lỗi đọc file: ' + error.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function confirmImport() {
        if (!state._importData || state._importData.length === 0) {
            showNotification('Không có dữ liệu để nhập', 'error');
            return;
        }

        try {
            showLoadingOverlay(true);
            const resultDiv = document.getElementById('importResult');
            if (resultDiv) resultDiv.innerHTML = '<p style="color:#666;">Đang nhập dữ liệu...</p>';

            const result = await db.importVouchers(state._importData);
            console.log('[SoquyUI] Import result:', result);

            if (resultDiv) {
                let html = `<p style="color:#52c41a; font-weight:600;">Nhập thành công: ${result.success}/${state._importData.length} phiếu</p>`;
                if (result.skipped.length > 0) {
                    html += `<p style="color:#faad14; font-weight:600;">Bỏ qua: ${result.skipped.length} phiếu (mã đã tồn tại)</p>`;
                    html += `<ul style="font-size:12px; color:#faad14; max-height:80px; overflow-y:auto; margin:4px 0;">`;
                    result.skipped.forEach(s => {
                        html += `<li>Dòng ${s.row}: ${escapeHtml(s.code)}</li>`;
                    });
                    html += `</ul>`;
                }
                if (result.errors.length > 0) {
                    html += `<p style="color:#f5222d;">Lỗi: ${result.errors.length} dòng</p>`;
                    html += `<ul style="font-size:12px; color:#f5222d; max-height:80px; overflow-y:auto;">`;
                    result.errors.forEach(err => {
                        html += `<li>Dòng ${err.row}: ${escapeHtml(err.error)}</li>`;
                    });
                    html += `</ul>`;
                }
                resultDiv.innerHTML = html;
            }

            const skippedMsg = result.skipped.length > 0 ? `, bỏ qua ${result.skipped.length} mã trùng` : '';
            showNotification(`Nhập thành công ${result.success} phiếu${skippedMsg}!`, 'success');

            // Refresh dropdowns with new dynamic categories
            populateCategoryDropdowns();
            await refreshData();

        } catch (error) {
            console.error('[SoquyUI] Error importing:', error);
            showNotification('Lỗi khi nhập dữ liệu: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    async function deleteAllVouchers() {
        const confirmed = confirm('⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ phiếu thu chi?\n\nHành động này không thể hoàn tác!');
        if (!confirmed) return;

        const doubleConfirm = confirm('Xác nhận lần cuối: Xóa tất cả phiếu trong sổ quỹ?');
        if (!doubleConfirm) return;

        try {
            showLoadingOverlay(true);
            const result = await db.deleteAllVouchers();
            showNotification(`Đã xóa toàn bộ ${result.deleted} phiếu!`, 'success');

            const resultDiv = document.getElementById('importResult');
            if (resultDiv) {
                resultDiv.innerHTML = `<p style="color:#52c41a; font-weight:600;">Đã xóa ${result.deleted} phiếu. Sẵn sàng nhập Excel mới.</p>`;
            }

            await refreshData();
        } catch (error) {
            console.error('[SoquyUI] Error deleting all:', error);
            showNotification('Lỗi khi xóa: ' + error.message, 'error');
        } finally {
            showLoadingOverlay(false);
        }
    }

    // =====================================================
    // DATA REFRESH
    // =====================================================

    async function refreshData() {
        try {
            state.isLoading = true;
            showTableLoading(true);

            // Fetch vouchers from Firestore (with server-side filters: fundType, time, status, voucherType, businessAccounting)
            const vouchers = await db.fetchVouchers();
            state.vouchers = vouchers;
            console.log('[SoquyUI] refreshData: fetched vouchers =', vouchers.length);

            // Apply local filters (search, category, creator, employee)
            applyLocalFilters();
            console.log('[SoquyUI] refreshData: after local filters =', state.filteredVouchers.length);

            // Calculate opening balance
            state.openingBalance = await db.calculateOpeningBalance(state.fundType);

            // Update all UI
            updateSummaryStats();
            updatePagination();
            renderTable();
            updateSidebarTitle();
        } catch (error) {
            console.error('[SoquyUI] Error refreshing data:', error);
            showNotification('Lỗi khi tải dữ liệu: ' + error.message, 'error');
        } finally {
            state.isLoading = false;
            showTableLoading(false);
        }
    }

    /**
     * Optimistic insert: add new voucher to local state and re-render immediately
     * without re-fetching from Firestore. Much faster than full refreshData().
     */
    function insertVoucherOptimistic(newVoucher) {
        // Normalize legacy type
        if (newVoucher.type === 'payment') {
            newVoucher.type = newVoucher.businessAccounting ? 'payment_kd' : 'payment_cn';
        }

        // Check if voucher matches current filters (fundType, status, voucherType)
        if (state.fundType !== config.FUND_TYPES.ALL && newVoucher.fundType !== state.fundType) {
            return; // Doesn't match current fund type view
        }
        if (state.statusFilter.length > 0 && !state.statusFilter.includes(newVoucher.status)) {
            return;
        }
        if (state.voucherTypeFilter.length > 0 && !state.voucherTypeFilter.includes(newVoucher.type)) {
            return;
        }

        // Insert at the beginning (newest first)
        state.vouchers.unshift(newVoucher);

        // Re-apply local filters and re-render
        applyLocalFilters();
        updateSummaryStats();
        updatePagination();
        renderTable();
        updateSidebarTitle();
    }

    /**
     * Apply local filters (search, category, creator, employee) on already-fetched data
     * and re-render the table without re-fetching from Firestore.
     */
    function applyLocalFilters() {
        let vouchers = [...state.vouchers];

        // Search filter
        if (state.searchQuery && state.searchQuery.trim()) {
            const query = state.searchQuery.trim().toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.code || '').toLowerCase().includes(query) ||
                String(v.category || '').toLowerCase().includes(query) ||
                String(v.personName || '').toLowerCase().includes(query) ||
                String(v.note || '').toLowerCase().includes(query) ||
                String(v.createdBy || '').toLowerCase().includes(query) ||
                String(v.collector || '').toLowerCase().includes(query) ||
                String(v.transferContent || '').toLowerCase().includes(query) ||
                String(v.personCode || '').toLowerCase().includes(query) ||
                String(v.accountName || '').toLowerCase().includes(query) ||
                String(v.accountNumber || '').toLowerCase().includes(query) ||
                String(v.phone || '').toLowerCase().includes(query) ||
                String(v.branch || '').toLowerCase().includes(query)
            );
        }

        // Category filter
        if (state.categoryFilter) {
            const cat = state.categoryFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.category || '').toLowerCase().includes(cat)
            );
        }

        // Creator filter
        if (state.creatorFilter) {
            const creator = state.creatorFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.createdBy || '').toLowerCase().includes(creator)
            );
        }

        // Employee filter
        if (state.employeeFilter) {
            const emp = state.employeeFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.collector || '').toLowerCase().includes(emp)
            );
        }

        // Source filter
        if (state.sourceFilter) {
            const src = state.sourceFilter.toLowerCase();
            vouchers = vouchers.filter(v => {
                const code = String(v.sourceCode || v.source || '').toLowerCase();
                const label = db.getSourceLabel(v.sourceCode || v.source).toLowerCase();
                return code.includes(src) || label.includes(src);
            });
        }

        // Permission-based creator filter (before statistics calculation)
        if (typeof SoquyPermissions !== 'undefined') {
            vouchers = SoquyPermissions.filterByCreator(vouchers);
        }

        state.filteredVouchers = vouchers;
    }

    /**
     * Re-filter and re-render without re-fetching from Firestore.
     * Used for search, category, creator, employee filter changes.
     */
    function refilterLocally() {
        applyLocalFilters();
        updateSummaryStats();
        updatePagination();
        renderTable();
    }

    // =====================================================
    // FILTER HANDLERS
    // =====================================================

    function handleFundTypeChange(fundType) {
        state.fundType = fundType;
        state.currentPage = 1;
        updateSidebarTitle();
        refreshData();
    }

    function handleTimeFilterChange(filter) {
        state.timeFilter = filter;
        state.currentPage = 1;
        refreshData();
    }

    function handleVoucherTypeFilterChange() {
        const types = [];
        if (els.receiptCheckbox?.checked) types.push(config.VOUCHER_TYPES.RECEIPT);
        if (els.paymentCNCheckbox?.checked) types.push(config.VOUCHER_TYPES.PAYMENT_CN);
        if (els.paymentKDCheckbox?.checked) types.push(config.VOUCHER_TYPES.PAYMENT_KD);
        state.voucherTypeFilter = types;
        state.currentPage = 1;
        refreshData();
    }

    function handleStatusFilterChange() {
        const statuses = [];
        if (els.statusPaidCheckbox?.checked) statuses.push(config.VOUCHER_STATUS.PAID);
        if (els.statusCancelledCheckbox?.checked) statuses.push(config.VOUCHER_STATUS.CANCELLED);
        state.statusFilter = statuses;
        state.currentPage = 1;
        refreshData();
    }

    function handleBusinessAccountingChange(value) {
        state.businessAccounting = value;
        state.currentPage = 1;
        refreshData();
    }

    function handleSearchChange(query) {
        state.searchQuery = query;
        state.currentPage = 1;
        refilterLocally();
    }

    function handleCategoryFilterChange(value) {
        state.categoryFilter = value;
        state.currentPage = 1;
        refilterLocally();
    }

    function handleCreatorFilterChange(value) {
        state.creatorFilter = value;
        state.currentPage = 1;
        refilterLocally();
    }

    function handleEmployeeFilterChange(value) {
        state.employeeFilter = value;
        state.currentPage = 1;
        refilterLocally();
    }

    function handleSourceFilterChange(value) {
        state.sourceFilter = value;
        state.currentPage = 1;
        refilterLocally();
    }

    // =====================================================
    // SEARCHABLE FILTER DROPDOWNS
    // =====================================================

    /**
     * Extract unique values from vouchers for a given field
     */
    function getUniqueFilterValues(field) {
        const values = new Set();
        const vouchers = state.vouchers || [];
        vouchers.forEach(v => {
            let val = '';
            switch (field) {
                case 'category': {
                    const srcCode = v.sourceCode || v.source || '';
                    const cat = v.category || '';
                    val = (srcCode && cat && v.type !== 'payment_cn') ? `${srcCode} ${cat}` : cat;
                    break;
                }
                case 'source':
                    val = db.getSourceLabel(v.sourceCode || v.source) || '';
                    break;
                case 'creator':
                    val = v.createdBy || '';
                    break;
                case 'employee':
                    val = v.collector || '';
                    break;
            }
            if (val) values.add(val);
        });
        return [...values].sort((a, b) => a.localeCompare(b, 'vi'));
    }

    /**
     * Show searchable dropdown for a filter input
     */
    function showFilterDropdown(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        const query = (input.value || '').trim().toLowerCase();
        const allValues = getUniqueFilterValues(field);

        const filtered = query
            ? allValues.filter(v => v.toLowerCase().includes(query))
            : allValues;

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="filter-dropdown-empty">Không tìm thấy</div>';
        } else {
            dropdown.innerHTML = filtered.map(val => {
                let display = escapeHtml(val);
                if (query) {
                    const idx = val.toLowerCase().indexOf(query);
                    if (idx >= 0) {
                        const before = escapeHtml(val.substring(0, idx));
                        const match = escapeHtml(val.substring(idx, idx + query.length));
                        const after = escapeHtml(val.substring(idx + query.length));
                        display = `${before}<span class="filter-dropdown-match">${match}</span>${after}`;
                    }
                }
                return `<div class="filter-dropdown-item" data-value="${escapeHtml(val)}">${display}</div>`;
            }).join('');
        }

        dropdown.classList.add('show');

        // Bind click events on items
        dropdown.querySelectorAll('.filter-dropdown-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur before click
                input.value = item.dataset.value;
                dropdown.classList.remove('show');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    function hideFilterDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.classList.remove('show');
    }

    /**
     * Initialize a searchable dropdown for a filter input
     */
    function initFilterSearchableDropdown(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.addEventListener('focus', () => {
            showFilterDropdown(inputId, dropdownId, field);
        });

        input.addEventListener('input', () => {
            showFilterDropdown(inputId, dropdownId, field);
        });

        input.addEventListener('blur', () => {
            // Small delay so mousedown on dropdown item fires first
            setTimeout(() => hideFilterDropdown(dropdownId), 150);
        });
    }

    function handlePageSizeChange(size) {
        state.pageSize = parseInt(size) || config.DEFAULT_PAGE_SIZE;
        state.currentPage = 1;
        renderTable();
        updatePagination();
    }

    // =====================================================
    // EXPORT HANDLER
    // =====================================================

    function handleExport() {
        if (state.filteredVouchers.length === 0) {
            showNotification('Không có dữ liệu để xuất', 'error');
            return;
        }
        db.exportToCSV(state.filteredVouchers);
        showNotification('Đã xuất file thành công!', 'success');
    }

    // =====================================================
    // POPULATE DROPDOWNS
    // =====================================================

    /**
     * Returns array of {name, displayName, sourceCode} for a voucher type.
     * Predefined categories have no source; dynamic ones may have sourceCode.
     */
    function getCategoriesForType(voucherType) {
        const predefined = db.getCategoryPredefined(voucherType);
        const dynamic = db.getCategoryDynamicList(voucherType);
        const removedKey = db.getRemovedStateKey(voucherType);
        const removed = state[removedKey] || [];
        const sourceLinked = db.isSourceLinkedType(voucherType);

        const result = [];
        const addedNames = new Set();

        // Predefined (strings, no source)
        predefined.forEach(c => {
            const name = String(c);
            if (removed.some(r => String(r).toLowerCase() === name.toLowerCase())) return;
            if (addedNames.has(name.toLowerCase())) return;
            addedNames.add(name.toLowerCase());
            result.push({ name, displayName: name, sourceCode: '' });
        });

        // Dynamic
        dynamic.forEach(cat => {
            const catName = db.getCategoryName(cat);
            const catSource = sourceLinked ? db.getCategorySourceCode(cat) : '';
            if (addedNames.has(catName.toLowerCase())) return;
            addedNames.add(catName.toLowerCase());
            const displayName = catSource ? `${catSource} ${catName}` : catName;
            result.push({ name: catName, displayName, sourceCode: catSource });
        });

        return result;
    }

    /**
     * Build <option> HTML for a category item with data-source attribute
     */
    function buildCategoryOption(catObj) {
        return `<option value="${escapeHtml(catObj.name)}" data-source="${escapeHtml(catObj.sourceCode || '')}">${escapeHtml(catObj.displayName)}</option>`;
    }

    function populatePaymentCategoryDropdown(subType) {
        const voucherType = subType === 'kd'
            ? config.VOUCHER_TYPES.PAYMENT_KD
            : config.VOUCHER_TYPES.PAYMENT_CN;
        const allPaymentCats = getCategoriesForType(voucherType);
        const label = subType === 'kd' ? 'Chọn loại chi KD' : 'Chọn loại chi CN';
        if (els.paymentCategory) {
            els.paymentCategory.innerHTML = `<option value="">${label}</option>` +
                allPaymentCats.map(cat => buildCategoryOption(cat)).join('');
        }
    }

    function populateCategoryDropdowns() {
        // Receipt categories
        const allReceiptCats = getCategoriesForType(config.VOUCHER_TYPES.RECEIPT);
        if (els.receiptCategory) {
            els.receiptCategory.innerHTML = '<option value="">Chọn loại thu</option>' +
                allReceiptCats.map(cat => buildCategoryOption(cat)).join('');
        }

        // Payment category - populate based on current subType
        populatePaymentCategoryDropdown(state.paymentSubType || 'cn');

        // Time filter select
        if (els.timeFilterSelect) {
            els.timeFilterSelect.innerHTML = Object.entries(config.TIME_FILTER_LABELS)
                .filter(([key]) => key !== config.TIME_FILTERS.CUSTOM)
                .map(([key, label]) =>
                    `<option value="${key}">${escapeHtml(label)}</option>`
                ).join('');
        }

        // Page size select
        if (els.pageSizeSelect) {
            els.pageSizeSelect.innerHTML = config.PAGE_SIZES.map(size =>
                `<option value="${size}" ${size === config.DEFAULT_PAGE_SIZE ? 'selected' : ''}>${size} dòng</option>`
            ).join('');
        }
    }

    /**
     * Populate collector (Người thu/Người chi) dropdowns with users.
     * Non-admin: only show current user's name (locked).
     * Admin: show all users.
     */
    function populateCollectorDropdowns() {
        const users = state.allUsers || [];
        const currentUserName = db.getCurrentUserName();
        const isAdmin = typeof PermissionHelper !== 'undefined' && PermissionHelper.isAdmin();

        [els.receiptCollector, els.paymentCollector].forEach(select => {
            if (!select) return;
            const isReceipt = select.id === 'receiptCollector';
            const placeholder = isReceipt ? 'Chọn người thu' : 'Chọn người chi';

            if (isAdmin) {
                // Admin: show only users with create_receipt or create_payment permission (+ admins)
                const permKey = isReceipt ? 'create_receipt' : 'create_payment';
                const allowedUsers = users.filter(u => {
                    if (u.isAdmin || u.roleTemplate === 'admin') return true;
                    const soquyPerms = u.detailedPermissions?.soquy;
                    return soquyPerms && soquyPerms[permKey] === true;
                });
                let optionsHtml = `<option value="">${placeholder}</option>`;
                allowedUsers.forEach(u => {
                    const displayName = u.displayName || u.username;
                    const selected = displayName === currentUserName ? ' selected' : '';
                    optionsHtml += `<option value="${escapeHtml(displayName)}"${selected}>${escapeHtml(displayName)}</option>`;
                });
                select.innerHTML = optionsHtml;
                select.disabled = false;
            } else {
                // Non-admin: only current user, locked
                select.innerHTML = `<option value="${escapeHtml(currentUserName)}" selected>${escapeHtml(currentUserName)}</option>`;
                select.disabled = true;
                select.style.opacity = '0.7';
            }
        });
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    function formatDateTimeForInput(date) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    function parseAmountInput(value) {
        if (!value) return 0;
        // Remove formatting characters
        const cleaned = String(value).replace(/[.,\s]/g, '');
        return Math.abs(parseInt(cleaned) || 0);
    }

    function setSelectValue(selectEl, value) {
        if (!selectEl || !value) return;
        for (let i = 0; i < selectEl.options.length; i++) {
            if (selectEl.options[i].value === value) {
                selectEl.selectedIndex = i;
                return;
            }
        }
        // If not found, add it
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectEl.appendChild(option);
        selectEl.value = value;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showNotification(message, type) {
        // Use shared notification system if available
        if (typeof window.showSuccess === 'function' && type === 'success') {
            window.showSuccess(message);
            return;
        }
        if (typeof window.showError === 'function' && type === 'error') {
            window.showError(message);
            return;
        }

        // Fallback: simple toast notification
        const existing = document.querySelector('.soquy-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `soquy-toast soquy-toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
            <span>${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        if (typeof lucide !== 'undefined') lucide.createIcons();

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showTableLoading(show) {
        const container = document.querySelector('.cashbook-table-container');
        if (!container) return;

        const existingLoader = container.querySelector('.table-loading-overlay');
        if (show && !existingLoader) {
            const loader = document.createElement('div');
            loader.className = 'table-loading-overlay';
            loader.innerHTML = '<div class="loading-spinner"></div>';
            container.appendChild(loader);
        } else if (!show && existingLoader) {
            existingLoader.remove();
        }
    }

    function showLoadingOverlay(show) {
        let overlay = document.querySelector('.global-loading-overlay');
        if (show && !overlay) {
            overlay = document.createElement('div');
            overlay.className = 'global-loading-overlay';
            overlay.innerHTML = '<div class="loading-spinner large"></div>';
            document.body.appendChild(overlay);
        } else if (!show && overlay) {
            overlay.remove();
        }
    }

    // =====================================================
    // CATEGORY MANAGEMENT
    // =====================================================

    let _categoryModalTab = 'receipt'; // 'receipt', 'payment_cn', 'payment_kd'

    function categoryTabToVoucherType(tab) {
        if (tab === 'receipt') return config.VOUCHER_TYPES.RECEIPT;
        if (tab === 'payment_cn') return config.VOUCHER_TYPES.PAYMENT_CN;
        return config.VOUCHER_TYPES.PAYMENT_KD;
    }

    function openCategoryModal(type) {
        const modal = document.getElementById('soquyCategoryModal');
        if (!modal) return;

        // Set the type selector based on which button opened it
        const typeSelect = document.getElementById('newCategoryType');
        if (typeSelect) {
            typeSelect.value = type || 'receipt';
        }

        // Set active tab matching the type
        _categoryModalTab = type || 'receipt';
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.catTab === _categoryModalTab);
        });

        // Update title
        const title = document.getElementById('categoryModalTitle');
        if (title) title.textContent = 'Quản lý loại thu chi';

        // Clear form
        const nameInput = document.getElementById('newCategoryName');
        const descInput = document.getElementById('newCategoryDescription');
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';

        // Populate source dropdown and toggle visibility
        populateCategorySourceDropdown();
        toggleCategorySourceRow(type || 'receipt');

        // Hide inline source creation
        const inlineCreate = document.getElementById('inlineSourceCreate');
        if (inlineCreate) inlineCreate.style.display = 'none';

        // Render list
        renderCategoryList();

        markModalOpened();
        protectSelectElements(modal);
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Populate source dropdown in category management modal
     */
    function populateCategorySourceDropdown() {
        const select = document.getElementById('newCategorySource');
        if (!select) return;

        const sources = state.dynamicSources || [];
        const defaultCode = db.getDefaultSource();
        select.innerHTML = '<option value="">-- Chọn nguồn --</option>' +
            sources.map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} ${escapeHtml(s.name)}</option>`).join('');

        // Auto-select the default source if one is set
        if (defaultCode && sources.some(s => s.code === defaultCode)) {
            select.value = defaultCode;
        }
    }

    /**
     * Toggle source row visibility based on category type (hide for CN)
     */
    function toggleCategorySourceRow(type) {
        const sourceRow = document.getElementById('categorySourceRow');
        const inlineCreate = document.getElementById('inlineSourceCreate');
        if (sourceRow) {
            sourceRow.style.display = (type === 'payment_cn') ? 'none' : 'flex';
        }
        if (inlineCreate && type === 'payment_cn') {
            inlineCreate.style.display = 'none';
        }
    }

    /**
     * Handle inline source creation in category modal
     */
    function toggleInlineSourceCreate() {
        const el = document.getElementById('inlineSourceCreate');
        if (!el) return;
        el.style.display = el.style.display === 'none' ? 'flex' : 'none';
        if (el.style.display === 'flex') {
            const codeInput = document.getElementById('inlineSourceCode');
            if (codeInput) codeInput.focus();
        }
    }

    async function saveInlineSource() {
        const codeInput = document.getElementById('inlineSourceCode');
        const nameInput = document.getElementById('inlineSourceName');
        const code = (codeInput?.value || '').trim().toUpperCase();
        const name = (nameInput?.value || '').trim();

        if (!code || !name) {
            showNotification('Vui lòng nhập mã nguồn và tên nguồn', 'error');
            return;
        }

        try {
            await db.addSource({ code, name });
            populateCategorySourceDropdown();
            // Auto-select the new source
            const select = document.getElementById('newCategorySource');
            if (select) select.value = code;
            // Hide inline form
            const el = document.getElementById('inlineSourceCreate');
            if (el) el.style.display = 'none';
            if (codeInput) codeInput.value = '';
            if (nameInput) nameInput.value = '';
            showNotification(`Đã tạo nguồn: ${code} ${name}`, 'success');
        } catch (error) {
            console.error('[SoquyUI] Error saving inline source:', error);
            showNotification('Lỗi khi tạo nguồn', 'error');
        }
    }

    function closeCategoryModal() {
        const modal = document.getElementById('soquyCategoryModal');
        if (modal) modal.style.display = 'none';
    }

    function renderCategoryList() {
        const listContainer = document.getElementById('categoryListItems');
        if (!listContainer) return;

        const vType = categoryTabToVoucherType(_categoryModalTab);
        const predefined = db.getCategoryPredefined(vType);
        const dynamic = db.getCategoryDynamicList(vType);
        const removedKey = db.getRemovedStateKey(vType);
        const removedPredefined = state[removedKey] || [];

        // Filter out removed predefined categories
        const activePredefined = predefined.filter(
            c => !removedPredefined.some(r => String(r).toLowerCase() === String(c).toLowerCase())
        );

        // Build combined list: predefined first, then dynamic
        let html = '';

        activePredefined.forEach(cat => {
            html += `
                <div class="category-item" data-category="${escapeHtml(cat)}" data-source="predefined">
                    <label class="category-check-label">
                        <input type="checkbox" class="category-item-checkbox" value="${escapeHtml(cat)}" data-source="predefined">
                        <span class="category-check-custom"></span>
                    </label>
                    <div class="category-item-info">
                        <div class="category-item-name">${escapeHtml(cat)}</div>
                    </div>
                    <span class="category-item-badge category-item-badge--predefined">Mặc định</span>
                    <button class="category-item-delete" data-category="${escapeHtml(cat)}" data-source="predefined" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>`;
        });

        dynamic.forEach(cat => {
            const catName = db.getCategoryName(cat);
            const catSource = db.getCategorySourceCode(cat);
            const displayName = catSource ? `${catSource} ${catName}` : catName;
            const sourceBadge = catSource
                ? `<span class="category-item-badge category-item-badge--source">${escapeHtml(catSource)}</span>`
                : '';
            html += `
                <div class="category-item" data-category="${escapeHtml(catName)}" data-source="dynamic">
                    <label class="category-check-label">
                        <input type="checkbox" class="category-item-checkbox" value="${escapeHtml(catName)}" data-source="dynamic">
                        <span class="category-check-custom"></span>
                    </label>
                    <div class="category-item-info">
                        <div class="category-item-name">${escapeHtml(displayName)}</div>
                    </div>
                    ${sourceBadge}
                    <span class="category-item-badge category-item-badge--dynamic">Tùy chỉnh</span>
                    <button class="category-item-delete" data-category="${escapeHtml(catName)}" data-source="dynamic" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>`;
        });

        if (activePredefined.length === 0 && dynamic.length === 0) {
            html = `
                <div class="category-list-empty">
                    <i data-lucide="inbox"></i>
                    <span>Chưa có loại thu chi nào</span>
                </div>`;
        }

        listContainer.innerHTML = html;

        // Reset select all
        const selectAll = document.getElementById('selectAllCategories');
        if (selectAll) selectAll.checked = false;

        updateDeleteSelectedButton();

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind individual delete buttons
        listContainer.querySelectorAll('.category-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cat = btn.dataset.category;
                const source = btn.dataset.source;
                if (!cat) return;
                await deleteSingleCategory(cat, source);
            });
        });

        // Bind checkbox change events
        listContainer.querySelectorAll('.category-item-checkbox').forEach(cb => {
            cb.addEventListener('change', updateDeleteSelectedButton);
        });
    }

    function updateDeleteSelectedButton() {
        const checkboxes = document.querySelectorAll('.category-item-checkbox:checked');
        const count = checkboxes.length;
        const btn = document.getElementById('btnDeleteSelectedCategories');
        const countSpan = document.getElementById('selectedCategoryCount');

        if (btn) {
            btn.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        if (countSpan) {
            countSpan.textContent = count;
        }
    }

    async function saveNewCategory() {
        const nameInput = document.getElementById('newCategoryName');
        const typeSelect = document.getElementById('newCategoryType');
        const sourceSelect = document.getElementById('newCategorySource');

        const name = (nameInput?.value || '').trim();
        const type = typeSelect?.value || 'receipt';
        const sourceCode = (sourceSelect?.value || '').trim();

        if (!name) {
            showNotification('Vui lòng nhập tên loại thu chi', 'error');
            if (nameInput) nameInput.focus();
            return;
        }

        const voucherType = categoryTabToVoucherType(type);
        const needsSource = db.isSourceLinkedType(voucherType);

        // Require source for receipt & KD types
        if (needsSource && !sourceCode) {
            showNotification('Vui lòng chọn nguồn cho loại thu chi này', 'error');
            if (sourceSelect) sourceSelect.focus();
            return;
        }

        // Check if already exists
        const predefined = db.getCategoryPredefined(voucherType);
        const dynamic = db.getCategoryDynamicList(voucherType);
        const allNames = [
            ...predefined.map(c => String(c).toLowerCase()),
            ...dynamic.map(c => db.getCategoryName(c).toLowerCase())
        ];

        if (allNames.includes(name.toLowerCase())) {
            showNotification('Loại thu chi này đã tồn tại', 'error');
            return;
        }

        const typeLabels = { receipt: 'thu', payment_cn: 'chi CN', payment_kd: 'chi KD' };
        const displayName = needsSource && sourceCode ? `${sourceCode} ${name}` : name;

        try {
            await db.autoAddCategory(name, voucherType, needsSource ? sourceCode : '');
            populateCategoryDropdowns();
            showNotification(`Đã tạo loại ${typeLabels[type] || 'chi'}: ${displayName}`, 'success');

            // Clear form
            if (nameInput) nameInput.value = '';
            const descInput = document.getElementById('newCategoryDescription');
            if (descInput) descInput.value = '';
            if (sourceSelect) sourceSelect.value = '';

            // Switch tab to show the new category
            _categoryModalTab = type;
            document.querySelectorAll('.category-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.catTab === _categoryModalTab);
            });

            renderCategoryList();
        } catch (error) {
            console.error('[SoquyUI] Error saving category:', error);
            showNotification('Lỗi khi tạo loại thu chi', 'error');
        }
    }

    async function deleteSingleCategory(categoryName, source) {
        const confirmed = await showConfirmModal(
            `Bạn có chắc chắn muốn xóa "${categoryName}"?`,
            'Xác nhận xóa loại thu chi'
        );
        if (!confirmed) return;

        const voucherType = categoryTabToVoucherType(_categoryModalTab);

        try {
            if (source === 'predefined') {
                await db.removePredefinedCategory(categoryName, voucherType);
            } else {
                await db.deleteDynamicCategories([categoryName], voucherType);
            }
            populateCategoryDropdowns();
            showNotification(`Đã xóa: ${categoryName}`, 'success');
            renderCategoryList();
        } catch (error) {
            console.error('[SoquyUI] Error deleting category:', error);
            showNotification('Lỗi khi xóa loại thu chi', 'error');
        }
    }

    async function deleteSelectedCategories() {
        // On sources tab, this is handled by the sources tab checkbox handler
        if (_categoryModalTab === 'sources') return;

        const checkboxes = document.querySelectorAll('.category-item-checkbox:checked');
        if (checkboxes.length === 0) return;

        const confirmed = await showConfirmModal(
            `Bạn có chắc chắn muốn xóa ${checkboxes.length} mục đã chọn?`,
            'Xác nhận xóa loại thu chi'
        );
        if (!confirmed) return;

        const dynamicToDelete = [];
        const predefinedToDelete = [];

        checkboxes.forEach(cb => {
            if (cb.dataset.source === 'dynamic') {
                dynamicToDelete.push(cb.value);
            } else {
                predefinedToDelete.push(cb.value);
            }
        });

        const voucherType = categoryTabToVoucherType(_categoryModalTab);

        try {
            const promises = [];
            if (dynamicToDelete.length > 0) {
                promises.push(db.deleteDynamicCategories(dynamicToDelete, voucherType));
            }
            if (predefinedToDelete.length > 0) {
                promises.push(db.removePredefinedCategories(predefinedToDelete, voucherType));
            }
            await Promise.all(promises);

            const total = dynamicToDelete.length + predefinedToDelete.length;
            populateCategoryDropdowns();
            showNotification(`Đã xóa ${total} loại thu chi`, 'success');
            renderCategoryList();
        } catch (error) {
            console.error('[SoquyUI] Error deleting categories:', error);
            showNotification('Lỗi khi xóa loại thu chi', 'error');
        }
    }

    function handleCategoryTabSwitch(tabName) {
        _categoryModalTab = tabName;
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.catTab === tabName);
        });

        // Toggle delete button between categories and sources
        const catDeleteBtn = document.getElementById('btnDeleteSelectedCategories');
        const srcDeleteBtn = document.getElementById('btnDeleteSelectedSources');
        if (catDeleteBtn) catDeleteBtn.style.display = tabName === 'sources' ? 'none' : (document.querySelectorAll('.category-item-checkbox:checked').length > 0 ? 'inline-flex' : 'none');
        if (srcDeleteBtn) srcDeleteBtn.style.display = 'none';

        if (tabName === 'sources') {
            renderSourcesInCategoryModal();
        } else {
            renderCategoryList();
        }
    }

    /**
     * Render sources list inside the category modal (when "Nguồn" tab is active)
     */
    function renderSourcesInCategoryModal() {
        const listContainer = document.getElementById('categoryListItems');
        if (!listContainer) return;

        const sources = state.dynamicSources || [];
        let html = '';

        const defaultCode = db.getDefaultSource();
        sources.forEach(src => {
            const code = typeof src === 'string' ? src : src.code;
            const name = typeof src === 'string' ? src : src.name;
            const isDefault = code === defaultCode;
            html += `
                <div class="category-item" data-source-code="${escapeHtml(code)}">
                    <label class="category-check-label">
                        <input type="checkbox" class="category-item-checkbox source-tab-checkbox" value="${escapeHtml(code)}">
                        <span class="category-check-custom"></span>
                    </label>
                    <div class="category-item-info">
                        <div class="category-item-name"><strong>${escapeHtml(code)}</strong> - ${escapeHtml(name)}</div>
                    </div>
                    <span class="category-item-badge category-item-badge--source">Nguồn</span>
                    <button class="source-default-btn ${isDefault ? 'active' : ''}" data-source-code="${escapeHtml(code)}" title="${isDefault ? 'Đang là mặc định' : 'Chọn làm mặc định'}">
                        <i data-lucide="${isDefault ? 'star' : 'star'}"></i>
                        ${isDefault ? 'Mặc định' : 'Mặc định'}
                    </button>
                    <button class="category-item-delete" data-source-code="${escapeHtml(code)}" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>`;
        });

        if (sources.length === 0) {
            html = `
                <div class="category-list-empty">
                    <i data-lucide="inbox"></i>
                    <span>Chưa có nguồn nào</span>
                </div>`;
        }

        listContainer.innerHTML = html;

        // Reset select all
        const selectAll = document.getElementById('selectAllCategories');
        if (selectAll) selectAll.checked = false;

        // Hide categories delete btn, manage sources delete btn
        const catDeleteBtn = document.getElementById('btnDeleteSelectedCategories');
        if (catDeleteBtn) catDeleteBtn.style.display = 'none';

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind default source buttons
        listContainer.querySelectorAll('.source-default-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const code = btn.dataset.sourceCode;
                if (!code) return;
                const currentDefault = db.getDefaultSource();
                const newDefault = currentDefault === code ? '' : code;
                try {
                    await db.setDefaultSource(newDefault);
                    showNotification(newDefault ? `Đã chọn "${code}" làm nguồn mặc định` : 'Đã bỏ nguồn mặc định', 'success');
                    renderSourcesInCategoryModal();
                } catch (error) {
                    console.error('[SoquyUI] Error setting default source:', error);
                    showNotification('Lỗi khi đặt nguồn mặc định', 'error');
                }
            });
        });

        // Bind individual delete buttons
        listContainer.querySelectorAll('.category-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const code = btn.dataset.sourceCode;
                if (!code) return;
                const confirmed = await showConfirmModal(
                    `Bạn có chắc chắn muốn xóa nguồn "${code}"?`,
                    'Xác nhận xóa nguồn'
                );
                if (!confirmed) return;
                try {
                    // If deleting the default source, clear it
                    if (db.getDefaultSource() === code) {
                        await db.setDefaultSource('');
                    }
                    await db.deleteDynamicSources([code]);
                    showNotification(`Đã xóa nguồn: ${code}`, 'success');
                    populateCategorySourceDropdown();
                    populateCategoryDropdowns();
                    renderSourcesInCategoryModal();
                } catch (error) {
                    console.error('[SoquyUI] Error deleting source:', error);
                    showNotification('Lỗi khi xóa nguồn', 'error');
                }
            });
        });

        // Bind checkbox change events for bulk delete
        listContainer.querySelectorAll('.source-tab-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = document.querySelectorAll('.source-tab-checkbox:checked');
                const catDeleteBtn = document.getElementById('btnDeleteSelectedCategories');
                if (catDeleteBtn) {
                    if (checked.length > 0) {
                        catDeleteBtn.style.display = 'inline-flex';
                        catDeleteBtn.onclick = async () => {
                            const codes = [...checked].map(c => c.value);
                            const confirmed = await showConfirmModal(
                                `Bạn có chắc chắn muốn xóa ${codes.length} nguồn đã chọn?`,
                                'Xác nhận xóa nguồn'
                            );
                            if (!confirmed) return;
                            try {
                                await db.deleteDynamicSources(codes);
                                showNotification(`Đã xóa ${codes.length} nguồn`, 'success');
                                populateCategorySourceDropdown();
                                populateCategoryDropdowns();
                                renderSourcesInCategoryModal();
                            } catch (error) {
                                showNotification('Lỗi khi xóa nguồn', 'error');
                            }
                        };
                        const countSpan = document.getElementById('selectedCategoryCount');
                        if (countSpan) countSpan.textContent = checked.length;
                    } else {
                        catDeleteBtn.style.display = 'none';
                    }
                }
            });
        });
    }

    function handleSelectAllCategories(checked) {
        document.querySelectorAll('.category-item-checkbox').forEach(cb => {
            cb.checked = checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        if (_categoryModalTab !== 'sources') {
            updateDeleteSelectedButton();
        }
    }

    // =====================================================
    // MODAL: SOURCE MANAGEMENT
    // =====================================================

    function openSourceModal() {
        const modal = document.getElementById('soquySourceModal');
        if (!modal) return;

        // Clear form
        const codeInput = document.getElementById('newSourceCode');
        const nameInput = document.getElementById('newSourceName');
        if (codeInput) codeInput.value = '';
        if (nameInput) nameInput.value = '';

        // Render list
        renderSourceList();

        markModalOpened();
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function closeSourceModal() {
        const modal = document.getElementById('soquySourceModal');
        if (modal) modal.style.display = 'none';
    }

    function renderSourceList() {
        const listContainer = document.getElementById('sourceListItems');
        if (!listContainer) return;

        const sources = state.dynamicSources || [];
        let html = '';

        sources.forEach(src => {
            const code = typeof src === 'string' ? src : src.code;
            const name = typeof src === 'string' ? src : src.name;
            html += `
                <div class="category-item" data-source-code="${escapeHtml(code)}">
                    <label class="category-check-label">
                        <input type="checkbox" class="source-item-checkbox" value="${escapeHtml(code)}">
                        <span class="category-check-custom"></span>
                    </label>
                    <div class="category-item-info">
                        <div class="category-item-name"><strong>${escapeHtml(code)}</strong> - ${escapeHtml(name)}</div>
                    </div>
                    <button class="category-item-delete" data-source-code="${escapeHtml(code)}" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>`;
        });

        if (sources.length === 0) {
            html = `
                <div class="category-list-empty">
                    <i data-lucide="inbox"></i>
                    <span>Chưa có nguồn nào</span>
                </div>`;
        }

        listContainer.innerHTML = html;

        // Reset select all
        const selectAll = document.getElementById('selectAllSources');
        if (selectAll) selectAll.checked = false;

        updateSourceDeleteButton();

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind individual delete buttons
        listContainer.querySelectorAll('.category-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const code = btn.dataset.sourceCode;
                if (!code) return;
                await deleteSingleSource(code);
            });
        });

        // Bind checkbox change events
        listContainer.querySelectorAll('.source-item-checkbox').forEach(cb => {
            cb.addEventListener('change', updateSourceDeleteButton);
        });
    }

    function updateSourceDeleteButton() {
        const checkboxes = document.querySelectorAll('.source-item-checkbox:checked');
        const count = checkboxes.length;
        const btn = document.getElementById('btnDeleteSelectedSources');
        const countSpan = document.getElementById('selectedSourceCount');

        if (btn) {
            btn.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        if (countSpan) {
            countSpan.textContent = count;
        }
    }

    async function saveNewSource() {
        const codeInput = document.getElementById('newSourceCode');
        const nameInput = document.getElementById('newSourceName');
        const code = (codeInput?.value || '').trim().toUpperCase();
        const name = (nameInput?.value || '').trim();

        if (!code) {
            showNotification('Vui lòng nhập mã nguồn', 'error');
            if (codeInput) codeInput.focus();
            return;
        }
        if (!name) {
            showNotification('Vui lòng nhập tên nguồn', 'error');
            if (nameInput) nameInput.focus();
            return;
        }

        // Check if code already exists
        const existing = state.dynamicSources || [];
        if (existing.some(s => (typeof s === 'string' ? s : s.code) === code)) {
            showNotification('Mã nguồn này đã tồn tại', 'error');
            return;
        }

        try {
            await db.addSource({ code, name });
            showNotification(`Đã tạo nguồn: ${code} - ${name}`, 'success');

            // Clear form
            if (codeInput) codeInput.value = '';
            if (nameInput) nameInput.value = '';

            // Re-render list and re-populate dropdowns
            renderSourceList();
            populateCategorySourceDropdown();
            populateCategoryDropdowns();
        } catch (error) {
            console.error('[SoquyUI] Error saving source:', error);
            showNotification('Lỗi khi tạo nguồn', 'error');
        }
    }

    async function deleteSingleSource(sourceCode) {
        if (!sourceCode) return;

        const srcObj = db.getSourceByCode(sourceCode);
        const label = srcObj ? `${sourceCode} - ${srcObj.name}` : sourceCode;
        const confirmed = await showConfirmModal(
            `Bạn có chắc chắn muốn xóa nguồn "${label}"?`,
            'Xác nhận xóa nguồn'
        );
        if (!confirmed) return;

        try {
            await db.deleteDynamicSources([sourceCode]);
            showNotification(`Đã xóa: ${label}`, 'success');
            renderSourceList();
            populateCategorySourceDropdown();
            populateCategoryDropdowns();
        } catch (error) {
            console.error('[SoquyUI] Error deleting source:', error);
            showNotification('Lỗi khi xóa nguồn', 'error');
        }
    }

    async function deleteSelectedSources() {
        const checkboxes = document.querySelectorAll('.source-item-checkbox:checked');
        if (checkboxes.length === 0) return;

        const toDelete = [];
        checkboxes.forEach(cb => toDelete.push(cb.value));

        const confirmed = await showConfirmModal(
            `Bạn có chắc chắn muốn xóa ${toDelete.length} nguồn đã chọn?`,
            'Xác nhận xóa nguồn'
        );
        if (!confirmed) return;

        try {
            await db.deleteDynamicSources(toDelete);
            showNotification(`Đã xóa ${toDelete.length} nguồn`, 'success');
            renderSourceList();
            populateCategorySourceDropdown();
            populateCategoryDropdowns();
        } catch (error) {
            console.error('[SoquyUI] Error deleting sources:', error);
            showNotification('Lỗi khi xóa nguồn', 'error');
        }
    }

    function handleSelectAllSources(checked) {
        document.querySelectorAll('.source-item-checkbox').forEach(cb => {
            cb.checked = checked;
        });
        updateSourceDeleteButton();
    }

    // =====================================================
    // CONFIRM DELETE MODAL
    // =====================================================

    function showConfirmModal(message, title) {
        return new Promise((resolve) => {
            const modal = document.getElementById('soquyConfirmModal');
            const titleEl = document.getElementById('confirmModalTitle');
            const msgEl = document.getElementById('confirmModalMessage');
            const btnOk = document.getElementById('btnConfirmOk');
            const btnCancel = document.getElementById('btnConfirmCancel');
            const btnClose = document.getElementById('btnConfirmClose');
            const overlay = document.getElementById('soquyConfirmOverlay');

            if (!modal) { resolve(false); return; }

            if (titleEl) titleEl.textContent = title || 'Xác nhận xóa';
            if (msgEl) msgEl.textContent = message || 'Bạn có chắc chắn muốn xóa?';

            markModalOpened();
            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            function cleanup(result) {
                modal.style.display = 'none';
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                btnClose.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onCancel);
                resolve(result);
            }

            function onOk() { cleanup(true); }
            function onCancel() { cleanup(false); }

            btnOk.addEventListener('click', onOk);
            btnCancel.addEventListener('click', onCancel);
            btnClose.addEventListener('click', onCancel);
            overlay.addEventListener('click', () => {
                if (!isModalJustOpened()) onCancel();
            });
        });
    }

    // =====================================================
    // CATEGORY VALIDATION: Toggle save button
    // =====================================================

    function toggleSaveButton(modalType) {
        if (modalType === 'receipt') {
            const hasCategory = els.receiptCategory && els.receiptCategory.value !== '';
            if (els.btnSaveReceipt) els.btnSaveReceipt.disabled = !hasCategory;
            if (els.saveReceiptWrapper) {
                els.saveReceiptWrapper.classList.toggle('disabled', !hasCategory);
            }
        } else if (modalType === 'payment') {
            const hasCategory = els.paymentCategory && els.paymentCategory.value !== '';
            if (els.btnSavePayment) els.btnSavePayment.disabled = !hasCategory;
            if (els.savePaymentWrapper) {
                els.savePaymentWrapper.classList.toggle('disabled', !hasCategory);
            }
        }
    }

    // =====================================================
    // IMAGE UPLOAD INITIALIZATION
    // =====================================================

    function initImageHandlers() {
        receiptImageHandler = initImageUpload(
            els.receiptImageUpload,
            els.receiptImageFile,
            els.receiptImagePlaceholder,
            els.receiptImagePreview,
            els.receiptImagePreviewImg,
            els.receiptImageRemoveBtn
        );
        paymentImageHandler = initImageUpload(
            els.paymentImageUpload,
            els.paymentImageFile,
            els.paymentImagePlaceholder,
            els.paymentImagePreview,
            els.paymentImagePreviewImg,
            els.paymentImageRemoveBtn
        );
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        renderTable,
        renderTableHeader,
        updateSummaryStats,
        updatePagination,
        goToPage,
        updateSidebarTitle,
        initImageUpload,
        initImageHandlers,
        get receiptImageHandler() { return receiptImageHandler; },
        get paymentImageHandler() { return paymentImageHandler; },
        openReceiptModal,
        closeReceiptModal,
        saveReceipt,
        toggleSaveButton,
        openPaymentModal,
        closePaymentModal,
        savePayment,
        openDetailModal,
        closeDetailModal,
        openCancelModal,
        closeCancelModal,
        confirmCancelVoucher,
        openEditFromDetail,
        saveEditedVoucher,
        refreshData,
        refilterLocally,
        applyLocalFilters,
        handleFundTypeChange,
        handleTimeFilterChange,
        handleVoucherTypeFilterChange,
        handleStatusFilterChange,
        handleBusinessAccountingChange,
        handleSearchChange,
        handleCategoryFilterChange,
        handleCreatorFilterChange,
        handleEmployeeFilterChange,
        handleSourceFilterChange,
        initFilterSearchableDropdown,
        handlePageSizeChange,
        handleExport,
        populateCategoryDropdowns,
        populateCollectorDropdowns,
        populatePaymentCategoryDropdown,
        populateSourceSelect,
        saveFilterState,
        loadFilterState,
        restoreFilterUI,
        isPaymentType,
        isModalJustOpened,
        protectSelectElements,
        toggleColumnDropdown,
        renderColumnToggleDropdown,
        loadColumnVisibility,
        openImportModal,
        closeImportModal,
        handleImportFileChange,
        confirmImport,
        deleteAllVouchers,
        showNotification,
        escapeHtml,
        formatDateTimeForInput,
        parseAmountInput,
        openCategoryModal,
        closeCategoryModal,
        saveNewCategory,
        deleteSelectedCategories,
        handleCategoryTabSwitch,
        handleSelectAllCategories,
        renderCategoryList,
        toggleInlineSourceCreate,
        saveInlineSource,
        toggleCategorySourceRow,
        openSourceModal,
        closeSourceModal,
        saveNewSource,
        deleteSelectedSources,
        handleSelectAllSources
    };
})();

// Export
window.SoquyUI = SoquyUI;
