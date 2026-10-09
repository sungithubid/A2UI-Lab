import assert from 'node:assert/strict'
import { harness, password } from './harness.mjs'
const h = harness(4189)
let cookie = '',
  csrf = ''
async function request(path, method = 'GET', body) {
  const response = await fetch(h.origin + path, {
    method,
    headers: {
      Origin: h.origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`)
  return response
}
try {
  // First boot initializes a truly empty directory.
  await h.start()
  await request('/healthz')
  await h.stop()
  h.admin('smoke@example.test', 'Smoke workspace')
  await h.start()
  const login = await request('/api/auth/login', 'POST', {
    email: 'smoke@example.test',
    password,
  })
  cookie = login.headers.get('set-cookie').split(';')[0]
  csrf = (await login.json()).csrf_token
  const ws = (await (await request('/api/workspaces')).json()).items[0]
  const path = `/api/workspaces/${ws.id}/notes`
  const note = await (
    await request(path, 'POST', {
      title: 'Survives restart',
      content: 'Persisted in a real SQLite file',
    })
  ).json()
  const index = await request('/notes')
  assert.match(await index.text(), /<div id="root">/)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  assert.equal((await fetch(h.origin + '/api/missing')).status, 404)
  h.command(['backup', 'create', '--output', h.directory + '/backup.db'])
  await h.stop()
  await h.start()
  const restored = await (await request(path + '/' + note.id)).json()
  assert.equal(restored.content, note.content)
  assert.equal(restored.title, note.title)
  await request(path + '/' + note.id, 'DELETE')
  h.command(['doctor'])
  await h.stop()
  console.log(
    'PASS binary smoke: fresh boot, CLI admin, auth, Notes, SPA, backup, graceful restart, persistence, doctor',
  )
} finally {
  await h.cleanup()
}
