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

const jsonOf = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);
const reqBody = (i = 0) => JSON.parse(capturedRequests[i].body ?? '{}') as Record<string, unknown>;

const servicesWithLabor = (tech1: unknown = null, tech2: unknown = null) => [
  { id: 'svc-1', name: 'Brakes', labors: [{ id: 'lab-1', name: 'Front pads', technicianId: tech1 }, { id: 'lab-2', name: 'Rotors', technicianId: tech2 }] },
  { id: 'svc-2', name: 'Oil change', labors: [{ id: 'lab-3', name: 'Drain and fill', technicianId: null }] },
];

// ─── list_labor ───────────────────────────────────────────────────────────────

describe('list_labor', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('reads labor from GET /order/:orderId/service — no GET .../labor route is documented', async () => {
    setupMock(mockSuccess(servicesWithLabor()));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'svc-1' });
    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0].method, 'GET');
    assert.equal(new URL(capturedRequests[0].url).pathname.endsWith('/order/ord-1/service'), true);
    assert.deepEqual(jsonOf(result).map((l: { id: string }) => l.id), ['lab-1', 'lab-2']);
  });

  it('returns only the requested service\'s labor', async () => {
    setupMock(mockSuccess(servicesWithLabor()));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'svc-2' });
    assert.deepEqual(jsonOf(result).map((l: { id: string }) => l.id), ['lab-3']);
  });

  it('returns an empty list for a service with no labor', async () => {
    setupMock(mockSuccess([{ id: 'svc-1', name: 'Inspection' }]));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'svc-1' });
    assert.deepEqual(jsonOf(result), []);
  });

  it('errors when the service is not on the order', async () => {
    setupMock(mockSuccess(servicesWithLabor()));
    const result = await labor.handlers.list_labor({ orderId: 'ord-1', serviceId: 'nope' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('not found'));
  });

  it('url-encodes the order id in the path', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_labor({ orderId: 'ord/1', serviceId: 'svc 1' });
    assert.ok(capturedRequests[0].url.includes('ord%2F1'));
  });

  it('errors without orderId or serviceId, sending nothing', async () => {
    setupMock(mockSuccess([]));
    assert.equal((await labor.handlers.list_labor({ serviceId: 'svc-1' })).isError, true);
    assert.equal((await labor.handlers.list_labor({ orderId: 'ord-1' })).isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});

// ─── assign_technician ────────────────────────────────────────────────────────

describe('assign_technician', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('PUTs each labor line on its own service route with { technicianId }, never labor_bulk', async () => {
    setupMock([
      mockSuccess(servicesWithLabor()),
      mockSuccess({}), mockSuccess({}),
      mockSuccess(servicesWithLabor('usr-9', 'usr-9')),
    ]);
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1', 'lab-2'], technicianId: 'usr-9' });
    const puts = capturedRequests.filter((r) => r.method === 'PUT');
    assert.equal(puts.length, 2);
    assert.ok(puts[0].url.includes('/order/ord-1/service/svc-1/labor/lab-1'));
    assert.ok(puts[1].url.includes('/order/ord-1/service/svc-1/labor/lab-2'));
    assert.deepEqual(JSON.parse(puts[0].body!), { technicianId: 'usr-9' });
    assert.ok(!capturedRequests.some((r) => r.url.includes('labor_bulk')));
    assert.equal(jsonOf(result).allConfirmed, true);
    assert.ok(!result.isError);
  });

  it('assigns every labor line on the order when laborIds is omitted', async () => {
    setupMock([mockSuccess(servicesWithLabor()), mockSuccess({}), mockSuccess({}), mockSuccess({}), mockSuccess(servicesWithLabor('usr-9', 'usr-9'))]);
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', technicianId: 'usr-9' });
    assert.equal(capturedRequests.filter((r) => r.method === 'PUT').length, 3);
    assert.equal(jsonOf(result).laborLines, 3);
  });

  it('does not report success on a 200 that did not persist (read-back catches it)', async () => {
    setupMock([mockSuccess(servicesWithLabor()), mockSuccess({}), mockSuccess(servicesWithLabor(null))]);
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1'], technicianId: 'usr-9' });
    const out = jsonOf(result);
    assert.equal(out.confirmed, 0);
    assert.equal(out.allConfirmed, false);
    assert.equal(out.results[0].assigned, false);
    assert.ok(out.results[0].error.includes('still unset'));
    assert.equal(result.isError, true);
  });

  it('reports a partial result per line', async () => {
    setupMock([mockSuccess(servicesWithLabor()), mockSuccess({}), mockSuccess({}), mockSuccess(servicesWithLabor('usr-9', null))]);
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1', 'lab-2'], technicianId: 'usr-9' });
    const out = jsonOf(result);
    assert.equal(out.confirmed, 1);
    assert.equal(out.allConfirmed, false);
    assert.ok(!result.isError);
  });

  it('errors when none of the given laborIds exist on the order', async () => {
    setupMock(mockSuccess(servicesWithLabor()));
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['ghost'], technicianId: 'usr-9' });
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.filter((r) => r.method === 'PUT').length, 0);
  });

  it('errors on an empty laborIds array, sending nothing', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: [], technicianId: 'usr-9' });
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.length, 0);
  });

  it('errors without orderId or technicianId, sending nothing', async () => {
    setupMock(mockSuccess({}));
    assert.equal((await labor.handlers.assign_technician({ technicianId: 'usr-9' })).isError, true);
    assert.equal((await labor.handlers.assign_technician({ orderId: 'ord-1', laborIds: ['lab-1'] })).isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});

// ─── list_timeclock ───────────────────────────────────────────────────────────

describe('list_timeclock', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends POST /timesheet/search (documented), never GET /timeclock', async () => {
    setupMock(mockSuccess([]));
    const result = await labor.handlers.list_timeclock({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.equal(new URL(capturedRequests[0].url).pathname.endsWith('/timesheet/search'), true);
    assert.ok(!result.isError);
  });

  it('sends userId as where.technicianId.in', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ userId: 'user-1' });
    assert.deepEqual(reqBody().where, { technicianId: { in: ['user-1'] } });
  });

  it('sends the location as the documented top-level locationIds array', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ locationId: 'loc-1' });
    assert.deepEqual(reqBody().locationIds, ['loc-1']);
  });

  it('injects SHOPMONKEY_LOCATION_ID when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({});
    assert.deepEqual(reqBody().locationIds, ['loc-from-env']);
  });

  it('passes limit and skip in the body when no date range is given', async () => {
    setupMock(mockSuccess([]));
    await labor.handlers.list_timeclock({ limit: 50, skip: 5 });
    assert.equal(reqBody().limit, 50);
    assert.equal(reqBody().skip, 5);
  });

  it('never sends dates to the server — none are documented — and filters on clockIn locally', async () => {
    setupMock(mockSuccess([
      { id: 'a', clockIn: '2026-05-02T09:00:00Z' },
      { id: 'b', clockIn: '2026-05-09T09:00:00Z' },
      { id: 'c', clockIn: '2026-05-07T23:00:00Z' },
    ]));
    const result = await labor.handlers.list_timeclock({ startDate: '2026-05-01', endDate: '2026-05-07' });
    const sent = JSON.stringify(reqBody());
    assert.ok(!sent.includes('2026-05'));
    const out = jsonOf(result);
    assert.deepEqual(out.results.map((e: { id: string }) => e.id), ['a', 'c']);
    assert.equal(out.scanned, 3);
    assert.equal(out.truncated, false);
    assert.ok(out.filtering.includes('client-side'));
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
