<script setup lang="ts">
import { Download, LoaderCircle, RefreshCw, Upload } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useConfigStore } from '../../../stores/config'

const config = useConfigStore()

const text = ref('')
const loading = ref(false)
const note = ref('')

/** 导出的是磁盘原文，因此注释都在——适合直接编辑后再导入。 */
async function load() {
  loading.value = true
  note.value = ''
  try {
    text.value = await config.exportYaml()
  } catch (reason) {
    note.value = reason instanceof Error ? reason.message : '导出失败'
  } finally {
    loading.value = false
  }
}

async function apply() {
  if (!window.confirm('用下面的内容覆盖 conf.yml？当前配置会先自动备份。')) return
  if (await config.importYaml(text.value)) note.value = '已写入 conf.yml'
}

function download() {
  const blob = new Blob([text.value], { type: 'application/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'conf.yml'
  anchor.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<template>
  <div class="stack">
    <div class="panel__head panel__head--row">
      <div>
        <h2>conf.yml</h2>
        <p>直接编辑 YAML。保存时会校验并保留注释，语法错误会原样退回。</p>
      </div>
      <div class="actions actions--tight">
        <button class="button" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="15" aria-hidden="true" />
          重新载入
        </button>
        <button class="button" type="button" :disabled="!text" @click="download">
          <Download :size="15" aria-hidden="true" />
          下载
        </button>
      </div>
    </div>

    <label class="field">
      <span class="sr-only">conf.yml 内容</span>
      <textarea v-model="text" class="code-area" spellcheck="false" rows="24"></textarea>
    </label>

    <div class="actions">
      <button
        class="button button--primary"
        type="button"
        :disabled="config.saving || !text.trim()"
        @click="apply"
      >
        <LoaderCircle v-if="config.saving" class="spinning" :size="16" aria-hidden="true" />
        <Upload v-else :size="16" aria-hidden="true" />
        写入 conf.yml
      </button>
      <span v-if="note" class="actions__hint">{{ note }}</span>
    </div>
  </div>
</template>
