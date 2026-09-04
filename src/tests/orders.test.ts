import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as orders from '../tools/orders.js';

const originalFetch = globalThis.fetch;
const originalLocationId = process.env.SHOPMONKEY_LOCATION_ID;

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
      { status: mock.status ?? 200, headers: responseHeaders }
    );
  }) as typeof fetch;
}

function mockSuccess(data: unknown): MockResponse {
  return { status: 200, body: { success: true, data } };
}

// ─── list_orders ──────────────────────────────────────────────────────────────

describe('list_orders', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /order with no query params when called with no args', async () => {
    setupMock(mockSuccess([]));
    const result = await orders.handlers.list_orders({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/order'));
    assert.ok(!capturedRequests[0].url.includes('?'));
    assert.ok(!result.isError);
  });

  it('passes status as a query param', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ status: 'Estimate' });
    assert.ok(capturedRequests[0].url.includes('status=Estimate'));
  });

  it('passes customerId as a query param', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ customerId: 'cust-abc' });
    assert.ok(capturedRequests[0].url.includes('customerId=cust-abc'));
  });

  it('passes explicit locationId as a query param', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ limit: 10, skip: 20 });
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.ok(capturedRequests[0].url.includes('skip=20'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await orders.handlers.list_orders({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });

  it('returns JSON-stringified order list on success', async () => {
    const fakeOrders = [{ id: 'ord-1', status: 'Estimate' }, { id: 'ord-2', status: 'Invoice' }];
    setupMock(mockSuccess(fakeOrders));
    const result = await orders.handlers.list_orders({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].id, 'ord-1');
  });
});

// ─── get_order ────────────────────────────────────────────────────────────────

describe('get_order', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /order/:id', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'RepairOrder' }));
    const result = await orders.handlers.get_order({ id: 'ord-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('returns the order data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'Invoice', customerId: 'cust-99' }));
    const result = await orders.handlers.get_order({ id: 'ord-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.id, 'ord-1');
    assert.equal(parsed.customerId, 'cust-99');
  });

  it('returns an error when id is missing', async () => {
    const result = await orders.handlers.get_order({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'ord/special' }));
    await orders.handlers.get_order({ id: 'ord/special' });
    assert.ok(capturedRequests[0].url.includes('ord%2Fspecial'));
    assert.ok(!capturedRequests[0].url.includes('ord/special'));
  });
});

// ─── create_order ─────────────────────────────────────────────────────────────

describe('create_order', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends POST /order', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    const result = await orders.handlers.create_order({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.endsWith('/order'));
    assert.ok(!result.isError);
  });

  it('sends customerId, vehicleId, and status in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1', vehicleId: 'veh-1', status: 'Estimate' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.vehicleId, 'veh-1');
    assert.equal(body.status, 'Estimate');
  });

  it('sends explicit locationId in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ locationId: 'loc-explicit' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-explicit');
  });

  it('injects SHOPMONKEY_LOCATION_ID env var into the body when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({});
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-from-env');
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ locationId: 'loc-explicit' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-explicit');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1', hackerField: 'bad', injected: true });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.injected, undefined);
    assert.equal(body.customerId, 'cust-1');
  });
});

// ─── update_order ─────────────────────────────────────────────────────────────

describe('update_order', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT /order/:id', async () => {
    setupMock(mockSuccess({ id: 'ord-1' }));
    const result = await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('sends allowed update fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-1' }));
    await orders.handlers.update_order({ id: 'ord-1', status: 'RepairOrder', customerId: 'cust-2', vehicleId: 'veh-2' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.status, 'RepairOrder');
    assert.equal(body.customerId, 'cust-2');
    assert.equal(body.vehicleId, 'veh-2');
  });

  it('returns an error when id is missing', async () => {
    const result = await orders.handlers.update_order({ status: 'Invoice' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('does not send id in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-1' }));
    await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.id, undefined);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'ord-1' }));
    await orders.handlers.update_order({ id: 'ord-1', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'ord/special' }));
    await orders.handlers.update_order({ id: 'ord/special', status: 'Invoice' });
    assert.ok(capturedRequests[0].url.includes('ord%2Fspecial'));
  });
});
