import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyEssentiaConfidence } from '../src/essentia-confidence.js'

test('classifies Essentia confidence using its official thresholds', () => {
  assert.equal(classifyEssentiaConfidence(0.99).key, 'confidenceVeryLow')
  assert.equal(classifyEssentiaConfidence(1).key, 'confidenceLow')
  assert.equal(classifyEssentiaConfidence(1.5).key, 'confidenceLow')
  assert.equal(classifyEssentiaConfidence(1.51).key, 'confidenceGood')
  assert.equal(classifyEssentiaConfidence(3.5).key, 'confidenceGood')
  assert.equal(classifyEssentiaConfidence(3.51).key, 'confidenceExcellent')
})
