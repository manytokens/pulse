import { computed, onBeforeUnmount, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { calculateCorrectedBpm, requiredTapsForLock } from '../tempo.ts'
import type { TimeSignature } from './useTimeSignature.ts'

export interface TempoMeasurementOptions {
  activeSignature: ComputedRef<TimeSignature>
  onLock?: (currentBeat: number) => void
  onTempoUpdate?: (bpm: number) => void
  onReset?: () => void
}

export function useTempoMeasurement({ activeSignature, onLock, onTempoUpdate, onReset }: TempoMeasurementOptions) {
  const tapTimes = ref<number[]>([])
  const totalTaps = ref(0)
  const bpm = ref<number | null>(null)
  const stability = ref(0)
  const standardDeviation = ref<number | null>(null)
  const lastInterval = ref<number | null>(null)
  const isStable = ref(false)
  const justTapped = ref(false)
  let tapFeedbackTimer: number | undefined

  const tapCount = computed(() => totalTaps.value)
  const tapsUntilLock = computed(() => Math.max(0, requiredTapsForLock(activeSignature.value.numerator) - tapCount.value))
  const bpmDisplay = computed(() => (bpm.value ? Math.round(bpm.value) : '--'))

  function updateMeasurement(): void {
    if (tapTimes.value.length < 2) return
    const intervals = tapTimes.value.slice(1).map((time, index) => time - tapTimes.value[index])
    lastInterval.value = intervals.at(-1) ?? null
    const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    const variance = intervals.reduce((sum, interval) => sum + (interval - average) ** 2, 0) / intervals.length
    standardDeviation.value = Math.sqrt(variance)

    const previousBpm = bpm.value
    bpm.value = calculateCorrectedBpm(tapTimes.value, previousBpm, isStable.value)
    stability.value = Math.max(0, Math.min(100, 100 - (standardDeviation.value / average) * 700))
    const requiredIntervals = requiredTapsForLock(activeSignature.value.numerator) - 1
    const stableNow = intervals.length >= requiredIntervals && stability.value >= 78

    if (isStable.value && previousBpm) {
      onTempoUpdate?.(bpm.value)
    } else if (stableNow && !isStable.value) {
      isStable.value = true
      onLock?.((totalTaps.value - 1) % activeSignature.value.numerator)
    }
  }

  function resetMeasurement(): void {
    tapTimes.value = []
    totalTaps.value = 0
    bpm.value = null
    stability.value = 0
    standardDeviation.value = null
    lastInterval.value = null
    isStable.value = false
    onReset?.()
  }

  function handleTap(): void {
    const now = performance.now()
    const previous = tapTimes.value.at(-1)
    const interval = previous ? now - previous : null

    if (interval && interval < 160) return
    if (interval && interval > 3000) resetMeasurement()

    const sampleSize = requiredTapsForLock(activeSignature.value.numerator)
    tapTimes.value = [...tapTimes.value, now].slice(-sampleSize)
    totalTaps.value += 1
    justTapped.value = false
    requestAnimationFrame(() => {
      justTapped.value = true
      window.clearTimeout(tapFeedbackTimer)
      tapFeedbackTimer = window.setTimeout(() => (justTapped.value = false), 110)
    })
    updateMeasurement()
  }

  onBeforeUnmount(() => window.clearTimeout(tapFeedbackTimer))

  return {
    bpm,
    bpmDisplay,
    stability,
    standardDeviation,
    lastInterval,
    isStable,
    justTapped,
    tapCount,
    tapsUntilLock,
    totalTaps,
    handleTap,
    resetMeasurement,
  }
}
