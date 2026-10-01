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

  it('filters by status client-side — the API ignores the status param', async () => {
    setupMock(mockSuccess([{ id: 'o1', status: 'Estimate' }, { id: 'o2', status: 'Invoice' }, { id: 'o3', status: 'Invoice' }]));
    const result = await orders.handlers.list_orders({ status: 'Invoice' });
    const out = JSON.parse(result.content[0].text);
    assert.deepEqual(out.results.map((o: { id: string }) => o.id), ['o2', 'o3']);
    assert.equal(out.filtering, 'client-side');
    assert.equal(out.scanned, 3);
    assert.equal(out.truncated, false);
    assert.ok(!capturedRequests[0].url.includes('status='));
  });

  it('filters by customerId client-side', async () => {
    setupMock(mockSuccess([{ id: 'o1', customerId: 'cust-abc' }, { id: 'o2', customerId: 'cust-other' }]));
    const out = JSON.parse((await orders.handlers.list_orders({ customerId: 'cust-abc' })).content[0].text);
    assert.deepEqual(out.results.map((o: { id: string }) => o.id), ['o1']);
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

  it('sends customerId, vehicleId, name and notes in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1', vehicleId: 'veh-1', name: 'Brakes', complaint: 'Squeal', recommendation: 'Pads', workflowStatusId: 'wf-1' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.deepEqual(
      { c: body.customerId, v: body.vehicleId, n: body.name, co: body.complaint, r: body.recommendation, w: body.workflowStatusId },
      { c: 'cust-1', v: 'veh-1', n: 'Brakes', co: 'Squeal', r: 'Pads', w: 'wf-1' }
    );
  });

  it('never sends status on POST — the endpoint has no such field — and applies it with a follow-up PUT', async () => {
    setupMock([mockSuccess({ id: 'ord-new', number: '7', status: 'Estimate', customerId: 'cust-1' }), mockSuccess({ id: 'ord-new', number: '7', status: 'RepairOrder', customerId: 'cust-1' })]);
    const result = await orders.handlers.create_order({ customerId: 'cust-1', status: 'RepairOrder' });
    assert.equal(JSON.parse(capturedRequests[0].body!).status, undefined);
    assert.equal(capturedRequests[1].method, 'PUT');
    assert.ok(capturedRequests[1].url.endsWith('/order/ord-new'));
    assert.deepEqual(JSON.parse(capturedRequests[1].body!), { status: 'RepairOrder' });
    const out = JSON.parse(result.content[0].text);
    assert.deepEqual(out.correctedAfterCreate, ['status']);
    assert.equal(out.stillNotApplied, undefined);
  });

  it('skips the follow-up PUT when no status was requested', async () => {
    setupMock(mockSuccess({ id: 'ord-new' }));
    await orders.handlers.create_order({ customerId: 'cust-1' });
    assert.equal(capturedRequests.length, 1);
  });

  it('reports fields the API accepted but did not store', async () => {
    setupMock(mockSuccess({ id: 'ord-new', name: null }));
    const out = JSON.parse((await orders.handlers.create_order({ name: 'Brakes' })).content[0].text);
    assert.deepEqual(out.stillNotApplied.name, { requested: 'Brakes', stored: null });
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
    setupMock(mockSuccess({ id: 'ord-1', status: 'Invoice' }));
    const result = await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/order/ord-1'));
    assert.ok(!result.isError);
  });

  it('sends allowed update fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-1' }));
    await orders.handlers.update_order({ id: 'ord-1', status: 'RepairOrder', customerId: 'cust-2', vehicleId: 'veh-2', complaint: 'c', recommendation: 'r', workflowStatusId: 'wf-2' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.deepEqual(body, { status: 'RepairOrder', customerId: 'cust-2', vehicleId: 'veh-2', complaint: 'c', recommendation: 'r', workflowStatusId: 'wf-2' });
  });

  it('reports which fields persisted and which the API ignored', async () => {
    setupMock(mockSuccess({ id: 'ord-1', name: 'New title', complaint: null }));
    const result = await orders.handlers.update_order({ id: 'ord-1', name: 'New title', complaint: 'Noise' });
    const out = JSON.parse(result.content[0].text);
    assert.deepEqual(out.applied, ['name']);
    assert.deepEqual(out.ignored.complaint, { requested: 'Noise', stored: null });
    assert.equal(out.allApplied, false);
    assert.ok(!result.isError);
  });

  it('flags an error when nothing persisted', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'Estimate' }));
    const result = await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    assert.equal(result.isError, true);
  });

  it('errors when given an id and nothing to update', async () => {
    const result = await orders.handlers.update_order({ id: 'ord-1' });
    assert.ok(result.isError);
  });

  it('returns an error when id is missing', async () => {
    const result = await orders.handlers.update_order({ status: 'Invoice' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('does not send id in the request body', async () => {
    setupMock(mockSuccess({ id: 'ord-1', status: 'Invoice' }));
    await orders.handlers.update_order({ id: 'ord-1', status: 'Invoice' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.id, undefined);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'ord-1', name: 'x' }));
    await orders.handlers.update_order({ id: 'ord-1', name: 'x', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'ord/special', status: 'Invoice' }));
    await orders.handlers.update_order({ id: 'ord/special', status: 'Invoice' });
    assert.ok(capturedRequests[0].url.includes('ord%2Fspecial'));
  });
});

// ─── update_service ───────────────────────────────────────────────────────────

describe('update_service', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('PUTs /order/:orderId/service/:id then reads the service list back', async () => {
    setupMock([mockSuccess({}), mockSuccess([{ id: 'svc-1', name: 'Brakes', note: 'Check rotors' }])]);
    const result = await orders.handlers.update_service({ orderId: 'ord-1', serviceId: 'svc-1', note: 'Check rotors' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/order/ord-1/service/svc-1'));
    assert.deepEqual(JSON.parse(capturedRequests[0].body!), { note: 'Check rotors' });
    assert.equal(capturedRequests[1].method, 'GET');
    assert.equal(JSON.parse(result.content[0].text).allApplied, true);
  });

  it('reports a write that did not persist', async () => {
    setupMock([mockSuccess({}), mockSuccess([{ id: 'svc-1', note: null }])]);
    const result = await orders.handlers.update_service({ orderId: 'ord-1', serviceId: 'svc-1', note: 'x' });
    const out = JSON.parse(result.content[0].text);
    assert.equal(out.allApplied, false);
    assert.equal(result.isError, true);
  });

  it('requires orderId, serviceId and something to change, sending nothing otherwise', async () => {
    setupMock(mockSuccess({}));
    assert.equal((await orders.handlers.update_service({ serviceId: 's' , note: 'x'})).isError, true);
    assert.equal((await orders.handlers.update_service({ orderId: 'o', note: 'x' })).isError, true);
    assert.equal((await orders.handlers.update_service({ orderId: 'o', serviceId: 's' })).isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});
