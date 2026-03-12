// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 4: EMPLOYEE RANGE MANAGEMENT                      ║
// ║                            search: #EMPLOYEE                                ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// EMPLOYEE RANGE MANAGEMENT FUNCTIONS #EMPLOYEE
// =====================================================
async function loadAndRenderEmployeeTable() {
    try {
        // Initialize user loader
        if (window.userEmployeeLoader) {
            await window.userEmployeeLoader.initialize();
            const users = await window.userEmployeeLoader.loadUsers();

            if (users.length > 0) {
                renderEmployeeTable(users);
            } else {
                console.warn('[EMPLOYEE] No users found');
                const tbody = document.getElementById('employeeAssignmentBody');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy nhân viên nào</td></tr>';
            }
        } else {
            console.error('[EMPLOYEE] userEmployeeLoader not available');
        }
    } catch (error) {
        console.error('[EMPLOYEE] Error loading employee table:', error);
        const tbody = document.getElementById('employeeAssignmentBody');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải danh sách nhân viên</td></tr>';
    }
}

function renderEmployeeTable(users) {
    const tbody = document.getElementById('employeeAssignmentBody');

    // Use global employeeRanges which is synced from Firebase
    let savedRanges = {};
    if (employeeRanges && employeeRanges.length > 0) {
        employeeRanges.forEach(range => {
            savedRanges[range.name] = { start: range.start, end: range.end };
        });
    }

    // Render table rows
    let html = '';
    users.forEach(user => {
        const savedRange = savedRanges[user.displayName] || { start: '', end: '' };

        html += `
            <tr>
                <td style="padding: 8px;">${user.displayName}</td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="start"
                        value="${savedRange.start}"
                        placeholder="Từ"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="end"
                        value="${savedRange.end}"
                        placeholder="Đến"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Sanitize campaign name for Firebase path (remove invalid chars: . $ # [ ] /)
function sanitizeCampaignName(campaignName) {
    if (!campaignName) return null;
    // Replace invalid Firebase key characters with underscore
    // Note: Forward slash (/) must be replaced to match tab-overview.html sanitization
    return campaignName
        .replace(/[.$#\[\]\/]/g, '_')
        .trim();
}

function applyEmployeeRanges() {
    const inputs = document.querySelectorAll('.employee-range-input');
    const rangesMap = {};

    // Collect ranges from inputs
    inputs.forEach(input => {
        const userName = input.getAttribute('data-user-name');
        const field = input.getAttribute('data-field');
        const value = input.value.trim();

        if (!rangesMap[userName]) {
            rangesMap[userName] = {};
        }

        rangesMap[userName][field] = value ? parseInt(value) : null;
    });

    // Build employee ranges array
    const newRanges = [];

    Object.keys(rangesMap).forEach(userName => {
        const range = rangesMap[userName];

        // Only include if both start and end are filled
        if (range.start !== null && range.end !== null && range.start > 0 && range.end > 0) {
            // Find user ID from input attribute
            const input = document.querySelector(`.employee-range-input[data-user-name="${userName}"]`);
            const userId = input ? input.getAttribute('data-user-id') : null;

            newRanges.push({
                id: userId,
                name: userName,
                userId: userId,
                userName: userName,
                start: range.start,
                end: range.end
            });
        }
    });

    // Use local firestoreDb or fallback to window.firestoreDb
    const db = (typeof firestoreDb !== 'undefined' && firestoreDb) ? firestoreDb : window.firestoreDb;

    // Determine save logic - MUST select a campaign (no general config)
    const campaignSelector = document.getElementById('employeeCampaignSelector');
    const selectedOption = campaignSelector ? campaignSelector.options[campaignSelector.selectedIndex] : null;

    if (!selectedOption || !selectedOption.dataset.campaign) {
        alert('⚠️ Vui lòng chọn chiến dịch trước khi áp dụng phân chia nhân viên.');
        return;
    }

    const campaign = JSON.parse(selectedOption.dataset.campaign);
    const sanitizedName = sanitizeCampaignName(campaign.displayName);
    const campaignInfo = `cho chiến dịch "${campaign.displayName}"`;

    console.log(`[EMPLOYEE] Saving ranges for campaign: ${campaign.displayName} (key: ${sanitizedName})`);

    if (!db) {
        alert('❌ Lỗi: Không thể kết nối Firestore');
        return;
    }

    const docRef = db.collection('settings').doc('employee_ranges_by_campaign');
    docRef.get()
        .then((doc) => {
            const allCampaignRanges = doc.exists ? doc.data() : {};

            // Update this campaign's ranges
            allCampaignRanges[sanitizedName] = newRanges;

            // Save back to Firestore
            return docRef.set(allCampaignRanges);
        })
        .then(() => {
            // Update local state immediately
            employeeRanges = newRanges;
            window.employeeRanges = newRanges;

            if (window.notificationManager) {
                window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`, 'success');
            } else {
                alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
            }
            toggleEmployeeDrawer();

            // Re-render table to reflect new ranges
            performTableSearch();
        })
        .catch((error) => {
            console.error('[EMPLOYEE] Error saving ranges to Firestore:', error);
            alert('❌ Lỗi khi lưu lên Firestore: ' + error.message);
        });
}

function getEmployeeName(stt) {
    if (!stt || employeeRanges.length === 0) return null;

    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }

    return null;
}

function populateEmployeeCampaignSelector() {
    const select = document.getElementById('employeeCampaignSelector');
    if (!select) return;

    // Clear options - no general config option
    select.innerHTML = '<option value="" disabled>-- Chọn chiến dịch --</option>';

    // Get campaigns from window.campaignManager
    if (!window.campaignManager || !window.campaignManager.allCampaigns) {
        console.warn('[EMPLOYEE] window.campaignManager.allCampaigns not available');
        return;
    }

    const campaigns = window.campaignManager.allCampaigns;
    let count = 0;

    // Determine current campaign to auto-select
    const currentCampaignName = window.selectedCampaign?.displayName || window.selectedCampaign?.name || null;

    // Populate dropdown with campaigns
    Object.entries(campaigns).forEach(([campaignId, campaign]) => {
        const option = document.createElement('option');
        option.value = campaignId;
        const displayName = campaign.name || campaign.displayName || campaignId;
        option.textContent = displayName;
        // Store campaign data for later use
        option.dataset.campaign = JSON.stringify({
            id: campaignId,
            displayName: displayName
        });

        // Auto-select current campaign
        if (currentCampaignName && displayName === currentCampaignName) {
            option.selected = true;
        }

        select.appendChild(option);
        count++;
    });

    // If no campaign was auto-selected, select the first real campaign
    if (!currentCampaignName && select.options.length > 1) {
        select.selectedIndex = 1;
    }

    console.log(`[EMPLOYEE] Populated campaign selector with ${count} campaigns (current: ${currentCampaignName || 'none'})`);

    // Load ranges for the selected campaign
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.campaign) {
        const campaign = JSON.parse(selectedOption.dataset.campaign);
        loadEmployeeRangesForCampaign(campaign.displayName).then(() => {
            // Re-render table with loaded ranges
            if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                renderEmployeeTable(window.userEmployeeLoader.getUsers());
            }
        });
    }
}

function toggleEmployeeDrawer() {
    const drawer = document.getElementById('employeeDrawer');
    const overlay = document.getElementById('employeeDrawerOverlay');

    if (drawer && overlay) {
        const isActive = drawer.classList.contains('active');

        if (isActive) {
            // Close drawer
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // Open drawer - Reload table to show latest data
            populateEmployeeCampaignSelector();
            loadAndRenderEmployeeTable();
            drawer.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

function toggleControlBar() {
    const controlBar = document.getElementById('controlBar');
    const btn = document.getElementById('toggleControlBarBtn');

    if (controlBar && btn) {
        const isHidden = controlBar.style.display === 'none';

        if (isHidden) {
            controlBar.style.display = 'flex'; // Or 'block' depending on layout, but flex is used in inline style in html sometimes. Let's check original css. 
            // The original div.filter-section likely has display: flex in CSS. 
            // Let's assume removing style.display will revert to CSS class definition, or set to '' to clear inline style.
            controlBar.style.display = '';

            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Ẩn bộ lọc';
        } else {
            controlBar.style.display = 'none';
            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Hiển thị bộ lọc';
        }
    }
}

function checkAdminPermission() {
    const btn = document.getElementById('employeeSettingsBtn');
    if (btn) {
        // ✅ REMOVED PERMISSION CHECK - All users can now access employee settings
        // Previously: Only admin or users with 'viewRevenue' permission could access
        btn.style.display = 'inline-flex';
    }
}

// Helper function to convert Firebase object to array if needed
function normalizeEmployeeRanges(data) {
    if (!data) {
        console.log('[EMPLOYEE] normalizeEmployeeRanges: data is null/undefined');
        return [];
    }

    console.log('[EMPLOYEE] normalizeEmployeeRanges input:', typeof data, Array.isArray(data) ? 'array' : 'object', data);

    // If already an array, return it
    if (Array.isArray(data)) {
        console.log('[EMPLOYEE] Data is already an array with', data.length, 'items');
        return data;
    }

    // If it's an object, convert to array
    if (typeof data === 'object') {
        const result = [];
        const allKeys = Object.keys(data);

        // Try numeric keys first (Firebase array-like object: {0: {...}, 1: {...}})
        const numericKeys = allKeys.filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));

        if (numericKeys.length > 0) {
            // Has numeric keys - Firebase stored array as object
            for (const key of numericKeys) {
                if (data[key] && typeof data[key] === 'object') {
                    result.push(data[key]);
                }
            }
            console.log(`[EMPLOYEE] Converted object with ${numericKeys.length} numeric keys to array`);
        } else {
            // No numeric keys - maybe keys are user IDs or other strings
            // Check if values have the expected structure (name, start, end)
            for (const key of allKeys) {
                const item = data[key];
                if (item && typeof item === 'object' && 'start' in item && 'end' in item) {
                    // Add the key as id if not present
                    if (!item.id) {
                        item.id = key;
                    }
                    result.push(item);
                }
            }
            console.log(`[EMPLOYEE] Converted object with ${allKeys.length} non-numeric keys to array (${result.length} valid items)`);
        }

        return result;
    }

    console.log('[EMPLOYEE] Data type not recognized:', typeof data);
    return [];
}

// Track current onSnapshot unsubscribe function
let _employeeRangesUnsubscribe = null;
let _currentListeningCampaign = null;

function loadEmployeeRangesForCampaign(campaignName = null) {
    // Use local firestoreDb or fallback to window.firestoreDb
    const db = (typeof firestoreDb !== 'undefined' && firestoreDb) ? firestoreDb : window.firestoreDb;

    if (!db) {
        console.error('[EMPLOYEE] Firestore not initialized. firestoreDb:', typeof firestoreDb, 'window.firestoreDb:', typeof window.firestoreDb);
        return Promise.resolve();
    }

    if (!campaignName) {
        // No campaign selected → clear employee ranges (no general config)
        console.log('[EMPLOYEE] No campaign selected, clearing employee ranges');
        employeeRanges = [];
        window.employeeRanges = [];
        stopEmployeeRangesListener();
        // Reset view mode when no campaign
        _resetEmployeeViewModeBtn();
        return Promise.resolve();
    }

    // Load from campaign-specific config
    const sanitizedName = sanitizeCampaignName(campaignName);
    console.log(`[EMPLOYEE] 🔍 Loading ranges for campaign: "${campaignName}" (key: "${sanitizedName}")`);

    // Start real-time listener for this campaign
    startEmployeeRangesListener(campaignName);

    // Also do an immediate .get() so we can return a Promise that resolves when data is loaded
    return db.collection('settings').doc('employee_ranges_by_campaign').get()
        .then((doc) => {
            const allCampaignRanges = doc.exists ? doc.data() : {};
            console.log(`[EMPLOYEE] 🔍 All campaigns in Firebase:`, Object.keys(allCampaignRanges));

            const data = allCampaignRanges[sanitizedName];
            const normalized = normalizeEmployeeRanges(data);

            employeeRanges = normalized;
            window.employeeRanges = employeeRanges;

            if (normalized.length > 0) {
                console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges for campaign: ${campaignName}`, employeeRanges);
            } else {
                console.log(`[EMPLOYEE] ⚠️ No ranges configured for campaign: ${campaignName}`);
            }

            // Update employee table if drawer is open
            const drawer = document.getElementById('employeeDrawer');
            if (drawer && drawer.classList.contains('active')) {
                if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                    renderEmployeeTable(window.userEmployeeLoader.getUsers());
                }
            }
        })
        .catch((error) => {
            console.error('[EMPLOYEE] ❌ Error loading ranges:', error);
        });
}

/**
 * Start real-time listener on employee_ranges_by_campaign document.
 * When any machine saves new ranges, all other machines will automatically receive the update.
 */
function startEmployeeRangesListener(campaignName) {
    const db = (typeof firestoreDb !== 'undefined' && firestoreDb) ? firestoreDb : window.firestoreDb;
    if (!db) return;

    const sanitizedName = sanitizeCampaignName(campaignName);

    // Don't restart listener if already listening to the same campaign
    if (_currentListeningCampaign === sanitizedName && _employeeRangesUnsubscribe) {
        console.log(`[EMPLOYEE] Already listening to campaign: ${campaignName}`);
        return;
    }

    // Stop previous listener
    stopEmployeeRangesListener();

    console.log(`[EMPLOYEE] 🔄 Starting real-time listener for campaign: ${campaignName} (key: ${sanitizedName})`);
    _currentListeningCampaign = sanitizedName;

    _employeeRangesUnsubscribe = db.collection('settings').doc('employee_ranges_by_campaign')
        .onSnapshot((doc) => {
            const allCampaignRanges = doc.exists ? doc.data() : {};
            const data = allCampaignRanges[sanitizedName];
            const normalized = normalizeEmployeeRanges(data);

            // Only update if data actually changed
            const oldJSON = JSON.stringify(employeeRanges);
            const newJSON = JSON.stringify(normalized);

            if (oldJSON !== newJSON) {
                employeeRanges = normalized;
                window.employeeRanges = employeeRanges;
                console.log(`[EMPLOYEE] 🔄 Real-time sync: ${employeeRanges.length} ranges for campaign "${campaignName}"`);

                // Re-apply filter to current view
                if (typeof performTableSearch === 'function') {
                    performTableSearch();
                }

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                        renderEmployeeTable(window.userEmployeeLoader.getUsers());
                    }
                }
            }
        }, (error) => {
            console.error('[EMPLOYEE] ❌ Real-time listener error:', error);
        });
}

/**
 * Stop the current real-time listener
 */
function stopEmployeeRangesListener() {
    if (_employeeRangesUnsubscribe) {
        _employeeRangesUnsubscribe();
        _employeeRangesUnsubscribe = null;
        _currentListeningCampaign = null;
        console.log('[EMPLOYEE] 🛑 Stopped real-time listener');
    }
}

/**
 * Enable or disable the "Xem phân chia nhân viên" toggle button.
 * Disabled (greyed out) when the current user is already filtered to their assigned orders.
 */
function _setEmployeeToggleBtnDisabled(disabled) {
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (!btn) return;
    if (disabled) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Bạn đang xem các đơn được phân cho bạn';
        // Also reset view mode since button is disabled
        employeeViewMode = false;
        window.employeeViewMode = false;
    } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        // Restore title based on current mode
        if (employeeViewMode) {
            btn.title = 'Chuyển về xem tất cả đơn hàng';
        } else {
            btn.title = 'Chuyển sang xem phân chia nhân viên';
        }
    }
}

function _resetEmployeeViewModeBtn() {
    employeeViewMode = false;
    window.employeeViewMode = false;
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (btn) {
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.innerHTML = '<i class="fas fa-layer-group"></i> Xem phân chia nhân viên';
        btn.title = 'Chuyển sang xem phân chia nhân viên';
    }
}

/**
 * Toggle between normal view and employee grouped view
 */
function toggleEmployeeViewMode() {
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (btn && btn.disabled) return; // User is filtered — button not available

    if (employeeRanges.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.show('⚠️ Chưa có cấu hình phân chia nhân viên cho chiến dịch này', 'warning');
        } else {
            alert('⚠️ Chưa có cấu hình phân chia nhân viên cho chiến dịch này');
        }
        return;
    }

    employeeViewMode = !employeeViewMode;
    window.employeeViewMode = employeeViewMode;

    if (btn) {
        if (employeeViewMode) {
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            btn.innerHTML = '<i class="fas fa-list"></i> Xem thường';
            btn.title = 'Chuyển về xem tất cả đơn hàng';
        } else {
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            btn.innerHTML = '<i class="fas fa-layer-group"></i> Xem phân chia nhân viên';
            btn.title = 'Chuyển sang xem phân chia nhân viên';
        }
    }

    // Re-render table with new mode
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }

    console.log(`[EMPLOYEE] View mode: ${employeeViewMode ? 'grouped by employee' : 'all orders'}`);
}

