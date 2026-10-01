import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, fetchAllRecordsPost, isWithinDateRange, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Labor, TimeclockEntry, User } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_labor',
    description: 'List the labor line items on a service. Labor is read from the service list for the order (GET /order/:orderId/service), where each service carries its `labors`. Both orderId and serviceId are required — call list_services with an orderId first to get the serviceId.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID the service belongs to' },
        serviceId: { type: 'string', description: 'The service ID to list labor line items for' },
      },
      required: ['orderId', 'serviceId'],
    },
  },
  {
    name: 'assign_technician',
    description: "Assign a technician to labor line items on a work order. Give it the orderId and a technicianId from list_users; omit laborIds to assign every labor line on the order. Each line is written individually, then the order is read back and the result reports per line whether the assignment actually persisted — this API accepts unknown or unsupported fields, ignores them, and still answers 200.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        orderId: { type: 'string', description: 'The work order ID the labor line items belong to' },
        laborIds: { type: 'array', items: { type: 'string' }, description: 'Labor line item IDs to assign. Omit to assign every labor line on the order.' },
        technicianId: { type: 'string', description: 'The technician/user ID to assign (from list_users)' },
      },
      required: ['orderId', 'technicianId'],
    },
  },
  {
    name: 'list_timeclock',
    description: 'List technician time clock entries via POST /timesheet/search. userId and locationId are sent to the API. Shopmonkey documents no date filter for time clock, so startDate/endDate are applied client-side on each entry\'s clockIn after paging (up to 1000 entries); check `truncated` in the result.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        userId: { type: 'string', description: 'Filter by user/technician ID' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        startDate: { type: 'string', description: 'Filter by start date (ISO 8601 format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO 8601 format)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
    },
  },
  {
    name: 'list_users',
    description: 'List shop users and technicians from Shopmonkey.',
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
    name: 'get_user',
    description: 'Get detailed information about a single shop user or technician by their ID.',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string', description: 'The user/technician ID' } }, required: ['id'] },
  },
];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

type Row = Record<string, unknown>;

/** Services for an order, each carrying its `labors` (GET /order/:orderId/service). */
async function fetchServices(orderId: string): Promise<Row[]> {
  const services = await shopmonkeyRequest<Row[]>('GET', `/order/${orderId}/service`);
  return Array.isArray(services) ? services : [];
}

function laborsOf(service: Row): Row[] {
  return Array.isArray(service.labors) ? (service.labors as Row[]) : [];
}

export const handlers: ToolHandlerMap = {
  // Shopmonkey documents no `GET .../labor` route. Labor arrives embedded in the
  // service list for the order, which is what CJVlady's fork reads; the nested
  // GET route v1.1.0 called is undocumented.
  async list_labor(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.serviceId) return { content: [{ type: 'text', text: 'Error: serviceId is required' }], isError: true };

    const services = await fetchServices(sanitizePathParam(String(args.orderId)));
    const service = services.find((s) => String(s.id ?? '') === String(args.serviceId));
    if (!service) return { content: [{ type: 'text', text: `Error: service ${String(args.serviceId)} not found on order ${String(args.orderId)}` }], isError: true };

    return { content: [{ type: 'text', text: JSON.stringify(laborsOf(service) as unknown as Labor[], null, 2) }] };
  },

  // Route: PUT /order/:orderId/service/:serviceId/labor/:id with { technicianId }
  // — documented on the Order page. Found first by ZanPope's fork; the read-back
  // verification and "omit laborIds for all lines" behaviour follow CJVlady's.
  // The earlier PUT /order/:orderId/labor_bulk is no longer documented and is
  // reported as "Route not found" on a live shop (see docs/API-PROVENANCE.md).
  async assign_technician(args) {
    if (!args.orderId) return { content: [{ type: 'text', text: 'Error: orderId is required' }], isError: true };
    if (!args.technicianId) return { content: [{ type: 'text', text: 'Error: technicianId is required' }], isError: true };

    const orderId = sanitizePathParam(String(args.orderId));
    const technicianId = String(args.technicianId);
    const requested = Array.isArray(args.laborIds) ? args.laborIds.map(String) : null;
    if (requested && requested.length === 0) {
      return { content: [{ type: 'text', text: 'Error: laborIds, when given, must be a non-empty array. Omit it to assign every labor line on the order.' }], isError: true };
    }

    // A labor id alone cannot address a line item: the route needs its service.
    const services = await fetchServices(orderId);
    const targets: { laborId: string; serviceId: string; name: string }[] = [];
    for (const svc of services) {
      const serviceId = String(svc.id ?? '');
      for (const lab of laborsOf(svc)) {
        const laborId = String(lab.id ?? '');
        if (!laborId || !serviceId) continue;
        if (requested && !requested.includes(laborId)) continue;
        targets.push({ laborId, serviceId, name: String(lab.name ?? '') });
      }
    }

    if (targets.length === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          error: 'no matching labor line items',
          detail: requested
            ? 'None of the given laborIds were found on this order. Check them with list_labor.'
            : 'This order has no labor line items yet. Add a service with labor first.',
        }, null, 2) }],
        isError: true,
      };
    }

    const results: Row[] = [];
    for (const t of targets) {
      try {
        await shopmonkeyRequest(
          'PUT',
          `/order/${orderId}/service/${sanitizePathParam(t.serviceId)}/labor/${sanitizePathParam(t.laborId)}`,
          { technicianId }
        );
        results.push({ laborId: t.laborId, name: t.name, assigned: false });
      } catch (err) {
        results.push({ laborId: t.laborId, name: t.name, assigned: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // A 200 is not evidence the technician was set; only the stored value is.
    const stored = new Map<string, unknown>();
    for (const svc of await fetchServices(orderId)) {
      for (const lab of laborsOf(svc)) stored.set(String(lab.id), lab.technicianId);
    }

    let confirmed = 0;
    for (const r of results) {
      const actual = stored.get(String(r.laborId));
      r.assigned = actual === technicianId;
      if (r.assigned) confirmed++;
      else if (!r.error) r.error = `technicianId is ${actual == null ? 'still unset' : String(actual)} after the write`;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({
        orderId: args.orderId,
        technicianId,
        laborLines: targets.length,
        confirmed,
        allConfirmed: confirmed === targets.length,
        results,
      }, null, 2) }],
      isError: confirmed === 0,
    };
  },

  // Route: POST /timesheet/search (documented on the Timeclock page). Documented
  // `where` fields are only inProgress / laborId / orderId / technicianId, and
  // `locationIds` is a top-level array. Route found independently by CJVlady.
  // UNVERIFIED: the technicianId `{ in: [...] }` and locationIds filters have not
  // been exercised against a live account.
  // Date ranges are deliberately NOT sent to the server: no date filter is
  // documented for this endpoint, and an undocumented one could be silently
  // ignored. `clockIn` is a documented response field, so dates are applied
  // here, after paging.
  async list_timeclock(args) {
    const body: Record<string, unknown> = {};
    if (args.userId !== undefined) body.where = { technicianId: { in: [String(args.userId)] } };
    const locationId = args.locationId !== undefined ? String(args.locationId) : getDefaultLocationId();
    if (locationId) body.locationIds = [locationId];

    const startDate = args.startDate !== undefined ? String(args.startDate) : undefined;
    const endDate = args.endDate !== undefined ? String(args.endDate) : undefined;

    let rows: TimeclockEntry[];
    let truncated = false;
    let filtering = 'server-side';
    if (startDate || endDate) {
      const all = await fetchAllRecordsPost<TimeclockEntry>('/timesheet/search', body);
      truncated = all.truncated;
      filtering = 'dates applied client-side on clockIn';
      const inRange = all.records.filter((e) => isWithinDateRange(e.clockIn, startDate, endDate));
      const skip = typeof args.skip === 'number' ? args.skip : 0;
      const limit = typeof args.limit === 'number' ? args.limit : 25;
      rows = inRange.slice(skip, skip + limit);
      return { content: [{ type: 'text', text: JSON.stringify({ filtering, truncated, scanned: all.records.length, matched: inRange.length, results: rows }, null, 2) }] };
    }

    if (args.limit !== undefined) body.limit = Number(args.limit);
    if (args.skip !== undefined) body.skip = Number(args.skip);
    rows = await shopmonkeyRequest<TimeclockEntry[]>('POST', '/timesheet/search', body);
    return { content: [{ type: 'text', text: JSON.stringify({ filtering, truncated, results: rows }, null, 2) }] };
  },

  async list_users(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.skip !== undefined) params.skip = String(args.skip);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<User[]>('GET', '/user', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_user(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<User>('GET', `/user/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
