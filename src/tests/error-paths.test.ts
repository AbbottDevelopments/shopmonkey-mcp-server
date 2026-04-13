import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shopmonkeyRequest, sanitizePathParam } from '../client.js';
import type { ToolResponse } from '../types/tools.js';

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}

// Mirrors the error wrapping in index.ts CallToolRequest handler
async function callHandler(fn: (args: Record<string, unknown>) => Promise<ToolResponse>, args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    return await fn(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

describe('Error Paths — Missing API Key', () => {
  const originalKey = process.env.SHOPMONKEY_API_KEY;

  beforeEach(() => { delete process.env.SHOPMONKEY_API_KEY; });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.SHOPMONKEY_API_KEY = originalKey;
    else delete process.env.SHOPMONKEY_API_KEY;
  });

  it('throws descriptive error when SHOPMONKEY_API_KEY is missing', async () => {
    await assert.rejects(
      () => shopmonkeyRequest('GET', '/order'),
      (err: Error) => {
        assert.ok(err.message.includes('SHOPMONKEY_API_KEY is not configured'));
        assert.ok(err.message.includes('Shopmonkey Settings'));
        return true;
      }
    );
  });

  it('surfaces missing key error through handler wrapper', async () => {
    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('SHOPMONKEY_API_KEY'));
  });
});

describe('Error Paths — Network Failures', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('retries on network error and surfaces final error', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      throw new Error('ECONNREFUSED');
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('Network error'));
    assert.ok(result.content[0].text.includes('ECONNREFUSED'));
    assert.equal(attempts, 3);
  });
});

describe('Error Paths — Rate Limiting (429)', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('retries on 429 and surfaces rate limit error after exhaustion', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      return new Response(null, { status: 429, headers: { 'Retry-After': '0' } });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('Rate limited'));
    assert.equal(attempts, 3);
  });
});

describe('Error Paths — Server Errors (500/502/503)', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('retries on 500 server error', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      return new Response(JSON.stringify({ success: false, message: 'Internal error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.equal(attempts, 3);
  });

  it('retries on 502 bad gateway', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      return new Response('Bad Gateway', { status: 502 });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.equal(attempts, 3);
  });

  it('succeeds if server recovers on retry', async () => {
    let attempts = 0;
    mockFetch(async () => {
      attempts++;
      if (attempts < 3) {
        return new Response(null, { status: 503 });
      }
      return new Response(JSON.stringify({ success: true, data: [{ id: 'ord-1' }] }), {
        status: 200,
        headers: { 'content-length': '100' },
      });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(!result.isError);
    assert.equal(attempts, 3);
  });
});

describe('Error Paths — Malformed API Responses', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('handles HTML response on 200 (reverse proxy error)', async () => {
    mockFetch(async () => {
      return new Response('<html>Bad Gateway</html>', {
        status: 200,
        headers: { 'content-length': '24' },
      });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('Invalid JSON'));
  });

  it('handles success:true with missing data field', async () => {
    mockFetch(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-length': '16' },
      });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('no data'));
  });

  it('handles non-JSON error response', async () => {
    mockFetch(async () => {
      return new Response('Service Unavailable', { status: 400 });
    });

    const { handlers } = await import('../tools/orders.js');
    const result = await callHandler(handlers.list_orders, {});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('Service Unavailable'));
  });
});

describe('C2 Regression — API message field surfaces in error string', () => {
  beforeEach(() => { process.env.SHOPMONKEY_API_KEY = 'test-key'; });
  afterEach(() => { globalThis.fetch = originalFetch; delete process.env.SHOPMONKEY_API_KEY; });

  it('HTTP 400 error surfaces both code and message from Shopmonkey response', async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({ success: false, code: 'API-12345', message: 'Vehicle VIN is invalid' }),
        { status: 400, headers: { 'content-type': 'application/json', 'content-length': '73' } }
      );
    });

    const { handlers } = await import('../tools/vehicles.js');
    const result = await callHandler(handlers.get_vehicle, { id: 'bad' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('API-12345'), `Expected API-12345 in: ${result.content[0].text}`);
    assert.ok(result.content[0].text.includes('Vehicle VIN is invalid'), `Expected message in: ${result.content[0].text}`);
  });
});

describe('Error Paths — Path Sanitization', () => {
  it('encodes path traversal attempts', () => {
    assert.equal(sanitizePathParam('../../etc/passwd'), '..%2F..%2Fetc%2Fpasswd');
  });

  it('encodes query injection attempts', () => {
    assert.equal(sanitizePathParam('id?admin=true'), 'id%3Fadmin%3Dtrue');
  });

  it('encodes hash injection', () => {
    assert.equal(sanitizePathParam('id#fragment'), 'id%23fragment');
  });

  it('encodes spaces and special chars', () => {
    assert.equal(sanitizePathParam('my order'), 'my%20order');
  });
});
