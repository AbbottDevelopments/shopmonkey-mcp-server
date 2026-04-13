import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as reports from '../tools/reports.js';

const originalFetch = globalThis.fetch;

type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

let capturedRequests: Array<{ url: string; method: string; body?: string }> = [];

function setupMock(data: unknown) {
  capturedRequests = [];
  const body = { success: true, data };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const reqBody = init?.body ? String(init.body) : undefined;
    capturedRequests.push({ url, method, body: reqBody });

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-length': String(JSON.stringify(body).length) },
    });
  }) as typeof fetch;
}

describe('Reports — report_revenue_summary', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('aggregates totals and breakdown from orders (AC-Report.1)', async () => {
    setupMock([
      { id: 'ord-1', status: 'Invoice', totalCostCents: 10000, paid: true },
      { id: 'ord-2', status: 'Invoice', totalCostCents: 5000, paid: false },
      { id: 'ord-3', status: 'Estimate', totalCostCents: 2500, paid: false },
    ]);

    const result = await reports.handlers.report_revenue_summary({
      startDate: '2026-04-01', endDate: '2026-04-11',
    });

    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);

    assert.equal(data.totals.totalCostCents, 17500);
    assert.equal(data.totals.paidCostCents, 10000);
    assert.equal(data.totals.unpaidCostCents, 7500);
    assert.equal(data.breakdown.Invoice.count, 2);
    assert.equal(data.breakdown.Invoice.totalCostCents, 15000);
    assert.equal(data.breakdown.Estimate.count, 1);
    assert.equal(data.breakdown.Estimate.totalCostCents, 2500);
    assert.equal(data.count, 3);
  });

  it('returns period in result', async () => {
    setupMock([]);
    const result = await reports.handlers.report_revenue_summary({
      startDate: '2026-04-01', endDate: '2026-04-30',
    });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.period.startDate, '2026-04-01');
    assert.equal(data.period.endDate, '2026-04-30');
  });

  it('requires startDate', async () => {
    const result = await reports.handlers.report_revenue_summary({ endDate: '2026-04-30' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('startDate is required'));
  });

  it('requires endDate', async () => {
    const result = await reports.handlers.report_revenue_summary({ startDate: '2026-04-01' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('endDate is required'));
  });

  it('sends GET /order with date params', async () => {
    setupMock([]);
    await reports.handlers.report_revenue_summary({ startDate: '2026-04-01', endDate: '2026-04-11' });
    assert.ok(capturedRequests[0].url.includes('/order'));
    assert.ok(capturedRequests[0].url.includes('startDate=2026-04-01'));
    assert.ok(capturedRequests[0].url.includes('endDate=2026-04-11'));
  });
});

describe('Reports — report_appointment_summary', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('counts appointments by confirmationStatus (AC-Report.2)', async () => {
    setupMock([
      { id: 'apt-1', confirmationStatus: 'Confirmed' },
      { id: 'apt-2', confirmationStatus: 'Declined' },
      { id: 'apt-3', confirmationStatus: 'NoResponse' },
      { id: 'apt-4', confirmationStatus: 'Confirmed' },
    ]);

    const result = await reports.handlers.report_appointment_summary({
      startDate: '2026-04-01', endDate: '2026-04-30',
    });

    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);

    assert.equal(data.totals.count, 4);
    assert.equal(data.breakdown.Confirmed.count, 2);
    assert.equal(data.breakdown.Declined.count, 1);
    assert.equal(data.breakdown.NoResponse.count, 1);

    // AC-Report.2: breakdown sums equal total
    const sum = data.breakdown.Confirmed.count + data.breakdown.Declined.count + data.breakdown.NoResponse.count;
    assert.equal(sum, data.totals.count);
  });

  it('requires startDate', async () => {
    const result = await reports.handlers.report_appointment_summary({ endDate: '2026-04-30' });
    assert.ok(result.isError);
  });
});

describe('Reports — report_open_estimates', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('filters to unauthorized estimates and computes ageInDays (AC-Report.3)', async () => {
    // Freeze time context: "now" in the handler is new Date() at test runtime.
    // We create an order 10 days ago relative to today to avoid date-drift.
    const today = new Date();
    const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    const createdDate = tenDaysAgo.toISOString();

    setupMock([
      { id: 'est-1', status: 'Estimate', authorized: false, createdDate, totalCostCents: 1000 },
      { id: 'est-2', status: 'Estimate', authorized: true, createdDate, totalCostCents: 2000 },
    ]);

    const result = await reports.handlers.report_open_estimates({});

    assert.ok(!result.isError);
    const data = JSON.parse(result.content[0].text);

    // Only the unauthorized one should appear
    assert.equal(data.count, 1);
    assert.equal(data.orders[0].id, 'est-1');
    assert.equal(data.orders[0].ageInDays, 10);
    assert.equal(data.oldestAgeInDays, 10);
  });

  it('sends GET /order with status=Estimate', async () => {
    setupMock([]);
    await reports.handlers.report_open_estimates({});
    assert.ok(capturedRequests[0].url.includes('/order'));
    assert.ok(capturedRequests[0].url.includes('status=Estimate'));
  });

  it('returns empty result when no open estimates', async () => {
    setupMock([{ id: 'est-1', status: 'Estimate', authorized: true }]);
    const result = await reports.handlers.report_open_estimates({});
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.count, 0);
    assert.equal(data.oldestAgeInDays, 0);
  });
});
