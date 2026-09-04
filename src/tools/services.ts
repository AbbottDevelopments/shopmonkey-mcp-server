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
    description: 'List the services on a work order. Shopmonkey nests services under their order — there is no flat service list — so orderId is required.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID to list services for' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'add_service_to_order',
    description: 'Add a service to a work order. Pass fromCannedServiceId to copy an existing canned service template (its labor, parts, fees) onto the order in one call, or pass name/note/pricing to create a custom one-off service instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID to add the service to' },
        fromCannedServiceId: { type: 'string', description: 'ID of a canned service template to copy onto the order (labor/parts/fees included)' },
        name: { type: 'string', description: 'Service name (required if fromCannedServiceId is not given)' },
        note: { type: 'string', description: 'Additional notes for the service' },
        pricing: { type: 'string', enum: ['FixedPrice', 'LineItem'], description: 'Pricing model for a custom service' },
      },
      required: ['orderId'],
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
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
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
        hours: { type: 'number', description: 'Labor hours (e.g. 2.5)' },
        rateCents: { type: 'number', description: 'Billed labor rate per hour, in integer cents' },
        costRateCents: { type: 'number', description: 'Internal cost rate per hour, in integer cents' },
        note: { type: 'string', description: 'Additional notes' },
        taxable: { type: 'boolean', description: 'Whether this labor line is taxable' },
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
        hours: { type: 'number', description: 'Updated labor hours' },
        rateCents: { type: 'number', description: 'Updated billed rate per hour, in integer cents' },
        costRateCents: { type: 'number', description: 'Updated internal cost rate per hour, in integer cents' },
        note: { type: 'string', description: 'Additional notes' },
        taxable: { type: 'boolean', description: 'Whether this labor line is taxable' },
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
        quantity: { type: 'number', description: 'Quantity of parts' },
        retailCostCents: { type: 'number', description: 'Price charged to the customer, per unit, in integer cents' },
        wholesaleCostCents: { type: 'number', description: 'Cost paid to the vendor, per unit, in integer cents' },
        partNumber: { type: 'string', description: 'Vendor part number' },
        note: { type: 'string', description: 'Additional notes' },
        taxable: { type: 'boolean', description: 'Whether this part line is taxable' },
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
        quantity: { type: 'number', description: 'Updated quantity' },
        retailCostCents: { type: 'number', description: 'Updated customer price, per unit, in integer cents' },
        wholesaleCostCents: { type: 'number', description: 'Updated vendor cost, per unit, in integer cents' },
        partNumber: { type: 'string', description: 'Vendor part number' },
        note: { type: 'string', description: 'Additional notes' },
        taxable: { type: 'boolean', description: 'Whether this part line is taxable' },
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
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
      required: ['customerId'],
    },
  },
];

const CANNED_FIELDS = ['name', 'description', 'pricing', 'fixedPriceCents', 'bookable', 'recommended', 'lumpSum', 'express', 'locationId'];
const CANNED_UPDATE_FIELDS = ['name', 'description', 'pricing', 'fixedPriceCents', 'bookable', 'recommended', 'lumpSum', 'express'];
// Shopmonkey's line-item schemas differ per type. A single shared allowlist sent
// field names that Labor and Part do not have; the API ignores unknown body keys,
// applies its defaults and still returns 200, so hours and prices were silently
// dropped on write and corrections silently no-opped. Reported against a live
// account in issue #1 by audioedgeaz, where a 46-hour estimate worth roughly
// nineteen thousand dollars persisted as about two thousand.
const LABOR_FIELDS = ['name', 'hours', 'rateCents', 'costRateCents', 'note', 'taxable'];
const PART_FIELDS = ['name', 'quantity', 'retailCostCents', 'wholesaleCostCents', 'partNumber', 'note', 'taxable'];

// Fee, subcontract and tire keep the original pass-through allowlist. They are
// very likely affected the same way, but their schemas have not been verified
// against a live account, and guessing is what caused this bug in the first
// place. See docs/LIMITATIONS.md.
const LINE_ITEM_FIELDS = ['name', 'description', 'quantity', 'unitCostCents', 'unitPriceCents', 'taxableValueType', 'notes'];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

const ADD_SERVICE_FIELDS = ['fromCannedServiceId', 'name', 'note', 'pricing'];

export const handlers: ToolHandlerMap = {
  // ── Existing handlers ─────────────────────────────────────────────────────
  async list_services(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };

    const params: Record<string, string> = {};
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);

    const data = await shopmonkeyRequest<Service[]>(
      'GET',
      `/order/${sanitizePathParam(String(args.orderId))}/service`,
      undefined,
      params
    );
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async add_service_to_order(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.fromCannedServiceId && !args.name) {
      return { content: [{ type: 'text', text: 'Error: provide either fromCannedServiceId or name' }], isError: true };
    }

    const body = pickFields(args, ADD_SERVICE_FIELDS);
    const data = await shopmonkeyRequest<Service[]>(
      'POST',
      `/order/${sanitizePathParam(String(args.orderId))}/service`,
      [body] as unknown as Record<string, unknown>
    );
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_canned_services(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
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
    const body = pickFields(args, LABOR_FIELDS);
    const data = await shopmonkeyRequest<CannedServiceLabor>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/labor`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_labor(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, LABOR_FIELDS);
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
    const body = pickFields(args, PART_FIELDS);
    const data = await shopmonkeyRequest<CannedServicePart>('POST', `/canned_service/${sanitizePathParam(String(args.cannedServiceId))}/part`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_canned_service_part(args) {
    if (!args.cannedServiceId) return { content: [{ type: 'text', text: 'Error: cannedServiceId is required' }], isError: true };
    if (!args.itemId) return { content: [{ type: 'text', text: 'Error: itemId is required' }], isError: true };
    const body = pickFields(args, PART_FIELDS);
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
    if (args.skip !== undefined) params.skip = String(args.skip);
    const data = await shopmonkeyRequest<DeferredService[]>('GET', `/customer/${sanitizePathParam(String(args.customerId))}/deferred_service`, undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
