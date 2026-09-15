<script setup lang="ts">
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from '@lucide/vue'
import { ref } from 'vue'
import { emptyTool, useConfigStore } from '../../../stores/config'
import type { ToolConfig } from '../../../types/tool'
import ToolEditor from '../ToolEditor.vue'

const config = useConfigStore()

const editingId = ref<string | null>(null)
const creating = ref(false)
const draft = ref<ToolConfig>(emptyTool())

function labelOf(tagId: string): string {
  return config.tags.find((tag) => tag.id === tagId)?.label ?? tagId
}

function startCreate() {
  editingId.value = null
  creating.value = true
  draft.value = emptyTool()
  config.clearFeedback()
}

function startEdit(tool: ToolConfig) {
  creating.value = false
  editingId.value = tool.id
  draft.value = { ...tool, tags: [...(tool.tags ?? [])] }
  config.clearFeedback()
}

function cancel() {
  editingId.value = null
  creating.value = false
  config.clearFeedback()
}

async function submitCreate(tool: ToolConfig) {
  if (await config.createTool(tool)) creating.value = false
}

async function submitEdit(tool: ToolConfig) {
  if (await config.updateTool(tool)) editingId.value = null
}

async function remove(tool: ToolConfig) {
  if (!window.confirm(`删除工具「${tool.title}」？保存后可在备份里找回。`)) return
  await config.removeTool(tool.id)
}

/** 上移/下移一格，整份顺序提交给后端。 */
async function move(index: number, delta: number) {
  const target = index + delta
  const ids = config.tools.map((tool) => tool.id)
  if (target < 0 || target >= ids.length) return
  const [moved] = ids.splice(index, 1)
  if (moved === undefined) return
  ids.splice(target, 0, moved)
  await config.reorderTools(ids)
}
</script>

<template>
  <div class="stack">
    <div class="panel__head panel__head--row">
      <div>
        <h2>工具</h2>
        <p>顺序即首页展示顺序，拖动按钮可以调整。</p>
      </div>
      <button class="button button--primary" type="button" :disabled="creating" @click="startCreate">
        <Plus :size="16" aria-hidden="true" />
        新增工具
      </button>
    </div>

    <ToolEditor
      v-if="creating"
      :initial="draft"
      :index="config.tools.length"
      :is-new="true"
      :available-tags="config.tags"
      :saving="config.saving"
      :errors="config.fieldErrors"
      @submit="submitCreate"
      @cancel="cancel"
    />

    <ul class="rows">
      <li v-for="(tool, index) in config.tools" :key="tool.id" class="rows__item">
        <div class="rows__main">
          <span class="rows__order">
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="上移"
              :disabled="index === 0 || config.saving"
              @click="move(index, -1)"
            >
              <ChevronUp :size="15" aria-hidden="true" />
            </button>
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="下移"
              :disabled="index === config.tools.length - 1 || config.saving"
              @click="move(index, 1)"
            >
              <ChevronDown :size="15" aria-hidden="true" />
            </button>
          </span>

          <span class="rows__swatch" :style="{ '--accent': tool.accent || '#0071e3' }"></span>

          <div class="rows__text">
            <strong>{{ tool.title || '(未命名)' }}</strong>
            <small>
              <code>{{ tool.id }}</code>
              <span v-if="tool.tags?.length"> · {{ tool.tags.map(labelOf).join(' / ') }}</span>
            </small>
          </div>

          <span v-if="tool.enabled === false" class="pill pill--muted">未启用</span>

          <span class="rows__actions">
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="编辑"
              @click="startEdit(tool)"
            >
              <Pencil :size="15" aria-hidden="true" />
            </button>
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="删除"
              :disabled="config.saving"
              @click="remove(tool)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </span>
        </div>

        <ToolEditor
          v-if="editingId === tool.id"
          class="rows__editor"
          :initial="draft"
          :index="index"
          :is-new="false"
          :available-tags="config.tags"
          :saving="config.saving"
          :errors="config.fieldErrors"
          @submit="submitEdit"
          @cancel="cancel"
        />
      </li>
    </ul>

    <p v-if="!config.tools.length" class="state-panel">还没有工具，点右上角新增一个。</p>
  </div>
</template>
