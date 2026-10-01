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

const reqBody = (i = 0) => JSON.parse(capturedRequests[i].body ?? '{}') as Record<string, unknown>;
const text = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);

function envReset() {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });
}

// ─── list_inventory_parts ─────────────────────────────────────────────────────

describe('list_inventory_parts', () => {
  envReset();

  it('sends POST /inventory_part/search (the documented route), never /inventory/part', async () => {
    setupMock(mockSuccess([]));
    const result = await inventory.handlers.list_inventory_parts({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.equal(new URL(capturedRequests[0].url).pathname.endsWith('/inventory_part/search'), true);
    assert.ok(!capturedRequests[0].url.includes('/inventory/part'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip in the request body', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ limit: 50, skip: 10 });
    assert.equal(reqBody().limit, 50);
    assert.equal(reqBody().skip, 10);
  });

  it('sends an explicit locationId as where.locationId', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ locationId: 'loc-1' });
    assert.deepEqual(reqBody().where, { locationId: 'loc-1' });
  });

  it('injects SHOPMONKEY_LOCATION_ID when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({});
    assert.deepEqual(reqBody().where, { locationId: 'loc-from-env' });
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_parts({ locationId: 'loc-explicit' });
    assert.deepEqual(reqBody().where, { locationId: 'loc-explicit' });
  });

  it('drops records from other locations when the server ignores the where filter', async () => {
    setupMock(mockSuccess([{ id: 'a', locationId: 'loc-1' }, { id: 'b', locationId: 'loc-2' }]));
    const result = await inventory.handlers.list_inventory_parts({ locationId: 'loc-1' });
    assert.deepEqual(text(result).map((r: { id: string }) => r.id), ['a']);
  });
});

// ─── get_inventory_part ───────────────────────────────────────────────────────

describe('get_inventory_part', () => {
  envReset();

  it('sends GET /inventory_part/:id', async () => {
    setupMock(mockSuccess({ id: 'part-1', name: 'Oil Filter' }));
    const result = await inventory.handlers.get_inventory_part({ id: 'part-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/inventory_part/part-1'));
    assert.ok(!result.isError);
  });

  it('returns the part data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'part-1', name: 'Oil Filter', quantity: 12 }));
    const parsed = text(await inventory.handlers.get_inventory_part({ id: 'part-1' }));
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
  envReset();

  it('sends POST /inventory_tire/search, never /inventory/tire', async () => {
    setupMock(mockSuccess([]));
    const result = await inventory.handlers.list_inventory_tires({});
    assert.equal(capturedRequests[0].method, 'POST');
    assert.equal(new URL(capturedRequests[0].url).pathname.endsWith('/inventory_tire/search'), true);
    assert.ok(!result.isError);
  });

  it('passes limit and skip in the request body', async () => {
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_tires({ limit: 10, skip: 20 });
    assert.equal(reqBody().limit, 10);
    assert.equal(reqBody().skip, 20);
  });

  it('injects SHOPMONKEY_LOCATION_ID when no locationId is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await inventory.handlers.list_inventory_tires({});
    assert.deepEqual(reqBody().where, { locationId: 'loc-from-env' });
  });
});

// ─── search_parts ─────────────────────────────────────────────────────────────

describe('search_parts', () => {
  envReset();

  const catalog = [
    { id: '1', name: 'Oil Filter', partNumber: 'OF-100' },
    { id: '2', name: 'Air Filter', partNumber: 'AF-200', note: 'fits most sedans' },
    { id: '3', name: 'Brake Pad Set', sku: 'BP-300' },
  ];

  it('pages POST /inventory_part/search and never calls the order line-item /part route', async () => {
    setupMock(mockSuccess(catalog));
    const result = await inventory.handlers.search_parts({ query: 'filter' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.equal(new URL(capturedRequests[0].url).pathname.endsWith('/inventory_part/search'), true);
    assert.ok(!result.isError);
  });

  it('matches every word, case-insensitively, across name, number, sku and note', async () => {
    setupMock(mockSuccess(catalog));
    assert.deepEqual(text(await inventory.handlers.search_parts({ query: 'FILTER' })).results.map((r: { id: string }) => r.id), ['1', '2']);
    setupMock(mockSuccess(catalog));
    assert.deepEqual(text(await inventory.handlers.search_parts({ query: 'air sedans' })).results.map((r: { id: string }) => r.id), ['2']);
    setupMock(mockSuccess(catalog));
    assert.deepEqual(text(await inventory.handlers.search_parts({ query: 'bp-300' })).results.map((r: { id: string }) => r.id), ['3']);
  });

  it('says the matching was done client-side and reports scanned/truncated', async () => {
    setupMock(mockSuccess(catalog));
    const parsed = text(await inventory.handlers.search_parts({ query: 'filter' }));
    assert.equal(parsed.filtering, 'client-side');
    assert.equal(parsed.scanned, 3);
    assert.equal(parsed.truncated, false);
  });

  it('applies limit and skip to the matches', async () => {
    setupMock(mockSuccess(catalog));
    const parsed = text(await inventory.handlers.search_parts({ query: 'filter', limit: 1, skip: 1 }));
    assert.equal(parsed.matched, 2);
    assert.deepEqual(parsed.results.map((r: { id: string }) => r.id), ['2']);
  });

  it('returns an error when query is missing or has no usable word', async () => {
    assert.ok((await inventory.handlers.search_parts({})).isError);
    assert.ok((await inventory.handlers.search_parts({ query: 'a' })).isError);
  });
});
