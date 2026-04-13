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

// C2 fix: Shopmonkey returns { message } not { error }
function mockError(code: string, message: string, status = 400): MockResponse {
  return { status, body: { success: false, message, code } };
}

function mock204(): MockResponse {
  return { status: 204, headers: { 'content-length': '0' } };
}

describe('Mock API — Orders', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_orders sends GET /order with params', async () => {
    // C5 fix: status uses PascalCase
    setupMock(mockSuccess([{ id: 'ord-1', status: 'Estimate' }]));
    const result = await orders.handlers.list_orders({ status: 'Estimate', limit: 10 });
    assert.equal(capturedRequests.length, 1);
    assert.ok(capturedRequests[0].url.includes('/order'));
    assert.ok(capturedRequests[0].url.includes('status=Estimate'));
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data[0].id, 'ord-1');
  });

  it('get_order sends GET /order/{id}', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'RepairOrder' }));
    const result = await orders.handlers.get_order({ id: 'ord-1' });
    assert.ok(capturedRequests[0].url.includes('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('create_order sends POST /order with body', async () => {
    setupMock(mockSuccess({ id: 'ord-new', customerId: 'cust-1' }));
    const result = await orders.handlers.create_order({ customerId: 'cust-1', status: 'Estimate' });
    assert.equal(capturedRequests[0].method, 'POST');
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.status, 'Estimate');
    assert.ok(!result.isError);
  });

  it('create_order does not forward unknown fields', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1', hackerField: 'malicious' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });

  // C1 fix: update uses PUT not PATCH
  it('update_order sends PUT /order/{id}', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'Invoice' }));
    const result = await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/order/ord-1'));
    assert.ok(!result.isError);
  });

  // C3: delete_order removed — no test
});

describe('Mock API — Customers', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  // C4 fix: list_customers replaced with search_customers*
  it('search_customers sends POST /customer/search', async () => {
    setupMock(mockSuccess([{ id: 'cust-1', firstName: 'John' }]));
    const result = await customers.handlers.search_customers({ query: 'John' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.query, 'John');
    assert.ok(!result.isError);
  });

  it('search_customers_by_email sends POST /customer/email/search', async () => {
    setupMock(mockSuccess([{ id: 'cust-1' }]));
    const result = await customers.handlers.search_customers_by_email({ email: 'john@example.com' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/email/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.email, 'john@example.com');
    assert.ok(!result.isError);
  });

  it('search_customers_by_phone sends POST /customer/phone_number/search', async () => {
    setupMock(mockSuccess([{ id: 'cust-1' }]));
    const result = await customers.handlers.search_customers_by_phone({ phoneNumber: '555-0100' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/phone_number/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.phoneNumber, '555-0100');
    assert.ok(!result.isError);
  });

  it('create_customer only sends allowed fields', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jane', lastName: 'Doe', secret: 'hack' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'Jane');
    assert.equal(body.secret, undefined);
  });

  // C6 fix: email/phone are sub-resources, not flat fields
  it('create_customer does not forward email or phone fields', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jane', email: 'jane@x.com', phone: '555-1234' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'Jane');
    assert.equal(body.email, undefined);
    assert.equal(body.phone, undefined);
  });

  // C1 fix: update uses PUT not PATCH
  it('update_customer sends PUT /customer/{id}', async () => {
    setupMock(mockSuccess({ id: 'cust-1' }));
    const result = await customers.handlers.update_customer({ id: 'cust-1', firstName: 'Jane' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/customer/cust-1'));
    assert.ok(!result.isError);
  });
});

describe('Mock API — Vehicles', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  // list_vehicles removed — replaced with list_vehicles_for_customer
  it('list_vehicles_for_customer sends GET /customer/:id/vehicle', async () => {
    setupMock(mockSuccess([{ id: 'veh-1', make: 'Toyota' }]));
    const result = await vehicles.handlers.list_vehicles_for_customer({ customerId: 'cust-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/customer/cust-1/vehicle'));
    assert.ok(!result.isError);
  });

  it('lookup_vehicle_by_vin sends GET /vehicle/vin/:vin', async () => {
    setupMock(mockSuccess({ id: 'veh-1', vin: '1HGBH41JXMN109186' }));
    const result = await vehicles.handlers.lookup_vehicle_by_vin({ vin: '1HGBH41JXMN109186' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/vehicle/vin/1HGBH41JXMN109186'));
    assert.ok(!result.isError);
  });

  it('lookup_vehicle_by_plate sends GET /vehicle/license_plate/:region/:plate', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    const result = await vehicles.handlers.lookup_vehicle_by_plate({ region: 'US-CA', plate: 'ABC123' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/vehicle/license_plate/US-CA/ABC123'));
    assert.ok(!result.isError);
  });

  it('create_vehicle sends correct body', async () => {
    setupMock(mockSuccess({ id: 'veh-new' }));
    await vehicles.handlers.create_vehicle({ make: 'Ford', model: 'F-150', year: 2024 });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.make, 'Ford');
    assert.equal(body.year, 2024);
  });

  // C1 fix: update uses PUT not PATCH
  it('update_vehicle sends PUT /vehicle/{id}', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    const result = await vehicles.handlers.update_vehicle({ id: 'veh-1', mileage: 50000 });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/vehicle/veh-1'));
    assert.ok(!result.isError);
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

  // C1 fix: update uses PUT not PATCH
  it('update_appointment sends PUT /appointment/{id}', async () => {
    setupMock(mockSuccess({ id: 'apt-1' }));
    const result = await appointments.handlers.update_appointment({ id: 'apt-1', title: 'Brake Check' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/appointment/apt-1'));
    assert.ok(!result.isError);
  });
});

describe('Mock API — Payments', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  // I2 fix: amount renamed to amountCents, value is integer cents
  it('create_payment sends correct body with amountCents', async () => {
    setupMock(mockSuccess({ id: 'pay-new' }));
    await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 15050, method: 'credit_card' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.orderId, 'ord-1');
    assert.equal(body.amountCents, 15050);
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
    await orders.handlers.create_order({ status: 'Estimate' });
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

  // C2 fix: success:false body uses message not error
  it('handles success:false responses with message field', async () => {
    setupMock({ status: 200, body: { success: false, message: 'Invalid field', code: 'ORM-500' } });
    try {
      await orders.handlers.get_order({ id: 'ord-1' });
      assert.fail('Expected an error to be thrown');
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(message.includes('ORM-500'));
      assert.ok(message.includes('Invalid field'));
    }
  });
});
