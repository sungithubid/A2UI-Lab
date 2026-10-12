import { test, expect } from '../../web/e2e-fixtures'

test('stop preserves partial output, repeated stop adds no events and replay is read-only', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('streaming-text')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.locator('.agent-bubble .markdown')).toBeVisible()
  await page.getByRole('button', { name: 'Stop run', exact: true }).click()
  await expect(
    page.getByText('This turn was interrupted. Its partial output is preserved.', { exact: true }),
  ).toBeVisible()
  const id = await page.getByLabel('Run history').inputValue()
  const before = await (await page.request.get(`/api/runs/${id}/events`)).json()
  expect(
    before.items.filter((e: { kind: string }) => e.kind === 'runtime.stop_requested'),
  ).toHaveLength(1)
  const text = await page.locator('.agent-bubble .markdown').innerText()
  expect(text.length).toBeGreaterThan(0)
  expect(
    (
      await page.request.post(`/api/runs/${id}/stop`, {
        headers: { 'Content-Type': 'application/json' },
      })
    ).ok(),
  ).toBe(true)
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
  await page.reload()
  await page.getByLabel('Run history').selectOption(id)
  await expect(page.locator('.agent-bubble .markdown')).toHaveText(text, { useInnerText: true })
  await page.getByText('Learning lab · event flow & resilience exercises', { exact: true }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stop run', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Disconnect SSE', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(
    page.getByText('This turn was interrupted. Its partial output is preserved.', { exact: true }),
  ).toBeVisible({ timeout: 15000 })
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
})

test('manual SSE reconnect catches up with a running Agent using the saved cursor', async ({
  page,
}) => {
  const streamURLs: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/stream?after=')) streamURLs.push(request.url())
  })
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('streaming-text')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.locator('.agent-bubble .markdown')).toBeVisible()
  await page.getByText('Learning lab · event flow & resilience exercises', { exact: true }).click()
  await page.getByRole('button', { name: 'Disconnect SSE', exact: true }).click()
  await expect(page.getByText('Disconnected · Agent keeps running', { exact: true })).toBeVisible()
  const id = await page.getByLabel('Run history').inputValue()
  await expect
    .poll(async () => (await (await page.request.get(`/api/runs/${id}`)).json()).status)
    .toBe('completed')
  await expect(page.getByLabel('Follow-up message')).toBeDisabled()
  await page.getByRole('button', { name: 'Reconnect SSE', exact: true }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  expect(Number(new URL(streamURLs.at(-1)!).searchParams.get('after'))).toBeGreaterThan(0)
  const saved = await (await page.request.get(`/api/runs/${id}/events`)).json()
  await expect(page.locator('.timeline tbody tr')).toHaveCount(saved.items.length)
  await expect(page.locator('.agent-bubble')).toContainText('Hello, hybrid chat')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('learning checkpoints inspect payloads and an exact Action retry appends nothing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1050 })
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('plan-decision')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await page.getByRole('button', { name: /Incremental migration/ }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  const id = await page.getByLabel('Run history').inputValue()
  const before = await (await page.request.get(`/api/runs/${id}/events`)).json()
  await page.getByText('Learning lab · event flow & resilience exercises', { exact: true }).click()
  const learning = page.locator('.learning-panel')
  await learning.getByRole('button', { name: 'decision.required', exact: true }).click()
  await expect(page.getByTestId('raw-json')).toContainText('"incremental"')
  await learning.getByRole('button', { name: 'Retry last Action', exact: true }).click()
  await expect(learning.getByRole('status')).toContainText('event sequence unchanged')
  await page.screenshot({ path: test.info().outputPath('learning-lab.png'), fullPage: true })
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
  const last = before.items.find((e: { kind: string }) => e.kind === 'action.received').payload
  const conflict = await page.request.post(`/api/runs/${id}/actions`, {
    data: { ...last, data: { choiceId: 'rebuild' } },
  })
  expect(conflict.status()).toBe(409)
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(
    learning.getByRole('button', { name: 'Retry last Action', exact: true }),
  ).toBeDisabled()
})

test('partial stream failure preserves Markdown and its alert across reload and replay', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('stream-error')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'run.failed', exact: true })).toBeVisible()
  await expect(page.locator('.agent-bubble .markdown')).toContainText('the next part never arrives')
  await expect(page.locator('.renderer-panel').getByRole('alert')).toContainText(
    'Simulated upstream stream failure',
  )
  const id = await page.getByLabel('Run history').inputValue()
  const before = await (await page.request.get(`/api/runs/${id}/events`)).json()
  await page.reload()
  await page.getByLabel('Run history').selectOption(id)
  await expect(
    page.getByText('This turn failed. Its partial output is preserved.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.renderer-panel').getByRole('alert')).toContainText(
    'Simulated upstream stream failure',
    { timeout: 15000 },
  )
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
  await page.getByRole('button', { name: 'Live', exact: true }).click()
  await page.getByLabel('Follow-up message').fill('What failed?')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Run history')).not.toHaveValue(id)
  await expect(page.getByTestId('trace-input')).toContainText('mock_stream_disconnected')
})
