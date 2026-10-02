import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCorrectedBpm, requiredTapsForLock } from '../src/tempo.js'

test('locks on the first beat of the third bar', () => {
  assert.equal(requiredTapsForLock(4), 9)
  assert.equal(requiredTapsForLock(3), 7)
  assert.equal(requiredTapsForLock(6), 13)
})

test('a running corrected BPM leaves the old tempo and converges on sustained new taps', () => {
  let timestamps = [0]
  let bpm = null

  for (let index = 0; index < 12; index += 1) {
    timestamps = [...timestamps, timestamps.at(-1) + 500].slice(-13)
    bpm = calculateCorrectedBpm(timestamps, bpm, true)
  }
  assert.ok(Math.abs(bpm - 120) < 0.001)

  for (let index = 0; index < 18; index += 1) {
    timestamps = [...timestamps, timestamps.at(-1) + 60000 / 90].slice(-13)
    bpm = calculateCorrectedBpm(timestamps, bpm, true)
  }

  assert.ok(Math.abs(bpm - 90) < 0.5, `expected approximately 90 BPM, received ${bpm}`)
})
