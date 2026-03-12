/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      TAB3-PRODUCT-ASSIGNMENT.JS                             ║
 * ║                         MODULE AGGREGATOR                                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                             ║
 * ║  This file was refactored from a single 6,600+ line monolith into           ║
 * ║  9 logical sub-modules. Each sub-module is a self-contained IIFE that       ║
 * ║  shares state via the window._tab3 namespace.                               ║
 * ║                                                                             ║
 * ║  LOAD ORDER (each file depends on the ones above it):                       ║
 * ║                                                                             ║
 * ║  1. tab3-core.js          State, Firebase, utilities, auth, note encoding,  ║
 * ║                            notification, data loading, save/load, init.     ║
 * ║                            Creates window._tab3 namespace.                  ║
 * ║                                                                             ║
 * ║  2. tab3-filters.js       Product search, display suggestions,              ║
 * ║                            sort variants, filter assignments.               ║
 * ║                                                                             ║
 * ║  3. tab3-table.js         Assignment table rendering, STT input handlers,   ║
 * ║                            STT suggestions, order tooltip.                  ║
 * ║                                                                             ║
 * ║  4. tab3-assignment.js    Product assignment CRUD: add/remove products,     ║
 * ║                            add/remove STTs, clear all, reload.              ║
 * ║                                                                             ║
 * ║  5. tab3-export.js        Export orders to Excel via XLSX library.           ║
 * ║                                                                             ║
 * ║  6. tab3-upload.js        Upload table views (by order / by product),       ║
 * ║                            preview, upload execution, finalize session.     ║
 * ║                                                                             ║
 * ║  7. tab3-history.js       Upload History V1, history detail view,           ║
 * ║                            cart comparison (shared by V1 and V2).           ║
 * ║                                                                             ║
 * ║  8. tab3-history-v2.js    Upload History V2 with Firebase sync,             ║
 * ║                            multi-user filter, group-by-STT view.           ║
 * ║                                                                             ║
 * ║  9. tab3-removal.js       Product removal feature: search, add products,   ║
 * ║                            preview removal, execute via TPOS API.           ║
 * ║                                                                             ║
 * ║  SHARED NAMESPACE: window._tab3                                             ║
 * ║    .state      - All shared state (getter/setter proxied)                   ║
 * ║    .database   - Firebase Realtime Database reference                       ║
 * ║    .utils      - Utility functions                                          ║
 * ║    .auth       - Auth & API functions                                       ║
 * ║    .noteEncoding - Note encode/decode functions                             ║
 * ║    .ui         - UI helpers (showNotification)                              ║
 * ║    .data       - Data loading & persistence functions                       ║
 * ║    .fn         - Cross-module function registry (populated by modules)      ║
 * ║                                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// This file is now a documentation-only aggregator.
// All functionality has been moved to the sub-module files listed above.
// The sub-modules are loaded via <script> tags in tab3-product-assignment.html.
