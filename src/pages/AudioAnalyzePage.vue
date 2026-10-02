<script setup vapor>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  ChevronDown as chevronDownIcon,
  ChevronRight as chevronRightIcon,
  CircleHelp as circleHelpIcon,
  FileAudio as fileAudioIcon,
  Hash as hashIcon,
  LocateFixed as locateFixedIcon,
  Metronome as metronomeIcon,
  Package as packageIcon,
  Mic as micIcon,
  MonitorUp as monitorUpIcon,
  Square as squareIcon,
  Upload as uploadIcon,
} from 'lucide'
import { useI18n } from 'vue-i18n'
import { strToU8, zipSync } from 'fflate'
import OggEncodeWorker from '../workers/ogg-encode.worker.js?worker'
import { buildOsuFile, osuFileName, sanitizeFileName } from '../osz-export.js'
import { useAudioCapture } from '../composables/useAudioCapture.js'
import { useEssentiaAnalysis } from '../composables/useEssentiaAnalysis.js'
import { classifyEssentiaConfidence } from '../essentia-confidence.js'
import LucideIcon from '../components/LucideIcon.vue'
import SpectrumPlayer from '../components/SpectrumPlayer.vue'

const { t } = useI18n({ useScope: 'global' })
const fileInput = ref(null)
const playerRef = ref(null)
const audioBlob = ref(null)
const audioUrl = ref('')
const sourceName = ref('')
const sourceError = ref('')
const editableBpm = ref(120)
const gridOrigin = ref(0)
const numerator = ref(4)
const denominator = ref(4)
const metronomeEnabled = ref(false)
const metronomeVolume = ref(Math.max(0, Math.min(100, Number(localStorage.getItem('pulse-metronome-volume') ?? 70))))
watch(metronomeVolume, (volume) => localStorage.setItem('pulse-metronome-volume', String(volume)))
const dragActive = ref(false)
let dragDepth = 0
const spectrumExpanded = ref(localStorage.getItem('pulse-spectrum-expanded') === 'true')

const { analyzing, analysisError, result, analyze } = useEssentiaAnalysis()
const capture = useAudioCapture((blob) => acceptAudio(blob, `${t('recording')} ${new Date().toLocaleTimeString()}`))

const confidenceLevel = computed(() => classifyEssentiaConfidence(result.value?.confidence || 0))
const playerBpm = computed(() => Math.max(35, Math.min(240, Number(editableBpm.value) || 120)))
const playerOrigin = computed(() => Math.max(0, Math.min(result.value?.duration || 0, Number(gridOrigin.value) || 0)))
const playerNumerator = computed(() => Math.max(1, Math.min(16, Number(numerator.value) || 4)))
const gridOriginMs = computed({
  get: () => Math.round((Number(gridOrigin.value) || 0) * 1000),
  set: (value) => { gridOrigin.value = Number(((Number(value) || 0) / 1000).toFixed(3)) },
})
const playerDenominator = computed(() => [2, 4, 8, 16].includes(Number(denominator.value)) ? Number(denominator.value) : 4)

watch(spectrumExpanded, (expanded) => localStorage.setItem('pulse-spectrum-expanded', String(expanded)))

async function acceptAudio(blob, name) {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioBlob.value = blob
  audioUrl.value = URL.createObjectURL(blob)
  sourceName.value = name
  sourceError.value = ''
  try {
    const rhythm = await analyze(blob)
    if (!rhythm) return
    editableBpm.value = Number(rhythm.bpm.toFixed(2))
    gridOrigin.value = Number((rhythm.ticks[0] || 0).toFixed(3))
  } catch (error) {
    sourceError.value = error instanceof Error ? error.message : String(error)
  }
}

function handleFile(event) {
  const [file] = event.target.files
  if (file) acceptAudio(file, file.name)
  event.target.value = ''
}

async function startRecording(source) {
  sourceError.value = ''
  try {
    await capture.startRecording(source)
  } catch (error) {
    sourceError.value = error instanceof Error ? error.message : String(error)
  }
}

const exporting = ref(false)
const exportProgress = ref(0)

async function exportOsz() {
  if (exporting.value) return
  const buffer = playerRef.value?.getDecodedBuffer?.()
  if (!buffer || !result.value) return
  exporting.value = true
  exportProgress.value = 0
  try {
    const channelCount = Math.min(2, buffer.numberOfChannels)
    const channels = []
    for (let index = 0; index < channelCount; index += 1) channels.push(buffer.getChannelData(index).slice())
    const ogg = await new Promise((resolve, reject) => {
      const worker = new OggEncodeWorker()
      worker.onmessage = ({ data }) => {
        if (typeof data.progress === 'number') {
          exportProgress.value = data.progress
          return
        }
        worker.terminate()
        if (data.ok) resolve(data.ogg)
        else reject(new Error(data.error))
      }
      worker.onerror = (event) => {
        worker.terminate()
        reject(event.error || new Error(event.message || 'encoder failed'))
      }
      // Vorbis VBR quality 6.5 targets roughly 208 kbps.
      worker.postMessage({ channels, sampleRate: buffer.sampleRate, vbrQuality: 6.5 }, channels.map((channel) => channel.buffer))
    })
    const title = sanitizeFileName(sourceName.value.replace(/\.[^.]+$/, '')) || 'untitled'
    const metadata = { title, bpm: playerBpm.value, offsetMs: Math.round(playerOrigin.value * 1000), numerator: playerNumerator.value }
    const archive = zipSync({
      'audio.ogg': [ogg, { level: 0 }],
      [osuFileName(metadata)]: strToU8(buildOsuFile(metadata)),
    })
    const url = URL.createObjectURL(new Blob([archive], { type: 'application/octet-stream' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${title}.osz`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  } catch (error) {
    sourceError.value = error instanceof Error ? error.message : String(error)
  } finally {
    exporting.value = false
  }
}

function setOriginFromPlayhead() {
  const time = playerRef.value?.getCurrentTime?.()
  if (typeof time === 'number') gridOrigin.value = Number(time.toFixed(3))
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

const AUDIO_EXTENSION = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm|mp4)$/i

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function pickAudioFile(dataTransfer) {
  for (const file of dataTransfer?.files || []) {
    if (file.type.startsWith('audio/') || AUDIO_EXTENSION.test(file.name)) return file
  }
  return null
}

function handleDragEnter(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = true
}

function handleDragOver(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function handleDragLeave(event) {
  if (!isFileDrag(event)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragActive.value = false
}

function handleDrop(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth = 0
  dragActive.value = false
  if (capture.isRecording.value) return
  const file = pickAudioFile(event.dataTransfer)
  if (file) acceptAudio(file, file.name)
  else sourceError.value = t('dropNotAudio')
}

window.addEventListener('dragenter', handleDragEnter)
window.addEventListener('dragover', handleDragOver)
window.addEventListener('dragleave', handleDragLeave)
window.addEventListener('drop', handleDrop)

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', handleDragEnter)
  window.removeEventListener('dragover', handleDragOver)
  window.removeEventListener('dragleave', handleDragLeave)
  window.removeEventListener('drop', handleDrop)
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
})
</script>

<template>
  <section class="analyze-page">
    <div v-if="dragActive" class="drop-overlay" aria-hidden="true">
      <div>
        <LucideIcon :icon="uploadIcon" :size="34" />
        <span>{{ t('dropAudioHint') }}</span>
      </div>
    </div>
    <header class="page-heading">
      <div>
        <p class="eyebrow">ESSENTIA.JS</p>
        <h1>{{ t('automaticAnalysis') }}</h1>
      </div>
      <span class="analysis-state" :class="{ working: analyzing, ready: result }">
        {{ analyzing ? t('analyzing') : result ? t('analysisReady') : t('waitingAudio') }}
      </span>
    </header>

    <div class="source-toolbar">
      <button class="source-button" type="button" :disabled="capture.isRecording.value" @click="fileInput.click()">
        <LucideIcon :icon="uploadIcon" :size="19" /><span>{{ t('uploadAudio') }}</span>
      </button>
      <input ref="fileInput" class="visually-hidden" type="file" accept="audio/*" @change="handleFile" />
      <button class="source-button" type="button" :disabled="capture.isRecording.value" @click="startRecording('microphone')">
        <LucideIcon :icon="micIcon" :size="19" /><span>{{ t('recordMicrophone') }}</span>
      </button>
      <button class="source-button" type="button" :disabled="capture.isRecording.value" @click="startRecording('system')">
        <LucideIcon :icon="monitorUpIcon" :size="19" /><span>{{ t('recordSystem') }}</span>
      </button>
      <button v-if="capture.isRecording.value" class="stop-recording" type="button" @click="capture.stopRecording">
        <LucideIcon :icon="squareIcon" :size="16" fill="currentColor" />
        <span>{{ t('stopRecording') }} · {{ capture.elapsedSeconds.value.toFixed(1) }}s</span>
      </button>
    </div>

    <div v-if="sourceName" class="source-summary">
      <LucideIcon :icon="fileAudioIcon" :size="20" />
      <span>{{ sourceName }}</span>
      <small v-if="result">{{ formatDuration(result.duration) }}</small>
    </div>
    <p v-if="sourceError || analysisError" class="error-message">{{ sourceError || analysisError }}</p>

    <div v-if="analyzing" class="analysis-progress"><i></i><span>{{ t('loadingEssentia') }}</span></div>

    <template v-if="result">
      <section class="analysis-results">
        <div><span>BPM</span><strong>{{ result.bpm.toFixed(2) }}</strong></div>
        <div class="confidence-result">
          <span>
            {{ t('confidence') }}
            <button class="confidence-help" type="button" :aria-label="t('confidenceGuide')">
              <LucideIcon :icon="circleHelpIcon" :size="14" />
              <span class="confidence-tooltip" role="tooltip">
                <b>{{ t('confidenceGuide') }}</b>
                <table>
                  <tbody>
                    <tr><td>0–1</td><td>{{ t('confidenceVeryLow') }}</td></tr>
                    <tr><td>1–1.5</td><td>{{ t('confidenceLow') }}</td></tr>
                    <tr><td>1.5–3.5</td><td>{{ t('confidenceGood') }}</td></tr>
                    <tr><td>3.5–5.32</td><td>{{ t('confidenceExcellent') }}</td></tr>
                  </tbody>
                </table>
              </span>
            </button>
          </span>
          <strong>{{ result.confidence.toFixed(2) }}<small>/ 5.32</small></strong>
          <em :class="confidenceLevel.tone">{{ t(confidenceLevel.key) }}</em>
        </div>
        <div><span>{{ t('detectedBeats') }}</span><strong>{{ result.ticks.length }}</strong></div>
        <div><span>{{ t('duration') }}</span><strong>{{ formatDuration(result.duration) }}</strong></div>
      </section>

      <section class="grid-editor">
        <div class="section-heading">
          <div><p class="eyebrow">BEAT GRID</p><h2>{{ t('beatGrid') }}</h2></div>
          <span>{{ numerator }}/{{ denominator }}</span>
        </div>
        <div class="grid-controls">
          <label><span>BPM</span><span class="input-action"><input v-model.number="editableBpm" type="number" min="35" max="240" step="1" /><button type="button" :title="t('roundBpm')" :aria-label="t('roundBpm')" @click="editableBpm = Math.round(playerBpm)"><LucideIcon :icon="hashIcon" :size="15" /></button></span></label>
          <label><span>{{ t('gridOrigin') }}</span><span class="input-action"><input v-model.number="gridOriginMs" type="number" min="0" :max="Math.round(result.duration * 1000)" step="1" /><button type="button" :title="t('originFromPlayhead')" :aria-label="t('originFromPlayhead')" @click="setOriginFromPlayhead"><LucideIcon :icon="locateFixedIcon" :size="15" /></button></span></label>
          <label><span>{{ t('beats') }}</span><input v-model.number="numerator" type="number" min="1" max="16" step="1" /></label>
          <label><span>{{ t('note') }}</span><select v-model.number="denominator"><option :value="2">2</option><option :value="4">4</option><option :value="8">8</option><option :value="16">16</option></select></label>
          <label class="metronome-cell"><span>{{ t('metronome') }}</span><span class="metronome-row"><button type="button" class="metronome-toggle" :class="{ active: metronomeEnabled }" :title="t('synchronizedMetronome')" :aria-pressed="metronomeEnabled" @click="metronomeEnabled = !metronomeEnabled"><LucideIcon :icon="metronomeIcon" :size="17" /></button><input v-model.number="metronomeVolume" type="range" min="0" max="100" step="5" :title="t('metronomeVolume')" :aria-label="t('metronomeVolume')" /></span></label>
          <label class="metronome-cell"><span>OSZ</span><button type="button" class="metronome-toggle export-osz" :title="t('exportOsz')" :disabled="exporting" @click="exportOsz"><small v-if="exporting">{{ exportProgress }}%</small><LucideIcon v-else :icon="packageIcon" :size="17" /></button></label>
        </div>
      </section>

      <section class="spectrum-section">
        <button class="spectrum-toggle" type="button" :aria-expanded="spectrumExpanded" @click="spectrumExpanded = !spectrumExpanded">
          <LucideIcon v-if="spectrumExpanded" :icon="chevronDownIcon" :size="18" />
          <LucideIcon v-else :icon="chevronRightIcon" :size="18" />
          <span>{{ t('spectrumPlayer') }}</span>
          <small>{{ spectrumExpanded ? t('collapse') : t('expand') }}</small>
        </button>
        <div class="spectrum-body" :class="{ collapsed: !spectrumExpanded }">
          <SpectrumPlayer
            v-if="audioUrl"
            ref="playerRef"
            :url="audioUrl"
            :duration="result.duration"
            :bpm="playerBpm"
            :origin="playerOrigin"
            :numerator="playerNumerator"
            :denominator="playerDenominator"
            :metronome-enabled="metronomeEnabled"
            :metronome-volume="metronomeVolume"
            @update:origin="gridOrigin = $event"
          />
        </div>
      </section>
    </template>
  </section>
</template>
