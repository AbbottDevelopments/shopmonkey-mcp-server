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
  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await mcpServer.connect(transport);

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

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
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
