// =====================================================
// MESSAGE TEMPLATE MANAGER - IMPROVED VERSION WITH DEBUG
// =====================================================

class MessageTemplateManager {
    constructor() {
        this.templates = [];
        this.filteredTemplates = [];
        this.selectedTemplate = null;
        this.isLoading = false;
        this.API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/MailTemplate?$filter=(Active+eq+true)';
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
        this.init();
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

                    <!-- Footer -->
                    <div class="message-modal-footer">
                        <div class="message-result-count" id="messageResultCount">
                            <strong>0</strong> template
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                            <!-- Thread Input -->
                            <div style="display: flex; align-items: center; gap: 6px;" title="Số nhân viên gửi đồng thời (Max 5)">
                                <i class="fas fa-users" style="color: #6b7280;"></i>
                                <input type="number" id="messageThreadCount" value="1" min="1" max="5" onkeydown="return false" style="width: 50px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px;">
                                <span style="font-size: 13px; color: #6b7280;">người</span>
                            </div>

                            <!-- Delay Input -->
                            <div style="display: flex; align-items: center; gap: 6px;" title="Thời gian nghỉ giữa các tin nhắn (giây)">
                                <i class="fas fa-clock" style="color: #6b7280;"></i>
                                <input type="number" id="messageSendDelay" value="1" min="0" step="0.5" onkeydown="return false" style="width: 50px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px;">
                                <span style="font-size: 13px; color: #6b7280;">s</span>
                            </div>

                            <!-- Send Mode Toggle -->
                            <div style="display: flex; gap: 15px; align-items: center;">
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px;">
                                    <input type="radio" name="sendMode" value="text" checked id="sendModeText" style="cursor: pointer;">
                                    <i class="fas fa-align-left" style="color: #6366f1;"></i>
                                    <span>Gửi text</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px;">
                                    <input type="radio" name="sendMode" value="image" id="sendModeImage" style="cursor: pointer;">
                                    <i class="fas fa-image" style="color: #ec4899;"></i>
                                    <span>Gửi ảnh</span>
                                </label>
                            </div>
                        </div>

                        <!-- API Mode Toggle (T-Page / Pancake) -->
                        <div style="display: flex; gap: 15px; align-items: center; padding: 8px 12px; background: #f3f4f6; border-radius: 8px;">
                            <span style="font-size: 13px; color: #6b7280; font-weight: 500;">API:</span>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px;">
                                <input type="radio" name="apiMode" value="tpage" checked id="apiModeTPage" style="cursor: pointer;">
                                <i class="fas fa-rocket" style="color: #10b981;"></i>
                                <span>T-Page</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px;">
                                <input type="radio" name="apiMode" value="pancake" id="apiModePancake" style="cursor: pointer;">
                                <i class="fab fa-facebook-messenger" style="color: #6366f1;"></i>
                                <span>Pancake</span>
                            </label>
                        </div>

                        <div style="display: flex; gap: 10px; align-items: center;">
                            <div id="messageProgressContainer" style="display: none; flex: 1; min-width: 200px; margin-right: 10px;">
                                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; color: #6b7280;">
                                    <span id="messageProgressText">Đang gửi...</span>
                                    <span id="messageProgressPercent">0%</span>
                                </div>
                                <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
                                    <div id="messageProgressBar" style="width: 0%; height: 100%; background: #10b981; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            <button class="message-btn-cancel" id="messageBtnCancel">Hủy</button>
                            <button class="message-btn-send" id="messageBtnSend">
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
    }

    isModalOpen() {
        return document.getElementById('messageTemplateModal')?.classList.contains('active');
    }

    async loadTemplates() {
        this.log('');
        this.log('='.repeat(60));
        this.log('🔄 LOADING TEMPLATES FROM API');
        this.log('='.repeat(60));

        this.isLoading = true;
        const bodyEl = document.getElementById('messageModalBody');

        // Show loading
        bodyEl.innerHTML = `
            <div class="message-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải danh sách template từ API...</p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
                    Check Network tab để xem request
                </p>
            </div>
        `;

        try {
            this.log('🌐 API URL:', this.API_URL);
            this.log('🔑 TokenManager:', window.tokenManager ? 'Available' : 'NOT FOUND');

            let response;
            let fetchMethod = 'unknown';

            if (window.tokenManager && typeof window.tokenManager.authenticatedFetch === 'function') {
                this.log('✅ Using TokenManager.authenticatedFetch()');
                fetchMethod = 'TokenManager';

                try {
                    this.log('📡 Calling API with Bearer token...');
                    response = await window.tokenManager.authenticatedFetch(this.API_URL, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    this.log('📥 Response received:', response.status, response.statusText);
                } catch (tokenError) {
                    this.log('❌ TokenManager error:', tokenError);
                    throw new Error(`Token authentication failed: ${tokenError.message}`);
                }
            } else {
                this.log('⚠️ TokenManager not available');
                this.log('⚠️ Trying direct fetch (will likely fail due to CORS/Auth)...');
                fetchMethod = 'Direct Fetch';

                response = await fetch(this.API_URL, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                this.log('📥 Response received:', response.status, response.statusText);
            }

            this.log('📊 Response status:', response.status);
            this.log('📊 Response ok:', response.ok);
            this.log('📊 Fetch method used:', fetchMethod);

            if (!response.ok) {
                const errorText = await response.text();
                this.log('❌ Response error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            this.log('📄 Parsing JSON response...');
            const data = await response.json();

            this.log('📊 Response data structure:');
            this.log('  - @odata.context:', data['@odata.context'] ? 'Present' : 'Missing');
            this.log('  - value:', Array.isArray(data.value) ? `Array[${data.value.length}]` : typeof data.value);

            if (!data.value || !Array.isArray(data.value)) {
                this.log('❌ Invalid data structure');
                this.log('   Expected: { value: [...] }');
                this.log('   Received:', typeof data);
                throw new Error('Invalid API response: expected data.value array');
            }

            // Filter to only include Messenger templates
            const allTemplates = data.value;
            this.templates = allTemplates.filter(t => {
                const typeId = (t.TypeId || '').toLowerCase();
                return typeId.includes('messenger');
            });
            this.filteredTemplates = [...this.templates];

            this.log('📊 Total templates from API:', allTemplates.length);
            this.log('📊 Messenger templates only:', this.templates.length);

            this.log('');
            this.log('✅ SUCCESS! Templates loaded:');
            this.log('  - Total templates:', this.templates.length);

            if (this.templates.length > 0) {
                this.log('  - Sample template names:');
                this.templates.slice(0, 3).forEach((t, i) => {
                    this.log(`    ${i + 1}. ${t.Name} (${t.TypeId})`);
                });
            }

            this.log('='.repeat(60));
            this.log('');

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Đã tải ${this.templates.length} template từ API`,
                    2000
                );
            }

            // Render templates
            this.renderTemplates();

        } catch (error) {
            this.log('');
            this.log('❌ ERROR LOADING TEMPLATES');
            this.log('='.repeat(60));
            this.log('Error type:', error.name);
            this.log('Error message:', error.message);
            this.log('Error stack:', error.stack);
            this.log('='.repeat(60));
            this.log('');

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
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: left;">
                        <p style="font-size: 13px; color: #991b1b; margin: 0;">
                            <strong>Có thể do:</strong><br>
                            • TokenManager chưa được khởi tạo<br>
                            • Token hết hạn (refresh trang)<br>
                            • API không phản hồi<br>
                            • Lỗi network/CORS
                        </p>
                    </div>
                    <button 
                        onclick="messageTemplateManager.loadTemplates()" 
                        style="
                            padding: 10px 20px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 500;
                        "
                    >
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;

            // Show error notification
            if (window.notificationManager) {
                window.notificationManager.error(
                    `Lỗi tải template: ${error.message}`,
                    5000
                );
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
                </div>
            `;
            return;
        }

        const templatesHTML = templates.map(template => {
            // CHỈ LẤY BodyPlain, không lấy BodyHtml
            const content = template.BodyPlain || 'Không có nội dung';
            const date = new Date(template.DateCreated).toLocaleDateString('vi-VN');

            // Convert \n thành <br> để giữ line breaks
            const contentWithBreaks = this.escapeHtml(content).replace(/\n/g, '<br>');

            // Kiểm tra nếu content dài (nhiều hơn 8 dòng ~ 200 chars)
            // để hiển thị nút "Xem thêm"
            const needsExpand = content.length > 200;

            return `
                <div class="message-template-item ${this.selectedTemplate?.Id === template.Id ? 'selected' : ''}" 
                     data-template-id="${template.Id}"
                     onclick="messageTemplateManager.selectTemplate(${template.Id})">
                    <div class="message-template-header">
                        <div class="message-template-name">
                            ${this.escapeHtml(template.Name)}
                        </div>
                        <span class="message-template-type ${this.getTypeClass(template.TypeId)}">
                            ${template.TypeId}
                        </span>
                    </div>
                    <div class="message-template-content" data-full-content="${this.escapeHtml(content)}">
                        ${contentWithBreaks}
                    </div>
                    <div class="message-template-actions">
                        ${needsExpand ? `
                            <button class="message-expand-btn" onclick="event.stopPropagation(); messageTemplateManager.toggleExpand(${template.Id})">
                                <i class="fas fa-chevron-down"></i>
                                <span class="expand-text">Xem thêm</span>
                            </button>
                        ` : '<div></div>'}
                        <div class="message-template-meta">
                            <span>
                                <i class="fas fa-calendar"></i>
                                ${date}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = `<div class="message-template-list">${templatesHTML}</div>`;
        this.log('✅ Templates rendered to DOM');
    }

    selectTemplate(templateId) {
        const template = this.templates.find(t => t.Id === templateId);
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
                const content = (template.BodyPlain || '').toLowerCase();
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

        // Get concurrency
        const threadInput = document.getElementById('messageThreadCount');
        let concurrency = threadInput ? parseInt(threadInput.value) || 1 : 1;
        if (concurrency > 5) concurrency = 5;
        if (concurrency < 1) concurrency = 1;

        this.log('📮 Send mode:', sendMode, '| Delay:', delay, 'ms | Threads:', concurrency);

        // SEND MODE - send via Pancake API
        try {
            const ordersCount = this.selectedOrders.length;
            this.log('📤 Sending message to', ordersCount, 'order(s) via Pancake API (Parallel Mode)');

            // Get Pancake token first (ONE TIME)
            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                throw new Error('Không tìm thấy Pancake token. Vui lòng cài đặt token trong Settings.');
            }

            // Get employee signature (ONE TIME)
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;

            // Get template content (ONE TIME)
            const templateContent = this.selectedTemplate.BodyPlain || 'Không có nội dung';

            // Initialize State
            this.sendingState = {
                isRunning: true,
                total: ordersCount,
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
                sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang gửi...`;
            }

            // Context object to pass to workers
            const context = {
                token,
                displayName,
                templateContent,
                sendMode
            };

            // Concurrency Control
            const CONCURRENCY_LIMIT = concurrency; // User defined limit
            const queue = [...this.selectedOrders];
            const total = queue.length;
            // Worker Function
            const worker = async () => {
                while (queue.length > 0) {
                    const order = queue.shift();
                    try {
                        // Delay before processing
                        if (delay > 0) {
                            await new Promise(r => setTimeout(r, delay));
                        }

                        await this._processSingleOrder(order, context);
                        this.sendingState.success++;
                        this.log(`✅ Sent successfully to order ${order.code || order.Id}`);
                    } catch (err) {
                        this.sendingState.error++;

                        // Track 24-hour policy errors and user unavailable errors specially
                        const errorInfo = { order: order.code || order.Id, error: err.message };
                        if (err.is24HourError) {
                            errorInfo.is24HourError = true;
                            errorInfo.error = 'Đã quá 24h - Vui lòng dùng COMMENT';
                        } else if (err.isUserUnavailable) {
                            errorInfo.isUserUnavailable = true;
                            errorInfo.error = 'Người dùng không có mặt (551) - Vui lòng dùng COMMENT';
                        }
                        this.sendingState.errors.push(errorInfo);

                        this.log(`❌ Error sending to order ${order.code}:`, err);
                    } finally {
                        this.sendingState.completed++;
                        this.updateProgressUI();
                    }
                }
            };

            // Start Workers
            const workers = [];
            for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, ordersCount); i++) {
                workers.push(worker());
            }

            // Wait for all workers to finish
            await Promise.all(workers);

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

            if (window.notificationManager) {
                if (this.sendingState.success > 0) {
                    window.notificationManager.success(
                        `Đã gửi thành công ${this.sendingState.success}/${ordersCount} tin nhắn!`,
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
            const templateContent = this.selectedTemplate.BodyPlain || '';
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
                            total: (detail.Quantity || 0) * (detail.Price || 0)
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
                    imageUrl: detail.ImageUrl || ''
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
        const customerId = fullOrderData.raw.PartnerId;

        if (!channelId || !psid) {
            throw new Error(`Thiếu thông tin channelId hoặc PSID. Order: ${order.code}`);
        }

        if (!customerId) {
            throw new Error(`Thiếu thông tin PartnerId (customer_id). Order: ${order.code}`);
        }

        // Get conversation from Pancake to get correct conversationId
        // First try to get from cache, if not found, construct from channelId_psid
        let conversationId;
        const conversation = window.pancakeDataManager?.getConversationByUserId(psid);

        if (conversation && conversation.id) {
            conversationId = conversation.id;
            this.log(`📌 Found conversation in cache: ${conversationId}`);
        } else {
            // Fallback: construct conversationId from channelId_psid (standard format)
            conversationId = `${channelId}_${psid}`;
            this.log(`⚠️ Conversation not in cache, using fallback: ${conversationId}`);
        }

        // Get page_access_token for Official API (pages.fm)
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId);
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

                // Try Facebook API fallback
                const fbFallbackResult = await this._sendViaFacebookAPI(channelId, psid, messageContent, fullOrderData.raw);

                if (fbFallbackResult.success) {
                    this.log(`✅ Facebook API fallback succeeded for order ${order.code}`);
                    return true; // Success via Facebook API
                }

                // Facebook API also failed, throw original error
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

                // Try Facebook API fallback
                const fbFallbackResult = await this._sendViaFacebookAPI(channelId, psid, messageContent, fullOrderData.raw);

                if (fbFallbackResult.success) {
                    this.log(`✅ Facebook API fallback succeeded for order ${order.code}`);
                    return true; // Success via Facebook API
                }

                // Facebook API also failed, throw original error
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
     * Send message via Facebook Graph API with POST_PURCHASE_UPDATE tag
     * Used as fallback when Pancake API fails with 551 error
     */
    async _sendViaFacebookAPI(pageId, psid, message, orderRaw) {
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
                useTag: true // Use POST_PURCHASE_UPDATE tag
            };

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
                this.log('[FB-FALLBACK] ✅ Message sent successfully via Facebook Graph API!');
                return {
                    success: true,
                    messageId: result.message_id
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Facebook API error'
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
                        total: (detail.Quantity || 0) * (detail.Price || 0)
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

        // Replace order details (products) - bao gồm Tổng tiền
        if (orderData.products && Array.isArray(orderData.products) && orderData.products.length > 0) {
            const productList = orderData.products
                .map(p => `- ${p.name} x${p.quantity} = ${this.formatCurrency(p.total)}`)
                .join('\n');
            // Thêm Tổng tiền vào cuối danh sách sản phẩm
            const totalAmount = orderData.totalAmount ? this.formatCurrency(orderData.totalAmount) : '0đ';
            const productListWithTotal = `${productList}\n\nTổng tiền: ${totalAmount}`;
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
        let content = this.selectedTemplate.BodyPlain || '';

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
                    // Keep raw data for getChatInfoForOrder
                    raw: fullOrder
                });
                this.log('  - Found full order:', fullOrder.Code);
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

    openNewTemplateForm() {
        if (window.notificationManager) {
            window.notificationManager.info(
                'Chức năng tạo template mới đang được phát triển',
                3000
            );
        }
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
