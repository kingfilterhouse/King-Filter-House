/* ==========================================================
   customFields.js — Custom Product Fields Module
   UPDATED VERSION with 5-field limit and dropdown selection
   Handles field definitions, EAV values, industry presets,
   form rendering, search, import/export per category.
   ========================================================== */

(function () {

// ── Industry presets ───────────────────────────────────────
var PRESETS = {
    filters: {
        label: '🔧 Filters / Auto Parts',
        description: 'Size, Thread, Cabin, Machine, Cross Ref',
        fields: [
            { field_label:'Size',            field_type:'text',  field_order:1, is_required:true,  is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:'size', is_dropdown_field:false },
            { field_label:'Thread',          field_type:'text',  field_order:2, is_required:true,  is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:'thread', is_dropdown_field:false },
            { field_label:'Cabin',           field_type:'text',  field_order:3, is_required:false, is_searchable:true,  show_on_invoice:false, show_on_purchase:true,  column_name:'cabin', is_dropdown_field:false },
            { field_label:'Machine',         field_type:'text',  field_order:4, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:'machine', is_dropdown_field:true },
            { field_label:'Cross Reference', field_type:'text',  field_order:5, is_required:false, is_searchable:true,  show_on_invoice:false, show_on_purchase:false, column_name:'cross_reference', is_dropdown_field:true }
        ]
    },
    pharmacy: {
        label: '💊 Pharmacy / Medical',
        description: 'Batch No, Expiry, Manufacturer',
        fields: [
            { field_label:'Batch No',              field_type:'text',   field_order:1, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false },
            { field_label:'Expiry Date',           field_type:'date',   field_order:2, is_required:false, is_searchable:false, show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false },
            { field_label:'Manufacturer',          field_type:'text',   field_order:3, is_required:false, is_searchable:true,  show_on_invoice:false, show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Requires Prescription', field_type:'yes_no', field_order:4, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Product Link',          field_type:'url',    field_order:5, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'product_link', is_dropdown_field:false }
        ]
    },
    electronics: {
        label: '📱 Electronics',
        description: 'Brand, Model, Wattage, Warranty',
        fields: [
            { field_label:'Brand',        field_type:'text',   field_order:1, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false },
            { field_label:'Model No',     field_type:'text',   field_order:2, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false },
            { field_label:'Wattage',      field_type:'number', field_order:3, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Warranty',     field_type:'text',   field_order:4, is_required:false, is_searchable:false, show_on_invoice:true,  show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Product Link', field_type:'url',    field_order:5, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'product_link', is_dropdown_field:false }
        ]
    },
    clothing: {
        label: '👕 Clothing / Textile',
        description: 'Size, Color, Material, Gender',
        fields: [
            { field_label:'Size',         field_type:'text',     field_order:1, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:'size', is_dropdown_field:false },
            { field_label:'Color',        field_type:'text',     field_order:2, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false },
            { field_label:'Material',     field_type:'text',     field_order:3, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Gender',       field_type:'dropdown', field_order:4, is_required:false, is_searchable:false, show_on_invoice:true,  show_on_purchase:false, column_name:null, is_dropdown_field:false, options_json:'["Mens","Womens","Kids","Unisex"]' },
            { field_label:'Product Link', field_type:'url',      field_order:5, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'product_link', is_dropdown_field:false }
        ]
    },
    general: {
        label: '🛒 General Store',
        description: 'Brand, Weight, Unit',
        fields: [
            { field_label:'Brand',        field_type:'text',     field_order:1, is_required:false, is_searchable:true,  show_on_invoice:true,  show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Weight',       field_type:'text',     field_order:2, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:null, is_dropdown_field:false },
            { field_label:'Unit',         field_type:'dropdown', field_order:3, is_required:false, is_searchable:false, show_on_invoice:true,  show_on_purchase:true,  column_name:null, is_dropdown_field:false, options_json:'["Piece","Kg","Gram","Litre","Dozen","Box"]' },
            { field_label:'Product Link', field_type:'url',      field_order:4, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'product_link', is_dropdown_field:false },
            { field_label:'Image URL',    field_type:'image',    field_order:5, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'image_url', is_dropdown_field:false }
        ]
    },
    custom: {
        label: '✏️ Custom / Other',
        description: 'Start with URL & Image only, add your own',
        fields: [
            { field_label:'Product Link', field_type:'url',   field_order:1, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'product_link', is_dropdown_field:false },
            { field_label:'Image URL',    field_type:'image', field_order:2, is_required:false, is_searchable:false, show_on_invoice:false, show_on_purchase:false, column_name:'image_url', is_dropdown_field:false }
        ]
    }
};

// ── State ──────────────────────────────────────────────────
var _defs = [];
var _cfValues = {};
var _pickerIndustry = 'filters';
var _pickerFields = [];

function _db() { return window.StorageModule.supabase; }
async function _user() { return await window.StorageModule.getCurrentUser(); }
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _q(s)   { return '"'+String(s||'').replace(/"/g,'""')+'"'; }

// ── Load / Cache ───────────────────────────────────────────
async function loadForUser() {
    try {
        var u = await _user(); if (!u) return;
        
        // If offline, load from localStorage
        if (!navigator.onLine) {
            var cached = localStorage.getItem('cf_defs_' + u.id);
            if (cached) {
                _defs = JSON.parse(cached);
                window.log('✅ Custom field defs (cached):', _defs.length);
                return;
            }
            _defs = [];
            return;
        }
        
        // Online - fetch from Supabase
        var r = await _db().from('product_field_definitions').select('*').eq('user_id',u.id).order('field_order');
        if (r.error) throw r.error;
        _defs = r.data || [];
        
        // Cache for offline use
        try {
            localStorage.setItem('cf_defs_' + u.id, JSON.stringify(_defs));
        } catch(e) { /* ignore cache errors */ }
        
        window.log('✅ Custom field defs:', _defs.length);
    } catch(e) { logWarn('CF load error:', e.message); _defs = []; }
}

async function loadValuesForProducts(productIds) {
    if (!productIds || !productIds.length) return;
    try {
        var u = await _user(); if (!u) return;
        var eavDefs = _defs.filter(function(d){ return !d.column_name; });
        if (!eavDefs.length) return;
        
        // If offline, load ALL cached values (don't filter by productIds)
        if (!navigator.onLine) {
            var cached = localStorage.getItem('cf_values_' + u.id);
            if (cached) {
                _cfValues = JSON.parse(cached);
                window.log('✅ Custom field values (cached):', Object.keys(_cfValues).length, 'products');
                return;
            }
            _cfValues = {};
            window.log('⚠️ No cached custom field values found');
            return;
        }
        
        // Online - fetch from Supabase
        var r = await _db().from('product_field_values').select('product_id,field_def_id,value').eq('user_id',u.id).in('product_id',productIds);
        if (r.error) throw r.error;
        
        _cfValues = {};
        (r.data||[]).forEach(function(row){
            if (!_cfValues[row.product_id]) _cfValues[row.product_id] = {};
            _cfValues[row.product_id][row.field_def_id] = row.value;
        });
        
        // Cache for offline use
        try {
            var existing = localStorage.getItem('cf_values_' + u.id);
            var allValues = existing ? JSON.parse(existing) : {};
            Object.assign(allValues, _cfValues);
            localStorage.setItem('cf_values_' + u.id, JSON.stringify(allValues));
        } catch(e) { /* ignore cache errors */ }
        
        window.log('✅ Custom field values loaded:', Object.keys(_cfValues).length);
    } catch(e) { logWarn('CF values load error:', e.message); }
}

function getDefsForCategory(cat) {
    var c = (cat||'').toLowerCase().trim();
    return _defs.filter(function(d){ return !d.category_scope || d.category_scope.toLowerCase()===c; });
}

function getAllDefs() { return _defs; }

function getProductFieldValue(product, def) {
    if (!product || !def) return '';
    
    // For column-based fields, read directly from product
    if (def.column_name) {
        return product[def.column_name] || '';
    }
    
    // For EAV fields, read from _cfValues cache
    return (_cfValues[product.id]||{})[def.id] || '';
}

// NEW: Get dropdown fields (fields where is_dropdown_field=true)
function getDropdownFields() {
    return _defs.filter(function(d){ return d.is_dropdown_field === true; });
}

// ── Render field inputs in product form ────────────────────
function renderFieldInputs(category, productId, containerElement, productData) {
    if (!containerElement) return;
    var defs = getDefsForCategory(category);
    if (!defs.length) {
        containerElement.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;margin:0;">No custom fields set up. <a href="#" onclick="window.openCustomFieldsManager();return false;" style="color:var(--color-primary);">Configure fields</a></p>';
        return;
    }
    var html = defs.map(function(def){
        var val = '';
        if (productId && !def.column_name) {
            // EAV field - read from _cfValues
            val = (_cfValues[productId]||{})[def.id] || '';
        } else if (productData && def.column_name) {
            // Column-based field - read from product data
            val = productData[def.column_name] || '';
        }
        var req = def.is_required ? ' <span style="color:var(--color-danger);">*</span>' : '';
        var lbl = '<label class="form-label">'+_esc(def.field_label)+req+'</label>';
        var inp = '';
        var dataAttr = 'data-cf-def-id="'+def.id+'"';
        
        // Add dropdown field indicator
        var dropdownBadge = def.is_dropdown_field ? '<span style="background:rgba(0,200,83,0.1);color:var(--color-success);border:1px solid rgba(0,200,83,0.25);border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600;margin-left:6px;">DROPDOWN</span>' : '';
        lbl = '<label class="form-label">'+_esc(def.field_label)+req+dropdownBadge+'</label>';
        
        switch(def.field_type){
            case 'text': inp='<input type="text" class="form-control" '+dataAttr+' value="'+_esc(val)+'" placeholder="'+_esc(def.field_label)+'">'; break;
            case 'number': inp='<input type="number" step="any" class="form-control" '+dataAttr+' value="'+_esc(val)+'" placeholder="'+_esc(def.field_label)+'">'; break;
            case 'date': inp='<input type="date" class="form-control" '+dataAttr+' value="'+_esc(val)+'">'; break;
            case 'yes_no': {
                var checked = (val==='Yes'||val==='true'||val===true)?'checked':'';
                inp='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" '+dataAttr+' '+checked+'> <span style="color:var(--color-text-secondary);">Yes</span></label>';
                break;
            }
            case 'dropdown': {
                var opts = [];
                try{ if(def.options_json) opts=JSON.parse(def.options_json); }catch(e){}
                inp='<select class="form-control form-select" '+dataAttr+'><option value="">-- Select --</option>';
                opts.forEach(function(o){inp+='<option value="'+_esc(o)+'" '+(o===val?'selected':'')+'>'+_esc(o)+'</option>';});
                inp+='</select>';
                break;
            }
            case 'url': inp='<input type="url" class="form-control" '+dataAttr+' value="'+_esc(val)+'" placeholder="https://...">'; break;
            case 'image': inp='<input type="url" class="form-control" '+dataAttr+' value="'+_esc(val)+'" placeholder="Image URL (https://...)">'; break;
            default: inp='<input type="text" class="form-control" '+dataAttr+' value="'+_esc(val)+'" placeholder="'+_esc(def.field_label)+'">';
        }
        return '<div class="form-group">'+lbl+inp+'</div>';
    }).join('');
    containerElement.innerHTML = html;
}

// ── Read field values from form inputs ─────────────────────
function readFieldValues(containerElement) {
    if (!containerElement) return { columnUpdates: {}, eavValues: {} };
    var columnUpdates = {};
    var eavValues = {};
    
    containerElement.querySelectorAll('[data-cf-def-id]').forEach(function(inp){
        var defId = inp.getAttribute('data-cf-def-id');
        var def = _defs.find(function(d){return d.id===defId;});
        if (!def) return;
        
        var val = '';
        if (def.field_type==='yes_no') {
            val = inp.checked ? 'Yes' : 'No';
        } else {
            val = inp.value.trim();
        }
        
        // Separate column-based fields from EAV fields
        if (def.column_name) {
            columnUpdates[def.column_name] = val;
        } else {
            eavValues[defId] = val;
        }
    });
    
    return { columnUpdates: columnUpdates, eavValues: eavValues };
}
// ── Save EAV values ────────────────────────────────────────
async function saveEavValues(productId, fieldValues) {
    try {
        var u = await _user(); if (!u) return false;
        // Delete old EAV values for this product
        await _db().from('product_field_values').delete().eq('user_id',u.id).eq('product_id',productId);
        // Insert new values
        var rows = [];
        for (var defId in fieldValues) {
            var val = fieldValues[defId];
            if (!val) continue;
            rows.push({user_id:u.id, product_id:productId, field_def_id:defId, value:val});
        }
        if (rows.length) {
            var r = await _db().from('product_field_values').insert(rows);
            if (r.error) throw r.error;
        }
        return true;
    } catch(e) {
        logError('saveEavValues error:',e); return false;
    }
}

// ── Search: get products matching custom field queries ─────
async function getProductIdsMatchingSearch(query) {
    try {
        var u = await _user(); if (!u) return new Set();
        var q = (query||'').toLowerCase().trim();
        if (!q) return new Set();
        var searchable = _defs.filter(function(d){return d.is_searchable && !d.column_name;});
        if (!searchable.length) return new Set();
        var defIds = searchable.map(function(d){return d.id;});
        
        var allValues = [];
        
        // If offline, search in cached values
        if (!navigator.onLine) {
            var cached = localStorage.getItem('cf_values_' + u.id);
            if (cached) {
                var cachedData = JSON.parse(cached);
                Object.keys(cachedData).forEach(function(productId) {
                    Object.keys(cachedData[productId]).forEach(function(fieldDefId) {
                        if (defIds.includes(fieldDefId)) {
                            var value = cachedData[productId][fieldDefId] || '';
                            if (value.toLowerCase().includes(q)) {
                                allValues.push({product_id: productId});
                            }
                        }
                    });
                });
            }
        } else {
            // Online - query Supabase
            var r = await _db().from('product_field_values')
                .select('product_id')
                .eq('user_id',u.id)
                .in('field_def_id',defIds)
                .ilike('value','%'+q+'%');
            if (r.error) throw r.error;
            allValues = r.data || [];
        }
        
        var pids = allValues.map(function(row){return row.product_id;});
        return new Set(pids);
    } catch(e) {
        logWarn('CF search error:',e.message); 
        return new Set();
    }
}

// ── Invoice field rows ──────────────────────────────────────
function getInvoiceFieldRows(productId) {
    var rows = [];
    var invoiceDefs = _defs.filter(function(d){ return d.show_on_invoice; });
    invoiceDefs.forEach(function(def){
        var val = '';
        if (def.column_name) {
            // Legacy direct — not handled here
        } else {
            val = (_cfValues[productId]||{})[def.id] || '';
        }
        if (val) rows.push({label:def.field_label, value:val});
    });
    return rows;
}

// ── Import/Export ───────────────────────────────────────────
function getCategoriesFromProducts(products) {
    var cats = {};
    products.forEach(function(p){ cats[p.category||''] = true; });
    return Object.keys(cats).filter(Boolean);
}

function getExportHeaders(category) {
    var defs = getDefsForCategory(category);
    
    // System fields
    var systemHeaders = [
        'name',
        'category',
        'purchase_price',
        'sell_price',
        'stock',
        'reorder_threshold',
        'image_url',
        'product_link',
        'brand_name',
        'brand_bg_color',
        'brand_text_color'
    ];
    
    // Add column-based custom fields (size, thread, cabin, etc.)
    var columnFields = defs.filter(function(d){ return d.column_name; });
    columnFields.forEach(function(d){
        if (systemHeaders.indexOf(d.column_name) === -1) {
            systemHeaders.push(d.column_name);
        }
    });
    
    // Add EAV custom field labels
    var eavFields = defs.filter(function(d){ return !d.column_name; });
    var customHeaders = eavFields.map(function(d){ return d.field_label; });
    
    return systemHeaders.concat(customHeaders);
}

function getExportRow(product) {
    if (!product) return [];
    
    var category = product.category || '';
    var defs = getDefsForCategory(category);
    
    // System field values
    var systemValues = [
        product.name || '',
        product.category || '',
        product.purchase_price || '0',
        product.sell_price || '0',
        product.stock || '0',
        product.reorder_threshold || '10',
        product.image_url || '',
        product.product_link || '',
        product.brand_name || '',
        product.brand_bg_color || '',
        product.brand_text_color || ''
    ];
    
    // Add column-based custom field values
    var columnFields = defs.filter(function(d){ return d.column_name; });
    columnFields.forEach(function(d){
        var columnName = d.column_name;
        // Check if not already in system values to avoid duplicates
        if (['name','category','purchase_price','sell_price','stock','reorder_threshold','image_url','product_link','brand_name','brand_bg_color','brand_text_color'].indexOf(columnName) === -1) {
            systemValues.push(product[columnName] || '');
        }
    });
    
    // Add EAV custom field values
    var eavFields = defs.filter(function(d){ return !d.column_name; });
    var customValues = eavFields.map(function(d){
        return (_cfValues[product.id]||{})[d.id] || '';
    });
    
    return systemValues.concat(customValues).map(_q).join(',');
}

function downloadTemplate(category) {
    var defs = getDefsForCategory(category);
    
    // System fields that should be in every template
    var systemHeaders = [
        'name',
        'category',
        'purchase_price',
        'sell_price',
        'stock',
        'reorder_threshold',
        'image_url',
        'product_link',
        'brand_name',
        'brand_bg_color',
        'brand_text_color'
    ];
    
    // Add column-based custom fields (size, thread, cabin, etc.)
    var columnFields = defs.filter(function(d){ return d.column_name; });
    columnFields.forEach(function(d){
        if (systemHeaders.indexOf(d.column_name) === -1) {
            systemHeaders.push(d.column_name);
        }
    });
    
    // Add EAV custom fields
    var eavFields = defs.filter(function(d){ return !d.column_name; });
    var customHeaders = eavFields.map(function(d){ return d.field_label; });
    
    var headers = systemHeaders.concat(customHeaders);
    var csv = headers.map(_q).join(',')+'\n';
    var blob = new Blob([csv],{type:'text/csv'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'import_template_'+(category||'all')+'.csv';
    a.click();
}

function parseImportRow(rowData, category) {
    var defs = getDefsForCategory(category);
    var eavValues = {};
    var columnUpdates = {};
    
    // Helper function to find value case-insensitively
    function findValue(keys) {
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            // Try exact match first
            if (rowData[key]) return rowData[key];
            // Try lowercase match
            var lowerKey = (key || '').toLowerCase();
            for (var dataKey in rowData) {
                if (dataKey.toLowerCase() === lowerKey) {
                    return rowData[dataKey];
                }
            }
        }
        return '';
    }
    
    // Parse system fields
    var base = {
        name: findValue(['name', 'Product Name']),
        category: findValue(['category', 'Category']) || category,
        purchase_price: parseFloat(findValue(['purchase_price', 'Purchase Price'])) || 0,
        sell_price: parseFloat(findValue(['sell_price', 'Sell Price'])) || 0,
        stock: parseInt(findValue(['stock', 'Stock'])) || 0,
        reorder_threshold: parseInt(findValue(['reorder_threshold'])) || 10,
        image_url: findValue(['image_url']) || null,
        product_link: findValue(['product_link']) || null,
        brand_name: findValue(['brand_name']) || null,
        brand_bg_color: findValue(['brand_bg_color']) || '#6366f1',
        brand_text_color: findValue(['brand_text_color']) || '#ffffff'
    };
    
    // Parse column-based custom fields and EAV fields
    defs.forEach(function(d){
        if (d.column_name) {
            // Column-based field (e.g., size, thread, cabin, machine)
            var val = findValue([d.column_name, d.field_label]);
            if (val) columnUpdates[d.column_name] = val;
        } else {
            // EAV fields
            var val = findValue([d.field_label]);
            if (val) eavValues[d.id] = val;
        }
    });
    
    return {base:base, columnUpdates:columnUpdates, eavValues:eavValues};
}

// ── Industry Picker / Field Manager ─────────────────────────
function openIndustryPicker(fromSettings) {
    var modal = document.getElementById('industry-picker-modal');
    if (!modal) return;
    
    var title = fromSettings 
        ? 'Change Industry Template / Reset Fields'
        : 'Set Up Your Product Fields';
    var titleEl = document.getElementById('picker-modal-title');
    if (titleEl) titleEl.textContent = title;
    
    _pickerIndustry = 'filters';
    _pickerFields = JSON.parse(JSON.stringify(PRESETS.filters.fields));
    _renderIndustryCards();
    _renderFieldsPreview();
    modal.classList.add('active');
}

function closeIndustryPicker() {
    var modal = document.getElementById('industry-picker-modal');
    if (modal) modal.classList.remove('active');
}

function _renderIndustryCards() {
    var el = document.getElementById('picker-industry-cards');
    if (!el) return;
    var html = Object.keys(PRESETS).map(function(key){
        var p = PRESETS[key];
        var active = (key===_pickerIndustry) ? ' industry-card-active' : '';
        return '<div class="industry-card'+active+'" onclick="window.CustomFieldsModule._selectIndustry(\''+key+'\')"><div class="industry-card-icon">'+p.label.split(' ')[0]+'</div><div class="industry-card-title">'+p.label.split(' ').slice(1).join(' ')+'</div><div class="industry-card-desc">'+_esc(p.description)+'</div></div>';
    }).join('');
    el.innerHTML = html;
}

function _renderFieldsPreview() {
    var el = document.getElementById('picker-fields-preview');
    if (!el) return;
    
    var dropdownCount = _pickerFields.filter(function(f){return f.is_dropdown_field;}).length;
    
    var html = '<p style="font-size:13px;color:var(--color-text-muted);margin:0 0 12px;">These fields will be added to all products:</p>';
    html += '<div style="background:var(--color-elevated);border-radius:10px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:10px;">📋 Fields Preview</div>';
    
    _pickerFields.forEach(function(f, idx){
        var icons = {text:'📝',number:'🔢',date:'📅',dropdown:'📋',yes_no:'✅',url:'🔗',image:'🖼️'};
        var icon = icons[f.field_type] || '📝';
        var badges = '';
        if (f.show_on_invoice) badges += '<span class="field-badge">Invoice</span>';
        if (f.is_searchable) badges += '<span class="field-badge">Searchable</span>';
        if (f.is_dropdown_field) badges += '<span class="field-badge-dropdown">Dropdown</span>';
        
        html += '<div class="field-preview-row">';
        html += '<span class="field-icon">'+icon+'</span>';
        html += '<span class="field-name">'+_esc(f.field_label)+'</span>';
        html += '<div class="field-badges">'+badges+'</div>';
        html += '<div style="display:flex;gap:4px;">';
        
        // Dropdown toggle button
        var isDropdown = f.is_dropdown_field;
        var dropdownBtnClass = isDropdown ? 'field-action-btn-active' : 'field-action-btn';
        var dropdownDisabled = (!isDropdown && dropdownCount >= 2) ? ' disabled' : '';
        html += '<button class="'+dropdownBtnClass+'"'+dropdownDisabled+' onclick="window.CustomFieldsModule._toggleDropdownField('+idx+')" title="Use as dropdown in Quick Sale">⬇️</button>';
        
        html += '<button class="field-action-btn" onclick="window.CustomFieldsModule._editField('+idx+')" title="Edit">✏️</button>';
        html += '<button class="field-action-btn" onclick="window.CustomFieldsModule._deleteField('+idx+')" title="Delete">🗑️</button>';
        html += '</div></div>';
    });
    
    html += '</div>';
    
    // Dropdown field info
    if (dropdownCount > 0) {
        html += '<div style="background:rgba(0,200,83,0.08);border:1px solid rgba(0,200,83,0.25);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--color-text-secondary);">';
        html += '<div style="font-weight:600;margin-bottom:4px;">⬇️ Dropdown Fields ('+dropdownCount+'/2)</div>';
        html += 'These fields will show autocomplete dropdowns in Quick Sale, allowing you to type and save values that appear for future products.';
        html += '</div>';
    }
    
    // Add field button (max 10 total)
    if (_pickerFields.length < 10) {
        html += '<button class="btn btn-secondary" style="width:100%;border-style:dashed;" onclick="window.CustomFieldsModule._addNewFieldToPicker()">+ Add Custom Field</button>';
    } else {
        html += '<p style="font-size:12px;color:var(--color-text-muted);text-align:center;margin:8px 0;">Maximum 10 fields reached</p>';
    }
    
    el.innerHTML = html;
}

// NEW: Toggle dropdown field
window.CustomFieldsModule = window.CustomFieldsModule || {};
window.CustomFieldsModule._toggleDropdownField = function(idx) {
    var f = _pickerFields[idx];
    var currentDropdownCount = _pickerFields.filter(function(field){return field.is_dropdown_field;}).length;
    
    if (!f.is_dropdown_field) {
        // Trying to enable
        if (currentDropdownCount >= 2) {
            window.Utils.showToast('Maximum 2 dropdown fields allowed', 'warning');
            return;
        }
        f.is_dropdown_field = true;
    } else {
        // Disable
        f.is_dropdown_field = false;
    }
    _renderFieldsPreview();
};

window.CustomFieldsModule._selectIndustry = function(key) {
    _pickerIndustry = key;
    _pickerFields = JSON.parse(JSON.stringify(PRESETS[key].fields));
    _renderIndustryCards();
    _renderFieldsPreview();
};

window.CustomFieldsModule._editField = function(idx) {
    var f = _pickerFields[idx];
    var newLabel = prompt('Field label:', f.field_label);
    if (!newLabel || newLabel===f.field_label) return;
    f.field_label = newLabel.trim();
    _renderFieldsPreview();
};

window.CustomFieldsModule._deleteField = function(idx) {
    if (!confirm('Delete this field?')) return;
    _pickerFields.splice(idx, 1);
    _renderFieldsPreview();
};

window.CustomFieldsModule._addNewFieldToPicker = function() {
    if (_pickerFields.length >= 10) {
        window.showNotification&&window.showNotification('Max 10 fields','error');
        return;
    }
    var label = prompt('New field name:');
    if (!label) return;
    _pickerFields.push({
        field_label: label.trim(),
        field_type: 'text',
        field_order: _pickerFields.length + 1,
        is_required: false,
        is_searchable: true,
        show_on_invoice: false,
        show_on_purchase: true,
        column_name: null,
        is_dropdown_field: false
    });
    _renderFieldsPreview();
};

window.CustomFieldsModule.applySelectedIndustry = async function() {
    var btn = document.getElementById('picker-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying...'; }
    try {
        var u = await _user(); if (!u) throw new Error('Not logged in');
        await _db().from('product_field_definitions').delete().eq('user_id',u.id);
        _defs = []; _cfValues = {};
        var rows = _pickerFields.map(function(f,i){ return Object.assign({},f,{user_id:u.id,field_order:i+1}); });
        var r = await _db().from('product_field_definitions').insert(rows).select();
        if (r.error) throw r.error;
        _defs = (r.data||[]).sort(function(a,b){return a.field_order-b.field_order;});
        closeIndustryPicker();
        window.showNotification&&window.showNotification('Product fields saved! ✅','success');
        _renderSettingsFieldsSummary();
        window.ProductsModule&&window.ProductsModule.loadProducts();
    } catch(e) {
        window.showNotification&&window.showNotification('Error: '+e.message,'error');
    } finally {
        if (btn) { btn.disabled=false; btn.textContent='Apply These Fields →'; }
    }
};

// ── Settings Field Summary ─────────────────────────────────
function _renderSettingsFieldsSummary() {
    var el = document.getElementById('settings-fields-summary');
    if (!el) return;
    if (!_defs.length) { el.innerHTML='<p style="color:var(--color-text-muted);font-size:13px;margin:0 0 8px;">No fields set up yet. Click "Change Industry" below.</p>'; return; }
    var icons = {text:'📝',number:'🔢',date:'📅',dropdown:'📋',yes_no:'✅',url:'🔗',image:'🖼️'};
    el.innerHTML = '<div class="settings-fields-list">'
        +_defs.map(function(d){
            var dropdownBadge = d.is_dropdown_field ? '<span class="settings-field-badge-dropdown">Dropdown</span>' : '';
            return '<div class="settings-field-row">'
                +'<span>'+( icons[d.field_type]||'📝')+'</span>'
                +'<span class="settings-field-name">'+_esc(d.field_label)+'</span>'
                +(d.show_on_invoice?'<span class="settings-field-badge">Invoice</span>':'')
                +dropdownBadge
                +'<div style="margin-left:auto;display:flex;gap:5px;">'
                +'<button class="settings-field-btn" onclick="window.CustomFieldsModule._editDefDialog(\''+d.id+'\')">Edit</button>'
                +'<button class="settings-field-btn danger" onclick="window.CustomFieldsModule._delDef(\''+d.id+'\',\''+_esc(d.field_label)+'\')">×</button>'
                +'</div></div>';
        }).join('')+'</div>';
}

// UPDATED: Edit with full dialog
window.CustomFieldsModule._editDefDialog = function(id) {
    var def = _defs.find(function(d){return d.id===id;}); 
    if (!def) return;
    
    var currentDropdownCount = _defs.filter(function(d){return d.is_dropdown_field && d.id !== id;}).length;
    
    var modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '99999';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header">
                <h2 class="modal-title">✏️ Edit Field</h2>
                <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Field Label</label>
                    <input type="text" id="edit-field-label" class="form-control" value="${_esc(def.field_label)}">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select id="edit-field-type" class="form-control form-select">
                        <option value="text" ${def.field_type==='text'?'selected':''}>Text</option>
                        <option value="number" ${def.field_type==='number'?'selected':''}>Number</option>
                        <option value="date" ${def.field_type==='date'?'selected':''}>Date</option>
                        <option value="dropdown" ${def.field_type==='dropdown'?'selected':''}>Dropdown</option>
                        <option value="yes_no" ${def.field_type==='yes_no'?'selected':''}>Yes/No</option>
                        <option value="url" ${def.field_type==='url'?'selected':''}>URL</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="edit-field-searchable" ${def.is_searchable?'checked':''}>
                        <span>Searchable</span>
                    </label>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="edit-field-invoice" ${def.show_on_invoice?'checked':''}>
                        <span>Show on Invoice</span>
                    </label>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="edit-field-dropdown" ${def.is_dropdown_field?'checked':''} ${currentDropdownCount>=2 && !def.is_dropdown_field?'disabled':''}>
                        <span>Use as Dropdown Field in Quick Sale ${currentDropdownCount>=2 && !def.is_dropdown_field?'(Max 2 reached)':''}</span>
                    </label>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="window.CustomFieldsModule._saveEditedDef('${id}')">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.CustomFieldsModule._saveEditedDef = async function(id) {
    var label = document.getElementById('edit-field-label')?.value?.trim();
    var type = document.getElementById('edit-field-type')?.value;
    var searchable = document.getElementById('edit-field-searchable')?.checked;
    var invoice = document.getElementById('edit-field-invoice')?.checked;
    var isDropdown = document.getElementById('edit-field-dropdown')?.checked;
    
    if (!label) {
        window.Utils.showToast('Field label required', 'error');
        return;
    }
    
    var updates = {
        field_label: label,
        field_type: type,
        is_searchable: searchable,
        show_on_invoice: invoice,
        is_dropdown_field: isDropdown
    };
    
    var ok = await updateFieldDef(id, updates);
    if (ok) {
        window.Utils.showToast('Field updated!', 'success');
        _renderSettingsFieldsSummary();
        document.querySelector('.modal-overlay.active')?.remove();
    }
};

window.CustomFieldsModule._delDef = function(id, label) {
    if(!confirm('Delete "'+label+'"? All stored values will also be removed.')) return;
    deleteFieldDef(id).then(function(ok){
        if(ok){window.showNotification&&window.showNotification('Deleted','success');_renderSettingsFieldsSummary();}
    });
};

window.CustomFieldsModule.saveNewFieldFromSettings = async function() {
    var label = (document.getElementById('settings-new-field-label')||{}).value||'';
    label = label.trim();
    var type = (document.getElementById('settings-new-field-type')||{}).value||'text';
    var inv  = !!(document.getElementById('settings-new-field-invoice')||{}).checked;
    if (!label) { window.showNotification&&window.showNotification('Enter a field name','error'); return; }
    var maxOrder = _defs.reduce(function(m,d){return Math.max(m,d.field_order);},0);
    var def = await addFieldDef({field_label:label,field_type:type,field_order:maxOrder+1,
        category_scope:null,is_required:false,is_searchable:true,
        show_on_invoice:inv,show_on_purchase:true,column_name:null,is_dropdown_field:false});
    if (def) {
        var inp = document.getElementById('settings-new-field-label'); if(inp) inp.value='';
        window.showNotification&&window.showNotification('Field added!','success');
        _renderSettingsFieldsSummary();
    }
};

// ── CRUD for field defs ────────────────────────────────────
async function addFieldDef(defData) {
    var u = await _user(); if (!u) return null;
    if (_defs.filter(function(d){return !d.column_name;}).length >= 10) {
        window.showNotification&&window.showNotification('Max 10 custom fields','error'); return null;
    }
    var r = await _db().from('product_field_definitions').insert(Object.assign({},defData,{user_id:u.id})).select().single();
    if (r.error) { logError(r.error); return null; }
    _defs.push(r.data);
    _defs.sort(function(a,b){return a.field_order-b.field_order;});
    return r.data;
}
async function updateFieldDef(id, updates) {
    var r = await _db().from('product_field_definitions').update(updates).eq('id',id);
    if (r.error) return false;
    var idx = _defs.findIndex(function(d){return d.id===id;});
    if (idx!==-1) Object.assign(_defs[idx],updates);
    return true;
}
async function deleteFieldDef(id) {
    var r = await _db().from('product_field_definitions').delete().eq('id',id);
    if (r.error) return false;
    _defs = _defs.filter(function(d){return d.id!==id;});
    return true;
}

// ── Expose ─────────────────────────────────────────────────
window.CustomFieldsModule = Object.assign(window.CustomFieldsModule, {
    loadForUser, loadValuesForProducts,
    getDefsForCategory, getAllDefs, getProductFieldValue, getDropdownFields,
    renderFieldInputs, readFieldValues, saveEavValues,
    getProductIdsMatchingSearch, getInvoiceFieldRows,
    getCategoriesFromProducts, getExportHeaders, getExportRow,
    downloadTemplate, parseImportRow,
    openIndustryPicker, closeIndustryPicker,
    renderSettingsFieldsSummary: function(){ _renderSettingsFieldsSummary(); },
    PRESETS: PRESETS,
    // Called from onboarding step 2 - UPDATED to support 5 fields
    saveOnboardingFields: async function(fields) {
        for (var i = 0; i < fields.length && i < 5; i++) {
            var label = fields[i].label.trim();
            if (!label) continue;
            await addFieldDef({
                field_label:  label,
                field_type:   'text',
                field_order:  i + 1,
                show_on_invoice: false,
                is_searchable: true,
                show_on_purchase: true,
                is_required:     false,
                column_name:  null,
                category_scope:     null,
                is_dropdown_field: fields[i].is_dropdown || false
            });
        }
        return true;
    }
});

window.log('✅ CustomFieldsModule loaded (UPDATED: 5-field limit, dropdown selection)');
})();