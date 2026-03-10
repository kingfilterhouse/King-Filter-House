(function() {
/* ==========================================
   MODULE SCOPE: Wrapped in IIFE to prevent global scope pollution.
   ========================================== */

/* ==========================================
   JS START: Quick Purchase Module
   ========================================== */

// ===== STATE =====
let purchaseItems = [];          // { product, qty, customPrice }
let purchaseProducts = [];       // all products cache
let purchaseSuppliers = [];      // all suppliers cache

// ===== DOM =====
const purchaseProductSearch   = document.getElementById('purchase-product-search');
const purchaseProductDropdown = document.getElementById('purchase-product-dropdown');
const purchaseItemsList       = document.getElementById('purchase-items-list');
const purchaseItemsCount      = document.getElementById('purchase-items-count');
const purchaseSupplierName    = document.getElementById('purchase-supplier-name');
const purchaseSupplierPhone   = document.getElementById('purchase-supplier-phone');
const purchaseSupplierSearch  = document.getElementById('purchase-supplier-search');
const purchaseSupplierDropdown = document.getElementById('purchase-supplier-dropdown');
const purchasePONumber        = document.getElementById('purchase-po-number');
const purchaseDate            = document.getElementById('purchase-date');
const purchaseSubtotal        = document.getElementById('purchase-subtotal');
const purchaseDiscount        = document.getElementById('purchase-discount');
const purchaseDiscountType    = document.getElementById('purchase-discount-type');
const purchaseGrandTotal      = document.getElementById('purchase-grand-total');
const purchaseExpRevenue      = document.getElementById('purchase-exp-revenue');
const purchaseExpProfit       = document.getElementById('purchase-exp-profit');
const purchaseExpGpPercent    = document.getElementById('purchase-exp-gp-percent');
const purchasePaidAmount      = document.getElementById('purchase-paid-amount');
const purchaseRoundOff        = document.getElementById('purchase-round-off');
const purchaseRemaining       = document.getElementById('purchase-remaining');
const purchasePaymentStatus   = document.getElementById('purchase-payment-status');
const purchaseNotes           = document.getElementById('purchase-notes');
const finalizePurchaseBtn     = document.getElementById('finalize-purchase-btn');
const clearPurchaseBtn        = document.getElementById('clear-purchase-btn');

// ===== HELPERS =====
function fmt(n) {
    return 'PKR ' + Math.round(n).toLocaleString();
}

function generatePOId() {
    const now = new Date();
    const y  = now.getFullYear().toString().slice(2);
    const m  = String(now.getMonth() + 1).padStart(2, '0');
    const d  = String(now.getDate()).padStart(2, '0');
    const rnd = Math.floor(Math.random() * 9000 + 1000);
    return `PO-${y}${m}${d}-${rnd}`;
}

function todayString() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
}

// ===== LOAD PRODUCTS =====
async function loadPurchaseProducts() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Not loading products - no user logged in');
        return;
    }
    const res = await window.StorageModule.getAllData('products');
    if (res.success) purchaseProducts = res.data;
}

// ===== LOAD SUPPLIERS =====
async function loadPurchaseSuppliers() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Not loading suppliers - no user logged in');
        return;
    }
    const res = await window.StorageModule.getAllData('suppliers');
    if (res.success) purchaseSuppliers = res.data;
}

// ===== SAVE NEW SUPPLIER =====
async function saveNewSupplier(name, phone) {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in, cannot save supplier');
            return null;
        }

        // Check if supplier already exists
        const existing = purchaseSuppliers.find(s => 
            s.name.toLowerCase() === name.toLowerCase() && s.phone === phone
        );
        if (existing) {
            console.log('ℹ️ Supplier already exists:', existing.id);
            return existing.id;
        }

        // Save new supplier
        const supplierData = {
            user_id: user.id,
            name: name,
            phone: phone,
            email: '',
            address: ''
        };

        console.log('🔄 Saving new supplier:', supplierData);
        const result = await window.StorageModule.saveData('suppliers', supplierData);
        
        if (result.success && result.data) {
            console.log('✅ New supplier saved:', result.data);
            // Add to cache
            purchaseSuppliers.push(result.data);
            return result.data.id;
        } else {
            console.error('❌ Failed to save supplier:', result.error);
            return null;
        }
    } catch (err) {
        console.error('❌ Save supplier error:', err);
        return null;
    }
}

// ===== PRODUCT SEARCH =====
purchaseProductSearch.addEventListener('input', () => {
    const q = purchaseProductSearch.value.trim().toLowerCase();
    if (q.length < 1) { purchaseProductDropdown.style.display = 'none'; return; }

    const matches = purchaseProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.size && p.size.toLowerCase().includes(q)) ||
        (p.thread && p.thread.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    ).slice(0, 12);

    if (matches.length === 0) {
        purchaseProductDropdown.innerHTML = '<div style="padding:1rem;color:var(--color-text-muted);text-align:center;">No products found</div>';
        purchaseProductDropdown.style.display = 'block';
        return;
    }

    purchaseProductDropdown.innerHTML = matches.map(p => {
        const imgHtml = p.image_url
            ? `<img src="${p.image_url}" class="purchase-product-option-img" onerror="this.style.display='none'">`
            : `<div class="purchase-product-option-img" style="background:var(--color-surface);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:1.2rem;">📦</div>`;
        
        // Build meta info parts
        const metaParts = [];
        if (p.size) metaParts.push(`Size: ${p.size}`);
        if (p.thread) metaParts.push(`Thread: ${p.thread}`);
        if (p.category) metaParts.push(`${p.category}`);
        metaParts.push(`Stock: ${p.stock}`);
        
        return `
            <div class="purchase-product-option" onclick="addPurchaseItem('${p.id}')">
                ${imgHtml}
                <div class="purchase-product-option-info">
                    <div class="purchase-product-option-name">${p.name}</div>
                    <div class="purchase-product-option-meta">${metaParts.join(' | ')}</div>
                </div>
                <div class="purchase-product-option-price">${fmt(p.purchase_price)}</div>
            </div>
        `;
    }).join('');

    purchaseProductDropdown.style.display = 'block';
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.purchase-product-search-wrapper')) {
        purchaseProductDropdown.style.display = 'none';
    }
});

// ===== SUPPLIER SEARCH =====
purchaseSupplierSearch.addEventListener('input', () => {
    const q = purchaseSupplierSearch.value.trim().toLowerCase();
    if (q.length < 1) { 
        purchaseSupplierDropdown.style.display = 'none';
        // Clear supplier fields if search is cleared
        purchaseSupplierName.value = '';
        purchaseSupplierPhone.value = '';
        return; 
    }

    const matches = purchaseSuppliers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q))
    ).slice(0, 8);

    if (matches.length === 0) {
        purchaseSupplierDropdown.innerHTML = '<div style="padding:0.8rem;color:var(--color-text-muted);text-align:center;font-size:0.9rem;">No suppliers found. Fill name & phone to add new.</div>';
        purchaseSupplierDropdown.style.display = 'block';
        return;
    }

    purchaseSupplierDropdown.innerHTML = matches.map(s => `
        <div class="purchase-supplier-option" onclick="selectSupplier('${s.id}')">
            <div class="purchase-supplier-option-info">
                <div class="purchase-supplier-option-name">${s.name}</div>
                <div class="purchase-supplier-option-phone">${s.phone || 'No phone'}</div>
            </div>
        </div>
    `).join('');

    purchaseSupplierDropdown.style.display = 'block';
});

// Close supplier dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.purchase-supplier-search-wrapper')) {
        purchaseSupplierDropdown.style.display = 'none';
    }
});

// Select supplier from dropdown
window.selectSupplier = function(supplierId) {
    const supplier = purchaseSuppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    
    purchaseSupplierSearch.value = supplier.name;
    purchaseSupplierName.value = supplier.name;
    purchaseSupplierPhone.value = supplier.phone || '';
    purchaseSupplierDropdown.style.display = 'none';
};

// ===== ADD / REMOVE / QTY =====
window.addPurchaseItem = function(productId) {
    purchaseProductDropdown.style.display = 'none';
    purchaseProductSearch.value = '';

    const product = purchaseProducts.find(p => p.id === productId);
    if (!product) return;

    const existing = purchaseItems.find(i => i.product.id === productId);
    if (existing) {
        existing.qty++;
    } else {
        purchaseItems.push({ 
            product, 
            qty: 1, 
            customPrice: product.purchase_price,
            customSellPrice: product.sell_price
        });
    }
    renderPurchaseItems();
    recalculatePurchase();
};

window.changePurchaseQty = function(productId, delta) {
    const item = purchaseItems.find(i => i.product.id === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        purchaseItems = purchaseItems.filter(i => i.product.id !== productId);
    }
    renderPurchaseItems();
    recalculatePurchase();
};

window.removePurchaseItem = function(productId) {
    purchaseItems = purchaseItems.filter(i => i.product.id !== productId);
    renderPurchaseItems();
    recalculatePurchase();
};

window.updatePurchasePrice = function(productId, newPrice) {
    const item = purchaseItems.find(i => i.product.id === productId);
    if (!item) return;
    
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
        item.customPrice = item.product.purchase_price; // Reset to original
    } else {
        item.customPrice = price;
    }
    recalculatePurchase();
};

window.updatePurchaseSellPrice = function(productId, newPrice) {
    const item = purchaseItems.find(i => i.product.id === productId);
    if (!item) return;
    
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
        item.customSellPrice = item.product.sell_price; // Reset to original
    } else {
        item.customSellPrice = price;
    }
    renderPurchaseItems();
};

// ===== RENDER ITEMS =====
function renderPurchaseItems() {
    purchaseItemsCount.textContent = purchaseItems.reduce((s, i) => s + i.qty, 0) + ' items';

    if (purchaseItems.length === 0) {
        purchaseItemsList.innerHTML = '<div class="purchase-empty-items"><p>No items added yet. Search and add products above.</p></div>';
        return;
    }

    purchaseItemsList.innerHTML = purchaseItems.map(item => {
        const price = item.customPrice || item.product.purchase_price;
        const sellPrice = item.customSellPrice || item.product.sell_price;
        return `
        <div class="purchase-item">
            <span class="purchase-item-name" title="${item.product.name}">${item.product.name}</span>
            <div class="purchase-item-price-edit">
                <label style="font-size:0.75rem;color:var(--color-text-muted);">Cost</label>
                <input 
                    type="number" 
                    class="purchase-item-price-input" 
                    value="${price}" 
                    onchange="updatePurchasePrice('${item.product.id}', this.value)"
                    min="0"
                    step="0.01"
                />
            </div>
            <div class="purchase-item-price-edit">
                <label style="font-size:0.75rem;color:var(--color-text-muted);">Sell</label>
                <input 
                    type="number" 
                    class="purchase-item-price-input" 
                    value="${sellPrice}" 
                    onchange="updatePurchaseSellPrice('${item.product.id}', this.value)"
                    min="0"
                    step="0.01"
                />
            </div>
            <div class="purchase-item-qty-controls">
                <button class="purchase-qty-btn" onclick="changePurchaseQty('${item.product.id}', -1)">−</button>
                <span class="purchase-item-qty">${item.qty}</span>
                <button class="purchase-qty-btn" onclick="changePurchaseQty('${item.product.id}', 1)">+</button>
            </div>
            <span class="purchase-item-total">${fmt(price * item.qty)}</span>
            <button class="purchase-item-remove" onclick="removePurchaseItem('${item.product.id}')">✕</button>
        </div>
    `}).join('');
}

// ===== RECALCULATE TOTALS =====
function recalculatePurchase() {
    let subtotal = 0, expectedRevenue = 0;
    purchaseItems.forEach(i => {
        const purchasePrice = i.customPrice || i.product.purchase_price;
        subtotal += purchasePrice * i.qty;
        expectedRevenue += i.product.sell_price * i.qty;
    });

    // Discount
    let discountVal = parseFloat(purchaseDiscount.value) || 0;
    let discountAmt = purchaseDiscountType.value === 'percentage'
        ? (subtotal * discountVal / 100)
        : discountVal;

    const grandTotal = Math.max(0, subtotal - discountAmt);
    const expectedProfit = expectedRevenue - grandTotal;
    const expectedGpPercent = expectedRevenue > 0 ? ((expectedProfit / expectedRevenue) * 100) : 0;

    // Payment
    let paid = parseFloat(purchasePaidAmount.value) || 0;
    let remaining = Math.max(0, grandTotal - paid);
    
    // Round-off: if checkbox is checked, treat paid amount as full payment
    if (purchaseRoundOff && purchaseRoundOff.checked && paid > 0) {
        remaining = 0; // Waive the remaining amount
    }

    // DOM updates
    purchaseSubtotal.textContent = fmt(subtotal);
    purchaseGrandTotal.textContent = fmt(grandTotal);
    purchaseExpRevenue.textContent = fmt(expectedRevenue);
    purchaseExpProfit.textContent = fmt(expectedProfit);
    purchaseExpGpPercent.textContent = expectedGpPercent.toFixed(1) + '%';
    purchaseRemaining.textContent = fmt(remaining);

    // Payment badge
    let status = 'unpaid';
    // If round-off is checked and paid > 0, treat as paid
    if (purchaseRoundOff && purchaseRoundOff.checked && paid > 0 && remaining === 0) {
        status = 'paid';
    } else if (paid >= grandTotal && grandTotal > 0) {
        status = 'paid';
    } else if (paid > 0) {
        status = 'partial';
    }
    purchasePaymentStatus.innerHTML = `<span class="payment-badge ${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span>`;

    // Enable finalize only when items exist
    finalizePurchaseBtn.disabled = purchaseItems.length === 0;
}

// Listen for discount / payment changes
purchaseDiscount.addEventListener('input', recalculatePurchase);
purchaseDiscountType.addEventListener('change', recalculatePurchase);
purchasePaidAmount.addEventListener('input', recalculatePurchase);
if (purchaseRoundOff) purchaseRoundOff.addEventListener('change', recalculatePurchase);

// ===== CLEAR PURCHASE =====
function clearPurchase() {
    purchaseItems = [];
    purchaseProductSearch.value = '';
    purchaseSupplierSearch.value = '';
    purchaseSupplierName.value  = '';
    purchaseSupplierPhone.value = '';
    purchaseDiscount.value      = '';
    purchasePaidAmount.value    = '';
    if (purchaseRoundOff) purchaseRoundOff.checked = false;
    purchaseNotes.value         = '';
    purchasePONumber.textContent = generatePOId();
    renderPurchaseItems();
    recalculatePurchase();
}

clearPurchaseBtn.addEventListener('click', clearPurchase);

// ===== FINALIZE PURCHASE =====
finalizePurchaseBtn.addEventListener('click', async () => {
    if (purchaseItems.length === 0) return;

    finalizePurchaseBtn.disabled = true;
    finalizePurchaseBtn.textContent = '⏳ Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        // Save supplier if name is provided (for autocomplete purposes)
const supplierName = purchaseSupplierName.value.trim() || 'General Supplier';
const supplierPhone = purchaseSupplierPhone.value.trim();

// Only save supplier if both name AND phone are provided
if (supplierName && supplierName !== 'General Supplier' && supplierPhone) {
    await saveNewSupplier(supplierName, supplierPhone);
}

        // Build totals
        let subtotal = 0;
        purchaseItems.forEach(i => {
            const price = i.customPrice || i.product.purchase_price;
            subtotal += price * i.qty;
        });
        let discountVal = parseFloat(purchaseDiscount.value) || 0;
        let discountAmt = purchaseDiscountType.value === 'percentage'
            ? (subtotal * discountVal / 100) : discountVal;
        const grandTotal = Math.max(0, subtotal - discountAmt);
        let paid = parseFloat(purchasePaidAmount.value) || 0;
        let remaining = Math.max(0, grandTotal - paid);

        // Round-off: waive the remaining difference — total stays as the real invoice amount
        let actualCost = grandTotal; // Keep for backwards compat reference — but we always save grandTotal
        if (purchaseRoundOff && purchaseRoundOff.checked && paid > 0) {
            remaining = 0;
            actualCost = grandTotal; // Do NOT use paid — total must reflect the real invoice
        }

        let payStatus = 'unpaid';
        // If round-off is checked and paid > 0, treat as paid
        if (purchaseRoundOff && purchaseRoundOff.checked && paid > 0 && remaining === 0) {
            payStatus = 'paid';
        } else if (remaining === 0 && grandTotal > 0 && paid > 0) {
            payStatus = 'paid';
        } else if (paid > 0) {
            payStatus = 'partial';
        }

        // 1. Save purchase record
// 1. Save purchase record
const purchaseData = {
    user_id: user.id,
    purchase_id: purchasePONumber.textContent,
    supplier_name: supplierName,
    supplier_phone: supplierPhone,
    purchase_date: new Date().toISOString(),
    subtotal: subtotal,
    discount: discountAmt,
    total: grandTotal, // Always the real invoice total — round-off is reflected in remaining=0, not in total
    paid_amount: paid,
    remaining_amount: remaining,
    payment_status: payStatus,
    notes: purchaseNotes.value.trim()
};
// No supplier_id - we're using supplier_name directly

        const purchaseResult = await window.StorageModule.saveData('purchases', purchaseData);
        if (!purchaseResult.success) throw new Error('Failed to save purchase: ' + purchaseResult.error);

        const purchaseId = purchaseResult.data.id;

        // 2. Save each purchase item & update product stock and prices
        for (const item of purchaseItems) {
            const price = item.customPrice || item.product.purchase_price;
            const sellPrice = item.customSellPrice || item.product.sell_price;
            
            const itemData = {
                purchase_id: purchaseId,
                product_id: item.product.id,
                product_name: item.product.name,
                quantity: item.qty,
                purchase_price: price,
                sell_price: sellPrice,
                total: price * item.qty
            };
            
            console.log('💾 Saving purchase item:', itemData);
            const itemResult = await window.StorageModule.saveData('purchase_items', itemData);
            
            if (!itemResult.success) {
                console.error('❌ Failed to save purchase item:', itemResult.error);
                throw new Error('Failed to save purchase item: ' + itemResult.error);
            }
            
            console.log('✅ Purchase item saved successfully:', itemResult.data);

            // Update product: stock, purchase_price (if changed), and sell_price (if changed)
            const newStock = item.product.stock + item.qty;
            const updateData = { stock: newStock };
            
            // Update purchase price if it was customized
            if (item.customPrice && item.customPrice !== item.product.purchase_price) {
                updateData.purchase_price = item.customPrice;
            }
            
            // Update sell price if it was customized
            if (item.customSellPrice && item.customSellPrice !== item.product.sell_price) {
                updateData.sell_price = item.customSellPrice;
            }
            
            await window.StorageModule.updateData('products', item.product.id, updateData);
        }

        // 3. Success
        showPurchaseNotification('✅ Purchase finalized! PO ' + purchaseId, 'success');
        clearPurchase();

        // Reload products cache so stock is fresh
        await loadPurchaseProducts();
        
        // Reload dashboard stats
        if (window.AppModule && window.AppModule.loadDashboardStats) {
            await window.AppModule.loadDashboardStats();
        }
        
        // Reload products module if visible
        if (window.ProductsModule && window.ProductsModule.loadProducts) {
            await window.ProductsModule.loadProducts();
        }

        // Reload purchases list and reports
        if (window.PurchasesModule && window.PurchasesModule.loadPurchases) {
            await window.PurchasesModule.loadPurchases();
        }
        if (window.ReportsModule && window.ReportsModule.loadReports) {
            await window.ReportsModule.loadReports();
        }

    } catch (err) {
        console.error('❌ Finalize error:', err);
        showPurchaseNotification('Failed: ' + err.message, 'error');
    } finally {
        finalizePurchaseBtn.disabled = purchaseItems.length === 0;
        finalizePurchaseBtn.textContent = '✅ Finalize Purchase';
    }
});

// ===== NOTIFICATION =====
function showPurchaseNotification(msg, type) {
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
async function initQuickPurchase() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Quick Purchase not initialized - no user logged in');
        return;
    }
    
    purchasePONumber.textContent = generatePOId();
    purchaseDate.textContent = todayString();
    await loadPurchaseProducts();
    await loadPurchaseSuppliers();
    recalculatePurchase();
    console.log('✅ Quick Purchase Module Initialized');
}

// Listen for page navigation to this page
document.addEventListener('click', (e) => {
    if (e.target.closest('[data-page="quick-purchase"]')) {
        setTimeout(() => initQuickPurchase(), 150);
    }
});

window.QuickPurchaseModule = { initQuickPurchase, loadPurchaseProducts };
console.log('✅ Quick Purchase Module Loaded');

/* ==========================================
   JS END: Quick Purchase Module
   ========================================== */
})(); // end IIFE