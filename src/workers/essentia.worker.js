import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'

const essentia = new Essentia(EssentiaWASM)

function vectorToArray(vector) {
  const values = essentia.vectorToArray(vector)
  vector?.delete?.()
  return Array.from(values)
}

self.onmessage = ({ data }) => {
  const { id, samples } = data
  let signal
  try {
    signal = essentia.arrayToVector(new Float32Array(samples))
    const output = essentia.RhythmExtractor2013(signal, 240, 'multifeature', 40)
    if (!Number.isFinite(output.bpm) || output.bpm <= 0) throw new Error('Essentia could not detect a stable tempo')
    const result = {
      bpm: output.bpm,
      confidence: output.confidence,
      ticks: vectorToArray(output.ticks),
      estimates: vectorToArray(output.estimates),
      bpmIntervals: vectorToArray(output.bpmIntervals),
    }
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    signal?.delete?.()
  }
}
