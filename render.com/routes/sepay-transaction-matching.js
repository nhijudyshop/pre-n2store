// =====================================================
// SEPAY TRANSACTION MATCHING
// Phone/customer matching, QR code parsing, TPOS search,
// debt processing, pending matches
// =====================================================

const tposTokenManager = require('../services/tpos-token-manager');
const { searchCustomerByPhone } = require('../services/tpos-customer-service');
const { getOrCreateCustomerFromTPOS, getOrCreateCustomerWithAliases } = require('../services/customer-creation-service');
const { processDeposit } = require('../services/wallet-event-processor');
const adminSettingsService = require('../services/admin-settings-service');

// =====================================================
// BLACKLIST: Cac so can bo qua khi extract phone
// Bao gom: so tai khoan ngan hang cua shop, ma giao dich, etc.
// =====================================================
const PHONE_EXTRACTION_BLACKLIST = [
    '75918',    // So tai khoan ACB cua shop
    // Them cac so khac can bo qua o day
];

/**
 * Extract customer identifier from transaction content
 * Priority:
 * 1. QR Code N2 (starts with N2, 18 chars) - if found, skip phone extraction
 * 2. Exact 10-digit phone (0xxxxxxxxx) - direct match, no TPOS needed
 * 3. Partial phone number (>= 5 digits) - will search TPOS to get full phone
 *
 * Returns:
 * {
 *   type: 'qr_code' | 'exact_phone' | 'partial_phone' | 'none',
 *   value: string | null,
 *   uniqueCode: string | null (only for QR),
 *   note: string
 * }
 */
function extractPhoneFromContent(content) {
    if (!content) {
        return {
            type: 'none',
            value: null,
            uniqueCode: null,
            note: 'NO_CONTENT'
        };
    }

    let textToParse = content;
    let isMomo = false; // Track if this is a Momo transaction

    // Step 1: If has "GD", take part before " GD" or "-GD"
    const gdMatch = content.match(/^(.*?)(?:\s*-?\s*GD)/i);
    if (gdMatch) {
        textToParse = gdMatch[1].trim();
        console.log('[EXTRACT] Found GD, parsing before GD:', textToParse);
    }

    // Step 1.5: MOMO PATTERN DETECTION
    // Format: {12-digit-random}-{10-digit-sender-phone}-{customer-content}
    // Example: 113524023776-0396513324-652722
    // We need to extract the LAST part (customer content), not the sender phone
    const momoPattern = /^(\d{12})-(0\d{9})-(.+)$/;
    const momoMatch = textToParse.match(momoPattern);
    if (momoMatch) {
        const momoCode = momoMatch[1];      // 113524023776 (ignore)
        const senderPhone = momoMatch[2];   // 0396513324 (ignore - sender's phone)
        const customerContent = momoMatch[3]; // 652722 (extract this!)

        console.log('[EXTRACT] Detected MOMO pattern:', {
            momoCode,
            senderPhone: senderPhone + ' (ignored)',
            customerContent
        });

        // Mark as Momo transaction
        isMomo = true;

        // Replace textToParse with just the customer content
        textToParse = customerContent.trim();
        console.log('[EXTRACT] Parsing MOMO customer content:', textToParse);
    }

    // Step 1.6: VIETCOMBANK (MBVCB) PATTERN DETECTION
    // Format: MBVCB.{random}.{random}.{phone}.CT tu ...
    // Example: MBVCB.12459068036.249370.228666.CT tu 0141000833447 NGUYEN THI...
    // We need to extract the number before ".CT" (228666)
    // Note: MBVCB = Mobile Banking Vietcombank
    const mbvcbPattern = /MBVCB\.[^.]+\.[^.]+\.(\d{5,10})\.CT/i;
    const mbvcbMatch = textToParse.match(mbvcbPattern);
    if (mbvcbMatch) {
        const customerPhone = mbvcbMatch[1]; // 228666

        console.log('[EXTRACT] Detected Vietcombank (MBVCB) pattern:', {
            fullMatch: mbvcbMatch[0],
            customerPhone
        });

        // Return directly with the extracted phone
        return {
            type: 'partial_phone',
            value: customerPhone,
            uniqueCode: null,
            note: 'VCB:PARTIAL_PHONE_EXTRACTED'
        };
    }

    // Step 2: Check for QR Code N2 (starts with N2, exactly 18 chars)
    const qrCodeMatch = textToParse.match(/\bN2[A-Z0-9]{16}\b/);
    if (qrCodeMatch) {
        const qrCode = qrCodeMatch[0];
        console.log('[EXTRACT] Found QR Code N2:', qrCode);
        return {
            type: 'qr_code',
            value: qrCode,
            uniqueCode: qrCode, // Use QR code as unique code
            note: 'QR_CODE_FOUND'
        };
    }

    // Step 3: Check for EXACT 10-digit phone (0xxxxxxxxx)
    // This avoids unnecessary TPOS API calls when we already have the full phone
    const exactPhonePattern = /\b0\d{9}\b/g;
    const exactPhones = textToParse.match(exactPhonePattern);

    if (exactPhones && exactPhones.length > 0) {
        const exactPhone = exactPhones[exactPhones.length - 1]; // Take last match
        console.log('[EXTRACT] Found EXACT 10-digit phone:', exactPhone);
        const baseNote = exactPhones.length > 1 ? 'MULTIPLE_EXACT_PHONES_FOUND' : 'EXACT_PHONE_EXTRACTED';
        return {
            type: 'exact_phone',
            value: exactPhone,
            uniqueCode: `PHONE${exactPhone}`, // Direct unique code
            note: isMomo ? `MOMO:${baseNote}` : baseNote
        };
    }

    // Step 4: Extract partial phone number (5-10 digits)
    // Will search TPOS to get full 10-digit phone
    // Strategy: Prioritize numbers with phone-like length (5-10 digits), take FIRST match
    // IMPORTANT: Filter out blacklisted numbers (bank account numbers, etc.)
    const partialPhonePattern = /\d{5,}/g;
    const allNumbers = textToParse.match(partialPhonePattern);

    if (allNumbers && allNumbers.length > 0) {
        // Filter numbers:
        // 1. Reasonable phone length (5-10 digits)
        // 2. NOT in blacklist (bank account numbers, etc.)
        const phoneLikeNumbers = allNumbers.filter(num => {
            const isValidLength = num.length >= 5 && num.length <= 10;
            const isBlacklisted = PHONE_EXTRACTION_BLACKLIST.includes(num);
            if (isBlacklisted) {
                console.log('[EXTRACT] Skipping blacklisted number:', num);
            }
            return isValidLength && !isBlacklisted;
        });

        if (phoneLikeNumbers.length > 0) {
            const partialPhone = phoneLikeNumbers[0];  // Take FIRST non-blacklisted phone-like number
            console.log('[EXTRACT] Found partial phone (5-10 digits, first non-blacklisted):', partialPhone, 'from:', allNumbers);
            const baseNote = phoneLikeNumbers.length > 1 ? 'MULTIPLE_NUMBERS_FOUND' : 'PARTIAL_PHONE_EXTRACTED';
            return {
                type: 'partial_phone',
                value: partialPhone,
                uniqueCode: null, // Will be determined after TPOS search
                note: isMomo ? `MOMO:${baseNote}` : baseNote
            };
        }

        // All numbers were blacklisted
        console.log('[EXTRACT] All numbers were blacklisted:', allNumbers);
    }

    console.log('[EXTRACT] No phone or QR found in:', textToParse);
    return {
        type: 'none',
        value: null,
        uniqueCode: null,
        note: isMomo ? 'MOMO:NO_PHONE_FOUND' : 'NO_PHONE_FOUND'
    };
}

/**
 * Search TPOS Partner API by partial phone number
 * Returns grouped unique customers by 10-digit phone
 *
 * @param {string} partialPhone - Partial phone (>= 5 digits)
 * @param {Function} fetchWithTimeout - Fetch function with timeout support
 * @returns {Promise<{
 *   success: boolean,
 *   uniquePhones: Array<{phone: string, customers: Array}>,
 *   totalResults: number
 * }>}
 */
async function searchTPOSByPartialPhone(partialPhone, fetchWithTimeout) {
    try {
        console.log(`[TPOS-SEARCH] Searching for partial phone: ${partialPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${partialPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000); // 15 second timeout for TPOS API

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        console.log(`[TPOS-SEARCH] Found ${totalResults} total results for ${partialPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                uniquePhones: [],
                totalResults: 0
            };
        }

        // Group by unique 10-digit phone
        const phoneMap = new Map();

        for (const customer of data.value) {
            const phone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Only accept valid 10-digit phones starting with 0
            if (phone && phone.length === 10 && phone.startsWith('0')) {
                if (!phoneMap.has(phone)) {
                    phoneMap.set(phone, []);
                }
                phoneMap.get(phone).push({
                    id: customer.Id,
                    name: customer.Name || customer.DisplayName,
                    phone: phone,
                    email: customer.Email,
                    address: customer.FullAddress || customer.Street,
                    network: customer.NameNetwork,
                    status: customer.Status,
                    credit: customer.Credit,
                    debit: customer.Debit
                });
            }
        }

        // Convert map to array
        const allUniquePhones = Array.from(phoneMap.entries()).map(([phone, customers]) => ({
            phone,
            customers, // Array of customers with this phone (sorted by DateCreated desc from TPOS)
            count: customers.length
        }));

        console.log(`[TPOS-SEARCH] Grouped into ${allUniquePhones.length} unique phones (before filter):`);
        allUniquePhones.forEach(({ phone, count }) => {
            console.log(`  - ${phone}: ${count} customer(s)`);
        });

        // FILTER: Chi giu SDT co so cuoi KHOP CHINH XAC voi partialPhone
        // VD: partialPhone="81118" -> giu 0938281118 (endsWith 81118), loai 0938811182
        const uniquePhones = allUniquePhones.filter(({ phone }) => {
            const matches = phone.endsWith(partialPhone);
            if (!matches) {
                console.log(`[TPOS-SEARCH] Filtered out ${phone} (does not end with ${partialPhone})`);
            }
            return matches;
        });

        console.log(`[TPOS-SEARCH] After endsWith filter: ${uniquePhones.length} phones match:`);
        uniquePhones.forEach(({ phone, count }) => {
            console.log(`  ${phone}: ${count} customer(s)`);
        });

        return {
            success: true,
            uniquePhones,
            totalResults
        };

    } catch (error) {
        console.error('[TPOS-SEARCH] Error:', error);
        return {
            success: false,
            error: error.message,
            uniquePhones: [],
            totalResults: 0
        };
    }
}

/**
 * Search TPOS Partner API by FULL phone number (10 digits)
 * Returns customer info without endsWith filtering
 * Used for QR code customer name lookup
 *
 * @param {string} fullPhone - Full 10-digit phone (0xxxxxxxxx)
 * @param {Function} fetchWithTimeout - Fetch function with timeout support
 * @returns {Promise<{success: boolean, customer: Object|null}>}
 */
async function searchTPOSByPhone(fullPhone, fetchWithTimeout) {
    try {
        console.log(`[TPOS-PHONE] Searching for full phone: ${fullPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API with full phone
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${fullPhone}&$top=10&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithTimeout(tposUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, 15000);

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        console.log(`[TPOS-PHONE] Found ${totalResults} total results for ${fullPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customer: null,
                totalResults: 0
            };
        }

        // Find EXACT match with full phone (no endsWith filter)
        for (const customer of data.value) {
            const phone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Check for exact match
            if (phone === fullPhone) {
                console.log(`[TPOS-PHONE] Found exact match: ${customer.Name || customer.DisplayName}`);
                return {
                    success: true,
                    customer: {
                        id: customer.Id,
                        name: customer.Name || customer.DisplayName,
                        phone: phone,
                        email: customer.Email,
                        address: customer.FullAddress || customer.Street,
                        network: customer.NameNetwork,
                        status: customer.Status,
                        credit: customer.Credit,
                        debit: customer.Debit
                    },
                    totalResults
                };
            }
        }

        // No exact match found
        console.log(`[TPOS-PHONE] No exact match for ${fullPhone}`);
        return {
            success: true,
            customer: null,
            totalResults
        };

    } catch (error) {
        console.error('[TPOS-PHONE] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null,
            totalResults: 0
        };
    }
}

/**
 * Process debt update for a single transaction
 * @param {Object} db - Database connection
 * @param {number} transactionId - The ID of the transaction in balance_history
 * @param {Function} fetchWithTimeout - Fetch function with timeout support
 */
async function processDebtUpdate(db, transactionId, fetchWithTimeout) {
    console.log('[DEBT-UPDATE] Processing transaction ID:', transactionId);

    // 1. Get transaction details
    const txResult = await db.query(
        `SELECT id, content, transfer_amount, transfer_type, debt_added
         FROM balance_history
         WHERE id = $1`,
        [transactionId]
    );

    if (txResult.rows.length === 0) {
        console.log('[DEBT-UPDATE] Transaction not found:', transactionId);
        return { success: false, reason: 'Transaction not found' };
    }

    const tx = txResult.rows[0];

    // 2. Check if already processed
    if (tx.debt_added === true) {
        console.log('[DEBT-UPDATE] Transaction already processed:', transactionId);
        return { success: false, reason: 'Already processed' };
    }

    // 3. Only process 'in' transactions
    if (tx.transfer_type !== 'in') {
        console.log('[DEBT-UPDATE] Not an incoming transaction:', transactionId);
        return { success: false, reason: 'Not incoming transaction' };
    }

    const content = tx.content || '';

    // 3.5. Check auto-approve setting (cached, 1-minute TTL)
    const autoApproveEnabled = await adminSettingsService.isAutoApproveEnabled(db);
    console.log('[DEBT-UPDATE] Auto-approve setting:', autoApproveEnabled ? 'ENABLED' : 'DISABLED');

    // 4. FIRST: Try to extract QR code (N2 + 16 alphanumeric)
    const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);

    if (qrMatch) {
        const qrCode = qrMatch[0];
        console.log('[DEBT-UPDATE] QR code found:', qrCode);

        // 5. Find phone number from balance_customer_info (case-insensitive)
        const infoResult = await db.query(
            `SELECT customer_phone, customer_name FROM balance_customer_info
             WHERE UPPER(unique_code) = $1`,
            [qrCode]
        );

        if (infoResult.rows.length > 0 && infoResult.rows[0].customer_phone) {
            const phone = infoResult.rows[0].customer_phone;
            let customerName = infoResult.rows[0].customer_name;
            const amount = parseInt(tx.transfer_amount) || 0;

            console.log('[DEBT-UPDATE] Phone from QR:', phone, 'Amount:', amount);

            // 5.5 NEW: If QR has phone but NO name, fetch from TPOS using full phone
            if (!customerName) {
                console.log('[DEBT-UPDATE] QR has phone but no name, fetching from TPOS...');

                try {
                    // Use new searchTPOSByPhone for full phone lookup
                    const tposResult = await searchTPOSByPhone(phone, fetchWithTimeout);

                    if (tposResult.success && tposResult.customer) {
                        customerName = tposResult.customer.name;
                        console.log('[DEBT-UPDATE] Fetched customer name from TPOS:', customerName);
                    } else {
                        console.log('[DEBT-UPDATE] No TPOS match for phone:', phone);
                    }
                } catch (error) {
                    console.error('[DEBT-UPDATE] Error fetching name from TPOS:', error.message);
                    // Continue processing - phone is enough for debt tracking
                }
            }

            // 6. NEW: Create/Update customer with TPOS data + process wallet realtime
            let customerId = null;
            let tposData = null;
            let walletProcessedSuccess = false; // Track if wallet was actually credited

            try {
                // Fetch full TPOS data for customer creation
                const tposResult = await searchCustomerByPhone(phone);
                if (tposResult.success && tposResult.customer) {
                    tposData = tposResult.customer;
                    customerName = tposData.name || customerName;
                }

                // Create or update customer with full TPOS data
                const customerResult = await getOrCreateCustomerFromTPOS(db, phone, tposData);
                customerId = customerResult.customerId;
                console.log(`[DEBT-UPDATE] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}`);

                // Process wallet deposit immediately ONLY if auto-approve is enabled
                if (autoApproveEnabled && amount > 0) {
                    try {
                        const walletResult = await processDeposit(
                            db,
                            phone,
                            amount,
                            transactionId,
                            `Nap tu CK (QR: ${qrCode})`,
                            customerId
                        );
                        console.log(`[DEBT-UPDATE] Wallet updated: TX ${walletResult.transactionId}`);
                        walletProcessedSuccess = true; // Only set true on SUCCESS
                    } catch (walletErr) {
                        console.error('[DEBT-UPDATE] Wallet update failed (will retry via cron):', walletErr.message);
                        walletProcessedSuccess = false; // Ensure false on failure
                    }
                } else if (!autoApproveEnabled) {
                    console.log('[DEBT-UPDATE] Auto-approve DISABLED - wallet deposit pending accountant approval');
                }
            } catch (err) {
                console.error('[DEBT-UPDATE] Customer/Wallet creation failed:', err.message);
                // Continue - we can still link the phone, cron will retry wallet
            }

            // 7. Mark transaction as processed AND link to customer phone + customer_id
            // QR code match: AUTO_APPROVED if setting enabled, else PENDING_VERIFICATION
            // CRITICAL: wallet_processed = TRUE ONLY if processDeposit actually succeeded
            const verificationStatus = autoApproveEnabled ? 'AUTO_APPROVED' : 'PENDING_VERIFICATION';
            await db.query(
                `UPDATE balance_history
                 SET debt_added = TRUE,
                     linked_customer_phone = $2,
                     customer_id = COALESCE($3, customer_id),
                     wallet_processed = $4,
                     verification_status = $5::text,
                     match_method = 'qr_code',
                     display_name = COALESCE(display_name, $6),
                     verified_at = CASE WHEN $5::text = 'AUTO_APPROVED' THEN (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') ELSE NULL END
                 WHERE id = $1 AND linked_customer_phone IS NULL`,
                [transactionId, phone, customerId, walletProcessedSuccess, verificationStatus, customerName]
            );

            console.log('[DEBT-UPDATE] Success (QR method):', {
                transactionId,
                qrCode,
                phone,
                linkedPhone: phone,
                customerId,
                customerName,
                amount
            });

            return {
                success: true,
                method: 'qr_code',
                transactionId,
                qrCode,
                phone,
                customerId,
                customerName,
                amount,
                walletProcessed: amount > 0
            };
        }
    }

    // 8. FALLBACK: No QR code or QR not linked to phone -> Try to extract partial phone from content
    console.log('[DEBT-UPDATE] No QR code linked to phone, trying extraction...');

    const extractResult = extractPhoneFromContent(content);

    console.log('[DEBT-UPDATE] Extract result:', extractResult);

    // Check extraction result
    if (extractResult.type === 'none') {
        console.log('[DEBT-UPDATE] No valid identifier found:', extractResult.note);
        return {
            success: false,
            reason: 'No valid identifier found',
            note: extractResult.note
        };
    }

    const amount = parseInt(tx.transfer_amount) || 0;

    // 9. Handle exact 10-digit phone
    if (extractResult.type === 'exact_phone') {
        const exactPhone = extractResult.value;
        const uniqueCode = extractResult.uniqueCode; // Already PHONE{phone}

        console.log('[DEBT-UPDATE] Exact 10-digit phone found:', exactPhone);

        // OPTIMIZATION: Check local DB first before calling TPOS
        let customerName = null;
        let dataSource = 'NEW';

        // Step 1: Search in local balance_customer_info
        const localResult = await db.query(
            `SELECT customer_name, customer_phone FROM balance_customer_info
             WHERE customer_phone = $1 AND customer_name IS NOT NULL AND customer_name != ''
             ORDER BY updated_at DESC LIMIT 1`,
            [exactPhone]
        );

        if (localResult.rows.length > 0) {
            // Found in local DB - use it, skip TPOS!
            customerName = localResult.rows[0].customer_name;
            dataSource = 'LOCAL_DB';
            console.log('[DEBT-UPDATE] Found customer in LOCAL DB (skipping TPOS):', customerName);
        } else {
            // Step 2: Not in local DB - try TPOS
            console.log('[DEBT-UPDATE] Not found in local DB, searching TPOS...');
            try {
                const tposResult = await searchTPOSByPartialPhone(exactPhone, fetchWithTimeout);

                if (tposResult.success && tposResult.uniquePhones.length > 0) {
                    const phoneData = tposResult.uniquePhones.find(p => p.phone === exactPhone);
                    if (phoneData && phoneData.customers.length > 0) {
                        customerName = phoneData.customers[0].name;
                        dataSource = 'TPOS';
                        console.log('[DEBT-UPDATE] Found customer name from TPOS:', customerName);
                    }
                }
            } catch (error) {
                console.error('[DEBT-UPDATE] Error fetching from TPOS:', error.message);
            }
        }

        // NEW: Create/Update customer with TPOS data + collect ALL names (aliases)
        let customerId = null;
        let allNames = [];
        let walletProcessedSuccess = false; // Track if wallet was actually credited

        try {
            // Use getOrCreateCustomerWithAliases to collect ALL names from TPOS
            const customerResult = await getOrCreateCustomerWithAliases(db, exactPhone, null);
            customerId = customerResult.customerId;
            customerName = customerResult.customerName || customerName;
            allNames = customerResult.allNames || [];
            console.log(`[DEBT-UPDATE] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}, aliases: ${allNames.length}`);

            // Process wallet deposit immediately ONLY if auto-approve is enabled
            if (autoApproveEnabled && amount > 0) {
                try {
                    const walletResult = await processDeposit(
                        db,
                        exactPhone,
                        amount,
                        transactionId,
                        `Nap tu CK (Phone: ${exactPhone})`,
                        customerId
                    );
                    console.log(`[DEBT-UPDATE] Wallet updated: TX ${walletResult.transactionId}`);
                    walletProcessedSuccess = true; // Only set true on SUCCESS
                } catch (walletErr) {
                    console.error('[DEBT-UPDATE] Wallet update failed (will retry via cron):', walletErr.message);
                    walletProcessedSuccess = false; // Ensure false on failure
                }
            } else if (!autoApproveEnabled) {
                console.log('[DEBT-UPDATE] Auto-approve DISABLED - wallet deposit pending accountant approval');
            }
        } catch (err) {
            console.error('[DEBT-UPDATE] Customer/Wallet creation failed:', err.message);
            // Continue - we can still link the phone, cron will retry wallet
        }

        // Mark transaction as processed AND link to customer phone + customer_id
        // Exact 10-digit phone: AUTO_APPROVED if setting enabled, else PENDING_VERIFICATION
        // CRITICAL: wallet_processed = TRUE ONLY if processDeposit actually succeeded
        const verificationStatusExact = autoApproveEnabled ? 'AUTO_APPROVED' : 'PENDING_VERIFICATION';
        await db.query(
            `UPDATE balance_history
             SET debt_added = TRUE,
                 linked_customer_phone = $2,
                 customer_id = COALESCE($3, customer_id),
                 wallet_processed = $4,
                 verification_status = $5::text,
                 match_method = 'exact_phone',
                 display_name = COALESCE(display_name, $6),
                 verified_at = CASE WHEN $5::text = 'AUTO_APPROVED' THEN (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') ELSE NULL END
             WHERE id = $1 AND linked_customer_phone IS NULL`,
            [transactionId, exactPhone, customerId, walletProcessedSuccess, verificationStatusExact, customerName]
        );

        console.log('[DEBT-UPDATE] Success (exact phone method):', {
            transactionId,
            exactPhone,
            linkedPhone: exactPhone,
            customerId,
            customerName,
            dataSource,
            amount
        });

        return {
            success: true,
            method: 'exact_phone',
            transactionId,
            fullPhone: exactPhone,
            linkedPhone: exactPhone,
            customerId,
            customerName,
            dataSource,
            amount,
            walletProcessed: amount > 0
        };
    }

    // 10. Search with partial phone - LOCAL DB FIRST, then TPOS
    if (extractResult.type === 'partial_phone') {
        const partialPhone = extractResult.value;
        console.log('[DEBT-UPDATE] Partial phone found:', partialPhone);

        // OPTIMIZATION: Step 1 - Search LOCAL DB first
        const localResult = await db.query(
            `SELECT DISTINCT customer_phone, customer_name FROM balance_customer_info
             WHERE customer_phone LIKE $1
             AND customer_name IS NOT NULL AND customer_name != ''
             ORDER BY customer_phone`,
            [`%${partialPhone}`]
        );

        let matchedPhones = [];
        let dataSource = 'LOCAL_DB';

        if (localResult.rows.length > 0) {
            console.log(`[DEBT-UPDATE] Found ${localResult.rows.length} matches in LOCAL DB (skipping TPOS)`);
            matchedPhones = localResult.rows.map((row, index) => ({
                phone: row.customer_phone,
                // Use phone as ID when from LOCAL_DB (prefix with LOCAL_ to distinguish)
                customers: [{ name: row.customer_name, id: `LOCAL_${row.customer_phone}`, phone: row.customer_phone }],
                count: 1
            }));
        } else {
            // Step 2: Not in local DB - try TPOS
            console.log('[DEBT-UPDATE] Not found in local DB, searching TPOS...');
            dataSource = 'TPOS';

            const tposResult = await searchTPOSByPartialPhone(partialPhone, fetchWithTimeout);

            if (tposResult.success && tposResult.uniquePhones.length > 0) {
                matchedPhones = tposResult.uniquePhones;
                console.log(`[DEBT-UPDATE] Found ${matchedPhones.length} matches from TPOS`);
            }
        }

        // No matches found anywhere
        if (matchedPhones.length === 0) {
            console.log('[DEBT-UPDATE] No customers found for:', partialPhone);

            return {
                success: false,
                reason: 'No matches found',
                partialPhone,
                note: 'NOT_FOUND'
            };
        }

        // Single match - auto link
        if (matchedPhones.length === 1) {
            const phoneData = matchedPhones[0];
            const fullPhone = phoneData.phone;
            const firstCustomer = phoneData.customers[0];

            console.log(`[DEBT-UPDATE] Single phone found: ${fullPhone} from ${dataSource}`);
            console.log(`[DEBT-UPDATE] Auto-selecting: ${firstCustomer.name}`);

            const uniqueCode = `PHONE${fullPhone}`;

            // NEW: Create/Update customer with TPOS data + process wallet realtime
            let customerId = null;
            let customerName = firstCustomer.name;
            let walletProcessedSuccess = false; // Track if wallet deposit actually succeeded
            let allNames = [];

            try {
                // Use getOrCreateCustomerWithAliases to collect ALL names from TPOS
                const customerResult = await getOrCreateCustomerWithAliases(db, fullPhone, null);
                customerId = customerResult.customerId;
                customerName = customerResult.customerName || customerName;
                allNames = customerResult.allNames || [];
                console.log(`[DEBT-UPDATE] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}, aliases: ${allNames.length}`);

                // Process wallet deposit immediately ONLY if auto-approve is enabled
                if (autoApproveEnabled && amount > 0) {
                    try {
                        const walletResult = await processDeposit(
                            db,
                            fullPhone,
                            amount,
                            transactionId,
                            `Nap tu CK (Auto-matched: ${partialPhone})`,
                            customerId
                        );
                        console.log(`[DEBT-UPDATE] Wallet updated: TX ${walletResult.transactionId}`);
                        walletProcessedSuccess = true; // Only set TRUE on success
                    } catch (walletErr) {
                        console.error('[DEBT-UPDATE] Wallet update failed (will retry via cron):', walletErr.message);
                        walletProcessedSuccess = false; // Ensure FALSE on failure
                    }
                } else if (!autoApproveEnabled) {
                    console.log('[DEBT-UPDATE] Auto-approve DISABLED - wallet deposit pending accountant approval');
                }
            } catch (err) {
                console.error('[DEBT-UPDATE] Customer/Wallet creation failed:', err.message);
            }

            // Update balance_history with customer_id
            // Single match: AUTO_APPROVED if setting enabled, else PENDING_VERIFICATION
            // CRITICAL: wallet_processed = walletProcessedSuccess (only TRUE if processDeposit succeeded)
            const verificationStatusSingle = autoApproveEnabled ? 'AUTO_APPROVED' : 'PENDING_VERIFICATION';
            const updateResult = await db.query(
                `UPDATE balance_history
                 SET debt_added = TRUE,
                     linked_customer_phone = $2,
                     customer_id = COALESCE($3, customer_id),
                     wallet_processed = $4,
                     verification_status = $5::text,
                     match_method = 'single_match',
                     display_name = COALESCE(display_name, $6),
                     verified_at = CASE WHEN $5::text = 'AUTO_APPROVED' THEN (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') ELSE NULL END
                 WHERE id = $1 AND linked_customer_phone IS NULL`,
                [transactionId, fullPhone, customerId, walletProcessedSuccess, verificationStatusSingle, customerName]
            );

            if (updateResult.rowCount === 0) {
                // Giao dich co the da co linked_customer_phone, thu update bang cach khac
                console.log('[DEBT-UPDATE] No rows updated (may already have linked_customer_phone), trying force update...');
                await db.query(
                    `UPDATE balance_history
                     SET debt_added = TRUE,
                         linked_customer_phone = $2,
                         customer_id = COALESCE($3, customer_id),
                         wallet_processed = $4,
                         verification_status = $5::text,
                         match_method = 'single_match',
                         display_name = COALESCE(display_name, $6),
                         verified_at = CASE WHEN $5::text = 'AUTO_APPROVED' THEN (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') ELSE NULL END
                     WHERE id = $1`,
                    [transactionId, fullPhone, customerId, walletProcessedSuccess, verificationStatusSingle, customerName]
                );
                console.log('[DEBT-UPDATE] Force updated balance_history');
            } else {
                console.log('[DEBT-UPDATE] Updated balance_history:', updateResult.rowCount, 'row(s)');
            }

            console.log('[DEBT-UPDATE] Success (auto-matched):', {
                transactionId,
                partialPhone,
                fullPhone,
                linkedPhone: fullPhone,
                customerId,
                customerName,
                dataSource,
                amount
            });

            return {
                success: true,
                method: 'single_match',
                transactionId,
                partialPhone,
                fullPhone,
                linkedPhone: fullPhone,
                customerId,
                customerName,
                dataSource,
                amount,
                walletProcessed: walletProcessedSuccess
            };

        } else {
            // MULTIPLE PHONES: Create pending match for admin to choose
            // Set verification_status = PENDING_VERIFICATION (needs accountant approval)
            console.log(`[DEBT-UPDATE] Multiple phones found (${matchedPhones.length}) from ${dataSource}, creating pending match...`);

            // Format matched_customers JSONB
            const matchedCustomersJson = matchedPhones.map(phoneData => ({
                phone: phoneData.phone,
                count: phoneData.count || 1,
                customers: phoneData.customers
            }));

            // Create pending match
            await db.query(
                `INSERT INTO pending_customer_matches (transaction_id, extracted_phone, matched_customers, status)
                 VALUES ($1, $2, $3, $4)`,
                [
                    transactionId,
                    partialPhone,
                    JSON.stringify(matchedCustomersJson),
                    'pending'
                ]
            );

            // Update balance_history with PENDING_VERIFICATION status
            await db.query(
                `UPDATE balance_history
                 SET verification_status = 'PENDING_VERIFICATION',
                     match_method = 'pending_match'
                 WHERE id = $1`,
                [transactionId]
            );

            console.log('[DEBT-UPDATE] Created pending match for transaction:', transactionId);
            console.log(`[DEBT-UPDATE] Found ${matchedPhones.length} unique phones from ${dataSource}:`);
            matchedPhones.forEach(({ phone, count }) => {
                console.log(`  - ${phone}: ${count || 1} customer(s)`);
            });

            return {
                success: true,
                method: 'pending_match_created',
                transactionId,
                partialPhone,
                uniquePhonesCount: matchedPhones.length,
                dataSource,
                pendingMatch: true,
                verificationStatus: 'PENDING_VERIFICATION'
            };
        }
    }

    // Should not reach here
    console.error('[DEBT-UPDATE] Unexpected extraction type:', extractResult.type);
    return {
        success: false,
        reason: 'Unexpected extraction type',
        type: extractResult.type
    };

}

/**
 * Register transaction matching routes on the given router
 * @param {express.Router} router - Express router instance
 * @param {Object} helpers - Shared helper functions { fetchWithTimeout, upsertRecentTransfer }
 */
function registerRoutes(router, helpers) {
    const { fetchWithTimeout, upsertRecentTransfer } = helpers;

    // =====================================================
    // DEBT SUMMARY ENDPOINTS
    // =====================================================

    /**
     * GET /api/sepay/debt-summary
     * Get total debt for a phone number
     */
    router.get('/debt-summary', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phone } = req.query;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: phone'
            });
        }

        try {
            // Normalize phone to full 10-digit format (0xxxxxxxxx)
            let normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = normalizedPhone.substring(2); // Remove country code 84
            }
            if (!normalizedPhone.startsWith('0') && normalizedPhone.length === 9) {
                normalizedPhone = '0' + normalizedPhone; // Add leading 0
            }

            console.log('[DEBT-SUMMARY] Fetching for phone:', phone, '-> normalized:', normalizedPhone);

            // NEW SIMPLE LOGIC: Query directly by linked_customer_phone
            const txQuery = `
                SELECT
                    id,
                    transfer_amount,
                    transaction_date,
                    content,
                    debt_added,
                    linked_customer_phone
                FROM balance_history
                WHERE transfer_type = 'in'
                  AND linked_customer_phone = $1
                ORDER BY transaction_date DESC
                LIMIT 100
            `;

            console.log('[DEBT-SUMMARY] Query by linked_customer_phone:', normalizedPhone);

            const txResult = await db.query(txQuery, [normalizedPhone]);
            const transactions = txResult.rows;

            // Calculate total debt
            const totalDebt = transactions.reduce((sum, t) => sum + (parseInt(t.transfer_amount) || 0), 0);
            const source = transactions.length > 0 ? 'balance_history' : 'no_data';

            console.log('[DEBT-SUMMARY] Found', transactions.length, 'transactions, total:', totalDebt);

            res.json({
                success: true,
                data: {
                    phone,
                    total_debt: totalDebt,
                    transactions: transactions.map(t => ({
                        id: t.id,
                        amount: parseInt(t.transfer_amount) || 0,
                        date: t.transaction_date,
                        content: t.content,
                        debt_added: t.debt_added
                    })),
                    transaction_count: transactions.length,
                    source
                }
            });

        } catch (error) {
            console.error('[DEBT-SUMMARY] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch debt summary',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/debt-summary-batch
     * Get total debt for multiple phone numbers in ONE request
     */
    router.post('/debt-summary-batch', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phones } = req.body;

        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: phones (array)'
            });
        }

        // Limit to 200 phones per request
        if (phones.length > 200) {
            return res.status(400).json({
                success: false,
                error: 'Too many phones. Maximum 200 per request.'
            });
        }

        try {
            const results = {};

            // Normalize all phones to full 10-digit format (0xxxxxxxxx)
            const normalizedPhones = phones.map(phone => {
                let normalized = (phone || '').replace(/\D/g, '');
                if (normalized.startsWith('84') && normalized.length > 9) {
                    normalized = normalized.substring(2);
                }
                if (!normalized.startsWith('0') && normalized.length === 9) {
                    normalized = '0' + normalized; // Add leading 0
                }
                return normalized;
            }).filter(p => p.length === 10);

            const uniquePhones = [...new Set(normalizedPhones)];

            if (uniquePhones.length === 0) {
                return res.json({ success: true, data: {} });
            }

            // NEW SIMPLE LOGIC: Query directly by linked_customer_phone
            const phonePlaceholders = uniquePhones.map((_, i) => `$${i + 1}`).join(', ');
            const txQuery = `
                SELECT
                    linked_customer_phone,
                    SUM(transfer_amount) as total_amount,
                    COUNT(*) as transaction_count
                FROM balance_history
                WHERE transfer_type = 'in'
                  AND linked_customer_phone IN (${phonePlaceholders})
                GROUP BY linked_customer_phone
            `;

            const txResult = await db.query(txQuery, uniquePhones);

            // Build result map from query
            const debtMap = {};
            txResult.rows.forEach(row => {
                if (row.linked_customer_phone) {
                    debtMap[row.linked_customer_phone] = {
                        total_debt: parseInt(row.total_amount) || 0,
                        transaction_count: parseInt(row.transaction_count) || 0
                    };
                }
            });

            // Build results for all phones (including those with 0 debt)
            for (const phone of uniquePhones) {
                const data = debtMap[phone];
                // Also check without leading 0 for backwards compatibility
                const phoneWithout0 = phone.startsWith('0') ? phone.substring(1) : phone;

                results[phoneWithout0] = {
                    total_debt: data ? data.total_debt : 0,
                    source: data && data.total_debt > 0 ? 'balance_history' : 'no_data'
                };
            }

            // Log summary (not individual phones to reduce noise)
            console.log(`[DEBT-SUMMARY-BATCH] Processed ${uniquePhones.length} phones, found debt for ${txResult.rows.length}`);

            res.json({
                success: true,
                data: results,
                count: Object.keys(results).length
            });

        } catch (error) {
            console.error('[DEBT-SUMMARY-BATCH] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch debt summary batch',
                message: error.message
            });
        }
    });

    /**
     * GET /api/sepay/debt/:phone
     * Get debt for a specific phone number
     */
    router.get('/debt/:phone', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { phone } = req.params;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        try {
            // Normalize phone to full 10-digit format (0xxxxxxxxx)
            let normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = normalizedPhone.substring(2); // Remove country code 84
            }
            if (!normalizedPhone.startsWith('0') && normalizedPhone.length === 9) {
                normalizedPhone = '0' + normalizedPhone; // Add leading 0
            }

            console.log(`[DEBT] Fetching debt for phone: ${phone} -> normalized: ${normalizedPhone}`);

            // Query debt from balance_history by linked_customer_phone
            const query = `
                SELECT
                    COUNT(*) as transaction_count,
                    COALESCE(SUM(transfer_amount), 0) as total_debt
                FROM balance_history
                WHERE transfer_type = 'in'
                  AND linked_customer_phone = $1
            `;

            const result = await db.query(query, [normalizedPhone]);
            const row = result.rows[0];

            const debt = parseFloat(row.total_debt) || 0;
            const transactionCount = parseInt(row.transaction_count) || 0;

            console.log(`[DEBT] Phone ${normalizedPhone}: ${debt} VND (${transactionCount} transactions)`);

            res.json({
                success: true,
                phone: normalizedPhone,
                debt: debt,
                transaction_count: transactionCount
            });

        } catch (error) {
            console.error('[DEBT] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch debt',
                message: error.message
            });
        }
    });

    // =====================================================
    // PENDING CUSTOMER MATCHES ENDPOINTS
    // =====================================================

    /**
     * GET /api/sepay/pending-matches
     * Get all pending customer matches
     */
    router.get('/pending-matches', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { status = 'pending', limit = 50 } = req.query;

        try {
            const limitCount = Math.min(parseInt(limit) || 50, 200);

            const query = `
                SELECT
                    pcm.id,
                    pcm.transaction_id,
                    pcm.extracted_phone,
                    pcm.matched_customers,
                    pcm.selected_customer_id,
                    pcm.status,
                    pcm.resolution_notes,
                    pcm.created_at,
                    pcm.resolved_at,
                    pcm.resolved_by,
                    bh.content as transaction_content,
                    bh.transfer_amount,
                    bh.transaction_date,
                    bh.gateway
                FROM pending_customer_matches pcm
                INNER JOIN balance_history bh ON pcm.transaction_id = bh.id
                WHERE pcm.status = $1
                ORDER BY pcm.created_at DESC
                LIMIT $2
            `;

            const result = await db.query(query, [status, limitCount]);

            console.log('[PENDING-MATCHES] Found', result.rows.length, 'matches with status:', status);

            res.json({
                success: true,
                data: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            console.error('[PENDING-MATCHES] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch pending matches',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/pending-matches/:id/resolve
     * Resolve a pending match by selecting a customer
     */
    router.post('/pending-matches/:id/resolve', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { customer_id, resolved_by = 'admin', staff_note } = req.body;

        if (!customer_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: customer_id'
            });
        }

        try {
            // 1. Get pending match details
            const matchResult = await db.query(
                `SELECT
                    pcm.transaction_id,
                    pcm.extracted_phone,
                    pcm.matched_customers,
                    bh.transfer_amount,
                    bh.content
                 FROM pending_customer_matches pcm
                 INNER JOIN balance_history bh ON pcm.transaction_id = bh.id
                 WHERE pcm.id = $1 AND pcm.status = 'pending'`,
                [id]
            );

            if (matchResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Pending match not found or already resolved'
                });
            }

            const match = matchResult.rows[0];

            // 2. Parse matched_customers (handle both string and object)
            let matchedCustomers = match.matched_customers;
            if (typeof matchedCustomers === 'string') {
                try {
                    matchedCustomers = JSON.parse(matchedCustomers);
                } catch (parseErr) {
                    console.error('[RESOLVE-MATCH] Failed to parse matched_customers:', parseErr);
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid matched_customers data format'
                    });
                }
            }

            // Validate matchedCustomers is an array
            if (!Array.isArray(matchedCustomers)) {
                console.error('[RESOLVE-MATCH] matched_customers is not an array:', typeof matchedCustomers);
                return res.status(400).json({
                    success: false,
                    error: 'matched_customers is not an array',
                    debug_type: typeof matchedCustomers
                });
            }

            console.log('[RESOLVE-MATCH] Looking for customer_id:', customer_id, 'in', matchedCustomers.length, 'phone groups');

            // 3. Find customer in nested structure
            let selectedCustomer = null;
            const targetIdStr = String(customer_id);
            const targetIdInt = parseInt(customer_id);

            // Check if customer_id is a LOCAL_xxx format
            const isLocalId = targetIdStr.startsWith('LOCAL_');
            const localPhone = isLocalId ? targetIdStr.replace('LOCAL_', '') : null;

            for (const phoneGroup of matchedCustomers) {
                const customers = phoneGroup.customers || [];
                if (!Array.isArray(customers)) continue;

                for (const c of customers) {
                    if (isLocalId) {
                        if (c.phone === localPhone || (c.id === null && phoneGroup.phone === localPhone)) {
                            selectedCustomer = c;
                            console.log('[RESOLVE-MATCH] Found customer by LOCAL phone:', c.name, c.phone);
                            break;
                        }
                    } else {
                        if (String(c.id) === targetIdStr || c.id === targetIdInt) {
                            selectedCustomer = c;
                            console.log('[RESOLVE-MATCH] Found customer by ID:', c.name, c.phone);
                            break;
                        }
                    }
                }
                if (selectedCustomer) break;
            }

            if (!selectedCustomer) {
                // Collect all customer IDs for debugging
                const allCustomerIds = [];
                for (const pg of matchedCustomers) {
                    if (pg.customers && Array.isArray(pg.customers)) {
                        for (const c of pg.customers) {
                            allCustomerIds.push({ id: c.id, name: c.name, phone: c.phone });
                        }
                    }
                }
                console.error('[RESOLVE-MATCH] Customer not found. Target:', customer_id, 'Available:', allCustomerIds);
                return res.status(400).json({
                    success: false,
                    error: 'Selected customer not in matched list',
                    requested_id: customer_id,
                    available_customers: allCustomerIds
                });
            }

            console.log('[RESOLVE-MATCH] Resolving match', id, 'with customer:', selectedCustomer.phone);

            // 3. Create/update customer with TPOS data
            let customerId = null;
            let customerName = selectedCustomer.name;
            try {
                let tposData = null;
                try {
                    const tposResult = await searchCustomerByPhone(selectedCustomer.phone);
                    if (tposResult.success && tposResult.customer) {
                        tposData = tposResult.customer;
                        customerName = tposData.name || customerName;
                        console.log('[RESOLVE-MATCH] Got TPOS data:', tposData.name);
                    }
                } catch (e) {
                    console.log('[RESOLVE-MATCH] TPOS fetch failed, using selected customer name:', e.message);
                }

                // Create/update customer
                if (!tposData) {
                    tposData = { name: customerName };
                }
                const customerResult = await getOrCreateCustomerFromTPOS(db, selectedCustomer.phone, tposData);
                customerId = customerResult.customerId;
                customerName = customerResult.customerName || customerName;
                console.log(`[RESOLVE-MATCH] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}`);
            } catch (err) {
                console.error('[RESOLVE-MATCH] Customer creation failed:', err.message);
            }

            // 4. Mark transaction as processed AND link to customer phone + customer_id
            const amount = parseInt(match.transfer_amount) || 0;
            await db.query(
                `UPDATE balance_history
                 SET debt_added = TRUE,
                     linked_customer_phone = $2,
                     customer_id = COALESCE($3, customer_id),
                     verification_status = 'PENDING_VERIFICATION',
                     match_method = 'pending_match',
                     verification_note = 'Cho ke toan duyet (NV chon tu dropdown)',
                     staff_note = COALESCE($4, staff_note)
                 WHERE id = $1 AND linked_customer_phone IS NULL`,
                [match.transaction_id, selectedCustomer.phone, customerId, staff_note || null]
            );

            console.log('[RESOLVE-MATCH] Linked transaction', match.transaction_id, 'to phone:', selectedCustomer.phone, 'customer_id:', customerId, staff_note ? `staff_note: "${staff_note}"` : '');

            // 5. DO NOT process wallet immediately - needs accountant approval first
            let walletProcessed = false;
            console.log('[RESOLVE-MATCH] Wallet processing deferred - awaiting accountant approval');

            // 6. Update pending match status with selected customer info as JSON
            const selectedCustomerJson = JSON.stringify({
                id: customerId,
                name: customerName,
                phone: selectedCustomer.phone
            });

            await db.query(
                `UPDATE pending_customer_matches
                 SET status = 'resolved',
                     selected_customer_id = $2,
                     resolved_at = CURRENT_TIMESTAMP,
                     resolved_by = $3,
                     resolution_notes = $4
                 WHERE id = $1`,
                [
                    id,
                    customerId,
                    resolved_by,
                    selectedCustomerJson
                ]
            );

            // Track recent transfer phone (7-day TTL, total amount)
            await upsertRecentTransfer(db, selectedCustomer.phone);

            console.log('[RESOLVE-MATCH] Match resolved:', {
                match_id: id,
                transaction_id: match.transaction_id,
                customer_phone: selectedCustomer.phone,
                customer_id: customerId,
                amount,
                walletProcessed
            });

            res.json({
                success: true,
                message: 'Match resolved successfully',
                data: {
                    match_id: id,
                    transaction_id: match.transaction_id,
                    customer: {
                        id: customerId,
                        phone: selectedCustomer.phone,
                        name: customerName
                    },
                    amount_added: amount,
                    wallet_processed: walletProcessed
                }
            });

        } catch (error) {
            console.error('[RESOLVE-MATCH] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resolve match',
                message: error.message
            });
        }
    });

    /**
     * PUT /api/sepay/pending-matches/:id/customers
     * Update matched_customers list for a pending match
     */
    router.put('/pending-matches/:id/customers', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { matched_customers } = req.body;

        if (!matched_customers || !Array.isArray(matched_customers)) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid matched_customers array'
            });
        }

        try {
            const result = await db.query(
                `UPDATE pending_customer_matches
                 SET matched_customers = $2::jsonb
                 WHERE id = $1 AND status = 'pending'
                 RETURNING id, transaction_id, extracted_phone`,
                [id, JSON.stringify(matched_customers)]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Pending match not found or already resolved'
                });
            }

            console.log('[UPDATE-CUSTOMERS] Updated matched_customers for pending match:', id, '- new count:', matched_customers.length);

            res.json({
                success: true,
                message: 'Matched customers updated successfully',
                data: result.rows[0]
            });

        } catch (error) {
            console.error('[UPDATE-CUSTOMERS] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update matched customers',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/pending-matches/:id/skip
     * Skip/ignore a pending match
     */
    router.post('/pending-matches/:id/skip', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { reason = 'Skipped by admin', resolved_by = 'admin' } = req.body;

        try {
            const result = await db.query(
                `UPDATE pending_customer_matches
                 SET status = 'skipped',
                     resolved_at = CURRENT_TIMESTAMP,
                     resolved_by = $2,
                     resolution_notes = $3
                 WHERE id = $1 AND status = 'pending'
                 RETURNING id, transaction_id, extracted_phone`,
                [id, resolved_by, reason]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Pending match not found or already resolved'
                });
            }

            console.log('[SKIP-MATCH] Match skipped:', result.rows[0]);

            res.json({
                success: true,
                message: 'Match skipped successfully',
                data: result.rows[0]
            });

        } catch (error) {
            console.error('[SKIP-MATCH] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to skip match',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/pending-matches/:id/undo-skip
     * Undo a skipped pending match - reset to pending status
     */
    router.post('/pending-matches/:id/undo-skip', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { id } = req.params;
        const { resolved_by = 'admin' } = req.body;

        try {
            // Check if match exists and is skipped
            const checkResult = await db.query(
                `SELECT id, transaction_id, status FROM pending_customer_matches WHERE id = $1`,
                [id]
            );

            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Pending match not found'
                });
            }

            if (checkResult.rows[0].status !== 'skipped') {
                return res.status(400).json({
                    success: false,
                    error: 'Match is not in skipped status',
                    current_status: checkResult.rows[0].status
                });
            }

            // Reset to pending status
            const result = await db.query(
                `UPDATE pending_customer_matches
                 SET status = 'pending',
                     resolved_at = NULL,
                     resolved_by = NULL,
                     selected_customer_id = NULL,
                     resolution_notes = $2
                 WHERE id = $1
                 RETURNING id, transaction_id, extracted_phone, status`,
                [id, `Undo skip by ${resolved_by} at ${new Date().toISOString()}`]
            );

            console.log('[UNDO-SKIP] Match reset to pending:', result.rows[0]);

            res.json({
                success: true,
                message: 'Match reset to pending successfully',
                data: result.rows[0]
            });

        } catch (error) {
            console.error('[UNDO-SKIP] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to undo skip',
                message: error.message
            });
        }
    });

    // =====================================================
    // BATCH UPDATE & TPOS SEARCH ENDPOINTS
    // =====================================================

    /**
     * POST /api/sepay/batch-update-phones
     * Batch update phone numbers for existing transactions
     */
    router.post('/batch-update-phones', async (req, res) => {
        const db = req.app.locals.chatDb;
        const { limit = 100, force = false } = req.body;

        try {
            console.log('[BATCH-UPDATE] Starting batch phone update...');

            // Get transactions that need phone extraction
            const filter = force ? '' : 'AND debt_added = FALSE';
            const query = `
                SELECT id, content, transfer_type
                FROM balance_history
                WHERE transfer_type = 'in'
                ${filter}
                ORDER BY transaction_date DESC
                LIMIT $1
            `;

            const result = await db.query(query, [Math.min(limit, 500)]);
            const transactions = result.rows;

            console.log(`[BATCH-UPDATE] Found ${transactions.length} transactions to process`);

            const results = {
                total: transactions.length,
                processed: 0,
                success: 0,
                pending_matches: 0,
                not_found: 0,
                skipped: 0,
                failed: 0,
                details: []
            };

            // Process each transaction using processDebtUpdate()
            for (const tx of transactions) {
                results.processed++;

                try {
                    const updateResult = await processDebtUpdate(db, tx.id, fetchWithTimeout);

                    if (updateResult.success) {
                        if (updateResult.method === 'pending_match_created') {
                            results.pending_matches++;
                            results.details.push({
                                transaction_id: tx.id,
                                status: 'pending_match',
                                partial_phone: updateResult.partialPhone,
                                unique_phones_count: updateResult.uniquePhonesCount
                            });
                            console.log(`[BATCH-UPDATE] Transaction ${tx.id}: pending match (${updateResult.uniquePhonesCount} phones)`);
                        } else {
                            results.success++;
                            results.details.push({
                                transaction_id: tx.id,
                                status: 'success',
                                method: updateResult.method,
                                phone: updateResult.fullPhone || updateResult.qrCode,
                                customer_name: updateResult.customerName
                            });
                            console.log(`[BATCH-UPDATE] Transaction ${tx.id}: ${updateResult.method}`);
                        }
                    } else {
                        if (updateResult.reason === 'No TPOS matches' || updateResult.note === 'NOT_FOUND_IN_TPOS') {
                            results.not_found++;
                            results.details.push({
                                transaction_id: tx.id,
                                status: 'not_found',
                                partial_phone: updateResult.partialPhone,
                                content: tx.content || '',
                                reason: updateResult.reason
                            });
                            console.log(`[BATCH-UPDATE] Transaction ${tx.id}: no TPOS matches for ${updateResult.partialPhone}`);
                        } else {
                            results.skipped++;
                            results.details.push({
                                transaction_id: tx.id,
                                status: 'skipped',
                                content: tx.content || '',
                                reason: updateResult.reason,
                                note: updateResult.note
                            });
                            console.log(`[BATCH-UPDATE] Transaction ${tx.id}: ${updateResult.reason}`);
                        }
                    }

                } catch (error) {
                    results.failed++;
                    results.details.push({
                        transaction_id: tx.id,
                        status: 'failed',
                        error: error.message
                    });
                    console.error(`[BATCH-UPDATE] Transaction ${tx.id}:`, error.message);
                }
            }

            console.log('[BATCH-UPDATE] Complete:', results);

            res.json({
                success: true,
                message: `Batch update completed: ${results.success} success, ${results.pending_matches} pending matches, ${results.not_found} not found, ${results.skipped} skipped, ${results.failed} failed`,
                data: results
            });

        } catch (error) {
            console.error('[BATCH-UPDATE] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to batch update phones',
                message: error.message
            });
        }
    });

    /**
     * GET /api/sepay/tpos/customer/:phone
     * Fetch customer info from TPOS Partner API by phone number
     */
    router.get('/tpos/customer/:phone', async (req, res) => {
        const { phone } = req.params;

        try {
            if (!phone || !/^\d{10}$/.test(phone)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number (must be 10 digits)'
                });
            }

            console.log(`[TPOS-CUSTOMER] Fetching customer for phone: ${phone}`);

            // Get TPOS token
            const token = await tposTokenManager.getToken();

            // Call TPOS Partner API
            const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${phone}&$top=50&$orderby=DateCreated+desc&$count=true`;

            const response = await fetchWithTimeout(tposUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }, 15000);

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Group by unique 10-digit phone
            const uniqueCustomers = [];
            const seenPhones = new Set();

            if (data.value && Array.isArray(data.value)) {
                for (const customer of data.value) {
                    const custPhone = customer.Phone?.replace(/\D/g, '').slice(-10);
                    if (custPhone && custPhone.length === 10 && !seenPhones.has(custPhone)) {
                        seenPhones.add(custPhone);
                        uniqueCustomers.push({
                            id: customer.Id,
                            phone: custPhone,
                            name: customer.Name || customer.FullName,
                            email: customer.Email,
                            address: customer.FullAddress || customer.Street,
                            statusText: customer.StatusText,
                            status: customer.Status,
                            credit: customer.Credit
                        });
                    }
                }
            }

            console.log(`[TPOS-CUSTOMER] Found ${uniqueCustomers.length} unique customers for ${phone}`);

            res.json({
                success: true,
                data: uniqueCustomers,
                count: uniqueCustomers.length
            });

        } catch (error) {
            console.error('[TPOS-CUSTOMER] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch customer from TPOS',
                message: error.message
            });
        }
    });

    /**
     * GET /api/sepay/tpos/search/:partialPhone
     * Search TPOS by partial phone number (5+ digits)
     */
    router.get('/tpos/search/:partialPhone', async (req, res) => {
        const { partialPhone } = req.params;

        try {
            // Validate partial phone (5-10 digits)
            if (!partialPhone || !/^\d{5,10}$/.test(partialPhone)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid partial phone (must be 5-10 digits)'
                });
            }

            console.log(`[TPOS-SEARCH] Searching for partial phone: ${partialPhone}`);

            // Get TPOS token
            const token = await tposTokenManager.getToken();

            // Call TPOS Partner API
            const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${partialPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

            const response = await fetchWithTimeout(tposUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }, 15000);

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Group by unique 10-digit phone
            const phoneGroups = {};

            if (data.value && Array.isArray(data.value)) {
                for (const customer of data.value) {
                    const custPhone = customer.Phone?.replace(/\D/g, '').slice(-10);
                    if (custPhone && custPhone.length === 10) {
                        if (!phoneGroups[custPhone]) {
                            phoneGroups[custPhone] = {
                                phone: custPhone,
                                count: 0,
                                customers: []
                            };
                        }
                        phoneGroups[custPhone].count++;
                        phoneGroups[custPhone].customers.push({
                            id: customer.Id,
                            phone: custPhone,
                            name: customer.Name || customer.FullName || 'N/A',
                            email: customer.Email,
                            status: customer.Status,
                            credit: customer.Credit
                        });
                    }
                }
            }

            const uniquePhones = Object.values(phoneGroups);
            console.log(`[TPOS-SEARCH] Found ${uniquePhones.length} unique phones for ${partialPhone}`);

            res.json({
                success: true,
                data: uniquePhones,
                totalResults: data['@odata.count'] || 0,
                uniquePhoneCount: uniquePhones.length
            });

        } catch (error) {
            console.error('[TPOS-SEARCH] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to search TPOS',
                message: error.message
            });
        }
    });

    /**
     * POST /api/sepay/update-debt (DEPRECATED)
     */
    router.post('/update-debt', async (req, res) => {
        console.log('[UPDATE-DEBT] Endpoint called but disabled (customers table removed)');

        return res.status(410).json({
            success: false,
            error: 'Endpoint no longer supported',
            message: 'Manual debt adjustment has been removed. Debt is now calculated automatically from transactions in balance_history.',
            deprecated: true
        });
    });
}

module.exports = {
    extractPhoneFromContent,
    searchTPOSByPartialPhone,
    searchTPOSByPhone,
    processDebtUpdate,
    registerRoutes
};
