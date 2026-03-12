/**
 * NCC Manager for Purchase Orders
 * Provides: load NCCs from Firebase, autocomplete suggestions, create new NCC + TPOS Partner
 * Reads from shared Firebase collection "ncc-names" (same as soorder module)
 */

window.NCCManager = (function() {
    'use strict';

    const COLLECTION = 'ncc-names';
    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    let nccNames = [];
    let loaded = false;
    let exactMatchNCC = null;

    // =====================================================
    // LOAD NCC NAMES FROM FIREBASE
    // =====================================================

    async function loadNCCNames() {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(COLLECTION).get();
            nccNames = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                nccNames.push({
                    code: data.axCode || doc.id.toUpperCase(),
                    tposCode: data.tposCode || doc.id,
                    tposId: data.tposId || null,
                    docId: doc.id,
                    name: data.name
                });
            });

            // Sort: Ax codes first (by number), then alphabetical
            nccNames.sort((a, b) => {
                const aIsAx = /^A\d+$/i.test(a.code);
                const bIsAx = /^A\d+$/i.test(b.code);
                if (aIsAx && bIsAx) {
                    return (parseInt(a.code.replace(/^A/i, '')) || 0)
                         - (parseInt(b.code.replace(/^A/i, '')) || 0);
                }
                if (aIsAx) return -1;
                if (bIsAx) return 1;
                return a.name.localeCompare(b.name);
            });

            loaded = true;
            console.log(`[NCCManager] Loaded ${nccNames.length} suppliers from Firebase`);
            return nccNames;
        } catch (error) {
            console.error('[NCCManager] Failed to load NCC names:', error);
            return [];
        }
    }

    // =====================================================
    // PARSE AX CODE
    // =====================================================

    function parseAxCode(name) {
        if (!name) return null;
        const match = name.trim().match(/^(A\d+)/i);
        return match ? match[1].toUpperCase() : null;
    }

    // =====================================================
    // AUTOCOMPLETE SUGGESTIONS
    // =====================================================

    function showSuggestions(inputEl, dropdownEl) {
        if (!inputEl || !dropdownEl) return;

        const value = inputEl.value.trim().toLowerCase();
        exactMatchNCC = null;
        dropdownEl.innerHTML = '';

        if (!value || nccNames.length === 0) {
            dropdownEl.style.display = 'none';
            return;
        }

        // Filter matching NCC names
        const matches = nccNames.filter(ncc =>
            ncc.name.toLowerCase().includes(value)
        );

        // Find exact Ax code match
        const exactMatch = nccNames.find(ncc =>
            ncc.code.toLowerCase() === value
        );
        if (exactMatch) exactMatchNCC = exactMatch;

        // If no matches, show "Create new" option
        if (matches.length === 0) {
            const createItem = document.createElement('div');
            createItem.style.cssText = 'padding: 10px 12px; cursor: pointer; color: #3b82f6; font-size: 13px; display: flex; align-items: center; gap: 6px;';
            createItem.innerHTML = `<span style="font-size: 16px;">+</span> Tạo NCC mới: <strong>${escapeHtml(inputEl.value.trim())}</strong>`;
            createItem.addEventListener('click', async () => {
                dropdownEl.style.display = 'none';
                await handleCreateSupplier(inputEl.value.trim(), inputEl);
            });
            createItem.addEventListener('mouseenter', () => createItem.style.background = '#f0f9ff');
            createItem.addEventListener('mouseleave', () => createItem.style.background = '');
            dropdownEl.appendChild(createItem);
            dropdownEl.style.display = 'block';
            return;
        }

        // Render suggestion items
        matches.slice(0, 15).forEach(ncc => {
            const item = document.createElement('div');
            const isExact = exactMatch && ncc.code === exactMatch.code;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                ${isExact ? 'background: linear-gradient(135deg, #eff6ff, #f0f9ff); border-left: 3px solid #3b82f6;' : ''}
            `;
            item.innerHTML = `
                <span style="
                    font-weight: 700;
                    color: #4f46e5;
                    min-width: 36px;
                    font-size: 12px;
                    background: #eef2ff;
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-align: center;
                ">${escapeHtml(ncc.code)}</span>
                <span style="color: #374151;">${escapeHtml(ncc.name.substring(ncc.code.length))}</span>
                ${isExact ? '<span style="margin-left: auto; font-size: 10px; color: #9ca3af; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">Tab ↹</span>' : ''}
            `;
            item.addEventListener('click', () => {
                inputEl.value = ncc.name;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                dropdownEl.style.display = 'none';
                exactMatchNCC = null;
            });
            item.addEventListener('mouseenter', () => {
                if (!isExact) item.style.background = '#f9fafb';
            });
            item.addEventListener('mouseleave', () => {
                if (!isExact) item.style.background = '';
            });
            dropdownEl.appendChild(item);
        });

        // Add "Create new" at bottom if input doesn't exactly match any NCC
        const inputTrimmed = inputEl.value.trim();
        const hasExactNameMatch = nccNames.some(ncc => ncc.name.toLowerCase() === inputTrimmed.toLowerCase());
        if (!hasExactNameMatch && inputTrimmed.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top: 1px solid #e5e7eb; margin: 4px 0;';
            dropdownEl.appendChild(sep);

            const createItem = document.createElement('div');
            createItem.style.cssText = 'padding: 8px 12px; cursor: pointer; color: #3b82f6; font-size: 13px; display: flex; align-items: center; gap: 6px;';
            createItem.innerHTML = `<span style="font-size: 16px;">+</span> Tạo NCC mới: <strong>${escapeHtml(inputTrimmed)}</strong>`;
            createItem.addEventListener('click', async () => {
                dropdownEl.style.display = 'none';
                await handleCreateSupplier(inputTrimmed, inputEl);
            });
            createItem.addEventListener('mouseenter', () => createItem.style.background = '#f0f9ff');
            createItem.addEventListener('mouseleave', () => createItem.style.background = '');
            dropdownEl.appendChild(createItem);
        }

        dropdownEl.style.display = 'block';
    }

    function hideSuggestions(dropdownEl) {
        if (dropdownEl) dropdownEl.style.display = 'none';
        exactMatchNCC = null;
    }

    function handleTabSelect(inputEl, dropdownEl) {
        if (!exactMatchNCC) return false;
        inputEl.value = exactMatchNCC.name;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        hideSuggestions(dropdownEl);
        return true;
    }

    // =====================================================
    // CREATE NEW SUPPLIER
    // =====================================================

    async function handleCreateSupplier(name, inputEl) {
        if (!name || !name.trim()) return;
        const trimmedName = name.trim();

        const showToast = window.notificationManager?.show?.bind(window.notificationManager)
            || ((msg, type) => console.log(`[NCCManager] ${type}: ${msg}`));

        try {
            // Save to Firebase
            const db = firebase.firestore();
            const axCode = parseAxCode(trimmedName);
            // Ref = text before first space (used as TPOS Partner Ref)
            const spaceIdx = trimmedName.indexOf(' ');
            const ref = spaceIdx > 0 ? trimmedName.substring(0, spaceIdx) : trimmedName;
            const docId = (axCode || ref).toUpperCase().replace(/[\/\\\.#$\[\]]/g, '_').substring(0, 30);

            await db.collection(COLLECTION).doc(docId).set({
                name: trimmedName,
                axCode: axCode || null,
                tposCode: ref
            });

            // Update local cache
            const existing = nccNames.findIndex(n => n.docId === docId);
            const newEntry = { code: axCode || ref, tposCode: ref, docId, name: trimmedName };
            if (existing >= 0) {
                nccNames[existing] = newEntry;
            } else {
                nccNames.push(newEntry);
                nccNames.sort((a, b) => {
                    const aIsAx = /^A\d+$/i.test(a.code);
                    const bIsAx = /^A\d+$/i.test(b.code);
                    if (aIsAx && bIsAx) {
                        return (parseInt(a.code.replace(/^A/i, '')) || 0)
                             - (parseInt(b.code.replace(/^A/i, '')) || 0);
                    }
                    if (aIsAx) return -1;
                    if (bIsAx) return 1;
                    return a.name.localeCompare(b.name);
                });
            }

            console.log(`[NCCManager] Saved NCC "${trimmedName}" to Firebase`);

            // Create Partner on TPOS and save tposId
            try {
                const tposId = await createTPOSPartner(trimmedName);
                if (tposId) {
                    // Update local cache with tposId
                    const cached = nccNames.find(n => n.docId === docId);
                    if (cached) cached.tposId = tposId;
                    showToast(`Đã tạo NCC trên TPOS (ID: ${tposId})`, 'success');
                }
            } catch (err) {
                console.warn('[NCCManager] TPOS Partner creation failed:', err);
            }

            // Auto-fill input
            if (inputEl) {
                inputEl.value = trimmedName;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            showToast(`Đã tạo NCC mới: ${trimmedName}`, 'success');
            return { success: true };
        } catch (error) {
            console.error('[NCCManager] Create supplier failed:', error);
            showToast('Lỗi khi tạo NCC: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async function createTPOSPartner(name) {
        if (!window.TPOSClient?.authenticatedFetch) {
            console.warn('[NCCManager] TPOSClient not available, skipping TPOS Partner creation');
            return null;
        }

        // Ref = text before first space (e.g., "Q1 LONG BÌNH 2" → Ref="Q1")
        const spaceIdx = name.indexOf(' ');
        const ref = spaceIdx > 0 ? name.substring(0, spaceIdx) : name;

        const url = `${PROXY_URL}/api/odata/Partner`;
        const payload = {
            Id: 0,
            Name: name,
            Ref: ref,
            Supplier: true,
            Customer: false,
            Active: true,
            Employee: false,
            IsCompany: false,
            CompanyId: window.ShopConfig ? window.ShopConfig.getConfig().CompanyId : 1,
            Type: 'contact',
            CompanyType: 'person',
            Credit: 0,
            Debit: 0,
            Discount: 0,
            AmountDiscount: 0,
            CreditLimit: 0,
            OverCredit: false,
            CategoryId: 0,
            Status: 'Normal',
            StatusText: 'Bình thường',
            Source: 'Default',
            IsNewAddress: false,
            DateCreated: new Date().toISOString()
        };

        // Step 1: Search if partner already exists on TPOS
        let tposId = null;
        try {
            const searchUrl = `${PROXY_URL}/api/odata/Partner?$filter=Supplier eq true and Ref eq '${encodeURIComponent(ref)}'&$top=1&$select=Id,Name,Ref`;
            const searchResp = await window.TPOSClient.authenticatedFetch(searchUrl);
            if (searchResp.ok) {
                const searchData = await searchResp.json();
                const match = (searchData.value || []).find(p => p.Ref === ref || p.Name === name);
                if (match) {
                    tposId = match.Id;
                    console.log(`[NCCManager] Found existing TPOS Partner: ${match.Name} (Id=${tposId})`);
                }
            }
        } catch (e) {
            console.warn('[NCCManager] TPOS Partner search failed:', e);
        }

        // Step 2: Create if not found
        if (!tposId) {
            const response = await window.TPOSClient.authenticatedFetch(url, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json().catch(() => null);
                tposId = data?.Id || null;
                console.log(`[NCCManager] TPOS Partner created: "${name}" (Ref=${ref}, Id=${tposId})`);
            } else {
                const text = await response.text().catch(() => '');
                console.warn(`[NCCManager] TPOS Partner creation failed ${response.status}:`, text);
            }
        }

        // Update Firebase with tposId
        if (tposId) {
            try {
                const db = firebase.firestore();
                const docId = ref.replace(/[\/\\\.#$\[\]]/g, '_').trim() || name.replace(/[\/\\\\.#$\[\]\s]/g, '_').substring(0, 30);
                await db.collection(COLLECTION).doc(docId).update({
                    tposId,
                    tposCode: ref
                });
                // Reload NCC data so findByName returns updated tposId
                await loadNCCNames();
            } catch (e) {
                console.warn('[NCCManager] Failed to update Firebase with tposId:', e);
            }
        }

        return tposId;
    }

    // =====================================================
    // SYNC SUPPLIERS FROM TPOS → FIREBASE
    // =====================================================

    async function syncFromTPOS() {
        if (!window.TPOSClient?.authenticatedFetch) {
            throw new Error('TPOSClient not available');
        }

        const showToast = window.notificationManager?.show?.bind(window.notificationManager)
            || ((msg, type) => console.log(`[NCCManager] ${type}: ${msg}`));

        try {
            showToast('Đang tải danh sách NCC từ TPOS...', 'info');

            // Step 1: Fetch suppliers from TPOS
            const params = new URLSearchParams({
                '$top': '1000',
                '$orderby': 'Name',
                '$filter': '(Supplier eq true and Active eq true)',
                '$count': 'true'
            });
            const url = `${PROXY_URL}/api/odata/Partner/ODataService.GetView?${params}`;

            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`TPOS API error: ${response.status}`);

            const data = await response.json();
            const suppliers = data.value || [];

            if (suppliers.length === 0) {
                showToast('Không tìm thấy NCC nào từ TPOS', 'warning');
                return { success: false, count: 0 };
            }

            console.log(`[NCCManager] Fetched ${suppliers.length} suppliers from TPOS`);

            // Step 2: Delete existing docs in Firebase (batches of 400)
            const db = firebase.firestore();
            const collRef = db.collection(COLLECTION);
            const existing = await collRef.get();

            if (!existing.empty) {
                const docs = existing.docs;
                for (let i = 0; i < docs.length; i += 400) {
                    const batch = db.batch();
                    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
                console.log(`[NCCManager] Deleted ${docs.length} old docs`);
            }

            // Step 3: Save new suppliers to Firebase (batches of 400)
            const toSave = [];
            for (const s of suppliers) {
                const name = (s.Name || s.name || '').trim();
                const tposCode = s.Ref || s.ref || s.Code || s.code;
                if (!name || !tposCode) continue;

                const docId = String(tposCode).replace(/[\/\\\.#$\[\]]/g, '_').trim();
                if (!docId) continue;

                const axCode = parseAxCode(name);
                // Save all TPOS response fields + our parsed fields
                const data = { ...s, name, axCode: axCode || null, tposCode, tposId: s.Id || s.id || null };
                // Remove undefined values (Firestore doesn't accept them)
                for (const key of Object.keys(data)) {
                    if (data[key] === undefined) delete data[key];
                }
                toSave.push({ docId, data });
            }

            let saved = 0;
            for (let i = 0; i < toSave.length; i += 400) {
                const batch = db.batch();
                toSave.slice(i, i + 400).forEach(item => {
                    batch.set(collRef.doc(item.docId), item.data);
                });
                await batch.commit();
                saved += Math.min(400, toSave.length - i);
            }

            console.log(`[NCCManager] Saved ${saved} suppliers to Firebase`);

            // Step 4: Reload local cache
            await loadNCCNames();

            showToast(`Đã tải ${nccNames.length} NCC từ TPOS`, 'success');
            return { success: true, count: saved };
        } catch (error) {
            console.error('[NCCManager] Sync from TPOS failed:', error);
            showToast('Lỗi tải NCC từ TPOS: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // =====================================================
    // LOOKUP: Find NCC by supplier name
    // =====================================================

    function findByName(supplierName) {
        if (!supplierName) return null;
        const lower = supplierName.trim().toLowerCase();
        // Exact match first
        let found = nccNames.find(n => n.name.toLowerCase() === lower);
        if (found) return found;
        // Ax code match (e.g. user typed "A14")
        const axCode = parseAxCode(supplierName);
        if (axCode) {
            found = nccNames.find(n => n.code === axCode);
        }
        return found || null;
    }

    // Get full Partner document from Firebase (with all TPOS response fields)
    async function getFullPartnerData(docId) {
        if (!docId) return null;
        try {
            const db = firebase.firestore();
            const doc = await db.collection(COLLECTION).doc(docId).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('[NCCManager] Failed to get full partner data:', error);
            return null;
        }
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =====================================================
    // INIT
    // =====================================================

    console.log('[NCCManager] Module loaded');

    return {
        loadNCCNames,
        syncFromTPOS,
        showSuggestions,
        hideSuggestions,
        handleTabSelect,
        createSupplier: handleCreateSupplier,
        parseAxCode,
        findByName,
        getFullPartnerData,
        createPartnerOnTPOS: createTPOSPartner,
        getNccNames: () => nccNames,
        isLoaded: () => loaded
    };
})();
