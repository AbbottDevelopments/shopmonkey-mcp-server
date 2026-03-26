import { describe, it, beforeEach, afterEach } from 'node:test';
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

const originalFetch = globalThis.fetch;

type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

let mockResponses: MockResponse[] = [];
let capturedRequests: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];

function setupMock(responses: MockResponse | MockResponse[]) {
  mockResponses = Array.isArray(responses) ? [...responses] : [responses];
  capturedRequests = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(
      init?.headers instanceof Headers
        ? init.headers.entries()
        : Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    const body = init?.body ? String(init.body) : undefined;
    capturedRequests.push({ url, method, headers, body });

    const mock = mockResponses.shift() ?? { status: 200, body: { success: true, data: {} } };
    const responseHeaders = new Headers(mock.headers ?? {});
    if (!responseHeaders.has('content-length') && mock.body !== undefined) {
      responseHeaders.set('content-length', String(JSON.stringify(mock.body).length));
    }

    return new Response(
      mock.body !== undefined ? JSON.stringify(mock.body) : null,
      {
        status: mock.status ?? 200,
        headers: responseHeaders,
      }
    );
  }) as typeof fetch;
}

function mockSuccess(data: unknown): MockResponse {
  return { status: 200, body: { success: true, data } };
}

function mockError(code: string, message: string, status = 400): MockResponse {
  return { status, body: { success: false, error: message, code } };
}

function mock204(): MockResponse {
  return { status: 204, headers: { 'content-length': '0' } };
}

describe('Mock API — Orders', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_orders sends GET /order with params', async () => {
    setupMock(mockSuccess([{ id: 'ord-1', status: 'estimate' }]));
    const result = await orders.handlers.list_orders({ status: 'estimate', limit: 10 });
    assert.equal(capturedRequests.length, 1);
    assert.ok(capturedRequests[0].url.includes('/order'));
    assert.ok(capturedRequests[0].url.includes('status=estimate'));
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data[0].id, 'ord-1');
  });

  it('get_order sends GET /order/{id}', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'work_order' }));
    const result = await orders.handlers.get_order({ id: 'ord-1' });
    assert.ok(capturedRequests[0].url.includes('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('create_order sends POST /order with body', async () => {
    setupMock(mockSuccess({ id: 'ord-new', customerId: 'cust-1' }));
    const result = await orders.handlers.create_order({ customerId: 'cust-1', status: 'estimate' });
    assert.equal(capturedRequests[0].method, 'POST');
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.status, 'estimate');
    assert.ok(!result.isError);
  });

  it('create_order does not forward unknown fields', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1', hackerField: 'malicious' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });

  it('update_order sends PATCH /order/{id}', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'invoice' }));
    const result = await orders.handlers.update_order({ id: 'ord-1', status: 'invoice' });
    assert.equal(capturedRequests[0].method, 'PATCH');
    assert.ok(capturedRequests[0].url.includes('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('delete_order sends DELETE /order/{id} when confirmed', async () => {
    setupMock(mock204());
    const result = await orders.handlers.delete_order({ id: 'ord-1', confirm: true });
    assert.equal(capturedRequests[0].method, 'DELETE');
    assert.ok(!result.isError);
    assert.ok(result.content[0].text.includes('deleted successfully'));
  });
});

describe('Mock API — Customers', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_customers sends GET /customer with search query', async () => {
    setupMock(mockSuccess([{ id: 'cust-1', firstName: 'John' }]));
    const result = await customers.handlers.list_customers({ query: 'John' });
    assert.ok(capturedRequests[0].url.includes('query=John'));
    assert.ok(!result.isError);
  });

  it('create_customer only sends allowed fields', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jane', lastName: 'Doe', secret: 'hack' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'Jane');
    assert.equal(body.secret, undefined);
  });

  it('update_customer sends PATCH /customer/{id}', async () => {
    setupMock(mockSuccess({ id: 'cust-1', phone: '555-1234' }));
    const result = await customers.handlers.update_customer({ id: 'cust-1', phone: '555-1234' });
    assert.equal(capturedRequests[0].method, 'PATCH');
    assert.ok(!result.isError);
  });
});

describe('Mock API — Vehicles', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_vehicles filters by customerId', async () => {
    setupMock(mockSuccess([{ id: 'veh-1', make: 'Toyota' }]));
    await vehicles.handlers.list_vehicles({ customerId: 'cust-1' });
    assert.ok(capturedRequests[0].url.includes('customerId=cust-1'));
  });

  it('create_vehicle sends correct body', async () => {
    setupMock(mockSuccess({ id: 'veh-new' }));
    await vehicles.handlers.create_vehicle({ make: 'Ford', model: 'F-150', year: 2024 });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.make, 'Ford');
    assert.equal(body.year, 2024);
  });
});

describe('Mock API — Inventory', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_inventory_parts sends GET /inventory/part', async () => {
    setupMock(mockSuccess([{ id: 'part-1', name: 'Oil Filter' }]));
    await inventory.handlers.list_inventory_parts({});
    assert.ok(capturedRequests[0].url.includes('/inventory/part'));
  });

  it('list_inventory_tires sends GET /inventory/tire', async () => {
    setupMock(mockSuccess([{ id: 'tire-1' }]));
    await inventory.handlers.list_inventory_tires({});
    assert.ok(capturedRequests[0].url.includes('/inventory/tire'));
  });

  it('search_parts sends GET /part with query', async () => {
    setupMock(mockSuccess([{ id: 'part-1' }]));
    await inventory.handlers.search_parts({ query: 'brake pad' });
    assert.ok(capturedRequests[0].url.includes('/part'));
    assert.ok(capturedRequests[0].url.includes('query=brake'));
  });
});

describe('Mock API — Appointments', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('create_appointment sends POST with all fields', async () => {
    setupMock(mockSuccess({ id: 'apt-new' }));
    await appointments.handlers.create_appointment({
      customerId: 'cust-1', title: 'Oil Change', startDate: '2026-04-01T10:00:00Z',
    });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.title, 'Oil Change');
  });

  it('update_appointment sends PATCH', async () => {
    setupMock(mockSuccess({ id: 'apt-1' }));
    await appointments.handlers.update_appointment({ id: 'apt-1', title: 'Brake Check' });
    assert.equal(capturedRequests[0].method, 'PATCH');
  });
});

describe('Mock API — Payments', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('create_payment sends correct body', async () => {
    setupMock(mockSuccess({ id: 'pay-new' }));
    await payments.handlers.create_payment({ orderId: 'ord-1', amount: 150.50, method: 'credit_card' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.orderId, 'ord-1');
    assert.equal(body.amount, 150.50);
    assert.equal(body.method, 'credit_card');
  });
});

describe('Mock API — Labor & Users', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_labor filters by orderId', async () => {
    setupMock(mockSuccess([{ id: 'lab-1' }]));
    await labor.handlers.list_labor({ orderId: 'ord-1' });
    assert.ok(capturedRequests[0].url.includes('orderId=ord-1'));
  });

  it('list_timeclock filters by userId and date range', async () => {
    setupMock(mockSuccess([{ id: 'tc-1' }]));
    await labor.handlers.list_timeclock({ userId: 'user-1', startDate: '2026-01-01' });
    assert.ok(capturedRequests[0].url.includes('userId=user-1'));
    assert.ok(capturedRequests[0].url.includes('startDate=2026-01-01'));
  });

  it('get_user sends GET /user/{id}', async () => {
    setupMock(mockSuccess({ id: 'user-1', firstName: 'Mike' }));
    await labor.handlers.get_user({ id: 'user-1' });
    assert.ok(capturedRequests[0].url.includes('/user/user-1'));
  });
});

describe('Mock API — Services', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_services filters by orderId', async () => {
    setupMock(mockSuccess([{ id: 'svc-1' }]));
    await services.handlers.list_services({ orderId: 'ord-1' });
    assert.ok(capturedRequests[0].url.includes('orderId=ord-1'));
  });

  it('list_canned_services sends GET /canned_service', async () => {
    setupMock(mockSuccess([{ id: 'cs-1', name: 'Oil Change' }]));
    await services.handlers.list_canned_services({});
    assert.ok(capturedRequests[0].url.includes('/canned_service'));
  });

  it('get_canned_service sends GET /canned_service/{id}', async () => {
    setupMock(mockSuccess({ id: 'cs-1' }));
    await services.handlers.get_canned_service({ id: 'cs-1' });
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1'));
  });
});

describe('Mock API — Workflow & Locations', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_workflow_statuses sends GET /workflow_status', async () => {
    setupMock(mockSuccess([{ id: 'ws-1', name: 'In Progress' }]));
    await workflow.handlers.list_workflow_statuses({});
    assert.ok(capturedRequests[0].url.includes('/workflow_status'));
  });

  it('list_locations sends GET /location', async () => {
    setupMock(mockSuccess([{ id: 'loc-1', name: 'Main Shop' }]));
    await workflow.handlers.list_locations({});
    assert.ok(capturedRequests[0].url.includes('/location'));
  });
});

describe('Mock API — Auth header', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends Bearer token in Authorization header', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({});
    assert.equal(capturedRequests[0].headers['Authorization'], 'Bearer test-key-123');
  });

  it('does not send Content-Type on GET requests', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({});
    assert.equal(capturedRequests[0].headers['Content-Type'], undefined);
  });

  it('sends Content-Type on POST requests', async () => {
    setupMock(mockSuccess({ id: 'new' }));
    await orders.handlers.create_order({ status: 'estimate' });
    assert.equal(capturedRequests[0].headers['Content-Type'], 'application/json');
  });
});

describe('Mock API — Default location ID', () => {
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; delete process.env.SHOPMONKEY_LOCATION_ID; });

  it('applies SHOPMONKEY_LOCATION_ID when no locationId passed', async () => {
    process.env.SHOPMONKEY_API_KEY = 'test-key';
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-default';
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-default'));
  });

  it('explicit locationId overrides default', async () => {
    process.env.SHOPMONKEY_API_KEY = 'test-key';
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-default';
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ locationId: 'loc-override' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-override'));
    assert.ok(!capturedRequests[0].url.includes('loc-default'));
  });
});

describe('Mock API — Shopmonkey error handling', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('surfaces Shopmonkey error codes from API', async () => {
    setupMock(mockError('API-10001', 'Record not found', 404));
    try {
      await orders.handlers.get_order({ id: 'bad-id' });
      assert.fail('Expected an error to be thrown');
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(message.includes('API-10001'));
      assert.ok(message.includes('Record not found'));
    }
  });

  it('handles success:false responses', async () => {
    setupMock({ status: 200, body: { success: false, error: 'Invalid field', code: 'ORM-500' } });
    try {
      await orders.handlers.get_order({ id: 'ord-1' });
      assert.fail('Expected an error to be thrown');
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(message.includes('ORM-500'));
    }
  });
});
