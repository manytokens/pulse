import { onBeforeUnmount, ref } from 'vue'
import { clearInterval as clearWorkerInterval, setInterval as setWorkerInterval } from 'worker-timers'
import { planMetronomeWindow, quantizeTransportBpm, resolveTransportTempo } from '../metronome.js'

export function useMetronome({ bpm, isStable, activeSignature }) {
  const activeStep = ref(-1)
  const muted = ref(false)
  let audioContext
  let schedulerTimer
  let visualTimers = []
  let nextNoteTime = 0
  let currentStep = 0
  let transportBpm = null
  let pendingBpm = null

  function ensureAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!audioContext) audioContext = new AudioContextClass()
    if (audioContext.state === 'suspended') audioContext.resume()
  }

  function scheduleTick(time, step) {
    if (muted.value || !audioContext) return
    const downbeat = step === 0
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.frequency.value = downbeat ? 1320 : 880
    gain.gain.setValueAtTime(downbeat ? 0.22 : 0.12, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(time)
    oscillator.stop(time + 0.05)
  }

  function queueVisualStep(step, time) {
    const delay = Math.max(0, (time - audioContext.currentTime) * 1000)
    const timer = window.setTimeout(() => {
      activeStep.value = step
      visualTimers = visualTimers.filter((id) => id !== timer)
    }, delay)
    visualTimers.push(timer)
  }

  function scheduler() {
    if (!audioContext || !transportBpm) return
    const tempo = resolveTransportTempo({ currentStep, transportBpm, pendingBpm })
    transportBpm = tempo.transportBpm
    pendingBpm = tempo.pendingBpm
    const plan = planMetronomeWindow({
      nextNoteTime,
      currentStep,
      bpm: transportBpm,
      numerator: activeSignature.value.numerator,
      now: audioContext.currentTime,
      horizon: audioContext.currentTime + 0.1,
    })
    plan.events.forEach((event) => {
      scheduleTick(event.time, event.step)
      queueVisualStep(event.step, event.time)
    })
    nextNoteTime = plan.nextNoteTime
    currentStep = plan.currentStep
  }

  function stop() {
    if (schedulerTimer !== undefined) clearWorkerInterval(schedulerTimer)
    schedulerTimer = undefined
    visualTimers.forEach(window.clearTimeout)
    visualTimers = []
    activeStep.value = -1
  }

  function start(startStep = 0, initialDelay = 0.08) {
    stop()
    ensureAudio()
    transportBpm = quantizeTransportBpm(bpm.value)
    pendingBpm = null
    currentStep = startStep
    nextNoteTime = audioContext.currentTime + initialDelay
    schedulerTimer = setWorkerInterval(scheduler, 25)
    scheduler()
  }

  function queueTempoUpdate(nextBpm) {
    if (Number.isFinite(nextBpm) && nextBpm > 0) pendingBpm = quantizeTransportBpm(nextBpm)
  }

  function toggleSound() {
    muted.value = !muted.value
    if (!muted.value && isStable.value) ensureAudio()
  }

  onBeforeUnmount(() => {
    stop()
    audioContext?.close()
  })

  return { activeStep, muted, start, stop, queueTempoUpdate, toggleSound }
}
