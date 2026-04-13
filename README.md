# Shopmonkey MCP Server

[![CI](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/actions/workflows/ci.yml)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that wraps the [Shopmonkey REST API (v3)](https://shopmonkey.dev/overview), enabling AI agents and LLMs to interact with shop management data — work orders, customers, vehicles, inventory, appointments, payments, labor, canned services, webhooks, and more.

## Features

- **64 tools** across 11 resource groups covering the full Shopmonkey API
- Bearer token authentication via API key
- Automatic retry with exponential backoff on rate limits (HTTP 429) and server errors (500/502/503/504)
- 30-second request timeout prevents hung connections
- Request concurrency control (max 5 simultaneous API calls)
- Multi-location support via `SHOPMONKEY_LOCATION_ID` default or per-request `locationId`
- Descriptive error messages surfacing Shopmonkey error codes
- **Dual transport**: stdio (local/desktop) and Streamable HTTP (Railway/cloud deployment)
- Works with Claude Desktop, Cursor, Claude Code, Claude.ai, and any MCP-compatible client

## Transports

The server ships two entry points — use whichever matches your deployment target.

### stdio (local use, Claude Desktop, Cursor, Claude Code)

```bash
node dist/index.js
# or: npm start
```

Configure your MCP client to spawn this process (see [MCP Client Configuration](#mcp-client-configuration) below).

### Streamable HTTP (Railway, Render, Claude.ai)

```bash
PORT=3000 node dist/http.js
# or: npm run start:http
```

The HTTP server listens on `PORT` (default `3000`) and handles all MCP requests at `/`. This is the transport required for cloud deployment and for connecting to Claude.ai.

## Tool Reference

### Work Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List work orders with filters (status, customer, location). Valid statuses: `Estimate`, `RepairOrder`, `Invoice` |
| `get_order` | Get single work order details |
| `create_order` | Create new work order |
| `update_order` | Update work order fields |

> `delete_order` is not available — Shopmonkey REST API v3 does not expose a DELETE endpoint for orders. See `docs/LIMITATIONS.md` for details.

### Customers
| Tool | Description |
|------|-------------|
| `search_customers` | Search customers by full-body query (POST /customer/search) |
| `search_customers_by_email` | Search for a customer by email address |
| `search_customers_by_phone` | Search for a customer by phone number |
| `get_customer` | Get single customer profile |
| `create_customer` | Add new customer (name and address fields only) |
| `update_customer` | Update customer info |

> Email and phone are sub-resources in Shopmonkey. Use `POST /v3/customer/:id/email` and `/phone_number` after creating a customer to attach contact info. (Tools tracked in Spec 2.)

### Vehicles
| Tool | Description |
|------|-------------|
| `list_vehicles_for_customer` | List vehicles for a specific customer |
| `lookup_vehicle_by_vin` | Look up a vehicle by VIN number |
| `lookup_vehicle_by_plate` | Look up a vehicle by license plate and region |
| `list_vehicle_owners` | List owners associated with a vehicle |
| `get_vehicle` | Get single vehicle details |
| `create_vehicle` | Add vehicle (optionally linked to customer) |
| `update_vehicle` | Update vehicle data |

### Inventory & Parts
| Tool | Description |
|------|-------------|
| `list_inventory_parts` | List parts inventory |
| `get_inventory_part` | Get single part details |
| `list_inventory_tires` | List tire inventory |
| `search_parts` | Search parts catalog (query required) |

### Appointments
| Tool | Description |
|------|-------------|
| `list_appointments` | List appointments |
| `get_appointment` | Get single appointment |
| `create_appointment` | Book appointment |
| `update_appointment` | Reschedule/update appointment |

### Payments
| Tool | Description |
|------|-------------|
| `list_payments` | List payments |
| `get_payment` | Get payment details |
| `create_payment` | Record a payment (`orderId` and `amountCents` required). **Amount is integer cents** — e.g., $150.50 = `15050`. |

### Technicians & Labor
| Tool | Description |
|------|-------------|
| `list_labor` | List labor line items |
| `list_timeclock` | Technician clock-in/clock-out events |
| `list_users` | List shop users/technicians |
| `get_user` | Get single user/tech profile |

### Services & Canned Services
| Tool | Description |
|------|-------------|
| `list_services` | List services on work orders |
| `list_canned_services` | List pre-built service templates |
| `get_canned_service` | Get single canned service details |
| `create_canned_service` | Create a new canned service template |
| `update_canned_service` | Update an existing canned service |
| `delete_canned_service` | Delete a canned service template |
| `add_canned_service_fee` | Add a fee line item to a canned service |
| `update_canned_service_fee` | Update a fee line item |
| `remove_canned_service_fee` | Remove a fee line item |
| `add_canned_service_labor` | Add a labor line item |
| `update_canned_service_labor` | Update a labor line item |
| `remove_canned_service_labor` | Remove a labor line item |
| `add_canned_service_part` | Add a part line item |
| `update_canned_service_part` | Update a part line item |
| `remove_canned_service_part` | Remove a part line item |
| `add_canned_service_subcontract` | Add a subcontract line item |
| `update_canned_service_subcontract` | Update a subcontract line item |
| `remove_canned_service_subcontract` | Remove a subcontract line item |
| `add_canned_service_tire` | Add a tire line item |
| `update_canned_service_tire` | Update a tire line item |
| `remove_canned_service_tire` | Remove a tire line item |
| `list_customer_deferred_services` | List deferred (recommended but not yet performed) services for a customer |

### Webhooks
| Tool | Description |
|------|-------------|
| `list_webhooks` | List all registered webhooks |
| `get_webhook` | Get webhook details |
| `create_webhook` | Register a new webhook endpoint (e.g., Make.com) with trigger event types |
| `update_webhook` | Update a webhook |
| `delete_webhook` | Delete a webhook |

Supported triggers: `Appointment`, `Customer`, `Inspection`, `Inventory`, `Message`, `Order`, `Payment`, `PurchaseOrder`, `User`, `Vehicle`, `Vendor`

### Reports (Composite)
| Tool | Description |
|------|-------------|
| `report_revenue_summary` | Revenue totals by status and paid/unpaid split for a date range (max 100 orders) |
| `report_appointment_summary` | Appointment counts by confirmation status for a date range (max 100) |
| `report_open_estimates` | Open unauthorized estimates with age-in-days (max 100) |

### Workflow & Locations
| Tool | Description |
|------|-------------|
| `list_workflow_statuses` | Get pipeline/workflow stages |
| `list_locations` | List shop locations |

## Setup

### Prerequisites

- Node.js 18+
- A Shopmonkey API key (create at: Shopmonkey Settings > Integration > API Keys)

### Installation

```bash
git clone https://github.com/AbbottDevelopments/shopmonkey-mcp-server.git
cd shopmonkey-mcp-server
npm install
npm run build
```

### Environment Variables

Copy `.env.example` to `.env` and add your API key:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Required — your Shopmonkey API key
SHOPMONKEY_API_KEY=your_long_lived_api_key_here

# Optional — defaults to https://api.shopmonkey.cloud/v3
SHOPMONKEY_BASE_URL=https://api.shopmonkey.cloud/v3

# Optional — set this for multi-location shops to auto-filter all queries to one location
SHOPMONKEY_LOCATION_ID=

# Optional — HTTP transport port (default: 3000)
PORT=3000
```

The server loads `.env` automatically via [dotenv](https://www.npmjs.com/package/dotenv). You can also pass environment variables through your MCP client config (see below) or your shell.

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shopmonkey": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/shopmonkey-mcp-server",
      "env": {
        "SHOPMONKEY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "shopmonkey": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/shopmonkey-mcp-server",
      "env": {
        "SHOPMONKEY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add shopmonkey -e SHOPMONKEY_API_KEY=your_api_key_here -- node /path/to/shopmonkey-mcp-server/dist/index.js
```

### Claude.ai (HTTP transport, Railway deployment)

Deploy `dist/http.js` to Railway or Render. Set `SHOPMONKEY_API_KEY` as an environment variable. Point your Claude.ai MCP settings at the deployed URL.

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Start stdio server
npm start

# Start HTTP server
npm run start:http

# Run tests
npm test
```

## Error Handling

The server handles common API scenarios:

- **Missing API key**: Returns a descriptive error with setup instructions
- **Rate limiting (429)**: Automatically retries with exponential backoff (up to 3 attempts)
- **Server errors (500, 502, 503, 504)**: Automatically retries with backoff
- **Request timeout**: Aborts after 30 seconds with a clear error message
- **Network failures**: Retries with backoff, returns readable error messages
- **API errors**: Surfaces Shopmonkey error codes (e.g., `API-xxxxx`, `ORM-xxxxx`) and human-readable messages for debugging

## API Reference

- [Shopmonkey API Docs](https://shopmonkey.dev/overview)
- [API Base URL](https://api.shopmonkey.cloud/v3)
- [MCP Protocol](https://modelcontextprotocol.io)

## License

[MIT](LICENSE)
