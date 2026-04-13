import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as orders from '../tools/orders.js';
import * as customers from '../tools/customers.js';
import * as vehicles from '../tools/vehicles.js';
import * as inventory from '../tools/inventory.js';
import * as appointments from '../tools/appointments.js';
import * as payments from '../tools/payments.js';
import * as labor from '../tools/labor.js';
import * as services from '../tools/services.js';
import * as workflow from '../tools/workflow.js';
import * as webhooks from '../tools/webhooks.js';
import * as reports from '../tools/reports.js';

const toolModules = [
  { name: 'orders', mod: orders, expectedTools: 4 },         // -1 delete_order (C3)
  { name: 'customers', mod: customers, expectedTools: 6 },   // -1 list_customers + 3 search tools (C4)
  { name: 'vehicles', mod: vehicles, expectedTools: 7 },     // -1 list_vehicles + 4 new tools
  { name: 'inventory', mod: inventory, expectedTools: 4 },
  { name: 'appointments', mod: appointments, expectedTools: 4 },
  { name: 'payments', mod: payments, expectedTools: 3 },
  { name: 'labor', mod: labor, expectedTools: 4 },
  { name: 'services', mod: services, expectedTools: 22 },    // 3 existing + 3 CRUD + 15 line-item + 1 deferred
  { name: 'workflow', mod: workflow, expectedTools: 2 },
  { name: 'webhooks', mod: webhooks, expectedTools: 5 },
  { name: 'reports', mod: reports, expectedTools: 3 },
];

describe('Tool registration', () => {
  it('has 64 total tool definitions', () => {
    const total = toolModules.reduce((sum, m) => sum + m.mod.definitions.length, 0);
    assert.equal(total, 64);
  });

  for (const { name, mod, expectedTools } of toolModules) {
    describe(name, () => {
      it(`has ${expectedTools} tool definitions`, () => {
        assert.equal(mod.definitions.length, expectedTools);
      });

      it('every definition has a matching handler', () => {
        for (const def of mod.definitions) {
          assert.ok(
            mod.handlers[def.name],
            `Missing handler for tool "${def.name}"`
          );
        }
      });

      it('every handler has a matching definition', () => {
        const defNames = new Set(mod.definitions.map(d => d.name));
        for (const handlerName of Object.keys(mod.handlers)) {
          assert.ok(
            defNames.has(handlerName),
            `Handler "${handlerName}" has no matching definition`
          );
        }
      });

      it('every definition has a description', () => {
        for (const def of mod.definitions) {
          assert.ok(def.description, `Tool "${def.name}" missing description`);
        }
      });

      it('every definition has an inputSchema', () => {
        for (const def of mod.definitions) {
          assert.ok(def.inputSchema, `Tool "${def.name}" missing inputSchema`);
          assert.equal((def.inputSchema as Record<string, unknown>).type, 'object');
        }
      });
    });
  }

  it('has no duplicate tool names across all modules', () => {
    const allNames = toolModules.flatMap(m => m.mod.definitions.map(d => d.name));
    const unique = new Set(allNames);
    assert.equal(allNames.length, unique.size, `Duplicate tool names found: ${allNames.filter((n, i) => allNames.indexOf(n) !== i)}`);
  });
});

describe('Tool safety guards', () => {
  it('get handlers require id', async () => {
    const result = await orders.handlers.get_order({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('search_parts requires query', async () => {
    const result = await inventory.handlers.search_parts({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('query is required'));
  });

  it('create_payment requires orderId', async () => {
    const result = await payments.handlers.create_payment({ amountCents: 100 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('orderId is required'));
  });

  // I2 fix: parameter is now amountCents not amount
  it('create_payment requires amountCents', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-123' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('amountCents is required'));
  });

  it('create_payment rejects decimal amountCents', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-123', amountCents: 150.50 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('positive integer'));
  });

  it('create_payment rejects negative amountCents', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-123', amountCents: -100 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('positive integer'));
  });

  it('create_canned_service requires name', async () => {
    const result = await services.handlers.create_canned_service({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('name is required'));
  });

  // AC-CannedLine.2: verify 15 line-item tools are all present
  it('services module has all 15 line-item tool names', () => {
    const lineItemTypes = ['fee', 'labor', 'part', 'subcontract', 'tire'];
    const ops = ['add', 'update', 'remove'];
    const expected = new Set(ops.flatMap(op => lineItemTypes.map(type => `${op}_canned_service_${type}`)));
    const handlerNames = new Set(Object.keys(services.handlers));
    for (const name of expected) {
      assert.ok(handlerNames.has(name), `Missing line-item handler: ${name}`);
    }
    assert.equal(expected.size, 15);
  });
});
