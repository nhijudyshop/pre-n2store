// =====================================================
// AI INVOICE PROCESSOR - Core AI Service Layer
// Handles Gemini API communication and data extraction
// =====================================================

console.log('[AI] Invoice processor initialized');

// =====================================================
// CONFIGURATION
// =====================================================

const AI_CONFIG = {
    GEMINI_PROXY_URL: 'https://n2store-fallback.onrender.com/api/gemini/chat',
    MODEL: 'gemini-3-flash-preview', // Same as telegram bot
    GENERATION_CONFIG: {
        temperature: 0,      // Deterministic output - no randomness
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096
    },
    MAX_RETRIES: 2,           // Retry up to 2 times if first attempt fails
    RETRY_DELAY_MS: 1000      // Wait 1 second between retries
};

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// Uses CHINESE_TO_VIETNAMESE dictionary from table-renderer.js
// =====================================================

/**
 * Translate Chinese text to Vietnamese
 * @param {string} text - Chinese text
 * @returns {string} Vietnamese text
 */
function translateToVietnamese(text) {
    if (!text) return text;

    // CHINESE_TO_VIETNAMESE is defined globally in table-renderer.js
    if (typeof CHINESE_TO_VIETNAMESE === 'undefined') {
        console.warn('[AI] CHINESE_TO_VIETNAMESE dictionary not found');
        return text;
    }

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE)
        .sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

// =====================================================
// INVOICE EXTRACTION PROMPT
// Copied from telegram-bot.js lines 801-986
// =====================================================

const INVOICE_EXTRACTION_PROMPT = `Bạn là chuyên gia kiểm kê hàng hóa thông thạo tiếng Trung chuyên ngành may mặc và tiếng Việt. Hãy phân tích ảnh hóa đơn này (có thể là HÓA ĐƠN IN hoặc HÓA ĐƠN VIẾT TAY) và trích xuất thông tin theo format JSON.

=== NGUYÊN TẮC QUAN TRỌNG ===

1. **DỊCH THUẬT TRIỆT ĐỂ**:
   - Chuyển TOÀN BỘ nội dung sang tiếng Việt
   - TUYỆT ĐỐI KHÔNG để sót ký tự tiếng Trung nào
   - Dịch cả tên sản phẩm, màu sắc, mô tả chi tiết
   - VD: "卡其色" → "Khaki" (KHÔNG giữ "卡其")
   - VD: "黑色" → "Đen" (KHÔNG giữ "黑色")
   - VD: "铆钉" → "Đinh tán" (KHÔNG giữ "铆钉")

2. **KIỂM TRA ĐỘ CHÍNH XÁC**:
   - Cộng tổng số lượng từng màu để đối chiếu với cột "Tổng cộng"
   - Nếu có sai lệch giữa các màu và tổng số → Đưa ra CẢNH BÁO trong notes
   - VD: "⚠️ CẢNH BÁO: Tổng màu (48) ≠ Tổng ghi (50) - Chênh lệch 2 món"

3. **THÔNG TIN NCC**:
   - CHỈ lấy STT được khoanh tròn
   - BỎ QUA tên, số điện thoại, địa chỉ NCC
   - Chỉ trả về ncc: "4" (số thuần túy)

=== TỪ ĐIỂN MỞ RỘNG TIẾNG TRUNG → TIẾNG VIỆT ===

**MÀU SẮC CƠ BẢN (颜色):**
黑/黑色 = Đen, 白/白色 = Trắng, 红/红色 = Đỏ, 蓝/蓝色 = Xanh dương, 绿/绿色 = Xanh lá
黄/黄色 = Vàng, 紫/紫色 = Tím, 粉/粉色/粉红色 = Hồng, 灰/灰色 = Xám, 棕/棕色 = Nâu
橙/橙色/桔色/橘色 = Cam

**MÀU ĐẶC BIỆT / HOT TREND:**
咖/咖色/咖啡色 = Nâu cà phê, 米/米色 = Kem, 米白/米白色 = Trắng kem
杏/杏色 = Hồng mơ (Hạnh nhân), 酱/酱色 = Nâu đậm, 酱红色 = Đỏ nâu
卡其/卡其色 = Khaki, 驼/驼色 = Nâu lạc đà
藏青/藏青色 = Xanh than, 酒红/酒红色 = Đỏ rượu vang
墨绿/墨绿色 = Xanh rêu, 军绿/军绿色 = Xanh quân đội
焦糖/焦糖色 = Caramel, 牛油果/牛油果色 = Xanh bơ (Avocado)
香槟/香槟色 = Champagne, 奶白 = Trắng sữa, 奶油 = Kem sữa
银/银色 = Bạc, 金/金色 = Vàng gold
玫红/玫瑰红 = Hồng cánh sen, 宝蓝 = Xanh hoàng gia
天蓝 = Xanh da trời, 湖蓝 = Xanh hồ, 雾蓝 = Xanh sương mù
烟灰 = Xám khói, 炭灰 = Xám than, 花灰 = Xám hoa
姜黄 = Vàng nghệ, 土黄 = Vàng đất, 芥末黄 = Vàng mù tạt
浅 = Nhạt, 深 = Đậm, 色 = (bỏ từ này)
浅灰/深灰 = Xám nhạt/đậm, 浅蓝/深蓝 = Xanh nhạt/đậm
浅绿/深绿 = Xanh lá nhạt/đậm, 浅粉/深粉 = Hồng nhạt/đậm
浅紫/深紫 = Tím nhạt/đậm, 浅咖/深咖 = Nâu nhạt/đậm

**VIẾT TẮT MÀU (PHỔNG BIẾN TRONG HÓA ĐƠN VIẾT TAY):**
兰 = Xanh dương (viết tắt của 蓝)

**LOẠI TRANG PHỤC (款式):**
上衣 = Áo, T恤/T恤衫 = Áo thun, 衬衫/衬衣 = Áo sơ mi
外套 = Áo khoác, 夹克 = Jacket, 风衣 = Măng tô, 大衣 = Áo khoác dài
卫衣 = Áo nỉ (Hoodie), 毛衣/针织衫 = Áo len
打底/打底衫 = Áo lót/Áo giữ nhiệt, 马甲 = Áo gile
背心 = Áo ba lỗ, 吊带/吊带衫 = Áo hai dây
西装/西服 = Vest, 开衫 = Cardigan, 羽绒服 = Áo phao
裤/裤子 = Quần, 短裤 = Quần short, 长裤 = Quần dài
牛仔裤 = Quần jean, 西裤 = Quần tây
阔腿裤 = Quần ống rộng, 打底裤 = Legging
裙/裙子 = Váy, 连衣裙 = Váy liền, 半身裙 = Chân váy
百褶裙 = Váy xếp ly, A字裙 = Váy chữ A

**BỘ ĐỒ (套装):**
套装 = Đồ bộ, 套/两件套 = Bộ 2 món, 三件套 = Bộ 3 món, 四件套 = Bộ 4 món
睡衣 = Đồ ngủ, 家居服 = Đồ mặc nhà, 运动套装 = Bộ thể thao

**CHI TIẾT THIẾT KẾ (细节):**
领 = Cổ, 圆领 = Cổ tròn, V领 = Cổ chữ V, 高领 = Cổ cao, 翻领 = Cổ lật
袖 = Tay áo, 长袖 = Tay dài, 短袖 = Tay ngắn, 无袖 = Không tay
短款 = Dáng ngắn (Croptop), 长款 = Dáng dài, 中长款 = Dáng trung
交叉 = Chéo, 斜角 = Xéo góc, 条纹 = Sọc, 格子 = Caro, 花 = Hoa
纽扣 = Khuy, 拉链 = Khoá kéo, 铆钉 = Đinh tán
印花 = In hoa, 刺绣/绣花 = Thêu, 蕾丝 = Ren, 网纱 = Lưới
山茶花 = Hoa sơn trà, 皇冠 = Vương miện, 荷叶边 = Viền lượn sóng

**CHẤT LIỆU (面料):**
棉/纯棉 = Cotton, 麻 = Lanh, 丝/真丝 = Lụa, 绒 = Nhung
毛/羊毛 = Len, 皮/皮革 = Da, 牛仔 = Vải jean, 雪纺 = Voan
蕾丝 = Ren, 针织 = Dệt kim, 弹力 = Co giãn

**SIZE/KÍCH THƯỚC:**
均码/均/F = Freesize (Size chung)
S码/M码/L码/XL码/XXL码 = Size S/M/L/XL/XXL
大码 = Size lớn (Plus size), 加大码 = Size cực lớn
件 = Cái, 手 = 1 ri (1 dây đủ size)

**TÌNH TRẠNG HÀNG:**
现货 = Có sẵn, 欠货 = Nợ hàng, 退货 = Trả hàng
拿货 = Lấy hàng, 补货 = Bổ sung hàng, 断货/缺货 = Hết hàng

===============================================
=== HƯỚNG DẪN ĐỌC HÓA ĐƠN VIẾT TAY ===
===============================================

**NHẬN DIỆN HÓA ĐƠN VIẾT TAY:**
Hóa đơn viết tay thường có đặc điểm:
- Chữ viết bằng tay, có thể mờ hoặc nguệch ngoạc
- Không có bảng kẻ chuẩn như hóa đơn in
- Format thường là: [MÃ] [MÀU] [SỐ LƯỢNG]x[ĐƠN GIÁ]=[THÀNH TIỀN]

**CÁCH ĐỌC TỪNG DÒNG VIẾT TAY:**

1. **Format phổ biến nhất:** [MÃ SP] [MÀU VIẾT TẮT] [SL]x[GIÁ]=[TỔNG]
   - VD: "5/01 去10 30x46=1380" → Mã: 5/01, Màu: 去10, SL: 30, Giá: 46, Tiền: 1380
   - VD: "283-6 去6啡 10x41=410" → Mã: 283-6, Màu: 6 màu nâu cà phê, SL: 10, Giá: 41
   - VD: "山茶花 去5颗 20x41=820" → Mã: Hoa sơn trà, Màu: 5 màu, SL: 20, Giá: 41
   - VD: "126 去10 10x65=650" → Mã: 126, Màu: 10 màu, SL: 10, Giá: 65
   - VD: "718-9 去6 15x74=1110" → Mã: 718-9, Màu: 6 màu, SL: 15, Giá: 74

2. **Cách hiểu "去X" (qù X):** Có nghĩa "lấy X màu" hoặc "X cái"
   - "去10" = Lấy 10 màu hoặc 10 cái
   - "去6啡" = Lấy 6 màu nâu cà phê (啡 = nâu)
   - "去白" = Lấy màu trắng
   - "去5颗" = Lấy 5 cái/5 màu

3. **SUY LUẬN TỪ PHÉP TÍNH:**
   - Khi chữ viết mờ/khó đọc, dùng phép tính để suy luận
   - VD: "?x46=1380" → ? = 1380/46 = 30 (số lượng là 30)
   - VD: "20x?=820" → ? = 820/20 = 41 (đơn giá là 41)
   - VD: "10x65=?" → ? = 10x65 = 650 (thành tiền là 650)

4. **KÝ HIỆU ĐẶC BIỆT TRONG VIẾT TAY:**
   - Dấu "✓" hoặc "V" = Đã kiểm tra/Đã bốc hàng
   - Dấu gạch chéo "—" = Bỏ qua/Số lượng bằng 0
   - Số trong vòng tròn = Mã NCC (quan trọng!)
   - Chữ viết tay "Nhi" = Tên người mua (thường là 何祥 - Hà Tường)

5. **CỘNG DỒN SỐ LƯỢNG:**
   - Nếu thấy nhiều số trên một dòng (VD: "5 5 5" dưới cột S-M-L)
   - Cộng tất cả: 5+5+5 = 15 là tổng số lượng

6. **XỬ LÝ CHỮ MỜ/GẠ̣CH BỎ:**
   - Khi số bị gạch bỏ và viết số mới → Lấy số MỚI
   - Khi không đọc được → Dùng phép tính suy luận ngược

===============================================
=== HƯỚNG DẪN ĐỌC HÓA ĐƠN IN ===
===============================================

**CẤU TRÚC HÓA ĐƠN IN ĐIỂN HÌNH:**

| 款号/商品 | 颜色 | 均码 | 数量 | 单价 | 小计 |
|----------|------|------|------|------|------|
| 835#/T恤衫 | 黑色 | 均码 | 10 | 64 | 640 |
| 835#/T恤衫 | 白色 | 均码 | 10 | 64 | 640 |
| 835#/T恤衫 | 灰色 | 均码 | 10 | 64 | 640 |
| 小计 |  |  | 30 |  | 1,920 |

**QUAN TRỌNG - NHÓM SẢN PHẨM THEO MÃ:**
- Các dòng có cùng款号 (mã sản phẩm) = 1 SẢN PHẨM DUY NHẤT
- Gộp các màu khác nhau vào mảng colors[]
- VD: 3 dòng "835#/T恤衫" với màu khác nhau = 1 object duy nhất với 3 màu

===============================================
=== TRÍCH XUẤT DỮ LIỆU (CHUNG CHO CẢ 2 LOẠI) ===
===============================================

**1. MÃ NCC (ncc) - QUAN TRỌNG NHẤT:**
   - Tìm SỐ được KHOANH TRÒN bằng bút (thường màu đỏ, ở cuối hóa đơn)
   - Chỉ lấy STT số, BỎ QUA mọi thông tin khác về NCC
   - VD: Thấy số "7" khoanh tròn → ncc: "7"
   - VD: Thấy số "15" khoanh tròn → ncc: "15"
   - KHÔNG lấy tên shop, SĐT, địa chỉ

**2. TÊN NHÀ CUNG CẤP (supplier):**
   - Tên shop/cửa hàng IN ĐẬM ở đầu hóa đơn
   - VD: "菠酷服饰" → supplier: "菠酷服饰"
   - VD: "伊芙诺 (Eveno)" → supplier: "Eveno"

**3. NGÀY THÁNG (date):**
   - Tìm ngày in trên hóa đơn
   - Chuyển sang format DD/MM/YYYY
   - VD: "02年 12月26日" → "26/12/2002" (hoặc năm hiện tại)

**4. DANH SÁCH SẢN PHẨM (products):**

   **CẤU TRÚC NHÓM:**
   {
     "sku": "835",
     "name": "Áo thun",
     "colors": [
       {"color": "Đen", "quantity": 10},
       {"color": "Trắng", "quantity": 10},
       {"color": "Xám", "quantity": 10}
     ],
     "price": 64
   }

   **CÁCH XỬ LÝ:**
   a) **sku** (Mã hàng): Lấy từ cột đầu, bỏ ký tự # nếu có
      - HĐ in: "835#/T恤衫" → sku: "835"
      - HĐ viết tay: "5/01" → sku: "5/01"

   b) **name** (Tên SP): DỊCH HOÀN TOÀN sang tiếng Việt
      - "T恤衫" → "Áo thun"
      - "山茶花" → "Hoa sơn trà"
      - "两件套" → "Bộ 2 món"
      - Nếu không có tên → dùng "Sản phẩm [mã]"

   c) **colors** (Mảng màu sắc):
      - HĐ in: Mỗi dòng khác màu = 1 object
      - HĐ viết tay: "去6啡" = 6 màu nâu cà phê → colors: [{"color": "Nâu cà phê", "quantity": từ phép tính}]
      - Nếu chỉ có số màu mà không ghi cụ thể → colors: [{"color": "Nhiều màu", "quantity": X}]

   d) **price** (Đơn giá): Lấy từ phép tính [SL]x[GIÁ]=[TỔNG]

**5. TỔNG SỐ MÓN (totalItems):**
   - Cộng tất cả quantity của từng product
   - KIỂM TRA: Phải khớp với số ghi ở dòng tổng cộng

**6. TỔNG TIỀN (totalAmount):**
   - Tìm dòng "销售合计", "合计", "总计" hoặc số ghi cuối hóa đơn
   - HĐ viết tay: Tìm số lớn nhất ghi ở cuối (VD: 8645)
   - Nếu không có → Tính = SUM(quantity * price)

**7. KIỂM TRA VÀ CẢNH BÁO:**
   - Dùng phép tính để verify: SL x Giá phải = Thành tiền
   - Nếu CHÊNH LỆCH → Thêm cảnh báo vào notes

=== FORMAT JSON OUTPUT ===

Trả về JSON CHÍNH XÁC (không markdown, không dấu \`\`\`):

{
  "success": true,
  "ncc": "7",
  "supplier": "菠酷服饰",
  "date": "26/12/2025",
  "products": [
    {
      "sku": "5/01",
      "name": "Sản phẩm 5/01",
      "colors": [
        {"color": "10 màu", "quantity": 30}
      ],
      "price": 46
    },
    {
      "sku": "山茶花",
      "name": "Hoa sơn trà",
      "colors": [
        {"color": "5 màu", "quantity": 20}
      ],
      "price": 41
    }
  ],
  "totalItems": 155,
  "totalAmount": 8645,
  "notes": "Hóa đơn viết tay. Đã verify bằng phép tính. NCC khoanh số 7."
}

=== CHECKLIST TRƯỚC KHI TRẢ VỀ ===

- [ ] Mã NCC: Đã lấy đúng số khoanh tròn (thường ở cuối HĐ)
- [ ] Loại hóa đơn: Đã nhận diện đúng (in hay viết tay)
- [ ] Tên sản phẩm: Đã dịch HOÀN TOÀN sang tiếng Việt
- [ ] Màu sắc: Đã dịch hoặc ghi nhận số màu
- [ ] Số lượng: Đã tính từ phép tính [SL]x[GIÁ]=[TỔNG]
- [ ] Đơn giá: Đã trích xuất từ phép tính
- [ ] Tổng tiền: Đã tìm hoặc tính tổng
- [ ] Verify: Đã kiểm tra phép tính có khớp không
- [ ] Không bỏ sót: Đã đọc hết tất cả dòng sản phẩm

=== NẾU KHÔNG XỬ LÝ ĐƯỢC ===

{
  "success": false,
  "error": "Lý do cụ thể: Ảnh mờ không đọc được/Không phải hóa đơn/Thiếu thông tin quan trọng/Không tìm thấy mã NCC khoanh tròn"
}`;

// =====================================================
// CORE FUNCTIONS
// =====================================================

/**
 * Convert File object to base64 string
 * @param {File} file - Image file
 * @returns {Promise<string>} Base64 string (without data:image prefix)
 */
async function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            // Remove data:image/jpeg;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };

        reader.onerror = (error) => reject(error);

        reader.readAsDataURL(file);
    });
}

/**
 * Sleep helper for retry delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Gemini Vision API via backend proxy with retry logic
 * @param {string} base64Image - Base64 encoded image
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg')
 * @returns {Promise<Object>} AI response object
 */
async function callGeminiVisionAPI(base64Image, mimeType) {
    let lastError = null;

    for (let attempt = 1; attempt <= AI_CONFIG.MAX_RETRIES + 1; attempt++) {
        try {
            console.log(`[AI] Calling Gemini API... (attempt ${attempt}/${AI_CONFIG.MAX_RETRIES + 1})`);

            const response = await fetch(AI_CONFIG.GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: AI_CONFIG.MODEL,
                    contents: [{
                        parts: [
                            { text: INVOICE_EXTRACTION_PROMPT },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64Image
                                }
                            }
                        ]
                    }],
                    generationConfig: AI_CONFIG.GENERATION_CONFIG
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'Gemini API error');
            }

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) {
                throw new Error('Empty response from Gemini');
            }

            console.log('[AI] Received response from Gemini');

            // Clean markdown code blocks if present
            let cleanJson = responseText.trim();
            if (cleanJson.startsWith('```')) {
                cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '');
            }

            // Parse JSON
            const result = JSON.parse(cleanJson);

            // Check if AI returned success: false - retry if so
            if (result.success === false && attempt <= AI_CONFIG.MAX_RETRIES) {
                console.warn(`[AI] AI returned failure, retrying... (${result.error || 'Unknown error'})`);
                lastError = new Error(result.error || 'AI không nhận diện được hóa đơn');
                await sleep(AI_CONFIG.RETRY_DELAY_MS);
                continue;
            }

            return result;

        } catch (error) {
            lastError = error;
            console.error(`[AI] Attempt ${attempt} failed:`, error.message);

            if (attempt <= AI_CONFIG.MAX_RETRIES) {
                console.log(`[AI] Retrying in ${AI_CONFIG.RETRY_DELAY_MS}ms...`);
                await sleep(AI_CONFIG.RETRY_DELAY_MS);
            }
        }
    }

    // All retries exhausted
    console.error('[AI] All retry attempts failed');
    return {
        success: false,
        error: `Không thể nhận diện hóa đơn sau ${AI_CONFIG.MAX_RETRIES + 1} lần thử: ${lastError?.message || 'Unknown error'}`,
        rawResponse: null
    };
}

/**
 * Extract invoice data from AI response and convert to structured format
 * @param {Object} aiResponse - Response from Gemini API (NEW FORMAT with grouped products)
 * @returns {Object} Invoice data with structured productsData array
 */
function extractInvoiceData(aiResponse) {
    if (!aiResponse.success) {
        throw new Error(aiResponse.error || 'AI không thể xử lý ảnh');
    }

    // NEW: Process grouped products with color details
    const productsData = (aiResponse.products || []).map(product => {
        const colors = product.colors || [];
        const tongSoLuong = colors.reduce((sum, c) => sum + (c.quantity || 0), 0);

        return {
            maSP: product.sku || '?',
            moTa: product.name || '',           // NEW: Product description
            mauSac: colors.map(c => ({          // NEW: Color breakdown
                mau: c.color || '',
                soLuong: c.quantity || 0
            })),
            tongSoLuong: tongSoLuong,           // NEW: Computed total
            soMau: colors.length,                // Computed from array
            giaDonVi: product.price || 0,
            thanhTien: tongSoLuong * (product.price || 0),

            // Legacy/metadata
            rawText: buildRawText(product),     // Generate for display
            aiExtracted: true,
            dataSource: 'ai'
        };
    });

    return {
        sttNCC: parseInt(aiResponse.ncc, 10) || null,
        tenNCC: aiResponse.supplier || '',
        productsData: productsData,             // NEW: Rich structured data
        totalAmount: aiResponse.totalAmount || 0,
        totalItems: aiResponse.totalItems || 0,
        notes: aiResponse.notes || '',
        date: aiResponse.date || ''
    };
}

/**
 * Build rawText for display purposes from structured product data
 * @param {Object} product - AI product object with colors array
 * @returns {string} Raw text representation
 */
function buildRawText(product) {
    const sku = product.sku || '?';
    const name = product.name || '';
    const colorCount = (product.colors || []).length;
    const totalQty = (product.colors || []).reduce((sum, c) => sum + (c.quantity || 0), 0);
    const price = product.price || 0;

    // Format: "MA 835 Áo thun 5 MÀU 50X64"
    return `MA ${sku}${name ? ' ' + name : ''} ${colorCount} MÀU ${totalQty}X${price}`;
}

/**
 * Process invoice image - Main entry point
 * @param {File} imageFile - Image file to process
 * @returns {Promise<Object>} Processed invoice data
 */
async function processInvoiceImage(imageFile) {
    console.log('[AI] Processing invoice image:', imageFile.name);

    try {
        // Step 1: Convert to base64
        const base64 = await convertFileToBase64(imageFile);
        const mimeType = imageFile.type;

        console.log('[AI] Image converted to base64');

        // Step 2: Call Gemini API
        const aiResponse = await callGeminiVisionAPI(base64, mimeType);

        console.log('[AI] AI response:', aiResponse);

        // Step 3: Extract and format data
        const invoiceData = extractInvoiceData(aiResponse);

        console.log('[AI] Invoice data extracted:', invoiceData);

        return {
            success: true,
            data: invoiceData,
            rawAI: aiResponse
        };

    } catch (error) {
        console.error('[AI] Processing error:', error);

        return {
            success: false,
            error: error.message,
            file: imageFile
        };
    }
}

console.log('[AI] Functions exported: processInvoiceImage, translateToVietnamese');
