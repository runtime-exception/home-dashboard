import { CONFIG_VERSION, defaultSearchConfig } from './schema.ts'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把任意版本的原始配置补齐到当前版本，供后续 schema 校验。
 *
 * 必须在 safeParse 之前调用：现有 conf.yml 没有 version 字段，
 * 直接拿当前 schema 去卡会让所有历史配置整份报错。
 *
 * 只补字段、不删字段——用户手写的未知键原样保留。
 */
export function normalizeConfig(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw

  const config: Record<string, unknown> = { ...raw }
  const version = typeof config.version === 'number' ? config.version : 1

  if (version > CONFIG_VERSION) {
    // 比当前程序还新的配置：不猜测语义，原样交给 schema，由校验给出明确错误
    return config
  }

  if (version <= 1) {
    if (!Array.isArray(config.tags)) config.tags = []

    if (Array.isArray(config.tools)) {
      config.tools = config.tools.map((tool) =>
        isPlainObject(tool) ? { tags: [], ...tool } : tool,
      )
    }

    if (isPlainObject(config.dashboard)) {
      config.dashboard = { adminEntry: false, ...config.dashboard }
    }
  }

  if (version <= 2 && !isPlainObject(config.search)) {
    config.search = defaultSearchConfig()
  }

  config.version = CONFIG_VERSION

  return config
}
