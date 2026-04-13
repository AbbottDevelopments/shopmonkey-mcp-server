// Email and phone are sub-resources in Shopmonkey. After creating a customer, use POST /v3/customer/:id/email
// and POST /v3/customer/:id/phone_number to attach contact info. Those sub-resource tools are tracked in Spec 2.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Customer } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'search_customers',
    description: 'Search customers in Shopmonkey by query string. Supports full-body search with pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query to filter customers by name or other fields' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
    },
  },
  {
    name: 'search_customers_by_email',
    description: 'Search for a customer in Shopmonkey by email address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string', description: 'Customer email address to search for' },
      },
      required: ['email'],
    },
  },
  {
    name: 'search_customers_by_phone',
    description: 'Search for a customer in Shopmonkey by phone number.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        phoneNumber: { type: 'string', description: 'Customer phone number to search for' },
      },
      required: ['phoneNumber'],
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
        address: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
      },
      required: ['id'],
    },
  },
];

const ALLOWED_FIELDS = ['firstName', 'lastName', 'address', 'city', 'state', 'zip'];
const SEARCH_FIELDS = ['query', 'limit', 'skip', 'locationId'];

function applyDefaultLocation(body: Record<string, unknown>): void {
  if (!body.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) body.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async search_customers(args) {
    const body = pickFields(args, SEARCH_FIELDS);
    applyDefaultLocation(body);
    const data = await shopmonkeyRequest<Customer[]>('POST', '/customer/search', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async search_customers_by_email(args) {
    if (!args.email) return { content: [{ type: 'text', text: 'Error: email is required' }], isError: true };
    const data = await shopmonkeyRequest<Customer[]>('POST', '/customer/email/search', { email: args.email });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async search_customers_by_phone(args) {
    if (!args.phoneNumber) return { content: [{ type: 'text', text: 'Error: phoneNumber is required' }], isError: true };
    const data = await shopmonkeyRequest<Customer[]>('POST', '/customer/phone_number/search', { phoneNumber: args.phoneNumber });
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
    const data = await shopmonkeyRequest<Customer>('PUT', `/customer/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
