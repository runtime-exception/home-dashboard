import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  SESSION_COOKIE,
  buildClearedSessionCookie,
  buildSessionCookie,
  constantTimeEquals,
  readCookie,
  type Session,
} from '../auth/session.ts'
import { ApiError } from '../config/errors.ts'
import type { AppContext } from '../context.ts'

/** 登录接口的固定延迟，抬高离线爆破的成本。 */
const LOGIN_DELAY_MS = 300

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSecureRequest(request: FastifyRequest): boolean {
  const forwarded = request.headers['x-forwarded-proto']
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return (proto ?? request.protocol) === 'https'
}

export function currentSession(
  request: FastifyRequest,
  ctx: AppContext,
): Session | null {
  const id = readCookie(request.headers.cookie, SESSION_COOKIE)
  if (!id) return null
  return ctx.sessions.touch(id)
}

/** 管理接口的统一守卫。未登录时抛 401，由 app 的错误处理器转成标准错误体。 */
export function requireSession(request: FastifyRequest, ctx: AppContext): Session {
  const session = currentSession(request, ctx)
  if (!session) {
    throw new ApiError('UNAUTHENTICATED', '登录已过期，请重新登录')
  }
  return session
}

export function registerSessionRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/admin/session', async (request, reply) => {
    const ip = request.ip

    const verdict = ctx.loginLimiter.check(ip)
    if (!verdict.allowed) {
      reply.header('Retry-After', String(verdict.retryAfterSec))
      throw new ApiError(
        'TOO_MANY_ATTEMPTS',
        `登录失败次数过多，请 ${verdict.retryAfterSec} 秒后再试`,
      )
    }

    const body = request.body as { username?: unknown; token?: unknown } | undefined
    const username = typeof body?.username === 'string' ? body.username : ''
    const token = typeof body?.token === 'string' ? body.token : ''

    await delay(LOGIN_DELAY_MS)

    // 两个比较都执行，不因用户名错误而短路——避免从响应时间推断用户名是否存在
    const usernameMatches = constantTimeEquals(username, ctx.env.adminUsername)
    const tokenMatches = constantTimeEquals(token, ctx.env.adminToken)

    if (!usernameMatches || !tokenMatches) {
      ctx.loginLimiter.recordFailure(ip)
      // 不区分「用户名不存在」和「令牌错误」
      throw new ApiError('INVALID_CREDENTIALS', '用户名或令牌不正确')
    }

    ctx.loginLimiter.reset(ip)
    const session = ctx.sessions.create(ctx.env.adminUsername)

    reply.header(
      'Set-Cookie',
      buildSessionCookie(session.id, {
        maxAgeSec: Math.floor(ctx.env.sessionTtlMs / 1000),
        secure: isSecureRequest(request),
      }),
    )

    request.log.info({ username: session.username, ip }, '控制台登录成功')
    return { authenticated: true, username: session.username }
  })

  app.get('/api/admin/session', async (request) => {
    const session = currentSession(request, ctx)
    if (!session) throw new ApiError('UNAUTHENTICATED', '未登录')
    return { authenticated: true, username: session.username }
  })

  app.delete('/api/admin/session', async (request, reply) => {
    const id = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (id) ctx.sessions.destroy(id)

    reply.header(
      'Set-Cookie',
      buildClearedSessionCookie({ secure: isSecureRequest(request) }),
    )
    return { authenticated: false }
  })
}
