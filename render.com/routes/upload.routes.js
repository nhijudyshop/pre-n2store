const express = require("express");
const router = express.Router();
const { randomDelay } = require("../helpers/utils");
const { autoDetectAttributes } = require("../helpers/autoDetect");
const {
    buildAttributeLines,
    parseAttributeLines,
} = require("../helpers/attributeBuilder");
const { createExcelBase64 } = require("../services/excel.service");
const { processImage } = require("../services/image.service");
const {
    uploadExcelToTPOS,
    getLatestProducts,
    getProductDetail,
    updateProductWithImageAndAttributes,
} = require("../services/tpos.service");

// Upload single product
router.get("/upload", async (req, res) => {
    try {
        const {
            maSanPham,
            tenSanPham,
            giaBan,
            giaMua,
            ghiChu,
            anhSanPham,
            attributeLines,
            autoDetect,
        } = req.query;

        if (!tenSanPham) {
            return res.status(400).json({
                success: false,
                error: "Thiếu tham số: tenSanPham là bắt buộc",
            });
        }

        const product = {
            maSanPham: maSanPham || tenSanPham.replace(/\s/g, "_"),
            tenSanPham,
            giaBan: parseFloat(giaBan) || 0,
            giaMua: parseFloat(giaMua) || 0,
            ghiChu: ghiChu || "",
            anhSanPham: anhSanPham || null,
        };

        console.log("Uploading product:", product.tenSanPham);

        // Step 1: Upload Excel
        const excelBase64 = createExcelBase64([product]);
        await uploadExcelToTPOS(excelBase64);
        console.log("✓ Excel uploaded");

        // Step 2: Get created product
        await randomDelay(2000, 3500);
        const latestProducts = await getLatestProducts(1);

        if (latestProducts.length === 0) {
            throw new Error("Không tìm thấy sản phẩm vừa tạo");
        }

        const createdProduct = latestProducts[0];
        console.log("✓ Product created, ID:", createdProduct.Id);

        // Step 3: Get product detail
        await randomDelay(1000, 2000);
        const productDetail = await getProductDetail(createdProduct.Id);

        // Step 4: Process AttributeLines
        let parsedAttributeLines = [];

        if (attributeLines) {
            parsedAttributeLines = parseAttributeLines(attributeLines);
        } else if (!attributeLines || autoDetect === "true") {
            const textToAnalyze = `${product.tenSanPham} ${product.maSanPham} ${product.ghiChu}`;
            const detectedAttrs = autoDetectAttributes(textToAnalyze);

            if (Object.keys(detectedAttrs).length > 0) {
                parsedAttributeLines = buildAttributeLines(detectedAttrs);
                console.log("✓ Auto-detected attributes:", detectedAttrs);
            }
        }

        // Step 5: Process image
        let imageBase64 = null;
        if (product.anhSanPham) {
            imageBase64 = await processImage(product.anhSanPham);
        }

        // Step 6: Update product
        if (imageBase64 || parsedAttributeLines.length > 0) {
            await updateProductWithImageAndAttributes(
                productDetail,
                imageBase64,
                parsedAttributeLines,
            );
            console.log("✓ Product updated");
        }

        res.json({
            success: true,
            message: "Upload thành công!",
            data: {
                productId: createdProduct.Id,
                productName: tenSanPham,
                imageUploaded: !!imageBase64,
                attributeLinesCount: parsedAttributeLines.length,
                detectedAttributes: parsedAttributeLines.length > 0,
                tposUrl: `https://tomato.tpos.vn/product/${createdProduct.Id}`,
            },
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Upload batch products
router.post("/upload-batch", async (req, res) => {
    try {
        const { products, autoDetect } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Cần cung cấp mảng products",
            });
        }

        console.log(`Uploading ${products.length} products`);

        // Step 1: Upload Excel
        const excelBase64 = createExcelBase64(products);
        await uploadExcelToTPOS(excelBase64);
        console.log("✓ Excel uploaded");

        // Step 2: Get created products
        await randomDelay(2000, 3500);
        const latestProducts = await getLatestProducts(products.length);

        // Step 3: Update each product
        const results = [];
        for (let i = 0; i < latestProducts.length && i < products.length; i++) {
            const product = products[i];
            const tposProduct = latestProducts[i];

            try {
                await randomDelay(1000, 2000);
                const productDetail = await getProductDetail(tposProduct.Id);

                let attributeLines = [];

                if (product.attributeLines) {
                    attributeLines = parseAttributeLines(
                        product.attributeLines,
                    );
                } else if (!product.attributeLines || autoDetect === true) {
                    const textToAnalyze = `${product.tenSanPham} ${product.maSanPham || ""} ${product.ghiChu || ""}`;
                    const detectedAttrs = autoDetectAttributes(textToAnalyze);

                    if (Object.keys(detectedAttrs).length > 0) {
                        attributeLines = buildAttributeLines(detectedAttrs);
                        console.log(
                            `✓ Auto-detected for ${product.tenSanPham}:`,
                            detectedAttrs,
                        );
                    }
                }

                let imageBase64 = null;
                if (product.anhSanPham) {
                    imageBase64 = await processImage(product.anhSanPham);
                }

                if (imageBase64 || attributeLines.length > 0) {
                    await updateProductWithImageAndAttributes(
                        productDetail,
                        imageBase64,
                        attributeLines,
                    );
                }

                results.push({
                    productId: tposProduct.Id,
                    productName: product.tenSanPham,
                    imageUploaded: !!imageBase64,
                    attributeLinesCount: attributeLines.length,
                });
            } catch (error) {
                console.error(`Error updating ${tposProduct.Id}:`, error);
                results.push({
                    productId: tposProduct.Id,
                    productName: product.tenSanPham,
                    error: error.message,
                });
            }
        }

        res.json({
            success: true,
            message: `Upload ${results.length} sản phẩm thành công!`,
            data: results,
        });
    } catch (error) {
        console.error("Batch upload error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

module.exports = router;
