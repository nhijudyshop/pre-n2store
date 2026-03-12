/**
 * TPOS OData Helpers
 * Common OData query patterns for TPOS API
 */

import { TPOSClient, TPOS_ENDPOINTS, buildODataFilter, buildODataExpand } from './tpos-client.js';

// =====================================================
// TPOS ODATA SERVICE
// =====================================================

export class TPOSODataService {
    /**
     * @param {TPOSClient} client - TPOS client instance
     */
    constructor(client) {
        this.client = client;
    }

    // =====================================================
    // SALE ONLINE ORDERS
    // =====================================================

    /**
     * Get SaleOnline orders with filters
     * @param {Object} options - Query options
     */
    async getSaleOnlineOrders(options = {}) {
        const {
            filter,
            expand = 'OrderLines($expand=Product),Partner,SaleOnline_Facebook_UserInfos,CreatedBy',
            orderBy = 'DateCreated desc',
            top = 500,
            skip = 0,
            count = true
        } = options;

        const url = this.client.buildODataUrl(TPOS_ENDPOINTS.SALE_ONLINE_ORDER_VIEW, {
            filter,
            expand,
            orderBy,
            top,
            skip,
            count
        });

        return this.client.get(url);
    }

    /**
     * Get orders by date range
     */
    async getOrdersByDateRange(startDate, endDate, additionalFilters = {}) {
        const filter = buildODataFilter({
            DateCreated: {
                $gte: startDate instanceof Date ? startDate.toISOString() : startDate,
                $lte: endDate instanceof Date ? endDate.toISOString() : endDate
            },
            ...additionalFilters
        });

        return this.getSaleOnlineOrders({ filter });
    }

    /**
     * Get orders by status
     */
    async getOrdersByStatus(status, options = {}) {
        const filter = buildODataFilter({
            StatusText: status,
            ...options.additionalFilters
        });

        return this.getSaleOnlineOrders({ ...options, filter });
    }

    /**
     * Get orders by phone number
     */
    async getOrdersByPhone(phone, options = {}) {
        const filter = buildODataFilter({
            Phone: { $contains: phone }
        });

        return this.getSaleOnlineOrders({ ...options, filter });
    }

    /**
     * Get order by ID
     */
    async getOrderById(orderId) {
        const filter = `Id eq ${orderId}`;
        const result = await this.getSaleOnlineOrders({ filter, top: 1 });
        return result.value?.[0] || null;
    }

    /**
     * Get order by code
     */
    async getOrderByCode(code) {
        const filter = `Code eq '${code}'`;
        const result = await this.getSaleOnlineOrders({ filter, top: 1 });
        return result.value?.[0] || null;
    }

    // =====================================================
    // FAST SALE ORDERS
    // =====================================================

    /**
     * Get FastSale orders
     */
    async getFastSaleOrders(options = {}) {
        const {
            filter,
            expand = 'OrderLines($expand=Product),Partner',
            orderBy = 'DateCreated desc',
            top = 500,
            skip = 0,
            count = true
        } = options;

        const url = this.client.buildODataUrl(TPOS_ENDPOINTS.FAST_SALE_ORDER_VIEW, {
            filter,
            expand,
            orderBy,
            top,
            skip,
            count
        });

        return this.client.get(url);
    }

    /**
     * Search fast sale orders by phone
     */
    async searchFastSaleByPhone(phone) {
        const filter = buildODataFilter({
            'Partner/Phone': { $contains: phone }
        });

        return this.getFastSaleOrders({ filter, top: 50 });
    }

    // =====================================================
    // PRODUCTS
    // =====================================================

    /**
     * Get all products
     */
    async getProducts(options = {}) {
        const {
            filter,
            expand = '',
            orderBy = 'Name',
            top = 1000,
            skip = 0,
            count = true
        } = options;

        const url = this.client.buildODataUrl(TPOS_ENDPOINTS.PRODUCT, {
            filter,
            expand,
            orderBy,
            top,
            skip,
            count
        });

        return this.client.get(url);
    }

    /**
     * Search products by name or code
     */
    async searchProducts(query) {
        const filter = buildODataFilter({
            $or: [
                { NameGet: { $contains: query } },
                { Code: { $contains: query } },
                { Barcode: { $contains: query } }
            ]
        });

        // Manual OR construction since buildODataFilter doesn't support $or
        const orFilter = `(contains(NameGet, '${query}') or contains(Code, '${query}') or contains(Barcode, '${query}'))`;

        return this.getProducts({ filter: orFilter, top: 100 });
    }

    /**
     * Get product by ID
     */
    async getProductById(productId) {
        const url = this.client.buildODataUrl(`${TPOS_ENDPOINTS.PRODUCT}(${productId})`);
        return this.client.get(url);
    }

    // =====================================================
    // PARTNERS (CUSTOMERS)
    // =====================================================

    /**
     * Get partners/customers
     */
    async getPartners(options = {}) {
        const {
            filter,
            expand = '',
            orderBy = 'Name',
            top = 100,
            skip = 0,
            count = true
        } = options;

        const url = this.client.buildODataUrl(TPOS_ENDPOINTS.PARTNER, {
            filter,
            expand,
            orderBy,
            top,
            skip,
            count
        });

        return this.client.get(url);
    }

    /**
     * Search customer by phone
     */
    async searchCustomerByPhone(phone) {
        const filter = `contains(Phone, '${phone}')`;
        return this.getPartners({ filter, top: 10 });
    }

    /**
     * Get customer by ID
     */
    async getCustomerById(partnerId) {
        const url = this.client.buildODataUrl(`${TPOS_ENDPOINTS.PARTNER}(${partnerId})`);
        return this.client.get(url);
    }

    // =====================================================
    // CRM TEAMS
    // =====================================================

    /**
     * Get all CRM teams
     */
    async getCrmTeams() {
        const url = this.client.buildODataUrl(TPOS_ENDPOINTS.CRM_TEAM, {
            orderBy: 'Name',
            top: 1000
        });

        return this.client.get(url);
    }

    // =====================================================
    // UPDATE OPERATIONS
    // =====================================================

    /**
     * Update order fields
     * @param {number} orderId - Order ID
     * @param {Object} fields - Fields to update
     */
    async updateOrder(orderId, fields) {
        const url = this.client.buildODataUrl(
            `${TPOS_ENDPOINTS.SALE_ONLINE_ORDER}(${orderId})/${TPOS_ENDPOINTS.UPDATE_V2}`
        );

        return this.client.post(url, fields);
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId, status) {
        return this.updateOrder(orderId, { StatusText: status });
    }

    /**
     * Update order note
     */
    async updateOrderNote(orderId, note) {
        return this.updateOrder(orderId, { Note: note });
    }

    /**
     * Update partner status
     */
    async updatePartnerStatus(orderId, status) {
        return this.updateOrder(orderId, { StatusPartnerText: status });
    }

    /**
     * Update customer info on order
     */
    async updateOrderCustomer(orderId, customerData) {
        return this.updateOrder(orderId, {
            ReceiverName: customerData.name,
            ReceiverPhone: customerData.phone,
            ReceiverAddress: customerData.address
        });
    }

    // =====================================================
    // BATCH OPERATIONS
    // =====================================================

    /**
     * Batch update multiple orders
     */
    async batchUpdateOrders(orderIds, fields) {
        const results = await Promise.allSettled(
            orderIds.map(id => this.updateOrder(id, fields))
        );

        return {
            success: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length,
            results
        };
    }

    /**
     * Import Excel data
     */
    async importExcel(data) {
        const url = this.client.buildODataUrl(
            `${TPOS_ENDPOINTS.SALE_ONLINE_ORDER}/${TPOS_ENDPOINTS.ACTION_IMPORT_SIMPLE}`
        );

        return this.client.post(url, data);
    }
}

// =====================================================
// ORDER STATUS CONSTANTS
// =====================================================

export const ORDER_STATUS = {
    // SaleOnline_Order status
    NEW: 'Mới',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang xử lý',
    SHIPPING: 'Đang giao',
    DELIVERED: 'Đã giao',
    CANCELLED: 'Đã hủy',
    RETURNED: 'Đã trả hàng',

    // Partner status
    PARTNER_PENDING: 'Chờ xác nhận',
    PARTNER_CONFIRMED: 'Đã xác nhận',
    PARTNER_DELIVERED: 'Đã giao hàng',
    PARTNER_CANCELLED: 'Đã hủy',
};

// =====================================================
// DATE HELPERS
// =====================================================

/**
 * Get today's date range for OData
 */
export function getTodayRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
        start: today.toISOString(),
        end: tomorrow.toISOString()
    };
}

/**
 * Get last N days range
 */
export function getLastNDaysRange(n) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - n);
    start.setHours(0, 0, 0, 0);

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

/**
 * Get this month range
 */
export function getThisMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

// =====================================================
// FACTORY
// =====================================================

/**
 * Create OData service from client
 */
export function createODataService(client) {
    return new TPOSODataService(client);
}

console.log('[TPOS-ODATA] Module loaded');

export default TPOSODataService;
