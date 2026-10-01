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

const reqBody = (i = 0) => JSON.parse(capturedRequests[i].body ?? '{}') as Record<string, unknown>;
const jsonOf = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);
const cust = (id: string, first: string, last: string, extra: Record<string, unknown> = {}) =>
  ({ id, firstName: first, lastName: last, normalizedName: `${first} ${last}`.toLowerCase(), ...extra });

// ─── search_customers ─────────────────────────────────────────────────────────

describe('search_customers', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; delete process.env.SHOPMONKEY_LOCATION_ID; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; if (originalLocationId) process.env.SHOPMONKEY_LOCATION_ID = originalLocationId; });

  it('sends POST /customer/search with a normalizedName contains filter for the query word', async () => {
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith')]));
    const result = await customers.handlers.search_customers({ query: 'smith' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/search'));
    assert.deepEqual(reqBody().where, { normalizedName: { contains: 'smith' } });
    assert.ok(!result.isError);
  });

  it('never sends the free-text `query` field the API ignores', async () => {
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith')]));
    await customers.handlers.search_customers({ query: 'smith' });
    assert.equal('query' in reqBody(), false);
  });

  it('searches each word separately and unions the results, best match first', async () => {
    setupMock([
      mockSuccess([cust('1', 'Ann', 'Smith'), cust('3', 'Ann', 'Jones')]), // contains "ann"
      mockSuccess([cust('1', 'Ann', 'Smith'), cust('2', 'Bob', 'Smith')]), // contains "smith"
    ]);
    const out = jsonOf(await customers.handlers.search_customers({ query: 'ann smith' }));
    assert.equal(capturedRequests.length, 2);
    assert.deepEqual(out.wordsSearched, ['ann', 'smith']);
    assert.equal(out.filtering, 'server-side (per-word contains)');
    assert.equal(out.results[0].id, '1');
    assert.equal(out.matched, 1); // only record 1 matches every word
  });

  it('returns compact summaries rather than full records', async () => {
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith', { emails: [{ email: 'ann@example.com' }], phoneNumbers: [{ number: '5551234' }], hugeField: 'x'.repeat(500) })]));
    const out = jsonOf(await customers.handlers.search_customers({ query: 'smith' }));
    assert.deepEqual(out.results[0].emails, ['ann@example.com']);
    assert.deepEqual(out.results[0].phoneNumbers, ['5551234']);
    assert.equal('hugeField' in out.results[0], false);
  });

  it('falls back to a client-side scan, with a loud coverage warning, when the filter is not honoured', async () => {
    setupMock([
      mockSuccess([cust('9', 'Zed', 'Unrelated')]), // server ignored the filter: record does not contain the word
      mockSuccess([cust('1', 'Ann', 'Smith'), cust('9', 'Zed', 'Unrelated')]),
    ]);
    const out = jsonOf(await customers.handlers.search_customers({ query: 'smith' }));
    assert.equal(out.filtering, 'client-side fallback');
    assert.ok(out.coverage.includes('NOT proof'));
    assert.deepEqual(out.results.map((r: { id: string }) => r.id), ['1']);
  });

  it('falls back rather than failing if the filtered request errors', async () => {
    setupMock([{ status: 400, body: { success: false, message: 'bad where' } }, mockSuccess([cust('1', 'Ann', 'Smith')])]);
    const out = jsonOf(await customers.handlers.search_customers({ query: 'smith' }));
    assert.equal(out.filtering, 'client-side fallback');
  });

  it('passes a raw where object through verbatim when given', async () => {
    setupMock(mockSuccess([]));
    await customers.handlers.search_customers({ where: { companyName: { contains: 'acme' } } });
    assert.deepEqual(reqBody().where, { companyName: { contains: 'acme' } });
  });

  it('injects SHOPMONKEY_LOCATION_ID env var into the search body', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith')]));
    await customers.handlers.search_customers({ query: 'smith' });
    assert.equal(reqBody().locationId, 'loc-from-env');
  });

  it('does not override an explicit locationId with the env var', async () => {
    process.env.SHOPMONKEY_LOCATION_ID = 'loc-from-env';
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith')]));
    await customers.handlers.search_customers({ query: 'smith', locationId: 'loc-explicit' });
    assert.equal(reqBody().locationId, 'loc-explicit');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess([cust('1', 'Ann', 'Smith')]));
    await customers.handlers.search_customers({ query: 'smith', hackerField: 'bad' });
    assert.equal(reqBody().hackerField, undefined);
  });
});

describe('rankCustomerMatches', () => {
  it('prefers records that match every word, and otherwise ranks by word specificity', () => {
    const records = [cust('a', 'Ann', 'Jones'), cust('b', 'Annabel', 'Smith'), cust('c', 'Bob', 'Smith')] as never[];
    assert.deepEqual(customers.rankCustomerMatches(records, 'annabel smith').map((r) => (r as { id: string }).id), ['b']);
    assert.deepEqual(customers.rankCustomerMatches(records, 'annabel jones').map((r) => (r as { id: string }).id), ['b', 'a']);
  });

  it('does not resolve nicknames that are not literal substrings', () => {
    assert.deepEqual(customers.rankCustomerMatches([cust('r', 'Robert', 'Lee')] as never[], 'bob lee').length, 1); // matches on "lee" only
    assert.deepEqual(customers.rankCustomerMatches([cust('r', 'Robert', 'Lee')] as never[], 'bob'), []);
  });
});

// ─── search_customers_by_email ────────────────────────────────────────────────

describe('search_customers_by_email', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends POST /customer/email/search with emails as plain strings first', async () => {
    setupMock(mockSuccess([]));
    const result = await customers.handlers.search_customers_by_email({ email: 'test@example.com' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/email/search'));
    assert.deepEqual(reqBody(), { emails: ['test@example.com'] });
    assert.equal(capturedRequests.length, 1);
    assert.ok(!result.isError);
  });

  it('retries once with the { email } object form if the API rejects strings', async () => {
    setupMock([{ status: 400, body: { success: false, message: 'emails must be objects' } }, mockSuccess([{ id: 'c1' }])]);
    const result = await customers.handlers.search_customers_by_email({ email: 'test@example.com' });
    assert.equal(capturedRequests.length, 2);
    assert.deepEqual(reqBody(1), { emails: [{ email: 'test@example.com' }] });
    assert.deepEqual(jsonOf(result), [{ id: 'c1' }]);
  });

  it('surfaces the error if both shapes are rejected', async () => {
    setupMock([{ status: 400, body: { success: false, message: 'no' } }, { status: 400, body: { success: false, message: 'still no' } }]);
    await assert.rejects(() => customers.handlers.search_customers_by_email({ email: 'a@b.co' }), /still no/);
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

  it('sends POST /customer/phone_number/search with the phoneNumbers object body', async () => {
    setupMock(mockSuccess([]));
    const result = await customers.handlers.search_customers_by_phone({ phoneNumber: '555-867-5309' });
    assert.equal(capturedRequests[0].method, 'POST');
    assert.ok(capturedRequests[0].url.includes('/customer/phone_number/search'));
    const body = JSON.parse(capturedRequests[0].body!);
    // The endpoint takes an array of objects, not a bare string or a bare
    // array of strings — verified against the live API by AndyKimberle.
    assert.deepEqual(body, { phoneNumbers: [{ number: '555-867-5309' }] });
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
    setupMock(mockSuccess({ id: 'cust-1', firstName: 'Jane' }));
    const result = await customers.handlers.get_customer({ id: 'cust-1' });
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(capturedRequests[0].url.endsWith('/customer/cust-1'));
    assert.ok(!result.isError);
  });

  it('returns the customer data as JSON text', async () => {
    setupMock(mockSuccess({ id: 'cust-1', firstName: 'Jane', lastName: 'Doe' }));
    const result = await customers.handlers.get_customer({ id: 'cust-1' });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.firstName, 'Jane');
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
    await customers.handlers.create_customer({ firstName: 'Jane', lastName: 'Doe', city: 'Portland', state: 'OR', zip: '97201' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.firstName, 'Jane');
    assert.equal(body.lastName, 'Doe');
    assert.equal(body.city, 'Portland');
    assert.equal(body.state, 'OR');
    assert.equal(body.zip, '97201');
  });

  it('rejects unknown fields (pickFields security)', async () => {
    setupMock(mockSuccess({ id: 'cust-new' }));
    await customers.handlers.create_customer({ firstName: 'Jane', hackerField: 'bad' });
    const body = JSON.parse(capturedRequests[0].body!);
    assert.equal(body.hackerField, undefined);
    assert.equal(body.firstName, 'Jane');
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
