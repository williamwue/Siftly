import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

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
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.bookmarkCategory.deleteMany({ where: { bookmarkId: { in: ids } } })
      await tx.mediaItem.deleteMany({ where: { bookmarkId: { in: ids } } })
      const result = await tx.bookmark.deleteMany({ where: { id: { in: ids } } })
      const tables = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE name = 'bookmark_fts'`
      if (tables.length) {
        for (const id of ids) await tx.$executeRaw`DELETE FROM bookmark_fts WHERE bookmark_id = ${id}`
      }
      return result.count
    })
    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('Delete selected bookmarks failed', error)
    return NextResponse.json({ error: '删除失败，请重试。' }, { status: 500 })
  }
}
