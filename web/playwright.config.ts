import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '../tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ../scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:4173/readyz',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
