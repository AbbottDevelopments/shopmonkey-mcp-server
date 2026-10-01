import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../server.js';

async function connect() {
  const server = createServer();
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('tool annotations', () => {
  afterEach(() => { delete process.env.MCP_READ_ONLY; });

  it('marks read tools readOnly and write tools not', async () => {
    const { tools } = await (await connect()).listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of ['list_orders', 'get_customer', 'search_customers', 'report_revenue_summary', 'lookup_vehicle_by_vin']) {
      assert.equal(by[name]?.readOnlyHint, true, name);
    }
    for (const name of ['create_order', 'update_order', 'assign_technician', 'create_payment', 'delete_webhook']) {
      assert.equal(by[name]?.readOnlyHint, false, name);
    }
    assert.equal(by.delete_webhook?.destructiveHint, true);
    assert.equal(by.update_order?.destructiveHint, false);
  });

  it('lists every tool by default (read-only mode is opt-in)', async () => {
    const { tools } = await (await connect()).listTools();
    assert.ok(tools.some((t) => t.name === 'create_order'));
  });

  it('with MCP_READ_ONLY=true hides write tools and refuses to run them', async () => {
    process.env.MCP_READ_ONLY = 'true';
    const client = await connect();
    const { tools } = await client.listTools();
    assert.ok(tools.length > 0);
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
    const res = await client.callTool({ name: 'create_order', arguments: {} });
    assert.equal(res.isError, true);
    assert.ok(JSON.stringify(res.content).includes('Unknown tool'));
  });
});
