import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSpectrogramHopSize, SPECTROGRAM_HOP_SIZES } from '../src/spectrogram-resolution.js'

test('accepts supported manual spectrogram resolutions and falls back safely', () => {
  assert.deepEqual(SPECTROGRAM_HOP_SIZES, [32, 64, 128, 256, 512])
  assert.equal(normalizeSpectrogramHopSize(32), 32)
  assert.equal(normalizeSpectrogramHopSize('64'), 64)
  assert.equal(normalizeSpectrogramHopSize(200), 32)
})
