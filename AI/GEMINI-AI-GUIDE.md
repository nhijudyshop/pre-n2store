# 🤖 Google Gemini AI - Hướng Dẫn Sử Dụng

> Tất cả chức năng có thể dùng với 10 API keys hiện có.
> Cập nhật: 12/2025

---

## 🔑 API Keys

> ⚠️ Keys được lưu trong **GitHub Secrets** (Settings → Secrets → Actions)
>
> - `GEMINI_KEYS` - 10 Google Gemini keys
> - `HF_KEYS` - 3 HuggingFace keys

---

## 🔄 Key Rotation - Xoay Vòng Keys Tự Động

### Cách 1: Load từ GitHub Secrets (GEMINI_KEYS, HF_KEYS)

```javascript
// ============================================
// KEYS CONFIGURATION (từ GitHub Secrets)
// ============================================
// Keys được inject từ GitHub Secrets (xem GITHUB-SECRETS-GUIDE.md)
const GEMINI_KEYS = (window.GEMINI_KEYS || process.env.GEMINI_KEYS || "").split(",").filter(k => k);
const HF_KEYS = (window.HF_KEYS || process.env.HF_KEYS || "").split(",").filter(k => k);

// ============================================
// KEY ROTATION STATE
// ============================================
let currentGeminiIndex = 0;
let currentHFIndex = 0;
let failedGeminiKeys = new Set();
let failedHFKeys = new Set();

// ============================================
// GET NEXT GEMINI KEY (xoay vòng + skip failed)
// ============================================
function getNextGeminiKey() {
    const maxAttempts = GEMINI_KEYS.length * 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const key = GEMINI_KEYS[currentGeminiIndex];
        currentGeminiIndex = (currentGeminiIndex + 1) % GEMINI_KEYS.length;

        // Skip key đang bị rate limit
        if (!failedGeminiKeys.has(key)) {
            console.log(`🔑 Using Gemini key ${currentGeminiIndex}/${GEMINI_KEYS.length}`);
            return key;
        }
        attempts++;
    }

    // Reset failed keys và thử lại
    failedGeminiKeys.clear();
    return GEMINI_KEYS[0];
}

// ============================================
// GET NEXT HF KEY (xoay vòng + skip failed)
// ============================================
function getNextHFKey() {
    const maxAttempts = HF_KEYS.length * 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const key = HF_KEYS[currentHFIndex];
        currentHFIndex = (currentHFIndex + 1) % HF_KEYS.length;

        if (!failedHFKeys.has(key)) {
            console.log(`🤗 Using HF key ${currentHFIndex}/${HF_KEYS.length}`);
            return key;
        }
        attempts++;
    }

    failedHFKeys.clear();
    return HF_KEYS[0];
}

// ============================================
// MARK KEY AS FAILED (tạm thời 30 giây)
// ============================================
function markGeminiKeyFailed(key) {
    failedGeminiKeys.add(key);
    console.warn(`⚠️ Gemini key failed, will retry in 30s`);
    setTimeout(() => failedGeminiKeys.delete(key), 30000);
}

function markHFKeyFailed(key) {
    failedHFKeys.add(key);
    console.warn(`⚠️ HF key failed, will retry in 30s`);
    setTimeout(() => failedHFKeys.delete(key), 30000);
}
```

### Cách 2: Gọi API với Auto-Retry

```javascript
// ============================================
// CALL GEMINI API WITH AUTO-RETRY
// ============================================
async function callGeminiAPI(prompt, options = {}) {
    const { model = "gemini-2.5-flash", maxRetries = GEMINI_KEYS.length } = options;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextGeminiKey();
        
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                
                // 429 = Rate limit, 403 = Quota exceeded
                if (response.status === 429 || response.status === 403) {
                    markGeminiKeyFailed(apiKey);
                    console.log(`🔄 Switching to next key (attempt ${attempt + 1}/${maxRetries})`);
                    continue;
                }
                
                // 503 = Server overloaded
                if (response.status === 503) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                
                throw new Error(`API Error ${response.status}: ${error}`);
            }

            const result = await response.json();
            console.log(`✅ Success with key attempt ${attempt + 1}`);
            return result.candidates?.[0]?.content?.parts?.[0]?.text;
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
            if (attempt === maxRetries - 1) throw error;
        }
    }
}

// ============================================
// SỬ DỤNG
// ============================================
// Gọi đơn giản - tự động xoay key khi cần
const result = await callGeminiAPI("Viết bài giới thiệu sản phẩm");
console.log(result);
```

### Cách 3: Gọi HuggingFace với Auto-Retry

```javascript
async function callHuggingFaceAPI(prompt, options = {}) {
    const { model = "meta-llama/Llama-3.3-70B-Instruct", maxRetries = HF_KEYS.length } = options;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextHFKey();
        
        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/models/${model}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: { max_new_tokens: 500 }
                    })
                }
            );

            if (!response.ok) {
                if (response.status === 429 || response.status === 503) {
                    markHFKeyFailed(apiKey);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw new Error(`HF Error ${response.status}`);
            }

            const result = await response.json();
            return result[0]?.generated_text || result;
            
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
        }
    }
}
```

---

## 📋 Tất Cả Chức Năng Gemini API

### 1️⃣ Text Generation (Tạo văn bản)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Viết bài giới thiệu sản phẩm" }] }]
    })
  }
);
```

---

### 2️⃣ Vision - Phân Tích Hình Ảnh

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
          { text: "Mô tả hình ảnh này" }
        ]
      }]
    })
  }
);
```

**Hỗ trợ:** JPG, PNG, WEBP, GIF, PDF

---

### 3️⃣ Audio - Xử Lý Âm Thanh

```javascript
// Transcribe audio
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "audio/mp3", data: base64Audio } },
          { text: "Chuyển audio này thành text tiếng Việt" }
        ]
      }]
    })
  }
);
```

**Chức năng:** Transcription, Translation, Speaker Detection, Emotion Detection

---

### 4️⃣ Video Analysis - Phân Tích Video

```javascript
// Phân tích YouTube video
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: "Tóm tắt video này" },
        { file_data: { file_uri: "https://youtube.com/watch?v=xxxxx" } }
      ]
    }]
  })
});
```

---

### 5️⃣ Code Execution - Chạy Code Python

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Tính 15! (giai thừa)" }] }],
    tools: [{ code_execution: {} }]
  })
});
```

**Thư viện có sẵn:** NumPy, Pandas, Matplotlib

---

### 6️⃣ Function Calling - Gọi Hàm

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Thời tiết Hà Nội hôm nay" }] }],
    tools: [{
      function_declarations: [{
        name: "get_weather",
        description: "Lấy thông tin thời tiết",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string", description: "Tên thành phố" }
          },
          required: ["location"]
        }
      }]
    }]
  })
});
```

---

### 7️⃣ Grounding - Tìm Kiếm Google

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Tin tức mới nhất về AI" }] }],
    tools: [{ google_search: {} }]
  })
});
```

**Kết quả:** Thông tin real-time từ Google Search với citations

---

### 8️⃣ Structured Output - JSON Response

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Phân tích sản phẩm này" }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          category: { type: "string" }
        }
      }
    }
  })
});
```

---

## 🚀 Models Khuyên Dùng

| Model | Use Case | Free Tier |
|-------|----------|-----------|
| `gemini-2.5-flash` | ⚡ Đa năng, nhanh | 15 RPM |
| `gemini-2.5-pro` | 🏆 Complex reasoning | 2 RPM |
| `gemini-2.5-flash-lite` | 🚀 Siêu nhanh, rẻ | 15 RPM |

---

## 📊 So Sánh Chức Năng

| Chức năng | 2.5 Flash | 2.5 Pro | 2.0 Flash |
|-----------|:---------:|:-------:|:---------:|
| Text Generation | ✅ | ✅ | ✅ |
| Vision (Image) | ✅ | ✅ | ✅ |
| Audio | ✅ | ✅ | ✅ |
| Video | ✅ | ✅ | ✅ |
| Code Execution | ✅ | ✅ | ✅ |
| Function Calling | ✅ | ✅ | ✅ |
| Grounding (Search) | ✅ | ✅ | ✅ |
| Thinking Mode | ✅ | ✅ | ❌ |
| 1M Token Context | ✅ | ✅ | ✅ |

---

## 💡 Tips

1. **Rate Limit:** Mỗi key có giới hạn riêng, dùng rotation để tăng throughput
2. **Fallback:** Nếu một model fail, tự động chuyển sang model khác
3. **Caching:** Cache response để tiết kiệm quota
4. **Batch:** Gộp nhiều request thành 1 để tối ưu

---

## 🔗 Tài Liệu Chính Thức

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API Docs](https://ai.google.dev/docs)
- [API Reference](https://ai.google.dev/api)
