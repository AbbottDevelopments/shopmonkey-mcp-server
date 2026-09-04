import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as payments from '../tools/payments.js';

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

// ─── list_payments ────────────────────────────────────────────────────────────

describe('list_payments', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends GET /payment with no params when called with no args', async () => {
    setupMock(mockSuccess([]));
    const result = await payments.handlers.list_payments({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.includes('/payment'));
    assert.ok(!result.isError);
  });

  it('passes orderId as a query param', async () => {
    setupMock(mockSuccess([]));
    await payments.handlers.list_payments({ orderId: 'ord-1' });
    assert.ok(capturedRequests[0].url.includes('orderId=ord-1'));
  });

  it('passes limit and skip for pagination', async () => {
    setupMock(mockSuccess([]));
    await payments.handlers.list_payments({ limit: 10, skip: 20 });
    assert.ok(capturedRequests[0].url.includes('limit=10'));
    assert.ok(capturedRequests[0].url.includes('skip=20'));
  });

  it('injects SHOPMONKEY_LOCATION_ID env var when no locationId arg is provided', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await payments.handlers.list_payments({});
    assert.ok(capturedRequests[0].url.includes('locationId=loc-from-env'));
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([]));
    await payments.handlers.list_payments({ locationId: 'loc-explicit' });
    assert.ok(capturedRequests[0].url.includes('locationId=loc-explicit'));
    assert.ok(!capturedRequests[0].url.includes('loc-from-env'));
  });
});

// ─── get_payment ──────────────────────────────────────────────────────────────

describe('get_payment', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /payment/:id', async () => {
    setupMock(mockSuccess({ id: 'pay-1', amountCents: 15050 }));
    const result = await payments.handlers.get_payment({ id: 'pay-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/payment/pay-1'));
    assert.ok(!result.isError);
  });

  it('returns the payment data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'pay-1', amountCents: 15050, method: 'cash' }));
    const result = await payments.handlers.get_payment({ id: 'pay-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.amountCents, 15050);
    assert.equal(parsed.method, 'cash');
  });

  it('returns an error when id is missing', async () => {
    const result = await payments.handlers.get_payment({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('id is required'));
  });
});

// ─── create_payment ───────────────────────────────────────────────────────────

describe('create_payment', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /payment with required fields', async () => {
    setupMock(mockSuccess({ id: 'pay-new' }));
    const result = await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 15050 });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.endsWith('/payment'));
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.orderId, 'ord-1');
    assert.equal(body.amountCents, 15050);
    assert.ok(!result.isError);
  });

  it('sends optional method and notes in the body', async () => {
    setupMock(mockSuccess({ id: 'pay-new' }));
    await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 5000, method: 'credit_card', notes: 'Visa ending 4242' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.method, 'credit_card');
    assert.equal(body.notes, 'Visa ending 4242');
  });

  it('returns an error when orderId is missing', async () => {
    const result = await payments.handlers.create_payment({ amountCents: 5000 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('orderId is required'));
  });

  it('returns an error when amountCents is missing', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-1' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('amountCents is required'));
  });

  it('rejects decimal amountCents (guard against dollars-instead-of-cents bug)', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 150.50 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('positive integer'));
  });

  it('rejects zero amountCents', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 0 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('positive integer'));
  });

  it('rejects negative amountCents', async () => {
    const result = await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: -500 });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('positive integer'));
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'pay-new' }));
    await payments.handlers.create_payment({ orderId: 'ord-1', amountCents: 5000, hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
  });
});
