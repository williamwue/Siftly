import Database from 'better-sqlite3'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type SyncItem = { id: string; bookmarkId: string; tweetId: string; account: string; status: string; error: string | null; updatedAt: number }
export function openQueue() {
  const filename = (process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'prisma/dev.db')}`).replace(/^file:/, '')
  const db = new Database(filename, { timeout: 5000 })
  db.exec(`CREATE TABLE IF NOT EXISTS XBookmarkRemoval (
    id TEXT PRIMARY KEY, bookmarkId TEXT UNIQUE NOT NULL, tweetId TEXT NOT NULL,
    account TEXT NOT NULL, status TEXT NOT NULL, error TEXT, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS XBookmarkWorker (id INTEGER PRIMARY KEY, owner TEXT, heartbeat INTEGER);
    CREATE TABLE IF NOT EXISTS DeletedBookmark (tweetId TEXT PRIMARY KEY, deletedAt TEXT NOT NULL);`)
  return db
}
export function enqueue(db: Database.Database, rows: { id: string; tweetId: string }[], account: string) {
  db.transaction(() => {
    for (const row of rows) {
      db.prepare(`INSERT INTO XBookmarkRemoval VALUES (?, ?, ?, ?, 'pending', NULL, ?)
        ON CONFLICT(bookmarkId) DO UPDATE SET status='pending', error=NULL, account=excluded.account, updatedAt=excluded.updatedAt
        WHERE XBookmarkRemoval.status='failed'`).run(randomUUID(), row.id, row.tweetId, account, Date.now())
    }
  })()
}
export function recoverStale(db: Database.Database) {
  db.transaction(() => {
    const lock = db.prepare('SELECT heartbeat FROM XBookmarkWorker WHERE id=1').get() as { heartbeat: number } | undefined
    if (!lock || lock.heartbeat < Date.now() - 90000) {
      db.prepare("UPDATE XBookmarkRemoval SET status='failed', error='同步进程中断，请重试；本地记录已保留。', updatedAt=? WHERE status='running'").run(Date.now())
      db.prepare('DELETE FROM XBookmarkWorker WHERE id=1').run()
    }
  })()
}
export function claimWorker(db: Database.Database, owner: string) {
  recoverStale(db)
  return db.prepare('INSERT OR IGNORE INTO XBookmarkWorker VALUES (1, ?, ?)').run(owner, Date.now()).changes === 1
}
