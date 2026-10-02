import assert from 'node:assert/strict'
import test from 'node:test'
import { messages } from '../src/i18n/messages.js'
import { detectBrowserLocale } from '../src/i18n/index.js'

test('every locale exposes the same message keys as the English fallback', () => {
  const fallbackKeys = Object.keys(messages.en).sort()
  Object.entries(messages).forEach(([locale, localeMessages]) => {
    assert.deepEqual(Object.keys(localeMessages).sort(), fallbackKeys, `${locale} has mismatched message keys`)
  })
})

test('detects a supported locale from browser language preferences', () => {
  assert.equal(detectBrowserLocale(['fr-FR', 'ja-JP']), 'ja')
  assert.equal(detectBrowserLocale(['zh-TW']), 'zh-TW')
  assert.equal(detectBrowserLocale(['zh-HK']), 'zh-TW')
  assert.equal(detectBrowserLocale(['zh']), 'zh-CN')
  assert.equal(detectBrowserLocale(['de-DE']), 'en')
})
