(function() {
/* ==========================================
   MODULE SCOPE: Accounts Management Module
   Manages AR/AP, opening balances, and payment allocation
   ========================================== */

/* ==========================================
   JS START: Accounts Module
   ========================================== */

// ===== STATE =====
let accountsData = [];
let filteredAccounts = [];
let currentAccountId = null;
let currentAccountType = null; // 'customer' or 'supplier'
let accountTransactions = [];
let displayedTransactions = []; // Track currently displayed transactions for export
let selectedBillsForPayment = [];
let excludedBillsForPayment = [];
let paymentAllocationMode = 'auto'; // 'auto', 'select', 'exclude'
// Date filtering for ledger
let ledgerDateFrom = '';
let ledgerDateTo = '';

// ===== DOM ELEMENTS =====
const accountsSearch = document.getElementById('accounts-search');
const accountsTypeFilter = document.getElementById('accounts-type-filter');
const accountsGrid = document.getElementById('accounts-grid');
const accountsTotalCount = document.getElementById('accounts-total-count');
const accountsReceivable = document.getElementById('accounts-receivable');
const accountsPayable = document.getElementById('accounts-payable');
const accountsNetBalance = document.getElementById('accounts-net-balance');

// Account Detail Modal
const accountDetailModal = document.getElementById('account-detail-modal');
const closeAccountDetailModal = document.getElementById('close-account-detail-modal');
const closeAccountDetailBtn = document.getElementById('close-account-detail-btn');
const accountDetailContent = document.getElementById('account-detail-content');

// Payment Allocation Modal
const paymentAllocationModal = document.getElementById('payment-allocation-modal');
const closePaymentAllocationModal = document.getElementById('close-payment-allocation-modal');
const paymentAllocationForm = document.getElementById('payment-allocation-form');

// Opening Balance Modal
const openingBalanceModal = document.getElementById('opening-balance-modal');
const closeOpeningBalanceModal = document.getElementById('close-opening-balance-modal');
const openingBalanceForm = document.getElementById('opening-balance-form');

// ===== HELPERS =====
function fmt(n) {
    return 'PKR ' + Math.round(n).toLocaleString();
}

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

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ===== LOAD ACCOUNTS =====
async function loadAccounts() {
    try {
        console.log('🔄 Loading accounts...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in');
            return;
        }

        // Load customers and suppliers
        const customersResult = await window.StorageModule.getAllData('customers');
        const suppliersResult = await window.StorageModule.getAllData('suppliers');
        
        const customers = customersResult.success ? customersResult.data : [];
        const suppliers = suppliersResult.success ? suppliersResult.data : [];
        
        // Load transactions for each account
        await loadAccountTransactionData(customers, suppliers);
        
        // Combine into accounts array with type
        accountsData = [
            ...customers.map(c => ({...c, account_type: 'customer'})),
            ...suppliers.map(s => ({...s, account_type: 'supplier'}))
        ];
        
        console.log('✅ Loaded', accountsData.length, 'accounts');
        applyFilters();
    } catch (error) {
        console.error('❌ Error loading accounts:', error);
        showAccountsNotification('Error loading accounts', 'error');
    }
}

// ===== LOAD ACCOUNT TRANSACTION DATA =====
async function loadAccountTransactionData(customers, suppliers) {
    try {
        // Load all transaction data
        const salesResult = await window.StorageModule.getAllData('sales');
        const purchasesResult = await window.StorageModule.getAllData('purchases');
        const returnsResult = await window.StorageModule.getAllData('returns');
        const paymentsResult = await window.StorageModule.getAllData('payments');
        
        const sales = salesResult.success ? salesResult.data : [];
        const purchases = purchasesResult.success ? purchasesResult.data : [];
        const returns = returnsResult.success ? returnsResult.data : [];
        const payments = paymentsResult.success ? paymentsResult.data : [];
        
        // Calculate customer balances (AR - Accounts Receivable)
        customers.forEach(customer => {
            // Opening balance
            customer.opening_balance = customer.opening_balance || 0;
            
            // Sales to this customer
            const customerSales = sales.filter(s => 
                (s.customer_id && s.customer_id === customer.id) ||
                (!s.customer_id && s.customer_phone && s.customer_phone === customer.phone)
            );
            
            // Returns from this customer
            // CRITICAL FIX: Match returns by original_transaction_id (sale ID), not by customer_id
            const customerSaleIds = customerSales.map(s => s.id);
            const customerReturns = returns.filter(r => 
                r.return_type === 'sale' && 
                customerSaleIds.includes(r.original_transaction_id)
            );
            
            // FIXED: Get payments by matching transaction_id (sale IDs) instead of party matching
            // This is more reliable because it directly links payments to sales
            const customerPayments = payments.filter(p => 
                p.transaction_type === 'sale' && 
                customerSaleIds.includes(p.transaction_id)
            );
            
            // Calculate totals
            const totalSales = customerSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const totalReturns = customerReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);
            const totalPayments = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            
            // Current balance = Opening + Sales - Returns - Payments
            customer.current_balance = customer.opening_balance + totalSales - totalReturns - totalPayments;
            customer.total_transactions = customerSales.length + customerReturns.length + customerPayments.length;
            customer.pending_amount = customerSales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);
        });
        
        // Calculate supplier balances (AP - Accounts Payable)
        suppliers.forEach(supplier => {
            // Opening balance
            supplier.opening_balance = supplier.opening_balance || 0;
            
            // Purchases from this supplier
            const supplierPurchases = purchases.filter(p => 
                (p.supplier_id && p.supplier_id === supplier.id) ||
                (!p.supplier_id && p.supplier_phone && p.supplier_phone === supplier.phone)
            );
            
            // Returns to this supplier
            // CRITICAL FIX: Match returns by original_transaction_id (purchase ID), not by supplier_id
            const supplierPurchaseIds = supplierPurchases.map(p => p.id);
            const supplierReturns = returns.filter(r => 
                r.return_type === 'purchase' && 
                supplierPurchaseIds.includes(r.original_transaction_id)
            );
            
            // FIXED: Get payments by matching transaction_id (purchase IDs) instead of party matching
            // This is more reliable because it directly links payments to purchases
            const supplierPayments = payments.filter(p => 
                p.transaction_type === 'purchase' && 
                supplierPurchaseIds.includes(p.transaction_id)
            );
            
            // Supplier-as-Customer: sales TO this supplier
            const supplierSales = sales.filter(s => s.supplier_id === supplier.id);
            const supplierSaleIds = supplierSales.map(s => s.id);
            const supplierSalePayments = payments.filter(p =>
                p.transaction_type === 'sale' && supplierSaleIds.includes(p.transaction_id)
            );
            const supplierSaleReturns = returns.filter(r =>
                r.return_type === 'sale' && supplierSaleIds.includes(r.original_transaction_id)
            );

            // Calculate totals
            const totalPurchases    = supplierPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
            const totalReturns      = supplierReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);
            const totalPayments     = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const totalSalesToSup   = supplierSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const totalSaleRet      = supplierSaleReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);
            const totalSalePay      = supplierSalePayments.reduce((sum, p) => sum + (p.amount || 0), 0);

            // Net sales offset: reduces what you owe the supplier
            const netSalesOffset = totalSalesToSup - totalSaleRet - totalSalePay;

            // Current balance = Opening + Purchases - Returns - Payments - NetSalesOffset
            supplier.current_balance = supplier.opening_balance + totalPurchases - totalReturns - totalPayments - netSalesOffset;
            supplier.total_transactions = supplierPurchases.length + supplierReturns.length + supplierPayments.length + supplierSales.length;
            supplier.pending_amount = supplierPurchases.reduce((sum, p) => sum + (p.remaining_amount || 0), 0);
            // Raw breakdowns for the card display
            supplier._rawPurchaseOwed  = (supplier.opening_balance || 0) + supplierPurchases.reduce((sum, p) => sum + (p.remaining_amount || 0), 0);
            supplier._salesReceivable  = supplierSales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);
        });
        
    } catch (error) {
        console.error('❌ Error loading account transaction data:', error);
    }
}

// ===== APPLY FILTERS =====
function applyFilters() {
    const searchTerm = accountsSearch ? accountsSearch.value.toLowerCase().trim() : '';
    const typeFilter = accountsTypeFilter ? accountsTypeFilter.value : '';
    
    filteredAccounts = accountsData.filter(account => {
        // Search filter
        const matchesSearch = !searchTerm || 
            (account.name && account.name.toLowerCase().includes(searchTerm)) ||
            (account.phone && account.phone.includes(searchTerm)) ||
            (account.email && account.email.toLowerCase().includes(searchTerm));
        
        // Type filter
        const matchesType = !typeFilter || account.account_type === typeFilter;
        
        return matchesSearch && matchesType;
    });
    
    console.log('🔍 Filtered accounts:', filteredAccounts.length, 'of', accountsData.length);
    renderAccounts();
    updateSummaryStats();
}

// ===== RENDER ACCOUNTS GRID =====
function renderAccounts() {
    if (filteredAccounts.length === 0) {
        accountsGrid.innerHTML = `
            <div class="accounts-empty-state">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🏦</div>
                <h3>${accountsData.length === 0 ? 'No accounts yet' : 'No accounts found'}</h3>
                <p>${accountsData.length === 0 ? 'Create customers and suppliers to see accounts here' : 'Try adjusting your filters'}</p>
            </div>
        `;
        return;
    }
    
    accountsGrid.innerHTML = filteredAccounts.map(account => {
        const isCustomer = account.account_type === 'customer';
        const balanceClass = account.current_balance > 0 ? (isCustomer ? 'success' : 'danger') : 
                            account.current_balance < 0 ? (isCustomer ? 'danger' : 'success') : 'muted';
        const balanceLabel = isCustomer ? 
            (account.current_balance > 0 ? 'Receivable' : account.current_balance < 0 ? 'Credit' : 'Settled') :
            (account.current_balance > 0 ? 'Payable' : account.current_balance < 0 ? 'Advance' : 'Settled');
        
        return `
            <div class="account-card" data-account-id="${account.id}" data-account-type="${account.account_type}">
                <div class="account-card-header">
                    <div class="account-card-info">
                        <div class="account-card-avatar ${account.account_type}">
                            ${getInitials(account.name)}
                        </div>
                        <div class="account-card-title-group">
                            <div class="account-card-name">${account.name || 'Unknown'}</div>
                            <div class="account-card-type">
                                ${isCustomer ? '👥 Customer' : '🚚 Supplier'}
                            </div>
                        </div>
                    </div>
                    <div class="account-card-badge ${balanceClass}">
                        ${balanceLabel}
                    </div>
                </div>
                
                <div class="account-card-balance">
                    <div class="balance-main">
                        <span class="balance-label">Net Balance</span>
                        <span class="balance-amount ${balanceClass}">${fmt(Math.abs(account.current_balance))}</span>
                    </div>
                    ${account.opening_balance !== 0 ? `
                        <div class="balance-detail">
                            <span class="balance-detail-label">Opening:</span>
                            <span class="balance-detail-value">${fmt(account.opening_balance)}</span>
                        </div>
                    ` : ''}
                    ${account.pending_amount > 0 ? `
                        <div class="balance-detail warning">
                            <span class="balance-detail-label">Pending Bills:</span>
                            <span class="balance-detail-value">${fmt(account.pending_amount)}</span>
                        </div>
                    ` : ''}
                    ${!isCustomer && (account._rawPurchaseOwed || 0) > 0 ? `
                        <div class="balance-detail" style="color:var(--color-warning);">
                            <span class="balance-detail-label">🛒 Purchase Owed:</span>
                            <span class="balance-detail-value">${fmt(account._rawPurchaseOwed)}</span>
                        </div>
                    ` : ''}
                    ${!isCustomer && (account._salesReceivable || 0) > 0 ? `
                        <div class="balance-detail" style="color:var(--color-info);">
                            <span class="balance-detail-label">🧾 Sales Receivable:</span>
                            <span class="balance-detail-value">${fmt(account._salesReceivable)}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="account-card-stats">
                    <div class="account-stat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h18v18H3z"/>
                            <path d="M3 9h18"/>
                            <path d="M9 21V9"/>
                        </svg>
                        ${account.total_transactions || 0} Transactions
                    </div>
                </div>
                
                <div class="account-card-actions">
                    <button class="btn-icon-account" onclick="window.AccountsModule.viewAccountDetails('${account.id}', '${account.account_type}')" title="View Details">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn-icon-account" onclick="window.AccountsModule.setOpeningBalance('${account.id}', '${account.account_type}')" title="Set Opening Balance">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="1" x2="12" y2="23"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                    </button>
                    <button class="btn-icon-account primary" onclick="window.AccountsModule.makePayment('${account.id}', '${account.account_type}')" title="${isCustomer ? 'Receive Payment' : 'Make Payment'}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                            <line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ===== UPDATE SUMMARY STATS =====
function updateSummaryStats() {
    const totalAccounts = filteredAccounts.length;
    const totalAR = filteredAccounts
        .filter(a => a.account_type === 'customer')
        .reduce((sum, a) => sum + Math.max(0, a.current_balance), 0);
    const totalAP = filteredAccounts
        .filter(a => a.account_type === 'supplier')
        .reduce((sum, a) => sum + Math.max(0, a.current_balance), 0);
    const netBalance = totalAR - totalAP;
    
    if (accountsTotalCount) accountsTotalCount.textContent = totalAccounts;
    if (accountsReceivable) accountsReceivable.textContent = fmt(totalAR);
    if (accountsPayable) accountsPayable.textContent = fmt(totalAP);
    if (accountsNetBalance) {
        accountsNetBalance.textContent = fmt(netBalance);
        accountsNetBalance.className = netBalance >= 0 ? 'success' : 'danger';
    }
}

// ===== VIEW ACCOUNT DETAILS =====
async function viewAccountDetails(accountId, accountType) {
    try {
        currentAccountId = accountId;
        currentAccountType = accountType;
        
        const account = accountsData.find(a => a.id === accountId && a.account_type === accountType);
        if (!account) {
            showAccountsNotification('Account not found', 'error');
            return;
        }
        
        // Load all transactions for this account
        await loadAccountLedger(account);
        
        // Render account details
        renderAccountDetails(account);
        
        accountDetailModal.classList.add('active');
    } catch (error) {
        console.error('❌ Error viewing account details:', error);
        showAccountsNotification('Error loading account details', 'error');
    }
}

// ===== LOAD ACCOUNT LEDGER =====
async function loadAccountLedger(account) {
    try {
        const salesResult = await window.StorageModule.getAllData('sales');
        const purchasesResult = await window.StorageModule.getAllData('purchases');
        const returnsResult = await window.StorageModule.getAllData('returns');
        const paymentsResult = await window.StorageModule.getAllData('payments');
        
        const sales = salesResult.success ? salesResult.data : [];
        const purchases = purchasesResult.success ? purchasesResult.data : [];
        const returns = returnsResult.success ? returnsResult.data : [];
        const payments = paymentsResult.success ? paymentsResult.data : [];
        
        accountTransactions = [];
        
        if (account.account_type === 'customer') {
            // Add opening balance
            if (account.opening_balance !== 0) {
                accountTransactions.push({
                    date: account.created_at,
                    created_at: account.created_at,
                    type: 'opening_balance',
                    description: 'Opening Balance',
                    debit: account.opening_balance > 0 ? account.opening_balance : 0,
                    credit: account.opening_balance < 0 ? Math.abs(account.opening_balance) : 0,
                    balance: account.opening_balance
                });
            }
            
            // Add sales (debit - increase receivable)
            const customerSales = sales.filter(s => 
                (s.customer_id && s.customer_id === account.id) ||
                (!s.customer_id && s.customer_phone && s.customer_phone === account.phone)
            );
            
            customerSales.forEach(sale => {
                accountTransactions.push({
                    date: sale.sale_date || sale.created_at,
                    created_at: sale.created_at,
                    type: 'sale',
                    description: `Sale #${sale.invoice_id}`,
                    reference_id: sale.id,
                    debit: sale.total,
                    credit: 0
                });
            });
            
            // Get all sale IDs for this customer (needed for returns and payments matching)
            const customerSaleIds = customerSales.map(s => s.id);
            
            // Add returns (credit - decrease receivable)
            // FIXED: Match returns by original_transaction_id (sale ID)
            returns.filter(r => 
                r.return_type === 'sale' && 
                customerSaleIds.includes(r.original_transaction_id)
            ).forEach(ret => {
                accountTransactions.push({
                    date: ret.return_date || ret.created_at,
                    created_at: ret.created_at,
                    type: 'return',
                    description: `Return on ${formatDate(ret.return_date || ret.created_at)}${ret.original_reference ? ` (Ref: ${ret.original_reference})` : ''}`,
                    reference_id: ret.id,
                    debit: 0,
                    credit: ret.total_amount || 0
                });
            });
            
            // Add payments (credit - decrease receivable)
            // FIXED: Match payments by transaction_type and transaction_id (sale IDs)
            // This matches the balance calculation logic for consistency
            payments.filter(p => 
                p.transaction_type === 'sale' && 
                customerSaleIds.includes(p.transaction_id)
            ).forEach(payment => {
                accountTransactions.push({
                    date: payment.payment_date || payment.created_at,
                    created_at: payment.created_at,
                    type: 'payment',
                    description: `Payment - ${payment.payment_method}`,
                    reference_id: payment.id,
                    debit: 0,
                    credit: payment.amount
                });
            });
        } else {
            // Supplier account
            // Add opening balance
            if (account.opening_balance !== 0) {
                accountTransactions.push({
                    date: account.created_at,
                    created_at: account.created_at,
                    type: 'opening_balance',
                    description: 'Opening Balance',
                    debit: account.opening_balance < 0 ? Math.abs(account.opening_balance) : 0,
                    credit: account.opening_balance > 0 ? account.opening_balance : 0,
                    balance: account.opening_balance
                });
            }
            
            // Add purchases (credit - increase payable)
            const supplierPurchases = purchases.filter(p => 
                (p.supplier_id && p.supplier_id === account.id) ||
                (!p.supplier_id && p.supplier_phone && p.supplier_phone === account.phone)
            );
            
            supplierPurchases.forEach(purchase => {
                accountTransactions.push({
                    date: purchase.purchase_date || purchase.created_at,
                    created_at: purchase.created_at,
                    type: 'purchase',
                    description: `Purchase #${purchase.purchase_id}`,
                    reference_id: purchase.id,
                    debit: 0,
                    credit: purchase.total
                });
            });
            
            // Get all purchase IDs for this supplier (needed for returns and payments matching)
            const supplierPurchaseIds = supplierPurchases.map(p => p.id);
            
            // Add returns (debit - decrease payable)
            // FIXED: Match returns by original_transaction_id (purchase ID)
            returns.filter(r => 
                r.return_type === 'purchase' && 
                supplierPurchaseIds.includes(r.original_transaction_id)
            ).forEach(ret => {
                accountTransactions.push({
                    date: ret.return_date || ret.created_at,
                    created_at: ret.created_at,
                    type: 'return',
                    description: `Return on ${formatDate(ret.return_date || ret.created_at)}${ret.original_reference ? ` (Ref: ${ret.original_reference})` : ''}`,
                    reference_id: ret.id,
                    debit: ret.total_amount || 0,
                    credit: 0
                });
            });
            
            // Add payments (debit - decrease payable)
            payments.filter(p => 
                p.transaction_type === 'purchase' && 
                supplierPurchaseIds.includes(p.transaction_id)
            ).forEach(payment => {
                accountTransactions.push({
                    date: payment.payment_date || payment.created_at,
                    created_at: payment.created_at,
                    type: 'payment',
                    description: `Payment - ${payment.payment_method}`,
                    reference_id: payment.id,
                    debit: payment.amount,
                    credit: 0
                });
            });

            // ── Supplier-as-Customer: sales TO this supplier ──
            const supplierSales   = sales.filter(s => s.supplier_id === account.id);
            const supplierSaleIds = supplierSales.map(s => s.id);

            // Sale to supplier = CREDIT (reduces your payable to them)
            supplierSales.forEach(sale => {
                accountTransactions.push({
                    date: sale.sale_date || sale.created_at,
                    created_at: sale.created_at,
                    type: 'supplier_sale',
                    description: `🧾 Sale to Supplier — ${sale.invoice_id}`,
                    reference_id: sale.id,
                    debit: 0,
                    credit: sale.total || 0
                });
            });

            // Payment received from supplier on sales = also CREDIT (further reduces payable)
            // NOTE: sale return = DEBIT (increases payable again)

            // Sale returns from supplier = CREDIT (increases what you owe)
            returns.filter(r =>
                r.return_type === 'sale' && supplierSaleIds.includes(r.original_transaction_id)
            ).forEach(ret => {
                accountTransactions.push({
                    date: ret.return_date || ret.created_at,
                    created_at: ret.created_at,
                    type: 'return',
                    description: `↩️ Return on Sale — ${formatDate(ret.return_date || ret.created_at)}`,
                    reference_id: ret.id,
                    debit: 0,
                    credit: ret.total_amount || 0
                });
            });

            // Payment received from supplier on sales = CREDIT
            payments.filter(p =>
                p.transaction_type === 'sale' && supplierSaleIds.includes(p.transaction_id)
            ).forEach(payment => {
                accountTransactions.push({
                    date: payment.payment_date || payment.created_at,
                    created_at: payment.created_at,
                    type: 'payment',
                    description: `💳 Payment Received — ${payment.payment_method}`,
                    reference_id: payment.id,
                    debit: 0,
                    credit: payment.amount
                });
            });
        }
        
        // Sort by created_at timestamp for true chronological order
        // Priority: Use database created_at (full timestamp) over date field
        accountTransactions.sort((a, b) => {
            // Always prefer created_at (database timestamp) over date (user-specified date)
            const timeA = a.created_at ? new Date(a.created_at) : new Date(a.date);
            const timeB = b.created_at ? new Date(b.created_at) : new Date(b.date);
            const timeDiff = timeA - timeB;
            
            // Debug logging
            if (a.type !== 'opening_balance' && b.type !== 'opening_balance') {
                console.log('🔍 Sort comparison:', {
                    a: { type: a.type, desc: a.description.substring(0, 30), created_at: a.created_at, timestamp: timeA.toISOString() },
                    b: { type: b.type, desc: b.description.substring(0, 30), created_at: b.created_at, timestamp: timeB.toISOString() },
                    diff_ms: timeDiff
                });
            }
            
            // If timestamps are different (even by milliseconds), use chronological order
            if (timeDiff !== 0) {
                return timeDiff;
            }
            
            // Tie-breaker: if timestamps are identical, prioritize transaction types
            // Sales/Purchases should appear before their Payments
            const typeOrder = { 'opening_balance': 0, 'sale': 1, 'supplier_sale': 1, 'purchase': 1, 'return': 2, 'payment': 3 };
            return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        });
        
        // Calculate running balance
        let runningBalance = 0;
        accountTransactions.forEach(txn => {
            if (txn.type === 'opening_balance') {
                runningBalance = txn.balance;
            } else {
                runningBalance += (txn.debit - txn.credit);
            }
            txn.balance = runningBalance;
        });
        
    } catch (error) {
        console.error('❌ Error loading account ledger:', error);
    }
}

// ===== TOGGLE SALES VISIBILITY IN LEDGER =====
let ledgerSalesVisible = true;

function toggleLedgerSales() {
    ledgerSalesVisible = !ledgerSalesVisible;
    const btn = document.getElementById('ledger-toggle-sales-btn');
    if (btn) btn.textContent = ledgerSalesVisible ? '🧾 Hide Sales' : '🧾 Show Sales';

    const account = accountsData.find(a => a.id === currentAccountId && a.account_type === currentAccountType);
    if (account) renderAccountDetails(account);
}

// ===== FILTER TRANSACTIONS BY DATE =====
function filterTransactionsByDate() {
    if (!ledgerDateFrom && !ledgerDateTo) {
        // No filters - re-render with all transactions
        const account = accountsData.find(a => a.id === currentAccountId && a.account_type === currentAccountType);
        if (account) {
            renderAccountDetails(account);
        }
        return;
    }
    
    // Filter transactions
    let filtered = [...accountTransactions];
    
    if (ledgerDateFrom) {
        const fromDate = new Date(ledgerDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        filtered = filtered.filter(txn => new Date(txn.date) >= fromDate);
    }
    
    if (ledgerDateTo) {
        const toDate = new Date(ledgerDateTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(txn => new Date(txn.date) <= toDate);
    }
    
    // Recalculate running balance for filtered transactions
    let runningBalance = 0;
    
    // Find the starting balance (last transaction before filter range)
    if (ledgerDateFrom) {
        const fromDate = new Date(ledgerDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        
        const beforeTransactions = accountTransactions.filter(txn => new Date(txn.date) < fromDate);
        if (beforeTransactions.length > 0) {
            // Use the balance of the last transaction before the filter
            runningBalance = beforeTransactions[beforeTransactions.length - 1].balance;
        }
    }
    
    filtered.forEach(txn => {
        if (txn.type === 'opening_balance') {
            runningBalance = txn.balance;
        } else {
            runningBalance += (txn.debit - txn.credit);
        }
        txn.balance = runningBalance;
    });
    
    // Render with filtered transactions
    const account = accountsData.find(a => a.id === currentAccountId && a.account_type === currentAccountType);
    if (account) {
        renderAccountDetails(account, filtered);
    }
}

// ===== CLEAR DATE FILTER =====
function clearDateFilter() {
    ledgerDateFrom = '';
    ledgerDateTo = '';
    const fromInput = document.getElementById('ledger-date-from');
    const toInput = document.getElementById('ledger-date-to');
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    
    // Re-render with all transactions
    const account = accountsData.find(a => a.id === currentAccountId && a.account_type === currentAccountType);
    if (account) {
        renderAccountDetails(account);
    }
}

// ===== APPLY DATE FILTER =====
function applyDateFilter() {
    const fromInput = document.getElementById('ledger-date-from');
    const toInput = document.getElementById('ledger-date-to');
    
    ledgerDateFrom = fromInput ? fromInput.value : '';
    ledgerDateTo = toInput ? toInput.value : '';
    
    // Validate date range
    if (ledgerDateFrom && ledgerDateTo) {
        const fromDate = new Date(ledgerDateFrom);
        const toDate = new Date(ledgerDateTo);
        
        if (fromDate > toDate) {
            showAccountsNotification('Start date must be before end date', 'error');
            return;
        }
    }
    
    filterTransactionsByDate();
}


// ===== RENDER ACCOUNT DETAILS =====
function renderAccountDetails(account, filteredTransactions = null) {
    const isCustomer = account.account_type === 'customer';
    const balanceClass = account.current_balance > 0 ? (isCustomer ? 'success' : 'danger') : 
                        account.current_balance < 0 ? (isCustomer ? 'danger' : 'success') : 'muted';
    
    // Filter out supplier sales if toggle is off (only applies to supplier ledger)
    let baseTransactions = filteredTransactions !== null ? filteredTransactions : accountTransactions;
    if (!isCustomer && !ledgerSalesVisible) {
        baseTransactions = baseTransactions.filter(t => t.type !== 'supplier_sale');
    }
    const displayTransactions = baseTransactions;
    const isFiltered = filteredTransactions !== null;
    
    // Update displayed transactions for export
    displayedTransactions = displayTransactions;
    
    accountDetailContent.innerHTML = `
        <div class="account-detail-header">
            <div class="account-detail-info">
                <div class="account-detail-avatar ${account.account_type}">
                    ${getInitials(account.name)}
                </div>
                <div class="account-detail-title-group">
                    <h2>${account.name}</h2>
                    <div class="account-detail-meta">
                        <span class="account-type-badge ${account.account_type}">
                            ${isCustomer ? '👥 Customer' : '🚚 Supplier'}
                        </span>
                        ${account.phone ? `<span>📞 ${account.phone}</span>` : ''}
                        ${account.email ? `<span>📧 ${account.email}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="account-detail-balance ${balanceClass}">
                <span class="balance-label">Current Balance</span>
                <span class="balance-amount">${fmt(Math.abs(account.current_balance))}</span>
            </div>
        </div>
        
        <div class="account-ledger-section">
            <div class="ledger-header">
                <h3>📊 Account Ledger</h3>
                <div class="ledger-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                    ${!isCustomer ? `
                    <button class="btn btn-secondary btn-sm" id="ledger-toggle-sales-btn"
                        onclick="window.AccountsModule.toggleLedgerSales()"
                        style="border-color:var(--color-info);color:var(--color-info);">
                        🧾 Hide Sales
                    </button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="window.AccountsModule.exportLedger('${account.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Export
                    </button>
                </div>
            </div>
            
            <div class="ledger-filters" style="margin-bottom: 1rem; padding: 1rem; background: var(--color-surface); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
                <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label for="ledger-date-from" style="color: var(--color-text-secondary); font-size: 0.875rem; white-space: nowrap;">From:</label>
                        <input type="date" id="ledger-date-from" value="${ledgerDateFrom}" 
                               style="padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text-primary);">
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label for="ledger-date-to" style="color: var(--color-text-secondary); font-size: 0.875rem; white-space: nowrap;">To:</label>
                        <input type="date" id="ledger-date-to" value="${ledgerDateTo}"
                               style="padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text-primary);">
                    </div>
                    <button onclick="window.AccountsModule.applyDateFilter()" class="btn btn-primary btn-sm">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="M21 21l-4.35-4.35"/>
                        </svg>
                        Filter
                    </button>
                    ${isFiltered ? `
                        <button onclick="window.AccountsModule.clearDateFilter()" class="btn btn-secondary btn-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Clear Filter
                        </button>
                    ` : ''}
                </div>
                ${isFiltered ? `<div style="margin-top: 0.5rem; color: var(--color-info); font-size: 0.875rem;">
                    📅 Showing filtered transactions (${displayTransactions.length} of ${accountTransactions.length})
                </div>` : ''}
            </div>
            
            <div class="ledger-table-container">
                <table class="ledger-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th class="text-right">Debit</th>
                            <th class="text-right">Credit</th>
                            <th class="text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayTransactions.length === 0 ? `
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
                                    ${isFiltered ? 'No transactions in selected date range' : 'No transactions yet'}
                                </td>
                            </tr>
                        ` : displayTransactions.map(txn => {
                            const typeIcons = {
                                opening_balance: '🔵',
                                sale: '💰',
                                supplier_sale: '🧾',
                                purchase: '🛒',
                                return: '↩️',
                                payment: '💳'
                            };
                            return `
                                <tr class="ledger-row ${txn.type}">
                                    <td>${formatDate(txn.date)}</td>
                                    <td>
                                        <div class="ledger-description">
                                            <span class="ledger-icon">${typeIcons[txn.type] || '📋'}</span>
                                            ${txn.description}
                                        </div>
                                    </td>
                                    <td class="text-right ${txn.debit > 0 ? 'text-danger' : 'text-muted'}">
                                        ${txn.debit > 0 ? fmt(txn.debit) : '-'}
                                    </td>
                                    <td class="text-right ${txn.credit > 0 ? 'text-success' : 'text-muted'}">
                                        ${txn.credit > 0 ? fmt(txn.credit) : '-'}
                                    </td>
                                    <td class="text-right text-bold ${txn.balance >= 0 ? 'text-success' : 'text-danger'}">
                                        ${fmt(Math.abs(txn.balance))}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="ledger-total">
                            <td colspan="2"><strong>${isFiltered ? 'Filtered Total' : 'Total'}</strong></td>
                            <td class="text-right text-danger"><strong>${fmt(displayTransactions.reduce((sum, t) => sum + t.debit, 0))}</strong></td>
                            <td class="text-right text-success"><strong>${fmt(displayTransactions.reduce((sum, t) => sum + t.credit, 0))}</strong></td>
                            <td class="text-right text-bold ${displayTransactions.length > 0 ? (displayTransactions[displayTransactions.length - 1].balance >= 0 ? 'text-success' : 'text-danger') : ''}">
                                <strong>${displayTransactions.length > 0 ? fmt(Math.abs(displayTransactions[displayTransactions.length - 1].balance)) : fmt(0)}</strong>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// ===== SET OPENING BALANCE =====
function setOpeningBalance(accountId, accountType) {
    const account = accountsData.find(a => a.id === accountId && a.account_type === accountType);
    if (!account) {
        showAccountsNotification('Account not found', 'error');
        return;
    }
    
    currentAccountId = accountId;
    currentAccountType = accountType;
    
    document.getElementById('opening-balance-account-name').textContent = account.name;
    document.getElementById('opening-balance-amount').value = account.opening_balance || 0;
    document.getElementById('opening-balance-notes').value = '';
    
    openingBalanceModal.classList.add('active');
}

// ===== SAVE OPENING BALANCE =====
async function saveOpeningBalance(event) {
    event.preventDefault();
    
    try {
        const amount = parseFloat(document.getElementById('opening-balance-amount').value);
        const notes = document.getElementById('opening-balance-notes').value;
        
        const updateData = {
            opening_balance: amount
        };
        
        const table = currentAccountType === 'customer' ? 'customers' : 'suppliers';
        const result = await window.StorageModule.updateData(table, currentAccountId, updateData);
        
        if (result.success) {
            showAccountsNotification('Opening balance updated successfully', 'success');
            openingBalanceModal.classList.remove('active');
            await loadAccounts();
        } else {
            showAccountsNotification('Failed to update opening balance: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('❌ Error saving opening balance:', error);
        showAccountsNotification('Error saving opening balance', 'error');
    }
}

// ===== MAKE PAYMENT =====
async function makePayment(accountId, accountType) {
    try {
        const account = accountsData.find(a => a.id === accountId && a.account_type === accountType);
        if (!account) {
            showAccountsNotification('Account not found', 'error');
            return;
        }
        
        currentAccountId = accountId;
        currentAccountType = accountType;
        
        // Load unpaid bills for this account
        await loadUnpaidBills(account);
        
        // Render payment allocation interface
        renderPaymentAllocation(account);
        
        paymentAllocationModal.classList.add('active');
    } catch (error) {
        console.error('❌ Error making payment:', error);
        showAccountsNotification('Error loading payment interface', 'error');
    }
}

// ===== LOAD UNPAID BILLS =====
async function loadUnpaidBills(account) {
    try {
        selectedBillsForPayment = [];
        excludedBillsForPayment = [];
        
        // CRITICAL FIX: Add opening balance as a virtual bill if it exists
        if (account.opening_balance && account.opening_balance > 0) {
            selectedBillsForPayment.push({
                id: 'opening_balance',
                invoice_id: 'Opening Balance',
                purchase_id: 'Opening Balance',
                sale_date: account.created_at,
                purchase_date: account.created_at,
                total: account.opening_balance,
                paid_amount: 0,
                remaining_amount: account.opening_balance,
                payment_status: 'pending',
                isOpeningBalance: true,
                customer_name: account.name,
                supplier_name: account.name
            });
        }
        
        if (account.account_type === 'customer') {
            const salesResult = await window.StorageModule.getAllData('sales');
            const sales = salesResult.success ? salesResult.data : [];
            
            const unpaidSales = sales.filter(s => 
                (s.customer_id && s.customer_id === account.id || 
                (!s.customer_id && s.customer_phone && s.customer_phone === account.phone)) &&
                s.remaining_amount > 0
            ).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
            
            selectedBillsForPayment.push(...unpaidSales);
        } else {
            const purchasesResult = await window.StorageModule.getAllData('purchases');
            const purchases = purchasesResult.success ? purchasesResult.data : [];
            
            const unpaidPurchases = purchases.filter(p => 
                (p.supplier_id && p.supplier_id === account.id || 
                (!p.supplier_id && p.supplier_phone && p.supplier_phone === account.phone)) &&
                p.remaining_amount > 0
            ).sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date));

            // Tag each purchase bill so we know which table to update when saving
            unpaidPurchases.forEach(p => p._billKind = 'purchase');
            selectedBillsForPayment.push(...unpaidPurchases);

            // Also load unpaid SALES to this supplier (they owe us)
            const salesResult = await window.StorageModule.getAllData('sales');
            const sales = salesResult.success ? salesResult.data : [];

            const unpaidSupplierSales = sales.filter(s =>
                s.supplier_id === account.id &&
                s.remaining_amount > 0
            ).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));

            // Tag each sale bill
            unpaidSupplierSales.forEach(s => s._billKind = 'sale');
            selectedBillsForPayment.push(...unpaidSupplierSales);
        }
        
        console.log('✅ Loaded', selectedBillsForPayment.length, 'unpaid bills (including opening balance if applicable)');
    } catch (error) {
        console.error('❌ Error loading unpaid bills:', error);
    }
}

// ===== RENDER PAYMENT ALLOCATION =====
function renderPaymentAllocation(account) {
    const isCustomer = account.account_type === 'customer';
    const totalOutstanding = selectedBillsForPayment.reduce((sum, bill) => sum + bill.remaining_amount, 0);
    
    const allocationContent = document.getElementById('payment-allocation-content');
    allocationContent.innerHTML = `
        <div class="payment-allocation-header">
            <div class="payment-account-info">
                <h3>${account.name}</h3>
                <p>${isCustomer ? 'Customer' : 'Supplier'} • Total Outstanding: ${fmt(totalOutstanding)}</p>
            </div>
        </div>
        
        <div class="payment-amount-section">
            <label class="form-label">Payment Amount (PKR) <span class="required">*</span></label>
            <input type="number" id="payment-amount-input" class="form-input" 
                   placeholder="Enter payment amount" min="0" step="0.01" required>
            <p class="form-help">Enter the total amount being paid</p>
        </div>
        
        <div class="payment-allocation-mode">
            <label class="form-label">Allocation Method</label>
            <div class="allocation-mode-buttons">
                <button type="button" class="allocation-mode-btn active" data-mode="auto" onclick="window.AccountsModule.setAllocationMode('auto')">
                    <div class="mode-icon">🤖</div>
                    <div class="mode-label">Auto Pay</div>
                    <div class="mode-description">Automatically distribute payment chronologically</div>
                </button>
                <button type="button" class="allocation-mode-btn" data-mode="select" onclick="window.AccountsModule.setAllocationMode('select')">
                    <div class="mode-icon">✅</div>
                    <div class="mode-label">Select Bills</div>
                    <div class="mode-description">Manually choose which bills to pay</div>
                </button>
                <button type="button" class="allocation-mode-btn" data-mode="exclude" onclick="window.AccountsModule.setAllocationMode('exclude')">
                    <div class="mode-icon">❌</div>
                    <div class="mode-label">Exclude Bills</div>
                    <div class="mode-description">Pay all bills except selected ones</div>
                </button>
            </div>
        </div>
        
        <div id="bills-list-section" class="bills-list-section">
            ${renderBillsList()}
        </div>
        
        <div class="payment-allocation-summary" id="payment-allocation-summary">
            <!-- Will be populated when amount is entered -->
        </div>
        
        <div class="payment-method-section">
            <label class="form-label">Payment Method <span class="required">*</span></label>
            <select id="payment-method-select" class="form-select" required>
                <option value="">Select method...</option>
                <option value="cash">💵 Cash</option>
                <option value="bank_transfer">🏦 Bank Transfer</option>
                <option value="cheque">📋 Cheque</option>
                <option value="credit_card">💳 Credit Card</option>
                <option value="debit_card">💳 Debit Card</option>
                <option value="mobile_payment">📱 Mobile Payment</option>
                <option value="other">💰 Other</option>
            </select>
        </div>
        
        <div class="payment-notes-section">
            <label class="form-label">Notes (Optional)</label>
            <textarea id="payment-notes-input" class="form-input" rows="3" 
                      placeholder="Add any notes about this payment..."></textarea>
        </div>
    `;
    
    // Add event listener for payment amount input
    document.getElementById('payment-amount-input').addEventListener('input', updatePaymentAllocationSummary);
}

// ===== RENDER BILLS LIST =====
function renderBillsList() {
    if (selectedBillsForPayment.length === 0) {
        return `
            <div class="bills-empty-state">
                <p>No outstanding bills found for this account</p>
            </div>
        `;
    }
    
    const isCustomer = currentAccountType === 'customer';

    const purchaseBills = selectedBillsForPayment.filter(b => b._billKind === 'purchase' || (!b._billKind && !isCustomer));
    const saleBills     = selectedBillsForPayment.filter(b => b._billKind === 'sale' || (!b._billKind && isCustomer));

    const renderBillRow = (bill) => {
        const isSaleBill = bill._billKind === 'sale' || (isCustomer && !bill._billKind);
        const billId     = isSaleBill ? bill.invoice_id : bill.purchase_id;
        const billDate   = isSaleBill ? bill.sale_date  : bill.purchase_date;
        const kindLabel  = bill.isOpeningBalance ? '🔵 Opening Balance'
                         : isSaleBill            ? '🧾 Sale (they owe you)'
                         :                         '🛒 Purchase (you owe)';
        const kindClass  = isSaleBill && !bill.isOpeningBalance ? 'color:var(--color-success)' : 'color:var(--color-warning)';

        return `
            <div class="bill-item" data-bill-id="${bill.id}">
                <div class="bill-checkbox">
                    <input type="checkbox" id="bill-${bill.id}"
                           ${paymentAllocationMode === 'select' || paymentAllocationMode === 'exclude' ? '' : 'disabled'}
                           onchange="window.AccountsModule.toggleBillSelection('${bill.id}')">
                </div>
                <div class="bill-info">
                    <div class="bill-id" style="${kindClass};font-weight:600;">${kindLabel}</div>
                    <div class="bill-date">${billId ? '#' + billId + ' — ' : ''}${formatDate(billDate)}</div>
                </div>
                <div class="bill-amounts">
                    <div class="bill-total">Total: ${fmt(bill.total)}</div>
                    <div class="bill-remaining">Due: ${fmt(bill.remaining_amount)}</div>
                </div>
            </div>
        `;
    };

    const purchaseSection = purchaseBills.length > 0 ? `
        ${!isCustomer ? `<div style="padding:0.5rem 0 0.25rem;font-size:0.8rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">🛒 You owe supplier</div>` : ''}
        ${purchaseBills.map(renderBillRow).join('')}
    ` : '';

    const saleSection = saleBills.length > 0 ? `
        ${!isCustomer ? `<div style="padding:0.75rem 0 0.25rem;font-size:0.8rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">🧾 Supplier owes you</div>` : ''}
        ${saleBills.map(renderBillRow).join('')}
    ` : '';

    return `
        <div class="bills-list-header">
            <h4>Outstanding Bills (${selectedBillsForPayment.length})</h4>
        </div>
        <div class="bills-list">
            ${purchaseSection}
            ${saleSection}
            ${selectedBillsForPayment.length === 0 ? '<div style="padding:1rem;text-align:center;color:var(--color-text-muted);">No outstanding bills</div>' : ''}
        </div>
    `;
}

// ===== SET ALLOCATION MODE =====
function setAllocationMode(mode) {
    paymentAllocationMode = mode;
    
    // Update button states
    document.querySelectorAll('.allocation-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Update bills list
    document.getElementById('bills-list-section').innerHTML = renderBillsList();
    
    // Update summary
    updatePaymentAllocationSummary();
}

// ===== TOGGLE BILL SELECTION =====
function toggleBillSelection(billId) {
    if (paymentAllocationMode === 'select') {
        const checkbox = document.getElementById(`bill-${billId}`);
        // For select mode, we track which bills are checked
        // No need to do anything here, we'll check checkboxes when processing
    } else if (paymentAllocationMode === 'exclude') {
        const checkbox = document.getElementById(`bill-${billId}`);
        // For exclude mode, checked bills are excluded
        // No need to do anything here, we'll check checkboxes when processing
    }
    
    updatePaymentAllocationSummary();
}

// ===== UPDATE PAYMENT ALLOCATION SUMMARY =====
function updatePaymentAllocationSummary() {
    const paymentAmountInput = document.getElementById('payment-amount-input');
    if (!paymentAmountInput) return;
    
    const paymentAmount = parseFloat(paymentAmountInput.value) || 0;
    if (paymentAmount <= 0) {
        document.getElementById('payment-allocation-summary').innerHTML = '';
        return;
    }
    
    // Calculate allocation based on mode
    let allocation = [];
    let remainingAmount = paymentAmount;
    
    if (paymentAllocationMode === 'auto') {
        // Auto mode: Pay bills chronologically
        for (const bill of selectedBillsForPayment) {
            if (remainingAmount <= 0) break;
            
            const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
            allocation.push({
                bill: bill,
                amount: amountToPay,
                status: amountToPay >= bill.remaining_amount ? 'PAID' : 'PARTIAL'
            });
            remainingAmount -= amountToPay;
        }
    } else if (paymentAllocationMode === 'select') {
        // Select mode: Only pay selected bills
        for (const bill of selectedBillsForPayment) {
            const checkbox = document.getElementById(`bill-${bill.id}`);
            if (checkbox && checkbox.checked) {
                if (remainingAmount <= 0) break;
                
                const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
                allocation.push({
                    bill: bill,
                    amount: amountToPay,
                    status: amountToPay >= bill.remaining_amount ? 'PAID' : 'PARTIAL'
                });
                remainingAmount -= amountToPay;
            }
        }
    } else if (paymentAllocationMode === 'exclude') {
        // Exclude mode: Pay all except excluded bills
        for (const bill of selectedBillsForPayment) {
            const checkbox = document.getElementById(`bill-${bill.id}`);
            if (checkbox && !checkbox.checked) {
                if (remainingAmount <= 0) break;
                
                const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
                allocation.push({
                    bill: bill,
                    amount: amountToPay,
                    status: amountToPay >= bill.remaining_amount ? 'PAID' : 'PARTIAL'
                });
                remainingAmount -= amountToPay;
            }
        }
    }
    
    const isCustomer = currentAccountType === 'customer';
    const billType = isCustomer ? 'Sale' : 'Purchase';
    
    document.getElementById('payment-allocation-summary').innerHTML = `
        <div class="allocation-summary-header">
            <h4>💳 Payment Allocation Preview</h4>
        </div>
        <div class="allocation-summary-content">
            ${allocation.length === 0 ? `
                <p class="text-muted">No bills will be paid with this allocation</p>
            ` : `
                <div class="allocation-items">
                    ${allocation.map(item => {
                        const billId = isCustomer ? item.bill.sale_id : item.bill.purchase_id;
                        return `
                            <div class="allocation-item">
                                <div class="allocation-bill-info">
                                    <span class="allocation-bill-id">${billType} #${billId}</span>
                                    <span class="allocation-status ${item.status.toLowerCase()}">${item.status}</span>
                                </div>
                                <div class="allocation-amounts">
                                    <span class="allocation-paying">${fmt(item.amount)}</span>
                                    <span class="allocation-remaining">of ${fmt(item.bill.remaining_amount)}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="allocation-totals">
                    <div class="allocation-total-row">
                        <span>Bills Affected:</span>
                        <span class="text-bold">${allocation.length}</span>
                    </div>
                    <div class="allocation-total-row">
                        <span>Amount Allocated:</span>
                        <span class="text-bold text-success">${fmt(paymentAmount - remainingAmount)}</span>
                    </div>
                    ${remainingAmount > 0 ? `
                        <div class="allocation-total-row warning">
                            <span>Excess Amount:</span>
                            <span class="text-bold">${fmt(remainingAmount)}</span>
                        </div>
                        <p class="allocation-note">
                            ℹ️ The excess ${fmt(remainingAmount)} will be recorded as advance payment
                        </p>
                    ` : ''}
                </div>
            `}
        </div>
    `;
}

// ===== SAVE PAYMENT ALLOCATION =====
async function savePaymentAllocation(event) {
    event.preventDefault();
    
    try {
        const paymentAmount = parseFloat(document.getElementById('payment-amount-input').value);
        const paymentMethod = document.getElementById('payment-method-select').value;
        const notes = document.getElementById('payment-notes-input').value;
        
        if (!paymentAmount || paymentAmount <= 0) {
            showAccountsNotification('Please enter a valid payment amount', 'error');
            return;
        }
        
        if (!paymentMethod) {
            showAccountsNotification('Please select a payment method', 'error');
            return;
        }
        
        // Calculate allocation
        let allocation = [];
        let remainingAmount = paymentAmount;
        
        if (paymentAllocationMode === 'auto') {
            for (const bill of selectedBillsForPayment) {
                if (remainingAmount <= 0) break;
                const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
                allocation.push({ bill, amount: amountToPay });
                remainingAmount -= amountToPay;
            }
        } else if (paymentAllocationMode === 'select') {
            for (const bill of selectedBillsForPayment) {
                const checkbox = document.getElementById(`bill-${bill.id}`);
                if (checkbox && checkbox.checked) {
                    if (remainingAmount <= 0) break;
                    const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
                    allocation.push({ bill, amount: amountToPay });
                    remainingAmount -= amountToPay;
                }
            }
        } else if (paymentAllocationMode === 'exclude') {
            for (const bill of selectedBillsForPayment) {
                const checkbox = document.getElementById(`bill-${bill.id}`);
                if (checkbox && !checkbox.checked) {
                    if (remainingAmount <= 0) break;
                    const amountToPay = Math.min(remainingAmount, bill.remaining_amount);
                    allocation.push({ bill, amount: amountToPay });
                    remainingAmount -= amountToPay;
                }
            }
        }
        
        // Save a payment record per allocated bill (matches existing payments table schema)
        const account = accountsData.find(a => a.id === currentAccountId && a.account_type === currentAccountType);
        const user = await window.StorageModule.getCurrentUser();
        const paymentDate = new Date().toISOString().split('T')[0];
        
        // If there are allocated bills, save per-bill payments
        // If no bills (e.g. advance), save one general payment against a dummy transaction
        const billsToSave = allocation.length > 0 ? allocation : [{ bill: null, amount: paymentAmount }];
        
        for (const item of billsToSave) {
            // CRITICAL FIX: Handle opening balance differently
            const isOpeningBalance = item.bill && item.bill.isOpeningBalance;
            
            // For opening balance payments, use account ID as transaction_id so we can trace it later
            const txnId = isOpeningBalance ? currentAccountId : (item.bill ? item.bill.id : null);
            const isSaleBill = item.bill && !isOpeningBalance && (item.bill._billKind === 'sale' || currentAccountType === 'customer');
            const txnType = isOpeningBalance ? 'opening_balance'
                          : !item.bill       ? 'other'
                          : isSaleBill       ? 'sale'
                          :                   'purchase';
            
            const paymentData = {
                transaction_id: txnId,
                transaction_type: txnType,
                amount: item.amount,
                payment_method: paymentMethod,
                payment_date: paymentDate,
                notes: notes || (isOpeningBalance ? `Payment against opening balance (${currentAccountType})` : ''),
                is_nil: false,
                user_id: user.id
            };
            const paymentResult = await window.StorageModule.saveData('payments', paymentData);
            if (!paymentResult.success) {
                throw new Error('Failed to save payment: ' + paymentResult.error);
            }
        }
        
        // Update each bill's paid amount and remaining amount
        const accountTable = currentAccountType === 'customer' ? 'customers' : 'suppliers';

        for (const item of allocation) {
            if (item.bill.isOpeningBalance) {
                const newOpeningBalance = Math.max(0, item.bill.remaining_amount - item.amount);
                await window.StorageModule.updateData(accountTable, currentAccountId, {
                    opening_balance: newOpeningBalance
                });
                console.log('✅ Updated opening balance:', newOpeningBalance);
            } else {
                // Determine correct table: supplier sale bills update 'sales', everything else is normal
                const isSaleBill = item.bill._billKind === 'sale' || currentAccountType === 'customer';
                const billTable  = isSaleBill ? 'sales' : 'purchases';

                const newPaidAmount     = (item.bill.paid_amount || 0) + item.amount;
                const newRemainingAmount = item.bill.total - newPaidAmount;
                const newStatus = newRemainingAmount <= 0 ? 'paid'
                                : newPaidAmount > 0       ? 'partial'
                                :                           'pending';

                await window.StorageModule.updateData(billTable, item.bill.id, {
                    paid_amount:      newPaidAmount,
                    remaining_amount: newRemainingAmount,
                    payment_status:   newStatus
                });
            }
        }
        
        showAccountsNotification('Payment recorded successfully', 'success');
        paymentAllocationModal.classList.remove('active');
        await loadAccounts();
        
        // Refresh other modules if they exist
        if (window.SalesModule && window.SalesModule.loadSales) {
            await window.SalesModule.loadSales();
        }
        if (window.PurchasesModule && window.PurchasesModule.loadPurchases) {
            await window.PurchasesModule.loadPurchases();
        }
        
    } catch (error) {
        console.error('❌ Error saving payment:', error);
        showAccountsNotification('Error saving payment: ' + error.message, 'error');
    }
}

// ===== EXPORT LEDGER =====
function exportLedger(accountId) {
    const account = accountsData.find(a => a.id === accountId);
    if (!account) return;
    
    // Use displayedTransactions which respects the current filter
    const transactionsToExport = displayedTransactions.length > 0 ? displayedTransactions : accountTransactions;
    
    // Create CSV content with proper headers
    let csv = 'Date,Description,Debit,Credit,Balance\n';
    
    // Add each transaction row
    transactionsToExport.forEach(txn => {
        const date = formatDate(txn.date);
        const description = txn.description.replace(/"/g, '""'); // Escape quotes in description
        const debit = txn.debit || 0;
        const credit = txn.credit || 0;
        const balance = txn.balance || 0;
        
        // Quote the date field to handle commas in date format
        csv += `"${date}","${description}",${debit},${credit},${balance}\n`;
    });
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${account.name}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    const message = displayedTransactions.length > 0 && displayedTransactions.length < accountTransactions.length 
        ? `Ledger exported successfully (${displayedTransactions.length} filtered transactions)`
        : 'Ledger exported successfully';
    showAccountsNotification(message, 'success');
}

// ===== NOTIFICATION =====
function showAccountsNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        background: var(--color-elevated);
        border: 1px solid var(--color-border);
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    const colors = {
        success: 'var(--color-success)',
        error: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)'
    };
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 4px; height: 40px; background: ${colors[type]}; border-radius: 2px;"></div>
            <div style="color: var(--color-text-primary);">${message}</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Search
    if (accountsSearch) {
        accountsSearch.addEventListener('input', applyFilters);
    }
    
    // Type filter
    if (accountsTypeFilter) {
        accountsTypeFilter.addEventListener('change', applyFilters);
    }
    
    // Close modals
    if (closeAccountDetailModal) {
        closeAccountDetailModal.addEventListener('click', () => {
            accountDetailModal.classList.remove('active');
        });
    }
    if (closeAccountDetailBtn) {
        closeAccountDetailBtn.addEventListener('click', () => {
            accountDetailModal.classList.remove('active');
        });
    }
    
    if (closePaymentAllocationModal) {
        closePaymentAllocationModal.addEventListener('click', () => {
            paymentAllocationModal.classList.remove('active');
        });
    }
    
    if (closeOpeningBalanceModal) {
        closeOpeningBalanceModal.addEventListener('click', () => {
            openingBalanceModal.classList.remove('active');
        });
    }
    
    // Forms
    if (openingBalanceForm) {
        openingBalanceForm.addEventListener('submit', saveOpeningBalance);
    }
    
    if (paymentAllocationForm) {
        paymentAllocationForm.addEventListener('submit', savePaymentAllocation);
    }
    
    // Close modals on outside click
    if (accountDetailModal) {
        accountDetailModal.addEventListener('click', (e) => {
            if (e.target === accountDetailModal) {
                accountDetailModal.classList.remove('active');
            }
        });
    }
    
    if (paymentAllocationModal) {
        paymentAllocationModal.addEventListener('click', (e) => {
            if (e.target === paymentAllocationModal) {
                paymentAllocationModal.classList.remove('active');
            }
        });
    }
    
    if (openingBalanceModal) {
        openingBalanceModal.addEventListener('click', (e) => {
            if (e.target === openingBalanceModal) {
                openingBalanceModal.classList.remove('active');
            }
        });
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

// Export module functions
window.AccountsModule = {
        loadAccounts,
        viewAccountDetails,
        setOpeningBalance,
        makePayment,
        savePaymentAllocation,
        setAllocationMode,
        toggleBillSelection,
        updatePaymentAllocationSummary,
        applyDateFilter,
        clearDateFilter,
        exportLedger,
        toggleLedgerSales
    };

console.log('✅ Accounts Module Loaded Successfully');

/* ==========================================
   JS END: Accounts Module
   ========================================== */
})();