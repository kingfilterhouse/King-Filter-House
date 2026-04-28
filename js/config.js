/* ==========================================
   CONFIGURATION FILE
   Central configuration for the application
   Load this FIRST before any other scripts
   ========================================== */

window.AppConfig = {
    // ===== APPLICATION INFO =====
    APP_NAME: 'Aasan ERP',
    APP_TAGLINE: 'Simple Business Management',
    APP_VERSION: '1.0.0',
    COMPANY_NAME: 'Aasan ERP',
    
    // ===== BRANDING =====
    BRAND_SHORT_NAME: 'Aasan',
    BRAND_LOGO_TEXT: 'AE',
    
    // ===== CONTACT INFORMATION =====
    ADMIN_WHATSAPP: '0326-6450963',
    ADMIN_JAZZCASH: '0326-6450963',
    SUPPORT_EMAIL: 'support@aasanerp.com',
    
    // ===== FREE ACCESS USERS =====
    // Users with permanent free access (never expire, no trial)
    FREE_USERS: ['kingfilterhouse125@gmail.com'], // Add your email(s) here
    
    // ===== BUSINESS SETTINGS =====
    DEFAULT_CURRENCY: 'PKR',
    CURRENCY_SYMBOL: 'PKR',
    CURRENCY_POSITION: 'before', // 'before' or 'after'
    
    // ===== SUBSCRIPTION SETTINGS =====
    TRIAL_DAYS: 30,
    SUBSCRIPTION_PRICE: 3000,
    SUBSCRIPTION_CURRENCY: 'PKR',
    WARNING_DAYS: 7, // Show warning when X days left
    
    // ===== TECHNICAL SETTINGS =====
    SUPABASE_URL: 'https://zwjgrrkojriokfxuupiv.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3amdycmtvanJpb2tmeHV1cGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Nzg1NTcsImV4cCI6MjA4NTM1NDU1N30.W0s_yYTZGDjsmCf4b09B7qz3D9KeWM1nAQIfOrCnyE4',
    
    // ===== UI SETTINGS =====
    ITEMS_PER_PAGE: 20,
    SEARCH_DEBOUNCE_MS: 300,
    TOAST_DURATION_MS: 3000,
    MODAL_ANIMATION_MS: 200,
    
    // ===== VALIDATION SETTINGS =====
    MIN_PASSWORD_LENGTH: 6,
    MAX_PRODUCT_NAME_LENGTH: 100,
    MAX_QUANTITY: 999999,
    MAX_PRICE: 9999999999,
    
    // ===== FEATURE FLAGS =====
    FEATURES: {
        ENABLE_LOGGING: false, // Set to false in production
        ENABLE_BARCODE: false,
        ENABLE_MULTI_CURRENCY: false,
        ENABLE_OFFLINE_MODE: false,
        ENABLE_EXPORT: true,
        ENABLE_NOTIFICATIONS: true
    },
    
    // ===== DATE/TIME FORMATS =====
    DATE_FORMAT: 'DD/MM/YYYY',
    TIME_FORMAT: '24h',
    
    // ===== INVOICE SETTINGS =====
    INVOICE_PREFIX: 'INV',
    PURCHASE_PREFIX: 'PUR',
    RETURN_PREFIX: 'RET',
    EXPENSE_PREFIX: 'EXP'
};

// ===== UTILITY FUNCTION =====
window.AppConfig.isDevelopment = function() {
    return this.FEATURES.ENABLE_LOGGING;
};

// ===== LOGGING HELPER =====
window.log = function(...args) {
    if (window.AppConfig.FEATURES.ENABLE_LOGGING) {
        console.log(...args);
    }
};

window.logError = function(...args) {
    // Always log errors
    console.error(...args);
};

window.logWarn = function(...args) {
    if (window.AppConfig.FEATURES.ENABLE_LOGGING) {
        console.warn(...args);
    }
};

console.log('✅ Configuration loaded:', window.AppConfig.APP_NAME, 'v' + window.AppConfig.APP_VERSION);
