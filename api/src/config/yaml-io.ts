import { readFile } from 'node:fs/promises'
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type Node as YamlNode,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml'
import type { FieldError } from './errors.ts'

/** 根级键的规范顺序。新增的键若不在此列，保持其原有相对位置。 */
const ROOT_KEY_ORDER = ['version', 'dashboard', 'search', 'networkTest', 'tags', 'tools']

export class YamlSyntaxError extends Error {
  readonly details: FieldError[]

  constructor(details: FieldError[]) {
    super('配置文件不是合法的 YAML')
    this.name = 'YamlSyntaxError'
    this.details = details
  }
}

export interface LoadedConfig {
  /** 保留了注释、空行与 key 顺序的文档树，写回时必须基于它。 */
  doc: Document
  /** 普通 JS 对象，供校验使用。 */
  plain: unknown
}

export async function loadConfigDocument(file: string): Promise<LoadedConfig> {
  const source = await readFile(file, 'utf8')
  const doc = parseDocument(source, { keepSourceTokens: true, prettyErrors: true })

  if (doc.errors.length > 0) {
    // YAML 语法错误：以行列号回报，不要试图继续解析
    const details: FieldError[] = doc.errors.map((error) => {
      const pos = error.linePos?.[0]
      return {
        field: pos ? `(yaml:${pos.line}:${pos.col})` : '(yaml)',
        message: error.message,
      }
    })
    throw new YamlSyntaxError(details)
  }

  return { doc, plain: doc.toJS({ maxAliasCount: 100 }) }
}

function readId(node: YamlNode | unknown): string | undefined {
  if (!isMap(node)) return undefined
  const id = (node as YAMLMap).get('id')
  return typeof id === 'string' ? id : undefined
}

/**
 * 按 id 对齐地同步一个数组节点，尽量保留每个条目上已有的注释、空行与 key 顺序。
 *
 * 之所以不重建整个文档（`new Document(config)`），是因为那样会把用户手写的
 * 所有注释一次性丢光——只改一个 URL 却毁掉整份文件的注释，不可接受。
 *
 * 已知边界：控制台删除某个工具时，该工具携带的注释随之消失，这一点无法避免。
 */
function syncSequenceById(
  doc: Document,
  path: (string | number)[],
  items: ReadonlyArray<Record<string, unknown> & { id: string }>,
): void {
  const seq = doc.getIn(path, true)

  if (!isSeq(seq)) {
    // 原本不是数组（或不存在）：整段重建
    doc.setIn(path, items)
    return
  }

  const sequence = seq as YAMLSeq

  const keep = new Set(items.map((item) => item.id))
  for (let index = sequence.items.length - 1; index >= 0; index -= 1) {
    const id = readId(sequence.items[index])
    // id 缺失或不在新集合中：删除。倒序遍历避免索引位移
    if (id === undefined || !keep.has(id)) sequence.items.splice(index, 1)
  }

  items.forEach((item, targetIndex) => {
    const existing = sequence.items.find((node) => readId(node) === item.id)

    if (!existing) {
      const created = doc.createNode(item)
      sequence.items.splice(Math.min(targetIndex, sequence.items.length), 0, created)
      return
    }

    // 只覆盖提交上来的字段：用户在 conf.yml 里手写的未知字段原样保留
    if (isMap(existing)) {
      for (const [key, value] of Object.entries(item)) {
        ;(existing as YAMLMap).set(key, value)
      }
    }
  })

  const order = new Map(items.map((item, index) => [item.id, index]))
  sequence.items.sort((a, b) => {
    const ai = order.get(readId(a) ?? '') ?? Number.MAX_SAFE_INTEGER
    const bi = order.get(readId(b) ?? '') ?? Number.MAX_SAFE_INTEGER
    return ai - bi
  })
}

/**
 * 把根级键排成规范顺序。
 *
 * setIn 对不存在的键是「追加到末尾」，于是新加的 version 与 tags 会跑到文件最后，
 * 阅读时要翻到底部才能看到，很别扭。这里统一收拢一次。
 * Array.prototype.sort 是稳定排序，未知键因此保持各自原有的相对次序。
 */
function reorderRootKeys(doc: Document): void {
  const contents = doc.contents
  if (!isMap(contents)) return

  const rank = new Map(ROOT_KEY_ORDER.map((key, index) => [key, index]))
  const rankOf = (pair: { key: unknown }): number => {
    const key = isScalar(pair.key)
      ? String(pair.key.value)
      : typeof pair.key === 'string'
        ? pair.key
        : ''
    return rank.get(key) ?? Number.MAX_SAFE_INTEGER
  }

  ;(contents as YAMLMap).items.sort((a, b) => rankOf(a) - rankOf(b))
}

/** 把校验通过的新配置合并进原文档，返回同一个 Document（原地修改）。 */
export function mergeConfigIntoDocument(
  doc: Document,
  next: {
    version: number
    dashboard: Record<string, unknown>
    search: {
      defaultEngine: string
      engines: ReadonlyArray<Record<string, unknown> & { id: string }>
    }
    networkTest: Record<string, unknown>
    tags: ReadonlyArray<Record<string, unknown> & { id: string }>
    tools: ReadonlyArray<Record<string, unknown> & { id: string }>
  },
): Document {
  doc.setIn(['version'], next.version)

  for (const [key, value] of Object.entries(next.dashboard)) {
    doc.setIn(['dashboard', key], value)
  }

  doc.setIn(['search', 'defaultEngine'], next.search.defaultEngine)
  syncSequenceById(doc, ['search', 'engines'], next.search.engines)

  for (const [key, value] of Object.entries(next.networkTest)) {
    if (value === undefined) doc.deleteIn(['networkTest', key])
    else doc.setIn(['networkTest', key], value)
  }

  syncSequenceById(doc, ['tags'], next.tags)
  syncSequenceById(doc, ['tools'], next.tools)

  reorderRootKeys(doc)

  return doc
}

/** 统一的序列化出口。lineWidth: 0 关闭折行，避免长 URL 被拆断。 */
export function serializeConfigDocument(doc: Document): string {
  return doc.toString({ lineWidth: 0, minContentWidth: 0 })
}

/**
 * 从原始文档复制一份，供「保留注释地预览导出」使用。
 * 导出走的是文档原文，而不是重新序列化的对象。
 */
export function documentToText(doc: Document): string {
  return serializeConfigDocument(doc)
}
