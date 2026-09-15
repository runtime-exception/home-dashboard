import { createLoginRateLimiter, createWindowRateLimiter } from './auth/rate-limit.ts'
import { createSessionStore, type SessionStore } from './auth/session.ts'
import { createConfigStore, type ConfigStore } from './config/store.ts'
import type { AppEnv } from './env.ts'
import { createHealthSnapshotter } from './health/snapshot.ts'
import type { HealthSnapshot } from './health/snapshot.ts'

export interface AppContext {
  env: AppEnv
  config: ConfigStore
  sessions: SessionStore
  loginLimiter: ReturnType<typeof createLoginRateLimiter>
  adminLimiter: ReturnType<typeof createWindowRateLimiter>
  snapshot: () => Promise<HealthSnapshot>
}

export function createContext(env: AppEnv): AppContext {
  const config = createConfigStore({
    configFile: env.configFile,
    backupDir: env.backupDir,
  })

  const snapshotter = createHealthSnapshotter({
    targets: () =>
      config
        .get()
        .tools.filter((tool) => tool.enabled !== false)
        .map((tool) => ({ id: tool.id, url: tool.internalUrl })),
    all: () => config.get().tools.map((tool) => ({ id: tool.id, enabled: tool.enabled })),
  })

  return {
    env,
    config,
    sessions: createSessionStore(env.sessionTtlMs),
    loginLimiter: createLoginRateLimiter(),
    adminLimiter: createWindowRateLimiter(60, 60_000),
    snapshot: snapshotter,
  }
}
