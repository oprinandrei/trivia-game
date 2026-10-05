import path from 'path';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { setupGame } from './socket';

const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? path.join(__dirname, '../public');

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });

  await setupGame(io);

  httpServer.listen(PORT, () => {
    console.log(`Trivia server listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal error starting server', err);
  process.exit(1);
});
