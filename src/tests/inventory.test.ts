import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as inventory from '../tools/inventory.js';

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

// ─── list_inventory_parts ─────────────────────────────────────────────────────

describe('list_inventory_parts', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /inventory/part', async () => {
    setupMock(mockSuccess([]));
    const result = await inventory.handlers.list_inventory_parts({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/inventory/part'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip as query params', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ limit: 50, skip: 0 });
    assert.ok(capturedRequests[0].url.includes('limit=50'));
  });

  it('passes explicit locationId as a query param', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ locationId: 'loc-1' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-1'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });
});

// ─── get_inventory_part ───────────────────────────────────────────────────────

describe('get_inventory_part', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /inventory/part/:id', async () => {
    setupMock(mockSuccess({ id: 'part-1', name: 'Oil Filter' }));
    const result = await inventory.handlers.get_inventory_part({ id: 'part-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/inventory/part/part-1'));
    assert.ok(!result.isError);
  });

  it('returns the part data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'part-1', name: 'Oil Filter', quantity: 12 }));
    const result = await inventory.handlers.get_inventory_part({ id: 'part-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.name, 'Oil Filter');
    assert.equal(parsed.quantity, 12);
  });

  it('returns an error when id is missing', async () => {
    const result = await inventory.handlers.get_inventory_part({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });
});

// ─── list_inventory_tires ─────────────────────────────────────────────────────

describe('list_inventory_tires', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /inventory/tire', async () => {
    setupMock(mockSuccess([]));
    const result = await inventory.handlers.list_inventory_tires({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/inventory/tire'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip as query params', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_tires({ limit: 10, skip: 20 });
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.ok(capturedRequests[0].url.includes('skip=20'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_tires({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });
});

// ─── search_parts ─────────────────────────────────────────────────────────────

describe('search_parts', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /part with query as a URL param', async () => {
    setupMock(mockSuccess([]));
    const result = await inventory.handlers.search_parts({ query: 'oil filter' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/part'));
    assert.ok(capturedRequests[0].url.includes('query=oil+filter') || capturedRequests[0].url.includes('query=oil%20filter'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip as query params', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.search_parts({ query: 'brake', limit: 5, skip: 0 });
    assert.ok(capturedRequests[0].url.includes('limit=5'));
  });

  it('returns an error when query is missing', async () => {
    const result = await inventory.handlers.search_parts({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('query is required'));
  });
});
