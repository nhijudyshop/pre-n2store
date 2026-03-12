// API Configuration
const ADDRESS_API_CONFIG = {
    baseURL: 'https://34tinhthanh.com/api',
    // Cloudflare Worker Proxy
    proxyURL: 'https://chatomni-proxy.nhijudyshop.workers.dev/api/proxy'
};

// Utility function to show loading
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading">⏳ Đang tải dữ liệu...</div>';
    }
}

// Utility function to show error
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="error"><strong>❌ Lỗi:</strong> ${message}</div>`;
    }
}

// Utility function to show success with data
function showResult(elementId, data) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="result"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
    }
}

// Generic API call function
async function callAPI(endpoint, method = 'GET', body = null) {
    try {
        const targetUrl = `${ADDRESS_API_CONFIG.baseURL}${endpoint}`;

        // Construct proxy URL
        const proxyUrl = `${ADDRESS_API_CONFIG.proxyURL}?url=${encodeURIComponent(targetUrl)}`;

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body && method === 'POST') {
            options.body = JSON.stringify(body);
        }

        console.log('API Call (Proxy):', proxyUrl, options);

        const response = await fetch(proxyUrl, options);

        // Handle non-JSON responses (e.g. proxy errors)
        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Proxy returned non-JSON response: ${text.substring(0, 100)}...`);
        }

        if (!response.ok) {
            throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// 1. Search Address (Tìm kiếm Tỉnh/Thành hoặc Phường/Xã)
// API: /search?q={keyword}
async function searchByName(keyword) {
    try {
        if (!keyword) return [];
        // API 34tinhthanh uses 'q' parameter
        return await callAPI(`/search?q=${encodeURIComponent(keyword)}`);
    } catch (error) {
        console.error('Error searching by name:', error);
        throw error;
    }
}

// Alias for backward compatibility if needed
async function searchAddress(keyword) {
    return searchByName(keyword);
}

async function searchNewAddress(keyword) {
    return searchByName(keyword);
}

// 2. Get Provinces (Lấy danh sách tỉnh)
// API: /provinces
async function getProvinces() {
    try {
        return await callAPI('/provinces');
    } catch (error) {
        console.error('Error getting provinces:', error);
        throw error;
    }
}

// 3. Get Wards (Lấy danh sách phường/xã theo tỉnh)
// API: /wards?province_code={code}
async function getWardsByProvince(provinceCode) {
    try {
        return await callAPI(`/wards?province_code=${provinceCode}`);
    } catch (error) {
        console.error('Error getting wards:', error);
        throw error;
    }
}

// 7. Search Full Address (Tìm kiếm theo địa chỉ đầy đủ - tienich.vnhub.com with fallback)
async function searchFullAddress(address) {
    // Try vnhub API first
    try {
        const result = await searchFullAddressVnhub(address);
        if (result && result.data && result.data.length > 0) {
            return result;
        }
    } catch (error) {
        console.warn('VNHub API failed, trying fallback (34tinhthanh.com):', error.message);
    }

    // Fallback to 34tinhthanh.com search API
    try {
        console.log('Fallback: Using 34tinhthanh.com search API');
        const searchResults = await searchByName(address);

        if (searchResults && searchResults.length > 0) {
            // Format results to match vnhub API format
            return {
                data: searchResults.map(item => ({
                    address: item.full_name || item.name || item.path || '',
                    note: item.type ? `Loại: ${item.type}` : ''
                }))
            };
        }

        return { data: [] };
    } catch (fallbackError) {
        console.error('Fallback API also failed:', fallbackError);
        throw new Error('Cả hai API đều không khả dụng. Vui lòng thử lại sau.');
    }
}

// Original VNHub API call (tienich.vnhub.com)
async function searchFullAddressVnhub(address) {
    const targetUrl = 'https://tienich.vnhub.com/api/wards';
    // Headers exactly matching the working browser request
    const customHeaders = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        "content-type": "application/json",
        "Host": "tienich.vnhub.com",
        "Origin": "https://tienich.vnhub.com",
        "Referer": "https://tienich.vnhub.com/",
        "sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-kas": "89232422"
    };

    // Construct proxy URL with custom headers
    const proxyUrl = `${ADDRESS_API_CONFIG.proxyURL}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(customHeaders))}`;

    console.log('Full Address Search (VNHub Proxy):', proxyUrl);

    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ address: address })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

// Log thông tin khi trang được load
console.log('API Handler loaded successfully (34tinhthanh.com + tienich.vnhub.com)!');
console.log('API Base URL:', ADDRESS_API_CONFIG.baseURL);
