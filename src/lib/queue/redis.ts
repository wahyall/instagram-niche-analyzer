import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | undefined;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  client.on('connect', () => {
    console.log('Connected to Redis');
  });

  client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!global.redis) {
    global.redis = createRedisClient();
  }
  return global.redis;
}

export function createNewRedisConnection(): Redis {
  return createRedisClient();
}

export default getRedisClient;
