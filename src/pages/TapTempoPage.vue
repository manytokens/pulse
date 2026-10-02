<script setup vapor>
import { computed, onBeforeUnmount } from 'vue'
import { RotateCcw as rotateCcwIcon, Volume2 as volume2Icon, VolumeX as volumeXIcon } from 'lucide'
import { useI18n } from 'vue-i18n'
import { useMetronome } from '../composables/useMetronome.js'
import { useTempoMeasurement } from '../composables/useTempoMeasurement.js'
import { useTimeSignature } from '../composables/useTimeSignature.js'
import LucideIcon from '../components/LucideIcon.vue'

const { t } = useI18n({ useScope: 'global' })
const {
  signatures,
  selectedSignatureId,
  customNumerator,
  customDenominator,
  activeSignature,
  selectSignature,
  activateCustomSignature,
} = useTimeSignature()

let metronome
const measurement = useTempoMeasurement({
  activeSignature,
  onLock: (currentBeat) => metronome.start(currentBeat, 0.025),
  onTempoUpdate: (nextBpm) => metronome.queueTempoUpdate(nextBpm),
  onReset: () => metronome?.stop(),
})

metronome = useMetronome({
  bpm: measurement.bpm,
  isStable: measurement.isStable,
  activeSignature,
})

const {
  bpm,
  bpmDisplay,
  stability,
  standardDeviation,
  lastInterval,
  isStable,
  justTapped,
  tapCount,
  tapsUntilLock,
  handleTap,
  resetMeasurement,
} = measurement
const { activeStep, muted, start: startMetronome, toggleSound } = metronome

const statusLabel = computed(() => {
  if (!tapCount.value) return t('waitingFirst')
  if (tapCount.value < 4) return t('keepTapping')
  if (!isStable.value) return t('locking')
  return t('measuring')
})

const meterText = computed(() => {
  if (!tapCount.value) return t('tapAlong')
  if (!isStable.value && tapsUntilLock.value) return t('needMore', { count: tapsUntilLock.value })
  return isStable.value ? t('syncedContinue') : t('keepSteady')
})

function updateSignature(changeSignature) {
  const previousStep = activeStep.value
  changeSignature()
  if (isStable.value) {
    const nextStep = previousStep < 0 ? 0 : previousStep % activeSignature.value.numerator
    startMetronome(nextStep)
  }
}

function handleSignatureSelection(id) {
  updateSignature(() => selectSignature(id))
}

function handleCustomSignature() {
  updateSignature(activateCustomSignature)
}

function handleKeydown(event) {
  if (event.code === 'Escape') {
    event.preventDefault()
    resetMeasurement()
    return
  }
  if (event.code === 'Space' && !event.repeat) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    event.preventDefault()
    handleTap()
  }
}

window.addEventListener('keydown', handleKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <section class="workspace">
      <div class="measure-column">
        <div class="measurement-heading">
          <p class="eyebrow">{{ t('liveTempo') }}</p>
          <div class="status"><span :class="{ locked: isStable }"></span>{{ statusLabel }}</div>
        </div>

        <div class="tempo-readout" aria-live="polite">
          <strong>{{ bpmDisplay }}</strong>
          <span>BPM</span>
        </div>

        <div class="stability-block">
          <div class="stability-copy">
            <span>{{ meterText }}</span>
            <b>{{ Math.round(stability) }}%</b>
          </div>
          <div class="meter" aria-hidden="true"><i :style="{ width: `${stability}%` }"></i></div>
          <dl class="interval-stats" aria-live="polite">
            <div>
              <dt>{{ t('meanBpm') }}</dt>
              <dd>{{ bpm === null ? '—' : `${bpm.toFixed(2)} BPM` }}</dd>
            </div>
            <div>
              <dt>{{ t('recentInterval') }}</dt>
              <dd>{{ lastInterval === null ? '—' : `${Math.round(lastInterval)} ms` }}</dd>
            </div>
            <div>
              <dt>{{ t('stdDeviation') }}</dt>
              <dd>{{ standardDeviation === null ? '—' : `${standardDeviation.toFixed(1)} ms` }}</dd>
            </div>
          </dl>
        </div>

        <div class="measurement-actions">
          <button class="reset-button" type="button" aria-keyshortcuts="Escape" @click="resetMeasurement">
            <LucideIcon :icon="rotateCcwIcon" :size="17" :stroke-width="1.8" />
            <span>{{ t('reset') }}</span>
            <kbd>Esc</kbd>
          </button>
          <button class="icon-button" type="button" :aria-label="muted ? t('soundOn') : t('soundOff')" :title="muted ? t('soundOn') : t('soundOff')" @click="toggleSound">
            <LucideIcon v-if="muted" :icon="volumeXIcon" :size="19" :stroke-width="1.8" />
            <LucideIcon v-else :icon="volume2Icon" :size="19" :stroke-width="1.8" />
          </button>
        </div>

        <button class="tap-button" :class="{ tapped: justTapped }" type="button" aria-keyshortcuts="Space" @click="handleTap">
          <span class="tap-rings" aria-hidden="true"><i></i><i></i></span>
          <span class="tap-label">{{ t('tap') }}</span>
          <small>{{ t('tempoInput') }}</small>
        </button>

        <div class="tap-meta">
          <span>{{ t('sessionTaps') }} <b>{{ tapCount }}</b></span>
          <span>{{ t('statsWindow') }}</span>
        </div>
      </div>

      <aside class="rhythm-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">{{ t('timeSignature') }}</p>
            <h2>{{ t('selectSignature') }}</h2>
          </div>
          <span>{{ activeSignature.label }}</span>
        </div>

        <div class="rhythm-options" role="radiogroup" :aria-label="t('timeSignature')">
          <button
            v-for="signature in signatures"
            :key="signature.id"
            type="button"
            role="radio"
            :aria-checked="selectedSignatureId === signature.id"
            :class="{ selected: selectedSignatureId === signature.id }"
            @click="handleSignatureSelection(signature.id)"
          >
            <b class="signature-value">{{ signature.label }}</b>
          </button>
        </div>

        <div class="custom-signature" :class="{ selected: selectedSignatureId === 'custom' }">
          <button
            type="button"
            role="radio"
            :aria-checked="selectedSignatureId === 'custom'"
            @click="handleSignatureSelection('custom')"
          ><i></i><span>{{ t('custom') }}</span></button>
          <label>
            <span>{{ t('beats') }}</span>
            <input v-model.number="customNumerator" type="number" min="1" max="16" inputmode="numeric" @input="handleCustomSignature" />
          </label>
          <b aria-hidden="true">/</b>
          <label>
            <span>{{ t('note') }}</span>
            <select v-model.number="customDenominator" @change="handleCustomSignature">
              <option :value="2">2</option>
              <option :value="4">4</option>
              <option :value="8">8</option>
              <option :value="16">16</option>
            </select>
          </label>
        </div>

        <div class="beat-stage" :class="{ active: isStable }">
          <div class="stage-topline">
            <span>{{ t('beatpad') }}</span>
            <span>{{ isStable ? t('synced') : t('standby') }}</span>
          </div>
          <div class="beat-grid" :style="{ '--beats': Math.min(activeSignature.numerator, 8) }">
            <i
              v-for="step in activeSignature.numerator"
              :key="step"
              :class="{
                current: activeStep === step - 1,
                downbeat: step === 1,
              }"
            ><span>{{ step }}</span></i>
          </div>
          <p v-if="!isStable">{{ t('waitingStable') }}</p>
          <p v-else>{{ t('following', { bpm: Math.round(bpm), signature: activeSignature.label }) }}</p>
        </div>
      </aside>
  </section>
</template>
