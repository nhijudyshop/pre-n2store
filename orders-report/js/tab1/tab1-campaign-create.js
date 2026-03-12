// ============================================
// CREATE CAMPAIGN MODAL
// Extracted from tab1-orders.html
// ============================================

// Open Create Campaign Modal
window.openCreateCampaignModal = function() {
    const modal = document.getElementById('createCampaignModal');
    modal.style.display = 'flex';

    // Reset form
    document.getElementById('newCampaignName').value = '';
    document.getElementById('newCampaignCustomStartDate').value = '';
    document.getElementById('newCampaignCustomEndDate').value = '';

    // Copy current dates from main modal if available
    const modalCustomStartDate = document.getElementById('modalCustomStartDate');
    const modalCustomEndDate = document.getElementById('modalCustomEndDate');
    if (modalCustomStartDate && modalCustomStartDate.value) {
        document.getElementById('newCampaignCustomStartDate').value = modalCustomStartDate.value;
    }
    if (modalCustomEndDate && modalCustomEndDate.value) {
        document.getElementById('newCampaignCustomEndDate').value = modalCustomEndDate.value;
    }

    // Focus on name input
    document.getElementById('newCampaignName').focus();
};

// Close Create Campaign Modal
window.closeCreateCampaignModal = function() {
    document.getElementById('createCampaignModal').style.display = 'none';
};

// Auto-fill end date when start date changes in create modal
document.addEventListener('DOMContentLoaded', function() {
    const newCampaignStartDate = document.getElementById('newCampaignCustomStartDate');
    if (newCampaignStartDate) {
        newCampaignStartDate.addEventListener('change', function() {
            const endDateInput = document.getElementById('newCampaignCustomEndDate');
            if (this.value && endDateInput) {
                const startDate = new Date(this.value);
                const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days
                endDate.setHours(0, 0, 0, 0); // 00:00 AM

                const year = endDate.getFullYear();
                const month = String(endDate.getMonth() + 1).padStart(2, '0');
                const day = String(endDate.getDate()).padStart(2, '0');
                const hours = String(endDate.getHours()).padStart(2, '0');
                const minutes = String(endDate.getMinutes()).padStart(2, '0');

                endDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
        });
    }
});

// Save new campaign to Firebase
window.saveNewCampaign = async function() {
    const name = document.getElementById('newCampaignName').value.trim();
    const customStartDate = document.getElementById('newCampaignCustomStartDate').value;
    const customEndDate = document.getElementById('newCampaignCustomEndDate').value;

    // Validation
    if (!name) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng nhập tên chiến dịch!', 'error');
        } else {
            alert('Vui lòng nhập tên chiến dịch!');
        }
        document.getElementById('newCampaignName').focus();
        return;
    }

    if (!customStartDate) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn Từ ngày!', 'error');
        } else {
            alert('Vui lòng chọn Từ ngày!');
        }
        return;
    }

    try {
        // Check if Firebase is available
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firestore not available');
        }

        const db = firebase.firestore();
        const campaignId = 'campaign_' + Date.now();

        const campaignData = {
            name: name,
            customStartDate: customStartDate,
            customEndDate: customEndDate || '',
            timeFrame: 'custom',
            createdAt: new Date().toISOString()
        };

        await db.collection('campaigns').doc(campaignId).set(campaignData);

        // Add to local cache
        window.campaignManager.allCampaigns[campaignId] = campaignData;

        console.log('[USER-CAMPAIGNS] Saved campaign:', name);

        // Check if this is the first campaign or user has no active campaign
        const isFirstCampaign = Object.keys(window.campaignManager.allCampaigns).length === 1;
        const hasNoActiveCampaign = !window.campaignManager.activeCampaignId;

        // Close modal first
        window.closeCreateCampaignModal();

        if (isFirstCampaign || hasNoActiveCampaign) {
            // Auto-set as active
            if (typeof window.saveActiveCampaign === 'function') {
                await window.saveActiveCampaign(campaignId);
            }

            // Close any onboarding modals
            if (typeof window.closeNoCampaignsModal === 'function') {
                window.closeNoCampaignsModal();
            }
            if (typeof window.closeSelectCampaignModal === 'function') {
                window.closeSelectCampaignModal();
            }

            // Use continueAfterCampaignSelect() from JS to load data
            if (typeof continueAfterCampaignSelect === 'function') {
                await continueAfterCampaignSelect(campaignId);
            }
        }

        // Reload campaigns dropdown
        if (typeof window.loadUserCampaigns === 'function') {
            window.loadUserCampaigns();
        }

        if (typeof showNotification === 'function') {
            showNotification('Đã lưu chiến dịch: ' + name, 'success');
        }

    } catch (error) {
        console.error('[USER-CAMPAIGNS] Error saving campaign:', error);
        if (typeof showNotification === 'function') {
            showNotification('Lỗi lưu chiến dịch: ' + error.message, 'error');
        } else {
            alert('Lỗi lưu chiến dịch: ' + error.message);
        }
    }
};

console.log('[TAB1-CAMPAIGN-CREATE] Module loaded');
