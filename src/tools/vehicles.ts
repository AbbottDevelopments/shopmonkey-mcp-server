import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Vehicle } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'get_vehicle',
    description: 'Get detailed information about a single vehicle by its ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The vehicle ID' } }, required: ['id'] },
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
  {
    name: 'list_vehicles_for_customer',
    description: 'List all vehicles associated with a specific customer.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'The customer ID whose vehicles to list' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'lookup_vehicle_by_vin',
    description: 'Look up a vehicle in Shopmonkey by its VIN (Vehicle Identification Number).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        vin: { type: 'string', description: 'The Vehicle Identification Number to look up' },
      },
      required: ['vin'],
    },
  },
  {
    name: 'lookup_vehicle_by_plate',
    description: 'Look up a vehicle in Shopmonkey by its license plate and region.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        region: { type: 'string', description: 'Region/state code (e.g., US-CA, US-TX)' },
        plate: { type: 'string', description: 'License plate number' },
      },
      required: ['region', 'plate'],
    },
  },
  {
    name: 'list_vehicle_owners',
    description: 'List all customers who own or are associated with a specific vehicle.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        vehicleId: { type: 'string', description: 'The vehicle ID to list owners for' },
      },
      required: ['vehicleId'],
    },
  },
];

const ALLOWED_FIELDS = ['customerId', 'year', 'make', 'model', 'vin', 'licensePlate', 'color', 'mileage'];

export const handlers: ToolHandlerMap = {
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
    const data = await shopmonkeyRequest<Vehicle>('PUT', `/vehicle/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_vehicles_for_customer(args) {
    if (!args.customerId) return { content: [{ type: 'text', text: 'Error: customerId is required' }], isError: true };
    const params: Record<string, string> = {};
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
    const data = await shopmonkeyRequest<Vehicle[]>('GET', `/customer/${sanitizePathParam(String(args.customerId))}/vehicle`, undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async lookup_vehicle_by_vin(args) {
    if (!args.vin) return { content: [{ type: 'text', text: 'Error: vin is required' }], isError: true };
    const data = await shopmonkeyRequest<Vehicle>('GET', `/vehicle/vin/${sanitizePathParam(String(args.vin))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async lookup_vehicle_by_plate(args) {
    if (!args.region) return { content: [{ type: 'text', text: 'Error: region is required' }], isError: true };
    if (!args.plate) return { content: [{ type: 'text', text: 'Error: plate is required' }], isError: true };
    const data = await shopmonkeyRequest<Vehicle>('GET', `/vehicle/license_plate/${sanitizePathParam(String(args.region))}/${sanitizePathParam(String(args.plate))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_vehicle_owners(args) {
    if (!args.vehicleId) return { content: [{ type: 'text', text: 'Error: vehicleId is required' }], isError: true };
    const data = await shopmonkeyRequest<unknown[]>('GET', `/vehicle/${sanitizePathParam(String(args.vehicleId))}/owners`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
