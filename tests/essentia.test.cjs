const assert = require('node:assert/strict')
const test = require('node:test')
const EssentiaPackage = require('essentia.js')

test('Essentia detects a synthetic 120 BPM click track', () => {
  const essentia = new EssentiaPackage.Essentia(EssentiaPackage.EssentiaWASM)
  const sampleRate = 44100
  const duration = 12
  const samples = new Float32Array(sampleRate * duration)

  for (let time = 0; time < duration; time += 0.5) {
    const start = Math.floor(time * sampleRate)
    for (let index = 0; index < 900 && start + index < samples.length; index += 1) {
      samples[start + index] += Math.sin(2 * Math.PI * 1000 * index / sampleRate) * Math.exp(-index / 140)
    }
  }

  const signal = essentia.arrayToVector(samples)
  const output = essentia.RhythmExtractor2013(signal, 240, 'multifeature', 40)
  assert.ok(Math.abs(output.bpm - 120) < 1, `expected 120 BPM, received ${output.bpm}`)
  assert.ok(output.ticks.size() >= 20)

  output.ticks.delete()
  output.estimates.delete()
  output.bpmIntervals.delete()
  signal.delete()
})
