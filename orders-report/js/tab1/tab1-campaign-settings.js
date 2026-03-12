// ============================================
// CAMPAIGN SETTINGS MODAL
// Extracted from tab1-orders.html
// ============================================

// Open Campaign Settings Modal
window.openCampaignSettingsModal = function() {
    const modal = document.getElementById('campaignSettingsModal');
    modal.style.display = 'flex';

    // Sync values from hidden original elements to modal
    window.syncOriginalToModal();

    // Load user campaigns
    if (typeof window.loadUserCampaigns === 'function') {
        window.loadUserCampaigns();
    }
};

// Close Campaign Settings Modal
window.closeCampaignSettingsModal = function() {
    document.getElementById('campaignSettingsModal').style.display = 'none';
};

// Sync original hidden elements to modal inputs
window.syncOriginalToModal = function() {
    // Sync custom date range (From - To)
    const originalCustomStartDate = document.getElementById('customStartDate');
    const modalCustomStartDate = document.getElementById('modalCustomStartDate');
    if (originalCustomStartDate && modalCustomStartDate) {
        modalCustomStartDate.value = originalCustomStartDate.value;
    }

    const originalCustomEndDate = document.getElementById('customEndDate');
    const modalCustomEndDate = document.getElementById('modalCustomEndDate');
    if (originalCustomEndDate && modalCustomEndDate) {
        modalCustomEndDate.value = originalCustomEndDate.value;
    }

    // Sync realtime checkbox
    const originalRealtimeCheckbox = document.getElementById('realtimeToggleCheckbox');
    const modalRealtimeCheckbox = document.getElementById('modalRealtimeToggleCheckbox');
    if (originalRealtimeCheckbox && modalRealtimeCheckbox) {
        modalRealtimeCheckbox.checked = originalRealtimeCheckbox.checked;
    }

    // Sync realtime mode
    const originalRealtimeMode = document.getElementById('realtimeModeSelect');
    const modalRealtimeMode = document.getElementById('modalRealtimeModeSelect');
    if (originalRealtimeMode && modalRealtimeMode) {
        modalRealtimeMode.value = originalRealtimeMode.value;
    }

    // Sync chat API source label
    const originalLabel = document.getElementById('chatApiSourceLabel');
    const modalLabel = document.getElementById('modalChatApiSourceLabel');
    if (originalLabel && modalLabel) {
        modalLabel.textContent = originalLabel.textContent;
    }
};

// Auto-fill end date when start date changes (+3 days at 00:00)
window.autoFillCustomEndDate = function() {
    const modalCustomStartDate = document.getElementById('modalCustomStartDate');
    const modalCustomEndDate = document.getElementById('modalCustomEndDate');

    if (modalCustomStartDate && modalCustomEndDate && modalCustomStartDate.value) {
        const startDate = new Date(modalCustomStartDate.value);
        const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days

        // Set end date to 00:00 AM
        endDate.setHours(0, 0, 0, 0);

        // Format as datetime-local
        const year = endDate.getFullYear();
        const month = String(endDate.getMonth() + 1).padStart(2, '0');
        const day = String(endDate.getDate()).padStart(2, '0');
        const hours = String(endDate.getHours()).padStart(2, '0');
        const minutes = String(endDate.getMinutes()).padStart(2, '0');

        modalCustomEndDate.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
};

// Setup event listener for auto-fill
document.addEventListener('DOMContentLoaded', function() {
    const modalCustomStartDate = document.getElementById('modalCustomStartDate');
    if (modalCustomStartDate) {
        modalCustomStartDate.addEventListener('change', window.autoFillCustomEndDate);
    }

    // Add event listener for user campaign select
    const userCampaignSelect = document.getElementById('modalUserCampaignSelect');
    if (userCampaignSelect) {
        userCampaignSelect.addEventListener('change', function() {
            if (typeof window.applyUserCampaign === 'function') {
                window.applyUserCampaign();
            }
        });
    }
});

// Toggle chat API source from modal
window.toggleChatAPISourceFromModal = function() {
    if (typeof toggleChatAPISource === 'function') {
        toggleChatAPISource();
    }
    // Update modal label after toggle
    setTimeout(function() {
        const originalLabel = document.getElementById('chatApiSourceLabel');
        const modalLabel = document.getElementById('modalChatApiSourceLabel');
        if (originalLabel && modalLabel) {
            modalLabel.textContent = originalLabel.textContent;
        }
    }, 100);
};

// Load campaigns from modal (simplified - just triggers search)
window.handleLoadCampaignsFromModal = function() {
    if (typeof window.applyCampaignSettings === 'function') {
        window.applyCampaignSettings();
    }
};

console.log('[TAB1-CAMPAIGN-SETTINGS] Module loaded');
