/* ==========================================
   JS START: Supabase Storage Module
   Central database connection and storage operations
   ========================================== */

// Check if Supabase is loaded
if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded! Make sure the script tag is in your HTML.');
}

// IMPORTANT: Replace these with YOUR actual Supabase credentials
const SUPABASE_URL = 'https://zwjgrrkojriokfxuupiv.supabase.co';  // Example: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3amdycmtvanJpb2tmeHV1cGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Nzg1NTcsImV4cCI6MjA4NTM1NDU1N30.W0s_yYTZGDjsmCf4b09B7qz3D9KeWM1nAQIfOrCnyE4';  // Your anon public key

// Initialize Supabase client (only if not already initialized)
let supabaseClient;

try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
} catch (error) {
    console.error('❌ Failed to initialize Supabase:', error);
}

// ===== AUTHENTICATION FUNCTIONS =====

/**
 * Register a new user
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {string} fullName - User's full name
 * @returns {Promise<Object>} User object or error
 */
async function registerUser(email, password, fullName) {
    try {
        console.log('🔄 Attempting to register user:', email);
        
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) {
            console.error('❌ Registration error:', error);
            throw error;
        }
        
        console.log('✅ Registration successful:', data);
        return { success: true, user: data.user };
    } catch (error) {
        console.error('❌ Registration error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Login existing user
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<Object>} Session object or error
 */
async function loginUser(email, password) {
    try {
        console.log('🔄 Attempting to login user:', email);
        
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('❌ Login error:', error);
            throw error;
        }
        
        console.log('✅ Login successful:', data);
        return { success: true, session: data.session, user: data.user };
    } catch (error) {
        console.error('❌ Login error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Logout current user
 * @returns {Promise<Object>} Success status
 */
async function logoutUser() {
    try {
        console.log('🔄 Logging out user...');
        
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) throw error;
        
        console.log('✅ Logout successful');
        return { success: true };
    } catch (error) {
        console.error('❌ Logout error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get current logged-in user
 * @returns {Promise<Object>} User object or null
 */
async function getCurrentUser() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (user) {
            console.log('✅ Current user found:', user.email);
        } else {
            console.log('ℹ️ No user currently logged in');
        }
        
        return user;
    } catch (error) {
        console.error('❌ Get user error:', error);
        return null;
    }
}

/**
 * Listen for authentication state changes
 * @param {Function} callback - Function to call when auth state changes
 */
function onAuthStateChange(callback) {
    if (!supabaseClient) {
        console.error('❌ Supabase client not initialized');
        return;
    }
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('🔄 Auth state changed:', event);
        callback(event, session);
    });
}

// ===== DATABASE FUNCTIONS (We'll add these as we build features) =====

/**
 * Save data to a specific table
 * AUTOMATICALLY adds user_id from current authenticated user
 * @param {string} table - Table name
 * @param {Object} data - Data to save
 * @returns {Promise<Object>} Saved data or error
 */
async function saveData(table, data) {
    try {
        // CRITICAL FIX: Automatically inject user_id
        const user = await getCurrentUser();
        if (!user) {
            console.error('❌ Cannot save data - no user logged in');
            throw new Error('No authenticated user - please log in first');
        }

        // Add user_id to the data if not already present
        const dataWithUserId = {
            ...data,
            user_id: user.id
        };

        console.log(`🔄 Attempting to save to ${table}:`, dataWithUserId);

        const { data: result, error } = await supabaseClient
            .from(table)
            .insert([dataWithUserId])
            .select();

        if (error) {
            console.error(`❌ Supabase error saving to ${table}:`, error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw error;
        }
        
        if (!result || result.length === 0) {
            console.warn(`⚠️ Save to ${table} returned no data (but no error)`);
            return { success: true, data: null };
        }
        
        console.log(`✅ Data saved to ${table}:`, result[0]);
        return { success: true, data: result[0] };
    } catch (error) {
        console.error(`❌ Save error for ${table}:`, error);
        console.error('Full error object:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update existing data in a table
 * @param {string} table - Table name
 * @param {string} id - Record ID to update
 * @param {Object} data - Data to update
 * @returns {Promise<Object>} Updated data or error
 */
async function updateData(table, id, data) {
    try {
        // Verify user is authenticated
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('No authenticated user - please log in first');
        }

        const { data: result, error } = await supabaseClient
            .from(table)
            .update(data)
            .eq('id', id)
            .eq('user_id', user.id)  // Security: only update user's own data
            .select();

        if (error) throw error;
        
        console.log(`✅ Data updated in ${table}:`, result);
        return { success: true, data: result[0] };
    } catch (error) {
        console.error(`❌ Update error for ${table}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete data from a table
 * @param {string} table - Table name
 * @param {string} id - Record ID to delete
 * @returns {Promise<Object>} Success status
 */
async function deleteData(table, id) {
    try {
        // Verify user is authenticated
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
        
        console.log(`✅ Data deleted from ${table}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Delete error for ${table}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all data from a table for current user
 * @param {string} table - Table name
 * @returns {Promise<Array>} Array of records
 */
async function getAllData(table) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            console.warn(`⚠️ No user logged in - returning empty array for ${table}`);
            return { success: true, data: [] };
        }

        // Get data filtered by user_id (secure — each user only sees their own data)
        let { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`✅ Retrieved ${data ? data.length : 0} records from ${table}`);
        return { success: true, data: data || [] };
    } catch (error) {
        console.error(`❌ Get all error for ${table}:`, error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get single record by ID
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise<Object>} Record object or error
 */
async function getDataById(table, id) {
    try {
        // Verify user is authenticated
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('No authenticated user - please log in first');
        }

        const { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)  // Security: only get user's own data
            .single();

        if (error) throw error;
        
        console.log(`✅ Retrieved record from ${table}:`, data);
        return { success: true, data };
    } catch (error) {
        console.error(`❌ Get by ID error for ${table}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Get purchase items for a specific purchase
 * @param {string} purchaseId - Purchase record ID
 * @returns {Promise<Object>} Array of purchase items or error
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
        
        console.log(`✅ Retrieved ${data ? data.length : 0} purchase items for purchase ${purchaseId}`);
        return { success: true, data: data || [] };
    } catch (error) {
        console.error(`❌ Get purchase items error:`, error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get sale items for a specific sale
 * @param {string} saleId - Sale record ID
 * @returns {Promise<Object>} Array of sale items or error
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
        
        console.log(`✅ Retrieved ${data ? data.length : 0} sale items for sale ${saleId}`);
        return { success: true, data: data || [] };
    } catch (error) {
        console.error(`❌ Get sale items error:`, error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Delete purchase items for a specific purchase
 * @param {string} purchaseId - Purchase record ID
 * @returns {Promise<Object>} Success status
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
        
        console.log(`✅ Deleted purchase items for purchase ${purchaseId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Delete purchase items error:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete sale items for a specific sale
 * @param {string} saleId - Sale record ID
 * @returns {Promise<Object>} Success status
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
        
        console.log(`✅ Deleted sale items for sale ${saleId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Delete sale items error:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete payments for a specific sale
 * @param {string} saleId - Sale record ID
 * @returns {Promise<Object>} Success status
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
        
        console.log(`✅ Deleted payments for sale ${saleId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Delete payments for sale error:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete payments for a specific purchase
 * @param {string} purchaseId - Purchase record ID
 * @returns {Promise<Object>} Success status
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
        
        console.log(`✅ Deleted payments for purchase ${purchaseId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Delete payments for purchase error:`, error);
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
        return { success: false, error: error.message };
    }
}

/**
 * Update current user's profile (name and/or password)
 */
async function updateUserProfile({ fullName, newPassword }) {
    try {
        const updates = {};
        if (fullName)    updates.data = { full_name: fullName };
        if (newPassword) updates.password = newPassword;
        const { data, error } = await supabaseClient.auth.updateUser(updates);
        if (error) throw error;
        return { success: true, user: data.user };
    } catch (error) {
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
        return { success: false, error: error.message };
    }
}

// Export functions for use in other files
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
    getSaleItems,
    deletePurchaseItems,
    deleteSaleItems,
    
    // Payment deletion functions
    deletePaymentsForSale,
    deletePaymentsForPurchase,
    
    // Direct access to Supabase client if needed
    supabase: supabaseClient
};

console.log('✅ Storage Module Loaded Successfully');

/* ==========================================
   JS END: Supabase Storage Module
   ========================================== */