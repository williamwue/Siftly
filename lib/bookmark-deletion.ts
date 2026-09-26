import prisma from '@/lib/db'

export async function deleteLocalBookmarks(ids: string[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.bookmark.findMany({ where: { id: { in: ids } }, select: { tweetId: true } })
    await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS DeletedBookmark (tweetId TEXT PRIMARY KEY, deletedAt TEXT NOT NULL)')
    for (const row of rows) await tx.$executeRaw`INSERT OR REPLACE INTO DeletedBookmark VALUES (${row.tweetId}, ${new Date().toISOString()})`
    await tx.bookmarkCategory.deleteMany({ where: { bookmarkId: { in: ids } } })
    await tx.mediaItem.deleteMany({ where: { bookmarkId: { in: ids } } })
    const result = await tx.bookmark.deleteMany({ where: { id: { in: ids } } })
    const tables = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE name = 'bookmark_fts'`
    if (tables.length) for (const id of ids) await tx.$executeRaw`DELETE FROM bookmark_fts WHERE bookmark_id = ${id}`
    const queue = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE name = 'XBookmarkRemoval'`
    if (queue.length) for (const id of ids) await tx.$executeRaw`DELETE FROM XBookmarkRemoval WHERE bookmarkId = ${id} AND status IN ('pending', 'failed')`
    return result.count
  })
}

export async function wasDeleted(tweetId: string) {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS DeletedBookmark (tweetId TEXT PRIMARY KEY, deletedAt TEXT NOT NULL)')
  const rows = await prisma.$queryRaw<Array<{ tweetId: string }>>`SELECT tweetId FROM DeletedBookmark WHERE tweetId = ${tweetId}`
  return rows.length > 0
}
