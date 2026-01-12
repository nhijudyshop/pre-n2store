const fetch = require("node-fetch");
const { randomDelay, cleanBase64 } = require("../helpers/utils");

async function processImage(imageInput) {
    if (!imageInput) return null;

    if (!imageInput.startsWith("http")) {
        return cleanBase64(imageInput);
    }

    try {
        await randomDelay(300, 800);
        const response = await fetch(imageInput, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });
        const buffer = await response.buffer();
        return buffer.toString("base64");
    } catch (error) {
        console.error("Error converting image from URL:", error);
        return null;
    }
}

module.exports = { processImage };
