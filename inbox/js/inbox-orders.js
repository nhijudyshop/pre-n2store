/* =====================================================
   INBOX ORDERS - Order creation form controller
   ===================================================== */

class InboxOrderController {
    constructor(dataManager) {
        this.data = dataManager;
        this.productIndex = 1;

        this.elements = {
            orderForm: document.getElementById('orderForm'),
            orderProductList: document.getElementById('orderProductList'),
            btnAddProduct: document.getElementById('btnAddProduct'),
            btnResetOrder: document.getElementById('btnResetOrder'),
            btnSubmitOrder: document.getElementById('btnSubmitOrder'),
            orderCustomerName: document.getElementById('orderCustomerName'),
            orderPhone: document.getElementById('orderPhone'),
            orderAddress: document.getElementById('orderAddress'),
            orderShippingFee: document.getElementById('orderShippingFee'),
            orderDiscount: document.getElementById('orderDiscount'),
            orderPaymentMethod: document.getElementById('orderPaymentMethod'),
            orderDeposit: document.getElementById('orderDeposit'),
            depositField: document.getElementById('depositField'),
            orderNote: document.getElementById('orderNote'),
            orderSubtotal: document.getElementById('orderSubtotal'),
            orderShipDisplay: document.getElementById('orderShipDisplay'),
            orderDiscountDisplay: document.getElementById('orderDiscountDisplay'),
            orderTotal: document.getElementById('orderTotal'),
        };
    }

    /**
     * Initialize order controller
     */
    init() {
        this.bindEvents();
        // Goong Places autocomplete cho địa chỉ
        if (typeof goongAttachAutocomplete === 'function') {
            goongAttachAutocomplete(this.elements.orderAddress);
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Add product
        this.elements.btnAddProduct.addEventListener('click', () => this.addProductRow());

        // Reset form
        this.elements.btnResetOrder.addEventListener('click', () => this.resetForm());

        // Submit form
        this.elements.orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitOrder();
        });

        // Payment method change
        this.elements.orderPaymentMethod.addEventListener('change', () => {
            this.elements.depositField.style.display =
                this.elements.orderPaymentMethod.value === 'partial' ? 'block' : 'none';
        });

        // Price/qty change -> update summary
        this.elements.orderProductList.addEventListener('input', (e) => {
            if (e.target.classList.contains('product-price') ||
                e.target.classList.contains('product-qty')) {
                this.updateOrderSummary();
            }
        });

        this.elements.orderShippingFee.addEventListener('input', () => this.updateOrderSummary());
        this.elements.orderDiscount.addEventListener('input', () => this.updateOrderSummary());
    }

    /**
     * Fill customer info from selected conversation
     */
    fillCustomerInfo(conv) {
        if (!conv) return;
        this.elements.orderCustomerName.value = conv.name || '';
        this.elements.orderPhone.value = conv.phone || '';
    }

    /**
     * Add a new product row to the form
     */
    addProductRow() {
        const index = this.productIndex++;
        const div = document.createElement('div');
        div.className = 'order-product-item';
        div.dataset.index = index;
        div.innerHTML = `
            <button type="button" class="btn-remove-product" onclick="window.inboxOrders.removeProductRow(${index})">&times;</button>
            <div class="order-field">
                <label>Tên SP</label>
                <input type="text" class="product-name" placeholder="Tên sản phẩm..." />
            </div>
            <div class="order-field-row">
                <div class="order-field">
                    <label>Phân Loại</label>
                    <input type="text" class="product-variant" placeholder="Màu/Size..." />
                </div>
                <div class="order-field">
                    <label>SL</label>
                    <input type="number" class="product-qty" value="1" min="1" />
                </div>
            </div>
            <div class="order-field">
                <label>Giá (VNĐ)</label>
                <input type="text" class="product-price" placeholder="0" />
            </div>
        `;
        this.elements.orderProductList.appendChild(div);

        // Reinitialize lucide icons if available
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Remove a product row
     */
    removeProductRow(index) {
        const row = this.elements.orderProductList.querySelector(`[data-index="${index}"]`);
        if (row) {
            row.remove();
            this.updateOrderSummary();
        }
    }

    /**
     * Parse a price string to number
     */
    parsePrice(value) {
        if (!value) return 0;
        return parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
    }

    /**
     * Format number as VND currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
    }

    /**
     * Update order summary calculations
     */
    updateOrderSummary() {
        let subtotal = 0;

        this.elements.orderProductList.querySelectorAll('.order-product-item').forEach(item => {
            const price = this.parsePrice(item.querySelector('.product-price')?.value);
            const qty = parseInt(item.querySelector('.product-qty')?.value, 10) || 1;
            subtotal += price * qty;
        });

        const shipping = this.parsePrice(this.elements.orderShippingFee.value);
        const discount = this.parsePrice(this.elements.orderDiscount.value);
        const total = subtotal + shipping - discount;

        this.elements.orderSubtotal.textContent = this.formatCurrency(subtotal);
        this.elements.orderShipDisplay.textContent = this.formatCurrency(shipping);
        this.elements.orderDiscountDisplay.textContent = '-' + this.formatCurrency(discount);
        this.elements.orderTotal.textContent = this.formatCurrency(Math.max(0, total));
    }

    /**
     * Collect all product data from the form
     */
    getProducts() {
        const products = [];
        this.elements.orderProductList.querySelectorAll('.order-product-item').forEach(item => {
            const name = item.querySelector('.product-name')?.value?.trim() || '';
            const variant = item.querySelector('.product-variant')?.value?.trim() || '';
            const qty = parseInt(item.querySelector('.product-qty')?.value, 10) || 1;
            const price = this.parsePrice(item.querySelector('.product-price')?.value);

            if (name) {
                products.push({ name, variant, qty, price });
            }
        });
        return products;
    }

    /**
     * Submit the order
     */
    submitOrder() {
        const customerName = this.elements.orderCustomerName.value.trim();
        const phone = this.elements.orderPhone.value.trim();
        const address = this.elements.orderAddress.value.trim();
        const products = this.getProducts();
        const shippingFee = this.parsePrice(this.elements.orderShippingFee.value);
        const discount = this.parsePrice(this.elements.orderDiscount.value);
        const paymentMethod = this.elements.orderPaymentMethod.value;
        const deposit = paymentMethod === 'partial' ? this.parsePrice(this.elements.orderDeposit.value) : 0;
        const note = this.elements.orderNote.value.trim();

        // Validation
        if (!customerName) {
            showToast('Vui lòng nhập tên khách hàng', 'warning');
            this.elements.orderCustomerName.focus();
            return;
        }

        if (!phone) {
            showToast('Vui lòng nhập số điện thoại', 'warning');
            this.elements.orderPhone.focus();
            return;
        }

        if (products.length === 0) {
            showToast('Vui lòng thêm ít nhất 1 sản phẩm', 'warning');
            return;
        }

        // Calculate total
        const subtotal = products.reduce((sum, p) => sum + p.price * p.qty, 0);
        const total = subtotal + shippingFee - discount;

        const orderData = {
            id: 'ORD-' + Date.now(),
            customerName,
            phone,
            address,
            products,
            shippingFee,
            discount,
            subtotal,
            total: Math.max(0, total),
            paymentMethod,
            deposit,
            note,
            status: 'pending',
            createdAt: new Date().toISOString(),
            conversationId: window.inboxChat?.activeConversationId || null,
        };

        // Save to localStorage
        this.saveOrder(orderData);

        showToast(`Đơn hàng ${orderData.id} đã được tạo thành công!`, 'success');

        // Reset form after success
        this.resetForm();
    }

    /**
     * Save order to localStorage
     */
    saveOrder(orderData) {
        try {
            const orders = JSON.parse(localStorage.getItem('inbox_orders') || '[]');
            orders.push(orderData);
            localStorage.setItem('inbox_orders', JSON.stringify(orders));
            console.log('[InboxOrders] Order saved:', orderData.id);
        } catch (e) {
            console.error('[InboxOrders] Save error:', e);
        }
    }

    /**
     * Reset the order form
     */
    resetForm() {
        this.elements.orderForm.reset();
        this.elements.depositField.style.display = 'none';

        // Reset product list to single empty row
        this.productIndex = 1;
        this.elements.orderProductList.innerHTML = `
            <div class="order-product-item" data-index="0">
                <div class="order-field">
                    <label>Tên SP</label>
                    <input type="text" class="product-name" placeholder="Tên sản phẩm..." />
                </div>
                <div class="order-field-row">
                    <div class="order-field">
                        <label>Phân Loại</label>
                        <input type="text" class="product-variant" placeholder="Màu/Size..." />
                    </div>
                    <div class="order-field">
                        <label>SL</label>
                        <input type="number" class="product-qty" value="1" min="1" />
                    </div>
                </div>
                <div class="order-field">
                    <label>Giá (VNĐ)</label>
                    <input type="text" class="product-price" placeholder="0" />
                </div>
            </div>
        `;

        // Reset summary
        this.elements.orderSubtotal.textContent = '0₫';
        this.elements.orderShipDisplay.textContent = '0₫';
        this.elements.orderDiscountDisplay.textContent = '-0₫';
        this.elements.orderTotal.textContent = '0₫';

        // Re-fill customer info if a conversation is selected
        if (window.inboxChat?.activeConversationId) {
            const conv = this.data.getConversation(window.inboxChat.activeConversationId);
            if (conv) this.fillCustomerInfo(conv);
        }
    }
}

// Export globally
window.InboxOrderController = InboxOrderController;
