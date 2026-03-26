import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Customer } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_customers',
    description: 'List customers from Shopmonkey. Supports search and pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query to filter customers by name, email, or phone' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_customer',
    description: 'Get detailed information about a single customer by their ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The customer ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        firstName: { type: 'string', description: 'Customer first name' },
        lastName: { type: 'string', description: 'Customer last name' },
        email: { type: 'string', description: 'Customer email address' },
        phone: { type: 'string', description: 'Customer phone number' },
        address: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
      },
    },
  },
  {
    name: 'update_customer',
    description: 'Update an existing customer\'s information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The customer ID to update' },
        firstName: { type: 'string', description: 'Customer first name' },
        lastName: { type: 'string', description: 'Customer last name' },
        email: { type: 'string', description: 'Customer email address' },
        phone: { type: 'string', description: 'Customer phone number' },
        address: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
      },
      required: ['id'],
    },
  },
];

const ALLOWED_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip'];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async list_customers(args) {
    const params: Record<string, string> = {};
    if (args.query !== undefined) params.query = String(args.query);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<Customer[]>('GET', '/customer', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_customer(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Customer>('GET', `/customer/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_customer(args) {
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Customer>('POST', '/customer', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_customer(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Customer>('PATCH', `/customer/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
