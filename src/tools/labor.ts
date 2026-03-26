import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Labor, TimeclockEntry, User } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_labor',
    description: 'List labor line items from Shopmonkey. Useful for tracking technician work on orders.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Filter labor entries by work order ID' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'list_timeclock',
    description: 'List technician time clock events. Track clock-in/clock-out for shop staff.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        userId: { type: 'string', description: 'Filter by user/technician ID' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        startDate: { type: 'string', description: 'Filter by start date (ISO 8601 format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO 8601 format)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'list_users',
    description: 'List shop users and technicians from Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_user',
    description: 'Get detailed information about a single shop user or technician by their ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The user/technician ID' } }, required: ['id'] },
  },
];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async list_labor(args) {
    const params: Record<string, string> = {};
    if (args.orderId !== undefined) params.orderId = String(args.orderId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<Labor[]>('GET', '/labor', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_timeclock(args) {
    const params: Record<string, string> = {};
    if (args.userId !== undefined) params.userId = String(args.userId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.startDate !== undefined) params.startDate = String(args.startDate);
    if (args.endDate !== undefined) params.endDate = String(args.endDate);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<TimeclockEntry[]>('GET', '/timeclock', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_users(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<User[]>('GET', '/user', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_user(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<User>('GET', `/user/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
