import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import type { EssentiaVector } from 'essentia.js/dist/essentia.js-core.es.js'

const essentia = new Essentia(EssentiaWASM)

const post = (message: unknown): void => {
  ;(self as unknown as { postMessage(m: unknown): void }).postMessage(message)
}

function vectorToArray(vector: EssentiaVector): number[] {
  const values = essentia.vectorToArray(vector)
  vector?.delete?.()
  return Array.from(values)
}

self.onmessage = ({ data }: MessageEvent<{ id: number, samples: ArrayBuffer }>) => {
  const { id, samples } = data
  let signal: EssentiaVector | undefined
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
    post({ id, result })
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : String(error) })
  } finally {
    signal?.delete?.()
  }
}
