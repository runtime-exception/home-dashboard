export interface LoginRateLimiter {
  /** 允许则返回 { allowed: true }；被锁时返回剩余等待秒数。 */
  check(key: string): { allowed: true } | { allowed: false; retryAfterSec: number }
  recordFailure(key: string): void
  reset(key: string): void
  size(): number
}

interface Entry {
  failures: number
  lockedUntil: number
}

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

/**
 * 登录失败限速。同一来源连续失败 maxFailures 次后锁定 lockMs 毫秒。
 * 计数器放内存，重启清零——对个人工具有意接受。
 */
export function createLoginRateLimiter(
  maxFailures: number = MAX_FAILURES,
  lockMs: number = LOCK_MS,
): LoginRateLimiter {
  const entries = new Map<string, Entry>()

  function prune(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.lockedUntil !== 0 && entry.lockedUntil <= now) entries.delete(key)
    }
  }

  return {
    check(key: string) {
      const now = Date.now()
      prune(now)
      const entry = entries.get(key)
      if (entry && entry.lockedUntil > now) {
        return {
          allowed: false as const,
          retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
        }
      }
      return { allowed: true as const }
    },

    recordFailure(key: string): void {
      const entry = entries.get(key) ?? { failures: 0, lockedUntil: 0 }
      entry.failures += 1
      if (entry.failures >= maxFailures) {
        entry.lockedUntil = Date.now() + lockMs
        entry.failures = 0
      }
      entries.set(key, entry)
    },

    reset(key: string): void {
      entries.delete(key)
    },

    size(): number {
      return entries.size
    },
  }
}

export interface WindowRateLimiter {
  /** 消耗一次配额。超限返回 { allowed: false, retryAfterSec }。 */
  consume(key: string): { allowed: true } | { allowed: false; retryAfterSec: number }
}

interface Window {
  windowStart: number
  count: number
}

/** 固定窗口计数器，用于管理接口的整体限流，防止误写的脚本打爆服务。 */
export function createWindowRateLimiter(
  limit: number,
  windowMs: number,
): WindowRateLimiter {
  const windows = new Map<string, Window>()

  return {
    consume(key: string) {
      const now = Date.now()
      if (windows.size > 2048) windows.clear()

      let window = windows.get(key)
      if (!window || now - window.windowStart >= windowMs) {
        window = { windowStart: now, count: 0 }
        windows.set(key, window)
      }

      if (window.count >= limit) {
        return {
          allowed: false as const,
          retryAfterSec: Math.max(
            1,
            Math.ceil((window.windowStart + windowMs - now) / 1000),
          ),
        }
      }

      window.count += 1
      return { allowed: true as const }
    },
  }
}
