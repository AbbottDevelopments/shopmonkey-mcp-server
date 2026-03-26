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

const toolModules = [
  { name: 'orders', mod: orders, expectedTools: 5 },
  { name: 'customers', mod: customers, expectedTools: 4 },
  { name: 'vehicles', mod: vehicles, expectedTools: 4 },
  { name: 'inventory', mod: inventory, expectedTools: 4 },
  { name: 'appointments', mod: appointments, expectedTools: 4 },
  { name: 'payments', mod: payments, expectedTools: 3 },
  { name: 'labor', mod: labor, expectedTools: 4 },
  { name: 'services', mod: services, expectedTools: 3 },
  { name: 'workflow', mod: workflow, expectedTools: 2 },
];

describe('Tool registration', () => {
  it('has 33 total tool definitions', () => {
    const total = toolModules.reduce((sum, m) => sum + m.mod.definitions.length, 0);
    assert.equal(total, 33);
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
  it('delete_order requires confirm: true', async () => {
    const result = await orders.handlers.delete_order({ id: 'test-123' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('confirm'));
  });

  it('delete_order rejects confirm: false', async () => {
    const result = await orders.handlers.delete_order({ id: 'test-123', confirm: false });
    assert.ok(result.isError);
  });

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
    const result = await payments.handlers.create_payment({ amount: 100 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('orderId is required'));
  });

  it('create_payment requires amount', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-123' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('amount is required'));
  });
});
