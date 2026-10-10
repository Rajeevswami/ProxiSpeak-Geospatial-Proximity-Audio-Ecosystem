/**
 * Redis Pub/Sub wiring.
 *
 * 1. @socket.io/redis-adapter fans every Socket.io broadcast out to the other
 *    Node instances, which is what makes the signaling server horizontally
 *    scalable.
 * 2. A raw Pub/Sub channel carries instance-to-instance domain events
 *    (presence lifecycle, audit results, room updates).
 *
 * Redis is optional at boot: if REDIS_URL is empty or the server cannot be
 * reached, the process degrades to single-instance mode with a warning instead
 * of refusing to start.
 */
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const log = logger.child('redis');

export const CHANNELS = Object.freeze({
  events: `${config.redis.keyPrefix}events`,
});

function buildClient(role) {
  const client = new Redis(config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  });
  client.on('error', (err) => log.debug(`${role} client error: ${err.message}`));
  return client;
}

export async function createRedisBus() {
  if (!config.redis.url) {
    log.warn('REDIS_URL is empty -> single-instance mode (no Pub/Sub, no cross-instance broadcast).');
    return singleInstanceBus('REDIS_URL is empty');
  }

  const pub = buildClient('publisher');
  const sub = buildClient('subscriber');

  try {
    await Promise.all([pub.connect(), sub.connect()]);
    pub.on('message', dispatch);
    log.info(`connected to ${config.redis.url} (adapter + pub/sub enabled)`);
    return {
      mode: 'redis',
      pub,
      sub,
      adapter: createAdapter(pub, sub),
      publish,
      subscribe,
      close,
    };
  } catch (err) {
    log.warn(`Redis unavailable (${err.message}) -> falling back to single-instance mode.`);
    pub.disconnect();
    sub.disconnect();
    return singleInstanceBus(`redis unreachable: ${err.message}`);
  }

  function publish(event) {
    try {
      pub.publish(CHANNELS.events, JSON.stringify({ ...event, origin: config.server.instanceId }));
    } catch (err) {
      log.warn('publish failed:', err.message);
    }
  }

  function subscribe(handler) {
    subscribers.add(handler);
  }

  function dispatch(channel, raw) {
    if (channel !== CHANNELS.events) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    // Never re-process our own broadcast.
    if (payload.origin === config.server.instanceId) return;
    for (const handler of subscribers) {
      try {
        handler(payload);
      } catch (err) {
        log.error('subscriber threw:', err.message);
      }
    }
  }

  async function close() {
    subscribers.clear();
    await Promise.allSettled([pub.quit(), sub.quit()]);
  }
}

const subscribers = new Set();

function singleInstanceBus(reason) {
  log.warn(reason);
  return {
    mode: 'single',
    pub: null,
    sub: null,
    adapter: null,
    publish() {},
    subscribe() {},
    async close() {},
  };
}

/**
 * Domain events published across instances.
 * @param {'presence:leave'|'room:updated'|'audit:completed'} type
 */
export function makeEvent(type, payload) {
  return { type, payload, at: Date.now() };
}