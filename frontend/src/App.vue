<script setup lang="ts">
import { Boxes, CircleAlert, Globe2, Moon, Network, RefreshCw, Search, Sun } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import ToolCard from './components/ToolCard.vue'
import {
  checkLanAvailability,
  checkToolStatus,
  createTools,
  loadConfig,
} from './services/tools'
import type { DashboardMeta, Tool } from './types/tool'

const defaultMeta: DashboardMeta = {
  title: 'Tools Center',
  description: '统一管理和访问个人部署工具',
}

const meta = ref(defaultMeta)
const tools = ref<Tool[]>([])
const query = ref('')
const loading = ref(true)
const error = ref('')
const isDark = ref(true)
const publicMode = ref(false)
const lanAvailable = ref<boolean | null>(null)
const refreshing = ref(false)
const notice = ref('')
let noticeTimer: number | undefined

const filteredTools = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  if (!keyword) return tools.value

  return tools.value.filter((tool) =>
    [tool.title, tool.description]
      .join(' ')
      .toLocaleLowerCase()
      .includes(keyword),
  )
})

const onlineCount = computed(
  () => tools.value.filter((tool) => tool.status === 'online').length,
)

function applyTheme(dark: boolean) {
  isDark.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  localStorage.setItem('dashboard-theme', dark ? 'dark' : 'light')
}

function toggleTheme() {
  applyTheme(!isDark.value)
}

function showNotice(message: string) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 2800)
}

async function refreshStatuses() {
  if (!tools.value.length || refreshing.value) return

  refreshing.value = true
  tools.value = tools.value.map((tool) => ({
    ...tool,
    status: tool.enabled === false ? 'disabled' : 'checking',
  }))

  const enabledTools = tools.value.filter((tool) => tool.enabled !== false)
  await Promise.all(
    enabledTools.map(async (tool) => {
      const status = await checkToolStatus(tool)
      tools.value = tools.value.map((current) =>
        current.id === tool.id ? { ...current, status } : current,
      )
    }),
  )
  refreshing.value = false
}

async function detectAccessMode(config: Parameters<typeof checkLanAvailability>[0]) {
  lanAvailable.value = await checkLanAvailability(config)
  publicMode.value = !lanAvailable.value
}

onMounted(async () => {
  const savedTheme = localStorage.getItem('dashboard-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(savedTheme ? savedTheme === 'dark' : prefersDark)

  try {
    const config = await loadConfig()
    meta.value = config.dashboard
    tools.value = createTools(config)
    loading.value = false
    void refreshStatuses()
    void detectAccessMode(config.networkTest)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '工具配置加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="app-shell">
    <div class="ambient ambient--one" aria-hidden="true"></div>
    <div class="ambient ambient--two" aria-hidden="true"></div>

    <header class="topbar">
      <a class="brand" href="/" aria-label="Tools Center 首页">
        <span class="brand__mark"><Boxes :size="23" aria-hidden="true" /></span>
        <span>TOOLS<span class="brand__dot">.</span></span>
      </a>

      <div class="topbar__actions">
        <button
          class="icon-button"
          type="button"
          :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" :size="19" aria-hidden="true" />
          <Moon v-else :size="19" aria-hidden="true" />
        </button>
        <div class="system-status">
          <span class="system-status__dot"></span>
          门户运行中
        </div>
      </div>
    </header>

    <main>
      <section class="overview" aria-labelledby="page-title">
        <div class="overview__intro">
          <div class="eyebrow"><span></span>PERSONAL INFRASTRUCTURE</div>
          <h1 id="page-title">{{ meta.title }}</h1>
          <p>{{ meta.description }}</p>
        </div>

        <div class="overview__stats" aria-label="服务概况">
          <div class="stat-card">
            <span class="stat-card__label">服务总数</span>
            <strong>{{ tools.length }}</strong>
            <span class="stat-card__hint">已配置服务</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__label">在线总数</span>
            <strong>{{ onlineCount }}</strong>
            <span class="stat-card__hint">内网健康检查</span>
          </div>
          <div class="stat-card stat-card--mode">
            <div>
              <span class="stat-card__label">访问模式</span>
              <strong class="mode-value">{{ publicMode ? '公网' : '内网' }}</strong>
              <span class="stat-card__hint">
                {{ lanAvailable === null ? '正在检测网络' : lanAvailable ? '内网可达' : '内网不可达，已切换公网' }}
              </span>
            </div>
            <label class="mode-switch">
              <span class="sr-only">启用公网访问</span>
              <input v-model="publicMode" type="checkbox" />
              <span class="mode-switch__track" aria-hidden="true">
                <span class="mode-switch__thumb">
                  <Globe2 v-if="publicMode" :size="12" />
                  <Network v-else :size="12" />
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section class="workspace" aria-labelledby="tools-heading">
        <div class="workspace__header">
          <div>
            <span class="section-kicker">WORKSPACE</span>
            <h2 id="tools-heading">工具工作台</h2>
          </div>

          <div class="workspace__controls">
            <label class="search-box">
              <Search :size="18" aria-hidden="true" />
              <span class="sr-only">搜索工具</span>
              <input v-model="query" type="search" placeholder="搜索工具…" />
            </label>
            <button
              class="refresh-button"
              type="button"
              :disabled="refreshing"
              aria-label="刷新服务状态"
              @click="refreshStatuses"
            >
              <RefreshCw :class="{ spinning: refreshing }" :size="18" aria-hidden="true" />
              <span>刷新状态</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="state-panel">正在加载工具配置…</div>
        <div v-else-if="error" class="state-panel state-panel--error">{{ error }}</div>
        <div v-else-if="filteredTools.length" class="tool-grid">
          <ToolCard
            v-for="tool in filteredTools"
            :key="tool.id"
            :tool="tool"
            :public-mode="publicMode"
            @unavailable="showNotice"
          />
        </div>
        <div v-else class="state-panel">没有找到匹配的工具</div>
      </section>
    </main>

    <footer>
      <span>Tools Center</span>
      <span>{{ publicMode ? 'Public access mode' : 'Local access mode' }}</span>
    </footer>

    <Transition name="notice">
      <div v-if="notice" class="notice-toast" role="status" aria-live="polite">
        <CircleAlert :size="19" aria-hidden="true" />
        <span>{{ notice }}</span>
      </div>
    </Transition>
  </div>
</template>
