import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as customers from '../tools/customers.js';

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

// ─── search_customers ─────────────────────────────────────────────────────────

describe('search_customers', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends POST /customer/search', async () => {
    setupMock(mockSuccess([]));
    const result = await customers.handlers.search_customers({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/search'));
    assert.ok(!result.isError);
  });

  it('sends query in the request body', async () => {
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({ query: 'John Smith' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.query, 'John Smith');
  });

  it('sends limit and skip in the request body', async () => {
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({ limit: 10, skip: 5 });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.limit, 10);
    assert.equal(body.skip, 5);
  });

  it('injects SHOPMONKEY_LOCATION_ID env var into search body', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({});
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-from-env');
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({ locationId: 'loc-explicit' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.locationId, 'loc-explicit');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({ query: 'Test', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });
});

// ─── search_customers_by_email ────────────────────────────────────────────────

describe('search_customers_by_email', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /customer/email/search with email in body', async () => {
    setupMock(mockSuccess([]));
    const result = await customers.handlers.search_customers_by_email({ email: 'test@example.com' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/email/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.email, 'test@example.com');
    assert.ok(!result.isError);
  });

  it('returns an error when email is missing', async () => {
    const result = await customers.handlers.search_customers_by_email({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('email is required'));
  });
});

// ─── search_customers_by_phone ────────────────────────────────────────────────

describe('search_customers_by_phone', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /customer/phone_number/search with phoneNumber in body', async () => {
    setupMock(mockSuccess([]));
    const result = await customers.handlers.search_customers_by_phone({ phoneNumber: '555-867-5309' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/phone_number/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.phoneNumber, '555-867-5309');
    assert.ok(!result.isError);
  });

  it('returns an error when phoneNumber is missing', async () => {
    const result = await customers.handlers.search_customers_by_phone({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('phoneNumber is required'));
  });
});

// ─── get_customer ─────────────────────────────────────────────────────────────

describe('get_customer', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /customer/:id', async () => {
    setupMock(mockSuccess({ id: 'cust-1', firstName: 'Jake' }));
    const result = await customers.handlers.get_customer({ id: 'cust-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/customer/cust-1'));
    assert.ok(!result.isError);
  });

  it('returns the customer data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'cust-1', firstName: 'Jake', lastName: 'Abbott' }));
    const result = await customers.handlers.get_customer({ id: 'cust-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.firstName, 'Jake');
  });

  it('returns an error when id is missing', async () => {
    const result = await customers.handlers.get_customer({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('URL-encodes special characters in the id', async () => {
    setupMock(mockSuccess({ id: 'cust/1' }));
    await customers.handlers.get_customer({ id: 'cust/1' });
    assert.ok(capturedRequests[0].url.includes('cust%2F1'));
  });
});

// ─── create_customer ──────────────────────────────────────────────────────────

describe('create_customer', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /customer', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    const result = await customers.handlers.create_customer({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.endsWith('/customer'));
    assert.ok(!result.isError);
  });

  it('sends allowed fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jake', lastName: 'Abbott', city: 'Portland', state: 'OR', zip: '97201' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'Jake');
    assert.equal(body.lastName, 'Abbott');
    assert.equal(body.city, 'Portland');
    assert.equal(body.state, 'OR');
    assert.equal(body.zip, '97201');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jake', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.firstName, 'Jake');
  });
});

// ─── update_customer ──────────────────────────────────────────────────────────

describe('update_customer', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT /customer/:id', async () => {
    setupMock(mockSuccess({ id: 'cust-1' }));
    const result = await customers.handlers.update_customer({ id: 'cust-1', firstName: 'James' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/customer/cust-1'));
    assert.ok(!result.isError);
  });

  it('sends allowed update fields in the request body', async () => {
    setupMock(mockSuccess({ id: 'cust-1' }));
    await customers.handlers.update_customer({ id: 'cust-1', firstName: 'James', lastName: 'Smith' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'James');
    assert.equal(body.lastName, 'Smith');
  });

  it('returns an error when id is missing', async () => {
    const result = await customers.handlers.update_customer({ firstName: 'James' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('does not send id in the request body', async () => {
    setupMock(mockSuccess({ id: 'cust-1' }));
    await customers.handlers.update_customer({ id: 'cust-1', firstName: 'James' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.id, undefined);
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'cust-1' }));
    await customers.handlers.update_customer({ id: 'cust-1', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });
});
