import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
export function harness(port, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'a2ui-lab-test-'))
  const binary = join(directory, 'a2ui-lab')
  copyFileSync(resolve(root, 'bin/a2ui-lab'), binary)
  const origin = `http://127.0.0.1:${port}`
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('APP_'))),
    APP_ENV: 'test',
    APP_ENV_FILE: '-',
    APP_ADDR: `127.0.0.1:${port}`,
    APP_ORIGIN: origin,
    APP_DATA_DIR: directory,
    ...overrides,
  }
  let child
  function command(args, input) {
    const result = spawnSync(binary, args, {
      env,
      input,
      encoding: 'utf8',
      cwd: directory,
    })
    if (result.status !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr}`)
    return result.stdout
  }
  async function start() {
    child = spawn(binary, ['serve'], {
      env,
      cwd: directory,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let logs = ''
    let spawnError
    child.stderr.on('data', (chunk) => {
      logs += chunk
    })
    child.on('error', (error) => {
      spawnError = error
    })
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null) throw new Error(logs)
      try {
        if (logs.includes('"msg":"server ready"') && (await fetch(`${origin}/readyz`)).ok) return
      } catch {}
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`Server did not become ready: ${logs}`)
  }
  async function stop() {
    if (!child || child.exitCode !== null) return
    const current = child
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        current.kill('SIGKILL')
        reject(new Error('Graceful shutdown timed out'))
      }, 12000)
      current.once('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0) reject(new Error(`Server exited ${code}`))
        else resolve()
      })
      current.kill('SIGTERM')
    })
    child = undefined
  }
  async function cleanup() {
    try {
      await stop()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  return { directory, origin, command, start, stop, cleanup }
}
