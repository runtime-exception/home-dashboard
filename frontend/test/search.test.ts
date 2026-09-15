import assert from 'node:assert/strict'
import { buildSearchUrl, resolveSearchEngineId } from '../src/services/tools.ts'

const config = {
  defaultEngine: 'bing',
  engines: [
    { id: 'baidu', name: '百度', urlTemplate: 'https://www.baidu.com/s?wd={query}', enabled: true },
    { id: 'bing', name: '必应', urlTemplate: 'https://www.bing.com/search?q={query}', enabled: true },
    { id: 'google', name: 'Google', urlTemplate: 'https://www.google.com/search?q={query}', enabled: false },
  ],
}

assert.equal(
  buildSearchUrl(config.engines[1]!.urlTemplate, ' 苹果 health & wallet '),
  'https://www.bing.com/search?q=%E8%8B%B9%E6%9E%9C%20health%20%26%20wallet',
)
assert.equal(resolveSearchEngineId(config, 'baidu'), 'baidu')
assert.equal(resolveSearchEngineId(config, 'google'), 'bing')
assert.equal(resolveSearchEngineId(config, 'missing'), 'bing')

console.log('搜索 URL 编码与引擎回退全部通过')
