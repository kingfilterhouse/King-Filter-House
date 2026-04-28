/* ==========================================
   JS START: Products Management Module
   Complete product CRUD operations
   ========================================== */

// ===== GLOBAL STATE =====
let allProducts = [];
let editingProductId = null;
let deletingProductId = null;
let productCategories = new Set();

// Pagination state
let currentPage = 1;
let itemsPerPage = 50; // Show 50 products per page
let totalProducts = 0;
let filteredProductsCache = []; // Cache filtered results for pagination

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

// Wire image preview update
if (productImageUrl) {
    productImageUrl.addEventListener('input', updateImagePreview);
    productImageUrl.addEventListener('blur', updateImagePreview);
}

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
    // Render custom fields for empty category initially
    _refreshCustomFieldsInForm('');
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
    // Render custom fields with existing values
    _refreshCustomFieldsInForm(product.category, product);
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
 * Refresh custom fields section based on selected category
 */
function _refreshCustomFieldsInForm(category, productData) {
    var container = document.getElementById('custom-fields-container');
    if (!container) return;
    if (window.CustomFieldsModule) {
        window.CustomFieldsModule.renderFieldInputs(category, productData?.id || null, container);
    }
    // Wire image preview reset if no image field in custom fields
    var imgInput = container && container.querySelector('[data-cf-type="image"]');
    if (!imgInput) {
        var preview = document.getElementById('product-image-preview');
        if (preview && (!productData || !productData.image_url)) {
            preview.innerHTML = '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>Product Image</p>';
        }
    }
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
async function loadProducts(page = 1) {
    try {
        window.log('🔄 Loading products...');
        
        // Load all products for now (we'll paginate the display only)
        // This maintains search/filter functionality
        const result = await window.StorageModule.getAllData('products');
        
        if (result.success) {
            allProducts = result.data;
            totalProducts = result.count || result.data.length;
            currentPage = page;
            
            // Build categories set
            productCategories.clear();
            allProducts.forEach(product => {
                if (product.category) {
                    productCategories.add(product.category.toLowerCase());
                }
            });

            // Custom fields will be loaded on-demand when rendering
            // (only for visible products, not all 612 at once)
            
            updateCategoryFilter();
            updateCategoryDatalist();
            updateBrandDropdown();
            renderProducts();
            updateProductsStats();
            
            window.log(`✅ Loaded ${allProducts.length} products`);
        } else {
            logError('❌ Failed to load products:', result.error);
            showNotification('Failed to load products', 'error');
        }
    } catch (error) {
        logError('❌ Error loading products:', error);
        showNotification('Error loading products', 'error');
    }
}

// ===== EXPORT PRODUCTS (per-category with custom fields) =====
function exportProducts() {
    const categoryVal = categoryFilter.value;
    const stockVal    = stockFilter.value;

    let filtered = allProducts.filter(p => {
        const matchCat   = !categoryVal || p.category === categoryVal;
        const matchStock = !stockVal ||
            (stockVal === 'in-stock'    && p.stock > 10) ||
            (stockVal === 'low-stock'   && p.stock > 0 && p.stock <= 10) ||
            (stockVal === 'out-of-stock'&& p.stock === 0);
        return matchCat && matchStock;
    });

    if (!window.CustomFieldsModule) {
        showNotification('Custom fields module not loaded', 'error'); return;
    }

    // Group by category and export each as separate CSV
    const cats = window.CustomFieldsModule.getCategoriesFromProducts(filtered);
    if (cats.length === 0) { showNotification('No products to export', 'error'); return; }

    cats.forEach(cat => {
        const catRows = filtered.filter(p => (p.category||'').toLowerCase() === cat);
        const headers = window.CustomFieldsModule.getExportHeaders(cat);
        const csvRows = [headers.join(',')];
        catRows.forEach(p => csvRows.push(window.CustomFieldsModule.getExportRow(p)));
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `products_${cat}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });
    showNotification(`Exported ${filtered.length} products (${cats.length} file${cats.length>1?'s':''})`, 'success');
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
window.downloadImportTemplate = function(category) {
    if (!window.CustomFieldsModule) return;
    // If category not specified, download a template per category found in products
    if (!category) {
        const cats = window.CustomFieldsModule.getCategoriesFromProducts(allProducts);
        if (cats.length === 0) {
            // No products yet — download default template
            window.CustomFieldsModule.downloadTemplate('');
        } else {
            cats.forEach(c => window.CustomFieldsModule.downloadTemplate(c));
        }
    } else {
        window.CustomFieldsModule.downloadTemplate(category);
    }
};

// Show template download options per category
window.showTemplateDownloadOptions = function() {
    const cats = window.CustomFieldsModule ? window.CustomFieldsModule.getCategoriesFromProducts(allProducts) : [];
    const modal = document.getElementById('bulk-import-modal');
    if (!cats.length) {
        window.downloadImportTemplate('');
        return;
    }
    if (cats.length === 1) {
        window.downloadImportTemplate(cats[0]);
        return;
    }
    // Multiple categories — show inline options
    const el = document.getElementById('template-download-options');
    if (el) {
        el.innerHTML = cats.map(c =>
            `<button class="btn btn-secondary btn-sm" onclick="window.downloadImportTemplate('${c}');this.textContent='✅ Downloaded';" style="margin:4px;">
                📥 ${c.charAt(0).toUpperCase()+c.slice(1)} Template
            </button>`
        ).join('');
        el.style.display = 'flex';
        el.style.flexWrap = 'wrap';
        el.style.gap = '4px';
    }
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

        // Use actual headers from the CSV file, not hardcoded list
        const cols = headers; // headers is from line 555: const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
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
        const category = (row.category || '').toLowerCase();
        // Parse custom fields if CustomFieldsModule available
        let cfResult = { base: {}, columnUpdates: {}, eavValues: {} };
        if (window.CustomFieldsModule && window.CustomFieldsModule.parseImportRow) {
            cfResult = window.CustomFieldsModule.parseImportRow(row, category);
        }
        const data = {
            user_id:           user.id,
            name:              row.name || cfResult.base.name || '',
            category:          category,
            purchase_price:    parseFloat(row.purchase_price || cfResult.base.purchase_price) || 0,
            sell_price:        parseFloat(row.sell_price     || cfResult.base.sell_price)     || 0,
            stock:             parseInt(row.stock            || cfResult.base.stock)           || 0,
            reorder_threshold: parseInt(row.reorder_threshold|| cfResult.base.reorder_threshold)|| 10,
            brand_name:        row.brand_name        || null,
            brand_bg_color:    row.brand_bg_color    || '#6366f1',
            brand_text_color:  row.brand_text_color  || '#ffffff',
            image_url:         row.image_url         || null,
            product_link:      row.product_link      || null,
            // column-mapped custom fields (size, thread, cabin, machine, cross_reference, etc.)
            ...cfResult.columnUpdates
        };
        const res = await window.StorageModule.saveData('products', data);
        if (res.success) {
            saved++;
            // Save EAV values
            if (res.data && res.data.id && window.CustomFieldsModule && Object.keys(cfResult.eavValues).length > 0) {
                await window.CustomFieldsModule.saveEavValues(res.data.id, cfResult.eavValues);
            }
        }
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
        logWarn('Could not recalc threshold:', e);
    }
}
window.recalcReorderThreshold = recalcReorderThreshold;

/**
 * Save product (add or update)
 */
async function saveProduct(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('save-product-btn');
    if (saveBtn && saveBtn.disabled) return; // prevent double-click
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving...'; }

    try {
        // Collect custom field values (column updates + EAV)
        const cfContainer = document.getElementById('custom-fields-container');
        const cfResult = window.CustomFieldsModule ? window.CustomFieldsModule.readFieldValues(cfContainer) : { 
            columnUpdates: {
                size: productSize?.value?.trim() || null,
                thread: productThread?.value?.trim() || null,
                cabin: productCabin?.value?.trim() || null,
                machine: productMachine?.value?.trim() || null,
                cross_reference: productCrossref?.value?.trim() || null
            }, 
            eavValues:{} 
        };

        const productData = {
            name: productName.value.trim(),
            category: productCategory.value.trim().toLowerCase(),
            // column_name custom fields merged in below
            purchase_price: parseFloat(productPurchasePrice.value) || 0,
            sell_price: parseFloat(productSellPrice.value) || 0,
            stock: parseInt(productStock.value) || 0,
            reorder_threshold: parseInt(document.getElementById('product-reorder-threshold').value) || 10,
            image_url: productImageUrl?.value?.trim() || null,
            product_link: productLink?.value?.trim() || null,
            ...cfResult.columnUpdates,
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
            window.log('🔄 Updating product:', editingProductId);
            result = await window.StorageModule.updateData('products', editingProductId, productData);
        } else {
            // Create new product
            window.log('🔄 Creating new product...');
            result = await window.StorageModule.saveData('products', productData);
        }
        
        if (result.success) {
            window.log('✅ Product saved successfully');
            // Save EAV custom field values (non-column fields)
            const savedProductId = editingProductId || (result.data && result.data.id);
            if (savedProductId && window.CustomFieldsModule && Object.keys(cfResult.eavValues).length > 0) {
                await window.CustomFieldsModule.saveEavValues(savedProductId, cfResult.eavValues);
            }
            showNotification(
                editingProductId ? 'Product updated successfully!' : 'Product added successfully!',
                'success'
            );
            
            closeProductModalFn();
            await loadProducts();
        } else {
            logError('❌ Failed to save product:', result.error);
            showNotification('Failed to save product: ' + result.error, 'error');
        }
    } catch (error) {
        logError('❌ Error saving product:', error);
        showNotification('Error saving product: ' + error.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = editingProductId ? 'Update Product' : 'Add Product'; }
    }
}

/**
 * Delete product
 */
async function deleteProduct() {
    if (!deletingProductId) return;
    
    try {
        window.log('🔄 Deleting product:', deletingProductId);

        // Block delete if product used in any sales
        const saleCheck = await window.StorageModule.supabase
            .from('sale_items').select('id').eq('product_id', deletingProductId).limit(1);
        if (saleCheck.data?.length > 0) {
            showNotification('Cannot delete — this product has been used in sales. Set stock to 0 instead.', 'error');
            closeDeleteModalFn();
            return;
        }
        // Block delete if product used in any purchases
        const purchaseCheck = await window.StorageModule.supabase
            .from('purchase_items').select('id').eq('product_id', deletingProductId).limit(1);
        if (purchaseCheck.data?.length > 0) {
            showNotification('Cannot delete — this product has been used in purchases. Set stock to 0 instead.', 'error');
            closeDeleteModalFn();
            return;
        }
        
        const result = await window.StorageModule.deleteData('products', deletingProductId);
        
        if (result.success) {
            window.log('✅ Product deleted successfully');
            showNotification('Product deleted successfully!', 'success');
            
            closeDeleteModalFn();
            await loadProducts();
        } else {
            logError('❌ Failed to delete product:', result.error);
            showNotification('Failed to delete product: ' + result.error, 'error');
        }
    } catch (error) {
        logError('❌ Error deleting product:', error);
        showNotification('Error deleting product', 'error');
    }
}

// ===== RENDERING FUNCTIONS =====

/**
 * Render products grid
 */
async function renderProducts() {
    const searchTerm = productSearch.value.toLowerCase();
    const categoryValue = categoryFilter.value;
    const stockValue = stockFilter.value;
    const sortValue = sortFilter.value;
    
    // Get custom field matches BEFORE filtering (async call)
    // PERFORMANCE: Only search if there's actual text (skip for category/stock filter changes)
    let cfMatchIds = null;
    if (window.CustomFieldsModule && searchTerm && searchTerm.trim().length > 0) {
        cfMatchIds = await window.CustomFieldsModule.getProductIdsMatchingSearch(searchTerm);
    }
    
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
                             (cfMatchIds && cfMatchIds.has(product.id));
        
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
    
    // Cache filtered products for pagination
    filteredProductsCache = filteredProducts;
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const productsToDisplay = filteredProducts.slice(startIndex, endIndex);
    
    // PERFORMANCE FIX: Load custom fields only for visible products (50 instead of 612)
    if (window.CustomFieldsModule && productsToDisplay.length > 0) {
        const visibleProductIds = productsToDisplay.map(p => p.id);
        await window.CustomFieldsModule.loadValuesForProducts(visibleProductIds);
    }
    
    // Render
    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3 class="empty-state-title">${allProducts.length === 0 ? 'No Products Yet' : 'No Products Match Your Filters'}</h3>
                <p class="empty-state-description">${allProducts.length === 0 ? 'Click "Add Product" to create your first product' : 'Try adjusting your search or filters'}</p>
            </div>
        `;
        updatePaginationControls(0, 0);
        return;
    }
    
    productsGrid.innerHTML = productsToDisplay.map(product => {
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
                        ${window.CustomFieldsModule ? (() => {
                            const customFields = window.CustomFieldsModule.getAllDefs() || [];
                            return customFields
                                .map(field => {
                                    const value = window.CustomFieldsModule.getProductFieldValue(product, field);
                                    if (!value) return '';
                                    
                                    // Handle URL fields as clickable links
                                    if (field.field_type === 'url') {
                                        return `<div class="product-detail-row">
                                            <span class="product-detail-label">${field.field_label}:</span>
                                            <span class="product-detail-value"><a href="${value}" target="_blank" rel="noopener">🔗 Link</a></span>
                                        </div>`;
                                    }
                                    
                                    // Handle image fields
                                    if (field.field_type === 'image') {
                                        return `<div class="product-detail-row">
                                            <span class="product-detail-label">${field.field_label}:</span>
                                            <span class="product-detail-value">📷 Image</span>
                                        </div>`;
                                    }
                                    
                                    // Regular text fields
                                    return `<div class="product-detail-row">
                                        <span class="product-detail-label">${field.field_label}:</span>
                                        <span class="product-detail-value">${value}</span>
                                    </div>`;
                                }).join('');
                        })() : ''}
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
                        ${product.product_link ? `
                        <button class="product-action-btn view" onclick="viewProductLink('${product.id}')" title="View Product Link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                        </button>` : ''}
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
    
    // Update pagination controls
    updatePaginationControls(filteredProducts.length, totalPages);
}

// ===== PAGINATION CONTROLS =====
function updatePaginationControls(totalFiltered, totalPages) {
    const paginationContainer = document.getElementById('products-pagination');
    if (!paginationContainer) return;
    
    if (totalFiltered === 0 || totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    const startItem = ((currentPage - 1) * itemsPerPage) + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalFiltered);
    
    paginationContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: #f8f9fa; border-radius: 8px; margin-top: 1rem;">
            <button 
                class="btn btn-secondary" 
                onclick="window.ProductsModule.prevPage()"
                ${currentPage === 1 ? 'disabled' : ''}
            >
                ← Previous
            </button>
            <span style="font-size: 0.9rem; color: #666;">
                Showing ${startItem}-${endItem} of ${totalFiltered} products (Page ${currentPage} of ${totalPages})
            </span>
            <button 
                class="btn btn-secondary" 
                onclick="window.ProductsModule.nextPage()"
                ${currentPage === totalPages ? 'disabled' : ''}
            >
                Next →
            </button>
        </div>
    `;
}

function nextPage() {
    const totalPages = Math.ceil(filteredProductsCache.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderProducts();
        document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderProducts();
        document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
    }
}

function resetToFirstPage() {
    currentPage = 1;
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

// Close stock adjustment modal — X button + backdrop click
const closeStockAdjBtn = document.getElementById('close-stock-adjust-modal');
if (closeStockAdjBtn) {
    closeStockAdjBtn.addEventListener('click', () => {
        stockAdjModal.classList.remove('active');
    });
}
if (stockAdjModal) {
    stockAdjModal.addEventListener('click', (e) => {
        if (e.target === stockAdjModal) stockAdjModal.classList.remove('active');
    });
}

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
productSearch.addEventListener('input', () => { currentPage = 1; renderProducts(); });

// Debounce helper for smooth dropdown changes
const filterDebounce = (func, wait) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

const renderWithDelay = filterDebounce(() => renderProducts(), 100);

categoryFilter.addEventListener('change', () => { currentPage = 1; renderWithDelay(); });
stockFilter.addEventListener('change', () => { currentPage = 1; renderWithDelay(); });
sortFilter.addEventListener('change', () => { currentPage = 1; renderWithDelay(); });

// ===== INITIALIZATION =====

/**
 * Initialize products module
 */
async function initProductsModule() {
    window.log('🚀 Initializing Products Module...');
    
    // Load custom field definitions first
    if (window.CustomFieldsModule && window.CustomFieldsModule.loadForUser) {
        await window.CustomFieldsModule.loadForUser();
    }
    
    // Load products when page loads
    await loadProducts();
    
    // Wire new buttons - moved here to ensure DOM is ready
    const exportBtn = document.getElementById('export-products-btn');
    const importBtn = document.getElementById('bulk-import-btn');
    const adjustBtn = document.getElementById('adjust-stock-btn');
    
    if (exportBtn)  exportBtn.addEventListener('click', exportProducts);
    if (importBtn)  importBtn.addEventListener('click', () => document.getElementById('bulk-import-modal').classList.add('active'));
    if (adjustBtn) {
        adjustBtn.addEventListener('click', () => {
            // Populate product dropdown
            const sel = document.getElementById('adj-product-select');
            if (!sel) return;
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
            document.getElementById('adj-sign-minus')?.classList.add('active');
            document.querySelectorAll('.reason-btn').forEach(b => b.classList.toggle('active', b.dataset.reason === 'Damaged'));
            document.getElementById('stock-adjust-modal')?.classList.add('active');
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
    
    window.log('✅ Products Module Initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.StorageModule.getCurrentUser();
    if (user) {
        initProductsModule();
    } else {
        window.log('ℹ️ Products not initialized - no user logged in');
    }
});
} else {
    initProductsModule();
}

// Export for use in other modules
window.ProductsModule = {
    loadProducts,
    nextPage,
    prevPage,
    allProducts: () => allProducts,
    getProductById: (id) => allProducts.find(p => p.id === id)
};

window.log('✅ Products Module Loaded');

/* ==========================================
   JS END: Products Management Module
   ========================================== */

// Category change → refresh custom fields in product form
const productCategoryInput = document.getElementById('product-category');
if (productCategoryInput) {
    productCategoryInput.addEventListener('input', function() {
        _refreshCustomFieldsInForm(this.value, null);
    });
}