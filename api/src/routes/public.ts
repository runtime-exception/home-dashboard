import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ApiError } from '../config/errors.ts'
import type { AppContext } from '../context.ts'
import { probe } from '../health/probe.ts'

const SINGLE_PROBE_TIMEOUT_MS = 1500

function readIdParam(request: FastifyRequest): string {
  const params = request.params as Record<string, unknown> | undefined
  const id = params?.id
  if (typeof id !== 'string' || !id) throw new ApiError('VALIDATION_FAILED', '缺少 id 参数')
  return id
}

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  /**
   * 前端读取的配置。由内存中的配置对象即时序列化，磁盘上不存在这个文件，
   * 因此不会出现「YAML 与 JSON 两份状态不一致」的问题。
   */
  app.get('/api/config.json', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store')

    if (!ctx.config.isReady()) {
      const error = ctx.config.lastError()
      reply.code(503)
      return {
        error: {
          code: 'CONFLICT',
          message: error?.message ?? '配置不可用，请检查 conf.yml',
          ...(error?.details.length ? { details: error.details } : {}),
        },
      }
    }

    return ctx.config.publicConfig()
  })

  /** 聚合状态：一次返回全部工具，替代浏览器侧的 N 个并发请求。 */
  app.get('/api/health', async (request, reply) => {
    if (!ctx.config.isReady()) {
      throw new ApiError('CONFLICT', '配置不可用，无法探测工具状态')
    }

    const snapshot = await ctx.snapshot()
    reply.header('Cache-Control', 'no-cache')
    reply.header('ETag', snapshot.etag)

    if (request.headers['if-none-match'] === snapshot.etag) {
      return reply.code(304).send()
    }

    return snapshot.body
  })

  /** 单个工具的实时探测，用于排查「为什么这个工具显示离线」。 */
  app.get('/api/health/:id', async (request) => {
    const id = readIdParam(request)
    const tool = ctx.config.get().tools.find((candidate) => candidate.id === id)
    if (!tool) throw new ApiError('NOT_FOUND', `工具不存在：${id}`)

    if (tool.enabled === false) {
      return { id: tool.id, status: 'disabled' as const }
    }

    return {
      id: tool.id,
      status: await probe(tool.internalUrl, SINGLE_PROBE_TIMEOUT_MS),
      checkedAt: new Date().toISOString(),
    }
  })
}
