import assert from 'node:assert/strict'
import { parseIconLinks, parseManifestIcons, resolveHref } from '../src/icons/icon-url.ts'

// ── resolveHref ──────────────────────────────────────────────
const BASE = 'http://192.168.28.30:8019/some/page?x=1'

assert.equal(resolveHref('/favicon.ico', BASE), 'http://192.168.28.30:8019/favicon.ico')
assert.equal(resolveHref('favicon.svg', BASE), 'http://192.168.28.30:8019/some/favicon.svg')
assert.equal(resolveHref('./logo.svg', BASE), 'http://192.168.28.30:8019/some/logo.svg')
assert.equal(resolveHref('//cdn.example.com/i.png', BASE), 'http://cdn.example.com/i.png')
assert.equal(resolveHref('https://a.example.com/i.png', BASE), 'https://a.example.com/i.png')
assert.equal(resolveHref('  /favicon.ico  ', BASE), 'http://192.168.28.30:8019/favicon.ico')

// 非 http(s) 一律拒绝：内联图片塞进配置没有意义，javascript: 更不能要
assert.equal(resolveHref('data:image/png;base64,AAAA', BASE), null)
assert.equal(resolveHref('javascript:alert(1)', BASE), null)
assert.equal(resolveHref('   ', BASE), null)

// ── parseIconLinks ───────────────────────────────────────────
const html = `<!doctype html>
<html><head>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link href="/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5b5fd5">
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="data:image/png;base64,AAAA">
  <meta name="twitter:image" content="/nope.png">
</head></html>`

const parsed = parseIconLinks(html, 'http://192.168.28.30:8019')

// SVG 必须排第一：矢量、体积小，任何分辨率都清楚
assert.equal(parsed.icons[0]?.url, 'http://192.168.28.30:8019/images/favicon.svg')
assert.equal(parsed.icons[0]?.source, 'link')
// 其次是声明尺寸的 apple-touch-icon（180×180）
assert.equal(parsed.icons[1]?.url, 'http://192.168.28.30:8019/apple-touch-icon.png')

const urls = parsed.icons.map((icon) => icon.url)
assert.ok(urls.includes('http://192.168.28.30:8019/favicon.ico'))
assert.ok(urls.includes('http://192.168.28.30:8019/favicon-32x32.png'))
// 非图标的 link（stylesheet）、data URI、meta 标签都不该混进来
assert.equal(urls.length, 4)
assert.ok(!urls.some((url) => url.includes('style.css')))
// mask-icon 是 Safari 固定标签页的单色剪影，不是卡片图标，必须排除。
// 它是 SVG，如果不排除会一路排到第一名（实测 Navidrome 就踩过这个）。
assert.ok(!urls.some((url) => url.includes('safari-pinned-tab')))

// manifest 单独收集，不混进图标候选
assert.deepEqual(parsed.manifests, ['http://192.168.28.30:8019/site.webmanifest'])

// 属性顺序、引号风格、无引号属性都要能读
const messy = `<link href=/a.ico rel="shortcut icon"><link rel='icon' href='/b.svg'/>`
const messyParsed = parseIconLinks(messy, 'http://h/')
assert.deepEqual(
  messyParsed.icons.map((icon) => icon.url).sort(),
  ['http://h/a.ico', 'http://h/b.svg'],
)

// 没有任何图标声明时返回空数组，由调用方去回落 /favicon.ico
assert.deepEqual(parseIconLinks('<html><head></head></html>', 'http://h/'), {
  icons: [],
  manifests: [],
})

// ── parseManifestIcons ───────────────────────────────────────
const manifest = JSON.stringify({
  name: 'Navidrome',
  icons: [
    { src: '/app/assets/android-icon-192x192-D_ka5daf.png', sizes: '192x192', type: 'image/png' },
    { src: 'android-icon-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: 'data:image/png;base64,AAAA', sizes: '512x512' },
    { sizes: '256x256' },
    'not-an-object',
  ],
})

const manifestIcons = parseManifestIcons(manifest, 'http://192.168.28.30:8014/site.webmanifest')
assert.deepEqual(
  manifestIcons.map((icon) => icon.url),
  // 512 排在 192 前面（权重按声明尺寸）；相对 src 是相对 manifest 自己的 URL 解析的，
  // manifest 在站点根目录，所以 'android-icon-512x512.png' 落到 /android-icon-512x512.png
  ['http://192.168.28.30:8014/android-icon-512x512.png', 'http://192.168.28.30:8014/app/assets/android-icon-192x192-D_ka5daf.png'],
)
assert.ok(manifestIcons.every((icon) => icon.source === 'manifest'))

// 坏 JSON / 结构不对不能抛，直接当作没有图标
assert.deepEqual(parseManifestIcons('{ not json', 'http://h/m.json'), [])
assert.deepEqual(parseManifestIcons('{}', 'http://h/m.json'), [])
assert.deepEqual(parseManifestIcons('[]', 'http://h/m.json'), [])
assert.deepEqual(parseManifestIcons('{"icons":{}}', 'http://h/m.json'), [])

console.log('icon-url: 全部断言通过')
