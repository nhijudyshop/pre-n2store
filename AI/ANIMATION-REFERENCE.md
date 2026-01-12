# Animation & Effects Libraries Reference

Tổng hợp các thư viện animation và hiệu ứng CSS để sử dụng trong dự án.

---

## 1. Anime.js

**Website:** https://animejs.com/documentation/

**CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
```

### Cú pháp cơ bản:
```javascript
anime({
    targets: '.box',           // CSS selector hoặc element
    translateX: 250,           // Transform X
    translateY: [0, 100],      // From 0 to 100
    opacity: [0, 1],           // Fade in
    scale: [0.8, 1],           // Scale up
    rotate: '1turn',           // Xoay 360 độ
    duration: 800,             // Thời gian (ms)
    delay: 200,                // Delay trước khi bắt đầu
    easing: 'easeOutQuad',     // Kiểu easing
    loop: true,                // Lặp vô hạn
    direction: 'alternate',    // Đảo chiều khi lặp
    complete: () => {}         // Callback khi hoàn thành
});
```

### Stagger (Hiệu ứng lần lượt):
```javascript
anime({
    targets: '.item',
    opacity: [0, 1],
    translateY: [20, 0],
    delay: anime.stagger(100),           // Mỗi item delay thêm 100ms
    delay: anime.stagger(100, {start: 500}), // Bắt đầu sau 500ms
});
```

### Easing phổ biến:
| Easing | Mô tả |
|--------|-------|
| `linear` | Đều |
| `easeInQuad` | Chậm → Nhanh |
| `easeOutQuad` | Nhanh → Chậm |
| `easeInOutQuad` | Chậm → Nhanh → Chậm |
| `easeOutCubic` | Mượt hơn easeOutQuad |
| `easeOutBack` | Vượt qua rồi quay lại (bounce nhẹ) |
| `easeInOutSine` | Mượt như sin wave |
| `spring(mass, stiffness, damping, velocity)` | Hiệu ứng lò xo |

---

## 2. Animate.css

**Website:** https://animate.style/

**CDN:**
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
```

### Cách dùng:
```html
<!-- Thêm class vào element -->
<div class="animate__animated animate__fadeIn">Nội dung</div>
```

### Các hiệu ứng phổ biến:

#### Attention Seekers (Thu hút chú ý)
| Class | Mô tả |
|-------|-------|
| `animate__bounce` | Nảy lên |
| `animate__flash` | Nhấp nháy |
| `animate__pulse` | Phình ra thu vào |
| `animate__shake` | Rung lắc |
| `animate__tada` | Nảy + xoay nhẹ |
| `animate__wobble` | Lắc lư |
| `animate__heartBeat` | Nhịp tim |

#### Entrances (Xuất hiện)
| Class | Mô tả |
|-------|-------|
| `animate__fadeIn` | Hiện dần |
| `animate__fadeInUp` | Hiện từ dưới lên |
| `animate__fadeInDown` | Hiện từ trên xuống |
| `animate__fadeInLeft` | Hiện từ trái |
| `animate__fadeInRight` | Hiện từ phải |
| `animate__bounceIn` | Nảy vào |
| `animate__zoomIn` | Zoom vào |
| `animate__slideInUp` | Trượt lên |
| `animate__slideInDown` | Trượt xuống |

#### Exits (Biến mất)
| Class | Mô tả |
|-------|-------|
| `animate__fadeOut` | Ẩn dần |
| `animate__fadeOutUp` | Ẩn bay lên |
| `animate__fadeOutDown` | Ẩn bay xuống |
| `animate__fadeOutLeft` | Ẩn bay trái |
| `animate__fadeOutRight` | Ẩn bay phải |
| `animate__bounceOut` | Nảy ra |
| `animate__zoomOut` | Zoom ra |

### Utility Classes:

#### Tốc độ:
```html
<div class="animate__animated animate__fadeIn animate__faster">Nhanh hơn</div>
```
| Class | Thời gian |
|-------|-----------|
| `animate__slower` | 3s |
| `animate__slow` | 2s |
| (mặc định) | 1s |
| `animate__fast` | 0.8s |
| `animate__faster` | 0.5s |

#### Delay:
```html
<div class="animate__animated animate__fadeIn animate__delay-2s">Delay 2s</div>
```
| Class | Delay |
|-------|-------|
| `animate__delay-1s` | 1s |
| `animate__delay-2s` | 2s |
| `animate__delay-3s` | 3s |
| `animate__delay-4s` | 4s |
| `animate__delay-5s` | 5s |

#### Lặp lại:
```html
<div class="animate__animated animate__pulse animate__infinite">Lặp mãi</div>
```
| Class | Lần lặp |
|-------|---------|
| `animate__repeat-1` | 1 lần |
| `animate__repeat-2` | 2 lần |
| `animate__repeat-3` | 3 lần |
| `animate__infinite` | Vô hạn |

### JavaScript Integration:
```javascript
// Thêm animation động
element.classList.add('animate__animated', 'animate__fadeIn');

// Lắng nghe khi animation kết thúc
element.addEventListener('animationend', () => {
    element.classList.remove('animate__animated', 'animate__fadeIn');
});

// Helper function
function animateCSS(element, animation, prefix = 'animate__') {
    return new Promise((resolve) => {
        const animationName = `${prefix}${animation}`;
        element.classList.add(`${prefix}animated`, animationName);
        
        element.addEventListener('animationend', () => {
            element.classList.remove(`${prefix}animated`, animationName);
            resolve();
        }, { once: true });
    });
}

// Sử dụng
await animateCSS(element, 'fadeIn');
```

---

## 3. Motion (Framer Motion)

**Website:** https://motion.dev/docs

**CDN (cho Vanilla JS):**
```html
<!-- ES Module -->
<script type="module">
    import { animate, scroll } from "https://cdn.jsdelivr.net/npm/motion@latest/+esm";
</script>

<!-- Legacy -->
<script src="https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.js"></script>
<script>
    const { animate, scroll } = Motion;
</script>
```

### Cú pháp cơ bản:
```javascript
import { animate, stagger } from "motion";

// Animation đơn giản
animate(".box", { rotate: 360 });

// Với options
animate(
    ".box",
    { x: 100, opacity: 1 },
    { duration: 0.5, ease: "easeOut" }
);

// Spring physics
animate(
    element,
    { rotate: 90 },
    { type: "spring", stiffness: 300 }
);

// Stagger
animate(
    "li",
    { y: 0, opacity: 1 },
    { delay: stagger(0.1) }
);
```

### Scroll Animation:
```javascript
import { scroll } from "motion";

scroll(animate(".box", { 
    opacity: [0, 1], 
    scale: [0.5, 1] 
}));
```

---

## 4. CSS Keyframes (Tự viết)

### Spinner Loading:
```css
@keyframes spin {
    to { transform: rotate(360deg); }
}

.spinner {
    width: 20px;
    height: 20px;
    border: 3px solid #ccc;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}
```

### Pulse Effect:
```css
@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
}

.pulse {
    animation: pulse 2s ease-in-out infinite;
}
```

### Typing dots:
```css
.typing-dots {
    display: flex;
    gap: 4px;
}

.typing-dot {
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border-radius: 50%;
    animation: pulse 1.4s ease-in-out infinite;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
```

### Slide In:
```css
@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.slide-in {
    animation: slideInUp 0.4s ease-out;
}
```

---

## Quick Setup Template

Copy đoạn này vào `<head>` để dùng ngay:

```html
<!-- Animation Libraries -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
<script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>
```

---

## Ghi chú sử dụng

1. **Animate.css** - Dùng cho hiệu ứng đơn giản, chỉ cần thêm class
2. **Anime.js** - Dùng khi cần kiểm soát chi tiết, timeline, stagger phức tạp
3. **Motion** - Dùng khi cần scroll animation hoặc spring physics nâng cao
4. **CSS Keyframes** - Dùng cho loading, spinner, hiệu ứng lặp đơn giản

---

*Cập nhật: 26/12/2024*
