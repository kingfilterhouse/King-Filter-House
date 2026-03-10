(function() {
/* ==========================================
   MODULE SCOPE: Wrapped in IIFE to prevent global scope pollution.
   ========================================== */

/* ==========================================
   JS START: Reports & Analytics Module
   Advanced business intelligence and insights
   ========================================== */

// ===== GLOBAL STATE =====
let allSales = [];
let allPurchases = []; // Fix Bug #6: track all purchases for AP calculation
let reportsProducts = []; // Changed from allProducts
let currentDateFilter = 'today';
let currentChartPeriod = 'daily';
let currentRanking = 'revenue';
let revenueTrendChart = null;

// ===== DOM ELEMENTS =====
// Filter buttons
const filterPeriodBtns = document.querySelectorAll('.filter-period-btn');
const customDateRange = document.getElementById('custom-date-range');
const reportDateFrom = document.getElementById('report-date-from');
const reportDateTo = document.getElementById('report-date-to');
const applyCustomDateBtn = document.getElementById('apply-custom-date');

// Chart period tabs
const chartTabBtns = document.querySelectorAll('.chart-tab-btn');
const rankingTabBtns = document.querySelectorAll('.ranking-tab-btn');

// Metrics displays
const metricRevenue = document.getElementById('metric-revenue');
const metricUnitsSold = document.getElementById('metric-units-sold');
const metricGrossProfit = document.getElementById('metric-gross-profit');
const metricGpPercentage = document.getElementById('metric-gp-percentage');
const metricAvgProfitPercentage = document.getElementById('metric-avg-profit-percentage');
const revenueSalesCount = document.getElementById('revenue-sales-count');
const revenueTrend = document.getElementById('revenue-trend');

// Performance grid
const productPerformanceGrid = document.getElementById('product-performance-grid');

// Dead stock elements
const freshStockCount = document.getElementById('fresh-stock-count');
const slowStockCount = document.getElementById('slow-stock-count');
const deadStockCount = document.getElementById('dead-stock-count');
const deadStockTbody = document.getElementById('dead-stock-tbody');

// Velocity grid
const velocityGrid = document.getElementById('velocity-grid');

// Pareto analysis
const paretoPercentage = document.getElementById('pareto-profit-percentage');
const paretoProductsGrid = document.getElementById('pareto-products-grid');

// Financial summary
const inventoryCostValue = document.getElementById('inventory-cost-value');
const inventorySellValue = document.getElementById('inventory-sell-value');
const inventoryPotentialProfit = document.getElementById('inventory-potential-profit');
const cashOnHand = document.getElementById('cash-on-hand');
const outstandingAR = document.getElementById('outstanding-ar');
const outstandingAP = document.getElementById('outstanding-ap');
const netPosition = document.getElementById('net-position');

// ===== UTILITY FUNCTIONS =====

/**
 * Get date range based on filter
 * @param {string} filter - Filter type (today, week, month, year, custom)
 * @returns {Object} Start and end dates
 */
function getDateRange(filter) {
    const now = new Date();
    let startDate, endDate;

    switch (filter) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Start from Monday
            startDate = new Date(now.getFullYear(), now.getMonth(), diff);
            endDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59);
            break;
        
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        
        case 'custom':
            startDate = reportDateFrom.value ? new Date(reportDateFrom.value) : new Date(0);
            endDate = reportDateTo.value ? new Date(reportDateTo.value + 'T23:59:59') : now;
            break;
        
        default:
            startDate = new Date(0);
            endDate = now;
    }

    return { startDate, endDate };
}

/**
 * Filter sales by date range
 * @param {Array} sales - All sales
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filtered sales
 */
function filterSalesByDate(sales, startDate, endDate) {
    return sales.filter(sale => {
        const saleDate = new Date(sale.sale_date || sale.created_at);
        return saleDate >= startDate && saleDate <= endDate;
    });
}

/**
 * Calculate days between two dates
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date (default: now)
 * @returns {number} Days difference
 */
function daysBetween(date1, date2 = new Date()) {
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
function formatCurrency(amount) {
    return `PKR ${Math.round(amount).toLocaleString()}`;
}

/**
 * Format percentage
 * @param {number} value - Value to format
 * @returns {string} Formatted percentage
 */
function formatPercentage(value) {
    return `${value.toFixed(2)}%`;
}

// ===== DATA LOADING =====

/**
 * Load all necessary data for reports
 */
async function loadReportsData() {
    try {
        console.log('🔄 Loading reports data...');

        // Load products
        const productsResult = await window.StorageModule.getAllData('products');
        if (productsResult.success) {
            reportsProducts = productsResult.data;
        }

        // Load purchases for AP calculation (Fix Bug #6)
        const purchasesResult = await window.StorageModule.getAllData('purchases');
        if (purchasesResult.success) {
            allPurchases = purchasesResult.data;
        }

        // Load sales
        const salesResult = await window.StorageModule.getAllData('sales');
        if (salesResult.success) {
            allSales = salesResult.data;
            
            // Load sale items for each sale
            for (let sale of allSales) {
                const itemsResult = await window.StorageModule.supabase
                    .from('sale_items')
                    .select('*')
                    .eq('sale_id', sale.id);
                
                if (!itemsResult.error) {
                    sale.items = itemsResult.data || [];
                }
            }

            // FIX: Load all returns and attach returnedAmount to each sale so all metrics use net revenue
            const returnsResult = await window.StorageModule.getAllData('returns');
            const allReturns = returnsResult.success ? returnsResult.data : [];
            const returnedBySaleId = {};
            allReturns.forEach(r => {
                if (r.return_type === 'sale') {
                    returnedBySaleId[r.original_transaction_id] = (returnedBySaleId[r.original_transaction_id] || 0) + (r.total_amount || 0);
                }
            });
            // Attach netTotal to each sale for use in all report calculations
            // IMPORTANT: When NIL is used, effective revenue is the paid amount, not invoice total
            allSales.forEach(sale => {
                sale.returnedAmount = returnedBySaleId[sale.id] || 0;
                
                const grossTotal = sale.total || 0;
                const paidAmount = sale.paid_amount || 0;
                const remaining = sale.remaining_amount || 0;
                
                // Check if NIL was used: fully paid but paid amount is less than total
                const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
                
                // If NIL used, effective revenue is what was actually collected minus returns
                // Otherwise, effective revenue is invoice total minus returns
                sale.netTotal = nilUsed 
                    ? Math.max(0, paidAmount - sale.returnedAmount)
                    : Math.max(0, grossTotal - sale.returnedAmount);
            });

            // FIX Bug #1 & #2: Fetch all return_items for sale-type returns in one query.
            // This lets us compute the true PROFIT lost (not revenue lost) and
            // track returned qty per product per sale for product-ranking accuracy.
            const saleReturnRecords = allReturns.filter(r => r.return_type === 'sale');
            if (saleReturnRecords.length > 0) {
                const retIdToSaleId = {};
                saleReturnRecords.forEach(r => { retIdToSaleId[r.id] = r.original_transaction_id; });

                const retItemsResult = await window.StorageModule.supabase
                    .from('return_items')
                    .select('*')
                    .in('return_id', saleReturnRecords.map(r => r.id));

                const returnedProfitBySaleId = {};
                const returnedQtyByProductBySaleId = {};

                if (!retItemsResult.error && retItemsResult.data) {
                    retItemsResult.data.forEach(ri => {
                        const saleId = retIdToSaleId[ri.return_id];
                        if (!saleId) return;

                        // Track returned qty per product (for product performance sections)
                        if (!returnedQtyByProductBySaleId[saleId]) returnedQtyByProductBySaleId[saleId] = {};
                        returnedQtyByProductBySaleId[saleId][ri.product_id] =
                            (returnedQtyByProductBySaleId[saleId][ri.product_id] || 0) + (ri.quantity || 0);

                        // Compute profit lost on returned items: (sell - cost) * returnedQty
                        const product = reportsProducts.find(p => p.id === ri.product_id);
                        const cost = product ? (product.purchase_price || 0) : 0;
                        const sellPrice = ri.price || 0; // 'price' column stores sell_price in return_items
                        const profitLost = Math.max(0, (sellPrice - cost) * (ri.quantity || 0));
                        returnedProfitBySaleId[saleId] = (returnedProfitBySaleId[saleId] || 0) + profitLost;
                    });
                }

                allSales.forEach(sale => {
                    sale.returnedProfitAmount = returnedProfitBySaleId[sale.id] || 0;
                    sale.returnedQtyByProduct = returnedQtyByProductBySaleId[sale.id] || {};
                });
            } else {
                allSales.forEach(sale => {
                    sale.returnedProfitAmount = 0;
                    sale.returnedQtyByProduct = {};
                });
            }
        }

        console.log(`✅ Loaded ${reportsProducts.length} products and ${allSales.length} sales`);

        // Generate all reports
        await generateAllReports();

    } catch (error) {
        console.error('❌ Error loading reports data:', error);
        showNotification('Failed to load reports data', 'error');
    }
}

/**
 * Generate all reports based on current filters
 */
async function generateAllReports() {
    const { startDate, endDate } = getDateRange(currentDateFilter);
    const filteredSales = filterSalesByDate(allSales, startDate, endDate);

    // Update all sections — pass filteredSales everywhere for consistency (Fix Bug #13)
    updateFinancialMetrics(filteredSales);
    updateRevenueTrendChart(filteredSales);
    updateProductPerformance(filteredSales);
    updateDeadStockDetection(filteredSales);
    updateInventoryVelocity(filteredSales);
    updateParetoAnalysis(filteredSales);
    await updateFinancialSummary(filteredSales);
}

// ===== FINANCIAL METRICS =====

/**
 * Update financial overview metrics
 * @param {Array} sales - Filtered sales
 */
function updateFinancialMetrics(sales) {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalUnits = 0;
    let totalProfit = 0;

    sales.forEach(sale => {
        // FIX: Use netTotal (gross - returns) so revenue reflects actual earned revenue
        const saleRevenue = sale.netTotal !== undefined ? sale.netTotal : (sale.total || 0);
        totalRevenue += saleRevenue;
        
        if (sale.items && sale.items.length > 0) {
            // Calculate NIL adjustment ratio for this sale
            const grossTotal = sale.total || 0;
            const paidAmount = sale.paid_amount || 0;
            const remaining = sale.remaining_amount || 0;
            const returnedAmount = sale.returnedAmount || 0;
            
            // Check if NIL was used
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // Calculate proration ratio
            const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
            
            sale.items.forEach(item => {
                totalUnits += item.quantity || 0;
                const itemCost = (item.purchase_price || 0) * (item.quantity || 0);
                const itemGrossRevenue = (item.sell_price || 0) * (item.quantity || 0);
                const itemRevenue = itemGrossRevenue * prorationRatio;
                totalCost += itemCost;
                totalProfit += (itemRevenue - itemCost);
            });
        }
    });

    // FIX: Deduct only the PROFIT portion of returned items from gross profit.
    // Using returnedProfitAmount (sell - cost) * returnedQty avoids over-deducting
    // the full sell price, which was causing GP to collapse to 0 incorrectly.
    const totalReturnedProfit = sales.reduce((sum, s) => sum + (s.returnedProfitAmount || 0), 0);
    totalProfit = Math.max(0, totalProfit - totalReturnedProfit);

    // Also deduct returned units so the units-sold metric is accurate
    const totalReturnedUnits = sales.reduce((sum, s) => {
        return sum + Object.values(s.returnedQtyByProduct || {}).reduce((a, b) => a + b, 0);
    }, 0);
    totalUnits = Math.max(0, totalUnits - totalReturnedUnits);

    const gpPercentage = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;
    const avgProfitPercentage = totalCost > 0 ? ((totalProfit / totalCost) * 100) : 0;

    // Update displays
    metricRevenue.textContent = formatCurrency(totalRevenue);
    metricUnitsSold.textContent = totalUnits.toLocaleString();
    metricGrossProfit.textContent = formatCurrency(totalProfit);
    metricGpPercentage.textContent = formatPercentage(gpPercentage);
    metricAvgProfitPercentage.textContent = formatPercentage(avgProfitPercentage);
    revenueSalesCount.textContent = sales.length;

    // Calculate trend: compare current period revenue to previous equal-length period
    if (revenueTrend) {
        const { startDate, endDate } = getDateRange(currentDateFilter);
        const periodMs = endDate - startDate;
        const prevEnd = new Date(startDate.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - periodMs);
        const prevSales = filterSalesByDate(allSales, prevStart, prevEnd);
        const prevRevenue = prevSales.reduce((sum, s) => sum + (s.netTotal !== undefined ? s.netTotal : (s.total || 0)), 0);
        if (prevRevenue > 0) {
            const trendPct = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
            revenueTrend.textContent = (trendPct >= 0 ? '+' : '') + trendPct.toFixed(1) + '%';
            revenueTrend.style.color = trendPct >= 0 ? 'var(--color-success, #00C853)' : 'var(--color-danger, #FF1744)';
        } else {
            revenueTrend.textContent = totalRevenue > 0 ? '+100%' : '—';
            revenueTrend.style.color = totalRevenue > 0 ? 'var(--color-success, #00C853)' : '';
        }
    }
}

// ===== REVENUE TREND CHART =====

/**
 * Update revenue trend chart
 * @param {Array} sales - Filtered sales
 */
function updateRevenueTrendChart(sales) {
    const canvas = document.getElementById('revenue-trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destroy existing chart
    if (revenueTrendChart) {
        revenueTrendChart.destroy();
    }

    // Group sales by period
    const chartData = groupSalesByPeriod(sales, currentChartPeriod);

    // Create chart
    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: chartData.revenue,
                    borderColor: '#0066FF',
                    backgroundColor: 'rgba(0, 102, 255, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Profit',
                    data: chartData.profit,
                    borderColor: '#00C853',
                    backgroundColor: 'rgba(0, 200, 83, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#E8ECFB',
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(20, 26, 46, 0.95)',
                    titleColor: '#E8ECFB',
                    bodyColor: '#A0A8C4',
                    borderColor: '#2A3347',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(42, 51, 71, 0.5)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#A0A8C4',
                        font: { size: 11 },
                        callback: function(value) {
                            return 'PKR ' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#A0A8C4',
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

/**
 * Group sales by time period
 * @param {Array} sales - Sales to group
 * @param {string} period - Period type (daily, weekly, monthly)
 * @returns {Object} Chart data
 */
function groupSalesByPeriod(sales, period) {
    const groups = {};

    sales.forEach(sale => {
        const saleDate = new Date(sale.sale_date || sale.created_at);
        let key;

        switch (period) {
            case 'daily':
                key = saleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                break;
            case 'weekly':
                const weekStart = new Date(saleDate);
                weekStart.setDate(saleDate.getDate() - saleDate.getDay());
                key = 'Week of ' + weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                break;
            case 'monthly':
                key = saleDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                break;
        }

        if (!groups[key]) {
            groups[key] = { revenue: 0, profit: 0 };
        }

        groups[key].revenue += (sale.netTotal !== undefined ? sale.netTotal : (sale.total || 0));

        // Calculate profit from items with NIL proration
        if (sale.items) {
            // Calculate NIL adjustment ratio for this sale
            const grossTotal = sale.total || 0;
            const paidAmount = sale.paid_amount || 0;
            const remaining = sale.remaining_amount || 0;
            const returnedAmount = sale.returnedAmount || 0;
            
            // Check if NIL was used
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // Calculate proration ratio
            const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
            
            sale.items.forEach(item => {
                const itemGrossRevenue = (item.sell_price || 0) * (item.quantity || 0);
                const itemRevenue = itemGrossRevenue * prorationRatio;
                const itemCost = (item.purchase_price || 0) * (item.quantity || 0);
                const itemProfit = itemRevenue - itemCost;
                groups[key].profit += itemProfit;
            });
        }
    });

    const labels = Object.keys(groups);
    const revenue = labels.map(label => groups[label].revenue);
    const profit = labels.map(label => groups[label].profit);

    return { labels, revenue, profit };
}

// ===== PRODUCT PERFORMANCE =====

/**
 * Update product performance ranking
 * @param {Array} sales - Filtered sales
 */
function updateProductPerformance(sales) {
    // Aggregate sales data by product
    const productStats = {};

    sales.forEach(sale => {
        if (sale.items) {
            // Calculate NIL adjustment ratio for this sale
            const grossTotal = sale.total || 0;
            const paidAmount = sale.paid_amount || 0;
            const remaining = sale.remaining_amount || 0;
            const returnedAmount = sale.returnedAmount || 0;
            
            // Check if NIL was used
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // Calculate proration ratio: if NIL used, actual revenue / invoice total
            // This ratio will be applied to each item's revenue
            const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
            
            sale.items.forEach(item => {
                if (!productStats[item.product_id]) {
                    productStats[item.product_id] = {
                        id: item.product_id,
                        name: item.product_name,
                        quantity: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0
                    };
                }

                const stats = productStats[item.product_id];
                // FIX Bug #2: Subtract returned qty for this product in this sale
                const returnedQty = (sale.returnedQtyByProduct || {})[item.product_id] || 0;
                const netQty = Math.max(0, (item.quantity || 0) - returnedQty);
                stats.quantity += netQty;
                
                // Apply NIL proration to revenue and profit
                const itemGrossRevenue = (item.sell_price || 0) * netQty;
                const itemRevenue = itemGrossRevenue * prorationRatio;
                const itemCost = (item.purchase_price || 0) * netQty;
                
                stats.revenue += itemRevenue;
                stats.cost += itemCost;
                stats.profit += (itemRevenue - itemCost);
            });
        }
    });

    // Convert to array and sort
    let products = Object.values(productStats);

    switch (currentRanking) {
        case 'revenue':
            products.sort((a, b) => b.revenue - a.revenue);
            break;
        case 'profit':
            products.sort((a, b) => b.profit - a.profit);
            break;
        case 'quantity':
            products.sort((a, b) => b.quantity - a.quantity);
            break;
    }

    // Take top 10
    products = products.slice(0, 10);

    // Render
    if (products.length === 0) {
        productPerformanceGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3 class="empty-state-title">No Sales Data</h3>
                <p class="empty-state-description">No sales found for the selected period</p>
            </div>
        `;
        return;
    }

    productPerformanceGrid.innerHTML = products.map((product, index) => `
        <div class="performance-item">
            <div class="performance-rank">${index + 1}</div>
            <div class="performance-content">
                <h3 class="performance-product-name">${product.name}</h3>
                <div class="performance-metrics">
                    <div class="performance-metric">
                        <span class="performance-metric-label">Quantity</span>
                        <span class="performance-metric-value">${product.quantity}</span>
                    </div>
                    <div class="performance-metric">
                        <span class="performance-metric-label">Revenue</span>
                        <span class="performance-metric-value">${formatCurrency(product.revenue)}</span>
                    </div>
                    <div class="performance-metric">
                        <span class="performance-metric-label">Profit</span>
                        <span class="performance-metric-value">${formatCurrency(product.profit)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== DEAD STOCK DETECTION =====

/**
 * Update dead stock detection
 * @param {Array} sales - Filtered sales (same period as other sections for consistency)
 */
function updateDeadStockDetection(sales) {
    const deadStockData = [];
    const now = new Date();

    reportsProducts.forEach(product => {
        // Find last sale for this product within the filtered period
        let lastSaleDate = null;

        sales.forEach(sale => {
            if (sale.items) {
                const hasProduct = sale.items.some(item => item.product_id === product.id);
                if (hasProduct) {
                    const saleDate = new Date(sale.sale_date || sale.created_at);
                    if (!lastSaleDate || saleDate > lastSaleDate) {
                        lastSaleDate = saleDate;
                    }
                }
            }
        });

        if (product.stock > 0) {
            const daysSinceLastSale = lastSaleDate ? daysBetween(lastSaleDate, now) : 999;
            let status = 'fresh';
            
            if (daysSinceLastSale > 60) {
                status = 'dead';
            } else if (daysSinceLastSale > 30) {
                status = 'slow';
            }

            deadStockData.push({
                product,
                lastSaleDate,
                daysSinceLastSale,
                status
            });
        }
    });

    // Count by status
    const freshCount = deadStockData.filter(d => d.status === 'fresh').length;
    const slowCount = deadStockData.filter(d => d.status === 'slow').length;
    const deadCount = deadStockData.filter(d => d.status === 'dead').length;

    freshStockCount.textContent = freshCount;
    slowStockCount.textContent = slowCount;
    deadStockCount.textContent = deadCount;

    // Render table
    if (deadStockData.length === 0) {
        deadStockTbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem;">
                    No inventory items found
                </td>
            </tr>
        `;
        return;
    }

    deadStockTbody.innerHTML = deadStockData.map(item => `
        <tr>
            <td><strong>${item.product.name}</strong></td>
            <td>${item.lastSaleDate ? item.lastSaleDate.toLocaleDateString() : 'Never'}</td>
            <td>${item.daysSinceLastSale === 999 ? 'Never sold' : item.daysSinceLastSale + ' days'}</td>
            <td>${item.product.stock}</td>
            <td><span class="stock-status-badge ${item.status}">${item.status.toUpperCase()}</span></td>
            <td><button class="table-action-btn" onclick="navigateToProduct('${item.product.id}')">View</button></td>
        </tr>
    `).join('');
}

/**
 * Navigate to product - properly navigate to products page and open the product modal
 */
window.navigateToProduct = function(productId) {
    // First, navigate to the products page
    if (typeof navigateToPage === 'function') {
        navigateToPage('products');
    } else {
        // Fallback: manually trigger navigation
        const productsNavBtn = document.querySelector('[data-page="products"]');
        if (productsNavBtn) {
            productsNavBtn.click();
        }
    }
    
    // Wait for the products module to load, then open the edit modal
    setTimeout(() => {
        if (window.openEditProductModal) {
            window.openEditProductModal(productId);
        } else {
            console.error('Products module not loaded yet');
        }
    }, 500); // Give products module time to initialize
};

// ===== INVENTORY VELOCITY =====

/**
 * Update inventory velocity tracker
 * @param {Array} sales - Filtered sales
 */
function updateInventoryVelocity(sales) {
    const velocityData = [];

    reportsProducts.forEach(product => {
        // Calculate total sold
        let totalSold = 0;

        sales.forEach(sale => {
            if (sale.items) {
                sale.items.forEach(item => {
                    if (item.product_id === product.id) {
                        totalSold += item.quantity || 0;
                    }
                });
            }
        });

        if (totalSold > 0 || product.stock > 0) {
            const { startDate, endDate } = getDateRange(currentDateFilter);
            const days = daysBetween(startDate, endDate) || 1;
            const avgDailySales = totalSold / days;
            const daysOfStockLeft = avgDailySales > 0 ? product.stock / avgDailySales : 999;

            let velocity = 'slow';
            if (avgDailySales > 5) {
                velocity = 'fast';
            } else if (avgDailySales > 1) {
                velocity = 'medium';
            }

            velocityData.push({
                product,
                totalSold,
                avgDailySales,
                daysOfStockLeft,
                velocity
            });
        }
    });

    // Sort by velocity (fast first)
    velocityData.sort((a, b) => b.avgDailySales - a.avgDailySales);

    // Take top 12
    const topVelocity = velocityData.slice(0, 12);

    // Render
    if (topVelocity.length === 0) {
        velocityGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚡</div>
                <h3 class="empty-state-title">No Velocity Data</h3>
                <p class="empty-state-description">No sales activity in the selected period</p>
            </div>
        `;
        return;
    }

    velocityGrid.innerHTML = topVelocity.map(item => `
        <div class="velocity-card ${item.velocity}">
            <div class="velocity-header">
                <div>
                    <h3 class="velocity-product-name">${item.product.name}</h3>
                    <span class="velocity-badge ${item.velocity}">${item.velocity.toUpperCase()}</span>
                </div>
            </div>
            <div class="velocity-metrics">
                <div class="velocity-metric-row">
                    <span class="velocity-metric-label">Avg Daily Sales:</span>
                    <span class="velocity-metric-value">${item.avgDailySales.toFixed(2)} units/day</span>
                </div>
                <div class="velocity-metric-row">
                    <span class="velocity-metric-label">Current Stock:</span>
                    <span class="velocity-metric-value">${item.product.stock} units</span>
                </div>
                <div class="velocity-metric-row">
                    <span class="velocity-metric-label">Days of Stock:</span>
                    <span class="velocity-metric-value">${item.daysOfStockLeft === 999 ? '∞' : Math.round(item.daysOfStockLeft) + ' days'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== PARETO ANALYSIS (80/20) =====

/**
 * Update 80/20 Pareto analysis
 * @param {Array} sales - Filtered sales
 */
function updateParetoAnalysis(sales) {
    // Calculate profit per product
    const productProfits = {};
    let totalProfit = 0;

    sales.forEach(sale => {
        if (sale.items) {
            // Calculate NIL adjustment ratio for this sale
            const grossTotal = sale.total || 0;
            const paidAmount = sale.paid_amount || 0;
            const remaining = sale.remaining_amount || 0;
            const returnedAmount = sale.returnedAmount || 0;
            
            // Check if NIL was used
            const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
            
            // Calculate proration ratio: if NIL used, actual revenue / invoice total
            const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
            
            sale.items.forEach(item => {
                if (!productProfits[item.product_id]) {
                    productProfits[item.product_id] = {
                        id: item.product_id,
                        name: item.product_name,
                        profit: 0,
                        quantity: 0,
                        revenue: 0
                    };
                }

                // FIX Bug #2: Subtract returned qty for this product in this sale
                const returnedQty = (sale.returnedQtyByProduct || {})[item.product_id] || 0;
                const netQty = Math.max(0, (item.quantity || 0) - returnedQty);
                
                // Apply NIL proration to revenue and profit
                const itemGrossRevenue = (item.sell_price || 0) * netQty;
                const itemRevenue = itemGrossRevenue * prorationRatio;
                const itemCost = (item.purchase_price || 0) * netQty;
                const netProfit = itemRevenue - itemCost;

                productProfits[item.product_id].profit += netProfit;
                productProfits[item.product_id].quantity += netQty;
                productProfits[item.product_id].revenue += itemRevenue;
                totalProfit += netProfit;
            });
        }
    });

    // Sort by profit
    const sortedProducts = Object.values(productProfits).sort((a, b) => b.profit - a.profit);

    // Calculate top 20% products
    const top20Count = Math.ceil(sortedProducts.length * 0.2) || 1;
    const top20Products = sortedProducts.slice(0, top20Count);
    const top20Profit = top20Products.reduce((sum, p) => sum + p.profit, 0);
    const top20Percentage = totalProfit > 0 ? (top20Profit / totalProfit) * 100 : 0;

    paretoPercentage.textContent = formatPercentage(top20Percentage);

    // Render top products
    if (top20Products.length === 0) {
        paretoProductsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3 class="empty-state-title">No Data Available</h3>
                <p class="empty-state-description">No profitable products found</p>
            </div>
        `;
        return;
    }

    paretoProductsGrid.innerHTML = top20Products.map((product, index) => `
        <div class="pareto-product-card">
            <div class="pareto-product-header">
                <div class="pareto-rank-badge">${index + 1}</div>
                <h3 class="pareto-product-name">${product.name}</h3>
            </div>
            <div class="pareto-product-stats">
                <div class="pareto-stat-row">
                    <span class="pareto-stat-label">Profit:</span>
                    <span class="pareto-stat-value">${formatCurrency(product.profit)}</span>
                </div>
                <div class="pareto-stat-row">
                    <span class="pareto-stat-label">Revenue:</span>
                    <span class="pareto-stat-value">${formatCurrency(product.revenue)}</span>
                </div>
                <div class="pareto-stat-row">
                    <span class="pareto-stat-label">Units Sold:</span>
                    <span class="pareto-stat-value">${product.quantity}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== FINANCIAL SUMMARY =====

/**
 * Update financial summary section
 * NOTE: This function uses ALL transactions (not date-filtered) because 
 * financial metrics like Cash on Hand, AR, AP, and Net Position are cumulative
 * and represent the current state of the business, not performance in a period.
 * @param {Array} sales - Filtered sales (NOT used for financial summary, kept for compatibility)
 */
async function updateFinancialSummary(sales) {
    // Calculate inventory valuation
    let totalCostValue = 0;
    let totalSellValue = 0;

    reportsProducts.forEach(product => {
        totalCostValue += (product.purchase_price || 0) * (product.stock || 0);
        totalSellValue += (product.sell_price || 0) * (product.stock || 0);
    });

    const potentialProfit = totalSellValue - totalCostValue;

    if (inventoryCostValue)       inventoryCostValue.textContent       = formatCurrency(totalCostValue);
    if (inventorySellValue)       inventorySellValue.textContent       = formatCurrency(totalSellValue);
    if (inventoryPotentialProfit) inventoryPotentialProfit.textContent = formatCurrency(potentialProfit);

    // Calculate cash flow - CRITICAL FIX: Use payments table for accurate cash tracking
    // This ensures we capture ALL payments including those against opening balances
    const paymentsResult = await window.StorageModule.getAllData('payments');
    const payments = paymentsResult.success ? paymentsResult.data : [];
    
    // Customer payments (cash received from customers)
    // Includes: sales payments + opening balance payments from customers
    let totalReceivedFromCustomers = 0;
    
    payments.forEach(p => {
        if (p.transaction_type === 'sale') {
            totalReceivedFromCustomers += p.amount || 0;
        } else if (p.transaction_type === 'opening_balance') {
            // Check notes to see if it's from customer or supplier
            const isCustomerPayment = p.notes && p.notes.includes('(customer)');
            if (isCustomerPayment) {
                totalReceivedFromCustomers += p.amount || 0;
            }
        }
    });
    
    // Supplier payments (cash paid to suppliers)
    // Includes: purchase payments + opening balance payments to suppliers
    let totalPaidToSuppliers = 0;
    
    payments.forEach(p => {
        if (p.transaction_type === 'purchase') {
            totalPaidToSuppliers += p.amount || 0;
        } else if (p.transaction_type === 'opening_balance') {
            // Check notes to see if it's from customer or supplier
            const isSupplierPayment = p.notes && p.notes.includes('(supplier)');
            if (isSupplierPayment) {
                totalPaidToSuppliers += p.amount || 0;
            }
        }
    });
    
    // Calculate AR and AP from sales/purchases remaining amounts
    let totalReceivable = 0;
    allSales.forEach(sale => {
        totalReceivable += sale.remaining_amount || 0;
    });

    let totalPayable = 0;
    allPurchases.forEach(purchase => {
        totalPayable += purchase.remaining_amount || 0;
    });
    
    // CRITICAL FIX: Load customers and suppliers to include opening balances in AR/AP
    const customersResult = await window.StorageModule.getAllData('customers');
    const customers = customersResult.success ? customersResult.data : [];
    
    const suppliersResult = await window.StorageModule.getAllData('suppliers');
    const suppliers = suppliersResult.success ? suppliersResult.data : [];
    
    // Add opening balances to AR and AP
    const customersOpeningBalance = customers.reduce((sum, c) => sum + (c.opening_balance || 0), 0);
    const suppliersOpeningBalance = suppliers.reduce((sum, s) => sum + (s.opening_balance || 0), 0);
    
    totalReceivable += customersOpeningBalance;
    totalPayable += suppliersOpeningBalance;

    // ✨ NEW: Load returns and adjust cash flow with NIL proration
    const returnsResult = await window.StorageModule.getAllData('returns');
    let saleReturnsTotal = 0;
    let purchaseReturnsTotal = 0;
    
    if (returnsResult.success && returnsResult.data) {
        returnsResult.data.forEach(returnRecord => {
            const returnAmount = returnRecord.total_amount || 0;
            
            if (returnRecord.return_type === 'sale') {
                // Find the original sale to check if NIL was used
                const originalSale = allSales.find(s => s.id === returnRecord.original_transaction_id);
                
                if (originalSale) {
                    const grossTotal = originalSale.total || 0;
                    const paidAmount = originalSale.paid_amount || 0;
                    const remaining = originalSale.remaining_amount || 0;
                    
                    // Check if NIL was used on the original sale
                    const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
                    
                    if (nilUsed && grossTotal > 0) {
                        // Prorate the return amount: actual refund = return × (paid/total)
                        const prorationRatio = paidAmount / grossTotal;
                        const actualRefund = returnAmount * prorationRatio;
                        saleReturnsTotal += actualRefund;
                    } else {
                        // No NIL used, use full return amount
                        saleReturnsTotal += returnAmount;
                    }
                } else {
                    // Original sale not found, use full return amount
                    saleReturnsTotal += returnAmount;
                }
            } else if (returnRecord.return_type === 'purchase') {
                // Find the original purchase to check if NIL was used
                const originalPurchase = allPurchases.find(p => p.id === returnRecord.original_transaction_id);
                
                if (originalPurchase) {
                    const grossTotal = originalPurchase.total || 0;
                    const paidAmount = originalPurchase.paid_amount || 0;
                    const remaining = originalPurchase.remaining_amount || 0;
                    
                    // Check if NIL was used on the original purchase
                    const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
                    
                    if (nilUsed && grossTotal > 0) {
                        // Prorate the return amount: actual refund received = return × (paid/total)
                        const prorationRatio = paidAmount / grossTotal;
                        const actualRefund = returnAmount * prorationRatio;
                        purchaseReturnsTotal += actualRefund;
                    } else {
                        // No NIL used, use full return amount
                        purchaseReturnsTotal += returnAmount;
                    }
                } else {
                    // Original purchase not found, use full return amount
                    purchaseReturnsTotal += returnAmount;
                }
            }
        });
    }

    // ✨ NEW: Load expenses and include in cash flow
    const expensesResult = await window.StorageModule.getAllData('expenses');
    let totalExpenses = 0;
    
    if (expensesResult.success && expensesResult.data) {
        totalExpenses = expensesResult.data.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    }

    // ✨ ADJUSTED: Account for returns in cash flow
    // Cash from customers = received - refunded to customers
    const netReceivedFromCustomers = totalReceivedFromCustomers - saleReturnsTotal;
    
    // Cash paid to suppliers = paid - refunded from suppliers
    const netPaidToSuppliers = totalPaidToSuppliers - purchaseReturnsTotal;

    // Total Cash Out = Payments to suppliers + Expenses
    const totalCashOut = netPaidToSuppliers + totalExpenses;

    // Net Cash on Hand = Cash In - Cash Out
    const cashOnHandAmount = netReceivedFromCustomers - totalCashOut;

    // Display Cash In and Cash Out separately
    const cashInEl = document.getElementById('cash-in');
    const cashOutEl = document.getElementById('cash-out');
    
    if (cashInEl) cashInEl.textContent = formatCurrency(netReceivedFromCustomers);
    if (cashOutEl) cashOutEl.textContent = formatCurrency(totalCashOut);
    if (cashOnHand) cashOnHand.textContent = formatCurrency(cashOnHandAmount);
    if (outstandingAR) outstandingAR.textContent = formatCurrency(totalReceivable);
    if (outstandingAP) outstandingAP.textContent = formatCurrency(totalPayable);
    
    // Net Position = Cash on Hand + AR - AP
    const netCashPosition = cashOnHandAmount + totalReceivable - totalPayable;
    if (netPosition) netPosition.textContent = formatCurrency(netCashPosition);
}

// ===== EVENT LISTENERS =====

// Filter period buttons
filterPeriodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        filterPeriodBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentDateFilter = btn.dataset.period;

        // Show/hide custom date range
        if (currentDateFilter === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            generateAllReports();
        }
    });
});

// Apply custom date range
if (applyCustomDateBtn) {
    applyCustomDateBtn.addEventListener('click', () => {
        if (reportDateFrom.value && reportDateTo.value) {
            generateAllReports();
        } else {
            showNotification('Please select both start and end dates', 'error');
        }
    });
}

// Chart period tabs
chartTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        chartTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentChartPeriod = btn.dataset.chartPeriod;
        
        const { startDate, endDate } = getDateRange(currentDateFilter);
        const filteredSales = filterSalesByDate(allSales, startDate, endDate);
        updateRevenueTrendChart(filteredSales);
    });
});

// Ranking tabs
rankingTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        rankingTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentRanking = btn.dataset.ranking;
        
        const { startDate, endDate } = getDateRange(currentDateFilter);
        const filteredSales = filterSalesByDate(allSales, startDate, endDate);
        updateProductPerformance(filteredSales);
    });
});

// Export report button
const exportReportBtn = document.getElementById('export-report-btn');
if (exportReportBtn) {
    exportReportBtn.addEventListener('click', () => {
        exportReport();
    });
}

// ===== EXPORT REPORT FUNCTION =====
function exportReport() {
    try {
        const { startDate, endDate } = getDateRange(currentDateFilter);
        const filteredSales = filterSalesByDate(allSales, startDate, endDate);
        
        // Calculate financial metrics
        let totalRevenue = 0;
        let totalCost = 0;
        let totalUnits = 0;
        let totalProfit = 0;

        filteredSales.forEach(sale => {
            const saleRevenue = sale.netTotal !== undefined ? sale.netTotal : (sale.total || 0);
            totalRevenue += saleRevenue;
            
            if (sale.items && sale.items.length > 0) {
                const grossTotal = sale.total || 0;
                const paidAmount = sale.paid_amount || 0;
                const remaining = sale.remaining_amount || 0;
                const returnedAmount = sale.returnedAmount || 0;
                const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
                const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
                
                sale.items.forEach(item => {
                    totalUnits += item.quantity || 0;
                    const itemCost = (item.purchase_price || 0) * (item.quantity || 0);
                    const itemGrossRevenue = (item.sell_price || 0) * (item.quantity || 0);
                    const itemRevenue = itemGrossRevenue * prorationRatio;
                    totalCost += itemCost;
                    totalProfit += (itemRevenue - itemCost);
                });
            }
        });

        const totalReturnedProfit = filteredSales.reduce((sum, s) => sum + (s.returnedProfitAmount || 0), 0);
        totalProfit = Math.max(0, totalProfit - totalReturnedProfit);
        
        const totalReturnedUnits = filteredSales.reduce((sum, s) => {
            return sum + Object.values(s.returnedQtyByProduct || {}).reduce((a, b) => a + b, 0);
        }, 0);
        totalUnits = Math.max(0, totalUnits - totalReturnedUnits);

        const gpPercentage = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;
        const avgProfitPercentage = totalCost > 0 ? ((totalProfit / totalCost) * 100) : 0;

        // Get product performance data
        const productStats = {};
        filteredSales.forEach(sale => {
            if (sale.items) {
                const grossTotal = sale.total || 0;
                const paidAmount = sale.paid_amount || 0;
                const remaining = sale.remaining_amount || 0;
                const returnedAmount = sale.returnedAmount || 0;
                const nilUsed = (remaining === 0) && (paidAmount < grossTotal) && (paidAmount > 0);
                const prorationRatio = nilUsed ? (Math.max(0, paidAmount - returnedAmount) / Math.max(1, grossTotal - returnedAmount)) : 1.0;
                
                sale.items.forEach(item => {
                    if (!productStats[item.product_id]) {
                        productStats[item.product_id] = {
                            name: item.product_name,
                            quantity: 0,
                            revenue: 0,
                            cost: 0,
                            profit: 0
                        };
                    }
                    const stats = productStats[item.product_id];
                    const returnedQty = (sale.returnedQtyByProduct || {})[item.product_id] || 0;
                    const netQty = Math.max(0, (item.quantity || 0) - returnedQty);
                    stats.quantity += netQty;
                    
                    const itemGrossRevenue = (item.sell_price || 0) * netQty;
                    const itemRevenue = itemGrossRevenue * prorationRatio;
                    const itemCost = (item.purchase_price || 0) * netQty;
                    
                    stats.revenue += itemRevenue;
                    stats.cost += itemCost;
                    stats.profit += (itemRevenue - itemCost);
                });
            }
        });

        let products = Object.values(productStats);
        switch (currentRanking) {
            case 'revenue':
                products.sort((a, b) => b.revenue - a.revenue);
                break;
            case 'profit':
                products.sort((a, b) => b.profit - a.profit);
                break;
            case 'quantity':
                products.sort((a, b) => b.quantity - a.quantity);
                break;
        }

        // Create CSV content
        let csv = '';
        
        // Report header
        csv += 'Business Performance Report\n';
        csv += `Generated: ${new Date().toLocaleString()}\n`;
        csv += `Period: ${currentDateFilter === 'custom' ? `${formatDate(startDate)} to ${formatDate(endDate)}` : currentDateFilter.charAt(0).toUpperCase() + currentDateFilter.slice(1)}\n`;
        csv += '\n';
        
        // Financial Summary
        csv += 'FINANCIAL SUMMARY\n';
        csv += 'Metric,Value\n';
        csv += `Total Revenue,${totalRevenue.toFixed(2)}\n`;
        csv += `Total Sales,${filteredSales.length}\n`;
        csv += `Units Sold,${totalUnits}\n`;
        csv += `Gross Profit,${totalProfit.toFixed(2)}\n`;
        csv += `GP Percentage,${gpPercentage.toFixed(2)}%\n`;
        csv += `Avg Profit Percentage,${avgProfitPercentage.toFixed(2)}%\n`;
        csv += '\n';
        
        // Product Performance
        csv += `TOP PRODUCTS BY ${currentRanking.toUpperCase()}\n`;
        csv += 'Rank,Product Name,Quantity Sold,Revenue,Cost,Profit,Profit Margin %\n';
        products.slice(0, 20).forEach((product, index) => {
            const profitMargin = product.revenue > 0 ? ((product.profit / product.revenue) * 100) : 0;
            const name = product.name.replace(/"/g, '""');
            csv += `${index + 1},"${name}",${product.quantity},${product.revenue.toFixed(2)},${product.cost.toFixed(2)},${product.profit.toFixed(2)},${profitMargin.toFixed(2)}%\n`;
        });
        
        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `business_report_${currentDateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        showNotification('Report exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting report:', error);
        showNotification('Error exporting report: ' + error.message, 'error');
    }
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ===== UTILITY FUNCTIONS =====

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== INITIALIZATION =====

/**
 * Initialize reports module
 */
async function initReportsModule() {
    console.log('🚀 Initializing Reports Module...');
    
    // Set default date inputs
    const today = new Date().toISOString().split('T')[0];
    if (reportDateFrom) reportDateFrom.value = today;
    if (reportDateTo) reportDateTo.value = today;
    
    // Load data and generate reports
    await loadReportsData();
    
    console.log('✅ Reports Module Initialized');
}

// Export module functions
window.ReportsModule = {
    loadReports: loadReportsData,
    init: initReportsModule
};

// ===== REPORTS SUB-TABS =====
window.switchReportsSubTab = function(tab, btn) {
    ['summary','pl','cashflow'].forEach(t => {
        const el = document.getElementById('subtab-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.reports-sub-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (tab === 'pl')       loadPL();
    if (tab === 'cashflow') loadCashFlow();
};

// ===== P&L STATEMENT =====
async function loadPL() {
    try {
        const [salesRes, saleItemsRes, returnsRes, expensesRes] = await Promise.all([
            window.StorageModule.getAllData('sales'),
            window.StorageModule.supabase.from('sale_items').select('*'),
            window.StorageModule.getAllData('returns'),
            window.StorageModule.getAllData('expenses')
        ]);

        const sales     = (salesRes.success ? salesRes.data : []);
        const saleItems = saleItemsRes.data || [];
        const returns   = (returnsRes.success ? returnsRes.data : []);
        const expenses  = (expensesRes.success ? expensesRes.data : []);

        // Apply same date filter as main reports
        const { from: dateFrom, to: dateTo } = window.ReportsModule._currentDateRange
            ? window.ReportsModule._currentDateRange()
            : { from: null, to: null };

        const inRange = (d) => {
            if (!d) return true;
            const dt = new Date(d);
            if (dateFrom && dt < dateFrom) return false;
            if (dateTo   && dt > dateTo)   return false;
            return true;
        };

        const filteredSales = sales.filter(s => inRange(s.sale_date || s.created_at));
        const saleIds       = filteredSales.map(s => s.id);
        const filteredItems = saleItems.filter(i => saleIds.includes(i.sale_id));
        const filteredReturns = returns.filter(r => r.return_type === 'sale' && inRange(r.return_date || r.created_at));
        const filteredExpenses = expenses.filter(e => inRange(e.date || e.created_at));

        const grossSales   = filteredSales.reduce((s, x) => s + (x.total || 0), 0);
        const saleReturns  = filteredReturns.reduce((s, r) => s + (r.total_amount || 0), 0);
        const netRevenue   = grossSales - saleReturns;
        const cogs         = filteredItems.reduce((s, i) => s + ((i.purchase_price || 0) * (i.quantity || 0)), 0);
        const grossProfit  = netRevenue - cogs;
        const gpPct        = netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : '0';

        const expByCategory = {};
        filteredExpenses.forEach(e => {
            const cat = (e.category || 'other').toLowerCase();
            expByCategory[cat] = (expByCategory[cat] || 0) + (e.amount || 0);
        });
        const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        const netProfit     = grossProfit - totalExpenses;
        const netPct        = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : '0';

        const fmt = n => 'PKR ' + Math.abs(Math.round(n)).toLocaleString();
        const set = (id, val, cls) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = val; if (cls) el.className = 'pl-value ' + cls; }
        };

        set('pl-gross-sales',    fmt(grossSales),   'success');
        set('pl-sale-returns',   '− ' + fmt(saleReturns), 'danger');
        set('pl-net-revenue',    fmt(netRevenue),   'success');
        set('pl-cogs',           '− ' + fmt(cogs),  'danger');
        set('pl-gross-profit',   fmt(grossProfit),  grossProfit >= 0 ? 'accent' : 'danger');
        set('pl-gp-pct',         gpPct + '%');

        const expMap = { rent:'pl-exp-rent', utilities:'pl-exp-utilities', salaries:'pl-exp-salaries', transport:'pl-exp-transport' };
        let otherExp = totalExpenses;
        Object.entries(expMap).forEach(([cat, id]) => {
            const v = expByCategory[cat] || 0;
            set(id, fmt(v));
            otherExp -= v;
        });
        set('pl-exp-other',      fmt(Math.max(0, otherExp)));
        set('pl-total-expenses', fmt(totalExpenses), 'danger');
        set('pl-net-profit',     fmt(netProfit),     netProfit >= 0 ? 'success' : 'danger');
        const netPctEl = document.getElementById('pl-net-pct');
        if (netPctEl) netPctEl.textContent = netPct + '%';

    } catch(e) { console.error('P&L load error:', e); }
}

// ===== CASH FLOW =====
async function loadCashFlow() {
    try {
        const paymentsRes  = await window.StorageModule.getAllData('payments');
        const expensesRes  = await window.StorageModule.getAllData('expenses');
        const payments     = paymentsRes.success ? paymentsRes.data : [];
        const expenses     = expensesRes.success ? expensesRes.data : [];

        const salePayments = payments.filter(p => p.transaction_type === 'sale');
        const purchPayments= payments.filter(p => p.transaction_type === 'purchase');

        const totalIn  = salePayments.reduce((s, p) => s + (p.amount || 0), 0);
        const totalOut = purchPayments.reduce((s, p) => s + (p.amount || 0), 0)
                       + expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const netFlow  = totalIn - totalOut;

        const fmt = n => 'PKR ' + Math.abs(Math.round(n)).toLocaleString();
        const setEl = (id, val, cls) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = val; if(cls) el.className = 'metric-value ' + cls; }
        };
        setEl('cf-total-in',  fmt(totalIn),  'success');
        setEl('cf-total-out', fmt(totalOut), 'danger');
        setEl('cf-net',       fmt(netFlow),  netFlow >= 0 ? 'success' : 'danger');

        // Build 8-week bar chart
        const weeks = [];
        for (let i = 7; i >= 0; i--) {
            const end   = new Date(); end.setDate(end.getDate() - i * 7);
            const start = new Date(end); start.setDate(start.getDate() - 6);
            weeks.push({ start, end, label: `W${8-i}`, in: 0, out: 0 });
        }
        const inWeek = (d, w) => {
            const dt = new Date(d);
            return dt >= w.start && dt <= w.end;
        };
        salePayments.forEach(p => {
            const dt = p.payment_date || p.created_at;
            const w  = weeks.find(w => inWeek(dt, w));
            if (w) w.in += p.amount || 0;
        });
        purchPayments.forEach(p => {
            const dt = p.payment_date || p.created_at;
            const w  = weeks.find(w => inWeek(dt, w));
            if (w) w.out += p.amount || 0;
        });
        expenses.forEach(e => {
            const dt = e.date || e.created_at;
            const w  = weeks.find(w => inWeek(dt, w));
            if (w) w.out += e.amount || 0;
        });

        const maxVal = Math.max(...weeks.map(w => Math.max(w.in, w.out)), 1);
        const barsEl  = document.getElementById('cf-bars');
        const labsEl  = document.getElementById('cf-bar-labels');
        if (!barsEl) return;

        barsEl.innerHTML = weeks.map(w => `
            <div class="cf-bar-group">
                <div class="cf-bar in"  style="height:${(w.in  / maxVal * 160).toFixed(0)}px" title="In: PKR ${Math.round(w.in).toLocaleString()}"></div>
                <div class="cf-bar out" style="height:${(w.out / maxVal * 160).toFixed(0)}px" title="Out: PKR ${Math.round(w.out).toLocaleString()}"></div>
            </div>`).join('');
        if (labsEl) labsEl.innerHTML = weeks.map(w => `<span>${w.label}</span>`).join('');

    } catch(e) { console.error('Cash flow error:', e); }
}

console.log('✅ Reports Module Loaded');

/* ==========================================
   JS END: Reports & Analytics Module
   ========================================== */

})(); // end IIFE