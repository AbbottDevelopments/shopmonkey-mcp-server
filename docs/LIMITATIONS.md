# Limitations

This document lists operations the Shopmonkey MCP server does **not** support, or supports only with caveats, with rationale and workarounds.

**On the word "verified."** No Shopmonkey API key has been available to this
project. Everything below is either read off the [Shopmonkey REST API v3
documentation](https://shopmonkey.dev/overview) or reported by an operator
running a fork against a live shop — the two are distinguished per entry. No
endpoint here has been executed by the maintainers. See
[API-PROVENANCE.md](./API-PROVENANCE.md) for how that assumption produced real
bugs in v1.0.0.

## HTTP Transport Notes

### Transport Instance Lifetime

`StreamableHTTPServerTransport` must be instantiated **per request** in stateless mode (`sessionIdGenerator: undefined`). A shared instance is exhausted after the first request — all subsequent requests return 500 with no server-side error output. The `src/http.ts` handler creates a fresh transport and MCP server for each incoming request to avoid this.

Both must then be **closed** when the response ends. Creating them per request without closing leaks a transport and a full tool registry per request for the life of the process — an unbounded leak on a long-running deployment. `src/http.ts` closes both on response `close`.

### Plaintext HTTP is intentional

`src/http.ts` uses `node:http`, not `node:https`, and a SAST scan will flag it as
cleartext transmission. That is correct as written: this process is designed to
run behind a TLS-terminating proxy — Railway's edge, or the `mcp-auth-proxy`
service in `proxy/` — which is where certificates live. Terminating TLS a second
time inside the process would add nothing.

The consequence is that **the server must not be exposed directly to the
internet.** If you run it outside that arrangement, put it behind a reverse proxy
that terminates TLS, and set `MCP_AUTH_TOKEN` so the bearer check is active.

## Unsupported Operations

### `delete_order` — Order Deletion

**Status:** Not available
**Reason:** The Shopmonkey REST API v3 does not expose a `DELETE /v3/order/:id` endpoint. Orders cannot be deleted through the API.
**Workaround:** Use `update_order` to change the order status or archive it within Shopmonkey's workflow system. Orders can be archived via the Shopmonkey web UI.

### `create_order` — Order Creation (Documented, unexecuted)

**Status:** Included; endpoint now documented, still not executed by us
**History:** Through v1.0.0 this was flagged as resting on an endpoint absent from the public documentation. That was accurate at the time. Shopmonkey has since published `POST /order` with an `OrderInput` body schema, so the endpoint itself is no longer in question — only our lack of a live test is. See [API-PROVENANCE.md](./API-PROVENANCE.md).
**Risk:** Body schema is taken from the published `OrderInput` shape and has not been exercised against a live account.

### Flat Customer Listing

**Status:** Not available — by API design
**Reason:** Shopmonkey does not expose `GET /v3/customer` (flat list). Customers are searched, not enumerated. This is an intentional API design choice.
**Alternative:** Use `search_customers` (full-body search), `search_customers_by_email`, or `search_customers_by_phone`. These tools cover all practical customer lookup scenarios.

### Flat Vehicle Listing

**Status:** Not available — by API design
**Reason:** Shopmonkey does not expose `GET /v3/vehicle` (flat list). Vehicles are queried through customer relationships or VIN/plate lookups.
**Alternative:** Use `list_vehicles_for_customer` (by customer ID), `lookup_vehicle_by_vin`, or `lookup_vehicle_by_plate`.

### Customer Email & Phone — Sub-resource Operations

**Status:** Not yet implemented
**Reason:** In Shopmonkey, email and phone are sub-resources, not flat fields on the customer entity. Creating or updating contact info requires separate API calls:
- `POST /v3/customer/:id/email` — add an email address
- `PUT /v3/customer/:id/email/:emailId` — update an email
- `DELETE /v3/customer/:id/email/:emailId` — remove an email
- Same pattern for `phone_number`

**Impact:** `create_customer` and `update_customer` accept name and address fields only. Contact info cannot be attached through the MCP server yet.
**Workaround:** After creating a customer via MCP, add email/phone through the Shopmonkey web UI or direct API calls. Sub-resource tools are planned for a future release.

### Report Ceiling — 1000 Records

**Status:** Design constraint
**Reason:** Order-based reports (`report_revenue_summary`, `report_open_estimates`) page the order list to exhaustion rather than taking a single batch, because the range cannot be narrowed at the API (see *Date filters are silently ignored* below). A safety cap of 1000 records stops a very large shop from paging indefinitely.
**Impact:** A shop with more than 1000 orders in total will produce a partial report.
**How to tell:** These tools return `truncated: true` in their result when the cap was reached with records still remaining, alongside `scannedOrders`. A report without `truncated: true` covered the full list.

⚠ **Superseded guidance.** Through v1.0.0 this section advised using tighter date ranges to stay under a 100-record limit. That advice does not work — narrowing the date range has no effect on what these endpoints return.

### Data Streaming / Enterprise APIs

**Status:** Not available
**Reason:** Shopmonkey's Data Streaming and Enterprise APIs require an Enterprise-tier subscription. These are not accessible with Standard or Premium API keys.
**Impact:** Real-time data feeds and bulk export capabilities are not available through the MCP server.
**Workaround:** Page the list endpoints for periodic data pulls and filter client-side — date filters are not applied server-side (see below). For real-time notifications, use webhooks.

### Unverified Body Schemas

The following API endpoints exist in the Shopmonkey documentation but their request body schemas have **not been verified**. The MCP server does not include create/update tools for these resources:

| Resource | Available Tools | Missing Tools | Notes |
|----------|----------------|---------------|-------|
| Inventory | `list_inventory_parts`, `get_inventory_part`, `list_inventory_tires`, `search_parts` | create, update, delete | Body schema not verified |
| Payments | `list_payments`, `get_payment`, `create_payment` | update, list-by-date | Update schema not verified |
| Labor | `list_labor` | create, update | Body schema not verified |
| Timeclock | `list_timeclock` | create, update | Body schema not verified |

**Workaround:** Use the Shopmonkey web UI for create/update operations on these resources, and the MCP server for read-only access.

## Undocumented API Behaviour

These are not design decisions on our side. They are ways the live API differs
from what its documentation says, found by operators running forks of this
server against real shops. None of them surface an error — each one silently
returns plausible, wrong data, which is what makes them worth writing down.

### Date filters are silently ignored on flat list endpoints

**Status:** Worked around
**Applies to:** `GET /order`, `GET /appointment`, and by extension anything built on them
**Behaviour:** These endpoints accept `startDate`/`endDate` query params, and accept a Mongo-style `where` JSON param, and apply neither. The server returns its default batch and reports success. The documentation describes `where` as "an object to use for filtering the results."
**Found by:** [Andy Kimberle](https://github.com/AndyKimberle/shopmonkey-mcp-server), in production
**Workaround, as implemented:**
- Appointments use `POST /appointment/search`, whose structured `where.startDate.gte/.lte` filter **is** applied server-side. `list_appointments` routes through it automatically when given a date, and `report_appointment_summary` always uses it.
- Orders have no equivalent search endpoint, so `report_revenue_summary` and `report_open_estimates` page the full list and filter client-side via `isWithinDateRange`.

### List endpoints return unstable result sets

**Status:** Worked around
**Applies to:** flat list endpoints generally; confirmed on `GET /appointment` and `GET /order`
**Behaviour:** Identical requests seconds apart return different — sometimes non-overlapping — subsets of the same data. A record present in one response can be entirely absent from the next. There is no stable sort, so any single capped fetch samples an arbitrary window. On a shop with 2000+ orders this produced three different totals from three identical revenue queries.
**Found by:** [Andy Kimberle](https://github.com/AndyKimberle/shopmonkey-mcp-server), in production
**Workaround, as implemented:** `fetchAllRecords` pages to exhaustion rather than taking one batch, de-duplicates by `id` (the same record can appear on two pages), and prefers the documented `meta.hasMore` signal to decide when to stop.

### Unknown body fields are accepted, ignored, and answered with 200

**Status:** Fixed for labor and parts; unverified elsewhere
**Behaviour:** Shopmonkey does not reject unrecognised keys in a request body. It
drops them, applies its own defaults for the fields you meant to set, and returns
HTTP 200. A write that sets nothing is indistinguishable from a write that worked.
**Found by:** [audioedgeaz](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/issues/1), against a live account

This is the most dangerous behaviour on this page, because it corrupts data
rather than failing. Through v1.0.0 every canned-service line item was written
through one shared field allowlist, so labor persisted at `hours: 1` and parts at
`retailCostCents: 0` no matter what was passed, and `update_*` corrections
silently no-opped. A 46-hour estimate worth roughly nineteen thousand dollars was
written into a live customer order as about two thousand, with every call
reporting success.

The schemas differ per line-item type:

| Type | Correct fields |
|---|---|
| Labor | `hours`, `rateCents`, `costRateCents`, `note` |
| Part | `quantity`, `retailCostCents`, `wholesaleCostCents`, `note` |

⚠ **`add_canned_service_fee`, `_subcontract` and `_tire` are still on the old
shared allowlist** and are very likely wrong in the same way. Their schemas have
not been verified against a live account, and inventing field names is what
caused this bug, so they have been left alone rather than guessed at. Treat
writes through those three tools as unverified.

### Filters that are accepted and ignored

Reported against a live account by
[audioedgeaz](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/issues/1),
alongside the date-filter behaviour above. **Not yet fixed** — both need a live
account to fix safely, since the correct request shape is unknown:

| Tool | Behaviour |
|---|---|
| `search_customers` | The `query` argument is ignored; returns arbitrary records in id order. Returning *something* rather than an error is worse than failing — a caller can conclude a customer does not exist and create a duplicate. |
| `list_orders` | The `status` filter is ignored; asking for `Invoice` can return `Estimate` records. |

### Routes in use that the documentation does not list

Two routes this server calls are not in the published documentation. Both are
field-reported working; neither has been executed by the maintainers. They are
listed here so that a future 404 has an obvious first suspect.

| Route | Used by | Basis |
|---|---|---|
| `GET /order/:orderId/service/:serviceId/labor` | `list_labor` | Field-reported by [Zan Pope](https://github.com/ZanPope/shopmonkey-mcp-server) |
| `PUT /label/:labelId/assign` | `assign_label` | Field-reported by [Andy Kimberle](https://github.com/AndyKimberle/shopmonkey-mcp-server) |

The documented alternative for reading labor is to take the `labors` array off
the service object returned by `GET /order/:orderId/service`, if the nested
route ever stops working.

### Timeclock date filtering — unconfirmed

**Status:** Unconfirmed
`list_timeclock` still passes `startDate`/`endDate` as query params to
`GET /timeclock`. Whether that endpoint honours them has not been tested, and
the behaviour of the other list endpoints is not encouraging. Treat a
date-filtered timeclock result as unverified until someone checks it against a
live shop.

## API Conventions

These are not limitations but important conventions to be aware of:

- **All money values are in integer cents** — Fields use `*Cents` naming (e.g., `amountCents`, `totalCostCents`, `unitPriceCents`). Never send decimal dollar amounts. Example: $150.50 = `15050`.
- **Updates use PUT, not PATCH** — The server sends only the fields you provide. The API merges the update; fields not included in the request retain their current values.
- **Order status values are PascalCase** — Valid values: `Estimate`, `RepairOrder`, `Invoice` (not snake_case).
- **Search replaces list for some resources** — Customers and vehicles use `POST .../search` endpoints instead of `GET` list endpoints.
