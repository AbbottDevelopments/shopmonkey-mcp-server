import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Order } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_orders',
    description: 'List work orders from Shopmonkey. Filter by status, customer ID, date range, or location.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'Filter by order status' },
        customerId: { type: 'string', description: 'Filter orders by customer ID' },
        locationId: { type: 'string', description: 'Filter by location ID (for multi-location shops). Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get detailed information about a single work order by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The work order ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_order',
    description: 'Create a new work order in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Customer ID to associate with the order' },
        vehicleId: { type: 'string', description: 'Vehicle ID to associate with the order' },
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'Initial order status' },
        locationId: { type: 'string', description: 'Location ID for multi-location shops. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
    },
  },
  {
    name: 'update_order',
    description: 'Update fields on an existing work order.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The work order ID to update' },
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'New order status' },
        customerId: { type: 'string', description: 'New customer ID' },
        vehicleId: { type: 'string', description: 'New vehicle ID' },
      },
      required: ['id'],
    },
  },
];

const UPDATE_FIELDS = ['status', 'customerId', 'vehicleId'];
const CREATE_FIELDS = ['customerId', 'vehicleId', 'status', 'locationId'];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async list_orders(args) {
    const params: Record<string, string> = {};
    if (args.status !== undefined) params.status = String(args.status);
    if (args.customerId !== undefined) params.customerId = String(args.customerId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<Order[]>('GET', '/order', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Order>('GET', `/order/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_order(args) {
    const body = pickFields(args, CREATE_FIELDS);
    if (!body.locationId) {
      const defaultId = getDefaultLocationId();
      if (defaultId) body.locationId = defaultId;
    }
    const data = await shopmonkeyRequest<Order>('POST', '/order', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, UPDATE_FIELDS);
    const data = await shopmonkeyRequest<Order>('PUT', `/order/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
