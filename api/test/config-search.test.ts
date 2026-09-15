import assert from 'node:assert/strict'
import { parseDocument } from 'yaml'
import { mergeConfigIntoDocument, serializeConfigDocument } from '../src/config/yaml-io.ts'
import { normalizeConfig } from '../src/config/migrate.ts'
import { configSchema } from '../src/config/schema.ts'

const v2 = {
  version: 2,
  dashboard: { title: 'Tools Center', description: '', adminEntry: false },
  networkTest: { ip: '192.0.2.10', protocol: 'http', timeoutMs: 3000 },
  tags: [],
  tools: [],
}

const migrated = configSchema.parse(normalizeConfig(v2))
assert.equal(migrated.version, 3)
assert.equal(migrated.search.defaultEngine, 'bing')
assert.deepEqual(
  migrated.search.engines.map((engine) => engine.id),
  ['baidu', 'bing', 'google'],
)

function rejects(search: typeof migrated.search) {
  assert.equal(configSchema.safeParse({ ...migrated, search }).success, false)
}

rejects({
  defaultEngine: 'bing',
  engines: [...migrated.search.engines, { ...migrated.search.engines[1]! }],
})
rejects({
  defaultEngine: 'missing',
  engines: migrated.search.engines,
})
rejects({
  defaultEngine: 'bing',
  engines: migrated.search.engines.map((engine) => ({ ...engine, enabled: false })),
})
rejects({
  defaultEngine: 'bing',
  engines: migrated.search.engines.map((engine) =>
    engine.id === 'bing' ? { ...engine, enabled: false } : engine,
  ),
})
rejects({
  defaultEngine: 'bing',
  engines: migrated.search.engines.map((engine) =>
    engine.id === 'bing' ? { ...engine, urlTemplate: 'javascript:alert({query})' } : engine,
  ),
})
rejects({
  defaultEngine: 'bing',
  engines: migrated.search.engines.map((engine) =>
    engine.id === 'bing' ? { ...engine, urlTemplate: 'https://www.bing.com/search?q=value' } : engine,
  ),
})

const doc = parseDocument('version: 2\ndashboard: {}\nnetworkTest: {}\ntags: []\ntools: []\n')
mergeConfigIntoDocument(doc, {
  version: migrated.version,
  dashboard: migrated.dashboard,
  search: migrated.search,
  networkTest: migrated.networkTest,
  tags: migrated.tags,
  tools: migrated.tools,
})
const yaml = serializeConfigDocument(doc)
assert.ok(yaml.indexOf('\nsearch:') < yaml.indexOf('\nnetworkTest:'))
assert.match(yaml, /urlTemplate: https:\/\/www\.bing\.com\/search\?q=\{query\}/)

console.log('搜索配置迁移、校验与 YAML 写回全部通过')
