<script setup lang="ts">
import { ArrowUpRight, ImageOff } from '@lucide/vue'
import { computed, ref } from 'vue'
import type { Tool } from '../types/tool'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  tool: Tool
  publicMode: boolean
  tagLabels: string[]
}>()

const emit = defineEmits<{
  unavailable: [message: string]
}>()

const imageFailed = ref(false)
const disabled = computed(() => props.tool.enabled === false)
const destination = computed(() => {
  if (disabled.value) return ''
  return props.publicMode ? (props.tool.publicUrl?.trim() ?? '') : props.tool.internalUrl
})
const missingPublic = computed(() => props.publicMode && !props.tool.publicUrl?.trim())
const unavailable = computed(() => disabled.value || missingPublic.value)
const unavailableMessage = computed(() =>
  disabled.value
    ? `${props.tool.title} 未启用`
    : `${props.tool.title} 暂未配置公网地址`,
)
</script>

<template>
  <article
    class="tool-card"
    :class="{ 'tool-card--unavailable': unavailable }"
    :style="{ '--accent': tool.accent || '#0071e3' }"
  >
    <div class="tool-card__head">
      <div class="tool-card__icon">
        <img
          v-if="tool.icon && !imageFailed"
          :src="tool.icon"
          :alt="`${tool.title} 图标`"
          loading="lazy"
          @error="imageFailed = true"
        />
        <ImageOff v-else :size="24" :stroke-width="1.6" aria-hidden="true" />
      </div>
      <StatusBadge :status="tool.status" />
    </div>

    <h3 class="tool-card__title">{{ tool.title }}</h3>
    <p class="tool-card__desc">{{ tool.description }}</p>

    <ul v-if="tagLabels.length" class="tool-card__tags">
      <li v-for="label in tagLabels" :key="label">{{ label }}</li>
    </ul>

    <a
      v-if="destination"
      class="tool-card__action"
      :href="destination"
      :aria-label="`打开 ${tool.title}`"
    >
      <span>打开</span>
      <ArrowUpRight :size="16" aria-hidden="true" />
    </a>
    <span v-else class="tool-card__action tool-card__action--muted">
      {{ disabled ? '未启用' : '未配置公网地址' }}
    </span>

    <button
      v-if="unavailable"
      class="tool-card__overlay"
      type="button"
      :aria-label="unavailableMessage"
      @click="emit('unavailable', unavailableMessage)"
    ></button>
  </article>
</template>
