#!/usr/bin/env node
import 'dotenv/config';
import { createServer as createHTTPServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await mcpServer.connect(transport);

  const PORT = Number(process.env.PORT ?? 3000);

  const httpServer = createHTTPServer(async (req, res) => {
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
    process.stderr.write(`Shopmonkey MCP HTTP server listening on :${PORT}\n`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
