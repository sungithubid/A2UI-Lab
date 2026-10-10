import type { Node } from './a2ui'
import { object } from './json'
export function safeLink(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}
export function safeImage(value: unknown): value is string {
  return typeof value === 'string' && /^\/scenario-images\/[a-z0-9-]+\.svg$/.test(value)
}
export type Field = {
  name: string
  label: string
  type: 'text' | 'email' | 'textarea' | 'select'
  required: boolean
  maxLength?: number
  options?: string[]
}
export type ChoiceOption = { id: string; title: string; description: string; recommended: boolean }
export function interactiveError(raw: Node): string | undefined {
  if (!['LabImageCard', 'LabForm', 'LabApproval', 'LabChoice'].includes(raw.component)) return
  const v = raw.value
  if (!object(v) || typeof v.title !== 'string' || !v.title || typeof v.description !== 'string')
    return 'Interactive component needs title and description'
  if (raw.disabled !== undefined && typeof raw.disabled !== 'boolean')
    return 'Invalid disabled state'
  if (raw.component === 'LabImageCard') {
    if (!safeImage(v.image) || !safeLink(v.url) || typeof v.alt !== 'string' || !v.alt)
      return 'Invalid image or navigation URL'
    if (v.layout !== undefined && v.layout !== 'row') return 'Unsupported image layout'
    return
  }
  if (!object(raw.action) || !object(raw.action.event) || typeof raw.action.event.name !== 'string')
    return 'Interactive component needs an event action'
  if (raw.component === 'LabChoice') {
    if (
      !Array.isArray(v.options) ||
      v.options.length < 2 ||
      v.options.length > 6 ||
      typeof v.allowCustom !== 'boolean' ||
      !Number.isSafeInteger(v.customMaxLength) ||
      Number(v.customMaxLength) < 1 ||
      Number(v.customMaxLength) > 2000
    )
      return 'Invalid choice question'
    const ids = new Set<string>()
    for (const option of v.options) {
      if (
        !object(option) ||
        typeof option.id !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(option.id) ||
        option.id === 'custom' ||
        ids.has(option.id) ||
        typeof option.title !== 'string' ||
        !option.title ||
        typeof option.description !== 'string' ||
        !option.description ||
        typeof option.recommended !== 'boolean'
      )
        return 'Invalid or duplicate choice option'
      ids.add(option.id)
    }
    if (raw.disabled) {
      if (
        typeof v.selectedChoiceId !== 'string' ||
        (!ids.has(v.selectedChoiceId) && !(v.selectedChoiceId === 'custom' && v.allowCustom)) ||
        typeof v.customText !== 'string' ||
        (v.selectedChoiceId === 'custom' &&
          (!v.customText.trim() || [...v.customText].length > Number(v.customMaxLength))) ||
        (v.selectedChoiceId !== 'custom' && v.customText !== '')
      )
        return 'Invalid recorded choice'
    } else if (v.selectedChoiceId !== undefined) return 'Unlocked choice cannot have a selection'
  }
  if (raw.component === 'LabForm') {
    if (!Array.isArray(v.fields) || !v.fields.length || v.fields.length > 12)
      return 'Invalid form fields'
    const seen = new Set<string>()
    for (const f of v.fields) {
      if (
        !object(f) ||
        typeof f.name !== 'string' ||
        !/^[a-z][a-z0-9_]*$/.test(f.name) ||
        ['constructor', 'prototype', '__proto__'].includes(f.name) ||
        seen.has(f.name) ||
        typeof f.label !== 'string' ||
        !f.label ||
        !['text', 'email', 'textarea', 'select'].includes(String(f.type)) ||
        typeof f.required !== 'boolean'
      )
        return 'Invalid or duplicate form field'
      seen.add(f.name)
      if (f.type === 'select') {
        if (
          !Array.isArray(f.options) ||
          !f.options.length ||
          f.options.length > 20 ||
          !f.options.every((x) => typeof x === 'string' && x.length > 0)
        )
          return 'Invalid select options'
      } else if (
        typeof f.maxLength !== 'number' ||
        !Number.isSafeInteger(f.maxLength) ||
        f.maxLength < 1 ||
        f.maxLength > 2000
      )
        return 'Invalid field length'
    }
    if (
      v.values !== null &&
      v.values !== undefined &&
      (!object(v.values) ||
        !Object.entries(v.values).every(([k, x]) => seen.has(k) && typeof x === 'string'))
    )
      return 'Invalid submitted values'
  }
}
