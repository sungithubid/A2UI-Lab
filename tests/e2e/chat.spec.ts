import { test, expect } from '../../web/e2e-fixtures'

test('hybrid chat carries server history into the real Mock request and restores all turns', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.setViewportSize({ width: 1800, height: 1050 })
  await page.goto('/')
  await page.getByLabel('Prompt', { exact: true }).fill('Remember the atlas rollout')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  const first = await page.getByLabel('Run history').inputValue()
  const user = await page.locator('.chat-turn .user-bubble').boundingBox()
  const agent = await page.locator('.chat-turn .agent-bubble').boundingBox()
  expect(user!.x).toBeGreaterThan(agent!.x)
  await expect(page.locator('.chat-turn .agent-bubble .surface')).toHaveCount(1)
  await expect(page.getByTestId('trace-input')).toContainText('Remember the atlas rollout')
  await page.getByRole('button', { name: /Tool · get_server_metrics/ }).click()
  await expect(page.getByTestId('trace-output')).toContainText('"cpu": 32')
  await page.getByLabel('Follow-up message').fill('What was my previous question?')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Run history')).not.toHaveValue(first)
  await expect(page.getByLabel('Follow-up message')).toBeEnabled({ timeout: 20000 })
  await expect(page.locator('.chat-turn')).toHaveCount(2)
  const second = await page.getByLabel('Run history').inputValue()
  expect(second).not.toBe(first)
  const current = page.locator('.chat-turn').last()
  await expect(current.getByRole('heading', { name: 'Follow-up context' })).toBeVisible()
  await expect(current.locator('blockquote').first()).toHaveText('Remember the atlas rollout')
  await expect(current.getByRole('table')).toBeVisible()
  await expect(current.locator('pre code')).toContainText('Hello, hybrid chat')
  await expect(current.locator('.surface')).toHaveCount(0)
  await expect(
    page.locator('.chat-turn').first().getByRole('button', { name: 'View errors' }),
  ).toBeDisabled()
  const trace = JSON.parse((await page.getByTestId('trace-input').textContent())!)
  expect(Object.keys(trace)).toEqual(['messages'])
  expect(trace.messages[1]).toEqual({
    role: 'user',
    content: 'Remember the atlas rollout',
  })
  const stored = await (await page.request.get(`/api/runs/${second}/events`)).json()
  expect(trace.messages.at(-1)).toEqual({ role: 'user', content: 'What was my previous question?' })
  expect(trace.messages[2].content).toContain('Recorded UI context')
  expect(trace.messages[2].content).toContain('get_server_metrics')
  for (const message of trace.messages) expect(Object.keys(message)).toEqual(['role', 'content'])
  await page.getByText('Mock runtime / original snapshot', { exact: true }).click()
  const original = JSON.parse((await page.getByTestId('trace-raw-input').textContent())!)
  expect(original.externalCall).toBe(false)
  expect(original.textBuffer.maxWaitMs).toBe(50)
  expect(original.request.messages[1].sourceRunId).toBe(first)
  expect(original).toEqual(
    stored.items.find((e: { kind: string }) => e.kind === 'model.request').payload,
  )
  expect(stored.items.some((e: { kind: string }) => e.kind === 'a2ui.message')).toBe(false)
  await page.getByText('Mock runtime / original snapshot', { exact: true }).click()
  await current.locator('.user-bubble').evaluate((el) => {
    const scroll = el.closest('.chat-scroll')!
    scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12
  })
  await expect(page.getByTestId('trace-output')).toContainText('"status": "completed"')
  await page.locator('.trace-detail').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.screenshot({ path: test.info().outputPath('multi-turn-chat.png'), fullPage: true })
  await page.reload()
  await page.getByLabel('Run history').selectOption(second)
  await expect(page.locator('.chat-turn')).toHaveCount(2)
  await expect(page.getByTestId('trace-input')).toHaveText(JSON.stringify(trace, null, 2))
  await page.getByRole('button', { name: 'Inspect turn 1', exact: true }).click()
  await expect(page.getByLabel('Run history')).toHaveValue(first)
  await expect(page.getByRole('button', { name: 'View errors' })).toBeDisabled()
  await page.getByRole('button', { name: 'Return to latest turn to continue →' }).click()
  await expect(page.getByLabel('Run history')).toHaveValue(second)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Follow-up message')).toBeDisabled()
  await expect(
    page.locator('.chat-turn').last().getByRole('heading', { name: 'Follow-up context' }),
  ).toHaveCount(0)
  await expect(page.getByTestId('trace-input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Live', exact: true }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(failures).toEqual([])
})

test('pending forms block continuation; submitted contact fields stay out of next request', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('support-form')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByText('Waiting for your input', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Follow-up message')).toBeDisabled()
  await page.getByLabel('Your name *').fill('Private Person')
  await page.getByLabel('Email *').fill('private@example.test')
  await page.getByLabel('Issue summary *').fill('Private issue description')
  await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
  await expect(page.getByLabel('Follow-up message')).toBeEnabled()
  await page.getByLabel('Follow-up message').fill('Summarize the outcome')
  const first = await page.getByLabel('Run history').inputValue()
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByLabel('Run history')).not.toHaveValue(first)
  await expect(page.getByLabel('Follow-up message')).toBeEnabled({ timeout: 20000 })
  await expect(page.locator('.chat-turn')).toHaveCount(2)
  const trace = await page.getByTestId('trace-input').textContent()
  const raw = await page.getByTestId('trace-raw-input').textContent()
  expect(trace).toContain('Support ticket created locally')
  for (const privateValue of [
    'Private Person',
    'private@example.test',
    'Private issue description',
  ]) {
    expect(trace).not.toContain(privateValue)
    expect(raw).not.toContain(privateValue)
  }
  await expect(page.locator('.chat-turn').first().getByLabel('Email *')).toHaveValue(
    'private@example.test',
  )
  await expect(page.locator('.chat-turn').first().getByLabel('Email *')).toBeDisabled()
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByTestId('trace-input')).not.toContainText('Support ticket created locally')
  await expect(page.locator('.chat-turn')).toHaveCount(1)
  const isolated = JSON.parse((await page.getByTestId('trace-input').textContent())!)
  expect(isolated.messages).toHaveLength(2)
  expect(isolated.messages.some((m: { sourceRunId?: string }) => m.sourceRunId)).toBe(false)
})
