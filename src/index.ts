#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as orders from './tools/orders.js';
import * as customers from './tools/customers.js';
import * as vehicles from './tools/vehicles.js';
import * as inventory from './tools/inventory.js';
import * as appointments from './tools/appointments.js';
import * as payments from './tools/payments.js';
import * as labor from './tools/labor.js';
import * as services from './tools/services.js';
import * as workflow from './tools/workflow.js';

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
];

const allDefinitions = toolModules.flatMap(m => m.definitions);

const allHandlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>> = {};
for (const mod of toolModules) {
  Object.assign(allHandlers, mod.handlers);
}

const server = new Server(
  { name: 'shopmonkey-mcp-server', version: '1.0.0' },
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
