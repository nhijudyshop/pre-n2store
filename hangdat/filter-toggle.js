// =====================================================
// FILTER TOGGLE FUNCTIONALITY - DEFAULT COLLAPSED
// =====================================================

function initializeFilterToggle() {
    const filterBody = document.getElementById("filterBody");
    const filterCard = document.getElementById("filterCard");
    const cardHeader = filterCard?.querySelector(".card-header");
    const toggleBtn = document.getElementById("toggleFilterBtn");

    if (!filterBody || !filterCard || !cardHeader) {
        console.warn("[FilterToggle] Required elements not found");
        return;
    }

    // State - DEFAULT COLLAPSED
    let isCollapsed = true;

    // Function to collapse
    function collapse() {
        filterCard.classList.add("filter-collapsed");
        filterBody.style.maxHeight = "0";
        filterBody.style.opacity = "0";
        filterBody.style.paddingTop = "0";
        filterBody.style.paddingBottom = "0";

        // Update icon
        const icon = toggleBtn?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "chevron-down");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        isCollapsed = true;
        localStorage.setItem("filterCollapsed", "true");
    }

    // Function to expand
    function expand() {
        filterCard.classList.remove("filter-collapsed");

        // Get natural height
        filterBody.style.maxHeight = "none";
        const height = filterBody.scrollHeight;
        filterBody.style.maxHeight = "0";

        // Force reflow
        filterBody.offsetHeight;

        // Animate to full height
        requestAnimationFrame(() => {
            filterBody.style.maxHeight = height + "px";
            filterBody.style.opacity = "1";
            filterBody.style.paddingTop = "";
            filterBody.style.paddingBottom = "";
        });

        // After animation, set to auto
        setTimeout(() => {
            if (!isCollapsed) {
                filterBody.style.maxHeight = "none";
            }
        }, 300);

        // Update icon
        const icon = toggleBtn?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "chevron-up");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        isCollapsed = false;
        localStorage.setItem("filterCollapsed", "false");
    }

    // Toggle function
    function toggle(event) {
        // Prevent toggle if clicking on interactive elements inside header
        if (event && event.target.closest("button, input, select, a")) {
            return;
        }

        if (isCollapsed) {
            expand();
        } else {
            collapse();
        }
    }

    // Add cursor pointer to header
    cardHeader.style.cursor = "pointer";
    cardHeader.style.userSelect = "none";

    // Event listener on entire card header
    cardHeader.addEventListener("click", toggle);

    // ALWAYS START COLLAPSED - ignore localStorage
    collapse();

    console.log("[FilterToggle] Initialized - Default: COLLAPSED (always)");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeFilterToggle);
} else {
    initializeFilterToggle();
}

console.log("[FilterToggle] Script loaded - Always starts collapsed");
