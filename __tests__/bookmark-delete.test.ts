import { afterAll, beforeAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { NextRequest } from 'next/server'

const directory = mkdtempSync(path.join(tmpdir(), 'siftly-delete-'))
const filename = path.join(directory, 'test.db')
const database = new Database(filename)
const previous = process.env.DATABASE_URL
let post: typeof import('@/app/api/bookmarks/delete/route').POST
beforeAll(async () => {
  database.exec(`
    CREATE TABLE Bookmark (id TEXT PRIMARY KEY);
    CREATE TABLE Category (id TEXT PRIMARY KEY);
    CREATE TABLE BookmarkCategory (bookmarkId TEXT, categoryId TEXT, confidence REAL DEFAULT 1);
    CREATE TABLE MediaItem (id TEXT PRIMARY KEY, bookmarkId TEXT);
    CREATE VIRTUAL TABLE bookmark_fts USING fts5(bookmark_id UNINDEXED, text);
    INSERT INTO Bookmark VALUES ('a'), ('b'), ('keep');
    INSERT INTO Category VALUES ('shared');
    INSERT INTO BookmarkCategory (bookmarkId, categoryId) VALUES ('a','shared'), ('b','shared'), ('keep','shared');
    INSERT INTO MediaItem VALUES ('ma','a'), ('mb','b'), ('mk','keep');
    INSERT INTO bookmark_fts VALUES ('a','alpha'), ('b','beta'), ('keep','keep');
  `)
  process.env.DATABASE_URL = `file:${filename}`
  post = (await import('@/app/api/bookmarks/delete/route')).POST
})
afterAll(async () => {
  await (await import('@/lib/db')).default.$disconnect()
  if (previous === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previous
  database.close()
  rmSync(directory, { recursive: true })
})
function request(body: unknown) {
  return new NextRequest('http://localhost/api/bookmarks/delete', { method: 'POST', body: JSON.stringify(body) })
}
test('rejects empty, malformed and oversized selections without deleting anything', async () => {
  for (const body of [{}, { ids: [] }, { ids: [null] }, { ids: [' '] }, { ids: Array(101).fill('a') }]) {
    expect((await post(request(body))).status).toBe(400)
  }
  expect(database.prepare('SELECT count(*) AS n FROM Bookmark').get()).toEqual({ n: 3 })
})
test('single and bulk deletion remove only selected records, media and search entries', async () => {
  expect(await (await post(request({ ids: ['a'] }))).json()).toEqual({ deleted: 1 })
  expect(await (await post(request({ ids: ['a', 'b', 'b', 'missing'] }))).json()).toEqual({ deleted: 1 })
  expect(await (await post(request({ ids: ['b'] }))).json()).toEqual({ deleted: 0 })
  expect(database.prepare('SELECT id FROM Bookmark').all()).toEqual([{ id: 'keep' }])
  expect(database.prepare('SELECT bookmarkId FROM MediaItem').all()).toEqual([{ bookmarkId: 'keep' }])
  expect(database.prepare('SELECT bookmarkId FROM BookmarkCategory').all()).toEqual([{ bookmarkId: 'keep' }])
  expect(database.prepare('SELECT bookmark_id FROM bookmark_fts').all()).toEqual([{ bookmark_id: 'keep' }])
  expect(database.prepare('SELECT id FROM Category').all()).toEqual([{ id: 'shared' }])
})
test('a failure rolls back related row deletions', async () => {
  database.exec("CREATE TRIGGER prevent_delete BEFORE DELETE ON Bookmark BEGIN SELECT RAISE(ABORT, 'test failure'); END;")
  expect((await post(request({ ids: ['keep'] }))).status).toBe(500)
  expect(database.prepare('SELECT count(*) AS n FROM MediaItem').get()).toEqual({ n: 1 })
  expect(database.prepare('SELECT count(*) AS n FROM BookmarkCategory').get()).toEqual({ n: 1 })
})
