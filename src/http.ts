#!/usr/bin/env node
import 'dotenv/config';
import { createServer as createHTTPServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!AUTH_TOKEN) return true; // No token configured — open access (local dev)
  const header = req.headers.authorization;
  if (header === `Bearer ${AUTH_TOKEN}`) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

async function main(): Promise<void> {
  const PORT = Number(process.env.PORT ?? 3000);

  const httpServer = createHTTPServer(async (req, res) => {
    // D3: Health check — Railway / load balancer probes
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // D1: Bearer token auth
    if (!checkAuth(req, res)) return;

    // Stateless mode: create a fresh transport + server per request.
    // StreamableHTTPServerTransport is single-use in stateless mode —
    // sharing one instance across requests causes all requests after the
    // first to fail with 500.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcpServer = createServer();
    await mcpServer.connect(transport);

    // Per-request instances must be closed when the response ends, or every
    // request leaks a transport and an McpServer (with its full tool registry)
    // for the lifetime of the process. Required by the SDK whenever a server is
    // created per request in stateless mode.
    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      void Promise.resolve(transport.close()).catch(() => {});
      void Promise.resolve(mcpServer.close()).catch(() => {});
    };
    res.on('close', cleanup);

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      // Log the detail server-side; return a generic message. The error can
      // carry internal paths, upstream URLs and Shopmonkey error text, none of
      // which should reach an HTTP caller.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Request failed: ${message}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  httpServer.listen(PORT, () => {
    const addr = httpServer.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
    process.stderr.write(`Shopmonkey MCP HTTP server listening on :${actualPort}\n`);
  });

  // D2: Graceful shutdown with force-kill timeout
  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      process.stderr.write('Shutdown timeout — forcing exit\n');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
