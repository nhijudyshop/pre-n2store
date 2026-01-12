const express = require("express");
const router = express.Router();
const { getDynamicHeaderManager } = require("../helpers/dynamic-header-manager");

/**
 * GET /dynamic-headers - Xem current dynamic headers
 */
router.get("/dynamic-headers", (req, res) => {
    try {
        const manager = getDynamicHeaderManager();
        const stats = manager.getStats();

        res.json({
            success: true,
            message: "Dynamic headers retrieved successfully",
            data: stats,
        });
    } catch (error) {
        console.error("❌ Error getting dynamic headers:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /dynamic-headers/history - Xem update history
 * Query params:
 * - limit: Số lượng history entries (default: 10)
 */
router.get("/dynamic-headers/history", (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const manager = getDynamicHeaderManager();
        const history = manager.getHistory(limit);

        res.json({
            success: true,
            message: `Retrieved last ${history.length} updates`,
            data: {
                history,
                total: history.length,
            },
        });
    } catch (error) {
        console.error("❌ Error getting history:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /dynamic-headers/reset - Reset về default headers
 */
router.post("/dynamic-headers/reset", async (req, res) => {
    try {
        const manager = getDynamicHeaderManager();
        await manager.reset();

        res.json({
            success: true,
            message: "Dynamic headers reset to defaults",
            data: manager.getHeaders(),
        });
    } catch (error) {
        console.error("❌ Error resetting headers:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /dynamic-headers/set - Manually set a header (Admin only)
 * Body:
 * {
 *   "headerName": "API-Version",
 *   "value": "2.0"
 * }
 */
router.post("/dynamic-headers/set", async (req, res) => {
    try {
        const { headerName, value } = req.body;

        if (!headerName || !value) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: headerName, value",
            });
        }

        const manager = getDynamicHeaderManager();
        const result = await manager.setHeader(headerName, value, {
            verbose: true,
        });

        if (result) {
            res.json({
                success: true,
                message: `Header ${headerName} updated successfully`,
                data: {
                    headerName,
                    value,
                    allHeaders: manager.getHeaders(),
                },
            });
        } else {
            res.status(400).json({
                success: false,
                error: `Failed to update header ${headerName}. Check validation rules.`,
            });
        }
    } catch (error) {
        console.error("❌ Error setting header:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /dynamic-headers/health - Health check for dynamic headers system
 */
router.get("/dynamic-headers/health", (req, res) => {
    try {
        const manager = getDynamicHeaderManager();
        const stats = manager.getStats();

        res.json({
            status: "OK",
            service: "Dynamic Headers Manager",
            timestamp: new Date().toISOString(),
            stats: {
                totalHeaders: Object.keys(stats.currentHeaders).length,
                totalUpdates: stats.totalUpdates,
                storageType: stats.storageType,
            },
        });
    } catch (error) {
        res.status(500).json({
            status: "ERROR",
            service: "Dynamic Headers Manager",
            timestamp: new Date().toISOString(),
            error: error.message,
        });
    }
});

module.exports = router;
