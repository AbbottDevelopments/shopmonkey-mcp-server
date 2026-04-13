# Multi-Tenant Future

This document explores what it would take to evolve the Shopmonkey MCP server from a single-tenant deployment to a multi-tenant architecture serving multiple shops from one instance. This is a **future-work exploration**, not a committed roadmap.

## Current Architecture (Single-Tenant)

Today, each deployment serves one Shopmonkey account:

- One `SHOPMONKEY_API_KEY` environment variable per instance
- One `SHOPMONKEY_LOCATION_ID` (optional) scoping queries to a single location
- One `MCP_AUTH_TOKEN` controlling access to the HTTP endpoint
- Deployed as a standalone Railway service per client

This is the right starting point — simple, isolated, and easy to reason about. Each client's data never touches another client's infrastructure.

## Multi-Tenant Vision

A multi-tenant deployment would serve multiple shops from a single server instance, routing requests to the correct Shopmonkey account based on the authenticated caller.

### Per-Tenant API Key Routing

The core challenge is mapping an incoming MCP request to the correct Shopmonkey API key.

**Option A: Token-based routing**
- Each tenant gets a unique `MCP_AUTH_TOKEN`
- Server maps token → Shopmonkey API key at request time
- Simplest to implement, but tokens must be managed externally

**Option B: JWT-based routing**
- Issue JWTs with a `tenant_id` claim
- Server validates JWT and looks up the corresponding API key
- Better for integration with existing auth systems (e.g., Supabase, Auth0)

**Option C: Header-based routing**
- Client sends a `X-Tenant-ID` header alongside the auth token
- Server looks up the API key by tenant ID
- Most flexible but requires client-side configuration

### Tenant Isolation

Even in multi-tenant mode, tenant data must be strictly isolated:

- **Process-level isolation** — Spawn a separate server process per tenant. Maximum isolation, higher resource cost. Could use Railway's service scaling.
- **Namespace isolation** — Single process, but each request is scoped to a tenant's API key. Lower resource cost, requires careful implementation to prevent key leakage between requests.

The current `client.ts` reads `SHOPMONKEY_API_KEY` from the environment once at module load. Multi-tenant would require passing the API key per-request through the call chain.

### Database-Backed Configuration

Single-tenant uses environment variables. Multi-tenant would need persistent configuration:

- **Tenant registry** — Table mapping tenant ID → Shopmonkey API key, location ID, enabled/disabled status
- **Webhook routing** — Per-tenant webhook URLs for Section 2 (GHL sync) configurations
- **Audit logging** — Track which tenant made which API calls for billing and debugging

A lightweight option: PostgreSQL (Railway provides this) with a simple `tenants` table. No ORM needed — raw SQL or a thin query layer.

### Admin Dashboard

Managing multiple tenants requires an admin interface:

- Add/remove tenants
- Rotate API keys
- View per-tenant usage metrics
- Enable/disable tenants
- Configure per-tenant webhook endpoints

This could be a simple web UI or a CLI tool, depending on the scale of deployment.

### Webhook Routing Per Tenant

In multi-tenant mode, webhooks become more complex:

- Each tenant may have different Make.com endpoints
- Webhook secrets must be tenant-scoped
- The `create_webhook` tool would need to inject the correct tenant's webhook URL

One approach: a webhook proxy that receives Shopmonkey webhooks and routes them to the correct tenant's Make.com scenario based on the source location or a custom header.

## Migration Path

A realistic migration from single-tenant to multi-tenant:

1. **Phase 1** — Continue single-tenant deployments. One Railway service per client. Proven, isolated, zero risk.
2. **Phase 2** — Build a tenant registry (PostgreSQL). Migrate API key storage from env vars to database. Server still deployed per-tenant but reads config from shared DB.
3. **Phase 3** — Implement per-request API key routing. Single server instance serves multiple tenants. Add JWT or token-based tenant identification.
4. **Phase 4** — Admin dashboard for tenant management. Self-service onboarding for new shops.

Each phase is independently shippable and adds value without requiring the next phase.

## When to Consider Multi-Tenant

Single-tenant is the right choice when:
- Serving fewer than ~10 clients
- Each client needs custom configuration
- Isolation and simplicity are priorities

Multi-tenant becomes worthwhile when:
- Operational overhead of managing N Railway services exceeds the engineering cost of multi-tenancy
- Onboarding new clients needs to be self-service
- Per-tenant billing and usage tracking are required
