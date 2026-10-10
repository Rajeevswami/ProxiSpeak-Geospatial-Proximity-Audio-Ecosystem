/**
 * Boot sequence: config -> MongoDB -> Redis -> services -> HTTP -> sockets.
 * Run two instances with the same REDIS_URL to see the signaling server scale.
 */
import http from 'node:http';
import process from 'node:process';
import config from './config/index.js';
import logger from './utils/logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { createRedisBus } from './db/redis.js';
import { createServices } from './services/index.js';
import { createApp } from './app.js';
import { createSocketServer } from './sockets/index.js';
import { startRuntime } from './runtime.js';
import { makeEvent } from './db/redis.js';

const log = logger;

async function main() {
  log.info(`ProxiSpeak server starting (${config.nodeEnv}) as instance "${config.server.instanceId}"`);

  await connectMongo();

  const redisBus = await createRedisBus();

  // Room defaults are materialised on first use; do it once so the very first
  // client does not pay for the write.
  const services = createServices({ logger: log });
  await services.getRoom('lobby', { persist: true }).catch((err) => log.warn('default room not persisted:', err.message));

  const hasIndex = await services.geospatial.hasGeoIndex();
  if (!hasIndex) log.warn('no 2dsphere index on UserPresence.location yet — run `npm run seed` to create it.');

  const httpServer = http.createServer();
  const app = createApp({ services, redisBus, config, logger: log });
  httpServer.on('request', app);

  const io = createSocketServer({ httpServer, services, redisBus, config, logger: log });

  // Cross-instance domain events.
  redisBus?.subscribe((event) => {
    switch (event.type) {
      case 'presence:leave':
        log.debug(`instance ${event.payload.instanceId} lost ${event.payload.id}`);
        break;
      case 'audit:completed':
        io.to(event.payload.roomId).emit('audit:remote', {
          roomId: event.payload.roomId,
          p95Ms: event.payload.report?.queries?.near?.p95Ms ?? null,
          ok: event.payload.report?.ok ?? null,
          from: event.origin,
        });
        break;
      default:
        break;
    }
  });

  const stopRuntime = startRuntime({ services, io, redisBus, config, logger: log });

  await new Promise((resolve) => httpServer.listen(config.server.port, '0.0.0.0', resolve));
  log.info(`HTTP + WebSocket listening on http://localhost:${config.server.port} (scale mode: ${redisBus.mode})`);
  log.info(`Spatial audit:  curl "http://localhost:${config.server.port}/api/spatial-audit?roomId=lobby"`);

  // Announce ourselves so every instance knows the cluster membership.
  redisBus?.publish(makeEvent('instance:up', { port: config.server.port }));

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, shutting down...`);
    stopRuntime();
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await services.store.flush().catch(() => {});
    await redisBus?.close().catch(() => {});
    await disconnectMongo().catch(() => {});
    log.info('bye');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection:', reason));
}

main().catch((err) => {
  log.error('fatal startup error:', err);
  process.exit(1);
});