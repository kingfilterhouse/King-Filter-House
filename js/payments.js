(function() {
/* ==========================================
   MODULE SCOPE: Payment Tracking Module
   Handles adding, editing, and managing payments for sales and purchases
   ========================================== */

/* ==========================================
   JS START: Payment Management Module
   ========================================== */

// ===== STATE =====
let currentTransactionId = null;
let currentTransactionType = null; // 'sale' or 'purchase'
let currentTransactionData = null;
let paymentsData = [];

// ===== HELPERS =====
// Use centralized formatter
const fmt = window.Utils.fmt;

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('en-US', dateOptions) + ' at ' + date.toLocaleTimeString('en-US', timeOptions);
}

// ===== LOAD PAYMENTS FOR TRANSACTION =====
async function loadPayments(transactionId, transactionType) {
    try {
        window.log('🔄 Loading payments for:', transactionType, transactionId);
        
        const result = await window.StorageModule.supabase
            .from('payments')
            .select('*')
            .eq('transaction_id', transactionId)
            .eq('transaction_type', transactionType)
            .order('payment_date', { ascending: true });

        if (result.error) throw result.error;
        
        paymentsData = result.data || [];
        window.log('✅ Loaded', paymentsData.length, 'payments');
        return paymentsData;
    } catch (error) {
        logError('❌ Error loading payments:', error);
        return [];
    }
}

// ===== OPEN PAYMENT MANAGEMENT MODAL =====
window.openPaymentManagement = async function(transactionId, transactionType, transactionData) {
    try {
        window.log('💳 Opening payment management for:', transactionType, transactionId);
        
        currentTransactionId = transactionId;
        currentTransactionType = transactionType;
        currentTransactionData = transactionData;

        // Load payments
        await loadPayments(transactionId, transactionType);

        // Render payment modal
        renderPaymentModal();

        // Show modal
        const paymentModal = document.getElementById('payment-management-modal');
        if (paymentModal) {
            paymentModal.classList.add('active');
        }
    } catch (error) {
        logError('❌ Error opening payment management:', error);
        showNotification('Error opening payment management', 'error');
    }
};

// ===== RENDER PAYMENT MODAL =====
function renderPaymentModal() {
    const paymentModalContent = document.getElementById('payment-modal-content');
    if (!paymentModalContent) return;

    // Calculate payment summary
    const total = currentTransactionData.total || 0;
    const totalPaid = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remaining = Math.max(0, total - totalPaid);
    
    const isFullyPaid = remaining === 0 && totalPaid > 0;
    const isPartiallyPaid = totalPaid > 0 && remaining > 0;
    const isUnpaid = totalPaid === 0;

    let statusBadge = '';
    if (isFullyPaid) {
        statusBadge = '<span class="payment-badge paid">PAID</span>';
    } else if (isPartiallyPaid) {
        statusBadge = '<span class="payment-badge partial">PARTIAL</span>';
    } else {
        statusBadge = '<span class="payment-badge unpaid">UNPAID</span>';
    }

    paymentModalContent.innerHTML = `
        <div class="payment-summary-card">
            <div class="payment-summary-header">
                <div>
                    <h3 class="payment-summary-title">
                        ${currentTransactionType === 'sale' ? '💰' : '🛒'} 
                        ${currentTransactionType === 'sale' ? 'Sale' : 'Purchase'} Payment Summary
                    </h3>
                    <div class="payment-summary-subtitle">
                        ${currentTransactionData.invoice_id || currentTransactionData.purchase_id || 'N/A'}
                    </div>
                </div>
                ${statusBadge}
            </div>
            
            <div class="payment-summary-grid">
                <div class="payment-summary-item">
                    <span class="payment-summary-label">Total Amount:</span>
                    <span class="payment-summary-value">${fmt(total)}</span>
                </div>
                <div class="payment-summary-item">
                    <span class="payment-summary-label">Total Paid:</span>
                    <span class="payment-summary-value success">${fmt(totalPaid)}</span>
                </div>
                <div class="payment-summary-item highlight">
                    <span class="payment-summary-label">Remaining:</span>
                    <span class="payment-summary-value ${remaining > 0 ? 'warning' : 'success'}">${fmt(remaining)}</span>
                </div>
            </div>
        </div>

        <div class="payments-list-section">
            <div class="payments-list-header">
                <h4 class="payments-list-title">📋 Payment History (${paymentsData.length})</h4>
                <button class="btn btn-primary btn-sm" onclick="openAddPaymentForm()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Payment
                </button>
            </div>

            ${paymentsData.length === 0 ? `
                <div class="payments-empty">
                    <div class="payments-empty-icon">💳</div>
                    <div class="payments-empty-title">No Payments Yet</div>
                    <div class="payments-empty-text">Click "Add Payment" to record a payment</div>
                </div>
            ` : `
                <div class="payments-list">
                    ${paymentsData.map(payment => `
                        <div class="payment-item ${payment.is_nil ? 'payment-nil' : ''}">
                            <div class="payment-item-main">
                                <div class="payment-item-left">
                                    <div class="payment-item-date">
                                        📅 ${formatDate(payment.payment_date)}
                                    </div>
                                    <div class="payment-item-method">
                                        ${getPaymentMethodIcon(payment.payment_method)} ${formatPaymentMethod(payment.payment_method)}
                                    </div>
                                    ${payment.is_nil ? '<span class="nil-badge">✓ NIL</span>' : ''}
                                </div>
                                <div class="payment-item-right">
                                    <div class="payment-item-amount">${fmt(payment.amount)}</div>
                                    <div class="payment-item-actions">
                                        <button class="icon-btn" onclick="editPayment('${payment.id}')" title="Edit">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                            </svg>
                                        </button>
                                        <button class="icon-btn icon-btn-danger" onclick="deletePayment('${payment.id}')" title="Delete">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polyline points="3 6 5 6 21 6"/>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            ${payment.notes ? `
                                <div class="payment-item-notes">
                                    📝 ${payment.notes}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    `;
}

// ===== PAYMENT METHOD FORMATTING =====
function formatPaymentMethod(method) {
    const methods = {
        'cash': 'Cash',
        'bank_transfer': 'Bank Transfer',
        'cheque': 'Cheque',
        'credit_card': 'Credit Card',
        'debit_card': 'Debit Card',
        'mobile_payment': 'Mobile Payment',
        'other': 'Other'
    };
    return methods[method] || method;
}

function getPaymentMethodIcon(method) {
    const icons = {
        'cash': '💵',
        'bank_transfer': '🏦',
        'cheque': '📋',
        'credit_card': '💳',
        'debit_card': '💳',
        'mobile_payment': '📱',
        'other': '💰'
    };
    return icons[method] || '💰';
}

// ===== OPEN ADD PAYMENT FORM =====
window.openAddPaymentForm = function() {
    const formModal = document.getElementById('payment-form-modal');
    const formTitle = document.getElementById('payment-form-title');
    const form = document.getElementById('payment-form');
    
    if (!formModal || !formTitle || !form) return;

    // Reset form
    form.reset();
    formTitle.textContent = '➕ Add Payment';
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payment-date').value = today;
    
    // Set default amount to remaining amount
    const total = currentTransactionData.total || 0;
    const totalPaid = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remaining = Math.max(0, total - totalPaid);
    document.getElementById('payment-amount').value = remaining;

    // Store edit mode flag
    form.dataset.editMode = 'false';
    form.dataset.paymentId = '';

    // Show form modal
    formModal.classList.add('active');
};

// ===== EDIT PAYMENT =====
window.editPayment = async function(paymentId) {
    try {
        const payment = paymentsData.find(p => p.id === paymentId);
        if (!payment) {
            showNotification('Payment not found', 'error');
            return;
        }

        const formModal = document.getElementById('payment-form-modal');
        const formTitle = document.getElementById('payment-form-title');
        const form = document.getElementById('payment-form');
        
        if (!formModal || !formTitle || !form) return;

        // Fill form with payment data
        formTitle.textContent = '✏️ Edit Payment';
        document.getElementById('payment-amount').value = payment.amount;
        document.getElementById('payment-method').value = payment.payment_method;
        document.getElementById('payment-date').value = payment.payment_date.split('T')[0];
        document.getElementById('payment-notes').value = payment.notes || '';
        document.getElementById('payment-nil').checked = payment.is_nil || false;

        // Store edit mode
        form.dataset.editMode = 'true';
        form.dataset.paymentId = paymentId;

        // Show form modal
        formModal.classList.add('active');
    } catch (error) {
        logError('❌ Error editing payment:', error);
        showNotification('Error loading payment details', 'error');
    }
};

// ===== SAVE PAYMENT =====
window.savePayment = async function(event) {
    event.preventDefault();
    
    const form = document.getElementById('payment-form');
    const saveBtn = document.getElementById('save-payment-btn');
    
    if (!form || !saveBtn) return;

    // Get form values
    const amount = parseFloat(document.getElementById('payment-amount').value) || 0;
    const method = document.getElementById('payment-method').value;
    const date = document.getElementById('payment-date').value;
    const notes = document.getElementById('payment-notes').value.trim();
    const isNil = document.getElementById('payment-nil').checked;

    // Validate
    if (amount <= 0 && !isNil) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }

    if (!method) {
        showNotification('Please select a payment method', 'error');
        return;
    }

    if (!date) {
        showNotification('Please select a payment date', 'error');
        return;
    }

    // Hoist edit-mode flags BEFORE try so `finally` can reference them
    const isEditMode = form.dataset.editMode === 'true';
    const paymentId  = form.dataset.paymentId;

    // Disable button
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const paymentData = {
            transaction_id: currentTransactionId,
            transaction_type: currentTransactionType,
            amount: amount,
            payment_method: method,
            payment_date: date,
            notes: notes,
            is_nil: isNil,
            user_id: user.id
        };

        let result;
        if (isEditMode && paymentId) {
            // Update existing payment
            result = await window.StorageModule.updateData('payments', paymentId, paymentData);
        } else {
            // Create new payment
            result = await window.StorageModule.saveData('payments', paymentData);
        }

        if (result.success) {
            showNotification(isEditMode ? 'Payment updated successfully' : 'Payment added successfully', 'success');
            
            // Close form modal
            document.getElementById('payment-form-modal').classList.remove('active');
            
            // Reload payments and update display
            await loadPayments(currentTransactionId, currentTransactionType);
            renderPaymentModal();
            
            // Update the original transaction's payment status
            await updateTransactionPaymentStatus();
            
            // Refresh the parent listing page
            if (currentTransactionType === 'sale' && window.SalesModule) {
                await window.SalesModule.loadSales();
            } else if (currentTransactionType === 'purchase' && window.PurchasesModule) {
                await window.PurchasesModule.loadPurchases();
            }

            // Keep Accounts and Dashboard in sync immediately
            if (window.AccountsModule?.loadAccounts) window.AccountsModule.loadAccounts();
            if (window.AppModule?.loadDashboardStats) window.AppModule.loadDashboardStats();

            // Refresh dashboard if it's being viewed
            if (window.DashboardModule) {
                await window.DashboardModule.refreshDashboard();
            }
        } else {
            showNotification('Failed to save payment: ' + result.error, 'error');
        }
    } catch (error) {
        logError('❌ Error saving payment:', error);
        showNotification('Error saving payment', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditMode ? 'Update Payment' : 'Add Payment';
    }
};

// ===== DELETE PAYMENT =====
window.deletePayment = async function(paymentId) {
    if (!confirm('Are you sure you want to delete this payment? This action cannot be undone.')) {
        return;
    }

    try {
        const result = await window.StorageModule.deleteData('payments', paymentId);
        
        if (result.success) {
            showNotification('Payment deleted successfully', 'success');
            
            // Reload payments and update display
            await loadPayments(currentTransactionId, currentTransactionType);
            renderPaymentModal();
            
            // Update the original transaction's payment status
            await updateTransactionPaymentStatus();
            
            // Refresh the parent listing page
            if (currentTransactionType === 'sale' && window.SalesModule) {
                await window.SalesModule.loadSales();
            } else if (currentTransactionType === 'purchase' && window.PurchasesModule) {
                await window.PurchasesModule.loadPurchases();
            }

            // Keep Accounts and Dashboard in sync immediately
            if (window.AccountsModule?.loadAccounts) window.AccountsModule.loadAccounts();
            if (window.AppModule?.loadDashboardStats) window.AppModule.loadDashboardStats();

            // Refresh dashboard
            if (window.DashboardModule) {
                await window.DashboardModule.refreshDashboard();
            }
        } else {
            showNotification('Failed to delete payment', 'error');
        }
    } catch (error) {
        logError('❌ Error deleting payment:', error);
        showNotification('Error deleting payment', 'error');
    }
};

// ===== UPDATE TRANSACTION PAYMENT STATUS =====
async function updateTransactionPaymentStatus() {
    try {
        const total = currentTransactionData.total || 0;
        const totalPaid = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        // Check if any payment has nil flag set
        const hasNilPayment = paymentsData.some(p => p.is_nil);
        
        // Calculate remaining with NIL consideration
        let remaining;
        if (hasNilPayment && totalPaid > 0) {
            // If NIL is used, remaining should be 0 regardless of amounts
            remaining = 0;
        } else {
            remaining = Math.max(0, total - totalPaid);
        }
        
        // Calculate payment status based on remaining amount
        // IMPORTANT: If remaining is 0 and paid > 0, it's PAID (even if paid < total due to NIL)
        let paymentStatus = 'unpaid';
        if (remaining === 0 && totalPaid > 0) {
            paymentStatus = 'paid';
        } else if (totalPaid > 0) {
            paymentStatus = 'partial';
        }

        const tableName = currentTransactionType === 'sale' ? 'sales' : 'purchases';
        await window.StorageModule.updateData(tableName, currentTransactionId, {
            paid_amount: totalPaid,
            remaining_amount: remaining,
            payment_status: paymentStatus
        });

        window.log('✅ Transaction payment status updated:', paymentStatus, '| Remaining:', remaining);
    } catch (error) {
        logError('❌ Error updating transaction payment status:', error);
    }
}

// ===== NOTIFICATION =====
function showNotification(message, type = 'info') {
    // Try to use the main app's notification system if available
    if (window.showNotification) {
        window.showNotification(message, type);
        return;
    }
    
    // Fallback: create our own notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: var(--color-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'});
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== GET TOTAL PAID FOR TRANSACTION =====
window.getTotalPaidForTransaction = async function(transactionId, transactionType) {
    try {
        const payments = await loadPayments(transactionId, transactionType);
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    } catch (error) {
        logError('❌ Error getting total paid:', error);
        return 0;
    }
};

// ===== EXPORT MODULE =====
window.PaymentModule = {
    openPaymentManagement: window.openPaymentManagement,
    getTotalPaidForTransaction: window.getTotalPaidForTransaction,
    loadPayments: loadPayments
};

window.log('✅ Payment Module Loaded');

/* ==========================================
   JS END: Payment Management Module
   ========================================== */

})();