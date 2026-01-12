# Pancake Account Management and Integration Analysis

## 1. Overview
The **Pancake.vn** integration in `orders-report` is responsible for authenticating with Pancake services, managing multiple accounts (tokens), fetching pages, and handling conversations (Inbox/Comments). This system primarily relies on **JWT tokens** for authentication and uses a dual-layer storage strategy (localStorage + Firebase) to ensure persistence across sessions and devices.

## 2. Core Files & Architecture

The integration is modularized into two main classes/files:

| File | Class | Responsibility | Global Instance |
|------|-------|----------------|-----------------|
| `pancake-token-manager.js` | `PancakeTokenManager` | Manages authentication, token storage (local/cloud), expiry checks, and account switching. | `window.pancakeTokenManager` |
| `pancake-data-manager.js` | `PancakeDataManager` | Handles API requests to Pancake (via Proxy), fetches pages, conversations, and manages data caching. | `window.pancakeDataManager` |
| `api-config.js` | `API_CONFIG` | Central configuration for API endpoints, including the Cloudflare Worker proxy (`WORKER_URL`). | `window.API_CONFIG` |

---

## 3. Account Management (`PancakeTokenManager`)

The `PancakeTokenManager` class is the backbone of the authentication system. It implements a robust priority-based token retrieval system.

### 3.1. Token Retrieval Priority
When `getToken()` is called, the system checks sources in this specific order:
1.  **In-Memory Cache**: Fastest, used for active sessions.
2.  **localStorage**: Fast persistence, allows offline access to token data.
3.  **Firebase**: Network-based backup, enables **multi-device synchronization** of accounts.
4.  **Cookie**: Fallback to grab token directly from `pancake.vn` cookies if available (in extension context).

### 3.2. Data Storage Structure

#### **A. LocalStorage (Device-Specific)**
Used for fast access on the current device.
*   `pancake_jwt_token`: The active JWT token string.
*   `pancake_jwt_token_expiry`: Expiry timestamp (seconds).
*   `pancake_active_account_id`: ID of the currently active account.
*   `pancake_page_access_tokens`: Cached mapping of Page IDs to their generic Access Tokens.

#### **B. Firebase Realtime Database (Cloud Sync)**
Used to sync accounts across different devices using the app.
*   **Path**: `pancake_jwt_tokens/accounts/{accountId}`
*   **Data Structure**:
    ```json
    {
      "token": "eyJhbGciOi...",  // Cleaned JWT Token
      "exp": 1234567890,         // Expiry Timestamp
      "uid": "123456",           // User ID from Token Payload
      "name": "User Name",       // User Name from Token Payload
      "savedAt": 1700000000000   // Timestamp when saved
    }
    ```
*   **Path**: `pancake_jwt_tokens/page_access_tokens` (Structure implied but primarily managed via localStorage in current implementation).

### 3.3. Key Functions
*   **`saveTokenToFirebase(token)`**:
    1.  Cleans and validates the JWT token.
    2.  Decodes payload to extract `uid`, `name`, `exp`.
    3.  Saves to **Memory** (Active state).
    4.  Saves to **localStorage** (`active_account_id` + token).
    5.  Saves to **Firebase** under `accounts/{uid}`.
*   **`loadAccounts()`**: Fetches all accounts from Firebase and syncs the active account's token to localStorage.
*   **`setActiveAccount(accountId)`**: Switches the active account in memory/localStorage without checking Firebase (fast switch).

---

## 4. Data Management (`PancakeDataManager`)

The `PancakeDataManager` class handles the consumption of the authenticated session to fetch business data.

### 4.1. API & Proxy Interaction
*   **Proxy Usage**: all requests go through `https://chatomni-proxy.nhijudyshop.workers.dev` (configured in `api-config.js`) to bypass CORS and manage headers.
*   **Authentication**: Uses `window.pancakeTokenManager.getToken()` for every request.

### 4.2. Data Caching & Maps
To optimize performance, especially for the high volume of orders, it maintains several lookup maps:

*   **`conversations`**: Flat list of all fetched conversations.
*   **`inboxMapByPSID` & `inboxMapByFBID`**: Rapid lookup for **INBOX** messages using Page Scoped ID (PSID) or Real Facebook ID.
*   **`commentMapByPSID` & `commentMapByFBID`**: Rapid lookup for **COMMENT** threads.
*   **`conversationsByCustomerFbId`**: Fallback map using `customers[].fb_id`. Critical for matching comments where parsing the sender ID is difficult.

### 4.3. Key Functions
*   **`fetchPages()`**: Gets list of pages and extracts `page_access_token` from settings to cache them.
*   **`searchConversations(query)`**: Performs a targeted search on Pancake API.
*   **`getConversationByUserId(userId)`**: Complex lookup logic that tries multiple maps (Inbox PSID -> Inbox FBID -> Comment FBID -> Comment PSID -> Customer FBID) to find a predictable conversation match for a given Order User ID.

---

## 5. Initialization Flow

1.  **`main.html`** loads the iframe `tab1-orders.html`.
2.  **`tab1-orders.html`** loads scripts in sequence:
    *   ...
    *   `api-config.js` (Config)
    *   `auth.js` (System Auth)
    *   **`pancake-token-manager.js`** -> Instantiates `window.pancakeTokenManager`.
    *   **`pancake-data-manager.js`** -> Instantiates `window.pancakeDataManager`.
    *   **`tab1-orders.js`** (Main Logic).
3.  **`PancakeTokenManager` Constructor**:
    *   Initializes empty state.
    *   **`initialize()`** is called (likely by `tab1-orders.js` or self-init logic):
        *   Loads account ID from `localStorage`.
        *   Connects to Firebase to fetch full account list.
        *   Restores the active token.
4.  **`PancakeDataManager`** is ready to use `getToken()` which now returns the valid token from the Manager.
