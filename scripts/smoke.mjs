import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
const h = harness(4189)
async function request(path, method = 'GET', body) {
  const response = await fetch(h.origin + path, {
    method,
    headers: { Origin: h.origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`)
  return response
}
try {
  await h.start()
  await request('/healthz')
  const run = await (
      await request('/api/runs', 'POST', {
        prompt: 'Analyze server health',
        scenarioId: 'server-health',
      })
    ).json(),
    base = `/api/runs/${run.id}`
  let completed = false
  for (let i = 0; i < 100; i++) {
    const r = await (await request(base)).json()
    if (r.status === 'completed') {
      completed = true
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  assert.ok(completed, 'mock did not complete')
  await request(base + '/actions', 'POST', {
    version: 1,
    runId: run.id,
    surfaceId: 'main',
    componentId: 'view-errors',
    category: 'tool',
    action: 'view_errors',
    data: {},
  })
  const events = await (await request(base + '/events')).json()
  assert.ok(events.items.some((e) => e.kind === 'action.completed'))
  assert.ok(events.items.some((e) => e.kind === 'a2ui.message'))
  const index = await request('/')
  assert.match(await index.text(), /<div id="root">/)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  assert.equal((await fetch(h.origin + '/api/missing')).status, 404)
  h.command(['backup', 'create', '--output', h.directory + '/backup.db'])
  await h.stop()
  await h.start()
  assert.deepEqual(await (await request(base + '/events')).json(), events)
  await request(base, 'DELETE')
  h.command(['doctor'])
  await h.stop()
  console.log(
    'PASS binary smoke: fresh boot, Mock run, events, actions, SPA, backup, restart, deterministic persisted replay, delete, doctor',
  )
} finally {
  await h.cleanup()
}
