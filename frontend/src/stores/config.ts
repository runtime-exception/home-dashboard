import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AdminApiError, type AdminEnvelope, type BackupInfo, adminApi } from '../services/admin'
import type { AdminConfig, TagConfig, ToolConfig } from '../types/tool'
import { useSessionStore } from './session'

/** 新建工具的初始值。id 留空由用户填，其余给一个能通过校验的最小形态。 */
export function emptyTool(): ToolConfig {
  return {
    id: '',
    title: '',
    description: '',
    icon: '',
    internalUrl: '',
    publicUrl: '',
    accent: '#0071e3',
    tags: [],
    enabled: true,
  }
}

export function emptyTag(): TagConfig {
  return { id: '', label: '' }
}

/**
 * 控制台的配置状态。所有写操作都走 api 的「整体保存」语义：
 * 后端保存前会备份、校验、按 id 合并进原 YAML（保留注释），
 * 因此这里只需要用返回的信封整体替换本地状态。
 */
export const useConfigStore = defineStore('config', () => {
  const config = ref<AdminConfig | null>(null)
  const drift = ref(false)
  const loadedAt = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const fieldErrors = ref<{ field: string; message: string }[]>([])

  const ready = computed(() => config.value !== null)
  const tags = computed<TagConfig[]>(() => config.value?.tags ?? [])
  const tools = computed<ToolConfig[]>(() => config.value?.tools ?? [])

  /** 标签 → 引用它的工具数量，删除标签前用来判断是否需要级联确认。 */
  const tagUsage = computed<Record<string, number>>(() => {
    const usage: Record<string, number> = {}
    for (const tag of tags.value) usage[tag.id] = 0
    for (const tool of tools.value) {
      for (const id of tool.tags ?? []) {
        if (id in usage) usage[id] += 1
      }
    }
    return usage
  })

  function adopt(envelope: AdminEnvelope): void {
    config.value = envelope.config
    drift.value = envelope.drift
    loadedAt.value = envelope.loadedAt
  }

  function clearFeedback(): void {
    error.value = ''
    fieldErrors.value = []
  }

  /** 登录态失效时把 session store 一起复位，让界面退回登录页。 */
  function handle(reason: unknown, fallback: string): void {
    if (reason instanceof AdminApiError) {
      if (reason.isUnauthenticated) {
        const session = useSessionStore()
        session.authenticated = false
        session.username = ''
      }
      error.value = reason.message
      fieldErrors.value = reason.details
      return
    }
    error.value = reason instanceof Error ? reason.message : fallback
    fieldErrors.value = []
  }

  async function load(): Promise<void> {
    if (loading.value) return
    loading.value = true
    clearFeedback()
    try {
      adopt(await adminApi.config.get())
    } catch (reason) {
      handle(reason, '配置加载失败')
    } finally {
      loading.value = false
    }
  }

  /** 任何写操作都复用这一层：统一 saving 标记与错误归因。 */
  async function write(operation: () => Promise<AdminEnvelope>, fallback: string): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    clearFeedback()
    try {
      adopt(await operation())
      return true
    } catch (reason) {
      handle(reason, fallback)
      return false
    } finally {
      saving.value = false
    }
  }

  const save = (next: AdminConfig) =>
    write(() => adminApi.config.save(next), '保存失败')

  const importYaml = (yaml: string) => write(() => adminApi.config.importYaml(yaml), '导入失败')

  const restore = (name: string) => write(() => adminApi.backups.restore(name), '恢复失败')

  const createTool = (tool: ToolConfig) => write(() => adminApi.tools.create(tool), '新建工具失败')

  const updateTool = (tool: ToolConfig) =>
    write(() => adminApi.tools.update(tool.id, tool), '保存工具失败')

  const removeTool = (id: string) => write(() => adminApi.tools.remove(id), '删除工具失败')

  const reorderTools = (ids: string[]) => write(() => adminApi.tools.reorder(ids), '排序失败')

  const createTag = (tag: TagConfig) => write(() => adminApi.tags.create(tag), '新建标签失败')

  const updateTag = (tag: TagConfig) =>
    write(() => adminApi.tags.update(tag.id, tag), '保存标签失败')

  const removeTag = (id: string, force = false) =>
    write(() => adminApi.tags.remove(id, force), '删除标签失败')

  const listBackups = async (): Promise<BackupInfo[]> => {
    const { backups } = await adminApi.backups.list()
    return backups
  }

  const createBackup = () => adminApi.backups.create()

  const exportYaml = () => adminApi.config.exportYaml()

  return {
    config,
    drift,
    loadedAt,
    loading,
    saving,
    error,
    fieldErrors,
    ready,
    tags,
    tools,
    tagUsage,
    load,
    save,
    importYaml,
    restore,
    createTool,
    updateTool,
    removeTool,
    reorderTools,
    createTag,
    updateTag,
    removeTag,
    listBackups,
    createBackup,
    exportYaml,
    clearFeedback,
  }
})
