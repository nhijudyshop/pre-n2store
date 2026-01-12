// =====================================================
// IMAGE PROCESSING WITH AGGRESSIVE COMPRESSION
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

        if (inputClipboardContainer) {
            inputClipboardContainer.addEventListener(
                "paste",
                this.handleSPPaste.bind(this),
            );
        }

        if (inputClipboardContainerKH) {
            inputClipboardContainerKH.addEventListener(
                "paste",
                this.handleKHPaste.bind(this),
            );
        }
    }

    // Handle SP image paste with compression
    async handleSPPaste(e) {
        const inputClipboardRadio = document.getElementById("inputClipboard");
        if (!inputClipboardRadio || !inputClipboardRadio.checked) return;

        this.imgArray = [];
        this.pastedImageUrl = null;
        this.isUrlPasted = false;
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (Utils.isValidImageUrl(text)) {
            this.handleUrlPaste(text, e.currentTarget, "sp");
            return;
        }

        await this.handleImagePaste(e, e.currentTarget, "sp");
    }

    // Handle KH image paste with compression
    async handleKHPaste(e) {
        const inputClipboardRadioKH =
            document.getElementById("inputClipboardKH");
        if (!inputClipboardRadioKH || !inputClipboardRadioKH.checked) return;

        this.imgArrayKH = [];
        this.pastedImageUrlKH = null;
        this.isUrlPastedKH = false;
        e.preventDefault();

        const text = e.clipboardData.getData("text");
        if (Utils.isValidImageUrl(text)) {
            this.handleUrlPaste(text, e.currentTarget, "kh");
            return;
        }

        await this.handleImagePaste(e, e.currentTarget, "kh");
    }

    // Handle URL paste
    handleUrlPaste(url, container, type) {
        try {
            container.innerHTML = "";

            const imgElement = Utils.createElement("img", {
                src: url,
                className: "clipboard-image",
                alt: "Image preview",
            });

            imgElement.onload = () => {
                console.log(`${type.toUpperCase()} URL image loaded`);
                notifyManager.success("Ảnh đã được dán!", 1500);
            };

            imgElement.onerror = () => {
                console.error(`Failed to load ${type.toUpperCase()} image`);
                notifyManager.warning("Không thể tải ảnh từ URL này");
            };

            container.appendChild(imgElement);

            if (type === "sp") {
                this.pastedImageUrl = url;
                this.isUrlPasted = true;
            } else {
                this.pastedImageUrlKH = url;
                this.isUrlPastedKH = true;
            }
        } catch (error) {
            console.error(
                `Error handling ${type.toUpperCase()} image URL:`,
                error,
            );
            notifyManager.error("Lỗi khi xử lý URL ảnh");
        }
    }

    // Handle image data paste with aggressive compression
    async handleImagePaste(e, container, type) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let hasImageData = false;

        const notifId = notifyManager.processing("Đang nén ảnh...");

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                hasImageData = true;
                const blob = items[i].getAsFile();
                const file = new File([blob], `image${type.toUpperCase()}.jpg`);

                // Show original size
                console.log(
                    `Original size: ${Utils.formatFileSize(file.size)}`,
                );

                try {
                    // Compress image aggressively
                    const compressedFile = await Utils.compressImage(
                        file,
                        "storage",
                    );

                    // Create preview
                    const imgElement = Utils.createElement("img", {
                        src: URL.createObjectURL(compressedFile),
                        className: "clipboard-image",
                    });

                    container.innerHTML = "";
                    container.appendChild(imgElement);

                    if (type === "sp") {
                        this.imgArray.push(compressedFile);
                        this.isUrlPasted = false;
                    } else {
                        this.imgArrayKH.push(compressedFile);
                        this.isUrlPastedKH = false;
                    }

                    notifyManager.remove(notifId);
                    notifyManager.success(
                        `Đã nén: ${Utils.formatFileSize(file.size)} → ${Utils.formatFileSize(compressedFile.size)}`,
                        2000,
                    );
                } catch (error) {
                    notifyManager.remove(notifId);
                    notifyManager.error("Lỗi khi nén ảnh");
                    console.error("Compression error:", error);
                }

                break;
            }
        }

        if (!hasImageData) {
            notifyManager.remove(notifId);
            console.log(`No ${type.toUpperCase()} image data in clipboard`);
        }
    }

    // Upload product files with compression
    async uploadProductFiles(files, formData) {
        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/sp");
        this.imageUrlFile = [];

        const totalFiles = files.length;
        let uploadedCount = 0;

        const notifId = notifyManager.uploading(uploadedCount, totalFiles);

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const compressedFile = await Utils.compressImage(
                    file,
                    "storage",
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

                uploadedCount++;
                notifyManager.remove(notifId);
                notifyManager.uploading(uploadedCount, totalFiles);
            });

            await Promise.all(uploadPromises);
            notifyManager.remove(notifId);

            formData.sp = this.imageUrlFile;
            return this.handleCustomerData(formData);
        } catch (error) {
            notifyManager.remove(notifId);
            console.error("Error uploading product images:", error);
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

        const notifId = notifyManager.uploading(0, this.imgArray.length);

        try {
            const uploadPromises = this.imgArray.map(async (file, index) => {
                const imageName = Utils.generateUniqueFileName();
                const imageRef = imagesRef.child(imageName);
                const uploadTask = await imageRef.put(file, STORAGE_METADATA);
                const downloadURL = await uploadTask.ref.getDownloadURL();

                notifyManager.remove(notifId);
                notifyManager.uploading(index + 1, this.imgArray.length);

                return downloadURL;
            });

            const urls = await Promise.all(uploadPromises);
            notifyManager.remove(notifId);

            formData.sp = urls;
            return this.handleCustomerData(formData);
        } catch (error) {
            notifyManager.remove(notifId);
            console.error("Product upload error:", error);
            throw new Error("Lỗi tải lên ảnh sản phẩm!");
        }
    }

    // Upload customer files
    async uploadCustomerFiles(files, formData) {
        const storageRef = firebase.storage().ref();
        const imagesRef = storageRef.child("ib/kh");
        this.imageUrlFileKH = [];

        const totalFiles = files.length;
        let uploadedCount = 0;
        const notifId = notifyManager.uploading(uploadedCount, totalFiles);

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const compressedFile = await Utils.compressImage(
                    file,
                    "storage",
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

                uploadedCount++;
                notifyManager.remove(notifId);
                notifyManager.uploading(uploadedCount, totalFiles);
            });

            await Promise.all(uploadPromises);
            notifyManager.remove(notifId);

            formData.kh = this.imageUrlFileKH;
            return window.tableManager.uploadToFirestore(formData);
        } catch (error) {
            notifyManager.remove(notifId);
            console.error("Error uploading customer images:", error);
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

        const notifId = notifyManager.uploading(0, this.imgArrayKH.length);

        try {
            const uploadPromises = this.imgArrayKH.map(async (file, index) => {
                const imageName = Utils.generateUniqueFileName();
                const imageRef = imagesRef.child(imageName);
                const uploadTask = await imageRef.put(file, STORAGE_METADATA);
                const downloadURL = await uploadTask.ref.getDownloadURL();

                notifyManager.remove(notifId);
                notifyManager.uploading(index + 1, this.imgArrayKH.length);

                return downloadURL;
            });

            const urls = await Promise.all(uploadPromises);
            notifyManager.remove(notifId);

            formData.kh = urls;
            return window.tableManager.uploadToFirestore(formData);
        } catch (error) {
            notifyManager.remove(notifId);
            console.error("Customer upload error:", error);
            throw new Error("Lỗi tải lên ảnh khách hàng!");
        }
    }

    // Handle customer data
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

        const containers = ["container", "containerKH"];
        containers.forEach((id) => {
            const container = document.getElementById(id);
            if (container) {
                const images = container.querySelectorAll("img");
                images.forEach((img) => img.remove());
            }
        });

        const fileInputs = ["hinhAnhInputFile", "hinhAnhInputFileKH"];
        fileInputs.forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });

        const hinhAnhContainer = document.getElementById("hinhAnhContainer");
        if (hinhAnhContainer) {
            const linkInputs = hinhAnhContainer.querySelectorAll("input");
            linkInputs.forEach((input) => input.remove());
        }
    }
}

// Create global image handler instance
window.imageHandler = new ImageHandler();
