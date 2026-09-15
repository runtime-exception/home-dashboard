import { probeAll, type ProbeStatus } from './probe.ts'

export interface HealthToolEntry {
  id: string
  status: ProbeStatus | 'disabled'
}

export interface HealthPayload {
  checkedAt: string
  tools: HealthToolEntry[]
}

export interface HealthSnapshot {
  etag: string
  body: HealthPayload
}

export interface SnapshotOptions {
  /** 当前启用的工具及其内网地址。 */
  targets: () => ReadonlyArray<{ id: string; url: string }>
  /** 全部工具 id 及其启用状态（含被禁用的，状态固定为 disabled）。 */
  all: () => ReadonlyArray<{ id: string; enabled: boolean }>
}

const TTL_MS = 3000
const TOOL_TIMEOUT_MS = 1500
const CONCURRENCY = 8

/**
 * 聚合状态快照：一轮探测服务所有请求方。
 * - TTL 内直接复用结果
 * - 同时在途的请求共享同一个 promise（多个标签页只跑一轮）
 */
export function createHealthSnapshotter(options: SnapshotOptions) {
  let cache: (HealthSnapshot & { at: number }) | null = null
  let inflight: Promise<HealthSnapshot> | null = null

  async function refresh(): Promise<HealthSnapshot> {
    const results = await probeAll(options.targets(), {
      timeoutMs: TOOL_TIMEOUT_MS,
      concurrency: CONCURRENCY,
    })

    const body: HealthPayload = {
      checkedAt: new Date().toISOString(),
      tools: options.all().map((tool) => ({
        id: tool.id,
        status: tool.enabled === false ? 'disabled' : (results.get(tool.id) ?? 'offline'),
      })),
    }

    const online = body.tools.filter((tool) => tool.status === 'online').length
    const etag = `W/"${body.tools.length}-${online}-${Math.floor(Date.now() / 1000)}"`
    return { etag, body }
  }

  return async function snapshot(): Promise<HealthSnapshot> {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return { etag: cache.etag, body: cache.body }
    }
    if (inflight) return inflight

    inflight = refresh()
      .then((result) => {
        cache = { ...result, at: Date.now() }
        return result
      })
      .finally(() => {
        inflight = null
      })

    return inflight
  }
}
