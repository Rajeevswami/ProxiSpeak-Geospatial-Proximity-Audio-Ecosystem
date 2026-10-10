/**
 * Seed helper.
 *   npm run seed                      -> rooms + 2dsphere index only
 *   npm run seed -- --users=50        -> + 50 synthetic avatars for the audit
 *   npm run seed -- --users=50 --room=studio --flush
 */
import process from 'node:process';
import { connectMongo, disconnectMongo, mongoose } from '../src/db/mongo.js';
import config from '../src/config/index.js';
import logger from '../src/utils/logger.js';
import UserPresence from '../src/models/UserPresence.js';
import { buildDefaultRoom, persistRoom, getCachedRoom } from '../src/services/roomService.js';
import { createGeoTransform } from '../src/utils/geo.js';

const log = logger.child('seed');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
  }),
);

const ROOMS = ['lobby', 'studio', 'lounge'];

async function main() {
  await connectMongo();

  log.info('ensuring geospatial index on UserPresence.location ...');
  await UserPresence.createIndexes();

  for (const roomId of ROOMS) {
    const existing = await mongoose.connection.collection('rooms').findOne({ roomId });
    if (existing) {
      log.info(`room "${roomId}" already persisted`);
      continue;
    }
    await persistRoom(buildDefaultRoom(roomId));
    log.info(`persisted room "${roomId}"`);
  }

  const count = Number(args.users ?? 0);
  if (count > 0) {
    const roomId = String(args.room ?? 'lobby');
    const room = getCachedRoom(roomId) ?? buildDefaultRoom(roomId);
    const transform = createGeoTransform({ ...config.world, width: room.width, height: room.height });

    if (args.flush) {
      await UserPresence.deleteMany({ roomId });
      log.info(`flushed existing presence in "${roomId}"`);
    }

    const operations = [];
    for (let i = 0; i < count; i += 1) {
      // Deterministic pseudo-random layout: a few tight clusters plus strays,
      // which is exactly the shape a real office has.
      const cluster = i % 4;
      const cx = room.width * (0.25 + cluster * 0.18);
      const cy = room.height * (0.3 + ((cluster * 37) % 40) / 100);
      const x = Math.round(cx + (Math.sin(i * 12.9898) * 60));
      const y = Math.round(cy + (Math.cos(i * 78.233) * 60));
      const [lon, lat] = transform.pixelToGeo(Math.min(Math.max(x, 0), room.width), Math.min(Math.max(y, 0), room.height));
      operations.push({
        updateOne: {
          filter: { sessionId: `seed-${roomId}-${i}`, roomId },
          update: {
            $set: {
              sessionId: `seed-${roomId}-${i}`,
              instanceId: 'seed',
              roomId,
              name: `Bot ${String(i).padStart(2, '0')}`,
              color: '#7d8590',
              avatar: 'circle',
              x,
              y,
              angle: 0,
              location: { type: 'Point', coordinates: [lon, lat] },
              micEnabled: true,
              lastSeen: new Date(),
            },
          },
          upsert: true,
        },
      });
    }
    const result = await UserPresence.bulkWrite(operations, { ordered: false });
    log.info(`seeded ${operations.length} synthetic avatars into "${roomId}" (upserts=${result.upsertedCount}, modified=${result.modifiedCount})`);
  }

  const indexed = await UserPresence.collection.indexes();
  log.info(`indexes: ${indexed.map((index) => JSON.stringify(index.key)).join(', ')}`);

  await disconnectMongo();
}

main().catch(async (err) => {
  log.error(err);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});