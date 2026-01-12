// virtual-scrolling.js - FIXED VERSION with Lucide Icons
// Advanced Virtual Scrolling Implementation with Fixed Checkbox Logic

class VirtualScrollManager {
    constructor() {
        this.isEnabled = false;
        this.container = null;
        this.tableBody = null;
        this.virtualSpacer = null;
        this.visibleRange = { start: 0, end: 0 };
        this.itemHeight = CONFIG.performance.VIRTUAL_ROW_HEIGHT;
        this.bufferSize = CONFIG.performance.VIRTUAL_BUFFER;
        this.data = [];
        this.renderedElements = new Map();
        this.intersectionObserver = null;
        this.resizeObserver = null;
        this.scrollTimeout = null;
        this.isScrolling = false;
        this.lastScrollTop = 0;
        this.containerHeight = 0;
        this.totalHeight = 0;

        this.renderCount = 0;
        this.lastRenderTime = 0;

        this.settings = deviceDetector.getOptimalSettings();
        this.itemHeight = this.settings.virtualRowHeight;

        this.init();
    }

    init() {
        this.container = domManager.get(SELECTORS.tableContainer);
        this.tableBody = domManager.get(SELECTORS.tableBody);

        if (!this.container || !this.tableBody) {
            console.warn("Virtual scrolling: Required elements not found");
            return;
        }

        this.setupContainer();
        this.createVirtualSpacer();
        this.setupObservers();
        this.bindEvents();

        console.log(
            "Virtual scrolling initialized with settings:",
            this.settings,
        );
    }

    setupContainer() {
        const containerStyle = {
            height: "600px",
            overflowY: "auto",
            position: "relative",
        };

        Object.assign(this.container.style, containerStyle);
        this.containerHeight = this.container.clientHeight;
    }

    createVirtualSpacer() {
        this.virtualSpacer = domManager.get(SELECTORS.virtualSpacer);

        if (!this.virtualSpacer) {
            this.virtualSpacer = domManager.create("div", {
                id: "virtualSpacer",
                styles: {
                    height: "0px",
                    width: "100%",
                    pointerEvents: "none",
                },
            });
            this.container.appendChild(this.virtualSpacer);
        }
    }

    setupObservers() {
        if (window.IntersectionObserver) {
            this.intersectionObserver = new IntersectionObserver(
                (entries) => this.handleIntersection(entries),
                {
                    root: this.container,
                    rootMargin: `${this.bufferSize * this.itemHeight}px`,
                    threshold: [0, 0.1, 0.9, 1],
                },
            );
        }

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver((entries) =>
                this.handleResize(entries),
            );
            this.resizeObserver.observe(this.container);
        }
    }

    bindEvents() {
        const throttledScrollHandler = throttleManager.throttle(
            () => this.handleScroll(),
            CONFIG.performance.SCROLL_THROTTLE_DELAY,
            "virtualScroll",
        );

        this.container.addEventListener("scroll", throttledScrollHandler, {
            passive: true,
        });

        this.container.addEventListener(
            "wheel",
            (e) => {
                this.handleWheel(e);
            },
            { passive: true },
        );
    }

    enable(data = []) {
        this.isEnabled = true;
        this.data = data;
        this.updateTotalHeight();
        this.calculateVisibleRange();
        this.renderVisibleItems();

        console.log(`Virtual scrolling enabled for ${data.length} items`);
    }

    disable() {
        this.isEnabled = false;
        this.data = [];
        this.visibleRange = { start: 0, end: 0 };
        this.renderedElements.clear();

        if (this.virtualSpacer) {
            this.virtualSpacer.style.height = "0px";
        }

        console.log("Virtual scrolling disabled");
    }

    shouldUseVirtualScrolling(dataLength) {
        const threshold = this.settings.enableVirtualScrolling
            ? PERFORMANCE_THRESHOLDS.LARGE_DATASET
            : PERFORMANCE_THRESHOLDS.HUGE_DATASET;

        return dataLength > threshold;
    }

    updateData(newData) {
        performanceMonitor.start("updateVirtualData");

        this.data = newData;
        this.updateTotalHeight();

        const currentScrollRatio = this.container.scrollTop / this.totalHeight;

        this.calculateVisibleRange();
        this.renderVisibleItems();

        if (currentScrollRatio > 0) {
            this.container.scrollTop = currentScrollRatio * this.totalHeight;
        }

        performanceMonitor.end("updateVirtualData");
    }

    updateTotalHeight() {
        this.totalHeight = this.data.length * this.itemHeight;

        if (this.virtualSpacer) {
            this.virtualSpacer.style.height = `${this.totalHeight}px`;
        }
    }

    calculateVisibleRange() {
        if (!this.isEnabled || this.data.length === 0) {
            this.visibleRange = { start: 0, end: 0 };
            return;
        }

        const scrollTop = this.container.scrollTop;
        const containerHeight = this.containerHeight;

        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = Math.ceil(
            (scrollTop + containerHeight) / this.itemHeight,
        );

        const bufferedStart = Math.max(0, startIndex - this.bufferSize);
        const bufferedEnd = Math.min(
            this.data.length,
            endIndex + this.bufferSize,
        );

        this.visibleRange = {
            start: bufferedStart,
            end: bufferedEnd,
        };
    }

    renderVisibleItems() {
        if (!this.isEnabled || !this.tableBody) return;

        performanceMonitor.start("renderVirtualItems");

        this.tableBody.innerHTML = "";
        this.renderedElements.clear();

        const offsetTop = this.visibleRange.start * this.itemHeight;

        if (offsetTop > 0) {
            const spacerRow = domManager.create("tr", {
                styles: {
                    height: `${offsetTop}px`,
                    display: "block",
                },
                innerHTML:
                    '<td colspan="8" style="border: none; padding: 0;"></td>',
            });
            this.tableBody.appendChild(spacerRow);
        }

        const fragment = domManager.createFragment();
        const visibleItems = this.data.slice(
            this.visibleRange.start,
            this.visibleRange.end,
        );

        visibleItems.forEach((item, index) => {
            const globalIndex = this.visibleRange.start + index;
            const row = this.createTableRow(item, globalIndex);

            if (row) {
                this.renderedElements.set(globalIndex, row);
                fragment.appendChild(row);
            }
        });

        this.tableBody.appendChild(fragment);

        // Initialize Lucide icons after appending
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const bottomOffset =
            (this.data.length - this.visibleRange.end) * this.itemHeight;
        if (bottomOffset > 0) {
            const bottomSpacer = domManager.create("tr", {
                styles: {
                    height: `${bottomOffset}px`,
                    display: "block",
                },
                innerHTML:
                    '<td colspan="8" style="border: none; padding: 0;"></td>',
            });
            this.tableBody.appendChild(bottomSpacer);
        }

        this.renderCount++;
        this.lastRenderTime = performance.now();

        performanceMonitor.end("renderVirtualItems");

        document.dispatchEvent(
            new CustomEvent(EVENTS.VIRTUAL_SCROLL, {
                detail: {
                    visibleRange: this.visibleRange,
                    renderedCount: visibleItems.length,
                    totalItems: this.data.length,
                },
            }),
        );
    }

    createTableRow(item, index) {
        if (!item) return null;

        const timestamp = parseFloat(item.dateCell);
        const dateCellConvert = new Date(timestamp);
        const formattedTime = formatDate(dateCellConvert);

        if (!formattedTime) return null;

        const newRow = domManager.create("tr");

        if (item.completed === true) {
            newRow.style.cssText = `
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform: translateZ(0);
                will-change: transform;
                opacity: 0.4;
                background-color: #f8f9fa;
            `;
            newRow.classList.add(CSS_CLASSES.muted);
        } else {
            newRow.style.cssText = `
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform: translateZ(0);
                will-change: transform;
                opacity: 1.0;
                background-color: transparent;
            `;
            newRow.classList.add(CSS_CLASSES.active);
        }

        newRow.classList.add("virtual-row");

        const cells = [
            { content: sanitizeInput(formattedTime), id: item.dateCell },
            { content: sanitizeInput(item.noteCell || "") },
            {
                content: item.amountCell
                    ? numberWithCommas(
                          sanitizeInput(item.amountCell.toString()).replace(
                              /[,\.]/g,
                              "",
                          ),
                      )
                    : "0",
            },
            { content: sanitizeInput(item.bankCell || "") },
            {
                content: null,
                type: "checkbox",
                checked: Boolean(item.completed),
            },
            { content: sanitizeInput(item.customerInfoCell || "") },
            { content: null, type: "edit" },
            { content: null, type: "delete", userId: item.user || "Unknown" },
        ];

        const cellFragment = domManager.createFragment();

        cells.forEach((cellData, cellIndex) => {
            const cell = domManager.create("td");

            cell.style.cssText = `
                transition: all 0.2s ease;
                transform: translateZ(0);
            `;

            if (cellData.type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = cellData.checked;
                checkbox.style.width = "20px";
                checkbox.style.height = "20px";
                checkbox.style.cursor = "pointer";
                checkbox.style.transition =
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

                checkbox.setAttribute("data-transaction-id", item.uniqueId);

                checkbox.style.appearance = "none";
                checkbox.style.border = "2px solid #667eea";
                checkbox.style.borderRadius = "6px";
                checkbox.style.background = "white";
                checkbox.style.position = "relative";

                if (cellData.checked) {
                    checkbox.style.background =
                        "linear-gradient(135deg, #667eea, #764ba2)";
                    checkbox.style.borderColor = "#667eea";
                }

                checkbox.addEventListener("change", function () {
                    if (this.checked) {
                        this.style.background =
                            "linear-gradient(135deg, #667eea, #764ba2)";
                        this.style.borderColor = "#667eea";
                    } else {
                        this.style.background = "white";
                        this.style.borderColor = "#667eea";
                    }
                });

                cell.appendChild(checkbox);
            } else if (cellData.type === "edit") {
                const editButton = document.createElement("button");
                editButton.className = "edit-button";

                // Add Lucide icon
                const editIcon = document.createElement("i");
                editIcon.setAttribute("data-lucide", "edit-3");
                editButton.appendChild(editIcon);

                cell.appendChild(editButton);
            } else if (cellData.type === "delete") {
                const deleteButton = document.createElement("button");
                deleteButton.className = "delete-button";
                deleteButton.setAttribute("data-user", cellData.userId);

                // Add Lucide icon
                const deleteIcon = document.createElement("i");
                deleteIcon.setAttribute("data-lucide", "trash-2");
                deleteButton.appendChild(deleteIcon);

                cell.appendChild(deleteButton);
            } else {
                cell.textContent = cellData.content;
                if (cellData.id) cell.id = cellData.id;
            }

            cellFragment.appendChild(cell);
        });

        newRow.appendChild(cellFragment);
        newRow.setAttribute("data-unique-id", item.uniqueId);
        newRow.setAttribute("data-virtual-index", index);

        setTimeout(() => {
            newRow.style.opacity = item.completed ? "0.4" : "1.0";
            newRow.style.transform = "translateY(0) translateZ(0)";
        }, index * 5);

        return newRow;
    }

    handleScroll() {
        if (!this.isEnabled) return;

        const currentScrollTop = this.container.scrollTop;

        const scrollDirection =
            currentScrollTop > this.lastScrollTop ? "down" : "up";
        this.lastScrollTop = currentScrollTop;

        this.isScrolling = true;

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        const oldRange = { ...this.visibleRange };
        this.calculateVisibleRange();

        const rangeChanged =
            Math.abs(this.visibleRange.start - oldRange.start) > 1 ||
            Math.abs(this.visibleRange.end - oldRange.end) > 1;

        if (rangeChanged) {
            requestAnimationFrame(() => {
                this.renderVisibleItems();
            });
        }

        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
            this.optimizeRendering();
        }, 100);
    }

    optimizeRendering() {
        if (!this.isEnabled || this.isScrolling) return;

        const rows = this.tableBody.querySelectorAll(
            'tr:not([style*="height"])',
        );
        rows.forEach((row, index) => {
            row.style.transform = "translateZ(0)";
            row.style.willChange = "transform";
        });
    }

    handleWheel(event) {
        if (!this.isEnabled) return;

        const delta = event.deltaY;
        const scrollStep = this.itemHeight * 2;

        const currentScrollTop = this.container.scrollTop;
        const targetScrollTop = currentScrollTop + delta * 0.8;

        this.smoothScrollTo(targetScrollTop, 200);

        if (Math.abs(delta) > scrollStep) {
            this.bufferSize = Math.max(CONFIG.performance.VIRTUAL_BUFFER, 15);
        } else {
            this.bufferSize = CONFIG.performance.VIRTUAL_BUFFER;
        }

        event.preventDefault();
    }

    handleIntersection(entries) {
        if (!this.isEnabled) return;

        entries.forEach((entry) => {
            const element = entry.target;
            const index = parseInt(element.getAttribute("data-virtual-index"));

            if (entry.isIntersecting) {
                element.classList.add("virtual-visible");
            } else {
                element.classList.remove("virtual-visible");
            }
        });
    }

    handleResize(entries) {
        entries.forEach((entry) => {
            this.containerHeight = entry.contentRect.height;

            this.calculateVisibleRange();
            this.renderVisibleItems();
        });
    }

    scrollToIndex(index, behavior = "smooth") {
        if (!this.isEnabled || index < 0 || index >= this.data.length) return;

        const targetScrollTop = index * this.itemHeight;

        this.container.scrollTo({
            top: targetScrollTop,
            behavior: behavior,
        });
    }

    scrollToItem(uniqueId, behavior = "smooth") {
        const index = this.data.findIndex((item) => item.uniqueId === uniqueId);
        if (index !== -1) {
            this.scrollToIndex(index, behavior);
        }
    }

    getVisibleItems() {
        return this.data.slice(this.visibleRange.start, this.visibleRange.end);
    }

    getRenderedElements() {
        return Array.from(this.renderedElements.values());
    }

    getStats() {
        return {
            isEnabled: this.isEnabled,
            totalItems: this.data.length,
            visibleRange: this.visibleRange,
            visibleCount: this.visibleRange.end - this.visibleRange.start,
            renderedElements: this.renderedElements.size,
            renderCount: this.renderCount,
            lastRenderTime: this.lastRenderTime,
            totalHeight: this.totalHeight,
            itemHeight: this.itemHeight,
            containerHeight: this.containerHeight,
            scrollTop: this.container ? this.container.scrollTop : 0,
            performance: {
                bufferSize: this.bufferSize,
                settings: this.settings,
            },
        };
    }

    destroy() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        throttleManager.clear("virtualScroll");

        this.container = null;
        this.tableBody = null;
        this.virtualSpacer = null;
        this.data = [];
        this.renderedElements.clear();

        console.log("Virtual scrolling destroyed");
    }

    smoothScrollTo(targetPosition, duration = 800) {
        if (!this.container) return;

        const startPosition = this.container.scrollTop;
        const distance = targetPosition - startPosition;
        const startTime = performance.now();

        const easeInOutCubic = (t) => {
            return t < 0.5
                ? 4 * t * t * t
                : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
        };

        const animateScroll = (currentTime) => {
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const ease = easeInOutCubic(progress);

            this.container.scrollTop = startPosition + distance * ease;

            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        };

        requestAnimationFrame(animateScroll);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { VirtualScrollManager };
} else {
    window.VirtualScrollManager = VirtualScrollManager;
}
