const CACHE_NAME = 'hisabdesk-v7';
const urlsToCache = [
  '/King-Filter-House/',
  '/King-Filter-House/index.html',
  '/King-Filter-House/css/styles.css',
  '/King-Filter-House/css/additional-styles.css',
  '/King-Filter-House/js/config.js',
  '/King-Filter-House/js/utils.js',
  '/King-Filter-House/js/storage.js',
  '/King-Filter-House/js/subscription.js',
  '/King-Filter-House/js/customFields.js',
  '/King-Filter-House/js/invoiceTemplate.js',
  '/King-Filter-House/js/app.js',
  '/King-Filter-House/js/products.js',
  '/King-Filter-House/js/sales.js',
  '/King-Filter-House/js/quickSale.js',
  '/King-Filter-House/js/purchases.js',
  '/King-Filter-House/js/quickPurchase.js',
  '/King-Filter-House/js/customers.js',
  '/King-Filter-House/js/suppliers.js',
  '/King-Filter-House/js/returns.js',
  '/King-Filter-House/js/payments.js',
  '/King-Filter-House/js/accounts.js',
  '/King-Filter-House/js/expenses.js',
  '/King-Filter-House/js/reports.js'
];

// Install - cache files
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app files');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('Cache addAll failed:', err);
        });
      })
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    clients.claim().then(() => {
      return caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      });
    })
  );
});

// Fetch - network first, fall back to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignore non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Ignore non-GET requests (POST, PUT, DELETE)
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignore Supabase API calls - let them fail naturally
  if (url.hostname.includes('supabase.co')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for our own files
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});