// ===== LOCAL SIDEBAR TOGGLE =====
function toggleLocalSidebar() {
  const sidebar = document.getElementById('local-sidebar');
  const overlay = document.getElementById('local-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}
function closeLocalSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('local-sidebar').classList.remove('open');
    document.getElementById('local-overlay').classList.remove('open');
  }
}

// ===== ACTIVE SECTION HIGHLIGHT =====
const sections = document.querySelectorAll('.bp-section[id], #overview');
const navItems = document.querySelectorAll('.nav-item[href]');

function getActiveSection() {
  const scrollY = window.scrollY + 80;
  let active = null;
  sections.forEach(sec => {
    if (sec.offsetTop <= scrollY) active = sec.id;
  });
  return active;
}

function updateActiveNav() {
  const activeId = getActiveSection();
  navItems.forEach(item => {
    const href = item.getAttribute('href').replace('#', '');
    item.classList.toggle('active', href === activeId);
  });
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// ===== SMOOTH SCROLL =====
navItems.forEach(item => {
  item.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        const offset = 72;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
});

// ===== NAVIGATION MODERN SIDEBAR TOGGLE =====
const navSidebar = document.getElementById('sidebar');
const navToggleBtn = document.getElementById('sidebarToggle');
const navToggleFixed = document.getElementById('sidebarToggleFixed');

function isNavCollapsed() {
  return navSidebar.classList.contains('collapsed') ||
         (window.innerWidth <= 1024 && !navSidebar.classList.contains('open'));
}

function toggleNavSidebar() {
  if (window.innerWidth <= 1024) {
    navSidebar.classList.toggle('open');
    navToggleFixed.classList.toggle('sidebar-open', navSidebar.classList.contains('open'));
  } else {
    const collapsed = navSidebar.classList.toggle('collapsed');
    document.body.classList.toggle('nav-collapsed', collapsed);
    navToggleFixed.classList.toggle('visible', collapsed);
  }
}

if (navToggleBtn) navToggleBtn.addEventListener('click', toggleNavSidebar);
if (navToggleFixed) navToggleFixed.addEventListener('click', toggleNavSidebar);

// Init nav state on desktop
if (window.innerWidth > 1024) {
  document.body.classList.add('nav-ready');
  navToggleFixed.classList.remove('visible');
}

// =========================================================
// NOTE SYSTEM — Đóng góp quy trình
// =========================================================
const NoteSystem = {
  db: null,
  notes: {},
  uploadedImages: [],
  notesVisible: true,
  currentEditor: null,

  NOTE_LABELS: {
    'bp1': 'BP1 — Nhập hàng & Làm mã',
    'bp2': 'BP2 — Live Sale',
    'bp3': 'BP3 — Trả hàng theo phiếu',
    'bp4': 'BP4 — Chốt đơn (Sale)',
    'bp5': 'BP5 — Đi chợ & Đối soát',
    'bp6': 'BP6 — Đóng đơn & Giao shipper',
    'bp7': 'BP7 — CSKH',
    'bp8': 'BP8 — Check IB'
  },

  init() {
    this.db = typeof initializeFirestore === 'function' ? initializeFirestore() : null;
    if (!this.db) {
      console.warn('[NoteSystem] Firestore not available, retrying in 2s...');
      setTimeout(() => {
        this.db = typeof initializeFirestore === 'function' ? initializeFirestore() : null;
        if (this.db) this._start();
      }, 2000);
      return;
    }
    this._start();
  },

  _start() {
    this.assignNoteIds();
    this.loadNotes();
    this.setupDoubleClick();
    this.setupToggle();
    this.restoreVisibility();
    console.log('[NoteSystem] Initialized');
  },

  assignNoteIds() {
    document.querySelectorAll('.bp-section').forEach(section => {
      const bpId = section.id;
      let stepIdx = 0;
      section.querySelectorAll('.step').forEach(step => {
        stepIdx++;
        step.setAttribute('data-note-id', bpId + '-step-' + stepIdx);
      });
      // Standalone callouts outside .step
      let calloutIdx = 0;
      section.querySelectorAll('.bp-body > .callout').forEach(callout => {
        if (!callout.closest('.step')) {
          calloutIdx++;
          callout.setAttribute('data-note-id', bpId + '-note-' + calloutIdx);
        }
      });
    });
  },

  setupDoubleClick() {
    document.querySelectorAll('.bp-body').forEach(body => {
      body.addEventListener('dblclick', (e) => {
        // Ignore if clicking inside editor
        if (e.target.closest('.note-editor') || e.target.closest('.note-container')) return;
        const anchor = e.target.closest('[data-note-id]');
        if (!anchor) return;
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        this.openEditor(anchor);
      });
    });
  },

  openEditor(anchor) {
    if (this.currentEditor) {
      this.currentEditor.remove();
      this.currentEditor = null;
    }
    this.uploadedImages = [];

    const noteId = anchor.getAttribute('data-note-id');
    const editor = document.createElement('div');
    editor.className = 'note-editor';
    editor.innerHTML =
      '<div class="note-editor-header">📝 Thêm ghi chú đóng góp</div>' +
      '<textarea class="note-textarea" placeholder="Nhập nội dung ghi chú đóng góp..." rows="3"></textarea>' +
      '<div class="note-paste-hint">📋 Ctrl+V để dán ảnh từ clipboard | Kéo thả ảnh vào đây</div>' +
      '<div class="note-image-preview"></div>' +
      '<div class="note-editor-actions">' +
        '<label class="note-upload-btn">📷 Thêm ảnh<input type="file" accept="image/*" multiple style="display:none"></label>' +
        '<div style="flex:1"></div>' +
        '<button class="note-cancel-btn">Hủy</button>' +
        '<button class="note-save-btn">💾 Lưu ghi chú</button>' +
      '</div>';

    // Insert after anchor (or after existing note-container)
    const existingContainer = anchor.nextElementSibling;
    if (existingContainer && existingContainer.classList.contains('note-container')) {
      existingContainer.insertAdjacentElement('afterend', editor);
    } else {
      anchor.insertAdjacentElement('afterend', editor);
    }
    this.currentEditor = editor;
    editor.querySelector('.note-textarea').focus();

    editor.querySelector('.note-cancel-btn').addEventListener('click', () => {
      editor.remove();
      this.currentEditor = null;
    });

    editor.querySelector('.note-save-btn').addEventListener('click', () => {
      this.saveNote(noteId, editor);
    });

    // Ctrl+Enter to save
    editor.querySelector('.note-textarea').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') this.saveNote(noteId, editor);
    });

    editor.querySelector('input[type="file"]').addEventListener('change', (e) => {
      this.handleImageUpload(e.target.files, editor);
      e.target.value = '';
    });

    // Clipboard paste support (Ctrl+V)
    editor.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        this.handleImageUpload(imageFiles, editor);
      }
    });

    // Drag & drop support
    const pasteHint = editor.querySelector('.note-paste-hint');
    editor.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (pasteHint) pasteHint.classList.add('drag-over');
    });
    editor.addEventListener('dragleave', (e) => {
      if (pasteHint) pasteHint.classList.remove('drag-over');
    });
    editor.addEventListener('drop', (e) => {
      e.preventDefault();
      if (pasteHint) pasteHint.classList.remove('drag-over');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) this.handleImageUpload(imageFiles, editor);
      }
    });
  },

  async handleImageUpload(files, editor) {
    const preview = editor.querySelector('.note-image-preview');
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn (tối đa 5MB)'); continue; }

      const loadingEl = document.createElement('div');
      loadingEl.className = 'note-image-loading';
      loadingEl.textContent = '⏳ Đang tải ảnh lên...';
      preview.appendChild(loadingEl);

      try {
        const url = await this.uploadImage(file);
        this.uploadedImages.push(url);
        loadingEl.remove();

        const imgWrap = document.createElement('div');
        imgWrap.className = 'note-image-thumb';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Ảnh đính kèm';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'note-remove-img';
        removeBtn.textContent = '×';
        removeBtn.title = 'Xóa ảnh';
        removeBtn.addEventListener('click', () => {
          this.uploadedImages = this.uploadedImages.filter(u => u !== url);
          imgWrap.remove();
        });
        imgWrap.appendChild(img);
        imgWrap.appendChild(removeBtn);
        preview.appendChild(imgWrap);
      } catch (err) {
        loadingEl.textContent = '❌ Lỗi tải ảnh';
        console.error('[NoteSystem] Upload error:', err);
      }
    }
  },

  // Upload qua Cloudflare Worker proxy (xử lý CORS)
  UPLOAD_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/upload/image',

  async uploadImage(file) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = ts + '_' + rand + '.' + ext;

    const resp = await fetch(this.UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        fileName: fileName,
        folderPath: 'quy-trinh-notes',
        mimeType: file.type
      })
    });
    const result = await resp.json();
    if (!result.success) throw new Error(result.error || 'Upload failed');
    return result.url;
  },

  async saveNote(noteId, editor) {
    const content = editor.querySelector('.note-textarea').value.trim();
    if (!content && this.uploadedImages.length === 0) {
      alert('Vui lòng nhập nội dung hoặc thêm ảnh');
      return;
    }
    const userInfo = window.authManager ? window.authManager.getUserInfo() : null;
    if (!userInfo) {
      alert('Vui lòng đăng nhập để ghi chú');
      return;
    }
    const saveBtn = editor.querySelector('.note-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Đang lưu...';

    try {
      await this.db.collection('quy-trinh-notes').add({
        noteId: noteId,
        content: content,
        images: this.uploadedImages.slice(),
        author: userInfo.displayName || userInfo.username || 'Ẩn danh',
        authorUid: userInfo.uid || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      editor.remove();
      this.currentEditor = null;
      await this.loadNotes();
      this.generateAndSaveMD();
    } catch (err) {
      console.error('[NoteSystem] Save error:', err);
      alert('Lỗi lưu ghi chú: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu ghi chú';
    }
  },

  async loadNotes() {
    if (!this.db) return;
    try {
      const snapshot = await this.db.collection('quy-trinh-notes')
        .orderBy('createdAt', 'asc')
        .get();
      this.notes = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        data._id = doc.id;
        if (!this.notes[data.noteId]) this.notes[data.noteId] = [];
        this.notes[data.noteId].push(data);
      });
      this.renderNotes();
      this.updateToggleCount();
    } catch (err) {
      console.error('[NoteSystem] Load error:', err);
    }
  },

  renderNotes() {
    document.querySelectorAll('.note-container').forEach(el => el.remove());
    const noteIds = Object.keys(this.notes);
    if (noteIds.length === 0) return;

    noteIds.forEach(noteId => {
      const anchor = document.querySelector('[data-note-id="' + noteId + '"]');
      if (!anchor) return;

      const container = document.createElement('div');
      container.className = 'note-container';
      if (!this.notesVisible) container.style.display = 'none';

      this.notes[noteId].forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'note-delete-btn';
        delBtn.title = 'Xóa ghi chú';
        delBtn.textContent = '🗑️';
        delBtn.addEventListener('click', () => this.deleteNote(note._id));
        noteEl.appendChild(delBtn);

        // Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'note-content';
        contentDiv.innerHTML = this.escapeHtml(note.content).replace(/\n/g, '<br>');
        noteEl.appendChild(contentDiv);

        // Images
        if (note.images && note.images.length > 0) {
          const imagesDiv = document.createElement('div');
          imagesDiv.className = 'note-images';
          note.images.forEach(url => {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Ảnh đính kèm';
            a.appendChild(img);
            imagesDiv.appendChild(a);
          });
          noteEl.appendChild(imagesDiv);
        }

        // Meta
        const metaDiv = document.createElement('div');
        metaDiv.className = 'note-meta';
        const date = note.createdAt && note.createdAt.toDate ? note.createdAt.toDate() : new Date();
        const dateStr = date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        metaDiv.innerHTML = '<span class="note-author">✍️ ' + this.escapeHtml(note.author) + '</span>' +
          '<span class="note-date">📅 ' + dateStr + '</span>';
        noteEl.appendChild(metaDiv);

        container.appendChild(noteEl);
      });

      anchor.insertAdjacentElement('afterend', container);
    });
  },

  async deleteNote(docId) {
    if (!confirm('Bạn có chắc muốn xóa ghi chú này?')) return;
    try {
      await this.db.collection('quy-trinh-notes').doc(docId).delete();
      await this.loadNotes();
      this.generateAndSaveMD();
    } catch (err) {
      console.error('[NoteSystem] Delete error:', err);
      alert('Lỗi xóa ghi chú: ' + err.message);
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  setupToggle() {
    const btn = document.getElementById('noteToggleBtn');
    if (btn) btn.addEventListener('click', () => this.toggleVisibility());
  },

  restoreVisibility() {
    const saved = localStorage.getItem('quy-trinh-notes-visible');
    this.notesVisible = saved !== 'false';
    this.updateToggleUI();
  },

  toggleVisibility() {
    this.notesVisible = !this.notesVisible;
    localStorage.setItem('quy-trinh-notes-visible', String(this.notesVisible));
    this.updateToggleUI();
    document.querySelectorAll('.note-container').forEach(el => {
      el.style.display = this.notesVisible ? '' : 'none';
    });
  },

  updateToggleUI() {
    const btn = document.getElementById('noteToggleBtn');
    if (!btn) return;
    const spanEl = btn.querySelector('span');
    if (spanEl) spanEl.textContent = this.notesVisible ? 'Ẩn ghi chú' : 'Xem ghi chú';
    btn.classList.toggle('active', this.notesVisible);
  },

  updateToggleCount() {
    const btn = document.getElementById('noteToggleBtn');
    if (!btn) return;
    const total = Object.values(this.notes).reduce((sum, arr) => sum + arr.length, 0);
    let badge = btn.querySelector('.note-count-badge');
    if (total > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'note-count-badge';
        btn.appendChild(badge);
      }
      badge.textContent = total;
    } else if (badge) {
      badge.remove();
    }
  },

  async generateAndSaveMD() {
    if (!this.db) return;
    try {
      let md = '# Đóng góp Quy trình N2Store\n';
      md += '> Cập nhật tự động: ' + new Date().toLocaleString('vi-VN') + '\n\n';

      const sections = {};
      Object.keys(this.notes).forEach(noteId => {
        const sectionId = noteId.split('-')[0];
        if (!sections[sectionId]) sections[sectionId] = {};
        sections[sectionId][noteId] = this.notes[noteId];
      });

      Object.keys(sections).sort().forEach(sectionId => {
        const label = this.NOTE_LABELS[sectionId] || sectionId;
        md += '## ' + label + '\n\n';

        Object.keys(sections[sectionId]).sort().forEach(noteId => {
          const stepMatch = noteId.match(/step-(\d+)/);
          const stepLabel = stepMatch ? 'Bước ' + stepMatch[1] : noteId;

          const anchor = document.querySelector('[data-note-id="' + noteId + '"]');
          const titleEl = anchor ? anchor.querySelector('.step-title') : null;
          const title = titleEl ? titleEl.textContent : '';

          md += '### ' + stepLabel + (title ? ': ' + title : '') + '\n';
          md += '#### Đóng góp:\n';

          sections[sectionId][noteId].forEach(note => {
            const date = note.createdAt && note.createdAt.toDate ? note.createdAt.toDate() : new Date();
            const dateStr = date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            md += '- **' + note.author + ' (' + dateStr + '):** ' + note.content + '\n';
            if (note.images && note.images.length > 0) {
              note.images.forEach(url => {
                md += '  - Hình ảnh: ![](' + url + ')\n';
              });
            }
          });
          md += '\n';
        });
      });

      await this.db.collection('quy-trinh-md').doc('contributions').set({
        content: md,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        noteCount: Object.values(this.notes).reduce((sum, arr) => sum + arr.length, 0)
      });
      console.log('[NoteSystem] MD auto-saved to Firestore');
    } catch (err) {
      console.error('[NoteSystem] MD generation error:', err);
    }
  }
};

// Init NoteSystem when Firebase is ready
if (typeof firebase !== 'undefined' && typeof initializeFirestore === 'function') {
  NoteSystem.init();
} else {
  window.addEventListener('sharedModulesLoaded', () => NoteSystem.init());
  // Fallback
  setTimeout(() => { if (!NoteSystem.db) NoteSystem.init(); }, 3000);
}
