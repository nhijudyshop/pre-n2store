/**
 * API Configuration for Customer Management
 * Centralized API endpoint management
 */

// API Base URL (via Cloudflare Worker proxy for CORS)
const API_BASE_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Direct Render.com backend (fallback)
// const API_BASE_URL = 'https://n2store-fallback.onrender.com';

// API Endpoints
const API_ENDPOINTS = {
    // Customer Management
    CUSTOMERS_SEARCH: `${API_BASE_URL}/api/customers/search`,
    CUSTOMERS_STATS: `${API_BASE_URL}/api/customers/stats`,
    CUSTOMERS_LIST: `${API_BASE_URL}/api/customers`,
    CUSTOMERS_GET: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_CREATE: `${API_BASE_URL}/api/customers`,
    CUSTOMERS_UPDATE: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_DELETE: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_BATCH: `${API_BASE_URL}/api/customers/batch`,
    CUSTOMERS_DUPLICATES: `${API_BASE_URL}/api/customers/duplicates`,

    // Transaction History (existing)
    TRANSACTIONS_BY_PHONE: (phone) => `${API_BASE_URL}/api/sepay/transactions-by-phone?phone=${encodeURIComponent(phone)}&limit=100`
};

// API Helper Functions
const API = {
    /**
     * Search customers
     * @param {string} searchTerm - Search query
     * @param {number} limit - Max results (default: 100)
     * @param {string} status - Filter by status (optional)
     * @returns {Promise<Object>} - Search results
     */
    async searchCustomers(searchTerm, limit = 100, status = null) {
        const url = new URL(API_ENDPOINTS.CUSTOMERS_SEARCH);
        url.searchParams.set('q', searchTerm);
        url.searchParams.set('limit', limit);
        if (status) url.searchParams.set('status', status);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
        }
        return await response.json();
    },

    /**
     * Get customer statistics
     * @returns {Promise<Object>} - Statistics data
     */
    async getStats() {
        const response = await fetch(API_ENDPOINTS.CUSTOMERS_STATS);
        if (!response.ok) {
            throw new Error(`Get stats failed: ${response.statusText}`);
        }
        return await response.json();
    },

    /**
     * Get paginated customer list
     * @param {number} page - Page number (default: 1)
     * @param {number} limit - Items per page (default: 100)
     * @param {string} status - Filter by status (optional)
     * @returns {Promise<Object>} - Customer list with pagination
     */
    async getCustomers(page = 1, limit = 100, status = null) {
        const url = new URL(API_ENDPOINTS.CUSTOMERS_LIST);
        url.searchParams.set('page', page);
        url.searchParams.set('limit', limit);
        if (status) url.searchParams.set('status', status);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Get customers failed: ${response.statusText}`);
        }
        return await response.json();
    },

    /**
     * Get single customer by ID
     * @param {number} id - Customer ID
     * @returns {Promise<Object>} - Customer data
     */
    async getCustomer(id) {
        const response = await fetch(API_ENDPOINTS.CUSTOMERS_GET(id));
        if (!response.ok) {
            throw new Error(`Get customer failed: ${response.statusText}`);
        }
        return await response.json();
    },

    /**
     * Create new customer
     * @param {Object} customerData - Customer data
     * @returns {Promise<Object>} - Created customer
     */
    async createCustomer(customerData) {
        const response = await fetch(API_ENDPOINTS.CUSTOMERS_CREATE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(customerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Create customer failed');
        }
        return await response.json();
    },

    /**
     * Update existing customer
     * @param {number} id - Customer ID
     * @param {Object} customerData - Updated customer data
     * @returns {Promise<Object>} - Updated customer
     */
    async updateCustomer(id, customerData) {
        const response = await fetch(API_ENDPOINTS.CUSTOMERS_UPDATE(id), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(customerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Update customer failed');
        }
        return await response.json();
    },

    /**
     * Delete customer
     * @param {number} id - Customer ID
     * @param {boolean} hardDelete - Hard delete (default: false = soft delete)
     * @returns {Promise<Object>} - Deleted customer
     */
    async deleteCustomer(id, hardDelete = false) {
        const url = new URL(API_ENDPOINTS.CUSTOMERS_DELETE(id));
        if (hardDelete) url.searchParams.set('hard_delete', 'true');

        const response = await fetch(url, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Delete customer failed');
        }
        return await response.json();
    },

    /**
     * Batch create customers
     * @param {Array<Object>} customers - Array of customer data
     * @returns {Promise<Object>} - Batch import results
     */
    async batchCreateCustomers(customers) {
        const response = await fetch(API_ENDPOINTS.CUSTOMERS_BATCH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ customers })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Batch create failed');
        }
        return await response.json();
    },

    /**
     * Get customers with duplicate phone numbers
     * @param {number} page - Page number (default: 1)
     * @param {number} limit - Items per page (default: 100)
     * @returns {Promise<Object>} - Duplicate customers list with pagination
     */
    async getDuplicateCustomers(page = 1, limit = 100) {
        const url = new URL(API_ENDPOINTS.CUSTOMERS_DUPLICATES);
        url.searchParams.set('page', page);
        url.searchParams.set('limit', limit);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Get duplicate customers failed: ${response.statusText}`);
        }
        return await response.json();
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.API_ENDPOINTS = API_ENDPOINTS;
    window.API = API;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_ENDPOINTS, API };
}
