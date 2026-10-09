import { test, expect } from '../../web/e2e-fixtures'
const password = 'test password 12345'
test('administrator signs in and completes Notes CRUD, workspace switching, logout', async ({
  page,
}, testInfo) => {
  await page.goto('/notes')
  await page.getByLabel('Email address').fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A little clarity, every day.' })).toBeVisible()
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('First idea')
  await page.getByLabel('Content', { exact: true }).fill('A persistent thought')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByRole('heading', { name: 'First idea', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open First idea' }).click()
  await page.getByLabel('Title', { exact: true }).fill('A better idea')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByRole('heading', { name: 'A better idea', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'A better idea', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('notes-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'New workspace', exact: true }).click()
  await page.getByLabel('Workspace name', { exact: true }).fill('Personal')
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your next idea starts here' })).toBeVisible()
  await page.getByLabel('Workspace', { exact: true }).click()
  await page.getByRole('option', { name: 'Acme', exact: true }).click()
  await page.getByRole('button', { name: 'Actions for A better idea', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A better idea', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})
test('workspace isolation rejects cross-user read, create, update and delete', async ({
  playwright,
  baseURL,
}) => {
  const owner = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL! },
  })
  const outsider = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL! },
  })
  try {
    const loginA = await owner.post('/api/auth/login', {
      data: { email: 'owner@example.test', password },
    })
    expect(loginA.ok()).toBeTruthy()
    const a = await loginA.json()
    const loginB = await outsider.post('/api/auth/login', {
      data: { email: 'outsider@example.test', password },
    })
    expect(loginB.ok()).toBeTruthy()
    const b = await loginB.json()
    const workspaces = await (await owner.get('/api/workspaces')).json()
    const wid = workspaces.items.find((w: { name: string }) => w.name === 'Acme').id
    const path = `/api/workspaces/${wid}/notes`
    const created = await owner.post(path, {
      headers: { 'X-CSRF-Token': a.csrf_token },
      data: { title: 'Private', content: 'Owner only' },
    })
    expect(created.status()).toBe(201)
    const note = await created.json()
    expect((await outsider.get(path)).status()).toBe(403)
    expect((await outsider.get(`${path}/${note.id}`)).status()).toBe(403)
    expect(
      (
        await outsider.post(path, {
          headers: { 'X-CSRF-Token': b.csrf_token },
          data: { title: 'Intruder', content: '' },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await outsider.put(`${path}/${note.id}`, {
          headers: { 'X-CSRF-Token': b.csrf_token },
          data: { title: 'Stolen', content: '' },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await outsider.delete(`${path}/${note.id}`, {
          headers: { 'X-CSRF-Token': b.csrf_token },
        })
      ).status(),
    ).toBe(403)
    expect((await owner.get(`${path}/${note.id}`)).status()).toBe(200)
  } finally {
    await owner.dispose()
    await outsider.dispose()
  }
})

test('mobile navigation and unknown pages remain usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email address').fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A little clarity, every day.' })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Notes/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath('notes-mobile.png'), fullPage: true })
  await page.goto('/not-a-real-page')
  await expect(page.getByRole('heading', { name: "This page hasn't taken root." })).toBeVisible()
})

test('development startup account signs in through both loopback hostnames', async ({ page }) => {
  for (const host of ['127.0.0.1', 'localhost']) {
    await page.goto(`http://${host}:4173/login`)
    await page.getByLabel('Email address').fill('bootstrap@example.test')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'A little clarity, every day.' })).toBeVisible()
    await expect(page.getByLabel('Workspace', { exact: true })).toContainText('Bootstrap workspace')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  }
})

test('browser language, persistent override, dialogs and paged table work together', async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({ baseURL, locale: 'zh-CN' })
  const page = await context.newPage()
  try {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await page.getByLabel('邮箱地址').fill('bootstrap@example.test')
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('link', { name: '笔记', exact: true }).click()
    const launch = page.getByRole('button', { name: '新建笔记', exact: true })
    await launch.click()
    await expect(page.getByRole('dialog', { name: '全新的一页' })).toBeVisible()
    await expect(page.getByLabel('标题', { exact: true })).toBeFocused()
    await page.getByRole('button', { name: '保存笔记' }).click()
    await expect(page.getByRole('alert')).toHaveText('请为笔记填写标题')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(launch).toBeFocused()
    const session = await (await page.request.get('/api/auth/me')).json()
    const spaces = await (await page.request.get('/api/workspaces')).json()
    const wid = spaces.items.find((w: { name: string }) => w.name === 'Bootstrap workspace').id
    for (let index = 0; index < 14; index++) {
      const response = await page.request.post(`/api/workspaces/${wid}/notes`, {
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrf_token },
        data: { title: `Table ${String(index).padStart(2, '0')}`, content: '中文正文' },
      })
      expect(response.status()).toBe(201)
    }
    await page.reload()
    await page.getByRole('tab', { name: '表格', exact: true }).click()
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(13)
    await expect(page.getByText('对当前页排序')).toBeVisible()
    await page.getByRole('button', { name: '标题', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: '标题', exact: true })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Table 02')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page.getByText('第 2 页，共 2 页')).toBeVisible()
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3)
    await page.getByRole('button', { name: 'Table 00 的操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '编辑', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '编辑笔记' })).toBeVisible()
    await expect(page.getByLabel('标题', { exact: true })).toBeFocused()
    await expect(page.getByLabel('内容', { exact: true })).toHaveValue('中文正文')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Table 00 的操作', exact: true })).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath('notes-table-zh.png'), fullPage: true })
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^Notes/ })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.reload()
    await expect(page.getByRole('heading', { name: /^Notes/ })).toBeVisible()
    await page.getByRole('button', { name: 'Language', exact: true }).click()
    await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^笔记/ })).toBeVisible()
  } finally {
    await context.close()
  }
})
