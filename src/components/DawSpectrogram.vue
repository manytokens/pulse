<script setup vapor>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SpectrogramOrchestrator } from '@dawcore/spectrogram/orchestrator'
import SpectrogramWorker from '@dawcore/spectrogram/worker/spectrogram.worker?worker&inline'
import { normalizeSpectrogramHopSize } from '../spectrogram-resolution.js'
import { createSpectrogramColorMap, normalizeFftSize } from '../spectrogram-palette.js'

const props = defineProps({
  audioBuffer: { type: Object, required: true },
  duration: { type: Number, required: true },
  pixelsPerSecond: { type: Number, required: true },
  visibleStart: { type: Number, required: true },
  visibleEnd: { type: Number, required: true },
  hopSize: { type: Number, default: 128 },
  fftSize: { type: Number, default: 1024 },
  frequencyScale: { type: String, default: 'linear' },
  minimumFrequency: { type: Number, default: 125 },
  maximumFrequency: { type: Number, default: 7000 },
  cutoffFactor: { type: Number, default: 0.34 },
  intensityFactor: { type: Number, default: 9.5 },
  brightness: { type: Number, default: 100 },
  height: { type: Number, default: 220 },
})

const container = ref(null)
const TILE_WIDTH = 1000
// Below this tile count the whole timeline is registered up front: the
// orchestrator renders the visible tier first and fills the rest during idle
// time, so seeking never lands on an empty tile. Above it (extreme zoom ×
// long tracks) tiles fall back to a generously buffered window to bound
// canvas memory.
const FULL_RENDER_TILE_LIMIT = 64
const WINDOW_KEEP_MARGIN = 8
let activeLevel
let pendingLevel
let renderTimer
let generation = 0

function createWorker() {
  return new SpectrogramWorker()
}

function viewportFor(level) {
  const visibleStartPx = props.visibleStart * level.pixelsPerSecond
  const visibleEndPx = props.visibleEnd * level.pixelsPerSecond
  const overscan = Math.max(0, visibleEndPx - visibleStartPx)
  return {
    visibleStartPx,
    visibleEndPx,
    bufferStartPx: Math.max(0, visibleStartPx - overscan),
    bufferEndPx: Math.min(level.width, visibleEndPx + overscan),
    samplesPerPixel: props.audioBuffer.sampleRate / level.pixelsPerSecond,
  }
}

function positionLevel(level, previewPixelsPerSecond = level.pixelsPerSecond) {
  const scale = previewPixelsPerSecond / level.pixelsPerSecond
  // The worker paints each STFT frame at its window START, but the energy of
  // a transient is centered in the window, so onsets show up early. Shift the
  // layer right so each hop-wide strip sits centered on its analysis window:
  // delta = (window - hop) / 2 samples (5.4 ms at fft 512 / hop 32 / 44.1k).
  const fftSize = normalizeFftSize(props.fftSize)
  const hop = Math.min(fftSize, normalizeSpectrogramHopSize(props.hopSize))
  const centerShift = (fftSize - hop) / 2 / props.audioBuffer.sampleRate
  // Snap to whole device pixels: fractional translations make the GPU
  // resample the tile bitmaps at a different subpixel phase every frame,
  // which reads as shimmering when zoomed out.
  const dpr = window.devicePixelRatio || 1
  const offset = Math.round((props.visibleStart - centerShift) * previewPixelsPerSecond * dpr) / dpr
  level.element.style.transform = `translateX(${-offset}px) scaleX(${scale})`
}

const HEAVY_SYNC_INTERVAL = 150
let heavySyncTimer
let lastHeavySync = 0

function syncLevelViewport(level) {
  if (!level) return
  const tilesChanged = syncTiles(level)
  // Re-sending the viewport bumps the orchestrator's render generation and
  // repaints every canvas. The worker anchors FFT window alignment to the
  // start of each render batch, and batch grouping shifts with the viewport,
  // so identical audio comes back with subtly different pixels — visible as
  // shimmering during playback. Only send a viewport when the tile set
  // actually changed (new canvases need a render pass).
  if (tilesChanged || !level.viewportSent) {
    level.viewportSent = true
    level.orchestrator.setViewport(viewportFor(level))
  }
}

function heavySync() {
  lastHeavySync = performance.now()
  syncLevelViewport(activeLevel)
  syncLevelViewport(pendingLevel)
}

function updateViewport() {
  // Cheap transform-only follow: runs every frame during playback.
  if (activeLevel) positionLevel(activeLevel, props.pixelsPerSecond)
  if (pendingLevel) positionLevel(pendingLevel)
  // Heavy tile management and worker viewport updates are throttled.
  const elapsed = performance.now() - lastHeavySync
  if (elapsed >= HEAVY_SYNC_INTERVAL) {
    window.clearTimeout(heavySyncTimer)
    heavySyncTimer = undefined
    heavySync()
  } else if (heavySyncTimer === undefined) {
    heavySyncTimer = window.setTimeout(() => {
      heavySyncTimer = undefined
      heavySync()
    }, HEAVY_SYNC_INTERVAL - elapsed)
  }
}

function syncTiles(level) {
  const totalTiles = Math.max(1, Math.ceil(level.width / TILE_WIDTH))
  let changed = false
  let firstIndex = 0
  let lastIndex = totalTiles - 1
  if (totalTiles > FULL_RENDER_TILE_LIMIT) {
    const viewport = viewportFor(level)
    firstIndex = Math.max(0, Math.floor(viewport.bufferStartPx / TILE_WIDTH))
    lastIndex = Math.min(totalTiles - 1, Math.max(firstIndex, Math.ceil(viewport.bufferEndPx / TILE_WIDTH) - 1))
    for (const [index, tile] of level.tiles) {
      if (index >= firstIndex - WINDOW_KEEP_MARGIN && index <= lastIndex + WINDOW_KEEP_MARGIN) continue
      level.orchestrator.unregisterCanvas(tile.canvasId)
      tile.element.remove()
      level.tiles.delete(index)
      changed = true
    }
  }

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    if (level.tiles.has(index)) continue
    changed = true
    const tileWidth = Math.min(TILE_WIDTH, level.width - index * TILE_WIDTH)
    const canvas = document.createElement('canvas')
    const canvasId = `spectrum-${level.generation}-ch0-chunk${index}`
    canvas.className = 'daw-spectrogram-tile'
    canvas.style.left = `${index * TILE_WIDTH}px`
    canvas.style.width = `${tileWidth}px`
    canvas.style.height = `${props.height}px`
    level.element.appendChild(canvas)
    level.orchestrator.registerCanvas({
      canvasId,
      canvas: canvas.transferControlToOffscreen(),
      clipId: 'main-audio',
      trackId: 'main-track',
      channelIndex: 0,
      chunkIndex: index,
      globalPixelOffset: index * TILE_WIDTH,
      widthPx: tileWidth,
      heightPx: props.height,
    })
    level.tiles.set(index, { canvasId, element: canvas })
  }
  return changed
}

function disposeLevel(level) {
  if (!level) return
  level.orchestrator.dispose()
  level.element.remove()
}

async function prepareLevel(pixelsPerSecond) {
  const requestGeneration = ++generation
  disposeLevel(pendingLevel)
  pendingLevel = null

  const layer = document.createElement('div')
  const width = Math.max(1, Math.ceil(props.duration * pixelsPerSecond))
  layer.className = 'daw-spectrogram-level'
  layer.style.width = `${width}px`
  layer.style.height = `${props.height}px`
  layer.style.opacity = '0'
  container.value.appendChild(layer)

  const fftSize = normalizeFftSize(props.fftSize)
  const orchestrator = new SpectrogramOrchestrator({
    workerFactory: createWorker,
    workerPoolSize: 1,
    config: {
      fftSize,
      hopSize: Math.min(fftSize, normalizeSpectrogramHopSize(props.hopSize)),
      windowFunction: 'hann',
      zeroPaddingFactor: 1,
      frequencyScale: ['linear', 'mel', 'erb'].includes(props.frequencyScale) ? props.frequencyScale : 'linear',
      minFrequency: Math.max(0, props.minimumFrequency),
      maxFrequency: Math.max(props.minimumFrequency + 1, props.maximumFrequency),
      gainDb: 0,
      rangeDb: 100,
      labels: false,
    },
    colorMap: createSpectrogramColorMap(props.cutoffFactor, props.intensityFactor, props.brightness),
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  })
  const level = { element: layer, orchestrator, pixelsPerSecond, width, generation: requestGeneration, tiles: new Map() }
  pendingLevel = level

  orchestrator.registerClip({
    clipId: 'main-audio',
    trackId: 'main-track',
    channelData: [props.audioBuffer.getChannelData(0)],
    sampleRate: props.audioBuffer.sampleRate,
    durationSamples: props.audioBuffer.length,
    offsetSamples: 0,
  })

  orchestrator.addEventListener('viewport-ready', () => {
    if (requestGeneration !== generation || pendingLevel !== level) return
    positionLevel(level, props.pixelsPerSecond)
    level.element.style.opacity = '1'
    const previous = activeLevel
    activeLevel = level
    pendingLevel = null
    if (previous) {
      previous.element.style.opacity = '0'
      window.setTimeout(() => disposeLevel(previous), 180)
    }
  })
  syncTiles(level)
  level.viewportSent = true
  orchestrator.setViewport(viewportFor(level))
}

function scheduleLevel() {
  if (activeLevel) positionLevel(activeLevel, props.pixelsPerSecond)
  window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(() => prepareLevel(props.pixelsPerSecond), 120)
}

onMounted(() => prepareLevel(props.pixelsPerSecond))
watch(() => [
  props.pixelsPerSecond,
  props.hopSize,
  props.fftSize,
  props.frequencyScale,
  props.minimumFrequency,
  props.maximumFrequency,
  props.cutoffFactor,
  props.intensityFactor,
  props.brightness,
], scheduleLevel)
watch(() => [props.visibleStart, props.visibleEnd], updateViewport)

onBeforeUnmount(() => {
  generation += 1
  window.clearTimeout(renderTimer)
  window.clearTimeout(heavySyncTimer)
  disposeLevel(pendingLevel)
  disposeLevel(activeLevel)
})
</script>

<template>
  <div ref="container" class="daw-spectrogram-canvas" :style="{ height: `${height}px` }"></div>
</template>
