import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Document } from 'yaml'
import { writeFileAtomic } from './atomic-write.ts'
import { createBackup, isBackupName } from './backup.ts'
import { ApiError, toFieldErrors, type FieldError } from './errors.ts'
import { normalizeConfig } from './migrate.ts'
import { CONFIG_VERSION, configSchema, type AppConfig } from './schema.ts'
import { createWriteQueue } from './write-queue.ts'
import {
  YamlSyntaxError,
  loadConfigDocument,
  mergeConfigIntoDocument,
  serializeConfigDocument,
} from './yaml-io.ts'

export interface PublicTag {
  id: string
  label: string
  color: string | null
  order: number
}

export interface PublicTool {
  id: string
  title: string
  description: string
  icon: string
  internalUrl: string
  publicUrl: string
  accent: string | null
  tags: string[]
  enabled: boolean
}

/** `/api/config.json` 的响应体。前端契约，字段名改动需同步前端。 */
export interface PublicConfig {
  dashboard: { title: string; description: string; adminEntry: boolean }
  search: AppConfig['search']
  networkTest: { ip: string; port?: number; protocol: 'http' | 'https'; timeoutMs: number }
  tags: PublicTag[]
  tools: PublicTool[]
}

export interface ConfigState {
  config: AppConfig
  loadedAt: number
  /** 载入时磁盘内容的 sha256，用于检测外部修改。 */
  hash: string
}

export interface ConfigStore {
  /** 从磁盘载入。失败时不抛异常，而是记录错误并把状态标记为不可用。 */
  load(): Promise<void>
  isReady(): boolean
  lastError(): { message: string; details: FieldError[] } | null
  get(): AppConfig
  getState(): ConfigState | null
  publicConfig(): PublicConfig
  validate(input: unknown): AppConfig
  save(input: unknown): Promise<AppConfig>
  restore(backupName: string): Promise<AppConfig>
  importYaml(text: string): Promise<AppConfig>
  exportYaml(): Promise<string>
  /** 磁盘内容是否已被外部修改。 */
  hasDrifted(): Promise<boolean>
}

function hashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function toPublicConfig(config: AppConfig): PublicConfig {
  return {
    dashboard: {
      title: config.dashboard.title,
      description: config.dashboard.description,
      adminEntry: config.dashboard.adminEntry,
    },
    search: config.search,
    networkTest: {
      ip: config.networkTest.ip,
      ...(config.networkTest.port === undefined ? {} : { port: config.networkTest.port }),
      protocol: config.networkTest.protocol,
      timeoutMs: config.networkTest.timeoutMs,
    },
    tags: config.tags.map((tag, index) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color ?? null,
      order: index,
    })),
    tools: config.tools.map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      icon: tool.icon,
      internalUrl: tool.internalUrl,
      publicUrl: tool.publicUrl,
      accent: tool.accent ?? null,
      tags: tool.tags,
      enabled: tool.enabled,
    })),
  }
}

export function createConfigStore(options: {
  configFile: string
  backupDir: string
}): ConfigStore {
  const { configFile, backupDir } = options
  const enqueue = createWriteQueue()

  let state: ConfigState | null = null
  let error: { message: string; details: FieldError[] } | null = null

  function validate(input: unknown): AppConfig {
    const parsed = configSchema.safeParse(normalizeConfig(input))
    if (!parsed.success) {
      throw new ApiError('VALIDATION_FAILED', '配置校验未通过', toFieldErrors(parsed.error))
    }
    return parsed.data as AppConfig
  }

  async function readFromDisk(): Promise<{ text: string; doc: Document; config: AppConfig }> {
    if (!(await fileExists(configFile))) {
      throw new ApiError('NOT_FOUND', `配置文件不存在：${configFile}`)
    }
    const { doc, plain } = await loadConfigDocument(configFile)
    const text = await readFile(configFile, 'utf8')
    return { text, doc, config: validate(plain) }
  }

  async function load(): Promise<void> {
    try {
      const { text, config } = await readFromDisk()
      state = { config, loadedAt: Date.now(), hash: hashOf(text) }
      error = null
    } catch (reason) {
      // 启动时不因为配置坏了就拒绝服务：控制台仍需可用，否则用户没有入口修复
      state = null
      error =
        reason instanceof YamlSyntaxError
          ? { message: reason.message, details: reason.details }
          : reason instanceof ApiError
            ? { message: reason.message, details: reason.details ?? [] }
            : { message: reason instanceof Error ? reason.message : String(reason), details: [] }
    }
  }

  function requireState(): ConfigState {
    if (!state) {
      throw new ApiError(
        'CONFLICT',
        error?.message ?? '配置尚未成功载入，请先修复配置文件',
        error?.details,
      )
    }
    return state
  }

  /**
   * 写盘：备份 → 合并进原文档（保注释）→ 序列化 → 原子写。
   * 若磁盘上的文件已经无法解析，则从空文档重建——这是配置被写坏后的逃生通道。
   */
  async function persist(next: AppConfig): Promise<AppConfig> {
    const hasCurrent = await fileExists(configFile)
    if (hasCurrent) {
      await createBackup(backupDir, configFile)
    }

    let doc: Document
    try {
      doc = hasCurrent ? (await loadConfigDocument(configFile)).doc : new Document({})
    } catch (reason) {
      if (!(reason instanceof YamlSyntaxError)) throw reason
      // 现有文件语法错误：已备份，直接以新配置重建
      doc = new Document({})
    }

    mergeConfigIntoDocument(doc, {
      version: CONFIG_VERSION,
      dashboard: next.dashboard as unknown as Record<string, unknown>,
      search: {
        defaultEngine: next.search.defaultEngine,
        engines: next.search.engines as unknown as Array<Record<string, unknown> & { id: string }>,
      },
      networkTest: next.networkTest as unknown as Record<string, unknown>,
      tags: next.tags as unknown as Array<Record<string, unknown> & { id: string }>,
      tools: next.tools as unknown as Array<Record<string, unknown> & { id: string }>,
    })

    const text = serializeConfigDocument(doc)
    await writeFileAtomic(configFile, text)

    state = { config: next, loadedAt: Date.now(), hash: hashOf(text) }
    error = null
    return next
  }

  return {
    load,

    isReady: () => state !== null,

    lastError: () => error,

    get: () => requireState().config,

    getState: () => state,

    publicConfig: () => toPublicConfig(requireState().config),

    validate,

    async save(input: unknown): Promise<AppConfig> {
      const next = validate(input)
      return enqueue(() => persist(next))
    },

    async restore(backupName: string): Promise<AppConfig> {
      return enqueue(async () => {
        if (!isBackupName(backupName)) {
          throw new ApiError('NOT_FOUND', '备份文件名不合法')
        }
        const source = path.join(backupDir, backupName)
        if (!(await fileExists(source))) {
          throw new ApiError('NOT_FOUND', `备份不存在：${backupName}`)
        }

        const text = await readFile(source, 'utf8')
        const { plain } = await loadConfigDocument(source)
        const next = validate(plain)

        // 覆盖前先备份当前配置，否则「恢复错了」就没有回头路
        if (await fileExists(configFile)) {
          await createBackup(backupDir, configFile)
        }
        await writeFileAtomic(configFile, text)
        state = { config: next, loadedAt: Date.now(), hash: hashOf(text) }
        error = null
        return next
      })
    },

    async importYaml(text: string): Promise<AppConfig> {
      const parsed = new Document(text)
      if (parsed.errors.length > 0) {
        throw new ApiError(
          'VALIDATION_FAILED',
          '导入的 YAML 语法有误',
          parsed.errors.map((issue) => {
            const pos = issue.linePos?.[0]
            return {
              field: pos ? `(yaml:${pos.line}:${pos.col})` : '(yaml)',
              message: issue.message,
            }
          }),
        )
      }
      const next = validate(parsed.toJS({ maxAliasCount: 100 }))
      return enqueue(() => persist(next))
    },

    async exportYaml(): Promise<string> {
      requireState()
      if (!(await fileExists(configFile))) {
        throw new ApiError('NOT_FOUND', `配置文件不存在：${configFile}`)
      }
      // 返回磁盘原文而非重新序列化的结果，这样导出件里注释是完整的
      return readFile(configFile, 'utf8')
    },

    async hasDrifted(): Promise<boolean> {
      if (!state) return false
      try {
        const current = await readFile(configFile, 'utf8')
        return hashOf(current) !== state.hash
      } catch {
        return true
      }
    },
  }
}
