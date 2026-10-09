import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n, { detectLanguage, changeLanguage, languageKey } from './i18n'
import { en, zhCN } from './locales'
import { ErrorState } from '@/components/states'
describe('language preferences', () => {
  it('honors saved choice, then supported browser languages in preference order', () => {
    expect(detectLanguage('en', ['zh-CN'])).toBe('en')
    expect(detectLanguage('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(detectLanguage('invalid', ['fr-FR', 'zh-Hans', 'en'])).toBe('zh-CN')
    expect(detectLanguage(null, ['en-GB', 'zh-CN'])).toBe('en')
    expect(detectLanguage(null, ['de'])).toBe('en')
  })
  it('keeps complete catalogs and matching interpolation parameters', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(zhCN[key].match(/{{\w+}}/g)?.sort()).toEqual(en[key].match(/{{\w+}}/g)?.sort())
    }
  })
  it('persists only explicit overrides and updates the document language', async () => {
    await changeLanguage('zh-CN')
    expect(localStorage.getItem(languageKey)).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(i18n.t('Page {{page}} of {{count}}', { page: 2, count: 3 })).toBe('第 2 页，共 3 页')
  })
  it('continues switching when browser storage is blocked', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      await changeLanguage('zh-CN')
      expect(i18n.resolvedLanguage).toBe('zh-CN')
    } finally {
      write.mockRestore()
    }
  })
  it('localizes the retained shared error state', async () => {
    await i18n.changeLanguage('zh-CN')
    render(<ErrorState error={new Error('Test error')} retry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Test error')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
