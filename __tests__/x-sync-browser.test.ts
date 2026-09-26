import { expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('scripts/x-sync-browser.mjs', 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
async function run(states: unknown[], clickError?: string) {
  const page = { goto: vi.fn(), reload: vi.fn(), waitForFunction: vi.fn(), waitForSelector: vi.fn(),
    evaluate: vi.fn().mockImplementation(async () => states.shift()),
    click: vi.fn().mockImplementation(async () => { if (clickError) throw new Error(clickError) }) }
  const finish = vi.fn(), log = vi.fn()
  await new AsyncFunction('taskSpace', 'process', 'console', source)(async () => ({ page: () => page, finish }), { env: { SIFTLY_X_JOBS: JSON.stringify([{ id: 'job', tweetId: '123', account: 'expected' }]) } }, { log })
  const result = JSON.parse(log.mock.calls[0][0].replace('SIFTLY_RESULT ', ''))
  return { page, finish, result }
}
test('wrong account never clicks or reports success', async () => {
  const r = await run([{ profile: 'other', saved: true, unsaved: false }])
  expect(r.page.click).not.toHaveBeenCalled(); expect(r.result.ok).toBe(false)
})
test('saved post is cancelled and confirmed after a reload', async () => {
  const r = await run([{ profile: 'expected', saved: true }, { profile: 'expected', unsaved: true }])
  expect(r.page.click).toHaveBeenCalledOnce(); expect(r.page.reload).toHaveBeenCalledOnce(); expect(r.result.ok).toBe(true)
})
test('already unsaved is idempotent, with reload confirmation', async () => {
  const r = await run([{ profile: 'expected', unsaved: true }, { profile: 'expected', unsaved: true }])
  expect(r.page.click).not.toHaveBeenCalled(); expect(r.result.ok).toBe(true)
})
test('optimistic UI change alone never reports success', async () => {
  const r = await run([{ profile: 'expected', saved: true }, { profile: 'expected', saved: true }])
  expect(r.result.ok).toBe(false)
})
test('user control interruption stops without closing the user space', async () => {
  const r = await run([{ profile: 'expected', saved: true }], 'user took control')
  expect(r.result.ok).toBe(false); expect(r.finish).not.toHaveBeenCalled()
})
