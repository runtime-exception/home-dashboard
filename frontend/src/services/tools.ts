import type {
  DashboardConfig,
  NetworkTestConfig,
  Tool,
  ToolStatus,
} from '../types/tool'

const REQUEST_TIMEOUT = 2000

export async function loadConfig(): Promise<DashboardConfig> {
  const response = await fetch('/api/config.json', { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`工具配置加载失败（HTTP ${response.status}）`)
  }

  const config = (await response.json()) as DashboardConfig
  return config
}

export function createTools(config: DashboardConfig): Tool[] {
  return config.tools.map((tool) => ({
    ...tool,
    status: tool.enabled === false ? 'disabled' : 'checking',
  }))
}

export async function checkLanAvailability(config: NetworkTestConfig): Promise<boolean> {
  const protocol = config.protocol ?? 'http'
  const port = config.port ? `:${config.port}` : ''
  const timeout = config.timeoutMs ?? 3000
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  const probeUrl = `${protocol}://${config.ip}${port}/?_tools_probe=${Date.now()}`

  try {
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

export async function checkToolStatus(tool: Tool): Promise<ToolStatus> {
  if (tool.enabled === false) return 'disabled'

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(`/api/health/${encodeURIComponent(tool.id)}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })

    return response.ok ? 'online' : 'offline'
  } catch {
    return 'offline'
  } finally {
    window.clearTimeout(timer)
  }
}
