# Login Module - Dang Nhap (Dang Nhap He Thong)

## Muc dich

Module dang nhap cua he thong N2 Shop 2.0. Xu ly xac thuc nguoi dung thong qua Firebase Firestore (luu tru tai khoan) va Firebase Auth (anonymous session). Ho tro:

- Dang nhap bang username/password voi mat khau duoc hash (bcrypt hoac PBKDF2)
- Ghi nho dang nhap 30 ngay (localStorage) hoac chi trong phien lam viec (sessionStorage)
- Rate limiting: khoa tai khoan 5 phut sau 5 lan dang nhap sai
- Cache thong tin user va session vao localStorage de tang toc lan dang nhap tiep theo
- Tu dong chuyen huong neu session con hieu luc (auto-login)
- He thong quyen chi tiet (detailedPermissions) va roleTemplate

## Kien truc & Bo cuc folder

```
n2store/
  index.html              # Trang dang nhap chinh (entry point)
  index/
    login.js              # Logic dang nhap, cache, session management
    login-modern.css      # Giao dien Night Sky Starlight theme
    logo.jpg              # Logo thuong hieu
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang HTML chinh chua form dang nhap (username, password, remember me), load Firebase SDK, crypto libs, va login.js |
| `index/login.js` | Toan bo logic dang nhap: class `CacheManager` (cache persistent vao localStorage), xac thuc password (bcrypt/PBKDF2/plaintext), quan ly session (localStorage/sessionStorage), rate limiting, tu dong redirect khi da dang nhap, tao userId cho chat system |
| `index/login-modern.css` | CSS theme "Night Sky Starlight" - gradient tim/xanh dam voi hieu ung sao nhap nhay, form card noi, animation cho cac thanh phan (logo pulse, input focus, button loading spinner, message slide) |
| `index/logo.jpg` | Hinh logo cua shop, hien thi tren form dang nhap |

## Dependencies

### Shared libs
- `shared/js/firebase-config.js` - Cau hinh Firebase (FIREBASE_CONFIG), cung cap ham `initializeFirebaseApp()`, `initializeFirestore()`

### CDN libraries
- **Firebase SDK v9.22.0** (compat mode):
  - `firebase-app-compat.js` - Firebase core
  - `firebase-auth-compat.js` - Firebase Authentication (dung `signInAnonymously()`)
  - `firebase-firestore-compat.js` - Firestore database
- **CryptoJS v4.1.1** - Thu vien ma hoa, dung cho PBKDF2 password verification
- **bcryptjs v2.4.3** - Thu vien hash password, dung `bcrypt.compare()` de xac thuc

### Cross-module references
- Sau khi dang nhap thanh cong, redirect den `./quy-trinh/index.html` (module Quy Trinh)
- Session data (`loginindex_auth`) duoc cac module khac doc tu localStorage/sessionStorage de kiem tra trang thai dang nhap
- Cac key luu trong storage: `loginindex_auth`, `isLoggedIn`, `userType`, `checkLogin`, `remember_login_preference`, `n2shop_auth_cache`

## Luong du lieu

```
1. User mo trang index.html
        |
2. checkExistingLogin()
   |-- Kiem tra cache (CacheManager) -> neu con hieu luc -> redirect quy-trinh/
   |-- Kiem tra localStorage("loginindex_auth") -> parse JSON -> isValidSession() -> redirect
   |-- Kiem tra sessionStorage("loginindex_auth") -> parse JSON -> isValidSession() -> redirect
   |-- Neu khong co session hop le -> hien form dang nhap
        |
3. User nhap username + password -> handleLogin()
   |-- isRateLimited() -> neu bi khoa -> hien thong bao loi
   |-- validateInputs() -> kiem tra cac truong khong rong
   |-- Kiem tra cache user data -> neu miss -> query Firestore collection "users" doc(username)
   |-- verifyUserPassword():
   |     |-- Uu tien bcrypt.compare(password, passwordHash)
   |     |-- Fallback: CryptoJS.PBKDF2(password, salt) so voi hash
   |     |-- Fallback cuoi: so sanh truc tiep password plaintext
   |-- Firebase Auth: signInAnonymously() (hoac reuse session hien tai)
        |
4. handleSuccessfulLogin()
   |-- Load detailedPermissions tu Firestore (hoac cache)
   |-- Tao/lay userId cho chat system (luu vao Firestore neu chua co)
   |-- Tao authData object chua: username, displayName, roleTemplate, detailedPermissions, isAdmin, timestamps, userId
   |-- Luu vao localStorage (remember me = true) hoac sessionStorage
   |-- Cache session data vao CacheManager
   |-- Hien thong bao thanh cong -> redirect den quy-trinh/index.html sau 1.5 giay
```

## Ham chinh

### Class `CacheManager`
Quan ly cache persistent su dung localStorage + in-memory Map.

| Ham | Mo ta |
|-----|-------|
| `constructor(config)` | Khoi tao voi `storageKey` va `CACHE_EXPIRY` (mac dinh 30 phut), load cache tu localStorage |
| `set(key, value, type)` | Luu entry vao cache voi thoi gian het han, debounce save vao localStorage |
| `get(key, type)` | Lay entry tu cache, tra ve `null` neu het han hoac khong ton tai |
| `clear(type)` | Xoa cache theo type hoac xoa toan bo |
| `cleanExpired()` | Don dep cac entry da het han |
| `invalidatePattern(pattern)` | Xoa cac entry co key chua pattern |
| `getStats()` | Tra ve thong ke: size, hits, misses, hitRate, storageSize |

### Login Functions (trong DOMContentLoaded scope)

| Ham | Mo ta |
|-----|-------|
| `handleLogin()` | Ham chinh xu ly dang nhap: validate -> query Firestore -> verify password -> Firebase Auth -> save session |
| `verifyUserPassword(password, userData)` | Xac thuc password: thu bcrypt -> PBKDF2 -> plaintext comparison |
| `verifyPassword(password, hash, salt)` | Xac thuc bang CryptoJS.PBKDF2 voi 1000 iterations |
| `handleSuccessfulLogin(username, userInfo, rememberMe)` | Luu session data, load permissions, tao userId, redirect |
| `isValidSession(authData, isFromLocalStorage)` | Kiem tra session con hieu luc dua tren timestamp va expiresAt |
| `checkExistingLogin()` | Kiem tra session hien tai (cache -> localStorage -> sessionStorage), tu dong redirect neu con hop le |
| `clearAllAuthData()` | Xoa toan bo du lieu xac thuc (cache + storage) |
| `isRateLimited()` | Kiem tra rate limit: max 5 lan sai, khoa 5 phut |
| `validateInputs()` | Validate username va password khong rong |
| `handleFailedLogin()` | Tang so lan sai, hien thong bao so lan con lai |
| `handleAuthError(error)` | Xu ly loi Firebase (mat mang, khong co quyen, loi he thong) |
| `showError(message)` | Hien thong bao loi (tu dong an sau 5 giay) |
| `showSuccess(message)` | Hien thong bao thanh cong (tu dong an sau 3 giay) |
| `redirectToMainApp()` | Dat flag `justLoggedIn` va chuyen den `quy-trinh/index.html` |
| `setupEventListeners()` | Gan su kien cho form submit, button click, Enter key, checkbox change |
| `initialize()` | Khoi dong he thong: setup listeners, kiem tra session, focus username input |
