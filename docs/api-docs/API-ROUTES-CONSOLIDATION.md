# API Routes Consolidation Plan

## Hiện Trạng: 2 File API Ticket Song Song

### 1. customer-360.js (1906 lines)
**Mount path:** `/api` (trong server.js)
**Chứa:** Customer, Wallet, Ticket, Balance History routes

#### Ticket Routes trong customer-360.js:
| Method | Path | Mô tả | Đang được dùng bởi |
|--------|------|-------|-------------------|
| GET | `/api/ticket` | List tickets (paginated) | issue-tracking, customer-hub |
| GET | `/api/ticket/stats` | Ticket statistics | issue-tracking, customer-hub |
| GET | `/api/ticket/:code` | Get single ticket | issue-tracking, customer-hub |
| POST | `/api/ticket` | **Create ticket** | issue-tracking, customer-hub |
| PUT | `/api/ticket/:code` | Update ticket | customer-hub |
| POST | `/api/ticket/:code/action` | Perform action (receive, settle, complete) | issue-tracking |
| DELETE | `/api/ticket/:code` | Delete ticket (basic) | - |

---

### 2. v2/tickets.js (809 lines)
**Mount path:** `/api/v2` (trong server.js)
**Chứa:** Chỉ Ticket routes (refactored, có thêm features)

#### Ticket Routes trong v2/tickets.js:
| Method | Path | Mô tả | Đang được dùng bởi |
|--------|------|-------|-------------------|
| GET | `/api/v2/tickets` | List tickets | - |
| GET | `/api/v2/tickets/stats` | Ticket statistics | - |
| GET | `/api/v2/tickets/:id` | Get single ticket | - |
| POST | `/api/v2/tickets` | Create ticket (có fraud prevention) | - |
| PATCH | `/api/v2/tickets/:id` | **Update ticket** | issue-tracking |
| POST | `/api/v2/tickets/:id/notes` | Add internal note | - |
| POST | `/api/v2/tickets/:id/resolve` | Resolve ticket | - |
| GET | `/api/v2/tickets/:id/can-delete` | Check if can delete | - |
| DELETE | `/api/v2/tickets/:id` | **Delete ticket (có virtual credit cleanup)** | issue-tracking |
| POST | `/api/v2/tickets/:id/resolve-credit` | Resolve virtual credit | - |

---

## Vấn Đề Hiện Tại

### issue-tracking sử dụng CẢ 2 API:

```
issue-tracking/js/api-service.js:
├── POST   /api/ticket          (customer-360.js) ← CREATE
├── GET    /api/ticket          (customer-360.js) ← LIST
├── POST   /api/ticket/:code/action (customer-360.js) ← ACTION
├── PATCH  /api/v2/tickets/:id  (v2/tickets.js)   ← UPDATE
└── DELETE /api/v2/tickets/:id  (v2/tickets.js)   ← DELETE
```

### customer-hub chỉ dùng customer-360.js:

```
customer-hub/js/api-service.js:
├── POST   /api/ticket          (customer-360.js)
├── GET    /api/ticket          (customer-360.js)
├── PUT    /api/ticket/:code    (customer-360.js)
├── POST   /api/ticket/:code/action (customer-360.js)
└── DELETE /api/ticket/:code    (customer-360.js)
```

### Hậu quả:
1. **Khi thêm field mới** (như `boom_reason`), phải sửa CẢ 2 file → dễ quên
2. **Logic không nhất quán**: v2 có fraud prevention, virtual credit cleanup mà customer-360 không có
3. **Khó maintain**: 2 nơi làm cùng 1 việc

---

## So Sánh Chi Tiết

### CREATE Ticket

| Feature | customer-360.js | v2/tickets.js |
|---------|-----------------|---------------|
| Basic create | ✅ | ✅ |
| Fraud prevention (duplicate return check) | ❌ | ✅ |
| boom_reason field | ✅ (vừa thêm) | ✅ (vừa thêm) |
| customer_address sync | ❌ | ✅ |

### UPDATE Ticket

| Feature | customer-360.js (PUT) | v2/tickets.js (PATCH) |
|---------|----------------------|----------------------|
| Full update | ✅ | ✅ |
| Partial update | ❌ (PUT replaces all) | ✅ (PATCH partial) |
| Timestamps handling | Basic | Better (timezone) |

### DELETE Ticket

| Feature | customer-360.js | v2/tickets.js |
|---------|-----------------|---------------|
| Soft delete | ❌ | ✅ |
| Hard delete | ✅ | ✅ |
| Virtual credit cleanup | ❌ | ✅ |
| Action history logging | ❌ | ✅ |

---

## Kế Hoạch Đồng Bộ

### Option A: Migrate tất cả sang v2/tickets.js (Recommended)

**Ưu điểm:**
- Code mới hơn, clean hơn
- Có đầy đủ features (fraud prevention, virtual credit cleanup)
- PATCH thay vì PUT (chuẩn RESTful hơn)

**Nhược điểm:**
- Cần update cả issue-tracking và customer-hub frontend
- Cần test kỹ

### Option B: Merge features từ v2 vào customer-360.js

**Ưu điểm:**
- Chỉ cần sửa backend, frontend giữ nguyên

**Nhược điểm:**
- customer-360.js đã quá lớn (1906 lines)
- Khó maintain

---

## Plan Chi Tiết (Option A - Recommended)

### Phase 1: Chuẩn bị v2/tickets.js
1. [ ] Đảm bảo v2/tickets.js có đầy đủ tất cả fields như customer-360.js
2. [ ] Copy các routes còn thiếu từ customer-360.js sang v2:
   - `POST /:id/action` (receive_goods, settle, complete)
   - `GET /stats` (đã có)
3. [ ] Test v2 API độc lập

### Phase 2: Migrate issue-tracking
1. [ ] Đổi `POST /api/ticket` → `POST /api/v2/tickets`
2. [ ] Đổi `GET /api/ticket` → `GET /api/v2/tickets`
3. [ ] Đổi `POST /api/ticket/:code/action` → `POST /api/v2/tickets/:id/action`
4. [ ] Test issue-tracking hoàn chỉnh

### Phase 3: Migrate customer-hub
1. [ ] Đổi tất cả `/api/ticket` → `/api/v2/tickets`
2. [ ] Đổi PUT → PATCH
3. [ ] Test customer-hub hoàn chỉnh

### Phase 4: Cleanup
1. [ ] Remove ticket routes từ customer-360.js
2. [ ] Update documentation
3. [ ] Monitor logs for any old API calls

---

## Files Cần Sửa

### Backend:
- `render.com/routes/v2/tickets.js` - Thêm missing features
- `render.com/routes/customer-360.js` - Remove ticket routes (sau khi migrate xong)

### Frontend:
- `issue-tracking/js/api-service.js` - Đổi API endpoints
- `customer-hub/js/api-service.js` - Đổi API endpoints

---

## Checklist Khi Thêm Field Mới

Để tránh lỗi như `boom_reason`, khi thêm field mới cần sửa:

### Backend (v2/tickets.js - sau khi consolidate):
1. [ ] Destructure từ `req.body` trong POST route
2. [ ] Thêm vào INSERT columns và VALUES
3. [ ] Thêm vào SELECT columns trong GET routes
4. [ ] Thêm vào PATCH allowed fields (nếu cần update)
5. [ ] Run migration cho database

### Frontend:
1. [ ] Thêm field vào form HTML
2. [ ] Thêm field vào ticketData object khi submit
3. [ ] Thêm field vào API call body
4. [ ] Thêm field vào UI render function

---

## Timeline Đề Xuất

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Chuẩn bị v2/tickets.js | High |
| 2 | Migrate issue-tracking | High |
| 3 | Migrate customer-hub | Medium |
| 4 | Cleanup customer-360.js | Low |

---

*Document created: 2026-02-02*
*Last updated: 2026-02-02*
