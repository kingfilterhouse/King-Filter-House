/* ==========================================
   SHARED UTILITIES
   Common functions used across all modules
   ========================================== */

window.Utils = (function() {
    'use strict';
    
    // ===== CURRENCY FORMATTING =====
    function formatCurrency(amount) {
        const num = Math.round(amount || 0);
        const formatted = num.toLocaleString('en-PK');
        return window.AppConfig.CURRENCY_SYMBOL + ' ' + formatted;
    }
    
    // ===== NUMBER FORMATTING =====
    function formatNumber(num, decimals = 0) {
        return parseFloat(num || 0).toFixed(decimals);
    }
    
    // ===== DATE FORMATTING =====
    function formatDate(date) {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    function getTodayString() {
        return formatDate(new Date());
    }
    
    function parseDate(dateStr) {
        // Parse DD/MM/YYYY format
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    
    // ===== ID GENERATION =====
    let invoiceCounter = 1;
    let purchaseCounter = 1;
    let returnCounter = 1;
    let expenseCounter = 1;
    
    function generateSequentialId(prefix) {
        const now = new Date();
        const year = now.getFullYear().toString().slice(2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        let counter;
        switch(prefix) {
            case window.AppConfig.INVOICE_PREFIX:
                counter = invoiceCounter++;
                break;
            case window.AppConfig.PURCHASE_PREFIX:
                counter = purchaseCounter++;
                break;
            case window.AppConfig.RETURN_PREFIX:
                counter = returnCounter++;
                break;
            case window.AppConfig.EXPENSE_PREFIX:
                counter = expenseCounter++;
                break;
            default:
                counter = Math.floor(Math.random() * 9000 + 1000);
        }
        
        const seq = String(counter).padStart(4, '0');
        return `${prefix}-${year}${month}${day}-${seq}`;
    }
    
    // ===== VALIDATION =====
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    function validatePhone(phone) {
        // Basic phone validation for Pakistani numbers
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 13;
    }
    
    function validateNumber(value, min = 0, max = Infinity) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= min && num <= max;
    }
    
    function sanitizeInput(str) {
        if (!str) return '';
        return String(str)
            .replace(/[<>]/g, '') // Remove < and >
            .trim();
    }
    
    // ===== UI HELPERS =====
    function showLoading(buttonElement, text = 'Processing...') {
        if (!buttonElement) return;
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = `<span class="btn-spinner"></span> ${text}`;
    }
    
    function hideLoading(buttonElement) {
        if (!buttonElement) return;
        buttonElement.disabled = false;
        if (buttonElement.dataset.originalText) {
            buttonElement.innerHTML = buttonElement.dataset.originalText;
        }
    }
    
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        const container = document.getElementById('toast-container') || createToastContainer();
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, window.AppConfig.TOAST_DURATION_MS);
    }
    
    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;';
        document.body.appendChild(container);
        return container;
    }
    
    function showConfirmDialog(message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '99999';
        
        overlay.innerHTML = `
            <div class="modal-container" style="max-width:400px;">
                <div class="modal-header">
                    <h2 class="modal-title">Confirm Action</h2>
                </div>
                <div class="modal-body">
                    <p style="color:var(--color-text-primary);font-size:15px;line-height:1.6;">${message}</p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button class="btn btn-danger" data-action="confirm">Confirm</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        });
        
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            overlay.remove();
            if (onCancel) onCancel();
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        });
    }
    
    // ===== LOCAL STORAGE HELPERS =====
    function userKey(key) {
        const uid = window._currentUserId || 'anon';
        return `${key}_${uid}`;
    }
    
    function setUserItem(key, value) {
        try {
            localStorage.setItem(userKey(key), value);
        } catch (e) {
            logError('Error setting user item:', e);
        }
    }
    
    function getUserItem(key, fallback = null) {
        try {
            return localStorage.getItem(userKey(key)) || fallback;
        } catch (e) {
            logError('Error getting user item:', e);
            return fallback;
        }
    }
    
    function removeUserItem(key) {
        try {
            localStorage.removeItem(userKey(key));
        } catch (e) {
            logError('Error removing user item:', e);
        }
    }
    
    // ===== DEBOUNCE =====
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // ===== STRING HELPERS =====
    function truncate(str, maxLength) {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    }
    
    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
    
    function getInitials(name) {
        if (!name) return 'AA';
        const parts = name.trim().split(' ');
        if (parts.length === 1) {
            return name.substring(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // ===== EXPORT =====
    return {
        // Currency & Numbers
        fmt: formatCurrency,
        formatCurrency,
        formatNumber,
        
        // Dates
        formatDate,
        getTodayString,
        parseDate,
        
        // ID Generation
        generateSequentialId,
        
        // Validation
        validateEmail,
        validatePhone,
        validateNumber,
        sanitizeInput,
        
        // UI
        showLoading,
        hideLoading,
        showToast,
        showConfirmDialog,
        
        // Storage
        userKey,
        setUserItem,
        getUserItem,
        removeUserItem,
        
        // Utilities
        debounce,
        truncate,
        capitalize,
        getInitials
    };
})();

// Legacy compatibility - keep fmt() available globally
window.fmt = window.Utils.fmt;

console.log('✅ Utilities Module Loaded');
