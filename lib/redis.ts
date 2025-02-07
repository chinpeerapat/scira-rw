import { Redis } from '@upstash/redis'
import { serverEnv } from '@/env/server'
import { createClient } from 'redis'

export async function getRedisClient() {
  if (serverEnv.REDIS_CONNECTION_TYPE === 'upstash') {
    if (!serverEnv.UPSTASH_REDIS_REST_URL || !serverEnv.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Upstash Redis configuration missing')
    }
    
    return new Redis({
      url: serverEnv.UPSTASH_REDIS_REST_URL,
      token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
    })
  } else {
    if (!serverEnv.REDIS_HOST || !serverEnv.REDIS_PORT) {
      throw new Error('Self-hosted Redis configuration missing')
    }

    const client = createClient({
      username: serverEnv.REDIS_USERNAME,
      password: serverEnv.REDIS_PASSWORD,
      socket: {
        host: serverEnv.REDIS_HOST,
        port: serverEnv.REDIS_PORT,
        tls: serverEnv.REDIS_TLS_ENABLED,
      }
    })

    await client.connect()
    return client
  }
} 