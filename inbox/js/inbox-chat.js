/* =====================================================
   INBOX CHAT - Chat UI Controller with Pancake API
   Reference: tpos-pancake/js/pancake-chat.js
   ===================================================== */

// Gradient colors for avatar placeholders (from tpos-pancake)
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
];

class InboxChatController {
    constructor(dataManager) {
        this.data = dataManager;
        this.activeConversationId = null;
        this.currentFilter = localStorage.getItem('inbox_current_filter') || 'all';
        this.currentGroupFilters = new Set(); // Multi-select group filter
        this.searchQuery = '';
        this.isSearching = false;
        this.searchResults = null; // null = use local filter, [] = API returned empty
        this.selectedPageIds = new Set(); // Multi-page filter (empty = all)
        this.currentTypeFilter = 'all'; // 'all', 'INBOX', 'COMMENT'
        this.selectedLivestreamPostId = ''; // Filter livestream by post_id
        this.isSending = false;
        this.isLoadingMessages = false;
        this.currentSendPageId = null; // Page to send from (null = use conversation's page)
        this.currentReplyType = null; // 'reply_comment' | 'private_replies' | 'reply_inbox'

        // Message pagination (like tpos-pancake)
        this.isLoadingMoreMessages = false;
        this.hasMoreMessages = true;
        this.messageCurrentCount = 0;

        // WebSocket real-time (Server Mode Proxy via Render)
        this.socket = null;
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 3;
        this.socketReconnectDelay = 3000;
        this.socketReconnectTimer = null;
        this.userId = null;
        this.autoRefreshInterval = null;
        this.AUTO_REFRESH_INTERVAL = 30000;

        // Quick replies (like tpos-pancake)
        this.quickReplies = [
            { label: 'NV My KH dat', color: 'blue', template: '' },
            { label: 'NV My CK + Gap', color: 'blue', template: '' },
            { label: 'NHAC KHACH', color: 'red', template: '' },
            { label: 'XIN DIA CHI', color: 'purple', template: '' },
            { label: 'NV .BO', color: 'teal', template: '' },
            { label: 'NJD OI', color: 'green', template: '' },
            { label: 'NV. Lai', color: 'orange', template: '' },
            { label: 'NV. Hanh', color: 'pink', template: '' },
            { label: 'Nv.Huyen', color: 'pink', template: '' },
            { label: 'Nv. Duyen', color: 'teal', template: '' },
            { label: 'XU LY BC', color: 'purple', template: '' },
            { label: 'BOOM', color: 'red', template: '' },
            { label: 'CHECK IB', color: 'green', template: '' },
            { label: 'Nv My', color: 'blue', template: '' },
        ];

        // Reply state
        this.replyingTo = null; // { msgId, text, senderName, isOutgoing }

        // Conversation list pagination
        this.isLoadingMoreConversations = false;
        this.hasMoreConversations = true;

        // Page unread counts
        this.pageUnreadCounts = {};

        this.elements = {
            conversationList: document.getElementById('conversationList'),
            chatMessages: document.getElementById('chatMessages'),
            btnScrollBottom: document.getElementById('btnScrollBottom'),
            chatInput: document.getElementById('chatInput'),
            chatUserName: document.getElementById('chatUserName'),
            chatUserStatus: document.getElementById('chatUserStatus'),
            chatHeader: document.getElementById('chatHeader'),
            searchInput: document.getElementById('searchConversation'),
            btnSend: document.getElementById('btnSend'),
            btnMarkUnread: document.getElementById('btnMarkUnread'),
            btnToggleLivestream: document.getElementById('btnToggleLivestream'),
            btnRefreshInbox: document.getElementById('btnRefreshInbox'),
            chatLabelBar: document.getElementById('chatLabelBar'),
            chatLabelBarList: document.getElementById('chatLabelBarList'),
            groupStatsList: document.getElementById('groupStatsList'),
            pageSelectorBtn: document.getElementById('pageSelectorBtn'),
            pageSelectorDropdown: document.getElementById('pageSelectorDropdown'),
            pageSelectorLabel: document.getElementById('pageSelectorLabel'),
        };
    }

    init() {
        this.bindEvents();

        // Restore saved filter tab
        const savedFilter = this.currentFilter;
        const tab = document.querySelector(`.filter-tab[data-filter="${savedFilter}"]`);
        if (tab) {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }
        this.toggleLivestreamPostSelector();

        this.renderPageSelector();
        this.renderConversationList();
        this.renderGroupStats();
    }

    bindEvents() {
        // Search: instant local filter + debounced API search (like tpos-pancake)
        let searchTimeout = null;
        this.elements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.searchQuery = query;

            if (searchTimeout) clearTimeout(searchTimeout);

            if (!query) {
                this.isSearching = false;
                this.searchResults = null;
                this.renderConversationList();
                return;
            }

            // Instant: local filter
            this.searchResults = null;
            this.renderConversationList();

            // Debounced: API search for more results (300ms)
            searchTimeout = setTimeout(async () => {
                await this.performSearch(query);
            }, 300);
        });

        // Clear search on Escape
        this.elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.elements.searchInput.value = '';
                this.searchQuery = '';
                this.isSearching = false;
                this.searchResults = null;
                this.renderConversationList();
            }
        });

        // Conversation list scroll-to-load-more (with cooldown to prevent 429)
        this._loadMoreCooldownUntil = 0;
        this._consecutiveEmptyLoads = 0;
        let convScrollThrottled = false;
        this.elements.conversationList.addEventListener('scroll', () => {
            if (this._isRerendering || convScrollThrottled) return;
            convScrollThrottled = true;
            requestAnimationFrame(() => {
                convScrollThrottled = false;
                const el = this.elements.conversationList;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
                if (nearBottom && !this.isLoadingMoreConversations && this.hasMoreConversations && !this.searchQuery && Date.now() >= this._loadMoreCooldownUntil) {
                    this.loadMoreConversations();
                }
            });
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentFilter = tab.dataset.filter;
                localStorage.setItem('inbox_current_filter', this.currentFilter);
                this._consecutiveEmptyLoads = 0;
                this._loadMoreCooldownUntil = 0;
                this.toggleLivestreamPostSelector();
                this.renderConversationList();
            });
        });

        // Type filter (comment/message) — applies across all tabs
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTypeFilter = btn.dataset.type;
                this._consecutiveEmptyLoads = 0;
                this._loadMoreCooldownUntil = 0;
                this.renderConversationList();
                this.renderGroupStats();
            });
        });

        // Update type filter count badges
        this._updateTypeFilterCounts = (total, inbox, comment) => {
            document.querySelectorAll('.type-filter-btn').forEach(btn => {
                const type = btn.dataset.type;
                const count = type === 'all' ? total : type === 'INBOX' ? inbox : comment;
                // Update or create badge span
                let badge = btn.querySelector('.type-count');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'type-count';
                    btn.appendChild(badge);
                }
                badge.textContent = count > 99 ? '99+' : count;
            });
        };

        // Livestream post selector
        const livestreamPostSelect = document.getElementById('livestreamPostSelect');
        if (livestreamPostSelect) {
            livestreamPostSelect.addEventListener('change', (e) => {
                this.selectedLivestreamPostId = e.target.value;
                this._consecutiveEmptyLoads = 0;
                this._loadMoreCooldownUntil = 0;
                this.renderConversationList();
            });
        }

        // Clear livestream for selected post
        const btnClearLivestream = document.getElementById('btnClearLivestream');
        if (btnClearLivestream) {
            btnClearLivestream.addEventListener('click', () => this.clearLivestreamForPost());
        }
        const btnFetchPostNames = document.getElementById('btnFetchPostNames');
        if (btnFetchPostNames) {
            btnFetchPostNames.addEventListener('click', () => {
                this._fetchingPostNames = false;
                // Always re-fetch all posts (force refresh)
                const postIds = Object.keys(this.data.livestreamPostMap || {});
                if (postIds.length === 0) {
                    showToast('Không có bài post livestream', 'info');
                    return;
                }
                showToast(`Đang lấy tên ${postIds.length} bài post...`, 'info');
                this._fetchMissingPostNames(postIds);
            });
        }

        // Send message
        this.elements.btnSend.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.chatInput.addEventListener('input', () => {
            const el = this.elements.chatInput;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        });

        // Paste image: show preview, send on Enter
        this.pendingImage = null;
        this.elements.chatInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) this._showImagePreview(file);
                    return;
                }
            }
        });
        document.getElementById('chatImagePreviewClose')?.addEventListener('click', () => this._clearImagePreview());

        // Note input: Enter to send (right panel only)
        const noteInput = document.getElementById('convNoteInput');
        if (noteInput) {
            noteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.addNote(noteInput);
                }
            });
        }

        // Message scroll: pagination (scroll up) + scroll-to-bottom button
        this.elements.chatMessages.addEventListener('scroll', () => {
            const container = this.elements.chatMessages;
            // Load more when scrolled near top
            if (container.scrollTop < 100 &&
                this.hasMoreMessages &&
                !this.isLoadingMoreMessages &&
                this.activeConversationId) {
                this.loadMoreMessages();
            }
            // Show/hide scroll-to-bottom button
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (this.elements.btnScrollBottom) {
                this.elements.btnScrollBottom.style.display = distanceFromBottom > 200 ? 'flex' : 'none';
            }
        });

        // Scroll-to-bottom button click
        if (this.elements.btnScrollBottom) {
            this.elements.btnScrollBottom.addEventListener('click', () => {
                this.elements.chatMessages.scrollTo({ top: this.elements.chatMessages.scrollHeight, behavior: 'smooth' });
            });
        }

        // Quick reply bar click
        const qrBar = document.getElementById('quickReplyBar');
        if (qrBar) {
            qrBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.qr-btn');
                if (!btn) return;
                const template = btn.dataset.template;
                if (template) {
                    this.elements.chatInput.value = template;
                    this.elements.chatInput.focus();
                }
            });
        }

        // Message action buttons (like, hide, delete, copy) via event delegation
        this.elements.chatMessages.addEventListener('click', async (e) => {
            const btn = e.target.closest('.msg-action-btn');
            if (!btn) return;
            e.stopPropagation();
            const action = btn.dataset.action;
            const msgId = btn.dataset.msgId;
            if (!action || !msgId) return;
            await this.handleMessageAction(action, msgId, btn);
        });

        // Cancel reply button
        const btnCancelReply = document.getElementById('btnCancelReply');
        if (btnCancelReply) {
            btnCancelReply.addEventListener('click', () => this.cancelReply());
        }

        // Reaction picker clicks
        const reactionPicker = document.getElementById('reactionPicker');
        if (reactionPicker) {
            reactionPicker.addEventListener('click', async (e) => {
                const btn = e.target.closest('.reaction-emoji');
                if (!btn) return;
                const reaction = btn.dataset.reaction;
                const msgId = reactionPicker.dataset.msgId;
                if (reaction && msgId) {
                    await this.sendReaction(msgId, reaction);
                }
            });
        }

        // File attachment
        const btnAttachFile = document.getElementById('btnAttachFile');
        if (btnAttachFile) {
            btnAttachFile.addEventListener('click', () => this.attachFile());
        }

        // Emoji picker
        this.emojiData = {
            recent: ['😊', '👍', '❤️', '😂', '🙏', '😍', '🔥', '✨'],
            smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬'],
            gestures: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦'],
            hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','💏','💑','👪'],
            animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🪸','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦣','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
            food: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🫘','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🫗'],
            objects: ['💡','🔦','🏮','🪔','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓']
        };
        const savedRecent = localStorage.getItem('inbox_recent_emojis');
        if (savedRecent) { try { this.emojiData.recent = JSON.parse(savedRecent); } catch(e){} }

        const emojiBtn = document.getElementById('btnEmoji');
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiGrid = document.getElementById('emojiGrid');
        if (emojiBtn && emojiPicker && emojiGrid) {
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const vis = emojiPicker.style.display === 'block';
                emojiPicker.style.display = vis ? 'none' : 'block';
                if (!vis) this.renderEmojiGrid('recent');
            });
            document.addEventListener('click', (e) => {
                if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = 'none';
            });
            document.getElementById('emojiCategories').addEventListener('click', (e) => {
                const cat = e.target.closest('.emoji-cat');
                if (!cat) return;
                document.querySelectorAll('.emoji-cat').forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.renderEmojiGrid(cat.dataset.cat);
            });
            emojiGrid.addEventListener('click', (e) => {
                const item = e.target.closest('.emoji-item');
                if (!item) return;
                const emoji = item.textContent;
                const input = this.elements.chatInput;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
                input.selectionStart = input.selectionEnd = start + emoji.length;
                input.focus();
                // Save to recent
                const idx = this.emojiData.recent.indexOf(emoji);
                if (idx > -1) this.emojiData.recent.splice(idx, 1);
                this.emojiData.recent.unshift(emoji);
                this.emojiData.recent = this.emojiData.recent.slice(0, 24);
                localStorage.setItem('inbox_recent_emojis', JSON.stringify(this.emojiData.recent));
            });
        }

        // Mark as unread
        this.elements.btnMarkUnread.addEventListener('click', () => {
            if (this.activeConversationId) {
                this.data.markAsUnread(this.activeConversationId);
                this.renderConversationList();
                this.renderGroupStats();
                this.updatePageUnreadCounts();
            }
        });

        // Toggle livestream
        this.elements.btnToggleLivestream.addEventListener('click', () => {
            this.toggleLivestreamStatus();
        });

        // Refresh - reload from Pancake API
        this.elements.btnRefreshInbox.addEventListener('click', async () => {
            const btn = this.elements.btnRefreshInbox;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            try {
                await this.data.loadConversations(true);
                this.renderPageSelector();
                this.renderConversationList();
                this.renderGroupStats();
                showToast('Đã làm mới dữ liệu từ Pancake', 'success');
            } catch (err) {
                showToast('Lỗi làm mới: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });

        // Info panel tabs
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const tabMap = { stats: 'tabStats', activities: 'tabActivities', orders: 'tabOrders' };
                const target = document.getElementById(tabMap[tab.dataset.tab] || 'tabStats');
                if (target) target.classList.add('active');
            });
        });

        // Toggle right panel
        const btnToggle = document.getElementById('btnToggleRightPanel');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                const panel = document.getElementById('col3');
                panel.classList.toggle('hidden');
                panel.classList.toggle('force-show');
            });
        }

        // Manage groups button
        const btnManageGroups = document.getElementById('btnManageGroups');
        if (btnManageGroups) {
            btnManageGroups.addEventListener('click', () => this.showManageGroupsModal());
        }

        // Attach image button
        const btnAttachImage = document.getElementById('btnAttachImage');
        if (btnAttachImage) {
            btnAttachImage.addEventListener('click', () => this.attachImage());
        }

        // Page selector toggle
        if (this.elements.pageSelectorBtn) {
            this.elements.pageSelectorBtn.addEventListener('click', () => {
                const dd = this.elements.pageSelectorDropdown;
                dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
            });
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.page-selector')) {
                    this.elements.pageSelectorDropdown.style.display = 'none';
                }
            });
        }

        // Label bar drag-to-resize
        const labelResize = document.getElementById('chatLabelResize');
        if (labelResize) {
            let startY, startHeight;
            const labelList = this.elements.chatLabelBarList;

            labelResize.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startY = e.clientY;
                startHeight = labelList.offsetHeight;
                const onMove = (ev) => {
                    const diff = startY - ev.clientY; // drag up = expand
                    const newH = Math.max(27, startHeight + diff);
                    labelList.style.maxHeight = newH + 'px';
                    if (newH > 60) labelList.classList.add('expanded');
                    else labelList.classList.remove('expanded');
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            // Double-click to toggle expand/collapse
            labelResize.addEventListener('dblclick', () => {
                if (labelList.classList.contains('expanded')) {
                    labelList.classList.remove('expanded');
                    labelList.style.maxHeight = '54px';
                } else {
                    labelList.classList.add('expanded');
                    labelList.style.maxHeight = '300px';
                }
            });
        }

    }

    // ===== Page Selector (from tpos-pancake) =====

    renderPageSelector() {
        const dropdown = this.elements.pageSelectorDropdown;
        if (!dropdown) return;

        const pages = this.data.pages || [];
        if (pages.length === 0) {
            dropdown.innerHTML = '<div class="page-item" style="padding:8px;color:var(--text-tertiary);">Chưa có pages</div>';
            return;
        }

        const allSelected = this.selectedPageIds.size === 0;

        let html = `
            <div class="page-item ${allSelected ? 'active' : ''}" data-page-id="">
                <input type="checkbox" class="page-check" ${allSelected ? 'checked' : ''} />
                <div class="page-item-icon"><i data-lucide="layout-grid"></i></div>
                <div class="page-item-info">
                    <div class="page-item-name">Tất cả Pages</div>
                    <div class="page-item-hint">${pages.length} pages</div>
                </div>
            </div>
        `;

        for (const page of pages) {
            const pageId = page.id;
            const pageName = page.name || 'Page';
            const isActive = allSelected || this.selectedPageIds.has(pageId);
            const initial = pageName.charAt(0).toUpperCase();
            const avatarHtml = page.avatar
                ? `<img src="${page.avatar}" class="page-item-avatar" alt="${this.escapeHtml(pageName)}" onerror="this.outerHTML='<div class=page-item-avatar-ph>${initial}</div>'">`
                : `<div class="page-item-avatar-ph">${initial}</div>`;

            const unreadCount = this.pageUnreadCounts[pageId] || 0;
            const unreadBadgeHtml = unreadCount > 0
                ? `<span class="page-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
                : '';

            html += `
                <div class="page-item ${isActive ? 'active' : ''}" data-page-id="${pageId}">
                    <input type="checkbox" class="page-check" ${isActive ? 'checked' : ''} />
                    ${avatarHtml}
                    <div class="page-item-info">
                        <div class="page-item-name">${this.escapeHtml(pageName)}</div>
                    </div>
                    ${unreadBadgeHtml}
                </div>
            `;
        }

        dropdown.innerHTML = html;

        // Bind click events — multi-select toggle
        dropdown.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const pageId = item.dataset.pageId;

                if (!pageId) {
                    // "Tất cả" clicked — clear selection (show all)
                    this.selectedPageIds.clear();
                } else {
                    if (this.selectedPageIds.has(pageId)) {
                        this.selectedPageIds.delete(pageId);
                    } else {
                        this.selectedPageIds.add(pageId);
                    }
                }

                this.updatePageSelectorLabel();
                this.renderPageSelector();
                this.renderConversationList();
            });
        });

        this._debouncedCreateIcons();
    }

    updatePageSelectorLabel() {
        const label = this.elements.pageSelectorLabel;
        const pages = this.data.pages || [];
        if (this.selectedPageIds.size === 0) {
            label.textContent = 'Tất cả Pages';
        } else if (this.selectedPageIds.size === 1) {
            const pageId = [...this.selectedPageIds][0];
            const page = pages.find(p => p.id === pageId);
            label.textContent = page?.name || 'Page';
        } else {
            label.textContent = `${this.selectedPageIds.size} Pages`;
        }
    }

    // ===== Send Page Selector (Gửi từ) =====

    populateSendPageSelector() {
        const select = document.getElementById('sendPageSelect');
        const container = document.getElementById('sendPageSelector');
        if (!select || !container) return;

        const pages = this.data.pages || [];
        if (pages.length <= 1) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        // Always match conversation's page when switching conversations
        const conv = this.activeConversationId ? this.data.getConversation(this.activeConversationId) : null;
        if (conv?.pageId) {
            this.currentSendPageId = conv.pageId;
        }
        const activePageId = this.currentSendPageId || '';

        let html = '';
        for (const page of pages) {
            const selected = page.id === activePageId ? 'selected' : '';
            html += `<option value="${page.id}" ${selected}>${page.name || page.id}</option>`;
        }
        select.innerHTML = html;

        // currentSendPageId already set above
    }

    onSendPageChanged(pageId) {
        this.currentSendPageId = pageId || null;
        const pages = this.data.pages || [];
        const page = pages.find(p => p.id === pageId);
        if (pageId && page) {
            console.log('[InboxChat] Send page changed to:', page.name || pageId);
        } else {
            console.log('[InboxChat] Send page reset to conversation page');
        }
    }

    // ===== Reply Type Selector (COMMENT conversations) =====

    /**
     * Auto-select best reply type based on conversation context.
     */
    getAutoReplyType(conv) {
        if (!conv || conv.type !== 'COMMENT') return null;
        // Default: public comment reply (visible in chat thread)
        return 'reply_comment';
    }

    /**
     * Show/hide reply-type selector. Only visible for COMMENT conversations.
     */
    populateReplyTypeSelector() {
        const container = document.getElementById('replyTypeSelector');
        const select = document.getElementById('replyTypeSelect');
        if (!container || !select) return;

        const conv = this.activeConversationId
            ? this.data.getConversation(this.activeConversationId)
            : null;

        if (!conv || conv.type !== 'COMMENT') {
            container.style.display = 'none';
            this.currentReplyType = null;
            this._updateReplyPlaceholder();
            return;
        }

        container.style.display = 'flex';

        // Auto-select if not already set
        if (!this.currentReplyType) {
            this.currentReplyType = this.getAutoReplyType(conv);
        }
        select.value = this.currentReplyType || 'reply_comment';

        // Update placeholder hint
        this._updateReplyPlaceholder();
    }

    onReplyTypeChanged(value) {
        this.currentReplyType = value || null;
        this._updateReplyPlaceholder();
        console.log('[InboxChat] Reply type changed to:', value);
    }

    _updateReplyPlaceholder() {
        const input = this.elements.chatInput;
        if (!input) return;
        const hints = {
            'reply_comment': 'Trả lời bình luận công khai...',
            'private_replies': 'Nhắn riêng cho người bình luận...',
        };
        input.placeholder = hints[this.currentReplyType] || 'Nhập tin nhắn...';
    }

    // ===== Avatar Helper (from tpos-pancake) =====

    getAvatarHtml(conv, size = 'list') {
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        // 4-tier avatar fallback (like tpos-pancake)
        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar
            || conv._raw?.from?.picture?.data?.url
            || conv._raw?.from?.profile_pic
            || conv._raw?.customers?.[0]?.avatar
            || null;

        let avatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="conv-avatar-ph" style="display:none;background:${gradient};">${initial}</div>`;
        }
        return `<div class="conv-avatar-ph" style="background:${gradient};">${initial}</div>`;
    }

    // ===== Tags Helper =====

    getTagsHtml(conv) {
        const tags = conv._raw?.tags;
        if (!tags || tags.length === 0) return '';
        const colorPalette = ['red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];
        return tags.slice(0, 3).map((tag, idx) => {
            const tagName = tag.name || tag.tag_name || tag;
            const tagColor = tag.color || colorPalette[idx % colorPalette.length];
            if (tagColor.startsWith('#')) {
                return `<span class="conv-tag" style="background:${tagColor}20;color:${tagColor};">${this.escapeHtml(tagName)}</span>`;
            }
            return `<span class="conv-tag tag-${tagColor}">${this.escapeHtml(tagName)}</span>`;
        }).join('');
    }

    // ===== Conversation List =====

    renderConversationList() {
        // Guard: prevent scroll-to-load-more during re-render
        this._isRerendering = true;

        // If API search returned results, use them merged with local results
        // When searching, bypass filter (show all results regardless of unread/starred/etc.)
        let conversations;
        const effectiveFilter = this.searchQuery ? 'all' : this.currentFilter;
        if (this.searchResults !== null && this.searchQuery) {
            // Merge: local filtered + API results (deduplicate by id)
            const localResults = this.data.getConversations({
                search: this.searchQuery,
                filter: effectiveFilter,
                groupFilters: this.currentGroupFilters,
            });
            const localIds = new Set(localResults.map(c => c.id));
            const apiMapped = this.searchResults
                .filter(c => !localIds.has(c.id))
                .map(c => this.data.mapConversation(c));
            conversations = [...localResults, ...apiMapped];
            conversations.sort((a, b) => b.time - a.time);
        } else {
            conversations = this.data.getConversations({
                search: this.searchQuery,
                filter: effectiveFilter,
                groupFilters: this.currentGroupFilters,
            });
        }

        // Apply page filter (multi-select)
        if (this.selectedPageIds.size > 0) {
            conversations = conversations.filter(c => this.selectedPageIds.has(c.pageId));
        }

        // Count by type for filter badges (before type filter applied)
        const totalCount = conversations.length;
        const inboxCount = conversations.filter(c => c.type === 'INBOX').length;
        const commentCount = conversations.filter(c => c.type === 'COMMENT').length;
        this._updateTypeFilterCounts(totalCount, inboxCount, commentCount);

        // Apply type filter (INBOX/COMMENT) — across all tabs
        if (this.currentTypeFilter !== 'all') {
            conversations = conversations.filter(c => c.type === this.currentTypeFilter);
        }

        // Apply livestream post filter (only in livestream tab)
        if (this.currentFilter === 'livestream' && this.selectedLivestreamPostId) {
            conversations = conversations.filter(c => c._raw?.post_id === this.selectedLivestreamPostId);
        }

        if (conversations.length === 0 && this.isSearching) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <div class="typing-indicator" style="justify-content:center;margin-bottom:8px;">
                        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                    </div>
                    <p>Đang tìm kiếm "${this.escapeHtml(this.searchQuery)}"...</p>
                </div>
            `;
            return;
        }

        if (conversations.length === 0) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <p>Không tìm thấy kết quả${this.searchQuery ? ' cho "' + this.escapeHtml(this.searchQuery) + '"' : ''}</p>
                </div>
            `;
            return;
        }

        this.elements.conversationList.innerHTML = conversations.map(conv => this._buildConvItemHtml(conv)).join('');

        this._debouncedCreateIcons();

        // Restore scroll guard after render settles
        requestAnimationFrame(() => { this._isRerendering = false; });
    }

    _buildConvItemHtml(conv) {
        const labelsHtml = (conv.labels || ['new']).map(l =>
            `<span class="conv-label ${this.getLabelClass(l)}">${this.getLabelText(l)}</span>`
        ).join('');
        const isActive = conv.id === this.activeConversationId;
        // Don't show as unread if shop sent the last message (already replied)
        const isUnread = conv.unread > 0 && conv.isCustomerLast !== false;
        const avatarHtml = this.getAvatarHtml(conv);
        const unreadBadge = isUnread ? `<span class="conv-unread-badge">${conv.unread > 9 ? '9+' : conv.unread}</span>` : '';
        const livestreamBadge = conv.isLivestream ? '<span class="conv-livestream-badge">LIVE</span>' : '';
        const pageNameHtml = conv.pageName ? `<span class="conv-page-name">${this.escapeHtml(conv.pageName)}</span>` : '';
        const typeIcon = conv.type === 'COMMENT' ? 'message-square' : 'message-circle';
        const tagsHtml = this.getTagsHtml(conv);
        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
                 data-id="${conv.id}" onclick="window.inboxChat.selectConversation('${conv.id}')">
                <div class="conv-avatar-wrap">${avatarHtml}${unreadBadge}</div>
                <div class="conv-content">
                    <div class="conv-header">
                        <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                        <span class="conv-time">${this.formatTime(conv.time)}</span>
                    </div>
                    ${pageNameHtml}
                    <div class="conv-preview ${isUnread ? 'unread' : ''}">${this.escapeHtml(conv.lastMessage)}</div>
                    <div class="conv-footer">
                        <div class="conv-footer-left">${labelsHtml}${tagsHtml}${livestreamBadge}</div>
                        <button class="conv-read-toggle" title="${isUnread ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}"
                            onclick="event.stopPropagation(); window.inboxChat.toggleReadUnread('${conv.id}')">
                            <i data-lucide="${isUnread ? 'mail-open' : 'mail'}"></i>
                        </button>
                        <span class="conv-type-icon" title="${conv.type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn'}">
                            <i data-lucide="${typeIcon}"></i>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    _debouncedCreateIcons() {
        if (this._iconTimer) cancelAnimationFrame(this._iconTimer);
        this._iconTimer = requestAnimationFrame(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    // ===== Livestream Post Selector =====

    updateLivestreamButton(conv) {
        const btn = this.elements.btnToggleLivestream;
        if (!btn) return;
        btn.style.display = '';
        if (conv.isLivestream) {
            btn.title = 'Bỏ khỏi Livestream';
            btn.classList.add('active');
            btn.innerHTML = '<i data-lucide="radio"></i>';
        } else {
            btn.title = 'Đưa vào Livestream';
            btn.classList.remove('active');
            btn.innerHTML = '<i data-lucide="radio"></i>';
        }
        if (window.lucide) lucide.createIcons();
    }

    toggleLivestreamStatus() {
        if (!this.activeConversationId) return;
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        if (conv.isLivestream) {
            // Remove from livestream
            this.data.unmarkAsLivestream(conv.id);
            // Also delete from server
            const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            fetch(`${workerUrl}/api/realtime/livestream-conversations?conv_id=${encodeURIComponent(conv.id)}`, {
                method: 'DELETE'
            }).catch(err => console.warn('[InboxChat] Error removing livestream:', err.message));
            showToast('Đã bỏ khỏi Livestream', 'success');
        } else {
            // Add to livestream — need a post_id
            // For INBOX conversations, try to find post_id from activities (livestream videos)
            let postId = conv._raw?.post_id;
            let postName = null;
            if (!postId && conv._messagesData?.activities?.length) {
                // Get the most recent activity with a post_id
                const activities = conv._messagesData.activities;
                const latest = activities[activities.length - 1];
                if (latest?.post_id) {
                    postId = latest.post_id;
                    postName = latest.message || latest.attachments?.title || null;
                    console.log(`[Livestream] INBOX conv → using activity post_id: ${postId}, name: ${postName}`);
                }
            }
            if (!postId) postId = 'manual';
            if (postName) this.data.livestreamPostNames[postId] = postName;
            this.data.markAsLivestream(conv.id, postId);
            showToast('Đã đưa vào Livestream', 'success');
        }

        this.updateLivestreamButton(conv);
        this.renderConversationList();
    }

    toggleLivestreamPostSelector() {
        const selector = document.getElementById('livestreamPostSelector');
        if (!selector) return;
        if (this.currentFilter === 'livestream') {
            selector.style.display = '';
            this.populateLivestreamPostSelector();
        } else {
            selector.style.display = 'none';
        }
    }

    populateLivestreamPostSelector() {
        const select = document.getElementById('livestreamPostSelect');
        if (!select) return;

        const postMap = this.data.livestreamPostMap || {};
        const postNames = this.data.livestreamPostNames || {};
        const postIds = Object.keys(postMap);

        // Check for missing names — fetch once
        const missingIds = postIds.filter(pid => !postNames[pid]);
        if (missingIds.length > 0 && !this._fetchingPostNames) {
            this._fetchingPostNames = true;
            this._fetchMissingPostNames(missingIds);
        }

        let html = `<option value="">Tất cả bài post (${postIds.length})</option>`;
        for (const postId of postIds) {
            const convs = postMap[postId] || [];
            const selected = postId === this.selectedLivestreamPostId ? 'selected' : '';
            const postName = postNames[postId] || `Post ${postId.substring(0, 20)}...`;
            html += `<option value="${postId}" ${selected}>${postName} (${convs.length})</option>`;
        }
        select.innerHTML = html;
    }

    /**
     * Fetch missing post names from Pancake messages API (one-time)
     * Also saves to server so future loads have the name
     */
    async _fetchMissingPostNames(postIds) {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        let updated = false;
        for (const postId of postIds) {
            const convs = this.data.livestreamPostMap[postId] || [];
            const sc = convs[0];
            if (!sc) continue;

            const conv = this.data.getConversation(sc.conv_id);
            const pageId = conv?.pageId || sc.page_id;
            const convId = sc.conv_id;
            if (!pageId || !convId) { console.log(`[PostName] Skip ${postId}: no pageId/convId`); continue; }

            // Check if messages already loaded (has post data)
            const cachedPost = conv?._messagesData?.post;
            const cachedName = cachedPost?.message || cachedPost?.story;
            if (cachedName) {
                this.data.livestreamPostNames[postId] = cachedName;
                updated = true;
                continue;
            }

            try {
                // Clear message cache to force fresh API call
                const cacheKey = `${pageId}_${convId}`;
                if (pdm.clearMessagesCache) pdm.clearMessagesCache(cacheKey);

                console.log(`[PostName] Fetching for post ${postId}, page=${pageId}, conv=${convId}`);
                const result = await pdm.fetchMessagesForConversation(
                    pageId, convId, null, conv?.customerId || sc.customer_id
                );
                const post = result?.post || result?.conversation?.post;
                // Livestream posts have message=null, fallback to story or date+admin
                // INBOX conversations have post=null, fallback to activities
                let postName = post?.message
                    || post?.story
                    || (post?.inserted_at ? `Live ${new Date(post.inserted_at).toLocaleDateString('vi-VN')}${post.admin_creator?.name ? ' - ' + post.admin_creator.name : ''}` : null);

                // If post is null (INBOX conv), try activities for livestream video names
                if (!postName && result?.activities?.length) {
                    const latest = result.activities[result.activities.length - 1];
                    postName = latest?.message || latest?.attachments?.title || null;
                    if (postName) console.log(`[PostName] Got name from activities: ${postName}`);
                }
                console.log(`[PostName] Result:`, postName);

                if (postName) {
                    this.data.livestreamPostNames[postId] = postName;
                    // Save to server for persistence
                    const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
                    fetch(`${workerUrl}/api/realtime/livestream-conversation`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ convId, postId, postName })
                    }).catch(() => {});
                    updated = true;
                }
            } catch (e) {
                console.warn(`[PostName] Failed for ${postId}:`, e.message);
            }
        }

        this._fetchingPostNames = false;
        if (updated && this.currentFilter === 'livestream') {
            this.populateLivestreamPostSelector();
        }
    }

    async clearLivestreamForPost() {
        const postId = this.selectedLivestreamPostId;
        if (!postId) {
            showToast('Chọn bài post trước khi xóa', 'warning');
            return;
        }

        const convs = this.data.livestreamPostMap[postId] || [];
        if (convs.length === 0) {
            showToast('Không có đoạn hội thoại livestream cho bài post này', 'info');
            return;
        }

        if (!confirm(`Xóa đánh dấu livestream cho ${convs.length} đoạn hội thoại của bài post này?`)) return;

        // DELETE on server
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const res = await fetch(`${workerUrl}/api/realtime/livestream-conversations?post_id=${encodeURIComponent(postId)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            console.log(`[InboxChat] Deleted ${data.deleted} livestream conversations for post ${postId}`);
        } catch (err) {
            console.warn('[InboxChat] Error deleting livestream:', err.message);
        }

        // Refetch from server to update local state
        await this.data.fetchLivestreamFromServer();

        this.selectedLivestreamPostId = '';
        this.populateLivestreamPostSelector();
        this.renderConversationList();
        showToast(`Đã xóa ${convs.length} đoạn hội thoại livestream`, 'success');
    }

    // ===== Load More Conversations (scroll pagination) =====

    async loadMoreConversations() {
        if (this.isLoadingMoreConversations || !this.hasMoreConversations) return;
        this.isLoadingMoreConversations = true;

        // Show loading spinner at bottom
        const spinner = document.createElement('div');
        spinner.className = 'conv-loading-more';
        spinner.innerHTML = '<div class="typing-indicator" style="justify-content:center;padding:12px;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        this.elements.conversationList.appendChild(spinner);

        try {
            const newConvs = await this.data.loadMoreConversations();
            spinner.remove();

            if (!newConvs || newConvs.length === 0) {
                this.hasMoreConversations = false;
                console.log('[InboxChat] No more conversations to load');
                return;
            }

            // Filter new conversations by current tab/type before appending
            let filtered = newConvs;
            if (this.currentFilter === 'unread') filtered = filtered.filter(c => c.unread > 0);
            else if (this.currentFilter === 'livestream') filtered = filtered.filter(c => c.isLivestream);
            else if (this.currentFilter === 'inbox_my') filtered = filtered.filter(c => !c.isLivestream);
            if (this.currentTypeFilter !== 'all') filtered = filtered.filter(c => c.type === this.currentTypeFilter);
            if (this.selectedPageIds.size > 0) filtered = filtered.filter(c => this.selectedPageIds.has(c.pageId));
            if (this.currentFilter === 'livestream' && this.selectedLivestreamPostId) {
                filtered = filtered.filter(c => c._raw?.post_id === this.selectedLivestreamPostId);
            }

            // Append filtered items (preserves scroll)
            if (filtered.length > 0) {
                const newHtml = filtered.map(conv => this._buildConvItemHtml(conv)).join('');
                this.elements.conversationList.insertAdjacentHTML('beforeend', newHtml);
                this._debouncedCreateIcons();
                this._consecutiveEmptyLoads = 0;
            } else {
                // No visible results after filter — increase cooldown to prevent cascade
                this._consecutiveEmptyLoads++;
            }

            // Cooldown: back off progressively when filter removes most results
            if (this._consecutiveEmptyLoads > 0) {
                const delay = Math.min(this._consecutiveEmptyLoads * 2000, 10000); // 2s, 4s, 6s... max 10s
                this._loadMoreCooldownUntil = Date.now() + delay;
                console.log(`[InboxChat] Load-more cooldown ${delay}ms (${this._consecutiveEmptyLoads} empty loads)`);
            }

            console.log(`[InboxChat] Loaded ${newConvs.length} more, ${filtered.length} matched filter`);
        } catch (error) {
            console.error('[InboxChat] Error loading more conversations:', error);
            spinner.remove();
            // On error (including 429), back off for 5 seconds
            this._loadMoreCooldownUntil = Date.now() + 5000;
        } finally {
            this.isLoadingMoreConversations = false;
        }
    }

    // ===== Toggle Read/Unread =====

    toggleReadUnread(convId) {
        console.log('[InboxChat] toggleReadUnread called:', convId);
        const conv = this.data.getConversation(convId);
        if (!conv) { console.warn('[InboxChat] toggleReadUnread: conv not found'); return; }

        if (conv.unread > 0) {
            this.data.markAsRead(convId);
            showToast('Đã đánh dấu đã đọc', 'info');
        } else {
            this.data.markAsUnread(convId);
            showToast('Đã đánh dấu chưa đọc', 'info');
        }
        this.renderConversationList();
        this.data.recalculateGroupCounts();
        this.renderGroupStats();
        this.updatePageUnreadCounts();
    }

    // ===== Select Conversation =====

    async selectConversation(convId) {
        this.activeConversationId = convId;
        this.cancelReply(); // Clear any pending reply
        let conv = this.data.getConversation(convId);

        // If not found locally, check search results (API returned conversation not in loaded list)
        if (!conv && this.searchResults) {
            const apiConv = this.searchResults.find(c => c.id === convId);
            if (apiConv) {
                conv = this.data.mapConversation(apiConv);
                this.data.conversations.unshift(conv);
                this.data.buildMaps();
            }
        }
        if (!conv) return;

        // Update header
        this.elements.chatUserName.textContent = conv.name;
        const statusParts = [];
        if (conv.pageName) statusParts.push(conv.pageName);
        if (conv.type === 'COMMENT') statusParts.push('Bình luận');
        if (conv.isLivestream) statusParts.push('Livestream');
        this.elements.chatUserStatus.textContent = statusParts.join(' · ') || 'Đang tải...';

        // Update chat avatar with 4-tier fallback (like tpos-pancake)
        const chatAvatar = this.elements.chatHeader.querySelector('.chat-avatar');
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar || conv._raw?.from?.picture?.data?.url || conv._raw?.from?.profile_pic || conv._raw?.customers?.[0]?.avatar || null;
        let avatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            chatAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';this.parentElement.style.background='${gradient}'"><div style="display:none;width:100%;height:100%;border-radius:50%;background:${gradient};align-items:center;justify-content:center;color:white;font-size:0.875rem;font-weight:700">${initial}</div>`;
            chatAvatar.style.background = 'transparent';
        } else {
            chatAvatar.innerHTML = `<span>${initial}</span>`;
            chatAvatar.style.background = gradient;
            chatAvatar.style.color = 'white';
            chatAvatar.style.fontSize = '0.875rem';
            chatAvatar.style.fontWeight = '700';
        }
        chatAvatar.className = 'chat-avatar';

        this.elements.btnMarkUnread.style.display = '';
        this.updateLivestreamButton(conv);
        this.renderChatLabelBar(conv);
        this.renderConversationList();
        this.renderGroupStats();

        // Reset stats bar and post info while loading
        const statsBar = document.getElementById('customerStatsBar');
        if (statsBar) statsBar.style.display = 'none';
        const postBanner = document.getElementById('postInfoBanner');
        if (postBanner) postBanner.style.display = 'none';

        // Show loading state
        this.elements.chatMessages.innerHTML = `
            <div class="chat-empty-state">
                <div class="loading-spinner"></div>
                <p>Đang tải tin nhắn...</p>
            </div>
        `;

        // Fetch real messages from Pancake API
        await this.loadMessages(conv);

        // Show quick reply bar & send page selector
        this.renderQuickReplies();
        this.populateSendPageSelector();
        this.currentReplyType = null; // Reset on conversation switch
        this.populateReplyTypeSelector();
    }

    /**
     * Load messages for a conversation from Pancake API
     */
    async loadMessages(conv) {
        if (this.isLoadingMessages) return;
        this.isLoadingMessages = true;

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxChat] pancakeDataManager not available');
                return;
            }

            const result = await pdm.fetchMessagesForConversation(
                conv.pageId,
                conv.conversationId,
                null,
                conv.customerId
            );

            // Check if user switched to a different conversation while loading
            if (this.activeConversationId !== conv.id) return;

            const messages = result.messages || [];

            // Store full response metadata for stats bar, post info, activities
            conv._messagesData = {
                post: result.post || result.conversation?.post || null,
                customers: result.customers || [],
                reports_by_phone: result.reports_by_phone || {},
                comment_count: result.comment_count || 0,
                recent_phone_numbers: result.recent_phone_numbers || result.conv_recent_phone_numbers || [],
                activities: result.activities || [],
                conv_phone_numbers: result.conv_phone_numbers || [],
                notes: result.notes || [],
            };

            // Detect livestream from post data
            // post.type === 'livestream' → livestream (live_video_status: 'vod' or 'live')
            // post.type === 'video' / other → NOT livestream (reel, video post, etc.)
            const post = conv._messagesData.post;
            const postType = post?.type;
            const liveVideoStatus = post?.live_video_status;
            const wasLivestream = conv.isLivestream;

            if (postType === 'livestream' || liveVideoStatus === 'vod' || liveVideoStatus === 'live') {
                this.data.markAsLivestream(conv.id, conv._raw?.post_id);
                conv.isLivestream = true;
            } else if (conv.type === 'COMMENT' && post) {
                // COMMENT conversation but post is NOT livestream (reel, video, etc.)
                this.data.unmarkAsLivestream(conv.id);
                conv.isLivestream = false;
            }


            // Update status line
            const statusParts = [];
            if (conv.pageName) statusParts.push(conv.pageName);
            if (conv.type === 'COMMENT') statusParts.push('Bình luận');
            if (conv.isLivestream) statusParts.push('Livestream');
            if (postType && postType !== 'livestream') statusParts.push(postType);
            this.elements.chatUserStatus.textContent = statusParts.join(' · ') || '';
            if (conv.isLivestream !== wasLivestream) this.renderConversationList();

            // Extract phone from response for order form
            // recent_phone_numbers can be string[] or {phone_number}[]
            const rpn = conv._messagesData.recent_phone_numbers?.[0];
            const rpnPhone = typeof rpn === 'string' ? rpn : rpn?.phone_number || '';
            const extractedPhone = conv._messagesData.conv_phone_numbers?.[0]
                || rpnPhone
                || conv._messagesData.customers?.[0]?.recent_phone_numbers?.[0]?.phone_number
                || '';
            if (extractedPhone) conv.phone = extractedPhone;

            // Preserve optimistic messages (temp IDs starting with 'm') before replacing
            const prevOptimistic = (conv.messages || []).filter(m => typeof m.id === 'string' && m.id.startsWith('m'));

            // Map Pancake messages to inbox format
            conv.messages = messages.map(msg => {
                const isFromPage = msg.from?.id === conv.pageId;
                // Prefer original_message (clean text) over message (has HTML tags)
                const text = msg.original_message || this.stripHtml(msg.message || '');
                return {
                    id: msg.id,
                    text,
                    time: this.parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                    sender: isFromPage ? 'shop' : 'customer',
                    attachments: msg.attachments || [],
                    senderName: msg.from?.name || '',
                    fromId: msg.from?.id || '',
                    reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                    reactionSummary: msg.reaction_summary || msg.reactions || null,
                    phoneInfo: msg.phone_info || [],
                    isHidden: msg.is_hidden || false,
                    isRemoved: msg.is_removed || false,
                    userLikes: msg.user_likes || false,
                    canHide: msg.can_hide !== false,
                    canRemove: msg.can_remove !== false,
                    canLike: msg.can_like !== false,
                };
            });

            // Re-append optimistic messages not yet confirmed by API
            // Check if API already returned a message with matching text+sender (confirmed)
            for (const opt of prevOptimistic) {
                const alreadyInApi = conv.messages.some(m =>
                    m.sender === opt.sender && m.text === opt.text &&
                    Math.abs(new Date(m.time) - new Date(opt.time)) < 60000
                );
                if (!alreadyInApi) {
                    conv.messages.push(opt);
                }
            }

            // Messages from API are already oldest-first, no reverse needed

            // Reset pagination state
            this.hasMoreMessages = true;
            this.messageCurrentCount = conv.messages.length;

            // Update lastMessage from actual loaded messages (snippet from API may be stale)
            if (conv.messages.length > 0) {
                const lastVisibleMsg = [...conv.messages].reverse().find(m => {
                    const t = (m.text || '').trim();
                    if (t.startsWith('Đã thêm nhãn tự động:') || t.startsWith('Đã đặt giai đoạn')) return false;
                    if (t === '[Tin nhắn trống]') return false;
                    return true;
                });
                if (lastVisibleMsg) {
                    const msgText = (lastVisibleMsg.text || '').trim();
                    if (msgText) {
                        conv.lastMessage = msgText;
                    } else if (lastVisibleMsg.attachments?.length > 0) {
                        conv.lastMessage = '[Hình ảnh]';
                    }
                    // Update isCustomerLast from actual last message sender
                    conv.isCustomerLast = lastVisibleMsg.sender === 'customer';
                    this.renderConversationList();
                }
            }

            this.renderMessages(conv);

            // Render customer stats bar and post info
            this.renderCustomerStatsBar(conv);
            this.renderPostInfo(conv);
            this.renderActivities(conv);
            this.renderNotes(conv);

            // Auto-fill order form with extracted phone
            if (window.inboxOrders && conv.phone) {
                window.inboxOrders.fillCustomerInfo(conv);
            }

        } catch (error) {
            console.error('[InboxChat] Error loading messages:', error);
            if (this.activeConversationId === conv.id) {
                this.elements.chatMessages.innerHTML = `
                    <div class="chat-empty-state">
                        <p>Lỗi tải tin nhắn: ${this.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        } finally {
            this.isLoadingMessages = false;
        }
    }

    // ===== Chat Messages =====

    renderMessages(conv) {
        if (!conv.messages || conv.messages.length === 0) {
            this.elements.chatMessages.innerHTML = `
                <div class="chat-empty-state">
                    <i data-lucide="message-square"></i>
                    <p>Chưa có tin nhắn</p>
                </div>
            `;
            this._debouncedCreateIcons();
            return;
        }

        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        // Build message avatar HTML with 4-tier fallback (like tpos-pancake)
        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar || conv._raw?.from?.picture?.data?.url || conv._raw?.from?.profile_pic || conv._raw?.customers?.[0]?.avatar || null;
        let msgAvatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            msgAvatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }
        const msgAvatarHtml = (msgAvatarUrl && !msgAvatarUrl.startsWith('data:image/svg'))
            ? `<img src="${msgAvatarUrl}" class="message-avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=\\'message-avatar\\' style=\\'background:${gradient}\\'>${initial}</div>'">`
            : `<div class="message-avatar" style="background:${gradient};">${initial}</div>`;
        let lastDate = '';

        let html = conv.messages.filter(msg => {
            // Hide auto-label system messages
            const t = (msg.text || '').trim();
            if (t.startsWith('Đã thêm nhãn tự động:') || t.startsWith('Đã đặt giai đoạn')) return false;
            if (t === '[Tin nhắn trống]') return false;
            return true;
        }).map(msg => {
            const msgDate = this.formatDate(msg.time);
            let dateSeparator = '';
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                dateSeparator = `
                    <div class="chat-date-separator">
                        <span>${msgDate}</span>
                    </div>
                `;
            }

            const isOutgoing = msg.sender === 'shop';
            const isHidden = msg.isHidden || false;
            const isRemoved = msg.isRemoved || false;

            // Build message content (text + attachments)
            let messageContent = '';

            // Render attachments first (above text, like tpos-pancake)
            const mediaAttachments = (msg.attachments || []).filter(a => a.type !== 'reaction');
            if (mediaAttachments.length > 0) {
                messageContent += this.renderAttachments(mediaAttachments);
            }

            if (msg.text) {
                messageContent += `<div class="message-text">${this.formatMessageText(msg.text)}</div>`;
            }

            // Phone tags from phone_info
            const phoneInfo = msg.phoneInfo || [];
            let phoneTagsHtml = '';
            if (phoneInfo.length > 0) {
                phoneTagsHtml = phoneInfo.map(pi =>
                    `<span class="msg-phone-tag" onclick="navigator.clipboard.writeText('${this.escapeHtml(pi.phone_number)}');showToast('Đã copy: ${this.escapeHtml(pi.phone_number)}','success')" title="Click để copy">
                        <i data-lucide="phone"></i> ${this.escapeHtml(pi.phone_number)}
                    </span>`
                ).join('');
            }

            // Reactions (from attachments + reaction_summary)
            const reactions = msg.reactions || [];
            let reactionsHtml = '';
            if (reactions.length > 0) {
                const emojis = reactions.map(r => r.emoji || '❤️').join('');
                reactionsHtml = `<span class="message-reactions">${emojis}</span>`;
            }
            // Also show reaction_summary (LIKE, LOVE, HAHA, WOW, SAD, ANGRY)
            const reactionSummary = msg.reactionSummary;
            if (reactionSummary && typeof reactionSummary === 'object') {
                const reactionIcons = { LIKE: '👍', LOVE: '❤️', HAHA: '😆', WOW: '😮', SAD: '😢', ANGRY: '😠', CARE: '🤗' };
                const parts = Object.entries(reactionSummary)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => `<span class="reaction-badge">${reactionIcons[type] || '👍'}${count > 1 ? ' ' + count : ''}</span>`);
                if (parts.length > 0) {
                    reactionsHtml += `<div class="message-reaction-summary">${parts.join('')}</div>`;
                }
            }

            if (!messageContent && !reactionsHtml && !phoneTagsHtml) {
                messageContent = '<div class="message-text" style="opacity:0.5">[Tin nhắn trống]</div>';
            }

            // Hidden/removed indicator
            let statusIndicator = '';
            if (isRemoved) {
                statusIndicator = '<span class="msg-status-indicator removed" title="Đã xóa"><i data-lucide="trash-2"></i></span>';
            } else if (isHidden) {
                statusIndicator = '<span class="msg-status-indicator hidden-msg" title="Đã ẩn"><i data-lucide="eye-off"></i></span>';
            }

            // Reply type badge (private_replies = nhắn riêng)
            const replyTypeBadge = msg.replyType === 'private_replies'
                ? '<span class="msg-reply-type-badge private"><i data-lucide="lock"></i> Nhắn riêng</span>'
                : '';

            // Sender name for outgoing messages (staff name)
            const senderHtml = isOutgoing && msg.senderName
                ? `<span class="message-sender">${this.escapeHtml(msg.senderName)}</span>`
                : '';

            // Determine message type for visual distinction
            const isComment = conv.type === 'COMMENT';
            const isInbox = conv.type === 'INBOX';
            const isPrivateReply = isComment && msg.replyType === 'private_replies';
            const isCommentMsg = isComment && !isPrivateReply;

            // Type badge icon (shown in meta area)
            const typeIcon = isComment
                ? (isPrivateReply
                    ? '<span class="msg-type-icon type-inbox" title="Tin nhắn riêng"><i data-lucide="mail"></i></span>'
                    : '<span class="msg-type-icon type-comment" title="Bình luận"><i data-lucide="message-circle"></i></span>')
                : '';

            // Hover action buttons (like, hide/unhide, delete, reply, react)
            const likeBtn = isComment ? `<button class="msg-action-btn ${msg.userLikes ? 'liked' : ''}" data-action="like" data-msg-id="${msg.id}" title="${msg.userLikes ? 'Bỏ thích' : 'Thích'}"><i data-lucide="${msg.userLikes ? 'heart' : 'heart'}"></i></button>` : '';
            const replyBtn = (isComment && !isOutgoing) ? `<button class="msg-action-btn" data-action="reply" data-msg-id="${msg.id}" title="Trả lời"><i data-lucide="reply"></i></button>` : '';
            const reactBtn = isComment ? `<button class="msg-action-btn" data-action="react" data-msg-id="${msg.id}" title="React"><i data-lucide="smile-plus"></i></button>` : '';
            const hideBtn = isComment ? `<button class="msg-action-btn ${isHidden ? 'active' : ''}" data-action="hide" data-msg-id="${msg.id}" title="${isHidden ? 'Hiện bình luận' : 'Ẩn bình luận'}"><i data-lucide="${isHidden ? 'eye' : 'eye-off'}"></i></button>` : '';
            const deleteBtn = isComment ? `<button class="msg-action-btn danger" data-action="delete" data-msg-id="${msg.id}" title="Xóa bình luận"><i data-lucide="trash-2"></i></button>` : '';
            const copyBtn = `<button class="msg-action-btn" data-action="copy" data-msg-id="${msg.id}" title="Copy tin nhắn"><i data-lucide="copy"></i></button>`;
            // Reply for inbox messages too
            const inboxReplyBtn = isInbox ? `<button class="msg-action-btn" data-action="reply" data-msg-id="${msg.id}" title="Trả lời"><i data-lucide="reply"></i></button>` : '';
            const actionsHtml = `<div class="msg-hover-actions">${replyBtn}${inboxReplyBtn}${reactBtn}${likeBtn}${hideBtn}${copyBtn}${deleteBtn}</div>`;

            return `
                ${dateSeparator}
                <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'} ${isCommentMsg ? 'is-comment' : ''} ${isPrivateReply ? 'is-private-reply' : ''} ${isRemoved ? 'removed' : ''} ${isHidden ? 'hidden-msg' : ''}">
                    ${!isOutgoing ? msgAvatarHtml : ''}
                    <div class="message-bubble">
                        ${messageContent}
                        ${phoneTagsHtml}
                        ${reactionsHtml}
                        <div class="message-meta">
                            ${typeIcon}
                            ${statusIndicator}
                            ${replyTypeBadge}
                            ${senderHtml}
                            <span class="message-time">${this.formatMessageTime(msg.time)}</span>
                            ${isOutgoing ? '<span class="message-read-receipt"><i data-lucide="check-check"></i></span>' : ''}
                        </div>
                    </div>
                    ${actionsHtml}
                </div>
            `;
        }).join('');

        // Typing indicator (set via WebSocket)
        if (conv._isCustomerTyping) {
            html += `
                <div class="message-row incoming">
                    ${msgAvatarHtml}
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            `;
        }

        this.elements.chatMessages.innerHTML = html;
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    /**
     * Render attachments (reference: tpos-pancake renderMessage)
     */
    renderAttachments(attachments) {
        return attachments.map(att => {
            // Replied Message (Quoted message) — no URL needed
            if (att.type === 'replied_message') {
                const quotedText = att.message || '';
                const quotedFrom = att.from?.name || att.from?.admin_name || '';
                const quotedId = att.id || att.message_id || att.mid || '';
                let attachPreview = '';
                if (att.attachments?.length > 0) {
                    const qAtt = att.attachments[0];
                    const qUrl = qAtt.url || qAtt.file_url || '';
                    if ((qAtt.type === 'photo' || qAtt.mime_type?.startsWith('image/')) && qUrl) {
                        attachPreview = `<img src="${qUrl}" style="max-width:60px;max-height:40px;border-radius:4px;margin-top:3px;object-fit:cover;" loading="lazy">`;
                    } else if (qAtt.type === 'sticker' && qUrl) {
                        attachPreview = `<img src="${qUrl}" style="max-width:40px;max-height:40px;margin-top:3px;" loading="lazy">`;
                    } else {
                        attachPreview = `<span style="font-size:11px;color:#9ca3af;"><i data-lucide="paperclip" style="width:10px;height:10px;display:inline;"></i> Tệp đính kèm</span>`;
                    }
                }
                const content = quotedText
                    ? `<div style="font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;">${this.escapeHtml(quotedText)}</div>`
                    : (attachPreview || '<span style="font-size:11px;color:#9ca3af;">[Tin nhắn]</span>');
                return `<div class="quoted-message" ${quotedId ? `data-msg-id="${quotedId}"` : ''}>
                    <div style="font-size:11px;color:#6b7280;margin-bottom:2px;"><i data-lucide="corner-up-left" style="width:10px;height:10px;display:inline;"></i> ${this.escapeHtml(quotedFrom)}</div>
                    ${content}${quotedText && attachPreview ? `<div>${attachPreview}</div>` : ''}
                </div>`;
            }

            const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
            if (!url) return '';

            // Image
            if (att.type === 'image' || att.type === 'photo' || att.mime_type?.startsWith('image/')) {
                return `<div class="message-media"><img class="message-image" src="${url}" alt="Ảnh" onclick="window.open('${url}','_blank')" loading="lazy"></div>`;
            }
            // Sticker / GIF
            if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_url') {
                return `<div class="message-media"><img class="message-sticker" src="${url}" alt="Sticker" loading="lazy"></div>`;
            }
            // Video
            if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
                return `<div class="message-media"><video controls src="${url}" preload="metadata" style="max-width:240px;border-radius:8px;"></video></div>`;
            }
            // Audio
            if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
                return `<div class="message-media"><audio controls src="${url}" preload="metadata"></audio></div>`;
            }
            // File
            if (att.type === 'file' || att.type === 'document') {
                const fileName = att.name || att.filename || 'Tệp đính kèm';
                return `<div class="message-file"><a href="${url}" target="_blank" rel="noopener"><i data-lucide="file-text"></i> ${this.escapeHtml(fileName)}</a></div>`;
            }
            // Like/thumbsup
            if (att.type === 'like' || att.type === 'thumbsup') {
                return `<div class="message-like">👍</div>`;
            }
            return '';
        }).join('');
    }

    /**
     * Get page access token with multi-account fallback
     * Step 1: Check cache
     * Step 2: Try active account generate
     * Step 3: Fallback to other accounts with page access
     */
    async _getPageAccessTokenWithFallback(pageId) {
        const ptm = window.pancakeTokenManager;
        if (!ptm) return null;

        // Step 1: Check cache
        let token = ptm.getPageAccessToken(pageId);
        if (token) return token;

        // Step 2: Try generating with active account
        const activeToken = ptm.currentToken;
        if (activeToken) {
            token = await ptm.generatePageAccessTokenWithToken(pageId, activeToken);
            if (token) return token;
        }

        // Step 3: Fallback to other accounts with page access
        console.log('[InboxChat] Active account cannot access page', pageId, '- trying other accounts...');
        if (Object.keys(ptm.accountPageAccessMap || {}).length === 0) {
            await ptm.prefetchAllAccountPages();
        }
        const fallbackAccount = ptm.findAccountWithPageAccess(pageId, ptm.activeAccountId);
        if (fallbackAccount) {
            console.log('[InboxChat] Fallback account:', fallbackAccount.name);
            token = await ptm.generatePageAccessTokenWithToken(pageId, fallbackAccount.token);
            if (token) return token;
        }

        return null;
    }

    /**
     * Send a real message via Pancake API
     */
    /**
     * Parse Facebook API error from response
     */
    _parseFbError(responseText) {
        try {
            const data = JSON.parse(responseText);
            const eCode = data.e_code || data.error_code || data.error?.code || 0;
            const eSubcode = data.e_subcode || data.error_subcode || data.error?.error_subcode || 0;
            const message = data.message || data.error?.message || responseText;
            const is24HourError = (eCode === 10 && eSubcode === 2018278) ||
                (message && message.includes('khoảng thời gian cho phép'));
            const isUserUnavailable = (eCode === 551) ||
                (message && message.includes('không có mặt'));
            return { eCode, eSubcode, message, is24HourError, isUserUnavailable, raw: data };
        } catch {
            return { eCode: 0, eSubcode: 0, message: responseText, is24HourError: false, isUserUnavailable: false, raw: null };
        }
    }

    /**
     * Send API request helper
     */
    async _sendApi(url, payload) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errText = await response.text();
            const parsed = this._parseFbError(errText);
            const err = new Error(parsed.message);
            err.status = response.status;
            err.fbError = parsed;
            throw err;
        }
        return response;
    }

    async sendMessage() {
        if (!this.activeConversationId || this.isSending) return;

        const text = this.elements.chatInput.value.trim();
        const imageFile = this.pendingImage;
        const hasImage = !!imageFile;

        // Need either text or image
        if (!text && !hasImage) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        // COMMENT conversations: reply_comment requires a specific comment target
        if (!hasImage && conv.type === 'COMMENT' && !this.replyingTo) {
            if (!this.currentReplyType || this.currentReplyType === 'reply_comment') {
                showToast('Chọn bình luận để trả lời, hoặc đổi kiểu sang "Nhắn riêng".', 'warning');
                return;
            }
        }

        this.isSending = true;
        this.elements.btnSend.disabled = true;

        // Clear input and preview immediately
        if (hasImage) this._clearImagePreview();
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';

        // Determine send page (from selector or conversation's page)
        const sendPageId = this.currentSendPageId || conv.pageId;

        // 24h window warning (don't block - let API try, handle errors with fallback)
        if (conv.type !== 'COMMENT') {
            const windowCheck = this.data.check24hWindow(this.activeConversationId);
            if (windowCheck.hoursRemaining !== null && windowCheck.hoursRemaining <= 2) {
                showToast(`Cửa sổ 24h còn ${windowCheck.hoursRemaining}h`, 'warning');
            }
        }

        // Capture reply state before clearing
        const replyData = this.replyingTo;
        const replyType = this.currentReplyType;
        this.cancelReply();

        // Optimistic UI update
        const displayText = text || (hasImage ? '[Hình ảnh]' : '');
        this.data.addMessage(this.activeConversationId, displayText, 'shop', replyType ? { replyType } : {});
        this.renderMessages(conv);
        this.renderConversationList();

        try {
            console.log(`[InboxChat] Sending from page: ${sendPageId}, conv page: ${conv.pageId} (${conv.pageName}), conv: ${conv.conversationId}, type: ${conv.type}`);
            const pageAccessToken = await this._getPageAccessTokenWithFallback(sendPageId);
            if (!pageAccessToken) {
                throw new Error(`Không tìm thấy page_access_token cho page ${sendPageId}. Không có account nào có quyền truy cập page này.`);
            }

            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${sendPageId}/conversations/${conv.conversationId}/messages`,
                pageAccessToken
            );

            // Send image first if pending (like orders-report pattern)
            if (hasImage) {
                showToast('Đang tải ảnh lên...', 'info');
                const pdm = window.pancakeDataManager;
                if (!pdm) throw new Error('pancakeDataManager not available');

                const uploadResult = await pdm.uploadImage(sendPageId, imageFile);
                if (!uploadResult?.content_url) throw new Error('Upload ảnh thất bại');

                await this._sendApi(url, {
                    action: 'reply_inbox',
                    message: '',
                    content_url: uploadResult.content_url
                });
                console.log('[InboxChat] Image sent successfully');
            }

            // Send text (with 300ms delay if image was also sent)
            if (text) {
                if (hasImage) await new Promise(r => setTimeout(r, 300));

                if (conv.type === 'COMMENT') {
                    await this._sendComment(url, text, conv, replyData, replyType);
                } else {
                    await this._sendInbox(url, text, conv, replyData);
                }
            }

            // Auto mark as read after sending message
            this.data.markAsRead(this.activeConversationId);
            this.renderConversationList();

            setTimeout(async () => {
                if (this.activeConversationId === conv.id) {
                    const pdm = window.pancakeDataManager;
                    if (pdm) pdm.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
                    await this.loadMessages(conv);
                }
            }, 2000);

        } catch (error) {
            console.error('[InboxChat] Error sending message:', error);
            const fb = error.fbError;
            if (fb?.is24HourError) {
                showToast('Đã quá 24h. Khách cần nhắn tin trước mới gửi lại được.', 'error');
            } else if (fb?.isUserUnavailable) {
                showToast('Không thể gửi: Khách chưa từng inbox hoặc đã block page.', 'error');
            } else {
                showToast('Lỗi gửi tin nhắn: ' + error.message, 'error');
            }
        } finally {
            this.isSending = false;
            this.elements.btnSend.disabled = false;
            // Ensure input is always cleared after send attempt
            this.elements.chatInput.value = '';
            this.elements.chatInput.style.height = 'auto';
        }
    }

    /**
     * Send to INBOX conversation with fallback chain:
     * reply_inbox → private_replies (if 24h/551 and comment data available)
     */
    async _sendInbox(url, text, conv, replyData) {
        const payload = { action: 'reply_inbox', message: text };
        if (replyData?.msgId) payload.replied_message_id = replyData.msgId;

        console.log('[InboxChat] Sending reply_inbox:', { pageId: conv.pageId, convId: conv.conversationId });

        try {
            await this._sendApi(url, payload);
            console.log('[InboxChat] reply_inbox succeeded');
            return;
        } catch (err) {
            const fb = err.fbError;
            if (!fb?.is24HourError && !fb?.isUserUnavailable) throw err;

            // 24h or 551 error → try private_replies if we have comment/post data
            const postId = conv._raw?.post_id || conv._messagesData?.post?.id || '';
            const fromId = conv.psid || conv._raw?.from?.id || '';

            if (!postId || !fromId) {
                console.warn('[InboxChat] No post/comment data for private_replies fallback');
                throw err; // Re-throw original error
            }

            console.log('[InboxChat] reply_inbox failed (24h/551), trying private_replies fallback...');
            showToast('Inbox thất bại, đang thử gửi qua comment...', 'warning');

            try {
                await this._sendApi(url, {
                    action: 'private_replies',
                    post_id: postId,
                    message_id: conv.conversationId,
                    from_id: fromId,
                    message: text
                });
                console.log('[InboxChat] private_replies fallback succeeded');
                showToast('Đã gửi qua private reply', 'success');
                return;
            } catch (err2) {
                console.warn('[InboxChat] private_replies fallback also failed');
                throw err; // Throw original 24h/551 error for user-friendly message
            }
        }
    }

    /**
     * Send to COMMENT conversation.
     * Two modes:
     * - reply_comment: public comment reply (visible in chat)
     * - private_replies: private message to commenter (fallback: reply_inbox)
     */
    async _sendComment(url, text, conv, replyData, selectedReplyType) {
        const postId = conv._raw?.post_id || conv._messagesData?.post?.id || '';
        const fromId = conv.psid || conv._raw?.from?.id || '';
        const messageId = replyData?.msgId || conv.conversationId;
        const type = selectedReplyType || 'reply_comment';

        if (type === 'reply_comment') {
            // Public comment reply — visible in chat thread
            console.log('[InboxChat] Sending reply_comment:', { messageId });
            try {
                await this._sendApi(url, { action: 'reply_comment', message_id: messageId, message: text });
                console.log('[InboxChat] reply_comment succeeded');
                return;
            } catch (err) {
                console.warn('[InboxChat] reply_comment failed:', err.message);
                // Fallback to private_replies
                console.log('[InboxChat] Fallback to private_replies...');
                try {
                    await this._sendApi(url, { action: 'private_replies', post_id: postId, message_id: messageId, from_id: fromId, message: text });
                    showToast('Bình luận thất bại, đã gửi nhắn riêng', 'warning');
                    return;
                } catch (err2) {
                    console.warn('[InboxChat] private_replies fallback failed:', err2.message);
                    throw err; // Throw original error
                }
            }
        } else {
            // Private reply — send private message to commenter
            console.log('[InboxChat] Sending private_replies:', { postId, messageId, fromId });
            try {
                await this._sendApi(url, { action: 'private_replies', post_id: postId, message_id: messageId, from_id: fromId, message: text });
                console.log('[InboxChat] private_replies succeeded');
                showToast('Đã nhắn riêng cho người bình luận', 'info');
                return;
            } catch (err) {
                console.warn('[InboxChat] private_replies failed:', err.message);
                // Fallback to reply_inbox
                console.log('[InboxChat] Fallback to reply_inbox...');
                try {
                    await this._sendApi(url, { action: 'reply_inbox', message: text });
                    showToast('Đã gửi qua Messenger', 'info');
                    return;
                } catch (err2) {
                    console.warn('[InboxChat] reply_inbox fallback failed:', err2.message);
                    throw err; // Throw original error
                }
            }
        }
    }

    /**
     * Attach image — opens file picker, shows preview (send on Enter via sendMessage)
     */
    attachImage() {
        if (!this.activeConversationId) {
            showToast('Vui lòng chọn cuộc hội thoại trước', 'warning');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) this._showImagePreview(file);
        };
        input.click();
    }

    _showImagePreview(file) {
        this.pendingImage = file;
        const preview = document.getElementById('chatImagePreview');
        const img = document.getElementById('chatImagePreviewImg');
        if (preview && img) {
            img.src = URL.createObjectURL(file);
            preview.style.display = 'flex';
        }
        this.elements.chatInput.focus();
    }

    _clearImagePreview() {
        this.pendingImage = null;
        const preview = document.getElementById('chatImagePreview');
        const img = document.getElementById('chatImagePreviewImg');
        if (preview) preview.style.display = 'none';
        if (img) { URL.revokeObjectURL(img.src); img.src = ''; }
    }


    // ===== Chat Label Bar =====

    renderChatLabelBar(conv) {
        this.elements.chatLabelBar.style.display = 'block';
        const labels = conv.labels || ['new'];
        this.elements.chatLabelBarList.innerHTML = this.data.groups.map(group => {
            const isActive = labels.includes(group.id);
            const activeStyle = isActive ? `background: ${group.color}; border-color: ${group.color};` : '';
            return `
                <button class="chat-label-btn ${isActive ? 'active' : ''}"
                        style="${activeStyle}"
                        onclick="window.inboxChat.assignLabel('${conv.id}', '${group.id}')">
                    <span class="chat-label-dot" style="background: ${isActive ? 'rgba(255,255,255,0.7)' : group.color}"></span>
                    ${this.escapeHtml(group.name)}
                </button>
            `;
        }).join('');
    }

    assignLabel(convId, labelId) {
        this.data.toggleConversationLabel(convId, labelId);
        this.renderConversationList();
        this.renderGroupStats();
        const conv = this.data.getConversation(convId);
        if (conv) this.renderChatLabelBar(conv);
    }

    // ===== Group Stats =====

    renderGroupStats() {
        this.data.recalculateGroupCounts(this.currentTypeFilter);
        const iconMap = {
            'new': 'inbox', 'processing': 'loader', 'waiting': 'clock',
            'ordered': 'shopping-cart', 'urgent': 'alert-triangle', 'done': 'check-circle',
        };

        this.elements.groupStatsList.innerHTML = this.data.groups.map(group => {
            const icon = iconMap[group.id] || 'tag';
            const isActive = this.currentGroupFilters.has(group.id);
            const note = group.note || 'Chưa có mô tả cho nhóm này.';

            return `
                <div class="group-stats-card ${isActive ? 'active' : ''}"
                     onclick="window.inboxChat.filterByGroup('${group.id}')">
                    <div class="group-stats-card-color" style="background: ${group.color}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="group-stats-card-body">
                        <div class="group-stats-card-name">${this.escapeHtml(group.name)}</div>
                        <div class="group-stats-card-count"><strong>${group.count}</strong> khách hàng</div>
                    </div>
                    <button class="group-stats-card-help" onclick="event.stopPropagation()" title="Thông tin">
                        ?
                        <div class="stats-tooltip">${this.escapeHtml(note)}</div>
                    </button>
                </div>
            `;
        }).join('');

        this._debouncedCreateIcons();
    }

    filterByGroup(groupId) {
        if (this.currentGroupFilters.has(groupId)) {
            this.currentGroupFilters.delete(groupId);
        } else {
            this.currentGroupFilters.add(groupId);
        }
        this.renderConversationList();
        this.renderGroupStats();
    }

    // ===== Render Data Modal =====

    async showRenderDataModal() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

        // Show loading modal immediately
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="width:90vw;max-width:900px;max-height:85vh;display:flex;flex-direction:column;">
                <div class="modal-header">
                    <h3>Dữ liệu Render DB</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body" style="flex:1;overflow-y:auto;padding:0;">
                    <div style="text-align:center;padding:2rem;color:var(--text-tertiary);">
                        <div class="typing-indicator" style="justify-content:center;margin-bottom:8px;">
                            <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                        </div>
                        Đang tải dữ liệu...
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Fetch all endpoints in parallel
        const endpoints = [
            { name: 'Livestream Convs', url: '/api/realtime/livestream-conversations', key: 'posts' },
            { name: 'Labels', url: '/api/realtime/conversation-labels', key: 'labelMap' },
            { name: 'Pending Customers', url: '/api/realtime/pending-customers?limit=500', key: 'customers' },
            { name: 'Realtime Status', url: '/api/realtime/status', key: null },
        ];

        const results = await Promise.all(endpoints.map(async (ep) => {
            try {
                const res = await fetch(workerUrl + ep.url);
                const data = await res.json();
                return { name: ep.name, url: ep.url, data, ok: true };
            } catch (err) {
                return { name: ep.name, url: ep.url, data: { error: err.message }, ok: false };
            }
        }));

        // Build tabs HTML
        const body = modal.querySelector('.modal-body');
        let tabsHtml = '<div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;">';
        results.forEach((r, i) => {
            const count = r.ok ? this._renderDataCount(r) : '!';
            tabsHtml += `<button class="render-data-tab ${i === 0 ? 'active' : ''}" data-idx="${i}"
                style="flex:1;padding:8px 4px;border:none;background:${i === 0 ? 'var(--gray-100)' : 'transparent'};
                font-size:0.7rem;cursor:pointer;border-bottom:2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};">
                ${r.name} <span style="opacity:0.6;">(${count})</span>
            </button>`;
        });
        tabsHtml += '</div>';

        let panelsHtml = '';
        results.forEach((r, i) => {
            const json = JSON.stringify(r.data, null, 2);
            panelsHtml += `<div class="render-data-panel" data-idx="${i}" style="display:${i === 0 ? 'block' : 'none'};padding:12px;overflow:auto;flex:1;">
                <div style="margin-bottom:8px;font-size:0.7rem;color:var(--text-tertiary);">
                    GET ${workerUrl}${r.url}
                </div>
                <pre style="font-size:0.7rem;white-space:pre-wrap;word-break:break-all;margin:0;background:var(--gray-50);padding:8px;border-radius:4px;max-height:60vh;overflow:auto;">${this.escapeHtml(json)}</pre>
            </div>`;
        });

        body.innerHTML = tabsHtml + '<div style="flex:1;overflow:auto;">' + panelsHtml + '</div>';

        // Tab switching
        body.querySelectorAll('.render-data-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                body.querySelectorAll('.render-data-tab').forEach(t => {
                    t.classList.remove('active');
                    t.style.background = 'transparent';
                    t.style.borderBottomColor = 'transparent';
                });
                tab.classList.add('active');
                tab.style.background = 'var(--gray-100)';
                tab.style.borderBottomColor = 'var(--primary)';
                body.querySelectorAll('.render-data-panel').forEach(p => p.style.display = 'none');
                body.querySelector(`.render-data-panel[data-idx="${tab.dataset.idx}"]`).style.display = 'block';
            });
        });
    }

    _renderDataCount(result) {
        const d = result.data;
        if (!d) return '0';
        if (d.totalConversations !== undefined) return d.totalConversations;
        if (d.total !== undefined) return d.total;
        if (d.customers) return d.customers.length;
        if (d.labelMap) return Object.keys(d.labelMap).length;
        if (d.connected !== undefined) return d.connected ? 'ON' : 'OFF';
        return '?';
    }

    // ===== Manage Groups Modal =====

    showManageGroupsModal() {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-title"><i data-lucide="settings"></i> Quản Lý Nhóm</div>
                <div class="modal-body">
                    <div class="modal-group-list" id="modalGroupList">
                        ${this.data.groups.map((group) => `
                            <div class="modal-group-item" data-group-id="${group.id}">
                                <div class="modal-group-color-pick" style="background: ${group.color}"
                                     onclick="window.inboxChat._toggleColorPicker(this, '${group.id}')"></div>
                                <div class="modal-group-fields">
                                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(group.name)}"
                                           placeholder="Tên nhóm" data-group-id="${group.id}" />
                                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                                              data-group-id="${group.id}" rows="2">${this.escapeHtml(group.note || '')}</textarea>
                                </div>
                                <button class="modal-group-delete" title="Xóa nhóm"
                                        onclick="window.inboxChat._deleteGroupInModal('${group.id}', this)">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-add-section">
                        <h4>Thêm Nhóm Mới</h4>
                        <div class="modal-add-row">
                            <div class="modal-add-fields">
                                <input type="text" id="modalNewGroupName" placeholder="Tên nhóm mới..." />
                                <textarea id="modalNewGroupNote" placeholder="Ghi chú cho nhóm..." rows="2"></textarea>
                                <div class="modal-color-picker">
                                    ${colors.map((c, i) => `
                                        <div class="color-option ${i === 0 ? 'selected' : ''}" style="background: ${c}" data-color="${c}"
                                             onclick="this.parentElement.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected');"></div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="btn-modal-add" id="btnModalAddGroup">+ Thêm</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-cancel" id="btnModalCancel">Đóng</button>
                    <button class="btn-modal-confirm" id="btnModalSave">Lưu Thay Đổi</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this._debouncedCreateIcons();

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('btnModalCancel').addEventListener('click', () => overlay.remove());

        document.getElementById('btnModalAddGroup').addEventListener('click', () => {
            const name = document.getElementById('modalNewGroupName').value.trim();
            const note = document.getElementById('modalNewGroupNote').value.trim();
            const color = overlay.querySelector('.modal-add-section .color-option.selected')?.dataset.color || '#3b82f6';
            if (!name) { showToast('Vui lòng nhập tên nhóm', 'warning'); return; }
            this.data.addGroup(name, color, note);
            const newGroup = this.data.groups[this.data.groups.length - 1];
            const listEl = document.getElementById('modalGroupList');
            const newItem = document.createElement('div');
            newItem.className = 'modal-group-item';
            newItem.dataset.groupId = newGroup.id;
            newItem.innerHTML = `
                <div class="modal-group-color-pick" style="background: ${newGroup.color}"
                     onclick="window.inboxChat._toggleColorPicker(this, '${newGroup.id}')"></div>
                <div class="modal-group-fields">
                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(newGroup.name)}"
                           placeholder="Tên nhóm" data-group-id="${newGroup.id}" />
                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                              data-group-id="${newGroup.id}" rows="2">${this.escapeHtml(newGroup.note || '')}</textarea>
                </div>
                <button class="modal-group-delete" title="Xóa nhóm"
                        onclick="window.inboxChat._deleteGroupInModal('${newGroup.id}', this)">&times;</button>
            `;
            listEl.appendChild(newItem);
            document.getElementById('modalNewGroupName').value = '';
            document.getElementById('modalNewGroupNote').value = '';
            showToast('Đã thêm nhóm: ' + name, 'success');
        });

        document.getElementById('btnModalSave').addEventListener('click', async () => {
            // Update all groups locally (name, note, color)
            overlay.querySelectorAll('.modal-group-item').forEach(item => {
                const groupId = item.dataset.groupId;
                const nameInput = item.querySelector('.modal-group-name-input');
                const noteInput = item.querySelector('.modal-group-note-input');
                const colorEl = item.querySelector('.modal-group-color-pick');
                if (nameInput && noteInput) {
                    const group = this.data.groups.find(g => g.id === groupId);
                    if (group) {
                        group.name = nameInput.value.trim();
                        group.note = noteInput.value.trim();
                        if (colorEl) group.color = colorEl.style.background || colorEl.style.backgroundColor;
                    }
                }
            });
            // Save + server sync with feedback
            this.data.save();
            const ok = await this.data.saveGroupsToServer();
            this.renderGroupStats();
            this.renderConversationList();
            if (this.activeConversationId) {
                const conv = this.data.getConversation(this.activeConversationId);
                if (conv) this.renderChatLabelBar(conv);
            }
            overlay.remove();
            showToast(ok ? 'Đã lưu thay đổi nhóm lên server' : 'Lưu local OK, nhưng server lỗi', ok ? 'success' : 'warning');
        });
    }

    _deleteGroupInModal(groupId, btnEl) {
        if (!confirm('Xóa nhóm này? Các cuộc hội thoại sẽ chuyển về "Inbox Mới".')) return;
        this.data.deleteGroup(groupId);
        btnEl.closest('.modal-group-item')?.remove();
        showToast('Đã xóa nhóm', 'success');
    }

    _toggleColorPicker(el, groupId) {
        const existing = el.parentElement.querySelector('.color-popover');
        if (existing) { existing.remove(); return; }
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];
        const popover = document.createElement('div');
        popover.className = 'color-popover';
        popover.innerHTML = colors.map(c => `<div class="color-option" style="background: ${c}" data-color="${c}"></div>`).join('');
        el.style.position = 'relative';
        el.appendChild(popover);
        popover.addEventListener('click', (e) => {
            const opt = e.target.closest('.color-option');
            if (!opt) return;
            el.style.background = opt.dataset.color;
            this.data.updateGroup(groupId, { color: opt.dataset.color });
            popover.remove();
            e.stopPropagation();
        });
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && e.target !== el) { popover.remove(); document.removeEventListener('click', closeHandler); }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    // ===== Customer Stats Bar (reference: tpos-pancake renderCustomerStatsBar) =====

    renderCustomerStatsBar(conv) {
        const bar = document.getElementById('customerStatsBar');
        if (!bar) return;

        const data = conv._messagesData;
        if (!data) { bar.style.display = 'none'; return; }

        // Phone number
        const phone = conv.phone || '';

        // Comment count
        const commentCount = data.comment_count || 0;

        // Order stats from reports_by_phone or customer data
        let successOrders = 0, failOrders = 0;
        const customer = data.customers?.[0];

        if (phone && data.reports_by_phone) {
            // Try both formats: "0944333435" and "+84944333435"
            const phoneKey = Object.keys(data.reports_by_phone).find(k =>
                k.includes(phone.replace(/^0/, '')) || k === phone
            );
            if (phoneKey) {
                const report = data.reports_by_phone[phoneKey];
                successOrders = report.order_success || 0;
                failOrders = report.order_fail || 0;
            }
        }
        if (!successOrders && customer) {
            successOrders = customer.succeed_order_count || customer.order_count || 0;
        }

        const totalOrders = successOrders + failOrders;
        const returnRate = totalOrders > 0 ? Math.round((failOrders / totalOrders) * 100) : 0;
        const isWarning = returnRate > 30;

        // Phone badge
        const phoneBadge = phone
            ? `<span class="phone-badge" onclick="navigator.clipboard.writeText('${this.escapeHtml(phone)}');showToast('Đã copy: ${this.escapeHtml(phone)}','success')" title="Click để copy">
                    <i data-lucide="phone"></i>
                    <span>${this.escapeHtml(phone)}</span>
               </span>`
            : '';

        bar.innerHTML = `
            <div class="stats-left">${phoneBadge}</div>
            <div class="stats-right">
                <span class="stat-badge comment" title="Đã bình luận ${commentCount} lần">
                    <i data-lucide="message-square"></i><span>${commentCount}</span>
                </span>
                <span class="stat-badge success" title="Đơn thành công: ${successOrders}">
                    <i data-lucide="check-circle"></i><span>${successOrders}</span>
                </span>
                <span class="stat-badge return" title="Đơn hoàn: ${failOrders}">
                    <i data-lucide="undo-2"></i><span>${failOrders}</span>
                </span>
                ${isWarning ? `
                    <span class="stat-badge warning" title="Tỉ lệ hoàn ${returnRate}%">
                        <i data-lucide="alert-triangle"></i>
                    </span>
                ` : ''}
            </div>
        `;
        bar.style.display = 'flex';
        this._debouncedCreateIcons();
    }

    // ===== Post Info Banner (livestream post thumbnail + title) =====

    renderPostInfo(conv) {
        const banner = document.getElementById('postInfoBanner');
        if (!banner) return;

        const post = conv._messagesData?.post;
        if (!post || !post.message) {
            banner.style.display = 'none';
            return;
        }

        const isLivestream = post.type === 'livestream';
        const thumbnail = post.attachments?.data?.[0]?.url || '';
        const postUrl = post.attachments?.target?.url || '';
        const title = post.message || '';
        const truncatedTitle = title.length > 100 ? title.substring(0, 100) + '...' : title;
        const liveStatus = post.live_video_status;
        const statusBadge = isLivestream
            ? `<span class="post-status-badge ${liveStatus === 'vod' ? 'vod' : 'live'}">${liveStatus === 'vod' ? 'VOD' : 'LIVE'}</span>`
            : `<span class="post-status-badge video">${post.type || 'POST'}</span>`;

        banner.innerHTML = `
            ${thumbnail ? `<img class="post-thumbnail" src="${thumbnail}" alt="Post" onclick="${postUrl ? `window.open('${postUrl}','_blank')` : ''}">` : ''}
            <div class="post-info-content">
                <div class="post-info-header">
                    ${statusBadge}
                    <span class="post-page-name">${this.escapeHtml(post.from?.name || conv.pageName || '')}</span>
                </div>
                <div class="post-info-title" title="${this.escapeHtml(title)}">${this.escapeHtml(truncatedTitle)}</div>
                ${postUrl ? `<a class="post-info-link" href="${postUrl}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Xem trên Facebook</a>` : ''}
            </div>
        `;
        banner.style.display = 'flex';
        this._debouncedCreateIcons();
    }

    // ===== Notes Section =====

    renderNotes(conv) {
        const notes = conv._messagesData?.notes || [];

        // Right panel notes (with input)
        const section = document.getElementById('convNotesSection');
        const list = document.getElementById('convNotesList');
        if (section && list) {
            section.style.display = this.activeConversationId ? 'block' : 'none';
            list.innerHTML = notes.map(n => this._noteHtml(n)).join('');
        }

        // Header inline note (display only, next to name)
        const headerNote = document.getElementById('chatHeaderNote');
        if (headerNote) {
            if (notes.length > 0) {
                const latest = notes[0];
                headerNote.textContent = latest.message;
                headerNote.title = notes.map(n => n.message).join('\n');
                headerNote.style.display = 'inline';
            } else {
                headerNote.textContent = '';
                headerNote.style.display = 'none';
            }
        }
    }

    _noteHtml(note) {
        const date = new Date(note.created_at);
        const timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
        const author = note.created_by?.fb_name || '';
        return `<div class="conv-note-item">
            <div class="conv-note-meta"><span class="conv-note-author">${this.escapeHtml(author)}</span> <span class="conv-note-time">${timeStr}</span></div>
            <div class="conv-note-text">${this.escapeHtml(note.message)}</div>
        </div>`;
    }

    async addNote(inputEl) {
        const input = inputEl || document.getElementById('convNoteInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const customerId = conv.customerId || conv._messagesData?.customers?.[0]?.id;
        if (!customerId) {
            showToast('Không tìm thấy customer ID', 'warning');
            return;
        }

        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        input.disabled = true;
        const ok = await pdm.addCustomerNote(conv.pageId, customerId, text);
        input.disabled = false;

        if (ok) {
            input.value = '';
            // Clear the other input too
            const other = input.id === 'convNoteInput' ? document.getElementById('chatNoteBarInput') : document.getElementById('convNoteInput');
            if (other) other.value = '';
            showToast('Đã thêm ghi chú', 'success');
            pdm.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
            await this.loadMessages(conv);
        } else {
            showToast('Lỗi thêm ghi chú', 'error');
        }
    }

    // ===== Activities Panel (col3 tab) =====

    renderActivities(conv) {
        const container = document.getElementById('tabActivities');
        if (!container) return;

        const activities = conv._messagesData?.activities || [];

        if (activities.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;color:var(--text-tertiary);padding:2rem;">
                    <i data-lucide="activity" style="width:32px;height:32px;opacity:0.5;"></i>
                    <p style="margin-top:0.5rem;">Chưa có hoạt động</p>
                </div>
            `;
            this._debouncedCreateIcons();
            return;
        }

        container.innerHTML = `
            <div class="activities-header">
                <h3>Hoạt động trên ${activities.length} bài viết</h3>
            </div>
            <div class="activities-list">
                ${activities.map(act => {
                    const thumb = act.attachments?.data?.[0]?.url || '';
                    const actUrl = act.attachments?.target?.url || '';
                    const actTitle = act.message || '';
                    const truncTitle = actTitle.length > 80 ? actTitle.substring(0, 80) + '...' : actTitle;
                    const actTime = act.inserted_at ? this.formatDate(act.inserted_at) : '';
                    return `
                        <div class="activity-item" ${actUrl ? `onclick="window.open('${actUrl}','_blank')"` : ''}>
                            ${thumb ? `<img class="activity-thumb" src="${thumb}" alt="">` : '<div class="activity-thumb-ph"><i data-lucide="video"></i></div>'}
                            <div class="activity-content">
                                <div class="activity-title">${this.escapeHtml(truncTitle)}</div>
                                <div class="activity-time">${actTime}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        this._debouncedCreateIcons();
    }

    // ===== Strip HTML helper =====

    stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // ===== Message Pagination (like tpos-pancake) =====

    async loadMoreMessages() {
        if (this.isLoadingMoreMessages || !this.hasMoreMessages || !this.activeConversationId) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv || !conv.messages || conv.messages.length === 0) return;

        this.isLoadingMoreMessages = true;
        const container = this.elements.chatMessages;
        const scrollHeightBefore = container.scrollHeight;

        // Show loading indicator at top
        const loader = document.createElement('div');
        loader.className = 'load-more-indicator';
        loader.innerHTML = '<div class="loading-spinner" style="width:24px;height:24px;"></div><span>Đang tải tin nhắn cũ...</span>';
        container.insertBefore(loader, container.firstChild);

        try {
            const pdm = window.pancakeDataManager;
            const result = await pdm.fetchMessagesForConversation(
                conv.pageId, conv.conversationId, this.messageCurrentCount, conv.customerId
            );

            if (this.activeConversationId !== conv.id) return;
            loader.remove();

            const olderMessages = result.messages || [];
            if (olderMessages.length === 0) {
                this.hasMoreMessages = false;
                const endMarker = document.createElement('div');
                endMarker.className = 'chat-date-separator';
                endMarker.innerHTML = '<span>— Đầu cuộc hội thoại —</span>';
                container.insertBefore(endMarker, container.firstChild);
            } else {
                const mapped = olderMessages.map(msg => {
                    const isFromPage = msg.from?.id === conv.pageId;
                    return {
                        id: msg.id,
                        text: msg.original_message || this.stripHtml(msg.message || ''),
                        time: this.parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                        sender: isFromPage ? 'shop' : 'customer',
                        attachments: msg.attachments || [],
                        senderName: msg.from?.name || '',
                        fromId: msg.from?.id || '',
                        reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                        reactionSummary: msg.reaction_summary || msg.reactions || null,
                        phoneInfo: msg.phone_info || [],
                        isHidden: msg.is_hidden || false,
                        isRemoved: msg.is_removed || false,
                        userLikes: msg.user_likes || false,
                        canHide: msg.can_hide !== false,
                        canRemove: msg.can_remove !== false,
                        canLike: msg.can_like !== false,
                    };
                });

                // API returns oldest-first, prepend older messages before current
                conv.messages = [...mapped, ...conv.messages];
                this.messageCurrentCount = conv.messages.length;
                this.renderMessages(conv);

                // Maintain scroll position
                const scrollHeightAfter = container.scrollHeight;
                container.scrollTop = scrollHeightAfter - scrollHeightBefore;
            }
        } catch (error) {
            console.error('[InboxChat] Error loading more messages:', error);
            loader.remove();
        } finally {
            this.isLoadingMoreMessages = false;
        }
    }

    // ===== Quick Replies (like tpos-pancake) =====

    renderQuickReplies() {
        // Quick reply bar disabled
        const bar = document.getElementById('quickReplyBar');
        if (bar) bar.style.display = 'none';
    }

    // ===== File Attachment =====

    async attachFile() {
        if (!this.activeConversationId) {
            showToast('Vui lòng chọn cuộc hội thoại trước', 'warning');
            return;
        }
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 25 * 1024 * 1024) {
                showToast('File quá lớn (tối đa 25MB)', 'warning');
                return;
            }
            try {
                showToast('Đang tải file lên...', 'info');
                const pdm = window.pancakeDataManager;
                if (!pdm) throw new Error('pancakeDataManager not available');

                const sendPageId = this.currentSendPageId || conv.pageId;
                const result = await pdm.uploadImage(sendPageId, file);
                if (result && result.url) {
                    const pageAccessToken = await this._getPageAccessTokenWithFallback(sendPageId);
                    if (!pageAccessToken) throw new Error('Không tìm thấy page_access_token');
                    const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                        `pages/${sendPageId}/conversations/${conv.conversationId}/messages`,
                        pageAccessToken
                    );
                    await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'reply_inbox',
                            message: '',
                            content_url: result.url
                        })
                    });
                    showToast('Đã gửi file: ' + file.name, 'success');
                    this.data.markAsRead(this.activeConversationId);
                    this.renderConversationList();
                    setTimeout(() => {
                        const pdm = window.pancakeDataManager;
                        if (pdm) pdm.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
                        this.loadMessages(conv);
                    }, 2000);
                }
            } catch (err) {
                console.error('[InboxChat] File upload error:', err);
                showToast('Lỗi tải file: ' + err.message, 'error');
            }
        };
        input.click();
    }

    // ===== Emoji Grid =====

    renderEmojiGrid(category) {
        const grid = document.getElementById('emojiGrid');
        if (!grid || !this.emojiData[category]) return;
        grid.innerHTML = this.emojiData[category].map(e => `<button class="emoji-item">${e}</button>`).join('');
    }

    // ===== Message Actions (like, hide/unhide, delete, copy) =====

    async handleMessageAction(action, msgId, btn) {
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;
        const msg = conv.messages?.find(m => m.id === msgId);
        if (!msg) return;
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        try {
            if (action === 'like') {
                btn.disabled = true;
                if (msg.userLikes) {
                    const ok = await pdm.unlikeComment(conv.pageId, msgId);
                    if (ok) { msg.userLikes = false; btn.classList.remove('liked'); btn.title = 'Thích'; }
                } else {
                    const ok = await pdm.likeComment(conv.pageId, msgId);
                    if (ok) { msg.userLikes = true; btn.classList.add('liked'); btn.title = 'Bỏ thích'; }
                }
                btn.disabled = false;
            } else if (action === 'hide') {
                btn.disabled = true;
                if (msg.isHidden) {
                    const ok = await pdm.unhideComment(conv.pageId, msgId);
                    if (ok) {
                        msg.isHidden = false;
                        showToast('Đã hiện bình luận', 'success');
                        this.renderMessages(conv);
                    }
                } else {
                    const ok = await pdm.hideComment(conv.pageId, msgId);
                    if (ok) {
                        msg.isHidden = true;
                        showToast('Đã ẩn bình luận', 'success');
                        this.renderMessages(conv);
                    }
                }
                btn.disabled = false;
            } else if (action === 'delete') {
                if (!confirm('Xóa bình luận này?')) return;
                btn.disabled = true;
                const ok = await pdm.deleteComment(conv.pageId, msgId);
                if (ok) {
                    msg.isRemoved = true;
                    showToast('Đã xóa bình luận', 'success');
                    this.renderMessages(conv);
                }
                btn.disabled = false;
            } else if (action === 'copy') {
                if (msg.text) {
                    await navigator.clipboard.writeText(msg.text);
                    showToast('Đã copy', 'success');
                }
            } else if (action === 'reply') {
                this.setReplyingTo(msg, conv);
            } else if (action === 'react') {
                this.showReactionPicker(msgId, btn);
            }
        } catch (error) {
            console.error('[InboxChat] Message action error:', error);
            showToast('Lỗi: ' + error.message, 'error');
            btn.disabled = false;
        }
    }

    // ===== Save Post Type to Render DB =====

    // ===== Reply to Message =====

    setReplyingTo(msg, conv) {
        this.replyingTo = {
            msgId: msg.id,
            text: msg.text || '[Tệp đính kèm]',
            senderName: msg.senderName || (msg.sender === 'shop' ? 'Bạn' : conv.name),
            isOutgoing: msg.sender === 'shop',
            fromId: msg.fromId || '',
            convType: conv.type,
        };

        const bar = document.getElementById('replyPreviewBar');
        const sender = document.getElementById('replyPreviewSender');
        const msgEl = document.getElementById('replyPreviewMsg');
        if (bar && sender && msgEl) {
            sender.textContent = this.replyingTo.senderName;
            msgEl.textContent = this.replyingTo.text.length > 80
                ? this.replyingTo.text.substring(0, 80) + '...'
                : this.replyingTo.text;
            bar.style.display = 'flex';
        }
        this.elements.chatInput.focus();
        this.populateReplyTypeSelector();
    }

    cancelReply() {
        this.replyingTo = null;
        this.currentReplyType = null;
        const bar = document.getElementById('replyPreviewBar');
        if (bar) bar.style.display = 'none';
        this.populateReplyTypeSelector();
    }

    // ===== Reaction Picker =====

    showReactionPicker(msgId, btn) {
        const picker = document.getElementById('reactionPicker');
        if (!picker) return;

        // Position near the button
        const rect = btn.getBoundingClientRect();
        const chatArea = document.getElementById('col2');
        const chatRect = chatArea ? chatArea.getBoundingClientRect() : { left: 0, top: 0 };

        picker.style.left = (rect.left - chatRect.left) + 'px';
        picker.style.top = (rect.top - chatRect.top - 44) + 'px';
        picker.dataset.msgId = msgId;
        picker.style.display = 'flex';

        // Close on outside click
        const closeHandler = (e) => {
            if (!picker.contains(e.target) && !btn.contains(e.target)) {
                picker.style.display = 'none';
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }

    async sendReaction(msgId, reactionType) {
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const picker = document.getElementById('reactionPicker');
        if (picker) picker.style.display = 'none';

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) throw new Error('pancakeDataManager not available');

            // Use likeComment for LIKE, or the specific reaction API if available
            if (reactionType === 'LIKE') {
                const msg = conv.messages?.find(m => m.id === msgId);
                if (msg?.userLikes) {
                    await pdm.unlikeComment(conv.pageId, msgId);
                    msg.userLikes = false;
                } else {
                    await pdm.likeComment(conv.pageId, msgId);
                    if (msg) msg.userLikes = true;
                }
            } else {
                // For other reactions, use the reaction API if available
                // Pancake uses likeComment with reaction_type parameter
                const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);
                if (!pageAccessToken) throw new Error('Không tìm thấy page_access_token');

                const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${conv.pageId}/comments/${msgId}/reactions`,
                    pageAccessToken
                );
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reaction_type: reactionType })
                });
                if (!response.ok) {
                    // Fallback: try likeComment
                    await pdm.likeComment(conv.pageId, msgId);
                    const msg = conv.messages?.find(m => m.id === msgId);
                    if (msg) msg.userLikes = true;
                }
            }

            showToast('Đã react', 'success');
            // Refresh messages to show updated reactions
            setTimeout(() => this.loadMessages(conv), 1000);
        } catch (error) {
            console.error('[InboxChat] Reaction error:', error);
            showToast('Lỗi react: ' + error.message, 'error');
        }
    }

    // ===== Search (2-tier: local + API, like tpos-pancake) =====

    async performSearch(query) {
        if (!query || query.length < 2) return;

        this.isSearching = true;
        this.renderConversationList(); // Show loading state

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm || !pdm.searchConversations) {
                console.warn('[InboxChat] pancakeDataManager.searchConversations not available');
                this.searchResults = [];
                this.renderConversationList();
                return;
            }

            const result = await pdm.searchConversations(query);
            if (this.searchQuery !== query) return; // Query changed while waiting

            if (result && result.conversations && result.conversations.length > 0) {
                this.searchResults = result.conversations;
                console.log(`[InboxChat] Search found ${result.conversations.length} results for "${query}"`);
            } else {
                this.searchResults = [];
                console.log(`[InboxChat] Search returned 0 results for "${query}"`);
            }

            this.renderConversationList();
        } catch (error) {
            console.error('[InboxChat] Search error:', error);
            if (typeof showToast === 'function') showToast('Lỗi tìm kiếm: ' + error.message, 'error');
            this.searchResults = [];
            this.renderConversationList();
        } finally {
            this.isSearching = false;
        }
    }

    // ===== WebSocket Real-Time (Server Mode Proxy via Render) =====

    async initializeWebSocket() {
        if (this.isSocketConnected || this.isSocketConnecting) return true;

        try {
            const ptm = window.pancakeTokenManager;
            const pdm = window.pancakeDataManager;
            if (!ptm || !pdm) return false;

            const token = await ptm.getToken();
            if (!token) {
                console.warn('[InboxChat] No Pancake token for WebSocket');
                return false;
            }

            // Decode token to get userId
            let userId = null;
            try {
                const parts = token.split('.');
                if (parts.length >= 2) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    userId = payload.uid || payload.user_id || payload.sub;
                }
            } catch (e) {
                console.warn('[InboxChat] Failed to decode JWT:', e);
                return false;
            }

            if (!userId) {
                console.warn('[InboxChat] No userId from JWT');
                return false;
            }
            this.userId = userId;

            const pageIds = (pdm.pageIds || []).map(id => String(id));
            const cookie = `jwt=${token}`;

            this.isSocketConnecting = true;

            // Step 1: POST to start server-side Pancake connection
            console.log('[InboxChat] Starting server-mode realtime...');
            const startUrl = `${window.API_CONFIG.WORKER_URL}/api/realtime/start`;
            const startResponse = await fetch(startUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, userId, pageIds, cookie })
            });

            const startData = await startResponse.json();
            if (!startData.success) {
                console.warn('[InboxChat] Server-mode start failed:', startData);
                this.isSocketConnecting = false;
                return false;
            }
            console.log('[InboxChat] Server-mode started, checking Pancake connection status...');

            // Step 1.5: Wait briefly then check if server's Pancake WS is actually connected
            await new Promise(r => setTimeout(r, 2000));
            try {
                const statusUrl = `${window.API_CONFIG.WORKER_URL}/api/realtime/status`;
                const statusRes = await fetch(statusUrl);
                const status = await statusRes.json();
                console.log('[InboxChat] Pancake WS status:', JSON.stringify(status));
                if (!status.connected) {
                    console.warn('[InboxChat] ⚠️ Server started but Pancake WS not connected yet. Proceeding anyway...');
                }
            } catch (e) {
                console.warn('[InboxChat] Could not check status:', e.message);
            }

            // Step 2: Connect WebSocket to Render server (receives broadcasted events)
            console.log('[InboxChat] Connecting proxy WebSocket...');
            this.socket = new WebSocket('wss://n2store-realtime.onrender.com');

            this.socket.onopen = () => this.onSocketOpen();
            this.socket.onclose = (e) => this.onSocketClose(e);
            this.socket.onerror = (e) => {
                console.error('[InboxChat] Proxy WebSocket error:', e);
                this.isSocketConnecting = false;
            };
            this.socket.onmessage = (e) => this.onSocketMessage(e);

            return true;
        } catch (error) {
            console.error('[InboxChat] WebSocket init error:', error);
            this.isSocketConnecting = false;
            return false;
        }
    }

    onSocketOpen() {
        console.log('[InboxChat] Proxy WebSocket connected');
        this.isSocketConnected = true;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketReconnectDelay = 3000;

        this.updateSocketStatusUI(true);
        this.stopAutoRefresh();
    }

    onSocketClose(event) {
        console.log('[InboxChat] Proxy WebSocket closed:', event.code, event.reason);
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.updateSocketStatusUI(false);

        // Reconnect with backoff
        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = this.socketReconnectDelay;
            this.socketReconnectDelay = Math.min(delay * 1.5, 15000);
            console.log(`[InboxChat] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts}/${this.socketMaxReconnectAttempts})...`);
            this.socketReconnectTimer = setTimeout(() => this.initializeWebSocket(), delay);
        } else {
            console.log('[InboxChat] Max reconnect attempts reached, falling back to polling');
            this.startAutoRefresh();
        }
    }

    onSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('[InboxChat] 📩 WS message:', data.type || 'unknown', data);

            // Proxy format: {type: "pages:update_conversation", payload: {...}}
            if (data.type === 'pages:update_conversation' || data.type === 'update_conversation') {
                this.handleConversationUpdate(data.payload);
            } else if (data.type === 'pages:new_message' || data.type === 'new_message') {
                this.handleNewMessage(data.payload);
            } else if (data.type === 'post_type_detected') {
                this.handlePostTypeDetected(data);
            }
        } catch (e) {
            console.warn('[InboxChat] WS parse error:', e, 'raw:', event.data?.substring?.(0, 200));
        }
    }

    handleConversationUpdate(payload) {
        const conversation = payload?.conversation || payload;
        if (!conversation || !conversation.id) return;

        // Filter by page_id — only process pages the inbox manages
        const pageId = conversation.page_id || payload?.page_id;
        if (pageId) {
            const knownPage = this.data.pages.find(p => p.id === pageId || p.page_id === pageId);
            if (!knownPage) return;
        }

        // Filter by type — only process INBOX and COMMENT (skip unknown types)
        if (conversation.type && conversation.type !== 'INBOX' && conversation.type !== 'COMMENT') return;

        // Detect livestream from post data in payload
        const post = conversation.post;
        const isLivestream = post?.type === 'livestream' || post?.live_video_status === 'vod' || post?.live_video_status === 'live';

        // Extract customer psid for cross-conversation livestream linking
        const customerPsid = conversation.from_psid
            || conversation.from?.id
            || conversation.customers?.[0]?.fb_id
            || '';

        const existing = this.data.getConversation(conversation.id);
        if (existing) {
            existing.lastMessage = this.data._filterSystemMessage(conversation.snippet) || existing.lastMessage;
            existing.time = this.parseTimestamp(conversation.updated_at) || new Date();
            existing.unread = conversation.unread_count ?? existing.unread;
            if (conversation.type) existing.type = conversation.type;
            if (conversation.tags) existing._raw.tags = conversation.tags;
            // Update livestream status from post data
            if (isLivestream) {
                existing.isLivestream = true;
                this.data.markAsLivestream(conversation.id, conversation.post_id);
                // Mark customer → all their conversations become livestream
                const custName = conversation.from?.name || conversation.customers?.[0]?.name;
                this.data.markCustomerAsLivestream(customerPsid, pageId, custName, conversation.post_id);
            } else if (this.data.livestreamConvIdSet.has(conversation.id)) {
                // Already known as livestream from server
                existing.isLivestream = true;
            }
        } else {
            // New conversation
            const mapped = this.data.mapConversation(conversation);
            if (isLivestream) {
                mapped.isLivestream = true;
                this.data.markAsLivestream(conversation.id, conversation.post_id);
                const custName = conversation.from?.name || conversation.customers?.[0]?.name;
                this.data.markCustomerAsLivestream(customerPsid, pageId, custName, conversation.post_id);
            } else if (this.data.livestreamConvIdSet.has(conversation.id)) {
                mapped.isLivestream = true;
            }
            this.data.conversations.unshift(mapped);
            this.data.buildMaps();
        }

        this.data.conversations.sort((a, b) => b.time - a.time);
        this.renderConversationList();
        this.renderGroupStats();
    }

    handleNewMessage(payload) {
        const message = payload?.message || payload;
        if (!message) return;

        const convId = message.conversation_id;
        if (!convId) return;

        const conv = this.data.getConversation(convId);
        if (conv) {
            conv.time = new Date();
            conv.lastMessage = this.data._filterSystemMessage(message.original_message || message.message) || conv.lastMessage;
            this.data.conversations.sort((a, b) => b.time - a.time);
            this.renderConversationList();

            // If this is the active conversation, reload messages
            if (this.activeConversationId === convId) {
                this.loadMessages(conv);
            }
        }
    }

    handlePostTypeDetected(data) {
        const { conversationId, postId, postType, liveVideoStatus } = data;
        if (!conversationId) return;

        const conv = this.data.getConversation(conversationId);
        if (postType === 'livestream' || liveVideoStatus === 'vod' || liveVideoStatus === 'live') {
            this.data.markAsLivestream(conversationId, postId);
            if (conv) conv.isLivestream = true;
            console.log(`[InboxChat] 🔴 Livestream detected: ${conversationId}`);
            this.renderConversationList();
        } else if (conv && conv.type === 'COMMENT') {
            this.data.unmarkAsLivestream(conversationId);
            if (conv) conv.isLivestream = false;
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.autoRefreshInterval = setInterval(async () => {
            try {
                await this.data.loadConversations(true);
                this.renderConversationList();
                this.renderGroupStats();
            } catch (e) {
                console.warn('[InboxChat] Auto-refresh error:', e);
            }
        }, this.AUTO_REFRESH_INTERVAL);
        console.log('[InboxChat] Auto-refresh started (every 30s)');
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    closeWebSocket() {
        this.stopAutoRefresh();
        if (this.socketReconnectTimer) clearTimeout(this.socketReconnectTimer);
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
    }

    // ===== WebSocket Status Indicator =====

    updateSocketStatusUI(connected) {
        const el = document.getElementById('wsStatus');
        if (!el) return;
        if (connected) {
            el.innerHTML = '<i data-lucide="wifi"></i>';
            el.title = 'Realtime: Đã kết nối';
            el.className = 'ws-status connected';
        } else {
            el.innerHTML = '<i data-lucide="wifi-off"></i>';
            el.title = 'Realtime: Mất kết nối';
            el.className = 'ws-status disconnected';
        }
        this._debouncedCreateIcons();
    }

    // ===== Page Unread Counts =====

    async updatePageUnreadCounts() {
        const pdm = window.pancakeDataManager;
        if (!pdm?.fetchPagesWithUnreadCount) {
            // Fallback: count from loaded conversations
            this.pageUnreadCounts = {};
            for (const conv of this.data.conversations) {
                if (conv.unread > 0 && conv.pageId) {
                    this.pageUnreadCounts[conv.pageId] = (this.pageUnreadCounts[conv.pageId] || 0) + 1;
                }
            }
            this.renderPageSelector();
            return;
        }
        try {
            const unreadData = await pdm.fetchPagesWithUnreadCount();
            if (!unreadData || unreadData.length === 0) return;
            this.pageUnreadCounts = {};
            for (const item of unreadData) {
                this.pageUnreadCounts[item.page_id] = item.unread_conv_count || 0;
            }
            this.renderPageSelector();
        } catch (err) {
            console.warn('[InboxChat] Error fetching unread counts:', err);
        }
    }

    // ===== Utility Methods =====

    getLabelClass(label) {
        return { 'new': 'label-new', 'processing': 'label-processing', 'waiting': 'label-waiting',
                 'ordered': 'label-done', 'urgent': 'label-urgent', 'done': 'label-done' }[label] || 'label-new';
    }

    getLabelText(label) {
        const group = this.data.groups.find(g => g.id === label);
        if (group) return group.name;
        return { 'new': 'Mới', 'processing': 'Đang XL', 'waiting': 'Chờ PH',
                 'ordered': 'Đã Đặt', 'urgent': 'Cần Gấp', 'done': 'Xong' }[label] || label;
    }

    /**
     * Parse timestamp from Pancake API to proper Date object
     * Handles UTC timestamps without timezone suffix
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        try {
            let date;
            if (typeof timestamp === 'string') {
                if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }
            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            return null;
        }
    }

    /**
     * Format time for conversation list - always Vietnam timezone (GMT+7)
     */
    formatTime(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';

        try {
            const now = new Date();
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            });

            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);
            const getVal = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const isSameDay = getVal(dateParts, 'year') === getVal(nowParts, 'year') &&
                              getVal(dateParts, 'month') === getVal(nowParts, 'month') &&
                              getVal(dateParts, 'day') === getVal(nowParts, 'day');

            if (isSameDay) {
                return new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hour12: false
                }).format(date);
            }

            const vnDateObj = new Date(getVal(dateParts, 'year'), getVal(dateParts, 'month') - 1, getVal(dateParts, 'day'));
            const vnNowObj = new Date(getVal(nowParts, 'year'), getVal(nowParts, 'month') - 1, getVal(nowParts, 'day'));
            const diffDays = Math.floor((vnNowObj - vnDateObj) / 86400000);

            if (diffDays > 0 && diffDays < 7) {
                const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date);
                const days = { 'Sun': 'CN', 'Mon': 'T2', 'Tue': 'T3', 'Wed': 'T4', 'Thu': 'T5', 'Fri': 'T6', 'Sat': 'T7' };
                return days[dayOfWeek] || dayOfWeek;
            }

            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            return '';
        }
    }

    formatDate(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';

        try {
            const now = new Date();
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);
            const getVal = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const dateKey = `${getVal(dateParts, 'year')}-${getVal(dateParts, 'month')}-${getVal(dateParts, 'day')}`;
            const nowKey = `${getVal(nowParts, 'year')}-${getVal(nowParts, 'month')}-${getVal(nowParts, 'day')}`;

            if (dateKey === nowKey) return 'Hôm nay';

            const vnDateObj = new Date(getVal(dateParts, 'year'), getVal(dateParts, 'month') - 1, getVal(dateParts, 'day'));
            const vnNowObj = new Date(getVal(nowParts, 'year'), getVal(nowParts, 'month') - 1, getVal(nowParts, 'day'));
            if (vnNowObj - vnDateObj === 86400000) return 'Hôm qua';

            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            return '';
        }
    }

    formatMessageTime(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hour12: false
        }).format(date);
    }

    formatMessageText(text) {
        let safe = this.escapeHtml(text);
        safe = safe.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">$1</a>');
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export globally
window.InboxChatController = InboxChatController;
