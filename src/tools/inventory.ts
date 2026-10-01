import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, fetchAllRecordsPost, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { InventoryPart, InventoryTire } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_inventory_parts',
    description: 'List parts from Shopmonkey inventory via POST /inventory_part/search. Supports pagination. The location filter is re-checked client-side because this API has been seen to accept filters and ignore them.',
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
    name: 'get_inventory_part',
    description: 'Get detailed information about a single inventory part by its ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The inventory part ID' } }, required: ['id'] },
  },
  {
    name: 'list_inventory_tires',
    description: 'List tires from Shopmonkey inventory via POST /inventory_tire/search. Supports pagination. The location filter is re-checked client-side because this API has been seen to accept filters and ignore them.',
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
    name: 'search_parts',
    description: 'Search inventory parts by name, part number, SKU or note. Shopmonkey documents no free-text filter for inventory, so this reads the inventory (up to 1000 records) and matches every word of the query client-side, case-insensitively. Check `truncated` in the result: if true, the match is over a partial inventory.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query for parts (name, part number, or description)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
      required: ['query'],
    },
  },
];

const SEARCH_CAP = 1000;

function resolveLocation(args: Record<string, unknown>): string | undefined {
  return args.locationId !== undefined ? String(args.locationId) : getDefaultLocationId();
}

function pagedBody(args: Record<string, unknown>, locationId: string | undefined): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (args.limit !== undefined) body.limit = Number(args.limit);
  if (args.skip !== undefined) body.skip = Number(args.skip);
  if (locationId) body.where = { locationId };
  return body;
}

/** Drops records that name a different location than the one asked for. */
function onlyLocation<T>(rows: T[], locationId: string | undefined): T[] {
  if (!locationId || !Array.isArray(rows)) return rows;
  return rows.filter((r) => {
    const loc = (r as Record<string, unknown>).locationId;
    return loc === undefined || loc === locationId;
  });
}

export const handlers: ToolHandlerMap = {
  // Routes: Shopmonkey documents inventory under `inventory_part` / `inventory_tire`
  // (underscore). The `/inventory/part` paths shipped before v1.2.0 appear in no
  // documentation. Confirmed independently by CJVlady's live testing.
  // UNVERIFIED: whether `where: { locationId }` is honoured on these search
  // endpoints — the docs type `where` only as "any". Hence the client-side recheck.
  async list_inventory_parts(args) {
    const locationId = resolveLocation(args);
    const data = await shopmonkeyRequest<InventoryPart[]>('POST', '/inventory_part/search', pagedBody(args, locationId));
    return { content: [{ type: 'text', text: JSON.stringify(onlyLocation(data, locationId), null, 2) }] };
  },

  async get_inventory_part(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<InventoryPart>('GET', `/inventory_part/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_inventory_tires(args) {
    const locationId = resolveLocation(args);
    const data = await shopmonkeyRequest<InventoryTire[]>('POST', '/inventory_tire/search', pagedBody(args, locationId));
    return { content: [{ type: 'text', text: JSON.stringify(onlyLocation(data, locationId), null, 2) }] };
  },

  async search_parts(args) {
    if (!args.query) return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
    const tokens = String(args.query).toLowerCase().match(/[a-z0-9.+-]{2,}/g) ?? [];
    if (tokens.length === 0) {
      return { content: [{ type: 'text', text: 'Error: query must contain at least one word of two or more characters' }], isError: true };
    }
    const limit = typeof args.limit === 'number' ? args.limit : 25;
    const skip = typeof args.skip === 'number' ? args.skip : 0;
    const locationId = resolveLocation(args);

    const { records, truncated } = await fetchAllRecordsPost<InventoryPart>(
      '/inventory_part/search',
      locationId ? { where: { locationId } } : undefined,
      { maxRecords: SEARCH_CAP }
    );
    const matches = onlyLocation(records, locationId).filter((part) => {
      const r = part as unknown as Record<string, unknown>;
      const haystack = [r.name, r.number, r.partNumber, r.sku, r.note, r.description]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query: String(args.query),
          filtering: 'client-side',
          scanned: records.length,
          truncated,
          matched: matches.length,
          results: matches.slice(skip, skip + limit),
        }, null, 2),
      }],
    };
  },
};
