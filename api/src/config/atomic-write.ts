import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises'
import path from 'node:path'

/**
 * 目录项持久化。rename 修改的是目录，只 fsync 文件不足以保证断电后一致。
 * macOS 上对目录 fsync 常抛 EINVAL/EPERM，Linux 容器内正常，所以只忽略这几个错误码。
 */
async function fsyncDir(dir: string): Promise<void> {
  let handle: FileHandle | undefined
  try {
    handle = await open(dir, 'r')
    await handle.sync()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EINVAL' && code !== 'EPERM' && code !== 'EISDIR') throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * 原子写：同目录 tmp → fsync(file) → rename → fsync(dir)。
 *
 * 前提：target 必须位于「目录型」挂载内。单文件 bind mount 会把 inode 钉在挂载点上，
 * 此时 rename 会返回 EBUSY。
 *
 * tmp 与 target 同目录是硬要求：跨文件系统 rename 会返回 EXDEV，所以不能写 /tmp。
 */
export async function writeFileAtomic(
  target: string,
  data: string | Buffer,
  mode = 0o644,
): Promise<void> {
  const dir = path.dirname(target)
  await mkdir(dir, { recursive: true })

  const tmp = path.join(
    dir,
    `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  )

  let handle: FileHandle | undefined
  try {
    // 'wx'：文件已存在则失败，避免两个进程用同一个 tmp 名互相覆写
    handle = await open(tmp, 'wx', mode)
    await handle.writeFile(data)
    // 必须先 fsync 数据再 rename，否则崩溃后可能得到「目录项指向新 inode 但内容为空」
    await handle.sync()
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
  await handle.close()

  try {
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }

  await fsyncDir(dir)
}
