import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const httpServerPath = join(__dirname, '..', 'http.js');

const TEST_PORT = 13579;

let httpServer: ChildProcess | null = null;

async function waitForReady(child: ChildProcess, marker: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for "${marker}" on stderr`));
    }, timeoutMs);

    child.stderr!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes(marker)) {
        clearTimeout(timer);
        resolve();
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
        PORT: String(TEST_PORT),
      },
    });

    await waitForReady(httpServer, `listening on :${TEST_PORT}`);
  });

  after(() => {
    try { httpServer?.kill('SIGTERM'); } catch { /* already dead */ }
  });

  it('responds 200 to tools/list JSON-RPC request', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    assert.equal(response.status, 200);

    const text = await response.text();

    // Response may be JSON or SSE — parse accordingly
    let tools: unknown[] | null = null;

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      // SSE: extract the data lines and find tools
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
});
