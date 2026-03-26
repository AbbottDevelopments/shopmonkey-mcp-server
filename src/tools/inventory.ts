import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { InventoryPart, InventoryTire } from '../types/shopmonkey.js';

export const definitions: Tool[] = [
  {
    name: 'list_inventory_parts',
    description: 'List parts from Shopmonkey inventory. Supports pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_inventory_part',
    description: 'Get detailed information about a single inventory part by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The inventory part ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_inventory_tires',
    description: 'List tires from Shopmonkey inventory. Supports pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'search_parts',
    description: 'Search the parts catalog in Shopmonkey. Use for finding parts by name, number, or description.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query for parts (name, part number, or description)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
      required: ['query'],
    },
  },
];

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {
  async list_inventory_parts(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<InventoryPart[]>('GET', '/inventory/part', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_inventory_part(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<InventoryPart>('GET', `/inventory/part/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_inventory_tires(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<InventoryTire[]>('GET', '/inventory/tire', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async search_parts(args) {
    if (!args.query) return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
    const params: Record<string, string> = { query: String(args.query) };
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<InventoryPart[]>('GET', '/part', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
