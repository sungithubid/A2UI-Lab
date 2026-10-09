import i18n from './i18n'
import createClient from 'openapi-fetch'
import type { paths } from '@/generated/api'
let csrfToken = ''
export const setCSRF = (token: string) => {
  csrfToken = token
}
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' })
export class APIError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
api.use({
  onRequest({ request }) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      request.headers.set('X-CSRF-Token', csrfToken)
    return request
  },
  async onResponse({ response }) {
    if (!response.ok) {
      const problem = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { detail?: string; title?: string }
      throw new APIError(
        problem.detail || problem.title || 'Request failed. Please try again.',
        response.status,
      )
    }
  },
})
export function required<T>(data: T | undefined): T {
  if (data === undefined) throw new Error('The server returned an empty response')
  return data
}

// Translate presentation errors without changing the server's API contract.
export function errorMessage(error: Error): string {
  if (error instanceof APIError) {
    const messages: Record<number, string> = {
      401: 'Invalid email or password.',
      403: 'You do not have permission for this action.',
      404: 'This item could not be found.',
      409: 'This item already exists.',
      400: 'Please check your input.',
      422: 'Please check your input.',
      429: 'Too many requests. Please try again later.',
    }
    return i18n.t(messages[error.status] ?? 'Request failed. Please try again.')
  }
  return i18n.t('Unable to connect. Please try again.')
}
