import createClient from 'openapi-fetch'
import type { paths } from '@/generated/api'
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
api.use({
  async onResponse({ response }) {
    if (!response.ok) {
      const p = await response
        .clone()
        .json()
        .catch(() => ({}))
      throw new Error(p.detail || p.title || `HTTP ${response.status}`)
    }
  },
})
export function required<T>(data: T | undefined): T {
  if (data === undefined) throw new Error('Empty server response')
  return data
}
export function errorMessage(error: Error): string {
  return error.message
}
