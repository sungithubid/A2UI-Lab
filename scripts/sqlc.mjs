import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const temp = mkdtempSync(join(tmpdir(), 'monoseed-sqlc-'))
const outputs = []
function files(directory, prefix = '') {
  if (!existsSync(directory)) return new Map()
  const result = new Map()
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name)
    if (entry.isDirectory()) {
      for (const [key, value] of files(join(directory, entry.name), name)) result.set(key, value)
    } else result.set(name, readFileSync(join(directory, entry.name)))
  }
  return result
}
try {
  // Generate into a temporary tree: --check never rewrites checked-in artifacts.
  const config = readFileSync(join(root, 'sqlc.yaml'), 'utf8').replace(
    /^(\s*)(schema|queries|out): (.+)$/gm,
    (_, indent, key, value) => {
      const source = resolve(root, value)
      if (key !== 'out') return `${indent}${key}: ${JSON.stringify(relative(temp, source))}`
      const path = relative(root, source).split(sep).join('/')
      if (isAbsolute(path) || !/^internal\/modules\/[^/]+\/dbgen$/.test(path))
        throw new Error(`Unexpected generated output: ${value}`)
      const generated = join(temp, path)
      outputs.push({ source, generated })
      return `${indent}${key}: ${JSON.stringify(relative(temp, generated))}`
    },
  )
  if (!outputs.length) throw new Error('No sqlc output directories configured')
  const configPath = join(temp, 'sqlc.yaml')
  writeFileSync(configPath, config)
  const result = spawnSync('go', ['tool', 'sqlc', 'generate', '-f', configPath], {
    cwd: join(root, 'tools/sqlc'),
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error('sqlc generation failed')
  for (const { source, generated } of outputs) {
    if (check) {
      const expected = files(generated)
      const actual = files(source)
      if (
        expected.size !== actual.size ||
        [...expected].some(([path, content]) => !actual.get(path)?.equals(content))
      )
        throw new Error(`Generated SQL is stale in ${relative(root, source)}. Run make sqlc.`)
    } else {
      rmSync(source, { recursive: true, force: true })
      cpSync(generated, source, { recursive: true })
    }
  }
  console.log(check ? 'SQL queries and generated Go code are in sync' : 'SQL Go code generated')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
