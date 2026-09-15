export type ToolStatus = 'checking' | 'online' | 'offline' | 'disabled'

/** api 侧探测结果。config 里 enabled=false 的工具固定为 disabled。 */
export type ProbeStatus = 'online' | 'offline' | 'disabled'

export interface DashboardMeta {
  title: string
  description: string
  adminEntry?: boolean
}

export interface NetworkTestConfig {
  ip: string
  port?: number
  protocol?: 'http' | 'https'
  timeoutMs?: number
}

export interface SearchEngineConfig {
  id: string
  name: string
  urlTemplate: string
  enabled: boolean
}

export interface SearchConfig {
  defaultEngine: string
  engines: SearchEngineConfig[]
}

/** 标签注册表条目。order 由 api 按数组下标注入，磁盘上不存这个字段。 */
export interface Tag {
  id: string
  label: string
  color: string | null
  order: number
}

/** 控制台读写的标签形态：order 由数组位置决定，所以不落盘。 */
export interface TagConfig {
  id: string
  label: string
  color?: string
}

export interface ToolConfig {
  id: string
  title: string
  description: string
  icon: string
  internalUrl: string
  publicUrl?: string
  accent?: string | null
  tags?: string[]
  enabled?: boolean
}

export interface DashboardConfig {
  dashboard: DashboardMeta
  search: SearchConfig
  networkTest: NetworkTestConfig
  tags: Tag[]
  tools: ToolConfig[]
}

/** 控制台的完整配置，比公开配置多一个 version 字段。 */
export interface AdminConfig {
  version: number
  dashboard: DashboardMeta & { adminEntry: boolean }
  search: SearchConfig
  networkTest: NetworkTestConfig
  tags: TagConfig[]
  tools: ToolConfig[]
}

export interface Tool extends ToolConfig {
  tags: string[]
  status: ToolStatus
}

export interface HealthToolEntry {
  id: string
  status: ProbeStatus
}

export interface HealthPayload {
  checkedAt: string
  tools: HealthToolEntry[]
}
