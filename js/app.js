/* ==========================================
   JS START: Main Application Logic
   Handles UI interactions and business logic
   ========================================== */


// ===== GLOBAL STATE =====
let currentUser = null;

// ===== GLOBAL NOTIFICATION SYSTEM =====
window.showNotification = function(message, type = 'success') {
    const existing = document.getElementById('global-notification');
    if (existing) existing.remove();

    const colors = { success: '#22c55e', error: '#FF1744', info: '#0066FF', warning: '#FFB300' };
    const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

    const n = document.createElement('div');
    n.id = 'global-notification';
    n.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;display:flex;align-items:center;
        gap:10px;padding:12px 18px;background:${colors[type]||colors.info};color:#fff;
        border-radius:10px;font-size:14px;font-weight:600;font-family:Arial,sans-serif;
        box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:slideInRight 0.3s ease;max-width:320px;`;
    n.innerHTML = `<span style="font-size:16px">${icons[type]||'ℹ'}</span><span>${message}</span>`;
    document.body.appendChild(n);

    setTimeout(() => { n.style.opacity='0'; n.style.transition='opacity 0.3s'; setTimeout(()=>n.remove(), 300); }, 3000);
};

// ===== USER-SPECIFIC STORAGE HELPERS =====
// Prevents cross-user data leakage on shared browsers
function userKey(key) {
    const uid = window._currentUserId || 'anon';
    return `${key}_${uid}`;
}
function setUserItem(key, val) { localStorage.setItem(userKey(key), val); }
function getUserItem(key, fallback) { return localStorage.getItem(userKey(key)) || fallback || null; }



// ===== SHARED UTILITIES =====
// Bug #14: Single shared currency formatter — all modules use window.Utils.fmt
// Individual module fmt() functions are kept for backward-compatibility but delegate here
window.Utils = {
    fmt: function(n) {
        return 'PKR ' + Math.round(n || 0).toLocaleString();
    }
};

// ===== DOM ELEMENTS =====
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authLoading = document.getElementById('auth-loading');
const authError = document.getElementById('auth-error');

// Login form elements
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');

// Register form elements
const registerName = document.getElementById('register-name');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerBtn = document.getElementById('register-btn');

// Form switch links
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

// Logout button
const logoutBtn = document.getElementById('logout-btn');

// ===== UTILITY FUNCTIONS =====

/**
 * Show loading state
 */
function showLoading() {
    authLoading.style.display = 'block';
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    authError.style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
    authLoading.style.display = 'none';
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    authError.textContent = message;
    authError.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        authError.style.display = 'none';
    }, 5000);
}

/**
 * Switch between login and register forms
 * @param {string} formType - 'login' or 'register'
 */
function switchForm(formType) {
    authError.style.display = 'none';
    
    if (formType === 'register') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    } else {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    }
}

/**
 * Update user display information in the UI
 */
async function updateUserDisplay() {
    try {
        const user = await window.StorageModule.getCurrentUser();
        
        if (user) {
            console.log('Updating user display:', user);
            
            // Get display name from user metadata or email
            const displayName = user.user_metadata?.full_name || 
                               user.user_metadata?.name || 
                               user.email.split('@')[0];
            
            // Update user name in top navbar
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = displayName;
            }
            
            // Update user initials in avatar
            const userInitialsElement = document.getElementById('user-initials');
            if (userInitialsElement) {
                let initials = 'KF'; // default
                
                if (user.user_metadata?.full_name || user.user_metadata?.name) {
                    const name = user.user_metadata.full_name || user.user_metadata.name;
                    initials = name.split(' ')
                        .map(word => word[0])
                        .join('')
                        .toUpperCase()
                        .substring(0, 2);
                } else {
                    // Use first 2 letters of email
                    initials = user.email.substring(0, 2).toUpperCase();
                }
                
                userInitialsElement.textContent = initials;
            }
            
            // Update first name in dashboard greeting
            const userFirstNameElement = document.getElementById('user-first-name');
            if (userFirstNameElement) {
                const fullName = user.user_metadata?.full_name || 
                                user.user_metadata?.name || 
                                user.email.split('@')[0];
                const firstName = fullName.split(' ')[0];
                userFirstNameElement.textContent = firstName;
            }
            
            console.log('✅ User display updated successfully');
        }
    } catch (error) {
        console.error('Error updating user display:', error);
    }
}

/**
 * Show the main app (after successful login)
 */
async function showApp() {
    authContainer.style.display = 'none';
    appContainer.style.display = 'block';

    // Set global user ID so all modules use user-specific storage keys
    const _u = await window.StorageModule.getCurrentUser();
    if (_u) window._currentUserId = _u.id;
    
    // Update user display information
    await updateUserDisplay();
    
    // Update dashboard time
    updateDashboardTime();
    
    // Load dashboard stats (products + revenue)
    await loadDashboardStats();

    // Load this user's PIN + settings from Supabase
    await loadUserSettings();
}

/**
 * Load current user's settings (PIN, business name, currency) from Supabase
 * Called every time showApp() runs — ensures per-user isolation
 */
async function loadUserSettings() {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return;

        const { data } = await window.StorageModule.supabase
            .from('profiles')
            .select('business_name, currency_symbol, finance_pin, business_phone, business_address, onboarding_done')
            .eq('id', user.id)
            .single();

        if (data) {
            // Update finance PIN in memory ONLY
            if (data.finance_pin && window._updateFinancePin) {
                window._updateFinancePin(data.finance_pin);
            }
            // Cache settings (use user-specific key for biz contact info)
            const uid = user.id;
            if (data.business_name)    setUserItem('kfh_biz_name', data.business_name);
            if (data.currency_symbol)  setUserItem('kfh_currency', data.currency_symbol);
            if (data.business_phone)   localStorage.setItem(`kfh_biz_phone_${uid}`,   data.business_phone);
            if (data.business_address) localStorage.setItem(`kfh_biz_address_${uid}`, data.business_address);

            // Push business info into invoice template
            if (window.InvoiceTemplate && window.InvoiceTemplate._syncBizFromProfile) {
                window.InvoiceTemplate._syncBizFromProfile({
                    name:    data.business_name    || '',
                    phone:   data.business_phone   || '',
                    address: data.business_address || ''
                });
            }

            // Show onboarding modal for new users
            if (!data.onboarding_done) {
                setTimeout(() => window.showOnboardingModal?.(), 800);
            }
        }
    } catch(e) {
        console.warn('Could not load user settings:', e.message);
    }
}

/**
 * Show the auth screen (after logout)
 */
function showAuth() {
    appContainer.style.display = 'none';
    authContainer.style.display = 'flex';
}

// ===== AUTHENTICATION HANDLERS =====

/**
 * Handle user login
 */
async function handleLogin() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();

    // Validation
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }

    if (!email.includes('@')) {
        showError('Please enter a valid email address');
        return;
    }

    // Show loading
    showLoading();
    loginBtn.disabled = true;

    // Attempt login
    const result = await window.StorageModule.loginUser(email, password);

    hideLoading();
    loginBtn.disabled = false;

    if (result.success) {
        currentUser = result.user;
        console.log('✅ Login successful:', currentUser);
        
        // Clear form
        loginEmail.value = '';
        loginPassword.value = '';
        
        // Show main app (this will also update user display)
        await showApp();
    } else {
        showError(result.error || 'Login failed. Please try again.');
        loginForm.style.display = 'block';
    }
}

/**
 * Handle user registration
 */
async function handleRegister() {
    const name = registerName.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();

    // Validation
    if (!name || !email || !password) {
        showError('Please fill in all fields');
        return;
    }

    if (!email.includes('@')) {
        showError('Please enter a valid email address');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }

    // Show loading
    showLoading();
    registerBtn.disabled = true;

    try {
        // Attempt registration
        const result = await window.StorageModule.registerUser(email, password, name);

        if (result.success) {
            console.log('✅ Registration successful');
            
            // Clear form
            registerName.value = '';
            registerEmail.value = '';
            registerPassword.value = '';
            
            // Hide loading first
            hideLoading();
            
            // Show success message
            authError.textContent = '✅ Account created successfully! Logging you in...';
            authError.style.display = 'block';
            authError.style.background = 'rgba(16, 185, 129, 0.1)';
            authError.style.borderColor = 'var(--color-success)';
            authError.style.color = 'var(--color-success)';
            
            // Show register form during transition
            registerForm.style.display = 'block';
            
            // Auto-login after 1.5 seconds
            setTimeout(async () => {
                try {
                    // Show loading for login
                    showLoading();
                    
                    const loginResult = await window.StorageModule.loginUser(email, password);
                    
                    hideLoading();
                    
                    if (loginResult.success) {
                        currentUser = loginResult.user;
                        console.log('✅ Auto-login successful');
                        
                        // Reset error style
                        authError.style.background = 'rgba(239, 68, 68, 0.1)';
                        authError.style.borderColor = 'var(--color-danger)';
                        authError.style.color = 'var(--color-danger)';
                        authError.style.display = 'none';
                        
                        await showApp();
                    } else {
                        // Login failed, show login form
                        console.error('Auto-login failed:', loginResult.error);
                        
                        authError.textContent = '✅ Account created! Please login manually.';
                        authError.style.display = 'block';
                        
                        setTimeout(() => {
                            switchForm('login');
                            authError.style.display = 'none';
                            authError.style.background = 'rgba(239, 68, 68, 0.1)';
                            authError.style.borderColor = 'var(--color-danger)';
                            authError.style.color = 'var(--color-danger)';
                        }, 2000);
                    }
                } catch (loginError) {
                    hideLoading();
                    console.error('Login error:', loginError);
                    showError('Account created but auto-login failed. Please login manually.');
                    setTimeout(() => {
                        switchForm('login');
                    }, 2000);
                }
            }, 1500);
            
        } else {
            // Registration failed
            hideLoading();
            registerBtn.disabled = false;
            registerForm.style.display = 'block';
            showError(result.error || 'Registration failed. Please try again.');
        }
        
    } catch (error) {
        // Catch any unexpected errors
        hideLoading();
        registerBtn.disabled = false;
        registerForm.style.display = 'block';
        console.error('Unexpected registration error:', error);
        showError('An unexpected error occurred. Please try again.');
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    const result = await window.StorageModule.logoutUser();
    
    if (result.success) {
        currentUser = null;
        console.log('✅ Logout successful');
        showAuth();
        switchForm('login');
    } else {
        alert('Logout failed: ' + result.error);
    }
}

/**
 * Check if user is already logged in on page load
 */
async function checkAuth() {
    showLoading();
    
    const user = await window.StorageModule.getCurrentUser();
    
    hideLoading();
    
    if (user) {
        currentUser = user;
        console.log('✅ User already logged in:', user);
        await showApp();
    } else {
        console.log('ℹ️ No user logged in');
        showAuth();
        loginForm.style.display = 'block';
    }
}

// ===== UPDATE DASHBOARD TIME & DATE =====
function updateDashboardTime() {
    const now = new Date();
    
    // Update time of day greeting
    const hour = now.getHours();
    const timeOfDayElement = document.getElementById('time-of-day');
    if (timeOfDayElement) {
        if (hour < 12) {
            timeOfDayElement.textContent = 'Morning';
        } else if (hour < 17) {
            timeOfDayElement.textContent = 'Afternoon';
        } else {
            timeOfDayElement.textContent = 'Evening';
        }
    }
    
    // Update current date
    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = now.toLocaleDateString('en-US', options);
    }
    
    // Update current time
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        const options = { hour: 'numeric', minute: '2-digit', hour12: true };
        timeElement.textContent = now.toLocaleTimeString('en-US', options);
    }
}

// ===== EVENT LISTENERS =====

// Login button click
loginBtn.addEventListener('click', handleLogin);

// Register button click
registerBtn.addEventListener('click', handleRegister);

// Enter key on login form
loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// Enter key on register form
registerPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleRegister();
});

// Switch to register form
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchForm('register');
});

// Switch to login form
showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchForm('login');
});

// Logout button
logoutBtn.addEventListener('click', handleLogout);

// Listen for auth state changes
window.StorageModule.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    
    if (event === 'SIGNED_IN') {
        currentUser = session.user;
        showApp();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showAuth();
    }
});

// ===== INITIALIZATION =====

// Check authentication status when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App Initialized');
    checkAuth();
    
    // Initialize navigation
    initNavigation();
    
    // Start updating time every second
    updateDashboardTime();
    setInterval(updateDashboardTime, 1000);
});

// ===== DASHBOARD STATS =====
async function loadDashboardStats() {
    try {
        console.log('📊 Loading dashboard stats...');
        
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return;

        // Get all data
        const productsResult = await window.StorageModule.getAllData('products');
        const products = productsResult.success ? productsResult.data : [];

        const salesResult = await window.StorageModule.getAllData('sales');
        const sales = salesResult.success ? salesResult.data : [];

        const purchasesResult = await window.StorageModule.getAllData('purchases');
        const purchases = purchasesResult.success ? purchasesResult.data : [];

        // FIX: Load returns to compute net revenue and net purchase cost
        const returnsResult = await window.StorageModule.getAllData('returns');
        const allReturns = returnsResult.success ? returnsResult.data : [];

        // Build maps: how much was returned per sale / per purchase
        const returnedBySaleId = {};
        const returnedByPurchaseId = {};
        allReturns.forEach(r => {
            if (r.return_type === 'sale') {
                returnedBySaleId[r.original_transaction_id] = (returnedBySaleId[r.original_transaction_id] || 0) + (r.total_amount || 0);
            } else {
                returnedByPurchaseId[r.original_transaction_id] = (returnedByPurchaseId[r.original_transaction_id] || 0) + (r.total_amount || 0);
            }
        });

        // Calculate stats
        const totalProducts = products.length;
        const lowStockProducts = products.filter(p => p.stock < (p.min_stock || 10)).length;
        
        // Net revenue = gross total - returns for each sale
        // BUT: if NIL was used (remaining=0 and paid<total), use paid amount as effective revenue
        const totalRevenue = sales.reduce((sum, s) => {
            const grossTotal = s.total || 0;
            const returned = returnedBySaleId[s.id] || 0;
            const paidAmount = s.paid_amount || 0;
            const remaining = s.remaining_amount || 0;
            
            // Check if NIL was used: fully paid but paid amount is less than total
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // If NIL used, effective revenue is what was actually collected (paid amount minus any returns)
            // Otherwise, effective revenue is invoice total minus returns
            const effectiveRevenue = nilUsed 
                ? Math.max(0, paidAmount - returned)
                : Math.max(0, grossTotal - returned);
            
            return sum + effectiveRevenue;
        }, 0);
        const totalSalesPaid = sales.reduce((sum, s) => sum + (s.paid_amount || 0), 0);
        const accountsReceivable = sales.reduce((sum, s) => sum + (s.remaining_amount || 0), 0);

        // Net purchase cost = gross total - returns for each purchase
        // BUT: if NIL was used (remaining=0 and paid<total), use paid amount as effective cost
        const totalCost = purchases.reduce((sum, p) => {
            const grossTotal = p.total || 0;
            const returned = returnedByPurchaseId[p.id] || 0;
            const paidAmount = p.paid_amount || 0;
            const remaining = p.remaining_amount || 0;
            
            // Check if NIL was used: fully paid but paid amount is less than total
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // If NIL used, effective cost is what was actually paid (paid amount minus any returns)
            // Otherwise, effective cost is invoice total minus returns
            const effectiveCost = nilUsed 
                ? Math.max(0, paidAmount - returned)
                : Math.max(0, grossTotal - returned);
            
            return sum + effectiveCost;
        }, 0);
        const totalPurchasesPaid = purchases.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
        const accountsPayable = purchases.reduce((sum, p) => sum + (p.remaining_amount || 0), 0);
        
        // CRITICAL FIX: Load customers and suppliers to include opening balances
        const customersResult = await window.StorageModule.getAllData('customers');
        const customers = customersResult.success ? customersResult.data : [];
        
        const suppliersResult = await window.StorageModule.getAllData('suppliers');
        const suppliers = suppliersResult.success ? suppliersResult.data : [];
        
        // Add opening balances to AR and AP
        const customersOpeningBalance = customers.reduce((sum, c) => sum + (c.opening_balance || 0), 0);
        const suppliersOpeningBalance = suppliers.reduce((sum, s) => sum + (s.opening_balance || 0), 0);
        
        const totalAccountsReceivable = accountsReceivable + customersOpeningBalance;
        const totalAccountsPayable = accountsPayable + suppliersOpeningBalance;
        
        const profit = totalRevenue - totalCost;

        // Update dashboard displays
        const totalProductsEl = document.getElementById('stat-total-products');
        const lowStockProductsEl = document.getElementById('stat-low-stock');
        const totalRevenueEl = document.getElementById('stat-total-sales');
        const arAmountEl = document.getElementById('stat-ar');
        const apAmountEl = document.getElementById('stat-ap');
        const inventoryValueEl = document.getElementById('stat-inventory-value');

        if (totalProductsEl) totalProductsEl.textContent = totalProducts;
        if (lowStockProductsEl) lowStockProductsEl.textContent = lowStockProducts;
        if (totalRevenueEl) totalRevenueEl.textContent = `PKR ${Math.round(totalRevenue).toLocaleString()}`;
        if (arAmountEl) arAmountEl.textContent = `PKR ${Math.round(totalAccountsReceivable).toLocaleString()}`;
        if (apAmountEl) apAmountEl.textContent = `PKR ${Math.round(totalAccountsPayable).toLocaleString()}`;
        
        const inventoryValue = products.reduce((sum, p) => sum + (p.stock * p.purchase_price), 0);
        if (inventoryValueEl) inventoryValueEl.textContent = `PKR ${Math.round(inventoryValue).toLocaleString()}`;

        console.log('✅ Dashboard stats updated');
        console.log('📈 Revenue:', `PKR ${Math.round(totalRevenue).toLocaleString()}`, '| Profit:', `PKR ${Math.round(profit).toLocaleString()}`);
        console.log('💰 AR:', `PKR ${Math.round(totalAccountsReceivable).toLocaleString()}`, '| AP:', `PKR ${Math.round(totalAccountsPayable).toLocaleString()}`);

    } catch (error) {
        console.error('❌ Error loading dashboard stats:', error);
    }
}

// Export app functions
window.AppModule = {
    loadDashboardStats: loadDashboardStats
};



console.log('✅ App Module Loaded');

/* ==========================================
   JS END: Main Application Logic
   ========================================== */

   // ===== NAVIGATION SYSTEM =====

/**
 * Navigate to a specific page
 */
function navigateToPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
    
    console.log(`📄 Navigated to: ${pageName}`);
}

/**
 * Initialize navigation system
 */
function initNavigation() {
    // Add click listeners to all navigation items and buttons with data-page attribute
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('[data-page]');
        if (navItem) {
            const pageName = navItem.getAttribute('data-page');
            navigateToPage(pageName);
            
            // Close FAB if open
            const fabContainer = document.querySelector('.fab-container');
            if (fabContainer) {
                fabContainer.classList.remove('active');
            }
            
            // Close search overlay if open
            const searchOverlay = document.getElementById('search-overlay');
            if (searchOverlay) {
                searchOverlay.classList.remove('active');
            }
            
            // Initialize modules based on page
            setTimeout(() => {
                console.log(`🔄 Initializing module for page: ${pageName}`);
                
                if (pageName === 'dashboard') {
                    // Reload dashboard stats
                    if (window.AppModule && window.AppModule.loadDashboardStats) {
                        window.AppModule.loadDashboardStats();
                    }
                }
                else if (pageName === 'products') {
                    if (window.ProductsModule && window.ProductsModule.loadProducts) {
                        console.log('📦 Loading Products Module...');
                        window.ProductsModule.loadProducts();
                    }
                }
                else if (pageName === 'sales') {
                    // CRITICAL FIX: Initialize sales module
                    if (window.SalesModule && window.SalesModule.initSalesPage) {
                        console.log('💰 Initializing Sales Module...');
                        window.SalesModule.initSalesPage();
                    }
                }
                else if (pageName === 'quick-sale') {
                    if (window.QuickSaleModule && window.QuickSaleModule.initQuickSale) {
                        console.log('🛒 Initializing Quick Sale Module...');
                        window.QuickSaleModule.initQuickSale();
                    }
                }
                else if (pageName === 'purchases') {
                    // CRITICAL FIX: Initialize purchases module
                    if (window.PurchasesModule && window.PurchasesModule.initPurchasesPage) {
                        console.log('📥 Initializing Purchases Module...');
                        window.PurchasesModule.initPurchasesPage();
                    }
                }
                else if (pageName === 'quick-purchase') {
                    if (window.QuickPurchaseModule && window.QuickPurchaseModule.initQuickPurchase) {
                        console.log('🛒 Initializing Quick Purchase Module...');
                        window.QuickPurchaseModule.initQuickPurchase();
                    }
                }
                else if (pageName === 'returns') {
                    // CRITICAL FIX: Initialize returns module
                    if (window.ReturnsModule && window.ReturnsModule.initReturnsPage) {
                        console.log('↩️ Initializing Returns Module...');
                        window.ReturnsModule.initReturnsPage();
                    }
                }
                else if (pageName === 'customers') {
                    // CRITICAL FIX: Initialize customers module
                    if (window.CustomersModule && window.CustomersModule.initCustomersPage) {
                        console.log('👥 Initializing Customers Module...');
                        window.CustomersModule.initCustomersPage();
                    }
                }
                else if (pageName === 'suppliers') {
                    // CRITICAL FIX: Initialize suppliers module
                    if (window.SuppliersModule && window.SuppliersModule.initSuppliersPage) {
                        console.log('🚚 Initializing Suppliers Module...');
                        window.SuppliersModule.initSuppliersPage();
                    }
                }
                else if (pageName === 'reports') {
                    if (window.ReportsModule && window.ReportsModule.loadReports) {
                        console.log('📊 Loading Reports Module...');
                        window.ReportsModule.loadReports();
                    }
                }
                else if (pageName === 'accounts') {
                    // Initialize accounts module
                    if (window.AccountsModule && window.AccountsModule.loadAccounts) {
                        console.log('🏦 Loading Accounts Module...');
                        window.AccountsModule.loadAccounts();
                    }
                }

                else if (pageName === 'expenses') {
                    if (window.ExpensesModule && window.ExpensesModule.initExpensesPage) {
                        console.log('💸 Initializing Expenses Module...');
                        window.ExpensesModule.initExpensesPage();
                    }
                }
            }, 150);
        }
    });

    // FAB functionality
    const fabTrigger = document.getElementById('fab-trigger');
    const fabContainer = document.querySelector('.fab-container');

    if (fabTrigger) {
        fabTrigger.addEventListener('click', () => {
            fabContainer.classList.toggle('active');
        });
    }

    // Search overlay functionality
    const searchTrigger = document.getElementById('search-trigger');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    const searchResults = searchOverlay ? searchOverlay.querySelector('.search-results') : null;

    // Default quick-action HTML shown when search is empty
    const defaultSearchHTML = `
        <div class="search-section">
            <p class="search-section-title">Quick Actions</p>
            <button class="search-result-item" data-page="quick-sale">
                <span class="search-result-icon">⚡</span>
                <span class="search-result-text">New Sale</span>
            </button>
            <button class="search-result-item" data-page="quick-purchase">
                <span class="search-result-icon">🛒</span>
                <span class="search-result-text">New Purchase</span>
            </button>
            <button class="search-result-item" data-page="products">
                <span class="search-result-icon">📦</span>
                <span class="search-result-text">Add Product</span>
            </button>
        </div>
        <div class="search-section">
            <p class="search-section-title">Navigate</p>
            <button class="search-result-item" data-page="dashboard">
                <span class="search-result-icon">📊</span>
                <span class="search-result-text">Dashboard</span>
            </button>
            <button class="search-result-item" data-page="sales">
                <span class="search-result-icon">💰</span>
                <span class="search-result-text">Sales</span>
            </button>
            <button class="search-result-item" data-page="reports">
                <span class="search-result-icon">📈</span>
                <span class="search-result-text">Reports</span>
            </button>
        </div>`;

    /**
     * Perform global search across products, customers, suppliers, and sales
     * @param {string} term - Search term
     */
    async function performGlobalSearch(term) {
        if (!searchResults) return;
        if (!term) {
            searchResults.innerHTML = defaultSearchHTML;
            return;
        }

        searchResults.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--color-text-muted);">🔍 Searching...</div>`;

        try {
            const lowerTerm = term.toLowerCase();

            const [productsRes, customersRes, suppliersRes, salesRes] = await Promise.all([
                window.StorageModule.getAllData('products'),
                window.StorageModule.getAllData('customers'),
                window.StorageModule.getAllData('suppliers'),
                window.StorageModule.getAllData('sales'),
            ]);

            const products  = (productsRes.success  ? productsRes.data  : []).filter(p =>
                (p.name  && p.name.toLowerCase().includes(lowerTerm)) ||
                (p.category && p.category.toLowerCase().includes(lowerTerm)) ||
                (p.sku   && p.sku.toLowerCase().includes(lowerTerm))
            ).slice(0, 5);

            const customers = (customersRes.success ? customersRes.data : []).filter(c =>
                (c.name  && c.name.toLowerCase().includes(lowerTerm)) ||
                (c.phone && c.phone.includes(term)) ||
                (c.email && c.email.toLowerCase().includes(lowerTerm))
            ).slice(0, 5);

            const suppliers = (suppliersRes.success ? suppliersRes.data : []).filter(s =>
                (s.name  && s.name.toLowerCase().includes(lowerTerm)) ||
                (s.phone && s.phone.includes(term)) ||
                (s.email && s.email.toLowerCase().includes(lowerTerm))
            ).slice(0, 5);

            const sales = (salesRes.success ? salesRes.data : []).filter(s =>
                (s.invoice_id     && s.invoice_id.toLowerCase().includes(lowerTerm)) ||
                (s.customer_name  && s.customer_name.toLowerCase().includes(lowerTerm)) ||
                (s.customer_phone && s.customer_phone.includes(term))
            ).slice(0, 5);

            const total = products.length + customers.length + suppliers.length + sales.length;

            if (total === 0) {
                searchResults.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-text-muted);">No results found for "<strong>${term}</strong>"</div>`;
                return;
            }

            let html = '';

            if (products.length > 0) {
                html += `<div class="search-section"><p class="search-section-title">📦 Products</p>`;
                products.forEach(p => {
                    html += `<button class="search-result-item" data-page="products">
                        <span class="search-result-icon">📦</span>
                        <span class="search-result-text">${p.name}${p.category ? ' — ' + p.category : ''} &nbsp;<small style="opacity:0.6">Stock: ${p.stock ?? 0}</small></span>
                    </button>`;
                });
                html += `</div>`;
            }

            if (customers.length > 0) {
                html += `<div class="search-section"><p class="search-section-title">👥 Customers</p>`;
                customers.forEach(c => {
                    html += `<button class="search-result-item" data-page="customers">
                        <span class="search-result-icon">👤</span>
                        <span class="search-result-text">${c.name}${c.phone ? ' — ' + c.phone : ''}</span>
                    </button>`;
                });
                html += `</div>`;
            }

            if (suppliers.length > 0) {
                html += `<div class="search-section"><p class="search-section-title">🚚 Suppliers</p>`;
                suppliers.forEach(s => {
                    html += `<button class="search-result-item" data-page="suppliers">
                        <span class="search-result-icon">🚚</span>
                        <span class="search-result-text">${s.name}${s.phone ? ' — ' + s.phone : ''}</span>
                    </button>`;
                });
                html += `</div>`;
            }

            if (sales.length > 0) {
                html += `<div class="search-section"><p class="search-section-title">💰 Sales</p>`;
                sales.forEach(s => {
                    html += `<button class="search-result-item" data-page="sales">
                        <span class="search-result-icon">🧾</span>
                        <span class="search-result-text">${s.invoice_id || 'N/A'} — ${s.customer_name || 'Walk-in'} &nbsp;<small style="opacity:0.6">PKR ${Math.round(s.total || 0).toLocaleString()}</small></span>
                    </button>`;
                });
                html += `</div>`;
            }

            searchResults.innerHTML = html;

        } catch (err) {
            console.error('❌ Global search error:', err);
            searchResults.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--color-danger);">Search failed. Please try again.</div>`;
        }
    }

    if (searchTrigger && searchOverlay) {
        // Open search
        searchTrigger.addEventListener('click', () => {
            searchOverlay.classList.add('active');
            if (searchResults) searchResults.innerHTML = defaultSearchHTML;
            setTimeout(() => searchInput?.focus(), 100);
        });
        
        // Fix Bug #5: Real-time search on input
        if (searchInput) {
            let searchDebounce = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    performGlobalSearch(e.target.value.trim());
                }, 250);
            });
        }

        // Clear search input when overlay closes
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) {
                searchOverlay.classList.remove('active');
                if (searchInput) searchInput.value = '';
                if (searchResults) searchResults.innerHTML = defaultSearchHTML;
            }
        });
        
        // Close search on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchOverlay.classList.contains('active')) {
                searchOverlay.classList.remove('active');
                if (searchInput) searchInput.value = '';
                if (searchResults) searchResults.innerHTML = defaultSearchHTML;
            }
        });

        // F2 shortcut — toggle finance visibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            window.toggleFinanceVisibility();
        }
    });
        
        // Ctrl+K to open search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchOverlay.classList.add('active');
                if (searchResults) searchResults.innerHTML = defaultSearchHTML;
                setTimeout(() => searchInput?.focus(), 100);
            }
        });
    }
    
    console.log('✅ Navigation System Loaded');

    // ===== MOBILE NAVIGATION =====
(function() {
    const drawer        = document.getElementById('mobile-drawer');
    const overlay       = document.getElementById('mobile-drawer-overlay');
    const menuBtn       = document.getElementById('mobile-menu-btn');
    const closeBtn      = document.getElementById('close-drawer-btn');
    const mobileLogout  = document.getElementById('mobile-logout-btn');

    function openDrawer() {
        drawer?.classList.add('open');
        overlay?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
        drawer?.classList.remove('open');
        overlay?.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuBtn?.addEventListener('click', openDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    overlay?.addEventListener('click', closeDrawer);

    // Swipe left to close drawer
    let touchStartX = 0;
    drawer?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    drawer?.addEventListener('touchend', e => {
        if (e.changedTouches[0].clientX - touchStartX < -60) closeDrawer();
    }, { passive: true });

    // Drawer nav items
    drawer?.querySelectorAll('.mobile-drawer-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page) {
                // trigger the same navigateTo used by desktop
                document.querySelector(`[data-page="${page}"]`)?.click();
            }
            closeDrawer();
        });
    });

    // Mobile logout
    mobileLogout?.addEventListener('click', () => {
        closeDrawer();
        document.getElementById('logout-btn')?.click();
    });

    // Bottom nav
    const bottomNav = document.getElementById('bottom-nav');
    const bottomMore = document.getElementById('bottom-nav-more');

    bottomMore?.addEventListener('click', openDrawer);

    bottomNav?.querySelectorAll('.bottom-nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page) document.querySelector(`.nav-item[data-page="${page}"], [data-page="${page}"]`)?.click();
        });
    });

    // Keep bottom nav + drawer active state in sync with page navigation
    // Patch the existing navigateTo / page switching
    const _origNavigate = window.navigateTo;
    window._syncMobileNav = function(pageId) {
        // Bottom nav
        bottomNav?.querySelectorAll('.bottom-nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.page === pageId);
        });
        // Drawer items
        drawer?.querySelectorAll('.mobile-drawer-item').forEach(b => {
            b.classList.toggle('drawer-active', b.dataset.page === pageId);
        });
    };

    // Observe page changes by watching .page.active class
    const pageObserver = new MutationObserver(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            const pageId = activePage.id.replace('page-', '');
            window._syncMobileNav(pageId);
        }
    });
    const mainContent = document.querySelector('.main-content');
    if (mainContent) pageObserver.observe(mainContent, { subtree: true, attributeFilter: ['class'] });

})();

// ===== FORGOT PASSWORD =====
(function() {
    const showForgot  = document.getElementById('show-forgot-pw');
    const backToLogin = document.getElementById('back-to-login-btn');
    const sendResetBtn= document.getElementById('send-reset-btn');
    const forgotForm  = document.getElementById('forgot-pw-form');
    const loginFormEl = document.getElementById('login-form');
    const sentMsg     = document.getElementById('reset-sent-msg');

    if (showForgot) {
        showForgot.addEventListener('click', () => {
            loginFormEl.style.display  = 'none';
            forgotForm.style.display   = 'block';
            if (sentMsg) sentMsg.style.display = 'none';
        });
    }
    if (backToLogin) {
        backToLogin.addEventListener('click', () => {
            forgotForm.style.display  = 'none';
            loginFormEl.style.display = 'block';
        });
    }
    if (sendResetBtn) {
        sendResetBtn.addEventListener('click', async () => {
            const email = document.getElementById('forgot-pw-email')?.value?.trim();
            if (!email) { alert('Please enter your email'); return; }
            sendResetBtn.disabled = true;
            sendResetBtn.textContent = 'Sending...';
            const res = await window.StorageModule.sendPasswordReset(email);
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Send Reset Link';
            if (res.success) {
                if (sentMsg) sentMsg.style.display = 'block';
            } else {
                alert('Error: ' + res.error);
            }
        });
    }
})();

// ===== PROFILE MODAL =====
(function() {
    const openBtn = document.getElementById('open-profile-btn');
    if (!openBtn) return;

    openBtn.addEventListener('click', async () => {
        const modal = document.getElementById('profile-modal');
        const user  = await window.StorageModule.getCurrentUser();
        if (!user || !modal) return;

        const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
        document.getElementById('profile-email-display').textContent = user.email;
        document.getElementById('profile-name-input').value = name;
        document.getElementById('profile-new-pw').value = '';
        document.getElementById('profile-confirm-pw').value = '';
        document.getElementById('profile-save-msg').textContent = '';

        // Avatar initials
        const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0,2) : user.email.substring(0,2).toUpperCase();
        document.getElementById('profile-avatar-initials').textContent = initials;

        // Close user dropdown
        document.querySelector('.user-dropdown')?.classList.remove('active');
        modal.classList.add('active');
    });

    window.saveProfile = async function() {
        const name    = document.getElementById('profile-name-input').value.trim();
        const newPw   = document.getElementById('profile-new-pw').value;
        const confPw  = document.getElementById('profile-confirm-pw').value;
        const msgEl   = document.getElementById('profile-save-msg');

        if (newPw && newPw !== confPw) {
            msgEl.style.color = 'var(--color-danger)';
            msgEl.textContent = '❌ Passwords do not match';
            return;
        }
        if (newPw && newPw.length < 6) {
            msgEl.style.color = 'var(--color-danger)';
            msgEl.textContent = '❌ Password must be at least 6 characters';
            return;
        }

        msgEl.textContent = 'Saving...';
        msgEl.style.color = 'var(--color-text-muted)';

        const res = await window.StorageModule.updateUserProfile({
            fullName: name || undefined,
            newPassword: newPw || undefined
        });

        if (res.success) {
            // Also update full_name in profiles table
            if (name) {
                const user = await window.StorageModule.getCurrentUser();
                if (user) {
                    await window.StorageModule.supabase
                        .from('profiles')
                        .update({ full_name: name })
                        .eq('id', user.id);
                }
            }
            msgEl.style.color = 'var(--color-success)';
            msgEl.textContent = '✅ Profile updated successfully';
            await updateUserDisplay();
            setTimeout(() => document.getElementById('profile-modal').classList.remove('active'), 1200);
        } else {
            msgEl.style.color = 'var(--color-danger)';
            msgEl.textContent = '❌ ' + res.error;
        }
    };
})();

// ===== SETTINGS MODAL =====
(function() {
    const openBtn = document.getElementById('open-settings-btn');
    if (!openBtn) return;

    // Load settings from Supabase for this specific user
    async function loadSettings() {
        let bizName  = 'My Business';
        let currency = 'PKR';
        const interval = localStorage.getItem('kfh_notif_interval') || '5';

        try {
            const user = await window.StorageModule.getCurrentUser();
            if (user) {
                const { data } = await window.StorageModule.supabase
                    .from('profiles')
                    .select('business_name, currency_symbol, finance_pin')
                    .eq('id', user.id)
                    .single();

                if (data) {
                    if (data.business_name)   bizName  = data.business_name;
                    if (data.currency_symbol) currency = data.currency_symbol;
                    if (data.finance_pin)     window._updateFinancePin?.(data.finance_pin);
                    // Only cache non-sensitive display settings
                    setUserItem('kfh_biz_name', bizName);
                    setUserItem('kfh_currency', currency);
                }
            }
        } catch(e) {
            // fallback to cached display settings only
            bizName  = getUserItem('kfh_biz_name', 'My Business');
            currency = getUserItem('kfh_currency', 'PKR');
        }

        const pinDisplay = document.getElementById('settings-pin-display');
        if (pinDisplay) pinDisplay.textContent = '••••';
        const bizInput = document.getElementById('settings-business-name');
        if (bizInput) bizInput.value = bizName;
        const curInput = document.getElementById('settings-currency');
        if (curInput) curInput.value = currency;
        const intSelect = document.getElementById('settings-notif-interval');
        if (intSelect) intSelect.value = interval;
    }

    openBtn.addEventListener('click', async () => {
        await loadSettings();
        document.querySelector('.user-dropdown')?.classList.remove('active');
        document.getElementById('settings-modal').classList.add('active');
    });

    window.saveNewPin = async function() {
        const newPin  = document.getElementById('settings-new-pin')?.value;
        const confPin = document.getElementById('settings-confirm-pin')?.value;
        const msg     = document.getElementById('pin-save-msg');

        if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
            msg.style.color = 'var(--color-danger)';
            msg.textContent = '❌ PIN must be exactly 4 digits'; return;
        }
        if (newPin !== confPin) {
            msg.style.color = 'var(--color-danger)';
            msg.textContent = '❌ PINs do not match'; return;
        }

        msg.style.color = 'var(--color-text-muted)';
        msg.textContent = 'Saving...';

        try {
            const user = await window.StorageModule.getCurrentUser();
            if (!user) throw new Error('Not logged in');

            // Save ONLY to Supabase — never to localStorage
            // localStorage is shared between all users on the same browser
            const { error } = await window.StorageModule.supabase
                .from('profiles')
                .update({ finance_pin: newPin })
                .eq('id', user.id);

            if (error) throw error;

            // Update live in memory only
            if (window._updateFinancePin) window._updateFinancePin(newPin);

            msg.style.color = 'var(--color-success)';
            msg.textContent = '✅ PIN updated';
            document.getElementById('settings-new-pin').value = '';
            document.getElementById('settings-confirm-pin').value = '';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);

        } catch(e) {
            msg.style.color = 'var(--color-danger)';
            msg.textContent = '❌ Error: ' + e.message;
        }
    };

    window.saveBusinessSettings = async function() {
        const biz = document.getElementById('settings-business-name')?.value?.trim();
        const cur = document.getElementById('settings-currency')?.value?.trim();
        const msg = document.getElementById('biz-save-msg');

        msg.style.color = 'var(--color-text-muted)';
        msg.textContent = 'Saving...';

        try {
            const user = await window.StorageModule.getCurrentUser();
            if (!user) throw new Error('Not logged in');

            const updates = {};
            if (biz) updates.business_name   = biz;
            if (cur) updates.currency_symbol = cur;

            if (Object.keys(updates).length > 0) {
                const { error } = await window.StorageModule.supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', user.id);
                if (error) throw error;
            }

            // Cache for display use only
            if (biz) setUserItem('kfh_biz_name', biz);
            if (cur) setUserItem('kfh_currency', cur);

            msg.style.color = 'var(--color-success)';
            msg.textContent = '✅ Saved';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);

        } catch(e) {
            msg.style.color = 'var(--color-danger)';
            msg.textContent = '❌ Error: ' + e.message;
        }
    };
})();


// ===== NOTIFICATION BELL =====
(function() {
    const trigger  = document.getElementById('notifications-trigger');
    const dropdown = document.getElementById('notif-dropdown');
    const badge    = document.getElementById('notif-badge');
    const body     = document.getElementById('notif-body');
    const count    = document.getElementById('notif-count');
    if (!trigger || !dropdown) return;

    async function loadNotifications() {
        try {
            const res = await window.StorageModule.getAllData('products');
            const products = res.success ? res.data : [];
            const alerts = products.filter(p => p.stock <= (p.reorder_threshold ?? 10));

            // Update badge
            if (alerts.length > 0) {
                badge.textContent = alerts.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }

            if (count) count.textContent = alerts.length + ' item' + (alerts.length !== 1 ? 's' : '');

            if (alerts.length === 0) {
                body.innerHTML = '<div class="notif-empty">✅ All products well stocked</div>';
                return;
            }

            // Get 30-day sales velocity per product
            const supabase = window.StorageModule.supabase;
            const since = new Date(); since.setDate(since.getDate() - 30);
            const { data: items } = await supabase
                .from('sale_items')
                .select('product_id, quantity')
                .gte('created_at', since.toISOString());

            const velocity = {};
            (items || []).forEach(i => {
                velocity[i.product_id] = (velocity[i.product_id] || 0) + (i.quantity || 0);
            });

            body.innerHTML = alerts.map(p => {
                const soldLast30 = velocity[p.id] || 0;
                const avgDaily   = soldLast30 / 30;
                const suggested  = Math.max(p.reorder_threshold ?? 10, Math.ceil(avgDaily * 14));
                const statusIcon = p.stock === 0 ? '🔴' : '🟡';
                return `
                    <div class="notif-item" onclick="document.querySelector('[data-page=\\'products\\']')?.click()">
                        <div class="notif-item-icon">${statusIcon}</div>
                        <div class="notif-item-body">
                            <div class="notif-item-name">${p.name}</div>
                            <div class="notif-item-detail">Stock: ${p.stock} / Threshold: ${p.reorder_threshold ?? 10}</div>
                        </div>
                        <div class="notif-item-suggest">Order ${suggested}</div>
                    </div>`;
            }).join('');

        } catch(e) {
            console.error('Notification load error:', e);
            body.innerHTML = '<div class="notif-empty">Failed to load alerts</div>';
        }
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        dropdown.classList.toggle('open', !isOpen);
        if (!isOpen) loadNotifications();
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== trigger) {
            dropdown.classList.remove('open');
        }
    });

    // Expose refresh for other modules to call
    window.refreshNotifications = loadNotifications;

    // Auto-load on app start (after short delay for auth)
    setTimeout(loadNotifications, 2000);

    // Refresh every 5 minutes
    setInterval(loadNotifications, 5 * 60 * 1000);
})();

    // ===== FINANCE PRIVACY TOGGLE =====
(function() {
    // PIN is ONLY kept in memory — never localStorage (localStorage is shared across all users on same browser)
    let CORRECT_PIN = '1234'; // temporary default, replaced immediately on login by loadUserSettings()

    window._updateFinancePin = function(newPin) { CORRECT_PIN = newPin; };

    function updateBtnLabels() {
        const unlocked = document.body.classList.contains('finance-unlocked');

        // Dashboard button
        const dashLabel = document.getElementById('dash-eye-label');
        const dashBtn   = document.getElementById('dash-finance-eye-btn');
        if (dashLabel) dashLabel.textContent = unlocked ? 'Hide Values' : 'Show Values';
        if (dashBtn) {
            dashBtn.querySelector('svg').innerHTML = unlocked
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
        }

        // Products button
        const prodLabel = document.getElementById('prod-eye-label');
        const prodBtn   = document.getElementById('prod-finance-eye-btn');
        if (prodLabel) prodLabel.textContent = unlocked ? 'Hide Cost' : 'Show Cost';
        if (prodBtn) {
            prodBtn.querySelector('svg').innerHTML = unlocked
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
        }
    }

    window.toggleFinanceVisibility = function() {
        if (document.body.classList.contains('finance-unlocked')) {
            // Already unlocked — lock it again immediately
            document.body.classList.remove('finance-unlocked');
            updateBtnLabels();
        } else {
            // Need password — show modal
            const modal = document.getElementById('finance-pw-modal');
            const input = document.getElementById('finance-pw-input');
            const err   = document.getElementById('finance-pw-error');
            if (!modal) return;
            input.value = '';
            err.textContent = '';
            modal.classList.add('active');
            setTimeout(() => input.focus(), 120);
        }
    };

    window._finPwSubmit = function() {
        const input = document.getElementById('finance-pw-input');
        const err   = document.getElementById('finance-pw-error');
        if (input.value === CORRECT_PIN) {
            document.getElementById('finance-pw-modal').classList.remove('active');
            document.body.classList.add('finance-unlocked');
            updateBtnLabels();
            input.value = '';
            err.textContent = '';
        } else {
            err.textContent = '❌ Incorrect PIN. Try again.';
            input.value = '';
            input.focus();
        }
    };

    window._finPwClose = function() {
        const modal = document.getElementById('finance-pw-modal');
        if (modal) modal.classList.remove('active');
    };

    window._finPwCheck = function(e) {
        // Auto-submit when 4 digits entered
        if (e.target.value.length === 4) {
            window._finPwSubmit();
        }
    };

    // Close modal on backdrop click
    document.getElementById('finance-pw-modal')?.addEventListener('click', function(e) {
        if (e.target === this) window._finPwClose();
    });

    // Close modal on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') window._finPwClose();
    });
})();
}

// ===== ONBOARDING =====
window.showOnboardingModal = function() {
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;
    // Pre-fill if any cached values exist
    const bizInput = document.getElementById('onboard-biz-name');
    const cached = getUserItem('kfh_biz_name');
    if (bizInput && cached && cached !== 'My Business' && cached !== 'King Filter House') {
        bizInput.value = cached;
    }
    modal.classList.add('active');
    setTimeout(() => document.getElementById('onboard-biz-name')?.focus(), 200);
};

window.skipOnboarding = async function() {
    document.getElementById('onboarding-modal')?.classList.remove('active');
    // Mark onboarding done even if skipped
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (user) {
            await window.StorageModule.supabase
                .from('profiles')
                .update({ onboarding_done: true })
                .eq('id', user.id);
        }
    } catch(e) {}
};

window.saveOnboarding = async function() {
    const bizName    = document.getElementById('onboard-biz-name')?.value.trim();
    const bizPhone   = document.getElementById('onboard-biz-phone')?.value.trim();
    const bizAddress = document.getElementById('onboard-biz-address')?.value.trim();
    const msgEl      = document.getElementById('onboard-msg');

    if (!bizName) {
        msgEl.style.color = 'var(--color-danger)';
        msgEl.textContent = '❌ Business name is required';
        document.getElementById('onboard-biz-name')?.focus();
        return;
    }

    msgEl.style.color = 'var(--color-text-muted)';
    msgEl.textContent = 'Saving...';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not logged in');

        const { error } = await window.StorageModule.supabase
            .from('profiles')
            .update({
                business_name:    bizName,
                business_phone:   bizPhone   || null,
                business_address: bizAddress || null,
                onboarding_done:  true
            })
            .eq('id', user.id);

        if (error) throw error;

        // Cache locally
        setUserItem('kfh_biz_name', bizName);
        if (bizPhone)   localStorage.setItem(`kfh_biz_phone_${user.id}`,   bizPhone);
        if (bizAddress) localStorage.setItem(`kfh_biz_address_${user.id}`, bizAddress);

        // Sync invoice template immediately
        if (window.InvoiceTemplate && window.InvoiceTemplate._syncBizFromProfile) {
            window.InvoiceTemplate._syncBizFromProfile({
                name: bizName, phone: bizPhone || '', address: bizAddress || ''
            });
        }

        msgEl.style.color = 'var(--color-success)';
        msgEl.textContent = '✅ Saved!';

        setTimeout(() => {
            document.getElementById('onboarding-modal')?.classList.remove('active');
        }, 800);

    } catch(e) {
        msgEl.style.color = 'var(--color-danger)';
        msgEl.textContent = '❌ Error: ' + e.message;
    }
};

// ===== DELETE ALL DATA =====
window.confirmDeleteAllData = function() {
    const confirmed = window.confirm(
        '⚠️ DELETE ALL DATA\n\nThis will permanently delete ALL your products, sales, purchases, customers, suppliers and expenses.\n\nThis CANNOT be undone. Are you sure?'
    );
    if (!confirmed) return;

    const typed = window.prompt('To confirm, type DELETE in capital letters:');
    if (typed !== 'DELETE') {
        alert('Cancelled.');
        return;
    }
    window.executeDeleteAllData();
};

window.executeDeleteAllData = async function() {
    const msgEl = document.getElementById('delete-data-msg');
    if (msgEl) { msgEl.style.color = 'orange'; msgEl.textContent = '⏳ Deleting...'; }

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not logged in');
        const uid = user.id;

        const tables = [
            'sale_items','purchase_items','return_items',
            'payments','returns','sales','purchases',
            'stock_adjustments','expenses','customers','suppliers','products'
        ];

        for (const table of tables) {
            const { error } = await window.StorageModule.supabase.from(table).delete().eq('user_id', uid);
            if (error) console.warn(`⚠️ ${table}:`, error.message);
        }

        if (msgEl) { msgEl.style.color = 'var(--color-success)'; msgEl.textContent = '✅ All data deleted.'; }
        setTimeout(() => {
            document.getElementById('settings-modal')?.classList.remove('active');
            if (typeof loadDashboardStats === 'function') loadDashboardStats();
            if (msgEl) msgEl.textContent = '';
        }, 2000);

    } catch(err) {
        if (msgEl) { msgEl.style.color = 'var(--color-danger)'; msgEl.textContent = '❌ ' + err.message; }
    }
};