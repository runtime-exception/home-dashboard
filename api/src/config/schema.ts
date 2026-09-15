import { z } from 'zod'

const ID_RE = /^[a-z0-9][a-z0-9-]*$/
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** 当前配置版本。改动结构时递增，并在 migrate.ts 里补一条迁移。 */
export const CONFIG_VERSION = 3

export function defaultSearchConfig() {
  return {
    defaultEngine: 'bing',
    engines: [
      {
        id: 'baidu',
        name: '百度',
        urlTemplate: 'https://www.baidu.com/s?wd={query}',
        enabled: true,
      },
      {
        id: 'bing',
        name: '必应',
        urlTemplate: 'https://www.bing.com/search?q={query}',
        enabled: true,
      },
      {
        id: 'google',
        name: 'Google',
        urlTemplate: 'https://www.google.com/search?q={query}',
        enabled: true,
      },
    ],
  }
}

function httpUrl(what: string) {
  return z.string({ error: `${what}必须是字符串` }).refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, `${what}必须是 http 或 https 地址`)
}

export const tagSchema = z.looseObject({
  id: z
    .string({ error: '标签 id 必须是字符串' })
    .regex(ID_RE, '标签 id 只能包含小写字母、数字和连字符')
    .min(2, '标签 id 至少 2 个字符')
    .max(40, '标签 id 最多 40 个字符'),
  label: z
    .string({ error: '标签名称必须是字符串' })
    .min(1, '标签名称不能为空')
    .max(12, '标签名称最多 12 个字符'),
  color: z
    .string({ error: '颜色必须是字符串' })
    .regex(HEX_COLOR_RE, '颜色必须是 #RRGGBB 格式')
    .optional(),
})

export const searchEngineSchema = z.looseObject({
  id: z
    .string({ error: '搜索引擎 id 必须是字符串' })
    .regex(ID_RE, '搜索引擎 id 只能包含小写字母、数字和连字符')
    .min(2, '搜索引擎 id 至少 2 个字符')
    .max(40, '搜索引擎 id 最多 40 个字符'),
  name: z
    .string({ error: '搜索引擎名称必须是字符串' })
    .min(1, '搜索引擎名称不能为空')
    .max(24, '搜索引擎名称最多 24 个字符'),
  urlTemplate: httpUrl('搜索地址模板').refine(
    (value) => value.split('{query}').length === 2,
    '搜索地址模板必须且只能包含一个 {query}',
  ),
  enabled: z.boolean({ error: '搜索引擎启用状态必须是 true 或 false' }).default(true),
})

export const toolSchema = z.looseObject({
  id: z
    .string({ error: '工具 id 必须是字符串' })
    .regex(ID_RE, '工具 id 只能包含小写字母、数字和连字符')
    .min(2, '工具 id 至少 2 个字符')
    .max(40, '工具 id 最多 40 个字符'),
  title: z
    .string({ error: '标题必须是字符串' })
    .min(1, '标题不能为空')
    .max(60, '标题最多 60 个字符'),
  description: z.string({ error: '简介必须是字符串' }).max(200, '简介最多 200 个字符').default(''),
  // 不校验 icon：允许 /assets/x.svg 这类相对路径与 data URI
  icon: z.string({ error: '图标地址必须是字符串' }).default(''),
  internalUrl: httpUrl('内网地址'),
  // 允许空串：公网模式下未配置 publicUrl 的卡片会灰显，这是既有语义
  publicUrl: z
    .string({ error: '公网地址必须是字符串' })
    .default('')
    .refine(
      (value) => value === '' || httpUrl('公网地址').safeParse(value).success,
      '公网地址必须是 http 或 https 地址，或留空',
    ),
  accent: z
    .string({ error: '强调色必须是字符串' })
    .regex(HEX_COLOR_RE, '强调色必须是 #RRGGBB 格式')
    .optional(),
  tags: z.array(z.string({ error: '标签 id 必须是字符串' })).default([]),
  enabled: z.boolean({ error: '启用状态必须是 true 或 false' }).default(true),
})

export const configSchema = z
  .looseObject({
    version: z.number({ error: 'version 必须是数字' }).int().min(1).default(CONFIG_VERSION),
    dashboard: z.looseObject({
      title: z
        .string({ error: '门户标题必须是字符串' })
        .min(1, '门户标题不能为空')
        .max(60, '门户标题最多 60 个字符'),
      description: z
        .string({ error: '门户描述必须是字符串' })
        .max(200, '门户描述最多 200 个字符')
        .default(''),
      /** 是否在首页右上角显示控制台入口按钮。默认隐藏，仅 URL 直达。 */
      adminEntry: z.boolean({ error: 'adminEntry 必须是 true 或 false' }).default(false),
    }),
    search: z.looseObject({
      defaultEngine: z.string({ error: '默认搜索引擎必须是字符串' }),
      engines: z.array(searchEngineSchema).min(1, '至少需要配置一个搜索引擎'),
    }),
    networkTest: z.looseObject({
      ip: z.string({ error: '探测地址必须是字符串' }).min(1, '内网探测地址不能为空'),
      port: z.coerce
        .number({ error: '端口必须是数字' })
        .int('端口必须是整数')
        .min(1, '端口需在 1-65535 之间')
        .max(65535, '端口需在 1-65535 之间')
        .optional(),
      protocol: z
        .enum(['http', 'https'], { error: '协议只能是 http 或 https' })
        .default('http'),
      timeoutMs: z.coerce
        .number({ error: '超时时间必须是数字' })
        .int('超时时间必须是整数')
        .min(500, '超时时间不能小于 500ms')
        .max(30000, '超时时间不能大于 30000ms')
        .default(3000),
    }),
    tags: z.array(tagSchema).default([]),
    tools: z.array(toolSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const reportDuplicates = (
      items: ReadonlyArray<{ id: string }>,
      basePath: (string | number)[],
      what: string,
    ) => {
      const firstSeenAt = new Map<string, number>()
      items.forEach((item, index) => {
        const first = firstSeenAt.get(item.id)
        if (first === undefined) {
          firstSeenAt.set(item.id, index)
          return
        }
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, index, 'id'],
          message: `${what} id ${JSON.stringify(item.id)} 与第 ${first + 1} 项重复`,
        })
      })
    }

    reportDuplicates(config.tags, ['tags'], '标签')
    reportDuplicates(config.tools, ['tools'], '工具')
    reportDuplicates(config.search.engines, ['search', 'engines'], '搜索引擎')

    const defaultEngine = config.search.engines.find(
      (engine) => engine.id === config.search.defaultEngine,
    )
    if (!config.search.engines.some((engine) => engine.enabled)) {
      ctx.addIssue({
        code: 'custom',
        path: ['search', 'engines'],
        message: '至少需要启用一个搜索引擎',
      })
    }
    if (!defaultEngine) {
      ctx.addIssue({
        code: 'custom',
        path: ['search', 'defaultEngine'],
        message: '默认搜索引擎不存在',
      })
    } else if (!defaultEngine.enabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['search', 'defaultEngine'],
        message: '默认搜索引擎必须处于启用状态',
      })
    }

    const registeredTags = new Set(config.tags.map((tag) => tag.id))
    config.tools.forEach((tool, toolIndex) => {
      const used = new Set<string>()
      tool.tags.forEach((tagId, tagIndex) => {
        if (!registeredTags.has(tagId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tools', toolIndex, 'tags', tagIndex],
            message: `标签 ${JSON.stringify(tagId)} 未在 tags 中注册`,
          })
        } else if (used.has(tagId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tools', toolIndex, 'tags', tagIndex],
            message: `标签 ${JSON.stringify(tagId)} 重复引用`,
          })
        }
        used.add(tagId)
      })
    })
  })

export type TagConfig = z.infer<typeof tagSchema>
export type ToolConfig = z.infer<typeof toolSchema>
export type SearchEngineConfig = z.infer<typeof searchEngineSchema>
export type AppConfig = z.infer<typeof configSchema>
