import { createHash } from 'node:crypto'
import path from 'node:path'

export interface AppEnv {
  adminUsername: string
  adminToken: string
  sessionTtlMs: number
  configFile: string
  backupDir: string
  port: number
  host: string
}

/** 令牌最小长度。低于此值拒绝启动，避免出现 123456 这类凭据。 */
export const MIN_TOKEN_LENGTH = 16

const DEFAULT_CONFIG_FILE = '/etc/docker-tools/conf.yml'
const DEFAULT_BACKUP_DIR = '/data/backups'
const DEFAULT_SESSION_TTL_HOURS = 8

export class EnvError extends Error {}

function required(source: NodeJS.ProcessEnv, key: string, hint: string): string {
  const raw = source[key]?.trim() ?? ''
  if (!raw) {
    throw new EnvError(
      `未设置 ${key}。\n` +
        `  ${hint}\n` +
        `  可在项目根目录的 .env 里配置，或写入 docker-compose.yml 的 api.environment。`,
    )
  }
  return raw
}

function positiveInt(raw: string | undefined, fallback: number, key: string): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new EnvError(`${key} 必须是正数，当前值：${JSON.stringify(raw)}`)
  }
  return Math.floor(n)
}

/**
 * 读取并校验环境变量。校验不通过时抛出 EnvError，由调用方决定如何终止进程，
 * 这样单元测试可以直接断言错误信息，不必真的退出进程。
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const adminUsername = required(
    source,
    'ADMIN_USERNAME',
    '这是控制台的登录用户名。',
  )

  const adminToken = required(source, 'ADMIN_TOKEN', '这是控制台的登录令牌。')

  if (adminToken.length < MIN_TOKEN_LENGTH) {
    throw new EnvError(
      `ADMIN_TOKEN 太短（当前 ${adminToken.length} 个字符，至少需要 ${MIN_TOKEN_LENGTH} 个）。\n` +
        `  建议用以下命令生成一个：\n` +
        `    openssl rand -base64 24`,
    )
  }

  const ttlHours = positiveInt(
    source.SESSION_TTL_HOURS,
    DEFAULT_SESSION_TTL_HOURS,
    'SESSION_TTL_HOURS',
  )

  const configFile = path.resolve(source.CONFIG_FILE?.trim() || DEFAULT_CONFIG_FILE)
  const backupDir = path.resolve(source.BACKUP_DIR?.trim() || DEFAULT_BACKUP_DIR)

  return {
    adminUsername,
    adminToken,
    sessionTtlMs: ttlHours * 60 * 60 * 1000,
    configFile,
    backupDir,
    port: positiveInt(source.PORT, 3000, 'PORT'),
    host: source.HOST?.trim() || '0.0.0.0',
  }
}

/** 启动日志里只输出令牌指纹，绝不输出原文。 */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8)
}
