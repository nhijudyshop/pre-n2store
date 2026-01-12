// =====================================================
// BALANCE CALCULATOR - INVENTORY TRACKING
// Phase 2: Calculate remaining balance (Con Lai)
// =====================================================

/**
 * Calculate financial summary
 * CON LAI = Tong TT truoc - Tong Tien HD - Tong Chi phi hang ve - Tong Chi phi khac
 */
function calculateBalance() {
    const { shipments, prepayments, otherExpenses } = globalState;

    // Sum prepayments (positive)
    const totalPrepayment = prepayments.reduce((sum, p) => sum + (p.soTien || 0), 0);

    // Sum invoice totals (negative)
    const totalInvoice = shipments.reduce((sum, s) => sum + (s.tongTienHoaDon || 0), 0);

    // Sum shipping costs (negative)
    const totalShippingCost = shipments.reduce((sum, s) => sum + (s.tongChiPhi || 0), 0);

    // Sum other expenses (negative)
    const totalOtherExpense = otherExpenses.reduce((sum, e) => sum + (e.soTien || 0), 0);

    // Calculate remaining
    const remaining = totalPrepayment - totalInvoice - totalShippingCost - totalOtherExpense;

    return {
        totalPrepayment,
        totalInvoice,
        totalShippingCost,
        totalOtherExpense,
        remaining
    };
}

/**
 * Update balance display in UI
 */
function updateBalanceDisplay() {
    const balance = calculateBalance();

    // Update UI elements
    const elements = {
        totalPrepayment: document.getElementById('totalPrepayment'),
        totalInvoice: document.getElementById('totalInvoice'),
        totalShippingCost: document.getElementById('totalShippingCost'),
        totalOtherExpense: document.getElementById('totalOtherExpense'),
        totalRemaining: document.getElementById('totalRemaining')
    };

    if (elements.totalPrepayment) {
        elements.totalPrepayment.textContent = '+' + formatNumber(balance.totalPrepayment);
    }
    if (elements.totalInvoice) {
        elements.totalInvoice.textContent = '-' + formatNumber(balance.totalInvoice);
    }
    if (elements.totalShippingCost) {
        elements.totalShippingCost.textContent = '-' + formatNumber(balance.totalShippingCost);
    }
    if (elements.totalOtherExpense) {
        elements.totalOtherExpense.textContent = '-' + formatNumber(balance.totalOtherExpense);
    }
    if (elements.totalRemaining) {
        const prefix = balance.remaining >= 0 ? '+' : '';
        elements.totalRemaining.textContent = prefix + formatNumber(balance.remaining);
        elements.totalRemaining.className = 'summary-value ' + (balance.remaining >= 0 ? '' : 'negative');
    }

    return balance;
}

console.log('[BALANCE] Balance calculator initialized');
