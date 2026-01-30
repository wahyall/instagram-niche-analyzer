# Complete Railway Deployment Guide

This guide walks you through deploying the Instagram Scraper RAG application to Railway with all required cloud services.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        RAILWAY                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Web Service (Next.js)                              │   │
│  │  - Frontend UI                                       │   │
│  │  - API Routes (/api/*)                              │   │
│  │  - Port 3000                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Worker Service (Playwright)                        │   │
│  │  - BullMQ job processor                             │   │
│  │  - Instagram scraping                               │   │
│  │  - AI analysis                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ MongoDB Atlas │   │ Upstash Redis │   │ Qdrant Cloud  │
│   (Free)      │   │   (Free)      │   │   (Free)      │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Prerequisites

- GitHub account with this repository pushed
- Railway account (https://railway.app)
- Credit card for Railway (free tier available, but card required)

---

## Part 1: Set Up Cloud Services

Before deploying to Railway, set up the external database services.

### 1.1 MongoDB Atlas (Database)

1. Go to https://www.mongodb.com/atlas
2. Create a free account or sign in
3. Create a new project (e.g., "instagram-scraper")
4. Click **"Build a Database"**
5. Select **M0 Free Tier**
6. Choose a cloud provider and region (closest to your users)
7. Click **"Create Cluster"**

**Configure Access:**

1. Go to **Database Access** → **Add New Database User**
   - Username: `instagram-scraper`
   - Password: Generate a secure password (save it!)
   - Role: "Read and write to any database"
   - Click **Add User**

2. Go to **Network Access** → **Add IP Address**
   - Click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - This is required for Railway's dynamic IPs
   - Click **Confirm**

3. Go to **Database** → **Connect** → **Drivers**
   - Copy the connection string
   - Replace `<password>` with your password
   - Replace `<dbname>` with `instagram-scraper`

**Your MongoDB URI:**
```
mongodb+srv://instagram-scraper:<password>@cluster0.xxxxx.mongodb.net/instagram-scraper?retryWrites=true&w=majority
```

---

### 1.2 Upstash Redis (Queue & Cache)

1. Go to https://upstash.com
2. Create a free account or sign in
3. Click **"Create Database"**
4. Configure:
   - Name: `instagram-scraper`
   - Type: **Regional**
   - Region: Choose closest to your Railway region
   - Enable **TLS**
5. Click **Create**

6. In the database dashboard, find **Redis URL**
   - Copy the URL that starts with `rediss://` (with double 's' for TLS)

**Your Redis URL:**
```
rediss://default:xxxxx@global-nice-condor-12345.upstash.io:6379
```

---

### 1.3 Qdrant Cloud (Vector Database)

1. Go to https://cloud.qdrant.io
2. Create a free account or sign in
3. Click **"Create Cluster"**
4. Configure:
   - Name: `instagram-scraper`
   - Cloud: AWS (recommended)
   - Region: Choose closest to your Railway region
   - Plan: **Free** (1GB storage)
5. Click **Create**

6. Wait for the cluster to be ready (1-2 minutes)
7. Click on your cluster → **Data Access** → **API Keys**
8. Create a new API key and copy it

**Your Qdrant credentials:**
```
URL: https://xxxxx-xxxx-xxxx.aws.cloud.qdrant.io:6333
API Key: your-api-key-here
```

---

### 1.4 Get API Keys

**Google Gemini (Required for AI features):**
1. Go to https://aistudio.google.com/apikey
2. Click **"Create API Key"**
3. Copy the key

**Generate Encryption Key:**
```bash
# Run this in your terminal
openssl rand -hex 32
```

---

## Part 2: Deploy to Railway

### 2.1 Create Railway Project

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose your `instagram-scrapper-rag` repository
6. Railway will detect it's a Node.js project

### 2.2 Configure Web Service

After initial deployment, configure the web service:

1. Click on the deployed service
2. Go to **Settings** tab

**Service Settings:**
- Name: `web`
- Root Directory: `/` (leave empty)

3. Go to **Deploy** tab → **Build Command**:
```
npm install && npm run build
```

4. **Start Command**:
```
npm start
```

5. Go to **Settings** → **Networking**
   - Click **"Generate Domain"** to get a public URL
   - Or add a custom domain

6. **Health Check** (optional but recommended):
   - Path: `/`
   - Timeout: 300 seconds

### 2.3 Add Environment Variables to Web Service

Go to **Variables** tab and add all these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Production mode |
| `MONGODB_URI` | `mongodb+srv://...` | Your MongoDB Atlas URI |
| `REDIS_URL` | `rediss://...` | Your Upstash Redis URL |
| `QDRANT_URL` | `https://...` | Your Qdrant Cloud URL |
| `QDRANT_API_KEY` | `your-key` | Your Qdrant API key |
| `ENCRYPTION_KEY` | `your-32-byte-key` | Generated encryption key |
| `GEMINI_API_KEY` | `your-gemini-key` | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Primary model |
| `GEMINI_FALLBACK_MODEL` | `gemini-1.5-flash` | Fallback model |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.up.railway.app` | Your Railway domain |

**Click "Deploy" to apply changes.**

---

### 2.4 Create Worker Service

The worker runs separately to handle scraping jobs with Playwright.

1. In your Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose the same repository
4. Railway will create a second service

**Configure the Worker:**

1. Click on the new service
2. Go to **Settings**:
   - Name: `worker`
   - Root Directory: `/` (leave empty)

3. Go to **Deploy** tab:

**Build Command:**
```
npm install && npx playwright install chromium --with-deps
```

**Start Command:**
```
npm run worker
```

4. **Health Check** (important for worker):
   - Path: `/health`
   - Timeout: 300 seconds

5. Go to **Settings** → **Networking**
   - The worker doesn't need a public domain
   - Railway will assign an internal port via `$PORT`

### 2.5 Add Environment Variables to Worker Service

Go to **Variables** tab and add the **same variables** as the web service:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://...` |
| `REDIS_URL` | `rediss://...` |
| `QDRANT_URL` | `https://...` |
| `QDRANT_API_KEY` | `your-key` |
| `ENCRYPTION_KEY` | `your-32-byte-key` |
| `GEMINI_API_KEY` | `your-gemini-key` |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `GEMINI_FALLBACK_MODEL` | `gemini-1.5-flash` |

**Tip:** You can use Railway's **Shared Variables** feature to avoid duplicating variables:
1. Go to project **Settings** → **Shared Variables**
2. Add all variables there
3. Reference them in each service

---

## Part 3: Using Railway Config Files (Alternative)

This repository includes pre-configured Railway TOML files for easier deployment.

### railway.web.toml
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
numReplicas = 1
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### railway.worker.toml
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npx playwright install chromium --with-deps"

[deploy]
startCommand = "npm run worker"
numReplicas = 1
healthcheckPath = ""
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**To use config files:**

1. When creating each service in Railway, go to **Settings**
2. Set **Config File Path**:
   - Web service: `railway.web.toml`
   - Worker service: `railway.worker.toml`

---

## Part 4: Verify Deployment

### 4.1 Check Service Status

1. In Railway dashboard, both services should show **"Active"**
2. Check the **Logs** tab for each service for any errors

### 4.2 Test the Web Application

1. Open your Railway-generated URL (e.g., `https://your-app.up.railway.app`)
2. You should see the Instagram Scraper login page
3. Try logging in with an Instagram account

### 4.3 Verify Worker Connection

1. Go to Worker service **Logs**
2. You should see:
   ```
   Health check server running on port 3001
   Starting Instagram Workers...
   Auth Worker started and listening for login jobs...
   Scrape Worker started and listening for scrape jobs...
   ```

### 4.4 Test the Full Flow

1. Login to the app with Instagram credentials
2. Start a scrape job from the dashboard
3. Check the Jobs page to see the job being processed
4. Verify data appears in the Profiles page

---

## Part 5: Troubleshooting

### Common Issues

**Build Fails with "playwright" error:**
- Ensure build command includes `npx playwright install chromium --with-deps`
- The `--with-deps` flag installs system dependencies

**Worker not processing jobs:**
- Verify `REDIS_URL` is the same in both services
- Check Redis connection in Upstash dashboard
- Look at worker logs for connection errors

**MongoDB connection fails:**
- Ensure Network Access allows `0.0.0.0/0`
- Verify the password doesn't have special characters that need URL encoding
- Check the database name in the URI

**Qdrant connection fails:**
- Verify the URL includes the port `:6333`
- Check API key is correct
- Ensure cluster is in "Ready" state

**Health check failing:**
- Web: Check `/` returns 200
- Worker: Check `/health` returns 200
- Increase timeout if needed (300 seconds recommended)

### View Logs

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# View logs
railway logs
```

---

## Part 6: Cost Estimation

### Free Tier Limits

| Service | Free Tier | Notes |
|---------|-----------|-------|
| Railway | $5/month credit | Enough for small apps |
| MongoDB Atlas | 512MB storage | M0 cluster |
| Upstash Redis | 10,000 commands/day | Free tier |
| Qdrant Cloud | 1GB storage | Free forever |
| Google Gemini | Free tier available | Rate limited |

### Scaling Considerations

- **Worker**: For heavy scraping, consider upgrading Railway plan
- **MongoDB**: Upgrade to M10+ for production workloads
- **Redis**: Upgrade for more commands/day if needed

---

## Part 7: Maintenance

### Updating the Application

1. Push changes to GitHub
2. Railway auto-deploys on push (if enabled)
3. Or manually deploy from Railway dashboard

### Monitoring

1. Use Railway's built-in metrics
2. Check Upstash Redis dashboard for queue stats
3. Monitor MongoDB Atlas for database performance

### Backups

- MongoDB Atlas: Enable automated backups in cluster settings
- Qdrant: Export collections periodically if needed

---

## Quick Reference

### Environment Variables Checklist

```env
# Required
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://...
QDRANT_URL=https://...
QDRANT_API_KEY=...
ENCRYPTION_KEY=...
GEMINI_API_KEY=...

# Optional
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODEL=gemini-1.5-flash
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
```

### Railway CLI Commands

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up

# View logs
railway logs

# Open dashboard
railway open

# Set environment variable
railway variables set KEY=value
```

### Useful Links

- Railway Dashboard: https://railway.app/dashboard
- MongoDB Atlas: https://cloud.mongodb.com
- Upstash Console: https://console.upstash.com
- Qdrant Cloud: https://cloud.qdrant.io
- Google AI Studio: https://aistudio.google.com

---

## Support

If you encounter issues:
1. Check Railway service logs
2. Verify all environment variables are set
3. Test database connections individually
4. Open an issue on the GitHub repository
