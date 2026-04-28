(function() {
/* ==========================================
   MODULE SCOPE: All internal functions are scoped to this IIFE.
   Only window.ExpensesModule exports are accessible globally.
   ========================================== */

/* ==========================================
   JS START: Expenses Module
   Full CRUD expense tracking with categories,
   filters, summary stats, and reports integration.
   ========================================== */

// ===== STATE =====
let expensesData = [];
let filteredExpenses = [];
let editingExpenseId = null;
let deletingExpenseId = null;
let pendingReceiptFile = null;
let existingReceiptUrl = null;

window.handleReceiptFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    pendingReceiptFile = file;
    const label = document.getElementById('receipt-upload-label');
    const thumb = document.getElementById('receipt-preview-thumb');
    if (label) label.textContent = file.name;
    if (thumb && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { thumb.src = e.target.result; thumb.style.display = 'block'; };
        reader.readAsDataURL(file);
    } else if (thumb) {
        thumb.style.display = 'none';
    }
};

window.clearExpenseReceipt = function() {
    pendingReceiptFile = null;
    existingReceiptUrl = null;
    const label = document.getElementById('receipt-upload-label');
    const thumb  = document.getElementById('receipt-preview-thumb');
    const row    = document.getElementById('existing-receipt-row');
    const input  = document.getElementById('expense-receipt-input');
    if (label) label.textContent = 'Click to attach photo or PDF of receipt';
    if (thumb) { thumb.style.display = 'none'; thumb.src = ''; }
    if (row)   row.style.display = 'none';
    if (input) input.value = '';
};

// ===== EXPENSE CATEGORIES =====
const EXPENSE_CATEGORIES = [
    { value: 'rent',          label: '🏢 Rent',              color: 'primary' },
    { value: 'utilities',     label: '💡 Utilities',          color: 'warning' },
    { value: 'salaries',      label: '👷 Salaries',           color: 'success' },
    { value: 'transport',     label: '🚗 Transport',          color: 'info'    },
    { value: 'marketing',     label: '📢 Marketing',          color: 'accent'  },
    { value: 'maintenance',   label: '🔧 Maintenance',        color: 'warning' },
    { value: 'office',        label: '🖊️ Office Supplies',    color: 'info'    },
    { value: 'insurance',     label: '🛡️ Insurance',          color: 'success' },
    { value: 'taxes',         label: '🏛️ Taxes & Govt Fees',  color: 'danger'  },
    { value: 'bank_charges',  label: '🏦 Bank Charges',       color: 'danger'  },
    { value: 'miscellaneous', label: '📋 Miscellaneous',      color: 'accent'  },
    { value: 'other',         label: '💼 Other',              color: 'primary' },
];

// ===== DOM ELEMENTS =====
const expensesSearch       = document.getElementById('expenses-search');
const expensesCategoryFilter = document.getElementById('expenses-category-filter');
const expensesDateFrom     = document.getElementById('expenses-date-from');
const expensesDateTo       = document.getElementById('expenses-date-to');
const applyExpensesFilter  = document.getElementById('apply-expenses-filter');
const clearExpensesFilter  = document.getElementById('clear-expenses-filter');
const expensesTableBody    = document.getElementById('expenses-table-body');

// Summary stats
const expensesTotalAmount  = document.getElementById('expenses-total-amount');
const expensesTodayAmount  = document.getElementById('expenses-today-amount');
const expensesMonthAmount  = document.getElementById('expenses-month-amount');
const expensesTopCategory  = document.getElementById('expenses-top-category');

// Modal
const addExpenseBtn        = document.getElementById('add-expense-btn');
const expenseFormModal     = document.getElementById('expense-form-modal');
const closeExpenseFormModal= document.getElementById('close-expense-form-modal');
const cancelExpenseFormBtn = document.getElementById('cancel-expense-form-btn');
const expenseFormTitle     = document.getElementById('expense-form-title');
const expenseForm          = document.getElementById('expense-form');

// Form fields
const expenseDate          = document.getElementById('expense-date');
const expenseCategory      = document.getElementById('expense-category');
const expenseDescription   = document.getElementById('expense-description');
const expenseAmount        = document.getElementById('expense-amount');
const expensePaymentMethod = document.getElementById('expense-payment-method');
const expenseReferenceNo   = document.getElementById('expense-reference-no');
const expenseNotes         = document.getElementById('expense-notes');

// Delete modal
const deleteExpenseModal   = document.getElementById('delete-expense-modal');
const closeDeleteExpenseModal = document.getElementById('close-delete-expense-modal');
const cancelDeleteExpenseBtn  = document.getElementById('cancel-delete-expense-btn');
const confirmDeleteExpenseBtn = document.getElementById('confirm-delete-expense-btn');
const deleteExpenseDesc    = document.getElementById('delete-expense-desc');

// ===== HELPERS =====
// Use centralized formatter
const fmt = window.Utils.fmt;

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCategoryInfo(value) {
    return EXPENSE_CATEGORIES.find(c => c.value === value) || { label: value, color: 'primary' };
}

// ===== NOTIFICATION =====
function showExpenseNotification(message, type = 'success') {
    // Reuse existing notification system if available
    if (window.showNotification) {
        window.showNotification(message, type);
        return;
    }
    // Fallback
    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:1.5rem;right:1.5rem;z-index:9999;padding:1rem 1.5rem;border-radius:12px;font-weight:600;color:#fff;background:${type==='error'?'#FF1744':type==='warning'?'#FFB300':'#00C853'};box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideIn .3s ease`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3500);
}

// ===== LOAD EXPENSES =====
async function loadExpenses() {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return;

        const result = await window.StorageModule.getAllData('expenses');
        if (result.success) {
            expensesData = result.data || [];
            applyFilters();
        } else {
            showExpenseNotification('Failed to load expenses', 'error');
        }
    } catch (err) {
        logError('❌ Error loading expenses:', err);
        showExpenseNotification('Error loading expenses', 'error');
    }
}

// ===== APPLY FILTERS =====
function applyFilters() {
    const searchVal  = (expensesSearch?.value || '').toLowerCase().trim();
    const catVal     = expensesCategoryFilter?.value || '';
    const dateFrom   = expensesDateFrom?.value || '';
    const dateTo     = expensesDateTo?.value || '';

    filteredExpenses = expensesData.filter(exp => {
        const matchSearch = !searchVal ||
            (exp.description || '').toLowerCase().includes(searchVal) ||
            (exp.category    || '').toLowerCase().includes(searchVal) ||
            (exp.notes       || '').toLowerCase().includes(searchVal) ||
            (exp.reference_no|| '').toLowerCase().includes(searchVal);

        const matchCat  = !catVal || exp.category === catVal;
        const matchFrom = !dateFrom || exp.date >= dateFrom;
        const matchTo   = !dateTo   || exp.date <= dateTo;

        return matchSearch && matchCat && matchFrom && matchTo;
    });

    renderExpenses();
    updateSummaryStats();
}

// ===== RENDER TABLE =====
function renderExpenses() {
    if (!expensesTableBody) return;

    if (filteredExpenses.length === 0) {
        expensesTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:3rem;color:var(--color-text-muted);">
                    <div style="font-size:3rem;margin-bottom:1rem;">💸</div>
                    <div style="font-size:1.1rem;font-weight:600;">No expenses found</div>
                    <div style="font-size:0.9rem;margin-top:0.5rem;">Click "Add Expense" to record your first expense</div>
                </td>
            </tr>`;
        return;
    }

    expensesTableBody.innerHTML = filteredExpenses.map(exp => {
        const cat   = getCategoryInfo(exp.category);
        const pmMap = {
            cash: '💵 Cash', bank_transfer: '🏦 Bank Transfer',
            cheque: '📋 Cheque', credit_card: '💳 Credit Card',
            mobile_payment: '📱 Mobile Payment', other: '💰 Other'
        };
        const pm = pmMap[exp.payment_method] || exp.payment_method || '—';

        return `
        <tr>
            <td><span class="expense-date-badge">${formatDate(exp.date)}</span></td>
            <td><span class="expense-category-badge expense-cat-${cat.color}">${cat.label}</span></td>
            <td>
                <div class="expense-desc-cell">
                    <span class="expense-desc-text">${exp.description || '—'}</span>
                    ${exp.notes ? `<span class="expense-notes-text">${exp.notes}</span>` : ''}
                </div>
            </td>
            <td><span class="expense-amount-value">${fmt(exp.amount)}</span></td>
            <td><span class="expense-pm-text">${pm}</span></td>
            <td><span class="expense-ref-text">${exp.reference_no || '—'}</span></td>
            <td style="text-align:center;">
                ${exp.receipt_url
                    ? `<a href="${exp.receipt_url}" target="_blank" class="receipt-icon-btn" title="View Receipt">📎</a>`
                    : '<span style="color:var(--color-text-muted);font-size:0.75rem;">—</span>'}
            </td>
            <td style="white-space:nowrap;">
                <button class="expense-action-btn edit-btn"onclick="window.ExpensesModule.openEditExpense('${exp.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                </button>
                <button class="expense-action-btn delete-btn" onclick="window.ExpensesModule.openDeleteExpense('${exp.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ===== UPDATE SUMMARY STATS =====
function updateSummaryStats() {
    const total = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    const todayStr = todayISO();
    const todayTotal = filteredExpenses
        .filter(e => e.date === todayStr)
        .reduce((s, e) => s + (e.amount || 0), 0);

    const now = new Date();
    const monthTotal = filteredExpenses
        .filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
        .reduce((s, e) => s + (e.amount || 0), 0);

    // Top category
    const catTotals = {};
    filteredExpenses.forEach(e => {
        catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
    });
    const topCatKey = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
    const topCatInfo = topCatKey ? getCategoryInfo(topCatKey) : null;

    if (expensesTotalAmount)  expensesTotalAmount.textContent  = fmt(total);
    if (expensesTodayAmount)  expensesTodayAmount.textContent  = fmt(todayTotal);
    if (expensesMonthAmount)  expensesMonthAmount.textContent  = fmt(monthTotal);
    if (expensesTopCategory)  expensesTopCategory.textContent  = topCatInfo ? topCatInfo.label : '—';
}

// ===== OPEN ADD MODAL =====
function openAddExpense() {
    editingExpenseId = null;
    pendingReceiptFile = null;
    existingReceiptUrl = null;
    if (expenseFormTitle) expenseFormTitle.textContent = '➕ Add Expense';
    if (expenseForm) expenseForm.reset();
    if (expenseDate) expenseDate.value = todayISO();
    window.clearExpenseReceipt();
    if (expenseFormModal) expenseFormModal.classList.add('active');
}

// ===== OPEN EDIT MODAL =====
window.ExpensesModule = window.ExpensesModule || {};
window.ExpensesModule.openEditExpense = function(id) {
    const exp = expensesData.find(e => e.id === id);
    if (!exp) return;

    editingExpenseId = id;
    if (expenseFormTitle)     expenseFormTitle.textContent     = '✏️ Edit Expense';
    if (expenseDate)          expenseDate.value          = exp.date || '';
    if (expenseCategory)      expenseCategory.value      = exp.category || '';
    if (expenseDescription)   expenseDescription.value   = exp.description || '';
    if (expenseAmount)        expenseAmount.value        = exp.amount || '';
    if (expensePaymentMethod) expensePaymentMethod.value = exp.payment_method || '';
    if (expenseReferenceNo)   expenseReferenceNo.value   = exp.reference_no || '';
    if (expenseNotes)         expenseNotes.value         = exp.notes || '';
    // Load existing receipt
    pendingReceiptFile = null;
    existingReceiptUrl = exp.receipt_url || null;
    window.clearExpenseReceipt();
    if (existingReceiptUrl) {
        const row  = document.getElementById('existing-receipt-row');
        const link = document.getElementById('existing-receipt-link');
        if (row)  row.style.display  = 'block';
        if (link) link.href = existingReceiptUrl;
    }
    if (expenseFormModal)     expenseFormModal.classList.add('active');
};

// ===== OPEN DELETE MODAL =====
window.ExpensesModule.openDeleteExpense = function(id) {
    const exp = expensesData.find(e => e.id === id);
    if (!exp) return;
    deletingExpenseId = id;
    if (deleteExpenseDesc) deleteExpenseDesc.textContent = exp.description || 'this expense';
    if (deleteExpenseModal) deleteExpenseModal.classList.add('active');
};

// ===== SAVE EXPENSE =====
async function saveExpense(e) {
    e.preventDefault();

    // Disable submit button early
    const submitBtn = expenseForm?.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    // Upload receipt if one was selected
    let receiptUrl = existingReceiptUrl || null;
    if (pendingReceiptFile) {
        console.log('📎 Uploading receipt file:', pendingReceiptFile.name);
        
        // Check if uploadReceipt function exists
        if (!window.StorageModule?.uploadReceipt) {
            showExpenseNotification('Receipt upload not available - storage module not loaded', 'error');
            console.error('❌ StorageModule.uploadReceipt not found');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        
        const uploadRes = await window.StorageModule.uploadReceipt(pendingReceiptFile);
        console.log('📎 Upload response:', uploadRes);
        
        if (uploadRes && uploadRes.success && uploadRes.url) {
            receiptUrl = uploadRes.url;
            console.log('✅ Receipt uploaded successfully:', receiptUrl);
        } else {
            const errorMsg = uploadRes?.error?.message || uploadRes?.error || 'Unknown error';
            showExpenseNotification('Failed to upload receipt: ' + errorMsg, 'error');
            console.error('❌ Receipt upload failed:', uploadRes);
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
    }
    if (existingReceiptUrl === null && !pendingReceiptFile) receiptUrl = null; // cleared

    const data = {
        date:           expenseDate?.value || todayISO(),
        category:       expenseCategory?.value || 'other',
        description:    expenseDescription?.value?.trim() || '',
        amount:         parseFloat(expenseAmount?.value) || 0,
        payment_method: expensePaymentMethod?.value || 'cash',
        reference_no:   expenseReferenceNo?.value?.trim() || '',
        notes:          expenseNotes?.value?.trim() || '',
        receipt_url:    receiptUrl,
    };

    if (!data.description) {
        showExpenseNotification('Please enter a description', 'error');
        return;
    }
    if (data.amount <= 0) {
        showExpenseNotification('Please enter a valid amount', 'error');
        return;
    }

    try {
        let result;
        if (editingExpenseId) {
            result = await window.StorageModule.updateData('expenses', editingExpenseId, data);
        } else {
            result = await window.StorageModule.saveData('expenses', data);
        }

        if (result.success) {
            showExpenseNotification(editingExpenseId ? 'Expense updated successfully' : 'Expense added successfully', 'success');
            if (expenseFormModal) expenseFormModal.classList.remove('active');
            await loadExpenses();
        } else {
            showExpenseNotification('Failed to save expense: ' + result.error, 'error');
        }
    } catch (err) {
        showExpenseNotification('Error saving expense', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ===== DELETE EXPENSE =====
async function confirmDeleteExpense() {
    if (!deletingExpenseId) return;
    if (confirmDeleteExpenseBtn) confirmDeleteExpenseBtn.disabled = true;

    try {
        const result = await window.StorageModule.deleteData('expenses', deletingExpenseId);
        if (result.success) {
            showExpenseNotification('Expense deleted', 'success');
            if (deleteExpenseModal) deleteExpenseModal.classList.remove('active');
            deletingExpenseId = null;
            await loadExpenses();
        } else {
            showExpenseNotification('Failed to delete expense', 'error');
        }
    } catch (err) {
        showExpenseNotification('Error deleting expense', 'error');
    } finally {
        if (confirmDeleteExpenseBtn) confirmDeleteExpenseBtn.disabled = false;
    }
}

// ===== POPULATE CATEGORY FILTER DROPDOWN =====
function populateCategoryFilter() {
    if (!expensesCategoryFilter) return;
    const existing = expensesCategoryFilter.querySelectorAll('option:not([value=""])');
    existing.forEach(o => o.remove());
    EXPENSE_CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat.label;
        expensesCategoryFilter.appendChild(opt);
    });
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
    // Add button
    addExpenseBtn?.addEventListener('click', openAddExpense);

    // Form submit
    expenseForm?.addEventListener('submit', saveExpense);

    // Close modals
    [closeExpenseFormModal, cancelExpenseFormBtn].forEach(el => {
        el?.addEventListener('click', () => expenseFormModal?.classList.remove('active'));
    });

    [closeDeleteExpenseModal, cancelDeleteExpenseBtn].forEach(el => {
        el?.addEventListener('click', () => deleteExpenseModal?.classList.remove('active'));
    });

    // Confirm delete
    confirmDeleteExpenseBtn?.addEventListener('click', confirmDeleteExpense);

    // Filter buttons
    applyExpensesFilter?.addEventListener('click', applyFilters);
    clearExpensesFilter?.addEventListener('click', () => {
        if (expensesSearch)        expensesSearch.value = '';
        if (expensesCategoryFilter) expensesCategoryFilter.value = '';
        if (expensesDateFrom)      expensesDateFrom.value = '';
        if (expensesDateTo)        expensesDateTo.value = '';
        applyFilters();
    });

    // Live search
    expensesSearch?.addEventListener('input', applyFilters);

    // Close modals on overlay click
    expenseFormModal?.addEventListener('click', e => {
        if (e.target === expenseFormModal) expenseFormModal.classList.remove('active');
    });
    deleteExpenseModal?.addEventListener('click', e => {
        if (e.target === deleteExpenseModal) deleteExpenseModal.classList.remove('active');
    });
}

// ===== INIT =====
function initExpensesPage() {
    populateCategoryFilter();
    loadExpenses();
}

// ===== GLOBAL EXPORT =====
window.ExpensesModule = {
    initExpensesPage,
    loadExpenses,
    openEditExpense: window.ExpensesModule.openEditExpense,
    openDeleteExpense: window.ExpensesModule.openDeleteExpense,
};

// Wire up event listeners immediately (DOM is ready)
initEventListeners();

window.log('✅ Expenses Module Loaded');

/* ==========================================
   JS END: Expenses Module
   ========================================== */
})();