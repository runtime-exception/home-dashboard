import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'dc_session'

export interface Session {
  id: string
  username: string
  createdAt: number
  expiresAt: number
}

export interface SessionStore {
  create(username: string): Session
  /** 命中且未过期时滑动续期并返回会话，否则返回 null。 */
  touch(id: string): Session | null
  destroy(id: string): void
  destroyAll(): number
  size(): number
}

/**
 * 定长比较，避免通过响应时间逐字符推断令牌。
 * 先各自 SHA-256 再比较，绕开 timingSafeEqual 在长度不等时抛错的问题。
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/**
 * 内存会话表。api 重启后会话失效，用户需重新登录——这是刻意的取舍，
 * 换来的是一份不需要落盘、不需要清理策略的会话存储。
 */
export function createSessionStore(ttlMs: number): SessionStore {
  const sessions = new Map<string, Session>()

  function prune(now: number): void {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(id)
    }
  }

  return {
    create(username: string): Session {
      const now = Date.now()
      prune(now)
      const session: Session = {
        id: randomBytes(32).toString('base64url'),
        username,
        createdAt: now,
        expiresAt: now + ttlMs,
      }
      sessions.set(session.id, session)
      return session
    },

    touch(id: string): Session | null {
      const now = Date.now()
      const found = sessions.get(id)
      if (!found) return null
      if (found.expiresAt <= now) {
        sessions.delete(id)
        return null
      }
      found.expiresAt = now + ttlMs
      return found
    },

    destroy(id: string): void {
      sessions.delete(id)
    },

    destroyAll(): number {
      const count = sessions.size
      sessions.clear()
      return count
    },

    size(): number {
      return sessions.size
    },
  }
}

/** 从 Cookie 头里取出会话 id。同名 cookie 取最后一个（后写覆盖前写）。 */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  let found: string | null = null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    found = part.slice(eq + 1).trim()
  }
  return found
}

export interface CookieOptions {
  maxAgeSec: number
  /** 仅在 HTTPS 下开启。明文 HTTP 下带 Secure 会让浏览器直接丢弃 cookie。 */
  secure: boolean
}

export function buildSessionCookie(sessionId: string, options: CookieOptions): string {
  const attrs = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${options.maxAgeSec}`,
  ]
  if (options.secure) attrs.push('Secure')
  return attrs.join('; ')
}

export function buildClearedSessionCookie(options: Pick<CookieOptions, 'secure'>): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  if (options.secure) attrs.push('Secure')
  return attrs.join('; ')
}
