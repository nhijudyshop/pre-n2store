const AVAILABLE_ATTRIBUTES = require("../data/attributes");

function autoDetectAttributes(text) {
    if (!text) return {};

    const textLower = text.toLowerCase();
    const detected = {};

    // Detect Size Text
    const detectedSizeText = [];
    AVAILABLE_ATTRIBUTES.sizeText.values.forEach((size) => {
        const pattern = new RegExp(
            `\\b${size.Code.toLowerCase()}\\b|\\b${size.Name.toLowerCase()}\\b`,
            "gi",
        );
        if (pattern.test(textLower)) {
            if (!detectedSizeText.find((s) => s === size.Name)) {
                detectedSizeText.push(size.Name);
            }
        }
    });

    // Detect Color - sort by length to match longer phrases first
    const detectedColors = [];
    const sortedColors = [...AVAILABLE_ATTRIBUTES.color.values].sort(
        (a, b) => b.Name.length - a.Name.length,
    );

    sortedColors.forEach((color) => {
        const pattern = new RegExp(
            `\\b${color.Name.toLowerCase()}\\b|\\b${color.Code.toLowerCase()}\\b`,
            "gi",
        );
        if (pattern.test(textLower)) {
            if (!detectedColors.find((c) => c === color.Name)) {
                detectedColors.push(color.Name);
            }
        }
    });

    // Detect Size Number
    const detectedSizeNumber = [];
    AVAILABLE_ATTRIBUTES.sizeNumber.values.forEach((size) => {
        const pattern = new RegExp(`\\b${size.Code}\\b`, "g");
        if (pattern.test(textLower)) {
            if (!detectedSizeNumber.find((s) => s === size.Name)) {
                detectedSizeNumber.push(size.Name);
            }
        }
    });

    if (detectedSizeText.length > 0) detected.sizeText = detectedSizeText;
    if (detectedColors.length > 0) detected.color = detectedColors;
    if (detectedSizeNumber.length > 0) detected.sizeNumber = detectedSizeNumber;

    return detected;
}

module.exports = { autoDetectAttributes };
