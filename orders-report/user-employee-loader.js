// =====================================================
// USER EMPLOYEE LOADER
// Load danh sách nhân viên từ Firestore để phân chia STT
// =====================================================

class UserEmployeeLoader {
    constructor() {
        this.users = [];
        this.db = null;
        this.initialized = false;
    }

    /**
     * Initialize Firestore connection
     */
    async initialize() {
        try {
            // Check if Firebase Firestore is already initialized
            if (firebase.apps.length > 0 && firebase.firestore) {
                this.db = firebase.firestore();
                console.log('[USER-EMPLOYEE] Firestore initialized successfully');
                this.initialized = true;
                return true;
            } else {
                console.error('[USER-EMPLOYEE] Firebase Firestore not available');
                return false;
            }
        } catch (error) {
            console.error('[USER-EMPLOYEE] Error initializing Firestore:', error);
            return false;
        }
    }

    /**
     * Load users from Firestore
     * @returns {Promise<Array>} List of users with displayName and id
     */
    async loadUsers() {
        if (!this.initialized || !this.db) {
            console.error('[USER-EMPLOYEE] Not initialized');
            return [];
        }

        try {
            console.log('[USER-EMPLOYEE] Loading users from Firestore...');
            const snapshot = await this.db.collection('users').get();

            this.users = [];
            snapshot.forEach((doc) => {
                const userData = doc.data();
                this.users.push({
                    id: doc.id,
                    displayName: userData.displayName || 'Unknown',
                    email: userData.email || '',
                    checkLogin: userData.checkLogin // 0 = admin, 1 = user
                });
            });

            // Sort by displayName
            this.users.sort((a, b) => a.displayName.localeCompare(b.displayName));

            console.log(`[USER-EMPLOYEE] Loaded ${this.users.length} users`);
            return this.users;
        } catch (error) {
            console.error('[USER-EMPLOYEE] Error loading users:', error);
            return [];
        }
    }

    /**
     * Get all users
     * @returns {Array} List of users
     */
    getUsers() {
        return this.users;
    }
}

// Create global instance
window.userEmployeeLoader = new UserEmployeeLoader();
