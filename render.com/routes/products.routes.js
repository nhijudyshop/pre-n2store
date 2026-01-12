const express = require("express");
const router = express.Router();
const TPOS_CONFIG = require("../config/tpos.config");
const { randomDelay, getHeaders } = require("../helpers/utils");
const fetch = require("node-fetch");

/**
 * GET /products - Lấy danh sách sản phẩm
 * Query params:
 * - limit: số lượng (default: 10, max: 100)
 * - createdBy: lọc theo người tạo (default: "Tú")
 * - search: tìm kiếm theo tên hoặc mã
 */
router.get("/products", async (req, res) => {
    try {
        const {
            limit = 10,
            createdBy = TPOS_CONFIG.CREATED_BY_NAME,
            search = "",
        } = req.query;

        const limitNum = Math.min(parseInt(limit) || 10, 100);

        await randomDelay(300, 800);

        const queryParams = new URLSearchParams({
            Active: "true",
            priceId: "0",
            $top: "1000",
            $orderby: "DateCreated desc",
            $filter: "Active eq true",
            $count: "true",
        });

        const response = await fetch(
            `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2?${queryParams.toString()}`,
            {
                headers: {
                    ...getHeaders(),
                    authorization: TPOS_CONFIG.AUTH_TOKEN,
                },
            },
        );

        if (!response.ok) {
            throw new Error(`Get products failed: ${response.status}`);
        }

        const data = await response.json();
        let items = data.value || data;

        // Filter by createdBy
        if (createdBy) {
            items = items.filter((item) => item.CreatedByName === createdBy);
        }

        // Filter by search
        if (search) {
            const searchLower = search.toLowerCase();
            items = items.filter(
                (item) =>
                    (item.Name &&
                        item.Name.toLowerCase().includes(searchLower)) ||
                    (item.Code &&
                        item.Code.toLowerCase().includes(searchLower)),
            );
        }

        // Sort by date and limit
        items = items
            .sort((a, b) => new Date(b.DateCreated) - new Date(a.DateCreated))
            .slice(0, limitNum);

        res.json({
            success: true,
            total: items.length,
            data: items,
        });
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /products/:id - Lấy chi tiết 1 sản phẩm
 */
router.get("/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: "Product ID không hợp lệ",
            });
        }

        await randomDelay(300, 800);

        const response = await fetch(
            `${TPOS_CONFIG.API_BASE}(${id})?$expand=${TPOS_CONFIG.EXPAND_PARAMS}`,
            {
                headers: {
                    ...getHeaders(),
                    authorization: TPOS_CONFIG.AUTH_TOKEN,
                },
            },
        );

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({
                    success: false,
                    error: "Không tìm thấy sản phẩm",
                });
            }
            throw new Error(`Get product detail failed: ${response.status}`);
        }

        const product = await response.json();

        res.json({
            success: true,
            data: product,
        });
    } catch (error) {
        console.error("Get product detail error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

module.exports = router;
