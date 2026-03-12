// ============================================
// CAMPAIGN MANAGEMENT SYSTEM
// Extracted from tab1-orders.html
// ============================================

// Global state
window.campaignManager = {
    allCampaigns: {},
    activeCampaignId: null,
    activeCampaign: null,
    currentUserId: null,
    initialized: false
};

// ============================================
// FIREBASE OPERATIONS
// ============================================

// Load all campaigns from Firestore
window.loadAllCampaigns = async function () {
    try {
        const db = firebase.firestore();
        const snapshot = await db.collection('campaigns').get();
        const campaigns = {};
        snapshot.forEach(doc => {
            campaigns[doc.id] = doc.data();
        });
        window.campaignManager.allCampaigns = campaigns;
        return window.campaignManager.allCampaigns;
    } catch (error) {
        console.error('[CAMPAIGN] Error loading campaigns:', error);
        return {};
    }
};

// Save active campaign ID for user
window.saveActiveCampaign = async function (campaignId) {
    try {
        const db = firebase.firestore();
        const userId = window.campaignManager.currentUserId;
        await db.collection('user_preferences').doc(userId).set(
            { activeCampaignId: campaignId },
            { merge: true }
        );

        window.campaignManager.activeCampaignId = campaignId;
        window.campaignManager.activeCampaign = window.campaignManager.allCampaigns[campaignId];

        console.log('[CAMPAIGN] Saved active campaign:', campaignId);
        return true;
    } catch (error) {
        console.error('[CAMPAIGN] Error saving active campaign:', error);
        return false;
    }
};

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

// Update Campaign Settings modal UI
window.updateCampaignSettingsUI = function (campaign) {
    // Update time frame label
    const timeFrameLabel = document.getElementById('campaignTimeFrameLabel');
    if (timeFrameLabel && campaign) {
        const timeFrameText = window.getTimeFrameDisplayText(campaign.timeFrame);
        timeFrameLabel.innerHTML = `<i class="fas fa-clock"></i> ${timeFrameText}`;
    }

    // Update custom date display
    const customDateDisplay = document.getElementById('campaignCustomDateDisplay');
    const customDateLabel = document.getElementById('campaignCustomDateLabel');
    if (customDateDisplay && customDateLabel && campaign) {
        if (campaign.timeFrame === 'custom' && campaign.customStartDate) {
            customDateDisplay.style.display = 'block';
            const date = new Date(campaign.customStartDate);
            customDateLabel.textContent = date.toLocaleString('vi-VN');
        } else {
            customDateDisplay.style.display = 'none';
        }
    }

    // Update modal dropdown to show active campaign
    const modalSelect = document.getElementById('modalUserCampaignSelect');
    if (modalSelect && window.campaignManager.activeCampaignId) {
        modalSelect.value = window.campaignManager.activeCampaignId;
    }

    // SYNC DATE FIELDS - Critical for fetchOrders() to use correct dates
    if (campaign && campaign.customStartDate) {
        // Sync to modal visible fields
        const modalCustomStartDate = document.getElementById('modalCustomStartDate');
        const modalCustomEndDate = document.getElementById('modalCustomEndDate');
        if (modalCustomStartDate) {
            modalCustomStartDate.value = campaign.customStartDate;
        }
        if (modalCustomEndDate) {
            modalCustomEndDate.value = campaign.customEndDate || '';
        }

        // Sync to hidden fields (used by fetchOrders)
        const customStartDate = document.getElementById('customStartDate');
        const customEndDate = document.getElementById('customEndDate');
        if (customStartDate) {
            customStartDate.value = campaign.customStartDate;
        }
        if (customEndDate) {
            customEndDate.value = campaign.customEndDate || '';
        }

        // Also sync to startDate/endDate for backward compatibility
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        if (startDate) {
            startDate.value = campaign.customStartDate;
        }
        if (endDate) {
            endDate.value = campaign.customEndDate || '';
        }

        console.log('[CAMPAIGN-SYNC] Synced dates:', campaign.customStartDate, '->', campaign.customEndDate);
    }
};

// Get display text for time frame
window.getTimeFrameDisplayText = function (timeFrame) {
    if (!timeFrame) return 'Chưa chọn';

    // Try to find the label from the original campaign filter
    const campaignFilter = document.getElementById('campaignFilter');
    if (campaignFilter) {
        const option = Array.from(campaignFilter.options).find(opt => opt.value === timeFrame);
        if (option) return option.textContent;
    }

    // Fallback
    if (timeFrame === 'custom') return '🔮 Custom (lọc theo ngày tạo đơn)';
    return timeFrame;
};

// ============================================
// ONBOARDING MODALS
// ============================================

// Show "No Campaigns" modal
window.showNoCampaignsModal = function () {
    document.getElementById('noCampaignsModal').style.display = 'flex';
};

window.closeNoCampaignsModal = function () {
    document.getElementById('noCampaignsModal').style.display = 'none';
};

// Show "Select Campaign" modal
window.showSelectCampaignModal = function () {
    const modal = document.getElementById('selectCampaignModal');
    const dropdown = document.getElementById('selectCampaignDropdown');

    if (dropdown) {
        dropdown.innerHTML = '<option value="">-- Chọn chiến dịch --</option>';
        Object.entries(window.campaignManager.allCampaigns).forEach(([id, campaign]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = campaign.name;
            dropdown.appendChild(option);
        });
    }

    modal.style.display = 'flex';
};

window.closeSelectCampaignModal = function () {
    document.getElementById('selectCampaignModal').style.display = 'none';
};

// Confirm selection from Select Campaign modal
window.confirmSelectCampaign = async function () {
    const dropdown = document.getElementById('selectCampaignDropdown');
    if (!dropdown || !dropdown.value) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn một chiến dịch!', 'error');
        }
        return;
    }

    const campaignId = dropdown.value;

    // Check if campaign has dates
    const campaign = window.campaignManager.allCampaigns[campaignId];
    if (!campaign.customStartDate) {
        if (typeof showNotification === 'function') {
            showNotification('Chiến dịch chưa có ngày bắt đầu!', 'error');
        }
        // Show edit modal to set dates
        window.closeSelectCampaignModal();
        window.showCampaignNoDatesModal(campaignId);
        return;
    }

    await window.saveActiveCampaign(campaignId);
    window.closeSelectCampaignModal();

    // Use continueAfterCampaignSelect() from JS
    if (typeof continueAfterCampaignSelect === 'function') {
        await continueAfterCampaignSelect(campaignId);
    }

    if (typeof showNotification === 'function') {
        showNotification('Đã chọn chiến dịch: ' + campaign.name, 'success');
    }
};

// Show "Campaign Deleted" modal
window.showCampaignDeletedModal = function () {
    document.getElementById('campaignDeletedModal').style.display = 'flex';
};

window.closeCampaignDeletedModal = function () {
    document.getElementById('campaignDeletedModal').style.display = 'none';
};

// Show "Campaign No Dates" modal - when campaign has no start date
window.showCampaignNoDatesModal = function (campaignId) {
    const campaign = window.campaignManager.allCampaigns[campaignId];
    if (!campaign) return;

    // Store campaignId for later use
    document.getElementById('noDatesModalCampaignId').value = campaignId;
    document.getElementById('noDatesModalCampaignName').textContent = campaign.name;

    // Reset date inputs
    document.getElementById('noDatesModalStartDate').value = '';
    document.getElementById('noDatesModalEndDate').value = '';

    document.getElementById('campaignNoDatesModal').style.display = 'flex';
};

window.closeCampaignNoDatesModal = function () {
    document.getElementById('campaignNoDatesModal').style.display = 'none';
};

// Save dates and continue
window.saveCampaignDatesAndContinue = async function () {
    const campaignId = document.getElementById('noDatesModalCampaignId').value;
    const startDate = document.getElementById('noDatesModalStartDate').value;
    const endDate = document.getElementById('noDatesModalEndDate').value;

    if (!startDate) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn ngày bắt đầu!', 'error');
        }
        return;
    }

    try {
        const db = firebase.firestore();

        // Update campaign in Firestore
        await db.collection('campaigns').doc(campaignId).update({
            customStartDate: startDate,
            customEndDate: endDate || '',
            timeFrame: 'custom',
            updatedAt: new Date().toISOString()
        });

        // Update local cache
        window.campaignManager.allCampaigns[campaignId].customStartDate = startDate;
        window.campaignManager.allCampaigns[campaignId].customEndDate = endDate || '';
        window.campaignManager.allCampaigns[campaignId].timeFrame = 'custom';

        // Set as active and continue
        await window.saveActiveCampaign(campaignId);
        window.closeCampaignNoDatesModal();

        // Use continueAfterCampaignSelect() from JS
        if (typeof continueAfterCampaignSelect === 'function') {
            await continueAfterCampaignSelect(campaignId);
        }

        if (typeof showNotification === 'function') {
            showNotification('Đã cập nhật và chọn chiến dịch!', 'success');
        }

    } catch (error) {
        console.error('[CAMPAIGN] Error updating campaign dates:', error);
        if (typeof showNotification === 'function') {
            showNotification('Lỗi cập nhật chiến dịch: ' + error.message, 'error');
        }
    }
};

// ============================================
// MANAGE CAMPAIGNS MODAL
// ============================================

window.openManageCampaignsModal = function () {
    const modal = document.getElementById('manageCampaignsModal');
    modal.style.display = 'flex';
    window.renderManageCampaignsList();
};

window.closeManageCampaignsModal = function () {
    document.getElementById('manageCampaignsModal').style.display = 'none';
};

window.renderManageCampaignsList = async function () {
    const container = document.getElementById('manageCampaignsList');
    if (!container) return;

    // Reload campaigns
    await window.loadAllCampaigns();
    const campaigns = window.campaignManager.allCampaigns;

    if (Object.keys(campaigns).length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #9ca3af; padding: 40px;">
                <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>Chưa có chiến dịch nào</p>
            </div>
        `;
        return;
    }

    let html = '';
    Object.entries(campaigns).forEach(([id, campaign]) => {
        const isActive = id === window.campaignManager.activeCampaignId;
        const timeFrameText = window.getTimeFrameDisplayText(campaign.timeFrame);

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: ${isActive ? '#ede9fe' : 'white'}; border: 1px solid ${isActive ? '#8b5cf6' : '#e5e7eb'}; border-radius: 8px; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #374151; display: flex; align-items: center; gap: 8px;">
                        ${isActive ? '<i class="fas fa-check-circle" style="color: #8b5cf6;"></i>' : '<i class="fas fa-bullhorn" style="color: #9ca3af;"></i>'}
                        ${campaign.name}
                        ${isActive ? '<span style="font-size: 11px; background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 10px;">Đang dùng</span>' : ''}
                    </div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                        <i class="fas fa-clock"></i> ${timeFrameText}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="openEditCampaignModal('${id}')"
                        style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteCampaign('${id}')"
                        style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// ============================================
// EDIT CAMPAIGN MODAL
// ============================================

window.openEditCampaignModal = function (campaignId) {
    const campaign = window.campaignManager.allCampaigns[campaignId];
    if (!campaign) return;

    document.getElementById('editCampaignId').value = campaignId;
    document.getElementById('editCampaignName').value = campaign.name;

    // Load custom date range (Custom mode only now)
    const startDateInput = document.getElementById('editCampaignCustomStartDate');
    const endDateInput = document.getElementById('editCampaignCustomEndDate');

    if (startDateInput && campaign.customStartDate) {
        startDateInput.value = campaign.customStartDate;
    } else if (startDateInput) {
        // Default to now if no saved date
        const now = new Date();
        startDateInput.value = now.toISOString().slice(0, 16);
    }

    if (endDateInput && campaign.customEndDate) {
        endDateInput.value = campaign.customEndDate;
    } else if (endDateInput && startDateInput.value) {
        // Auto-fill end date = start date + 3 days at 00:00
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        endDate.setHours(0, 0, 0, 0);
        endDateInput.value = endDate.toISOString().slice(0, 16);
    }

    document.getElementById('editCampaignModal').style.display = 'flex';
};

// Auto-fill end date when start date changes in Edit Campaign Modal (+3 days at 00:00)
window.autoFillEditCampaignEndDate = function () {
    const startDateInput = document.getElementById('editCampaignCustomStartDate');
    const endDateInput = document.getElementById('editCampaignCustomEndDate');

    if (startDateInput && endDateInput && startDateInput.value) {
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        endDate.setHours(0, 0, 0, 0);
        endDateInput.value = endDate.toISOString().slice(0, 16);
    }
};

window.closeEditCampaignModal = function () {
    document.getElementById('editCampaignModal').style.display = 'none';
};

window.saveEditCampaign = async function () {
    const campaignId = document.getElementById('editCampaignId').value;
    const name = document.getElementById('editCampaignName').value.trim();
    const customStartDate = document.getElementById('editCampaignCustomStartDate').value;
    const customEndDate = document.getElementById('editCampaignCustomEndDate').value;

    if (!name) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng nhập tên chiến dịch!', 'error');
        }
        return;
    }

    if (!customStartDate) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn ngày bắt đầu!', 'error');
        }
        return;
    }

    try {
        const db = firebase.firestore();
        const timeFrameLabel = 'Custom (lọc theo ngày tạo đơn)';

        await db.collection('campaigns').doc(campaignId).update({
            name: name,
            timeFrame: 'custom',
            timeFrameLabel: timeFrameLabel,
            customStartDate: customStartDate,
            customEndDate: customEndDate || '',
            updatedAt: new Date().toISOString()
        });

        // Update local cache
        window.campaignManager.allCampaigns[campaignId] = {
            ...window.campaignManager.allCampaigns[campaignId],
            name: name,
            timeFrame: 'custom',
            customStartDate: customStartDate,
            customEndDate: customEndDate || ''
        };

        // If this is the active campaign, update UI
        if (campaignId === window.campaignManager.activeCampaignId) {
            window.campaignManager.activeCampaign = window.campaignManager.allCampaigns[campaignId];
            if (typeof updateActiveCampaignLabel === 'function') {
                updateActiveCampaignLabel(name);
            }
            window.updateCampaignSettingsUI(window.campaignManager.activeCampaign);
        }

        window.closeEditCampaignModal();
        window.renderManageCampaignsList();

        if (typeof showNotification === 'function') {
            showNotification('Đã cập nhật chiến dịch!', 'success');
        }
    } catch (error) {
        console.error('[CAMPAIGN] Error updating campaign:', error);
        if (typeof showNotification === 'function') {
            showNotification('Lỗi cập nhật: ' + error.message, 'error');
        }
    }
};

// ============================================
// DELETE CAMPAIGN
// ============================================

window.deleteCampaign = async function (campaignId) {
    const campaign = window.campaignManager.allCampaigns[campaignId];
    if (!campaign) return;

    if (!confirm(`Bạn có chắc muốn xóa chiến dịch "${campaign.name}"?\n\nLưu ý: Người dùng khác đang sử dụng chiến dịch này sẽ được thông báo khi họ tải lại trang.`)) {
        return;
    }

    try {
        const db = firebase.firestore();
        await db.collection('campaigns').doc(campaignId).delete();

        // Remove from local cache
        delete window.campaignManager.allCampaigns[campaignId];

        // If this was the active campaign, clear it
        if (campaignId === window.campaignManager.activeCampaignId) {
            window.campaignManager.activeCampaignId = null;
            window.campaignManager.activeCampaign = null;

            // Clear user's active campaign
            const userId = window.campaignManager.currentUserId;
            await db.collection('user_preferences').doc(userId).update({
                activeCampaignId: firebase.firestore.FieldValue.delete()
            });

            // Show select modal if other campaigns exist
            const remainingCampaigns = Object.keys(window.campaignManager.allCampaigns).length;
            if (remainingCampaigns > 0) {
                window.closeManageCampaignsModal();
                window.showSelectCampaignModal();
            } else {
                window.closeManageCampaignsModal();
                window.showNoCampaignsModal();
            }
        } else {
            window.renderManageCampaignsList();
        }

        if (typeof showNotification === 'function') {
            showNotification('Đã xóa chiến dịch!', 'success');
        }
    } catch (error) {
        console.error('[CAMPAIGN] Error deleting campaign:', error);
        if (typeof showNotification === 'function') {
            showNotification('Lỗi xóa chiến dịch: ' + error.message, 'error');
        }
    }
};

// ============================================
// OVERRIDE EXISTING FUNCTIONS
// ============================================

// Override loadUserCampaigns to use the new system
window.loadUserCampaigns = async function () {
    const select = document.getElementById('modalUserCampaignSelect');
    if (!select) return;

    await window.loadAllCampaigns();
    const campaigns = window.campaignManager.allCampaigns;

    select.innerHTML = '<option value="">-- Chọn chiến dịch --</option>';
    Object.entries(campaigns).forEach(([id, campaign]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = campaign.name;
        option.dataset.timeFrame = campaign.timeFrame || '';
        option.dataset.timeFrameLabel = campaign.timeFrameLabel || '';
        option.dataset.customStartDate = campaign.customStartDate || '';
        if (id === window.campaignManager.activeCampaignId) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Update time frame display
    if (window.campaignManager.activeCampaign) {
        window.updateCampaignSettingsUI(window.campaignManager.activeCampaign);
    }
};

// Override applyUserCampaign to save active campaign AND reload orders
window.applyUserCampaign = async function () {
    const select = document.getElementById('modalUserCampaignSelect');
    if (!select || !select.value) return;

    const campaignId = select.value;
    const campaign = window.campaignManager.allCampaigns[campaignId];
    if (!campaign) return;

    // Save as active campaign
    await window.saveActiveCampaign(campaignId);

    // Update UI labels
    if (typeof updateActiveCampaignLabel === 'function') {
        updateActiveCampaignLabel(campaign.name);
    }
    window.updateCampaignSettingsUI(campaign);

    // Apply time frame and RELOAD orders
    const campaignFilter = document.getElementById('campaignFilter');
    if (campaignFilter && campaign.timeFrame) {
        campaignFilter.value = campaign.timeFrame;

        // Apply custom start date if needed
        if (campaign.timeFrame === 'custom' && campaign.customStartDate) {
            const customStartDate = document.getElementById('customStartDate');
            if (customStartDate) {
                customStartDate.value = campaign.customStartDate;
            }

            // Show custom date container
            const customDateContainer = document.getElementById('customDateFilterContainer');
            if (customDateContainer) {
                customDateContainer.style.display = 'flex';
            }

            // Set selectedCampaign for custom mode
            if (typeof selectedCampaign !== 'undefined') {
                selectedCampaign = { isCustom: true };
            }

            // SYNC: Save filter preferences to Firebase for page refresh
            if (typeof saveFilterPreferencesToFirebase === 'function') {
                saveFilterPreferencesToFirebase({
                    selectedCampaignValue: 'custom',
                    isCustomMode: true,
                    customStartDate: campaign.customStartDate
                });
            }

            // For custom campaigns, directly trigger search since date is already set
            // ⭐ CRITICAL: Load employee ranges for this campaign BEFORE search
            console.log('[CAMPAIGN] 📊 Loading employee ranges for campaign:', campaign.name);
            if (typeof loadEmployeeRangesForCampaign === 'function') {
                await loadEmployeeRangesForCampaign(campaign.name);
            }

            console.log('[CAMPAIGN] Custom campaign, directly triggering search for:', campaign.name);
            if (typeof handleSearch === 'function') {
                await handleSearch();
            }

            // Setup TAG listeners
            if (typeof setupTagRealtimeListeners === 'function') {
                setupTagRealtimeListeners();
            }

            // Connect realtime server
            if (window.realtimeManager) {
                window.realtimeManager.connectServerMode();
            }
        } else {
            // For non-custom campaigns, use handleCampaignChange (which saves filter prefs)
            if (typeof handleCampaignChange === 'function') {
                console.log('[CAMPAIGN] Reloading orders for campaign:', campaign.name);
                await handleCampaignChange();
            }
        }
    }

    if (typeof showNotification === 'function') {
        showNotification('Đã chọn và tải chiến dịch: ' + campaign.name, 'success');
    }
};

// Override applyCampaignSettings - check if campaign changed and reload if needed
window.applyCampaignSettings = async function () {
    // Get selected campaign from dropdown
    const select = document.getElementById('modalUserCampaignSelect');
    const selectedCampaignId = select ? select.value : null;

    if (!selectedCampaignId) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn một chiến dịch!', 'error');
        }
        return;
    }

    const campaign = window.campaignManager.allCampaigns[selectedCampaignId];
    if (!campaign) return;

    // Check if campaign is different from current active
    const currentActiveId = window.campaignManager.activeCampaignId;
    const needReload = currentActiveId !== selectedCampaignId;

    // Save as active campaign
    await window.saveActiveCampaign(selectedCampaignId);

    // Update UI labels
    if (typeof updateActiveCampaignLabel === 'function') {
        updateActiveCampaignLabel(campaign.name);
    }
    window.updateCampaignSettingsUI(campaign);

    // Sync realtime settings
    const originalRealtimeCheckbox = document.getElementById('realtimeToggleCheckbox');
    const modalRealtimeCheckbox = document.getElementById('modalRealtimeToggleCheckbox');
    if (originalRealtimeCheckbox && modalRealtimeCheckbox && originalRealtimeCheckbox.checked !== modalRealtimeCheckbox.checked) {
        originalRealtimeCheckbox.checked = modalRealtimeCheckbox.checked;
        if (typeof toggleRealtimeMode === 'function') {
            toggleRealtimeMode(modalRealtimeCheckbox.checked);
        }
    }

    const originalRealtimeMode = document.getElementById('realtimeModeSelect');
    const modalRealtimeMode = document.getElementById('modalRealtimeModeSelect');
    if (originalRealtimeMode && modalRealtimeMode && originalRealtimeMode.value !== modalRealtimeMode.value) {
        originalRealtimeMode.value = modalRealtimeMode.value;
        if (typeof changeRealtimeMode === 'function') {
            changeRealtimeMode(modalRealtimeMode.value);
        }
    }

    window.closeCampaignSettingsModal();

    // Reload orders if campaign changed
    if (needReload) {
        const campaignFilter = document.getElementById('campaignFilter');
        if (campaignFilter && campaign.timeFrame) {
            campaignFilter.value = campaign.timeFrame;

            // Apply custom start date if needed
            if (campaign.timeFrame === 'custom' && campaign.customStartDate) {
                const customStartDate = document.getElementById('customStartDate');
                if (customStartDate) {
                    customStartDate.value = campaign.customStartDate;
                }

                // Show custom date container
                const customDateContainer = document.getElementById('customDateFilterContainer');
                if (customDateContainer) {
                    customDateContainer.style.display = 'flex';
                }

                // Set selectedCampaign for custom mode
                if (typeof selectedCampaign !== 'undefined') {
                    selectedCampaign = { isCustom: true };
                }

                // SYNC: Save filter preferences to Firebase for page refresh
                if (typeof saveFilterPreferencesToFirebase === 'function') {
                    saveFilterPreferencesToFirebase({
                        selectedCampaignValue: 'custom',
                        isCustomMode: true,
                        customStartDate: campaign.customStartDate
                    });
                }

                // For custom campaigns, directly trigger search since date is already set
                // ⭐ CRITICAL: Load employee ranges for this campaign BEFORE search
                console.log('[CAMPAIGN] 📊 Loading employee ranges for campaign:', campaign.name);
                if (typeof loadEmployeeRangesForCampaign === 'function') {
                    await loadEmployeeRangesForCampaign(campaign.name);
                }

                console.log('[CAMPAIGN] Custom campaign, directly triggering search for:', campaign.name);
                if (typeof handleSearch === 'function') {
                    await handleSearch();
                }

                // Setup TAG listeners
                if (typeof setupTagRealtimeListeners === 'function') {
                    setupTagRealtimeListeners();
                }

                // Connect realtime server
                if (window.realtimeManager) {
                    window.realtimeManager.connectServerMode();
                }
            } else {
                // For non-custom campaigns, use handleCampaignChange (which saves filter prefs)
                if (typeof handleCampaignChange === 'function') {
                    console.log('[CAMPAIGN] Campaign changed, reloading orders for:', campaign.name);
                    await handleCampaignChange();
                }
            }
        }

        if (typeof showNotification === 'function') {
            showNotification('Đã chuyển sang chiến dịch: ' + campaign.name, 'success');
        }
    } else {
        if (typeof showNotification === 'function') {
            showNotification('Đã lưu cài đặt!', 'success');
        }
    }

    if (typeof showNotification === 'function') {
        showNotification('Đã áp dụng cài đặt chiến dịch!', 'success');
    }
};

console.log('[TAB1-CAMPAIGN-SYSTEM] Module loaded');
