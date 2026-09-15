import type { AdminConfig, TagConfig, ToolConfig } from '../types/tool'

export interface FieldError {
  field: string
  message: string
}

export interface AdminEnvelope {
  config: AdminConfig
  /** 磁盘上的 conf.yml 被外部改过（例如手工编辑），保存前需让用户知情。 */
  drift: boolean
  loadedAt: string
}

export interface BackupInfo {
  name: string
  size: number
  modifiedAt: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: FieldError[] }
}

/** 带上后端错误码与字段级明细，供表单逐字段标红。 */
export class AdminApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: FieldError[]

  constructor(status: number, code: string, message: string, details: FieldError[] = []) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** 登录态失效（与「凭据错误」区分：后者需要停留在登录页提示）。 */
  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED'
  }

  detailsFor(field: string): string[] {
    return this.details.filter((item) => item.field === field).map((item) => item.message)
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    })
  } catch {
    throw new AdminApiError(0, 'NETWORK', '无法连接配置服务，请确认 api 容器在运行')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload = text ? (safeJson(text) as T & ApiErrorBody) : ({} as T & ApiErrorBody)

  if (!response.ok) {
    const error = (payload as ApiErrorBody).error
    throw new AdminApiError(
      response.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? `请求失败（HTTP ${response.status}）`,
      error?.details ?? [],
    )
  }

  return payload as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export const adminApi = {
  session: {
    current: () =>
      request<{ authenticated: boolean; username: string }>('/api/admin/session'),

    login: (username: string, token: string) =>
      request<{ authenticated: boolean; username: string }>('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ username, token }),
      }),

    logout: () => request<{ authenticated: boolean }>('/api/admin/session', { method: 'DELETE' }),
  },

  config: {
    get: () => request<AdminEnvelope>('/api/admin/config'),

    save: (config: AdminConfig) =>
      request<AdminEnvelope>('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),

    validate: (config: AdminConfig) =>
      request<{ ok: boolean; errors: FieldError[] }>('/api/admin/config/validate', {
        method: 'POST',
        body: JSON.stringify(config),
      }),

    exportYaml: async (): Promise<string> => {
      const response = await fetch('/api/admin/config/export', { credentials: 'same-origin' })
      if (!response.ok) {
        throw new AdminApiError(response.status, 'INTERNAL', '导出失败')
      }
      return response.text()
    },

    importYaml: (yaml: string) =>
      request<AdminEnvelope>('/api/admin/config/import', {
        method: 'POST',
        body: JSON.stringify({ yaml }),
      }),
  },

  tools: {
    create: (tool: ToolConfig) =>
      request<AdminEnvelope>('/api/admin/tools', {
        method: 'POST',
        body: JSON.stringify(tool),
      }),

    update: (id: string, tool: ToolConfig) =>
      request<AdminEnvelope>(`/api/admin/tools/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(tool),
      }),

    remove: (id: string) =>
      request<AdminEnvelope>(`/api/admin/tools/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    reorder: (ids: string[]) =>
      request<AdminEnvelope>('/api/admin/tools/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ ids }),
      }),
  },

  tags: {
    create: (tag: TagConfig) =>
      request<AdminEnvelope>('/api/admin/tags', {
        method: 'POST',
        body: JSON.stringify(tag),
      }),

    update: (id: string, tag: TagConfig) =>
      request<AdminEnvelope>(`/api/admin/tags/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(tag),
      }),

    /** force=true 时会把引用该标签的工具一并解除引用。 */
    remove: (id: string, force = false) =>
      request<AdminEnvelope>(
        `/api/admin/tags/${encodeURIComponent(id)}${force ? '?force=true' : ''}`,
        { method: 'DELETE' },
      ),

    /** 被引用的标签会返回 409，明细里带有引用它的工具 id。 */
    referencingTools: async (id: string): Promise<string[]> => {
      try {
        await adminApi.tags.remove(id)
        return []
      } catch (reason) {
        if (reason instanceof AdminApiError && reason.status === 409) {
          // 后端把引用者编码成 tools.<toolId>.tags，这里还原回工具 id
          return reason.details
            .map((item) => /^tools\.(.+)\.tags$/.exec(item.field)?.[1] ?? '')
            .filter(Boolean)
        }
        throw reason
      }
    },
  },

  backups: {
    list: () => request<{ backups: BackupInfo[] }>('/api/admin/backups'),

    create: () =>
      request<{ name: string; size: number; modifiedAt: string }>('/api/admin/backups', {
        method: 'POST',
      }),

    restore: (name: string) =>
      request<AdminEnvelope>(`/api/admin/backups/${encodeURIComponent(name)}/restore`, {
        method: 'POST',
      }),
  },
}
