import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Labor, TimeclockEntry, User } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_labor',
    description: 'List the labor line items on a service. Shopmonkey nests labor under order > service, so both orderId and serviceId are required — call list_services with an orderId first to get the serviceId.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID the service belongs to' },
        serviceId: { type: 'string', description: 'The service ID to list labor line items for' },
      },
      required: ['orderId', 'serviceId'],
    },
  },
  {
    name: 'assign_technician',
    description: "Assign a technician to one or more labor line items on a work order. Use list_services (orderId) to find the serviceId, list_labor (orderId + serviceId) to find labor IDs, and list_users to find the technician's user ID.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID the labor line items belong to' },
        laborIds: { type: 'array', items: { type: 'string' }, description: 'One or more labor line item IDs to assign the technician to' },
        technicianId: { type: 'string', description: 'The technician/user ID to assign (from list_users)' },
      },
      required: ['orderId', 'laborIds', 'technicianId'],
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
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
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
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
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
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.serviceId) return { content: [{ type: 'text', text: 'Error: serviceId is required' }], isError: true };

    const data = await shopmonkeyRequest<Labor[]>(
      'GET',
      `/order/${sanitizePathParam(String(args.orderId))}/service/${sanitizePathParam(String(args.serviceId))}/labor`
    );
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async assign_technician(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.technicianId) return { content: [{ type: 'text', text: 'Error: technicianId is required' }], isError: true };

    const laborIds = Array.isArray(args.laborIds) ? args.laborIds.map(String) : [];
    if (laborIds.length === 0) {
      return { content: [{ type: 'text', text: 'Error: laborIds must be a non-empty array of labor line item IDs' }], isError: true };
    }

    // Shopmonkey exposes technician assignment as a bulk update against the
    // order, not as a write to an individual labor line item.
    const data = await shopmonkeyRequest<Labor>(
      'PUT',
      `/order/${sanitizePathParam(String(args.orderId))}/labor_bulk`,
      { data: { technicianId: args.technicianId }, ids: laborIds }
    );
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_timeclock(args) {
    const params: Record<string, string> = {};
    if (args.userId !== undefined) params.userId = String(args.userId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.startDate !== undefined) params.startDate = String(args.startDate);
    if (args.endDate !== undefined) params.endDate = String(args.endDate);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<TimeclockEntry[]>('GET', '/timeclock', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_users(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
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
