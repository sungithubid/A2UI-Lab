import { test, expect } from '../../web/e2e-fixtures'

for (const selection of ['incremental', 'rebuild', 'custom'] as const) {
  test(`plan ${selection} confirms once, restores and replays without submitting`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByLabel('Scenario', { exact: true }).selectOption('plan-decision')
    await page.getByRole('button', { name: 'New run', exact: true }).click()
    const card = page.getByRole('region', { name: 'Plan decision', exact: true })
    await expect(card.getByText('Recommended', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: /Incremental migration/ })).toBeEnabled()
    await expect(page.getByLabel('Follow-up message')).toBeDisabled()
    await expect(card.getByLabel('Custom plan')).toBeVisible()
    expect(await card.locator('.choice-custom-option').locator('textarea').count()).toBe(1)
    const run = await page.getByLabel('Run history').inputValue()
    if (selection === 'incremental') {
      await page.locator('.chat-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await page.screenshot({ path: test.info().outputPath('plan-decision.png'), fullPage: true })
    }
    await page.reload()
    await page.getByLabel('Run history').selectOption(run)
    await expect(card.getByRole('button', { name: /Incremental migration/ })).toBeEnabled()
    if (selection === 'custom') {
      const input = card.getByLabel('Custom plan')
      await expect(input).toBeVisible()
      await expect(card.locator('.choice-custom-option').getByLabel('Custom plan')).toBeVisible()
      await expect(card.getByRole('button', { name: 'Confirm custom plan' })).toBeDisabled()
      await card
        .getByLabel('Custom plan')
        .fill('Keep the compatibility layer and migrate read APIs first.')
      await card.getByRole('button', { name: 'Confirm custom plan' }).click()
    } else {
      await card
        .getByRole('button', {
          name: selection === 'incremental' ? /Incremental migration/ : /Full rebuild/,
        })
        .click()
    }
    await expect(card.getByRole('status')).toContainText(
      selection === 'custom'
        ? 'Custom plan'
        : selection === 'incremental'
          ? 'Incremental migration'
          : 'Full rebuild',
    )
    await expect(page.getByLabel('Follow-up message')).toBeEnabled()
    for (const button of await card.getByRole('button').all()) await expect(button).toBeDisabled()
    await page.getByRole('button', { name: /Action · choose_plan/ }).click()
    await expect(page.getByTestId('trace-input')).toContainText(selection)
    const stored = await (await page.request.get(`/api/runs/${run}/events`)).json()
    expect(
      stored.items.filter((e: { kind: string }) => e.kind === 'decision.resolved'),
    ).toHaveLength(1)
    expect(stored.items.some((e: { kind: string }) => e.kind === 'tool.started')).toBe(false)
    await page.reload()
    await page.getByLabel('Run history').selectOption(run)
    await expect(card.getByRole('status')).toBeVisible()
    if (selection === 'custom')
      await expect(card.getByLabel('Custom plan')).toHaveValue(
        'Keep the compatibility layer and migrate read APIs first.',
      )
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(card.getByRole('status')).toBeVisible({ timeout: 15000 })
    const after = await (await page.request.get(`/api/runs/${run}/events`)).json()
    expect(after).toEqual(stored)
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    if (selection === 'custom') {
      await page.getByLabel('Follow-up message').fill('Continue with the plan I just confirmed')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(page.getByLabel('Run history')).not.toHaveValue(run)
      await expect(page.getByTestId('trace-input')).toContainText(
        'Keep the compatibility layer and migrate read APIs first.',
      )
      await expect(page.locator('.chat-turn')).toHaveCount(2)
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      )
    }
  })
}
