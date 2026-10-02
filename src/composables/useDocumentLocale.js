import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

export function useDocumentLocale() {
  const { locale, t } = useI18n({ useScope: 'global' })
  const route = useRoute()

  watch([locale, () => route.name], ([value, routeName]) => {
    document.documentElement.lang = value
    document.documentElement.dataset.locale = value
    document.title = routeName === 'analyze' ? `${t('automaticAnalysis')} · Pulse` : t('title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'))
    localStorage.setItem('pulse-locale', value)
  }, { immediate: true })

  return { locale, t }
}
