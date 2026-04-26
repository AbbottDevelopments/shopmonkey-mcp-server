# Shopmonkey MCP — Auth Proxy

This directory contains the configuration for deploying [`sigbit/mcp-auth-proxy`](https://github.com/sigbit/mcp-auth-proxy) as a Railway service in front of the Shopmonkey MCP backend.

The proxy adds OAuth 2.1 / OIDC authentication required by Claude's Custom Connector system — zero changes to the backend MCP server code.

---

## Architecture

```
Claude Cowork (claude.ai)
        │
        │  OAuth 2.1 + Bearer JWT
        ▼
┌─────────────────────────────────────┐
│  sigbit/mcp-auth-proxy              │  ← Railway (public) — this service
│  https://{client}-proxy.up.railway.app
│                                     │
│  Auth0 OIDC, DCR, JWT issuance      │
└──────────────────┬──────────────────┘
                   │  Bearer (PROXY_BEARER_TOKEN)
                   ▼
┌─────────────────────────────────────┐
│  Shopmonkey MCP backend             │  ← Railway (existing service)
│  https://{client}-backend.up.railway.app
└─────────────────────────────────────┘
```

---

## Deploy on Railway (per client)

### Step 1 — Create a new Railway service from this subdirectory

1. Railway dashboard → your project → **+ New Service → GitHub Repo**
2. Select `AbbottDevelopments/shopmonkey-mcp-server`
3. Set **Root Directory** to `proxy`
4. Railway picks up `proxy/railway.json` automatically

### Step 2 — Set environment variables

Copy `.env.example`, fill in all values, paste into **Variables → RAW Editor**.

Key values to collect first:
| Variable | Where to find it |
|---|---|
| `BACKEND_MCP_URL` | Railway → backend service → Settings → Networking → Domain |
| `PROXY_BEARER_TOKEN` | Railway → backend service → Variables → `MCP_AUTH_TOKEN` |
| `EXTERNAL_URL` | Railway → proxy service → Settings → Networking → Domain (generate after first deploy) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Auth0 → Applications → {app} → Basic Information |
| `OIDC_CONFIGURATION_URL` | `https://{tenant}.auth0.com/.well-known/openid-configuration` |

### Step 3 — Set start command

Railway → proxy service → **Settings → Deploy → Start Command:**
```
/mcp-auth-proxy $BACKEND_MCP_URL
```

### Step 4 — Validate

```bash
# Should return HTTP 200 with JSON
curl -i https://YOUR-PROXY.up.railway.app/.well-known/oauth-protected-resource
curl -i https://YOUR-PROXY.up.railway.app/.well-known/oauth-authorization-server

# Should return HTTP 401 with WWW-Authenticate header
curl -i https://YOUR-PROXY.up.railway.app/mcp
```

---

## Auth0 Setup

See `_bmad-output/implementation-artifacts/sops/worksheet-auth0-mcp-setup.md` in the abot-platform repo for the full Auth0 configuration walkthrough.

**Per-client Auth0 tenant naming convention:**
- Tenant: `{client-slug}-mcp` → e.g. `cerberus-mcp` → becomes `cerberus-mcp.auth0.com`
- Application name: `{client-slug}-mcp-proxy` → e.g. `cerberus-mcp-proxy`
- Callback URL: `https://{proxy-domain}/.auth/oidc/callback`

---

## Version

Pinned to `ghcr.io/sigbit/mcp-auth-proxy:v2.9.1`. Review [sigbit CHANGELOG](https://github.com/sigbit/mcp-auth-proxy/releases) before upgrading.
