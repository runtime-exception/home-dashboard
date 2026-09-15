import type {
  DashboardConfig,
  HealthPayload,
  NetworkTestConfig,
  SearchConfig,
  Tool,
  ToolStatus,
} from '../types/tool'

/** 内网可达性探测的超时由 conf.yml 的 networkTest.timeoutMs 决定。 */
const LAN_PROBE_TIMEOUT = 3000

/** 聚合探测是服务端串行分批跑 15 个工具，客户端给足余量。 */
const HEALTH_TIMEOUT = 10000

export async function loadConfig(): Promise<DashboardConfig> {
  const response = await fetch('/api/config.json', { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `工具配置加载失败（HTTP ${response.status}）`))
  }

  const config = (await response.json()) as DashboardConfig
  return { ...config, tags: config.tags ?? [], tools: config.tools ?? [] }
}

/** 503 时 api 会带 { error: { message } }，把它透出来比只报状态码有用得多。 */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message?.trim() || fallback
  } catch {
    return fallback
  }
}

export function createTools(config: DashboardConfig): Tool[] {
  return config.tools.map((tool) => ({
    ...tool,
    tags: tool.tags ?? [],
    status: tool.enabled === false ? 'disabled' : 'checking',
  }))
}

export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query.trim()))
}

export function resolveSearchEngineId(config: SearchConfig, storedId: string | null): string {
  const enabled = config.engines.filter((engine) => engine.enabled)
  if (storedId && enabled.some((engine) => engine.id === storedId)) return storedId
  if (enabled.some((engine) => engine.id === config.defaultEngine)) return config.defaultEngine
  return enabled[0]?.id ?? ''
}

export function tagLabelOf(config: DashboardConfig, tagId: string): string {
  return config.tags.find((tag) => tag.id === tagId)?.label ?? tagId
}

export async function checkLanAvailability(config: NetworkTestConfig): Promise<boolean> {
  const protocol = config.protocol ?? 'http'
  const port = config.port ? `:${config.port}` : ''
  const timeout = config.timeoutMs ?? LAN_PROBE_TIMEOUT
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  const probeUrl = `${protocol}://${config.ip}${port}/?_tools_probe=${Date.now()}`

  try {
    // no-cors 只判断「连得上」：opaque 响应也算成功，不读状态码。
    // 很多工具未登录会返回 401/403，用状态码判断会把它们误判成不可达。
    await fetch(probeUrl, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 一次取回全部工具状态。api 侧有 3 秒缓存 + 在途去重，
 * 所以多个标签页同时刷新也只会触发一轮真实探测。
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthPayload> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)

  try {
    const response = await fetch('/api/health', {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`状态探测失败（HTTP ${response.status}）`)
    }
    return (await response.json()) as HealthPayload
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function toToolStatus(status: string | undefined): ToolStatus {
  return status === 'online' || status === 'disabled' ? status : 'offline'
}
