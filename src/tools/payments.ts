import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Payment } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_payments',
    description: 'List payments from Shopmonkey. Supports filtering and pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Filter payments by work order ID' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
    },
  },
  {
    name: 'get_payment',
    description: 'Get detailed information about a single payment by its ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The payment ID' } }, required: ['id'] },
  },
  {
    name: 'create_payment',
    description: 'Record a new payment in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Work order ID to apply the payment to' },
        amountCents: { type: 'number', description: 'Payment amount in integer cents. Example: $150.50 = 15050. NEVER send a decimal value.' },
        method: { type: 'string', description: 'Payment method (e.g., cash, credit_card, check)' },
        notes: { type: 'string', description: 'Additional notes about the payment' },
      },
      required: ['orderId', 'amountCents'],
    },
  },
];

const CREATE_FIELDS = ['orderId', 'amountCents', 'method', 'notes'];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async list_payments(args) {
    const params: Record<string, string> = {};
    if (args.orderId !== undefined) params.orderId = String(args.orderId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<Payment[]>('GET', '/payment', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_payment(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Payment>('GET', `/payment/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_payment(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (args.amountCents === undefined) return { content: [{ type: 'text', text: 'Error: amountCents is required' }], isError: true };
    if (!Number.isInteger(Number(args.amountCents)) || Number(args.amountCents) <= 0) {
      return { content: [{ type: 'text', text: 'Error: amountCents must be a positive integer (cents, not dollars). Example: $150.50 = 15050' }], isError: true };
    }
    const body = pickFields(args, CREATE_FIELDS);
    const data = await shopmonkeyRequest<Payment>('POST', '/payment', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
