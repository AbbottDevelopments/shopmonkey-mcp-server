import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandlerMap } from './types/tools.js';

import * as orders from './tools/orders.js';
import * as customers from './tools/customers.js';
import * as vehicles from './tools/vehicles.js';
import * as inventory from './tools/inventory.js';
import * as appointments from './tools/appointments.js';
import * as payments from './tools/payments.js';
import * as labor from './tools/labor.js';
import * as services from './tools/services.js';
import * as workflow from './tools/workflow.js';
import * as webhooks from './tools/webhooks.js';
import * as reports from './tools/reports.js';
import * as labels from './tools/labels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };

const toolModules = [
  orders,
  customers,
  vehicles,
  inventory,
  appointments,
  payments,
  labor,
  services,
  workflow,
  webhooks,
  reports,
  labels,
];

const allDefinitions = toolModules.flatMap(m => m.definitions);

// Tools that only read. Everything else can change data in Shopmonkey.
const isRead = (name: string): boolean => /^(get_|list_|search_|report_|lookup_)/.test(name);
// Opt-in: set MCP_READ_ONLY=true to hide and refuse every non-read tool.
// (Idea from CJVlady's fork, which made this the default; here it is off by
// default so existing deployments keep working.)
const readOnlyMode = (): boolean => process.env.MCP_READ_ONLY === 'true';
const annotate = (t: (typeof allDefinitions)[number]) => ({
  ...t,
  annotations: {
    readOnlyHint: isRead(t.name),
    destructiveHint: /^delete_/.test(t.name),
    openWorldHint: true,
  },
});

const allHandlers: ToolHandlerMap = {};
for (const mod of toolModules) {
  for (const name of Object.keys(mod.handlers)) {
    if (allHandlers[name]) {
      console.error(`WARNING: Duplicate tool handler "${name}" — later registration overwrites earlier one`);
    }
    allHandlers[name] = mod.handlers[name];
  }
}

export function createServer(): Server {
  const server = new Server(
    { name: 'shopmonkey-mcp-server', version: pkg.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allDefinitions.filter(t => !readOnlyMode() || isRead(t.name)).map(annotate),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = allHandlers[name];

    if (!handler || (readOnlyMode() && !isRead(name))) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      return await handler((args ?? {}) as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
