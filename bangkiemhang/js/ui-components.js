// =====================================================
// UI COMPONENTS AND FLOATING ALERTS
// =====================================================

function showFloatingAlert(message, isLoading = false, duration = 0) {
    const alert = document.getElementById("floatingAlert");
    const alertText = alert.querySelector(".alert-text");
    const spinner = alert.querySelector(".loading-spinner");

    alertText.textContent = message;

    if (isLoading) {
        alert.classList.add("loading");
        spinner.style.display = "inline-block";
    } else {
        alert.classList.remove("loading");
        spinner.style.display = "none";
    }

    alert.classList.add("show");

    if (duration > 0) {
        setTimeout(() => {
            hideFloatingAlert();
        }, duration);
    }
}

function hideFloatingAlert() {
    const alert = document.getElementById("floatingAlert");
    alert.classList.remove("show", "loading");
    alert.querySelector(".loading-spinner").style.display = "none";
}

// Show confirmation dialog with custom styling
function showConfirmDialog(message, onConfirm, onCancel = null) {
    const confirmed = confirm(message);
    if (confirmed && onConfirm) {
        onConfirm();
    } else if (!confirmed && onCancel) {
        onCancel();
    }
    return confirmed;
}

// Show info message with auto-hide
function showInfoMessage(message, duration = 3000) {
    showFloatingAlert(message, false, duration);
}

// Show loading message
function showLoadingMessage(message) {
    showFloatingAlert(message, true);
}

// Show success message
function showSuccessMessage(message, duration = 2000) {
    showFloatingAlert("✓ " + message, false, duration);
}

// Show error message
function showErrorMessage(message, duration = 3000) {
    showFloatingAlert("✗ " + message, false, duration);
}

// Force unblock function for emergency use
window.forceUnblock = function () {
    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    const alertBox = document.getElementById("floatingAlert");
    if (alertBox) {
        alertBox.style.display = "none";
        alertBox.style.opacity = "0";
        alertBox.style.visibility = "hidden";
    }

    console.log("Force unblocked - page should be interactive now");
};

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showErrorMessage("Có lỗi xảy ra. Vui lòng tải lại trang.", 5000);
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    showErrorMessage("Có lỗi xảy ra trong xử lý dữ liệu.", 5000);
});

console.log("UI components system loaded");
