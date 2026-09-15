<script setup lang="ts">
import { Check, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { ref } from 'vue'
import { emptyTag, useConfigStore } from '../../../stores/config'
import type { TagConfig } from '../../../types/tool'

const config = useConfigStore()

const newTag = ref<TagConfig>(emptyTag())
const editingId = ref<string | null>(null)
const draft = ref<TagConfig>(emptyTag())

async function create() {
  const created = await config.createTag({
    id: newTag.value.id.trim(),
    label: newTag.value.label.trim(),
  })
  if (created) newTag.value = emptyTag()
}

function startEdit(tag: TagConfig) {
  editingId.value = tag.id
  draft.value = { ...tag }
  config.clearFeedback()
}

async function save(tag: TagConfig) {
  const saved = await config.updateTag({ ...draft.value, id: tag.id })
  if (saved) editingId.value = null
}

/**
 * 被引用的标签后端会先返回 409；这里提前问一句，
 * 用户确认后带 force=true 让后端一并解除工具上的引用。
 */
async function remove(tag: TagConfig) {
  const usage = config.tagUsage[tag.id] ?? 0
  const message =
    usage > 0
      ? `标签「${tag.label}」正被 ${usage} 个工具引用，删除后会一并从这些工具上移除。继续？`
      : `删除标签「${tag.label}」？`
  if (!window.confirm(message)) return
  await config.removeTag(tag.id, usage > 0)
}
</script>

<template>
  <div class="stack">
    <div class="panel__head">
      <h2>标签</h2>
      <p>标签用来给工具分组，首页会据此生成筛选条。改名只动名称，id 建议保持稳定。</p>
    </div>

    <section class="panel">
      <div class="panel__body">
        <div class="inline-form">
          <label class="field">
            <span class="field__label">id</span>
            <input v-model="newTag.id" type="text" placeholder="例如 docs" />
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="newTag.label" type="text" maxlength="12" placeholder="例如 文档处理" />
          </label>
          <button
            class="button button--primary"
            type="button"
            :disabled="config.saving || !newTag.id.trim() || !newTag.label.trim()"
            @click="create"
          >
            <Plus :size="16" aria-hidden="true" />
            新建标签
          </button>
        </div>
      </div>
    </section>

    <ul class="rows">
      <li v-for="tag in config.tags" :key="tag.id" class="rows__item">
        <div v-if="editingId !== tag.id" class="rows__main">
          <div class="rows__text">
            <strong>{{ tag.label }}</strong>
            <small>
              <code>{{ tag.id }}</code> ·
              {{ config.tagUsage[tag.id] ?? 0 }} 个工具
            </small>
          </div>
          <span class="rows__actions">
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="重命名"
              @click="startEdit(tag)"
            >
              <Pencil :size="15" aria-hidden="true" />
            </button>
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="删除"
              :disabled="config.saving"
              @click="remove(tag)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </span>
        </div>

        <div v-else class="inline-form inline-form--row">
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="draft.label" type="text" maxlength="12" />
          </label>
          <button
            class="button button--primary"
            type="button"
            :disabled="config.saving"
            @click="save(tag)"
          >
            <Check :size="16" aria-hidden="true" />
            保存
          </button>
          <button class="button" type="button" @click="editingId = null">
            <X :size="16" aria-hidden="true" />
            取消
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!config.tags.length" class="state-panel">还没有标签。</p>
  </div>
</template>
