# Usage Examples

## How to use `smartFetch` in your code

### Before (Regular fetch):

```javascript
// Old way - only tries Cloudflare
const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
```

### After (Smart fetch with fallback):

```javascript
// New way - tries Cloudflare, falls back to Render on 500
const response = await API_CONFIG.smartFetch(
    'https://chatomni-proxy.nhijudyshop.workers.dev/api/token',
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }
);
```

## Example 1: Token Request

```javascript
async function getAuthToken() {
    try {
        const response = await API_CONFIG.smartFetch(
            `${API_CONFIG.WORKER_URL}/api/token`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error fetching token:', error);
        throw error;
    }
}
```

## Example 2: OData Request

```javascript
async function loadOrders() {
    const url = API_CONFIG.buildUrl.tposOData(
        'SaleOnline_Order/ODataService.GetView',
        '$top=100&$orderby=DateCreated desc'
    );

    try {
        const response = await API_CONFIG.smartFetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error loading orders:', error);
        throw error;
    }
}
```

## Example 3: Pancake API Request

```javascript
async function fetchPages(token) {
    const url = `${API_CONFIG.PANCAKE}/pages?access_token=${token}`;

    try {
        const response = await API_CONFIG.smartFetch(url);
        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error fetching pages:', error);
        throw error;
    }
}
```

## Check Server Status

```javascript
// Check which server is currently active
const status = API_CONFIG.getStatus();
console.log(status);
// {
//   primary: "https://chatomni-proxy.nhijudyshop.workers.dev",
//   fallback: "https://n2store-api-fallback.onrender.com",
//   current: "https://chatomni-proxy.nhijudyshop.workers.dev",
//   isFallbackActive: false
// }
```

## Reset to Primary Server

```javascript
// If fallback is active, reset to primary (Cloudflare)
API_CONFIG.resetToPrimary();
```

## Console Logs

### When Cloudflare works:
```
[API] 🌐 Trying Cloudflare: https://chatomni-proxy.nhijudyshop.workers.dev/api/token
[API] ✅ Cloudflare success
```

### When Cloudflare fails (500):
```
[API] 🌐 Trying Cloudflare: https://chatomni-proxy.nhijudyshop.workers.dev/api/token
[API] ⚠️ Cloudflare returned 500, trying fallback...
[API] ❌ Cloudflare failed: Cloudflare returned 500
[API] 🔄 Trying fallback: https://n2store-api-fallback.onrender.com/api/token
[API] ✅ Fallback success
[API] 🚨 Switched to FALLBACK mode (Render.com)
```

### When both fail:
```
[API] 🌐 Trying Cloudflare: https://chatomni-proxy.nhijudyshop.workers.dev/api/token
[API] ❌ Cloudflare failed: Failed to fetch
[API] 🔄 Trying fallback: https://n2store-api-fallback.onrender.com/api/token
[API] ❌ Fallback also failed: Failed to fetch
Error: Both Cloudflare and Fallback failed
```

## Migration Guide

### Files to update:

1. **tab1-orders.js** - Replace fetch with API_CONFIG.smartFetch
2. **tab3-product-assignment.js** - Replace fetch with API_CONFIG.smartFetch
3. **pancake-data-manager.js** - Replace fetch with API_CONFIG.smartFetch
4. **token-manager.js** - Replace fetch with API_CONFIG.smartFetch

### Search and replace pattern:

**Find:**
```javascript
fetch(url, options)
```

**Replace with:**
```javascript
API_CONFIG.smartFetch(url, options)
```

**Important:** Only replace fetch calls that go to the Cloudflare Worker!
