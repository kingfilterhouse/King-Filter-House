/* ==========================================
   STORAGE MODULE - PROFESSIONAL VERSION
   Central database connection and storage operations
   ========================================== */

(function() {
    'use strict';

    // Check if Supabase is loaded
    if (typeof window.supabase === 'undefined') {
        logError('❌ Supabase library not loaded! Make sure the script tag is in your HTML.');
    }

    // Initialize Supabase client using centralized config
    let supabaseClient;

    try {
        supabaseClient = window.supabase.createClient(
            window.AppConfig.SUPABASE_URL,
            window.AppConfig.SUPABASE_ANON_KEY
        );
        window.log('✅ Supabase client initialized');
    } catch (error) {
        logError('❌ Failed to initialize Supabase:', error);
    }

    // ===== OFFLINE CACHE (IndexedDB) =====
    let offlineDB = null;

    /**
     * Initialize IndexedDB for offline caching
     */
    function initOfflineCache() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HisabDeskOfflineCache', 1);
            
            request.onerror = () => {
                logWarn('⚠️ IndexedDB not available - offline mode will be limited');
                resolve(null);
            };
            
            request.onsuccess = (event) => {
                offlineDB = event.target.result;
                window.log('✅ Offline cache initialized');
                resolve(offlineDB);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tableCache')) {
                    db.createObjectStore('tableCache', { keyPath: 'cacheKey' });
                }
            };
        });
    }

    // Initialize offline cache immediately
    initOfflineCache();

    /**
     * Save data to offline cache
     */
    async function saveToCache(table, userId, data) {
        if (!offlineDB) return;
        try {
            const transaction = offlineDB.transaction(['tableCache'], 'readwrite');
            const store = transaction.objectStore('tableCache');
            const cacheKey = `${userId}_${table}`;
            store.put({ cacheKey, table, userId, data, timestamp: Date.now() });
        } catch (error) {
            logWarn('⚠️ Failed to cache data:', error);
        }
    }

    /**
     * Get data from offline cache
     */
    async function getFromCache(table, userId) {
        if (!offlineDB) return null;
        try {
            return new Promise((resolve) => {
                const transaction = offlineDB.transaction(['tableCache'], 'readonly');
                const store = transaction.objectStore('tableCache');
                const cacheKey = `${userId}_${table}`;
                const request = store.get(cacheKey);
                
                request.onsuccess = () => {
                    if (request.result) {
                        window.log(`📦 Retrieved ${table} from offline cache`);
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => resolve(null);
            });
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear all offline cache
     */
    async function clearOfflineCache() {
        if (!offlineDB) return;
        try {
            const transaction = offlineDB.transaction(['tableCache'], 'readwrite');
            const store = transaction.objectStore('tableCache');
            store.clear();
            window.log('🗑️ Offline cache cleared');
        } catch (error) {
            logWarn('⚠️ Failed to clear cache:', error);
        }
    }

    // ===== AUTHENTICATION FUNCTIONS =====

    /**
     * Register a new user
     */
    async function registerUser(email, password, fullName) {
        try {
            window.log('🔄 Attempting to register user:', email);
            
            // Validate inputs
            if (!window.Utils.validateEmail(email)) {
                throw new Error('Invalid email address');
            }
            
            if (password.length < window.AppConfig.MIN_PASSWORD_LENGTH) {
                throw new Error(`Password must be at least ${window.AppConfig.MIN_PASSWORD_LENGTH} characters`);
            }
            
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: window.Utils.sanitizeInput(fullName)
                    }
                }
            });

            if (error) {
                logError('❌ Registration error:', error);
                throw error;
            }
            
            window.log('✅ Registration successful');
            return { success: true, user: data.user };
        } catch (error) {
            logError('❌ Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Login existing user
     */
    async function loginUser(email, password) {
        try {
            window.log('🔄 Attempting to login user:', email);
            
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                logError('❌ Login error:', error);
                throw error;
            }
            
            window.log('✅ Login successful');
            return { success: true, session: data.session, user: data.user };
        } catch (error) {
            logError('❌ Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Logout current user
     */
    async function logoutUser() {
        try {
            _cachedCurrentUser = null; // Clear user cache on logout
            await clearOfflineCache(); // Clear offline data cache
            
            window.log('🔄 Logging out user...');
            
            const { error } = await supabaseClient.auth.signOut();
            
            if (error) throw error;
            
            window.log('✅ Logout successful');
            return { success: true };
        } catch (error) {
            logError('❌ Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    // User cache to avoid repeated API calls
    let _cachedCurrentUser = null;

    /**
     * Get current logged-in user
     */
    async function getCurrentUser() {
        try {
            // Return cached user if available
            if (_cachedCurrentUser) {
                return _cachedCurrentUser;
            }

            // If offline, use stored session (works without network)
            if (!navigator.onLine) {
                window.log('📡 Offline - checking stored session');
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session?.user) {
                    _cachedCurrentUser = session.user;
                    window.log('✅ User found in offline session:', session.user.email);
                    return session.user;
                }
                window.log('ℹ️ No stored session found');
                return null;
            }

            // Online - get fresh user data from server
            const { data: { user } } = await supabaseClient.auth.getUser();
            
            if (user) {
                _cachedCurrentUser = user; // Cache the user
                window.log('✅ Current user found:', user.email);
            } else {
                window.log('ℹ️ No user currently logged in');
            }
            
            return user;
        } catch (error) {
            logError('❌ Get user error:', error);
            // On error, try stored session as fallback
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session?.user) {
                    _cachedCurrentUser = session.user;
                    window.log('⚠️ Using stored session after error');
                    return session.user;
                }
            } catch (e) {
                // Ignore fallback error
            }
            return null;
        }
    }

    /**
     * Listen for authentication state changes
     */
    function onAuthStateChange(callback) {
        if (!supabaseClient) {
            logError('❌ Supabase client not initialized');
            return;
        }
        
        supabaseClient.auth.onAuthStateChange((event, session) => {
            window.log('🔄 Auth state changed:', event);
            callback(event, session);
        });
    }

    // ===== DATABASE FUNCTIONS =====

    /**
     * Save data to a specific table
     * Automatically adds user_id from current authenticated user
     */
    async function saveData(table, data) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            // Sanitize string fields
            const sanitizedData = {};
            for (const key in data) {
                if (typeof data[key] === 'string') {
                    sanitizedData[key] = window.Utils.sanitizeInput(data[key]);
                } else {
                    sanitizedData[key] = data[key];
                }
            }

            // Add user_id
            const dataWithUserId = {
                ...sanitizedData,
                user_id: user.id
            };

            window.log(`🔄 Saving to ${table}`);

            const { data: result, error } = await supabaseClient
                .from(table)
                .insert([dataWithUserId])
                .select();

            if (error) {
                logError(`❌ Error saving to ${table}:`, error);
                throw error;
            }
            
            if (!result || result.length === 0) {
                logWarn(`⚠️ Save to ${table} returned no data`);
                return { success: true, data: null };
            }
            
            window.log(`✅ Data saved to ${table}`);
            return { success: true, data: result[0] };
        } catch (error) {
            logError(`❌ Save error for ${table}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update existing data in a table
     */
    async function updateData(table, id, data) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            // Sanitize string fields
            const sanitizedData = {};
            for (const key in data) {
                if (typeof data[key] === 'string') {
                    sanitizedData[key] = window.Utils.sanitizeInput(data[key]);
                } else {
                    sanitizedData[key] = data[key];
                }
            }

            const { data: result, error } = await supabaseClient
                .from(table)
                .update(sanitizedData)
                .eq('id', id)
                .eq('user_id', user.id)  // Security: only update user's own data
                .select();

            if (error) throw error;
            
            window.log(`✅ Data updated in ${table}`);
            return { success: true, data: result[0] };
        } catch (error) {
            logError(`❌ Update error for ${table}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete data from a table
     */
    async function deleteData(table, id) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { error } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);  // Security: only delete user's own data

            if (error) throw error;
            
            window.log(`✅ Data deleted from ${table}`);
            return { success: true };
        } catch (error) {
            logError(`❌ Delete error for ${table}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all data from a table for current user
     * Automatically caches data for offline access
     */
    async function getAllData(table, options = {}) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            // Check if we're offline
            if (!navigator.onLine) {
                window.log(`📡 Offline - loading ${table} from cache`);
                const cachedData = await getFromCache(table, user.id);
                if (cachedData) {
                    return { success: true, data: cachedData, fromCache: true };
                } else {
                    throw new Error('No cached data available for offline viewing');
                }
            }

            // Online - fetch from Supabase
            let query = supabaseClient
                .from(table)
                .select('*', { count: 'exact' })
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            // Add pagination if specified
            if (options.limit) {
                const offset = options.offset || 0;
                query = query.range(offset, offset + options.limit - 1);
            }

            const { data, error, count } = await query;

            if (error) throw error;
            
            // Cache the data for offline use (only if not paginated)
            if (!options.limit) {
                await saveToCache(table, user.id, data || []);
            }
            
            window.log(`✅ Retrieved ${data ? data.length : 0} records from ${table}${count ? ` (total: ${count})` : ''}`);
            return { success: true, data: data || [], count: count };
        } catch (error) {
            logError(`❌ Get all data error for ${table}:`, error);
            
            // If online request failed, try cache as fallback
            if (navigator.onLine) {
                const user = await getCurrentUser();
                if (user) {
                    const cachedData = await getFromCache(table, user.id);
                    if (cachedData) {
                        logWarn(`⚠️ Using cached ${table} data due to network error`);
                        return { success: true, data: cachedData, fromCache: true };
                    }
                }
            }
            
            return { success: false, error: error.message, data: [] };
        }
    }

    /**
     * Get a single record by ID
     * Searches cache when offline
     */
    async function getDataById(table, id) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            // Check if we're offline
            if (!navigator.onLine) {
                window.log(`📡 Offline - searching ${table} cache for ID: ${id}`);
                const cachedData = await getFromCache(table, user.id);
                if (cachedData && Array.isArray(cachedData)) {
                    const record = cachedData.find(item => item.id === id);
                    if (record) {
                        return { success: true, data: record, fromCache: true };
                    }
                }
                throw new Error('Record not found in offline cache');
            }

            // Online - fetch from Supabase
            const { data, error } = await supabaseClient
                .from(table)
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (error) throw error;
            
            window.log(`✅ Retrieved record from ${table}`);
            return { success: true, data };
        } catch (error) {
            logError(`❌ Get by ID error for ${table}:`, error);
            
            // If online request failed, try cache as fallback
            if (navigator.onLine) {
                const user = await getCurrentUser();
                if (user) {
                    const cachedData = await getFromCache(table, user.id);
                    if (cachedData && Array.isArray(cachedData)) {
                        const record = cachedData.find(item => item.id === id);
                        if (record) {
                            logWarn(`⚠️ Using cached record from ${table} due to network error`);
                            return { success: true, data: record, fromCache: true };
                        }
                    }
                }
            }
            
            return { success: false, error: error.message };
        }
    }

    // ===== RELATED ITEMS FUNCTIONS =====

    /**
     * Get purchase items for a specific purchase
     */
    async function getPurchaseItems(purchaseId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { data, error } = await supabaseClient
                .from('purchase_items')
                .select('*')
                .eq('purchase_id', purchaseId)
                .eq('user_id', user.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            window.log(`✅ Retrieved ${data ? data.length : 0} purchase items`);
            return { success: true, data: data || [] };
        } catch (error) {
            logError(`❌ Get purchase items error:`, error);
            return { success: false, error: error.message, data: [] };
        }
    }

    /**
     * Get sale items for a specific sale
     */
    async function getSaleItems(saleId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { data, error } = await supabaseClient
                .from('sale_items')
                .select('*')
                .eq('sale_id', saleId)
                .eq('user_id', user.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            window.log(`✅ Retrieved ${data ? data.length : 0} sale items`);
            return { success: true, data: data || [] };
        } catch (error) {
            logError(`❌ Get sale items error:`, error);
            return { success: false, error: error.message, data: [] };
        }
    }

    /**
     * Delete purchase items for a specific purchase
     */
    async function deletePurchaseItems(purchaseId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { error } = await supabaseClient
                .from('purchase_items')
                .delete()
                .eq('purchase_id', purchaseId)
                .eq('user_id', user.id);

            if (error) throw error;
            
            window.log(`✅ Deleted purchase items`);
            return { success: true };
        } catch (error) {
            logError(`❌ Delete purchase items error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete sale items for a specific sale
     */
    async function deleteSaleItems(saleId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { error } = await supabaseClient
                .from('sale_items')
                .delete()
                .eq('sale_id', saleId)
                .eq('user_id', user.id);

            if (error) throw error;
            
            window.log(`✅ Deleted sale items`);
            return { success: true };
        } catch (error) {
            logError(`❌ Delete sale items error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * PERFORMANCE: Batch-load sale items for multiple sales in ONE query.
     * Replaces N individual getSaleItems() calls during table rendering.
     * Returns a map: { [saleId]: [items] }
     */
    async function getSaleItemsBatch(saleIds) {
        if (!saleIds || saleIds.length === 0) return {};
        try {
            const user = await getCurrentUser();
            if (!user) return {};
            const { data, error } = await supabaseClient
                .from('sale_items')
                .select('*')
                .eq('user_id', user.id)
                .in('sale_id', saleIds);
            if (error) throw error;
            const map = {};
            (data || []).forEach(item => {
                if (!map[item.sale_id]) map[item.sale_id] = [];
                map[item.sale_id].push(item);
            });
            return map;
        } catch (error) {
            logError('❌ getSaleItemsBatch error:', error);
            return {};
        }
    }

    /**
     * PERFORMANCE: Batch-load purchase items for multiple purchases in ONE query.
     * Replaces N individual getPurchaseItems() calls during table rendering.
     * Returns a map: { [purchaseId]: [items] }
     */
    async function getPurchaseItemsBatch(purchaseIds) {
        if (!purchaseIds || purchaseIds.length === 0) return {};
        try {
            const user = await getCurrentUser();
            if (!user) return {};
            const { data, error } = await supabaseClient
                .from('purchase_items')
                .select('*')
                .eq('user_id', user.id)
                .in('purchase_id', purchaseIds);
            if (error) throw error;
            const map = {};
            (data || []).forEach(item => {
                if (!map[item.purchase_id]) map[item.purchase_id] = [];
                map[item.purchase_id].push(item);
            });
            return map;
        } catch (error) {
            logError('❌ getPurchaseItemsBatch error:', error);
            return {};
        }
    }

    /**
     * Delete payments for a specific sale
     */
    async function deletePaymentsForSale(saleId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { error } = await supabaseClient
                .from('payments')
                .delete()
                .eq('transaction_id', saleId)
                .eq('transaction_type', 'sale')
                .eq('user_id', user.id);

            if (error) throw error;
            
            window.log(`✅ Deleted payments for sale`);
            return { success: true };
        } catch (error) {
            logError(`❌ Delete payments for sale error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete payments for a specific purchase
     */
    async function deletePaymentsForPurchase(purchaseId) {
        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('No authenticated user - please log in first');
            }

            const { error } = await supabaseClient
                .from('payments')
                .delete()
                .eq('transaction_id', purchaseId)
                .eq('transaction_type', 'purchase')
                .eq('user_id', user.id);

            if (error) throw error;
            
            window.log(`✅ Deleted payments for purchase`);
            return { success: true };
        } catch (error) {
            logError(`❌ Delete payments for purchase error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     */
    async function sendPasswordReset(email) {
        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
            if (error) throw error;
            return { success: true };
        } catch (error) {
            logError('❌ Password reset error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update current user's profile (name and/or password)
     */
    async function updateUserProfile({ fullName, newPassword }) {
        try {
            const updates = {};
            if (fullName) updates.data = { full_name: window.Utils.sanitizeInput(fullName) };
            if (newPassword) {
                if (newPassword.length < window.AppConfig.MIN_PASSWORD_LENGTH) {
                    throw new Error(`Password must be at least ${window.AppConfig.MIN_PASSWORD_LENGTH} characters`);
                }
                updates.password = newPassword;
            }
            const { data, error } = await supabaseClient.auth.updateUser(updates);
            if (error) throw error;
            return { success: true, user: data.user };
        } catch (error) {
            logError('❌ Update profile error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload receipt file to Supabase Storage
     */
    async function uploadReceipt(file) {
        try {
            const user = await getCurrentUser();
            if (!user) throw new Error('Not authenticated');
            const ext  = file.name.split('.').pop();
            const path = `${user.id}/${Date.now()}.${ext}`;
            const { error } = await supabaseClient.storage
                .from('expense-receipts')
                .upload(path, file, { upsert: true });
            if (error) throw error;
            const { data } = supabaseClient.storage.from('expense-receipts').getPublicUrl(path);
            return { success: true, url: data.publicUrl };
        } catch (error) {
            logError('❌ Upload receipt error:', error);
            return { success: false, error: error.message };
        }
    }

    // Export functions
    window.StorageModule = {
        // Auth functions
        registerUser,
        loginUser,
        logoutUser,
        getCurrentUser,
        onAuthStateChange,
        sendPasswordReset,
        updateUserProfile,
        uploadReceipt,
        
        // Database functions
        saveData,
        updateData,
        deleteData,
        getAllData,
        getDataById,
        
        // Related items functions
        getPurchaseItems,
        getSaleItemsBatch,
        getPurchaseItemsBatch,
        getSaleItems,
        deletePurchaseItems,
        deleteSaleItems,
        
        // Payment deletion functions
        deletePaymentsForSale,
        deletePaymentsForPurchase,
        
        // Direct access to Supabase client if needed
        supabase: supabaseClient
    };

    console.log('✅ Storage Module Loaded');

})();