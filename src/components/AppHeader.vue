<script setup vapor>
import { Languages as languagesIcon } from 'lucide'
import { siGithub } from 'simple-icons'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { localeOptions } from '../i18n/index.js'
import LucideIcon from './LucideIcon.vue'

const { locale, t } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
</script>

<template>
  <header class="topbar">
    <button class="brand" type="button" aria-label="Pulse" @click="router.push('/')">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span>PULSE</span>
    </button>

    <nav class="tool-nav" :aria-label="t('navigation')">
      <button type="button" :class="{ active: route.name === 'tap' }" @click="router.push('/')">{{ t('tapTool') }}</button>
      <button type="button" :class="{ active: route.name === 'analyze' }" @click="router.push('/analyze')">{{ t('analyzeTool') }}</button>
    </nav>

    <div class="header-actions">
      <label class="locale-picker" :title="t('language')">
          <LucideIcon :icon="languagesIcon" :size="17" :stroke-width="1.8" />
        <select v-model="locale" :aria-label="t('language')">
          <option v-for="item in localeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <a class="github-button" href="https://github.com/manytokens/pulse" target="_blank" rel="noreferrer" :aria-label="t('github')" :title="t('github')">
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path :d="siGithub.path" /></svg>
      </a>
    </div>
  </header>
</template>
