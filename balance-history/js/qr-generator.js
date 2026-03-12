// =====================================================
// QR CODE GENERATOR FOR BANK TRANSFERS
// =====================================================

/**
 * QR Generator for VietQR bank transfers
 * Supports generating QR codes for ACB bank transfers with unique transaction codes
 */

const QRGenerator = {
    // Bank configuration
    BANK_CONFIG: {
        ACB: {
            bin: '970416',
            name: 'ACB',
            accountNo: '75918',
            accountName: 'LAI THUY YEN NHI'
        }
    },

    /**
     * Generate a unique transaction code
     * Format: N2 + 16 characters (total 18 chars) - Base36 encoded for uniqueness
     * Example: "N2ABCD1234EFGH5678" (18 characters fixed length)
     *
     * @param {string} prefix - Optional prefix for the code (default: "N2")
     * @returns {string} Unique transaction code (always 18 characters)
     */
    generateUniqueCode(prefix = 'N2') {
        // Get timestamp and limit to last 8 characters for consistency
        const timestamp = Date.now().toString(36).toUpperCase().slice(-8); // 8 chars
        const random = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
        const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0'); // 2 chars (36^2 = 1296)

        return `${prefix}${timestamp}${random}${sequence}`; // N2 (2) + 8 + 6 + 2 = 18 chars
    },

    /**
     * Generate VietQR URL for bank transfer
     *
     * @param {Object} options - QR code options
     * @param {string} options.uniqueCode - Unique transaction code
     * @param {number} options.amount - Transfer amount (optional, 0 = user fills in)
     * @param {string} options.template - QR template (compact, compact2, print, qr_only)
     * @returns {string} VietQR image URL
     */
    generateVietQRUrl(options = {}) {
        const {
            uniqueCode,
            amount = 0,
            template = 'qr_only' // Changed from compact2 to hide account number
        } = options;

        const bank = this.BANK_CONFIG.ACB;
        const baseUrl = 'https://img.vietqr.io/image';

        // Build URL: {BANK_BIN}-{ACCOUNT_NO}-{TEMPLATE}.png
        let url = `${baseUrl}/${bank.bin}-${bank.accountNo}-${template}.png`;

        // Add query parameters
        const params = new URLSearchParams();
        if (amount > 0) {
            params.append('amount', amount);
        }
        params.append('addInfo', uniqueCode);
        params.append('accountName', bank.accountName);

        return `${url}?${params.toString()}`;
    },

    /**
     * Generate QR code data for a new deposit
     *
     * @param {number} amount - Transfer amount (optional)
     * @returns {Object} QR code data with unique code and URL
     */
    generateDepositQR(amount = 0) {
        const uniqueCode = this.generateUniqueCode();
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });

        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName
            },
            amount,
            createdAt: new Date().toISOString()
        };
    },

    /**
     * Generate QR code from existing unique code
     *
     * @param {string} uniqueCode - Existing unique transaction code
     * @param {number} amount - Transfer amount (optional)
     * @returns {Object} QR code data
     */
    regenerateQR(uniqueCode, amount = 0) {
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });

        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName
            },
            amount
        };
    },

    /**
     * Copy QR code URL to clipboard
     *
     * @param {string} qrUrl - QR code URL to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyQRUrl(qrUrl) {
        try {
            await navigator.clipboard.writeText(qrUrl);
            return true;
        } catch (error) {
            console.error('Failed to copy QR URL:', error);
            // Fallback method
            try {
                const textarea = document.createElement('textarea');
                textarea.value = qrUrl;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (fallbackError) {
                console.error('Fallback copy also failed:', fallbackError);
                return false;
            }
        }
    },

    /**
     * Copy unique code to clipboard
     *
     * @param {string} uniqueCode - Unique code to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyUniqueCode(uniqueCode) {
        try {
            await navigator.clipboard.writeText(uniqueCode);
            return true;
        } catch (error) {
            console.error('Failed to copy unique code:', error);
            return false;
        }
    },

    /**
     * Download QR code image
     *
     * @param {string} qrUrl - QR code URL
     * @param {string} filename - Download filename
     */
    async downloadQRImage(qrUrl, filename = 'qr-code.png') {
        try {
            const response = await fetch(qrUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            console.error('Failed to download QR image:', error);
            return false;
        }
    },

    /**
     * Create QR code HTML element
     *
     * @param {string} qrUrl - QR code URL
     * @param {Object} options - Display options
     * @returns {string} HTML string
     */
    createQRHtml(qrUrl, options = {}) {
        const {
            width = '200px',
            showCopyButton = true,
            uniqueCode = ''
        } = options;

        return `
            <div class="qr-code-container" style="text-align: center;">
                <img src="${qrUrl}" alt="QR Code" style="width: ${width}; max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                ${showCopyButton ? `
                    <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center;">
                        <button class="btn btn-sm btn-secondary copy-qr-btn" data-qr-url="${qrUrl}">
                            <i data-lucide="copy"></i> Copy URL
                        </button>
                        ${uniqueCode ? `
                            <button class="btn btn-sm btn-secondary copy-code-btn" data-code="${uniqueCode}">
                                <i data-lucide="hash"></i> Copy Mã
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }
};

// Make QRGenerator globally available
window.QRGenerator = QRGenerator;
