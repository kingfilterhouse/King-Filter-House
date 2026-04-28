/* ==========================================
   JS START: Main Application Logic
   Handles UI interactions and business logic
   ========================================== */


// ===== GLOBAL STATE =====
let currentUser = null;

// ===== USER-SPECIFIC STORAGE HELPERS =====
// Now using window.Utils versions (from utils.js)



// ===== SHARED UTILITIES =====
// Now using centralized utils.js (loaded before this file)

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
            window.log('Updating user display:', user);
            
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
            
            window.log('✅ User display updated successfully');
        }
    } catch (error) {
        logError('Error updating user display:', error);
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
    
    // Initialize modals now that the app DOM is visible (needed for onboarding)
    initializeModalsAndUI();
    
    // Check onboarding status FIRST — show modal immediately if needed
    const needsOnboarding = await checkAndShowOnboarding();
    
    // Load heavy operations in the background (don't await)
    // This runs while user fills onboarding form or sees the dashboard
    Promise.all([
        loadDashboardStats(),
        loadUserSettingsAfterOnboarding(needsOnboarding)
    ]).catch(err => logError('Background loading error:', err));
}

/**
 * Check if user needs onboarding and show modal immediately if yes
 * Returns true if onboarding was shown, false if user already onboarded
 */
async function checkAndShowOnboarding() {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return false;

        const { data } = await window.StorageModule.supabase
            .from('profiles')
            .select('onboarding_done, business_name')
            .eq('id', user.id)
            .single();

        if (!data) return false;

        // Show onboarding if not done OR business name is empty/default
        const needsOnboarding = !data.onboarding_done || 
                                !data.business_name || 
                                data.business_name === 'My Business';

        if (needsOnboarding) {
            // Load custom fields first (needed for onboarding step 2)
            if (window.CustomFieldsModule) {
                await window.CustomFieldsModule.loadForUser();
            }
            // Show modal immediately (no delay needed anymore)
            setTimeout(() => window.showOnboardingModal?.(), 100);
            return true;
        }

        return false;
    } catch(e) {
        logWarn('Onboarding check error:', e.message);
        return false;
    }
}

/**
 * Load current user's settings (PIN, business name, currency) from Supabase
 * Called every time showApp() runs — ensures per-user isolation
 * Now called AFTER onboarding check (onboarding handled separately)
 */
async function loadUserSettingsAfterOnboarding(onboardingWasShown) {
    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return;

        const { data } = await window.StorageModule.supabase
            .from('profiles')
            .select('business_name, currency_symbol, finance_pin, business_phone, business_address')
            .eq('id', user.id)
            .single();

        if (data) {
            // Update finance PIN in memory ONLY
            if (data.finance_pin && window._updateFinancePin) {
                window._updateFinancePin(data.finance_pin);
            }
            // Cache settings (use user-specific key for biz contact info)
            const uid = user.id;
            if (data.business_name)    window.Utils.setUserItem('kfh_biz_name', data.business_name);
            if (data.currency_symbol)  window.Utils.setUserItem('kfh_currency', data.currency_symbol);
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
        }
        
        // Load custom field definitions (skip if onboarding already loaded them)
        if (!onboardingWasShown && window.CustomFieldsModule) {
            await window.CustomFieldsModule.loadForUser();
        }
    } catch(e) {
        logWarn('Could not load user settings:', e.message);
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
        window.log('✅ Login successful:', currentUser);
        
        // Clear form
        loginEmail.value = '';
        loginPassword.value = '';
        
        // Check subscription before showing app
        const allowed = await window.SubscriptionModule.gate();
        if (!allowed) return;
        // Show main app (this will also update user display)
        window._cachedUser = await window.StorageModule.getCurrentUser();
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
            window.log('✅ Registration successful');
            
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
                        window.log('✅ Auto-login successful');
                        
                        // Reset error style
                        authError.style.background = 'rgba(239, 68, 68, 0.1)';
                        authError.style.borderColor = 'var(--color-danger)';
                        authError.style.color = 'var(--color-danger)';
                        authError.style.display = 'none';
                        
                        const allowed = await window.SubscriptionModule.gate();
                        if (!allowed) return;
                        window._cachedUser = await window.StorageModule.getCurrentUser();
                        await showApp();
                    } else {
                        // Login failed, show login form
                        logError('Auto-login failed:', loginResult.error);
                        
                        authError.textContent = '✅ Account created! Please login manually.';
                        authError.style.display = 'block';
                        registerBtn.disabled = false;  // re-enable so user can try again if needed
                        
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
                    logError('Login error:', loginError);
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
        logError('Unexpected registration error:', error);
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
        window.log('✅ Logout successful');
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
        window.log('✅ User already logged in:', user);
        // Check subscription before showing app
        const allowed = await window.SubscriptionModule.gate();
        if (!allowed) return;
        window._cachedUser = await window.StorageModule.getCurrentUser();
        await showApp();
    } else {
        window.log('ℹ️ No user logged in');
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
window.StorageModule.onAuthStateChange(async (event, session) => {
    window.log('Auth state changed:', event);
    
    if (event === 'SIGNED_IN') {
        currentUser = session.user;
        const allowed = await window.SubscriptionModule.gate();
        if (!allowed) return;
        showApp();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showAuth();
    } else if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset-password link in their email.
        // Show a "Set New Password" form instead of the main app.
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
        // Hide login/register, show the recovery form
        if (loginForm)    loginForm.style.display    = 'none';
        if (registerForm) registerForm.style.display = 'none';
        const recoveryForm = document.getElementById('recovery-pw-form');
        if (recoveryForm) {
            recoveryForm.style.display = 'block';
        } else {
            // Fallback: build a minimal inline form if the HTML element doesn't exist yet
            const fb = document.createElement('div');
            fb.id = 'recovery-pw-form';
            fb.innerHTML = `
                <h3 style="margin-bottom:16px">Set New Password</h3>
                <input id="recovery-new-pw"     type="password" placeholder="New password"     style="width:100%;margin-bottom:10px;padding:10px;border-radius:8px;border:1px solid #2A3347;background:#0A0F1E;color:#fff;font-size:14px">
                <input id="recovery-confirm-pw" type="password" placeholder="Confirm password" style="width:100%;margin-bottom:14px;padding:10px;border-radius:8px;border:1px solid #2A3347;background:#0A0F1E;color:#fff;font-size:14px">
                <button id="recovery-save-btn"  style="width:100%;padding:12px;background:#0066FF;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Save New Password</button>
                <p id="recovery-msg" style="margin-top:10px;font-size:13px;text-align:center;color:#10B981;display:none">✅ Password updated! Signing you in…</p>`;
            authContainer.appendChild(fb);

            document.getElementById('recovery-save-btn').addEventListener('click', async () => {
                const pw1 = document.getElementById('recovery-new-pw').value;
                const pw2 = document.getElementById('recovery-confirm-pw').value;
                if (!pw1 || pw1.length < 6) { alert('Password must be at least 6 characters'); return; }
                if (pw1 !== pw2)            { alert('Passwords do not match'); return; }
                const btn = document.getElementById('recovery-save-btn');
                btn.disabled = true; btn.textContent = 'Saving…';
                const { error } = await window.StorageModule.supabase.auth.updateUser({ password: pw1 });
                if (error) {
                    alert('Error: ' + error.message);
                    btn.disabled = false; btn.textContent = 'Save New Password';
                } else {
                    document.getElementById('recovery-msg').style.display = 'block';
                    setTimeout(() => { fb.remove(); showApp(); }, 1500);
                }
            });
        }
    }
});

// ===== INITIALIZATION =====

// Initialize modals and UI - called after DOM is ready
function initializeModalsAndUI() {
    // Profile modal button
    const profileOpenBtn = document.getElementById('open-profile-btn');
    if (profileOpenBtn && !profileOpenBtn._initialized) {
        profileOpenBtn._initialized = true;  // Prevent double initialization
        profileOpenBtn.addEventListener('click', async () => {
            const modal = document.getElementById('profile-modal');
            // Use cached user — already fetched at login, no DB call needed
            const user  = window._cachedUser || await window.StorageModule.getCurrentUser();
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
    }

    // Settings modal button
    const settingsOpenBtn = document.getElementById('open-settings-btn');
    if (settingsOpenBtn && !settingsOpenBtn._initialized) {
        settingsOpenBtn._initialized = true;  // Prevent double initialization
        
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
                        window.Utils.setUserItem('kfh_biz_name', bizName);
                        window.Utils.setUserItem('kfh_currency', currency);
                    }
                }
            } catch(e) {
                bizName  = window.Utils.getUserItem('kfh_biz_name', 'My Business');
                currency = window.Utils.getUserItem('kfh_currency', 'PKR');
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

        settingsOpenBtn.addEventListener('click', async () => {
            // Open modal INSTANTLY using already-cached data
            const bizInput = document.getElementById('settings-business-name');
            const curInput = document.getElementById('settings-currency');
            const interval = localStorage.getItem('kfh_notif_interval') || '5';
            const intSelect = document.getElementById('settings-notif-interval');
            if (bizInput) bizInput.value = window.Utils.getUserItem('kfh_biz_name', 'My Business');
            if (curInput) curInput.value = window.Utils.getUserItem('kfh_currency', 'PKR');
            if (intSelect) intSelect.value = interval;
            document.querySelector('.user-dropdown')?.classList.remove('active');
            document.getElementById('settings-modal')?.classList.add('active');
            if (window.CustomFieldsModule) {
                window.CustomFieldsModule.renderSettingsFieldsSummary?.();
            }
            // Sync fresh data from DB quietly in background (no await = non-blocking)
            loadSettings();
            if (window.CustomFieldsModule) {
                window.CustomFieldsModule.renderSettingsFieldsSummary?.();
            }
        });
    }
    
    window.log('✅ Modals initialized');
}

// ===== OFFLINE/ONLINE HANDLERS =====
function handleOffline() {
    // Create notification bubble
    const bubble = document.createElement('div');
    bubble.id = 'offline-bubble';
    bubble.className = 'offline-bubble expanded';
    
    bubble.innerHTML = `
        <div class="bubble-header" onclick="this.parentElement.classList.toggle('expanded')">
            <span class="bubble-icon">📡</span>
            <span class="bubble-title">Offline Mode</span>
            <span class="bubble-toggle">−</span>
        </div>
        <div class="bubble-content">
            <p>You are viewing cached data. Changes cannot be saved until reconnected.</p>
        </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.id = 'offline-bubble-styles';
    style.textContent = `
        .offline-bubble {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #ff9800;
            color: white;
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            z-index: 9999;
            min-width: 80px;
            max-width: 320px;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        
        .offline-bubble.expanded {
            min-width: 300px;
        }
        
        .bubble-header {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        
        .bubble-icon {
            font-size: 18px;
        }
        
        .bubble-title {
            flex: 1;
            font-weight: 600;
            font-size: 14px;
        }
        
        .bubble-toggle {
            font-size: 20px;
            font-weight: bold;
            transition: transform 0.3s ease;
        }
        
        .offline-bubble:not(.expanded) .bubble-toggle {
            transform: rotate(180deg);
        }
        
        .bubble-content {
            max-height: 200px;
            opacity: 1;
            padding: 0 16px 16px 16px;
            transition: all 0.3s ease;
        }
        
        .offline-bubble:not(.expanded) .bubble-content {
            max-height: 0;
            opacity: 0;
            padding: 0 16px;
        }
        
        .bubble-content p {
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
        }
        
        @media (max-width: 768px) {
            .offline-bubble {
                bottom: 16px;
                right: 16px;
                max-width: calc(100vw - 32px);
            }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(bubble);
    
    // Disable all save/create/delete buttons
    document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('save') || text.includes('create') || text.includes('add') || 
            text.includes('delete') || text.includes('update') || text.includes('record')) {
            btn.disabled = true;
            btn.dataset.offlineDisabled = 'true';
        }
    });
}

function handleOnline() {
    const bubble = document.getElementById('offline-bubble');
    if (bubble) {
        bubble.remove();
    }
    
    const styles = document.getElementById('offline-bubble-styles');
    if (styles) {
        styles.remove();
    }
    
    // Re-enable ALL buttons that were disabled by offline mode
    document.querySelectorAll('button[data-offline-disabled="true"]').forEach(btn => {
        btn.disabled = false;
        btn.removeAttribute('data-offline-disabled');
    });
    
    window.Utils?.showToast?.('✅ Back online! You can now save changes.', 'success');
}

// Check authentication status when page loads
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initNavigation();
    updateDashboardTime();
    setInterval(updateDashboardTime, 1000);
    
    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('✅ Service Worker registered for offline support'))
            .catch(err => console.error('❌ Service Worker registration failed:', err));
    }
    
    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check initial connection status
    if (!navigator.onLine) {
        handleOffline();
    }
});

// ===== DASHBOARD STATS =====
async function loadDashboardStats() {
    try {
        window.log('📊 Loading dashboard stats...');
        
        const user = await window.StorageModule.getCurrentUser();
        if (!user) return;

        // Load all data in parallel for much faster dashboard loading
        const [
            productsResult,
            salesResult,
            purchasesResult,
            returnsResult,
            customersResult,
            suppliersResult
        ] = await Promise.all([
            window.StorageModule.getAllData('products'),
            window.StorageModule.getAllData('sales'),
            window.StorageModule.getAllData('purchases'),
            window.StorageModule.getAllData('returns'),
            window.StorageModule.getAllData('customers'),
            window.StorageModule.getAllData('suppliers')
        ]);

        const products = productsResult.success ? productsResult.data : [];
        const sales = salesResult.success ? salesResult.data : [];
        const purchases = purchasesResult.success ? purchasesResult.data : [];
        const allReturns = returnsResult.success ? returnsResult.data : [];
        const customers = customersResult.success ? customersResult.data : [];
        const suppliers = suppliersResult.success ? suppliersResult.data : [];
        
        // Performance log for large datasets
        if (sales.length > 5000) {
            console.warn(`⚠️ Large dataset detected: ${sales.length} sales. Dashboard may be slow.`);
        }

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
        const lowStockProducts = products.filter(p => {
            const threshold = (p.reorder_threshold !== null && p.reorder_threshold !== undefined)
                ? p.reorder_threshold : 10;
            return p.stock <= threshold && threshold > 0;
        }).length;
        
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
        
        // Customers and suppliers already loaded in parallel above
        
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

        window.log('✅ Dashboard stats updated');
        window.log('📈 Revenue:', `PKR ${Math.round(totalRevenue).toLocaleString()}`, '| Profit:', `PKR ${Math.round(profit).toLocaleString()}`);
        window.log('💰 AR:', `PKR ${Math.round(totalAccountsReceivable).toLocaleString()}`, '| AP:', `PKR ${Math.round(totalAccountsPayable).toLocaleString()}`);

        // Check for seasonal alerts
        await checkSeasonalAlerts(products, sales);

    } catch (error) {
        logError('❌ Error loading dashboard stats:', error);
    }
}

// ===== SEASONAL ALERTS =====
async function checkSeasonalAlerts(products, sales) {
    try {
        // Load all sale items
        const saleItemsMap = {};
        for (let sale of sales) {
            const itemsResult = await window.StorageModule.supabase
                .from('sale_items')
                .select('*')
                .eq('sale_id', sale.id);
            
            if (!itemsResult.error && itemsResult.data) {
                itemsResult.data.forEach(item => {
                    if (!saleItemsMap[item.product_id]) {
                        saleItemsMap[item.product_id] = [];
                    }
                    saleItemsMap[item.product_id].push({
                        ...item,
                        sale_date: sale.sale_date || sale.created_at
                    });
                });
            }
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const alerts = [];

        products.forEach(product => {
            const saleItems = saleItemsMap[product.id] || [];
            
            // Need at least 90 days of data
            const oldestSale = saleItems.length > 0
                ? new Date(Math.min(...saleItems.map(s => new Date(s.sale_date))))
                : now;
            const daysOfData = Math.ceil((now - oldestSale) / (1000 * 60 * 60 * 24));
            
            if (daysOfData < 90 || saleItems.length === 0) return;

            // Group sales by month
            const salesByMonth = {};
            saleItems.forEach(item => {
                const month = new Date(item.sale_date).getMonth();
                salesByMonth[month] = (salesByMonth[month] || 0) + (item.quantity || 0);
            });

            // Find peak months
            const totalSold = saleItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const monthlyAvg = totalSold / 12;
            
            Object.entries(salesByMonth).forEach(([month, qty]) => {
                if (qty <= monthlyAvg) return; // Not a peak month
                
                const peakMonth = parseInt(month);
                let monthsAway = peakMonth - currentMonth;
                if (monthsAway < 0) monthsAway += 12;
                
                const daysAway = monthsAway * 30;
                
                // Alert if peak is within 30 days
                if (daysAway > 0 && daysAway <= 30) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    alerts.push({
                        productName: product.name,
                        month: monthNames[peakMonth],
                        daysAway: daysAway,
                        currentStock: product.stock,
                        avgSales: (qty / (daysOfData / 365)).toFixed(1)
                    });
                }
            });
        });

        // Show alerts (max 3 to avoid spam)
        alerts.slice(0, 3).forEach(alert => {
            const message = `📈 ${alert.productName} sells best in ${alert.month} — only ${alert.daysAway} days away! Current stock: ${alert.currentStock}`;
            
            if (window.Utils?.showToast) {
                window.Utils.showToast(message, 'warning', 8000);
            }
        });

    } catch (error) {
        logError('Error checking seasonal alerts:', error);
    }
}

// ===== EXPORT ALL DATA =====
window.exportAllData = async function() {
    const btn = document.getElementById('export-all-data-btn');
    const msg = document.getElementById('export-data-msg');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparing export...'; }
    if (msg) msg.textContent = '';

    try {
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not logged in');

        const tables = [
            { name: 'products',          label: 'Products' },
            { name: 'sales',             label: 'Sales' },
            { name: 'sale_items',        label: 'Sale Items' },
            { name: 'purchases',         label: 'Purchases' },
            { name: 'purchase_items',    label: 'Purchase Items' },
            { name: 'customers',         label: 'Customers' },
            { name: 'suppliers',         label: 'Suppliers' },
            { name: 'returns',           label: 'Returns' },
            { name: 'return_items',      label: 'Return Items' },
            { name: 'expenses',          label: 'Expenses' },
            { name: 'payments',          label: 'Payments' },
            { name: 'stock_adjustments', label: 'Stock Adjustments' },
        ];

        function toCSV(rows) {
            if (!rows || rows.length === 0) return 'No data\n';
            const keys = Object.keys(rows[0]);
            const header = keys.join(',');
            const body = rows.map(row =>
                keys.map(k => {
                    const val = row[k] === null || row[k] === undefined ? '' : String(row[k]);
                    return `"${val.replace(/"/g, '""')}"`;
                }).join(',')
            ).join('\n');
            return header + '\n' + body + '\n';
        }

       // Build a multi-section CSV file (one section per table, separated by blank lines)
        let fullContent = `HisabDesk — Full Data Export\nExported: ${new Date().toLocaleString()}\nUser: ${user.email}\n\n`;

        for (const t of tables) {
            const res = await window.StorageModule.getAllData(t.name);
            const rows = res.success ? res.data : [];
            fullContent += `===== ${t.label.toUpperCase()} (${rows.length} records) =====\n`;
            fullContent += toCSV(rows);
            fullContent += '\n';
        }

        // Trigger download
        const blob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `hisabdesk_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (msg) msg.textContent = '✅ Export downloaded successfully!';
        setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);

    } catch (err) {
        logError('Export error:', err);
        if (msg) { msg.style.color = 'var(--color-danger)'; msg.textContent = '❌ Export failed: ' + err.message; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 Export All Data (CSV)'; }
    }
};

// Export app functions
window.AppModule = {
    loadDashboardStats: loadDashboardStats
};



window.log('✅ App Module Loaded');

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
    
    window.log(`📄 Navigated to: ${pageName}`);
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
                window.log(`🔄 Initializing module for page: ${pageName}`);
                
                if (pageName === 'dashboard') {
                    // Reload dashboard stats
                    if (window.AppModule && window.AppModule.loadDashboardStats) {
                        window.AppModule.loadDashboardStats();
                    }
                }
                else if (pageName === 'products') {
                    if (window.ProductsModule && window.ProductsModule.loadProducts) {
                        window.log('📦 Loading Products Module...');
                        window.ProductsModule.loadProducts();
                    }
                }
                else if (pageName === 'sales') {
                    // CRITICAL FIX: Initialize sales module
                    if (window.SalesModule && window.SalesModule.initSalesPage) {
                        window.log('💰 Initializing Sales Module...');
                        window.SalesModule.initSalesPage();
                    }
                }
                else if (pageName === 'quick-sale') {
                    if (window.QuickSaleModule && window.QuickSaleModule.initQuickSale) {
                        window.log('🛒 Initializing Quick Sale Module...');
                        window.QuickSaleModule.initQuickSale();
                    }
                }
                else if (pageName === 'purchases') {
                    // CRITICAL FIX: Initialize purchases module
                    if (window.PurchasesModule && window.PurchasesModule.initPurchasesPage) {
                        window.log('📥 Initializing Purchases Module...');
                        window.PurchasesModule.initPurchasesPage();
                    }
                }
                else if (pageName === 'quick-purchase') {
                    if (window.QuickPurchaseModule && window.QuickPurchaseModule.initQuickPurchase) {
                        window.log('🛒 Initializing Quick Purchase Module...');
                        window.QuickPurchaseModule.initQuickPurchase();
                    }
                }
                else if (pageName === 'returns') {
                    // CRITICAL FIX: Initialize returns module
                    if (window.ReturnsModule && window.ReturnsModule.initReturnsPage) {
                        window.log('↩️ Initializing Returns Module...');
                        window.ReturnsModule.initReturnsPage();
                    }
                }
                else if (pageName === 'customers') {
                    // CRITICAL FIX: Initialize customers module
                    if (window.CustomersModule && window.CustomersModule.initCustomersPage) {
                        window.log('👥 Initializing Customers Module...');
                        window.CustomersModule.initCustomersPage();
                    }
                }
                else if (pageName === 'suppliers') {
                    // CRITICAL FIX: Initialize suppliers module
                    if (window.SuppliersModule && window.SuppliersModule.initSuppliersPage) {
                        window.log('🚚 Initializing Suppliers Module...');
                        window.SuppliersModule.initSuppliersPage();
                    }
                }
                else if (pageName === 'reports') {
                    if (window.ReportsModule && window.ReportsModule.loadReports) {
                        window.log('📊 Loading Reports Module...');
                        window.ReportsModule.loadReports();
                    }
                }
                else if (pageName === 'accounts') {
                    // Initialize accounts module
                    if (window.AccountsModule && window.AccountsModule.loadAccounts) {
                        window.log('🏦 Loading Accounts Module...');
                        window.AccountsModule.loadAccounts();
                    }
                }

                else if (pageName === 'expenses') {
                    if (window.ExpensesModule && window.ExpensesModule.initExpensesPage) {
                        window.log('💸 Initializing Expenses Module...');
                        window.ExpensesModule.initExpensesPage();
                    }
                }
            }, 150);
        }
    });

    // FAB functionality
    const fabTrigger   = document.getElementById('fab-trigger');
    const fabContainer = document.querySelector('.fab-container');
    const fabActions   = fabContainer ? fabContainer.querySelector('.fab-actions') : null;
    const fabIconPlus  = fabTrigger  ? fabTrigger.querySelector('.fab-icon-plus')  : null;
    const fabIconClose = fabTrigger  ? fabTrigger.querySelector('.fab-icon-close') : null;

    function openFab() {
        if (!fabContainer) return;
        fabContainer.classList.add('active');
        if (fabActions)   { fabActions.style.opacity = '1'; fabActions.style.visibility = 'visible'; fabActions.style.transform = 'translateY(0)'; fabActions.style.pointerEvents = 'auto'; }
        if (fabIconPlus)  fabIconPlus.style.display  = 'none';
        if (fabIconClose) fabIconClose.style.display = 'block';
    }

    function closeFab() {
        if (!fabContainer) return;
        fabContainer.classList.remove('active');
        if (fabActions)   { fabActions.style.opacity = '0'; fabActions.style.visibility = 'hidden'; fabActions.style.transform = 'translateY(10px)'; fabActions.style.pointerEvents = 'none'; }
        if (fabIconPlus)  fabIconPlus.style.display  = 'block';
        if (fabIconClose) fabIconClose.style.display = 'none';
    }

    if (fabTrigger) {
        fabTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            fabContainer.classList.contains('active') ? closeFab() : openFab();
        });
    }

    // Wire speed-dial action buttons to navigate and close FAB
    if (fabContainer) {
        fabContainer.querySelectorAll('.fab-action-item[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                navigateToPage(btn.dataset.page);
                closeFab();
            });
        });
    }

    // Close FAB when clicking anywhere else
    document.addEventListener('click', (e) => {
        if (fabContainer && !fabContainer.contains(e.target)) {
            closeFab();
        }
    });

    // Search overlay functionality
    const searchTrigger = document.getElementById('search-trigger');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

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
            logError('❌ Global search error:', err);
            searchResults.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--color-danger);">Search failed. Please try again.</div>`;
        }
    }

    if (searchTrigger && searchOverlay) {
        // Single delegated listener handles ALL result/quick-action button clicks
        if (searchResults) {
            searchResults.addEventListener('click', (e) => {
                const btn = e.target.closest('.search-result-item[data-page]');
                if (!btn) return;
                navigateToPage(btn.dataset.page);
                searchOverlay.classList.remove('active');
                if (searchInput) searchInput.value = '';
                if (searchResults) searchResults.innerHTML = defaultSearchHTML;
            });
        }

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
    
    window.log('✅ Navigation System Loaded');

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
// NOTE: The open-button listener is registered in initializeModalsAndUI() (fast cached path).
// This IIFE only defines window.saveProfile so the HTML onclick can call it.
(function() {
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
// NOTE: The open-button listener is registered in initializeModalsAndUI() (instant cached open).
// This IIFE only defines window.saveNewPin and window.saveBusinessSettings for HTML onclicks.
(function() {
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
            if (biz) window.Utils.setUserItem('kfh_biz_name', biz);
            if (cur) window.Utils.setUserItem('kfh_currency', cur);

            msg.style.color = 'var(--color-success)';
            msg.textContent = '✅ Saved';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
            if (window.InvoiceTemplate?.invalidateManagerCache) window.InvoiceTemplate.invalidateManagerCache();

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
            logError('Notification load error:', e);
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

} // closes initNavigation()

// ===== ONBOARDING =====
// ===== ONBOARDING — 3-STEP FLOW =====
let _obStep = 1;
let _obCustomFields = []; // Each field: { label: '', is_dropdown: false }

function _obSetStep(n) {
    _obStep = n;
    [1,2,3].forEach(i => {
        document.getElementById(`ob-step-${i}`)?.style && 
            (document.getElementById(`ob-step-${i}`).style.display = i === n ? 'block' : 'none');
        const dot = document.getElementById(`ob-step-${i}-dot`);
        if (dot) {
            if (i < n) {
                dot.style.background = 'var(--color-success)';
                dot.style.color = '#fff';
                dot.textContent = '✓';
            } else if (i === n) {
                dot.style.background = 'var(--color-primary)';
                dot.style.color = '#fff';
                dot.textContent = String(i);
            } else {
                dot.style.background = 'var(--color-border)';
                dot.style.color = 'var(--color-text-muted)';
                dot.textContent = String(i);
            }
        }
        const line = document.getElementById(`ob-line-${i}`);
        if (line) line.style.background = i < n ? 'var(--color-success)' : 'var(--color-border)';
    });
    // Update button labels
    const nextBtn = document.getElementById('ob-next-btn');
    const skipBtn = document.getElementById('ob-skip-btn');
    if (n === 3) {
        if (nextBtn) nextBtn.textContent = '🎉 Finish Setup';
        if (skipBtn) skipBtn.textContent = 'Skip PIN';
    } else {
        if (nextBtn) nextBtn.textContent = 'Next →';
        if (skipBtn) skipBtn.textContent = 'Skip';
    }
}

window.obAddCustomField = function() {
    if (_obCustomFields.length >= 5) return;
    _obCustomFields.push({ label: '', is_dropdown: false });
    _obRenderCustomFields();
};

window.obRemoveCustomField = function(idx) {
    _obCustomFields.splice(idx, 1);
    _obRenderCustomFields();
};

function _obRenderCustomFields() {
    const list = document.getElementById('ob-custom-fields-list');
    const btn  = document.getElementById('ob-add-field-btn');
    const limit = document.getElementById('ob-fields-limit-msg');
    const info = document.getElementById('ob-dropdown-info');
    
    if (!list) return;
    
    const dropdownCount = _obCustomFields.filter(f => f.is_dropdown).length;
    
    list.innerHTML = _obCustomFields.map((f, i) => {
        const isDropdown = f.is_dropdown || false;
        const dropdownBtnClass = isDropdown ? 'ob-field-dropdown-btn active' : 'ob-field-dropdown-btn';
        const dropdownDisabled = (!isDropdown && dropdownCount >= 2) ? ' disabled' : '';
        
        return `
        <div class="ob-field-row">
            <input type="text" class="form-control" placeholder="Field label (e.g. Machine)"
                   value="${f.label}"
                   oninput="_obCustomFields[${i}].label = this.value"
                   style="flex:1;">
            <button 
                class="${dropdownBtnClass}" 
                onclick="window.obToggleDropdown(${i})"
                ${dropdownDisabled}
                title="Use as dropdown in Quick Sale">
                ⬇️
            </button>
            <button class="ob-field-remove-btn" onclick="window.obRemoveCustomField(${i})">×</button>
        </div>`;
    }).join('');
    
    if (btn)   btn.style.display   = _obCustomFields.length >= 5 ? 'none' : '';
    if (limit) limit.style.display = _obCustomFields.length >= 5 ? 'block' : 'none';
    if (info)  info.style.display  = _obCustomFields.length > 0 ? 'block' : 'none';
}

// Toggle dropdown field status
window.obToggleDropdown = function(idx) {
    const f = _obCustomFields[idx];
    const dropdownCount = _obCustomFields.filter(field => field.is_dropdown).length;
    
    if (!f.is_dropdown) {
        // Trying to enable
        if (dropdownCount >= 2) {
            window.Utils.showToast('Maximum 2 dropdown fields allowed', 'warning');
            return;
        }
        f.is_dropdown = true;
    } else {
        // Disable
        f.is_dropdown = false;
    }
    _obRenderCustomFields();
};

window.showOnboardingModal = function() {
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;
    _obStep = 1;
    _obCustomFields = [];
    _obSetStep(1);
    _obRenderCustomFields();
    const bizInput = document.getElementById('onboard-biz-name');
    const cached = window.Utils.getUserItem('kfh_biz_name');
    if (bizInput && cached && cached !== 'My Business' && cached !== 'King Filter House') {
        bizInput.value = cached;
    }
    modal.classList.add('active');
    setTimeout(() => document.getElementById('onboard-biz-name')?.focus(), 200);
};

// ===== CUSTOM FIELDS MANAGER (Settings / Product Form) =====
let _cfmFields = [];

window.openCustomFieldsManager = async function() {
    const modal = document.getElementById('custom-fields-manager-modal');
    if (!modal) return;
    
    // Load existing custom fields
    if (window.CustomFieldsModule) {
        await window.CustomFieldsModule.loadForUser();
        const allDefs = window.CustomFieldsModule.getAllDefs();
        _cfmFields = allDefs
            .filter(d => !d.column_name) // Only EAV fields (not system columns)
            .map(d => ({
                id: d.id,
                label: d.field_label,
                is_dropdown: d.is_dropdown_field || false
            }));
    } else {
        _cfmFields = [];
    }
    
    _cfmRenderFields();
    modal.classList.add('active');
};

window.closeCustomFieldsManager = function() {
    const modal = document.getElementById('custom-fields-manager-modal');
    if (modal) modal.classList.remove('active');
};

window.cfmAddField = function() {
    if (_cfmFields.length >= 5) return;
    _cfmFields.push({ id: null, label: '', is_dropdown: false });
    _cfmRenderFields();
};

window.cfmRemoveField = function(idx) {
    _cfmFields.splice(idx, 1);
    _cfmRenderFields();
};

window.cfmToggleDropdown = function(idx) {
    const f = _cfmFields[idx];
    const dropdownCount = _cfmFields.filter(field => field.is_dropdown).length;
    
    if (!f.is_dropdown) {
        if (dropdownCount >= 2) {
            window.Utils.showToast('Maximum 2 dropdown fields allowed', 'warning');
            return;
        }
        f.is_dropdown = true;
    } else {
        f.is_dropdown = false;
    }
    _cfmRenderFields();
};

function _cfmRenderFields() {
    const list = document.getElementById('cfm-custom-fields-list');
    const btn = document.getElementById('cfm-add-field-btn');
    const limit = document.getElementById('cfm-fields-limit-msg');
    const info = document.getElementById('cfm-dropdown-info');
    
    if (!list) return;
    
    const dropdownCount = _cfmFields.filter(f => f.is_dropdown).length;
    
    list.innerHTML = _cfmFields.map((f, i) => {
        const isDropdown = f.is_dropdown || false;
        const dropdownBtnClass = isDropdown ? 'ob-field-dropdown-btn active' : 'ob-field-dropdown-btn';
        const dropdownDisabled = (!isDropdown && dropdownCount >= 2) ? ' disabled' : '';
        
        return `
        <div class="ob-field-row">
            <input type="text" class="form-control" placeholder="Field label (e.g. Machine)"
                   value="${f.label}"
                   oninput="_cfmFields[${i}].label = this.value"
                   style="flex:1;">
            <button 
                class="${dropdownBtnClass}" 
                onclick="window.cfmToggleDropdown(${i})"
                ${dropdownDisabled}
                title="Use as dropdown in Quick Sale">
                ⬇️
            </button>
            <button class="ob-field-remove-btn" onclick="window.cfmRemoveField(${i})">×</button>
        </div>`;
    }).join('');
    
    if (btn) btn.style.display = _cfmFields.length >= 5 ? 'none' : '';
    if (limit) limit.style.display = _cfmFields.length >= 5 ? 'block' : 'none';
    if (info) info.style.display = _cfmFields.length > 0 ? 'block' : 'none';
}

window.saveCustomFieldsManager = async function() {
    if (!window.CustomFieldsModule) {
        window.Utils.showToast('Custom fields module not loaded', 'error');
        return;
    }
    
    const validFields = _cfmFields.filter(f => f.label.trim());
    
    try {
        // Get current user
        const user = await window.StorageModule.getCurrentUser();
        if (!user) throw new Error('Not authenticated');
        
        // Delete all existing custom fields (non-column ones)
        const allDefs = window.CustomFieldsModule.getAllDefs();
        const existingEavDefs = allDefs.filter(d => !d.column_name);
        
        for (const def of existingEavDefs) {
            await window.StorageModule.supabase
                .from('product_field_definitions')
                .delete()
                .eq('id', def.id);
        }
        
        // Add new fields
        for (let i = 0; i < validFields.length; i++) {
            const field = validFields[i];
            await window.StorageModule.supabase
                .from('product_field_definitions')
                .insert({
                    user_id: user.id,
                    field_label: field.label,
                    field_type: 'text',
                    field_order: i + 1,
                    show_on_invoice: false,
                    is_searchable: true,
                    show_on_purchase: true,
                    is_required: false,
                    column_name: null,
                    category_scope: null,
                    is_dropdown_field: field.is_dropdown
                });
        }
        
        // Reload custom fields
        await window.CustomFieldsModule.loadForUser();
        
        window.Utils.showToast('Custom fields saved!', 'success');
        window.closeCustomFieldsManager();
        
        // Refresh the settings page display if it exists
        if (window.CustomFieldsModule.renderSettingsFieldsSummary) {
            window.CustomFieldsModule.renderSettingsFieldsSummary();
        }
        
    } catch (error) {
        window.Utils.showToast('Error saving fields: ' + error.message, 'error');
        console.error(error);
    }
};

window.obNext = async function() {
    if (_obStep === 1) {
        // Validate & save step 1
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
                .update({ business_name: bizName, business_phone: bizPhone || null, business_address: bizAddress || null })
                .eq('id', user.id);
            if (error) throw error;
            window.Utils.setUserItem('kfh_biz_name', bizName);
            if (bizPhone)   localStorage.setItem(`kfh_biz_phone_${user.id}`,   bizPhone);
            if (bizAddress) localStorage.setItem(`kfh_biz_address_${user.id}`, bizAddress);
            if (window.InvoiceTemplate?._syncBizFromProfile) {
                window.InvoiceTemplate._syncBizFromProfile({ name: bizName, phone: bizPhone || '', address: bizAddress || '' });
            }
            msgEl.textContent = '';
            _obSetStep(2);
        } catch(e) {
            msgEl.style.color = 'var(--color-danger)';
            msgEl.textContent = '❌ ' + e.message;
        }
    } else if (_obStep === 2) {
        // Save custom fields (filter out empty labels)
        const validFields = _obCustomFields.filter(f => f.label.trim());
        if (validFields.length > 0 && window.CustomFieldsModule?.saveOnboardingFields) {
            await window.CustomFieldsModule.saveOnboardingFields(validFields);
        }
        _obSetStep(3);
        setTimeout(() => document.getElementById('ob-pin')?.focus(), 100);
    } else if (_obStep === 3) {
        // Save PIN and finish
        const pin  = document.getElementById('ob-pin')?.value;
        const conf = document.getElementById('ob-pin-confirm')?.value;
        const msg  = document.getElementById('ob-pin-msg');
        if (pin) {
            if (pin.length !== 4 || isNaN(pin)) {
                msg.style.color = 'var(--color-danger)';
                msg.textContent = '❌ PIN must be exactly 4 digits';
                return;
            }
            if (pin !== conf) {
                msg.style.color = 'var(--color-danger)';
                msg.textContent = '❌ PINs do not match';
                return;
            }
            try {
                const user = await window.StorageModule.getCurrentUser();
                if (user) {
                    await window.StorageModule.supabase
                        .from('profiles').update({ finance_pin: pin, onboarding_done: true }).eq('id', user.id);
                    if (window._updateFinancePin) window._updateFinancePin(pin);
                }
            } catch(e) { logWarn('PIN save error:', e.message); }
        } else {
            // No PIN entered — just mark done
            try {
                const user = await window.StorageModule.getCurrentUser();
                if (user) {
                    await window.StorageModule.supabase
                        .from('profiles').update({ onboarding_done: true }).eq('id', user.id);
                }
            } catch(e) {}
        }
        window.Utils.showToast('🎉 Setup complete! Welcome to Aasan ERP', 'success');
        document.getElementById('onboarding-modal')?.classList.remove('active');
    }
};

window.skipOnboarding = async function() {
    if (_obStep === 1) {
        // Skip entirely — mark done
        document.getElementById('onboarding-modal')?.classList.remove('active');
        try {
            const user = await window.StorageModule.getCurrentUser();
            if (user) await window.StorageModule.supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id);
        } catch(e) {}
    } else if (_obStep === 2) {
        // Skip custom fields, go to PIN
        _obSetStep(3);
        setTimeout(() => document.getElementById('ob-pin')?.focus(), 100);
    } else if (_obStep === 3) {
        // Skip PIN — just finish
        try {
            const user = await window.StorageModule.getCurrentUser();
            if (user) await window.StorageModule.supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id);
        } catch(e) {}
        window.Utils.showToast('🎉 Setup complete! Welcome to Aasan ERP', 'success');
        document.getElementById('onboarding-modal')?.classList.remove('active');
    }
};

// Legacy — kept for backward compatibility in case anything calls it
window.saveOnboarding = window.obNext;



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
            if (error) logWarn(`⚠️ ${table}:`, error.message);
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