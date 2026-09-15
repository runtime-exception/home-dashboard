<script setup lang="ts">
import {
  ArrowLeft,
  DatabaseBackup,
  FileCode,
  LayoutDashboard,
  LogOut,
  Search,
  Tag,
  TriangleAlert,
  Wrench,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import { useSessionStore } from '../../stores/session'
import BackupsPanel from './panels/BackupsPanel.vue'
import OverviewPanel from './panels/OverviewPanel.vue'
import SearchPanel from './panels/SearchPanel.vue'
import TagsPanel from './panels/TagsPanel.vue'
import ToolsPanel from './panels/ToolsPanel.vue'
import YamlPanel from './panels/YamlPanel.vue'

type TabId = 'overview' | 'tools' | 'tags' | 'search' | 'backups' | 'yaml'

const tabs: { id: TabId; label: string; icon: typeof Wrench }[] = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'tags', label: '标签', icon: Tag },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'backups', label: '备份', icon: DatabaseBackup },
  { id: 'yaml', label: 'YAML', icon: FileCode },
]

const active = ref<TabId>('overview')
const config = useConfigStore()
const session = useSessionStore()
const router = useRouter()

const toolCount = computed(() => config.tools.length)
const tagCount = computed(() => config.tags.length)

async function logout() {
  await session.logout()
  void router.push('/')
}
</script>

<template>
  <div class="page page--console">
    <header class="nav nav--console">
      <div class="nav__inner">
        <div class="console-brand">
          <RouterLink class="icon-button" to="/" aria-label="返回门户" title="返回门户">
            <ArrowLeft :size="18" aria-hidden="true" />
          </RouterLink>
          <div>
            <h1 class="console-brand__title">控制台</h1>
            <p class="console-brand__meta">
              {{ toolCount }} 个工具 · {{ tagCount }} 个标签
            </p>
          </div>
        </div>

        <div class="nav__actions">
          <span v-if="config.saving" class="pill pill--busy">保存中…</span>
          <span v-else-if="session.username" class="pill">{{ session.displayName }}</span>
          <button class="icon-button" type="button" aria-label="退出登录" title="退出登录" @click="logout">
            <LogOut :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <div class="console">
      <nav class="tabs" aria-label="控制台分区">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tabs__item"
          type="button"
          :class="{ 'tabs__item--active': active === tab.id }"
          :aria-current="active === tab.id ? 'page' : undefined"
          @click="active = tab.id"
        >
          <component :is="tab.icon" :size="16" aria-hidden="true" />
          {{ tab.label }}
        </button>
      </nav>

      <div class="console__body">
        <p v-if="config.drift" class="banner banner--warn">
          <TriangleAlert :size="17" aria-hidden="true" />
          conf.yml 在服务启动后被外部修改过，保存会以控制台里的内容为准。
        </p>

        <p v-if="config.error" class="banner banner--error" role="alert">
          {{ config.error }}
        </p>

        <p v-if="config.loading && !config.ready" class="state-panel">正在读取配置…</p>

        <OverviewPanel v-else-if="active === 'overview'" />
        <ToolsPanel v-else-if="active === 'tools'" />
        <TagsPanel v-else-if="active === 'tags'" />
        <SearchPanel v-else-if="active === 'search'" />
        <BackupsPanel v-else-if="active === 'backups'" />
        <YamlPanel v-else-if="active === 'yaml'" />
      </div>
    </div>
  </div>
</template>
