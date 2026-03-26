import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { Payment } from '../types/shopmonkey.js';

export const definitions: Tool[] = [
  {
    name: 'list_payments',
    description: 'List payments from Shopmonkey. Supports filtering and pagination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Filter payments by work order ID' },
        locationId: { type: 'string', description: 'Filter by location ID' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'get_payment',
    description: 'Get detailed information about a single payment by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The payment ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_payment',
    description: 'Record a new payment in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Work order ID to apply the payment to' },
        amount: { type: 'number', description: 'Payment amount in dollars' },
        method: { type: 'string', description: 'Payment method (e.g., cash, credit_card, check)' },
        notes: { type: 'string', description: 'Additional notes about the payment' },
      },
      required: ['orderId', 'amount'],
    },
  },
];

const CREATE_FIELDS = ['orderId', 'amount', 'method', 'notes'];

function pickFields(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {
  async list_payments(args) {
    const params: Record<string, string> = {};
    if (args.orderId !== undefined) params.orderId = String(args.orderId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

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
    if (args.amount === undefined) return { content: [{ type: 'text', text: 'Error: amount is required' }], isError: true };
    const body = pickFields(args, CREATE_FIELDS);
    const data = await shopmonkeyRequest<Payment>('POST', '/payment', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
