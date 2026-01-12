// =====================================================
// FORM MANAGEMENT SYSTEM - MODERN VERSION
// =====================================================

class FormHandler {
    constructor() {
        this.dataForm = document.getElementById("dataForm");
        this.initializeFormElements();
        this.initializeEventListeners();
    }

    // Initialize form elements
    initializeFormElements() {
        this.elements = {
            toggleFormButton: document.getElementById("toggleFormButton"),
            closeFormButton: document.getElementById("closeForm"),
            clearDataButton: document.getElementById("clearDataButton"),
            dataFormElement: document.getElementById("dataForm"),
            uploadForm: document.getElementById("uploadForm"),

            // Radio buttons
            inputFileRadio: document.getElementById("inputFile"),
            inputLinkRadio: document.getElementById("inputLink"),
            inputClipboardRadio: document.getElementById("inputClipboard"),
            inputFileRadioKH: document.getElementById("inputFileKH"),
            inputClipboardRadioKH: document.getElementById("inputClipboardKH"),

            // Containers
            inputFileContainer: document.getElementById("inputFileContainer"),
            inputLinkContainer: document.getElementById("inputLinkContainer"),
            inputClipboardContainer: document.getElementById("container"),
            inputFileContainerKH: document.getElementById(
                "inputFileContainerKH",
            ),
            inputClipboardContainerKH: document.getElementById("containerKH"),
            hinhAnhContainer: document.getElementById("hinhAnhContainer"),

            // Input fields
            phanLoai: document.getElementById("phanLoai"),
            tenSanPham: document.getElementById("tenSanPham"),
            hinhAnhInputFile: document.getElementById("hinhAnhInputFile"),
            hinhAnhInputFileKH: document.getElementById("hinhAnhInputFileKH"),
            hinhAnhInputLink: document.getElementById("hinhAnhInputLink"),

            // Filter
            filterCategory: document.getElementById("filterCategory"),
        };

        // Initialize default state - show clipboard containers
        this.initializeDefaultState();
    }

    // Initialize default state for form
    initializeDefaultState() {
        // Hide all containers first
        this.hideAllInputContainers();

        // Show default clipboard containers since radio buttons are checked by default
        if (
            this.elements.inputClipboardRadio &&
            this.elements.inputClipboardRadio.checked
        ) {
            this.showContainer("clipboard");
        }

        if (
            this.elements.inputClipboardRadioKH &&
            this.elements.inputClipboardRadioKH.checked
        ) {
            this.showContainerKH("clipboard");
        }
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Toggle form button
        if (this.elements.toggleFormButton) {
            this.elements.toggleFormButton.addEventListener(
                "click",
                this.toggleForm.bind(this),
            );
        }

        // Close form button
        if (this.elements.closeFormButton) {
            this.elements.closeFormButton.addEventListener("click", () =>
                this.toggleForm(),
            );
        }

        // Form submit handler
        if (this.elements.uploadForm) {
            this.elements.uploadForm.addEventListener(
                "submit",
                this.handleFormSubmit.bind(this),
            );
        }

        // Clear form button
        if (this.elements.clearDataButton) {
            this.elements.clearDataButton.addEventListener(
                "click",
                this.clearForm.bind(this),
            );
        }

        // Radio button handlers
        this.initializeRadioHandlers();

        // Link input handler
        if (this.elements.hinhAnhInputLink) {
            this.elements.hinhAnhInputLink.addEventListener(
                "click",
                this.addLinkInput.bind(this),
            );
        }

        // Filter handler
        if (this.elements.filterCategory) {
            const debouncedFilter = Utils.debounce(() => {
                window.tableManager.applyCategoryFilter();
            }, CONFIG.cache.filterDebounceDelay);

            this.elements.filterCategory.addEventListener(
                "change",
                debouncedFilter,
            );
        }

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Initialize radio button handlers
    initializeRadioHandlers() {
        // SP input type handlers
        if (this.elements.inputFileRadio) {
            this.elements.inputFileRadio.addEventListener("change", () => {
                this.showContainer("file");
            });
        }

        if (this.elements.inputLinkRadio) {
            this.elements.inputLinkRadio.addEventListener("change", () => {
                this.showContainer("link");
            });
        }

        if (this.elements.inputClipboardRadio) {
            this.elements.inputClipboardRadio.addEventListener("change", () => {
                this.showContainer("clipboard");
            });
        }

        // KH input type handlers
        if (this.elements.inputFileRadioKH) {
            this.elements.inputFileRadioKH.addEventListener("change", () => {
                this.showContainerKH("file");
            });
        }

        if (this.elements.inputClipboardRadioKH) {
            this.elements.inputClipboardRadioKH.addEventListener(
                "change",
                () => {
                    this.showContainerKH("clipboard");
                },
            );
        }
    }

    // Show appropriate SP container
    showContainer(type) {
        this.hideAllSPContainers();

        switch (type) {
            case "file":
                if (this.elements.inputFileContainer) {
                    this.elements.inputFileContainer.style.display = "block";
                }
                break;
            case "link":
                if (this.elements.inputLinkContainer) {
                    this.elements.inputLinkContainer.style.display = "block";
                }
                if (this.elements.hinhAnhContainer) {
                    this.elements.hinhAnhContainer.style.display = "block";
                }
                break;
            case "clipboard":
                if (this.elements.inputClipboardContainer) {
                    this.elements.inputClipboardContainer.style.display =
                        "block";
                }
                break;
        }
    }

    // Show appropriate KH container
    showContainerKH(type) {
        this.hideAllKHContainers();

        switch (type) {
            case "file":
                if (this.elements.inputFileContainerKH) {
                    this.elements.inputFileContainerKH.style.display = "block";
                }
                break;
            case "clipboard":
                if (this.elements.inputClipboardContainerKH) {
                    this.elements.inputClipboardContainerKH.style.display =
                        "block";
                }
                break;
        }
    }

    // Hide all SP containers
    hideAllSPContainers() {
        const containers = [
            this.elements.inputFileContainer,
            this.elements.inputLinkContainer,
            this.elements.inputClipboardContainer,
            this.elements.hinhAnhContainer,
        ];

        containers.forEach((container) => {
            if (container) container.style.display = "none";
        });
    }

    // Hide all KH containers
    hideAllKHContainers() {
        const containers = [
            this.elements.inputFileContainerKH,
            this.elements.inputClipboardContainerKH,
        ];

        containers.forEach((container) => {
            if (container) container.style.display = "none";
        });
    }

    // Hide all input containers initially
    hideAllInputContainers() {
        this.hideAllSPContainers();
        this.hideAllKHContainers();
    }

    // Toggle form visibility
    toggleForm() {
        if (!authManager.hasPermission(3)) {
            uiManager.showError("Không có quyền truy cập form");
            return;
        }

        const isVisible =
            this.dataForm.style.display !== "none" &&
            this.dataForm.style.display !== "";

        if (isVisible) {
            uiManager.toggleForm(this.dataForm, false);
            if (this.elements.toggleFormButton) {
                this.elements.toggleFormButton.innerHTML = `
                    <i data-lucide="plus-circle"></i>
                    <span>Thêm Inbox</span>
                `;
            }
        } else {
            uiManager.toggleForm(this.dataForm, true);
            if (this.elements.toggleFormButton) {
                this.elements.toggleFormButton.innerHTML = `
                    <i data-lucide="minus-circle"></i>
                    <span>Ẩn Form</span>
                `;
            }
        }

        // Refresh Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Add link input field
    addLinkInput() {
        const newInput = Utils.createElement("input", {
            type: "text",
            id: "hinhAnhInput",
            placeholder: "Nhập URL hình ảnh...",
            style: "margin-top: 10px; width: 100%;",
        });

        if (this.elements.hinhAnhContainer) {
            this.elements.hinhAnhContainer.appendChild(newInput);
        }
    }

    // Handle form submission
    async handleFormSubmit(e) {
        e.preventDefault();

        if (!authManager.hasPermission(3)) {
            uiManager.showError("Không có quyền thêm inbox");
            return;
        }

        const addButton = document.getElementById("addButton");
        if (addButton) addButton.disabled = true;

        try {
            // Validate form data
            const formData = this.validateAndGetFormData();

            // Process based on input type
            await this.processFormData(formData);
        } catch (error) {
            console.error("Form submission error:", error);
            uiManager.showError(error.message);
        } finally {
            if (addButton) addButton.disabled = false;
        }
    }

    // Validate and get form data
    validateAndGetFormData() {
        const phanLoai = this.elements.phanLoai?.value;
        const tenSanPham = this.elements.tenSanPham?.value;

        if (!phanLoai || !tenSanPham) {
            throw new Error("Vui lòng điền đầy đủ thông tin.");
        }

        const thoiGianUpload = new Date();
        const formattedTime = thoiGianUpload.toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

        const currentUser = authManager.getAuthState();

        return {
            phanLoai: phanLoai,
            tenSanPham: tenSanPham,
            thoiGianUpload: formattedTime,
            user: currentUser ? currentUser.userType : "Unknown",
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        };
    }

    // Process form data based on input type
    async processFormData(formData) {
        const inputClipboardRadio = this.elements.inputClipboardRadio;
        const inputFileRadio = this.elements.inputFileRadio;
        const inputLinkRadio = this.elements.inputLinkRadio;

        if (inputLinkRadio && inputLinkRadio.checked) {
            await this.processLinkInput(formData);
        } else if (inputFileRadio && inputFileRadio.checked) {
            await this.processFileInput(formData);
        } else if (inputClipboardRadio && inputClipboardRadio.checked) {
            await window.imageHandler.uploadProductClipboard(formData);
        } else {
            throw new Error(
                "Vui lòng chọn phương thức nhập hình ảnh sản phẩm!",
            );
        }
    }

    // Process link input
    async processLinkInput(formData) {
        const hinhAnhInput = document.getElementById("hinhAnhInput");

        if (!hinhAnhInput || !hinhAnhInput.value) {
            throw new Error("Nhập URL hình ảnh sản phẩm!");
        }

        if (!Utils.isValidImageUrl(hinhAnhInput.value)) {
            throw new Error("Sai định dạng link");
        }

        uiManager.showLoading("Đang xử lý...");

        // Get all link inputs
        const inputs =
            this.elements.hinhAnhContainer.querySelectorAll(
                'input[type="text"]',
            );
        const imageUrls = Array.from(inputs)
            .map((input) => input.value.trim())
            .filter((url) => url !== "");

        formData.sp = imageUrls;
        await window.imageHandler.handleCustomerData(formData);
    }

    // Process file input
    async processFileInput(formData) {
        const hinhAnhFiles = this.elements.hinhAnhInputFile?.files;

        if (!hinhAnhFiles || hinhAnhFiles.length === 0) {
            throw new Error("Vui lòng chọn file hình ảnh!");
        }

        await window.imageHandler.uploadProductFiles(hinhAnhFiles, formData);
    }

    // Clear form data
    clearForm() {
        // Reset form fields
        if (this.elements.tenSanPham) this.elements.tenSanPham.value = "";
        if (this.elements.phanLoai) this.elements.phanLoai.selectedIndex = 0;

        // Clear image handler data
        window.imageHandler.clearData();

        // Reset radio buttons to default
        if (this.elements.inputClipboardRadio) {
            this.elements.inputClipboardRadio.checked = true;
        }
        if (this.elements.inputClipboardRadioKH) {
            this.elements.inputClipboardRadioKH.checked = true;
        }

        // Show default containers
        this.showContainer("clipboard");
        this.showContainerKH("clipboard");

        uiManager.showSuccess("Form đã được reset!");
    }

    // Update form based on user permissions
    updateFormPermissions() {
        const currentUser = authManager.getAuthState();
        if (!currentUser) return;

        // Hide form if user doesn't have permission
        if (!authManager.hasPermission(3)) {
            if (this.dataForm) {
                this.dataForm.style.display = "none";
            }
            if (this.elements.toggleFormButton) {
                this.elements.toggleFormButton.style.display = "none";
            }
        }
    }
}

// Create global form handler instance
window.formHandler = new FormHandler();
