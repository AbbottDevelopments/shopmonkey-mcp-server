# Capabilities

This document maps every tool in the Shopmonkey MCP server to the client goals it serves. All endpoints are verified against the [Shopmonkey REST API v3](https://shopmonkey.dev/overview).

## Client Goal Mapping

Tools serve two primary integration sections:

- **Section 1 — Shop Data via MCP**: AI agents (Claude, Cursor, etc.) read and write shop management data through structured tool calls. This is the core MCP use case.
- **Section 2 — GHL Sync via Webhooks + Make.com**: Webhooks trigger Make.com scenarios that sync Shopmonkey events to GoHighLevel (e.g., "RO marked paid → GHL deal won").

---

### Work Orders (4 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_orders` | List work orders with filters (status, customer, location). Valid statuses: `Estimate`, `RepairOrder`, `Invoice` | Section 1 — browse/filter shop work |
| `get_order` | Get full work order details including line items and totals | Section 1 — deep dive on a specific job |
| `create_order` | Create a new work order | Section 1 — open new jobs via chat |
| `update_order` | Update work order fields (status, assignment, notes) | Section 1 — advance jobs through workflow |

API reference: [Order resources](https://shopmonkey.dev/resources/order)

### Customers (6 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `search_customers` | Full-body search across all customer fields | Section 1 — find customers by name, address, etc. |
| `search_customers_by_email` | Look up a customer by email address | Section 1 — quick email lookup for returning customers |
| `search_customers_by_phone` | Look up a customer by phone number | Section 1 — caller-ID style lookup |
| `get_customer` | Get full customer profile | Section 1 — review customer history |
| `create_customer` | Create a new customer (name and address fields) | Section 1 — onboard new customers via chat |
| `update_customer` | Update customer information | Section 1 — correct/update customer records |

API reference: [Customer resources](https://shopmonkey.dev/resources/customer)

> **Note:** Email and phone are sub-resources in Shopmonkey. After creating a customer, use `POST /v3/customer/:id/email` and `POST /v3/customer/:id/phone_number` to attach contact info. Sub-resource tools are planned for a future release.

### Vehicles (7 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_vehicles_for_customer` | List all vehicles belonging to a specific customer | Section 1 — see a customer's fleet |
| `lookup_vehicle_by_vin` | Look up a vehicle by VIN number | Section 1 — instant VIN decode in chat |
| `lookup_vehicle_by_plate` | Look up a vehicle by license plate and region | Section 1 — plate lookup for check-in |
| `list_vehicle_owners` | List owners associated with a vehicle | Section 1 — ownership chain for used vehicles |
| `get_vehicle` | Get full vehicle details | Section 1 — review vehicle specs and history |
| `create_vehicle` | Add a vehicle (optionally linked to customer) | Section 1 — register new vehicles |
| `update_vehicle` | Update vehicle data (year, make, model, etc.) | Section 1 — correct vehicle records |

API reference: [Vehicle resources](https://shopmonkey.dev/resources/vehicle)

### Inventory & Parts (4 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_inventory_parts` | List parts inventory | Section 1 — check stock levels |
| `get_inventory_part` | Get single part details | Section 1 — part pricing and availability |
| `list_inventory_tires` | List tire inventory | Section 1 — tire stock check |
| `search_parts` | Search parts catalog by query | Section 1 — find parts for estimates |

### Appointments (4 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_appointments` | List appointments with date and status filters | Section 1 — daily/weekly schedule view |
| `get_appointment` | Get full appointment details | Section 1 — appointment specifics |
| `create_appointment` | Book a new appointment | Section 1 — schedule work via chat |
| `update_appointment` | Reschedule or update an appointment | Section 1 — manage schedule changes |

API reference: [Appointment resources](https://shopmonkey.dev/resources/appointment)

### Payments (3 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_payments` | List payments for an order | Section 1 — payment history |
| `get_payment` | Get payment details | Section 1 — payment verification |
| `create_payment` | Record a payment (`amountCents` — integer cents, e.g., $150.50 = `15050`) | Section 1 — record payments via chat |

> **Important:** All money values use integer cents with `*Cents` field naming. Never send decimal dollar amounts.

### Technicians & Labor (4 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_labor` | List labor line items | Section 1 — labor tracking |
| `list_timeclock` | Technician clock-in/clock-out events | Section 1 — time tracking |
| `list_users` | List shop users and technicians | Section 1 — team roster |
| `get_user` | Get user/technician profile | Section 1 — tech details |

### Services & Canned Services (22 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_services` | List services on work orders | Section 1 — service overview |
| `list_canned_services` | List pre-built service templates | Section 1 — service catalog |
| `get_canned_service` | Get canned service details with line items | Section 1 — template review |
| `create_canned_service` | Create a new canned service template | Section 1 — build service catalog |
| `update_canned_service` | Update canned service (pricing, flags, etc.) | Section 1 — maintain catalog |
| `delete_canned_service` | Delete a canned service template | Section 1 — catalog cleanup |
| `add_canned_service_fee` | Add a fee line item to a canned service | Section 1 — build service pricing |
| `update_canned_service_fee` | Update a fee line item | Section 1 — adjust pricing |
| `remove_canned_service_fee` | Remove a fee line item | Section 1 — pricing cleanup |
| `add_canned_service_labor` | Add a labor line item | Section 1 — define labor charges |
| `update_canned_service_labor` | Update a labor line item | Section 1 — adjust labor |
| `remove_canned_service_labor` | Remove a labor line item | Section 1 — labor cleanup |
| `add_canned_service_part` | Add a part line item | Section 1 — define parts in template |
| `update_canned_service_part` | Update a part line item | Section 1 — adjust parts |
| `remove_canned_service_part` | Remove a part line item | Section 1 — parts cleanup |
| `add_canned_service_subcontract` | Add a subcontract line item | Section 1 — define subcontracted work |
| `update_canned_service_subcontract` | Update a subcontract line item | Section 1 — adjust subcontracts |
| `remove_canned_service_subcontract` | Remove a subcontract line item | Section 1 — subcontract cleanup |
| `add_canned_service_tire` | Add a tire line item | Section 1 — define tire services |
| `update_canned_service_tire` | Update a tire line item | Section 1 — adjust tire pricing |
| `remove_canned_service_tire` | Remove a tire line item | Section 1 — tire cleanup |
| `list_customer_deferred_services` | List deferred (recommended but not yet performed) services for a customer | Section 1 — revenue opportunity surfacing |

API reference: [Canned Service resources](https://shopmonkey.dev/resources/canned_service)

> **Canned service line items** support 5 types (fee, labor, part, subcontract, tire) with full add/update/remove operations. This enables AI agents to build and maintain complete service templates including all pricing components.

### Webhooks (5 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_webhooks` | List all registered webhooks | Section 2 — audit existing integrations |
| `get_webhook` | Get webhook details (URL, triggers, status) | Section 2 — inspect webhook config |
| `create_webhook` | Register a new webhook endpoint with trigger types | **Section 2** — wire up Make.com → GHL sync |
| `update_webhook` | Update a webhook (URL, triggers, enabled state) | Section 2 — maintain integrations |
| `delete_webhook` | Delete a webhook | Section 2 — cleanup |

API reference: [Webhook resources](https://shopmonkey.dev/resources/webhook)

**Supported trigger types:** `Appointment`, `Customer`, `Inspection`, `Inventory`, `Message`, `Order`, `Payment`, `PurchaseOrder`, `User`, `Vehicle`, `Vendor`

> **Section 2 key flow:** Create a webhook with `triggers: ['Payment', 'Order']` pointing to a Make.com endpoint. When a repair order is marked paid in Shopmonkey, the webhook fires, Make.com processes it, and updates the corresponding deal in GoHighLevel.

### Reports — Composite (3 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `report_revenue_summary` | Revenue totals by status (Estimate/RepairOrder/Invoice) and paid/unpaid split for a date range | Section 1 — financial overview |
| `report_appointment_summary` | Appointment counts by confirmation status for a date range | Section 1 — schedule analytics |
| `report_open_estimates` | Open unauthorized estimates with age-in-days calculation | Section 1 — follow-up opportunity pipeline |

> Reports are composited client-side from list endpoints (Shopmonkey has no native report API). Each is capped at 100 records — use tighter date ranges for larger shops.

### Workflow & Locations (2 tools)

| Tool | Description | Client Goal |
|------|-------------|-------------|
| `list_workflow_statuses` | Get pipeline/workflow stages | Section 1 — understand shop workflow |
| `list_locations` | List shop locations | Section 1 — multi-location support |

---

## Summary

| Resource Group | Tools | Primary Section |
|---------------|-------|-----------------|
| Work Orders | 4 | Section 1 |
| Customers | 6 | Section 1 |
| Vehicles | 7 | Section 1 |
| Inventory & Parts | 4 | Section 1 |
| Appointments | 4 | Section 1 |
| Payments | 3 | Section 1 |
| Technicians & Labor | 4 | Section 1 |
| Services & Canned Services | 22 | Section 1 |
| Webhooks | 5 | **Section 2** |
| Reports | 3 | Section 1 |
| Workflow & Locations | 2 | Section 1 |
| **Total** | **64** | |
