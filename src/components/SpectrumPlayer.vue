<script setup vapor lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  Activity as activityIcon,
  AudioWaveform as audioWaveformIcon,
  ChartSpline as chartSplineIcon,
  ChevronLeft as chevronLeftIcon,
  ChevronRight as chevronRightIcon,
  ChevronsLeft as chevronsLeftIcon,
  ChevronsRight as chevronsRightIcon,
  Gauge as gaugeIcon,
  Maximize2 as maximizeIcon,
  Minimize2 as minimizeIcon,
  Pause as pauseIcon,
  Play as playIcon,
  ScanLine as scanLineIcon,
  SlidersHorizontal as slidersIcon,
  Volume2 as volume2Icon,
  VolumeX as volumeXIcon,
  ZoomIn as zoomInIcon,
} from 'lucide'
import { useI18n } from 'vue-i18n'
import { clearInterval as clearWorkerInterval, setInterval as setWorkerInterval } from 'worker-timers'
import { barTimeToSeconds, collectScheduledBeats, findNextBeatIndex, formatBarTime, generateBeatGrid } from '../audio-grid.ts'
import { normalizeSpectrogramHopSize, SPECTROGRAM_HOP_SIZES } from '../spectrogram-resolution.ts'
import { SPECTROGRAM_DEFAULT_SETTINGS } from '../spectrogram-palette.ts'
import { buildFrequencyTicks } from '../spectrum-axis.ts'
import { chooseTimeTickStep, formatClockTime, snapAdjacent, visibleGridRange } from '../transport.ts'
import LucideIcon from './LucideIcon.vue'
import DawSpectrogram from './DawSpectrogram.vue'
import LiveSpectrum from './LiveSpectrum.vue'

const props = defineProps({
  url: { type: String, required: true },
  duration: { type: Number, required: true },
  bpm: { type: Number, required: true },
  origin: { type: Number, required: true },
  numerator: { type: Number, required: true },
  denominator: { type: Number, required: true },
  metronomeEnabled: { type: Boolean, default: false },
  metronomeVolume: { type: Number, default: 70 },
})
const emit = defineEmits(['update:origin'])
const { t } = useI18n({ useScope: 'global' })

const STACK_HEIGHT = 360
const MAX_PPS = 3000

const playerElement = ref<HTMLDivElement | null>(null)
const visualizerElement = ref<HTMLDivElement | null>(null)
const rulerCanvas = ref<HTMLCanvasElement | null>(null)
const waveCanvas = ref<HTMLCanvasElement | null>(null)
const gridCanvas = ref<HTMLCanvasElement | null>(null)
const barInputElement = ref<HTMLInputElement | null>(null)
const ready = ref(false)
const playing = ref(false)
const currentTime = ref(0)
const volume = ref(0.8)
const playbackRate = ref(1)
const zoom = ref(40)
const visibleStart = ref(0)
const visibleEnd = ref(props.duration)
const renderPixelsPerSecond = ref(40)
const decodedBuffer = shallowRef<AudioBuffer | null>(null)
const analyserNode = shallowRef<AnalyserNode | null>(null)
const fullscreen = ref(false)
const barEditing = ref(false)
const barInput = ref('')
const msEditing = ref(false)
const msInput = ref('')
const msInputElement = ref<HTMLInputElement | null>(null)
const visualMode = ref(localStorage.getItem('pulse-visual-mode') || 'waveform')

const spectrogramResolution = ref(normalizeSpectrogramHopSize(localStorage.getItem('pulse-spectrum-resolution')))
const storedSpectrumSettings = readSpectrumSettings()
const spectrumSettingsOpen = ref(false)
const spectrumFftSize = ref(storedSpectrumSettings.fftSize || 1024)
const spectrumScale = ref(storedSpectrumSettings.scale || 'linear')
const spectrumMinFrequency = ref(storedSpectrumSettings.minFrequency ?? 125)
const spectrumMaxFrequency = ref(storedSpectrumSettings.maxFrequency || 7000)
const spectrumCutoff = ref(storedSpectrumSettings.cutoff ?? SPECTROGRAM_DEFAULT_SETTINGS.cutoff)
const spectrumIntensity = ref(storedSpectrumSettings.intensity || SPECTROGRAM_DEFAULT_SETTINGS.intensity)
const spectrumBrightness = ref(storedSpectrumSettings.brightness ?? SPECTROGRAM_DEFAULT_SETTINGS.brightness)
const fftSizes = [256, 512, 1024, 2048, 4096, 8192]
const minimumFrequencies = Array.from({ length: 13 }, (_, index) => index * 125)
const maximumFrequencies = Array.from({ length: 6 }, (_, index) => 5000 + index * 1000)

let audioEl: HTMLAudioElement | undefined
let audioCtx: AudioContext | undefined
let mediaSourceNode: MediaElementAudioSourceNode | undefined
let clickTimer: number | undefined
let followSuspended = false
let panSuppressClick = false
let nextBeatIndex = 0
const scheduledClicks = new Set<OscillatorNode>()
let frameHandle: number | undefined
let resizeObserver: ResizeObserver | undefined
let loadToken = 0

// View state lives outside Vue reactivity: it changes every animation frame.
let viewStart = 0
let pps = 40
let lastWidth = 0
let waveDirty = true
let gridDirty = true
let rulerDirty = true
interface PeakLevel {
  block: number
  mins: Float32Array
  maxs: Float32Array
}

interface PeakLevels {
  levels: PeakLevel[]
  samples: Float32Array
  sampleRate: number
}

interface ThemePalette {
  muted: string
  accent: string
  signal: string
  ink: string
}

interface StoredSpectrumSettings {
  fftSize?: number
  scale?: string
  minFrequency?: number
  maxFrequency?: number
  cutoff?: number
  intensity?: number
  brightness?: number
}

let peakLevels: PeakLevels | null = null
let palette: ThemePalette | null = null

function readSpectrumSettings(): StoredSpectrumSettings {
  try {
    return JSON.parse(localStorage.getItem('pulse-spectrum-settings-v4') || '{}')
  } catch {
    return {}
  }
}

const beatGrid = computed(() => generateBeatGrid(props))
const beatLength = computed(() => 60 / Math.max(1, props.bpm))
const barLength = computed(() => beatLength.value * Math.max(1, props.numerator))
const cursorLeft = computed(() => timeToPercent(currentTime.value))
const originLeft = computed(() => timeToPercent(props.origin))
const originVisible = computed(() => props.origin >= visibleStart.value - 0.001 && props.origin <= visibleEnd.value + 0.001)
const barTimeDisplay = computed(() => formatBarTime({
  time: currentTime.value,
  bpm: props.bpm,
  origin: props.origin,
  numerator: props.numerator,
}))
const spectrogramTicks = computed(() => buildFrequencyTicks({
  scale: spectrumScale.value,
  minFrequency: spectrumMinFrequency.value,
  maxFrequency: spectrumMaxFrequency.value,
  maxTicks: 8,
}))

function timeToPercent(time: number) {
  const range = Math.max(0.001, visibleEnd.value - visibleStart.value)
  return Math.max(0, Math.min(100, ((time - visibleStart.value) / range) * 100))
}

function getWidth() {
  return visualizerElement.value?.clientWidth || 1
}

function fitPps() {
  return getWidth() / Math.max(0.001, props.duration)
}

function clampView() {
  pps = Math.max(fitPps(), Math.min(MAX_PPS, pps))
  const span = getWidth() / pps
  if (span >= props.duration) viewStart = 0
  else viewStart = Math.max(0, Math.min(props.duration - span, viewStart))
}

function applyView() {
  clampView()
  const span = getWidth() / pps
  visibleStart.value = viewStart
  visibleEnd.value = Math.min(props.duration, viewStart + span)
  renderPixelsPerSecond.value = pps
  waveDirty = true
  gridDirty = true
  rulerDirty = true
}

function setZoom(nextPps: number, anchorTime?: number, anchorX?: number) {
  const width = getWidth()
  const clamped = Math.max(fitPps(), Math.min(MAX_PPS, nextPps))
  const time = anchorTime ?? viewStart + width / pps / 2
  const x = anchorX ?? width / 2
  pps = clamped
  viewStart = time - x / pps
  applyView()
  zoom.value = Math.round(pps)
}

function changeZoom() {
  const playhead = currentTime.value
  const width = getWidth()
  const inView = playhead >= visibleStart.value && playhead <= visibleEnd.value
  const anchorTime = inView ? playhead : viewStart + width / pps / 2
  const anchorX = inView ? (playhead - viewStart) * pps : width / 2
  setZoom(Number(zoom.value), anchorTime, anchorX)
}

function ensureVisible(time: number) {
  const span = getWidth() / pps
  if (span >= props.duration) return
  if (time < viewStart + span * 0.05 || time > viewStart + span * 0.95) {
    viewStart = time - span / 2
    applyView()
  }
}

function seekTo(time: number, { follow = true }: { follow?: boolean } = {}) {
  if (!audioEl) return
  const target = Math.max(0, Math.min(props.duration, time))
  audioEl.currentTime = target
  currentTime.value = target
  resetBeatCursor()
  followSuspended = false
  if (follow) ensureVisible(target)
}

function stepBy(direction: number, unit: 'beat' | 'bar') {
  const stepLength = unit === 'bar' ? barLength.value : beatLength.value
  seekTo(snapAdjacent(audioEl?.currentTime ?? 0, { origin: props.origin, stepLength, direction }))
}

function togglePlayback() {
  if (!audioEl || !ready.value) return
  ensureAudioGraph()
  if (audioEl.paused) audioEl.play()
  else audioEl.pause()
}

function seekFromVisualizer(event: MouseEvent) {
  if (visualMode.value === 'live' || panSuppressClick) return
  const bounds = visualizerElement.value!.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  seekTo(visibleStart.value + ratio * (visibleEnd.value - visibleStart.value), { follow: false })
}

function handleWheel(event: WheelEvent) {
  if (!ready.value) return
  const direction = event.deltaY > 0 ? 1 : -1
  if (event.ctrlKey || event.metaKey) {
    const bounds = visualizerElement.value!.getBoundingClientRect()
    const anchorX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
    const anchorTime = viewStart + anchorX / pps
    setZoom(pps * (direction > 0 ? 0.8 : 1.25), anchorTime, anchorX)
  } else if (event.shiftKey) {
    seekTo((audioEl?.currentTime ?? 0) + direction * 0.01)
  } else {
    stepBy(direction, 'beat')
  }
}

function beginPan(event: PointerEvent) {
  // Middle-button drag (or Alt + left drag) pans the view like a DAW.
  const middleButton = event.button === 1
  const altLeftButton = event.button === 0 && event.altKey
  if ((!middleButton && !altLeftButton) || visualMode.value === 'live' || !ready.value) return
  event.preventDefault()
  const startX = event.clientX
  const startViewTime = viewStart
  let moved = false
  const move = (pointerEvent: PointerEvent) => {
    const delta = pointerEvent.clientX - startX
    if (Math.abs(delta) > 2) moved = true
    viewStart = startViewTime - delta / pps
    if (playing.value) followSuspended = true
    applyView()
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    if (moved) {
      panSuppressClick = true
      window.setTimeout(() => { panSuppressClick = false }, 0)
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}

function beginRulerScrub(event: PointerEvent) {
  if (!ready.value) return
  event.preventDefault()
  const scrub = (pointerEvent: PointerEvent) => {
    const bounds = rulerCanvas.value!.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (pointerEvent.clientX - bounds.left) / bounds.width))
    seekTo(visibleStart.value + ratio * (visibleEnd.value - visibleStart.value), { follow: false })
  }
  scrub(event)
  const end = () => {
    window.removeEventListener('pointermove', scrub)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', scrub)
  window.addEventListener('pointerup', end, { once: true })
}

function beginOriginDrag(event: PointerEvent) {
  event.preventDefault()
  const move = (pointerEvent: PointerEvent) => {
    const bounds = visualizerElement.value!.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (pointerEvent.clientX - bounds.left) / bounds.width))
    const time = visibleStart.value + ratio * (visibleEnd.value - visibleStart.value)
    emit('update:origin', Number(time.toFixed(3)))
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}

function editBarTime() {
  barInput.value = barTimeDisplay.value
  barEditing.value = true
  requestAnimationFrame(() => barInputElement.value?.select())
}

function commitBarTime() {
  const time = barTimeToSeconds(barInput.value, { bpm: props.bpm, origin: props.origin, numerator: props.numerator })
  if (time !== null) seekTo(time)
  barEditing.value = false
}

function editMsTime() {
  msInput.value = String(Math.round(currentTime.value * 1000))
  msEditing.value = true
  requestAnimationFrame(() => msInputElement.value?.select())
}

function commitMsTime() {
  const milliseconds = Number(msInput.value)
  if (Number.isFinite(milliseconds)) seekTo(milliseconds / 1000)
  msEditing.value = false
}

function changeVolume() {
  if (audioEl) audioEl.volume = Number(volume.value)
}

function toggleMute() {
  volume.value = volume.value > 0 ? 0 : 0.8
  changeVolume()
}

function changePlaybackRate() {
  if (audioEl) audioEl.playbackRate = Number(playbackRate.value)
  restartClickScheduler()
}

function setVisualMode(mode: string) {
  visualMode.value = mode
  localStorage.setItem('pulse-visual-mode', mode)
  waveDirty = true
  gridDirty = true
  if (mode === 'live') ensureAudioGraph({ resume: false })
}

function changeSpectrogramResolution() {
  spectrogramResolution.value = normalizeSpectrogramHopSize(spectrogramResolution.value)
  localStorage.setItem('pulse-spectrum-resolution', String(spectrogramResolution.value))
}

function persistSpectrumSettings() {
  localStorage.setItem('pulse-spectrum-settings-v4', JSON.stringify({
    fftSize: spectrumFftSize.value,
    scale: spectrumScale.value,
    minFrequency: spectrumMinFrequency.value,
    maxFrequency: spectrumMaxFrequency.value,
    cutoff: spectrumCutoff.value,
    intensity: spectrumIntensity.value,
    brightness: spectrumBrightness.value,
  }))
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await playerElement.value?.requestFullscreen()
}

function handleFullscreenChange() {
  fullscreen.value = Boolean(document.fullscreenElement)
  palette = null
}

function handleKeyboard(event: KeyboardEvent) {
  const target = event.target
  const isTyping = target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLInputElement && ['text', 'number', 'file', 'checkbox'].includes(target.type)
  if (event.code === 'Space' && !event.repeat && !isTyping) {
    event.preventDefault()
    togglePlayback()
    return
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  if (event.ctrlKey || event.metaKey) {
    emit('update:origin', Number(Math.max(0, Math.min(props.duration, props.origin + direction * 0.01)).toFixed(3)))
  } else {
    stepBy(direction, event.shiftKey ? 'bar' : 'beat')
  }
}

// --- Audio engine -----------------------------------------------------------

function ensureAudioGraph({ resume = true }: { resume?: boolean } = {}) {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!audioCtx) audioCtx = new AudioContextClass()
  if (resume && audioCtx.state === 'suspended') audioCtx.resume()
  if (!mediaSourceNode && audioEl) {
    try {
      mediaSourceNode = audioCtx.createMediaElementSource(audioEl)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.8
      analyser.minDecibels = -90
      analyser.maxDecibels = -20
      mediaSourceNode.connect(analyser)
      analyser.connect(audioCtx.destination)
      analyserNode.value = analyser
    } catch {
      // Media element already routed elsewhere; playback continues directly.
    }
  }
}

async function loadAudio(url: string) {
  if (!audioEl) return
  const token = ++loadToken
  ready.value = false
  playing.value = false
  stopClickScheduler()
  decodedBuffer.value = null
  peakLevels = null
  currentTime.value = 0
  audioEl.src = url
  audioEl.load()
  audioEl.playbackRate = Number(playbackRate.value)
  try {
    const response = await fetch(url)
    const encoded = await response.arrayBuffer()
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtx) audioCtx = new AudioContextClass()
    const buffer = await audioCtx.decodeAudioData(encoded)
    if (token !== loadToken) return
    decodedBuffer.value = buffer
    peakLevels = buildPeakLevels(buffer)
    ready.value = true
    viewStart = 0
    pps = fitPps()
    zoom.value = Math.round(pps)
    applyView()
    resetBeatCursor()
  } catch {
    if (token === loadToken) ready.value = false
  }
}

function buildPeakLevels(buffer: AudioBuffer): PeakLevels {
  const samples = buffer.getChannelData(0)
  const baseBlock = 128
  const baseCount = Math.ceil(samples.length / baseBlock)
  let mins = new Float32Array(baseCount)
  let maxs = new Float32Array(baseCount)
  for (let block = 0; block < baseCount; block += 1) {
    const start = block * baseBlock
    const end = Math.min(samples.length, start + baseBlock)
    let low = samples[start] || 0
    let high = low
    for (let index = start + 1; index < end; index += 1) {
      const value = samples[index]
      if (value < low) low = value
      if (value > high) high = value
    }
    mins[block] = low
    maxs[block] = high
  }
  const levels: PeakLevel[] = [{ block: baseBlock, mins, maxs }]
  while (levels[levels.length - 1].mins.length > 2048) {
    const previous = levels[levels.length - 1]
    const count = Math.ceil(previous.mins.length / 4)
    const nextMins = new Float32Array(count)
    const nextMaxs = new Float32Array(count)
    for (let block = 0; block < count; block += 1) {
      const start = block * 4
      const end = Math.min(previous.mins.length, start + 4)
      let low = previous.mins[start]
      let high = previous.maxs[start]
      for (let index = start + 1; index < end; index += 1) {
        if (previous.mins[index] < low) low = previous.mins[index]
        if (previous.maxs[index] > high) high = previous.maxs[index]
      }
      nextMins[block] = low
      nextMaxs[block] = high
    }
    levels.push({ block: previous.block * 4, mins: nextMins, maxs: nextMaxs })
  }
  return { levels, samples, sampleRate: buffer.sampleRate }
}

// --- Metronome --------------------------------------------------------------

function scheduleClick(time: number, accent: boolean) {
  if (!audioCtx) return
  const oscillator = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  oscillator.frequency.value = accent ? 1320 : 880
  // Volume 0-100 maps to 0-2.5x of the original fixed level.
  const level = Math.max(0.001, (props.metronomeVolume / 100) * 2.5)
  gain.gain.setValueAtTime((accent ? 0.2 : 0.1) * level, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045)
  oscillator.connect(gain).connect(audioCtx.destination)
  oscillator.onended = () => scheduledClicks.delete(oscillator)
  scheduledClicks.add(oscillator)
  oscillator.start(time)
  oscillator.stop(time + 0.05)
}

function resetBeatCursor() {
  nextBeatIndex = findNextBeatIndex(beatGrid.value, audioEl?.currentTime || 0)
}

function clickScheduler() {
  if (!playing.value || !props.metronomeEnabled || !audioEl || !audioCtx) return
  const mediaTime = audioEl.currentTime
  const rate = audioEl.playbackRate || 1
  const schedule = collectScheduledBeats({ grid: beatGrid.value, startIndex: nextBeatIndex, currentTime: mediaTime, playbackRate: rate })
  schedule.events.forEach(({ beat, delay }) => scheduleClick(audioCtx!.currentTime + delay, beat.isBar))
  nextBeatIndex = schedule.nextIndex
}

function stopClickScheduler() {
  if (clickTimer !== undefined) clearWorkerInterval(clickTimer)
  clickTimer = undefined
  scheduledClicks.forEach((oscillator) => {
    try { oscillator.stop() } catch { /* already stopped */ }
  })
  scheduledClicks.clear()
}

function startClickScheduler() {
  stopClickScheduler()
  if (!props.metronomeEnabled || !playing.value) return
  ensureAudioGraph()
  resetBeatCursor()
  clickTimer = setWorkerInterval(clickScheduler, 25)
  clickScheduler()
}

function restartClickScheduler() {
  if (playing.value) startClickScheduler()
  else resetBeatCursor()
}

// --- Canvas rendering -------------------------------------------------------

function getPalette() {
  if (palette) return palette
  const styles = getComputedStyle(document.documentElement)
  palette = {
    muted: styles.getPropertyValue('--muted').trim() || '#8b8e94',
    accent: styles.getPropertyValue('--accent').trim() || '#d2603a',
    signal: styles.getPropertyValue('--signal').trim() || '#1f6f8b',
    ink: styles.getPropertyValue('--ink').trim() || '#1c1d1f',
  }
  return palette
}

function sizeCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const deviceWidth = Math.max(1, Math.round(cssWidth * dpr))
  const deviceHeight = Math.max(1, Math.round(cssHeight * dpr))
  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth
    canvas.height = deviceHeight
  }
  const context = canvas.getContext('2d')!
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  return context
}

function drawWave() {
  waveDirty = false
  if (!waveCanvas.value) return
  const width = getWidth()
  const context = sizeCanvas(waveCanvas.value, width, STACK_HEIGHT)
  context.clearRect(0, 0, width, STACK_HEIGHT)
  if (!peakLevels || visualMode.value !== 'waveform') return
  const { levels, samples, sampleRate } = peakLevels
  const samplesPerPixel = sampleRate / pps
  // Quantize the draw origin to a whole pixel so per-column min/max windows
  // stay stable while the view scrolls; otherwise the waveform shimmers.
  const quantizedStart = Math.round(viewStart * pps) / pps
  const middle = STACK_HEIGHT / 2
  const amplitude = STACK_HEIGHT * 0.46
  context.fillStyle = getPalette().signal
  context.globalAlpha = 0.85
  context.beginPath()
  let level = null
  for (const candidate of levels) {
    if (candidate.block * 2 <= samplesPerPixel) level = candidate
  }
  for (let x = 0; x < width; x += 1) {
    const startSample = (quantizedStart + x / pps) * sampleRate
    const endSample = startSample + samplesPerPixel
    if (startSample >= samples.length) break
    let low = Infinity
    let high = -Infinity
    if (level) {
      const firstBlock = Math.max(0, Math.floor(startSample / level.block))
      const lastBlock = Math.min(level.mins.length - 1, Math.max(firstBlock, Math.ceil(endSample / level.block) - 1))
      for (let block = firstBlock; block <= lastBlock; block += 1) {
        if (level.mins[block] < low) low = level.mins[block]
        if (level.maxs[block] > high) high = level.maxs[block]
      }
    } else {
      const first = Math.max(0, Math.floor(startSample))
      const last = Math.min(samples.length, Math.ceil(endSample))
      for (let index = first; index < last; index += 1) {
        const value = samples[index]
        if (value < low) low = value
        if (value > high) high = value
      }
    }
    if (low === Infinity) continue
    const top = middle - high * amplitude
    const bottom = middle - low * amplitude
    context.rect(x, top, 1, Math.max(1, bottom - top))
  }
  context.fill()
  context.globalAlpha = 1
}

function drawGrid() {
  gridDirty = false
  if (!gridCanvas.value) return
  const width = getWidth()
  const context = sizeCanvas(gridCanvas.value, width, STACK_HEIGHT)
  context.clearRect(0, 0, width, STACK_HEIGHT)
  if (visualMode.value === 'live' || !ready.value) return
  const onDark = visualMode.value === 'spectrogram'
  // Cyan/green are absent from the spectrogram palette, so the grid and
  // playhead stay readable on top of it.
  const lineColor = onDark ? '#45e0ff' : getPalette().signal
  const beatPx = beatLength.value * pps
  const barPx = barLength.value * pps
  const viewEnd = viewStart + width / pps
  const drawLine = (x: number, alpha: number, lineWidth = 1) => {
    context.globalAlpha = alpha
    context.fillStyle = lineColor
    context.fillRect(x - lineWidth / 2, 0, lineWidth, STACK_HEIGHT)
  }
  // Bars sparser than every bar when extremely zoomed out.
  const barStride = barPx >= 9 ? 1 : Math.ceil(9 / Math.max(0.0001, barPx))
  const { from, to } = visibleGridRange({ viewStart, viewEnd, origin: props.origin, stepLength: beatLength.value })
  context.font = '600 10px "JetBrains Mono", monospace'
  context.textAlign = 'left'
  for (let k = from; k <= to; k += 1) {
    const time = props.origin + k * beatLength.value
    if (time < -1e-6) continue
    if (time > props.duration) break
    const x = (time - viewStart) * pps
    const isBar = ((k % props.numerator) + props.numerator) % props.numerator === 0
    if (isBar) {
      const barNumber = k / props.numerator + 1
      if ((barNumber - 1) % barStride !== 0) continue
      drawLine(x, onDark ? 0.55 : 0.45, onDark ? 2.5 : 2)
      if (barPx * barStride >= 26) {
        context.globalAlpha = 1
        context.fillStyle = lineColor
        if (onDark) {
          context.shadowColor = 'rgba(0, 0, 0, 0.9)'
          context.shadowBlur = 3
        }
        context.font = '700 11px "JetBrains Mono", monospace'
        context.fillText(String(barNumber), x + 5, 13)
        context.shadowBlur = 0
      }
    } else if (beatPx >= 9) {
      drawLine(x, onDark ? 0.28 : 0.18)
      if (beatPx >= 56) drawLine(x + beatPx / 2, onDark ? 0.12 : 0.08)
    }
  }
  if (beatPx >= 9 && beatPx >= 56) {
    // half-beat before the first visible beat line
    const time = props.origin + (from - 0.5) * beatLength.value
    if (time >= 0) drawLine((time - viewStart) * pps, 0.08)
  }
  // Grid origin marker line.
  const originX = (props.origin - viewStart) * pps
  if (originX >= -2 && originX <= width + 2) {
    context.globalAlpha = 0.9
    context.fillStyle = getPalette().accent
    context.fillRect(originX - 1, 0, 2, STACK_HEIGHT)
  }
  context.globalAlpha = 1
}

function drawRuler() {
  rulerDirty = false
  if (!rulerCanvas.value) return
  const width = getWidth()
  const height = 34
  const context = sizeCanvas(rulerCanvas.value, width, height)
  context.clearRect(0, 0, width, height)
  if (!ready.value) return
  const colors = getPalette()
  const viewEnd = viewStart + width / pps
  // Time ticks along the bottom edge.
  const timeStep = chooseTimeTickStep(pps)
  context.font = '9px "JetBrains Mono", monospace'
  context.textAlign = 'left'
  for (let time = Math.ceil(viewStart / timeStep) * timeStep; time <= viewEnd; time += timeStep) {
    const x = (time - viewStart) * pps
    context.globalAlpha = 0.5
    context.fillStyle = colors.muted
    context.fillRect(x, height - 6, 1, 6)
    context.globalAlpha = 0.75
    context.fillText(formatClockTime(time, { fractional: timeStep < 1 }), x + 3, height - 2)
  }
  // Bar ticks with numbers (rhythm-editor style).
  const barPx = barLength.value * pps
  const barStride = barPx >= 9 ? Math.max(1, Math.ceil(34 / barPx)) : Math.ceil(34 / Math.max(0.0001, barPx))
  const beatPx = beatLength.value * pps
  const { from, to } = visibleGridRange({ viewStart, viewEnd, origin: props.origin, stepLength: beatLength.value })
  context.font = '700 10px "JetBrains Mono", monospace'
  for (let k = from; k <= to; k += 1) {
    const time = props.origin + k * beatLength.value
    if (time < -1e-6) continue
    if (time > props.duration) break
    const x = (time - viewStart) * pps
    const isBar = ((k % props.numerator) + props.numerator) % props.numerator === 0
    if (isBar) {
      const barNumber = k / props.numerator + 1
      if ((barNumber - 1) % barStride !== 0) continue
      context.globalAlpha = 0.9
      context.fillStyle = colors.accent
      context.fillRect(x, 2, 1.4, height - 10)
      context.fillText(String(barNumber), x + 4, 12)
    } else if (beatPx >= 10) {
      context.globalAlpha = 0.45
      context.fillStyle = colors.muted
      context.fillRect(x, 14, 1, height - 22)
    }
  }
  context.globalAlpha = 1
}

// --- Frame loop -------------------------------------------------------------

function frame() {
  frameHandle = requestAnimationFrame(frame)
  const width = getWidth()
  if (width !== lastWidth) {
    lastWidth = width
    applyView()
  }
  if (playing.value && audioEl) {
    const time = audioEl.currentTime
    currentTime.value = time
    const span = width / pps
    if (!followSuspended && span < props.duration - 0.001) {
      if (time > viewStart + span * 0.5) {
        viewStart = time - span * 0.5
        applyView()
      } else if (time < viewStart) {
        viewStart = time
        applyView()
      }
    }
  }
  if (waveDirty) drawWave()
  if (gridDirty) drawGrid()
  if (rulerDirty) drawRuler()
}

onMounted(() => {
  audioEl = new Audio()
  audioEl.preload = 'auto'
  audioEl.volume = volume.value
  audioEl.addEventListener('play', () => {
    playing.value = true
    followSuspended = false
    startClickScheduler()
  })
  audioEl.addEventListener('pause', () => {
    playing.value = false
    stopClickScheduler()
  })
  audioEl.addEventListener('ended', () => {
    playing.value = false
    stopClickScheduler()
  })
  loadAudio(props.url)
  resizeObserver = new ResizeObserver(() => {
    waveDirty = true
    gridDirty = true
    rulerDirty = true
  })
  if (visualizerElement.value) resizeObserver.observe(visualizerElement.value)
  frameHandle = requestAnimationFrame(frame)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('keydown', handleKeyboard)
})

watch(() => props.url, (url) => loadAudio(url))
watch(() => [props.bpm, props.origin, props.numerator, props.denominator], () => {
  restartClickScheduler()
  gridDirty = true
  rulerDirty = true
})
watch(() => props.metronomeEnabled, (enabled) => enabled ? startClickScheduler() : stopClickScheduler())
watch(() => [
  spectrumFftSize.value,
  spectrumScale.value,
  spectrumMinFrequency.value,
  spectrumMaxFrequency.value,
  spectrumCutoff.value,
  spectrumIntensity.value,
  spectrumBrightness.value,
], persistSpectrumSettings)

defineExpose({
  getCurrentTime: () => audioEl?.currentTime ?? 0,
  getDecodedBuffer: () => decodedBuffer.value,
})

onBeforeUnmount(() => {
  loadToken += 1
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('keydown', handleKeyboard)
  stopClickScheduler()
  resizeObserver?.disconnect()
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  audioCtx?.close()
})
</script>

<template>
  <div ref="playerElement" class="audio-workbench" @wheel.prevent="handleWheel">
    <div class="player-toolbar primary-controls">
      <button class="icon-button" type="button" :title="t('prevBar')" :aria-label="t('prevBar')" :disabled="!ready" @click="stepBy(-1, 'bar')"><LucideIcon :icon="chevronsLeftIcon" :size="18" /></button>
      <button class="icon-button" type="button" :title="t('prevBeat')" :aria-label="t('prevBeat')" :disabled="!ready" @click="stepBy(-1, 'beat')"><LucideIcon :icon="chevronLeftIcon" :size="18" /></button>
      <button class="play-button" type="button" :disabled="!ready" @click="togglePlayback"><LucideIcon v-if="playing" :icon="pauseIcon" :size="21" fill="currentColor" /><LucideIcon v-else :icon="playIcon" :size="21" fill="currentColor" /></button>
      <button class="icon-button" type="button" :title="t('nextBeat')" :aria-label="t('nextBeat')" :disabled="!ready" @click="stepBy(1, 'beat')"><LucideIcon :icon="chevronRightIcon" :size="18" /></button>
      <button class="icon-button" type="button" :title="t('nextBar')" :aria-label="t('nextBar')" :disabled="!ready" @click="stepBy(1, 'bar')"><LucideIcon :icon="chevronsRightIcon" :size="18" /></button>
      <span class="player-time">{{ formatClockTime(currentTime) }} / {{ formatClockTime(duration) }}</span>
      <button v-if="!barEditing" class="bar-clock" type="button" :title="t('barTime')" @click="editBarTime"><span>BAR</span>{{ barTimeDisplay }}</button>
      <input v-else ref="barInputElement" v-model="barInput" class="bar-clock-input" type="text" inputmode="decimal" @blur="commitBarTime" @keydown.enter.prevent="commitBarTime" @keydown.esc.prevent="barEditing = false" />
      <button v-if="!msEditing" class="bar-clock ms-clock" type="button" :title="t('msTime')" @click="editMsTime"><span>MS</span>{{ Math.round(currentTime * 1000) }}</button>
      <input v-else ref="msInputElement" v-model="msInput" class="bar-clock-input ms-clock-input" type="text" inputmode="numeric" @blur="commitMsTime" @keydown.enter.prevent="commitMsTime" @keydown.esc.prevent="msEditing = false" />
      <div class="visual-mode" role="group">
        <button type="button" :class="{ active: visualMode === 'waveform' }" :title="t('waveform')" @click="setVisualMode('waveform')"><LucideIcon :icon="audioWaveformIcon" :size="17" /></button>
        <button type="button" :class="{ active: visualMode === 'spectrogram' }" :title="t('spectrogram')" @click="setVisualMode('spectrogram')"><LucideIcon :icon="chartSplineIcon" :size="17" /></button>
        <button type="button" :class="{ active: visualMode === 'live' }" :title="t('liveSpectrum')" @click="setVisualMode('live')"><LucideIcon :icon="activityIcon" :size="17" /></button>
      </div>
      <button class="icon-button" type="button" :title="t('fullscreen')" :aria-label="t('fullscreen')" @click="toggleFullscreen"><LucideIcon v-if="fullscreen" :icon="minimizeIcon" :size="18" /><LucideIcon v-else :icon="maximizeIcon" :size="18" /></button>
    </div>

    <div class="daw-ruler" @pointerdown="beginRulerScrub">
      <canvas ref="rulerCanvas"></canvas>
    </div>

    <div ref="visualizerElement" class="visualizer-stack" :class="`mode-${visualMode}`" @click="seekFromVisualizer" @pointerdown="beginPan">
      <div class="visual-layer waveform-layer"><canvas ref="waveCanvas" class="wave-canvas"></canvas></div>
      <div class="visual-layer spectrogram-layer">
        <DawSpectrogram
          v-if="decodedBuffer"
          :audio-buffer="decodedBuffer"
          :duration="duration"
          :pixels-per-second="renderPixelsPerSecond"
          :visible-start="visibleStart"
          :visible-end="visibleEnd"
          :height="STACK_HEIGHT"
          :hop-size="spectrogramResolution"
          :fft-size="spectrumFftSize"
          :frequency-scale="spectrumScale"
          :minimum-frequency="spectrumMinFrequency"
          :maximum-frequency="spectrumMaxFrequency"
          :cutoff-factor="spectrumCutoff"
          :intensity-factor="spectrumIntensity"
          :brightness="spectrumBrightness"
        />
      </div>
      <div class="visual-layer live-layer">
        <LiveSpectrum
          :analyser="analyserNode"
          :active="visualMode === 'live'"
          :playing="playing"
          :audio-buffer="decodedBuffer"
          :current-time="currentTime"
          :frequency-scale="spectrumScale"
          :minimum-frequency="spectrumMinFrequency"
          :maximum-frequency="spectrumMaxFrequency"
        />
        <p v-if="!playing && !decodedBuffer" class="live-spectrum-hint">{{ t('liveSpectrumHint') }}</p>
      </div>
      <canvas ref="gridCanvas" class="grid-canvas"></canvas>
      <div v-if="visualMode === 'spectrogram'" class="spectrum-axis" aria-hidden="true">
        <span v-for="tick in spectrogramTicks" :key="tick.frequency" :style="{ top: `${(1 - tick.position) * 100}%` }">{{ tick.label }}</span>
      </div>
      <div class="playback-cursor" :style="{ left: `${cursorLeft}%` }"></div>
      <i v-if="visualMode !== 'live' && originVisible" class="origin-flag" :title="t('gridOrigin')" :style="{ left: `${originLeft}%` }" @click.stop @pointerdown.stop.prevent="beginOriginDrag"><span>1</span></i>
    </div>

    <input
      class="seek-bar"
      type="range"
      min="0"
      :max="duration"
      step="0.001"
      :value="currentTime"
      :disabled="!ready"
      :style="{ '--seek': `${duration ? (currentTime / duration) * 100 : 0}%` }"
      @input="seekTo(Number(($event.target as HTMLInputElement).value))"
    />

    <div class="player-toolbar secondary-controls">
      <label class="volume-control" :title="t('volume')"><button type="button" @click="toggleMute"><LucideIcon v-if="volume === 0" :icon="volumeXIcon" :size="17" /><LucideIcon v-else :icon="volume2Icon" :size="17" /></button><input v-model.number="volume" type="range" min="0" max="1" step="0.01" @input="changeVolume" /></label>
      <label class="rate-control"><LucideIcon :icon="gaugeIcon" :size="16" /><select v-model.number="playbackRate" :title="t('playbackRate')" @change="changePlaybackRate"><option :value="0.5">0.5×</option><option :value="0.75">0.75×</option><option :value="1">1×</option><option :value="1.25">1.25×</option><option :value="1.5">1.5×</option><option :value="2">2×</option></select></label>
      <label class="resolution-control" :title="t('spectrogramResolution')"><LucideIcon :icon="scanLineIcon" :size="16" /><select v-model.number="spectrogramResolution" @change="changeSpectrogramResolution"><option v-for="size in SPECTROGRAM_HOP_SIZES" :key="size" :value="size">{{ size }}</option></select></label>
      <button class="icon-button" type="button" :class="{ active: spectrumSettingsOpen }" :title="t('spectrumSettings')" :aria-label="t('spectrumSettings')" @click="spectrumSettingsOpen = !spectrumSettingsOpen"><LucideIcon :icon="slidersIcon" :size="17" /></button>
      <label class="zoom-control" :title="t('zoom')"><LucideIcon :icon="zoomInIcon" :size="16" /><input v-model.number="zoom" type="range" min="5" max="3000" step="5" @input="changeZoom" /></label>
    </div>
    <div v-if="spectrumSettingsOpen" class="spectrum-settings">
      <label><span>{{ t('fftSize') }}</span><select v-model.number="spectrumFftSize"><option v-for="size in fftSizes" :key="size" :value="size">{{ size }}</option></select></label>
      <label><span>{{ t('frequencyScale') }}</span><select v-model="spectrumScale"><option value="linear">Linear</option><option value="mel">Mel</option><option value="erb">ERB</option></select></label>
      <label><span>{{ t('minimumFrequency') }}</span><select v-model.number="spectrumMinFrequency"><option v-for="frequency in minimumFrequencies" :key="frequency" :value="frequency">{{ frequency }} Hz</option></select></label>
      <label><span>{{ t('maximumFrequency') }}</span><select v-model.number="spectrumMaxFrequency"><option v-for="frequency in maximumFrequencies" :key="frequency" :value="frequency">{{ frequency }} Hz</option></select></label>
      <label><span>{{ t('cutoffFactor') }} · {{ spectrumCutoff.toFixed(2) }}</span><input v-model.number="spectrumCutoff" type="range" min="0.2" max="0.4" step="0.02" /></label>
      <label><span>{{ t('intensityFactor') }} · {{ spectrumIntensity.toFixed(1) }}</span><input v-model.number="spectrumIntensity" type="range" min="5" max="9.5" step="0.5" /></label>
      <label><span>{{ t('brightness') }} · {{ spectrumBrightness }}%</span><input v-model.number="spectrumBrightness" type="range" min="20" max="100" step="10" /></label>
    </div>
  </div>
</template>
