import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as labor from '../tools/labor.js';

const originalFetch = globalThis.fetch;
const originalLocationId = process.env.SHOPMONKEY_LOCATION_ID;

type MockResponse = { status?: number; headers?: Record<string, string>; body?: unknown };
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
    if (!responseHeaders.has('content-length') && mock.body !== undefined)
      responseHeaders.set('content-length', String(JSON.stringify(mock.body).length));
    return new Response(mock.body !== undefined ? JSON.stringify(mock.body) : null, { status: mock.status ?? 200, headers: responseHeaders });
  }) as typeof fetch;
}

function mockSuccess(data: unknown): MockResponse {
  return { status: 200, body: { success: true, data } };
}

// ─── list_labor ───────────────────────────────────────────────────────────────

describe('list_labor', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET to the nested order > service > labor route', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'svc-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/order/ord-1/service/svc-1/labor'));
    assert.ok(!result.isError);
  });

  it('never uses the flat /labor route (no such endpoint)', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'svc-1' });
    const path = new URL(capturedRequests[0].url).pathname;
    assert.equal(path.endsWith('/order/ord-1/service/svc-1/labor'), true);
  });

  it('url-encodes ids in the path', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_labor({ orderId: 'ord/1', serviceId: 'svc 1' });
    assert.ok(capturedRequests[0].url.includes('ord%2F1'));
    assert.ok(capturedRequests[0].url.includes('svc%201'));
  });

  it('errors without orderId', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_labor({ serviceId: 'svc-1' });
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.length, 0);
  });

  it('errors without serviceId', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1' });
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});

// ─── assign_technician ────────────────────────────────────────────────────────

describe('assign_technician', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT to the documented labor_bulk route', async () => {
    setupMock(mockSuccess({}));
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1'], technicianId: 'usr-9' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/order/ord-1/labor_bulk'));
    assert.ok(!result.isError);
  });

  it('sends the { data: { technicianId }, ids } body shape', async () => {
    setupMock(mockSuccess({}));
    await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1', 'lab-2'], technicianId: 'usr-9' });
    assert.deepEqual(JSON.parse(capturedRequests[0].body!), { data: { technicianId: 'usr-9' }, ids: ['lab-1', 'lab-2'] });
  });

  it('errors on an empty or missing laborIds array', async () => {
    setupMock(mockSuccess({}));
    const empty = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: [], technicianId: 'usr-9' });
    assert.equal(empty.isError, true);
    const missing = await labor.handlers.assign_technician({ orderId: 'ord-1', technicianId: 'usr-9' });
    assert.equal(missing.isError, true);
    assert.equal(capturedRequests.length, 0);
  });

  it('errors without technicianId', async () => {
    setupMock(mockSuccess({}));
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1'] });
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});

// ─── list_timeclock ───────────────────────────────────────────────────────────

describe('list_timeclock', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /timeclock', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_timeclock({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/timeclock'));
    assert.ok(!result.isError);
  });

  it('passes userId as a query param', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ userId: 'user-1' });
    assert.ok(capturedRequests[0].url.includes('userId=user-1'));
  });

  it('passes date range as query params', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ startDate: '2026-05-01T00:00:00Z', endDate: '2026-05-07T23:59:59Z' });
    assert.ok(capturedRequests[0].url.includes('startDate='));
    assert.ok(capturedRequests[0].url.includes('endDate='));
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ limit: 50, skip: 0 });
    assert.ok(capturedRequests[0].url.includes('limit=50'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });
});

// ─── list_users ───────────────────────────────────────────────────────────────

describe('list_users', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /user', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_users({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/user'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_users({ limit: 25, skip: 0 });
    assert.ok(capturedRequests[0].url.includes('limit=25'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await labor.handlers.list_users({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await labor.handlers.list_users({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });
});

// ─── get_user ─────────────────────────────────────────────────────────────────

describe('get_user', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /user/:id', async () => {
    setupMock(mockSuccess({ id: 'user-1', name: 'Mike the Tech' }));
    const result = await labor.handlers.get_user({ id: 'user-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/user/user-1'));
    assert.ok(!result.isError);
  });

  it('returns the user data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'user-1', name: 'Mike the Tech', role: 'Technician' }));
    const result = await labor.handlers.get_user({ id: 'user-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.name, 'Mike the Tech');
    assert.equal(parsed.role, 'Technician');
  });

  it('returns an error when id is missing', async () => {
    const result = await labor.handlers.get_user({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'user/1' }));
    await labor.handlers.get_user({ id: 'user/1' });
    assert.ok(capturedRequests[0].url.includes('user%2F1'));
  });
});
