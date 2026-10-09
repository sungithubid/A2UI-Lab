import { harness, password } from './harness.mjs'
const h = harness(4173, {
  APP_ENV: 'development',
  APP_DEV_ADMIN_EMAIL: 'bootstrap@example.test',
  APP_DEV_ADMIN_PASSWORD: password,
  APP_DEV_ADMIN_WORKSPACE: 'Bootstrap workspace',
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await h.cleanup()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
try {
  h.admin('owner@example.test', 'Acme')
  h.admin('outsider@example.test', 'Other team')
  await h.start()
  console.log('E2E fixture ready')
} catch (error) {
  await h.cleanup()
  throw error
}
