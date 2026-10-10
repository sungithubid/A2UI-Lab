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
  const followup = await (
    await request('/api/runs', 'POST', {
      prompt: 'Summarize the previous result',
      scenarioId: 'streaming-text',
      conversationId: run.conversationId,
      parentRunId: run.id,
    })
  ).json()
  for (let i = 0; i < 200; i++) {
    if ((await (await request(`/api/runs/${followup.id}`)).json()).status === 'completed') break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal((await (await request(`/api/runs/${followup.id}`)).json()).status, 'completed')
  const followupEvents = await (await request(`/api/runs/${followup.id}/events`)).json()
  const followupRequest = followupEvents.items.find((e) => e.kind === 'model.request').payload
  assert.equal(followupRequest.request.messages[1].content, 'Analyze server health')
  assert.equal(followupRequest.externalCall, false)
  const index = await request('/')
  assert.match(await index.text(), /<div id="root">/)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  assert.equal((await fetch(h.origin + '/api/missing')).status, 404)
  const pending = await (
    await request('/api/runs', 'POST', {
      prompt: 'Open a support ticket',
      scenarioId: 'support-form',
    })
  ).json()
  for (let i = 0; i < 100; i++) {
    if ((await (await request(`/api/runs/${pending.id}`)).json()).status === 'waiting_input') break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal((await (await request(`/api/runs/${pending.id}`)).json()).status, 'waiting_input')
  h.command(['backup', 'create', '--output', h.directory + '/backup.db'])
  await h.stop()
  await h.start()
  assert.deepEqual(await (await request(base + '/events')).json(), events)
  assert.deepEqual(await (await request(`/api/runs/${followup.id}/events`)).json(), followupEvents)
  const conversation = await (await request(`/api/runs/${followup.id}/conversation`)).json()
  assert.deepEqual(
    conversation.items.map((r) => r.id),
    [run.id, followup.id],
  )
  const restored = await (await request(`/api/runs/${pending.id}`)).json()
  assert.equal(restored.status, 'waiting_input')
  assert.equal(restored.finishedAt, '')
  const submitted = await (
    await request(`/api/runs/${pending.id}/actions`, 'POST', {
      version: 1,
      runId: pending.id,
      surfaceId: 'main',
      componentId: 'ticket-form',
      category: 'tool',
      action: 'submit_ticket',
      data: {
        name: 'Smoke',
        email: 'smoke@example.test',
        summary: 'Restart recovery',
        priority: 'normal',
      },
    })
  ).json()
  assert.equal(submitted.status, 'completed')
  assert.ok(
    (await (await request(`/api/runs/${pending.id}/events`)).json()).items.some(
      (e) => e.kind === 'ticket.created',
    ),
  )
  await request(base, 'DELETE')
  h.command(['doctor'])
  await h.stop()
  console.log(
    'PASS binary smoke: fresh boot, Mock run, events, actions, SPA, backup, restart, deterministic persisted replay, pending form restored and submitted, multi-turn context and trace restored, delete, doctor',
  )
} finally {
  await h.cleanup()
}
