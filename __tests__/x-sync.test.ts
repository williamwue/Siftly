import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { openQueue, enqueue, claimWorker, recoverStale } from '@/lib/x-sync-queue'

const directory = mkdtempSync(path.join(tmpdir(), 'siftly-x-sync-'))
const oldUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = `file:${directory}/test.db`
const db = openQueue()
db.exec(`CREATE TABLE Bookmark (id TEXT PRIMARY KEY, tweetId TEXT);
CREATE TABLE BookmarkCategory (bookmarkId TEXT, categoryId TEXT);
CREATE TABLE MediaItem (id TEXT PRIMARY KEY, bookmarkId TEXT);
CREATE VIRTUAL TABLE bookmark_fts USING fts5(bookmark_id UNINDEXED, text);
INSERT INTO Bookmark VALUES ('ok','100'), ('fail','200'), ('keep','300');
INSERT INTO MediaItem VALUES ('ok-media','ok'), ('fail-media','fail');
INSERT INTO BookmarkCategory VALUES ('ok','shared'),('fail','shared');
INSERT INTO bookmark_fts VALUES ('ok','alpha'),('fail','beta');`)
afterAll(() => { db.close(); if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; rmSync(directory, { recursive: true }) })
test('queue deduplicates requests and only one worker can hold the lease', () => {
  enqueue(db, [{ id: 'ok', tweetId: '100' }, { id: 'fail', tweetId: '200' }], 'test_account')
  enqueue(db, [{ id: 'ok', tweetId: '100' }], 'test_account')
  expect(db.prepare('SELECT count(*) AS n FROM XBookmarkRemoval').get()).toEqual({ n: 2 })
  expect(claimWorker(db, 'one')).toBe(true)
  expect(claimWorker(db, 'two')).toBe(false)
  db.prepare('DELETE FROM XBookmarkWorker').run()
})
test('worker deletes locally only on verified success, preserves failed data, retries idempotently', () => {
  const fake = path.join(directory, 'fake-ego')
  writeFileSync(fake, `#!/usr/bin/env node
process.stdin.resume();process.stdin.on('end',()=>{for(const job of JSON.parse(process.env.SIFTLY_X_JOBS)) console.log('SIFTLY_RESULT '+JSON.stringify({id:job.id,ok:job.tweetId==='100'||process.env.TEST_RETRY==='1',error:'account mismatch'}));});`)
  chmodSync(fake, 0o755)
  const run = (retry = false) => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/x-sync-worker.ts'], { cwd: process.cwd(), env: { ...process.env, SIFTLY_EGO_BINARY: fake, TEST_RETRY: retry ? '1' : '0' }, timeout: 20000 })
  run()
  expect(db.prepare('SELECT id FROM Bookmark ORDER BY id').all()).toEqual([{ id: 'fail' }, { id: 'keep' }])
  expect(db.prepare('SELECT bookmarkId FROM MediaItem').all()).toEqual([{ bookmarkId: 'fail' }])
  expect(db.prepare('SELECT bookmark_id FROM bookmark_fts').all()).toEqual([{ bookmark_id: 'fail' }])
  expect(db.prepare('SELECT status FROM XBookmarkRemoval ORDER BY tweetId').all()).toEqual([{ status: 'done' }, { status: 'failed' }])
  enqueue(db, [{ id: 'fail', tweetId: '200' }], 'test_account')
  run(true)
  expect(db.prepare('SELECT id FROM Bookmark').all()).toEqual([{ id: 'keep' }])
  expect(db.prepare('SELECT count(*) AS n FROM DeletedBookmark').get()).toEqual({ n: 2 })
})
test('stale running tasks become failures instead of unconfirmed local deletion', () => {
  enqueue(db, [{ id: 'keep', tweetId: '300' }], 'test_account')
  db.exec("UPDATE XBookmarkRemoval SET status='running' WHERE bookmarkId='keep'")
  db.prepare('INSERT INTO XBookmarkWorker VALUES (1, ?, ?)').run('dead', Date.now() - 100000)
  recoverStale(db)
  expect(db.prepare("SELECT status FROM XBookmarkRemoval WHERE bookmarkId='keep'").get()).toEqual({ status: 'failed' })
  expect(db.prepare('SELECT id FROM Bookmark').all()).toEqual([{ id: 'keep' }])
})
