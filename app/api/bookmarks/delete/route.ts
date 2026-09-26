import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { deleteLocalBookmarks } from '@/lib/bookmark-deletion'
import { openQueue, enqueue } from '@/lib/x-sync-queue'
import { startXSync } from '@/lib/start-x-sync'

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('ids' in body) ||
      !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 ||
      !body.ids.every((id: unknown) => typeof id === 'string' && id.trim().length > 0 && id.length <= 128)) {
    return NextResponse.json({ error: 'Provide 1–100 bookmark IDs' }, { status: 400 })
  }
  const ids: string[] = [...new Set<string>(body.ids)]
  try {
    const mode = 'syncX' in body ? body.syncX : false
    if (typeof mode !== 'boolean') return NextResponse.json({ error: 'Invalid syncX' }, { status: 400 })
    if (mode) {
      const origin = request.headers.get('origin')
      if (origin && new URL(origin).host !== request.headers.get('host')) return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 })
      const account = 'account' in body && typeof body.account === 'string' ? body.account.replace(/^@/, '').trim() : ''
      if (!/^[A-Za-z0-9_]{1,15}$/.test(account)) return NextResponse.json({ error: '请填写要同步的 X 用户名。' }, { status: 400 })
      const rows = await prisma.bookmark.findMany({ where: { id: { in: ids } }, select: { id: true, tweetId: true, source: true } })
      if (rows.some(r => r.source !== 'bookmark' || !/^\d+$/.test(r.tweetId))) return NextResponse.json({ error: '仅支持 X 书签，不能同步点赞或其他来源。' }, { status: 400 })
      const db = openQueue()
      try { enqueue(db, rows, account) } finally { db.close() }
      await prisma.setting.upsert({ where: { key: 'xBookmarkAccount' }, create: { key: 'xBookmarkAccount', value: account }, update: { value: account } })
      startXSync()
      return NextResponse.json({ queued: rows.length }, { status: 202 })
    }
    const deleted = await deleteLocalBookmarks(ids)
    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('Delete selected bookmarks failed', error)
    return NextResponse.json({ error: '删除失败，请重试。' }, { status: 500 })
  }
}
