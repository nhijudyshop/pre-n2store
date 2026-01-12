/**
 * PURCHASE ORDERS MODULE - VALIDATION UTILITIES
 * File: validation.js
 * Purpose: Order validation, error handling, business rules
 */

// ========================================
// VALIDATION MESSAGES - Vietnamese
// ========================================
const VALIDATION_MESSAGES = {
    // Supplier
    SUPPLIER_REQUIRED: 'Vui lòng chọn nhà cung cấp',
    SUPPLIER_CODE_REQUIRED: 'Mã nhà cung cấp không được để trống',
    SUPPLIER_NAME_REQUIRED: 'Tên nhà cung cấp không được để trống',

    // Items
    ITEMS_REQUIRED: 'Đơn hàng phải có ít nhất 1 sản phẩm',
    ITEMS_MAX_EXCEEDED: 'Đơn hàng không được quá 100 sản phẩm',
    PRODUCT_NAME_REQUIRED: 'Tên sản phẩm không được để trống',
    PRODUCT_CODE_REQUIRED: 'Mã sản phẩm không được để trống',
    PRODUCT_CODE_DUPLICATE: 'Mã sản phẩm bị trùng lặp',
    PRODUCT_IMAGES_REQUIRED: 'Vui lòng thêm ít nhất 1 hình ảnh sản phẩm',

    // Quantity
    QUANTITY_INVALID: 'Số lượng phải là số nguyên dương',
    QUANTITY_MIN: 'Số lượng tối thiểu là 1',
    QUANTITY_MAX: 'Số lượng tối đa là 9999',
    QUANTITY_REQUIRED: 'Vui lòng nhập số lượng',

    // Price
    PURCHASE_PRICE_INVALID: 'Giá mua không hợp lệ',
    PURCHASE_PRICE_NEGATIVE: 'Giá mua không được âm',
    PURCHASE_PRICE_MIN: 'Giá mua tối thiểu là 1.000đ',
    PURCHASE_PRICE_REQUIRED: 'Vui lòng nhập giá mua',
    SELLING_PRICE_INVALID: 'Giá bán không hợp lệ',
    SELLING_PRICE_NEGATIVE: 'Giá bán không được âm',
    SELLING_PRICE_REQUIRED: 'Vui lòng nhập giá bán',
    SELLING_PRICE_LESS_THAN_PURCHASE: 'Giá bán phải lớn hơn giá mua',
    MARGIN_TOO_LOW: 'Lợi nhuận phải tối thiểu 10.000đ',

    // Status
    STATUS_TRANSITION_INVALID: 'Không thể chuyển sang trạng thái này',
    ORDER_COMPLETED_READONLY: 'Không thể sửa đơn đã hoàn thành',
    ORDER_CANCELLED_READONLY: 'Không thể sửa đơn đã hủy',
    DELETE_COMPLETED_FORBIDDEN: 'Không thể xóa đơn đã hoàn thành',
    DELETE_CANCELLED_ALLOWED: 'Đơn đã hủy có thể được xóa',

    // Financial
    INVOICE_AMOUNT_INVALID: 'Số tiền hóa đơn không hợp lệ',
    DISCOUNT_INVALID: 'Giảm giá không hợp lệ',
    DISCOUNT_TOO_HIGH: 'Giảm giá không được vượt quá tổng tiền',
    SHIPPING_FEE_INVALID: 'Phí vận chuyển không hợp lệ',

    // Date
    ORDER_DATE_REQUIRED: 'Vui lòng chọn ngày đặt hàng',
    ORDER_DATE_INVALID: 'Ngày đặt hàng không hợp lệ',
    ORDER_DATE_FUTURE: 'Ngày đặt hàng không được trong tương lai',

    // General
    ORDER_NOT_FOUND: 'Đơn hàng không tồn tại',
    SAVE_FAILED: 'Không thể lưu đơn hàng. Vui lòng thử lại.',
    DELETE_FAILED: 'Không thể xóa đơn hàng. Vui lòng thử lại.',
    NETWORK_ERROR: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    UNKNOWN_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'
};

// ========================================
// ERROR CLASSES
// ========================================

/**
 * Base service exception
 */
class ServiceException extends Error {
    constructor(code, userMessage) {
        super(userMessage);
        this.name = 'ServiceException';
        this.code = code;
        this.userMessage = userMessage;
    }
}

/**
 * Validation exception with multiple errors
 */
class ValidationException extends Error {
    constructor(errors) {
        super('Validation failed');
        this.name = 'ValidationException';
        this.errors = errors || [];
    }

    /**
     * Get first error message
     * @returns {string}
     */
    getFirstErrorMessage() {
        if (this.errors.length > 0) {
            return this.errors[0].message;
        }
        return VALIDATION_MESSAGES.UNKNOWN_ERROR;
    }

    /**
     * Get errors by field
     * @param {string} field - Field name
     * @returns {Array}
     */
    getErrorsForField(field) {
        return this.errors.filter(e => e.field === field);
    }

    /**
     * Check if field has error
     * @param {string} field - Field name
     * @returns {boolean}
     */
    hasErrorForField(field) {
        return this.errors.some(e => e.field === field || e.field.startsWith(field + '['));
    }
}

/**
 * Network exception
 */
class NetworkException extends Error {
    constructor() {
        super('Network error');
        this.name = 'NetworkException';
        this.userMessage = VALIDATION_MESSAGES.NETWORK_ERROR;
    }
}

// ========================================
// VALIDATION FUNCTIONS
// ========================================

/**
 * Create a validation error object
 * @param {string} field - Field name
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {Object}
 */
function createValidationError(field, code, message) {
    return { field, code, message };
}

/**
 * Validate supplier data
 * @param {Object|null} supplier - Supplier snapshot
 * @returns {Array} Array of validation errors
 */
function validateSupplier(supplier) {
    const errors = [];

    if (!supplier) {
        errors.push(createValidationError('supplier', 'SUPPLIER_REQUIRED', VALIDATION_MESSAGES.SUPPLIER_REQUIRED));
        return errors;
    }

    if (!supplier.code || !supplier.code.trim()) {
        errors.push(createValidationError('supplier.code', 'SUPPLIER_CODE_REQUIRED', VALIDATION_MESSAGES.SUPPLIER_CODE_REQUIRED));
    }

    if (!supplier.name || !supplier.name.trim()) {
        errors.push(createValidationError('supplier.name', 'SUPPLIER_NAME_REQUIRED', VALIDATION_MESSAGES.SUPPLIER_NAME_REQUIRED));
    }

    return errors;
}

/**
 * Validate single order item
 * @param {Object} item - Order item
 * @param {number} index - Item index
 * @returns {Array} Array of validation errors
 */
function validateOrderItem(item, index) {
    const errors = [];
    const fieldPrefix = `items[${index}]`;

    // Product name
    if (!item.productName || !item.productName.trim()) {
        errors.push(createValidationError(
            `${fieldPrefix}.productName`,
            'PRODUCT_NAME_REQUIRED',
            VALIDATION_MESSAGES.PRODUCT_NAME_REQUIRED
        ));
    }

    // Quantity
    if (item.quantity === null || item.quantity === undefined) {
        errors.push(createValidationError(
            `${fieldPrefix}.quantity`,
            'QUANTITY_REQUIRED',
            VALIDATION_MESSAGES.QUANTITY_REQUIRED
        ));
    } else if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(createValidationError(
            `${fieldPrefix}.quantity`,
            'QUANTITY_MIN',
            VALIDATION_MESSAGES.QUANTITY_MIN
        ));
    } else if (item.quantity > 9999) {
        errors.push(createValidationError(
            `${fieldPrefix}.quantity`,
            'QUANTITY_MAX',
            VALIDATION_MESSAGES.QUANTITY_MAX
        ));
    }

    // Purchase price
    if (item.purchasePrice === null || item.purchasePrice === undefined) {
        errors.push(createValidationError(
            `${fieldPrefix}.purchasePrice`,
            'PURCHASE_PRICE_REQUIRED',
            VALIDATION_MESSAGES.PURCHASE_PRICE_REQUIRED
        ));
    } else if (typeof item.purchasePrice !== 'number' || isNaN(item.purchasePrice)) {
        errors.push(createValidationError(
            `${fieldPrefix}.purchasePrice`,
            'PURCHASE_PRICE_INVALID',
            VALIDATION_MESSAGES.PURCHASE_PRICE_INVALID
        ));
    } else if (item.purchasePrice < 0) {
        errors.push(createValidationError(
            `${fieldPrefix}.purchasePrice`,
            'PURCHASE_PRICE_NEGATIVE',
            VALIDATION_MESSAGES.PURCHASE_PRICE_NEGATIVE
        ));
    }

    // Selling price
    if (item.sellingPrice === null || item.sellingPrice === undefined) {
        errors.push(createValidationError(
            `${fieldPrefix}.sellingPrice`,
            'SELLING_PRICE_REQUIRED',
            VALIDATION_MESSAGES.SELLING_PRICE_REQUIRED
        ));
    } else if (typeof item.sellingPrice !== 'number' || isNaN(item.sellingPrice)) {
        errors.push(createValidationError(
            `${fieldPrefix}.sellingPrice`,
            'SELLING_PRICE_INVALID',
            VALIDATION_MESSAGES.SELLING_PRICE_INVALID
        ));
    } else if (item.sellingPrice < 0) {
        errors.push(createValidationError(
            `${fieldPrefix}.sellingPrice`,
            'SELLING_PRICE_NEGATIVE',
            VALIDATION_MESSAGES.SELLING_PRICE_NEGATIVE
        ));
    } else if (item.purchasePrice && item.sellingPrice <= item.purchasePrice) {
        errors.push(createValidationError(
            `${fieldPrefix}.sellingPrice`,
            'SELLING_PRICE_LESS_THAN_PURCHASE',
            VALIDATION_MESSAGES.SELLING_PRICE_LESS_THAN_PURCHASE
        ));
    }

    return errors;
}

/**
 * Validate all order items
 * @param {Array} items - Array of order items
 * @returns {Array} Array of validation errors
 */
function validateOrderItems(items) {
    const errors = [];

    // Check if items exist
    if (!items || !Array.isArray(items) || items.length === 0) {
        errors.push(createValidationError('items', 'ITEMS_REQUIRED', VALIDATION_MESSAGES.ITEMS_REQUIRED));
        return errors;
    }

    // Check max items
    if (items.length > 100) {
        errors.push(createValidationError('items', 'ITEMS_MAX_EXCEEDED', VALIDATION_MESSAGES.ITEMS_MAX_EXCEEDED));
    }

    // Validate each item
    items.forEach((item, index) => {
        const itemErrors = validateOrderItem(item, index);
        errors.push(...itemErrors);
    });

    // Check for duplicate product codes (within same variant)
    const codeVariantMap = new Map();
    items.forEach((item, index) => {
        if (item.productCode) {
            const key = `${item.productCode}_${item.variant || ''}`;
            if (codeVariantMap.has(key)) {
                errors.push(createValidationError(
                    `items[${index}].productCode`,
                    'PRODUCT_CODE_DUPLICATE',
                    `${VALIDATION_MESSAGES.PRODUCT_CODE_DUPLICATE}: ${item.productCode}`
                ));
            } else {
                codeVariantMap.set(key, index);
            }
        }
    });

    return errors;
}

/**
 * Validate financial fields
 * @param {Object} order - Order data
 * @returns {Array} Array of validation errors
 */
function validateFinancials(order) {
    const errors = [];

    // Invoice amount
    if (order.invoiceAmount !== undefined && order.invoiceAmount !== null) {
        if (typeof order.invoiceAmount !== 'number' || isNaN(order.invoiceAmount) || order.invoiceAmount < 0) {
            errors.push(createValidationError('invoiceAmount', 'INVOICE_AMOUNT_INVALID', VALIDATION_MESSAGES.INVOICE_AMOUNT_INVALID));
        }
    }

    // Discount
    if (order.discountAmount !== undefined && order.discountAmount !== null) {
        if (typeof order.discountAmount !== 'number' || isNaN(order.discountAmount) || order.discountAmount < 0) {
            errors.push(createValidationError('discountAmount', 'DISCOUNT_INVALID', VALIDATION_MESSAGES.DISCOUNT_INVALID));
        } else if (order.totalAmount && order.discountAmount > order.totalAmount) {
            errors.push(createValidationError('discountAmount', 'DISCOUNT_TOO_HIGH', VALIDATION_MESSAGES.DISCOUNT_TOO_HIGH));
        }
    }

    // Shipping fee
    if (order.shippingFee !== undefined && order.shippingFee !== null) {
        if (typeof order.shippingFee !== 'number' || isNaN(order.shippingFee) || order.shippingFee < 0) {
            errors.push(createValidationError('shippingFee', 'SHIPPING_FEE_INVALID', VALIDATION_MESSAGES.SHIPPING_FEE_INVALID));
        }
    }

    return errors;
}

/**
 * Validate order date
 * @param {Date|Object} orderDate - Order date
 * @returns {Array} Array of validation errors
 */
function validateOrderDate(orderDate) {
    const errors = [];

    if (!orderDate) {
        errors.push(createValidationError('orderDate', 'ORDER_DATE_REQUIRED', VALIDATION_MESSAGES.ORDER_DATE_REQUIRED));
        return errors;
    }

    // Handle Firestore Timestamp
    let date = orderDate;
    if (orderDate.toDate) {
        date = orderDate.toDate();
    }

    if (!(date instanceof Date) || isNaN(date.getTime())) {
        errors.push(createValidationError('orderDate', 'ORDER_DATE_INVALID', VALIDATION_MESSAGES.ORDER_DATE_INVALID));
        return errors;
    }

    // Check if date is in the future (more than 1 day ahead)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    if (date > tomorrow) {
        errors.push(createValidationError('orderDate', 'ORDER_DATE_FUTURE', VALIDATION_MESSAGES.ORDER_DATE_FUTURE));
    }

    return errors;
}

/**
 * Validate entire order
 * @param {Object} order - Full order data
 * @param {Object} options - Validation options
 * @returns {Object} { isValid: boolean, errors: Array }
 */
function validateOrder(order, options = {}) {
    const errors = [];
    const { skipSupplier = false, skipItems = false, skipFinancials = false } = options;

    // Supplier validation
    if (!skipSupplier) {
        const supplierErrors = validateSupplier(order.supplier);
        errors.push(...supplierErrors);
    }

    // Items validation
    if (!skipItems) {
        const itemErrors = validateOrderItems(order.items);
        errors.push(...itemErrors);
    }

    // Financial validation
    if (!skipFinancials) {
        const financialErrors = validateFinancials(order);
        errors.push(...financialErrors);
    }

    // Order date validation
    if (order.orderDate !== undefined) {
        const dateErrors = validateOrderDate(order.orderDate);
        errors.push(...dateErrors);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate status transition
 * @param {string} currentStatus - Current order status
 * @param {string} newStatus - Target status
 * @returns {Object} { isValid: boolean, error: string|null }
 */
function validateStatusTransition(currentStatus, newStatus) {
    const config = window.PurchaseOrderConfig;

    if (!config.canTransition(currentStatus, newStatus)) {
        const fromLabel = config.STATUS_LABELS[currentStatus] || currentStatus;
        const toLabel = config.STATUS_LABELS[newStatus] || newStatus;
        return {
            isValid: false,
            error: `Không thể chuyển từ "${fromLabel}" sang "${toLabel}"`
        };
    }

    return { isValid: true, error: null };
}

/**
 * Validate order can be edited
 * @param {Object} order - Order data
 * @returns {Object} { canEdit: boolean, error: string|null }
 */
function validateCanEdit(order) {
    const config = window.PurchaseOrderConfig;

    if (!config.canEditOrder(order.status)) {
        if (order.status === config.OrderStatus.COMPLETED) {
            return { canEdit: false, error: VALIDATION_MESSAGES.ORDER_COMPLETED_READONLY };
        }
        if (order.status === config.OrderStatus.CANCELLED) {
            return { canEdit: false, error: VALIDATION_MESSAGES.ORDER_CANCELLED_READONLY };
        }
    }

    return { canEdit: true, error: null };
}

/**
 * Validate order can be deleted
 * Only DRAFT and CANCELLED orders can be deleted
 * @param {Object} order - Order data
 * @returns {Object} { canDelete: boolean, error: string|null }
 */
function validateCanDelete(order) {
    const config = window.PurchaseOrderConfig;

    if (!config.canDeleteOrder(order.status)) {
        const statusLabel = config.STATUS_LABELS[order.status] || order.status;
        return {
            canDelete: false,
            error: `Không thể xóa đơn hàng ở trạng thái "${statusLabel}". Chỉ có thể xóa đơn Nháp hoặc Đã hủy.`
        };
    }

    return { canDelete: true, error: null };
}

// ========================================
// UI HELPER FUNCTIONS
// ========================================

/**
 * Display validation errors in UI
 * @param {Array} errors - Array of validation errors
 * @param {HTMLElement} container - Container element to show errors
 */
function displayValidationErrors(errors, container) {
    if (!container) return;

    // Clear previous errors
    container.innerHTML = '';

    if (!errors || errors.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const errorList = document.createElement('ul');
    errorList.className = 'validation-error-list';

    errors.forEach(error => {
        const li = document.createElement('li');
        li.className = 'validation-error-item';
        li.textContent = error.message;
        errorList.appendChild(li);
    });

    container.appendChild(errorList);
}

/**
 * Mark form field as invalid
 * @param {string} fieldName - Field name
 * @param {string} errorMessage - Error message
 */
function markFieldInvalid(fieldName, errorMessage) {
    const field = document.querySelector(`[name="${fieldName}"], #${fieldName}`);
    if (!field) return;

    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');

    // Find or create error message element
    let errorEl = field.nextElementSibling;
    if (!errorEl || !errorEl.classList.contains('field-error')) {
        errorEl = document.createElement('div');
        errorEl.className = 'field-error';
        field.parentNode.insertBefore(errorEl, field.nextSibling);
    }

    errorEl.textContent = errorMessage;
}

/**
 * Clear field validation state
 * @param {string} fieldName - Field name
 */
function clearFieldValidation(fieldName) {
    const field = document.querySelector(`[name="${fieldName}"], #${fieldName}`);
    if (!field) return;

    field.classList.remove('is-invalid');
    field.removeAttribute('aria-invalid');

    const errorEl = field.nextElementSibling;
    if (errorEl && errorEl.classList.contains('field-error')) {
        errorEl.remove();
    }
}

/**
 * Clear all validation errors
 * @param {HTMLElement} form - Form element
 */
function clearAllValidation(form) {
    if (!form) return;

    // Remove invalid class from all fields
    form.querySelectorAll('.is-invalid').forEach(field => {
        field.classList.remove('is-invalid');
        field.removeAttribute('aria-invalid');
    });

    // Remove all error messages
    form.querySelectorAll('.field-error').forEach(el => el.remove());

    // Hide error summary
    const errorSummary = form.querySelector('.validation-errors');
    if (errorSummary) {
        errorSummary.style.display = 'none';
        errorSummary.innerHTML = '';
    }
}

// ========================================
// EXPORT TO GLOBAL SCOPE
// ========================================
window.PurchaseOrderValidation = {
    // Messages
    VALIDATION_MESSAGES,

    // Error Classes
    ServiceException,
    ValidationException,
    NetworkException,

    // Validation Functions
    createValidationError,
    validateSupplier,
    validateOrderItem,
    validateOrderItems,
    validateFinancials,
    validateOrderDate,
    validateOrder,
    validateStatusTransition,
    validateCanEdit,
    validateCanDelete,

    // UI Helpers
    displayValidationErrors,
    markFieldInvalid,
    clearFieldValidation,
    clearAllValidation
};

console.log('[Purchase Orders] Validation utilities loaded successfully');
