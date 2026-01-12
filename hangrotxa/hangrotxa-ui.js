// =====================================================
// UI INTERACTIONS & RENDERING
// File 4/6: hangrotxa-ui.js
// =====================================================

// =====================================================
// FORM HANDLING
// =====================================================

function toggleForm() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const auth = authManager ? authManager.getAuthState() : null;

    if (!auth || auth.checkLogin == "777") {
        utils.showError("Không có quyền truy cập biểu mẫu");
        return;
    }

    if (
        config.dataForm.style.display === "none" ||
        !config.dataForm.classList.contains("show")
    ) {
        config.dataForm.style.display = "block";
        config.dataForm.classList.add("show");
    } else {
        config.dataForm.style.display = "none";
        config.dataForm.classList.remove("show");
    }
}

function clearData() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    config.imgArray = [];
    config.imageUrlFile = [];
    window.pastedImageUrl = null;
    window.isUrlPasted = false;

    document.getElementById("tenSanPham").value = "";
    document.getElementById("soLuong").value = "";
    document.getElementById("hinhAnhInput").value = "";
    if (config.hinhAnhInputFile) config.hinhAnhInputFile.value = "";

    const imagesToRemoveSP =
        config.inputClipboardContainer.querySelectorAll("img");

    if (imagesToRemoveSP.length > 0) {
        imagesToRemoveSP.forEach(function (image) {
            config.inputClipboardContainer.removeChild(image);
        });

        const paragraph = document.createElement("p");
        paragraph.innerHTML =
            '<i data-lucide="clipboard-paste"></i><p>Dán ảnh ở đây...</p>';
        config.inputClipboardContainer.appendChild(paragraph);

        // Re-initialize icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    utils.showInfo("Đã reset form");
}

// =====================================================
// IMAGE INPUT TABS
// =====================================================

function initializeImageInputTabs() {
    const config = window.HangRotXaConfig;
    const tabButtons = document.querySelectorAll(".tab-input");

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            // Remove active class from all tabs
            tabButtons.forEach((btn) => btn.classList.remove("active"));
            button.classList.add("active");

            // Hide all containers
            config.inputFileContainer.classList.remove("active");
            config.inputLinkContainer.classList.remove("active");
            config.inputClipboardContainer.classList.remove("active");

            // Show selected container and update radio
            const type = button.dataset.type;
            if (type === "clipboard") {
                config.inputClipboardContainer.classList.add("active");
                config.inputClipboardRadio.checked = true;
            } else if (type === "file") {
                config.inputFileContainer.classList.add("active");
                config.inputFileRadio.checked = true;
            } else if (type === "link") {
                config.inputLinkContainer.classList.add("active");
                config.inputLinkRadio.checked = true;
            }
        });
    });
}

// =====================================================
// CLIPBOARD HANDLING
// =====================================================

function initializeClipboardHandling() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    config.inputClipboardContainer.addEventListener(
        "paste",
        async function (e) {
            if (config.inputClipboardRadio.checked) {
                config.imgArray = [];
                window.pastedImageUrl = null;
                window.isUrlPasted = false;
                e.preventDefault();

                const text = e.clipboardData.getData("text");
                if (
                    text &&
                    (text.startsWith("http") ||
                        text.includes("firebasestorage.googleapis.com"))
                ) {
                    try {
                        config.inputClipboardContainer.innerHTML = "";

                        const imgElement = document.createElement("img");
                        imgElement.src = text;
                        imgElement.onload = function () {
                            console.log(
                                "URL image preview loaded successfully",
                            );
                        };
                        imgElement.onerror = function () {
                            console.error(
                                "Failed to load image preview from URL",
                            );
                            imgElement.alt =
                                "Image preview (may have CORS issues)";
                        };
                        config.inputClipboardContainer.appendChild(imgElement);

                        window.pastedImageUrl = text;
                        window.isUrlPasted = true;

                        console.log("URL pasted and saved:", text);
                        return;
                    } catch (error) {
                        console.error("Error handling image URL:", error);
                    }
                }

                var items = (e.clipboardData || e.originalEvent.clipboardData)
                    .items;
                var hasImageData = false;

                for (var i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        hasImageData = true;
                        var blob = items[i].getAsFile();
                        var file = new File([blob], "image.jpg");

                        config.inputClipboardContainer.innerHTML = "";

                        var imgElement = document.createElement("img");
                        imgElement.src = URL.createObjectURL(file);
                        config.inputClipboardContainer.appendChild(imgElement);

                        const compressedFile = await utils.compressImage(file);
                        config.imgArray.push(compressedFile);
                        window.isUrlPasted = false;
                        console.log(
                            "Image file processed and added to imgArray",
                        );
                        break;
                    }
                }

                if (!hasImageData && !window.pastedImageUrl) {
                    console.log("No image data or URL found in clipboard");
                }
            }
        },
    );
}

// =====================================================
// FILTER & SEARCH
// =====================================================

function applyFiltersToData(dataArray) {
    const config = window.HangRotXaConfig;
    const filterCategory = config.filterCategorySelect.value;
    const selectedDotlive = config.dateFilterDropdown.value;

    return dataArray.filter((product) => {
        const matchCategory =
            filterCategory === "all" || product.phanLoai === filterCategory;
        const matchDate =
            selectedDotlive === "all" || product.dotLive == selectedDotlive;

        const searchMatch =
            !config.searchFilter ||
            Object.values(product).some((val) =>
                String(val)
                    .toLowerCase()
                    .includes(config.searchFilter.toLowerCase()),
            );

        return matchCategory && matchDate && searchMatch;
    });
}

const debouncedApplyFilters = window.HangRotXaUtils.debounce(() => {
    const cache = window.HangRotXaCache;
    const utils = window.HangRotXaUtils;

    const loadingId = utils.showLoading("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const cachedData = cache.getCachedData();
            if (cachedData) {
                renderDataToTable(cachedData);
                updateSuggestions(cachedData);
            } else {
                cache.displayInventoryData();
            }

            utils.hideLoading(loadingId);
        } catch (error) {
            console.error("Error during filtering:", error);
            utils.showError("Có lỗi xảy ra khi lọc dữ liệu");
        }
    }, 100);
}, window.HangRotXaConfig.FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

function initializeSearch() {
    const config = window.HangRotXaConfig;

    if (config.searchInput) {
        config.searchInput.addEventListener(
            "input",
            window.HangRotXaUtils.debounce((e) => {
                config.searchFilter = e.target.value.toLowerCase();
                applyFilters();
            }, 300),
        );
    }
}

// =====================================================
// IMAGE HOVER PREVIEW - RESTORED FUNCTIONALITY
// =====================================================

function initializeImageHoverPreview() {
    const config = window.HangRotXaConfig;

    // Create hover overlay if it doesn't exist
    let imageHoverOverlay = document.getElementById("imageHoverOverlay");
    if (!imageHoverOverlay) {
        imageHoverOverlay = document.createElement("div");
        imageHoverOverlay.id = "imageHoverOverlay";
        document.body.appendChild(imageHoverOverlay);
    }

    // Create hover preview element if it doesn't exist
    let imagePreviewHover = document.querySelector(".image-preview-hover");
    if (!imagePreviewHover) {
        imagePreviewHover = document.createElement("img");
        imagePreviewHover.className = "image-preview-hover";
        document.body.appendChild(imagePreviewHover);
    }

    // Event delegation for table images
    if (config.tbody) {
        config.tbody.addEventListener("mouseover", function (e) {
            const img = e.target.closest("td img");
            if (img && img.src && !img.src.includes("data:image/svg")) {
                const actualSrc = img.dataset.src || img.src;
                imagePreviewHover.src = actualSrc;
                imagePreviewHover.style.display = "block";
            }
        });

        config.tbody.addEventListener("mousemove", function (e) {
            const img = e.target.closest("td img");
            if (img && imagePreviewHover.style.display === "block") {
                const offsetX = 20;
                const offsetY = 20;
                const maxWidth = 400;
                const maxHeight = 400;

                let left = e.pageX + offsetX;
                let top = e.pageY + offsetY;

                // Keep preview within viewport
                if (left + maxWidth > window.innerWidth) {
                    left = e.pageX - maxWidth - offsetX;
                }
                if (top + maxHeight > window.innerHeight) {
                    top = e.pageY - maxHeight - offsetY;
                }

                imagePreviewHover.style.left = left + "px";
                imagePreviewHover.style.top = top + "px";
            }
        });

        config.tbody.addEventListener("mouseout", function (e) {
            const img = e.target.closest("td img");
            if (img) {
                imagePreviewHover.style.display = "none";
            }
        });

        // Click to view fullscreen
        config.tbody.addEventListener("click", function (e) {
            const img = e.target.closest("td img");
            if (img && img.src && !img.src.includes("data:image/svg")) {
                const actualSrc = img.dataset.src || img.src;
                const fullscreenImg = document.createElement("img");
                fullscreenImg.src = actualSrc;

                imageHoverOverlay.innerHTML = "";
                imageHoverOverlay.appendChild(fullscreenImg);
                imageHoverOverlay.style.display = "flex";

                // Close on click
                imageHoverOverlay.onclick = function () {
                    imageHoverOverlay.style.display = "none";
                };
            }
        });
    }
}

// =====================================================
// TABLE RENDERING
// =====================================================

function renderDataToTable(dataArray) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    const filteredData = applyFiltersToData(dataArray);

    config.tbody.innerHTML = "";

    // Empty state
    const emptyState = document.getElementById("emptyState");
    if (filteredData.length === 0) {
        if (emptyState) emptyState.classList.add("show");
        return;
    } else {
        if (emptyState) emptyState.classList.remove("show");
    }

    // Summary row
    if (filteredData.length > 0) {
        var summaryRow = document.createElement("tr");
        summaryRow.style.backgroundColor = "#f8f9fa";
        summaryRow.style.fontWeight = "bold";

        var summaryTd = document.createElement("td");
        summaryTd.colSpan = 9;
        summaryTd.textContent = `Tổng: ${filteredData.length} sản phẩm`;
        summaryTd.style.textAlign = "center";
        summaryTd.style.color = "#007bff";
        summaryTd.style.padding = "8px";

        summaryRow.appendChild(summaryTd);
        config.tbody.appendChild(summaryRow);
    }

    let totalImages = 0;
    let loadedImages = 0;

    const imageObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const actualSrc = img.dataset.src;
                    if (actualSrc) {
                        img.onload = () => {
                            loadedImages++;
                            img.classList.add("loaded");
                            checkAllLoaded();
                        };
                        img.onerror = () => {
                            loadedImages++;
                            checkAllLoaded();
                        };
                        img.src = actualSrc;
                        img.removeAttribute("data-src");
                    }
                    imageObserver.unobserve(img);
                }
            });
        },
        { rootMargin: "50px" },
    );

    function checkAllLoaded() {
        if (loadedImages === totalImages) {
            console.log("All visible images loaded, caching sorted data");
            window.HangRotXaCache.setCachedData(dataArray);
        }
    }

    const maxRender = Math.min(filteredData.length, config.MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const product = filteredData[i];

        var tr = document.createElement("tr");
        tr.setAttribute("data-product-id", product.id || "");

        var td1 = document.createElement("td");
        var td2 = document.createElement("td");
        var td3 = document.createElement("td");
        var td4 = document.createElement("td");
        var td5 = document.createElement("td");
        var td6 = document.createElement("td");
        var td7 = document.createElement("td");
        var td8 = document.createElement("td");
        var td9 = document.createElement("td");
        var img = document.createElement("img");
        var input = document.createElement("input");
        var button = document.createElement("button");

        td1.textContent = i + 1;
        td2.textContent = product.dotLive || "Chưa nhập";
        td3.textContent = product.thoiGianUpload;
        td4.textContent = utils.sanitizeInput(product.phanLoai || "");

        // Lazy loading image
        if (Array.isArray(product.hinhAnh)) {
            img.dataset.src = product.hinhAnh[0];
        } else {
            img.dataset.src = product.hinhAnh;
        }

        img.src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
        img.alt = "Đang tải...";
        img.style.width = "50px";
        img.style.height = "50px";
        img.style.cursor = "pointer";

        totalImages++;
        imageObserver.observe(img);

        td5.appendChild(img);
        td6.textContent = utils.sanitizeInput(product.tenSanPham || "");
        td7.textContent = utils.sanitizeInput(product.kichCo || "");

        input.type = "number";
        input.value = product.soLuong;
        input.min = "0";
        input.className = "quantity-input";
        input.setAttribute("data-product-id", product.id || "");
        input.addEventListener(
            "change",
            window.HangRotXaCRUD.updateInventoryByID,
        );
        input.addEventListener("wheel", function (e) {
            e.preventDefault();
        });

        td8.appendChild(input);

        button.className = "delete-button";
        button.innerHTML = '<i data-lucide="trash-2"></i>';
        button.setAttribute("data-product-id", product.id || "");
        button.setAttribute(
            "data-product-name",
            utils.sanitizeInput(product.tenSanPham || ""),
        );
        button.id = utils.sanitizeInput(product.user || "");
        button.addEventListener(
            "click",
            window.HangRotXaCRUD.deleteInventoryByID,
        );

        const auth = authManager ? authManager.getAuthState() : null;
        if (auth) {
            applyRowPermissions(tr, input, button, parseInt(auth.checkLogin));
        }

        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        tr.appendChild(td7);
        tr.appendChild(td8);
        tr.appendChild(td9);
        td9.appendChild(button);

        config.tbody.appendChild(tr);
    }

    if (filteredData.length > config.MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement("tr");
        warningRow.style.backgroundColor = "#fff3cd";
        warningRow.style.color = "#856404";

        const warningTd = document.createElement("td");
        warningTd.colSpan = 9;
        warningTd.textContent = `Hiển thị ${config.MAX_VISIBLE_ROWS} / ${filteredData.length} sản phẩm. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = "center";
        warningTd.style.padding = "8px";

        warningRow.appendChild(warningTd);
        config.tbody.appendChild(warningRow);
    }

    if (totalImages === 0) {
        window.HangRotXaCache.setCachedData(dataArray);
    }

    updateDropdownOptions(dataArray);
    utils.updateStats(dataArray);
}

function applyRowPermissions(row, input, button, userRole) {
    if (userRole !== 0) {
        input.disabled = true;
        button.style.display = "none";
    } else {
        input.disabled = false;
        button.style.display = "";
    }
}

function updateDropdownOptions(fullDataArray) {
    const config = window.HangRotXaConfig;

    const allDotLiveValues = fullDataArray.map((product) => product.dotLive);
    const numericValues = allDotLiveValues
        .map(Number)
        .filter((num) => !isNaN(num));
    const maxValue =
        numericValues.length > 0 ? Math.max(...numericValues) : null;

    if (config.dateFilterDropdown && maxValue !== null) {
        const currentSelectedValue = config.dateFilterDropdown.value;

        while (config.dateFilterDropdown.children.length > 1) {
            config.dateFilterDropdown.removeChild(
                config.dateFilterDropdown.lastChild,
            );
        }

        for (let i = 1; i <= maxValue; i++) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = i;
            config.dateFilterDropdown.appendChild(option);
        }

        if (currentSelectedValue && currentSelectedValue !== "all") {
            const selectedNum = parseInt(currentSelectedValue);
            if (selectedNum <= maxValue) {
                config.dateFilterDropdown.value = currentSelectedValue;
            }
        }

        if (config.dotLiveInput) {
            if (maxValue > 0) {
                config.dotLiveInput.value = maxValue + 1;
            } else {
                config.dotLiveInput.value = 1;
            }
        }
    }
}

// =====================================================
// SUGGESTIONS
// =====================================================

function updateSuggestions(fullDataArray) {
    if (!fullDataArray || !Array.isArray(fullDataArray)) return;

    const values = fullDataArray
        .map((product) => product.tenSanPham?.trim())
        .filter((value) => value && value.length > 0);

    const uniqueValues = [...new Set(values)];

    const dataList = document.getElementById("suggestions");
    if (dataList) {
        dataList.innerHTML = uniqueValues
            .map(
                (value) =>
                    `<option value="${window.HangRotXaUtils.sanitizeInput(value)}">`,
            )
            .join("");
    }
}

// =====================================================
// TOOLTIP
// =====================================================

function initializeTooltipHandlers() {
    const config = window.HangRotXaConfig;

    if (config.tbody) {
        config.tbody.addEventListener("click", function (e) {
            const auth = authManager ? authManager.getAuthState() : null;
            // ALL users check detailedPermissions - NO admin bypass
            const hasAdvancedView = auth?.detailedPermissions?.['hangrotxa']?.['delete'] === true;
            if (hasAdvancedView) {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton
                    ? deleteButton.id
                    : "Không có nút xóa";

                if (tooltip) {
                    tooltip.textContent = value;
                    tooltip.style.display = "block";
                    tooltip.style.top = e.pageY + 10 + "px";
                    tooltip.style.left = e.pageX + 10 + "px";

                    setTimeout(() => {
                        tooltip.style.display = "none";
                    }, 1000);
                }
            }
        });
    }
}

// Export functions
window.HangRotXaUI = {
    toggleForm,
    clearData,
    initializeImageInputTabs,
    initializeClipboardHandling,
    applyFiltersToData,
    applyFilters,
    initializeSearch,
    renderDataToTable,
    updateSuggestions,
    initializeTooltipHandlers,
    initializeImageHoverPreview, // NEW: Export hover function
};
