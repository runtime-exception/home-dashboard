<script setup lang="ts">
import type { ToolStatus } from '../types/tool'

defineProps<{
  status: ToolStatus
}>()

const labels: Record<ToolStatus, string> = {
  checking: '检测中',
  online: '在线',
  offline: '离线',
  disabled: '未启用',
}
</script>

<template>
  <span class="status-badge" :class="`status-badge--${status}`">
    <span class="status-badge__dot" aria-hidden="true"></span>
    {{ labels[status] }}
  </span>
</template>
