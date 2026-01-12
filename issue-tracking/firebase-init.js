// firebase-init.js
// Configuration and Initialization for Firebase Services

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
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
