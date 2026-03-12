# Attendance Sync - Dong bo cham cong

## Muc dich

Module dong bo du lieu cham cong tu may cham cong ZKTeco / Ronald Jack (cu the la model DG-600) len Firebase Firestore. Chay nhu mot background service tren may tinh Windows (hoac macOS de test), ket noi truc tiep voi may cham cong qua giao thuc ZK proprietary (TCP + UDP auto-detect), doc danh sach nhan vien va ban ghi cham cong, roi day len Firestore theo chu ky 5 phut.

Dac diem chinh:
- **Khong dung thu vien ZK** nao (vd: node-zklib) - tu implement raw ZK protocol bang `net` (TCP) va `dgram` (UDP) cua Node.js
- Tu dong phat hien giao thuc TCP hoac UDP
- Ho tro xac thuc CommKey (may cham cong co dat mat khau giao tiep)
- Tu dong retry ket noi (3 lan), tu dong reconnect khi mat ket noi
- Nhan lenh tu xa tu Firestore (vd: `sync_now`) qua collection `attendance_commands`
- Ghi log theo ngay vao folder `logs/`

## Kien truc & Bo cuc folder

```
attendance-sync/
├── index.js              # Entry point - vong lap sync chinh
├── zk.js                 # ZK protocol implementation (TCP + UDP)
├── firebase.js           # Firebase Admin SDK - doc/ghi Firestore
├── find-commkey.js       # Utility: brute-force tim CommKey cua may
├── test.js               # Utility: test ket noi va doc du lieu
├── cleanup.js            # Utility: xoa sach du lieu Firestore
├── test-mac.sh           # Shell script test tren macOS
├── setup.bat             # Windows: cai dat + dang ky autostart
├── start.vbs             # Windows: chay service an (hidden window)
├── stop.bat              # Windows: dung service
├── package.json          # Dependencies
├── serviceAccountKey.json # (khong commit) Firebase service account key
└── logs/                 # (runtime) Log file theo ngay
```

## File Map

| File | Mo ta |
|------|-------|
| `index.js` | Entry point. Khoi tao Firebase, ket noi may cham cong, chay vong lap sync moi 5 phut. Lang nghe lenh tu xa tu Firestore (`sync_now`). Xu ly graceful shutdown (SIGINT/SIGTERM). |
| `zk.js` | Implement day du ZK protocol. Class `ZK` voi TCP + UDP auto-detect, xay dung/parse packet, checksum, CommKey authentication (hash theo `commpro.c MakeKey`), decode timestamp, doc user (record 72-byte va 28-byte), doc attendance (record 40-byte va 16-byte) voi auto-detect format. Ho tro buffered read (CMD 1503/1504) cho cac may doi moi. |
| `firebase.js` | Wrapper Firebase Admin SDK. Upload attendance records va device users len Firestore theo batch (450 docs/batch). Cap nhat sync status. Lang nghe pending commands tu collection `attendance_commands`. |
| `find-commkey.js` | Utility doc lap: thu ket noi voi cac gia tri CommKey pho bien (0, 123, 1234, 888888...) hoac scan mot khoang tuy y de tim CommKey dung. In ket qua va huong dan buoc tiep theo. |
| `test.js` | Utility test ket noi may cham cong. Hien thi firmware version, danh sach users, 10 ban ghi cham cong gan nhat. Ho tro debug mode (hien hex bytes) va thu CommKey tuy y. |
| `cleanup.js` | Utility xoa toan bo du lieu cham cong tren Firestore (`attendance_records`, `attendance_device_users`, `attendance_sync_status`) de sync lai tu dau. |
| `test-mac.sh` | Shell script cho macOS: kiem tra Node.js, ping may cham cong, chay `test.js` hoac `find-commkey.js`. |
| `setup.bat` | Windows batch script: kiem tra Node.js + Firebase key, `npm install`, test ket noi, tao VBS script trong Startup folder de chay tu dong khi boot. |
| `start.vbs` | VBScript chay `node index.js` an (khong hien cmd window), redirect output vao `logs/service.log`. |
| `stop.bat` | Windows batch script: tim va kill process `attendance-sync` dang chay. |
| `package.json` | Dependency duy nhat: `firebase-admin ^11.11.0`. Version 5.0.0 ("Raw ZK protocol, no ZK library"). |

## Dependencies

### NPM Dependencies
- **`firebase-admin`** (`^11.11.0`) - Firebase Admin SDK de doc/ghi Firestore

### Node.js Built-in Modules
- `net` - TCP socket (ket noi may cham cong)
- `dgram` - UDP socket (fallback neu TCP khong duoc)
- `fs` - Ghi log file
- `path` - Resolve duong dan file

### External Requirements
- **`serviceAccountKey.json`** - Firebase service account key (khong commit vao git, phai copy thu cong vao folder)
- **May cham cong ZKTeco/Ronald Jack** tai IP `192.168.1.201`, port `4370`

### Cross-module References
- Module nay chay doc lap (Node.js process rieng), khong import/export voi cac module khac cua n2store
- Du lieu duoc dong bo qua Firestore collections, co the doc boi cac module frontend khac:
  - `attendance_records` - ban ghi cham cong
  - `attendance_device_users` - danh sach nhan vien tren may
  - `attendance_sync_status` - trang thai ket noi/sync
  - `attendance_commands` - lenh dieu khien tu xa

## Luong du lieu

```
┌──────────────┐     ZK Protocol      ┌───────────────┐
│  May cham cong│◄───(TCP/UDP)────────►│  index.js     │
│  DG-600      │  IP: 192.168.1.201   │  (Node.js)    │
│  Port: 4370  │  CMD 9: Get Users    │               │
│              │  CMD 13: Get Attend  │  ┌──────────┐ │
└──────────────┘                      │  │  zk.js   │ │
                                      │  └──────────┘ │
                                      │       │       │
                                      │       ▼       │
                                      │  ┌──────────┐ │
                                      │  │firebase.js│ │
                                      │  └──────────┘ │
                                      └───────┬───────┘
                                              │ Firebase Admin SDK
                                              ▼
                                      ┌───────────────┐
                                      │   Firestore   │
                                      │               │
                                      │ attendance_   │
                                      │   records     │
                                      │ attendance_   │
                                      │   device_users│
                                      │ attendance_   │
                                      │   sync_status │
                                      │ attendance_   │
                                      │   commands    │
                                      └───────────────┘
```

### Chi tiet luong:

1. **Khoi dong** (`index.js main()`):
   - Init Firebase Admin SDK voi `serviceAccountKey.json`
   - Tao instance `ZK(IP, PORT, timeout, commkey)`
   - Ket noi may cham cong (thu TCP truoc, fallback UDP), retry 3 lan

2. **Sync** (`index.js sync()`, chay moi 5 phut):
   - Goi `zk.getUsers()` -> doc danh sach nhan vien tu may -> `fb.uploadUsers()` len Firestore
   - Goi `zk.getAttendances()` -> doc ban ghi cham cong tu may -> `fb.uploadRecords()` len Firestore
   - Cap nhat `attendance_sync_status/current` voi `lastSyncTime` va `connected: true`

3. **Lenh tu xa** (`fb.onCommands()`):
   - Lang nghe Firestore collection `attendance_commands` cho cac doc co `status == 'pending'`
   - Hien tai ho tro lenh `sync_now`: chay sync ngay lap tuc
   - Cap nhat ket qua lenh (`completed` hoac `error`)

4. **Luu tru Firestore**:
   - `attendance_records`: Doc ID = `{userId}_{timestamp_ms}`, fields: `deviceUserId`, `checkTime` (Timestamp), `dateKey` (YYYY-MM-DD), `type`, `syncedAt`
   - `attendance_device_users`: Doc ID = `{userId}`, fields: `uid`, `userId`, `name`, `role`, `updatedAt`
   - `attendance_sync_status/current`: `lastSyncTime`, `connected`, `lastError`, `updatedAt`

## Ham chinh

### `zk.js` - Class ZK

| Ham | Mo ta |
|-----|-------|
| `constructor(ip, port, timeout, commkey)` | Khoi tao voi IP may cham cong, port (mac dinh 4370), timeout, va CommKey |
| `connect()` | Ket noi may cham cong. Thu TCP truoc (`_tryTCP`), fallback UDP (`_tryUDP`). Tu dong xac thuc CommKey neu may yeu cau. |
| `disconnect()` | Gui CMD_EXIT va dong socket |
| `getVersion()` | Doc firmware version (CMD 1100) |
| `getUsers()` | Doc danh sach nhan vien. Thu buffered read (CMD 1503 voi FCT_USER=5) truoc, fallback CMD 9 truc tiep. Auto-detect record format (72-byte hoac 28-byte) voi scoring. |
| `getAttendances()` | Doc ban ghi cham cong. Thu buffered read (CMD 1503) truoc, fallback CMD 13 truc tiep. Auto-detect format (40-byte/16-byte) va timestamp offset (27 cho DG-600 vs 26 cho pyzk standard). |
| `readWithBuffer(innerCmd, fct, ext)` | Buffered read qua CMD 1503/1504 (giong `read_with_buffer` cua pyzk). Doc du lieu lon theo tung chunk 16KB. |
| `makeCommKey(key, sessionId, ticks)` | (module-level) Hash CommKey voi session ID truoc khi gui. Thuat toan: bit-reverse -> add session -> XOR 'ZKSO' -> swap halves -> XOR ticks. |
| `checksum(buf)` | (module-level) Tinh 16-bit one's complement checksum cho ZK packet |
| `decodeTime(t)` | (module-level) Decode ZK packed timestamp (uint32) thanh JavaScript Date |
| `_payload(cmd, data)` | Tao ZK payload: [cmd 2B][checksum 2B][session 2B][reply 2B][data] |
| `_tcpPacket(cmd, data)` | Boc payload trong TCP frame: [magic 4B][length 4B][payload] |
| `_tcpSend(cmd, data)` | Gui 1 TCP packet, doi 1 response |
| `_tcpReadAll(cmd, data)` | Gui TCP packet, doc nhieu response (large data transfers) |
| `_udpSend(cmd, data)` | Gui 1 UDP datagram, doi 1 response |
| `_udpReadAll(cmd, data)` | Gui UDP datagram, thu thap nhieu response datagrams |
| `_extract(buf)` | Parse TCP buffer chua nhieu packet, trich xuat raw data (bo framing headers, PREPARE, ACK) |
| `_combineUdp(chunks)` | Gop nhieu UDP datagram thanh 1 buffer data |
| `_parseUsers(data, sz)` | Parse user records tu raw buffer. `sz=72`: uid(u16), role(u8), name(24B), cardno(u32), userId(9B). `sz=28`: uid(u16), role(u8), name(8B), cardno(u32). |
| `_parseAttendances(data, sz, tsOffset)` | Parse attendance records. `sz=40`: userId string(24B), timestamp(u32), punch(u8). `sz=16`: uid(u16), timestamp(u32), punch(u8). |

### `firebase.js`

| Ham | Mo ta |
|-----|-------|
| `init()` | Khoi tao Firebase Admin SDK voi service account key |
| `uploadRecords(records)` | Upload ban ghi cham cong len `attendance_records`. Batch 450 docs. Doc ID = `{userId}_{timestamp_ms}`. Dung `merge: true` de khong ghi de. |
| `uploadUsers(users)` | Upload danh sach nhan vien len `attendance_device_users`. Doc ID = userId (enrollment number tren may). |
| `setStatus(data)` | Cap nhat doc `attendance_sync_status/current` voi du lieu trang thai |
| `onCommands(cb)` | Lang nghe realtime cac doc `pending` trong `attendance_commands`. Goi callback khi co lenh moi. |
| `updateCommand(id, status, result)` | Cap nhat ket qua xu ly lenh (status + result + processedAt) |

### `index.js`

| Ham | Mo ta |
|-----|-------|
| `main()` | Entry point: init Firebase, connect may cham cong (retry 3x), chay sync dau tien, dat interval 5 phut, lang nghe commands, xu ly SIGINT/SIGTERM |
| `sync()` | Doc users + attendance tu may, upload len Firestore, cap nhat sync status |
| `log(msg)` | Ghi log ra console va file `logs/YYYY-MM-DD.log` voi timestamp VN |

### `find-commkey.js`

| Ham | Mo ta |
|-----|-------|
| `main()` | Thu ket noi voi danh sach CommKey pho bien (~70 gia tri), hoac scan khoang tu argv. In ket qua va huong dan. |
| `tryCommKey(key)` | Mo TCP connection, gui CMD_CONNECT, neu UNAUTH thi gui CMD_AUTH voi key da hash. Tra ve ket qua. |

### `test.js`

| Ham | Mo ta |
|-----|-------|
| `main()` | Ket noi may cham cong, in firmware, users, 10 attendance records cuoi. Ho tro `debug` flag va `key <n>` argument. |

### `cleanup.js`

| Ham | Mo ta |
|-----|-------|
| `main()` | Xoa toan bo docs trong 3 collections: `attendance_device_users`, `attendance_records`, `attendance_sync_status` |
| `deleteCollection(name)` | Xoa tat ca docs trong 1 collection theo batch 450 |

## Cau hinh

Cac hang so cau hinh nam truc tiep trong `index.js`:

```javascript
const IP = '192.168.1.201';      // IP may cham cong
const PORT = 4370;                // Port ZK protocol (mac dinh)
const COMMKEY = 0;                // CommKey (0 = khong mat khau)
const INTERVAL = 5 * 60 * 1000;  // Chu ky sync: 5 phut
```

## Huong dan su dung

### Cai dat lan dau (Windows)
```bash
# 1. Copy serviceAccountKey.json vao folder nay
# 2. Chay setup
setup.bat
# Setup se: install deps, test ket noi, dang ky autostart, chay service
```

### Chay thu / Debug (macOS)
```bash
# Test ket noi
./test-mac.sh

# Test voi debug hex output
./test-mac.sh debug

# Tim CommKey
./test-mac.sh find

# Tim CommKey trong khoang
node find-commkey.js 0 9999
```

### Quan ly service (Windows)
```bash
# Dung service
stop.bat

# Chay lai (an)
wscript start.vbs

# Xem log
type logs\2026-03-11.log
```

### Xoa du lieu Firestore de sync lai
```bash
node cleanup.js
node index.js
```
