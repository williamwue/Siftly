// Executed inside ego-browser nodejs. Inputs contain only IDs and the expected account.
const jobs = JSON.parse(process.env.SIFTLY_X_JOBS || '[]')
const task = await taskSpace('Siftly: cancel X bookmarks')
const page = task.page('p1')
let relinquished = false
function emit(job, ok, error) {
  console.log('SIFTLY_RESULT ' + JSON.stringify({ id: job.id, ok, error }))
}
async function observe(job) {
  await page.waitForFunction(({ tweetId }) => {
    const target = [...document.querySelectorAll('article')].find(a =>
      [...a.querySelectorAll('a time')].some(time => new RegExp('/status/' + tweetId + '$').test(time.closest('a')?.getAttribute('href') || '')))
    return target?.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]') ||
      /不存在|被冻结|不可用|doesn.t exist|suspended|unavailable|Log in to X|登录 X/.test(document.querySelector('main')?.innerText || '')
  }, { tweetId: job.tweetId }, { timeout: 20000 })
  return page.evaluate(({ tweetId }) => {
    const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.replace(/^\//, '')
    const target = [...document.querySelectorAll('article')].find(a =>
      [...a.querySelectorAll('a time')].some(time => new RegExp('/status/' + tweetId + '$').test(time.closest('a')?.getAttribute('href') || '')))
    document.querySelectorAll('[data-siftly-target]').forEach(a => a.removeAttribute('data-siftly-target'))
    target?.setAttribute('data-siftly-target', tweetId)
    return { profile, saved: !!target?.querySelector('[data-testid="removeBookmark"]'), unsaved: !!target?.querySelector('[data-testid="bookmark"]') }
  }, { tweetId: job.tweetId })
}
try {
  for (const job of jobs) {
    try {
      if (!/^\d+$/.test(job.tweetId)) throw new Error('无效推文 ID')
      await page.goto('https://x.com/i/status/' + job.tweetId)
      const before = await observe(job)
      if (before.profile?.toLowerCase() !== job.account.toLowerCase()) throw new Error('X 登录账号不匹配或未登录；请在 Ego 中登录 @' + job.account)
      if (!before.saved && !before.unsaved) throw new Error('无法确认原帖的收藏状态，保留本地记录。')
      if (before.saved) {
        await page.click(`[data-siftly-target="${job.tweetId}"] [data-testid="removeBookmark"]`, { label: '取消这条 X 收藏' })
        await page.waitForSelector(`[data-siftly-target="${job.tweetId}"] [data-testid="bookmark"]`, { state: 'visible', timeout: 15000 })
      }
      // A full reload verifies the persisted state, not only X's optimistic UI.
      await page.reload()
      const after = await observe(job)
      if (after.profile?.toLowerCase() !== job.account.toLowerCase() || !after.unsaved || after.saved) throw new Error('X 尚未确认取消收藏，请重试。')
      emit(job, true)
    } catch (error) {
      const message = String(error)
      emit(job, false, message.slice(0, 400))
      if (/control|inactive|unassigned|ownership|user.*took|用户.*接管/i.test(message)) {
        relinquished = true
        break
      }
      // Stop this batch on the first unexpected state; no repeated blind actions.
      break
    }
  }
} finally {
  if (!relinquished) await task.finish({ keep: [] })
}
