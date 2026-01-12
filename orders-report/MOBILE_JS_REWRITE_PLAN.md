# 📋 DETAILED PLAN - Mobile JavaScript Rewrite

## 🎯 Mục tiêu

Viết lại mobile JavaScript để:
- ✅ Hoạt động AFTER statistics được render
- ✅ Không phá vỡ existing structure
- ✅ Đầy đủ tính năng web-app hiện đại
- ✅ Stable trên cả desktop và mobile

---

## 🔍 Phân tích Current Flow

### **Rendering Timeline (hiện tại):**
```
1. DOMContentLoaded
   ↓
2. initializeFirebase() - async
   ↓
3. loadCachedData()
   ↓
4. renderStatistics()
   ├─ renderProductStatsTable()
   ├─ renderTagStatsTable()
   └─ renderEmployeeStats()
   ↓
5. (500ms later) requestDataFromTab1()
   ↓
6. Receive Tab1 data
   ↓
7. renderStatistics() again (with new data)
```

### **Vấn đề OLD approach:**
```javascript
// OLD - WRONG ❌
DOMContentLoaded → Mobile JS runs immediately
  → Modifies sections BEFORE renderStatistics()
  → Structure changed → Render fails → Empty sections!
```

### **NEW approach:**
```javascript
// NEW - CORRECT ✅
renderStatistics() completes
  → Dispatch custom event 'statisticsRendered'
  → Mobile JS listens for event
  → Apply mobile transformations AFTER data is rendered
```

---

## 🏗️ Architecture Design

### **1. Event-Based System**

Add custom events to trigger mobile transformations:

```javascript
// In tab-overview.html - AFTER renderStatistics()
function renderStatistics() {
    // ... existing code ...

    // NEW: Dispatch event when done
    window.dispatchEvent(new CustomEvent('statisticsRendered', {
        detail: {
            timestamp: Date.now(),
            hasData: orders.length > 0
        }
    }));
}
```

### **2. Mobile JavaScript Structure**

```javascript
// In tab-overview-mobile-v2.js

(function() {
    'use strict';

    const isMobile = () => window.innerWidth <= 768;

    // ===== PHASE 1: Listen for statistics render =====
    window.addEventListener('statisticsRendered', (event) => {
        if (!isMobile()) return;

        console.log('[MOBILE] Statistics rendered, applying mobile UI...');
        applyMobileTransformations();
    });

    // ===== PHASE 2: Apply transformations =====
    function applyMobileTransformations() {
        // Step 1: Make product section collapsible (collapsed by default)
        makeProductSectionCollapsible();

        // Step 2: Make tag section collapsible (expanded by default)
        makeTagSectionCollapsible();

        // Step 3: Convert employee cards to mobile-friendly
        transformEmployeeCards();

        // Step 4: Add mobile interactions
        addMobileInteractions();
    }

    // ===== PHASE 3: Non-destructive transformations =====
    function makeProductSectionCollapsible() {
        // Find section
        const section = document.getElementById('productStatsSection');
        if (!section || section.dataset.mobileProcessed) return;

        // Mark as processed to avoid double-processing
        section.dataset.mobileProcessed = 'true';

        // Add collapsible wrapper WITHOUT destroying content
        wrapSectionAsCollapsible(section, {
            title: 'Thống Kê Sản Phẩm',
            icon: 'fa-box',
            collapsed: true
        });
    }

    // ===== PHASE 4: Wrapper function (non-destructive) =====
    function wrapSectionAsCollapsible(section, options) {
        // Create wrapper AROUND section, not replace it
        const wrapper = document.createElement('div');
        wrapper.className = 'mobile-collapsible-wrapper';

        // Create header
        const header = createCollapsibleHeader(options);

        // Insert wrapper before section
        section.parentNode.insertBefore(wrapper, section);

        // Move section into wrapper
        wrapper.appendChild(header);
        wrapper.appendChild(section);

        // Add collapsed class to section if needed
        if (options.collapsed) {
            section.classList.add('mobile-collapsed');
        }

        // Add click handler
        header.addEventListener('click', () => {
            section.classList.toggle('mobile-collapsed');
            wrapper.classList.toggle('expanded');
        });
    }
})();
```

---

## 📐 Implementation Steps

### **STEP 1: Update tab-overview.html**

Thêm event dispatch vào các render functions:

```javascript
// Location: After line 1853
function renderStatistics() {
    // ... existing code ...

    renderEmployeeStats(employeeStats);

    // NEW: Dispatch event
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('statisticsRendered', {
            detail: {
                timestamp: Date.now(),
                hasData: orders.length > 0,
                counts: {
                    products: productStats.length,
                    tags: tagStats.length,
                    employees: employeeStats.length
                }
            }
        }));
    }, 100); // Small delay to ensure DOM updates complete
}

// Also dispatch from other render triggers
function renderProductStatsTable(stats) {
    // ... existing code ...
    window.dispatchEvent(new CustomEvent('productStatsRendered'));
}

function renderEmployeeStats(stats) {
    // ... existing code ...
    window.dispatchEvent(new CustomEvent('employeeStatsRendered'));
}
```

### **STEP 2: Create new mobile JS file**

File: `tab-overview-mobile-v2.js`

**2.1. Core Structure**
```javascript
(function() {
    'use strict';

    // Mobile detection
    const isMobile = () => window.innerWidth <= 768;

    // State tracking
    let mobileInitialized = false;
    let statisticsRendered = false;

    // Configuration
    const CONFIG = {
        productSectionCollapsed: true,
        tagSectionCollapsed: false,
        employeeCardsCollapsible: true,
        enableHapticFeedback: true,
        animationDuration: 300
    };
})();
```

**2.2. Event Listeners**
```javascript
// Listen for statistics render
window.addEventListener('statisticsRendered', handleStatisticsRendered);

// Listen for window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 250);
});

function handleStatisticsRendered(event) {
    if (!isMobile()) {
        console.log('[MOBILE] Not on mobile, skipping');
        return;
    }

    console.log('[MOBILE] Statistics rendered event received:', event.detail);
    statisticsRendered = true;

    // Apply mobile transformations
    applyMobileUI();
}

function handleResize() {
    const nowMobile = isMobile();
    const wasMobile = document.body.classList.contains('mobile-mode');

    if (nowMobile !== wasMobile) {
        console.log('[MOBILE] Screen size changed:', wasMobile ? 'desktop→mobile' : 'mobile→desktop');

        if (nowMobile && statisticsRendered) {
            document.body.classList.add('mobile-mode');
            applyMobileUI();
        } else {
            document.body.classList.remove('mobile-mode');
            removeMobileUI();
        }
    }
}
```

**2.3. Main Transformation Function**
```javascript
function applyMobileUI() {
    if (mobileInitialized) {
        console.log('[MOBILE] Already initialized, skipping');
        return;
    }

    console.log('[MOBILE] 🎨 Applying mobile UI transformations...');

    // Mark body as mobile
    document.body.classList.add('mobile-mode');

    // Apply transformations in sequence
    try {
        // 1. Product statistics (collapsed)
        makeProductSectionCollapsible();

        // 2. Tag statistics (expanded)
        makeTagSectionCollapsible();

        // 3. Employee cards (collapsible)
        transformEmployeeCards();

        // 4. Add pull-to-refresh hint
        addPullToRefreshHint();

        // 5. Mobile interactions
        setupMobileInteractions();

        mobileInitialized = true;
        console.log('[MOBILE] ✅ Mobile UI applied successfully');

    } catch (error) {
        console.error('[MOBILE] ❌ Error applying mobile UI:', error);
    }
}
```

**2.4. Collapsible Section (Non-Destructive)**
```javascript
function makeProductSectionCollapsible() {
    const section = document.getElementById('productStatsSection');
    if (!section) {
        console.warn('[MOBILE] Product section not found');
        return;
    }

    // Check if already processed
    if (section.dataset.mobileCollapsible) {
        console.log('[MOBILE] Product section already collapsible');
        return;
    }

    wrapAsCollapsible(section, {
        id: 'product-stats',
        title: 'Thống Kê Sản Phẩm',
        icon: 'fa-box',
        iconGradient: 'orange',
        collapsed: CONFIG.productSectionCollapsed,
        getBadgeText: () => {
            const badge = section.querySelector('#productStatsBadge');
            return badge ? badge.textContent : '';
        }
    });

    section.dataset.mobileCollapsible = 'true';
}

function makeTagSectionCollapsible() {
    const section = document.getElementById('tagStatsSection');
    if (!section || section.dataset.mobileCollapsible) return;

    wrapAsCollapsible(section, {
        id: 'tag-stats',
        title: 'Thống Kê Theo Tag',
        icon: 'fa-tags',
        iconGradient: 'primary',
        collapsed: CONFIG.tagSectionCollapsed,
        preserveHeader: true // Keep the "Thêm tag" button
    });

    section.dataset.mobileCollapsible = 'true';
}

function wrapAsCollapsible(section, options) {
    const {
        id,
        title,
        icon,
        iconGradient = 'primary',
        collapsed = false,
        getBadgeText = null,
        preserveHeader = false
    } = options;

    // Create mobile wrapper
    const mobileWrapper = document.createElement('div');
    mobileWrapper.className = 'mobile-collapsible-section';
    mobileWrapper.id = `mobile-${id}`;
    if (collapsed) {
        mobileWrapper.classList.add('collapsed');
    } else {
        mobileWrapper.classList.add('expanded');
    }

    // Create header
    const header = document.createElement('div');
    header.className = 'mobile-collapsible-header';

    const badgeText = getBadgeText ? getBadgeText() : '';
    const badgeHtml = badgeText ? `<span class="mobile-badge">${badgeText}</span>` : '';

    header.innerHTML = `
        <div class="mobile-header-content">
            <i class="fas ${icon} mobile-icon gradient-${iconGradient}"></i>
            <span class="mobile-title">${title}</span>
            ${badgeHtml}
        </div>
        <div class="mobile-toggle-icon">
            <i class="fas fa-chevron-down"></i>
        </div>
    `;

    // Insert wrapper before section
    section.parentNode.insertBefore(mobileWrapper, section);

    // Move section into wrapper
    mobileWrapper.appendChild(header);
    mobileWrapper.appendChild(section);

    // Add collapsed class to section
    if (collapsed) {
        section.style.maxHeight = '0';
        section.style.overflow = 'hidden';
        section.style.transition = `max-height ${CONFIG.animationDuration}ms ease`;
    }

    // Add click handler
    header.addEventListener('click', () => {
        toggleCollapsible(mobileWrapper, section);
    });

    console.log(`[MOBILE] ✅ Made "${title}" collapsible (${collapsed ? 'collapsed' : 'expanded'})`);
}

function toggleCollapsible(wrapper, section) {
    const isCollapsed = wrapper.classList.contains('collapsed');

    if (isCollapsed) {
        // Expand
        wrapper.classList.remove('collapsed');
        wrapper.classList.add('expanded');
        section.style.maxHeight = section.scrollHeight + 'px';

        // After animation, remove max-height to allow dynamic content
        setTimeout(() => {
            if (wrapper.classList.contains('expanded')) {
                section.style.maxHeight = 'none';
            }
        }, CONFIG.animationDuration);

    } else {
        // Collapse
        section.style.maxHeight = section.scrollHeight + 'px';
        // Force reflow
        section.offsetHeight;
        section.style.maxHeight = '0';

        wrapper.classList.remove('expanded');
        wrapper.classList.add('collapsed');
    }

    // Haptic feedback
    if (CONFIG.enableHapticFeedback && navigator.vibrate) {
        navigator.vibrate(10);
    }
}
```

**2.5. Employee Cards Transformation**
```javascript
function transformEmployeeCards() {
    const employeeCards = document.querySelectorAll('.employee-card');

    if (employeeCards.length === 0) {
        console.log('[MOBILE] No employee cards found');
        return;
    }

    employeeCards.forEach((card, index) => {
        // Check if already processed
        if (card.dataset.mobileProcessed) return;

        const header = card.querySelector('.employee-card-header');
        const statsGrid = card.querySelector('.employee-stats-grid');

        if (!header || !statsGrid) return;

        // Make header clickable
        header.style.cursor = 'pointer';
        header.classList.add('mobile-clickable');

        // Add toggle icon
        const toggleIcon = document.createElement('i');
        toggleIcon.className = 'fas fa-chevron-down mobile-employee-toggle';
        header.appendChild(toggleIcon);

        // Collapse all except first
        if (index > 0 && CONFIG.employeeCardsCollapsible) {
            card.classList.add('mobile-collapsed');
            statsGrid.style.maxHeight = '0';
            statsGrid.style.overflow = 'hidden';
            statsGrid.style.transition = `max-height ${CONFIG.animationDuration}ms ease`;
        } else {
            card.classList.add('mobile-expanded');
        }

        // Add click handler
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on buttons
            if (e.target.closest('.btn-view-detail')) return;

            toggleEmployeeCard(card, statsGrid);
        });

        card.dataset.mobileProcessed = 'true';
    });

    console.log(`[MOBILE] ✅ Transformed ${employeeCards.length} employee cards`);
}

function toggleEmployeeCard(card, statsGrid) {
    const isCollapsed = card.classList.contains('mobile-collapsed');

    if (isCollapsed) {
        // Expand
        card.classList.remove('mobile-collapsed');
        card.classList.add('mobile-expanded');
        statsGrid.style.maxHeight = statsGrid.scrollHeight + 'px';

        setTimeout(() => {
            if (card.classList.contains('mobile-expanded')) {
                statsGrid.style.maxHeight = 'none';
            }
        }, CONFIG.animationDuration);

    } else {
        // Collapse
        statsGrid.style.maxHeight = statsGrid.scrollHeight + 'px';
        statsGrid.offsetHeight; // Force reflow
        statsGrid.style.maxHeight = '0';

        card.classList.remove('mobile-expanded');
        card.classList.add('mobile-collapsed');
    }

    // Haptic feedback
    if (CONFIG.enableHapticFeedback && navigator.vibrate) {
        navigator.vibrate(10);
    }
}
```

**2.6. Pull-to-Refresh Hint**
```javascript
function addPullToRefreshHint() {
    // Check if already exists
    if (document.getElementById('mobile-pull-hint')) return;

    const hint = document.createElement('div');
    hint.id = 'mobile-pull-hint';
    hint.className = 'mobile-pull-hint hidden';
    hint.innerHTML = `
        <i class="fas fa-arrow-down mobile-pull-icon"></i>
        <span class="mobile-pull-text">Kéo xuống để tải lại</span>
    `;

    document.body.insertBefore(hint, document.body.firstChild);

    // Simple pull detection (can be enhanced)
    let startY = 0;
    let isPulling = false;

    window.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].pageY;
            isPulling = true;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isPulling) return;

        const currentY = e.touches[0].pageY;
        const diff = currentY - startY;

        if (diff > 50 && window.scrollY === 0) {
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        isPulling = false;
        hint.classList.add('hidden');
    }, { passive: true });

    console.log('[MOBILE] ✅ Pull-to-refresh hint added');
}
```

**2.7. Mobile Interactions**
```javascript
function setupMobileInteractions() {
    // Prevent double-tap zoom on buttons
    preventDoubleTapZoom();

    // Smooth scroll
    document.documentElement.style.scrollBehavior = 'smooth';

    // Active states for touch
    addTouchActiveStates();

    console.log('[MOBILE] ✅ Mobile interactions setup complete');
}

function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

function addTouchActiveStates() {
    const touchElements = document.querySelectorAll('.btn-action, .stat-card, .employee-card-header');

    touchElements.forEach(el => {
        el.addEventListener('touchstart', () => {
            el.classList.add('touch-active');
        }, { passive: true });

        el.addEventListener('touchend', () => {
            setTimeout(() => {
                el.classList.remove('touch-active');
            }, 150);
        }, { passive: true });
    });
}
```

**2.8. Cleanup Function**
```javascript
function removeMobileUI() {
    console.log('[MOBILE] 🧹 Removing mobile UI...');

    // Remove all mobile wrappers
    document.querySelectorAll('.mobile-collapsible-section').forEach(wrapper => {
        const section = wrapper.querySelector('[id$="Section"]');
        if (section) {
            // Move section back out
            wrapper.parentNode.insertBefore(section, wrapper);
            // Remove wrapper
            wrapper.remove();
            // Clean up section
            section.style.maxHeight = '';
            section.style.overflow = '';
            delete section.dataset.mobileCollapsible;
        }
    });

    // Remove employee card modifications
    document.querySelectorAll('.employee-card[data-mobile-processed]').forEach(card => {
        card.classList.remove('mobile-collapsed', 'mobile-expanded');
        const statsGrid = card.querySelector('.employee-stats-grid');
        if (statsGrid) {
            statsGrid.style.maxHeight = '';
            statsGrid.style.overflow = '';
        }
        const toggle = card.querySelector('.mobile-employee-toggle');
        if (toggle) toggle.remove();
        delete card.dataset.mobileProcessed;
    });

    // Remove pull hint
    const hint = document.getElementById('mobile-pull-hint');
    if (hint) hint.remove();

    document.body.classList.remove('mobile-mode');
    mobileInitialized = false;

    console.log('[MOBILE] ✅ Mobile UI removed');
}
```

**2.9. Export API**
```javascript
// Export functions
window.MobileUtils = {
    isMobile,
    applyMobileUI,
    removeMobileUI,
    toggleCollapsible,
    CONFIG
};

console.log('[MOBILE] 📱 Mobile utilities v2 loaded');
```

### **STEP 3: Update CSS**

Add CSS for new mobile classes:

```css
/* Mobile Collapsible Wrapper */
.mobile-collapsible-section {
    margin-bottom: 16px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    background: white;
}

.mobile-collapsible-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: white;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s ease;
    min-height: 60px;
}

.mobile-collapsible-header:active {
    background: #f8fafc;
}

.mobile-header-content {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
}

.mobile-icon {
    font-size: 20px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--primary-gradient);
    color: white;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.mobile-icon.gradient-orange {
    background: var(--danger-gradient);
}

.mobile-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

.mobile-badge {
    background: var(--primary-gradient);
    color: white;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}

.mobile-toggle-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #f1f5f9;
    transition: transform 0.3s ease;
}

.mobile-collapsible-section.expanded .mobile-toggle-icon {
    transform: rotate(180deg);
}

.mobile-toggle-icon i {
    font-size: 14px;
    color: #64748b;
}

/* Employee Cards Mobile */
.employee-card.mobile-collapsed .employee-stats-grid {
    max-height: 0;
    overflow: hidden;
}

.employee-card.mobile-expanded .employee-stats-grid {
    max-height: none;
}

.mobile-employee-toggle {
    margin-left: 8px;
    font-size: 14px;
    transition: transform 0.3s ease;
}

.employee-card.mobile-expanded .mobile-employee-toggle {
    transform: rotate(180deg);
}

/* Pull to Refresh Hint */
.mobile-pull-hint {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    z-index: 1000;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
}

.mobile-pull-hint:not(.hidden) {
    transform: translateY(0);
}

.mobile-pull-icon {
    font-size: 20px;
    color: var(--text-secondary);
    animation: bounce 1s ease-in-out infinite;
}

.mobile-pull-text {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(5px); }
}

/* Touch Active States */
.touch-active {
    transform: scale(0.97);
    transition: transform 0.1s ease;
}
```

---

## ✅ Testing Checklist

### Desktop Testing:
- [ ] Statistics render correctly
- [ ] No mobile transformations applied
- [ ] All interactions work normally
- [ ] No console errors

### Mobile Testing (width <= 768px):
- [ ] Product section collapsed by default
- [ ] Click to expand product section works
- [ ] Tag section expanded by default
- [ ] Employee cards: first expanded, others collapsed
- [ ] Click employee header to toggle
- [ ] Haptic feedback works (on supported devices)
- [ ] Pull-to-refresh hint appears
- [ ] Smooth animations
- [ ] No layout breaks

### Resize Testing:
- [ ] Desktop → Mobile: transformations apply
- [ ] Mobile → Desktop: transformations remove cleanly
- [ ] No orphaned elements
- [ ] No memory leaks

---

## 📊 Performance Targets

- **First render**: < 100ms after statistics rendered
- **Collapse/expand animation**: 300ms
- **Memory overhead**: < 50KB
- **CPU usage**: < 5% during animations
- **60 FPS**: Smooth animations

---

## 🚀 Implementation Priority

1. ✅ **Critical**: Event system + basic collapsible
2. ✅ **High**: Employee cards transformation
3. ✅ **Medium**: Pull-to-refresh hint
4. ✅ **Low**: Advanced interactions (haptic, etc.)

---

**Total estimated time**: 45-60 minutes
**Risk level**: LOW (non-destructive approach)
**Rollback plan**: Comment out event listeners

