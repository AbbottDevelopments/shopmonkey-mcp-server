// Composite report tools aggregate Shopmonkey list endpoints client-side.
// Shopmonkey has no native /report endpoint — these tools compose the data from
// existing list endpoints (Option B, confirmed with client). Reports are capped at
// 100 records per call; use a tighter date range for high-volume shops.
// All tools return raw JSON (not Markdown) for downstream processing flexibility.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, getDefaultLocationId } from '../client.js';
import type { Order, Appointment } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'report_revenue_summary',
    description: 'Generate a revenue summary report for a date range. Aggregates orders by status and splits paid vs. unpaid revenue. Capped at 100 orders — use a tighter date range for high-volume shops.',
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
    description: 'Generate an appointment summary report for a date range. Counts appointments by confirmation status (Confirmed/Declined/NoResponse). Capped at 100 appointments.',
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
    description: 'List all open (unauthorized) estimates, showing their age in days. Useful for follow-up on stale estimates. Capped at 100 records.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
    },
  },
];

function getDefaultLocParam(): Record<string, string> {
  const params: Record<string, string> = { limit: '100' };
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
    params.startDate = String(args.startDate);
    params.endDate = String(args.endDate);

    const orders = await shopmonkeyRequest<Order[]>('GET', '/order', undefined, params);

    const breakdown: Record<string, { count: number; totalCostCents: number }> = {};
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
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async report_appointment_summary(args) {
    if (!args.startDate) return { content: [{ type: 'text', text: 'Error: startDate is required' }], isError: true };
    if (!args.endDate) return { content: [{ type: 'text', text: 'Error: endDate is required' }], isError: true };

    const params = getDefaultLocParam();
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    params.startDate = String(args.startDate);
    params.endDate = String(args.endDate);

    const appointments = await shopmonkeyRequest<Appointment[]>('GET', '/appointment', undefined, params);

    const breakdown: Record<string, { count: number }> = {
      Confirmed: { count: 0 },
      Declined: { count: 0 },
      NoResponse: { count: 0 },
    };

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
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async report_open_estimates(args) {
    const params = getDefaultLocParam();
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    params.status = 'Estimate';

    const orders = await shopmonkeyRequest<Order[]>('GET', '/order', undefined, params);

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
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};
