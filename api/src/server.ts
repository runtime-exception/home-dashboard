import { buildApp } from './app.ts'
import { createContext } from './context.ts'
import { EnvError, loadEnv, tokenFingerprint, type AppEnv } from './env.ts'

function readEnvOrExit(): AppEnv {
  try {
    return loadEnv()
  } catch (error) {
    if (error instanceof EnvError) {
      // 凭据不合法就没有继续的理由：宁可启动失败，也不要跑一个裸奔的实例
      process.stderr.write(`\n[api] 启动失败\n\n${error.message}\n\n`)
      process.exit(1)
    }
    throw error
  }
}

async function main(): Promise<void> {
  const env = readEnvOrExit()
  const ctx = createContext(env)

  await ctx.config.load()

  const configError = ctx.config.lastError()
  if (configError) {
    process.stderr.write(
      `[api] 配置载入失败：${configError.message}\n` +
        `[api] 控制台仍可登录，登录后可在「备份恢复」里改用备份文件，或直接修正 ${env.configFile}\n`,
    )
  }

  const app = buildApp(ctx)

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, '收到退出信号，正在关闭')
    await app.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: env.port, host: env.host })

  app.log.info(
    {
      configFile: env.configFile,
      backupDir: env.backupDir,
      adminUsername: env.adminUsername,
      // 只输出指纹前缀，绝不输出令牌原文
      tokenFingerprint: tokenFingerprint(env.adminToken),
      sessionTtlHours: Math.round(env.sessionTtlMs / 3_600_000),
      configReady: ctx.config.isReady(),
    },
    '控制台服务已就绪',
  )
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\n[api] 启动过程中出现未处理错误：\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n\n`,
  )
  process.exit(1)
})
