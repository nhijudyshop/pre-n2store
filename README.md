# N2Store — Hệ thống Quản lý Bán hàng Đa Module

Ứng dụng web quản lý bán hàng online tích hợp TPOS & Pancake, xây dựng trên vanilla JavaScript + Firebase.

## Kiến trúc

- **Frontend:** Vanilla JS (ES Modules + Script Tags), multi-page app
- **Backend:** Firebase (Realtime DB + Firestore + Auth + Hosting)
- **API Proxy:** Cloudflare Worker
- **Build:** Vite (bundling, tree-shaking, minification)
- **Testing:** Vitest + fast-check (property-based testing)
- **CI/CD:** GitHub Actions (PR checks + auto deploy)
- **Phân quyền:** detailedPermissions (thống nhất, chi tiết theo pageId/action)
- **State Management:** BaseStore class (Firebase as Source of Truth + Real-time Listener)

## Cấu trúc dự án

```
n2store/
├── shared/                  # Thư viện dùng chung
│   ├── browser/             #   ES Modules (source of truth)
│   ├── js/                  #   Script-tag compatible wrappers
│   │   ├── firebase-config.js     # Firebase config tập trung (duy nhất)
│   │   ├── permissions-helper.js  # PermissionHelper — phân quyền thống nhất
│   │   ├── permission-migrator.js # Migration checkLogin → detailedPermissions
│   │   ├── base-store.js          # BaseStore class cho state management
│   │   ├── module-loader.js       # Lazy loading modules
│   │   └── ...
│   └── universal/           #   Shared giữa browser và Cloudflare Worker
├── docs/                    # Tài liệu dự án
│   ├── architecture/        #   Kiến trúc hệ thống, shared library docs
│   ├── guides/              #   Hướng dẫn phát triển, module template, migration
│   ├── api-docs/            #   API documentation, tech specs
│   ├── plans/               #   Kế hoạch, PRD, business flow specs
│   └── legacy/              #   Tài liệu lưu trữ, audit reports
├── tests/                   # Test suite
│   ├── unit/shared/         #   Unit tests cho shared library
│   ├── property/            #   Property-based tests (fast-check)
│   └── integration/         #   Integration tests (Cloudflare Worker)
│       └── cloudflare-worker/
├── .github/workflows/       # CI/CD
│   ├── ci.yml               #   PR checks (lint → test → build)
│   └── deploy.yml           #   Auto deploy (Firebase Hosting + Cloudflare Worker)
├── cloudflare-worker/       # Cloudflare Worker API proxy
├── build-scripts/           # Build scripts (minify-all.js, optimize.js)
├── service-worker.js        # Service Worker (3 cache strategies)
├── vite.config.js           # Vite multi-page build config
├── vitest.config.js         # Vitest test config
├── <module>/                # Các module nghiệp vụ
│   ├── index.html           #   Entry point
│   ├── js/                  #   JavaScript files
│   └── styles/              #   CSS files
└── ...
```

### Các module nghiệp vụ chính

| Module | Mô tả |
|---|---|
| `orders-report` | Báo cáo đơn hàng, trạng thái hóa đơn |
| `customer-hub` | Quản lý khách hàng |
| `user-management` | Quản lý người dùng và phân quyền |
| `order-management` | Quản lý đơn hàng |
| `inventory-tracking` | Theo dõi tồn kho |
| `purchase-orders` | Đơn đặt hàng nhà cung cấp |
| `nhanhang` | Nhận hàng |
| `hangrotxa` | Hàng rót xa |
| `hanghoan` | Hàng hoàn |
| `live` | Bán hàng live |
| `soluong-live` | Số lượng live |
| `tpos-pancake` | Tích hợp TPOS & Pancake |

## Bắt đầu

### Yêu cầu

- Node.js >= 16.0.0
- npm >= 8.0.0

### Cài đặt

```bash
npm install
```

### Development

```bash
npm run dev:vite    # Vite dev server (HMR)
npm run serve       # HTTP server tĩnh (port 8080)
```

### Testing

```bash
npm test              # Chạy tất cả tests (Vitest)
npm run test:coverage # Chạy tests với coverage report
```

- Unit tests: `tests/unit/`
- Property-based tests: `tests/property/` (fast-check, 100+ iterations)
- Integration tests: `tests/integration/`
- Coverage target: ≥ 60% cho shared library

### Build

```bash
npm run build:vite  # Vite build (production, tree-shaking, minification)
npm run build       # Legacy build (minify-all.js)
npm run lint        # ESLint
npm run format      # Prettier
```

### Deploy

Deploy tự động qua GitHub Actions khi push to `main`:

1. **PR checks** (`ci.yml`): lint → test → build — chặn merge nếu fail
2. **Auto deploy** (`deploy.yml`): build → deploy Firebase Hosting → deploy Cloudflare Worker (nếu có thay đổi)

Deploy thủ công:

```bash
npm run build:vite
npx firebase-tools deploy --only hosting
```

## Hệ thống phân quyền

Sử dụng `detailedPermissions` — phân quyền chi tiết theo từng trang (pageId) và action (view, edit, delete, upload...).

- **PermissionHelper** (`shared/js/permissions-helper.js`): Kiểm tra quyền truy cập
- **PAGES_REGISTRY** (`user-management/js/permissions-registry.js`): Single source of truth cho tất cả trang
- **PermissionMigrator** (`shared/js/permission-migrator.js`): Migration từ checkLogin legacy sang detailedPermissions

## Service Worker & Caching

3 chiến lược cache trong `service-worker.js`:

| Chiến lược | Áp dụng cho | Mô tả |
|---|---|---|
| Stale-while-revalidate | Static assets (.js, .css, .html, .png) | Trả cache ngay, cập nhật background |
| Network-first | API calls (Firebase, /api/) | Ưu tiên network, fallback cache sau 5s |
| Cache-first | CDN (gstatic, unpkg, cdnjs) | Ưu tiên cache, max 7 ngày |

## Tài liệu

Xem thư mục [`docs/`](docs/) để tìm tài liệu chi tiết:

- [`docs/architecture/`](docs/architecture/) — Kiến trúc hệ thống, shared library
- [`docs/guides/`](docs/guides/) — Hướng dẫn phát triển, [module template](docs/guides/module-template.md)
- [`docs/api-docs/`](docs/api-docs/) — API endpoints, tech specs
- [`docs/plans/`](docs/plans/) — Kế hoạch triển khai, PRD
- [`docs/legacy/`](docs/legacy/) — Tài liệu lưu trữ

## Changelog

Xem [CHANGELOG.md](CHANGELOG.md) để theo dõi tất cả thay đổi.
