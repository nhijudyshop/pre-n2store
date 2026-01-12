/**
 * CENTRALIZED FIREBASE CONFIGURATION
 * File: firebase-config.js
 * Purpose: Single source of truth cho Firebase config, tránh duplication
 */

// Firebase Configuration - ONLY DEFINE ONCE
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Global exports
if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = FIREBASE_CONFIG;
}

// Module exports (for future bundling)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FIREBASE_CONFIG };
}
