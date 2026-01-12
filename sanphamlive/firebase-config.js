// js/firebase-config.js - Firebase Configuration & Setup

// Firebase configuration - THAY ĐỔI BẰNG CONFIG CỦA BẠN
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
let db = null;
let isFirebaseInitialized = false;

function initializeFirebase() {
    try {
        if (typeof firebase === "undefined") {
            console.error("Firebase SDK chưa được load");
            return false;
        }

        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Initialize Firestore WITHOUT calling settings() to avoid warning
        db = firebase.firestore();

        // Enable offline persistence (the deprecation warning is unavoidable in v9.22.0 compat mode)
        // This will continue to work, but future versions may require migration to modular SDK
        db.enablePersistence({
            synchronizeTabs: true,
        })
            .then(() => {
                console.log("✓ Firebase offline persistence enabled");
            })
            .catch((err) => {
                if (err.code === "failed-precondition") {
                    console.warn(
                        "⚠ Multiple tabs open, persistence enabled in first tab only",
                    );
                } else if (err.code === "unimplemented") {
                    console.warn("⚠ Browser does not support persistence");
                }
            });

        isFirebaseInitialized = true;

        // IMPORTANT: Set db globally IMMEDIATELY
        window.db = db;

        console.log("✓ Firebase initialized successfully");
        return true;
    } catch (error) {
        console.error("✖ Firebase initialization error:", error);
        isFirebaseInitialized = false;
        return false;
    }
}

// Firestore Collections
const COLLECTIONS = {
    INVENTORY: "inventory",
    LOGS: "logs",
    SETTINGS: "settings",
};

// Export configuration
window.firebaseConfig = firebaseConfig;
window.db = db;
window.initializeFirebase = initializeFirebase;
window.isFirebaseInitialized = () => isFirebaseInitialized;
window.COLLECTIONS = COLLECTIONS;

console.log("✓ Firebase config module loaded");
