// Enhanced Goods Receipt Management System - Camera Functions
// Camera handling and file upload for main form and edit modal

// =====================================================
// EAGER UPLOAD STATE
// =====================================================

/**
 * Eager upload: upload ảnh lên Firebase ngay khi chọn/chụp,
 * không đợi user nhấn Lưu.
 */
var pendingImageUpload = {
    promise: null,       // Promise<string> — resolves with downloadURL
    status: 'idle',      // 'idle' | 'uploading' | 'done' | 'error'
    url: null,           // downloadURL khi upload xong
    uploadTask: null,    // Firebase uploadTask (để cancel)
    error: null,         // Error object nếu fail
};

/** Detect mobile */
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

/**
 * Upload blob lên Firebase Storage ngay lập tức (eager).
 * Cập nhật progress bar trên preview area.
 * @param {Blob} blob
 * @param {string} previewContainerId - ID của container hiển thị progress
 * @returns {Promise<string>} downloadURL
 */
function eagerUploadImage(blob, previewContainerId) {
    // Cancel previous upload nếu có
    cancelPendingUpload();

    console.log('eagerUploadImage started. Blob size:', (blob.size / 1024).toFixed(0) + 'KB');
    notificationManager.info('[Debug] Eager upload bắt đầu (' + (blob.size / 1024).toFixed(0) + 'KB)', 3000);

    const imageName = generateUniqueFileName();
    const imageRef = storageRef.child('nhanhang/photos/' + imageName);
    const uploadTask = imageRef.put(blob, newMetadata);

    pendingImageUpload.uploadTask = uploadTask;
    pendingImageUpload.status = 'uploading';
    pendingImageUpload.url = null;
    pendingImageUpload.error = null;

    // Show progress bar
    showUploadProgress(previewContainerId, 0);

    pendingImageUpload.promise = new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            function(snapshot) {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                showUploadProgress(previewContainerId, progress);
            },
            function(error) {
                // Upload failed
                pendingImageUpload.status = 'error';
                pendingImageUpload.error = error;
                showUploadError(previewContainerId);
                console.error('Eager upload error:', error);
                notificationManager.error('[Debug] Eager upload LỖI: ' + error.message, 5000);
                reject(error);
            },
            function() {
                // Upload complete
                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                    pendingImageUpload.status = 'done';
                    pendingImageUpload.url = downloadURL;
                    showUploadDone(previewContainerId);
                    console.log('Eager upload done:', downloadURL);
                    notificationManager.success('[Debug] Eager upload XONG! Status=' + pendingImageUpload.status, 4000);
                    resolve(downloadURL);
                }).catch(function(error) {
                    pendingImageUpload.status = 'error';
                    pendingImageUpload.error = error;
                    showUploadError(previewContainerId);
                    notificationManager.error('[Debug] Eager getURL LỖI: ' + error.message, 5000);
                    reject(error);
                });
            }
        );
    });

    return pendingImageUpload.promise;
}

/** Cancel pending upload nếu đang chạy */
function cancelPendingUpload() {
    if (pendingImageUpload.uploadTask && pendingImageUpload.status === 'uploading') {
        try {
            pendingImageUpload.uploadTask.cancel();
            console.log('Cancelled pending upload');
        } catch (e) {
            console.warn('Error cancelling upload:', e);
        }
    }
    pendingImageUpload.promise = null;
    pendingImageUpload.status = 'idle';
    pendingImageUpload.url = null;
    pendingImageUpload.uploadTask = null;
    pendingImageUpload.error = null;
}

// =====================================================
// UPLOAD PROGRESS UI
// =====================================================

function showUploadProgress(containerId, percent) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let bar = container.querySelector('.upload-progress-overlay');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'upload-progress-overlay';
        bar.innerHTML = '<div class="upload-progress-bar"></div><span class="upload-progress-text">0%</span>';
        container.style.position = 'relative';
        container.appendChild(bar);
    }

    const fill = bar.querySelector('.upload-progress-bar');
    const text = bar.querySelector('.upload-progress-text');
    if (fill) fill.style.width = percent + '%';
    if (text) text.textContent = Math.round(percent) + '%';
}

function showUploadDone(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const bar = container.querySelector('.upload-progress-overlay');
    if (bar) {
        bar.innerHTML = '<span class="upload-progress-text upload-done">✓ Đã tải lên</span>';
        setTimeout(() => { if (bar.parentNode) bar.remove(); }, 2000);
    }
}

function showUploadError(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const bar = container.querySelector('.upload-progress-overlay');
    if (bar) {
        bar.innerHTML = '<span class="upload-progress-text upload-error">✗ Lỗi tải lên</span>';
    }
}

function removeUploadProgress(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const bar = container.querySelector('.upload-progress-overlay');
    if (bar) bar.remove();
}

// =====================================================
// CAMERA INITIALIZATION
// =====================================================

function initializeCameraSystem() {
    if (startCameraButton) {
        startCameraButton.addEventListener("click", startCamera);
    }

    if (takePictureButton) {
        takePictureButton.addEventListener("click", takePicture);
    }

    if (retakePictureButton) {
        retakePictureButton.addEventListener("click", retakePicture);
    }

    // Edit camera events
    if (editStartCameraButton) {
        editStartCameraButton.addEventListener("click", startEditCamera);
    }

    if (editTakePictureButton) {
        editTakePictureButton.addEventListener("click", takeEditPicture);
    }

    if (editRetakePictureButton) {
        editRetakePictureButton.addEventListener("click", retakeEditPicture);
    }

    if (editKeepCurrentImageButton) {
        editKeepCurrentImageButton.addEventListener("click", keepCurrentImage);
    }

    // Initialize file uploads
    initializeMainFileUpload();
    initializeEditFileUpload();
}
/**
 * Nén ảnh client-side bằng Canvas API
 * @param {File|Blob} file - File ảnh gốc
 * @param {number} maxWidth - Chiều rộng tối đa (px), default 1920
 * @param {number} quality - Chất lượng JPEG 0-1, default 0.7
 * @returns {Promise<Blob>} - Blob ảnh đã nén
 */
function compressImage(file, maxWidth, quality) {
    // Mobile: nén mạnh hơn (1024px, quality 0.5) để upload nhanh
    if (typeof maxWidth === 'undefined') {
        maxWidth = isMobileDevice() ? 1024 : 1920;
    }
    if (typeof quality === 'undefined') {
        quality = isMobileDevice() ? 0.5 : 0.7;
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = function () {
            URL.revokeObjectURL(url);

            let width = img.width;
            let height = img.height;

            // Only resize if larger than maxWidth
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        console.log(
                            `Nén ảnh: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(blob.size / 1024 / 1024).toFixed(2)}MB`,
                        );
                        resolve(blob);
                    } else {
                        reject(new Error("Không thể nén ảnh"));
                    }
                },
                "image/jpeg",
                quality,
            );
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("Không thể đọc file ảnh"));
        };

        img.src = url;
    });
}


// =====================================================
// MAIN FORM FILE UPLOAD
// =====================================================

function initializeMainFileUpload() {
    if (uploadFileButton && fileInput) {
        uploadFileButton.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", handleMainFileSelect);
    }
}

function handleMainFileSelect(event) {
    const file = event.target.files[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
        notificationManager.error(
            "Vui lòng chọn file ảnh hợp lệ (JPG, PNG, ...)",
            3000,
        );
        event.target.value = "";
        return;
    }

    // Validate file size (max 15MB before compression)
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
        notificationManager.error(
            "Kích thước file không được vượt quá 15MB",
            3000,
        );
        event.target.value = "";
        return;
    }

    const notifId = notificationManager.loading("Đang nén ảnh...");

    compressImage(file)
        .then((compressedBlob) => {
            capturedImageBlob = compressedBlob;
            capturedImageUrl = URL.createObjectURL(compressedBlob);

            // Display the uploaded image
            displayCapturedImage();

            // Reset file input
            event.target.value = "";

            notificationManager.remove(notifId);
            const sizeMB = (compressedBlob.size / 1024 / 1024).toFixed(1);
            notificationManager.success(
                `Đã tải ảnh thành công! (${sizeMB}MB)`,
                2000,
            );

            // Eager upload ngay sau khi nén
            eagerUploadImage(compressedBlob, 'imageDisplayArea').catch(function(err) {
                console.warn('Eager upload failed (will retry on save):', err.message);
            });
        })
        .catch((error) => {
            console.error("Error compressing file:", error);
            notificationManager.remove(notifId);
            // Fallback: use original file
            const reader = new FileReader();
            reader.onload = function (e) {
                capturedImageBlob = file;
                capturedImageUrl = e.target.result;
                displayCapturedImage();
                event.target.value = "";
                notificationManager.success(
                    "Đã tải ảnh (không nén được)",
                    2000,
                );
                // Eager upload fallback
                eagerUploadImage(file, 'imageDisplayArea').catch(function(err) {
                    console.warn('Eager upload fallback failed:', err.message);
                });
            };
            reader.readAsDataURL(file);
        });
}

// =====================================================
// EDIT FORM FILE UPLOAD
// =====================================================

function initializeEditFileUpload() {
    if (editUploadFileButton && editFileInput) {
        editUploadFileButton.addEventListener("click", () => {
            editFileInput.click();
        });

        editFileInput.addEventListener("change", handleEditFileSelect);
    }
}

function handleEditFileSelect(event) {
    const file = event.target.files[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
        notificationManager.error(
            "Vui lòng chọn file ảnh hợp lệ (JPG, PNG, ...)",
            3000,
        );
        event.target.value = "";
        return;
    }

    // Validate file size (max 15MB before compression)
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
        notificationManager.error(
            "Kích thước file không được vượt quá 15MB",
            3000,
        );
        event.target.value = "";
        return;
    }

    const notifId = notificationManager.loading("Đang nén ảnh...");

    compressImage(file, 1920, 0.7)
        .then((compressedBlob) => {
            editCapturedImageBlob = compressedBlob;
            editCapturedImageUrl = URL.createObjectURL(compressedBlob);
            editKeepCurrentImage = false;

            // Display the uploaded image
            displayEditCapturedImage();

            // Stop camera if running
            stopEditCamera();

            // Reset file input
            event.target.value = "";

            notificationManager.remove(notifId);
            const sizeMB = (compressedBlob.size / 1024 / 1024).toFixed(1);
            notificationManager.success(
                `Đã tải ảnh thành công! (${sizeMB}MB)`,
                2000,
            );
        })
        .catch((error) => {
            console.error("Error compressing edit file:", error);
            notificationManager.remove(notifId);
            // Fallback: use original file
            const reader = new FileReader();
            reader.onload = function (e) {
                editCapturedImageBlob = file;
                editCapturedImageUrl = e.target.result;
                editKeepCurrentImage = false;
                displayEditCapturedImage();
                stopEditCamera();
                event.target.value = "";
                notificationManager.success(
                    "Đã tải ảnh (không nén được)",
                    2000,
                );
            };
            reader.readAsDataURL(file);
        });
}

// =====================================================
// MAIN CAMERA FUNCTIONS
// =====================================================

// Start camera
async function startCamera() {
    let notifId = null;
    try {
        notifId = notificationManager.loading("Đang khởi động camera...");

        const constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: "environment", // Use back camera if available
            },
        };

        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cameraVideo) {
            cameraVideo.srcObject = cameraStream;
            cameraVideo.play();

            cameraVideo.addEventListener("loadedmetadata", () => {
                // Adjust canvas size to match video
                if (cameraCanvas) {
                    cameraCanvas.width = cameraVideo.videoWidth;
                    cameraCanvas.height = cameraVideo.videoHeight;
                }
            });
        }

        // Create overlay controls if they don't exist
        createCameraOverlay();

        // Update UI
        if (startCameraButton) startCameraButton.style.display = "none";
        if (cameraPreview) cameraPreview.style.display = "block";

        if (notifId) notificationManager.remove(notifId);
        notificationManager.success("Camera đã sẵn sàng!", 2000);
    } catch (error) {
        console.error("Error accessing camera:", error);
        if (notifId) notificationManager.remove(notifId);

        let errorMessage = "Không thể truy cập camera. ";
        if (error.name === "NotAllowedError") {
            errorMessage += "Vui lòng cho phép truy cập camera.";
        } else if (error.name === "NotFoundError") {
            errorMessage += "Không tìm thấy camera.";
        } else {
            errorMessage += "Lỗi: " + error.message;
        }

        notificationManager.error(errorMessage, 4000);
    }
}

// Create camera overlay controls
function createCameraOverlay() {
    if (!cameraPreview) return;

    // Check if overlay already exists
    let overlay = cameraPreview.querySelector(".camera-overlay-controls");
    if (overlay) return;

    // Create top controls
    let topControls = document.createElement("div");
    topControls.className = "camera-top-controls";
    topControls.innerHTML = `
        <div class="camera-mode-indicator">
            <i data-lucide="camera"></i>
            <span>Chụp ảnh</span>
        </div>
    `;

    // Create bottom overlay controls
    overlay = document.createElement("div");
    overlay.className = "camera-overlay-controls";

    // Create capture button
    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "camera-capture-button";
    captureBtn.id = "takePictureOverlay";
    captureBtn.setAttribute("aria-label", "Chụp ảnh");
    captureBtn.addEventListener("click", takePicture);

    overlay.appendChild(captureBtn);

    cameraPreview.appendChild(topControls);
    cameraPreview.appendChild(overlay);

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// Take picture
function takePicture() {
    if (!cameraVideo || !cameraCanvas) {
        notificationManager.error("Camera chưa sẵn sàng!", 3000);
        return;
    }

    try {
        // Resize if video is larger than 1920px wide
        const videoW = cameraVideo.videoWidth;
        const videoH = cameraVideo.videoHeight;
        const maxW = 1920;
        let outW = videoW;
        let outH = videoH;
        if (videoW > maxW) {
            outH = Math.round((videoH * maxW) / videoW);
            outW = maxW;
        }

        const canvas = cameraCanvas;
        canvas.width = outW;
        canvas.height = outH;
        const context = canvas.getContext("2d");
        context.drawImage(cameraVideo, 0, 0, outW, outH);

        // Convert to blob with quality based on device
        const jpegQuality = isMobileDevice() ? 0.5 : 0.7;
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    capturedImageBlob = blob;
                    capturedImageUrl = URL.createObjectURL(blob);

                    displayCapturedImage();
                    stopCamera();

                    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
                    notificationManager.success(
                        `Đã chụp ảnh thành công! (${sizeMB}MB)`,
                        2000,
                    );

                    // Eager upload ngay sau khi chụp
                    eagerUploadImage(blob, 'imageDisplayArea').catch(function(err) {
                        console.warn('Eager upload after capture failed:', err.message);
                    });
                } else {
                    notificationManager.error("Không thể chụp ảnh!", 3000);
                }
            },
            "image/jpeg",
            jpegQuality,
        );
    } catch (error) {
        console.error("Error taking picture:", error);
        notificationManager.error("Lỗi khi chụp ảnh: " + error.message, 3000);
    }
}

// Display captured image (WITHOUT watermark)
function displayCapturedImage() {
    if (imageDisplayArea && capturedImageUrl) {
        imageDisplayArea.innerHTML = "";

        const img = document.createElement("img");
        img.src = capturedImageUrl;
        img.alt = "Ảnh đã chụp";
        img.className = "captured-image";

        imageDisplayArea.appendChild(img);
        imageDisplayArea.classList.add("has-content");

        // Update UI
        if (takePictureButton) takePictureButton.style.display = "none";
        if (retakePictureButton)
            retakePictureButton.style.display = "inline-flex";
    }
}

// Retake picture
function retakePicture() {
    // Cancel pending eager upload
    cancelPendingUpload();
    removeUploadProgress('imageDisplayArea');

    // Clear captured image
    capturedImageUrl = null;
    capturedImageBlob = null;

    if (imageDisplayArea) {
        imageDisplayArea.innerHTML =
            "<p>📷 Ảnh sẽ hiển thị ở đây sau khi chụp</p>";
        imageDisplayArea.classList.remove("has-content");
    }

    // Show start camera button again
    if (startCameraButton) startCameraButton.style.display = "inline-flex";
    if (takePictureButton) takePictureButton.style.display = "none";
    if (retakePictureButton) retakePictureButton.style.display = "none";
    if (cameraPreview) cameraPreview.style.display = "none";
}

// Stop camera
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }

    if (cameraPreview) {
        cameraPreview.style.display = "none";

        // Remove overlay controls
        const overlay = cameraPreview.querySelector(".camera-overlay-controls");
        const topControls = cameraPreview.querySelector(".camera-top-controls");
        if (overlay) overlay.remove();
        if (topControls) topControls.remove();
    }
}

// =====================================================
// EDIT CAMERA FUNCTIONS
// =====================================================

// Start camera for editing
async function startEditCamera() {
    let notifId = null;
    try {
        notifId = notificationManager.loading("Đang khởi động camera...");

        const constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: "environment",
            },
        };

        editCameraStream =
            await navigator.mediaDevices.getUserMedia(constraints);

        if (editCameraVideo) {
            editCameraVideo.srcObject = editCameraStream;
            editCameraVideo.play();

            editCameraVideo.addEventListener("loadedmetadata", () => {
                if (editCameraCanvas) {
                    editCameraCanvas.width = editCameraVideo.videoWidth;
                    editCameraCanvas.height = editCameraVideo.videoHeight;
                }
            });
        }

        // Create overlay controls for edit camera
        createEditCameraOverlay();

        // Update UI
        if (editStartCameraButton) editStartCameraButton.style.display = "none";
        if (editCameraPreview) editCameraPreview.style.display = "block";
        if (editImageDisplayArea) editImageDisplayArea.style.display = "flex";

        editKeepCurrentImage = false; // Reset when starting new camera

        if (notifId) notificationManager.remove(notifId);
        notificationManager.success("Camera edit đã sẵn sàng!", 2000);
    } catch (error) {
        console.error("Error accessing edit camera:", error);
        if (notifId) notificationManager.remove(notifId);
        notificationManager.error(
            "Không thể truy cập camera: " + error.message,
            4000,
        );
    }
}

// Create edit camera overlay controls
function createEditCameraOverlay() {
    if (!editCameraPreview) return;

    // Check if overlay already exists
    let overlay = editCameraPreview.querySelector(".camera-overlay-controls");
    if (overlay) return;

    // Create top controls
    let topControls = document.createElement("div");
    topControls.className = "camera-top-controls";
    topControls.innerHTML = `
        <div class="camera-mode-indicator">
            <i data-lucide="camera"></i>
            <span>Chụp ảnh mới</span>
        </div>
    `;

    // Create bottom overlay controls
    overlay = document.createElement("div");
    overlay.className = "camera-overlay-controls";

    // Keep current image button (left side)
    const keepBtn = document.createElement("button");
    keepBtn.type = "button";
    keepBtn.className = "camera-side-control";
    keepBtn.id = "editKeepCurrentImageOverlay";
    keepBtn.setAttribute("aria-label", "Giữ ảnh cũ");
    keepBtn.innerHTML = '<i data-lucide="check"></i>';
    keepBtn.addEventListener("click", keepCurrentImage);

    // Create capture button (center)
    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "camera-capture-button";
    captureBtn.id = "editTakePictureOverlay";
    captureBtn.setAttribute("aria-label", "Chụp ảnh");
    captureBtn.addEventListener("click", takeEditPicture);

    // Retake button (right side)
    const retakeBtn = document.createElement("button");
    retakeBtn.type = "button";
    retakeBtn.className = "camera-side-control";
    retakeBtn.id = "editRetakePictureOverlay";
    retakeBtn.setAttribute("aria-label", "Chụp lại");
    retakeBtn.innerHTML = '<i data-lucide="rotate-ccw"></i>';
    retakeBtn.addEventListener("click", retakeEditPicture);

    overlay.appendChild(keepBtn);
    overlay.appendChild(captureBtn);
    overlay.appendChild(retakeBtn);

    editCameraPreview.appendChild(topControls);
    editCameraPreview.appendChild(overlay);

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// Take picture for editing
function takeEditPicture() {
    if (!editCameraVideo || !editCameraCanvas) {
        notificationManager.error("Camera chưa sẵn sàng!", 3000);
        return;
    }

    try {
        const videoW = editCameraVideo.videoWidth;
        const videoH = editCameraVideo.videoHeight;
        const maxW = 1920;
        let outW = videoW;
        let outH = videoH;
        if (videoW > maxW) {
            outH = Math.round((videoH * maxW) / videoW);
            outW = maxW;
        }

        const canvas = editCameraCanvas;
        canvas.width = outW;
        canvas.height = outH;
        const context = canvas.getContext("2d");
        context.drawImage(editCameraVideo, 0, 0, outW, outH);

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    editCapturedImageBlob = blob;
                    editCapturedImageUrl = URL.createObjectURL(blob);
                    editKeepCurrentImage = false;

                    displayEditCapturedImage();
                    stopEditCamera();

                    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
                    notificationManager.success(
                        `Đã chụp ảnh mới thành công! (${sizeMB}MB)`,
                        2000,
                    );
                } else {
                    notificationManager.error("Không thể chụp ảnh!", 3000);
                }
            },
            "image/jpeg",
            0.7,
        );
    } catch (error) {
        console.error("Error taking edit picture:", error);
        notificationManager.error("Lỗi khi chụp ảnh: " + error.message, 3000);
    }
}

// Display captured image for editing (WITHOUT watermark)
function displayEditCapturedImage() {
    if (editImageDisplayArea && editCapturedImageUrl) {
        editImageDisplayArea.innerHTML = "";

        const img = document.createElement("img");
        img.src = editCapturedImageUrl;
        img.alt = "Ảnh mới đã chụp";
        img.className = "captured-image";

        editImageDisplayArea.appendChild(img);
        editImageDisplayArea.classList.add("has-content");
        editImageDisplayArea.style.display = "flex";
    }
}

// Retake picture for editing
function retakeEditPicture() {
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    if (editImageDisplayArea) {
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }

    // Restart camera
    startEditCamera();
}

// Keep current image
function keepCurrentImage() {
    editKeepCurrentImage = true;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    console.log(
        "Keeping current image. editCurrentImageUrl:",
        editCurrentImageUrl,
    );

    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = "none";
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }

    stopEditCamera();
    resetEditCameraUI();

    notificationManager.success("Sẽ giữ ảnh hiện tại!", 2000);
}

// Stop edit camera
function stopEditCamera() {
    if (editCameraStream) {
        editCameraStream.getTracks().forEach((track) => track.stop());
        editCameraStream = null;
    }

    if (editCameraVideo) {
        editCameraVideo.srcObject = null;
    }

    if (editCameraPreview) {
        editCameraPreview.style.display = "none";

        // Remove overlay controls
        const overlay = editCameraPreview.querySelector(
            ".camera-overlay-controls",
        );
        const topControls = editCameraPreview.querySelector(
            ".camera-top-controls",
        );
        if (overlay) overlay.remove();
        if (topControls) topControls.remove();
    }
}

// Reset edit camera UI
function resetEditCameraUI() {
    if (editStartCameraButton)
        editStartCameraButton.style.display = "inline-flex";
    if (editTakePictureButton) editTakePictureButton.style.display = "none";
    if (editRetakePictureButton) editRetakePictureButton.style.display = "none";
    if (editKeepCurrentImageButton)
        editKeepCurrentImageButton.style.display = "none";
    if (editCameraPreview) {
        editCameraPreview.style.display = "none";

        // Remove overlay controls
        const overlay = editCameraPreview.querySelector(
            ".camera-overlay-controls",
        );
        const topControls = editCameraPreview.querySelector(
            ".camera-top-controls",
        );
        if (overlay) overlay.remove();
        if (topControls) topControls.remove();
    }
    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = "none";
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }
}

// =====================================================
// IMAGE UPLOAD FUNCTIONS
// =====================================================

// Upload captured image — sử dụng kết quả eager upload nếu có
async function uploadCapturedImage() {
    if (!capturedImageBlob) {
        return null; // No image captured
    }

    console.log('uploadCapturedImage called. pendingImageUpload.status:', pendingImageUpload.status);
    notificationManager.info('[Debug] uploadCapturedImage: status=' + pendingImageUpload.status, 3000);

    // Nếu eager upload đã xong → trả URL ngay (KHÔNG upload lại)
    if (pendingImageUpload.status === 'done' && pendingImageUpload.url) {
        console.log('Using eager upload result:', pendingImageUpload.url);
        notificationManager.success('[Debug] Dùng eager result ✓', 3000);
        return pendingImageUpload.url;
    }

    // Nếu đang upload → đợi xong
    if (pendingImageUpload.status === 'uploading' && pendingImageUpload.promise) {
        console.log('Waiting for eager upload to finish...');
        notificationManager.info('[Debug] Đang chờ eager upload...', 3000);
        const notifId = notificationManager.loading('Đang chờ tải ảnh lên...');
        try {
            const url = await pendingImageUpload.promise;
            notificationManager.remove(notifId);
            console.log('Eager upload finished while waiting:', url);
            notificationManager.success('[Debug] Eager xong sau khi chờ ✓', 3000);
            return url;
        } catch (error) {
            notificationManager.remove(notifId);
            console.warn('Eager upload failed while waiting, falling back to direct upload:', error.message);
            notificationManager.error('[Debug] Eager lỗi khi chờ: ' + error.message, 4000);
            // Fall through to direct upload below
        }
    }

    // Nếu eager upload lỗi nhưng promise vẫn còn → thử await lần nữa
    if (pendingImageUpload.status === 'error' && pendingImageUpload.promise) {
        console.log('Eager upload had error, checking promise...');
        notificationManager.error('[Debug] Eager lỗi, status=error', 4000);
        // Promise đã reject rồi, skip và fallback
    }

    // Fallback: upload trực tiếp (nếu eager upload chưa chạy hoặc lỗi)
    console.log('Falling back to direct upload...');
    notificationManager.warning('[Debug] Fallback direct upload, status=' + pendingImageUpload.status, 4000);
    let notifId = null;
    try {
        notifId = notificationManager.loading('Đang tải ảnh lên...');

        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child('nhanhang/photos/' + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(capturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {
                    const progress =
                        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log("Direct upload is " + progress + "% done");
                },
                function (error) {
                    console.error("Error uploading image:", error);
                    if (notifId) notificationManager.remove(notifId);
                    notificationManager.error(
                        "Lỗi khi tải ảnh lên: " + error.message,
                        4000,
                    );
                    reject(error);
                },
                function () {
                    uploadTask.snapshot.ref
                        .getDownloadURL()
                        .then(function (downloadURL) {
                            console.log("Direct upload successful:", downloadURL);
                            if (notifId) notificationManager.remove(notifId);
                            resolve(downloadURL);
                        })
                        .catch((error) => {
                            if (notifId) notificationManager.remove(notifId);
                            notificationManager.error(
                                "Lỗi khi lấy URL ảnh: " + error.message,
                                4000,
                            );
                            reject(error);
                        });
                },
            );
        });
    } catch (error) {
        console.error("Error in image upload process:", error);
        if (notifId) notificationManager.remove(notifId);
        notificationManager.error(
            "Lỗi trong quá trình upload: " + error.message,
            4000,
        );
        throw error;
    }
}

// Upload captured image for editing
async function uploadEditCapturedImage() {
    if (!editCapturedImageBlob) {
        return null;
    }

    let notifId = null;
    try {
        notifId = notificationManager.uploading(1, 1);

        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(editCapturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {
                    const progress =
                        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log("Edit image upload is " + progress + "% done");
                },
                function (error) {
                    console.error("Error uploading edit image:", error);
                    if (notifId) notificationManager.remove(notifId);
                    notificationManager.error(
                        "Lỗi khi tải ảnh edit lên: " + error.message,
                        4000,
                    );
                    reject(error);
                },
                function () {
                    uploadTask.snapshot.ref
                        .getDownloadURL()
                        .then(function (downloadURL) {
                            console.log("Edit image uploaded successfully");
                            if (notifId) notificationManager.remove(notifId);
                            notificationManager.success(
                                "Tải ảnh edit lên thành công!",
                                2000,
                            );
                            resolve(downloadURL);
                        })
                        .catch((error) => {
                            if (notifId) notificationManager.remove(notifId);
                            notificationManager.error(
                                "Lỗi khi lấy URL ảnh edit: " + error.message,
                                4000,
                            );
                            reject(error);
                        });
                },
            );
        });
    } catch (error) {
        console.error("Error in edit image upload process:", error);
        if (notifId) notificationManager.remove(notifId);
        notificationManager.error(
            "Lỗi trong quá trình upload edit: " + error.message,
            4000,
        );
        throw error;
    }
}
