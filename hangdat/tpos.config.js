// =====================================================
// TPOS API CONFIGURATION
// =====================================================

const TPOS_CONFIG = {
    API_BASE: "https://tomato.tpos.vn/odata/ProductTemplate",

    // Bearer Token - Cập nhật token mới tại đây
    BEARER_TOKEN:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI2ODgxNTgxYi1jZTc1LTRjMWQtYmM4ZC0yNjEwMzAzYzAzN2EiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjY2MzA3MjlkLWJlM2MtNDcwOS1iOWJjLWM2YjNmNzc2ZGYyZSIsImlhdCI6IjE3NTkzODc4NjciLCJuYmYiOjE3NTkzODc4NjcsImV4cCI6MTc2MDY4Mzg2NywiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.38Srsqs7uhUknlXr08NgtH34ZCBg9TuZ-geO2IrdYcU",

    // Upload settings
    CONCURRENT_UPLOADS: 3,
    CREATED_BY_NAME: "Tú", // Tên user tạo sản phẩm trên TPOS

    // Product settings
    DEFAULT_CATEGORY: "QUẦN ÁO",
    DEFAULT_UOM: "CÁI",
    DEFAULT_PRODUCT_TYPE: "Có thể lưu trữ",
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function generateRandomId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        },
    );
}

function randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

function cleanBase64(base64String) {
    if (!base64String) return null;
    if (base64String.includes(",")) {
        base64String = base64String.split(",")[1];
    }
    return base64String.replace(/\s/g, "");
}

function getTPOSHeaders() {
    return {
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json;charset=UTF-8",
        authorization: `Bearer ${TPOS_CONFIG.BEARER_TOKEN}`,
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
        "sec-ch-ua":
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        // Use dynamic version from global TPOS_CONFIG if available
        tposappversion: window.TPOS_CONFIG?.tposAppVersion || "5.12.29.1",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "x-request-id": generateRandomId(),
    };
}

// =====================================================
// EXPORTS
// =====================================================

window.TPOS_CONFIG = TPOS_CONFIG;
window.getTPOSHeaders = getTPOSHeaders;
window.generateRandomId = generateRandomId;
window.randomDelay = randomDelay;
window.cleanBase64 = cleanBase64;

console.log("✅ TPOS Configuration loaded");
