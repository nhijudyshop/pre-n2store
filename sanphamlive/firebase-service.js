// js/firebase-service.js - Firebase Firestore Operations

class FirebaseService {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this.setupNetworkListeners();
    }

    // Initialize service
    init() {
        if (!window.isFirebaseInitialized || !window.isFirebaseInitialized()) {
            console.error("Firebase chưa được khởi tạo");
            return false;
        }

        // Get db from window
        this.db = window.db;

        if (!this.db) {
            console.error("window.db is null");
            return false;
        }

        console.log("✓ Firebase Service initialized with db:", this.db);
        return true;
    }

    // Setup network status listeners
    setupNetworkListeners() {
        window.addEventListener("online", () => {
            this.isOnline = true;
            console.log("✓ Online - Syncing with Firebase");
            showNotification("Đã kết nối mạng - Đang đồng bộ...", "info");
        });

        window.addEventListener("offline", () => {
            this.isOnline = false;
            console.log("⚠ Offline - Working locally");
            showNotification("Mất kết nối - Dữ liệu lưu cục bộ", "info");
        });
    }

    // ==================== INVENTORY OPERATIONS ====================

    // Load all inventory data
    async loadInventory() {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            const snapshot = await this.db
                .collection(COLLECTIONS.INVENTORY)
                .orderBy("dateCell", "desc")
                .get();

            const data = [];
            snapshot.forEach((doc) => {
                data.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });

            console.log(
                `✓ Loaded ${data.length} inventory items from Firebase`,
            );
            return data;
        } catch (error) {
            console.error("Error loading inventory:", error);

            // Try to use cached data if offline
            const cachedData = getCachedData();
            if (cachedData) {
                console.log("Using cached data instead");
                return cachedData;
            }

            throw error;
        }
    }

    // Add new inventory item
    async addItem(item) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            // Remove local ID before saving to Firebase
            const itemData = { ...item };
            delete itemData.id; // Firebase will generate its own ID

            const docRef = await this.db.collection(COLLECTIONS.INVENTORY).add({
                ...itemData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            console.log("✓ Item added to Firebase with ID:", docRef.id);

            // Update local cache with Firebase ID
            const newItem = { ...itemData, id: docRef.id };
            const currentData = window.inventoryData || [];

            // Remove old item with local ID if exists
            const filteredData = currentData.filter((i) => i.id !== item.id);
            const updatedData = [newItem, ...filteredData];

            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return docRef.id;
        } catch (error) {
            console.error("Error adding item:", error);

            // Fallback to local storage
            if (!this.isOnline) {
                console.log("Offline mode - saving locally");
                const currentData = window.inventoryData || [];
                const updatedData = [item, ...currentData];
                window.inventoryData = updatedData;
                setCachedData(updatedData);
                return item.id;
            }

            throw error;
        }
    }

    // Update inventory item
    async updateItem(itemId, updates) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            await this.db
                .collection(COLLECTIONS.INVENTORY)
                .doc(itemId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

            console.log("✓ Item updated in Firebase:", itemId);

            // Update local cache
            const currentData = window.inventoryData || [];
            const updatedData = currentData.map((item) =>
                item.id === itemId ? { ...item, ...updates } : item,
            );
            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return true;
        } catch (error) {
            console.error("Error updating item:", error);

            // Fallback to local update
            if (!this.isOnline) {
                console.log("Offline mode - updating locally");
                const currentData = window.inventoryData || [];
                const updatedData = currentData.map((item) =>
                    item.id === itemId ? { ...item, ...updates } : item,
                );
                window.inventoryData = updatedData;
                setCachedData(updatedData);
                return true;
            }

            throw error;
        }
    }

    // Delete inventory item
    async deleteItem(itemId) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            await this.db
                .collection(COLLECTIONS.INVENTORY)
                .doc(itemId)
                .delete();

            console.log("✓ Item deleted from Firebase:", itemId);

            // Update local cache
            const currentData = window.inventoryData || [];
            const updatedData = currentData.filter(
                (item) => item.id !== itemId,
            );
            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return true;
        } catch (error) {
            console.error("Error deleting item:", error);

            // Fallback to local delete
            if (!this.isOnline) {
                console.log("Offline mode - deleting locally");
                const currentData = window.inventoryData || [];
                const updatedData = currentData.filter(
                    (item) => item.id !== itemId,
                );
                window.inventoryData = updatedData;
                setCachedData(updatedData);
                return true;
            }

            throw error;
        }
    }

    // Delete multiple items
    async deleteMultipleItems(itemIds) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            const batch = this.db.batch();

            itemIds.forEach((id) => {
                const docRef = this.db
                    .collection(COLLECTIONS.INVENTORY)
                    .doc(id);
                batch.delete(docRef);
            });

            await batch.commit();

            console.log(`✓ Deleted ${itemIds.length} items from Firebase`);

            // Update local cache
            const currentData = window.inventoryData || [];
            const itemIdSet = new Set(itemIds);
            const updatedData = currentData.filter(
                (item) => !itemIdSet.has(item.id),
            );
            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return true;
        } catch (error) {
            console.error("Error deleting multiple items:", error);

            // Fallback to local delete
            if (!this.isOnline) {
                console.log("Offline mode - deleting locally");
                const currentData = window.inventoryData || [];
                const itemIdSet = new Set(itemIds);
                const updatedData = currentData.filter(
                    (item) => !itemIdSet.has(item.id),
                );
                window.inventoryData = updatedData;
                setCachedData(updatedData);
                return true;
            }

            throw error;
        }
    }

    // ==================== ORDER CODE OPERATIONS ====================

    // Add order code to item
    async addOrderCode(itemId, orderCode) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            await this.db
                .collection(COLLECTIONS.INVENTORY)
                .doc(itemId)
                .update({
                    orderCodes:
                        firebase.firestore.FieldValue.arrayUnion(orderCode),
                    customerOrders: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

            console.log("✓ Order code added to Firebase:", orderCode);

            // Update local cache
            const currentData = window.inventoryData || [];
            const updatedData = currentData.map((item) => {
                if (item.id === itemId) {
                    const newOrderCodes = [
                        ...(item.orderCodes || []),
                        orderCode,
                    ];
                    return {
                        ...item,
                        orderCodes: newOrderCodes,
                        customerOrders: newOrderCodes.length,
                    };
                }
                return item;
            });
            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return true;
        } catch (error) {
            console.error("Error adding order code:", error);
            throw error;
        }
    }

    // Remove order code from item
    async removeOrderCode(itemId, orderCode) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            await this.db
                .collection(COLLECTIONS.INVENTORY)
                .doc(itemId)
                .update({
                    orderCodes:
                        firebase.firestore.FieldValue.arrayRemove(orderCode),
                    customerOrders: firebase.firestore.FieldValue.increment(-1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

            console.log("✓ Order code removed from Firebase:", orderCode);

            // Update local cache
            const currentData = window.inventoryData || [];
            const updatedData = currentData.map((item) => {
                if (item.id === itemId) {
                    const newOrderCodes = (item.orderCodes || []).filter(
                        (code) => code !== orderCode,
                    );
                    return {
                        ...item,
                        orderCodes: newOrderCodes,
                        customerOrders: newOrderCodes.length,
                    };
                }
                return item;
            });
            window.inventoryData = updatedData;
            setCachedData(updatedData);

            return true;
        } catch (error) {
            console.error("Error removing order code:", error);
            throw error;
        }
    }

    // ==================== LOGGING OPERATIONS ====================

    // Save action log
    async saveLog(logEntry) {
        try {
            if (!this.db) {
                return;
            }

            await this.db.collection(COLLECTIONS.LOGS).add({
                ...logEntry,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });

            console.log("✓ Log saved to Firebase");
        } catch (error) {
            console.error("Error saving log:", error);
        }
    }

    // ==================== REAL-TIME SYNC ====================

    // Listen to real-time updates
    listenToInventory(callback) {
        try {
            if (!this.db) {
                throw new Error("Firestore not initialized");
            }

            const unsubscribe = this.db
                .collection(COLLECTIONS.INVENTORY)
                .orderBy("dateCell", "desc")
                .onSnapshot(
                    (snapshot) => {
                        const data = [];
                        snapshot.forEach((doc) => {
                            data.push({
                                id: doc.id,
                                ...doc.data(),
                            });
                        });

                        console.log("✓ Real-time update received");
                        callback(data);
                    },
                    (error) => {
                        console.error("Real-time listener error:", error);
                    },
                );

            return unsubscribe;
        } catch (error) {
            console.error("Error setting up listener:", error);
            return null;
        }
    }
}

// Create global instance
window.firebaseService = new FirebaseService();

// Export for use in other modules
window.FirebaseService = FirebaseService;

// Helper function to check if ID is from Firebase or local
window.isFirebaseId = function (id) {
    if (!id) return false;
    // Firebase IDs are alphanumeric and exactly 20 characters
    // Local IDs contain underscore and are timestamp-based
    return !id.includes("_") && id.length === 20;
};

console.log("✓ Firebase Service module loaded");
