import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
// Native Node loading keeps shell variables ahead of the .env file. Use literal
// values (no shell interpolation) so the development and Go loaders agree.
const requestedFile = process.env.APP_ENV_FILE
if (requestedFile !== '-') {
  try {
    loadEnvFile(requestedFile || '.env')
  } catch (error) {
    if (requestedFile || error.code !== 'ENOENT') throw error
  }
}
// A file must not redirect configuration loading via its own APP_ENV_FILE entry.
if (requestedFile === undefined) delete process.env.APP_ENV_FILE
else process.env.APP_ENV_FILE = requestedFile
const directory = process.env.APP_DATA_DIR || resolve('.data')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const env = {
  ...process.env,
  APP_ENV: 'development',
  APP_DATA_DIR: directory,
  APP_ADDR: '127.0.0.1:8080',
  APP_ORIGIN: 'http://localhost:5173',
  APP_COOKIE_SECURE: 'false',
}
const children = [
  spawn(resolve('bin/myapp-dev'), ['serve'], { env, stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '--prefix', 'web'], { env, stdio: 'inherit' }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
for (const child of children) {
  child.on('error', (err) => {
    console.error(err)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0)
  })
}
console.log(
  'Open http://localhost:5173 or http://127.0.0.1:5173. Go changes: restart make dev; React changes: HMR.',
)
