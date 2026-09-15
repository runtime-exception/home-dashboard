import http from 'node:http'
import https from 'node:https'

export type ProbeStatus = 'online' | 'offline'

/**
 * 与改造前 nginx 的 error_page 映射表严格对齐：
 *   2xx / 3xx 全部 + 下列 4xx 视为在线，其余（含 5xx）与网络失败视为离线。
 *
 * 不要简化成 `status < 500`——那会把 408 等原本算离线的状态悄悄变成在线。
 * 4xx 算在线是有意为之：很多工具未登录时会返回 401/403。
 */
const ONLINE_4XX = new Set([400, 401, 403, 404, 405, 409, 422, 429])

export function isOnlineStatus(status: number): boolean {
  if (status >= 200 && status < 400) return true
  return ONLINE_4XX.has(status)
}

// 复用连接：十几个工具每隔几秒探测一轮，keep-alive 能省掉大量 TCP/TLS 握手
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 })

export function probe(rawUrl: string, timeoutMs: number): Promise<ProbeStatus> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (status: ProbeStatus) => {
      if (settled) return
      settled = true
      resolve(status)
    }

    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      settle('offline')
      return
    }

    const isTls = target.protocol === 'https:'
    const transport = isTls ? https : http

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isTls ? 443 : 80),
        path: `${target.pathname}${target.search}` || '/',
        method: 'HEAD',
        headers: {
          // 自托管服务常靠 Host 路由，必须带上
          Host: target.host,
          'User-Agent': 'home-dashboard-health/1.0',
          Connection: 'keep-alive',
        },
        // 内网自签证书很常见。这里只做探活、不传输任何数据，
        // 与改造前 nginx 未开启 proxy_ssl_verify 的行为保持一致，属于刻意设置。
        rejectUnauthorized: false,
        agent: isTls ? httpsAgent : httpAgent,
        timeout: timeoutMs,
      },
      (response) => {
        // 必须丢弃响应体，否则 socket 不会归还连接池
        response.resume()
        settle(isOnlineStatus(response.statusCode ?? 0) ? 'online' : 'offline')
      },
    )

    request.on('timeout', () => request.destroy(new Error('probe timeout')))
    request.on('error', () => settle('offline'))
    request.end()
  })
}

/** 带并发闸门的批量探测，避免十几个请求同时打满连接池。 */
export async function probeAll(
  targets: ReadonlyArray<{ id: string; url: string }>,
  options: { timeoutMs: number; concurrency: number },
): Promise<Map<string, ProbeStatus>> {
  const results = new Map<string, ProbeStatus>()
  let cursor = 0

  const workerCount = Math.max(1, Math.min(options.concurrency, targets.length))
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < targets.length) {
        const target = targets[cursor]
        cursor += 1
        if (!target) break
        results.set(target.id, await probe(target.url, options.timeoutMs))
      }
    }),
  )

  return results
}
