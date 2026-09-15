import { access, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from './atomic-write.ts'

export const BACKUP_KEEP = 20

/**
 * 只清理本程序生成的备份。白名单是必须的——用户可能自己往这个目录里放东西，
 * 无差别按数量删除会误伤。
 */
const BACKUP_NAME_RE = /^conf-\d{8}-\d{6}(?:-\d+)?\.yml$/

export interface BackupInfo {
  name: string
  size: number
  modifiedAt: string
}

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  // 统一用 UTC：备份名只承担「可排序」职责，人类可读时间由接口以 ISO 串给出
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  )
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/** 备份 source 到 backupDir，返回备份文件名。调用方负责保证 source 存在。 */
export async function createBackup(backupDir: string, source: string): Promise<string> {
  await mkdir(backupDir, { recursive: true })

  const base = stamp()
  let name = `conf-${base}.yml`
  if (await exists(path.join(backupDir, name))) {
    // 同一秒内多次保存：加序号后缀，避免互相覆盖
    let index = 1
    while (await exists(path.join(backupDir, `conf-${base}-${index}.yml`))) index += 1
    name = `conf-${base}-${index}.yml`
  }

  const bytes = await readFile(source)
  await writeFileAtomic(path.join(backupDir, name), bytes)
  await pruneBackups(backupDir)
  return name
}

/** 保留最近 keep 份。字段零填充使字典序等于时间序。 */
export async function pruneBackups(
  backupDir: string,
  keep: number = BACKUP_KEEP,
): Promise<string[]> {
  const names = (await readdir(backupDir)).filter((name) => BACKUP_NAME_RE.test(name))
  // 不按 mtime 排序：restore / cp 会把 mtime 改乱，只有文件名可靠
  names.sort()
  names.reverse()
  const doomed = names.slice(keep)
  await Promise.all(doomed.map((name) => rm(path.join(backupDir, name), { force: true })))
  return doomed
}

export async function listBackups(backupDir: string): Promise<BackupInfo[]> {
  let names: string[]
  try {
    names = await readdir(backupDir)
  } catch {
    return []
  }

  const infos: BackupInfo[] = []
  for (const name of names.filter((n) => BACKUP_NAME_RE.test(n))) {
    try {
      const info = await stat(path.join(backupDir, name))
      infos.push({
        name,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
      })
    } catch {
      // 读取过程中被并发删除：忽略
    }
  }

  infos.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
  return infos
}

export function isBackupName(name: string): boolean {
  return BACKUP_NAME_RE.test(name)
}
