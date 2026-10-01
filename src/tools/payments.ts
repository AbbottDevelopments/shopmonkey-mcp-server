import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, getDefaultLocationId } from '../client.js';
import type { Payment } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_payments',
    description: 'List payments from Shopmonkey via POST /integration/payment/search. Supports filtering by order and location, and pagination. Filters are re-checked client-side because this API has been seen to accept filters and ignore them.',
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

type PaymentRow = Record<string, unknown>;

function withDefaultLocation(where: Record<string, unknown>): void {
  if (!where.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) where.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  // Route: the only payment read Shopmonkey documents is
  // POST /integration/payment/search. The `GET /payment[/:id]` routes shipped
  // before v1.2.0 appear in no documentation; CJVlady's live testing found the
  // same replacement.
  // UNVERIFIED: whether `where: { orderId }` / `{ locationId }` / `{ id }` are
  // honoured (docs type `where` only as "any"), hence the client-side rechecks.
  async list_payments(args) {
    const where: Record<string, unknown> = {};
    if (args.orderId !== undefined) where.orderId = String(args.orderId);
    if (args.locationId !== undefined) where.locationId = String(args.locationId);
    withDefaultLocation(where);

    const body: Record<string, unknown> = {};
    if (Object.keys(where).length > 0) body.where = where;
    if (args.limit !== undefined) body.limit = Number(args.limit);
    if (args.skip !== undefined) body.skip = Number(args.skip);

    const data = await shopmonkeyRequest<Payment[]>('POST', '/integration/payment/search', body);
    const rows = Array.isArray(data)
      ? data.filter((p) => {
          const r = p as unknown as PaymentRow;
          return (where.orderId === undefined || r.orderId === undefined || r.orderId === where.orderId)
            && (where.locationId === undefined || r.locationId === undefined || r.locationId === where.locationId);
        })
      : data;
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },

  // Shopmonkey documents no read-by-id for payments, so this searches by id and
  // requires the returned record's id to match, rather than trusting the filter.
  async get_payment(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const id = String(args.id);
    const data = await shopmonkeyRequest<Payment[]>('POST', '/integration/payment/search', { where: { id }, limit: 1 });
    const payment = Array.isArray(data) ? data.find((p) => (p as unknown as PaymentRow).id === id) : undefined;
    if (!payment) return { content: [{ type: 'text', text: `Error: payment ${id} not found` }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(payment, null, 2) }] };
  },

  async create_payment(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (args.amountCents === undefined) return { content: [{ type: 'text', text: 'Error: amountCents is required' }], isError: true };
    if (!Number.isInteger(Number(args.amountCents)) || Number(args.amountCents) <= 0) {
      return { content: [{ type: 'text', text: 'Error: amountCents must be a positive integer (cents, not dollars). Example: $150.50 = 15050' }], isError: true };
    }
    const body = pickFields(args, CREATE_FIELDS);
    // UNVERIFIED and undocumented: POST /payment. The documented route is
    // POST /integration/payment/manual/charge, but its page lists no body
    // parameters, so its body cannot be built without guessing. Left as-is on
    // purpose — see docs/LIMITATIONS.md.
    const data = await shopmonkeyRequest<Payment>('POST', '/payment', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
