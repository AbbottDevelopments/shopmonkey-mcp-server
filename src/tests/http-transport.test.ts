import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const httpServerPath = join(__dirname, '..', 'http.js');

const TEST_AUTH_TOKEN = 'test-auth-secret-42';

let httpServer: ChildProcess | null = null;
let serverPort: number;

// D8: Parse actual port from stderr instead of hardcoding — avoids EADDRINUSE in parallel CI
async function waitForReady(child: ChildProcess, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for HTTP server to start'));
    }, timeoutMs);

    child.stderr!.on('data', (chunk: Buffer) => {
      const match = chunk.toString().match(/listening on :(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`HTTP server exited early with code ${code}`));
    });
  });
}

describe('HTTP Transport — smoke test', () => {
  before(async () => {
    httpServer = spawn('node', [httpServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SHOPMONKEY_API_KEY: 'test-key',
        MCP_AUTH_TOKEN: TEST_AUTH_TOKEN,
        PORT: '0', // OS-assigned port
      },
    });

    serverPort = await waitForReady(httpServer);
  });

  after(() => {
    try { httpServer?.kill('SIGTERM'); } catch { /* already dead */ }
  });

  it('responds 200 to tools/list JSON-RPC request with valid auth', async () => {
    const response = await fetch(`http://localhost:${serverPort}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${TEST_AUTH_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    assert.equal(response.status, 200);

    const text = await response.text();

    // Response may be JSON or SSE — parse accordingly
    let tools: unknown[] | null = null;

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
            const result = parsed.result as Record<string, unknown> | undefined;
            if (result?.tools) {
              tools = result.tools as unknown[];
              break;
            }
          } catch { /* non-JSON data line */ }
        }
      }
    } else {
      const json = JSON.parse(text) as Record<string, unknown>;
      const result = json.result as Record<string, unknown> | undefined;
      if (result?.tools) tools = result.tools as unknown[];
    }

    assert.ok(tools !== null, `Could not find tools in response: ${text.slice(0, 500)}`);
    assert.ok(tools!.length >= 64, `Expected at least 64 tools, got ${tools!.length}`);
  });

  // D3: Health check endpoint
  it('GET /health returns 200 with status ok', async () => {
    const response = await fetch(`http://localhost:${serverPort}/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, 'ok');
  });

  it('GET / returns 200 health check (load balancer probe)', async () => {
    const response = await fetch(`http://localhost:${serverPort}/`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, 'ok');
  });

  // D1: Auth enforcement
  it('POST without auth token returns 401', async () => {
    const response = await fetch(`http://localhost:${serverPort}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(response.status, 401);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.error, 'Unauthorized');
  });

  it('POST with wrong auth token returns 401', async () => {
    const response = await fetch(`http://localhost:${serverPort}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(response.status, 401);
  });
});
