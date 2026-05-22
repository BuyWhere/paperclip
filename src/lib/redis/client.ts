import { Redis } from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })
  client.on('error', (err) => {
    console.error('[Redis] connection error:', err)
  })
  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Blacklist helpers for JWT revocation
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  await redis.set(`bl:${jti}`, '1', 'EX', ttlSeconds)
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const val = await redis.get(`bl:${jti}`)
  return val !== null
}
