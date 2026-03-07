(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.XModule exports are accessible globally.
   This prevents applyFilters / updateSummaryStats / fmt / formatDate
   from colliding across modules.
   ========================================== */

/* ==========================================
   JS START: Purchases Listing Module
   ========================================== */

// ===== STATE =====
let purchasesListData = [];
let filteredPurchasesData = [];
let currentPurchaseId     = null;
let _currentPurchase      = null;
let _currentPurchaseItems = [];
let deletingPurchaseId = null;
// Returned amount per purchase — populated in renderPurchases, consumed by updateSummaryStats
let returnedAmountByPurchaseId = {};

// ===== DOM ELEMENTS =====
const purchasesSearch = document.getElementById('purchases-search');
const purchasesStatusFilter = document.getElementById('purchases-status-filter');
const purchasesDateFrom = document.getElementById('purchases-date-from');
const purchasesDateTo = document.getElementById('purchases-date-to');
const applyPurchasesFilterBtn = document.getElementById('apply-purchases-filter');
const clearPurchasesFilterBtn = document.getElementById('clear-purchases-filter');
const purchasesTableBody = document.getElementById('purchases-table-body');
const purchasesTotalCount = document.getElementById('purchases-total-count');
const purchasesTotalCost = document.getElementById('purchases-total-cost');
const purchasesOwedAmount = document.getElementById('purchases-owed-amount');
const purchasesAvgValue = document.getElementById('purchases-avg-value');

// Modal elements
const purchaseDetailModal = document.getElementById('purchase-detail-modal');
const closePurchaseDetailModal = document.getElementById('close-purchase-detail-modal');
const closePurchaseDetailBtn = document.getElementById('close-purchase-detail-btn');
const purchaseDetailContent = document.getElementById('purchase-detail-content');
const printPurchaseBtn = document.getElementById('print-purchase-btn');

const deletePurchaseModal = document.getElementById('delete-purchase-modal');
const closeDeletePurchaseModal = document.getElementById('close-delete-purchase-modal');
const cancelDeletePurchaseBtn = document.getElementById('cancel-delete-purchase-btn');
const confirmDeletePurchaseBtn = document.getElementById('confirm-delete-purchase-btn');
const deletePurchasePONumber = document.getElementById('delete-purchase-po-number');

const editPurchaseModal = document.getElementById('edit-purchase-modal');
const closeEditPurchaseModal = document.getElementById('close-edit-purchase-modal');
const cancelEditPurchaseBtn = document.getElementById('cancel-edit-purchase-btn');
const saveEditPurchaseBtn = document.getElementById('save-edit-purchase-btn');

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

// ===== LOAD PURCHASES =====
async function loadPurchases() {
    try {
        console.log('🔄 Loading purchases...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in');
            return;
        }

        const result = await window.StorageModule.getAllData('purchases');
        
        if (result.success) {
            purchasesListData = result.data || [];
            console.log('✅ Loaded', purchasesListData.length, 'purchases');
            
            // Apply current filters
            await applyFilters();
        } else {
            console.error('❌ Failed to load purchases:', result.error);
            showPurchasesNotification('Failed to load purchases', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading purchases:', error);
        showPurchasesNotification('Error loading purchases', 'error');
    }
}

// ===== APPLY FILTERS =====
async function applyFilters() {
    try {
        const searchTerm = purchasesSearch ? purchasesSearch.value.toLowerCase().trim() : '';
        const statusFilter = purchasesStatusFilter ? purchasesStatusFilter.value : '';
        const dateFrom = purchasesDateFrom ? purchasesDateFrom.value : '';
        const dateTo = purchasesDateTo ? purchasesDateTo.value : '';

        filteredPurchasesData = purchasesListData.filter(purchase => {
            // Search filter - if empty, match all
            const matchesSearch = !searchTerm || 
                (purchase.purchase_id && purchase.purchase_id.toLowerCase().includes(searchTerm)) ||
                (purchase.supplier_name && purchase.supplier_name.toLowerCase().includes(searchTerm)) ||
                (purchase.supplier_phone && purchase.supplier_phone.includes(searchTerm));

            // Status filter - if empty, match all
            const matchesStatus = !statusFilter || purchase.payment_status === statusFilter;

            // Date filters
            const purchaseDate = new Date(purchase.purchase_date || purchase.created_at);
            const matchesDateFrom = !dateFrom || purchaseDate >= new Date(dateFrom);
            const matchesDateTo = !dateTo || purchaseDate <= new Date(dateTo + 'T23:59:59');

            return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
        });

        console.log('🔍 Filtered purchases:', filteredPurchasesData.length, 'of', purchasesListData.length);
        await renderPurchases();
        updateSummaryStats();
    } catch (error) {
        console.error('❌ Error in applyFilters:', error);
    }
}

// ===== RENDER PURCHASES TABLE =====
async function renderPurchases() {
    if (filteredPurchasesData.length === 0) {
        purchasesTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
                    <div style="font-size: 1.1rem; font-weight: 600;">No purchases found</div>
                    <div style="font-size: 0.9rem; margin-top: 0.5rem;">
                        ${purchasesListData.length === 0 ? 'Create your first purchase to see it here' : 'Try adjusting your filters'}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // Load purchase items for counting
    const purchaseItemsPromises = filteredPurchasesData.map(async (purchase) => {
        const itemsResult = await window.StorageModule.getPurchaseItems(purchase.id);
        return { purchaseId: purchase.id, items: itemsResult.data || [] };
    });

    const purchaseItemsData = await Promise.all(purchaseItemsPromises);
    const purchaseItemsMap = {};
    purchaseItemsData.forEach(({ purchaseId, items }) => {
        purchaseItemsMap[purchaseId] = items;
    });

    // Load returns — one query covers: badge display, net units, net amount, stats
    const returnsResult = await window.StorageModule.getAllData('returns');
    const purchasesWithReturns = new Set();
    const returnedQtyByPurchaseId = {};
    returnedAmountByPurchaseId = {}; // reset module-level map so updateSummaryStats sees fresh data

    if (returnsResult.success) {
        const purchaseReturns = returnsResult.data.filter(r => r.return_type === 'purchase');

        purchaseReturns.forEach(r => {
            purchasesWithReturns.add(r.original_transaction_id);
            // total_amount on the return record = refunded cost value for that return
            returnedAmountByPurchaseId[r.original_transaction_id] =
                (returnedAmountByPurchaseId[r.original_transaction_id] || 0) + (r.total_amount || 0);
        });

        // Fetch return_items for net-unit calculation (quantities are only on return_items)
        if (purchaseReturns.length > 0) {
            const retItemsResult = await window.StorageModule.supabase
                .from('return_items')
                .select('return_id, quantity')
                .in('return_id', purchaseReturns.map(r => r.id));

            if (!retItemsResult.error && retItemsResult.data) {
                const retIdToPurchaseId = {};
                purchaseReturns.forEach(r => { retIdToPurchaseId[r.id] = r.original_transaction_id; });

                retItemsResult.data.forEach(ri => {
                    const purchaseId = retIdToPurchaseId[ri.return_id];
                    if (purchaseId) {
                        returnedQtyByPurchaseId[purchaseId] = (returnedQtyByPurchaseId[purchaseId] || 0) + (ri.quantity || 0);
                    }
                });
            }
        }
    }

    purchasesTableBody.innerHTML = filteredPurchasesData.map(purchase => {
        const items = purchaseItemsMap[purchase.id] || [];
        const grossUnits = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        // Subtract returned units so the column shows net purchased units
        const returnedUnits = returnedQtyByPurchaseId[purchase.id] || 0;
        const itemCount = Math.max(0, grossUnits - returnedUnits);
        const hasReturn = purchasesWithReturns.has(purchase.id);
        
        // Calculate net total (after returns)
        const grossTotal = purchase.total || 0;
        const returnedAmount = returnedAmountByPurchaseId[purchase.id] || 0;
        const paidAmount = purchase.paid_amount || 0;
        const remaining = purchase.remaining_amount || 0;
        
        // Check if NIL was used: fully paid but paid amount is less than total
        const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
        
        // If NIL used, show actual paid amount; otherwise show invoice total minus returns
        const netTotal = nilUsed 
            ? Math.max(0, paidAmount - returnedAmount)
            : Math.max(0, grossTotal - returnedAmount);
        
        return `
            <tr>
                <td>
                    <span class="purchase-po-number">${purchase.purchase_id || 'N/A'}</span>
                    ${hasReturn ? `<span class="has-returns-badge">🔄 Return</span>` : ''}
                </td>
                <td>
                    <span class="purchase-date">${formatDate(purchase.purchase_date || purchase.created_at)}</span>
                </td>
                <td>
                    <div class="purchase-supplier-name">${purchase.supplier_name || 'General Supplier'}</div>
                    ${purchase.supplier_phone ? `<div class="purchase-supplier-phone">${purchase.supplier_phone}</div>` : ''}
                </td>
                <td>
                    <span class="purchase-items-count" title="${items.length} product line${items.length !== 1 ? 's' : ''}">
                        📦 ${itemCount} ${itemCount === 1 ? 'unit' : 'units'}
                    </span>
                </td>
                <td><span class="purchase-amount total">${fmt(netTotal)}</span></td>
                <td><span class="purchase-amount paid">${fmt(purchase.paid_amount || 0)}</span></td>
                <td><span class="purchase-amount remaining">${fmt(purchase.remaining_amount || 0)}</span></td>
                <td>
                    <span class="purchase-status-badge ${purchase.payment_status || 'unpaid'}">
                        ${(purchase.payment_status || 'unpaid').toUpperCase()}
                    </span>
                </td>
                <td>
                    <div class="purchase-actions">
                        <button class="purchase-action-btn view" onclick="viewPurchaseDetails('${purchase.id}')" title="View Details">
                            👁️
                        </button>
                        <button class="purchase-action-btn edit" onclick="editPurchase('${purchase.id}')" title="Edit Purchase">
                            ✏️
                        </button>
                        <button class="purchase-action-btn delete" onclick="confirmDeletePurchase('${purchase.id}')" title="Delete Purchase">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== UPDATE SUMMARY STATS =====
function updateSummaryStats() {
    const totalPurchases = purchasesListData.length;
    // Use NET total (gross minus any returns) so the stats reflect actual spend
    // ALSO: Account for NIL payments where actual paid amount is less than invoice
    const totalCost = purchasesListData.reduce((sum, p) => {
        const grossTotal = p.total || 0;
        const returnedAmount = returnedAmountByPurchaseId[p.id] || 0;
        const paidAmount = p.paid_amount || 0;
        const remaining = p.remaining_amount || 0;
        
        // Check if NIL was used: fully paid but paid amount is less than total
        const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
        
        // If NIL used, actual cost is what was paid; otherwise use invoice total minus returns
        const netTotal = nilUsed 
            ? Math.max(0, paidAmount - returnedAmount)
            : Math.max(0, grossTotal - returnedAmount);
        
        return sum + netTotal;
    }, 0);
    const owedAmount = purchasesListData.reduce((sum, p) => sum + (p.remaining_amount || 0), 0);
    const avgPurchaseValue = totalPurchases > 0 ? totalCost / totalPurchases : 0;

    console.log('📊 Purchases Stats:', { totalPurchases, totalCost, owedAmount, avgPurchaseValue });

    if (purchasesTotalCount) purchasesTotalCount.textContent = totalPurchases;
    if (purchasesTotalCost) purchasesTotalCost.textContent = fmt(totalCost);
    if (purchasesOwedAmount) purchasesOwedAmount.textContent = fmt(owedAmount);
    if (purchasesAvgValue) purchasesAvgValue.textContent = fmt(avgPurchaseValue);
}

// ===== VIEW PURCHASE DETAILS =====
window.viewPurchaseDetails = async function(purchaseId) {
    try {
        console.log('🔍 Viewing purchase:', purchaseId);
        currentPurchaseId = purchaseId;

        // Get DOM elements
        const purchaseDetailModal = document.getElementById('purchase-detail-modal');
        const purchaseDetailContent = document.getElementById('purchase-detail-content');
        
        if (!purchaseDetailModal || !purchaseDetailContent) {
            console.error('❌ Purchase detail modal elements not found');
            showPurchasesNotification('Error: Modal not found', 'error');
            return;
        }

        // Get purchase data
        const purchaseResult = await window.StorageModule.getDataById('purchases', purchaseId);

        if (!purchaseResult.success) {
            showPurchasesNotification('Failed to load purchase details', 'error');
            return;
        }

        const purchase = purchaseResult.data;
        _currentPurchase = purchase;

        // Get purchase items
        const itemsResult = await window.StorageModule.getPurchaseItems(purchaseId);
        const items = itemsResult.data || [];
        _currentPurchaseItems = items;

        console.log('📦 Loaded purchase items:', items.length, items);

        // Load returns for this purchase + their items
        const user = await window.StorageModule.getCurrentUser();
        const returnsForPurchase = await window.StorageModule.supabase
            .from('returns')
            .select('*')
            .eq('original_transaction_id', purchaseId)
            .eq('user_id', user.id)
            .order('return_date', { ascending: true });
        const purchaseReturns = returnsForPurchase.data || [];
        const totalReturned = purchaseReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);

        // Fetch return_items for all returns at once
        const returnItemsMap = {};
        if (purchaseReturns.length > 0) {
            const returnIds = purchaseReturns.map(r => r.id);
            const allReturnItems = await window.StorageModule.supabase
                .from('return_items')
                .select('*')
                .in('return_id', returnIds);
            if (allReturnItems.data) {
                allReturnItems.data.forEach(ri => {
                    if (!returnItemsMap[ri.return_id]) returnItemsMap[ri.return_id] = [];
                    returnItemsMap[ri.return_id].push(ri);
                });
            }
        }

        const reasonLabels = {
            defective: 'Defective Product', wrong_item: 'Wrong Item Received',
            quality_issue: 'Quality Issue', damaged: 'Damaged in Transit',
            excess_qty: 'Excess Quantity', other: 'Other'
        };

        // Render purchase details
        purchaseDetailContent.innerHTML = `
            <div class="purchase-detail-header">
                <div class="purchase-detail-info">
                    <div class="purchase-detail-po">${purchase.purchase_id || 'N/A'}</div>
                    <div class="purchase-detail-date">${formatDateTime(purchase.purchase_date || purchase.created_at)}</div>
                </div>
                <div class="purchase-detail-supplier">
                    <div class="purchase-detail-supplier-name">${purchase.supplier_name || 'General Supplier'}</div>
                    ${purchase.supplier_phone ? `<div class="purchase-detail-supplier-phone">📞 ${purchase.supplier_phone}</div>` : ''}
                    ${purchaseReturns.length > 0 ? `<span class="has-returns-badge" style="margin-top:0.5rem; display:inline-block;">🔄 ${purchaseReturns.length} Return${purchaseReturns.length > 1 ? 's' : ''}</span>` : ''}
                </div>
            </div>

            <div class="purchase-detail-items">
                <h3 class="purchase-detail-items-title">📦 Items (${items.length})</h3>
                ${items.map(item => `
                    <div class="purchase-detail-item">
                        <div class="purchase-detail-item-info">
                            <div class="purchase-detail-item-name">${item.product_name}</div>
                            <div class="purchase-detail-item-meta">
                                Qty: ${item.quantity} × ${fmt(item.purchase_price)} = ${fmt(item.total || 0)}
                            </div>
                        </div>
                        <div class="purchase-detail-item-total">${fmt(item.total || 0)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="purchase-detail-totals">
                <div class="purchase-detail-total-row">
                    <span class="purchase-detail-total-label">Subtotal</span>
                    <span class="purchase-detail-total-value">${fmt(purchase.subtotal || 0)}</span>
                </div>
                ${purchase.discount > 0 ? `
                    <div class="purchase-detail-total-row">
                        <span class="purchase-detail-total-label">Discount</span>
                        <span class="purchase-detail-total-value">- ${fmt(purchase.discount || 0)}</span>
                    </div>
                ` : ''}
                <div class="purchase-detail-total-row">
                    <span class="purchase-detail-total-label">Total</span>
                    <span class="purchase-detail-total-value">${fmt(purchase.total || 0)}</span>
                </div>
                <div class="purchase-detail-total-row">
                    <span class="purchase-detail-total-label">Paid</span>
                    <span class="purchase-detail-total-value" style="color: var(--color-success);">${fmt(purchase.paid_amount || 0)}</span>
                </div>
                <div class="purchase-detail-total-row">
                    <span class="purchase-detail-total-label">Remaining</span>
                    <span class="purchase-detail-total-value" style="color: var(--color-warning);">${fmt(purchase.remaining_amount || 0)}</span>
                </div>
                <div class="purchase-detail-total-row">
                    <span class="purchase-detail-total-label">Payment Status</span>
                    <span class="purchase-status-badge ${purchase.payment_status || 'unpaid'}">
                        ${(purchase.payment_status || 'unpaid').toUpperCase()}
                    </span>
                </div>
                ${totalReturned > 0 ? `
                <div class="purchase-detail-total-row" style="margin-top:0.25rem; border-top: 2px dashed var(--color-border);">
                    <span class="purchase-detail-total-label" style="color:var(--color-warning);">Total Returned:</span>
                    <span class="purchase-detail-total-value" style="color:var(--color-warning);">-${fmt(totalReturned)}</span>
                </div>
                <div class="purchase-detail-total-row net-highlight">
                    <span class="purchase-detail-total-label">Net Cost:</span>
                    <span class="purchase-detail-total-value net-value">${fmt(Math.max(0, (purchase.subtotal - (purchase.discount || 0)) - totalReturned))}</span>
                </div>
                ` : ''}
            </div>

            ${purchaseReturns.length > 0 ? `
            <div class="returns-history-section">
                <div class="returns-history-title">🔄 Returns History</div>
                ${purchaseReturns.map(ret => {
                    const retItems = returnItemsMap[ret.id] || [];
                    const itemsCalcTotal = retItems.reduce((s, i) => s + (i.total || 0), 0);
                    const hasCustom = retItems.length > 0 && Math.abs(itemsCalcTotal - (ret.total_amount || 0)) > 1;
                    return `
                    <div class="return-history-item" style="flex-direction:column; align-items:stretch; gap:0.6rem;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div class="return-history-left">
                                <div class="return-history-date">${formatDate(ret.return_date || ret.created_at)}</div>
                                <div class="return-history-reason">${reasonLabels[ret.reason] || ret.reason || 'N/A'}</div>
                                ${ret.notes ? `<div class="return-history-notes">${ret.notes}</div>` : ''}
                            </div>
                            <div class="return-history-amount" style="color:var(--color-warning);">-${fmt(ret.total_amount || 0)}</div>
                        </div>
                        ${retItems.length > 0 ? `
                        <div class="return-history-items-table">
                            <div class="return-history-items-header">
                                <span>Product</span><span>Units</span><span>Price</span><span>Amount</span>
                            </div>
                            ${retItems.map(ri => `
                                <div class="return-history-items-row">
                                    <span>${ri.product_name || 'Unknown'}</span>
                                    <span>${ri.quantity}</span>
                                    <span>${fmt(ri.price || 0)}</span>
                                    <span style="color:var(--color-warning);">-${fmt(ri.total || 0)}</span>
                                </div>
                            `).join('')}
                            ${hasCustom ? `
                            <div class="return-history-items-row" style="font-size:0.8rem; color:var(--color-text-muted); font-style:italic;">
                                <span>Custom amount applied</span><span></span><span></span>
                                <span style="color:var(--color-warning);">-${fmt(ret.total_amount || 0)}</span>
                            </div>` : ''}
                        </div>
                        ` : ''}
                    </div>`;
                }).join('')}
            </div>
            ` : ''}

            ${purchase.notes ? `
                <div class="purchase-detail-notes">
                    <div class="purchase-detail-notes-title">📝 Notes</div>
                    <div class="purchase-detail-notes-text">${purchase.notes}</div>
                </div>
            ` : ''}

            
            <button class="manage-payments-btn" onclick="window.PaymentModule.openPaymentManagement('${purchase.id}', 'purchase', ${JSON.stringify(purchase).replace(/"/g, '&quot;')})">
                💳 Manage Payments
            </button>

        `;

        // Show modal
        purchaseDetailModal.classList.add('active');

    } catch (error) {
        console.error('❌ Error viewing purchase:', error);
        showPurchasesNotification('Error loading purchase details', 'error');
    }
};

// ===== EDIT PURCHASE =====
let editingPurchaseId = null;
let editPurchaseItems = [];
let editPurchaseOriginalItems = [];

window.editPurchase = async function(purchaseId) {
    try {
        console.log('✏️ Editing purchase:', purchaseId);
        editingPurchaseId = purchaseId;

        // Get purchase data
        const purchaseResult = await window.StorageModule.getDataById('purchases', purchaseId);
        if (!purchaseResult.success) {
            showPurchasesNotification('Purchase not found', 'error');
            return;
        }

        const purchase = purchaseResult.data;

        // Get purchase items
        const itemsResult = await window.StorageModule.getPurchaseItems(purchaseId);
        const items = itemsResult.data || [];
        
        // Store original items for stock calculation
        editPurchaseOriginalItems = JSON.parse(JSON.stringify(items));
        editPurchaseItems = JSON.parse(JSON.stringify(items));

        console.log('📦 Loaded', items.length, 'items for editing');

        // Get all products for dropdown
        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];

        // Open edit modal
        const editPurchaseModal = document.getElementById('edit-purchase-modal');
        if (!editPurchaseModal) {
            console.error('❌ Edit purchase modal not found in HTML!');
            showPurchasesNotification('Edit modal not found. Please update your HTML.', 'error');
            return;
        }

        // Fill in the form
        document.getElementById('edit-purchase-po').value = purchase.purchase_id || '';
        document.getElementById('edit-purchase-supplier-name').value = purchase.supplier_name || '';
        document.getElementById('edit-purchase-supplier-phone').value = purchase.supplier_phone || '';
        document.getElementById('edit-purchase-date').value = purchase.purchase_date ? purchase.purchase_date.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('edit-purchase-discount').value = purchase.discount || 0;
        document.getElementById('edit-purchase-paid-amount').value = purchase.paid_amount || 0;
        document.getElementById('edit-purchase-notes').value = purchase.notes || '';

        // Render items list
        renderEditPurchaseItems(products);

        // Calculate totals
        calculateEditPurchaseTotals();

        editPurchaseModal.classList.add('active');
    } catch (error) {
        console.error('❌ Error loading purchase for editing:', error);
        showPurchasesNotification('Error loading purchase', 'error');
    }
};

function renderEditPurchaseItems(products) {
    const itemsList = document.getElementById('edit-purchase-items-list');
    if (!itemsList) return;

    if (editPurchaseItems.length === 0) {
        itemsList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-muted);">No items yet. Add items below.</div>';
        return;
    }

    itemsList.innerHTML = editPurchaseItems.map((item, index) => `
        <div class="edit-item-row">
            <div class="edit-item-info">
                <strong>${item.product_name}</strong>
            </div>
            <div class="edit-item-controls">
                <div class="edit-item-field">
                    <label>Qty</label>
                    <input type="number" 
                           value="${item.quantity}" 
                           min="1" 
                           step="1"
                           onchange="updateEditPurchaseItemQty(${index}, this.value)"
                           class="edit-item-input">
                </div>
                <div class="edit-item-field">
                    <label>Price</label>
                    <input type="number" 
                           value="${item.purchase_price}" 
                           min="0" 
                           step="0.01"
                           onchange="updateEditPurchaseItemPrice(${index}, this.value)"
                           class="edit-item-input">
                </div>
                <div class="edit-item-total">
                    ${fmt((item.quantity || 0) * (item.purchase_price || 0))}
                </div>
                <button type="button" class="edit-item-remove-btn" onclick="removeEditPurchaseItem(${index})" title="Remove">🗑️</button>
            </div>
        </div>
    `).join('');

    // Render add item section
    const productOptions = products.map(p => 
        `<option value="${p.id}" data-price="${p.purchase_price}" data-sell-price="${p.sell_price || 0}" data-name="${p.name}">${p.name} (Stock: ${p.stock})</option>`
    ).join('');

    const addItemSection = document.getElementById('edit-purchase-add-item-section');
    if (addItemSection) {
        addItemSection.innerHTML = `
            <div class="add-item-row">
                <select id="edit-purchase-product-select" class="form-select">
                    <option value="">Select product...</option>
                    ${productOptions}
                </select>
                <input type="number" id="edit-purchase-item-qty" placeholder="Qty" min="1" value="1" class="form-input" style="width:80px;">
                <input type="number" id="edit-purchase-item-price" placeholder="Price" min="0" step="0.01" class="form-input" style="width:120px;">
                <button type="button" onclick="addEditPurchaseItem()" class="btn btn-secondary">+ Add</button>
            </div>
        `;

        // Auto-fill price when product selected
        document.getElementById('edit-purchase-product-select').addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const price = selectedOption.getAttribute('data-price');
            if (price) {
                document.getElementById('edit-purchase-item-price').value = price;
            }
        });
    }
}

window.updateEditPurchaseItemQty = function(index, qty) {
    editPurchaseItems[index].quantity = parseFloat(qty) || 0;
    calculateEditPurchaseTotals();
};

window.updateEditPurchaseItemPrice = function(index, price) {
    editPurchaseItems[index].purchase_price = parseFloat(price) || 0;
    calculateEditPurchaseTotals();
};

window.removeEditPurchaseItem = async function(index) {
    try {
        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];
        editPurchaseItems.splice(index, 1);
        renderEditPurchaseItems(products);
        calculateEditPurchaseTotals();
    } catch (err) {
        console.error('❌ Error removing purchase item:', err);
        showPurchasesNotification('Error removing item: ' + err.message, 'error');
    }
};

window.addEditPurchaseItem = async function() {
    try {
        const productSelect = document.getElementById('edit-purchase-product-select');
        const qtyInput = document.getElementById('edit-purchase-item-qty');
        const priceInput = document.getElementById('edit-purchase-item-price');

        if (!productSelect || !qtyInput || !priceInput) {
            showPurchasesNotification('Item form not ready, please try again', 'error');
            return;
        }

        const productId = productSelect.value;
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;

        if (!productId || qty <= 0 || price < 0) {
            showPurchasesNotification('Please select product and enter valid quantity and price', 'error');
            return;
        }

        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const productName = selectedOption.getAttribute('data-name');
        const sellPrice = parseFloat(selectedOption.getAttribute('data-sell-price')) || 0;

        editPurchaseItems.push({
            product_id: productId,
            product_name: productName,
            quantity: qty,
            purchase_price: price,
            sell_price: sellPrice
        });

        // Reset form
        productSelect.value = '';
        qtyInput.value = '1';
        priceInput.value = '';

        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];
        renderEditPurchaseItems(products);
        calculateEditPurchaseTotals();
    } catch (err) {
        console.error('❌ Error adding purchase item:', err);
        showPurchasesNotification('Error adding item: ' + err.message, 'error');
    }
};

function calculateEditPurchaseTotals() {
    const subtotal = editPurchaseItems.reduce((sum, item) => {
        return sum + (item.quantity * item.purchase_price);
    }, 0);

    const discount = parseFloat(document.getElementById('edit-purchase-discount').value) || 0;
    const total = Math.max(0, subtotal - discount); // Clamp to 0 — discount can't exceed subtotal
    const paidAmount = parseFloat(document.getElementById('edit-purchase-paid-amount').value) || 0;
    const remaining = Math.max(0, total - paidAmount);

    document.getElementById('edit-purchase-subtotal').textContent = fmt(subtotal);
    document.getElementById('edit-purchase-total').textContent = fmt(total);
    document.getElementById('edit-purchase-remaining').textContent = fmt(remaining);
}

// Save edited purchase
window.saveEditedPurchase = async function() {
    const saveBtn = document.getElementById('save-edit-purchase-btn');
    if (!saveBtn) return;

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        if (editPurchaseItems.length === 0) {
            showPurchasesNotification('Please add at least one item', 'error');
            return;
        }

        // Calculate totals
        const subtotal = editPurchaseItems.reduce((sum, item) => {
            return sum + (item.quantity * item.purchase_price);
        }, 0);

        const discount = parseFloat(document.getElementById('edit-purchase-discount').value) || 0;
        const total = Math.max(0, subtotal - discount); // Clamp to 0 — discount can't exceed subtotal
        const paidAmount = parseFloat(document.getElementById('edit-purchase-paid-amount').value) || 0;

        let paymentStatus = 'unpaid';

        // FIX: Fetch existing returns for this purchase and apply them so edit doesn't wipe return effects
        const user = await window.StorageModule.getCurrentUser();
        const existingReturnsResult = await window.StorageModule.supabase
            .from('returns')
            .select('total_amount')
            .eq('original_transaction_id', editingPurchaseId)
            .eq('user_id', user.id);
        const totalExistingReturned = (existingReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

        // Gross total = subtotal - discount (saved in 'total' field always)
        // Net after returns = gross - returned
        const netAfterReturns = Math.max(0, total - totalExistingReturned);
        const remaining = Math.max(0, netAfterReturns - paidAmount);

        if (netAfterReturns > 0 && paidAmount >= netAfterReturns) paymentStatus = 'paid';
        else if (paidAmount > 0) paymentStatus = 'partial';
        else paymentStatus = 'unpaid';

        // Update purchase record
        const purchaseData = {
            purchase_id: document.getElementById('edit-purchase-po').value.trim(),
            supplier_name: document.getElementById('edit-purchase-supplier-name').value.trim() || 'General Supplier',
            supplier_phone: document.getElementById('edit-purchase-supplier-phone').value.trim(),
            purchase_date: document.getElementById('edit-purchase-date').value,
            subtotal: subtotal,
            discount: discount,
            total: total,          // Always gross — returns tracked separately
            paid_amount: paidAmount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            notes: document.getElementById('edit-purchase-notes').value.trim()
        };

        const updateResult = await window.StorageModule.updateData('purchases', editingPurchaseId, purchaseData);
        if (!updateResult.success) {
            showPurchasesNotification('Failed to update purchase', 'error');
            return;
        }

        // ── STOCK UPDATE (return-aware) ────────────────────────────────────────
        // Returns already moved stock on their own. Only undo/apply the NET qty
        // (transaction_qty - already_returned_qty) so returns aren't double-counted.
        let alreadyReturnedByProduct = {};
        try {
            const purchaseReturnsResult = await window.StorageModule.supabase
                .from('returns')
                .select('id')
                .eq('original_transaction_id', editingPurchaseId)
                .eq('user_id', user.id);
            if (purchaseReturnsResult.data && purchaseReturnsResult.data.length > 0) {
                const returnIds = purchaseReturnsResult.data.map(r => r.id);
                const retItemsResult = await window.StorageModule.supabase
                    .from('return_items')
                    .select('product_id, quantity')
                    .in('return_id', returnIds);
                (retItemsResult.data || []).forEach(ri => {
                    alreadyReturnedByProduct[ri.product_id] = (alreadyReturnedByProduct[ri.product_id] || 0) + ri.quantity;
                });
            }
        } catch (e) { console.warn('⚠️ Could not load return data for stock calc:', e); }

        // Phase 1: Reverse only the NET qty still in stock from the original purchase
        for (const origItem of editPurchaseOriginalItems) {
            if (origItem.product_id) {
                const alreadyReturned = alreadyReturnedByProduct[origItem.product_id] || 0;
                const netQty = origItem.quantity - alreadyReturned;
                if (netQty <= 0) continue; // Returns already removed this stock, nothing to reverse
                const productResult = await window.StorageModule.getDataById('products', origItem.product_id);
                if (productResult.success && productResult.data) {
                    const newStock = Math.max(0, productResult.data.stock - netQty);
                    await window.StorageModule.updateData('products', origItem.product_id, { stock: newStock });
                }
            }
        }

        // Delete old purchase items
        await window.StorageModule.deletePurchaseItems(editingPurchaseId);

        // Add new purchase items and add stock
        for (const item of editPurchaseItems) {
            const itemResult = await window.StorageModule.saveData('purchase_items', {
                purchase_id: editingPurchaseId,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                purchase_price: item.purchase_price,
                sell_price: item.sell_price || 0,
                total: item.quantity * item.purchase_price
            });

            if (!itemResult.success) {
                showPurchasesNotification('Error saving item: ' + item.product_name, 'error');
                console.error('❌ Failed to save purchase item:', itemResult.error);
                return; // Stop processing to avoid partial state
            }

            if (item.product_id) {
                const alreadyReturned = alreadyReturnedByProduct[item.product_id] || 0;
                const netQty = item.quantity - alreadyReturned;
                if (netQty <= 0) continue; // Returns cover this qty — no net addition needed
                const productResult = await window.StorageModule.getDataById('products', item.product_id);
                if (productResult.success && productResult.data) {
                    const newStock = productResult.data.stock + netQty;
                    await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                }
            }
        }

        showPurchasesNotification('✅ Purchase updated successfully', 'success');

        document.getElementById('edit-purchase-modal').classList.remove('active');
        await loadPurchases();

        // Reload other modules
        if (window.AppModule?.loadDashboardStats) await window.AppModule.loadDashboardStats();
        if (window.ProductsModule?.loadProducts) await window.ProductsModule.loadProducts();
        if (window.ReportsModule?.loadReports) await window.ReportsModule.loadReports();

    } catch (error) {
        console.error('❌ Error saving edited purchase:', error);
        showPurchasesNotification('Error updating purchase', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
};

// ===== DELETE PURCHASE =====
window.confirmDeletePurchase = async function(purchaseId) {
    try {
        deletingPurchaseId = purchaseId;

        // Get purchase data
        const purchaseResult = await window.StorageModule.getDataById('purchases', purchaseId);
        if (!purchaseResult.success) {
            showPurchasesNotification('Failed to load purchase', 'error');
            return;
        }

        const purchase = purchaseResult.data;
        deletePurchasePONumber.textContent = purchase.purchase_id || 'this purchase';

        // Show delete modal
        deletePurchaseModal.classList.add('active');

    } catch (error) {
        console.error('❌ Error preparing delete:', error);
        showPurchasesNotification('Error preparing delete', 'error');
    }
};

confirmDeletePurchaseBtn.addEventListener('click', async () => {
    if (!deletingPurchaseId) return;

    confirmDeletePurchaseBtn.disabled = true;
    confirmDeletePurchaseBtn.textContent = '⏳ Deleting...';

    try {
        console.log('🗑️ Deleting purchase:', deletingPurchaseId);

        // Get purchase items to reduce stock
        const itemsResult = await window.StorageModule.getPurchaseItems(deletingPurchaseId);
        const items = itemsResult.data || [];

        // Reduce stock for each item
        for (const item of items) {
            if (item.product_id) {
                const productResult = await window.StorageModule.getDataById('products', item.product_id);
                if (productResult.success && productResult.data) {
                    const newStock = Math.max(0, productResult.data.stock - item.quantity);
                    await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                    console.log('✅ Reduced stock for product:', item.product_name, '-', item.quantity);
                }
            }
        }

        // FIX: Delete associated returns (and reverse THEIR stock effects) before deleting the purchase
        const user = await window.StorageModule.getCurrentUser();
        const purchaseReturnsResult = await window.StorageModule.supabase
            .from('returns')
            .select('id')
            .eq('original_transaction_id', deletingPurchaseId)
            .eq('user_id', user.id);
        
        if (purchaseReturnsResult.data && purchaseReturnsResult.data.length > 0) {
            for (const ret of purchaseReturnsResult.data) {
                // Purchase return had REDUCED stock; deleting it means RESTORING stock
                const retItemsResult = await window.StorageModule.supabase
                    .from('return_items').select('*').eq('return_id', ret.id);
                for (const ri of (retItemsResult.data || [])) {
                    if (ri.product_id) {
                        const pr = await window.StorageModule.getDataById('products', ri.product_id);
                        if (pr.success && pr.data) {
                            const newStk = pr.data.stock + (ri.quantity || 0);
                            await window.StorageModule.updateData('products', ri.product_id, { stock: newStk });
                        }
                    }
                }
                await window.StorageModule.supabase.from('return_items').delete().eq('return_id', ret.id);
            }
            await window.StorageModule.supabase.from('returns').delete()
                .eq('original_transaction_id', deletingPurchaseId).eq('user_id', user.id);
            console.log('✅ Deleted', purchaseReturnsResult.data.length, 'associated return(s)');
        }

        // Delete purchase items first (due to foreign key)
        for (const item of items) {
            await window.StorageModule.deleteData('purchase_items', item.id);
        }

        // CRITICAL FIX: Delete associated payments to prevent cash flow calculation errors
        await window.StorageModule.deletePaymentsForPurchase(deletingPurchaseId);

        // Delete the purchase
        const deleteResult = await window.StorageModule.deleteData('purchases', deletingPurchaseId);

        if (deleteResult.success) {
            showPurchasesNotification('✅ Purchase deleted and stock reduced', 'success');
            
            // Close modal
            deletePurchaseModal.classList.remove('active');
            deletingPurchaseId = null;

            // Reload data
            await loadPurchases();

            // Update dashboard and products
            if (window.AppModule && window.AppModule.loadDashboardStats) {
                await window.AppModule.loadDashboardStats();
            }
            if (window.ProductsModule && window.ProductsModule.loadProducts) {
                await window.ProductsModule.loadProducts();
            }
        } else {
            showPurchasesNotification('Failed to delete purchase', 'error');
        }

    } catch (error) {
        console.error('❌ Error deleting purchase:', error);
        showPurchasesNotification('Error deleting purchase', 'error');
    } finally {
        confirmDeletePurchaseBtn.disabled = false;
        confirmDeletePurchaseBtn.textContent = '🗑️ Delete Purchase';
    }
});

// ===== PRINT PURCHASE ORDER =====
printPurchaseBtn.addEventListener('click', () => {
    if (!_currentPurchase) {
        showPurchasesNotification('Cannot print — open a purchase first', 'error');
        return;
    }
    const purchase = _currentPurchase;
    const items    = _currentPurchaseItems;

    const d = new Date(purchase.purchase_date || purchase.created_at);
    const dateStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    window.InvoiceTemplate.print({
        type:        'purchase',
        invoice_no:  purchase.purchase_id   || 'N/A',
        date:        dateStr,
        party_label: 'Supplier',
        party_name:  purchase.supplier_name  || 'General Supplier',
        party_phone: purchase.supplier_phone || '',
        items: items.map(it => ({
            name:       it.product_name    || 'Item',
            qty:        it.quantity        || 1,
            unit_price: it.purchase_price  || 0,
            total:      it.total           || (it.quantity * (it.purchase_price || 0)),
        })),
        subtotal: purchase.subtotal        || 0,
        discount: purchase.discount        || 0,
        total:    purchase.total           || 0,
        paid:     purchase.paid_amount     || 0,
        balance:  purchase.remaining_amount || 0,
        status:   purchase.payment_status  || 'unpaid',
        notes:    purchase.notes           || '',
    });
});

// ===== EVENT LISTENERS =====
purchasesSearch.addEventListener('input', applyFilters);
purchasesStatusFilter.addEventListener('change', applyFilters);
applyPurchasesFilterBtn.addEventListener('click', applyFilters);

clearPurchasesFilterBtn.addEventListener('click', () => {
    purchasesSearch.value = '';
    purchasesStatusFilter.value = '';
    purchasesDateFrom.value = '';
    purchasesDateTo.value = '';
    applyFilters();
});

closePurchaseDetailModal.addEventListener('click', () => purchaseDetailModal.classList.remove('active'));
closePurchaseDetailBtn.addEventListener('click', () => purchaseDetailModal.classList.remove('active'));
closeDeletePurchaseModal.addEventListener('click', () => deletePurchaseModal.classList.remove('active'));
cancelDeletePurchaseBtn.addEventListener('click', () => deletePurchaseModal.classList.remove('active'));

if (closeEditPurchaseModal) closeEditPurchaseModal.addEventListener('click', () => editPurchaseModal.classList.remove('active'));
if (cancelEditPurchaseBtn) cancelEditPurchaseBtn.addEventListener('click', () => editPurchaseModal.classList.remove('active'));
if (saveEditPurchaseBtn) saveEditPurchaseBtn.addEventListener('click', saveEditedPurchase);

// Add listeners for discount and paid amount to recalculate totals
const editPurchaseDiscount = document.getElementById('edit-purchase-discount');
const editPurchasePaidAmount = document.getElementById('edit-purchase-paid-amount');
if (editPurchaseDiscount) editPurchaseDiscount.addEventListener('input', calculateEditPurchaseTotals);
if (editPurchasePaidAmount) editPurchasePaidAmount.addEventListener('input', calculateEditPurchaseTotals);

purchaseDetailModal.addEventListener('click', (e) => {
    if (e.target === purchaseDetailModal) purchaseDetailModal.classList.remove('active');
});
deletePurchaseModal.addEventListener('click', (e) => {
    if (e.target === deletePurchaseModal) deletePurchaseModal.classList.remove('active');
});

if (editPurchaseModal) {
    editPurchaseModal.addEventListener('click', (e) => {
        if (e.target === editPurchaseModal) editPurchaseModal.classList.remove('active');
    });
}

// ===== NOTIFICATION =====
function showPurchasesNotification(msg, type) {
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
async function initPurchasesPage() {
    console.log('🚀 Initializing Purchases Page...');
    
    // CRITICAL FIX: Clear all filter inputs on page load
    if (purchasesSearch) {
        purchasesSearch.value = '';
        console.log('   Cleared search input');
    }
    if (purchasesStatusFilter) {
        purchasesStatusFilter.value = '';
        console.log('   Cleared status filter');
    }
    if (purchasesDateFrom) {
        purchasesDateFrom.value = '';
        console.log('   Cleared date from');
    }
    if (purchasesDateTo) {
        purchasesDateTo.value = '';
        console.log('   Cleared date to');
    }
    
    await loadPurchases();
}

window.PurchasesModule = { initPurchasesPage, loadPurchases };
console.log('✅ Purchases Module Loaded');

/* ==========================================
   JS END: Purchases Listing Module
   ========================================== */
})(); // end IIFE