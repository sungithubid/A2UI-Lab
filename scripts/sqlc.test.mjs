import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
test('sqlc checks detect drift without rewriting artifacts and generation repairs file sets', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'a2ui-lab-sqlc-test-'))
  try {
    for (const path of [
      'sqlc.yaml',
      'scripts/sqlc.mjs',
      'tools/sqlc',
      'internal/platform/database/migrations',
    ])
      cpSync(join(root, path), join(fixture, path), { recursive: true })
    for (const module of ['lab']) {
      for (const path of ['queries.sql', 'dbgen'])
        cpSync(
          join(root, 'internal/modules', module, path),
          join(fixture, 'internal/modules', module, path),
          { recursive: true },
        )
    }
    const generated = join(fixture, 'internal/modules/lab/dbgen')
    const snapshot = () =>
      readdirSync(generated)
        .sort()
        .map((name) => [name, readFileSync(join(generated, name))])
    const run = (check = true) =>
      spawnSync(
        process.execPath,
        [join(fixture, 'scripts/sqlc.mjs'), ...(check ? ['--check'] : [])],
        { encoding: 'utf8' },
      )
    assert.equal(run().status, 0)
    const file = join(generated, 'models.go')
    const original = readFileSync(file)
    writeFileSync(file, Buffer.concat([original, Buffer.from('\n// drift fixture\n')]))
    const changed = snapshot()
    const drift = run()
    assert.notEqual(drift.status, 0)
    assert.match(drift.stderr, /Generated SQL is stale/)
    assert.deepEqual(snapshot(), changed)
    writeFileSync(file, original)
    rmSync(file)
    const missing = snapshot()
    assert.notEqual(run().status, 0)
    assert.deepEqual(snapshot(), missing)
    writeFileSync(file, original)
    writeFileSync(join(generated, 'obsolete.go'), '// obsolete generated fixture\n')
    const extra = snapshot()
    assert.notEqual(run().status, 0)
    assert.deepEqual(snapshot(), extra)
    assert.equal(run(false).status, 0)
    assert.equal(run().status, 0)
    const query = join(fixture, 'internal/modules/lab/queries.sql')
    writeFileSync(
      query,
      readFileSync(query, 'utf8') +
        '\n-- name: InvalidFixture :one\nSELECT nonexistent_column FROM runs;\n',
    )
    const beforeFailure = snapshot()
    const invalid = run(false)
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /sqlc generation failed/)
    assert.deepEqual(snapshot(), beforeFailure)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
