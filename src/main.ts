import { createVaporApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n/index.ts'
import { router } from './router.ts'
import './styles.css'

const app = createVaporApp(App).use(i18n).use(router)
await router.isReady()
app.mount('#app')
