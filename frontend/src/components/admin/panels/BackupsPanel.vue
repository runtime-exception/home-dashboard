<script setup lang="ts">
import { DatabaseBackup, LoaderCircle, RotateCcw } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import type { BackupInfo } from '../../../services/admin'
import { useConfigStore } from '../../../stores/config'

const config = useConfigStore()

const backups = ref<BackupInfo[]>([])
const loading = ref(false)
const listError = ref('')

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN')
}

async function refresh() {
  loading.value = true
  listError.value = ''
  try {
    backups.value = await config.listBackups()
  } catch (reason) {
    listError.value = reason instanceof Error ? reason.message : '备份列表读取失败'
  } finally {
    loading.value = false
  }
}

async function snapshot() {
  try {
    await config.createBackup()
    await refresh()
  } catch (reason) {
    listError.value = reason instanceof Error ? reason.message : '创建备份失败'
  }
}

async function restore(name: string) {
  if (!window.confirm(`恢复备份 ${name}？\n\n当前配置会先自动备份，然后被这份备份覆盖。`)) return
  if (await config.restore(name)) await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="stack">
    <div class="panel__head panel__head--row">
      <div>
        <h2>备份</h2>
        <p>每次保存或恢复前都会自动留一份，仅保留最近 20 份。</p>
      </div>
      <button class="button" type="button" :disabled="config.saving" @click="snapshot">
        <DatabaseBackup :size="16" aria-hidden="true" />
        立即备份
      </button>
    </div>

    <p v-if="listError" class="banner banner--error" role="alert">{{ listError }}</p>
    <p v-if="loading" class="state-panel">正在读取备份…</p>

    <ul v-else class="rows">
      <li v-for="item in backups" :key="item.name" class="rows__item">
        <div class="rows__main">
          <div class="rows__text">
            <strong>{{ formatTime(item.modifiedAt) }}</strong>
            <small><code>{{ item.name }}</code> · {{ formatSize(item.size) }}</small>
          </div>
          <button
            class="button"
            type="button"
            :disabled="config.saving"
            @click="restore(item.name)"
          >
            <LoaderCircle v-if="config.saving" class="spinning" :size="15" aria-hidden="true" />
            <RotateCcw v-else :size="15" aria-hidden="true" />
            恢复
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!loading && !backups.length" class="state-panel">还没有备份。</p>
  </div>
</template>
