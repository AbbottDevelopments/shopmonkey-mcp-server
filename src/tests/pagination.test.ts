import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { fetchAllRecords, isWithinDateRange, toDateRangeBoundary } from '../client.js';

const originalFetch = globalThis.fetch;

type MockResponse = { status?: number; body?: unknown };
let mockResponses: MockResponse[] = [];
let capturedRequests: Array<{ url: string; method: string }> = [];

function setupMock(responses: MockResponse[]) {
  mockResponses = [...responses];
  capturedRequests = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    capturedRequests.push({ url, method: init?.method ?? 'GET' });
    const mock = mockResponses.shift() ?? { status: 200, body: { success: true, data: [] } };
    const headers = new Headers();
    headers.set('content-length', String(JSON.stringify(mock.body).length));
    return new Response(JSON.stringify(mock.body), { status: mock.status ?? 200, headers });
  }) as typeof fetch;
}

function page(data: unknown[], meta?: Record<string, unknown>): MockResponse {
  return { status: 200, body: meta ? { success: true, data, meta } : { success: true, data } };
}

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `r-${from + i}` }));

function skipOf(url: string): string | null {
  return new URL(url).searchParams.get('skip');
}

// -- toDateRangeBoundary ------------------------------------------------------

describe('toDateRangeBoundary', () => {
  it('widens a date-only value to the start of that day', () => {
    assert.equal(toDateRangeBoundary('2026-08-18', 'start'), '2026-08-18T00:00:00.000Z');
  });

  it('widens a date-only value to the end of that day', () => {
    assert.equal(toDateRangeBoundary('2026-08-18', 'end'), '2026-08-18T23:59:59.999Z');
  });

  it('leaves a full ISO datetime untouched on both edges', () => {
    const iso = '2026-08-18T12:30:00.000Z';
    assert.equal(toDateRangeBoundary(iso, 'start'), iso);
    assert.equal(toDateRangeBoundary(iso, 'end'), iso);
  });
});

// -- isWithinDateRange --------------------------------------------------------

describe('isWithinDateRange', () => {
  it('accepts anything when no bounds are given', () => {
    assert.equal(isWithinDateRange('2026-08-18T00:00:00Z'), true);
    assert.equal(isWithinDateRange(undefined), true);
  });

  it('rejects a missing or unparseable value once a bound exists', () => {
    assert.equal(isWithinDateRange(undefined, '2026-08-01'), false);
    assert.equal(isWithinDateRange(null, '2026-08-01'), false);
    assert.equal(isWithinDateRange('not-a-date', '2026-08-01'), false);
  });

  it('treats a date-only endDate as covering the whole day', () => {
    // The bug this guards: a naive parse of a bare date is midnight, which
    // would exclude everything that actually happened that day.
    assert.equal(isWithinDateRange('2026-08-18T17:45:00Z', undefined, '2026-08-18'), true);
    assert.equal(isWithinDateRange('2026-08-18T23:59:59Z', undefined, '2026-08-18'), true);
    assert.equal(isWithinDateRange('2026-08-19T00:00:01Z', undefined, '2026-08-18'), false);
  });

  it('includes both edges of a date-only range', () => {
    assert.equal(isWithinDateRange('2026-08-01T00:00:00Z', '2026-08-01', '2026-08-31'), true);
    assert.equal(isWithinDateRange('2026-08-31T23:59:59Z', '2026-08-01', '2026-08-31'), true);
    assert.equal(isWithinDateRange('2026-07-31T23:59:59Z', '2026-08-01', '2026-08-31'), false);
    assert.equal(isWithinDateRange('2026-09-01T00:00:00Z', '2026-08-01', '2026-08-31'), false);
  });
});

// -- fetchAllRecords ----------------------------------------------------------

describe('fetchAllRecords', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('stops on a short page', async () => {
    setupMock([page(rows(0, 2))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    assert.equal(result.records.length, 2);
    assert.equal(result.truncated, false);
    assert.equal(capturedRequests.length, 1);
  });

  it('follows pages until the data runs out, advancing skip', async () => {
    setupMock([page(rows(0, 10)), page(rows(10, 10)), page(rows(20, 3))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    assert.equal(result.records.length, 23);
    assert.equal(result.truncated, false);
    assert.deepEqual(capturedRequests.map(r => skipOf(r.url)), ['0', '10', '20']);
  });

  it('stops immediately when meta.hasMore is false, even on a full page', async () => {
    setupMock([page(rows(0, 10), { hasMore: false }), page(rows(10, 10))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    assert.equal(result.records.length, 10);
    assert.equal(result.truncated, false);
    assert.equal(capturedRequests.length, 1, 'should not request a second page');
  });

  it('keeps paging while meta.hasMore is true', async () => {
    setupMock([page(rows(0, 10), { hasMore: true }), page(rows(10, 4), { hasMore: false })]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    assert.equal(result.records.length, 14);
    assert.equal(capturedRequests.length, 2);
  });

  it('de-duplicates records repeated across pages', async () => {
    // The list endpoints reorder between calls, so the same row can appear twice.
    setupMock([page(rows(0, 10)), page([...rows(8, 2), ...rows(10, 8)]), page(rows(18, 1))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    const ids = result.records.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    assert.equal(result.records.length, 19);
  });

  it('does not stall when a whole page is duplicates', async () => {
    // Dedupe must not drive the loop, or records.length never advances.
    setupMock([page(rows(0, 10)), page(rows(0, 10)), page(rows(10, 1))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10 });
    assert.equal(result.records.length, 11);
    assert.deepEqual(capturedRequests.map(r => skipOf(r.url)), ['0', '10', '20']);
  });

  it('reports truncated when the cap is hit with more remaining', async () => {
    setupMock([page(rows(0, 10)), page(rows(10, 10))]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10, maxRecords: 20 });
    assert.equal(result.records.length, 20);
    assert.equal(result.truncated, true);
  });

  it('does not report truncated when the data ends exactly on the cap', async () => {
    setupMock([page(rows(0, 10)), page(rows(10, 10), { hasMore: false })]);
    const result = await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10, maxRecords: 20 });
    assert.equal(result.records.length, 20);
    assert.equal(result.truncated, false);
  });

  it('never requests more than the cap allows', async () => {
    setupMock([page(rows(0, 10)), page(rows(10, 10))]);
    await fetchAllRecords<{ id: string }>('/order', undefined, { pageSize: 10, maxRecords: 15 });
    assert.equal(new URL(capturedRequests[1].url).searchParams.get('limit'), '5');
  });

  it('passes caller params through on every page', async () => {
    setupMock([page(rows(0, 10)), page(rows(10, 1))]);
    await fetchAllRecords<{ id: string }>('/order', { locationId: 'loc-1' }, { pageSize: 10 });
    for (const req of capturedRequests) {
      assert.equal(new URL(req.url).searchParams.get('locationId'), 'loc-1');
    }
  });

  it('handles an empty first page', async () => {
    setupMock([page([])]);
    const result = await fetchAllRecords<{ id: string }>('/order');
    assert.deepEqual(result.records, []);
    assert.equal(result.truncated, false);
  });
});
