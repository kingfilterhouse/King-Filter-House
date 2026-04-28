(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.XModule exports are accessible globally.
   This prevents applyFilters / updateSummaryStats / fmt / formatDate
   from colliding across modules.
   ========================================== */

/* ==========================================
   JS START: Sales Listing Module - COMPLETE FIX
   Fixed: Stats show 0 on load, table empty on load
   ========================================== */

// ===== STATE =====
let salesListData = [];
let filteredSalesData = [];
let currentSaleId   = null;
let _currentSale    = null;
let _currentSaleItems = [];
let deletingSaleId = null;
// Returned amount per sale — populated in renderSales, consumed by updateSummaryStats
let returnedAmountBySaleId = {};

// ===== HELPERS =====
// Use centralized formatter
const fmt = window.Utils.fmt;

function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('en-US', dateOptions) + ' at ' + date.toLocaleTimeString('en-US', timeOptions);
}

// ===== LOAD SALES =====
async function loadSales() {
    try {
        window.log('🔄 Loading sales...');
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            window.log('⚠️ No user logged in');
            salesListData = [];
            filteredSalesData = [];
            renderSales();
            updateSummaryStats();
            return;
        }

        const result = await window.StorageModule.getAllData('sales');
        
        if (result.success) {
            salesListData = result.data || [];
            window.log('✅ Loaded', salesListData.length, 'sales');
            
            // CRITICAL FIX: Apply filters after loading to populate filteredSalesData
            await applyFilters();
        } else {
            logError('❌ Failed to load sales:', result.error);
            showSalesNotification('Failed to load sales', 'error');
            salesListData = [];
            filteredSalesData = [];
            await renderSales();
            updateSummaryStats();
        }
    } catch (error) {
        logError('❌ Error loading sales:', error);
        showSalesNotification('Error loading sales', 'error');
        salesListData = [];
        filteredSalesData = [];
        renderSales();
        updateSummaryStats();
    }
}

// ===== APPLY FILTERS =====
async function applyFilters() {
    try {
        // Query DOM elements inside function
        const salesSearch = document.getElementById('sales-search');
        const salesStatusFilter = document.getElementById('sales-status-filter');
        const salesDateFrom = document.getElementById('sales-date-from');
        const salesDateTo = document.getElementById('sales-date-to');
        
        // Get current values safely
        const searchTerm = (salesSearch && salesSearch.value) ? salesSearch.value.toLowerCase().trim() : '';
        const statusFilter = (salesStatusFilter && salesStatusFilter.value) ? salesStatusFilter.value : '';
        const dateFrom = (salesDateFrom && salesDateFrom.value) ? salesDateFrom.value : '';
        const dateTo = (salesDateTo && salesDateTo.value) ? salesDateTo.value : '';

        window.log('🔍 Applying filters:', { searchTerm, statusFilter, dateFrom, dateTo });

        // Filter from salesListData
        filteredSalesData = salesListData.filter(sale => {
            // Search filter - if empty, match all
            const matchesSearch = !searchTerm || 
                (sale.invoice_id && sale.invoice_id.toLowerCase().includes(searchTerm)) ||
                (sale.customer_name && sale.customer_name.toLowerCase().includes(searchTerm)) ||
                (sale.customer_phone && sale.customer_phone.includes(searchTerm));

            // Status filter - if empty, match all
            const matchesStatus = !statusFilter || sale.payment_status === statusFilter;

            // Date filters
            const saleDate = new Date(sale.sale_date || sale.created_at);
            const matchesDateFrom = !dateFrom || saleDate >= new Date(dateFrom);
            const matchesDateTo = !dateTo || saleDate <= new Date(dateTo + 'T23:59:59');

            return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
        });

        window.log('✅ Filtered:', filteredSalesData.length, 'of', salesListData.length, 'sales');
        
        // Render filtered results
        await renderSales();
        
        // CRITICAL FIX: Stats always show ALL data (not filtered)
        updateSummaryStats();
    } catch (error) {
        logError('❌ Error in applyFilters:', error);
    }
}

// ===== RENDER SALES TABLE =====
async function renderSales() {
    const salesTableBody = document.getElementById('sales-table-body');
    
    if (!salesTableBody) {
        logWarn('⚠️ Sales table body element not found');
        return;
    }

    if (filteredSalesData.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
                    <div style="font-size: 1.1rem; font-weight: 600;">No sales found</div>
                    <div style="font-size: 0.9rem; margin-top: 0.5rem;">
                        ${salesListData.length === 0 ? 'Create your first sale to see it here' : 'Try adjusting your filters'}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // PERFORMANCE FIX: Load ALL sale items in ONE query (was N individual queries)
    const saleItemsMap = await window.StorageModule.getSaleItemsBatch(
        filteredSalesData.map(s => s.id)
    );

    // Load returns — one query covers: badge display, net units, net amount, stats
    const returnsResult = await window.StorageModule.getAllData('returns');
    const salesWithReturns = new Set();
    const returnedQtyBySaleId = {};
    returnedAmountBySaleId = {}; // reset module-level map so updateSummaryStats sees fresh data

    if (returnsResult.success) {
        const saleReturns = returnsResult.data.filter(r => r.return_type === 'sale');

        saleReturns.forEach(r => {
            salesWithReturns.add(r.original_transaction_id);
            // total_amount on the return record = refunded sell value for that return
            returnedAmountBySaleId[r.original_transaction_id] =
                (returnedAmountBySaleId[r.original_transaction_id] || 0) + (r.total_amount || 0);
        });

        // Fetch return_items for net-unit calculation (quantities are only on return_items)
        if (saleReturns.length > 0) {
            const retItemsResult = await window.StorageModule.supabase
                .from('return_items')
                .select('return_id, quantity')
                .in('return_id', saleReturns.map(r => r.id));

            if (!retItemsResult.error && retItemsResult.data) {
                const retIdToSaleId = {};
                saleReturns.forEach(r => { retIdToSaleId[r.id] = r.original_transaction_id; });

                retItemsResult.data.forEach(ri => {
                    const saleId = retIdToSaleId[ri.return_id];
                    if (saleId) {
                        returnedQtyBySaleId[saleId] = (returnedQtyBySaleId[saleId] || 0) + (ri.quantity || 0);
                    }
                });
            }
        }
    }

    salesTableBody.innerHTML = filteredSalesData.map(sale => {
        const items = saleItemsMap[sale.id] || [];
        const itemLines = items.length;
        const grossUnits = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        // FIX Bug #3: subtract returned units so the column shows net sold units
        const returnedUnits = returnedQtyBySaleId[sale.id] || 0;
        const itemUnits = Math.max(0, grossUnits - returnedUnits);
        const itemDisplay = itemUnits > 0 ? itemUnits : (grossUnits > 0 ? 0 : itemLines);
        const hasReturn = salesWithReturns.has(sale.id);
        
        // Calculate net total (after returns)
        const grossTotal = sale.total || 0;
        const returnedAmount = returnedAmountBySaleId[sale.id] || 0;
        const paidAmount = sale.paid_amount || 0;
        const remaining = sale.remaining_amount || 0;
        
        // Check if NIL was used: fully paid but paid amount is less than total
        const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
        
        // If NIL used, show actual collected amount; otherwise show invoice total minus returns
        const netTotal = nilUsed 
            ? Math.max(0, paidAmount - returnedAmount)
            : Math.max(0, grossTotal - returnedAmount);

        let statusClass = 'unpaid';
        if (sale.payment_status === 'paid') statusClass = 'paid';
        else if (sale.payment_status === 'partial') statusClass = 'partial';
        else if (sale.payment_status === 'returned') statusClass = 'returned';

        return `
            <tr>
                <td>
                    <span class="sale-invoice-id">${sale.invoice_id || 'N/A'}</span>
                    ${hasReturn ? `<span class="has-returns-badge">🔄 Return</span>` : ''}
                </td>
                <td><span class="sale-date">${formatDate(sale.sale_date || sale.created_at)}</span></td>
                <td>
                    <span class="sale-customer-name">${sale.customer_name || 'Walk-in'}</span>
                    ${sale.supplier_id ? `<span class="supplier-sale-badge">🚚 Supplier</span>` : ''}
                    ${sale.customer_phone ? `<span class="sale-customer-phone">${sale.customer_phone}</span>` : ''}
                </td>
                <td>
                    <span class="sale-items-count" title="${itemLines} product line${itemLines !== 1 ? 's' : ''}">
                        \u{1F4E6} ${itemDisplay} ${itemDisplay === 1 ? 'unit' : 'units'}
                    </span>
                </td>
                <td><span class="sale-amount total">${fmt(netTotal)}</span></td>
                <td><span class="sale-amount paid">${fmt(sale.paid_amount || 0)}</span></td>
                <td><span class="sale-amount remaining">${fmt(sale.remaining_amount || 0)}</span></td>
              <td>
                    ${hasReturn ? `<span class="sale-status-badge returned">↩ Returned</span>` : `<span class="sale-status-badge ${statusClass}">${sale.payment_status || 'unpaid'}</span>`}
                </td>
                <td>
                    <div class="sale-actions">
                        <button class="sale-action-btn view" onclick="viewSaleDetails('${sale.id}')" title="View Details">👁️</button>

                        <button class="sale-action-btn edit" onclick="editSale('${sale.id}')" title="Edit Sale">✏️</button>
                        <button class="sale-action-btn delete" onclick="deleteSale('${sale.id}', '${sale.invoice_id}')" title="Delete Sale">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== UPDATE SUMMARY STATS =====
// CRITICAL FIX: Stats calculated from ALL data (salesListData), not filtered data
function updateSummaryStats() {
    const salesTotalCount = document.getElementById('sales-total-count');
    const salesTotalRevenue = document.getElementById('sales-total-revenue');
    const salesPendingAmount = document.getElementById('sales-pending-amount');
    const salesAvgValue = document.getElementById('sales-avg-value');
    
    // ✅ CORRECT: Calculate from ALL sales data, using NET total (gross minus any returns)
    const totalSales = salesListData.length;
    const totalRevenue = salesListData.reduce((sum, s) => {
        const netTotal = Math.max(0, (parseFloat(s.total) || 0) - (returnedAmountBySaleId[s.id] || 0));
        return sum + netTotal;
    }, 0);
    const pendingAmount = salesListData.reduce((sum, s) => sum + (parseFloat(s.remaining_amount) || 0), 0);
    const avgValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    window.log('📊 Stats (from ALL data):', { totalSales, totalRevenue, pendingAmount, avgValue });

    if (salesTotalCount) salesTotalCount.textContent = totalSales;
    if (salesTotalRevenue) salesTotalRevenue.textContent = fmt(totalRevenue);
    if (salesPendingAmount) salesPendingAmount.textContent = fmt(pendingAmount);
    if (salesAvgValue) salesAvgValue.textContent = fmt(avgValue);
}

// ===== VIEW SALE DETAILS =====
window.viewSaleDetails = async function(saleId) {
    try {
        window.log('🔍 Viewing sale:', saleId);
        currentSaleId = saleId;

        // Get DOM elements
        const saleDetailModal = document.getElementById('sale-detail-modal');
        const saleDetailContent = document.getElementById('sale-detail-content');
        
        if (!saleDetailModal || !saleDetailContent) {
            logError('❌ Sale detail modal elements not found');
            showSalesNotification('Error: Modal not found', 'error');
            return;
        }

        const saleResult = await window.StorageModule.getDataById('sales', saleId);
        if (!saleResult.success) {
            showSalesNotification('Failed to load sale details', 'error');
            return;
        }

        const sale = saleResult.data;
        _currentSale = sale;
        const itemsResult = await window.StorageModule.getSaleItems(saleId);
        const items = itemsResult.data || [];
        _currentSaleItems = items;

        window.log('📦 Loaded sale items:', items.length, items);

        const user = await window.StorageModule.getCurrentUser();
        const returnsForSale = await window.StorageModule.supabase
            .from('returns')
            .select('*')
            .eq('return_type', 'sale')
            .eq('original_transaction_id', saleId)
            .eq('user_id', user.id)
            .order('return_date', { ascending: true });
        const saleReturns = returnsForSale.data || [];
        const totalReturned = saleReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0);

        const returnItemsMap = {};
        if (saleReturns.length > 0) {
            const returnIds = saleReturns.map(r => r.id);
            const allReturnItemsNoFilter = await window.StorageModule.supabase
                .from('return_items')
                .select('*')
                .in('return_id', returnIds);
            const allReturnItems = await window.StorageModule.supabase
                .from('return_items')
                .select('*')
                .in('return_id', returnIds)
                .eq('user_id', user.id);
            const itemsToUse = (allReturnItems.data?.length > 0) ? allReturnItems.data : allReturnItemsNoFilter.data;
            if (itemsToUse) {
                itemsToUse.forEach(ri => {
                    if (!returnItemsMap[ri.return_id]) returnItemsMap[ri.return_id] = [];
                    returnItemsMap[ri.return_id].push(ri);
                });
            }
        }

        const reasonLabels = {
            defective: 'Defective Product', wrong_item: 'Wrong Item',
            customer_request: 'Customer Request', damaged: 'Damaged',
            excess_qty: 'Excess Quantity', quality_issue: 'Quality Issue', other: 'Other'
        };

        saleDetailContent.innerHTML = `
            <div class="sale-detail-header">
                <div>
                    <div class="sale-detail-invoice">${sale.invoice_id || 'N/A'}</div>
                    <div class="sale-detail-date">${formatDateTime(sale.sale_date || sale.created_at)}</div>
                </div>
                <div style="text-align: right;">
                    <div class="sale-detail-customer-name">${sale.customer_name || 'Walk-in Customer'}</div>
                    ${sale.customer_phone ? `<div class="sale-detail-customer-phone">${sale.customer_phone}</div>` : ''}
                </div>
            </div>

            <div class="sale-detail-status">
                <span class="sale-status-badge ${sale.payment_status}">${sale.payment_status || 'unpaid'}</span>
                ${saleReturns.length > 0 ? `<span class="has-returns-badge" style="margin-left:0.5rem;">🔄 ${saleReturns.length} Return${saleReturns.length > 1 ? 's' : ''}</span>` : ''}
            </div>

            <div class="sale-detail-items">
                <div class="sale-detail-items-title">📦 Items Sold</div>
                ${items.map(item => `
                    <div class="sale-detail-item">
                        <div>
                            <div class="sale-detail-item-name">${item.product_name || 'Unknown'}</div>
                            <div class="sale-detail-item-meta">
                                ${item.quantity} × ${fmt(item.sell_price || item.unit_price || 0)}
                            </div>
                        </div>
                        <div class="sale-detail-item-total">${fmt((item.quantity || 0) * (item.sell_price || item.unit_price || 0))}</div>
                    </div>
                `).join('')}
            </div>

            <div class="sale-detail-totals">
                <div class="sale-detail-total-row">
                    <span class="sale-detail-total-label">Subtotal:</span>
                    <span class="sale-detail-total-value">${fmt(sale.subtotal || 0)}</span>
                </div>
                <div class="sale-detail-total-row">
                    <span class="sale-detail-total-label">Discount:</span>
                    <span class="sale-detail-total-value">-${fmt(sale.discount || 0)}</span>
                </div>
                <div class="sale-detail-total-row">
                    <span class="sale-detail-total-label">Total:</span>
                    <span class="sale-detail-total-value">${fmt(sale.total || 0)}</span>
                </div>
                <div class="sale-detail-total-row">
                    <span class="sale-detail-total-label">Amount Paid:</span>
                    <span class="sale-detail-total-value">${fmt(sale.paid_amount || 0)}</span>
                </div>
                <div class="sale-detail-total-row">
                    <span class="sale-detail-total-label">Remaining Amount:</span>
                    <span class="sale-detail-total-value">${fmt(sale.remaining_amount || 0)}</span>
                </div>
                ${totalReturned > 0 ? `
                <div class="sale-detail-total-row" style="margin-top:0.25rem; border-top: 2px dashed var(--color-border);">
                    <span class="sale-detail-total-label" style="color:var(--color-danger);">Total Returned:</span>
                    <span class="sale-detail-total-value" style="color:var(--color-danger);">-${fmt(totalReturned)}</span>
                </div>
                <div class="sale-detail-total-row net-highlight">
                    <span class="sale-detail-total-label">Net Revenue:</span>
                    <span class="sale-detail-total-value net-value">${fmt(Math.max(0, (sale.subtotal - (sale.discount || 0)) - totalReturned))}</span>
                </div>
                ` : ''}
            </div>

            ${saleReturns.length > 0 ? `
            <div class="returns-history-section">
                <div class="returns-history-title">🔄 Returns History</div>
                ${saleReturns.map(ret => {
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
                            <div class="return-history-amount">-${fmt(ret.total_amount || 0)}</div>
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
                                    <span style="color:var(--color-danger);">-${fmt(ri.total || 0)}</span>
                                </div>
                            `).join('')}
                            ${hasCustom ? `
                            <div class="return-history-items-row" style="font-size:0.8rem; color:var(--color-text-muted); font-style:italic;">
                                <span colspan="3">Custom amount applied</span><span></span><span></span>
                                <span style="color:var(--color-danger);">-${fmt(ret.total_amount || 0)}</span>
                            </div>` : ''}
                        </div>
                        ` : ''}
                    </div>`;
                }).join('')}
            </div>
            ` : ''}

            ${sale.notes ? `
                <div class="sale-detail-notes">
                    <div class="sale-detail-notes-title">📝 Notes</div>
                    <div class="sale-detail-notes-text">${sale.notes}</div>
                </div>
            ` : ''}

            <button class="manage-payments-btn" onclick="window.PaymentModule.openPaymentManagement('${sale.id}', 'sale', ${JSON.stringify(sale).replace(/"/g, '&quot;')})">
                💳 Manage Payments
            </button>
        `;

        saleDetailModal.classList.add('active');
    } catch (error) {
        logError('❌ Error viewing sale:', error);
        showSalesNotification('Error loading sale details', 'error');
    }
};


// ===== EDIT SALE =====
let editingSaleId = null;
let editSaleItems = [];
let editSaleOriginalItems = [];

window.editSale = async function(saleId) {
    try {
        window.log('✏️ Editing sale:', saleId);
        editingSaleId = saleId;

        // Get sale data
        const sale = salesListData.find(s => s.id === saleId);
        if (!sale) {
            showSalesNotification('Sale not found', 'error');
            return;
        }

        // Get sale items
        const itemsResult = await window.StorageModule.getSaleItems(saleId);
        const items = itemsResult.data || [];
        
        // Store original items for stock calculation
        editSaleOriginalItems = JSON.parse(JSON.stringify(items));
        editSaleItems = JSON.parse(JSON.stringify(items));

        window.log('📦 Loaded', items.length, 'items for editing');

        // Get all products for dropdown
        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];

        // Open edit modal
        const editSaleModal = document.getElementById('edit-sale-modal');
        if (!editSaleModal) {
            logError('❌ Edit sale modal not found in HTML!');
            showSalesNotification('Edit modal not found. Please update your HTML.', 'error');
            return;
        }

        // Fill in the form
        document.getElementById('edit-sale-invoice').value = sale.invoice_id || '';
        document.getElementById('edit-sale-customer-name').value = sale.customer_name || '';
        document.getElementById('edit-sale-customer-phone').value = sale.customer_phone || '';
        document.getElementById('edit-sale-date').value = sale.sale_date ? sale.sale_date.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('edit-sale-discount').value = sale.discount || 0;
        document.getElementById('edit-sale-paid-amount').value = sale.paid_amount || 0;
        document.getElementById('edit-sale-notes').value = sale.notes || '';

        // Render items list
        renderEditSaleItems(products);

        // Calculate totals
        calculateEditSaleTotals();

        editSaleModal.classList.add('active');
    } catch (error) {
        logError('❌ Error loading sale for editing:', error);
        showSalesNotification('Error loading sale', 'error');
    }
};

function renderEditSaleItems(products) {
    const itemsList = document.getElementById('edit-sale-items-list');
    if (!itemsList) return;

    if (editSaleItems.length === 0) {
        itemsList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--color-text-muted);">No items yet. Add items below.</div>';
        return;
    }

    itemsList.innerHTML = editSaleItems.map((item, index) => `
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
                           onchange="updateEditSaleItemQty(${index}, this.value)"
                           class="edit-item-input">
                </div>
                <div class="edit-item-field">
                    <label>Price</label>
                    <input type="number" 
                           value="${item.sell_price || item.unit_price}" 
                           min="0" 
                           step="0.01"
                           onchange="updateEditSaleItemPrice(${index}, this.value)"
                           class="edit-item-input">
                </div>
                <div class="edit-item-total">
                    ${fmt((item.quantity || 0) * (item.sell_price || item.unit_price || 0))}
                </div>
                <button type="button" class="edit-item-remove-btn" onclick="removeEditSaleItem(${index})" title="Remove">🗑️</button>
            </div>
        </div>
    `).join('');

    // Render add item section
    const productOptions = products.map(p => 
        `<option value="${p.id}" data-price="${p.sell_price}" data-purchase-price="${p.purchase_price}" data-name="${p.name}">${p.name} (Stock: ${p.stock})</option>`
    ).join('');

    const addItemSection = document.getElementById('edit-sale-add-item-section');
    if (addItemSection) {
        addItemSection.innerHTML = `
            <div class="add-item-row">
                <select id="edit-sale-product-select" class="form-select">
                    <option value="">Select product...</option>
                    ${productOptions}
                </select>
                <input type="number" id="edit-sale-item-qty" placeholder="Qty" min="1" value="1" class="form-input" style="width:80px;">
                <input type="number" id="edit-sale-item-price" placeholder="Price" min="0" step="0.01" class="form-input" style="width:120px;">
                <button type="button" onclick="addEditSaleItem()" class="btn btn-secondary">+ Add</button>
            </div>
        `;

        // Auto-fill price when product selected
        document.getElementById('edit-sale-product-select').addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const price = selectedOption.getAttribute('data-price');
            if (price) {
                document.getElementById('edit-sale-item-price').value = price;
            }
        });
    }
}

window.updateEditSaleItemQty = function(index, qty) {
    editSaleItems[index].quantity = parseFloat(qty) || 0;
    calculateEditSaleTotals();
};

window.updateEditSaleItemPrice = function(index, price) {
    editSaleItems[index].sell_price = parseFloat(price) || 0;
    calculateEditSaleTotals();
};

window.removeEditSaleItem = async function(index) {
    try {
        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];

        editSaleItems.splice(index, 1);
        renderEditSaleItems(products);
        calculateEditSaleTotals();
    } catch (err) {
        logError('❌ Error removing sale item:', err);
        showSalesNotification('Error removing item: ' + err.message, 'error');
    }
};

window.addEditSaleItem = async function() {
    try {
        const productSelect = document.getElementById('edit-sale-product-select');
        const qtyInput = document.getElementById('edit-sale-item-qty');
        const priceInput = document.getElementById('edit-sale-item-price');

        if (!productSelect || !qtyInput || !priceInput) {
            showSalesNotification('Item form not ready, please try again', 'error');
            return;
        }

        const productId = productSelect.value;
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;

        if (!productId || qty <= 0 || price < 0) {
            showSalesNotification('Please select product and enter valid quantity and price', 'error');
            return;
        }

        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const productName = selectedOption.getAttribute('data-name');
        const purchasePrice = parseFloat(selectedOption.getAttribute('data-purchase-price')) || 0;

        editSaleItems.push({
            product_id: productId,
            product_name: productName,
            quantity: qty,
            sell_price: price,
            purchase_price: purchasePrice
        });

        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];

        renderEditSaleItems(products);
        calculateEditSaleTotals();
    } catch (err) {
        logError('❌ Error adding sale item:', err);
        showSalesNotification('Error adding item: ' + err.message, 'error');
    }
};

function calculateEditSaleTotals() {
    const subtotal = editSaleItems.reduce((sum, item) => {
        const price = item.sell_price || item.unit_price || 0;
        return sum + (item.quantity * price);
    }, 0);

    const discount = parseFloat(document.getElementById('edit-sale-discount').value) || 0;
    const total = Math.max(0, subtotal - discount); // Gross total
    const paidAmount = parseFloat(document.getElementById('edit-sale-paid-amount').value) || 0;
    // Note: remaining shown here is gross-based; actual remaining (after returns) is computed on save
    const remaining = Math.max(0, total - paidAmount);

    document.getElementById('edit-sale-subtotal').textContent = fmt(subtotal);
    document.getElementById('edit-sale-total').textContent = fmt(total);
    document.getElementById('edit-sale-remaining').textContent = fmt(remaining);
}

// Save edited sale
window.saveEditedSale = async function() {
    const saveBtn = document.getElementById('save-edit-sale-btn');
    if (!saveBtn) return;

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        if (editSaleItems.length === 0) {
            showSalesNotification('Please add at least one item', 'error');
            return;
        }

        // Calculate totals
        const subtotal = editSaleItems.reduce((sum, item) => {
            const price = item.sell_price || item.unit_price || 0;
            return sum + (item.quantity * price);
        }, 0);

        const discount = parseFloat(document.getElementById('edit-sale-discount').value) || 0;
        const total = Math.max(0, subtotal - discount); // Clamp to 0 — discount can't exceed subtotal
        const paidAmount = parseFloat(document.getElementById('edit-sale-paid-amount').value) || 0;

        let paymentStatus = 'unpaid';

        // FIX: Fetch existing returns for this sale and apply them so the edit doesn't wipe return effects
        const user = await window.StorageModule.getCurrentUser();
        const existingReturnsResult = await window.StorageModule.supabase
            .from('returns')
            .select('total_amount')
            .eq('original_transaction_id', editingSaleId)
            .eq('user_id', user.id);
        const totalExistingReturned = (existingReturnsResult.data || []).reduce((s, r) => s + (r.total_amount || 0), 0);

        // Gross total = subtotal - discount (saved in 'total' field always)
        // Net after returns = gross - returned
        const netAfterReturns = Math.max(0, total - totalExistingReturned);
        const remaining = Math.max(0, netAfterReturns - paidAmount);

        if (netAfterReturns > 0 && paidAmount >= netAfterReturns) paymentStatus = 'paid';
        else if (paidAmount > 0) paymentStatus = 'partial';
        else paymentStatus = 'unpaid';

        // Update sale record
        const saleData = {
            invoice_id: document.getElementById('edit-sale-invoice').value.trim(),
            customer_name: document.getElementById('edit-sale-customer-name').value.trim() || 'Walk-in Customer',
            customer_phone: document.getElementById('edit-sale-customer-phone').value.trim(),
            sale_date: document.getElementById('edit-sale-date').value,
            subtotal: subtotal,
            discount: discount,
            total: total,          // Always gross — returns are tracked separately in returns table
            paid_amount: paidAmount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            notes: document.getElementById('edit-sale-notes').value.trim()
        };

        const updateResult = await window.StorageModule.updateData('sales', editingSaleId, saleData);
        if (!updateResult.success) {
            showSalesNotification('Failed to update sale', 'error');
            return;
        }

        // ── STOCK UPDATE (return-aware) ──────────────────────────────────────────
        // Returns already moved stock independently. We must only undo/apply the NET
        // qty (transaction_qty - already_returned_qty) so returns aren't double-counted.
        let alreadyReturnedByProduct = {};
        try {
            const saleReturnsResult = await window.StorageModule.supabase
                .from('returns').select('id')
                .eq('original_transaction_id', editingSaleId).eq('user_id', user.id);
            if (saleReturnsResult.data && saleReturnsResult.data.length > 0) {
                const returnIds = saleReturnsResult.data.map(r => r.id);
                const retItemsResult = await window.StorageModule.supabase
                    .from('return_items').select('product_id, quantity').in('return_id', returnIds);
                (retItemsResult.data || []).forEach(ri => {
                    alreadyReturnedByProduct[ri.product_id] = (alreadyReturnedByProduct[ri.product_id] || 0) + ri.quantity;
                });
            }
        } catch (e) { logWarn('⚠️ Could not fetch return items for stock calc:', e); }

        // Phase 1: Restore original items' NET impact (skip qty already restored by returns)
        for (const origItem of editSaleOriginalItems) {
            if (!origItem.product_id) continue;
            const alreadyReturned = alreadyReturnedByProduct[origItem.product_id] || 0;
            const netQtyToRestore = origItem.quantity - alreadyReturned;
            if (netQtyToRestore <= 0) continue;
            const productResult = await window.StorageModule.getDataById('products', origItem.product_id);
            if (productResult.success && productResult.data) {
                await window.StorageModule.updateData('products', origItem.product_id, { stock: productResult.data.stock + netQtyToRestore });
            }
        }

        // Delete old sale items
        await window.StorageModule.deleteSaleItems(editingSaleId);

        // Add new sale items and reduce stock
        for (const item of editSaleItems) {
            const sellPrice = item.sell_price || item.unit_price || 0;
            const itemResult = await window.StorageModule.saveData('sale_items', {
                sale_id: editingSaleId,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                purchase_price: item.purchase_price || 0,
                sell_price: sellPrice,
                // unit_price intentionally omitted — not a column in sale_items schema
                total: item.quantity * sellPrice
            });

            if (!itemResult.success) {
                showSalesNotification('Error saving item: ' + item.product_name, 'error');
                logError('❌ Failed to save sale item:', itemResult.error);
                return; // Stop processing to avoid partial state
            }

            if (item.product_id) {
                const alreadyReturned = alreadyReturnedByProduct[item.product_id] || 0;
                const netQtyToReduce = item.quantity - alreadyReturned;
                if (netQtyToReduce <= 0) continue; // Returns cover this qty — no net reduction needed
                const productResult = await window.StorageModule.getDataById('products', item.product_id);
                if (productResult.success && productResult.data) {
                    await window.StorageModule.updateData('products', item.product_id, { stock: Math.max(0, productResult.data.stock - netQtyToReduce) });
                }
            }
        }

        showSalesNotification('✅ Sale updated successfully', 'success');

        document.getElementById('edit-sale-modal').classList.remove('active');
        await loadSales();

        // Reload other modules
        if (window.AppModule?.loadDashboardStats) await window.AppModule.loadDashboardStats();
        if (window.ProductsModule?.loadProducts) await window.ProductsModule.loadProducts();

    } catch (error) {
        logError('❌ Error saving edited sale:', error);
        showSalesNotification('Error updating sale', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
};

// ===== DELETE SALE =====
window.deleteSale = function(saleId, invoiceId) {
    deletingSaleId = saleId;
    const deleteSaleModal = document.getElementById('delete-sale-modal');
    const deleteSaleInvoiceId = document.getElementById('delete-sale-invoice-id');
    
    if (deleteSaleInvoiceId) {
        deleteSaleInvoiceId.textContent = invoiceId || 'N/A';
    }
    deleteSaleModal.classList.add('active');
};

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Filter controls
    const salesSearch = document.getElementById('sales-search');
    const salesStatusFilter = document.getElementById('sales-status-filter');
    const applySalesFilterBtn = document.getElementById('apply-sales-filter');
    const clearSalesFilterBtn = document.getElementById('clear-sales-filter');
    
    if (salesSearch) salesSearch.addEventListener('input', applyFilters);
    if (salesStatusFilter) salesStatusFilter.addEventListener('change', applyFilters);
    if (applySalesFilterBtn) applySalesFilterBtn.addEventListener('click', applyFilters);
    
    if (clearSalesFilterBtn) {
        clearSalesFilterBtn.addEventListener('click', async () => {
            const salesSearch = document.getElementById('sales-search');
            const salesStatusFilter = document.getElementById('sales-status-filter');
            const salesDateFrom = document.getElementById('sales-date-from');
            const salesDateTo = document.getElementById('sales-date-to');
            
            if (salesSearch) salesSearch.value = '';
            if (salesStatusFilter) salesStatusFilter.value = '';
            if (salesDateFrom) salesDateFrom.value = '';
            if (salesDateTo) salesDateTo.value = '';
            await applyFilters();
        });
    }

    // Modal controls
    const saleDetailModal = document.getElementById('sale-detail-modal');
    const closeSaleDetailModal = document.getElementById('close-sale-detail-modal');
    const closeSaleDetailBtn = document.getElementById('close-sale-detail-btn');
    const printSaleBtn = document.getElementById('print-sale-btn');
    
    const deleteSaleModal = document.getElementById('delete-sale-modal');
    const closeDeleteSaleModal = document.getElementById('close-delete-sale-modal');
    const cancelDeleteSaleBtn = document.getElementById('cancel-delete-sale-btn');
    const confirmDeleteSaleBtn = document.getElementById('confirm-delete-sale-btn');
    
    const editSaleModal = document.getElementById('edit-sale-modal');
    const closeEditSaleModal = document.getElementById('close-edit-sale-modal');
    const cancelEditSaleBtn = document.getElementById('cancel-edit-sale-btn');
    const saveEditSaleBtn = document.getElementById('save-edit-sale-btn');

    if (closeSaleDetailModal) closeSaleDetailModal.addEventListener('click', () => saleDetailModal.classList.remove('active'));
    if (closeSaleDetailBtn) closeSaleDetailBtn.addEventListener('click', () => saleDetailModal.classList.remove('active'));
    if (closeDeleteSaleModal) closeDeleteSaleModal.addEventListener('click', () => deleteSaleModal.classList.remove('active'));
    if (cancelDeleteSaleBtn) cancelDeleteSaleBtn.addEventListener('click', () => deleteSaleModal.classList.remove('active'));
    
    if (closeEditSaleModal) closeEditSaleModal.addEventListener('click', () => editSaleModal.classList.remove('active'));
    if (cancelEditSaleBtn) cancelEditSaleBtn.addEventListener('click', () => editSaleModal.classList.remove('active'));
    if (saveEditSaleBtn) saveEditSaleBtn.addEventListener('click', saveEditedSale);

    // Add listeners for discount and paid amount to recalculate totals
    const editSaleDiscount = document.getElementById('edit-sale-discount');
    const editSalePaidAmount = document.getElementById('edit-sale-paid-amount');
    if (editSaleDiscount) editSaleDiscount.addEventListener('input', calculateEditSaleTotals);
    if (editSalePaidAmount) editSalePaidAmount.addEventListener('input', calculateEditSaleTotals);

    if (saleDetailModal) {
        saleDetailModal.addEventListener('click', (e) => {
            if (e.target === saleDetailModal) saleDetailModal.classList.remove('active');
        });
    }

    if (deleteSaleModal) {
        deleteSaleModal.addEventListener('click', (e) => {
            if (e.target === deleteSaleModal) deleteSaleModal.classList.remove('active');
        });
    }
    
    if (editSaleModal) {
        editSaleModal.addEventListener('click', (e) => {
            if (e.target === editSaleModal) editSaleModal.classList.remove('active');
        });
    }

    // Print invoice — uses Invoice Template Module
    if (printSaleBtn) {
        printSaleBtn.addEventListener('click', () => {
            if (!_currentSale) {
                showSalesNotification('Cannot print — open a sale first', 'error');
                return;
            }
            const sale  = _currentSale;
            const items = _currentSaleItems;

            const d = new Date(sale.sale_date || sale.created_at);
            const dateStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

            window.InvoiceTemplate.print({
                type:        'sale',
                invoice_no:  sale.invoice_id || 'N/A',
                date:        dateStr,
                party_label: 'Customer',
                party_name:  sale.customer_name  || 'Walk-in Customer',
                party_phone: sale.customer_phone || '',
                items: items.map(it => ({
                    name:       it.product_name || 'Item',
                    qty:        it.quantity     || 1,
                    unit_price: it.sell_price   || it.unit_price || 0,
                    total:      it.total        || (it.quantity * (it.sell_price || it.unit_price || 0)),
                })),
                subtotal: sale.subtotal       || 0,
                discount: sale.discount       || 0,
                total:    sale.total          || 0,
                paid:     sale.paid_amount    || 0,
                balance:  sale.remaining_amount || 0,
                status:   sale.payment_status || 'unpaid',
                notes:    sale.notes          || '',
            });
        });
    }

    // Delete confirmation
    if (confirmDeleteSaleBtn) {
        confirmDeleteSaleBtn.addEventListener('click', async () => {
            if (!deletingSaleId) return;

            try {
                confirmDeleteSaleBtn.disabled = true;
                confirmDeleteSaleBtn.textContent = 'Deleting...';

                // Get sale items to restore stock
                const itemsResult = await window.StorageModule.getSaleItems(deletingSaleId);
                const items = itemsResult.data || [];

                window.log('📦 Restoring stock for sale items:', items.length);

                // Restore stock for each item
                for (const item of items) {
                    if (item.product_id) {
                        const productResult = await window.StorageModule.supabase
                            .from('products')
                            .select('stock')
                            .eq('id', item.product_id)
                            .single();

                        if (productResult.data) {
                            const newStock = (productResult.data.stock || 0) + (item.quantity || 0);
                            await window.StorageModule.supabase
                                .from('products')
                                .update({ stock: newStock })
                                .eq('id', item.product_id);
                        }
                    }
                }

                // FIX: Delete associated returns (and reverse THEIR stock effects) before deleting the sale
                const user = await window.StorageModule.getCurrentUser();
                const saleReturnsResult = await window.StorageModule.supabase
                    .from('returns')
                    .select('id')
                    .eq('original_transaction_id', deletingSaleId)
                    .eq('user_id', user.id);
                
                if (saleReturnsResult.data && saleReturnsResult.data.length > 0) {
                    for (const ret of saleReturnsResult.data) {
                        // Sale return had RESTORED stock; deleting it means REDUCING stock back
                        const retItemsResult = await window.StorageModule.supabase
                            .from('return_items').select('*').eq('return_id', ret.id);
                        for (const ri of (retItemsResult.data || [])) {
                            if (ri.product_id) {
                                const pr = await window.StorageModule.supabase.from('products').select('stock').eq('id', ri.product_id).single();
                                if (pr.data) {
                                    const newStk = Math.max(0, (pr.data.stock || 0) - (ri.quantity || 0));
                                    await window.StorageModule.supabase.from('products').update({ stock: newStk }).eq('id', ri.product_id);
                                }
                            }
                        }
                        // Delete return items
                        await window.StorageModule.supabase.from('return_items').delete().eq('return_id', ret.id);
                    }
                    // Delete all returns for this sale
                    await window.StorageModule.supabase.from('returns').delete()
                        .eq('original_transaction_id', deletingSaleId).eq('user_id', user.id);
                    window.log('✅ Deleted', saleReturnsResult.data.length, 'associated return(s)');
                }

                // Delete sale items
                await window.StorageModule.deleteSaleItems(deletingSaleId);

                // CRITICAL FIX: Delete associated payments to prevent cash flow calculation errors
                await window.StorageModule.deletePaymentsForSale(deletingSaleId);

                // Delete sale
                const deleteResult = await window.StorageModule.deleteData('sales', deletingSaleId);

                if (deleteResult.success) {
                    showSalesNotification('✅ Sale deleted and stock restored', 'success');
                    
                    deleteSaleModal.classList.remove('active');
                    deletingSaleId = null;

                    await loadSales();

                    if (window.AppModule && window.AppModule.loadDashboardStats) {
                        await window.AppModule.loadDashboardStats();
                    }
                    if (window.ProductsModule && window.ProductsModule.loadProducts) {
                        await window.ProductsModule.loadProducts();
                    }
                } else {
                    showSalesNotification('Failed to delete sale', 'error');
                }

            } catch (error) {
                logError('❌ Error deleting sale:', error);
                showSalesNotification('Error deleting sale', 'error');
            } finally {
                confirmDeleteSaleBtn.disabled = false;
                confirmDeleteSaleBtn.textContent = '🗑️ Delete Sale';
            }
        });
    }
});

// ===== NOTIFICATION =====
function showSalesNotification(msg, type) {
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
async function initSalesPage() {
    window.log('🚀 Initializing Sales Page...');
    
    // Clear all filter inputs on page load
    const salesSearch = document.getElementById('sales-search');
    const salesStatusFilter = document.getElementById('sales-status-filter');
    const salesDateFrom = document.getElementById('sales-date-from');
    const salesDateTo = document.getElementById('sales-date-to');
    
    if (salesSearch) {
        salesSearch.value = '';
        window.log('   Cleared search input');
    }
    if (salesStatusFilter) {
        salesStatusFilter.value = '';
        window.log('   Cleared status filter');
    }
    if (salesDateFrom) {
        salesDateFrom.value = '';
        window.log('   Cleared date from');
    }
    if (salesDateTo) {
        salesDateTo.value = '';
        window.log('   Cleared date to');
    }
    
    // Always reload data when page is opened
    await loadSales();
}

// Export module
window.SalesModule = { 
    initSalesPage, 
    loadSales,
    applyFilters,
    updateSummaryStats
};

window.log('✅ Sales Module Loaded (COMPLETE FIX)');

/* ==========================================
   JS END: Sales Listing Module
   ========================================== */
})(); // end IIFE