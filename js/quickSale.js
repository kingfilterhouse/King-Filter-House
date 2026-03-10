(function() {
/* ==========================================
   MODULE SCOPE: Wrapped in IIFE to prevent global scope pollution.
   ========================================== */

/* ==========================================
   JS START: Quick Sale Module
   ========================================== */

// ===== STATE =====
let saleItems = [];          // { product, qty }
let saleProducts = [];       // all products cache
let saleCustomers = [];      // all customers cache
let saleSuppliers = [];      // suppliers cache (for supplier-as-customer)
let salePartyType = 'customer'; // 'customer' or 'supplier'
let saleSelectedSupplierId = null;

// ===== DOM =====
const saleProductSearch   = document.getElementById('sale-product-search');
const saleProductDropdown = document.getElementById('sale-product-dropdown');
const saleItemsList       = document.getElementById('sale-items-list');
const saleItemsCount      = document.getElementById('sale-items-count');
const saleCustomerName    = document.getElementById('sale-customer-name');
const saleCustomerPhone   = document.getElementById('sale-customer-phone');
const saleCustomerSearch  = document.getElementById('sale-customer-search');
const saleCustomerDropdown = document.getElementById('sale-customer-dropdown');
const saleInvoiceNumber   = document.getElementById('sale-invoice-number');
const saleInvoiceDate     = document.getElementById('sale-invoice-date');
const saleSubtotal        = document.getElementById('sale-subtotal');
const saleDiscount        = document.getElementById('sale-discount');
const saleDiscountType    = document.getElementById('sale-discount-type');
const saleGrandTotal      = document.getElementById('sale-grand-total');
const saleEstCost         = document.getElementById('sale-est-cost');
const saleEstProfit       = document.getElementById('sale-est-profit');
const saleGpPercent       = document.getElementById('sale-gp-percent');
const salePaidAmount      = document.getElementById('sale-paid-amount');
const saleRoundOff        = document.getElementById('sale-round-off');
const saleRemaining       = document.getElementById('sale-remaining');
const salePaymentStatus   = document.getElementById('sale-payment-status');
const saleNotes           = document.getElementById('sale-notes');
const finalizeSaleBtn     = document.getElementById('finalize-sale-btn');
const clearSaleBtn        = document.getElementById('clear-sale-btn');

// ===== HELPERS =====
function fmt(n) {
    return 'PKR ' + Math.round(n).toLocaleString();
}

function generateInvoiceId() {
    const now = new Date();
    const y  = now.getFullYear().toString().slice(2);
    const m  = String(now.getMonth() + 1).padStart(2, '0');
    const d  = String(now.getDate()).padStart(2, '0');
    const rnd = Math.floor(Math.random() * 9000 + 1000);
    return `INV-${y}${m}${d}-${rnd}`;
}

function todayString() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
}

// ===== LOAD PRODUCTS =====
async function loadSaleProducts() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Not loading products - no user logged in');
        return;
    }
    const res = await window.StorageModule.getAllData('products');
    if (res.success) saleProducts = res.data;
}
// ===== LOAD CUSTOMERS =====
async function loadSaleCustomers() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Not loading customers - no user logged in');
        return;
    }
    const res = await window.StorageModule.getAllData('customers');
    if (res.success) saleCustomers = res.data;
}

// ===== LOAD SUPPLIERS (supplier-as-customer) =====
async function loadSaleSuppliers() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) return;
    const res = await window.StorageModule.getAllData('suppliers');
    if (res.success) saleSuppliers = res.data;
}

// ===== SAVE NEW CUSTOMER =====
async function saveNewCustomer(name, phone) {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) {
            console.log('⚠️ No user logged in, cannot save customer');
            return null;
        }

        // Check if customer already exists
        const existing = saleCustomers.find(c => 
            c.name.toLowerCase() === name.toLowerCase() && c.phone === phone
        );
        if (existing) {
            console.log('ℹ️ Customer already exists:', existing.id);
            return existing.id;
        }

        // Save new customer
        const customerData = {
            user_id: user.id,
            name: name,
            phone: phone,
            email: '',
            address: ''
        };

        console.log('🔄 Saving new customer:', customerData);
        const result = await window.StorageModule.saveData('customers', customerData);
        
        if (result.success && result.data) {
            console.log('✅ New customer saved:', result.data);
            // Add to cache
            saleCustomers.push(result.data);
            return result.data.id;
        } else {
            console.error('❌ Failed to save customer:', result.error);
            return null;
        }
    } catch (err) {
        console.error('❌ Save customer error:', err);
        return null;
    }
}

// ===== SEARCH =====
saleProductSearch.addEventListener('input', () => {
    const q = saleProductSearch.value.trim().toLowerCase();
    if (q.length < 1) { saleProductDropdown.style.display = 'none'; return; }

    // Helper function to search in pipe-separated values
    const searchInPipeSeparated = (field) => {
        if (!field) return false;
        const values = field.split('|').map(v => v.trim().toLowerCase());
        return values.some(v => v.includes(q));
    };

    const matches = saleProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.size && p.size.toLowerCase().includes(q)) ||
        (p.thread && p.thread.toLowerCase().includes(q)) ||
        (p.cabin && p.cabin.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        searchInPipeSeparated(p.machine) ||
        searchInPipeSeparated(p.cross_reference)
    ).slice(0, 12);

    if (matches.length === 0) {
        saleProductDropdown.innerHTML = '<div style="padding:1rem;color:var(--color-text-muted);text-align:center;">No products found</div>';
        saleProductDropdown.style.display = 'block';
        return;
    }

    saleProductDropdown.innerHTML = matches.map(p => {
    const oos = p.stock <= 0 ? ' out-of-stock' : '';
    const imgHtml = p.image_url
        ? `<img src="${p.image_url}" class="sale-product-option-img" onerror="this.style.display='none'">`
        : `<div class="sale-product-option-img" style="background:var(--color-surface);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:1.2rem;">📦</div>`;
    
    // Build meta info parts
    const metaParts = [];
    if (p.size) metaParts.push(`Size: ${p.size}`);
    if (p.thread) metaParts.push(`Thread: ${p.thread}`);
    if (p.category) metaParts.push(`${p.category}`);
    metaParts.push(`Stock: ${p.stock}`);
    
    return `
        <div class="sale-product-option${oos}" onclick="${p.stock > 0 ? `addSaleItem('${p.id}')` : ''}">
            ${imgHtml}
            <div class="sale-product-option-info">
                <div class="sale-product-option-name">${p.name}</div>
                <div class="sale-product-option-meta">${metaParts.join(' | ')}</div>
            </div>
            <div class="sale-product-option-price">${fmt(p.sell_price)}</div>
        </div>
    `;
}).join('');

    saleProductDropdown.style.display = 'block';
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sale-product-search-wrapper')) {
        saleProductDropdown.style.display = 'none';
    }
});

// ===== CUSTOMER / SUPPLIER SEARCH =====
saleCustomerSearch.addEventListener('input', () => {
    const q = saleCustomerSearch.value.trim().toLowerCase();
    if (q.length < 1) {
        saleCustomerDropdown.style.display = 'none';
        saleCustomerName.value  = '';
        saleCustomerPhone.value = '';
        return;
    }

    if (salePartyType === 'supplier') {
        const matches = saleSuppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.phone && s.phone.includes(q))
        ).slice(0, 8);

        if (matches.length === 0) {
            saleCustomerDropdown.innerHTML = '<div style="padding:0.8rem;color:var(--color-text-muted);text-align:center;font-size:0.9rem;">No suppliers found. Fill name & phone below.</div>';
            saleCustomerDropdown.style.display = 'block';
            return;
        }

        saleCustomerDropdown.innerHTML = matches.map(s => `
            <div class="sale-customer-option" onclick="selectSaleSupplier('${s.id}')">
                <div class="sale-customer-option-info">
                    <div class="sale-customer-option-name">🚚 ${s.name}</div>
                    <div class="sale-customer-option-phone">${s.phone || 'No phone'}</div>
                </div>
            </div>
        `).join('');

        saleCustomerDropdown.style.display = 'block';
    } else {
        const matches = saleCustomers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.includes(q))
        ).slice(0, 8);

        if (matches.length === 0) {
            saleCustomerDropdown.innerHTML = '<div style="padding:0.8rem;color:var(--color-text-muted);text-align:center;font-size:0.9rem;">No customers found. Fill name & phone to add new.</div>';
            saleCustomerDropdown.style.display = 'block';
            return;
        }

        saleCustomerDropdown.innerHTML = matches.map(c => `
            <div class="sale-customer-option" onclick="selectCustomer('${c.id}')">
                <div class="sale-customer-option-info">
                    <div class="sale-customer-option-name">${c.name}</div>
                    <div class="sale-customer-option-phone">${c.phone || 'No phone'}</div>
                </div>
            </div>
        `).join('');

        saleCustomerDropdown.style.display = 'block';
    }
});

// Close customer dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sale-customer-search-wrapper')) {
        saleCustomerDropdown.style.display = 'none';
    }
});

// ===== SET PARTY TYPE =====
window.setSalePartyType = function(type) {
    salePartyType = type;
    saleSelectedSupplierId = null;

    const btnCustomer = document.getElementById('party-toggle-customer');
    const btnSupplier = document.getElementById('party-toggle-supplier');
    const cardTitle   = document.getElementById('sale-party-card-title');
    const searchLabel = document.getElementById('sale-party-search-label');
    const nameLabel   = document.getElementById('sale-party-name-label');

    if (type === 'supplier') {
        btnCustomer.classList.remove('active');
        btnSupplier.classList.add('active');
        if (cardTitle)   cardTitle.textContent  = '🚚 Supplier Details (Sale To)';
        if (searchLabel) searchLabel.textContent = 'Search Existing Supplier';
        if (nameLabel)   nameLabel.textContent   = 'Supplier Name';
    } else {
        btnSupplier.classList.remove('active');
        btnCustomer.classList.add('active');
        if (cardTitle)   cardTitle.textContent  = '👤 Customer Details';
        if (searchLabel) searchLabel.textContent = 'Search Existing Customer';
        if (nameLabel)   nameLabel.textContent   = 'Customer Name';
    }

    saleCustomerSearch.value = '';
    saleCustomerName.value   = '';
    saleCustomerPhone.value  = '';
    saleCustomerDropdown.style.display = 'none';
};

// Select customer from dropdown
window.selectCustomer = function(customerId) {
    const customer = saleCustomers.find(c => c.id === customerId);
    if (!customer) return;
    
    saleCustomerSearch.value = customer.name;
    saleCustomerName.value = customer.name;
    saleCustomerPhone.value = customer.phone || '';
    saleCustomerDropdown.style.display = 'none';
};

// Select supplier as buyer
window.selectSaleSupplier = function(supplierId) {
    const supplier = saleSuppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    saleSelectedSupplierId   = supplierId;
    saleCustomerSearch.value = supplier.name;
    saleCustomerName.value   = supplier.name;
    saleCustomerPhone.value  = supplier.phone || '';
    saleCustomerDropdown.style.display = 'none';
};

// ===== ADD / REMOVE / QTY =====
window.addSaleItem = function(productId) {
    saleProductDropdown.style.display = 'none';
    saleProductSearch.value = '';

    const product = saleProducts.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    const existing = saleItems.find(i => i.product.id === productId);
    if (existing) {
        if (existing.qty < product.stock) existing.qty++;
    } else {
        saleItems.push({ 
            product, 
            qty: 1, 
            customPrice: product.sell_price,
            machineInput: '',
            crossRefInput: '',
            showDetails: false
        });
    }
    renderSaleItems();
    recalculate();
};

window.changeSaleQty = function(productId, delta) {
    const item = saleItems.find(i => i.product.id === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        saleItems = saleItems.filter(i => i.product.id !== productId);
    } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
    }
    renderSaleItems();
    recalculate();
};

window.removeSaleItem = function(productId) {
    saleItems = saleItems.filter(i => i.product.id !== productId);
    renderSaleItems();
    recalculate();
};

window.updateSalePrice = function(productId, newPrice) {
    const item = saleItems.find(i => i.product.id === productId);
    if (!item) return;
    
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
        item.customPrice = item.product.sell_price; // Reset to original
    } else {
        item.customPrice = price;
    }
    recalculate();
};

// ===== TOGGLE PRODUCT DETAILS =====
window.toggleProductDetails = function(productId) {
    const item = saleItems.find(i => i.product.id === productId);
    if (!item) return;
    
    item.showDetails = !item.showDetails;
    renderSaleItems();
};

// ===== UPDATE MACHINE INPUT =====
window.updateMachineInput = function(productId, value) {
    const item = saleItems.find(i => i.product.id === productId);
    if (!item) return;
    
    item.machineInput = value.trim();
};

// ===== UPDATE CROSS-REF INPUT =====
window.updateCrossRefInput = function(productId, value) {
    const item = saleItems.find(i => i.product.id === productId);
    if (!item) return;
    
    item.crossRefInput = value.trim();
};

// ===== RENDER ITEMS =====
function renderSaleItems() {
    saleItemsCount.textContent = saleItems.reduce((s, i) => s + i.qty, 0) + ' items';

    if (saleItems.length === 0) {
        saleItemsList.innerHTML = '<div class="sale-empty-items"><p>No items added yet. Search and add products above.</p></div>';
        return;
    }

    saleItemsList.innerHTML = saleItems.map(item => {
        const price = item.customPrice || item.product.sell_price;
        const detailsIcon = item.showDetails ? '▼' : '▶';
        
        return `
        <div class="sale-item-wrapper">
            <div class="sale-item">
                <span class="sale-item-name" title="${item.product.name}">${item.product.name}</span>
                <div class="sale-item-price-edit">
                    <input 
                        type="number" 
                        class="sale-item-price-input" 
                        value="${price}" 
                        onchange="updateSalePrice('${item.product.id}', this.value)"
                        min="0"
                        step="0.01"
                    />
                    <span class="sale-item-total">${fmt(price * item.qty)}</span>
                </div>
                <div class="sale-item-qty-controls">
                    <button class="sale-qty-btn" onclick="changeSaleQty('${item.product.id}', -1)">−</button>
                    <span class="sale-item-qty">${item.qty}</span>
                    <button class="sale-qty-btn" onclick="changeSaleQty('${item.product.id}', 1)">+</button>
                </div>
                <button 
                    class="sale-item-details-toggle" 
                    onclick="toggleProductDetails('${item.product.id}')"
                    title="Add machine name / cross reference"
                >
                    ${detailsIcon}
                </button>
                <button class="sale-item-remove" onclick="removeSaleItem('${item.product.id}')">✕</button>
            </div>
            
            ${item.showDetails ? `
                <div class="sale-item-details">
                    <div class="sale-item-detail-row">
                        <label class="sale-detail-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                            </svg>
                            Machine Name
                        </label>
                        <input 
                            type="text" 
                            class="sale-detail-input" 
                            placeholder="e.g., Toyota Corolla"
                            value="${item.machineInput || ''}"
                            oninput="updateMachineInput('${item.product.id}', this.value)"
                        />
                    </div>
                    <div class="sale-item-detail-row">
                        <label class="sale-detail-label">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                <line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                            Cross Reference
                        </label>
                        <input 
                            type="text" 
                            class="sale-detail-input" 
                            placeholder="e.g., CF-1234"
                            value="${item.crossRefInput || ''}"
                            oninput="updateCrossRefInput('${item.product.id}', this.value)"
                        />
                    </div>
                    <div class="sale-detail-note">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/>
                            <line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        Optional: Will be saved to product record if not already present
                    </div>
                </div>
            ` : ''}
        </div>
    `}).join('');
}

// ===== RECALCULATE TOTALS =====
function recalculate() {
    let subtotal = 0, costTotal = 0;
    saleItems.forEach(i => {
        const price = i.customPrice || i.product.sell_price;
        subtotal   += price * i.qty;
        costTotal  += i.product.purchase_price * i.qty;
    });

    // Discount
    let discountVal = parseFloat(saleDiscount.value) || 0;
    let discountAmt = saleDiscountType.value === 'percentage'
        ? (subtotal * discountVal / 100)
        : discountVal;

    const grandTotal = Math.max(0, subtotal - discountAmt);
    const profit     = grandTotal - costTotal;
    const gpPercent  = grandTotal > 0 ? ((profit / grandTotal) * 100) : 0;

   // Payment
    let paid = parseFloat(salePaidAmount.value) || 0;
    let remaining = Math.max(0, grandTotal - paid);
    
    // Round-off: if checkbox is checked, treat paid amount as full payment
    if (saleRoundOff && saleRoundOff.checked && paid > 0) {
        remaining = 0; // Waive the remaining amount
    }

    // DOM updates
    saleSubtotal.textContent  = fmt(subtotal);
    saleGrandTotal.textContent = fmt(grandTotal);
    saleEstCost.textContent    = fmt(costTotal);
    saleEstProfit.textContent  = fmt(profit);
    saleGpPercent.textContent  = gpPercent.toFixed(1) + '%';
    saleRemaining.textContent  = fmt(remaining);

    // Payment badge
let status = 'unpaid';
// If round-off is checked and paid > 0, treat as paid
if (saleRoundOff && saleRoundOff.checked && paid > 0 && remaining === 0) {
    status = 'paid';
} else if (paid >= grandTotal && grandTotal > 0) {
    status = 'paid';
} else if (paid > 0) {
    status = 'partial';
}
salePaymentStatus.innerHTML = `<span class="payment-badge ${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span>`;
    // Enable finalize only when items exist
    finalizeSaleBtn.disabled = saleItems.length === 0;
}

// Listen for discount / payment changes
saleDiscount.addEventListener('input', recalculate);
saleDiscountType.addEventListener('change', recalculate);
salePaidAmount.addEventListener('input', recalculate);
if (saleRoundOff) saleRoundOff.addEventListener('change', recalculate);

// ===== CLEAR SALE =====
function clearSale() {
    saleItems = [];
    salePartyType = 'customer';
    saleSelectedSupplierId = null;
    saleProductSearch.value  = '';
    saleCustomerSearch.value = '';
    saleCustomerName.value   = '';
    saleCustomerPhone.value  = '';
    saleDiscount.value       = '';
    salePaidAmount.value     = '';
    saleNotes.value          = '';
    saleInvoiceNumber.textContent = generateInvoiceId();
    // Reset toggle UI
    const btnC = document.getElementById('party-toggle-customer');
    const btnS = document.getElementById('party-toggle-supplier');
    const cardTitle   = document.getElementById('sale-party-card-title');
    const searchLabel = document.getElementById('sale-party-search-label');
    const nameLabel   = document.getElementById('sale-party-name-label');
    if (btnC) btnC.classList.add('active');
    if (btnS) btnS.classList.remove('active');
    if (cardTitle)   cardTitle.textContent  = '👤 Customer Details';
    if (searchLabel) searchLabel.textContent = 'Search Existing Customer';
    if (nameLabel)   nameLabel.textContent   = 'Customer Name';
    renderSaleItems();
    recalculate();
}

clearSaleBtn.addEventListener('click', clearSale);

// ===== UTILITY: CHECK IF VALUE EXISTS IN PIPE-SEPARATED STRING =====
function valueExistsInList(list, value) {
    if (!list || !value) return false;
    const items = list.split('|').map(v => v.trim().toLowerCase());
    return items.includes(value.trim().toLowerCase());
}

// ===== UTILITY: CHECK FOR SIMILAR MACHINE NAMES =====
function findSimilarMachineNames(currentList, newMachine) {
    if (!currentList || !newMachine) return [];
    
    const items = currentList.split('|').map(v => v.trim());
    const newMachineLower = newMachine.trim().toLowerCase();
    
    return items.filter(item => {
        const itemLower = item.toLowerCase();
        // Check for exact match or very similar (contains substring)
        return itemLower.includes(newMachineLower) || newMachineLower.includes(itemLower);
    });
}

// ===== UTILITY: ADD VALUE TO PIPE-SEPARATED LIST =====
function addValueToList(currentList, newValue) {
    if (!newValue || newValue.trim() === '') return currentList;
    
    const trimmedValue = newValue.trim();
    
    // If list is empty, return the new value
    if (!currentList || currentList.trim() === '') return trimmedValue;
    
    // Check if value already exists (case-insensitive)
    if (valueExistsInList(currentList, trimmedValue)) {
        return currentList; // Don't add duplicate
    }
    
    // Add with pipe separator
    return currentList + ' | ' + trimmedValue;
}

// ===== UTILITY: UPDATE PRODUCT MACHINE AND CROSS-REF =====
async function updateProductMachineAndCrossRef(productId, machineInput, crossRefInput) {
    try {
        // Get current product
        const productResult = await window.StorageModule.getDataById('products', productId);
        if (!productResult.success || !productResult.data) {
            console.warn('Could not fetch product:', productId);
            return { success: false, skipped: true };
        }
        
        const product = productResult.data;
        let updateNeeded = false;
        let updates = {};
        
        // Handle machine name
        if (machineInput && machineInput.trim() !== '') {
            const currentMachine = product.machine || '';
            
            // Check if already exists
            if (valueExistsInList(currentMachine, machineInput)) {
                console.log('Machine name already exists, skipping:', machineInput);
            } else {
                // Check for similar names
                const similarNames = findSimilarMachineNames(currentMachine, machineInput);
                
                if (similarNames.length > 0) {
                    // Ask for confirmation
                    const confirmed = confirm(
                        `Similar machine name(s) found:\n\n${similarNames.join('\n')}\n\nDo you still want to add "${machineInput}"?`
                    );
                    
                    if (confirmed) {
                        updates.machine = addValueToList(currentMachine, machineInput);
                        updateNeeded = true;
                    }
                } else {
                    // No similar names, add directly
                    updates.machine = addValueToList(currentMachine, machineInput);
                    updateNeeded = true;
                }
            }
        }
        
        // Handle cross reference
        if (crossRefInput && crossRefInput.trim() !== '') {
            const currentCrossRef = product.cross_reference || '';
            
            // Check if already exists (case-insensitive)
            if (valueExistsInList(currentCrossRef, crossRefInput)) {
                console.log('Cross reference already exists, skipping:', crossRefInput);
            } else {
                updates.cross_reference = addValueToList(currentCrossRef, crossRefInput);
                updateNeeded = true;
            }
        }
        
        // Update product if needed
        if (updateNeeded) {
            const updateResult = await window.StorageModule.updateData('products', productId, updates);
            return { success: updateResult.success, updated: true };
        }
        
        return { success: true, skipped: true };
        
    } catch (error) {
        console.error('Error updating product machine/cross-ref:', error);
        return { success: false, error };
    }
}

// ===== FINALIZE SALE =====
finalizeSaleBtn.addEventListener('click', async () => {
    if (saleItems.length === 0) return;

    finalizeSaleBtn.disabled = true;
    finalizeSaleBtn.textContent = '⏳ Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        // Save customer if name is provided
        let customerId = null;
        const customerName = saleCustomerName.value.trim() || 'Walk-in Customer';
        const customerPhone = saleCustomerPhone.value.trim();
        
        // Only save customer if both name AND phone are provided, and party is not a supplier
        if (salePartyType !== 'supplier' && customerName && customerName !== 'Walk-in Customer' && customerPhone) {
            customerId = await saveNewCustomer(customerName, customerPhone);
            if (!customerId) {
                console.log('⚠️ Customer not saved, continuing without customer_id');
            }
        }

        // Build totals
let subtotal = 0, costTotal = 0;
saleItems.forEach(i => {
    const price = i.customPrice || i.product.sell_price;
    subtotal  += price * i.qty;
    costTotal += i.product.purchase_price * i.qty;
});
let discountVal = parseFloat(saleDiscount.value) || 0;
let discountAmt = saleDiscountType.value === 'percentage'
    ? (subtotal * discountVal / 100) : discountVal;
let grandTotal = Math.max(0, subtotal - discountAmt);
let paid       = parseFloat(salePaidAmount.value) || 0;
let remaining  = Math.max(0, grandTotal - paid);

// Round-off: waive the remaining difference — total stays as the real invoice amount
if (saleRoundOff && saleRoundOff.checked && paid > 0) {
    remaining = 0; // Waive remaining — but total stays as grandTotal (correct invoice value)
}

        let payStatus = 'unpaid';
// If round-off is checked and paid > 0, treat as paid
if (saleRoundOff && saleRoundOff.checked && paid > 0 && remaining === 0) {
    payStatus = 'paid';
} else if (remaining === 0 && grandTotal > 0 && paid > 0) {
    payStatus = 'paid';
} else if (paid > 0) {
    payStatus = 'partial';
}

        // 1. Save sale record
        const saleData = {
    user_id:           user.id,
    invoice_id:        saleInvoiceNumber.textContent,
    customer_name:     customerName,
    customer_phone:    customerPhone,
    sale_date:         new Date().toISOString(),
    subtotal:          subtotal,
    discount:          discountAmt,
    total:             grandTotal, // Always the real invoice total — round-off is reflected in remaining=0, not in total
    paid_amount:       paid,
    remaining_amount:  remaining,
    payment_status:    payStatus,
    notes:             saleNotes.value.trim()
};

        // Only add customer_id if it exists
        if (customerId) {
            saleData.customer_id = customerId;
        }

        // Tag with supplier_id when selling to a supplier
        if (salePartyType === 'supplier' && saleSelectedSupplierId) {
            saleData.supplier_id = saleSelectedSupplierId;
        }

        const saleResult = await window.StorageModule.saveData('sales', saleData);
        if (!saleResult.success) throw new Error('Failed to save sale: ' + saleResult.error);

        const saleId = saleResult.data.id;

        // 2. Save each sale item & update product stock
        for (const item of saleItems) {
            const price = item.customPrice || item.product.sell_price;
            const itemData = {
                sale_id:        saleId,
                product_id:     item.product.id,
                product_name:   item.product.name,
                quantity:       item.qty,
                purchase_price: item.product.purchase_price,
                sell_price:     price,
                total:          price * item.qty
            };
            
            console.log('💾 Saving sale item:', itemData);
            const itemResult = await window.StorageModule.saveData('sale_items', itemData);
            
            if (!itemResult.success) {
                console.error('❌ Failed to save sale item:', itemResult.error);
                throw new Error('Failed to save sale item: ' + itemResult.error);
            }
            
            console.log('✅ Sale item saved successfully:', itemResult.data);

            // Decrease stock
            const newStock = item.product.stock - item.qty;
            await window.StorageModule.updateData('products', item.product.id, { stock: newStock });
        }

        // 3. Update product machine names and cross references
        for (const item of saleItems) {
            if (item.machineInput || item.crossRefInput) {
                await updateProductMachineAndCrossRef(
                    item.product.id,
                    item.machineInput,
                    item.crossRefInput
                );
            }
        }

        // 4. Success
        showSaleNotification('✅ Sale finalized! Invoice ' + saleId, 'success');
        clearSale();

        // Reload products cache so stock is fresh
        await loadSaleProducts();
        
        // Reload dashboard stats
        if (window.AppModule && window.AppModule.loadDashboardStats) {
            await window.AppModule.loadDashboardStats();
        }
        
        // Reload products
        if (window.ProductsModule && window.ProductsModule.loadProducts) {
            await window.ProductsModule.loadProducts();
        }

        // Auto-recalc reorder thresholds for sold products based on new velocity
        if (window.recalcReorderThreshold) {
            for (const item of saleItems) {
                window.recalcReorderThreshold(item.product.id);
            }
        }

        // Refresh notification bell
        window.refreshNotifications && window.refreshNotifications();

    } catch (err) {
        console.error('❌ Finalize error:', err);
        showSaleNotification('Failed: ' + err.message, 'error');
    } finally {
        finalizeSaleBtn.disabled = saleItems.length === 0;
        finalizeSaleBtn.textContent = '✅ Finalize Sale';
    }
});

// ===== NOTIFICATION (reuse style) =====
function showSaleNotification(msg, type) {
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
async function initQuickSale() {
    const user = await window.StorageModule.getCurrentUser();
    if (!user) {
        console.log('ℹ️ Quick Sale not initialized - no user logged in');
        return;
    }
    
    saleInvoiceNumber.textContent = generateInvoiceId();
    saleInvoiceDate.textContent   = todayString();
    await loadSaleProducts();
    await loadSaleCustomers();
    await loadSaleSuppliers();
    recalculate();
    console.log('✅ Quick Sale Module Initialized');
}

// Listen for page navigation to this page
document.addEventListener('click', (e) => {
    if (e.target.closest('[data-page="quick-sale"]')) {
        setTimeout(() => initQuickSale(), 150);
    }
});

// DON'T initialize on page load - wait for user to navigate to Quick Sale page

window.QuickSaleModule = { initQuickSale, loadSaleProducts };
console.log('✅ Quick Sale Module Loaded');

/* ==========================================
   JS END: Quick Sale Module
   ========================================== */
})(); // end IIFE