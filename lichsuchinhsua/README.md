# Lich Su Chinh Sua - Lich Su Chinh Sua (Audit Log)

## Muc dich

Module "Lich Su Chinh Sua" (Edit History) serves as the centralized audit log viewer for the entire N2Store system. It aggregates edit/action records from all other modules into a single Firestore collection (`edit_history`) and presents them in a filterable, searchable table with detailed diff views.

Key capabilities:
- Displays a unified timeline of all user actions across every module in the system.
- Provides multi-dimensional filtering: by module, action type, performer, approver, date range, and free-text keyword search.
- Shows summary statistics: total activities, today's count, active users, and current user's own activity count.
- Supports a detail modal with a field-level diff view comparing old vs. new data for each change.
- Handles backward compatibility with legacy Vietnamese page names and old record formats.

## Kien truc & Bo cuc folder

```
lichsuchinhsua/
├── index.html                 # Main page (sidebar, stats, filters, table, modal)
├── css/
│   └── history-custom.css     # Module-specific styles
├── js/
│   └── app.js                 # Core application logic (AuditLogApp IIFE)
└── README.md                  # This file
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Main HTML page. Contains the sidebar navigation shell, 4 stats cards, a filter panel (module, action type, performer, approver, date range, keyword), the history table, a detail modal overlay, and a loading overlay. Loads shared and module-specific scripts. |
| `js/app.js` | Core application logic exposed as `window.AuditLogApp` (IIFE pattern). Handles Firestore data loading from `edit_history` collection, record normalization (legacy and new formats), filtering, stats computation, table rendering, and the detail diff modal. |
| `css/history-custom.css` | Module-specific styles for stats cards, filter panel, history table, action badges, detail modal with diff view, loading spinner, empty state, and responsive breakpoints (768px, 480px). |

## Dependencies

### Shared libs (project-internal)
- `../shared/js/firebase-config.js` -- Firebase app initialization and Firestore instance
- `../shared/js/navigation-modern.js` -- Sidebar navigation rendering (deferred)
- `../shared/js/storage-migration.js` -- Storage migration utilities
- `../shared/js/permissions-helper.js` -- `PermissionHelper.enforcePageAccess('lichsuchinhsua')` for access control
- `../shared/js/notification-system.js` -- Notification toast system (loaded but not directly called in current code)
- `../shared/esm/compat.js` -- ES module compatibility layer
- `../inventory-tracking/css/modern.css` -- Base/shared CSS framework (layout, sidebar, buttons, typography)

### CDN libraries
- **Firebase** (v10.7.1 compat): `firebase-app-compat.js`, `firebase-firestore-compat.js`
- **Lucide Icons** (v0.294.0): Icon library for UI icons (`history`, `filter`, `activity`, `calendar`, `users`, `user-check`, `inbox`, `x`, etc.)
- **Google Fonts**: Inter (weights 400, 500, 600, 700)

### Cross-module references
- Reads from Firestore collection `edit_history` which is written to by other modules (via `audit-logger.js` or direct writes).
- Module IDs reference all other N2Store modules: `bangkiemhang`, `inventory-tracking`, `purchase-orders`, `hangrotxa`, `inbox`, `ck`, `hanghoan`, `nhanhang`, `issue-tracking`, `customer-hub`, `orders-report`, `tpos-pancake`, `order-management`, `soorder`, `soluong-live`, `user-management`, `balance-history`, `supplier-debt`, `invoice-compare`, `soquy`, `quy-trinh`.
- Uses `window.authManager` or `sessionStorage/localStorage` key `loginindex_auth` for current user identification.

## Luong du lieu

```
1. Page Load
   └─> DOMContentLoaded
       ├─> lucide.createIcons()          -- Render icon SVGs
       └─> AuditLogApp.init()
           ├─> checkPermission()         -- PermissionHelper gate
           ├─> getCurrentUserId()        -- Read auth state (authManager / storage)
           ├─> initFilterPanel()         -- Populate module dropdown, bind events
           └─> loadAuditRecords()
               └─> Firestore query: edit_history (orderBy timestamp desc, limit 2000)
                   └─> For each doc:
                       └─> normalizeRecord()  -- Convert legacy format to unified format
                           └─> resolveModule()  -- Map Vietnamese page names to module IDs
                   └─> Client-side sort (newest first, handles mixed timestamp formats)
                   └─> Store in state.allRecords
                   └─> populateUserDropdowns()  -- Extract unique performers/approvers
                   └─> computeStats()           -- Calculate total, today, activeUsers, mine
                   └─> renderStatsCards()        -- Update stat card DOM
                   └─> renderHistoryTable()      -- Build table rows with action badges

2. User Applies Filter
   └─> onFilterChange()
       ├─> getFilters()                  -- Read all filter input values
       ├─> applyFilters()               -- Filter state.allRecords client-side
       ├─> Update state.filteredRecords
       ├─> computeStats() on filtered set
       ├─> renderStatsCards()
       └─> renderHistoryTable()

3. User Clicks Table Row
   └─> showDetailModal(record)
       ├─> Render record metadata (time, performer, approver, module, action, description)
       └─> computeDiff(oldData, newData)
           └─> Render diff table with color-coded rows (added/removed/changed)
```

## Ham chinh

### Initialization & Permissions

| Ham | Mo ta |
|-----|-------|
| `init()` | Entry point. Checks permissions, gets current user ID, initializes filter panel, and triggers data loading. |
| `checkPermission()` | Delegates to `PermissionHelper.enforcePageAccess('lichsuchinhsua')`. Returns false to block unauthorized access. |
| `getCurrentUserId()` | Reads the logged-in user ID from `window.authManager`, `sessionStorage`, or `localStorage` (`loginindex_auth` key). |

### Data Loading & Normalization

| Ham | Mo ta |
|-----|-------|
| `loadAuditRecords()` | Queries Firestore `edit_history` collection (limit 2000, ordered by timestamp desc). Normalizes each record, sorts client-side, populates dropdowns, computes stats, and renders the table. |
| `normalizeRecord(record)` | Converts both legacy format (fields: `user`, `page`, `action`) and new format (fields: `performerUserId`, `module`, `actionType`) into a unified record shape. |
| `resolveModule(rawPage)` | Maps raw page identifiers to canonical module IDs. Handles both direct module IDs and legacy Vietnamese page names via `PAGE_ALIAS_MAP`. |

### Filtering

| Ham | Mo ta |
|-----|-------|
| `applyFilters(records, filters)` | Pure function that filters an array of records by module, actionType, performer, approver, date range (start/end), and keyword (searches across description, entityId, performerUserName, actionType, module). |
| `getFilters()` | Reads current values from all filter DOM inputs and returns a filters object. |
| `onFilterChange()` | Orchestrator: reads filters, applies them, updates result count, recomputes stats, and re-renders table. |
| `updateActionTypeOptions(selectedModule)` | Dynamically updates the action type dropdown options based on the selected module using `MODULE_ACTION_MAP`. |
| `populateUserDropdowns()` | Extracts unique performer and approver user IDs/names from loaded records and populates the respective filter dropdowns. |
| `debounce(fn, delay)` | Standard debounce utility. Used for keyword search input (300ms delay). |

### Rendering

| Ham | Mo ta |
|-----|-------|
| `renderStatsCards(stats)` | Updates the 4 stat card DOM elements with computed values (total, today, activeUsers, mine). |
| `renderHistoryTable(records)` | Builds the HTML table body from filtered records. Each row shows STT, timestamp, performer, module name, action badge (color-coded), description (truncated), and approver. Binds click handlers for detail modal. |
| `showDetailModal(record)` | Opens a modal showing full record details and a diff table comparing `oldData` vs `newData` with color-coded rows for added (green), removed (red), and changed (yellow) fields. |

### Helpers

| Ham | Mo ta |
|-----|-------|
| `computeDiff(oldData, newData)` | Compares two data objects field-by-field and returns an array of changes with type (`added`, `removed`, `changed`), old value, and new value. Uses `JSON.stringify` for deep comparison. |
| `computeStats(records, currentUserId)` | Calculates summary statistics: total record count, records from today, number of unique active users, and count of current user's own records. |
| `getActionBadge(actionType)` | Looks up the display label and color for a given action type from `ACTION_BADGE_MAP`. Returns a fallback gray badge for unknown types. |
| `formatTimestamp(record)` | Converts various timestamp formats (Firestore Timestamp, seconds-based, Date object, string) into `DD/MM/YYYY HH:MM:SS` display format. |
| `getTimestampDate(record)` | Extracts a JavaScript `Date` object from the record's timestamp field, handling all supported formats. |
| `escapeHtml(str)` | Sanitizes strings for safe HTML insertion using DOM `textContent` assignment. |
| `getModuleName(moduleId)` | Maps a module ID to its human-readable Vietnamese name from `ALL_MODULES`. |

### Constants

| Constant | Mo ta |
|----------|-------|
| `ALL_MODULES` | Array of 22 module definitions with `id`, `name`, and `implemented` flag. Used for filter dropdown and module name resolution. |
| `PAGE_ALIAS_MAP` | Object mapping legacy Vietnamese page names to canonical module IDs for backward compatibility. |
| `MODULE_ACTION_MAP` | Object mapping each module ID to its valid action types. New modules use semantic actions (e.g., `wallet_add_debt`), legacy modules use generic actions (`add`, `edit`, `delete`, `update`, `mark`). |
| `ACTION_BADGE_MAP` | Object mapping action type keys to display objects with `text` (Vietnamese label) and `color` (hex color for badge background). Contains 17 specific action types plus 5 generic legacy actions. |

### Public API (window.AuditLogApp)

The module exposes the following via `window.AuditLogApp`:
- `init()` -- Initialize the page
- `normalizeRecord()` -- Normalize a raw Firestore record
- `resolveModule()` -- Resolve module ID from any format
- `computeDiff()` -- Compare two data objects
- `computeStats()` -- Calculate summary statistics
- `applyFilters()` -- Filter records array
- `getActionBadge()` -- Get badge config for action type
- `ALL_MODULES` -- Module definitions array
- `PAGE_ALIAS_MAP` -- Legacy name mapping
- `MODULE_ACTION_MAP` -- Module-to-actions mapping
