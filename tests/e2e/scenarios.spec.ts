import { test, expect, type Page } from '../../web/e2e-fixtures'
async function start(page: Page, scenario: string) {
  await page.goto('/')
  await page.getByLabel('Scenario', { exact: true }).selectOption(scenario)
  await page.getByRole('button', { name: 'New run', exact: true }).click()
}
test('image card uses a bundled image and opens its documentation link', async ({
  page,
  context,
}) => {
  await context.route('https://a2ui.org/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Documentation destination fixture</h1>' }),
  )
  await start(page, 'image-card')
  const link = page.locator('.renderer-panel').getByRole('link', { name: /Build with A2UI/ })
  await expect(link).toHaveAttribute('href', 'https://a2ui.org/')
  await expect(link.getByRole('img')).toBeVisible()
  await expect
    .poll(() => link.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  const opened = page.waitForEvent('popup')
  await link.click()
  const popup = await opened
  await expect(popup).toHaveURL('https://a2ui.org/')
  await popup.close()
  await page.screenshot({ path: test.info().outputPath('image-card.png'), fullPage: true })
})
test('image-text search results stream into left-image right-text rows', async ({ page }) => {
  await start(page, 'image-list')
  await expect(page.locator('.resource-row')).toHaveCount(3)
  for (const row of await page.locator('.resource-row').all()) {
    const image = await row.locator('img').boundingBox(),
      copy = await row.locator('.resource-copy').boundingBox()
    expect(image).not.toBeNull()
    expect(copy).not.toBeNull()
    expect(image!.x).toBeLessThan(copy!.x)
  }
  await page.screenshot({ path: test.info().outputPath('image-list.png'), fullPage: true })
})
test('form validates, saves values, restores after reload and replays without resubmitting', async ({
  page,
}) => {
  await start(page, 'support-form')
  await expect(page.getByText('Waiting for your input', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
  await expect(page.getByLabel('Your name *')).toBeFocused()
  await page.getByLabel('Your name *').fill('Ada Lovelace')
  await page.getByLabel('Email *').fill('ada@example.test')
  await page.getByLabel('Issue summary *').fill('Export fails after selecting a date range')
  await page.getByLabel('Priority *').selectOption('urgent')
  await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ticket submitted' })).toBeDisabled()
  await expect(
    page.getByText('Support ticket saved locally. No email was sent.', { exact: true }),
  ).toBeVisible()
  const run = await page.getByLabel('Run history').inputValue()
  await page.reload()
  await page.getByLabel('Run history').selectOption(run)
  await expect(page.getByLabel('Email *')).toHaveValue('ada@example.test')
  await expect(page.getByLabel('Email *')).toBeDisabled()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ticket submitted' })).toBeDisabled({
    timeout: 10000,
  })
  await expect(page.getByRole('button', { name: 'ticket.created', exact: true })).toHaveCount(1)
  await page.screenshot({ path: test.info().outputPath('submitted-form.png'), fullPage: true })
})
for (const decision of ['approve', 'reject'] as const) {
  test(`confirmation ${decision} persists and only approval executes the mock tool`, async ({
    page,
  }) => {
    await start(page, 'deployment-approval')
    await expect(page.getByRole('button', { name: 'Approve deployment' })).toBeEnabled()
    const run = await page.getByLabel('Run history').inputValue()
    await page.reload()
    await page.getByLabel('Run history').selectOption(run)
    await expect(page.getByText('Waiting for your input', { exact: true })).toBeVisible()
    await page
      .getByRole('button', {
        name: decision === 'approve' ? 'Approve deployment' : 'Reject deployment',
      })
      .click()
    await expect(page.getByText(`Decision: ${decision}`, { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: decision === 'approve' ? 'run.completed' : 'run.cancelled',
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'tool.started', exact: true })).toHaveCount(
      decision === 'approve' ? 1 : 0,
    )
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByText(`Decision: ${decision}`, { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await page.screenshot({
      path: test.info().outputPath(`confirmation-${decision}.png`),
      fullPage: true,
    })
  })
}
