(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.XModule exports are accessible globally.
   This prevents applyFilters / updateSummaryStats / fmt / formatDate
   from colliding across modules.
   ========================================== */

/* ==========================================
   JS START: Customers Module
   ========================================== */

// ===== STATE =====
let customersData = [];
let filteredCustomers = [];
let editingCustomerId = null;
let deletingCustomerId = null;

// ===== DOM ELEMENTS =====
const customersSearch = document.getElementById('customers-search');
const customersGrid = document.getElementById('customers-grid');
const customersTotalCount = document.getElementById('customers-total-count');
const customersTotalRevenue = document.getElementById('customers-total-revenue');
const customersOutstanding = document.getElementById('customers-outstanding');
const customersAvgRevenue = document.getElementById('customers-avg-revenue');

// Add/Edit Customer Modal
const addCustomerBtn = document.getElementById('add-customer-btn');
const customerFormModal = document.getElementById('customer-form-modal');
const closeCustomerFormModal = document.getElementById('close-customer-form-modal');
const cancelCustomerFormBtn = document.getElementById('cancel-customer-form-btn');
const customerFormTitle = document.getElementById('customer-form-title');
const customerForm = document.getElementById('customer-form');
const saveCustomerBtn = document.getElementById('save-customer-btn');

// Form fields
const customerName = document.getElementById('customer-name');
const customerPhone = document.getElementById('customer-phone');
const customerEmail = document.getElementById('customer-email');
const customerAddress = document.getElementById('customer-address');
const customerNotes = document.getElementById('customer-notes');

// Customer Detail Modal
const customerDetailModal = document.getElementById('customer-detail-modal');
const closeCustomerDetailModal = document.getElementById('close-customer-detail-modal');
const closeCustomerDetailBtn = document.getElementById('close-customer-detail-btn');
const customerDetailContent = document.getElementById('customer-detail-content');

// Delete Customer Modal
const deleteCustomerModal = document.getElementById('delete-customer-modal');
const closeDeleteCustomerModal = document.getElementById('close-delete-customer-modal');
const cancelDeleteCustomerBtn = document.getElementById('cancel-delete-customer-btn');
const confirmDeleteCustomerBtn = document.getElementById('confirm-delete-customer-btn');
const deleteCustomerName = document.getElementById('delete-customer-name');

// ===== HELPERS =====
// Use centralized formatter
const fmt = window.Utils.fmt;

// Validation helpers available:
// window.Utils.validateEmail(email)
// window.Utils.validatePhone(phone)

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ===== LOAD CUSTOMERS =====
async function loadCustomers() {
    try {
        window.log('🔄 Loading customers...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            window.log('⚠️ No user logged in');
            return;
        }

        const result = await window.StorageModule.getAllData('customers');
        
        if (result.success) {
            customersData = result.data || [];
            window.log('✅ Loaded', customersData.length, 'customers');
            
            // Load sales data for each customer
            await loadCustomerSalesData();
            
            // Apply filters
            applyFilters();
        } else {
            logError('❌ Failed to load customers:', result.error);
            showCustomersNotification('Failed to load customers', 'error');
        }
    } catch (error) {
        logError('❌ Error loading customers:', error);
        showCustomersNotification('Error loading customers', 'error');
    }
}

// ===== LOAD CUSTOMER SALES DATA =====
async function loadCustomerSalesData() {
    try {
        const salesResult = await window.StorageModule.getAllData('sales');
        const sales = salesResult.success ? salesResult.data : [];

        // CRITICAL FIX: Load returns to calculate net revenue
        const returnsResult = await window.StorageModule.getAllData('returns');
        const returns = returnsResult.success ? returnsResult.data : [];
        const saleReturns = returns.filter(r => r.return_type === 'sale');

        // Calculate stats for each customer
        // Use customer_id FK when available, fall back to phone match (more reliable than name)
        customersData.forEach(customer => {
            const customerSales = sales.filter(s => 
                (s.customer_id && s.customer_id === customer.id) ||
                (!s.customer_id && s.customer_phone && s.customer_phone === customer.phone)
            );

            // CRITICAL FIX: Get sale IDs to match returns
            const customerSaleIds = customerSales.map(s => s.id);
            
            // Match returns by original_transaction_id (which is the sale ID)
            const customerReturns = saleReturns.filter(r => 
                customerSaleIds.includes(r.original_transaction_id)
            );

            const totalSalesGross = customerSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const totalReturns = customerReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);

            customer.totalPurchases = customerSales.length;
            // Net revenue = Gross sales - Returns
            customer.totalRevenue = totalSalesGross - totalReturns;
            // CRITICAL FIX: Include opening balance in outstanding calculation
            customer.totalOutstanding = (customer.opening_balance || 0) + customerSales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);
            customer.lastPurchase = customerSales.length > 0 
                ? customerSales.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))[0].sale_date
                : null;
        });

    } catch (error) {
        logError('❌ Error loading customer sales data:', error);
    }
}

// ===== APPLY FILTERS =====
function applyFilters() {
    const searchTerm = customersSearch ? customersSearch.value.toLowerCase().trim() : '';

    filteredCustomers = customersData.filter(customer => {
        // If search is empty, match all
        if (!searchTerm) return true;
        
        return (customer.name && customer.name.toLowerCase().includes(searchTerm)) ||
               (customer.phone && customer.phone.includes(searchTerm)) ||
               (customer.email && customer.email.toLowerCase().includes(searchTerm));
    });

    window.log('🔍 Filtered customers:', filteredCustomers.length, 'of', customersData.length);
    renderCustomers();
    updateSummaryStats();
}

// ===== RENDER CUSTOMERS GRID =====
function renderCustomers() {
    if (filteredCustomers.length === 0) {
        customersGrid.innerHTML = `
            <div class="customers-empty-state">
                <div style="font-size: 4rem; margin-bottom: 1rem;">👥</div>
                <h3>${customersData.length === 0 ? 'No customers yet' : 'No customers found'}</h3>
                <p>${customersData.length === 0 ? 'Click "Add Customer" to create your first customer' : 'Try adjusting your search'}</p>
            </div>
        `;
        return;
    }

    customersGrid.innerHTML = filteredCustomers.map(customer => `
        <div class="customer-card">
            <div class="customer-card-header">
                <div class="customer-card-info">
                    <div class="customer-card-avatar">${getInitials(customer.name)}</div>
                    <div class="customer-card-name">${customer.name || 'Unknown'}</div>
                </div>
            </div>

            <div class="customer-card-contact">
                ${customer.phone ? `
                    <div class="customer-card-phone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        ${customer.phone}
                    </div>
                ` : ''}
                ${customer.email ? `
                    <div class="customer-card-email">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        ${customer.email}
                    </div>
                ` : ''}
            </div>

            <div class="customer-card-stats">
                <div class="customer-stat">
                    <span class="customer-stat-label">Total Sales</span>
                    <span class="customer-stat-value success">${fmt(customer.totalRevenue || 0)}</span>
                </div>
                <div class="customer-stat">
                    <span class="customer-stat-label">Outstanding</span>
                    <span class="customer-stat-value warning">${fmt(customer.totalOutstanding || 0)}</span>
                </div>
            </div>

            <div class="customer-card-actions">
                <button class="customer-card-btn view" onclick="viewCustomerDetails('${customer.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    View
                </button>
                <button class="customer-card-btn edit" onclick="editCustomer('${customer.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                </button>
                <button class="customer-card-btn delete" onclick="confirmDeleteCustomer('${customer.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

// ===== UPDATE SUMMARY STATS =====
function updateSummaryStats() {
    const totalCount = customersData.length;
    const totalRevenue = customersData.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
    const outstanding = customersData.reduce((sum, c) => sum + (c.totalOutstanding || 0), 0);
    const avgRevenue = totalCount > 0 ? totalRevenue / totalCount : 0;

    if (customersTotalCount) customersTotalCount.textContent = totalCount;
    if (customersTotalRevenue) customersTotalRevenue.textContent = fmt(totalRevenue);
    if (customersOutstanding) customersOutstanding.textContent = fmt(outstanding);
    if (customersAvgRevenue) customersAvgRevenue.textContent = fmt(avgRevenue);
}

// ===== ADD CUSTOMER =====
addCustomerBtn.addEventListener('click', () => {
    editingCustomerId = null;
    customerFormTitle.textContent = 'Add Customer';
    customerForm.reset();
    customerFormModal.classList.add('active');
});

// ===== EDIT CUSTOMER =====
window.editCustomer = function(customerId) {
    const customer = customersData.find(c => c.id === customerId);
    if (!customer) return;

    editingCustomerId = customerId;
    customerFormTitle.textContent = 'Edit Customer';
    
    customerName.value = customer.name || '';
    customerPhone.value = customer.phone || '';
    customerEmail.value = customer.email || '';
    customerAddress.value = customer.address || '';
    customerNotes.value = customer.notes || '';

    customerFormModal.classList.add('active');
};

// ===== SAVE CUSTOMER =====
customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    saveCustomerBtn.disabled = true;
    saveCustomerBtn.textContent = '⏳ Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const customerData = {
            name: customerName.value.trim(),
            phone: customerPhone.value.trim(),
            email: customerEmail.value.trim(),
            address: customerAddress.value.trim(),
            notes: customerNotes.value.trim()
        };

        let result;
        if (editingCustomerId) {
            // Update existing customer
            result = await window.StorageModule.updateData('customers', editingCustomerId, customerData);
            if (result.success) {
                showCustomersNotification('✅ Customer updated successfully', 'success');
            }
        } else {
            // Create new customer
            result = await window.StorageModule.saveData('customers', customerData);
            if (result.success) {
                showCustomersNotification('✅ Customer added successfully', 'success');
            }
        }

        if (result.success) {
            customerFormModal.classList.remove('active');
            await loadCustomers();
            // Refresh accounts module
            if (window.CustomersModule.refreshAccounts) {
                window.CustomersModule.refreshAccounts();
            }
        } else {
            showCustomersNotification('Failed to save customer', 'error');
        }

    } catch (error) {
        logError('❌ Error saving customer:', error);
        showCustomersNotification('Error saving customer', 'error');
    } finally {
        saveCustomerBtn.disabled = false;
        saveCustomerBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Customer
        `;
    }
});

// ===== VIEW CUSTOMER DETAILS =====
window.viewCustomerDetails = async function(customerId) {
    try {
        const customer = customersData.find(c => c.id === customerId);
        if (!customer) return;

        // Get customer sales
        const salesResult = await window.StorageModule.getAllData('sales');
        const sales = salesResult.success ? salesResult.data : [];
        const customerSales = sales.filter(s => 
            (s.customer_id && s.customer_id === customer.id) ||
            (!s.customer_id && s.customer_phone && s.customer_phone === customer.phone)
        ).sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));

        customerDetailContent.innerHTML = `
            <div class="customer-detail-header">
                <div class="customer-detail-avatar">${getInitials(customer.name)}</div>
                <div class="customer-detail-info">
                    <div class="customer-detail-name">${customer.name || 'Unknown'}</div>
                    <div class="customer-detail-contact">
                        ${customer.phone ? `
                            <div class="customer-detail-contact-item">
                                📞 ${customer.phone}
                            </div>
                        ` : ''}
                        ${customer.email ? `
                            <div class="customer-detail-contact-item">
                                📧 ${customer.email}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="customer-detail-stats">
                <div class="customer-detail-stat-card">
                    <div class="customer-detail-stat-label">Total Purchases</div>
                    <div class="customer-detail-stat-value">${customer.totalPurchases || 0}</div>
                </div>
                <div class="customer-detail-stat-card">
                    <div class="customer-detail-stat-label">Total Revenue</div>
                    <div class="customer-detail-stat-value success">${fmt(customer.totalRevenue || 0)}</div>
                </div>
                <div class="customer-detail-stat-card">
                    <div class="customer-detail-stat-label">Outstanding</div>
                    <div class="customer-detail-stat-value warning">${fmt(customer.totalOutstanding || 0)}</div>
                </div>
            </div>

            ${customer.address || customer.notes ? `
                <div class="customer-detail-section">
                    <div class="customer-detail-section-title">📋 Additional Information</div>
                    <div class="customer-detail-info-grid">
                        ${customer.address ? `
                            <div class="customer-detail-info-item">
                                <div class="customer-detail-info-label">Address</div>
                                <div class="customer-detail-info-value">${customer.address}</div>
                            </div>
                        ` : ''}
                        ${customer.notes ? `
                            <div class="customer-detail-info-item">
                                <div class="customer-detail-info-label">Notes</div>
                                <div class="customer-detail-info-value">${customer.notes}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

            <div class="customer-detail-section">
                <div class="customer-detail-section-title">🛒 Purchase History (${customerSales.length})</div>
                ${customerSales.length > 0 ? `
                    <div class="customer-detail-purchases-list">
                        ${customerSales.map(sale => `
                            <div class="customer-detail-purchase-item">
                                <div class="customer-detail-purchase-info">
                                    <div class="customer-detail-purchase-id">${sale.invoice_id || 'N/A'}</div>
                                    <div class="customer-detail-purchase-date">${formatDate(sale.sale_date || sale.created_at)}</div>
                                </div>
                                <div class="customer-detail-purchase-amount">${fmt(sale.total || 0)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="customer-detail-no-purchases">
                        <p>No purchases yet</p>
                    </div>
                `}
            </div>
        `;

        customerDetailModal.classList.add('active');

    } catch (error) {
        logError('❌ Error viewing customer:', error);
        showCustomersNotification('Error loading customer details', 'error');
    }
};

// ===== DELETE CUSTOMER =====
window.confirmDeleteCustomer = function(customerId) {
    const customer = customersData.find(c => c.id === customerId);
    if (!customer) return;

    deletingCustomerId = customerId;
    deleteCustomerName.textContent = customer.name || 'this customer';
    deleteCustomerModal.classList.add('active');
};

confirmDeleteCustomerBtn.addEventListener('click', async () => {
    if (!deletingCustomerId) return;

    confirmDeleteCustomerBtn.disabled = true;
    confirmDeleteCustomerBtn.textContent = '⏳ Deleting...';

    try {
        // Block delete if customer has sales records
        const saleCheck = await window.StorageModule.supabase
            .from('sales').select('id').eq('customer_id', deletingCustomerId).limit(1);
        if (saleCheck.data?.length > 0) {
            showCustomersNotification('Cannot delete — this customer has sales records. Archive them instead.', 'error');
            deleteCustomerModal.classList.remove('active');
            confirmDeleteCustomerBtn.disabled = false;
            confirmDeleteCustomerBtn.textContent = 'Delete Customer';
            return;
        }

        const result = await window.StorageModule.deleteData('customers', deletingCustomerId);

        if (result.success) {
            showCustomersNotification('✅ Customer deleted successfully', 'success');
            deleteCustomerModal.classList.remove('active');
            deletingCustomerId = null;
            await loadCustomers();
            // Refresh accounts module
            if (window.CustomersModule.refreshAccounts) {
                window.CustomersModule.refreshAccounts();
            }
        } else {
            showCustomersNotification('Failed to delete customer', 'error');
        }

    } catch (error) {
        logError('❌ Error deleting customer:', error);
        showCustomersNotification('Error deleting customer', 'error');
    } finally {
        confirmDeleteCustomerBtn.disabled = false;
        confirmDeleteCustomerBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete Customer
        `;
    }
});

// ===== EVENT LISTENERS =====
customersSearch.addEventListener('input', applyFilters);

closeCustomerFormModal.addEventListener('click', () => customerFormModal.classList.remove('active'));
cancelCustomerFormBtn.addEventListener('click', () => customerFormModal.classList.remove('active'));

closeCustomerDetailModal.addEventListener('click', () => customerDetailModal.classList.remove('active'));
closeCustomerDetailBtn.addEventListener('click', () => customerDetailModal.classList.remove('active'));

closeDeleteCustomerModal.addEventListener('click', () => deleteCustomerModal.classList.remove('active'));
cancelDeleteCustomerBtn.addEventListener('click', () => deleteCustomerModal.classList.remove('active'));

customerFormModal.addEventListener('click', (e) => {
    if (e.target === customerFormModal) customerFormModal.classList.remove('active');
});
customerDetailModal.addEventListener('click', (e) => {
    if (e.target === customerDetailModal) customerDetailModal.classList.remove('active');
});
deleteCustomerModal.addEventListener('click', (e) => {
    if (e.target === deleteCustomerModal) deleteCustomerModal.classList.remove('active');
});

// ===== NOTIFICATION =====
function showCustomersNotification(msg, type) {
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.innerHTML = `<div class="notification-content">
        <span class="notification-icon">${type==='success'?'✓':'✕'}</span>
        <span class="notification-message">${msg}</span>
    </div>`;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 10);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3500);
}

// ===== INIT =====
async function initCustomersPage() {
    window.log('🚀 Initializing Customers Page...');
    
    // CRITICAL FIX: Clear search filter on page load
    const customersSearch = document.getElementById('customers-search');
    if (customersSearch) customersSearch.value = '';
    
    // ... rest of existing code
    
    await loadCustomers();
}

window.CustomersModule = { initCustomersPage, loadCustomers };

// Refresh accounts when customers are updated
window.CustomersModule.refreshAccounts = function() {
    if (window.AccountsModule && window.AccountsModule.loadAccounts) {
        window.AccountsModule.loadAccounts();
    }
};

window.log('✅ Customers Module Loaded');

/* ==========================================
   JS END: Customers Module
   ========================================== */
})(); // end IIFE