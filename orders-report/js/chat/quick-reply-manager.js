// =====================================================
// QUICK REPLY MANAGER - Fast Message Templates for Chat
// =====================================================

class QuickReplyManager {
    constructor() {
        this.replies = [];
        this.targetInputId = null;
        this.STORAGE_KEY = 'quickReplies';
        this.FIREBASE_COLLECTION = 'quickReplies';
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];
        this.db = null;
        this.init();
    }

    init() {
        console.log('[QUICK-REPLY] 🚀 Initializing...');
        this.createModalDOM();
        this.createSettingsModalDOM();
        this.createTemplateInputModalDOM();
        this.createAutocompleteDOM();
        this.initFirebase();
        this.loadReplies();
        this.attachEventListeners();
        this.setupAutocomplete();
    }

    initFirebase() {
        try {
            // Check if Firebase is initialized
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                this.db = firebase.firestore();
                console.log('[QUICK-REPLY] ✅ Firebase Firestore initialized');
            } else {
                console.warn('[QUICK-REPLY] ⚠️ Firebase not available, using localStorage only');
            }
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Firebase init error:', error);
        }
    }

    createSettingsModalDOM() {
        if (document.getElementById('quickReplySettingsModal')) {
            return;
        }

        const settingsHTML = `
            <div class="quick-reply-overlay" id="quickReplySettingsModal">
                <div class="quick-reply-modal" style="max-width: 700px;">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3>
                            <i class="fas fa-cog"></i>
                            Quản lý mẫu tin nhắn
                        </h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeSettings()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" id="quickReplySettingsBody" style="padding: 20px;">
                        <button onclick="quickReplyManager.addNewTemplate()"
                                style="width: 100%; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; font-weight: 600; margin-bottom: 16px; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <i class="fas fa-plus"></i> Thêm mẫu mới
                        </button>
                        <div id="settingsTemplateList"></div>
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info">
                            Quản lý danh sách mẫu tin nhắn
                        </div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.closeSettings()">
                                <i class="fas fa-check"></i> Xong
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', settingsHTML);
        console.log('[QUICK-REPLY] ✅ Settings modal DOM created');
    }

    createTemplateInputModalDOM() {
        if (document.getElementById('templateInputModal')) {
            return;
        }

        const inputModalHTML = `
            <div class="quick-reply-overlay" id="templateInputModal" style="display: none;">
                <div class="quick-reply-modal" style="max-width: 600px;">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3 id="templateInputModalTitle">
                            <i class="fas fa-edit"></i>
                            Thêm mẫu tin nhắn
                        </h3>
                        <button class="quick-reply-close" onclick="quickReplyManager.closeTemplateInputModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" style="padding: 20px;">
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Ký tự tắt <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="text" id="templateInputShortcut" placeholder="VD: CÁMƠN, STK"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Chủ đề
                            </label>
                            <input type="text" id="templateInputTopic" placeholder="Có thể bỏ trống"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Mã màu
                            </label>
                            <input type="text" id="templateInputColor" placeholder="VD: #3add99"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';" />
                        </div>

                        <!-- Image Upload Area -->
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Hình ảnh đính kèm
                            </label>
                            <div id="templateImageDropZone"
                                style="border: 2px dashed #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: #f9fafb;"
                                onclick="document.getElementById('templateImageFileInput').click()">
                                <div id="templateImagePreviewContainer" style="display: none;">
                                    <img id="templateImagePreview" src="" alt="Preview" style="max-width: 100%; max-height: 150px; border-radius: 6px; margin-bottom: 8px;" />
                                    <div style="display: flex; justify-content: center; gap: 8px;">
                                        <button type="button" onclick="event.stopPropagation(); quickReplyManager.removeTemplateImage();"
                                            style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                                            <i class="fas fa-trash"></i> Xóa ảnh
                                        </button>
                                    </div>
                                </div>
                                <div id="templateImagePlaceholder">
                                    <i class="fas fa-image" style="font-size: 32px; color: #9ca3af; margin-bottom: 8px;"></i>
                                    <p style="color: #6b7280; margin: 0; font-size: 13px;">Paste hình (Ctrl+V) hoặc click để chọn</p>
                                    <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 11px;">Hình sẽ được gửi trước, text gửi sau</p>
                                </div>
                            </div>
                            <input type="file" id="templateImageFileInput" accept="image/*" style="display: none;"
                                onchange="quickReplyManager.handleTemplateImageSelect(event)" />
                            <input type="hidden" id="templateInputImageUrl" value="" />
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 14px;">
                                Nội dung tin nhắn <span style="color: #ef4444;">*</span>
                            </label>
                            <textarea id="templateInputMessage" placeholder="Nhập nội dung tin nhắn (Shift+Enter để xuống dòng)" rows="6"
                                style="width: 100%; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s; resize: vertical; font-family: inherit; line-height: 1.5;"
                                onfocus="this.style.borderColor='#667eea';"
                                onblur="this.style.borderColor='#e5e7eb';"></textarea>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-actions" style="width: 100%; display: flex; gap: 8px; justify-content: flex-end;">
                            <button onclick="quickReplyManager.closeTemplateInputModal()"
                                style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#e5e7eb';"
                                onmouseout="this.style.background='#f3f4f6';">
                                <i class="fas fa-times"></i> Hủy
                            </button>
                            <button id="templateInputSaveBtn" onclick="quickReplyManager.saveTemplateInput()"
                                style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)';"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                                <i class="fas fa-check"></i> Lưu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', inputModalHTML);
        this.setupTemplateImagePaste();
        console.log('[QUICK-REPLY] ✅ Template input modal DOM created');
    }

    createModalDOM() {
        if (document.getElementById('quickReplyModal')) {
            console.log('[QUICK-REPLY] ⚠️ Modal already exists');
            return;
        }

        const modalHTML = `
            <div class="quick-reply-overlay" id="quickReplyModal">
                <div class="quick-reply-modal">
                    <!-- Header -->
                    <div class="quick-reply-header">
                        <h3>
                            <i class="fas fa-comment-dots"></i>
                            Mẫu trả lời nhanh
                        </h3>
                        <button class="quick-reply-close" id="quickReplyClose">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Table Header -->
                    <div class="quick-reply-table-header">
                        <div class="qr-col-stt">STT</div>
                        <div class="qr-col-shortcut">Ký tự tắt</div>
                        <div class="qr-col-topic">Chủ đề</div>
                        <div class="qr-col-message">Tin nhắn</div>
                    </div>

                    <!-- Body -->
                    <div class="quick-reply-body" id="quickReplyBody">
                        <!-- Replies will be rendered here -->
                    </div>

                    <!-- Footer -->
                    <div class="quick-reply-footer">
                        <div class="quick-reply-footer-info">
                            <span id="quickReplyCount">0</span> mẫu tin nhắn
                        </div>
                        <div class="quick-reply-footer-actions">
                            <button onclick="quickReplyManager.openSettings()">
                                <i class="fas fa-cog"></i> Cài đặt
                            </button>
                            <button onclick="quickReplyManager.closeModal()">
                                <i class="fas fa-times"></i> Đóng
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('[QUICK-REPLY] ✅ Modal DOM created');
    }

    attachEventListeners() {
        document.getElementById('quickReplyClose')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('quickReplyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'quickReplyModal') {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });

        console.log('[QUICK-REPLY] ✅ Event listeners attached');
    }

    async loadReplies() {
        console.log('[QUICK-REPLY] 📥 Loading replies...');

        // Try to load from IndexedDB first (faster)
        let stored = null;
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.readyPromise;
                stored = await window.indexedDBStorage.getItem(this.STORAGE_KEY);
            }
        } catch (e) {
            console.warn('[QUICK-REPLY] ⚠️ IndexedDB read failed:', e);
        }

        // Fallback to localStorage if IndexedDB not available or empty
        if (!stored) {
            const localStored = localStorage.getItem(this.STORAGE_KEY);
            if (localStored) {
                try {
                    stored = JSON.parse(localStored);
                    // Migrate to IndexedDB
                    if (window.indexedDBStorage) {
                        await window.indexedDBStorage.setItem(this.STORAGE_KEY, stored);
                        localStorage.removeItem(this.STORAGE_KEY);
                        console.log('[QUICK-REPLY] 🔄 Migrated from localStorage to IndexedDB');
                    }
                } catch (e) {
                    console.error('[QUICK-REPLY] ❌ Error parsing localStorage:', e);
                }
            }
        }

        if (stored && Array.isArray(stored)) {
            this.replies = stored;
            console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from cache');
            return;
        }

        // If no cache, load from Firebase and cache it
        if (this.db) {
            try {
                console.log('[QUICK-REPLY] 🔄 Loading from Firebase...');
                const snapshot = await this.db.collection(this.FIREBASE_COLLECTION)
                    .orderBy('id', 'asc')
                    .get();

                if (!snapshot.empty) {
                    this.replies = snapshot.docs.map(doc => ({
                        ...doc.data(),
                        docId: doc.id // Keep Firestore doc ID for updates
                    }));

                    // Cache to IndexedDB
                    await this.saveToCache();

                    console.log('[QUICK-REPLY] ✅ Loaded', this.replies.length, 'replies from Firebase');
                    return;
                } else {
                    console.log('[QUICK-REPLY] ℹ️ No replies in Firebase, using defaults...');
                    this.replies = this.getDefaultReplies();
                    // Cache defaults to IndexedDB
                    await this.saveToCache();
                    return;
                }
            } catch (error) {
                console.error('[QUICK-REPLY] ❌ Firebase load error:', error);
                this.replies = this.getDefaultReplies();
                await this.saveToCache();
            }
        } else {
            console.log('[QUICK-REPLY] ⚠️ Firebase not available, using default replies');
            this.replies = this.getDefaultReplies();
            await this.saveToCache();
        }
    }

    async saveToCache() {
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(this.STORAGE_KEY, this.replies);
                console.log('[QUICK-REPLY] 💾 Saved to IndexedDB cache');
            } else {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.replies));
                console.log('[QUICK-REPLY] 💾 Saved to localStorage (fallback)');
            }
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Failed to save cache:', error);
        }
    }

    getDefaultReplies() {
        return [
            {
                id: 1,
                shortcut: '',
                topic: 'CHỐT ĐƠN',
                topicColor: '#3add99',
                message: 'Dạ mình xem okee shop chốt đơn cho c nhaa 😍'
            },
            {
                id: 2,
                shortcut: 'CAMON',
                topic: 'C.ƠN KH',
                topicColor: '#cec40c',
                message: 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️',
                imageUrl: 'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65293.jpg'
            },
            {
                id: 3,
                shortcut: 'STK',
                topic: 'STK NGÂN HÀNG',
                topicColor: '#969894',
                message: 'Dạ em gửi mình số tài khoản ạ ❗\nNGÂN HÀNG: ACB\nSTK: 93616\nTÊN: LẠI THỤY YẾN NHI\n⛔ MÌNH LƯU Ý khi chuyển khoản kèm nội dung ❌TÊN FB +5 SDTĐUÔI ❌chụp gửi qua giúp em nhé ☺️✉️'
            },
            {
                id: 4,
                shortcut: 'XIN',
                topic: 'XIN SDT & Đ/C',
                topicColor: '#138809',
                message: 'Dạ mình cho shop xin thông tin SĐT & ĐỊA CHỈ ạ ❤️'
            },
            {
                id: 5,
                shortcut: 'ĐỔI',
                topic: 'Đ/C ĐỔI TRẢ',
                topicColor: '#30caff',
                message: '❌❌KHÁCH GỬI HÀNG ĐỔI TRẢ VUI LÒNG RA BƯU CỤC GỬI LÊN GIÚP SHOP THEO THÔNG TIN DƯỚI ĐÂY👇\nNgười Gửi: (TÊN FB + SĐT KHÁCH ĐẶT HÀNG)\nNgười Nhận: NHI JUDY\nĐịa chi: 28/6 PHẠM VĂN CHIÊU P8 GÒ VẤP\nSđt: 0908888674\n\n⛔ LƯU Ý : - HÀNG CÒN TEM MẠC KHÔNG QUA GIẶC - LÀ\n- ĐẦY ĐỦ PHỤ KIỆN ĐI KÈM\n( KHÁCH VUI LÒNG GỬI ĐẦY ĐỦ ĐỂ ĐC ĐỔI TRẢ Ạ )\n\n🆘 HÀNG KHÁCH GỬI LÊN SẼ ĐƯỢC TRỪ TIỀN VÀO ĐƠN TIẾP THEO CỦA KHÁCH 🆘'
            },
            {
                id: 6,
                shortcut: 'TP',
                topic: 'ĐÔI TRẢ TP',
                topicColor: '#8c0db1',
                message: '- ĐƠN SAU BÊN EM ĐI ĐƠN TRỪ TIỀN THU VỀ CHO MÌNH C NHÉ ♦️\n📌 LƯU Ý : hàng chưa qua giặc là , còn tem mác và đầy đủ phụ kiện đi kèm nếu có giúp SHOP ạ\n📌 Hàng đổi trong vòng 3 ngày kể từ ngày nhận hàng\n\nHÀNG GIAO ĐẾN MÌNH ĐƯA CHO SHIPPER MANG VỀ GIÚP SHOP AH 📍📍'
            },
            {
                id: 7,
                shortcut: 'XEM',
                topic: 'XEM HÀNG',
                topicColor: '#5b0001',
                message: 'Dạ c , hàng bên em đi không đồng kiểm hàng trước khi nhận ạ 📌 Nhưng mình nhận hàng cứ yên tâm giúp e nha hàng có vấn đề mình inbox hoặc gọi hottline để bên em sẽ giải quyết đổi trả cho mình ạ . 🌺'
            },
            {
                id: 8,
                shortcut: 'live',
                topic: '',
                topicColor: '',
                message: 'dạ bên e còn live gộp đơn ạ, mình xem live shopping thêm c nha, dạ trường hợp mình cần đi đơn trước hỗ trợ ib giúp shop c nha'
            },
            {
                id: 9,
                shortcut: '.',
                topic: 'NHẮC KHÁCH',
                topicColor: '#ea62f5',
                message: 'Dạ đơn mình có hàng đổi trả thu về , ship giao đến c báo anh hỗ trợ chụp hoặc quay video lại gửi cho shop giúp em nha để tránh trường hợp hàng thu về bị thất lạc . Em cám ơn c nhiều ạ ❤️'
            },
            {
                id: 10,
                shortcut: 'khach_hoi',
                topic: '',
                topicColor: '',
                message: 'Dạ mẫu shop nhận hàng về 1-2 ngày , chị lấy e nhận về hàng cho TY nha 😍'
            },
            {
                id: 11,
                shortcut: 'chot_don_ord',
                topic: '',
                topicColor: '',
                message: 'Dạ e chốt mình\nVề hàng thơi gian dự kiến 1-2 ngày\n❌ Mình đặt inbox đã có hàng , đừng đặt trên live tránh trường hợp trùng mẫu - trùng đơn nhé\n❌ Lưu ý: Hàng sẽ về sớm hơn hoặc chậm hơn dự kiến vài ngày\n❌ HÀNG ĐÃ ĐĂT INBOX , KHÁCH HỖ TRỢ KHÔNG HỦY GIUP SHOP Ạ ❌'
            },
            {
                id: 12,
                shortcut: 'QL',
                topic: '',
                topicColor: '',
                message: 'Dạ e gửi bill qua lấy cho mình , đơn hàng mình có vấn đề gì liên hệ qua SDT quản lí 0977774305 nhé c ạ ❤️ Em cám ơn'
            }
        ];
    }

    async saveReplies() {
        console.log('[QUICK-REPLY] 💾 Saving replies to Firebase...');

        // Save to Firebase
        if (this.db) {
            try {
                console.log('[QUICK-REPLY] 🔄 Syncing to Firebase...');

                // Use batch write for better performance
                const batch = this.db.batch();

                // Delete all existing documents first
                const existingDocs = await this.db.collection(this.FIREBASE_COLLECTION).get();
                existingDocs.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                // Add all current replies
                this.replies.forEach(reply => {
                    const docRef = this.db.collection(this.FIREBASE_COLLECTION).doc();
                    const replyData = { ...reply };
                    delete replyData.docId; // Remove docId before saving
                    batch.set(docRef, replyData);
                });

                await batch.commit();
                console.log('[QUICK-REPLY] ✅ Synced', this.replies.length, 'replies to Firebase');

                // Clear cache and reload from Firebase to get fresh data
                console.log('[QUICK-REPLY] 🗑️ Clearing cache...');
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.removeItem(this.STORAGE_KEY);
                }
                localStorage.removeItem(this.STORAGE_KEY);

                console.log('[QUICK-REPLY] 🔄 Reloading from Firebase...');
                await this.loadReplies();

            } catch (error) {
                console.error('[QUICK-REPLY] ❌ Firebase save error:', error);
                throw error; // Throw error so user knows save failed
            }
        } else {
            console.error('[QUICK-REPLY] ❌ Firebase not available, cannot save');
            throw new Error('Firebase không khả dụng');
        }
    }

    openModal(targetInputId) {
        console.log('[QUICK-REPLY] 📂 Opening modal for input:', targetInputId);

        this.targetInputId = targetInputId;

        const modal = document.getElementById('quickReplyModal');
        modal?.classList.add('active');
        document.body.style.overflow = 'hidden';

        this.renderReplies();
    }

    closeModal() {
        console.log('[QUICK-REPLY] 🚪 Closing modal');

        const modal = document.getElementById('quickReplyModal');
        modal?.classList.remove('active');
        document.body.style.overflow = 'auto';

        this.targetInputId = null;
    }

    isModalOpen() {
        return document.getElementById('quickReplyModal')?.classList.contains('active');
    }

    renderReplies() {
        const bodyEl = document.getElementById('quickReplyBody');
        const countEl = document.getElementById('quickReplyCount');

        if (countEl) {
            countEl.textContent = this.replies.length;
        }

        if (this.replies.length === 0) {
            bodyEl.innerHTML = `
                <div class="quick-reply-empty">
                    <i class="fas fa-comment-slash"></i>
                    <p>Chưa có mẫu tin nhắn nào</p>
                </div>
            `;
            return;
        }

        const repliesHTML = this.replies.map((reply, index) => {
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            // Preview first 80 characters
            const messagePreview = reply.message.length > 80
                ? reply.message.substring(0, 80) + '...'
                : reply.message;

            return `
                <div class="quick-reply-item" onclick="quickReplyManager.selectReply(${reply.id})">
                    <div class="qr-col-stt">${index + 1}.</div>
                    <div class="qr-col-shortcut">
                        <span class="quick-reply-shortcut">${this.escapeHtml(reply.shortcut)}</span>
                    </div>
                    <div class="qr-col-topic">
                        ${topicHTML}
                    </div>
                    <div class="qr-col-message">
                        <span class="quick-reply-message" title="${this.escapeHtml(reply.message)}">
                            ${this.escapeHtml(messagePreview)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = repliesHTML;
        console.log('[QUICK-REPLY] ✅ Rendered', this.replies.length, 'replies');
    }

    selectReply(replyId) {
        const reply = this.replies.find(r => r.id === replyId);

        if (!reply) {
            console.error('[QUICK-REPLY] ❌ Reply not found:', replyId);
            return;
        }

        console.log('[QUICK-REPLY] ✅ Selected reply:', reply.shortcut || reply.id);

        // Check if this reply has an imageUrl - send image first, then text
        if (reply.imageUrl) {
            console.log('[QUICK-REPLY] 🖼️ Reply has imageUrl, sending image first then text');
            this.closeModal();
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }

        this.insertToInput(reply.message);
    }

    insertToInput(message) {
        if (!this.targetInputId) {
            console.error('[QUICK-REPLY] ❌ No target input specified');
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        const inputElement = document.getElementById(this.targetInputId);

        if (!inputElement) {
            console.error('[QUICK-REPLY] ❌ Target input not found:', this.targetInputId);
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy ô nhập liệu');
            }
            return;
        }

        // Insert message
        const currentValue = inputElement.value || '';
        const newValue = currentValue ? `${currentValue}\n${message}` : message;
        inputElement.value = newValue;

        console.log('[QUICK-REPLY] ✅ Inserted message to input');

        // Show notification
        if (window.notificationManager) {
            window.notificationManager.success('Đã chèn tin nhắn mẫu', 2000);
        }

        // Close modal
        this.closeModal();

        // Focus input
        inputElement.focus();

        // Move cursor to end
        if (inputElement.setSelectionRange) {
            const len = inputElement.value.length;
            inputElement.setSelectionRange(len, len);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Remove Vietnamese diacritics from text for easier matching
     * e.g., "CÁMƠN" -> "CAMON", "ĐỔI" -> "DOI"
     */
    removeVietnameseDiacritics(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    // =====================================================
    // AUTOCOMPLETE FEATURE
    // =====================================================

    createAutocompleteDOM() {
        if (document.getElementById('quickReplyAutocomplete')) {
            return;
        }

        const autocompleteHTML = `
            <div class="quick-reply-autocomplete" id="quickReplyAutocomplete">
                <!-- Suggestions will be rendered here -->
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', autocompleteHTML);
        console.log('[QUICK-REPLY] ✅ Autocomplete DOM created');
    }

    setupAutocomplete() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const chatInput = document.getElementById('chatReplyInput');
            if (!chatInput) {
                console.log('[QUICK-REPLY] ⚠️ chatReplyInput not found, autocomplete disabled');
                return;
            }

            // Attach event listeners
            chatInput.addEventListener('input', (e) => this.handleAutocompleteInput(e));
            chatInput.addEventListener('keydown', (e) => this.handleAutocompleteKeydown(e));

            console.log('[QUICK-REPLY] ✅ Autocomplete setup complete');
        }, 1000);
    }

    handleAutocompleteInput(e) {
        const input = e.target;
        const value = input.value;
        const cursorPos = input.selectionStart;

        // Find the last / before cursor
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        if (lastSlashIndex === -1) {
            this.hideAutocomplete();
            return;
        }

        // Get text after /
        const query = textBeforeCursor.substring(lastSlashIndex + 1);

        // Check if there's a space after / (means query ended)
        if (query.includes(' ') || query.includes('\n')) {
            this.hideAutocomplete();
            return;
        }

        // =====================================================
        // AUTO-SEND: Check for exact /CAMON match (case-insensitive)
        // Immediately sends image + text without needing Enter
        // =====================================================
        if (query.toUpperCase() === 'CAMON') {
            console.log('[QUICK-REPLY] 🚀 Auto-sending /CAMON quick reply');
            this.hideAutocomplete();

            // Clear the entire input field
            input.value = '';
            input.style.height = 'auto';

            // Send the hardcoded image and message directly
            const camonImageUrl = 'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65293.jpg';
            const camonMessage = 'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️';
            this.sendQuickReplyWithImage(camonImageUrl, camonMessage);
            return;
        }

        // Filter suggestions - match with Vietnamese diacritics removed
        const queryNoDiacritics = this.removeVietnameseDiacritics(query.toLowerCase());
        this.currentSuggestions = this.replies.filter(reply => {
            if (!reply.shortcut) return false;
            // Compare both original and diacritics-removed versions
            const shortcutLower = reply.shortcut.toLowerCase();
            const shortcutNoDiacritics = this.removeVietnameseDiacritics(shortcutLower);
            return shortcutLower.startsWith(query.toLowerCase()) ||
                shortcutNoDiacritics.startsWith(queryNoDiacritics);
        });

        if (this.currentSuggestions.length > 0) {
            this.showAutocomplete(input, query, lastSlashIndex);
        } else {
            this.hideAutocomplete();
        }
    }

    handleAutocompleteKeydown(e) {
        if (!this.autocompleteActive) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedSuggestionIndex = Math.min(
                this.selectedSuggestionIndex + 1,
                this.currentSuggestions.length - 1
            );
            this.renderAutocomplete();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, 0);
            this.renderAutocomplete();
        } else if (e.key === 'Enter' && this.selectedSuggestionIndex >= 0) {
            e.preventDefault();
            const selected = this.currentSuggestions[this.selectedSuggestionIndex];
            if (selected) {
                this.applyAutocompleteSuggestion(selected);
            }
        } else if (e.key === 'Escape') {
            this.hideAutocomplete();
        }
    }

    showAutocomplete(inputElement, query, slashIndex) {
        this.autocompleteActive = true;
        this.selectedSuggestionIndex = 0;

        // Position dropdown below input
        const dropdown = document.getElementById('quickReplyAutocomplete');
        const inputRect = inputElement.getBoundingClientRect();

        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.top = (inputRect.bottom + 4) + 'px';
        dropdown.style.width = Math.max(400, inputRect.width) + 'px';
        dropdown.style.display = 'block';

        this.renderAutocomplete();
    }

    renderAutocomplete() {
        const dropdown = document.getElementById('quickReplyAutocomplete');

        const suggestionsHTML = this.currentSuggestions.map((reply, index) => {
            const isSelected = index === this.selectedSuggestionIndex;
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}; font-size: 10px; padding: 2px 6px;">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            const messagePreview = reply.message.length > 60
                ? reply.message.substring(0, 60) + '...'
                : reply.message;

            return `
                <div class="autocomplete-item ${isSelected ? 'selected' : ''}"
                     data-index="${index}"
                     onclick="quickReplyManager.selectAutocompleteSuggestion(${index})">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 600; color: #667eea; min-width: 80px;">/${this.escapeHtml(reply.shortcut)}</span>
                        ${topicHTML}
                    </div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                        ${this.escapeHtml(messagePreview)}
                    </div>
                </div>
            `;
        }).join('');

        dropdown.innerHTML = suggestionsHTML;
    }

    selectAutocompleteSuggestion(index) {
        const selected = this.currentSuggestions[index];
        if (selected) {
            this.applyAutocompleteSuggestion(selected);
        }
    }

    applyAutocompleteSuggestion(reply) {
        const input = document.getElementById('chatReplyInput');
        if (!input) return;

        // DEBUG: Log reply object to check if imageUrl exists
        console.log('[QUICK-REPLY] 📋 Selected reply:', JSON.stringify(reply, null, 2));
        console.log('[QUICK-REPLY] 🖼️ Has imageUrl?', !!reply.imageUrl, '→', reply.imageUrl);

        // Check if this reply has an imageUrl - send image first, then text
        if (reply.imageUrl) {
            console.log('[QUICK-REPLY] 🖼️ Reply has imageUrl, sending image first then text');
            this.hideAutocomplete();

            // Clear the entire input field
            input.value = '';
            input.style.height = 'auto';

            // Send image first, then text
            this.sendQuickReplyWithImage(reply.imageUrl, reply.message);
            return;
        }

        const value = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const textAfterCursor = value.substring(cursorPos);

        // Find the / that triggered autocomplete
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        // Replace from / to cursor with the message
        const newValue = value.substring(0, lastSlashIndex) + reply.message + textAfterCursor;
        input.value = newValue;

        // Set cursor position after inserted text
        const newCursorPos = lastSlashIndex + reply.message.length;
        input.setSelectionRange(newCursorPos, newCursorPos);

        this.hideAutocomplete();
        input.focus();

        console.log('[QUICK-REPLY] ✅ Applied autocomplete:', reply.shortcut);
    }

    /**
     * Send quick reply with image - sends image first, then text message (independent requests)
     * @param {string} imageUrl - URL of the image to send
     * @param {string} message - Text message to send after the image
     */
    async sendQuickReplyWithImage(imageUrl, message) {
        console.log('[QUICK-REPLY] 🚀 Sending quick reply with image');
        console.log('[QUICK-REPLY] Image URL:', imageUrl);
        console.log('[QUICK-REPLY] Message:', message);

        // Set flag to prevent duplicate send validation alert
        window.isQuickReplySending = true;

        // Check if we have the required info
        if (!window.currentConversationId || !window.currentChatChannelId) {
            console.error('[QUICK-REPLY] ❌ Missing conversation info');
            if (window.notificationManager) {
                window.notificationManager.error('Không thể gửi: Thiếu thông tin cuộc hội thoại');
            }
            window.isQuickReplySending = false;
            return;
        }

        try {
            const channelId = window.currentSendPageId || window.currentChatChannelId;
            const conversationId = window.currentConversationId;
            const customerId = window.currentCustomerUUID;

            // Get page_access_token for Official API (pages.fm)
            const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId);
            if (!pageAccessToken) {
                throw new Error('Không tìm thấy page_access_token');
            }

            // Show loading indicator
            if (window.notificationManager) {
                window.notificationManager.info('Đang gửi tin nhắn...', 3000);
            }

            // Build query params for Official API
            let queryParams = `page_access_token=${pageAccessToken}`;
            if (customerId) {
                queryParams += `&customer_id=${customerId}`;
            }

            const apiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${channelId}/conversations/${conversationId}/messages`,
                pageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            // Add employee signature
            let finalMessage = message;
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                finalMessage = message + '\nNv. ' + displayName;
            }

            // Send IMAGE and TEXT independently (image first, then text after 300ms)
            // Image request - via proxy to avoid CORS
            const sendImage = async () => {
                console.log('[QUICK-REPLY] 📤 Sending image...');

                // Build Pancake Official API URL via proxy (avoid CORS issues)
                const pancakeApiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${channelId}/conversations/${conversationId}/messages`,
                    pageAccessToken
                ) + (customerId ? `&customer_id=${customerId}` : '');

                // Pancake API chính thức dùng JSON với content_ids
                // Tuy nhiên, quick-reply dùng external URL (content_url) nên vẫn cần gửi theo cách cũ
                // TODO: Upload image trước rồi dùng content_ids
                const imagePayload = {
                    action: 'reply_inbox',
                    message: ''  // Empty message, just image
                    // NOTE: Không có content_ids vì đây là external URL
                    // Pancake có thể hỗ trợ content_url nhưng không có trong docs chính thức
                };

                console.log('[QUICK-REPLY] Payload:', imagePayload);
                console.log('[QUICK-REPLY] API URL:', pancakeApiUrl);
                console.log('[QUICK-REPLY] ⚠️ Note: Using external imageUrl, may not work with official API');

                // Call Pancake API via proxy (avoid CORS)
                const imageResponse = await API_CONFIG.smartFetch(pancakeApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(imagePayload)
                }, 1, true); // maxRetries=1, skipFallback=true: chỉ gọi 1 lần, không retry

                if (!imageResponse.ok) {
                    const errorText = await imageResponse.text();
                    console.error('[QUICK-REPLY] ❌ Image send HTTP failed:', errorText);
                    return { success: false, error: 'Gửi hình ảnh thất bại (HTTP)' };
                }

                const imageResult = await imageResponse.json();
                console.log('[QUICK-REPLY] Image API response:', imageResult);

                // Check API success field
                if (!imageResult.success) {
                    console.error('[QUICK-REPLY] ❌ Image send API failed:', imageResult.message || imageResult.error);

                    // Check for 24-hour policy error
                    const is24HourError = (imageResult.e_code === 10 && imageResult.e_subcode === 2018278) ||
                        (imageResult.message && imageResult.message.includes('khoảng thời gian cho phép'));
                    if (is24HourError) {
                        return { success: false, error: '24H_POLICY_ERROR', is24HourError: true };
                    }

                    // Check for user unavailable error (551)
                    const isUserUnavailable = (imageResult.e_code === 551) ||
                        (imageResult.message && imageResult.message.includes('không có mặt'));
                    if (isUserUnavailable) {
                        return { success: false, error: 'USER_UNAVAILABLE', isUserUnavailable: true };
                    }

                    return { success: false, error: imageResult.message || 'Gửi hình ảnh thất bại (API)' };
                }

                console.log('[QUICK-REPLY] ✅ Image sent successfully');
                return { success: true, data: imageResult };
            };

            // Text request (with small delay to ensure image is sent first)
            const sendText = async () => {
                // Small delay to ensure image is sent first
                await new Promise(resolve => setTimeout(resolve, 300));

                console.log('[QUICK-REPLY] 📤 Sending text message...');

                // Build Pancake Official API URL via proxy (avoid CORS issues)
                const pancakeApiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${channelId}/conversations/${conversationId}/messages`,
                    pageAccessToken
                ) + (customerId ? `&customer_id=${customerId}` : '');

                // Pancake API chính thức dùng JSON
                const textPayload = {
                    action: 'reply_inbox',
                    message: finalMessage
                };

                // Call Pancake API via proxy (avoid CORS)
                const textResponse = await API_CONFIG.smartFetch(pancakeApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(textPayload)
                }, 1, true); // maxRetries=1, skipFallback=true: chỉ gọi 1 lần, không retry

                if (!textResponse.ok) {
                    const errorText = await textResponse.text();
                    console.error('[QUICK-REPLY] ❌ Text send HTTP failed:', errorText);
                    return { success: false, error: 'Gửi tin nhắn thất bại (HTTP)' };
                }

                const textResult = await textResponse.json();
                console.log('[QUICK-REPLY] Text API response:', textResult);

                // Check API success field
                if (!textResult.success) {
                    console.error('[QUICK-REPLY] ❌ Text send API failed:', textResult.message || textResult.error);

                    // Check for 24-hour policy error
                    const is24HourError = (textResult.e_code === 10 && textResult.e_subcode === 2018278) ||
                        (textResult.message && textResult.message.includes('khoảng thời gian cho phép'));
                    if (is24HourError) {
                        return { success: false, error: '24H_POLICY_ERROR', is24HourError: true };
                    }

                    // Check for user unavailable error (551)
                    const isUserUnavailable = (textResult.e_code === 551) ||
                        (textResult.message && textResult.message.includes('không có mặt'));
                    if (isUserUnavailable) {
                        return { success: false, error: 'USER_UNAVAILABLE', isUserUnavailable: true };
                    }

                    return { success: false, error: textResult.message || 'Gửi tin nhắn thất bại (API)' };
                }

                console.log('[QUICK-REPLY] ✅ Text sent successfully');
                return { success: true, data: textResult };
            };

            // Send both independently using Promise.all
            const [imageResult, textResult] = await Promise.all([sendImage(), sendText()]);

            // Check results
            if (!imageResult.success || !textResult.success) {
                // Check for 24h or user unavailable errors
                const has24HourError = imageResult.is24HourError || textResult.is24HourError;
                const hasUserUnavailable = imageResult.isUserUnavailable || textResult.isUserUnavailable;

                if (has24HourError || hasUserUnavailable) {
                    const errorType = has24HourError ? '24h policy' : 'user unavailable (551)';
                    console.warn(`[QUICK-REPLY] ⚠️ ${errorType} error detected`);

                    const warningMsg = has24HourError
                        ? '⚠️ Không thể gửi (quá 24h). Vui lòng dùng COMMENT!'
                        : '⚠️ Người dùng không có mặt. Vui lòng dùng COMMENT!';
                    if (window.notificationManager) {
                        window.notificationManager.show(warningMsg, 'warning', 8000);
                    }
                    return; // Don't throw error for these cases
                }

                const errors = [];
                if (!imageResult.success) errors.push(imageResult.error);
                if (!textResult.success) errors.push(textResult.error);
                throw new Error(errors.join(', '));
            }

            // Success notification
            if (window.notificationManager) {
                window.notificationManager.success('Đã gửi tin nhắn cảm ơn!', 3000);
            }

            // Refresh messages in UI
            setTimeout(async () => {
                try {
                    if (window.currentChatPSID && window.chatDataManager) {
                        const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                        if (response.messages && response.messages.length > 0) {
                            window.allChatMessages = response.messages;
                            if (window.renderChatMessages) {
                                window.renderChatMessages(window.allChatMessages, false);
                            }
                            console.log('[QUICK-REPLY] ✅ Messages refreshed');
                        }
                    }
                } catch (refreshError) {
                    console.warn('[QUICK-REPLY] ⚠️ Failed to refresh messages:', refreshError);
                }
            }, 300);

        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi: ' + error.message);
            }
        } finally {
            // Clear flag after sending completes (with delay to prevent race condition)
            setTimeout(() => {
                window.isQuickReplySending = false;
            }, 500);
        }
    }

    hideAutocomplete() {
        this.autocompleteActive = false;
        this.selectedSuggestionIndex = -1;
        this.currentSuggestions = [];

        const dropdown = document.getElementById('quickReplyAutocomplete');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    // =====================================================
    // SETTINGS MANAGEMENT
    // =====================================================

    openSettings() {
        console.log('[QUICK-REPLY] ⚙️ Opening settings...');

        const modal = document.getElementById('quickReplySettingsModal');
        modal?.classList.add('active');

        this.renderSettingsList();
    }

    closeSettings() {
        console.log('[QUICK-REPLY] ⚙️ Closing settings...');

        const modal = document.getElementById('quickReplySettingsModal');
        modal?.classList.remove('active');

        // Reload main modal if it's open
        if (this.isModalOpen()) {
            this.renderReplies();
        }
    }

    renderSettingsList() {
        const listEl = document.getElementById('settingsTemplateList');
        if (!listEl) return;

        if (this.replies.length === 0) {
            listEl.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">Chưa có mẫu tin nhắn nào</p>';
            return;
        }

        const itemsHTML = this.replies.map((reply, index) => {
            const topicHTML = reply.topic ? `
                <span class="quick-reply-topic" style="background-color: ${reply.topicColor || '#6b7280'}; font-size: 11px; padding: 3px 8px; margin-left: 8px;">
                    ${this.escapeHtml(reply.topic)}
                </span>
            ` : '';

            return `
                <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; margin-bottom: 6px;">
                                <strong style="color: #667eea;">/${this.escapeHtml(reply.shortcut || '')}</strong>
                                ${topicHTML}
                            </div>
                            <div style="font-size: 13px; color: #6b7280; line-height: 1.5; max-height: 60px; overflow: hidden;">
                                ${this.escapeHtml(reply.message.substring(0, 100))}${reply.message.length > 100 ? '...' : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; margin-left: 12px;">
                            <button onclick="quickReplyManager.editTemplate(${reply.id})"
                                    style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                <i class="fas fa-edit"></i> Sửa
                            </button>
                            <button onclick="quickReplyManager.deleteTemplate(${reply.id})"
                                    style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                <i class="fas fa-trash"></i> Xóa
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = itemsHTML;
    }

    addNewTemplate() {
        // Open modal for adding new template
        this.currentEditingTemplateId = null; // null means adding new
        this.openTemplateInputModal('Thêm mẫu tin nhắn', '', '', '', '', '');
    }

    openTemplateInputModal(title, shortcut = '', topic = '', topicColor = '', message = '', imageUrl = '') {
        const modal = document.getElementById('templateInputModal');
        const modalTitle = document.getElementById('templateInputModalTitle');
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');
        const imageUrlInput = document.getElementById('templateInputImageUrl');

        if (!modal) {
            console.error('[QUICK-REPLY] Template input modal not found');
            return;
        }

        // Set values
        modalTitle.innerHTML = `<i class="fas fa-edit"></i> ${title}`;
        shortcutInput.value = shortcut;
        topicInput.value = topic;
        colorInput.value = topicColor;
        messageInput.value = message;

        // Handle image URL
        if (imageUrlInput) {
            imageUrlInput.value = imageUrl || '';
        }
        this.pendingTemplateImageBlob = null; // Clear any pending blob

        // Update image preview
        this.updateTemplateImagePreview(imageUrl);

        // Add keyboard event listener
        const handleKeyDown = (e) => {
            // Escape to close
            if (e.key === 'Escape') {
                this.closeTemplateInputModal();
            }
            // Ctrl+Enter or Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.saveTemplateInput();
            }
        };

        // Remove old listener if exists and add new one
        modal.removeEventListener('keydown', this._templateInputKeyHandler);
        this._templateInputKeyHandler = handleKeyDown;
        modal.addEventListener('keydown', this._templateInputKeyHandler);

        // Show modal
        modal.style.display = 'flex';

        // Focus on first input
        setTimeout(() => shortcutInput.focus(), 100);
    }

    closeTemplateInputModal() {
        const modal = document.getElementById('templateInputModal');
        if (modal) {
            modal.style.display = 'none';
            // Remove keyboard event listener
            if (this._templateInputKeyHandler) {
                modal.removeEventListener('keydown', this._templateInputKeyHandler);
            }
        }
        this.currentEditingTemplateId = null;
        this.pendingTemplateImageBlob = null;
    }

    // =====================================================
    // TEMPLATE IMAGE HANDLING
    // =====================================================

    setupTemplateImagePaste() {
        // Wait for modal to be in DOM
        setTimeout(() => {
            const modal = document.getElementById('templateInputModal');
            if (modal) {
                modal.addEventListener('paste', (e) => this.handleTemplateImagePaste(e));
                console.log('[QUICK-REPLY] ✅ Template image paste listener attached');
            }
        }, 100);
    }

    handleTemplateImagePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    this.processTemplateImage(blob);
                }
                return;
            }
        }
    }

    handleTemplateImageSelect(event) {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            this.processTemplateImage(file);
        }
        // Reset input so the same file can be selected again
        event.target.value = '';
    }

    async processTemplateImage(blob) {
        console.log('[QUICK-REPLY] 🖼️ Processing template image...');

        // Store the blob for upload when saving
        this.pendingTemplateImageBlob = blob;

        // Show preview immediately using local URL
        const localUrl = URL.createObjectURL(blob);
        this.updateTemplateImagePreview(localUrl);

        // Clear the hidden imageUrl input since we'll upload on save
        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) {
            imageUrlInput.value = ''; // Will be set after upload
        }

        if (window.notificationManager) {
            window.notificationManager.info('Hình sẽ được upload khi lưu mẫu', 2000);
        }
    }

    updateTemplateImagePreview(imageUrl) {
        const previewContainer = document.getElementById('templateImagePreviewContainer');
        const previewImg = document.getElementById('templateImagePreview');
        const placeholder = document.getElementById('templateImagePlaceholder');

        if (imageUrl) {
            previewImg.src = imageUrl;
            previewContainer.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            previewImg.src = '';
            previewContainer.style.display = 'none';
            placeholder.style.display = 'block';
        }
    }

    removeTemplateImage() {
        console.log('[QUICK-REPLY] 🗑️ Removing template image');

        this.pendingTemplateImageBlob = null;

        const imageUrlInput = document.getElementById('templateInputImageUrl');
        if (imageUrlInput) {
            imageUrlInput.value = '';
        }

        this.updateTemplateImagePreview('');

        if (window.notificationManager) {
            window.notificationManager.info('Đã xóa hình ảnh', 2000);
        }
    }

    async uploadTemplateImage(blob) {
        console.log('[QUICK-REPLY] 📤 Uploading template image...');

        try {
            // Get a page ID for uploading (use first available)
            const channelId = window.currentChatChannelId || window.currentSendPageId;
            if (!channelId) {
                throw new Error('Không tìm thấy page ID để upload');
            }

            // Upload via pancakeDataManager
            if (!window.pancakeDataManager) {
                throw new Error('PancakeDataManager not available');
            }

            const result = await window.pancakeDataManager.uploadImage(channelId, blob);
            console.log('[QUICK-REPLY] ✅ Image uploaded:', result);

            if (result && result.content_url) {
                return result.content_url;
            }

            throw new Error('Upload không trả về URL');
        } catch (error) {
            console.error('[QUICK-REPLY] ❌ Image upload failed:', error);
            throw error;
        }
    }

    async saveTemplateInput() {
        const shortcutInput = document.getElementById('templateInputShortcut');
        const topicInput = document.getElementById('templateInputTopic');
        const colorInput = document.getElementById('templateInputColor');
        const messageInput = document.getElementById('templateInputMessage');
        const imageUrlInput = document.getElementById('templateInputImageUrl');

        const shortcut = shortcutInput.value.trim();
        const topic = topicInput.value.trim();
        const topicColor = colorInput.value.trim() || '#6b7280';
        const message = messageInput.value.trim();
        let imageUrl = imageUrlInput?.value?.trim() || '';

        // Validation
        if (!shortcut) {
            alert('Vui lòng nhập ký tự tắt!');
            shortcutInput.focus();
            return;
        }

        if (!message) {
            alert('Vui lòng nhập nội dung tin nhắn!');
            messageInput.focus();
            return;
        }

        try {
            // Upload pending image if exists
            if (this.pendingTemplateImageBlob) {
                if (window.notificationManager) {
                    window.notificationManager.info('Đang upload hình ảnh...', 5000);
                }

                try {
                    imageUrl = await this.uploadTemplateImage(this.pendingTemplateImageBlob);
                    console.log('[QUICK-REPLY] ✅ Image uploaded, URL:', imageUrl);
                } catch (uploadError) {
                    console.error('[QUICK-REPLY] ❌ Image upload failed:', uploadError);
                    if (window.notificationManager) {
                        window.notificationManager.error('Upload hình thất bại: ' + uploadError.message);
                    }
                    // Don't save without the image if user added one
                    return;
                }
            }

            if (this.currentEditingTemplateId === null) {
                // Adding new template
                const maxId = this.replies.length > 0 ? Math.max(...this.replies.map(r => r.id)) : 0;

                const newReply = {
                    id: maxId + 1,
                    shortcut: shortcut,
                    topic: topic,
                    topicColor: topicColor,
                    message: message
                };

                // Add imageUrl if exists
                if (imageUrl) {
                    newReply.imageUrl = imageUrl;
                }

                this.replies.push(newReply);
                await this.saveReplies();
                this.renderSettingsList();

                if (window.notificationManager) {
                    window.notificationManager.success('Đã thêm mẫu tin nhắn mới!');
                }

                console.log('[QUICK-REPLY] ✅ Added new template:', shortcut);
            } else {
                // Editing existing template
                const reply = this.replies.find(r => r.id === this.currentEditingTemplateId);
                if (!reply) {
                    alert('Không tìm thấy mẫu tin nhắn!');
                    return;
                }

                // Backup old values for rollback
                const oldValues = {
                    shortcut: reply.shortcut,
                    topic: reply.topic,
                    topicColor: reply.topicColor,
                    message: reply.message,
                    imageUrl: reply.imageUrl
                };

                reply.shortcut = shortcut;
                reply.topic = topic;
                reply.topicColor = topicColor;
                reply.message = message;

                // Handle imageUrl - set or clear
                if (imageUrl) {
                    reply.imageUrl = imageUrl;
                } else {
                    delete reply.imageUrl;
                }

                try {
                    await this.saveReplies();
                    this.renderSettingsList();

                    if (window.notificationManager) {
                        window.notificationManager.success('Đã cập nhật mẫu tin nhắn!');
                    }

                    console.log('[QUICK-REPLY] ✅ Updated template:', this.currentEditingTemplateId);
                } catch (error) {
                    // Rollback if save failed
                    reply.shortcut = oldValues.shortcut;
                    reply.topic = oldValues.topic;
                    reply.topicColor = oldValues.topicColor;
                    reply.message = oldValues.message;
                    if (oldValues.imageUrl) {
                        reply.imageUrl = oldValues.imageUrl;
                    } else {
                        delete reply.imageUrl;
                    }
                    throw error;
                }
            }

            // Close modal on success
            this.closeTemplateInputModal();
        } catch (error) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi khi lưu vào Firebase!');
            }
            console.error('[QUICK-REPLY] ❌ Failed to save template:', error);
        }
    }

    editTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;

        // Set current editing ID and open modal with template data
        this.currentEditingTemplateId = id;
        this.openTemplateInputModal(
            'Chỉnh sửa mẫu tin nhắn',
            reply.shortcut,
            reply.topic,
            reply.topicColor,
            reply.message,
            reply.imageUrl || ''
        );
    }

    async deleteTemplate(id) {
        const reply = this.replies.find(r => r.id === id);
        if (!reply) return;

        if (!confirm(`Xóa mẫu "${reply.shortcut || reply.topic}"?`)) {
            return;
        }

        // Backup for rollback
        const deletedReply = { ...reply };
        const oldReplies = [...this.replies];

        this.replies = this.replies.filter(r => r.id !== id);

        try {
            await this.saveReplies();
            this.renderSettingsList();

            if (window.notificationManager) {
                window.notificationManager.success('Đã xóa mẫu tin nhắn!');
            }

            console.log('[QUICK-REPLY] ✅ Deleted template:', id);
        } catch (error) {
            // Rollback if save failed
            this.replies = oldReplies;

            if (window.notificationManager) {
                window.notificationManager.error('Lỗi khi lưu vào Firebase!');
            }
            console.error('[QUICK-REPLY] ❌ Failed to delete template:', error);
        }
    }
}

// =====================================================
// INITIALIZE
// =====================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuickReplyManager);
} else {
    initQuickReplyManager();
}

function initQuickReplyManager() {
    console.log('%c🚀 QUICK REPLY MANAGER', 'background: #667eea; color: white; padding: 8px; font-weight: bold;');
    const quickReplyManager = new QuickReplyManager();
    window.quickReplyManager = quickReplyManager;
    console.log('✅ QuickReplyManager initialized and ready');
}
