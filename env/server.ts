// https://env.t3.gg/docs/nextjs#create-your-schema
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const serverEnv = createEnv({
  server: {
    // Core required services
    XAI_API_KEY: z.string().min(1),
    
    // Redis configuration - either Upstash or self-hosted
    REDIS_CONNECTION_TYPE: z.enum(['upstash', 'self-hosted']).default('upstash'),
    
    // Upstash Redis (existing)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    
    // Self-hosted Redis
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().optional(),
    REDIS_USERNAME: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_TLS_ENABLED: z.boolean().default(false),

    CRON_SECRET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.string().url(),

    // Optional API keys for features
    ELEVENLABS_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    EXA_API_KEY: z.string().optional(),
    TMDB_API_KEY: z.string().optional(),
    YT_ENDPOINT: z.string().optional(),
    FIRECRAWL_API_KEY: z.string().optional(),
    OPENWEATHER_API_KEY: z.string().optional(),
    SANDBOX_TEMPLATE_ID: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    MAPBOX_ACCESS_TOKEN: z.string().optional(),
    TRIPADVISOR_API_KEY: z.string().optional(),
    AVIATION_STACK_API_KEY: z.string().optional(),
  },
  experimental__runtimeEnv: process.env,
})

// Feature availability helper
export const getAvailableFeatures = () => ({
  elevenlabs: !!serverEnv.ELEVENLABS_API_KEY,
  webSearch: !!serverEnv.TAVILY_API_KEY,
  xSearch: !!serverEnv.EXA_API_KEY,
  movies: !!serverEnv.TMDB_API_KEY,
  youtube: !!serverEnv.YT_ENDPOINT,
  webRetrieval: !!serverEnv.FIRECRAWL_API_KEY,
  weather: !!serverEnv.OPENWEATHER_API_KEY,
  codeInterpreter: !!serverEnv.SANDBOX_TEMPLATE_ID,
  maps: !!(serverEnv.GOOGLE_MAPS_API_KEY && serverEnv.MAPBOX_ACCESS_TOKEN),
  places: !!serverEnv.TRIPADVISOR_API_KEY,
  flights: !!serverEnv.AVIATION_STACK_API_KEY,
})
