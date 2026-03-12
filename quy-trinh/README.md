# Quy Trinh - Quy Trinh Nghiep Vu (Business Process Documentation)

## Muc dich

Module nay la trang tai lieu nghiep vu noi bo cua N2Store (shop thoi trang nu online). No trinh bay chi tiet quy trinh lam viec cua **8 bo phan chinh** trong shop, tu khau nhap hang, live sale, chot don, dong goi den giao hang va cham soc khach hang.

Trang web la mot **single-page application** (SPA) voi sidebar dieu huong theo bo phan, hien thi luong tong quan dang flowchart, va tich hop he thong **ghi chu dong gop** (Note System) cho phep nhan vien double-click vao bat ky buoc nao de them ghi chu, dinh kem anh, va luu len Firestore.

## Kien truc & Bo cuc folder

```
quy-trinh/
├── index.html                    # Trang chinh (HTML + CSS + JS, tat ca trong 1 file)
├── README.md                     # File nay
├── quy-trinh-chuan.md            # Ban Markdown chuan cua toan bo quy trinh (AI-readable)
├── quy-trinh-anh-ghi-chu.md      # So sanh ghi chu tu anh voi quy trinh chuan
├── chotdonchitiet.md             # Ghi chu goc: quy trinh chot don (BP4)
├── doisoatvadonggoi.md           # Ghi chu goc: doi soat va dong goi (BP5-BP6)
├── quanlykho.md                  # Ghi chu goc: quy trinh lam kho (Quan ly kho)
├── quytrinhdichobs.md            # Ghi chu goc: quy trinh di cho (BP5 - Dung)
└── quytrinhnhanhang.md           # Ghi chu goc: quy trinh nhan hang (BP1)
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang web chinh (~2720 dong). Chua HTML structure, CSS (inline `<style>`), va JavaScript (inline `<script>`). Hien thi toan bo 8 bo phan nghiep vu voi sidebar dieu huong, flowchart tong quan, va he thong ghi chu dong gop (NoteSystem) tich hop Firebase Firestore. |
| `quy-trinh-chuan.md` | Ban markdown chuan (498 dong) cua toan bo quy trinh BP1-BP8 + Quan ly kho + Check hang truoc live. Day la "source of truth" de AI agent doc nhanh, duoc cap nhat thu cong khi quy trinh thay doi. |
| `quy-trinh-anh-ghi-chu.md` | Tai lieu so sanh (175 dong) giua noi dung ghi chu tu anh (notes chup tu giay) va quy trinh chuan tren web. Danh gia xung dot, diem bo sung, va diem chua co trong quy trinh chuan. |
| `chotdonchitiet.md` | Ghi chu goc (raw notes) ve quy trinh chot don (BP4): 4 muc phan loai don, quy trinh lam don, quy trinh ra don (ma vach + phieu cho), xu ly sau ra don, gom hang. |
| `doisoatvadonggoi.md` | Ghi chu goc ve quy trinh doi soat san pham, dong goi, tich don TP/Tinh, giao hang cho ship, xu ly doi tra va hoan hang. |
| `quanlykho.md` | Ghi chu goc ve quy trinh lam kho: nhan hang mau moi, hang so luong VN/QC, hang le tu nhieu bo phan, sap xep mau sau live, kiem ke dinh ky. |
| `quytrinhdichobs.md` | Ghi chu goc ve quy trinh "di cho" (Dung phu trach): sap xep hang theo STT, xu ly bill thieu hang, bill khach qua lay, phieu dat hang live. |
| `quytrinhnhanhang.md` | Ghi chu goc ve quy trinh nhan hang: hang HN (can nang, chup hinh), hang QC (kiem tra kg), NCC gui hang, ship buu dien/khach gui. |

## Dependencies

### Shared libs (du an N2Store)
- `../shared/js/firebase-config.js` -- Cau hinh Firebase app (auto-initializes)
- `../shared/esm/compat.js` -- Core utilities (Auth + Firebase config), module type
- `../shared/js/navigation-modern.js` -- Sidebar dieu huong chung cho toan app (auto-generates menu items)
- `../shared/images/logo.jpg` -- Logo N2Store

### CDN Libraries
- **Google Fonts** -- Inter (weights: 300-800)
- **Lucide Icons** v0.294.0 -- Icon set (unpkg CDN)
- **Firebase SDK** v9.6.1 (compat mode):
  - `firebase-app-compat.js`
  - `firebase-firestore-compat.js`

### Cross-module references
- **Firestore collection** `quy-trinh-notes` -- Luu tru ghi chu dong gop cua nhan vien
- **Firestore collection** `quy-trinh-md` -- Luu tru ban markdown tu dong generate tu cac ghi chu (document ID: `contributions`)
- **Cloudflare Worker** `chatomni-proxy.nhijudyshop.workers.dev/api/upload/image` -- Upload anh dinh kem trong ghi chu
- **Auth system** (`window.authManager`) -- Xac thuc nguoi dung khi ghi chu

## Luong du lieu

```
Ghi chu goc (.md files)
    |
    v
[quy-trinh-chuan.md] <-- "Source of truth" (cap nhat thu cong)
    |
    v
[index.html] -- Render noi dung quy trinh thanh trang web
    |
    |-- Nhan vien doc quy trinh tren web
    |-- Nhan vien double-click de them ghi chu
    |       |
    |       v
    |   [NoteSystem]
    |       |-- Luu ghi chu -> Firestore (quy-trinh-notes)
    |       |-- Upload anh -> Cloudflare Worker -> Firebase Storage
    |       |-- Tu dong generate MD -> Firestore (quy-trinh-md/contributions)
    |       '-- Load & render ghi chu duoi moi buoc quy trinh
    |
    '-- [quy-trinh-anh-ghi-chu.md] -- So sanh ghi chu voi quy trinh chuan (phan tich offline)
```

### Luong nghiep vu trong shop (8 bo phan)

```
BP1 Nhap hang & Lam ma
    |
    v
Quan ly kho (nhan hang, sap xep, kiem ke)
    |
    v
Check hang truoc live (Duyen phu trach)
    |
    v
BP2 Live Sale (5-6 nhan su: 2 trong phong live, 3 ngoai)
    |
    v
BP3 Tra hang theo phieu (nhan oder)
    |
    v
BP4 Chot don - Sale (3 ban sale)
    |
    v
BP5 Di cho & Doi soat (2 ban di cho)
    |
    v
BP6 Dong don & Giao shipper
    |
    v
BP7 CSKH (xu ly don buu cuc, hoan hang)
    |
    v
BP8 Check IB (ban ngoai live, doi tra)
```

## Ham chinh

### JavaScript (inline trong index.html)

#### Sidebar & Navigation
| Ham | Mo ta |
|-----|-------|
| `toggleLocalSidebar()` | Mo/dong sidebar bo phan (local sidebar) tren mobile |
| `closeLocalSidebar()` | Dong sidebar khi click vao nav item (chi tren mobile <=768px) |
| `getActiveSection()` | Xac dinh section dang hien thi dua tren scroll position |
| `updateActiveNav()` | Cap nhat highlight nav item tuong ung voi section dang xem |
| `toggleNavSidebar()` | Mo/dong sidebar dieu huong chinh (navigation-modern), xu ly ca desktop va mobile |

#### NoteSystem (Object)
| Ham | Mo ta |
|-----|-------|
| `NoteSystem.init()` | Khoi tao he thong ghi chu, ket noi Firestore, setup event listeners |
| `NoteSystem._start()` | Thuc hien cac buoc khoi tao sau khi co Firestore: assign IDs, load notes, setup UI |
| `NoteSystem.assignNoteIds()` | Tu dong gan `data-note-id` cho moi `.step` va `.callout` trong cac section |
| `NoteSystem.setupDoubleClick()` | Lang nghe su kien double-click tren `.bp-body` de mo editor ghi chu |
| `NoteSystem.openEditor(anchor)` | Tao va hien thi form nhap ghi chu (textarea + upload anh + paste/drag-drop) |
| `NoteSystem.handleImageUpload(files, editor)` | Xu ly upload nhieu anh (file input, clipboard paste, drag-drop), hien thi preview |
| `NoteSystem.uploadImage(file)` | Upload 1 anh len Cloudflare Worker proxy, tra ve URL. Gioi han 5MB. |
| `NoteSystem.saveNote(noteId, editor)` | Luu ghi chu vao Firestore collection `quy-trinh-notes`, bao gom noi dung + anh + thong tin nguoi viet |
| `NoteSystem.loadNotes()` | Load toan bo ghi chu tu Firestore, nhom theo noteId, goi renderNotes() |
| `NoteSystem.renderNotes()` | Render cac ghi chu thanh DOM elements (note-item) va chen vao sau buoc tuong ung |
| `NoteSystem.deleteNote(docId)` | Xoa ghi chu khoi Firestore (co confirm dialog) |
| `NoteSystem.setupToggle()` | Gan event listener cho nut "Xem ghi chu" / "An ghi chu" tren header |
| `NoteSystem.toggleVisibility()` | An/hien tat ca ghi chu, luu trang thai vao localStorage |
| `NoteSystem.updateToggleCount()` | Cap nhat badge so luong ghi chu tren nut toggle |
| `NoteSystem.generateAndSaveMD()` | Tu dong tao noi dung Markdown tu tat ca ghi chu va luu vao Firestore (`quy-trinh-md/contributions`) |
| `NoteSystem.escapeHtml(str)` | Escape HTML entities de tranh XSS khi render ghi chu |

### CSS Architecture (inline trong index.html)

Toan bo CSS nam trong 1 block `<style>` (~406 dong), su dung CSS custom properties (`--bp1` den `--bp9`) cho color theming theo bo phan. Cac thanh phan chinh:

- **Layout**: Fixed header + fixed local sidebar + main content (max-width 960px)
- **Color system**: 9 color schemes (bp1-bp9) voi 3 variants moi cai (primary, light, dark)
- **Components**: `.bp-section`, `.step`, `.callout`, `.flow-grid`, `.flowchart`, `.personnel-diagram`, `.nav-item`, `.tag`
- **Note system**: `.note-editor`, `.note-item`, `.note-container` voi animation (slideIn, fadeIn)
- **Responsive**: Breakpoints tai 768px va 480px, hamburger menu, sidebar overlay
- **Print**: An header/sidebar, full-width content, giu mau callout/flowbox
- **Navigation Modern**: `.sidebar` integration voi body classes `nav-ready` / `nav-collapsed`
