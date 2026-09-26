import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { openQueue, recoverStale, type SyncItem } from '@/lib/x-sync-queue'
import { startXSync } from '@/lib/start-x-sync'

export async function GET() {
  const db = openQueue()
  try {
    recoverStale(db)
    const items = db.prepare("SELECT * FROM XBookmarkRemoval WHERE status != 'done' ORDER BY updatedAt DESC LIMIT 100").all() as SyncItem[]
    const completed = db.prepare("SELECT count(*) AS n FROM XBookmarkRemoval WHERE status='done'").get() as { n: number }
    const pending = items.some(i => i.status === 'pending')
    const running = db.prepare('SELECT id FROM XBookmarkWorker WHERE id=1').get()
    if (pending && !running) startXSync()
    const setting = await prisma.setting.findUnique({ where: { key: 'xBookmarkAccount' } })
    return NextResponse.json({ items, completed: completed.n, account: setting?.value ?? '' })
  } finally { db.close() }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host')) return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || typeof body.id !== 'string') return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  const db = openQueue()
  try {
    recoverStale(db)
    db.prepare("UPDATE XBookmarkRemoval SET status='pending', error=NULL, updatedAt=? WHERE id=? AND status='failed' AND EXISTS (SELECT 1 FROM Bookmark WHERE Bookmark.id=XBookmarkRemoval.bookmarkId)").run(Date.now(), body.id)
    startXSync()
    return NextResponse.json({ ok: true })
  } finally { db.close() }
}
