<script setup vapor>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FFT from 'fft.js'
import { buildFrequencyTicks, positionToFrequency } from '../spectrum-axis.js'

const props = defineProps({
  analyser: { type: Object, default: null },
  active: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  audioBuffer: { type: Object, default: null },
  currentTime: { type: Number, default: 0 },
  frequencyScale: { type: String, default: 'linear' },
  minimumFrequency: { type: Number, default: 0 },
  maximumFrequency: { type: Number, default: 20000 },
})

const COLUMN_STEP = 2
const FFT_SIZE = 4096
const BIN_COUNT = FFT_SIZE / 2
const MIN_DB = -90
const MAX_DB = -20

const host = ref(null)
const canvas = ref(null)
let context
let devicePixelScale = 1
let width = 0
let height = 0
let frameHandle
let mappingDirty = true
let columnBins = []
let ticks = []
let frequencyData = new Uint8Array(BIN_COUNT)
let levels = new Float32Array(0)
let peaks = new Float32Array(0)
let peakVelocities = new Float32Array(0)
let resizeObserver
// Offline FFT state for the paused view.
let offlineFft
let offlineInput
let offlineSpectrum
let offlineWindow
let offlineDirty = true

function sourceInfo() {
  if (props.playing && props.analyser) {
    return { nyquist: props.analyser.context.sampleRate / 2, binCount: props.analyser.frequencyBinCount }
  }
  if (props.audioBuffer) {
    return { nyquist: props.audioBuffer.sampleRate / 2, binCount: BIN_COUNT }
  }
  return null
}

function axisOptions() {
  return {
    scale: props.frequencyScale,
    minFrequency: Math.max(0, props.minimumFrequency),
    maxFrequency: Math.max(props.minimumFrequency + 1, props.maximumFrequency),
  }
}

function rebuildMapping() {
  mappingDirty = false
  ticks = buildFrequencyTicks({ ...axisOptions(), maxTicks: 9 })
  const columns = Math.max(1, Math.ceil(width / COLUMN_STEP))
  columnBins = new Array(columns)
  if (levels.length !== columns) {
    levels = new Float32Array(columns)
    peaks = new Float32Array(columns)
    peakVelocities = new Float32Array(columns)
  }
  const source = sourceInfo()
  if (!source) {
    columnBins.fill([0, 0])
    return
  }
  const options = axisOptions()
  for (let index = 0; index < columns; index += 1) {
    const startFrequency = positionToFrequency(index / columns, options)
    const endFrequency = positionToFrequency((index + 1) / columns, options)
    const firstBin = Math.max(0, Math.min(source.binCount - 1, Math.floor((startFrequency / source.nyquist) * source.binCount)))
    const lastBin = Math.max(firstBin + 1, Math.min(source.binCount, Math.ceil((endFrequency / source.nyquist) * source.binCount)))
    columnBins[index] = [firstBin, lastBin]
  }
}

function computeOfflineSpectrum() {
  offlineDirty = false
  frequencyData.fill(0)
  const buffer = props.audioBuffer
  if (!buffer) return
  if (!offlineFft) {
    offlineFft = new FFT(FFT_SIZE)
    offlineInput = new Array(FFT_SIZE)
    offlineSpectrum = offlineFft.createComplexArray()
    offlineWindow = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i += 1) offlineWindow[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE)
  }
  const samples = buffer.getChannelData(0)
  const center = Math.round(props.currentTime * buffer.sampleRate)
  const start = center - FFT_SIZE / 2
  let windowSum = 0
  for (let i = 0; i < FFT_SIZE; i += 1) windowSum += offlineWindow[i]
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const sampleIndex = start + i
    offlineInput[i] = (sampleIndex >= 0 && sampleIndex < samples.length ? samples[sampleIndex] : 0) * offlineWindow[i]
  }
  offlineFft.realTransform(offlineSpectrum, offlineInput)
  const scale = 2 / windowSum
  for (let bin = 0; bin < BIN_COUNT; bin += 1) {
    const re = offlineSpectrum[2 * bin]
    const im = offlineSpectrum[2 * bin + 1]
    const magnitude = Math.sqrt(re * re + im * im) * scale
    const db = 20 * Math.log10(magnitude + 1e-12)
    frequencyData[bin] = Math.max(0, Math.min(255, Math.round(((db - MIN_DB) / (MAX_DB - MIN_DB)) * 255)))
  }
}

function resizeCanvas() {
  const bounds = host.value?.getBoundingClientRect()
  if (!bounds || !canvas.value) return
  devicePixelScale = Math.min(window.devicePixelRatio || 1, 2)
  if (width !== bounds.width || height !== bounds.height) {
    width = bounds.width
    height = bounds.height
    canvas.value.width = Math.max(1, Math.round(width * devicePixelScale))
    canvas.value.height = Math.max(1, Math.round(height * devicePixelScale))
    mappingDirty = true
  }
}

function drawFrame() {
  frameHandle = undefined
  if (!props.active || !context) return
  if (mappingDirty) rebuildMapping()

  const live = props.playing && props.analyser
  if (live) {
    if (frequencyData.length !== props.analyser.frequencyBinCount) frequencyData = new Uint8Array(props.analyser.frequencyBinCount)
    props.analyser.getByteFrequencyData(frequencyData)
  } else if (offlineDirty) {
    if (frequencyData.length !== BIN_COUNT) frequencyData = new Uint8Array(BIN_COUNT)
    computeOfflineSpectrum()
  }

  for (let index = 0; index < columnBins.length; index += 1) {
    const [firstBin, lastBin] = columnBins[index]
    let strongest = 0
    for (let bin = firstBin; bin < lastBin; bin += 1) {
      if (frequencyData[bin] > strongest) strongest = frequencyData[bin]
    }
    const level = strongest / 255
    levels[index] = level
    if (!live) {
      // Paused view tracks the playhead exactly; no peak-hold trail.
      peaks[index] = level
      peakVelocities[index] = 0
    } else if (level >= peaks[index]) {
      peaks[index] = level
      peakVelocities[index] = 0
    } else {
      peakVelocities[index] += 0.00045
      peaks[index] = Math.max(level, peaks[index] - peakVelocities[index])
    }
  }

  context.setTransform(devicePixelScale, 0, 0, devicePixelScale, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#050607'
  context.fillRect(0, 0, width, height)

  context.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  context.lineWidth = 1
  for (const ratio of [0.25, 0.5, 0.75]) {
    context.beginPath()
    context.moveTo(0, height * ratio)
    context.lineTo(width, height * ratio)
    context.stroke()
  }
  context.font = '10px "JetBrains Mono", monospace'
  context.textAlign = 'center'
  for (const tick of ticks) {
    const x = tick.position * width
    context.strokeStyle = 'rgba(255, 255, 255, 0.07)'
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height - 16)
    context.stroke()
    context.fillStyle = 'rgba(255, 255, 255, 0.45)'
    context.fillText(tick.label, x, height - 5)
  }

  const floor = height - 17
  const gradient = context.createLinearGradient(0, floor, 0, 0)
  gradient.addColorStop(0, 'rgba(13, 8, 135, 0.9)')
  gradient.addColorStop(0.55, 'rgba(203, 70, 121, 0.92)')
  gradient.addColorStop(1, 'rgba(240, 249, 33, 0.95)')
  context.beginPath()
  context.moveTo(0, floor)
  for (let index = 0; index < levels.length; index += 1) {
    context.lineTo(index * COLUMN_STEP, floor - levels[index] * floor)
  }
  context.lineTo(width, floor)
  context.closePath()
  context.fillStyle = gradient
  context.fill()

  context.beginPath()
  for (let index = 0; index < levels.length; index += 1) {
    const x = index * COLUMN_STEP
    const y = floor - levels[index] * floor
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.strokeStyle = 'rgba(255, 214, 130, 0.65)'
  context.lineWidth = 1.4
  context.stroke()

  context.fillStyle = 'rgba(255, 255, 255, 0.38)'
  for (let index = 0; index < peaks.length; index += 1) {
    if (peaks[index] <= 0.004) continue
    context.fillRect(index * COLUMN_STEP, floor - peaks[index] * floor - 1, COLUMN_STEP, 1.4)
  }

  if (live) frameHandle = requestAnimationFrame(drawFrame)
}

function requestDraw() {
  if (frameHandle !== undefined || !props.active) return
  resizeCanvas()
  frameHandle = requestAnimationFrame(drawFrame)
}

function stopDrawing() {
  if (frameHandle !== undefined) cancelAnimationFrame(frameHandle)
  frameHandle = undefined
}

watch(() => props.analyser, () => {
  mappingDirty = true
})
watch(() => [props.active, props.playing, props.analyser, props.audioBuffer], () => {
  mappingDirty = true
  offlineDirty = true
  if (props.active) requestDraw()
  else stopDrawing()
})
watch(() => props.currentTime, () => {
  if (props.playing) return
  offlineDirty = true
  requestDraw()
})
watch(() => [props.frequencyScale, props.minimumFrequency, props.maximumFrequency], () => {
  mappingDirty = true
  offlineDirty = true
  requestDraw()
})

onMounted(() => {
  context = canvas.value.getContext('2d')
  resizeObserver = new ResizeObserver(() => {
    resizeCanvas()
    requestDraw()
  })
  resizeObserver.observe(host.value)
  resizeCanvas()
  if (props.active) requestDraw()
})

onBeforeUnmount(() => {
  stopDrawing()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="host" class="live-spectrum-host">
    <canvas ref="canvas" class="live-spectrum-canvas"></canvas>
  </div>
</template>
