import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as labels from '../tools/labels.js';

const originalFetch = globalThis.fetch;

let capturedRequests: Array<{ url: string; method: string; body?: string }> = [];

function setupMock(data: unknown) {
  capturedRequests = [];
  const body = { success: true, data };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    capturedRequests.push({ url, method: init?.method ?? 'GET', body: init?.body ? String(init.body) : undefined });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-length': String(JSON.stringify(body).length) },
    });
  }) as typeof fetch;
}

describe('list_labels', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /label', async () => {
    setupMock([]);
    const result = await labels.handlers.list_labels({});
    assert.equal(capturedRequests[0].method, 'GET');
    assert.ok(new URL(capturedRequests[0].url).pathname.endsWith('/label'));
    assert.ok(!result.isError);
  });

  it('sends no where filter when no filters are given', async () => {
    setupMock([]);
    await labels.handlers.list_labels({ limit: 10 });
    assert.equal(new URL(capturedRequests[0].url).searchParams.get('where'), null);
  });

  it('encodes name and entity filters into the where param', async () => {
    setupMock([]);
    await labels.handlers.list_labels({ name: 'Fleet', entity: 'Order' });
    const where = new URL(capturedRequests[0].url).searchParams.get('where');
    assert.deepEqual(JSON.parse(where!), { name: 'Fleet', entity: 'Order' });
  });

  it('passes limit and skip', async () => {
    setupMock([]);
    await labels.handlers.list_labels({ limit: 10, skip: 20 });
    const params = new URL(capturedRequests[0].url).searchParams;
    assert.equal(params.get('limit'), '10');
    assert.equal(params.get('skip'), '20');
  });
});

describe('get_label', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends GET /label/:id', async () => {
    setupMock({ id: 'lbl-1' });
    await labels.handlers.get_label({ id: 'lbl-1' });
    assert.ok(capturedRequests[0].url.includes('/label/lbl-1'));
  });

  it('url-encodes the id', async () => {
    setupMock({});
    await labels.handlers.get_label({ id: 'a/b' });
    assert.ok(capturedRequests[0].url.includes('a%2Fb'));
  });

  it('errors without an id', async () => {
    setupMock({});
    const result = await labels.handlers.get_label({});
    assert.equal(result.isError, true);
    assert.equal(capturedRequests.length, 0);
  });
});

describe('assign_label', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key-123'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('sends PUT /label/:id/assign with entity and entityId', async () => {
    setupMock({ id: 'lbl-1' });
    const result = await labels.handlers.assign_label({ labelId: 'lbl-1', entity: 'Order', entityId: 'ord-9' });
    assert.equal(capturedRequests[0].method, 'PUT');
    assert.ok(capturedRequests[0].url.includes('/label/lbl-1/assign'));
    assert.deepEqual(JSON.parse(capturedRequests[0].body!), { entity: 'Order', entityId: 'ord-9' });
    assert.ok(!result.isError);
  });

  it('errors when any required argument is missing', async () => {
    setupMock({});
    for (const args of [
      { entity: 'Order', entityId: 'ord-9' },
      { labelId: 'lbl-1', entityId: 'ord-9' },
      { labelId: 'lbl-1', entity: 'Order' },
    ]) {
      const result = await labels.handlers.assign_label(args);
      assert.equal(result.isError, true);
    }
    assert.equal(capturedRequests.length, 0);
  });
});
