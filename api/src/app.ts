import Fastify, { type FastifyInstance } from 'fastify'
import { ApiError } from './config/errors.ts'
import type { AppContext } from './context.ts'
import { registerAdminRoutes } from './routes/admin.ts'
import { registerPublicRoutes } from './routes/public.ts'
import { registerSessionRoutes } from './routes/session.ts'

const BODY_LIMIT_BYTES = 2 * 1024 * 1024

export function buildApp(ctx: AppContext): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // 请求来自 nginx 反代，需要信任 X-Forwarded-* 才能拿到真实来源 IP 与协议
    trustProxy: true,
    bodyLimit: BODY_LIMIT_BYTES,
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.status)
      return error.toBody()
    }

    const status = (error as { statusCode?: number }).statusCode
    if (status === 400 || status === 413 || status === 415) {
      reply.code(status)
      return {
        error: {
          code: 'VALIDATION_FAILED',
          message:
            status === 413 ? '请求体超过 2MB 上限' : '请求格式不正确',
        },
      }
    }

    request.log.error({ err: error }, '未处理的服务端错误')
    reply.code(500)
    return { error: { code: 'INTERNAL', message: '服务内部错误' } }
  })

  app.setNotFoundHandler((request, reply) => {
    reply.code(404)
    return {
      error: {
        code: 'NOT_FOUND',
        message: `未知接口：${request.method} ${request.url}`,
      },
    }
  })

  /** 容器健康检查入口。 */
  app.get('/healthz', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return 'ok\n'
  })

  registerSessionRoutes(app, ctx)
  registerAdminRoutes(app, ctx)
  registerPublicRoutes(app, ctx)

  return app
}
