<script setup lang="ts">
import { ref, watch } from 'vue'
import AdminConsole from '../components/admin/AdminConsole.vue'
import AdminLogin from '../components/admin/AdminLogin.vue'
import { useConfigStore } from '../stores/config'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const config = useConfigStore()

/** 只有确认登录成功后才渲染控制台，避免骨架屏闪一下又跳回登录页。 */
const showConsole = ref(false)

watch(
  () => session.authenticated,
  (authenticated) => {
    showConsole.value = authenticated
    if (authenticated) {
      void config.load()
      return
    }
    // 退出时清空，防止下一个人在同一浏览器里看到上一个会话的数据
    config.config = null
  },
  { immediate: true },
)
</script>

<template>
  <AdminConsole v-if="showConsole" />
  <AdminLogin v-else-if="session.ready" />
  <div v-else class="gate">
    <p class="gate__checking">正在校验登录态…</p>
  </div>
</template>
