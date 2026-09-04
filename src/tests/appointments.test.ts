import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as appointments from '../tools/appointments.js';

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

// ─── list_appointments ────────────────────────────────────────────────────────

describe('list_appointments', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /appointment with no params when called with no args', async () => {
    setupMock(mockSuccess([]));
    const result = await appointments.handlers.list_appointments({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/appointment'));
    assert.ok(!result.isError);
  });

  it('passes customerId as a query param', async () => {
    setupMock(mockSuccess([]));
    await appointments.handlers.list_appointments({ customerId: 'cust-1' });
    assert.ok(capturedRequests[0].url.includes('customerId=cust-1'));
  });

  it('passes date range as query params', async () => {
    setupMock(mockSuccess([]));
    await appointments.handlers.list_appointments({ startDate: '2026-05-01T00:00:00Z', endDate: '2026-05-31T23:59:59Z' });
    assert.ok(capturedRequests[0].url.includes('startDate='));
    assert.ok(capturedRequests[0].url.includes('endDate='));
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await appointments.handlers.list_appointments({ limit: 10, skip: 5 });
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.ok(capturedRequests[0].url.includes('skip=5'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await appointments.handlers.list_appointments({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await appointments.handlers.list_appointments({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });
});

// ─── get_appointment ──────────────────────────────────────────────────────────

describe('get_appointment', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /appointment/:id', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    const result = await appointments.handlers.get_appointment({ id: 'appt-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/appointment/appt-1'));
    assert.ok(!result.isError);
  });

  it('returns the appointment data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'appt-1', title: 'Oil Change', startDate: '2026-05-15T09:00:00Z' }));
    const result = await appointments.handlers.get_appointment({ id: 'appt-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.title, 'Oil Change');
  });

  it('returns an error when id is missing', async () => {
    const result = await appointments.handlers.get_appointment({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });
});

// ─── create_appointment ───────────────────────────────────────────────────────

describe('create_appointment', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends POST /appointment', async () => {
    setupMock(mockSuccess({ id: 'appt-new' }));
    const result = await appointments.handlers.create_appointment({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.endsWith('/appointment'));
    assert.ok(!result.isError);
  });

  it('sends all create fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'appt-new' }));
    await appointments.handlers.create_appointment({
      customerId: 'cust-1', vehicleId: 'veh-1', orderId: 'ord-1',
      startDate: '2026-05-15T09:00:00Z', endDate: '2026-05-15T10:00:00Z',
      title: 'Oil Change', notes: 'Customer requests synthetic',
    });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.vehicleId, 'veh-1');
    assert.equal(body.orderId, 'ord-1');
    assert.equal(body.title, 'Oil Change');
    assert.equal(body.notes, 'Customer requests synthetic');
  });

  it('injects SHOPMONKEY_LOCATION_ID env var into the body', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess({ id: 'appt-new' }));
    await appointments.handlers.create_appointment({});
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-from-env');
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess({ id: 'appt-new' }));
    await appointments.handlers.create_appointment({ locationId: 'loc-explicit' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-explicit');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'appt-new' }));
    await appointments.handlers.create_appointment({ title: 'Oil Change', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.title, 'Oil Change');
  });
});

// ─── update_appointment ───────────────────────────────────────────────────────

describe('update_appointment', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT /appointment/:id', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    const result = await appointments.handlers.update_appointment({ id: 'appt-1', title: 'Brake Service' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/appointment/appt-1'));
    assert.ok(!result.isError);
  });

  it('sends allowed update fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    await appointments.handlers.update_appointment({ id: 'appt-1', title: 'Rescheduled', startDate: '2026-05-20T10:00:00Z', notes: 'Moved at customer request' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.title, 'Rescheduled');
    assert.equal(body.notes, 'Moved at customer request');
  });

  it('returns an error when id is missing', async () => {
    const result = await appointments.handlers.update_appointment({ title: 'Test' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('does not send id in the request body', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    await appointments.handlers.update_appointment({ id: 'appt-1', title: 'Updated' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.id, undefined);
  });

  it('does not send locationId in update body (locationId is create-only)', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    await appointments.handlers.update_appointment({ id: 'appt-1', title: 'Updated' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, undefined);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'appt-1' }));
    await appointments.handlers.update_appointment({ id: 'appt-1', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });
});
