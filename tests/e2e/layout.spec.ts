import { test, expect } from '../../web/e2e-fixtures'

test('aligned delete controls confirm, preserve history on cancel/error, and clear all runs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1000 })
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('support-form')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByText('Waiting for your input', { exact: true })).toBeVisible()
  const run = await page.getByLabel('Run history').inputValue()
  const history = await page.getByLabel('Run history').boundingBox()
  for (const name of ['Delete run', 'Delete all runs', 'New run']) {
    const button = await page.getByRole('button', { name, exact: true }).boundingBox()
    expect(Math.abs(button!.y + button!.height - history!.y - history!.height)).toBeLessThan(2)
  }
  const clear = page.getByRole('button', { name: 'Delete all runs', exact: true })
  const dialog = page.getByRole('alertdialog')
  await clear.click()
  await expect(dialog).toContainText('This will stop active runs')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: test.info().outputPath('delete-confirmation.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Run history')).toHaveValue(run)

  await page.route('**/api/runs', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Unable to clear history' }),
        })
      : route.continue(),
  )
  await clear.click()
  await dialog.getByRole('button', { name: 'Delete all runs', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Unable to clear history')
  await expect(page.getByLabel('Run history')).toHaveValue(run)
  await page.unroute('**/api/runs')
  await dialog.getByRole('button', { name: 'Delete all runs', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Run history').locator('option')).toHaveCount(1)
  await expect(clear).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete run', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('heading', { name: 'Every UI has a story. Inspect every event.' }),
  ).toBeVisible()
  expect((await (await page.request.get('/api/runs')).json()).items).toEqual([])
  expect((await page.request.get(`/api/runs/${run}/events`)).status()).toBe(404)
  await page.reload()
  await expect(page.getByLabel('Run history').locator('option')).toHaveCount(1)
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Protocol Inspector' })).toBeVisible()
})

test('inspector divider resizes panes, supports keyboard limits, persists and resets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1000 })
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('support-form')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByText('Waiting for your input', { exact: true })).toBeVisible()
  const run = await page.getByLabel('Run history').inputValue()
  const divider = page.getByRole('separator', { name: 'Resize protocol event list' })
  await expect(divider).toHaveAttribute('aria-valuenow', '28')
  const before = await page.locator('.protocol-list').boundingBox()
  const detailBefore = await page.locator('.inspector').boundingBox()
  const grip = await divider.boundingBox()
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2 + 90, { steps: 10 })
  await page.mouse.up()
  const after = await page.locator('.protocol-list').boundingBox()
  const detailAfter = await page.locator('.inspector').boundingBox()
  expect(after!.height - before!.height).toBeCloseTo(90, 0)
  expect(detailBefore!.height - detailAfter!.height).toBeCloseTo(90, 0)
  await page.locator('.protocol-list button').last().click()
  await expect(page.getByTestId('raw-json')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('resized-inspector.png'), fullPage: true })
  const value = await divider.getAttribute('aria-valuenow')
  await page.reload()
  await page.getByLabel('Run history').selectOption(run)
  await expect(divider).toHaveAttribute('aria-valuenow', value!)
  await divider.focus()
  await page.keyboard.press('Home')
  await expect(divider).toHaveAttribute('aria-valuenow', '20')
  await page.keyboard.press('ArrowDown')
  await expect(divider).toHaveAttribute('aria-valuenow', '25')
  await page.keyboard.press('ArrowUp')
  await expect(divider).toHaveAttribute('aria-valuenow', '20')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await expect(divider).toHaveAttribute('aria-valuenow', '70')
  await divider.dblclick()
  await expect(divider).toHaveAttribute('aria-valuenow', '28')
  await page.setViewportSize({ width: 390, height: 844 })
  await divider.scrollIntoViewIfNeeded()
  await expect(divider).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const mobileList = await page.locator('.protocol-list').boundingBox()
  const mobileDetails = await page.locator('.inspector').boundingBox()
  expect(mobileList!.height).toBeGreaterThan(50)
  expect(mobileDetails!.height).toBeGreaterThan(100)
})
