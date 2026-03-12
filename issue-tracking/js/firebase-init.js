// firebase-init.js
// Configuration and Initialization for Firebase Services

// firebaseConfig is provided by ../shared/js/firebase-config.js (loaded via core-loader.js)

// Initialize Firebase (using global firebaseConfig)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('[FIREBASE] Initialized successfully');
} else {
    console.log('[FIREBASE] Already initialized');
}

// Export database reference
const db = firebase.database();

/**
 * Helper to get a reference to the tickets node
 */
function getTicketsRef() {
    return db.ref('issue_tracking/tickets');
}
