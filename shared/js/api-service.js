// api-service.js (SHARED)
// =====================================================
// Unified API service for customer-hub, issue-tracking, balance-history
// ALL endpoints point to V2 API (single source of truth)
//
// Replaces:
//   - customer-hub/js/api-service.js
//   - issue-tracking/js/api-service.js
//
// Consolidation date: 2026-02-11
// =====================================================

const ApiService = {
    // API mode: 'FIREBASE' (legacy) or 'POSTGRESQL' (new Customer 360°)
    mode: 'POSTGRESQL',  // Changed to use PostgreSQL by default

    // PostgreSQL API base URL - Via Cloudflare Worker proxy to avoid CORS
    // Worker proxies to n2store-chat.onrender.com which hosts Customer 360° routes
    RENDER_API_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',

    // Direct Render.com URL for SSE (bypasses Cloudflare Worker to avoid timeout)
    RENDER_SSE_URL: 'https://n2store-fallback.onrender.com',

    // =====================================================
    // TPOS ORDER METHODS
    // =====================================================

    /**
     * Search orders from TPOS via TPOS OData Proxy
     * Uses tokenManager.authenticatedFetch() for proper auth handling
     * @param {string} query - Phone number (5-11 digits supported)
     * @returns {Promise<{orders: Array, totalFound: number, allCancelled: boolean}>}
     */
    async searchOrders(query) {
        if (!query) return [];

        // Extract digits only
        const cleanQuery = query.replace(/\D/g, '');
        if (cleanQuery.length < 3) {
            console.log('[API] Query too short, need at least 3 digits');
            return [];
        }

        console.log(`[API] Searching orders for phone: ${cleanQuery}`);

        // Build date range (last 60 days)
        const now = new Date();
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        // Format dates for OData (ISO 8601 with timezone)
        const startDate = sixtyDaysAgo.toISOString().replace('Z', '+00:00');
        const endDate = now.toISOString().replace('Z', '+00:00');

        // Build OData filter - matches the working TPOS request
        const filter = `(Type eq 'invoice' and IsMergeCancel ne true and DateInvoice ge ${startDate} and DateInvoice le ${endDate} and contains(Phone,'${cleanQuery}'))`;

        const url = `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.GetView?$top=20&$orderby=DateInvoice desc&$filter=${encodeURIComponent(filter)}&$count=true`;

        console.log('[API] TPOS OData URL:', url);

        try {
            // Use tokenManager.authenticatedFetch() - handles token auto-refresh and proper headers
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[API] TPOS response error:', errorText);
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[API] TPOS response count:', data['@odata.count'], 'orders');

            if (!data.value || data.value.length === 0) {
                return { orders: [], totalFound: 0, allCancelled: false };
            }

            // Filter: only open and paid orders (exclude draft and cancel)
            const validStates = ['open', 'paid'];
            const filteredOrders = data.value.filter(order => validStates.includes(order.State));

            console.log('[API] Filtered orders (open/paid):', filteredOrders.length, 'of', data.value.length);

            // Check if all orders were cancelled/draft
            const allCancelled = data.value.length > 0 && filteredOrders.length === 0;

            // Map TPOS fields to internal format
            const mappedOrders = filteredOrders.map(order => ({
                id: order.Id,
                tposCode: order.Number,
                reference: order.Reference,
                trackingCode: order.TrackingRef || '',
                customer: order.PartnerDisplayName || order.Ship_Receiver_Name || 'N/A',
                phone: order.Phone,
                address: order.FullAddress || order.Address || '',
                cod: order.CashOnDelivery || 0,
                totalAmount: order.AmountTotal || 0,
                status: order.State,
                stateCode: order.StateCode || 'None',
                crossCheckTimes: order.CrossCheckTimes || 0,
                carrier: order.CarrierName || '',
                channel: order.CRMTeamName || 'TPOS',
                products: [], // Will fetch separately via getOrderDetails()
                createdAt: new Date(order.DateInvoice).getTime()
            }));

            return {
                orders: mappedOrders,
                totalFound: data.value.length,
                allCancelled: allCancelled
            };

        } catch (error) {
            console.error('[API] Search orders failed:', error);
            throw error;
        }
    },

    /**
     * Get order details with products (OrderLines)
     * @param {number} orderId - TPOS Order ID
     * @returns {Promise<Object>} Order details with products array
     */
    async getOrderDetails(orderId) {
        if (!orderId) return null;

        // Expand OrderLines with Product info
        const expand = 'Partner,User,Carrier,OrderLines($expand=Product,ProductUOM)';
        const url = `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${orderId})?$expand=${encodeURIComponent(expand)}`;

        console.log('[API] Fetching order details:', orderId);

        try {
            const response = await window.tokenManager.authenticatedFetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[API] Order details error:', errorText);
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[API] Order details loaded, products:', data.OrderLines?.length || 0);

            // Calculate product subtotal from OrderLines (sum of PriceTotal for each line)
            const productSubtotal = (data.OrderLines || []).reduce((sum, line) => sum + (line.PriceTotal || 0), 0);

            // Map to internal format
            return {
                id: data.Id,
                tposCode: data.Number,
                reference: data.Reference,
                trackingCode: data.TrackingRef || '',
                customer: data.PartnerDisplayName || data.Ship_Receiver_Name || 'N/A',
                phone: data.Phone,
                address: data.FullAddress || data.Address || '',
                cod: data.CashOnDelivery || 0,
                // Use calculated product subtotal instead of AmountTotal (which is already reduced)
                amountTotal: productSubtotal,
                decreaseAmount: data.DecreaseAmount || 0,
                deliveryPrice: data.DeliveryPrice || 0,
                paymentAmount: data.PaymentAmount || 0,
                status: data.State,
                carrier: data.CarrierName || '',
                channel: data.CRMTeamName || 'TPOS',
                // Map OrderLines to products array
                products: (data.OrderLines || []).map(line => ({
                    id: line.Id,
                    productId: line.ProductId,
                    code: line.ProductBarcode || '',
                    name: line.ProductName || '',
                    quantity: line.ProductUOMQty || 1,
                    price: line.PriceUnit || 0,
                    total: line.PriceTotal || 0,
                    note: line.Note || '',
                    imageUrl: line.ProductImageUrl || ''
                })),
                createdAt: new Date(data.DateInvoice).getTime()
            };

        } catch (error) {
            console.error('[API] Get order details failed:', error);
            throw error;
        }
    },

    // =====================================================
    // TICKET METHODS (V2 API)
    // =====================================================

    /**
     * Create a new ticket
     * @param {Object} ticketData
     */
    async createTicket(ticketData) {
        // Use PostgreSQL API
        if (this.mode === 'POSTGRESQL') {
            try {
                const response = await fetch(`${this.RENDER_API_URL}/v2/tickets`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phone: ticketData.phone,
                        customer_name: ticketData.customer,
                        customer_address: ticketData.address,
                        order_id: ticketData.orderId,
                        tpos_order_id: ticketData.tposId,
                        tracking_code: ticketData.trackingCode,
                        carrier: ticketData.carrier || '',
                        type: ticketData.type,
                        status: ticketData.status || 'PENDING',
                        priority: ticketData.priority || 'normal',
                        products: ticketData.products || [],
                        original_cod: ticketData.originalCod,
                        new_cod: ticketData.newCod,
                        refund_amount: ticketData.money,
                        fix_cod_reason: ticketData.fixCodReason || ticketData.fixReason,
                        boom_reason: ticketData.boomReason,
                        internal_note: ticketData.note,
                        created_by: ticketData.createdBy || 'system',
                        return_from_order_id: ticketData.returnFromOrderId,
                        return_from_tpos_id: ticketData.returnFromTposId
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create ticket');
                }

                const result = await response.json();
                console.log('[API-V2] Ticket created:', result.data.ticket_code);

                // Return in Firebase-compatible format for backwards compatibility
                return {
                    ...ticketData,
                    firebaseId: result.data.ticket_code,
                    ticketCode: result.data.ticket_code,
                    id: result.data.id,
                    createdAt: new Date(result.data.created_at).getTime()
                };
            } catch (error) {
                console.error('[API-V2] Create ticket failed:', error);
                throw error;
            }
        }

        // Fallback to Firebase (legacy)
        try {
            const newRef = getTicketsRef().push();
            const ticket = {
                ...ticketData,
                firebaseId: newRef.key,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            await newRef.set(ticket);
            console.log('[API-FB] Ticket created:', ticket.firebaseId);
            return ticket;
        } catch (error) {
            console.error('[API-FB] Create ticket failed:', error);
            throw error;
        }
    },

    /**
     * Update ticket status or content
     * @param {string} firebaseId - Ticket code (TV-YYYY-NNNNN) or Firebase ID
     * @param {Object} updates
     */
    async updateTicket(firebaseId, updates) {
        // Use PostgreSQL API
        if (this.mode === 'POSTGRESQL') {
            try {
                // Map frontend field names to API field names
                const apiUpdates = {};
                if (updates.status !== undefined) apiUpdates.status = updates.status;
                if (updates.priority !== undefined) apiUpdates.priority = updates.priority;
                if (updates.products !== undefined) apiUpdates.products = updates.products;
                if (updates.originalCod !== undefined) apiUpdates.original_cod = updates.originalCod;
                if (updates.newCod !== undefined) apiUpdates.new_cod = updates.newCod;
                if (updates.money !== undefined) apiUpdates.refund_amount = updates.money;
                if (updates.fixReason !== undefined) apiUpdates.fix_cod_reason = updates.fixReason;
                if (updates.note !== undefined) apiUpdates.internal_note = updates.note;
                if (updates.assignedTo !== undefined) apiUpdates.assigned_to = updates.assignedTo;
                if (updates.receivedAt !== undefined) apiUpdates.received_at = new Date(updates.receivedAt).toISOString();
                if (updates.settledAt !== undefined) apiUpdates.settled_at = new Date(updates.settledAt).toISOString();
                if (updates.completedAt !== undefined) apiUpdates.completed_at = new Date(updates.completedAt).toISOString();
                if (updates.refundOrderId !== undefined) apiUpdates.refund_order_id = updates.refundOrderId;
                if (updates.refundNumber !== undefined) apiUpdates.refund_number = updates.refundNumber;
                if (updates.virtualCreditId !== undefined) apiUpdates.virtual_credit_id = updates.virtualCreditId;

                const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${firebaseId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(apiUpdates)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to update ticket');
                }

                const result = await response.json();
                console.log('[API-V2] Ticket updated:', firebaseId);
                return result.data;
            } catch (error) {
                console.error('[API-V2] Update ticket failed:', error);
                throw error;
            }
        }

        // Fallback to Firebase (legacy)
        try {
            const ref = getTicketsRef().child(firebaseId);
            await ref.update({
                ...updates,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
            console.log('[API-FB] Ticket updated:', firebaseId);
        } catch (error) {
            console.error('[API-FB] Update ticket failed:', error);
            throw error;
        }
    },

    /**
     * Delete a ticket
     * Uses V2 endpoint which handles virtual credit cancellation
     * @param {string} ticketCode - Ticket code to delete
     * @param {boolean} hard - If true, permanently delete; otherwise soft delete
     * @returns {Promise<Object>} Delete result
     */
    async deleteTicket(ticketCode, hard = false) {
        if (this.mode === 'POSTGRESQL') {
            try {
                const url = `${this.RENDER_API_URL}/v2/tickets/${ticketCode}${hard ? '?hard=true' : ''}`;
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete ticket');
                }

                const result = await response.json();
                console.log('[API-V2] Ticket deleted:', ticketCode, hard ? '(hard)' : '(soft)');
                return result;
            } catch (error) {
                console.error('[API-V2] Delete ticket failed:', error);
                throw error;
            }
        }

        // Fallback to Firebase (legacy)
        try {
            await getTicketsRef().child(ticketCode).remove();
            console.log('[API-FB] Ticket deleted:', ticketCode);
            return { success: true, ticketCode };
        } catch (error) {
            console.error('[API-FB] Delete ticket failed:', error);
            throw error;
        }
    },

    /**
     * Listen to tickets (real-time for Firebase, polling for PostgreSQL)
     * @param {Function} callback - (tickets) => void
     * @param {Object} filters - Optional filters { status, type, phone }
     * @returns {Function} unsubscribe function
     */
    subscribeToTickets(callback, filters = {}) {
        // Use PostgreSQL API with SSE (Server-Sent Events)
        if (this.mode === 'POSTGRESQL') {
            let isActive = true;
            let eventSource = null;

            const fetchTickets = async () => {
                if (!isActive) return;

                try {
                    // Build query string from filters
                    const params = new URLSearchParams();
                    if (filters.status) params.append('status', filters.status);
                    if (filters.type) params.append('type', filters.type);
                    if (filters.phone) params.append('phone', filters.phone);
                    params.append('limit', '100');

                    const url = `${this.RENDER_API_URL}/v2/tickets${params.toString() ? '?' + params.toString() : ''}`;
                    const response = await fetch(url);

                    if (!response.ok) {
                        console.error('[API-V2] Fetch tickets failed:', response.status);
                        return;
                    }

                    const result = await response.json();

                    if (result.success && result.data) {
                        // Transform to Firebase-compatible format
                        const tickets = result.data.map(ticket => ({
                            ...ticket,
                            firebaseId: ticket.ticket_code,
                            ticketCode: ticket.ticket_code,
                            orderId: ticket.order_id,
                            tposId: ticket.tpos_order_id,
                            trackingCode: ticket.tracking_code,
                            customer: ticket.customer_name,
                            originalCod: ticket.original_cod,
                            newCod: ticket.new_cod,
                            money: ticket.refund_amount,
                            fixReason: ticket.fix_cod_reason,
                            fixCodReason: ticket.fix_cod_reason,
                            boomReason: ticket.boom_reason,
                            note: ticket.internal_note,
                            virtualCreditId: ticket.virtual_credit_id,
                            virtual_credit_id: ticket.virtual_credit_id,
                            virtualCredit: ticket.virtual_credit_amount ? {
                                amount: ticket.virtual_credit_amount,
                                status: 'ACTIVE'
                            } : null,
                            returnFromOrderId: ticket.return_from_order_id,
                            returnFromTposId: ticket.return_from_tpos_id,
                            createdAt: new Date(ticket.created_at).getTime(),
                            updatedAt: ticket.updated_at ? new Date(ticket.updated_at).getTime() : null,
                            completedAt: ticket.completed_at ? new Date(ticket.completed_at).getTime() : null
                        }));

                        tickets.sort((a, b) => b.createdAt - a.createdAt);
                        callback(tickets);
                    }
                } catch (error) {
                    console.error('[API-V2] Subscribe to tickets error:', error);
                }
            };

            // Initial fetch
            fetchTickets();

            // Use SSE for realtime updates instead of polling
            // Connect directly to Render.com to avoid Cloudflare Worker timeout
            const sseUrl = `${this.RENDER_SSE_URL}/api/realtime/sse?keys=tickets`;
            console.log('[API-SSE] Connecting to SSE:', sseUrl);
            eventSource = new EventSource(sseUrl);

            eventSource.addEventListener('connected', (event) => {
                console.log('[API-SSE] Connected to SSE server');
            });

            eventSource.addEventListener('created', (event) => {
                try {
                    const { data } = JSON.parse(event.data);
                    console.log('[API-SSE] Ticket created:', data);
                    fetchTickets();
                } catch (e) {
                    console.error('[API-SSE] Error parsing created event:', e);
                }
            });

            eventSource.addEventListener('update', (event) => {
                try {
                    const { data } = JSON.parse(event.data);
                    console.log('[API-SSE] Ticket updated:', data);
                    fetchTickets();
                } catch (e) {
                    console.error('[API-SSE] Error parsing update event:', e);
                }
            });

            eventSource.addEventListener('deleted', (event) => {
                try {
                    const { data } = JSON.parse(event.data);
                    console.log('[API-SSE] Ticket deleted:', data);
                    fetchTickets();
                } catch (e) {
                    console.error('[API-SSE] Error parsing deleted event:', e);
                }
            });

            eventSource.onerror = (error) => {
                console.error('[API-SSE] SSE connection error:', error);
                // EventSource will auto-reconnect
            };

            // Return unsubscribe function
            return () => {
                isActive = false;
                if (eventSource) {
                    eventSource.close();
                    console.log('[API-SSE] Disconnected from SSE');
                }
                console.log('[API-V2] Unsubscribed from tickets');
            };
        }

        // Fallback to Firebase (legacy)
        const ref = getTicketsRef();
        const listener = ref.on('value', (snapshot) => {
            const data = snapshot.val();
            const tickets = [];
            if (data) {
                Object.keys(data).forEach(key => {
                    tickets.push({ ...data[key], firebaseId: key });
                });
            }
            tickets.sort((a, b) => b.createdAt - a.createdAt);
            callback(tickets);
        });

        return () => ref.off('value', listener);
    },

    /**
     * Perform action on ticket (receive_goods, settle, complete, cancel)
     * @param {string} ticketCode - Ticket code (TV-YYYY-NNNNN)
     * @param {string} action - Action name
     * @param {Object} options - { note, performed_by }
     */
    async ticketAction(ticketCode, action, options = {}) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${ticketCode}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    note: options.note,
                    performed_by: options.performed_by || 'system'
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to perform ticket action');
            }
            const result = await response.json();
            console.log('[API-V2] Ticket action:', ticketCode, action);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Ticket action failed:', error);
            throw error;
        }
    },

    /**
     * Get ticket statistics
     */
    async getTicketStats() {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/stats`);
            if (!response.ok) {
                throw new Error(`Failed to fetch ticket stats: ${response.status}`);
            }
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[API-V2] Get ticket stats failed:', error);
            throw error;
        }
    },

    /**
     * Get single ticket by code
     * @param {string} ticketCode - Ticket code (TV-YYYY-NNNNN) or Firebase ID
     */
    async getTicket(ticketCode) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${ticketCode}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Failed to fetch ticket: ${response.status}`);
            }
            const result = await response.json();

            // Transform to Firebase-compatible format
            const ticket = result.data;
            return {
                ...ticket,
                firebaseId: ticket.ticket_code,
                ticketCode: ticket.ticket_code,
                orderId: ticket.order_id,
                tposId: ticket.tpos_order_id,
                trackingCode: ticket.tracking_code,
                customer: ticket.customer_name,
                originalCod: ticket.original_cod,
                newCod: ticket.new_cod,
                money: ticket.refund_amount,
                fixReason: ticket.fix_cod_reason,
                note: ticket.internal_note,
                createdAt: new Date(ticket.created_at).getTime()
            };
        } catch (error) {
            console.error('[API-V2] Get ticket failed:', error);
            throw error;
        }
    },

    /**
     * Check if a ticket can be deleted
     * @param {string} ticketId - Ticket code or ID
     */
    async canDeleteTicket(ticketId) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${ticketId}/can-delete`);
            if (!response.ok) {
                throw new Error(`Failed to check can-delete: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API-V2] Can delete ticket check failed:', error);
            throw error;
        }
    },

    /**
     * Resolve ticket with optional compensation
     * @param {string} ticketId - Ticket code or ID
     * @param {Object} resolveData - Resolution data
     */
    async resolveTicket(ticketId, resolveData) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${ticketId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resolveData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to resolve ticket');
            }
            return await response.json();
        } catch (error) {
            console.error('[API-V2] Resolve ticket failed:', error);
            throw error;
        }
    },

    /**
     * Issue virtual credit for ticket (RETURN_SHIPPER)
     * @param {string} ticketId - Ticket code or ID
     * @param {Object} creditData - { amount, expiry_days, note }
     */
    async resolveTicketCredit(ticketId, creditData) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/tickets/${ticketId}/resolve-credit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creditData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to resolve ticket credit');
            }
            return await response.json();
        } catch (error) {
            console.error('[API-V2] Resolve ticket credit failed:', error);
            throw error;
        }
    },

    // =====================================================
    // TPOS REFUND METHODS
    // =====================================================

    /**
     * Process refund (Nhận hàng) - TPOS Refund Flow
     * Flow: ActionRefund -> Get Details -> Filter OrderLines (partial) -> PUT with SaveAndPrint -> ActionInvoiceOpenV2 -> PrintRefund
     * @param {number} originalOrderId - ID của đơn hàng gốc (tposId)
     * @param {Array} productsToRefund - Danh sách sản phẩm cần hoàn (với returnQuantity)
     *        Nếu null/empty, hoàn TẤT CẢ sản phẩm (full order refund)
     * @param {Function} onProgress - Callback for progress updates (step, message)
     * @returns {Promise<{refundOrderId: number, printHtml: string}>}
     */
    async processRefund(originalOrderId, productsToRefund = null, onProgress = null) {
        if (!originalOrderId) {
            throw new Error('Missing original order ID');
        }

        // Handle legacy calls: if productsToRefund is a function, it's actually onProgress
        if (typeof productsToRefund === 'function') {
            onProgress = productsToRefund;
            productsToRefund = null;
        }

        // Helper to call progress callback
        const reportProgress = (step, message) => {
            if (onProgress && typeof onProgress === 'function') {
                onProgress(step, message);
            }
        };

        console.log('[API] Starting refund process for order:', originalOrderId);

        // ========== FETCH 1: Create Refund Order ==========
        console.log('[API] Step 1: ActionRefund');
        reportProgress(1, 'Tạo phiếu hoàn...');
        const refundResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.ActionRefund`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ id: originalOrderId })
            }
        );

        if (!refundResponse.ok) {
            const errorText = await refundResponse.text();
            console.error('[API] ActionRefund failed:', errorText);
            throw new Error(`ActionRefund failed: ${refundResponse.status}`);
        }

        const refundData = await refundResponse.json();
        const refundOrderId = refundData.value;
        console.log('[API] Refund order created with ID:', refundOrderId);

        // ========== FETCH 2: Get Refund Order Details ==========
        console.log('[API] Step 2: Get refund order details');
        reportProgress(2, 'Lấy chi tiết phiếu hoàn...');
        const expand = 'Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,OfferAmountDetails,DestConvertCurrencyUnit,PackageImages';

        const detailsResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${refundOrderId})?$expand=${encodeURIComponent(expand)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
            }
        );

        if (!detailsResponse.ok) {
            const errorText = await detailsResponse.text();
            console.error('[API] Get refund details failed:', errorText);
            throw new Error(`Get refund details failed: ${detailsResponse.status}`);
        }

        const refundDetails = await detailsResponse.json();
        console.log('[API] Refund order details loaded');

        // ========== STEP 2.5: Filter OrderLines for Partial Refund ==========
        if (productsToRefund && Array.isArray(productsToRefund) && productsToRefund.length > 0) {
            console.log('[API] Step 2.5: Filtering OrderLines for partial refund');
            console.log('[API] Products to refund:', productsToRefund);

            const originalOrderLines = refundDetails.OrderLines || [];
            console.log('[API] Original OrderLines count:', originalOrderLines.length);

            console.log('[API] Products to match:', productsToRefund.map(p => ({
                id: p.id,
                productId: p.productId,
                code: p.code
            })));
            originalOrderLines.forEach(line => {
                console.log('[API] OrderLine:', {
                    Id: line.Id,
                    ProductId: line.ProductId,
                    ProductBarcode: line.ProductBarcode,
                    ProductName: line.ProductName
                });
            });

            // Filter and update quantities based on productsToRefund
            const filteredOrderLines = originalOrderLines.filter(line => {
                const productMatch = productsToRefund.find(p => {
                    const pId = parseInt(p.productId || p.id);
                    const pCode = p.code || '';
                    const lineProductId = parseInt(line.ProductId);
                    const lineBarcode = line.ProductBarcode || '';

                    const matchById = pId && lineProductId && pId === lineProductId;
                    const matchByCode = pCode && lineBarcode && pCode === lineBarcode;

                    if (matchById || matchByCode) {
                        console.log(`[API] Matched: pId=${pId}, pCode=${pCode}, lineProductId=${lineProductId}, lineBarcode=${lineBarcode}`);
                    }

                    return matchById || matchByCode;
                });

                if (productMatch) {
                    if (productMatch.returnQuantity && productMatch.returnQuantity > 0) {
                        console.log(`[API] Updating line ${line.ProductBarcode}: qty ${line.ProductUOMQty} -> ${productMatch.returnQuantity}`);
                        line.ProductUOMQty = productMatch.returnQuantity;
                        line.PriceTotal = line.PriceUnit * line.ProductUOMQty;
                        line.PriceSubTotal = line.PriceTotal;
                    }
                    return true;
                }
                console.log(`[API] Excluding line ${line.ProductBarcode} - not in products to refund`);
                return false;
            });

            console.log('[API] Filtered OrderLines count:', filteredOrderLines.length);

            refundDetails.OrderLines = filteredOrderLines;

            const newTotalQuantity = filteredOrderLines.reduce((sum, line) => sum + line.ProductUOMQty, 0);
            const newAmountTotal = filteredOrderLines.reduce((sum, line) => sum + (line.PriceUnit * line.ProductUOMQty), 0);

            refundDetails.TotalQuantity = newTotalQuantity;
            refundDetails.AmountTotal = newAmountTotal;
            refundDetails.AmountUntaxed = newAmountTotal;
            refundDetails.AmountTotalSigned = -newAmountTotal;

            console.log('[API] Recalculated totals - Qty:', newTotalQuantity, 'Amount:', newAmountTotal);
        }

        // ========== FETCH 3: PUT Update with FormAction: SaveAndPrint ==========
        console.log('[API] Step 3: PUT update with SaveAndPrint');
        reportProgress(3, 'Lưu phiếu hoàn...');

        const updatePayload = this._prepareRefundUpdatePayload(refundDetails);

        const updateResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder(${refundOrderId})`,
            {
                method: 'PUT',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify(updatePayload)
            }
        );

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('[API] PUT update failed:', errorText);
            throw new Error(`PUT update failed: ${updateResponse.status}`);
        }

        const updateResult = await updateResponse.json();
        console.log('[API] Refund order updated successfully');

        // ========== FETCH 4: ActionInvoiceOpenV2 - Confirm the order ==========
        console.log('[API] Step 4: ActionInvoiceOpenV2');
        reportProgress(4, 'Xác nhận phiếu hoàn...');

        const confirmResponse = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/FastSaleOrder/ODataService.ActionInvoiceOpenV2`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ ids: [refundOrderId] })
            }
        );

        if (!confirmResponse.ok) {
            const errorText = await confirmResponse.text();
            console.error('[API] ActionInvoiceOpenV2 failed:', errorText);
            throw new Error(`ActionInvoiceOpenV2 failed: ${confirmResponse.status}`);
        }

        const confirmResult = await confirmResponse.json();
        console.log('[API] Refund order confirmed');

        // ========== FETCH 5: Print Refund - Get HTML bill ==========
        console.log('[API] Step 5: PrintRefund');
        reportProgress(5, 'Lấy phiếu in...');

        const TPOS_DIRECT_URL = 'https://tomato.tpos.vn';
        const printUrl = `${TPOS_DIRECT_URL}/fastsaleorder/PrintRefund/${refundOrderId}`;

        console.log('[API] PrintRefund URL:', printUrl);

        const token = await window.tokenManager.getToken();

        const printResponse = await fetch(printUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!printResponse.ok) {
            const errorText = await printResponse.text();
            console.error('[API] PrintRefund failed:', errorText);
            throw new Error(`PrintRefund failed: ${printResponse.status}`);
        }

        const printHtml = await printResponse.text();
        console.log('[API] Print HTML received, length:', printHtml.length);

        // ========== Extract "Tổng tiền" from HTML for validation ==========
        let refundAmountFromHtml = null;
        try {
            const totalMatch = printHtml.match(/Tổng tiền:.*?<td[^>]*class="text-right"[^>]*>([0-9.,]+)<\/td>/is);
            if (totalMatch && totalMatch[1]) {
                const amountStr = totalMatch[1].replace(/\./g, '').replace(/,/g, '');
                refundAmountFromHtml = parseInt(amountStr, 10);
                console.log('[API] Extracted refund amount from HTML:', refundAmountFromHtml);
            } else {
                console.warn('[API] Could not extract Tổng tiền from HTML');
            }
        } catch (parseError) {
            console.error('[API] Error parsing refund amount from HTML:', parseError);
        }

        return {
            refundOrderId: refundOrderId,
            printHtml: printHtml,
            confirmResult: confirmResult,
            refundAmountFromHtml: refundAmountFromHtml
        };
    },

    /**
     * Prepare payload for refund order PUT update
     * @private
     */
    _prepareRefundUpdatePayload(details) {
        const payload = {
            Id: details.Id,
            Name: details.Name,
            PrintShipCount: details.PrintShipCount,
            PrintDeliveryCount: details.PrintDeliveryCount,
            PaymentMessageCount: details.PaymentMessageCount,
            MessageCount: details.MessageCount,
            PartnerId: details.PartnerId,
            PartnerDisplayName: details.PartnerDisplayName,
            PartnerEmail: details.PartnerEmail,
            PartnerFacebookId: details.PartnerFacebookId,
            PartnerFacebook: details.PartnerFacebook,
            PartnerPhone: details.PartnerPhone,
            Reference: details.Reference,
            PriceListId: details.PriceListId,
            AmountTotal: details.AmountTotal,
            TotalQuantity: details.TotalQuantity,
            Discount: details.Discount,
            DiscountAmount: details.DiscountAmount,
            DecreaseAmount: details.DecreaseAmount,
            DiscountLoyaltyTotal: details.DiscountLoyaltyTotal,
            WeightTotal: details.WeightTotal,
            AmountTax: details.AmountTax,
            AmountUntaxed: details.AmountUntaxed,
            TaxId: details.TaxId,
            MoveId: details.MoveId,
            UserId: details.UserId,
            UserName: details.UserName,
            DateInvoice: details.DateInvoice,
            DateCreated: details.DateCreated,
            CreatedById: details.CreatedById,
            State: details.State,
            ShowState: details.ShowState,
            CompanyId: details.CompanyId,
            Comment: details.Comment,
            WarehouseId: details.WarehouseId,
            SaleOnlineIds: details.SaleOnlineIds || [],
            SaleOnlineNames: details.SaleOnlineNames || [],
            Residual: details.Residual,
            Type: details.Type,
            RefundOrderId: details.RefundOrderId,
            ReferenceNumber: details.ReferenceNumber,
            AccountId: details.AccountId,
            JournalId: details.JournalId,
            Number: details.Number,
            MoveName: details.MoveName,
            PartnerNameNoSign: details.PartnerNameNoSign,
            DeliveryPrice: details.DeliveryPrice,
            CustomerDeliveryPrice: details.CustomerDeliveryPrice,
            CarrierId: details.CarrierId,
            CarrierName: details.CarrierName,
            CarrierDeliveryType: details.CarrierDeliveryType,
            DeliveryNote: details.DeliveryNote,
            ReceiverName: details.ReceiverName,
            ReceiverPhone: details.ReceiverPhone,
            ReceiverAddress: details.ReceiverAddress,
            ReceiverDate: details.ReceiverDate,
            ReceiverNote: details.ReceiverNote,
            CashOnDelivery: details.CashOnDelivery || 0,
            TrackingRef: details.TrackingRef,
            TrackingArea: details.TrackingArea,
            TrackingTransport: details.TrackingTransport,
            TrackingSortLine: details.TrackingSortLine,
            TrackingUrl: details.TrackingUrl || '',
            IsProductDefault: details.IsProductDefault,
            TrackingRefSort: details.TrackingRefSort,
            ShipStatus: details.ShipStatus,
            ShowShipStatus: details.ShowShipStatus,
            SaleOnlineName: details.SaleOnlineName || '',
            PartnerShippingId: details.PartnerShippingId,
            PaymentJournalId: details.PaymentJournalId,
            PaymentAmount: details.PaymentAmount,
            SaleOrderId: details.SaleOrderId,
            SaleOrderIds: details.SaleOrderIds || [],
            FacebookName: details.FacebookName,
            FacebookNameNosign: details.FacebookNameNosign,
            FacebookId: details.FacebookId,
            DisplayFacebookName: details.DisplayFacebookName,
            Deliver: details.Deliver,
            ShipWeight: details.ShipWeight,
            ShipPaymentStatus: details.ShipPaymentStatus,
            ShipPaymentStatusCode: details.ShipPaymentStatusCode,
            OldCredit: details.OldCredit,
            NewCredit: details.NewCredit,
            Phone: details.Phone,
            Address: details.Address,
            AmountTotalSigned: details.AmountTotalSigned,
            ResidualSigned: details.ResidualSigned,
            Origin: details.Origin,
            AmountDeposit: details.AmountDeposit,
            CompanyName: details.CompanyName,
            PreviousBalance: details.PreviousBalance,
            ToPay: details.ToPay,
            NotModifyPriceFromSO: details.NotModifyPriceFromSO,
            Ship_ServiceId: details.Ship_ServiceId,
            Ship_ServiceName: details.Ship_ServiceName,
            Ship_ServiceExtrasText: details.Ship_ServiceExtrasText || '[]',
            Ship_ExtrasText: details.Ship_ExtrasText,
            Ship_InsuranceFee: details.Ship_InsuranceFee,
            CurrencyName: details.CurrencyName,
            TeamId: details.TeamId,
            TeamOrderCode: details.TeamOrderCode,
            TeamOrderId: details.TeamOrderId,
            TeamType: details.TeamType,
            Revenue: details.Revenue,
            SaleOrderDeposit: details.SaleOrderDeposit,
            Seri: details.Seri,
            NumberOrder: details.NumberOrder,
            DateOrderRed: details.DateOrderRed,
            ApplyPromotion: details.ApplyPromotion,
            TimeLock: details.TimeLock,
            PageName: details.PageName,
            Tags: details.Tags,
            IRAttachmentUrl: details.IRAttachmentUrl,
            IRAttachmentUrls: details.IRAttachmentUrls || [],
            SaleOnlinesOfPartner: details.SaleOnlinesOfPartner,
            IsDeposited: details.IsDeposited,
            LiveCampaignName: details.LiveCampaignName,
            LiveCampaignId: details.LiveCampaignId,
            Source: details.Source,
            PartnerExtraInfoHeight: details.PartnerExtraInfoHeight,
            PartnerExtraInfoWeight: details.PartnerExtraInfoWeight,
            CartNote: details.CartNote,
            ExtraPaymentAmount: details.ExtraPaymentAmount,
            QuantityUpdateDeposit: details.QuantityUpdateDeposit,
            IsMergeCancel: details.IsMergeCancel,
            IsPickUpAtShop: details.IsPickUpAtShop,
            DateDeposit: details.DateDeposit,
            IsRefund: details.IsRefund,
            StateCode: details.StateCode,
            ActualPaymentAmount: details.ActualPaymentAmount,
            RowVersion: details.RowVersion,
            ExchangeRate: details.ExchangeRate,
            DestConvertCurrencyUnitId: details.DestConvertCurrencyUnitId,
            WiPointQRCode: details.WiPointQRCode,
            WiInvoiceId: details.WiInvoiceId,
            WiInvoiceChannelId: details.WiInvoiceChannelId,
            WiInvoiceStatus: details.WiInvoiceStatus,
            WiInvoiceTrackingUrl: details.WiInvoiceTrackingUrl || '',
            WiInvoiceIsReplate: details.WiInvoiceIsReplate,
            FormAction: 'SaveAndPrint',
            Ship_Receiver: details.Ship_Receiver,
            Ship_Extras: details.Ship_Extras,
            PaymentInfo: details.PaymentInfo || [],
            Search: details.Search,
            ShipmentDetailsAship: details.ShipmentDetailsAship || { PackageInfo: { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 } },
            OrderMergeds: details.OrderMergeds || [],
            OrderAfterMerged: details.OrderAfterMerged,
            TPayment: details.TPayment,
            ExtraUpdateCODCarriers: details.ExtraUpdateCODCarriers || [],
            AppliedPromotionLoyalty: details.AppliedPromotionLoyalty,
            FastSaleOrderOmniExtras: details.FastSaleOrderOmniExtras,
            Billing: details.Billing,
            PackageInfo: details.PackageInfo || { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 },
            Error: details.Error,
            Partner: details.Partner,
            User: details.User,
            Warehouse: details.Warehouse,
            Company: details.Company,
            PriceList: details.PriceList,
            RefundOrder: details.RefundOrder,
            Account: details.Account,
            Journal: details.Journal,
            PaymentJournal: details.PaymentJournal,
            Carrier: details.Carrier,
            Tax: details.Tax,
            SaleOrder: details.SaleOrder,
            HistoryDeliveryDetails: details.HistoryDeliveryDetails || [],
            OrderLines: details.OrderLines || [],
            Ship_ServiceExtras: details.Ship_ServiceExtras || [],
            OutstandingInfo: details.OutstandingInfo,
            Team: details.Team,
            OfferAmountDetails: details.OfferAmountDetails || [],
            DestConvertCurrencyUnit: details.DestConvertCurrencyUnit,
            PackageImages: details.PackageImages || []
        };

        return payload;
    },

    // =====================================================
    // CUSTOMER 360° API METHODS (V2)
    // =====================================================

    /**
     * Get Customer 360° view (full profile with wallet, tickets, activities)
     * @param {string} phone - Customer phone number
     * @returns {Promise<Object>} Customer 360° data
     */
    async getCustomer360(phone) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/customers/${phone}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Failed to fetch customer: ${response.status}`);
            }
            const result = await response.json();
            console.log('[API-V2] Customer 360 loaded:', phone);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Get Customer 360 failed:', error);
            throw error;
        }
    },

    /**
     * Get quick customer info for modals
     * @param {string} phone - Customer phone number
     */
    async getCustomerQuickView(phone) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/customers/${phone}/quick-view`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Failed to fetch customer quick-view: ${response.status}`);
            }
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[API-V2] Get customer quick-view failed:', error);
            throw error;
        }
    },

    /**
     * Create or update customer
     * @param {Object} customerData - { phone, name, email, address, status, tags }
     */
    async upsertCustomer(customerData) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customerData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create customer');
            }
            const result = await response.json();
            console.log('[API-V2] Customer upserted:', customerData.phone);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Upsert customer failed:', error);
            throw error;
        }
    },

    /**
     * Search customers
     * @param {string} query - Search query (phone or name)
     * @param {number} page - Page number (unused, kept for backwards compat)
     * @param {number} limit - Results limit
     * @param {Object} options - { searchType, status }
     */
    async searchCustomers(query, page = 1, limit = 50, options = {}) {
        return fetchJson(`${this.RENDER_API_URL}/v2/customers/search`, {
            method: 'POST',
            body: JSON.stringify({
                query,
                limit,
                search_type: options.searchType || '',
                status: options.status || ''
            })
        });
    },

    /**
     * Get recently active customers
     * @param {number} page
     * @param {number} limit
     */
    async getRecentCustomers(page = 1, limit = 20) {
        return fetchJson(`${this.RENDER_API_URL}/v2/customers/recent?page=${page}&limit=${limit}`);
    },

    /**
     * Add note to customer
     * @param {string} phone
     * @param {string} content
     * @param {Object} options - { category, is_pinned, created_by }
     */
    async addCustomerNote(phone, content, options = {}) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/customers/${phone}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    category: options.category || 'general',
                    is_pinned: options.is_pinned || false,
                    created_by: options.created_by || 'system'
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add note');
            }
            const result = await response.json();
            console.log('[API-V2] Customer note added:', phone);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Add customer note failed:', error);
            throw error;
        }
    },

    /**
     * Get consolidated activity feed (all customers)
     * @param {number} page
     * @param {number} limit
     * @param {Object} filters - { startDate, endDate, type, phone, query }
     */
    async getConsolidatedTransactions(page = 1, limit = 10, filters = {}) {
        const queryParams = new URLSearchParams({ page, limit, ...filters }).toString();
        return fetchJson(`${this.RENDER_API_URL}/v2/analytics/activity-feed?${queryParams}`);
    },

    // =====================================================
    // WALLET API METHODS (V2)
    // =====================================================

    /**
     * Get wallet info with active virtual credits
     * @param {string} phone - Customer phone number
     */
    async getWallet(phone) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/${phone}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch wallet: ${response.status}`);
            }
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[API-V2] Get wallet failed:', error);
            throw error;
        }
    },

    /**
     * Deposit to wallet (real balance)
     * @param {string} phone
     * @param {number} amount
     * @param {Object} options - { source, reference_id, note, created_by }
     */
    async walletDeposit(phone, amount, options = {}) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/${phone}/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount,
                    source: options.source || 'MANUAL_ADJUSTMENT',
                    reference_id: options.reference_id,
                    note: options.note,
                    created_by: options.created_by || 'system'
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to deposit');
            }
            const result = await response.json();
            console.log('[API-V2] Wallet deposit:', phone, amount);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Wallet deposit failed:', error);
            throw error;
        }
    },

    /**
     * Withdraw from wallet (uses FIFO virtual credits first)
     * @param {string} phone
     * @param {number} amount
     * @param {string} orderId
     * @param {string} note
     */
    async walletWithdraw(phone, amount, orderId, note) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/${phone}/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, order_id: orderId, note })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to withdraw');
            }
            const result = await response.json();
            console.log('[API-V2] Wallet withdraw:', phone, amount);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Wallet withdraw failed:', error);
            throw error;
        }
    },

    /**
     * Issue virtual credit
     * @param {string} phone
     * @param {number} amount
     * @param {Object} options - { source_type, source_id, expiry_days, note, created_by }
     */
    async issueVirtualCredit(phone, amount, options = {}) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/${phone}/credit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount,
                    source_type: options.source_type || 'RETURN_SHIPPER',
                    source_id: options.source_id,
                    expiry_days: options.expiry_days || 15,
                    note: options.note,
                    created_by: options.created_by || 'system'
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to issue virtual credit');
            }
            const result = await response.json();
            console.log('[API-V2] Virtual credit issued:', phone, amount);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Issue virtual credit failed:', error);
            throw error;
        }
    },

    /**
     * Get wallet summary for multiple phones (batch)
     * @param {Array<string>} phones
     */
    async getWalletBatch(phones) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/batch-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones })
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch wallet batch: ${response.status}`);
            }
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[API-V2] Get wallet batch failed:', error);
            throw error;
        }
    },

    /**
     * Log a customer activity
     * @param {string} phone - Customer phone number
     * @param {Object} activityData - { activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by }
     */
    async logCustomerActivity(phone, activityData) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/customers/${phone}/activities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activityData)
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `Failed to log activity: ${response.status}`);
            }
            const result = await response.json();
            console.log('[API-V2] Activity logged:', phone, activityData.activity_type);
            return result.data;
        } catch (error) {
            console.error('[API-V2] Log activity failed:', error);
            // Non-critical: don't throw, just log
        }
    },

    /**
     * Refund wallet when order is cancelled
     * @param {string} orderId - Order ID/Number
     * @param {string} phone - Customer phone
     * @param {string} reason - Cancellation reason
     * @param {string} createdBy - Who cancelled the order
     */
    async walletRefundByOrder(orderId, phone, reason, createdBy) {
        try {
            const response = await fetch(`${this.RENDER_API_URL}/v2/wallets/refund-by-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    phone,
                    reason,
                    created_by: createdBy
                })
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `Failed to refund wallet: ${response.status}`);
            }
            const result = await response.json();
            console.log('[API-V2] Wallet refund result:', result);
            return result;
        } catch (error) {
            console.error('[API-V2] Wallet refund failed:', error);
            throw error;
        }
    },

    // =====================================================
    // BALANCE HISTORY API METHODS (V2)
    // =====================================================

    /**
     * Get unlinked bank transactions
     * @param {number} page
     * @param {number} limit
     */
    async getUnlinkedBankTransactions(page = 1, limit = 10) {
        return fetchJson(`${this.RENDER_API_URL}/v2/balance-history?linked=false&page=${page}&limit=${limit}`);
    },

    /**
     * Get count of unlinked bank transactions
     */
    async getUnlinkedTransactionsCount() {
        try {
            const response = await fetchJson(`${this.RENDER_API_URL}/v2/balance-history?linked=false&page=1&limit=1`);
            return {
                success: response.success,
                count: response.pagination?.total || response.data?.length || 0
            };
        } catch (error) {
            console.error('[API] getUnlinkedTransactionsCount failed:', error);
            return { success: false, count: 0 };
        }
    },

    // =====================================================
    // TPOS PARTNER (CUSTOMER) METHODS
    // =====================================================

    /**
     * Create a new customer (Partner) on TPOS
     * @param {Object} data - { name, phone, street }
     * @returns {Promise<Object>} Created partner data from TPOS
     */
    async createPartner({ name, phone, street }) {
        const companyId = window.ShopConfig ? window.ShopConfig.getConfig().CompanyId : 1;
        const now = new Date().toISOString();

        const payload = {
            Id: 0,
            Name: name,
            DisplayName: null,
            Street: street || null,
            Phone: phone,
            Customer: true,
            Supplier: false,
            IsCompany: false,
            Active: true,
            Employee: false,
            CompanyId: companyId,
            Type: "contact",
            CompanyType: "person",
            Credit: 0,
            Debit: 0,
            CreditLimit: 0,
            OverCredit: false,
            Discount: 0,
            AmountDiscount: 0,
            CategoryId: 0,
            DateCreated: now,
            Status: "Normal",
            StatusText: "Bình thường",
            Source: "Default",
            IsNewAddress: false,
            Ward_District_City: "",
            ExtraAddress: {
                Street: street || "",
                City: {},
                District: {},
                Ward: {}
            },
            City: {},
            District: {},
            Ward: {},
            AccountPayable: {
                Id: 4, Name: "Phải trả người bán", Code: "331",
                UserTypeId: 2, UserTypeName: "Payable", Active: true,
                CompanyId: companyId, InternalType: "payable",
                NameGet: "331 Phải trả người bán", Reconcile: true
            },
            AccountReceivable: {
                Id: 1, Name: "Phải thu của khách hàng", Code: "131",
                UserTypeId: 1, UserTypeName: "Receivable", Active: true,
                CompanyId: companyId, InternalType: "receivable",
                NameGet: "131 Phải thu của khách hàng", Reconcile: true
            },
            StockCustomer: {
                Id: 9, Usage: "customer", ScrapLocation: false,
                Name: "Khách hàng", CompleteName: "Địa điểm đối tác / Khách hàng",
                ParentLocationId: 2, Active: true, ParentLeft: 13,
                ShowUsage: "Địa điểm khách hàng",
                NameGet: "Địa điểm đối tác/Khách hàng"
            },
            StockSupplier: {
                Id: 8, Usage: "supplier", ScrapLocation: false,
                Name: "Nhà cung cấp", CompleteName: "Địa điểm đối tác / Nhà cung cấp",
                ParentLocationId: 2, Active: true, ParentLeft: 15,
                ShowUsage: "Địa điểm nhà cung cấp",
                NameGet: "Địa điểm đối tác/Nhà cung cấp"
            }
        };

        console.log('[API] Creating TPOS Partner:', { name, phone, street, companyId });

        const response = await window.tokenManager.authenticatedFetch(
            `${API_CONFIG.TPOS_ODATA}/Partner`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8',
                    'feature-version': '2'
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API] Create Partner failed:', errorText);
            throw new Error(`Tạo khách hàng thất bại: ${response.status}`);
        }

        const result = await response.json();
        console.log('[API] Partner created:', result.Id, result.Name);
        return result;
    },

    /**
     * Link a bank transaction to a customer
     * @param {number} transaction_id
     * @param {string} phone
     * @param {boolean} auto_deposit
     */
    async linkBankTransaction(transaction_id, phone, auto_deposit = true) {
        return fetchJson(`${this.RENDER_API_URL}/v2/balance-history/${transaction_id}/link`, {
            method: 'POST',
            body: JSON.stringify({ phone, auto_deposit })
        });
    }
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function fetchJson(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.error || errorData.message || `API error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Service Error:', error);
        throw error;
    }
}

// Helper to get Firebase tickets reference (for legacy mode)
function getTicketsRef() {
    if (typeof firebase !== 'undefined') {
        return firebase.database().ref('issue_tracking/tickets');
    }
    return null;
}

// Expose to global scope for ES module wrappers (customer-hub, issue-tracking)
window.ApiService = ApiService;
