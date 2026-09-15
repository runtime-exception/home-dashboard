import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 开发期把 /api 打到本地跑的 api 服务，避免 dev 时 /api/config.json 404。
 * 容器里跑的是 NGINX 反代，不走这个代理。
 *
 * 目标地址用 VITE_API_TARGET 覆盖，`.env` 与命令行（`VITE_API_TARGET=... npm run dev`）都能生效。
 * 这里刻意不碰 `process.env`：前端的 tsconfig.node.json 没引 node 类型，
 * 引用 process 会让 `vue-tsc -b`（即 npm run build）直接报 TS2580。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: false,
        },
      },
    },
  }
})
