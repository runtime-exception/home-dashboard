export type ToolStatus = 'checking' | 'online' | 'offline' | 'disabled'

export interface DashboardMeta {
  title: string
  description: string
}

export interface NetworkTestConfig {
  ip: string
  port?: number
  protocol?: 'http' | 'https'
  timeoutMs?: number
}

export interface ToolConfig {
  id: string
  title: string
  description: string
  icon: string
  internalUrl: string
  publicUrl?: string
  accent: string
  enabled?: boolean
}

export interface DashboardConfig {
  dashboard: DashboardMeta
  networkTest: NetworkTestConfig
  tools: ToolConfig[]
}

export interface Tool extends ToolConfig {
  status: ToolStatus
}
