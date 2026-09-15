<script setup lang="ts">
import { Save } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useConfigStore } from '../../../stores/config'

const config = useConfigStore()

const title = ref('')
const description = ref('')
const adminEntry = ref(false)
const ip = ref('')
const port = ref('')
const protocol = ref<'http' | 'https'>('http')
const timeoutMs = ref('')

/** 每次成功保存后 store 会换成新对象，表单随之回到「已保存」状态。 */
watch(
  () => config.config,
  (value) => {
    if (!value) return
    title.value = value.dashboard.title
    description.value = value.dashboard.description
    adminEntry.value = value.dashboard.adminEntry
    ip.value = value.networkTest.ip
    port.value = value.networkTest.port === undefined ? '' : String(value.networkTest.port)
    protocol.value = value.networkTest.protocol ?? 'http'
    timeoutMs.value =
      value.networkTest.timeoutMs === undefined ? '' : String(value.networkTest.timeoutMs)
  },
  { immediate: true },
)

async function save() {
  const current = config.config
  if (!current) return
  await config.save({
    ...current,
    dashboard: {
      title: title.value.trim(),
      description: description.value.trim(),
      adminEntry: adminEntry.value,
    },
    networkTest: {
      ip: ip.value.trim(),
      ...(port.value.trim() === '' ? {} : { port: Number(port.value.trim()) }),
      protocol: protocol.value,
      ...(timeoutMs.value.trim() === '' ? {} : { timeoutMs: Number(timeoutMs.value.trim()) }),
    },
  })
}
</script>

<template>
  <div v-if="config.config" class="stack">
    <section class="panel">
      <header class="panel__head">
        <h2>门户信息</h2>
        <p>首页顶部显示的标题与简介。</p>
      </header>

      <div class="panel__body">
        <label class="field">
          <span class="field__label">标题</span>
          <input v-model="title" type="text" maxlength="60" />
        </label>

        <label class="field">
          <span class="field__label">简介</span>
          <input v-model="description" type="text" maxlength="200" />
        </label>

        <label class="switch-row">
          <span>
            <strong>显示控制台入口</strong>
            <small>关闭后首页不出现入口按钮，只能用 #/admin 直达。</small>
          </span>
          <span class="switch">
            <input v-model="adminEntry" type="checkbox" />
            <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
          </span>
        </label>
      </div>
    </section>

    <section class="panel">
      <header class="panel__head">
        <h2>内网探测</h2>
        <p>首页用它判断当前处于内网还是公网，进而决定卡片使用哪个地址。</p>
      </header>

      <div class="panel__body panel__body--grid">
        <label class="field">
          <span class="field__label">探测地址</span>
          <input v-model="ip" type="text" />
        </label>

        <label class="field">
          <span class="field__label">端口</span>
          <input v-model="port" type="text" inputmode="numeric" placeholder="留空表示默认端口" />
        </label>

        <label class="field">
          <span class="field__label">协议</span>
          <select v-model="protocol">
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">超时（毫秒）</span>
          <input v-model="timeoutMs" type="text" inputmode="numeric" placeholder="500 - 30000" />
        </label>
      </div>
    </section>

    <div class="actions">
      <button class="button button--primary" type="button" :disabled="config.saving" @click="save">
        <Save :size="16" aria-hidden="true" />
        保存设置
      </button>
      <span class="actions__hint">
        配置版本 v{{ config.config.version }} · 上次载入 {{ config.loadedAt || '—' }}
      </span>
    </div>
  </div>
</template>
