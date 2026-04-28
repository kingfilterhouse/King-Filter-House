/* ==========================================
   SUBSCRIPTION MODULE - PROFESSIONAL VERSION
   Manages trial periods and subscription status
   ========================================== */

window.SubscriptionModule = (function () {
    'use strict';

    async function checkSubscription() {
        try {
            // Check if user is in the permanent free list
            const user = await window.StorageModule.getCurrentUser();
            if (user && window.AppConfig.FREE_USERS) {
                const userEmail = user.email.toLowerCase();
                const freeUsers = window.AppConfig.FREE_USERS.map(e => e.toLowerCase());
                if (freeUsers.includes(userEmail)) {
                    window.log('✅ Permanent free user - full access granted');
                    return { active: true, daysLeft: 9999, permanent: true };
                }
            }
            
            // OFFLINE MODE: Skip subscription check, trust cached session
            if (!navigator.onLine) {
                window.log('📡 Offline mode - skipping subscription check');
                if (user) {
                    return { active: true, offline: true, daysLeft: 999 };
                } else {
                    return { active: false, reason: 'not_logged_in' };
                }
            }
            
            if (!window.StorageModule || !window.StorageModule.supabase) {
                logWarn('⚠️ StorageModule not ready');
                // In development, allow access. In production, this should be stricter.
                return window.AppConfig.isDevelopment() 
                    ? { active: true } 
                    : { active: false, reason: 'system_error' };
            }

            // User already retrieved earlier, no need to get again
            if (!user) {
                return { active: false, reason: 'not_logged_in' };
            }

            const { data, error } = await window.StorageModule.supabase
                .from('profiles')
                .select('subscription_expires_at, is_active, business_name, full_name')
                .eq('id', user.id)
                .single();

            // No profile — create trial and allow in
            if (error || !data) {
                logWarn('⚠️ No profile found — creating trial');
                try {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + window.AppConfig.TRIAL_DAYS);
                    
                    await window.StorageModule.supabase
                        .from('profiles')
                        .insert({
                            id: user.id,
                            full_name: user.user_metadata?.full_name || '',
                            business_name: window.AppConfig.COMPANY_NAME,
                            subscription_expires_at: expiryDate.toISOString(),
                            is_active: true
                        });
                    
                    window.log('✅ Trial period created:', window.AppConfig.TRIAL_DAYS, 'days');
                } catch(e) {
                    logError('Profile insert error:', e);
                }
                return { active: true, daysLeft: window.AppConfig.TRIAL_DAYS };
            }

            // Manually disabled
            if (data.is_active === false) {
                return {
                    active: false,
                    reason: 'disabled',
                    message: 'Your account has been disabled. Please contact support.',
                    businessName: data.business_name
                };
            }

            // Check expiry
            const expiresAt = new Date(data.subscription_expires_at);
            const now       = new Date();
            const daysLeft  = Math.ceil((expiresAt - now) / 86400000);

            if (expiresAt < now) {
                return {
                    active: false,
                    reason: 'expired',
                    daysLeft,
                    message: `Your free trial has ended. Please contact us to continue using ${window.AppConfig.APP_NAME}.`,
                    businessName: data.business_name
                };
            }

            return { active: true, daysLeft, businessName: data.business_name };

        } catch (err) {
            logError('❌ Subscription check error:', err);
            
            // SECURITY: In production, on error we should be cautious
            // For now, log the error and alert admin
            if (!window.AppConfig.isDevelopment()) {
                logError('⚠️ SUBSCRIPTION CHECK FAILED - Admin should be notified');
                // TODO: Send alert to admin
            }
            
            // Allow access on error to prevent locking out users due to bugs
            // But log this prominently
            return { active: true, error: true };
        }
    }

    function showExpiredScreen(info) {
        const old = document.getElementById('sub-expired-screen');
        if (old) old.remove();

        const app  = document.getElementById('app-container');
        const auth = document.getElementById('auth-container');
        if (app)  app.style.display  = 'none';
        if (auth) auth.style.display = 'none';

        const isDisabled = info.reason === 'disabled';

        const screen = document.createElement('div');
        screen.id    = 'sub-expired-screen';
        screen.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0A0F1E 0%,#141A2E 100%);font-family:Arial,sans-serif;padding:20px';

        screen.innerHTML = `
            <div style="background:#141A2E;border:1px solid #2A3347;border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center">
                <div style="font-size:56px;margin-bottom:12px">${isDisabled ? '🔒' : '⏰'}</div>
                <h2 style="color:#fff;font-size:22px;margin:0 0 6px">${isDisabled ? 'Account Disabled' : 'Free Trial Ended'}</h2>
                ${info.businessName ? `<p style="color:#A0A8C4;font-size:13px;margin:0 0 20px">${window.Utils.sanitizeInput(info.businessName)}</p>` : '<div style="margin-bottom:20px"></div>'}
                <div style="background:rgba(255,23,68,0.08);border:1px solid rgba(255,23,68,0.25);border-radius:12px;padding:14px;margin-bottom:24px">
                    <p style="color:#fca5a5;margin:0;font-size:14px;line-height:1.6">${info.message}</p>
                </div>
                <div style="background:#0A0F1E;border:1px solid #2A3347;border-radius:12px;padding:18px;margin-bottom:24px;text-align:left">
                    <p style="color:#6B7694;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;font-weight:600">How to Renew</p>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <span style="font-size:20px">📱</span>
                        <span style="color:#E8ECFB;font-size:14px">Send <strong>${window.AppConfig.SUBSCRIPTION_CURRENCY} ${window.AppConfig.SUBSCRIPTION_PRICE.toLocaleString()}</strong> via JazzCash</span>
                    </div>
                    <div style="background:#141A2E;border:1px solid #2A3347;border-radius:8px;padding:10px 14px;font-size:20px;font-weight:700;color:#0066FF;letter-spacing:.05em;margin-bottom:8px">${window.AppConfig.ADMIN_JAZZCASH}</div>
                    <p style="color:#6B7694;font-size:12px;margin:0">Send payment screenshot on WhatsApp — access restored within 1 hour</p>
                </div>
                <button onclick="window.SubscriptionModule.handleLogout()" style="background:transparent;border:1px solid #2A3347;color:#A0A8C4;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;width:100%">← Sign Out</button>
            </div>`;

        document.body.appendChild(screen);
    }

    function showExpiryWarning(daysLeft) {
        if (daysLeft > window.AppConfig.WARNING_DAYS) return;
        
        const old = document.getElementById('sub-warning-banner');
        if (old) old.remove();

        const color = daysLeft <= 2 ? '#FF1744' : daysLeft <= 5 ? '#FF6D00' : '#FFB300';

        const banner = document.createElement('div');
        banner.id    = 'sub-warning-banner';
        banner.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:9998;background:${color};color:white;text-align:center;padding:9px 16px;font-size:13px;font-weight:600;font-family:Arial,sans-serif`;
        
        const emoji = daysLeft <= 1 ? '🚨' : '⚠️';
        const dayText = daysLeft === 1 ? '1 day' : `${daysLeft} days`;
        
        banner.innerHTML = `${emoji} Free trial ends in <strong>${dayText}</strong> — Send ${window.AppConfig.SUBSCRIPTION_CURRENCY} ${window.AppConfig.SUBSCRIPTION_PRICE.toLocaleString()} via JazzCash to <strong>${window.AppConfig.ADMIN_JAZZCASH}</strong> to activate. <span onclick="this.parentElement.remove();document.getElementById('app-container').style.paddingTop=''" style="margin-left:12px;cursor:pointer;opacity:.75;font-size:16px">✕</span>`;

        document.body.prepend(banner);
        
        const app = document.getElementById('app-container');
        if (app) app.style.paddingTop = '40px';
    }

    async function gate() {
        const result = await checkSubscription();
        
        if (!result.active) {
            showExpiredScreen(result);
            return false;
        }
        
        // Don't show warning for permanent free users
        if (!result.permanent && result.daysLeft !== undefined && result.daysLeft <= window.AppConfig.WARNING_DAYS) {
            showExpiryWarning(result.daysLeft);
        }
        
        return true;
    }

    async function handleLogout() {
        try {
            await window.StorageModule.logoutUser();
        } catch(e) {
            logError('Logout error:', e);
        }
        
        document.getElementById('sub-expired-screen')?.remove();
        document.getElementById('sub-warning-banner')?.remove();
        
        const auth = document.getElementById('auth-container');
        const app  = document.getElementById('app-container');
        if (auth) auth.style.display = 'flex';
        if (app) {
            app.style.display = 'none';
            app.style.paddingTop = '';
        }
    }

    console.log('✅ Subscription Module Loaded');
    
    return {
        gate,
        checkSubscription,
        handleLogout
    };

})();