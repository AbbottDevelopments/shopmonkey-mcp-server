// list_customer_deferred_services is placed here (not customers.ts) because it surfaces
// service-level data (recommended work not yet performed) and fits the services context.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Service, CannedService, CannedServiceFee, CannedServiceLabor, CannedServicePart, CannedServiceSubcontract, CannedServiceTire, DeferredService } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  // ── Existing tools ────────────────────────────────────────────────────────
  {
    name: 'list_services',
    description: 'List services on work orders in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'Filter services by work order ID' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
  {
    name: 'list_canned_services',
    description: 'List pre-built canned service templates from Shopmonkey. These are reusable service templates that can be added to work orders.',
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
    name: 'get_canned_service',
    description: 'Get detailed information about a single canned service template by its ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The canned service ID' } }, required: ['id'] },
  },

  // ── Task 12: Canned service CRUD ──────────────────────────────────────────
  {
    name: 'create_canned_service',
    description: 'Create a new canned service template in Shopmonkey. Canned services are reusable service bundles that can be added to work orders.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the canned service (e.g., "Full Synthetic Oil Change")' },
        description: { type: 'string', description: 'Description of the service' },
        pricing: { type: 'string', enum: ['FixedPrice', 'LineItem'], description: 'Pricing model: FixedPrice uses fixedPriceCents; LineItem sums its line items' },
        fixedPriceCents: { type: 'number', description: 'Fixed price in integer cents (e.g., $59.99 = 5999). Only applicable when pricing is FixedPrice.' },
        bookable: { type: 'boolean', description: 'Whether customers can book this service online' },
        recommended: { type: 'boolean', description: 'Whether to show this as a recommended service' },
        lumpSum: { type: 'boolean', description: 'Whether to display as a single lump-sum price on the work order' },
        express: { type: 'boolean', description: 'Whether this is an express service' },
        locationId: { type: 'string', description: 'Location ID to associate the service with. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
    },
  },
  {
    name: 'update_canned_service',
    description: 'Update an existing canned service template by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The canned service ID to update' },
        name: { type: 'string', description: 'Updated name' },
        description: { type: 'string', description: 'Updated description' },
        pricing: { type: 'string', enum: ['FixedPrice', 'LineItem'], description: 'Pricing model: FixedPrice or LineItem' },
        fixedPriceCents: { type: 'number', description: 'Updated fixed price in integer cents' },
        bookable: { type: 'boolean', description: 'Whether customers can book this service online' },
        recommended: { type: 'boolean', description: 'Whether to show as recommended' },
        lumpSum: { type: 'boolean', description: 'Whether to display as a lump-sum price' },
        express: { type: 'boolean', description: 'Whether this is an express service' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_canned_service',
    description: 'Delete a canned service template by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The canned service ID to delete' },
      },
      required: ['id'],
    },
  },

  // ── Task 13: Line-item tools (5 types × 3 ops = 15) ──────────────────────
  // Fee line items
  {
    name: 'add_canned_service_fee',
    description: 'Add a fee line item to an existing canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID to add the fee to' },
        name: { type: 'string', description: 'Fee name' },
        description: { type: 'string', description: 'Fee description' },
        quantity: { type: 'number', description: 'Quantity' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId'],
    },
  },
  {
    name: 'update_canned_service_fee',
    description: 'Update a fee line item on a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The fee line item ID to update' },
        name: { type: 'string', description: 'Updated fee name' },
        description: { type: 'string', description: 'Updated description' },
        quantity: { type: 'number', description: 'Updated quantity' },
        unitCostCents: { type: 'number', description: 'Updated unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Updated unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  {
    name: 'remove_canned_service_fee',
    description: 'Remove a fee line item from a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The fee line item ID to remove' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  // Labor line items
  {
    name: 'add_canned_service_labor',
    description: 'Add a labor line item to an existing canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID to add labor to' },
        name: { type: 'string', description: 'Labor name' },
        description: { type: 'string', description: 'Labor description' },
        quantity: { type: 'number', description: 'Hours or quantity' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId'],
    },
  },
  {
    name: 'update_canned_service_labor',
    description: 'Update a labor line item on a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The labor line item ID to update' },
        name: { type: 'string', description: 'Updated labor name' },
        description: { type: 'string', description: 'Updated description' },
        quantity: { type: 'number', description: 'Updated hours or quantity' },
        unitCostCents: { type: 'number', description: 'Updated unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Updated unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  {
    name: 'remove_canned_service_labor',
    description: 'Remove a labor line item from a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The labor line item ID to remove' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  // Part line items
  {
    name: 'add_canned_service_part',
    description: 'Add a part line item to an existing canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID to add the part to' },
        name: { type: 'string', description: 'Part name' },
        description: { type: 'string', description: 'Part description' },
        quantity: { type: 'number', description: 'Quantity of parts' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId'],
    },
  },
  {
    name: 'update_canned_service_part',
    description: 'Update a part line item on a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The part line item ID to update' },
        name: { type: 'string', description: 'Updated part name' },
        description: { type: 'string', description: 'Updated description' },
        quantity: { type: 'number', description: 'Updated quantity' },
        unitCostCents: { type: 'number', description: 'Updated unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Updated unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  {
    name: 'remove_canned_service_part',
    description: 'Remove a part line item from a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The part line item ID to remove' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  // Subcontract line items
  {
    name: 'add_canned_service_subcontract',
    description: 'Add a subcontract line item to an existing canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID to add the subcontract to' },
        name: { type: 'string', description: 'Subcontract name' },
        description: { type: 'string', description: 'Subcontract description' },
        quantity: { type: 'number', description: 'Quantity' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId'],
    },
  },
  {
    name: 'update_canned_service_subcontract',
    description: 'Update a subcontract line item on a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The subcontract line item ID to update' },
        name: { type: 'string', description: 'Updated subcontract name' },
        description: { type: 'string', description: 'Updated description' },
        quantity: { type: 'number', description: 'Updated quantity' },
        unitCostCents: { type: 'number', description: 'Updated unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Updated unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  {
    name: 'remove_canned_service_subcontract',
    description: 'Remove a subcontract line item from a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The subcontract line item ID to remove' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  // Tire line items
  {
    name: 'add_canned_service_tire',
    description: 'Add a tire line item to an existing canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID to add the tire to' },
        name: { type: 'string', description: 'Tire name or description' },
        description: { type: 'string', description: 'Additional description' },
        quantity: { type: 'number', description: 'Number of tires' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId'],
    },
  },
  {
    name: 'update_canned_service_tire',
    description: 'Update a tire line item on a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The tire line item ID to update' },
        name: { type: 'string', description: 'Updated tire name' },
        description: { type: 'string', description: 'Updated description' },
        quantity: { type: 'number', description: 'Updated quantity' },
        unitCostCents: { type: 'number', description: 'Updated unit cost in integer cents' },
        unitPriceCents: { type: 'number', description: 'Updated unit price in integer cents' },
        taxableValueType: { type: 'string', description: 'Taxable value type' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },
  {
    name: 'remove_canned_service_tire',
    description: 'Remove a tire line item from a canned service template.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cannedServiceId: { type: 'string', description: 'The canned service ID' },
        itemId: { type: 'string', description: 'The tire line item ID to remove' },
      },
      required: ['cannedServiceId', 'itemId'],
    },
  },

  // ── Task 14: Deferred services ────────────────────────────────────────────
  {
    name: 'list_customer_deferred_services',
    description: 'List deferred services (recommended-but-not-yet-performed work) for a customer. Useful for revenue-opportunity surfacing in chat.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: 'The customer ID to list deferred services for' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
      required: ['customerId'],
    },
  },
];

const CANNED_FIELDS = ['name', 'description', 'pricing', 'fixedPriceCents', 'bookable', 'recommended', 'lumpSum', 'express', 'locationId'];
const CANNED_UPDATE_FIELDS = ['name', 'description', 'pricing', 'fixedPriceCents', 'bookable', 'recommended', 'lumpSum', 'express'];
const LINE_ITEM_FIELDS = ['name', 'description', 'quantity', 'unitCostCents', 'unitPriceCents', 'taxableValueType', 'notes'];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  // ── Existing handlers ─────────────────────────────────────────────────────
  async list_services(args) {
    const params: Record<string, string> = {};
    if (args.orderId !== undefined) params.orderId = String(args.orderId);
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<Service[]>('GET', '/service', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_canned_services(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<CannedService[]>('GET', '/canned_service', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_canned_service(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<CannedService>('GET', `/canned_service/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  // ── Task 12: Canned service CRUD ──────────────────────────────────────────
  async create_canned_service(args) {
    if (!args.name) return { content: [{ type: 'text', text: 'Error: name is required' }], isError: true };
    const body = pickFields(args, CANNED_FIELDS) as Record<string, unknown>;
    if (!body.locationId) {
      const defaultId = getDefaultLocationId();
      if (defaultId) body.locationId = defaultId;
    }
    const data = await shopmonkeyRequest<CannedService>('POST', '/canned_service', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, CANNED_UPDATE_FIELDS);
    const data = await shopmonkeyRequest<CannedService>('PUT', `/canned_service/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async delete_canned_service(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: `Canned service ${String(args.id)} deleted successfully` }] };
  },

  // ── Task 13: Line-item handlers ───────────────────────────────────────────
  // Fee
  async add_canned_service_fee(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceFee>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/fee`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_fee(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceFee>('PUT', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/fee/${sanitizePathParam(String(args.itemId))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async remove_canned_service_fee(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/fee/${sanitizePathParam(String(args.itemId))}`);
    return { content: [{ type: 'text', text: `Fee ${String(args.itemId)} removed from canned service ${String(args.cannedServiceId)}` }] };
  },

  // Labor
  async add_canned_service_labor(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceLabor>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/labor`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_labor(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceLabor>('PUT', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/labor/${sanitizePathParam(String(args.itemId))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async remove_canned_service_labor(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/labor/${sanitizePathParam(String(args.itemId))}`);
    return { content: [{ type: 'text', text: `Labor ${String(args.itemId)} removed from canned service ${String(args.cannedServiceId)}` }] };
  },

  // Part
  async add_canned_service_part(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServicePart>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/part`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_part(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServicePart>('PUT', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/part/${sanitizePathParam(String(args.itemId))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async remove_canned_service_part(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/part/${sanitizePathParam(String(args.itemId))}`);
    return { content: [{ type: 'text', text: `Part ${String(args.itemId)} removed from canned service ${String(args.cannedServiceId)}` }] };
  },

  // Subcontract
  async add_canned_service_subcontract(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceSubcontract>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/subcontract`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_subcontract(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceSubcontract>('PUT', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/subcontract/${sanitizePathParam(String(args.itemId))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async remove_canned_service_subcontract(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/subcontract/${sanitizePathParam(String(args.itemId))}`);
    return { content: [{ type: 'text', text: `Subcontract ${String(args.itemId)} removed from canned service ${String(args.cannedServiceId)}` }] };
  },

  // Tire
  async add_canned_service_tire(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceTire>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/tire`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_tire(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LINE_ITEM_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceTire>('PUT', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/tire/${sanitizePathParam(String(args.itemId))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async remove_canned_service_tire(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    await shopmonkeyRequest<void>('DELETE', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/tire/${sanitizePathParam(String(args.itemId))}`);
    return { content: [{ type: 'text', text: `Tire ${String(args.itemId)} removed from canned service ${String(args.cannedServiceId)}` }] };
  },

  // ── Task 14: Deferred services ────────────────────────────────────────────
  async list_customer_deferred_services(args) {
    if (!args.customerId) return { content: [{ type: 'text', text: 'Error: customerId is required' }], isError: true };
    const params: Record<string, string> = {};
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);
    const data = await shopmonkeyRequest<DeferredService[]>('GET', `/customer/${sanitizePathParam(String(args.customerId))}/deferred_service`, undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
