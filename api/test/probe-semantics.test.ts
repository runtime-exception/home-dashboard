import http from 'node:http'
import { isOnlineStatus, probe } from '../src/health/probe.ts'

// 逐个状态码验证「在线」判定与旧 nginx error_page 表是否一致
const server = http.createServer((req, res) => {
  const code = Number((req.url ?? '/').slice(1))
  if (code === 999) return // 故意不响应，用来测超时
  res.writeHead(code, { 'content-type': 'text/plain' })
  res.end('x')
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port

const expectOnline = [200, 204, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405, 409, 422, 429]
const expectOffline = [408, 410, 418, 500, 502, 503, 504]

let failures = 0

console.log('── 应判为「在线」 ──')
for (const code of expectOnline) {
  const actual = await probe(`http://127.0.0.1:${port}/${code}`, 1500)
  const ok = actual === 'online'
  if (!ok) failures += 1
  console.log(`  ${String(code).padStart(3)} → ${actual.padEnd(7)} ${ok ? '' : '  ← 期望 online'}`)
}

console.log('\n── 应判为「离线」 ──')
for (const code of expectOffline) {
  const actual = await probe(`http://127.0.0.1:${port}/${code}`, 1500)
  const ok = actual === 'offline'
  if (!ok) failures += 1
  console.log(`  ${String(code).padStart(3)} → ${actual.padEnd(7)} ${ok ? '' : '  ← 期望 offline'}`)
}

console.log('\n── 超时与错误 ──')
const hung = await probe(`http://127.0.0.1:${port}/999`, 600)
console.log(`  挂起不响应（600ms 超时） → ${hung}`)
if (hung !== 'offline') failures += 1

const refused = await probe('http://127.0.0.1:1/', 800)
console.log(`  连接被拒 → ${refused}`)
if (refused !== 'offline') failures += 1

const badUrl = await probe('not-a-url', 800)
console.log(`  非法 URL → ${badUrl}`)
if (badUrl !== 'offline') failures += 1

console.log('\n── isOnlineStatus 纯函数抽查 ──')
for (const [code, want] of [
  [302, true],
  [401, true],
  [408, false],
  [500, false],
] as const) {
  const got = isOnlineStatus(code)
  if (got !== want) failures += 1
  console.log(`  ${code} → ${got} ${got === want ? '' : '← 不符'}`)
}

server.close()
console.log(failures === 0 ? '\n全部通过' : `\n有 ${failures} 项不符`)
process.exit(failures === 0 ? 0 : 1)
