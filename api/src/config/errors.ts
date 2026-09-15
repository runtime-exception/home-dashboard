export interface FieldError {
  field: string
  message: string
}

/**
 * 接口错误的标准形状，与设计文档 §5 的契约一致：
 *   { error: { code, message, details? } }
 */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: FieldError[]
  }
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOO_MANY_ATTEMPTS'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'INTERNAL'

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOO_MANY_ATTEMPTS: 429,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  INTERNAL: 500,
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: FieldError[] | undefined

  constructor(code: ErrorCode, message: string, details?: FieldError[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { error: { code: this.code, message: this.message } }
    if (this.details && this.details.length > 0) body.error.details = this.details
    return body
  }
}

/**
 * 把 ['tools', 2, 'internalUrl'] 渲染成 "tools[2].internalUrl"。
 * 这个格式是前后端共用的契约，前端直接拿它做输入框下方的红字提示。
 */
export function formatFieldPath(path: readonly PropertyKey[]): string {
  let out = ''
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`
    } else if (typeof segment === 'symbol') {
      const name = segment.toString()
      out = out ? `${out}.${name}` : name
    } else {
      out = out ? `${out}.${segment}` : segment
    }
  }
  return out
}

interface IssueLike {
  path: readonly PropertyKey[]
  message: string
}

/** 同一字段可能被多条规则命中，按「字段 + 文案」去重后返回。 */
export function toFieldErrors(error: { issues: readonly IssueLike[] }): FieldError[] {
  const seen = new Set<string>()
  const out: FieldError[] = []
  for (const issue of error.issues) {
    const field = formatFieldPath(issue.path)
    const key = `${field}\u0000${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ field, message: issue.message })
  }
  return out
}
