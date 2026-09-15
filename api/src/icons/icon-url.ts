import http from 'node:http'
import https from 'node:https'

/**
 * 从一个网页地址推断它的图标地址。
 *
 * 为什么放在服务端：浏览器读不到跨域页面的 HTML，所以没法在前端解析
 * `<link rel="icon">`。只能猜那几个常见路径（/favicon.ico、/logo.svg），
 * 而实际站点经常把图标放在 /images/favicon.svg、/public/favicon.png 这种位置，
 * 或者只写在 web app manifest 里。服务端抓一次 HTML 就能拿到准确答案。
 */

export interface IconCandidate {
  url: string
  source: 'link' | 'manifest'
  /** 越大越优先。仅用于排序，没有其它含义。 */
  score: number
}

export interface ParsedIconLinks {
  icons: IconCandidate[]
  manifests: string[]
}

export type ResolveIconResult =
  | { ok: true; icon: string; source: IconCandidate['source'] | 'fallback' }
  | { ok: false; message: string }

export interface ResolveIconOptions {
  timeoutMs?: number
}

/** 与健康探测保持一致：内网自签证书很常见，这里只取图标地址、不传数据。 */
const ALLOW_INSECURE_TLS = true
const DEFAULT_TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3
const MAX_HTML_BYTES = 512 * 1024
const MAX_MANIFEST_BYTES = 256 * 1024
/** 最多验证这么多个候选，避免一个页面声明几十个图标时把请求打飞。 */
const MAX_VERIFY = 8

/**
 * 最后的兜底：按常见路径猜一遍。
 *
 * 猜错没有代价——必须真的返回图片才算数（返回 HTML 的一律被拒），
 * 但能覆盖「图标存在却没在页面里声明」的站点：SPA 的 index.html 里经常一个
 * <link rel="icon"> 都没有（实测 1Panel 就是这样，图标在 /public/favicon.png）。
 */
const WELL_KNOWN_ICON_PATHS = [
  '/favicon.ico',
  '/favicon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/logo.svg',
  // Vite / CRA 一类项目把 public/ 目录原样发布，所以图标会落在 /public/ 下
  '/public/favicon.png',
]

/** 兜底探测最多试这么多个。 */
const MAX_FALLBACK_PROBES = 8
/** 兜底用更短的超时：这些是猜测，不值得等太久。 */
const FALLBACK_TIMEOUT_MS = 2500

const ICON_RELS = new Set([
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  // 刻意不收 mask-icon：它是 Safari 固定标签页用的单色剪影，当卡片图标是错的
])

const LINK_RE = /<link\b[^>]*>/gi
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

function readAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR_RE.exec(tag)) !== null) {
    attrs.set((match[1] ?? '').toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

/** 把 href 解析成绝对地址。data:、javascript: 之类一律返回 null。 */
export function resolveHref(href: string, baseUrl: string): string | null {
  const trimmed = href.trim()
  if (!trimmed) return null
  try {
    const resolved = new URL(trimmed, baseUrl)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.toString()
      : null
  } catch {
    return null
  }
}

/** 从 sizes="192x192 512x512" 里取最大边长；sizes="any" 通常是 SVG。 */
function largestSize(sizes: string | undefined): number {
  if (!sizes) return 0
  if (/\bany\b/i.test(sizes)) return 1024
  let largest = 0
  for (const part of sizes.split(/\s+/)) {
    const match = /^(\d+)x(\d+)$/i.exec(part.trim())
    if (match) largest = Math.max(largest, Number(match[1]), Number(match[2]))
  }
  return largest
}

/**
 * 排序权重。规则就三条，按优先级：
 *   1. SVG 最优——矢量、体积小，任何分辨率都清楚；
 *   2. 其次是声明尺寸大的（安卓图标 192/512 通常比 favicon 清楚得多）；
 *   3. apple-touch-icon 没写 sizes 时给个加成，它们一般是 180×180。
 */
function scoreOf(url: string, declaredSize: number, rel: string): number {
  const isSvg = /\.svgz?($|[?#])/i.test(url)
  if (isSvg) return 100_000
  const base = declaredSize > 0 ? declaredSize : 32
  return rel.includes('apple-touch-icon') ? base + 1_000 : base
}

/** 去重（同一地址保留权重高的那份）并按优先级从高到低排序。 */
function rankAndDedupe(candidates: readonly IconCandidate[]): IconCandidate[] {
  const best = new Map<string, IconCandidate>()
  for (const candidate of candidates) {
    const existing = best.get(candidate.url)
    if (!existing || candidate.score > existing.score) best.set(candidate.url, candidate)
  }
  // sort 是稳定的：权重相同时保留文档顺序
  return [...best.values()].sort((a, b) => b.score - a.score)
}

/** 纯函数：从 HTML 里抽出图标候选与 manifest 地址。 */
export function parseIconLinks(html: string, baseUrl: string): ParsedIconLinks {
  const icons: IconCandidate[] = []
  const manifests: string[] = []

  LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK_RE.exec(html)) !== null) {
    const attrs = readAttributes(match[0])
    const rel = (attrs.get('rel') ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const href = attrs.get('href')
    if (!rel || !href) continue

    const absolute = resolveHref(href, baseUrl)
    if (!absolute) continue

    if (rel === 'manifest') {
      manifests.push(absolute)
      continue
    }
    if (!ICON_RELS.has(rel)) continue

    icons.push({
      url: absolute,
      source: 'link',
      score: scoreOf(absolute, largestSize(attrs.get('sizes')), rel),
    })
  }

  return { icons: rankAndDedupe(icons), manifests: [...new Set(manifests)] }
}

/** 纯函数：从 web app manifest 里抽出图标候选。manifest 里的 src 是相对 manifest 自己的。 */
export function parseManifestIcons(manifestJson: string, manifestUrl: string): IconCandidate[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestJson)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []

  const icons = (parsed as { icons?: unknown }).icons
  if (!Array.isArray(icons)) return []

  const found: IconCandidate[] = []
  for (const entry of icons) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const src = typeof record.src === 'string' ? record.src : ''
    if (!src) continue
    const absolute = resolveHref(src, manifestUrl)
    if (!absolute) continue
    const sizes = typeof record.sizes === 'string' ? record.sizes : ''
    found.push({ url: absolute, source: 'manifest', score: scoreOf(absolute, largestSize(sizes), '') })
  }
  return rankAndDedupe(found)
}

interface RawResponse {
  status: number
  location?: string
  contentType: string
  /** 跟随重定向后的最终地址。相对 href 必须以它为基准解析。 */
  finalUrl: string
  body: string
}

/** maxBytes 传 0 表示只读响应头，不取正文。 */
function requestOnce(target: URL, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const isTls = target.protocol === 'https:'
    const transport = isTls ? https : http

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isTls ? 443 : 80),
        path: `${target.pathname}${target.search}` || '/',
        method: 'GET',
        headers: {
          Host: target.host,
          'User-Agent': 'home-dashboard-icon/1.0',
          Accept: '*/*',
          // 一次性请求，不复用连接：中途 destroy 会污染 keep-alive 池
          Connection: 'close',
        },
        rejectUnauthorized: ALLOW_INSECURE_TLS ? false : undefined,
        agent: false,
        timeout: timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0
        const location = response.headers.location
        const contentType = (
          String(response.headers['content-type'] ?? '').split(';')[0] ?? ''
        )
          .trim()
          .toLowerCase()
        const finalUrl = target.toString()

        if (maxBytes <= 0) {
          response.destroy()
          resolve({ status, location, contentType, finalUrl, body: '' })
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        const finish = () =>
          resolve({
            status,
            location,
            contentType,
            finalUrl,
            body: Buffer.concat(chunks).toString('utf8'),
          })

        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            response.destroy()
            return
          }
          chunks.push(chunk)
        })
        // destroy 之后也只会走到这里，所以用 close 收口即可
        response.on('close', finish)
        response.on('error', finish)
      },
    )

    request.on('timeout', () => request.destroy(new Error('图标探测超时')))
    request.on('error', reject)
    request.end()
  })
}

async function fetchFollowing(startUrl: string, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  let current = new URL(startUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error('只支持 http 或 https 地址')
    }
    const response = await requestOnce(current, timeoutMs, maxBytes)
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, current)
      continue
    }
    return response
  }
  throw new Error('重定向次数过多')
}

/** 确认某个地址真的返回图片，而不是伪装成图标的 404 HTML 页。 */
async function isImage(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetchFollowing(url, timeoutMs, 0)
    if (response.status < 200 || response.status >= 300) return false
    if (response.contentType.startsWith('image/')) return true
    // 有些服务器对 .ico 回 octet-stream 甚至不回 content-type，这种情况放行；
    // 但明确是 text/html 的一定是错误页，拒绝。
    return response.contentType === '' || response.contentType === 'application/octet-stream'
  } catch {
    return false
  }
}

/**
 * 组装兜底候选：站点根 + 页面同级各来一遍。
 * 顺序上先排根目录的，这样 MAX_FALLBACK_PROBES 截断时留下的是更有价值的那批。
 */
function fallbackUrls(origin: string, finalPageUrl: string, extended: boolean): string[] {
  const paths = extended ? WELL_KNOWN_ICON_PATHS : ['/favicon.ico']
  const atRoot = paths.map((path) => new URL(path, origin).toString())
  // 页面挂在子路径下时（SPA 常见），图标往往就在页面同级
  const atSibling = paths.map((path) => new URL(path.replace(/^\//, ''), finalPageUrl).toString())
  return [...new Set([...atRoot, ...atSibling])]
}

export async function resolveIcon(
  rawUrl: string,
  options: ResolveIconOptions = {},
): Promise<ResolveIconResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let pageUrl: URL
  try {
    pageUrl = new URL(rawUrl.trim())
  } catch {
    return { ok: false, message: '地址不是合法的 URL' }
  }
  if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') {
    return { ok: false, message: '只支持 http 或 https 地址' }
  }

  let candidates: IconCandidate[] = []
  // 重定向后的最终地址。相对 href 必须相对它解析——站点把页面 302 到 /app/ 这类子路径时，
  // 用跳转前的地址去拼会得到 /favicon-32x32.png 而不是 /app/favicon-32x32.png。
  let finalPageUrl = pageUrl.toString()
  let pageReachable = false

  // 1) 抓页面 HTML，解析 <link rel="icon"> 与 manifest 地址
  try {
    const page = await fetchFollowing(pageUrl.toString(), timeoutMs, MAX_HTML_BYTES)
    finalPageUrl = page.finalUrl
    pageReachable = page.status >= 200 && page.status < 300
    if (pageReachable && page.body) {
      const parsed = parseIconLinks(page.body, finalPageUrl)
      candidates = [...parsed.icons]

      // manifest 里的图标一般是 192/512 那一档，比 favicon 清楚
      for (const manifestUrl of parsed.manifests.slice(0, 2)) {
        try {
          const manifest = await fetchFollowing(manifestUrl, timeoutMs, MAX_MANIFEST_BYTES)
          if (manifest.status >= 200 && manifest.status < 300 && manifest.body) {
            // manifest 内相对 src 相对它自己的最终地址解析
            candidates.push(...parseManifestIcons(manifest.body, manifest.finalUrl))
          }
        } catch {
          // manifest 拿不到就跳过，不影响后面的回落
        }
      }
    }
  } catch {
    // 页面本身抓不到（可能只有静态资源可达），仍然值得试 /favicon.ico
  }

  // 2) 按优先级逐个确认
  const ranked = rankAndDedupe(candidates)
  for (const candidate of ranked.slice(0, MAX_VERIFY)) {
    if (await isImage(candidate.url, timeoutMs)) {
      return { ok: true, icon: candidate.url, source: candidate.source }
    }
  }

  // 3) 兜底。页面抓不到时（站点可能整体不可达）只试最标准的 /favicon.ico，
  //    免得把常见路径全猜一遍、失败时拖很久；
  //    页面抓到了才值得多猜几个。
  const fallbacks = fallbackUrls(pageUrl.origin, finalPageUrl, pageReachable)
  for (const fallback of fallbacks.slice(0, MAX_FALLBACK_PROBES)) {
    if (await isImage(fallback, Math.min(timeoutMs, FALLBACK_TIMEOUT_MS))) {
      return { ok: true, icon: fallback, source: 'fallback' }
    }
  }

  return { ok: false, message: '没能从该地址找到可用图标，请手工填写图标地址' }
}
