# ES Module Migration Plan

## Overview
Chuyển đổi dự án từ script tags sang ES modules một cách incremental, không dùng bundler.

## Current State
- 45 HTML files dùng script tags
- `/shared/js/` - 18 files (script-tag wrappers, export to window.*)
- `/shared/browser/` - 12 files (ES modules - SOURCE OF TRUTH)
- `/shared/universal/` - 6 files (ES modules)
- Heavy reliance on `window.*` globals
- `core-loader.js` manages sequential loading

## Migration Strategy: Incremental (3 Phases)

---

## Phase 1: Shared Modules (Foundation)
**Goal:** Chuẩn hóa shared modules, tạo entry point ES module

### 1.1 Create Central ES Module Entry Point
File: `/shared/esm/index.js`
```javascript
// Re-export all shared modules
export { AuthManager } from '../browser/auth-manager.js';
export { PersistentCacheManager } from '../browser/persistent-cache.js';
export { NotificationManager } from '../browser/notification-system.js';
export { FIREBASE_CONFIG, initializeFirebase } from '../browser/firebase-config.js';
export * from '../browser/date-utils.js';
export * from '../browser/form-utils.js';
export * from '../browser/dom-utils.js';
export * from '../browser/common-utils.js';
```

### 1.2 Update `/shared/browser/` Files
Ensure all files have proper ES module exports:
- `firebase-config.js` - export FIREBASE_CONFIG, initializeFirebase()
- `auth-manager.js` - export AuthManager class
- `persistent-cache.js` - export PersistentCacheManager class
- `notification-system.js` - export NotificationManager class
- `date-utils.js` - export all date functions
- `form-utils.js` - export all form functions

### 1.3 Create Backward Compatibility Layer
File: `/shared/esm/compat.js`
```javascript
// For pages still using window.*
import { AuthManager, PersistentCacheManager, NotificationManager } from './index.js';

// Export to window for backward compatibility
window.AuthManager = AuthManager;
window.PersistentCacheManager = PersistentCacheManager;
window.NotificationManager = NotificationManager;
// ... etc
```

---

## Phase 2: Simple Pages Migration
**Target:** bangkiemhang, hangrotxa, live, ib, sanphamlive

### 2.1 Convert HTML Script Tags
Before:
```html
<script src="../shared/js/core-loader.js"></script>
<script src="js/config.js"></script>
<script src="js/main.js"></script>
```

After:
```html
<script type="module" src="js/app.js"></script>
```

### 2.2 Create Page Entry Point (`app.js`)
```javascript
// bangkiemhang/js/app.js
import {
  AuthManager,
  NotificationManager,
  FIREBASE_CONFIG,
  initializeFirebase
} from '../../shared/esm/index.js';

// Initialize
const authManager = new AuthManager({ redirectUrl: '../index.html' });
const notificationManager = new NotificationManager();

// Check auth
if (!authManager.isAuthenticated()) {
  authManager.logout('Not authenticated');
}

// Initialize Firebase
initializeFirebase(FIREBASE_CONFIG);

// Import page modules
import './config.js';
import './utils.js';
import './main.js';
```

### 2.3 Convert Page Modules to ES Modules
Before (`config.js`):
```javascript
const APP_CONFIG = { ... };
window.APP_CONFIG = APP_CONFIG;
```

After (`config.js`):
```javascript
export const APP_CONFIG = { ... };
export let db = null;
export let collectionRef = null;

export function initializeFirebase(config) {
  // ...
}
```

---

## Phase 3: Complex Pages Migration
**Target:** orders-report, hanghoan, livestream, hangdat

### 3.1 orders-report (Already Partial ES Modules)
- Update existing ES module imports
- Remove window.* exports gradually
- Convert remaining script-tag files

### 3.2 hanghoan (Monolithic - 1200+ lines)
- Split `hanghoan.js` into smaller modules:
  - `hanghoan-config.js` - Configuration
  - `hanghoan-table.js` - Table rendering
  - `hanghoan-forms.js` - Form handling
  - `hanghoan-filters.js` - Filter logic
  - `hanghoan-modals.js` - Modal management
  - `hanghoan-cache.js` - Cache operations
- Create `app.js` entry point

### 3.3 livestream
- Already has separate files (config, utils, filters, totals, table, forms, modals, main)
- Convert each to ES module
- Create `app.js` entry point

---

## File-by-File Migration Checklist

### Phase 1 Files:
- [ ] `/shared/esm/index.js` (new)
- [ ] `/shared/esm/compat.js` (new)
- [ ] `/shared/browser/firebase-config.js` (update exports)
- [ ] `/shared/browser/auth-manager.js` (verify exports)
- [ ] `/shared/browser/persistent-cache.js` (verify exports)
- [ ] `/shared/browser/notification-system.js` (verify exports)
- [ ] `/shared/browser/date-utils.js` (add if missing)
- [ ] `/shared/browser/form-utils.js` (add if missing)

### Phase 2 Files (per page):
- [ ] `{page}/index.html` - Update script tags
- [ ] `{page}/js/app.js` - Create entry point
- [ ] `{page}/js/config.js` - Add exports
- [ ] `{page}/js/utils.js` - Add exports
- [ ] `{page}/js/main.js` - Add imports/exports

### Phase 3 Files:
- [ ] Split monolithic files
- [ ] Create entry points
- [ ] Update all imports

---

## Import Path Convention

```javascript
// From page JS files
import { X } from '../../shared/esm/index.js';

// From shared modules
import { Y } from './other-module.js';

// Always use .js extension
// Always use relative paths starting with ./ or ../
```

---

## Testing Strategy

### After Each File Change:
1. Load page in browser
2. Check console for import errors
3. Verify authentication works
4. Verify Firebase connection
5. Test main functionality

### Rollback Plan:
- Keep `/shared/js/` intact during migration
- Pages not yet migrated continue using script tags
- Can revert individual pages by changing HTML

---

## Execution Order

1. **Day 1:** Phase 1 - Shared modules
2. **Day 2:** Phase 2 - Simple pages (bangkiemhang first as pilot)
3. **Day 3-4:** Phase 2 - Remaining simple pages
4. **Day 5-7:** Phase 3 - Complex pages

---

## Success Criteria

- [ ] All pages load without errors
- [ ] Authentication works on all pages
- [ ] Firebase operations work
- [ ] No console errors related to imports
- [ ] All existing functionality preserved
