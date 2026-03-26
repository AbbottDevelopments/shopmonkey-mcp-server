# Shopmonkey MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that wraps the [Shopmonkey REST API (v3)](https://shopmonkey.dev/overview), enabling AI agents and LLMs to interact with shop management data — work orders, customers, vehicles, inventory, appointments, payments, labor, services, and more.

## Features

- **33 tools** across 9 resource groups covering the full Shopmonkey API
- Bearer token authentication via API key
- Automatic retry with exponential backoff on rate limits (HTTP 429)
- Descriptive error messages surfacing Shopmonkey error codes
- Multi-location support via `locationId` filtering
- Works with Claude Desktop, Cursor, and any MCP-compatible client

## Tool Reference

### Work Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List work orders with filters (status, customer, location) |
| `get_order` | Get single work order details |
| `create_order` | Create new work order |
| `update_order` | Update work order fields |
| `delete_order` | Delete/void work order |

### Customers
| Tool | Description |
|------|-------------|
| `list_customers` | List customers, searchable by name/email/phone |
| `get_customer` | Get single customer profile |
| `create_customer` | Add new customer |
| `update_customer` | Update customer info |

### Vehicles
| Tool | Description |
|------|-------------|
| `list_vehicles` | List vehicles, filter by customer |
| `get_vehicle` | Get single vehicle details |
| `create_vehicle` | Add vehicle (optionally linked to customer) |
| `update_vehicle` | Update vehicle data |

### Inventory & Parts
| Tool | Description |
|------|-------------|
| `list_inventory_parts` | List parts inventory |
| `get_inventory_part` | Get single part details |
| `list_inventory_tires` | List tire inventory |
| `search_parts` | Search parts catalog |

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
| `create_payment` | Record a payment |

### Technicians & Labor
| Tool | Description |
|------|-------------|
| `list_labor` | List labor line items |
| `list_timeclock` | Technician clock-in/clock-out events |
| `list_users` | List shop users/technicians |
| `get_user` | Get single user/tech profile |

### Services
| Tool | Description |
|------|-------------|
| `list_services` | List services on orders |
| `list_canned_services` | List pre-built service templates |
| `get_canned_service` | Get single canned service details |

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

Copy `.env.example` to `.env` and fill in your API key:

```bash
cp .env.example .env
```

```env
# Required
SHOPMONKEY_API_KEY=your_long_lived_api_key_here

# Optional (defaults to production)
SHOPMONKEY_BASE_URL=https://api.shopmonkey.cloud/v3

# Optional (for multi-location shops)
SHOPMONKEY_LOCATION_ID=
```

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
claude mcp add shopmonkey -- node /path/to/shopmonkey-mcp-server/dist/index.js
```

Set `SHOPMONKEY_API_KEY` in your shell environment before running Claude Code.

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Start server
npm start
```

## Error Handling

The server handles common API scenarios:

- **Missing API key**: Returns a descriptive error with setup instructions
- **Rate limiting (429)**: Automatically retries with exponential backoff (up to 3 attempts)
- **API errors**: Surfaces Shopmonkey error codes (e.g., `API-xxxxx`, `ORM-xxxxx`) for debugging
- **Network failures**: Catches and returns readable error messages

## API Reference

- [Shopmonkey API Docs](https://shopmonkey.dev/overview)
- [API Base URL](https://api.shopmonkey.cloud/v3)
- [MCP Protocol](https://modelcontextprotocol.io)

## License

MIT
