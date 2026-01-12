// =====================================================
// SUPPLIER LOADER FROM TPOS API
// File: soorder-supplier-loader.js
// Loads supplier list from TPOS OData API and saves to Firebase
// =====================================================

window.SoOrderSupplierLoader = {
    // Cloudflare Worker proxy URL
    WORKER_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',

    // TPOS credentials (same as token-manager.js in orders-report)
    TPOS_CREDENTIALS: {
        grant_type: 'password',
        username: 'nvkt',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    },

    // Queue for duplicate suppliers pending user selection
    duplicateQueue: [],
    duplicateResolveCallback: null,

    // =====================================================
    // GET TPOS TOKEN (via Worker with caching)
    // =====================================================
    async getTPOSToken() {
        try {
            console.log('[Supplier Loader] 🔑 Fetching TPOS token...');

            // Create form data with all required parameters
            const formData = new URLSearchParams();
            formData.append('grant_type', this.TPOS_CREDENTIALS.grant_type);
            formData.append('username', this.TPOS_CREDENTIALS.username);
            formData.append('password', this.TPOS_CREDENTIALS.password);
            formData.append('client_id', this.TPOS_CREDENTIALS.client_id);

            const response = await fetch(`${this.WORKER_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Supplier Loader] Token request error response:', errorText);
                throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }

            console.log('[Supplier Loader] ✅ Token retrieved successfully');

            return data.access_token;

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error fetching token:', error);
            throw error;
        }
    },

    // =====================================================
    // FETCH SUPPLIERS FROM TPOS ODATA API
    // =====================================================
    async fetchSuppliersFromTPOS(token) {
        try {
            console.log('[Supplier Loader] 📡 Fetching suppliers from TPOS OData API...');

            // OData query parameters
            const params = new URLSearchParams({
                '$top': '1000',  // Tăng từ 50 lên 1000 để lấy nhiều NCC hơn
                '$orderby': 'Name',
                '$filter': '(Supplier eq true and Active eq true)',
                '$count': 'true'
            });

            // Build full URL through worker proxy
            const apiUrl = `${this.WORKER_URL}/api/odata/Partner/ODataService.GetView?${params.toString()}`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
                }
            });

            if (!response.ok) {
                throw new Error(`TPOS API request failed: ${response.status}`);
            }

            const data = await response.json();

            console.log(`[Supplier Loader] ✅ Fetched ${data.value?.length || 0} suppliers (Total: ${data['@odata.count'] || 'unknown'})`);

            // Debug: Log raw API response structure
            console.log('[Supplier Loader] 📋 Raw API response keys:', Object.keys(data));
            if (data.value && data.value.length > 0) {
                console.log('[Supplier Loader] 📋 First item from API:', JSON.stringify(data.value[0], null, 2));
            }

            return data.value || [];

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error fetching suppliers:', error);
            throw error;
        }
    },

    // =====================================================
    // PARSE NCC CODE FROM NAME
    // Uses existing parseNCCCode utility
    // =====================================================
    parseNCCCode(text) {
        const crud = window.SoOrderCRUD;
        if (crud && crud.parseNCCCode) {
            return crud.parseNCCCode(text);
        }

        // Fallback: simple regex to extract Ax code
        const match = text.match(/\b(A\d+)\b/i);
        return match ? match[1].toUpperCase() : null;
    },

    // =====================================================
    // HELPER: Sanitize document ID for Firestore
    // Firestore document IDs cannot contain: / \ . # $ [ ]
    // =====================================================
    sanitizeDocId(id) {
        if (!id) return null;
        // Replace invalid characters with underscore
        return String(id).replace(/[\/\\\.#$\[\]]/g, '_').trim();
    },

    // =====================================================
    // HELPER: Chunk array into smaller arrays
    // =====================================================
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    },

    // =====================================================
    // HELPER: Delete all documents in collection with chunking
    // =====================================================
    async deleteAllFromCollection(collectionRef, db) {
        const BATCH_SIZE = 400; // Safe limit under 500

        try {
            const snapshot = await collectionRef.get();

            if (snapshot.empty) {
                console.log('[Supplier Loader] ℹ️ No existing documents to delete');
                return 0;
            }

            const docs = snapshot.docs;
            const chunks = this.chunkArray(docs, BATCH_SIZE);
            let totalDeleted = 0;

            console.log(`[Supplier Loader] 🗑️ Deleting ${docs.length} documents in ${chunks.length} batches...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const batch = db.batch();

                chunk.forEach((doc) => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                totalDeleted += chunk.length;
                console.log(`[Supplier Loader] ✅ Deleted batch ${i + 1}/${chunks.length} (${chunk.length} docs)`);
            }

            return totalDeleted;
        } catch (error) {
            console.error('[Supplier Loader] ❌ Error deleting documents:', error);
            throw error;
        }
    },

    // =====================================================
    // SAVE SUPPLIERS TO FIREBASE - VIẾT LẠI HOÀN TOÀN
    // - Xử lý batch chunking (tránh vượt 500 limit)
    // - Sanitize document ID
    // - Error handling tốt hơn
    // =====================================================
    async saveSuppliersToFirebase(suppliers) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const BATCH_SIZE = 400; // Safe limit under Firestore's 500

        if (!config || !config.nccNamesCollectionRef || !config.db) {
            throw new Error('Firebase config not initialized');
        }

        try {
            console.log('[Supplier Loader] 💾 Saving ALL suppliers to Firebase...');
            console.log(`[Supplier Loader] 📊 Total suppliers from TPOS: ${suppliers.length}`);

            // Debug: Log first supplier to see structure
            if (suppliers.length > 0) {
                console.log('[Supplier Loader] 📋 Sample supplier object:', JSON.stringify(suppliers[0], null, 2));
                console.log('[Supplier Loader] 📋 Available keys:', Object.keys(suppliers[0]));
            }

            // Step 1: Xóa toàn bộ dữ liệu cũ trong Firebase trước
            const deletedCount = await this.deleteAllFromCollection(
                config.nccNamesCollectionRef,
                config.db
            );
            console.log(`[Supplier Loader] ✅ Deleted ${deletedCount} existing suppliers`);

            // Step 2: Chuẩn bị data để lưu
            const suppliersToSave = [];

            for (const supplier of suppliers) {
                // Handle different property names from API
                // API trả về: Name, Ref (không phải Code)
                const name = supplier.Name || supplier.name;
                const tposCode = supplier.Ref || supplier.ref || supplier.Code || supplier.code;

                if (!name || !tposCode) {
                    console.warn('[Supplier Loader] ⚠️ Skipping supplier without name or code:', JSON.stringify(supplier));
                    continue;
                }

                // Sanitize document ID
                const docId = this.sanitizeDocId(tposCode);
                if (!docId) {
                    console.warn('[Supplier Loader] ⚠️ Invalid document ID for:', supplier);
                    continue;
                }

                const axCode = this.parseNCCCode(name);
                suppliersToSave.push({
                    docId: docId,
                    data: {
                        name: name.trim(),
                        axCode: axCode || null,
                        tposCode: tposCode // Lưu lại TPOS code gốc
                    }
                });
            }

            console.log(`[Supplier Loader] 📋 Prepared ${suppliersToSave.length} suppliers to save`);

            // Debug: If no suppliers to save, log more info
            if (suppliersToSave.length === 0 && suppliers.length > 0) {
                console.error('[Supplier Loader] ❌ No valid suppliers to save! Check data structure.');
                console.error('[Supplier Loader] ❌ First 3 suppliers:', JSON.stringify(suppliers.slice(0, 3), null, 2));
            }

            // Step 3: Lưu theo batches
            const chunks = this.chunkArray(suppliersToSave, BATCH_SIZE);
            let totalSaved = 0;

            console.log(`[Supplier Loader] 💾 Saving in ${chunks.length} batches...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const batch = config.db.batch();

                for (const item of chunk) {
                    const docRef = config.nccNamesCollectionRef.doc(item.docId);
                    batch.set(docRef, item.data);
                }

                await batch.commit();
                totalSaved += chunk.length;
                console.log(`[Supplier Loader] ✅ Saved batch ${i + 1}/${chunks.length} (${chunk.length} docs)`);
            }

            console.log(`[Supplier Loader] ✅ Total saved: ${totalSaved} suppliers to Firebase`);

            return { success: true, count: totalSaved };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error saving to Firebase:', error);
            console.error('[Supplier Loader] ❌ Error details:', error.message, error.code);
            throw error;
        }
    },

    // =====================================================
    // PROCESS DUPLICATE GROUPS - PROMPT USER FOR EACH
    // =====================================================
    async processDuplicateGroups(duplicateGroups, existingNames) {
        const selectedSuppliers = [];

        for (const group of duplicateGroups) {
            const existingName = existingNames.get(group.code.toUpperCase());

            // Show modal for user to select
            const selected = await this.showDuplicateSelectionModal(group.code, group.suppliers, existingName);

            if (selected) {
                selectedSuppliers.push(selected);
            }
        }

        return selectedSuppliers;
    },

    // =====================================================
    // SHOW MODAL FOR DUPLICATE SUPPLIER SELECTION
    // =====================================================
    showDuplicateSelectionModal(code, suppliers, existingName) {
        return new Promise((resolve) => {
            const ui = window.SoOrderUI;
            const utils = window.SoOrderUtils;

            // Build options including existing name if different
            const options = [...suppliers];

            // Add existing name as an option if it's different from all new suppliers
            if (existingName) {
                const existingMatches = suppliers.some(s => s.name === existingName);
                if (!existingMatches) {
                    options.unshift({
                        code: code,
                        name: existingName,
                        isExisting: true
                    });
                }
            }

            // If only one option after adding existing, auto-select it
            if (options.length === 1) {
                resolve(options[0]);
                return;
            }

            // Show the duplicate selection modal
            ui.showDuplicateSupplierModal(code, options, (selected) => {
                resolve(selected);
            });
        });
    },

    // =====================================================
    // UPDATE APPLICATION STATE FROM FIREBASE
    // =====================================================
    async updateStateFromFirebase() {
        const state = window.SoOrderState;
        const config = window.SoOrderConfig;

        if (!state || !config) {
            console.warn('[Supplier Loader] ⚠️ State or config not initialized');
            return;
        }

        try {
            console.log('[Supplier Loader] 🔄 Updating application state from Firebase...');

            // Load fresh data from Firebase
            const snapshot = await config.nccNamesCollectionRef.get();
            state.nccNames = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                // data.tposCode là mã gốc từ TPOS
                // doc.id là mã đã sanitized (dùng làm document ID)
                state.nccNames.push({
                    code: data.axCode || doc.id.toUpperCase(), // Dùng axCode nếu có
                    tposCode: data.tposCode || doc.id, // Mã TPOS gốc
                    docId: doc.id, // Document ID (sanitized)
                    name: data.name
                });
            });

            // Sort by Ax code number (nếu là Ax code), sau đó theo tên
            state.nccNames.sort((a, b) => {
                const aIsAx = /^A\d+$/i.test(a.code);
                const bIsAx = /^A\d+$/i.test(b.code);

                if (aIsAx && bIsAx) {
                    const numA = parseInt(a.code.replace(/^A/i, '')) || 0;
                    const numB = parseInt(b.code.replace(/^A/i, '')) || 0;
                    return numA - numB;
                }
                if (aIsAx) return -1; // Ax codes first
                if (bIsAx) return 1;
                return a.name.localeCompare(b.name);
            });

            console.log(`[Supplier Loader] ✅ State updated with ${state.nccNames.length} suppliers from Firebase`);

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error updating state from Firebase:', error);
            throw error;
        }
    },

    // Legacy function for backward compatibility
    updateState(suppliers) {
        const state = window.SoOrderState;

        if (!state) {
            console.warn('[Supplier Loader] ⚠️ State not initialized');
            return;
        }

        try {
            console.log('[Supplier Loader] 🔄 Updating application state...');

            // Clear existing state
            state.nccNames = [];

            // Add all suppliers to state - extracting Ax code from Name
            for (const supplier of suppliers) {
                const name = supplier.Name;

                if (!name) continue;

                const code = this.parseNCCCode(name);
                if (code) {
                    // Check if code already exists (avoid duplicates in state)
                    const exists = state.nccNames.some(n => n.code.toUpperCase() === code.toUpperCase());
                    if (!exists) {
                        state.nccNames.push({
                            code: code.toUpperCase(),
                            name: name.trim()
                        });
                    }
                }
            }

            // Sort by code number
            state.nccNames.sort((a, b) => {
                const numA = parseInt(a.code.replace(/^A/i, '')) || 0;
                const numB = parseInt(b.code.replace(/^A/i, '')) || 0;
                return numA - numB;
            });

            console.log(`[Supplier Loader] ✅ State updated with ${state.nccNames.length} suppliers`);

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error updating state:', error);
            throw error;
        }
    },

    // =====================================================
    // MAIN FUNCTION: Load Suppliers from TPOS and Save to Firebase
    // =====================================================
    async loadAndSaveSuppliers() {
        const utils = window.SoOrderUtils;

        try {
            console.log('[Supplier Loader] 🚀 Starting supplier load process...');

            // Show loading toast
            if (utils && utils.showToast) {
                utils.showToast('Đang tải danh sách NCC từ TPOS...', 'info');
            }

            // Step 1: Get TPOS token
            const token = await this.getTPOSToken();

            // Step 2: Fetch suppliers from TPOS
            const suppliers = await this.fetchSuppliersFromTPOS(token);

            if (!suppliers || suppliers.length === 0) {
                console.warn('[Supplier Loader] ⚠️ No suppliers found');
                if (utils && utils.showToast) {
                    utils.showToast('Không tìm thấy NCC nào từ TPOS', 'warning');
                }
                return { success: false, count: 0 };
            }

            // Step 3: Save to Firebase (with Ax code extraction and duplicate handling)
            const result = await this.saveSuppliersToFirebase(suppliers);

            // Step 4: Update application state from Firebase (to get the final saved data)
            await this.updateStateFromFirebase();

            // Show success toast
            if (utils && utils.showToast) {
                const state = window.SoOrderState;
                utils.showToast(`✅ Đã lưu ${state.nccNames.length} NCC vào hệ thống`, 'success');
            }

            console.log('[Supplier Loader] ✅ Supplier load process completed successfully');

            return { success: true, count: result.count };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error in load process:', error);

            // Show error toast
            if (utils && utils.showToast) {
                let errorMsg = 'Lỗi tải danh sách NCC';

                if (error.message.includes('401') || error.message.includes('Token')) {
                    errorMsg = 'Lỗi xác thực TPOS';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMsg = 'Lỗi kết nối mạng';
                } else if (error.message.includes('Firebase')) {
                    errorMsg = 'Lỗi lưu vào Firebase';
                }

                utils.showToast(`${errorMsg}: ${error.message}`, 'error');
            }

            return { success: false, error: error.message };
        }
    }
};
