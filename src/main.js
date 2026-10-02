import { createVaporApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n/index.js'
import { router } from './router.js'
import './styles.css'

const app = createVaporApp(App).use(i18n).use(router)
await router.isReady()
app.mount('#app')
