const { getDynamicHeaderManager } = require("./dynamic-header-manager");

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

/**
 * Get headers for API requests with dynamic header support
 * ✅ Implements proxy headers pattern from proxy-headers-explained.md
 * 🔥 Includes Dynamic Header Learning capability
 */
function getHeaders() {
    // Get dynamic headers from manager
    const dynamicHeaderManager = getDynamicHeaderManager();
    const dynamicHeaders = dynamicHeaderManager.getHeaders();

    // Static headers (always the same)
    const staticHeaders = {
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json;charset=UTF-8",
        // ✅ Proxy pattern: Replace origin/referer with target domain
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
        "sec-ch-ua":
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "x-request-id": generateRandomId(),
    };

    // Merge static and dynamic headers
    // Dynamic headers override static if same key exists
    return {
        ...staticHeaders,
        ...dynamicHeaders, // 🔥 Dynamic: API-Version, tposappversion, etc.
    };
}

/**
 * Get headers with optional logging
 */
function getHeadersWithLogging(context = "API Request") {
    const headers = getHeaders();

    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log("\n" + "=".repeat(60));
        console.log(`📤 HEADERS FOR: ${context}`);
        console.log(JSON.stringify(headers, null, 2));
        console.log("=".repeat(60) + "\n");
    }

    return headers;
}

module.exports = {
    generateRandomId,
    randomDelay,
    cleanBase64,
    getHeaders,
    getHeadersWithLogging,
};
