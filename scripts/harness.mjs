import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
export const password = 'test password 12345'
export function harness(port, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'monoseed-test-'))
  const binary = join(directory, 'myapp')
  copyFileSync(resolve(root, 'bin/myapp'), binary)
  const origin = `http://127.0.0.1:${port}`
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('APP_'))),
    APP_ENV: 'test',
    APP_ENV_FILE: '-',
    APP_ADDR: `127.0.0.1:${port}`,
    APP_ORIGIN: origin,
    APP_DATA_DIR: directory,
    APP_COOKIE_SECURE: 'false',
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
  function admin(email, workspace) {
    return command(
      ['admin', 'create', '--email', email, '--workspace', workspace, '--password-stdin'],
      password + '\n',
    )
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
  return { directory, origin, command, admin, start, stop, cleanup }
}
