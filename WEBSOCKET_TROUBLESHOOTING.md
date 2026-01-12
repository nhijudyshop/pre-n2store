# WebSocket Connection Troubleshooting Guide

## Vấn đề: WebSocket bị Closed 1005 và reconnect liên tục

### Triệu chứng
```
[TPOS-WS] Closed 1005
[TPOS-WS] Reconnecting in 2s...
[TPOS-WS] Connecting to TPOS... (attempt 2)
```

## WebSocket Close Codes

| Code | Meaning | Likely Cause |
|------|---------|--------------|
| 1000 | Normal Closure | Server đóng connection bình thường |
| 1001 | Going Away | Server/browser đang tắt |
| 1002 | Protocol Error | Lỗi Socket.IO protocol |
| 1005 | **No Status Received** | Connection đóng bất thường, không có close frame |
| 1006 | Abnormal Closure | Mất kết nối mạng |
| 1008 | Policy Violation | Vi phạm policy (CORS, auth, etc.) |
| 1011 | Internal Server Error | Lỗi bên phía TPOS server |

## Code 1005 - Nguyên nhân phổ biến

### 1. **Token hết hạn hoặc không valid**
```javascript
// Kiểm tra token
const token = 'eyJhbGci...'; // JWT token từ TPOS
const decoded = jwt.decode(token);
console.log('Token expires at:', new Date(decoded.exp * 1000));
```

**Giải pháp:** Refresh token trước khi hết hạn

### 2. **Network timeout**
- Connection bị firewall/proxy block
- TPOS server restart
- Network unstable

**Giải pháp:** Exponential backoff đã được implement

### 3. **Heartbeat không hoạt động**
- Ping/pong không được gửi đúng lúc
- Server timeout connection

**Giải pháp:** Đã thêm watchdog để detect dead connections

### 4. **Authentication thất bại khi join room**
- Token không được gửi
- Token không có quyền truy cập room

**Giải pháp:** Check logs để thấy join response

## Improvements đã thực hiện

### 1. **Enhanced Logging** ✅
```javascript
[TPOS-WS] Closed - Code: 1005, Reason: No reason provided
[TPOS-WS] Close reason: No Status Received (abnormal closure)
[TPOS-WS] Reconnecting in 2s... (attempt 1/10)
```

### 2. **Connection State Tracking** ✅
```javascript
[TPOS-WS] ✅ Namespace connected successfully
[TPOS-WS] Joining room: tomato.tpos.vn
[TPOS-WS] 📤 Sent join request: ["join",{"room":"...","token":"***"}]
[TPOS-WS] 📨 Event received: join
[TPOS-WS] ✅ Join room response: {...}
```

### 3. **Heartbeat Watchdog** ✅
```javascript
// Automatically detect dead connections
if (timeSinceLastPong > pingTimeout) {
    console.error('[TPOS-WS] ⚠️ No pong received, forcing reconnect...');
    this.ws.close();
}
```

### 4. **Error Event Handling** ✅
```javascript
// Catch authentication errors
if (eventName === 'error' || eventName === 'unauthorized') {
    console.error('[TPOS-WS] ❌ Authentication/Error event:', payload);
}
```

## Monitoring & Debugging

### Check WebSocket Status
```bash
# Via API endpoint
curl http://localhost:3001/tpos-ws/status

# Response:
{
  "connected": true,
  "room": "tomato.tpos.vn",
  "hasToken": true,
  "reconnectAttempts": 0,
  "pingInterval": 25000,
  "pingTimeout": 60000,
  "lastPingTime": 1704567890123,
  "lastPongTime": 1704567890456
}
```

### Enable Verbose Logging
Uncomment trong [render.com/server.js](render.com/server.js):

```javascript
// Line 519, 526, 641
console.log('[TPOS-WS] 🏓 Received ping, sent pong');
console.log('[TPOS-WS] 🏓 Received pong from server');
console.log('[TPOS-WS] 💓 Ping sent');
```

### Check Server Logs
```bash
# On Render.com dashboard, view real-time logs
# Look for patterns:

# Good connection:
[TPOS-WS] WebSocket connected, sending handshake...
[TPOS-WS] Received transport info: {"sid":"xxx","pingInterval":25000,"pingTimeout":60000}
[TPOS-WS] ✅ Namespace connected successfully
[TPOS-WS] 📤 Sent join request
[TPOS-WS] 📨 Event received: join
[TPOS-WS] ❤️ Starting heartbeat every 20000ms

# Problem indicators:
[TPOS-WS] ❌ Authentication/Error event: {...}
[TPOS-WS] ⚠️ No pong received for 65000ms
[TPOS-WS] Closed - Code: 1005
```

## Common Solutions

### Solution 1: Token Issues
```javascript
// Ensure token is fresh and valid
const tokenData = await fetch('/api/token', {
    method: 'POST',
    body: JSON.stringify({
        username: 'xxx',
        password: 'xxx'
    })
});

// Start WebSocket with new token
tposRealtimeClient.start(tokenData.access_token, 'tomato.tpos.vn');
```

### Solution 2: Increase Reconnect Attempts
```javascript
// In render.com/server.js:422
this.maxReconnectAttempts = 20; // Increase from 10 to 20
```

### Solution 3: Adjust Heartbeat Timing
```javascript
// In render.com/server.js:624
// Try 90% instead of 80% if server is aggressive
const heartbeatMs = Math.floor(this.pingInterval * 0.9);
```

### Solution 4: Add Connection Timeout
```javascript
// Add timeout when connecting
connect() {
    if (this.isConnected || !this.token) return;

    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
            console.log('[TPOS-WS] Connection timeout, retrying...');
            this.ws?.close();
        }
    }, 10000); // 10 second timeout

    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        // ... rest of code
    });
}
```

## Testing

### Test reconnection behavior
```bash
# 1. Start server
npm start

# 2. Monitor logs
tail -f logs/server.log | grep TPOS-WS

# 3. Trigger disconnect (from another terminal)
# Kill network or restart TPOS connection
curl -X POST http://localhost:3001/tpos-ws/stop
curl -X POST http://localhost:3001/tpos-ws/start

# 4. Observe reconnection pattern:
# Attempt 1: 2s delay
# Attempt 2: 4s delay
# Attempt 3: 8s delay
# Attempt 4: 16s delay
# Attempt 5: 32s delay
# Attempt 6+: 60s delay (max)
```

## Prevention

### 1. **Token Refresh Strategy**
```javascript
// Refresh token before it expires
const tokenExpiryMs = decoded.exp * 1000 - Date.now();
const refreshBeforeMs = 5 * 60 * 1000; // 5 minutes before

if (tokenExpiryMs < refreshBeforeMs) {
    await refreshToken();
}
```

### 2. **Health Check Monitoring**
```javascript
// Periodically check connection health
setInterval(() => {
    const status = tposRealtimeClient.getStatus();
    if (!status.connected && status.reconnectAttempts > 5) {
        // Alert: Connection unstable
        notifyAdmin('TPOS WebSocket unstable');
    }
}, 60000); // Check every minute
```

### 3. **Graceful Shutdown**
```javascript
// On server shutdown
process.on('SIGTERM', () => {
    console.log('[SERVER] Graceful shutdown...');
    tposRealtimeClient.stop(); // Clean close
    server.close();
});
```

## When to Take Action

### 🟢 Normal (No action needed)
- Occasional 1005 with successful reconnect within 10s
- Reconnect attempts < 3

### 🟡 Warning (Monitor closely)
- Frequent 1005 (more than 5 per hour)
- Reconnect attempts 3-7
- Connection drops during peak hours

### 🔴 Critical (Immediate action)
- Cannot reconnect after 10 attempts
- Code 1008 (Policy Violation) or 1011 (Server Error)
- Connection drops every few minutes
- Authentication errors in logs

**Actions:**
1. Check TPOS system status
2. Verify token is valid
3. Check network/firewall logs
4. Contact TPOS support if issue persists

## Further Investigation

If issue persists, collect these data points:

```bash
# 1. Connection pattern
grep "TPOS-WS" logs/server.log | grep -E "Closed|Reconnecting" | tail -50

# 2. Timing analysis
grep "TPOS-WS" logs/server.log | grep -E "pingInterval|pingTimeout"

# 3. Event log
grep "TPOS-WS" logs/server.log | grep "Event received"

# 4. Error log
grep "TPOS-WS" logs/server.log | grep -E "Error|❌|⚠️"
```

Share these logs with the team for analysis.

## Related Files

- [render.com/server.js](render.com/server.js:414-633) - TposRealtimeClient class
- [render.com/REALTIME_AUTO_CONNECT.md](render.com/REALTIME_AUTO_CONNECT.md) - Architecture docs
- [js/realtime-client.js](js/realtime-client.js) - Frontend client

## Summary

WebSocket Code 1005 thường do:
1. ✅ **Token issues** - Đã thêm logging để detect
2. ✅ **Network timeout** - Đã có exponential backoff
3. ✅ **Dead connections** - Đã thêm watchdog
4. ✅ **Auth errors** - Đã thêm error event handling

Với các improvements này, logs sẽ rõ ràng hơn nhiều để debug vấn đề.
