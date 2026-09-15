import { access, stat } from 'node:fs/promises'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createBackup, listBackups } from '../config/backup.ts'
import { ApiError, toFieldErrors } from '../config/errors.ts'
import { normalizeConfig } from '../config/migrate.ts'
import { configSchema, type AppConfig } from '../config/schema.ts'
import type { AppContext } from '../context.ts'
import { resolveIcon } from '../icons/icon-url.ts'
import { requireSession } from './session.ts'

interface Envelope {
  config: AppConfig
  drift: boolean
  loadedAt: string
}

function envelope(ctx: AppContext, config: AppConfig, drift: boolean): Envelope {
  const state = ctx.config.getState()
  return { config, drift, loadedAt: new Date(state?.loadedAt ?? Date.now()).toISOString() }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readParam(request: FastifyRequest, key: string): string {
  const params = asRecord(request.params)
  const value = params[key]
  if (typeof value !== 'string' || !value) {
    throw new ApiError('VALIDATION_FAILED', `缺少 ${key} 参数`)
  }
  return value
}

function readIdParam(request: FastifyRequest): string {
  return readParam(request, 'id')
}

export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  /** 鉴权 + 整体限流。所有 /api/admin/* 写读接口都过这一关。 */
  function guard(request: FastifyRequest): void {
    requireSession(request, ctx)
    const verdict = ctx.adminLimiter.consume(request.ip)
    if (!verdict.allowed) {
      throw new ApiError(
        'TOO_MANY_ATTEMPTS',
        `请求过于频繁，请 ${verdict.retryAfterSec} 秒后再试`,
      )
    }
  }

  /** 在当前配置的副本上做改动，再整体走一遍校验与备份。 */
  async function mutate(
    request: FastifyRequest,
    edit: (draft: AppConfig) => void,
  ): Promise<Envelope> {
    guard(request)
    const draft = structuredClone(ctx.config.get())
    edit(draft)
    const saved = await ctx.config.save(draft)
    return envelope(ctx, saved, false)
  }

  // ── 配置整体 ────────────────────────────────────────────────

  app.get('/api/admin/config', async (request) => {
    guard(request)
    const drift = await ctx.config.hasDrifted()
    return envelope(ctx, ctx.config.get(), drift)
  })

  app.put('/api/admin/config', async (request) => {
    guard(request)
    const saved = await ctx.config.save(request.body)
    return envelope(ctx, saved, false)
  })

  /** 只校验不落盘，供表单实时提示使用。 */
  app.post('/api/admin/config/validate', async (request) => {
    guard(request)
    const parsed = configSchema.safeParse(normalizeConfig(request.body))
    if (!parsed.success) {
      return { ok: false, errors: toFieldErrors(parsed.error) }
    }
    return { ok: true, errors: [] }
  })

  app.get('/api/admin/config/export', async (request, reply) => {
    guard(request)
    const yamlText = await ctx.config.exportYaml()
    reply.header('Content-Type', 'application/yaml; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="conf.yml"')
    return yamlText
  })

  app.post('/api/admin/config/import', async (request) => {
    guard(request)
    const body = asRecord(request.body)
    const yamlText = body.yaml
    if (typeof yamlText !== 'string' || !yamlText.trim()) {
      throw new ApiError('VALIDATION_FAILED', '请求体缺少 yaml 字段')
    }
    const saved = await ctx.config.importYaml(yamlText)
    return envelope(ctx, saved, false)
  })

  // ── 工具 ───────────────────────────────────────────────────

  app.post('/api/admin/tools', async (request) => {
    const tool = asRecord(request.body)
    return mutate(request, (draft) => {
      draft.tools.push(tool as unknown as AppConfig['tools'][number])
    })
  })

  app.put('/api/admin/tools/:id', async (request) => {
    const id = readIdParam(request)
    const patch = asRecord(request.body)
    if (typeof patch.id === 'string' && patch.id !== id) {
      throw new ApiError('VALIDATION_FAILED', '工具 id 不允许修改')
    }
    return mutate(request, (draft) => {
      const index = draft.tools.findIndex((tool) => tool.id === id)
      if (index === -1) throw new ApiError('NOT_FOUND', `工具不存在：${id}`)
      draft.tools[index] = { ...patch, id } as AppConfig['tools'][number]
    })
  })

  app.delete('/api/admin/tools/:id', async (request) => {
    const id = readIdParam(request)
    return mutate(request, (draft) => {
      const index = draft.tools.findIndex((tool) => tool.id === id)
      if (index === -1) throw new ApiError('NOT_FOUND', `工具不存在：${id}`)
      draft.tools.splice(index, 1)
    })
  })

  /** 拖拽排序：数组顺序即展示顺序。 */
  app.patch('/api/admin/tools/reorder', async (request) => {
    const body = asRecord(request.body)
    const ids = body.ids
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw new ApiError('VALIDATION_FAILED', '请求体缺少 ids 字符串数组')
    }
    return mutate(request, (draft) => {
      const order = new Map((ids as string[]).map((id, index) => [id, index]))
      if (order.size !== draft.tools.length) {
        throw new ApiError('VALIDATION_FAILED', 'ids 数量与现有工具数量不一致')
      }
      draft.tools.sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      )
    })
  })

  /**
   * 从工具地址推断它的图标地址，供控制台「自动获取图标」使用。
   *
   * 只回传一个 URL、不回传图片内容，所以它不会变成任意内容的代理。
   * 这确实会让服务端去请求调用方给出的地址（SSRF 面），属于刻意为之：
   * 管控台本来就要请求内网工具地址才能探活，且这个接口在 requireSession 之后，
   * 只对已登录的管理员开放。
   */
  app.post('/api/admin/icon-probe', async (request) => {
    guard(request)
    const body = asRecord(request.body)
    const url = body.url
    if (typeof url !== 'string' || !url.trim()) {
      throw new ApiError('VALIDATION_FAILED', '请求体缺少 url 字段')
    }
    return resolveIcon(url.trim())
  })

  // ── 标签 ───────────────────────────────────────────────────
  app.post('/api/admin/tags', async (request) => {
    const tag = asRecord(request.body)
    return mutate(request, (draft) => {
      draft.tags.push(tag as unknown as AppConfig['tags'][number])
    })
  })

  app.put('/api/admin/tags/:id', async (request) => {
    const id = readIdParam(request)
    const patch = asRecord(request.body)
    if (typeof patch.id === 'string' && patch.id !== id) {
      throw new ApiError('VALIDATION_FAILED', '标签 id 不允许修改')
    }
    return mutate(request, (draft) => {
      const index = draft.tags.findIndex((tag) => tag.id === id)
      if (index === -1) throw new ApiError('NOT_FOUND', `标签不存在：${id}`)
      draft.tags[index] = { ...patch, id } as AppConfig['tags'][number]
    })
  })

  /**
   * 删除标签。默认拒绝并返回引用它的工具列表——静默级联会让用户
   * 在不知情的情况下丢掉一批工具的分类。确需级联时用 ?force=true。
   */
  app.delete('/api/admin/tags/:id', async (request, reply) => {
    const id = readIdParam(request)
    const query = asRecord(request.query)
    const force = query.force === 'true' || query.force === '1'

    guard(request)
    const current = ctx.config.get()
    const referencedBy = current.tools
      .filter((tool) => tool.tags.includes(id))
      .map((tool) => tool.id)

    if (referencedBy.length > 0 && !force) {
      reply.code(409)
      return {
        error: {
          code: 'CONFLICT',
          message: `标签被 ${referencedBy.length} 个工具引用，确认后可从这些工具上一并移除`,
          details: referencedBy.map((toolId) => ({
            field: `tools.${toolId}.tags`,
            message: '引用了该标签',
          })),
        },
        referencedBy,
      }
    }

    const draft = structuredClone(current)
    const index = draft.tags.findIndex((tag) => tag.id === id)
    if (index === -1) throw new ApiError('NOT_FOUND', `标签不存在：${id}`)
    draft.tags.splice(index, 1)
    if (force) {
      for (const tool of draft.tools) {
        tool.tags = tool.tags.filter((tagId) => tagId !== id)
      }
    }

    const saved = await ctx.config.save(draft)
    return envelope(ctx, saved, false)
  })

  // ── 备份 ───────────────────────────────────────────────────

  app.get('/api/admin/backups', async (request) => {
    guard(request)
    return { backups: await listBackups(ctx.env.backupDir) }
  })

  app.post('/api/admin/backups/:name/restore', async (request) => {
    const name = readParam(request, 'name')
    guard(request)
    const saved = await ctx.config.restore(name)
    return envelope(ctx, saved, false)
  })

  /** 手动触发一次备份，便于在改动前留一个还原点。 */
  app.post('/api/admin/backups', async (request) => {
    guard(request)
    try {
      await access(ctx.env.configFile)
    } catch {
      throw new ApiError('NOT_FOUND', '配置文件不存在，无法备份')
    }
    const name = await createBackup(ctx.env.backupDir, ctx.env.configFile)
    const info = await stat(`${ctx.env.backupDir}/${name}`)
    return { name, size: info.size, modifiedAt: info.mtime.toISOString() }
  })
}
