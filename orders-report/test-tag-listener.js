/**
 * TEST TAG REALTIME LISTENER
 *
 * Paste this code into Console (F12) to test if Firebase listener is working
 */

// Test 1: Check if Firebase is available
console.log('=== TEST 1: Firebase Check ===');
console.log('Firebase database:', database ? '✅ Available' : '❌ Not available');

// Test 2: Check if listeners are setup
console.log('\n=== TEST 2: Listeners Setup ===');
console.log('tagListenersSetup:', typeof tagListenersSetup !== 'undefined' ? tagListenersSetup : 'undefined');

// Test 3: Check current user
console.log('\n=== TEST 3: Current User ===');
const auth = window.authManager ? window.authManager.getAuthState() : null;
const currentUser = auth && auth.displayName ? auth.displayName : 'Unknown';
console.log('Current user:', currentUser);

// Test 4: Manually listen to Firebase
console.log('\n=== TEST 4: Manual Firebase Listener ===');
if (database) {
    console.log('Setting up manual test listener...');

    database.ref('tag_updates').on('child_changed', (snapshot) => {
        console.log('🔥 [MANUAL TEST] Firebase child_changed triggered!');
        console.log('🔥 [MANUAL TEST] Data:', snapshot.val());
    });

    database.ref('tag_updates').on('value', (snapshot) => {
        console.log('🔥 [MANUAL TEST] Firebase value event triggered!');
        console.log('🔥 [MANUAL TEST] Total updates:', snapshot.numChildren());
    });

    console.log('✅ Manual listener setup complete');
    console.log('Now save a TAG from another user and watch for events...');
} else {
    console.log('❌ Firebase not available');
}

// Test 5: Simulate TAG update received
console.log('\n=== TEST 5: Simulate Update ===');
console.log('Simulating TAG update...');
const testUpdate = {
    orderId: 'test-order-123',
    orderCode: 'TEST001',
    STT: 999,
    tags: [{ Id: 1, Name: 'TEST', Color: '#ff0000' }],
    updatedBy: 'Test User',
    timestamp: Date.now()
};

if (typeof handleRealtimeTagUpdate === 'function') {
    console.log('Calling handleRealtimeTagUpdate...');
    handleRealtimeTagUpdate(testUpdate, 'test');
} else {
    console.log('❌ handleRealtimeTagUpdate not found');
}

console.log('\n=== TEST COMPLETE ===');
console.log('Check logs above for any issues');
