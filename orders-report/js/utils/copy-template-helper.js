/**
 * Copy Template Helper
 * Quản lý việc copy mẫu "Chốt đơn" vào clipboard và paste vào chat input
 */

(function () {
    'use strict';

    const CHOTDON_TEMPLATE_ID = 10;
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';

    /**
     * Format số tiền VNĐ
     */
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    /**
     * Parse discount price from product note
     * Patterns supported:
     * - 100, 200, 250 - số đứng một mình (giá sale tính bằng nghìn đồng)
     * - 100k, 200k, 250k - số + k (giá sale tính bằng nghìn đồng)
     * @param {string} note - Product note
     * @returns {Object|null} - { discountPrice: number, displayText: string, remainingNote: string } or null
     */
    function parseDiscountPrice(note) {
        if (!note || typeof note !== 'string') return null;

        const trimmedNote = note.trim();
        if (!trimmedNote) return null;

        // Pattern 1: number followed by k (e.g., 100k, 150k)
        const kPattern = /^(\d+)k\b\s*(.*)/i;
        // Pattern 2: number alone at the start (e.g., 100, 150)
        const numPattern = /^(\d+)\b\s*(.*)/;

        let match = null;
        let priceValue = null;
        let remainingNote = '';

        // Try k pattern first (more specific)
        match = trimmedNote.match(kPattern);
        if (match) {
            priceValue = parseInt(match[1], 10);
            remainingNote = match[2] ? match[2].trim() : '';
        }

        // Try number pattern
        if (!priceValue) {
            match = trimmedNote.match(numPattern);
            if (match) {
                priceValue = parseInt(match[1], 10);
                remainingNote = match[2] ? match[2].trim() : '';
            }
        }

        if (priceValue && priceValue > 0) {
            // Convert to full price (thousands)
            const discountPrice = priceValue * 1000;
            return {
                discountPrice: discountPrice,
                displayText: priceValue.toString(), // e.g., "150" for display
                remainingNote: remainingNote
            };
        }

        return null;
    }

    /**
     * Format a single product line for the template
     * @param {Object} product - Product data { name, quantity, price, total, note }
     * @returns {Object} - { line: string, hasDiscount: boolean, discountData: object|null }
     */
    function formatProductLine(product) {
        const discountInfo = parseDiscountPrice(product.note);

        if (discountInfo) {
            // Product has discount
            // Calculate discount amount per item
            const originalPricePerItem = product.price;
            const discountPricePerItem = discountInfo.discountPrice;
            const discountPerItem = originalPricePerItem - discountPricePerItem;
            const totalDiscount = discountPerItem * product.quantity;

            // Format: "- ProductName x11 = 1.980.000 ₫\n  📝Sale 150"
            const productLine = `- ${product.name} x${product.quantity} = ${formatCurrency(product.total)}`;

            // Build sale line with remaining note if exists
            let saleLine = `  📝Sale ${discountInfo.displayText}`;
            if (discountInfo.remainingNote) {
                saleLine += ` (${discountInfo.remainingNote})`;
            }

            return {
                line: productLine + '\n' + saleLine,
                hasDiscount: true,
                discountData: {
                    originalTotal: product.total,
                    discountPricePerItem: discountPricePerItem,
                    discountPerItem: discountPerItem,
                    totalDiscount: totalDiscount,
                    finalTotal: product.total - totalDiscount
                }
            };
        } else {
            // No discount - show note in parentheses (original behavior)
            const noteText = product.note ? ` (${product.note})` : '';
            return {
                line: `- ${product.name} x${product.quantity} = ${formatCurrency(product.total)}${noteText}`,
                hasDiscount: false,
                discountData: null
            };
        }
    }

    /**
     * Convert fullOrderData (từ API) sang format dùng cho replacePlaceholders
     */
    function convertOrderData(fullOrderData) {
        if (!fullOrderData) return null;

        // Map products (only non-held products) and calculate totals dynamically
        const products = (fullOrderData.Details || [])
            .filter(detail => !detail.IsHeld)  // Only include confirmed products, not held
            .map(detail => ({
                name: detail.ProductNameGet || detail.ProductName || 'Sản phẩm',
                quantity: detail.Quantity || 1,
                price: detail.Price || 0,
                total: (detail.Quantity || 1) * (detail.Price || 0),
                note: detail.Note || ''  // Thêm ghi chú sản phẩm
            }));

        // Calculate totalAmount from products (not from stored TotalAmount which may be stale)
        const calculatedTotal = products.reduce((sum, p) => sum + p.total, 0);

        return {
            code: fullOrderData.Code || '',
            customerName: fullOrderData.Partner?.Name || fullOrderData.Name || '',
            phone: fullOrderData.Partner?.Telephone || fullOrderData.Telephone || '',
            address: fullOrderData.Partner?.Address || fullOrderData.Address || '',
            totalAmount: calculatedTotal,
            products: products
        };
    }

    /**
     * Replace placeholders trong template với data thật
     */
    function replacePlaceholders(content, orderData) {
        let result = content;

        // {partner.name}
        if (orderData.customerName && orderData.customerName.trim()) {
            result = result.replace(/{partner\.name}/g, orderData.customerName);
        } else {
            result = result.replace(/{partner\.name}/g, '(Khách hàng)');
        }

        // {partner.address} - kèm SĐT
        if (orderData.address && orderData.address.trim()) {
            const phone = orderData.phone && orderData.phone.trim() ? orderData.phone : '';
            const addressWithPhone = phone ? `${orderData.address} - SĐT: ${phone}` : orderData.address;
            result = result.replace(/{partner\.address}/g, addressWithPhone);
        } else {
            result = result.replace(/"\{partner\.address\}"/g, '(Chưa có địa chỉ)');
            result = result.replace(/\{partner\.address\}/g, '(Chưa có địa chỉ)');
        }

        // {partner.phone}
        if (orderData.phone && orderData.phone.trim()) {
            result = result.replace(/{partner\.phone}/g, orderData.phone);
        } else {
            result = result.replace(/{partner\.phone}/g, '(Chưa có SĐT)');
        }

        // {order.details} - danh sách sản phẩm + tổng tiền + ghi chú (with discount support)
        if (orderData.products && Array.isArray(orderData.products) && orderData.products.length > 0) {
            // Process all products and collect discount info
            let totalDiscountAmount = 0;
            let hasAnyDiscount = false;

            const formattedProducts = orderData.products.map(p => {
                const formatted = formatProductLine(p);
                if (formatted.hasDiscount && formatted.discountData) {
                    hasAnyDiscount = true;
                    totalDiscountAmount += formatted.discountData.totalDiscount;
                }
                return formatted;
            });

            const productList = formattedProducts.map(fp => fp.line).join('\n');

            // Format total section based on whether discounts exist
            let totalSection;
            if (hasAnyDiscount) {
                const originalTotal = orderData.totalAmount;
                const finalTotal = originalTotal - totalDiscountAmount;

                totalSection = [
                    `Tổng : ${formatCurrency(originalTotal)}`,
                    `Giảm giá: ${formatCurrency(totalDiscountAmount)}`,
                    `Tổng tiền: ${formatCurrency(finalTotal)}`
                ].join('\n');
            } else {
                totalSection = `Tổng tiền: ${formatCurrency(orderData.totalAmount)}`;
            }

            const productListWithTotal = `${productList}\n\n${totalSection}`;
            result = result.replace(/{order\.details}/g, productListWithTotal);
        } else {
            result = result.replace(/{order\.details}/g, '(Chưa có sản phẩm)');
        }

        // {order.code}
        if (orderData.code && orderData.code.trim()) {
            result = result.replace(/{order\.code}/g, orderData.code);
        } else {
            result = result.replace(/{order\.code}/g, '(Không có mã)');
        }

        // {order.total}
        if (orderData.totalAmount) {
            result = result.replace(/{order\.total}/g, formatCurrency(orderData.totalAmount));
        } else {
            result = result.replace(/{order\.total}/g, '0đ');
        }

        return result;
    }

    /**
     * Copy text vào clipboard
     */
    async function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('[CopyTemplate] Clipboard API failed, using fallback:', err);
                return fallbackCopyToClipboard(text);
            }
        } else {
            return fallbackCopyToClipboard(text);
        }
    }

    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (err) {
            console.error('[CopyTemplate] Fallback copy failed:', err);
            document.body.removeChild(textArea);
            return false;
        }
    }

    /**
     * Hiện toast notification
     */
    function showToast(message, type = 'success') {
        // Remove existing toast
        const existingToast = document.querySelector('.copy-template-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'copy-template-toast';
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100001;
            animation: toastSlideUp 0.3s ease;
        `;

        // Add animation style if not exists
        if (!document.getElementById('copy-template-toast-style')) {
            const style = document.createElement('style');
            style.id = 'copy-template-toast-style';
            style.textContent = `
                @keyframes toastSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto remove after 2.5s
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /**
     * Load template "Chốt đơn" từ API
     */
    async function loadChotDonTemplate() {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `${API_BASE}/MailTemplate(${CHOTDON_TEMPLATE_ID})`;

            const response = await fetch(apiUrl, { headers });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const template = await response.json();
            return template;
        } catch (error) {
            console.error('[CopyTemplate] Failed to load template:', error);
            throw error;
        }
    }

    /**
     * Main function: Copy mẫu chốt đơn vào clipboard và paste vào input
     */
    window.copyOrderTemplate = async function () {
        try {
            // Check if order data exists
            const fullOrderData = window.currentChatOrderData;
            if (!fullOrderData) {
                showToast('Không có thông tin đơn hàng', 'error');
                return;
            }

            // Load template
            const template = await loadChotDonTemplate();
            if (!template || !template.BodyPlain) {
                showToast('Không tìm thấy mẫu chốt đơn', 'error');
                return;
            }

            // Convert order data
            const orderData = convertOrderData(fullOrderData);

            // Replace placeholders
            let finalContent = replacePlaceholders(template.BodyPlain, orderData);

            // Add payment reminder before closing line
            const paymentReminder = 'Khách Thanh Toán Phương Thức Chuyển Khoản Hỗ Trợ Báo Trước Giúp Shop Ạ';
            const closingLine = 'Dạ c xem okee để e đi đơn cho mình c nhé 😍';
            finalContent = finalContent + '\n\n' + paymentReminder + '\n\n' + closingLine;

            // Copy to clipboard
            const copySuccess = await copyToClipboard(finalContent);

            // Paste to input
            const inputElement = document.getElementById('chatReplyInput');
            if (inputElement) {
                inputElement.value = finalContent;
                inputElement.focus();
                // Trigger input event for any listeners
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Show toast
            if (copySuccess) {
                showToast('Đã copy mẫu chốt đơn');
            } else {
                showToast('Đã paste mẫu (copy thất bại)', 'error');
            }

            console.log('[CopyTemplate] Template copied successfully');

        } catch (error) {
            console.error('[CopyTemplate] Error:', error);
            showToast('Lỗi khi copy mẫu: ' + error.message, 'error');
        }
    };

    console.log('[CopyTemplate] copy-template-helper.js loaded');

})();
