import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, getDefaultLocationId } from '../client.js';
import type { WorkflowStatus, Location } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'list_workflow_statuses',
    description: 'List workflow/pipeline status stages from Shopmonkey. Shows the progression stages work orders move through.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
      },
    },
  },
  {
    name: 'list_locations',
    description: 'List all shop locations in Shopmonkey. Useful for multi-location shops to identify location IDs for filtering other resources.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        page: { type: 'number', description: 'Page number for pagination (default: 1)' },
      },
    },
  },
];

function applyDefaultLocation(params: Record<string, string>): void {
  if (!params.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) params.locationId = defaultId;
  }
}

export const handlers: ToolHandlerMap = {
  async list_workflow_statuses(args) {
    const params: Record<string, string> = {};
    if (args.locationId !== undefined) params.locationId = String(args.locationId);
    applyDefaultLocation(params);

    const data = await shopmonkeyRequest<WorkflowStatus[]>('GET', '/workflow_status', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async list_locations(args) {
    const params: Record<string, string> = {};
    if (args.limit !== undefined) params.limit = String(args.limit);
    if (args.page !== undefined) params.page = String(args.page);

    const data = await shopmonkeyRequest<Location[]>('GET', '/location', undefined, params);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
