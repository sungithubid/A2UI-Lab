import { test, expect } from '../../web/e2e-fixtures'
test('Mock stream, protocol inspection, action and deterministic replay survive reload', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (e) => failures.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'A2UI Lab', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByText('Checking server metrics... ', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'View errors', exact: true })).toBeEnabled()
  await expect(
    page.getByText('CPU 32% · Memory 61% · 3 recent errors', { exact: true }),
  ).toBeVisible()
  await page.locator('.protocol-list button').filter({ hasText: 'updateDataModel' }).click()
  await expect(page.getByTestId('raw-json')).toContainText('summary')
  await expect(page.getByText('Valid · Lab catalog subset', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View errors', exact: true }).click()
  await expect(
    page.getByText('Recent errors: connection timeout, retry exhausted, upstream unavailable.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'action.completed', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('lab.png'), fullPage: true })
  const run = await page.getByLabel('Run history').inputValue()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(
    page.getByText('UI appears here as protocol messages arrive.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(page.getByText(/1 \/ \d+ events/)).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(
    page.getByText('Recent errors: connection timeout, retry exhausted, upstream unavailable.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'View errors', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByLabel('Run history').selectOption(run)
  await expect(
    page.getByText('Recent errors: connection timeout, retry exhausted, upstream unavailable.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(failures).toEqual([])
})
test('tool failure is visible and replayable', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption('tool-error')
  await page.getByRole('button', { name: 'New run', exact: true }).click()
  await expect(page.getByRole('button', { name: 'run.failed', exact: true })).toBeVisible()
  await expect(page.locator('.renderer-panel').getByRole('alert')).toContainText(
    'mock metrics tool is unavailable',
  )
})
