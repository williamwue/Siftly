import { spawn } from 'node:child_process'
import path from 'node:path'
// The database lease in the worker serializes execution across requests/processes.
export function startXSync() {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'scripts/x-sync-worker.ts')], {
    cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore',
  })
  child.on('error', () => { /* Pending tasks remain visible and can be retried. */ })
  child.unref()
}
