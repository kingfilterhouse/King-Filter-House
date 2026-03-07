/* ==========================================
   JS START: Products Management Module
   Complete product CRUD operations
   ========================================== */

// ===== GLOBAL STATE =====
let allProducts = [];
let editingProductId = null;
let deletingProductId = null;
let productCategories = new Set();

// ===== DOM ELEMENTS =====
const productsGrid = document.getElementById('products-grid');
const productSearch = document.getElementById('product-search');
const categoryFilter = document.getElementById('category-filter');
const stockFilter = document.getElementById('stock-filter');
const sortFilter = document.getElementById('sort-filter');

// Modal elements
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const addProductBtn = document.getElementById('add-product-btn');
const closeProductModal = document.getElementById('close-product-modal');
const cancelProductBtn = document.getElementById('cancel-product-btn');

// Delete modal elements
const confirmDeleteModal = document.getElementById('confirm-delete-modal');
const closeDeleteModal = document.getElementById('close-delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Form fields
const productName = document.getElementById('product-name');
const productCategory = document.getElementById('product-category');
const productSize = document.getElementById('product-size');
const productThread = document.getElementById('product-thread');
const productCabin = document.getElementById('product-cabin');
const productMachine = document.getElementById('product-machine');
const productImageUrl = document.getElementById('product-image-url');
const productPurchasePrice = document.getElementById('product-purchase-price');
const productSellPrice = document.getElementById('product-sell-price');
const productStock = document.getElementById('product-stock');
const productCrossref = document.getElementById('product-crossref');
const productLink = document.getElementById('product-link');
const productBrandName = document.getElementById('product-brand-name');
const productBrandBg   = document.getElementById('product-brand-bg');
const productBrandText = document.getElementById('product-brand-text');
const productMarginDisplay = document.getElementById('product-margin-display');
const productImagePreview = document.getElementById('product-image-preview');

// New feature DOM refs
const adjustStockBtn   = document.getElementById('adjust-stock-btn');
const bulkImportBtn    = document.getElementById('bulk-import-btn');
const exportProductsBtn= document.getElementById('export-products-btn');
const stockAdjModal    = document.getElementById('stock-adjust-modal');

let adjSign   = -1;
let adjReason = 'Damaged';
let importRows = [];

// Sign toggle for adjustment modal
window.setAdjSign = function(sign) {
    adjSign = sign;
    document.getElementById('adj-sign-minus').classList.toggle('active', sign === -1);
    document.getElementById('adj-sign-plus').classList.toggle('active',  sign ===  1);
};
window.setAdjReason = function(btn) {
    document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    adjReason = btn.dataset.reason;
};

// ===== BRAND DATALIST + LIVE PREVIEW =====
function updateBrandDropdown() {
    const sel = document.getElementById('product-brand-name');
    if (!sel) return;
    const current = sel.value;
    const brands = [...new Set(allProducts.map(p => p.brand_name).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">-- No Brand --</option>`
        + brands.map(b => `<option value="${b}">${b}</option>`).join('')
        + `<option value="__new__">➕ Add New Brand...</option>`;
    // Restore selection if still valid
    if (current && current !== '__new__') sel.value = current;
}

function handleBrandDropdownChange() {
    const sel    = document.getElementById('product-brand-name');
    const newRow = document.getElementById('new-brand-row');
    const newInput = document.getElementById('product-brand-new');
    if (!sel || !newRow) return;
    if (sel.value === '__new__') {
        newRow.style.display = 'block';
        if (newInput) { newInput.focus(); newInput.value = ''; }
        updateBrandPreview();
    } else {
        newRow.style.display = 'none';
        // Auto-fill colors from existing brand
        if (sel.value) {
            const match = allProducts.find(p => p.brand_name === sel.value);
            if (match) {
                if (productBrandBg)   productBrandBg.value   = match.brand_bg_color   || '#6366f1';
                if (productBrandText) productBrandText.value = match.brand_text_color || '#ffffff';
            }
        }
        updateBrandPreview();
    }
}

function updateBrandPreview() {
    const tag      = document.getElementById('brand-preview-tag');
    const sel      = document.getElementById('product-brand-name');
    const newInput = document.getElementById('product-brand-new');
    const name = (sel?.value === '__new__' ? newInput?.value : sel?.value) || 'Preview';
    const bg   = productBrandBg?.value   || '#6366f1';
    const txt  = productBrandText?.value || '#ffffff';
    if (tag) {
        tag.textContent      = name || 'Preview';
        tag.style.background = bg;
        tag.style.color      = txt;
    }
}

// Wire preview updates
const productBrandNameSel = document.getElementById('product-brand-name');
if (productBrandNameSel) productBrandNameSel.addEventListener('change', handleBrandDropdownChange);
const productBrandNewInput = document.getElementById('product-brand-new');
if (productBrandNewInput) productBrandNewInput.addEventListener('input', updateBrandPreview);
if (productBrandBg)   productBrandBg.addEventListener('input', updateBrandPreview);
if (productBrandText) productBrandText.addEventListener('input', updateBrandPreview);

// Stats elements
const productsTotalCount = document.getElementById('products-total-count');
const productsTotalValue = document.getElementById('products-total-value');
const productsLowStockCount = document.getElementById('products-low-stock-count');
const productsOutStockCount = document.getElementById('products-out-stock-count');

// ===== UTILITY FUNCTIONS =====

/**
 * Calculate margin percentage
 * @param {number} purchasePrice - Product purchase price
 * @param {number} sellPrice - Product sell price
 * @returns {string} Formatted margin percentage
 */
function calculateMargin(purchasePrice, sellPrice) {
    if (!purchasePrice || purchasePrice === 0) return '0%';
    const margin = ((sellPrice - purchasePrice) / purchasePrice) * 100;
    return margin.toFixed(2) + '%';
}

/**
 * Calculate profit amount
 * @param {number} purchasePrice - Product purchase price
 * @param {number} sellPrice - Product sell price
 * @returns {number} Profit amount
 */
function calculateProfit(purchasePrice, sellPrice) {
    return sellPrice - purchasePrice;
}

/**
 * Update margin display in form
 */
function updateMarginDisplay() {
    const purchase = parseFloat(productPurchasePrice.value) || 0;
    const sell = parseFloat(productSellPrice.value) || 0;
    const profit = calculateProfit(purchase, sell);
    const margin = calculateMargin(purchase, sell);
    
    productMarginDisplay.value = `PKR ${profit.toFixed(0)} (${margin})`;
}

/**
 * Update image preview
 */
function updateImagePreview() {
    const imageUrl = productImageUrl.value.trim();
    
    if (imageUrl && isValidUrl(imageUrl)) {
        productImagePreview.innerHTML = `<img src="${imageUrl}" alt="Product preview" onerror="handleImageError(this)">`;
    } else {
        productImagePreview.innerHTML = `
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>Product Image</p>
        `;
    }
}

/**
 * Handle image loading errors
 */
window.handleImageError = function(img) {
    img.parentElement.innerHTML = `
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
        </svg>
        <p style="color: var(--color-danger);">Image Failed to Load</p>
    `;
};

/**
 * Validate URL
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Update category filter dropdown
 */
function updateCategoryFilter() {
    const currentValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
        Array.from(productCategories).sort().map(cat => 
            `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
        ).join('');
    categoryFilter.value = currentValue;
}

/**
 * Update category datalist
 */
function updateCategoryDatalist() {
    const datalist = document.getElementById('category-datalist');
    datalist.innerHTML = Array.from(productCategories).sort().map(cat => 
        `<option value="${cat}">`
    ).join('');
}

/**
 * Update products statistics
 */
function updateProductsStats() {
    const totalProducts = allProducts.length;
    const totalValue = allProducts.reduce((sum, p) => sum + (p.stock * p.purchase_price), 0);
    const lowStockItems = allProducts.filter(p => p.stock > 0 && p.stock <= 10).length;
    const outOfStockItems = allProducts.filter(p => p.stock === 0).length;
    
    productsTotalCount.textContent = totalProducts;
    productsTotalValue.textContent = `PKR ${totalValue.toLocaleString()}`;
    productsLowStockCount.textContent = lowStockItems;
    productsOutStockCount.textContent = outOfStockItems;
    
    // Also update dashboard stats if they exist
    const statTotalProducts = document.getElementById('stat-total-products');
    const statInventoryValue = document.getElementById('stat-inventory-value');
    const statLowStock = document.getElementById('stat-low-stock');
    
    if (statTotalProducts) statTotalProducts.textContent = totalProducts;
    if (statInventoryValue) statInventoryValue.textContent = `PKR ${totalValue.toLocaleString()}`;
    if (statLowStock) statLowStock.textContent = lowStockItems;
}

// ===== MODAL FUNCTIONS =====

/**
 * Open product modal for adding
 */
function openAddProductModal() {
    editingProductId = null;
    document.getElementById('product-modal-title').textContent = 'Add New Product';
    productForm.reset();
    productMarginDisplay.value = 'PKR 0 (0%)';
    updateBrandDropdown();
    document.getElementById('new-brand-row').style.display = 'none';
    if (productBrandBg)   productBrandBg.value   = '#6366f1';
    if (productBrandText) productBrandText.value = '#ffffff';
    updateBrandPreview();
    updateImagePreview();
    productModal.classList.add('active');
}

/**
 * Open product modal for editing
 */
window.openEditProductModal = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    editingProductId = productId;
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    
    productName.value = product.name;
    productCategory.value = product.category;
    productSize.value = product.size || '';
    productThread.value = product.thread || '';
    productCabin.value = product.cabin || '';
    productMachine.value = product.machine || '';
    productImageUrl.value = product.image_url || '';
    productPurchasePrice.value = product.purchase_price;
    productSellPrice.value = product.sell_price;
    productStock.value = product.stock;
    productCrossref.value = product.cross_reference || '';
    productLink.value = product.product_link || '';
    document.getElementById('product-reorder-threshold').value = product.reorder_threshold ?? 10;
    updateBrandDropdown();
    const brandSel = document.getElementById('product-brand-name');
    if (brandSel && product.brand_name) brandSel.value = product.brand_name;
    document.getElementById('new-brand-row').style.display = 'none';
    if (productBrandBg)   productBrandBg.value   = product.brand_bg_color   || '#6366f1';
    if (productBrandText) productBrandText.value = product.brand_text_color || '#ffffff';
    updateBrandPreview();

    updateMarginDisplay();
    updateImagePreview();
    productModal.classList.add('active');
};

/**
 * Close product modal
 */
function closeProductModalFn() {
    productModal.classList.remove('active');
    editingProductId = null;
    productForm.reset();
}

/**
 * Open delete confirmation modal
 */
window.openDeleteProductModal = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    deletingProductId = productId;
    document.getElementById('delete-product-name').textContent = product.name;
    confirmDeleteModal.classList.add('active');
};

/**
 * Close delete modal
 */
function closeDeleteModalFn() {
    confirmDeleteModal.classList.remove('active');
    deletingProductId = null;
}

/**
 * View product link
 */
window.viewProductLink = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (product && product.product_link) {
        window.open(product.product_link, '_blank', 'noopener,noreferrer');
    }
};

// ===== CRUD OPERATIONS =====

/**
 * Load all products from database
 */
async function loadProducts() {
    try {
        console.log('🔄 Loading products...');
        
        const result = await window.StorageModule.getAllData('products');
        
        if (result.success) {
            allProducts = result.data;
            
            // Build categories set
            productCategories.clear();
            allProducts.forEach(product => {
                if (product.category) {
                    productCategories.add(product.category.toLowerCase());
                }
            });
            
           updateCategoryFilter();
            updateCategoryDatalist();
            updateBrandDropdown();
            renderProducts();
            updateProductsStats();
            
            console.log(`✅ Loaded ${allProducts.length} products`);
        } else {
            console.error('❌ Failed to load products:', result.error);
            showNotification('Failed to load products', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading products:', error);
        showNotification('Error loading products', 'error');
    }
}

// ===== EXPORT PRODUCTS =====
function exportProducts() {
    const searchTerm   = productSearch.value.toLowerCase();
    const categoryVal  = categoryFilter.value;
    const stockVal     = stockFilter.value;

    let rows = allProducts.filter(p => {
        const ms = t => t ? t.split('|').some(v => v.trim().toLowerCase().includes(searchTerm)) : false;
        const matchSearch = p.name.toLowerCase().includes(searchTerm) ||
            (p.category && p.category.toLowerCase().includes(searchTerm)) ||
            ms(p.machine) || ms(p.cross_reference);
        const matchCat   = !categoryVal || p.category === categoryVal;
        const matchStock = !stockVal ||
            (stockVal === 'in-stock'    && p.stock > 10) ||
            (stockVal === 'low-stock'   && p.stock > 0 && p.stock <= 10) ||
            (stockVal === 'out-of-stock'&& p.stock === 0);
        return matchSearch && matchCat && matchStock;
    });

    const headers = ['Name','Category','Size','Thread','Cabin','Machine','Stock','Reorder Threshold','Cost Price','Sell Price','Margin%','Cross Reference','Product Link','Brand','Brand BG Color','Brand Text Color'];
    const csvRows = [headers.join(',')];
    rows.forEach(p => {
        const margin = p.purchase_price ? (((p.sell_price - p.purchase_price) / p.purchase_price) * 100).toFixed(2) : '0';
        csvRows.push([
            `"${(p.name||'').replace(/"/g,'""')}"`,
            `"${p.category||''}"`,
            `"${p.size||''}"`,
            `"${p.thread||''}"`,
            `"${p.cabin||''}"`,
            `"${(p.machine||'').replace(/"/g,'""')}"`,
            p.stock,
            p.reorder_threshold ?? 10,
            p.purchase_price,
            p.sell_price,
            margin,
            `"${(p.cross_reference||'').replace(/"/g,'""')}"`,
            `"${p.product_link||''}"`,
            `"${p.brand_name||''}"`,
            `"${p.brand_bg_color||''}"`,
            `"${p.brand_text_color||''}"`
        ].join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(`Exported ${rows.length} products`, 'success');
}

// ===== STOCK ADJUSTMENT =====
window.saveStockAdjustment = async function() {
    const productId = document.getElementById('adj-product-select').value;
    const qty       = parseInt(document.getElementById('adj-qty').value) || 0;
    const notes     = document.getElementById('adj-notes').value.trim();

    if (!productId) { showNotification('Please select a product', 'error'); return; }
    if (qty <= 0)   { showNotification('Please enter a quantity', 'error'); return; }

    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const qtyChange  = adjSign * qty;
    const newStock   = Math.max(0, product.stock + qtyChange);

    const user = await window.StorageModule.getCurrentUser();
    if (!user) return;

    // Save adjustment log
    await window.StorageModule.supabase.from('stock_adjustments').insert({
        user_id:      user.id,
        product_id:   productId,
        product_name: product.name,
        qty_change:   qtyChange,
        reason:       adjReason,
        notes:        notes
    });

    // Update product stock
    await window.StorageModule.updateData('products', productId, { stock: newStock });

    showNotification(`Stock updated: ${product.name} → ${newStock}`, 'success');
    document.getElementById('stock-adjust-modal').classList.remove('active');
    await loadProducts();
    window.refreshNotifications && window.refreshNotifications();
};

// ===== BULK IMPORT =====
window.downloadImportTemplate = function() {
    const headers = 'name,category,size,thread,cabin,machine,purchase_price,sell_price,stock,reorder_threshold,cross_reference,product_link,image_url,brand_name,brand_bg_color,brand_text_color\n';
    const example = 'Air Filter X200,filters,10x4,M14,Round,Toyota Corolla 2010-2015,450,750,25,8,AF-200|AF200X,https://supplier.com/af200,https://img.example.com/af200.jpg,Bosch,#e53e3e,#ffffff\n';
    const blob = new Blob([headers + example], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'products_import_template.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
};

window.handleImportFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { showNotification('CSV has no data rows', 'error'); return; }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        importRows = [];
        const previewRows = [];

        for (let i = 1; i < lines.length; i++) {
            const vals  = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g,''));
            const row   = {};
            headers.forEach((h, idx) => row[h] = vals[idx] || '');
            const error = !row.name ? 'Missing name' : (!row.purchase_price || isNaN(row.purchase_price)) ? 'Bad purchase_price' : null;
            row._error  = error;
            importRows.push(row);
            previewRows.push(row);
        }

        const validCount = importRows.filter(r => !r._error).length;
        document.getElementById('import-row-count').textContent = `${validCount} valid rows (${importRows.length - validCount} errors)`;
        document.getElementById('confirm-import-btn').disabled = validCount === 0;

        const cols = ['name','category','size','thread','cabin','machine','purchase_price','sell_price','stock','reorder_threshold','cross_reference','product_link','image_url','brand_name','brand_bg_color','brand_text_color'];
        const tableHtml = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}<th>Status</th></tr></thead><tbody>` +
            previewRows.map(r => `<tr class="${r._error ? 'import-row-error' : ''}">
                ${cols.map(c=>`<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r[c]||''}">${r[c]||''}</td>`).join('')}
                <td>${r._error || '✅'}</td>
            </tr>`).join('') + '</tbody>';

        document.getElementById('import-preview-table').innerHTML = tableHtml;
        document.getElementById('import-preview-area').style.display = 'block';
    };
    reader.readAsText(file);
};

window.confirmBulkImport = async function() {
    const btn  = document.getElementById('confirm-import-btn');
    const user = await window.StorageModule.getCurrentUser();
    if (!user) return;

    btn.disabled = true;
    btn.textContent = '⏳ Importing...';

    const validRows = importRows.filter(r => !r._error);
    let saved = 0;

    for (const row of validRows) {
        const data = {
            user_id:           user.id,
            name:              row.name,
            category:          (row.category || '').toLowerCase(),
            size:              row.size              || '',
            thread:            row.thread            || '',
            cabin:             row.cabin             || '',
            machine:           row.machine           || '',
            purchase_price:    parseFloat(row.purchase_price) || 0,
            sell_price:        parseFloat(row.sell_price)     || 0,
            stock:             parseInt(row.stock)            || 0,
            reorder_threshold: parseInt(row.reorder_threshold)|| 10,
            cross_reference:   row.cross_reference   || '',
            product_link:      row.product_link      || '',
            image_url:         row.image_url         || '',
            brand_name:        row.brand_name        || null,
            brand_bg_color:    row.brand_bg_color    || '#6366f1',
            brand_text_color:  row.brand_text_color  || '#ffffff',
        };
        const res = await window.StorageModule.saveData('products', data);
        if (res.success) saved++;
    }

    showNotification(`Imported ${saved} products successfully`, 'success');
    document.getElementById('bulk-import-modal').classList.remove('active');
    importRows = [];
    document.getElementById('import-preview-area').style.display = 'none';
    document.getElementById('import-file-input').value = '';
    btn.disabled = false;
    btn.textContent = 'Import Products';
    await loadProducts();
    window.refreshNotifications && window.refreshNotifications();
};

// ===== AUTO REORDER THRESHOLD CALCULATOR =====
// Called after sales to update thresholds based on velocity
async function recalcReorderThreshold(productId) {
    try {
        const supabase = window.StorageModule.supabase;
        const since = new Date(); since.setDate(since.getDate() - 30);

        const { data: items } = await supabase
            .from('sale_items')
            .select('quantity, created_at')
            .eq('product_id', productId)
            .gte('created_at', since.toISOString());

        if (!items || items.length < 3) return; // not enough data yet

        const totalSold  = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const avgDaily   = totalSold / 30;
        const suggested  = Math.max(5, Math.ceil(avgDaily * 14)); // 2-week buffer

        await window.StorageModule.updateData('products', productId, { reorder_threshold: suggested });
    } catch(e) {
        console.warn('Could not recalc threshold:', e);
    }
}
window.recalcReorderThreshold = recalcReorderThreshold;

/**
 * Save product (add or update)
 */
async function saveProduct(e) {
    e.preventDefault();
    
    try {
        const productData = {
            name: productName.value.trim(),
            category: productCategory.value.trim().toLowerCase(),
            size: productSize.value.trim(),
            thread: productThread.value.trim(),
            cabin: productCabin.value.trim(),
            machine: productMachine.value.trim(),
            image_url: productImageUrl.value.trim(),
            purchase_price: parseFloat(productPurchasePrice.value) || 0,
            sell_price: parseFloat(productSellPrice.value) || 0,
            stock: parseInt(productStock.value) || 0,
            cross_reference: productCrossref.value.trim(),
            product_link: productLink.value.trim(),
            reorder_threshold:  parseInt(document.getElementById('product-reorder-threshold').value) || 10,
            brand_name: (()=>{
                const sel = document.getElementById('product-brand-name');
                const ni  = document.getElementById('product-brand-new');
                return sel?.value === '__new__' ? (ni?.value.trim()||null) : (sel?.value||null);
            })(),
            brand_bg_color:     productBrandBg?.value   || '#6366f1',
            brand_text_color:   productBrandText?.value || '#ffffff',
            updated_at: new Date().toISOString()
        };
        
        // Add user_id for new products
        if (!editingProductId) {
            const user = await window.StorageModule.getCurrentUser();
            if (!user) {
                showNotification('Not authenticated', 'error');
                return;
            }
            productData.user_id = user.id;
        }
        
        let result;
        
        if (editingProductId) {
            // Update existing product
            console.log('🔄 Updating product:', editingProductId);
            result = await window.StorageModule.updateData('products', editingProductId, productData);
        } else {
            // Create new product
            console.log('🔄 Creating new product...');
            result = await window.StorageModule.saveData('products', productData);
        }
        
        if (result.success) {
            console.log('✅ Product saved successfully');
            showNotification(
                editingProductId ? 'Product updated successfully!' : 'Product added successfully!',
                'success'
            );
            
            closeProductModalFn();
            await loadProducts();
        } else {
            console.error('❌ Failed to save product:', result.error);
            showNotification('Failed to save product: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('❌ Error saving product:', error);
        showNotification('Error saving product', 'error');
    }
}

/**
 * Delete product
 */
async function deleteProduct() {
    if (!deletingProductId) return;
    
    try {
        console.log('🔄 Deleting product:', deletingProductId);
        
        const result = await window.StorageModule.deleteData('products', deletingProductId);
        
        if (result.success) {
            console.log('✅ Product deleted successfully');
            showNotification('Product deleted successfully!', 'success');
            
            closeDeleteModalFn();
            await loadProducts();
        } else {
            console.error('❌ Failed to delete product:', result.error);
            showNotification('Failed to delete product: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('❌ Error deleting product:', error);
        showNotification('Error deleting product', 'error');
    }
}

// ===== RENDERING FUNCTIONS =====

/**
 * Render products grid
 */
function renderProducts() {
    const searchTerm = productSearch.value.toLowerCase();
    const categoryValue = categoryFilter.value;
    const stockValue = stockFilter.value;
    const sortValue = sortFilter.value;
    
    // Filter products
    let filteredProducts = allProducts.filter(product => {
        // Helper function to search in pipe-separated values
        const searchInPipeSeparated = (field) => {
            if (!field) return false;
            const values = field.split('|').map(v => v.trim().toLowerCase());
            return values.some(v => v.includes(searchTerm));
        };
        
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                             (product.category && product.category.toLowerCase().includes(searchTerm)) ||
                             (product.size && product.size.toLowerCase().includes(searchTerm)) ||
                             (product.thread && product.thread.toLowerCase().includes(searchTerm)) ||
                             (product.cabin && product.cabin.toLowerCase().includes(searchTerm)) ||
                             searchInPipeSeparated(product.machine) ||
                             searchInPipeSeparated(product.cross_reference);
        
        const matchesCategory = !categoryValue || product.category === categoryValue;
        
        let matchesStock = true;
        if (stockValue === 'in-stock') {
            matchesStock = product.stock > 10;
        } else if (stockValue === 'low-stock') {
            matchesStock = product.stock > 0 && product.stock <= 10;
        } else if (stockValue === 'out-of-stock') {
            matchesStock = product.stock === 0;
        }
        
        return matchesSearch && matchesCategory && matchesStock;
    });
    
    // Sort products
    filteredProducts.sort((a, b) => {
        switch (sortValue) {
            case 'newest':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'stock-high':
                return b.stock - a.stock;
            case 'stock-low':
                return a.stock - b.stock;
            case 'price-high':
                return b.sell_price - a.sell_price;
            case 'price-low':
                return a.sell_price - b.sell_price;
            default:
                return 0;
        }
    });
    
    // Render
    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3 class="empty-state-title">${allProducts.length === 0 ? 'No Products Yet' : 'No Products Match Your Filters'}</h3>
                <p class="empty-state-description">${allProducts.length === 0 ? 'Click "Add Product" to create your first product' : 'Try adjusting your search or filters'}</p>
            </div>
        `;
        return;
    }
    
    productsGrid.innerHTML = filteredProducts.map(product => {
        const margin = calculateMargin(product.purchase_price, product.sell_price);
        const profit = calculateProfit(product.purchase_price, product.sell_price);
        
        let stockBadge = 'in-stock';
        let stockText = `${product.stock} in stock`;
        
        if (product.stock === 0) {
            stockBadge = 'out-of-stock';
            stockText = 'Out of Stock';
        } else if (product.stock <= 10) {
            stockBadge = 'low-stock';
            stockText = `Low Stock (${product.stock})`;
        }
        
        return `
            <div class="product-card">
                <div class="product-card-image">
                    ${product.image_url ? 
                        `<img src="${product.image_url}" alt="${product.name}" onerror="this.parentElement.innerHTML='<div class=\\'product-card-image-placeholder\\'>📦</div>'">` : 
                        '<div class="product-card-image-placeholder">📦</div>'
                    }
                    <span class="product-card-stock-badge ${stockBadge}">${stockText}</span>
                    ${product.brand_name ? `<span class="product-card-brand-badge" style="background:${product.brand_bg_color||'#6366f1'};color:${product.brand_text_color||'#fff'};">${product.brand_name}</span>` : ''}
                </div>
                
                <div class="product-card-body">
                    <div class="product-card-header">
                        <h3 class="product-card-title">${product.name}</h3>
                        <span class="product-card-category">${product.category}</span>
                    </div>
                    
                    <div class="product-card-details">
                        ${product.size ? `
                            <div class="product-detail-row">
                                <span class="product-detail-label">Size:</span>
                                <span class="product-detail-value">${product.size}</span>
                            </div>
                        ` : ''}
                        
                        ${product.thread ? `
                            <div class="product-detail-row">
                                <span class="product-detail-label">Thread:</span>
                                <span class="product-detail-value">${product.thread}</span>
                            </div>
                        ` : ''}
                        
                        ${product.cabin ? `
                            <div class="product-detail-row">
                                <span class="product-detail-label">Cabin:</span>
                                <span class="product-detail-value">${product.cabin}</span>
                            </div>
                        ` : ''}
                        
                        ${product.machine ? `
                            <div class="product-detail-row">
                                <span class="product-detail-label">Machine:</span>
                                <span class="product-detail-value">${product.machine}</span>
                            </div>
                        ` : ''}
                        
                        ${product.cross_reference ? `
                            <div class="product-detail-row">
                                <span class="product-detail-label">Cross Ref:</span>
                                <span class="product-detail-value">${product.cross_reference}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="product-card-pricing">
                        <div class="product-price-box cost">
                            <span class="product-price-label">Cost</span>
                            <span class="product-price-value finance-sensitive">PKR ${product.purchase_price.toLocaleString()}</span>
                        </div>
                        <div class="product-price-box sell">
                            <span class="product-price-label">Sell</span>
                            <span class="product-price-value">PKR ${product.sell_price.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div class="product-card-margin finance-sensitive">
                        <span class="product-margin-label">Margin</span>
                        <span class="product-margin-value">PKR ${profit.toFixed(0)} (${margin})</span>
                    </div>
                    
                    <div class="product-card-actions">
                        <button class="product-action-btn view" onclick="viewProductLink('${product.id}')" title="View Product Link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                        </button>
                        <button class="product-action-btn edit" onclick="openEditProductModal('${product.id}')" title="Edit Product">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="product-action-btn delete" onclick="openDeleteProductModal('${product.id}')" title="Delete Product">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== EVENT LISTENERS =====

// Open add product modal
addProductBtn.addEventListener('click', openAddProductModal);

// Close product modal
closeProductModal.addEventListener('click', closeProductModalFn);
cancelProductBtn.addEventListener('click', closeProductModalFn);
productModal.addEventListener('click', (e) => {
    if (e.target === productModal) closeProductModalFn();
});

// Close delete modal
closeDeleteModal.addEventListener('click', closeDeleteModalFn);
cancelDeleteBtn.addEventListener('click', closeDeleteModalFn);
confirmDeleteModal.addEventListener('click', (e) => {
    if (e.target === confirmDeleteModal) closeDeleteModalFn();
});

// Confirm delete
confirmDeleteBtn.addEventListener('click', deleteProduct);

// Form submit
productForm.addEventListener('submit', saveProduct);

// Update margin on price change
productPurchasePrice.addEventListener('input', updateMarginDisplay);
productSellPrice.addEventListener('input', updateMarginDisplay);

// Update image preview on URL change
productImageUrl.addEventListener('input', updateImagePreview);

// Search and filters
productSearch.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);
stockFilter.addEventListener('change', renderProducts);
sortFilter.addEventListener('change', renderProducts);

// ===== INITIALIZATION =====

/**
 * Initialize products module
 */
async function initProductsModule() {
    console.log('🚀 Initializing Products Module...');
    
    // Load products when page loads
    await loadProducts();
    
    console.log('✅ Products Module Initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.StorageModule.getCurrentUser();
    if (user) {
        initProductsModule();
    } else {
        console.log('ℹ️ Products not initialized - no user logged in');
    }
});
} else {
    initProductsModule();
}

// Export for use in other modules
window.ProductsModule = {
    loadProducts,
    allProducts: () => allProducts,
    getProductById: (id) => allProducts.find(p => p.id === id)
};

// Wire new buttons
if (exportProductsBtn)  exportProductsBtn.addEventListener('click', exportProducts);
if (bulkImportBtn)      bulkImportBtn.addEventListener('click', () => document.getElementById('bulk-import-modal').classList.add('active'));
if (adjustStockBtn) {
    adjustStockBtn.addEventListener('click', () => {
        // Populate product dropdown
        const sel = document.getElementById('adj-product-select');
        sel.innerHTML = '<option value="">-- Select Product --</option>' +
            allProducts.map(p => `<option value="${p.id}">${p.name} (Stock: ${p.stock})</option>`).join('');
        sel.onchange = () => {
            const p = allProducts.find(x => x.id === sel.value);
            document.getElementById('adj-current-stock').textContent = p ? p.stock : '—';
        };
        document.getElementById('adj-qty').value = '';
        document.getElementById('adj-notes').value = '';
        adjSign = -1; adjReason = 'Damaged';
        document.querySelectorAll('.qty-sign-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('adj-sign-minus').classList.add('active');
        document.querySelectorAll('.reason-btn').forEach(b => b.classList.toggle('active', b.dataset.reason === 'Damaged'));
        document.getElementById('stock-adjust-modal').classList.add('active');
    });
}

// Drag-drop for import
const dropZone = document.getElementById('import-drop-zone');
if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) { const inp = document.getElementById('import-file-input'); inp.files = e.dataTransfer.files; window.handleImportFile(inp); }
    });
}

console.log('✅ Products Module Loaded');

/* ==========================================
   JS END: Products Management Module
   ========================================== */