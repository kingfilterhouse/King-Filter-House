(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.XModule exports are accessible globally.
   This prevents applyFilters / updateSummaryStats / fmt / formatDate
   from colliding across modules.
   ========================================== */

/* ==========================================
   JS START: Suppliers Module
   ========================================== */

// ===== STATE =====
let suppliersData = [];
let filteredSuppliers = [];
let editingSupplierId = null;
let deletingSupplierId = null;

// ===== DOM ELEMENTS =====
const suppliersSearch = document.getElementById('suppliers-search');
const suppliersGrid = document.getElementById('suppliers-grid');
const suppliersTotalCount = document.getElementById('suppliers-total-count');
const suppliersTotalPurchases = document.getElementById('suppliers-total-purchases');
const suppliersOwed = document.getElementById('suppliers-owed');
const suppliersAvgPurchases = document.getElementById('suppliers-avg-purchases');

// Add/Edit Supplier Modal
const addSupplierBtn = document.getElementById('add-supplier-btn');
const supplierFormModal = document.getElementById('supplier-form-modal');
const closeSupplierFormModal = document.getElementById('close-supplier-form-modal');
const cancelSupplierFormBtn = document.getElementById('cancel-supplier-form-btn');
const supplierFormTitle = document.getElementById('supplier-form-title');
const supplierForm = document.getElementById('supplier-form');
const saveSupplierBtn = document.getElementById('save-supplier-btn');

// Form fields
const supplierName = document.getElementById('supplier-name');
const supplierPhone = document.getElementById('supplier-phone');
const supplierEmail = document.getElementById('supplier-email');
const supplierAddress = document.getElementById('supplier-address');
const supplierNotes = document.getElementById('supplier-notes');

// Supplier Detail Modal
const supplierDetailModal = document.getElementById('supplier-detail-modal');
const closeSupplierDetailModal = document.getElementById('close-supplier-detail-modal');
const closeSupplierDetailBtn = document.getElementById('close-supplier-detail-btn');
const supplierDetailContent = document.getElementById('supplier-detail-content');

// Delete Supplier Modal
const deleteSupplierModal = document.getElementById('delete-supplier-modal');
const closeDeleteSupplierModal = document.getElementById('close-delete-supplier-modal');
const cancelDeleteSupplierBtn = document.getElementById('cancel-delete-supplier-btn');
const confirmDeleteSupplierBtn = document.getElementById('confirm-delete-supplier-btn');
const deleteSupplierName = document.getElementById('delete-supplier-name');

// ===== HELPERS =====
function fmt(n) {
    return 'PKR ' + Math.round(n).toLocaleString();
}

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

// ===== LOAD SUPPLIERS =====
async function loadSuppliers() {
    try {
        console.log('🔄 Loading suppliers...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in');
            return;
        }

        const result = await window.StorageModule.getAllData('suppliers');
        
        if (result.success) {
            suppliersData = result.data || [];
            console.log('✅ Loaded', suppliersData.length, 'suppliers');
            
            // Load purchases data for each supplier
            await loadSupplierPurchasesData();
            
            // Apply filters
            applyFilters();
        } else {
            console.error('❌ Failed to load suppliers:', result.error);
            showSuppliersNotification('Failed to load suppliers', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading suppliers:', error);
        showSuppliersNotification('Error loading suppliers', 'error');
    }
}

// ===== LOAD SUPPLIER PURCHASES DATA =====
async function loadSupplierPurchasesData() {
    try {
        const purchasesResult = await window.StorageModule.getAllData('purchases');
        const purchases = purchasesResult.success ? purchasesResult.data : [];

        // Load sales TO suppliers (supplier-as-customer feature)
        const salesResult = await window.StorageModule.getAllData('sales');
        const allSales = salesResult.success ? salesResult.data : [];

        // CRITICAL FIX: Load returns to calculate net purchases
        const returnsResult = await window.StorageModule.getAllData('returns');
        const returns = returnsResult.success ? returnsResult.data : [];
        const purchaseReturns = returns.filter(r => r.return_type === 'purchase');

        // Calculate stats for each supplier
        // Use supplier_id FK when available, fall back to phone match (more reliable than name)
        suppliersData.forEach(supplier => {
            const supplierPurchases = purchases.filter(p => 
                (p.supplier_id && p.supplier_id === supplier.id) ||
                (!p.supplier_id && p.supplier_phone && p.supplier_phone === supplier.phone)
            );

            // CRITICAL FIX: Get purchase IDs to match returns
            const supplierPurchaseIds = supplierPurchases.map(p => p.id);
            
            // Match returns by original_transaction_id (which is the purchase ID)
            const supplierReturns = purchaseReturns.filter(r => 
                supplierPurchaseIds.includes(r.original_transaction_id)
            );

            const totalPurchasesGross = supplierPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
            const totalReturns = supplierReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);

            supplier.totalOrders   = supplierPurchases.length;
            supplier.totalPurchased = totalPurchasesGross - totalReturns;
            // Raw purchase outstanding (what you owe them, before netting sales)
            supplier.rawPurchaseOwed = (supplier.opening_balance || 0) + supplierPurchases.reduce((sum, p) => sum + (p.remaining_amount || 0), 0);
            supplier.totalOwed = supplier.rawPurchaseOwed; // kept for backward compat
            supplier.lastOrder = supplierPurchases.length > 0 
                ? supplierPurchases.sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date))[0].purchase_date
                : null;

            // ── Supplier-as-Customer: sales TO this supplier ──
            const supplierSales = allSales.filter(s => s.supplier_id === supplier.id);
            supplier.totalSoldToSupplier = supplierSales.reduce((sum, s) => sum + (s.total || 0), 0);
            supplier.totalSaleOrders     = supplierSales.length;
            // Raw sales receivable (what they owe you on unpaid sale invoices)
            supplier.supplierReceivable  = supplierSales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);
            // Store sale records on the supplier for the detail modal
            supplier._sales = supplierSales.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
        });

    } catch (error) {
        console.error('❌ Error loading supplier purchases data:', error);
    }
}

// ===== APPLY FILTERS =====
function applyFilters() {
    const searchTerm = suppliersSearch ? suppliersSearch.value.toLowerCase().trim() : '';

    filteredSuppliers = suppliersData.filter(supplier => {
        // If search is empty, match all
        if (!searchTerm) return true;
        
        return (supplier.name && supplier.name.toLowerCase().includes(searchTerm)) ||
               (supplier.phone && supplier.phone.includes(searchTerm)) ||
               (supplier.email && supplier.email.toLowerCase().includes(searchTerm));
    });

    console.log('🔍 Filtered suppliers:', filteredSuppliers.length, 'of', suppliersData.length);
    renderSuppliers();
    updateSummaryStats();
}

// ===== RENDER SUPPLIERS GRID =====
function renderSuppliers() {
    if (filteredSuppliers.length === 0) {
        suppliersGrid.innerHTML = `
            <div class="suppliers-empty-state">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🚚</div>
                <h3>${suppliersData.length === 0 ? 'No suppliers yet' : 'No suppliers found'}</h3>
                <p>${suppliersData.length === 0 ? 'Click "Add Supplier" to create your first supplier' : 'Try adjusting your search'}</p>
            </div>
        `;
        return;
    }

    suppliersGrid.innerHTML = filteredSuppliers.map(supplier => `
        <div class="supplier-card">
            <div class="supplier-card-header">
                <div class="supplier-card-info">
                    <div class="supplier-card-avatar">${getInitials(supplier.name)}</div>
                    <div class="supplier-card-name">${supplier.name || 'Unknown'}</div>
                </div>
            </div>

            <div class="supplier-card-contact">
                ${supplier.phone ? `
                    <div class="supplier-card-phone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        ${supplier.phone}
                    </div>
                ` : ''}
                ${supplier.email ? `
                    <div class="supplier-card-email">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        ${supplier.email}
                    </div>
                ` : ''}
            </div>

            <div class="supplier-card-stats">
                <div class="supplier-stat">
                    <span class="supplier-stat-label">Total Purchased</span>
                    <span class="supplier-stat-value danger">${fmt(supplier.totalPurchased || 0)}</span>
                </div>
                <div class="supplier-stat">
                    <span class="supplier-stat-label">Amount Owed</span>
                    <span class="supplier-stat-value warning">${fmt(supplier.totalOwed || 0)}</span>
                </div>
                ${(supplier.totalSoldToSupplier || 0) > 0 ? `
                <div class="supplier-sales-line">
                    <span class="supplier-stat-label">🧾 Sold To Supplier</span>
                    <span class="supplier-stat-value success">${fmt(supplier.totalSoldToSupplier)}</span>
                </div>
                <div class="supplier-sales-line">
                    <span class="supplier-stat-label">Receivable From Them</span>
                    <span class="supplier-stat-value info">${fmt(supplier.supplierReceivable || 0)}</span>
                </div>
                ` : ''}
            </div>

            <div class="supplier-card-actions">
                <button class="supplier-card-btn view" onclick="viewSupplierDetails('${supplier.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    View
                </button>
                <button class="supplier-card-btn edit" onclick="editSupplier('${supplier.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                </button>
                <button class="supplier-card-btn delete" onclick="confirmDeleteSupplier('${supplier.id}')">
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
    const totalCount = suppliersData.length;
    const totalPurchases = suppliersData.reduce((sum, s) => sum + (s.totalPurchased || 0), 0);
    const owed = suppliersData.reduce((sum, s) => sum + (s.totalOwed || 0), 0);
    const avgPurchases = totalCount > 0 ? totalPurchases / totalCount : 0;

    if (suppliersTotalCount) suppliersTotalCount.textContent = totalCount;
    if (suppliersTotalPurchases) suppliersTotalPurchases.textContent = fmt(totalPurchases);
    if (suppliersOwed) suppliersOwed.textContent = fmt(owed);
    if (suppliersAvgPurchases) suppliersAvgPurchases.textContent = fmt(avgPurchases);
}

// ===== ADD SUPPLIER =====
addSupplierBtn.addEventListener('click', () => {
    editingSupplierId = null;
    supplierFormTitle.textContent = 'Add Supplier';
    supplierForm.reset();
    supplierFormModal.classList.add('active');
});

// ===== EDIT SUPPLIER =====
window.editSupplier = function(supplierId) {
    const supplier = suppliersData.find(s => s.id === supplierId);
    if (!supplier) return;

    editingSupplierId = supplierId;
    supplierFormTitle.textContent = 'Edit Supplier';
    
    supplierName.value = supplier.name || '';
    supplierPhone.value = supplier.phone || '';
    supplierEmail.value = supplier.email || '';
    supplierAddress.value = supplier.address || '';
    supplierNotes.value = supplier.notes || '';

    supplierFormModal.classList.add('active');
};

// ===== SAVE SUPPLIER =====
supplierForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    saveSupplierBtn.disabled = true;
    saveSupplierBtn.textContent = '⏳ Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const supplierData = {
            user_id: user.id,
            name: supplierName.value.trim(),
            phone: supplierPhone.value.trim(),
            email: supplierEmail.value.trim(),
            address: supplierAddress.value.trim(),
            notes: supplierNotes.value.trim()
        };

        let result;
        if (editingSupplierId) {
            // Update existing supplier
            result = await window.StorageModule.updateData('suppliers', editingSupplierId, supplierData);
            if (result.success) {
                showSuppliersNotification('✅ Supplier updated successfully', 'success');
            }
        } else {
            // Create new supplier
            result = await window.StorageModule.saveData('suppliers', supplierData);
            if (result.success) {
                showSuppliersNotification('✅ Supplier added successfully', 'success');
            }
        }

        if (result.success) {
            supplierFormModal.classList.remove('active');
            await loadSuppliers();
            
            // Refresh accounts module
            if (window.SuppliersModule.refreshAccounts) {
                window.SuppliersModule.refreshAccounts();
            }
            
            // Reload Quick Purchase suppliers if available
            if (window.QuickPurchaseModule && window.QuickPurchaseModule.loadPurchaseProducts) {
                await window.QuickPurchaseModule.loadPurchaseProducts();
            }
        } else {
            showSuppliersNotification('Failed to save supplier', 'error');
        }

    } catch (error) {
        console.error('❌ Error saving supplier:', error);
        showSuppliersNotification('Error saving supplier', 'error');
    } finally {
        saveSupplierBtn.disabled = false;
        saveSupplierBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Supplier
        `;
    }
});

// ===== VIEW SUPPLIER DETAILS =====
window.viewSupplierDetails = async function(supplierId) {
    try {
        const supplier = suppliersData.find(s => s.id === supplierId);
        if (!supplier) return;

        // Get supplier purchases
        const purchasesResult = await window.StorageModule.getAllData('purchases');
        const purchases = purchasesResult.success ? purchasesResult.data : [];
        const supplierPurchases = purchases.filter(p => 
            (p.supplier_id && p.supplier_id === supplier.id) ||
            (!p.supplier_id && p.supplier_phone && p.supplier_phone === supplier.phone)
        ).sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date));

        // Sales to this supplier (already computed in loadSupplierPurchasesData)
        const supplierSales = supplier._sales || [];
        const hasSales = supplierSales.length > 0;

        const netBalance = (supplier.rawPurchaseOwed || 0) - (supplier.supplierReceivable || 0);
        const netClass   = netBalance > 0 ? 'danger' : netBalance < 0 ? 'success' : 'muted';
        const netLabel   = netBalance > 0 ? 'You owe them' : netBalance < 0 ? 'They owe you' : 'Settled';

        supplierDetailContent.innerHTML = `
            <div class="supplier-detail-header">
                <div class="supplier-detail-avatar">${getInitials(supplier.name)}</div>
                <div class="supplier-detail-info">
                    <div class="supplier-detail-name">${supplier.name || 'Unknown'}</div>
                    <div class="supplier-detail-contact">
                        ${supplier.phone ? `<div class="supplier-detail-contact-item">📞 ${supplier.phone}</div>` : ''}
                        ${supplier.email ? `<div class="supplier-detail-contact-item">📧 ${supplier.email}</div>` : ''}
                    </div>
                </div>
            </div>

            <div class="supplier-detail-stats">
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Purchase Orders</div>
                    <div class="supplier-detail-stat-value">${supplier.totalOrders || 0}</div>
                </div>
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Total Purchased</div>
                    <div class="supplier-detail-stat-value danger">${fmt(supplier.totalPurchased || 0)}</div>
                </div>
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Purchase Outstanding</div>
                    <div class="supplier-detail-stat-value warning">${fmt(supplier.rawPurchaseOwed || 0)}</div>
                </div>
                ${hasSales ? `
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Sale Orders</div>
                    <div class="supplier-detail-stat-value">${supplier.totalSaleOrders || 0}</div>
                </div>
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Total Sold To Them</div>
                    <div class="supplier-detail-stat-value success">${fmt(supplier.totalSoldToSupplier || 0)}</div>
                </div>
                <div class="supplier-detail-stat-card">
                    <div class="supplier-detail-stat-label">Sales Receivable</div>
                    <div class="supplier-detail-stat-value info">${fmt(supplier.supplierReceivable || 0)}</div>
                </div>
                <div class="supplier-detail-stat-card" style="grid-column: 1 / -1; border-top: 2px solid var(--color-border); margin-top: 0.25rem; padding-top: 0.75rem;">
                    <div class="supplier-detail-stat-label">Net Balance (${netLabel})</div>
                    <div class="supplier-detail-stat-value ${netClass}">${fmt(Math.abs(netBalance))}</div>
                </div>
                ` : ''}
            </div>

            ${supplier.address || supplier.notes ? `
                <div class="supplier-detail-section">
                    <div class="supplier-detail-section-title">📋 Additional Information</div>
                    <div class="supplier-detail-info-grid">
                        ${supplier.address ? `<div class="supplier-detail-info-item"><div class="supplier-detail-info-label">Address</div><div class="supplier-detail-info-value">${supplier.address}</div></div>` : ''}
                        ${supplier.notes   ? `<div class="supplier-detail-info-item"><div class="supplier-detail-info-label">Notes</div><div class="supplier-detail-info-value">${supplier.notes}</div></div>`   : ''}
                    </div>
                </div>
            ` : ''}

            <div class="supplier-detail-section">
                <div class="supplier-detail-section-title">🛒 Purchase History (${supplierPurchases.length})</div>
                ${supplierPurchases.length > 0 ? `
                    <div class="supplier-detail-purchases-list">
                        ${supplierPurchases.map(p => `
                            <div class="supplier-detail-purchase-item">
                                <div class="supplier-detail-purchase-info">
                                    <div class="supplier-detail-purchase-id">${p.purchase_id || 'N/A'}</div>
                                    <div class="supplier-detail-purchase-date">${formatDate(p.purchase_date || p.created_at)}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div class="supplier-detail-purchase-amount">${fmt(p.total || 0)}</div>
                                    ${p.remaining_amount > 0 ? `<div style="font-size:0.75rem;color:var(--color-warning);">Due: ${fmt(p.remaining_amount)}</div>` : `<div style="font-size:0.75rem;color:var(--color-success);">Paid</div>`}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `<div class="supplier-detail-no-purchases"><p>No purchases yet</p></div>`}
            </div>

            ${hasSales ? `
            <div class="supplier-detail-section">
                <div class="supplier-detail-section-title">🧾 Sales to This Supplier (${supplierSales.length})</div>
                <div class="supplier-detail-purchases-list">
                    ${supplierSales.map(s => `
                        <div class="supplier-detail-purchase-item">
                            <div class="supplier-detail-purchase-info">
                                <div class="supplier-detail-purchase-id">${s.invoice_id || 'N/A'}</div>
                                <div class="supplier-detail-purchase-date">${formatDate(s.sale_date || s.created_at)}</div>
                            </div>
                            <div style="text-align:right;">
                                <div class="supplier-detail-purchase-amount" style="color:var(--color-success);">${fmt(s.total || 0)}</div>
                                ${s.remaining_amount > 0 ? `<div style="font-size:0.75rem;color:var(--color-info);">Receivable: ${fmt(s.remaining_amount)}</div>` : `<div style="font-size:0.75rem;color:var(--color-success);">Collected</div>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;

        supplierDetailModal.classList.add('active');

    } catch (error) {
        console.error('❌ Error viewing supplier:', error);
        showSuppliersNotification('Error loading supplier details', 'error');
    }
};

// ===== DELETE SUPPLIER =====
window.confirmDeleteSupplier = function(supplierId) {
    const supplier = suppliersData.find(s => s.id === supplierId);
    if (!supplier) return;

    deletingSupplierId = supplierId;
    deleteSupplierName.textContent = supplier.name || 'this supplier';
    deleteSupplierModal.classList.add('active');
};

confirmDeleteSupplierBtn.addEventListener('click', async () => {
    if (!deletingSupplierId) return;

    confirmDeleteSupplierBtn.disabled = true;
    confirmDeleteSupplierBtn.textContent = '⏳ Deleting...';

    try {
        const result = await window.StorageModule.deleteData('suppliers', deletingSupplierId);

        if (result.success) {
            showSuppliersNotification('✅ Supplier deleted successfully', 'success');
            deleteSupplierModal.classList.remove('active');
            deletingSupplierId = null;
            await loadSuppliers();
            // Refresh accounts module
            if (window.SuppliersModule.refreshAccounts) {
                window.SuppliersModule.refreshAccounts();
            }
        } else {
            showSuppliersNotification('Failed to delete supplier', 'error');
        }

    } catch (error) {
        console.error('❌ Error deleting supplier:', error);
        showSuppliersNotification('Error deleting supplier', 'error');
    } finally {
        confirmDeleteSupplierBtn.disabled = false;
        confirmDeleteSupplierBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete Supplier
        `;
    }
});

// ===== EVENT LISTENERS =====
suppliersSearch.addEventListener('input', applyFilters);

closeSupplierFormModal.addEventListener('click', () => supplierFormModal.classList.remove('active'));
cancelSupplierFormBtn.addEventListener('click', () => supplierFormModal.classList.remove('active'));

closeSupplierDetailModal.addEventListener('click', () => supplierDetailModal.classList.remove('active'));
closeSupplierDetailBtn.addEventListener('click', () => supplierDetailModal.classList.remove('active'));

closeDeleteSupplierModal.addEventListener('click', () => deleteSupplierModal.classList.remove('active'));
cancelDeleteSupplierBtn.addEventListener('click', () => deleteSupplierModal.classList.remove('active'));

supplierFormModal.addEventListener('click', (e) => {
    if (e.target === supplierFormModal) supplierFormModal.classList.remove('active');
});
supplierDetailModal.addEventListener('click', (e) => {
    if (e.target === supplierDetailModal) supplierDetailModal.classList.remove('active');
});
deleteSupplierModal.addEventListener('click', (e) => {
    if (e.target === deleteSupplierModal) deleteSupplierModal.classList.remove('active');
});

// ===== NOTIFICATION =====
function showSuppliersNotification(msg, type) {
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
async function initSuppliersPage() {
    console.log('🚀 Initializing Suppliers Page...');
    
    // CRITICAL FIX: Clear search filter on page load
    const suppliersSearch = document.getElementById('suppliers-search');
    if (suppliersSearch) suppliersSearch.value = '';
    
    // ... rest of existing code
    
    await loadSuppliers();
}

window.SuppliersModule = { initSuppliersPage, loadSuppliers };

// Refresh accounts when suppliers are updated
window.SuppliersModule.refreshAccounts = function() {
    if (window.AccountsModule && window.AccountsModule.loadAccounts) {
        window.AccountsModule.loadAccounts();
    }
};

console.log('✅ Suppliers Module Loaded');

/* ==========================================
   JS END: Suppliers Module
   ========================================== */
})(); // end IIFE