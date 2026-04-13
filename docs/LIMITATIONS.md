# Limitations

This document lists operations the Shopmonkey MCP server does **not** support, with rationale and workarounds. All limitations are verified against the [Shopmonkey REST API v3](https://shopmonkey.dev/overview).

## Unsupported Operations

### `delete_order` — Order Deletion

**Status:** Not available
**Reason:** The Shopmonkey REST API v3 does not expose a `DELETE /v3/order/:id` endpoint. Orders cannot be deleted through the API.
**Workaround:** Use `update_order` to change the order status or archive it within Shopmonkey's workflow system. Orders can be archived via the Shopmonkey web UI.

### `create_order` — Order Creation (Unverified)

**Status:** Included but unverified
**Reason:** The `POST /v3/order` endpoint is not visible in the public API documentation. The `create_order` tool is included based on the standard REST pattern, but the endpoint has not been verified against the live API.
**Risk:** The tool may return a 404 or unexpected error if the endpoint does not exist.
**Workaround:** If the endpoint fails, create orders through the Shopmonkey web UI and use `update_order` to modify them via the MCP server.

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

### Report Ceiling — 100 Records

**Status:** Design constraint
**Reason:** The composite report tools (`report_revenue_summary`, `report_appointment_summary`, `report_open_estimates`) fetch up to 100 records from Shopmonkey list endpoints. This is a practical limit to prevent excessive API calls and response sizes.
**Impact:** For shops processing more than 100 orders or appointments in a date range, reports will be incomplete.
**Workaround:** Use tighter date ranges to stay within the 100-record limit. Paginated report variants are planned for a future release.

### Data Streaming / Enterprise APIs

**Status:** Not available
**Reason:** Shopmonkey's Data Streaming and Enterprise APIs require an Enterprise-tier subscription. These are not accessible with Standard or Premium API keys.
**Impact:** Real-time data feeds and bulk export capabilities are not available through the MCP server.
**Workaround:** Use list endpoints with date filters for periodic data pulls. For real-time notifications, use webhooks.

### Unverified Body Schemas

The following API endpoints exist in the Shopmonkey documentation but their request body schemas have **not been verified**. The MCP server does not include create/update tools for these resources:

| Resource | Available Tools | Missing Tools | Notes |
|----------|----------------|---------------|-------|
| Inventory | `list_inventory_parts`, `get_inventory_part`, `list_inventory_tires`, `search_parts` | create, update, delete | Body schema not verified |
| Payments | `list_payments`, `get_payment`, `create_payment` | update, list-by-date | Update schema not verified |
| Labor | `list_labor` | create, update | Body schema not verified |
| Timeclock | `list_timeclock` | create, update | Body schema not verified |

**Workaround:** Use the Shopmonkey web UI for create/update operations on these resources, and the MCP server for read-only access.

## API Conventions

These are not limitations but important conventions to be aware of:

- **All money values are in integer cents** — Fields use `*Cents` naming (e.g., `amountCents`, `totalCostCents`, `unitPriceCents`). Never send decimal dollar amounts. Example: $150.50 = `15050`.
- **Updates use PUT, not PATCH** — The server sends only the fields you provide. The API merges the update; fields not included in the request retain their current values.
- **Order status values are PascalCase** — Valid values: `Estimate`, `RepairOrder`, `Invoice` (not snake_case).
- **Search replaces list for some resources** — Customers and vehicles use `POST .../search` endpoints instead of `GET` list endpoints.
