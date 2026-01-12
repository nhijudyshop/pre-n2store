# N2Store API Fallback Server

Express.js server deployed on **Render.com** as a fallback when Cloudflare Worker fails.

## 🎯 Purpose

This server acts as a **fallback proxy** for N2Store APIs:
- **Primary**: Cloudflare Worker (`https://chatomni-proxy.nhijudyshop.workers.dev`)
- **Fallback**: Render.com (this server)

When Cloudflare returns 500 errors, frontend automatically falls back to this server.

## 📋 Endpoints

### Health Check
```
GET /health
```

### API Routes
```
POST /api/token
GET  /api/odata/*
GET  /api/api-ms/chatomni/*
GET  /api/pancake/*
GET  /api/image-proxy?url=<encoded_url>
```

## 🚀 Deploy to Render.com

### Step 1: Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the repository: `nhijudyshop/n2store`

### Step 2: Configure Service

**Settings:**
- **Name**: `n2store-api-fallback`
- **Region**: `Singapore` (closest to Vietnam)
- **Branch**: `main` (or your branch)
- **Root Directory**: `render.com`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: `Free` (or paid for better performance)

### Step 3: Environment Variables

Add in Render Dashboard → Environment:
```
NODE_ENV=production
```

### Step 4: Deploy

Click **"Create Web Service"** and wait for deployment.

Your server will be available at:
```
https://n2store-api-fallback.onrender.com
```

## 🔧 Local Development

```bash
# Navigate to folder
cd render.com

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

Server runs on `http://localhost:3000`

## 📊 Testing

### Health Check
```bash
curl https://n2store-api-fallback.onrender.com/health
```

### Token Endpoint
```bash
curl -X POST https://n2store-api-fallback.onrender.com/api/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "password",
    "username": "nvkt",
    "password": "Aa@123456789",
    "client_id": "tmtWebApp"
  }'
```

## 🌐 CORS Configuration

Allowed origins:
- `https://nhijudyshop.github.io`
- `http://localhost:5500` (for local development)
- `http://localhost:3000`

## 📝 Notes

- **Free tier**: Server goes to sleep after 15 minutes of inactivity
- **Cold start**: First request after sleep may take 30-60 seconds
- **Upgrade**: Consider paid plan for production use (no sleep, better performance)

## 🔗 Frontend Integration

Frontend automatically uses fallback when Cloudflare fails.

See: `orders-report/api-config.js` for fallback logic.
