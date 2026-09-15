/**
 * 写操作串行化。api 是单进程，写只发生在「保存配置 / 恢复备份 / 导入」三条路径上，
 * 一个内存队列即可，不需要文件锁（也就没有残留锁文件的问题）。
 */
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve()

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    // 前一个任务失败也要继续跑下一个，否则一次错误会永久卡死队列
    const run = tail.then(task, task)
    tail = run.catch(() => {})
    return run
  }
}

export type WriteQueue = ReturnType<typeof createWriteQueue>
