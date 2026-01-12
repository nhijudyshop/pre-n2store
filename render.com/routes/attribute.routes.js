const express = require("express");
const router = express.Router();
const AVAILABLE_ATTRIBUTES = require("../data/attributes");
const { autoDetectAttributes } = require("../helpers/autoDetect");
const { buildAttributeLines } = require("../helpers/attributeBuilder");

router.get("/attributes", (req, res) => {
    res.json({
        success: true,
        data: AVAILABLE_ATTRIBUTES,
    });
});

router.get("/detect-attributes", (req, res) => {
    const { text } = req.query;

    if (!text) {
        return res.status(400).json({
            success: false,
            error: "Thiếu tham số: text",
        });
    }

    const detected = autoDetectAttributes(text);
    const attributeLines = buildAttributeLines(detected);

    res.json({
        success: true,
        input: text,
        detected: detected,
        attributeLines: attributeLines,
    });
});

module.exports = router;
