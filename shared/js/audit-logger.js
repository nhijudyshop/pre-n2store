// =====================================================
// AUDIT LOGGER - Shared Action Logger Service
// File: shared/js/audit-logger.js
// Ghi nhan toan bo thao tac tu moi module vao Firestore
// collection `edit_history` de kiem toan tap trung.
//
// Su dung:
// - IIFE: window.AuditLogger.logAction(actionType, details)
// - ES Module: import { logAction } from '../../shared/js/audit-logger.esm.js'
// =====================================================

window.AuditLogger = (function () {
    'use strict';

    var COLLECTION_NAME = 'edit_history';

    var VALID_ACTION_TYPES = [
        'wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt',
        'customer_info_update', 'wallet_transaction',
        'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
        'ticket_payment', 'ticket_update',
        'transaction_assign', 'livemode_confirm_customer',
        'transaction_approve', 'transaction_adjust',
        'customer_info_update_bh', 'transaction_verify',
        'accountant_entry_create',
        'add', 'edit', 'delete', 'update', 'mark'
    ];

    function isValidActionType(actionType) {
        return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
    }

    function getCurrentUser() {
        try {
            if (window.authManager && typeof window.authManager.getAuthState === 'function') {
                var authState = window.authManager.getAuthState();
                return {
                    userId: authState.userId || authState.uid || '',
                    userName: authState.displayName || authState.email || ''
                };
            }
        } catch (error) {
            console.warn('[AuditLogger] Could not get user info from authManager:', error);
        }
        try {
            var authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            var authData = JSON.parse(authStr);
            if (authData.username || authData.uid) {
                return {
                    userId: authData.username || authData.uid || '',
                    userName: authData.username || ''
                };
            }
        } catch (e) { /* ignore */ }
        return { userId: '', userName: 'Unknown' };
    }

    function getServerTimestamp() {
        try {
            if (window.firebase && window.firebase.firestore &&
                window.firebase.firestore.FieldValue &&
                typeof window.firebase.firestore.FieldValue.serverTimestamp === 'function') {
                return window.firebase.firestore.FieldValue.serverTimestamp();
            }
        } catch (e) {
            console.warn('[AuditLogger] serverTimestamp via FieldValue failed:', e);
        }
        return new Date();
    }

    function getFirestoreDB() {
        try {
            if (typeof window.initializeFirestore === 'function') {
                var db = window.initializeFirestore({ enablePersistence: false });
                if (db) return db;
            }
            if (typeof window.getFirestore === 'function') {
                var db2 = window.getFirestore();
                if (db2) return db2;
            }
            if (window.firebase && typeof window.firebase.firestore === 'function') {
                return window.firebase.firestore();
            }
        } catch (error) {
            console.error('[AuditLogger] Firestore not available:', error);
        }
        return null;
    }

    function ensureFirebaseAuth() {
        return new Promise(function(resolve) {
            try {
                if (!window.firebase || typeof window.firebase.auth !== 'function') {
                    resolve(false); return;
                }
                var auth = window.firebase.auth();
                if (auth.currentUser) { resolve(true); return; }
                auth.signInAnonymously().then(function() {
                    console.log('[AuditLogger] Anonymous auth OK');
                    resolve(true);
                }).catch(function(err) {
                    console.warn('[AuditLogger] Anonymous auth failed:', err.message);
                    resolve(false);
                });
            } catch (e) { resolve(false); }
        });
    }

    function buildRecord(actionType, details, user) {
        var record = {
            timestamp: getServerTimestamp(),
            performerUserId: user.userId,
            performerUserName: user.userName,
            module: details.module,
            actionType: actionType,
            description: details.description || '',
            oldData: details.oldData || null,
            newData: details.newData || null
        };
        var optionalFields = [
            'approverUserId', 'approverUserName',
            'creatorUserId', 'creatorUserName',
            'entityId', 'entityType', 'metadata'
        ];
        for (var i = 0; i < optionalFields.length; i++) {
            var field = optionalFields[i];
            if (details[field] !== undefined && details[field] !== null) {
                record[field] = details[field];
            }
        }
        return record;
    }

    function logAction(actionType, details) {
        console.log('[AuditLogger] logAction called:', actionType, details ? details.module : 'no-details');

        if (!isValidActionType(actionType)) {
            console.warn('[AuditLogger] Invalid actionType:', actionType);
            return;
        }
        if (!details || !details.module) {
            console.warn('[AuditLogger] Missing details.module for actionType:', actionType);
            return;
        }

        try {
            var user = getCurrentUser();
            var record = buildRecord(actionType, details, user);

            ensureFirebaseAuth().then(function(authed) {
                if (!authed) {
                    console.warn('[AuditLogger] No Firebase Auth - trying write anyway');
                }
                var db = getFirestoreDB();
                if (!db) {
                    console.error('[AuditLogger] Firestore DB is null - cannot log action');
                    return;
                }
                db.collection(COLLECTION_NAME).add(record).then(function(docRef) {
                    console.log('[AuditLogger] SUCCESS - doc written:', docRef.id);
                }).catch(function(error) {
                    console.error('[AuditLogger] FAILED to write:', error.code, error.message);
                });
            });
        } catch (error) {
            console.error('[AuditLogger] Error in logAction:', error);
        }
    }

    console.log('[AuditLogger] Module loaded. firebase available:', typeof window.firebase !== 'undefined');

    return {
        logAction: logAction,
        isValidActionType: isValidActionType,
        VALID_ACTION_TYPES: VALID_ACTION_TYPES
    };

})();