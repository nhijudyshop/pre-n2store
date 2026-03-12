// =====================================================
// MESSAGE TEMPLATE MANAGER - IMPROVED VERSION WITH DEBUG
// =====================================================

class MessageTemplateManager {
    constructor() {
        this.templates = [];
        this.filteredTemplates = [];
        this.selectedTemplate = null;
        this.isLoading = false;
        // Firestore collection for templates (replacing TPOS API)
        this.TEMPLATES_COLLECTION = 'message_templates';
        this.currentOrder = null;
        this.selectedOrders = [];
        this.DEBUG_MODE = true; // Enable debug logging
        this.mode = 'send'; // 'send' or 'insert'
        this.targetInputId = null; // Input element to insert text into
        this.sendingState = {
            isRunning: false,
            total: 0,
            completed: 0,
            success: 0,
            error: 0,
            errors: []
        };
        // Track failed orders for comment watermark in table
        this.failedOrderIds = new Set();
        this._loadFailedOrderIds();
        // Track sent orders to prevent duplicate bulk sending
        this.sentOrderIds = new Set();
        this.sentViaCommentIds = new Set(); // Orders sent via reply_comment (not inbox)
        this._loadSentOrderIds();
        this.init();
    }

    // =====================================================
    // FAILED ORDERS TRACKING (for comment watermark)
    // =====================================================

    _loadFailedOrderIds() {
        try {
            const stored = localStorage.getItem('failed_message_orders');
            if (stored) {
                const data = JSON.parse(stored);
                // Only keep entries from last 24 hours
                const now = Date.now();
                const validEntries = data.filter(entry => (now - entry.timestamp) < 24 * 60 * 60 * 1000);
                this.failedOrderIds = new Set(validEntries.map(e => e.orderId));
                // Save cleaned data
                if (validEntries.length !== data.length) {
                    this._saveFailedOrderIds();
                }
                this.log(`📋 Loaded ${this.failedOrderIds.size} failed order IDs from storage`);
            }
        } catch (e) {
            console.warn('[MESSAGE] Error loading failed order IDs:', e);
        }
    }

    _saveFailedOrderIds() {
        try {
            const now = Date.now();
            const data = Array.from(this.failedOrderIds).map(orderId => ({
                orderId,
                timestamp: now
            }));
            localStorage.setItem('failed_message_orders', JSON.stringify(data));
        } catch (e) {
            console.warn('[MESSAGE] Error saving failed order IDs:', e);
        }
    }

    addFailedOrders(orderIds) {
        orderIds.forEach(id => this.failedOrderIds.add(id));
        this._saveFailedOrderIds();
        this.log(`📋 Added ${orderIds.length} failed orders, total: ${this.failedOrderIds.size}`);
        // Dispatch event to update table UI
        window.dispatchEvent(new CustomEvent('failedOrdersUpdated', {
            detail: { failedOrderIds: Array.from(this.failedOrderIds) }
        }));
    }

    removeFailedOrder(orderId) {
        if (this.failedOrderIds.has(orderId)) {
            this.failedOrderIds.delete(orderId);
            this._saveFailedOrderIds();
            this.log(`✅ Removed order ${orderId} from failed list`);
            // Dispatch event to update table UI
            window.dispatchEvent(new CustomEvent('failedOrdersUpdated', {
                detail: { failedOrderIds: Array.from(this.failedOrderIds) }
            }));
        }
    }

    isOrderFailed(orderId) {
        return this.failedOrderIds.has(orderId);
    }

    getFailedOrderIds() {
        return Array.from(this.failedOrderIds);
    }

    // =====================================================
    // SENT ORDERS TRACKING (prevent duplicate bulk sending)
    // =====================================================

    _loadSentOrderIds() {
        try {
            const stored = localStorage.getItem('sent_message_orders');
            if (stored) {
                const data = JSON.parse(stored);
                const now = Date.now();
                const validEntries = data.filter(entry => (now - entry.timestamp) < 24 * 60 * 60 * 1000);
                this.sentOrderIds = new Set(validEntries.map(e => e.orderId));
                this.sentViaCommentIds = new Set(validEntries.filter(e => e.viaComment).map(e => e.orderId));
                if (validEntries.length !== data.length) {
                    this._saveSentOrderIds();
                }
                this.log(`📋 Loaded ${this.sentOrderIds.size} sent order IDs from storage (${this.sentViaCommentIds.size} via comment)`);
            }
        } catch (e) {
            console.warn('[MESSAGE] Error loading sent order IDs:', e);
        }
    }

    _saveSentOrderIds() {
        try {
            const now = Date.now();
            const data = Array.from(this.sentOrderIds).map(orderId => ({
                orderId,
                timestamp: now,
                viaComment: this.sentViaCommentIds.has(orderId)
            }));
            localStorage.setItem('sent_message_orders', JSON.stringify(data));
        } catch (e) {
            console.warn('[MESSAGE] Error saving sent order IDs:', e);
        }
    }

    addSentOrders(orderIds, commentOrderIds = []) {
        orderIds.forEach(id => this.sentOrderIds.add(id));
        commentOrderIds.forEach(id => this.sentViaCommentIds.add(id));
        this._saveSentOrderIds();
        this.log(`✅ Added ${orderIds.length} sent orders (${commentOrderIds.length} via comment), total: ${this.sentOrderIds.size}`);
        window.dispatchEvent(new CustomEvent('sentOrdersUpdated', {
            detail: {
                sentOrderIds: Array.from(this.sentOrderIds),
                sentViaCommentIds: Array.from(this.sentViaCommentIds)
            }
        }));
    }

    isOrderSent(orderId) {
        return this.sentOrderIds.has(orderId);
    }

    isOrderSentViaComment(orderId) {
        return this.sentViaCommentIds.has(orderId);
    }

    log(...args) {
        if (this.DEBUG_MODE) {
            console.log('[MESSAGE]', ...args);
        }
    }

    init() {
        this.log('🚀 MessageTemplateManager initialized');
        this.log('API URL:', this.API_URL);
        this.log('TokenManager available:', !!window.tokenManager);
        this.createModalDOM();
        this.attachEventListeners();
    }

    createModalDOM() {
        if (document.getElementById('messageTemplateModal')) {
            this.log('⚠️ Modal DOM already exists, skipping creation');
            return;
        }

        this.log('📝 Creating modal DOM...');

        // Check if we need to restore progress UI state
        const isRunning = this.sendingState && this.sendingState.isRunning;
        const progressDisplay = isRunning ? 'block' : 'none';
        const btnText = isRunning ? '<i class="fas fa-spinner fa-spin"></i> Đang gửi...' : '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
        const btnDisabled = isRunning ? 'disabled' : '';

        const modalHTML = `
            <div class="message-modal-overlay" id="messageTemplateModal">
                <div class="message-modal">
                    <!-- Header -->
                    <div class="message-modal-header">
                        <h3>
                            <i class="fab fa-facebook-messenger"></i>
                            Gửi tin nhắn Facebook
                        </h3>
                        <button class="message-modal-close" id="closeMessageModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Search Section -->
                    <div class="message-search-section">
                        <div class="message-search-wrapper">
                            <div class="message-search-input-wrapper">
                                <i class="fas fa-search message-search-icon"></i>
                                <input 
                                    type="text" 
                                    class="message-search-input" 
                                    id="messageSearchInput"
                                    placeholder="Tìm kiếm template..."
                                    autocomplete="off"
                                />
                                <button class="message-clear-search" id="messageClearSearch">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            <button class="message-new-template-btn" id="messageNewTemplate">
                                <i class="fas fa-plus"></i>
                                Mẫu mới
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="message-modal-body" id="messageModalBody">
                        <div class="message-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Đang tải danh sách template...</p>
                        </div>
                    </div>

                    <!-- Footer - Redesigned for better UX -->
                    <div class="message-modal-footer" style="flex-direction: column; gap: 16px; padding: 20px 24px;">
                        <!-- Hidden inputs for compatibility -->
                        <input type="radio" name="sendMode" value="text" checked id="sendModeText" style="display: none;">
                        <input type="radio" name="sendMode" value="image" id="sendModeImage" disabled style="display: none;">
                        <input type="radio" name="apiMode" value="tpage" id="apiModeTPage" disabled style="display: none;">
                        <input type="radio" name="apiMode" value="pancake" checked id="apiModePancake" style="display: none;">

                        <!-- Row 1: Settings -->
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                            <!-- Left: Template count -->
                            <div class="message-result-count" id="messageResultCount" style="font-size: 14px;">
                                <strong>0</strong> template
                            </div>

                            <!-- Center: Settings group -->
                            <div style="display: flex; align-items: center; gap: 24px; padding: 10px 20px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border: 1px solid #e2e8f0;">
                                <!-- Account Count -->
                                <div style="display: flex; align-items: center; gap: 8px;" title="Số tài khoản Pancake sẵn sàng gửi">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-users" style="color: white; font-size: 14px;"></i>
                                    </div>
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Accounts</span>
                                        <input type="number" id="messageThreadCount" value="0" readonly style="width: 40px; padding: 2px 0; border: none; background: transparent; font-size: 16px; font-weight: 700; color: #1e293b; cursor: default;">
                                    </div>
                                </div>

                                <div style="width: 1px; height: 32px; background: #e2e8f0;"></div>

                                <!-- Delay -->
                                <div style="display: flex; align-items: center; gap: 8px;" title="Thời gian nghỉ giữa các tin nhắn">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-clock" style="color: white; font-size: 14px;"></i>
                                    </div>
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">Delay</span>
                                        <div style="display: flex; align-items: baseline; gap: 2px;">
                                            <input type="number" id="messageSendDelay" value="1" min="0" step="0.5" style="width: 35px; padding: 2px 0; border: none; background: transparent; font-size: 16px; font-weight: 700; color: #1e293b;">
                                            <span style="font-size: 12px; color: #64748b;">giây</span>
                                        </div>
                                    </div>
                                </div>

                                <div style="width: 1px; height: 32px; background: #e2e8f0;"></div>

                                <!-- API Badge -->
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fab fa-facebook-messenger" style="color: white; font-size: 14px;"></i>
                                    </div>
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">API</span>
                                        <span style="font-size: 14px; font-weight: 600; color: #6366f1;">Pancake</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Right: History button -->
                            <button class="message-btn-history" id="messageBtnHistory" style="padding: 10px 16px; background: white; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: #475569; transition: all 0.2s;" title="Xem lịch sử gửi tin">
                                <i class="fas fa-history" style="color: #6366f1;"></i>
                                Lịch sử
                            </button>
                        </div>

                        <!-- Row 2: Progress bar (hidden by default) -->
                        <div id="messageProgressContainer" style="display: none; background: white; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                                <span id="messageProgressText" style="color: #475569; font-weight: 500;">Đang gửi...</span>
                                <span id="messageProgressPercent" style="color: #6366f1; font-weight: 600;">0%</span>
                            </div>
                            <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                                <div id="messageProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s; border-radius: 4px;"></div>
                            </div>
                        </div>

                        <!-- Row 3: Action buttons -->
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button class="message-btn-cancel" id="messageBtnCancel" style="padding: 12px 24px; background: white; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 14px; font-weight: 500; color: #64748b; cursor: pointer; transition: all 0.2s;">
                                Hủy
                            </button>
                            <button class="message-btn-send" id="messageBtnSend" style="padding: 12px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; font-size: 14px; font-weight: 600; color: white; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);">
                                <i class="fas fa-paper-plane"></i>
                                Gửi tin nhắn
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.log('✅ Modal DOM created');

        // Create History Modal
        this.createHistoryModalDOM();
    }

    createHistoryModalDOM() {
        if (document.getElementById('messageHistoryModal')) return;

        const historyModalHTML = `
            <div class="message-modal-overlay" id="messageHistoryModal">
                <div class="message-modal" style="max-width: 950px; width: 95%;">
                    <div class="message-modal-header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        <h3>
                            <i class="fas fa-history"></i>
                            Lịch sử gửi tin nhắn
                        </h3>
                        <button class="message-modal-close" id="closeHistoryModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="message-modal-body" id="historyModalBody" style="max-height: 65vh; overflow-y: auto; padding: 20px;">
                        <div class="message-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Đang tải lịch sử...</p>
                        </div>
                    </div>
                    <div class="message-modal-footer" style="justify-content: space-between; padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                        <div style="font-size: 13px; color: #6b7280;">
                            <i class="fas fa-info-circle"></i> Lịch sử tự động xóa sau 7 ngày
                        </div>
                        <button class="message-btn-cancel" id="closeHistoryBtn">Đóng</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', historyModalHTML);
    }

    attachEventListeners() {
        this.log('🔗 Attaching event listeners...');

        document.getElementById('closeMessageModal')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('messageBtnCancel')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('messageTemplateModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'messageTemplateModal') {
                this.closeModal();
            }
        });

        const searchInput = document.getElementById('messageSearchInput');
        searchInput?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        document.getElementById('messageClearSearch')?.addEventListener('click', () => {
            searchInput.value = '';
            this.handleSearch('');
            document.getElementById('messageClearSearch').classList.remove('show');
        });

        document.getElementById('messageNewTemplate')?.addEventListener('click', () => {
            this.openNewTemplateForm();
        });

        document.getElementById('messageBtnSend')?.addEventListener('click', () => {
            this.sendMessage();
        });

        // History button
        document.getElementById('messageBtnHistory')?.addEventListener('click', () => {
            this.openHistoryModal();
        });

        document.getElementById('closeHistoryModal')?.addEventListener('click', () => {
            this.closeHistoryModal();
        });

        document.getElementById('closeHistoryBtn')?.addEventListener('click', () => {
            this.closeHistoryModal();
        });

        document.getElementById('messageHistoryModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'messageHistoryModal') {
                this.closeHistoryModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });

        this.log('✅ Event listeners attached');
    }

    async openModal(orderData = null, mode = 'send', targetInputId = null) {
        this.log('📂 Opening modal...');
        this.log('📋 Mode:', mode);
        this.log('📋 Target input:', targetInputId);

        // Set mode and target
        this.mode = mode;
        this.targetInputId = targetInputId;

        if (Array.isArray(orderData)) {
            this.selectedOrders = orderData;
            this.currentOrder = orderData[0];
            this.log('📦 Selected orders:', orderData.length);
        } else if (orderData) {
            this.selectedOrders = [orderData];
            this.currentOrder = orderData;
            this.log('📦 Single order:', orderData);
        } else {
            this.selectedOrders = this.getSelectedOrdersFromTable();
            this.currentOrder = this.selectedOrders[0];
            this.log('📦 Orders from table:', this.selectedOrders.length);
        }

        // Filter out already-sent orders (only in send mode)
        if (mode === 'send' && this.selectedOrders.length > 0) {
            const alreadySent = this.selectedOrders.filter(o => this.sentOrderIds.has(o.Id));
            if (alreadySent.length > 0) {
                this.selectedOrders = this.selectedOrders.filter(o => !this.sentOrderIds.has(o.Id));
                const names = alreadySent.map(o => o.customerName || o.code || o.Id).slice(0, 3).join(', ');
                const extra = alreadySent.length > 3 ? ` và ${alreadySent.length - 3} đơn khác` : '';
                window.notificationManager?.warning(
                    `Đã loại ${alreadySent.length} đơn đã gửi tin nhắn: ${names}${extra}`
                );
                this.log(`📋 Filtered out ${alreadySent.length} already-sent orders`);
            }
            if (this.selectedOrders.length === 0) {
                window.notificationManager?.info('Tất cả đơn đã được gửi tin nhắn rồi');
                return;
            }
            this.currentOrder = this.selectedOrders[0];
        }

        const modal = document.getElementById('messageTemplateModal');
        modal?.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Update button text based on mode
        this.updateModalUI();

        // IMPORTANT: Always reload templates when opening modal
        this.log('🔄 Force reloading templates...');
        await this.loadTemplates();
    }

    closeModal() {
        this.log('🚪 Closing modal...');
        const modal = document.getElementById('messageTemplateModal');
        modal?.classList.remove('active');
        document.body.style.overflow = 'auto';
        this.selectedTemplate = null;
        this.currentOrder = null;
        this.selectedOrders = [];
        this.mode = 'send';
        this.targetInputId = null;

        const searchInput = document.getElementById('messageSearchInput');
        if (searchInput) searchInput.value = '';
        document.getElementById('messageClearSearch')?.classList.remove('show');
    }

    updateModalUI() {
        const sendBtn = document.getElementById('messageBtnSend');
        const modalTitle = document.querySelector('.message-modal-header h3');

        if (this.mode === 'insert') {
            // Insert mode - change button to "Chọn"
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-check"></i> Chọn';
            }
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-comment-dots"></i> Chọn tin nhắn mẫu';
            }
        } else {
            // Send mode - default button
            if (sendBtn) {
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
            }
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi tin nhắn Facebook';
            }
        }

        // Update account count display
        this.updateAccountCountDisplay();
    }

    /**
     * Update account count display from PancakeTokenManager
     */
    updateAccountCountDisplay() {
        const threadCountInput = document.getElementById('messageThreadCount');
        if (!threadCountInput) return;

        let accountCount = 0;
        if (window.pancakeTokenManager) {
            const validAccounts = window.pancakeTokenManager.getValidAccountsForSending();
            accountCount = validAccounts.length;
        }

        threadCountInput.value = accountCount;
        this.log('📊 Valid Pancake accounts:', accountCount);

        // Disable send button if no accounts
        const sendBtn = document.getElementById('messageBtnSend');
        if (sendBtn && this.mode === 'send') {
            if (accountCount === 0) {
                sendBtn.disabled = true;
                sendBtn.title = 'Không có tài khoản Pancake nào sẵn sàng';
            }
        }
    }

    isModalOpen() {
        return document.getElementById('messageTemplateModal')?.classList.contains('active');
    }

    async loadTemplates() {
        this.log('');
        this.log('='.repeat(60));
        this.log('🔄 LOADING TEMPLATES FROM FIRESTORE');
        this.log('='.repeat(60));

        this.isLoading = true;
        const bodyEl = document.getElementById('messageModalBody');

        // Show loading
        bodyEl.innerHTML = `
            <div class="message-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải danh sách template...</p>
            </div>
        `;

        try {
            // Check Firebase
            if (!window.firebase || !window.firebase.firestore) {
                throw new Error('Firebase chưa được khởi tạo');
            }

            const db = window.firebase.firestore();
            const templatesRef = db.collection(this.TEMPLATES_COLLECTION);

            // Get all active templates, ordered by name
            const snapshot = await templatesRef
                .where('active', '==', true)
                .orderBy('order', 'asc')
                .get();

            this.log('📊 Firestore query completed');
            this.log('  - Documents found:', snapshot.size);

            // If no templates exist, seed default templates
            if (snapshot.empty) {
                this.log('📋 No templates found, seeding defaults...');
                await this._seedDefaultTemplates();
                // Reload after seeding
                return this.loadTemplates();
            }

            // Map documents to template objects
            this.templates = snapshot.docs.map(doc => ({
                Id: doc.id,
                ...doc.data()
            }));
            this.filteredTemplates = [...this.templates];

            this.log('');
            this.log('✅ SUCCESS! Templates loaded:');
            this.log('  - Total templates:', this.templates.length);

            if (this.templates.length > 0) {
                this.log('  - Template names:');
                this.templates.forEach((t, i) => {
                    this.log(`    ${i + 1}. ${t.Name}`);
                });
            }

            this.log('='.repeat(60));

            // Render templates
            this.renderTemplates();

        } catch (error) {
            this.log('');
            this.log('❌ ERROR LOADING TEMPLATES');
            this.log('Error:', error.message);

            // Show error in modal
            bodyEl.innerHTML = `
                <div class="message-no-results">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <p style="font-weight: 600; color: #111827; margin-bottom: 8px;">
                        Không thể tải danh sách template
                    </p>
                    <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">
                        ${this.escapeHtml(error.message)}
                    </p>
                    <button
                        onclick="messageTemplateManager.loadTemplates()"
                        style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;

            if (window.notificationManager) {
                window.notificationManager.error(`Lỗi tải template: ${error.message}`, 5000);
            }

        } finally {
            this.isLoading = false;
        }
    }

    renderTemplates(templatesToRender = null) {
        const templates = templatesToRender || this.filteredTemplates;
        const bodyEl = document.getElementById('messageModalBody');
        const countEl = document.getElementById('messageResultCount');

        this.log('🎨 Rendering', templates.length, 'templates');

        if (countEl) {
            countEl.innerHTML = `<strong>${templates.length}</strong> template`;
        }

        if (templates.length === 0) {
            bodyEl.innerHTML = `
                <div class="message-no-results">
                    <i class="fas fa-search"></i>
                    <p>Không tìm thấy template nào</p>
                    <button onclick="messageTemplateManager.openNewTemplateForm()"
                        style="margin-top: 12px; padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        <i class="fas fa-plus"></i> Tạo template mới
                    </button>
                </div>
            `;
            return;
        }

        const templatesHTML = templates.map(template => {
            // Support both Firestore (Content) and legacy TPOS (BodyPlain)
            const content = template.Content || (template.Content || template.BodyPlain) || 'Không có nội dung';
            const date = template.createdAt?.toDate
                ? template.createdAt.toDate().toLocaleDateString('vi-VN')
                : (template.DateCreated ? new Date(template.DateCreated).toLocaleDateString('vi-VN') : '');

            // Convert \n thành <br> để giữ line breaks
            const contentWithBreaks = this.escapeHtml(content).replace(/\n/g, '<br>');

            // Kiểm tra nếu content dài
            const needsExpand = content.length > 200;

            return `
                <div class="message-template-item ${this.selectedTemplate?.Id === template.Id ? 'selected' : ''}"
                     data-template-id="${template.Id}"
                     onclick="messageTemplateManager.selectTemplate('${template.Id}')">
                    <div class="message-template-header">
                        <div class="message-template-name">
                            ${this.escapeHtml(template.Name)}
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button onclick="event.stopPropagation(); messageTemplateManager.openNewTemplateForm(messageTemplateManager.templates.find(t => t.Id === '${template.Id}'))"
                                style="padding: 4px 10px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; cursor: pointer; color: #6b7280;"
                                title="Chỉnh sửa template">
                                <i class="fas fa-edit"></i>
                            </button>
                            <span class="message-template-type type-messenger">MESSENGER</span>
                        </div>
                    </div>
                    <div class="message-template-content" data-full-content="${this.escapeHtml(content)}">
                        ${contentWithBreaks}
                    </div>
                    <div class="message-template-actions">
                        ${needsExpand ? `
                            <button class="message-expand-btn" onclick="event.stopPropagation(); messageTemplateManager.toggleExpand('${template.Id}')">
                                <i class="fas fa-chevron-down"></i>
                                <span class="expand-text">Xem thêm</span>
                            </button>
                        ` : '<div></div>'}
                        <div class="message-template-meta">
                            ${date ? `<span><i class="fas fa-calendar"></i> ${date}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = `<div class="message-template-list">${templatesHTML}</div>`;
        this.log('✅ Templates rendered to DOM');
    }

    selectTemplate(templateId) {
        // Support both string (Firestore) and number (legacy) IDs
        const template = this.templates.find(t => String(t.Id) === String(templateId));
        if (!template) {
            this.log('❌ Template not found:', templateId);
            return;
        }

        this.selectedTemplate = template;
        this.log('✅ Template selected:', template.Name);

        document.querySelectorAll('.message-template-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-template-id="${templateId}"]`)?.classList.add('selected');

        const sendBtn = document.getElementById('messageBtnSend');
        if (sendBtn) {
            sendBtn.disabled = false;
        }
    }

    toggleExpand(templateId) {
        const item = document.querySelector(`[data-template-id="${templateId}"]`);
        if (!item) return;

        const contentEl = item.querySelector('.message-template-content');
        const expandBtn = item.querySelector('.message-expand-btn');
        const expandText = expandBtn?.querySelector('.expand-text');
        const expandIcon = expandBtn?.querySelector('i');

        // Get original content with line breaks preserved
        const fullContent = contentEl.dataset.fullContent;
        const fullContentWithBreaks = this.escapeHtml(fullContent).replace(/\n/g, '<br>');

        if (contentEl.classList.contains('expanded')) {
            // Collapse - hiển thị lại với max-height từ CSS
            contentEl.innerHTML = fullContentWithBreaks;
            contentEl.classList.remove('expanded');
            if (expandText) expandText.textContent = 'Xem thêm';
            expandIcon?.classList.replace('fa-chevron-up', 'fa-chevron-down');
        } else {
            // Expand - bỏ max-height, hiển thị full
            contentEl.innerHTML = fullContentWithBreaks;
            contentEl.classList.add('expanded');
            if (expandText) expandText.textContent = 'Thu gọn';
            expandIcon?.classList.replace('fa-chevron-down', 'fa-chevron-up');
        }
    }

    handleSearch(query) {
        const clearBtn = document.getElementById('messageClearSearch');

        if (query.length > 0) {
            clearBtn?.classList.add('show');
        } else {
            clearBtn?.classList.remove('show');
        }

        if (!query.trim()) {
            this.filteredTemplates = [...this.templates];
        } else {
            const searchLower = query.toLowerCase();
            this.filteredTemplates = this.templates.filter(template => {
                const name = (template.Name || '').toLowerCase();
                // CHỈ TÌM TRONG BodyPlain
                const content = ((template.Content || template.BodyPlain) || '').toLowerCase();
                const type = (template.TypeId || '').toLowerCase();

                return name.includes(searchLower) ||
                    content.includes(searchLower) ||
                    type.includes(searchLower);
            });
        }

        this.log('🔍 Search:', query, '→', this.filteredTemplates.length, 'results');
        this.renderTemplates(this.filteredTemplates);
    }

    async sendMessage() {
        if (!this.selectedTemplate) {
            if (window.notificationManager) {
                window.notificationManager.warning('Vui lòng chọn một template');
            }
            return;
        }

        // INSERT MODE - just insert text into input
        if (this.mode === 'insert') {
            this.insertTemplateToInput();
            return;
        }

        // SEND MODE - check API mode (T-Page or Pancake)
        const apiMode = document.querySelector('input[name="apiMode"]:checked')?.value || 'tpage';
        this.log('📤 Send mode:', apiMode);

        // T-PAGE MODE - send batch via T-Page API
        if (apiMode === 'tpage') {
            this.log('🚀 Using T-Page API (batch mode)');
            try {
                await this._sendViaTPage();
            } catch (error) {
                this.log('❌ T-Page send failed:', error);
                // Error already handled in _sendViaTPage
            }
            return;
        }

        // PANCAKE MODE - send via Pancake API (original code)
        this.log('💬 Using Pancake API (parallel mode)');

        // Get send mode (text or image)
        const sendMode = document.querySelector('input[name="sendMode"]:checked')?.value || 'text';

        // Get delay (seconds -> ms)
        const delayInput = document.getElementById('messageSendDelay');
        const delaySeconds = delayInput ? parseFloat(delayInput.value) || 1 : 1;
        const delay = delaySeconds * 1000;

        // Get ALL valid accounts for multi-account sending
        const validAccounts = window.pancakeTokenManager?.getValidAccountsForSending() || [];
        if (validAccounts.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.error('Không có tài khoản Pancake nào sẵn sàng. Vui lòng thêm tài khoản trong Cài đặt.');
            }
            return;
        }

        // Pre-load page access tokens from Firestore to ensure they're in memory
        this.log('🔑 Pre-loading page access tokens...');
        try {
            await window.pancakeTokenManager.loadPageAccessTokens();
            const pageTokenCount = Object.keys(window.pancakeTokenManager.pageAccessTokens || {}).length;
            this.log(`🔑 Page access tokens loaded: ${pageTokenCount} pages`);
        } catch (e) {
            this.log('⚠️ Warning: Could not pre-load page tokens:', e.message);
        }

        // Pre-fetch page access for all accounts (which pages each account can access)
        this.log('📋 Pre-fetching account page access...');
        try {
            await window.pancakeTokenManager.prefetchAllAccountPages();
            for (const acc of validAccounts) {
                const pages = window.pancakeTokenManager.accountPageAccessMap[acc.accountId];
                this.log(`  - ${acc.name}: ${pages ? pages.size : 0} pages`);
            }
        } catch (e) {
            this.log('⚠️ Warning: Could not pre-fetch page access:', e.message);
        }

        this.log('📮 Send mode:', sendMode, '| Delay:', delay, 'ms | Accounts:', validAccounts.length);
        this.log('📋 Valid accounts:', validAccounts.map(a => a.name).join(', '));

        // SEND MODE - send via Pancake API with ALL accounts
        try {
            const ordersCount = this.selectedOrders.length;
            this.log('📤 Sending message to', ordersCount, 'order(s) via Pancake API (Multi-Account Mode)');

            // NOTE: No employee signature for multi-account sending

            // Get template content (ONE TIME)
            const templateContent = (this.selectedTemplate.Content || this.selectedTemplate.BodyPlain) || 'Không có nội dung';

            // Initialize State with tracking arrays for Firestore
            this.sendingState = {
                isRunning: true,
                total: ordersCount,
                completed: 0,
                success: 0,
                error: 0,
                errors: [],
                successOrders: [], // Track success orders with details
                errorOrders: []    // Track error orders with details
            };

            // Update UI
            this.updateProgressUI();
            const sendBtn = document.getElementById('messageBtnSend');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang gửi...`;
            }

            // =====================================================
            // PAGE-ACCESS-AWARE ORDER DISTRIBUTION
            // Each order goes to an account that has access to its page
            // Falls back to round-robin for unknown pages
            // =====================================================
            const accountQueues = validAccounts.map(() => []);
            const unassignedOrders = [];
            const pageRoundRobin = {}; // { pageId: counter } for per-page round-robin

            this.selectedOrders.forEach((order) => {
                // Extract channelId (pageId) from order's Facebook_PostId
                const facebookPostId = order.Facebook_PostId || order.raw?.Facebook_PostId;
                const channelId = facebookPostId ? facebookPostId.split('_')[0] : null;

                if (channelId) {
                    // Find accounts with access to this page
                    const eligible = validAccounts
                        .map((acc, idx) => ({ acc, idx }))
                        .filter(({ acc }) => window.pancakeTokenManager.accountHasPageAccess(acc.accountId, channelId));

                    if (eligible.length > 0) {
                        // Round-robin among eligible accounts for this page
                        if (!pageRoundRobin[channelId]) pageRoundRobin[channelId] = 0;
                        const chosen = eligible[pageRoundRobin[channelId] % eligible.length];
                        pageRoundRobin[channelId]++;
                        accountQueues[chosen.idx].push(order);
                    } else {
                        unassignedOrders.push(order);
                    }
                } else {
                    unassignedOrders.push(order);
                }
            });

            // Distribute unassigned orders via standard round-robin
            unassignedOrders.forEach((order, index) => {
                const accountIndex = index % validAccounts.length;
                accountQueues[accountIndex].push(order);
            });

            this.log('📊 Order distribution:');
            validAccounts.forEach((account, i) => {
                this.log(`  - ${account.name}: ${accountQueues[i].length} orders`);
            });
            if (unassignedOrders.length > 0) {
                this.log(`  ⚠️ ${unassignedOrders.length} orders assigned via fallback round-robin (no page access info)`);
            }

            // Worker Function for each account
            const createWorker = (account, queue) => {
                const context = {
                    token: account.token,
                    displayName: null, // No signature for multi-account sending
                    templateContent,
                    sendMode
                };

                return async () => {
                    this.log(`🚀 Worker started for account: ${account.name} (${queue.length} orders)`);

                    for (const order of queue) {
                        try {
                            // Delay before processing
                            if (delay > 0) {
                                await new Promise(r => setTimeout(r, delay));
                            }

                            await this._processSingleOrder(order, context);
                            this.sendingState.success++;

                            // Track success order with details
                            this.sendingState.successOrders.push({
                                Id: order.Id || '',
                                stt: order.SessionIndex || order.stt || order.STT || '',
                                code: order.code || order.Id || '',
                                customerName: order.customerName || '',
                                account: account.name,
                                Details: order.Details || order.OrderDetails || [],
                                products: order.products || order.mainProducts || [],
                                viaComment: order._sentViaComment || false
                            });

                            this.log(`✅ [${account.name}] Sent successfully to order ${order.code || order.Id}`);
                        } catch (err) {
                            this.sendingState.error++;

                            // Track error with full details
                            let errorMessage = err.message;
                            if (err.is24HourError) {
                                errorMessage = 'Đã quá 24h - Vui lòng dùng COMMENT';
                            } else if (err.isUserUnavailable) {
                                errorMessage = 'Người dùng không có mặt (551) - Vui lòng dùng COMMENT';
                            }

                            // Track error order with details (including Facebook fields for comment reply)
                            this.sendingState.errorOrders.push({
                                orderId: order.Id || '',
                                stt: order.SessionIndex || order.stt || order.STT || '',
                                code: order.code || order.Id || '',
                                customerName: order.customerName || '',
                                account: account.name,
                                error: errorMessage,
                                is24HourError: err.is24HourError || false,
                                isUserUnavailable: err.isUserUnavailable || false,
                                // Facebook fields for comment reply
                                Facebook_PostId: order.Facebook_PostId || order.raw?.Facebook_PostId || '',
                                Facebook_CommentId: order.Facebook_CommentId || order.raw?.Facebook_CommentId || '',
                                Facebook_ASUserId: order.Facebook_ASUserId || order.raw?.Facebook_ASUserId || ''
                            });

                            // Also keep old format for backward compatibility
                            this.sendingState.errors.push({
                                order: order.code || order.Id,
                                error: errorMessage,
                                account: account.name,
                                is24HourError: err.is24HourError,
                                isUserUnavailable: err.isUserUnavailable
                            });

                            this.log(`❌ [${account.name}] Error sending to order ${order.code}:`, err);
                        } finally {
                            this.sendingState.completed++;
                            this.updateProgressUI();
                        }
                    }

                    this.log(`✅ Worker finished for account: ${account.name}`);
                };
            };

            // Start ALL workers (one per account) in parallel
            const workers = validAccounts.map((account, i) =>
                createWorker(account, accountQueues[i])()
            );

            // Wait for all workers to finish
            await Promise.all(workers);

            // AUTO BASE Snapshot - lưu BASE cho các đơn gửi tin thành công
            if (window.kpiManager && window.kpiManager.saveAutoBaseSnapshot && this.sendingState.successOrders.length > 0) {
                try {
                    const campaignName = (window.campaignManager && window.campaignManager.activeCampaign)
                        ? window.campaignManager.activeCampaign.name || window.campaignManager.activeCampaign.displayName || ''
                        : '';
                    const userId = window.authManager ? window.authManager.getAuthState()?.userId || '' : '';
                    await window.kpiManager.saveAutoBaseSnapshot(this.sendingState.successOrders, campaignName, userId);
                    console.log('[MESSAGE] ✅ KPI AUTO BASE saved for', this.sendingState.successOrders.length, 'orders');
                } catch (kpiError) {
                    console.warn('[MESSAGE] ⚠️ KPI AUTO BASE failed (non-blocking):', kpiError);
                }
            }

            // Finished
            this.sendingState.isRunning = false;

            // Restore UI
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
            }

            // Hide progress after short delay
            setTimeout(() => {
                const container = document.getElementById('messageProgressContainer');
                if (container) container.style.display = 'none';
            }, 3000);

            // Show final summary
            this.log('\n📊 Summary:');
            this.log(`  ✅ Success: ${this.sendingState.success}/${ordersCount}`);
            this.log(`  ❌ Errors: ${this.sendingState.error}/${ordersCount}`);
            this.log(`  👥 Accounts used: ${validAccounts.length}`);

            if (window.notificationManager) {
                if (this.sendingState.success > 0) {
                    window.notificationManager.success(
                        `Đã gửi thành công ${this.sendingState.success}/${ordersCount} tin nhắn! (${validAccounts.length} accounts)`,
                        3000,
                        `Template: ${this.selectedTemplate.Name}`
                    );
                }

                if (this.sendingState.error > 0) {
                    // Check if any 24-hour policy errors or user unavailable errors
                    const has24HErrors = this.sendingState.errors.some(e => e.is24HourError);
                    const num24HErrors = this.sendingState.errors.filter(e => e.is24HourError).length;
                    const hasUserUnavailable = this.sendingState.errors.some(e => e.isUserUnavailable);
                    const numUserUnavailable = this.sendingState.errors.filter(e => e.isUserUnavailable).length;

                    if (has24HErrors || hasUserUnavailable) {
                        let msg = '⚠️ ';

                        if (has24HErrors && hasUserUnavailable) {
                            msg += `${num24HErrors} đơn quá 24h, ${numUserUnavailable} đơn người dùng không có mặt.`;
                        } else if (has24HErrors) {
                            msg += `${num24HErrors} đơn hàng không thể gửi (quá 24h).`;
                        } else {
                            msg += `${numUserUnavailable} đơn hàng không thể gửi (người dùng không có mặt).`;
                        }

                        msg += ' Vui lòng dùng COMMENT!';

                        window.notificationManager.show(msg, 'warning', 8000);
                    } else {
                        window.notificationManager.warning(
                            `Gửi hoàn tất: ${this.sendingState.success} thành công, ${this.sendingState.error} thất bại`,
                            5000
                        );
                    }
                }
            }

            // Save campaign to Firestore for history
            await this.saveCampaignToFirestore({
                templateName: this.selectedTemplate?.Name || 'Unknown',
                templateId: this.selectedTemplate?.Id || null,
                templateContent: templateContent,
                totalOrders: ordersCount,
                successCount: this.sendingState.success,
                errorCount: this.sendingState.error,
                successOrders: this.sendingState.successOrders,
                errorOrders: this.sendingState.errorOrders,
                accountsUsed: validAccounts.map(a => a.name),
                delay: delaySeconds
            });

            // Track failed orders for comment watermark in table
            if (this.sendingState.errorOrders.length > 0) {
                const failedIds = this.sendingState.errorOrders
                    .map(o => o.orderId)
                    .filter(id => id); // Filter out empty IDs
                this.addFailedOrders(failedIds);
            }

            // Track sent orders to prevent duplicate bulk sending
            if (this.sendingState.successOrders.length > 0) {
                const sentIds = this.sendingState.successOrders
                    .map(o => o.Id)
                    .filter(id => id);
                const commentSentIds = this.sendingState.successOrders
                    .filter(o => o.viaComment)
                    .map(o => o.Id)
                    .filter(id => id);
                this.addSentOrders(sentIds, commentSentIds);
            }

            this.closeModal();

        } catch (error) {
            this.sendingState.isRunning = false;
            this.log('❌ Error sending messages:', error);
            if (window.notificationManager) {
                window.notificationManager.error(
                    `Lỗi: ${error.message}`,
                    4000
                );
            }
            // Restore UI
            const sendBtn = document.getElementById('messageBtnSend');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
            }
        }
    }

    updateProgressUI() {
        const container = document.getElementById('messageProgressContainer');
        const bar = document.getElementById('messageProgressBar');
        const text = document.getElementById('messageProgressText');
        const percentText = document.getElementById('messageProgressPercent');
        const sendBtn = document.getElementById('messageBtnSend');

        if (!container || !this.sendingState.isRunning) return;

        container.style.display = 'block';

        const percent = Math.round((this.sendingState.completed / this.sendingState.total) * 100) || 0;

        if (bar) bar.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;
        if (text) text.textContent = `Đang gửi ${this.sendingState.completed}/${this.sendingState.total}...`;

        if (sendBtn) {
            sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${this.sendingState.completed}/${this.sendingState.total}`;
        }
    }

    /**
     * Send messages via T-Page API (batch mode)
     * Sends all orders in a single batch request to TPOS CRMActivityCampaign API
     */
    async _sendViaTPage() {
        this.log('📡 [T-PAGE] Starting T-Page batch send...');
        this.log('  - Orders count:', this.selectedOrders.length);

        try {
            // Get employee info
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            this.log('  - Employee:', displayName || '(Anonymous)');

            // Get template content
            const templateContent = (this.selectedTemplate.Content || this.selectedTemplate.BodyPlain) || '';
            this.log('  - Template:', this.selectedTemplate.Name);

            // Initialize state
            this.sendingState = {
                isRunning: true,
                total: this.selectedOrders.length,
                completed: 0,
                success: 0,
                error: 0,
                errors: []
            };

            // Update UI
            this.updateProgressUI();
            const sendBtn = document.getElementById('messageBtnSend');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang chuẩn bị...`;
            }

            // Collect batch data
            const orderCampaignDetails = [];
            const successOrders = [];
            let sttCounter = 0;

            // Process each order
            for (const order of this.selectedOrders) {
                sttCounter++;
                const currentSTT = sttCounter;

                try {
                    this.log(`\n[${currentSTT}/${this.sendingState.total}] Processing order: ${order.code || order.Id}`);

                    // Fetch full order data with CRMTeam
                    const fullOrderData = await this._fetchOrderWithCRMTeam(order.Id);

                    // Check if CRMTeam exists
                    if (!fullOrderData.CRMTeam) {
                        throw new Error('Thiếu CRMTeam');
                    }

                    // Prepare order data for template
                    const orderDataForTemplate = {
                        Id: fullOrderData.Id,
                        code: fullOrderData.Code,
                        customerName: fullOrderData.Partner?.Name || fullOrderData.Name,
                        phone: fullOrderData.Partner?.Telephone || fullOrderData.Telephone,
                        address: fullOrderData.Partner?.Address || fullOrderData.Address,
                        totalAmount: fullOrderData.TotalAmount,
                        products: fullOrderData.Details?.map(detail => ({
                            id: detail.ProductId,
                            name: detail.ProductNameGet || detail.ProductName,
                            quantity: detail.Quantity || 0,
                            price: detail.Price || 0,
                            total: (detail.Quantity || 0) * (detail.Price || 0),
                            note: detail.Note || ''
                        })) || []
                    };

                    // Replace placeholders
                    let messageContent = this.replacePlaceholders(templateContent, orderDataForTemplate);

                    // NOTE: Do NOT add employee signature for batch T-Page sending
                    this.log('  - Message length:', messageContent.length, 'chars');

                    // Add to batch
                    orderCampaignDetails.push({
                        rawOrder: fullOrderData,
                        crmTeam: fullOrderData.CRMTeam,
                        message: messageContent,
                        stt: currentSTT
                    });

                    successOrders.push(fullOrderData.Code);
                    this.sendingState.success++;
                    this.log(`  ✅ Order ${currentSTT} prepared successfully`);

                } catch (error) {
                    this.sendingState.error++;
                    this.sendingState.errors.push({
                        stt: currentSTT,
                        order: order.code || order.Id,
                        error: error.message
                    });
                    this.log(`  ❌ Error processing order ${currentSTT}:`, error.message);
                } finally {
                    this.sendingState.completed++;
                    this.updateProgressUI();
                }
            }

            // Send batch if we have any valid orders
            if (orderCampaignDetails.length > 0) {
                this.log(`\n📤 Sending batch of ${orderCampaignDetails.length} orders to T-Page API...`);

                if (sendBtn) {
                    sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang gửi batch...`;
                }

                await this.postOrderCampaign(orderCampaignDetails);

                this.log('✅ Batch sent successfully!');
            } else {
                this.log('⚠️ No valid orders to send');
            }

            // Finished
            this.sendingState.isRunning = false;

            // Restore UI
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
            }

            // Hide progress
            setTimeout(() => {
                const container = document.getElementById('messageProgressContainer');
                if (container) container.style.display = 'none';
            }, 2000);

            // Show summary
            this.log('\n📊 T-Page Send Summary:');
            this.log(`  ✅ Success: ${this.sendingState.success}/${this.sendingState.total}`);
            this.log(`  ❌ Errors: ${this.sendingState.error}/${this.sendingState.total}`);

            // Track sent orders to prevent duplicate bulk sending
            if (orderCampaignDetails.length > 0) {
                const sentIds = orderCampaignDetails.map(o => o.rawOrder?.Id).filter(Boolean);
                if (sentIds.length > 0) this.addSentOrders(sentIds);
            }

            // Show summary modal (will implement next)
            this.showSendSummary(
                'tpage',
                this.selectedTemplate.Name,
                this.sendingState.success,
                this.sendingState.error,
                this.sendingState.errors,
                successOrders
            );

        } catch (error) {
            this.sendingState.isRunning = false;
            this.log('❌ [T-PAGE] Fatal error:', error);

            // Restore UI
            const sendBtn = document.getElementById('messageBtnSend');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
            }

            if (window.notificationManager) {
                window.notificationManager.error(
                    `Lỗi T-Page: ${error.message}`,
                    5000
                );
            }

            throw error;
        }
    }

    async _processSingleOrder(order, context) {
        const { token, displayName, templateContent, sendMode } = context;

        if (!order.Id) {
            throw new Error('Order không có ID');
        }

        // SMART OPTIMIZATION:
        // Check if we need full data (products)
        const needsProductDetails = templateContent.includes('{order.details}') || sendMode === 'image';

        // Check if we already have PartnerId (customer_id)
        const hasPartnerId = !!order.PartnerId;

        let fullOrderData;
        let orderDataForTemplate;

        if (!needsProductDetails && hasPartnerId) {
            this.log(`⚡ [OPTIMIZATION] Skipping fetch for order ${order.code} (Text mode, no products needed)`);
            // Use existing data
            orderDataForTemplate = {
                Id: order.Id,
                code: order.code,
                customerName: order.customerName,
                phone: order.phone,
                address: order.address,
                totalAmount: order.totalAmount,
                products: [] // Empty products
            };
            // Mock fullOrderData.raw for getChatInfoForOrder
            fullOrderData = {
                raw: {
                    ...order.raw, // Use raw data if available from getAllOrders
                    PartnerId: order.PartnerId
                },
                converted: orderDataForTemplate
            };
        } else {
            // Fetch full data
            fullOrderData = await this.fetchFullOrderData(order.Id);
            orderDataForTemplate = fullOrderData.converted;
        }

        // Prepare order data for image generation (only if needed)
        let orderDataWithImages = null;
        if (sendMode === 'image') {
            orderDataWithImages = {
                ...fullOrderData.converted,
                products: fullOrderData.raw.Details?.map(detail => ({
                    name: detail.ProductNameGet || detail.ProductName,
                    quantity: detail.Quantity || 0,
                    price: detail.Price || 0,
                    total: (detail.Quantity || 0) * (detail.Price || 0),
                    imageUrl: detail.ImageUrl || '',
                    note: detail.Note || ''
                })) || []
            };
        }

        let messageContent = this.replacePlaceholders(templateContent, orderDataForTemplate);

        // Add signature
        if (displayName) {
            messageContent = messageContent + '\nNv. ' + displayName;
        }

        // Get chat info
        if (!window.pancakeDataManager) {
            throw new Error('pancakeDataManager không có sẵn');
        }

        const chatInfo = window.pancakeDataManager.getChatInfoForOrder(fullOrderData.raw);
        const channelId = chatInfo.channelId;
        const psid = chatInfo.psid;

        if (!channelId || !psid) {
            throw new Error(`Thiếu thông tin channelId hoặc PSID. Order: ${order.code}`);
        }

        // Get conversation from Pancake API (fetch if not in cache)
        let conversation = window.pancakeDataManager?.getConversationByUserId(psid);
        let conversationId;
        let customerId = null;
        let isCommentOnly = false;
        let commentConvId = null; // Track COMMENT conversation for Private Reply fallback

        if (conversation && conversation.id) {
            conversationId = conversation.id;
            customerId = conversation.customers?.[0]?.id || null;
            if (conversation.type === 'COMMENT') {
                isCommentOnly = true;
                commentConvId = conversation.id;
                this.log(`📌 Found COMMENT conversation in cache: ${conversationId} (no INBOX available)`);
            } else {
                this.log(`📌 Found conversation in cache: ${conversationId}`);
            }
        } else {
            // Fetch from Pancake API to get correct conversation ID
            this.log(`🔍 Fetching conversation from Pancake API for psid: ${psid}`);
            try {
                const convResult = await window.pancakeDataManager.fetchConversationsByCustomerFbId(channelId, psid);
                if (convResult.success && convResult.conversations?.length > 0) {
                    // Find INBOX conversation first, track COMMENT for fallback
                    const inboxConv = convResult.conversations.find(c => c.type === 'INBOX');

                    // Find COMMENT conversation matching this order's post (if possible)
                    // Facebook_PostId format: pageId_postId → extract postId to match conv ID (postId_commentId)
                    let commentConv = null;
                    const orderFbPostId = fullOrderData?.raw?.Facebook_PostId;
                    if (orderFbPostId) {
                        const postIdPart = orderFbPostId.split('_')[1] || orderFbPostId;
                        commentConv = convResult.conversations.find(c =>
                            c.type === 'COMMENT' && c.id.startsWith(postIdPart + '_')
                        );
                        if (commentConv) {
                            this.log(`📌 Found COMMENT matching order's post (${postIdPart}): ${commentConv.id}`);
                        }
                    }
                    // Fallback: first COMMENT conversation
                    if (!commentConv) {
                        commentConv = convResult.conversations.find(c => c.type === 'COMMENT');
                    }

                    if (inboxConv) {
                        conversationId = inboxConv.id;
                        customerId = convResult.customerUuid || inboxConv.customers?.[0]?.id || null;
                        if (commentConv) commentConvId = commentConv.id;
                        this.log(`✅ Got INBOX conversation: ${conversationId}, customerId: ${customerId}`);
                    } else if (commentConv) {
                        isCommentOnly = true;
                        commentConvId = commentConv.id;
                        customerId = convResult.customerUuid || commentConv.customers?.[0]?.id || null;
                        this.log(`⚠️ No INBOX conversation found. Only COMMENT: ${commentConvId}`);
                        this.log(`📋 Available types: ${convResult.conversations.map(c => c.type).join(', ')}`);
                    } else {
                        conversationId = convResult.conversations[0].id;
                        customerId = convResult.customerUuid || convResult.conversations[0].customers?.[0]?.id || null;
                        this.log(`✅ Got conversation from API: ${conversationId}, customerId: ${customerId}`);
                    }
                } else {
                    // Fallback: construct conversationId from channelId_psid
                    conversationId = `${channelId}_${psid}`;
                    this.log(`⚠️ No conversation found via API, using fallback: ${conversationId}`);
                }
            } catch (fetchErr) {
                // Fallback on error
                conversationId = `${channelId}_${psid}`;
                this.log(`⚠️ Error fetching conversation: ${fetchErr.message}, using fallback: ${conversationId}`);
            }
        }

        // COMMENT-only: Skip Pancake reply_inbox (will fail), use Pancake private_replies action
        if (isCommentOnly && commentConvId) {
            this.log(`🔄 COMMENT-only → Pancake private_replies for order ${order.code} (commentConvId: ${commentConvId})`);

            // Get page_access_token (same logic as below)
            let prPageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
            if (!prPageAccessToken) {
                const accountToken = token || window.pancakeTokenManager?.currentToken;
                if (accountToken && window.pancakeTokenManager) {
                    prPageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, accountToken);
                }
            }
            if (!prPageAccessToken) {
                throw new Error(`Không tìm thấy page_access_token cho page ${channelId}`);
            }

            // For private_replies: conversationId = message_id = commentConvId
            const prApiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${channelId}/conversations/${commentConvId}/messages`,
                prPageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            // Derive post_id from commentConvId to ensure consistency
            // commentConvId format: postId_commentId → post_id: pageId_postId
            const prCommentPostPart = commentConvId.split('_')[0];
            const prDerivedPostId = `${channelId}_${prCommentPostPart}`;

            const prPayload = {
                action: 'private_replies',
                post_id: prDerivedPostId,
                message_id: commentConvId,
                from_id: psid,
                message: messageContent
            };

            this.log(`📤 Sending private_replies via Pancake API...`);
            this.log(`📦 Payload:`, JSON.stringify(prPayload));

            try {
                const prResponse = await API_CONFIG.smartFetch(prApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(prPayload)
                }, 1, true);

                const prData = await prResponse.json();
                this.log(`📥 private_replies Response:`, JSON.stringify(prData, null, 2));

                if (prData.success !== false) {
                    this.log(`✅ Pancake private_replies succeeded for order ${order.code}`);
                    return true;
                }

                this.log(`❌ Pancake private_replies failed: ${prData.error || prData.message || JSON.stringify(prData)}`);
            } catch (prErr) {
                this.log(`❌ Pancake private_replies error: ${prErr.message}`);
            }

            // Fallback: reply_comment (public comment reply)
            // Use commentConvId as conversation in URL, latestComment.Id as message_id
            this.log(`🔄 private_replies failed → trying reply_comment for order ${order.code}`);
            try {
                const facebookPostId = order.Facebook_PostId || order.raw?.Facebook_PostId;
                const postIdPart = facebookPostId ? facebookPostId.split('_').slice(1).join('_') : null;

                if (postIdPart && window.pancakeDataManager) {
                    const commentsResult = await window.pancakeDataManager.fetchComments(
                        channelId, psid, null, postIdPart
                    );

                    if (commentsResult?.comments?.length) {
                        const customerComments = commentsResult.comments.filter(c => !c.IsOwner);
                        if (customerComments.length > 0) {
                            const latestComment = customerComments[customerComments.length - 1];

                            // Use commentConvId (COMMENT conversation ID) for URL,
                            // latestComment.Id (individual comment) for message_id
                            const rcUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                                `pages/${channelId}/conversations/${commentConvId}/messages`,
                                prPageAccessToken
                            ) + (customerId ? `&customer_id=${customerId}` : '');

                            const rcPayload = {
                                action: 'reply_comment',
                                message_id: latestComment.Id,
                                message: messageContent
                            };

                            this.log(`📤 Sending reply_comment: convId=${commentConvId}, commentId=${latestComment.Id}`);
                            const rcResponse = await API_CONFIG.smartFetch(rcUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify(rcPayload)
                            }, 1, true);

                            const rcData = await rcResponse.json();
                            if (rcResponse.ok && rcData.success !== false && !rcData.error) {
                                this.log(`✅ reply_comment succeeded for order ${order.code}`);
                                order._sentViaComment = true;
                                // Clear from failed orders if was there
                                this.removeFailedOrder(order.Id);
                                return true;
                            }
                            this.log(`❌ reply_comment failed: ${rcData.error || rcData.message || JSON.stringify(rcData)}`);
                        }
                    }
                }
            } catch (rcErr) {
                this.log(`❌ reply_comment error: ${rcErr.message}`);
            }

            // Both private_replies and reply_comment failed
            const err = new Error('COMMENT_ONLY_NO_INBOX');
            err.originalMessage = 'Khách chỉ comment, không có inbox. private_replies và reply_comment đều thất bại.';
            err.isCommentOnly = true;
            throw err;
        }

        // Get page_access_token for Official API (pages.fm)
        // First try cached token, then generate using worker's account token if needed
        let pageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
        if (!pageAccessToken) {
            // Try generate using worker's account token (multi-account sending)
            const accountToken = token || window.pancakeTokenManager?.currentToken;
            if (accountToken && window.pancakeTokenManager) {
                this.log(`🔑 Generating page_access_token for page ${channelId} using account token...`);
                pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, accountToken);
            }
        }
        if (!pageAccessToken) {
            throw new Error(`Không tìm thấy page_access_token cho page ${channelId}`);
        }

        // Build API URL with customer_id in query params
        const apiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${channelId}/conversations/${conversationId}/messages`,
            pageAccessToken
        ) + (customerId ? `&customer_id=${customerId}` : '');

        // Cắt tin nhắn thành nhiều phần nếu quá dài
        const messageParts = this.splitMessageIntoParts(messageContent);

        // Gửi từng phần tin nhắn
        for (let partIndex = 0; partIndex < messageParts.length; partIndex++) {
            const messagePart = messageParts[partIndex];
            const isLastPart = partIndex === messageParts.length - 1;

            if (messageParts.length > 1) {
                this.log(`📤 Sending part ${partIndex + 1}/${messageParts.length} (${messagePart.length} chars)`);
            }

        // Build JSON payload (Pancake API chính thức dùng application/json)
        const payload = {
            action: 'reply_inbox',
            message: messagePart
        };

        // Chỉ gửi ảnh ở phần cuối cùng
        if (sendMode === 'image' && isLastPart) {
            // IMAGE MODE
            if (!window.orderImageGenerator) {
                throw new Error('OrderImageGenerator không có sẵn');
            }

            const imageBlob = await window.orderImageGenerator.generateOrderImage(
                orderDataWithImages,
                messageContent
            );

            const imageFile = new File(
                [imageBlob],
                `order_${orderDataForTemplate.code}_${Date.now()}.png`,
                { type: 'image/png' }
            );

            if (!window.pancakeDataManager) {
                throw new Error('pancakeDataManager không có sẵn');
            }

            // NEW: Firebase cache check for order products
            let contentUrl = null;
            let contentId = null;

            // Get list of product IDs from order
            const productIds = orderDataForTemplate.products
                ? orderDataForTemplate.products.map(p => p.id).filter(Boolean)
                : [];

            this.log('📦 Order has products:', productIds);

            // Check cache for any product in the order
            if (productIds.length > 0 && window.firebaseImageCache) {
                this.log('🔍 Checking Firebase cache for products...');

                for (const productId of productIds) {
                    const cached = await window.firebaseImageCache.get(productId);
                    if (cached && cached.content_url) {
                        // ✅ CACHE HIT - Reuse first cached image found
                        this.log(`✅ Cache HIT for product ${productId}! Reusing:`, cached.content_url);
                        contentUrl = cached.content_url;
                        break; // Use first match
                    }
                }
            }

            // If cache miss, upload new image
            if (!contentUrl) {
                this.log('❌ Cache miss - uploading new image to Pancake...');

                const uploadResult = await window.pancakeDataManager.uploadImage(channelId, imageFile);

                // Handle both old (string) and new (object) return formats for compatibility
                contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
                contentId = typeof uploadResult === 'object' ? uploadResult.id : null;

                this.log('✅ Image uploaded:', contentUrl);

                // Save to Firebase cache for ALL products in order
                if (productIds.length > 0 && window.firebaseImageCache) {
                    this.log('💾 Saving to Firebase cache for all products...');

                    for (const product of orderDataForTemplate.products || []) {
                        if (product.id && product.name) {
                            await window.firebaseImageCache.set(product.id, product.name, contentUrl)
                                .catch(err => {
                                    // Non-critical error
                                    this.log('⚠️ Failed to cache for product', product.id, '(non-critical):', err);
                                });
                        }
                    }
                }
            } else {
                this.log('♻️ Using cached image - skip upload');
            }

            // Add image data to payload - Pancake API dùng content_ids (array)
            if (contentId) {
                payload.content_ids = [contentId];
                payload.attachment_type = 'PHOTO';
            }

            this.log('📷 Image added to payload, content_id:', contentId);
        }

        // Send using JSON (Pancake API chính thức)
        this.log('📤 Sending message via JSON...');
        this.log('📡 API URL:', apiUrl);
        this.log('📦 Payload:', JSON.stringify(payload));

        const response = await API_CONFIG.smartFetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 1, true); // maxRetries=1, skipFallback=true: chỉ gọi 1 lần, không retry

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        this.log('📥 API Response:', JSON.stringify(responseData, null, 2));

        if (!responseData.success) {
            this.log('❌ API Error Details:', responseData);

            // Check for 24-hour policy error
            const is24HourError = (responseData.e_code === 10 && responseData.e_subcode === 2018278) ||
                (responseData.message && responseData.message.includes('khoảng thời gian cho phép'));
            if (is24HourError) {
                this.log(`⚠️ 24-hour policy error - attempting Facebook API fallback for order ${order.code}`);

                // Try Facebook API fallback (with postId + commentConvId for Private Reply)
                const fbFallbackResult = await this._sendViaFacebookAPI(channelId, psid, messageContent, fullOrderData.raw, fullOrderData.raw.Facebook_PostId);

                if (fbFallbackResult.success) {
                    this.log(`✅ Facebook API fallback succeeded for order ${order.code}`);
                    return true; // Success via Facebook API
                }

                // Send API also failed → try Pancake private_replies with known comment conv ID
                if (commentConvId) {
                    this.log(`🔄 Send API failed → trying Pancake private_replies with commentConvId: ${commentConvId}`);
                    const prResult = await this._sendViaPancakePrivateReply(channelId, psid, messageContent, commentConvId, customerId, token);
                    if (prResult) {
                        this.log(`✅ Pancake private_replies succeeded for order ${order.code}`);
                        return true;
                    }
                }

                // All fallbacks failed, throw original error
                this.log(`❌ Facebook API fallback failed: ${fbFallbackResult.error}`);
                const error24h = new Error('24H_POLICY_ERROR');
                error24h.is24HourError = true;
                error24h.originalMessage = responseData.message;
                throw error24h;
            }

            // Check for user unavailable error (551)
            const isUserUnavailable = (responseData.e_code === 551) ||
                (responseData.message && responseData.message.includes('không có mặt'));
            if (isUserUnavailable) {
                this.log(`⚠️ User unavailable (551) error - attempting Facebook API fallback for order ${order.code}`);

                // Try Facebook API fallback (with postId + commentConvId for Private Reply)
                const fbFallbackResult = await this._sendViaFacebookAPI(channelId, psid, messageContent, fullOrderData.raw, fullOrderData.raw.Facebook_PostId);

                if (fbFallbackResult.success) {
                    this.log(`✅ Facebook API fallback succeeded for order ${order.code}`);
                    return true; // Success via Facebook API
                }

                // Send API also failed → try Pancake private_replies with known comment conv ID
                if (commentConvId) {
                    this.log(`🔄 Send API failed → trying Pancake private_replies with commentConvId: ${commentConvId}`);
                    const prResult = await this._sendViaPancakePrivateReply(channelId, psid, messageContent, commentConvId, customerId, token);
                    if (prResult) {
                        this.log(`✅ Pancake private_replies succeeded for order ${order.code}`);
                        return true;
                    }
                }

                // All fallbacks failed, throw original error
                this.log(`❌ Facebook API fallback failed: ${fbFallbackResult.error}`);
                const error551 = new Error('USER_UNAVAILABLE');
                error551.isUserUnavailable = true;
                error551.originalMessage = responseData.message;
                throw error551;
            }

            throw new Error(responseData.error || responseData.message || `API returned success: false - ${JSON.stringify(responseData)}`);
        }

            // Delay nhỏ giữa các phần để tránh rate limit
            if (!isLastPart && messageParts.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } // End of for loop (messageParts)

        return true;
    }

    /**
     * Send message via Pancake private_replies action (for COMMENT-only or fallback)
     * Uses Pancake API endpoint with action: "private_replies"
     * @returns {boolean} true if succeeded, false if failed
     */
    async _sendViaPancakePrivateReply(channelId, psid, messageContent, commentConvId, customerId, token) {
        this.log(`[PANCAKE-PR] Attempting Pancake private_replies...`);

        try {
            // Get page_access_token
            let pageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
            if (!pageAccessToken) {
                const accountToken = token || window.pancakeTokenManager?.currentToken;
                if (accountToken && window.pancakeTokenManager) {
                    pageAccessToken = await window.pancakeTokenManager.generatePageAccessTokenWithToken(channelId, accountToken);
                }
            }
            if (!pageAccessToken) {
                this.log('[PANCAKE-PR] ❌ No page_access_token available');
                return false;
            }

            // For private_replies: conversationId = message_id = commentConvId
            const apiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${channelId}/conversations/${commentConvId}/messages`,
                pageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            // Derive post_id from commentConvId to ensure consistency
            // commentConvId format: postId_commentId → post_id: pageId_postId
            const commentPostPart = commentConvId.split('_')[0];
            const derivedPostId = `${channelId}_${commentPostPart}`;

            const payload = {
                action: 'private_replies',
                post_id: derivedPostId,
                message_id: commentConvId,
                from_id: psid,
                message: messageContent
            };

            this.log(`[PANCAKE-PR] 📤 Sending...`);
            this.log(`[PANCAKE-PR] 📦 Payload:`, JSON.stringify(payload));

            const response = await API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            }, 1, true);

            const data = await response.json();
            this.log(`[PANCAKE-PR] 📥 Response:`, JSON.stringify(data, null, 2));

            if (data.success !== false) {
                this.log(`[PANCAKE-PR] ✅ private_replies succeeded!`);
                return true;
            }

            this.log(`[PANCAKE-PR] ❌ Failed: ${data.error || data.message || JSON.stringify(data)}`);
            return false;
        } catch (err) {
            this.log(`[PANCAKE-PR] ❌ Error: ${err.message}`);
            return false;
        }
    }

    /**
     * Send message via Facebook Graph API with HUMAN_AGENT/CUSTOMER_FEEDBACK tag
     * Falls back to Private Reply if Send API fails with 551 (no inbox conversation)
     */
    async _sendViaFacebookAPI(pageId, psid, message, orderRaw, postId, commentId) {
        this.log('[FB-FALLBACK] Attempting Facebook API fallback...');

        try {
            // Get Facebook Page Token from various sources
            let facebookPageToken = null;

            // Source 1: Try from cachedChannelsData
            if (window.cachedChannelsData) {
                const channel = window.cachedChannelsData.find(ch =>
                    String(ch.ChannelId) === String(pageId) ||
                    String(ch.Facebook_AccountId) === String(pageId)
                );
                if (channel && channel.Facebook_PageToken) {
                    facebookPageToken = channel.Facebook_PageToken;
                    this.log('[FB-FALLBACK] ✅ Got Facebook Page Token from cached channels');
                }
            }

            // Source 2: Fetch from CRMTeam if available
            if (!facebookPageToken && orderRaw.CRMTeamId) {
                try {
                    const crmTeam = await this.fetchCRMTeam(orderRaw.CRMTeamId);
                    if (crmTeam && crmTeam.Facebook_PageToken) {
                        facebookPageToken = crmTeam.Facebook_PageToken;
                        this.log('[FB-FALLBACK] ✅ Got Facebook Page Token from CRMTeam');
                    }
                } catch (err) {
                    this.log('[FB-FALLBACK] ⚠️ Could not fetch CRMTeam:', err.message);
                }
            }

            if (!facebookPageToken) {
                return {
                    success: false,
                    error: 'Không tìm thấy Facebook Page Token'
                };
            }

            // Call Facebook Send API via worker proxy
            const facebookSendUrl = window.API_CONFIG.buildUrl.facebookSend();
            this.log('[FB-FALLBACK] Calling:', facebookSendUrl);

            const requestBody = {
                pageId: pageId,
                psid: psid,
                message: message,
                pageToken: facebookPageToken,
                useTag: true
            };

            // Direct Private Reply mode: pass commentId to skip Send API entirely
            if (commentId) {
                requestBody.commentId = commentId;
                this.log('[FB-FALLBACK] Direct Private Reply mode → commentId:', commentId);
            }

            // Pass postId and customerName for Private Reply fallback (when Send API fails with 551)
            if (postId) {
                requestBody.postId = postId;
                this.log('[FB-FALLBACK] Including postId for Private Reply fallback:', postId);
            }
            if (orderRaw.PartnerName || orderRaw.Partner?.Name) {
                requestBody.customerName = orderRaw.PartnerName || orderRaw.Partner?.Name;
                this.log('[FB-FALLBACK] Including customerName for matching:', requestBody.customerName);
            }

            const response = await fetch(facebookSendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            this.log('[FB-FALLBACK] Response:', result);

            if (result.success) {
                const method = result.method || 'send_api';
                this.log(`[FB-FALLBACK] ✅ Message sent successfully! Method: ${method}, Tag: ${result.used_tag || 'none'}`);
                return {
                    success: true,
                    messageId: result.message_id,
                    method: method,
                    used_tag: result.used_tag,
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Facebook API error',
                    error_code: result.error_code,
                    _debug: result._debug,
                };
            }

        } catch (error) {
            this.log('[FB-FALLBACK] ❌ Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async fetchCRMTeam(teamId) {
        this.log('🌐 Fetching CRMTeam data for ID:', teamId);

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/CRMTeam(${teamId})`;

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.log('✅ CRMTeam data fetched:', data.Name);
            return data;

        } catch (error) {
            this.log('❌ Error fetching CRMTeam data:', error);
            return null; // Return null if failed, continue without team info
        }
    }

    async postOrderCampaign(orderCampaignDetails) {
        this.log('📡 Posting order campaign...');
        this.log('  - Orders count:', orderCampaignDetails.length);

        try {
            // Get current date in DD/MM/YYYY format
            const now = new Date();
            const noteDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

            // Get CRMTeamId from first order (or use a default)
            const rootCRMTeamId = orderCampaignDetails[0]?.rawOrder?.CRMTeamId || 2;

            // Build Details array
            const details = orderCampaignDetails.map(detail => {
                const order = detail.rawOrder;
                const crmTeam = detail.crmTeam;

                return {
                    CRMTeam: crmTeam,
                    CRMTeamId: order.CRMTeamId,
                    Facebook_ASId: order.Facebook_ASUserId,
                    Facebook_CommentId: order.Facebook_CommentId,
                    Facebook_PostId: order.Facebook_PostId,
                    Facebook_UserId: order.Facebook_UserId,
                    Facebook_UserName: order.Facebook_UserName,
                    MatchingId: order.MatchingId,
                    Message: detail.message,
                    PartnerId: order.PartnerId,
                    TypeId: "Message"
                };
            });

            // Build payload
            const payload = {
                CRMTeamId: rootCRMTeamId,
                Details: details,
                Note: noteDate,
                MailTemplateId: this.selectedTemplate.Id
            };

            this.log('📦 Payload:');
            this.log('  - CRMTeamId:', payload.CRMTeamId);
            this.log('  - Details count:', payload.Details.length);
            this.log('  - Note:', payload.Note);
            this.log('  - MailTemplateId:', payload.MailTemplateId);

            // POST to API
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/rest/v1.0/CRMActivityCampaign/order-campaign';

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            this.log('✅ Order campaign posted successfully');
            this.log('  - Response:', result);

            return result;

        } catch (error) {
            this.log('❌ Error posting order campaign:', error);
            throw error;
        }
    }

    async fetchFullOrderData(orderId) {
        this.log('🌐 Fetching full order data for ID:', orderId);

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User`;

            this.log('📡 API URL:', apiUrl);

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.log('✅ Full order data fetched');
            this.log('  - Order Code:', data.Code);
            this.log('  - Partner Name:', data.Partner?.Name);
            this.log('  - CRMTeamId:', data.CRMTeamId);
            this.log('  - Products count:', data.Details?.length || 0);

            // Return full raw data + converted data
            return {
                raw: data, // Keep full API response for POST
                converted: {
                    Id: data.Id,
                    code: data.Code,
                    customerName: data.Partner?.Name || data.Name,
                    phone: data.Partner?.Telephone || data.Telephone,
                    address: data.Partner?.Address || data.Address,
                    totalAmount: data.TotalAmount,
                    products: data.Details?.map(detail => ({
                        name: detail.ProductNameGet || detail.ProductName,
                        quantity: detail.Quantity || 0,
                        price: detail.Price || 0,
                        total: (detail.Quantity || 0) * (detail.Price || 0),
                        note: detail.Note || ''
                    })) || []
                }
            };

        } catch (error) {
            this.log('❌ Error fetching full order data:', error);
            throw new Error(`Không thể tải thông tin đơn hàng: ${error.message}`);
        }
    }

    /**
     * Fetch order with CRMTeam data (for T-Page sending)
     * Used in T-Page mode to get full order + CRMTeam info
     */
    async _fetchOrderWithCRMTeam(orderId) {
        this.log('🌐 [T-PAGE] Fetching order with CRMTeam for ID:', orderId);

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

            this.log('📡 API URL:', apiUrl);

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.log('✅ Order with CRMTeam fetched');
            this.log('  - Order Code:', data.Code);
            this.log('  - Partner Name:', data.Partner?.Name);
            this.log('  - CRMTeamId:', data.CRMTeamId);
            this.log('  - CRMTeam Name:', data.CRMTeam?.Name);
            this.log('  - Products count:', data.Details?.length || 0);

            // Check if CRMTeam exists
            if (!data.CRMTeam) {
                this.log('⚠️ Warning: No CRMTeam data for order', data.Code);
            }

            return data; // Return full order data with CRMTeam

        } catch (error) {
            this.log('❌ Error fetching order with CRMTeam:', error);
            throw new Error(`Không thể tải thông tin đơn hàng: ${error.message}`);
        }
    }

    /**
     * Parse discount price from product note
     * Patterns:
     * - "150k" hoặc "150K" ở BẤT KỲ vị trí nào → LUÔN là giá sale
     * - "hồng 150k", "150k hồng", "màu đỏ 200K size M" → đều detect được
     * - Số đứng đầu không có k (e.g., "150 hồng") → cũng là giá sale
     * @returns {Object|null} - { discountPrice, displayText, remainingNote }
     */
    parseDiscountPrice(note) {
        if (!note || typeof note !== 'string') return null;

        const trimmedNote = note.trim();
        if (!trimmedNote) return null;

        let priceValue = null;
        let remainingNote = '';

        // Pattern 1: số + k/K ở BẤT KỲ vị trí nào (e.g., "hồng 150k", "150K đỏ")
        // Đây là pattern ưu tiên cao nhất vì "số + k" LUÔN là giá sale
        const kAnywherePattern = /(\d+)k/i;
        let match = trimmedNote.match(kAnywherePattern);
        if (match) {
            priceValue = parseInt(match[1], 10);
            // Loại bỏ phần "số + k" khỏi note để lấy remaining
            remainingNote = trimmedNote.replace(/\d+k/i, '').trim();
        }

        // Pattern 2: số đứng đầu không có k (e.g., "150", "150 hồng")
        if (!priceValue) {
            const numStartPattern = /^(\d+)\b\s*(.*)/;
            match = trimmedNote.match(numStartPattern);
            if (match) {
                priceValue = parseInt(match[1], 10);
                remainingNote = match[2] ? match[2].trim() : '';
            }
        }

        if (priceValue && priceValue > 0) {
            const discountPrice = priceValue * 1000;
            return {
                discountPrice: discountPrice,
                displayText: priceValue.toString(),
                remainingNote: remainingNote
            };
        }

        return null;
    }

    /**
     * Format a single product line with discount detection
     */
    formatProductLineWithDiscount(product) {
        const discountInfo = this.parseDiscountPrice(product.note);

        if (discountInfo) {
            const originalPricePerItem = product.price;
            const discountPricePerItem = discountInfo.discountPrice;
            const discountPerItem = originalPricePerItem - discountPricePerItem;
            const totalDiscount = discountPerItem * product.quantity;

            const productLine = `- ${product.name} x${product.quantity} = ${this.formatCurrency(product.total)}`;

            let saleLine = `  📝Sale ${discountInfo.displayText}`;
            if (discountInfo.remainingNote) {
                saleLine += ` (${discountInfo.remainingNote})`;
            }

            return {
                line: productLine + '\n' + saleLine,
                hasDiscount: true,
                discountData: {
                    originalTotal: product.total,
                    totalDiscount: totalDiscount
                }
            };
        } else {
            let line = `- ${product.name} x${product.quantity} = ${this.formatCurrency(product.total)}`;
            if (product.note && product.note.trim()) {
                line += `\n  📝 ${product.note.trim()}`;
            }
            return {
                line: line,
                hasDiscount: false,
                discountData: null
            };
        }
    }

    /**
     * Calculate shipping fee from address using carrier mapping logic
     * @param {string} address - Customer address
     * @param {object} extraAddress - Extra address data from TPOS (optional)
     * @returns {{fee: number, isProvince: boolean}} - Shipping fee and province flag
     */
    getShippingFeeFromAddress(address, extraAddress = null) {
        // Use global extractDistrictFromAddress if available (from tab1-qr-debt.js)
        if (!window.extractDistrictFromAddress) {
            this.log('⚠️ extractDistrictFromAddress not available, using default 35k');
            return { fee: 35000, isProvince: true };
        }

        const districtInfo = window.extractDistrictFromAddress(address, extraAddress);
        this.log('📍 District info for shipping:', districtInfo);

        if (!districtInfo) {
            this.log('⚠️ No district info found, using default 35k (TỈNH)');
            return { fee: 35000, isProvince: true };
        }

        // Define carrier groups (same as tab1-qr-debt.js)
        const CARRIER_20K = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
        const CARRIER_20K_NAMED = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];

        const CARRIER_30K = ['2', '12'];
        const CARRIER_30K_NAMED = ['binh tan', 'thu duc'];

        const CARRIER_35K_TP = ['9'];
        const CARRIER_35K_TP_NAMED = ['binh chanh', 'nha be', 'hoc mon'];

        // Province → 35k + isProvince = true
        if (districtInfo.isProvince) {
            this.log('📍 Province detected → 35k (TỈNH)');
            return { fee: 35000, isProvince: true };
        }

        const districtNum = districtInfo.districtNumber;
        const districtName = (districtInfo.districtName || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Check by district number first
        if (districtNum) {
            if (CARRIER_20K.includes(districtNum)) {
                this.log('📍 District Q' + districtNum + ' → 20k (THÀNH PHỐ)');
                return { fee: 20000, isProvince: false };
            }
            if (CARRIER_30K.includes(districtNum)) {
                this.log('📍 District Q' + districtNum + ' → 30k (THÀNH PHỐ)');
                return { fee: 30000, isProvince: false };
            }
            if (CARRIER_35K_TP.includes(districtNum)) {
                this.log('📍 District Q' + districtNum + ' → 35k (THÀNH PHỐ)');
                return { fee: 35000, isProvince: false };
            }
        }

        // Check by district name
        if (districtName) {
            if (CARRIER_20K_NAMED.some(d => districtName.includes(d))) {
                this.log('📍 District ' + districtInfo.districtName + ' → 20k (THÀNH PHỐ)');
                return { fee: 20000, isProvince: false };
            }
            if (CARRIER_30K_NAMED.some(d => districtName.includes(d))) {
                this.log('📍 District ' + districtInfo.districtName + ' → 30k (THÀNH PHỐ)');
                return { fee: 30000, isProvince: false };
            }
            if (CARRIER_35K_TP_NAMED.some(d => districtName.includes(d))) {
                this.log('📍 District ' + districtInfo.districtName + ' → 35k (THÀNH PHỐ)');
                return { fee: 35000, isProvince: false };
            }
        }

        // Default to 35k (ship tỉnh)
        this.log('📍 No match found → default 35k (TỈNH)');
        return { fee: 35000, isProvince: true };
    }

    replacePlaceholders(content, orderData) {
        let result = content;

        // Replace partner name
        if (orderData.customerName && orderData.customerName.trim()) {
            result = result.replace(/{partner\.name}/g, orderData.customerName);
        } else {
            result = result.replace(/{partner\.name}/g, '(Khách hàng)');
        }

        // Replace partner address - bao gồm số điện thoại
        if (orderData.address && orderData.address.trim()) {
            // Thêm số điện thoại vào địa chỉ
            const phone = orderData.phone && orderData.phone.trim() ? orderData.phone : '';
            const addressWithPhone = phone ? `${orderData.address} - SĐT: ${phone}` : orderData.address;
            result = result.replace(/{partner\.address}/g, addressWithPhone);
        } else {
            // Xử lý pattern với dấu ngoặc kép: "{partner.address}" → (Chưa có địa chỉ)
            result = result.replace(/"\{partner\.address\}"/g, '(Chưa có địa chỉ)');
            // Xử lý pattern không có dấu ngoặc kép: {partner.address} → (Chưa có địa chỉ)
            result = result.replace(/\{partner\.address\}/g, '(Chưa có địa chỉ)');
        }

        // Replace partner phone
        if (orderData.phone && orderData.phone.trim()) {
            result = result.replace(/{partner\.phone}/g, orderData.phone);
        } else {
            result = result.replace(/{partner\.phone}/g, '(Chưa có SĐT)');
        }

        // Replace order details (products) - with discount detection
        if (orderData.products && Array.isArray(orderData.products) && orderData.products.length > 0) {
            let totalDiscountAmount = 0;
            let hasAnyDiscount = false;

            const formattedProducts = orderData.products.map(p => {
                const formatted = this.formatProductLineWithDiscount(p);
                if (formatted.hasDiscount && formatted.discountData) {
                    hasAnyDiscount = true;
                    totalDiscountAmount += formatted.discountData.totalDiscount;
                }
                return formatted;
            });

            const productList = formattedProducts.map(fp => fp.line).join('\n');

            // Calculate shipping fee from address
            const { fee: baseShippingFee, isProvince } = this.getShippingFeeFromAddress(orderData.address, orderData.extraAddress);

            // Calculate order total (after discount if any)
            const orderTotal = hasAnyDiscount
                ? (orderData.totalAmount || 0) - totalDiscountAmount
                : (orderData.totalAmount || 0);

            // Check freeship conditions:
            // 1. THÀNH PHỐ (20k/30k/35k) + total > 1.500.000đ → freeship
            // 2. TỈNH + total > 3.000.000đ → freeship
            let shippingFee = baseShippingFee;
            let isFreeship = false;
            if (!isProvince && orderTotal > 1500000) {
                shippingFee = 0;
                isFreeship = true;
                this.log('🎁 FREESHIP: THÀNH PHỐ + total > 1.5tr');
            } else if (isProvince && orderTotal > 3000000) {
                shippingFee = 0;
                isFreeship = true;
                this.log('🎁 FREESHIP: TỈNH + total > 3tr');
            }
            this.log('📦 Shipping fee:', shippingFee, isFreeship ? '(FREESHIP)' : '');

            // Format shipping line
            const shipLine = isFreeship
                ? `Phí ship: FREESHIP 🎁`
                : `Phí ship: ${this.formatCurrency(shippingFee)}`;

            // Format total section based on whether discounts exist
            let totalSection;
            if (hasAnyDiscount) {
                const originalTotal = orderData.totalAmount || 0;
                const afterDiscount = originalTotal - totalDiscountAmount;
                const finalTotal = afterDiscount + shippingFee;

                totalSection = [
                    `Tổng : ${this.formatCurrency(originalTotal)}`,
                    `Giảm giá: ${this.formatCurrency(totalDiscountAmount)}`,
                    `Tổng tiền: ${this.formatCurrency(afterDiscount)}`,
                    shipLine,
                    `Tổng thanh toán: ${this.formatCurrency(finalTotal)}`
                ].join('\n');
            } else {
                const totalAmount = orderData.totalAmount || 0;
                const finalTotal = totalAmount + shippingFee;
                totalSection = [
                    `Tổng tiền: ${this.formatCurrency(totalAmount)}`,
                    shipLine,
                    `Tổng thanh toán: ${this.formatCurrency(finalTotal)}`
                ].join('\n');
            }

            const productListWithTotal = `${productList}\n\n${totalSection}`;
            result = result.replace(/{order\.details}/g, productListWithTotal);
        } else {
            result = result.replace(/{order\.details}/g, '(Chưa có sản phẩm)');
        }

        // Replace order code
        if (orderData.code && orderData.code.trim()) {
            result = result.replace(/{order\.code}/g, orderData.code);
        } else {
            result = result.replace(/{order\.code}/g, '(Không có mã)');
        }

        // Replace order total
        if (orderData.totalAmount) {
            result = result.replace(/{order\.total}/g, this.formatCurrency(orderData.totalAmount));
        } else {
            result = result.replace(/{order\.total}/g, '0đ');
        }

        return result;
    }

    /**
     * Cắt tin nhắn thành nhiều phần, mỗi phần tối đa 2000 ký tự
     * Cắt logic ở dấu xuống dòng "\n" để không cắt giữa dòng
     */
    splitMessageIntoParts(message, maxLength = 2000) {
        if (message.length <= maxLength) {
            return [message];
        }

        const parts = [];
        let remaining = message;

        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                parts.push(remaining);
                break;
            }

            // Tìm vị trí xuống dòng gần nhất trước maxLength
            let cutIndex = remaining.lastIndexOf('\n', maxLength);

            // Nếu không tìm thấy xuống dòng, tìm dấu cách gần nhất
            if (cutIndex === -1 || cutIndex < maxLength * 0.5) {
                cutIndex = remaining.lastIndexOf(' ', maxLength);
            }

            // Nếu vẫn không tìm thấy, cắt cứng tại maxLength
            if (cutIndex === -1 || cutIndex < maxLength * 0.3) {
                cutIndex = maxLength;
            }

            const part = remaining.substring(0, cutIndex).trim();
            if (part.length > 0) {
                parts.push(part);
            }
            remaining = remaining.substring(cutIndex).trim();
        }

        this.log(`📝 Split message into ${parts.length} parts`);
        return parts;
    }

    async copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                this.log('✅ Copied to clipboard');
                return true;
            } catch (err) {
                this.log('⚠️ Clipboard API failed:', err);
                return this.fallbackCopyToClipboard(text);
            }
        } else {
            return this.fallbackCopyToClipboard(text);
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            this.log(successful ? '✅ Fallback copy successful' : '❌ Fallback copy failed');
            return successful;
        } catch (err) {
            this.log('❌ Fallback copy error:', err);
            document.body.removeChild(textArea);
            return false;
        }
    }

    insertTemplateToInput() {
        this.log('📝 Inserting template to input...');

        if (!this.targetInputId) {
            this.log('❌ No target input specified');
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        const inputElement = document.getElementById(this.targetInputId);
        if (!inputElement) {
            this.log('❌ Target input not found:', this.targetInputId);
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        // Get template content (plain text only)
        let content = (this.selectedTemplate.Content || this.selectedTemplate.BodyPlain) || '';

        // If we have order data, replace placeholders
        if (this.currentOrder) {
            this.log('🔄 Replacing placeholders with order data...');
            content = this.replacePlaceholders(content, this.currentOrder);
        }

        // Insert into input
        const currentValue = inputElement.value || '';
        const newValue = currentValue ? `${currentValue}\n${content}` : content;
        inputElement.value = newValue;

        this.log('✅ Template inserted to input');
        this.log('  - Input ID:', this.targetInputId);
        this.log('  - Content length:', content.length);

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.success(
                `Đã chèn template: ${this.selectedTemplate.Name}`,
                2000
            );
        }

        // Close modal
        this.closeModal();

        // Focus on input
        inputElement.focus();

        // Move cursor to end
        if (inputElement.setSelectionRange) {
            const len = inputElement.value.length;
            inputElement.setSelectionRange(len, len);
        }
    }

    /**
     * Show send summary modal with results
     * @param {string} sendMode - 'tpage' or 'pancake'
     * @param {string} templateName - Name of the template used
     * @param {number} successCount - Number of successful sends
     * @param {number} errorCount - Number of failed sends
     * @param {Array} errors - Array of error objects {stt, order, error}
     * @param {Array} successOrders - Array of successful order codes
     */
    showSendSummary(sendMode, templateName, successCount, errorCount, errors, successOrders) {
        this.log('📊 Showing send summary...');
        this.log('  - Mode:', sendMode);
        this.log('  - Template:', templateName);
        this.log('  - Success:', successCount);
        this.log('  - Errors:', errorCount);

        const total = successCount + errorCount;
        const sendModeText = sendMode === 'tpage' ? 'T-Page' : 'Pancake';
        const sendModeIcon = sendMode === 'tpage' ? '🚀' : '💬';

        // Build error table HTML
        let errorTableHTML = '';
        if (errors && errors.length > 0) {
            const errorRows = errors.map(err => `
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${err.stt || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">${this.escapeHtml(err.order || '-')}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626;">${this.escapeHtml(err.error || 'Unknown error')}</td>
                </tr>
            `).join('');

            errorTableHTML = `
                <div style="margin-top: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #dc2626; font-size: 14px;">
                        <i class="fas fa-exclamation-triangle"></i> Chi tiết đơn lỗi:
                    </h4>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background: #f9fafb;">
                                    <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; width: 60px;">STT</th>
                                    <th style="padding: 8px; border: 1px solid #e5e7eb; width: 120px;">Mã đơn</th>
                                    <th style="padding: 8px; border: 1px solid #e5e7eb;">Lỗi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${errorRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Create modal HTML
        const modalHTML = `
            <div class="message-modal-overlay active" id="sendSummaryModal" style="z-index: 10001;">
                <div class="message-modal" style="max-width: 600px;">
                    <div class="message-modal-header">
                        <h3>
                            <i class="fas fa-chart-bar"></i>
                            Kết quả gửi tin nhắn
                        </h3>
                        <button class="message-modal-close" onclick="document.getElementById('sendSummaryModal').remove(); document.body.style.overflow = 'auto';">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding: 24px;">
                        <!-- Summary Stats -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                            <div style="background: #dcfce7; padding: 16px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #16a34a;">${successCount}</div>
                                <div style="font-size: 12px; color: #15803d; margin-top: 4px;">✅ Thành công</div>
                            </div>
                            <div style="background: #fee2e2; padding: 16px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${errorCount}</div>
                                <div style="font-size: 12px; color: #b91c1c; margin-top: 4px;">❌ Thất bại</div>
                            </div>
                            <div style="background: #e0e7ff; padding: 16px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 24px; font-weight: bold; color: #4f46e5;">${total}</div>
                                <div style="font-size: 12px; color: #4338ca; margin-top: 4px;">📊 Tổng cộng</div>
                            </div>
                        </div>

                        <!-- Details -->
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 16px;">
                            <div style="margin-bottom: 6px;">
                                <strong>Chế độ:</strong> ${sendModeIcon} ${sendModeText}
                            </div>
                            <div>
                                <strong>Template:</strong> ${this.escapeHtml(templateName)}
                            </div>
                        </div>

                        ${errorTableHTML}

                        <!-- Actions -->
                        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                            <button
                                onclick="document.getElementById('sendSummaryModal').remove(); document.body.style.overflow = 'auto';"
                                style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;"
                            >
                                <i class="fas fa-check"></i> Đóng
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing summary modal if any
        const existingModal = document.getElementById('sendSummaryModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Save to history
        this.saveToHistory({
            timestamp: new Date().toISOString(),
            sendMode: sendMode,
            templateName: templateName,
            successCount: successCount,
            errorCount: errorCount,
            errors: errors,
            successOrders: successOrders
        });

        // Close main modal
        this.closeModal();

        this.log('✅ Summary modal displayed');
    }

    getSelectedOrdersFromTable() {
        const selectedOrders = [];
        const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]:checked');

        this.log('📋 Getting selected orders from table...');
        this.log('  - Checkboxes checked:', checkboxes.length);

        const allOrders = window.getAllOrders ? window.getAllOrders() : [];

        checkboxes.forEach(checkbox => {
            const orderId = checkbox.value;

            // Try to find full order data from global state
            const fullOrder = allOrders.find(o => o.Id === orderId);

            if (fullOrder) {
                // Use full data - prioritize Partner info if available
                selectedOrders.push({
                    Id: fullOrder.Id,
                    code: fullOrder.Code,
                    customerName: fullOrder.Partner?.Name || fullOrder.Name,
                    phone: fullOrder.Partner?.Telephone || fullOrder.Telephone,
                    address: fullOrder.Partner?.Address || fullOrder.Address,
                    totalAmount: fullOrder.TotalAmount,
                    PartnerId: fullOrder.PartnerId || fullOrder.Partner?.Id,
                    // STT from SessionIndex (the table row number)
                    SessionIndex: fullOrder.SessionIndex || null,
                    // Facebook fields for comment reply (if available)
                    Facebook_PostId: fullOrder.Facebook_PostId || null,
                    Facebook_CommentId: fullOrder.Facebook_CommentId || null,
                    Facebook_ASUserId: fullOrder.Facebook_ASUserId || null,
                    // Keep raw data for getChatInfoForOrder
                    raw: fullOrder
                });
                this.log('  - Found full order:', fullOrder.Code, 'STT:', fullOrder.SessionIndex);
            } else {
                // Fallback to DOM scraping (should rarely happen if allData is synced)
                const row = checkbox.closest('tr');
                if (row) {
                    const orderData = {
                        Id: orderId,
                        code: row.querySelector('td:nth-child(3)')?.textContent?.trim().split('\n')[0]?.trim(),
                        customerName: row.querySelector('td:nth-child(4)')?.textContent?.trim().split('\n')[0]?.trim(),
                        phone: row.querySelector('td:nth-child(5)')?.textContent?.trim(),
                        address: row.querySelector('td:nth-child(6)')?.textContent?.trim(),
                        totalAmount: row.querySelector('td:nth-child(8)')?.textContent?.replace(/[^\d]/g, ''),
                        // PartnerId is missing here, will fail optimization check
                    };
                    selectedOrders.push(orderData);
                    this.log('  - Scraped order (fallback):', orderData.code);
                }
            }
        });

        this.log('✅ Found', selectedOrders.length, 'selected orders');
        return selectedOrders;
    }

    openNewTemplateForm(editTemplate = null) {
        this._showTemplateEditorModal(editTemplate);
    }

    /**
     * Show template editor modal (create or edit)
     */
    _showTemplateEditorModal(template = null) {
        const isEdit = !!template;
        const modalId = 'templateEditorModal';

        // Remove existing modal
        document.getElementById(modalId)?.remove();

        const modalHTML = `
            <div id="${modalId}" class="message-modal-overlay active" style="z-index: 10003;">
                <div class="message-modal" style="max-width: 750px; width: 95%;">
                    <div class="message-modal-header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 16px 24px;">
                        <h3 style="font-size: 17px;">
                            <i class="fas fa-${isEdit ? 'edit' : 'plus'}"></i>
                            ${isEdit ? 'Chỉnh sửa template' : 'Tạo template mới'}
                        </h3>
                        <button onclick="document.getElementById('${modalId}').remove()" class="message-modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="message-modal-body" style="padding: 24px;">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #374151; font-size: 14px;">
                                <i class="fas fa-tag" style="color: #6b7280; margin-right: 6px;"></i>
                                Tên template <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="text" id="templateName" value="${template?.Name || ''}"
                                placeholder="VD: Chốt đơn, Xác nhận địa chỉ, Cảm ơn khách..."
                                style="width: 100%; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                        </div>

                        <div style="margin-bottom: 20px;">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #374151; font-size: 14px;">
                                <i class="fas fa-comment-alt" style="color: #6b7280; margin-right: 6px;"></i>
                                Nội dung tin nhắn <span style="color: #ef4444;">*</span>
                            </label>
                            <textarea id="templateContent" rows="10"
                                placeholder="Nhập nội dung tin nhắn...&#10;&#10;Sử dụng các biến bên dưới để tự động điền thông tin khách hàng."
                                style="width: 100%; padding: 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; resize: vertical; line-height: 1.6; box-sizing: border-box;">${template?.Content || ''}</textarea>
                        </div>

                        <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 1px solid #7dd3fc; border-radius: 10px; padding: 16px;">
                            <div style="font-weight: 600; color: #0369a1; margin-bottom: 12px; font-size: 14px;">
                                <i class="fas fa-magic"></i> Click để chèn biến vào nội dung:
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                                <div onclick="document.getElementById('templateContent').value += '{partner.name}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{partner.name}</code>
                                    <span style="font-size: 13px; color: #374151;">Tên khách hàng</span>
                                </div>
                                <div onclick="document.getElementById('templateContent').value += '{partner.address}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{partner.address}</code>
                                    <span style="font-size: 13px; color: #374151;">Địa chỉ giao hàng</span>
                                </div>
                                <div onclick="document.getElementById('templateContent').value += '{order.details}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{order.details}</code>
                                    <span style="font-size: 13px; color: #374151;">Chi tiết sản phẩm</span>
                                </div>
                                <div onclick="document.getElementById('templateContent').value += '{order.total}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{order.total}</code>
                                    <span style="font-size: 13px; color: #374151;">Tổng tiền đơn hàng</span>
                                </div>
                                <div onclick="document.getElementById('templateContent').value += '{order.code}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{order.code}</code>
                                    <span style="font-size: 13px; color: #374151;">Mã đơn hàng</span>
                                </div>
                                <div onclick="document.getElementById('templateContent').value += '{partner.phone}'; document.getElementById('templateContent').focus();"
                                    style="display: flex; align-items: center; gap: 10px; background: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; border: 1px solid #bae6fd; transition: all 0.2s;"
                                    onmouseover="this.style.background='#dbeafe'; this.style.borderColor='#60a5fa'"
                                    onmouseout="this.style.background='white'; this.style.borderColor='#bae6fd'">
                                    <code style="background: #0ea5e9; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">{partner.phone}</code>
                                    <span style="font-size: 13px; color: #374151;">Số điện thoại</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="message-modal-footer" style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between;">
                        <div>
                            ${isEdit ? `
                                <button onclick="window.messageTemplateManager?.deleteTemplate('${template?.Id}')"
                                    style="padding: 10px 18px; background: #fee2e2; color: #dc2626; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            ` : ''}
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button onclick="document.getElementById('${modalId}').remove()"
                                style="padding: 10px 24px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
                                Hủy
                            </button>
                            <button onclick="window.messageTemplateManager?.saveTemplate('${template?.Id || ''}')"
                                id="saveTemplateBtn"
                                style="padding: 10px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                                <i class="fas fa-save"></i> ${isEdit ? 'Cập nhật' : 'Tạo mới'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Focus on name input
        setTimeout(() => document.getElementById('templateName')?.focus(), 100);
    }

    /**
     * Save template (create or update)
     */
    async saveTemplate(templateId = '') {
        const nameInput = document.getElementById('templateName');
        const contentInput = document.getElementById('templateContent');
        const saveBtn = document.getElementById('saveTemplateBtn');

        const name = nameInput?.value?.trim();
        const content = contentInput?.value?.trim();

        if (!name) {
            window.notificationManager?.warning('Vui lòng nhập tên template');
            nameInput?.focus();
            return;
        }
        if (!content) {
            window.notificationManager?.warning('Vui lòng nhập nội dung tin nhắn');
            contentInput?.focus();
            return;
        }

        // Disable button
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        }

        try {
            const db = window.firebase.firestore();
            const templatesRef = db.collection(this.TEMPLATES_COLLECTION);

            const templateData = {
                Name: name,
                Content: content,
                active: true,
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };

            if (templateId) {
                // Update existing
                await templatesRef.doc(templateId).update(templateData);
                window.notificationManager?.success('Đã cập nhật template');
            } else {
                // Create new
                templateData.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
                templateData.order = this.templates.length + 1;
                await templatesRef.add(templateData);
                window.notificationManager?.success('Đã tạo template mới');
            }

            // Close modal and reload
            document.getElementById('templateEditorModal')?.remove();
            await this.loadTemplates();

        } catch (error) {
            console.error('Error saving template:', error);
            window.notificationManager?.error('Lỗi lưu template: ' + error.message);

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save"></i> ${templateId ? 'Cập nhật' : 'Tạo mới'}`;
            }
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(templateId) {
        if (!templateId) return;

        const confirmed = confirm('Bạn có chắc muốn xóa template này?');
        if (!confirmed) return;

        try {
            const db = window.firebase.firestore();
            await db.collection(this.TEMPLATES_COLLECTION).doc(templateId).delete();

            window.notificationManager?.success('Đã xóa template');

            // Close modal and reload
            document.getElementById('templateEditorModal')?.remove();
            await this.loadTemplates();

        } catch (error) {
            console.error('Error deleting template:', error);
            window.notificationManager?.error('Lỗi xóa template: ' + error.message);
        }
    }

    /**
     * Seed default templates on first load
     */
    async _seedDefaultTemplates() {
        const db = window.firebase.firestore();
        const templatesRef = db.collection(this.TEMPLATES_COLLECTION);
        const batch = db.batch();

        const defaultTemplates = [
            {
                Name: 'Chốt đơn',
                Content: `Dạ chào chị {partner.name},

Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:

{order.details}

Đơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"

Chị xác nhận giúp em để em gửi hàng nha ạ! 🙏`,
                order: 1,
                active: true,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            },
            {
                Name: 'Xác nhận địa chỉ',
                Content: `Dạ chị {partner.name} ơi,

Em xác nhận lại địa chỉ nhận hàng của chị là:
📍 {partner.address}

Chị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?`,
                order: 2,
                active: true,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            },
            {
                Name: 'Thông báo giao hàng',
                Content: `Dạ chị {partner.name} ơi,

Đơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.

Chị chú ý điện thoại để nhận hàng nha! 📦`,
                order: 3,
                active: true,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            },
            {
                Name: 'Cảm ơn khách hàng',
                Content: `Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️

Chị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.

Chúc chị một ngày vui vẻ! 😊`,
                order: 4,
                active: true,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            }
        ];

        defaultTemplates.forEach(template => {
            const docRef = templatesRef.doc();
            batch.set(docRef, template);
        });

        await batch.commit();
        this.log('✅ Seeded', defaultTemplates.length, 'default templates');
    }

    getTypeClass(typeId) {
        const normalizedType = (typeId || '').toLowerCase();

        if (normalizedType.includes('messenger')) return 'type-messenger';
        if (normalizedType.includes('general')) return 'type-general';
        if (normalizedType.includes('email')) return 'type-email';

        return 'type-general';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatCurrency(amount) {
        const numericAmount = typeof amount === 'string'
            ? parseFloat(amount.replace(/[^\d.-]/g, ''))
            : amount;

        if (isNaN(numericAmount)) return '0đ';

        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(numericAmount);
    }

    async refresh() {
        this.log('🔄 Manual refresh requested');
        this.templates = [];
        this.filteredTemplates = [];
        await this.loadTemplates();
    }

    /**
     * Save send history to localStorage
     * @param {Object} historyEntry - History entry object
     */
    saveToHistory(historyEntry) {
        try {
            const HISTORY_KEY = 'messageSendHistory';
            const MAX_HISTORY = 100; // Keep last 100 entries

            // Get existing history
            let history = [];
            const existingHistory = localStorage.getItem(HISTORY_KEY);
            if (existingHistory) {
                history = JSON.parse(existingHistory);
            }

            // Add new entry at the beginning
            history.unshift(historyEntry);

            // Limit history size
            if (history.length > MAX_HISTORY) {
                history = history.slice(0, MAX_HISTORY);
            }

            // Save to localStorage
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

            this.log('💾 History saved to localStorage');
            this.log('  - Total entries:', history.length);

        } catch (error) {
            this.log('❌ Error saving history:', error);
        }
    }

    /**
     * Get send history from localStorage
     * @returns {Array} Array of history entries
     */
    getHistory() {
        try {
            const HISTORY_KEY = 'messageSendHistory';
            const history = localStorage.getItem(HISTORY_KEY);
            if (!history) {
                this.log('📋 No history found');
                return [];
            }

            const parsed = JSON.parse(history);
            this.log('📋 History retrieved:', parsed.length, 'entries');
            return parsed;

        } catch (error) {
            this.log('❌ Error getting history:', error);
            return [];
        }
    }

    /**
     * Clear send history from localStorage
     */
    clearHistory() {
        try {
            const HISTORY_KEY = 'messageSendHistory';
            localStorage.removeItem(HISTORY_KEY);
            this.log('🗑️ History cleared');
            console.log('✅ History cleared successfully');

        } catch (error) {
            this.log('❌ Error clearing history:', error);
        }
    }

    // =====================================================
    // FIRESTORE CAMPAIGN HISTORY - Auto delete after 7 days
    // =====================================================

    /**
     * Save campaign results to Firestore
     * @param {Object} campaignData - Campaign data with success/error details
     */
    async saveCampaignToFirestore(campaignData) {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                this.log('⚠️ Firestore not available, skipping campaign save');
                return null;
            }

            const db = window.firebase.firestore();
            const campaignsRef = db.collection('message_campaigns');

            // Add TTL timestamp (7 days from now)
            const now = new Date();
            const expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const campaign = {
                ...campaignData,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: expireAt, // For TTL auto-delete
                localCreatedAt: now.toISOString()
            };

            const docRef = await campaignsRef.add(campaign);
            this.log('✅ Campaign saved to Firestore:', docRef.id);
            return docRef.id;

        } catch (error) {
            this.log('❌ Error saving campaign to Firestore:', error);
            return null;
        }
    }

    /**
     * Load campaign history from Firestore (last 7 days)
     * @returns {Array} Array of campaigns
     */
    async loadCampaignsFromFirestore() {
        try {
            if (!window.firebase || !window.firebase.firestore) {
                this.log('⚠️ Firestore not available');
                return [];
            }

            const db = window.firebase.firestore();
            const campaignsRef = db.collection('message_campaigns');

            // Get campaigns from last 7 days, newest first
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const snapshot = await campaignsRef
                .where('expireAt', '>', sevenDaysAgo)
                .orderBy('expireAt', 'desc')
                .limit(50)
                .get();

            const campaigns = [];
            snapshot.forEach(doc => {
                campaigns.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Sort by localCreatedAt descending (newest first)
            campaigns.sort((a, b) => {
                const dateA = new Date(a.localCreatedAt || 0);
                const dateB = new Date(b.localCreatedAt || 0);
                return dateB - dateA;
            });

            this.log('📋 Loaded campaigns from Firestore:', campaigns.length);
            return campaigns;

        } catch (error) {
            this.log('❌ Error loading campaigns from Firestore:', error);
            return [];
        }
    }

    /**
     * Delete old campaigns (called manually or by Cloud Function)
     */
    async cleanupOldCampaigns() {
        try {
            if (!window.firebase || !window.firebase.firestore) return;

            const db = window.firebase.firestore();
            const campaignsRef = db.collection('message_campaigns');

            const now = new Date();
            const snapshot = await campaignsRef
                .where('expireAt', '<', now)
                .limit(100)
                .get();

            if (snapshot.empty) {
                this.log('📋 No expired campaigns to delete');
                return;
            }

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            this.log('🗑️ Deleted', snapshot.size, 'expired campaigns');

        } catch (error) {
            this.log('❌ Error cleaning up campaigns:', error);
        }
    }

    /**
     * Open history modal
     */
    async openHistoryModal() {
        this.log('📂 Opening history modal...');

        const modal = document.getElementById('messageHistoryModal');
        const body = document.getElementById('historyModalBody');

        if (!modal || !body) return;

        // Use .active class for proper centering (see CSS: .message-modal-overlay.active)
        modal.classList.add('active');
        body.innerHTML = `
            <div class="message-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải lịch sử...</p>
            </div>
        `;

        // Cleanup old campaigns first
        await this.cleanupOldCampaigns();

        // Load campaigns
        const campaigns = await this.loadCampaignsFromFirestore();

        if (campaigns.length === 0) {
            body.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p>Chưa có lịch sử gửi tin nhắn</p>
                </div>
            `;
            return;
        }

        // Store campaigns for comment sending
        this._historyCampaigns = campaigns;

        // Render campaigns
        this.renderHistoryList(campaigns, body);
    }

    /**
     * Close history modal
     */
    closeHistoryModal() {
        const modal = document.getElementById('messageHistoryModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Render history list in modal
     * @param {Array} campaigns - Array of campaign objects
     * @param {HTMLElement} container - Container element
     */
    renderHistoryList(campaigns, container) {
        let html = '';

        campaigns.forEach((campaign, index) => {
            const date = campaign.localCreatedAt
                ? new Date(campaign.localCreatedAt).toLocaleString('vi-VN')
                : 'N/A';

            const successCount = campaign.successOrders?.length || 0;
            const errorCount = campaign.errorOrders?.length || 0;
            const total = successCount + errorCount;

            html += `
                <div class="history-campaign-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #fff;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div>
                            <strong style="font-size: 15px;">${campaign.templateName || 'Không có tên'}</strong>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                <i class="fas fa-calendar"></i> ${date}
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <span style="background: #dcfce7; color: #16a34a; padding: 4px 10px; border-radius: 12px; font-size: 13px;">
                                <i class="fas fa-check"></i> ${successCount} thành công
                            </span>
                            <span style="background: #fee2e2; color: #dc2626; padding: 4px 10px; border-radius: 12px; font-size: 13px;">
                                <i class="fas fa-times"></i> ${errorCount} thất bại
                            </span>
                        </div>
                    </div>

                    ${errorCount > 0 ? `
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #dc2626; font-size: 13px; padding: 8px 0;">
                            <i class="fas fa-exclamation-triangle"></i> Xem ${errorCount} đơn thất bại (click để mở)
                        </summary>
                        <div style="margin-top: 8px;">
                            <div style="margin-bottom: 8px; display: flex; justify-content: flex-end;">
                                <button onclick="window.messageTemplateManager?.sendFailedOrdersViaComment(${index})"
                                    id="btnCommentAll_${index}"
                                    style="padding: 6px 14px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;"
                                    title="Gửi tất cả đơn thất bại qua comment">
                                    <i class="fas fa-comments"></i> Gửi tất cả qua Comment
                                </button>
                            </div>
                            <div style="max-height: 200px; overflow-y: auto;">
                                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #f9fafb;">
                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">STT</th>
                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Mã đơn</th>
                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Khách hàng</th>
                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Lỗi</th>
                                            <th style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb; width: 40px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(campaign.errorOrders || []).map((order, i) => `
                                            <tr style="border-bottom: 1px solid #f3f4f6;" id="errorRow_${index}_${i}">
                                                <td style="padding: 8px; color: #6b7280;">${order.stt || i + 1}</td>
                                                <td style="padding: 8px; font-weight: 500;">${order.code || 'N/A'}</td>
                                                <td style="padding: 8px;">${order.customerName || 'N/A'}</td>
                                                <td style="padding: 8px; color: #dc2626; font-size: 11px;">${order.error || 'Không xác định'}</td>
                                                <td style="padding: 8px; text-align: center;">
                                                    <button onclick="window.messageTemplateManager?.sendSingleOrderViaComment(${index}, ${i})"
                                                        id="btnComment_${index}_${i}"
                                                        style="padding: 4px 8px; background: #f59e0b; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;"
                                                        title="Gửi qua comment">
                                                        <i class="fas fa-comment"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </details>
                    ` : ''}

                    ${successCount > 0 ? `
                    <details style="margin-top: 8px;">
                        <summary style="cursor: pointer; color: #16a34a; font-size: 13px; padding: 8px 0;">
                            <i class="fas fa-check-circle"></i> Xem ${successCount} đơn thành công (click để mở)
                        </summary>
                        <div style="margin-top: 8px; max-height: 200px; overflow-y: auto;">
                            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f9fafb;">
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">STT</th>
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Mã đơn</th>
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Khách hàng</th>
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Account</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(campaign.successOrders || []).map((order, i) => `
                                        <tr style="border-bottom: 1px solid #f3f4f6;">
                                            <td style="padding: 8px; color: #6b7280;">${order.stt || i + 1}</td>
                                            <td style="padding: 8px; font-weight: 500;">${order.code || 'N/A'}</td>
                                            <td style="padding: 8px;">${order.customerName || 'N/A'}</td>
                                            <td style="padding: 8px; color: #6b7280; font-size: 11px;">${order.account || 'N/A'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </details>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // =====================================================
    // SEND FAILED ORDERS VIA COMMENT
    // =====================================================

    /**
     * Send a single failed order via comment reply
     * @param {number} campaignIndex - Index of campaign in _historyCampaigns
     * @param {number} orderIndex - Index of error order in campaign.errorOrders
     */
    async sendSingleOrderViaComment(campaignIndex, orderIndex) {
        const campaign = this._historyCampaigns?.[campaignIndex];
        if (!campaign) {
            window.notificationManager?.error('Không tìm thấy chiến dịch');
            return;
        }

        const errorOrder = campaign.errorOrders?.[orderIndex];
        if (!errorOrder) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            return;
        }

        const btn = document.getElementById(`btnComment_${campaignIndex}_${orderIndex}`);
        const row = document.getElementById(`errorRow_${campaignIndex}_${orderIndex}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            await this._sendOrderViaCommentReply(errorOrder, campaign.templateContent);

            // Mark row as success
            if (row) {
                row.style.background = '#f0fdf4';
                row.querySelector('td:last-child').innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i>';
            }
            window.notificationManager?.show(`Comment sent: ${errorOrder.code}`, 'success');
        } catch (err) {
            if (row) {
                row.querySelector('td:last-child').innerHTML = `<span style="color: #dc2626; font-size: 10px;" title="${err.message}"><i class="fas fa-times"></i></span>`;
            }
            window.notificationManager?.error(`Lỗi ${errorOrder.code}: ${err.message}`);
        }
    }

    /**
     * Send ALL failed orders via comment reply
     * @param {number} campaignIndex - Index of campaign in _historyCampaigns
     */
    async sendFailedOrdersViaComment(campaignIndex) {
        const campaign = this._historyCampaigns?.[campaignIndex];
        if (!campaign || !campaign.errorOrders?.length) {
            window.notificationManager?.error('Không có đơn thất bại để gửi');
            return;
        }

        const btn = document.getElementById(`btnCommentAll_${campaignIndex}`);
        const originalHTML = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        }

        let successCount = 0;
        let errorCount = 0;
        const templateContent = campaign.templateContent;

        for (let i = 0; i < campaign.errorOrders.length; i++) {
            const errorOrder = campaign.errorOrders[i];
            const row = document.getElementById(`errorRow_${campaignIndex}_${i}`);
            const rowBtn = document.getElementById(`btnComment_${campaignIndex}_${i}`);

            if (rowBtn) {
                rowBtn.disabled = true;
                rowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                await this._sendOrderViaCommentReply(errorOrder, templateContent);
                successCount++;

                if (row) {
                    row.style.background = '#f0fdf4';
                    row.querySelector('td:last-child').innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i>';
                }
            } catch (err) {
                errorCount++;
                console.error(`[COMMENT-SEND] Error for ${errorOrder.code}:`, err.message);

                if (row) {
                    row.querySelector('td:last-child').innerHTML = `<span style="color: #dc2626; font-size: 10px;" title="${err.message}"><i class="fas fa-times"></i></span>`;
                }
            }

            // Small delay between sends
            await new Promise(r => setTimeout(r, 1000));

            // Update button progress
            if (btn) {
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${i + 1}/${campaign.errorOrders.length}`;
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }

        window.notificationManager?.show(
            `Comment: ${successCount} OK, ${errorCount} lỗi`,
            errorCount === 0 ? 'success' : 'warning'
        );
    }

    /**
     * Core: Send one order via comment reply
     * @param {Object} errorOrder - { orderId, code, customerName, ... }
     * @param {string} templateContent - Template text with placeholders
     */
    async _sendOrderViaCommentReply(errorOrder, templateContent) {
        const orderId = errorOrder.orderId;
        if (!orderId) {
            throw new Error('Không có orderId (đơn cũ chưa lưu orderId)');
        }

        // 1. Fetch full order data from TPOS
        const fullOrderData = await this.fetchFullOrderData(orderId);
        const raw = fullOrderData.raw;

        const facebookPostId = raw.Facebook_PostId;
        const facebookCommentId = raw.Facebook_CommentId;
        const psid = raw.Facebook_ASUserId;

        if (!facebookCommentId) {
            throw new Error('Đơn không có Facebook_CommentId');
        }
        if (!facebookPostId) {
            throw new Error('Đơn không có Facebook_PostId');
        }

        // 2. Parse channelId (pageId) from Facebook_PostId
        const channelId = facebookPostId.split('_')[0];

        // 3. Get page_access_token
        let pageAccessToken = window.pancakeTokenManager?.getPageAccessToken(channelId);
        if (!pageAccessToken) {
            pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId);
        }
        if (!pageAccessToken) {
            throw new Error(`Không có page_access_token cho page ${channelId}`);
        }

        // 4. Get latest customer comment from Pancake API
        // IMPORTANT: Must use Pancake internal comment ID, NOT TPOS Facebook_CommentId
        const postId = facebookPostId.split('_').slice(1).join('_'); // postId part
        const commentsResult = await window.pancakeDataManager?.fetchComments(
            channelId, psid, null, postId
        );

        if (!commentsResult?.comments?.length) {
            throw new Error('Không tìm thấy cuộc hội thoại comment trên Pancake');
        }

        // Find the latest comment from customer (not page owner)
        const customerComments = commentsResult.comments.filter(c => !c.IsOwner);
        if (customerComments.length === 0) {
            throw new Error('Không tìm thấy comment nào từ khách hàng');
        }

        const latestComment = customerComments[customerComments.length - 1];
        const latestCommentId = latestComment.Id; // Pancake internal ID
        console.log('[COMMENT-SEND] Using latest customer comment:', latestCommentId, 'Message:', latestComment.Message?.substring(0, 50));

        // 5. Replace placeholders in template
        let messageContent = this.replacePlaceholders(templateContent || '', fullOrderData.converted);

        // 6. Build reply_comment payload
        const conversationId = latestCommentId;
        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${channelId}/conversations/${conversationId}/messages`,
            pageAccessToken
        );

        const payload = {
            action: 'reply_comment',
            message_id: latestCommentId,
            message: messageContent
        };

        console.log('[COMMENT-SEND] Sending reply_comment:', { channelId, conversationId, latestCommentId, message: messageContent.substring(0, 50) + '...' });

        // 7. Send API request
        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        }, 1, true);

        const result = await response.json();

        if (!response.ok || result.success === false || result.error) {
            const errorMsg = result.message || result.error?.message || result.error || 'Lỗi gửi comment';
            throw new Error(errorMsg);
        }

        console.log('[COMMENT-SEND] Success for order:', errorOrder.code);

        // Remove from failed orders list (clear watermark in table)
        if (orderId) {
            this.removeFailedOrder(orderId);
        }
        return result;
    }

    /**
     * Open quick comment reply modal for a failed order
     * Called from the "Gửi lại" button in orders table
     * @param {string} orderId - Order ID
     */
    async openQuickCommentReply(orderId) {
        this.log('🔄 Opening quick comment reply for order:', orderId);

        try {
            // Show loading notification
            if (window.notificationManager) {
                window.notificationManager.info('Đang tải thông tin đơn hàng...', 2000);
            }

            // Ensure templates are loaded
            if (!this.templates || this.templates.length === 0) {
                this.log('📋 Templates not loaded yet, fetching from Firestore...');
                const db = window.firebase?.firestore();
                if (db) {
                    const snapshot = await db.collection(this.TEMPLATES_COLLECTION)
                        .where('active', '==', true)
                        .orderBy('order', 'asc')
                        .get();
                    this.templates = snapshot.docs.map(doc => ({ Id: doc.id, ...doc.data() }));
                    this.filteredTemplates = [...this.templates];
                    this.log(`✅ Loaded ${this.templates.length} templates`);
                }
            }

            // Fetch full order data
            const fullOrderData = await this.fetchFullOrderData(orderId);
            const raw = fullOrderData.raw;
            const orderCode = raw.Code || orderId;

            // Check if order has Facebook data for comment reply
            if (!raw.Facebook_CommentId && !raw.Facebook_PostId) {
                if (window.notificationManager) {
                    window.notificationManager.warning(
                        'Đơn này không có thông tin bình luận Facebook',
                        4000,
                        `Đơn: ${orderCode}`
                    );
                }
                return;
            }

            // Create quick template selection modal
            this._showQuickTemplateModal(orderId, orderCode, fullOrderData);

        } catch (error) {
            console.error('[QUICK-COMMENT] Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error(
                    'Lỗi tải thông tin đơn hàng: ' + error.message,
                    4000
                );
            }
        }
    }

    /**
     * Show quick template selection modal
     */
    _showQuickTemplateModal(orderId, orderCode, fullOrderData) {
        // Remove existing modal if any
        const existingModal = document.getElementById('quickCommentModal');
        if (existingModal) existingModal.remove();

        // Get templates
        const templates = this.templates || [];
        const messengerTemplates = templates.filter(t =>
            (t.TypeId || '').toLowerCase().includes('messenger') ||
            (t.Type || '').toLowerCase().includes('messenger')
        );

        const templateOptions = messengerTemplates.length > 0 ? messengerTemplates : templates.slice(0, 10);
        const selectStyle = 'width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:white;';

        const modalHTML = `
            <div id="quickCommentModal" class="message-modal-overlay active" style="z-index: 10002;">
                <div class="message-modal" style="max-width: 540px; width: 92%;">
                    <div class="message-modal-header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 16px 20px;">
                        <h3 style="font-size: 16px;">
                            <i class="fas fa-comment-dots"></i>
                            Gửi lại tin nhắn
                        </h3>
                        <button onclick="document.getElementById('quickCommentModal').remove()" class="message-modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="message-modal-body" style="padding: 20px;">
                        <div style="margin-bottom: 14px; padding: 10px 12px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
                            <div style="font-weight: 600; color: #0369a1;">Đơn hàng: ${orderCode}</div>
                            <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">
                                ${fullOrderData.converted?.customerName || 'N/A'} - ${fullOrderData.converted?.phone || 'N/A'}
                            </div>
                        </div>

                        <!-- Facebook Target Section -->
                        <div style="margin-bottom: 14px; padding: 12px; background: #f0f4ff; border-radius: 8px; border: 1px solid #dbeafe;">
                            <label style="display:block; font-weight:600; margin-bottom:8px; color:#1e40af; font-size:13px;">
                                <i class="fab fa-facebook" style="margin-right:4px;"></i> Chọn bài viết & comment
                            </label>
                            <select id="fbPostSelect" style="${selectStyle} margin-bottom:8px;" disabled>
                                <option value="">Đang tải bài viết...</option>
                            </select>
                            <select id="fbCommentSelect" style="${selectStyle}" disabled>
                                <option value="">Chọn bài viết trước...</option>
                            </select>
                            <div id="fbTargetStatus" style="font-size:11px; color:#6b7280; margin-top:6px;"></div>
                        </div>

                        <label style="display: block; font-weight: 500; margin-bottom: 6px; color: #374151; font-size: 13px;">
                            <i class="fas fa-file-alt"></i> Mẫu tin nhắn:
                        </label>
                        <select id="quickTemplateSelect" style="${selectStyle}">
                            ${templateOptions.map(t => `<option value="${t.Id}">${t.Name}</option>`).join('')}
                        </select>

                        <div id="quickTemplatePreview" style="margin-top: 12px; padding: 10px; background: #f9fafb; border-radius: 8px; font-size: 12px; max-height: 120px; overflow-y: auto; white-space: pre-wrap; color: #4b5563;">
                            ${templateOptions[0]?.Content || 'Chọn mẫu tin nhắn...'}
                        </div>
                    </div>
                    <div class="message-modal-footer" style="padding: 14px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="document.getElementById('quickCommentModal').remove()"
                            style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
                            Hủy
                        </button>
                        <button onclick="window.messageTemplateManager?._executeQuickFacebookSend('${orderId}')"
                            id="quickFbSendBtn"
                            style="padding: 10px 20px; background: linear-gradient(135deg, #1877f2 0%, #0d65d9 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fab fa-facebook-messenger"></i> Gửi qua Facebook
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Template preview logic
        const select = document.getElementById('quickTemplateSelect');
        const preview = document.getElementById('quickTemplatePreview');
        select?.addEventListener('change', () => {
            const selectedTemplate = templateOptions.find(t => t.Id === select.value);
            if (selectedTemplate && preview) {
                preview.textContent = this.replacePlaceholders(selectedTemplate.Content || '', fullOrderData.converted);
            }
        });
        if (select && templateOptions[0]) {
            const initialPreview = this.replacePlaceholders(templateOptions[0].Content || '', fullOrderData.converted);
            if (preview) preview.textContent = initialPreview;
        }

        // Store fullOrderData for send
        this._quickCommentOrderData = fullOrderData;

        // Auto-populate Facebook selectors
        this._loadFacebookTargets(fullOrderData);
    }

    /**
     * Load Facebook posts/live videos and comments into the modal selectors
     */
    async _loadFacebookTargets(fullOrderData) {
        const raw = fullOrderData.raw;
        const customerName = raw.PartnerName || raw.Partner?.Name || '';
        const channelId = raw.Facebook_PostId ? raw.Facebook_PostId.split('_')[0] : '';
        const postSelect = document.getElementById('fbPostSelect');
        const commentSelect = document.getElementById('fbCommentSelect');
        const status = document.getElementById('fbTargetStatus');

        if (!channelId) {
            if (status) status.textContent = 'Không có thông tin Facebook Page';
            return;
        }

        // Get Page Token
        let pageToken = null;
        if (window.cachedChannelsData) {
            const ch = window.cachedChannelsData.find(c =>
                String(c.ChannelId) === String(channelId) || String(c.Facebook_AccountId) === String(channelId)
            );
            if (ch?.Facebook_PageToken) pageToken = ch.Facebook_PageToken;
        }
        if (!pageToken && raw.CRMTeamId) {
            try {
                const crmTeam = await this.fetchCRMTeam(raw.CRMTeamId);
                if (crmTeam?.Facebook_PageToken) pageToken = crmTeam.Facebook_PageToken;
            } catch (e) { /* ignore */ }
        }

        if (!pageToken) {
            if (status) status.textContent = 'Không tìm thấy Page Token';
            return;
        }

        // Store for later use
        this._fbPageToken = pageToken;

        if (status) status.textContent = 'Đang tải bài viết...';

        try {
            // Get REAL Facebook Page ID from token (Pancake channelId may be internal)
            let realPageId = channelId;
            try {
                const meUrl = window.API_CONFIG.buildUrl.facebookGraph('me', pageToken, { fields: 'id,name' });
                const meRes = await fetch(meUrl).then(r => r.json());
                if (meRes.id) {
                    realPageId = meRes.id;
                    this.log('[FB-TARGET] Real Page ID:', realPageId, '| Name:', meRes.name);
                }
            } catch (e) { /* keep channelId as fallback */ }

            this._fbPageId = realPageId;

            // Fetch live videos and feed in parallel using REAL page ID
            const [liveRes, feedRes] = await Promise.all([
                fetch(window.API_CONFIG.buildUrl.facebookGraph(`${realPageId}/live_videos`, pageToken, { fields: 'id,title,created_time', limit: '10' })).then(r => r.json()).catch(() => ({})),
                fetch(window.API_CONFIG.buildUrl.facebookGraph(`${realPageId}/feed`, pageToken, { fields: 'id,message,created_time', limit: '10' })).then(r => r.json()).catch(() => ({})),
            ]);

            const posts = [];

            // Add live videos
            if (liveRes.data) {
                for (const v of liveRes.data) {
                    const date = v.created_time ? new Date(v.created_time).toLocaleDateString('vi-VN') : '';
                    posts.push({ id: v.id, label: `[LIVE] ${v.title || 'Live'} - ${date}`, time: v.created_time, type: 'live' });
                }
            }

            // Add feed posts
            if (feedRes.data) {
                for (const p of feedRes.data) {
                    const date = p.created_time ? new Date(p.created_time).toLocaleDateString('vi-VN') : '';
                    const msg = (p.message || '').substring(0, 40);
                    posts.push({ id: p.id, label: `${msg || 'Bài viết'} - ${date}`, time: p.created_time, type: 'post' });
                }
            }

            // Sort by date (newest first) and deduplicate
            posts.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
            const seen = new Set();
            const uniquePosts = posts.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

            if (postSelect) {
                postSelect.innerHTML = uniquePosts.length > 0
                    ? uniquePosts.map(p => `<option value="${p.id}">${p.label}</option>`).join('')
                    : '<option value="">Không tìm thấy bài viết</option>';
                postSelect.disabled = false;

                // Auto-load comments for the first post
                postSelect.addEventListener('change', () => {
                    this._loadFacebookComments(postSelect.value, pageToken, customerName);
                });

                // Trigger initial load
                if (uniquePosts.length > 0) {
                    this._loadFacebookComments(uniquePosts[0].id, pageToken, customerName);
                }
            }

            if (status) status.textContent = `${uniquePosts.length} bài viết`;
        } catch (err) {
            this.log('[FB-TARGET] Error:', err);
            if (status) status.textContent = 'Lỗi tải bài viết: ' + err.message;
        }
    }

    /**
     * Load comments for a selected post/live video
     */
    async _loadFacebookComments(postId, pageToken, customerName) {
        const commentSelect = document.getElementById('fbCommentSelect');
        const status = document.getElementById('fbTargetStatus');

        if (!commentSelect || !postId) return;

        commentSelect.innerHTML = '<option value="">Đang tải comment...</option>';
        commentSelect.disabled = true;

        try {
            // Try with stream filter first (for live), then without
            let comments = [];
            for (const filter of ['stream', null]) {
                const params = { fields: 'from{id,name},id,message,created_time', limit: '200', order: 'reverse_chronological' };
                if (filter) params.filter = filter;

                const url = window.API_CONFIG.buildUrl.facebookGraph(`${postId}/comments`, pageToken, params);
                const res = await fetch(url).then(r => r.json()).catch(() => ({}));

                if (res.data?.length > 0) {
                    comments = res.data;
                    break;
                }
            }

            if (comments.length === 0) {
                commentSelect.innerHTML = '<option value="">Không có comment</option>';
                if (status) status.textContent = 'Bài viết không có comment';
                return;
            }

            // Build options - show commenter name + message preview
            let autoSelectedValue = '';
            const norm = customerName.trim().toLowerCase();

            commentSelect.innerHTML = comments
                .filter(c => c.from)
                .map(c => {
                    const name = c.from.name || 'Unknown';
                    const msg = (c.message || '').substring(0, 30);
                    const isMatch = name.trim().toLowerCase() === norm;
                    if (isMatch && !autoSelectedValue) autoSelectedValue = c.id;
                    return `<option value="${c.id}" ${isMatch ? 'selected' : ''}>${name}: ${msg}${isMatch ? ' ✓' : ''}</option>`;
                })
                .join('');

            commentSelect.disabled = false;

            const matchCount = comments.filter(c => c.from?.name?.trim().toLowerCase() === norm).length;
            if (status) {
                status.innerHTML = matchCount > 0
                    ? `<span style="color:#059669;">✓ Tìm thấy comment của ${customerName}</span>`
                    : `<span style="color:#d97706;">⚠ ${comments.length} comment, chưa tìm thấy "${customerName}"</span>`;
            }
        } catch (err) {
            commentSelect.innerHTML = '<option value="">Lỗi tải comment</option>';
            if (status) status.textContent = 'Lỗi: ' + err.message;
        }
    }

    /**
     * Execute quick send via Facebook Graph API (POST_PURCHASE_UPDATE tag)
     */
    async _executeQuickFacebookSend(orderId) {
        const select = document.getElementById('quickTemplateSelect');
        const sendBtn = document.getElementById('quickFbSendBtn');

        if (!select || !this._quickCommentOrderData) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi: Thiếu dữ liệu', 3000);
            }
            return;
        }

        const selectedTemplate = (this.templates || []).find(t => t.Id === select.value);
        if (!selectedTemplate) {
            if (window.notificationManager) {
                window.notificationManager.error('Vui lòng chọn mẫu tin nhắn', 3000);
            }
            return;
        }

        // Disable button and show loading
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        }

        try {
            const raw = this._quickCommentOrderData.raw;
            const channelId = raw.Facebook_PostId ? raw.Facebook_PostId.split('_')[0] : '';
            const psid = raw.Facebook_ASUserId || '';

            if (!channelId || !psid) {
                throw new Error('Thiếu thông tin Facebook (PageId hoặc PSID)');
            }

            // Replace placeholders in template
            const messageContent = this.replacePlaceholders(selectedTemplate.Content || '', this._quickCommentOrderData.converted);

            // Check if user selected a comment from dropdown
            const selectedCommentId = document.getElementById('fbCommentSelect')?.value;
            const pageToken = this._fbPageToken;

            let result;

            if (selectedCommentId && selectedCommentId !== '' && pageToken) {
                // DIRECT PRIVATE REPLY: Use selected comment ID
                this.log('[QUICK-FB-SEND] Direct Private Reply with commentId:', selectedCommentId);

                const sendUrl = window.API_CONFIG.buildUrl.facebookSend();
                const resp = await fetch(sendUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commentId: selectedCommentId,
                        message: messageContent,
                        pageToken: pageToken,
                        pageId: this._fbPageId || channelId,
                    }),
                });
                result = await resp.json();
            } else {
                // FALLBACK: Send API → auto Private Reply lookup
                const facebookPostId = raw.Facebook_PostId || '';
                this.log('[QUICK-FB-SEND] Fallback mode, Facebook_PostId:', facebookPostId);
                result = await this._sendViaFacebookAPI(channelId, psid, messageContent, raw, facebookPostId);
            }

            if (result.success) {
                this.log('[QUICK-FB-SEND] ✅ Message sent! Method:', result.method || 'send_api');
            } else {
                // Log diagnostics for debugging
                if (result._debug) {
                    console.group('[QUICK-FB-SEND] 🔍 Private Reply Debug');
                    console.log('PostId:', result._debug.postId);
                    console.log('PSID:', result._debug.psid);
                    console.log('Customer:', result._debug.customerName);
                    console.table(result._debug.queries);
                    if (result._debug.commentersFound?.length > 0) {
                        console.log('Commenters found on post:');
                        console.table(result._debug.commentersFound);
                    }
                    console.groupEnd();
                }
                throw new Error(result.error || 'Gửi tin nhắn thất bại');
            }

            // Close modal
            document.getElementById('quickCommentModal')?.remove();

            // Remove from failed orders
            this.removeFailedOrder(orderId);

            if (window.notificationManager) {
                window.notificationManager.success(
                    'Đã gửi tin nhắn thành công!',
                    3000,
                    `Đơn: ${raw.Code || orderId}`
                );
            }

        } catch (error) {
            console.error('[QUICK-FB-SEND] Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error(
                    'Lỗi gửi tin nhắn: ' + error.message,
                    5000
                );
            }

            // Re-enable button
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi qua Facebook';
            }
        }
    }

    /**
     * Execute quick comment send
     */
    async _executeQuickCommentSend(orderId) {
        const select = document.getElementById('quickTemplateSelect');
        const sendBtn = document.getElementById('quickSendBtn');

        if (!select || !this._quickCommentOrderData) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi: Thiếu dữ liệu', 3000);
            }
            return;
        }

        const selectedTemplate = (this.templates || []).find(t => t.Id === select.value);
        if (!selectedTemplate) {
            if (window.notificationManager) {
                window.notificationManager.error('Vui lòng chọn mẫu tin nhắn', 3000);
            }
            return;
        }

        // Disable button and show loading
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        }

        try {
            // Create error order object for _sendOrderViaCommentReply
            const errorOrder = {
                orderId: orderId,
                code: this._quickCommentOrderData.raw?.Code || orderId
            };

            await this._sendOrderViaCommentReply(errorOrder, selectedTemplate.Content);

            // Close modal
            document.getElementById('quickCommentModal')?.remove();

            if (window.notificationManager) {
                window.notificationManager.success(
                    'Đã gửi tin nhắn qua comment thành công!',
                    3000,
                    `Đơn: ${errorOrder.code}`
                );
            }

        } catch (error) {
            console.error('[QUICK-COMMENT] Send error:', error);
            if (window.notificationManager) {
                window.notificationManager.error(
                    'Lỗi gửi comment: ' + error.message,
                    5000
                );
            }

            // Re-enable button
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi qua Comment';
            }
        }
    }
}

// =====================================================
// INITIALIZE
// =====================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessageTemplateManager);
} else {
    initMessageTemplateManager();
}

function initMessageTemplateManager() {
    console.log('%c🚀 MESSAGE TEMPLATE MANAGER - IMPROVED VERSION', 'background: #10b981; color: white; padding: 8px; font-weight: bold;');
    const messageTemplateManager = new MessageTemplateManager();
    window.messageTemplateManager = messageTemplateManager;
    console.log('✅ MessageTemplateManager initialized and ready');
    console.log('📊 Debug mode:', messageTemplateManager.DEBUG_MODE);
    console.log('');
}

function openMessageTemplateModal(orderData = null) {
    if (window.messageTemplateManager) {
        window.messageTemplateManager.openModal(orderData);
    } else {
        console.error('❌ MessageTemplateManager not initialized');
        if (window.notificationManager) {
            window.notificationManager.error('Hệ thống chưa sẵn sàng, vui lòng thử lại');
        }
    }
}

window.openMessageTemplateModal = openMessageTemplateModal;
