<script setup lang="ts">
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Globe,
  Lock,
  Moon,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
} from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import ToolCard from '../components/ToolCard.vue'
import {
  checkLanAvailability,
  buildSearchUrl,
  createTools,
  fetchHealth,
  loadConfig,
  resolveSearchEngineId,
  toToolStatus,
} from '../services/tools'
import type { DashboardMeta, NetworkTestConfig, SearchConfig, Tag, Tool } from '../types/tool'

/** 未打任何标签的工具归到这一档，避免它们既不在「全部」也不在任何标签下。 */
const UNTAGGED = '__untagged__'
const ALL = 'all'
const SEARCH_ENGINE_STORAGE_KEY = 'dashboard-search-engine'

const defaultMeta: DashboardMeta = {
  title: 'Tools Center',
  description: '统一管理和访问个人部署工具',
}

const meta = ref(defaultMeta)
const searchConfig = ref<SearchConfig | null>(null)
const tags = ref<Tag[]>([])
const tools = ref<Tool[]>([])
const toolQuery = ref('')
const webQuery = ref('')
const selectedEngineId = ref('')
const activeTag = ref<string>(ALL)
const loading = ref(true)
const error = ref('')
const isDark = ref(document.documentElement.dataset.theme === 'dark')
const publicMode = ref(false)
const lanAvailable = ref<boolean | null>(null)
const refreshing = ref(false)
const notice = ref('')
let noticeTimer: number | undefined

const visibleTools = computed(() => {
  const keyword = toolQuery.value.trim().toLocaleLowerCase()
  return tools.value.filter((tool) => {
    if (activeTag.value === UNTAGGED) {
      if (tool.tags.length > 0) return false
    } else if (activeTag.value !== ALL && !tool.tags.includes(activeTag.value)) {
      return false
    }
    if (!keyword) return true
    const haystack = [tool.title, tool.description, ...tagLabelsOf(tool)]
    return haystack.join(' ').toLocaleLowerCase().includes(keyword)
  })
})

/** 标签筛选条：标签的顺序按 conf.yml 里的注册顺序，与工具列表一致可控。 */
const tagOptions = computed(() => {
  const options = tags.value.map((tag) => ({
    id: tag.id,
    label: tag.label,
    count: tools.value.filter((tool) => tool.tags.includes(tag.id)).length,
  }))
  const untagged = tools.value.filter((tool) => tool.tags.length === 0).length
  if (untagged > 0) {
    options.push({ id: UNTAGGED, label: '未分类', count: untagged })
  }
  return options
})

const enabledCount = computed(() => tools.value.filter((tool) => tool.enabled !== false).length)
const onlineCount = computed(() => tools.value.filter((tool) => tool.status === 'online').length)
const showAdminEntry = computed(() => meta.value.adminEntry === true)
const enabledSearchEngines = computed(
  () => searchConfig.value?.engines.filter((engine) => engine.enabled) ?? [],
)
const selectedEngine = computed(
  () =>
    enabledSearchEngines.value.find((engine) => engine.id === selectedEngineId.value) ??
    enabledSearchEngines.value[0],
)

watch(selectedEngineId, (id) => {
  if (id) localStorage.setItem(SEARCH_ENGINE_STORAGE_KEY, id)
})

function tagLabelsOf(tool: Tool): string[] {
  return tool.tags
    .map((id) => tags.value.find((tag) => tag.id === id)?.label)
    .filter((label): label is string => Boolean(label))
}

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

/** 搜索结果是否在新标签页打开；配置里没有这个字段时按 true 处理，与旧行为一致。 */
const searchInNewTab = computed(() => searchConfig.value?.openInNewTab ?? true)

function searchWeb() {
  const engine = selectedEngine.value
  const keyword = webQuery.value.trim()
  if (!engine || !keyword) return

  const url = buildSearchUrl(engine.urlTemplate, keyword)
  if (searchInNewTab.value) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    // 同页打开。用 assign 而不是 replace，这样浏览器后退键能回到门户
    window.location.assign(url)
  }
}

/**
 * 一次请求刷新全部状态。旧实现是每个工具发一个 HEAD，
 * 15 个工具就是 15 个并发请求，控制台一刷新容易出现瞬时拥塞。
 */
async function refreshStatuses() {
  if (!tools.value.length || refreshing.value) return

  refreshing.value = true
  tools.value = tools.value.map((tool) => ({
    ...tool,
    status: tool.enabled === false ? 'disabled' : 'checking',
  }))

  try {
    const payload = await fetchHealth()
    const byId = new Map(payload.tools.map((entry) => [entry.id, entry.status]))
    tools.value = tools.value.map((tool) => ({
      ...tool,
      status: tool.enabled === false ? 'disabled' : toToolStatus(byId.get(tool.id)),
    }))
  } catch {
    tools.value = tools.value.map((tool) => ({
      ...tool,
      status: tool.enabled === false ? 'disabled' : 'offline',
    }))
    showNotice('状态探测失败，请确认 api 服务可用')
  } finally {
    refreshing.value = false
  }
}

async function detectAccessMode(config: NetworkTestConfig) {
  lanAvailable.value = await checkLanAvailability(config)
  publicMode.value = !lanAvailable.value
}

onMounted(async () => {
  try {
    const config = await loadConfig()
    meta.value = config.dashboard
    searchConfig.value = config.search
    tags.value = config.tags
    tools.value = createTools(config)
    selectedEngineId.value = resolveSearchEngineId(
      config.search,
      localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY),
    )
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
  <div class="page">
    <header class="nav">
      <div class="nav__inner">
        <a class="brand" href="/" aria-label="Tools Center 首页">
          <span class="brand__mark"><Boxes :size="20" aria-hidden="true" /></span>
          <span class="brand__text">Tools Center</span>
        </a>

        <div class="nav__actions">
          <button
            class="icon-button"
            type="button"
            :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" :size="18" aria-hidden="true" />
            <Moon v-else :size="18" aria-hidden="true" />
          </button>

          <RouterLink v-if="showAdminEntry" class="icon-button" to="/admin" aria-label="控制台" title="控制台">
            <Lock :size="18" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="page__main">
      <section class="hero">
        <div class="hero__intro">
          <p class="hero__eyebrow">
            <Sparkles :size="15" aria-hidden="true" />
            Personal command center
          </p>
          <h1>{{ meta.title }}</h1>
          <p class="hero__lede">{{ meta.description }}</p>
        </div>

        <aside class="overview-card" aria-label="工具概览">
          <div class="overview-card__glow" aria-hidden="true"></div>
          <header class="overview-card__head">
            <span>
              <Activity :size="17" aria-hidden="true" />
              实时概览
            </span>
            <span class="overview-card__live"><i></i>LIVE</span>
          </header>

          <dl class="stats">
            <div class="stats__item stats__item--blue">
              <dt><Boxes :size="15" aria-hidden="true" />工具</dt>
              <dd>{{ tools.length }}</dd>
            </div>
            <div class="stats__item stats__item--green">
              <dt><Activity :size="15" aria-hidden="true" />在线</dt>
              <dd>{{ loading ? '—' : onlineCount }}</dd>
            </div>
            <div class="stats__item stats__item--violet">
              <dt><CheckCircle2 :size="15" aria-hidden="true" />已启用</dt>
              <dd>{{ enabledCount }}</dd>
            </div>
          </dl>

          <div class="access-card">
            <div>
              <span class="access-card__label">访问模式</span>
              <strong>{{ publicMode ? '公网访问' : '内网访问' }}</strong>
            </div>
            <label class="switch">
              <span class="sr-only">启用公网访问</span>
              <input v-model="publicMode" type="checkbox" />
              <span class="switch__track" aria-hidden="true">
                <span class="switch__thumb">
                  <Globe v-if="publicMode" :size="11" />
                  <Network v-else :size="11" />
                </span>
              </span>
            </label>
          </div>

          <p class="hero__hint">
            {{
              lanAvailable === null
                ? '正在检测内网连通性…'
                : lanAvailable
                  ? '内网可达，优先使用内网地址'
                  : '内网不可达，已切换到公网地址'
            }}
          </p>
        </aside>

        <form class="web-search" role="search" aria-label="网页搜索" @submit.prevent="searchWeb">
          <label class="web-search__engine">
            <span class="sr-only">搜索引擎</span>
            <select v-model="selectedEngineId" :disabled="!enabledSearchEngines.length">
              <option v-for="engine in enabledSearchEngines" :key="engine.id" :value="engine.id">
                {{ engine.name }}
              </option>
            </select>
          </label>
          <span class="web-search__divider" aria-hidden="true"></span>
          <Search :size="20" aria-hidden="true" />
          <label class="web-search__input">
            <span class="sr-only">搜索关键词</span>
            <input
              v-model="webQuery"
              type="search"
              enterkeyhint="search"
              :placeholder="selectedEngine ? `使用 ${selectedEngine.name} 搜索` : '搜索功能不可用'"
              :disabled="!selectedEngine"
            />
          </label>
          <button
            class="web-search__submit"
            type="submit"
            :disabled="!selectedEngine || !webQuery.trim()"
            aria-label="搜索网页"
          >
            <ArrowUpRight :size="19" aria-hidden="true" />
          </button>
        </form>
      </section>

      <section class="workspace" aria-labelledby="tools-heading">
        <div class="workspace__bar">
          <h2 id="tools-heading" class="workspace__title">全部工具</h2>

          <div class="workspace__tools">
            <label class="tool-search">
              <Search :size="16" aria-hidden="true" />
              <span class="sr-only">筛选工具</span>
              <input v-model="toolQuery" type="search" placeholder="筛选工具" />
            </label>

            <div v-if="tagOptions.length" class="segmented" role="tablist" aria-label="按标签筛选">
              <button
                class="segmented__item"
                type="button"
                role="tab"
                :aria-selected="activeTag === ALL"
                :class="{ 'segmented__item--active': activeTag === ALL }"
                @click="activeTag = ALL"
              >
                全部<span class="segmented__count">{{ tools.length }}</span>
              </button>
              <button
                v-for="option in tagOptions"
                :key="option.id"
                class="segmented__item"
                type="button"
                role="tab"
                :aria-selected="activeTag === option.id"
                :class="{ 'segmented__item--active': activeTag === option.id }"
                @click="activeTag = option.id"
              >
                {{ option.label }}<span class="segmented__count">{{ option.count }}</span>
              </button>
            </div>

            <button
              class="icon-button icon-button--bordered"
              type="button"
              :disabled="refreshing"
              aria-label="刷新服务状态"
              title="刷新服务状态"
              @click="refreshStatuses"
            >
              <RefreshCw :class="{ spinning: refreshing }" :size="17" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p v-if="loading" class="state-panel">正在加载工具配置…</p>
        <p v-else-if="error" class="state-panel state-panel--error">{{ error }}</p>
        <div v-else-if="visibleTools.length" class="tool-grid">
          <ToolCard
            v-for="tool in visibleTools"
            :key="tool.id"
            :tool="tool"
            :tag-labels="tagLabelsOf(tool)"
            :public-mode="publicMode"
            @unavailable="showNotice"
          />
        </div>
        <p v-else class="state-panel">没有匹配的工具</p>
      </section>
    </main>

    <footer class="footer">
      <span>{{ meta.title }}</span>
      <span>{{ publicMode ? '公网模式' : '内网模式' }}</span>
    </footer>

    <Transition name="notice">
      <div v-if="notice" class="notice-toast" role="status" aria-live="polite">
        <CircleAlert :size="18" aria-hidden="true" />
        <span>{{ notice }}</span>
      </div>
    </Transition>
  </div>
</template>
