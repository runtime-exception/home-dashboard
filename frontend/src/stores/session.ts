import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AdminApiError, adminApi } from '../services/admin'

/**
 * 控制台登录态。会话本身是 HttpOnly cookie，前端只缓存「是谁」，
 * 因此刷新页面后靠 probe() 向服务端确认，而不是读本地存储。
 */
export const useSessionStore = defineStore('session', () => {
  const username = ref('')
  const authenticated = ref(false)
  /** 首次探测完成前不渲染登录页，避免已登录用户看到一闪而过的表单。 */
  const ready = ref(false)
  const pending = ref(false)
  const error = ref('')
  /** 被登录限速锁住时不再显示「凭据错误」，否则会误导用户反复重试。 */
  const rateLimited = ref(false)

  const displayName = computed(() => username.value || '管理员')

  function applyError(reason: unknown, fallback: string) {
    if (reason instanceof AdminApiError) {
      error.value = reason.message
      rateLimited.value = reason.status === 429
      return
    }
    error.value = reason instanceof Error ? reason.message : fallback
    rateLimited.value = false
  }

  async function probe(): Promise<void> {
    if (pending.value) return
    pending.value = true
    try {
      const session = await adminApi.session.current()
      username.value = session.username
      authenticated.value = true
      error.value = ''
    } catch {
      // 未登录是常态，不当作错误展示
      authenticated.value = false
      username.value = ''
    } finally {
      pending.value = false
      ready.value = true
    }
  }

  async function login(name: string, token: string): Promise<boolean> {
    if (pending.value) return false
    pending.value = true
    error.value = ''
    rateLimited.value = false
    try {
      const session = await adminApi.session.login(name.trim(), token)
      username.value = session.username
      authenticated.value = true
      return true
    } catch (reason) {
      applyError(reason, '登录失败')
      return false
    } finally {
      pending.value = false
      ready.value = true
    }
  }

  async function logout(): Promise<void> {
    try {
      await adminApi.session.logout()
    } catch {
      // 服务端不可达也要让用户能退出界面
    }
    username.value = ''
    authenticated.value = false
    error.value = ''
    rateLimited.value = false
  }

  return {
    username,
    displayName,
    authenticated,
    ready,
    pending,
    error,
    rateLimited,
    probe,
    login,
    logout,
  }
})
