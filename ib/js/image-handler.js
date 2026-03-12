// =====================================================
// IMAGE PROCESSING AND UPLOAD HANDLER - OPTIMIZED
// =====================================================

class ImageHandler {
    constructor() {
        this.imgArray = [];
        this.imgArrayKH = [];
        this.imageUrlFile = [];
        this.imageUrlFileKH = [];
        this.pastedImageUrl = null;
        this.isUrlPasted = false;
        this.pastedImageUrlKH = null;
        this.isUrlPastedKH = false;

        this.initializeClipboardHandlers();
    }

    // Initialize clipboard paste handlers
    initializeClipboardHandlers() {
        const inputClipboardContainer = document.getElementById("container");
        const inputClipboardContainerKH =
            document.getElementById("containerKH");

        // SP clipboard handler
        if (inputClipboardContainer) {
            inputClipboardContainer.addEventListener(
                "paste",
                this.handleSPPaste.bind(this),
            );
        }

        // KH clipboard handler
        if (inputClipboardContainerKH) {
            inputClipboardContainerKH.addEventListener(
                "paste",
                this.handleKHPaste.bind(this),
            );
        }
    }

    // Handle SP image paste
    async handleSPPaste(e) {
        const inputClipboardRadio = document.getElementById("inputClipboard");
        if (!inputClipboardRadio || !inputClipboardRadio.checked) return;

        this.imgArray = [];
        this.pastedImageUrl = null;
        this.isUrlPasted = false;
        e.preventDefault();

        // Check for text (URL) first
        const text = e.clipboardData.getData("text");
        if (Utils.isValidImageUrl(text)) {
            this.handleUrlPaste(text, e.currentTarget, "sp");
            return;
        }

        // Handle image data from clipboard
        await this.handleImagePaste(e, e.currentTarget, "sp");
    }

    // Handle KH image paste
    async handleKHPaste(e) {
        const inputClipboardRadioKH =
            document.getElementById("inputClipboardKH");
        if (!inputClipboardRadioKH || !inputClipboardRadioKH.checked) return;

        this.imgArrayKH = [];
        this.pastedImageUrlKH = null;
        this.isUrlPastedKH = false;
        e.preventDefault();

        // Check for text (URL) first
        const text = e.clipboardData.getData("text");
        if (Utils.isValidImageUrl(text)) {
            this.handleUrlPaste(text, e.currentTarget, "kh");
            return;
        }

        // Handle image data from clipboard
        await this.handleImagePaste(e, e.currentTarget, "kh");
    }

    // Handle URL paste
    handleUrlPaste(url, container, type) {
        try {
            // Clear old content
            container.innerHTML = "";

            // Create img element for preview
            const imgElement = Utils.createElement("img", {
                src: url,
                className: "clipboard-image",
                alt: "Image preview",
            });

            imgElement.onload = () => {
                console.log(
                    `${type.toUpperCase()} URL image preview loaded successfully`,
                );
            };

            imgElement.onerror = () => {
                console.error(
                    `Failed to load ${type.toUpperCase()} image preview from URL`,
                );
                imgElement.alt = "Image preview (may have CORS issues)";
            };

            container.appendChild(imgElement);

            // Save URL for submission
            if (type === "sp") {
                this.pastedImageUrl = url;
                this.isUrlPasted = true;
            } else {
                this.pastedImageUrlKH = url;
                this.isUrlPastedKH = true;
            }

            console.log(`${type.toUpperCase()} URL pasted and saved:`, url);
        } catch (error) {
            console.error(
                `Error handling ${type.toUpperCase()} image URL:`,
                error,
            );
        }
    }

    // Handle image data paste
    async handleImagePaste(e, container, type) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let hasImageData = false;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                hasImageData = true;
                const blob = items[i].getAsFile();
                const file = new File(
                    [blob],
                    `image${type.toUpperCase()}.jpg`,
                    {
                        type: "image/jpeg",
                    },
                );

                // Create img element for preview
                const imgElement = Utils.createElement("img", {
                    src: URL.createObjectURL(file),
                    className: "clipboard-image",
                });

                container.appendChild(imgElement);

                // Show compression indicator
                const originalSize = file.size;
                console.log(
                    `Original size: ${Utils.formatFileSize(originalSize)}`,
                );

                // Compress and store image
                const compressedFile = await Utils.compressImage(
                    file,
                    600,
                    0.7,
                );
                console.log(
                    `Compressed size: ${Utils.formatFileSize(compressedFile.size)}`,
                );
                console.log(
                    `Compression ratio: ${((1 - compressedFile.size / originalSize) * 100).toFixed(1)}%`,
                );

                if (type === "sp") {
                    this.imgArray.push(compressedFile);
                    this.isUrlPasted = false;
                } else {
                    this.imgArrayKH.push(compressedFile);
                    this.isUrlPastedKH = false;
                }

                console.log(
                    `${type.toUpperCase()} image file processed and added to array`,
                );
                break;
            }
        }

        if (!hasImageData) {
            console.log(
                `No ${type.toUpperCase()} image data found in clipboard`,
            );
        }
    }

    // Upload product files
    async uploadProductFiles(files, formData) {
        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/sp");
        this.imageUrlFile = [];

        const totalImages = files.length;
        let uploadedCount = 0;
        const notificationId = uiManager.showUploading(0, totalImages);

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const compressedFile = await Utils.compressImage(
                    file,
                    600,
                    0.7,
                );
                const imageRef = imagesRef.child(
                    file.name + Utils.generateUniqueFileName(),
                );
                const uploadTask = await imageRef.put(
                    compressedFile,
                    STORAGE_METADATA,
                );
                const downloadURL = await uploadTask.ref.getDownloadURL();
                this.imageUrlFile.push(downloadURL);

                // Update progress
                uploadedCount++;
                if (uiManager.notificationManager) {
                    uiManager.notificationManager.remove(notificationId);
                    uiManager.showUploading(uploadedCount, totalImages);
                }

                return downloadURL;
            });

            await Promise.all(uploadPromises);

            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }

            formData.sp = this.imageUrlFile;
            return this.handleCustomerData(formData);
        } catch (error) {
            console.error("Error uploading product images:", error);
            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }
            throw new Error("Lỗi khi tải ảnh sản phẩm lên!");
        }
    }

    // Upload product clipboard
    async uploadProductClipboard(formData) {
        if (this.isUrlPasted && this.pastedImageUrl) {
            formData.sp = [this.pastedImageUrl];
            return this.handleCustomerData(formData);
        }

        if (this.imgArray.length === 0) {
            throw new Error("Vui lòng dán hình ảnh sản phẩm!");
        }

        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/sp");
        const totalImages = this.imgArray.length;

        let uploadedCount = 0;
        const notificationId = uiManager.showUploading(0, totalImages);

        try {
            const uploadPromises = this.imgArray.map(async (file) => {
                const imageName = Utils.generateUniqueFileName();
                const imageRef = imagesRef.child(imageName);
                const uploadTask = await imageRef.put(file, STORAGE_METADATA);
                const downloadURL = await uploadTask.ref.getDownloadURL();

                // Update progress
                uploadedCount++;
                if (uiManager.notificationManager) {
                    uiManager.notificationManager.remove(notificationId);
                    uiManager.showUploading(uploadedCount, totalImages);
                }

                return downloadURL;
            });

            const urls = await Promise.all(uploadPromises);

            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }

            formData.sp = urls;
            return this.handleCustomerData(formData);
        } catch (error) {
            console.error("Product upload error:", error);
            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }
            throw new Error("Lỗi tải lên ảnh sản phẩm!");
        }
    }

    // Upload customer files
    async uploadCustomerFiles(files, formData) {
        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/kh");
        this.imageUrlFileKH = [];

        const totalImages = files.length;
        let uploadedCount = 0;
        const notificationId = uiManager.showUploading(0, totalImages);

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const compressedFile = await Utils.compressImage(
                    file,
                    600,
                    0.7,
                );
                const imageRef = imagesRef.child(
                    file.name + Utils.generateUniqueFileName(),
                );
                const uploadTask = await imageRef.put(
                    compressedFile,
                    STORAGE_METADATA,
                );
                const downloadURL = await uploadTask.ref.getDownloadURL();
                this.imageUrlFileKH.push(downloadURL);

                // Update progress
                uploadedCount++;
                if (uiManager.notificationManager) {
                    uiManager.notificationManager.remove(notificationId);
                    uiManager.showUploading(uploadedCount, totalImages);
                }

                return downloadURL;
            });

            await Promise.all(uploadPromises);

            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }

            formData.kh = this.imageUrlFileKH;
            return window.tableManager.uploadToFirestore(formData);
        } catch (error) {
            console.error("Error uploading customer images:", error);
            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }
            throw new Error("Lỗi khi tải ảnh khách hàng lên!");
        }
    }

    // Upload customer clipboard
    async uploadCustomerClipboard(formData) {
        if (this.isUrlPastedKH && this.pastedImageUrlKH) {
            formData.kh = [this.pastedImageUrlKH];
            return window.tableManager.uploadToFirestore(formData);
        }

        if (this.imgArrayKH.length === 0) {
            throw new Error("Vui lòng dán hình ảnh khách hàng!");
        }

        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/kh");
        const totalImages = this.imgArrayKH.length;

        let uploadedCount = 0;
        const notificationId = uiManager.showUploading(0, totalImages);

        try {
            const uploadPromises = this.imgArrayKH.map(async (file) => {
                const imageName = Utils.generateUniqueFileName();
                const imageRef = imagesRef.child(imageName);
                const uploadTask = await imageRef.put(file, STORAGE_METADATA);
                const downloadURL = await uploadTask.ref.getDownloadURL();

                // Update progress
                uploadedCount++;
                if (uiManager.notificationManager) {
                    uiManager.notificationManager.remove(notificationId);
                    uiManager.showUploading(uploadedCount, totalImages);
                }

                return downloadURL;
            });

            const urls = await Promise.all(uploadPromises);

            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }

            formData.kh = urls;
            return window.tableManager.uploadToFirestore(formData);
        } catch (error) {
            console.error("Customer upload error:", error);
            if (uiManager.notificationManager) {
                uiManager.notificationManager.clearAll();
            }
            throw new Error("Lỗi tải lên ảnh khách hàng!");
        }
    }

    // Handle customer data based on input type
    handleCustomerData(formData) {
        const inputClipboardRadioKH =
            document.getElementById("inputClipboardKH");
        const inputFileRadioKH = document.getElementById("inputFileKH");
        const hinhAnhInputFileKH =
            document.getElementById("hinhAnhInputFileKH");

        if (inputClipboardRadioKH && inputClipboardRadioKH.checked) {
            return this.uploadCustomerClipboard(formData);
        } else if (inputFileRadioKH && inputFileRadioKH.checked) {
            const hinhAnhFilesKH = hinhAnhInputFileKH.files;
            if (hinhAnhFilesKH.length === 0) {
                throw new Error("Vui lòng chọn file hình ảnh khách hàng!");
            }
            return this.uploadCustomerFiles(hinhAnhFilesKH, formData);
        } else {
            throw new Error(
                "Vui lòng chọn phương thức nhập hình ảnh khách hàng!",
            );
        }
    }

    // Clear all image data
    clearData() {
        this.imgArray = [];
        this.imgArrayKH = [];
        this.imageUrlFile = [];
        this.imageUrlFileKH = [];
        this.pastedImageUrl = null;
        this.isUrlPasted = false;
        this.pastedImageUrlKH = null;
        this.isUrlPastedKH = false;

        // Clear clipboard containers
        const containers = ["container", "containerKH"];
        containers.forEach((id) => {
            const container = document.getElementById(id);
            if (container) {
                const images = container.querySelectorAll("img");
                images.forEach((img) => {
                    // Revoke blob URLs to free memory
                    if (img.src.startsWith("blob:")) {
                        URL.revokeObjectURL(img.src);
                    }
                    img.remove();
                });
            }
        });

        // Clear file inputs
        const fileInputs = ["hinhAnhInputFile", "hinhAnhInputFileKH"];
        fileInputs.forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });

        // Clear link inputs
        const hinhAnhContainer = document.getElementById("hinhAnhContainer");
        if (hinhAnhContainer) {
            const linkInputs = hinhAnhContainer.querySelectorAll("input");
            linkInputs.forEach((input) => input.remove());
        }

        console.log("Image data cleared and memory freed");
    }
}

// Create global image handler instance
window.imageHandler = new ImageHandler();
