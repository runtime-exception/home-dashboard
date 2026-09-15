<script setup lang="ts">
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useConfigStore } from '../../../stores/config'
import type { SearchConfig, SearchEngineConfig } from '../../../types/tool'

const config = useConfigStore()
const draft = ref<SearchConfig>({ defaultEngine: '', engines: [], openInNewTab: true })
const newEngine = ref<SearchEngineConfig>({
  id: '',
  name: '',
  urlTemplate: '',
  enabled: true,
})

watch(
  () => config.config?.search,
  (value) => {
    if (value) {
      draft.value = {
        defaultEngine: value.defaultEngine,
        engines: value.engines.map((engine) => ({ ...engine })),
        openInNewTab: value.openInNewTab,
      }
    }
  },
  { immediate: true },
)

function add() {
  draft.value.engines.push({
    id: newEngine.value.id.trim(),
    name: newEngine.value.name.trim(),
    urlTemplate: newEngine.value.urlTemplate.trim(),
    enabled: true,
  })
  newEngine.value = { id: '', name: '', urlTemplate: '', enabled: true }
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= draft.value.engines.length) return
  const [engine] = draft.value.engines.splice(index, 1)
  if (engine) draft.value.engines.splice(target, 0, engine)
}

function remove(engine: SearchEngineConfig) {
  if (engine.id === draft.value.defaultEngine) return
  draft.value.engines = draft.value.engines.filter((candidate) => candidate.id !== engine.id)
}

async function save() {
  const current = config.config
  if (!current) return
  await config.save({
    ...current,
    search: {
      defaultEngine: draft.value.defaultEngine,
      openInNewTab: draft.value.openInNewTab,
      engines: draft.value.engines.map((engine) => ({
        ...engine,
        name: engine.name.trim(),
        urlTemplate: engine.urlTemplate.trim(),
      })),
    },
  })
}
</script>

<template>
  <div class="stack">
    <div class="panel__head panel__head--row">
      <div>
        <h2>搜索引擎</h2>
        <p>首页只展示启用项，地址模板必须包含一个 <code>{query}</code>。</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel__body">
        <div class="search-open-mode">
          <label class="search-engine-option">
            <input v-model="draft.openInNewTab" type="checkbox" />
            搜索结果在新标签页打开
          </label>
          <span class="field__hint">
            关掉则在当前页面打开，浏览器后退键可以回到门户。工具卡片的打开方式不受这项影响。
          </span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__body">
        <div class="inline-form search-engine-create">
          <label class="field">
            <span class="field__label">id</span>
            <input v-model="newEngine.id" type="text" placeholder="例如 duckduckgo" />
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="newEngine.name" type="text" maxlength="24" placeholder="例如 DuckDuckGo" />
          </label>
          <label class="field field--template">
            <span class="field__label">搜索地址模板</span>
            <input
              v-model="newEngine.urlTemplate"
              type="url"
              placeholder="https://example.com/search?q={query}"
            />
          </label>
          <button
            class="button button--primary"
            type="button"
            :disabled="
              !newEngine.id.trim() || !newEngine.name.trim() || !newEngine.urlTemplate.trim()
            "
            @click="add"
          >
            <Plus :size="16" aria-hidden="true" />
            添加
          </button>
        </div>
      </div>
    </section>

    <ul class="rows">
      <li v-for="(engine, index) in draft.engines" :key="engine.id" class="rows__item">
        <div class="search-engine-row">
          <span class="rows__order">
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="上移"
              :disabled="index === 0"
              @click="move(index, -1)"
            >
              <ChevronUp :size="15" aria-hidden="true" />
            </button>
            <button
              class="icon-button icon-button--tiny"
              type="button"
              aria-label="下移"
              :disabled="index === draft.engines.length - 1"
              @click="move(index, 1)"
            >
              <ChevronDown :size="15" aria-hidden="true" />
            </button>
          </span>

          <label class="field">
            <span class="field__label">id</span>
            <input :value="engine.id" class="is-locked" type="text" disabled />
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="engine.name" type="text" maxlength="24" />
          </label>
          <label class="field field--template">
            <span class="field__label">搜索地址模板</span>
            <input v-model="engine.urlTemplate" type="url" />
          </label>

          <label class="search-engine-option">
            <input
              v-model="engine.enabled"
              type="checkbox"
              :disabled="engine.id === draft.defaultEngine"
            />
            启用
          </label>
          <label class="search-engine-option">
            <input v-model="draft.defaultEngine" type="radio" :value="engine.id" :disabled="!engine.enabled" />
            默认
          </label>
          <button
            class="icon-button icon-button--tiny"
            type="button"
            aria-label="删除搜索引擎"
            title="默认引擎需先切换后才能删除"
            :disabled="engine.id === draft.defaultEngine"
            @click="remove(engine)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!draft.engines.length" class="state-panel">至少添加一个搜索引擎。</p>

    <ul v-if="config.fieldErrors.length" class="field-errors">
      <li v-for="error in config.fieldErrors" :key="`${error.field}-${error.message}`">
        {{ error.field }}：{{ error.message }}
      </li>
    </ul>

    <div class="actions">
      <button class="button button--primary" type="button" :disabled="config.saving" @click="save">
        <Save :size="16" aria-hidden="true" />
        保存搜索设置
      </button>
      <span class="actions__hint">修改会写入 conf.yml，并自动保留备份。</span>
    </div>
  </div>
</template>
