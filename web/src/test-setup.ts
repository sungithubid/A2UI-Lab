import i18n from '@/lib/i18n'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { beforeEach, afterEach } from 'vitest'
afterEach(cleanup)

beforeEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('en')
})
