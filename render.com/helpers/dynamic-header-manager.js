// =====================================================
// DYNAMIC HEADER MANAGER - Auto Learning & Storage
// =====================================================
// Based on proxy-headers-explained.md section: 🔄 Dynamic Header Learning

const fs = require("fs").promises;
const path = require("path");

class DynamicHeaderManager {
    constructor(options = {}) {
        this.storageType = options.storageType || process.env.DYNAMIC_HEADERS_STORAGE || "file";
        this.filePath = options.filePath || process.env.DYNAMIC_HEADERS_FILE || path.join(__dirname, "../../dynamic-headers.json");

        // Default headers (empty - will be learned dynamically)
        this.defaults = {};

        // Current dynamic headers (will be loaded from storage)
        this.headers = {};

        // Update history for monitoring
        this.updateHistory = [];
        this.maxHistorySize = options.maxHistorySize || 50;

        // Rate limiting for updates
        this.lastUpdate = {};
        this.updateCooldown = options.updateCooldown || 60000; // 1 minute

        // Headers that should NOT be learned (security)
        this.sensitiveHeaders = [
            "authorization",
            "api-key",
            "secret",
            "token",
            "password",
            "cookie",
            "session",
        ];

        // Initialize
        this.init();
    }

    async init() {
        console.log("[DYNAMIC HEADERS] Initializing Dynamic Header Manager...");
        console.log(`[DYNAMIC HEADERS] Storage type: ${this.storageType}`);
        console.log(`[DYNAMIC HEADERS] File path: ${this.filePath}`);

        await this.load();

        console.log("[DYNAMIC HEADERS] Current headers:", JSON.stringify(this.headers, null, 2));
    }

    // Load headers from storage
    async load() {
        try {
            if (this.storageType === "file") {
                const data = await fs.readFile(this.filePath, "utf8");
                const loaded = JSON.parse(data);
                this.headers = { ...this.defaults, ...loaded.headers };
                this.updateHistory = loaded.history || [];
                console.log("[DYNAMIC HEADERS] ✅ Loaded headers from file");
            } else if (this.storageType === "memory") {
                console.log("[DYNAMIC HEADERS] ⚠️  Using in-memory storage (will reset on restart)");
            }
            // TODO: Add Redis/Database support
        } catch (error) {
            if (error.code === "ENOENT") {
                console.log("[DYNAMIC HEADERS] 📝 No saved headers found, using defaults");
                await this.save(); // Create initial file
            } else {
                console.error("[DYNAMIC HEADERS] ❌ Error loading headers:", error.message);
            }
        }
    }

    // Save headers to storage
    async save() {
        try {
            if (this.storageType === "file") {
                const data = {
                    headers: this.headers,
                    history: this.updateHistory.slice(-this.maxHistorySize), // Keep last N
                    lastSaved: new Date().toISOString(),
                };
                await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
                console.log("[DYNAMIC HEADERS] 💾 Saved headers to file");
            }
            // TODO: Add Redis/Database support
        } catch (error) {
            console.error("[DYNAMIC HEADERS] ❌ Error saving headers:", error.message);
        }
    }

    // Check if header name is sensitive
    isSensitiveHeader(headerName) {
        const lower = headerName.toLowerCase();
        return this.sensitiveHeaders.some((sensitive) =>
            lower.includes(sensitive)
        );
    }

    // Check if update is allowed (rate limiting)
    canUpdate(headerName) {
        const now = Date.now();
        const lastUpdateTime = this.lastUpdate[headerName] || 0;
        return now - lastUpdateTime > this.updateCooldown;
    }

    // Validate header value format
    validateHeaderValue(headerName, value) {
        if (!value || typeof value !== "string") {
            return false;
        }

        // Specific validations
        if (headerName === "API-Version") {
            // Must match version format: 1.0, 1.0.0, etc.
            return /^\d+\.\d+(\.\d+)?$/.test(value);
        }

        if (headerName === "tposappversion") {
            // Must match version format: 5.9.10.1
            return /^\d+\.\d+\.\d+\.\d+$/.test(value);
        }

        // Default: any non-empty string
        return value.trim().length > 0;
    }

    // Learn from response headers
    async learnFromResponse(response, options = {}) {
        const { force = false, verbose = false } = options;
        let updated = false;

        try {
            // Get headers from response
            const responseHeaders = response.headers || {};

            // Learn from specific headers
            const headersToLearn = [
                "api-version",
                "tposappversion",
                "x-client-version",
                "x-api-key-version",
            ];

            for (const headerName of headersToLearn) {
                let value = null;

                // Try to get from response.headers (fetch API)
                if (typeof responseHeaders.get === "function") {
                    value = responseHeaders.get(headerName);
                } else {
                    // Try direct access (object)
                    value = responseHeaders[headerName];
                }

                if (value) {
                    // Normalize header name (capitalize)
                    const normalizedName =
                        headerName === "api-version"
                            ? "API-Version"
                            : headerName === "tposappversion"
                            ? "tposappversion"
                            : headerName
                                  .split("-")
                                  .map(
                                      (part) =>
                                          part.charAt(0).toUpperCase() +
                                          part.slice(1),
                                  )
                                  .join("-");

                    const updateResult = await this.updateHeader(
                        normalizedName,
                        value,
                        { force, verbose }
                    );

                    if (updateResult) {
                        updated = true;
                    }
                }
            }

            return updated;
        } catch (error) {
            console.error(
                "[DYNAMIC HEADERS] Error learning from response:",
                error.message
            );
            return false;
        }
    }

    // Learn from response body (config object)
    async learnFromResponseBody(data, options = {}) {
        const { force = false, verbose = false } = options;
        let updated = false;

        try {
            // Check if response has config object
            if (data && data.config) {
                const serverConfig = data.config;

                // Update API version
                if (serverConfig.apiVersion) {
                    const result = await this.updateHeader(
                        "API-Version",
                        serverConfig.apiVersion,
                        { force, verbose }
                    );
                    if (result) updated = true;
                }

                // Update required headers
                if (
                    serverConfig.requiredHeaders &&
                    typeof serverConfig.requiredHeaders === "object"
                ) {
                    for (const [key, value] of Object.entries(
                        serverConfig.requiredHeaders
                    )) {
                        const result = await this.updateHeader(key, value, {
                            force,
                            verbose,
                        });
                        if (result) updated = true;
                    }
                }
            }

            return updated;
        } catch (error) {
            console.error(
                "[DYNAMIC HEADERS] Error learning from response body:",
                error.message
            );
            return false;
        }
    }

    // Update a specific header
    async updateHeader(headerName, newValue, options = {}) {
        const { force = false, verbose = false } = options;

        // Security check
        if (this.isSensitiveHeader(headerName)) {
            if (verbose) {
                console.log(
                    `[DYNAMIC HEADERS] ⚠️  Skipping sensitive header: ${headerName}`
                );
            }
            return false;
        }

        // Validate format
        if (!this.validateHeaderValue(headerName, newValue)) {
            if (verbose) {
                console.log(
                    `[DYNAMIC HEADERS] ❌ Invalid format for ${headerName}: ${newValue}`
                );
            }
            return false;
        }

        // Check if value changed
        const oldValue = this.headers[headerName];
        if (oldValue === newValue) {
            return false; // No change
        }

        // Rate limiting check (unless forced)
        if (!force && !this.canUpdate(headerName)) {
            if (verbose) {
                console.log(
                    `[DYNAMIC HEADERS] ⏳ Rate limited: ${headerName} (cooldown active)`
                );
            }
            return false;
        }

        // Update the header
        this.headers[headerName] = newValue;
        this.lastUpdate[headerName] = Date.now();

        // Add to history
        const historyEntry = {
            timestamp: new Date().toISOString(),
            headerName,
            oldValue,
            newValue,
        };
        this.updateHistory.push(historyEntry);

        // Log update
        console.log(
            `[DYNAMIC HEADERS] 🔄 Updated ${headerName}: ${oldValue || "(none)"} → ${newValue}`
        );

        // Save to storage
        await this.save();

        return true;
    }

    // Get current headers for request
    getHeaders() {
        return { ...this.headers };
    }

    // Get specific header
    getHeader(headerName) {
        return this.headers[headerName];
    }

    // Get update history
    getHistory(limit = 10) {
        return this.updateHistory.slice(-limit).reverse();
    }

    // Get stats
    getStats() {
        return {
            currentHeaders: this.headers,
            totalUpdates: this.updateHistory.length,
            lastUpdate:
                this.updateHistory.length > 0
                    ? this.updateHistory[this.updateHistory.length - 1]
                    : null,
            storageType: this.storageType,
            filePath: this.storageType === "file" ? this.filePath : null,
        };
    }

    // Reset to defaults
    async reset() {
        console.log("[DYNAMIC HEADERS] 🔄 Resetting to defaults...");
        this.headers = { ...this.defaults };
        this.updateHistory.push({
            timestamp: new Date().toISOString(),
            action: "reset",
            message: "Reset to default headers",
        });
        await this.save();
        console.log("[DYNAMIC HEADERS] ✅ Reset complete");
    }

    // Manual set header (for testing/admin)
    async setHeader(headerName, value, options = {}) {
        return await this.updateHeader(headerName, value, {
            force: true,
            ...options,
        });
    }
}

// Singleton instance
let instance = null;

function getDynamicHeaderManager(options = {}) {
    if (!instance) {
        instance = new DynamicHeaderManager(options);
    }
    return instance;
}

module.exports = {
    DynamicHeaderManager,
    getDynamicHeaderManager,
};
