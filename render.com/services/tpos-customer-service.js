/**
 * =====================================================
 * TPOS CUSTOMER SERVICE
 * =====================================================
 *
 * Dịch vụ gọi API TPOS để tìm kiếm và lấy thông tin khách hàng
 *
 * Functions:
 *   - searchCustomerByPhone(phone) - Tìm khách hàng theo SĐT
 *   - getCustomerById(tposId) - Lấy thông tin khách hàng theo TPOS ID
 *
 * Created: 2026-01-12
 * =====================================================
 */

const tposTokenManager = require('./tpos-token-manager');
const fetch = require('node-fetch');
const AbortController = globalThis.AbortController || require('abort-controller');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Fetch with timeout to prevent hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 15000ms = 15s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Normalize phone number to 10-digit format (0XXXXXXXXX)
 * @param {string} phone - Raw phone number
 * @returns {string|null} Normalized phone or null
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/\D/g, ''); // Remove non-digits

    // If phone starts with +84, remove it
    if (normalized.startsWith('84') && normalized.length === 11) {
        normalized = '0' + normalized.substring(2);
    }

    // Take last 10 digits if longer
    if (normalized.length > 10) {
        normalized = normalized.slice(-10);
    }

    // Ensure it starts with 0
    if (!normalized.startsWith('0') && normalized.length === 9) {
        normalized = '0' + normalized;
    }

    return normalized.length === 10 ? normalized : null;
}

// =====================================================
// TPOS API FUNCTIONS
// =====================================================

/**
 * Search TPOS customer by phone number
 * @param {string} phone - Phone number to search (will be normalized)
 * @returns {Promise<{success: boolean, customer: object|null, totalResults: number, error?: string}>}
 */
async function searchCustomerByPhone(phone) {
    const fullPhone = normalizePhone(phone);

    if (!fullPhone) {
        return {
            success: false,
            error: 'Invalid phone number',
            customer: null,
            totalResults: 0
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Searching for phone: ${fullPhone}`);

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

        console.log(`[TPOS-CUSTOMER] Found ${totalResults} total results for ${fullPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customer: null,
                totalResults: 0
            };
        }

        // Find EXACT match with full phone
        for (const customer of data.value) {
            const customerPhone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Check for exact match
            if (customerPhone === fullPhone) {
                console.log(`[TPOS-CUSTOMER] ✅ Found exact match: ${customer.Name || customer.DisplayName}`);
                return {
                    success: true,
                    customer: {
                        id: customer.Id,
                        name: customer.Name || customer.DisplayName,
                        phone: customerPhone,
                        email: customer.Email,
                        address: customer.FullAddress || customer.Street,
                        network: customer.NameNetwork,
                        status: customer.StatusText,  // Use StatusText, not Status
                        dateCreated: customer.DateCreated,
                        // Raw data for backup
                        raw: {
                            DateCreated: customer.DateCreated,
                            DateModified: customer.DateModified,
                            Active: customer.Active
                        }
                    },
                    totalResults
                };
            }
        }

        // No exact match found, return first result as best match
        const firstCustomer = data.value[0];
        console.log(`[TPOS-CUSTOMER] No exact match, using first result: ${firstCustomer.Name || firstCustomer.DisplayName}`);

        return {
            success: true,
            customer: {
                id: firstCustomer.Id,
                name: firstCustomer.Name || firstCustomer.DisplayName,
                phone: firstCustomer.Phone?.replace(/\D/g, '').slice(-10),
                email: firstCustomer.Email,
                address: firstCustomer.FullAddress || firstCustomer.Street,
                network: firstCustomer.NameNetwork,
                status: firstCustomer.StatusText,  // Use StatusText, not Status
                dateCreated: firstCustomer.DateCreated,
                raw: {
                    DateCreated: firstCustomer.DateCreated,
                    DateModified: firstCustomer.DateModified,
                    Active: firstCustomer.Active
                }
            },
            totalResults,
            exactMatch: false
        };

    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null,
            totalResults: 0
        };
    }
}

/**
 * Get TPOS customer by ID
 * @param {number|string} tposId - TPOS customer ID
 * @returns {Promise<{success: boolean, customer: object|null, error?: string}>}
 */
async function getCustomerById(tposId) {
    if (!tposId) {
        return {
            success: false,
            error: 'TPOS ID is required',
            customer: null
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Fetching customer by ID: ${tposId}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API with ID filter
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&$filter=Id eq ${tposId}`;

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

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            console.log(`[TPOS-CUSTOMER] Customer not found with ID: ${tposId}`);
            return {
                success: true,
                customer: null
            };
        }

        const customer = data.value[0];
        console.log(`[TPOS-CUSTOMER] ✅ Found customer: ${customer.Name || customer.DisplayName}`);

        return {
            success: true,
            customer: {
                id: customer.Id,
                name: customer.Name || customer.DisplayName,
                phone: customer.Phone?.replace(/\D/g, '').slice(-10),
                email: customer.Email,
                address: customer.FullAddress || customer.Street,
                network: customer.NameNetwork,
                status: customer.StatusText,  // Use StatusText, not Status
                dateCreated: customer.DateCreated,
                raw: {
                    DateCreated: customer.DateCreated,
                    DateModified: customer.DateModified,
                    Active: customer.Active
                }
            }
        };

    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null
        };
    }
}

/**
 * Search multiple customers by phone (returns all matches, not just first)
 * @param {string} phone - Phone number to search
 * @returns {Promise<{success: boolean, customers: array, totalResults: number, error?: string}>}
 */
async function searchAllCustomersByPhone(phone) {
    const fullPhone = normalizePhone(phone);

    if (!fullPhone) {
        return {
            success: false,
            error: 'Invalid phone number',
            customers: [],
            totalResults: 0
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Searching all customers for phone: ${fullPhone}`);

        const token = await tposTokenManager.getToken();

        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${fullPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

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

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customers: [],
                totalResults: 0
            };
        }

        const customers = data.value.map(customer => ({
            id: customer.Id,
            name: customer.Name || customer.DisplayName,
            phone: customer.Phone?.replace(/\D/g, '').slice(-10),
            email: customer.Email,
            address: customer.FullAddress || customer.Street,
            network: customer.NameNetwork,
            status: customer.StatusText,  // Use StatusText, not Status
            dateCreated: customer.DateCreated
        }));

        console.log(`[TPOS-CUSTOMER] Found ${customers.length} customers for ${fullPhone}`);

        return {
            success: true,
            customers,
            totalResults
        };

    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customers: [],
            totalResults: 0
        };
    }
}

module.exports = {
    searchCustomerByPhone,
    getCustomerById,
    searchAllCustomersByPhone,
    normalizePhone
};
