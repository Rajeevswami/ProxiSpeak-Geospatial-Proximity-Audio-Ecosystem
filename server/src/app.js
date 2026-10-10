/**
 * Express surface: health, room catalogue, live stats and the Spatial Audit
 * endpoint used by the mid-project review.
 */
import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import logger from './utils/logger.js';
import { requireString, requireFiniteNumber, clamp } from './utils/validate.js';
import { ValidationError, NotFoundError } from './utils/errors.js';
import { requireRoom } from './services/roomService.js';

export function createApp({ services, redisBus, io, config: cfg = config, logger: log = logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: cfg.server.clientOrigins.includes('*') ? true : cfg.server.clientOrigins }));
  app.use(express.json({ limit: '64kb' }));

  const startedAt = Date.now();

  app.get('/api/health', async (req, res) => {
    const indexed = await services.geospatial.hasGeoIndex().catch(() => false);
    res.json({
      ok: true,
      status: 'healthy',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      instanceId: cfg.server.instanceId,
      scaleMode: redisBus?.mode ?? 'single',
      database: { uri: redact(cfg.mongo.uri), geoIndex: indexed, queryMode: cfg.spatial.queryMode },
      redis: { url: cfg.redis.url ? redact(cfg.redis.url) : null, mode: redisBus?.mode ?? 'single' },
      presence: { users: services.store.size(), dirty: services.store.dirtyCount() },
      mesh: services.peerGraph.stats(),
    });
  });

  app.get('/api/stats', (req, res) => {
    const users = [...services.store.all()];
    const byRoom = new Map();
    for (const user of users) byRoom.set(user.roomId, (byRoom.get(user.roomId) ?? 0) + 1);
    res.json({
      instanceId: cfg.server.instanceId,
      scaleMode: redisBus?.mode ?? 'single',
      users: users.length,
      byRoom: Object.fromEntries(byRoom),
      mesh: services.peerGraph.stats(),
      edges: services.peerGraph.snapshot().map((edge) => ({
        a: edge.a,
        b: edge.b,
        state: edge.state,
        soundFactor: Number(edge.soundFactor.toFixed(3)),
        generation: edge.generation,
      })),
    });
  });

  app.get('/api/rooms', async (req, res, next) => {
    try {
      const rooms = await services.listRooms();
      const live = new Map();
      for (const user of services.store.all()) live.set(user.roomId, (live.get(user.roomId) ?? 0) + 1);
      res.json({
        rooms: rooms.map((room) => ({ ...room, liveUsers: live.get(room.roomId) ?? 0 })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rooms/:roomId', async (req, res, next) => {
    try {
      const roomId = requireString(req.params.roomId, 'roomId', { min: 1, max: 48 }).toLowerCase();
      const room = await requireRoom(roomId);
      const live = services.store.byRoom(roomId).length;
      res.json({ room, liveUsers: live });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/spatial-audit?roomId=lobby&x=960&y=540&radius=100&samples=25
   *
   * Returns the full audit report: per-operator timings against the 20 ms
   * budget, an accuracy cross-check and the winning query plan.
   */
  const runAudit = async (req, res, next) => {
    try {
      const params = { ...req.query, ...(req.body ?? {}) };
      const roomId = requireString(params.roomId ?? 'lobby', 'roomId', { min: 1, max: 48 }).toLowerCase();
      const room = await requireRoom(roomId);
      const x = clamp(requireFiniteNumber(Number(params.x ?? room.width / 2), 'x', { min: 0, max: cfg.world.width }), 0, cfg.world.width);
      const y = clamp(requireFiniteNumber(Number(params.y ?? room.height / 2), 'y', { min: 0, max: cfg.world.height }), 0, cfg.world.height);
      const radiusPx = clamp(
        requireFiniteNumber(Number(params.radius ?? cfg.world.earshotRadiusPx), 'radius', { min: 1, max: cfg.world.earshotRadiusPx * 5 }),
        1,
        cfg.world.earshotRadiusPx * 5,
      );
      const samples = clamp(
        Number(params.samples ?? cfg.limits.auditSamples) || cfg.limits.auditSamples,
        1,
        cfg.limits.auditSamples,
      );

      const report = await services.audit.run({
        roomId,
        x,
        y,
        radiusPx,
        samples,
        includeClusters: params.clusters !== 'false' && params.clusters !== false,
        includeExplain: params.explain !== 'false' && params.explain !== false,
        source: 'http',
        instanceId: cfg.server.instanceId,
      });

      // Surface every completed audit on every connected client (this is the
      // part that visibly proves the Redis fan-out across instances).
      io?.to(roomId).emit('audit:completed', {
        roomId,
        at: report.at,
        p95Ms: report.queries.near.p95Ms,
        withinBudget: report.withinBudget,
        matched: report.accuracy.matchedPeers,
        instanceId: cfg.server.instanceId,
      });
      redisBus?.publish({ type: 'audit:completed', payload: { roomId, report }, at: Date.now() });

      res.status(report.ok ? 200 : 503).json(report);
    } catch (err) {
      next(err);
    }
  };

  app.get('/api/spatial-audit', runAudit);
  app.post('/api/spatial-audit', runAudit);

  app.get('/api/spatial-audit/history', async (req, res, next) => {
    try {
      const roomId = requireString(req.query.roomId ?? 'lobby', 'roomId', { min: 1, max: 48 }).toLowerCase();
      res.json(await services.audit.history(roomId, clamp(Number(req.query.limit ?? 20) || 20, 1, 100)));
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((err, req, res, next) => {
    const status = err instanceof ValidationError ? 400 : err instanceof NotFoundError ? 404 : err.status ?? 500;
    if (status >= 500) log.error(`${req.method} ${req.originalUrl} ->`, err.message);
    res.status(status).json({ ok: false, error: err.message, field: err.details?.field });
  });

  return app;
}

/** Hide credentials in anything we print or return over HTTP. */
function redact(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

export default createApp;