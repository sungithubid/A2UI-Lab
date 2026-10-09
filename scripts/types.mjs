import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
const check = process.argv.includes('--check')
const paths = ['docs/openapi.json', 'web/src/generated/api.ts']
const before = check ? paths.map((p) => readFileSync(p, 'utf8')) : []
try {
  const schema = spawnSync('go', ['run', './cmd/app', 'openapi'], {
    encoding: 'utf8',
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('APP_'))),
      APP_ENV_FILE: '-',
    },
  })
  if (schema.status !== 0) throw new Error(schema.stderr)
  writeFileSync(paths[0], JSON.stringify(JSON.parse(schema.stdout), null, 2) + '\n')
  const types = spawnSync('npm', ['run', 'types', '--prefix', 'web'], {
    stdio: 'inherit',
  })
  if (types.status !== 0) throw new Error('Type generation failed')
  if (check && paths.some((p, i) => readFileSync(p, 'utf8') !== before[i]))
    throw new Error(
      'Generated API types are stale. Run make types and include both generated files.',
    )
  console.log(
    check
      ? 'API schema and TypeScript types are in sync'
      : 'API schema and TypeScript types generated',
  )
} finally {
  if (check) paths.forEach((p, i) => writeFileSync(p, before[i]))
}
