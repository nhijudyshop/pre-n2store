// =====================================================
// BUTTON ICONS MANAGER - Inject Lucide icons into buttons
// =====================================================

class ButtonIconsManager {
    constructor() {
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () =>
                this.setupObserver(),
            );
        } else {
            this.setupObserver();
        }
    }

    setupObserver() {
        // Add icons to existing buttons
        this.addIconsToButtons();

        // Watch for dynamically added buttons
        const observer = new MutationObserver((mutations) => {
            let hasNewButtons = false;

            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Element node
                        // Check if the node itself is a button
                        if (
                            node.classList &&
                            (node.classList.contains("edit-button") ||
                                node.classList.contains("delete-button"))
                        ) {
                            hasNewButtons = true;
                        }
                        // Check if the node contains buttons
                        if (node.querySelectorAll) {
                            const buttons = node.querySelectorAll(
                                ".edit-button, .delete-button",
                            );
                            if (buttons.length > 0) {
                                hasNewButtons = true;
                            }
                        }
                    }
                });
            });

            if (hasNewButtons) {
                // Small delay to ensure buttons are fully rendered
                setTimeout(() => this.addIconsToButtons(), 50);
            }
        });

        // Start observing the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        console.log("[ButtonIcons] Observer setup complete");
    }

    addIconsToButtons() {
        // Add icons to edit buttons
        const editButtons = document.querySelectorAll(
            ".edit-button:not([data-icon-added])",
        );
        editButtons.forEach((button) => {
            if (!button.querySelector("i")) {
                const icon = document.createElement("i");
                icon.setAttribute("data-lucide", "edit-3");
                button.appendChild(icon);
                button.setAttribute("data-icon-added", "true");
            }
        });

        // Add icons to delete buttons
        const deleteButtons = document.querySelectorAll(
            ".delete-button:not([data-icon-added])",
        );
        deleteButtons.forEach((button) => {
            if (!button.querySelector("i")) {
                const icon = document.createElement("i");
                icon.setAttribute("data-lucide", "trash-2");
                button.appendChild(icon);
                button.setAttribute("data-icon-added", "true");
            }
        });

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Manual refresh method
    refresh() {
        this.addIconsToButtons();
    }
}

// Initialize the manager
const buttonIconsManager = new ButtonIconsManager();
window.buttonIconsManager = buttonIconsManager;

// Export refresh function for manual use
window.refreshButtonIcons = () => buttonIconsManager.refresh();

console.log("✅ Button Icons Manager initialized");
