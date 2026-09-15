<script setup lang="ts">
import { ArrowLeft, KeyRound, LoaderCircle } from '@lucide/vue'
import { ref } from 'vue'
import { useSessionStore } from '../../stores/session'

const session = useSessionStore()

const username = ref('')
const token = ref('')

async function submit() {
  if (session.pending) return
  await session.login(username.value, token.value)
  // 登录成功后不清空 token：失败重试时用户不必重新输入
}
</script>

<template>
  <div class="gate">
    <form class="gate__card" @submit.prevent="submit">
      <div class="gate__mark"><KeyRound :size="22" aria-hidden="true" /></div>
      <h1>控制台</h1>
      <p class="gate__lede">
        使用 <code>docker-compose.yml</code> 里配置的
        <code>ADMIN_USERNAME</code> 与 <code>ADMIN_TOKEN</code> 登录。
      </p>

      <label class="field">
        <span class="field__label">用户名</span>
        <input v-model="username" type="text" autocomplete="username" autofocus required />
      </label>

      <label class="field">
        <span class="field__label">令牌</span>
        <input
          v-model="token"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <p v-if="session.error" class="form-error" role="alert">{{ session.error }}</p>

      <button class="button button--primary button--block" type="submit" :disabled="session.pending">
        <LoaderCircle v-if="session.pending" class="spinning" :size="16" aria-hidden="true" />
        {{ session.pending ? '正在登录…' : '登录' }}
      </button>

      <RouterLink class="gate__back" to="/">
        <ArrowLeft :size="14" aria-hidden="true" />
        返回门户
      </RouterLink>
    </form>
  </div>
</template>
