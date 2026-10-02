import assert from 'node:assert/strict'
import test from 'node:test'
import { planMetronomeWindow, quantizeTransportBpm, resolveTransportTempo } from '../src/metronome.js'

test('uses the displayed integer BPM for the transport', () => {
  assert.equal(quantizeTransportBpm(128.49), 128)
  assert.equal(quantizeTransportBpm(128.51), 129)
  assert.equal(60 / quantizeTransportBpm(128.49), 0.46875)
})

test('uses the new BPM after two warm-up bars and keeps the third-bar phase', () => {
  const numerator = 4
  const oldBpm = 120
  const newBpm = 90

  const warmup = planMetronomeWindow({
    nextNoteTime: 0,
    currentStep: 0,
    bpm: oldBpm,
    numerator,
    horizon: 2 * numerator * (60 / oldBpm),
  })
  assert.equal(warmup.events.length, 2 * numerator)

  const thirdBarStart = warmup.nextNoteTime
  const tempo = resolveTransportTempo({ currentStep: 0, transportBpm: oldBpm, pendingBpm: newBpm })

  const changed = planMetronomeWindow({
    nextNoteTime: thirdBarStart,
    currentStep: 0,
    bpm: tempo.transportBpm,
    numerator,
    horizon: thirdBarStart + 4 * (60 / newBpm) + 0.001,
  })
  const normalizedMs = changed.events.map((event) => event.time)
    .map((time) => Math.round((time - thirdBarStart) * 1000))

  assert.deepEqual(normalizedMs, [0, 667, 1333, 2000, 2667])
  assert.deepEqual(changed.events.map((event) => event.step), [0, 1, 2, 3, 0])
})

test('skips expired beats instead of replaying them after a scheduler stall', () => {
  const plan = planMetronomeWindow({
    nextNoteTime: 0,
    currentStep: 0,
    bpm: 120,
    numerator: 4,
    now: 2.2,
    horizon: 2.7,
  })

  assert.deepEqual(plan.events, [{ time: 2.5, step: 1 }])
})

test('holds a pending tempo until the next downbeat', () => {
  assert.deepEqual(
    resolveTransportTempo({ currentStep: 2, transportBpm: 120, pendingBpm: 90 }),
    { transportBpm: 120, pendingBpm: 90 },
  )
  assert.deepEqual(
    resolveTransportTempo({ currentStep: 0, transportBpm: 120, pendingBpm: 90 }),
    { transportBpm: 90, pendingBpm: null },
  )
})

test('keeps 128 BPM at exact spacing during a 30-minute transport run', () => {
  let nextNoteTime = 0.025
  let currentStep = 0
  let now = 0
  let wakeup = 0
  const events = []

  while (now < 1800) {
    const plan = planMetronomeWindow({
      nextNoteTime,
      currentStep,
      bpm: 128,
      numerator: 4,
      now,
      horizon: now + 0.1,
    })
    events.push(...plan.events)
    nextNoteTime = plan.nextNoteTime
    currentStep = plan.currentStep
    now += wakeup++ % 2 === 0 ? 0.018 : 0.031
  }

  assert.ok(events.length > 3500)
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(Math.abs(events[index].time - events[index - 1].time - 0.46875) < 1e-9)
  }
})
