# N2Store Realtime Server

WebSocket proxy server for Pancake.vn and TPOS ChatOmni realtime messaging.

## Features

- **Pancake Realtime**: Connects to `wss://pancake.vn` to receive new messages/comments
- **TPOS Realtime**: Connects to `wss://ws.chatomni.tpos.app` for TPOS events
- **WebSocket Broadcast**: Forwards events to connected frontend clients

## Deploy on Render.com

### 1. Create Web Service
- Go to [Render Dashboard](https://dashboard.render.com)
- Click "New" > "Web Service"
- Connect this repository

### 2. Configure Settings
| Setting | Value |
|---------|-------|
| Name | `n2store-realtime` |
| Region | Singapore |
| Instance Type | Standard |
| Build Command | `npm install` |
| Start Command | `npm start` |

### 3. Environment Variables
| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |

## API Endpoints

### Pancake Realtime
```
POST /api/realtime/start
Body: { token, userId, pageIds, cookie? }

POST /api/realtime/stop

GET /api/realtime/status
```

### TPOS Realtime
```
POST /api/realtime/tpos/start
Body: { token, room? }

POST /api/realtime/tpos/stop

GET /api/realtime/tpos/status
```

### Health Check
```
GET /health
```

## WebSocket Connection

Frontend clients connect via WebSocket to receive realtime events:

```javascript
const ws = new WebSocket('wss://n2store-realtime.onrender.com');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'pages:update_conversation') {
        // Handle Pancake new message
        console.log('New message:', data.payload);
    }

    if (data.type === 'tpos:event') {
        // Handle TPOS event
        console.log('TPOS event:', data.event, data.payload);
    }
};
```

## Local Development

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`
