# TPOS Realtime Chat Mechanism Analysis

Based on the analysis of network logs (`fetctSocketio.txt` and `fetchdung.txt`) and the context of the provided video, this document details the operation of the TPOS Realtime Chat system.

## 1. Connection Architecture
The system uses **Socket.IO** (v4) over a Secure WebSocket (`wss://`) connection.

### Endpoint
- **URL**: `wss://rt-2.tpos.app/socket.io/`
- **Query Parameters**:
  - `room`: `tomato.tpos.vn` (Tenant ID)
  - `EIO`: `4` (Engine.IO version)
  - `transport`: `websocket`

### Handshake
Upon connection, the server sends a handshake packet (Type `0`):
```json
{
  "sid": "4RK_z0D5LofuOO3tR9vW",
  "upgrades": [],
  "pingInterval": 25000,
  "pingTimeout": 60000,
  "maxPayload": 1000000
}
```

## 2. Authentication & Namespace
The chat occurs within the `/chatomni` namespace.

### Authentication Packet
Client sends a Type `40` (Connect) packet to the `/chatomni` namespace with a JWT token.
- **Packet**: `40/chatomni,{"token":"eyJhbG..."}`
- **Token Contents**:
  - `ClientId`: "tmtWebApp"
  - `TenantId`: "tomato.tpos.vn"
  - `UserId`, `DisplayName`, etc.

### Confirmation
Server responds with Type `40` (Connect Ack) containing the session ID:
```
40/chatomni,{"sid":"SSUs7rUdms63DeB9R9vX"}
```

## 3. Event Handling
Messages are received as Type `42` (Event) packets in the `/chatomni` namespace.

### Event Format
Packet structure: `42/chatomni,["on-events", "JSON_STRING"]`

The payload is a stringified JSON object containing:
- **Conversation**: Metadata about the chat thread.
- **Message**: The actual message content.
- **EventName**: Type of event (e.g., `chatomni.on-message`).

### Example: Incoming Message
```json
{
  "Conversation": {
    "Id": "689763acb11cca3c0b168e77",
    "ChannelType": 4, // 4 = Zalo, 1 = Facebook
    "ChannelId": "1479019015501919",
    "UserId": "3430680146979574",
    "Name": "Thảo Tây",
    "UpdatedTime": "2026-01-07T13:30:51.329Z"
  },
  "Message": {
    "Id": "695e60057b7c8059540ed555",
    "Message": "Nu",
    "MessageType": 12, // 12 = Text?
    "Data": {
      "message": "Nu",
      "created_time": "2026-01-07T20:30:45+07:00",
      "from": {
        "id": "3430680146979574",
        "name": "Thảo Tây"
      }
    },
    "EventName": "chatomni.on-message"
  }
}
```

## 4. Live Video Integration
The system also fetches Facebook Live Videos to correlate with chat channels, as seen in `fetchdung.txt`.

### Endpoint
- **URL**: `https://tomato.tpos.vn/api/facebook-graph/livevideo`
- **Parameters**: `pageid`, `limit`, `facebook_Type`, `before`/`after` (cursors)

### Data Correlation
The `objectId` from the Live Video API likely corresponds to the `ObjectId` or `ChannelId` in the WebSocket events, allowing the application to display chat messages within the context of a specific live stream.

## 5. Implementation Recommendations for `tpos-realtime-manager.js`

The current `tpos-realtime-manager.js` connects to a proxy (`n2store-realtime.onrender.com`). To match the native behavior:

1.  **Direct Connection**: The client should connect directly to `wss://rt-2.tpos.app` if no proxy is needed.
2.  **Socket.IO Client**: Use a standard Socket.IO client library or implement the EIO=4 protocol manually (as seen in the logs).
3.  **Token Management**: Ensure `tposTokenManager` provides the correct JWT format expected by `rt-2.tpos.app`.
