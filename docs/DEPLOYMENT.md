# Deployment Guide

Single-tenant deployment of the Shopmonkey MCP server on Railway with Doppler for secrets management.

## Prerequisites

- **Node.js 18+** (for local testing before deployment)
- **Railway account** — [railway.app](https://railway.app) (Hobby plan, ~$5/month + usage)
- **Doppler account** — [doppler.com](https://doppler.com) (free tier, 5 projects)
- **Shopmonkey API key** — Create at Shopmonkey Settings > Integration > API Keys
- **Railway CLI** (optional) — `npm install -g @railway/cli`

## 1. Doppler Setup

Doppler manages secrets so they never appear in code, config files, or Railway environment variables directly.

```bash
# Install Doppler CLI
brew install dopplerhq/cli/doppler    # macOS
# or: curl -sLf https://cli.doppler.com/install.sh | sh

# Authenticate
doppler login

# Create project and config
doppler projects create shopmonkey-mcp
doppler setup --project shopmonkey-mcp --config prd
```

Set the required secrets:

```bash
doppler secrets set SHOPMONKEY_API_KEY "your_shopmonkey_api_key_here"
doppler secrets set MCP_AUTH_TOKEN "$(openssl rand -hex 32)"
# Do not set PORT in Doppler — Railway injects this automatically.
```

Optional secrets:

```bash
# Only needed for multi-location shops
doppler secrets set SHOPMONKEY_LOCATION_ID "your_location_id"

# Only if using a non-production Shopmonkey instance
doppler secrets set SHOPMONKEY_BASE_URL "https://api.shopmonkey.cloud/v3"
```

## 2. Railway Setup

### Option A: Deploy from GitHub (recommended)

1. Go to [railway.app/new](https://railway.app/new)
2. Select **"Deploy from GitHub repo"**
3. Connect your GitHub account and select `shopmonkey-mcp-server`
4. Railway auto-detects Node.js and runs `npm ci && npm run build`

### Option B: Deploy via CLI

> **Important:** Complete Section 4 (Configure Start Command) before running `railway up`. Without it, Railway defaults to `npm start` which runs the stdio transport — not the HTTP server.

```bash
# Authenticate
railway login

# Initialize in the repo directory
cd shopmonkey-mcp-server
railway init

# Link to Railway project
railway link

# Deploy (after configuring start command in Section 4)
railway up
```

## 3. Configure Environment Variables

### With Doppler Integration (recommended)

1. In the Railway dashboard, go to your service > **Settings** > **Integrations**
2. Add the **Doppler** integration
3. Select project `shopmonkey-mcp` and config `prd`
4. Railway automatically pulls secrets from Doppler

### Without Doppler (manual)

In the Railway dashboard, go to your service > **Variables** and add:

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPMONKEY_API_KEY` | Yes | Your Shopmonkey API key |
| `MCP_AUTH_TOKEN` | **Required for cloud** | Bearer token for MCP HTTP endpoint authentication. Generate with `openssl rand -hex 32`. **WARNING: Omitting this makes the HTTP endpoint publicly accessible.** |
| `PORT` | No | Railway sets this automatically (default: 3000) |
| `SHOPMONKEY_LOCATION_ID` | No | Scope queries to one location (multi-location shops) |
| `SHOPMONKEY_BASE_URL` | No | Defaults to `https://api.shopmonkey.cloud/v3` |

## 4. Configure Start Command

In Railway dashboard > service > **Settings**:

- **Start Command:** `node dist/http.js`
- **Build Command:** `npm install && npm run build`

Or add a `Procfile` to the repo root:

```
web: node dist/http.js
```

## 5. Health Check

Configure Railway's health check to verify the server is running:

- **Health Check Path:** `/health`
- **Health Check Method:** `GET`
- **Expected Response:** `200 OK` with body `{"status":"ok"}`

The server also responds to `GET /` with the same health response, which Railway uses by default.

## 6. HTTPS

Railway provides HTTPS automatically on the default `*.up.railway.app` domain. No additional configuration needed.

### Custom Domain (optional)

1. In Railway dashboard > service > **Settings** > **Domains**
2. Add your custom domain (e.g., `mcp.yourshop.com`)
3. Add the CNAME record Railway provides to your DNS
4. Railway provisions an SSL certificate automatically

## 7. Verify Deployment

```bash
# Replace with your Railway URL
RAILWAY_URL="https://your-service.up.railway.app"

# Health check
curl -s "$RAILWAY_URL/health"
# Expected: {"status":"ok"}

# MCP tools list (with auth token)
curl -s -X POST "$RAILWAY_URL/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 200
# Expected: JSON response with 64 tools
```

## 8. Connect AI Client

Once deployed, configure your AI client to connect to the HTTP endpoint:

### Claude.ai

In Claude.ai MCP settings, add the server URL and auth token. The HTTP transport is required for Claude.ai.

### Claude Desktop / Cursor / Claude Code (remote)

These clients can also connect to the HTTP endpoint if you prefer centralized deployment over local stdio.

For local stdio usage (no Railway needed), see the [README](../README.md#mcp-client-configuration).

## Monitoring

- **Railway logs:** Dashboard > service > **Deployments** > click deployment > **Logs**
- **Server logs:** All MCP server logs go to stderr (visible in Railway logs)
- **Health endpoint:** Poll `GET /health` for uptime monitoring

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Missing or wrong `MCP_AUTH_TOKEN` | Check the `Authorization: Bearer <token>` header matches the configured token |
| `SHOPMONKEY_API_KEY is not configured` | Missing env var | Add `SHOPMONKEY_API_KEY` to Railway variables or Doppler |
| Health check passes but tools fail | API key invalid or expired | Generate a new key in Shopmonkey Settings > Integration > API Keys |
| `429 Too Many Requests` after retries | API rate limit exceeded | The server retries 3 times with backoff. If persistent, reduce concurrent usage |
| Build fails on Railway | Node version mismatch | Ensure Railway uses Node 18+ (set in `engines` in package.json) |
