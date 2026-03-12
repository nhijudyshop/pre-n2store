// =====================================================
// UTILITY FUNCTIONS - Page Specific
// Common utils (sanitizeInput, formatDate, debounce, etc.)
// are now in shared/js/date-utils.js and shared/js/form-utils.js
// =====================================================

/**
 * Log action to edit history (page-specific)
 */
function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Kiểm Hàng",
) {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: generateUniqueID("log"),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => console.log("Log entry saved successfully"))
        .catch((error) => console.error("Error saving log entry: ", error));
}

console.log("Utility functions loaded (using shared utils)");
