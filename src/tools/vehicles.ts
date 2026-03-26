import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Vehicle } from '../types/shopmonkey.js';

export const definitions: Tool[] = [
  {
    name: 'list_vehicles',
    description: 'List vehicles from Shopmonkey. Filter by customer ID or location.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Filter vehicles by customer ID' },
        locationId: { type: 'string', description: 'Filter by location ID' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_vehicle',
    description: 'Get detailed information about a single vehicle by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The vehicle ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_vehicle',
    description: 'Add a new vehicle to Shopmonkey, optionally linked to a customer.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Customer ID to associate with the vehicle' },
        year: { type: 'number', description: 'Vehicle model year' },
        make: { type: 'string', description: 'Vehicle make (e.g., Toyota, Ford)' },
        model: { type: 'string', description: 'Vehicle model (e.g., Camry, F-150)' },
        vin: { type: 'string', description: 'Vehicle Identification Number' },
        licensePlate: { type: 'string', description: 'License plate number' },
        color: { type: 'string', description: 'Vehicle color' },
        mileage: { type: 'number', description: 'Current mileage' },
      },
    },
  },
  {
    name: 'update_vehicle',
    description: 'Update an existing vehicle\'s information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The vehicle ID to update' },
        customerId: { type: 'string', description: 'Customer ID to associate with the vehicle' },
        year: { type: 'number', description: 'Vehicle model year' },
        make: { type: 'string', description: 'Vehicle make' },
        model: { type: 'string', description: 'Vehicle model' },
        vin: { type: 'string', description: 'Vehicle Identification Number' },
        licensePlate: { type: 'string', description: 'License plate number' },
        color: { type: 'string', description: 'Vehicle color' },
        mileage: { type: 'number', description: 'Current mileage' },
      },
      required: ['id'],
    },
  },
];

const ALLOWED_FIELDS = ['customerId', 'year', 'make', 'model', 'vin', 'licensePlate', 'color', 'mileage'];

function pickFields(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {
  async list_vehicles(args) {
    const params: Record<string, string> = {};
    if (args.customerId !== undefined) params.customerId = String(args.customerId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<Vehicle[]>('GET', '/vehicle', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_vehicle(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Vehicle>('GET', `/vehicle/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_vehicle(args) {
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Vehicle>('POST', '/vehicle', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_vehicle(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Vehicle>('PATCH', `/vehicle/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
