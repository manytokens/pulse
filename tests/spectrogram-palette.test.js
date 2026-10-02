import assert from 'node:assert/strict'
import test from 'node:test'
import { createSpectrogramColorMap, normalizeFftSize, onsetIntensity, SPECTROGRAM_DEFAULT_SETTINGS } from '../src/spectrogram-palette.js'

test('maps intensity with a hard cutoff that keeps drum onsets prominent', () => {
  assert.equal(onsetIntensity(0.2, 0.34, 9.5), 0)
  assert.equal(onsetIntensity(0.34, 0.34, 9.5), 0)
  assert.ok(onsetIntensity(1, 0.34, 9.5) > 0.8)
  assert.equal(SPECTROGRAM_DEFAULT_SETTINGS.cutoff, 0.34)
  assert.equal(SPECTROGRAM_DEFAULT_SETTINGS.intensity, 9.5)
})

test('builds the 256-entry color map', () => {
  const map = createSpectrogramColorMap()
  assert.equal(map.length, 256)
  assert.deepEqual(map[0], [13, 8, 135], 'quiet content stays deep blue')
  const [red, green] = map[255]
  assert.ok(red > 220 && green > 190, 'onsets reach a bright yellow-ish tone')
  const dimmed = createSpectrogramColorMap(0.34, 9.5, 50)
  assert.ok(dimmed[255][0] < map[255][0], 'brightness dims the palette')
})

test('normalizes FFT size choices', () => {
  assert.equal(normalizeFftSize(256), 256)
  assert.equal(normalizeFftSize('4096'), 4096)
  assert.equal(normalizeFftSize(300), 1024)
})
