import { object } from './json'
export { object } from './json'
import { interactiveError } from './interactive'
// Protocol types describe the isolated Lab catalog, not duplicated REST DTOs.
import { orderedPrefix, type LabEvent } from './events'
export const VERSION = 'v0.9.1'
export const CATALOG = 'https://github.com/sungithubid/A2UI-Lab/catalog/v1'
export type Node = { id: string; component: string; [key: string]: unknown }
export type Surface = { components: Record<string, Node>; data: Record<string, unknown> }
export type ProtocolState = {
  surfaces: Record<string, Surface>
  issues: { seq: number; message: string }[]
}
export const emptyState = (): ProtocolState => ({ surfaces: {}, issues: [] })
const safe = (key: string) => !['__proto__', 'constructor', 'prototype'].includes(key)
export const catalog = [
  'Text',
  'Column',
  'Row',
  'Card',
  'Button',
  'LabProgress',
  'LabToolCall',
  'LabToolResult',
  'LabAlert',
  'LabImageCard',
  'LabForm',
  'LabApproval',
  'LabChoice',
]
export function applyMessage(state: ProtocolState, input: unknown, seq = 0): ProtocolState {
  const fail = (message: string): ProtocolState => ({
    ...state,
    issues: [...state.issues, { seq, message }],
  })
  if (!object(input) || input.version !== VERSION)
    return fail('Invalid envelope or unsupported protocol version')
  const kinds = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'].filter(
    (k) => k in input,
  )
  if (kinds.length !== 1 || Object.keys(input).some((k) => k !== 'version' && !kinds.includes(k)))
    return fail('Expected exactly one protocol message')
  const kind = kinds[0],
    body = input[kind]
  if (
    !object(body) ||
    typeof body.surfaceId !== 'string' ||
    !body.surfaceId ||
    !safe(body.surfaceId)
  )
    return fail('Missing or unsafe surface ID')
  const id = body.surfaceId,
    surface = state.surfaces[id]
  if (kind === 'createSurface') {
    if (surface) return fail('Surface already exists')
    if (body.catalogId !== CATALOG) return fail('Unsupported catalog')
    return { ...state, surfaces: { ...state.surfaces, [id]: { components: {}, data: {} } } }
  }
  if (!surface) return fail(`Missing surface: ${id}`)
  if (kind === 'deleteSurface') {
    const surfaces = { ...state.surfaces }
    delete surfaces[id]
    return { ...state, surfaces }
  }
  if (kind === 'updateDataModel') {
    if (body.path !== undefined && body.path !== '/')
      return fail('Lab subset supports root data replacement only')
    if (body.value !== undefined && !object(body.value))
      return fail('Lab data model must be an object')
    return {
      ...state,
      surfaces: {
        ...state.surfaces,
        [id]: { ...surface, data: (body.value ?? {}) as Record<string, unknown> },
      },
    }
  }
  if (!Array.isArray(body.components) || body.components.length > 200)
    return fail('Invalid components array (maximum 200)')
  const components = { ...surface.components },
    seen = new Set<string>(),
    issues = [...state.issues]
  for (const raw of body.components) {
    if (
      !object(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      !safe(raw.id) ||
      seen.has(raw.id) ||
      typeof raw.component !== 'string'
    )
      return fail('Invalid or duplicate component')
    seen.add(raw.id)
    if (
      ['Column', 'Row'].includes(raw.component) &&
      (!Array.isArray(raw.children) || !raw.children.every((v) => typeof v === 'string' && safe(v)))
    )
      return fail('Invalid children references')
    if (
      ['Card', 'Button'].includes(raw.component) &&
      (typeof raw.child !== 'string' || !safe(raw.child))
    )
      return fail('Missing child reference')
    if (
      raw.component === 'Text' &&
      typeof raw.text !== 'string' &&
      !(
        object(raw.text) &&
        typeof raw.text.path === 'string' &&
        /^\/[^/]+$/.test(raw.text.path) &&
        safe(raw.text.path.slice(1))
      )
    )
      return fail('Invalid Text binding or value')
    if (
      raw.component === 'Button' &&
      (!object(raw.action) ||
        !object(raw.action.event) ||
        typeof raw.action.event.name !== 'string')
    )
      return fail('Invalid Button action')
    if (
      raw.component === 'LabProgress' &&
      (typeof raw.percent !== 'number' || raw.percent < 0 || raw.percent > 100)
    )
      return fail('Invalid progress percentage')
    const interactiveIssue = interactiveError(raw as Node)
    if (interactiveIssue) return fail(interactiveIssue)
    if (!catalog.includes(raw.component))
      issues.push({ seq, message: `Unknown component: ${raw.component}` })
    components[raw.id] = raw as Node
  }
  return { ...state, issues, surfaces: { ...state.surfaces, [id]: { ...surface, components } } }
}
export function replay(events: LabEvent[], count = events.length): ProtocolState {
  return orderedPrefix(events)
    .slice(0, count)
    .reduce(
      (s, e) => (e.kind === 'a2ui.message' ? applyMessage(s, e.payload, e.seq) : s),
      emptyState(),
    )
}
export function describe(payload: unknown): {
  type: string
  surfaceId: string
  componentCount: number
} {
  if (!object(payload)) return { type: 'invalid', surfaceId: '—', componentCount: 0 }
  const key = Object.keys(payload).find((k) => k !== 'version') ?? 'invalid',
    body = payload[key]
  return {
    type: key,
    surfaceId: object(body) && typeof body.surfaceId === 'string' ? body.surfaceId : '—',
    componentCount: object(body) && Array.isArray(body.components) ? body.components.length : 0,
  }
}
