/**
 * Firebase Helpers Global Wrapper
 * This file imports all functions from firebase-helpers.js as ES Module
 * and exposes them to the global window object for use in HTML files.
 */
import {
    addProductToFirebase,
    addProductsToFirebase,
    removeProductFromFirebase,
    removeProductsFromFirebase,
    updateProductQtyInFirebase,
    updateProductVisibility,
    cleanupOldProducts,
    clearAllProducts,
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,
    // Cart cache helpers
    getCartCache,
    setCartCache,
    invalidateCartCache,
    // Cart snapshot functions
    saveCartSnapshot,
    getCartSnapshot,
    getAllCartSnapshots,
    restoreProductsFromSnapshot,
    deleteCartSnapshot,
    // Sales log functions
    logSaleTransaction,
    getSalesLogByDate,
    getAllSalesLogs
} from './firebase-helpers.js';

// Expose all functions to global window object
Object.assign(window, {
    addProductToFirebase,
    addProductsToFirebase,
    removeProductFromFirebase,
    removeProductsFromFirebase,
    updateProductQtyInFirebase,
    updateProductVisibility,
    cleanupOldProducts,
    clearAllProducts,
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,
    // Cart cache helpers
    getCartCache,
    setCartCache,
    invalidateCartCache,
    // Cart snapshot functions
    saveCartSnapshot,
    getCartSnapshot,
    getAllCartSnapshots,
    restoreProductsFromSnapshot,
    deleteCartSnapshot,
    // Sales log functions
    logSaleTransaction,
    getSalesLogByDate,
    getAllSalesLogs
});

console.log('✅ Firebase helpers loaded and exposed to global scope');
