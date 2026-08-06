<script setup lang="ts">
import { ArrowUpRight, ImageOff } from '@lucide/vue'
import { computed, ref } from 'vue'
import type { Tool } from '../types/tool'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  tool: Tool
  publicMode: boolean
}>()

const emit = defineEmits<{
  unavailable: [message: string]
}>()

const imageFailed = ref(false)
const disabled = computed(() => props.tool.enabled === false)
const destination = computed(() => {
  if (disabled.value) return ''
  return props.publicMode ? props.tool.publicUrl?.trim() ?? '' : props.tool.internalUrl
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
    :style="{ '--accent': tool.accent }"
  >
    <div class="tool-card__topline">
      <div class="tool-card__icon">
        <img
          v-if="tool.icon && !imageFailed"
          :src="tool.icon"
          :alt="`${tool.title} 图标`"
          @error="imageFailed = true"
        />
        <ImageOff v-else :size="26" :stroke-width="1.7" aria-hidden="true" />
      </div>
      <StatusBadge :status="tool.status" />
    </div>

    <div class="tool-card__content">
      <span class="tool-card__category">
        {{ disabled ? 'DISABLED' : publicMode ? 'PUBLIC NETWORK' : 'LOCAL NETWORK' }}
      </span>
      <h2>{{ tool.title }}</h2>
      <p>{{ tool.description }}</p>
    </div>

    <a
      v-if="destination"
      class="tool-card__action"
      :href="destination"
      :aria-label="`打开 ${tool.title}`"
    >
      <span>打开工具</span>
      <ArrowUpRight :size="18" aria-hidden="true" />
    </a>
    <div v-else class="tool-card__action tool-card__action--disabled">
      <span>{{ disabled ? '未启用' : '未配置公网地址' }}</span>
    </div>

    <button
      v-if="unavailable"
      class="tool-card__unavailable-overlay"
      type="button"
      :aria-label="unavailableMessage"
      @click="emit('unavailable', unavailableMessage)"
    ></button>
  </article>
</template>
