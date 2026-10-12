import { test, expect } from '../../web/e2e-fixtures'

test('thinking streams, auto-collapses, can be hidden and restores without changing saved events', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1050 })
  await page.goto('/')
  const mode = page.getByRole('switch', { name: 'Deep thinking for new run' })
  await expect(mode).toHaveAttribute('aria-checked', 'false')
  await mode.click()
  const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/runs'))
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  expect((await request).postDataJSON().deepThinking).toBe(true)
  const panel = page.getByRole('region', { name: 'Thinking summary' })
  await expect(panel).toHaveAttribute('data-status', 'streaming')
  await expect(panel.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  await expect(panel).toHaveAttribute('data-status', 'completed')
  await expect(panel.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await panel.getByRole('button').click()
  await expect(panel).toContainText('Mock planning summary')
  await expect(page.locator('.agent-bubble > .markdown').last()).toContainText(
    'The server is healthy',
  )
  const id = await page.getByLabel('Run history').inputValue()
  const saved = await (await page.request.get(`/api/runs/${id}/events`)).json()
  await page.getByRole('checkbox', { name: 'Show thinking for turn 1' }).uncheck()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.agent-bubble > .markdown').last()).toBeVisible()
  await page.getByRole('checkbox', { name: 'Show thinking for turn 1' }).check()
  await panel.getByRole('button').click()
  await page.getByRole('button', { name: /Thinking · Mock summary/ }).click()
  await expect(page.getByTestId('trace-output')).toContainText('"status": "completed"')
  await expect(page.getByTestId('trace-output')).toContainText('Mock planning summary')
  await page.screenshot({ path: test.info().outputPath('thinking-summary.png'), fullPage: true })
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(saved)
  await page.reload()
  await page.getByLabel('Run history').selectOption(id)
  await expect(panel).toHaveAttribute('data-status', 'completed')
  await expect(panel.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.getByRole('button').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(saved)
})

test('each turn records its thinking option while reasoning stays out of next-turn history', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('plan-decision')
  await page.getByRole('switch', { name: 'Deep thinking for new run' }).click()
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await page.getByRole('button', { name: /Incremental migration/ }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  const first = await page.getByLabel('Run history').inputValue()
  await page.getByRole('switch', { name: 'Deep thinking for next turn' }).click()
  await page.getByLabel('Follow-up message').fill('Continue with the confirmed plan')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Run history')).not.toHaveValue(first)
  await expect(page.getByLabel('Follow-up message')).toBeEnabled({ timeout: 20000 })
  const second = await page.getByLabel('Run history').inputValue()
  await expect(
    page.locator('.chat-turn').last().getByRole('region', { name: 'Thinking summary' }),
  ).toHaveCount(0)
  await expect(
    page.locator('.chat-turn').first().getByRole('region', { name: 'Thinking summary' }),
  ).toHaveCount(1)
  const events = await (await page.request.get(`/api/runs/${second}/events`)).json()
  expect(events.items.some((e: { kind: string }) => e.kind.startsWith('model.reasoning_'))).toBe(
    false,
  )
  const req = events.items.find((e: { kind: string }) => e.kind === 'model.request').payload.request
  expect(req.deepThinking).toBe(false)
  expect(JSON.stringify(req.messages)).not.toContain('Mock planning summary')
  expect(JSON.stringify(req.uiContext)).not.toContain('Mock planning summary')
  expect(JSON.stringify(req.uiContext)).toContain('Incremental migration')
  await page.getByRole('switch', { name: 'Deep thinking for next turn' }).click()
  await page.getByLabel('Follow-up message').fill('Show the next step with a thinking summary')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Run history')).not.toHaveValue(second)
  await expect(
    page.locator('.chat-turn').last().getByRole('region', { name: 'Thinking summary' }),
  ).toBeVisible()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled({ timeout: 20000 })
})

test('stopping during thinking preserves its partial summary and replay does not call the Agent', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('streaming-text')
  await page.getByRole('switch', { name: 'Deep thinking for new run' }).click()
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Thinking summary' })
  await expect(panel.locator('.markdown')).toBeVisible()
  await page.getByRole('button', { name: 'Stop run', exact: true }).click()
  await expect(panel).toHaveAttribute('data-status', 'interrupted')
  const id = await page.getByLabel('Run history').inputValue()
  const before = await (await page.request.get(`/api/runs/${id}/events`)).json()
  expect(before.items.some((e: { kind: string }) => e.kind === 'model.reasoning_completed')).toBe(
    false,
  )
  expect(before.items.some((e: { kind: string }) => e.kind === 'model.text_delta')).toBe(false)
  expect(before.items.some((e: { kind: string }) => e.kind === 'a2ui.message')).toBe(false)
  const response = before.items.find((e: { kind: string }) => e.kind === 'model.response').payload
  expect(response.outputCharacters).toBe(0)
  expect(response.reasoningCharacters).toBeGreaterThan(0)
  await page.getByRole('button', { name: /Thinking · Mock summary/ }).click()
  await expect(page.getByTestId('trace-output')).toContainText('"status": "interrupted"')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(panel).toHaveAttribute('data-status', 'interrupted', { timeout: 15000 })
  expect(await (await page.request.get(`/api/runs/${id}/events`)).json()).toEqual(before)
  await expect(page.getByRole('switch', { name: 'Deep thinking for next turn' })).toBeDisabled()
  await page.getByRole('button', { name: 'Live', exact: true }).click()
  await page.reload()
  await page.getByLabel('Run history').selectOption(id)
  await expect(panel).toHaveAttribute('data-status', 'interrupted')
})
