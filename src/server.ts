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
];

const allDefinitions = toolModules.flatMap(m => m.definitions);

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
    tools: allDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = allHandlers[name];

    if (!handler) {
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
