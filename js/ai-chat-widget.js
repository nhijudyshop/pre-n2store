/* =====================================================
   AI CHAT WIDGET - Global Floating Chat
   Appears on all pages via navigation-modern.js
   ===================================================== */

(function () {
    'use strict';

    // =========================================================
    // CONFIGURATION
    // =========================================================

    const CONFIG = {
        GEMINI_PROXY_URL: 'https://n2store-fallback.onrender.com/api/gemini/chat',
        DEEPSEEK_PROXY_URL: 'https://n2store-fallback.onrender.com/api/deepseek/chat',
        DEFAULT_MODEL: 'gemini-3-flash-preview',
        STORAGE_KEY: 'ai_widget_selected_model'
    };

    // Model options with rate limits
    const MODELS = [
        // Gemini 3 (Preview)
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', rpm: '1K', tpm: '1M', rpd: '10K', provider: 'gemini' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', rpm: '25', tpm: '1M', rpd: '250', provider: 'gemini' },
        // Gemini 2.5
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', rpm: '1K', tpm: '1M', rpd: '10K', provider: 'gemini' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', rpm: '150', tpm: '2M', rpd: '10K', provider: 'gemini' },
        // Gemini 2.0
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', rpm: '1K', tpm: '4M', rpd: 'Unlimited', provider: 'gemini' },
        // DeepSeek
        { value: 'deepseek-chat', label: 'DeepSeek Chat', rpm: '60', tpm: '1M', rpd: 'Unlimited', provider: 'deepseek' },
        { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner', rpm: '60', tpm: '1M', rpd: 'Unlimited', provider: 'deepseek' }
    ];

    // =========================================================
    // STATE
    // =========================================================

    let isOpen = false;
    let currentModel = localStorage.getItem(CONFIG.STORAGE_KEY) || CONFIG.DEFAULT_MODEL;
    let conversationHistory = [];
    let pendingAttachments = [];

    // =========================================================
    // PAGE CONTEXT DETECTION
    // =========================================================

    /**
     * Detect current page type based on URL and DOM
     */
    function detectPageType() {
        const path = window.location.pathname;
        const url = window.location.href;

        if (path.includes('order-management') || path.includes('order-list') || url.includes('hangdat')) {
            return 'order';
        }
        if (path.includes('sanphamlive') || path.includes('product') || path.includes('soluong-live')) {
            return 'product';
        }
        if (path.includes('customer-management')) {
            return 'customer';
        }
        if (path.includes('inventory') || path.includes('bangkiemhang')) {
            return 'inventory';
        }
        if (path.includes('livestream') || path.includes('live')) {
            return 'livestream';
        }
        if (path.includes('orders-report')) {
            return 'report';
        }
        if (path === '/' || path.includes('index.html')) {
            return 'dashboard';
        }
        return 'general';
    }

    /**
     * Extract product data from page
     */
    function extractProductData() {
        const data = {
            products: [],
            totalCount: 0
        };

        try {
            // Try to get from table rows
            const rows = document.querySelectorAll('table tbody tr, .product-item, .product-row');
            data.totalCount = rows.length;

            // Extract first few products as sample
            rows.forEach((row, index) => {
                if (index < 5) { // Only first 5 products
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 0) {
                        data.products.push({
                            name: cells[0]?.textContent?.trim() || cells[1]?.textContent?.trim(),
                            info: Array.from(cells).slice(0, 4).map(c => c.textContent?.trim()).join(' | ')
                        });
                    }
                }
            });

            // Try to get selected product if any
            const selectedRow = document.querySelector('tr.selected, .product-item.active');
            if (selectedRow) {
                data.selectedProduct = selectedRow.textContent?.trim();
            }
        } catch (e) {
            console.warn('[Context] Failed to extract product data:', e);
        }

        return data;
    }

    /**
     * Extract order data from page
     */
    function extractOrderData() {
        const data = {
            orders: [],
            totalCount: 0,
            stats: {}
        };

        try {
            const rows = document.querySelectorAll('table tbody tr, .order-item, .order-row');
            data.totalCount = rows.length;

            // Extract stats if available
            const statElements = document.querySelectorAll('.stat-card, .summary-card, .metric');
            statElements.forEach(el => {
                const label = el.querySelector('.label, .stat-label')?.textContent?.trim();
                const value = el.querySelector('.value, .stat-value')?.textContent?.trim();
                if (label && value) {
                    data.stats[label] = value;
                }
            });

            // Sample orders
            rows.forEach((row, index) => {
                if (index < 3) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 0) {
                        data.orders.push({
                            info: Array.from(cells).slice(0, 3).map(c => c.textContent?.trim()).join(' | ')
                        });
                    }
                }
            });
        } catch (e) {
            console.warn('[Context] Failed to extract order data:', e);
        }

        return data;
    }

    /**
     * Extract customer data from page
     */
    function extractCustomerData() {
        const data = {
            totalCount: 0,
            customers: []
        };

        try {
            const rows = document.querySelectorAll('table tbody tr, .customer-item');
            data.totalCount = rows.length;

            rows.forEach((row, index) => {
                if (index < 3) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 0) {
                        data.customers.push({
                            info: Array.from(cells).slice(0, 3).map(c => c.textContent?.trim()).join(' | ')
                        });
                    }
                }
            });
        } catch (e) {
            console.warn('[Context] Failed to extract customer data:', e);
        }

        return data;
    }

    /**
     * Extract general page data (stats, filters, search terms, etc.)
     */
    function extractGeneralPageData() {
        const data = {
            filters: {},
            search: '',
            user: {}
        };

        try {
            // Get search input value
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="Tìm"], input[name*="search"]');
            if (searchInput) {
                data.search = searchInput.value?.trim();
            }

            // Get active filters
            const filterSelects = document.querySelectorAll('select, .filter-select');
            filterSelects.forEach(select => {
                if (select.value && select.value !== '' && select.value !== 'all') {
                    const label = select.previousElementSibling?.textContent || select.getAttribute('name') || 'filter';
                    data.filters[label] = select.options[select.selectedIndex]?.text || select.value;
                }
            });

            // Try to get user info from localStorage or global
            if (window.currentUser) {
                data.user = {
                    name: window.currentUser.name || window.currentUser.username,
                    role: window.currentUser.role
                };
            } else if (localStorage.getItem('user')) {
                try {
                    const user = JSON.parse(localStorage.getItem('user'));
                    data.user = {
                        name: user.name || user.username,
                        role: user.role
                    };
                } catch (e) {}
            }

            // Get page heading/title
            const heading = document.querySelector('h1, h2, .page-title, .header-title');
            if (heading) {
                data.pageHeading = heading.textContent?.trim();
            }
        } catch (e) {
            console.warn('[Context] Failed to extract general data:', e);
        }

        return data;
    }

    /**
     * Get complete page context to send to AI
     */
    function getPageContext() {
        const pageType = detectPageType();
        const generalData = extractGeneralPageData();

        const context = {
            pageType,
            url: window.location.href,
            pathname: window.location.pathname,
            title: document.title,
            ...generalData
        };

        // Add page-specific data
        switch (pageType) {
            case 'product':
                context.productData = extractProductData();
                break;
            case 'order':
                context.orderData = extractOrderData();
                break;
            case 'customer':
                context.customerData = extractCustomerData();
                break;
        }

        return context;
    }

    /**
     * Format context into readable text for AI
     */
    function formatContextForAI(context) {
        let text = `[CONTEXT - Trang hiện tại]\n`;
        text += `- Loại trang: ${context.pageType}\n`;
        text += `- Tiêu đề: ${context.title}\n`;

        if (context.pageHeading) {
            text += `- Heading: ${context.pageHeading}\n`;
        }

        if (context.user?.name) {
            text += `- User: ${context.user.name}${context.user.role ? ' (' + context.user.role + ')' : ''}\n`;
        }

        if (context.search) {
            text += `- Đang tìm kiếm: "${context.search}"\n`;
        }

        if (Object.keys(context.filters).length > 0) {
            text += `- Filters đang áp dụng: ${JSON.stringify(context.filters)}\n`;
        }

        // Add page-specific context
        if (context.productData) {
            text += `\n[Sản phẩm]\n`;
            text += `- Tổng số: ${context.productData.totalCount}\n`;
            if (context.productData.selectedProduct) {
                text += `- Đang chọn: ${context.productData.selectedProduct}\n`;
            }
            if (context.productData.products.length > 0) {
                text += `- Một số sản phẩm trên trang:\n`;
                context.productData.products.forEach((p, i) => {
                    text += `  ${i + 1}. ${p.name || p.info}\n`;
                });
            }
        }

        if (context.orderData) {
            text += `\n[Đơn hàng]\n`;
            text += `- Tổng số: ${context.orderData.totalCount}\n`;
            if (Object.keys(context.orderData.stats).length > 0) {
                text += `- Thống kê: ${JSON.stringify(context.orderData.stats)}\n`;
            }
        }

        if (context.customerData) {
            text += `\n[Khách hàng]\n`;
            text += `- Tổng số: ${context.customerData.totalCount}\n`;
        }

        return text;
    }

    // =========================================================
    // CSS STYLES
    // =========================================================

    const WIDGET_STYLES = `
        /* AI Chat Widget Styles */
        .ai-chat-fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
            z-index: 9998;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .ai-chat-fab:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
        }

        .ai-chat-fab i {
            width: 24px;
            height: 24px;
            color: white;
        }

        .ai-chat-fab.open {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        /* Chat Window */
        .ai-chat-window {
            position: fixed;
            bottom: 90px;
            right: 24px;
            width: 380px;
            height: 520px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }

        .ai-chat-window.open {
            display: flex;
        }

        /* Header */
        .ai-chat-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .ai-chat-header-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
        }

        .ai-chat-header-title i {
            width: 20px;
            height: 20px;
        }

        .ai-chat-close {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
        }

        .ai-chat-close:hover {
            background: rgba(255,255,255,0.2);
        }

        .ai-chat-close i {
            width: 18px;
            height: 18px;
        }

        /* Model Selector */
        .ai-chat-model-bar {
            padding: 8px 12px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .ai-chat-model-select {
            flex: 1;
            padding: 6px 10px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            font-size: 12px;
            background: white;
            cursor: pointer;
        }

        .ai-chat-rate-info {
            font-size: 10px;
            color: #64748b;
            white-space: nowrap;
        }

        /* Messages Container */
        .ai-chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .ai-chat-message {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 16px;
            font-size: 14px;
            line-height: 1.5;
        }

        .ai-chat-message.user {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }

        .ai-chat-message.ai {
            background: #f1f5f9;
            color: #334155;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }

        .ai-chat-message.ai pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 8px 12px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 12px;
            margin: 8px 0;
        }

        .ai-chat-message.ai code {
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }

        .ai-chat-message.ai pre code {
            background: none;
            padding: 0;
        }

        /* Welcome Message */
        .ai-chat-welcome {
            text-align: center;
            padding: 40px 20px;
            color: #64748b;
        }

        .ai-chat-welcome i {
            width: 48px;
            height: 48px;
            color: #667eea;
            margin-bottom: 12px;
        }

        .ai-chat-welcome h3 {
            margin: 0 0 8px;
            color: #334155;
            font-size: 16px;
        }

        .ai-chat-welcome p {
            margin: 0;
            font-size: 13px;
        }

        /* Loading */
        .ai-chat-loading {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: #f1f5f9;
            border-radius: 16px;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }

        .ai-chat-typing-dots {
            display: flex;
            gap: 4px;
        }

        .ai-chat-typing-dot {
            width: 6px;
            height: 6px;
            background: #667eea;
            border-radius: 50%;
            animation: aiChatPulse 1.4s ease-in-out infinite;
        }

        .ai-chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .ai-chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes aiChatPulse {
            0%, 100% { transform: scale(1); opacity: 0.4; }
            50% { transform: scale(1.2); opacity: 1; }
        }

        /* Attachment Preview */
        .ai-chat-attachments {
            display: none;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 12px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
        }

        .ai-chat-attachments.has-files {
            display: flex;
        }

        .ai-chat-attachment-item {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 11px;
        }

        .ai-chat-attachment-item img {
            width: 24px;
            height: 24px;
            object-fit: cover;
            border-radius: 4px;
        }

        .ai-chat-attachment-remove {
            background: #ef4444;
            color: white;
            border: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            font-size: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Input Area */
        .ai-chat-input-area {
            padding: 12px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        .ai-chat-attach-btn {
            background: none;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #64748b;
            transition: all 0.2s;
        }

        .ai-chat-attach-btn:hover {
            background: #f1f5f9;
            color: #667eea;
            border-color: #667eea;
        }

        .ai-chat-attach-btn i {
            width: 18px;
            height: 18px;
        }

        .ai-chat-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            resize: none;
            font-family: inherit;
            font-size: 14px;
            max-height: 100px;
            outline: none;
            transition: border-color 0.2s;
        }

        .ai-chat-input:focus {
            border-color: #667eea;
        }

        .ai-chat-send-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            transition: transform 0.2s;
        }

        .ai-chat-send-btn:hover {
            transform: scale(1.05);
        }

        .ai-chat-send-btn i {
            width: 18px;
            height: 18px;
        }

        /* Message Attachments */
        .ai-chat-msg-attachments {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 8px;
        }

        .ai-chat-msg-attachments img {
            max-width: 150px;
            max-height: 100px;
            border-radius: 8px;
        }

        /* Mobile Responsive */
        @media (max-width: 480px) {
            .ai-chat-fab {
                bottom: 80px;
                right: 16px;
                width: 50px;
                height: 50px;
            }

            .ai-chat-window {
                bottom: 0;
                right: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border-radius: 0;
            }
        }
    `;

    // =========================================================
    // HTML TEMPLATE
    // =========================================================

    function getWidgetHTML() {
        const modelOptions = MODELS.map(m =>
            `<option value="${m.value}" data-provider="${m.provider}" data-rpm="${m.rpm}" data-tpm="${m.tpm}" data-rpd="${m.rpd}">${m.label}</option>`
        ).join('');

        return `
            <button class="ai-chat-fab" id="aiChatFab" title="Trợ lý AI">
                <i data-lucide="message-circle"></i>
            </button>

            <div class="ai-chat-window" id="aiChatWindow">
                <div class="ai-chat-header">
                    <div class="ai-chat-header-title">
                        <i data-lucide="bot"></i>
                        <span>AI Assistant</span>
                    </div>
                    <button class="ai-chat-close" id="aiChatClose">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="ai-chat-model-bar">
                    <select class="ai-chat-model-select" id="aiChatModelSelect">
                        ${modelOptions}
                    </select>
                    <span class="ai-chat-rate-info" id="aiChatRateInfo">RPM: 1K</span>
                </div>

                <div class="ai-chat-messages" id="aiChatMessages">
                    <div class="ai-chat-welcome">
                        <i data-lucide="sparkles"></i>
                        <h3>Xin chào!</h3>
                        <p>Tôi là AI Assistant. Hỏi tôi bất cứ điều gì.</p>
                    </div>
                </div>

                <div class="ai-chat-attachments" id="aiChatAttachments"></div>

                <div class="ai-chat-input-area">
                    <input type="file" id="aiChatFileInput" multiple accept="image/*,video/*,audio/*,.pdf" style="display:none">
                    <button class="ai-chat-attach-btn" id="aiChatAttachBtn" title="Đính kèm file">
                        <i data-lucide="paperclip"></i>
                    </button>
                    <textarea class="ai-chat-input" id="aiChatInput" rows="1" placeholder="Nhập tin nhắn..."></textarea>
                    <button class="ai-chat-send-btn" id="aiChatSendBtn">
                        <i data-lucide="send"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // =========================================================
    // CORE FUNCTIONS
    // =========================================================

    function injectStyles() {
        if (document.getElementById('ai-chat-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'ai-chat-widget-styles';
        style.textContent = WIDGET_STYLES;
        document.head.appendChild(style);
    }

    function injectDependencies() {
        // Animate.css
        if (!document.querySelector('link[href*="animate.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css';
            document.head.appendChild(link);
        }

        // Marked.js
        if (!window.marked && !document.querySelector('script[src*="marked"]')) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            document.head.appendChild(script);
        }
    }

    function createWidget() {
        const container = document.createElement('div');
        container.id = 'ai-chat-widget-container';
        container.innerHTML = getWidgetHTML();
        document.body.appendChild(container);
    }

    function setupEventListeners() {
        const fab = document.getElementById('aiChatFab');
        const closeBtn = document.getElementById('aiChatClose');
        const sendBtn = document.getElementById('aiChatSendBtn');
        const input = document.getElementById('aiChatInput');
        const modelSelect = document.getElementById('aiChatModelSelect');
        const attachBtn = document.getElementById('aiChatAttachBtn');
        const fileInput = document.getElementById('aiChatFileInput');

        // Toggle chat
        fab.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', toggleChat);

        // Send message
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize input
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });

        // Model change
        modelSelect.value = currentModel;
        updateRateInfo();
        modelSelect.addEventListener('change', (e) => {
            currentModel = e.target.value;
            localStorage.setItem(CONFIG.STORAGE_KEY, currentModel);
            updateRateInfo();
        });

        // Attachments
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);

        // Paste image
        input.addEventListener('paste', handlePaste);

        // Reinit lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function toggleChat() {
        isOpen = !isOpen;
        const fab = document.getElementById('aiChatFab');
        const window = document.getElementById('aiChatWindow');

        if (isOpen) {
            fab.classList.add('open');
            window.classList.add('open', 'animate__animated', 'animate__fadeInUp', 'animate__faster');
            fab.innerHTML = '<i data-lucide="x"></i>';
        } else {
            fab.classList.remove('open');
            window.classList.remove('animate__fadeInUp');
            window.classList.add('animate__fadeOutDown');
            setTimeout(() => {
                window.classList.remove('open', 'animate__animated', 'animate__fadeOutDown', 'animate__faster');
            }, 300);
            fab.innerHTML = '<i data-lucide="message-circle"></i>';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function updateRateInfo() {
        const select = document.getElementById('aiChatModelSelect');
        const info = document.getElementById('aiChatRateInfo');
        const option = select.options[select.selectedIndex];
        const rpm = option.dataset.rpm || '—';
        info.textContent = `RPM: ${rpm}`;
    }

    // =========================================================
    // MESSAGING
    // =========================================================

    function addMessage(role, text, attachments = []) {
        const container = document.getElementById('aiChatMessages');

        // Remove welcome message
        const welcome = container.querySelector('.ai-chat-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        const animClass = role === 'user' ? 'animate__fadeInRight' : 'animate__fadeInLeft';
        div.className = `ai-chat-message ${role} animate__animated ${animClass} animate__faster`;

        // Attachments
        let attachHtml = '';
        if (attachments.length > 0) {
            attachHtml = '<div class="ai-chat-msg-attachments">';
            attachments.forEach(a => {
                if (a.preview) {
                    attachHtml += `<img src="${a.preview}" alt="attachment">`;
                }
            });
            attachHtml += '</div>';
        }

        // Parse markdown for AI messages
        const content = role === 'ai' && window.marked ? marked.parse(text) : text;
        div.innerHTML = attachHtml + content;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function showLoading() {
        const container = document.getElementById('aiChatMessages');
        const loading = document.createElement('div');
        loading.className = 'ai-chat-loading animate__animated animate__fadeIn';
        loading.id = 'aiChatLoading';
        loading.innerHTML = `
            <div class="ai-chat-typing-dots">
                <span class="ai-chat-typing-dot"></span>
                <span class="ai-chat-typing-dot"></span>
                <span class="ai-chat-typing-dot"></span>
            </div>
        `;
        container.appendChild(loading);
        container.scrollTop = container.scrollHeight;
    }

    function hideLoading() {
        const loading = document.getElementById('aiChatLoading');
        if (loading) loading.remove();
    }

    async function sendMessage() {
        const input = document.getElementById('aiChatInput');
        const text = input.value.trim();

        if (!text && pendingAttachments.length === 0) return;

        // Add user message
        addMessage('user', text || '(Đã gửi file)', [...pendingAttachments]);

        const attachmentsToSend = [...pendingAttachments];
        pendingAttachments = [];
        updateAttachmentPreview();

        input.value = '';
        input.style.height = 'auto';

        showLoading();

        try {
            const model = MODELS.find(m => m.value === currentModel);
            const isDeepSeek = model?.provider === 'deepseek';

            if (isDeepSeek && attachmentsToSend.length > 0) {
                hideLoading();
                addMessage('ai', '⚠️ DeepSeek không hỗ trợ file attachments. Vui lòng chọn model Gemini.');
                return;
            }

            // 🆕 GET PAGE CONTEXT
            const pageContext = getPageContext();
            const contextText = formatContextForAI(pageContext);

            // Combine user message with page context
            const userMessageWithContext = `${contextText}\n\n[CÂUHỎI CỦA USER]\n${text}`;

            console.log('[AI Chat] Sending with context:', pageContext);

            let response, data, aiText;

            if (isDeepSeek) {
                response = await fetch(CONFIG.DEEPSEEK_PROXY_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: currentModel,
                        messages: [{ role: 'user', content: userMessageWithContext }],
                        max_tokens: 4096,
                        temperature: 0.7
                    })
                });
                data = await response.json();
                aiText = data.choices?.[0]?.message?.content || 'Không có phản hồi';
            } else {
                const parts = [];
                // Add context + user message as text
                if (text) parts.push({ text: userMessageWithContext });

                // Add attachments
                attachmentsToSend.forEach(a => {
                    parts.push({ inline_data: { mime_type: a.type, data: a.data } });
                });

                response = await fetch(CONFIG.GEMINI_PROXY_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: currentModel,
                        contents: [{ role: 'user', parts }]
                    })
                });
                data = await response.json();

                if (data.error) {
                    aiText = `Lỗi: ${data.error.message}`;
                } else {
                    aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi';
                }
            }

            hideLoading();
            addMessage('ai', aiText);

        } catch (error) {
            hideLoading();
            addMessage('ai', 'Có lỗi xảy ra khi kết nối với AI.');
            console.error('[AI Widget Error]', error);
        }
    }

    // =========================================================
    // ATTACHMENTS
    // =========================================================

    function handleFileSelect(e) {
        const files = Array.from(e.target.files);
        files.forEach(processFile);
        e.target.value = '';
    }

    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) processFile(file);
                break;
            }
        }
    }

    function processFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            pendingAttachments.push({
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                data: reader.result.split(',')[1],
                preview: file.type.startsWith('image/') ? reader.result : null
            });
            updateAttachmentPreview();
        };
        reader.readAsDataURL(file);
    }

    function updateAttachmentPreview() {
        const container = document.getElementById('aiChatAttachments');

        if (pendingAttachments.length === 0) {
            container.classList.remove('has-files');
            container.innerHTML = '';
            return;
        }

        container.classList.add('has-files');
        container.innerHTML = pendingAttachments.map(a => `
            <div class="ai-chat-attachment-item">
                ${a.preview ? `<img src="${a.preview}" alt="">` : `<i data-lucide="file"></i>`}
                <span>${a.name.slice(0, 15)}${a.name.length > 15 ? '...' : ''}</span>
                <button class="ai-chat-attachment-remove" onclick="window.AIChatWidget.removeAttachment(${a.id})">×</button>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function removeAttachment(id) {
        pendingAttachments = pendingAttachments.filter(a => a.id !== id);
        updateAttachmentPreview();
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================

    function init() {
        console.log('[AI Chat Widget] Initializing...');
        injectStyles();
        injectDependencies();
        createWidget();
        setupEventListeners();
        console.log('[AI Chat Widget] Ready!');
    }

    // Export to global
    window.AIChatWidget = {
        init,
        toggle: toggleChat,
        removeAttachment
    };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
