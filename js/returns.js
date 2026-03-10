(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.XModule exports are accessible globally.
   This prevents applyFilters / updateSummaryStats / fmt / formatDate
   from colliding across modules.
   ========================================== */

/* ==========================================
   JS START: Returns Module (Item-Based)
   ========================================== */

// ===== STATE =====
let returnsData = [];
let filteredReturns = [];
let salesData = [];
let purchasesData = [];
let selectedSale = null;
let selectedPurchase = null;
let selectedSaleItems = [];
let selectedPurchaseItems = [];
let saleReturnItems = [];
let purchaseReturnItems = [];

// Edit-mode tracking: when non-null, form submit UPDATES this return instead of creating new
let editingReturnId = null;
let editingReturnType = null; // 'sale' or 'purchase'

// ===== DOM ELEMENTS =====
const returnsSearch = document.getElementById('returns-search');
const returnsTypeFilter = document.getElementById('returns-type-filter');
const returnsDateFrom = document.getElementById('returns-date-from');
const returnsDateTo = document.getElementById('returns-date-to');
const applyReturnsFilterBtn = document.getElementById('apply-returns-filter');
const clearReturnsFilterBtn = document.getElementById('clear-returns-filter');
const returnsTableBody = document.getElementById('returns-table-body');

// Summary stats
const returnsSaleCount = document.getElementById('returns-sale-count');
const returnsPurchaseCount = document.getElementById('returns-purchase-count');
const returnsTotalRefunded = document.getElementById('returns-total-refunded');
const returnsTotalCount = document.getElementById('returns-total-count');

// Sale Return Modal
const processSaleReturnBtn = document.getElementById('process-sale-return-btn');
const saleReturnModal = document.getElementById('sale-return-modal');
const closeSaleReturnModal = document.getElementById('close-sale-return-modal');
const cancelSaleReturnBtn = document.getElementById('cancel-sale-return-btn');
const saleReturnForm = document.getElementById('sale-return-form');
const saveSaleReturnBtn = document.getElementById('save-sale-return-btn');

const saleReturnSaleSelect = document.getElementById('sale-return-sale-select');
const saleReturnDetails = document.getElementById('sale-return-details');
const saleReturnInvoice = document.getElementById('sale-return-invoice');
const saleReturnCustomer = document.getElementById('sale-return-customer');
const saleReturnTotal = document.getElementById('sale-return-total');
const saleReturnDate = document.getElementById('sale-return-date');
const saleReturnItemsList = document.getElementById('sale-return-items-list');
const saleReturnCalculatedTotal = document.getElementById('sale-return-calculated-total');
const saleReturnReason = document.getElementById('sale-return-reason');
const saleReturnNotes = document.getElementById('sale-return-notes');
const saleReturnCustomAmount = document.getElementById('sale-return-custom-amount');

// Purchase Return Modal
const processPurchaseReturnBtn = document.getElementById('process-purchase-return-btn');
const purchaseReturnModal = document.getElementById('purchase-return-modal');
const closePurchaseReturnModal = document.getElementById('close-purchase-return-modal');
const cancelPurchaseReturnBtn = document.getElementById('cancel-purchase-return-btn');
const purchaseReturnForm = document.getElementById('purchase-return-form');
const savePurchaseReturnBtn = document.getElementById('save-purchase-return-btn');

const purchaseReturnPurchaseSelect = document.getElementById('purchase-return-purchase-select');
const purchaseReturnDetails = document.getElementById('purchase-return-details');
const purchaseReturnPO = document.getElementById('purchase-return-po');
const purchaseReturnSupplier = document.getElementById('purchase-return-supplier');
const purchaseReturnTotal = document.getElementById('purchase-return-total');
const purchaseReturnDate = document.getElementById('purchase-return-date');
const purchaseReturnItemsList = document.getElementById('purchase-return-items-list');
const purchaseReturnCalculatedTotal = document.getElementById('purchase-return-calculated-total');
const purchaseReturnReason = document.getElementById('purchase-return-reason');
const purchaseReturnNotes = document.getElementById('purchase-return-notes');
const purchaseReturnCustomAmount = document.getElementById('purchase-return-custom-amount');

// Return Detail Modal
const returnDetailModal = document.getElementById('return-detail-modal');
const closeReturnDetailModal = document.getElementById('close-return-detail-modal');
const closeReturnDetailBtn = document.getElementById('close-return-detail-btn');
const returnDetailContent = document.getElementById('return-detail-content');

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

// ===== LOAD DATA =====
async function loadReturns() {
    try {
        console.log('🔄 Loading returns...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in');
            return;
        }

        const result = await window.StorageModule.getAllData('returns');
        
        if (result.success) {
            returnsData = result.data || [];
            console.log('✅ Loaded', returnsData.length, 'returns');
            await applyFilters();  // CRITICAL FIX: Added await
        } else {
            console.error('❌ Failed to load returns:', result.error);
            showReturnsNotification('Failed to load returns', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading returns:', error);
        showReturnsNotification('Error loading returns', 'error');
    }
}

async function loadSalesAndPurchases() {
    try {
        const salesResult = await window.StorageModule.getAllData('sales');
        salesData = salesResult.success ? salesResult.data : [];

        const purchasesResult = await window.StorageModule.getAllData('purchases');
        purchasesData = purchasesResult.success ? purchasesResult.data : [];

        console.log('✅ Loaded', salesData.length, 'sales and', purchasesData.length, 'purchases');
    } catch (error) {
        console.error('❌ Error loading sales/purchases:', error);
    }
}

// ===== APPLY FILTERS =====
async function applyFilters() {
    try {
        const searchTerm = returnsSearch ? returnsSearch.value.toLowerCase().trim() : '';
        const typeFilter = returnsTypeFilter ? returnsTypeFilter.value : '';
        const dateFrom = returnsDateFrom ? returnsDateFrom.value : '';
        const dateTo = returnsDateTo ? returnsDateTo.value : '';

        filteredReturns = returnsData.filter(returnItem => {
            const matchesSearch = !searchTerm || 
                (returnItem.original_reference && returnItem.original_reference.toLowerCase().includes(searchTerm)) ||
                (returnItem.customer_supplier_name && returnItem.customer_supplier_name.toLowerCase().includes(searchTerm));

            const matchesType = !typeFilter || returnItem.return_type === typeFilter;

            const returnDate = new Date(returnItem.return_date || returnItem.created_at);
            const matchesDateFrom = !dateFrom || returnDate >= new Date(dateFrom);
            const matchesDateTo = !dateTo || returnDate <= new Date(dateTo + 'T23:59:59');

            return matchesSearch && matchesType && matchesDateFrom && matchesDateTo;
        });

        console.log('🔍 Filtered to', filteredReturns.length, 'of', returnsData.length, 'returns');
        renderReturns();
        updateSummaryStats();
    } catch (error) {
        console.error('❌ Error in applyFilters:', error);
    }
}

// ===== RENDER RETURNS TABLE =====
const REASON_LABELS = {
    defective: 'Defective Product',
    wrong_item: 'Wrong Item',
    customer_request: 'Customer Request',
    damaged: 'Damaged',
    excess_qty: 'Excess Quantity',
    quality_issue: 'Quality Issue',
    other: 'Other'
};

function renderReturns() {
    if (!returnsTableBody) return;

    if (returnsData.length === 0) {
        returnsTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">↩️</div>
                    <div style="font-size: 1.1rem; font-weight: 600;">No returns found</div>
                    <div style="font-size: 0.9rem; margin-top: 0.5rem;">
                        ${returnsData.length === 0 ? 'Process a return to see it here' : 'Try adjusting your filters'}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    returnsTableBody.innerHTML = filteredReturns.map(returnItem => `
        <tr>
            <td>
                <span style="font-family: var(--font-mono); font-weight: 700; color: var(--color-accent);">
                    RET-${returnItem.id.slice(0, 8)}
                </span>
            </td>
            <td>
                <span class="return-type-badge ${returnItem.return_type}">
                    ${returnItem.return_type === 'sale' ? '📤 Sale' : '📥 Purchase'}
                </span>
            </td>
            <td>
                <span style="font-family: var(--font-mono); font-weight: 600; color: var(--color-text-secondary);">
                    ${returnItem.original_reference || 'N/A'}
                </span>
            </td>
            <td>
                <span style="color: var(--color-text-tertiary); font-size: 0.875rem;">
                    ${formatDate(returnItem.return_date || returnItem.created_at)}
                </span>
            </td>
            <td>
                <div style="font-weight: 600; color: var(--color-text-primary);">
                    ${returnItem.customer_supplier_name || 'N/A'}
                </div>
            </td>
            <td>
                <span class="return-amount ${returnItem.return_type === 'sale' ? 'refunded' : 'returned'}">
                    ${fmt(returnItem.total_amount || 0)}
                </span>
            </td>
            <td>
                <span class="return-reason-badge">${REASON_LABELS[returnItem.reason] || returnItem.reason || 'N/A'}</span>
            </td>
           <td>
    <div class="return-actions">
        <button class="return-action-btn view" onclick="viewReturnDetails('${returnItem.id}')" title="View Details">
            👁️
        </button>
        <button class="return-action-btn edit" onclick="editReturn('${returnItem.id}')" title="Edit Return">
            ✏️
        </button>
        <button class="return-action-btn delete" onclick="confirmDeleteReturn('${returnItem.id}')" title="Delete Return">
            🗑️
        </button>
    </div>
</td>
        </tr>
    `).join('');
}

// ===== UPDATE SUMMARY STATS =====
function updateSummaryStats() {
    const saleReturns = returnsData.filter(r => r.return_type === 'sale');
    const purchaseReturns = returnsData.filter(r => r.return_type === 'purchase');
    const totalRefunded = returnsData.reduce((sum, r) => sum + (r.total_amount || 0), 0);

    if (returnsSaleCount) returnsSaleCount.textContent = saleReturns.length;
    if (returnsPurchaseCount) returnsPurchaseCount.textContent = purchaseReturns.length;
    if (returnsTotalRefunded) returnsTotalRefunded.textContent = fmt(totalRefunded);
    if (returnsTotalCount) returnsTotalCount.textContent = returnsData.length;
}

// ===== PROCESS SALE RETURN =====
if (processSaleReturnBtn) {
    processSaleReturnBtn.addEventListener('click', async () => {
        await loadSalesAndPurchases();
        
        if (saleReturnSaleSelect) {
            saleReturnSaleSelect.innerHTML = '<option value="">-- Select a sale to return --</option>' +
                salesData.map(sale => 
                    `<option value="${sale.id}">${sale.invoice_id} - ${sale.customer_name || 'Walk-in'} - ${fmt(sale.total)}</option>`
                ).join('');
        }
        
        if (saleReturnForm) saleReturnForm.reset();
        if (saleReturnDetails) saleReturnDetails.style.display = 'none';
        if (saveSaleReturnBtn) saveSaleReturnBtn.disabled = true;
        if (saleReturnCustomAmount) saleReturnCustomAmount.value = '';
        selectedSale = null;
        selectedSaleItems = [];
        saleReturnItems = [];
        editingReturnId = null;   // FIX: clear edit mode
        editingReturnType = null;
        if (saleReturnModal) saleReturnModal.classList.add('active');
    });
}

if (saleReturnSaleSelect) {
    saleReturnSaleSelect.addEventListener('change', async () => {
        const saleId = saleReturnSaleSelect.value;
        if (!saleId) {
            if (saleReturnDetails) saleReturnDetails.style.display = 'none';
            if (saveSaleReturnBtn) saveSaleReturnBtn.disabled = true;
            selectedSale = null;
            selectedSaleItems = [];
            saleReturnItems = [];
            return;
        }

        selectedSale = salesData.find(s => s.id === saleId);
        if (!selectedSale) return;

        const user = await window.StorageModule.getCurrentUser();

        const itemsResult = await window.StorageModule.supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', saleId)
            .eq('user_id', user.id);  // Always filter by user for security and correctness

        selectedSaleItems = itemsResult.data || [];
        saleReturnItems = [];

        // ===== DOUBLE-RETURN PROTECTION =====
        // Find already-returned quantities for each product in this sale.
        // CRITICAL FIX: When in edit mode, EXCLUDE the return being edited from this map,
        // otherwise its items appear "Fully Returned" and checkboxes are disabled.
        let alreadyReturnedMap = {};
        try {
            let returnsQuery = window.StorageModule.supabase
                .from('returns')
                .select('id')
                .eq('original_transaction_id', saleId)
                .eq('user_id', user.id);

            // Exclude the return being edited so its items show as available again
            if (editingReturnId) {
                returnsQuery = returnsQuery.neq('id', editingReturnId);
            }

            const existingReturnsResult = await returnsQuery;
            if (existingReturnsResult.data && existingReturnsResult.data.length > 0) {
                const returnIds = existingReturnsResult.data.map(r => r.id);
                const returnItemsResult = await window.StorageModule.supabase
                    .from('return_items')
                    .select('product_id, quantity')
                    .in('return_id', returnIds);
                if (returnItemsResult.data) {
                    returnItemsResult.data.forEach(item => {
                        alreadyReturnedMap[item.product_id] = (alreadyReturnedMap[item.product_id] || 0) + item.quantity;
                    });
                }
            }
        } catch (e) { console.warn('Could not load existing returns:', e); }

        if (saleReturnInvoice) saleReturnInvoice.textContent = selectedSale.invoice_id || 'N/A';
        if (saleReturnCustomer) saleReturnCustomer.textContent = selectedSale.customer_name || 'Walk-in';
        if (saleReturnTotal) saleReturnTotal.textContent = fmt(selectedSale.total || 0);
        if (saleReturnDate) saleReturnDate.textContent = formatDate(selectedSale.sale_date || selectedSale.created_at);
        
        renderSaleReturnItems(alreadyReturnedMap);
        updateSaleReturnTotal();
        
        if (saleReturnDetails) saleReturnDetails.style.display = 'block';
        if (saveSaleReturnBtn) saveSaleReturnBtn.disabled = false;
    });
}

function renderSaleReturnItems(alreadyReturnedMap = {}) {
    if (!saleReturnItemsList) return;

    saleReturnItemsList.innerHTML = selectedSaleItems.map(item => {
        const alreadyReturned = alreadyReturnedMap[item.product_id] || 0;
        const maxReturnable = Math.max(0, item.quantity - alreadyReturned);
        const fullyReturned = maxReturnable === 0;

        return `
        <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--color-surface); border: 1px solid ${fullyReturned ? 'var(--color-border)' : 'var(--color-border)'}; border-radius: var(--radius-md); opacity: ${fullyReturned ? '0.5' : '1'};">
            <input type="checkbox" id="sale-item-${item.id}" onchange="toggleSaleReturnItem('${item.id}')" style="width: 20px; height: 20px; cursor: pointer;" ${fullyReturned ? 'disabled' : ''}>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--color-text-primary);">${item.product_name}</div>
                <div style="font-size: 0.85rem; color: var(--color-text-muted);">
                    Sold: ${item.quantity} × ${fmt(item.sell_price || 0)} = ${fmt(item.total)}
                    ${alreadyReturned > 0 ? `<span style="color: var(--color-danger); font-weight:600;"> · Already Returned: ${alreadyReturned}</span>` : ''}
                </div>
            </div>
            ${fullyReturned
                ? `<span style="font-size:0.8rem; font-weight:700; color:var(--color-danger); background:var(--color-danger-light,#fee2e2); padding:0.25rem 0.6rem; border-radius:999px;">Fully Returned</span>`
                : `<div id="sale-item-qty-${item.id}" style="display: none; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-secondary);">Return Qty:</label>
                    <input type="number" id="sale-item-qty-input-${item.id}" min="1" max="${maxReturnable}" value="${maxReturnable}" onchange="updateSaleReturnItemQty('${item.id}', this.value)" style="width: 70px; padding: 0.4rem; background: var(--color-background); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-primary);">
                    <span style="font-size:0.8rem; color:var(--color-text-muted);">/ ${maxReturnable} left</span>
                </div>`
            }
        </div>
    `;
    }).join('');
}

window.toggleSaleReturnItem = function(itemId) {
    const checkbox = document.getElementById(`sale-item-${itemId}`);
    const qtyDiv = document.getElementById(`sale-item-qty-${itemId}`);
    const item = selectedSaleItems.find(i => i.id === itemId);
    
    if (checkbox && checkbox.checked) {
        if (qtyDiv) qtyDiv.style.display = 'flex';
        const qtyInput = document.getElementById(`sale-item-qty-input-${itemId}`);
        const maxQty = qtyInput ? parseInt(qtyInput.max) : item.quantity;
        saleReturnItems.push({
            ...item,
            returnQty: maxQty
        });
    } else {
        if (qtyDiv) qtyDiv.style.display = 'none';
        saleReturnItems = saleReturnItems.filter(i => i.id !== itemId);
    }
    
    updateSaleReturnTotal();
};

window.updateSaleReturnItemQty = function(itemId, qty) {
    const returnItem = saleReturnItems.find(i => i.id === itemId);
    if (returnItem) {
        const qtyInput = document.getElementById(`sale-item-qty-input-${itemId}`);
        const maxQty = qtyInput ? parseInt(qtyInput.max) : returnItem.quantity;
        const clamped = Math.min(Math.max(1, parseInt(qty) || 1), maxQty);
        if (qtyInput) qtyInput.value = clamped;
        returnItem.returnQty = clamped;
        updateSaleReturnTotal();
    }
};

function updateSaleReturnTotal() {
    const total = saleReturnItems.reduce((sum, item) => {
        return sum + (item.sell_price * item.returnQty);
    }, 0);
    if (saleReturnCalculatedTotal) saleReturnCalculatedTotal.textContent = fmt(total);
}

if (saleReturnForm) {
    saleReturnForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate sale selection
        if (!selectedSale) {
            showReturnsNotification('Please select a sale first', 'error');
            return;
        }

        if (saleReturnItems.length === 0) {
            showReturnsNotification('Please select at least one item to return', 'error');
            return;
        }

        // Validate reason
        const reason = saleReturnReason ? saleReturnReason.value : '';
        if (!reason) {
            showReturnsNotification('Please select a return reason', 'error');
            return;
        }

        if (saveSaleReturnBtn) {
            saveSaleReturnBtn.disabled = true;
            saveSaleReturnBtn.textContent = '⏳ Processing...';
        }

        try {
            const user = await window.StorageModule.getCurrentUser();
            if (!user) throw new Error('Not authenticated');

            const notes = saleReturnNotes ? saleReturnNotes.value.trim() : '';

            const calculatedAmount = saleReturnItems.reduce((sum, item) => {
                return sum + (item.sell_price * item.returnQty);
            }, 0);

            // Use custom amount if filled, otherwise use calculated
            const customAmountRaw = saleReturnCustomAmount ? parseFloat(saleReturnCustomAmount.value) : NaN;
            const totalAmount = (!isNaN(customAmountRaw) && customAmountRaw > 0) ? customAmountRaw : calculatedAmount;

            // Bug 10 fix: block zero-amount returns
            if (totalAmount <= 0) {
                showReturnsNotification('Return amount must be greater than zero', 'error');
                if (saveSaleReturnBtn) {
                    saveSaleReturnBtn.disabled = false;
                    saveSaleReturnBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> Process Return`;
                }
                return;
            }

            const returnData = {
                user_id: user.id,
                return_type: 'sale',
                original_transaction_id: selectedSale.id,
                original_reference: selectedSale.invoice_id,
                customer_supplier_name: selectedSale.customer_name || 'Walk-in',
                total_amount: totalAmount,
                reason: reason,
                notes: notes,
                return_date: new Date().toISOString()
            };

            // FIX: If editing an existing return, reverse its effects first then delete it
            if (editingReturnId) {
                console.log('📝 Edit mode: reversing old return', editingReturnId);
                // Get old return items to reverse stock
                const oldItemsResult = await window.StorageModule.supabase
                    .from('return_items').select('*').eq('return_id', editingReturnId);
                for (const oldItem of (oldItemsResult.data || [])) {
                    if (oldItem.product_id) {
                        const pr = await window.StorageModule.getDataById('products', oldItem.product_id);
                        if (pr.success && pr.data) {
                            // Reverse: sale return had restored stock, so now reduce it back
                            const newStock = Math.max(0, pr.data.stock - oldItem.quantity);
                            await window.StorageModule.updateData('products', oldItem.product_id, { stock: newStock });
                        }
                    }
                }
                // Delete old return items and return record
                await window.StorageModule.supabase.from('return_items').delete().eq('return_id', editingReturnId);
                await window.StorageModule.deleteData('returns', editingReturnId);
                editingReturnId = null;
                editingReturnType = null;
            }

            const result = await window.StorageModule.saveData('returns', returnData);

            if (result.success) {
                const returnId = result.data.id;

                // Save return items and restore stock
                for (const item of saleReturnItems) {
                    await window.StorageModule.saveData('return_items', {
                        return_id: returnId,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity: item.returnQty,
                        price: item.sell_price,
                        total: item.sell_price * item.returnQty
                    });

                    if (item.product_id) {
                        const productResult = await window.StorageModule.getDataById('products', item.product_id);
                        if (productResult.success && productResult.data) {
                            const newStock = productResult.data.stock + item.returnQty;
                            await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                            console.log('✅ Restored stock for product:', item.product_name, '+', item.returnQty);
                        }
                    }
                }

                // **UPDATE THE ORIGINAL SALE RECORD**
                // FIX: Do NOT touch sale.total — it must stay as the gross (subtotal - discount).
                // Only update remaining_amount and payment_status, calculated from ALL returns.
                const allSaleReturnsResult = await window.StorageModule.supabase
                    .from('returns')
                    .select('total_amount')
                    .eq('original_transaction_id', selectedSale.id)
                    .eq('user_id', user.id);
                const totalAllSaleReturned = (allSaleReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

                const grossSaleTotal = selectedSale.total; // NEVER CHANGE THIS
                const netSaleTotal = Math.max(0, grossSaleTotal - totalAllSaleReturned);
                const newPaidAmount = selectedSale.paid_amount; // KEEP original — do not touch payment history
                const newRemainingAmount = Math.max(0, netSaleTotal - newPaidAmount);
                
                let newPaymentStatus = 'unpaid';
                if (netSaleTotal > 0 && newPaidAmount >= netSaleTotal) {
                    newPaymentStatus = 'paid';
                } else if (newPaidAmount > 0) {
                    newPaymentStatus = 'partial';
                }

                await window.StorageModule.updateData('sales', selectedSale.id, {
                    // total intentionally NOT updated — keeps gross value intact
                    remaining_amount: newRemainingAmount,
                    payment_status: newPaymentStatus
                });

                console.log('✅ Updated original sale remaining:', {
                    grossTotal: selectedSale.total,
                    totalAllReturned: totalAllSaleReturned,
                    netSaleTotal,
                    newStatus: newPaymentStatus
                });

                showReturnsNotification('✅ Sale return processed successfully', 'success');
                if (saleReturnModal) saleReturnModal.classList.remove('active');
                await loadReturns();

                // Update all modules
                if (window.AppModule && window.AppModule.loadDashboardStats) {
                    await window.AppModule.loadDashboardStats();
                }
                if (window.ProductsModule && window.ProductsModule.loadProducts) {
                    await window.ProductsModule.loadProducts();
                }
                if (window.SalesModule && window.SalesModule.loadSales) {
                    await window.SalesModule.loadSales();
                }
                if (window.CustomersModule && window.CustomersModule.loadCustomers) {
                    await window.CustomersModule.loadCustomers();
                }
                if (window.AccountsModule && window.AccountsModule.loadAccounts) {
                    await window.AccountsModule.loadAccounts();
                }
                if (window.ReportsModule && window.ReportsModule.loadReports) {
                    await window.ReportsModule.loadReports();
                }
            } else {
                showReturnsNotification('Failed to process return', 'error');
            }

        } catch (error) {
            console.error('❌ Error processing sale return:', error);
            showReturnsNotification('Error processing return', 'error');
        } finally {
            if (saveSaleReturnBtn) {
                saveSaleReturnBtn.disabled = false;
                saveSaleReturnBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"/>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                    </svg>
                    Process Return
                `;
            }
        }
    });
}

// ===== PROCESS PURCHASE RETURN =====
if (processPurchaseReturnBtn) {
    processPurchaseReturnBtn.addEventListener('click', async () => {
        await loadSalesAndPurchases();
        
        if (purchaseReturnPurchaseSelect) {
            purchaseReturnPurchaseSelect.innerHTML = '<option value="">-- Select a purchase to return --</option>' +
                purchasesData.map(purchase => 
                    `<option value="${purchase.id}">${purchase.purchase_id} - ${purchase.supplier_name || 'General'} - ${fmt(purchase.total)}</option>`
                ).join('');
        }
        
        if (purchaseReturnForm) purchaseReturnForm.reset();
        if (purchaseReturnDetails) purchaseReturnDetails.style.display = 'none';
        if (savePurchaseReturnBtn) savePurchaseReturnBtn.disabled = true;
        if (purchaseReturnCustomAmount) purchaseReturnCustomAmount.value = '';
        selectedPurchase = null;
        selectedPurchaseItems = [];
        purchaseReturnItems = [];
        editingReturnId = null;   // FIX: clear edit mode
        editingReturnType = null;
        if (purchaseReturnModal) purchaseReturnModal.classList.add('active');
    });
}

if (purchaseReturnPurchaseSelect) {
    purchaseReturnPurchaseSelect.addEventListener('change', async () => {
        const purchaseId = purchaseReturnPurchaseSelect.value;
        if (!purchaseId) {
            if (purchaseReturnDetails) purchaseReturnDetails.style.display = 'none';
            if (savePurchaseReturnBtn) savePurchaseReturnBtn.disabled = true;
            selectedPurchase = null;
            selectedPurchaseItems = [];
            purchaseReturnItems = [];
            return;
        }

        selectedPurchase = purchasesData.find(p => p.id === purchaseId);
        if (!selectedPurchase) return;

        const user2 = await window.StorageModule.getCurrentUser();

        const itemsResult = await window.StorageModule.supabase
            .from('purchase_items')
            .select('*')
            .eq('purchase_id', purchaseId)
            .eq('user_id', user2.id);  // Always filter by user for security and correctness

        selectedPurchaseItems = itemsResult.data || [];
        purchaseReturnItems = [];

        // ===== DOUBLE-RETURN PROTECTION =====
        // CRITICAL FIX: Exclude the return being edited so its items show as available again
        const user = await window.StorageModule.getCurrentUser();
        let alreadyReturnedMap = {};
        try {
            let returnsQuery = window.StorageModule.supabase
                .from('returns')
                .select('id')
                .eq('original_transaction_id', purchaseId)
                .eq('user_id', user.id);

            if (editingReturnId) {
                returnsQuery = returnsQuery.neq('id', editingReturnId);
            }

            const existingReturnsResult = await returnsQuery;
            if (existingReturnsResult.data && existingReturnsResult.data.length > 0) {
                const returnIds = existingReturnsResult.data.map(r => r.id);
                const returnItemsResult = await window.StorageModule.supabase
                    .from('return_items')
                    .select('product_id, quantity')
                    .in('return_id', returnIds);
                if (returnItemsResult.data) {
                    returnItemsResult.data.forEach(item => {
                        alreadyReturnedMap[item.product_id] = (alreadyReturnedMap[item.product_id] || 0) + item.quantity;
                    });
                }
            }
        } catch (e) { console.warn('Could not load existing returns:', e); }

        if (purchaseReturnPO) purchaseReturnPO.textContent = selectedPurchase.purchase_id || 'N/A';
        if (purchaseReturnSupplier) purchaseReturnSupplier.textContent = selectedPurchase.supplier_name || 'General';
        if (purchaseReturnTotal) purchaseReturnTotal.textContent = fmt(selectedPurchase.total || 0);
        if (purchaseReturnDate) purchaseReturnDate.textContent = formatDate(selectedPurchase.purchase_date || selectedPurchase.created_at);
        
        renderPurchaseReturnItems(alreadyReturnedMap);
        updatePurchaseReturnTotal();
        
        if (purchaseReturnDetails) purchaseReturnDetails.style.display = 'block';
        if (savePurchaseReturnBtn) savePurchaseReturnBtn.disabled = false;
    });
}

function renderPurchaseReturnItems(alreadyReturnedMap = {}) {
    if (!purchaseReturnItemsList) return;

    purchaseReturnItemsList.innerHTML = selectedPurchaseItems.map(item => {
        const alreadyReturned = alreadyReturnedMap[item.product_id] || 0;
        const maxReturnable = Math.max(0, item.quantity - alreadyReturned);
        const fullyReturned = maxReturnable === 0;

        return `
        <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); opacity: ${fullyReturned ? '0.5' : '1'};">
            <input type="checkbox" id="purchase-item-${item.id}" onchange="togglePurchaseReturnItem('${item.id}')" style="width: 20px; height: 20px; cursor: pointer;" ${fullyReturned ? 'disabled' : ''}>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--color-text-primary);">${item.product_name}</div>
                <div style="font-size: 0.85rem; color: var(--color-text-muted);">
                    Purchased: ${item.quantity} × ${fmt(item.purchase_price)} = ${fmt(item.total)}
                    ${alreadyReturned > 0 ? `<span style="color: var(--color-warning); font-weight:600;"> · Already Returned: ${alreadyReturned}</span>` : ''}
                </div>
            </div>
            ${fullyReturned
                ? `<span style="font-size:0.8rem; font-weight:700; color:var(--color-warning); background:#fef3c7; padding:0.25rem 0.6rem; border-radius:999px;">Fully Returned</span>`
                : `<div id="purchase-item-qty-${item.id}" style="display: none; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-secondary);">Return Qty:</label>
                    <input type="number" id="purchase-item-qty-input-${item.id}" min="1" max="${maxReturnable}" value="${maxReturnable}" onchange="updatePurchaseReturnItemQty('${item.id}', this.value)" style="width: 70px; padding: 0.4rem; background: var(--color-background); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-primary);">
                    <span style="font-size:0.8rem; color:var(--color-text-muted);">/ ${maxReturnable} left</span>
                </div>`
            }
        </div>
    `;
    }).join('');
}

window.togglePurchaseReturnItem = function(itemId) {
    const checkbox = document.getElementById(`purchase-item-${itemId}`);
    const qtyDiv = document.getElementById(`purchase-item-qty-${itemId}`);
    const item = selectedPurchaseItems.find(i => i.id === itemId);
    
    if (checkbox && checkbox.checked) {
        if (qtyDiv) qtyDiv.style.display = 'flex';
        const qtyInput = document.getElementById(`purchase-item-qty-input-${itemId}`);
        const maxQty = qtyInput ? parseInt(qtyInput.max) : item.quantity;
        purchaseReturnItems.push({
            ...item,
            returnQty: maxQty
        });
    } else {
        if (qtyDiv) qtyDiv.style.display = 'none';
        purchaseReturnItems = purchaseReturnItems.filter(i => i.id !== itemId);
    }
    
    updatePurchaseReturnTotal();
};

window.updatePurchaseReturnItemQty = function(itemId, qty) {
    const returnItem = purchaseReturnItems.find(i => i.id === itemId);
    if (returnItem) {
        const qtyInput = document.getElementById(`purchase-item-qty-input-${itemId}`);
        const maxQty = qtyInput ? parseInt(qtyInput.max) : returnItem.quantity;
        const clamped = Math.min(Math.max(1, parseInt(qty) || 1), maxQty);
        if (qtyInput) qtyInput.value = clamped;
        returnItem.returnQty = clamped;
        updatePurchaseReturnTotal();
    }
};

function updatePurchaseReturnTotal() {
    const total = purchaseReturnItems.reduce((sum, item) => {
        return sum + (item.purchase_price * item.returnQty);
    }, 0);
    if (purchaseReturnCalculatedTotal) purchaseReturnCalculatedTotal.textContent = fmt(total);
}

if (purchaseReturnForm) {
    purchaseReturnForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate purchase selection
        if (!selectedPurchase) {
            showReturnsNotification('Please select a purchase first', 'error');
            return;
        }

        if (purchaseReturnItems.length === 0) {
            showReturnsNotification('Please select at least one item to return', 'error');
            return;
        }

        // Validate reason
        const reason = purchaseReturnReason ? purchaseReturnReason.value : '';
        if (!reason) {
            showReturnsNotification('Please select a return reason', 'error');
            return;
        }

        if (savePurchaseReturnBtn) {
            savePurchaseReturnBtn.disabled = true;
            savePurchaseReturnBtn.textContent = '⏳ Processing...';
        }

        try {
            const user = await window.StorageModule.getCurrentUser();
            if (!user) throw new Error('Not authenticated');

            const notes = purchaseReturnNotes ? purchaseReturnNotes.value.trim() : '';

            const calculatedAmount = purchaseReturnItems.reduce((sum, item) => {
                return sum + (item.purchase_price * item.returnQty);
            }, 0);

            // Use custom amount if filled, otherwise use calculated
            const customAmountRaw = purchaseReturnCustomAmount ? parseFloat(purchaseReturnCustomAmount.value) : NaN;
            const totalAmount = (!isNaN(customAmountRaw) && customAmountRaw > 0) ? customAmountRaw : calculatedAmount;

            // Bug 10 fix: block zero-amount returns
            if (totalAmount <= 0) {
                showReturnsNotification('Return amount must be greater than zero', 'error');
                if (savePurchaseReturnBtn) {
                    savePurchaseReturnBtn.disabled = false;
                    savePurchaseReturnBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg> Process Return`;
                }
                return;
            }

            const returnData = {
                user_id: user.id,
                return_type: 'purchase',
                original_transaction_id: selectedPurchase.id,
                original_reference: selectedPurchase.purchase_id,
                customer_supplier_name: selectedPurchase.supplier_name || 'General',
                total_amount: totalAmount,
                reason: reason,
                notes: notes,
                return_date: new Date().toISOString()
            };

            // FIX: If editing an existing return, reverse its effects first then delete it
            if (editingReturnId) {
                console.log('📝 Edit mode: reversing old purchase return', editingReturnId);
                const oldItemsResult = await window.StorageModule.supabase
                    .from('return_items').select('*').eq('return_id', editingReturnId);
                for (const oldItem of (oldItemsResult.data || [])) {
                    if (oldItem.product_id) {
                        const pr = await window.StorageModule.getDataById('products', oldItem.product_id);
                        if (pr.success && pr.data) {
                            // Reverse: purchase return had reduced stock, so now restore it
                            const newStock = pr.data.stock + oldItem.quantity;
                            await window.StorageModule.updateData('products', oldItem.product_id, { stock: newStock });
                        }
                    }
                }
                await window.StorageModule.supabase.from('return_items').delete().eq('return_id', editingReturnId);
                await window.StorageModule.deleteData('returns', editingReturnId);
                editingReturnId = null;
                editingReturnType = null;
            }

            const result = await window.StorageModule.saveData('returns', returnData);

            if (result.success) {
                const returnId = result.data.id;

                // Save return items and reduce stock
                for (const item of purchaseReturnItems) {
                    await window.StorageModule.saveData('return_items', {
                        return_id: returnId,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity: item.returnQty,
                        price: item.purchase_price,
                        total: item.purchase_price * item.returnQty
                    });

                    if (item.product_id) {
                        const productResult = await window.StorageModule.getDataById('products', item.product_id);
                        if (productResult.success && productResult.data) {
                            const newStock = Math.max(0, productResult.data.stock - item.returnQty);
                            await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                            console.log('✅ Reduced stock for product:', item.product_name, '-', item.returnQty);
                        }
                    }
                }

                // **UPDATE THE ORIGINAL PURCHASE RECORD**
                // FIX: Do NOT touch purchase.total — it must stay as the gross (subtotal - discount).
                // Only update remaining_amount and payment_status, calculated from ALL returns.
                const allPurchaseReturnsResult = await window.StorageModule.supabase
                    .from('returns')
                    .select('total_amount')
                    .eq('original_transaction_id', selectedPurchase.id)
                    .eq('user_id', user.id);
                const totalAllPurchaseReturned = (allPurchaseReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

                const grossPurchaseTotal = selectedPurchase.total; // NEVER CHANGE THIS
                const netPurchaseTotal = Math.max(0, grossPurchaseTotal - totalAllPurchaseReturned);
                const newPaidAmount = selectedPurchase.paid_amount; // KEEP original — do not touch payment history
                const newRemainingAmount = Math.max(0, netPurchaseTotal - newPaidAmount);
                
                let newPaymentStatus = 'unpaid';
                if (netPurchaseTotal > 0 && newPaidAmount >= netPurchaseTotal) {
                    newPaymentStatus = 'paid';
                } else if (newPaidAmount > 0) {
                    newPaymentStatus = 'partial';
                }

                await window.StorageModule.updateData('purchases', selectedPurchase.id, {
                    // total intentionally NOT updated — keeps gross value intact
                    // paid_amount intentionally NOT updated — preserves payment history
                    remaining_amount: newRemainingAmount,
                    payment_status: newPaymentStatus
                });

                console.log('✅ Updated original purchase:', {
                    oldTotal: selectedPurchase.total,
                    newTotal: netPurchaseTotal,   // FIX: was newPurchaseTotal (undefined) — caused ReferenceError in catch
                    returnAmount: totalAmount,
                    newStatus: newPaymentStatus
                });

                showReturnsNotification('✅ Purchase return processed successfully', 'success');
                if (purchaseReturnModal) purchaseReturnModal.classList.remove('active');
                await loadReturns();

                // Update all modules
                if (window.AppModule && window.AppModule.loadDashboardStats) {
                    await window.AppModule.loadDashboardStats();
                }
                if (window.ProductsModule && window.ProductsModule.loadProducts) {
                    await window.ProductsModule.loadProducts();
                }
                if (window.PurchasesModule && window.PurchasesModule.loadPurchases) {
                    await window.PurchasesModule.loadPurchases();
                }
                if (window.SuppliersModule && window.SuppliersModule.loadSuppliers) {
                    await window.SuppliersModule.loadSuppliers();
                }
                if (window.AccountsModule && window.AccountsModule.loadAccounts) {
                    await window.AccountsModule.loadAccounts();
                }
                if (window.ReportsModule && window.ReportsModule.loadReports) {
                    await window.ReportsModule.loadReports();
                }
            } else {
                showReturnsNotification('Failed to process return', 'error');
            }

        } catch (error) {
            console.error('❌ Error processing purchase return:', error);
            showReturnsNotification('Error processing return', 'error');
        } finally {
            if (savePurchaseReturnBtn) {
                savePurchaseReturnBtn.disabled = false;
                savePurchaseReturnBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 10 20 15 15 20"/>
                        <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
                    </svg>
                    Process Return
                `;
            }
        }
    });
}

// ===== VIEW RETURN DETAILS =====
window.viewReturnDetails = async function(returnId) {
    try {
        const returnItem = returnsData.find(r => r.id === returnId);
        if (!returnItem) {
            console.error('❌ Return not found:', returnId);
            return;
        }

        // Get current user
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            showReturnsNotification('Please log in to view return details', 'error');
            return;
        }

        console.log('🔍 Fetching return items for return_id:', returnId, 'user_id:', user.id);

        // Try to fetch items - start with simplest query first
        let items = [];
        let queryError = null;
        
        // ATTEMPT 1: Try with user_id filter (proper way)
        console.log('Attempting query with user_id filter...');
        const attempt1 = await window.StorageModule.supabase
            .from('return_items')
            .select('*')
            .eq('return_id', returnId)
            .eq('user_id', user.id);
        
        if (attempt1.error) {
            console.error('❌ Query with user_id failed:', attempt1.error);
            console.error('   Error code:', attempt1.error.code);
            console.error('   Error message:', attempt1.error.message);
            console.error('   Error details:', attempt1.error.details);
            console.error('   Error hint:', attempt1.error.hint);
            queryError = attempt1.error;
            
            // ATTEMPT 2: Try without user_id filter (fallback)
            console.log('Attempting query WITHOUT user_id filter...');
            const attempt2 = await window.StorageModule.supabase
                .from('return_items')
                .select('*')
                .eq('return_id', returnId);
            
            if (attempt2.error) {
                console.error('❌ Query without user_id also failed:', attempt2.error);
                showReturnsNotification('Failed to load return items. Check console for details.', 'error');
                return;
            } else {
                console.log('✅ Found items without user_id filter:', attempt2.data?.length || 0);
                items = attempt2.data || [];
                if (items.length > 0) {
                    console.warn('⚠️ Using items without user_id filter. This may indicate missing user_id column or values.');
                }
            }
        } else {
            console.log('✅ Found items with user_id filter:', attempt1.data?.length || 0);
            items = attempt1.data || [];
        }
        
        console.log('📦 Total items to display:', items.length, items);

        // Calculate items total to detect if custom amount was used
        const itemsCalculatedTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
        const hasCustomAmount = Math.abs(itemsCalculatedTotal - (returnItem.total_amount || 0)) > 1;

        const isSale = returnItem.return_type === 'sale';
        const accentColor = isSale ? 'var(--color-danger)' : 'var(--color-warning)';
        const typeLabel = isSale ? '📤 Sale Return' : '📥 Purchase Return';
        const partyLabel = isSale ? 'Customer' : 'Supplier';

        const REASON_DISPLAY = {
            defective: 'Defective Product', wrong_item: isSale ? 'Wrong Item' : 'Wrong Item Received',
            customer_request: 'Customer Request', damaged: isSale ? 'Damaged' : 'Damaged in Transit',
            excess_qty: 'Excess Quantity', quality_issue: 'Quality Issue', other: 'Other'
        };

        if (returnDetailContent) {
            returnDetailContent.innerHTML = `
                <!-- Header info card -->
                <div class="return-view-card">
                    <div class="return-view-header">
                        <div>
                            <div class="return-view-type">${typeLabel}</div>
                            <div class="return-view-id">RET-${returnItem.id.slice(0, 8)}</div>
                        </div>
                        <div class="return-view-meta-right">
                            <div class="return-view-date">${formatDateTime(returnItem.return_date || returnItem.created_at)}</div>
                            <div class="return-view-ref">Ref: <strong>${returnItem.original_reference || 'N/A'}</strong></div>
                        </div>
                    </div>

                    <div class="return-view-info-grid">
                        <div class="return-view-info-cell">
                            <span class="return-view-label">${partyLabel}</span>
                            <span class="return-view-value">${returnItem.customer_supplier_name || 'N/A'}</span>
                        </div>
                        <div class="return-view-info-cell">
                            <span class="return-view-label">Reason</span>
                            <span class="return-view-value">${REASON_DISPLAY[returnItem.reason] || returnItem.reason || 'N/A'}</span>
                        </div>
                    </div>

                    ${returnItem.notes ? `
                        <div class="return-view-notes">
                            <span class="return-view-label">Notes</span>
                            <p>${returnItem.notes}</p>
                        </div>
                    ` : ''}
                </div>

                <!-- Items breakdown -->
                <div class="return-view-card">
                    <div class="return-view-section-title">📦 Returned Items (${items.length} product${items.length !== 1 ? 's' : ''})</div>

                    ${items.length > 0 ? `
                        <div class="return-view-items-table">
                            <div class="return-view-items-header">
                                <span>Product</span>
                                <span style="text-align:center;">Units</span>
                                <span style="text-align:right;">Price/Unit</span>
                                <span style="text-align:right;">Amount</span>
                            </div>
                            ${items.map(item => `
                                <div class="return-view-item-row">
                                    <span class="return-view-item-name">${item.product_name || 'Unknown'}</span>
                                    <span class="return-view-item-qty">${item.quantity}</span>
                                    <span class="return-view-item-price">${fmt(item.price || 0)}</span>
                                    <span class="return-view-item-total" style="color:${accentColor};">${fmt(item.total || 0)}</span>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Totals -->
                        <div class="return-view-totals">
                            <div class="return-view-total-row">
                                <span>Items Total:</span>
                                <span>${fmt(itemsCalculatedTotal)}</span>
                            </div>
                            ${hasCustomAmount ? `
                            <div class="return-view-total-row" style="color:var(--color-text-muted); font-size:0.85rem;">
                                <span>Custom Amount Applied</span>
                                <span style="font-style:italic;">overridden</span>
                            </div>
                            ` : ''}
                            <div class="return-view-total-row return-view-final-total" style="color:${accentColor};">
                                <span>Final Return Amount:</span>
                                <span>${fmt(returnItem.total_amount || 0)}</span>
                            </div>
                        </div>
                    ` : `<div style="padding:1rem; color:var(--color-text-muted); text-align:center;">No item details recorded</div>`}
                </div>
            `;
        }

        if (returnDetailModal) returnDetailModal.classList.add('active');

    } catch (error) {
        console.error('❌ Error viewing return:', error);
        showReturnsNotification('Error loading return details', 'error');
    }
};

// ===== EDIT RETURN =====
window.editReturn = async function(returnId) {
    try {
        const returnItem = returnsData.find(r => r.id === returnId);
        if (!returnItem) return;

        // FIX: Set editing mode BEFORE opening the modal
        editingReturnId = returnId;
        editingReturnType = returnItem.return_type;

        // Load return items
        const itemsResult = await window.StorageModule.supabase
            .from('return_items')
            .select('*')
            .eq('return_id', returnId);

        const items = itemsResult.data || [];

        if (returnItem.return_type === 'sale') {
            // Open sale return modal in edit mode
            await loadSalesAndPurchases();
            
            // Find the original sale
            const originalSale = salesData.find(s => s.id === returnItem.original_transaction_id);
            if (!originalSale) {
                showReturnsNotification('Original sale not found', 'error');
                return;
            }

            // Populate sale dropdown
            if (saleReturnSaleSelect) {
                saleReturnSaleSelect.innerHTML = '<option value="">-- Select a sale to return --</option>' +
                    salesData.map(sale => 
                        `<option value="${sale.id}" ${sale.id === originalSale.id ? 'selected' : ''}>${sale.invoice_id} - ${sale.customer_name || 'Walk-in'} - ${fmt(sale.total)}</option>`
                    ).join('');
                
                // Trigger change to load items
                saleReturnSaleSelect.dispatchEvent(new Event('change'));
                
                // Wait for items to load, then pre-select returned items
                // CRITICAL FIX: return_items have their own IDs; checkboxes use sale_item.id.
                // Match by product_id to find the correct sale_item, then tick that checkbox.
                // Also capture outer returnItem as returnRecord to avoid name clash inside forEach.
                const returnRecord = returnItem;
                setTimeout(() => {
                    items.forEach(retItem => {
                        // Find the sale_item that matches this return_item's product
                        const matchingSaleItem = selectedSaleItems.find(si => si.product_id === retItem.product_id);
                        if (!matchingSaleItem) return;

                        const checkbox = document.getElementById(`sale-item-${matchingSaleItem.id}`);
                        if (checkbox && !checkbox.disabled) {
                            checkbox.checked = true;
                            checkbox.dispatchEvent(new Event('change'));
                            
                            // Set quantity to what was previously returned
                            const qtyInput = document.getElementById(`sale-item-qty-input-${matchingSaleItem.id}`);
                            if (qtyInput) {
                                qtyInput.value = retItem.quantity;
                                qtyInput.dispatchEvent(new Event('change'));
                            }
                        }
                    });
                    
                    // Set reason and notes from the return record
                    if (saleReturnReason) saleReturnReason.value = returnRecord.reason;
                    if (saleReturnNotes) saleReturnNotes.value = returnRecord.notes || '';
                }, 500);
            }
            
            if (saleReturnModal) saleReturnModal.classList.add('active');
            
        } else {
            // Open purchase return modal in edit mode
            await loadSalesAndPurchases();
            
            const originalPurchase = purchasesData.find(p => p.id === returnItem.original_transaction_id);
            if (!originalPurchase) {
                showReturnsNotification('Original purchase not found', 'error');
                return;
            }

            if (purchaseReturnPurchaseSelect) {
                purchaseReturnPurchaseSelect.innerHTML = '<option value="">-- Select a purchase to return --</option>' +
                    purchasesData.map(purchase => 
                        `<option value="${purchase.id}" ${purchase.id === originalPurchase.id ? 'selected' : ''}>${purchase.purchase_id} - ${purchase.supplier_name || 'General'} - ${fmt(purchase.total)}</option>`
                    ).join('');
                
                purchaseReturnPurchaseSelect.dispatchEvent(new Event('change'));
                
                const returnRecord = returnItem;
                setTimeout(() => {
                    // CRITICAL FIX: Match return_items to purchase_items by product_id
                    items.forEach(retItem => {
                        const matchingPurchaseItem = selectedPurchaseItems.find(pi => pi.product_id === retItem.product_id);
                        if (!matchingPurchaseItem) return;

                        const checkbox = document.getElementById(`purchase-item-${matchingPurchaseItem.id}`);
                        if (checkbox && !checkbox.disabled) {
                            checkbox.checked = true;
                            checkbox.dispatchEvent(new Event('change'));
                            
                            const qtyInput = document.getElementById(`purchase-item-qty-input-${matchingPurchaseItem.id}`);
                            if (qtyInput) {
                                qtyInput.value = retItem.quantity;
                                qtyInput.dispatchEvent(new Event('change'));
                            }
                        }
                    });
                    
                    if (purchaseReturnReason) purchaseReturnReason.value = returnRecord.reason;
                    if (purchaseReturnNotes) purchaseReturnNotes.value = returnRecord.notes || '';
                }, 500);
            }
            
            if (purchaseReturnModal) purchaseReturnModal.classList.add('active');
        }

    } catch (error) {
        console.error('❌ Error editing return:', error);
        showReturnsNotification('Error loading return for editing', 'error');
    }
};

// ===== DELETE RETURN =====
let returnToDelete = null;

window.confirmDeleteReturn = function(returnId) {
    returnToDelete = returnsData.find(r => r.id === returnId);
    if (!returnToDelete) return;
    
    const deleteReturnModal = document.getElementById('delete-return-modal');
    const deleteReturnInfo = document.getElementById('delete-return-info');
    
    if (deleteReturnInfo) {
        deleteReturnInfo.textContent = `RET-${returnToDelete.id.slice(0, 8)} (${returnToDelete.return_type === 'sale' ? 'Sale Return' : 'Purchase Return'})`;
    }
    
    if (deleteReturnModal) deleteReturnModal.classList.add('active');
};

window.deleteReturn = async function() {
    if (!returnToDelete) return;
    
    const confirmBtn = document.getElementById('confirm-delete-return-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Deleting...';
    }
    
    try {
        // Get return items
        const itemsResult = await window.StorageModule.supabase
            .from('return_items')
            .select('*')
            .eq('return_id', returnToDelete.id);
        
        const items = itemsResult.data || [];
        
        // Reverse stock changes
        if (returnToDelete.return_type === 'sale') {
            // Return was: restored stock, so deletion should: reduce stock
            for (const item of items) {
                if (item.product_id) {
                    const productResult = await window.StorageModule.getDataById('products', item.product_id);
                    if (productResult.success && productResult.data) {
                        const newStock = Math.max(0, productResult.data.stock - item.quantity);
                        await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                    }
                }
            }
            
            // Restore original sale totals — recompute from remaining returns after deletion
            const saleResult = await window.StorageModule.getDataById('sales', returnToDelete.original_transaction_id);
            if (saleResult.success && saleResult.data) {
                const sale = saleResult.data;
                // Fetch all remaining returns EXCLUDING the one being deleted
                const remainingReturnsResult = await window.StorageModule.supabase
                    .from('returns')
                    .select('total_amount')
                    .eq('original_transaction_id', sale.id)
                    .neq('id', returnToDelete.id);
                const totalRemainingReturned = (remainingReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

                // gross total is sale.total (we no longer mutate it, so it's always gross)
                // For old data where it was mutated: use subtotal - discount to get gross
                const grossTotal = (sale.subtotal || 0) - (sale.discount || 0) || sale.total;
                const netTotal = Math.max(0, grossTotal - totalRemainingReturned);
                const newPaid = sale.paid_amount;
                const newRemaining = Math.max(0, netTotal - newPaid);
                
                let newStatus = 'unpaid';
                if (netTotal > 0 && newPaid >= netTotal) newStatus = 'paid';
                else if (newPaid > 0) newStatus = 'partial';
                
                await window.StorageModule.updateData('sales', sale.id, {
                    remaining_amount: newRemaining,
                    payment_status: newStatus
                });
            }
            
        } else {
            // Return was: reduced stock, so deletion should: restore stock
            for (const item of items) {
                if (item.product_id) {
                    const productResult = await window.StorageModule.getDataById('products', item.product_id);
                    if (productResult.success && productResult.data) {
                        const newStock = productResult.data.stock + item.quantity;
                        await window.StorageModule.updateData('products', item.product_id, { stock: newStock });
                    }
                }
            }
            
            // Restore original purchase totals — recompute from remaining returns after deletion
            const purchaseResult = await window.StorageModule.getDataById('purchases', returnToDelete.original_transaction_id);
            if (purchaseResult.success && purchaseResult.data) {
                const purchase = purchaseResult.data;
                const remainingReturnsResult = await window.StorageModule.supabase
                    .from('returns')
                    .select('total_amount')
                    .eq('original_transaction_id', purchase.id)
                    .neq('id', returnToDelete.id);
                const totalRemainingReturned = (remainingReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

                const grossTotal = (purchase.subtotal || 0) - (purchase.discount || 0) || purchase.total;
                const netTotal = Math.max(0, grossTotal - totalRemainingReturned);
                const newPaid = purchase.paid_amount;
                const newRemaining = Math.max(0, netTotal - newPaid);
                
                let newStatus = 'unpaid';
                if (netTotal > 0 && newPaid >= netTotal) newStatus = 'paid';
                else if (newPaid > 0) newStatus = 'partial';
                
                await window.StorageModule.updateData('purchases', purchase.id, {
                    remaining_amount: newRemaining,
                    payment_status: newStatus
                });
            }
        }
        
        // Delete return items
        await window.StorageModule.supabase
            .from('return_items')
            .delete()
            .eq('return_id', returnToDelete.id);
        
        // Delete return
        await window.StorageModule.deleteData('returns', returnToDelete.id);
        
        showReturnsNotification('✅ Return deleted successfully', 'success');
        
        const deleteReturnModal = document.getElementById('delete-return-modal');
        if (deleteReturnModal) deleteReturnModal.classList.remove('active');
        
        await loadReturns();
        
        // Reload modules
        if (window.AppModule?.loadDashboardStats) await window.AppModule.loadDashboardStats();
        if (window.ProductsModule?.loadProducts) await window.ProductsModule.loadProducts();
        if (window.SalesModule?.loadSales) await window.SalesModule.loadSales();
        if (window.PurchasesModule?.loadPurchases) await window.PurchasesModule.loadPurchases();
        if (window.CustomersModule?.loadCustomers) await window.CustomersModule.loadCustomers();
        if (window.SuppliersModule?.loadSuppliers) await window.SuppliersModule.loadSuppliers();
        if (window.AccountsModule?.loadAccounts) await window.AccountsModule.loadAccounts();
        if (window.ReportsModule?.loadReports) await window.ReportsModule.loadReports();
        
    } catch (error) {
        console.error('❌ Error deleting return:', error);
        showReturnsNotification('Error deleting return', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete Return
            `;
        }
        returnToDelete = null;
    }
};

// ===== EVENT LISTENERS =====
if (returnsSearch) returnsSearch.addEventListener('input', applyFilters);
if (returnsTypeFilter) returnsTypeFilter.addEventListener('change', applyFilters);
if (applyReturnsFilterBtn) applyReturnsFilterBtn.addEventListener('click', applyFilters);

if (clearReturnsFilterBtn) {
    clearReturnsFilterBtn.addEventListener('click', () => {
        if (returnsSearch) returnsSearch.value = '';
        if (returnsTypeFilter) returnsTypeFilter.value = '';
        if (returnsDateFrom) returnsDateFrom.value = '';
        if (returnsDateTo) returnsDateTo.value = '';
        applyFilters();
    });
}

if (closeSaleReturnModal) closeSaleReturnModal.addEventListener('click', () => {
    editingReturnId = null; editingReturnType = null;
    saleReturnModal && saleReturnModal.classList.remove('active');
});
if (cancelSaleReturnBtn) cancelSaleReturnBtn.addEventListener('click', () => {
    editingReturnId = null; editingReturnType = null;
    saleReturnModal && saleReturnModal.classList.remove('active');
});

if (closePurchaseReturnModal) closePurchaseReturnModal.addEventListener('click', () => {
    editingReturnId = null; editingReturnType = null;
    purchaseReturnModal && purchaseReturnModal.classList.remove('active');
});
if (cancelPurchaseReturnBtn) cancelPurchaseReturnBtn.addEventListener('click', () => {
    editingReturnId = null; editingReturnType = null;
    purchaseReturnModal && purchaseReturnModal.classList.remove('active');
});

if (closeReturnDetailModal) closeReturnDetailModal.addEventListener('click', () => returnDetailModal && returnDetailModal.classList.remove('active'));
if (closeReturnDetailBtn) closeReturnDetailBtn.addEventListener('click', () => returnDetailModal && returnDetailModal.classList.remove('active'));

if (saleReturnModal) {
    saleReturnModal.addEventListener('click', (e) => {
        if (e.target === saleReturnModal) {
            editingReturnId = null; editingReturnType = null;
            saleReturnModal.classList.remove('active');
        }
    });
}
if (purchaseReturnModal) {
    purchaseReturnModal.addEventListener('click', (e) => {
        if (e.target === purchaseReturnModal) {
            editingReturnId = null; editingReturnType = null;
            purchaseReturnModal.classList.remove('active');
        }
    });
}
if (returnDetailModal) {
    returnDetailModal.addEventListener('click', (e) => {
        if (e.target === returnDetailModal) returnDetailModal.classList.remove('active');
    });
}

// ===== NOTIFICATION =====
function showReturnsNotification(msg, type) {
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
async function initReturnsPage() {
    console.log('🚀 Initializing Returns Page...');
    
    // CRITICAL FIX: Clear all filters on page load
    const returnsSearch = document.getElementById('returns-search');
    const returnsStatusFilter = document.getElementById('returns-status-filter');
    const returnsDateFrom = document.getElementById('returns-date-from');
    const returnsDateTo = document.getElementById('returns-date-to');
    
    if (returnsSearch) returnsSearch.value = '';
    if (returnsStatusFilter) returnsStatusFilter.value = '';
    if (returnsDateFrom) returnsDateFrom.value = '';
    if (returnsDateTo) returnsDateTo.value = '';
    
    // ... rest of existing code
    
    await loadReturns();
}

window.ReturnsModule = { initReturnsPage, loadReturns };
console.log('✅ Returns Module Loaded');

// Delete return modal listeners
const closeDeleteReturnModal = document.getElementById('close-delete-return-modal');
const cancelDeleteReturnBtn = document.getElementById('cancel-delete-return-btn');
const confirmDeleteReturnBtn = document.getElementById('confirm-delete-return-btn');

if (closeDeleteReturnModal) closeDeleteReturnModal.addEventListener('click', () => {
    const modal = document.getElementById('delete-return-modal');
    if (modal) modal.classList.remove('active');
});

if (cancelDeleteReturnBtn) cancelDeleteReturnBtn.addEventListener('click', () => {
    const modal = document.getElementById('delete-return-modal');
    if (modal) modal.classList.remove('active');
});

if (confirmDeleteReturnBtn) confirmDeleteReturnBtn.addEventListener('click', deleteReturn);

/* ==========================================
   JS END: Returns Module
   ========================================== */
})(); // end IIFE