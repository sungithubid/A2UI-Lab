import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en, zhCN } from './locales'
export type Language = 'en' | 'zh-CN'
export const languageKey = 'monoseed.language'
export function detectLanguage(saved: string | null, preferred: readonly string[]): Language {
  if (saved === 'en' || saved === 'zh-CN') return saved
  for (const language of preferred) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN'
    if (/^en(?:-|$)/i.test(language)) return 'en'
  }
  return 'en'
}
function savedLanguage() {
  try {
    return localStorage.getItem(languageKey)
  } catch {
    return null
  }
}
export function changeLanguage(language: Language) {
  try {
    localStorage.setItem(languageKey, language)
  } catch {
    /* Storage may be disabled. Switching still works. */
  }
  return i18n.changeLanguage(language)
}
function updateDocument() {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
}
i18n.on('languageChanged', updateDocument)
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  lng: detectLanguage(savedLanguage(), navigator.languages),
  supportedLngs: ['en', 'zh-CN'],
  fallbackLng: 'en',
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
})
updateDocument()
export default i18n
