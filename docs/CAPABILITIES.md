# Capabilities

This document maps every tool in the Shopmonkey MCP server to the use case it serves. All endpoints are verified against the [Shopmonkey REST API v3](https://shopmonkey.dev/overview).

## Use Case Groups

Tools serve two primary integration patterns:

- **Core MCP Integration**: AI agents (Claude, Cursor, etc.) read and write shop management data through structured tool calls.
- **Webhook/Event Integration**: Webhooks trigger downstream automations (e.g., Make.com scenarios, CRM syncs) when Shopmonkey events fire.

---

### Work Orders (4 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_orders` | List work orders with filters (status, customer, location). Valid statuses: `Estimate`, `RepairOrder`, `Invoice` | Core MCP — browse/filter shop work |
| `get_order` | Get full work order details including line items and totals | Core MCP — deep dive on a specific job |
| `create_order` | Create a new work order | Core MCP — open new jobs via chat |
| `update_order` | Update work order fields (status, assignment, notes) | Core MCP — advance jobs through workflow |

API reference: [Order resources](https://shopmonkey.dev/resources/order)

### Customers (6 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `search_customers` | Full-body search across all customer fields | Core MCP — find customers by name, address, etc. |
| `search_customers_by_email` | Look up a customer by email address | Core MCP — quick email lookup for returning customers |
| `search_customers_by_phone` | Look up a customer by phone number | Core MCP — caller-ID style lookup |
| `get_customer` | Get full customer profile | Core MCP — review customer history |
| `create_customer` | Create a new customer (name and address fields) | Core MCP — onboard new customers via chat |
| `update_customer` | Update customer information | Core MCP — correct/update customer records |

API reference: [Customer resources](https://shopmonkey.dev/resources/customer)

> **Note:** Email and phone are sub-resources in Shopmonkey. After creating a customer, use `POST /v3/customer/:id/email` and `POST /v3/customer/:id/phone_number` to attach contact info. Sub-resource tools are planned for a future release.

### Vehicles (7 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_vehicles_for_customer` | List all vehicles belonging to a specific customer | Core MCP — see a customer's fleet |
| `lookup_vehicle_by_vin` | Look up a vehicle by VIN number | Core MCP — instant VIN decode in chat |
| `lookup_vehicle_by_plate` | Look up a vehicle by license plate and region | Core MCP — plate lookup for check-in |
| `list_vehicle_owners` | List owners associated with a vehicle | Core MCP — ownership chain for used vehicles |
| `get_vehicle` | Get full vehicle details | Core MCP — review vehicle specs and history |
| `create_vehicle` | Add a vehicle (optionally linked to customer) | Core MCP — register new vehicles |
| `update_vehicle` | Update vehicle data (year, make, model, etc.) | Core MCP — correct vehicle records |

API reference: [Vehicle resources](https://shopmonkey.dev/resources/vehicle)

### Inventory & Parts (4 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_inventory_parts` | List parts inventory | Core MCP — check stock levels |
| `get_inventory_part` | Get single part details | Core MCP — part pricing and availability |
| `list_inventory_tires` | List tire inventory | Core MCP — tire stock check |
| `search_parts` | Search parts catalog by query | Core MCP — find parts for estimates |

### Appointments (4 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_appointments` | List appointments with date and status filters | Core MCP — daily/weekly schedule view |
| `get_appointment` | Get full appointment details | Core MCP — appointment specifics |
| `create_appointment` | Book a new appointment | Core MCP — schedule work via chat |
| `update_appointment` | Reschedule or update an appointment | Core MCP — manage schedule changes |

API reference: [Appointment resources](https://shopmonkey.dev/resources/appointment)

### Payments (3 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_payments` | List payments for an order | Core MCP — payment history |
| `get_payment` | Get payment details | Core MCP — payment verification |
| `create_payment` | Record a payment (`amountCents` — integer cents, e.g., $150.50 = `15050`) | Core MCP — record payments via chat |

> **Important:** All money values use integer cents with `*Cents` field naming. Never send decimal dollar amounts.

### Technicians & Labor (4 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_labor` | List labor line items | Core MCP — labor tracking |
| `list_timeclock` | Technician clock-in/clock-out events | Core MCP — time tracking |
| `list_users` | List shop users and technicians | Core MCP — team roster |
| `get_user` | Get user/technician profile | Core MCP — tech details |

### Services & Canned Services (22 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_services` | List services on work orders | Core MCP — service overview |
| `list_canned_services` | List pre-built service templates | Core MCP — service catalog |
| `get_canned_service` | Get canned service details with line items | Core MCP — template review |
| `create_canned_service` | Create a new canned service template | Core MCP — build service catalog |
| `update_canned_service` | Update canned service (pricing, flags, etc.) | Core MCP — maintain catalog |
| `delete_canned_service` | Delete a canned service template | Core MCP — catalog cleanup |
| `add_canned_service_fee` | Add a fee line item to a canned service | Core MCP — build service pricing |
| `update_canned_service_fee` | Update a fee line item | Core MCP — adjust pricing |
| `remove_canned_service_fee` | Remove a fee line item | Core MCP — pricing cleanup |
| `add_canned_service_labor` | Add a labor line item | Core MCP — define labor charges |
| `update_canned_service_labor` | Update a labor line item | Core MCP — adjust labor |
| `remove_canned_service_labor` | Remove a labor line item | Core MCP — labor cleanup |
| `add_canned_service_part` | Add a part line item | Core MCP — define parts in template |
| `update_canned_service_part` | Update a part line item | Core MCP — adjust parts |
| `remove_canned_service_part` | Remove a part line item | Core MCP — parts cleanup |
| `add_canned_service_subcontract` | Add a subcontract line item | Core MCP — define subcontracted work |
| `update_canned_service_subcontract` | Update a subcontract line item | Core MCP — adjust subcontracts |
| `remove_canned_service_subcontract` | Remove a subcontract line item | Core MCP — subcontract cleanup |
| `add_canned_service_tire` | Add a tire line item | Core MCP — define tire services |
| `update_canned_service_tire` | Update a tire line item | Core MCP — adjust tire pricing |
| `remove_canned_service_tire` | Remove a tire line item | Core MCP — tire cleanup |
| `list_customer_deferred_services` | List deferred (recommended but not yet performed) services for a customer | Core MCP — revenue opportunity surfacing |

API reference: [Canned Service resources](https://shopmonkey.dev/resources/canned_service)

> **Canned service line items** support 5 types (fee, labor, part, subcontract, tire) with full add/update/remove operations. This enables AI agents to build and maintain complete service templates including all pricing components.

### Webhooks (5 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_webhooks` | List all registered webhooks | Webhook — audit existing integrations |
| `get_webhook` | Get webhook details (URL, triggers, status) | Webhook — inspect webhook config |
| `create_webhook` | Register a new webhook endpoint with trigger types | **Webhook** — wire up downstream automations |
| `update_webhook` | Update a webhook (URL, triggers, enabled state) | Webhook — maintain integrations |
| `delete_webhook` | Delete a webhook | Webhook — cleanup |

API reference: [Webhook resources](https://shopmonkey.dev/resources/webhook)

**Supported trigger types:** `Appointment`, `Customer`, `Inspection`, `Inventory`, `Message`, `Order`, `Payment`, `PurchaseOrder`, `User`, `Vehicle`, `Vendor`

> **Webhook integration example:** Create a webhook with `triggers: ['Payment', 'Order']` pointing to an automation platform endpoint. When a repair order is marked paid in Shopmonkey, the webhook fires and can update downstream CRM or reporting systems.

### Reports — Composite (3 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `report_revenue_summary` | Revenue totals by status (Estimate/RepairOrder/Invoice) and paid/unpaid split for a date range | Core MCP — financial overview |
| `report_appointment_summary` | Appointment counts by confirmation status for a date range | Core MCP — schedule analytics |
| `report_open_estimates` | Open unauthorized estimates with age-in-days calculation | Core MCP — follow-up opportunity pipeline |

> Reports are composited client-side from list endpoints (Shopmonkey has no native report API). Each is capped at 100 records — use tighter date ranges for larger shops.

### Workflow & Locations (2 tools)

| Tool | Description | Use Case |
|------|-------------|----------|
| `list_workflow_statuses` | Get pipeline/workflow stages | Core MCP — understand shop workflow |
| `list_locations` | List shop locations | Core MCP — multi-location support |

---

## Summary

| Resource Group | Tools | Primary Pattern |
|---------------|-------|-----------------|
| Work Orders | 4 | Core MCP |
| Customers | 6 | Core MCP |
| Vehicles | 7 | Core MCP |
| Inventory & Parts | 4 | Core MCP |
| Appointments | 4 | Core MCP |
| Payments | 3 | Core MCP |
| Technicians & Labor | 4 | Core MCP |
| Services & Canned Services | 22 | Core MCP |
| Webhooks | 5 | **Webhook/Event** |
| Reports | 3 | Core MCP |
| Workflow & Locations | 2 | Core MCP |
| **Total** | **64** | |
