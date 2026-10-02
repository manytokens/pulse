import { createRouter, createWebHistory } from 'vue-router'
import AudioAnalyzePage from './pages/AudioAnalyzePage.vue'
import TapTempoPage from './pages/TapTempoPage.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'tap', component: TapTempoPage },
    { path: '/analyze', name: 'analyze', component: AudioAnalyzePage },
  ],
})
