import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as vehicles from '../tools/vehicles.js';

const originalFetch = globalThis.fetch;

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

// ─── get_vehicle ──────────────────────────────────────────────────────────────

describe('get_vehicle', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /vehicle/:id', async () => {
    setupMock(mockSuccess({ id: 'veh-1', make: 'Toyota' }));
    const result = await vehicles.handlers.get_vehicle({ id: 'veh-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/vehicle/veh-1'));
    assert.ok(!result.isError);
  });

  it('returns the vehicle data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'veh-1', make: 'Toyota', model: 'Camry', year: 2020 }));
    const result = await vehicles.handlers.get_vehicle({ id: 'veh-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.make, 'Toyota');
    assert.equal(parsed.year, 2020);
  });

  it('returns an error when id is missing', async () => {
    const result = await vehicles.handlers.get_vehicle({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'veh/1' }));
    await vehicles.handlers.get_vehicle({ id: 'veh/1' });
    assert.ok(capturedRequests[0].url.includes('veh%2F1'));
  });
});

// ─── create_vehicle ───────────────────────────────────────────────────────────

describe('create_vehicle', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /vehicle', async () => {
    setupMock(mockSuccess({ id: 'veh-new' }));
    const result = await vehicles.handlers.create_vehicle({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.endsWith('/vehicle'));
    assert.ok(!result.isError);
  });

  it('sends allowed fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'veh-new' }));
    await vehicles.handlers.create_vehicle({ customerId: 'cust-1', make: 'Ford', model: 'F-150', year: 2022, vin: '1FTFW1ET0BFC12345', mileage: 15000 });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.customerId, 'cust-1');
    assert.equal(body.make, 'Ford');
    assert.equal(body.model, 'F-150');
    assert.equal(body.year, 2022);
    assert.equal(body.vin, '1FTFW1ET0BFC12345');
    assert.equal(body.mileage, 15000);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'veh-new' }));
    await vehicles.handlers.create_vehicle({ make: 'Ford', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.make, 'Ford');
  });
});

// ─── update_vehicle ───────────────────────────────────────────────────────────

describe('update_vehicle', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT /vehicle/:id', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    const result = await vehicles.handlers.update_vehicle({ id: 'veh-1', mileage: 20000 });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/vehicle/veh-1'));
    assert.ok(!result.isError);
  });

  it('sends allowed update fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    await vehicles.handlers.update_vehicle({ id: 'veh-1', mileage: 20000, color: 'Blue' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.mileage, 20000);
    assert.equal(body.color, 'Blue');
  });

  it('returns an error when id is missing', async () => {
    const result = await vehicles.handlers.update_vehicle({ mileage: 20000 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('does not send id in the request body', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    await vehicles.handlers.update_vehicle({ id: 'veh-1', color: 'Red' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.id, undefined);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    await vehicles.handlers.update_vehicle({ id: 'veh-1', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });
});

// ─── list_vehicles_for_customer ───────────────────────────────────────────────

describe('list_vehicles_for_customer', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /customer/:customerId/vehicle', async () => {
    setupMock(mockSuccess([]));
    const result = await vehicles.handlers.list_vehicles_for_customer({ customerId: 'cust-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/customer/cust-1/vehicle'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip as query params', async () => {
    setupMock(mockSuccess([]));
    await vehicles.handlers.list_vehicles_for_customer({ customerId: 'cust-1', limit: 5, skip: 10 });
    assert.ok(capturedRequests[0].url.includes('limit=5'));
    assert.ok(capturedRequests[0].url.includes('skip=10'));
  });

  it('returns an error when customerId is missing', async () => {
    const result = await vehicles.handlers.list_vehicles_for_customer({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('customerId is required'));
  });

  it('URL-encodes special characters in customerId', async () => {
    setupMock(mockSuccess([]));
    await vehicles.handlers.list_vehicles_for_customer({ customerId: 'cust/1' });
    assert.ok(capturedRequests[0].url.includes('cust%2F1'));
  });
});

// ─── lookup_vehicle_by_vin ────────────────────────────────────────────────────

describe('lookup_vehicle_by_vin', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /vehicle/vin/:vin', async () => {
    setupMock(mockSuccess({ id: 'veh-1', vin: '1FTFW1ET0BFC12345' }));
    const result = await vehicles.handlers.lookup_vehicle_by_vin({ vin: '1FTFW1ET0BFC12345' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/vehicle/vin/1FTFW1ET0BFC12345'));
    assert.ok(!result.isError);
  });

  it('returns an error when vin is missing', async () => {
    const result = await vehicles.handlers.lookup_vehicle_by_vin({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('vin is required'));
  });
});

// ─── lookup_vehicle_by_plate ──────────────────────────────────────────────────

describe('lookup_vehicle_by_plate', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /vehicle/license_plate/:region/:plate', async () => {
    setupMock(mockSuccess({ id: 'veh-1' }));
    const result = await vehicles.handlers.lookup_vehicle_by_plate({ region: 'US-OR', plate: 'ABC123' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/vehicle/license_plate/US-OR/ABC123'));
    assert.ok(!result.isError);
  });

  it('returns an error when region is missing', async () => {
    const result = await vehicles.handlers.lookup_vehicle_by_plate({ plate: 'ABC123' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('region is required'));
  });

  it('returns an error when plate is missing', async () => {
    const result = await vehicles.handlers.lookup_vehicle_by_plate({ region: 'US-OR' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('plate is required'));
  });
});

// ─── list_vehicle_owners ──────────────────────────────────────────────────────

describe('list_vehicle_owners', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /vehicle/:vehicleId/owners', async () => {
    setupMock(mockSuccess([]));
    const result = await vehicles.handlers.list_vehicle_owners({ vehicleId: 'veh-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/vehicle/veh-1/owners'));
    assert.ok(!result.isError);
  });

  it('returns an error when vehicleId is missing', async () => {
    const result = await vehicles.handlers.list_vehicle_owners({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('vehicleId is required'));
  });
});
