import { createI18n } from 'vue-i18n'
import { messages } from './messages.js'

export const localeOptions = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
]

const supportedLocales = new Set(localeOptions.map(({ value }) => value))

export function detectBrowserLocale(languages = [
  ...(globalThis.navigator?.languages ?? []),
  globalThis.navigator?.language,
]) {
  for (const language of languages) {
    if (!language) continue
    const normalized = language.toLowerCase()
    if (supportedLocales.has(language)) return language
    if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) return 'zh-TW'
    if (normalized.startsWith('zh')) return 'zh-CN'
    if (normalized.startsWith('ja')) return 'ja'
    if (normalized.startsWith('en')) return 'en'
  }
  return 'en'
}

const savedLocale = globalThis.localStorage?.getItem('pulse-locale')
const initialLocale = supportedLocales.has(savedLocale) ? savedLocale : detectBrowserLocale()

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages,
})
