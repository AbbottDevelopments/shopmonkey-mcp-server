import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, fetchAllRecords, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Order } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_orders',
    description: 'List work orders from Shopmonkey. Filter by status, customer ID or location. Shopmonkey ignores the status and customer filters on this endpoint, so when either is given the order list is paged (up to 1000 orders) and filtered client-side; the result then reports `truncated`. With no status or customer filter the first page is returned as a plain array.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'Filter by order status' },
        customerId: { type: 'string', description: 'Filter orders by customer ID' },
        locationId: { type: 'string', description: 'Filter by location ID (for multi-location shops). Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get detailed information about a single work order by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The work order ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_order',
    description: 'Create a new work order in Shopmonkey. The create endpoint takes no `status`, so when one is requested the order is created and then corrected with a follow-up update; the result reports what was corrected and anything that still did not stick.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'Customer ID to associate with the order' },
        vehicleId: { type: 'string', description: 'Vehicle ID to associate with the order' },
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'Initial order status' },
        locationId: { type: 'string', description: 'Location ID for multi-location shops. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        name: { type: 'string', description: 'Order title shown on the work order (e.g. "Front brake job")' },
        complaint: { type: 'string', description: "Customer's stated concern — the order-level note for what the customer told you." },
        recommendation: { type: 'string', description: 'Shop recommendation / suggested approach, stored alongside the complaint.' },
        workflowStatusId: { type: 'string', description: 'Workflow (board) stage to place the order in. Get ids from list_workflow_statuses.' },
      },
    },
  },
  {
    name: 'update_order',
    description: 'Update fields on an existing work order, including its complaint and recommendation notes. The stored order in the response is compared with what was sent and the result reports which fields persisted — this API accepts unsupported fields, ignores them, and still answers 200.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The work order ID to update' },
        status: { type: 'string', enum: ['Estimate', 'RepairOrder', 'Invoice'], description: 'New order status' },
        customerId: { type: 'string', description: 'New customer ID' },
        vehicleId: { type: 'string', description: 'New vehicle ID' },
        name: { type: 'string', description: 'New order title' },
        complaint: { type: 'string', description: "Customer's stated concern — the order-level note for what the customer told you." },
        recommendation: { type: 'string', description: 'Shop recommendation / suggested approach.' },
        workflowStatusId: { type: 'string', description: 'Move the order to this workflow (board) stage. Get ids from list_workflow_statuses.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_service',
    description: "Update a service already on a work order — its note or name. Use this to set a service note: add_service_to_order's note can be overwritten by a copied canned service's own note. The write is verified by reading the service back.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID the service belongs to' },
        serviceId: { type: 'string', description: 'The service ID to update (from list_services)' },
        note: { type: 'string', description: 'Service note text' },
        name: { type: 'string', description: 'Service name' },
      },
      required: ['orderId', 'serviceId'],
    },
  },
];

// Body fields are those Shopmonkey documents for PUT /order/:id and POST /order.
// `status` is documented for PUT only — POST /order has no `status` field.
// `complaint` / `recommendation` / `workflowStatusId` are documented on both.
// (`complaint`, `recommendation` and the create-ignores-status behaviour were
// surfaced by CJVlady's fork; `workflowStatusId` by ZanPope's.)
const UPDATE_FIELDS = ['status', 'customerId', 'vehicleId', 'name', 'complaint', 'recommendation', 'workflowStatusId'];
const CREATE_FIELDS = ['customerId', 'vehicleId', 'locationId', 'name', 'complaint', 'recommendation', 'workflowStatusId'];

/** Fields whose stored value is compared with what was sent. */
const VERIFIED_FIELDS = ['status', 'name', 'complaint', 'recommendation', 'customerId', 'vehicleId', 'workflowStatusId'];

type Row = Record<string, unknown>;

function diffApplied(sent: Row, stored: Row): { applied: string[]; ignored: Row } {
  const applied: string[] = [];
  const ignored: Row = {};
  for (const key of VERIFIED_FIELDS) {
    if (!(key in sent)) continue;
    if (stored[key] === sent[key]) applied.push(key);
    else ignored[key] = { requested: sent[key], stored: stored[key] ?? null };
  }
  return { applied, ignored };
}

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

function jsonResult(payload: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], ...(isError ? { isError: true } : {}) };
}

export const handlers: ToolHandlerMap = {
  // Issue #6: GET /order accepts `status` and `customerId` and ignores both.
  // No server-side alternative is known (POST /order/search does not exist), so
  // when either filter is given the list is paged and filtered here.
  async list_orders(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    applyDefaultLocation(params);

    const status = args.status !== undefined ? String(args.status) : undefined;
    const customerId = args.customerId !== undefined ? String(args.customerId) : undefined;

    if (status === undefined && customerId === undefined) {
      if (args.limit !== undefined) params.limit = String(args.limit);
      if (args.skip !== undefined) params.skip = String(args.skip);
      const data = await shopmonkeyRequest<Order[]>('GET', '/order', undefined, params);
      return jsonResult(data);
    }

    const { records, truncated } = await fetchAllRecords<Order>('/order', params);
    const matched = records.filter((o) => {
      const r = o as unknown as Row;
      return (status === undefined || r.status === status) && (customerId === undefined || r.customerId === customerId);
    });
    const skip = typeof args.skip === 'number' ? args.skip : 0;
    const limit = typeof args.limit === 'number' ? args.limit : 25;
    return jsonResult({
      filtering: 'client-side',
      scanned: records.length,
      truncated,
      matched: matched.length,
      results: matched.slice(skip, skip + limit),
    });
  },

  async get_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Order>('GET', `/order/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_order(args) {
    const body = pickFields(args, CREATE_FIELDS);
    if (!body.locationId) {
      const defaultId = getDefaultLocationId();
      if (defaultId) body.locationId = defaultId;
    }
    let order = await shopmonkeyRequest<Order>('POST', '/order', body);
    let stored = order as unknown as Row;
    const id = String(stored.id ?? '');

    // POST /order has no `status` field, so a requested status is applied with a
    // follow-up PUT rather than sent and silently dropped.
    const corrections: string[] = [];
    const wantedStatus = args.status !== undefined ? String(args.status) : undefined;
    if (id && wantedStatus !== undefined && stored.status !== wantedStatus) {
      order = await shopmonkeyRequest<Order>('PUT', `/order/${sanitizePathParam(id)}`, { status: wantedStatus });
      stored = order as unknown as Row;
      corrections.push('status');
    }

    const { ignored } = diffApplied({ ...body, ...(wantedStatus !== undefined ? { status: wantedStatus } : {}) }, stored);
    return jsonResult({
      created: true,
      id: stored.id,
      number: stored.number,
      correctedAfterCreate: corrections,
      stillNotApplied: Object.keys(ignored).length > 0 ? ignored : undefined,
      order,
    });
  },

  async update_order(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, UPDATE_FIELDS);
    if (Object.keys(body).length === 0) {
      return { content: [{ type: 'text', text: 'Error: nothing to update — pass at least one field' }], isError: true };
    }
    const order = await shopmonkeyRequest<Order>('PUT', `/order/${sanitizePathParam(String(args.id))}`, body);
    const { applied, ignored } = diffApplied(body, order as unknown as Row);
    return jsonResult({
      id: args.id,
      applied,
      ignored: Object.keys(ignored).length > 0 ? ignored : undefined,
      allApplied: Object.keys(ignored).length === 0,
      order,
    }, applied.length === 0);
  },

  // PUT /order/:orderId/service/:id is documented (body includes `name`, `note`).
  // The read-back uses the service list because that is where services reliably
  // appear. Tool concept from CJVlady's fork.
  async update_service(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.serviceId) return { content: [{ type: 'text', text: 'Error: serviceId is required' }], isError: true };

    const orderId = sanitizePathParam(String(args.orderId));
    const body = pickFields(args, ['name', 'note']);
    if (Object.keys(body).length === 0) {
      return { content: [{ type: 'text', text: 'Error: pass a name or a note to change' }], isError: true };
    }

    await shopmonkeyRequest('PUT', `/order/${orderId}/service/${sanitizePathParam(String(args.serviceId))}`, body);

    const services = await shopmonkeyRequest<Row[]>('GET', `/order/${orderId}/service`);
    const found = (Array.isArray(services) ? services : []).find((x) => String(x.id) === String(args.serviceId));

    const applied: string[] = [];
    const ignored: Row = {};
    for (const key of Object.keys(body)) {
      if (found && found[key] === body[key]) applied.push(key);
      else ignored[key] = { requested: body[key], stored: found ? found[key] ?? null : 'service not found after update' };
    }
    return jsonResult({
      orderId: args.orderId,
      serviceId: args.serviceId,
      applied,
      ignored: Object.keys(ignored).length > 0 ? ignored : undefined,
      allApplied: Object.keys(ignored).length === 0,
      service: found ?? null,
    }, applied.length === 0);
  },
};
