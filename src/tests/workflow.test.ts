import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as workflow from '../tools/workflow.js';

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

// ─── list_workflow_statuses ───────────────────────────────────────────────────

describe('list_workflow_statuses', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /workflow_status', async () => {
    setupMock(mockSuccess([]));
    const result = await workflow.handlers.list_workflow_statuses({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/workflow_status'));
    assert.ok(!result.isError);
  });

  it('passes explicit locationId as a query param', async () => {
    setupMock(mockSuccess([]));
    await workflow.handlers.list_workflow_statuses({ locationId: 'loc-1' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-1'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await workflow.handlers.list_workflow_statuses({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await workflow.handlers.list_workflow_statuses({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });

  it('returns workflow status data as JSON text', async () => {
    const fakeStatuses = [{ id: 'ws-1', name: 'Waiting for Parts' }, { id: 'ws-2', name: 'In Progress' }];
    setupMock(mockSuccess(fakeStatuses));
    const result = await workflow.handlers.list_workflow_statuses({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, 'Waiting for Parts');
  });
});

// ─── list_locations ───────────────────────────────────────────────────────────

describe('list_locations', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /location', async () => {
    setupMock(mockSuccess([]));
    const result = await workflow.handlers.list_locations({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/location'));
    assert.ok(!result.isError);
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await workflow.handlers.list_locations({ limit: 5, skip: 0 });
    assert.ok(capturedRequests[0].url.includes('limit=5'));
  });

  it('returns location data as JSON text', async () => {
    const fakeLocations = [{ id: 'loc-1', name: 'Main Shop' }, { id: 'loc-2', name: 'North Location' }];
    setupMock(mockSuccess(fakeLocations));
    const result = await workflow.handlers.list_locations({});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, 'Main Shop');
  });

  it('does not inject locationId (list_locations has no location filter)', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await workflow.handlers.list_locations({});
    assert.ok(!capturedRequests[0].url.includes('locationId'));
    delete process.env.SHOPMONKEY_LOCATION_ID;
  });
});
