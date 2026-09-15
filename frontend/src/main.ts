import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles.css'

// 兼容早期设想的 /?admin 写法，直接换成 hash 路由
if (new URLSearchParams(window.location.search).has('admin')) {
  window.history.replaceState(null, '', `${window.location.pathname}#/admin`)
}

createApp(App).use(createPinia()).use(router).mount('#app')
