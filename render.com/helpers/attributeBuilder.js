const AVAILABLE_ATTRIBUTES = require("../data/attributes");

function buildAttributeLines(attributesInput) {
    if (!attributesInput) return [];

    if (Array.isArray(attributesInput) && attributesInput.length > 0) {
        if (attributesInput[0].Attribute && attributesInput[0].Values) {
            return attributesInput;
        }
    }

    const attributeLines = [];

    for (const [type, values] of Object.entries(attributesInput)) {
        if (!AVAILABLE_ATTRIBUTES[type]) continue;
        if (!values || values.length === 0) continue;

        const attrConfig = AVAILABLE_ATTRIBUTES[type];
        const attributeValues = [];

        for (const valueName of values) {
            const valueObj = attrConfig.values.find(
                (v) =>
                    v.Name.toLowerCase() === valueName.toLowerCase() ||
                    v.Code.toLowerCase() === valueName.toLowerCase(),
            );

            if (valueObj) {
                attributeValues.push({
                    Id: valueObj.Id,
                    Name: valueObj.Name,
                    Code: valueObj.Code,
                    Sequence: valueObj.Sequence,
                    AttributeId: attrConfig.id,
                    AttributeName: attrConfig.name,
                    PriceExtra: null,
                    NameGet: `${attrConfig.name}: ${valueObj.Name}`,
                    DateCreated: null,
                });
            }
        }

        if (attributeValues.length > 0) {
            attributeLines.push({
                Attribute: {
                    Id: attrConfig.id,
                    Name: attrConfig.name,
                    Code: attrConfig.code,
                    Sequence: type === "sizeText" ? 1 : null,
                    CreateVariant: true,
                },
                Values: attributeValues,
                AttributeId: attrConfig.id,
            });
        }
    }

    return attributeLines;
}

function parseAttributeLines(input) {
    if (!input) return [];

    if (typeof input === "string") {
        try {
            input = JSON.parse(input);
        } catch (e) {
            console.error("Failed to parse AttributeLines:", e);
            return [];
        }
    }

    if (Array.isArray(input)) {
        return input;
    }

    return buildAttributeLines(input);
}

module.exports = {
    buildAttributeLines,
    parseAttributeLines,
};
