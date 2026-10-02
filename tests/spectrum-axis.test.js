import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFrequencyTicks, formatFrequency, frequencyToPosition, positionToFrequency } from '../src/spectrum-axis.js'

test('maps frequencies to positions across supported scales', () => {
  const linear = { scale: 'linear', minFrequency: 0, maxFrequency: 10000 }
  assert.equal(frequencyToPosition(0, linear), 0)
  assert.equal(frequencyToPosition(5000, linear), 0.5)
  assert.equal(frequencyToPosition(10000, linear), 1)
  assert.equal(frequencyToPosition(20000, linear), 1)

  const mel = { scale: 'mel', minFrequency: 0, maxFrequency: 10000 }
  assert.ok(frequencyToPosition(1000, mel) > frequencyToPosition(1000, linear))

  const unknown = { scale: 'nope', minFrequency: 0, maxFrequency: 10000 }
  assert.equal(frequencyToPosition(5000, unknown), 0.5)
})

test('position and frequency mappings are inverse of each other', () => {
  for (const scale of ['linear', 'mel', 'erb']) {
    const options = { scale, minFrequency: 125, maxFrequency: 8000 }
    for (const frequency of [125, 440, 1000, 4000, 8000]) {
      const roundTrip = positionToFrequency(frequencyToPosition(frequency, options), options)
      assert.ok(Math.abs(roundTrip - frequency) < 0.5, `${scale} round trip for ${frequency} gave ${roundTrip}`)
    }
  }
})

test('formats frequencies compactly', () => {
  assert.equal(formatFrequency(500), '500')
  assert.equal(formatFrequency(1000), '1k')
  assert.equal(formatFrequency(1500), '1.5k')
  assert.equal(formatFrequency(16000), '16k')
})

test('builds ordered ticks inside the requested range', () => {
  const ticks = buildFrequencyTicks({ scale: 'mel', minFrequency: 125, maxFrequency: 7000, maxTicks: 8 })
  assert.ok(ticks.length > 2)
  assert.ok(ticks.length <= 10)
  for (const tick of ticks) {
    assert.ok(tick.frequency >= 125 && tick.frequency <= 7000)
    assert.ok(tick.position >= 0 && tick.position <= 1)
    assert.equal(typeof tick.label, 'string')
  }
  for (let index = 1; index < ticks.length; index += 1) {
    assert.ok(ticks[index].position > ticks[index - 1].position)
  }
})
