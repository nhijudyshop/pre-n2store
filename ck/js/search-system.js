// search-system.js - Simple and Independent Search System
// Searches across all visible content without interfering with filters

class SimpleSearchManager {
    constructor() {
        this.searchInput = null;
        this.originalData = []; // Store original filtered data
        this.isSearching = false;

        console.log("✅ SimpleSearchManager initialized");
    }

    init() {
        // Wait for DOM to be ready
        setTimeout(() => {
            this.bindSearchInput();
            this.bindFilterChangedEvent();
        }, 100);
    }

    bindFilterChangedEvent() {
        // Listen for filter changes and re-apply search if active
        document.addEventListener("filterChanged", () => {
            if (this.isSearching && this.searchInput && this.searchInput.value.trim()) {
                console.log("🔄 Filter changed, re-applying search:", this.searchInput.value);
                // Re-run search on new filtered data
                setTimeout(() => {
                    this.handleSearch(this.searchInput.value);
                }, 100); // Small delay to let table render
            }
        });
        console.log("✅ Listening for filter changes");
    }

    bindSearchInput() {
        // Get search input element
        this.searchInput = document.getElementById("contentSearchInput");

        if (!this.searchInput) {
            console.warn("⚠️ Search input not found, retrying...");
            setTimeout(() => this.bindSearchInput(), 500);
            return;
        }

        console.log("✅ Search input found:", this.searchInput);

        // Clear any existing listeners
        this.searchInput.removeEventListener("input", this.handleSearch);

        // Bind search event directly
        this.searchInput.addEventListener("input", (e) => {
            this.handleSearch(e.target.value);
        });

        console.log("✅ Search event listener bound successfully");
    }

    handleSearch(searchText) {
        try {
            const trimmedSearch = searchText.trim();

            console.log("🔍 Search triggered:", trimmedSearch || "(empty)");

            // If search is empty, restore original data
            if (!trimmedSearch) {
                this.isSearching = false;
                this.restoreOriginalView();
                return;
            }

            // Set searching flag to prevent filter interference
            this.isSearching = true;

            // Normalize search text (remove Vietnamese accents)
            const normalizedSearch = this.normalizeText(trimmedSearch);
            console.log("📝 Normalized search:", normalizedSearch);

            // Get current visible rows in table
            const tableBody = document.getElementById("tableBody");
            if (!tableBody) {
                console.error("❌ Table body not found");
                return;
            }

            const allRows = Array.from(tableBody.querySelectorAll("tr"));
            console.log(`📊 Total rows to search: ${allRows.length}`);

            let visibleCount = 0;

            // Search through each row
            allRows.forEach(row => {
                const found = this.searchInRow(row, normalizedSearch);

                if (found) {
                    row.style.display = "";
                    visibleCount++;
                } else {
                    row.style.display = "none";
                }
            });

            console.log(`✅ Search complete: ${visibleCount} / ${allRows.length} rows visible`);

            // Update info display
            this.updateSearchInfo(visibleCount, allRows.length, trimmedSearch);

        } catch (error) {
            console.error("❌ Search error:", error);
        }
    }

    searchInRow(row, normalizedSearch) {
        try {
            // Get all cells in the row
            const cells = row.querySelectorAll("td");

            // Search in: Date (0), Note (1), Amount (2), Bank (3), Customer Info (5)
            const searchableCells = [0, 1, 2, 3, 5];

            for (const index of searchableCells) {
                if (!cells[index]) continue;

                const cellText = cells[index].textContent || "";
                const normalizedCell = this.normalizeText(cellText);

                if (normalizedCell.includes(normalizedSearch)) {
                    // Highlight matched text
                    this.highlightCell(cells[index]);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error("Error searching row:", error);
            return false;
        }
    }

    highlightCell(cell) {
        // Add subtle highlight to matched cells
        cell.style.backgroundColor = "#fff3cd";
        cell.style.transition = "background-color 0.3s ease";

        // Remove highlight after 2 seconds
        setTimeout(() => {
            cell.style.backgroundColor = "";
        }, 2000);
    }

    normalizeText(text) {
        if (!text || typeof text !== "string") return "";

        // Convert to lowercase
        let normalized = text.toLowerCase();

        // Try to use removeVietnameseAccents if available
        if (typeof removeVietnameseAccents === "function") {
            try {
                normalized = removeVietnameseAccents(normalized);
            } catch (e) {
                console.warn("Failed to remove Vietnamese accents:", e);
            }
        } else {
            // Fallback: manual Vietnamese accent removal
            const accentsMap = {
                'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
                'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
                'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
                'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
                'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
                'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
                'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
                'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
                'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
                'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
                'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
                'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
                'đ': 'd'
            };

            normalized = normalized.split('').map(char => accentsMap[char] || char).join('');
        }

        return normalized;
    }

    restoreOriginalView() {
        console.log("🔄 Restoring original view (clearing search)");

        this.isSearching = false;

        const tableBody = document.getElementById("tableBody");
        if (!tableBody) return;

        const allRows = tableBody.querySelectorAll("tr");
        allRows.forEach(row => {
            row.style.display = "";
        });

        // Clear search info
        this.updateSearchInfo(0, 0, "");
    }

    // Method to clear search when filters change
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = "";
        }
        this.isSearching = false;
        this.restoreOriginalView();
        console.log("🧹 Search cleared by filter system");
    }

    updateSearchInfo(visibleCount, totalCount, searchText) {
        // Try to find or create search info element
        let searchInfo = document.getElementById("searchInfo");

        if (!searchInfo) {
            // Create search info element
            searchInfo = document.createElement("div");
            searchInfo.id = "searchInfo";
            searchInfo.style.cssText = `
                background: linear-gradient(135deg, #e7f3ff, #cce7ff);
                border: 2px solid #b3d4fc;
                padding: 12px;
                border-radius: 8px;
                font-size: 14px;
                color: #0c5460;
                text-align: center;
                margin: 15px 20px;
                font-weight: 600;
                display: none;
            `;

            // Insert after filter toggle container
            const filterToggle = document.getElementById("filterToggleContainer");
            if (filterToggle && filterToggle.parentNode) {
                filterToggle.parentNode.insertBefore(searchInfo, filterToggle.nextSibling);
            }
        }

        if (searchText) {
            searchInfo.textContent = `🔍 Tìm thấy ${visibleCount} / ${totalCount} kết quả cho: "${searchText}"`;
            searchInfo.style.display = "block";
        } else {
            searchInfo.style.display = "none";
        }
    }

    destroy() {
        if (this.searchInput) {
            this.searchInput.removeEventListener("input", this.handleSearch);
        }
        console.log("SimpleSearchManager destroyed");
    }
}

// Export
if (typeof module !== "undefined" && module.exports) {
    module.exports = { SimpleSearchManager };
} else {
    window.SimpleSearchManager = SimpleSearchManager;
}
