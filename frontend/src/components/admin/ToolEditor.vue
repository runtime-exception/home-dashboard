<script setup lang="ts">
import { LoaderCircle, Save, WandSparkles, X } from '@lucide/vue'
import { computed, reactive, ref, useId } from 'vue'
import { AdminApiError, adminApi, type FieldError } from '../../services/admin'
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

// ── 强调色 ───────────────────────────────────────────────────
const accentId = useId()
const iconId = useId()

/** schema 只认 #RRGGBB，其它一律当作没设置。 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/
/** 与 styles.css 的 --accent（浅色主题）保持一致。 */
const DEFAULT_ACCENT = '#0071e3'

/** 预设色板：取自门户里已经在用的强调色，新工具能直接和既有卡片保持同一套视觉。 */
const ACCENT_PRESETS = [
  '#f06b78',
  '#f0b44e',
  '#5f86ff',
  '#19c9aa',
  '#a978ff',
  '#ec4899',
  '#ef4444',
  '#22c55e',
  '#d97706',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#6366f1',
]

/**
 * accent 是可选字段。文本输入框清空时要落成 undefined 而不是空串——
 * 空串不匹配 #RRGGBB，会被后端 schema 打回。
 */
const accentText = computed({
  get: () => draft.accent ?? '',
  set: (value: string) => {
    const trimmed = value.trim()
    draft.accent = trimmed === '' ? undefined : trimmed
  },
})

/** 原生取色器只接受 #rrggbb；accent 为空或只敲了一半时先显示默认色。 */
const accentSwatch = computed({
  get: () => (HEX_RE.test(draft.accent ?? '') ? (draft.accent as string) : DEFAULT_ACCENT),
  set: (value: string) => {
    draft.accent = value
  },
})

// ── 图标自动获取 ─────────────────────────────────────────────
const iconProbing = ref(false)
const iconNotice = ref('')

/**
 * 优先用公网地址：解析出来的图标多半是公网绝对地址，配到别的机器上也能显示。
 * 没填公网地址才回落到内网地址。
 */
const iconProbeSource = computed(() => {
  const publicUrl = draft.publicUrl?.trim()
  if (publicUrl) return { url: publicUrl, label: '公网地址' }
  const internalUrl = draft.internalUrl?.trim()
  if (internalUrl) return { url: internalUrl, label: '内网地址' }
  return { url: '', label: '' }
})

async function probeIcon() {
  const source = iconProbeSource.value
  if (!source.url || iconProbing.value) return

  iconProbing.value = true
  iconNotice.value = ''
  try {
    const result = await adminApi.tools.probeIcon(source.url)
    if (result.ok && result.icon) {
      draft.icon = result.icon
      iconNotice.value =
        result.source === 'fallback'
          ? `已从${source.label}取到 /favicon.ico`
          : `已从${source.label}的页面里取到图标`
    } else {
      iconNotice.value = result.message ?? '没能从该地址找到图标'
    }
  } catch (error) {
    iconNotice.value = error instanceof AdminApiError ? error.message : '获取图标失败'
  } finally {
    iconProbing.value = false
  }
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

      <div class="field field--wide">
        <label class="field__label" :for="iconId">图标地址</label>
        <span class="field__row">
          <img v-if="draft.icon" :src="draft.icon" alt="" class="icon-preview" />
          <input
            :id="iconId"
            v-model="draft.icon"
            type="text"
            placeholder="https://… 或 /assets/x.svg"
          />
          <button
            class="button button--compact"
            type="button"
            :disabled="saving || iconProbing || !iconProbeSource.url"
            :title="
              iconProbeSource.url
                ? `从${iconProbeSource.label}抓取页面并推断图标地址`
                : '先填内网地址或公网地址'
            "
            @click="probeIcon"
          >
            <LoaderCircle v-if="iconProbing" class="spinning" :size="15" aria-hidden="true" />
            <WandSparkles v-else :size="15" aria-hidden="true" />
            自动获取
          </button>
        </span>
        <small v-if="iconNotice" class="field__hint">{{ iconNotice }}</small>
        <small v-for="m in errorsFor('icon')" :key="m" class="field__error">{{ m }}</small>
      </div>

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

      <div class="field field--wide accent-field">
        <label class="field__label" :for="accentId">强调色</label>
        <span class="field__row field__row--tight">
          <input
            :id="accentId"
            v-model="accentText"
            type="text"
            class="accent-hex"
            placeholder="#RRGGBB"
            maxlength="7"
            spellcheck="false"
          />
          <input v-model="accentSwatch" type="color" class="accent-native" aria-label="选择强调色" />
        </span>
        <span class="accent-presets">
          <button
            v-for="color in ACCENT_PRESETS"
            :key="color"
            class="accent-presets__item"
            :class="{ 'is-active': (draft.accent ?? '').toLowerCase() === color }"
            :style="{ background: color }"
            type="button"
            :title="color"
            :aria-label="`使用强调色 ${color}`"
            @click="draft.accent = color"
          />
        </span>
        <small class="field__hint">留空表示不设强调色，卡片会使用默认色。</small>
        <small v-for="m in errorsFor('accent')" :key="m" class="field__error">{{ m }}</small>
      </div>

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
