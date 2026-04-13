import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as services from '../tools/services.js';

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
      { status: mock.status ?? 200, headers: responseHeaders }
    );
  }) as typeof fetch;
}

function mockSuccess(data: unknown): MockResponse {
  return { status: 200, body: { success: true, data } };
}

function mock204(): MockResponse {
  return { status: 204, headers: { 'content-length': '0' } };
}

describe('Canned Service — CRUD', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('create_canned_service sends POST /canned_service with body', async () => {
    setupMock(mockSuccess({ id: 'cs-new', name: 'Oil Change' }));
    const result = await services.handlers.create_canned_service({
      name: 'Oil Change', pricing: 'FixedPrice', fixedPriceCents: 5999,
    });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/canned_service'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.name, 'Oil Change');
    assert.equal(body.pricing, 'FixedPrice');
    assert.equal(body.fixedPriceCents, 5999);
    assert.ok(!result.isError);
  });

  it('create_canned_service rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'cs-new' }));
    await services.handlers.create_canned_service({ name: 'Test', hackerField: 'bad', injected: true });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.injected, undefined);
    assert.equal(body.name, 'Test');
  });

  it('update_canned_service sends PUT /canned_service/:id', async () => {
    setupMock(mockSuccess({ id: 'cs-1', name: 'Premium Oil Change' }));
    const result = await services.handlers.update_canned_service({ id: 'cs-1', name: 'Premium Oil Change' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/canned_service/cs-1'));
    assert.ok(!result.isError);
  });

  it('update_canned_service requires id', async () => {
    const result = await services.handlers.update_canned_service({ name: 'Updated' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('update_canned_service does not send locationId', async () => {
    setupMock(mockSuccess({ id: 'cs-1' }));
    await services.handlers.update_canned_service({ id: 'cs-1', name: 'Test' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, undefined);
  });

  it('delete_canned_service sends DELETE /canned_service/:id', async () => {
    setupMock(mock204());
    const result = await services.handlers.delete_canned_service({ id: 'cs-1' });
    assert.equal(capturedRequests[0].method, 'DELETE');
    assert.ok(capturedRequests[0].url.endsWith('/canned_service/cs-1'));
    assert.ok(!result.isError);
    assert.ok(result.content[0].text.includes('deleted successfully'));
  });

  it('delete_canned_service requires id', async () => {
    const result = await services.handlers.delete_canned_service({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });
});

describe('Canned Service — Fee line items', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('add_canned_service_fee sends POST /canned_service/:id/fee', async () => {
    setupMock(mockSuccess({ id: 'fee-1' }));
    const result = await services.handlers.add_canned_service_fee({
      cannedServiceId: 'cs-1', name: 'Shop Fee', unitPriceCents: 500,
    });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/fee'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.name, 'Shop Fee');
    assert.equal(body.unitPriceCents, 500);
    assert.ok(!result.isError);
  });

  it('update_canned_service_fee sends PUT /canned_service/:id/fee/:itemId', async () => {
    setupMock(mockSuccess({ id: 'fee-1' }));
    const result = await services.handlers.update_canned_service_fee({
      cannedServiceId: 'cs-1', itemId: 'fee-1', unitPriceCents: 600,
    });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/fee/fee-1'));
    assert.ok(!result.isError);
  });

  it('remove_canned_service_fee sends DELETE /canned_service/:id/fee/:itemId', async () => {
    setupMock(mock204());
    const result = await services.handlers.remove_canned_service_fee({
      cannedServiceId: 'cs-1', itemId: 'fee-1',
    });
    assert.equal(capturedRequests[0].method, 'DELETE');
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/fee/fee-1'));
    assert.ok(!result.isError);
  });
});

describe('Canned Service — Part line items', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('add_canned_service_part sends POST /canned_service/:id/part with body', async () => {
    setupMock(mockSuccess({ id: 'part-line-1' }));
    const result = await services.handlers.add_canned_service_part({
      cannedServiceId: 'cs-1', name: 'Oil Filter', quantity: 1, unitPriceCents: 1299,
    });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/part'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.name, 'Oil Filter');
    assert.equal(body.quantity, 1);
    assert.equal(body.unitPriceCents, 1299);
    assert.ok(!result.isError);
  });

  it('update_canned_service_part sends PUT', async () => {
    setupMock(mockSuccess({ id: 'part-line-1' }));
    const result = await services.handlers.update_canned_service_part({
      cannedServiceId: 'cs-1', itemId: 'part-line-1', quantity: 2,
    });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/part/part-line-1'));
    assert.ok(!result.isError);
  });

  it('remove_canned_service_part sends DELETE', async () => {
    setupMock(mock204());
    const result = await services.handlers.remove_canned_service_part({
      cannedServiceId: 'cs-1', itemId: 'part-line-1',
    });
    assert.equal(capturedRequests[0].method, 'DELETE');
    assert.ok(!result.isError);
  });
});

describe('Canned Service — Labor, Subcontract, Tire line items (endpoint spot-checks)', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('add_canned_service_labor hits /labor path', async () => {
    setupMock(mockSuccess({ id: 'lab-1' }));
    await services.handlers.add_canned_service_labor({ cannedServiceId: 'cs-1', name: 'Tech Labor' });
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/labor'));
    assert.equal(capturedRequests[0].method, 'POST');
  });

  it('add_canned_service_subcontract hits /subcontract path', async () => {
    setupMock(mockSuccess({ id: 'sub-1' }));
    await services.handlers.add_canned_service_subcontract({ cannedServiceId: 'cs-1', name: 'Alignment Shop' });
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/subcontract'));
  });

  it('add_canned_service_tire hits /tire path', async () => {
    setupMock(mockSuccess({ id: 'tire-1' }));
    await services.handlers.add_canned_service_tire({ cannedServiceId: 'cs-1', name: 'All-Season 205/55R16' });
    assert.ok(capturedRequests[0].url.includes('/canned_service/cs-1/tire'));
  });

  it('remove ops require both cannedServiceId and itemId', async () => {
    const r1 = await services.handlers.remove_canned_service_labor({ cannedServiceId: 'cs-1' });
    assert.ok(r1.isError);
    assert.ok(r1.content[0].text.includes('itemId is required'));

    const r2 = await services.handlers.remove_canned_service_tire({ itemId: 'tire-1' });
    assert.ok(r2.isError);
    assert.ok(r2.content[0].text.includes('cannedServiceId is required'));
  });
});

describe('Canned Service — Deferred services', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_customer_deferred_services sends GET /customer/:id/deferred_service', async () => {
    setupMock(mockSuccess([{ id: 'def-1' }]));
    const result = await services.handlers.list_customer_deferred_services({ customerId: 'c1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/customer/c1/deferred_service'));
    assert.ok(!result.isError);
  });

  it('list_customer_deferred_services requires customerId', async () => {
    const result = await services.handlers.list_customer_deferred_services({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('customerId is required'));
  });
});
