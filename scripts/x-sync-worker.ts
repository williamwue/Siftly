import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { openQueue, claimWorker, type SyncItem } from '../lib/x-sync-queue'
import { deleteLocalBookmarks } from '../lib/bookmark-deletion'
import prisma from '../lib/db'

async function main() {
  const db = openQueue(), owner = randomUUID()
  if (!claimWorker(db, owner)) { db.close(); return }
  const heartbeat = setInterval(() => db.prepare('UPDATE XBookmarkWorker SET heartbeat=? WHERE owner=?').run(Date.now(), owner), 10000)
  let jobs: SyncItem[] = []
  try {
    jobs = db.transaction(() => {
      const rows = db.prepare("SELECT * FROM XBookmarkRemoval WHERE status='pending' ORDER BY updatedAt LIMIT 100").all() as SyncItem[]
      for (const row of rows) db.prepare("UPDATE XBookmarkRemoval SET status='running', updatedAt=? WHERE id=?").run(Date.now(), row.id)
      return rows
    })()
    if (!jobs.length) return
    const child = spawn(process.env.SIFTLY_EGO_BINARY || 'ego-browser', ['nodejs'], {
      cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let updates = Promise.resolve()
    const handleLine = (line: string) => {
      if (!line.startsWith('SIFTLY_RESULT ')) return
      updates = updates.then(async () => {
        const result = JSON.parse(line.slice(14))
        const job = jobs.find(j => j.id === result.id)
        if (!job) return
        try {
          if (result.ok === true) {
            await deleteLocalBookmarks([job.bookmarkId])
            db.prepare("UPDATE XBookmarkRemoval SET status='done', error=NULL, updatedAt=? WHERE id=?").run(Date.now(), job.id)
          } else {
            db.prepare("UPDATE XBookmarkRemoval SET status='failed', error=?, updatedAt=? WHERE id=?").run(String(result.error || 'X 同步失败').slice(0, 400), Date.now(), job.id)
          }
        } catch {
          db.prepare("UPDATE XBookmarkRemoval SET status='failed', error='X 已处理，但本地删除失败；可安全重试。', updatedAt=? WHERE id=?").run(Date.now(), job.id)
        }
      }).catch(() => { /* Remaining running jobs become failed below. */ })
    }
    // Ego emits console.log receipts on stderr; support both output channels.
    createInterface({ input: child.stdout }).on('line', handleLine)
    createInterface({ input: child.stderr }).on('line', handleLine)
    child.stdin.on('error', () => {})
    const payload = jobs.map(({ id, tweetId, account }) => ({ id, tweetId, account }))
    child.stdin.end('const jobs = ' + JSON.stringify(payload) + ';\n' + readFileSync(path.join(process.cwd(), 'scripts/x-sync-browser.mjs'), 'utf8'))
    await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()) })
    await updates
  } catch {
    // Missing CLI / browser connection does not delete local data.
  } finally {
    for (const job of jobs) db.prepare("UPDATE XBookmarkRemoval SET status='failed', error='浏览器未完成处理。请检查 Ego 登录或连接后重试；本地书签已保留。', updatedAt=? WHERE id=? AND status='running'").run(Date.now(), job.id)
    clearInterval(heartbeat)
    db.prepare('DELETE FROM XBookmarkWorker WHERE owner=?').run(owner)
    db.close()
    await prisma.$disconnect()
  }
}
main().catch(() => { process.exitCode = 1 })
