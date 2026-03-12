# Attendance Sync - DG-600

Hệ thống đồng bộ chấm công từ máy vân tay Ronald Jack DG-600 lên Firebase Firestore.

## Kiến trúc

```
DG-600 (192.168.1.201:4370)
    │  ZK Protocol (TCP/UDP)
    ▼
Node.js sync script (PC tại cửa hàng)
    │  Firebase Admin SDK
    ▼
Firestore (cloud)
    │  Realtime listener
    ▼
Web App (soquy/attendance.html)
```

## Thư mục attendance-sync/

| File | Mô tả |
|------|--------|
| `zk.js` | Raw ZK protocol - TCP+UDP auto-detect, không dùng thư viện |
| `firebase.js` | Upload dữ liệu lên Firestore |
| `index.js` | Service chính - sync mỗi 5 phút, tự khởi động |
| `test.js` | Test kết nối, hiện users + attendance |
| `test-mac.sh` | Script test cho macOS |
| `find-commkey.js` | Tự tìm CommKey bằng brute-force |
| `setup.bat` | Cài đặt trên Windows |
| `start.vbs` | Chạy ẩn trên Windows |
| `stop.bat` | Dừng service |

## ZK Protocol

Giao thức nhị phân qua TCP (port 4370). Mỗi packet TCP có cấu trúc:

```
TCP Header (8 bytes):
  [50 50 82 7d]   Magic bytes
  [xx xx xx xx]   Payload length (uint32 LE)

Payload (8+ bytes):
  [xx xx]         Command ID (uint16 LE)
  [xx xx]         Checksum (uint16 LE)
  [xx xx]         Session ID (uint16 LE)
  [xx xx]         Reply number (uint16 LE)
  [...]           Data (optional)
```

### Commands

| Command | ID | Mô tả |
|---------|-----|--------|
| CMD_CONNECT | 1000 | Kết nối đến thiết bị |
| CMD_EXIT | 1001 | Ngắt kết nối |
| CMD_AUTH | 1102 | Xác thực CommKey |
| CMD_GET_USERS | 9 | Lấy danh sách nhân viên |
| CMD_GET_ATTEND | 13 | Lấy log chấm công |
| CMD_GET_VERSION | 1100 | Firmware version |

### Responses

| Response | ID | Mô tả |
|----------|-----|--------|
| CMD_ACK_OK | 2000 | Thành công |
| CMD_ACK_ERROR | 2001 | Lỗi |
| CMD_ACK_DATA | 2002 | Trả về dữ liệu |
| CMD_ACK_UNAUTH | 2005 | Cần xác thực CommKey |

### CommKey Authentication

Khi thiết bị có CommKey != 0, CMD_CONNECT trả về `CMD_ACK_UNAUTH (2005)`.

Flow xác thực:
1. Gửi `CMD_CONNECT` → nhận `CMD_ACK_UNAUTH` + session ID
2. Hash CommKey bằng `makeCommKey(key, sessionId)` (thuật toán từ commpro.c MakeKey)
3. Gửi `CMD_AUTH (1102)` với 4 bytes đã hash
4. Nhận `CMD_ACK_OK` = thành công

**Lưu ý quan trọng:**
- `CMD_AUTH = 1102`, KHÔNG phải 28 (28 là CMD_TZ_WRQ - ghi timezone)
- CommKey phải được hash với session ID trước khi gửi, không gửi raw
- Hàm hash: bit-reverse → cộng session → XOR "ZKSO" → swap uint16 → XOR ticks

## Firestore Collections

### attendance_records
```json
{
  "deviceUserId": "25",
  "recordTime": "2025-01-15T08:30:00.000Z",
  "type": 0,
  "syncedAt": "2025-01-15T08:35:00.000Z"
}
```
Doc ID: `{uid}_{timestamp_ms}` (idempotent)

### attendance_device_users
```json
{
  "uid": 25,
  "name": "Dung",
  "role": 0,
  "cardno": 0,
  "syncedAt": "2025-01-15T08:35:00.000Z"
}
```

### attendance_sync_status
```json
{
  "status": "ok",
  "lastSync": "2025-01-15T08:35:00.000Z",
  "users": 8,
  "records": 150,
  "proto": "tcp"
}
```

### attendance_commands
Web app gửi lệnh (sync, addUser, enroll) → sync script nhận và thực thi.

## Cài đặt (Windows)

1. Copy `serviceAccountKey.json` vào thư mục `attendance-sync/`
2. Chạy `setup.bat`
3. Hoặc thủ công:
```cmd
npm install
node test.js debug
node index.js
```

## Test (macOS)

```bash
cd attendance-sync
./test-mac.sh debug          # Test CommKey=0
./test-mac.sh find           # Tự tìm CommKey
./test-mac.sh debug key 123  # Test CommKey=123
```

## Cấu hình

Trong `index.js`:
```javascript
const IP       = '192.168.1.201';
const PORT     = 4370;
const COMMKEY  = 0;       // CommKey từ menu máy: Comm > CommKey
const INTERVAL = 5 * 60;  // Sync mỗi 5 phút
```

## Troubleshooting

| Vấn đề | Giải pháp |
|---------|-----------|
| Không ping được | Kiểm tra cùng mạng LAN, IP đúng |
| CMD_ACK_UNAUTH (2005) | Sai CommKey hoặc chưa hash. Chạy `node find-commkey.js` |
| Timeout | Tắt phần mềm Ronald Jack desktop (chiếm port) |
| No users/records | Kiểm tra firmware, thử UDP: sửa code bỏ TCP |

## Nhân viên hiện tại

| UID | Tên |
|-----|-----|
| 0 | N/A |
| 25 | Dung |
| 30 | Duyen |
| 34 | Ant |
| 36 | Hanh |
| 38 | Duyennho |
| 39 | Bo |
| 40 | Coi |
