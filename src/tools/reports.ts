// Composite report tools aggregate Shopmonkey list endpoints client-side.
// Shopmonkey has no native /report endpoint — these tools compose the data from
// existing list endpoints. All tools return raw JSON (not Markdown) for
// downstream processing flexibility.
//
// These reports cannot narrow the date range at the API: Shopmonkey's flat list
// endpoints accept date params and ignore them. Order-based reports therefore
// page the full order list and filter here, reporting `truncated` when the
// safety cap is reached; the appointment report uses /appointment/search, whose
// structured where filter does work server-side. See docs/LIMITATIONS.md.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { fetchAllRecords, shopmonkeyRequest, getDefaultLocationId, isWithinDateRange, toDateRangeBoundary } from '../client.js';
import type { Order, Appointment } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'report_revenue_summary',
    description: 'Generate a revenue summary for orders INVOICED within a date range (filtered on invoicedDate, not order creation date). Aggregates by status and splits paid vs. unpaid revenue. Pages the full order list each call for a consistent total — check the returned `truncated` flag if the shop is very large.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Start date in ISO 8601 format (e.g., "2026-04-01")' },
        endDate: { type: 'string', description: 'End date in ISO 8601 format (e.g., "2026-04-30")' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'report_appointment_summary',
    description: 'Generate an appointment summary for a date range. Counts appointments by confirmation status (Confirmed/Declined/NoResponse). Uses the /appointment/search endpoint, which filters by date server-side.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        startDate: { type: 'string', description: 'Start date in ISO 8601 format (e.g., "2026-04-01")' },
        endDate: { type: 'string', description: 'End date in ISO 8601 format (e.g., "2026-04-30")' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'report_open_estimates',
    description: 'List all open (unauthorized) estimates, showing their age in days. Useful for follow-up on stale estimates. Pages the full estimate list each call; check the returned `truncated` flag if the shop is very large.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
    },
  },
];

const SEARCH_LIMIT = 500;

function getDefaultLocParam(): Record<string, string> {
  const params: Record<string, string> = {};
  const defaultId = getDefaultLocationId();
  if (defaultId) params.locationId = defaultId;
  return params;
}

export const handlers: ToolHandlerMap = {
  async report_revenue_summary(args) {
    if (!args.startDate) return { content: [{ type: 'text', text: 'Error: startDate is required' }], isError: true };
    if (!args.endDate) return { content: [{ type: 'text', text: 'Error: endDate is required' }], isError: true };

    const params = getDefaultLocParam();
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    // Filtered on invoicedDate, not createdDate: "revenue invoiced in August"
    // is not "orders created in August" — an order opened in July can be
    // invoiced in August. Orders never invoiced have no invoicedDate and are
    // correctly excluded from revenue.
    const { records: allOrders, truncated } = await fetchAllRecords<Order>('/order', params);
    const orders = allOrders.filter(o =>
      isWithinDateRange(o.invoicedDate as string | undefined, String(args.startDate), String(args.endDate))
    );

    // Null-prototype: the keys come from Shopmonkey's own status field, and a
    // value of __proto__ or constructor would otherwise reach Object.prototype.
    const breakdown: Record<string, { count: number; totalCostCents: number }> = Object.create(null);
    let totalCostCents = 0;
    let paidCostCents = 0;

    for (const order of orders) {
      const status = String(order.status ?? 'Unknown');
      const cost = Number(order.totalCostCents ?? 0);

      totalCostCents += cost;
      if (order.paid) paidCostCents += cost;

      if (!breakdown[status]) breakdown[status] = { count: 0, totalCostCents: 0 };
      breakdown[status].count += 1;
      breakdown[status].totalCostCents += cost;
    }

    const result = {
      period: { startDate: args.startDate, endDate: args.endDate },
      totals: {
        totalCostCents,
        paidCostCents,
        unpaidCostCents: totalCostCents - paidCostCents,
      },
      breakdown,
      count: orders.length,
      scannedOrders: allOrders.length,
      truncated,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async report_appointment_summary(args) {
    if (!args.startDate) return { content: [{ type: 'text', text: 'Error: startDate is required' }], isError: true };
    if (!args.endDate) return { content: [{ type: 'text', text: 'Error: endDate is required' }], isError: true };

    const params = getDefaultLocParam();
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    // /appointment/search honours a structured where filter, unlike the flat
    // GET /appointment list, so the date range is applied server-side here.
    const where = {
      startDate: {
        gte: toDateRangeBoundary(String(args.startDate), 'start'),
        lte: toDateRangeBoundary(String(args.endDate), 'end'),
      },
    };
    const found = await shopmonkeyRequest<Appointment[]>('POST', '/appointment/search', { where, limit: SEARCH_LIMIT });
    const truncated = found.length >= SEARCH_LIMIT;

    const locationId = args.locationId !== undefined ? String(args.locationId) : getDefaultLocationId();
    const appointments = locationId ? found.filter(a => a.locationId === locationId) : found;

    // Null-prototype, as above: confirmationStatus is API-supplied.
    const breakdown: Record<string, { count: number }> = Object.create(null);
    breakdown.Confirmed = { count: 0 };
    breakdown.Declined = { count: 0 };
    breakdown.NoResponse = { count: 0 };

    for (const appt of appointments) {
      const status = String(appt.confirmationStatus ?? 'NoResponse');
      if (breakdown[status]) {
        breakdown[status].count += 1;
      } else {
        breakdown[status] = { count: 1 };
      }
    }

    const result = {
      period: { startDate: args.startDate, endDate: args.endDate },
      totals: { count: appointments.length },
      breakdown,
      truncated,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async report_open_estimates(args) {
    const params = getDefaultLocParam();
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    params.status = 'Estimate';

    const { records: orders, truncated } = await fetchAllRecords<Order>('/order', params);

    const now = new Date();
    const openEstimates = orders
      .filter(o => o.authorized === false)
      .map(o => {
        const created = o.createdDate ? new Date(String(o.createdDate)) : null;
        const ageInDays = created ? Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)) : null;
        return { ...o, ageInDays };
      });

    const oldestAgeInDays = openEstimates.reduce((max, o) => {
      const age = o.ageInDays ?? 0;
      return age > max ? age : max;
    }, 0);

    const result = {
      orders: openEstimates,
      count: openEstimates.length,
      oldestAgeInDays,
      truncated,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};
