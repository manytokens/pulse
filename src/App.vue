<script setup vapor lang="ts">
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { useDocumentLocale } from './composables/useDocumentLocale.ts'
import AudioAnalyzePage from './pages/AudioAnalyzePage.vue'
import TapTempoPage from './pages/TapTempoPage.vue'

useDocumentLocale()
const route = useRoute()
</script>

<template>
  <main class="app-shell">
    <AppHeader />
    <AudioAnalyzePage v-if="route.name === 'analyze'" />
    <TapTempoPage v-else />
  </main>
</template>
