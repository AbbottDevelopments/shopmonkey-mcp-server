import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as webhooks from '../tools/webhooks.js';

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

describe('Webhooks — CRUD', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('list_webhooks sends GET /webhook', async () => {
    setupMock(mockSuccess([{ id: 'wh-1', name: 'test-hook' }]));
    const result = await webhooks.handlers.list_webhooks({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/webhook'));
    assert.ok(!result.isError);
  });

  it('get_webhook sends GET /webhook/:id', async () => {
    setupMock(mockSuccess({ id: 'wh-1', name: 'test-hook' }));
    const result = await webhooks.handlers.get_webhook({ id: 'wh-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/webhook/wh-1'));
    assert.ok(!result.isError);
  });

  it('get_webhook requires id', async () => {
    const result = await webhooks.handlers.get_webhook({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('create_webhook sends POST /webhook with triggers array', async () => {
    setupMock(mockSuccess({ id: 'wh-new' }));
    const result = await webhooks.handlers.create_webhook({
      name: 'make-ghl', url: 'https://hook.make.com/abc', triggers: ['Payment', 'Order'],
    });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/webhook'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.deepEqual(body.triggers, ['Payment', 'Order']);
    assert.equal(body.name, 'make-ghl');
    assert.equal(body.url, 'https://hook.make.com/abc');
    assert.ok(!result.isError);
  });

  it('create_webhook requires name', async () => {
    const result = await webhooks.handlers.create_webhook({ url: 'https://x.com', triggers: ['Order'] });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('name is required'));
  });

  it('create_webhook requires url', async () => {
    const result = await webhooks.handlers.create_webhook({ name: 'hook', triggers: ['Order'] });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('url is required'));
  });

  it('create_webhook requires triggers', async () => {
    const result = await webhooks.handlers.create_webhook({ name: 'hook', url: 'https://x.com' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('triggers is required'));
  });

  it('update_webhook sends PUT /webhook/:id', async () => {
    setupMock(mockSuccess({ id: 'wh-1' }));
    const result = await webhooks.handlers.update_webhook({ id: 'wh-1', enabled: false });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.endsWith('/webhook/wh-1'));
    assert.ok(!result.isError);
  });

  it('update_webhook requires id', async () => {
    const result = await webhooks.handlers.update_webhook({ enabled: false });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });

  it('delete_webhook sends DELETE /webhook/:id', async () => {
    setupMock(mock204());
    const result = await webhooks.handlers.delete_webhook({ id: 'wh-1' });
    assert.equal(capturedRequests[0].method, 'DELETE');
    assert.ok(capturedRequests[0].url.endsWith('/webhook/wh-1'));
    assert.ok(!result.isError);
    assert.ok(result.content[0].text.includes('deleted successfully'));
  });

  it('delete_webhook requires id', async () => {
    const result = await webhooks.handlers.delete_webhook({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });
});

describe('Webhooks — Schema validation', () => {
  it('create_webhook definition has 11-member trigger enum', () => {
    const def = webhooks.definitions.find(d => d.name === 'create_webhook');
    assert.ok(def, 'create_webhook definition not found');
    const schema = def.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const triggersEnum = (props.triggers.items as Record<string, unknown>).enum as string[];
    assert.deepEqual(triggersEnum.sort(), [
      'Appointment', 'Customer', 'Inspection', 'Inventory', 'Message',
      'Order', 'Payment', 'PurchaseOrder', 'User', 'Vehicle', 'Vendor',
    ].sort());
    assert.equal(triggersEnum.length, 11);
  });
});
