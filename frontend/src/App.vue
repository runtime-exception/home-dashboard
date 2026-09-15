<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useSessionStore } from './stores/session'

const session = useSessionStore()

// 登录态是 HttpOnly cookie，刷新后必须问一次服务端才知道自己还在不在
onMounted(() => {
  void session.probe()
})
</script>

<template>
  <RouterView />
</template>
