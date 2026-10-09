import { harness } from './harness.mjs'
const h = harness(4173)
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
  await h.start()
  console.log('E2E fixture ready')
} catch (error) {
  await h.cleanup()
  throw error
}
