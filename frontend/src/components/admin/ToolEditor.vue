<script setup lang="ts">
import { LoaderCircle, Save, X } from '@lucide/vue'
import { computed, reactive } from 'vue'
import type { FieldError } from '../../services/admin'
import type { TagConfig, ToolConfig } from '../../types/tool'

const props = defineProps<{
  initial: ToolConfig
  /** 该工具在 tools 数组里的下标，用来把后端字段路径对齐到输入框。 */
  index: number
  isNew: boolean
  availableTags: TagConfig[]
  saving: boolean
  errors: FieldError[]
}>()

const emit = defineEmits<{
  submit: [tool: ToolConfig]
  cancel: []
}>()

/** 表单里 tags 始终是数组，避免每次访问都要 ?? []。 */
type ToolDraft = Omit<ToolConfig, 'tags'> & { tags: string[] }

const draft = reactive<ToolDraft>({
  ...props.initial,
  tags: [...(props.initial.tags ?? [])],
})

const FIELDS = [
  'id',
  'title',
  'description',
  'icon',
  'internalUrl',
  'publicUrl',
  'accent',
  'tags',
  'enabled',
] as const

/** 后端把错误路径写成 tools[3].internalUrl；新建时是追加到末尾的下标。 */
const prefix = computed(() => (props.isNew ? null : `tools[${props.index}]`))

function errorsFor(field: string): string[] {
  const scope = prefix.value
  if (!scope) {
    // 新建工具没有稳定下标，退回「凡是 tools[...] 开头的错误都归到本表单」
    return [...new Set(props.errors.filter((e) => e.field.startsWith('tools[')).map((e) => e.message))]
  }
  const path = `${scope}.${field}`
  return props.errors
    .filter((e) => e.field === path || e.field.startsWith(`${path}[`))
    .map((e) => e.message)
}

const unplacedErrors = computed(() => {
  const placed = new Set(FIELDS.flatMap((field) => errorsFor(field)))
  return props.errors.filter((e) => !placed.has(e.message)).map((e) => e.message)
})

function toggleTag(id: string) {
  const index = draft.tags.indexOf(id)
  if (index === -1) draft.tags.push(id)
  else draft.tags.splice(index, 1)
}

function submit() {
  emit('submit', { ...draft, tags: [...draft.tags] })
}
</script>

<template>
  <form class="editor" @submit.prevent="submit">
    <div class="editor__grid">
      <label class="field">
        <span class="field__label">id</span>
        <input
          v-model="draft.id"
          type="text"
          :readonly="!isNew"
          :class="{ 'is-locked': !isNew }"
          placeholder="小写字母、数字、连字符"
        />
        <small class="field__hint">id 是稳定标识，创建后不可修改。</small>
        <small v-for="m in errorsFor('id')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field">
        <span class="field__label">标题</span>
        <input v-model="draft.title" type="text" maxlength="60" />
        <small v-for="m in errorsFor('title')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field field--wide">
        <span class="field__label">简介</span>
        <input v-model="draft.description" type="text" maxlength="200" />
        <small v-for="m in errorsFor('description')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field field--wide">
        <span class="field__label">图标地址</span>
        <input v-model="draft.icon" type="text" placeholder="https://… 或 /assets/x.svg" />
        <small v-for="m in errorsFor('icon')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field field--wide">
        <span class="field__label">内网地址</span>
        <input v-model="draft.internalUrl" type="text" placeholder="http://192.168.1.10:8080" />
        <small v-for="m in errorsFor('internalUrl')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field field--wide">
        <span class="field__label">公网地址</span>
        <input v-model="draft.publicUrl" type="text" placeholder="留空则该工具在公网模式下灰显" />
        <small v-for="m in errorsFor('publicUrl')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="field">
        <span class="field__label">强调色</span>
        <input v-model="draft.accent" type="text" placeholder="#RRGGBB" />
        <small v-for="m in errorsFor('accent')" :key="m" class="field__error">{{ m }}</small>
      </label>

      <label class="switch-row switch-row--compact">
        <span><strong>启用</strong></span>
        <span class="switch">
          <input v-model="draft.enabled" type="checkbox" />
          <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
        </span>
      </label>
    </div>

    <fieldset class="tag-picker">
      <legend>标签</legend>
      <p v-if="!availableTags.length" class="tag-picker__empty">
        还没有标签，先到「标签」页签创建。
      </p>
      <label v-for="tag in availableTags" :key="tag.id" class="tag-picker__item">
        <input type="checkbox" :checked="draft.tags.includes(tag.id)" @change="toggleTag(tag.id)" />
        <span>{{ tag.label }}</span>
      </label>
      <small v-for="m in errorsFor('tags')" :key="m" class="field__error">{{ m }}</small>
    </fieldset>

    <ul v-if="unplacedErrors.length" class="field-errors">
      <li v-for="message in unplacedErrors" :key="message">{{ message }}</li>
    </ul>

    <div class="actions">
      <button class="button button--primary" type="submit" :disabled="saving">
        <LoaderCircle v-if="saving" class="spinning" :size="16" aria-hidden="true" />
        <Save v-else :size="16" aria-hidden="true" />
        {{ isNew ? '创建工具' : '保存工具' }}
      </button>
      <button class="button" type="button" :disabled="saving" @click="emit('cancel')">
        <X :size="16" aria-hidden="true" />
        取消
      </button>
    </div>
  </form>
</template>
