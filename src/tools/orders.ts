import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Order } from '../types/shopmonkey.js';

export const definitions: Tool[] = [
  {
    name: 'list_orders',
    description: 'List work orders from Shopmonkey. Filter by status, customer ID, date range, or location.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter by order status (e.g., estimate, work_order, invoice)' },
        customerId: { type: 'string', description: 'Filter orders by customer ID' },
        locationId: { type: 'string', description: 'Filter by location ID (for multi-location shops)' },
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
        status: { type: 'string', description: 'Initial order status (e.g., estimate, work_order)' },
        locationId: { type: 'string', description: 'Location ID for multi-location shops' },
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
        status: { type: 'string', description: 'New order status' },
        customerId: { type: 'string', description: 'New customer ID' },
        vehicleId: { type: 'string', description: 'New vehicle ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_order',
    description: 'Delete or void a work order by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The work order ID to delete' },
      },
      required: ['id'],
    },
  },
];

const UPDATE_FIELDS = ['status', 'customerId', 'vehicleId'];
const CREATE_FIELDS = ['customerId', 'vehicleId', 'status', 'locationId'];

function pickFields(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {
  async list_orders(args) {
    const params: Record<string, string> = {};
    if (args.status !== undefined) params.status = String(args.status);
    if (args.customerId !== undefined) params.customerId = String(args.customerId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

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
    const data = await shopmonkeyRequest<Order>('POST', '/order', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, UPDATE_FIELDS);
    const data = await shopmonkeyRequest<Order>('PATCH', `/order/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async delete_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/order/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: `Work order ${args.id} deleted successfully.` }] };
  },
};
