// Enhanced Goods Receipt Management System - Camera Functions
// Camera handling and file upload for main form and edit modal

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

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        notificationManager.error(
            "Kích thước file không được vượt quá 5MB",
            3000,
        );
        event.target.value = "";
        return;
    }

    const notifId = notificationManager.loading("Đang xử lý ảnh...");

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            // Store as blob for upload
            capturedImageBlob = file;
            capturedImageUrl = e.target.result;

            // Display the uploaded image
            displayCapturedImage();

            // Reset file input
            event.target.value = "";

            notificationManager.remove(notifId);
            notificationManager.success("Đã tải ảnh từ file thành công!", 2000);
        } catch (error) {
            console.error("Error processing file:", error);
            notificationManager.remove(notifId);
            notificationManager.error(
                "Lỗi khi xử lý file: " + error.message,
                3000,
            );
        }
    };

    reader.onerror = function () {
        notificationManager.remove(notifId);
        notificationManager.error("Lỗi khi đọc file", 3000);
        event.target.value = "";
    };

    reader.readAsDataURL(file);
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

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        notificationManager.error(
            "Kích thước file không được vượt quá 5MB",
            3000,
        );
        event.target.value = "";
        return;
    }

    const notifId = notificationManager.loading("Đang xử lý ảnh...");

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            // Store as blob for upload
            editCapturedImageBlob = file;
            editCapturedImageUrl = e.target.result;
            editKeepCurrentImage = false;

            // Display the uploaded image
            displayEditCapturedImage();

            // Stop camera if running
            stopEditCamera();

            // Reset file input
            event.target.value = "";

            notificationManager.remove(notifId);
            notificationManager.success("Đã tải ảnh từ file thành công!", 2000);
        } catch (error) {
            console.error("Error processing file:", error);
            notificationManager.remove(notifId);
            notificationManager.error(
                "Lỗi khi xử lý file: " + error.message,
                3000,
            );
        }
    };

    reader.onerror = function () {
        notificationManager.remove(notifId);
        notificationManager.error("Lỗi khi đọc file", 3000);
        event.target.value = "";
    };

    reader.readAsDataURL(file);
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
        const canvas = cameraCanvas;
        const context = canvas.getContext("2d");

        // Draw current video frame to canvas
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    capturedImageBlob = blob;
                    capturedImageUrl = URL.createObjectURL(blob);

                    // Display captured image
                    displayCapturedImage();

                    // Stop camera
                    stopCamera();

                    notificationManager.success(
                        "Đã chụp ảnh thành công!",
                        2000,
                    );
                } else {
                    notificationManager.error("Không thể chụp ảnh!", 3000);
                }
            },
            "image/jpeg",
            0.8,
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
        const canvas = editCameraCanvas;
        const context = canvas.getContext("2d");

        context.drawImage(editCameraVideo, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    editCapturedImageBlob = blob;
                    editCapturedImageUrl = URL.createObjectURL(blob);
                    editKeepCurrentImage = false;

                    displayEditCapturedImage();
                    stopEditCamera();

                    notificationManager.success(
                        "Đã chụp ảnh mới thành công!",
                        2000,
                    );
                } else {
                    notificationManager.error("Không thể chụp ảnh!", 3000);
                }
            },
            "image/jpeg",
            0.8,
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

// Upload captured image to Firebase Storage
async function uploadCapturedImage() {
    if (!capturedImageBlob) {
        return null; // No image captured
    }

    let notifId = null;
    try {
        notifId = notificationManager.uploading(1, 1);

        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(capturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {
                    // Calculate upload progress
                    const progress =
                        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log("Upload is " + progress + "% done");
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
                            console.log("Image uploaded successfully");
                            if (notifId) notificationManager.remove(notifId);
                            notificationManager.success(
                                "Tải ảnh lên thành công!",
                                2000,
                            );
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
